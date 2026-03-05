// ✅ REEMPLAZAR COMPLETO
// src/components/Cuentas_Corrientes/Clientes/Clientes.jsx
// ✅ Buscador igual al ModalNuevaVenta (client-side, con lista completa)
// - NO pega al backend para sugerencias
// - Filtra sobre listasCtx.clientes
// - Usa onMouseDown + blur con delay (igual patrón)
// - Permite escribir libre, pero si querés “igual que modal”, lo ideal es seleccionar del listado

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../../config/config";
import "../cuentas_corrientes.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faFileExcel,
  faMagnifyingGlass,
  faTimes,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";

import Toast from "../../Global/Toast.jsx";
import Calendario from "../../Global/Calendario/Calendario.jsx";
import { useDateRange } from "../../../context/DateRangeContext.jsx";
import { useListas } from "../../../context/ListasContext.jsx";

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

function formatDateISO(d) {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateLabel(d) {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}/${d.getFullYear()}`;
}

function safeText(v) {
  return String(v ?? "").trim();
}

/* ✅ Normalización (tipo ModalNuevaVenta: toLowerCase/includes) */
function normLower(s) {
  return safeText(s).toLowerCase();
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
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${res.status} (Unauthorized): Sesión vencida o no autorizada. Volvé a iniciar sesión.`
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
   IDs + Labels clientes (robusto)
========================= */
function getClienteId(c) {
  const cand =
    c?.id ??
    c?.id_cliente ??
    c?.idCliente ??
    c?.cliente_id ??
    c?.idcli ??
    c?.idCli ??
    c?.id_persona ??
    c?.idPersona ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getClienteLabel(c) {
  // si viene apellido+nombre
  const ape = safeText(c?.apellido);
  const nom = safeText(c?.nombre);
  if (ape && nom) return `${ape} ${nom}`.trim();

  // razón social / nombre / label
  const parts = [
    c?.razon_social,
    c?.razonSocial,
    c?.cliente,
    c?.cliente_nombre,
    c?.nombre,
    c?.descripcion,
    c?.label,
  ]
    .map(safeText)
    .filter(Boolean);

  return parts[0] || "";
}

/* =========================
   Component
========================= */
export default function ClientesCC() {
  const API = `${BASE_URL}/api.php`;

  // ✅ listas globales (para sugerencias como ModalNuevaVenta)
  const { lists: listasCtx, loadingLists, errorLists, ensureListsLoaded } = useListas();

  // ✅ rango global
  const { dateRange, setDateRange } = useDateRange();
  const [calOpen, setCalOpen] = useState(false);

  // UI
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ selección actual (igual modal)
  const [selected, setSelected] = useState(null); // { id, label }

  // tabla vacía hasta buscar
  const [hasSearched, setHasSearched] = useState(false);
  const [queryUsed, setQueryUsed] = useState("");

  // dropdown (igual patrón modal)
  const [openSug, setOpenSug] = useState(false);

  // datos
  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ saldo: 0 });

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => setToast({ tipo, mensaje, duracion }),
    []
  );
  const closeToast = useCallback(() => setToast(null), []);

  // asegurar listas (cacheadas)
  useEffect(() => {
    ensureListsLoaded?.({ force: false, background: true }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeLabel = useMemo(() => {
    const from = dateRange?.from || null;
    const to = dateRange?.to || null;
    if (!from) return "Seleccionar período";
    if (!to || formatDateISO(from) === formatDateISO(to)) return formatDateLabel(from);
    return `${formatDateLabel(from)} → ${formatDateLabel(to)}`;
  }, [dateRange]);

  /* =========================
     Clientes list (para autocompletar)
  ========================= */
  const clientesList = useMemo(() => {
    const arr = Array.isArray(listasCtx?.clientes) ? listasCtx.clientes : [];
    // normalizamos una “vista” {id,label,raw} para filtrar rápido
    return arr
      .map((c) => {
        const id = getClienteId(c);
        const label = getClienteLabel(c);
        return { id, label, raw: c };
      })
      .filter((x) => safeText(x.label).length > 0);
  }, [listasCtx?.clientes]);

  /* =========================
     Sugerencias (igual ModalNuevaVenta)
     - aparece con foco + 1+ letra
     - filtro includes() en minúsculas
     - slice(0, 25)
  ========================= */
  const suggestions = useMemo(() => {
    const needle = normLower(q);
    if (!openSug || needle.length < 1) return [];
    return clientesList
      .filter((c) => normLower(c.label).includes(needle))
      .slice(0, 25);
  }, [clientesList, q, openSug]);

  /* =========================
     Al escribir: invalida selección previa (igual modal)
  ========================= */
  useEffect(() => {
    const text = safeText(q);
    setSelected((prev) => {
      if (!prev) return prev;
      if (normLower(prev.label) === normLower(text)) return prev;
      return null;
    });
  }, [q]);

  /* =========================
     Historial (se dispara al seleccionar o al buscar)
  ========================= */
  const loadHistorial = useCallback(
    async (clienteId, clienteLabel) => {
      if (!dateRange?.from) {
        showToast("advertencia", "Seleccioná un período.", 2600);
        return;
      }

      setLoading(true);
      setHasSearched(true);
      setQueryUsed(clienteLabel || "");

      try {
        const sp = new URLSearchParams();
        sp.set("action", "cc_historial_cliente");

        // ✅ igual que lo tuyo: por id si existe, si no por texto
        if (clienteId != null) sp.set("id_cliente", String(clienteId));
        else sp.set("q", String(clienteLabel || "").trim());

        sp.set("fecha_desde", formatDateISO(dateRange.from));
        sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));

        const data = await apiGet(`${API}?${sp.toString()}`);

        if (!data || data.exito !== true) {
          throw new Error(data?.mensaje || "Error al cargar historial del cliente.");
        }

        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotales(data.totales || { saldo: 0 });
      } catch (e) {
        setRows([]);
        setTotales({ saldo: 0 });
        showToast("error", e?.message || "Error inesperado", 4200);
      } finally {
        setLoading(false);
      }
    },
    [API, dateRange, showToast]
  );

  // ✅ cambia período => vuelve a vacío (como tenías)
  useEffect(() => {
    setRows([]);
    setTotales({ saldo: 0 });
    setHasSearched(false);
    setQueryUsed("");
    setSelected(null);
    setQ("");
    setOpenSug(false);
  }, [dateRange]);

  /* =========================
     Selección (igual patrón modal: onMouseDown)
  ========================= */
  const handleSelect = useCallback(
    (opt) => {
      if (!opt) return;
      setSelected({ id: opt.id, label: opt.label });
      setQ(opt.label);
      setOpenSug(false);

      // ✅ igual que pedís: al seleccionar, carga automático
      loadHistorial(opt.id, opt.label);
    },
    [loadHistorial]
  );

  /* =========================
     Teclado (Enter/Escape) parecido al tuyo
  ========================= */
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();

        if (openSug && suggestions.length > 0) {
          handleSelect(suggestions[0]);
          return;
        }

        const text = safeText(q);
        if (selected?.id) {
          loadHistorial(selected.id, selected.label);
          return;
        }

        // Si no hay sugerencia seleccionada, intenta por texto (tu comportamiento actual)
        if (text.length >= 2) loadHistorial(null, text);
        else showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un cliente.", 2600);
      }

      if (e.key === "Escape") {
        setOpenSug(false);
      }
    },
    [openSug, suggestions, handleSelect, q, selected, loadHistorial, showToast]
  );

  /* =========================
     Excel
  ========================= */
  const exportExcel = useCallback(() => {
    if (!hasSearched || !rows.length) {
      showToast("advertencia", "Primero seleccioná un cliente y cargá resultados.", 2500);
      return;
    }

    try {
      showToast("cargando", "Generando Excel…", 9000);

      const data = rows.map((r) => ({
        Fecha: r.fecha || r.fecha_mov || "",
        Tipo: r.tipo || r.movimiento || "",
        Comprobante: r.comprobante || r.numero || "",
        Débito: Number(r.debito || 0),
        Crédito: Number(r.credito || 0),
        Saldo: Number(r.saldo || 0),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 12 },
        { wch: 16 },
        { wch: 22 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Historial Cliente");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const safeName = String(queryUsed || "cliente").replace(/[^\w.-]+/g, "_");
      XLSX.writeFile(wb, `cc_cliente_${safeName}_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [hasSearched, rows, queryUsed, showToast]);

  return (
    <div style={{ padding: 12 }}>
      {toast && (
        <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />
      )}

      {errorLists && (
        <div className="cc-footnote" style={{ marginBottom: 10 }}>
          {errorLists}
        </div>
      )}

      <div className="cc-subhead" style={{ marginTop: 0 }}>
        <div className="cc-subhead__name">
          Clientes
          <div className="cc-subhead__meta">
            Seleccioná un cliente del desplegable • {rangeLabel}
          </div>
        </div>
      </div>

      <div className="cc-card__head" style={{ paddingTop: 10 }}>
        <div className="cc-card__headLeft" style={{ width: "100%" }}>
          <div className="cc-headFilters" style={{ width: "100%" }}>
            {/* Período */}
            <div className="cc-filter cc-filter--cal" style={{ position: "relative" }}>
              <label>
                <FontAwesomeIcon icon={faCalendarDays} /> Período
              </label>

              <button
                type="button"
                className={`cc-calTrigger ${calOpen ? "is-open" : ""}`}
                onClick={() => setCalOpen((v) => !v)}
                disabled={loading}
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
                      if (range?.from && range?.to) setCalOpen(false);
                    }}
                    onClose={() => setCalOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Buscador con autocompletado (IGUAL MODAL) */}
            <div
              className="cc-filter cc-filter--search"
              style={{ minWidth: 360, flex: 1, position: "relative" }}
            >
              <label>Buscar cliente</label>

              <div className="cc-searchInput" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    className="cc-input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setOpenSug(true)}
                    onBlur={() => setTimeout(() => setOpenSug(false), 120)}
                    placeholder={loadingLists ? "Cargando clientes…" : "Escribí para buscar clientes…"}
                    disabled={loading || loadingLists}
                    autoComplete="off"
                  />

                  <span
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      opacity: 0.6,
                      pointerEvents: "none",
                      fontSize: 12,
                    }}
                  >
                    <FontAwesomeIcon icon={faChevronDown} />
                  </span>

                  {/* DROPDOWN DE SUGERENCIAS (igual Modal) */}
                  {openSug && suggestions.length > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "calc(100% + 6px)",
                        zIndex: 1000,
                        background: "var(--card-bg, #fff)",
                        border: "1px solid rgba(0,0,0,.12)",
                        borderRadius: 10,
                        overflow: "hidden",
                        boxShadow: "0 12px 30px rgba(0,0,0,.18)",
                      }}
                    >
                      <div style={{ maxHeight: 260, overflow: "auto" }}>
                        {suggestions.map((opt) => (
                          <button
                            key={`${opt.id ?? "temp"}-${opt.label}`}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelect(opt);
                            }}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "10px 12px",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                            title={opt.label}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {safeText(q) !== "" && !loading && (
                  <button
                    type="button"
                    className="cc-clearSearch"
                    title="Limpiar"
                    onClick={() => {
                      setQ("");
                      setSelected(null);
                      setOpenSug(false);
                      setRows([]);
                      setHasSearched(false);
                      setQueryUsed("");
                    }}
                    style={{ position: "static" }}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                )}

                <button
                  type="button"
                  className="cc-btnex"
                  onClick={() => {
                    const text = safeText(q);
                    if (selected?.id) {
                      loadHistorial(selected.id, selected.label);
                    } else if (text.length >= 2) {
                      loadHistorial(null, text);
                    } else {
                      showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un cliente.", 2600);
                    }
                  }}
                  disabled={loading || loadingLists}
                  title="Buscar"
                >
                  <FontAwesomeIcon icon={faMagnifyingGlass} /> Buscar
                </button>
              </div>
            </div>

            <button
              className="cc-btnex cc-btn--excel"
              onClick={exportExcel}
              disabled={loading || !hasSearched || !rows.length}
              title={
                !hasSearched ? "Seleccioná un cliente primero" : rows.length ? "Exportar a Excel" : "No hay datos"
              }
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {/* TABLA DE RESULTADOS */}
      {!hasSearched ? (
        <div style={{ padding: 16 }}>
          <div className="cc-footnote">
            * La tabla está vacía hasta que selecciones un cliente del desplegable.
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: 16 }}>Cargando historial del cliente…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 16 }}>
          <div className="cc-emptyRow">No se encontraron movimientos para “{queryUsed}”.</div>
        </div>
      ) : (
        <div className="cc-tableWrap" style={{ marginTop: 10 }}>
          <div
            className="cc-grid cc-grid--head"
            style={{ gridTemplateColumns: "120px 160px 1fr 160px 160px 160px" }}
          >
            <div className="cc-cell">FECHA</div>
            <div className="cc-cell">TIPO</div>
            <div className="cc-cell">DETALLE</div>
            <div className="cc-cell is-center" style={{ fontWeight: 700 }}>
              DÉBITO
            </div>
            <div className="cc-cell is-center" style={{ fontWeight: 700 }}>
              CRÉDITO
            </div>
            <div className="cc-cell is-center" style={{ fontWeight: 700 }}>
              SALDO
            </div>
          </div>

          <div className="cc-gridBody" role="rowgroup">
            {rows.map((r, i) => (
              <div
                key={r.id_mov || r.id || `${i}`}
                className="cc-grid cc-grid--row"
                style={{ gridTemplateColumns: "120px 160px 1fr 160px 160px 160px" }}
              >
                <div className="cc-cell">{r.fecha || r.fecha_mov || ""}</div>
                <div className="cc-cell">{r.tipo || r.movimiento || ""}</div>
                <div className="cc-cell" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.detalle || r.descripcion || r.comprobante || r.numero || "-"}
                </div>
                <div className="cc-cell cc-num is-center is-negative">{moneyARS(r.debito || 0)}</div>
                <div className="cc-cell cc-num is-center is-positive">{moneyARS(r.credito || 0)}</div>
                <div className="cc-cell cc-num is-center cc-saldo">
                  <b>{moneyARS(r.saldo || 0)}</b>
                </div>
              </div>
            ))}

            <div
              className="cc-grid cc-grid--tfoot"
              style={{ gridTemplateColumns: "120px 160px 1fr 160px 160px 160px" }}
            >
              <div className="cc-cell cc-tfootLabel" style={{ gridColumn: "1 / 4" }}>
                Total / Saldo final
              </div>
              <div className="cc-cell cc-num is-center is-negative">-</div>
              <div className="cc-cell cc-num is-center is-positive">-</div>
              <div className="cc-cell cc-num is-center cc-saldo">
                <b>{moneyARS(totales?.saldo || 0)}</b>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="cc-footnote" style={{ marginTop: 10 }}>
        * Historial por cliente: se carga automáticamente al seleccionar del desplegable.
      </div>
    </div>
  );
}