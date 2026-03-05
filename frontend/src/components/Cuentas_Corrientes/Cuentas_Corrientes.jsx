// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../config/config";
import "./cuentas_corrientes.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileExcel } from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";
import Calendario from "../Global/Calendario/Calendario.jsx";

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

function normTxt(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

/* =========================
   Auth (X-Session)
========================= */
function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  return h;
}

async function parseJsonOrThrow(res) {
  if (res.status === 401) {
    throw new Error(
      "401 (Unauthorized): Sesión vencida o no autorizada. Volvé a iniciar sesión."
    );
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

async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
  return await parseJsonOrThrow(res);
}

/* =========================
   Date range cache
========================= */
const CC_DATE_CACHE_KEY = "cc_daterange_cache";

function readCachedRange() {
  try {
    const raw = localStorage.getItem(CC_DATE_CACHE_KEY);
    if (!raw) return { from: null, to: null };
    const parsed = JSON.parse(raw);
    return {
      from: parsed.from ? new Date(parsed.from) : null,
      to: parsed.to ? new Date(parsed.to) : null,
    };
  } catch {
    return { from: null, to: null };
  }
}

function writeCachedRange(range) {
  try {
    localStorage.setItem(
      CC_DATE_CACHE_KEY,
      JSON.stringify({
        from: range.from ? range.from.toISOString() : null,
        to: range.to ? range.to.toISOString() : null,
      })
    );
  } catch {}
}

/* Default range: current month */
function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from, to };
}

/* =========================
   Component
========================= */
const SKELETON_ROWS = 10;

