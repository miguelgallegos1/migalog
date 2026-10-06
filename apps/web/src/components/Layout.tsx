import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, FilePlus2, History, Building2, Building, Users, UsersRound, UserRound, Truck, Route, MapPin } from "lucide-react";
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

// Íconos de lucide-react (solo se empaquetan los que se importan). Cada sección tiene un color
// propio para reconocer el destino de un vistazo; las clases van completas para que Tailwind
// las incluya en el build.
const TONES = {
  sky: { idle: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300", active: "bg-sky-500 text-white shadow-sm shadow-sky-500/40" },
  emerald: { idle: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300", active: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/40" },
  violet: { idle: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300", active: "bg-violet-500 text-white shadow-sm shadow-violet-500/40" },
  amber: { idle: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300", active: "bg-amber-500 text-white shadow-sm shadow-amber-500/40" },
  rose: { idle: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300", active: "bg-rose-500 text-white shadow-sm shadow-rose-500/40" },
  orange: { idle: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300", active: "bg-orange-500 text-white shadow-sm shadow-orange-500/40" },
  teal: { idle: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-300", active: "bg-teal-500 text-white shadow-sm shadow-teal-500/40" },
  indigo: { idle: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300", active: "bg-indigo-500 text-white shadow-sm shadow-indigo-500/40" },
  fuchsia: { idle: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/20 dark:text-fuchsia-300", active: "bg-fuchsia-500 text-white shadow-sm shadow-fuchsia-500/40" },
} as const;
type Tone = keyof typeof TONES;

type NavItem = { to: string; label: string; roles: Role[]; icon: LucideIcon; tone: Tone };
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
      { to: "/", label: "Panel de control", roles: [...NIVEL1_OPS, "conductor", ...NIVEL2_ALL], icon: LayoutDashboard, tone: "sky" },
      { to: "/rutas/nueva", label: "Nueva solicitud", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"], icon: FilePlus2, tone: "emerald" },
      { to: "/historial", label: "Historial", roles: [...NIVEL1_OPS, "cliente_admin", "cliente_coordinador", "cliente_jefe", "cliente_visualizador"], icon: History, tone: "violet" },
    ],
  },
  {
    label: "Plataforma",
    roles: ["super_admin"],
    items: [{ to: "/empresas", label: "Crear empresa proveedora", roles: ["super_admin"], icon: Building2, tone: "indigo" }],
  },
  {
    // "Administración" y no "Empresas proveedoras": quien lo mira ES la empresa
    // proveedora, no tiene sentido que se autodenomine así en su propio menú.
    label: "Administración",
    roles: NIVEL1_OPS,
    items: [
      { to: "/usuarios", label: "Usuarios", roles: ["admin_empresa"], icon: Users, tone: "indigo" },
      { to: "/conductores", label: "Conductores", roles: ["admin_empresa"], icon: UserRound, tone: "orange" },
      { to: "/camiones", label: "Camiones", roles: ["admin_empresa"], icon: Truck, tone: "teal" },
      { to: "/catalogo", label: "Catálogo de rutas", roles: NIVEL1_OPS, icon: Route, tone: "amber" },
    ],
  },
  {
    label: "Empresas cliente",
    roles: ["admin_empresa", "cliente_admin", "cliente_coordinador", "cliente_solicitante"],
    items: [
      // admin_empresa solo crea empresas cliente acá - no solicita ni aprueba rutas, eso es
      // decisión de la empresa cliente. La gestión de usuarios propios ya vive en
      // "Administración → Usuarios", no se duplica acá.
      { to: "/clientes", label: "Crear empresa cliente", roles: ["admin_empresa"], icon: Building, tone: "fuchsia" },
      { to: "/usuarios", label: "Mi equipo", roles: ["cliente_admin"], icon: UsersRound, tone: "indigo" },
      { to: "/sitios", label: "Sitios", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"], icon: MapPin, tone: "rose" },
      { to: "/catalogo", label: "Catálogo de rutas", roles: ["cliente_admin", "cliente_coordinador", "cliente_solicitante"], icon: Route, tone: "amber" },
      // Flota propia de la empresa cliente - puede despachar sus propias rutas con su
      // propio camión + conductor, sin depender de la proveedora (ver RouteDetail.tsx).
      { to: "/conductores", label: "Conductores", roles: ["cliente_admin", "cliente_coordinador"], icon: UserRound, tone: "orange" },
      { to: "/camiones", label: "Camiones", roles: ["cliente_admin", "cliente_coordinador"], icon: Truck, tone: "teal" },
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
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
              isActive ? TONES[item.tone].active : TONES[item.tone].idle
            }`}
          >
            <item.icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
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
