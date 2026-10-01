import { Hono } from "hono";
import { z } from "zod";
import { usesPassword, usesPin, isClientRole, inviteUserSchema, loginPasswordSchema, loginPinSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { users, devices, clients, tenants } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { hashSecret, verifySecret, randomToken } from "../lib/crypto.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { signAccessToken, signSetupToken, verifySetupToken } from "../lib/jwt.js";
import { requireAuth, requireRole, type AppVariables } from "../middleware/auth.js";

const FAILED_ATTEMPTS_LIMIT = 5;
const LOCK_MINUTES = 15;

/**
 * `users.active` no alcanza: desactivar la empresa proveedora (tenant) o la empresa cliente
 * completa debía cortar el acceso de TODOS sus usuarios, pero login/refresh solo miraban el
 * flag individual del usuario - una cuenta seguía entrando con token válido aunque su
 * empresa estuviera desactivada.
 */
async function isAccountUsable(user: { tenantId: string | null; clientId: string | null }): Promise<boolean> {
  if (user.tenantId) {
    const [tenant] = await db.select({ active: tenants.active }).from(tenants).where(eq(tenants.id, user.tenantId));
    if (!tenant?.active) return false;
  }
  if (user.clientId) {
    const [client] = await db.select({ active: clients.active }).from(clients).where(eq(clients.id, user.clientId));
    if (!client?.active) return false;
  }
  return true;
}

/**
 * Arma el objeto "user" que se devuelve al loguearse/refrescar - incluye el nombre de la
 * empresa (proveedora o cliente, según a cuál pertenezca) para que el front lo muestre en el
 * menú de sesión sin tener que pedirlo aparte con un endpoint distinto.
 */
async function buildSessionUser(user: { id: string; name: string; role: (typeof users.$inferSelect)["role"]; tenantId: string | null; clientId: string | null }) {
  const [tenant, client] = await Promise.all([
    user.tenantId ? db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, user.tenantId)) : Promise.resolve([]),
    user.clientId ? db.select({ name: clients.name }).from(clients).where(eq(clients.id, user.clientId)) : Promise.resolve([]),
  ]);
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    clientId: user.clientId,
    tenantName: tenant[0]?.name ?? null,
    clientName: client[0]?.name ?? null,
  };
}

export const authRoutes = new Hono<{ Variables: AppVariables }>();

/**
 * Invita a un usuario dentro del tenant actual. Cada nivel administra SOLO su propio
 * escalón - nadie se salta las atribuciones del otro (es un árbol: plataforma → empresa
 * proveedora → empresa cliente):
 * - admin_empresa solo puede invitar coordinador (su propio equipo de nivel 1, salvo
 *   conductor) - nunca un rol cliente_*, eso es exclusivo del cliente_admin de esa empresa
 *   cliente.
 * - cliente_admin solo puede invitar roles cliente_* (no roles de nivel 1) salvo otro
 *   cliente_admin - ya tiene el suyo, creado junto con la empresa (ver clients.ts) - ni
 *   cliente_conductor - y el usuario invitado hereda automáticamente SU MISMA empresa
 *   cliente, no puede invitar para otra.
 * - super_admin puede invitar cualquier rol (override de plataforma), indicando clientId
 *   cuando el rol es cliente_*.
 * - conductor/cliente_conductor NUNCA se crean acá (ver POST /drivers): necesitan camión
 *   asignado y vigencia de licencia, que esta alta genérica no pide.
 */
