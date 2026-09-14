import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";

type Tenant = { id: string; name: string; slug: string; active: boolean };

/** Pantalla exclusiva de super_admin: alta de nuevas empresas (tenants) y activar/desactivar las existentes. */
export default function Tenants() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastSetupToken, setLastSetupToken] = useState<string | null>(null);

  const { data: tenants, isLoading } = useQuery({ queryKey: ["tenants"], queryFn: () => api.get<Tenant[]>("/tenants") });

  const create = useMutation({
    // El backend crea el tenant Y su primer admin_empresa en un solo paso, devolviendo el
    // setupToken de una sola vez - acá lo mostramos para poder probar sin tener email real
    // conectado (en producción se lo mandaría al admin por correo, no se vería en pantalla).
    mutationFn: () => api.post<{ setupToken: string }>("/tenants", { name, slug, adminName, adminEmail }),
    onSuccess: (res) => {
      setLastSetupToken(res.setupToken);
      setError(null);
      setName("");
      setSlug("");
      setAdminName("");
      setAdminEmail("");
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo crear la empresa"),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/tenants/${id}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  const inputClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Empresas (tenants)</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Nombre de la empresa</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Slug</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="mi-empresa" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Nombre del admin</label>
          <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Email del admin</label>
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required className={inputClass} />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Crear empresa
        </Button>
      </form>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      {lastSetupToken && (
        <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
          Empresa creada. Token de configuración de contraseña para el admin (en producción va por email):
          <div className="mt-1 break-all rounded bg-white p-2 font-mono dark:bg-slate-900">{lastSetupToken}</div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
                <th className="px-4 py-2 font-medium">Slug</th>
                <th className="px-4 py-2 font-medium">Activa</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {tenants?.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.name}</td>
                  <td className="px-4 py-2 font-mono text-slate-500 dark:text-slate-400">{t.slug}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{t.active ? "Sí" : "No"}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive.mutate({ id: t.id, active: !t.active })}
                      className="text-xs font-semibold text-amber-600 hover:text-amber-500 dark:text-amber-400 dark:hover:text-amber-300"
                    >
                      {t.active ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
