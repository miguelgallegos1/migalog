import { Hono } from "hono";
import { z } from "zod";
import { createRouteTemplateSchema, approveRouteTemplateSchema, isClientRole, type CreateRouteTemplateInput } from "@migalog/shared";
import { db } from "../db/client.js";
import { routeTemplates, routeTemplateStops, sites } from "../db/schema.js";
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import { param } from "../lib/http.js";

const MANAGE_ROLES = ["admin_empresa", "coordinador", "super_admin"] as const;

/**
 * Catálogo de rutas frecuentes (tarifario) de la empresa proveedora.
 * - Nace SIEMPRE del lado del cliente (cliente_admin/cliente_coordinador/cliente_solicitante
 *   la proponen cuando la ruta que necesitan no está en la lista): queda "pendiente" hasta
 *   que la empresa proveedora la revise, fije el precio acordado y la apruebe (o la
 *   rechace). admin_empresa/coordinador ya no crean entradas directo - solo aprueban o
 *   rechazan lo que el cliente propone (es una conciliación entre las dos partes, no algo
 *   que la proveedora arma sola). Recién aprobada aparece en el selector de nuevas solicitudes.
 * - Origen/paradas/destino/sitio de facturación se eligen de la tabla "sites" (ver sites.ts).
 */
export const routeTemplateRoutes = new Hono<{ Variables: AppVariables }>();
routeTemplateRoutes.use("*", requireAuth, requireTenant());

/** Adjunta los sitios (billing/origen/destino/paradas) resueltos a cada fila, para no hacer otro viaje desde el front. */
async function attachSites(tenantId: string, rows: (typeof routeTemplates.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const siteIds = new Set<string>();
  rows.forEach((r) => {
    siteIds.add(r.billingSiteId);
    siteIds.add(r.originSiteId);
    siteIds.add(r.destinationSiteId);
  });
  const allSites = await db.select().from(sites).where(and(eq(sites.tenantId, tenantId), inArray(sites.id, [...siteIds])));
  const siteById = new Map(allSites.map((s) => [s.id, s]));

  const stopsRows = await db
    .select({
      routeTemplateId: routeTemplateStops.routeTemplateId,
      siteId: routeTemplateStops.siteId,
      sequenceOrder: routeTemplateStops.sequenceOrder,
      price: routeTemplateStops.price,
    })
    .from(routeTemplateStops)
    .where(inArray(routeTemplateStops.routeTemplateId, rows.map((r) => r.id)))
    .orderBy(asc(routeTemplateStops.sequenceOrder));
  const stopSiteIds = new Set(stopsRows.map((s) => s.siteId));
  // Filtro por tenantId también acá (no solo en "allSites" arriba): aunque hoy solo llegan
  // ids ya validados al crear/corregir la propuesta, sin este filtro no hay defensa en
  // profundidad si ese invariante se rompe en algún otro punto de entrada.
  const stopSites = stopSiteIds.size > 0 ? await db.select().from(sites).where(and(eq(sites.tenantId, tenantId), inArray(sites.id, [...stopSiteIds]))) : [];
  const stopSiteById = new Map(stopSites.map((s) => [s.id, s]));

  return rows.map((r) => ({
    ...r,
    billingSite: siteById.get(r.billingSiteId) ?? null,
    originSite: siteById.get(r.originSiteId) ?? null,
    destinationSite: siteById.get(r.destinationSiteId) ?? null,
    stops: stopsRows
      .filter((s) => s.routeTemplateId === r.id)
      .map((s) => ({ siteId: s.siteId, price: s.price, site: stopSiteById.get(s.siteId) ?? null })),
  }));
}

/**
 * Origen/paradas/destino no pueden repetir un sitio (evita rutas sin sentido como
 * "Cayambe-Cayambe"). El sitio de facturación queda afuera - ese sí puede coincidir.
 * Se compara por NOMBRE, no por id: puede haber dos registros de sitio distintos con el
 * mismo nombre, y eso sigue siendo "el mismo lugar" para el itinerario.
 */
function hasRepeatedItinerarySite(
  body: { originSiteId: string; destinationSiteId: string; stops: { siteId: string }[] },
  siteById: Map<string, { name: string }>
): boolean {
  const itinerary = [body.originSiteId, ...body.stops.map((s) => s.siteId), body.destinationSiteId];
  const names = itinerary.map((id) => siteById.get(id)?.name ?? id);
  return new Set(names).size !== names.length;
}

type ItineraryValidation =
  | { ok: true; siteById: Map<string, typeof sites.$inferSelect>; name: string }
  | { ok: false; error: string; status: 400 | 409 };

/**
 * Valida el itinerario propuesto (sitios existen/son de la empresa, sin repetidos) y arma el
 * nombre + chequea duplicados - la misma secuencia que hacía falta tanto al crear una
 * propuesta nueva (POST /) como al corregir una rechazada (POST /:id/resubmit), antes
 * copiada casi textual en los dos lugares. `excludeId` es la propia propuesta al corregir
 * (para no chocar consigo misma en el chequeo de duplicados).
 */
async function validateItinerary(tenantId: string, clientId: string, body: CreateRouteTemplateInput, excludeId?: string): Promise<ItineraryValidation> {
  const citedIds = [body.billingSiteId, body.originSiteId, body.destinationSiteId, ...body.stops.map((s) => s.siteId)];
  const foundSites = await db.select().from(sites).where(and(eq(sites.tenantId, tenantId), eq(sites.clientId, clientId), inArray(sites.id, citedIds)));
  const siteById = new Map(foundSites.map((s) => [s.id, s]));
  if (foundSites.length !== new Set(citedIds).size) {
    return { ok: false, error: "Uno o más sitios no existen o no pertenecen a tu empresa", status: 400 };
  }
  if (hasRepeatedItinerarySite(body, siteById)) {
    return { ok: false, error: "Origen, paradas y destino no pueden repetir el mismo sitio", status: 400 };
  }

  const name = [siteById.get(body.originSiteId)!.name, ...body.stops.map((s) => siteById.get(s.siteId)!.name), siteById.get(body.destinationSiteId)!.name].join("-");

  const duplicateConditions = [
    eq(routeTemplates.tenantId, tenantId),
    eq(routeTemplates.name, name),
    or(eq(routeTemplates.status, "pendiente"), eq(routeTemplates.status, "aprobada")),
  ];
  if (excludeId) duplicateConditions.push(ne(routeTemplates.id, excludeId));
  const [duplicate] = await db.select({ id: routeTemplates.id }).from(routeTemplates).where(and(...duplicateConditions));
  if (duplicate) {
    return { ok: false, error: `Ya existe esta ruta en el catálogo (${name}) - está pendiente o ya aprobada`, status: 409 };
  }

  return { ok: true, siteById, name };
}

/**
 * Por defecto solo las aprobadas (lo que necesita el selector). ?status=pendiente para la
 * bandeja de revisión (nivel 1) o para que el cliente vea el estado de lo que propuso -
 * pero un rol cliente_* solo ve lo pendiente/rechazado de SU PROPIA empresa, nunca lo de
 * otra empresa cliente del mismo tenant.
 */
routeTemplateRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const status = c.req.query("status") ?? "aprobada";
  const conditions = [eq(routeTemplates.tenantId, tenantId), eq(routeTemplates.status, status as "pendiente" | "aprobada" | "rechazada")];
  if (isClientRole(role) && status !== "aprobada") {
    conditions.push(eq(routeTemplates.proposedByClientId, c.get("clientId") as string));
  }
  // Una ruta desactivada ya no se ofrece para nuevas solicitudes ni se le muestra a la
  // empresa cliente - solo quien gestiona el catálogo (nivel 1) la sigue viendo, para poder
  // reactivarla.
  const canManage = (MANAGE_ROLES as readonly string[]).includes(role);
  if (!canManage) conditions.push(eq(routeTemplates.active, true));
  const rows = await db
    .select()
    .from(routeTemplates)
    .where(and(...conditions));
  return c.json(await attachSites(tenantId, rows));
});

