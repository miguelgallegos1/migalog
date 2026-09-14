import { Hono } from "hono";
import { z } from "zod";
import {
  createRouteRequestSchema,
  confirmRouteSchema,
  reportIncidentSchema,
  locationPingSchema,
} from "@migalog/shared";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";
import * as routeService from "../lib/route-service.js";
import { param } from "../lib/http.js";
import { db } from "../db/client.js";
import { routeStops } from "../db/schema.js";
import { eq } from "drizzle-orm";

export const routeRoutes = new Hono<{ Variables: AppVariables }>();
routeRoutes.use("*", requireAuth, requireTenant());

function actorFromContext(c: { get: (k: "userId") => string }) {
  return { type: "human" as const, userId: c.get("userId") };
}

routeRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const history = c.req.query("history") === "true";
  const rows = history ? await routeService.listRouteHistory(tenantId) : await routeService.listActiveRoutes(tenantId);

  const withDelay = await Promise.all(
    rows.map(async (route) => {
      const stops = await db.select().from(routeStops).where(eq(routeStops.routeId, route.id));
      return { ...route, delayed: routeService.isRouteDelayed(stops) };
    })
  );
  return c.json(withDelay.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
});

routeRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const data = await routeService.getRouteWithStops(tenantId, param(c, "id"));
  return c.json({ ...data, delayed: routeService.isRouteDelayed(data.stops) });
});

routeRoutes.post("/", requireRole("cliente_proveedor", "admin_empresa", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = createRouteRequestSchema.parse(await c.req.json());
  const result = await routeService.createRouteRequest(tenantId, body);
  return c.json(result, 201);
});

routeRoutes.post("/:id/approve", requireRole("admin_empresa", "dispatcher", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const route = await routeService.approveRoute(tenantId, param(c, "id"), actorFromContext(c));
  return c.json(route);
});

routeRoutes.post("/:id/reject", requireRole("admin_empresa", "dispatcher", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { reason } = z.object({ reason: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
  const route = await routeService.rejectRoute(tenantId, param(c, "id"), actorFromContext(c), reason);
  return c.json(route);
});

routeRoutes.post("/:id/confirm", requireRole("admin_empresa", "dispatcher", "super_admin"), async (c) => {
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
