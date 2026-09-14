import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { RouteStatusBadge } from "../components/RouteStatusBadge";
import type { RouteStatus } from "@migalog/shared";

type RouteRow = { id: string; code: string; status: RouteStatus; createdAt: string };

/** Rutas en estado terminal (TERMINADO/CANCELADO/RECHAZADO) - el grid activo del panel de control las excluye a propósito. */
export default function History() {
  const { data: routes, isLoading } = useQuery({
    queryKey: ["routes", "history"],
    queryFn: () => api.get<RouteRow[]>("/routes?history=true"),
  });

  const terminal = routes?.filter((r) => ["TERMINADO", "CANCELADO", "RECHAZADO"].includes(r.status));

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Historial de rutas</h1>
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
        ) : !terminal || terminal.length === 0 ? (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Todavía no hay rutas finalizadas.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {terminal.map((route) => (
              <li key={route.id}>
                <Link
                  to={`/rutas/${route.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-100 dark:hover:bg-slate-800/50"
                >
                  <span className="font-mono text-slate-700 dark:text-slate-300">{route.code}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(route.createdAt).toLocaleDateString()}</span>
                    <RouteStatusBadge status={route.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
