// ✅ REEMPLAZAR COMPLETO
// src/components/Mov_Subsection/OrdenesPago/OrdenesPago.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../../config/config.jsx";
import "../../Global/Global_css/Global_Section.css";

// ✅ MODALES
import ModalPagarOrdenesPago from "./modales/ModalPagarOrdenesPago.jsx";
import ModalEditarOrdenPago from "./modales/ModalEditarOrdenPago.jsx";
import ModalEliminarMovimientos from "../../Movimientos/modales/ModalEliminarMovimientos.jsx";

// ✅ MODAL GLOBAL: ver comprobante
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";

// ✅ Calendario
import Calendario from "../../Global/Calendario/Calendario.jsx";
import "../../Global/Calendario/calendario.css";

// ✅ Toast
import Toast from "../../Global/Toast.jsx";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faMagnifyingGlass,
  faFileExcel,
  faPenToSquare,
  faTrashCan,
  faMoneyBill1Wave,
  faEye,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";
import { useListas } from "../../../context/ListasContext.jsx";

// ✅ ✅ CONTEXTO GLOBAL DE RANGO DE FECHAS
import { useDateRange } from "../../../context/DateRangeContext.jsx";

/* =========================
   PERF
========================= */
const PAGE_SIZE = 100;
const SKELETON_ROWS = 10;
const FORCE_SHOW_LOADER_DEV = false;

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
  return s ? s : "-";
}
function normalizeSearchText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
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
   Fecha helpers para rango (igual que Ventas)
