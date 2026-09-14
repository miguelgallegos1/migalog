import type { RouteStatus } from "@migalog/shared";

const STYLES: Record<RouteStatus, string> = {
  CREADO: "bg-slate-700 text-slate-200",
  APROBADO: "bg-sky-700 text-sky-100",
  RECHAZADO: "bg-red-800 text-red-100",
  CONFIRMADO: "bg-indigo-700 text-indigo-100",
  PARQUEADO: "bg-amber-700 text-amber-100",
  EN_CURSO: "bg-emerald-700 text-emerald-100",
  EN_PARADA: "bg-teal-700 text-teal-100",
  TERMINADO: "bg-slate-600 text-slate-100",
  CANCELADO: "bg-red-900 text-red-200",
};

export function RouteStatusBadge({ status }: { status: RouteStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
