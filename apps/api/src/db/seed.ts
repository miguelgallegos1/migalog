import { db } from "./client.js";
import { tenants, users, providers, vehicles, drivers, routes, routeStops, routeStatusHistory, devices } from "./schema.js";
import { hashSecret, randomToken } from "../lib/crypto.js";
import { generateRouteCode } from "../lib/ids.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { signSetupToken } from "../lib/jwt.js";

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

  const adminEmpresa = firstOrThrow(
    await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        role: "admin_empresa",
        name: "Admin Demo",
        email: "admin@demo.migalog.dev",
        passwordHash: await hashSecret("Demo1234!"),
      })
      .returning()
  );

  const dispatcher = firstOrThrow(
    await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        role: "dispatcher",
        name: "Despachador Demo",
        email: "dispatcher@demo.migalog.dev",
        passwordHash: await hashSecret("Demo1234!"),
      })
      .returning()
  );

  const conductorUser = firstOrThrow(
    await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        role: "conductor",
        name: "Conductor Demo",
        phone: "+50588880001",
        pinHash: await hashSecret("123456"),
      })
      .returning()
  );

  const solicitanteUser = firstOrThrow(
    await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        role: "cliente_proveedor",
        name: "Solicitante Demo",
        phone: "+50588880002",
        pinHash: await hashSecret("654321"),
      })
      .returning()
  );

  const provider = firstOrThrow(
    await db
      .insert(providers)
      .values({ tenantId: tenant.id, name: "Comercial El Sol", contactUserId: solicitanteUser.id })
      .returning()
  );

  await db.insert(vehicles).values({ tenantId: tenant.id, plate: "M-123456", capacityKg: 5000 }).returning();

  await db
    .insert(drivers)
    .values({ tenantId: tenant.id, userId: conductorUser.id, licenseNumber: "LIC-0001" })
    .returning();

  const route = firstOrThrow(
    await db
      .insert(routes)
      .values({
        tenantId: tenant.id,
        code: generateRouteCode(),
        providerId: provider.id,
        status: "CREADO",
        notes: "Ruta de ejemplo generada por el seed",
      })
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

  console.log("\nListo. Credenciales de prueba:\n");
  console.log(`Tenant: ${tenant.name} (slug: ${tenant.slug})`);
  console.log(`super_admin       -> email: ${superAdmin.email}      password: Demo1234!`);
  console.log(`admin_empresa     -> email: ${adminEmpresa.email}    password: Demo1234!`);
  console.log(`dispatcher        -> email: ${dispatcher.email}      password: Demo1234!`);
  console.log(`\nconductor (API directo)          -> POST /auth/login-pin { deviceId: "${conductorDevice.id}", pin: "123456" }`);
  console.log(`cliente_proveedor (API directo)  -> POST /auth/login-pin { deviceId: "${solicitanteDevice.id}", pin: "654321" }`);
  console.log(`\nconductor (navegador)            -> pestaña PIN -> "Configurar acceso" -> código: ${conductorSetupToken}`);
  console.log(`cliente_proveedor (navegador)    -> pestaña PIN -> "Configurar acceso" -> código: ${solicitanteSetupToken}`);
  console.log(`\nRuta demo: ${route.code} (estado CREADO, 4 paradas)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
