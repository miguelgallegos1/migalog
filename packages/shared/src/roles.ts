/**
 * Jerarquía de 2 niveles de empresa, cada uno con su propio set de roles:
 * - Nivel 1 (empresa proveedora, el `tenant`): admin_empresa, coordinador, conductor.
 * - Nivel 2 (empresa cliente, `clients`): cliente_admin, cliente_coordinador, cliente_jefe,
 *   cliente_visualizador, cliente_solicitante, cliente_conductor.
 * super_admin es el único rol de plataforma (nivel 0, no pertenece a ningún tenant).
 *
 * cliente_conductor existe porque la empresa cliente puede tener flota propia (camiones Y
 * choferes) y despachar ella misma una ruta con sus propios recursos, sin pasar por la
 * proveedora - ver vehicles.ts/drivers.ts (ambos ganan un "clientId" opcional) y
 * routes.ts (POST /:id/confirm, que ahora también acepta cliente_admin/cliente_coordinador
 * cuando confirman con flota de su propia empresa).
 */
export const ROLES = [
  "super_admin",
  "admin_empresa",
  "coordinador",
  "conductor",
  "cliente_admin",
  "cliente_coordinador",
  "cliente_jefe",
  "cliente_visualizador",
  "cliente_solicitante",
  "cliente_conductor",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles de nivel 2 (empresa cliente - solicita transporte). */
export const CLIENT_ROLES: Role[] = [
  "cliente_admin",
  "cliente_coordinador",
  "cliente_jefe",
  "cliente_visualizador",
  "cliente_solicitante",
  "cliente_conductor",
];

/** Roles que acceden con teléfono+password. El resto usa PIN de 6 dígitos + biometría opcional. */
export const PASSWORD_ROLES: Role[] = [
  "super_admin",
  "admin_empresa",
  "coordinador",
  "cliente_admin",
  "cliente_coordinador",
  "cliente_jefe",
  "cliente_visualizador",
];
export const PIN_ROLES: Role[] = ["conductor", "cliente_solicitante", "cliente_conductor"];

export function usesPassword(role: Role): boolean {
  return PASSWORD_ROLES.includes(role);
}

export function usesPin(role: Role): boolean {
  return PIN_ROLES.includes(role);
}

export function isClientRole(role: Role): boolean {
  return CLIENT_ROLES.includes(role);
}
