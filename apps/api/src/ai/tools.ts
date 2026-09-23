import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { routeStops } from "../db/schema.js";
import * as routeService from "../lib/route-service.js";
import type { Actor } from "../lib/route-service.js";

export type ToolContext = { tenantId: string; routeId: string; actor: Actor };

/** Definiciones de herramientas en formato Anthropic tool-use. */
export const toolDefinitions = [
  {
    name: "consultar_estado_ruta",
    description: "Devuelve el estado actual de la ruta y sus paradas.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "consultar_disponibilidad",
    description: "Verifica si el conductor y el vehículo asignados a la ruta están libres (sin otra ruta activa encima).",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "proponer_cambio_horario",
    description: "Aplica un nuevo horario estimado a una parada de la ruta, identificada por su etiqueta (label).",
    input_schema: {
      type: "object" as const,
      properties: {
        stopLabel: { type: "string", description: "Etiqueta de la parada a reprogramar, ej. 'Destino'" },
        newIsoDateTime: { type: "string", description: "Nueva hora estimada en formato ISO 8601" },
      },
      required: ["stopLabel", "newIsoDateTime"],
    },
  },
  {
    name: "registrar_retraso",
    description: "Registra que la ruta va con retraso, sin cambiar el horario planificado.",
    input_schema: {
      type: "object" as const,
      properties: { descripcion: { type: "string" } },
      required: ["descripcion"],
    },
  },
  {
    name: "escalar_a_humano",
    description: "Escala el pedido a un humano cuando está fuera del alcance de la IA.",
    input_schema: {
      type: "object" as const,
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
];

export type ToolResult = { escalated?: boolean; ruleApplied: string; output: unknown };

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "consultar_estado_ruta": {
      const data = await routeService.getRouteWithStops(ctx.tenantId, ctx.routeId);
      return { ruleApplied: "consultar_estado_ruta", output: data };
    }
    case "consultar_disponibilidad": {
      const { route } = await routeService.getRouteWithStops(ctx.tenantId, ctx.routeId);
      if (!route.driverId || !route.vehicleId) {
        return { ruleApplied: "consultar_disponibilidad", output: { driverAvailable: false, vehicleAvailable: false, reason: "Ruta sin conductor/vehículo asignado aún" } };
      }
      const availability = await routeService.checkAvailability(ctx.tenantId, route.driverId, route.vehicleId, ctx.routeId);
      return { ruleApplied: "consultar_disponibilidad", output: availability };
    }
    case "proponer_cambio_horario": {
      const stopLabel = String(input.stopLabel ?? "");
      const newIsoDateTime = String(input.newIsoDateTime ?? "");
      const { route } = await routeService.getRouteWithStops(ctx.tenantId, ctx.routeId);

      if (route.driverId && route.vehicleId) {
        const availability = await routeService.checkAvailability(ctx.tenantId, route.driverId, route.vehicleId, ctx.routeId);
        if (!availability.driverAvailable || !availability.vehicleAvailable) {
          return { escalated: true, ruleApplied: "proponer_cambio_horario:sin_disponibilidad", output: availability };
        }
      }

      const [stop] = await db
        .select()
        .from(routeStops)
        .where(and(eq(routeStops.routeId, ctx.routeId), eq(routeStops.label, stopLabel)));
      if (!stop) return { escalated: true, ruleApplied: "proponer_cambio_horario:parada_no_encontrada", output: null };

      const updated = await routeService.rescheduleStop(ctx.tenantId, ctx.routeId, stop.id, new Date(newIsoDateTime), ctx.actor);
      return { ruleApplied: "proponer_cambio_horario:aplicado", output: updated };
    }
    case "registrar_retraso": {
      const descripcion = String(input.descripcion ?? "Retraso reportado por el solicitante");
      const incident = await routeService.reportIncident(ctx.tenantId, ctx.routeId, "media", descripcion);
      return { ruleApplied: "registrar_retraso", output: incident };
    }
    case "escalar_a_humano": {
      return { escalated: true, ruleApplied: "escalar_a_humano", output: { motivo: input.motivo } };
    }
    default:
      return { escalated: true, ruleApplied: "herramienta_desconocida", output: null };
  }
}
