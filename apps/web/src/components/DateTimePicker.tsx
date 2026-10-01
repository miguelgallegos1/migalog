import { useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import { MONTHS, WEEKDAYS, toISODate, formatDateDisplay, buildMonthGrid } from "../lib/calendar";
import { CalendarIcon } from "./icons";

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

/**
 * Fecha y hora en un solo control (reemplaza el combo de DatePicker + dos <Select> sueltos
 * de horas/minutos): un único popup con calendario + columnas de hora/minuto. Trabaja
 * siempre en hora LOCAL del navegador (la de quien está usando la app, ej. Ecuador) -
 * `value`/`onChange` usan "YYYY-MM-DDTHH:mm" sin offset ni "Z", nunca UTC. Quien la usa arma
 * un `Date` con ese texto (el motor de JS lo interpreta como hora local) y recién ahí, si
 * hace falta mandarlo a la API, lo pasa a `.toISOString()` - así lo que se guarda es
 * exactamente la hora que la persona vio y eligió en pantalla.
 */
export function DateTimePicker({
  value,
  onChange,
  className = "",
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Mensaje de validación propio (ej. "Campo obligatorio") - mismo patrón que Input. */
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [datePart, timePart] = value ? value.split("T") : ["", ""];
  const [hourPart, minutePart] = timePart ? timePart.split(":") : ["", ""];
  const today = new Date();
  const selectedDate = datePart ? new Date(`${datePart}T00:00:00`) : null;
  const [viewYear, setViewYear] = useState((selectedDate ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState((selectedDate ?? today).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false));

  const cells = buildMonthGrid(viewYear, viewMonth);

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  function pickDay(day: number) {
    const iso = toISODate(new Date(viewYear, viewMonth, day));
    onChange(`${iso}T${hourPart || "00"}:${minutePart || "00"}`);
  }
  function pickHour(h: string) {
    onChange(`${datePart || toISODate(today)}T${h}:${minutePart || "00"}`);
  }
  function pickMinute(m: string) {
    onChange(`${datePart || toISODate(today)}T${hourPart || "00"}:${m}`);
  }

  const display = datePart ? `${formatDateDisplay(datePart)}${hourPart ? ` · ${hourPart}:${minutePart || "00"}` : ""}` : "";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2 rounded-md border bg-slate-50 px-2.5 py-2 text-left text-sm text-slate-900 outline-none transition-colors dark:bg-slate-800 dark:text-slate-100 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70"
              : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700"
          }`}
        >
          <span className="text-slate-400 dark:text-slate-500"><CalendarIcon /></span>
          <span className={display ? "" : "text-slate-400 dark:text-slate-500"}>{display || "dd/mm/aaaa --:--"}</span>
        </button>

        {open && (
          <div className="absolute z-20 mt-1 flex w-[21rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="w-56 p-3">
              <div className="mb-2 flex items-center justify-between">
                <button type="button" onClick={() => changeMonth(-1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700">
                  <ChevronLeft />
                </button>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{MONTHS[viewMonth]} {viewYear}</span>
                <button type="button" onClick={() => changeMonth(1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700">
                  <ChevronRight />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
                {WEEKDAYS.map((w, i) => <div key={i}>{w}</div>)}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (day == null) return <div key={i} />;
                  const iso = toISODate(new Date(viewYear, viewMonth, day));
                  const isSelected = datePart === iso;
                  const isToday = toISODate(today) === iso;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickDay(day)}
                      className={`h-7 w-7 rounded-full text-xs transition-colors ${
                        isSelected
                          ? "bg-amber-400 font-bold text-slate-900"
                          : isToday
                            ? "font-semibold text-amber-600 hover:bg-slate-100 dark:text-amber-400 dark:hover:bg-slate-700"
                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex border-l border-slate-200 dark:border-slate-700">
              <div className="w-14 border-r border-slate-200 dark:border-slate-700">
                <div className="border-b border-slate-200 px-1 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-400 dark:border-slate-700 dark:text-slate-500">Hora</div>
                <div className="max-h-56 overflow-y-auto py-1">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => pickHour(h)}
                      className={`block w-full px-2 py-1.5 text-center text-sm transition-colors ${
                        hourPart === h ? "bg-amber-400 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-14">
                <div className="border-b border-slate-200 px-1 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-400 dark:border-slate-700 dark:text-slate-500">Min.</div>
                <div className="py-1">
                  {MINUTES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickMinute(m)}
                      className={`block w-full px-2 py-1.5 text-center text-sm transition-colors ${
                        minutePart === m ? "bg-amber-400 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
