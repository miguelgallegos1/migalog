/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          // 300/400 son los tonos "vivos" para botones primarios: fondo saturado +
          // texto oscuro encima da mejor contraste real (~8:1) que un azul oscuro
          // con texto blanco, y además resalta mucho más.
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          // 700+ quedan para textos/iconos sobre fondo claro y otros usos puntuales.
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
      },
    },
  },
  plugins: [],
};
