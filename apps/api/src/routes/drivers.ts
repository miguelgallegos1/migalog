import { Hono } from "hono";
import { z } from "zod";
import { isClientRole, phoneSchema, base64PhotoSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { drivers, users, vehicles } from "../db/schema.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import { param } from "../lib/http.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { signSetupToken } from "../lib/jwt.js";

/**
 * Conductores: de la empresa proveedora (rol "conductor", clientId null) o propios de una
 * empresa cliente (rol "cliente_conductor", clientId seteado) - mismo criterio que
 * vehicles.ts. A diferencia del alta genérica de /auth/invite, acá se crea el usuario Y el
 * conductor en un solo paso (antes había que invitar el usuario aparte y después pegar su
 * id a mano acá).
 *
 * Cada conductor tiene un camión FIJO asignado (vehicleId) - al confirmar una ruta solo se
 * elige el conductor, nunca el camión por separado (ver route-service.ts confirmRoute). El
 * control no es por número de licencia sino por vigencia: pasada la fecha, ese conductor
 * (con su camión) deja de poder asignarse a una ruta hasta que alguien actualice la fecha.
 */
export const driverRoutes = new Hono<{ Variables: AppVariables }>();
driverRoutes.use("*", requireAuth, requireTenant());

const PROVIDER_MANAGE_ROLES = ["admin_empresa", "coordinador", "super_admin"] as const;
const CLIENT_MANAGE_ROLES = ["cliente_admin", "cliente_coordinador"] as const;

// Sin licensePhotoFront/Back: son base64 (hasta ~2.7MB cada una) - nadie necesita verlas de
// vuelta en una respuesta de lista/edición, alcanza con que estén en el GET puntual del
// conductor (si algún día se agrega uno) o ya las tiene localmente quien las subió.
const DRIVER_LIGHT_COLUMNS = {
  id: drivers.id,
  tenantId: drivers.tenantId,
  clientId: drivers.clientId,
  userId: drivers.userId,
  vehicleId: drivers.vehicleId,
  licenseExpiresAt: drivers.licenseExpiresAt,
  status: drivers.status,
  createdAt: drivers.createdAt,
};

/** Valida que el camión elegido exista y sea de la MISMA flota (misma empresa cliente, o la de la proveedora) que el conductor. */
async function findOwnVehicle(tenantId: string, clientId: string | null, vehicleId: string) {
  const conditions = [eq(vehicles.id, vehicleId), eq(vehicles.tenantId, tenantId)];
  conditions.push(clientId ? eq(vehicles.clientId, clientId) : isNull(vehicles.clientId));
  const [vehicle] = await db.select().from(vehicles).where(and(...conditions));
  return vehicle ?? null;
}

driverRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const conditions = [eq(drivers.tenantId, tenantId)];
  conditions.push(isClientRole(role) ? eq(drivers.clientId, c.get("clientId") as string) : isNull(drivers.clientId));
  const rows = await db.select(DRIVER_LIGHT_COLUMNS).from(drivers).where(and(...conditions));

  // Se arma de una el nombre/teléfono (de users) y la placa (de vehicles) para la tabla -
  // evita que el front tenga que pedir y cruzar tres listas aparte.
  const userIds = rows.map((r) => r.userId);
  const vehicleIds = rows.map((r) => r.vehicleId).filter((id): id is string => !!id);
  const [driverUsers, driverVehicles] = await Promise.all([
    userIds.length > 0 ? db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(inArray(users.id, userIds)) : [],
    vehicleIds.length > 0 ? db.select({ id: vehicles.id, plate: vehicles.plate }).from(vehicles).where(inArray(vehicles.id, vehicleIds)) : [],
  ]);
  // "as const" en la tupla a propósito: sin él, en el entorno de build de Vercel
  // TypeScript no infiere [id, fila] como tupla sino como array genérico, y new Map()
  // termina en Map<unknown, unknown> en vez de Map<string, fila> (no reproducible en local).
  const userById = new Map(driverUsers.map((u) => [u.id, u] as const));
  const vehicleById = new Map(driverVehicles.map((v) => [v.id, v] as const));

  const result = rows.map((r) => ({
    ...r,
    name: userById.get(r.userId)?.name ?? null,
    phone: userById.get(r.userId)?.phone ?? null,
    vehiclePlate: r.vehicleId ? (vehicleById.get(r.vehicleId)?.plate ?? null) : null,
  }));
  return c.json(result);
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: phoneSchema,
  // Nullable (no solo optional): al editar, mandar null es la única forma de desasignar el
  // camión - si fuera solo opcional, el front no tendría cómo distinguir "no tocar" de
  // "vaciar" (omitir la clave del JSON y mandar null se ven distinto para Drizzle, pero
  // `undefined` nunca llega a serializarse).
  vehicleId: z.string().uuid().nullable().optional(),
  licenseExpiresAt: z.string().min(1),
  licensePhotoFront: base64PhotoSchema.optional(),
  licensePhotoBack: base64PhotoSchema.optional(),
});
driverRoutes.post("/", requireRole(...PROVIDER_MANAGE_ROLES, ...CLIENT_MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const body = createSchema.parse(await c.req.json());
  const clientId = isClientRole(role) ? (c.get("clientId") as string) : null;

  if (body.vehicleId && !(await findOwnVehicle(tenantId, clientId, body.vehicleId))) {
    return c.json({ error: "Ese camión no existe o no pertenece a tu flota" }, 400);
  }

  // Variable, no literal directo en .values() (ver seed.ts para el detalle de por qué no se anota con typeof users.$inferInsert).
  const newUserValues = { tenantId, clientId, role: clientId ? ("cliente_conductor" as const) : ("conductor" as const), name: body.name, phone: body.phone };
  const user = firstOrThrow(
    await db.insert(users).values(newUserValues as any).returning()
  );
  const newDriverValues = {
    tenantId,
    clientId,
    userId: user.id,
    vehicleId: body.vehicleId,
    licenseExpiresAt: body.licenseExpiresAt,
    licensePhotoFront: body.licensePhotoFront,
    licensePhotoBack: body.licensePhotoBack,
  };
  const driver = firstOrThrow(await db.insert(drivers).values(newDriverValues as any).returning());

  const setupToken = await signSetupToken(user);
  return c.json({ user, driver, setupToken }, 201);
});

