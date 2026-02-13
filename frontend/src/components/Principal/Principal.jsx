// src/components/Principal/Principal.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import LogoBalto from "../../imagenes/Logo_Blanco_Principal.png";
import BASE_URL from "../../config/config";

import {
  faChartLine,
  faMoneyBillTrendUp,
  faWallet,
  faUsers,
  faSignOutAlt,
  faUserCircle,
  faMoon,
  faSun,
  faBars,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import ModalPerfil from "../Perfil/ModalPerfil";

/* =========================
   Modal cierre de sesión
========================= */
const ConfirmLogoutModal = ({ open, onClose, onConfirm, loading = false }) => {
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
        <p className="pp-modal__text">¿Estás seguro de que deseas cerrar la sesión?</p>

        <div className="pp-modal__actions">
          <button
            className="pp-btn pp-btn--ghost"
            onClick={onClose}
            ref={cancelBtnRef}
            disabled={loading}
          >
            Cancelar
          </button>
          <button className="pp-btn pp-btn--danger" onClick={onConfirm} disabled={loading}>
            {loading ? "Cerrando..." : "Confirmar"}
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

function normalizeTema(value) {
  const t = String(value ?? "claro").trim().toLowerCase();
  return t === "oscuro" ? "oscuro" : "claro";
}

/**
 * ✅ Tema: data-theme + body.dark (compatibilidad)
 */
function applyTheme(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  const isDark = tema === "oscuro";
  document.body.classList.toggle("dark", isDark);
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
   ✅ Session key helper
========================= */
function getSessionKey() {
  const k = localStorage.getItem("session_key") || "";
  return String(k || "").trim();
}

function hardClientLogoutCleanup() {
  try {
    sessionStorage.clear();
    localStorage.removeItem("token");
    localStorage.removeItem("session_key");
    localStorage.removeItem("usuario");
  } catch {}
}

/* =========================
   COMPONENTE
========================= */
const Principal = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState(null);
  const [tema, setTema] = useState("claro");

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPerfilModal, setShowPerfilModal] = useState(false);

  // ✅ Drawer mobile
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ✅ Submenú Movimientos
  const [openMovSub, setOpenMovSub] = useState(false);

  // ✅ timers para abrir/cerrar con delay (desktop hover)
  const closeTimerRef = useRef(null);
  const openTimerRef = useRef(null);

  // ✅ evita doble logout
  const closingRef = useRef(false);
  const [closingUI, setClosingUI] = useState(false);

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

  /* =========================
     ✅ Guard / carga usuario
  ========================= */
  useEffect(() => {
    const sk = getSessionKey();
    if (!sk) {
      hardClientLogoutCleanup();
      navigate("/", { replace: true });
      return;
    }

    try {
      const u = JSON.parse(localStorage.getItem("usuario"));
      if (u) {
        u.rol = normalizeRol(u.rol);
        u.plan_nivel = normalizePlanNivel(u.plan_nivel ?? 1);
        u.tema = normalizeTema(u.tema ?? "claro");
      }
      setUsuario(u || null);

      const t = normalizeTema(u?.tema ?? "claro");
      setTema(t);
      applyTheme(t);
    } catch {
      setUsuario(null);
      setTema("claro");
      applyTheme("claro");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // solo una vez

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
    };
  }, []);

  // ✅ si cambiás de ruta, cerrá el drawer (mobile)
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // ✅ ESC cierra drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  // ✅ bloquear scroll del body cuando el drawer está abierto (mobile)
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const planNivel = normalizePlanNivel(usuario?.plan_nivel ?? 1);

  const navItems = useMemo(() => {
    const base = [
      {
        label: "Movimientos",
        ruta: "/panel/Movimientos",
        children: [
          { label: "Ventas", ruta: "/panel/ventas" },
          { label: "Compras", ruta: "/panel/compras" },
          { label: "Recibo", ruta: "/panel/recibos" },
          { label: "Orden de Pago", ruta: "/panel/OrdenesPago" },
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
    setDrawerOpen(false);
  };

  const handleLogoClick = () => {
    navigate("/panel/dashboard");
    setDrawerOpen(false);
  };

  const isNoHover = () => {
    try {
      return window.matchMedia && window.matchMedia("(hover: none)").matches;
    } catch {
      return false;
    }
  };

  /* =========================
     ✅ CIERRE DE SESIÓN
  ========================= */
  const confirmarCierreSesion = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosingUI(true);

    const sessionKey = getSessionKey();

    try {
      if (sessionKey) {
        const r = await fetch(`${BASE_URL}/api.php?action=logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session": sessionKey,
          },
          body: JSON.stringify({}),
        });

        const txt = await r.text();
        try {
          const data = JSON.parse(txt);
          if (!r.ok || data?.exito === false) {
            console.warn("Logout backend falló:", r.status, data);
          }
        } catch {
          if (!r.ok) console.warn("Logout backend falló:", r.status, txt);
        }
      }
    } catch (e) {
      console.warn("Error llamando logout:", e);
    } finally {
      hardClientLogoutCleanup();
      setShowLogoutModal(false);
      setDrawerOpen(false);
      navigate("/", { replace: true });
      setClosingUI(false);
      closingRef.current = false;
    }
  }, [navigate]);

  /* =========================
     ✅ toggle tema -> MASTER (NUEVO)
     - ya no manda idUsuarioMaster (se resuelve por X-Session)
     - si falla, revierte UI + localStorage
  ========================= */
  const toggleTema = async () => {
    const prevTema = tema;
    const nuevo = tema === "oscuro" ? "claro" : "oscuro";

    // UI inmediata (optimista)
    setTema(nuevo);
    applyTheme(nuevo);

    // actualizar usuario en localStorage
    let u2 = null;
    try {
      const u = JSON.parse(localStorage.getItem("usuario")) || {};
      u2 = { ...u, tema: nuevo };
      localStorage.setItem("usuario", JSON.stringify(u2));
      setUsuario(u2);
    } catch (e) {
      console.error("Error actualizando localStorage usuario:", e);
    }

    // pegar a backend (solo X-Session + tema)
    try {
      const sessionKey = getSessionKey();
      const headers = { "Content-Type": "application/json" };
      if (sessionKey) headers["X-Session"] = sessionKey;

      const r = await fetch(`${BASE_URL}/api.php?action=usuario_tema_actualizar`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tema: nuevo }), // ✅ NUEVO: sin id
      });

      const txt = await r.text();
      let data = null;
      try {
        data = JSON.parse(txt);
      } catch {}

      if (!r.ok || !data?.exito) {
        console.error("Falló usuario_tema_actualizar:", r.status, txt);

        // 🔁 revertir UI + localStorage
        setTema(prevTema);
        applyTheme(prevTema);
        try {
          const u = JSON.parse(localStorage.getItem("usuario")) || {};
          const uPrev = { ...u, tema: prevTema };
          localStorage.setItem("usuario", JSON.stringify(uPrev));
          setUsuario(uPrev);
        } catch {}
        return;
      }

      console.log("✅ Tema guardado en DB (MASTER):", data);
    } catch (e) {
      console.error("Error llamando usuario_tema_actualizar:", e);

      // 🔁 revertir UI + localStorage
      setTema(prevTema);
      applyTheme(prevTema);
      try {
        const u = JSON.parse(localStorage.getItem("usuario")) || {};
        const uPrev = { ...u, tema: prevTema };
        localStorage.setItem("usuario", JSON.stringify(uPrev));
        setUsuario(uPrev);
      } catch {}
    }
  };

  return (
    <div className="pp-shell">
      {/* ================= HEADER ================= */}
      <header className="mov-topbar">
        <div className="mov-topbar__left">
          <button
            className="pp-burger"
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            title="Menú"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>

          <button className="mov-topbar__logo" onClick={handleLogoClick} title="Ir al dashboard">
            <img src={LogoBalto} alt="Logo Balto" className="mov-topbar__logoImg" />
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
            className="pp-themeBtn"
            onClick={toggleTema}
            title={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            <FontAwesomeIcon icon={tema === "oscuro" ? faSun : faMoon} />
          </button>

          <button
            className="mov-topbar__usericon"
            onClick={() => setShowPerfilModal(true)}
            title="Perfil"
          >
            <FontAwesomeIcon icon={faUserCircle} />
          </button>
        </div>
      </header>

      {/* ✅ OVERLAY drawer */}
      <div
        className={`pp-drawerOverlay ${drawerOpen ? "is-open" : ""}`}
        onMouseDown={() => setDrawerOpen(false)}
      />

      {/* ================= SIDEBAR ================= */}
      <aside className={`pp-sidebar ${drawerOpen ? "is-drawerOpen" : ""}`}>
        <div className="pp-drawerHeader">
          <div className="pp-drawerBrand" onClick={handleLogoClick} role="button" tabIndex={0}>
            <div className="pp-drawerBrand__mark">
              <FontAwesomeIcon icon={faChartLine} />
            </div>
            <div className="pp-drawerBrand__txt">
              <div className="pp-drawerBrand__t">Contable</div>
              <div className="pp-drawerBrand__s">Panel</div>
            </div>
          </div>

          <button
            className="pp-drawerClose"
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
            title="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="pp-brand" onClick={handleLogoClick} role="button" tabIndex={0}>
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
              activeKey === item.key || (isMov && location.pathname.startsWith("/panel/movimientos"));

            const isOpen = isMov && openMovSub;

            return (
              <div
                key={item.key}
                className={`pp-navGroup ${hasSub ? "has-sub" : ""} ${isOpen ? "is-open" : ""}`}
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
                          setOpenMovSub(false);
                          setDrawerOpen(false);
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
          <button
            className="pp-logout"
            onClick={() => {
              setDrawerOpen(false);
              setShowLogoutModal(true);
            }}
          >
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
        loading={closingUI}
      />
    </div>
  );
};

export default Principal;
