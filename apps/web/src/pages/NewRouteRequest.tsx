import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import type { RouteStopType } from "@migalog/shared";

type Provider = { id: string; name: string };

type StopForm = { type: RouteStopType; label: string; address: string; lat: string; lng: string };

const emptyStop = (type: RouteStopType): StopForm => ({ type, label: "", address: "", lat: "", lng: "" });
const inputClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

/**
 * Formulario del solicitante para crear una ruta con paradas dinámicas: siempre hay un
 * origen y un destino fijos, y se pueden agregar/quitar paradas intermedias entre medio -
 * el orden en que quedan en el array es el orden real en que el conductor las va a marcar.
 */
export default function NewRouteRequest() {
  const navigate = useNavigate();
  const { data: providers } = useQuery({ queryKey: ["providers"], queryFn: () => api.get<Provider[]>("/providers") });
  const [providerId, setProviderId] = useState("");
  const [stops, setStops] = useState<StopForm[]>([emptyStop("origen"), emptyStop("destino")]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      const body = {
        providerId,
        notes: notes || undefined,
        stops: stops.map((s) => ({
          type: s.type,
          label: s.label,
          address: s.address,
          lat: Number(s.lat),
          lng: Number(s.lng),
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
        <div>
          <label className="mb-1 block text-sm text-slate-500 dark:text-slate-400">Empresa proveedora</label>
          <select required value={providerId} onChange={(e) => setProviderId(e.target.value)} className={`w-full ${inputClass}`}>
            <option value="">Seleccionar...</option>
            {providers?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

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
