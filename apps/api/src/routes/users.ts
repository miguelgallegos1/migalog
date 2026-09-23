import { Hono } from "hono";
import { isClientRole } from "@migalog/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireTenant, type AppVariables } from "../middleware/auth.js";

export const userRoutes = new Hono<{ Variables: AppVariables }>();
userRoutes.use("*", requireAuth, requireTenant());

/**
 * admin_empresa/coordinador/super_admin ven todos los usuarios del tenant (nivel 1 y
 * todas las empresas cliente). Un rol cliente_* solo ve los usuarios de SU PROPIA empresa
 * cliente - no le corresponde ver el resto del tenant ni otras empresas cliente.
 */
userRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const role = c.get("role");
  const clientId = c.get("clientId");

  const scope = isClientRole(role) && clientId ? and(eq(users.tenantId, tenantId), eq(users.clientId, clientId)) : eq(users.tenantId, tenantId);

  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, email: users.email, phone: users.phone, active: users.active })
    .from(users)
    .where(scope);
  return c.json(rows);
});
