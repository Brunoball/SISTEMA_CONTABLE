// src/components/Flujo_de_Caja/Flujo_Caja.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "./flujo_caja.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileExcel } from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";

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

/* ✅ Período label */
function periodLabelMMYYYY(yyyyMM) {
  const [y, m] = String(yyyyMM || "").split("-");
  if (!y || !m) return String(yyyyMM || "");
  return `${m}-${y}`;
}

/* ✅ normaliza a YYYY-MM */
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
   Period cache (instant set)
========================= */
const PERIOD_CACHE_KEY = "fc_periodo_cache";
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
========================= */
const SKELETON_ROWS = 10;

export default function Flujo_Caja() {
  const API = `${BASE_URL}/api.php`;

  // ✅ PERÍODO instantáneo (cache primero, sino fallback)
  const [periodo, setPeriodo] = useState(() => readCachedPeriodo() || "2026-01");

  const [periodOptions, setPeriodOptions] = useState([]); // YYYY-MM[]
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

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
     ✅ 1) Periodos desde Dashboard (global_obtener_listas)
     - normaliza a YYYY-MM
     - si el periodo actual no existe, setea el más nuevo
  ========================================================= */
  const fetchPeriodosFromDashboard = useCallback(async () => {
    setLoadingPeriodos(true);
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

      const unique = Array.from(
        new Set(raw.map((p) => periodoToYYYYMM(p)).filter(Boolean))
      );

      unique.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

      setPeriodOptions(unique);

      // ✅ si el periodo actual no está en la lista, agarrá el más reciente
      if (unique.length) {
        if (!periodo || !unique.includes(periodo)) {
          setPeriodo(unique[0]);
        }
      }
    } catch (e) {
      showToast("error", e?.message || "Error cargando períodos", 4200);
      setPeriodOptions([]);
      // no pisamos el periodo; queda el cache/fallback
    } finally {
      setLoadingPeriodos(false);
    }
  }, [API, showToast, periodo]);

  useEffect(() => {
    fetchPeriodosFromDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     ✅ 2) Resumen
     - tabla SIEMPRE visible
     - skeleton SOLO en rows
  ========================================================= */
  const fetchResumen = useCallback(async () => {
    if (!periodo) return;

    setLoading(true);
    setError("");
    beginSkeleton();

    try {
      const sp = new URLSearchParams();
      sp.set("action", "flujo_caja_resumen");
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
      const msg = e?.message || "Error cargando flujo de caja";
      setError(msg);
      showToast("error", msg, 4200);
    } finally {
      setLoading(false);
      endSkeleton();
    }
  }, [API, periodo, showToast, beginSkeleton, endSkeleton]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  // ✅ si no hay data todavía, igual mostramos tabla fija
  const bloque = data?.tiendas?.[0] || null;
  const rowsRaw = bloque?.rows || [];
  const rows = useMemo(() => normalizeRows(rowsRaw), [rowsRaw]);

  const showing = rows.length;
  const softLoading = (loading || loadingPeriodos) && showSkeleton;

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
      XLSX.utils.book_append_sheet(wb, ws, `Flujo ${periodo}`);

      const fileName = `flujo_caja_${String(periodo).replace("-", "_")}.xlsx`;
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      saveAs(new Blob([wbout], { type: "application/octet-stream" }), fileName);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [rows, periodo, showToast]);

  // ✅ Select siempre usable: si no hay options todavía, igual deja el valor actual
  const selectDisabled = loadingPeriodos;

  // Skeleton widths (parece data real)
  const skelWidths = useMemo(() => {
    return {
      fecha: ["34%", "42%", "38%", "46%"],
      ingresos: ["48%", "40%", "52%", "36%"],
      egresos: ["44%", "56%", "38%", "46%"],
      otros: ["42%", "36%", "50%", "40%"],
      saldo: ["52%", "46%", "38%", "56%"],
    };
  }, []);

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
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
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
              <div className="fc-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select
                  value={periodo || ""}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={selectDisabled}
                >
                  {/* ✅ si todavía no llegó la lista, mostramos el periodo actual */}
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

        {/* ✅ Subhead siempre visible (aunque no haya data todavía) */}
        <div className="fc-subhead">
          <div className="fc-subhead__name">
            Caja diaria
            <div className="fc-subhead__meta">
              Período {data?.periodo ?? periodo} • Saldo base:{" "}
              <b>{moneyARS(bloque?.saldo_base ?? 0)}</b>
            </div>
          </div>
        </div>

        {/* ✅ TABLA SIEMPRE visible */}
        <div className="fc-tableWrap">
          <div className="fc-grid fc-grid--head fc-grid--excel">
            <div className="fc-cell">FECHA</div>
            <div className="fc-cell is-center">INGRESOS</div>
            <div className="fc-cell is-center">EGRESOS</div>
            <div className="fc-cell is-center">OTROS</div>
            <div className="fc-cell is-center">SALDO</div>
          </div>

          <div className={["fc-gridBody", softLoading ? "fc-softLoading" : ""].join(" ")}>
            {/* ✅ Skeleton en rows (carga) */}
            {showSkeleton && (loading || loadingPeriodos) ? (
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

                      <div className="fc-cell fc-num is-center fc-in">
                        {moneyARS(r.ingresos)}
                      </div>

                      <div className="fc-cell fc-num is-center fc-eg">
                        {moneyARS(r.egresos)}
                      </div>

                      <div
                        className={`fc-cell fc-num is-center ${
                          otrosIsNeg ? "fc-eg" : "fc-in"
                        }`}
                      >
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

                {!rows.length && !loading && !loadingPeriodos && (
                  <div className="fc-emptyRow">No hay datos para mostrar.</div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="fc-footnote">
          * El saldo del día 01 arranca desde el “Saldo base” y se actualiza con (ingresos
          + otros − egresos) de cada día.
        </div>
      </section>
    </div>
  );
}
