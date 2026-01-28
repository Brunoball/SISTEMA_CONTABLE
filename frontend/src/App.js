// src/App.js
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

/* Páginas públicas */
import Inicio from "./components/Login/Inicio";
import Registro from "./components/Login/Registro";

/* Layout del panel */
import Principal from "./components/Principal/Principal";

/* Secciones */
import Dashboard from "./components/Dashboard/Dashboard";
import Movimientos from "./components/Movimientos/Movimientos";
import Flujo_Caja from "./components/Flujo_de_Caja/Flujo_Caja";

/* ✅ Cuentas Corrientes (IMPORT DEFAULT CORRECTO) */
import CuentasCorrientes from "./components/Cuentas_Corrientes/Cuentas_Corrientes";

/* =========================================================
   ✅ Auth
========================================================= */
function isAuthenticated() {
  try {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("usuario");

    let usuarioOk = false;
    if (rawUser) {
      try {
        JSON.parse(rawUser);
        usuarioOk = true;
      } catch {
        usuarioOk = false;
      }
    }

    return !!token || usuarioOk;
  } catch {
    return false;
  }
}

function RutaProtegida({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

/* =========================================================
   🚏 Ruteo
========================================================= */
export default function App() {
  return (
    <Router>
      <Routes>
        {/* Público */}
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />

        {/* Panel (protegido) */}
        <Route
          path="/panel"
          element={
            <RutaProtegida>
              <Principal />
            </RutaProtegida>
          }
        >
          {/* /panel -> /panel/dashboard */}
          <Route index element={<Navigate to="dashboard" replace />} />

          {/* Dashboard */}
          <Route path="dashboard" element={<Dashboard />} />

          {/* Movimientos */}
          <Route path="movimientos" element={<Movimientos />} />

          {/* Flujo de Caja */}
          <Route path="flujo-de-caja" element={<Flujo_Caja />} />

          {/* ✅ Cuentas Corrientes */}
          <Route path="cuentas-corrientes" element={<CuentasCorrientes />} />
        </Route>

        {/* Cualquier otra -> login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
