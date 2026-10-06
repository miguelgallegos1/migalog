import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { passwordRules, strengthOf } from "../lib/password";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Logo } from "../components/Logo";

/**
 * Pantalla pública a la que lleva el link de invitación: la persona invitada crea su contraseña
 * y después entra por la pantalla de inicio. No pide sesión - el token del link ya la identifica
 * y vence en 24 horas.
 */
export default function Configurar() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = useMemo(() => passwordRules(password), [password]);
  const strength = useMemo(() => strengthOf(password), [password]);
  const rulesOk = rules.every((r) => r.ok);
  const matches = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSave = !!token && rulesOk && matches && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    setSaving(true);
    try {
      await api.post("/auth/setup-password", { setupToken: token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 500 ? err.message : "El link no es válido o venció. Pide uno nuevo a quien te invitó.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-lg font-bold text-slate-900 dark:text-white">MigaLog</span>
        </div>

        {!token ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Este link no tiene el código de invitación. Pide uno nuevo a quien te invitó.</p>
        ) : done ? (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Tu contraseña está lista</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Ya puedes iniciar sesión con tu teléfono y esta contraseña.</p>
            </div>
            <Link to="/login" className="inline-flex justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Crea tu contraseña</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">La usarás para iniciar sesión desde el computador o el celular.</p>
            </div>

            <div className="flex flex-col gap-2">
              <Input
                type="password"
                preserveCase
                label="Contraseña nueva"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {password && (
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
                </>
              )}
            </div>

            <Input
              type="password"
              preserveCase
              label="Repite la contraseña"
              placeholder="Escríbela de nuevo"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? "Las contraseñas no coinciden" : undefined}
            />

            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

            <Button type="submit" disabled={!canSave} className="inline-flex items-center justify-center gap-2">
              {saving ? "Guardando..." : "Crear contraseña"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
