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

const PIN_RE = /^\d{6}$/;

/**
 * Datos propios de quien está logueado (cualquier rol): nombre, teléfono de contacto y PIN. El
 * PIN se cambia con el actual; si es un PIN temporal (alta o reseteo), esta pantalla es obligatoria
 * antes de usar la app (ver ProtectedRoute).
 */
export default function Perfil() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me") });
  const mustChangePin = useAuthStore((s) => s.user?.mustChangePin ?? false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setPhone(me.phone ?? "");
    }
  }, [me]);

  const pinFormatOk = PIN_RE.test(newPin);
  const pinsMatch = newPin.length > 0 && newPin === confirmPin;
  const pinChanging = currentPin.length > 0 || newPin.length > 0 || confirmPin.length > 0;
  const pinValid = !pinChanging || (PIN_RE.test(currentPin) && pinFormatOk && pinsMatch && newPin !== currentPin);
  const pinMismatch = confirmPin.length > 0 && newPin !== confirmPin;

  const nameChanged = !!me && name.trim().length > 0 && name.trim() !== me.name;
  const phoneChanged = !!me && phone.length > 0 && phone !== me.phone;
  const hasChanges = nameChanged || phoneChanged || newPin.length > 0;
  // Con PIN temporal hay que cambiarlo sí o sí: no se puede guardar solo el nombre/teléfono.
  const canSave = hasChanges && pinValid && name.trim().length > 0 && (!mustChangePin || (pinChanging && pinValid && newPin.length > 0));

  const save = useMutation({
    mutationFn: async () => {
      if (nameChanged || phoneChanged) {
        const body: Record<string, string> = {};
        if (nameChanged) body.name = name.trim();
        if (phoneChanged) body.phone = phone;
        await api.patch("/auth/me", body);
      }
      if (newPin) await api.patch("/auth/me/pin", { currentPin, newPin });
    },
    onSuccess: () => {
      const newName = name.trim();
      useAuthStore.setState((s) => ({
        user: s.user ? { ...s.user, name: newName || s.user.name, mustChangePin: newPin ? false : s.user.mustChangePin } : s.user,
      }));
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
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

  const pinHint = useMemo(() => {
    if (!newPin) return null;
    if (!pinFormatOk) return "El PIN tiene exactamente 6 dígitos";
    if (currentPin && newPin === currentPin) return "Debe ser distinto del actual";
    return null;
  }, [newPin, pinFormatOk, currentPin]);

  return (
    <div className="max-w-lg">
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">Mi perfil</h1>
      {me && <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{ROLE_LABELS[me.role] ?? me.role}</p>}

      {mustChangePin && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Tu PIN es temporal. Cámbialo ahora para poder usar MigaLog.
        </p>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <section className="flex flex-col gap-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Datos personales</p>
          <Input label="Nombre" placeholder="Tu nombre y apellido" value={name} onChange={(e) => setName(e.target.value)} />
          <PhoneInput label="Teléfono de contacto (WhatsApp)" value={phone} onChange={setPhone} />
        </section>

        <section className="flex flex-col gap-4 border-t border-slate-100 pt-5 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {mustChangePin ? "Crea tu PIN" : "Cambiar PIN (opcional)"}
          </p>

          <Input
            type="password"
            revealable
            inputMode="numeric"
            maxLength={6}
            label={mustChangePin ? "PIN temporal" : "PIN actual"}
            placeholder="6 dígitos"
            autoComplete="off"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
          />

          <div className="flex flex-col gap-1">
            <Input
              type="password"
              revealable
              inputMode="numeric"
              maxLength={6}
              label="PIN nuevo"
              placeholder="6 dígitos"
              autoComplete="off"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
            />
            {pinHint && <span className="text-xs text-amber-600 dark:text-amber-400">{pinHint}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <Input
              type="password"
              revealable
              inputMode="numeric"
              maxLength={6}
              label="Repite el PIN nuevo"
              placeholder="Escríbelo de nuevo"
              autoComplete="off"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              error={pinMismatch ? "Los PIN no coinciden" : undefined}
            />
            {pinsMatch && pinFormatOk && <span className="text-xs text-emerald-600 dark:text-emerald-400">Los PIN coinciden</span>}
          </div>
        </section>

        {message && (
          <p className={`rounded-md px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
            {message.text}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {!hasChanges ? "Sin cambios pendientes" : !canSave ? "Completa el PIN para guardar" : "Hay cambios sin guardar"}
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
