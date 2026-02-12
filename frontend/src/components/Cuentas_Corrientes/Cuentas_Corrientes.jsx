// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../config/config";
import "./cuentas_corrientes.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel } from "@fortawesome/free-solid-svg-icons";

import Toast from "../Global/Toast.jsx";
import GifCarga from "../Global/Gif_Carga.jsx";
import "../Global/gif_carga.css";

function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

async function fetchJSON(url) {
  const r = await fetch(url);
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    throw new Error(`Respuesta inválida (${r.status}): ${txt.slice(0, 200)}`);
  }
}

export default function Cuentas_Corrientes() {
  const [q, setQ] = useState("");
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

  // ✅ Mobile detect (solo para render, NO toca desktop)
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

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      const url = `${BASE_URL}/api.php?action=cc_resumen`;
      const data = await fetchJSON(url);

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
    }
  }, [showToast]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

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

  // ✅ Export Excel (misma lógica)
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
      XLSX.writeFile(wb, `cuentas_corrientes_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filtered, orderedCuentas, getCell, showToast]);

  // ✅ Cards mobile: expand/collapse por cliente
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    // si cambian filtros, cerramos el expandido (evita glitches)
    setOpenId(null);
  }, [q]);

  const toggleOpen = useCallback((id) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  // Desktop grid cols (igual que antes)
  const gridColsDesktop = useMemo(() => {
    return `260px repeat(${orderedCuentas.length}, 1fr) .5fr`;
  }, [orderedCuentas.length]);

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
                {loading ? <>Cargando...</> : <>Mostrando <b>{visibleCount}</b> clientes</>}
              </div>
            </div>

            <div className="cc-headFilters">
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
                        const input = document.querySelector(".cc-searchInput input");
                        input?.focus();
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
              {isMobile ? (
                <>Vista móvil: tocá un cliente para ver el detalle.</>
              ) : (
                <>Columnas dinámicas = cuentas_corrientes • Totales en el pie.</>
              )}
            </div>
          </div>
        </div>

        {/* =========================
            ✅ MOBILE VIEW (sin scroll horizontal)
           ========================= */}
        {isMobile ? (
          <div className="cc-mobileList" style={{ padding: 12 }}>
            {loading && (
              <div className="cc-emptyRow cc-emptyRow--loading">
                <GifCarga />
              </div>
            )}

            {!loading && filtered.length === 0 ? (
              <div className="cc-emptyRow">No hay datos</div>
            ) : null}

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
                            const cls =
                              v > 0 ? "is-positive" : v < 0 ? "is-negative" : "";
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
                                <div
                                  className={cls}
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color,
                                  }}
                                >
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
                        <div style={{ fontSize: 13, color: "rgba(66,84,102,.90)" }}>
                          {c.nombre}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color }}>
                          {moneyARS(v)}
                        </div>
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
          </div>
        ) : (
          /* =========================
             ✅ DESKTOP VIEW (igual que tenías)
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

            <div className="cc-gridBody" role="rowgroup">
              {loading && (
                <div className="cc-emptyRow cc-emptyRow--loading">
                  <GifCarga />
                </div>
              )}

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
