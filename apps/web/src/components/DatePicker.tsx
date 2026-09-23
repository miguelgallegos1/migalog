import { useEffect, useRef, useState } from "react";

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);
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

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatDisplay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${pad(d)}/${pad(m)}/${y}`;
}

/**
 * Calendario propio (reemplaza <input type="date">, cuyo popup nativo no respeta el tema
 * de la app). `value`/`onChange` trabajan con fecha en formato "YYYY-MM-DD".
 */
export function DatePicker({ value, onChange, className = "" }: { value: string; onChange: (iso: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
  const [viewYear, setViewYear] = useState((selectedDate ?? today).getFullYear());
  const [viewMonth, setViewMonth] = useState((selectedDate ?? today).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  // Lunes = 0 ... Domingo = 6, para que la grilla arranque en lunes.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  function pick(day: number) {
    onChange(toISODate(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left text-sm text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        <span className="text-slate-400 dark:text-slate-500"><CalendarIcon /></span>
        <span className={value ? "" : "text-slate-400 dark:text-slate-500"}>{value ? formatDisplay(value) : "dd/mm/aaaa"}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
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
              const isSelected = value === toISODate(new Date(viewYear, viewMonth, day));
              const isToday = toISODate(today) === toISODate(new Date(viewYear, viewMonth, day));
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(day)}
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
      )}
    </div>
  );
}
