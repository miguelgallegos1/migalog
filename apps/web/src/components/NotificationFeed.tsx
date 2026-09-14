import { useState } from "react";
import { useAuthStore } from "../store/auth";
import { useTenantChannel } from "../lib/realtime";

type FeedItem = { id: string; text: string; at: string };

/** Traduce un evento crudo de Ably a una línea de texto legible para el feed. `null` = se ignora. */
function describe(eventName: string, data: unknown): string | null {
  const d = data as Record<string, unknown>;
  switch (eventName) {
    case "route.created":
      return `Nueva solicitud de ruta ${d.code}`;
    case "route.status_changed":
      return `Ruta ${d.code}: ${d.from} → ${d.to} (${d.actorType === "ai_agent" ? "IA" : "humano"})`;
    case "route.stop_arrived":
      return `Ruta ${d.code}: llegó a "${d.stopLabel}"${d.isLast ? " (destino final)" : ""}`;
    case "route.incident":
      return `Incidencia (${d.severity}) reportada: ${d.description}`;
    case "route.schedule_changed":
      return `Cambio de horario en una parada`;
    default:
      return null;
  }
}

/** Feed en vivo de eventos de ruta (cambios de estado, paradas, incidencias) del tenant actual. */
export function NotificationFeed() {
  const tenantId = useAuthStore((s) => s.user?.tenantId ?? null);
  // Guardamos los últimos 30 eventos en memoria; no persiste entre recargas (es un feed en vivo,
  // no un historial - el historial real de cada ruta vive en route_status_history del backend).
  const [items, setItems] = useState<FeedItem[]>([]);

  useTenantChannel(tenantId, (eventName, data) => {
    const text = describe(eventName, data);
    if (!text) return;
    setItems((prev) => [{ id: `${Date.now()}-${Math.random()}`, text, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 30));
  });

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Centro de notificaciones</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sin eventos todavía. {!import.meta.env.VITE_ABLY_API_KEY && "(Configura VITE_ABLY_API_KEY para ver esto en vivo)"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800/70">
              <div className="text-slate-800 dark:text-slate-200">{item.text}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{item.at}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
