// ✅ REEMPLAZAR COMPLETO
// src/components/Movimientos/Ventas.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../../config/config.jsx";
import "../../Global/Global_css/Global_Section.css";

import Toast from "../../Global/Toast.jsx";

// (no lo usamos en esta tabla, pero lo dejás si querés)
import GifCarga from "../../Global/Gif_Carga.jsx";
import "../../Global/gif_carga.css";

import ModalNuevaVenta from "./modales/ModalNuevaVenta.jsx";
import ModalEditarVenta from "./modales/ModalEditarVenta.jsx";
import ModalEliminarMovimientos from "../../Movimientos/modales/ModalEliminarMovimientos.jsx";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faMagnifyingGlass,
  faPlus,
  faFileExcel,
  faPenToSquare,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";
import { useListas } from "../../../context/ListasContext.jsx";

/* =========================
   PERF
========================= */
const MIN_LOADING_MS = 0;
const FORCE_SHOW_LOADER_DEV = false;
const PAGE_SIZE = 100;
const PROBE_LIMIT = PAGE_SIZE + 1;
const SKELETON_ROWS = 10;

/* =========================
   Helpers
========================= */
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
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
   Período helpers
========================= */
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
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { token, sessionKey, idUsuario };
}

/* =========================
   ✅ ID robusto
========================= */
function getMovimientoId(r) {
  const cand =
    r?.id_movimiento ??
    r?.idMovimiento ??
    r?.id_mov ??
    r?.id ??
    r?.id_venta ??
    r?.idVenta ??
    r?.venta_id ??
    r?.movimiento_id ??
    r?.id_movimiento_fk ??
    null;

  const n = Number(cand);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}
function getRowKey(r) {
  const id = getMovimientoId(r);
  if (id) return `id:${id}`;

  const f = String(r?.fecha ?? "").trim();
  const c = String(r?.cliente ?? r?.cliente_nombre ?? "").trim();
  const d = String(r?.detalle ?? r?.descripcion ?? r?.concepto ?? "").trim();
  const m = String(Number(r?.monto_total ?? r?.total ?? r?.total_general ?? 0) || 0);
  return `fx:${f}|${c}|${d}|${m}`;
}

/* =========================
   ✅ FILTRO VENTAS
========================= */
function hasCliente(r) {
  const idCli = Number(r?.id_cliente ?? r?.cliente_id ?? r?.idCliente ?? r?.id_cliente_fk ?? 0);
  if (Number.isFinite(idCli) && idCli > 0) return true;

  const cliTxt = String(
    r?.cliente ?? r?.cliente_nombre ?? r?.nombre_cliente ?? r?.razon_social_cliente ?? ""
  ).trim();
  return cliTxt.length > 0;
}
function hasTipoVentaText(r) {
  const tv = String(r?.pago_tipo_venta ?? r?.tipo_venta ?? "").trim();
  return tv.length > 0;
}
function hasTipoVentaId(r) {
  const id = Number(r?.id_tipo_venta ?? r?.tipo_venta_id ?? 0);
  return Number.isFinite(id) && id > 0;
}
function isSalida(r) {
  const tmTxt = normalizeSearchText(r?.tipo_movimiento ?? r?.pago_tipo_movimiento ?? "");
  if (tmTxt.includes("salida")) return true;

  const id = Number(r?.id_tipo_movimiento ?? r?.tipo_movimiento_id ?? 0);
  return Number.isFinite(id) && id > 0;
}
function isVentaRow(row) {
  if (!hasCliente(row)) return false;
  if (hasTipoVentaText(row)) return true;
  if (hasTipoVentaId(row)) return true;
  return isSalida(row);
}

