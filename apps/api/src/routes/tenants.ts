import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { tenants, users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signSetupToken } from "../lib/jwt.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { requireAuth, requireRole, type AppVariables } from "../middleware/auth.js";

export const tenantRoutes = new Hono<{ Variables: AppVariables }>();

tenantRoutes.use("*", requireAuth, requireRole("super_admin"));

tenantRoutes.get("/", async (c) => {
  const all = await db.select().from(tenants);
  return c.json(all);
});

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  adminName: z.string().min(1),
  adminEmail: z.string().email(),
});

tenantRoutes.post("/", async (c) => {
  const body = createTenantSchema.parse(await c.req.json());

  const tenant = firstOrThrow(await db.insert(tenants).values({ name: body.name, slug: body.slug }).returning());
  const admin = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "admin_empresa", name: body.adminName, email: body.adminEmail })
      .returning()
  );

  const setupToken = await signSetupToken(admin.id);
  return c.json({ tenant, admin, setupToken });
});

tenantRoutes.patch("/:id/active", async (c) => {
  const id = c.req.param("id");
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const [tenant] = await db.update(tenants).set({ active }).where(eq(tenants.id, id)).returning();
  if (!tenant) return c.json({ error: "Empresa no encontrada" }, 404);
  return c.json(tenant);
});
