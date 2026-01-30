// src/components/Cuentas_Corrientes/Cuentas_Corrientes.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../config/config";
import "./cuentas_corrientes.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExcel } from "@fortawesome/free-solid-svg-icons";

// ✅ Toast global (igual que en Movimientos)
import Toast from "../Global/Toast.jsx";

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

  /* =========================
     ✅ TOAST GLOBAL
  ========================= */
  const [toast, setToast] = useState(null);

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const fetchResumen = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      // ✅ SIN período: cuenta corriente histórica
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

  /* ==========================================
     ✅ ORDENAR COLUMNAS: DEBITO primero, CREDITO después
     (y cualquier otra cuenta queda al final)
  ========================================== */
  const orderedCuentas = useMemo(() => {
    const list = Array.isArray(cuentas) ? [...cuentas] : [];

    const norm = (s) =>
      String(s || "")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const weight = (c) => {
      const name = norm(c?.nombre);
      // primero DEBITO, después CREDITO
      if (name.includes("DEBITO")) return 0;
      if (name.includes("CREDITO")) return 1;
      return 2; // resto
    };

    list.sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa !== wb) return wa - wb;

      // desempate estable: por nombre
      const na = norm(a?.nombre);
      const nb = norm(b?.nombre);
      return na.localeCompare(nb, "es");
    });

    return list;
  }, [cuentas]);

  // ✅ Exportar Excel (respeta filtros y columnas dinámicas) + Toast
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
        { wch: 30 }, // Cliente
        ...(orderedCuentas || []).map(() => ({ wch: 18 })),
        { wch: 18 }, // Saldo
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cuentas Corrientes");

      const stamp = new Date()
        .toISOString()
        .slice(0, 16)
        .replace(/[:T]/g, "-");

      XLSX.writeFile(wb, `cuentas_corrientes_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filtered, orderedCuentas, getCell, showToast]);

  return (
    <div className="cc-page">
      {/* ✅ Toast global */}
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
              {/* ✅ SIN período */}
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

              {/* ✅ Exportar Excel */}
              <button
                className="cc-btnex cc-btn--excel"
                onClick={exportExcel}
                disabled={loading || !filtered.length}
                title={
                  filtered.length
                    ? "Exportar a Excel"
                    : "No hay datos para exportar"
                }
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
              gridTemplateColumns: `260px repeat(${orderedCuentas.length}, 1fr) .5fr`,
            }}
          >
            <div className="cc-cell cc-name">CLIENTE</div>
            {orderedCuentas.map((c) => (
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
                  gridTemplateColumns: `260px repeat(${orderedCuentas.length}, 1fr) .5fr`,
                }}
              >
                <div className="cc-cell cc-name">{r.nombre}</div>

                {orderedCuentas.map((c) => {
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

            {/* ✅ Footer */}
            <div
              className="cc-grid cc-grid--tfoot"
              style={{
                gridTemplateColumns: `260px repeat(${orderedCuentas.length}, 1fr) .5fr`,
              }}
            >
              <div className="cc-cell cc-tfootLabel">Totales</div>

              {orderedCuentas.map((c) => {
                const v = Number(
                  (totales.columnas || {})[String(c.id_cuenta_corriente)] || 0
                );
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
          </div>

          {/* accesibilidad/consistencia */}
          {!err && loading && filtered.length === 0 ? (
            <div className="cc-emptyRow">Cargando cuentas corrientes...</div>
          ) : null}
        </div>

        <div className="cc-footnote">
          * Las columnas se generan desde <b>cuentas_corrientes</b>. El saldo es
          la suma final por cliente.
        </div>
      </section>
    </div>
  );
}
