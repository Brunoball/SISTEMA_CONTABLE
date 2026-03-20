import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "../Global/Global_css/Global_Section.css";
import "../Global/Global_css/Global_responsive.css";

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
  faMagnifyingGlass,
  faCalendarDays,
  faFileExcel,
  faChevronDown,
  faArrowRightLong,
  faTimes,
  faBoxOpen,
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
const LIVE_POLL_MS = 5000;

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

/* =========================
   Auth
========================= */
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
   Export helpers
========================= */
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
      OPERACION: safeText(pick(r, ["operacion"], "")),
      "CLIENTE/PROVEEDOR": tercero,
      "MEDIO DE PAGO": safeText(
        pick(r, ["medio_pago_nombre", "medio_pago", "tipo_pago", "forma_pago"], "")
      ),
      MONTO: numOrZero(total),
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
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
  } = useListas();

  const { dateRange, setDateRange } = useDateRange();

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [calOpen, setCalOpen] = useState(false);
  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

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

  const liveTimerRef = useRef(null);
  const liveBusyRef = useRef(false);
  const liveTokenRef = useRef(null);
  const liveToastCooldownRef = useRef(0);

  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
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

  const fetchLiveToken = useCallback(
    async (rangeParam, qParam) => {
      const range = rangeParam ?? dateRange;
      const qLocal = typeof qParam === "string" ? qParam : q;

      if (!range?.from) return null;

      const desde = formatDateISO(range.from);
      const hasta = formatDateISO(range.to || range.from);
      const sp = new URLSearchParams();
      sp.set("action", "movimientos_live_token");
      sp.set("fecha_desde", desde);
      sp.set("fecha_hasta", hasta);
      sp.set("limit", String(PAGE_SIZE));
      if ((qLocal || "").trim()) sp.set("q", (qLocal || "").trim());

      const data = await apiGet(`${API}?${sp.toString()}`);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo obtener el token en vivo.");
      return String(data.live_token || "");
    },
    [API, apiGet, dateRange, q]
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
                return [...base, ...movs.filter((x) => !seen.has(String(x?.id_movimiento)))];
              });
            } else {
              setRows(movs);
            }

            setHasMore(newHasMore);
            setNextOffset(newNextOffset);

            if (!append && offset === 0) {
              cacheRef.current.set(cacheKey, {
                rows: movs,
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
              received: movs.length,
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
      try {
        const token = await fetchLiveToken(dateRange, "");
        if (alive) liveTokenRef.current = token;
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, [ensureListsLoaded, loadRows, dateRange, fetchLiveToken]);

  useEffect(() => {
    liveTokenRef.current = null;
  }, [dateRange, q]);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      await loadRows({ dateRange, q, offset: 0, append: false });
      try {
        const token = await fetchLiveToken(dateRange, q);
        liveTokenRef.current = token;
      } catch {}
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, dateRange, loadRows, fetchLiveToken]);

  const invalidateCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const handleRangeChange = useCallback(
    (range) => {
      setDateRange(range);
      setQ("");
      skipSearchRef.current = true;
      invalidateCache();
      liveTokenRef.current = null;

      if (range.from && range.to) {
        setCalOpen(false);
      }
    },
    [setDateRange, invalidateCache]
  );

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loadingRows || loadingListsCtx) return;
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

      try {
        const token = await fetchLiveToken(dateRange, q);
        liveTokenRef.current = token;
      } catch {}

      showToast("exito", `${res.received || PAGE_SIZE} registros más cargados.`, 2400);
    } catch (e) {
      showToast("error", e?.message || "Error cargando más registros.", 4200);
    }
  }, [
    hasMore,
    loadingMore,
    loadingRows,
    loadingListsCtx,
    nextOffset,
    loadRows,
    dateRange,
    q,
    showToast,
    fetchLiveToken,
  ]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      if (!dateRange?.from) {
        liveTimerRef.current = setTimeout(tick, LIVE_POLL_MS);
        return;
      }

      if (
        document.hidden ||
        liveBusyRef.current ||
        loadingRows ||
        loadingMore ||
        loadingListsCtx ||
        calOpen
      ) {
        liveTimerRef.current = setTimeout(tick, LIVE_POLL_MS);
        return;
      }

      liveBusyRef.current = true;

      try {
        const token = await fetchLiveToken(dateRange, q);

        if (!token) {
          liveBusyRef.current = false;
          liveTimerRef.current = setTimeout(tick, LIVE_POLL_MS);
          return;
        }

        if (liveTokenRef.current === null) {
          liveTokenRef.current = token;
        } else if (liveTokenRef.current !== token) {
          liveTokenRef.current = token;
          invalidateCache();

          const prevLen = rows.length;
          const prevHasMore = hasMore;

          await loadRows({
            dateRange,
            q,
            offset: 0,
            append: false,
          });

          const now = Date.now();
          if (now - liveToastCooldownRef.current > 4000) {
            const mensaje =
              prevHasMore || prevLen >= PAGE_SIZE
                ? "Movimientos actualizados en vivo. La vista se recargó desde el inicio."
                : "Movimientos actualizados en vivo.";
            showToast("exito", mensaje, 2200);
            liveToastCooldownRef.current = now;
          }
        }
      } catch {
        // silencioso para no molestar al usuario
      } finally {
        liveBusyRef.current = false;
        if (!cancelled) {
          liveTimerRef.current = setTimeout(tick, LIVE_POLL_MS);
        }
      }
    };

    liveTimerRef.current = setTimeout(tick, LIVE_POLL_MS);

    return () => {
      cancelled = true;
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    };
  }, [
    dateRange,
    q,
    loadingRows,
    loadingMore,
    loadingListsCtx,
    calOpen,
    hasMore,
    rows.length,
    fetchLiveToken,
    loadRows,
    invalidateCache,
    showToast,
  ]);

  const filteredRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const columns = useMemo(
    () => [
      {
        key: "fecha",
        label: "FECHA",
        align: "left",
        fr: 1.1,
        render: (r) => safeText(formatFechaDMY(pick(r, ["fecha", "created_at"], ""))),
      },
      {
        key: "descripcion",
        label: "DESCRIPCIÓN",
        align: "left",
        fr: 2.2,
        render: (r) =>
          safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      },
      {
        key: "operacion",
        label: "OPERACIÓN",
        align: "center",
        fr: 1.3,
        render: (r) => safeText(pick(r, ["operacion"], "")),
      },
      {
        key: "tercero",
        label: "CLIENTE/PROVEEDOR",
        align: "left",
        fr: 1.8,
        render: (r) => {
          const c = safeText(pick(r, ["cliente", "nombre_cliente", "razon_social_cliente"], ""));
          return c !== "-"
            ? c
            : safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""));
        },
      },
      {
        key: "medio_pago",
        label: "MEDIO DE PAGO",
        align: "center",
        fr: 1.3,
        render: (r) =>
          safeText(pick(r, ["medio_pago_nombre", "medio_pago", "tipo_pago", "forma_pago"], "")),
      },
      {
        key: "monto",
        label: "MONTO",
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
        `OPERACION: ${row.OPERACION ?? ""}`,
        `CLIENTE/PROVEEDOR: ${row["CLIENTE/PROVEEDOR"] ?? ""}`,
        `MEDIO DE PAGO: ${row["MEDIO DE PAGO"] ?? ""}`,
        `MONTO: ${row.MONTO ?? ""}`,
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

  const softLoading = loadingRows && showSkeleton;

  const skelWidths = useMemo(
    () => ({
      fecha: ["55%", "48%", "52%", "46%"],
      descripcion: ["72%", "58%", "66%", "48%"],
      operacion: ["44%", "34%", "40%", "30%"],
      tercero: ["62%", "54%", "46%", "58%"],
      medio_pago: ["48%", "38%", "44%", "36%"],
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

  const isAnyLoading = loadingRows || loadingMore;

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
                {hasMore ? " (hay más por cargar)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="cc-filter cc-filter--cal">
                <div
                  className={`cc-floatingField cc-floatingField--calendar is-active ${
                    calOpen ? "is-open" : ""
                  }`}
                >
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

              <div className="cc-filter cc-filter--search">
                <div className="cc-floatingField cc-floatingField--search is-active">
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
                            invalidateCache();
                            liveTokenRef.current = null;
                            await loadRows({
                              dateRange,
                              q: e.currentTarget.value,
                              offset: 0,
                              append: false,
                            });
                            try {
                              const token = await fetchLiveToken(dateRange, e.currentTarget.value);
                              liveTokenRef.current = token;
                            } catch {}
                          }
                        }}
                        placeholder="Buscar por descripción, operación, cliente, proveedor..."
                        disabled={loadingListsCtx || loadingMore}
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
                            invalidateCache();
                            liveTokenRef.current = null;
                            await loadRows({ dateRange, q: "", offset: 0, append: false });
                            try {
                              const token = await fetchLiveToken(dateRange, "");
                              liveTokenRef.current = token;
                            } catch {}
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
                  <div className="cc-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">
                      {q.trim()
                        ? `No se encontraron movimientos para "${q.trim()}".`
                        : "No hay movimientos para mostrar en este rango de fechas."}
                    </div>
                  </div>
                )}

                {!loadingRows && filteredRows.length > 0 && hasMore && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadMore}
                      disabled={loadingMore || loadingListsCtx}
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
    </div>
  );
}