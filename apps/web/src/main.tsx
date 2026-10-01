import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  // staleTime default de TanStack Query es 0: sin esto, CUALQUIER pantalla (Vehículos,
  // Sitios, Usuarios, etc.) revalida contra el backend cada vez que se vuelve a montar al
  // navegar, aunque los datos tengan segundos de antigüedad - de más en una conexión móvil.
  // Una pantalla que necesite datos siempre al segundo puede bajar su propio staleTime.
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 20_000 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
