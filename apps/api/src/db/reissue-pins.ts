/**
 * Utilidad de una sola vez: emite un PIN temporal nuevo a TODOS los usuarios existentes (sus
 * claves anteriores no pueden convertirse a la huella única) y los escribe en el archivo que
 * se pasa por argumento. No imprime los PIN en consola. Se borra después de usarla.
 * Uso: tsx src/db/reissue-pins.ts <ruta-del-archivo-de-salida>
 */
import { writeFileSync } from "node:fs";
import { db } from "./client.js";
import { users } from "./schema.js";
import { issueTemporaryPin } from "../lib/pin.js";

async function main() {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("Falta la ruta del archivo de salida");

  const all = await db.select({ id: users.id, name: users.name, role: users.role, phone: users.phone }).from(users);
  const lines = ["Nombre | Rol | Teléfono de contacto | PIN temporal (debe cambiarlo al ingresar)", ""];
  for (const u of all) {
    const pin = await issueTemporaryPin(u.id);
    lines.push(`${u.name} | ${u.role} | ${u.phone} | ${pin}`);
  }
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  console.log(`PIN temporales escritos para ${all.length} usuarios en ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
