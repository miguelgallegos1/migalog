import { and, desc, eq, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { routes, routeStops, routeCargoItems, routeStatusHistory, routeIncidents, locationPings, drivers, vehicles, users } from "../db/schema.js";
import { canTransition, TERMINAL_ROUTE_STATUSES, type RouteStatus, type ActorType } from "@migalog/shared";
import { generateRouteCode } from "./ids.js";
import { publishTenantEvent } from "./realtime.js";
import { firstOrThrow } from "./db-helpers.js";
import type { StopInput, CargoItemInput } from "@migalog/shared";

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
  // Tipo escrito a mano (no typeof routes.$inferInsert) a propósito: en el entorno de build
  // de Vercel ese tipo generado por Drizzle resulta incompleto (ver seed.ts), y un parámetro
  // tipado con él haría que CUALQUIER literal fresco que un caller le pase (ver confirmRoute/
  // arriveAtStop más abajo) dispare el mismo error en el límite de la función.
  extra: { driverId?: string; vehicleId?: string; currentStopId?: string } = {},
  note?: string
) {
  const route = await requireRoute(tenantId, routeId);
  if (!canTransition(route.status, to)) {
    throw new RouteServiceError(`No se puede pasar de ${route.status} a ${to}`);
  }

  // Variables, no objetos literales directos en .set()/.values() - un literal "fresco" ahí
  // puede disparar el excess-property-check de TypeScript contra el overload equivocado de
  // Drizzle (pasó en build, no en local - ver historial de commits). Vía variable, TS
  // chequea por asignabilidad normal.
  const transitionValues = { status: to, updatedAt: new Date(), ...extra };
  const updated = firstOrThrow(
    await db.update(routes).set(transitionValues).where(eq(routes.id, routeId)).returning()
  );

  const historyValues = {
    routeId,
    fromStatus: route.status,
    toStatus: to,
    actorType: actor.type,
    actorUserId: actor.userId,
    note,
  };
  await db.insert(routeStatusHistory).values(historyValues);

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
  input: { clientId: string; stops: StopInput[]; cargoItems: CargoItemInput[]; notes?: string; scheduledAt?: string }
) {
  // El manifiesto referencia paradas por posición en el array "stops" que se está creando
  // ahora mismo (todavía no tienen id) - se valida acá, antes de escribir nada.
  for (const item of input.cargoItems) {
    if (item.pickupStopIndex >= input.stops.length || item.dropoffStopIndex >= input.stops.length) {
      throw new RouteServiceError("El manifiesto de carga referencia una parada que no existe en el itinerario");
    }
    if (item.dropoffStopIndex <= item.pickupStopIndex) {
      throw new RouteServiceError("El punto de descarga de cada carga debe ir después de su punto de carga en el itinerario");
    }
  }

  const newRouteValues = {
    tenantId,
    clientId: input.clientId,
    code: generateRouteCode(),
    notes: input.notes,
    status: "CREADO" as const,
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
  };
  const route = firstOrThrow(await db.insert(routes).values(newRouteValues).returning());

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
        serviceMinutes: s.serviceMinutes ?? 0,
      }))
    )
    .returning();

  const cargoRows =
    input.cargoItems.length > 0
      ? await db
          .insert(routeCargoItems)
          .values(
            input.cargoItems.map((item) => ({
              routeId: route.id,
              quantity: item.quantity,
              unit: item.unit.toUpperCase(),
              description: item.description.toUpperCase(),
              pickupStopId: stopRows[item.pickupStopIndex]!.id,
              dropoffStopId: stopRows[item.dropoffStopIndex]!.id,
              notes: item.notes,
            }))
          )
          .returning()
      : [];

  const creationHistoryValues = {
    routeId: route.id,
    fromStatus: null,
    toStatus: "CREADO" as const,
    actorType: "human" as const,
  };
  await db.insert(routeStatusHistory).values(creationHistoryValues);

  await publishTenantEvent(tenantId, "route.created", { routeId: route.id, code: route.code });
  return { route, stops: stopRows, cargoItems: cargoRows };
}

export async function listActiveRoutes(tenantId: string) {
  return db
    .select()
    .from(routes)
    .where(and(eq(routes.tenantId, tenantId), notInArray(routes.status, TERMINAL_ROUTE_STATUSES)))
    .orderBy(routes.createdAt);
}

// Tope defensivo: "routes" crece sin fin con el uso (una fila por envío logístico de toda la
// vida de la cuenta) y este endpoint no pagina todavía - sin límite, una empresa con meses de
// historial transfiere cada vez más JSON por celular solo para abrir la pantalla de Historial.
const ROUTE_HISTORY_LIMIT = 200;

