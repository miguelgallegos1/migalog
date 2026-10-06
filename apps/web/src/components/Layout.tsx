import { useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useIdleLogout } from "../hooks/useIdleLogout";
import { Header } from "./Header";
import { Logo } from "./Logo";
import type { Role } from "@migalog/shared";

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// Un ícono por ítem de nav (y uno por grupo, chico, al lado del label) - ayuda a reconocer
// cada destino de un vistazo en vez de solo leer texto, sobre todo con el menú colapsado.
const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="12" width="8" height="9" rx="1.5" />
    <rect x="3" y="15" width="8" height="6" rx="1.5" />
  </svg>
);
const FilePlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M12 12v6M9 15h6" />
  </svg>
);
const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);
const BuildingPlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M4 21h16M9 8h1M9 12h1M9 16h1" />
    <path d="M19 12v6M16 15h6" />
  </svg>
);
const BuildingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M4 21h16M9 8h1M9 12h1M9 16h1M14 21v-4h4v4" />
  </svg>
);
const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8a3 3 0 1 1 0 5.98M20.5 20c0-2.6-1.8-4.8-4.2-5.5" />
  </svg>
);
const SteeringWheelIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M12 3v6.8M6 17.5l4.5-4.3M18 17.5l-4.5-4.3" />
  </svg>
);
const TruckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M2 7h11v10H2zM13 10h4l4 3.5V17h-8z" />
    <circle cx="6.5" cy="18.5" r="1.7" />
    <circle cx="16.5" cy="18.5" r="1.7" />
  </svg>
);
const RouteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <circle cx="5" cy="6" r="2.2" />
    <circle cx="19" cy="18" r="2.2" />
    <path d="M6.8 7.5C9 10 6 13 9 15.5c2.5 2 5.5-1 8-1" />
  </svg>
);
const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

type NavItem = { to: string; label: string; roles: Role[]; icon: ReactNode };
type NavGroup = { label: string; roles: Role[]; items: NavItem[] };

// Roles de nivel 1 (empresa proveedora) que SÍ operan dentro de un tenant. super_admin
// queda afuera a propósito: no tiene tenant propio, así que ninguna pantalla operativa le
// funcionaría igual (el backend le rechazaría el request por falta de contexto de tenant).
const NIVEL1_OPS: Role[] = ["admin_empresa", "coordinador"];
const NIVEL2_ALL: Role[] = ["cliente_admin", "cliente_coordinador", "cliente_jefe", "cliente_visualizador", "cliente_solicitante", "cliente_conductor"];

/**
 * Menú en cascada, todo agrupado - ningún ítem queda suelto fuera de una sección, ni
 * siquiera "Panel de control"/"Historial". "Rutas" es el grupo de siempre para todo el
 * mundo; "Plataforma" es solo de super_admin (crear empresas proveedoras, nada operativo,
 * no le pertenece ningún tenant); "Administración" es de admin_empresa/coordinador; y
 * "Empresas cliente" es donde admin_empresa crea empresas cliente y los roles cliente_*
 * operan las suyas. Un grupo sin ítems visibles para el rol actual directamente no se muestra.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Rutas",
    roles: [...NIVEL1_OPS, "conductor", ...NIVEL2_ALL],
    items: [
      { to: "/", label: "Panel de control", roles: [...NIVEL1_OPS, "conductor", ...NIVEL2_ALL], icon: <DashboardIcon /> },
      { to: "/rutas/nueva", label: "Nueva solicitud", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"], icon: <FilePlusIcon /> },
      { to: "/historial", label: "Historial", roles: [...NIVEL1_OPS, "cliente_admin", "cliente_coordinador", "cliente_jefe", "cliente_visualizador"], icon: <HistoryIcon /> },
    ],
  },
  {
    label: "Plataforma",
    roles: ["super_admin"],
    items: [{ to: "/empresas", label: "Crear empresa proveedora", roles: ["super_admin"], icon: <BuildingPlusIcon /> }],
  },
  {
    // "Administración" y no "Empresas proveedoras": quien lo mira ES la empresa
    // proveedora, no tiene sentido que se autodenomine así en su propio menú.
    label: "Administración",
    roles: NIVEL1_OPS,
    items: [
      { to: "/usuarios", label: "Usuarios", roles: ["admin_empresa"], icon: <UsersIcon /> },
      { to: "/conductores", label: "Conductores", roles: ["admin_empresa"], icon: <SteeringWheelIcon /> },
      { to: "/camiones", label: "Camiones", roles: ["admin_empresa"], icon: <TruckIcon /> },
      { to: "/catalogo", label: "Catálogo de rutas", roles: NIVEL1_OPS, icon: <RouteIcon /> },
    ],
  },
  {
    label: "Empresas cliente",
    roles: ["admin_empresa", "cliente_admin", "cliente_coordinador", "cliente_solicitante"],
    items: [
      // admin_empresa solo crea empresas cliente acá - no solicita ni aprueba rutas, eso es
      // decisión de la empresa cliente. La gestión de usuarios propios ya vive en
      // "Administración → Usuarios", no se duplica acá.
      { to: "/clientes", label: "Crear empresa cliente", roles: ["admin_empresa"], icon: <BuildingIcon /> },
      { to: "/usuarios", label: "Mi equipo", roles: ["cliente_admin"], icon: <UsersIcon /> },
      { to: "/sitios", label: "Sitios", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"], icon: <MapPinIcon /> },
      { to: "/catalogo", label: "Catálogo de rutas", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"], icon: <RouteIcon /> },
      // Flota propia de la empresa cliente - puede despachar sus propias rutas con su
      // propio camión + conductor, sin depender de la proveedora (ver RouteDetail.tsx).
      { to: "/conductores", label: "Conductores", roles: ["cliente_admin", "cliente_coordinador"], icon: <SteeringWheelIcon /> },
      { to: "/camiones", label: "Camiones", roles: ["cliente_admin", "cliente_coordinador"], icon: <TruckIcon /> },
    ],
  },
];

function NavLinkItem({ item, onClick, collapsed = false }: { item: NavItem; onClick: () => void; collapsed?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        // El ítem activo usa un fondo tenue con el color de marca (celeste), no el amarillo
        // sólido - ese queda reservado para botones de acción (Button.tsx), así "dónde estoy
        // parado" y "qué puedo ejecutar" no compiten por el mismo color en la misma pantalla.
        // El "levante" al pasar el mouse es el mismo micro-efecto que los botones de acción.
        // Ya no lleva borde izquierdo - el propio fondo + el chip de color detrás del ícono
        // (ver abajo) alcanzan para marcar selección, sin la línea recta pegada al borde.
        `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm ${collapsed ? "justify-center px-0" : ""} ${
          isActive
            ? "bg-brand-100 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
            : "font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
              isActive ? "bg-brand-500 text-white shadow-sm shadow-brand-500/40" : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {item.icon}
          </span>
          {!collapsed && item.label}
        </>
      )}
    </NavLink>
  );
}

/**
 * Layout general de toda la app autenticada: header superior de ancho completo (marca a la
 * izquierda en desktop, menú de sesión a la derecha siempre - ver UserMenu.tsx), sidebar de
 * navegación por rol (fijo en pantallas grandes, drawer colapsable en mobile vía el botón
 * de panel del header - ahí sí lleva la marca arriba, porque el header no la muestra en
 * mobile), y la página actual vía <Outlet/>.
 */
