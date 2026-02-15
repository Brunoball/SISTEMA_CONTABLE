// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../config/config";
import "./cuentas_corrientes.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faFileExcel } from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";

/* =========================
   Helpers UI
========================= */
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
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

function currentYYYYMM() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/* =========================
   ✅ Auth (X-Session)
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
   ✅ Period cache (instant set) — igual Flujo_Caja
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

  // ✅ PERÍODO instantáneo (cache primero, sino mes actual)
  const [periodo, setPeriodo] = useState(() => readCachedPeriodo() || currentYYYYMM());
  const [periodOptions, setPeriodOptions] = useState([]); // YYYY-MM[]
  const [loadingPeriodos, setLoadingPeriodos] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [cuentas, setCuentas] = useState([]);
  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ columnas: {}, saldo: 0 });

  // ✅ Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // ✅ Mobile detect (solo render)
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

  // ✅ check simple sesión
  useEffect(() => {
    const k = (localStorage.getItem("session_key") || "").trim();
    if (!k) showToast("advertencia", "Falta session_key. Iniciá sesión de nuevo.", 4200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ guardar periodo al cambiar (instant)
  useEffect(() => {
    if (periodo) writeCachedPeriodo(periodo);
  }, [periodo]);

  /* =========================================================
     ✅ Skeleton: delay anti-parpadeo (igual Flujo_Caja)
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
    return () => {
      if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    };
  }, []);

  /* =========================================================
     ✅ 1) Periodos desde Dashboard (global_obtener_listas)
     - normaliza a YYYY-MM
     - si el periodo actual no existe, setea el más nuevo
  ========================================================= */
  const fetchPeriodosFromDashboard = useCallback(async () => {
    setLoadingPeriodos(true);
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);

      if (!data || data.exito !== true) {
        throw new Error(data?.mensaje || "Error al cargar períodos.");
      }

      const raw = Array.isArray(data?.listas?.periodos)
        ? data.listas.periodos
        : Array.isArray(data?.periodos)
        ? data.periodos
        : [];

      const unique = Array.from(new Set(raw.map((p) => periodoToYYYYMM(p)).filter(Boolean)));
      unique.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

      setPeriodOptions(unique);

      // ✅ si el periodo actual no está en la lista, agarrá el más reciente
      if (unique.length) {
        if (!periodo || !unique.includes(periodo)) {
          setPeriodo(unique[0]);
        }
      }
    } catch (e) {
      setPeriodOptions([]);
      showToast("error", e?.message || "Error cargando períodos", 4200);
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
     ✅ 2) Fetch resumen (✅ con X-Session) + período + skeleton
  ========================================================= */
  const fetchResumen = useCallback(async () => {
    if (!periodo) return;

    setLoading(true);
    setErr("");
    beginSkeleton();

    try {
      const sp = new URLSearchParams();
      sp.set("action", "cc_resumen");
      sp.set("periodo", periodo); // ✅ clave para replicar Flujo_Caja

      const data = await apiGet(`${API}?${sp.toString()}`);

      if (!data || data.exito !== true) {
        throw new Error(data?.mensaje || "Error al cargar resumen.");
      }

      setCuentas(Array.isArray(data.cuentas) ? data.cuentas : []);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotales(data.totales || { columnas: {}, saldo: 0 });
    } catch (e) {
      setCuentas([]);
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

  const getCell = useCallback((row, cuentaId) => {
    const cols = row && typeof row === "object" ? row.columnas : null;
    if (!cols || typeof cols !== "object") return 0;
    const v = cols[String(cuentaId)];
    return Number(v || 0);
  }, []);

  // ✅ Orden cuentas: Débito primero, Crédito después
  const orderedCuentas = useMemo(() => {
    const list = Array.isArray(cuentas) ? [...cuentas] : [];

    const norm = (s) =>
      String(s || "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const weight = (c) => {
      const name = norm(c?.nombre);
      if (name.includes("DEBITO")) return 0;
      if (name.includes("CREDITO")) return 1;
      return 2;
    };

    list.sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa !== wb) return wa - wb;

      const na = norm(a?.nombre);
      const nb = norm(b?.nombre);
      return na.localeCompare(nb, "es");
    });

    return list;
  }, [cuentas]);

  /* =========================
     Export Excel
  ========================= */
  const exportExcel = useCallback(() => {
    try {
      if (!filtered.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      showToast("cargando", "Generando Excel…", 9000);

      const data = filtered.map((r) => {
        const rowObj = { Cliente: r.nombre };

        (orderedCuentas || []).forEach((c) => {
          const v = getCell(r, c.id_cuenta_corriente);
          rowObj[c.nombre] = Number(v || 0);
        });

        rowObj["Saldo"] = Number(r.saldo || 0);
        return rowObj;
      });

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 30 },
        ...(orderedCuentas || []).map(() => ({ wch: 18 })),
        { wch: 18 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cuentas Corrientes");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      XLSX.writeFile(wb, `cuentas_corrientes_${periodo}_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filtered, orderedCuentas, getCell, showToast, periodo]);

  /* =========================
     Mobile expand/collapse
  ========================= */
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    setOpenId(null);
  }, [q, periodo]);

  const toggleOpen = useCallback((id) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  // Desktop grid cols
  const gridColsDesktop = useMemo(() => {
    return `260px repeat(${orderedCuentas.length}, 1fr) .5fr`;
  }, [orderedCuentas.length]);

  // ✅ estado para "soft loading" (blur leve)
  const softLoading = (loading || loadingPeriodos) && showSkeleton;

  // Skeleton widths (parece data real)
  const skelWidths = useMemo(() => {
    return {
      name: ["40%", "58%", "46%", "62%"],
      num: ["44%", "58%", "36%", "52%"],
      saldo: ["52%", "44%", "62%", "38%"],
    };
  }, []);

  const renderSkeletonRowDesktop = (idx) => {
    const w = (key) => {
      const list = skelWidths[key] || ["50%"];
      return list[idx % list.length];
    };

    return (
      <div
        key={`cc-skel-${idx}`}
        className="cc-grid cc-grid--row cc-row--skeleton"
        style={{ gridTemplateColumns: gridColsDesktop }}
      >
        <div className="cc-cell cc-name">
          <span className="cc-skeletonBar" style={{ width: w("name") }} />
        </div>

        {orderedCuentas.map((c, j) => (
          <div key={`${idx}-${c.id_cuenta_corriente}-${j}`} className="cc-cell cc-num is-center">
            <span className="cc-skeletonBar" style={{ width: w("num") }} />
          </div>
        ))}

        <div className="cc-cell cc-num is-center cc-saldo">
          <span className="cc-skeletonBar" style={{ width: w("saldo") }} />
        </div>
      </div>
    );
  };

  const renderSkeletonCardMobile = (idx) => {
    const w = (key) => {
      const list = skelWidths[key] || ["50%"];
      return list[idx % list.length];
    };

    return (
      <div
        key={`cc-mskel-${idx}`}
        className="cc-mobileCard cc-row--skeleton"
        style={{
          border: "1px solid rgba(10, 37, 64, 0.14)",
          borderRadius: 14,
          padding: 12,
          background: "#fff",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0, width: "100%" }}>
            <div style={{ height: 14 }}>
              <span className="cc-skeletonBar" style={{ width: w("name"), height: 12 }} />
            </div>
            <div style={{ marginTop: 8, height: 12 }}>
              <span className="cc-skeletonBar" style={{ width: "34%", height: 10 }} />
            </div>
          </div>
          <div style={{ width: 28, height: 20, opacity: 0.7 }}>
            <span className="cc-skeletonBar" style={{ width: "70%", height: 12 }} />
          </div>
        </div>
      </div>
    );
  };

  const selectDisabled = loadingPeriodos;

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
              {/* ✅ Período (idéntico patrón Flujo_Caja) */}
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
            ✅ MOBILE VIEW (sin scroll horizontal)
           ========================= */}
        {isMobile ? (
          <div className="cc-mobileList" style={{ padding: 12 }}>
            {showSkeleton && (loading || loadingPeriodos) ? (
              <div className={["cc-skeletonWrap", softLoading ? "cc-softLoading" : ""].join(" ")}>
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonCardMobile(i))}
              </div>
            ) : (
              <>
                {!loading && filtered.length === 0 ? <div className="cc-emptyRow">No hay datos</div> : null}

                {!loading &&
                  filtered.map((r) => {
                    const isOpen = openId === r.id_cliente;

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
                            <div style={{ fontWeight: 600, color: "rgba(10,37,64,.92)" }}>
                              {r.nombre}
                            </div>
                            <div style={{ fontSize: 12, color: "rgba(66,84,102,.75)", marginTop: 2 }}>
                              Saldo:{" "}
                              <span
                                style={{
                                  fontWeight: 700,
                                  color:
                                    Number(r.saldo) < 0
                                      ? "rgba(225,61,69,.95)"
                                      : Number(r.saldo) > 0
                                      ? "rgba(34,173,92,.95)"
                                      : "rgba(10,37,64,.75)",
                                }}
                              >
                                {moneyARS(r.saldo)}
                              </span>
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
                              {orderedCuentas.map((c) => {
                                const v = getCell(r, c.id_cuenta_corriente);
                                const color =
                                  v > 0
                                    ? "rgba(34,173,92,.95)"
                                    : v < 0
                                    ? "rgba(225,61,69,.95)"
                                    : "rgba(10,37,64,.75)";

                                return (
                                  <React.Fragment key={c.id_cuenta_corriente}>
                                    <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>
                                      {c.nombre}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color }}>
                                      {moneyARS(v)}
                                    </div>
                                  </React.Fragment>
                                );
                              })}

                              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(10,37,64,.92)" }}>
                                SALDO
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 800,
                                  color:
                                    Number(r.saldo) < 0
                                      ? "rgba(225,61,69,.95)"
                                      : Number(r.saldo) > 0
                                      ? "rgba(34,173,92,.95)"
                                      : "rgba(10,37,64,.75)",
                                }}
                              >
                                {moneyARS(r.saldo)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* Totales mobile */}
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
                    <div style={{ fontWeight: 800, marginBottom: 8, color: "rgba(10,37,64,.92)" }}>
                      Totales
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      {orderedCuentas.map((c) => {
                        const v = Number((totales.columnas || {})[String(c.id_cuenta_corriente)] || 0);
                        const color =
                          v > 0
                            ? "rgba(34,173,92,.95)"
                            : v < 0
                            ? "rgba(225,61,69,.95)"
                            : "rgba(10,37,64,.75)";
                        return (
                          <React.Fragment key={c.id_cuenta_corriente}>
                            <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>{c.nombre}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color }}>{moneyARS(v)}</div>
                          </React.Fragment>
                        );
                      })}

                      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(10,37,64,.92)" }}>
                        SALDO
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 900,
                          color:
                            Number(totales.saldo) < 0
                              ? "rgba(225,61,69,.95)"
                              : Number(totales.saldo) > 0
                              ? "rgba(34,173,92,.95)"
                              : "rgba(10,37,64,.75)",
                        }}
                      >
                        {moneyARS(totales.saldo)}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* =========================
             ✅ DESKTOP VIEW
             ========================= */
          <div className="cc-tableWrap">
            <div className="cc-grid cc-grid--head" style={{ gridTemplateColumns: gridColsDesktop }}>
              <div className="cc-cell cc-name">CLIENTE</div>
              {orderedCuentas.map((c) => (
                <div key={c.id_cuenta_corriente} className="cc-cell is-center">
                  {c.nombre}
                </div>
              ))}
              <div className="cc-cell is-center">SALDO</div>
            </div>

            <div
              className={["cc-gridBody", softLoading ? "cc-softLoading" : ""].join(" ")}
              role="rowgroup"
            >
              {showSkeleton && (loading || loadingPeriodos) ? (
                <div className="cc-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRowDesktop(i))}
                </div>
              ) : (
                <>
                  {!loading && filtered.length === 0 ? (
                    <div className="cc-emptyRow">No hay datos</div>
                  ) : null}

                  {!loading &&
                    filtered.map((r) => (
                      <div
                        key={r.id_cliente}
                        className="cc-grid cc-grid--row"
                        style={{ gridTemplateColumns: gridColsDesktop }}
                      >
                        <div className="cc-cell cc-name">{r.nombre}</div>

                        {orderedCuentas.map((c) => {
                          const v = getCell(r, c.id_cuenta_corriente);
                          const cls = v > 0 ? "is-positive" : v < 0 ? "is-negative" : "";
                          return (
                            <div key={c.id_cuenta_corriente} className={`cc-cell cc-num is-center ${cls}`}>
                              {moneyARS(v)}
                            </div>
                          );
                        })}

                        <div
                          className={`cc-cell cc-num is-center cc-saldo ${
                            Number(r.saldo) < 0
                              ? "is-negative"
                              : Number(r.saldo) > 0
                              ? "is-positive"
                              : ""
                          }`}
                        >
                          <b>{moneyARS(r.saldo)}</b>
                        </div>
                      </div>
                    ))}

                  {!loading && (
                    <div className="cc-grid cc-grid--tfoot" style={{ gridTemplateColumns: gridColsDesktop }}>
                      <div className="cc-cell cc-tfootLabel">Totales</div>

                      {orderedCuentas.map((c) => {
                        const v = Number((totales.columnas || {})[String(c.id_cuenta_corriente)] || 0);
                        const cls = v > 0 ? "is-positive" : v < 0 ? "is-negative" : "";
                        return (
                          <div key={c.id_cuenta_corriente} className={`cc-cell cc-num is-center ${cls}`}>
                            {moneyARS(v)}
                          </div>
                        );
                      })}

                      <div
                        className={`cc-cell cc-num is-center cc-saldo ${
                          Number(totales.saldo) < 0
                            ? "is-negative"
                            : Number(totales.saldo) > 0
                            ? "is-positive"
                            : ""
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
          * Las columnas se generan desde <b>cuentas_corrientes</b>. El saldo es la suma final por cliente.
        </div>
      </section>
    </div>
  );
}
