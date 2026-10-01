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
    await db.insert(tenants).values({ ruc: "0801199901234", name: "Transportes Demo S.A.", slug: "demo" }).returning()
  );

  // Cada insert de usuario se pasa como variable (no un objeto literal directo en .values()),
  // sin anotar su tipo con typeof users.$inferInsert: en el entorno de build de Vercel ese
  // tipo generado por Drizzle resulta incompleto (le faltan columnas nullable/con default
  // como tenantId/clientId/passwordHash/pinHash), así que anotar explícitamente con él
  // reproduce el mismo error "Object literal may only specify known properties" en la propia
  // declaración de la variable. Dejar que TS infiera el tipo del literal (sin anotación)
  // evita arrastrar ese tipo roto - al pasar la variable a .values()/.set() se chequea por
  // asignabilidad normal, no por ese camino. El "as const" en "role" es aparte: sin él, TS
  // ensancha el literal a "string" al no haber un tipo esperado que lo ancle, y un "role"
  // genérico "string" tampoco matchea el enum de Drizzle - as const lo mantiene como el
  // literal exacto.
  const superAdminValues = {
    tenantId: null,
    role: "super_admin" as const,
    name: "Dueño MigaLog",
    phone: "+50588880099",
    passwordHash: await hashSecret("Demo1234!"),
  };
  const superAdmin = firstOrThrow(await db.insert(users).values(superAdminValues).returning());

  // --- Nivel 1: empresa proveedora (el tenant) ---
  const adminEmpresaValues = { tenantId: tenant.id, role: "admin_empresa" as const, name: "Admin Demo", phone: "+50588880000", passwordHash: await hashSecret("Demo1234!") };
  const adminEmpresa = firstOrThrow(await db.insert(users).values(adminEmpresaValues).returning());

  const coordinadorValues = { tenantId: tenant.id, role: "coordinador" as const, name: "Coordinador Demo", phone: "+50588880004", passwordHash: await hashSecret("Demo1234!") };
  const coordinador = firstOrThrow(await db.insert(users).values(coordinadorValues).returning());

  const conductorUserValues = { tenantId: tenant.id, role: "conductor" as const, name: "Conductor Demo", phone: "+50588880001", pinHash: await hashSecret("123456") };
  const conductorUser = firstOrThrow(await db.insert(users).values(conductorUserValues).returning());

  // --- Nivel 2: empresa cliente (varios usuarios, cada uno con su propio rol) ---
  const client = firstOrThrow(
    await db.insert(clients).values({ tenantId: tenant.id, ruc: "0801199905678", name: "Comercial El Sol" }).returning()
  );

  const clienteAdminValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_admin" as const, name: "Admin Cliente Demo", phone: "+50588880010", passwordHash: await hashSecret("Demo1234!") };
  const clienteAdmin = firstOrThrow(await db.insert(users).values(clienteAdminValues).returning());

  const clienteCoordinadorValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_coordinador" as const, name: "Coordinador Cliente Demo", phone: "+50588880011", passwordHash: await hashSecret("Demo1234!") };
  const clienteCoordinador = firstOrThrow(await db.insert(users).values(clienteCoordinadorValues).returning());

  const clienteJefeValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_jefe" as const, name: "Jefe Cliente Demo", phone: "+50588880012", passwordHash: await hashSecret("Demo1234!") };
  const clienteJefe = firstOrThrow(await db.insert(users).values(clienteJefeValues).returning());

  const clienteVisualizadorValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_visualizador" as const, name: "Visualizador Cliente Demo", phone: "+50588880013", passwordHash: await hashSecret("Demo1234!") };
  const clienteVisualizador = firstOrThrow(await db.insert(users).values(clienteVisualizadorValues).returning());

  const solicitanteUserValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_solicitante" as const, name: "Solicitante Demo", phone: "+50588880002", pinHash: await hashSecret("654321") };
  const solicitanteUser = firstOrThrow(await db.insert(users).values(solicitanteUserValues).returning());

  const vehicleValues = { tenantId: tenant.id, plate: "M-123456", brandModel: "Hino 300", capacityM3: 25 };
  const vehicle = firstOrThrow(await db.insert(vehicles).values(vehicleValues).returning());

  const driverValues = { tenantId: tenant.id, userId: conductorUser.id, vehicleId: vehicle.id, licenseExpiresAt: "2027-12-31" };
  await db.insert(drivers).values(driverValues).returning();

  const routeValues = { tenantId: tenant.id, code: generateRouteCode(), clientId: client.id, status: "CREADO" as const, notes: "Ruta de ejemplo generada por el seed" };
  const route = firstOrThrow(await db.insert(routes).values(routeValues).returning());

  const stopValues = [
    { routeId: route.id, sequenceOrder: 0, type: "origen" as const, label: "Bodega Central", address: "Managua, km 5", lat: 12.1364, lng: -86.2514 },
    { routeId: route.id, sequenceOrder: 1, type: "parada" as const, label: "Parada 1 - Cliente Norte", address: "Managua, Linda Vista", lat: 12.1489, lng: -86.2362 },
    { routeId: route.id, sequenceOrder: 2, type: "parada" as const, label: "Parada 2 - Cliente Sur", address: "Managua, Bello Horizonte", lat: 12.1201, lng: -86.2478 },
    { routeId: route.id, sequenceOrder: 3, type: "destino" as const, label: "Destino", address: "Masaya, centro", lat: 11.9744, lng: -86.094 },
  ];
  await db.insert(routeStops).values(stopValues);

  const routeHistoryValues = {
    routeId: route.id,
    fromStatus: null,
    toStatus: "CREADO" as const,
    actorType: "human" as const,
    actorUserId: solicitanteUser.id,
  };
  await db.insert(routeStatusHistory).values(routeHistoryValues);

  const conductorDeviceToken = randomToken();
  const conductorDeviceValues = { userId: conductorUser.id, label: "Teléfono demo conductor", sessionCredentialHash: await hashSecret(conductorDeviceToken) };
  const conductorDevice = firstOrThrow(await db.insert(devices).values(conductorDeviceValues).returning());

  const solicitanteDeviceToken = randomToken();
  const solicitanteDeviceValues = { userId: solicitanteUser.id, label: "Teléfono demo solicitante", sessionCredentialHash: await hashSecret(solicitanteDeviceToken) };
  const solicitanteDevice = firstOrThrow(await db.insert(devices).values(solicitanteDeviceValues).returning());

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
