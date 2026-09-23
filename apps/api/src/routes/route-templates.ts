import { Hono } from "hono";
import { createRouteTemplateSchema, approveRouteTemplateSchema, isClientRole } from "@migalog/shared";
import { db } from "../db/client.js";
import { routeTemplates } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import { param } from "../lib/http.js";

/**
 * Catálogo de rutas frecuentes (tarifario) de la empresa proveedora.
 * - admin_empresa/coordinador/super_admin la crean directo, ya aprobada (es su tarifario).
 * - Un rol cliente_* la PROPONE cuando la ruta que necesita no está en la lista: queda
 *   "pendiente" hasta que la empresa proveedora la revise, fije el precio acordado y la
 *   apruebe (o la rechace). Recién ahí aparece en el selector de nuevas solicitudes.
 */
export const routeTemplateRoutes = new Hono<{ Variables: AppVariables }>();
routeTemplateRoutes.use("*", requireAuth, requireTenant());

/** Por defecto solo las aprobadas (lo que necesita el selector). ?status=pendiente para la bandeja de revisión. */
routeTemplateRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const status = c.req.query("status") ?? "aprobada";
  const rows = await db
    .select()
    .from(routeTemplates)
    .where(and(eq(routeTemplates.tenantId, tenantId), eq(routeTemplates.status, status as "pendiente" | "aprobada" | "rechazada")));
  return c.json(rows);
});

routeTemplateRoutes.post(
  "/",
  requireRole("admin_empresa", "coordinador", "super_admin", "cliente_admin", "cliente_coordinador", "cliente_solicitante"),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const role = c.get("role");
    const body = createRouteTemplateSchema.parse(await c.req.json());

    const isProposal = isClientRole(role);
    const [row] = await db
      .insert(routeTemplates)
      .values({
        tenantId,
        ...body,
        status: isProposal ? "pendiente" : "aprobada",
        proposedByClientId: isProposal ? (c.get("clientId") as string | null) : null,
      })
      .returning();
    return c.json(row, 201);
  }
);

routeTemplateRoutes.post("/:id/approve", requireRole("admin_empresa", "coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = approveRouteTemplateSchema.parse(await c.req.json());
  const [row] = await db
    .update(routeTemplates)
    .set({ status: "aprobada", price: body.price, estimatedMinutes: body.estimatedMinutes })
    .where(and(eq(routeTemplates.id, param(c, "id")), eq(routeTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

routeTemplateRoutes.post("/:id/reject", requireRole("admin_empresa", "coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const [row] = await db
    .update(routeTemplates)
    .set({ status: "rechazada" })
    .where(and(eq(routeTemplates.id, param(c, "id")), eq(routeTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});
