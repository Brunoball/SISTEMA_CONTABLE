// src/components/Principal/Principal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import LogoBalto from "../../imagenes/Logotransparente.png";

import {
  faChartLine,
  faMoneyBillTrendUp,
  faWallet,
  faUsers,
  faSignOutAlt,
  faUserCircle,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import ModalPerfil from "../Perfil/ModalPerfil";

/* =========================
   Modal cierre de sesión
========================= */
const ConfirmLogoutModal = ({ open, onClose, onConfirm }) => {
  const cancelBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <div
      className="pp-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pp-modal-title"
      onMouseDown={onClose}
    >
      <div className="pp-modal" onMouseDown={stop}>
        <div className="pp-modal__icon" aria-hidden="true">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 id="pp-modal-title" className="pp-modal__title">
          Confirmar cierre de sesión
        </h3>
        <p className="pp-modal__text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>

        <div className="pp-modal__actions">
          <button
            type="button"
            className="pp-btn pp-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="pp-btn pp-btn--danger"
            onClick={onConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

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

/* =========================
   Helpers NAV
========================= */
function slugify(name) {
  return (
    String(name ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "seccion"
  );
}

function pickIcon(label) {
  const s = String(label ?? "").toLowerCase();
  if (s.includes("movimientos")) return faMoneyBillTrendUp;
  if (s.includes("flujo")) return faWallet;
  if (s.includes("cuentas") || s.includes("corrientes")) return faUsers;
  if (s.includes("analisis") || s.includes("análisis")) return faChartLine;
  return faChartLine;
}

/* =========================
   Dashboard 1 sola vez
========================= */
const DASH_SEEN_KEY = "pp_dashboard_seen_once";

function hasSeenDashboard() {
  try {
    return sessionStorage.getItem(DASH_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markDashboardSeen() {
  try {
    sessionStorage.setItem(DASH_SEEN_KEY, "1");
  } catch {}
}

const Principal = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPerfilModal, setShowPerfilModal] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      if (u) {
        u.rol = normalizeRol(u.rol);
        u.plan_nivel = normalizePlanNivel(u.plan_nivel ?? u.planNivel ?? 1);
      }
      setUsuario(u || null);
    } catch {
      setUsuario(null);
    }
  }, []);

  const planNivel = normalizePlanNivel(
    usuario?.plan_nivel ?? usuario?.planNivel ?? 1
  );

  // ✅ SECCIONES (ahora 4 con Análisis Financiero)
  const navItems = useMemo(() => {
    const base = [
      { label: "Movimientos" },
      { label: "Flujo de Caja" },
      { label: "Cuentas Corrientes" },
      { label: "Análisis Financiero" }, // ✅ NUEVO
    ].map((x) => {
      const slug = slugify(x.label); // analisis-financiero ✅
      return {
        key: slug,
        icon: pickIcon(x.label),
        label: x.label,
        ruta: `/panel/${slug}`,
      };
    });

    // ✅ Plan: 1=1 sección, 2=2 secciones, 3=4 secciones
    const limit = planNivel === 1 ? 1 : planNivel === 2 ? 2 : 4;
    return base.slice(0, limit);
  }, [planNivel]);

  const activeKey = useMemo(() => {
    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));
    return found?.key || "";
  }, [location.pathname, navItems]);

  const activeLabel = useMemo(() => {
    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));
    return found?.label || "Dashboard";
  }, [location.pathname, navItems]);

  // ✅ Al iniciar sesión: Dashboard solo 1 vez por sesión
  useEffect(() => {
    if (!usuario) return;
    if (!location.pathname.startsWith("/panel")) return;

    const seen = hasSeenDashboard();

    // si NO vio dashboard aún, lo mandamos al dashboard
    if (!seen && location.pathname !== "/panel/dashboard") {
      navigate("/panel/dashboard", { replace: true });
      return;
    }

    // si YA lo vio, y cae en dashboard, lo mandamos a la primera sección permitida
    if (seen && location.pathname === "/panel/dashboard") {
      navigate(navItems[0]?.ruta || "/panel/dashboard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, navItems]);

  // ✅ Protección por plan (dashboard permitido siempre)
  useEffect(() => {
    if (!usuario) return;
    if (!location.pathname.startsWith("/panel")) return;

    if (location.pathname.startsWith("/panel/dashboard")) return;

    markDashboardSeen();

    const allowed = navItems.some((x) => location.pathname.startsWith(x.ruta));
    if (!allowed) {
      navigate("/panel/dashboard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, navItems, location.pathname]);

  const handleNavigate = (ruta) => {
    if (ruta && ruta !== "/panel/dashboard") markDashboardSeen();
    navigate(ruta);
    document.activeElement?.blur?.();
  };

  // ✅ navegar al dashboard desde el logo
  const handleLogoClick = () => {
    navigate("/panel/dashboard");
    document.activeElement?.blur?.();
  };

  const confirmarCierreSesion = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
    } catch {}
    setShowLogoutModal(false);
    navigate("/", { replace: true });
  };

  const openPerfil = () => setShowPerfilModal(true);

  return (
    <div className="pp-shell">
      {/* HEADER FIJO ARRIBA */}
{/* HEADER FIJO ARRIBA */}
<header className="mov-topbar" role="banner" aria-label="Header fijo">
  <div className="mov-topbar__left">
    {/* ✅ Logo + Nombre */}
    <button
      type="button"
      className="mov-topbar__logo"
      onClick={handleLogoClick}
      aria-label="Ir al dashboard"
      title="Ir al dashboard"
    >
      {/* Poné tu logo acá: <img src="/logo.png" alt="Logo" /> */}
      <img
  src={LogoBalto}
  alt="Logo Balto"
  className="mov-topbar__logoImg"
/>

    </button>

    <div className="mov-topbar__titles">
      <div className="mov-topbar__sysname">SISTEMA CONTABLE</div>
      <div className="mov-topbar__sysby">Desarrollado por 3 devs</div>
    </div>
  </div>

  {/* Derecha: sección activa + usuario */}
  <div className="mov-topbar__right">
    <div className="mov-topbar__section" title={activeLabel}>
      {activeLabel}
    </div>

    <button
      type="button"
      className="mov-topbar__usericon"
      onClick={openPerfil}
      title="Perfil"
      aria-label="Abrir perfil"
    >
      <FontAwesomeIcon icon={faUserCircle} />
    </button>
  </div>
</header>


      {/* SIDEBAR */}
      <aside className="pp-sidebar" aria-label="Navegación principal">
        <div
          className="pp-brand"
          onClick={handleLogoClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleLogoClick();
            }
          }}
        >
          <div className="pp-brand__mark" aria-hidden="true">
            <FontAwesomeIcon icon={faChartLine} />
          </div>
          <div className="pp-brand__text">
            <div className="pp-brand__title">Contable</div>
            <div className="pp-brand__subtitle">Panel</div>
          </div>
        </div>

        <nav className="pp-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`pp-nav__item ${activeKey === item.key ? "is-active" : ""}`}
              onClick={() => handleNavigate(item.ruta)}
              title={item.label}
            >
              <span className="pp-nav__icon" aria-hidden="true">
                <FontAwesomeIcon icon={item.icon} />
              </span>
              <span className="pp-nav__label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* ABAJO: logout */}
        <div className="pp-sidebar__bottom">
          <button
            type="button"
            className="pp-logout"
            onClick={() => setShowLogoutModal(true)}
            title="Cerrar sesión"
          >
            <span className="pp-logout__icon" aria-hidden="true">
              <FontAwesomeIcon icon={faSignOutAlt} />
            </span>
            <span className="pp-logout__label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}
      <main className="pp-content">
        <div className="pp-content__inner">
          <Outlet />
        </div>
      </main>

      {/* MODAL PERFIL */}
      <ModalPerfil
        open={showPerfilModal}
        onClose={() => setShowPerfilModal(false)}
        usuario={usuario}
      />

      <ConfirmLogoutModal
        open={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmarCierreSesion}
      />
    </div>
  );
};

export default Principal;
