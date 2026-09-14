import { customAlphabet } from "nanoid";

const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin caracteres ambiguos (0/O, 1/I/L)
const nanoid = customAlphabet(alphabet, 6);

/** Genera un código de ruta legible, ej. RUTA-A3F9K2. Único por diseño (espacio de ~1e9). */
export function generateRouteCode(): string {
  return `RUTA-${nanoid()}`;
}
