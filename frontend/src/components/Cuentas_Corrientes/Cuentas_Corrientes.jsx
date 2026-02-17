// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../config/config";
import "./cuentas_corrientes.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileExcel } from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";

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

function periodLabelMMYYYY(yyyyMM) {
  const [y, m] = String(yyyyMM || "").split("-");
  if (!y || !m) return String(yyyyMM || "");
  return `${m}-${y}`;
}

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split(/[-/]/);
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split(/[-/]/);
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
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

function currentYYYYMM() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function normTxt(s) {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
   Period cache
========================= */
const CC_PERIOD_CACHE_KEY = "cc_periodo_cache";

function readCachedPeriodo() {
  const v = (localStorage.getItem(CC_PERIOD_CACHE_KEY) || "").trim();
  const norm = periodoToYYYYMM(v);
  return norm || "";
}

function writeCachedPeriodo(v) {
  const norm = periodoToYYYYMM(v);
  if (norm) localStorage.setItem(CC_PERIOD_CACHE_KEY, norm);
}

/* =========================
   Component
========================= */
const SKELETON_ROWS = 10;

export default function Cuentas_Corrientes() {
  const API = `${BASE_URL}/api.php`;

  const [q, setQ] = useState("");
  const [periodo, setPeriodo] = useState(() => readCachedPeriodo() || currentYYYYMM());
  const [periodOptions, setPeriodOptions] = useState([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ columnas: {}, saldo: 0 });

  // ✅ IDs “reales” para DEBITO/CREDITO (si están en catálogo)
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

  // guardar periodo
  useEffect(() => {
    if (periodo) writeCachedPeriodo(periodo);
  }, [periodo]);

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
     1) Listas globales: periodos + detectar IDs debito/credito
  ========================================================= */
  const fetchDashboardLists = useCallback(async () => {
    setLoadingPeriodos(true);
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data || data.exito !== true) throw new Error(data?.mensaje || "Error al cargar listas.");

      // periodos
      const rawPeriodos = Array.isArray(data?.listas?.periodos)
        ? data.listas.periodos
        : Array.isArray(data?.periodos)
        ? data.periodos
        : [];

      const unique = Array.from(new Set(rawPeriodos.map(periodoToYYYYMM).filter(Boolean)));
      unique.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      setPeriodOptions(unique);

      if (unique.length && (!periodo || !unique.includes(periodo))) setPeriodo(unique[0]);

      // catálogo CC (para detectar IDs)
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
      setPeriodOptions([]);
      setDebitoId(null);
      setCreditoId(null);
      showToast("error", e?.message || "Error cargando listas", 4200);
    } finally {
      setLoadingPeriodos(false);
    }
  }, [API, showToast, periodo]);

  useEffect(() => {
    fetchDashboardLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     2) Resumen por período
  ========================================================= */
  const fetchResumen = useCallback(async () => {
    if (!periodo) return;

    setLoading(true);
    setErr("");
    beginSkeleton();

    try {
      const sp = new URLSearchParams();
      sp.set("action", "cc_resumen");
      sp.set("periodo", periodo);

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
  }, [API, periodo, showToast, beginSkeleton, endSkeleton]);

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
     Valores DEBITO / CREDITO (sin depender del header)
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
      XLSX.writeFile(wb, `cuentas_corrientes_${periodo}_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filtered, getDebitoCredito, showToast, periodo]);

  /* =========================
     Mobile expand/collapse
  ========================= */
  const [openId, setOpenId] = useState(null);
  useEffect(() => setOpenId(null), [q, periodo]);

  const toggleOpen = useCallback((id) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  // ✅ grid fijo 4 columnas
  const gridColsDesktop = useMemo(() => {
    return `260px minmax(320px, 1fr) minmax(320px, 1fr) minmax(160px, .6fr)`;
  }, []);

  const softLoading = (loading || loadingPeriodos) && showSkeleton;
  const selectDisabled = loadingPeriodos;

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
              <div className="cc-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select
                  value={periodo || ""}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={selectDisabled}
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
              Período {periodo} •{" "}
              {isMobile ? "Vista móvil: tocá un cliente para ver el detalle." : "Totales en el pie."}
            </div>
          </div>
        </div>

        {/* =========================
            MOBILE (sin scroll horizontal)
        ========================= */}
        {isMobile ? (
          <div className="cc-mobileList" style={{ padding: 12 }}>
            {showSkeleton && (loading || loadingPeriodos) ? (
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
             DESKTOP: header en cc-tableWrap + tabla en cc-gridBody
          ========================= */
          <div className="cc-tableWrap">
            {/* ✅ Header fijo dentro del scroller */}
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

            {/* ✅ SOLO filas + totales */}
            <div className={["cc-gridBody", softLoading ? "cc-softLoading" : ""].join(" ")} role="rowgroup">
              {showSkeleton && (loading || loadingPeriodos) ? (
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
