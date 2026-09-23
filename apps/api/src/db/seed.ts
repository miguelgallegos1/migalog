import { db } from "./client.js";
import { tenants, clients, users, vehicles, drivers, routes, routeStops, routeStatusHistory, devices } from "./schema.js";
import { hashSecret, randomToken } from "../lib/crypto.js";
import { generateRouteCode } from "../lib/ids.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { signSetupToken } from "../lib/jwt.js";
import type { Role } from "@migalog/shared";

async function main() {
  console.log("Sembrando datos demo...");

  const tenant = firstOrThrow(
    await db.insert(tenants).values({ name: "Transportes Demo S.A.", slug: "demo" }).returning()
  );

  const superAdmin = firstOrThrow(
    await db
      .insert(users)
      .values({
        tenantId: null,
        role: "super_admin",
        name: "Dueño MigaLog",
        email: "dueno@migalog.dev",
        passwordHash: await hashSecret("Demo1234!"),
      })
      .returning()
  );

  // --- Nivel 1: empresa proveedora (el tenant) ---
  const adminEmpresa = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "admin_empresa", name: "Admin Demo", email: "admin@demo.migalog.dev", passwordHash: await hashSecret("Demo1234!") })
      .returning()
  );

  const coordinador = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "coordinador", name: "Coordinador Demo", email: "coordinador@demo.migalog.dev", passwordHash: await hashSecret("Demo1234!") })
      .returning()
  );

  const conductorUser = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "conductor", name: "Conductor Demo", phone: "+50588880001", pinHash: await hashSecret("123456") })
      .returning()
  );

  // --- Nivel 2: empresa cliente (varios usuarios, cada uno con su propio rol) ---
  const client = firstOrThrow(
    await db.insert(clients).values({ tenantId: tenant.id, name: "Comercial El Sol" }).returning()
  );

  const clienteAdmin = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_admin", name: "Admin Cliente Demo", email: "admin@cliente-demo.dev", passwordHash: await hashSecret("Demo1234!") })
      .returning()
  );

  const clienteCoordinador = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_coordinador", name: "Coordinador Cliente Demo", email: "coordinador@cliente-demo.dev", passwordHash: await hashSecret("Demo1234!") })
      .returning()
  );

  const clienteJefe = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_jefe", name: "Jefe Cliente Demo", email: "jefe@cliente-demo.dev", passwordHash: await hashSecret("Demo1234!") })
      .returning()
  );

  const clienteVisualizador = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_visualizador", name: "Visualizador Cliente Demo", email: "visualizador@cliente-demo.dev", passwordHash: await hashSecret("Demo1234!") })
      .returning()
  );

  const solicitanteUser = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_solicitante", name: "Solicitante Demo", phone: "+50588880002", pinHash: await hashSecret("654321") })
      .returning()
  );

  await db.insert(vehicles).values({ tenantId: tenant.id, plate: "M-123456", capacityKg: 5000 }).returning();

  await db.insert(drivers).values({ tenantId: tenant.id, userId: conductorUser.id, licenseNumber: "LIC-0001" }).returning();

  const route = firstOrThrow(
    await db
      .insert(routes)
      .values({ tenantId: tenant.id, code: generateRouteCode(), clientId: client.id, status: "CREADO", notes: "Ruta de ejemplo generada por el seed" })
      .returning()
  );

  await db.insert(routeStops).values([
    { routeId: route.id, sequenceOrder: 0, type: "origen", label: "Bodega Central", address: "Managua, km 5", lat: 12.1364, lng: -86.2514 },
    { routeId: route.id, sequenceOrder: 1, type: "parada", label: "Parada 1 - Cliente Norte", address: "Managua, Linda Vista", lat: 12.1489, lng: -86.2362 },
    { routeId: route.id, sequenceOrder: 2, type: "parada", label: "Parada 2 - Cliente Sur", address: "Managua, Bello Horizonte", lat: 12.1201, lng: -86.2478 },
    { routeId: route.id, sequenceOrder: 3, type: "destino", label: "Destino", address: "Masaya, centro", lat: 11.9744, lng: -86.094 },
  ]);

  await db.insert(routeStatusHistory).values({
    routeId: route.id,
    fromStatus: null,
    toStatus: "CREADO",
    actorType: "human",
    actorUserId: solicitanteUser.id,
  });

  const conductorDeviceToken = randomToken();
  const conductorDevice = firstOrThrow(
    await db
      .insert(devices)
      .values({ userId: conductorUser.id, label: "Teléfono demo conductor", sessionCredentialHash: await hashSecret(conductorDeviceToken) })
      .returning()
  );

  const solicitanteDeviceToken = randomToken();
  const solicitanteDevice = firstOrThrow(
    await db
      .insert(devices)
      .values({ userId: solicitanteUser.id, label: "Teléfono demo solicitante", sessionCredentialHash: await hashSecret(solicitanteDeviceToken) })
      .returning()
  );

  // Además del device+PIN ya creado (útil para probar la API directo con curl), generamos
  // un código de invitación real para cada uno: así se puede probar el flujo completo desde
  // el navegador (pantalla "primera vez en este dispositivo" -> pegar código -> elegir PIN),
  // que es como un usuario real terminaría configurando su celular.
  const conductorSetupToken = await signSetupToken(conductorUser.id);
  const solicitanteSetupToken = await signSetupToken(solicitanteUser.id);

  const passwordUsers: { role: Role; email: string | null }[] = [
    { role: superAdmin.role, email: superAdmin.email },
    { role: adminEmpresa.role, email: adminEmpresa.email },
    { role: coordinador.role, email: coordinador.email },
    { role: clienteAdmin.role, email: clienteAdmin.email },
    { role: clienteCoordinador.role, email: clienteCoordinador.email },
    { role: clienteJefe.role, email: clienteJefe.email },
    { role: clienteVisualizador.role, email: clienteVisualizador.email },
  ];

  console.log("\nListo. Credenciales de prueba (todas las de password: Demo1234!):\n");
  console.log(`Tenant: ${tenant.name} (slug: ${tenant.slug}) | Empresa cliente: ${client.name}\n`);
  for (const u of passwordUsers) {
    console.log(`${u.role.padEnd(22)} -> email: ${u.email}`);
  }
  console.log(`\nconductor (API directo)          -> POST /auth/login-pin { deviceId: "${conductorDevice.id}", pin: "123456" }`);
  console.log(`cliente_solicitante (API directo) -> POST /auth/login-pin { deviceId: "${solicitanteDevice.id}", pin: "654321" }`);
  console.log(`\nconductor (navegador)            -> pestaña PIN -> "Configurar acceso" -> código: ${conductorSetupToken}`);
  console.log(`cliente_solicitante (navegador)  -> pestaña PIN -> "Configurar acceso" -> código: ${solicitanteSetupToken}`);
  console.log(`\nRuta demo: ${route.code} (estado CREADO, 4 paradas)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
