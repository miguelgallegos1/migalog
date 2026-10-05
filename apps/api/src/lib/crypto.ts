import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

// scrypt viene con Node (sin dependencias ni binarios que empaquetar), es un KDF con salt y
// costo de memoria, y corre bastante más rápido que bcrypt en JavaScript puro - que era lo que
// hacía lento el login en la función serverless.
const KEYLEN = 64;

function deriveKey(secret: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(secret, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  const [tag, saltB64, keyB64] = hash.split("$");
  if (tag !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await deriveKey(secret, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Token aleatorio para invitaciones de un solo uso o credenciales de dispositivo. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
