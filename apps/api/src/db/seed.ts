import { db } from "./client.js";
import { tenants, clients, users, vehicles, drivers, routes, routeStops, routeStatusHistory, devices, type NewUser } from "./schema.js";
import { hashSecret, randomToken } from "../lib/crypto.js";
import { generateRouteCode } from "../lib/ids.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { signSetupToken } from "../lib/jwt.js";
import type { Role } from "@migalog/shared";

async function main() {
  console.log("Sembrando datos demo...");

  const tenant = firstOrThrow(
    await db.insert(tenants).values({ ruc: "0801199901234", name: "Transportes Demo S.A.", slug: "demo" }).returning()
  );

  const superAdmin = firstOrThrow(
    await db
      .insert(users)
      .values({
        tenantId: null,
        role: "super_admin",
        name: "Dueño MigaLog",
        phone: "+50588880099",
        passwordHash: await hashSecret("Demo1234!"),
      } satisfies NewUser)
      .returning()
  );

  // --- Nivel 1: empresa proveedora (el tenant) ---
  const adminEmpresa = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "admin_empresa", name: "Admin Demo", phone: "+50588880000", passwordHash: await hashSecret("Demo1234!") } satisfies NewUser)
      .returning()
  );

  const coordinador = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "coordinador", name: "Coordinador Demo", phone: "+50588880004", passwordHash: await hashSecret("Demo1234!") } satisfies NewUser)
      .returning()
  );

  const conductorUser = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, role: "conductor", name: "Conductor Demo", phone: "+50588880001", pinHash: await hashSecret("123456") } satisfies NewUser)
      .returning()
  );

  // --- Nivel 2: empresa cliente (varios usuarios, cada uno con su propio rol) ---
  const client = firstOrThrow(
    await db.insert(clients).values({ tenantId: tenant.id, ruc: "0801199905678", name: "Comercial El Sol" }).returning()
  );

  const clienteAdmin = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_admin", name: "Admin Cliente Demo", phone: "+50588880010", passwordHash: await hashSecret("Demo1234!") } satisfies NewUser)
      .returning()
  );

  const clienteCoordinador = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_coordinador", name: "Coordinador Cliente Demo", phone: "+50588880011", passwordHash: await hashSecret("Demo1234!") } satisfies NewUser)
      .returning()
  );

  const clienteJefe = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_jefe", name: "Jefe Cliente Demo", phone: "+50588880012", passwordHash: await hashSecret("Demo1234!") } satisfies NewUser)
      .returning()
  );

  const clienteVisualizador = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_visualizador", name: "Visualizador Cliente Demo", phone: "+50588880013", passwordHash: await hashSecret("Demo1234!") } satisfies NewUser)
      .returning()
  );

  const solicitanteUser = firstOrThrow(
    await db
      .insert(users)
      .values({ tenantId: tenant.id, clientId: client.id, role: "cliente_solicitante", name: "Solicitante Demo", phone: "+50588880002", pinHash: await hashSecret("654321") } satisfies NewUser)
      .returning()
  );

  const vehicle = firstOrThrow(
    await db.insert(vehicles).values({ tenantId: tenant.id, plate: "M-123456", brandModel: "Hino 300", capacityM3: 25 }).returning()
  );

  await db
    .insert(drivers)
    .values({ tenantId: tenant.id, userId: conductorUser.id, vehicleId: vehicle.id, licenseExpiresAt: "2027-12-31" })
    .returning();

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

  const passwordUsers: { role: Role; phone: string | null }[] = [
    { role: superAdmin.role, phone: superAdmin.phone },
    { role: adminEmpresa.role, phone: adminEmpresa.phone },
    { role: coordinador.role, phone: coordinador.phone },
    { role: clienteAdmin.role, phone: clienteAdmin.phone },
    { role: clienteCoordinador.role, phone: clienteCoordinador.phone },
    { role: clienteJefe.role, phone: clienteJefe.phone },
    { role: clienteVisualizador.role, phone: clienteVisualizador.phone },
  ];

  console.log("\nListo. Credenciales de prueba (todas las de password: Demo1234!):\n");
  console.log(`Tenant: ${tenant.name} (slug: ${tenant.slug}) | Empresa cliente: ${client.name}\n`);
  for (const u of passwordUsers) {
    console.log(`${u.role.padEnd(22)} -> teléfono: ${u.phone}`);
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
