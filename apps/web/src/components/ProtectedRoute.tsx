import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import type { Role } from "@migalog/shared";

export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
