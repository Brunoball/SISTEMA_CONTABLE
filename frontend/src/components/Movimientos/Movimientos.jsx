// src/components/Movimientos/Movimientos.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "../Global/Global_css/Global_Section.css";
import "../Global/Global_css/Global_responsive.css";

// MODALES
import ModalEditarMovimiento from "./modales/ModalEditarMovimiento";
import ModalEliminarMovimientos from "./modales/ModalEliminarMovimientos";

// ✅ FACTURACIÓN: AHORA VA EL MODAL PADRE, NO EL BUSCADOR SOLO
import ModalFacturaBalto from "../Mov_Subsection/Facturacion/ModalFacturaBalto.jsx";

// Toast global
import Toast from "../Global/Toast.jsx";

// Calendario
import Calendario from "../Global/Calendario/Calendario.jsx";

// ✅ BOTÓN EXPORTAR GLOBAL
import BotonExportar from "../Global/Boton_Exportar/BotonExportar.jsx";

// ✅ CONTEXTO GLOBAL DE FECHAS
import { useDateRange } from "../../context/DateRangeContext";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faTrashCan,
  faMagnifyingGlass,
  faCalendarDays,
  faFileExcel,
  faFileInvoiceDollar,
  faChevronDown,
  faArrowRightLong,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";

import { useListas } from "../../context/ListasContext";

/* =========================
   Config
========================= */
const MIN_LOADING_MS = 0;
const FORCE_SHOW_LOADER_DEV = false;
const PAGE_SIZE = 100;
const SKELETON_ROWS = 10;

/* =========================
   Date helpers
========================= */
function formatDateISO(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(d) {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}/${d.getFullYear()}`;
}

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
  return s ? s : "-";
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
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    return `${String(Number(m1[3])).padStart(2, "0")}/${String(Number(m1[2])).padStart(
      2,
      "0"
    )}/${m1[1]}`;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    return `${String(Number(m2[1])).padStart(2, "0")}/${String(Number(m2[2])).padStart(
      2,
      "0"
    )}/${m2[3]}`;
  }
  return s;
}

function periodoToMMYYYY(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  let m = "";
  let y = "";

  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const p = s.split(/[-/]/);
    y = p[0];
    m = p[1];
  } else if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const p = s.split(/[-/]/);
    m = p[0];
    y = p[1];
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

  return `${String(Number(m)).padStart(2, "0")}-${y}`;
}

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    return `${yyyy}-${String(Number(mmRaw)).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    return `${yyyy}-${String(Number(mmRaw)).padStart(2, "0")}`;
  }
  return s;
}

/* Auth */
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

/* Excel / export */
function slugifySheetName(name) {
  const s = String(name || "Movimientos")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (s || "Movimientos").slice(0, 31);
}

function buildExportRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const total = pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0);
    const cliente = safeText(pick(r, ["cliente", "nombre_cliente", "razon_social_cliente"], ""));
    const proveedor = safeText(
      pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], "")
    );
    const tercero = cliente !== "-" ? cliente : proveedor;

    return {
      FECHA: safeText(formatFechaDMY(pick(r, ["fecha", "fecha_movimiento", "created_at"], ""))),
      DESCRIPCION: safeText(
        pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")
      ),
      "TIPO PAGO": safeText(
        pick(r, ["medio_pago_nombre", "medio_pago", "tipo_pago", "forma_pago"], "")
      ),
      "CLIENTE/PROVEEDOR": tercero,
      TOTAL: numOrZero(total),
    };
  });
}

function escapeCSV(value) {
  const s = String(value ?? "");
  if (/[",;\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
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

export default function Movimientos() {
  const API = `${BASE_URL}/api.php`;

  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
  } = useListas();

  const { dateRange, setDateRange } = useDateRange();

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const [calOpen, setCalOpen] = useState(false);

  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // ✅ FACTURACIÓN
  const [openFacturar, setOpenFacturar] = useState(false);
  const [factData, setFactData] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => setToast({ tipo, mensaje, duracion }),
    []
  );
  const closeToast = useCallback(() => setToast(null), []);

  const cacheRef = useRef(new Map());
  const reqIdRef = useRef(0);
  const rowsReqIdRef = useRef(0);
  const moreReqIdRef = useRef(0);
  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);
  const loadAllTokenRef = useRef(0);

  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    []
  );

