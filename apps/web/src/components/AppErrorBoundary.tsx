import { Component, type ErrorInfo, type ReactNode } from "react";

const RELOAD_KEY = "migalog-chunk-reload-at";
const RELOAD_WINDOW_MS = 10_000;

/** Un chunk de código que ya no existe en el servidor (pasa después de un deploy con el navegador abierto). */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|Loading chunk|ChunkLoadError/i.test(msg);
}

/**
 * Recarga la página una sola vez por ventana de tiempo (sessionStorage evita un bucle si el
 * error se repite). Devuelve false si ya se recargó hace poco y hay que mostrar el error.
 */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado): se recarga igual, pero sin el freno anti-bucle.
  }
  window.location.reload();
  return true;
}

type State = { error: Error | null };

/**
 * Último recurso: si una pantalla revienta, en vez de quedar en blanco se muestra el motivo y
 * un botón para recargar. Los errores de chunk (versión nueva desplegada) recargan solos.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error de pantalla:", error, info.componentStack);
    if (isChunkLoadError(error)) reloadOnceForChunkError();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">No se pudo mostrar esta pantalla</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Suele pasar cuando hay una versión nueva de MigaLog. Recarga la página para continuar.
          </p>
          <p className="mt-3 break-words rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