authRoutes.post(
  "/invite",
  requireAuth,
  requireRole("admin_empresa", "super_admin", "cliente_admin"),
  async (c) => {
    const body = inviteUserSchema.parse(await c.req.json());
    const tenantId = c.get("tenantId") as string;
    const actorRole = c.get("role");
    const actorClientId = c.get("clientId");

    if (body.role === "super_admin" && actorRole !== "super_admin") {
      return c.json({ error: "Solo super_admin puede crear otro super_admin" }, 403);
    }
    // Conductor/cliente_conductor no se crean acá: necesitan camión asignado y vigencia de
    // licencia, que esta alta genérica no pide - van exclusivamente por POST /drivers (que
    // crea el usuario y el conductor juntos).
    if (body.role === "conductor" || body.role === "cliente_conductor") {
      return c.json({ error: "Un conductor se da de alta desde la pantalla de Conductores, no acá" }, 400);
    }

    let clientId: string | null = null;

    if (actorRole === "cliente_admin") {
      if (!isClientRole(body.role)) {
        return c.json({ error: "Un admin de empresa cliente solo puede invitar roles cliente_*" }, 403);
      }
      // Cada empresa cliente tiene exactamente un admin, creado junto con la empresa (ver
      // clients.ts) - no se puede invitar otro desde acá.
      if (body.role === "cliente_admin") {
        return c.json({ error: "Tu empresa cliente ya tiene un admin - no se puede invitar otro" }, 403);
      }
      clientId = actorClientId;
    } else if (actorRole === "admin_empresa") {
      if (body.role !== "coordinador") {
        return c.json({ error: "admin_empresa solo puede crear coordinador desde acá - los conductores se dan de alta en Conductores, y los usuarios de una empresa cliente los crea su propio cliente_admin" }, 403);
      }
    } else if (isClientRole(body.role)) {
      // Solo super_admin llega acá (admin_empresa ya quedó bloqueado arriba).
      if (!body.clientId) return c.json({ error: "Falta indicar la empresa cliente (clientId)" }, 400);
      const [client] = await db.select().from(clients).where(and(eq(clients.id, body.clientId), eq(clients.tenantId, tenantId!)));
      if (!client) return c.json({ error: "Empresa cliente no encontrada" }, 404);
      clientId = client.id;
    }

    // Variable, no literal directo en .values() (ver seed.ts para el detalle de por qué no se anota con typeof users.$inferInsert).
    const newUserValues = {
      tenantId,
      clientId,
      role: body.role,
      name: body.name,
      phone: body.phone,
    };
    const user = firstOrThrow(
      await db.insert(users).values(newUserValues).returning()
    );

    const setupToken = await signSetupToken(user.id);
    // En producción esto se envía por WhatsApp, no se devuelve en la respuesta.
    return c.json({ user, setupToken, setupMethod: usesPassword(body.role) ? "password" : "pin" });
  }
);

const setupPasswordSchema = z.object({ setupToken: z.string(), password: z.string().min(8) });
authRoutes.post("/setup-password", async (c) => {
  const { setupToken, password } = setupPasswordSchema.parse(await c.req.json());
  const { userId } = await verifySetupToken(setupToken);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !usesPassword(user.role)) return c.json({ error: "Solicitud inválida" }, 400);

  const passwordHash = await hashSecret(password);
  // Variable, no literal directo en .set() (ver seed.ts para el detalle de por qué no se anota con typeof users.$inferInsert).
  const passwordValues = { passwordHash };
  await db.update(users).set(passwordValues).where(eq(users.id, userId));
  return c.json({ ok: true });
});

const setupPinSchema = z.object({
  setupToken: z.string(),
  pin: z.string().length(6).regex(/^\d{6}$/),
  deviceLabel: z.string().optional(),
});
authRoutes.post("/setup-pin", async (c) => {
  const { setupToken, pin, deviceLabel } = setupPinSchema.parse(await c.req.json());
  const { userId } = await verifySetupToken(setupToken);
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !usesPin(user.role)) return c.json({ error: "Solicitud inválida" }, 400);

  const pinHash = await hashSecret(pin);
  const pinValues = { pinHash };
  await db.update(users).set(pinValues).where(eq(users.id, userId));

  const deviceRefreshToken = randomToken();
  const sessionCredentialHash = await hashSecret(deviceRefreshToken);
  const deviceValues = { userId, label: deviceLabel, sessionCredentialHash };
  const device = firstOrThrow(await db.insert(devices).values(deviceValues).returning());

  // deviceRefreshToken se devuelve una sola vez: el cliente lo guarda cifrado en el dispositivo
  // y lo usa junto con PIN/biometría para refrescar la sesión sin volver a escribir el PIN cada vez.
  return c.json({ deviceId: device.id, deviceRefreshToken });
});

authRoutes.post("/login-password", async (c) => {
  const { phone, password } = loginPasswordSchema.parse(await c.req.json());
  const [user] = await db.select().from(users).where(eq(users.phone, phone));
  if (!user || !user.passwordHash || !user.active) {
    return c.json({ error: "Credenciales inválidas" }, 401);
  }
  const valid = await verifySecret(user.passwordHash, password);
  if (!valid) return c.json({ error: "Credenciales inválidas" }, 401);
  if (!(await isAccountUsable(user))) return c.json({ error: "Empresa desactivada" }, 401);

  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, clientId: user.clientId, role: user.role });
  return c.json({ accessToken, user: await buildSessionUser(user) });
});

