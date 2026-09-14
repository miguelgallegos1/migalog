import Ably from "ably";

let restClient: Ably.Rest | null = null;

function getClient(): Ably.Rest | null {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return null; // sin key configurada: no-op (útil en dev/demo sin costo)
  if (!restClient) restClient = new Ably.Rest({ key: apiKey });
  return restClient;
}

/** Canal por tenant, para no filtrar eventos entre empresas. */
export async function publishTenantEvent(
  tenantId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log(`[realtime:noop] tenant=${tenantId} event=${event}`, data);
    return;
  }
  const channel = client.channels.get(`tenant:${tenantId}`);
  await channel.publish(event, data);
}
