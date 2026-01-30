// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import BASE_URL from "../../config/config";
import "./cuentas_corrientes.css";

function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function buildPeriodOptions(limitBack = 18, limitForward = 3) {
  const out = [{ value: "", label: "Todos" }];
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);

  for (let i = -limitBack; i <= limitForward; i++) {
    const dt = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    out.push({ value: `${y}-${m}`, label: `${m}-${y}` }); // display tipo MM-YYYY
  }
  return out;
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
  const [periodo, setPeriodo] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [cuentas, setCuentas] = useState([]);
  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ columnas: {}, saldo: 0 });

  const periodOptions = useMemo(() => buildPeriodOptions(18, 3), []);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      const url = `${BASE_URL}/api.php?action=cc_resumen&periodo=${encodeURIComponent(
        periodo || ""
      )}`;
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
      setErr(e?.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      String(r.nombre || "").toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const visibleCount = filtered.length;

  const getCell = useCallback((row, cuentaId) => {
    const cols = row && typeof row === "object" ? row.columnas : null;
    if (!cols || typeof cols !== "object") return 0;
    const v = cols[String(cuentaId)];
    return Number(v || 0);
  }, []);

  const colCount = 2 + (cuentas?.length || 0);

  return (
    <div className="cc-page">
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
                {loading ? (
                  <>Cargando...</>
                ) : (
                  <>
                    Mostrando <b>{visibleCount}</b> clientes
                  </>
                )}
              </div>
            </div>

            <div className="cc-headFilters">
              <div className="cc-filter">
                <label>Período</label>
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={loading}
                >
                  {periodOptions.map((p) => (
                    <option key={p.value || "__ALL__"} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="cc-filter cc-filter--search">
                <label>Buscar</label>
                <input
                  className="cc-input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar cliente..."
                  disabled={loading}
                />
              </div>

              <button
                className="cc-btn"
                onClick={fetchResumen}
                disabled={loading}
                title="Recargar"
              >
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>
          </div>

          <div className="cc-card__actions" />
        </div>

        <div className="cc-subhead">
          <div className="cc-subhead__name">
            Resumen por cliente
            <div className="cc-subhead__meta">
              Columnas dinámicas = cuentas_corrientes • Totales en el pie.
            </div>
          </div>


        </div>

        {/* ✅ Wrap NO scrollea: el scroll va SOLO en el body */}
        <div className="cc-tableWrap">
          {/* ✅ Header sticky */}
          <div
            className="cc-grid cc-grid--head"
            style={{
              gridTemplateColumns: `260px repeat(${cuentas.length}, 1fr) .5fr`,
            }}
          >
            <div className="cc-cell cc-name">CLIENTE</div>
            {cuentas.map((c) => (
              <div key={c.id_cuenta_corriente} className="cc-cell is-center">
                {c.nombre}
              </div>
            ))}
            <div className="cc-cell is-center">SALDO</div>
          </div>

          {/* ✅ Body con scroll */}
          <div className="cc-gridBody" role="rowgroup">
            {!loading && filtered.length === 0 ? (
              <div className="cc-emptyRow">No hay datos</div>
            ) : null}

            {filtered.map((r) => (
              <div
                key={r.id_cliente}
                className="cc-grid cc-grid--row"
                style={{
                  gridTemplateColumns: `260px repeat(${cuentas.length}, 1fr) .5fr`,
                }}
              >
                <div className="cc-cell cc-name">{r.nombre}</div>

                {cuentas.map((c) => {
                  const v = getCell(r, c.id_cuenta_corriente);
                  const cls = v > 0 ? "is-positive" : v < 0 ? "is-negative" : "";
                  return (
                    <div
                      key={c.id_cuenta_corriente}
                      className={`cc-cell cc-num is-center ${cls}`}
                    >
                      {moneyARS(v)}
                    </div>
                  );
                })}

                <div
                  className={`cc-cell cc-num is-center cc-saldo ${
                    Number(r.saldo) < 0 ? "is-negative" : Number(r.saldo) > 0 ? "is-positive" : ""
                  }`}
                >
                  <b>{moneyARS(r.saldo)}</b>
                </div>
              </div>
            ))}

            {/* ✅ Footer tipo “sticky” opcional: lo dejamos simple abajo */}
            <div
              className="cc-grid cc-grid--tfoot"
              style={{
                gridTemplateColumns: `260px repeat(${cuentas.length}, 1fr) .5fr`,
              }}
            >
              <div className="cc-cell cc-tfootLabel">Totales</div>

              {cuentas.map((c) => {
                const v = Number((totales.columnas || {})[String(c.id_cuenta_corriente)] || 0);
                const cls = v > 0 ? "is-positive" : v < 0 ? "is-negative" : "";
                return (
                  <div
                    key={c.id_cuenta_corriente}
                    className={`cc-cell cc-num is-center ${cls}`}
                  >
                    {moneyARS(v)}
                  </div>
                );
              })}

              <div
                className={`cc-cell cc-num is-center cc-saldo ${
                  Number(totales.saldo) < 0 ? "is-negative" : Number(totales.saldo) > 0 ? "is-positive" : ""
                }`}
              >
                <b>{moneyARS(totales.saldo)}</b>
              </div>
            </div>
          </div>

          {/* accesibilidad/consistencia */}
          {!err && loading && filtered.length === 0 ? (
            <div className="cc-emptyRow">Cargando cuentas corrientes...</div>
          ) : null}
        </div>

        <div className="cc-footnote">
          * Las columnas se generan desde <b>cuentas_corrientes</b>. El saldo es la suma final por cliente.
        </div>
      </section>
    </div>
  );
}
