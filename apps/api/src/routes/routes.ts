import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  createRouteRequestSchema,
  confirmRouteSchema,
  reportIncidentSchema,
  locationPingSchema,
  isClientRole,
} from "@migalog/shared";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import * as routeService from "../lib/route-service.js";
import { param } from "../lib/http.js";
import { db } from "../db/client.js";
import { clients, routeStops, drivers } from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";

export const routeRoutes = new Hono<{ Variables: AppVariables }>();
routeRoutes.use("*", requireAuth, requireTenant());

function actorFromContext(c: { get: (k: "userId") => string }) {
  return { type: "human" as const, userId: c.get("userId") };
}

type AppContext = Context<{ Variables: AppVariables }>;

/**
 * Los roles cliente_* solo ven/actúan sobre las rutas de SU PROPIA empresa cliente, aunque
 * el tenant tenga varias. super_admin y los roles de nivel 1 ven todo el tenant (ya vienen
 * filtrados por tenantId desde requireTenant/route-service).
 */
function scopedToOwnClient(c: AppContext): string | null {
  const role = c.get("role");
  if (!isClientRole(role)) return null;
  return c.get("clientId");
}

routeRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const history = c.req.query("history") === "true";
  const rows = history ? await routeService.listRouteHistory(tenantId) : await routeService.listActiveRoutes(tenantId);
  const ownClientId = scopedToOwnClient(c);
  const visible = ownClientId ? rows.filter((r) => r.clientId === ownClientId) : rows;

  // Antes era una consulta por ruta (N+1) - se trae todo de una sola vez y se agrupa en
  // memoria, mismo criterio que attachSites() en route-templates.ts.
  const allStops = visible.length > 0 ? await db.select().from(routeStops).where(inArray(routeStops.routeId, visible.map((r) => r.id))) : [];
  const stopsByRoute = new Map<string, typeof allStops>();
  for (const stop of allStops) {
    const list = stopsByRoute.get(stop.routeId);
    if (list) list.push(stop);
    else stopsByRoute.set(stop.routeId, [stop]);
  }
  const withDelay = visible.map((route) => ({ ...route, delayed: routeService.isRouteDelayed(stopsByRoute.get(route.id) ?? []) }));
  return c.json(withDelay.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
});

routeRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const data = await routeService.getRouteWithStops(tenantId, param(c, "id"));
  const ownClientId = scopedToOwnClient(c);
  if (ownClientId && data.route.clientId !== ownClientId) return c.json({ error: "Ruta no encontrada" }, 404);
  return c.json({ ...data, delayed: routeService.isRouteDelayed(data.stops) });
});

// Solo la empresa cliente solicita rutas (super_admin queda como override de plataforma) -
// admin_empresa/coordinador (nivel 1) no crean ni solicitan, entran recién en CONFIRMADO.
routeRoutes.post(
  "/",
  requireRole("cliente_admin", "cliente_coordinador", "cliente_solicitante", "super_admin"),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const role = c.get("role");
    const body = createRouteRequestSchema.parse(await c.req.json());

    // Un rol cliente_* siempre crea para SU PROPIA empresa - se ignora cualquier clientId
    // que venga en el body, para que no pueda crear en nombre de otra empresa cliente.
    let clientId = body.clientId;
    if (isClientRole(role)) {
      const ownClientId = c.get("clientId") as string | null;
      if (!ownClientId) return c.json({ error: "Falta contexto de empresa cliente" }, 400);
      clientId = ownClientId;
    } else {
      if (!clientId) return c.json({ error: "Falta indicar la empresa cliente (clientId)" }, 400);
      const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
      if (!client) return c.json({ error: "Empresa cliente no encontrada" }, 404);
    }

    const result = await routeService.createRouteRequest(tenantId, { ...body, clientId });
    return c.json(result, 201);
  }
);

/**
 * Aprobar/rechazar es una decisión de la empresa cliente (es su pedido): la puede tomar
 * cliente_admin/cliente_coordinador de la empresa dueña de la ruta, o super_admin como
 * override de plataforma. admin_empresa/coordinador (nivel 1) ya no aprueban - entran
 * recién en CONFIRMADO, que es cuando asignan camión/conductor.
 */
async function requireOwnRouteAsClient(c: AppContext, tenantId: string, routeId: string) {
  if (c.get("role") === "super_admin") return;
  const { route } = await routeService.getRouteWithStops(tenantId, routeId);
  if (route.clientId !== c.get("clientId")) {
    throw new routeService.RouteServiceError("No autorizado para actuar sobre esta ruta", 403);
  }
}

/**
 * Un conductor solo puede operar SU PROPIA ruta asignada (route.driverId), no cualquier ruta
 * del tenant - sin esto, cualquier cuenta con rol "conductor" podría marcar parqueado/salida/
 * llegada o mandar pings de GPS sobre la ruta de otro conductor.
 */
