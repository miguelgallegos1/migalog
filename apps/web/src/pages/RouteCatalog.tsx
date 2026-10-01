import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { DatePicker } from "../components/DatePicker";
import { DurationPicker } from "../components/DurationPicker";
import { Modal } from "../components/Modal";
import { RowActionsMenu } from "../components/RowActionsMenu";
import { useAuthStore } from "../store/auth";
import { digitsOnly, clampMin, formatDuration } from "../lib/number";
import { fetchRouteDistanceKm } from "../lib/mapbox";
import { PlusIcon, CheckIcon, XIcon, CheckCircleIcon, AlertIcon } from "../components/icons";

type SiteRef = { id: string; name: string; company: string; lat: number | null; lng: number | null };

type RouteTemplate = {
  id: string;
  name: string;
  effectiveDate: string;
  billingSite: SiteRef | null;
  originSite: SiteRef | null;
  destinationSite: SiteRef | null;
  stops: { siteId: string; price: number | null; site: SiteRef | null }[];
  price: number | null;
  estimatedMinutes: number | null;
  distanceKm: number | null;
  status: "pendiente" | "aprobada" | "rechazada";
  active: boolean;
};

type StopForm = { siteId: string; price: string };

type FormState = {
  effectiveDate: string;
  billingSiteId: string;
  originSiteId: string;
  stops: StopForm[];
  destinationSiteId: string;
  price: string;
  // Tiempo estimado en horas + minutos por separado (no un solo campo de "minutos" en el
  // que sea fácil confundirse y escribir la duración total en la unidad equivocada).
  timeHours: string;
  timeMinutes: string;
};

const EMPTY_FORM: FormState = { effectiveDate: "", billingSiteId: "", originSiteId: "", stops: [], destinationSiteId: "", price: "", timeHours: "", timeMinutes: "" };

// Velocidad promedio asumida para estimar el tiempo de recorrido a partir de la distancia
// (transporte de carga, con paradas incluidas) - es un punto de partida, el campo sigue
// siendo editable a mano por si la ruta real es más lenta/rápida.
const AVERAGE_SPEED_KMH = 50;

type FieldErrors = Partial<Record<"effectiveDate" | "billingSiteId" | "originSiteId" | "destinationSiteId" | "price" | "time", string>>;

type StopErrors = { site: string; price: string };

/** Todos los campos son obligatorios, incluida cada parada intermedia que ya se agregó (sitio Y valor del tramo). */
function validate(form: FormState): { errors: FieldErrors; stopErrors: StopErrors[] } {
  const errors: FieldErrors = {};
  if (!form.effectiveDate) errors.effectiveDate = "Campo obligatorio";
  if (!form.billingSiteId) errors.billingSiteId = "Campo obligatorio";
  if (!form.originSiteId) errors.originSiteId = "Campo obligatorio";
  if (!form.destinationSiteId) errors.destinationSiteId = "Campo obligatorio";
  if (!form.price) errors.price = "Campo obligatorio";
  if (!form.timeHours) errors.time = "Campo obligatorio";
  const stopErrors = form.stops.map((s) => ({
    site: s.siteId ? "" : "Campo obligatorio",
    price: s.price ? "" : "Campo obligatorio",
  }));
  return { errors, stopErrors };
}

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);
const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);
const DollarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M12 2v20M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.5-5 3.5S9.2 10 12 10s5 1.5 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
  </svg>
);

/**
 * Catálogo de rutas frecuentes (tarifario): nace SIEMPRE del lado del cliente - un rol
 * cliente_* la CREA (queda pendiente) cuando no encuentra la que necesita, eligiendo sitio
 * de facturación, origen, paradas intermedias y destino de su tabla de Sitios (ver
 * pages/Sites.tsx). Queda pendiente hasta que la empresa proveedora la revisa y aprueba con
 * el precio acordado (o la rechaza) - la proveedora no crea entradas directo, solo concilia.
 */
