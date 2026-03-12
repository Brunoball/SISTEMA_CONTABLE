import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "./analisis_financiero.css";
import "../Global/Global_css/Global_oscuro.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faFileExcel,
  faChevronDown,
  faArrowRightLong,
} from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";
import Calendario from "../Global/Calendario/Calendario.jsx";
import "../../components/Global/Calendario/calendario.css";

import BotonExportar from "../Global/Boton_Exportar/BotonExportar.jsx";

import * as XLSX from "xlsx";

import { useDateRange } from "../../context/DateRangeContext.jsx";

/* =========================
   Helpers
========================= */
function moneyARS(v) {
  if (v == null || v === "") return "—";
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function safeText(v) {
  return String(v ?? "").trim();
}
function toNumberOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function formatDateISO(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function formatDateUI(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function sanitizeFilePart(s) {
  return String(s ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").slice(0, 80);
}
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function normalizeRows(raw) {
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
    const resultadoNeto = ventas - costoVar - costoFijo - otrosEgresos;
    return [
      { id: "ventas", concepto: "VENTAS", importe: ventas, tipo: "ingreso" },
      { id: "costo_variable", concepto: "COSTO VARIABLE", importe: costoVar, tipo: "egreso" },
      { id: "costo_fijo", concepto: "COSTO FIJO", importe: costoFijo, tipo: "egreso" },
      { id: "otros_egresos", concepto: "OTROS EGRESOS", importe: otrosEgresos, tipo: "egreso" },
      { id: "resultado_neto", concepto: "RESULTADO NETO", importe: resultadoNeto, tipo: "resultado" },
    ];
  }
  return [];
}

function findImporte(rows, keys) {
  if (!Array.isArray(rows)) return 0;
  for (const k of keys) {
    if (k.id) {
      const byId = rows.find((r) => safeText(r.id).toLowerCase() === String(k.id).toLowerCase());
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

  // Filtrar gastos_personales
  const filtered = base.filter((r) => safeText(r.id).toLowerCase() !== "gastos_personales");

  const idxRes = filtered.findIndex((r) => {
    const id = safeText(r.id).toLowerCase();
    const c = safeText(r.concepto).toLowerCase();
    return id === "resultado_neto" || c === "resultado neto" || (c.includes("resultado") && c.includes("neto"));
  });
  const rowResultado = { id: "resultado_neto", concepto: "RESULTADO NETO", importe: resultadoNeto, tipo: "resultado" };
  if (idxRes >= 0) filtered[idxRes] = { ...filtered[idxRes], ...rowResultado };
  else filtered.push(rowResultado);

  const idxVentas = filtered.findIndex((r) => safeText(r.id).toLowerCase() === "ventas");
  if (idxVentas >= 0) filtered[idxVentas] = { ...filtered[idxVentas], concepto: "VENTAS", tipo: "ingreso", importe: ventas };

  const markTipo = (id, tipo) => {
    const i = filtered.findIndex((r) => safeText(r.id).toLowerCase() === id);
    if (i >= 0) filtered[i] = { ...filtered[i], tipo };
  };
  markTipo("costo_variable", "egreso");
  markTipo("costo_fijo", "egreso");
  markTipo("otros_egresos", "egreso");
  return filtered;
}

/* =========================
   Auth helpers
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
  if (res.status === 401) throw new Error("401 (Unauthorized): Sesión vencida. Volvé a iniciar sesión.");
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try { return JSON.parse(text); } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
  }
}

const SKELETON_ROWS = 5;
const gridCols = "2fr 1.2fr";

export default function Analisis_Financiero() {
  const API = `${BASE_URL}/api.php`;

  const { dateRange, setDateRange } = useDateRange();
  const [showCalendario, setShowCalendario] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => setToast({ tipo, mensaje, duracion }), []);
  const closeToast = useCallback(() => setToast(null), []);

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
  useEffect(() => () => { if (skelTimerRef.current) clearTimeout(skelTimerRef.current); }, []);

  /* =========================
     Fetch
  ========================= */
  const fetchAnalisis = useCallback(async () => {
    if (!dateRange?.from) return;
    setLoading(true);
    setError("");
    beginSkeleton();
    try {
      const sp = new URLSearchParams();
      sp.set("action", "analisis_financiero_resumen");
      sp.set("fecha_desde", formatDateISO(dateRange.from));
      sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));
      const res = await fetch(`${API}?${sp.toString()}`, { method: "GET", headers: authHeaders() });
      const json = await parseJsonOrThrow(res);
      if (!res.ok || !json?.exito) throw new Error(json?.mensaje || `Error desconocido (HTTP ${res.status})`);
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
  }, [API, dateRange, showToast, beginSkeleton, endSkeleton]);

  useEffect(() => { fetchAnalisis(); }, [fetchAnalisis]);

  /* =========================
     Datos normalizados
  ========================= */
  const rawRows = data?.rows ?? data?.data?.rows ?? data?.valores ?? data?.data?.valores ?? data?.analisis ?? data?.data?.analisis ?? null;
  const normalized = useMemo(() => normalizeRows(rawRows), [rawRows]);
  const allRows = useMemo(() => computeDerivedRows(normalized), [normalized]);

  const ventas = allRows.find((r) => safeText(r.id).toLowerCase() === "ventas")?.importe ?? null;
  const resultadoNeto = allRows.find((r) => safeText(r.id).toLowerCase() === "resultado_neto")?.importe ?? null;
  const resultadoIsNeg = Number(resultadoNeto) < 0;

  /* =========================
     Label calendario
  ========================= */
  const dateRangeLabel = useMemo(() => {
    const { from, to } = dateRange;
    if (!from && !to) return "Seleccionar fechas";
    if (from && to) {
      if (from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth() && from.getDate() === to.getDate())
        return formatDateUI(from);
      return (
        <>
          <span>{formatDateUI(from)}</span>
          <span className="mov-rangeArrow"><FontAwesomeIcon icon={faArrowRightLong} /></span>
          <span>{formatDateUI(to)}</span>
        </>
      );
    }
    if (from) return `Desde ${formatDateUI(from)}`;
    return `Hasta ${formatDateUI(to)}`;
  }, [dateRange]);

  /* =========================
     Export
  ========================= */
  const exportBaseName = useMemo(() => {
    const { from, to } = dateRange;
    const rangeStamp = `${formatDateISO(from)}_${formatDateISO(to || from)}`;
    return `Analisis_Financiero_${sanitizeFilePart(rangeStamp)}`;
  }, [dateRange]);

  const buildExportRows = useCallback(() => {
    if (!allRows.length) throw new Error("No hay datos para exportar.");
    return allRows.map((r) => ({ CONCEPTO: safeText(r.concepto), IMPORTE: numOrNull(r.importe) }));
  }, [allRows]);

  const exportToExcel = useCallback(() => {
    const exportData = buildExportRows();
    const wb = XLSX.utils.book_new();
    const wsTabla = XLSX.utils.json_to_sheet(exportData, { header: ["CONCEPTO", "IMPORTE"] });
    wsTabla["!cols"] = [{ wch: 40 }, { wch: 18 }];
    if (wsTabla["!ref"]) {
      const range = XLSX.utils.decode_range(wsTabla["!ref"]);
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cell = wsTabla[`B${r + 1}`];
        if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00';
      }
    }
    const resumenData = [
      { CAMPO: "DESDE", VALOR: formatDateISO(dateRange.from) },
      { CAMPO: "HASTA", VALOR: formatDateISO(dateRange.to || dateRange.from) },
      { CAMPO: "VENTAS", VALOR: numOrNull(ventas) },
      { CAMPO: "RESULTADO_NETO", VALOR: numOrNull(resultadoNeto) },
    ];
    const wsResumen = XLSX.utils.json_to_sheet(resumenData, { header: ["CAMPO", "VALOR"] });
    wsResumen["!cols"] = [{ wch: 22 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsTabla, "Analisis");
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.writeFile(wb, `${exportBaseName}.xlsx`);
  }, [buildExportRows, exportBaseName, dateRange, ventas, resultadoNeto]);

  const exportToCSV = useCallback(() => {
    const exportData = buildExportRows();
    const headers = ["CONCEPTO", "IMPORTE"];
    const lines = [headers.join(";"), ...exportData.map((row) => headers.map((h) => escapeCSV(row[h])).join(";"))];
    downloadBlob("\uFEFF" + lines.join("\n"), `${exportBaseName}.csv`, "text/csv;charset=utf-8;");
  }, [buildExportRows, exportBaseName]);

  const exportToTXT = useCallback(() => {
    const exportData = buildExportRows();
    const lines = exportData.map((row, i) => [
      `REGISTRO ${i + 1}`,
      `CONCEPTO: ${row.CONCEPTO}`,
      `IMPORTE: ${row.IMPORTE ?? ""}`,
      "----------------------------------------",
    ].join("\n"));
    downloadBlob(lines.join("\n"), `${exportBaseName}.txt`, "text/plain;charset=utf-8;");
  }, [buildExportRows, exportBaseName]);

  const handleExport = useCallback(async (type) => {
    try {
      if (type === "excel") { exportToExcel(); showToast("exito", "Excel exportado.", 2200); return; }
      if (type === "csv")   { exportToCSV();   showToast("exito", "CSV exportado.",   2200); return; }
      if (type === "txt")   { exportToTXT();   showToast("exito", "TXT exportado.",   2200); }
    } catch (e) {
      showToast("error", e?.message || "Error exportando archivo.", 3500);
    }
  }, [exportToExcel, exportToCSV, exportToTXT, showToast]);

  const exportOptions = useMemo(() => [
    { key: "excel", label: "Exportar Excel (.xlsx)", icon: faFileExcel, onClick: () => handleExport("excel") },
    { key: "csv",   label: "Exportar CSV (.csv)",               onClick: () => handleExport("csv")   },
    { key: "txt",   label: "Exportar TXT (.txt)",               onClick: () => handleExport("txt")   },
  ], [handleExport]);

  /* =========================
     Skeleton
  ========================= */
  const skelWidths = useMemo(() => ({
    concepto: ["42%", "58%", "50%", "64%", "46%"],
    importe:  ["22%", "28%", "20%", "30%", "24%"],
  }), []);

  const renderSkeletonRow = (idx) => (
    <div key={`skel-${idx}`} className="mov-gridTable mov-gridTable--row mov-row--skeleton" style={{ gridTemplateColumns: gridCols }} role="row" aria-hidden="true">
      <div className="mov-gridCell" role="cell">
        <span className="mov-skeletonBar" style={{ width: skelWidths.concepto[idx % skelWidths.concepto.length] }} />
      </div>
      <div className="mov-gridCell is-right" role="cell">
        <span className="mov-skeletonBar" style={{ width: skelWidths.importe[idx % skelWidths.importe.length] }} />
      </div>
    </div>
  );

  const isLoading = loading && showSkeleton;

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="mov-page mov-page--analisisFinanciero">
      {toast && <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />}
      {error && <div className="mov-alert" role="alert">{error}</div>}

      <section className="mov-card mov-card--table">

        {/* ===== HEAD ===== */}
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Análisis Financiero</div>
              <div className="mov-card__hint">
                Mostrando <b>{allRows.length}</b> registros
                {loading && !showSkeleton ? " (actualizando…)" : ""}
              </div>
            </div>

            {/* ===== FILTROS ===== */}
            <div className="mov-headFilters">

              {/* Calendario floating */}
              <div className="mov-filter mov-filter--cal floatingField">
                <button
                  type="button"
                  className={`mov-calTrigger cc-calTrigger ${showCalendario ? "is-open" : ""}`}
                  onClick={() => setShowCalendario((v) => !v)}
                  disabled={loading}
                  title="Seleccionar rango de fechas"
                >
                  {dateRangeLabel}
                  <span className="mov-calTrigger__arrow"><FontAwesomeIcon icon={faChevronDown} /></span>
                </button>
                <span className="floatingLabel floatingLabel--active">
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </span>
                {showCalendario && (
                  <div className="mov-calDropdown">
                    <Calendario
                      value={dateRange}
                      onChange={(newRange) => {
                        setDateRange(newRange);
                        if (newRange?.from && newRange?.to) setShowCalendario(false);
                      }}
                      onClose={() => setShowCalendario(false)}
                    />
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ===== ACCIONES: BotonExportar ===== */}
          <div className="mov-card__actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <BotonExportar
              disabled={loading || allRows.length === 0}
              loading={false}
              label="Exportar"
              title={allRows.length ? "Exportar archivo" : "No hay datos para exportar"}
              opciones={exportOptions}
              align="right"
            />
          </div>
        </div>

        {/* ===== HEADER TABLA ===== */}
        <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: gridCols }} role="row">
          <div className="mov-gridCell mov-gridCell--head" role="columnheader">CONCEPTO</div>
          <div className="mov-gridCell mov-gridCell--head is-right" role="columnheader">IMPORTE</div>
        </div>

        {/* ===== BODY ===== */}
        <div className="mov-tableWrap mov-tableWrap--af" role="rowgroup">
          <div className={["mov-gridBody ", isLoading ? "mov-softLoading" : ""].join(" ")}>
            {isLoading ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {!!data && allRows.map((r) => {
                  const conceptoLower = safeText(r.concepto).toLowerCase();
                  const isResultado = conceptoLower === "resultado neto" || r.tipo === "resultado" || safeText(r.id).toLowerCase() === "resultado_neto";
                  const isEgreso = r.tipo === "egreso";
                  const isIngreso = r.tipo === "ingreso";
                  const importeNeg = Number(r.importe) < 0;

                  return (
                    <div
                      key={r.id}
                      className={[
                        "mov-gridTable mov-gridTable--row",
                        isResultado ? "af-row--resultado" : "",
                      ].filter(Boolean).join(" ")}
                      style={{ gridTemplateColumns: gridCols }}
                      role="row"
                    >
                      <div className="mov-gridCell" role="cell" data-label="CONCEPTO">
                        <span className={["mov-ellipsissss af-concept", isResultado ? "af-concept--resultado" : ""].join(" ")}>
                          {r.concepto}
                        </span>
                      </div>
                      <div className="mov-gridCell is-right" role="cell" data-label="IMPORTE">
                        <span className={[
                          "af-importe",
                          isResultado ? (importeNeg ? "af-importe--neg" : "af-importe--pos") : "",
                          !isResultado && isEgreso ? "af-importe--egreso" : "",
                          !isResultado && isIngreso ? "af-importe--ingreso" : "",
                        ].filter(Boolean).join(" ")}>
                          {moneyARS(r.importe)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {hasFetched && !loading && !error && (!data || allRows.length === 0) && (
                  <div className="mov-emptyRow">No hay datos para mostrar en el rango seleccionado.</div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ===== TOTALES ===== */}
        {!loading && !isLoading && data && (
          <div className="af-footTotals">
            <div className={`af-totalCard ${resultadoIsNeg ? "af-totalCard--neg" : "af-totalCard--pos"}`}>
              <div className="af-totalTop">
                <div className="af-totalLabel">Resultado Neto</div>
                <span className={`mov-chip ${resultadoIsNeg ? "mov-chip--warn" : "mov-chip--ok"}`}>
                  {resultadoIsNeg ? "↓ Pérdida" : "↑ Ganancia"}
                </span>
              </div>
              <div className="af-totalValue">{resultadoNeto == null ? "—" : moneyARS(resultadoNeto)}</div>
              <div className="af-totalSub">Ventas − costo variable − costo fijo − otros egresos</div>
            </div>
          </div>
        )}

      </section>
    </div>
  );
}