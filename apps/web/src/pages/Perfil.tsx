import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PhoneInput } from "../components/PhoneInput";
import { ROLE_LABELS } from "../lib/roleLabels";
import { Loader2 } from "lucide-react";

type Me = { id: string; name: string; phone: string | null; role: string };

/** Requisitos de la nueva contraseña - el mismo criterio se valida en el servidor (auth.ts). */
function passwordRules(pw: string) {
  return [
    { id: "len", label: "Al menos 8 caracteres", ok: pw.length >= 8 },
    { id: "upper", label: "Una letra mayúscula", ok: /[A-ZÁÉÍÓÚÑ]/.test(pw) },
    { id: "lower", label: "Una letra minúscula", ok: /[a-záéíóúñ]/.test(pw) },
    { id: "digit", label: "Un número", ok: /\d/.test(pw) },
  ];
}

function strengthOf(pw: string): { score: number; label: string; color: string } {
  const rules = passwordRules(pw);
  const met = rules.filter((r) => r.ok).length + (pw.length >= 12 ? 1 : 0) + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);
  if (!pw) return { score: 0, label: "", color: "bg-slate-200 dark:bg-slate-700" };
  if (met <= 2) return { score: 1, label: "Débil", color: "bg-red-500" };
  if (met <= 4) return { score: 2, label: "Media", color: "bg-amber-400" };
  return { score: 3, label: "Fuerte", color: "bg-emerald-500" };
}

/**
 * Datos propios de quien está logueado (cualquier rol): nombre, teléfono y contraseña. Para
 * cambiar la contraseña hace falta la actual, y la nueva se valida en vivo mientras se escribe
 * (requisitos, fuerza y coincidencia) - el botón solo se habilita cuando todo está bien.
 */
export default function Perfil() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPhone(me.phone ?? "");
    }
  }, [me]);

  const rules = useMemo(() => passwordRules(newPassword), [newPassword]);
  const strength = useMemo(() => strengthOf(newPassword), [newPassword]);
  const rulesOk = rules.every((r) => r.ok) && newPassword !== currentPassword;
  const matches = confirmPassword.length > 0 && newPassword === confirmPassword;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const changingPassword = newPassword.length > 0 || confirmPassword.length > 0 || currentPassword.length > 0;
  const passwordValid = !changingPassword || (rulesOk && matches && currentPassword.length > 0);

  const nameChanged = !!me && name.trim().length > 0 && name.trim() !== me.name;
  const phoneChanged = !!me && phone.length > 0 && phone !== me.phone;
  const hasChanges = nameChanged || phoneChanged || (changingPassword && newPassword.length > 0);
  const canSave = hasChanges && passwordValid && (name.trim().length > 0);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (nameChanged) body.name = name.trim();
      if (phoneChanged) body.phone = phone;
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
    if (!canSave) return;
    save.mutate();
  }

  const inputType = showPasswords ? "text" : "password";

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">Mi perfil</h1>
      {me && <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{ROLE_LABELS[me.role] ?? me.role}</p>}

      <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <section className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Datos personales</p>
          <Input label="Nombre" placeholder="Tu nombre y apellido" value={name} onChange={(e) => setName(e.target.value)} />
          <PhoneInput label="Teléfono (WhatsApp)" value={phone} onChange={setPhone} />
        </section>

        <section className="flex flex-col gap-4 border-t border-slate-100 pt-5 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Cambiar contraseña (opcional)</p>
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="text-xs font-medium text-brand-600 hover:text-brand-500 dark:text-brand-400"
            >
              {showPasswords ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <Input
            type={inputType}
            preserveCase
            label="Contraseña actual" placeholder="Tu contraseña actual"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            <Input
              type={inputType}
              preserveCase
              label="Nueva contraseña"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {newPassword && (
              <>
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3].map((i) => (
                      <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.score ? strength.color : "bg-slate-200 dark:bg-slate-700"}`} />
                    ))}
                  </div>
                  <span className="w-14 text-right text-xs font-medium text-slate-500 dark:text-slate-400">{strength.label}</span>
                </div>
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {rules.map((r) => (
                    <li key={r.id} className={r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}>
                      {r.ok ? "✓" : "○"} {r.label}
                    </li>
                  ))}
                </ul>
                {currentPassword && newPassword === currentPassword && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Debe ser distinta de la actual</p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Input
              type={inputType}
              preserveCase
              label="Repite la nueva contraseña" placeholder="Escríbela de nuevo"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={mismatch ? "Las contraseñas no coinciden" : undefined}
            />
            {matches && <span className="text-xs text-emerald-600 dark:text-emerald-400">Las contraseñas coinciden</span>}
          </div>
        </section>

        {message && (
          <p className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
            {message.text}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {!hasChanges ? "Sin cambios pendientes" : !passwordValid && changingPassword ? "Completa la contraseña para guardar" : "Hay cambios sin guardar"}
          </p>
          <Button type="submit" disabled={!canSave || save.isPending} className="inline-flex items-center gap-2">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {save.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
