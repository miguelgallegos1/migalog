/** noUncheckedIndexedAccess hace que rows[0] sea T | undefined; esto documenta la garantía real. */
export function firstOrThrow<T>(rows: T[], message = "No se encontró el registro"): T {
  const row = rows[0];
  if (!row) throw new Error(message);
  return row;
}
