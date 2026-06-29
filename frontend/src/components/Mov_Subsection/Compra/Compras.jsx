import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../../config/config.jsx";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/roots.css";
import "../../Global/Global_css/Global_oscuro.css";
import Toast from "../../Global/Toast.jsx";

import Calendario from "../../Global/Calendario/Calendario.jsx";
import "../../Global/Calendario/calendario.css";

import ModalNuevaCompra from "./modales/ModalNuevaCompra.jsx";
import ModalEditarCompra from "./modales/ModalEditarCompra.jsx";
import { ModalDetalleMovimientoCompra } from "../../Global/Modales/ModalDetalleMovimiento.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import ModalEliminarMovimientos from "../../Global/Modales/ModalEliminar.jsx";

import BotonExportar from "../../Global/Boton_Exportar/BotonExportar.jsx";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faTrashCan,
  faPlus,
  faMagnifyingGlass,
  faCalendarDays,
  faFileExcel,
  faEye,
  faChevronDown,
  faArrowRightLong,
  faTimes,
  faBoxOpen,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";
import { useListas } from "../../../context/ListasContext.jsx";
import { useDateRange } from "../../../context/DateRangeContext.jsx";
import { readMovPerfCache, writeMovPerfCache, clearMovPerfCache } from "../_shared/performanceCache.js";
import { getDetalleMovimiento } from "../_shared/detalleMovimiento.js";

/* =========================
   PERF: paginado
========================= */
const PAGE_SIZE = 100;
const SKELETON_ROWS = 10;
const PAGE_LIMIT_API = PAGE_SIZE + 1;

/* =========================
   Auth Helper MEJORADO
========================= */
function getAuthInfo() {
  const token = (localStorage.getItem("token") || "").trim();
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    localStorage.getItem("x_session") ||
    ""
  ).trim();

  let idUsuario = 0;
  let idUsuarioMaster = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    // Prioridad: idUsuarioMaster > idUsuario > id_usuario > id > user_id
    const candMaster = u?.idUsuarioMaster ?? 0;
    const candNormal = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    
    if (Number.isFinite(Number(candMaster)) && Number(candMaster) > 0) {
      idUsuarioMaster = Number(candMaster);
      idUsuario = Number(candMaster); // Para compatibilidad, usamos el mismo
    } else if (Number.isFinite(Number(candNormal)) && Number(candNormal) > 0) {
      idUsuario = Number(candNormal);
      idUsuarioMaster = Number(candNormal);
    }
  } catch {}

  return { token, sessionKey, idUsuario, idUsuarioMaster };
}

/* =========================
   Helpers generales
========================= */
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}
function productosLabel(row) {
  return getDetalleMovimiento(row);
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return fallback;
}

function getRowId(r) {
  return (
    r?.id_compra ??
    r?.idCompra ??
    r?.id_movimiento ??
    r?.idMovimiento ??
    r?.id ??
    r?.ID ??
    null
  );
}

function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";

  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const yyyy = m1[1];
    const mm = String(Number(m1[2])).padStart(2, "0");
    const dd = String(Number(m1[3])).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }

  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const dd = String(Number(m2[1])).padStart(2, "0");
    const mm = String(Number(m2[2])).padStart(2, "0");
    const yyyy = m2[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}

/* =========================
   Fecha helpers para rango
========================= */
function startOfDay(d) {
  if (!d) return null;
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function parseRowFecha(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return startOfDay(new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3])));

  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return startOfDay(new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1])));

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : startOfDay(d);
}

