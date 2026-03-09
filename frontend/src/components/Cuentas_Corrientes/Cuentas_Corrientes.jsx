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
        <div className="cc-card__head cc-card__head--module">
          <div className="cc-card__headLeft cc-card__headLeft--stack">
            <div className="cc-headTitle">
              <div className="cc-card__title">Cuentas Corrientes</div>
              <div className="cc-card__hint">
                Elegí una opción para buscar historial
              </div>
            </div>

            <div className="cc-headFilters cc-headFilters--tabs">
              <NavLink
                to="clientes"
                className={({ isActive }) =>
                  `cc-btnex cc-btnex--tab ${isActive ? "is-open" : ""}`
                }
              >
                Clientes
              </NavLink>

              <NavLink
                to="proveedores"
                className={({ isActive }) =>
                  `cc-btnex cc-btnex--tab ${isActive ? "is-open" : ""}`
                }
              >
                Proveedores
              </NavLink>
            </div>
          </div>
        </div>

        {isRoot ? (
          <div className="cc-card__bodyEmpty">
            <div className="cc-footnote">
              * Entrá a <b>Clientes</b> o <b>Proveedores</b> para buscar y ver
              el historial.
            </div>
          </div>
        ) : (
          <div className="cc-card__outlet">
            <Outlet />
          </div>
        )}
      </section>
    </div>
  );
}