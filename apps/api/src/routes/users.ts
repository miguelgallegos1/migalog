import { Hono } from "hono";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth, requireTenant, type AppVariables } from "../middleware/auth.js";

export const userRoutes = new Hono<{ Variables: AppVariables }>();
userRoutes.use("*", requireAuth, requireTenant());

userRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rows = await db
    .select({ id: users.id, name: users.name, role: users.role, email: users.email, phone: users.phone, active: users.active })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  return c.json(rows);
});
