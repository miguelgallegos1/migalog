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

