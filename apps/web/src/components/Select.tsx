import { useEffect, useRef, useState } from "react";

export type SelectOption = { value: string; label: string };

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 shrink-0">
    <path d="M5 13l4 4L19 7" />
  </svg>
);

/**
 * Combobox propio: reemplaza el <select> nativo (cuyo popup el navegador renderiza con su
 * propio chrome del sistema operativo y no respeta el tema claro/oscuro de la app). Mismo
 * comportamiento que un <select> controlado (value + onChange), pero con el menú desplegable
 * dibujado por nosotros.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  className = "",
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* Input oculto solo para que el `required` del <form> nativo funcione con este combobox. */}
      {required && <input tabIndex={-1} aria-hidden className="pointer-events-none absolute h-0 w-0 opacity-0" value={value} required onChange={() => {}} />}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-left text-sm text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        <span className={selected ? "" : "text-slate-400 dark:text-slate-500"}>{selected ? selected.label : placeholder}</span>
        <span className="text-slate-400 dark:text-slate-500"><ChevronIcon /></span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full min-w-max overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {options.length === 0 && <div className="px-3 py-1.5 text-sm text-slate-400 dark:text-slate-500">Sin opciones</div>}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {o.label}
              {o.value === value && <span className="text-amber-500"><CheckIcon /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