export default function RouteCatalog() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "admin_empresa" || role === "coordinador" || role === "super_admin";
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [stopErrors, setStopErrors] = useState<StopErrors[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);

  const { data: sites } = useQuery({ queryKey: ["sites"], queryFn: () => api.get<SiteRef[]>("/sites"), enabled: !canManage });
  // Memoizado: antes se reconstruían en cada render (cada tecla tipeada en cualquier campo
  // del formulario), incluido un Map nuevo, solo para volver a filtrar la misma lista de
  // sitios - referencia estable también permite que el efecto de distancia (más abajo) la
  // use como dependencia sin recalcular de más.
  const siteOptions = useMemo(() => (sites ?? []).map((s) => ({ value: s.id, label: s.name })), [sites]);
  const siteById = useMemo(() => new Map((sites ?? []).map((s) => [s.id, s] as const)), [sites]);

  // Un mismo sitio no puede aparecer dos veces en el itinerario (origen/paradas/destino) -
  // evita rutas sin sentido como "Cayambe-Cayambe". Se compara por NOMBRE (no por id): puede
  // haber dos registros de sitio distintos con el mismo nombre, y para quien arma la ruta
  // eso sigue siendo "el mismo lugar". Cada combobox se filtra contra los elegidos en los
  // OTROS, pero deja pasar su propio valor actual (si no, se auto-ocultaría).
  const usedSiteIds = [form.originSiteId, ...form.stops.map((s) => s.siteId), form.destinationSiteId].filter(Boolean);
  const usedSiteNames = usedSiteIds.map((id) => siteById.get(id)?.name).filter((n): n is string => !!n);
  function siteOptionsExcept(currentValue: string) {
    return siteOptions.filter((o) => o.value === currentValue || !usedSiteNames.includes(o.label));
  }


  // Distancia automática (Mapbox Directions): se recalcula sola cada vez que cambia el
  // itinerario completo, siempre que todos los puntos tengan GPS cargado - si a alguno le
  // falta, no bloquea nada, simplemente no se muestra distancia.
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const itineraryKey = [form.originSiteId, ...form.stops.map((s) => s.siteId), form.destinationSiteId].join("|");
  // Mientras esto sea true, el tiempo estimado se recalcula solo a partir de la distancia -
  // se apaga en cuanto la persona toca el DurationPicker a mano (ahí gana su valor) o al
  // corregir una propuesta ya rechazada (ahí ya trae su propio tiempo guardado).
  const timeAutoRef = useRef(true);

  useEffect(() => {
    const ids = [form.originSiteId, ...form.stops.map((s) => s.siteId), form.destinationSiteId];
    if (ids.some((id) => !id)) {
      setDistanceKm(null);
      return;
    }
    const points = ids.map((id) => siteById.get(id)).filter((s): s is SiteRef => !!s && s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
    if (points.length !== ids.length) {
      setDistanceKm(null);
      return;
    }
    let cancelled = false;
    setDistanceLoading(true);
    fetchRouteDistanceKm(points).then((km) => {
      if (!cancelled) {
        setDistanceKm(km);
        setDistanceLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // "siteById" ahora es estable (useMemo) - antes se omitía de las deps porque era un Map
    // nuevo en cada render, lo que hacía que este efecto nunca viera coordenadas GPS
    // recién cargadas en un sitio ya elegido hasta que cambiara el itinerario.
  }, [itineraryKey, siteById]);

  // Estimación automática de tiempo a partir de la distancia recién calculada - solo mientras
  // nadie haya tocado el campo de tiempo a mano. Si se borra un combobox del itinerario (la
  // distancia vuelve a null), el tiempo estimado también se limpia - si no, queda un valor
  // viejo dando vueltas que ya no corresponde a nada.
  useEffect(() => {
    if (!timeAutoRef.current) return;
    if (distanceKm == null) {
      setForm((prev) => ({ ...prev, timeHours: "", timeMinutes: "" }));
      return;
    }
    const totalMinutes = Math.round((distanceKm / AVERAGE_SPEED_KMH) * 60);
    setForm((prev) => ({ ...prev, timeHours: String(Math.floor(totalMinutes / 60)), timeMinutes: String(totalMinutes % 60).padStart(2, "0") }));
    setFieldErrors((f) => ({ ...f, time: undefined }));
  }, [distanceKm]);

  // staleTime: las tres listas ya se refrescan a demanda con invalidateQueries() después de
  // cada mutación (crear/aprobar/rechazar/corregir/eliminar) - sin esto, además, TanStack
  // Query las volvía a pedir solas en cada remount/foco de ventana aunque nada hubiera
  // cambiado.
  const { data: approved, isLoading } = useQuery({
    queryKey: ["route-templates", "aprobada"],
    queryFn: () => api.get<RouteTemplate[]>("/route-templates?status=aprobada"),
    staleTime: 30_000,
  });
  const { data: pending } = useQuery({
    queryKey: ["route-templates", "pendiente"],
    queryFn: () => api.get<RouteTemplate[]>("/route-templates?status=pendiente"),
    staleTime: 30_000,
  });
  const { data: rejected } = useQuery({
    queryKey: ["route-templates", "rechazada"],
    queryFn: () => api.get<RouteTemplate[]>("/route-templates?status=rechazada"),
    staleTime: 30_000,
  });

  // Cuando no es null, el modal está corrigiendo esta propuesta rechazada (en vez de crear
  // una nueva) - el submit reescribe el mismo registro y lo vuelve a dejar "pendiente".
  const [resubmitId, setResubmitId] = useState<string | null>(null);

  function openModal() {
    setResubmitId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setStopErrors([]);
    setError(null);
    setJustCreated(false);
    setDistanceKm(null);
    timeAutoRef.current = true;
    setModalOpen(true);
  }

  function openCorrect(t: RouteTemplate) {
    const stopsPrice = t.stops.reduce((sum, s) => sum + (s.price ?? 0), 0);
    setResubmitId(t.id);
    setForm({
      effectiveDate: t.effectiveDate,
      billingSiteId: t.billingSite?.id ?? "",
      originSiteId: t.originSite?.id ?? "",
      stops: t.stops.map((s) => ({ siteId: s.siteId, price: s.price != null ? String(s.price) : "" })),
      destinationSiteId: t.destinationSite?.id ?? "",
      // "form.price" es el tramo final - se recupera restando los tramos de las paradas al total guardado.
      price: t.price != null ? String(Math.max(0, t.price - stopsPrice)) : "",
      timeHours: t.estimatedMinutes != null ? String(Math.floor(t.estimatedMinutes / 60)) : "",
      timeMinutes: t.estimatedMinutes != null ? String(t.estimatedMinutes % 60).padStart(2, "0") : "",
    });
    setFieldErrors({});
    setStopErrors([]);
    setError(null);
    setJustCreated(false);
    setDistanceKm(t.distanceKm);
    timeAutoRef.current = false;
    setModalOpen(true);
  }

  function setStopSite(index: number, siteId: string) {
    setForm((prev) => ({ ...prev, stops: prev.stops.map((s, i) => (i === index ? { ...s, siteId } : s)) }));
  }
  function setStopPrice(index: number, price: string) {
    setForm((prev) => ({ ...prev, stops: prev.stops.map((s, i) => (i === index ? { ...s, price } : s)) }));
  }
  function addStop() {
    setForm((prev) => ({ ...prev, stops: [...prev.stops, { siteId: "", price: "" }] }));
  }
  function removeStop(index: number) {
    setForm((prev) => ({ ...prev, stops: prev.stops.filter((_, i) => i !== index) }));
    setStopErrors((prev) => prev.filter((_, i) => i !== index));
  }

  // El valor total de la ruta no se tipea aparte: es la suma de los tramos (cada parada
  // trae el valor del tramo que termina ahí, y "form.price" es el valor del tramo final -
  // última parada al destino, o directo origen-destino si no hay paradas).
  const totalPrice = form.stops.reduce((sum, s) => sum + (Number(s.price) || 0), 0) + (Number(form.price) || 0);

  function buildPayload() {
    return {
      effectiveDate: form.effectiveDate,
      billingSiteId: form.billingSiteId,
      originSiteId: form.originSiteId,
      stops: form.stops.filter((s) => s.siteId).map((s) => ({ siteId: s.siteId, price: s.price ? Number(s.price) : undefined })),
      destinationSiteId: form.destinationSiteId,
      price: totalPrice || undefined,
      estimatedMinutes: form.timeHours || form.timeMinutes ? Number(form.timeHours || 0) * 60 + Number(form.timeMinutes || 0) : undefined,
      distanceKm: distanceKm ?? undefined,
    };
  }

  const create = useMutation({
    mutationFn: () => api.post("/route-templates", buildPayload()),
    onSuccess: () => {
      setError(null);
      setJustCreated(true);
      queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  const resubmit = useMutation({
    mutationFn: () => api.post(`/route-templates/${resubmitId}/resubmit`, buildPayload()),
    onSuccess: () => {
      setError(null);
      setJustCreated(true);
      queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { errors, stopErrors: stopErrs } = validate(form);
    setFieldErrors(errors);
    setStopErrors(stopErrs);
    if (Object.keys(errors).length > 0 || stopErrs.some((e) => e.site || e.price)) return;
    if (resubmitId) resubmit.mutate();
    else create.mutate();
  }

  const approve = useMutation({
    mutationFn: ({ id, price, estimatedMinutes }: { id: string; price: number; estimatedMinutes?: number }) =>
      api.post(`/route-templates/${id}/approve`, { price, estimatedMinutes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-templates"] }),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/route-templates/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-templates"] }),
  });

  // --- Gestión de una ruta ya aprobada: editar (fecha/valor/tiempo), activar/desactivar, eliminar ---
  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/route-templates/${id}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-templates"] }),
  });

  const [editTarget, setEditTarget] = useState<RouteTemplate | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editMins, setEditMins] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  function openEditTemplate(t: RouteTemplate) {
    setEditTarget(t);
    setEditDate(t.effectiveDate);
    setEditPrice(t.price != null ? String(t.price) : "");
    setEditHours(t.estimatedMinutes != null ? String(Math.floor(t.estimatedMinutes / 60)) : "");
    setEditMins(t.estimatedMinutes != null ? String(t.estimatedMinutes % 60).padStart(2, "0") : "");
    setEditError(null);
  }

  const updateTemplate = useMutation({
    mutationFn: () =>
      api.patch(`/route-templates/${editTarget!.id}`, {
        effectiveDate: editDate || undefined,
        price: editPrice ? Number(editPrice) : undefined,
        estimatedMinutes: editHours || editMins ? Number(editHours || 0) * 60 + Number(editMins || 0) : undefined,
      }),
    onSuccess: () => {
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
    onError: (err) => setEditError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  const [deleteTarget, setDeleteTarget] = useState<RouteTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const removeTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/route-templates/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
    onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Catálogo de rutas</h1>
        {/* Nace del lado del cliente: la proveedora nunca carga rutas directo, solo aprueba/rechaza abajo. */}
        {!canManage && (
          <Button onClick={openModal} className="flex items-center gap-1.5">
            <PlusIcon /> Crear nueva ruta
          </Button>
        )}
      </div>

      {pending && pending.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="border-b border-amber-300 px-4 py-3 dark:border-amber-800">
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {canManage ? `Propuestas pendientes (${pending.length})` : `Pendientes de aprobación (${pending.length})`}
            </h2>
          </div>
          <ul className="divide-y divide-amber-200 dark:divide-amber-900">
            {pending.map((t) =>
              canManage ? (
                <PendingRow key={t.id} template={t} onApprove={(price, mins) => approve.mutate({ id: t.id, price, estimatedMinutes: mins })} onReject={() => reject.mutate(t.id)} />
              ) : (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
                  <span>
                    <span className="font-semibold">{t.name}</span> · {t.effectiveDate}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">Esperando aprobación</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(t);
                      }}
                      className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/50"
                    >
                      Eliminar
                    </button>
                  </span>
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {rejected && rejected.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20">
          <div className="border-b border-red-200 px-4 py-3 dark:border-red-900">
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-300">Rechazadas ({rejected.length})</h2>
          </div>
          <ul className="divide-y divide-red-100 dark:divide-red-900/50">
            {rejected.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-red-900 dark:text-red-100">
                <span>
                  <span className="font-semibold">{t.name}</span> · {t.effectiveDate}
                </span>
                {!canManage && (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCorrect(t)}
                      className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                    >
                      Corregir y reenviar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(t);
                      }}
                      className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/40"
                    >
                      Eliminar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !approved || approved.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Todavía no hay rutas aprobadas en el catálogo.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Ruta</th>
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-4 py-2 font-medium">Sitio de facturación</th>
                <th className="px-4 py-2 font-medium">Valor</th>
                <th className="px-4 py-2 font-medium">Tiempo</th>
                <th className="px-4 py-2 font-medium">Distancia</th>
                {canManage && <th className="px-4 py-2 font-medium">Activa</th>}
                {canManage && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {approved.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.name}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.effectiveDate}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.billingSite ? `${t.billingSite.name} (${t.billingSite.company})` : "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.price != null ? `$${t.price}` : "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.estimatedMinutes != null ? formatDuration(t.estimatedMinutes) : "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.distanceKm != null ? `${t.distanceKm.toFixed(1)} km` : "-"}</td>
                  {canManage && <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.active ? "Sí" : "No"}</td>}
                  {canManage && (
                    <td className="px-4 py-2">
                      <RowActionsMenu
                        actions={[
                          { label: "Editar", onClick: () => openEditTemplate(t) },
                          { label: t.active ? "Desactivar" : "Activar", onClick: () => toggleActive.mutate({ id: t.id, active: !t.active }) },
                          { label: "Eliminar", danger: true, onClick: () => { setDeleteError(null); setDeleteTarget(t); } },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal title={justCreated ? "Ruta enviada" : resubmitId ? "Corregir ruta" : "Crear nueva ruta"} onClose={() => setModalOpen(false)}>
          {justCreated ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-emerald-500"><CheckCircleIcon /></span>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {resubmitId ? "Ruta corregida y reenviada." : "Ruta enviada."} Queda <strong>pendiente</strong> hasta que la empresa proveedora la revise y apruebe con el precio acordado.
              </p>
              <Button onClick={() => setModalOpen(false)} className="mt-1 flex items-center gap-1.5">
                <CheckIcon /> Cerrar
              </Button>
            </div>
          ) : (
          <form noValidate onSubmit={submit} className="flex flex-col gap-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Todos los campos son obligatorios. Queda pendiente hasta que la empresa proveedora la apruebe con el precio acordado.</p>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Fecha</label>
              <DatePicker
                value={form.effectiveDate}
                onChange={(v) => { setForm({ ...form, effectiveDate: v }); setFieldErrors((f) => ({ ...f, effectiveDate: undefined })); }}
                error={fieldErrors.effectiveDate}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Sitio de facturación</label>
              <Select
                value={form.billingSiteId}
                onChange={(v) => { setForm({ ...form, billingSiteId: v }); setFieldErrors((f) => ({ ...f, billingSiteId: undefined })); }}
                options={siteOptions}
                icon={<ReceiptIcon />}
                error={fieldErrors.billingSiteId}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">Origen</label>
                <Select
                  value={form.originSiteId}
                  onChange={(v) => { setForm({ ...form, originSiteId: v }); setFieldErrors((f) => ({ ...f, originSiteId: undefined })); }}
                  options={siteOptionsExcept(form.originSiteId)}
                  icon={<MapPinIcon />}
                  error={fieldErrors.originSiteId}
                />
              </div>

              {form.stops.map((stop, i) => (
                <div key={i} className="flex flex-col gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <label className="text-xs text-slate-500 dark:text-slate-400">Parada {i + 1}</label>
                      <Select
                        value={stop.siteId}
                        onChange={(v) => { setStopSite(i, v); setStopErrors((prev) => prev.map((e, idx) => (idx === i ? { ...e, site: "" } : e))); }}
                        options={siteOptionsExcept(stop.siteId)}
                        icon={<MapPinIcon />}
                        error={stopErrors[i]?.site}
                      />
                    </div>
                    <Input
                      label="Valor tramo"
                      type="number"
                      min={1}
                      placeholder="Valor"
                      icon={<DollarIcon />}
                      value={stop.price}
                      onChange={(e) => { setStopPrice(i, digitsOnly(e.target.value)); setStopErrors((prev) => prev.map((err, idx) => (idx === i ? { ...err, price: "" } : err))); }}
                      onBlur={(e) => setStopPrice(i, e.target.value ? clampMin(e.target.value, 1) : "")}
                      error={stopErrors[i]?.price}
                      containerClassName="w-24"
                    />
                    <button type="button" onClick={() => removeStop(i)} className="mt-5 shrink-0 text-xs text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300">
                      Quitar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Valor del tramo hasta esta parada (desde el punto anterior).</p>
                </div>
              ))}

              <button type="button" onClick={addStop} className="self-start text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300">
                + Agregar parada intermedia
              </button>

              <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs text-slate-500 dark:text-slate-400">Destino</label>
                    <Select
                      value={form.destinationSiteId}
                      onChange={(v) => { setForm({ ...form, destinationSiteId: v }); setFieldErrors((f) => ({ ...f, destinationSiteId: undefined })); }}
                      options={siteOptionsExcept(form.destinationSiteId)}
                      icon={<MapPinIcon />}
                      error={fieldErrors.destinationSiteId}
                    />
                  </div>
                  <Input
                    label="Valor tramo"
                    type="number"
                    min={1}
                    placeholder="Valor"
                    icon={<DollarIcon />}
                    value={form.price}
                    onChange={(e) => { setForm({ ...form, price: digitsOnly(e.target.value) }); setFieldErrors((f) => ({ ...f, price: undefined })); }}
                    onBlur={(e) => setForm((f) => ({ ...f, price: clampMin(e.target.value, 1) }))}
                    error={fieldErrors.price}
                    containerClassName="w-24"
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Valor del tramo final ({form.stops.length > 0 ? "última parada → destino" : "origen → destino"}).
                </p>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {distanceLoading
                  ? "Calculando distancia..."
                  : distanceKm != null
                    ? `Distancia estimada: ${distanceKm.toFixed(1)} km`
                    : "La distancia se calcula sola cuando origen, paradas y destino tienen GPS cargado."}
              </p>
            </div>

            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Valor total de la ruta: ${totalPrice}</p>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Tiempo estimado</label>
              <DurationPicker
                hours={form.timeHours}
                minutes={form.timeMinutes}
                onChange={(h, m) => {
                  timeAutoRef.current = false;
                  setForm({ ...form, timeHours: h, timeMinutes: m });
                  setFieldErrors((f) => ({ ...f, time: undefined }));
                }}
                error={fieldErrors.time}
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {timeAutoRef.current && distanceKm != null ? "Calculado según la distancia - lo podés ajustar a mano." : "Podés ajustarlo a mano."}
              </p>
            </div>

            {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || resubmit.isPending} className="flex items-center gap-1.5">
                <CheckIcon /> {create.isPending || resubmit.isPending ? "Guardando..." : resubmitId ? "Reenviar" : "Crear"}
              </Button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {editTarget && (
        <Modal title="Editar ruta" onClose={() => setEditTarget(null)}>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              updateTemplate.mutate();
            }}
            className="flex flex-col gap-5"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong>{editTarget.name}</strong> - el itinerario (origen/paradas/destino) y el sitio de facturación no se editan acá, son lo que pidió la empresa cliente.
            </p>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Fecha</label>
              <DatePicker value={editDate} onChange={setEditDate} />
            </div>

            <Input label="Valor" type="number" min={1} placeholder="Ingrese el valor" icon={<DollarIcon />} value={editPrice} onChange={(e) => setEditPrice(digitsOnly(e.target.value))} onBlur={(e) => setEditPrice(clampMin(e.target.value, 1))} />

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 dark:text-slate-400">Tiempo estimado</label>
              <DurationPicker hours={editHours} minutes={editMins} onChange={(h, m) => { setEditHours(h); setEditMins(m); }} />
            </div>

            {editError && <p className="text-sm text-red-500 dark:text-red-400">{editError}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setEditTarget(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="submit" disabled={updateTemplate.isPending} className="flex items-center gap-1.5">
                <CheckIcon /> {updateTemplate.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Eliminar ruta" onClose={() => setDeleteTarget(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-red-500"><AlertIcon className="h-10 w-10" /></span>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              ¿Eliminar <strong>{deleteTarget.name}</strong> del catálogo? Esta acción no se puede deshacer.
            </p>
            {deleteError && <p className="text-sm text-red-500 dark:text-red-400">{deleteError}</p>}
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button type="button" variant="danger" disabled={removeTemplate.isPending} onClick={() => removeTemplate.mutate(deleteTarget.id)} className="flex items-center gap-1.5">
                <CheckIcon /> {removeTemplate.isPending ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


function PendingRow({ template, onApprove, onReject }: { template: RouteTemplate; onApprove: (price: number, minutes?: number) => void; onReject: () => void }) {
  const [price, setPrice] = useState(template.price != null ? String(template.price) : "");
  const [hours, setHours] = useState(template.estimatedMinutes != null ? String(Math.floor(template.estimatedMinutes / 60)) : "");
  const [mins, setMins] = useState(template.estimatedMinutes != null ? String(template.estimatedMinutes % 60).padStart(2, "0") : "");
  // Aprobar/rechazar quedan un click atrás de un popup de confirmación - antes se ejecutaban
  // directo al tocar el botón, sin ningún aviso.
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);

  function confirmApprove() {
    onApprove(Number(price), hours || mins ? Number(hours || 0) * 60 + Number(mins || 0) : undefined);
    setConfirming(null);
  }
  function confirmReject() {
    onReject();
    setConfirming(null);
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="text-sm text-amber-900 dark:text-amber-100">
        <span className="font-semibold">{template.name}</span> · {template.effectiveDate}
        {template.billingSite && ` · Factura: ${template.billingSite.name} (${template.billingSite.company})`}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          placeholder="Precio acordado"
          value={price}
          onChange={(e) => setPrice(digitsOnly(e.target.value))}
          onBlur={(e) => setPrice(clampMin(e.target.value, 1))}
          containerClassName="w-28"
        />
        <DurationPicker hours={hours} minutes={mins} onChange={(h, m) => { setHours(h); setMins(m); }} className="w-40" />
        <button
          disabled={!price}
          onClick={() => setConfirming("approve")}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aprobar
        </button>
        <button onClick={() => setConfirming("reject")} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
          Rechazar
        </button>
      </div>

      {confirming && (
        <Modal title={confirming === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"} onClose={() => setConfirming(null)}>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className={confirming === "approve" ? "text-emerald-500" : "text-red-500"}><AlertIcon className="h-10 w-10" /></span>
            {confirming === "approve" ? (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                ¿Aprobar <strong>{template.name}</strong> con valor <strong>${price}</strong>
                {(hours || mins) && <> y tiempo estimado <strong>{Number(hours || 0)}h {String(mins || "00").padStart(2, "0")}min</strong></>}?
                Va a quedar visible en el catálogo para nuevas solicitudes.
              </p>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                ¿Rechazar <strong>{template.name}</strong>? La empresa cliente va a tener que volver a proponerla si la sigue necesitando.
              </p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => setConfirming(null)} className="flex items-center gap-1.5">
                <XIcon /> Cancelar
              </Button>
              <Button
                type="button"
                variant={confirming === "approve" ? "primary" : "danger"}
                onClick={confirming === "approve" ? confirmApprove : confirmReject}
                className="flex items-center gap-1.5"
              >
                <CheckIcon /> {confirming === "approve" ? "Aprobar" : "Rechazar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </li>
  );
}
