import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Button } from "../components/Button";
import type { Role } from "@migalog/shared";

type UserRow = { id: string; name: string; role: Role; email: string | null; phone: string | null; active: boolean };

// admin_empresa/dispatcher usan email+password; conductor/cliente_proveedor usan PIN por
// celular, así que ahí pedimos teléfono en vez de email (ver usesPassword más abajo).
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin_empresa", label: "Admin. empresa" },
  { value: "dispatcher", label: "Despachador" },
  { value: "conductor", label: "Conductor (PIN)" },
  { value: "cliente_proveedor", label: "Solicitante (PIN)" },
];

/** Invitar usuarios dentro del tenant actual (admin_empresa) y ver el listado existente. */
export default function Users() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("dispatcher");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lastInvite, setLastInvite] = useState<{ setupToken: string; setupMethod: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });

  const invite = useMutation({
    mutationFn: () => api.post<{ setupToken: string; setupMethod: string }>("/auth/invite", { name, role, email: email || undefined, phone: phone || undefined }),
    onSuccess: (res) => {
      setLastInvite(res);
      setError(null);
      setName("");
      setEmail("");
      setPhone("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "No se pudo invitar"),
  });

  const usesPassword = role === "admin_empresa" || role === "dispatcher";
  const inputClass = "rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Usuarios</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          invite.mutate();
        }}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500 dark:text-slate-400">Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {usesPassword ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 dark:text-slate-400">Teléfono (WhatsApp)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} required className={inputClass} />
          </div>
        )}
        <Button type="submit" disabled={invite.isPending}>
          Invitar
        </Button>
      </form>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      {lastInvite && (
        <div className="rounded-lg bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
          Invitación creada ({lastInvite.setupMethod === "password" ? "setear password" : "setear PIN"}). Token de
          configuración (en producción se envía por email/WhatsApp, acá se muestra para poder probar):
          <div className="mt-1 break-all rounded bg-white p-2 font-mono dark:bg-slate-900">{lastInvite.setupToken}</div>
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
                <th className="px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2 font-medium">Contacto</th>
                <th className="px-4 py-2 font-medium">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {users?.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.name}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.role}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.email ?? u.phone}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{u.active ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
