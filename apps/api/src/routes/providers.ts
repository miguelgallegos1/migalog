import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { providers } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireTenant, type AppVariables } from "../middleware/auth.js";

export const providerRoutes = new Hono<{ Variables: AppVariables }>();
providerRoutes.use("*", requireAuth, requireTenant());

providerRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rows = await db.select().from(providers).where(eq(providers.tenantId, tenantId));
  return c.json(rows);
});

const createSchema = z.object({ name: z.string().min(1), contactUserId: z.string().uuid().optional() });
providerRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = createSchema.parse(await c.req.json());
  const [row] = await db.insert(providers).values({ tenantId, ...body }).returning();
  return c.json(row, 201);
});

providerRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const [row] = await db
    .select()
    .from(providers)
    .where(and(eq(providers.id, c.req.param("id")), eq(providers.tenantId, tenantId)));
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});
