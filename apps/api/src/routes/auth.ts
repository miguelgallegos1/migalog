import { Hono } from "hono";
import { z } from "zod";
import { isClientRole, inviteUserSchema, phoneSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { users, devices, clients, tenants, loginAttempts } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { hashSecret, verifySecret, randomToken } from "../lib/crypto.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { findUserByPin, isPinTaken, issueTemporaryPin, setUserPin } from "../lib/pin.js";
import { signAccessToken } from "../lib/jwt.js";
import { requireAuth, requireRole, type AppVariables } from "../middleware/auth.js";

/** Intentos de PIN fallidos permitidos por IP en la ventana. Con un PIN de 6 dígitos esto es lo que impide la fuerza bruta. */
const LOGIN_ATTEMPTS_LIMIT = 10;
const LOGIN_WINDOW_MINUTES = 15;

const pinSchema = z.string().regex(/^\d{6}$/, "El PIN tiene 6 dígitos");

/** IP de quien hace el pedido (Vercel la pasa en x-forwarded-for). */
function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Cuántos intentos fallidos lleva esta IP dentro de la ventana vigente. */
async function attemptsInWindow(ip: string): Promise<number> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
  if (!row) return 0;
  const windowEnd = row.windowStart.getTime() + LOGIN_WINDOW_MINUTES * 60_000;
  return Date.now() < windowEnd ? row.count : 0;
}

async function recordFailedAttempt(ip: string): Promise<void> {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip));
  const windowEnd = row ? row.windowStart.getTime() + LOGIN_WINDOW_MINUTES * 60_000 : 0;
  if (!row || Date.now() >= windowEnd) {
    const fresh = { ip, count: 1, windowStart: new Date() };
    if (row) await db.update(loginAttempts).set(fresh as any).where(eq(loginAttempts.ip, ip));
    else await db.insert(loginAttempts).values(fresh as any);
    return;
  }
  const bumped = { count: row.count + 1 };
  await db.update(loginAttempts).set(bumped as any).where(eq(loginAttempts.ip, ip));
}

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
 * menú de sesión sin tener que pedirlo aparte con un endpoint distinto. `mustChangePin` le dice
 * al front que tiene que cambiar el PIN temporal antes de usar la app.
 */
async function buildSessionUser(user: { id: string; name: string; role: (typeof users.$inferSelect)["role"]; tenantId: string | null; clientId: string | null; mustChangePin: boolean }) {
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
    mustChangePin: user.mustChangePin,
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
 * La respuesta trae el PIN temporal una sola vez: se entrega en persona y la persona lo cambia
 * en su primer ingreso.
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
      await db.insert(users).values(newUserValues as any).returning()
    );

    const temporaryPin = await issueTemporaryPin(user.id);
    return c.json({ user, temporaryPin });
  }
);

const loginSchema = z.object({ pin: pinSchema });

/**
 * Ingreso único para todos los roles: solo el PIN de 6 dígitos (es único en toda la base, así
 * que identifica a una sola persona). Como un PIN de 6 dígitos se puede adivinar probando, los
 * intentos fallidos se cuentan por IP y, tras 10 en 15 minutos, se bloquea esa IP.
 */
authRoutes.post("/login", async (c) => {
  const { pin } = loginSchema.parse(await c.req.json());
  const ip = clientIp(c);
  if ((await attemptsInWindow(ip)) >= LOGIN_ATTEMPTS_LIMIT) {
    return c.json({ error: "Demasiados intentos. Espera 15 minutos e intenta de nuevo." }, 429);
  }

  const user = await findUserByPin(pin);
  if (!user || !user.pinHash || !user.active) {
    await recordFailedAttempt(ip);
    return c.json({ error: "PIN incorrecto" }, 401);
  }
  if (!(await verifySecret(user.pinHash, pin))) {
    await recordFailedAttempt(ip);
    return c.json({ error: "PIN incorrecto" }, 401);
  }
  if (!(await isAccountUsable(user))) return c.json({ error: "Empresa desactivada" }, 401);

  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
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
 * Registra este navegador/teléfono para ingresar con biometría. Se usa una sola vez, desde
 * "Activar biometría" en el menú de sesión, cuando el dispositivo todavía no tiene un
 * deviceId guardado localmente.
 */
authRoutes.post("/device/register", requireAuth, async (c) => {
  const { deviceLabel } = registerDeviceSchema.parse(await c.req.json().catch(() => ({})));
  const userId = c.get("userId") as string;

  const deviceRefreshToken = randomToken();
  const sessionCredentialHash = await hashSecret(deviceRefreshToken);
  const registerDeviceValues = { userId, label: deviceLabel, sessionCredentialHash };
  const device = firstOrThrow(await db.insert(devices).values(registerDeviceValues as any).returning());

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
  const userId = c.get("userId") as string;

  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
  if (!device) return c.json({ error: "Dispositivo no encontrado" }, 404);

  const biometricValues = { webauthnCredentialId };
  await db.update(devices).set(biometricValues as any).where(eq(devices.id, deviceId));
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const [user] = await db.select({ id: users.id, name: users.name, phone: users.phone, role: users.role }).from(users).where(eq(users.id, c.get("userId") as string));
  if (!user) return c.json({ error: "Usuario no encontrado" }, 404);
  return c.json(user);
});

const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: phoneSchema.optional(),
});

/** Datos de contacto propios. El teléfono es solo información de contacto, no identifica a nadie. */
authRoutes.patch("/me", requireAuth, async (c) => {
  const body = updateMeSchema.parse(await c.req.json());
  const userId = c.get("userId") as string;
  const values: Record<string, string> = {};
  if (body.name) values.name = body.name;
  if (body.phone) values.phone = body.phone;
  if (Object.keys(values).length > 0) {
    await db.update(users).set(values as any).where(eq(users.id, userId));
  }
  return c.json({ ok: true });
});

const changePinSchema = z.object({ currentPin: pinSchema, newPin: pinSchema });

/**
 * Cambio de PIN propio (también es el primer paso obligatorio tras un PIN temporal). Pide el PIN
 * actual, rechaza repetirlo y rechaza uno que ya use otra persona: el PIN es único en toda la base.
 */
authRoutes.patch("/me/pin", requireAuth, async (c) => {
  const { currentPin, newPin } = changePinSchema.parse(await c.req.json());
  const userId = c.get("userId") as string;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return c.json({ error: "Usuario no encontrado" }, 404);

  const ok = user.pinHash ? await verifySecret(user.pinHash, currentPin) : false;
  if (!ok) return c.json({ error: "El PIN actual no es correcto" }, 400);
  if (newPin === currentPin) return c.json({ error: "El nuevo PIN debe ser distinto del actual" }, 400);
  if (await isPinTaken(newPin, userId)) return c.json({ error: "Ese PIN ya lo usa otra persona, elige otro" }, 409);

  await setUserPin(userId, newPin, false);
  return c.json({ ok: true });
});
