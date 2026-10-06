import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useThemeStore } from "../store/theme";
import { useClickOutside } from "../hooks/useClickOutside";
import { ROLE_LABELS } from "../lib/roleLabels";
import { api, ApiError } from "../lib/api";
import {
  getStoredDeviceId,
  storeDevice,
  getBiometricCredentialId,
  storeBiometricCredentialId,
  clearBiometricCredentialId,
} from "../lib/device";
import { isBiometricAvailable, registerBiometricCredential } from "../lib/webauthn";

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
  </svg>
);
const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);
const FingerprintIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <path d="M12 11c1 0 1.8.8 1.8 1.8v2.4c0 2-1.1 3.6-2.3 4.8" />
    <path d="M7.5 17.2c-.8-1.2-1.3-2.6-1.3-4.1a5.8 5.8 0 0 1 11.6 0c0 .5 0 1.1-.1 1.6" />
    <path d="M4.5 9.5A7.5 7.5 0 0 1 19 11.2" />
    <path d="M9.8 19.5c-1.8-1.4-2.8-3.5-2.8-5.9" />
  </svg>
);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Menú de sesión (avatar + nombre en el header, clic abre un popup propio): concentra todo
 * lo relacionado a "quién soy / cómo estoy usando la app" que antes estaba desperdigado -
 * el rol y la empresa (que vivían impresos en el header), el toggle de tema (que vivía
 * suelto al lado) y "Cerrar sesión" (que vivía como botón aparte al pie del sidebar).
 */
export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false));

  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(() => !!getBiometricCredentialId());
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  useEffect(() => {
    isBiometricAvailable().then(setBioSupported);
  }, []);

  if (!user) return null;

  const companyName = user.clientName ?? user.tenantName;

  function handleLogout() {
    setOpen(false);
    logout();
    navigate("/login");
  }

  /**
   * "Activar biometría": si este navegador todavía no tiene un dispositivo guardado (caso de
   * los roles con contraseña, que nunca pasan por /setup-pin), primero se registra uno nuevo
   * vía /device/register - a partir de ahí el flujo es el mismo que ya usan los roles PIN.
   */
  async function handleEnableBiometric() {
    if (!user) return;
    setBioBusy(true);
    setBioError(null);
    try {
      let deviceId = getStoredDeviceId();
      if (!deviceId) {
        const reg = await api.post<{ deviceId: string; deviceRefreshToken: string }>("/auth/device/register", {
          deviceLabel: navigator.userAgent.slice(0, 60),
        });
        deviceId = reg.deviceId;
        storeDevice(reg.deviceId, reg.deviceRefreshToken);
      }
      const credentialId = await registerBiometricCredential(user.id, user.name);
      await api.post("/auth/device/enable-biometric", { deviceId, webauthnCredentialId: credentialId });
      storeBiometricCredentialId(credentialId);
      setBioEnabled(true);
    } catch (err) {
      setBioError(err instanceof ApiError ? err.message : "No se pudo activar la biometría en este dispositivo");
    } finally {
      setBioBusy(false);
    }
  }

  function handleDisableBiometric() {
    clearBiometricCredentialId();
    setBioEnabled(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-slate-900">
          {initialsOf(user.name)}
        </div>
        <span className="hidden text-sm font-medium text-slate-800 dark:text-slate-200 sm:block">{user.name}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white py-2 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-3.5 pb-2.5 dark:border-slate-800">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{user.name}</div>
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">{ROLE_LABELS[user.role]}</div>
            {companyName && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{companyName}</div>}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>

          {bioSupported && (
            <>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              {bioEnabled ? (
                <button
                  type="button"
                  onClick={handleDisableBiometric}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <FingerprintIcon />
                  Desactivar acceso rápido (biometría)
                </button>
              ) : (
                <button
                  type="button"
                  disabled={bioBusy}
                  onClick={handleEnableBiometric}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <FingerprintIcon />
                  {bioBusy ? "Activando..." : "Activar Face ID / huella"}
                </button>
              )}
              {bioError && <p className="px-3.5 pb-1 pt-0.5 text-xs text-red-600 dark:text-red-400">{bioError}</p>}
            </>
          )}

          <button
            type="button"
            onClick={() => { setOpen(false); navigate("/perfil"); }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Mi perfil
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogoutIcon />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
