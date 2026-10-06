import { Hono } from "hono";
import { z } from "zod";
import { phoneSchema, rucSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { clients, users } from "../db/schema.js";
import { and, asc, eq } from "drizzle-orm";
import { signSetupToken } from "../lib/jwt.js";
import { firstOrThrow, isForeignKeyViolation } from "../lib/db-helpers.js";
import { param } from "../lib/http.js";
import { requireAuth, requireTenant, requireRole, type AppVariables } from "../middleware/auth.js";

/**
 * Empresas cliente (nivel 2): las que le contratan transporte al tenant. Alta/gestión es
 * de admin_empresa/super_admin - igual que al crear un tenant (ver routes/tenants.ts), acá
 * también se crea de una el primer usuario cliente_admin de esa empresa: ninguna empresa
 * (proveedora o cliente) debería quedar creada sin alguien que pueda administrarla. De ahí
 * en adelante, ese cliente_admin es quien crea su propio equipo (coordinador, solicitantes,
 * etc.) - admin_empresa no vuelve a tocar los usuarios de esa empresa cliente.
 */
export const clientRoutes = new Hono<{ Variables: AppVariables }>();
clientRoutes.use("*", requireAuth, requireTenant());

clientRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const rows = await db.select().from(clients).where(eq(clients.tenantId, tenantId));

  // Mismo criterio que /tenants: se muestra el teléfono del cliente_admin más antiguo de
  // cada empresa cliente, para no tener que abrir otra pantalla en la tabla.
  const admins = await db
    .select({ clientId: users.clientId, phone: users.phone })
    .from(users)
    .where(and(eq(users.role, "cliente_admin"), eq(users.tenantId, tenantId)))
    .orderBy(asc(users.createdAt));
  const adminByClient = new Map<string, { phone: string | null }>();
  for (const a of admins) {
    if (a.clientId && !adminByClient.has(a.clientId)) adminByClient.set(a.clientId, { phone: a.phone });
  }

  const result = rows.map((r) => ({
    ...r,
    adminPhone: adminByClient.get(r.id)?.phone ?? null,
  }));
  return c.json(result);
});

const createSchema = z.object({
  ruc: rucSchema,
  name: z.string().min(1),
  adminName: z.string().min(1),
  adminPhone: phoneSchema,
});

clientRoutes.post("/", requireRole("admin_empresa", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = createSchema.parse(await c.req.json());

  const client = firstOrThrow(await db.insert(clients).values({ tenantId, ruc: body.ruc, name: body.name }).returning());
  // Variable, no literal directo en .values() (ver seed.ts para el detalle de por qué no se anota con typeof users.$inferInsert).
  const adminValues = { tenantId, clientId: client.id, role: "cliente_admin" as const, name: body.adminName, phone: body.adminPhone };
  const admin = firstOrThrow(
    await db.insert(users).values(adminValues as any).returning()
  );

  const setupToken = await signSetupToken(admin);
  return c.json({ client, admin, setupToken }, 201);
});

clientRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId") as string;
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, param(c, "id")), eq(clients.tenantId, tenantId)));
  if (!row) return c.json({ error: "No encontrado" }, 404);
  return c.json(row);
});

const updateSchema = z.object({ ruc: rucSchema, name: z.string().min(1) });

clientRoutes.patch("/:id", requireRole("admin_empresa", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const body = updateSchema.parse(await c.req.json());
  const updateValues = { ruc: body.ruc, name: body.name };
  const [row] = await db
    .update(clients)
    .set(updateValues as any)
    .where(and(eq(clients.id, param(c, "id")), eq(clients.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

clientRoutes.patch("/:id/active", requireRole("admin_empresa", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const activeValues = { active };
  const [row] = await db
    .update(clients)
    .set(activeValues as any)
    .where(and(eq(clients.id, param(c, "id")), eq(clients.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "No encontrada" }, 404);
  return c.json(row);
});

clientRoutes.delete("/:id", requireRole("admin_empresa", "super_admin"), async (c) => {
  const tenantId = c.get("tenantId") as string;
  try {
    const [deleted] = await db
      .delete(clients)
      .where(and(eq(clients.id, param(c, "id")), eq(clients.tenantId, tenantId)))
      .returning();
    if (!deleted) return c.json({ error: "No encontrada" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return c.json({ error: "No se puede eliminar: la empresa cliente ya tiene usuarios o rutas asociadas. Desactivala en su lugar." }, 409);
    }
    throw err;
  }
});
