/** noUncheckedIndexedAccess hace que rows[0] sea T | undefined; esto documenta la garantía real. */
export function firstOrThrow<T>(rows: T[], message = "No se encontró el registro"): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}

/**
 * 23503 = foreign_key_violation de Postgres: el registro que se intenta borrar todavía está
 * citado por otra tabla (ej. un sitio usado en el catálogo de rutas, un usuario con rutas
 * asignadas). Mismo chequeo repetido en cada DELETE de sites/users/clients/tenants.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "23503";
}
