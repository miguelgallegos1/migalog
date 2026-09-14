import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { Header, ROLE_LABELS } from "./Header";
import { Logo } from "./Logo";

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
);

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

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const links: { to: string; label: string; roles: string[] }[] = [
    // "Panel de control" es visible para todos los roles (no solo despacho): es la única
    // pantalla desde la que un conductor o un solicitante pueden llegar al detalle de su
    // ruta y marcar paradas / ver el estado - sin este link quedaban sin ningún lugar a
    // dónde navegar después de loguearse.
    { to: "/", label: "Panel de control", roles: ["admin_empresa", "dispatcher", "super_admin", "conductor", "cliente_proveedor"] },
    { to: "/rutas/nueva", label: "Nueva solicitud", roles: ["cliente_proveedor", "admin_empresa", "super_admin"] },
    { to: "/historial", label: "Historial", roles: ["admin_empresa", "dispatcher", "super_admin"] },
    { to: "/proveedores", label: "Proveedores", roles: ["admin_empresa", "super_admin"] },
    { to: "/conductores", label: "Conductores", roles: ["admin_empresa", "super_admin"] },
    { to: "/camiones", label: "Camiones", roles: ["admin_empresa", "super_admin"] },
    { to: "/usuarios", label: "Usuarios", roles: ["admin_empresa", "super_admin"] },
    { to: "/empresas", label: "Empresas (tenants)", roles: ["super_admin"] },
  ];

  // Solo se muestran los links permitidos para el rol del usuario logueado.
  const visibleLinks = links.filter((l) => user && l.roles.includes(user.role));

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

          <nav className="flex flex-col gap-1">
            {visibleLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  // El item activo usa el color de marca (amarillo) para que sea obvio dónde
                  // está parado el usuario.
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-amber-400 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-auto flex items-center justify-center gap-2 rounded-md border border-slate-200 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
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
