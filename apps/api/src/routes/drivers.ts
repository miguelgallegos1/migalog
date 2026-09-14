import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { drivers } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireTenant, type AppVariables } from "../middleware/auth.js";

export const driverRoutes = new Hono<{ Variables: AppVariables }>();
driverRoutes.use("*", requireAuth, requireTenant());

driverRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rows = await db.select().from(drivers).where(eq(drivers.tenantId, tenantId));
  return c.json(rows);
});

const createSchema = z.object({ userId: z.string().uuid(), licenseNumber: z.string().min(1) });
driverRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = createSchema.parse(await c.req.json());
  const [row] = await db.insert(drivers).values({ tenantId, ...body }).returning();
  return c.json(row, 201);
});

const statusSchema = z.object({ status: z.enum(["activo", "inactivo"]) });
driverRoutes.patch("/:id/status", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { status } = statusSchema.parse(await c.req.json());
  const [row] = await db
    .update(drivers)
    .set({ status })
    .where(and(eq(drivers.id, c.req.param("id")), eq(drivers.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});
