import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import { useAuthStore } from "../store/auth";
import { isClientRole } from "@migalog/shared";

type RouteTemplate = {
  id: string;
  category: string | null;
  name: string;
  originLabel: string;
  destinationLabel: string;
  price: number | null;
  estimatedMinutes: number | null;
  status: "pendiente" | "aprobada" | "rechazada";
};

const inputClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const emptyForm = {
  category: "",
  name: "",
  originLabel: "",
  originAddress: "",
  originLat: "",
  originLng: "",
  destinationLabel: "",
  destinationAddress: "",
  destinationLat: "",
  destinationLng: "",
  price: "",
  estimatedMinutes: "",
};

/**
 * Catálogo de rutas frecuentes (tarifario): admin_empresa/coordinador/super_admin lo
 * mantienen (lo que crean queda aprobado directo) y revisan las propuestas pendientes de
 * las empresas cliente. Un rol cliente_* solo puede PROPONER una ruta nueva cuando no
 * encuentra la que necesita - queda pendiente hasta que la empresa proveedora la aprueba
 * con el precio acordado.
 */
export default function RouteCatalog() {
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "admin_empresa" || role === "coordinador" || role === "super_admin";
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: approved, isLoading } = useQuery({
    queryKey: ["route-templates", "aprobada"],
    queryFn: () => api.get<RouteTemplate[]>("/route-templates?status=aprobada"),
  });
  const { data: pending } = useQuery({
    queryKey: ["route-templates", "pendiente"],
    queryFn: () => api.get<RouteTemplate[]>("/route-templates?status=pendiente"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/route-templates", {
        category: form.category || undefined,
        name: form.name,
        originLabel: form.originLabel,
        originAddress: form.originAddress,
        originLat: Number(form.originLat),
        originLng: Number(form.originLng),
        destinationLabel: form.destinationLabel,
        destinationAddress: form.destinationAddress,
        destinationLat: Number(form.destinationLat),
        destinationLng: Number(form.destinationLng),
        price: form.price ? Number(form.price) : undefined,
        estimatedMinutes: form.estimatedMinutes ? Number(form.estimatedMinutes) : undefined,
      }),
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["route-templates"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  const approve = useMutation({
    mutationFn: ({ id, price, estimatedMinutes }: { id: string; price: number; estimatedMinutes?: number }) =>
      api.post(`/route-templates/${id}/approve`, { price, estimatedMinutes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-templates"] }),
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/route-templates/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["route-templates"] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Catálogo de rutas</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60"
      >
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {canManage ? "Agregar ruta al catálogo" : "Proponer una ruta nueva"}
        </h2>
        {!canManage && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Queda pendiente hasta que la empresa proveedora la apruebe con el precio acordado.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`col-span-2 ${inputClass}`} />
          <input required placeholder="Nombre (ej. ADUANA-CAYAMBE)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`col-span-2 ${inputClass}`} />
          <input required placeholder="Origen - etiqueta" value={form.originLabel} onChange={(e) => setForm({ ...form, originLabel: e.target.value })} className={inputClass} />
          <input required placeholder="Origen - dirección" value={form.originAddress} onChange={(e) => setForm({ ...form, originAddress: e.target.value })} className={inputClass} />
          <input required placeholder="Origen - lat" value={form.originLat} onChange={(e) => setForm({ ...form, originLat: e.target.value })} className={inputClass} />
          <input required placeholder="Origen - lng" value={form.originLng} onChange={(e) => setForm({ ...form, originLng: e.target.value })} className={inputClass} />
          <input required placeholder="Destino - etiqueta" value={form.destinationLabel} onChange={(e) => setForm({ ...form, destinationLabel: e.target.value })} className={inputClass} />
          <input required placeholder="Destino - dirección" value={form.destinationAddress} onChange={(e) => setForm({ ...form, destinationAddress: e.target.value })} className={inputClass} />
          <input required placeholder="Destino - lat" value={form.destinationLat} onChange={(e) => setForm({ ...form, destinationLat: e.target.value })} className={inputClass} />
          <input required placeholder="Destino - lng" value={form.destinationLng} onChange={(e) => setForm({ ...form, destinationLng: e.target.value })} className={inputClass} />
          {canManage && <input placeholder="Precio" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} />}
          <input placeholder="Tiempo estimado (min)" value={form.estimatedMinutes} onChange={(e) => setForm({ ...form, estimatedMinutes: e.target.value })} className={inputClass} />
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={create.isPending} className="self-start">
          {canManage ? "Agregar" : "Proponer"}
        </Button>
      </form>

      {canManage && pending && pending.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="border-b border-amber-300 px-4 py-3 dark:border-amber-800">
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Propuestas pendientes ({pending.length})</h2>
          </div>
          <ul className="divide-y divide-amber-200 dark:divide-amber-900">
            {pending.map((t) => (
              <PendingRow key={t.id} template={t} onApprove={(price, mins) => approve.mutate({ id: t.id, price, estimatedMinutes: mins })} onReject={() => reject.mutate(t.id)} />
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
                <th className="px-4 py-2 font-medium">Categoría</th>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Origen</th>
                <th className="px-4 py-2 font-medium">Destino</th>
                <th className="px-4 py-2 font-medium">Precio</th>
                <th className="px-4 py-2 font-medium">Min.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {approved.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.category}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.name}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.originLabel}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.destinationLabel}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.price != null ? `$${t.price}` : "-"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.estimatedMinutes ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PendingRow({ template, onApprove, onReject }: { template: RouteTemplate; onApprove: (price: number, minutes?: number) => void; onReject: () => void }) {
  const [price, setPrice] = useState(template.price != null ? String(template.price) : "");
  const [minutes, setMinutes] = useState(template.estimatedMinutes != null ? String(template.estimatedMinutes) : "");

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="text-sm text-amber-900 dark:text-amber-100">
        <span className="font-semibold">{template.name}</span> · {template.originLabel} → {template.destinationLabel}
      </div>
      <div className="flex items-center gap-2">
        <input placeholder="Precio acordado" value={price} onChange={(e) => setPrice(e.target.value)} className={`w-28 ${inputClass}`} />
        <input placeholder="Min." value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`w-20 ${inputClass}`} />
        <button
          disabled={!price}
          onClick={() => onApprove(Number(price), minutes ? Number(minutes) : undefined)}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aprobar
        </button>
        <button onClick={onReject} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
          Rechazar
        </button>
      </div>
    </li>
  );
}
