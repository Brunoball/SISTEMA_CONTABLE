// src/components/Principal/Principal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import LogoBalto from "../../imagenes/LBT_TS_P.png";

import {
  faChartLine,
  faMoneyBillTrendUp,
  faWallet,
  faUsers,
  faSignOutAlt,
  faUserCircle,
  faChevronDown,
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
    <div className="pp-modal-overlay" onMouseDown={onClose}>
      <div className="pp-modal" onMouseDown={stop}>
        <div className="pp-modal__icon">
          <FontAwesomeIcon icon={faSignOutAlt} />
        </div>

        <h3 className="pp-modal__title">Confirmar cierre de sesión</h3>
        <p className="pp-modal__text">
          ¿Estás seguro de que deseas cerrar la sesión?
        </p>

        <div className="pp-modal__actions">
          <button
            className="pp-btn pp-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
          >
            Cancelar
          </button>
          <button className="pp-btn pp-btn--danger" onClick={onConfirm}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Helpers
========================= */
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
  if (s.includes("cuentas")) return faUsers;
  if (s.includes("analisis")) return faChartLine;
  return faChartLine;
}

/* =========================
   Dashboard una sola vez
========================= */
const DASH_SEEN_KEY = "pp_dashboard_seen_once";

function markDashboardSeen() {
  try {
    sessionStorage.setItem(DASH_SEEN_KEY, "1");
  } catch {}
}

