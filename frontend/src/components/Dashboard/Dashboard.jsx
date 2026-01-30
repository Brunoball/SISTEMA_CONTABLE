// src/components/Dashboard/Dashboard.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faMoneyBillTrendUp,
  faWallet,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

import "./dashboard.css";

function normalizeRol(value) {
  if (value == null) return "vista";
  const v = String(value).trim().toLowerCase();
  if (
    v === "1" ||
    v === "admin" ||
    v === "administrator" ||
    v === "administrador" ||
    v === "superadmin"
  ) {
    return "admin";
  }
  return "vista";
}

function normalizePlanNivel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function pickIcon(label) {
  const s = String(label ?? "").toLowerCase();
  if (s.includes("movimientos")) return faMoneyBillTrendUp;
  if (s.includes("flujo")) return faWallet;
  if (s.includes("cuentas") || s.includes("corrientes")) return faUsers;
  if (s.includes("análisis") || s.includes("analisis")) return faChartLine;
  return faChartLine;
}

const DASH_SEEN_KEY = "pp_seen_dashboard";

export default function Dashboard() {
  const navigate = useNavigate();

  const usuario = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      if (u) u.rol = normalizeRol(u.rol);
      return u || null;
    } catch {
      return null;
    }
  }, []);

  const planNivel = useMemo(() => {
    return normalizePlanNivel(usuario?.plan_nivel ?? usuario?.planNivel ?? 1);
  }, [usuario]);

  // ✅ AHORA 4 SECCIONES (incluye Análisis Financiero)
  const navItems = useMemo(() => {
    const base = [
      { key: "movimientos", label: "Movimientos", ruta: "/panel/movimientos" },
      { key: "flujo-de-caja", label: "Flujo de Caja", ruta: "/panel/flujo-de-caja" },
      { key: "cuentas-corrientes", label: "Cuentas Corrientes", ruta: "/panel/cuentas-corrientes" },
      { key: "analisis-financiero", label: "Análisis Financiero", ruta: "/panel/analisis-financiero" },
    ].map((it) => ({ ...it, icon: pickIcon(it.label) }));

    // ✅ Plan 1: 1 módulo | Plan 2: 2 módulos | Plan 3: 4 módulos
    const limit = planNivel === 1 ? 1 : planNivel === 2 ? 2 : 4;
    return base.slice(0, limit);
  }, [planNivel]);

  const handleNavigate = (ruta) => {
    try {
      sessionStorage.setItem(DASH_SEEN_KEY, "1");
    } catch {}
    navigate(ruta);
    document.activeElement?.blur?.();
  };

  return (
    <div className="db">
      {/* HEADER */}
      <header className="db-header">
        <div className="db-header__left">
          <h1 className="db-title">Panel Contable</h1>
          <p className="db-subtitle">
            Elegí una sección para comenzar. Este dashboard aparece solo al iniciar sesión.
          </p>
        </div>

        <div className="db-header__right">
          <div className="db-pill">
            <span className="db-pill__dot" aria-hidden="true" />
            <span className="db-pill__text">Plan nivel {planNivel}</span>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="db-hero">
        <div className="db-hero__card">
          <div className="db-hero__icon" aria-hidden="true">
            <FontAwesomeIcon icon={faChartLine} />
          </div>
          <div className="db-hero__text">
            <h2>Bienvenido</h2>
            <p>Entrás acá una sola vez por sesión. Después manejás todo desde el menú lateral.</p>
          </div>
        </div>
      </section>

      {/* GRID */}
      <section className="db-grid">
        {/* Acceso rápido */}
        <div className="db-card">
          <div className="db-card__title">Acceso rápido</div>
          <div className="db-card__desc">Accedé a los módulos disponibles según tu plan.</div>

          <div className="db-quick">
            {navItems.map((it) => (
              <button
                key={it.key}
                type="button"
                className="db-quick__item"
                onClick={() => handleNavigate(it.ruta)}
              >
                <span className="db-quick__icon" aria-hidden="true">
                  <FontAwesomeIcon icon={it.icon} />
                </span>
                <span className="db-quick__label">{it.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="db-card">
          <div className="db-card__title">Información</div>
          <div className="db-card__desc">
            Acá después podés mostrar resúmenes rápidos del sistema (caja, cuentas corrientes, etc.).
          </div>

          <div className="db-stats">
            <div className="db-stat">
              <div className="db-stat__k">Movimientos</div>
              <div className="db-stat__v">—</div>
            </div>
            <div className="db-stat">
              <div className="db-stat__k">Caja</div>
              <div className="db-stat__v">—</div>
            </div>
            <div className="db-stat">
              <div className="db-stat__k">Ctas. Corrientes</div>
              <div className="db-stat__v">—</div>
            </div>
            <div className="db-stat">
              <div className="db-stat__k">Estado</div>
              <div className="db-stat__v">OK</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="db-footer">
        Desarrollado por{" "}
        <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
          3devs.solutions
        </a>
      </footer>
    </div>
  );
}
