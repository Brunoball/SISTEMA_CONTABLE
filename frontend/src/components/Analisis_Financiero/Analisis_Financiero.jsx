// src/components/Analisis_Financiero/Analisis_Financiero.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "./analisis_financiero.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel } from "@fortawesome/free-solid-svg-icons";

// ✅ Toast global
import Toast from "../Global/Toast.jsx";

// ✅ Excel
import * as XLSX from "xlsx";

/* =========================
   Helpers
========================= */
function moneyARS(v) {
  if (v == null || v === "") return "-";
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function periodLabelMMYYYY(yyyyMM) {
  const [y, m] = String(yyyyMM || "").split("-");
  if (!y || !m) return String(yyyyMM || "");
  return `${m}-${y}`;
}

function safeText(v) {
  return String(v ?? "").trim();
}

function toNumberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRows(raw) {
  // 1) rows: [{ concepto, importe, tipo, id? }]
  // 2) valores: { ventas, costo_variable, costo_fijo, otros_egresos, gastos_personales, ... }
  if (Array.isArray(raw)) {
    return raw
      .map((r, idx) => ({
        id: safeText(r?.id ?? `${idx}`),
        concepto: safeText(r?.concepto ?? r?.nombre ?? r?.label ?? ""),
        importe: r?.importe == null ? null : Number(r.importe || 0),
        tipo: safeText(r?.tipo ?? ""),
      }))
      .filter((x) => x.concepto);
  }

  if (raw && typeof raw === "object") {
    const ventas = toNumberOrZero(raw?.ventas);
    const costoVar = toNumberOrZero(raw?.costo_variable ?? raw?.costoVariable);
    const costoFijo = toNumberOrZero(raw?.costo_fijo ?? raw?.costoFijo);
    const otrosEgresos = toNumberOrZero(raw?.otros_egresos ?? raw?.otrosEgresos);
    const gastosPers = toNumberOrZero(raw?.gastos_personales ?? raw?.gastosPersonales);

    const resultadoNeto = ventas - costoVar - costoFijo - otrosEgresos;

    const out = [
      { id: "ventas", concepto: "VENTAS", importe: ventas, tipo: "ingreso" },
      { id: "costo_variable", concepto: "COSTO VARIABLE", importe: costoVar, tipo: "egreso" },
      { id: "costo_fijo", concepto: "COSTO FIJO", importe: costoFijo, tipo: "egreso" },
      { id: "otros_egresos", concepto: "OTROS EGRESOS", importe: otrosEgresos, tipo: "egreso" },
      { id: "resultado_neto", concepto: "RESULTADO NETO", importe: resultadoNeto, tipo: "resultado" },
    ];

    if (Number.isFinite(gastosPers) && gastosPers !== 0) {
      out.push({
        id: "gastos_personales",
        concepto: "GASTOS PERSONALES",
        importe: gastosPers,
        tipo: "egreso",
      });
    }

    return out;
  }

  return [];
}

/* =========================
   ✅ CÁLCULO CORRECTO SIEMPRE
========================= */
function findImporte(rows, keys) {
  if (!Array.isArray(rows)) return 0;

  for (const k of keys) {
    if (k.id) {
      const byId = rows.find(
        (r) => safeText(r.id).toLowerCase() === String(k.id).toLowerCase()
      );
      if (byId && byId.importe != null) return toNumberOrZero(byId.importe);
    }
    if (k.includes && k.includes.length) {
      const byConcept = rows.find((r) => {
        const c = safeText(r.concepto).toLowerCase();
        return k.includes.some((needle) => c.includes(needle));
      });
      if (byConcept && byConcept.importe != null) return toNumberOrZero(byConcept.importe);
    }
  }

  return 0;
}

function computeDerivedRows(rows) {
  const base = Array.isArray(rows) ? [...rows] : [];

  const ventas = findImporte(base, [{ id: "ventas" }, { includes: ["ventas", "ingresos", "venta"] }]);
  const costoVar = findImporte(base, [{ id: "costo_variable" }, { includes: ["costo variable", "variable"] }]);
  const costoFijo = findImporte(base, [{ id: "costo_fijo" }, { includes: ["costo fijo", "fijo"] }]);
  const otrosEgresos = findImporte(base, [{ id: "otros_egresos" }, { includes: ["otros egresos", "egresos"] }]);

  const resultadoNeto = ventas - costoVar - costoFijo - otrosEgresos;

  const idxRes = base.findIndex((r) => {
    const id = safeText(r.id).toLowerCase();
    const c = safeText(r.concepto).toLowerCase();
    return (
      id === "resultado_neto" ||
      c === "resultado neto" ||
      (c.includes("resultado") && c.includes("neto"))
    );
  });

  const rowResultado = {
    id: "resultado_neto",
    concepto: "RESULTADO NETO",
    importe: resultadoNeto,
    tipo: "resultado",
  };

  if (idxRes >= 0) base[idxRes] = { ...base[idxRes], ...rowResultado };
  else base.push(rowResultado);

  const idxVentas = base.findIndex((r) => safeText(r.id).toLowerCase() === "ventas");
  if (idxVentas >= 0)
    base[idxVentas] = { ...base[idxVentas], concepto: "VENTAS", tipo: "ingreso", importe: ventas };

  const markTipo = (id, tipo) => {
    const i = base.findIndex((r) => safeText(r.id).toLowerCase() === id);
    if (i >= 0) base[i] = { ...base[i], tipo };
  };
  markTipo("costo_variable", "egreso");
  markTipo("costo_fijo", "egreso");
  markTipo("otros_egresos", "egreso");

  return base;
}

/* =========================
   Excel helpers
========================= */
function sanitizeFilePart(s) {
  return String(s ?? "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   ✅ Auth helpers (X-Session)
========================= */
function getSessionKey() {
  return (localStorage.getItem("session_key") || "").toString().trim();
}
function authHeaders(extra = {}) {
  const sessionKey = getSessionKey();
  const h = { ...extra };
  if (sessionKey) h["X-Session"] = sessionKey;
  return h;
}
async function parseJsonOrThrow(res) {
  if (res.status === 401) {
    throw new Error("401 (Unauthorized): Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }

  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
  }
}

/* =========================
   ✅ Período: normalizador + cache (IGUAL FLUJO_CAJA)
========================= */
function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // YYYY-MM o YYYY/M
  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split(/[-/]/);
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  // MM-YYYY o MM/YYYY
  if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split(/[-/]/);
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  // 202601 / 012026
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
  return "";
}

const PERIOD_CACHE_KEY = "af_periodo_cache";
function readCachedPeriodo() {
  const v = (localStorage.getItem(PERIOD_CACHE_KEY) || "").trim();
  const norm = periodoToYYYYMM(v);
  return norm || "";
}
function writeCachedPeriodo(v) {
  const norm = periodoToYYYYMM(v);
  if (norm) localStorage.setItem(PERIOD_CACHE_KEY, norm);
}

/* =========================
   Skeleton config
   (AJUSTÁ ACÁ el tamaño)
========================= */
// cantidad de filas skeleton (tabla)
const SKELETON_TABLE_ROWS =5;

// altura de barras (evita "gigante")
const SKELETON_BAR_H = 5; // probá 8 / 10 / 12

// padding vertical en filas skeleton
const SKELETON_ROW_PAD_Y = 5; // probá 8 / 10 / 12

export default function Analisis_Financiero() {
  const API = `${BASE_URL}/api.php`;

  // ✅ PERÍODO instantáneo (cache primero, sino fallback)
  const [periodo, setPeriodo] = useState(() => readCachedPeriodo() || "2026-01");

  const [periodOptions, setPeriodOptions] = useState([]); // YYYY-MM[]
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);

  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // ✅ para evitar el “flash” de “no hay datos”
  const [hasFetched, setHasFetched] = useState(false);

  /* =========================
     ✅ TOAST GLOBAL
  ========================= */
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // ✅ Skeleton: delay anti-parpadeo
  const skelTimerRef = useRef(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

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
    };
  }, []);

  // ✅ check simple sesión
  useEffect(() => {
    const k = getSessionKey();
    if (!k) showToast("advertencia", "Falta session_key. Iniciá sesión de nuevo.", 4200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ guardar periodo al cambiar (instant)
  useEffect(() => {
    if (periodo) writeCachedPeriodo(periodo);
  }, [periodo]);

  /* =========================================================
     ✅ 1) Periodos desde Dashboard
  ========================================================= */
  const fetchPeriodosFromDashboard = useCallback(async () => {
    setLoadingPeriodos(true);
    setError("");

    try {
      const res = await fetch(`${API}?action=global_obtener_listas`, {
        method: "GET",
        headers: authHeaders(),
      });

      const json = await parseJsonOrThrow(res);

      if (!res.ok || !json?.exito) {
        throw new Error(json?.mensaje || `Error cargando períodos (HTTP ${res.status})`);
      }

      const raw = Array.isArray(json?.listas?.periodos)
        ? json.listas.periodos
        : Array.isArray(json?.periodos)
        ? json.periodos
        : [];

      const unique = Array.from(new Set(raw.map((p) => periodoToYYYYMM(p)).filter(Boolean)));

      unique.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      setPeriodOptions(unique);

      if (unique.length) {
        if (!periodo || !unique.includes(periodo)) setPeriodo(unique[0]);
      } else {
        showToast("error", "No hay períodos disponibles.", 3200);
      }
    } catch (e) {
      const msg = e?.message || "Error cargando períodos";
      setError(msg);
      showToast("error", msg, 4200);
      setPeriodOptions([]);
    } finally {
      setLoadingPeriodos(false);
    }
  }, [API, periodo, showToast]);

  useEffect(() => {
    fetchPeriodosFromDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     ✅ 2) Cargar análisis cuando hay período seleccionado
  ========================================================= */
  const fetchAnalisis = useCallback(async () => {
    if (!periodo) return;

    setLoading(true);
    setError("");
    beginSkeleton();

    try {
      const sp = new URLSearchParams();
      sp.set("action", "analisis_financiero_resumen");
      sp.set("periodo", periodo);

      const res = await fetch(`${API}?${sp.toString()}`, {
        method: "GET",
        headers: authHeaders(),
      });

      const json = await parseJsonOrThrow(res);

      if (!res.ok || !json?.exito) {
        throw new Error(json?.mensaje || `Error desconocido en API (HTTP ${res.status})`);
      }

      setData(json);
    } catch (e) {
      setData(null);
      const msg = e?.message || "Error cargando análisis financiero";
      setError(msg);
      showToast("error", msg, 4200);
    } finally {
      setLoading(false);
      setHasFetched(true);
      endSkeleton();
    }
  }, [API, periodo, showToast, beginSkeleton, endSkeleton]);

  useEffect(() => {
    fetchAnalisis();
  }, [fetchAnalisis]);

  /* =========================
     Datos / normalización
  ========================= */
  const rawRows =
    data?.rows ??
    data?.data?.rows ??
    data?.valores ??
    data?.data?.valores ??
    data?.analisis ??
    data?.data?.analisis ??
    null;

  const normalized = useMemo(() => normalizeRows(rawRows), [rawRows]);
  const allRows = useMemo(() => computeDerivedRows(normalized), [normalized]);

  const filteredRows = useMemo(() => {
    const needle = safeText(q).toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) => safeText(r.concepto).toLowerCase().includes(needle));
  }, [allRows, q]);

  const showing = filteredRows.length;

  const ventas = allRows.find((r) => safeText(r.id).toLowerCase() === "ventas")?.importe ?? null;
  const resultadoNeto =
    allRows.find((r) => safeText(r.id).toLowerCase() === "resultado_neto")?.importe ?? null;
  const gastosPersonales =
    allRows.find((r) => safeText(r.id).toLowerCase() === "gastos_personales")?.importe ?? null;

  const resultadoIsNeg = Number(resultadoNeto) < 0;

  const isBusy = loading || loadingPeriodos;
  const showSkel = showSkeleton && isBusy;

  /* =========================
     ✅ Exportar a Excel + Toast
  ========================= */
  const handleExportExcel = useCallback(() => {
    try {
      if (!data || filteredRows.length === 0) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      showToast("cargando", "Generando Excel…", 9000);

      const tableData = filteredRows.map((r) => ({
        CONCEPTO: safeText(r.concepto),
        IMPORTE: numOrNull(r.importe),
      }));

      const resumenData = [
        { CAMPO: "PERIODO", VALOR: safeText(data?.periodo ?? periodo) },
        { CAMPO: "VENTAS", VALOR: numOrNull(ventas) },
        { CAMPO: "RESULTADO_NETO", VALOR: numOrNull(resultadoNeto) },
        { CAMPO: "GASTOS_PERSONALES", VALOR: numOrNull(gastosPersonales) },
      ];

      const wb = XLSX.utils.book_new();

      const wsTabla = XLSX.utils.json_to_sheet(tableData, { header: ["CONCEPTO", "IMPORTE"] });
      wsTabla["!cols"] = [{ wch: 40 }, { wch: 18 }];

      const wsResumen = XLSX.utils.json_to_sheet(resumenData, { header: ["CAMPO", "VALOR"] });
      wsResumen["!cols"] = [{ wch: 22 }, { wch: 24 }];

      XLSX.utils.book_append_sheet(wb, wsTabla, "Analisis");
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      const fileName = `Analisis_Financiero_${sanitizeFilePart(periodLabelMMYYYY(periodo))}.xlsx`;
      XLSX.writeFile(wb, fileName);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      const msg = e?.message || "Error exportando a Excel";
      setError(msg);
      showToast("error", msg, 3500);
    }
  }, [filteredRows, data, periodo, ventas, resultadoNeto, gastosPersonales, showToast]);

  /* =========================================================
     ✅ Skeleton renderers (3 zonas)
     - Tabla: header visible
     - Subhead y Totales: skeleton propio
  ========================================================= */

  const skelWidths = useMemo(() => {
    return {
      concepto: ["42%", "58%", "50%", "64%", "46%", "55%"],
      importe: ["22%", "28%", "20%", "30%", "24%", "26%"],
    };
  }, []);

  const renderSkeletonRow = (idx) => {
    const pick = (key) => {
      const list = skelWidths[key] || ["50%"];
      return list[idx % list.length];
    };

    return (
      <div className="af-grid af-grid--row af-grid--excel af-row--skeleton" key={`skel-${idx}`}>
        <div className="af-cell af-concept" style={{ padding: `${SKELETON_ROW_PAD_Y}px 12px` }}>
          <span className="af-skeletonBar" style={{ width: pick("concepto"), height: SKELETON_BAR_H }} />
        </div>
        <div className="af-cell af-num is-right" style={{ padding: `${SKELETON_ROW_PAD_Y}px 12px` }}>
          <span className="af-skeletonBar" style={{ width: pick("importe"), height: SKELETON_BAR_H }} />
        </div>
      </div>
    );
  };

  const renderSubheadSkeleton = () => {
    return (
      <div className="af-subhead af-softLoading" aria-busy="true">
        <div style={{ width: "100%" }}>
          <div className="af-skeletonBar" style={{ width: "28%", height: 12 }} />
          <div style={{ height: 8 }} />
          <div className="af-skeletonBar" style={{ width: "54%", height: 10 }} />
        </div>

        <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
          <div className="af-skeletonBar" style={{ width: "40%", height: 10 }} />
        </div>
      </div>
    );
  };

  const renderTotalsSkeleton = () => {
    return (
      <div className="af-footTotals af-softLoading" aria-busy="true">
        <div className="af-totalCard">
          <div className="af-skeletonBar" style={{ width: "36%", height: 4 }} />
          <div style={{ height: 4 }} />
          <div className="af-skeletonBar" style={{ width: "64%", height: 4 }} />
          <div style={{ height: 4 }} />
          <div className="af-skeletonBar" style={{ width: "58%", height: 4 }} />
        </div>

        <div className="af-totalCard">
          <div className="af-skeletonBar" style={{ width: "40%", height: 4 }} />
          <div style={{ height: 4 }} />
          <div className="af-skeletonBar" style={{ width: "60%", height: 4 }} />
          <div style={{ height: 4 }} />
          <div className="af-skeletonBar" style={{ width: "52%", height: 4 }} />
        </div>
      </div>
    );
  };

  /* =========================
     Render
  ========================= */
  return (
    <div className="af-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      {error && (
        <div className="af-alert" role="alert">
          {error}
        </div>
      )}

      <section className="af-card af-card--table">
        <div className="af-card__head">
          <div className="af-card__headLeft">
            <div className="af-headTitle">
              <div className="af-card__title">Análisis Financiero</div>
              <div className="af-card__hint">
                Mostrando <b>{showing}</b> registros
              </div>
            </div>

            <div className="af-headFilters">
              <div className="af-filter">
                <label>Período</label>

                <select
                  value={periodo || ""}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={loadingPeriodos}
                >
                  {(!periodOptions.length || !periodOptions.includes(periodo)) && (
                    <option value={periodo}>{periodLabelMMYYYY(periodo)}</option>
                  )}

                  {periodOptions.map((p) => (
                    <option key={p} value={p}>
                      {periodLabelMMYYYY(p)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="af-filter af-filter--search">
                <label>Buscar</label>

                <div className="af-searchInput">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Ej: ventas, costo fijo, gastos..."
                    disabled={isBusy}
                  />

                  {q.trim() !== "" && !isBusy && (
                    <button
                      type="button"
                      className="af-clearSearch"
                      title="Limpiar búsqueda"
                      onClick={() => {
                        setQ("");
                        document.querySelector(".af-searchInput input")?.focus();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="af-card__actions">
            <button
              type="button"
              className="af-btn af-btn--excel"
              onClick={handleExportExcel}
              disabled={isBusy || !data || filteredRows.length === 0}
              title={!data ? "Primero cargá datos" : "Exportar tabla a Excel"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>

        {/* ✅ TABLA (skeleton EN af-tableWrap, header visible) */}
        <div className={["af-tableWrap", showSkel ? "af-softLoading" : ""].join(" ")}>
          {/* ✅ HEADER SIEMPRE VISIBLE */}
          <div className="af-grid af-grid--head af-grid--excel">
            <div className="af-cell">CONCEPTO</div>
            <div className="af-cell is-right">IMPORTE</div>
          </div>

          <div className="af-gridBody">
            {showSkel ? (
              <div className="af-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_TABLE_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {!!data &&
                  filteredRows.map((r) => {
                    const conceptoLower = safeText(r.concepto).toLowerCase();

                    const isResultado =
                      conceptoLower === "resultado neto" ||
                      r.tipo === "resultado" ||
                      safeText(r.id).toLowerCase() === "resultado_neto";

                    const isGastoPersonal =
                      conceptoLower.includes("gastos personales") ||
                      safeText(r.id).toLowerCase() === "gastos_personales";

                    return (
                      <div
                        className={`af-grid af-grid--row af-grid--excel ${
                          isResultado ? "is-resultado" : ""
                        } ${isGastoPersonal ? "is-gp" : ""}`}
                        key={r.id}
                      >
                        <div className="af-cell af-concept">{r.concepto}</div>

                        <div
                          className={`af-cell af-num is-right ${
                            Number(r.importe) < 0 ? "is-negative" : ""
                          }`}
                        >
                          {moneyARS(r.importe)}
                        </div>
                      </div>
                    );
                  })}

                {/* ✅ Empty states SIN flash */}
                {hasFetched && !isBusy && !error && (
                  <>
                    {!data && <div className="af-emptyRow">No hay datos para mostrar.</div>}
                    {!!data && filteredRows.length === 0 && (
                      <div className="af-emptyRow">No hay datos para mostrar.</div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ✅ Subhead + Totales con skeleton propio */}
        {showSkel ? (
          <>
            {renderSubheadSkeleton()}
            {renderTotalsSkeleton()}
          </>
        ) : (
          <>
            {!loading && !loadingPeriodos && data && (
              <>
                <div className="af-subhead">
                  <div className="af-subhead__name">
                    Resumen
                    <div className="af-subhead__meta">
                      Período {data?.periodo ?? periodo}
                      {ventas != null ? (
                        <>
                          {" "}
                          • Ventas: <b>{moneyARS(ventas)}</b>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="af-miniHint">
                    Tabla horizontal tipo Excel (Concepto / Importe). Resultado Neto se resalta.
                  </div>
                </div>

                <div className="af-footTotals">
                  <div
                    className={`af-totalCard af-totalCard--primary ${
                      resultadoIsNeg ? "is-negative" : "is-positive"
                    }`}
                  >
                    <div className="af-totalTop">
                      <div className="af-totalLabel">Resultado Neto</div>
                      <div className="af-chip">{resultadoIsNeg ? "↓ Pérdida" : "↑ Ganancia"}</div>
                    </div>

                    <div className="af-totalValue">
                      {resultadoNeto == null ? "-" : moneyARS(resultadoNeto)}
                    </div>

                    <div className="af-totalSub">
                      Resultado del período (ventas - costo variable - costo fijo - otros egresos)
                    </div>
                  </div>

                  <div className="af-totalCard af-totalCard--danger">
                    <div className="af-totalTop">
                      <div className="af-totalLabel">Gastos personales</div>
                      <div className="af-chip is-danger">Control</div>
                    </div>

                    <div className="af-totalValue">
                      {gastosPersonales == null ? "-" : moneyARS(gastosPersonales)}
                    </div>

                    <div className="af-totalSub">Se muestra aparte como en tu Excel</div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
