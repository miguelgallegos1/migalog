/** Utilidad de una sola vez: resetea el esquema public de la base de dev (son datos de prueba). */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  await sql`DROP SCHEMA public CASCADE`;
  await sql`CREATE SCHEMA public`;
  // Drizzle registra qué migraciones ya aplicó en el esquema "drizzle" (aparte de "public") -
  // sin borrarlo también, migrate.ts cree que ya corrió la migración 0000 (por el mismo
  // número, aunque el contenido/hash haya cambiado) y no vuelve a crear ninguna tabla.
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  console.log("Esquema reseteado.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
