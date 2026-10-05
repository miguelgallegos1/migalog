// Código de país por defecto para los campos de teléfono: se deduce del idioma/región del
// navegador o, si no viene, de la zona horaria. No pide permiso de ubicación. Es una
// suposición - la persona puede cambiarlo, pero arranca bien en el caso normal.
const DIAL_BY_REGION: Record<string, string> = {
  EC: "+593", NI: "+505", CO: "+57", PE: "+51", MX: "+52", AR: "+54", CL: "+56", VE: "+58",
  PA: "+507", CR: "+506", SV: "+503", GT: "+502", HN: "+504", BO: "+591", PY: "+595", UY: "+598",
  DO: "+1", PR: "+1", US: "+1", ES: "+34", BR: "+55",
};

const DIAL_BY_TIMEZONE_PREFIX: [string, string][] = [
  ["America/Guayaquil", "+593"], ["America/Managua", "+505"], ["America/Bogota", "+57"],
  ["America/Lima", "+51"], ["America/Mexico_City", "+52"], ["America/Argentina", "+54"],
  ["America/Santiago", "+56"], ["America/Caracas", "+58"], ["America/Panama", "+507"],
  ["America/Costa_Rica", "+506"], ["America/El_Salvador", "+503"], ["America/Guatemala", "+502"],
  ["America/Tegucigalpa", "+504"], ["America/La_Paz", "+591"], ["America/Asuncion", "+595"],
  ["America/Montevideo", "+598"], ["America/Santo_Domingo", "+1"], ["Europe/Madrid", "+34"],
  ["America/Sao_Paulo", "+55"],
];

const FALLBACK_DIAL = "+593";

export function defaultDialCode(): string {
  if (typeof navigator !== "undefined") {
    const region = navigator.language?.split("-")[1]?.toUpperCase();
    if (region && DIAL_BY_REGION[region]) return DIAL_BY_REGION[region];
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = DIAL_BY_TIMEZONE_PREFIX.find(([prefix]) => tz?.startsWith(prefix));
    if (match) return match[1];
  } catch {
    // Intl sin zona horaria disponible - se usa el fallback de abajo.
  }
  return FALLBACK_DIAL;
}

/** Valor inicial de un campo de teléfono: el código de país, listo para que la persona escriba el resto. */
export function initialPhone(): string {
  return defaultDialCode();
}