export async function listRouteHistory(tenantId: string) {
  return db
    .select()
    .from(routes)
    .where(and(eq(routes.tenantId, tenantId)))
    .orderBy(desc(routes.createdAt))
    .limit(ROUTE_HISTORY_LIMIT);
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
  const cargoItems = await db.select().from(routeCargoItems).where(eq(routeCargoItems.routeId, routeId));
  return { route, stops, cargoItems };
}

export const approveRoute = (tenantId: string, routeId: string, actor: Actor, note?: string) =>
  transition(tenantId, routeId, "APROBADO", actor, {}, note);

export const rejectRoute = (tenantId: string, routeId: string, actor: Actor, note?: string) =>
  transition(tenantId, routeId, "RECHAZADO", actor, {}, note);

/**
 * Confirmar = elegir SOLO el conductor; el camión sale de drivers.vehicleId (el que ese
 * conductor maneja fijo), no se vuelve a elegir acá. `scopeClientId` es quién está
 * confirmando: null cuando es la proveedora (debe ser un conductor de SU flota, sin
 * clientId), o el id de la empresa cliente cuando confirma con flota propia - en ambos
 * casos el conductor elegido tiene que pertenecer exactamente a esa flota, no a otra.
 */
export async function confirmRoute(tenantId: string, routeId: string, driverId: string, actor: Actor, scopeClientId: string | null = null) {
  const scopeCondition = scopeClientId ? eq(drivers.clientId, scopeClientId) : isNull(drivers.clientId);
  const [row] = await db
    .select({ driver: drivers, userActive: users.active })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .where(and(eq(drivers.id, driverId), eq(drivers.tenantId, tenantId), scopeCondition));
  if (!row) throw new RouteServiceError("Conductor no encontrado", 404);
  const { driver, userActive } = row;
  if (driver.status !== "activo" || !userActive) throw new RouteServiceError("Este conductor está desactivado", 400);
  if (!driver.vehicleId) throw new RouteServiceError("Este conductor no tiene un camión asignado", 400);
  if (driver.licenseExpiresAt < new Date().toISOString().slice(0, 10)) {
    throw new RouteServiceError("La licencia de este conductor está vencida - no se puede asignar a una ruta", 400);
  }
  const [vehicle] = await db.select({ id: vehicles.id, status: vehicles.status }).from(vehicles).where(and(eq(vehicles.id, driver.vehicleId), eq(vehicles.tenantId, tenantId)));
  if (!vehicle) throw new RouteServiceError("El camión de este conductor ya no existe", 404);
  if (vehicle.status !== "activo") throw new RouteServiceError("El camión de este conductor no está activo (en mantenimiento o inactivo)", 400);
  return transition(tenantId, routeId, "CONFIRMADO", actor, { driverId, vehicleId: vehicle.id });
}

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
    const arrivalValues = { status: "completada" as const, arrivedAt: new Date() };
    await db.update(routeStops).set(arrivalValues).where(eq(routeStops.id, origin.id));
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

  const stopArrivalValues = { status: "completada" as const, arrivedAt: new Date() };
  await db.update(routeStops).set(stopArrivalValues).where(eq(routeStops.id, stopId));

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
  const pingValues = { routeId, lat, lng };
  const ping = firstOrThrow(await db.insert(locationPings).values(pingValues).returning());
  await publishTenantEvent(tenantId, "route.location", { routeId, lat, lng, recordedAt: ping.recordedAt });
  return ping;
}

export async function reportIncident(
  tenantId: string,
  routeId: string,
  severity: "baja" | "media" | "alta",
  description: string,
  photo?: string
) {
  await requireRoute(tenantId, routeId);
  const incidentValues = { routeId, severity, description, photo };
  const incident = firstOrThrow(await db.insert(routeIncidents).values(incidentValues).returning());
  const hasIncidentValues = { hasIncident: true };
  await db.update(routes).set(hasIncidentValues).where(eq(routes.id, routeId));
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
    .select({ id: routes.id })
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
    .select({ id: routes.id })
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
  const plannedAtValues = { plannedAt: newPlannedAt };
  const [stop] = await db.update(routeStops).set(plannedAtValues).where(eq(routeStops.id, stopId)).returning();
  if (!stop) throw new RouteServiceError("Parada no encontrada", 404);

  const rescheduleHistoryValues = {
    routeId,
    toStatus: route.status,
    actorType: actor.type,
    actorUserId: actor.userId,
    note: `Cambio de horario en parada "${stop.label}" a ${newPlannedAt.toISOString()}`,
  };
  await db.insert(routeStatusHistory).values(rescheduleHistoryValues);

  await publishTenantEvent(tenantId, "route.schedule_changed", { routeId, stopId, newPlannedAt });
  return stop;
}
