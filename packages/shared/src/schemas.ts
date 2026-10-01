import { z } from "zod";
import { ROLES } from "./roles.js";
import { ROUTE_STOP_TYPES } from "./route-status.js";

// Foto como data URL base64 (ver apps/web/src/lib/files.ts) - el front ya tapea el archivo
// original a 2MB, que en base64 queda en ~2.7M caracteres; el máximo de 4M da margen sin
// dejar la puerta abierta a que alguien mande un string arbitrariamente grande.
export const base64PhotoSchema = z.string().max(4_000_000);

export const stopInputSchema = z.object({
  type: z.enum(ROUTE_STOP_TYPES),
  label: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  plannedAt: z.string().datetime().optional(),
  // Cuánto se estima que toma cargar/descargar en este punto - independiente del tiempo de
  // viaje entre paradas. Se define al crear la solicitud (varía según el volumen de esa
  // carga puntual, no es un dato fijo de la ruta del catálogo).
  serviceMinutes: z.number().int().nonnegative().optional(),
});
export type StopInput = z.infer<typeof stopInputSchema>;

/**
 * Una línea del manifiesto de carga: no va pegada a una sola parada (una ruta con paradas
 * intermedias suele cargar varias cosas distintas en el origen, cada una con su propio
 * destino dentro del itinerario - ej. 19 pallets que se bajan en la parada, y el resto sigue
 * hasta el destino final). "pickupStopIndex"/"dropoffStopIndex" son posiciones dentro del
 * array "stops" de la misma solicitud (0 = origen, el último = destino).
 */
export const cargoItemInputSchema = z.object({
  quantity: z.number().int().positive(),
  unit: z.string().trim().min(1), // ej. "CAJAS", "PALLETS", "GAVETAS", "COCHES"
  description: z.string().trim().min(1), // ej. "ROSAS"
  pickupStopIndex: z.number().int().nonnegative(),
  dropoffStopIndex: z.number().int().nonnegative(),
  notes: z.string().trim().optional(),
});
export type CargoItemInput = z.infer<typeof cargoItemInputSchema>;

export const createRouteRequestSchema = z.object({
  // Opcional: un rol cliente_* no lo manda (el backend usa su propia empresa cliente);
  // admin_empresa/super_admin sí deben indicarlo, porque no pertenecen a ninguna.
  clientId: z.string().uuid().optional(),
  stops: z.array(stopInputSchema).min(2), // al menos origen y destino
  // El manifiesto completo de la ruta - qué se recoge y en qué punto se deja cada cosa. Es
  // lo que va a ver el conductor en cada parada para saber qué cargar/descargar ahí.
  cargoItems: z.array(cargoItemInputSchema).default([]),
  notes: z.string().optional(),
  // Cuándo debe arrancar la ruta completa - distinto de la hora estimada de cada parada.
  scheduledAt: z.string().datetime().optional(),
});
export type CreateRouteRequestInput = z.infer<typeof createRouteRequestSchema>;

export const routeTemplateStopInputSchema = z.object({
  siteId: z.string().uuid(),
  // Valor propio de esa parada (ej. costo adicional por el desvío) - obligatorio, porque el
  // "price" total de la ruta se arma sumando el de cada tramo (ver RouteCatalog.tsx).
  price: z.number().int().nonnegative(),
});
export type RouteTemplateStopInput = z.infer<typeof routeTemplateStopInputSchema>;

export const createRouteTemplateSchema = z.object({
  // Fecha para llevar control de cuándo se fijó/actualizó este acuerdo de ruta.
  effectiveDate: z.string().min(1),
  billingSiteId: z.string().uuid(),
  originSiteId: z.string().uuid(),
  destinationSiteId: z.string().uuid(),
  // Paradas intermedias, en el orden en que se pasa por ellas (puede ir vacío: ruta directa).
  stops: z.array(routeTemplateStopInputSchema).default([]),
  price: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  // Calculada en el navegador (Mapbox Directions) cuando hay GPS disponible en todo el
  // itinerario - no se recalcula ni se valida del lado del servidor.
  distanceKm: z.number().nonnegative().optional(),
});
export type CreateRouteTemplateInput = z.infer<typeof createRouteTemplateSchema>;

// Formato E.164 (+ código de país + número, ej. "+593991234567") - no se invita ni se
// inicia sesión por correo en ningún lado de la app, todo es por WhatsApp/teléfono, y sin
// el código de país el número no sirve para identificar a nadie de forma única entre países.
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Incluí el código de país (ej. +593991234567)");

// Se recorta espacios y se pasa a mayúsculas siempre (no solo en el front): "name"/"company"
// arman el nombre de la ruta del catálogo (ej. "CAYAMBE-TABACUNDO"), tienen que quedar
// consistentes sin importar cómo los haya tipeado la persona ni por qué vía llegue el alta.
const siteTextField = z
  .string()
  .trim()
  .min(1, "Campo obligatorio")
  .transform((v) => v.toUpperCase());

export const createSiteSchema = z.object({
  name: siteTextField,
  // Empresa a la que pertenece el sitio (para facturación).
  company: siteTextField,
  contactPhone: z.union([phoneSchema, z.literal("")]).optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export type CreateSiteInput = z.infer<typeof createSiteSchema>;

export const approveRouteTemplateSchema = z.object({
  price: z.number().int().nonnegative(),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type ApproveRouteTemplateInput = z.infer<typeof approveRouteTemplateSchema>;

// El camión ya no se elige acá - sale del propio conductor (drivers.vehicleId, el camión
// fijo que maneja), así la ruta siempre queda con el par conductor+camión correcto.
export const confirmRouteSchema = z.object({
  driverId: z.string().uuid(),
});
export type ConfirmRouteInput = z.infer<typeof confirmRouteSchema>;

export const reportIncidentSchema = z.object({
  severity: z.enum(["baja", "media", "alta"]),
  description: z.string().min(1),
  // Una sola foto (data URL base64, mismo criterio que las fotos de licencia) - opcional.
  photo: base64PhotoSchema.optional(),
});
export type ReportIncidentInput = z.infer<typeof reportIncidentSchema>;

export const locationPingSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  recordedAt: z.string().datetime().optional(),
});
export type LocationPingInput = z.infer<typeof locationPingSchema>;

export const inviteUserSchema = z.object({
  name: z.string().min(1),
  role: z.enum(ROLES),
  phone: phoneSchema,
  // Solo aplica a roles cliente_*: a qué empresa cliente pertenece. Si quien invita ya
  // pertenece a una empresa cliente (cliente_admin), el backend lo completa solo con la suya.
  clientId: z.string().uuid().optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const loginPasswordSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(8),
});

export const loginPinSchema = z.object({
  deviceId: z.string().min(1),
  pin: z.string().length(6).regex(/^\d{6}$/),
});
