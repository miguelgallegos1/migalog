import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuthStore, type SessionUser } from "../store/auth";
import { PinPad } from "../components/PinPad";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { getStoredDeviceId, getStoredDeviceRefreshToken, getBiometricCredentialId, storeDevice } from "../lib/device";
import { isBiometricAvailable, verifyBiometricCredential } from "../lib/webauthn";
import { PhoneInput } from "../components/PhoneInput";

type LoginResponse = { accessToken: string; user: SessionUser };
type SetupPinResponse = { deviceId: string; deviceRefreshToken: string };

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
// Burbuja de chat (no un sobre de correo): el código de invitación llega por WhatsApp, no
// por mail - en ningún lado de la app se invita por correo.
const InviteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
    <path d="M12 3C7 3 3 6.6 3 11c0 2.1.9 4 2.4 5.4L4.5 20l3.9-1.3C9.5 19.2 10.7 19.5 12 19.5c5 0 9-3.6 9-8S17 3 12 3Z" />
    <path d="M8 10.5h8M8 13.5h5" />
  </svg>
);
const FingerprintIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M12 11c1 0 1.8.8 1.8 1.8v2.4c0 2-1.1 3.6-2.3 4.8" />
    <path d="M7.5 17.2c-.8-1.2-1.3-2.6-1.3-4.1a5.8 5.8 0 0 1 11.6 0c0 .5 0 1.1-.1 1.6" />
    <path d="M4.5 9.5A7.5 7.5 0 0 1 19 11.2" />
    <path d="M9.8 19.5c-1.8-1.4-2.8-3.5-2.8-5.9" />
  </svg>
);

export default function Login() {
  const [mode, setMode] = useState<"password" | "pin">("pin");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [needsSetup, setNeedsSetup] = useState(!getStoredDeviceId());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();

  useEffect(() => {
    const credentialId = getBiometricCredentialId();
    const deviceId = getStoredDeviceId();
    const refreshToken = getStoredDeviceRefreshToken();
    if (!credentialId || !deviceId || !refreshToken) return;
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  async function submitBiometric() {
    setError(null);
    const credentialId = getBiometricCredentialId();
    const deviceId = getStoredDeviceId();
    const deviceRefreshToken = getStoredDeviceRefreshToken();
    if (!credentialId || !deviceId || !deviceRefreshToken) return;
    setLoading(true);
    try {
      const verified = await verifyBiometricCredential(credentialId);
      if (!verified) {
        setError("No se pudo verificar tu huella/rostro");
        return;
      }
      const res = await api.post<LoginResponse>("/auth/session/refresh", { deviceId, deviceRefreshToken });
      setSession(res.accessToken, res.user);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login-password", { phone, password });
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

          {bioAvailable && (
            <>
              <button
                type="button"
                onClick={submitBiometric}
                disabled={loading}
                className={`mb-4 flex items-center justify-center gap-2 ${primaryButtonClass}`}
              >
                <FingerprintIcon />
                {loading ? "Verificando..." : "Ingresar con Face ID / huella"}
              </button>
              <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                o
                <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>
            </>
          )}

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
              Teléfono / Contraseña
            </button>
          </div>

          {mode === "password" && (
            <form onSubmit={submitPassword} className="flex flex-col gap-3">
              <PhoneInput required value={phone} onChange={setPhone} />
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
              <p className={`text-sm ${secondaryTextClass}`}>Ingresa tu PIN de 6 dígitos</p>
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
                <p className={`text-sm ${secondaryTextClass}`}>Primera vez en este dispositivo: pega tu código de invitación</p>
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
                    <ShieldIcon /> Ingresa tu PIN
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
