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
  faMoneyBillTrendUp,
  faArrowDown,
  faChartLine,
  faWallet,
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

function escapeCSV(value) {
  const s = String(value ?? "");
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function getMetricIcon(row) {
  const tipo = safeText(row?.tipo).toLowerCase();
  const id = safeText(row?.id).toLowerCase();
  const concepto = safeText(row?.concepto).toLowerCase();

  if (tipo === "ingreso" || id.includes("venta") || concepto.includes("venta")) {
    return faMoneyBillTrendUp;
  }

  if (tipo === "egreso" || concepto.includes("costo") || concepto.includes("egreso")) {
    return faArrowDown;
  }

  return faChartLine;
}

function getMetricTone(row) {
  const tipo = safeText(row?.tipo).toLowerCase();
  const concepto = safeText(row?.concepto).toLowerCase();

  if (tipo === "ingreso" || concepto.includes("venta")) return "ingreso";
  if (tipo === "egreso" || concepto.includes("costo") || concepto.includes("egreso")) return "egreso";
  return "neutral";
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

function isDisponibilidadRow(row) {
  const tipo = safeText(row?.tipo).toLowerCase();
  const id = safeText(row?.id).toLowerCase();
  const concepto = safeText(row?.concepto ?? row?.nombre).toLowerCase();

  return (
    tipo === "disponibilidad" ||
    tipo === "caja" ||
    tipo === "banco" ||
    tipo === "saldo" ||
    id.includes("caja") ||
    id.includes("banco") ||
    concepto.includes("caja") ||
    concepto.includes("banco") ||
    concepto.includes("efectivo")
  );
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

  const filtered = base.filter((r) => safeText(r.id).toLowerCase() !== "gastos_personales");

  const idxRes = filtered.findIndex((r) => {
    const id = safeText(r.id).toLowerCase();
    const c = safeText(r.concepto).toLowerCase();
    return id === "resultado_neto" || c === "resultado neto" || (c.includes("resultado") && c.includes("neto"));
  });

  const rowResultado = {
    id: "resultado_neto",
    concepto: "RESULTADO NETO",
    importe: resultadoNeto,
    tipo: "resultado",
  };

  if (idxRes >= 0) filtered[idxRes] = { ...filtered[idxRes], ...rowResultado };
  else filtered.push(rowResultado);

  const idxVentas = filtered.findIndex((r) => safeText(r.id).toLowerCase() === "ventas");
  if (idxVentas >= 0) {
    filtered[idxVentas] = {
      ...filtered[idxVentas],
      concepto: "VENTAS",
      tipo: "ingreso",
      importe: ventas,
    };
  }

  const markTipo = (id, tipo) => {
    const i = filtered.findIndex((r) => safeText(r.id).toLowerCase() === id);
    if (i >= 0) filtered[i] = { ...filtered[i], tipo };
  };

  markTipo("costo_variable", "egreso");
  markTipo("costo_fijo", "egreso");
  markTipo("otros_egresos", "egreso");

  return filtered;
}

function normalizeDisponibilidades(raw, fallbackRows = []) {
  const mapItem = (r, idx) => {
    const importe = toNumberOrZero(r?.importe ?? r?.saldo ?? r?.monto ?? r?.total);
    return {
      id: safeText(r?.id ?? r?.id_caja ?? r?.idCaja ?? `${idx}`),
      nombre: safeText(
        r?.nombre ??
          r?.caja ??
          r?.label ??
          r?.concepto ??
          r?.descripcion ??
          `Caja ${idx + 1}`
      ),
      importe,
      tipo: safeText(r?.tipo ?? "disponibilidad"),
    };
  };

  if (Array.isArray(raw)) {
    return raw.map(mapItem).filter((x) => x.nombre);
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw)
      .map(([key, value], idx) => {
        if (value && typeof value === "object") {
          return {
            id: safeText(value?.id ?? key),
            nombre: safeText(value?.nombre ?? value?.caja ?? key),
            importe: toNumberOrZero(value?.importe ?? value?.saldo ?? value?.monto ?? value?.total),
            tipo: safeText(value?.tipo ?? "disponibilidad"),
          };
        }

        return {
          id: safeText(key),
          nombre: safeText(key),
          importe: toNumberOrZero(value),
          tipo: "disponibilidad",
        };
      })
      .filter((x) => x.nombre);
  }

  if (Array.isArray(fallbackRows)) {
    return fallbackRows
      .filter((r) => isDisponibilidadRow(r))
      .map((r, idx) => ({
        id: safeText(r.id ?? `${idx}`),
        nombre: safeText(r.concepto ?? r.nombre ?? `Caja ${idx + 1}`),
        importe: toNumberOrZero(r.importe),
        tipo: safeText(r.tipo ?? "disponibilidad"),
      }));
  }

  return [];
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
  if (res.status === 401) {
    throw new Error("401 (Unauthorized): Sesión vencida. Volvé a iniciar sesión.");
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

const SKELETON_ROWS = 5;

export default function Analisis_Financiero() {
  const API = `${BASE_URL}/api.php`;

  const { dateRange, setDateRange } = useDateRange();
  const [showCalendario, setShowCalendario] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => setToast({ tipo, mensaje, duracion }),
    []
  );
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

  useEffect(() => {
    return () => {
      if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    };
  }, []);

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

      const res = await fetch(`${API}?${sp.toString()}`, {
        method: "GET",
        headers: authHeaders(),
      });

      const json = await parseJsonOrThrow(res);

      if (!res.ok || !json?.exito) {
        throw new Error(json?.mensaje || `Error desconocido (HTTP ${res.status})`);
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
  }, [API, dateRange, showToast, beginSkeleton, endSkeleton]);

  useEffect(() => {
    fetchAnalisis();
  }, [fetchAnalisis]);

  /* =========================
     Datos normalizados
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

  const mainRows = useMemo(
    () => allRows.filter((r) => !isDisponibilidadRow(r)),
    [allRows]
  );

  const disponibilidadesRaw =
    data?.disponibilidades ??
    data?.data?.disponibilidades ??
    data?.cajas ??
    data?.data?.cajas ??
    data?.disponibilidad ??
    data?.data?.disponibilidad ??
    null;

  const disponibilidades = useMemo(
    () => normalizeDisponibilidades(disponibilidadesRaw, normalized),
    [disponibilidadesRaw, normalized]
  );

  const ventas =
    mainRows.find((r) => safeText(r.id).toLowerCase() === "ventas")?.importe ?? 0;

  const costoVariable =
    mainRows.find((r) => safeText(r.id).toLowerCase() === "costo_variable")?.importe ??
    findImporte(mainRows, [{ includes: ["costo variable", "variable"] }]);

  const costoFijo =
    mainRows.find((r) => safeText(r.id).toLowerCase() === "costo_fijo")?.importe ??
    findImporte(mainRows, [{ includes: ["costo fijo", "fijo"] }]);

  const otrosEgresos =
    mainRows.find((r) => safeText(r.id).toLowerCase() === "otros_egresos")?.importe ??
    findImporte(mainRows, [{ includes: ["otros egresos", "egresos"] }]);

  const resultadoNeto =
    mainRows.find((r) => safeText(r.id).toLowerCase() === "resultado_neto")?.importe ??
    ventas - costoVariable - costoFijo - otrosEgresos;

  const resultadoIsNeg = Number(resultadoNeto) < 0;

  const totalDisponibilidades = useMemo(
    () => disponibilidades.reduce((acc, item) => acc + toNumberOrZero(item.importe), 0),
    [disponibilidades]
  );

  const resumenCards = useMemo(
    () => [
      {
        id: "ventas",
        label: "Ventas",
        value: ventas,
        sub: "Ingresos del período",
        variant: "ingreso",
      },
      {
        id: "costo_variable",
        label: "Costo variable",
        value: costoVariable,
        sub: "Costos variables del período",
        variant: "egreso",
      },
      {
        id: "costo_fijo",
        label: "Costo fijo",
        value: costoFijo,
        sub: "Costos fijos del período",
        variant: "egreso",
      },
      {
        id: "otros_egresos",
        label: "Otros egresos",
        value: otrosEgresos,
        sub: "Egresos no operativos",
        variant: "egreso",
      },
    ],
    [ventas, costoVariable, costoFijo, otrosEgresos]
  );

  /* =========================
     Label calendario
  ========================= */
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

  /* =========================
     Export
  ========================= */
  const exportBaseName = useMemo(() => {
    const { from, to } = dateRange;
    const rangeStamp = `${formatDateISO(from)}_${formatDateISO(to || from)}`;
    return `Analisis_Financiero_${sanitizeFilePart(rangeStamp)}`;
  }, [dateRange]);

  const buildExportData = useCallback(() => {
    if (!mainRows.length && !disponibilidades.length) {
      throw new Error("No hay datos para exportar.");
    }

    return {
      analisis: mainRows.map((r) => ({
        CONCEPTO: safeText(r.concepto),
        IMPORTE: numOrNull(r.importe),
      })),
      disponibilidades: disponibilidades.map((d) => ({
        CAJA: safeText(d.nombre),
        IMPORTE: numOrNull(d.importe),
      })),
    };
  }, [mainRows, disponibilidades]);

  const exportToExcel = useCallback(() => {
    const exportData = buildExportData();

    const wb = XLSX.utils.book_new();

    const wsTabla = XLSX.utils.json_to_sheet(exportData.analisis, {
      header: ["CONCEPTO", "IMPORTE"],
    });
    wsTabla["!cols"] = [{ wch: 40 }, { wch: 18 }];

    if (wsTabla["!ref"]) {
      const range = XLSX.utils.decode_range(wsTabla["!ref"]);
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        const cell = wsTabla[`B${r + 1}`];
        if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00';
      }
    }

    XLSX.utils.book_append_sheet(wb, wsTabla, "Analisis");

    if (exportData.disponibilidades.length) {
      const wsDisp = XLSX.utils.json_to_sheet(exportData.disponibilidades, {
        header: ["CAJA", "IMPORTE"],
      });
      wsDisp["!cols"] = [{ wch: 34 }, { wch: 18 }];

      if (wsDisp["!ref"]) {
        const range = XLSX.utils.decode_range(wsDisp["!ref"]);
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const cell = wsDisp[`B${r + 1}`];
          if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00';
        }
      }

      XLSX.utils.book_append_sheet(wb, wsDisp, "Disponibilidades");
    }

    const resumenData = [
      { CAMPO: "DESDE", VALOR: formatDateISO(dateRange.from) },
      { CAMPO: "HASTA", VALOR: formatDateISO(dateRange.to || dateRange.from) },
      { CAMPO: "VENTAS", VALOR: numOrNull(ventas) },
      { CAMPO: "COSTO_VARIABLE", VALOR: numOrNull(costoVariable) },
      { CAMPO: "COSTO_FIJO", VALOR: numOrNull(costoFijo) },
      { CAMPO: "OTROS_EGRESOS", VALOR: numOrNull(otrosEgresos) },
      { CAMPO: "RESULTADO_NETO", VALOR: numOrNull(resultadoNeto) },
      { CAMPO: "TOTAL_DISPONIBILIDADES", VALOR: numOrNull(totalDisponibilidades) },
    ];

    const wsResumen = XLSX.utils.json_to_sheet(resumenData, {
      header: ["CAMPO", "VALOR"],
    });
    wsResumen["!cols"] = [{ wch: 24 }, { wch: 24 }];

    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
    XLSX.writeFile(wb, `${exportBaseName}.xlsx`);
  }, [
    buildExportData,
    exportBaseName,
    dateRange,
    ventas,
    costoVariable,
    costoFijo,
    otrosEgresos,
    resultadoNeto,
    totalDisponibilidades,
  ]);

  const exportToCSV = useCallback(() => {
    const exportData = buildExportData();

    const blocks = [];

    blocks.push("ANALISIS FINANCIERO");
    blocks.push("CONCEPTO;IMPORTE");
    exportData.analisis.forEach((row) => {
      blocks.push(`${escapeCSV(row.CONCEPTO)};${escapeCSV(row.IMPORTE)}`);
    });

    if (exportData.disponibilidades.length) {
      blocks.push("");
      blocks.push("DISPONIBILIDADES");
      blocks.push("CAJA;IMPORTE");
      exportData.disponibilidades.forEach((row) => {
        blocks.push(`${escapeCSV(row.CAJA)};${escapeCSV(row.IMPORTE)}`);
      });
    }

    downloadBlob(
      "\uFEFF" + blocks.join("\n"),
      `${exportBaseName}.csv`,
      "text/csv;charset=utf-8;"
    );
  }, [buildExportData, exportBaseName]);

  const exportToTXT = useCallback(() => {
    const exportData = buildExportData();

    const lines = [];
    lines.push("ANALISIS FINANCIERO");
    lines.push("----------------------------------------");

    exportData.analisis.forEach((row, i) => {
      lines.push(`REGISTRO ${i + 1}`);
      lines.push(`CONCEPTO: ${row.CONCEPTO}`);
      lines.push(`IMPORTE: ${row.IMPORTE ?? ""}`);
      lines.push("----------------------------------------");
    });

    if (exportData.disponibilidades.length) {
      lines.push("");
      lines.push("DISPONIBILIDADES");
      lines.push("----------------------------------------");

      exportData.disponibilidades.forEach((row, i) => {
        lines.push(`CAJA ${i + 1}`);
        lines.push(`NOMBRE: ${row.CAJA}`);
        lines.push(`IMPORTE: ${row.IMPORTE ?? ""}`);
        lines.push("----------------------------------------");
      });
    }

    downloadBlob(
      lines.join("\n"),
      `${exportBaseName}.txt`,
      "text/plain;charset=utf-8;"
    );
  }, [buildExportData, exportBaseName]);

  const handleExport = useCallback(
    async (type) => {
      try {
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
    [exportToExcel, exportToCSV, exportToTXT, showToast]
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

  const isLoading = loading && showSkeleton;

  return (
    <div className="mov-page mov-page--analisisFinanciero">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
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
              <div className="mov-card__title">Análisis Financiero</div>
              <div className="mov-card__hint">
                Mostrando <b>{mainRows.length}</b> registros
                {loading && !showSkeleton ? " (actualizando…)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="mov-filter mov-filter--cal floatingField">
                <button
                  type="button"
                  className={`mov-calTrigger cc-calTrigger ${showCalendario ? "is-open" : ""}`}
                  onClick={() => setShowCalendario((v) => !v)}
                  disabled={loading}
                  title="Seleccionar rango de fechas"
                >
                  {dateRangeLabel}
                  <span className="mov-calTrigger__arrow">
                    <FontAwesomeIcon icon={faChevronDown} />
                  </span>
                </button>

                <span className="floatingLabel floatingLabel--active">
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </span>

                {showCalendario && (
                  <div className="mov-calDropdown" id="clrRight">
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

          <div
            className="mov-card__actions"
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <BotonExportar
              disabled={loading || (mainRows.length === 0 && disponibilidades.length === 0)}
              loading={false}
              label="Exportar"
              title={
                mainRows.length || disponibilidades.length
                  ? "Exportar archivo"
                  : "No hay datos para exportar"
              }
              opciones={exportOptions}
              align="right"
            />
          </div>
        </div>



        <div className="af-breakdownSection">
          <div className="af-sectionHead af-sectionHead--breakdown">
            <div>
              <div className="af-sectionTitle af-sectionTitle--light">
                Resumen del período
              </div>

            </div>
          </div>

          {isLoading ? (
            <div className="af-breakdownGrid af-breakdownGrid--skeleton">
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <div key={`af-card-skel-${i}`} className="af-breakCard af-breakCard--skeleton">
                  <span className="af-cardIconSkeleton" />
                  <span
                    className="mov-skeletonBar"
                    style={{ width: i % 2 === 0 ? "42%" : "58%", marginBottom: 10 }}
                  />
                  <span
                    className="mov-skeletonBar"
                    style={{ width: i % 2 === 0 ? "66%" : "54%", height: 18, marginBottom: 10 }}
                  />
                  <span
                    className="mov-skeletonBar"
                    style={{ width: i % 2 === 0 ? "48%" : "62%" }}
                  />
                </div>
              ))}
            </div>
          ) : data && mainRows.length > 0 ? (
            <div className="af-breakdownGrid">
              {mainRows
                .filter((r) => {
                  const conceptoLower = safeText(r.concepto).toLowerCase();
                  const isResultado =
                    conceptoLower === "resultado neto" ||
                    r.tipo === "resultado" ||
                    safeText(r.id).toLowerCase() === "resultado_neto";

                  return !isResultado;
                })
                .map((r) => {
                  const isEgreso = r.tipo === "egreso";
                  const isIngreso = r.tipo === "ingreso";
                  const tone = getMetricTone(r);

                  return (
                    <article
                      key={r.id}
                      className={[
                        "af-breakCard",
                        `af-breakCard--${tone}`,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="af-breakCard__icon" aria-hidden="true">
                        <FontAwesomeIcon icon={getMetricIcon(r)} />
                      </div>

                      <div className="af-breakCard__body">
                        <span className="af-breakCard__label">{r.concepto}</span>

                        <strong
                          className={[
                            "af-breakCard__value",
                            isIngreso ? "af-breakCard__value--ingreso" : "",
                            isEgreso ? "af-breakCard__value--egreso" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {moneyARS(r.importe)}
                        </strong>

                        <span className="af-breakCard__sub">
                          {isIngreso
                            ? "Impacto positivo en el período"
                            : isEgreso
                            ? "Salida de dinero del período"
                            : "Valor calculado del período"}
                        </span>
                      </div>
                    </article>
                  );
                })}
            </div>
          ) : (
            !loading &&
            hasFetched && (
              <div className="mov-emptyRow af-emptyBlock">
                No hay movimientos para mostrar en el rango seleccionado.
              </div>
            )
          )}
        </div>

        {!loading && !isLoading && data && (
          <div className="af-footTotals">
            <article
              className={`af-totalCard ${
                resultadoIsNeg ? "af-totalCard--neg" : "af-totalCard--pos"
              }`}
            >
              <div className="af-totalCard__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faChartLine} />
              </div>

              <div className="af-totalCard__body">
                <span className="af-totalLabel">Resultado Neto</span>

                <strong className="af-totalValue">
                  {resultadoNeto == null ? "—" : moneyARS(resultadoNeto)}
                </strong>

                <span className="af-totalSub">
                  {resultadoIsNeg ? "Pérdida" : "Ganancia"} del período · Ventas − costos − egresos
                </span>
              </div>
            </article>
          </div>
        )}

{(isLoading || disponibilidades.length > 0) && (
  <div className="af-dispoSection">
    <div className="af-sectionHead">
      <div>
        <div className="af-sectionTitle">Disponibilidades</div>
      </div>

      <div className="af-dispoTotal">
        Total disponible: <strong>{moneyARS(totalDisponibilidades)}</strong>
      </div>
    </div>

    {isLoading ? (
      <div className="af-dispoGrid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`dispo-skel-${i}`} className="af-dispoCard af-breakCard--skeleton">
            <span className="af-cardIconSkeleton" />
            <span
              className="mov-skeletonBar"
              style={{ width: i % 2 === 0 ? "40%" : "55%", marginBottom: 10 }}
            />
            <span
              className="mov-skeletonBar"
              style={{ width: i % 2 === 0 ? "62%" : "48%", height: 18, marginBottom: 10 }}
            />
            <span
              className="mov-skeletonBar"
              style={{ width: i % 2 === 0 ? "45%" : "58%" }}
            />
          </div>
        ))}
      </div>
    ) : (
      <div className="af-dispoGrid">
        {disponibilidades.map((item) => (
          <article key={item.id} className="af-dispoCard">
            <div className="af-dispoCard__icon" aria-hidden="true">
              <FontAwesomeIcon icon={faWallet} />
            </div>

            <div className="af-dispoCard__body">
              <span className="af-dispoCard__label">{item.nombre}</span>
              <strong className="af-dispoCard__value">{moneyARS(item.importe)}</strong>
              <span className="af-dispoCard__sub">Saldo disponible</span>
            </div>
          </article>
        ))}
      </div>
    )}
  </div>
)}
      </section>
    </div>
  );
}