async function requireAssignedDriver(c: AppContext, tenantId: string, routeId: string) {
  const { route } = await routeService.getRouteWithStops(tenantId, routeId);
  const [driver] = await db.select({ id: drivers.id }).from(drivers).where(and(eq(drivers.tenantId, tenantId), eq(drivers.userId, c.get("userId") as string)));
  if (!driver || route.driverId !== driver.id) {
    throw new routeService.RouteServiceError("No autorizado: no sos el conductor asignado a esta ruta", 403);
  }
}

routeRoutes.post("/:id/approve", requireRole("cliente_admin", "cliente_coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireOwnRouteAsClient(c, tenantId, id);
  const route = await routeService.approveRoute(tenantId, id, actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/reject", requireRole("cliente_admin", "cliente_coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireOwnRouteAsClient(c, tenantId, id);
  const { reason } = z.object({ reason: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const route = await routeService.rejectRoute(tenantId, id, actorFromContext(c), reason);
  return c.json(route);
});

/**
 * Confirmar = asignar conductor (el camión sale de ese conductor, ver confirmRoute()). Lo
 * hace la proveedora con su propia flota (como siempre) O la empresa cliente dueña de la
 * ruta, cuando despacha con flota propia (camión + conductor propios, roles cliente_admin/
 * cliente_coordinador + cliente_conductor) - cada una solo puede elegir conductores de SU
 * propia flota, nunca de la otra.
 */
routeRoutes.post(
  "/:id/confirm",
  requireRole("admin_empresa", "coordinador", "super_admin", "cliente_admin", "cliente_coordinador"),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const id = param(c, "id");
    const role = c.get("role");
    const { driverId } = confirmRouteSchema.parse(await c.req.json());
    let scopeClientId: string | null = null;
    if (isClientRole(role)) {
      await requireOwnRouteAsClient(c, tenantId, id);
      scopeClientId = c.get("clientId") as string;
    }
    const route = await routeService.confirmRoute(tenantId, id, driverId, actorFromContext(c), scopeClientId);
    return c.json(route);
  }
);

routeRoutes.post("/:id/park", requireRole("conductor", "cliente_conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireAssignedDriver(c, tenantId, id);
  const route = await routeService.parkRoute(tenantId, id, actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/depart", requireRole("conductor", "cliente_conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireAssignedDriver(c, tenantId, id);
  const route = await routeService.departRoute(tenantId, id, actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/stops/:stopId/arrive", requireRole("conductor", "cliente_conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireAssignedDriver(c, tenantId, id);
  const route = await routeService.arriveAtStop(tenantId, id, param(c, "stopId"), actorFromContext(c));
  return c.json(route);
});

// Cancelar es decisión de la empresa cliente (es su pedido), igual que aprobar/rechazar -
// la empresa proveedora no cancela pedidos ajenos, solo los ejecuta.
routeRoutes.post("/:id/cancel", requireRole("cliente_admin", "cliente_coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireOwnRouteAsClient(c, tenantId, id);
  const { reason } = z.object({ reason: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const route = await routeService.cancelRoute(tenantId, id, actorFromContext(c), reason);
  return c.json(route);
});

routeRoutes.post("/:id/location", requireRole("conductor", "cliente_conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const id = param(c, "id");
  await requireAssignedDriver(c, tenantId, id);
  const { lat, lng } = locationPingSchema.parse(await c.req.json());
  const ping = await routeService.recordLocationPing(tenantId, id, lat, lng);
  return c.json(ping, 201);
});

/**
 * Reportar incidencia: el conductor asignado (mientras maneja) o quien gestiona la ruta -
 * la proveedora (nivel 1, siempre) o la empresa cliente dueña de esa ruta puntual.
 */
routeRoutes.post(
  "/:id/incidents",
  requireRole("conductor", "cliente_conductor", "admin_empresa", "coordinador", "super_admin", "cliente_admin", "cliente_coordinador"),
  async (c) => {
    const tenantId = c.get("tenantId") as string;
    const id = param(c, "id");
    const role = c.get("role");
    if (role === "conductor" || role === "cliente_conductor") await requireAssignedDriver(c, tenantId, id);
    else if (isClientRole(role)) await requireOwnRouteAsClient(c, tenantId, id);
    // admin_empresa/coordinador/super_admin: sin restricción adicional, ya tienen acceso a
    // todo el tenant como en el resto de los endpoints de gestión.
    const { severity, description, photo } = reportIncidentSchema.parse(await c.req.json());
    const incident = await routeService.reportIncident(tenantId, id, severity, description, photo);
    return c.json(incident, 201);
  }
);
