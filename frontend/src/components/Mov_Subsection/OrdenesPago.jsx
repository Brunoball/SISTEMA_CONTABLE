// src/components/Movimientos/OrdenesPago.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "../Movimientos/movimientos.css";

// ✅ MODALES
import ModalPagarOrdenesPago from "./modales/ModalPagarOrdenesPago";
import ModalEditarOrdenPago from "./modales/ModalEditarOrdenPago";
import ModalEliminarMovimientos from "../Movimientos/modales/ModalEliminarMovimientos";

// ✅ Toast
import Toast from "../Global/Toast.jsx";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faMagnifyingGlass,
  faFileExcel,
  faPenToSquare,
  faTrashCan,
  faMoneyBill1Wave,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";

// ✅ NUEVO: Listas centralizadas
import { useListas } from "../../context/ListasContext";

/* =========================
   PERF: “Cargar todos”
========================= */
const PAGE_SIZE = 100;

/* =========================
   Skeleton rows
========================= */
const SKELETON_ROWS = 10;

// delay anti “flash” (solo cuando YA hay data previa)
const SKELETON_DELAY_MS = 140;

// (si querés forzar loader en dev)
const FORCE_SHOW_LOADER_DEV = false;

/* =========================
   Helpers
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

/* ✅ Período helpers (UI MM-YYYY) <-> (API YYYY-MM) */
function periodoToMMYYYY(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  let m = "";
  let y = "";

  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    y = parts[0];
    m = parts[1];
  } else if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const parts = s.split(/[-/]/);
    m = parts[0];
    y = parts[1];
  } else if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      y = s.slice(0, 4);
      m = s.slice(4);
    } else {
      m = s.slice(0, 2);
      y = s.slice(2);
    }
  } else {
    return s;
  }

  const mm = String(Number(m)).padStart(2, "0");
  const yyyy = String(y);
  return `${mm}-${yyyy}`;
}

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}\/\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("/");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{1,2}\/\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("/");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      const yyyy = s.slice(0, 4);
      const mm = String(Number(s.slice(4))).padStart(2, "0");
      return `${yyyy}-${mm}`;
    } else {
      const mm = String(Number(s.slice(0, 2))).padStart(2, "0");
      const yyyy = s.slice(2);
      return `${yyyy}-${mm}`;
    }
  }
  return s;
}

/* ✅ Auth */
function getAuthInfo() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();

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

  return { sessionKey, idUsuario };
}

/* =========================
   ✅ FILTRO ORDENES DE PAGO (pendientes)
========================= */
function hasProveedor(row) {
  const idProv = Number(
    row?.id_proveedor ??
      row?.proveedor_id ??
      row?.idProveedor ??
      row?.id_proveedor_fk ??
      0
  );
  if (Number.isFinite(idProv) && idProv > 0) return true;

  const provTxt = String(row?.proveedor ?? "").trim();
  return provTxt.length > 0;
}

function isCuentaCorrienteTipoVenta(row) {
  const label = String(
    row?.tipo_venta ?? row?.tipoVenta ?? row?.condicion_venta ?? ""
  ).trim();
  const s = normalizeSearchText(label);

  if (s.includes("cuenta corriente")) return true;
  if (s.includes("cuenta") && s.includes("corriente")) return true;
  if (s.includes("cta") && s.includes("cte")) return true;
  if (s.includes("ctacte")) return true;

  return false;
}

function isOrdenPagoPendienteRow(row) {
  return hasProveedor(row) && isCuentaCorrienteTipoVenta(row);
}

/* =========================
   Full-text match (front)
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
  parts.push(periodoToMMYYYY(row?.periodo));
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

/* =========================
   Key helpers (para NO parpadeo)
========================= */
function makeKeyFromPeriodoQ(periodoUI, q) {
  const perUI = periodoToMMYYYY(periodoUI);
  if (!perUI) return "";
  const perAPI = periodoToYYYYMM(perUI);
  const qKey = String(q || "").trim();
  return `${perAPI}|${qKey}`;
}
function splitKey(key) {
  const s = String(key || "");
  const idx = s.indexOf("|");
  if (idx === -1) return { periodoAPI: s, qKey: "" };
  return { periodoAPI: s.slice(0, idx), qKey: s.slice(idx + 1) };
}
function yyyymmToMMYYYY(yyyymm) {
  const s = String(yyyymm || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [yyyy, mm] = s.split("-");
    return `${mm}-${yyyy}`;
  }
  return periodoToMMYYYY(s);
}

