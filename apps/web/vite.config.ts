import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "MigaLog",
        short_name: "MigaLog",
        description: "Control logístico: rutas, camiones, conductores en tiempo real",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        icons: [{ src: "favicon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // mapbox-gl (~1.8MB) se usa en dos puntos independientes que cargan en lazy (el mapa
        // del panel de control y el selector de ubicación de Sitios) - sin esto, cada uno lo
        // empaqueta por separado y el navegador lo descarga dos veces. Forzado a un chunk de
        // vendor propio, se descarga una sola vez y queda cacheado entre despliegues de la
        // app (el código propio cambia seguido, estas librerías casi nunca).
        manualChunks: {
          mapbox: ["mapbox-gl", "react-map-gl"],
          ably: ["ably"],
        },
      },
    },
  },
});
