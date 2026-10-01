import { Hono } from "hono";
import { z } from "zod";
import { phoneSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { tenants, users } from "../db/schema.js";
import { asc, eq } from "drizzle-orm";
import { signSetupToken } from "../lib/jwt.js";
import { firstOrThrow, isForeignKeyViolation } from "../lib/db-helpers.js";
import { requireAuth, requireRole, type AppVariables } from "../middleware/auth.js";

export const tenantRoutes = new Hono<{ Variables: AppVariables }>();

tenantRoutes.use("*", requireAuth, requireRole("super_admin"));

tenantRoutes.get("/", async (c) => {
  const all = await db.select().from(tenants);

  // Para mostrar el teléfono de contacto en la tabla sin abrir otra pantalla: se toma el
  // admin_empresa más antiguo de cada tenant (el que se creó junto con la empresa).
  const admins = await db
    .select({ tenantId: users.tenantId, phone: users.phone })
    .from(users)
    .where(eq(users.role, "admin_empresa"))
    .orderBy(asc(users.createdAt));
  const adminByTenant = new Map<string, { phone: string | null }>();
  for (const a of admins) {
    if (a.tenantId && !adminByTenant.has(a.tenantId)) adminByTenant.set(a.tenantId, { phone: a.phone });
  }

  const result = all.map((t) => ({
    ...t,
    adminPhone: adminByTenant.get(t.id)?.phone ?? null,
  }));
  return c.json(result);
});

const createTenantSchema = z.object({
  ruc: z.string().min(1),
  name: z.string().min(1),
  adminName: z.string().min(1),
  adminPhone: phoneSchema,
});

/** Convierte la razón social en un slug base (a-z0-9-), usado solo internamente para el ruteo de WhatsApp. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Genera un slug único agregando un sufijo numérico si ya existe (no se le pide al usuario, es un detalle interno). */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "empresa";
  let candidate = root;
  let suffix = 1;
  while (true) {
    const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate));
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

tenantRoutes.post("/", async (c) => {
  const body = createTenantSchema.parse(await c.req.json());
  const slug = await uniqueSlug(body.name);

  const tenant = firstOrThrow(await db.insert(tenants).values({ ruc: body.ruc, name: body.name, slug }).returning());
  // Asignado a una variable sin anotar su tipo con typeof users.$inferInsert a propósito
  // (ver seed.ts para el detalle de por qué).
  const adminValues = { tenantId: tenant.id, role: "admin_empresa" as const, name: body.adminName, phone: body.adminPhone };
  const admin = firstOrThrow(
    await db.insert(users).values(adminValues as any).returning()
  );

  const setupToken = await signSetupToken(admin.id);
  return c.json({ tenant, admin, setupToken });
});

tenantRoutes.patch("/:id/active", async (c) => {
  const id = c.req.param("id");
  const { active } = z.object({ active: z.boolean() }).parse(await c.req.json());
  const activeValues = { active };
  const [tenant] = await db.update(tenants).set(activeValues as any).where(eq(tenants.id, id)).returning();
  if (!tenant) return c.json({ error: "Empresa no encontrada" }, 404);
  return c.json(tenant);
});

const updateTenantSchema = z.object({ ruc: z.string().min(1), name: z.string().min(1) });

tenantRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = updateTenantSchema.parse(await c.req.json());
  const updateValues = { ruc: body.ruc, name: body.name };
  const [tenant] = await db.update(tenants).set(updateValues as any).where(eq(tenants.id, id)).returning();
  if (!tenant) return c.json({ error: "Empresa no encontrada" }, 404);
  return c.json(tenant);
});

tenantRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const [deleted] = await db.delete(tenants).where(eq(tenants.id, id)).returning();
    if (!deleted) return c.json({ error: "Empresa no encontrada" }, 404);
    return c.json({ ok: true });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return c.json({ error: "No se puede eliminar: la empresa ya tiene datos asociados (usuarios, clientes o rutas). Desactivala en su lugar." }, 409);
    }
    throw err;
  }
});
