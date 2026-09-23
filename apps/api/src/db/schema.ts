import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  pgEnum,
} from "drizzle-orm/pg-core";
/**
 * Los valores de estos enums están duplicados de @migalog/shared (en vez de importarlos)
 * porque el CLI de drizzle-kit resuelve los imports del paquete workspace vía require()
 * de Node plano y no sabe mapear las extensiones .js -> .ts de un paquete TS con
 * moduleResolution "Bundler". Deben mantenerse idénticos a packages/shared/src/roles.ts
 * y route-status.ts.
 *
 * Jerarquía de 2 niveles: nivel 1 (admin_empresa/coordinador/conductor) pertenece a la
 * empresa proveedora (el tenant); nivel 2 (cliente_admin/cliente_coordinador/cliente_jefe/
 * cliente_visualizador/cliente_solicitante) pertenece a una empresa cliente (`clients`).
 */
export const roleEnum = pgEnum("role", [
  "super_admin",
  "admin_empresa",
  "coordinador",
  "conductor",
  "cliente_admin",
  "cliente_coordinador",
  "cliente_jefe",
  "cliente_visualizador",
  "cliente_solicitante",
]);
export const routeStatusEnum = pgEnum("route_status", [
  "CREADO",
  "APROBADO",
  "RECHAZADO",
  "CONFIRMADO",
  "PARQUEADO",
  "EN_CURSO",
  "EN_PARADA",
  "TERMINADO",
  "CANCELADO",
]);
export const stopTypeEnum = pgEnum("stop_type", ["origen", "parada", "destino"]);
export const stopStatusEnum = pgEnum("stop_status", ["pendiente", "en_curso", "completada", "omitida"]);
export const actorTypeEnum = pgEnum("actor_type", ["human", "ai_agent"]);
export const routeTemplateStatusEnum = pgEnum("route_template_status", ["pendiente", "aprobada", "rechazada"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Empresa cliente (nivel 2): la que le contrata transporte a la empresa proveedora (el tenant). */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * super_admin no pertenece a ningún tenant (tenantId null). Los roles de nivel 1 tienen
 * tenantId y clientId null. Los roles cliente_* tienen ambos: tenantId (a través de su
 * empresa cliente) y clientId (qué empresa cliente específica).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  clientId: uuid("client_id").references(() => clients.id),
  role: roleEnum("role").notNull(),
  name: text("name").notNull(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash"),
  pinHash: text("pin_hash"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Patrón de auth para roles móviles: la invitación registra el dispositivo y guarda
 * una credencial de sesión de larga duración cifrada. El PIN/biometría del usuario
 * desbloquea localmente esa credencial - no es el secreto que viaja en cada request.
 */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  label: text("label"),
  sessionCredentialHash: text("session_credential_hash").notNull(),
  webauthnCredentialId: text("webauthn_credential_id"),
  webauthnPublicKey: text("webauthn_public_key"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drivers = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  licenseNumber: text("license_number").notNull(),
  status: text("status").notNull().default("activo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  plate: text("plate").notNull(),
  capacityKg: integer("capacity_kg"),
  status: text("status").notNull().default("activo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Catálogo de rutas frecuentes de la empresa proveedora (tarifario): un atajo, no una
 * restricción - al crear una solicitud se puede elegir una de acá para autocompletar
 * origen/destino/precio/tiempo estimado, o seguir cargando una ruta a medida como siempre.
 * Lo mantiene admin_empresa/coordinador (son quienes conocen sus tiempos y ponen el precio).
 */
export const routeTemplates = pgTable("route_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  category: text("category"), // agrupador libre, ej. la ciudad de origen ("CAYAMBE")
  name: text("name").notNull(), // ej. "ADUANA-CAYAMBE"
  originLabel: text("origin_label").notNull(),
  originAddress: text("origin_address").notNull(),
  originLat: doublePrecision("origin_lat").notNull(),
  originLng: doublePrecision("origin_lng").notNull(),
  destinationLabel: text("destination_label").notNull(),
  destinationAddress: text("destination_address").notNull(),
  destinationLat: doublePrecision("destination_lat").notNull(),
  destinationLng: doublePrecision("destination_lng").notNull(),
  price: integer("price"),
  estimatedMinutes: integer("estimated_minutes"),
  // "aprobada" = visible en el selector de la solicitud. Cuando la crea admin_empresa/
  // coordinador queda aprobada directo (es su tarifario); cuando la PROPONE una empresa
  // cliente (porque la ruta que necesita no está en la lista) queda "pendiente" hasta que
  // la empresa proveedora la revisa y fija el precio acordado (aprobar) o la rechaza.
  status: routeTemplateStatusEnum("status").notNull().default("aprobada"),
  proposedByClientId: uuid("proposed_by_client_id").references(() => clients.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routes = pgTable("routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  code: text("code").notNull().unique(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  driverId: uuid("driver_id").references(() => drivers.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  status: routeStatusEnum("status").notNull().default("CREADO"),
  currentStopId: uuid("current_stop_id"),
  hasIncident: boolean("has_incident").notNull().default(false),
  notes: text("notes"),
  // Cuándo debe arrancar la ruta (lo pide el solicitante al crearla) - distinto de
  // route_stops.planned_at, que es la hora estimada de cada parada individual.
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routeStops = pgTable("route_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => routes.id),
  sequenceOrder: integer("sequence_order").notNull(),
  type: stopTypeEnum("type").notNull(),
  label: text("label").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  // Detalle de carga de esta parada (ej. "8 UNI - Cajas encargos") - opcional, no toda
  // parada mueve carga (ej. una parada que solo es punto de control).
  cargoQuantity: integer("cargo_quantity"),
  cargoUnit: text("cargo_unit"),
  cargoDescription: text("cargo_description"),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  status: stopStatusEnum("status").notNull().default("pendiente"),
});

export const routeStatusHistory = pgTable("route_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => routes.id),
  fromStatus: routeStatusEnum("from_status"),
  toStatus: routeStatusEnum("to_status").notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routeIncidents = pgTable("route_incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => routes.id),
  severity: text("severity").notNull(),
  description: text("description").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const locationPings = pgTable("location_pings", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => routes.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Auditoría de cada intervención del agente de IA coordinador (vía WhatsApp). */
export const aiAgentActions = pgTable("ai_agent_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  routeId: uuid("route_id").references(() => routes.id),
  fromPhone: text("from_phone").notNull(),
  inboundMessage: text("inbound_message").notNull(),
  decision: text("decision").notNull(),
  ruleApplied: text("rule_applied"),
  escalated: boolean("escalated").notNull().default(false),
  replyMessage: text("reply_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
