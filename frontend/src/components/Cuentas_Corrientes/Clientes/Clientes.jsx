// src/components/Cuentas_Corrientes/Clientes/Clientes.jsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import BASE_URL from "../../../config/config";
import "../cuentas_corrientes.css";
import "../../Global/Global_css/Global_oscuro.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faFileExcel,
  faMagnifyingGlass,
  faTimes,
  faChevronDown,
  faEye,
  faBoxOpen,
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
   Cliente helpers
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
  const ape = safeText(c?.apellido);
  const nom = safeText(c?.nombre);
  if (ape && nom) return `${ape} ${nom}`.trim();

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
export default function ClientesCC() {
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

  const clientesList = useMemo(() => {
    const arr = Array.isArray(listasCtx?.clientes) ? listasCtx.clientes : [];
    return arr
      .map((c) => {
        const id = getClienteId(c);
        const label = getClienteLabel(c);
        return { id, label, raw: c };
      })
      .filter((x) => safeText(x.label).length > 0);
  }, [listasCtx?.clientes]);

  const suggestions = useMemo(() => {
    const needle = normLower(q);
    if (!openSug || needle.length < 1) return [];
    return clientesList.filter((c) => normLower(c.label).includes(needle)).slice(0, 25);
  }, [clientesList, q, openSug]);

  useEffect(() => {
    const text = safeText(q);
    setSelected((prev) => {
      if (!prev) return prev;
      if (normLower(prev.label) === normLower(text)) return prev;
      return null;
    });
  }, [q]);

  const loadHistorial = useCallback(
    async (clienteId, clienteLabel) => {
      if (!dateRange?.from) {
        showToast("advertencia", "Seleccioná un período.", 2600);
        return;
      }

      const txt = safeText(clienteLabel);
      const idOk = Number.isFinite(Number(clienteId)) && Number(clienteId) > 0;

      if (!idOk && txt.length < 2) {
        showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un cliente.", 2600);
        return;
      }

      setLoading(true);
      setHasSearched(true);
      setQueryUsed(txt || (idOk ? `Cliente #${clienteId}` : ""));

      try {
        const sp = new URLSearchParams();
        sp.set("action", "cc_historial_cliente");

        if (idOk) sp.set("id_cliente", String(clienteId));
        else sp.set("q", txt);

        sp.set("fecha_desde", formatDateISO(dateRange.from));
        sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));

        const data = await apiGet(`${API}?${sp.toString()}`);

        if (!data || data.exito !== true) {
          throw new Error(data?.mensaje || "Error al cargar historial del cliente.");
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
      setSelected({ id: opt.id, label: opt.label });
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
        else showToast("advertencia", "Escribí al menos 2 caracteres o seleccioná un cliente.", 2600);
      }

      if (e.key === "Escape") {
        setOpenSug(false);
      }
    },
    [openSug, suggestions, handleSelect, q, selected, loadHistorial, showToast]
  );

  const exportExcel = useCallback(() => {
    if (!hasSearched || !rows.length) {
      showToast("advertencia", "Primero seleccioná un cliente y cargá resultados.", 2500);
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
      XLSX.utils.book_append_sheet(wb, ws, "Cuenta Corriente Cliente");

      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const safeName = String(queryUsed || "cliente").replace(/[^\w.-]+/g, "_");
      XLSX.writeFile(wb, `cc_cliente_${safeName}_${stamp}.xlsx`);

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
    <div className="contenedor-cards">
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

      {errorLists && <div className="cc-footnote">{errorLists}</div>}


      <div className="cc-card__head">
        <div className="cc-card__headLeft">
          <div className="cc-headFilters">
            <div className="cc-filter cc-filter--cal">
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

            <div className="cc-filter cc-filter--search">
              <label>Buscar cliente</label>

<div className="cc-searchInput">
  <div className="cc-searchInput__fieldWrap">
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

    {safeText(q) !== "" && !loading && (
      <button
        type="button"
        className="cc-clearSearch cc-clearSearch--inside"
        title="Limpiar"
        onClick={() => {
          setQ("");
          setSelected(null);
          setOpenSug(false);
          setRows([]);
          setTotales({ debito: 0, credito: 0, saldo: 0 });
          setHasSearched(false);
          setQueryUsed("");
        }}
      >
        <FontAwesomeIcon icon={faTimes} />
      </button>
    )}

    <span className="cc-searchInput__arrow">
      <FontAwesomeIcon icon={faChevronDown} />
    </span>

    {openSug && suggestions.length > 0 && (
      <div className="cc-suggestions">
        <div className="cc-suggestions__scroll">
          {suggestions.map((opt) => (
            <button
              key={`${opt.id ?? "temp"}-${opt.label}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(opt);
              }}
              className="cc-suggestions__item"
              title={opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )}
  </div>

</div>
            </div>

          </div>
        </div>
                    <button
              className="cc-btnex cc-btn--excel"
              onClick={exportExcel}
              disabled={loading || !hasSearched || !rows.length}
              title={
                !hasSearched
                  ? "Seleccioná un cliente primero"
                  : rows.length
                  ? "Exportar a Excel"
                  : "No hay datos"
              }
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
      </div>

<div className="cc-cliente-table">

  {/* HEADER */}
<div
  className="mov-gridTable mov-gridTable--head"
  style={{ gridTemplateColumns: ".8fr 2.2fr 1fr 1fr 1fr .7fr" }}
>
  <div className="mov-gridCell mov-gridCell--head">Fecha</div>

  <div className="mov-gridCell mov-gridCell--head">
    Comprobante
  </div>

  <div className="mov-gridCell mov-gridCell--head is-center">
    Débito
  </div>

  <div className="mov-gridCell mov-gridCell--head is-center">
    Crédito
  </div>

  <div className="mov-gridCell mov-gridCell--head is-center">
    Saldo
  </div>

  <div className="mov-gridCell mov-gridCell--head is-center">
    Ver
  </div>
</div>

  {/* BODY CON SCROLL */}
  <div className="cc-cliente-table__body">

    {loading ? (
      <div className="cc-cliente-table__loading">
        Cargando cuenta corriente del cliente…
      </div>
    ) : rows.length > 0 ? (

      rows.map((r, i) => {
        const verHabilitado = canPreviewComprobante(r);

        return (
          <div
            key={r.id || `${i}`}
            className={`cc-cliente-table__row ${i % 2 !== 0 ? "is-alt" : ""}`}
          >

            <div className="cc-cliente-table__cell cc-cliente-table__cell--date">
              {formatDisplayDate(r.fecha || r.fecha_raw)}
            </div>

            <div className="cc-cliente-table__cell">
              <div className="cc-cliente-table__title">
                {r.comprobante || "-"}
              </div>

              {r.detalle && (
                <div className="cc-cliente-table__detail">
                  {r.detalle}
                </div>
              )}
            </div>

            <div
              className={`cc-cliente-table__cell cc-cliente-table__cell--center ${
                Number(r.debito || 0) > 0
                  ? "cc-cliente-table__amount--active"
                  : "cc-cliente-table__amount--muted"
              }`}
            >
              {Number(r.debito || 0) > 0 ? moneyARS(r.debito) : ""}
            </div>

            <div
              className={`cc-cliente-table__cell cc-cliente-table__cell--center ${
                Number(r.credito || 0) > 0
                  ? "cc-cliente-table__amount--active"
                  : "cc-cliente-table__amount--muted"
              }`}
            >
              {Number(r.credito || 0) > 0 ? moneyARS(r.credito) : ""}
            </div>

            <div className="cc-cliente-table__cell cc-cliente-table__cell--center cc-cliente-table__saldo">
              {moneyARS(r.saldo || 0)}
            </div>

            <div className="cc-cliente-table__cell cc-cliente-table__cell--center">
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
                className={`cc-verBtn ${verHabilitado ? "" : "is-disabled"}`}
              >
                <FontAwesomeIcon icon={faEye} />
              </button>
            </div>

          </div>
        );
      })

    ) : (

      <div className="cc-cliente-table__empty cc-emptyState">
        <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />

        <div className="cc-emptyText">
          {hasSearched
            ? `No se encontraron movimientos para “${queryUsed}”.`
            : "Sin movimientos para mostrar."}
        </div>
      </div>

    )}

  </div>

  {/* FOOTER */}
  <div className="cc-cliente-table__footWrap">
    <div className="cc-cliente-table__totals">



      <div className="cc-cliente-table__cell">
        Totales
      </div>

      <div className="cc-cliente-table__cell cc-cliente-table__cell--center">
        {moneyARS(totales?.debito || 0)}
      </div>

      <div className="cc-cliente-table__cell cc-cliente-table__cell--center">
        {moneyARS(totales?.credito || 0)}
      </div>

      <div className="cc-cliente-table__cell cc-cliente-table__cell--center">
        {moneyARS(totales?.saldo || 0)}
      </div>



    </div>
  </div>

</div>

      <div className="cc-footnote">
        * Débito = movimiento facturado • Crédito = cobro registrado • Saldo = acumulado.
      </div>
    </div>
  );
}