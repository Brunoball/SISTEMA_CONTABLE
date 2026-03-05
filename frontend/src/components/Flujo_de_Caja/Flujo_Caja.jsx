// ✅ REEMPLAZAR COMPLETO
// src/components/Flujo_de_Caja/Flujo_Caja.jsx

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "./flujo_caja.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileExcel } from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";
import Calendario from "../Global/Calendario/Calendario.jsx";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// ✅ ✅ CONTEXTO GLOBAL DE RANGO DE FECHAS
import { useDateRange } from "../../context/DateRangeContext.jsx";

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
function moneyARSAbs(v) {
  if (v == null || v === "") return "-";
  const n = Math.abs(Number(v || 0));
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

function formatDateISO(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(d) {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function normalizeRows(rawRows) {
  const rr = Array.isArray(rawRows) ? rawRows : [];
  return rr.map((r) => ({
    fecha: String(r?.fecha ?? ""),
    ingresos: r?.ingresos == null ? null : Number(r.ingresos || 0),
    egresos: r?.egresos == null ? null : Number(r.egresos || 0),
    otros: r?.otros == null ? null : Number(r.otros || 0),
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

/* =========================
   Auth helpers (X-Session)
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

/* =========================
   Skeleton config
========================= */
const SKELETON_ROWS = 10;

export default function Flujo_Caja() {
  const API = `${BASE_URL}/api.php`;

  // ✅ ✅ RANGO GLOBAL (compartido entre secciones)
  const { dateRange, setDateRange } = useDateRange();
  const [calOpen, setCalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // Skeleton delay anti-parpadeo
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

  // check sesión
  useEffect(() => {
    const k = getSessionKey();
    if (!k) showToast("advertencia", "Falta session_key. Iniciá sesión de nuevo.", 4200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     Resumen por rango de fechas (usa dateRange GLOBAL)
  ========================================================= */
  const fetchResumen = useCallback(async () => {
    if (!dateRange?.from) return;

    setLoading(true);
    setError("");
    beginSkeleton();

    try {
      const sp = new URLSearchParams();
      sp.set("action", "flujo_caja_resumen");
      sp.set("fecha_desde", formatDateISO(dateRange.from));
      sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));

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
      const msg = e?.message || "Error cargando flujo de caja";
      setError(msg);
      showToast("error", msg, 4200);
    } finally {
      setLoading(false);
      endSkeleton();
    }
  }, [API, dateRange, showToast, beginSkeleton, endSkeleton]);

  // ✅ se actualiza cuando cambia el rango global
  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  const bloque = data?.tiendas?.[0] || null;
  const rowsRaw = bloque?.rows || [];
  const rows = useMemo(() => normalizeRows(rowsRaw), [rowsRaw]);

  const showing = rows.length;
  const softLoading = loading && showSkeleton;

  /* =========================
     Label del rango para el botón
  ========================= */
  const rangeLabel = useMemo(() => {
    const from = dateRange?.from || null;
    const to = dateRange?.to || null;
    if (!from) return "Seleccionar período";
    if (!to || formatDateISO(from) === formatDateISO(to)) return formatDateLabel(from);
    return `${formatDateLabel(from)} → ${formatDateLabel(to)}`;
  }, [dateRange]);

  /* =========================
     Export Excel
  ========================= */
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
        Otros: r.otros == null ? "" : Number(r.otros),
        Saldo: r.saldo == null ? "" : Number(r.saldo),
      }));

      const ws = XLSX.utils.json_to_sheet(excelRows);
      ws["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];

      const wb = XLSX.utils.book_new();
      const from = dateRange?.from || null;
      const to = dateRange?.to || null;
      const rangeStamp = `${formatDateISO(from)}_${formatDateISO(to || from)}`;
      XLSX.utils.book_append_sheet(wb, ws, `Flujo ${rangeStamp}`);

      const fileName = `flujo_caja_${rangeStamp}.xlsx`;
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), fileName);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [rows, dateRange, showToast]);

  // Skeleton widths
  const skelWidths = useMemo(
    () => ({
      fecha: ["34%", "42%", "38%", "46%"],
      ingresos: ["48%", "40%", "52%", "36%"],
      egresos: ["44%", "56%", "38%", "46%"],
      otros: ["42%", "36%", "50%", "40%"],
      saldo: ["52%", "46%", "38%", "56%"],
    }),
    []
  );

  const renderSkeletonRow = (idx) => {
    const w = (key) => {
      const list = skelWidths[key] || ["50%"];
      return list[idx % list.length];
    };
    return (
      <div className="fc-grid fc-grid--row fc-grid--excel fc-row--skeleton" key={`skel-${idx}`}>
        <div className="fc-cell fc-date">
          <span className="fc-skeletonBar" style={{ width: w("fecha") }} />
        </div>
        <div className="fc-cell fc-num is-center fc-in">
          <span className="fc-skeletonBar" style={{ width: w("ingresos") }} />
        </div>
        <div className="fc-cell fc-num is-center fc-eg">
          <span className="fc-skeletonBar" style={{ width: w("egresos") }} />
        </div>
        <div className="fc-cell fc-num is-center">
          <span className="fc-skeletonBar" style={{ width: w("otros") }} />
        </div>
        <div className="fc-cell fc-num is-center fc-saldo">
          <span className="fc-skeletonBar" style={{ width: w("saldo") }} />
        </div>
      </div>
    );
  };

  return (
    <div className="fc-page">
      {toast && (
        <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />
      )}

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
              {/* ✅ Calendario (usa rango GLOBAL) */}
              <div className="fc-filter fc-filter--cal" style={{ position: "relative" }}>
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <button
                  type="button"
                  className={`fc-calTrigger ${calOpen ? "is-open" : ""}`}
                  onClick={() => setCalOpen((v) => !v)}
                  disabled={loading}
                >
                  {rangeLabel}
                  <span className="fc-calTrigger__arrow">{calOpen ? "▲" : "▼"}</span>
                </button>

                {calOpen && (
                  <div className="fc-calDropdown">
                    <Calendario
                      value={dateRange}
                      onChange={(range) => {
                        setDateRange(range); // ✅ guarda global
                        if (range?.from && range?.to) setCalOpen(false);
                      }}
                      onClose={() => setCalOpen(false)}
                    />
                  </div>
                )}
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

        {/* Subhead */}
        <div className="fc-subhead">
          <div className="fc-subhead__name">
            Caja diaria
            <div className="fc-subhead__meta">
              {rangeLabel} • Saldo base: <b>{moneyARS(bloque?.saldo_base ?? 0)}</b>
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="fc-tableWrap">
          <div className="fc-grid fc-grid--head fc-grid--excel">
            <div className="fc-cell">FECHA</div>
            <div className="fc-cell is-center">INGRESOS</div>
            <div className="fc-cell is-center">EGRESOS</div>
            <div className="fc-cell is-center">OTROS</div>
            <div className="fc-cell is-center">SALDO</div>
          </div>

          <div className={["fc-gridBody", softLoading ? "fc-softLoading" : ""].join(" ")}>
            {showSkeleton && loading ? (
              <div className="fc-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {rows.map((r) => {
                  const otros = r.otros == null ? null : Number(r.otros || 0);
                  const otrosIsNeg = otros != null && otros < 0;

                  return (
                    <div className="fc-grid fc-grid--row fc-grid--excel" key={r.fecha}>
                      <div className="fc-cell fc-date">{fmtDateES(r.fecha)}</div>

                      <div className="fc-cell fc-num is-center fc-in">{moneyARS(r.ingresos)}</div>

                      <div className="fc-cell fc-num is-center fc-eg">{moneyARS(r.egresos)}</div>

                      <div className={`fc-cell fc-num is-center ${otrosIsNeg ? "fc-eg" : "fc-in"}`}>
                        {otros == null ? "-" : moneyARSAbs(otros)}
                      </div>

                      <div
                        className={`fc-cell fc-num is-center fc-saldo ${
                          Number(r.saldo) < 0 ? "is-negative" : "is-positive"
                        }`}
                      >
                        {moneyARS(r.saldo)}
                      </div>
                    </div>
                  );
                })}

                {!rows.length && !loading && <div className="fc-emptyRow">No hay datos para mostrar.</div>}
              </>
            )}
          </div>
        </div>

        <div className="fc-footnote">
          * El saldo del día 01 arranca desde el "Saldo base" y se actualiza con (ingresos + otros − egresos) de cada día.
        </div>
      </section>
    </div>
  );
}