export function Layout() {
  const user = useAuthStore((s) => s.user);
  useIdleLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("migalog-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("migalog-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // sin localStorage (modo privado) - la preferencia dura solo esta sesión
      }
      return next;
    });
  }
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  const role = user?.role;
  const visibleGroups = role
    ? NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter(
        (g) => g.roles.includes(role) && g.items.length > 0
      )
    : [];

  return (
    // Alto fijo a la pantalla (no "min-h-screen") + overflow-hidden acá y en la fila de
    // abajo: así el scroll pasa a vivir DENTRO de <aside> (su <nav>) y de <main>, cada uno
    // por separado, en vez de que la página entera se desplace y se lleve el menú con ella.
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <Header onToggleMenu={() => setMenuOpen((v) => !v)} />

      <div className="relative flex flex-1 overflow-hidden">
        {/* Fondo oscuro detrás del drawer en mobile (relativo a este contenedor, así arranca
            justo debajo del header en vez de taparlo) - clickear afuera lo cierra */}
        {menuOpen && <div className="absolute inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />}

        <aside
          className={`absolute inset-y-0 left-0 z-40 flex w-64 -translate-x-full transform flex-col border-r border-slate-200 bg-white p-4 transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900 md:static md:z-auto md:translate-x-0 md:bg-white md:shadow-sm md:dark:bg-slate-900/60 ${
            sidebarCollapsed ? "md:w-16 md:px-2" : "md:w-64"
          } ${menuOpen ? "translate-x-0" : ""}`}
        >
          {/* La marca solo aparece acá en mobile (el header ya la muestra en desktop). El rol
              y la empresa ya no se repiten acá - viven en el menú de sesión (UserMenu.tsx),
              que sigue visible en el header también en mobile. */}
          {user && (
            <div className="mb-4 flex items-center gap-2.5 px-2 md:hidden">
              <Logo size={28} />
              <div className="text-lg font-bold text-slate-900 dark:text-white">MigaLog</div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            aria-label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"}
            className={`mb-2 hidden h-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 md:flex dark:text-slate-500 dark:hover:bg-slate-800 ${sidebarCollapsed ? "w-full" : "self-end w-7"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {visibleGroups.map((group) => {
              const isOpen = !collapsedGroups.has(group.label);
              if (sidebarCollapsed) {
                return (
                  <div key={group.label} className="mt-2 flex flex-col gap-1">
                    <div className="mx-auto my-1 h-px w-8 bg-slate-200 dark:bg-slate-800" />
                    {group.items.map((item) => (
                      <NavLinkItem key={`${group.label}-${item.to}-${item.label}`} item={item} collapsed onClick={() => setMenuOpen(false)} />
                    ))}
                  </div>
                );
              }
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
        </aside>

        <main className="flex-1 overflow-y-auto p-4 text-slate-900 dark:text-slate-100 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
