import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { RouteStatusBadge } from "../components/RouteStatusBadge";
import { Select } from "../components/Select";
import { formatDuration } from "../lib/number";
import { fileToDataUrl } from "../lib/files";
import { DownIcon } from "../components/icons";
import type { RouteStatus, RouteStopStatus, RouteStopType } from "@migalog/shared";

// Estados en los que la ruta ya está en manos del conductor (tiene sentido mandar su GPS) -
// antes de CONFIRMADO no hay conductor asignado, y desde TERMINADO/CANCELADO en adelante ya
// no se está moviendo.
const TRACKABLE_STATUSES: RouteStatus[] = ["CONFIRMADO", "PARQUEADO", "EN_CURSO", "EN_PARADA"];
// No tiene sentido mandar un ping por cada evento de "watchPosition" (puede disparar varias
// veces por segundo) - se manda como mucho uno cada quince segundos.
const LOCATION_PING_INTERVAL_MS = 15_000;

type Stop = {
  id: string;
  sequenceOrder: number;
  type: RouteStopType;
  label: string;
  address: string;
  status: RouteStopStatus;
  plannedAt: string | null;
  arrivedAt: string | null;
  serviceMinutes: number;
};

type CargoItem = {
  id: string;
  quantity: number;
  unit: string;
  description: string;
  pickupStopId: string;
  dropoffStopId: string;
  notes: string | null;
};

type RouteData = {
  route: { id: string; code: string; status: RouteStatus; driverId: string | null; vehicleId: string | null; hasIncident: boolean; notes: string | null };
  stops: Stop[];
  cargoItems: CargoItem[];
  delayed: boolean;
};

const UpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3">
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