const updateSchema = createSchema.omit({ name: true, phone: true }).partial();
driverRoutes.patch("/:id", requireRole(...PROVIDER_MANAGE_ROLES, ...CLIENT_MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const id = param(c, "id");
  const body = updateSchema.parse(await c.req.json());
  const clientId = isClientRole(role) ? (c.get("clientId") as string) : null;

  if (body.vehicleId && !(await findOwnVehicle(tenantId, clientId, body.vehicleId))) {
    return c.json({ error: "Ese camión no existe o no pertenece a tu flota" }, 400);
  }

  const conditions = [eq(drivers.id, id), eq(drivers.tenantId, tenantId)];
  conditions.push(clientId ? eq(drivers.clientId, clientId) : isNull(drivers.clientId));
  const [row] = await db.update(drivers).set(body as any).where(and(...conditions)).returning(DRIVER_LIGHT_COLUMNS);
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});

const statusSchema = z.object({ status: z.enum(["activo", "inactivo"]) });
driverRoutes.patch("/:id/status", requireRole(...PROVIDER_MANAGE_ROLES, ...CLIENT_MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const { status } = statusSchema.parse(await c.req.json());
  const conditions = [eq(drivers.id, param(c, "id")), eq(drivers.tenantId, tenantId)];
  conditions.push(isClientRole(role) ? eq(drivers.clientId, c.get("clientId") as string) : isNull(drivers.clientId));
  const statusValues = { status };
  const [row] = await db.update(drivers).set(statusValues as any).where(and(...conditions)).returning(DRIVER_LIGHT_COLUMNS);
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});
