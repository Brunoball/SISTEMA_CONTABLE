import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

/* Páginas públicas */
import Inicio from "./components/Login/Inicio";
import Registro from "./components/Login/Registro";
import ResetPasswordPage from "./components/Login/ResetPasswordPage";

/* Layout del panel */
import Principal from "./components/Principal/Principal";

/* Secciones */
import Dashboard from "./components/Dashboard/Dashboard";
import Movimientos from "./components/Movimientos/Movimientos";
import Ventas from "./components/Mov_Subsection/Ventas/Ventas";
import Compras from "./components/Mov_Subsection/Compra/Compras";
import Recibos from "./components/Mov_Subsection/Recibos/Recibos";
import Otrosingresos from "./components/Mov_Subsection/Otros_Ingresos/Otros_Ingresos";
import Otrosegresos from "./components/Mov_Subsection/Otros_Egresos/Otros_Egresos";
import OrdenesPago from "./components/Mov_Subsection/OrdenesPago/OrdenesPago";
import Flujo_Caja from "./components/Flujo_de_Caja/Flujo_Caja";

/* Configuración */
import Configuracion from "./components/Configuracion/Configuracion";
import ConfigTiendaNube from "./components/Configuracion/ConfigTiendaNube";
import R2TestUploader from "./components/Configuracion/R2Test/R2TestUploader";

/* Análisis financiero */
import * as AnalisisFinancieroModule from "./components/Analisis_Financiero/Analisis_Financiero";

/* Cuentas corrientes */
import ClientesCC from "./components/Cuentas_Corrientes/Clientes/Clientes";
import ProveedoresCC from "./components/Cuentas_Corrientes/Proveedores/Proveedores";

/* STOCK */
import Stock from "./components/Stock/Stock";
import StockCategorias from "./components/Stock/StockCategorias";

/* CHEQUES */
import Cheques_Cartera from "./components/Cheques/Cheques_Cartera/Cheques_Cartera";
import Flujo_Cheques from "./components/Cheques/Flujo_Cheques/Flujo_Cheques";
import Echeqs_Cartera from "./components/Cheques/Echeqs_Cartera/Echeqs_Cartera";
import Flujo_Echeqs from "./components/Cheques/Flujo_Echeqs/Flujo_Echeqs";

/* Providers globales */
import { ListasProvider } from "./context/ListasContext";
import { DateRangeProvider } from "./context/DateRangeContext";

/* =========================================================
   Helpers: resolver componente (default o named)
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

const AnalisisFinanciero = resolveComponent(AnalisisFinancieroModule, [
  "AnalisisFinanciero",
  "Analisis_Financiero",
  "AnalisisFinancieroPage",
]);

/* =========================================================
   Auth
========================================================= */
function isAuthenticated() {
  try {
    const sessionKey = (localStorage.getItem("session_key") || "").trim();
    const rawUser = localStorage.getItem("usuario");

    if (!sessionKey) return false;
    if (!rawUser) return false;

    const u = JSON.parse(rawUser);
    if (!u || typeof u !== "object") return false;

    return true;
  } catch {
    return false;
  }
}

function RutaProtegida({ children }) {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
}

/* =========================================================
   Ruteo
========================================================= */
export default function App() {
  return (
    <Router>
      <Routes>
        {/* Público */}
        <Route path="/" element={<Inicio />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Panel protegido */}
        <Route
          path="/panel"
          element={
            <RutaProtegida>
              <DateRangeProvider>
                <ListasProvider>
                  <Principal />
                </ListasProvider>
              </DateRangeProvider>
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
          <Route path="Otrosingresos" element={<Otrosingresos />} />
          <Route path="Otrosegresos" element={<Otrosegresos />} />

          <Route path="flujo-de-caja" element={<Flujo_Caja />} />

          <Route path="cuentas-corrientes/clientes" element={<ClientesCC />} />
          <Route path="cuentas-corrientes/proveedores" element={<ProveedoresCC />} />

          {/* STOCK */}
          <Route path="stock" element={<Stock />} />
          <Route path="stock/categorias" element={<StockCategorias />} />

          {/* CHEQUES */}
          <Route path="cheques/cartera" element={<Cheques_Cartera />} />
          <Route path="cheques/flujo" element={<Flujo_Cheques />} />
          <Route path="cheques/echeqs-cartera" element={<Echeqs_Cartera />} />
          <Route path="cheques/flujo-echeqs" element={<Flujo_Echeqs />} />

          <Route path="analisis-financiero" element={<AnalisisFinanciero />} />

          {/* CONFIGURACIÓN */}
          <Route path="configuracion" element={<Configuracion />} />
          <Route path="configuracion/tiendanube" element={<ConfigTiendaNube />} />
          <Route path="configuracion/r2-test" element={<R2TestUploader />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}