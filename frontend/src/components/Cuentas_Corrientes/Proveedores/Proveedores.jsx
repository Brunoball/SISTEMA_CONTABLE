// ✅ REEMPLAZAR COMPLETO
// src/components/Cuentas_Corrientes/Proveedores/Proveedores.jsx
// ✅ Buscador IGUAL al Modal (como ClientesCC corregido):
// - Sugerencias CLIENT-SIDE desde ListasContext.lists.proveedores
// - Filtro: toLowerCase().includes()
// - Dropdown: onMouseDown + blur con delay
// - Al seleccionar: carga historial automáticamente
// - Botón Buscar: opcional (usa selected si existe, si no usa texto)

// 🔥 IMPORTANTE BACKEND:
// Este componente usa action=cc_historial_proveedor y envía proveedor_id (id_proveedor).
// Asegurate que tu backend soporte:
//   - action=cc_historial_proveedor
//   - proveedor_id
//   - fecha_desde / fecha_hasta
// y devuelva { exito:true, rows:[], totales:{saldo:...} }

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
   Proveedores (id + label) robusto
========================= */
function getProveedorId(p) {
  const cand =
    p?.id ??
    p?.id_proveedor ??
    p?.idProveedor ??
    p?.proveedor_id ??
    p?.id_persona ??
    p?.idPersona ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getProveedorLabel(p) {
  // si viene razon_social/nombre/label/descripcion
  const parts = [
    p?.razon_social,
    p?.razonSocial,
    p?.nombre,
    p?.proveedor,
    p?.proveedor_nombre,
    p?.label,
    p?.descripcion,
    p?.texto,
  ]
    .map(safeText)
    .filter(Boolean);

  return parts[0] || "";
}

/* =========================
   Component
========================= */
export default function ProveedoresCC() {
  const API = `${BASE_URL}/api.php`;

  // ✅ listas globales (para sugerencias tipo modal)
  const { lists: listasCtx, loadingLists, errorLists, ensureListsLoaded } = useListas();

  // ✅ rango global
  const { dateRange, setDateRange } = useDateRange();
  const [calOpen, setCalOpen] = useState(false);

  // UI
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ selección actual
  const [selected, setSelected] = useState(null); // {id,label}

  // ✅ tabla vacía hasta buscar
  const [hasSearched, setHasSearched] = useState(false);
  const [queryUsed, setQueryUsed] = useState("");

  // dropdown (igual modal)
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

  // asegurar listas
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
     Proveedores list (autocompletar)
  ========================= */
  const proveedoresList = useMemo(() => {
    const arr = Array.isArray(listasCtx?.proveedores) ? listasCtx.proveedores : [];
    return arr
      .map((p) => {
        const id = getProveedorId(p);
        const label = getProveedorLabel(p);
        return { id, label, raw: p };
      })
      .filter((x) => safeText(x.label).length > 0);
  }, [listasCtx?.proveedores]);

  /* =========================
     Sugerencias (igual ModalNuevaVenta)
  ========================= */
  const suggestions = useMemo(() => {
    const needle = normLower(q);
    if (!openSug || needle.length < 1) return [];
    return proveedoresList
      .filter((p) => normLower(p.label).includes(needle))
      .slice(0, 25);
  }, [proveedoresList, q, openSug]);

  /* =========================
     Al escribir: invalida selección previa
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
     Buscar historial
  ========================= */
  const loadHistorial = useCallback(
    async (proveedorId, proveedorLabel) => {
      if (!dateRange?.from) {
        showToast("advertencia", "Seleccioná un período.", 2600);
        return;
      }

      const txt = safeText(proveedorLabel);
      const idOk = Number.isFinite(Number(proveedorId)) && Number(proveedorId) > 0;

      if (!idOk && txt.length < 2) {
        showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un proveedor.", 2600);
        return;
      }

      setLoading(true);
      setHasSearched(true);
      setQueryUsed(txt || (idOk ? `Proveedor #${proveedorId}` : ""));

      try {
        const sp = new URLSearchParams();
        sp.set("action", "cc_historial_proveedor");

        // ✅ preferimos ID si existe (como cliente)
        if (idOk) sp.set("proveedor_id", String(proveedorId));
        else sp.set("q", txt);

        sp.set("fecha_desde", formatDateISO(dateRange.from));
        sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));

        const data = await apiGet(`${API}?${sp.toString()}`);

        if (!data || data.exito !== true) {
          throw new Error(data?.mensaje || "Error al cargar historial del proveedor.");
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

  // ✅ cambia período => vuelve a vacío
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
     Selección (igual patrón modal)
  ========================= */
  const handleSelect = useCallback(
    (opt) => {
      if (!opt) return;
      const sel = { id: opt.id, label: opt.label };
      setSelected(sel);
      setQ(opt.label);
      setOpenSug(false);

      // 🔥 automático
      loadHistorial(opt.id, opt.label);
    },
    [loadHistorial]
  );

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

        if (text.length >= 2) loadHistorial(null, text);
        else showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un proveedor.", 2600);
      }

      if (e.key === "Escape") setOpenSug(false);
    },
    [openSug, suggestions, handleSelect, q, selected, loadHistorial, showToast]
  );

  /* =========================
     Excel
  ========================= */
  const exportExcel = useCallback(() => {
    if (!hasSearched || !rows.length) {
      showToast("advertencia", "Primero seleccioná un proveedor y cargá resultados.", 2500);
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
      XLSX.utils.book_append_sheet(wb, ws, "Historial Proveedor");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const safeName = String(queryUsed || "proveedor").replace(/[^\w.-]+/g, "_");
      XLSX.writeFile(wb, `cc_proveedor_${safeName}_${stamp}.xlsx`);

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
          Proveedores
          <div className="cc-subhead__meta">
            Seleccioná un proveedor del desplegable • {rangeLabel}
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

            {/* Buscar proveedor (autocomplete igual modal) */}
            <div
              className="cc-filter cc-filter--search"
              style={{ minWidth: 360, flex: 1, position: "relative" }}
            >
              <label>Buscar proveedor</label>

              <div className="cc-searchInput" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    className="cc-input"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setOpenSug(true)}
                    onBlur={() => setTimeout(() => setOpenSug(false), 120)}
                    placeholder={loadingLists ? "Cargando proveedores…" : "Escribí para buscar proveedores…"}
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

                  {/* Dropdown */}
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
                    if (selected?.id) loadHistorial(selected.id, selected.label);
                    else if (text.length >= 2) loadHistorial(null, text);
                    else showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un proveedor.", 2600);
                  }}
                  disabled={loading || loadingLists}
                  title="Buscar"
                >
                  <FontAwesomeIcon icon={faMagnifyingGlass} /> Buscar
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                * Seleccioná una opción del desplegable para cargar el historial.
              </div>
            </div>

            <button
              className="cc-btnex cc-btn--excel"
              onClick={exportExcel}
              disabled={loading || !hasSearched || !rows.length}
              title={
                !hasSearched ? "Seleccioná un proveedor primero" : rows.length ? "Exportar a Excel" : "No hay datos"
              }
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {/* TABLA */}
      {!hasSearched ? (
        <div style={{ padding: 16 }}>
          <div className="cc-footnote">
            * La tabla está vacía hasta que selecciones un proveedor del desplegable.
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: 16 }}>Cargando historial del proveedor…</div>
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
        * Historial por proveedor: se carga automáticamente al seleccionar del desplegable.
      </div>
    </div>
  );
}