/* =========================
   COMPONENTE
========================= */
const Principal = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPerfilModal, setShowPerfilModal] = useState(false);

  // ✅ Submenú Movimientos: mobile por click, desktop por hover con delay
  const [openMovSub, setOpenMovSub] = useState(false);

  // ✅ timers para abrir/cerrar con delay
  const closeTimerRef = useRef(null);
  const openTimerRef = useRef(null);

  const closeSoon = (ms = 220) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpenMovSub(false), ms);
  };

  const openSoon = (ms = 500) => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => setOpenMovSub(true), ms);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const cancelOpen = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  };

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      if (u) {
        u.rol = normalizeRol(u.rol);
        u.plan_nivel = normalizePlanNivel(u.plan_nivel ?? 1);
      }
      setUsuario(u || null);
    } catch {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    };
  }, []);

  const planNivel = normalizePlanNivel(usuario?.plan_nivel ?? 1);

  const navItems = useMemo(() => {
    const base = [
      {
        label: "Movimientos", ruta:"/panel/Movimientos",
        children: [
          // ✅ solo ventas va a /panel/ventas
          { label: "Ventas", ruta: "/panel/ventas" },

          // ✅ todas las demás opciones van a dashboard (panel)
          { label: "Compras", ruta: "/panel/compras" },
          { label: "Recibo", ruta: "/panel/dashboard" },
          { label: "Orden de Pago", ruta: "/panel/dashboard" },
          { label: "Otros ingresos", ruta: "/panel/dashboard" },
        ],
      },
      { label: "Flujo de Caja" },
      { label: "Cuentas Corrientes" },
      { label: "Análisis Financiero" },
    ].map((x) => {
      const slug = slugify(x.label);
      return {
        key: slug,
        label: x.label,
        icon: pickIcon(x.label),
        ruta: `/panel/${slug}`,
        children: x.children || null,
      };
    });

    const limit = planNivel === 1 ? 1 : planNivel === 2 ? 2 : 4;
    return base.slice(0, limit);
  }, [planNivel]);

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith("/panel/movimientos")) return "movimientos";
    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));
    return found?.key || "";
  }, [location.pathname, navItems]);

  const activeLabel = useMemo(() => {
    if (location.pathname.startsWith("/panel/movimientos")) return "Movimientos";
    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));
    return found?.label || "Dashboard";
  }, [location.pathname, navItems]);

  const handleNavigate = (ruta) => {
    if (ruta && ruta !== "/panel/dashboard") markDashboardSeen();
    navigate(ruta);
  };

  const handleLogoClick = () => navigate("/panel/dashboard");

  const confirmarCierreSesion = () => {
    try {
      sessionStorage.clear();
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
    } catch {}
    setShowLogoutModal(false);
    navigate("/", { replace: true });
  };

  const isNoHover = () => {
    try {
      return window.matchMedia && window.matchMedia("(hover: none)").matches;
    } catch {
      return false;
    }
  };

  return (
    <div className="pp-shell">
      {/* ================= HEADER ================= */}
      <header className="mov-topbar">
        <div className="mov-topbar__left">
          <button
            className="mov-topbar__logo"
            onClick={handleLogoClick}
            title="Ir al dashboard"
          >
            <img
              src={LogoBalto}
              alt="Logo Balto"
              className="mov-topbar__logoImg"
            />
          </button>

          <div className="mov-topbar__titles">
            <div className="mov-topbar__sysname">
              <span className="mov-topbar__brandName">BALTO</span>
              <span className="mov-topbar__brandDot">•</span>
              <span className="mov-topbar__brandType">Sistema Contable</span>
            </div>

            <div className="mov-topbar__sysby">
              Desarrollado por{" "}
              <a
                href="https://3devsnet.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mov-topbar__sysbyLink"
              >
                3 devs
              </a>
            </div>
          </div>
        </div>

        <div className="mov-topbar__right">
          <div className="mov-topbar__section">{activeLabel}</div>
          <button
            className="mov-topbar__usericon"
            onClick={() => setShowPerfilModal(true)}
            title="Perfil"
          >
            <FontAwesomeIcon icon={faUserCircle} />
          </button>
        </div>
      </header>

      {/* ================= SIDEBAR ================= */}
      <aside className="pp-sidebar">
        {/* ✅ BOTÓN PANEL CONTABLE */}
        <div
          className="pp-brand"
          onClick={handleLogoClick}
          role="button"
          tabIndex={0}
        >
          <div className="pp-brand__mark">
            <FontAwesomeIcon icon={faChartLine} />
          </div>
          <div className="pp-brand__text">
            <div className="pp-brand__title">Contable</div>
            <div className="pp-brand__subtitle">Panel</div>
          </div>
        </div>

        <nav className="pp-nav">
          {navItems.map((item) => {
            const hasSub = Array.isArray(item.children) && item.children.length > 0;
            const isMov = item.key === "movimientos";

            const isActive =
              activeKey === item.key ||
              (isMov && location.pathname.startsWith("/panel/movimientos"));

            const isOpen = isMov && openMovSub;

            return (
              <div
                key={item.key}
                className={`pp-navGroup ${hasSub ? "has-sub" : ""} ${
                  isOpen ? "is-open" : ""
                }`}
                // ✅ DESKTOP: hover en TODO Movimientos -> abre con delay 0.5s
                onMouseEnter={() => {
                  if (!isNoHover() && isMov) {
                    cancelClose();
                    openSoon(300);
                  }
                }}
                onMouseLeave={() => {
                  if (!isNoHover() && isMov) {
                    cancelOpen();
                    closeSoon(220);
                  }
                }}
              >
                <div
                  className={`pp-nav__item ${isActive ? "is-active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // mobile: tocás el item y alterna el submenú
                    if (hasSub && isNoHover()) {
                      if (isMov) setOpenMovSub((v) => !v);
                      return;
                    }


                    handleNavigate(item.ruta);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();

                      if (hasSub && isNoHover()) {
                        if (isMov) setOpenMovSub((v) => !v);
                        return;
                      }



                      handleNavigate(item.ruta);
                    }
                  }}
                >
                  <span className="pp-nav__icon">
                    <FontAwesomeIcon icon={item.icon} />
                  </span>

                  <span className="pp-nav__label">{item.label}</span>


                </div>

                {hasSub && (
                  <div
                    className="pp-navSub"
                    // ✅ si entrás al submenu, se mantiene abierto
                    onMouseEnter={() => {
                      if (!isNoHover() && isMov) {
                        cancelClose();
                        cancelOpen();
                        setOpenMovSub(true);
                      }
                    }}
                    onMouseLeave={() => {
                      if (!isNoHover() && isMov) closeSoon(220);
                    }}
                  >
                    {item.children.map((sub) => (
                      <button
                        key={sub.ruta + sub.label}
                        className={`pp-navSub__item ${
                          location.pathname.startsWith(sub.ruta) ? "is-active" : ""
                        }`}
                        onClick={() => {
                          markDashboardSeen();
                          navigate(sub.ruta);
                          setOpenMovSub(false); // cerrar al elegir
                        }}
                      >
                        <span className="pp-navSub__dot" />
                        <span className="pp-navSub__label">{sub.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="pp-sidebar__bottom">
          <button className="pp-logout" onClick={() => setShowLogoutModal(true)}>
            <span className="pp-logout__icon">
              <FontAwesomeIcon icon={faSignOutAlt} />
            </span>
            <span className="pp-logout__label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ================= CONTENT ================= */}
      <main className="pp-content">
        <div className="pp-content__inner">
          <Outlet />
        </div>
      </main>

      {/* ================= MODALES ================= */}
      <ModalPerfil
        open={showPerfilModal}
        onClose={() => setShowPerfilModal(false)}
        usuario={usuario}
        onLogoutRequest={() => {
          setShowPerfilModal(false);
          setShowLogoutModal(true);
        }}
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
