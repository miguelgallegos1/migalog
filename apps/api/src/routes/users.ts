import { Hono } from "hono";
import { z } from "zod";
import { ROLES, isClientRole, phoneSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import { param } from "../lib/http.js";
import { isForeignKeyViolation } from "../lib/db-helpers.js";

export const userRoutes = new Hono<{ Variables: AppVariables }>();
userRoutes.use("*", requireAuth, requireTenant());

/**
 * admin_empresa/coordinador/super_admin ven todos los usuarios del tenant (nivel 1 y
 * todas las empresas cliente). Un rol cliente_* solo ve los usuarios de SU PROPIA empresa
 * cliente - no le corresponde ver el resto del tenant ni otras empresas cliente.
 */
userRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const clientId = c.get("clientId");

  const scope = isClientRole(role) && clientId ? and(eq(users.tenantId, tenantId), eq(users.clientId, clientId)) : eq(users.tenantId, tenantId);

  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, phone: users.phone, active: users.active })
    .from(users)
    .where(scope);
  return c.json(rows);
});

/**
 * Editar/activar/eliminar: mismo árbol de atribuciones que invitar (auth.ts) - nadie
 * gestiona el escalón del otro.
 * - cliente_admin solo toca usuarios de SU propia empresa cliente, y no puede ascenderlos
 *   a un rol de nivel 1.
 * - admin_empresa solo toca usuarios que YA son de nivel 1 (coordinador/conductor) y no
 *   puede convertirlos en un rol cliente_* - esos son del cliente_admin de esa empresa.
 */
async function authorizeTarget(c: { get: (k: "role" | "tenantId" | "clientId") => unknown }, targetId: string, newRole?: string) {
  const actorRole = c.get("role") as string;
  const tenantId = c.get("tenantId") as string;
  const [target] = await db.select().from(users).where(and(eq(users.id, targetId), eq(users.tenantId, tenantId)));
  if (!target) return null;

  if (actorRole === "cliente_admin") {
    const actorClientId = c.get("clientId") as string;
    if (target.clientId !== actorClientId) return null;
    if (newRole && !isClientRole(newRole as (typeof ROLES)[number])) return null;
  } else if (actorRole === "admin_empresa") {
    if (target.role !== "coordinador" && target.role !== "conductor") return null;
    if (newRole && newRole !== "coordinador" && newRole !== "conductor") return null;
  } else {
    return null;
  }
  return target;
}

/**
 * Empresa (proveedora o cliente) sin ningún admin queda huérfana - nadie podría volver a
 * gestionarla desde la app (solo super_admin, a mano). Se usa antes de degradar el rol,
 * desactivar o eliminar a un admin_empresa/cliente_admin, para bloquearlo si es el último.
 */
async function isSoleCompanyAdmin(target: { role: string; tenantId: string | null; clientId: string | null }): Promise<boolean> {
  if (target.role === "admin_empresa" && target.tenantId) {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, target.tenantId), eq(users.role, "admin_empresa")));
    return admins.length <= 1;
  }
  if (target.role === "cliente_admin" && target.clientId) {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.clientId, target.clientId), eq(users.role, "cliente_admin")));
    return admins.length <= 1;
  }
  return false;
}
const SOLE_ADMIN_ERROR = "Es el único admin de su empresa - no se puede quedar sin ninguno";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  phone: phoneSchema.optional(),
});

userRoutes.patch("/:id", requireRole("admin_empresa", "cliente_admin"), async (c) => {
  const id = param(c, "id");
  const body = updateUserSchema.parse(await c.req.json());
  // conductor/cliente_conductor necesitan camión asignado y vigencia de licencia, que esta
  // edición genérica no pide - pasar a uno de esos roles solo se hace desde POST /drivers
  // (que crea el usuario Y el conductor juntos), nunca degradando/ascendiendo acá, o
  // quedaría un usuario con ese rol sin fila en "drivers".
  if (body.role === "conductor" || body.role === "cliente_conductor") {
    return c.json({ error: "Un conductor se da de alta/edita desde la pantalla de Conductores, no acá" }, 400);
  }
  const target = await authorizeTarget(c, id, body.role);
  if (!target) return c.json({ error: "No autorizado para editar este usuario" }, 403);
  if (body.role && body.role !== target.role && (await isSoleCompanyAdmin(target))) {
    return c.json({ error: SOLE_ADMIN_ERROR }, 409);
  }

  const [row] = await db
    .update(users)
    .set(body)
    .where(eq(users.id, id))
    .returning({ id: users.id, name: users.name, role: users.role, phone: users.phone, active: users.active });
  return c.json(row);
});

userRoutes.patch("/:id/active", requireRole("admin_empresa", "cliente_admin"), async (c) => {
  const id = param(c, "id");
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const target = await authorizeTarget(c, id);
  if (!target) return c.json({ error: "No autorizado para editar este usuario" }, 403);
  if (!active && (await isSoleCompanyAdmin(target))) {
    return c.json({ error: SOLE_ADMIN_ERROR }, 409);
  }

  const activeValues = { active };
  const [row] = await db
    .update(users)
    .set(activeValues)
    .where(eq(users.id, id))
    .returning({ id: users.id, name: users.name, role: users.role, phone: users.phone, active: users.active });
  return c.json(row);
});

userRoutes.delete("/:id", requireRole("admin_empresa", "cliente_admin"), async (c) => {
  const id = param(c, "id");
  const target = await authorizeTarget(c, id);
  if (!target) return c.json({ error: "No autorizado para eliminar este usuario" }, 403);
  if (await isSoleCompanyAdmin(target)) {
    return c.json({ error: SOLE_ADMIN_ERROR }, 409);
  }

  try {
    await db.delete(users).where(eq(users.id, id));
    return c.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return c.json({ error: "No se puede eliminar: el usuario ya tiene actividad asociada. Desactivalo en su lugar." }, 409);
    }
    throw err;
  }
});
