import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuthStore, type SessionUser } from "../store/auth";
import { PinPad } from "../components/PinPad";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { getStoredDeviceId, storeDevice } from "../lib/device";

type LoginResponse = { accessToken: string; user: SessionUser };
type SetupPinResponse = { deviceId: string; deviceRefreshToken: string };

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6 8.5 7 8.5-7" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const InviteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
    <path d="M17 3v4M15 5h4" />
  </svg>
);

export default function Login() {
  const [mode, setMode] = useState<"password" | "pin">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [needsSetup, setNeedsSetup] = useState(!getStoredDeviceId());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login-password", { email, password });
      setSession(res.accessToken, res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const deviceId = getStoredDeviceId();
    if (!deviceId) {
      setNeedsSetup(true);
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login-pin", { deviceId, pin });
      setSession(res.accessToken, res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function submitSetup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<SetupPinResponse>("/auth/setup-pin", { setupToken, pin, deviceLabel: navigator.userAgent.slice(0, 60) });
      storeDevice(res.deviceId, res.deviceRefreshToken);
      setNeedsSetup(false);
      setPin("");
      setSetupToken("");
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo configurar el dispositivo");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-300 bg-slate-100 py-3 pl-11 pr-3 text-sm text-slate-900 placeholder:text-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-400";
  const centeredInputClass =
    "w-full rounded-xl border border-slate-300 bg-slate-100 py-3 px-4 text-center text-sm text-slate-900 placeholder:text-slate-500 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-400";
  const primaryButtonClass =
    "w-full rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-slate-900 transition-colors hover:bg-amber-300 active:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60";
  const secondaryTextClass = "text-slate-500 dark:text-slate-400";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <ThemeToggle className="fixed right-4 top-4 z-10" />

      {/*
        En modo oscuro una sombra negra normal es invisible sobre un fondo casi negro,
        así que ahí la reemplazamos por un halo sutil hacia abajo con el propio color de
        marca (a muy baja opacidad) en vez de negro - eso sí se percibe como "elevación".
      */}
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-xl shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_25px_50px_-12px_rgba(56,189,248,0.25)] sm:px-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo size={68} />
            <h1 className="text-4xl font-extrabold leading-normal text-slate-900 dark:text-white">
              MigaLog
            </h1>
            <p className={`text-sm ${secondaryTextClass}`}>Control logístico en tiempo real</p>
          </div>

          {/* Separador entre el encabezado (logo/nombre/tagline) y las acciones */}
          <div className="my-6 h-px w-full bg-slate-200 dark:bg-slate-800" />

          <div className="mb-6 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              className={`font-semibold transition-colors ${mode === "pin" ? "text-slate-900 dark:text-white" : `${secondaryTextClass} hover:text-slate-700 dark:hover:text-slate-300`}`}
              onClick={() => {
                setMode("pin");
                setError(null);
              }}
            >
              PIN
            </button>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <button
              type="button"
              className={`font-semibold transition-colors ${mode === "password" ? "text-slate-900 dark:text-white" : `${secondaryTextClass} hover:text-slate-700 dark:hover:text-slate-300`}`}
              onClick={() => {
                setMode("password");
                setError(null);
              }}
            >
              Email / Contraseña
            </button>
          </div>

          {mode === "password" && (
            <form onSubmit={submitPassword} className="flex flex-col gap-3">
              <div className="relative">
                <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${secondaryTextClass}`}><MailIcon /></span>
                <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
              <div className="relative">
                <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${secondaryTextClass}`}><LockIcon /></span>
                <input type="password" required placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
              </div>
              <button disabled={loading} className={`mt-2 ${primaryButtonClass}`}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          )}

          {mode === "pin" && !needsSetup && (
            <form onSubmit={submitPin} className="flex flex-col items-center gap-5">
              <p className={`text-sm ${secondaryTextClass}`}>Ingresá tu PIN de 6 dígitos</p>
              <PinPad value={pin} onChange={setPin} autoFocus />
              <button disabled={loading || pin.length !== 6} className={primaryButtonClass}>
                {loading ? "Ingresando..." : "Ingresar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNeedsSetup(true);
                  setError(null);
                }}
                className={`text-xs ${secondaryTextClass} hover:text-slate-700 dark:hover:text-slate-300`}
              >
                ¿Es otro dispositivo? Configurar acceso
              </button>
              <p className={`text-center text-xs ${secondaryTextClass}`}>La huella/rostro se habilita para reingresos rápidos después de tu primer ingreso.</p>
            </form>
          )}

          {mode === "pin" && needsSetup && (
            <form onSubmit={submitSetup} className="flex flex-col items-center gap-5">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-brand-500 dark:text-brand-400"><InviteIcon /></span>
                <p className={`text-sm ${secondaryTextClass}`}>Primera vez en este dispositivo: pegá tu código de invitación</p>
              </div>
              <input
                required
                placeholder="Código de invitación"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                className={centeredInputClass}
              />
              {setupToken.trim().length > 0 && (
                <>
                  <div className={`flex items-center gap-2 text-xs font-medium uppercase tracking-wide ${secondaryTextClass}`}>
                    <ShieldIcon /> Ingresá tu PIN
                  </div>
                  <PinPad value={pin} onChange={setPin} />
                </>
              )}
              <button disabled={loading || pin.length !== 6 || !setupToken} className={primaryButtonClass}>
                {loading ? "Configurando..." : "Guardar y continuar"}
              </button>
              {getStoredDeviceId() && (
                <button type="button" onClick={() => setNeedsSetup(false)} className={`text-xs ${secondaryTextClass} hover:text-slate-700 dark:hover:text-slate-300`}>
                  Volver a ingresar con PIN
                </button>
              )}
            </form>
          )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700 dark:border-transparent dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
