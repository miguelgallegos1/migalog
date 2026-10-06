import { useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes, type ReactNode } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  /** Clases para el contenedor (ej. "col-span-2" dentro de un grid) - "className" va al <input>. */
  containerClassName?: string;
  /** Mensaje de validación propio (ej. "Campo obligatorio") - reemplaza el globo nativo del navegador. */
  error?: string;
  /** Ícono chico a la izquierda, dentro del campo (mismo patrón que Login.tsx). */
  icon?: ReactNode;
  /** Solo para type="password": muestra el ojito para ver lo que se escribió. */
  revealable?: boolean;
  /** Escape hatch para el único caso legítimo de no forzar mayúsculas/recorte (ej. un buscador
   *  donde se prefiere ver exactamente lo que se tipeó) - por defecto TODO campo de texto lo hace. */
  preserveCase?: boolean;
};

// Tipos donde forzar mayúsculas/recorte sería incorrecto o irrelevante: email es sensible a
// mayúsculas/minúsculas contra lo que ya está guardado en la base, password no debe tocarse
// nunca, y number ya tiene su propio tratamiento (digitsOnly/clampMin) en cada pantalla.
const CASE_EXEMPT_TYPES = new Set(["email", "password", "number"]);

/**
 * Input de texto compartido: mismo tratamiento de borde/foco que Select y DatePicker
 * (borde brand-500 + anillo al enfocar) en vez del outline azul del navegador, para que
 * los tres controles se vean como un mismo sistema. El error se pinta con nuestro propio
 * estilo (borde rojo + texto debajo) en vez del globo de validación nativo del navegador -
 * para eso el <form> que lo use debe llevar `noValidate`.
 *
 * Mayúsculas + recorte automáticos: todo lo que se escribe en un campo de texto se pasa a
 * MAYÚSCULAS al tipear y se recorta (sin espacios al principio/final) al salir del campo -
 * así toda la app queda consistente sin que cada pantalla tenga que acordarse de hacerlo a
 * mano. Se aplica acá, en el componente compartido, no por pantalla.
 */
export function Input({ label, id, className = "", containerClassName = "", error, icon, type, onChange, onBlur, preserveCase, revealable = false, ...props }: InputProps) {
  const inputId = id ?? props.name;
  const normalize = !preserveCase && !CASE_EXEMPT_TYPES.has(type ?? "text");
  const [revealed, setRevealed] = useState(false);
  const isRevealable = revealable && type === "password";
  const effectiveType = isRevealable && revealed ? "text" : type;

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (normalize) {
      const upper = e.target.value.toUpperCase();
      if (upper !== e.target.value) e.target.value = upper;
    }
    onChange?.(e);
  }

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    if (normalize) {
      const trimmed = e.target.value.trim();
      if (trimmed !== e.target.value) {
        e.target.value = trimmed;
        // El blur no siempre tiene un onChange dedicado del lado de quien usa el input, pero
        // el estado controlado sí necesita enterarse del recorte - se simula un change con el
        // mismo target ya recortado.
        onChange?.(e as unknown as ChangeEvent<HTMLInputElement>);
      }
    }
    onBlur?.(e);
  }

  return (
    <div className={`flex flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">{icon}</span>}
        <input
          id={inputId}
          aria-invalid={!!error}
          type={effectiveType}
          {...props}
          onChange={handleChange}
          onBlur={handleBlur}
          className={`w-full rounded-md border bg-slate-50 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
            icon ? "pl-8" : "pl-2.5"
          } ${isRevealable ? "pr-8" : "pr-2.5"} ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70"
              : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700"
          } ${className}`}
        />
        {isRevealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
            title={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
              {revealed ? (
                <>
                  <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </>
              ) : (
                <>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
