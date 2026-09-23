import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { Select } from "../components/Select";
import { DatePicker } from "../components/DatePicker";
import { useAuthStore } from "../store/auth";
import { isClientRole } from "@migalog/shared";
import type { RouteStopType } from "@migalog/shared";

type ClientCompany = { id: string; name: string };

type RouteTemplate = {
  id: string;
  category: string | null;
  name: string;
  originLabel: string;
  originAddress: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  price: number | null;
  estimatedMinutes: number | null;
};

type StopForm = {
  type: RouteStopType;
  label: string;
  address: string;
  lat: string;
  lng: string;
  cargoQuantity: string;
  cargoUnit: string;
  cargoDescription: string;
};

const emptyStop = (type: RouteStopType): StopForm => ({
  type,
  label: "",
  address: "",
  lat: "",
  lng: "",
  cargoQuantity: "",
  cargoUnit: "",
  cargoDescription: "",
});
const inputClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h).padStart(2, "0"), label: String(h).padStart(2, "0") }));
const MINUTE_OPTIONS = ["00", "15", "30", "45"].map((m) => ({ value: m, label: m }));

/**
 * Formulario para crear una ruta con paradas dinámicas: siempre hay un origen y un destino
 * fijos, y se pueden agregar/quitar paradas intermedias entre medio - el orden en que quedan
 * en el array es el orden real en que el conductor las va a marcar. Cada parada puede llevar
 * su propio detalle de carga (cantidad/unidad/descripción).
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
  const [stops, setStops] = useState<StopForm[]>([emptyStop("origen"), emptyStop("destino")]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledHour, setScheduledHour] = useState("");
  const [scheduledMinute, setScheduledMinute] = useState("");

  // Catálogo de rutas frecuentes: un atajo, no una restricción - al elegir una acá se
  // autocompletan origen y destino, pero las paradas intermedias se siguen cargando a mano
  // y también se puede ignorar el catálogo y cargar todo manual como antes.
  const { data: templates } = useQuery({ queryKey: ["route-templates"], queryFn: () => api.get<RouteTemplate[]>("/route-templates") });
  const selectedTemplate = templates?.find((t) => t.id === templateId);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates?.find((t) => t.id === id);
    if (!template) return;
    setStops((prev) => {
      const middle = prev.slice(1, -1);
      return [
        { ...prev[0]!, type: "origen", label: template.originLabel, address: template.originAddress, lat: String(template.originLat), lng: String(template.originLng) },
        ...middle,
        { ...prev[prev.length - 1]!, type: "destino", label: template.destinationLabel, address: template.destinationAddress, lat: String(template.destinationLat), lng: String(template.destinationLng) },
      ];
    });
  }

  function updateStop(index: number, patch: Partial<StopForm>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  // Nueva parada intermedia siempre se inserta justo antes del destino, para que el
  // destino se mantenga como la última parada del array (y por lo tanto de la ruta).
  function addStop() {
    setStops((prev) => {
      const withoutDestino = prev.slice(0, -1);
      const destino = prev[prev.length - 1]!;
      return [...withoutDestino, emptyStop("parada"), destino];
    });
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const scheduledAt =
        scheduledDate && scheduledHour && scheduledMinute
          ? new Date(`${scheduledDate}T${scheduledHour}:${scheduledMinute}:00`).toISOString()
          : undefined;
      const body = {
        // Un rol cliente_* no manda clientId - el backend usa el suyo propio.
        clientId: needsClientPicker ? clientId : undefined,
        notes: notes || undefined,
        scheduledAt,
        stops: stops.map((s) => ({
          type: s.type,
          label: s.label,
          address: s.address,
          lat: Number(s.lat),
          lng: Number(s.lng),
          cargoQuantity: s.cargoQuantity ? Number(s.cargoQuantity) : undefined,
          cargoUnit: s.cargoUnit || undefined,
          cargoDescription: s.cargoDescription || undefined,
        })),
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
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Nueva solicitud de ruta</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {needsClientPicker && (
          <div>
            <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Empresa cliente</label>
            <Select
              required
              value={clientId}
              onChange={setClientId}
              options={(clientCompanies ?? []).map((cc) => ({ value: cc.id, label: cc.name }))}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Fecha y hora programada (opcional)</label>
          <div className="flex gap-2">
            <DatePicker value={scheduledDate} onChange={setScheduledDate} className="flex-1" />
            <Select value={scheduledHour} onChange={setScheduledHour} options={HOUR_OPTIONS} placeholder="HH" className="w-20" />
            <Select value={scheduledMinute} onChange={setScheduledMinute} options={MINUTE_OPTIONS} placeholder="MM" className="w-20" />
          </div>
        </div>

        {templates && templates.length > 0 && (
          <div>
            <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Ruta del catálogo (opcional, autocompleta origen/destino)</label>
            <Select
              value={templateId}
              onChange={applyTemplate}
              placeholder="Cargar manualmente..."
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.category ? `${t.category} - ` : ""}${t.name}${t.price != null ? ` ($${t.price})` : ""}${t.estimatedMinutes != null ? ` - ${t.estimatedMinutes} min` : ""}`,
              }))}
            />
            {selectedTemplate && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {selectedTemplate.originLabel} → {selectedTemplate.destinationLabel}
                {selectedTemplate.price != null ? ` · $${selectedTemplate.price}` : ""}
                {selectedTemplate.estimatedMinutes != null ? ` · ~${selectedTemplate.estimatedMinutes} min` : ""}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate-500 dark:text-slate-400">Paradas (en orden: origen, paradas intermedias, destino)</label>
            <button type="button" onClick={addStop} className="text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300">
              + Agregar parada intermedia
            </button>
          </div>
          {stops.map((stop, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {i + 1}. {stop.type}
                </span>
                {stop.type === "parada" && (
                  <button type="button" onClick={() => removeStop(i)} className="text-xs text-red-500 hover:text-red-400 dark:text-red-400 dark:hover:text-red-300">
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  placeholder="Etiqueta (ej. Bodega Central)"
                  value={stop.label}
                  onChange={(e) => updateStop(i, { label: e.target.value })}
                  className={`col-span-2 ${inputClass}`}
                />
                <input
                  required
                  placeholder="Dirección"
                  value={stop.address}
                  onChange={(e) => updateStop(i, { address: e.target.value })}
                  className={`col-span-2 ${inputClass}`}
                />
                <input required placeholder="Latitud" value={stop.lat} onChange={(e) => updateStop(i, { lat: e.target.value })} className={inputClass} />
                <input required placeholder="Longitud" value={stop.lng} onChange={(e) => updateStop(i, { lng: e.target.value })} className={inputClass} />
                <input
                  placeholder="Cant."
                  inputMode="numeric"
                  value={stop.cargoQuantity}
                  onChange={(e) => updateStop(i, { cargoQuantity: e.target.value.replace(/\D/g, "") })}
                  className={inputClass}
                />
                <input placeholder="Unidad (ej. CAJAS)" value={stop.cargoUnit} onChange={(e) => updateStop(i, { cargoUnit: e.target.value })} className={inputClass} />
                <input
                  placeholder="Descripción de la carga"
                  value={stop.cargoDescription}
                  onChange={(e) => updateStop(i, { cargoDescription: e.target.value })}
                  className={`col-span-2 ${inputClass}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Notas (opcional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`w-full ${inputClass}`} rows={2} />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <Button type="submit" disabled={loading} className="self-start">
          {loading ? "Creando..." : "Crear solicitud"}
        </Button>
      </form>
    </div>
  );
}