========================= */
function startOfDay(d) {
  if (!d) return null;
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Convierte "YYYY-MM-DD" o "DD/MM/YYYY" a Date (sin hora) */
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

/** Formatea Date → "YYYY-MM-DD" para la API */
function dateToAPI(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** "DD/MM/YYYY" para mostrar */
function formatDateUI(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Filtro por rango de fechas (igual que Ventas) */
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
   Auth helpers
========================= */
function getAuthInfo() {
  const token = (localStorage.getItem("token") || "").trim();
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    ""
  ).trim();
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      u?.user_id ??
      0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, sessionKey, idUsuario };
}

/* =========================
   ORDENES PAGO = COMPRAS CC
========================= */
const ID_TIPO_OPERACION_COMPRA = 2;
const ID_TIPO_VENTA_CUENTA_CORRIENTE = 2;

function isCompraCuentaCorriente(row) {
  const op = Number(row?.id_tipo_operacion ?? row?.idTipoOperacion ?? 0);
  const tv = Number(row?.id_tipo_venta ?? row?.idTipoVenta ?? 0);
  return op === ID_TIPO_OPERACION_COMPRA && tv === ID_TIPO_VENTA_CUENTA_CORRIENTE;
}

function isPagado(row) {
  return Number(row?.pagado ?? 0) === 1;
}

function getIdComprobanteFromRow(row) {
  const cand =
    row?.id_comprobante ??
    row?.comprobante_id ??
    row?.idComprobante ??
    row?.id_comprobante_archivo ??
    row?.idComprobanteArchivo ??
    0;
  const n = Number(cand || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function appendSessionKey(url, sessionKey) {
  const u = String(url || "").trim();
  const sk = String(sessionKey || "").trim();
  if (!u || !sk) return u;
  if (u.toLowerCase().includes("session_key=")) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}session_key=${encodeURIComponent(sk)}`;
}

/* =========================
   Full-text match
========================= */
function rowMatchesQuery(row, query) {
  const qq = normalizeSearchText(query);
  if (!qq) return true;
  const montoNum = Number(row?.monto_total || row?.total || 0);
  const parts = [];
  if (row && typeof row === "object") {
    for (const k of Object.keys(row)) {
      const val = row[k];
      if (val && typeof val === "object") continue;
      parts.push(String(val ?? ""));
    }
  }
  parts.push(formatFechaDMY(row?.fecha));
  parts.push(String(montoNum), String(Math.trunc(montoNum)), moneyARS(montoNum));
  const hay = normalizeSearchText(parts.join(" | "));
  return hay.includes(qq);
}

/* =========================
   Excel
========================= */
function slugifySheetName(name) {
  const s = String(name || "OrdenesPago")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "OrdenesPago").slice(0, 31);
}

export default function OrdenesPago() {
  const API = `${BASE_URL}/api.php`;

  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

  // ✅ ✅ RANGO GLOBAL (se comparte entre secciones)
  const { dateRange, setDateRange } = useDateRange();
  const [showCalendario, setShowCalendario] = useState(false);

  const [rows, setRows] = useState([]);
  const rowsRef = useRef([]);
  useEffect(() => {
    rowsRef.current = Array.isArray(rows) ? rows : [];
  }, [rows]);

  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  const [showAll, setShowAll] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const cacheRef = useRef(new Map());
  const reqIdRef = useRef(0);
  const rowsReqIdRef = useRef(0);
  const moreReqIdRef = useRef(0);
  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);

  const didInitRef = useRef(false);

  const showSkeleton = loadingRows;

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  /* =========================
     API helpers
  ========================= */
  const buildHeadersGET = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = {};
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const buildHeadersPOST = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    try {
      return JSON.parse(text);
    } catch {
      const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
      throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
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
        headers: buildHeadersPOST(),
        body: JSON.stringify(payload ?? {}),
      });
      return await parseJsonOrThrow(res);
    },
    [buildHeadersPOST, parseJsonOrThrow]
  );

  /* =========================
     LOAD ROWS — usa fecha_desde / fecha_hasta (igual que Ventas)
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const fromDate = opts.from !== undefined ? opts.from : dateRange?.from;
      const toDate = opts.to !== undefined ? opts.to : dateRange?.to;
      const qLocal = typeof opts.q === "string" ? opts.q : q;
      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

      const fromAPI = dateToAPI(fromDate);
      const toAPI = dateToAPI(toDate);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${fromAPI}|${toAPI}|${qKey}`;

      const PROBE_LIMIT = PAGE_SIZE + 1;
      const myReqId = ++reqIdRef.current;

      if (!append) {
        rowsReqIdRef.current = myReqId;
        setLoadingRows(true);
      } else {
        moreReqIdRef.current = myReqId;
        setLoadingMore(true);
      }
      setError("");

      try {
        if (!append && offset === 0 && cacheRef.current.has(cacheKey) && !FORCE_SHOW_LOADER_DEV) {
          if (rowsReqIdRef.current !== myReqId) return null;
          const cached = cacheRef.current.get(cacheKey);
          const cachedRows = Array.isArray(cached?.rows) ? cached.rows : [];
          rowsRef.current = cachedRows;
          setRows(cachedRows);
          setHasMore(!!cached?.hasMore);
          setNextOffset(cached?.nextOffset ?? null);
          if (rowsReqIdRef.current === myReqId) setLoadingRows(false);
          return {
            hasMore: !!cached?.hasMore,
            nextOffset: cached?.nextOffset ?? null,
            received: cachedRows.length,
          };
        }

        const sp = new URLSearchParams();
        sp.set("action", "ordenes_pago_listar");
        if (fromAPI) sp.set("fecha_desde", fromAPI);
        if (toAPI) sp.set("fecha_hasta", toAPI);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PROBE_LIMIT));
        sp.set("offset", String(offset));

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar órdenes de pago.");

        if (myReqId !== reqIdRef.current) return null;

        const listKey = Array.isArray(data.movimientos)
          ? "movimientos"
          : Array.isArray(data.ordenes)
          ? "ordenes"
          : "movimientos";

        const rawArr = Array.isArray(data[listKey]) ? data[listKey] : [];

        const norm = rawArr.map((r) => ({
          ...r,
          pagado: Number(r?.pagado ?? 0) === 1 ? 1 : 0,
          id_comprobante: getIdComprobanteFromRow(r) || 0,
        }));

        let newHasMore = data.has_more !== undefined ? !!data.has_more : norm.length > PAGE_SIZE;
        let newNextOffset =
          data.next_offset !== undefined && data.next_offset !== null
            ? Number(data.next_offset)
            : newHasMore
            ? offset + PAGE_SIZE
            : null;

        const page = newHasMore ? norm.slice(0, PAGE_SIZE) : norm;

        if (myReqId !== reqIdRef.current) return null;

        if (append) {
          const base = Array.isArray(rowsRef.current) ? rowsRef.current : [];
          const seen = new Set(base.map((x) => String(x?.id_movimiento ?? "")));
          const add = page.filter((x) => {
            const k = String(x?.id_movimiento ?? "");
            return k && !seen.has(k);
          });
          const merged = [...base, ...add];
          rowsRef.current = merged;
          setRows(merged);
          if (add.length === 0) {
            newHasMore = false;
            newNextOffset = null;
          }
          setHasMore(newHasMore);
          setNextOffset(newNextOffset);
          if (moreReqIdRef.current === myReqId) setLoadingMore(false);
        } else {
          rowsRef.current = page;
          setRows(page);
          setHasMore(newHasMore);
          setNextOffset(newNextOffset);
          if (offset === 0) {
            cacheRef.current.set(cacheKey, {
              rows: page,
              hasMore: newHasMore,
              nextOffset: newNextOffset,
            });
          }
          if (rowsReqIdRef.current === myReqId) setLoadingRows(false);
        }

        return {
          hasMore: newHasMore,
          nextOffset: newNextOffset,
          received: page.length,
        };
      } catch (e) {
        if (myReqId !== reqIdRef.current) return null;
        setError(e.message || "Error cargando órdenes de pago.");
        if (append) {
          if (moreReqIdRef.current === myReqId) setLoadingMore(false);
        } else {
          if (rowsReqIdRef.current === myReqId) setLoadingRows(false);
        }
        return null;
      }
    },
    [API, apiGet, dateRange, q]
  );

  /* =========================
     INIT — usa el rango GLOBAL (NO lo resetea)
  ========================= */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureListsLoaded({ force: false, background: true });
      } catch {}

      if (!alive) return;

      // ✅ primera carga con rango global actual
      await loadRows({
        from: dateRange?.from,
        to: dateRange?.to,
        q: "",
        offset: 0,
        append: false,
      });

      didInitRef.current = true;
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Cuando cambie el rango GLOBAL desde otra sección → recargar acá
  ========================= */
  useEffect(() => {
    if (!didInitRef.current) return;
    // si cambia en otra sección, acá se refresca
    cacheRef.current.clear();
    skipSearchRef.current = true;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    loadRows({
      from: dateRange?.from,
      to: dateRange?.to,
      q,
      offset: 0,
      append: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange?.from?.getTime?.(), dateRange?.to?.getTime?.()]);

  // Debounce búsqueda
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      loadRows({ from: dateRange?.from, to: dateRange?.to, q, offset: 0, append: false });
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  /* =========================
     Handler cambio de rango de fechas (usa setDateRange GLOBAL)
  ========================= */
  const handleDateRangeChange = useCallback(
    async (newRange) => {
      if (!newRange?.from && !newRange?.to) return;

      setDateRange(newRange); // ✅ guarda global
      cacheRef.current.clear();

      // para que NO dispare doble (debounce) y recargue instantáneo
      skipSearchRef.current = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      await loadRows({
        from: newRange.from,
        to: newRange.to,
        q,
        offset: 0,
        append: false,
      });
    },
    [loadRows, q, setDateRange]
  );

  /* =========================
     "Cargar todos"
  ========================= */
  const handleLoadAll = useCallback(async () => {
    if (!hasMore || loadingMore || loadingRows || loadingListsCtx || loadingAll) return;
    if (nextOffset === null) return;

    setLoadingAll(true);
    showToast("cargando", "Cargando todas las órdenes de pago…", 12000);

    let offset = nextOffset;
    let guard = 0;

    try {
      while (offset !== null && guard < 3000) {
        const beforeLen = rowsRef.current.length;
        const res = await loadRows({
          from: dateRange?.from,
          to: dateRange?.to,
          q: (q || "").trim(),
          offset,
          append: true,
        });
        if (!res) break;
        guard += 1;
        offset = res.nextOffset;
        const afterLen = rowsRef.current.length;
        if (afterLen === beforeLen) break;
        if (!res.hasMore || offset === null) break;
      }
      setRows([...rowsRef.current]);
      showToast("exito", `Listo: se cargaron ${rowsRef.current.length} órdenes.`, 2600);
    } catch (e) {
      showToast("error", e?.message || "Error cargando todas.", 4200);
    } finally {
      setLoadingAll(false);
    }
  }, [
    hasMore,
    loadingMore,
    loadingRows,
    loadingListsCtx,
    loadingAll,
    nextOffset,
    dateRange,
    q,
    loadRows,
    showToast,
  ]);

  /* =========================
     Filtrado client-side
  ========================= */
  const filteredRows = useMemo(() => {
    return (Array.isArray(rows) ? rows : [])
      .filter((r) => isCompraCuentaCorriente(r))
      .filter((r) => rowInDateRange(r, dateRange?.from, dateRange?.to))
      .filter((r) => rowMatchesQuery(r, q));
  }, [rows, dateRange, q]);

  const visibleRows = useMemo(() => {
    if (showAll) return filteredRows;
    return filteredRows;
  }, [filteredRows, showAll]);

  /* =========================
     Label para el botón del calendario (igual que Ventas)
  ========================= */
  const dateRangeLabel = useMemo(() => {
    const from = dateRange?.from || null;
    const to = dateRange?.to || null;

    if (!from && !to) return "Seleccionar fechas";
    if (from && to) {
      if (
        from.getFullYear() === to.getFullYear() &&
        from.getMonth() === to.getMonth() &&
        from.getDate() === to.getDate()
      ) {
        return formatDateUI(from);
      }
      return `${formatDateUI(from)} → ${formatDateUI(to)}`;
    }
    if (from) return `Desde ${formatDateUI(from)}`;
    return `Hasta ${formatDateUI(to)}`;
  }, [dateRange]);

  /* =========================
     Modal Ver Comprobante
  ========================= */
  const [openVer, setOpenVer] = useState(false);
  const [verUrl, setVerUrl] = useState("");
  const [verTitle, setVerTitle] = useState("Comprobante");

  const closeVerModal = useCallback(() => {
    setOpenVer(false);
    setTimeout(() => {
      setVerUrl("");
      setVerTitle("Comprobante");
    }, 80);
  }, []);

  const openVerModal = useCallback(
    (row) => {
      const { sessionKey } = getAuthInfo();
      const idComp = getIdComprobanteFromRow(row);
      if (!idComp) return;
      let u = `${API}?action=comprobantes_descargar&id_comprobante=${idComp}`;
      u = appendSessionKey(u, sessionKey);
      setVerTitle(`Comprobante · ${safeText(row?.proveedor)}`);
      setVerUrl(u);
      setOpenVer(true);
    },
    [API]
  );

  /* =========================
     Modales Pagar / Editar / Eliminar
  ========================= */
  const [openPagar, setOpenPagar] = useState(false);
  const [pagarProveedor, setPagarProveedor] = useState(null);
  const [pagarDeudas, setPagarDeudas] = useState([]);

  const closePagarModal = useCallback(() => {
    setOpenPagar(false);
    setPagarProveedor(null);
    setPagarDeudas([]);
  }, []);

  const getDeudasProveedor = useCallback(
    (rowProv) => {
      const idProv = Number(rowProv?.id_proveedor || rowProv?.proveedor_id || 0);
      const nombreProv = String(rowProv?.proveedor || "").trim();
      return (rows || [])
        .filter((r) => {
          const rid = Number(r?.id_proveedor || r?.proveedor_id || 0);
          const rnom = String(r?.proveedor || "").trim();
          const same =
            (idProv > 0 && rid === idProv) ||
            (!idProv && nombreProv && rnom.toLowerCase() === nombreProv.toLowerCase());
          return same;
        })
        .filter((r) => isCompraCuentaCorriente(r));
    },
    [rows]
  );

  const openPagarModal = useCallback(
    (r) => {
      const deudas = getDeudasProveedor(r);
      setPagarProveedor(r);
      setPagarDeudas(deudas);
      setOpenPagar(true);
    },
    [getDeudasProveedor]
  );

  const [openEditar, setOpenEditar] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const closeEditarModal = useCallback(() => {
    setOpenEditar(false);
    setEditRow(null);
  }, []);
  const openEditarModal = useCallback((r) => {
    setEditRow(r);
    setOpenEditar(true);
  }, []);

  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const openDeleteModal = useCallback((r) => {
    setSelectedRow(r);
    setOpenDel(true);
  }, []);
  const closeDeleteModal = useCallback(() => {
    setOpenDel(false);
    setSelectedRow(null);
  }, []);

  /* =========================
     Acciones backend
  ========================= */
  const refreshAfterMutation = useCallback(async () => {
    cacheRef.current.clear();
    await loadRows({
      from: dateRange?.from,
      to: dateRange?.to,
      q,
      offset: 0,
      append: false,
    });
    try {
      await refreshLists?.();
    } catch {}
  }, [dateRange, loadRows, q, refreshLists]);

  const onConfirmPago = useCallback(
    async (payload) => {
      try {
        showToast("cargando", "Confirmando pago…", 12000);
        const ids =
          payload?.ids_movimiento ??
          payload?.ids_movimientos ??
          payload?.seleccion?.map((x) => Number(x?.id_movimiento || 0)).filter(Boolean) ??
          [];
        const data = await apiPostJson(`${API}?action=ordenes_pago_confirmar_pago`, {
          ids_movimiento: ids,
          id_medio_pago: Number(payload?.id_medio_pago || payload?.idMedioPago || 0),
        });
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo confirmar el pago.");
        await refreshAfterMutation();
        showToast("exito", data?.mensaje || "Pago confirmado.", 1800);
        return true;
      } catch (e) {
        showToast("error", e?.message || "Error confirmando pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, refreshAfterMutation, showToast]
  );

  const onSaveEditar = useCallback(
    async (payloadFinal) => {
      try {
        showToast("cargando", "Guardando cambios…", 12000);
        const { idUsuario } = getAuthInfo();
        const data = await apiPostJson(`${API}?action=ordenes_pago_actualizar`, {
          ...payloadFinal,
          idUsuario,
        });
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la orden de pago.");
        await refreshAfterMutation();
        showToast("exito", data?.mensaje || "Orden de pago actualizada.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error guardando orden de pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, refreshAfterMutation, showToast]
  );

  const confirmDelete = useCallback(async () => {
    if (!selectedRow?.id_movimiento) return;
    const id = selectedRow.id_movimiento;
    setDeletingId(id);
    setError("");
    showToast("cargando", "Eliminando orden de pago…", 12000);
    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(`${API}?action=ordenes_pago_eliminar`, {
        id_movimiento: Number(id),
        idUsuario,
      });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");
      closeDeleteModal();
      await refreshAfterMutation();
      showToast("exito", "Orden de pago eliminada.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando orden de pago.");
      showToast("error", e.message || "Error eliminando orden de pago.", 4200);
    } finally {
      setDeletingId(null);
    }
  }, [API, apiPostJson, closeDeleteModal, refreshAfterMutation, selectedRow, showToast]);

  const handleAfterComprobanteSaved = useCallback(async () => {
    try {
      await refreshAfterMutation();
    } catch {}
  }, [refreshAfterMutation]);

  /* =========================
     Excel
  ========================= */
  const exportToExcel = useCallback(() => {
    try {
      if (!filteredRows.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }
      if (hasMore) {
        showToast(
          "error",
          "Ojo: faltan registros sin cargar. Si querés exportar todo, tocá 'Cargar todos' primero.",
          5200
        );
      }
      const dataToExport = filteredRows.map((r) => ({
        ESTADO: isPagado(r) ? "PAGADO" : "PENDIENTE",
        FECHA: safeText(formatFechaDMY(r.fecha)),
        DESCRIPCION: safeText(r.detalle ?? r.descripcion ?? r.concepto),
        PROVEEDOR: safeText(r.proveedor),
        MONTO: Number(r.monto_total ?? r.total ?? 0) || 0,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToExport);

      const from = dateRange?.from || null;
      const to = dateRange?.to || null;

      const sufijo =
        from && to
          ? `${dateToAPI(from)}_${dateToAPI(to)}`
          : from
          ? `desde_${dateToAPI(from)}`
          : "todos";

      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName(`OP_${sufijo}`));
      XLSX.writeFile(wb, `ordenes_pago_${sufijo}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, dateRange, showToast, hasMore]);

  /* =========================
     Columnas / grilla
  ========================= */
  const columns = useMemo(() => {
    return [
      {
        key: "fecha",
        label: "FECHA",
        align: "center",
        fr: 0.9,
        render: (r) => safeText(formatFechaDMY(r.fecha)),
      },
      {
        key: "detalle",
        label: "DESCRIPCIÓN",
        fr: 2.3,
        strong: true,
        align: "left",
        render: (r) => safeText(r.detalle ?? r.descripcion ?? r.concepto),
      },
      {
        key: "proveedor",
        label: "PROVEEDOR",
        fr: 1.8,
        align: "center",
        render: (r) => safeText(r.proveedor),
      },
      {
        key: "estado",
        label: "ESTADO",
        align: "center",
        fr: 1.0,
        render: (r) => {
          const pag = isPagado(r);
          return (
            <span className={`mov-chip ${pag ? "mov-chip--ok" : "mov-chip--warn"}`}>
              {pag ? "PAGADO" : "PENDIENTE"}
            </span>
          );
        },
      },
      {
        key: "monto",
        label: "MONTO",
        fr: 1.1,
        align: "center",
        render: (r) => moneyARS(r.monto_total ?? r.total ?? 0),
      },
      { key: "acciones", label: "ACCIONES", fr: 1.4, align: "center", render: () => null },
    ];
  }, []);

  const gridCols = useMemo(() => {
    const fallback = `repeat(${columns.length}, minmax(0, 1fr))`;
    if (!Array.isArray(columns) || !columns.length) return fallback;
    return columns
      .map((c) => {
        const n = Number(c.fr);
        return Number.isFinite(n) && n > 0 ? `${n}fr` : "1fr";
      })
      .join(" ");
  }, [columns]);

  const skelWidths = useMemo(
    () => ({
      fecha: ["44%", "38%", "50%", "42%"],
      detalle: ["72%", "58%", "66%", "48%"],
      proveedor: ["62%", "54%", "46%", "58%"],
      estado: ["52%", "44%", "58%", "50%"],
      monto: ["38%", "30%", "34%", "28%"],
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
            <div key={c.key} className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label={c.label}>
              <div className="mov-skelActions">
                <span className="mov-skelIcon" />
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

  const isAnyLoading = loadingRows || loadingMore || loadingAll;
  const lists = listasCtx || { periodos: [] };

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="mov-page mov-page--ordenesPago">
      {toast && (
        <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />
      )}

      {errorListsCtx && <div className="mov-alert" role="alert">{errorListsCtx}</div>}
      {error && <div className="mov-alert" role="alert">{error}</div>}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div>
              <div className="mov-card__title">Movimientos · Órdenes de Pago (Compras)</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> órdenes
                {loadingAll ? " (cargando…)" : hasMore && filteredRows.length > 0 ? " (hay más)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              {/* ✅ Botón + Calendario (usa rango GLOBAL) */}
              <div className="mov-filter" style={{ position: "relative" }}>
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Fecha
                </label>

                <button
                  type="button"
                  className="mov-btn mov-btn--ghost"
                  style={{ minWidth: 220, justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => setShowCalendario((v) => !v)}
                  disabled={isAnyLoading || loadingListsCtx}
                  title="Seleccionar rango de fechas"
                >
                  {dateRangeLabel}
                </button>

                {showCalendario && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      zIndex: 999,
                      marginTop: 6,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                      borderRadius: 10,
                      background: "var(--color-surface, #fff)",
                    }}
                  >
                    <Calendario
                      value={dateRange}
                      onChange={async (newRange) => {
                        if (newRange?.from && newRange?.to) setShowCalendario(false);
                        await handleDateRangeChange(newRange);
                      }}
                      onClose={() => setShowCalendario(false)}
                    />
                  </div>
                )}
              </div>

              {/* Búsqueda */}
              <div className="mov-search">
                <label>
                  <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                </label>
                <div className="mov-searchInput">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        skipSearchRef.current = true;
                        await loadRows({
                          from: dateRange?.from,
                          to: dateRange?.to,
                          q: e.currentTarget.value,
                          offset: 0,
                          append: false,
                        });
                      }
                    }}
                    placeholder="Buscar por fecha, proveedor, descripción, monto…"
                    disabled={loadingListsCtx || loadingAll}
                  />
                  {q.trim() !== "" && (
                    <button
                      type="button"
                      className="mov-clearSearch"
                      title="Limpiar búsqueda"
                      onClick={async () => {
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        setQ("");
                        skipSearchRef.current = true;
                        await loadRows({
                          from: dateRange?.from,
                          to: dateRange?.to,
                          q: "",
                          offset: 0,
                          append: false,
                        });
                        document.querySelector(".mov-searchInput input")?.focus();
                      }}
                      disabled={loadingAll}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="mov-btn mov-btn--ghost mov-btn--clear mov-btn--excel"
              onClick={exportToExcel}
              disabled={loadingRows || filteredRows.length === 0}
              title={filteredRows.length ? "Exportar a Excel" : "No hay datos para exportar"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar
            </button>
          </div>
        </div>

        {/* HEADER */}
        <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: gridCols }} role="row">
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

        {/* BODY */}
        <div className="mov-tableWrap" role="rowgroup">
          <div className={["mov-gridBody", "mov-gridBody--relative", showSkeleton ? "mov-softLoading" : ""].join(" ")}>
            {showSkeleton ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {visibleRows.map((r) => (
                  <div
                    key={r.id_movimiento}
                    className="mov-gridTable mov-gridTable--row"
                    style={{ gridTemplateColumns: gridCols }}
                    role="row"
                  >
                    {columns.map((c) => {
                      if (c.key === "acciones") {
                        const pag = isPagado(r);
                        const idComp = getIdComprobanteFromRow(r);
                        const hasPdf = pag && idComp > 0;

                        return (
                          <div
                            key={c.key}
                            data-label={c.label}
                            className={["mov-gridCell", "mov-gridCell--actions", "is-center"].join(" ")}
                            role="cell"
                          >
                            <div className="mov-actionsInline">
                              <button
                                type="button"
                                className={`mov-iconBtn ${!hasPdf ? "mov-iconBtn--disabled" : ""}`}
                                title={
                                  hasPdf
                                    ? "Ver comprobante"
                                    : pag
                                    ? "Pagado, pero sin comprobante"
                                    : "Primero confirmá el pago"
                                }
                                onClick={() => hasPdf && openVerModal(r)}
                                disabled={isAnyLoading || loadingListsCtx || !hasPdf}
                              >
                                <FontAwesomeIcon icon={faEye} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn"
                                title={pag ? "Ya está pagada" : "Pagar"}
                                onClick={() => openPagarModal(r)}
                                disabled={isAnyLoading || loadingListsCtx || pag}
                              >
                                <FontAwesomeIcon icon={faMoneyBill1Wave} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn"
                                title="Editar"
                                onClick={() => openEditarModal(r)}
                                disabled={isAnyLoading || loadingListsCtx}
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn mov-iconBtn--danger"
                                title="Eliminar"
                                disabled={isAnyLoading || loadingListsCtx || deletingId === r.id_movimiento}
                                onClick={() => openDeleteModal(r)}
                              >
                                {deletingId === r.id_movimiento ? "..." : <FontAwesomeIcon icon={faTrashCan} />}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      const val = c.render ? c.render(r) : safeText(r[c.key]);
                      return (
                        <div
                          key={c.key}
                          data-label={c.label}
                          className={[
                            "mov-gridCell",
                            c.align === "right" ? "is-right" : "",
                            c.align === "center" ? "is-center" : "",
                            c.strong ? "is-strong" : "",
                          ].filter(Boolean).join(" ")}
                          role="cell"
                          title={typeof val === "string" ? val : undefined}
                        >
                          <span className="mov-ellipsis">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {!isAnyLoading && filteredRows.length === 0 && (
                  <div className="mov-emptyRow">No hay órdenes de pago para mostrar en el rango de fechas seleccionado.</div>
                )}

                {!loadingRows && hasMore && filteredRows.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadAll}
                      disabled={loadingMore || loadingAll || loadingListsCtx}
                      title="Cargar todas las órdenes restantes"
                    >
                      {loadingAll ? "Cargando todas…" : "Cargar todos"}
                    </button>
                  </div>
                )}

                {(loadingMore || loadingAll) && (
                  <div className="mov-skeletonMore" aria-busy="true" aria-label="Cargando más registros">
                    {Array.from({ length: 6 }).map((_, i) => renderSkeletonRow(i))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* MODAL GLOBAL ver comprobante */}
      <ModalVerComprobante open={openVer} url={verUrl} onClose={closeVerModal} title={verTitle} />

      <ModalPagarOrdenesPago
        open={openPagar}
        onClose={closePagarModal}
        proveedor={pagarProveedor}
        deudas={pagarDeudas}
        onToast={showToast}
        onConfirm={onConfirmPago}
        lists={lists}
        onAfterComprobanteSaved={handleAfterComprobanteSaved}
      />

      <ModalEditarOrdenPago
        open={openEditar}
        row={editRow}
        lists={lists}
        periodoDefault={
          dateRange?.from
            ? `${String(dateRange.from.getMonth() + 1).padStart(2, "0")}-${dateRange.from.getFullYear()}`
            : ""
        }
        onClose={closeEditarModal}
        onToast={showToast}
        onSave={onSaveEditar}
      />

      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId === selectedRow?.id_movimiento}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        onToast={showToast}
      />
    </div>
  );
}