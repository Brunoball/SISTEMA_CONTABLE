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

/* ✅ NUEVO: Provider global de listas */
import { ListasProvider } from "./context/ListasContext";

/* =========================================================
   ✅ Helpers: resolver componente (default o named)
========================================================= */
function resolveComponent(mod, fallbacks = []) {
  if (mod && typeof mod.default === "function") return mod.default;

  for (const k of fallbacks) {
    if (mod && typeof mod[k] === "function") return mod[k];
  }

  if (mod && typeof mod === "object") {
    for (const k of Object.keys(mod)) {
      if (typeof mod[k] === "function") return mod[k];
    }
  }

  return function ComponenteNoEncontrado() {
    return (
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: 0 }}>Error de import/export</h3>
        <p style={{ marginTop: 8 }}>
          No se pudo resolver el componente. Revisá si el archivo exporta <b>default</b> o un{" "}
          <b>named export</b>.
        </p>
      </div>
    );
  };
}

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
   ✅ Auth (SaaS REAL)
   - En tu sistema NO usás "token"
   - Usás session_key + usuario en localStorage
========================================================= */
function isAuthenticated() {
  try {
    const sessionKey = (localStorage.getItem("session_key") || "").trim();
    const rawUser = localStorage.getItem("usuario");

    // ✅ debe existir session_key
    if (!sessionKey) return false;

    // ✅ y un usuario JSON válido
    if (!rawUser) return false;

    const u = JSON.parse(rawUser);
    if (!u || typeof u !== "object") return false;

    // opcional: chequear campos mínimos
    // if (!u.idTenant) return false;

    return true;
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
              {/* ✅ Provider vive acá: afecta a TODO el panel */}
              <ListasProvider>
                <Principal />
              </ListasProvider>
            </RutaProtegida>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />

          <Route path="dashboard" element={<Dashboard />} />

          <Route path="movimientos" element={<Movimientos />} />
          <Route path="ventas" element={<Ventas />} />
          <Route path="compras" element={<Compras />} />
          <Route path="recibos" element={<Recibos />} />
          <Route path="OrdenesPago" element={<OrdenesPago />} />

          <Route path="flujo-de-caja" element={<Flujo_Caja />} />
          <Route path="cuentas-corrientes" element={<CuentasCorrientes />} />
          <Route path="analisis-financiero" element={<AnalisisFinanciero />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
