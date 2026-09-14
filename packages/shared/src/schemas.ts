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
});
export type StopInput = z.infer<typeof stopInputSchema>;

export const createRouteRequestSchema = z.object({
  providerId: z.string().uuid(),
  stops: z.array(stopInputSchema).min(2), // al menos origen y destino
  notes: z.string().optional(),
});
export type CreateRouteRequestInput = z.infer<typeof createRouteRequestSchema>;

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
