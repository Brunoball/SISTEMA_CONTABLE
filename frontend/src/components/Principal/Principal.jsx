import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
} from "react";
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
  faGear,
} from "@fortawesome/free-solid-svg-icons";

import "./principal.css";
import ModalPerfil from "../Perfil/ModalPerfil";

/* =========================================================
   API
========================================================= */
const API_RELATIVE = "api.php";

function buildApiUrl(paramsObj) {
  const baseRaw = String(BASE_URL || "").trim();
  const base = baseRaw.replace(/\/+$/, "") + "/";
  const url = new URL(API_RELATIVE, base);

  const qs = new URLSearchParams();
  Object.entries(paramsObj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    qs.set(k, String(v));
  });

  url.search = qs.toString();
  return url.toString();
}

function isLocalApiBase() {
  try {
    const base = String(BASE_URL || "").toLowerCase().trim();
    return base.includes("localhost") || base.includes("127.0.0.1");
  } catch {
    return false;
  }
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function looksLikeUnauthorizedPayload(text, contentType = "") {
  const raw = String(text || "").trim();
  if (!raw) return false;

  let msg = raw;

  if (String(contentType || "").toLowerCase().includes("application/json")) {
    const data = safeJsonParse(raw);
    if (data && typeof data === "object") {
      msg = [data.mensaje, data.error, data.detalle, raw]
        .filter(Boolean)
        .join(" | ");
    }
  }

  const s = String(msg).toLowerCase();

  return (
    s.includes("sesión expirada") ||
    s.includes("sesion expirada") ||
    s.includes("sesión no autorizada") ||
    s.includes("sesion no autorizada") ||
    s.includes("session_key inválida") ||
    s.includes("session_key invalida") ||
    s.includes("falta x-session") ||
    s.includes("error en api: sesión expirada") ||
    s.includes("error en api: sesion expirada") ||
    s.includes("sesión inválida") ||
    s.includes("sesion invalida")
  );
}

async function apiFetch(paramsObj, options = {}) {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();

  const headers = new Headers(options.headers || {});
  if (sessionKey) headers.set("X-Session", sessionKey);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = buildApiUrl(paramsObj);

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    try {
      window.dispatchEvent(
        new CustomEvent("auth:unauthorized", { detail: { status: res.status } })
      );
    } catch {}
    return res;
  }

  try {
    const clone = res.clone();
    const text = await clone.text();
    const ct = clone.headers.get("content-type") || "";

    if (looksLikeUnauthorizedPayload(text, ct)) {
      try {
        window.dispatchEvent(
          new CustomEvent("auth:unauthorized", {
            detail: { status: 401, reason: "payload-session-expired" },
          })
        );
      } catch {}

      return new Response(
        JSON.stringify({ exito: false, mensaje: "Sesión expirada." }),
        {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }
      );
    }
  } catch {}

  return res;
}

/* =========================================================
   PREFETCH
========================================================= */
const ROUTE_PREFETCH = {
  "/panel/movimientos": () => import("../Movimientos/Movimientos"),
  "/panel/ventas": () => import("../Mov_Subsection/Ventas/Ventas"),
  "/panel/compras": () => import("../Mov_Subsection/Compra/Compras"),
  "/panel/recibos": () => import("../Mov_Subsection/Recibos/Recibos"),
  "/panel/OrdenesPago": () => import("../Mov_Subsection/OrdenesPago/OrdenesPago"),
  "/panel/flujo-de-caja": () => import("../Flujo_de_Caja/Flujo_Caja"),
  "/panel/cuentas-corrientes/clientes": () =>
    import("../Cuentas_Corrientes/Clientes/Clientes"),
  "/panel/cuentas-corrientes/proveedores": () =>
    import("../Cuentas_Corrientes/Proveedores/Proveedores"),
  "/panel/analisis-financiero": () =>
    import("../Analisis_Financiero/Analisis_Financiero"),
  "/panel/configuracion": () => import("../Configuracion/Configuracion"),
  "/panel/configuracion/tiendanube": () =>
    import("../Configuracion/ConfigTiendaNube"),
};

function prefetchRoute(ruta) {
  try {
    const fn = ROUTE_PREFETCH[ruta];
    if (fn) fn();
  } catch {}
}

/* =========================================================
   IDLE
========================================================= */
const LAST_ACTIVITY_KEY = "balto_last_activity_ts";
const IDLE_MS = 30 * 60 * 1000;

