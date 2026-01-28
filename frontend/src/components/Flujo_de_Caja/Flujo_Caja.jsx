// src/components/Flujo_de_Caja/Flujo_Caja.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import BASE_URL from "../../config/config";
import "./flujo_caja.css";

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

/* =========================
   Normalización listas
========================= */
const emptyLists = { tiendas: [] };

function normalizeLists(raw) {
  const src = raw?.listas && typeof raw.listas === "object" ? raw.listas : raw;
  const tiendas = Array.isArray(src?.tiendas) ? src.tiendas : [];
  return {
    tiendas: tiendas
      .map((t) => ({
        id: Number(t?.id ?? t?.id_tienda ?? 0),
        nombre: String(t?.nombre ?? "").trim(),
      }))
      .filter((t) => Number.isFinite(t.id) && t.id > 0 && t.nombre),
  };
}

// Busca una tienda "TENDENCIAS" (case-insensitive)
function findDefaultTiendaId(tiendas) {
  const t = (tiendas || []).find(
    (x) => String(x.nombre).trim().toLowerCase() === "tendencias"
  );
  return t?.id ? String(t.id) : "";
}

export default function Flujo_Caja() {
  const API = `${BASE_URL}/api.php`;

  // ✅ Por defecto: Enero 2026 (valor para API)
  const [periodo, setPeriodo] = useState("2026-01");

  // ✅ selector tienda (SIN "Todas")
  const [lists, setLists] = useState(emptyLists);
  const [idTienda, setIdTienda] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const periodOptions = useMemo(() => buildPeriodOptions2026(), []);

  /* =========================
     Cargar tiendas
  ========================= */
  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setError("");

    try {
      const res = await fetch(`${API}?action=global_obtener_listas`, {
        method: "GET",
      });
      const text = await res.text();

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Listas inválidas (no JSON). HTTP ${res.status} - ${text.slice(
            0,
            180
          )}`
        );
      }

      if (!json?.exito) {
        throw new Error(json?.mensaje || "No se pudieron cargar las listas.");
      }

      const normalized = normalizeLists(json);
      setLists(normalized);

      const def = findDefaultTiendaId(normalized.tiendas);
      const first = normalized.tiendas?.[0]?.id
        ? String(normalized.tiendas[0].id)
        : "";

      setIdTienda((prev) => {
        if (prev) {
          const exists = normalized.tiendas.some(
            (t) => String(t.id) === String(prev)
          );
          if (exists) return prev;
        }
        return def || first || "";
      });

      return normalized;
    } catch (e) {
      setLists(emptyLists);
      setData(null);
      setError(e?.message || "Error cargando listas (tiendas).");
      setIdTienda("");
      return emptyLists;
    } finally {
      setLoadingLists(false);
    }
  }, [API]);

  /* =========================
     Fetch resumen (siempre requiere id_tienda)
  ========================= */
  const fetchResumen = useCallback(async () => {
    if (!idTienda) return;

    setLoading(true);
    setError("");

    try {
      const sp = new URLSearchParams();
      sp.set("action", "flujo_caja_resumen");
      sp.set("periodo", periodo); // ✅ sigue siendo YYYY-MM para API
      sp.set("id_tienda", String(idTienda));

      const url = `${API}?${sp.toString()}`;
      const res = await fetch(url, { method: "GET" });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          `Respuesta inválida (no JSON). HTTP ${res.status} - ${text.slice(
            0,
            180
          )}`
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
  }, [API, periodo, idTienda]);

  /* =========================
     Init
  ========================= */
  useEffect(() => {
    loadLists();
  }, [loadLists]);

  useEffect(() => {
    fetchResumen();
  }, [fetchResumen]);

  const tiendaActual = data?.tiendas?.[0] || null;
  const rows = tiendaActual?.rows || [];
  const showing = rows.length;

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
                <label>Tienda</label>
                <select
                  value={idTienda}
                  onChange={(e) => setIdTienda(e.target.value)}
                  disabled={
                    loading || loadingLists || !(lists.tiendas || []).length
                  }
                >
                  {(lists.tiendas || []).map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="fc-filter">
                <label>Período (2026)</label>
                <select
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={loading || !idTienda}
                >
                  {periodOptions.map((p) => (
                    <option key={p} value={p}>
                      {periodLabelMMYYYY(p)} {/* ✅ MM-YYYY */}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="fc-card__actions">{/* acciones futuras */}</div>
        </div>

        {loading && !data && (
          <div className="fc-emptyRow">Cargando flujo de caja...</div>
        )}

        {tiendaActual ? (
          <>
            {/* header info */}
            <div className="fc-subhead">
              <div className="fc-subhead__name">
                Caja diaria {tiendaActual.nombre}
                <div className="fc-subhead__meta">
                  Período {data?.periodo} • Saldo base:{" "}
                  <b>{moneyARS(tiendaActual.saldo_base)}</b>
                </div>
              </div>

              <div className="fc-miniHint">
                Suma por día (Ingresos por forma) y Egresos (id_tipo_movimiento=2),
                con saldo acumulado.
              </div>
            </div>

            <div className="fc-tableWrap">
              {/* ✅ HEADER fijo (no scrollea) */}
              <div className="fc-grid fc-grid--head">
                <div className="fc-cell">FECHA</div>
                <div className="fc-cell is-center">TARJETAS DE CRÉDITO</div>
                <div className="fc-cell is-center">TRANSFERENCIAS</div>
                <div className="fc-cell is-center">EFECTIVO</div>
                <div className="fc-cell is-center">EGRESOS</div>
                <div className="fc-cell is-center">SALDO</div>
              </div>

              {/* ✅ SOLO ESTO tiene scroll */}
              <div className="fc-gridBody" role="rowgroup">
                {rows.map((r) => (
                  <div className="fc-grid fc-grid--row" key={r.fecha}>
                    <div className="fc-cell fc-date">{fmtDateES(r.fecha)}</div>

                    <div className="fc-cell fc-num is-center">
                      {moneyARS(r.tarjeta)}
                    </div>

                    <div className="fc-cell fc-num is-center">
                      {moneyARS(r.transferencias)}
                    </div>

                    <div className="fc-cell fc-num is-center">
                      {moneyARS(r.efectivo)}
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
              * El primer renglón es el último día del mes anterior. Fechas futuras
              se muestran en blanco (como el Excel).
            </div>
          </>
        ) : (
          !loading && (
            <div className="fc-emptyRow">No hay datos para mostrar.</div>
          )
        )}
      </section>
    </div>
  );
}
