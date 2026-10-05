// Código de país por defecto para los campos de teléfono: se deduce del idioma/región del
// navegador o, si no viene, de la zona horaria. No pide permiso de ubicación. Es una
// suposición - la persona puede cambiarlo, pero arranca bien en el caso normal.
export const COUNTRY_CODES: { dial: string; name: string }[] = [
  { dial: "+593", name: "Ecuador" },
  { dial: "+505", name: "Nicaragua" },
  { dial: "+57", name: "Colombia" },
  { dial: "+51", name: "Perú" },
  { dial: "+52", name: "México" },
  { dial: "+54", name: "Argentina" },
  { dial: "+56", name: "Chile" },
  { dial: "+58", name: "Venezuela" },
  { dial: "+507", name: "Panamá" },
  { dial: "+506", name: "Costa Rica" },
  { dial: "+503", name: "El Salvador" },
  { dial: "+502", name: "Guatemala" },
  { dial: "+504", name: "Honduras" },
  { dial: "+591", name: "Bolivia" },
  { dial: "+595", name: "Paraguay" },
  { dial: "+598", name: "Uruguay" },
  { dial: "+55", name: "Brasil" },
  { dial: "+34", name: "España" },
  { dial: "+1", name: "Estados Unidos / Rep. Dominicana" },
];

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

/** Código de país que ya trae un número completo ("+5939912..." -> "+593"), o null si no tiene. */
export function dialFromValue(value: string): string | null {
  if (!value.startsWith("+")) return null;
  const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);
  return sorted.find((c) => value.startsWith(c.dial))?.dial ?? null;
}

/** Solo el número local (sin código de país), dígitos únicamente, sin el 0 inicial de la marcación nacional. */
export function localDigits(value: string, dial: string): string {
  const rest = value.startsWith(dial) ? value.slice(dial.length) : value.replace(/^\+\d*/, "");
  return rest.replace(/\D/g, "").replace(/^0+/, "");
}
