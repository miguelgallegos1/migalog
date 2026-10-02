import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

// bcryptjs (implementación 100% JavaScript) en vez de argon2 a propósito: argon2 compila un
// binario nativo (.node) y ese tipo de paquete falla seguido al empaquetarse para funciones
// serverless (el bundler no siempre incluye el binario correcto) - justo lo que pasó acá: la
// función de Vercel se caía al arrancar, antes de atender ningún pedido, porque argon2 tiraba
// una excepción al cargarse. bcryptjs no tiene ese riesgo.
const SALT_ROUNDS = 10;

export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, SALT_ROUNDS);
}

export function verifySecret(hash: string, secret: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

/** Token aleatorio para invitaciones de un solo uso o credenciales de dispositivo. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
