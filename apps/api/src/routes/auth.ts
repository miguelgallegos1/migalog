import { Hono } from "hono";
import { z } from "zod";
import { usesPassword, usesPin, inviteUserSchema, loginPasswordSchema, loginPinSchema } from "@migalog/shared";
import { db } from "../db/client.js";
import { users, devices } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { hashSecret, verifySecret, randomToken } from "../lib/crypto.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { signAccessToken, signSetupToken, verifySetupToken } from "../lib/jwt.js";
import { requireAuth, requireRole, type AppVariables } from "../middleware/auth.js";

const FAILED_ATTEMPTS_LIMIT = 5;
const LOCK_MINUTES = 15;

export const authRoutes = new Hono<{ Variables: AppVariables }>();

/** admin_empresa (o super_admin) invita a un usuario dentro de su tenant. */
authRoutes.post(
  "/invite",
  requireAuth,
  requireRole("admin_empresa", "super_admin"),
  async (c) => {
    const body = inviteUserSchema.parse(await c.req.json());
    const tenantId = c.get("tenantId");

    const user = firstOrThrow(
      await db
        .insert(users)
        .values({
          tenantId,
          role: body.role,
          name: body.name,
          email: body.email,
          phone: body.phone,
        })
        .returning()
    );

    const setupToken = await signSetupToken(user.id);
    // En producción esto se envía por email o WhatsApp, no se devuelve en la respuesta.
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
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
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
  await db.update(users).set({ pinHash }).where(eq(users.id, userId));

  const deviceRefreshToken = randomToken();
  const sessionCredentialHash = await hashSecret(deviceRefreshToken);
  const device = firstOrThrow(
    await db
      .insert(devices)
      .values({ userId, label: deviceLabel, sessionCredentialHash })
      .returning()
  );

  // deviceRefreshToken se devuelve una sola vez: el cliente lo guarda cifrado en el dispositivo
  // y lo usa junto con PIN/biometría para refrescar la sesión sin volver a escribir el PIN cada vez.
  return c.json({ deviceId: device.id, deviceRefreshToken });
});

authRoutes.post("/login-password", async (c) => {
  const { email, password } = loginPasswordSchema.parse(await c.req.json());
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !user.passwordHash || !user.active) {
    return c.json({ error: "Credenciales inválidas" }, 401);
  }
  const valid = await verifySecret(user.passwordHash, password);
  if (!valid) return c.json({ error: "Credenciales inválidas" }, 401);

  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
  return c.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId } });
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
    await db.update(devices).set({ failedAttempts: attempts, lockedUntil }).where(eq(devices.id, deviceId));
    return c.json({ error: "PIN incorrecto" }, 401);
  }

  await db.update(devices).set({ failedAttempts: 0, lockedUntil: null }).where(eq(devices.id, deviceId));
  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
  return c.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId } });
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

  const accessToken = await signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
  return c.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId } });
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

  await db.update(devices).set({ webauthnCredentialId }).where(eq(devices.id, deviceId));
  return c.json({ ok: true });
});
