import { createHmac, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashSecret } from "./crypto.js";

/** PIN de 6 dígitos al azar (puede empezar en 0). */
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Huella determinística del PIN (HMAC con secreto del servidor): permite buscar por PIN sin conocer la sal. */
export function pinLookupOf(pin: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no está configurada");
  return createHmac("sha256", secret).update(`pin:${pin}`).digest("hex");
}

/** Usuario que tiene ese PIN, o undefined. Como el PIN es único en toda la base, es un solo usuario. */
export async function findUserByPin(pin: string) {
  const [user] = await db.select().from(users).where(eq(users.pinLookup, pinLookupOf(pin)));
  return user;
}

/** Ya lo usa alguien más (cualquier usuario distinto de `exceptUserId`). */
export async function isPinTaken(pin: string, exceptUserId?: string): Promise<boolean> {
  const holder = await findUserByPin(pin);
  return !!holder && holder.id !== exceptUserId;
}

/**
 * Guarda un PIN para el usuario (hasheado + huella única). `mustChange` marca si es temporal.
 * Falla con error de unicidad si el PIN ya lo tiene otro usuario.
 */
export async function setUserPin(userId: string, pin: string, mustChange: boolean): Promise<void> {
  const values = {
    pinHash: await hashSecret(pin),
    pinLookup: pinLookupOf(pin),
    mustChangePin: mustChange,
  };
  await db.update(users).set(values as any).where(eq(users.id, userId));
}

/**
 * PIN temporal nuevo para el usuario (alta o reseteo): elige uno que ningún otro usuario tenga,
 * lo guarda con marca de cambio obligatorio y lo devuelve UNA vez para entregarlo en persona.
 */
export async function issueTemporaryPin(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = generatePin();
    if (await isPinTaken(pin, userId)) continue;
    await setUserPin(userId, pin, true);
    return pin;
  }
  throw new Error("No se pudo generar un PIN libre, intenta de nuevo");
}
