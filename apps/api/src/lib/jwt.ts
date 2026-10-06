import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@migalog/shared";

export type AuthClaims = {
  sub: string;
  tenantId: string | null;
  clientId: string | null;
  role: Role;
};

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no está configurada");
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(claims: AuthClaims): Promise<string> {
  return new SignJWT({ tenantId: claims.tenantId, clientId: claims.clientId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, getSecret());
  return {
    sub: payload.sub as string,
    tenantId: (payload.tenantId as string | null) ?? null,
    clientId: (payload.clientId as string | null) ?? null,
    role: payload.role as Role,
  };
}

type CredentialState = { passwordHash: string | null; pinHash: string | null };

/**
 * Huella del credencial actual del usuario. El token de setup la guarda al firmarse; cuando la
 * persona crea su contraseña o PIN, la huella cambia y el mismo link deja de servir (uso único
 * sin tabla extra). Ver userFromSetupToken en routes/auth.ts.
 */
export function credentialFingerprint(user: CredentialState): string {
  return createHash("sha256").update(`${user.passwordHash ?? ""}|${user.pinHash ?? ""}`).digest("hex");
}

/** Token de invitación / setup: de un solo uso (ver credentialFingerprint) y de vida corta. */
export async function signSetupToken(user: { id: string } & CredentialState): Promise<string> {
  return new SignJWT({ purpose: "setup", cred: credentialFingerprint(user) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

export async function verifySetupToken(token: string): Promise<{ userId: string; cred: string }> {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.purpose !== "setup") throw new Error("Token inválido");
  return { userId: payload.sub as string, cred: String(payload.cred ?? "") };
}
