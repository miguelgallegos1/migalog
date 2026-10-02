import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  doublePrecision,
  pgEnum,
  date,
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
 * cliente_visualizador/cliente_solicitante/cliente_conductor) pertenece a una empresa
 * cliente (`clients`). cliente_conductor existe porque la empresa cliente puede tener
 * flota propia (ver `vehicles`/`drivers`, ambas con "clientId" opcional) y despachar sus
 * propias rutas sin pasar por la proveedora.
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
  "cliente_conductor",
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
  ruc: text("ruc").notNull().unique(),
  // "name" guarda la razón social - no se renombra la columna para no arrastrar otra
  // migración de rename, pero en toda la UI se etiqueta como "Razón social".
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Empresa cliente (nivel 2): la que le contrata transporte a la empresa proveedora (el tenant). */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  ruc: text("ruc").notNull().unique(),
  // "name" guarda la razón social, mismo criterio que en "tenants".
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
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
  // Identificador único para login (password o PIN): no hay email en ningún lado de la app,
  // todo el contacto/alta es por WhatsApp.
  phone: text("phone").notNull().unique(),
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
  // null = conductor de la empresa proveedora (como siempre); si tiene valor, es un
  // conductor PROPIO de esa empresa cliente (rol cliente_conductor), que esa empresa puede
  // asignar a sus propias rutas sin depender de la proveedora.
  clientId: uuid("client_id").references(() => clients.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  // Camión fijo que maneja este conductor - al confirmar una ruta solo se elige el
  // conductor, el camión sale de acá (ver route-service.ts confirmRoute). Nullable: un
  // conductor recién creado puede no tener camión asignado todavía.
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  // No se controla por número de licencia sino por vigencia: pasada la fecha, ese
  // conductor (con su camión) deja de poder asignarse a una ruta hasta renovarla.
  licenseExpiresAt: date("license_expires_at").notNull(),
  licensePhotoFront: text("license_photo_front"),
  licensePhotoBack: text("license_photo_back"),
  status: text("status").notNull().default("activo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  // Mismo criterio que drivers.clientId: null = camión de la flota de la proveedora, con
  // valor = camión propio de esa empresa cliente.
  clientId: uuid("client_id").references(() => clients.id),
  plate: text("plate").notNull(),
  brandModel: text("brand_model"),
  capacityM3: doublePrecision("capacity_m3"),
  // "propio" (de quien lo registra) o "alquilado" a un tercero - la proveedora puede
  // completar camiones propios con camiones alquilados de otra empresa de transporte.
  ownership: text("ownership").notNull().default("propio"),
  ownerCompany: text("owner_company"),
  status: text("status").notNull().default("activo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sitios: lugares reutilizables (con la empresa a la que pertenecen, para facturación) que
 * arma la empresa cliente - se eligen como origen/parada/destino/sitio de facturación al
 * crear una ruta del catálogo, en vez de tipear dirección/coordenadas cada vez.
 */
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  // Solo "name"/"company" son obligatorios en el alta - "contactPhone" y lo de abajo quedan
  // libres para completarse después sin bloquear el flujo simple.
  name: text("name").notNull(),
  company: text("company").notNull(),
  contactPhone: text("contact_phone"),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Catálogo de rutas frecuentes de la empresa proveedora (tarifario): un atajo, no una
 * restricción - al crear una solicitud se puede elegir una de acá para autocompletar
 * origen/destino/precio/tiempo estimado, o seguir cargando una ruta a medida como siempre.
 * Origen/paradas/destino/sitio de facturación se eligen de la tabla "sites" (ver arriba) -
 * "name" queda armado solo como "ORIGEN-PARADA1-PARADA2-DESTINO" (ver route-templates.ts).
 */
export const routeTemplates = pgTable("route_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  effectiveDate: date("effective_date").notNull(),
  billingSiteId: uuid("billing_site_id").notNull().references(() => sites.id),
  originSiteId: uuid("origin_site_id").notNull().references(() => sites.id),
  destinationSiteId: uuid("destination_site_id").notNull().references(() => sites.id),
  price: integer("price"),
  estimatedMinutes: integer("estimated_minutes"),
  // Se calcula solo en el frontend (Mapbox Directions) cuando origen/paradas/destino tienen
  // GPS cargado - si algún punto no tiene coordenadas, queda null (no bloquea la creación).
  distanceKm: doublePrecision("distance_km"),
  // "aprobada" = visible en el selector de la solicitud. Siempre nace "pendiente" (la
  // propone una empresa cliente) hasta que la empresa proveedora fija el precio acordado
  // (aprobar) o la rechaza - la proveedora nunca la crea directo (ver route-templates.ts).
  status: routeTemplateStatusEnum("status").notNull().default("aprobada"),
  proposedByClientId: uuid("proposed_by_client_id").references(() => clients.id),
  // La empresa proveedora puede desactivar una ruta ya aprobada (deja de ofrecerse en el
  // selector de nuevas solicitudes) sin borrar el histórico - distinto de "rechazada", que
  // es la respuesta a una propuesta que nunca se aprobó.
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Paradas intermedias de un ítem del catálogo (ej. "PINTAG" entre San Antonio y Tabacundo). */
export const routeTemplateStops = pgTable("route_template_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeTemplateId: uuid("route_template_id").notNull().references(() => routeTemplates.id),
  siteId: uuid("site_id").notNull().references(() => sites.id),
  sequenceOrder: integer("sequence_order").notNull(),
  // Valor propio de esta parada (ej. costo adicional por ese desvío) - independiente del
  // "price" total de la ruta en routeTemplates, que sigue siendo el valor acordado global.
  price: integer("price"),
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
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  departedAt: timestamp("departed_at", { withTimezone: true }),
  status: stopStatusEnum("status").notNull().default("pendiente"),
  // Tiempo estimado de carga/descarga en este punto (minutos) - se define al pedir la ruta,
  // no es parte fija del catálogo (ver route_cargo_items para el detalle de qué se mueve).
  serviceMinutes: integer("service_minutes").notNull().default(0),
});

/**
 * Manifiesto de carga de la ruta: cada línea es "esto se recoge en tal parada y se deja en
 * tal otra" (ej. 19 pallets que se cargan en el origen y se bajan en una parada intermedia,
 * mientras el resto de la carga sigue hasta el destino) - no va pegado a una sola parada
 * porque en el origen suele cargarse más de una cosa distinta a la vez, cada una con su
 * propio punto de entrega dentro del itinerario. Es lo que el conductor ve en cada parada
 * para saber qué recoger/dejar ahí (ver RouteDetail.tsx).
 */
export const routeCargoItems = pgTable("route_cargo_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id").notNull().references(() => routes.id),
  quantity: integer("quantity").notNull(),
  unit: text("unit").notNull(),
  description: text("description").notNull(),
  pickupStopId: uuid("pickup_stop_id").notNull().references(() => routeStops.id),
  dropoffStopId: uuid("dropoff_stop_id").notNull().references(() => routeStops.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  // Una sola foto (no dos como la licencia del conductor): alcanza para documentar el
  // estado del incidente al momento de reportarlo.
  photo: text("photo"),
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
