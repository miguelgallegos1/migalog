import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { RouteStatusBadge } from "../components/RouteStatusBadge";
import type { RouteStatus, RouteStopStatus, RouteStopType } from "@migalog/shared";

type Stop = {
  id: string;
  sequenceOrder: number;
  type: RouteStopType;
  label: string;
  address: string;
  status: RouteStopStatus;
  plannedAt: string | null;
  arrivedAt: string | null;
};

type RouteData = {
  route: { id: string; code: string; status: RouteStatus; driverId: string | null; vehicleId: string | null; hasIncident: boolean; notes: string | null };
  stops: Stop[];
  delayed: boolean;
};

type Driver = { id: string; licenseNumber: string; status: string };
type Vehicle = { id: string; plate: string; status: string };

/**
 * Detalle de una ruta: timeline de paradas (el conductor las marca una por una, en orden)
 * y las acciones disponibles según el estado actual y el rol de quien mira la pantalla -
 * la máquina de estados real vive en el backend (apps/api/src/lib/route-service.ts), acá
 * solo mostramos/ocultamos botones según lo que el estado actual permite.
 */
export default function RouteDetail() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["routes", id],
    queryFn: () => api.get<RouteData>(`/routes/${id}`),
    enabled: !!id,
  });

  // Los combos de conductor/vehículo solo hacen falta para roles que pueden despachar
  // (nivel 1) - evitamos el fetch de más para el resto con `enabled`.
  const canDispatch = role === "admin_empresa" || role === "coordinador" || role === "super_admin";
  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => api.get<Driver[]>("/drivers"),
    enabled: canDispatch,
  });
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => api.get<Vehicle[]>("/vehicles"),
    enabled: canDispatch,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["routes", id] });
    queryClient.invalidateQueries({ queryKey: ["routes", "active"] });
  }

  // Una sola mutación genérica para todas las acciones (aprobar, confirmar, marcar parada,
  // etc.): cada botón le pasa la llamada a la API que corresponde, y acá se maneja el
  // éxito/error de forma uniforme en vez de repetir el mismo boilerplate por acción.
  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : "No se pudo completar la acción"),
  });

  if (isLoading || !data) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  const { route, stops, delayed } = data;
  // Aprobar/rechazar es de la empresa cliente (es su pedido); confirmar/despachar es de
  // la empresa proveedora (asigna camión/conductor) - roles distintos, permisos distintos.
  const canApprove = role === "cliente_admin" || role === "cliente_coordinador" || role === "super_admin";
  const isConductor = role === "conductor";

  // La próxima parada pendiente es la única que el conductor puede marcar ahora mismo -
  // el backend igual valida el orden, pero ocultar el botón en las demás evita errores obvios.
  const nextPendingStop = stops.find((s) => s.status !== "completada");
  const selectClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold text-slate-900 dark:text-white">{route.code}</h1>
          <div className="mt-1 flex items-center gap-2">
            <RouteStatusBadge status={route.status} />
            {route.hasIncident && <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs text-red-200">Incidencia activa</span>}
            {delayed && <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-200">Demorado</span>}
          </div>
        </div>
      </div>

      {actionError && <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{actionError}</p>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Paradas</h2>
        <ol className="flex flex-col gap-3">
          {stops.map((stop) => (
            <li key={stop.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/60">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {stop.sequenceOrder + 1}. {stop.label}{" "}
                  <span className="text-xs uppercase text-slate-500 dark:text-slate-400">({stop.type})</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{stop.address}</div>
              </div>
              <div className="flex items-center gap-2">
                {stop.status === "completada" ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ {stop.arrivedAt ? new Date(stop.arrivedAt).toLocaleTimeString() : ""}</span>
                ) : isConductor && nextPendingStop?.id === stop.id && (route.status === "EN_CURSO" || route.status === "EN_PARADA") ? (
                  <button
                    onClick={() => action.mutate(() => api.post(`/routes/${id}/stops/${stop.id}/arrive`))}
                    className="rounded-md bg-amber-400 px-3 py-1 text-xs font-bold text-slate-900 hover:bg-amber-300"
                  >
                    Marcar llegada
                  </button>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Pendiente</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Acciones</h2>
        <div className="flex flex-wrap gap-2">
          {/* CREADO: la empresa cliente (o la IA por WhatsApp, ver ai/agent.ts) aprueba o rechaza. */}
          {canApprove && route.status === "CREADO" && (
            <>
              <button onClick={() => action.mutate(() => api.post(`/routes/${id}/approve`))} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800">
                Aprobar
              </button>
              <button onClick={() => action.mutate(() => api.post(`/routes/${id}/reject`, {}))} className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600">
                Rechazar
              </button>
            </>
          )}

          {/* APROBADO: se asigna conductor y vehículo para pasar a CONFIRMADO. */}
          {canDispatch && route.status === "APROBADO" && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={selectClass}>
                <option value="">Conductor...</option>
                {drivers?.map((d) => (
                  <option key={d.id} value={d.id}>{d.licenseNumber}</option>
                ))}
              </select>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={selectClass}>
                <option value="">Camión...</option>
                {vehicles?.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate}</option>
                ))}
              </select>
              <button
                disabled={!driverId || !vehicleId}
                onClick={() => action.mutate(() => api.post(`/routes/${id}/confirm`, { driverId, vehicleId }))}
                className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirmar asignación
              </button>
            </div>
          )}

          {isConductor && route.status === "CONFIRMADO" && (
            <button onClick={() => action.mutate(() => api.post(`/routes/${id}/park`))} className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800">
              Marcar parqueado en origen
            </button>
          )}

          {isConductor && route.status === "PARQUEADO" && (
            <button onClick={() => action.mutate(() => api.post(`/routes/${id}/depart`))} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800">
              Marcar salida (en curso)
            </button>
          )}

          {!["TERMINADO", "CANCELADO", "RECHAZADO"].includes(route.status) && (
            <button
              onClick={() => action.mutate(() => api.post(`/routes/${id}/cancel`, {}))}
              className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Cancelar ruta
            </button>
          )}
        </div>

        {!["TERMINADO", "CANCELADO", "RECHAZADO"].includes(route.status) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <input
              placeholder="Describir incidencia (avería, tráfico, accidente...)"
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              disabled={!incidentDescription}
              onClick={() =>
                action.mutate(() =>
                  api.post(`/routes/${id}/incidents`, { severity: "media", description: incidentDescription }).then(() => setIncidentDescription(""))
                )
              }
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reportar incidencia
            </button>
          </div>
        )}
      </div>

      {route.notes && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Notas: </span>
          {route.notes}
        </div>
      )}
    </div>
  );
}