/* =========================
   Normalizador
========================= */
function normalizeVentaRow(r) {
  const cliente =
    r?.cliente ?? r?.cliente_nombre ?? r?.nombre_cliente ?? r?.razon_social_cliente ?? "";

  const tipoVentaTxt = r?.pago_tipo_venta ?? r?.tipo_venta ?? "";
  const medioPagoNombre = r?.medio_pago_nombre ?? r?.medio_pago ?? r?.pago_medio_pago ?? "";

  const idMov = getMovimientoId(r);

  return {
    ...r,
    id_movimiento: idMov ?? r?.id_movimiento ?? null,
    periodo: periodoToMMYYYY(r?.periodo),
    fecha: r?.fecha,
    cliente: String(cliente ?? "").trim() || "",
    pago_tipo_venta: String(tipoVentaTxt ?? "").trim() || "",
    medio_pago_nombre: String(medioPagoNombre ?? "").trim() || "",
  };
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
  parts.push(periodoToMMYYYY(row?.periodo));
  parts.push(String(montoNum), String(Math.trunc(montoNum)), moneyARS(montoNum));

  const hay = normalizeSearchText(parts.join(" | "));
  return hay.includes(qq);
}

/* =========================
   Excel
========================= */
function slugifySheetName(name) {
  const s = String(name || "Ventas")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Ventas").slice(0, 31);
}

