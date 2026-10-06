import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuthStore, type SessionUser } from "../store/auth";
import { PinKeypad } from "../components/PinKeypad";
import { Logo } from "../components/Logo";
import { ThemeToggle } from "../components/ThemeToggle";
import { getStoredDeviceId, getStoredDeviceRefreshToken, getBiometricCredentialId } from "../lib/device";
import { isBiometricAvailable, verifyBiometricCredential } from "../lib/webauthn";

type LoginResponse = { accessToken: string; user: SessionUser };

const FingerprintIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M12 11c1 0 1.8.8 1.8 1.8v2.4c0 2-1.1 3.6-2.3 4.8" />
    <path d="M7.5 17.2c-.8-1.2-1.3-2.6-1.3-4.1a5.8 5.8 0 0 1 11.6 0c0 .5 0 1.1-.1 1.6" />
    <path d="M4.5 9.5A7.5 7.5 0 0 1 19 11.2" />
    <path d="M9.8 19.5c-1.8-1.4-2.8-3.5-2.8-5.9" />
  </svg>
);

// Pantalla de inicio por rol. Se navega directo a ella desde el login: ir a "/" y redirigir
// después mostraba un destello del panel antes de llegar a /empresas.
function homeFor(role: string) {
  return role === "super_admin" ? "/empresas" : "/";
}

export default function Login() {
  const [pin, setPin] = useState("");
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
      navigate(homeFor(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(fullPin: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<LoginResponse>("/auth/login", { pin: fullPin });
      setSession(res.accessToken, res.user);
      navigate(homeFor(res.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  const secondaryTextClass = "text-slate-500 dark:text-slate-400";
  const primaryButtonClass =
    "flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-slate-900 transition-colors hover:bg-amber-300 active:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60";

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
          <h1 className="text-4xl font-extrabold leading-normal text-slate-900 dark:text-white">MigaLog</h1>
          <p className={`text-sm ${secondaryTextClass}`}>Control logístico en tiempo real</p>
        </div>

        <div className="my-6 h-px w-full bg-slate-200 dark:bg-slate-800" />

        {bioAvailable && (
          <>
            <button type="button" onClick={submitBiometric} disabled={loading} className={`mb-4 ${primaryButtonClass}`}>
              <FingerprintIcon />
              {loading ? "Verificando..." : "Ingresar con Face ID / huella"}
            </button>
            <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              o
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
          </>
        )}

        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ingresa tu PIN</h2>
          <p className={`text-sm ${secondaryTextClass}`}>Tu PIN personal de 6 dígitos</p>
        </div>

        <div className="mt-8">
          <PinKeypad value={pin} onChange={setPin} onComplete={submitPin} disabled={loading} />
        </div>

        {loading && <p className={`mt-6 text-center text-sm ${secondaryTextClass}`}>Ingresando...</p>}

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700 dark:border-transparent dark:bg-red-950/60 dark:text-red-300">
            {error}
          </p>
        )}

        <p className={`mt-6 text-center text-xs ${secondaryTextClass}`}>
          Si olvidaste tu PIN, pide a tu administrador que lo restablezca.
        </p>
      </div>
    </div>
  );
}
