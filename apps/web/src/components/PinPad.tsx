import { useRef } from "react";

/**
 * Teclado de 6 casillas para ingresar/elegir un PIN numérico.
 * - Cada casilla guarda un solo dígito y avanza el foco automáticamente al siguiente.
 * - Backspace en una casilla vacía retrocede y borra la anterior (comportamiento típico de OTP).
 * - Soporta pegar el PIN completo de una vez (ej. desde un gestor de contraseñas o un mensaje).
 * - `type="password"` oculta el dígito como en cualquier campo de contraseña, por seguridad/privacidad
 *   (nadie mirando por encima del hombro debería poder leer el PIN mientras se escribe).
 */
export function PinPad({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  // `value` es el PIN completo como string (ej. "123456"); acá lo partimos en 6 dígitos,
  // uno por casilla, completando con "" los que todavía no se escribieron.
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  function setDigit(index: number, digit: string) {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(""));
    if (digit && index < 5) inputsRef.current[index + 1]?.focus();
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length <= 1) {
      setDigit(index, cleaned);
      return;
    }
    // El usuario pegó varios dígitos a la vez: los distribuimos desde esta casilla en adelante.
    const next = digits.slice();
    for (let i = 0; i < cleaned.length && index + i < 6; i++) next[index + i] = cleaned[i]!;
    onChange(next.join(""));
    const lastFilled = Math.min(index + cleaned.length, 5);
    inputsRef.current[lastFilled]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    // Backspace sobre una casilla ya vacía: retrocede y borra la anterior (no solo el foco).
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
      setDigit(index - 1, "");
    }
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          autoFocus={autoFocus && i === 0}
          type="password"
          autoComplete="off"
          inputMode="numeric"
          maxLength={6}
          aria-label={`Dígito ${i + 1} del PIN`}
          className="h-14 w-14 rounded-xl border border-slate-300 bg-slate-100 text-center text-2xl font-semibold text-slate-900 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      ))}
    </div>
  );
}
