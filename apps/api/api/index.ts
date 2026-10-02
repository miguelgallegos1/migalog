import { handle } from "hono/vercel";
import { app } from "../src/app.js";

export const config = { runtime: "nodejs" };

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const PUT = handle(app);
// Sin este, Vercel rechaza el preflight CORS (OPTIONS) con 405 antes de que llegue a
// nuestro Hono (que sí sabe responderlo bien vía el middleware cors()) - el navegador manda
// ese preflight antes de cualquier POST/PATCH con JSON entre dominios distintos, y si falla,
// bloquea el pedido real sin que llegue a la API (por eso curl funcionaba pero el navegador no).
export const OPTIONS = handle(app);
