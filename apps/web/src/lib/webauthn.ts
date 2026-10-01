/**
 * Gate biométrico local (Face ID / Touch ID / Windows Hello) vía WebAuthn, autenticador de
 * plataforma únicamente. No hay servidor de atestación/verificación de firma acá a propósito
 * (ver comentario en apps/api/src/routes/auth.ts /device/enable-biometric): lo único que
 * necesitamos es que el navegador confirme "la persona frente a este dispositivo pasó la
 * verificación biométrica del sistema operativo" antes de usar el deviceRefreshToken que ya
 * está guardado localmente (ese token, no la huella, es lo que el backend valida).
 */

// BufferSource (no Uint8Array<ArrayBufferLike>) a propósito: las libs de TS para WebAuthn
// piden ArrayBufferView<ArrayBuffer> puntual, que no es asignable desde el tipo más genérico
// que devuelven Uint8Array.from/crypto.getRandomValues.
function randomChallenge(): BufferSource {
  return crypto.getRandomValues(new Uint8Array(32)) as BufferSource;
}

function base64urlToBuffer(base64url: string): BufferSource {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)) as BufferSource;
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Registra un autenticador de plataforma para este usuario/dispositivo. Devuelve el id de la credencial (ya en base64url, listo para guardar). */
export async function registerBiometricCredential(userId: string, userLabel: string): Promise<string> {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "MigaLog" },
      user: { id: new TextEncoder().encode(userId), name: userLabel, displayName: userLabel },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      attestation: "none",
      timeout: 60_000,
    },
  });
  if (!credential) throw new Error("No se pudo registrar la biometría");
  return (credential as PublicKeyCredential).id;
}

/** Pide la verificación biométrica para una credencial ya registrada. true = la persona pasó la verificación del sistema operativo. */
export async function verifyBiometricCredential(credentialId: string): Promise<boolean> {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ id: base64urlToBuffer(credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    // Cancelado, no coincide la huella/rostro, timeout, etc. - todos caen como "no verificado".
    return false;
  }
}
