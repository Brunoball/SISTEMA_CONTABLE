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
  faBoxesStacked,
  faMoneyCheckDollar,
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

function isSessionExpiredResponse(status, text = "", contentType = "") {
  if (Number(status) === 401) return true;
  if (Number(status) !== 403) return false;
  return looksLikeUnauthorizedPayload(text, contentType);
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

  try {
    const clone = res.clone();
    const text = await clone.text();
    const ct = clone.headers.get("content-type") || "";

    if (isSessionExpiredResponse(res.status, text, ct)) {
      try {
        window.dispatchEvent(
          new CustomEvent("auth:unauthorized", {
            detail: { status: res.status },
          })
        );
      } catch {}
      return res;
    }

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
  "/panel/documentos_comerciales": () =>
    import("../Mov_Subsection/Documentos_Comerciales/Presupuestos"),
  "/panel/presupuesto": () =>
    import("../Mov_Subsection/Documentos_Comerciales/Presupuestos"),
  "/panel/compras": () => import("../Mov_Subsection/Compra/Compras"),
  "/panel/recibos": () => import("../Mov_Subsection/Recibos/Recibos"),
  "/panel/OrdenesPago": () =>
    import("../Mov_Subsection/OrdenesPago/OrdenesPago"),
  "/panel/flujo-de-caja": () => import("../Flujo_de_Caja/Flujo_Caja"),
  "/panel/cuentas-corrientes/clientes": () =>
    import("../Cuentas_Corrientes/Clientes/Clientes"),
  "/panel/cuentas-corrientes/proveedores": () =>
    import("../Cuentas_Corrientes/Proveedores/Proveedores"),
  "/panel/stock": () => import("../Stock/Stock"),
  "/panel/analisis-financiero": () =>
    import("../Analisis_Financiero/Analisis_Financiero"),
  "/panel/configuracion": () => import("../Configuracion/Configuracion"),
  "/panel/configuracion/tiendanube": () =>
    import("../Configuracion/ConfiguracionTiendaNube/ConfigTiendaNube"),
  "/panel/cheques/cartera": () =>
    import("../Cheques/Cheques_Cartera/Cheques_Cartera"),
  "/panel/cheques/flujo": () =>
    import("../Cheques/Flujo_Cheques/Flujo_Cheques"),
  "/panel/cheques/echeqs-cartera": () =>
    import("../Cheques/Echeqs_Cartera/Echeqs_Cartera"),
  "/panel/cheques/flujo-echeqs": () =>
    import("../Cheques/Flujo_Echeqs/Flujo_Echeqs"),
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
const IDLE_MS = 2 * 60 * 60 * 1000;

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

    if (r.status === 401) {
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

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const stop = (e) => e.stopPropagation();

  return (
    <div className="pp-modal-overlay" role="dialog" aria-modal="true">
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
function normalizeRol(value, idRol = null) {
  const id = Number(idRol);
  const v = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    id === 1 ||
    ["1", "admin", "administrator", "administrador", "superadmin"].includes(v)
  ) {
    return "admin";
  }

  return "empleado_basico";
}

function normalizePlanNivel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function normalizePlanId(value, planName = "") {
  const n = Number(value);
  const name = String(planName || "").trim().toLowerCase();
  if (n === 3 || name.includes("demo")) return 3;
  return n === 2 ? 2 : 1;
}

const PLAN_BASICO_NAV_KEYS = new Set([
  "dashboard",
  "movimientos",
  "flujo-de-caja",
  "cuentas-corrientes",
  "stock",
  "configuracion",
]);

function planAllowsNavKey(planId, key) {
  const id = normalizePlanId(planId);

  // Plan 2 = PRO y Plan 3 = DEMO: todo visible en navegación.
  if (id === 2 || id === 3) return true;

  // Plan 1 = BÁSICO: solo módulos principales.
  return PLAN_BASICO_NAV_KEYS.has(String(key || ""));
}

function getModuleKeyByPath(pathname) {
  const path = String(pathname || "");

  if (path === "/panel" || path === "/panel/" || path.startsWith("/panel/dashboard")) {
    return "dashboard";
  }

  if (
    path.startsWith("/panel/movimientos") ||
    path.startsWith("/panel/ventas") ||
    path.startsWith("/panel/compras") ||
    path.startsWith("/panel/recibos") ||
    path.startsWith("/panel/OrdenesPago") ||
    path.startsWith("/panel/Otrosingresos") ||
    path.startsWith("/panel/Otrosegresos") ||
    path.startsWith("/panel/documentos_comerciales") ||
    path.startsWith("/panel/presupuesto")
  ) {
    return "movimientos";
  }

  if (path.startsWith("/panel/flujo-de-caja")) return "flujo-de-caja";
  if (path.startsWith("/panel/cuentas-corrientes")) return "cuentas-corrientes";
  if (path.startsWith("/panel/stock")) return "stock";
  if (path.startsWith("/panel/cheques")) return "cheques";
  if (path.startsWith("/panel/analisis-financiero")) return "analisis-financiero";
  if (path.startsWith("/panel/configuracion")) return "configuracion";

  return "dashboard";
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

  if (s.includes("cheques")) return faMoneyCheckDollar;
  if (s.includes("movimientos")) return faMoneyBillTrendUp;
  if (s.includes("flujo")) return faWallet;
  if (s.includes("cuentas")) return faUsers;
  if (s.includes("analisis")) return faChartLine;
  if (s.includes("config")) return faGear;
  if (s.includes("stock")) return faBoxesStacked;

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

function getLogoToneFromImageSrc(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve("dark");
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 56;

        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve("dark");
          return;
        }

        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);

        const { data } = ctx.getImageData(0, 0, size, size);

        let brightnessTotal = 0;
        let visiblePixels = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 45) continue;

          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;

          brightnessTotal += brightness;
          visiblePixels += 1;
        }

        if (!visiblePixels) {
          resolve("dark");
          return;
        }

        resolve(brightnessTotal / visiblePixels >= 155 ? "light" : "dark");
      } catch {
        resolve("dark");
      }
    };

    img.onerror = () => resolve("dark");
    img.src = src;
  });
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
  const [tenantLogoIconoTone, setTenantLogoIconoTone] = useState("dark");

  const [tenantLogoPrincipalSrc, setTenantLogoPrincipalSrc] = useState("");
  const [tenantLogoPrincipalLoaded, setTenantLogoPrincipalLoaded] =
    useState(false);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showPerfilModal, setShowPerfilModal] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [openMovSub, setOpenMovSub] = useState(false);
  const [openCCSub, setOpenCCSub] = useState(false);
  const [openChequesSub, setOpenChequesSub] = useState(false);
  const [openStockSub, setOpenStockSub] = useState(false);

  const closingRef = useRef(false);
  const [closingUI, setClosingUI] = useState(false);

  const idleTimerRef = useRef(null);

  const tenantLogoIconoObjectUrlRef = useRef("");
  const tenantLogoPrincipalObjectUrlRef = useRef("");

  const tenantLogoIconoDbRef = useRef("");
  const tenantLogoPrincipalDbRef = useRef("");

  const DEFAULT_SUBROUTES = useMemo(
    () => ({
      movimientos: "/panel/movimientos",
      "cuentas-corrientes": "/panel/cuentas-corrientes/clientes",
      cheques: "/panel/cheques/cartera",
      stock: "/panel/stock",
    }),
    []
  );

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
    const baseRaw = String(BASE_URL || "").trim();
    const base = baseRaw.replace(/\/+$/, "") + "/";
    const url = new URL("api.php", base);

    url.searchParams.set("action", "tenant_logo_ver");
    url.searchParams.set("tipo", tipo);

    return url.toString();
  }, []);

  const loadSingleLogo = useCallback(
    async ({ tipo, setSrc, setLoaded, objectUrlRef, revokeFn, dbRef }) => {
      try {
        const sessionKey = getSessionKey();
        if (!sessionKey) return;

        if (isLocalApiBase()) return;

        const logoUrl = buildTenantLogoUrl(tipo);

        const res = await fetch(logoUrl, {
          method: "GET",
          headers: {
            "X-Session": sessionKey,
          },
          cache: "no-store",
        });

        if (res.status === 401) {
          try {
            window.dispatchEvent(
              new CustomEvent("auth:unauthorized", {
                detail: { status: res.status },
              })
            );
          } catch {}
          return;
        }

        if (res.status === 204 || res.status === 404 || res.status === 500) {
          if (objectUrlRef.current) {
            revokeFn();
            setSrc("");
            setLoaded(false);
            dbRef.current = "";
          }
          return;
        }

        if (!res.ok) return;

        const contentType = String(
          res.headers.get("content-type") || ""
        ).toLowerCase();

        if (!contentType.startsWith("image/")) return;

        const blob = await res.blob();
        if (!blob || !blob.size) return;

        revokeFn();

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        dbRef.current = tipo;

        setSrc(objectUrl);
        setLoaded(true);
      } catch {
        // No limpiar en caso de error
      }
    },
    [buildTenantLogoUrl]
  );

  const loadTenantLogos = useCallback(async () => {
    await Promise.all([
      loadSingleLogo({
        tipo: "icono",
        setSrc: setTenantLogoIconoSrc,
        setLoaded: setTenantLogoIconoLoaded,
        objectUrlRef: tenantLogoIconoObjectUrlRef,
        revokeFn: revokeTenantLogoIconoObjectUrl,
        dbRef: tenantLogoIconoDbRef,
      }),
      loadSingleLogo({
        tipo: "principal",
        setSrc: setTenantLogoPrincipalSrc,
        setLoaded: setTenantLogoPrincipalLoaded,
        objectUrlRef: tenantLogoPrincipalObjectUrlRef,
        revokeFn: revokeTenantLogoPrincipalObjectUrl,
        dbRef: tenantLogoPrincipalDbRef,
      }),
    ]);
  }, [
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
        setTenantLogoIconoTone("dark");
        setTenantLogoPrincipalSrc("");
        setTenantLogoPrincipalLoaded(false);

        tenantLogoIconoDbRef.current = "";
        tenantLogoPrincipalDbRef.current = "";

        hardClientLogoutCleanup();

        setShowLogoutModal(false);
        setDrawerOpen(false);
        setOpenMovSub(false);
        setOpenCCSub(false);
        setOpenChequesSub(false);
        setOpenStockSub(false);

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

    return () => {
      window.removeEventListener("auth:unauthorized", onUnauthorized);
    };
  }, [doLogout]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      try {
        const clone = response.clone();
        const ct = clone.headers.get("content-type") || "";
        let txt = "";

        if (ct.includes("application/json") || ct.includes("text/plain")) {
          txt = await clone.text();
        }

        if (isSessionExpiredResponse(response.status, txt, ct)) {
          try {
            window.dispatchEvent(
              new CustomEvent("auth:unauthorized", {
                detail: { status: response.status, reason: "http-status" },
              })
            );
          } catch {}

          return response;
        }

        if (ct.includes("application/json") || ct.includes("text/plain")) {
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
        u.idPlan = normalizePlanId(
          u.idPlan ?? u.id_plan ?? u.plan_id ?? u.plan_nivel ?? 1,
          u.plan_nombre ?? u.plan ?? u.nombre_plan ?? ""
        );
        u.plan_nivel = normalizePlanNivel(u.plan_nivel ?? u.idPlan ?? 1);
        if (u.idPlan === 3) u.plan_nivel = 3;
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
  }, [loadTenantLogos]);

  useEffect(() => {
    let isMounted = true;

    if (!tenantLogoIconoLoaded || !tenantLogoIconoSrc) {
      setTenantLogoIconoTone("dark");
      return () => {
        isMounted = false;
      };
    }

    getLogoToneFromImageSrc(tenantLogoIconoSrc).then((tone) => {
      if (isMounted) setTenantLogoIconoTone(tone);
    });

    return () => {
      isMounted = false;
    };
  }, [tenantLogoIconoLoaded, tenantLogoIconoSrc]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      revokeTenantLogoIconoObjectUrl();
      revokeTenantLogoPrincipalObjectUrl();
    };
  }, [revokeTenantLogoIconoObjectUrl, revokeTenantLogoPrincipalObjectUrl]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
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

      if (Date.now() - last >= IDLE_MS) {
        doLogout({ silent: true });
      }
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

  const rolUsuario = normalizeRol(
    usuario?.rol ?? usuario?.tipo_rol,
    usuario?.id_rol
  );

  const planIdUsuario = normalizePlanId(
    usuario?.idPlan ?? usuario?.id_plan ?? usuario?.plan_id ?? usuario?.plan_nivel ?? 1,
    usuario?.plan_nombre ?? usuario?.plan ?? usuario?.nombre_plan ?? ""
  );

  const puedeVerConfiguracion = rolUsuario === "admin";

  useEffect(() => {
    if (!usuario) return;

    const moduloActual = getModuleKeyByPath(location.pathname);

    if (!planAllowsNavKey(planIdUsuario, moduloActual)) {
      navigate("/panel/dashboard", { replace: true });
    }
  }, [usuario, planIdUsuario, location.pathname, navigate]);

  useEffect(() => {
    if (!usuario) return;
    if (rolUsuario === "admin") return;

    const rutasPermitidas = [
      "/panel/dashboard",
      "/panel/movimientos",
      "/panel/ventas",
      "/panel/recibos",
      "/panel/flujo-de-caja",
    ];

    const permitido = rutasPermitidas.some(
      (ruta) =>
        location.pathname === ruta || location.pathname.startsWith(ruta + "/")
    );

    if (!permitido) {
      navigate("/panel/dashboard", { replace: true });
    }
  }, [usuario, rolUsuario, location.pathname, navigate]);

  const navItems = useMemo(() => {
    const base = [
      { label: "Dashboard", ruta: "/panel/dashboard" },
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
          { label: "Presupuestos", ruta: "/panel/presupuesto" },

        ],
      },
      { label: "Flujo de Caja", ruta: "/panel/flujo-de-caja" },
      {
        label: "Cuentas Corrientes",
        ruta: "/panel/cuentas-corrientes",
        children: [
          { label: "Clientes", ruta: "/panel/cuentas-corrientes/clientes" },
          {
            label: "Proveedores",
            ruta: "/panel/cuentas-corrientes/proveedores",
          },
        ],
      },
      {
        label: "Stock",
        ruta: "/panel/stock",
      },
      {
        label: "Cheques",
        ruta: "/panel/cheques",
        children: [
          { label: "Cheques en Cartera", ruta: "/panel/cheques/cartera" },
          { label: "Flujo de Cheques", ruta: "/panel/cheques/flujo" },
          {
            label: "Echeqs en Cartera",
            ruta: "/panel/cheques/echeqs-cartera",
          },
          { label: "Flujo de Echeqs", ruta: "/panel/cheques/flujo-echeqs" },
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

    const basePorPlan = base.filter((item) =>
      planAllowsNavKey(planIdUsuario, item.key)
    );

    if (rolUsuario !== "admin") {
      const dashboard = basePorPlan.find((x) => x.ruta === "/panel/dashboard");
      const movimientos = basePorPlan.find((x) => x.key === "movimientos");
      const flujoCaja = basePorPlan.find((x) => x.ruta === "/panel/flujo-de-caja");

      const itemsPermitidos = [];

      if (dashboard) {
        itemsPermitidos.push(dashboard);
      }

      if (movimientos) {
        itemsPermitidos.push({
          ...movimientos,
          children: (movimientos.children || []).filter((sub) =>
            ["/panel/ventas", "/panel/recibos"].includes(sub.ruta)
          ),
        });
      }

      if (flujoCaja) {
        itemsPermitidos.push(flujoCaja);
      }

      return itemsPermitidos;
    }

    return basePorPlan;
  }, [rolUsuario, planIdUsuario]);

  const activeKey = useMemo(() => {
    if (
      location.pathname.startsWith("/panel/movimientos") ||
      location.pathname.startsWith("/panel/ventas") ||
      location.pathname.startsWith("/panel/compras") ||
      location.pathname.startsWith("/panel/recibos") ||
      location.pathname.startsWith("/panel/OrdenesPago") ||
      location.pathname.startsWith("/panel/Otrosingresos") ||
      location.pathname.startsWith("/panel/Otrosegresos") ||
      location.pathname.startsWith("/panel/documentos_comerciales") ||
      location.pathname.startsWith("/panel/presupuesto")
    ) {
      return "movimientos";
    }

    if (location.pathname.startsWith("/panel/cuentas-corrientes")) {
      return "cuentas-corrientes";
    }

    if (location.pathname.startsWith("/panel/cheques")) return "cheques";
    if (location.pathname.startsWith("/panel/stock")) return "stock";
    if (location.pathname.startsWith("/panel/configuracion")) return "configuracion";

    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));

    return found?.key || "";
  }, [location.pathname, navItems]);

  const activeLabel = useMemo(() => {
    if (
      location.pathname.startsWith("/panel/movimientos") ||
      location.pathname.startsWith("/panel/ventas") ||
      location.pathname.startsWith("/panel/compras") ||
      location.pathname.startsWith("/panel/recibos") ||
      location.pathname.startsWith("/panel/OrdenesPago") ||
      location.pathname.startsWith("/panel/Otrosingresos") ||
      location.pathname.startsWith("/panel/Otrosegresos") ||
      location.pathname.startsWith("/panel/documentos_comerciales") ||

      location.pathname.startsWith("/panel/presupuesto")
    ) {
      return "Movimientos";
    }

    if (location.pathname.startsWith("/panel/cuentas-corrientes/clientes")) {
      return "Cuentas Corrientes";
    }

    if (location.pathname.startsWith("/panel/cuentas-corrientes/proveedores")) {
      return "Cuentas Corrientes";
    }

    if (location.pathname === "/panel/stock") return "Stock";
    if (location.pathname.startsWith("/panel/stock")) return "Stock";

    if (location.pathname.startsWith("/panel/cheques")) return "Cheques";

    if (location.pathname.startsWith("/panel/configuracion/tiendanube")) {
      return "Configuración";
    }

    if (location.pathname.startsWith("/panel/configuracion")) {
      return "Configuración";
    }

    const found = navItems.find((x) => location.pathname.startsWith(x.ruta));

    return found?.label || "Dashboard";
  }, [location.pathname, navItems]);

  const closeAllSubs = useCallback(() => {
    setOpenMovSub(false);
    setOpenCCSub(false);
    setOpenChequesSub(false);
    setOpenStockSub(false);
  }, []);

  const handleNavigate = useCallback(
    (ruta) => {
      closeAllSubs();
      navigate(ruta);
      setDrawerOpen(false);
    },
    [navigate, closeAllSubs]
  );

  const handleLogoClick = useCallback(() => {
    closeAllSubs();
    navigate("/panel/dashboard");
    setDrawerOpen(false);
  }, [navigate, closeAllSubs, rolUsuario]);

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

      if (r.status === 401) {
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
  const isChequesDropdown = (itemKey) => itemKey === "cheques";
  const isStockDropdown = (itemKey) => itemKey === "stock";

  const getModalLogoSrc = useCallback(() => {
    if (tenantLogoIconoLoaded && tenantLogoIconoSrc) {
      return tenantLogoIconoSrc;
    }

    return "";
  }, [tenantLogoIconoLoaded, tenantLogoIconoSrc]);

  const toggleSubmenu = useCallback(
    (itemKey, isCurrentlyOpen) => {
      if (isCurrentlyOpen) {
        closeAllSubs();
        return;
      }

      setOpenMovSub(itemKey === "movimientos");
      setOpenCCSub(itemKey === "cuentas-corrientes");
      setOpenChequesSub(itemKey === "cheques");
      setOpenStockSub(itemKey === "stock");
    },
    [closeAllSubs]
  );

  const handleNavItemClick = useCallback(
    (item, hasSub, isOpen) => {
      prefetchRoute(item.ruta);

      if (!hasSub) {
        handleNavigate(item.ruta);
        return;
      }

      /*
        En escritorio se mantiene el comportamiento de siempre:
        click abre/cierra y doble click entra a la ruta principal.

        En celular el doble click/tap no es confiable, por eso cuando el
        drawer está abierto el segundo toque sobre el grupo abierto navega
        a la ruta principal/default del módulo.
      */
      if (drawerOpen && isOpen) {
        handleNavigate(DEFAULT_SUBROUTES[item.key] || item.ruta);
        return;
      }

      toggleSubmenu(item.key, isOpen);
    },
    [
      DEFAULT_SUBROUTES,
      drawerOpen,
      handleNavigate,
      toggleSubmenu,
    ]
  );

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
            title={
              tema === "oscuro"
                ? "Cambiar a modo claro"
                : "Cambiar a modo oscuro"
            }
            aria-label={
              tema === "oscuro"
                ? "Cambiar a modo claro"
                : "Cambiar a modo oscuro"
            }
          >
            <FontAwesomeIcon icon={tema === "oscuro" ? faSun : faMoon} />
          </button>

          {puedeVerConfiguracion && (
            <button
              className="pp-themeBtn"
              onClick={() => handleNavigate("/panel/configuracion")}
              title="Configuración"
              aria-label="Ir a Configuración"
            >
              <FontAwesomeIcon icon={faGear} />
            </button>
          )}

          <button
            className={`mov-topbar__usericon ${
              tenantLogoIconoLoaded && tenantLogoIconoSrc
                ? `mov-topbar__usericon--logo mov-topbar__usericon--logo-${tenantLogoIconoTone}`
                : ""
            }`}
            onClick={() => setShowPerfilModal(true)}
            title="Perfil"
            aria-label="Abrir perfil"
          >
            {tenantLogoIconoLoaded && tenantLogoIconoSrc ? (
              <img
                src={tenantLogoIconoSrc}
                alt="Logo icono de la empresa"
                className="mov-topbar__userLogo"
              />
            ) : (
              <FontAwesomeIcon icon={faUserCircle} />
            )}
          </button>

          <button
            className="pp-topbarLogout"
            onClick={() => setShowLogoutModal(true)}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <FontAwesomeIcon icon={faSignOutAlt} />
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

        <div
          className="pp-brand panel_contable"
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
            const hasSub =
              Array.isArray(item.children) && item.children.length > 0;

            const isMov = isMovDropdown(item.key);
            const isCC = isCCDropdown(item.key);
            const isCheques = isChequesDropdown(item.key);
            const isStock = isStockDropdown(item.key);

            const isActive =
              activeKey === item.key ||
              (isMov &&
                (location.pathname.startsWith("/panel/movimientos") ||
                  location.pathname.startsWith("/panel/ventas") ||
                  location.pathname.startsWith("/panel/compras") ||
                  location.pathname.startsWith("/panel/recibos") ||
                  location.pathname.startsWith("/panel/OrdenesPago") ||
                  location.pathname.startsWith("/panel/Otrosingresos") ||
                  location.pathname.startsWith("/panel/Otrosegresos") ||
                  location.pathname.startsWith("/panel/documentos_comerciales") ||
                  location.pathname.startsWith("/panel/presupuesto"))) ||
              (isCC &&
                location.pathname.startsWith("/panel/cuentas-corrientes")) ||
              (isCheques && location.pathname.startsWith("/panel/cheques")) ||
              (isStock && location.pathname.startsWith("/panel/stock"));

            const isOpen =
              (isMov && openMovSub) ||
              (isCC && openCCSub) ||
              (isCheques && openChequesSub) ||
              (isStock && openStockSub);

            return (
              <div
                key={item.key}
                className={`pp-navGroup ${hasSub ? "has-sub" : ""} ${
                  isOpen ? "is-open" : ""
                }`}
                onMouseEnter={() => prefetchRoute(item.ruta)}
              >
<button
  type="button"
  className={`pp-nav__item ${isActive ? "is-active" : ""}`}
  onDoubleClick={() => {
    if (!hasSub) return;
    handleNavigate(DEFAULT_SUBROUTES[item.key] || item.ruta);
  }}
  onClick={() => handleNavItemClick(item, hasSub, isOpen)}
  aria-expanded={hasSub ? isOpen : undefined}
  aria-haspopup={hasSub ? "menu" : undefined}
>
                  <span className="pp-nav__icon">
                    <FontAwesomeIcon icon={item.icon} />
                  </span>

                  <span className="pp-nav__label">{item.label}</span>
                </button>

                {hasSub && (
                  <div className="pp-navSub">
                    {item.children.map((sub) => (
                      <button
                        key={sub.ruta + sub.label}
                        className={`pp-navSub__item ${
                          location.pathname === sub.ruta ||
                          location.pathname.startsWith(`${sub.ruta}/`)
                            ? "is-active"
                            : ""
                        }`}
                        onMouseEnter={() => prefetchRoute(sub.ruta)}
                        onClick={() => {
                          closeAllSubs();
                          navigate(sub.ruta);
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
        logoSrc={getModalLogoSrc()}
        rolUsuario={rolUsuario}
        onConfigRequest={() => {
          setShowPerfilModal(false);

          if (puedeVerConfiguracion) {
            handleNavigate("/panel/configuracion");
            return;
          }

          handleNavigate("/panel/dashboard");
        }}
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