// src/components/Analisis_Financiero/Analisis_Financiero.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import BASE_URL from "../../config/config";
import "./analisis_financiero.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faTrashCan,
  faPlus,
  faBroom,
  faMagnifyingGlass,
  faCalendarDays,
  faFileExcel,
} from "@fortawesome/free-solid-svg-icons";


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

// ✅ Periodos fijos: 2026-01 a 2026-12 (valor para API = YYYY-MM)
function buildPeriodOptions2026() {
  const out = [];
  for (let m = 1; m <= 12; m++) out.push(`2026-${String(m).padStart(2, "0")}`);
  return out;
}

// ✅ Label visual: MM-YYYY (solo display)
function periodLabelMMYYYY(yyyyMM) {
  const [y, m] = String(yyyyMM || "").split("-");
  if (!y || !m) return String(yyyyMM || "");
  return `${m}-${y}`;
}

function safeText(v) {
  return String(v ?? "").trim();
}

function normalizeRows(raw) {
  // La API puede venir como:
  // 1) rows: [{ concepto, importe, tipo }]
  // 2) valores: { ventas, costo_variable, costo_fijo, otros_egresos, gastos_personales, ... }
  // Soportamos ambos formatos.

  // Caso 1: array ya listo
  if (Array.isArray(raw)) {
    return raw
      .map((r, idx) => ({
        id: r?.id ?? `${idx}`,
        concepto: safeText(r?.concepto ?? r?.nombre ?? r?.label ?? ""),
        importe: r?.importe == null ? null : Number(r.importe || 0),
        tipo: safeText(r?.tipo ?? ""), // opcional: "ingreso" / "egreso" / "resultado"
      }))
      .filter((x) => x.concepto);
  }

  // Caso 2: objeto valores (tipo Excel)
  if (raw && typeof raw === "object") {
    const ventas = Number(raw?.ventas ?? 0);
    const costoVar = Number(raw?.costo_variable ?? raw?.costoVariable ?? 0);
    const costoFijo = Number(raw?.costo_fijo ?? raw?.costoFijo ?? 0);
    const otrosEgresos = Number(raw?.otros_egresos ?? raw?.otrosEgresos ?? 0);
    const gastosPers = Number(raw?.gastos_personales ?? raw?.gastosPersonales ?? 0);

    const resultadoNeto = ventas - costoVar - costoFijo - otrosEgresos;

    const out = [
      { id: "ventas", concepto: "VENTAS", importe: ventas, tipo: "ingreso" },
      { id: "costo_variable", concepto: "COSTO VARIABLE", importe: costoVar, tipo: "egreso" },
      { id: "costo_fijo", concepto: "COSTO FIJO", importe: costoFijo, tipo: "egreso" },
      { id: "otros_egresos", concepto: "OTROS EGRESOS", importe: otrosEgresos, tipo: "egreso" },
      { id: "resultado_neto", concepto: "RESULTADO NETO", importe: resultadoNeto, tipo: "resultado" },
    ];

    // Gastos personales aparte (como tu Excel)
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

export default function Analisis_Financiero() {
  const API = `${BASE_URL}/api.php`;

  const [periodo, setPeriodo] = useState("2026-01");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const periodOptions = useMemo(() => buildPeriodOptions2026(), []);

  const fetchAnalisis = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sp = new URLSearchParams();
      sp.set("action", "analisis_financiero_resumen");
      sp.set("periodo", periodo);

      const url = `${API}?${sp.toString()}`;
      const res = await fetch(url, { method: "GET" });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Respuesta inválida (no JSON). HTTP ${res.status} - ${text.slice(0, 180)}`
        );
      }

      if (!json?.exito) {
        throw new Error(json?.mensaje || "Error desconocido en API");
      }

      setData(json);
    } catch (e) {
      setData(null);
      setError(e?.message || "Error cargando análisis financiero");
    } finally {
      setLoading(false);
    }
  }, [API, periodo]);

  useEffect(() => {
    fetchAnalisis();
  }, [fetchAnalisis]);

  // ✅ soporta múltiples formas de payload
  const rawRows =
    data?.rows ??
    data?.data?.rows ??
    data?.valores ??
    data?.data?.valores ??
    data?.analisis ??
    data?.data?.analisis ??
    null;

  const allRows = useMemo(() => normalizeRows(rawRows), [rawRows]);

  const filteredRows = useMemo(() => {
    const needle = safeText(q).toLowerCase();
    if (!needle) return allRows;
    return allRows.filter((r) => safeText(r.concepto).toLowerCase().includes(needle));
  }, [allRows, q]);

  const showing = filteredRows.length;

  // Totales (si vienen en API o los calculamos)
  const ventas = allRows.find((r) => r.id === "ventas")?.importe ?? null;
  const resultadoNeto = allRows.find((r) => r.id === "resultado_neto")?.importe ?? null;
  const gastosPersonales = allRows.find((r) => r.id === "gastos_personales")?.importe ?? null;

  const resultadoIsNeg = Number(resultadoNeto) < 0;

  /* =========================
     ✅ Exportar a Excel
  ========================= */
  const handleExportExcel = useCallback(() => {
    try {
      // Hoja principal: tabla
      const tableData = filteredRows.map((r) => ({
        CONCEPTO: safeText(r.concepto),
        IMPORTE: numOrNull(r.importe),
      }));

      // Hoja resumen
      const resumenData = [
        { CAMPO: "PERIODO", VALOR: safeText(data?.periodo ?? periodo) },
        { CAMPO: "VENTAS", VALOR: numOrNull(ventas) },
        { CAMPO: "RESULTADO_NETO", VALOR: numOrNull(resultadoNeto) },
        { CAMPO: "GASTOS_PERSONALES", VALOR: numOrNull(gastosPersonales) },
      ];

      const wb = XLSX.utils.book_new();

      const wsTabla = XLSX.utils.json_to_sheet(tableData, {
        header: ["CONCEPTO", "IMPORTE"],
      });
      // widths
      wsTabla["!cols"] = [{ wch: 40 }, { wch: 18 }];

      const wsResumen = XLSX.utils.json_to_sheet(resumenData, {
        header: ["CAMPO", "VALOR"],
      });
      wsResumen["!cols"] = [{ wch: 22 }, { wch: 24 }];

      XLSX.utils.book_append_sheet(wb, wsTabla, "Analisis");
      XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

      const fileName = `Analisis_Financiero_${sanitizeFilePart(periodLabelMMYYYY(periodo))}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      setError(e?.message || "Error exportando a Excel");
    }
  }, [filteredRows, data, periodo, ventas, resultadoNeto, gastosPersonales]);

  return (
    <div className="af-page">
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
                <label>Período (2026)</label>
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={loading}
                >
                  {periodOptions.map((p) => (
                    <option key={p} value={p}>
                      {periodLabelMMYYYY(p)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="af-filter af-filter--search">
                <label>Buscar</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ej: ventas, costo fijo, gastos..."
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* ✅ Acciones (Excel) */}
          <div className="af-card__actions">
            <button
              type="button"
              className="af-btn af-btn--excel"
              onClick={handleExportExcel}
              disabled={loading || !data || filteredRows.length === 0}
              title={!data ? "Primero cargá datos" : "Exportar tabla a Excel"}
            >
             <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>

        {loading && !data && <div className="af-emptyRow">Cargando análisis financiero...</div>}

        {!loading && data && (
          <>
            <div className="af-subhead">
              <div className="af-subhead__name">
                Resumen
                <div className="af-subhead__meta">
                  Período {data?.periodo ?? periodo}
                  {ventas != null ? (
                    <>
                      {" "}• Ventas: <b>{moneyARS(ventas)}</b>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="af-miniHint">
                Tabla horizontal tipo Excel (Concepto / Importe). Resultado Neto se resalta.
              </div>
            </div>

            <div className="af-tableWrap">
              <div className="af-grid af-grid--head af-grid--excel">
                <div className="af-cell">CONCEPTO</div>
                <div className="af-cell is-right">IMPORTE</div>
              </div>

              <div className="af-gridBody" role="rowgroup">
                {filteredRows.map((r) => {
                  const conceptoLower = safeText(r.concepto).toLowerCase();

                  const isResultado =
                    conceptoLower === "resultado neto" ||
                    r.tipo === "resultado" ||
                    r.id === "resultado_neto";

                  const isGastoPersonal =
                    conceptoLower.includes("gastos personales") || r.id === "gastos_personales";

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

                {!loading && filteredRows.length === 0 && (
                  <div className="af-emptyRow">No hay datos para mostrar.</div>
                )}
              </div>
            </div>

            {/* ✅ Tarjetas mejoradas */}
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

                <div className="af-totalSub">Resultado del período (ventas - costos - egresos)</div>
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

        {!loading && !data && !error && <div className="af-emptyRow">No hay datos para mostrar.</div>}
      </section>
    </div>
  );
}
