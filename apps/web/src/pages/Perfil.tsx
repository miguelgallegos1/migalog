import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PhoneInput } from "../components/PhoneInput";
import { ROLE_LABELS } from "../lib/roleLabels";

type Me = { id: string; name: string; phone: string | null; role: string };

/**
 * Datos propios de quien está logueado (cualquier rol): nombre, teléfono y contraseña. Para
 * cambiar la contraseña hace falta la actual - así no queda abierta si alguien deja la
 * sesión abierta en otra pantalla.
 */
export default function Perfil() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPhone(me.phone ?? "");
    }
  }, [me]);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (me && name.trim() && name.trim() !== me.name) body.name = name.trim();
      if (me && phone && phone !== me.phone) body.phone = phone;
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      return api.patch<{ ok: boolean }>("/auth/me", body);
    },
    onSuccess: () => {
      const newName = name.trim();
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, name: newName || s.user.name } : s.user }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ ok: true, text: "Cambios guardados" });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => setMessage({ ok: false, text: err instanceof ApiError ? err.message : "No se pudo guardar" }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ ok: false, text: "La confirmación de la contraseña no coincide" });
      return;
    }
    if (newPassword && !currentPassword) {
      setMessage({ ok: false, text: "Ingresá tu contraseña actual para cambiarla" });
      return;
    }
    save.mutate();
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">Mi perfil</h1>
      {me && <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{ROLE_LABELS[me.role] ?? me.role}</p>}

      <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <PhoneInput label="Teléfono (WhatsApp)" value={phone} onChange={setPhone} />

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cambiar contraseña (opcional)</p>
          <div className="flex flex-col gap-3">
            <Input type="password" preserveCase label="Contraseña actual" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <Input type="password" preserveCase label="Nueva contraseña" placeholder="Mínimo 8 caracteres" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Input type="password" preserveCase label="Repetí la nueva contraseña" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{message.text}</p>
        )}

        <Button type="submit" disabled={save.isPending} className="self-start">
          {save.isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>
    </div>
  );
}
