import type { Context } from "hono";
import { RouteServiceError } from "./route-service.js";

/** c.req.param() puede tipar string | undefined cuando hay middleware entre medio; esto lo exige. */
export function param(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new RouteServiceError(`Falta el parámetro "${name}" en la URL`, 400);
  return value;
}
