import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { Select } from "../components/Select";
import { Input } from "../components/Input";
import { DateTimePicker } from "../components/DateTimePicker";
import { DurationPicker } from "../components/DurationPicker";
import { useAuthStore } from "../store/auth";
import { isClientRole } from "@migalog/shared";
import type { RouteStopType } from "@migalog/shared";
import { formatDuration, digitsOnly, clampMin } from "../lib/number";
import { AlertIcon, DownIcon, CalendarIcon } from "../components/icons";

type ClientCompany = { id: string; name: string };

type SiteRef = { id: string; name: string; address: string | null; lat: number | null; lng: number | null };

type RouteTemplate = {
  id: string;
  name: string;
  originSite: SiteRef | null;
  destinationSite: SiteRef | null;
  stops: { siteId: string; site: SiteRef | null }[];
  estimatedMinutes: number | null;
};

type ProductRow = { quantity: string; unit: string; description: string };

type CargoGroup = {
  // Posiciones dentro de "itinerary" (0 = origen, la última = destino): dónde se recoge
  // (fijo, es el punto donde se agregó el grupo) y dónde se deja (se elige primero, antes de
  // cargar los productos).
  pickupIndex: number;
  dropoffIndex: number;
  rows: ProductRow[];
};

type RowErrors = { quantity?: string; unit?: string; description?: string };
type GroupErrors = { rows: RowErrors[] };
type PointErrors = { time?: string; cargo?: string };

// Solo para el <textarea> de notas - los <input> de texto ya usan el componente Input.
const textareaClass =
  "w-full rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";

const BoxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M21 8 12 3 3 8l9 5 9-5Z" />
    <path d="M3 8v8l9 5 9-5V8M12 13v8" />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const RouteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M8.2 6.8h5.3a3 3 0 0 1 3 3v.5a3 3 0 0 1-3 3H8a3 3 0 0 0-3 3v.2" />
  </svg>
);
const NoteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M6 3h9l5 5v13H6z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);

type FieldErrors = Partial<Record<"clientId" | "templateId" | "scheduledAt", string>>;

function stopColors(type: RouteStopType) {
  if (type === "origen") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (type === "destino") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
}

/**
 * Solicitar el despacho de una ruta ya acordada: el itinerario (origen/paradas/destino) sale
 * entero del catálogo de rutas frecuentes (ver RouteCatalog.tsx) - se eligió y aprobó ahí,
 * así que acá se muestra de solo lectura, nunca se vuelve a tipear ni se pueden
 * agregar/quitar paradas. No se muestran coordenadas GPS crudas ni el valor acordado de la
 * ruta - son datos internos, no algo que necesite ver quien pide el despacho.
 *
 * La carga se agrega DENTRO de cada punto del itinerario donde se recoge (nunca como una
 * sección aparte): primero se elige dónde se deja, después se cargan uno o más productos
 * (una ruta puede llevar varias cosas distintas desde el mismo punto). El camión nunca sale
 * vacío de un punto de recogida, así que cada punto (salvo el destino) exige al menos una
 * carga, y el tiempo de carga/descarga es obligatorio en todos - es la información que el
 * conductor va a ver en cada parada para saber qué recoger y qué dejar ahí.
 *
 * Un rol cliente_* siempre crea para su propia empresa (no elige, el backend la fuerza).
 * admin_empresa/super_admin no pertenecen a ninguna empresa cliente, así que eligen para
 * cuál están creando la solicitud.
 */
