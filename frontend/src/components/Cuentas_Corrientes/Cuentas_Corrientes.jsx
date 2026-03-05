// ✅ REEMPLAZAR COMPLETO
// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx

import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import "./cuentas_corrientes.css";

export default function Cuentas_Corrientes() {
  const location = useLocation();

  const isRoot =
    location.pathname.endsWith("/cuentas_corrientes") ||
    location.pathname.endsWith("/cuentas_corrientes/");

  return (
    <div className="cc-page">
      <section className="cc-card cc-card--table">
        <div className="cc-card__head">
          <div className="cc-card__headLeft">
            <div className="cc-headTitle">
              <div className="cc-card__title">Cuentas Corrientes</div>
              <div className="cc-card__hint">Elegí una opción para buscar historial</div>
            </div>

            <div className="cc-headFilters" style={{ gap: 10 }}>
              <NavLink
                to="clientes"
                className={({ isActive }) => `cc-btnex ${isActive ? "is-open" : ""}`}
                style={{ textDecoration: "none" }}
              >
                Clientes
              </NavLink>

              <NavLink
                to="proveedores"
                className={({ isActive }) => `cc-btnex ${isActive ? "is-open" : ""}`}
                style={{ textDecoration: "none" }}
              >
                Proveedores
              </NavLink>
            </div>
          </div>
        </div>

        {/* ✅ Si está en la raíz, no mostramos nada más */}
        {isRoot ? (
          <div style={{ padding: 16 }}>
            <div className="cc-footnote">
              * Esta sección ahora es un contenedor. Entrá a <b>Clientes</b> o <b>Proveedores</b> para buscar y ver el historial.
            </div>
          </div>
        ) : (
          <div style={{ paddingTop: 6 }}>
            <Outlet />
          </div>
        )}
      </section>
    </div>
  );
}