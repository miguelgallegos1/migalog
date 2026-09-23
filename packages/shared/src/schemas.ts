import { z } from "zod";
import { ROLES } from "./roles.js";
import { ROUTE_STOP_TYPES } from "./route-status.js";

export const stopInputSchema = z.object({
  type: z.enum(ROUTE_STOP_TYPES),
  label: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  plannedAt: z.string().datetime().optional(),
  // Detalle de carga de esta parada (ej. "8 UNI - Cajas encargos") - opcional.
  cargoQuantity: z.number().int().nonnegative().optional(),
  cargoUnit: z.string().optional(),
  cargoDescription: z.string().optional(),
});
export type StopInput = z.infer<typeof stopInputSchema>;

export const createRouteRequestSchema = z.object({
  // Opcional: un rol cliente_* no lo manda (el backend usa su propia empresa cliente);
  // admin_empresa/super_admin sí deben indicarlo, porque no pertenecen a ninguna.
  clientId: z.string().uuid().optional(),
  stops: z.array(stopInputSchema).min(2), // al menos origen y destino
  notes: z.string().optional(),
  // Cuándo debe arrancar la ruta completa - distinto de la hora estimada de cada parada.
  scheduledAt: z.string().datetime().optional(),
});
export type CreateRouteRequestInput = z.infer<typeof createRouteRequestSchema>;

export const createRouteTemplateSchema = z.object({
  category: z.string().optional(),
  name: z.string().min(1),
  originLabel: z.string().min(1),
  originAddress: z.string().min(1),
  originLat: z.number(),
  originLng: z.number(),
  destinationLabel: z.string().min(1),
  destinationAddress: z.string().min(1),
  destinationLat: z.number(),
  destinationLng: z.number(),
  price: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type CreateRouteTemplateInput = z.infer<typeof createRouteTemplateSchema>;

export const approveRouteTemplateSchema = z.object({
  price: z.number().int().nonnegative(),
  estimatedMinutes: z.number().int().positive().optional(),
});
export type ApproveRouteTemplateInput = z.infer<typeof approveRouteTemplateSchema>;

export const confirmRouteSchema = z.object({
  driverId: z.string().uuid(),
  vehicleId: z.string().uuid(),
});
export type ConfirmRouteInput = z.infer<typeof confirmRouteSchema>;

export const reportIncidentSchema = z.object({
  severity: z.enum(["baja", "media", "alta"]),
  description: z.string().min(1),
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
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  // Solo aplica a roles cliente_*: a qué empresa cliente pertenece. Si quien invita ya
  // pertenece a una empresa cliente (cliente_admin), el backend lo completa solo con la suya.
  clientId: z.string().uuid().optional(),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const loginPasswordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginPinSchema = z.object({
  deviceId: z.string().min(1),
  pin: z.string().length(6).regex(/^\d{6}$/),
});
