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
import { clients, routeStops } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

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

  const withDelay = await Promise.all(
    visible.map(async (route) => {
      const stops = await db.select().from(routeStops).where(eq(routeStops.routeId, route.id));
      return { ...route, delayed: routeService.isRouteDelayed(stops) };
    })
  );
  return c.json(withDelay.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
});

routeRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const data = await routeService.getRouteWithStops(tenantId, param(c, "id"));
  const ownClientId = scopedToOwnClient(c);
  if (ownClientId && data.route.clientId !== ownClientId) return c.json({ error: "Ruta no encontrada" }, 404);
  return c.json({ ...data, delayed: routeService.isRouteDelayed(data.stops) });
});

routeRoutes.post(
  "/",
  requireRole("cliente_admin", "cliente_coordinador", "cliente_solicitante", "admin_empresa", "super_admin"),
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

routeRoutes.post("/:id/confirm", requireRole("admin_empresa", "coordinador", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { driverId, vehicleId } = confirmRouteSchema.parse(await c.req.json());
  const route = await routeService.confirmRoute(tenantId, param(c, "id"), driverId, vehicleId, actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/park", requireRole("conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const route = await routeService.parkRoute(tenantId, param(c, "id"), actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/depart", requireRole("conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const route = await routeService.departRoute(tenantId, param(c, "id"), actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/stops/:stopId/arrive", requireRole("conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const route = await routeService.arriveAtStop(tenantId, param(c, "id"), param(c, "stopId"), actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/cancel", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { reason } = z.object({ reason: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const route = await routeService.cancelRoute(tenantId, param(c, "id"), actorFromContext(c), reason);
  return c.json(route);
});

routeRoutes.post("/:id/location", requireRole("conductor"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { lat, lng } = locationPingSchema.parse(await c.req.json());
  const ping = await routeService.recordLocationPing(tenantId, param(c, "id"), lat, lng);
  return c.json(ping, 201);
});

routeRoutes.post("/:id/incidents", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { severity, description } = reportIncidentSchema.parse(await c.req.json());
  const incident = await routeService.reportIncident(tenantId, param(c, "id"), severity, description);
  return c.json(incident, 201);
});
