import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";

type ClientCompany = { id: string; name: string };

/**
 * Empresas cliente (nivel 2): igual que crear un tenant, acá se crea la empresa Y su
 * primer cliente_admin en un solo paso - ninguna empresa debería quedar sin alguien que
 * pueda administrarla (invitar a su equipo, aprobar sus solicitudes).
 */
export default function Clients() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastSetupToken, setLastSetupToken] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => api.get<ClientCompany[]>("/clients") });

  const create = useMutation({
    mutationFn: () => api.post<{ setupToken: string }>("/clients", { name, adminName, adminEmail }),
    onSuccess: (res) => {
      setLastSetupToken(res.setupToken);
      setError(null);
      setName("");
      setAdminName("");
      setAdminEmail("");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo crear la empresa cliente"),
  });

  const inputClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Empresas cliente</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Como empresa proveedora, acá creás las <strong>empresas cliente</strong> que te contratan transporte a vos. Cada una nace con su propio administrador (<code className="rounded bg-slate-100 px-1 dark:bg-slate-800">cliente_admin</code>).
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Nombre de la empresa cliente</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
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
          Crear empresa cliente
        </Button>
      </form>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      {lastSetupToken && (
        <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
          Empresa cliente creada junto con su cliente_admin. Token de configuración de contraseña (en producción va por email):
          <div className="mt-1 break-all rounded bg-white p-2 font-mono dark:bg-slate-900">{lastSetupToken}</div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !clients || clients.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Sin empresas cliente todavía.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Nombre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{c.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
