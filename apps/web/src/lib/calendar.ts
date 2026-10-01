// Helpers de calendario compartidos por DatePicker y DateTimePicker (antes duplicados casi
// textual entre los dos componentes).

export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${pad(d)}/${pad(m)}/${y}`;
}

/** Grilla de un mes: null son los huecos antes del día 1 (la semana arranca en lunes). */
export function buildMonthGrid(viewYear: number, viewMonth: number): (number | null)[] {
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  return [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
}
