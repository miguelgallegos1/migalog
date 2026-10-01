import type { ButtonHTMLAttributes } from "react";

/**
 * Botón compartido de toda la app, para no repetir clases de Tailwind en cada pantalla
 * y para que un cambio de estilo (colores, radios, etc.) se haga en un solo lugar.
 *
 * Variantes:
 * - `primary` (default): acción principal de la pantalla. Usa amarillo vivo (`amber-400`)
 *   con texto oscuro - más contraste real y más "presencia" visual que un botón azul oscuro
 *   con texto blanco (ver auditoría de contraste del login). Es el color de marca/acento
 *   que se repite en toda la interfaz (nav activo, botones de crear/guardar, etc.).
 * - `secondary`: acciones neutras (cancelar, cerrar) - fondo apagado, sin protagonismo.
 * - `danger`: acciones destructivas o de rechazo (rechazar, cancelar ruta).
 */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-amber-400 text-slate-900 hover:bg-amber-300 active:bg-amber-500",
  secondary:
    "bg-slate-200 text-slate-800 hover:bg-slate-300 active:bg-slate-400 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
  danger: "bg-red-600 text-white hover:bg-red-500 active:bg-red-700",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      // El "levante" al pasar el mouse es solo traslado + una sombra muy leve (shadow-sm, sin
      // color) - una sombra fuerte/de color competía con el resto del diseño, más vale sutil.
      className={`rounded-lg px-4 py-2 text-sm font-bold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