const rangeLabel = useMemo(() => {
  const { from, to } = dateRange;

  if (!from) return "Seleccionar período";

  if (!to || formatDateISO(from) === formatDateISO(to)) {
    return formatDateLabel(from);
  }

  return (
    <>
      <span>{formatDateLabel(from)}</span>
      <span className="cc-rangeArrow">
        <FontAwesomeIcon icon={faArrowRightLong} />
      </span>
      <span>{formatDateLabel(to)}</span>
    </>
  );
}, [dateRange]);

  const exportBaseName = useMemo(() => {
    const from = formatDateISO(dateRange?.from);
    const to = formatDateISO(dateRange?.to || dateRange?.from);
    return `movimientos_${from}_${to}`;
  }, [dateRange]);

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

  const loadRows = useCallback(
    async (opts = {}) => {
      const range = opts.dateRange ?? dateRange;
      const qLocal = typeof opts.q === "string" ? opts.q : q;
      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

      if (!range?.from) {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setLoadingMore(false);
        setLoadingAll(false);
        setShowSkeleton(false);
        setError("");
        return { hasMore: false, nextOffset: null, received: 0 };
      }

      const desde = formatDateISO(range.from);
      const hasta = formatDateISO(range.to || range.from);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${desde}|${hasta}|${qKey}`;
      const myReqId = ++reqIdRef.current;

      if (
        !append &&
        offset === 0 &&
        cacheRef.current.has(cacheKey) &&
        !FORCE_SHOW_LOADER_DEV
      ) {
        const cached = cacheRef.current.get(cacheKey);
        rowsReqIdRef.current = myReqId;
        setShowSkeleton(false);
        setLoadingRows(false);
        setRows(Array.isArray(cached?.rows) ? cached.rows : []);
        setHasMore(!!cached?.hasMore);
        setNextOffset(cached?.nextOffset ?? null);
        setError("");
        return {
          hasMore: !!cached?.hasMore,
          nextOffset: cached?.nextOffset ?? null,
          received: Array.isArray(cached?.rows) ? cached.rows.length : 0,
        };
      }

      if (!append) {
        rowsReqIdRef.current = myReqId;
        setShowSkeleton(true);
        setLoadingRows(true);
      } else {
        moreReqIdRef.current = myReqId;
        setLoadingMore(true);
      }

      setError("");
      const start = Date.now();

      try {
        const sp = new URLSearchParams();
        sp.set("action", "movimientos_listar");
        sp.set("fecha_desde", desde);
        sp.set("fecha_hasta", hasta);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PAGE_SIZE));
        sp.set("offset", String(offset));
        sp.set("include_total", "0");

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar movimientos.");

        if (myReqId !== reqIdRef.current) return null;

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
        const movsNorm = movs.map((r) => ({ ...r, periodo: periodoToMMYYYY(r?.periodo) }));

        const newHasMore = !!data.has_more;
        const newNextOffset =
          data.next_offset !== undefined && data.next_offset !== null
            ? Number(data.next_offset)
            : null;

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        return await new Promise((resolve) => {
          const apply = () => {
            if (myReqId !== reqIdRef.current) return resolve(null);

            if (append) {
              setRows((prev) => {
                const base = Array.isArray(prev) ? prev : [];
                const seen = new Set(base.map((x) => String(x?.id_movimiento)));
                return [...base, ...movsNorm.filter((x) => !seen.has(String(x?.id_movimiento)))];
              });
            } else {
              setRows(movsNorm);
            }

            setHasMore(newHasMore);
            setNextOffset(newNextOffset);

            if (!append && offset === 0) {
              cacheRef.current.set(cacheKey, {
                rows: movsNorm,
                hasMore: newHasMore,
                nextOffset: newNextOffset,
              });
            }

            if (append) {
              if (moreReqIdRef.current === myReqId) setLoadingMore(false);
            } else {
              if (rowsReqIdRef.current === myReqId) {
                setLoadingRows(false);
                setShowSkeleton(false);
              }
            }

            resolve({
              hasMore: newHasMore,
              nextOffset: newNextOffset,
              received: movsNorm.length,
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
            setError(e?.message || "Error cargando movimientos.");
            if (append) {
              if (moreReqIdRef.current === myReqId) setLoadingMore(false);
            } else {
              if (rowsReqIdRef.current === myReqId) {
                setLoadingRows(false);
                setShowSkeleton(false);
              }
            }
            resolve(null);
          }, remaining);
        });
      }
    },
    [API, apiGet, dateRange, q]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureListsLoaded({ force: false, background: true }).catch(() => null);
      if (!alive) return;
      await loadRows({ dateRange, q: "", offset: 0, append: false });
    })();
    return () => {
      alive = false;
    };
  }, [ensureListsLoaded, loadRows, dateRange]);

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
  }, [q, dateRange, loadRows]);

  const invalidateCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const handleRangeChange = useCallback(
    (range) => {
      setDateRange(range);
      setQ("");
      skipSearchRef.current = true;
      loadAllTokenRef.current += 1;
      invalidateCache();
      if (range.from && range.to) {
        setCalOpen(false);
        loadRows({ dateRange: range, q: "", offset: 0, append: false });
      }
    },
    [setDateRange, loadRows, invalidateCache]
  );

  const filteredRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const columns = useMemo(
    () => [
      {
        key: "descripcion",
        label: "DESCRIPCIÓN",
        align: "left",
        fr: 2.2,
        render: (r) =>
          safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      },
      {
        key: "tipo_pago",
        label: "TIPO PAGO",
        align: "center",
        fr: 1.1,
        render: (r) =>
          safeText(pick(r, ["medio_pago_nombre", "medio_pago", "tipo_pago", "forma_pago"], "")),
      },
      {
        key: "tercero",
        label: "CLIENTE/PROVEEDOR",
        align: "left",
        fr: 1.6,
        render: (r) => {
          const c = safeText(pick(r, ["cliente", "nombre_cliente", "razon_social_cliente"], ""));
          return c !== "-"
            ? c
            : safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""));
        },
      },
      {
        key: "total",
        label: "TOTAL",
        align: "right",
        fr: 1.0,
        render: (r) =>
          moneyARS(
            pick(
              r,
              ["monto_total", "monto_total_final", "total", "importe_total", "monto", "importe"],
              0
            )
          ),
      },
      { key: "acciones", label: "ACCIONES", align: "center", fr: 0.8, render: () => null },
    ],
    []
  );

  const gridCols = useMemo(() => columns.map((c) => `${Number(c.fr) || 1}fr`).join(" "), [columns]);

  const getExportData = useCallback(() => {
    const dataToExport = buildExportRows(filteredRows);
    if (!dataToExport.length) {
      throw new Error("No hay datos para exportar.");
    }
    return dataToExport;
  }, [filteredRows]);

  const exportToExcel = useCallback(() => {
    const dataToExport = getExportData();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    XLSX.utils.book_append_sheet(wb, ws, slugifySheetName("Movimientos_Vista"));
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
        `TIPO PAGO: ${row["TIPO PAGO"] ?? ""}`,
        `CLIENTE/PROVEEDOR: ${row["CLIENTE/PROVEEDOR"] ?? ""}`,
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
          showToast("error", 'Faltan registros sin cargar. Tocá "Cargar todos" primero.', 5200);
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

  const saveMovimiento = async (payload, isEdit) => {
    setError("");
    const { idUsuario } = getAuthInfo();
    const action = isEdit ? "movimientos_actualizar" : "movimientos_crear";
    const payloadNorm = { ...(payload || {}), periodo: periodoToYYYYMM(payload?.periodo) };
    const data = await apiPostJson(`${API}?action=${action}`, { ...payloadNorm, idUsuario });
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar.");
  };

  const handleLoadAll = useCallback(async () => {
    if (!hasMore || loadingMore || loadingRows || loadingListsCtx || loadingAll) return;
    if (nextOffset === null) return;
    setLoadingAll(true);
    showToast("cargando", "Cargando todos los movimientos…", 12000);
    const myToken = (loadAllTokenRef.current += 1);
    let offset = nextOffset;
    let guard = 0;
    try {
      while (offset !== null && guard < 3000) {
        if (myToken !== loadAllTokenRef.current) break;
        const res = await loadRows({ dateRange, q: (q || "").trim(), offset, append: true });
        if (!res) break;
        offset = res.nextOffset;
        guard += 1;
        if (!res.hasMore || offset === null) break;
      }
      if (myToken === loadAllTokenRef.current) {
        showToast("exito", "Listo: ya se cargaron todos.", 2600);
      }
    } catch (e) {
      showToast("error", e?.message || "Error cargando todos.", 4200);
    } finally {
      if (myToken === loadAllTokenRef.current) setLoadingAll(false);
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

  const softLoading = loadingRows && showSkeleton;

  const skelWidths = useMemo(
    () => ({
      descripcion: ["72%", "58%", "66%", "48%"],
      tipo_pago: ["44%", "34%", "40%", "30%"],
      tercero: ["62%", "54%", "46%", "58%"],
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

  const listsSafe = useMemo(() => {
    const src = listasCtx || {};
    const safe = (k) => (Array.isArray(src[k]) ? src[k] : []);
    return {
      periodos: safe("periodos"),
      clasificaciones: safe("clasificaciones"),
      clientes: safe("clientes"),
      cuentas_corrientes: safe("cuentas_corrientes"),
      detalles: safe("detalles"),
      medios_pago: safe("medios_pago"),
      proveedores: safe("proveedores"),
      tipos_movimiento: safe("tipos_movimiento"),
      tipos_venta: safe("tipos_venta"),
      tipos_operacion: safe("tipos_operacion"),
    };
  }, [listasCtx]);

  const isAnyLoading = loadingRows || loadingMore || loadingAll;

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
            <div className="title-mov">
              <div className="mov-card__title">Movimientos</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> registros
                {hasMore ? " (hay más)" : ""}
                {loadingAll ? " (cargando…)" : ""}
              </div>
            </div>
<div className="mov-headFilters">

  {/* CALENDARIO — igual que Clientes */}
  <div className="cc-filter cc-filter--cal">
    <div className={`cc-floatingField cc-floatingField--calendar is-active ${calOpen ? "is-open" : ""}`}>
      <button
        type="button"
        className={`cc-calTrigger ${calOpen ? "is-open" : ""}`}
        onClick={() => setCalOpen((v) => !v)}
        disabled={isAnyLoading || loadingListsCtx}
      >
        {rangeLabel}
        <span className="cc-calTrigger__iconRight">
          <FontAwesomeIcon icon={faChevronDown} />
        </span>
      </button>

      <span className="cc-floatingLabel cc-floatingLabel--active">
        <FontAwesomeIcon icon={faCalendarDays} /> Período
      </span>

      {calOpen && (
        <div className="cc-calDropdown">
          <Calendario
            value={dateRange}
            onChange={handleRangeChange}
            onClose={() => setCalOpen(false)}
          />
        </div>
      )}
    </div>
  </div>

  {/* BÚSQUEDA — igual que Clientes */}
  <div className="cc-filter cc-filter--search">
    <div className={`cc-floatingField cc-floatingField--search ${q.trim() !== "" ? "is-active" : ""}`}>
      <div className="cc-searchInput">
        <div className="cc-searchInput__fieldWrap">
          <input
            className="cc-input cc-input--floating"
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
            placeholder=" "
            disabled={loadingListsCtx || loadingAll}
            autoComplete="off"
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
                await loadRows({ dateRange, q: "", offset: 0, append: false });
              }}
              disabled={loadingAll}
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
              loading={loadingAll}
              label="Exportar"
              title={filteredRows.length ? "Exportar archivo" : "No hay datos para exportar"}
              opciones={exportOptions}
              align="right"
            />
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

        <div className="mov-tableWrap mov-tableWrap--mov" role="rowgroup">
          <div
            className={[
              "mov-gridBody mov-gridBody--relative",
              softLoading ? "mov-softLoading" : "",
            ].join(" ")}
          >
            {loadingRows && showSkeleton ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {filteredRows.map((r) => (
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
                            className={["mov-gridCell", "mov-gridCell--actions", "is-center"].join(" ")}
                            role="cell"
                            data-label={c.label}
                          >
                            <div className="mov-actionsInline">
                              <button
                                type="button"
                                className="mov-iconBtn"
                                title="Editar"
                                onClick={async () => {
                                  await ensureListsLoaded({ force: false, background: true }).catch(() => {});
                                  setSelectedRow(r);
                                  setOpenEdit(true);
                                }}
                                disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx}
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn"
                                title="Facturar este movimiento"
                                onClick={async () => {
                                  await ensureListsLoaded({ force: false, background: true }).catch(() => {});
                                  setFactData(r);
                                  setOpenFacturar(true);
                                }}
                                disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx}
                              >
                                <FontAwesomeIcon icon={faFileInvoiceDollar} />
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
                ))}

                {!isAnyLoading && filteredRows.length === 0 && (
                  <div className="mov-emptyRow">
                    No hay movimientos para mostrar en este rango de fechas.
                  </div>
                )}

                {!loadingRows && filteredRows.length > 0 && hasMore && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadAll}
                      disabled={loadingMore || loadingAll || loadingListsCtx}
                      title="Cargar todos los movimientos restantes"
                    >
                      {loadingAll ? "Cargando todos…" : "Cargar todos"}
                    </button>
                  </div>
                )}

                {(loadingMore || loadingAll) && (
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

      {/* ✅ AHORA ABRÍS EL MODAL PADRE */}
      <ModalFacturaBalto
        open={openFacturar}
        onClose={() => {
          setOpenFacturar(false);
          setFactData(null);
        }}
        apiBase={API}
        action="movimientos"
        data={
          factData || {
            id_pago: null,
            id_sistema: null,
            labelCliente: "",
            labelSistema: "",
            cliente: "",
            sistema: "",
            anio: new Date().getFullYear(),
            mes: "",
            id_mes: new Date().getMonth() + 1,
            fecha_pago: new Date().toISOString().slice(0, 10),
          }
        }
        onFacturada={() => {
          showToast("exito", "Factura emitida correctamente.", 3200);
        }}
        onDone={async () => {
          invalidateCache();
          await loadRows({ dateRange, q, offset: 0, append: false });
        }}
      />

      <ModalEditarMovimiento
        open={openEdit}
        lists={listsSafe}
        row={selectedRow}
        periodoDefault=""
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onToast={showToast}
        onSave={async (payload) => {
          try {
            showToast("cargando", "Guardando cambios…", 12000);
            await saveMovimiento(payload, true);
            invalidateCache();
            await loadRows({ dateRange, q, offset: 0, append: false });
            setOpenEdit(false);
            setSelectedRow(null);
            showToast("exito", "Movimiento actualizado.", 2600);
          } catch (e) {
            showToast("error", e?.message || "Error actualizando movimiento.", 4200);
            throw e;
          }
        }}
      />

      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId === selectedRow?.id_movimiento}
        onClose={() => {
          setOpenDel(false);
          setSelectedRow(null);
        }}
        onConfirm={async () => {
          if (!selectedRow?.id_movimiento) return;
          const id = selectedRow.id_movimiento;
          setDeletingId(id);
          setError("");
          showToast("cargando", "Eliminando movimiento…", 12000);
          try {
            const { idUsuario, sessionKey } = getAuthInfo();
            const sp = new URLSearchParams();
            sp.set("action", "movimientos_eliminar");
            sp.set("id_movimiento", String(id));
            const res = await fetch(`${API}?${sp.toString()}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(sessionKey ? { "X-Session": sessionKey } : {}),
              },
              body: JSON.stringify({ idUsuario }),
            });
            const data = JSON.parse((await res.text()) || "{}");
            if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");
            setOpenDel(false);
            setSelectedRow(null);
            loadAllTokenRef.current += 1;
            invalidateCache();
            await loadRows({ dateRange, q, offset: 0, append: false });
            showToast("exito", "Movimiento eliminado.", 2600);
          } catch (e) {
            setError(e?.message || "Error eliminando movimiento.");
            showToast("error", e?.message || "Error eliminando movimiento.", 4200);
          } finally {
            setDeletingId(null);
          }
        }}
        onToast={showToast}
      />
    </div>
  );
}