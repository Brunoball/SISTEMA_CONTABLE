// ✅ REEMPLAZAR COMPLETO
// src/components/Cuentas_Corrientes/Proveedores/Proveedores.jsx

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
  faEye,
} from "@fortawesome/free-solid-svg-icons";

import Toast from "../../Global/Toast.jsx";
import Calendario from "../../Global/Calendario/Calendario.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
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

function formatDisplayDate(value) {
  const v = safeText(value);
  if (!v) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
  return v;
}

function getBaseOrigin() {
  try {
    return new URL(BASE_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
}

function resolveFileUrl(rawUrl) {
  const url = safeText(rawUrl);
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const origin = getBaseOrigin();
  if (url.startsWith("/")) return `${origin}${url}`;

  return `${origin}/${url.replace(/^\.?\//, "")}`;
}

function canPreviewComprobante(row) {
  return (
    Number(row?.credito || 0) > 0 &&
    (safeText(row?.comprobante_url) !== "" || Number(row?.id_comprobante || 0) > 0)
  );
}

/* =========================
   Auth
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
   Proveedor helpers
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

function makeComprobanteAccessUrl(row, API) {
  const idComprobante = Number(row?.id_comprobante || 0);
  if (idComprobante > 0) {
    return `${API}?action=comprobantes_descargar&id_comprobante=${idComprobante}`;
  }

  return resolveFileUrl(row?.comprobante_url);
}

/* =========================
   Component
========================= */
export default function ProveedoresCC() {
  const API = `${BASE_URL}/api.php`;

  const { lists: listasCtx, loadingLists, errorLists, ensureListsLoaded } = useListas();
  const { dateRange, setDateRange } = useDateRange();

  const [calOpen, setCalOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [queryUsed, setQueryUsed] = useState("");
  const [openSug, setOpenSug] = useState(false);

  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ debito: 0, credito: 0, saldo: 0 });

  const [previewComprobante, setPreviewComprobante] = useState({
    open: false,
    url: "",
    mime: "",
    title: "Comprobante",
  });

  const [toast, setToast] = useState(null);
  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => setToast({ tipo, mensaje, duracion }),
    []
  );
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    ensureListsLoaded?.({ force: false, background: true }).catch(() => {});
  }, [ensureListsLoaded]);

  const rangeLabel = useMemo(() => {
    const from = dateRange?.from || null;
    const to = dateRange?.to || null;
    if (!from) return "Seleccionar período";
    if (!to || formatDateISO(from) === formatDateISO(to)) return formatDateLabel(from);
    return `${formatDateLabel(from)} → ${formatDateLabel(to)}`;
  }, [dateRange]);

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

  const suggestions = useMemo(() => {
    const needle = normLower(q);
    if (!openSug || needle.length < 1) return [];
    return proveedoresList.filter((p) => normLower(p.label).includes(needle)).slice(0, 25);
  }, [proveedoresList, q, openSug]);

  useEffect(() => {
    const text = safeText(q);
    setSelected((prev) => {
      if (!prev) return prev;
      if (normLower(prev.label) === normLower(text)) return prev;
      return null;
    });
  }, [q]);

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

        if (idOk) sp.set("proveedor_id", String(proveedorId));
        else sp.set("q", txt);

        sp.set("fecha_desde", formatDateISO(dateRange.from));
        sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));

        const data = await apiGet(`${API}?${sp.toString()}`);

        if (!data || data.exito !== true) {
          throw new Error(data?.mensaje || "Error al cargar historial del proveedor.");
        }

        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotales(data.totales || { debito: 0, credito: 0, saldo: 0 });
      } catch (e) {
        setRows([]);
        setTotales({ debito: 0, credito: 0, saldo: 0 });
        showToast("error", e?.message || "Error inesperado", 4200);
      } finally {
        setLoading(false);
      }
    },
    [API, dateRange, showToast]
  );

  useEffect(() => {
    setRows([]);
    setTotales({ debito: 0, credito: 0, saldo: 0 });
    setHasSearched(false);
    setQueryUsed("");
    setSelected(null);
    setQ("");
    setOpenSug(false);
  }, [dateRange]);

  const handleSelect = useCallback(
    (opt) => {
      if (!opt) return;
      const sel = { id: opt.id, label: opt.label };
      setSelected(sel);
      setQ(opt.label);
      setOpenSug(false);
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

  const exportExcel = useCallback(() => {
    if (!hasSearched || !rows.length) {
      showToast("advertencia", "Primero seleccioná un proveedor y cargá resultados.", 2500);
      return;
    }

    try {
      showToast("cargando", "Generando Excel…", 9000);

      const data = rows.map((r) => ({
        Fecha: formatDisplayDate(r.fecha || r.fecha_raw || ""),
        Comprobante: r.comprobante || "",
        Detalle: r.detalle || "",
        "Débito (Debe)": Number(r.debito || 0),
        "Crédito (Haber)": Number(r.credito || 0),
        Saldo: Number(r.saldo || 0),
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 14 },
        { wch: 28 },
        { wch: 28 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cuenta Corriente Proveedor");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const safeName = String(queryUsed || "proveedor").replace(/[^\w.-]+/g, "_");
      XLSX.writeFile(wb, `cc_proveedor_${safeName}_${stamp}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [hasSearched, rows, queryUsed, showToast]);

  const openComprobante = useCallback(
    (row) => {
      const accessUrl = makeComprobanteAccessUrl(row, API);
      const mime = safeText(row?.comprobante_mime);

      if (!accessUrl) {
        showToast("advertencia", "Este cobro no tiene comprobante asociado.", 2600);
        return;
      }

      setPreviewComprobante({
        open: true,
        url: accessUrl,
        mime,
        title: row?.comprobante ? `Comprobante · ${row.comprobante}` : "Comprobante",
      });
    },
    [API, showToast]
  );

  return (
    <div style={{ padding: 12 }}>
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      <ModalVerComprobante
        open={previewComprobante.open}
        url={previewComprobante.url}
        mime={previewComprobante.mime}
        title={previewComprobante.title}
        onClose={() =>
          setPreviewComprobante({
            open: false,
            url: "",
            mime: "",
            title: "Comprobante",
          })
        }
      />

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
            </div>

            <button
              className="cc-btnex cc-btn--excel"
              onClick={exportExcel}
              disabled={loading || !hasSearched || !rows.length}
              title={!hasSearched ? "Seleccioná un proveedor primero" : rows.length ? "Exportar a Excel" : "No hay datos"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {!hasSearched ? (
        <div style={{ padding: 16 }}>
          <div className="cc-footnote">
            * La tabla está vacía hasta que selecciones un proveedor del desplegable.
          </div>
        </div>
      ) : loading ? (
        <div style={{ padding: 16 }}>Cargando cuenta corriente del proveedor…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 16 }}>
          <div className="cc-emptyRow">No se encontraron movimientos para “{queryUsed}”.</div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            background: "#fff",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 8px 28px rgba(0,0,0,.08)",
            border: "1px solid rgba(0,0,0,.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1.4fr 160px 160px 160px 90px",
              gap: 0,
              background: "#f3f4f6",
              borderBottom: "1px solid rgba(0,0,0,.08)",
              fontWeight: 700,
              color: "#333",
            }}
          >
            <div style={{ padding: "14px 16px" }}>Fecha</div>
            <div style={{ padding: "14px 16px" }}>Comprobante</div>
            <div style={{ padding: "14px 16px", textAlign: "right" }}>Débito (Debe)</div>
            <div style={{ padding: "14px 16px", textAlign: "right" }}>Crédito (Haber)</div>
            <div style={{ padding: "14px 16px", textAlign: "right" }}>Saldo</div>
            <div style={{ padding: "14px 16px", textAlign: "center" }}>Ver</div>
          </div>

          {rows.map((r, i) => {
            const verHabilitado = canPreviewComprobante(r);

            return (
              <div
                key={r.id || `${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "130px 1.4fr 160px 160px 160px 90px",
                  borderBottom: i === rows.length - 1 ? "none" : "1px solid rgba(0,0,0,.06)",
                  alignItems: "center",
                  background: i % 2 === 0 ? "#fff" : "#fcfcfd",
                }}
              >
                <div style={{ padding: "14px 16px", color: "#444" }}>
                  {formatDisplayDate(r.fecha || r.fecha_raw)}
                </div>

                <div style={{ padding: "14px 16px" }}>
                  <div style={{ fontWeight: 600, color: "#2d2d2d" }}>{r.comprobante || "-"}</div>
                  {r.detalle ? (
                    <div style={{ fontSize: 12, opacity: 0.72, marginTop: 3 }}>{r.detalle}</div>
                  ) : null}
                </div>

                <div style={{ padding: "14px 16px", textAlign: "right", color: Number(r.debito || 0) > 0 ? "#1f2937" : "#9ca3af" }}>
                  {Number(r.debito || 0) > 0 ? moneyARS(r.debito || 0) : ""}
                </div>

                <div style={{ padding: "14px 16px", textAlign: "right", color: Number(r.credito || 0) > 0 ? "#1f2937" : "#9ca3af" }}>
                  {Number(r.credito || 0) > 0 ? moneyARS(r.credito || 0) : ""}
                </div>

                <div style={{ padding: "14px 16px", textAlign: "right", fontWeight: 700, color: "#111827" }}>
                  {moneyARS(r.saldo || 0)}
                </div>

                <div style={{ padding: "14px 16px", textAlign: "center", display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => verHabilitado && openComprobante(r)}
                    disabled={!verHabilitado}
                    title={
                      verHabilitado
                        ? "Ver comprobante"
                        : Number(r.credito || 0) > 0
                        ? "Este cobro no tiene comprobante"
                        : "Solo disponible en registros de crédito"
                    }
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,.12)",
                      background: verHabilitado ? "#fff" : "#f3f4f6",
                      color: verHabilitado ? "#111827" : "#9ca3af",
                      cursor: verHabilitado ? "pointer" : "not-allowed",
                      opacity: verHabilitado ? 1 : 0.7,
                    }}
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>
                </div>
              </div>
            );
          })}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1.4fr 160px 160px 160px 90px",
              background: "#f8fafc",
              borderTop: "1px solid rgba(0,0,0,.08)",
              fontWeight: 700,
            }}
          >
            <div style={{ padding: "14px 16px" }} />
            <div style={{ padding: "14px 16px" }}>Totales</div>
            <div style={{ padding: "14px 16px", textAlign: "right" }}>
              {moneyARS(totales?.debito || 0)}
            </div>
            <div style={{ padding: "14px 16px", textAlign: "right" }}>
              {moneyARS(totales?.credito || 0)}
            </div>
            <div style={{ padding: "14px 16px", textAlign: "right" }}>
              {moneyARS(totales?.saldo || 0)}
            </div>
            <div style={{ padding: "14px 16px" }} />
          </div>
        </div>
      )}

      <div className="cc-footnote" style={{ marginTop: 10 }}>
        * Débito = movimiento cargado al proveedor • Crédito = cobro registrado • Saldo = acumulado.
      </div>
    </div>
  );
}