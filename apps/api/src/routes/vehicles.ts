import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { vehicles } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireTenant, type AppVariables } from "../middleware/auth.js";

export const vehicleRoutes = new Hono<{ Variables: AppVariables }>();
vehicleRoutes.use("*", requireAuth, requireTenant());

vehicleRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rows = await db.select().from(vehicles).where(eq(vehicles.tenantId, tenantId));
  return c.json(rows);
});

const createSchema = z.object({ plate: z.string().min(3), capacityKg: z.number().int().positive().optional() });
vehicleRoutes.post("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = createSchema.parse(await c.req.json());
  const [row] = await db.insert(vehicles).values({ tenantId, ...body }).returning();
  return c.json(row, 201);
});

const statusSchema = z.object({ status: z.enum(["activo", "mantenimiento", "inactivo"]) });
vehicleRoutes.patch("/:id/status", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { status } = statusSchema.parse(await c.req.json());
  const [row] = await db
    .update(vehicles)
    .set({ status })
    .where(and(eq(vehicles.id, c.req.param("id")), eq(vehicles.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});
