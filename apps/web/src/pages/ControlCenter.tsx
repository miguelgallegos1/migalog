import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { useTenantChannel } from "../lib/realtime";
import { RouteStatusBadge } from "../components/RouteStatusBadge";
import { NotificationFeed } from "../components/NotificationFeed";
import type { MapMarker } from "../components/RoutesMap";
import type { RouteStatus } from "@migalog/shared";

// Mapbox GL pesa ~1.8MB: se separa en su propio chunk y se carga solo al abrir este panel,
// no en el bundle inicial (login, etc.) - importante para uso en datos móviles.
const RoutesMap = lazy(() => import("../components/RoutesMap").then((m) => ({ default: m.RoutesMap })));

type RouteRow = {
  id: string;
  code: string;
  status: RouteStatus;
  hasIncident: boolean;
  delayed: boolean;
  createdAt: string;
  currentStopId: string | null;
};

/**
 * Panel de control: mapa de rastreo en vivo, centro de notificaciones y el grid de rutas
 * activas (las terminadas/canceladas/rechazadas viven aparte, en Historial). Todo se
 * mantiene al día combinando polling (`refetchInterval`) con eventos en tiempo real de
 * Ably - si Ably no está configurado, el polling solo igual mantiene la pantalla usable.
 */
export default function ControlCenter() {
  const tenantId = useAuthStore((s) => s.user?.tenantId ?? null);
  const queryClient = useQueryClient();
  // Últimas posiciones GPS conocidas por ruta, recibidas en vivo (no vienen del fetch inicial).
  const [livePositions, setLivePositions] = useState<Record<string, { lat: number; lng: number }>>({});

  const { data: routes, isLoading } = useQuery({
    queryKey: ["routes", "active"],
    queryFn: () => api.get<RouteRow[]>("/routes"),
    refetchInterval: 15000,
  });

  useTenantChannel(tenantId, (eventName, data) => {
    const payload = data as { routeId?: string; lat?: number; lng?: number };
    if (eventName === "route.location" && payload.routeId && payload.lat != null && payload.lng != null) {
      setLivePositions((prev) => ({ ...prev, [payload.routeId as string]: { lat: payload.lat!, lng: payload.lng! } }));
    }
    // Cualquier otro evento de ruta (cambio de estado, parada, incidencia) invalida el grid
    // para que se refresque con los datos reales del backend, en vez de intentar parchear
    // el estado localmente y arriesgarnos a que quede desincronizado.
    queryClient.invalidateQueries({ queryKey: ["routes", "active"] });
  });

  // Solo se muestran en el mapa las rutas de las que ya recibimos al menos una posición GPS.
  const markers: MapMarker[] = useMemo(() => {
    if (!routes) return [];
    return Object.entries(livePositions)
      .map(([routeId, pos]) => {
        const route = routes.find((r) => r.id === routeId);
        if (!route) return null;
        return { id: routeId, lat: pos.lat, lng: pos.lng, label: route.code };
      })
      .filter((m): m is MapMarker => m !== null);
  }, [routes, livePositions]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Panel de control</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense
            fallback={
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                Cargando mapa...
              </div>
            }
          >
            <RoutesMap markers={markers} />
          </Suspense>
        </div>
        <NotificationFeed />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Rutas activas</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">Ordenadas de más reciente a más antigua</span>
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !routes || routes.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No hay rutas activas.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {routes.map((route) => (
              <li key={route.id}>
                <Link
                  to={`/rutas/${route.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/50"
                >
                  <span className="font-mono text-slate-700 dark:text-slate-300">{route.code}</span>
                  <span className="flex items-center gap-2">
                    {route.hasIncident && <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs text-red-200">Incidencia</span>}
                    {route.delayed && <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-200">Demorado</span>}
                    <RouteStatusBadge status={route.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
