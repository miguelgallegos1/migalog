import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.js";
import { clients, users } from "../db/schema.js";
import { and, eq } from "drizzle-orm";
import { signSetupToken } from "../lib/jwt.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";

/**
 * Empresas cliente (nivel 2): las que le contratan transporte al tenant. Alta/gestión es
 * de admin_empresa/super_admin - igual que al crear un tenant (ver routes/tenants.ts), acá
 * también se crea de una el primer usuario cliente_admin de esa empresa: ninguna empresa
 * (proveedora o cliente) debería quedar creada sin alguien que pueda administrarla.
 */
export const clientRoutes = new Hono<{ Variables: AppVariables }>();
clientRoutes.use("*", requireAuth, requireTenant());

clientRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
  return c.json(rows);
});

const createSchema = z.object({
  name: z.string().min(1),
  adminName: z.string().min(1),
  adminEmail: z.string().email(),
});

clientRoutes.post("/", requireRole("admin_empresa", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = createSchema.parse(await c.req.json());

  const client = firstOrThrow(await db.insert(clients).values({ tenantId, name: body.name }).returning());
  const admin = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId, clientId: client.id, role: "cliente_admin", name: body.adminName, email: body.adminEmail })
      .returning()
  );

  const setupToken = await signSetupToken(admin.id);
  return c.json({ client, admin, setupToken }, 201);
});

clientRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, c.req.param("id")), eq(clients.tenantId, tenantId)));
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});
