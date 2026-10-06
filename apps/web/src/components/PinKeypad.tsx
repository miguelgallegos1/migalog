import { useEffect } from "react";

const LENGTH = 6;

/**
 * Teclado numérico para ingresar un PIN de 6 dígitos: puntos de progreso y teclas grandes (en
 * pantalla táctil y con el teclado físico). Al completar los 6 dígitos llama a `onComplete`.
 */
export function PinKeypad({
  value,
  onChange,
  onComplete,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
}) {
  function press(digit: string) {
    if (disabled || value.length >= LENGTH) return;
    const next = value + digit;
    onChange(next);
    if (next.length === LENGTH) onComplete?.(next);
  }

  function backspace() {
    if (!disabled) onChange(value.slice(0, -1));
  }

  // Teclado físico: dígitos y Backspace. Se vuelve a suscribir en cada render para usar el valor actual.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const keyClass =
    "flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-700 transition-all hover:bg-brand-100 active:scale-95 disabled:opacity-50 dark:bg-slate-800 dark:text-brand-300 dark:hover:bg-slate-700";

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex gap-3" role="status" aria-label={`${value.length} de ${LENGTH} dígitos`}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
              i < value.length ? "border-brand-500 bg-brand-500" : "border-brand-200 dark:border-slate-600"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} disabled={disabled} className={keyClass}>
            {d}
          </button>
        ))}
        <span aria-hidden="true" />
        <button type="button" onClick={() => press("0")} disabled={disabled} className={keyClass}>
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          disabled={disabled || value.length === 0}
          aria-label="Borrar"
          className="flex h-16 w-16 items-center justify-center rounded-full text-brand-400 transition-colors hover:bg-brand-50 disabled:opacity-30 dark:text-brand-400 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
            <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
            <path d="m18 9-6 6M12 9l6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
