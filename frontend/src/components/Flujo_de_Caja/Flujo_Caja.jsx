// src/components/Flujo_de_Caja/Flujo_Caja.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import BASE_URL from "../../config/config";
import "./flujo_caja.css";
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
import { saveAs } from "file-saver";

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

function fmtDateES(iso) {
  if (!iso) return "-";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

// ✅ Periodos fijos: 2026-01 a 2026-12 (valor para API = YYYY-MM)
function buildPeriodOptions2026() {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    out.push(`2026-${String(m).padStart(2, "0")}`);
  }
  return out;
}

// ✅ Label visual: MM-YYYY (solo display)
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

export default function Flujo_Caja() {
  const API = `${BASE_URL}/api.php`;

  const [periodo, setPeriodo] = useState("2026-01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const periodOptions = useMemo(() => buildPeriodOptions2026(), []);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sp = new URLSearchParams();
      sp.set("action", "flujo_caja_resumen");
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
      setError(e?.message || "Error cargando flujo de caja");
    } finally {
      setLoading(false);
    }
  }, [API, periodo]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  const bloque = data?.tiendas?.[0] || null;
  const rowsRaw = bloque?.rows || [];
  const rows = useMemo(() => normalizeRows(rowsRaw), [rowsRaw]);
  const showing = rows.length;

  /* =========================
     Export Excel
  ========================= */
  const exportExcel = useCallback(() => {
    if (!rows.length) return;

    // Datos para Excel (con headers)
    const excelRows = rows.map((r) => ({
      Fecha: fmtDateES(r.fecha),
      Ingresos: r.ingresos == null ? "" : Number(r.ingresos),
      Egresos: r.egresos == null ? "" : Number(r.egresos),
      Saldo: r.saldo == null ? "" : Number(r.saldo),
    }));

    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Formato de columnas (aprox)
    ws["!cols"] = [
      { wch: 12 }, // Fecha
      { wch: 14 }, // Ingresos
      { wch: 14 }, // Egresos
      { wch: 14 }, // Saldo
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Flujo ${periodo}`);

    const fileName = `flujo_caja_${periodo.replace("-", "_")}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), fileName);
  }, [rows, periodo]);

  return (
    <div className="fc-page">
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
            </div>
          </div>

          {/* ✅ Botón Exportar */}
          <div className="fc-card__actions">
            <button
              className="fc-btn"
              onClick={exportExcel}
              disabled={loading || rows.length === 0}
              title={rows.length ? "Exportar a Excel" : "No hay datos para exportar"}
            >
            <FontAwesomeIcon icon={faFileExcel} />  Exportar Excel
            </button>
          </div>
        </div>

        {loading && !data && (
          <div className="fc-emptyRow">Cargando flujo de caja...</div>
        )}

        {bloque ? (
          <>
            <div className="fc-subhead">
              <div className="fc-subhead__name">
                Caja diaria
                <div className="fc-subhead__meta">
                  Período {data?.periodo} • Saldo base:{" "}
                  <b>{moneyARS(bloque.saldo_base)}</b>
                </div>
              </div>

              <div className="fc-miniHint">
                Ingresos = SUM(tipo=1) por fecha • Egresos = SUM(tipo=2) por fecha •
                Saldo acumulado.
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

                    <div className="fc-cell fc-num is-center">
                      {moneyARS(r.ingresos)}
                    </div>

                    <div className="fc-cell fc-num is-center fc-eg">
                      {moneyARS(r.egresos)}
                    </div>

                    <div
                      className={`fc-cell fc-num is-center fc-saldo ${
                        Number(r.saldo) < 0 ? "is-negative" : "is-positive"
                      }`}
                    >
                      {moneyARS(r.saldo)}
                    </div>
                  </div>
                ))}

                {!loading && rows.length === 0 && (
                  <div className="fc-emptyRow">No hay datos para mostrar.</div>
                )}
              </div>
            </div>

            <div className="fc-footnote">
              * El primer renglón es el último día del mes anterior, para arrastrar el
              saldo (como el Excel).
            </div>
          </>
        ) : (
          !loading && <div className="fc-emptyRow">No hay datos para mostrar.</div>
        )}
      </section>
    </div>
  );
}
