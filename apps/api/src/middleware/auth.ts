import type { Context, Next } from "hono";
import type { Role } from "@migalog/shared";
import { verifyAccessToken } from "../lib/jwt.js";

export type AppVariables = {
  userId: string;
  tenantId: string | null;
  clientId: string | null;
  role: Role;
};

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "No autenticado" }, 401);

  try {
    const claims = await verifyAccessToken(token);
    c.set("userId", claims.sub);
    c.set("tenantId", claims.tenantId);
    c.set("clientId", claims.clientId);
    c.set("role", claims.role);
    await next();
  } catch {
    return c.json({ error: "Token inválido o expirado" }, 401);
  }
}

/** Exige que el usuario tenga uno de los roles dados. Usar después de requireAuth. */
export function requireRole(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const role = c.get("role") as Role;
    if (!roles.includes(role)) {
      return c.json({ error: "No autorizado para esta acción" }, 403);
    }
    await next();
  };
}

/** Exige un tenant resuelto en el token (todo rol salvo super_admin). */
export function requireTenant() {
  return async (c: Context, next: Next) => {
    const tenantId = c.get("tenantId") as string | null;
    if (!tenantId) return c.json({ error: "Falta contexto de empresa (tenant)" }, 400);
    await next();
  };
}

/** Exige que el usuario pertenezca a una empresa cliente (todo rol cliente_*). */
export function requireOwnClient() {
  return async (c: Context, next: Next) => {
    const clientId = c.get("clientId") as string | null;
    if (!clientId) return c.json({ error: "Falta contexto de empresa cliente" }, 400);
    await next();
  };
}
