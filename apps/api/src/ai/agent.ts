import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, routes } from "../db/schema.js";
import { TERMINAL_ROUTE_STATUSES } from "@migalog/shared";
import { toolDefinitions, runTool, type ToolContext } from "./tools.js";
import { getRouteWithStops } from "../lib/route-service.js";

export type AgentResult = {
  reply: string;
  escalated: boolean;
  ruleApplied: string;
  routeId?: string;
};

const SYSTEM_PROMPT = `Eres el agente coordinador de MigaLog. Hablas por WhatsApp con un solicitante
de rutas de transporte (empresa proveedora). Tu trabajo es resolver, dentro de tu alcance,
cambios de horario y consultas de estado - el caso más común es correr el horario de una parada.
Antes de prometer un cambio de horario, SIEMPRE usa la herramienta consultar_disponibilidad para
verificar que el conductor y el vehículo asignados estén libres. Si no hay disponibilidad, o el
pedido es cancelar la ruta, cambiar destino/paradas o reasignar camión, usa escalar_a_humano.
Responde siempre en español, breve y claro, como un mensaje de WhatsApp.`;

// NOTA: por ahora solo se adaptó al esquema nuevo (users.clientId reemplaza el join por
// providers.contactUserId) para que compile - la lógica de a quién representa/escala el
// agente dentro de la nueva jerarquía de roles queda pendiente, a propósito, hasta terminar
// de definir la estructura de roles completa.
async function findUserAndActiveRoute(tenantId: string, fromPhone: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.phone, fromPhone), eq(users.role, "cliente_solicitante")));
  if (!user?.clientId) return null;

  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.tenantId, tenantId), eq(routes.clientId, user.clientId), notInArray(routes.status, TERMINAL_ROUTE_STATUSES)))
    .orderBy(desc(routes.createdAt));

  return { user, route };
}

export async function handleIncomingWhatsAppMessage(
  tenantId: string,
  fromPhone: string,
  text: string
): Promise<AgentResult> {
  const context = await findUserAndActiveRoute(tenantId, fromPhone);
  if (!context?.route) {
    return {
      reply: "No encontramos una ruta activa asociada a tu número. Un miembro de nuestro equipo te contactará.",
      escalated: true,
      ruleApplied: "sin_ruta_activa",
    };
  }

  const toolCtx: ToolContext = { tenantId, routeId: context.route.id, actor: { type: "ai_agent" } };

  const result = process.env.ANTHROPIC_API_KEY
    ? await runWithClaude(text, toolCtx)
    : await runWithStubRules(text, toolCtx);

  return { ...result, routeId: context.route.id };
}

/** Motor real: Claude con tool-use, hasta 4 vueltas de herramienta antes de forzar una respuesta. */
async function runWithClaude(text: string, ctx: ToolContext): Promise<Omit<AgentResult, "routeId">> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: text }];
  let escalated = false;
  let ruleApplied = "claude";

  for (let turn = 0; turn < 4; turn++) {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    const toolUses = response.content.filter((block) => block.type === "tool_use");
    if (toolUses.length === 0) {
      const textBlock = response.content.find((block) => block.type === "text");
      return { reply: textBlock?.type === "text" ? textBlock.text : "Entendido.", escalated, ruleApplied };
    }

    messages.push({ role: "assistant", content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      if (use.type !== "tool_use") continue;
      const result = await runTool(use.name, use.input as Record<string, unknown>, ctx);
      if (result.escalated) escalated = true;
      ruleApplied = result.ruleApplied;
      toolResults.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result.output) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { reply: "Tu pedido está en revisión, te confirmamos pronto.", escalated: true, ruleApplied: "limite_de_turnos" };
}

/** Modo $0: reglas simples de texto, sin llamar a ninguna API paga. */
async function runWithStubRules(text: string, ctx: ToolContext): Promise<Omit<AgentResult, "routeId">> {
  const lower = text.toLowerCase();

  const timeMatch = lower.match(/(\d{1,2})[:h](\d{2})/);
  const wantsScheduleChange = /(cambia|correr|mover|reprogram|nuevo horario)/.test(lower);

  if (wantsScheduleChange && timeMatch) {
    const [, hh, mm] = timeMatch;
    const newDate = new Date();
    newDate.setHours(Number(hh), Number(mm), 0, 0);

    const { stops } = await getRouteWithStops(ctx.tenantId, ctx.routeId);
    const destino = stops.find((s) => s.type === "destino") ?? stops[stops.length - 1];
    if (!destino) {
      return { reply: "No encontramos paradas en tu ruta activa.", escalated: true, ruleApplied: "sin_paradas" };
    }

    const result = await runTool(
      "proponer_cambio_horario",
      { stopLabel: destino.label, newIsoDateTime: newDate.toISOString() },
      ctx
    );

    if (result.escalated) {
      return {
        reply: "No encontramos disponibilidad para ese horario. Un coordinador humano lo revisará y te confirma.",
        escalated: true,
        ruleApplied: result.ruleApplied,
      };
    }
    return {
      reply: `Listo, actualizamos el horario de "${destino.label}" a las ${hh}:${mm}. Te avisamos si hay algún cambio.`,
      escalated: false,
      ruleApplied: result.ruleApplied,
    };
  }

  if (/(retraso|tarde|demora)/.test(lower)) {
    const result = await runTool("registrar_retraso", { descripcion: text }, ctx);
    return { reply: "Gracias por avisar, dejamos registrado el retraso en la ruta.", escalated: false, ruleApplied: result.ruleApplied };
  }

  const result = await runTool("escalar_a_humano", { motivo: text }, ctx);
  return {
    reply: "Tu pedido quedó anotado y lo está revisando un miembro de nuestro equipo. Te contactamos pronto.",
    escalated: true,
    ruleApplied: result.ruleApplied,
  };
}
