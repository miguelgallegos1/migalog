import argon2 from "argon2";
import { randomBytes } from "node:crypto";

export function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret);
}

export function verifySecret(hash: string, secret: string): Promise<boolean> {
  return argon2.verify(hash, secret);
}

/** Token aleatorio para invitaciones de un solo uso o credenciales de dispositivo. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
