# MigaLog

Plataforma de control logístico multi-tenant: empresas proveedoras, rutas con paradas, camiones,
conductores, roles de usuario, y un panel de control con rastreo en tiempo real. Incluye un agente
de IA que coordina cambios de horario por WhatsApp sin intervención humana, dentro de reglas simples.

Ver el plan completo de la Fase 1 en `docs/` (o pedí el plan original si lo necesitás) para el detalle
de arquitectura y las decisiones de diseño.

## Stack

- **Backend** (`apps/api`): Hono + TypeScript, Drizzle ORM sobre Neon (Postgres serverless), pensado
  para desplegar como funciones serverless en Vercel.
- **Frontend** (`apps/web`): React + Vite + TypeScript, PWA, TailwindCSS, TanStack Query, Mapbox GL,
  Ably para tiempo real.
- **Compartido** (`packages/shared`): tipos y esquemas Zod usados por ambos.

## Requisitos

- Node.js 20+
- pnpm (si no lo tenés instalado: `corepack enable pnpm`, o usar `npx pnpm@latest <comando>` en cada paso de abajo)
- Una base de datos Postgres en [Neon](https://neon.tech) (tier gratuito alcanza para desarrollo)

## Setup local

```bash
pnpm install

# Backend
cp apps/api/.env.example apps/api/.env
# completar DATABASE_URL con tu proyecto de Neon y JWT_SECRET con cualquier string largo

pnpm db:migrate   # aplica el esquema a tu base de Neon
pnpm db:seed      # crea el tenant demo, un usuario por rol y una ruta de ejemplo

# Frontend
cp apps/web/.env.example apps/web/.env
# VITE_API_URL ya apunta a http://localhost:3001 por defecto

pnpm dev          # levanta api (puerto 3001) y web (puerto 5173) en paralelo
```

El seed imprime en consola las credenciales de prueba (emails/contraseña para los roles
administrativos, y el `deviceId` + PIN para conductor/solicitante) y el código de la ruta demo.

### Variables opcionales (todas tienen fallback en modo $0)

- `ABLY_API_KEY` / `VITE_ABLY_API_KEY`: sin esto, el tiempo real (mapa en vivo, centro de
  notificaciones) simplemente no recibe eventos - el resto de la app funciona igual.
- `VITE_MAPBOX_TOKEN`: sin esto, se muestra un aviso en vez del mapa.
- `ANTHROPIC_API_KEY`: sin esto, el agente de IA coordinador usa reglas simples (detecta pedidos de
  cambio de horario y retrasos por texto) en vez de Claude real - útil para probar todo el flujo sin
  costo. Con la key puesta, usa Claude con tool-use para conversar y decidir con más flexibilidad.
- Variables de `WHATSAPP_*`: no son necesarias para probar - el webhook acepta un body simplificado
  `{ tenantSlug, from, text }` que se puede simular directo con curl (ver abajo).

## Probar el agente de IA por WhatsApp (simulado)

Con el conductor/solicitante creados por el seed, simulá un mensaje del solicitante pidiendo un
cambio de horario:

```bash
curl -X POST http://localhost:3001/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{"tenantSlug":"demo","from":"+50588880002","text":"pueden cambiar la hora a las 15:30?"}'
```

La respuesta trae el mensaje que la IA le contestaría por WhatsApp, y queda registrado en
`ai_agent_actions` (auditable) y en `route_status_history` de la ruta activa de ese solicitante.

## Despliegue en Vercel

Se crean **dos proyectos** de Vercel apuntando al mismo repo:

1. `apps/web` (Root Directory: `apps/web`) - build estático de Vite.
2. `apps/api` (Root Directory: `apps/api`) - funciones serverless (Hono vía `hono/vercel`).

En ambos, configurar las variables de entorno del `.env.example` correspondiente en el dashboard de
Vercel (Production/Preview/Development). Neon tiene integración nativa con Vercel para inyectar
`DATABASE_URL` automáticamente si se conecta desde el marketplace de integraciones.

## Costos

Para desarrollo/piloto, todo el stack corre en **US$0/mes** salvo el uso puntual (centavos) de la
API de Claude si se activa `ANTHROPIC_API_KEY`. Ver la sección de costos del plan original para el
detalle de qué crece con el uso real y cuándo conviene pasar a planes pagos (Vercel Pro, Neon, Ably).
