import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import ControlCenter from "./pages/ControlCenter";
import RouteDetail from "./pages/RouteDetail";
import NewRouteRequest from "./pages/NewRouteRequest";
import History from "./pages/History";
import Clients from "./pages/Clients";
import RouteCatalog from "./pages/RouteCatalog";
import Drivers from "./pages/Drivers";
import Vehicles from "./pages/Vehicles";
import Users from "./pages/Users";
import Tenants from "./pages/Tenants";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<ControlCenter />} />
          <Route path="/rutas/nueva" element={<NewRouteRequest />} />
          <Route path="/rutas/:id" element={<RouteDetail />} />
          <Route path="/historial" element={<History />} />
          <Route path="/clientes" element={<Clients />} />
          <Route path="/catalogo" element={<RouteCatalog />} />
          <Route path="/conductores" element={<Drivers />} />
          <Route path="/camiones" element={<Vehicles />} />
          <Route path="/usuarios" element={<Users />} />
          <Route path="/empresas" element={<Tenants />} />
        </Route>
      </Route>
    </Routes>
  );
}
