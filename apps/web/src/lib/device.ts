const DEVICE_ID_KEY = "migalog_device_id";
const DEVICE_TOKEN_KEY = "migalog_device_refresh_token";
const BIOMETRIC_CREDENTIAL_KEY = "migalog_biometric_credential_id";

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
    localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
  } catch {
    // no-op
  }
}

export function supportsBiometrics(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

/** Id de la credencial WebAuthn ya registrada en este navegador, si "Activar biometría" se usó antes acá. */
export function getBiometricCredentialId(): string | null {
  try {
    return localStorage.getItem(BIOMETRIC_CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export function storeBiometricCredentialId(credentialId: string): void {
  try {
    localStorage.setItem(BIOMETRIC_CREDENTIAL_KEY, credentialId);
  } catch {
    // no-op
  }
}

export function clearBiometricCredentialId(): void {
  try {
    localStorage.removeItem(BIOMETRIC_CREDENTIAL_KEY);
  } catch {
    // no-op
  }
}
