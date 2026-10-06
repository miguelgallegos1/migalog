import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import type { Role } from "@migalog/shared";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  // PIN temporal: antes de usar la app, la persona tiene que cambiarlo en Mi perfil.
  if (user.mustChangePin && location.pathname !== "/perfil") return <Navigate to="/perfil" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
