/** Utilidad de una sola vez: resetea el esquema public de la base de dev (son datos de prueba). */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  console.log("Esquema reseteado.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
