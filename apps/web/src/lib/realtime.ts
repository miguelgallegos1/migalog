import Ably from "ably";
import { useEffect } from "react";

let client: Ably.Realtime | null = null;

/**
 * Demo: se conecta con la API key directa vía VITE_ABLY_API_KEY. En producción esto debería
 * autenticarse con un token de corta duración emitido por el backend (Ably token auth),
 * para no exponer la key completa en el navegador.
 */
function getClient(): Ably.Realtime | null {
  const apiKey = import.meta.env.VITE_ABLY_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Ably.Realtime({ key: apiKey });
  return client;
}

export function useTenantChannel(tenantId: string | null, onEvent: (eventName: string, data: unknown) => void) {
  useEffect(() => {
    if (!tenantId) return;
    const realtime = getClient();
    if (!realtime) return; // sin key configurada: no-op (modo $0)

    const channel = realtime.channels.get(`tenant:${tenantId}`);
    const handler = (msg: Ably.Message) => onEvent(msg.name ?? "unknown", msg.data);
    channel.subscribe(handler);

    return () => {
      channel.unsubscribe(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);
}
