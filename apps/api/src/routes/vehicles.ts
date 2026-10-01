import { Hono } from "hono";
import { z } from "zod";
import { isClientRole } from "@migalog/shared";
import { db } from "../db/client.js";
import { vehicles } from "../db/schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import { param } from "../lib/http.js";

/**
 * Camiones: pueden ser de la flota de la empresa proveedora (clientId null, como siempre -
 * incluye tanto camiones propios como alquilados a un tercero, ver "ownership") o de la
 * flota PROPIA de una empresa cliente (clientId seteado) - esta última la gestiona esa
 * empresa cliente y la puede usar para despachar sus propias rutas sin depender de la
 * proveedora (ver routes.ts, POST /:id/confirm).
 */
export const vehicleRoutes = new Hono<{ Variables: AppVariables }>();
vehicleRoutes.use("*", requireAuth, requireTenant());

const PROVIDER_MANAGE_ROLES = ["admin_empresa", "coordinador", "super_admin"] as const;
const CLIENT_MANAGE_ROLES = ["cliente_admin", "cliente_coordinador"] as const;

vehicleRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const conditions = [eq(vehicles.tenantId, tenantId)];
  if (isClientRole(role)) {
    conditions.push(eq(vehicles.clientId, c.get("clientId") as string));
  } else {
    // Nivel 1 ve solo la flota de la proveedora, no la flota privada de ninguna empresa
    // cliente (aunque esté bajo su mismo tenant).
    conditions.push(isNull(vehicles.clientId));
  }
  const rows = await db.select().from(vehicles).where(and(...conditions));
  return c.json(rows);
});

const createSchema = z.object({
  plate: z.string().min(3),
  brandModel: z.string().min(1).optional(),
  capacityM3: z.number().positive().optional(),
  ownership: z.enum(["propio", "alquilado"]).default("propio"),
  // Solo tiene sentido cuando ownership es "alquilado" - a quién se le alquila. Es texto
  // libre (no una empresa del sistema): quien alquila no necesariamente usa MigaLog.
  ownerCompany: z.string().min(1).optional(),
});
vehicleRoutes.post("/", requireRole(...PROVIDER_MANAGE_ROLES, ...CLIENT_MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const body = createSchema.parse(await c.req.json());
  if (body.ownership === "alquilado" && !body.ownerCompany) {
    return c.json({ error: "Indicá a qué empresa se le alquila el camión" }, 400);
  }
  const clientId = isClientRole(role) ? (c.get("clientId") as string) : null;
  const [row] = await db.insert(vehicles).values({ tenantId, clientId, ...body }).returning();
  return c.json(row, 201);
});

const statusSchema = z.object({ status: z.enum(["activo", "mantenimiento", "inactivo"]) });
vehicleRoutes.patch("/:id/status", requireRole(...PROVIDER_MANAGE_ROLES, ...CLIENT_MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const { status } = statusSchema.parse(await c.req.json());
  const conditions = [eq(vehicles.id, param(c, "id")), eq(vehicles.tenantId, tenantId)];
  conditions.push(isClientRole(role) ? eq(vehicles.clientId, c.get("clientId") as string) : isNull(vehicles.clientId));
  const [row] = await db.update(vehicles).set({ status }).where(and(...conditions)).returning();
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});