routeTemplateRoutes.post(
  "/",
  requireRole("cliente_admin", "cliente_coordinador", "cliente_solicitante"),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const clientId = c.get("clientId") as string;
    const body = createRouteTemplateSchema.parse(await c.req.json());

    // Todos los sitios citados deben existir, ser del tenant, y ser de la MISMA empresa
    // cliente que propone (no se puede armar una ruta con sitios de otra empresa) - además
    // arma el nombre y descarta duplicados (ver validateItinerary()).
    const validation = await validateItinerary(tenantId, clientId, body);
    if (!validation.ok) return c.json({ error: validation.error }, validation.status);
    const { name } = validation;

    const newTemplateValues = {
      tenantId,
      name,
      effectiveDate: body.effectiveDate,
      billingSiteId: body.billingSiteId,
      originSiteId: body.originSiteId,
      destinationSiteId: body.destinationSiteId,
      price: body.price,
      estimatedMinutes: body.estimatedMinutes,
      distanceKm: body.distanceKm,
      status: "pendiente" as const,
      proposedByClientId: clientId,
    };
    const [row] = await db.insert(routeTemplates).values(newTemplateValues).returning();

    if (body.stops.length > 0) {
      await db.insert(routeTemplateStops).values(body.stops.map((s, i) => ({ routeTemplateId: row!.id, siteId: s.siteId, price: s.price, sequenceOrder: i })));
    }

    const [enriched] = await attachSites(tenantId, [row!]);
    return c.json(enriched, 201);
  }
);

/**
 * Corregir y reenviar una propuesta RECHAZADA: solo quien la propuso, y solo si sigue
 * rechazada (no se puede "corregir" una ya aprobada ni una pendiente). Reescribe el mismo
 * registro (no crea uno nuevo) y la vuelve a dejar "pendiente" para que el proveedor la
 * revise de nuevo.
 */
