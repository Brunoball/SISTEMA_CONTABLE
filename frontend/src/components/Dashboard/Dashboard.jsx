// src/components/Dashboard/Dashboard.jsx
import React, { useMemo, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faMoneyBillTrendUp,
  faWallet,
  faUsers,
  faBoxesStacked,
  faMoneyCheckDollar,
} from "@fortawesome/free-solid-svg-icons";

import GifCarga from "../Global/Gif_Carga";
import "./dashboard.css";

// ✅ consumir ListasContext
import { useListas } from "../../context/ListasContext";

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
  if (s.includes("stock")) return faBoxesStacked;
  if (s.includes("cheques")) return faMoneyCheckDollar;
  if (s.includes("análisis") || s.includes("analisis")) return faChartLine;

  return faChartLine;
}

function pickInfo(label) {
  const s = String(label ?? "").toLowerCase();

  if (s.includes("movimientos")) {
    return "Registrá ingresos y egresos, con historial completo y filtros por período.";
  }
  if (s.includes("flujo")) {
    return "Visualizá el balance de caja y la evolución financiera por período.";
  }
  if (s.includes("cuentas") || s.includes("corrientes")) {
    return "Controlá saldos, pagos y deudas de clientes.";
  }
  if (s.includes("stock")) {
    return "Gestioná productos, cantidades disponibles y el control general del inventario.";
  }
  if (s.includes("cheques")) {
    return "Administrá cheques en cartera, eCheqs y el flujo completo de vencimientos y movimientos.";
  }
  if (s.includes("análisis") || s.includes("analisis")) {
    return "Analizá indicadores financieros y comparativas del negocio.";
  }

  return "";
}

const DASH_SEEN_KEY = "pp_seen_dashboard";

export default function Dashboard() {
  const navigate = useNavigate();

  const { ensureListsLoaded } = useListas();

  const [loadingInicial, setLoadingInicial] = useState(true);
  const didWarmupRef = useRef(false);

  useEffect(() => {
    if (didWarmupRef.current) return;
    didWarmupRef.current = true;

    let alive = true;

    const fallback = setTimeout(() => {
      if (!alive) return;
      setLoadingInicial(false);
    }, 10000);

    (async () => {
      try {
        await ensureListsLoaded({ force: true, background: true });
      } catch {
        // el provider ya maneja el error
      } finally {
        if (!alive) return;
        clearTimeout(fallback);
        setLoadingInicial(false);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, [ensureListsLoaded]);

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

  const navItems = useMemo(() => {
    const base = [
      { key: "movimientos", label: "Movimientos", ruta: "/panel/movimientos" },
      { key: "flujo-de-caja", label: "Flujo de Caja", ruta: "/panel/flujo-de-caja" },
      { key: "cuentas-corrientes", label: "Cuentas Corrientes", ruta: "/panel/cuentas-corrientes" },
      { key: "stock", label: "Stock", ruta: "/panel/stock" },
      { key: "cheques", label: "Cheques", ruta: "/panel/cheques/cartera" },
      { key: "analisis-financiero", label: "Análisis Financiero", ruta: "/panel/analisis-financiero" },
    ].map((it) => ({
      ...it,
      icon: pickIcon(it.label),
      info: pickInfo(it.label),
    }));

    // si querés que todos vean todo, dejá esto:
    return base;

    // si querés seguir limitando por plan, usá esto en lugar del return base:
    // const limit = planNivel === 1 ? 2 : planNivel === 2 ? 4 : 6;
    // return base.slice(0, limit);
  }, [planNivel]);

  const handleNavigate = (ruta) => {
    try {
      sessionStorage.setItem(DASH_SEEN_KEY, "1");
    } catch {}

    navigate(ruta);
    document.activeElement?.blur?.();
  };

  return (
    <>
      {loadingInicial && <GifCarga />}

      <div className="db">
        <header className="db-header">
          <div className="db-header__left">
            <h1 className="db-title">Panel Contable</h1>
            <p className="db-subtitle">Elegí una sección para comenzar.</p>
          </div>

          <div className="db-header__right">
            <div className="db-pill">
              <span className="db-pill__dot" aria-hidden="true" />
              <span className="db-pill__text">Plan nivel {planNivel}</span>
            </div>
          </div>
        </header>

        <section className="db-hero">
          <div className="db-hero__card">
            <div className="db-hero__icon" aria-hidden="true">
              <FontAwesomeIcon icon={faChartLine} />
            </div>
            <div className="db-hero__text">
              <h2>Bienvenido a BALTO</h2>
              <p>
                Tu sistema contable para gestionar el negocio de punta a punta:
                movimientos, caja, cuentas corrientes, stock, cheques y análisis
                financiero en un solo lugar.
              </p>
            </div>
          </div>
        </section>

        <section className="db-grid">
          <div className="db-card">
            <div className="db-card__title">Acceso rápido</div>
            <div className="db-card__desc">
              Accedé a los módulos disponibles según tu plan.
            </div>

            <div className="db-quick db-stats2">
              {navItems.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className="db-quick__item"
                  onClick={() => handleNavigate(it.ruta)}
                  title={it.info}
                >
                  <span className="db-quick__icon">
                    <FontAwesomeIcon icon={it.icon} />
                  </span>
                  <span className="db-quick__label">{it.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="db-card">
            <div className="db-card__title">Información</div>
            <div className="db-card__desc">
              Descripción rápida de cada módulo disponible.
            </div>

            <div className="db-stats">
              {navItems.map((it) => (
                <div
                  key={`${it.key}-info`}
                  className="db-stat"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigate(it.ruta)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNavigate(it.ruta);
                    }
                  }}
                >
                  <div className="db-stat__k">
                    <FontAwesomeIcon icon={it.icon} style={{ marginRight: 8 }} />
                    {it.label}
                  </div>

                  <div
                    className="db-stat__v"
                    style={{ fontSize: 13, lineHeight: 1.25 }}
                  >
                    {it.info}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="db-footer">
          Desarrollado por{" "}
          <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
            3devs.solutions
          </a>
        </footer>
      </div>
    </>
  );
}