function setLastActivityNow() {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {}
}
function getLastActivityTs() {
  try {
    const v = sessionStorage.getItem(LAST_ACTIVITY_KEY);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/* =========================
   Cache listas
========================= */
const LISTAS_CACHE_KEY = "balto_listas_cache_v1";
const LISTAS_TTL_MS = 30 * 60 * 1000;

function getCachedListas() {
  const raw = sessionStorage.getItem(LISTAS_CACHE_KEY);
  const parsed = safeJsonParse(raw);
  if (!parsed?.ts || !parsed?.data) return null;
  if (Date.now() - Number(parsed.ts) > LISTAS_TTL_MS) return null;
  return parsed.data;
}
function setCachedListas(data) {
  try {
    sessionStorage.setItem(
      LISTAS_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch {}
}

async function prefetchGlobalListas(onUnauthorized) {
  try {
    const cached = getCachedListas();
    if (cached) return cached;

    const r = await apiFetch(
      { action: "global_obtener_listas" },
      { method: "GET" }
    );

    if (r.status === 401 || r.status === 403) {
      try {
        onUnauthorized?.();
      } catch {}
      return null;
    }

    const txt = await r.text();
    const data = safeJsonParse(txt);
    if (!r.ok || !data?.exito) return null;

    setCachedListas(data);
    return data;
  } catch {
    return null;
  }
}

/* =========================
   Modal cierre sesión
========================= */
const ConfirmLogoutModal = memo(function ConfirmLogoutModal({
  open,
  onClose,
  onConfirm,
  loading = false,
}) {
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
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
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
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            className="pp-btn pp-btn--danger"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Cerrando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
});

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
  if (s.includes("config")) return faGear;
  return faChartLine;
}
function normalizeTema(value) {
  const t = String(value ?? "claro").trim().toLowerCase();
  return t === "oscuro" ? "oscuro" : "claro";
}
function applyTheme(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  document.body.classList.toggle("dark", tema === "oscuro");
}

function getSessionKey() {
  return String(localStorage.getItem("session_key") || "").trim();
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
   Outlet memoizado
========================= */
const StableOutlet = memo(function StableOutlet() {
  return <Outlet />;
});

/* =========================
   COMPONENTE
========================= */
const Principal = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState(null);
  const [tema, setTema] = useState("claro");

  const [tenantLogoIconoSrc, setTenantLogoIconoSrc] = useState("");
  const [tenantLogoIconoLoaded, setTenantLogoIconoLoaded] = useState(false);

  const [tenantLogoPrincipalSrc, setTenantLogoPrincipalSrc] = useState("");
  const [tenantLogoPrincipalLoaded, setTenantLogoPrincipalLoaded] = useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPerfilModal, setShowPerfilModal] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openMovSub, setOpenMovSub] = useState(false);
  const [openCCSub, setOpenCCSub] = useState(false);

  const closeTimerRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeCCTimerRef = useRef(null);
  const openCCTimerRef = useRef(null);

  const closingRef = useRef(false);
  const [closingUI, setClosingUI] = useState(false);

  const idleTimerRef = useRef(null);

  const tenantLogoIconoObjectUrlRef = useRef("");
  const tenantLogoPrincipalObjectUrlRef = useRef("");

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

  const closeCCSoon = (ms = 220) => {
    if (closeCCTimerRef.current) clearTimeout(closeCCTimerRef.current);
    closeCCTimerRef.current = setTimeout(() => setOpenCCSub(false), ms);
  };
  const openCCSoon = (ms = 500) => {
    if (openCCTimerRef.current) clearTimeout(openCCTimerRef.current);
    openCCTimerRef.current = setTimeout(() => setOpenCCSub(true), ms);
  };
  const cancelCCClose = () => {
    if (closeCCTimerRef.current) clearTimeout(closeCCTimerRef.current);
    closeCCTimerRef.current = null;
  };
  const cancelCCOpen = () => {
    if (openCCTimerRef.current) clearTimeout(openCCTimerRef.current);
    openCCTimerRef.current = null;
  };

  const revokeTenantLogoIconoObjectUrl = useCallback(() => {
    try {
      if (tenantLogoIconoObjectUrlRef.current) {
        URL.revokeObjectURL(tenantLogoIconoObjectUrlRef.current);
        tenantLogoIconoObjectUrlRef.current = "";
      }
    } catch {}
  }, []);

  const revokeTenantLogoPrincipalObjectUrl = useCallback(() => {
    try {
      if (tenantLogoPrincipalObjectUrlRef.current) {
        URL.revokeObjectURL(tenantLogoPrincipalObjectUrlRef.current);
        tenantLogoPrincipalObjectUrlRef.current = "";
      }
    } catch {}
  }, []);

  const buildTenantLogoUrl = useCallback((tipo = "principal") => {
    return buildApiUrl({ action: "tenant_logo_ver", tipo });
  }, []);

  const loadSingleLogo = useCallback(
    async ({ tipo, logoDb, setSrc, setLoaded, objectUrlRef, revokeFn }) => {
      try {
        revokeFn();
        setSrc("");
        setLoaded(false);

        const sessionKey = getSessionKey();
        if (!sessionKey) return;

        if (isLocalApiBase()) {
          return;
        }

        if (!String(logoDb || "").trim()) {
          return;
        }

        const logoUrl = buildTenantLogoUrl(tipo);

        const res = await fetch(logoUrl, {
          method: "GET",
          headers: {
            "X-Session": sessionKey,
          },
          cache: "no-store",
        });

        if (res.status === 401 || res.status === 403) {
          try {
            window.dispatchEvent(
              new CustomEvent("auth:unauthorized", {
                detail: { status: res.status },
              })
            );
          } catch {}
          return;
        }

        if (res.status === 404 || res.status === 500) {
          return;
        }

        if (!res.ok) {
          return;
        }

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const txt = await res.clone().text().catch(() => "");
          if (looksLikeUnauthorizedPayload(txt, contentType)) {
            try {
              window.dispatchEvent(
                new CustomEvent("auth:unauthorized", {
                  detail: { status: 401, reason: "payload-session-expired" },
                })
              );
            } catch {}
          }
          return;
        }

        const blob = await res.blob();
        if (!blob || !blob.size) return;

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;

        setSrc(objectUrl);
        setLoaded(true);
      } catch {
        setSrc("");
        setLoaded(false);
      }
    },
    [buildTenantLogoUrl]
  );

  const loadTenantLogos = useCallback(async () => {
    const usuarioLocal = safeJsonParse(localStorage.getItem("usuario")) || {};
    const u = usuario || usuarioLocal || {};

    const logoPrincipalDb = String(u?.tenant_logo_url_db || "").trim();
    const logoIconoDb = String(u?.tenant_logo_icono_url_db || "").trim();

    await Promise.all([
      loadSingleLogo({
        tipo: "icono",
        logoDb: logoIconoDb,
        setSrc: setTenantLogoIconoSrc,
        setLoaded: setTenantLogoIconoLoaded,
        objectUrlRef: tenantLogoIconoObjectUrlRef,
        revokeFn: revokeTenantLogoIconoObjectUrl,
      }),
      loadSingleLogo({
        tipo: "principal",
        logoDb: logoPrincipalDb,
        setSrc: setTenantLogoPrincipalSrc,
        setLoaded: setTenantLogoPrincipalLoaded,
        objectUrlRef: tenantLogoPrincipalObjectUrlRef,
        revokeFn: revokeTenantLogoPrincipalObjectUrl,
      }),
    ]);
  }, [
    usuario,
    loadSingleLogo,
    revokeTenantLogoIconoObjectUrl,
    revokeTenantLogoPrincipalObjectUrl,
  ]);

  const doLogout = useCallback(
    async ({ silent = false } = {}) => {
      if (closingRef.current) return;
      closingRef.current = true;

      if (!silent) setClosingUI(true);

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      const sessionKey = getSessionKey();

      try {
        if (sessionKey) {
          const r = await apiFetch(
            { action: "logout" },
            { method: "POST", body: JSON.stringify({}) }
          );
          if (!r.ok && r.status !== 401 && r.status !== 403) {
            const txt = await r.text().catch(() => "");
            console.warn("Logout backend falló:", r.status, txt);
          }
        }
      } catch (e) {
        console.warn("Error llamando logout:", e);
      } finally {
        revokeTenantLogoIconoObjectUrl();
        revokeTenantLogoPrincipalObjectUrl();

        setTenantLogoIconoSrc("");
        setTenantLogoIconoLoaded(false);
        setTenantLogoPrincipalSrc("");
        setTenantLogoPrincipalLoaded(false);

        hardClientLogoutCleanup();
        setShowLogoutModal(false);
        setDrawerOpen(false);
        setOpenMovSub(false);
        setOpenCCSub(false);

        if (!silent) {
          setClosingUI(false);
        }

        closingRef.current = false;

        if (silent) {
          window.location.replace("/");
          return;
        }

        navigate("/", { replace: true });
      }
    },
    [
      navigate,
      revokeTenantLogoIconoObjectUrl,
      revokeTenantLogoPrincipalObjectUrl,
    ]
  );

  useEffect(() => {
    const onUnauthorized = () => doLogout({ silent: true });
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, [doLogout]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      try {
        if (response.status === 401 || response.status === 403) {
          try {
            window.dispatchEvent(
              new CustomEvent("auth:unauthorized", {
                detail: { status: response.status, reason: "http-status" },
              })
            );
          } catch {}
          return response;
        }

        const clone = response.clone();
        const ct = clone.headers.get("content-type") || "";

        if (ct.includes("application/json") || ct.includes("text/plain")) {
          const txt = await clone.text();
          if (looksLikeUnauthorizedPayload(txt, ct)) {
            try {
              window.dispatchEvent(
                new CustomEvent("auth:unauthorized", {
                  detail: { status: 401, reason: "body-message" },
                })
              );
            } catch {}

            return new Response(
              JSON.stringify({ exito: false, mensaje: "Sesión expirada." }),
              {
                status: 401,
                headers: { "Content-Type": "application/json; charset=utf-8" },
              }
            );
          }
        }
      } catch {}

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

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

    setLastActivityNow();

    try {
      const onUnauthorized = () => doLogout({ silent: true });
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => prefetchGlobalListas(onUnauthorized), {
          timeout: 1200,
        });
      } else {
        setTimeout(() => prefetchGlobalListas(onUnauthorized), 200);
      }
    } catch {}
  }, [doLogout, navigate]);

  useEffect(() => {
    loadTenantLogos();
  }, [usuario, loadTenantLogos]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeCCTimerRef.current) clearTimeout(closeCCTimerRef.current);
      if (openCCTimerRef.current) clearTimeout(openCCTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      revokeTenantLogoIconoObjectUrl();
      revokeTenantLogoPrincipalObjectUrl();
    };
  }, [revokeTenantLogoIconoObjectUrl, revokeTenantLogoPrincipalObjectUrl]);

  useEffect(() => {
    setDrawerOpen(false);
    setOpenMovSub(false);
    setOpenCCSub(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.classList.add("pp-lockScroll");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("pp-lockScroll");
    };
  }, [drawerOpen]);

  useEffect(() => {
    const resetIdle = () => {
      setLastActivityNow();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => doLogout({ silent: true }),
        IDLE_MS
      );
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((ev) =>
      window.addEventListener(ev, resetIdle, { passive: true })
    );

    resetIdle();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
    };
  }, [doLogout]);

  useEffect(() => {
    const checkExpiredOnWake = () => {
      const last = getLastActivityTs();
      if (!last) return;
      if (Date.now() - last >= IDLE_MS) doLogout({ silent: true });
    };

    const onFocus = () => checkExpiredOnWake();
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkExpiredOnWake();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [doLogout]);

  const planNivel = normalizePlanNivel(usuario?.plan_nivel ?? 1);
  const rolUsuario = normalizeRol(usuario?.rol);

  const navItems = useMemo(() => {
    const base = [
      {
        label: "Movimientos",
        ruta: "/panel/movimientos",
        children: [
          { label: "Ventas", ruta: "/panel/ventas" },
          { label: "Compras", ruta: "/panel/compras" },
          { label: "Recibo", ruta: "/panel/recibos" },
          { label: "Orden de Pago", ruta: "/panel/OrdenesPago" },
          { label: "Otros Ingresos", ruta: "/panel/Otrosingresos" },
          { label: "Otros Egresos", ruta: "/panel/Otrosegresos" },
        ],
      },
      { label: "Flujo de Caja", ruta: "/panel/flujo-de-caja" },
      {
        label: "Cuentas Corrientes",
        ruta: "/panel/cuentas-corrientes",
        children: [
          { label: "Clientes", ruta: "/panel/cuentas-corrientes/clientes" },
          { label: "Proveedores", ruta: "/panel/cuentas-corrientes/proveedores" },
        ],
      },
      { label: "Análisis Financiero", ruta: "/panel/analisis-financiero" },
    ].map((x) => ({
      key: slugify(x.label),
      label: x.label,
      icon: pickIcon(x.label),
      ruta: x.ruta || `/panel/${slugify(x.label)}`,
      children: x.children || null,
    }));

    const limit = planNivel === 1 ? 1 : planNivel === 2 ? 2 : 4;
    return base.slice(0, limit);
  }, [planNivel]);

  const activeKey = useMemo(() => {
    if (location.pathname.startsWith("/panel/movimientos")) return "movimientos";
    if (location.pathname.startsWith("/panel/cuentas-corrientes")) return "cuentas-corrientes";
    if (location.pathname.startsWith("/panel/configuracion")) return "configuracion";
    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));
    return found?.key || "";
  }, [location.pathname, navItems]);

  const activeLabel = useMemo(() => {
    if (location.pathname.startsWith("/panel/movimientos")) return "Movimientos";
    if (location.pathname.startsWith("/panel/cuentas-corrientes/clientes")) return "Cuentas Corrientes";
    if (location.pathname.startsWith("/panel/cuentas-corrientes/proveedores")) return "Cuentas Corrientes";
    if (location.pathname.startsWith("/panel/configuracion/tiendanube")) return "Configuración";
    if (location.pathname.startsWith("/panel/configuracion")) return "Configuración";
    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));
    return found?.label || "Dashboard";
  }, [location.pathname, navItems]);

  const handleNavigate = useCallback(
    (ruta) => {
      navigate(ruta);
      setDrawerOpen(false);
      setOpenMovSub(false);
      setOpenCCSub(false);
    },
    [navigate]
  );

  const handleLogoClick = useCallback(() => {
    navigate("/panel/dashboard");
    setDrawerOpen(false);
    setOpenMovSub(false);
    setOpenCCSub(false);
  }, [navigate]);

  const isNoHover = () => {
    try {
      return window.matchMedia && window.matchMedia("(hover: none)").matches;
    } catch {
      return false;
    }
  };

  const confirmarCierreSesion = useCallback(async () => {
    await doLogout({ silent: false });
  }, [doLogout]);

  const toggleTema = async () => {
    const prevTema = tema;
    const nuevo = tema === "oscuro" ? "claro" : "oscuro";

    setTema(nuevo);
    applyTheme(nuevo);

    try {
      const u = JSON.parse(localStorage.getItem("usuario")) || {};
      const u2 = { ...u, tema: nuevo };
      localStorage.setItem("usuario", JSON.stringify(u2));
      setUsuario(u2);
    } catch {}

    try {
      const r = await apiFetch(
        { action: "usuario_tema_actualizar" },
        { method: "POST", body: JSON.stringify({ tema: nuevo }) }
      );

      if (r.status === 401 || r.status === 403) {
        await doLogout({ silent: true });
        return;
      }

      const txt = await r.text();
      const data = safeJsonParse(txt);

      if (!r.ok || !data?.exito) {
        setTema(prevTema);
        applyTheme(prevTema);
        try {
          const u = JSON.parse(localStorage.getItem("usuario")) || {};
          const uPrev = { ...u, tema: prevTema };
          localStorage.setItem("usuario", JSON.stringify(uPrev));
          setUsuario(uPrev);
        } catch {}
      }
    } catch {
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

  const isMovDropdown = (itemKey) => itemKey === "movimientos";
  const isCCDropdown = (itemKey) => itemKey === "cuentas-corrientes";

  return (
    <div className="pp-shell">
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

          <button
            className="mov-topbar__logo"
            onClick={handleLogoClick}
            title="Ir al dashboard"
          >
            <img
              src={LogoBalto}
              alt="Logo de Balto"
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
            style={{
              overflow: "hidden",
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {tenantLogoIconoLoaded && tenantLogoIconoSrc ? (
              <img
                src={tenantLogoIconoSrc}
                alt="Logo icono de la empresa"
                style={{
                  width: "100%",
                  height: "100%",
                  display: "block",
                  objectFit: "cover",
                  borderRadius: "50%",
                }}
              />
            ) : (
              <FontAwesomeIcon icon={faUserCircle} />
            )}
          </button>
        </div>
      </header>

      <div
        className={`pp-drawerOverlay ${drawerOpen ? "is-open" : ""}`}
        onMouseDown={() => setDrawerOpen(false)}
      />

      <aside className={`pp-sidebar ${drawerOpen ? "is-drawerOpen" : ""}`}>
        <div className="pp-drawerHeader">
          <div
            className="pp-drawerBrand"
            onClick={handleLogoClick}
            role="button"
            tabIndex={0}
          >
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

            const isMov = isMovDropdown(item.key);
            const isCC = isCCDropdown(item.key);

            const isActive =
              activeKey === item.key ||
              (isMov && location.pathname.startsWith("/panel/movimientos")) ||
              (isCC && location.pathname.startsWith("/panel/cuentas-corrientes"));

            const isOpen = (isMov && openMovSub) || (isCC && openCCSub);

            const toggleSub = () => {
              if (isMov) {
                setOpenMovSub((prev) => !prev);
              }
              if (isCC) {
                setOpenCCSub((prev) => !prev);
              }
            };

            const openSoonLocal = (ms = 300) => {
              if (isMov) {
                cancelClose();
                openSoon(ms);
              }
              if (isCC) {
                cancelCCClose();
                openCCSoon(ms);
              }
            };

            const closeSoonLocal = (ms = 220) => {
              if (isMov) {
                cancelOpen();
                closeSoon(ms);
              }
              if (isCC) {
                cancelCCOpen();
                closeCCSoon(ms);
              }
            };

            const cancelAllTimersLocal = () => {
              if (isMov) {
                cancelClose();
                cancelOpen();
              }
              if (isCC) {
                cancelCCClose();
                cancelCCOpen();
              }
            };

            return (
              <div
                key={item.key}
                className={`pp-navGroup ${hasSub ? "has-sub" : ""} ${isOpen ? "is-open" : ""}`}
                onMouseEnter={() => {
                  prefetchRoute(item.ruta);
                  if (!isNoHover() && (isMov || isCC)) {
                    openSoonLocal(300);
                  }
                }}
                onMouseLeave={() => {
                  if (!isNoHover() && (isMov || isCC)) {
                    closeSoonLocal(220);
                  }
                }}
              >
                <button
                  type="button"
                  className={`pp-nav__item ${isActive ? "is-active" : ""}`}
                  onClick={() => {
                    if (isCC && hasSub) {
                      toggleSub();
                      return;
                    }

                    if (hasSub && isNoHover() && isMov) {
                      if (!openMovSub) {
                        setOpenMovSub(true);
                        return;
                      }
                      handleNavigate(item.ruta);
                      return;
                    }

                    handleNavigate(item.ruta);
                  }}
                  aria-expanded={
                    hasSub
                      ? isMov
                        ? openMovSub
                        : isCC
                        ? openCCSub
                        : undefined
                      : undefined
                  }
                  aria-haspopup={hasSub ? "menu" : undefined}
                >
                  <span className="pp-nav__icon">
                    <FontAwesomeIcon icon={item.icon} />
                  </span>
                  <span className="pp-nav__label">{item.label}</span>
                </button>

                {hasSub && (
                  <div
                    className="pp-navSub"
                    onMouseEnter={() => {
                      if (!isNoHover() && (isMov || isCC)) {
                        cancelAllTimersLocal();
                        if (isMov) setOpenMovSub(true);
                        if (isCC) setOpenCCSub(true);
                      }
                    }}
                    onMouseLeave={() => {
                      if (!isNoHover() && (isMov || isCC)) {
                        if (isMov) closeSoon(220);
                        if (isCC) closeCCSoon(220);
                      }
                    }}
                  >
                    {item.children.map((sub) => (
                      <button
                        key={sub.ruta + sub.label}
                        className={`pp-navSub__item ${
                          location.pathname.startsWith(sub.ruta) ? "is-active" : ""
                        }`}
                        onMouseEnter={() => prefetchRoute(sub.ruta)}
                        onClick={() => {
                          navigate(sub.ruta);
                          setOpenMovSub(false);
                          setOpenCCSub(false);
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
          {rolUsuario === "admin" && (
            <button
              className={`pp-logout ${
                location.pathname.startsWith("/panel/configuracion") ? "is-active" : ""
              }`}
              onClick={() => {
                handleNavigate("/panel/configuracion");
              }}
              style={{ marginBottom: 10 }}
            >
              <span className="pp-logout__icon">
                <FontAwesomeIcon icon={faGear} />
              </span>
              <span className="pp-logout__label">Configuración</span>
            </button>
          )}

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

      <main className="pp-content">
        <div className="pp-content__inner">
          <StableOutlet />
        </div>
      </main>

      <ModalPerfil
        open={showPerfilModal}
        onClose={() => setShowPerfilModal(false)}
        usuario={usuario}
        logoSrc={tenantLogoPrincipalLoaded && tenantLogoPrincipalSrc ? tenantLogoPrincipalSrc : ""}
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