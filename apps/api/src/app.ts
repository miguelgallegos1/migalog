import { Hono } from "hono";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth.js";
import { tenantRoutes } from "./routes/tenants.js";
import { userRoutes } from "./routes/users.js";
import { providerRoutes } from "./routes/providers.js";
import { driverRoutes } from "./routes/drivers.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { routeRoutes } from "./routes/routes.js";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { RouteServiceError } from "./lib/route-service.js";

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(","),
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/tenants", tenantRoutes);
app.route("/users", userRoutes);
app.route("/providers", providerRoutes);
app.route("/drivers", driverRoutes);
app.route("/vehicles", vehicleRoutes);
app.route("/routes", routeRoutes);
app.route("/whatsapp", whatsappRoutes);

app.onError((err, c) => {
  if (err instanceof RouteServiceError) {
    return c.json({ error: err.message }, err.status as 400 | 404);
  }
  if (err instanceof ZodError) {
    return c.json({ error: "Datos inválidos", details: err.issues }, 400);
  }
  console.error(err);
  return c.json({ error: "Error interno" }, 500);
});
