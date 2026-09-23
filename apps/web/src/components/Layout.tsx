import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { Header, ROLE_LABELS } from "./Header";
import { Logo } from "./Logo";
import type { Role } from "@migalog/shared";

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

type NavItem = { to: string; label: string; roles: Role[] };
type NavGroup = { label: string; roles: Role[]; items: NavItem[] };

const NIVEL1_OPS: Role[] = ["admin_empresa", "coordinador", "super_admin"];
const NIVEL2_ALL: Role[] = ["cliente_admin", "cliente_coordinador", "cliente_jefe", "cliente_visualizador", "cliente_solicitante"];

// Ítems de siempre, sin agrupar - relevantes para todo el mundo independientemente de su nivel.
const TOP_LEVEL_LINKS: NavItem[] = [
  { to: "/", label: "Panel de control", roles: [...NIVEL1_OPS, "conductor", ...NIVEL2_ALL] },
  { to: "/rutas/nueva", label: "Nueva solicitud", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante", "admin_empresa", "super_admin"] },
  { to: "/historial", label: "Historial", roles: [...NIVEL1_OPS, "cliente_admin", "cliente_coordinador", "cliente_jefe", "cliente_visualizador"] },
];

/**
 * Menú en cascada de 3 grupos, uno por nivel de la jerarquía (ver plan de roles): quien
 * tiene visibilidad sobre varios niveles (típicamente super_admin) ve los 3; admin_empresa
 * solo ve "Empresas proveedoras"; cliente_admin solo ve "Empresas cliente". Un grupo sin
 * ítems visibles para el rol actual directamente no se muestra.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    // Distinto de "Administración" (el grupo de abajo) a propósito: este es nivel 0
    // (plataforma), el de abajo es nivel 1 (la propia empresa) - un super_admin ve los
    // dos juntos, así que necesitan etiquetas que no se confundan entre sí.
    label: "Plataforma",
    roles: ["super_admin"],
    items: [{ to: "/empresas", label: "Crear empresa proveedora", roles: ["super_admin"] }],
  },
  {
    // "Administración" y no "Empresas proveedoras": quien lo mira ES la empresa
    // proveedora, no tiene sentido que se autodenomine así en su propio menú.
    label: "Administración",
    roles: NIVEL1_OPS,
    items: [
      { to: "/usuarios", label: "Usuarios", roles: ["admin_empresa", "super_admin"] },
      { to: "/conductores", label: "Conductores", roles: ["admin_empresa", "super_admin"] },
      { to: "/camiones", label: "Camiones", roles: ["admin_empresa", "super_admin"] },
      { to: "/catalogo", label: "Catálogo de rutas", roles: NIVEL1_OPS },
    ],
  },
  {
    label: "Empresas cliente",
    roles: ["admin_empresa", "super_admin", "cliente_admin", "cliente_coordinador", "cliente_solicitante"],
    items: [
      { to: "/clientes", label: "Crear empresa cliente", roles: ["admin_empresa", "super_admin"] },
      { to: "/rutas/nueva", label: "Nueva solicitud", roles: ["admin_empresa", "super_admin"] },
      { to: "/usuarios", label: "Coordinador / usuarios", roles: ["admin_empresa", "super_admin"] },
      { to: "/usuarios", label: "Mi equipo", roles: ["cliente_admin"] },
      { to: "/catalogo", label: "Catálogo de rutas", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"] },
    ],
  },
];

function NavLinkItem({ item, onClick }: { item: NavItem; onClick: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onClick}
      className={({ isActive }) =>
        // El item activo usa el color de marca (amarillo) para que sea obvio dónde está parado el usuario.
        `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-amber-400 text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

/**
 * Layout general de toda la app autenticada: header superior de ancho completo (marca +
 * rol a la izquierda en desktop, tema + usuario a la derecha siempre), sidebar de
 * navegación por rol (fijo en pantallas grandes, drawer colapsable en mobile vía el botón
 * de panel del header - ahí sí lleva la marca arriba, porque el header no la muestra en
 * mobile), y la página actual vía <Outlet/>.
 */
export function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const role = user?.role;
  const topLevelLinks = role ? TOP_LEVEL_LINKS.filter((l) => l.roles.includes(role)) : [];
  const visibleGroups = role
    ? NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter(
        (g) => g.roles.includes(role) && g.items.length > 0
      )
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <Header onToggleMenu={() => setMenuOpen((v) => !v)} />

      <div className="relative flex flex-1">
        {/* Fondo oscuro detrás del drawer en mobile (relativo a este contenedor, así arranca
            justo debajo del header en vez de taparlo) - clickear afuera lo cierra */}
        {menuOpen && <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />}

        <aside
          className={`absolute inset-y-0 left-0 z-40 flex w-64 -translate-x-full transform flex-col border-r border-slate-200 bg-white p-4 transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 md:static md:z-auto md:translate-x-0 md:bg-white/60 md:dark:bg-slate-900/60 ${
            menuOpen ? "translate-x-0" : ""
          }`}
        >
          {/* La marca solo aparece acá en mobile (el header ya la muestra en desktop). */}
          {user && (
            <div className="mb-4 flex items-center gap-2.5 px-2 md:hidden">
              <Logo size={28} />
              <div className="leading-tight">
                <div className="text-lg font-bold text-slate-900 dark:text-white">MigaLog</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {ROLE_LABELS[user.role]}
                </div>
              </div>
            </div>
          )}

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {topLevelLinks.map((item) => (
              <NavLinkItem key={item.to} item={item} onClick={() => setMenuOpen(false)} />
            ))}

            {visibleGroups.map((group) => {
              const isOpen = !collapsedGroups.has(group.label);
              return (
                <div key={group.label} className="mt-2">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
                  >
                    {group.label}
                    <ChevronIcon open={isOpen} />
                  </button>
                  {isOpen && (
                    <div className="mt-1 flex flex-col gap-1 border-l border-slate-200 pl-3 dark:border-slate-800">
                      {group.items.map((item) => (
                        <NavLinkItem key={`${group.label}-${item.to}-${item.label}`} item={item} onClick={() => setMenuOpen(false)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-4 flex items-center justify-center gap-2 rounded-md border border-slate-200 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogoutIcon />
            Cerrar sesión
          </button>
        </aside>

        <main className="flex-1 overflow-y-auto p-4 text-slate-900 dark:text-slate-100 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
