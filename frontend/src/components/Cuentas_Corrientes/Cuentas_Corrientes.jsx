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
  const out = [{ value: "", label: "Todos los períodos" }];
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);

  for (let i = -limitBack; i <= limitForward; i++) {
    const dt = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    out.push({ value: `${y}-${m}`, label: `${m}/${y}` });
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

  const [cuentas, setCuentas] = useState([]); // [{id_cuenta_corriente,nombre,signo_saldo}]
  const [rows, setRows] = useState([]); // [{id_cliente,nombre,columnas:{id:val},saldo}]
  const [totales, setTotales] = useState({ columnas: {}, saldo: 0 });

  const periodOptions = useMemo(() => buildPeriodOptions(18, 3), []);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      const url = `${BASE_URL}/api.php?action=cc_resumen&periodo=${encodeURIComponent(periodo || "")}`;
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
    return rows.filter((r) => String(r.nombre || "").toLowerCase().includes(needle));
  }, [rows, q]);

  const visibleCount = filtered.length;

  const getCell = useCallback((row, cuentaId) => {
    const cols = row && typeof row === "object" ? row.columnas : null;
    if (!cols || typeof cols !== "object") return 0;
    const v = cols[String(cuentaId)];
    return Number(v || 0);
  }, []);

  return (
    <div className="cc-wrap">
      <div className="cc-head">
        <div className="cc-title">
          <h2>Cuentas Corrientes</h2>
          <span className="cc-sub">{loading ? "Cargando..." : `${visibleCount} clientes`}</span>
        </div>

        <div className="cc-controls">
          <select className="cc-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {periodOptions.map((p) => (
              <option key={p.value || "__ALL__"} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <input
            className="cc-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente..."
          />

          <button className="cc-btn" onClick={fetchResumen} disabled={loading}>
            Recargar
          </button>
        </div>
      </div>

      {err ? <div className="cc-error">{err}</div> : null}

      <div className="cc-tableWrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th className="name">Cliente</th>

              {/* ✅ UNA COLUMNA POR CADA REGISTRO EN cuentas_corrientes */}
              {cuentas.map((c) => (
                <th key={c.id_cuenta_corriente} className="num">
                  {c.nombre}
                </th>
              ))}

              <th className="num">SALDO</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={2 + (cuentas.length || 0)} className="empty">
                  No hay datos
                </td>
              </tr>
            ) : null}

            {filtered.map((r) => (
              <tr key={r.id_cliente}>
                <td className="name">{r.nombre}</td>

                {cuentas.map((c) => {
                  const v = getCell(r, c.id_cuenta_corriente);
                  const cls = v > 0 ? "pos" : v < 0 ? "neg" : "";
                  return (
                    <td key={c.id_cuenta_corriente} className={`num ${cls}`}>
                      {moneyARS(v)}
                    </td>
                  );
                })}

                <td className={`num ${Number(r.saldo) > 0 ? "pos" : Number(r.saldo) < 0 ? "neg" : ""}`}>
                  <b>{moneyARS(r.saldo)}</b>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <td className="tfootLabel">Totales</td>

              {cuentas.map((c) => {
                const v = Number((totales.columnas || {})[String(c.id_cuenta_corriente)] || 0);
                const cls = v > 0 ? "pos" : v < 0 ? "neg" : "";
                return (
                  <td key={c.id_cuenta_corriente} className={`num ${cls}`}>
                    {moneyARS(v)}
                  </td>
                );
              })}

              <td className={`num ${Number(totales.saldo) > 0 ? "pos" : Number(totales.saldo) < 0 ? "neg" : ""}`}>
                <b>{moneyARS(totales.saldo)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
