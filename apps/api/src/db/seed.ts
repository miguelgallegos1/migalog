import { db } from "./client.js";
import { tenants, clients, users, vehicles, drivers, routes, routeStops, routeStatusHistory, devices } from "./schema.js";
import { hashSecret, randomToken } from "../lib/crypto.js";
import { generateRouteCode } from "../lib/ids.js";
import { firstOrThrow } from "../lib/db-helpers.js";
import { pinLookupOf } from "../lib/pin.js";
import type { Role } from "@migalog/shared";

async function main() {
  // PIN de cada usuario demo (sirve solo para imprimirlos al final; los valores reales van en cada fila).
  const PIN_BY_PHONE: Record<string, string> = {
    "+50588880099": "100001", "+50588880000": "100002", "+50588880004": "100003", "+50588880001": "100004",
    "+50588880010": "100005", "+50588880011": "100006", "+50588880012": "100007", "+50588880013": "100008", "+50588880002": "100009",
  };
  console.log("Sembrando datos demo...");

  const tenant = firstOrThrow(
    await db.insert(tenants).values({ ruc: "0801199901234", name: "Transportes Demo S.A.", slug: "demo" }).returning()
  );

  // Cada insert de usuario se pasa como variable (no un objeto literal directo en .values()),
  // sin anotar su tipo con typeof users.$inferInsert: en el entorno de build de Vercel ese
  // tipo generado por Drizzle resulta incompleto (le faltan columnas nullable/con default
  // como tenantId/clientId/pinHash), así que anotar explícitamente con él
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
    pinHash: await hashSecret("100001"),
    pinLookup: pinLookupOf("100001"),
  };
  const superAdmin = firstOrThrow(await db.insert(users).values(superAdminValues as any).returning());

  // --- Nivel 1: empresa proveedora (el tenant) ---
  const adminEmpresaValues = { tenantId: tenant.id, role: "admin_empresa" as const, name: "Admin Demo", phone: "+50588880000", pinHash: await hashSecret("100002"), pinLookup: pinLookupOf("100002") };
  const adminEmpresa = firstOrThrow(await db.insert(users).values(adminEmpresaValues as any).returning());

  const coordinadorValues = { tenantId: tenant.id, role: "coordinador" as const, name: "Coordinador Demo", phone: "+50588880004", pinHash: await hashSecret("100003"), pinLookup: pinLookupOf("100003") };
  const coordinador = firstOrThrow(await db.insert(users).values(coordinadorValues as any).returning());

  const conductorUserValues = { tenantId: tenant.id, role: "conductor" as const, name: "Conductor Demo", phone: "+50588880001", pinHash: await hashSecret("100004"), pinLookup: pinLookupOf("100004") };
  const conductorUser = firstOrThrow(await db.insert(users).values(conductorUserValues as any).returning());

  // --- Nivel 2: empresa cliente (varios usuarios, cada uno con su propio rol) ---
  const client = firstOrThrow(
    await db.insert(clients).values({ tenantId: tenant.id, ruc: "0801199905678", name: "Comercial El Sol" }).returning()
  );

  const clienteAdminValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_admin" as const, name: "Admin Cliente Demo", phone: "+50588880010", pinHash: await hashSecret("100005"), pinLookup: pinLookupOf("100005") };
  const clienteAdmin = firstOrThrow(await db.insert(users).values(clienteAdminValues as any).returning());

  const clienteCoordinadorValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_coordinador" as const, name: "Coordinador Cliente Demo", phone: "+50588880011", pinHash: await hashSecret("100006"), pinLookup: pinLookupOf("100006") };
  const clienteCoordinador = firstOrThrow(await db.insert(users).values(clienteCoordinadorValues as any).returning());

  const clienteJefeValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_jefe" as const, name: "Jefe Cliente Demo", phone: "+50588880012", pinHash: await hashSecret("100007"), pinLookup: pinLookupOf("100007") };
  const clienteJefe = firstOrThrow(await db.insert(users).values(clienteJefeValues as any).returning());

  const clienteVisualizadorValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_visualizador" as const, name: "Visualizador Cliente Demo", phone: "+50588880013", pinHash: await hashSecret("100008"), pinLookup: pinLookupOf("100008") };
  const clienteVisualizador = firstOrThrow(await db.insert(users).values(clienteVisualizadorValues as any).returning());

  const solicitanteUserValues = { tenantId: tenant.id, clientId: client.id, role: "cliente_solicitante" as const, name: "Solicitante Demo", phone: "+50588880002", pinHash: await hashSecret("100009"), pinLookup: pinLookupOf("100009") };
  const solicitanteUser = firstOrThrow(await db.insert(users).values(solicitanteUserValues as any).returning());

  const vehicleValues = { tenantId: tenant.id, plate: "M-123456", brandModel: "Hino 300", capacityM3: 25 };
  const vehicle = firstOrThrow(await db.insert(vehicles).values(vehicleValues as any).returning());

  const driverValues = { tenantId: tenant.id, userId: conductorUser.id, vehicleId: vehicle.id, licenseExpiresAt: "2027-12-31" };
  await db.insert(drivers).values(driverValues as any).returning();

  const routeValues = { tenantId: tenant.id, code: generateRouteCode(), clientId: client.id, status: "CREADO" as const, notes: "Ruta de ejemplo generada por el seed" };
  const route = firstOrThrow(await db.insert(routes).values(routeValues as any).returning());

  const stopValues = [
    { routeId: route.id, sequenceOrder: 0, type: "origen" as const, label: "Bodega Central", address: "Managua, km 5", lat: 12.1364, lng: -86.2514 },
    { routeId: route.id, sequenceOrder: 1, type: "parada" as const, label: "Parada 1 - Cliente Norte", address: "Managua, Linda Vista", lat: 12.1489, lng: -86.2362 },
    { routeId: route.id, sequenceOrder: 2, type: "parada" as const, label: "Parada 2 - Cliente Sur", address: "Managua, Bello Horizonte", lat: 12.1201, lng: -86.2478 },
    { routeId: route.id, sequenceOrder: 3, type: "destino" as const, label: "Destino", address: "Masaya, centro", lat: 11.9744, lng: -86.094 },
  ];
  await db.insert(routeStops).values(stopValues as any);

  const routeHistoryValues = {
    routeId: route.id,
    fromStatus: null,
    toStatus: "CREADO" as const,
    actorType: "human" as const,
    actorUserId: solicitanteUser.id,
  };
  await db.insert(routeStatusHistory).values(routeHistoryValues as any);

  console.log("\nListo. Usuarios demo (entran solo con el PIN):\n");
  console.log(`Tenant: ${tenant.name} (slug: ${tenant.slug}) | Empresa cliente: ${client.name}\n`);
  for (const u of [superAdmin, adminEmpresa, coordinador, conductorUser, clienteAdmin, clienteCoordinador, clienteJefe, clienteVisualizador, solicitanteUser]) {
    console.log(`${u.role.padEnd(22)} -> PIN: ${PIN_BY_PHONE[u.phone] ?? "?"}`);
  }
  console.log(`\nRuta demo: ${route.code} (estado CREADO, 4 paradas)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
