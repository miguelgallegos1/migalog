import { useEffect, useRef, useState } from "react";
import { COUNTRY_CODES, defaultDialCode, dialFromValue, fetchServerDial, localDigits } from "../lib/phone";

type PhoneInputProps = {
  /** Número completo en formato internacional ("+593991234567") o "" si está vacío. */
  value: string;
  /** Recibe el número completo ("+" + código + dígitos), o "" si no hay dígitos. */
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  id?: string;
  name?: string;
  required?: boolean;
  containerClassName?: string;
};

/**
 * Teléfono con código de país: el usuario escribe solo su número. El código arranca
 * detectado según su ubicación (ver lib/phone.ts) y puede cambiarlo en el selector si lo
 * necesita - pero no tiene que tipear el "+" ni el código a mano.
 */
export function PhoneInput({ value, onChange, label, error, id, name, required, containerClassName = "" }: PhoneInputProps) {
  const [dial, setDial] = useState(() => dialFromValue(value) ?? defaultDialCode());
  const userChose = useRef(false);

  useEffect(() => {
    const fromValue = dialFromValue(value);
    if (fromValue && fromValue !== dial) setDial(fromValue);
  }, [value, dial]);

  // Si el campo arranca vacío, el código correcto viene de la IP (la API lo resuelve); el
  // detectado en el navegador queda solo de respaldo mientras tanto o si falla.
  useEffect(() => {
    if (value || userChose.current) return;
    let active = true;
    fetchServerDial().then((d) => {
      if (active && d && !userChose.current) setDial(d);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const digits = localDigits(value, dial);
  const inputId = id ?? name;

  function emit(nextDial: string, nextDigits: string) {
    onChange(nextDigits ? `${nextDial}${nextDigits}` : "");
  }

  return (
    <div className={`flex flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs text-slate-500 dark:text-slate-400">
          {label}
        </label>
      )}
      <div className="flex gap-1.5">
        <select
          aria-label="Código de país"
          value={dial}
          onChange={(e) => {
            userChose.current = true;
            setDial(e.target.value);
            emit(e.target.value, digits);
          }}
          className="rounded-md border border-slate-300 bg-slate-50 py-2 pl-2 pr-1 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.dial} value={c.dial} title={c.name}>
              {c.dial}
            </option>
          ))}
        </select>
        <input
          id={inputId}
          name={name}
          type="tel"
          inputMode="numeric"
          required={required}
          aria-invalid={!!error}
          placeholder="991234567"
          value={digits}
          onChange={(e) => {
            userChose.current = true;
            emit(dial, e.target.value.replace(/\D/g, "").replace(/^0+/, ""));
          }}
          className={`min-w-0 flex-1 rounded-md border bg-slate-50 px-2.5 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 ${
            error
              ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70"
              : "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700"
          }`}
        />
      </div>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