export default function NewRouteRequest() {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const needsClientPicker = role ? !isClientRole(role) : false;

  const { data: clientCompanies } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<ClientCompany[]>("/clients"),
    enabled: needsClientPicker,
  });
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState("");
  // Fecha y hora en hora LOCAL de quien pide la ruta (ej. Ecuador) - "YYYY-MM-DDTHH:mm", sin
  // offset ni "Z". Recién al enviar se convierte a UTC para guardar (ver submit()).
  const [scheduledAt, setScheduledAt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [cargoGroups, setCargoGroups] = useState<CargoGroup[]>([]);
  const [cargoErrors, setCargoErrors] = useState<GroupErrors[]>([]);
  const [pointErrors, setPointErrors] = useState<PointErrors[]>([]);
  // Tiempo de carga/descarga por punto del itinerario (mismo índice que "itinerary") -
  // arranca vacío, es obligatorio completarlo.
  const [serviceTimes, setServiceTimes] = useState<{ hours: string; minutes: string }[]>([]);

  const { data: templates } = useQuery({ queryKey: ["route-templates"], queryFn: () => api.get<RouteTemplate[]>("/route-templates") });
  const selectedTemplate = templates?.find((t) => t.id === templateId);

  const itinerary: { type: RouteStopType; site: SiteRef | null }[] = selectedTemplate
    ? [
        { type: "origen", site: selectedTemplate.originSite },
        ...selectedTemplate.stops.map((s) => ({ type: "parada" as RouteStopType, site: s.site })),
        { type: "destino", site: selectedTemplate.destinationSite },
      ]
    : [];
  const missingGps = itinerary.some((s) => s.site == null || s.site.lat == null || s.site.lng == null);
  const pointLabel = (i: number) => {
    const s = itinerary[i];
    if (!s) return "";
    return `${i + 1}. ${s.type.toUpperCase()} · ${s.site?.name ?? "-"}`;
  };

  // Cambiar de ruta invalida cualquier carga ya cargada (los índices apuntarían a otro
  // itinerario) - se arranca de cero. También se re-arma si cambia la CANTIDAD de paradas
  // del itinerario (no solo el id de la ruta): sin esto, si "templates" se refresca solo en
  // segundo plano con una ruta que ahora tiene más/menos paradas, estos arrays quedarían
  // desalineados con "itinerary" hasta que la persona cambiara de ruta a mano.
  useEffect(() => {
    setCargoGroups([]);
    setCargoErrors([]);
    setPointErrors(itinerary.map(() => ({})));
    setServiceTimes(itinerary.map(() => ({ hours: "", minutes: "" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, itinerary.length]);

  function updateServiceTime(index: number, hours: string, minutes: string) {
    setServiceTimes((prev) => prev.map((t, i) => (i === index ? { hours, minutes } : t)));
    setPointErrors((prev) => prev.map((pe, i) => (i === index ? { ...pe, time: undefined } : pe)));
  }

  // Se agrega siempre desde el punto donde se recoge - ese punto queda fijo, lo único que se
  // elige es dónde se deja (primero) y después los productos.
  function addCargoGroup(pickupIndex: number) {
    setCargoGroups((prev) => [...prev, { pickupIndex, dropoffIndex: itinerary.length - 1, rows: [{ quantity: "", unit: "", description: "" }] }]);
    setCargoErrors((prev) => [...prev, { rows: [{}] }]);
    setPointErrors((prev) => prev.map((pe, i) => (i === pickupIndex ? { ...pe, cargo: undefined } : pe)));
  }
  function removeCargoGroup(groupIndex: number) {
    setCargoGroups((prev) => prev.filter((_, i) => i !== groupIndex));
    setCargoErrors((prev) => prev.filter((_, i) => i !== groupIndex));
  }
  function updateGroupDropoff(groupIndex: number, dropoffIndex: number) {
    setCargoGroups((prev) => prev.map((g, i) => (i === groupIndex ? { ...g, dropoffIndex } : g)));
  }
  function addProductRow(groupIndex: number) {
    setCargoGroups((prev) => prev.map((g, i) => (i === groupIndex ? { ...g, rows: [...g.rows, { quantity: "", unit: "", description: "" }] } : g)));
    setCargoErrors((prev) => prev.map((g, i) => (i === groupIndex ? { rows: [...g.rows, {}] } : g)));
  }
  function removeProductRow(groupIndex: number, rowIndex: number) {
    setCargoGroups((prev) => prev.map((g, i) => (i === groupIndex ? { ...g, rows: g.rows.filter((_, ri) => ri !== rowIndex) } : g)));
    setCargoErrors((prev) => prev.map((g, i) => (i === groupIndex ? { rows: g.rows.filter((_, ri) => ri !== rowIndex) } : g)));
  }
  function updateProductRow(groupIndex: number, rowIndex: number, patch: Partial<ProductRow>) {
    setCargoGroups((prev) =>
      prev.map((g, i) => (i === groupIndex ? { ...g, rows: g.rows.map((r, ri) => (ri === rowIndex ? { ...r, ...patch } : r)) } : g))
    );
    setCargoErrors((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? { rows: g.rows.map((re, ri) => (ri === rowIndex ? { ...re, ...Object.fromEntries(Object.keys(patch).map((k) => [k, undefined] as const)) } : re)) }
          : g
      )
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors: FieldErrors = {};
    if (needsClientPicker && !clientId) errors.clientId = "Campo obligatorio";
    if (!templateId) errors.templateId = "Campo obligatorio";
    if (!scheduledAt) errors.scheduledAt = "Campo obligatorio";
    setFieldErrors(errors);

    // Cada punto exige tiempo de carga/descarga > 0, y cada punto que no sea el destino
    // exige al menos una carga (el camión nunca sale vacío de donde recoge).
    const newPointErrors: PointErrors[] = itinerary.map((_, i) => {
      const pe: PointErrors = {};
      const totalMin = Number(serviceTimes[i]?.hours || 0) * 60 + Number(serviceTimes[i]?.minutes || 0);
      if (totalMin <= 0) pe.time = "Obligatorio";
      const isLast = i === itinerary.length - 1;
      if (!isLast && !cargoGroups.some((g) => g.pickupIndex === i && g.rows.length > 0)) {
        pe.cargo = "Agregá al menos una carga en este punto";
      }
      return pe;
    });
    setPointErrors(newPointErrors);

    const newCargoErrors: GroupErrors[] = cargoGroups.map((g) => ({
      rows: g.rows.map((r) => {
        const re: RowErrors = {};
        if (!r.quantity || Number(r.quantity) < 1) re.quantity = "Obligatorio";
        if (!r.unit.trim()) re.unit = "Obligatorio";
        if (!r.description.trim()) re.description = "Obligatorio";
        return re;
      }),
    }));
    setCargoErrors(newCargoErrors);

    const hasPointErrors = newPointErrors.some((pe) => pe.time || pe.cargo);
    const hasRowErrors = newCargoErrors.some((g) => g.rows.some((re) => re.quantity || re.unit || re.description));

    if (Object.keys(errors).length > 0 || !selectedTemplate || missingGps || hasPointErrors || hasRowErrors) return;

    setError(null);
    setLoading(true);
    try {
      const body = {
        // Un rol cliente_* no manda clientId - el backend usa el suyo propio.
        clientId: needsClientPicker ? clientId : undefined,
        notes: notes || undefined,
        scheduledAt: new Date(scheduledAt).toISOString(),
        stops: itinerary.map((s, i) => ({
          type: s.type,
          label: s.site!.name,
          address: s.site!.address ?? "",
          lat: s.site!.lat!,
          lng: s.site!.lng!,
          serviceMinutes: Number(serviceTimes[i]?.hours || 0) * 60 + Number(serviceTimes[i]?.minutes || 0),
        })),
        cargoItems: cargoGroups.flatMap((g) =>
          g.rows.map((r) => ({
            quantity: Number(r.quantity),
            unit: r.unit.trim().toUpperCase(),
            description: r.description.trim().toUpperCase(),
            pickupStopIndex: g.pickupIndex,
            dropoffStopIndex: g.dropoffIndex,
          }))
        ),
      };
      const res = await api.post<{ route: { id: string } }>("/routes", body);
      navigate(`/rutas/${res.route.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la solicitud");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Nueva solicitud de ruta</h1>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          {needsClientPicker && (
            <div>
              <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Empresa cliente</label>
              <Select
                value={clientId}
                onChange={(v) => { setClientId(v); setFieldErrors((f) => ({ ...f, clientId: undefined })); }}
                options={(clientCompanies ?? []).map((cc) => ({ value: cc.id, label: cc.name }))}
                error={fieldErrors.clientId}
              />
            </div>
          )}

          <div>
            {/* La fecha/hora es el dato clave de la solicitud: un solo control (no calendario +
                horas/minutos sueltos), y siempre en la hora local de quien la carga. */}
            <label className="mb-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <CalendarIcon className="h-4 w-4" /> Fecha y hora programada
            </label>
            <DateTimePicker
              value={scheduledAt}
              onChange={(v) => { setScheduledAt(v); setFieldErrors((f) => ({ ...f, scheduledAt: undefined })); }}
              error={fieldErrors.scheduledAt}
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <RouteIcon /> Ruta del catálogo
            </label>
            <Select
              value={templateId}
              onChange={(v) => { setTemplateId(v); setFieldErrors((f) => ({ ...f, templateId: undefined })); }}
              placeholder="Elige una ruta..."
              options={(templates ?? []).map((t) => ({
                value: t.id,
                label: `${t.name}${t.estimatedMinutes != null ? ` · ${formatDuration(t.estimatedMinutes)}` : ""}`,
              }))}
              error={fieldErrors.templateId}
            />
            {templates && templates.length === 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Todavía no hay rutas aprobadas en el catálogo - hay que crear y aprobar una primero.</p>
            )}
          </div>
        </div>

        {selectedTemplate && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <RouteIcon />
              </span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{selectedTemplate.name}</span>
              {selectedTemplate.estimatedMinutes != null && (
                <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{formatDuration(selectedTemplate.estimatedMinutes)}</span>
              )}
            </div>

            {/* Itinerario de solo lectura (ya quedó fijo al aprobarse la ruta en el catálogo) -
                cada punto lleva adentro su tiempo de carga/descarga y lo que se recoge ahí. */}
            <ul className="flex flex-col gap-3">
              {itinerary.map((s, i) => {
                const noGps = s.site == null || s.site.lat == null || s.site.lng == null;
                const groupsHere = cargoGroups.map((g, gi) => ({ g, gi })).filter(({ g }) => g.pickupIndex === i);
                const dropoffsHere = cargoGroups.filter((g) => g.dropoffIndex === i);
                const isLast = i === itinerary.length - 1;
                return (
                  <li key={i} className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stopColors(s.type)}`}>
                          {i + 1}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{s.site?.name ?? "-"}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${stopColors(s.type)}`}>{s.type}</span>
                          </div>
                          {s.site?.address && <div className="text-xs text-slate-500 dark:text-slate-400">{s.site.address}</div>}
                          {noGps && (
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <AlertIcon className="h-3.5 w-3.5 shrink-0" /> falta la ubicación exacta - cargala en Sitios antes de pedir esta ruta
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:shrink-0">
                        <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">Tiempo de carga/descarga</span>
                        <DurationPicker
                          hours={serviceTimes[i]?.hours ?? ""}
                          minutes={serviceTimes[i]?.minutes ?? ""}
                          onChange={(h, m) => updateServiceTime(i, h, m)}
                          error={pointErrors[i]?.time}
                          className="w-36"
                        />
                      </div>
                    </div>

                    <div className="ml-10 flex flex-col gap-2">
                      {dropoffsHere.length > 0 && (
                        <div className="flex items-start gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <DownIcon />
                          <span>
                            Se entrega acá:{" "}
                            {dropoffsHere
                              .flatMap((g) => g.rows.map((r) => `${r.quantity || "?"} ${r.unit || "-"} ${r.description || "-"}`))
                              .join(" · ")}
                          </span>
                        </div>
                      )}

                      {groupsHere.map(({ g, gi }) => (
                        <div key={gi} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                          <div className="flex items-end justify-between gap-2">
                            <div className="flex flex-1 flex-col gap-1">
                              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Se deja en</label>
                              <Select
                                value={String(g.dropoffIndex)}
                                onChange={(v) => updateGroupDropoff(gi, Number(v))}
                                options={itinerary.map((_, opt) => ({ value: String(opt), label: pointLabel(opt) })).filter((o) => Number(o.value) > i)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCargoGroup(gi)}
                              title="Quitar esta carga"
                              className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                            >
                              <XIcon />
                            </button>
                          </div>

                          <div className="flex flex-col gap-2">
                            {g.rows.map((row, ri) => (
                              <div key={ri} className="flex items-start gap-2">
                                <div className="grid flex-1 grid-cols-[1fr_1fr_2fr] gap-2">
                                  <Input
                                    label={ri === 0 ? "Cantidad" : undefined}
                                    type="number"
                                    min={1}
                                    placeholder="Cantidad"
                                    icon={<BoxIcon />}
                                    value={row.quantity}
                                    onChange={(e) => updateProductRow(gi, ri, { quantity: digitsOnly(e.target.value) })}
                                    onBlur={(e) => updateProductRow(gi, ri, { quantity: e.target.value ? clampMin(e.target.value, 1) : "" })}
                                    error={cargoErrors[gi]?.rows[ri]?.quantity}
                                  />
                                  <Input
                                    label={ri === 0 ? "Unidad" : undefined}
                                    placeholder="CAJAS, PALLETS..."
                                    value={row.unit}
                                    onChange={(e) => updateProductRow(gi, ri, { unit: e.target.value.toUpperCase() })}
                                    error={cargoErrors[gi]?.rows[ri]?.unit}
                                  />
                                  <Input
                                    label={ri === 0 ? "Descripción" : undefined}
                                    placeholder="Ej. ROSAS"
                                    value={row.description}
                                    onChange={(e) => updateProductRow(gi, ri, { description: e.target.value.toUpperCase() })}
                                    error={cargoErrors[gi]?.rows[ri]?.description}
                                  />
                                </div>
                                {g.rows.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeProductRow(gi, ri)}
                                    title="Quitar este producto"
                                    className={`shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700 ${ri === 0 ? "mt-5" : ""}`}
                                  >
                                    <XIcon />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => addProductRow(gi)}
                            className="self-start text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
                          >
                            + Agregar otro producto
                          </button>
                        </div>
                      ))}

                      {pointErrors[i]?.cargo && <p className="text-xs text-red-500 dark:text-red-400">{pointErrors[i]?.cargo}</p>}

                      {!isLast && (
                        <button
                          type="button"
                          onClick={() => addCargoGroup(i)}
                          className="self-start text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
                        >
                          + Agregar carga que se recoge acá
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <label className="mb-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <NoteIcon /> Notas (opcional)
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaClass} rows={2} />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <Button type="submit" disabled={loading} className="self-start">
          {loading ? "Creando..." : "Crear solicitud"}
        </Button>
      </form>
    </div>
  );
}