authRoutes.post("/login-pin", async (c) => {
  const { deviceId, pin } = loginPinSchema.parse(await c.req.json());
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return c.json({ error: "Dispositivo no reconocido" }, 401);

  if (device.lockedUntil && device.lockedUntil > new Date()) {
    return c.json({ error: "Dispositivo bloqueado temporalmente por demasiados intentos" }, 423);
  }

  const [user] = await db.select().from(users).where(eq(users.id, device.userId));
  if (!user || !user.pinHash || !user.active) return c.json({ error: "Credenciales inválidas" }, 401);

  const valid = await verifySecret(user.pinHash, pin);
  if (!valid) {
    const attempts = device.failedAttempts + 1;
    const lockedUntil =
      attempts >= FAILED_ATTEMPTS_LIMIT ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
    const lockoutValues = { failedAttempts: attempts, lockedUntil };
    await db.update(devices).set(lockoutValues).where(eq(devices.id, deviceId));
    return c.json({ error: "PIN incorrecto" }, 401);
  }

  if (!(await isAccountUsable(user))) return c.json({ error: "Empresa desactivada" }, 401);

  const resetAttemptsValues = { failedAttempts: 0, lockedUntil: null };
  await db.update(devices).set(resetAttemptsValues).where(eq(devices.id, deviceId));
  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, clientId: user.clientId, role: user.role });
  return c.json({ accessToken, user: await buildSessionUser(user) });
});

const refreshSchema = z.object({ deviceId: z.string().uuid(), deviceRefreshToken: z.string() });
/**
 * Usado tras un desbloqueo biométrico exitoso en el cliente (WebAuthn a nivel de
 * dispositivo/navegador): el front nunca vuelve a pedir el PIN, solo presenta este
 * secreto guardado localmente para refrescar la sesión.
 */
authRoutes.post("/session/refresh", async (c) => {
  const { deviceId, deviceRefreshToken } = refreshSchema.parse(await c.req.json());
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId));
  if (!device) return c.json({ error: "Dispositivo no reconocido" }, 401);
  if (device.lockedUntil && device.lockedUntil > new Date()) {
    return c.json({ error: "Dispositivo bloqueado temporalmente" }, 423);
  }

  const valid = await verifySecret(device.sessionCredentialHash, deviceRefreshToken);
  if (!valid) return c.json({ error: "Credencial de dispositivo inválida" }, 401);

  const [user] = await db.select().from(users).where(eq(users.id, device.userId));
  if (!user || !user.active) return c.json({ error: "Usuario inactivo" }, 401);
  if (!(await isAccountUsable(user))) return c.json({ error: "Empresa desactivada" }, 401);

  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, clientId: user.clientId, role: user.role });
  return c.json({ accessToken, user: await buildSessionUser(user) });
});

const registerDeviceSchema = z.object({ deviceLabel: z.string().optional() });
/**
 * Equivalente a /setup-pin pero para roles con contraseña (admin_empresa, cliente_admin,
 * etc.): esos roles nunca pasan por /setup-pin, así que no tenían ninguna fila en `devices`
 * y por lo tanto no había nada contra qué habilitar biometría. Se usa una sola vez, desde
 * "Activar biometría" en el menú de sesión, cuando el navegador todavía no tiene un
 * deviceId guardado localmente.
 */
authRoutes.post("/device/register", requireAuth, async (c) => {
  const { deviceLabel } = registerDeviceSchema.parse(await c.req.json().catch(() => ({})));
  const userId = c.get("userId");

  const deviceRefreshToken = randomToken();
  const sessionCredentialHash = await hashSecret(deviceRefreshToken);
  const registerDeviceValues = { userId, label: deviceLabel, sessionCredentialHash };
  const device = firstOrThrow(await db.insert(devices).values(registerDeviceValues).returning());

  return c.json({ deviceId: device.id, deviceRefreshToken });
});

/**
 * Marca el dispositivo como habilitado para biometría. La verificación criptográfica
 * completa de WebAuthn (attestation/COSE) queda para una iteración posterior; para esta
 * demo el gate biométrico real ocurre en el navegador (Face/Touch ID vía WebAuthn) antes
 * de llamar a /session/refresh con el secreto ya guardado localmente.
 */
authRoutes.post("/device/enable-biometric", requireAuth, async (c) => {
  const schema = z.object({ deviceId: z.string().uuid(), webauthnCredentialId: z.string() });
  const { deviceId, webauthnCredentialId } = schema.parse(await c.req.json());
  const userId = c.get("userId");

  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
  if (!device) return c.json({ error: "Dispositivo no encontrado" }, 404);

  const biometricValues = { webauthnCredentialId };
  await db.update(devices).set(biometricValues).where(eq(devices.id, deviceId));
  return c.json({ ok: true });
});
