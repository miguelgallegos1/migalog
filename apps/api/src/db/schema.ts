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
 */
export const roleEnum = pgEnum("role", ["super_admin", "admin_empresa", "dispatcher", "conductor", "cliente_proveedor"]);
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

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** super_admin no pertenece a ningún tenant (tenantId null). Todo el resto sí. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
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

export const providers = pgTable("providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  contactUserId: uuid("contact_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routes = pgTable("routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  code: text("code").notNull().unique(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  driverId: uuid("driver_id").references(() => drivers.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  status: routeStatusEnum("status").notNull().default("CREADO"),
  currentStopId: uuid("current_stop_id"),
  hasIncident: boolean("has_incident").notNull().default(false),
  notes: text("notes"),
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