function dateToAPI(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateUI(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}/${d.getFullYear()}`;
}

function rowInDateRange(row, from, to) {
  if (!from && !to) return true;
  const fecha = parseRowFecha(row?.fecha);
  if (!fecha) return true;
  if (from && fecha < startOfDay(from)) return false;
  if (to) {
    const toEnd = startOfDay(to);
    toEnd.setHours(23, 59, 59, 999);
    if (fecha > toEnd) return false;
  }
  return true;
}

/* =========================
   Helpers de compras
========================= */
function getCompraMediosDetalle(r) {
  if (Array.isArray(r?.medios_pago_detalle)) return r.medios_pago_detalle;

  if (typeof r?.medios_pago_detalle === "string") {
    try {
      const parsed = JSON.parse(r.medios_pago_detalle);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getCompraCantidadMedios(r) {
  const n = Number(r?.cantidad_medios_pago);
  if (Number.isFinite(n) && n > 0) return n;
  return getCompraMediosDetalle(r).length;
}

function hasCompraDetalleMedios(r) {
  return getCompraCantidadMedios(r) > 0;
}

// NUEVA VERSIÓN SIMPLIFICADA PARA PAGO (CONTADO / CUENTA CORRIENTE)
function getCompraPagoLabel(r) {
  const pago = String(r?.pago_nombre ?? r?.cuenta_corriente ?? "").trim();
  return pago || "CONTADO";
}

// NUEVA FUNCIÓN PARA MEDIO DE PAGO (CHEQUE, TRANSFERENCIA, EFECTIVO, etc.)
function getCompraMedioPagoLabel(r) {
  const explicit = String(r?.medio_pago_nombre ?? r?.medio_pago ?? "").trim();
  if (explicit) return explicit;

  const detalle = getCompraMediosDetalle(r);
  if (detalle.length === 1) {
    return String(detalle[0]?.medio_pago_nombre ?? "").trim() || "-";
  }

  if (detalle.length > 1) {
    const principal = String(detalle[0]?.medio_pago_nombre ?? "").trim() || "-";
    return `${principal} +${detalle.length - 1}`;
  }

  return "-";
}

function extractIdComprobanteFromUrlLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/[?&]id_comprobante=(\d+)/i);
  if (m1) {
    const n = Number(m1[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const m2 = s.match(/[?&]id=(\d+)/i);
  if (m2) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

function getComprobanteId(r) {
  const directCandidates = [
    r?.id_comprobante,
    r?.comprobante_id,
    r?.factura_id_comprobante,
    r?.idFacturaComprobante,
  ];

  for (const cand of directCandidates) {
    const n = Number(cand);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const urlCandidates = [
    r?.factura_url,
    r?.factura,
    r?.comprobante_url,
    r?.comprobante,
    r?.archivo_url,
    r?.url_factura,
    r?.path_factura,
    r?.factura_path,
  ];

  for (const u of urlCandidates) {
    const n = extractIdComprobanteFromUrlLike(u);
    if (n) return n;
  }

  return null;
}

function getComprobanteMime(r) {
  return String(
    r?.factura_comprobante_tipo ??
      r?.archivo_mime ??
      r?.comprobante_mime ??
      r?.mime ??
      ""
  ).trim();
}

function getComprobanteUrl(r) {
  const idComp = getComprobanteId(r);
  if (idComp) {
    const sp = new URLSearchParams();
    sp.set("action", "compras_comprobantes_descargar");
    sp.set("id_comprobante", String(idComp));
    return `${BASE_URL}/api.php?${sp.toString()}`;
  }

  const candidates = [
    r?.factura_url,
    r?.factura,
    r?.comprobante_url,
    r?.comprobante,
    r?.archivo_url,
    r?.url_factura,
    r?.path_factura,
    r?.factura_path,
  ];

  const raw = candidates.find((x) => typeof x === "string" && x.trim() !== "");
  if (!raw) return "";

  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s;

  const base = String(BASE_URL || "").replace(/\/$/, "");
  const rel = s.replace(/^\//, "");
  return `${base}/${rel}`;
}

function slugifySheetName(name) {
  const s = String(name || "Compras")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Compras").slice(0, 31);
}

/* =========================
   Export helpers
========================= */
function buildExportRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    FECHA: safeText(formatFechaDMY(pick(r, ["fecha"], ""))),
    DESCRIPCION: productosLabel(r),
    PROVEEDOR: safeText(
      pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], "")
    ),
    TOTAL: numOrZero(
      pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0)
    ),
  }));
}

function escapeCSV(value) {
  const s = String(value ?? "");
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function withSessionKey(url) {
  const base = String(url ?? "").trim();
  if (!base) return "";

  try {
    const { sessionKey, token } = getAuthInfo();
    const u = new URL(base, window.location.origin);

    const isSameOrigin = u.origin === window.location.origin;

    const hasAwsSignature =
      u.searchParams.has("X-Amz-Signature") ||
      u.searchParams.has("X-Amz-Algorithm") ||
      u.searchParams.has("X-Amz-Credential");

    if (!isSameOrigin || hasAwsSignature) {
      return u.toString();
    }

    if (sessionKey && !u.searchParams.has("session_key")) {
      u.searchParams.set("session_key", sessionKey);
    }

    if (token && !u.searchParams.has("token")) {
      u.searchParams.set("token", token);
    }

    return u.toString();
  } catch {
    return base;
  }
}

function ensureResourceHint(url, rel = "prefetch", as = "document") {
  const href = String(url ?? "").trim();
  if (!href) return;

  const key = `hint:${rel}:${as}:${href}`;
  const selectorKey =
    typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');

  if (document.head.querySelector(`link[data-key="${selectorKey}"]`)) return;

  const link = document.createElement("link");
  link.rel = rel;
  if (as) link.as = as;
  link.href = href;
  link.setAttribute("data-key", key);
  document.head.appendChild(link);
}

function prewarmComprobanteUrl(url, mime = "") {
  const finalUrl = withSessionKey(url);
  if (!finalUrl) return;

  const mm = String(mime ?? "").toLowerCase();
  const ll = finalUrl.toLowerCase();
  const isPdf =
    mm.includes("pdf") ||
    ll.includes(".pdf") ||
    ll.includes("compras_comprobantes_descargar");

  if (isPdf) {
    ensureResourceHint(finalUrl, "prefetch", "document");
  } else {
    ensureResourceHint(finalUrl, "prefetch", "image");
  }
}

/* =========================
   COMPONENTE
========================= */
export default function Compras() {
  const API = `${BASE_URL}/api.php`;

  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

  const { dateRange, setDateRange } = useDateRange();

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [showCalendario, setShowCalendario] = useState(false);
  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  const [openNueva, setOpenNueva] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [openVerComp, setOpenVerComp] = useState(false);
  const [openMediosPago, setOpenMediosPago] = useState(false);
  const [compUrl, setCompUrl] = useState("");
  const [compMime, setCompMime] = useState("");

  const [selectedRow, setSelectedRow] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const cacheRef = useRef(new Map());
  const reqIdRef = useRef(0);
  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);
  const comprobanteUrlCacheRef = useRef(new Map());
  const signedUrlCacheRef = useRef(new Map());

  const skelTimerRef = useRef(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [ready, setReady] = useState(false);

  const beginSkeleton = useCallback(() => {
    if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    setShowSkeleton(false);
    skelTimerRef.current = setTimeout(() => setShowSkeleton(true), 120);
  }, []);

  const endSkeleton = useCallback(() => {
    if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    setShowSkeleton(false);
  }, []);

  useEffect(() => {
    return () => {
      if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  /* =========================
     Headers con autenticación mejorada
  ========================= */
  const buildHeaders = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, []);

  const buildHeadersGET = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = {};
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h["Authorization"] = `Bearer ${token}`;
    return h;
  }, []);

  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacia del servidor.");
    try {
      return JSON.parse(text);
    } catch {
      const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
      throw new Error(`Respuesta invalida (no es JSON). HTTP ${res.status}\n${preview}`);
    }
  }, []);

  const apiGet = useCallback(
    async (url) => {
      const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
      return await parseJsonOrThrow(res);
    },
    [buildHeadersGET, parseJsonOrThrow]
  );

  const apiPostJson = useCallback(
    async (url, payload) => {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload ?? {}),
      });
      return await parseJsonOrThrow(res);
    },
    [buildHeaders, parseJsonOrThrow]
  );

  const refreshPeriodos = useCallback(async () => {
    try {
      await refreshLists();
    } catch {}
  }, [refreshLists]);

  /* =========================
     OBTENER URL FIRMADA
  ========================= */
  const getComprobanteSignedUrl = useCallback(
    async (idComprobante) => {
      const id = Number(idComprobante || 0);
      if (!id) return "";

      const cacheKey = String(id);
      const cached = signedUrlCacheRef.current.get(cacheKey);

      if (cached && cached.url && cached.expiresAt > Date.now()) {
        return cached.url;
      }

      const sp = new URLSearchParams();
      sp.set("action", "compras_comprobantes_descargar");
      sp.set("id_comprobante", String(id));

      const data = await apiGet(`${API}?${sp.toString()}`);

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo obtener el comprobante.");
      }

      const finalUrl = String(data?.url || "").trim();
      if (!finalUrl) {
        throw new Error("El backend no devolvió la URL del comprobante.");
      }

      signedUrlCacheRef.current.set(cacheKey, {
        url: finalUrl,
        expiresAt: Date.now() + 19 * 60 * 1000,
      });

      return finalUrl;
    },
    [API, apiGet]
  );

  /* =========================
     Editar compra con idUsuarioMaster
  ========================= */
  const editarCompraEnBackend = useCallback(
    async (payloadFinal) => {
      const { idUsuario, idUsuarioMaster } = getAuthInfo();
      const id = payloadFinal?.id_movimiento ?? payloadFinal?.id ?? getRowId(selectedRow);
      if (!id) throw new Error("No encuentro id_movimiento para editar.");

      const body = { 
        ...payloadFinal, 
        id_movimiento: Number(id), 
        idUsuario,
        idUsuarioMaster: idUsuarioMaster || idUsuario
      };
      
      const candidates = ["compras_editar", "compras_actualizar", "movimientos_editar"];

      let lastErr = null;
      for (const action of candidates) {
        try {
          const sp = new URLSearchParams();
          sp.set("action", action);
          sp.set("id_movimiento", String(id));
          const data = await apiPostJson(`${API}?${sp.toString()}`, body);
          if (data?.exito) return data;
          lastErr = new Error(data?.mensaje || `No se pudo editar (action=${action}).`);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error("No se pudo editar la compra.");
    },
    [API, apiPostJson, selectedRow]
  );

  /* =========================
     Carga de filas (GET) 
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const range = opts.dateRange ?? dateRange;
      const fromDate = opts.from !== undefined ? opts.from : range?.from;
      const toDate = opts.to !== undefined ? opts.to : range?.to;

      const qLocal = typeof opts.q === "string" ? opts.q : q;
      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

      const fromAPI = dateToAPI(fromDate);
      const toAPI = dateToAPI(toDate);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${fromAPI}|${toAPI}|${qKey}`;

      if (!append && offset === 0 && !cacheRef.current.has(cacheKey)) {
        const persisted = readMovPerfCache("compras:listar:cc-medios-v2", cacheKey);
        if (persisted?.rows) cacheRef.current.set(cacheKey, persisted);
      }

      const myReqId = ++reqIdRef.current;

      if (!fromDate && !toDate) {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setLoadingMore(false);
        setError("");
        setReady(true);
        endSkeleton();
        return { hasMore: false, nextOffset: null, received: 0, appended: 0, pageIds: [] };
      }

      if (!append && offset === 0) setReady(false);

      if (!append) {
        beginSkeleton();
        setLoadingRows(true);
      } else {
        setLoadingMore(true);
      }

      setError("");

      try {
        if (!append && offset === 0 && cacheRef.current.has(cacheKey)) {
          const cached = cacheRef.current.get(cacheKey);
          setRows(cached?.rows || []);
          setHasMore(!!cached?.hasMore);
          setNextOffset(cached?.nextOffset ?? null);
          setLoadingRows(false);
          setReady(true);
          endSkeleton();
          return {
            hasMore: !!cached?.hasMore,
            nextOffset: cached?.nextOffset ?? null,
            received: Array.isArray(cached?.rows) ? cached.rows.length : 0,
            appended: 0,
            pageIds: (Array.isArray(cached?.rows) ? cached.rows : [])
              .map((x) => getRowId(x))
              .filter(Boolean)
              .map(String),
          };
        }

        const sp = new URLSearchParams();
        sp.set("action", "compras_listar");
        if (fromAPI) sp.set("fecha_desde", fromAPI);
        if (toAPI) sp.set("fecha_hasta", toAPI);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PAGE_LIMIT_API));
        sp.set("offset", String(offset));

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar compras.");

        if (myReqId !== reqIdRef.current) {
          if (append) setLoadingMore(false);
          else setLoadingRows(false);
          endSkeleton();
          return null;
        }

        const raw = Array.isArray(data.compras) ? data.compras : [];

        const backendHasMore = data.has_more !== undefined ? !!data.has_more : null;
        const backendNextOffset =
          data.next_offset !== undefined && data.next_offset !== null
            ? Number(data.next_offset)
            : null;

        const page = raw.slice(0, PAGE_SIZE);

        let newHasMore = false;
        let newNextOffset = null;

        if (backendHasMore !== null) {
          newHasMore = backendHasMore;
          newNextOffset = backendHasMore ? backendNextOffset : null;
          if (newHasMore && (newNextOffset === null || Number.isNaN(newNextOffset))) {
            newNextOffset = offset + page.length;
          }
        } else {
          newHasMore = raw.length > PAGE_SIZE;
          newNextOffset = newHasMore ? offset + PAGE_SIZE : null;
        }

        const pageIds = page.map((x) => getRowId(x)).filter(Boolean).map(String);
        let appendedCount = 0;

        if (append) {
          setRows((prev) => {
            const prevArr = Array.isArray(prev) ? prev : [];
            const seen = new Set(prevArr.map((x) => String(getRowId(x))));
            const add = page.filter((x) => {
              const id = getRowId(x);
              if (id === null || id === undefined) return true;
              return !seen.has(String(id));
            });
            appendedCount = add.length;
            return [...prevArr, ...add];
          });
        } else {
          setRows(page);
          const cachePayload = {
            rows: page,
            hasMore: newHasMore,
            nextOffset: newNextOffset,
          };
          cacheRef.current.set(cacheKey, cachePayload);
          writeMovPerfCache("compras:listar:cc-medios-v2", cacheKey, cachePayload);
        }

        setHasMore(newHasMore);
        setNextOffset(newNextOffset);

        if (append) {
          setLoadingMore(false);
        } else {
          setLoadingRows(false);
          setReady(true);
        }

        endSkeleton();
        return {
          hasMore: newHasMore,
          nextOffset: newNextOffset,
          received: page.length,
          appended: appendedCount,
          pageIds,
        };
      } catch (e) {
        if (myReqId !== reqIdRef.current) {
          if (append) setLoadingMore(false);
          else setLoadingRows(false);
          endSkeleton();
          return null;
        }
        setError(e?.message || "Error cargando compras.");
        if (append) {
          setLoadingMore(false);
        } else {
          setLoadingRows(false);
          setReady(true);
        }
        endSkeleton();
        return null;
      }
    },
    [API, apiGet, dateRange, q, beginSkeleton, endSkeleton]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureListsLoaded({ force: false, background: true });
      } catch {}

      if (!alive) return;

      if (!dateRange?.from || !dateRange?.to) {
        const now = new Date();
        const init = {
          from: new Date(now.getFullYear(), now.getMonth(), 1),
          to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        };
        setDateRange(init);
        await loadRows({ dateRange: init, q: "", offset: 0, append: false });
        return;
      }

      await loadRows({ dateRange, q: "", offset: 0, append: false });
    })();

    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadRows({ dateRange, q, offset: 0, append: false });
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, dateRange]); // eslint-disable-line

  const handleDateRangeChange = useCallback(
    async (newRange) => {
      if (!newRange?.from && !newRange?.to) return;
      setDateRange(newRange);
      cacheRef.current.clear();
      clearMovPerfCache("compras:listar:cc-medios-v2");
      signedUrlCacheRef.current.clear();
      skipSearchRef.current = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      await loadRows({ dateRange: newRange, q, offset: 0, append: false });
    },
    [setDateRange, loadRows, q]
  );

  const filteredRows = useMemo(() => {
    return (Array.isArray(rows) ? rows : []).filter((r) =>
      rowInDateRange(r, dateRange?.from, dateRange?.to)
    );
  }, [rows, dateRange]);

  const dateRangeLabel = useMemo(() => {
    const { from, to } = dateRange;

    if (!from && !to) return "Seleccionar fechas";

    if (from && to) {
      if (
        from.getFullYear() === to.getFullYear() &&
        from.getMonth() === to.getMonth() &&
        from.getDate() === to.getDate()
      ) {
        return formatDateUI(from);
      }

      return (
        <>
          <span>{formatDateUI(from)}</span>
          <span className="mov-rangeArrow">
            <FontAwesomeIcon icon={faArrowRightLong} />
          </span>
          <span>{formatDateUI(to)}</span>
        </>
      );
    }

    if (from) return `Desde ${formatDateUI(from)}`;
    return `Hasta ${formatDateUI(to)}`;
  }, [dateRange]);

  const exportBaseName = useMemo(() => {
    const { from, to } = dateRange;
    if (from && to) return `compras_${dateToAPI(from)}_${dateToAPI(to)}`;
    if (from) return `compras_desde_${dateToAPI(from)}`;
    return "compras_todos";
  }, [dateRange]);

  const getExportData = useCallback(() => {
    const dataToExport = buildExportRows(filteredRows);
    if (!dataToExport.length) throw new Error("No hay datos para exportar.");
    return dataToExport;
  }, [filteredRows]);

  const exportToExcel = useCallback(() => {
    const dataToExport = getExportData();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);

    const headers = Object.keys(dataToExport[0] || {});
    const totalColIndex = headers.findIndex((h) => h === "TOTAL");
    if (totalColIndex >= 0 && ws["!ref"]) {
      const colLetter = XLSX.utils.encode_col(totalColIndex);
      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cell = ws[`${colLetter}${r + 1}`];
        if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00';
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, slugifySheetName("Compras_Vista"));
    XLSX.writeFile(wb, `${exportBaseName}.xlsx`);
  }, [getExportData, exportBaseName]);

  const exportToCSV = useCallback(() => {
    const dataToExport = getExportData();
    const headers = Object.keys(dataToExport[0] || {});
    const lines = [
      headers.join(";"),
      ...dataToExport.map((row) => headers.map((h) => escapeCSV(row[h])).join(";")),
    ];
    const csvContent = "\uFEFF" + lines.join("\n");
    downloadBlob(csvContent, `${exportBaseName}.csv`, "text/csv;charset=utf-8;");
  }, [getExportData, exportBaseName]);

  const exportToTXT = useCallback(() => {
    const dataToExport = getExportData();
    const lines = dataToExport.map((row, index) => {
      return [
        `REGISTRO ${index + 1}`,
        `FECHA: ${row.FECHA ?? ""}`,
        `DESCRIPCION: ${row.DESCRIPCION ?? ""}`,
        `PROVEEDOR: ${row.PROVEEDOR ?? ""}`,
        `TOTAL: ${row.TOTAL ?? ""}`,
        "----------------------------------------",
      ].join("\n");
    });
    const txtContent = lines.join("\n");
    downloadBlob(txtContent, `${exportBaseName}.txt`, "text/plain;charset=utf-8;");
  }, [getExportData, exportBaseName]);

  const handleExport = useCallback(
    async (type) => {
      try {
        if (hasMore) {
          showToast(
            "error",
            'Todavía hay más registros sin cargar. Tocá "Cargar 100 más" hasta completar todo.',
            5200
          );
          return;
        }

        if (type === "excel") {
          exportToExcel();
          showToast("exito", "Excel exportado.", 2200);
          return;
        }

        if (type === "csv") {
          exportToCSV();
          showToast("exito", "CSV exportado.", 2200);
          return;
        }

        if (type === "txt") {
          exportToTXT();
          showToast("exito", "TXT exportado.", 2200);
        }
      } catch (e) {
        showToast("error", e?.message || "Error exportando archivo.", 3500);
      }
    },
    [hasMore, exportToExcel, exportToCSV, exportToTXT, showToast]
  );

  const exportOptions = useMemo(
    () => [
      {
        key: "excel",
        label: "Exportar Excel (.xlsx)",
        icon: faFileExcel,
        onClick: () => handleExport("excel"),
      },
      {
        key: "csv",
        label: "Exportar CSV (.csv)",
        onClick: () => handleExport("csv"),
      },
      {
        key: "txt",
        label: "Exportar TXT (.txt)",
        onClick: () => handleExport("txt"),
      },
    ],
    [handleExport]
  );

  const columns = useMemo(
    () => [
      {
        key: "fecha",
        label: "FECHA",
        fr: 0.9,
        align: "center",
        render: (r) => safeText(formatFechaDMY(pick(r, ["fecha"], ""))),
      },
      {
        key: "detalle",
        label: "DESCRIPCION",
        fr: 2.2,
        strong: true,
        align: "left",
        render: (r) => productosLabel(r),
      },
      {
        key: "proveedor",
        label: "PROVEEDOR",
        fr: 1.8,
        align: "left",
        render: (r) =>
          safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], "")),
      },
      {
        key: "total",
        label: "TOTAL",
        fr: 1.1,
        align: "right",
        render: (r) =>
          moneyARS(pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0)),
      },
      { key: "acciones", label: "ACCIONES", fr: 0.95, align: "center", render: () => null },
    ],
    []
  );

  const gridCols = useMemo(() => {
    if (!columns.length) return `repeat(${columns.length}, minmax(0, 1fr))`;
    return columns
      .map((c) => {
        const n = Number(c.fr);
        return Number.isFinite(n) && n > 0 ? `${n}fr` : "1fr";
      })
      .join(" ");
  }, [columns]);

  const openEditModal = (r) => {
    setSelectedRow(r);
    setOpenEdit(true);
  };

  const openDeleteModal = (r) => {
    setSelectedRow(r);
    setOpenDel(true);
  };

  const openMediosPagoModal = async (r) => {
    const id = getRowId(r);

    // Abrimos con la fila actual para que el modal responda rápido.
    setSelectedRow(r);
    setOpenMediosPago(true);

    // Si la compra fue cuenta corriente y después se pagó desde Orden de Pago,
    // la fila cacheada puede quedar vieja. Pedimos la compra puntual al backend
    // para traer SIEMPRE los medios reales con los que fue pagada.
    if (!id) return;

    try {
      const sp = new URLSearchParams();
      sp.set("action", "compras_obtener");
      sp.set("id_movimiento", String(id));
      sp.set("_ts", String(Date.now()));

      const data = await apiGet(`${API}?${sp.toString()}`);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo obtener el detalle actualizado de la compra.");

      const fresh = Array.isArray(data.compras)
        ? data.compras[0]
        : data.compra || data.data || null;

      if (!fresh || !getRowId(fresh)) return;

      const sameId = (a, b) => String(getRowId(a) || "") === String(b || "");
      const merged = { ...(r || {}), ...(fresh || {}) };

      setSelectedRow((prev) => (sameId(prev, id) ? { ...(prev || {}), ...(fresh || {}) } : prev));
      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((row) => (sameId(row, id) ? { ...row, ...merged } : row))
      );

      // Evita volver a abrir el modal con una versión vieja persistida en localStorage.
      cacheRef.current.clear();
      clearMovPerfCache("compras:listar:cc-medios-v2");
    } catch (e) {
      console.warn("No se pudo refrescar el detalle de medios de pago de la compra:", e);
    }
  };

  const buildComprobanteFastUrl = useCallback((r) => {
    const idComp = getComprobanteId(r);
    if (!idComp) return "";
    return `id:${idComp}`;
  }, []);

  const handlePrewarmComprobante = useCallback(
    async (r) => {
      const idComp = getComprobanteId(r);
      if (!idComp) return;

      try {
        const signedUrl = await getComprobanteSignedUrl(idComp);
        if (!signedUrl) return;
        prewarmComprobanteUrl(signedUrl, getComprobanteMime(r));
      } catch {
        // silencioso
      }
    },
    [getComprobanteSignedUrl]
  );

  const openComprobanteModal = useCallback(
    async (r) => {
      const idComp = getComprobanteId(r);
      if (!idComp) return;

      try {
        const signedUrl = await getComprobanteSignedUrl(idComp);
        if (!signedUrl) {
          showToast("error", "No se pudo obtener el comprobante.", 3000);
          return;
        }

        setCompUrl(signedUrl);
        setCompMime(getComprobanteMime(r));
        setOpenVerComp(true);
      } catch (e) {
        showToast("error", e?.message || "No se pudo abrir el comprobante.", 3200);
      }
    },
    [getComprobanteSignedUrl, showToast]
  );
  
  const closeComprobanteModal = () => {
    setOpenVerComp(false);
    setCompUrl("");
    setCompMime("");
  };

  const refreshAfterSave = useCallback(async () => {
    setOpenNueva(false);
    setOpenEdit(false);
    setSelectedRow(null);
    cacheRef.current.clear();
    clearMovPerfCache("compras:listar:cc-medios-v2");
    signedUrlCacheRef.current.clear();
    await loadRows({ dateRange, q: "", offset: 0, append: false });
    await refreshPeriodos();
  }, [dateRange, loadRows, refreshPeriodos]);

  const handleSaveEdit = useCallback(
    async (payloadFinal) => {
      const data = await editarCompraEnBackend(payloadFinal);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo actualizar.");
      return data;
    },
    [editarCompraEnBackend]
  );

  /* =========================
     ELIMINAR - CORREGIDO CON idUsuarioMaster
  ========================= */
  const confirmDelete = useCallback(async () => {
    const id = getRowId(selectedRow);
    if (!id) {
      throw new Error("No se encontró el id del movimiento a eliminar.");
    }

    setDeletingId(id);

    try {
      const { idUsuario, idUsuarioMaster } = getAuthInfo();
      const sp = new URLSearchParams();
      sp.set("action", "compras_eliminar");
      sp.set("id_movimiento", String(id));

      const data = await apiPostJson(`${API}?${sp.toString()}`, { 
        idUsuario,
        idUsuarioMaster: idUsuarioMaster || idUsuario
      });

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo eliminar.");
      }

      setOpenDel(false);
      setSelectedRow(null);
      cacheRef.current.clear();
      clearMovPerfCache("compras:listar:cc-medios-v2");
      signedUrlCacheRef.current.clear();

      await loadRows({ dateRange, q, offset: 0, append: false });
      await refreshPeriodos();

      return data;
    } catch (e) {
      throw e;
    } finally {
      setDeletingId(null);
    }
  }, [API, apiPostJson, selectedRow, loadRows, dateRange, q, refreshPeriodos]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingRows || loadingMore || loadingListsCtx) return;
    if (nextOffset === null) return;

    showToast("cargando", "Cargando registros...", 12000);

    try {
      const res = await loadRows({
        dateRange,
        q: (q || "").trim(),
        offset: nextOffset,
        append: true,
      });

      if (!res) {
        showToast("error", "No se pudieron cargar más registros.", 4200);
        return;
      }

      showToast("exito", `${res.received || PAGE_SIZE} registros más cargados.`, 2400);
    } catch (e) {
      showToast("error", e?.message || "Error cargando más registros.", 4200);
    }
  }, [
    hasMore,
    loadingRows,
    loadingMore,
    loadingListsCtx,
    nextOffset,
    dateRange,
    q,
    loadRows,
    showToast,
  ]);

  const skelWidths = useMemo(
    () => ({
      fecha: ["44%", "38%", "40%", "36%"],
      detalle: ["72%", "58%", "66%", "48%"],
      proveedor: ["62%", "54%", "46%", "58%"],
      pago: ["44%", "34%", "40%", "30%"],
      medio_pago: ["48%", "42%", "52%", "38%"],
      total: ["38%", "30%", "34%", "28%"],
    }),
    []
  );

  const renderSkeletonRow = (idx) => (
    <div
      key={`skel-${idx}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton"
      style={{ gridTemplateColumns: gridCols }}
      role="row"
      aria-hidden="true"
    >
      {columns.map((c) => {
        if (c.key === "acciones") {
          return (
            <div
              key={c.key}
              className="mov-gridCell mov-gridCell--actions is-center"
              role="cell"
              data-label={c.label}
            >
              <div className="mov-skelActions">
                <span className="mov-skelIcon" />
                <span className="mov-skelIcon" />
                <span className="mov-skelIcon" />
              </div>
            </div>
          );
        }
        const list = skelWidths[c.key] || ["60%"];
        const w = list[idx % list.length];
        return (
          <div
            key={c.key}
            className={[
              "mov-gridCell",
              c.align === "right" ? "is-right" : "",
              c.align === "center" ? "is-center" : "",
            ].join(" ")}
            role="cell"
            data-label={c.label}
          >
            <span className="mov-skeletonBar" style={{ width: w }} />
          </div>
        );
      })}
    </div>
  );

  const softLoading = loadingRows && showSkeleton;
  const canShowEmpty = ready && !loadingRows && !loadingListsCtx && filteredRows.length === 0;
  const isAnyLoading = loadingRows || loadingMore;

  return (
    <div className="mov-page mov-page--compras">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      {errorListsCtx && (
        <div className="mov-alert" role="alert">
          {errorListsCtx}
        </div>
      )}
      {error && (
        <div className="mov-alert" role="alert">
          {error}
        </div>
      )}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Movs · Compras</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> compras
                {hasMore && filteredRows.length > 0 ? " (hay más por cargar)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="cc-filter cc-filter--cal">
                <div
                  className={`cc-floatingField cc-floatingField--calendar is-active ${
                    showCalendario ? "is-open" : ""
                  }`}
                >
                  <button
                    type="button"
                    className={`cc-calTrigger ${showCalendario ? "is-open" : ""}`}
                    onClick={() => setShowCalendario((v) => !v)}
                    disabled={isAnyLoading || loadingListsCtx}
                    title="Seleccionar rango de fechas"
                  >
                    {dateRangeLabel}
                    <span className="cc-calTrigger__iconRight">
                      <FontAwesomeIcon icon={faChevronDown} />
                    </span>
                  </button>

                  <span className="cc-floatingLabel cc-floatingLabel--active">
                    <FontAwesomeIcon icon={faCalendarDays} /> Período
                  </span>

                  {showCalendario && (
                    <div className="cc-calDropdown">
                      <Calendario
                        value={dateRange}
                        onChange={async (newRange) => {
                          if (newRange.from && newRange.to) setShowCalendario(false);
                          await handleDateRangeChange(newRange);
                        }}
                        onClose={() => setShowCalendario(false)}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="cc-filter">
                <div className="cc-floatingField cc-floatingField--search is-active">
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating"
                        id="vents-comppr-wit"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                            skipSearchRef.current = true;
                            await loadRows({
                              dateRange,
                              q: e.currentTarget.value,
                              offset: 0,
                              append: false,
                            });
                          }
                        }}
                        placeholder="Buscar por descripción, proveedor..."
                        disabled={loadingListsCtx || loadingMore}
                      />

                      <span className="cc-floatingLabel">
                        <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                      </span>

                      {q.trim() !== "" && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside"
                          title="Limpiar búsqueda"
                          onClick={async () => {
                            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                            setQ("");
                            skipSearchRef.current = true;
                            await loadRows({
                              dateRange,
                              q: "",
                              offset: 0,
                              append: false,
                            });
                          }}
                          disabled={loadingMore}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="mov-card__actions"
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <BotonExportar
              disabled={loadingRows || filteredRows.length === 0}
              loading={false}
              label="Exportar"
              title={filteredRows.length ? "Exportar archivo" : "No hay datos para exportar"}
              opciones={exportOptions}
              align="right"
            />

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={() => {
                if (loadingListsCtx) {
                  showToast?.("cargando", "Cargando listas… podés ir completando igual.", 2400);
                }
                setOpenNueva(true);
              }}
              title="Crear nueva compra"
            >
              <FontAwesomeIcon icon={faPlus} /> Nueva Compra
            </button>
          </div>
        </div>

        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: gridCols }}
          role="row"
        >
          {columns.map((c) => (
            <div
              key={c.key}
              className={[
                "mov-gridCell",
                "mov-gridCell--head",
                c.align === "right" ? "is-right" : "",
                c.align === "center" ? "is-center" : "",
              ].join(" ")}
              role="columnheader"
            >
              {c.label}
            </div>
          ))}
        </div>

        <div className="mov-tableWrap mov-tableWrap--compras" role="rowgroup">
          <div
            className={[
              "mov-gridBody",
              "mov-gridBody--relative",
              softLoading ? "mov-softLoading" : "",
            ].join(" ")}
          >
            {showSkeleton && loadingRows ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {filteredRows.map((r) => {
                  const rowId = getRowId(r) ?? `row-${Math.random()}`;
                  const idComp = getComprobanteId(r);
                  const canSee = !!idComp;
                  const isDeleting =
                    deletingId !== null && String(deletingId) === String(rowId);
                  return (
                    <div
                      key={rowId}
                      className="mov-gridTable mov-gridTable--row"
                      style={{ gridTemplateColumns: gridCols }}
                      role="row"
                    >
                      {columns.map((c) => {
                        if (c.key === "acciones") {
                          return (
                            <div
                              key={c.key}
                              className={[
                                "mov-gridCell",
                                "mov-gridCell--actions",
                                "is-center",
                              ].join(" ")}
                              role="cell"
                              data-label={c.label}
                            >
                              <div className="mov-actionsInline">
                                <button
                                  type="button"
                                  className={`mov-iconBtn ${!canSee ? "is-disabled" : ""}`}
                                  title={canSee ? "Ver comprobante" : "Sin comprobante"}
                                  onMouseEnter={() => canSee && handlePrewarmComprobante(r)}
                                  onPointerEnter={() => canSee && handlePrewarmComprobante(r)}
                                  onFocus={() => canSee && handlePrewarmComprobante(r)}
                                  onClick={() => canSee && openComprobanteModal(r)}
                                  disabled={!canSee || isAnyLoading || loadingListsCtx}
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                </button>

                                <button
                                  type="button"
                                  className="mov-iconBtn"
                                  title="Ver información completa del movimiento"
                                  onClick={() => openMediosPagoModal(r)}
                                  disabled={isAnyLoading || loadingListsCtx}
                                >
                                  <FontAwesomeIcon icon={faInfoCircle} />
                                </button>

                                <button
                                  type="button"
                                  className="mov-iconBtn"
                                  title="Editar"
                                  onClick={() => openEditModal(r)}
                                  disabled={isAnyLoading || loadingListsCtx}
                                >
                                  <FontAwesomeIcon icon={faPenToSquare} />
                                </button>

                                <button
                                  type="button"
                                  className="mov-iconBtn mov-iconBtn--danger"
                                  title="Eliminar"
                                  disabled={isAnyLoading || loadingListsCtx || isDeleting}
                                  onClick={() => openDeleteModal(r)}
                                >
                                  {isDeleting ? "..." : <FontAwesomeIcon icon={faTrashCan} />}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        const val = c.render ? c.render(r) : safeText(r[c.key]);
                        return (
                          <div
                            key={c.key}
                            className={[
                              "mov-gridCell",
                              c.align === "right" ? "is-right" : "",
                              c.align === "center" ? "is-center" : "",
                              c.strong ? "is-strong" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            role="cell"
                            data-label={c.label}
                            title={typeof val === "string" ? val : undefined}
                          >
                            <span className="mov-ellipsissss">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {canShowEmpty && (
                  <div className="cc-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">
                      {q.trim()
                        ? `No se encontraron compras para "${q.trim()}".`
                        : "No hay compras para mostrar en el rango de fechas seleccionado."}
                    </div>
                  </div>
                )}

                {!loadingRows && hasMore && filteredRows.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      padding: "12px 0",
                    }}
                  >
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadMore}
                      disabled={loadingMore || loadingRows || loadingListsCtx}
                      title="Cargar 100 registros más"
                    >
                      {loadingMore ? "Cargando..." : "Cargar 100 más"}
                    </button>
                  </div>
                )}

                {loadingMore && (
                  <div
                    className="mov-skeletonMore"
                    aria-busy="true"
                    aria-label="Cargando más registros"
                  >
                    {Array.from({ length: 6 }).map((_, i) => renderSkeletonRow(i))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <ModalNuevaCompra
        open={openNueva}
        lists={listasCtx || { periodos: [] }}
        onClose={() => setOpenNueva(false)}
        onToast={showToast}
        onSaved={async () => {
          await refreshAfterSave();
        }}
      />

      <ModalEditarCompra
        open={openEdit}
        lists={listasCtx || { periodos: [] }}
        row={selectedRow}
        periodoDefault={
          dateRange?.from
            ? `${String(dateRange.from.getMonth() + 1).padStart(2, "0")}-${dateRange.from.getFullYear()}`
            : ""
        }
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onToast={showToast}
        onSave={handleSaveEdit}
        onSaved={async () => {
          await refreshAfterSave();
          showToast("exito", "Compra actualizada correctamente.", 2400);
        }}
      />

      <ModalDetalleMovimientoCompra
        open={openMediosPago}
        row={selectedRow}
        onClose={() => {
          setOpenMediosPago(false);
          setSelectedRow(null);
        }}
      />

      <ModalVerComprobante
        open={openVerComp}
        url={compUrl}
        mime={compMime}
        onClose={closeComprobanteModal}
        title="Comprobante de compra"
      />

      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId !== null && String(deletingId) === String(getRowId(selectedRow))}
        onClose={() => {
          setOpenDel(false);
          setSelectedRow(null);
        }}
        onConfirm={confirmDelete}
        onToast={showToast}
        title="Eliminar compra"
        message="¿Seguro que querés eliminar esta compra definitivamente?"
        warning="Esta acción no se puede deshacer."
        loadingMessage="Eliminando compra..."
        successMessage="Compra eliminada correctamente."
        errorMessage="No se pudo eliminar la compra."
        confirmLabel="Eliminar"
      />
    </div>
  );
}