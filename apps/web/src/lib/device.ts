const DEVICE_ID_KEY = "migalog_device_id";
const DEVICE_TOKEN_KEY = "migalog_device_refresh_token";

/**
 * El deviceId/token viven en este dispositivo, no los escribe la persona: se guardan solos
 * al configurar el PIN (/auth/setup-pin) y de ahí en más el login por PIN los usa en silencio.
 */
export function getStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export function storeDevice(deviceId: string, refreshToken?: string): void {
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    if (refreshToken) localStorage.setItem(DEVICE_TOKEN_KEY, refreshToken);
  } catch {
    // localStorage no disponible (modo privado, etc.) - el login por PIN pedirá reconfigurar
  }
}

export function getStoredDeviceRefreshToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearStoredDevice(): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // no-op
  }
}

export function supportsBiometrics(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}
