import { useAuthStore } from "../store/auth";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";

// Hamburguesa rellena de barras redondeadas - más "viva" que un ícono de solo trazo.
const MenuIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
    <rect x="2" y="4.5" width="20" height="3" rx="1.5" />
    <rect x="2" y="10.5" width="20" height="3" rx="1.5" />
    <rect x="2" y="16.5" width="20" height="3" rx="1.5" />
  </svg>
);

// Nombre para mostrar de cada rol, chico y debajo del nombre de la app.
export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Dueño de la plataforma",
  admin_empresa: "Administrador",
  dispatcher: "Despachador",
  conductor: "Conductor",
  cliente_proveedor: "Solicitante",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

/**
 * Header superior de toda la app. En desktop muestra la marca (logo + nombre + rol chico
 * debajo) a la izquierda; en mobile esa marca se esconde de acá y vive arriba del sidebar
 * (ver Layout.tsx) - en su lugar se muestra el botón de panel lateral para abrir el menú.
 * A la derecha, siempre: tema e identidad de quien está logueado.
 */
export function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60 md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMenu}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-slate-900 shadow-md shadow-amber-500/40 transition-colors hover:bg-amber-300 md:hidden"
        >
          <MenuIcon />
        </button>
        <div className="hidden items-center gap-2.5 md:flex">
          <Logo size={28} />
          <div className="leading-tight">
            <div className="text-lg font-bold text-slate-900 dark:text-white">MigaLog</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              {ROLE_LABELS[user.role]}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-slate-900">
            {initialsOf(user.name)}
          </div>
          <span className="hidden text-sm font-medium text-slate-800 dark:text-slate-200 sm:block">{user.name}</span>
        </div>
      </div>
    </header>
  );
}
