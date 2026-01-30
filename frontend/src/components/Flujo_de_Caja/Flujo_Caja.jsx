// src/components/Flujo_de_Caja/Flujo_Caja.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import BASE_URL from "../../config/config";
import "./flujo_caja.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileExcel } from "@fortawesome/free-solid-svg-icons";
import Toast from "../Global/Toast.jsx";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

function moneyARS(v) {
  if (v == null || v === "") return "-";
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtDateES(iso) {
  if (!iso) return "-";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

function periodLabelMMYYYY(yyyyMM) {
  const [y, m] = String(yyyyMM || "").split("-");
  if (!y || !m) return String(yyyyMM || "");
  return `${m}-${y}`;
}

function normalizeRows(rawRows) {
  const rr = Array.isArray(rawRows) ? rawRows : [];
  return rr.map((r) => ({
    fecha: String(r?.fecha ?? ""),
    ingresos: r?.ingresos == null ? null : Number(r.ingresos || 0),
    egresos: r?.egresos == null ? null : Number(r.egresos || 0),
    saldo: r?.saldo == null ? null : Number(r.saldo || 0),
  }));
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
  }
}

export default function Flujo_Caja() {
  const API = `${BASE_URL}/api.php`;

  const [periodo, setPeriodo] = useState("");
  const [periodOptions, setPeriodOptions] = useState([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // ✅ 1) traer periodos reales
  const fetchPeriodos = useCallback(async () => {
    setLoadingPeriodos(true);
    try {
      const sp = new URLSearchParams();
      sp.set("action", "flujo_caja_periodos");

      const res = await fetch(`${API}?${sp.toString()}`, { method: "GET" });
      const json = await parseJsonOrThrow(res);

      if (!json?.exito) throw new Error(json?.mensaje || "Error cargando períodos");

      const list = Array.isArray(json?.periodos) ? json.periodos : [];
      setPeriodOptions(list);

      // Por defecto: el más reciente
      if (!periodo) {
        if (list.length) setPeriodo(String(list[0]));
        else setPeriodo("2026-01");
      }
    } catch (e) {
      const msg = e?.message || "Error cargando períodos";
      showToast("error", msg, 4200);
      if (!periodo) setPeriodo("2026-01");
    } finally {
      setLoadingPeriodos(false);
    }
  }, [API, showToast, periodo]);

  useEffect(() => {
    fetchPeriodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 2) cargar resumen cuando haya periodo
  const fetchResumen = useCallback(async () => {
    if (!periodo) return;

    setLoading(true);
    setError("");

    try {
      const sp = new URLSearchParams();
      sp.set("action", "flujo_caja_resumen");
      sp.set("periodo", periodo);

      const res = await fetch(`${API}?${sp.toString()}`, { method: "GET" });
      const json = await parseJsonOrThrow(res);

      if (!json?.exito) throw new Error(json?.mensaje || "Error desconocido en API");
      setData(json);
    } catch (e) {
      setData(null);
      const msg = e?.message || "Error cargando flujo de caja";
      setError(msg);
      showToast("error", msg, 4200);
    } finally {
      setLoading(false);
    }
  }, [API, periodo, showToast]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  const bloque = data?.tiendas?.[0] || null;
  const rowsRaw = bloque?.rows || [];
  const rows = useMemo(() => normalizeRows(rowsRaw), [rowsRaw]);
  const showing = rows.length;

  const exportExcel = useCallback(() => {
    try {
      if (!rows.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      showToast("cargando", "Generando Excel…", 9000);

      const excelRows = rows.map((r) => ({
        Fecha: fmtDateES(r.fecha),
        Ingresos: r.ingresos == null ? "" : Number(r.ingresos),
        Egresos: r.egresos == null ? "" : Number(r.egresos),
        Saldo: r.saldo == null ? "" : Number(r.saldo),
      }));

      const ws = XLSX.utils.json_to_sheet(excelRows);
      ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Flujo ${periodo}`);

      const fileName = `flujo_caja_${String(periodo).replace("-", "_")}.xlsx`;
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), fileName);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [rows, periodo, showToast]);

  const selectDisabled = loading || loadingPeriodos || !periodOptions.length;

  return (
    <div className="fc-page">
      {toast && <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />}

      {error && (
        <div className="fc-alert" role="alert">
          {error}
        </div>
      )}

      <section className="fc-card fc-card--table">
        <div className="fc-card__head">
          <div className="fc-card__headLeft">
            <div className="fc-headTitle">
              <div className="fc-card__title">Flujo de Caja</div>
              <div className="fc-card__hint">
                Mostrando <b>{showing}</b> registros
              </div>
            </div>

            <div className="fc-headFilters">
              <div className="fc-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select value={periodo || ""} onChange={(e) => setPeriodo(e.target.value)} disabled={selectDisabled}>
                  {periodOptions.map((p) => (
                    <option key={p} value={p}>
                      {periodLabelMMYYYY(p)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="fc-card__actions">
            <button
              className="fc-btn"
              onClick={exportExcel}
              disabled={loading || rows.length === 0}
              title={rows.length ? "Exportar a Excel" : "No hay datos para exportar"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>

        {loading && !data && <div className="fc-emptyRow">Cargando flujo de caja...</div>}

        {bloque ? (
          <>
            <div className="fc-subhead">
              <div className="fc-subhead__name">
                Caja diaria
                <div className="fc-subhead__meta">
                  Período {data?.periodo ?? periodo} • Saldo base: <b>{moneyARS(bloque.saldo_base)}</b>
                </div>
              </div>
            </div>

            <div className="fc-tableWrap">
              <div className="fc-grid fc-grid--head fc-grid--excel">
                <div className="fc-cell">FECHA</div>
                <div className="fc-cell is-center">INGRESOS</div>
                <div className="fc-cell is-center">EGRESOS</div>
                <div className="fc-cell is-center">SALDO</div>
              </div>

              <div className="fc-gridBody" role="rowgroup">
                {rows.map((r) => (
                  <div className="fc-grid fc-grid--row fc-grid--excel" key={r.fecha}>
                    <div className="fc-cell fc-date">{fmtDateES(r.fecha)}</div>
                    <div className="fc-cell fc-num is-center">{moneyARS(r.ingresos)}</div>
                    <div className="fc-cell fc-num is-center fc-eg">{moneyARS(r.egresos)}</div>
                    <div className={`fc-cell fc-num is-center fc-saldo ${Number(r.saldo) < 0 ? "is-negative" : "is-positive"}`}>
                      {moneyARS(r.saldo)}
                    </div>
                  </div>
                ))}

                {!loading && rows.length === 0 && <div className="fc-emptyRow">No hay datos para mostrar.</div>}
              </div>
            </div>

            <div className="fc-footnote">
              * El saldo del día 01 arranca desde el “Saldo base” y se actualiza con (ingresos − egresos) de cada día.
            </div>
          </>
        ) : (
          !loading && <div className="fc-emptyRow">No hay datos para mostrar.</div>
        )}
      </section>
    </div>
  );
}