type Driver = {
  id: string;
  name: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  licenseExpiresAt: string;
  status: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentPhoto, setIncidentPhoto] = useState<string | null>(null);
  const [incidentPhotoError, setIncidentPhotoError] = useState<string | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["routes", id],
    queryFn: () => api.get<RouteData>(`/routes/${id}`),
    enabled: !!id,
  });

  // El combo de conductor hace falta tanto para la proveedora (su propia flota) como para
  // la empresa cliente (su flota propia, si tiene) - el backend/GET /drivers ya devuelve
  // solo la flota que le corresponde a cada uno.
  const canDispatch = role === "admin_empresa" || role === "coordinador" || role === "super_admin";
  const canClientDispatch = role === "cliente_admin" || role === "cliente_coordinador";
  const canConfirm = canDispatch || canClientDispatch;
  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: () => api.get<Driver[]>("/drivers"),
    enabled: canConfirm,
  });
  // El camión no se elige aparte: sale del conductor elegido (su camión fijo asignado). Solo
  // se puede confirmar con un conductor que tenga camión Y licencia vigente.
  const assignableDrivers = (drivers ?? []).filter((d) => d.status === "activo" && d.vehicleId && d.licenseExpiresAt >= todayISO());

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

  const isConductor = role === "conductor" || role === "cliente_conductor";
  const routeStatus = data?.route.status;

  // Seguimiento GPS real: mientras el conductor asignado tiene esta ruta abierta y está en
  // curso, el navegador manda su posición cada ~15s (navigator.geolocation.watchPosition) a
  // POST /routes/:id/location - de ahí sale el evento en vivo que Ably reenvía y que
  // ControlCenter.tsx dibuja en el mapa. Es rastreo "en primer plano": si se cierra la
  // pestaña o el teléfono se bloquea, deja de mandar - un rastreo en segundo plano de
  // verdad necesitaría una app nativa, no alcanza con el navegador.
  useEffect(() => {
    if (!isConductor || !id || !routeStatus || !TRACKABLE_STATUSES.includes(routeStatus) || !("geolocation" in navigator)) {
      setSharingLocation(false);
      return;
    }
    let lastSentAt = 0;
    setSharingLocation(true);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentAt < LOCATION_PING_INTERVAL_MS) return;
        lastSentAt = now;
        api.post(`/routes/${id}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
      },
      () => setSharingLocation(false),
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      setSharingLocation(false);
    };
  }, [isConductor, id, routeStatus]);

  if (isLoading || !data) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  const { route, stops, cargoItems, delayed } = data;
  // Aprobar/rechazar es de la empresa cliente (es su pedido); confirmar/despachar es de
  // la empresa proveedora (asigna camión/conductor) - roles distintos, permisos distintos.
  const canApprove = role === "cliente_admin" || role === "cliente_coordinador" || role === "super_admin";

  // La próxima parada pendiente es la única que el conductor puede marcar ahora mismo -
  // el backend igual valida el orden, pero ocultar el botón en las demás evita errores obvios.
  const nextPendingStop = stops.find((s) => s.status !== "completada");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold text-slate-900 dark:text-white">{route.code}</h1>
          <div className="mt-1 flex items-center gap-2">
            <RouteStatusBadge status={route.status} />
            {route.hasIncident && <span className="rounded-full bg-red-900 px-2 py-0.5 text-xs text-red-200">Incidencia activa</span>}
            {delayed && <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs text-amber-200">Demorado</span>}
            {isConductor && sharingLocation && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Compartiendo ubicación
              </span>
            )}
          </div>
        </div>
      </div>

      {actionError && <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{actionError}</p>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Paradas</h2>
        <ol className="flex flex-col gap-3">
          {stops.map((stop) => {
            const pickups = cargoItems.filter((c) => c.pickupStopId === stop.id);
            const dropoffs = cargoItems.filter((c) => c.dropoffStopId === stop.id);
            return (
              <li key={stop.id} className="flex flex-col gap-1.5 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800/60">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {stop.sequenceOrder + 1}. {stop.label}{" "}
                      <span className="text-xs uppercase text-slate-500 dark:text-slate-400">({stop.type})</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{stop.address}</div>
                    {stop.serviceMinutes > 0 && (
                      <div className="text-xs text-slate-400 dark:text-slate-500">Tiempo de carga/descarga: {formatDuration(stop.serviceMinutes)}</div>
                    )}
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
                </div>
                {/* Manifiesto de esta parada: qué recoger y qué dejar acá (ver NewRouteRequest.tsx,
                    donde se arma) - es la información clave para el conductor. */}
                {(pickups.length > 0 || dropoffs.length > 0) && (
                  <div className="flex flex-col gap-0.5 text-xs">
                    {pickups.length > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <UpIcon /> Recoger: {pickups.map((c) => `${c.quantity} ${c.unit} ${c.description}${c.notes ? ` (${c.notes})` : ""}`).join(" · ")}
                      </span>
                    )}
                    {dropoffs.length > 0 && (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <DownIcon className="h-3 w-3" /> Dejar: {dropoffs.map((c) => `${c.quantity} ${c.unit} ${c.description}${c.notes ? ` (${c.notes})` : ""}`).join(" · ")}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
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

          {/* APROBADO: se asigna un conductor para pasar a CONFIRMADO - el camión ya viene
              con él (es el que maneja fijo), no se elige por separado. La proveedora
              despacha con su propia flota; la empresa cliente, con la suya (si tiene). */}
          {canConfirm && route.status === "APROBADO" && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={driverId}
                  onChange={setDriverId}
                  placeholder="Conductor..."
                  options={assignableDrivers.map((d) => ({ value: d.id, label: `${d.name ?? "-"} · ${d.vehiclePlate}` }))}
                  className="min-w-[14rem]"
                />
                <button
                  disabled={!driverId}
                  onClick={() => action.mutate(() => api.post(`/routes/${id}/confirm`, { driverId }))}
                  className="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-bold text-slate-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar asignación
                </button>
              </div>
              {drivers && assignableDrivers.length === 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Ningún conductor disponible: necesita estar activo, con camión asignado y licencia vigente.
                </span>
              )}
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

          {/* Cancelar es decisión de la empresa cliente (es su pedido) - la proveedora solo ejecuta. */}
          {canApprove && !["TERMINADO", "CANCELADO", "RECHAZADO"].includes(route.status) && (
            <button
              onClick={() => action.mutate(() => api.post(`/routes/${id}/cancel`, {}))}
              className="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              Cancelar ruta
            </button>
          )}
        </div>

        {!["TERMINADO", "CANCELADO", "RECHAZADO"].includes(route.status) && (
          <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Describir incidencia (avería, tráfico, accidente...)"
                value={incidentDescription}
                onChange={(e) => setIncidentDescription(e.target.value)}
                className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {incidentPhoto ? (
                <div className="flex items-center gap-2">
                  <img src={incidentPhoto} alt="Foto de la incidencia" className="h-10 w-14 rounded-md border border-slate-300 object-cover dark:border-slate-700" />
                  <button type="button" onClick={() => setIncidentPhoto(null)} className="text-xs text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300">
                    Quitar
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                  + Foto (opcional)
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      setIncidentPhotoError(null);
                      try {
                        setIncidentPhoto(await fileToDataUrl(e.target.files?.[0] ?? null));
                      } catch (err) {
                        setIncidentPhotoError(err instanceof Error ? err.message : "No se pudo leer la imagen");
                      }
                    }}
                  />
                </label>
              )}
              <button
                disabled={!incidentDescription}
                onClick={() =>
                  action.mutate(() =>
                    api
                      .post(`/routes/${id}/incidents`, { severity: "media", description: incidentDescription, photo: incidentPhoto ?? undefined })
                      .then(() => {
                        setIncidentDescription("");
                        setIncidentPhoto(null);
                      })
                  )
                }
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reportar incidencia
              </button>
            </div>
            {incidentPhotoError && <p className="text-xs text-red-500 dark:text-red-400">{incidentPhotoError}</p>}
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
