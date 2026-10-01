import { useRef, useState } from "react";
import { useClickOutside } from "../hooks/useClickOutside";

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const HOURS = Array.from({ length: 24 }, (_, h) => String(h));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

/**
 * Un solo control para tiempo estimado (horas + minutos), no dos selects sueltos - abre un
 * popup con dos columnas para elegir ambos valores, mismo patrón que DatePicker/Select
 * (botón + panel propio, nada de <input type="time"> nativo).
 */
export function DurationPicker({
  hours,
  minutes,
  onChange,
  className = "",
  error,
}: {
  hours: string;
  minutes: string;
  onChange: (hours: string, minutes: string) => void;
  className?: string;
  /** Mensaje de validación propio (ej. "Campo obligatorio") - mismo patrón que Input. */
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false));

  const display = hours || minutes ? `${hours || "0"} h ${minutes || "00"} min` : "";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center gap-2 whitespace-nowrap rounded-md border bg-slate-50 px-2.5 py-2 text-left text-sm text-slate-900 outline-none transition-colors dark:bg-slate-800 dark:text-slate-100 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70"
              : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700"
          }`}
        >
          <span className="shrink-0 text-slate-400 dark:text-slate-500"><ClockIcon /></span>
          <span className={display ? "" : "text-slate-400 dark:text-slate-500"}>{display || "HH:MM"}</span>
        </button>

        {open && (
          <div className="absolute z-20 mt-1 flex w-56 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            <div className="flex-1 border-r border-slate-200 dark:border-slate-700">
              <div className="border-b border-slate-200 px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-400 dark:border-slate-700 dark:text-slate-500">Horas</div>
              <div className="max-h-48 overflow-y-auto py-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onChange(h, minutes || "00")}
                    className={`block w-full px-3 py-1.5 text-center text-sm transition-colors ${
                      hours === h ? "bg-amber-400 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <div className="border-b border-slate-200 px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-400 dark:border-slate-700 dark:text-slate-500">Min.</div>
              <div className="max-h-48 overflow-y-auto py-1">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange(hours || "0", m)}
                    className={`block w-full px-3 py-1.5 text-center text-sm transition-colors ${
                      minutes === m ? "bg-amber-400 font-bold text-slate-900" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
