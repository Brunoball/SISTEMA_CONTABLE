// src/App.js
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
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
   Placeholder para secciones no hechas aún
========================================================= */
function SeccionPlaceholder({ titulo = "SECCIÓN" }) {
  const location = useLocation();
  const t =
    titulo ||
    String(location.pathname)
      .replace("/panel/", "")
      .replace(/-/g, " ")
      .toUpperCase();

  return (
    <div style={{ padding: 18 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(0,0,0,.06)",
          borderRadius: 16,
          padding: 18,
          boxShadow: "0 10px 30px rgba(0,0,0,.06)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>{t}</h2>
        <p style={{ marginTop: 8, opacity: 0.7 }}>
          Esta sección todavía no está implementada.
        </p>
      </div>
    </div>
  );
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

          {/* ✅ 1) Movimientos */}
          <Route path="movimientos" element={<Movimientos />} />

          {/* ✅ 2) Flujo de Caja */}
          <Route path="flujo-de-caja" element={<Flujo_Caja />} />

          {/* ✅ 3) Cuentas Corrientes (placeholder por ahora) */}
          <Route
            path="cuentas-corrientes"
            element={<SeccionPlaceholder titulo="CUENTAS CORRIENTES" />}
          />
        </Route>

        {/* Cualquier otra -> login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
