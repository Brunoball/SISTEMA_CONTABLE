// src/App.js
import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

/* Páginas públicas */
import Inicio from "./components/Login/Inicio";
import Registro from "./components/Login/Registro";

/* Layout del panel */
import Principal from "./components/Principal/Principal";

/* Secciones */
import Dashboard from "./components/Dashboard/Dashboard";
import Movimientos from "./components/Movimientos/Movimientos";
import Ventas from "./components/Mov_Subsection/Ventas";
import Compras from "./components/Mov_Subsection/Compras";
import Recibos from "./components/Mov_Subsection/Recibos";
import OrdenesPago from "./components/Mov_Subsection/OrdenesPago";

import Flujo_Caja from "./components/Flujo_de_Caja/Flujo_Caja";

/* ✅ IMPORT ROBUSTO (default o named) */
import * as CuentasCorrientesModule from "./components/Cuentas_Corrientes/Cuentas_Corrientes";
import * as AnalisisFinancieroModule from "./components/Analisis_Financiero/Analisis_Financiero";

/* =========================================================
   ✅ Helpers: resolver componente (default o named)
========================================================= */
function resolveComponent(mod, fallbacks = []) {
  // 1) default export
  if (mod && typeof mod.default === "function") return mod.default;

  // 2) nombres esperados (named exports)
  for (const k of fallbacks) {
    if (mod && typeof mod[k] === "function") return mod[k];
  }

  // 3) si no sabemos el nombre, buscamos "la primera función" exportada
  if (mod && typeof mod === "object") {
    for (const k of Object.keys(mod)) {
      if (typeof mod[k] === "function") return mod[k];
    }
  }

  // 4) fallback duro (evita crash silencioso)
  return function ComponenteNoEncontrado() {
    return (
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Error de import/export</h3>
        <p style={{ marginTop: 8 }}>
          No se pudo resolver el componente. Revisá si el archivo exporta{" "}
          <b>default</b> o un <b>named export</b>.
        </p>
      </div>
    );
  };
}

/* ✅ Componentes resueltos */
const CuentasCorrientes = resolveComponent(CuentasCorrientesModule, [
  "CuentasCorrientes",
  "Cuentas_Corrientes",
]);

const AnalisisFinanciero = resolveComponent(AnalisisFinancieroModule, [
  "AnalisisFinanciero",
  "Analisis_Financiero",
  "AnalisisFinancieroPage",
]);

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
<Route path="ventas" element={<Ventas />} />
<Route path="compras" element={<Compras />} />
<Route path="recibos" element={<Recibos />} />
<Route path="OrdenesPago" element={<OrdenesPago />} />


          {/* Flujo de Caja */}
          <Route path="flujo-de-caja" element={<Flujo_Caja />} />

          {/* Cuentas Corrientes */}
          <Route path="cuentas-corrientes" element={<CuentasCorrientes />} />

          {/* ✅ Análisis Financiero */}
          <Route path="analisis-financiero" element={<AnalisisFinanciero />} />
        </Route>

        {/* Cualquier otra -> login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