export default function OrdenesPago() {
  const API = `${BASE_URL}/api.php`;

  // ✅ LISTAS CENTRALIZADAS
  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

  const [rows, setRows] = useState([]);

  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState("");

  // filtros (selección del usuario)
  const [fPeriodo, setFPeriodo] = useState(""); // UI MM-YYYY
  const [q, setQ] = useState("");

  // ✅ “Cargar todos”
  const [showAll, setShowAll] = useState(false);

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // cache por periodoAPI|q
  const cacheRef = useRef(new Map());

  // ✅ anti “respuesta vieja”
  const reqIdRef = useRef(0);

  // ✅ DEDUPE: requests en vuelo por key
  const inflightRef = useRef(new Map()); // key -> { promise, reqId }

  // ✅ Debounce búsqueda
  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);

  // ✅ Skeleton anti-parpadeo
  const skelTimerRef = useRef(null);
  const loadingRef = useRef(false);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // ✅ “dataKey”: key REAL de los datos que se están mostrando
  const [loadedKey, setLoadedKey] = useState("");

  const clearSkeletonTimer = useCallback(() => {
    if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    skelTimerRef.current = null;
  }, []);

  const startSkeleton = useCallback(
    (myReqId) => {
      clearSkeletonTimer();

      const hasAnyData = rows.length > 0 || !!loadedKey;
      const delay = hasAnyData ? SKELETON_DELAY_MS : 0;

      skelTimerRef.current = setTimeout(() => {
        if (loadingRef.current && myReqId === reqIdRef.current) {
          setShowSkeleton(true);
        }
      }, delay);
    },
    [clearSkeletonTimer, rows.length, loadedKey]
  );

  const stopSkeleton = useCallback(() => {
    clearSkeletonTimer();
    setShowSkeleton(false);
  }, [clearSkeletonTimer]);

  useEffect(() => {
    return () => {
      clearSkeletonTimer();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [clearSkeletonTimer]);

  /* =========================
     API helpers (X-Session)
  ========================= */
  const buildHeadersGET = useCallback(() => {
    const { sessionKey } = getAuthInfo();
    const h = {};
    if (sessionKey) h["X-Session"] = sessionKey;
    return h;
  }, []);
  const buildHeaders = useCallback(() => {
    const { sessionKey } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (sessionKey) h["X-Session"] = sessionKey;
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
        headers: buildHeaders(),
        body: JSON.stringify(payload ?? {}),
      });
      return await parseJsonOrThrow(res);
    },
    [buildHeaders, parseJsonOrThrow]
  );

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoToMMYYYY(periodoUI));
    const prefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(prefix)) cacheRef.current.delete(k);
    }
    for (const k of inflightRef.current.keys()) {
      if (String(k).startsWith(prefix)) inflightRef.current.delete(k);
    }
  }, []);

  const currentKey = useMemo(() => makeKeyFromPeriodoQ(fPeriodo, q), [fPeriodo, q]);

  /* =========================
     ✅ Cargar órdenes (listado)
     OBJETIVO:
     - CERO parpadeo: NO vaciar tabla durante cargas
     - DEDUPE: si ya hay request para misma key, NO dispara otra
     - Skeleton: 1ra vez inmediato, después con delay
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const cacheKey = makeKeyFromPeriodoQ(periodoUI, qLocal);

      if (!cacheKey) {
        setRows([]);
        setLoadedKey("");
        setError("");
        setLoadingRows(false);
        loadingRef.current = false;
        stopSkeleton();
        return null;
      }

      // ✅ 1) Cache hit => swap instantáneo, sin loader
      if (cacheRef.current.has(cacheKey) && !FORCE_SHOW_LOADER_DEV) {
        const cached = cacheRef.current.get(cacheKey) || [];
        setError("");
        setRows(cached);
        setLoadedKey(cacheKey);
        return cached;
      }

      // ✅ 2) DEDUPE inflight
      const inflight = inflightRef.current.get(cacheKey);
      if (inflight?.promise) {
        return await inflight.promise;
      }

      // ✅ 3) Fetch real (único por key)
      const myReqId = ++reqIdRef.current;

      loadingRef.current = true;
      setLoadingRows(true);
      setError("");
      startSkeleton(myReqId);

      const { periodoAPI, qKey } = splitKey(cacheKey);

      const promise = (async () => {
        try {
          const sp = new URLSearchParams();
          sp.set("action", "ordenes_pago_listar");
          sp.set("periodo", periodoAPI);
          if (qKey) sp.set("q", qKey);

          const data = await apiGet(`${API}?${sp.toString()}`);
          if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar órdenes de pago.");

          // request vieja => no tocar UI
          if (myReqId !== reqIdRef.current) return null;

          const list = Array.isArray(data.ordenes)
            ? data.ordenes
            : Array.isArray(data.movimientos)
            ? data.movimientos
            : [];

          const norm = list.map((r) => ({
            ...r,
            periodo: periodoToMMYYYY(r?.periodo),
          }));

          cacheRef.current.set(cacheKey, norm);

          setRows(norm);
          setLoadedKey(cacheKey);

          return norm;
        } catch (e) {
          if (myReqId !== reqIdRef.current) return null;
          // ✅ NO vaciamos filas
          setError(e?.message || "Error cargando órdenes de pago.");
          return null;
        } finally {
          if (myReqId === reqIdRef.current) {
            loadingRef.current = false;
            setLoadingRows(false);
            stopSkeleton();
          }
          const curr = inflightRef.current.get(cacheKey);
          if (curr?.reqId === myReqId) inflightRef.current.delete(cacheKey);
        }
      })();

      inflightRef.current.set(cacheKey, { promise, reqId: myReqId });
      return await promise;
    },
    [API, apiGet, fPeriodo, q, startSkeleton, stopSkeleton]
  );

  /* =========================
     INIT: asegurar listas + período default + cargar rows
     ✅ clave: evitar DOBLE recarga por debounce
  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await ensureListsLoaded({ force: false, background: true });
      } catch {}

      if (!alive) return;

      const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos : [];
      const perDefault = periodos[0] || "";

      if (perDefault) {
        skipSearchRef.current = true;
        setQ("");
        setFPeriodo((prev) => prev || perDefault);
        setShowAll(false);

        await loadRows({ periodo: perDefault, q: "" });
      } else {
        setRows([]);
        setLoadedKey("");
        setLoadingRows(false);
        loadingRef.current = false;
        stopSkeleton();
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ sync período si desaparece (y evitar doble)
  useEffect(() => {
    const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos : [];

    if (periodos.length === 0) {
      if (fPeriodo !== "") {
        skipSearchRef.current = true;
        setFPeriodo("");
        setRows([]);
        setShowAll(false);
        setLoadedKey("");
      }
      return;
    }

    const current = periodoToMMYYYY(fPeriodo);
    if (current && !periodos.includes(current)) {
      const next = periodos[0];
      skipSearchRef.current = true;
      setQ("");
      setFPeriodo(next);
      setShowAll(false);
      invalidateCacheForPeriodo(next);
      loadRows({ periodo: next, q: "" });
    }
  }, [listasCtx?.periodos, fPeriodo, invalidateCacheForPeriodo, loadRows]);

  // ✅ debounce búsqueda
  useEffect(() => {
    if (!fPeriodo) return;

    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    setShowAll(false);

    searchTimerRef.current = setTimeout(() => {
      loadRows({ periodo: fPeriodo, q });
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, fPeriodo, loadRows]);

  /* =========================
     Modales
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
        .filter((r) => isOrdenPagoPendienteRow(r));
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
  const [deletingId, setDeletingId] = useState(null);

  const openDeleteModal = useCallback((r) => {
    setSelectedRow(r);
    setOpenDel(true);
  }, []);
  const closeDeleteModal = useCallback(() => {
    setOpenDel(false);
    setSelectedRow(null);
  }, []);

  /* =========================
     Acciones backend (pagar/editar/eliminar)
  ========================= */
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

        invalidateCacheForPeriodo(fPeriodo);
        await loadRows({ periodo: fPeriodo, q });

        await refreshLists?.();
        showToast("exito", data?.mensaje || "Pago confirmado.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error confirmando pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, fPeriodo, invalidateCacheForPeriodo, loadRows, q, refreshLists, showToast]
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

        invalidateCacheForPeriodo(fPeriodo);
        await loadRows({ periodo: fPeriodo, q });

        await refreshLists?.();
        showToast("exito", data?.mensaje || "Orden de pago actualizada.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error guardando orden de pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, fPeriodo, invalidateCacheForPeriodo, loadRows, q, refreshLists, showToast]
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

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q });

      await refreshLists?.();
      showToast("exito", "Orden de pago eliminada.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando orden de pago.");
      showToast("error", e.message || "Error eliminando orden de pago.", 4200);
    } finally {
      setDeletingId(null);
    }
  }, [
    API,
    apiPostJson,
    closeDeleteModal,
    fPeriodo,
    invalidateCacheForPeriodo,
    loadRows,
    q,
    refreshLists,
    selectedRow,
    showToast,
  ]);

  /* =========================
     ✅ Filtrado final
     - SIEMPRE filtra en base a lo que realmente está cargado (loadedKey)
  ========================= */
  const displayKey = loadedKey || currentKey;
  const display = useMemo(() => splitKey(displayKey), [displayKey]);

  const filteredRows = useMemo(() => {
    const fPer = yyyymmToMMYYYY(display?.periodoAPI);
    if (!fPer) return [];

    const displayQ = display?.qKey || "";

    return (Array.isArray(rows) ? rows : [])
      .filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(periodoToMMYYYY(fPer)))
      .filter((r) => isOrdenPagoPendienteRow(r))
      .filter((r) => rowMatchesQuery(r, displayQ));
  }, [rows, display]);

  const visibleRows = useMemo(() => {
    if (showAll) return filteredRows;
    return filteredRows.slice(0, PAGE_SIZE);
  }, [filteredRows, showAll]);

  const totalPendientes = filteredRows.length;
  const mostrando = visibleRows.length;
  const hayMas = !showAll && totalPendientes > PAGE_SIZE;

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
        fr: 2.4,
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
        key: "monto",
        label: "MONTO",
        fr: 1.1,
        align: "center",
        render: (r) => moneyARS(r.monto_total ?? r.total ?? 0),
      },
      { key: "acciones", label: "ACCIONES", fr: 0.8, align: "center", render: () => null },
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

  const skelWidths = useMemo(() => {
    return {
      fecha: ["44%", "38%", "50%", "42%"],
      detalle: ["72%", "58%", "66%", "48%"],
      proveedor: ["62%", "54%", "46%", "58%"],
      monto: ["38%", "30%", "34%", "28%"],
    };
  }, []);

  const renderSkeletonRow = (idx) => {
    return (
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
  };

  /* =========================
     Excel
  ========================= */
  const exportToExcel = useCallback(() => {
    try {
      if (!filteredRows.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      const dataToExport = filteredRows.map((r) => ({
        FECHA: safeText(formatFechaDMY(r.fecha)),
        PERIODO: safeText(periodoToMMYYYY(r.periodo)),
        DESCRIPCION: safeText(r.detalle ?? r.descripcion ?? r.concepto),
        PROVEEDOR: safeText(r.proveedor),
        MONTO: Number(r.monto_total ?? r.total ?? 0) || 0,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToExport);

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName(`OP_Pend_${per}`));

      XLSX.writeFile(wb, `ordenes_pago_pendientes_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast]);

  const lists = listasCtx || { periodos: [] };

  const softLoading = loadingRows && showSkeleton;

  const handleChangePeriodo = async (valueUI) => {
    const ui = periodoToMMYYYY(valueUI);

    skipSearchRef.current = true;

    setFPeriodo(ui);
    setQ("");
    setShowAll(false);

    await loadRows({ periodo: ui, q: "" });
  };

  const onClickCargarTodos = () => setShowAll(true);

  // ✅ Mensaje vacío SOLO cuando:
  // - NO está cargando
  // - la key actual YA fue cargada (loadedKey === currentKey)
  // - y no hay filas
  const canShowEmpty =
    !loadingRows && loadedKey !== "" && loadedKey === currentKey && filteredRows.length === 0;

  return (
    <div className="mov-page mov-page--ordenesPago">
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
            <div>
              <div className="mov-card__title">Movimientos · Órdenes de Pago</div>

              <div className="mov-card__hint">
                Mostrando <b>{mostrando}</b>
                {hayMas ? (
                  <>
                    {" "}
                    de <b>{totalPendientes}</b> pendientes
                  </>
                ) : (
                  <>
                    {" "}
                    pendientes (<b>{totalPendientes}</b>)
                  </>
                )}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="mov-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select
                  value={periodoToMMYYYY(fPeriodo)}
                  onChange={(e) => handleChangePeriodo(e.target.value)}
                  disabled={loadingRows || loadingListsCtx}
                >
                  {(lists.periodos || []).map((p) => {
                    const ui = periodoToMMYYYY(p);
                    return (
                      <option key={ui} value={ui}>
                        {ui}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="mov-search">
                <label>
                  <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                </label>

                <div className="mov-searchInput">
                  <input
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setShowAll(false);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        skipSearchRef.current = true;
                        setShowAll(false);
                        await loadRows({ periodo: fPeriodo, q: e.currentTarget.value });
                      }
                    }}
                    placeholder="Buscar por fecha, proveedor, descripción, monto…"
                    disabled={loadingListsCtx}
                  />

                  {q.trim() !== "" && (
                    <button
                      type="button"
                      className="mov-clearSearch"
                      title="Limpiar búsqueda"
                      onClick={async () => {
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        skipSearchRef.current = true;
                        setQ("");
                        setShowAll(false);
                        await loadRows({ periodo: fPeriodo, q: "" });
                        document.querySelector(".mov-searchInput input")?.focus();
                      }}
                      disabled={loadingListsCtx}
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
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
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
          <div
            className={[
              "mov-gridBody",
              "mov-gridBody--relative",
              softLoading ? "mov-softLoading" : "",
            ].join(" ")}
            style={{ position: "relative" }}
          >
            {/* ✅ siempre renderizamos filas (cero parpadeo) */}
            {visibleRows.map((r) => (
              <div
                key={r.id_movimiento}
                className="mov-gridTable mov-gridTable--row"
                style={{ gridTemplateColumns: gridCols }}
                role="row"
              >
                {columns.map((c) => {
                  if (c.key === "acciones") {
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
                            className="mov-iconBtn"
                            title="Pagar"
                            onClick={() => openPagarModal(r)}
                            disabled={loadingRows || loadingListsCtx}
                          >
                            <FontAwesomeIcon icon={faMoneyBill1Wave} />
                          </button>

                          <button
                            type="button"
                            className="mov-iconBtn"
                            title="Editar"
                            onClick={() => openEditarModal(r)}
                            disabled={loadingRows || loadingListsCtx}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>

                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            title="Eliminar"
                            disabled={loadingRows || loadingListsCtx || deletingId === r.id_movimiento}
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
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role="cell"
                      title={typeof val === "string" ? val : undefined}
                    >
                      <span className="mov-ellipsissss">{val}</span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ✅ BOTÓN CARGAR TODOS */}
            {!loadingRows && hayMas && (
              <div style={{ padding: "12px 10px", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  className="mov-btn mov-btn--loadAll"
                  onClick={onClickCargarTodos}
                  title={`Cargar todos (${totalPendientes - PAGE_SIZE} más)`}
                >
                  Cargar todos ({totalPendientes - PAGE_SIZE} más)
                </button>
              </div>
            )}

            {/* ✅ EMPTY */}
            {canShowEmpty && (
              <div className="mov-emptyRow">
                {!fPeriodo
                  ? "No hay período disponible para cargar órdenes de pago."
                  : "No hay órdenes de pago pendientes (Cuenta Corriente) en este período."}
              </div>
            )}

            {/* ✅ SKELETON OVERLAY */}
            {showSkeleton && loadingRows && (
              <div
                className="mov-skeletonWrap"
                aria-busy="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  paddingTop: 0,
                  pointerEvents: "none",
                }}
              >
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MODAL PAGAR */}
      <ModalPagarOrdenesPago
        open={openPagar}
        onClose={closePagarModal}
        proveedor={pagarProveedor}
        deudas={pagarDeudas}
        onToast={showToast}
        onConfirm={onConfirmPago}
      />

      {/* MODAL EDITAR */}
      <ModalEditarOrdenPago
        open={openEditar}
        row={editRow}
        lists={listasCtx || {}}
        periodoDefault={fPeriodo}
        onClose={closeEditarModal}
        onToast={showToast}
        onSave={onSaveEditar}
      />

      {/* DELETE */}
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
