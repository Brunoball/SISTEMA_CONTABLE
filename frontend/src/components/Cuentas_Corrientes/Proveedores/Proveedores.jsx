import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  faTrashCan,
  faArrowLeft,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";

import Toast from "../../Global/Toast.jsx";
import Calendario from "../../Global/Calendario/Calendario.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import ModalEliminarMovimientos from "../../Global/Modales/ModalEliminar.jsx";
import { useDateRange } from "../../../context/DateRangeContext.jsx";
import BotonExportar from "../../Global/Boton_Exportar/BotonExportar.jsx";
import ModalProveedores from "./modales/ModalProveedores.jsx";

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

function saldoProveedorToneClass(value) {
  const n = Number(value || 0);
  if (n > 0) return "cc-money cc-money--negative";
  if (n < 0) return "cc-money cc-money--positive";
  return "cc-money cc-money--neutral";
}

function saldoTotalProveedorToneClass(totales) {
  const debito = Number(totales?.debito || 0);
  const credito = Number(totales?.credito || 0);

  if (debito > credito) return "cc-money cc-money--negative";
  if (credito > debito) return "cc-money cc-money--positive";
  return saldoProveedorToneClass(totales?.saldo);
}

function saldoMovimientoToneClass(row) {
  const debito = Number(row?.debito || 0);
  const credito = Number(row?.credito || 0);

  if (debito > 0 && credito <= 0) return "cc-money cc-money--negative";
  if (credito > 0 && debito <= 0) return "cc-money cc-money--positive";

  return saldoProveedorToneClass(row?.saldo);
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
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
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

function getAuthInfo() {
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    ""
  ).trim();

  const token = (localStorage.getItem("token") || "").trim();

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      u?.user_id ??
      0;

    if (Number.isFinite(Number(cand))) {
      idUsuario = Number(cand);
    }
  } catch {}

  return { sessionKey, token, idUsuario };
}

function withSessionKey(url) {
  const base = safeText(url);
  if (!base) return "";
  try {
    const { sessionKey, token } = getAuthInfo();
    const u = new URL(base, window.location.origin);

    if (sessionKey && !u.searchParams.has("session_key")) {
      u.searchParams.set("session_key", sessionKey);
    }

    if (token && !u.searchParams.has("token")) {
      u.searchParams.set("token", token);
    }

    return u.toString();
  } catch {
    return base;
  }
}

function ensureResourceHint(url, rel = "prefetch", as = "") {
  const href = safeText(url);
  if (!href) return;

  const finalAs = rel === "preload" ? safeText(as) : "";
  const key = `hint:${rel}:${finalAs}:${href}`;
  const selectorKey =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(key)
      : key.replace(/"/g, '\\"');

  if (document.head.querySelector(`link[data-key="${selectorKey}"]`)) return;

  const link = document.createElement("link");
  link.rel = rel;

  if (rel === "preload" && finalAs) {
    link.as = finalAs;
  }

  link.href = href;
  link.setAttribute("data-key", key);
  document.head.appendChild(link);
}

function prewarmComprobanteUrl(url, mime = "") {
  const finalUrl = withSessionKey(url);
  if (!finalUrl) return;

  const mm = safeText(mime).toLowerCase();
  const ll = finalUrl.toLowerCase();

  const isPdf =
    mm.includes("pdf") ||
    ll.includes(".pdf") ||
    ll.includes("cc_comprobante_descargar");

  if (isPdf) {
    ensureResourceHint(finalUrl, "prefetch");
  } else {
    ensureResourceHint(finalUrl, "preload", "image");
    ensureResourceHint(finalUrl, "prefetch");
  }
}

function canPreviewComprobante(row) {
  return (
    safeText(row?.comprobante_url) !== "" ||
    Number(row?.id_comprobante || 0) > 0
  );
}

function canDeleteCobro(row) {
  return Number(row?.id_cobro || 0) > 0;
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
  const { sessionKey, token } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildHeadersJSON() {
  const { sessionKey, token } = getAuthInfo();
  const h = { "Content-Type": "application/json" };
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
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

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeadersJSON(),
    body: JSON.stringify(body ?? {}),
  });
  return await parseJsonOrThrow(res);
}