export default function Ventas() {
  const API = `${BASE_URL}/api.php`;

  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

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

  const [fPeriodo, setFPeriodo] = useState(""); // UI MM-YYYY
  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

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

  const refreshPeriodos = useCallback(async () => {
    try {
      await refreshLists();
    } catch {}
  }, [refreshLists]);

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoToMMYYYY(periodoUI));
    const prefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(prefix)) cacheRef.current.delete(k);
    }
  }, []);

  /* =========================
     LOAD ROWS (paginado)
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

      const perUI = periodoToMMYYYY(periodoUI);
      if (!perUI) {
        rowsRef.current = [];
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setLoadingMore(false);
        setLoadingAll(false);
        setError("");
        return { hasMore: false, nextOffset: null, received: 0 };
      }

      const periodoAPI = periodoToYYYYMM(perUI);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${periodoAPI}|${qKey}`;

      const myReqId = ++reqIdRef.current;
      const start = Date.now();

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
        sp.set("action", "ventas_listar");
        sp.set("periodo", periodoAPI);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PROBE_LIMIT));
        sp.set("offset", String(offset));

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar ventas.");

        if (myReqId !== reqIdRef.current) return null;

        const listKey = Array.isArray(data.ventas)
          ? "ventas"
          : Array.isArray(data.movimientos)
          ? "movimientos"
          : "ventas";

        const rawArr = Array.isArray(data[listKey]) ? data[listKey] : [];
        const normAll = rawArr.map(normalizeVentaRow);

        let newHasMore = data.has_more !== undefined ? !!data.has_more : normAll.length > PAGE_SIZE;

        let newNextOffset =
          data.next_offset !== undefined && data.next_offset !== null
            ? Number(data.next_offset)
            : newHasMore
            ? offset + PAGE_SIZE
            : null;

        const page = newHasMore ? normAll.slice(0, PAGE_SIZE) : normAll;

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        return await new Promise((resolve) => {
          const apply = () => {
            if (myReqId !== reqIdRef.current) return resolve(null);

            if (append) {
              const base = Array.isArray(rowsRef.current) ? rowsRef.current : [];
              const seen = new Set(base.map((x) => getRowKey(x)));

              const add = page.filter((x) => {
                const k = getRowKey(x);
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

            resolve({
              hasMore: newHasMore,
              nextOffset: newNextOffset,
              received: page.length,
            });
          };

          if (remaining > 0) setTimeout(apply, remaining);
          else apply();
        });
      } catch (e) {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        return await new Promise((resolve) => {
          setTimeout(() => {
            if (myReqId !== reqIdRef.current) return resolve(null);

            setError(e.message || "Error cargando ventas.");

            if (append) {
              if (moreReqIdRef.current === myReqId) setLoadingMore(false);
            } else {
              if (rowsReqIdRef.current === myReqId) setLoadingRows(false);
            }

            resolve(null);
          }, remaining);
        });
      }
    },
    [API, apiGet, fPeriodo, q]
  );

  /* =========================
     INIT
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
        setFPeriodo((prev) => prev || perDefault);
        await loadRows({ periodo: perDefault, q: "", offset: 0, append: false });
      } else {
        rowsRef.current = [];
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ sync período si desaparece
  useEffect(() => {
    const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos : [];

    if (periodos.length === 0) {
      if (fPeriodo !== "") {
        setFPeriodo("");
        rowsRef.current = [];
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
      }
      return;
    }

    const current = periodoToMMYYYY(fPeriodo);
    if (current && !periodos.includes(current)) {
      const next = periodos[0];
      setFPeriodo(next);
      invalidateCacheForPeriodo(next);
      loadRows({ periodo: next, q: "", offset: 0, append: false });
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

    searchTimerRef.current = setTimeout(() => {
      loadRows({ periodo: fPeriodo, q, offset: 0, append: false });
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, fPeriodo, loadRows]);

  /* =========================
     Filtrado client-side
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];

    return (Array.isArray(rows) ? rows : [])
      .filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer))
      .filter((r) => isVentaRow(r))
      .filter((r) => rowMatchesQuery(r, q));
  }, [rows, fPeriodo, q]);

  /* =========================
     Columnas
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
        fr: 2.2,
        strong: true,
        align: "left",
        render: (r) => safeText(r.detalle ?? r.descripcion ?? r.concepto),
      },
      {
        key: "cliente",
        label: "CLIENTE",
        fr: 1.6,
        align: "center",
        render: (r) => safeText(r.cliente),
      },
      {
        key: "pago",
        label: "PAGO",
        fr: 1.2,
        align: "center",
        render: (r) => {
          const tv = String(r.pago_tipo_venta ?? r.tipo_venta ?? "").trim();
          if (tv) return tv;
          const id = Number(r.id_tipo_venta ?? 0);
          return Number.isFinite(id) && id > 0 ? `ID ${id}` : "—";
        },
      },
      {
        key: "medio_pago_nombre",
        label: "MEDIO DE PAGO",
        fr: 1.4,
        align: "center",
        render: (r) => {
          const pago = normalizeSearchText(r.pago_tipo_venta ?? r.tipo_venta);
          if (pago.includes("contado")) return safeText(r.medio_pago_nombre);
          return "—";
        },
      },
      {
        key: "total",
        label: "TOTAL",
        fr: 1.1,
        align: "center",
        render: (r) => moneyARS(r.monto_total ?? r.total ?? r.total_general ?? 0),
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

  /* =========================
     Excel “Ventas”
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
          "Ojo: faltan registros sin cargar. Si querés exportar todo, tocá “Cargar todos” primero.",
          5200
        );
      }

      const dataToExport = filteredRows.map((r) => {
        const pago = safeText(r.pago_tipo_venta ?? r.tipo_venta);
        const pagoNorm = normalizeSearchText(pago);

        const medioPago = pagoNorm.includes("contado") ? safeText(r.medio_pago_nombre) : "—";

        return {
          FECHA: safeText(formatFechaDMY(r.fecha)),
          DESCRIPCION: safeText(r.detalle ?? r.descripcion ?? r.concepto),
          CLIENTE: safeText(r.cliente),
          PAGO: pago || "—",
          MEDIO_DE_PAGO: medioPago,
          TOTAL: Number(r.monto_total ?? r.total ?? 0) || 0,
        };
      });

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

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName(`Ventas_${per}`));
      XLSX.writeFile(wb, `ventas_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast, hasMore]);

  /* =========================
     Guardar / eliminar
  ========================= */
  const apiPostSave = async (payload, isEdit) => {
    setError("");
    const { idUsuario } = getAuthInfo();
    const action = isEdit ? "ventas_actualizar" : "ventas_crear";

    const payloadNorm = {
      ...(payload || {}),
      periodo: periodoToYYYYMM(payload?.periodo),
    };

    const data = await apiPostJson(`${API}?action=${action}`, {
      ...payloadNorm,
      idUsuario,
    });

    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar.");
    return data;
  };

  const confirmDelete = async () => {
    if (!selectedRow?.id_movimiento) return;

    const id = selectedRow.id_movimiento;
    setDeletingId(id);
    setError("");
    showToast("cargando", "Eliminando venta…", 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const sp = new URLSearchParams();
      sp.set("action", "ventas_eliminar");
      sp.set("id_movimiento", String(id));

      const data = await apiPostJson(`${API}?${sp.toString()}`, { idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");

      setOpenDel(false);
      setSelectedRow(null);

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });

      await refreshPeriodos();
      showToast("exito", "Venta eliminada.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando venta.");
      showToast("error", e.message || "Error eliminando venta.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  /* =========================
     ✅ "Cargar todos"
  ========================= */
  const handleLoadAll = useCallback(async () => {
    if (!hasMore || loadingMore || loadingRows || loadingListsCtx || loadingAll) return;
    if (nextOffset === null) return;

    setLoadingAll(true);
    showToast("cargando", "Cargando todas las ventas…", 12000);

    let offset = nextOffset;
    let guard = 0;

    try {
      while (offset !== null && guard < 3000) {
        const currentPer = periodoToMMYYYY(fPeriodo);
        const currentQ = (q || "").trim();

        const beforeLen = rowsRef.current.length;

        const res = await loadRows({
          periodo: currentPer,
          q: currentQ,
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
      showToast("exito", `Listo: se cargaron ${rowsRef.current.length} ventas.`, 2600);
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
    fPeriodo,
    q,
    loadRows,
    showToast,
  ]);

  const softLoading = loadingRows;

  const skelWidths = useMemo(() => {
    return {
      fecha: ["44%", "38%", "40%", "36%"],
      detalle: ["72%", "58%", "66%", "48%"],
      cliente: ["62%", "54%", "46%", "58%"],
      pago: ["44%", "34%", "40%", "30%"],
      medio_pago_nombre: ["52%", "44%", "48%", "36%"],
      total: ["38%", "30%", "34%", "28%"],
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

  const lists =
    listasCtx || {
      periodos: [],
      clientes: [],
      medios_pago: [],
      tipos_venta: [],
      clasificaciones: [],
      cuentas_corrientes: [],
      detalles: [],
      proveedores: [],
      tipos_movimiento: [],
    };

  const isAnyLoading = loadingRows || loadingMore || loadingAll;

  return (
    <div className="mov-page">
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
              <div className="mov-card__title">Movimientos · Ventas</div>

              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> ventas
                {loadingAll ? " (cargando…)" : hasMore && filteredRows.length > 0 ? " (hay más)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="mov-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select
                  value={periodoToMMYYYY(fPeriodo)}
                  onChange={async (e) => {
                    const ui = periodoToMMYYYY(e.target.value);
                    setFPeriodo(ui);
                    setQ("");
                    skipSearchRef.current = true;

                    invalidateCacheForPeriodo(ui);
                    await loadRows({ periodo: ui, q: "", offset: 0, append: false });
                  }}
                  disabled={loadingRows || loadingListsCtx || loadingMore || loadingAll}
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
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        skipSearchRef.current = true;

                        await loadRows({
                          periodo: fPeriodo,
                          q: e.currentTarget.value,
                          offset: 0,
                          append: false,
                        });
                      }
                    }}
                    placeholder="Buscar por fecha, cliente, descripción, monto…"
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

                        await loadRows({ periodo: fPeriodo, q: "", offset: 0, append: false });
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

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={() => {
                if (loadingListsCtx)
                  showToast?.("cargando", "Cargando listas… podés ir completando igual.", 2400);
                setOpenAdd(true);
              }}
              title="Crear nuevo movimiento"
            >
              <FontAwesomeIcon icon={faPlus} /> Nueva Venta
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
          <div className={["mov-gridBody", "mov-gridBody--relative", softLoading ? "mov-softLoading" : ""].join(" ")}>
            {showSkeleton ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {filteredRows.map((r) => {
                  const key = getRowKey(r);
                  return (
                    <div
                      key={key}
                      className="mov-gridTable mov-gridTable--row"
                      style={{ gridTemplateColumns: gridCols }}
                      role="row"
                    >
                      {columns.map((c) => {
                        if (c.key === "acciones") {
                          return (
                            <div
                              key={c.key}
                              className={["mov-gridCell", "mov-gridCell--actions", "is-center"].join(" ")}
                              role="cell"
                              data-label={c.label}
                            >
                              <div className="mov-actionsInline">
                                <button
                                  type="button"
                                  className="mov-iconBtn"
                                  title="Editar"
                                  onClick={() => {
                                    setSelectedRow(r);
                                    setOpenEdit(true);
                                  }}
                                  disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx}
                                >
                                  <FontAwesomeIcon icon={faPenToSquare} />
                                </button>

                                <button
                                  type="button"
                                  className="mov-iconBtn mov-iconBtn--danger"
                                  title="Eliminar"
                                  disabled={
                                    loadingRows ||
                                    loadingMore ||
                                    loadingAll ||
                                    loadingListsCtx ||
                                    deletingId === r.id_movimiento
                                  }
                                  onClick={() => {
                                    setSelectedRow(r);
                                    setOpenDel(true);
                                  }}
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

                {!isAnyLoading && filteredRows.length === 0 && (
                  <div className="mov-emptyRow">
                    {!fPeriodo
                      ? "No hay período disponible para cargar ventas."
                      : "No hay ventas para mostrar en este período."}
                  </div>
                )}

                {!loadingRows && hasMore && filteredRows.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadAll}
                      disabled={loadingMore || loadingAll || loadingListsCtx}
                      title="Cargar todas las ventas restantes"
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

      {/* ✅ MODAL NUEVA VENTA */}
      <ModalNuevaVenta
        open={openAdd}
        lists={lists}
        periodoDefault={fPeriodo}
        onClose={() => setOpenAdd(false)}
        onToast={showToast}
        onSaved={async (info) => {
          // ✅ FIX CLAVE:
          // - cuando NO había periodos / registros, fPeriodo era "".
          // - ahora el modal SIEMPRE nos devuelve periodoUI.
          try {
            const uiFromModal = periodoToMMYYYY(info?.periodoUI || "");
            const ui = uiFromModal || periodoToMMYYYY(fPeriodo) || "";

            setOpenAdd(false);
            setQ("");
            skipSearchRef.current = true;

            // refrescá listas (para que aparezca el período en el select)
            await refreshPeriodos();

            // fijá período y recargá
            if (ui) setFPeriodo(ui);
            invalidateCacheForPeriodo(ui);
            await loadRows({ periodo: ui, q: "", offset: 0, append: false });

            showToast("exito", "Venta guardada y tabla actualizada.", 2400);
          } catch (e) {
            showToast("error", e?.message || "Se guardó, pero falló la recarga.", 4200);
          }
        }}
      />

      {/* MODAL EDITAR */}
      <ModalEditarVenta
        open={openEdit}
        lists={lists}
        row={selectedRow}
        periodoDefault={fPeriodo}
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onToast={showToast}
        onSave={async (payload) => {
          try {
            showToast("cargando", "Guardando cambios…", 12000);
            await apiPostSave(payload, true);

            invalidateCacheForPeriodo(fPeriodo);
            await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });

            await refreshPeriodos();

            setOpenEdit(false);
            setSelectedRow(null);
            showToast("exito", "Venta actualizada.", 2600);
          } catch (e) {
            showToast("error", e?.message || "Error actualizando venta.", 4200);
            throw e;
          }
        }}
      />

      {/* DELETE */}
      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId === selectedRow?.id_movimiento}
        onClose={() => {
          setOpenDel(false);
          setSelectedRow(null);
        }}
        onConfirm={confirmDelete}
        onToast={showToast}
      />
    </div>
  );
}