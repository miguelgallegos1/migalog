import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { tenants, aiAgentActions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { handleIncomingWhatsAppMessage } from "../ai/agent.js";

export const whatsappRoutes = new Hono();

/**
 * Verificación del webhook (Meta pide un GET de confirmación al configurar la URL).
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
whatsappRoutes.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return c.text(challenge ?? "");
  }
  return c.text("Verificación fallida", 403);
});

const inboundSchema = z.object({
  tenantSlug: z.string(),
  from: z.string(),
  text: z.string(),
});

/**
 * En producción esto recibe el payload real de Meta Cloud API (estructura anidada
 * entry[].changes[].value.messages[]). Para la demo aceptamos un cuerpo simplificado
 * { tenantSlug, from, text } que se puede simular directo con curl/Postman.
 */
whatsappRoutes.post("/webhook", async (c) => {
  const body = inboundSchema.parse(await c.req.json());

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, body.tenantSlug));
  if (!tenant) return c.json({ error: "Empresa no encontrada" }, 404);

  const result = await handleIncomingWhatsAppMessage(tenant.id, body.from, body.text);

  const agentActionValues = {
    tenantId: tenant.id,
    routeId: result.routeId,
    fromPhone: body.from,
    inboundMessage: body.text,
    decision: result.reply,
    ruleApplied: result.ruleApplied,
    escalated: result.escalated,
    replyMessage: result.reply,
  };
  await db.insert(aiAgentActions).values(agentActionValues as any);

  // En producción, result.reply se envía de vuelta por la Cloud API de WhatsApp.
  return c.json({ reply: result.reply, escalated: result.escalated });
});
