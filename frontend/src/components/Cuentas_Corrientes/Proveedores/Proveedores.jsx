// src/components/Cuentas_Corrientes/Proveedores/Proveedores.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import BASE_URL from "../../../config/config";
import "../cuentas_corrientes.css";
import "../../Global/Global_css/Global_oscuro.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faFileExcel,
  faTimes,
  faEye,
  faBoxOpen,
  faChevronDown,
  faArrowRightLong,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";

import Toast from "../../Global/Toast.jsx";
import Calendario from "../../Global/Calendario/Calendario.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import { useDateRange } from "../../../context/DateRangeContext.jsx";
import { useListas } from "../../../context/ListasContext.jsx";

import BotonExportar from "../../Global/Boton_Exportar/BotonExportar.jsx";

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
   Export helpers
========================= */
function escapeCSV(value) {
  const s = String(value ?? "");
  if (/[",;\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function buildExportRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    FECHA: formatDisplayDate(r.fecha || r.fecha_raw || ""),
    COMPROBANTE: safeText(r.comprobante || ""),
    DETALLE: safeText(r.detalle || ""),
    "DÉBITO (DEBE)": Number(r.debito || 0),
    "CRÉDITO (HABER)": Number(r.credito || 0),
    SALDO: Number(r.saldo || 0),
  }));
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
  const navigate = useNavigate();
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

  const tableBodyRef = useRef(null);
  const [hasVerticalScroll, setHasVerticalScroll] = useState(false);
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

  useEffect(() => {
    const el = tableBodyRef.current;
    if (!el) return;

    const checkScroll = () => {
      const hasScroll = el.scrollHeight > el.clientHeight + 1;
      setHasVerticalScroll(hasScroll);
    };

    checkScroll();

    const ro = new ResizeObserver(() => checkScroll());
    ro.observe(el);

    const mo = new MutationObserver(() => checkScroll());
    mo.observe(el, { childList: true, subtree: true });

    window.addEventListener("resize", checkScroll);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", checkScroll);
    };
  }, [rows, loading]);

  const rangeLabel = useMemo(() => {
    const from = dateRange?.from || null;
    const to = dateRange?.to || null;

    if (!from) return "Seleccionar período";

    if (!to || formatDateISO(from) === formatDateISO(to)) {
      return formatDateLabel(from);
    }

    return (
      <>
        <span>{formatDateLabel(from)}</span>
        <span className="cc-rangeArrow">
          <FontAwesomeIcon icon={faArrowRightLong} />
        </span>
        <span>{formatDateLabel(to)}</span>
      </>
    );
  }, [dateRange]);

  const exportBaseName = useMemo(() => {
    const safeName = String(queryUsed || "proveedor").replace(/[^\w.-]+/g, "_");
    const from = formatDateISO(dateRange?.from);
    const to = formatDateISO(dateRange?.to || dateRange?.from);
    return `cc_proveedor_${safeName}_${from}_${to}`;
  }, [queryUsed, dateRange]);

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
        else
          showToast(
            "advertencia",
            "Escribí al menos 2 caracteres o seleccioná un proveedor.",
            2600
          );
      }

      if (e.key === "Escape") setOpenSug(false);
    },
    [openSug, suggestions, handleSelect, q, selected, loadHistorial, showToast]
  );

  /* =========================
     Export functions
  ========================= */
  const getExportData = useCallback(() => {
    const data = buildExportRows(rows);
    if (!data.length) throw new Error("No hay datos para exportar.");
    return data;
  }, [rows]);

  const exportToExcel = useCallback(() => {
    const dataToExport = getExportData();
    const ws = XLSX.utils.json_to_sheet(dataToExport);
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
    XLSX.writeFile(wb, `${exportBaseName}.xlsx`);
  }, [getExportData, exportBaseName]);

  const exportToCSV = useCallback(() => {
    const dataToExport = getExportData();
    const headers = Object.keys(dataToExport[0] || {});
    const lines = [
      headers.join(";"),
      ...dataToExport.map((row) => headers.map((h) => escapeCSV(row[h])).join(";")),
    ];
    const csvContent = "\uFEFF" + lines.join("\n");
    downloadBlob(csvContent, `${exportBaseName}.csv`, "text/csv;charset=utf-8;");
  }, [getExportData, exportBaseName]);

  const exportToTXT = useCallback(() => {
    const dataToExport = getExportData();
    const lines = dataToExport.map((row, index) => {
      return [
        `REGISTRO ${index + 1}`,
        `FECHA: ${row.FECHA ?? ""}`,
        `COMPROBANTE: ${row.COMPROBANTE ?? ""}`,
        `DETALLE: ${row.DETALLE ?? ""}`,
        `DÉBITO (DEBE): ${row["DÉBITO (DEBE)"] ?? ""}`,
        `CRÉDITO (HABER): ${row["CRÉDITO (HABER)"] ?? ""}`,
        `SALDO: ${row.SALDO ?? ""}`,
        "----------------------------------------",
      ].join("\n");
    });
    downloadBlob(lines.join("\n"), `${exportBaseName}.txt`, "text/plain;charset=utf-8;");
  }, [getExportData, exportBaseName]);

  const handleExport = useCallback(
    async (type) => {
      try {
        if (type === "excel") {
          exportToExcel();
          showToast("exito", "Excel exportado.", 2200);
          return;
        }
        if (type === "csv") {
          exportToCSV();
          showToast("exito", "CSV exportado.", 2200);
          return;
        }
        if (type === "txt") {
          exportToTXT();
          showToast("exito", "TXT exportado.", 2200);
        }
      } catch (e) {
        showToast("error", e?.message || "Error exportando archivo.", 3500);
      }
    },
    [exportToExcel, exportToCSV, exportToTXT, showToast]
  );

  const exportOptions = useMemo(
    () => [
      {
        key: "excel",
        label: "Exportar Excel (.xlsx)",
        icon: faFileExcel,
        onClick: () => handleExport("excel"),
      },
      {
        key: "csv",
        label: "Exportar CSV (.csv)",
        onClick: () => handleExport("csv"),
      },
      {
        key: "txt",
        label: "Exportar TXT (.txt)",
        onClick: () => handleExport("txt"),
      },
    ],
    [handleExport]
  );

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

      {/* ✅ HEAD UNIFICADO — igual que Movimientos */}
      <div className="mov-card__head">
        <div className="mov-card__headLeft">

          <div className="title-mov">
            <div className="mov-card__title">Cuentas Corrientes</div>
            <div className="mov-card__hint">
              Mostrando <b>{rows.length}</b> registro{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mov-headFilters">

            {/* CALENDARIO */}
            <div className="cc-filter cc-filter--cal">
              <div className={`cc-floatingField cc-floatingField--calendar is-active ${calOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className={`cc-calTrigger ${calOpen ? "is-open" : ""}`}
                  onClick={() => setCalOpen((v) => !v)}
                  disabled={loading}
                >
                  {rangeLabel}
                  <span className="cc-calTrigger__iconRight">
                    <FontAwesomeIcon icon={faChevronDown} />
                  </span>
                </button>

                <span className="cc-floatingLabel cc-floatingLabel--active">
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </span>

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
            </div>

            {/* BÚSQUEDA */}
            <div className="cc-filter cc-filter--search">
              <div
                className={`cc-floatingField cc-floatingField--search ${
                  openSug || safeText(q) !== "" ? "is-active" : ""
                }`}
              >
                <div className="cc-searchInput">
                  <div className="cc-searchInput__fieldWrap">
                    <input
                      className="cc-input cc-input--floating"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setOpenSug(true)}
                      onBlur={() => setTimeout(() => setOpenSug(false), 120)}
                      placeholder=" "
                      disabled={loading || loadingLists}
                      autoComplete="off"
                    />

                    <span className="cc-floatingLabel">
                      <FontAwesomeIcon icon={faMagnifyingGlass} />{" "}
                      {loadingLists ? "Cargando proveedores…" : "Buscar proveedor"}
                    </span>

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
        </div>

        {/* EXPORTAR */}
        <BotonExportar
          disabled={loading || !hasSearched || rows.length === 0}
          loading={false}
          label="Exportar"
          title={
            !hasSearched
              ? "Seleccioná un proveedor primero"
              : rows.length
              ? "Exportar archivo"
              : "No hay datos para exportar"
          }
          opciones={exportOptions}
          align="right"
        />
      </div>

      {errorLists && <div className="cc-footnote">{errorLists}</div>}

      <div className="cc-cliente-table">
        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: ".8fr 2.2fr 1fr 1fr 1fr .7fr" }}
        >
          <div className="mov-gridCell mov-gridCell--head">Fecha</div>
          <div className="mov-gridCell mov-gridCell--head">Comprobante</div>
          <div className="mov-gridCell mov-gridCell--head is-right">Débito</div>
          <div className="mov-gridCell mov-gridCell--head is-right">Crédito</div>
          <div className="mov-gridCell mov-gridCell--head is-right">Saldo</div>
          <div className="mov-gridCell mov-gridCell--head is-center">Ver</div>
        </div>

        <div
          ref={tableBodyRef}
          className={`cc-cliente-table__body ${!hasVerticalScroll ? "cc-cliente-table__body--stable" : ""}`}
        >
          {loading ? (
            <div className="cc-cliente-table__loading">
              Cargando cuenta corriente del proveedor…
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
                    <div className="cc-cliente-table__title">{r.comprobante || "-"}</div>
                    {r.detalle ? (
                      <div className="cc-cliente-table__detail">{r.detalle}</div>
                    ) : null}
                  </div>

                  <div
                    className={`cc-cliente-table__cell cc-cliente-table__cell--right ${
                      Number(r.debito || 0) > 0
                        ? "cc-cliente-table__amount--active"
                        : "cc-cliente-table__amount--muted"
                    }`}
                  >
                    {Number(r.debito || 0) > 0 ? moneyARS(r.debito || 0) : ""}
                  </div>

                  <div
                    className={`cc-cliente-table__cell cc-cliente-table__cell--center ${
                      Number(r.credito || 0) > 0
                        ? "cc-cliente-table__amount--active"
                        : "cc-cliente-table__amount--muted"
                    }`}
                  >
                    {Number(r.credito || 0) > 0 ? moneyARS(r.credito || 0) : ""}
                  </div>

                  <div className="cc-cliente-table__cell cc-cliente-table__cell--right cc-cliente-table__saldo">
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
                  ? `No se encontraron movimientos para "${queryUsed}".`
                  : "Sin movimientos para mostrar."}
              </div>
            </div>
          )}
        </div>

        <div className="cc-cliente-table__footWrap">
          <div className="cc-cliente-table__totals">
            <div className="cc-cliente-table__cell">Totales</div>
            <div className="cc-cliente-table__cell"></div>
            <div className="cc-cliente-table__cell cc-cliente-table__cell--right">
              {moneyARS(totales?.debito || 0)}
            </div>
            <div className="cc-cliente-table__cell cc-cliente-table__cell--right">
              {moneyARS(totales?.credito || 0)}
            </div>
            <div className="cc-cliente-table__cell cc-cliente-table__cell--right">
              {moneyARS(totales?.saldo || 0)}
            </div>
            <div className="cc-cliente-table__cell"></div>
          </div>
        </div>
      </div>

      <div className="cc-footnote">
        * Débito = movimiento cargado al proveedor • Crédito = cobro registrado • Saldo = acumulado.
      </div>
    </div>
  );
}