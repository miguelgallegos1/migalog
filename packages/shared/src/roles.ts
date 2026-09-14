export const ROLES = [
  "super_admin",
  "admin_empresa",
  "dispatcher",
  "conductor",
  "cliente_proveedor",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles que acceden con email+password. El resto usa PIN de 6 dígitos + biometría opcional. */
export const PASSWORD_ROLES: Role[] = ["super_admin", "admin_empresa", "dispatcher"];
export const PIN_ROLES: Role[] = ["conductor", "cliente_proveedor"];

export function usesPassword(role: Role): boolean {
  return PASSWORD_ROLES.includes(role);
}

export function usesPin(role: Role): boolean {
  return PIN_ROLES.includes(role);
}