/* =========================
   Comprobante
========================= */
function makeComprobanteAccessUrl(row, API) {
  const idComprobante = Number(row?.id_comprobante || 0);
  if (idComprobante > 0) {
    return `${API}?action=cc_comprobante_descargar&id_comprobante=${idComprobante}`;
  }
  return resolveFileUrl(row?.comprobante_url);
}

export default function ProveedoresCC() {
  const API = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;
  const { dateRange, setDateRange } = useDateRange();

  const [calOpen, setCalOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [summaryRows, setSummaryRows] = useState([]);
  const [selectedProveedor, setSelectedProveedor] = useState(null);

  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ debito: 0, credito: 0, saldo: 0 });

  const [hasSearched, setHasSearched] = useState(false);
  const [queryUsed, setQueryUsed] = useState("");

  const comprobanteUrlCacheRef = useRef(new Map());

  const [previewComprobante, setPreviewComprobante] = useState({
    open: false,
    url: "",
    mime: "",
    title: "Comprobante",
  });

  const [deleteState, setDeleteState] = useState({
    open: false,
    loading: false,
    row: null,
  });

  const [toast, setToast] = useState(null);
  const [modalProveedoresOpen, setModalProveedoresOpen] = useState(false);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => setToast({ tipo, mensaje, duracion }),
    []
  );

  const closeToast = useCallback(() => setToast(null), []);

  const rangeLabel = useMemo(() => {
    const from = dateRange?.from || null;
    const to = dateRange?.to || null;
    if (!from) return "Seleccionar período";
    if (!to || formatDateISO(from) === formatDateISO(to)) return formatDateLabel(from);
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

  const filteredSummaryRows = useMemo(() => {
    const needle = normLower(q);
    const base = Array.isArray(summaryRows) ? summaryRows : [];
    if (!needle) return base;
    return base.filter((r) => normLower(r.nombre).includes(needle));
  }, [summaryRows, q]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet(`${API}?action=cc_saldos_proveedores`);
      if (!data || data.exito !== true) {
        throw new Error(data?.mensaje || "No se pudo cargar el listado de proveedores.");
      }
      const rowsApi = Array.isArray(data.rows) ? data.rows : [];
      const rowsOrdenadas = [...rowsApi].sort((a, b) =>
        safeText(a?.nombre).localeCompare(safeText(b?.nombre), "es", {
          sensitivity: "base",
          numeric: true,
        })
      );
      setSummaryRows(rowsOrdenadas);
    } catch (e) {
      setSummaryRows([]);
      showToast("error", e?.message || "Error cargando proveedores.", 3500);
    } finally {
      setLoading(false);
    }
  }, [API, showToast]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const loadHistorial = useCallback(
    async (proveedor, options = {}) => {
      if (!proveedor?.id_proveedor) return;

      const keepSelection = options.keepSelection === true;

      setLoading(true);
      setHasSearched(true);

      if (!keepSelection) {
        setSelectedProveedor(proveedor);
        setQueryUsed(proveedor.nombre || "");
      }

      try {
        const sp = new URLSearchParams();
        sp.set("action", "cc_historial_proveedor");
        sp.set("id_proveedor", String(proveedor.id_proveedor));

        if (dateRange?.from) {
          sp.set("fecha_desde", formatDateISO(dateRange.from));
          sp.set("fecha_hasta", formatDateISO(dateRange.to || dateRange.from));
        }

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
    if (selectedProveedor?.id_proveedor) {
      loadHistorial(selectedProveedor, { keepSelection: true });
    }
  }, [dateRange?.from, dateRange?.to, selectedProveedor, loadHistorial]);

  const volverAlListado = useCallback(() => {
    setSelectedProveedor(null);
    setRows([]);
    setTotales({ debito: 0, credito: 0, saldo: 0 });
    setHasSearched(false);
    setQueryUsed("");

    // Al volver desde el detalle, el saldo del listado debe recalcularse
    // porque una acción interna (por ejemplo eliminar un cobro) puede cambiarlo.
    loadSummary();
  }, [loadSummary]);

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

  const buildFastComprobanteUrl = useCallback(
    (row) => {
      const idComp = Number(row?.id_comprobante || 0);
      const rawBase = makeComprobanteAccessUrl(row, API);
      const cacheKey = idComp > 0 ? `id:${idComp}` : `raw:${rawBase}`;

      if (comprobanteUrlCacheRef.current.has(cacheKey)) {
        return comprobanteUrlCacheRef.current.get(cacheKey) || "";
      }

      const finalUrl = withSessionKey(rawBase);
      if (finalUrl) comprobanteUrlCacheRef.current.set(cacheKey, finalUrl);
      return finalUrl;
    },
    [API]
  );

  const handlePrewarmComprobante = useCallback(
    (row) => {
      const fastUrl = buildFastComprobanteUrl(row);
      if (!fastUrl) return;
      prewarmComprobanteUrl(fastUrl, safeText(row?.comprobante_mime));
    },
    [buildFastComprobanteUrl]
  );

  const openComprobante = useCallback(
    (row) => {
      const accessUrl = buildFastComprobanteUrl(row);
      const mime = safeText(row?.comprobante_mime);
      if (!accessUrl) {
        showToast("advertencia", "Este registro no tiene comprobante asociado.", 2600);
        return;
      }

      const isCobro = Number(row?.credito || 0) > 0;
      const isMovimiento = Number(row?.debito || 0) > 0;

      prewarmComprobanteUrl(accessUrl, mime);

      setPreviewComprobante({
        open: true,
        url: accessUrl,
        mime,
        title: isCobro
          ? row?.comprobante
            ? `Recibo · ${row.comprobante}`
            : "Recibo"
          : isMovimiento
          ? row?.comprobante
            ? `Factura / Deuda · ${row.comprobante}`
            : "Factura / Deuda"
          : "Comprobante",
      });
    },
    [buildFastComprobanteUrl, showToast]
  );

  const askDeleteCobro = useCallback((row) => {
    if (!canDeleteCobro(row)) return;
    setDeleteState({ open: true, loading: false, row });
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteState({ open: false, loading: false, row: null });
  }, []);

  const refreshCurrent = useCallback(async () => {
    if (selectedProveedor?.id_proveedor) {
      await loadHistorial(selectedProveedor, { keepSelection: true });
      await loadSummary();
      return;
    }

    await loadSummary();
  }, [selectedProveedor, loadHistorial, loadSummary]);

  const refreshAfterProveedoresUpdate = useCallback(async () => {
    await loadSummary();

    if (selectedProveedor?.id_proveedor) {
      try {
        await loadHistorial(selectedProveedor, { keepSelection: true });
      } catch {
        volverAlListado();
      }
    }
  }, [loadSummary, selectedProveedor, loadHistorial, volverAlListado]);

  const confirmDeleteCobro = useCallback(async () => {
    const row = deleteState.row;
    const idCobro = Number(row?.id_cobro || 0);
    if (idCobro <= 0) {
      throw new Error("No se encontró un id_cobro válido.");
    }

    const { idUsuario } = getAuthInfo();

    setDeleteState((prev) => ({ ...prev, loading: true }));
    try {
      const data = await apiPost(`${API}?action=cc_eliminar_cobro`, {
        id_cobro: idCobro,
        idUsuario,
      });

      if (!data || data.exito !== true) {
        throw new Error(data?.mensaje || "No se pudo eliminar el cobro.");
      }

      closeDeleteModal();
      await refreshCurrent();
    } catch (e) {
      setDeleteState((prev) => ({ ...prev, loading: false }));
      throw e;
    }
  }, [deleteState.row, API, closeDeleteModal, refreshCurrent]);

  const isDetailMode = !!selectedProveedor;

  return (
    <div className="contenedor-cards mov-page">
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
          setPreviewComprobante({ open: false, url: "", mime: "", title: "Comprobante" })
        }
      />

      <ModalEliminarMovimientos
        open={deleteState.open}
        row={{
          ...deleteState.row,
          id_movimiento: deleteState.row?.id_cobro ?? null,
          tipo_movimiento: "Cobro CC Proveedor",
          detalle: deleteState.row
            ? `Comprobante: ${safeText(deleteState.row.comprobante) || "-"} · Fecha: ${
                formatDisplayDate(deleteState.row.fecha || deleteState.row.fecha_raw) || "-"
              }`
            : "",
          monto_total: Number(deleteState.row?.credito || 0),
        }}
        loading={deleteState.loading}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteCobro}
        onToast={showToast}
        title="Eliminar registro de cobro"
        message="¿Seguro que querés eliminar solo este cobro de la cuenta corriente?"
        warning="No se eliminará la deuda ni el movimiento original. Solo el cobro seleccionado."
        loadingMessage="Eliminando cobro…"
        successMessage="Cobro eliminado correctamente."
        errorMessage="No se pudo eliminar el cobro."
        confirmLabel="Eliminar cobro"
        cancelLabel="Cancelar"
      />

      <ModalProveedores
        open={modalProveedoresOpen}
        onClose={() => setModalProveedoresOpen(false)}
        onActualizado={refreshAfterProveedoresUpdate}
        onToast={showToast}
      />

      <div className="mov-card__head">
        <div className="mov-card__headLeft">
          <div className="title-mov">
            <div className="mov-card__title">
              {isDetailMode ? `${selectedProveedor.nombre}` : "Cuentas Corrientes"}
            </div>

            <div className="mov-card__hint">
              {isDetailMode ? (
                <>
                  Mostrando <b>{rows.length}</b> registro{rows.length === 1 ? "" : "s"}
                </>
              ) : (
                <>
                  Mostrando <b>{filteredSummaryRows.length}</b> proveedor
                  {filteredSummaryRows.length === 1 ? "" : "es"}
                </>
              )}
            </div>
          </div>

          <div className="mov-headFilters">
            {isDetailMode && (
              <div className="cc-filter cc-filter--cal">
                <div
                  className={`cc-floatingField cc-floatingField--calendar is-active ${
                    calOpen ? "is-open" : ""
                  }`}
                >
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
            )}

            <div className="cc-filter cc-filter--search" id="vents-comppr-wits">
              <div className="cc-floatingField cc-floatingField--search is-active">
                <div className="cc-searchInput">
                  <div className="cc-searchInput__fieldWrap">
                    <input
                      className="cc-input cc-input--floating"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Buscar por proveedor..."
                      disabled={loading}
                    />

                    <span className="cc-floatingLabel">
                      <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                    </span>

                    {safeText(q) !== "" && !loading && (
                      <button
                        type="button"
                        className="cc-clearSearch cc-clearSearch--inside"
                        onClick={() => setQ("")}
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="cc-row-actions">
              <button
                type="button"
                className="mov-btn mov-btn--ghost mov-btn--icon cc-row-actions__btn"
                onClick={() => setModalProveedoresOpen(true)}
                disabled={loading}
                title={!isDetailMode ? "Proveedores" : "Nuevo proveedor"}
              >
                <FontAwesomeIcon icon={faUserPlus} />
                {!isDetailMode && <span style={{ marginLeft: 8 }}>Proveedores</span>}
              </button>

              <div className="cc-row-actions__export">
                <BotonExportar
                  disabled={loading || !isDetailMode || rows.length === 0}
                  loading={false}
                  label="Exportar"
                  opciones={exportOptions}
                  align="right"
                />
              </div>

              {isDetailMode && (
                <button
                  type="button"
                  className="mov-btn mov-btn--ghost mov-btn--icon cc-row-actions__btn"
                  onClick={volverAlListado}
                  title="Volver"
                >
                  <FontAwesomeIcon icon={faArrowLeft} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isDetailMode ? (
        <div className="cc-cliente-table">
          <div
            className="mov-gridTable mov-gridTable--head cc-cliente-table__desktopHead"
            style={{ gridTemplateColumns: "2fr 1fr" }}
          >
            <div className="mov-gridCell mov-gridCell--head">Proveedor</div>
            <div className="mov-gridCell mov-gridCell--head is-right">Saldo actual</div>
          </div>

          <div className="cc-cliente-table__body">
            {loading ? (
              <div className="mov-emptyRow">Cargando proveedores…</div>
            ) : filteredSummaryRows.length > 0 ? (
              filteredSummaryRows.map((r) => (
                <button
                  key={r.id_proveedor}
                  type="button"
                  className="mov-gridTable mov-gridTable--row cc-cliente-table__movRow"
                  style={{ gridTemplateColumns: "2fr 1fr", width: "100%" }}
                  onClick={() => loadHistorial(r)}
                >
                  <div className="mov-gridCell is-strong">
                    <span className="mov-ellipsissss mov-ellipsialingf">{r.nombre || "-"}</span>
                  </div>
                  <div className="mov-gridCell is-right is-strong">
                    <span className={`mov-ellipsissss ${saldoProveedorToneClass(r.saldo)}`}>{moneyARS(r.saldo || 0)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="mov-emptyRow cc-emptyState">
                <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                <div className="cc-emptyText">No se encontraron proveedores.</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="cc-cliente-table">
          <div
            className="mov-gridTable mov-gridTable--head cc-cliente-table__desktopHead"
            style={{ gridTemplateColumns: ".8fr 2.2fr 1fr 1fr 1fr .9fr" }}
          >
            <div className="mov-gridCell mov-gridCell--head">Fecha</div>
            <div className="mov-gridCell mov-gridCell--head">Comprobante</div>
            <div className="mov-gridCell mov-gridCell--head is-right">Débito</div>
            <div className="mov-gridCell mov-gridCell--head is-right">Crédito</div>
            <div className="mov-gridCell mov-gridCell--head is-right">Saldo</div>
            <div className="mov-gridCell mov-gridCell--head is-center">Acciones</div>
          </div>

          <div className="cc-cliente-table__body">
            {loading ? (
              <div className="mov-emptyRow">Cargando cuenta corriente del proveedor…</div>
            ) : rows.length > 0 ? (
              rows.map((r, i) => {
                const verHabilitado = canPreviewComprobante(r);
                const puedeEliminar = canDeleteCobro(r);
                const isCobro = Number(r.credito || 0) > 0;

                return (
                  <div
                    key={r.id || `${i}`}
                    className="mov-gridTable mov-gridTable--row"
                    style={{ gridTemplateColumns: ".8fr 2.2fr 1fr 1fr 1fr .9fr" }}
                  >
                    <div className="mov-gridCell">
                      <span className="mov-ellipsissss">
                        {formatDisplayDate(r.fecha || r.fecha_raw)}
                      </span>
                    </div>

                    <div className="mov-gridCell is-strong">
                      <span className="mov-ellipsissss">{r.comprobante || "-"}</span>
                    </div>

                    <div className="mov-gridCell is-right">
                      <span className="mov-ellipsissss cc-money cc-money--negative">
                        {Number(r.debito || 0) > 0 ? moneyARS(r.debito) : "—"}
                      </span>
                    </div>

                    <div className="mov-gridCell is-right">
                      <span className="mov-ellipsissss cc-money cc-money--positive">
                        {Number(r.credito || 0) > 0 ? moneyARS(r.credito) : "—"}
                      </span>
                    </div>

                    <div className="mov-gridCell is-right is-strong">
                      <span className={`mov-ellipsissss ${saldoMovimientoToneClass(r)}`}>{moneyARS(r.saldo || 0)}</span>
                    </div>

                    <div className="mov-gridCell mov-gridCell--actions">
                      <div className="mov-actionsInline">
                        <button
                          type="button"
                          onMouseEnter={() => verHabilitado && handlePrewarmComprobante(r)}
                          onPointerEnter={() => verHabilitado && handlePrewarmComprobante(r)}
                          onFocus={() => verHabilitado && handlePrewarmComprobante(r)}
                          onClick={() => verHabilitado && openComprobante(r)}
                          disabled={!verHabilitado}
                          title={
                            verHabilitado
                              ? isCobro
                                ? "Ver recibo / comprobante del cobro"
                                : "Ver factura / comprobante de la deuda"
                              : "Este registro no tiene comprobante asociado"
                          }
                          className="mov-iconBtn"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        {puedeEliminar ? (
                          <button
                            type="button"
                            onClick={() => askDeleteCobro(r)}
                            title="Eliminar solo este registro de cobro"
                            className="mov-iconBtn mov-iconBtn--danger"
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="mov-emptyRow cc-emptyState">
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
            <div
              className="mov-gridTable mov-gridTable_rsp"
              style={{ gridTemplateColumns: ".8fr 2.2fr 1fr 1fr 1fr .9fr" }}
            >
              <div className="mov-gridCell is-strong">Totales</div>
              <div className="mov-gridCell mov-gridCellf vacio"></div>
              <div className="mov-gridCell mov-gridCellf is-right is-strong cc-money cc-money--negative">
                {moneyARS(totales?.debito || 0)}
              </div>
              <div className="mov-gridCell mov-gridCellf is-right is-strong cc-money cc-money--positive">
                {moneyARS(totales?.credito || 0)}
              </div>
              <div className={`mov-gridCell mov-gridCellf is-right is-strong ${saldoTotalProveedorToneClass(totales)}`}>
                {moneyARS(totales?.saldo || 0)}
              </div>
              <div className="mov-gridCell vacio mov-gridCellf"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}