export default function Cuentas_Corrientes() {
  const API = `${BASE_URL}/api.php`;

  const [q, setQ] = useState("");

  /* Date range (replaces periodo) */
  const [dateRange, setDateRange] = useState(() => {
    const cached = readCachedRange();
    return cached.from ? cached : defaultRange();
  });
  const [calOpen, setCalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ columnas: {}, saldo: 0 });

  const [debitoId, setDebitoId] = useState(null);
  const [creditoId, setCreditoId] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // Mobile detect
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 720px)").matches
      : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    onChange();
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // check sesión
  useEffect(() => {
    const k = (localStorage.getItem("session_key") || "").trim();
    if (!k) showToast("advertencia", "Falta session_key. Iniciá sesión de nuevo.", 4200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // guardar rango de fechas
  useEffect(() => {
    writeCachedRange(dateRange);
  }, [dateRange]);

  /* =========================================================
     Skeleton delay anti-parpadeo
  ========================================================= */
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
    return () => skelTimerRef.current && clearTimeout(skelTimerRef.current);
  }, []);

  /* =========================================================
     1) Listas globales: detectar IDs debito/credito
  ========================================================= */
  const fetchDashboardLists = useCallback(async () => {
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data || data.exito !== true) throw new Error(data?.mensaje || "Error al cargar listas.");

      const rawCC =
        Array.isArray(data?.listas?.cuentasCorrientes) ? data.listas.cuentasCorrientes :
        Array.isArray(data?.listas?.cuentas_corrientes) ? data.listas.cuentas_corrientes :
        Array.isArray(data?.cuentasCorrientes) ? data.cuentasCorrientes :
        Array.isArray(data?.cuentas_corrientes) ? data.cuentas_corrientes :
        [];

      const cc = Array.isArray(rawCC) ? rawCC : [];
      const deb = cc.find((c) => normTxt(c?.nombre).includes("DEBITO"));
      const cre = cc.find((c) => normTxt(c?.nombre).includes("CREDITO"));

      setDebitoId(deb?.id_cuenta_corriente ?? null);
      setCreditoId(cre?.id_cuenta_corriente ?? null);
    } catch (e) {
      setDebitoId(null);
      setCreditoId(null);
      showToast("error", e?.message || "Error cargando listas", 4200);
    }
  }, [API, showToast]);

  useEffect(() => {
    fetchDashboardLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     2) Resumen por rango de fechas
  ========================================================= */
  const fetchResumen = useCallback(async () => {
    if (!dateRange.from) return;

    setLoading(true);
    setErr("");
    beginSkeleton();

    try {
      const sp = new URLSearchParams();
      sp.set("action", "cc_resumen");
      sp.set("fecha_desde", formatDateISO(dateRange.from));
      sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));

      const data = await apiGet(`${API}?${sp.toString()}`);
      if (!data || data.exito !== true) throw new Error(data?.mensaje || "Error al cargar resumen.");

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotales(data.totales || { columnas: {}, saldo: 0 });
    } catch (e) {
      setRows([]);
      setTotales({ columnas: {}, saldo: 0 });
      const msg = e?.message || "Error inesperado";
      setErr(msg);
      showToast("error", msg, 4200);
    } finally {
      setLoading(false);
      endSkeleton();
    }
  }, [API, dateRange, showToast, beginSkeleton, endSkeleton]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  /* =========================
     Filtro
  ========================= */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => String(r.nombre || "").toLowerCase().includes(needle));
  }, [rows, q]);

  const visibleCount = filtered.length;

  /* =========================
     Valores DEBITO / CREDITO
  ========================= */
  const getValueByCuenta = useCallback((row, cuentaId) => {
    const cols = row && typeof row === "object" ? row.columnas : null;
    if (!cols || typeof cols !== "object") return 0;
    return Number(cols[String(cuentaId)] || 0);
  }, []);

  const pickFallbackIds = useCallback((row) => {
    const cols = row && typeof row === "object" ? row.columnas : null;
    if (!cols || typeof cols !== "object") return { deb: null, cre: null };
    const keys = Object.keys(cols);
    if (keys.length < 2) return { deb: keys[0] ?? null, cre: null };
    return { deb: keys[0], cre: keys[1] };
  }, []);

  const getDebitoCredito = useCallback((row) => {
    if (debitoId != null || creditoId != null) {
      return {
        deb: debitoId != null ? getValueByCuenta(row, debitoId) : 0,
        cre: creditoId != null ? getValueByCuenta(row, creditoId) : 0,
      };
    }
    const { deb, cre } = pickFallbackIds(row);
    const cols = row?.columnas || {};
    return {
      deb: deb != null ? Number(cols[String(deb)] || 0) : 0,
      cre: cre != null ? Number(cols[String(cre)] || 0) : 0,
    };
  }, [debitoId, creditoId, getValueByCuenta, pickFallbackIds]);

  /* =========================
     Label del rango para el botón
  ========================= */
  const rangeLabel = useMemo(() => {
    const { from, to } = dateRange;
    if (!from) return "Seleccionar período";
    if (!to || formatDateISO(from) === formatDateISO(to)) return formatDateLabel(from);
    return `${formatDateLabel(from)} → ${formatDateLabel(to)}`;
  }, [dateRange]);

  /* =========================
     Export Excel (4 columnas fijas)
  ========================= */
  const exportExcel = useCallback(() => {
    try {
      if (!filtered.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      showToast("cargando", "Generando Excel…", 9000);

      const data = filtered.map((r) => {
        const { deb, cre } = getDebitoCredito(r);
        return {
          Cliente: r.nombre,
          "DEBITO (SALIDA DE MERCADERIA)": Number(deb || 0),
          "CREDITO (COBRO DE MERCADERIA)": Number(cre || 0),
          Saldo: Number(r.saldo || 0),
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [{ wch: 30 }, { wch: 28 }, { wch: 28 }, { wch: 18 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cuentas Corrientes");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const rangeStamp = `${formatDateISO(dateRange.from)}_${formatDateISO(dateRange.to || dateRange.from)}`;
      XLSX.writeFile(wb, `cuentas_corrientes_${rangeStamp}_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filtered, getDebitoCredito, showToast, dateRange]);

  /* =========================
     Mobile expand/collapse
  ========================= */
  const [openId, setOpenId] = useState(null);
  useEffect(() => setOpenId(null), [q, dateRange]);

  const toggleOpen = useCallback((id) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const gridColsDesktop = useMemo(() => {
    return `260px minmax(320px, 1fr) minmax(320px, 1fr) minmax(160px, .6fr)`;
  }, []);

  const softLoading = loading && showSkeleton;

  const renderSkeletonRowDesktop = (idx) => {
    const widths = ["44%", "58%", "36%", "52%"];
    const w = (i) => widths[i % widths.length];
    return (
      <div
        key={`cc-skel-${idx}`}
        className="cc-grid cc-grid--row cc-row--skeleton"
        style={{ gridTemplateColumns: gridColsDesktop }}
      >
        <div className="cc-cell cc-name">
          <span className="cc-skeletonBar" style={{ width: w(idx) }} />
        </div>
        <div className="cc-cell cc-num is-center">
          <span className="cc-skeletonBar" style={{ width: "48%" }} />
        </div>
        <div className="cc-cell cc-num is-center">
          <span className="cc-skeletonBar" style={{ width: "48%" }} />
        </div>
        <div className="cc-cell cc-num is-center cc-saldo">
          <span className="cc-skeletonBar" style={{ width: "52%" }} />
        </div>
      </div>
    );
  };

  return (
    <div className="cc-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      {err && (
        <div className="cc-alert" role="alert">
          {err}
        </div>
      )}

      <section className="cc-card cc-card--table">
        <div className="cc-card__head">
          <div className="cc-card__headLeft">
            <div className="cc-headTitle">
              <div className="cc-card__title">Cuentas Corrientes</div>
              <div className="cc-card__hint">
                Mostrando <b>{visibleCount}</b> clientes
              </div>
            </div>

            <div className="cc-headFilters">
              {/* ============ Calendario (reemplaza el selector de período) ============ */}
              <div className="cc-filter cc-filter--cal" style={{ position: "relative" }}>
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <button
                  type="button"
                  className={`cc-calTrigger ${calOpen ? "is-open" : ""}`}
                  onClick={() => setCalOpen((v) => !v)}
                >
                  {rangeLabel}
                  <span className="cc-calTrigger__arrow">{calOpen ? "▲" : "▼"}</span>
                </button>

                {calOpen && (
                  <div className="cc-calDropdown">
                    <Calendario
                      value={dateRange}
                      onChange={(range) => {
                        setDateRange(range);
                        // close only when both dates are set
                        if (range.from && range.to) setCalOpen(false);
                      }}
                      onClose={() => setCalOpen(false)}
                    />
                  </div>
                )}
              </div>

              {/* ============ Buscar ============ */}
              <div className="cc-filter cc-filter--search">
                <label>Buscar</label>

                <div className="cc-searchInput">
                  <input
                    className="cc-input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar cliente..."
                    disabled={loading}
                  />

                  {q.trim() !== "" && !loading && (
                    <button
                      type="button"
                      className="cc-clearSearch"
                      title="Limpiar búsqueda"
                      onClick={() => {
                        setQ("");
                        document.querySelector(".cc-searchInput input")?.focus();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <button
                className="cc-btnex cc-btn--excel"
                onClick={exportExcel}
                disabled={loading || !filtered.length}
                title={filtered.length ? "Exportar a Excel" : "No hay datos para exportar"}
              >
                <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
              </button>
            </div>
          </div>

          <div className="cc-card__actions" />
        </div>

        <div className="cc-subhead">
          <div className="cc-subhead__name">
            Resumen por cliente
            <div className="cc-subhead__meta">
              {rangeLabel} •{" "}
              {isMobile ? "Vista móvil: tocá un cliente para ver el detalle." : "Totales en el pie."}
            </div>
          </div>
        </div>

        {/* =========================
            MOBILE
        ========================= */}
        {isMobile ? (
          <div className="cc-mobileList" style={{ padding: 12 }}>
            {showSkeleton && loading ? (
              <div className={["cc-skeletonWrap", softLoading ? "cc-softLoading" : ""].join(" ")}>
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <div
                    key={`m-skel-${i}`}
                    className="cc-mobileCard cc-row--skeleton"
                    style={{
                      border: "1px solid rgba(10, 37, 64, 0.14)",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fff",
                      marginBottom: 10,
                    }}
                  >
                    <span className="cc-skeletonBar" style={{ width: "55%", height: 12 }} />
                    <div style={{ marginTop: 10 }}>
                      <span className="cc-skeletonBar" style={{ width: "38%", height: 10 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {!loading && filtered.length === 0 ? <div className="cc-emptyRow">No hay datos</div> : null}

                {!loading &&
                  filtered.map((r) => {
                    const isOpen = openId === r.id_cliente;
                    const { deb, cre } = getDebitoCredito(r);

                    const saldoColor =
                      Number(r.saldo) < 0
                        ? "rgba(225,61,69,.95)"
                        : Number(r.saldo) > 0
                        ? "rgba(34,173,92,.95)"
                        : "rgba(10,37,64,.75)";

                    return (
                      <div
                        key={r.id_cliente}
                        className="cc-mobileCard"
                        style={{
                          border: "1px solid rgba(10, 37, 64, 0.14)",
                          borderRadius: 14,
                          padding: 12,
                          background: "#fff",
                          marginBottom: 10,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleOpen(r.id_cliente)}
                          className="cc-mobileTop"
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            background: "transparent",
                            border: "0",
                            padding: 0,
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: "rgba(10,37,64,.92)" }}>{r.nombre}</div>
                            <div style={{ fontSize: 12, color: "rgba(66,84,102,.75)", marginTop: 2 }}>
                              Saldo: <span style={{ fontWeight: 800, color: saldoColor }}>{moneyARS(r.saldo)}</span>
                            </div>
                          </div>

                          <div
                            aria-hidden="true"
                            style={{
                              fontSize: 18,
                              fontWeight: 700,
                              lineHeight: 1,
                              color: "rgba(10,37,64,.55)",
                              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "160ms ease",
                            }}
                          >
                            ⌄
                          </div>
                        </button>

                        {isOpen && (
                          <div style={{ marginTop: 10 }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: 8,
                                paddingTop: 10,
                                borderTop: "1px solid rgba(10,37,64,.10)",
                              }}
                            >
                              <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>
                                DEBITO (SALIDA DE MERCADERIA)
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(225,61,69,.95)" }}>
                                {moneyARS(deb)}
                              </div>

                              <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>
                                CREDITO (COBRO DE MERCADERIA)
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(34,173,92,.95)" }}>
                                {moneyARS(cre)}
                              </div>

                              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(10,37,64,.92)" }}>SALDO</div>
                              <div style={{ fontSize: 14, fontWeight: 900, color: saldoColor }}>
                                {moneyARS(r.saldo)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {!loading && (
                  <div
                    className="cc-mobileTotals"
                    style={{
                      marginTop: 10,
                      border: "1px solid rgba(10, 37, 64, 0.14)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(10,37,64,.03)",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 8, color: "rgba(10,37,64,.92)" }}>Totales</div>

                    {(() => {
                      const cols = totales.columnas || {};
                      const debT = debitoId != null ? Number(cols[String(debitoId)] || 0) : 0;
                      const creT = creditoId != null ? Number(cols[String(creditoId)] || 0) : 0;

                      const saldoColor =
                        Number(totales.saldo) < 0
                          ? "rgba(225,61,69,.95)"
                          : Number(totales.saldo) > 0
                          ? "rgba(34,173,92,.95)"
                          : "rgba(10,37,64,.75)";

                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                          <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>
                            DEBITO (SALIDA DE MERCADERIA)
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(225,61,69,.95)" }}>
                            {moneyARS(debT)}
                          </div>

                          <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>
                            CREDITO (COBRO DE MERCADERIA)
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(34,173,92,.95)" }}>
                            {moneyARS(creT)}
                          </div>

                          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(10,37,64,.92)" }}>SALDO</div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: saldoColor }}>
                            {moneyARS(totales.saldo)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* =========================
             DESKTOP
          ========================= */
          <div className="cc-tableWrap">
            <div className="cc-grid cc-grid--head" style={{ gridTemplateColumns: gridColsDesktop }}>
              <div className="cc-cell cc-name">CLIENTE</div>
              <div className="cc-cell is-center" style={{ color: "rgba(225,61,69,.92)", fontWeight: 700 }}>
                DEBITO (SALIDA DE MERCADERIA)
              </div>
              <div className="cc-cell is-center" style={{ color: "rgba(34,173,92,.92)", fontWeight: 700 }}>
                CREDITO (COBRO DE MERCADERIA)
              </div>
              <div className="cc-cell is-center">SALDO</div>
            </div>

            <div className={["cc-gridBody", softLoading ? "cc-softLoading" : ""].join(" ")} role="rowgroup">
              {showSkeleton && loading ? (
                <div className="cc-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRowDesktop(i))}
                </div>
              ) : (
                <>
                  {!loading && filtered.length === 0 ? <div className="cc-emptyRow">No hay datos</div> : null}

                  {!loading &&
                    filtered.map((r) => {
                      const { deb, cre } = getDebitoCredito(r);
                      const debCls = deb > 0 ? "is-negative" : deb < 0 ? "is-positive" : "";
                      const creCls = cre > 0 ? "is-positive" : cre < 0 ? "is-negative" : "";
                      const saldoCls =
                        Number(r.saldo) < 0 ? "is-negative" : Number(r.saldo) > 0 ? "is-positive" : "";

                      return (
                        <div
                          key={r.id_cliente}
                          className="cc-grid cc-grid--row"
                          style={{ gridTemplateColumns: gridColsDesktop }}
                        >
                          <div className="cc-cell cc-name">{r.nombre}</div>
                          <div className={`cc-cell cc-num is-center is-negative ${debCls}`}>
                            {moneyARS(deb)}
                          </div>
                          <div className={`cc-cell cc-num is-center is-positive ${creCls}`}>
                            {moneyARS(cre)}
                          </div>
                          <div className={`cc-cell cc-num is-center cc-saldo ${saldoCls}`}>
                            <b>{moneyARS(r.saldo)}</b>
                          </div>
                        </div>
                      );
                    })}

                  {!loading && (
                    <div className="cc-grid cc-grid--tfoot" style={{ gridTemplateColumns: gridColsDesktop }}>
                      <div className="cc-cell cc-tfootLabel">Totales</div>

                      {(() => {
                        const cols = totales.columnas || {};
                        const debT = debitoId != null ? Number(cols[String(debitoId)] || 0) : 0;
                        const creT = creditoId != null ? Number(cols[String(creditoId)] || 0) : 0;
                        return (
                          <>
                            <div className="cc-cell cc-num is-center is-negative">{moneyARS(debT)}</div>
                            <div className="cc-cell cc-num is-center is-positive">{moneyARS(creT)}</div>
                          </>
                        );
                      })()}

                      <div
                        className={`cc-cell cc-num is-center cc-saldo ${
                          Number(totales.saldo) < 0 ? "is-negative" : Number(totales.saldo) > 0 ? "is-positive" : ""
                        }`}
                      >
                        <b>{moneyARS(totales.saldo)}</b>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="cc-footnote">
          * Header fijo con 4 columnas (Cliente / Débito / Crédito / Saldo).
        </div>
      </section>
    </div>
  );
}