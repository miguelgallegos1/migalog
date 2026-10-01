/** Deja solo dígitos (bloquea "-" y letras) - usar en onChange de campos numéricos que no pueden ser negativos. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Al perder el foco: si quedó un valor por debajo del mínimo, lo sube al mínimo (no lo deja vacío). */
export function clampMin(raw: string, min: number): string {
  if (raw === "") return raw;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < min) return String(min);
  return String(n);
}

/** Minutos totales -> "1 h 35 min" / "45 min" / "2 h" (evita mostrar un número de minutos ambiguo). */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
