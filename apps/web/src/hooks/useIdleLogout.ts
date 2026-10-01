import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

const IDLE_TIMEOUT_MS = 30 * 60_000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

/**
 * Cierra la sesión sola tras 30 minutos sin actividad (sin mover el mouse, tocar la
 * pantalla, tipear ni scrollear) - pensado para pantallas compartidas/kiosko (ej. una
 * tablet en el camión) donde alguien se olvida de cerrar sesión al dejarla.
 */
export function useIdleLogout() {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (useAuthStore.getState().user) {
          useAuthStore.getState().logout();
          navigate("/login");
        }
      }, IDLE_TIMEOUT_MS);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [navigate]);
}
