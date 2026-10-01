import { Hono } from "hono";
import { z } from "zod";
import { createSiteSchema, isClientRole } from "@migalog/shared";
import { db } from "../db/client.js";
import { sites } from "../db/schema.js";
import { and, eq, ne } from "drizzle-orm";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import { param } from "../lib/http.js";
import { isForeignKeyViolation } from "../lib/db-helpers.js";

/**
 * Sitios (lugares + empresa a la que pertenecen, para facturación): los arma la empresa
 * cliente y después los reutiliza al crear ítems del catálogo de rutas (origen, paradas,
 * destino, sitio de facturación) en vez de tipear dirección/coordenadas cada vez.
 */
export const siteRoutes = new Hono<{ Variables: AppVariables }>();
siteRoutes.use("*", requireAuth, requireTenant());

const MANAGE_ROLES = ["cliente_admin", "cliente_coordinador", "cliente_solicitante"] as const;

siteRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const conditions = [eq(sites.tenantId, tenantId)];
  // Un rol cliente_* solo ve los sitios de su propia empresa; nivel 1 ve todos los del tenant
  // (útil para revisar propuestas del catálogo, que citan sitios de la empresa que las propone).
  if (isClientRole(role)) conditions.push(eq(sites.clientId, c.get("clientId") as string));
  const rows = await db.select().from(sites).where(and(...conditions));
  return c.json(rows);
});

siteRoutes.post("/", requireRole(...MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const clientId = c.get("clientId") as string;
  const body = createSiteSchema.parse(await c.req.json());
  // Dos sitios con el mismo nombre en la misma empresa confunden el catálogo de rutas
  // (¿cuál "CAYAMBE" es?) y permiten armar itinerarios sin sentido tipo origen=destino
  // usando registros distintos - se bloquea acá, en el alta.
  const [dup] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.clientId, clientId), eq(sites.name, body.name)));
  if (dup) return c.json({ error: `Ya existe un sitio llamado "${body.name}"` }, 409);
  const [row] = await db.insert(sites).values({ tenantId, clientId, ...body }).returning();
  return c.json(row, 201);
});

const updateSiteSchema = createSiteSchema.partial();

siteRoutes.patch("/:id", requireRole(...MANAGE_ROLES), async (c) => {
  const clientId = c.get("clientId") as string;
  const id = param(c, "id");
  const body = updateSiteSchema.parse(await c.req.json());
  if (body.name) {
    const [dup] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.clientId, clientId), eq(sites.name, body.name), ne(sites.id, id)));
    if (dup) return c.json({ error: `Ya existe un sitio llamado "${body.name}"` }, 409);
  }
  const [row] = await db
    .update(sites)
    .set(body)
    .where(and(eq(sites.id, id), eq(sites.clientId, clientId)))
    .returning();
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});

siteRoutes.patch("/:id/active", requireRole(...MANAGE_ROLES), async (c) => {
  const clientId = c.get("clientId") as string;
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const [row] = await db
    .update(sites)
    .set({ active })
    .where(and(eq(sites.id, param(c, "id")), eq(sites.clientId, clientId)))
    .returning();
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});

siteRoutes.delete("/:id", requireRole(...MANAGE_ROLES), async (c) => {
  const clientId = c.get("clientId") as string;
  try {
    const [deleted] = await db
      .delete(sites)
      .where(and(eq(sites.id, param(c, "id")), eq(sites.clientId, clientId)))
      .returning();
    if (!deleted) return c.json({ error: "No encontrado" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return c.json({ error: "No se puede eliminar: el sitio ya está usado en el catálogo de rutas. Desactivalo en su lugar." }, 409);
    }
    throw err;
  }
});
