// src/components/Analisis_Financiero/Analisis_Financiero.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import BASE_URL from "../../config/config";
import "./analisis_financiero.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel } from "@fortawesome/free-solid-svg-icons";

// ✅ Toast global (igual que Movimientos)
import Toast from "../Global/Toast.jsx";

// ✅ GIF carga
import GifCarga from "../Global/Gif_Carga.jsx";
import "../Global/gif_carga.css";

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
  if (idxVentas >= 0) base[idxVentas] = { ...base[idxVentas], concepto: "VENTAS", tipo: "ingreso", importe: ventas };

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
   ✅ Auth (X-Session) — igual que Movimientos
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

function buildHeadersGET() {
  const { sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  return h;
}

async function fetchJSON(url) {
  const r = await fetch(url, { method: "GET", headers: buildHeadersGET() });

  // Si tu backend devuelve 401 cuando la sesión no sirve, lo mostramos claro
  if (r.status === 401) {
    throw new Error("401 (Unauthorized): Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }

  const txt = await r.text();
  if (!txt) throw new Error("Respuesta vacía del servidor.");

  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`Respuesta inválida (${r.status}): ${txt.slice(0, 180)}`);
  }
}

export default function Analisis_Financiero() {
  const API = `${BASE_URL}/api.php`;

  const [periodo, setPeriodo] = useState("");
  const [periodOptions, setPeriodOptions] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  /* =========================
     ✅ TOAST GLOBAL
  ========================= */
  const [toast, setToast] = useState(null);

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  /* =========================
     ✅ Cargar períodos reales desde movimientos
     action=analisis_financiero_periodos
  ========================= */
  const fetchPeriodos = useCallback(async () => {
    setLoadingPeriodos(true);
    setError("");

    try {
      const url = `${API}?action=analisis_financiero_periodos`;
      const json = await fetchJSON(url);

      if (!json?.exito) throw new Error(json?.mensaje || "Error cargando períodos");

      const arr = Array.isArray(json?.periodos) ? json.periodos : [];
      setPeriodOptions(arr);

      if (!arr.length) {
        setPeriodo("");
        setData(null);
        showToast("error", "No hay períodos en movimientos.", 3200);
        return;
      }

      if (!periodo || !arr.includes(periodo)) {
        setPeriodo(arr[0]);
      }
    } catch (e) {
      const msg = e?.message || "Error cargando períodos";
      setError(msg);
      showToast("error", msg, 4200);
      setPeriodOptions([]);
      setPeriodo("");
      setData(null);
    } finally {
      setLoadingPeriodos(false);
    }
  }, [API, periodo, showToast]);

  useEffect(() => {
    fetchPeriodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     ✅ Cargar análisis cuando hay período seleccionado
  ========================= */
  const fetchAnalisis = useCallback(async () => {
    if (!periodo) return;

    setLoading(true);
    setError("");

    try {
      const sp = new URLSearchParams();
      sp.set("action", "analisis_financiero_resumen");
      sp.set("periodo", periodo);

      const url = `${API}?${sp.toString()}`;
      const json = await fetchJSON(url);

      if (!json?.exito) throw new Error(json?.mensaje || "Error desconocido en API");
      setData(json);
    } catch (e) {
      setData(null);
      const msg = e?.message || "Error cargando análisis financiero";
      setError(msg);
      showToast("error", msg, 4200);
    } finally {
      setLoading(false);
    }
  }, [API, periodo, showToast]);

  useEffect(() => {
    fetchAnalisis();
  }, [fetchAnalisis]);

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
  const resultadoNeto = allRows.find((r) => safeText(r.id).toLowerCase() === "resultado_neto")?.importe ?? null;
  const gastosPersonales = allRows.find((r) => safeText(r.id).toLowerCase() === "gastos_personales")?.importe ?? null;

  const resultadoIsNeg = Number(resultadoNeto) < 0;

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

  const disableUI = loading || loadingPeriodos;

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
                {disableUI ? (
                  <>Cargando…</>
                ) : (
                  <>
                    Mostrando <b>{showing}</b> registros
                  </>
                )}
              </div>
            </div>

            <div className="af-headFilters">
              <div className="af-filter">
                <label>Período</label>
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={disableUI || periodOptions.length === 0}
                >
                  {periodOptions.length === 0 ? (
                    <option value="">Sin períodos</option>
                  ) : (
                    periodOptions.map((p) => (
                      <option key={p} value={p}>
                        {periodLabelMMYYYY(p)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="af-filter af-filter--search">
                <label>Buscar</label>

                <div className="af-searchInput">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Ej: ventas, costo fijo, gastos..."
                    disabled={disableUI}
                  />

                  {q.trim() !== "" && !disableUI && (
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
              disabled={disableUI || !data || filteredRows.length === 0}
              title={!data ? "Primero cargá datos" : "Exportar tabla a Excel"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>

        {/* ✅ TABLA: si está cargando, mostramos el GIF dentro del body */}
        <div className="af-tableWrap">
          <div className="af-grid af-grid--head af-grid--excel">
            <div className="af-cell">CONCEPTO</div>
            <div className="af-cell is-right">IMPORTE</div>
          </div>

          <div className="af-gridBody" role="rowgroup">
            {disableUI && (
              <div className="af-emptyRow af-emptyRow--loading">
                <GifCarga />
              </div>
            )}

            {!disableUI &&
              data &&
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

            {!disableUI && data && filteredRows.length === 0 && (
              <div className="af-emptyRow">No hay datos para mostrar.</div>
            )}

            {!disableUI && !data && !error && (
              <div className="af-emptyRow">No hay datos para mostrar.</div>
            )}
          </div>
        </div>

        {/* ✅ RESTO del layout solo cuando hay data y NO está cargando */}
        {!disableUI && data && (
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
      </section>
    </div>
  );
}
