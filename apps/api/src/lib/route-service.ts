import { and, eq, ne, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { routes, routeStops, routeStatusHistory, routeIncidents, locationPings } from "../db/schema.js";
import { canTransition, TERMINAL_ROUTE_STATUSES, type RouteStatus, type ActorType } from "@migalog/shared";
import { generateRouteCode } from "./ids.js";
import { publishTenantEvent } from "./realtime.js";
import { firstOrThrow } from "./db-helpers.js";
import type { StopInput } from "@migalog/shared";

export type Actor = { type: ActorType; userId?: string };

export class RouteServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function requireRoute(tenantId: string, routeId: string) {
  const [route] = await db.select().from(routes).where(and(eq(routes.id, routeId), eq(routes.tenantId, tenantId)));
  if (!route) throw new RouteServiceError("Ruta no encontrada", 404);
  return route;
}

async function transition(
  tenantId: string,
  routeId: string,
  to: RouteStatus,
  actor: Actor,
  extra: Partial<typeof routes.$inferInsert> = {},
  note?: string
) {
  const route = await requireRoute(tenantId, routeId);
  if (!canTransition(route.status, to)) {
    throw new RouteServiceError(`No se puede pasar de ${route.status} a ${to}`);
  }

  const updated = firstOrThrow(
    await db
      .update(routes)
      .set({ status: to, updatedAt: new Date(), ...extra })
      .where(eq(routes.id, routeId))
      .returning()
  );

  await db.insert(routeStatusHistory).values({
    routeId,
    fromStatus: route.status,
    toStatus: to,
    actorType: actor.type,
    actorUserId: actor.userId,
    note,
  });

  await publishTenantEvent(tenantId, "route.status_changed", {
    routeId,
    code: updated.code,
    from: route.status,
    to,
    actorType: actor.type,
  });

  return updated;
}

export async function createRouteRequest(
  tenantId: string,
  input: { providerId: string; stops: StopInput[]; notes?: string }
) {
  const route = firstOrThrow(
    await db
      .insert(routes)
      .values({ tenantId, providerId: input.providerId, code: generateRouteCode(), notes: input.notes, status: "CREADO" })
      .returning()
  );

  const stopRows = await db
    .insert(routeStops)
    .values(
      input.stops.map((s, i) => ({
        routeId: route.id,
        sequenceOrder: i,
        type: s.type,
        label: s.label,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        plannedAt: s.plannedAt ? new Date(s.plannedAt) : undefined,
      }))
    )
    .returning();

  await db.insert(routeStatusHistory).values({
    routeId: route.id,
    fromStatus: null,
    toStatus: "CREADO",
    actorType: "human",
  });

  await publishTenantEvent(tenantId, "route.created", { routeId: route.id, code: route.code });
  return { route, stops: stopRows };
}

export async function listActiveRoutes(tenantId: string) {
  return db
    .select()
    .from(routes)
    .where(and(eq(routes.tenantId, tenantId), notInArray(routes.status, TERMINAL_ROUTE_STATUSES)))
    .orderBy(routes.createdAt);
}

export async function listRouteHistory(tenantId: string) {
  return db
    .select()
    .from(routes)
    .where(and(eq(routes.tenantId, tenantId)))
    .orderBy(routes.createdAt);
}

const DELAY_GRACE_MINUTES = 20;

/**
 * DEMORADO no es un estado de la máquina, es una bandera calculada: compara la hora
 * estimada de cada parada contra la hora real de llegada (o, si aún no llegó, contra
 * la hora actual) con un margen de gracia.
 */
export function isRouteDelayed(stops: Array<{ plannedAt: Date | null; arrivedAt: Date | null }>, now = new Date()): boolean {
  return stops.some((stop) => {
    if (!stop.plannedAt) return false;
    const reference = stop.arrivedAt ?? now;
    const diffMinutes = (reference.getTime() - stop.plannedAt.getTime()) / 60_000;
    return diffMinutes > DELAY_GRACE_MINUTES;
  });
}

export async function getRouteWithStops(tenantId: string, routeId: string) {
  const route = await requireRoute(tenantId, routeId);
  const stops = await db
    .select()
    .from(routeStops)
    .where(eq(routeStops.routeId, routeId))
    .orderBy(routeStops.sequenceOrder);
  return { route, stops };
}

export const approveRoute = (tenantId: string, routeId: string, actor: Actor, note?: string) =>
  transition(tenantId, routeId, "APROBADO", actor, {}, note);

export const rejectRoute = (tenantId: string, routeId: string, actor: Actor, note?: string) =>
  transition(tenantId, routeId, "RECHAZADO", actor, {}, note);

export const confirmRoute = (
  tenantId: string,
  routeId: string,
  driverId: string,
  vehicleId: string,
  actor: Actor
) => transition(tenantId, routeId, "CONFIRMADO", actor, { driverId, vehicleId });

/**
 * Marcar "parqueado" ES llegar al origen, así que de paso marcamos completada la primera
 * parada (type: "origen") - si no, el timeline le pediría al conductor un "marcar llegada"
 * aparte para un punto del que ya se está yendo, y encima el botón de la próxima parada
 * real no podría aparecer todavía (ver arriveAtStop: exige las paradas previas completas).
 */
export async function parkRoute(tenantId: string, routeId: string, actor: Actor) {
  const updated = await transition(tenantId, routeId, "PARQUEADO", actor);
  const { stops } = await getRouteWithStops(tenantId, routeId);
  const origin = stops.find((s) => s.type === "origen");
  if (origin && origin.status !== "completada") {
    await db.update(routeStops).set({ status: "completada", arrivedAt: new Date() }).where(eq(routeStops.id, origin.id));
  }
  return updated;
}

export const departRoute = (tenantId: string, routeId: string, actor: Actor) =>
  transition(tenantId, routeId, "EN_CURSO", actor);

export const cancelRoute = (tenantId: string, routeId: string, actor: Actor, note?: string) =>
  transition(tenantId, routeId, "CANCELADO", actor, {}, note);

/** El conductor marca que llegó a una parada, en orden. Si es la última (destino), termina la ruta. */
export async function arriveAtStop(tenantId: string, routeId: string, stopId: string, actor: Actor) {
  const { stops } = await getRouteWithStops(tenantId, routeId);
  const stop = stops.find((s) => s.id === stopId);
  if (!stop) throw new RouteServiceError("Parada no encontrada", 404);

  const previousStops = stops.filter((s) => s.sequenceOrder < stop.sequenceOrder);
  const pendingBefore = previousStops.some((s) => s.status !== "completada");
  if (pendingBefore) {
    throw new RouteServiceError("Hay paradas anteriores sin marcar - deben ir en orden");
  }

  await db
    .update(routeStops)
    .set({ status: "completada", arrivedAt: new Date() })
    .where(eq(routeStops.id, stopId));

  const isLast = stop.sequenceOrder === Math.max(...stops.map((s) => s.sequenceOrder));
  const updated = isLast
    ? await transition(tenantId, routeId, "TERMINADO", actor)
    : await transition(tenantId, routeId, "EN_PARADA", actor, { currentStopId: stopId });

  await publishTenantEvent(tenantId, "route.stop_arrived", {
    routeId,
    code: updated.code,
    stopId,
    stopLabel: stop.label,
    isLast,
  });

  return updated;
}

export async function recordLocationPing(tenantId: string, routeId: string, lat: number, lng: number) {
  await requireRoute(tenantId, routeId);
  const ping = firstOrThrow(await db.insert(locationPings).values({ routeId, lat, lng }).returning());
  await publishTenantEvent(tenantId, "route.location", { routeId, lat, lng, recordedAt: ping.recordedAt });
  return ping;
}

export async function reportIncident(
  tenantId: string,
  routeId: string,
  severity: "baja" | "media" | "alta",
  description: string
) {
  await requireRoute(tenantId, routeId);
  const incident = firstOrThrow(await db.insert(routeIncidents).values({ routeId, severity, description }).returning());
  await db.update(routes).set({ hasIncident: true }).where(eq(routes.id, routeId));
  await publishTenantEvent(tenantId, "route.incident", { routeId, severity, description });
  return incident;
}

/**
 * Consulta si un camión/conductor tiene disponibilidad: no deben tener otra ruta activa
 * (no terminal, distinta de la que se está evaluando) ya asignada. Es la pieza que usa el
 * agente de IA para decidir un cambio de horario sin tener que preguntarle a un humano.
 */
export async function checkAvailability(
  tenantId: string,
  driverId: string,
  vehicleId: string,
  excludeRouteId?: string
) {
  const driverBusy = await db
    .select()
    .from(routes)
    .where(
      and(
        eq(routes.tenantId, tenantId),
        eq(routes.driverId, driverId),
        notInArray(routes.status, TERMINAL_ROUTE_STATUSES),
        excludeRouteId ? ne(routes.id, excludeRouteId) : undefined
      )
    );
  const vehicleBusy = await db
    .select()
    .from(routes)
    .where(
      and(
        eq(routes.tenantId, tenantId),
        eq(routes.vehicleId, vehicleId),
        notInArray(routes.status, TERMINAL_ROUTE_STATUSES),
        excludeRouteId ? ne(routes.id, excludeRouteId) : undefined
      )
    );

  return { driverAvailable: driverBusy.length === 0, vehicleAvailable: vehicleBusy.length === 0 };
}

export async function rescheduleStop(tenantId: string, routeId: string, stopId: string, newPlannedAt: Date, actor: Actor) {
  const route = await requireRoute(tenantId, routeId);
  const [stop] = await db.update(routeStops).set({ plannedAt: newPlannedAt }).where(eq(routeStops.id, stopId)).returning();
  if (!stop) throw new RouteServiceError("Parada no encontrada", 404);

  await db.insert(routeStatusHistory).values({
    routeId,
    toStatus: route.status,
    actorType: actor.type,
    actorUserId: actor.userId,
    note: `Cambio de horario en parada "${stop.label}" a ${newPlannedAt.toISOString()}`,
  });

  await publishTenantEvent(tenantId, "route.schedule_changed", { routeId, stopId, newPlannedAt });
  return stop;
}
