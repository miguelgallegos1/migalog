export const ROUTE_STATUSES = [
  "CREADO",
  "APROBADO",
  "RECHAZADO",
  "CONFIRMADO",
  "PARQUEADO",
  "EN_CURSO",
  "EN_PARADA",
  "TERMINADO",
  "CANCELADO",
] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const TERMINAL_ROUTE_STATUSES: RouteStatus[] = ["TERMINADO", "CANCELADO", "RECHAZADO"];

/** Transiciones válidas desde cada estado. CANCELADO se puede alcanzar desde cualquier estado no terminal. */
export const ROUTE_TRANSITIONS: Record<RouteStatus, RouteStatus[]> = {
  CREADO: ["APROBADO", "RECHAZADO", "CANCELADO"],
  APROBADO: ["CONFIRMADO", "CANCELADO"],
  RECHAZADO: [],
  CONFIRMADO: ["PARQUEADO", "CANCELADO"],
  PARQUEADO: ["EN_CURSO", "CANCELADO"],
  EN_CURSO: ["EN_PARADA", "TERMINADO", "CANCELADO"],
  EN_PARADA: ["EN_PARADA", "EN_CURSO", "TERMINADO", "CANCELADO"],
  TERMINADO: [],
  CANCELADO: [],
};

export function canTransition(from: RouteStatus, to: RouteStatus): boolean {
  return ROUTE_TRANSITIONS[from].includes(to);
}

export const ROUTE_STOP_TYPES = ["origen", "parada", "destino"] as const;
export type RouteStopType = (typeof ROUTE_STOP_TYPES)[number];

export const ROUTE_STOP_STATUSES = ["pendiente", "en_curso", "completada", "omitida"] as const;
export type RouteStopStatus = (typeof ROUTE_STOP_STATUSES)[number];

/** Quién ejecutó una acción sobre la ruta, para diferenciar IA de humano en la auditoría. */
export const ACTOR_TYPES = ["human", "ai_agent"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];