routeTemplateRoutes.post("/:id/resubmit", requireRole("cliente_admin", "cliente_coordinador", "cliente_solicitante"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const clientId = c.get("clientId") as string;
  const id = param(c, "id");
  const body = createRouteTemplateSchema.parse(await c.req.json());

  const [existing] = await db.select().from(routeTemplates).where(and(eq(routeTemplates.id, id), eq(routeTemplates.tenantId, tenantId)));
  if (!existing || existing.proposedByClientId !== clientId || existing.status !== "rechazada") {
    return c.json({ error: "Esta ruta no se puede corregir" }, 403);
  }

  const validation = await validateItinerary(tenantId, clientId, body, id);
  if (!validation.ok) return c.json({ error: validation.error }, validation.status);
  const { name } = validation;

  const resubmitValues = {
    name,
    effectiveDate: body.effectiveDate,
    billingSiteId: body.billingSiteId,
    originSiteId: body.originSiteId,
    destinationSiteId: body.destinationSiteId,
    price: body.price,
    estimatedMinutes: body.estimatedMinutes,
    distanceKm: body.distanceKm,
    status: "pendiente" as const,
  };
  await db.update(routeTemplates).set(resubmitValues).where(eq(routeTemplates.id, id));

  await db.delete(routeTemplateStops).where(eq(routeTemplateStops.routeTemplateId, id));
  if (body.stops.length > 0) {
    await db.insert(routeTemplateStops).values(body.stops.map((s, i) => ({ routeTemplateId: id, siteId: s.siteId, price: s.price, sequenceOrder: i })));
  }

  const [row] = await db.select().from(routeTemplates).where(eq(routeTemplates.id, id));
  const [enriched] = await attachSites(tenantId, [row!]);
  return c.json(enriched);
});

routeTemplateRoutes.post("/:id/approve", requireRole("admin_empresa", "coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = approveRouteTemplateSchema.parse(await c.req.json());
  const approveValues = { status: "aprobada" as const, price: body.price, estimatedMinutes: body.estimatedMinutes };
  const [row] = await db
    .update(routeTemplates)
    .set(approveValues)
    .where(and(eq(routeTemplates.id, param(c, "id")), eq(routeTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

routeTemplateRoutes.post("/:id/reject", requireRole("admin_empresa", "coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rejectValues = { status: "rechazada" as const };
  const [row] = await db
    .update(routeTemplates)
    .set(rejectValues)
    .where(and(eq(routeTemplates.id, param(c, "id")), eq(routeTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

/**
 * Gestión del catálogo ya aprobado (editar precio/tiempo/fecha, activar/desactivar,
 * eliminar): exclusiva de quien lo administra (nivel 1) - el origen/paradas/destino/sitio
 * de facturación quedan fijos, son lo que la empresa cliente pidió, no se reescriben acá.
 */
const updateRouteTemplateSchema = z.object({
  effectiveDate: z.string().min(1).optional(),
  price: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});

routeTemplateRoutes.patch("/:id", requireRole(...MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = updateRouteTemplateSchema.parse(await c.req.json());
  const [row] = await db
    .update(routeTemplates)
    .set(body)
    .where(and(eq(routeTemplates.id, param(c, "id")), eq(routeTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

routeTemplateRoutes.patch("/:id/active", requireRole(...MANAGE_ROLES), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const activeValues = { active };
  const [row] = await db
    .update(routeTemplates)
    .set(activeValues)
    .where(and(eq(routeTemplates.id, param(c, "id")), eq(routeTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

/**
 * Eliminar: quien gestiona el catálogo (nivel 1) puede borrar cualquier ítem del tenant
 * (típicamente uno ya aprobado que dejó de ofrecerse). La empresa cliente también puede
 * borrar, pero SOLO lo suyo y SOLO mientras no esté aprobado (pendiente/rechazada) - una
 * vez aprobada es del proveedor, la cliente ya no la controla.
 */
routeTemplateRoutes.delete("/:id", requireRole(...MANAGE_ROLES, "cliente_admin", "cliente_coordinador", "cliente_solicitante"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const id = param(c, "id");

  if (isClientRole(role)) {
    const clientId = c.get("clientId") as string;
    const [existing] = await db.select().from(routeTemplates).where(and(eq(routeTemplates.id, id), eq(routeTemplates.tenantId, tenantId)));
    if (!existing || existing.proposedByClientId !== clientId || existing.status === "aprobada") {
      return c.json({ error: "No autorizado para eliminar esta ruta" }, 403);
    }
  }

  // Las paradas son propias del ítem del catálogo (sin significado independiente) - se
  // borran junto con él, no hace falta desactivar en su lugar como con tenants/clients/sites.
  await db.delete(routeTemplateStops).where(eq(routeTemplateStops.routeTemplateId, id));
  const [deleted] = await db.delete(routeTemplates).where(and(eq(routeTemplates.id, id), eq(routeTemplates.tenantId, tenantId))).returning();
  if (!deleted) return c.json({ error: "No encontrada" }, 404);
  return c.json({ ok: true });
});
