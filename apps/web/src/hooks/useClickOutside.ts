import { useEffect, type RefObject } from "react";

/**
 * Cierra un popup propio (Select, DatePicker, DateTimePicker, DurationPicker) al hacer clic
 * afuera - mismo efecto de 7 líneas que estaba copiado en cada uno de esos componentes.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
