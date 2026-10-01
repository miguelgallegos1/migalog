import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ControlCenter from "./pages/ControlCenter";

// Todo lo que no sea el login ni el panel de control (las dos pantallas que SIEMPRE se
// abren apenas se entra a la app) va en su propio chunk - antes se importaban las ~12
// páginas de una sola vez en el bundle inicial, así que entrar solo a "/login" ya bajaba
// el código de pantallas de administración que un conductor nunca abre. Pesa en cualquier
// conexión, pero sobre todo en datos móviles.
const RouteDetail = lazy(() => import("./pages/RouteDetail"));
const NewRouteRequest = lazy(() => import("./pages/NewRouteRequest"));
const History = lazy(() => import("./pages/History"));
const Clients = lazy(() => import("./pages/Clients"));
const RouteCatalog = lazy(() => import("./pages/RouteCatalog"));
const Drivers = lazy(() => import("./pages/Drivers"));
const Vehicles = lazy(() => import("./pages/Vehicles"));
const Users = lazy(() => import("./pages/Users"));
const Tenants = lazy(() => import("./pages/Tenants"));
const Sites = lazy(() => import("./pages/Sites"));

function RouteFallback() {
  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400 dark:text-slate-500">Cargando...</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<ControlCenter />} />
          <Route
            path="/rutas/nueva"
            element={
              <Suspense fallback={<RouteFallback />}>
                <NewRouteRequest />
              </Suspense>
            }
          />
          <Route
            path="/rutas/:id"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RouteDetail />
              </Suspense>
            }
          />
          <Route
            path="/historial"
            element={
              <Suspense fallback={<RouteFallback />}>
                <History />
              </Suspense>
            }
          />
          <Route
            path="/clientes"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Clients />
              </Suspense>
            }
          />
          <Route
            path="/catalogo"
            element={
              <Suspense fallback={<RouteFallback />}>
                <RouteCatalog />
              </Suspense>
            }
          />
          <Route
            path="/sitios"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Sites />
              </Suspense>
            }
          />
          <Route
            path="/conductores"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Drivers />
              </Suspense>
            }
          />
          <Route
            path="/camiones"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Vehicles />
              </Suspense>
            }
          />
          <Route
            path="/usuarios"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Users />
              </Suspense>
            }
          />
          <Route
            path="/empresas"
            element={
              <Suspense fallback={<RouteFallback />}>
                <Tenants />
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
