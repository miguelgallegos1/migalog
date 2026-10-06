/** Utilidad de una sola vez: imprime códigos de invitación para usuarios PIN ya existentes (no inserta nada). */
import { db } from "./client.js";
import { users } from "./schema.js";
import { eq } from "drizzle-orm";
import { signSetupToken } from "../lib/jwt.js";
import { firstOrThrow } from "../lib/db-helpers.js";

async function main() {
  const conductor = firstOrThrow(await db.select().from(users).where(eq(users.phone, "+50588880001")));
  const solicitante = firstOrThrow(await db.select().from(users).where(eq(users.phone, "+50588880002")));

  console.log(`conductor (navegador)         -> código: ${await signSetupToken(conductor)}`);
  console.log(`cliente_solicitante (navegador) -> código: ${await signSetupToken(solicitante)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
