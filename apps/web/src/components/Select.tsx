import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useClickOutside } from "../hooks/useClickOutside";
import { CheckIcon, XIcon } from "./icons";

export type SelectOption = { value: string; label: string };

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0">
    <path d="M6 9l6 6 6-6" />
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
  icon,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  /** Ícono chico a la izquierda, dentro del campo (mismo patrón que Input). */
  icon?: ReactNode;
  /** Mensaje de validación propio (ej. "Campo obligatorio") - mismo patrón que Input. */
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  useClickOutside(rootRef, () => setOpen(false));

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div ref={rootRef} className="relative">
        {/* Input oculto solo para que el `required` del <form> nativo funcione con este combobox. */}
        {required && <input tabIndex={-1} aria-hidden className="pointer-events-none absolute h-0 w-0 opacity-0" value={value} required onChange={() => {}} />}
        {icon && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">{icon}</span>}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border bg-slate-50 py-2 text-left text-sm text-slate-900 outline-none transition-colors dark:bg-slate-800 dark:text-slate-100 ${icon ? "pl-8 pr-2.5" : "px-2.5"} ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70"
              : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700"
          }`}
        >
          <span className={selected ? "" : "text-slate-400 dark:text-slate-500"}>{selected ? selected.label : placeholder}</span>
          <span className="flex items-center gap-1">
            {selected && (
              <button
                type="button"
                aria-label="Quitar selección"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                className="rounded text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              >
                <XIcon className="h-3.5 w-3.5 shrink-0" />
              </button>
            )}
            <span className="text-slate-400 dark:text-slate-500"><ChevronIcon /></span>
          </span>
        </div>
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
                {o.value === value && <span className="text-amber-500"><CheckIcon className="h-4 w-4 shrink-0" /></span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
