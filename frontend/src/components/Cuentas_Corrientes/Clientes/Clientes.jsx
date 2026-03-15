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
} from "@fortawesome/free-solid-svg-icons";

import Toast from "../../Global/Toast.jsx";
import Calendario from "../../Global/Calendario/Calendario.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import ModalEliminarMovimientos from "../../Global/Modales/ModalEliminar.jsx";
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

function withSessionKey(url) {
  const base = safeText(url);
  if (!base) return "";

  try {
    const sessionKey = (localStorage.getItem("session_key") || "").trim();
    const token = (localStorage.getItem("token") || "").trim();
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

function ensureResourceHint(url, rel = "prefetch", as = "document") {
  const href = safeText(url);
  if (!href) return;

  const key = `hint:${rel}:${as}:${href}`;
  const selectorKey =
    typeof CSS !== "undefined" && CSS.escape
      ? CSS.escape(key)
      : key.replace(/"/g, '\\"');

  if (document.head.querySelector(`link[data-key="${selectorKey}"]`)) return;

  const link = document.createElement("link");
  link.rel = rel;
  if (as) link.as = as;
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
    ensureResourceHint(finalUrl, "preload", "document");
    ensureResourceHint(finalUrl, "prefetch", "document");
  } else {
    ensureResourceHint(finalUrl, "preload", "image");
    ensureResourceHint(finalUrl, "prefetch", "image");
  }
}

function canPreviewComprobante(row) {
  return safeText(row?.comprobante_url) !== "" || Number(row?.id_comprobante || 0) > 0;
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
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildHeadersJSON() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
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

  const tableBodyRef = useRef(null);
  const [hasVerticalScroll, setHasVerticalScroll] = useState(false);
  const comprobanteUrlCacheRef = useRef(new Map());

  const [rows, setRows] = useState([]);
  const [totales, setTotales] = useState({ debito: 0, credito: 0, saldo: 0 });

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
    const safeName = String(queryUsed || "cliente").replace(/[^\w.-]+/g, "_");
    const from = formatDateISO(dateRange?.from);
    const to = formatDateISO(dateRange?.to || dateRange?.from);
    return `cc_cliente_${safeName}_${from}_${to}`;
  }, [queryUsed, dateRange]);

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

  const refreshCurrent = useCallback(async () => {
    if (selected?.id) {
      await loadHistorial(selected.id, selected.label);
      return;
    }

    const txt = safeText(q) || safeText(queryUsed);
    if (txt.length >= 2) {
      await loadHistorial(null, txt);
    }
  }, [selected, q, queryUsed, loadHistorial]);

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

        if (text.length >= 2) {
          loadHistorial(null, text);
        } else {
          showToast(
            "advertencia",
            "Escribí al menos 2 caracteres o seleccioná un cliente.",
            2600
          );
        }
      }

      if (e.key === "Escape") {
        setOpenSug(false);
      }
    },
    [openSug, suggestions, handleSelect, q, selected, loadHistorial, showToast]
  );

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
    XLSX.utils.book_append_sheet(wb, ws, "Cuenta Corriente Cliente");
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
      if (finalUrl) {
        comprobanteUrlCacheRef.current.set(cacheKey, finalUrl);
      }
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

    setDeleteState({
      open: true,
      loading: false,
      row,
    });
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteState({
      open: false,
      loading: false,
      row: null,
    });
  }, []);

  const confirmDeleteCobro = useCallback(async () => {
    const row = deleteState.row;
    const idCobro = Number(row?.id_cobro || 0);

    if (idCobro <= 0) {
      throw new Error("No se encontró un id_cobro válido.");
    }

    setDeleteState((prev) => ({ ...prev, loading: true }));

    try {
      const data = await apiPost(`${API}?action=cc_eliminar_cobro`, {
        id_cobro: idCobro,
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

      <ModalEliminarMovimientos
        open={deleteState.open}
        row={{
          ...deleteState.row,
          id_movimiento: deleteState.row?.id_cobro ?? null,
          tipo_movimiento: "Cobro CC Cliente",
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

      <div className="mov-card__head">
        <div className="mov-card__headLeft">
          <div className="title-mov">
            <div className="mov-card__title">Cuentas Corrientes</div>
            <div className="mov-card__hint">
              Mostrando <b>{rows.length}</b> registro{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mov-headFilters">
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

            <div className="cc-filter cc-filter--search">
              <div className="cc-floatingField cc-floatingField--search is-active">
                <div className="cc-searchInput">
                  <div className="cc-searchInput__fieldWrap">
                    <input
                      className="cc-input cc-input--floating"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setOpenSug(true)}
                      onBlur={() => setTimeout(() => setOpenSug(false), 120)}
                      placeholder="Buscar por cliente... "
                      disabled={loading || loadingLists}
                      autoComplete="off"
                    />

                    <span className="cc-floatingLabel">
                      <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
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

        <BotonExportar
          disabled={loading || !hasSearched || rows.length === 0}
          loading={false}
          label="Exportar"
          title={
            !hasSearched
              ? "Seleccioná un cliente primero"
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
          className="mov-gridTable mov-gridTable--head cc-cliente-table__desktopHead"
          style={{ gridTemplateColumns: ".8fr 2.2fr 1fr 1fr 1fr 1fr" }}
        >
          <div className="mov-gridCell mov-gridCell--head">Fecha</div>
          <div className="mov-gridCell mov-gridCell--head">Comprobante</div>
          <div className="mov-gridCell mov-gridCell--head is-right">Débito</div>
          <div className="mov-gridCell mov-gridCell--head is-right">Crédito</div>
          <div className="mov-gridCell mov-gridCell--head is-right">Saldo</div>
          <div className="mov-gridCell mov-gridCell--head is-center">Acciones</div>
        </div>

        <div
          ref={tableBodyRef}
          className={`cc-cliente-table__body ${
            !hasVerticalScroll ? "cc-cliente-table__body--stable" : ""
          }`}
        >
          {loading ? (
            <div className="cc-cliente-table__loading">
              Cargando cuenta corriente del cliente…
            </div>
          ) : rows.length > 0 ? (
            rows.map((r, i) => {
              const verHabilitado = canPreviewComprobante(r);
              const puedeEliminar = canDeleteCobro(r);
              const isCobro = Number(r.credito || 0) > 0;

              return (
                <React.Fragment key={r.id || `${i}`}>
                  {/* DESKTOP */}
                  <div
                    className={`cc-cliente-table__row cc-cliente-table__row--desktop ${
                      i % 2 !== 0 ? "is-alt" : ""
                    }`}
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
                      {Number(r.debito || 0) > 0 ? moneyARS(r.debito) : ""}
                    </div>

                    <div
                      className={`cc-cliente-table__cell cc-cliente-table__cell--right ${
                        Number(r.credito || 0) > 0
                          ? "cc-cliente-table__amount--active"
                          : "cc-cliente-table__amount--muted"
                      }`}
                    >
                      {Number(r.credito || 0) > 0 ? moneyARS(r.credito) : ""}
                    </div>

                    <div className="cc-cliente-table__cell cc-cliente-table__cell--right cc-cliente-table__saldo">
                      {moneyARS(r.saldo || 0)}
                    </div>

                    <div className="cc-cliente-table__cell cc-cliente-table__cell--center">
                      <div className="cc-actionsInline">
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
                          className={`cc-verBtn ${verHabilitado ? "" : "is-disabled"}`}
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        {puedeEliminar ? (
                          <button
                            type="button"
                            onClick={() => askDeleteCobro(r)}
                            title="Eliminar solo este registro de cobro"
                            className="cc-verBtn cc-verBtn--danger"
                          >
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* MOBILE / TABLET */}
                  <article className="cc-mobileCard">
                    <div className="cc-mobileCard__top">
                      <div className="cc-mobileCard__main">
                        <div className="cc-mobileCard__title">{r.comprobante || "-"}</div>
                        {r.detalle ? (
                          <div className="cc-mobileCard__detail">{r.detalle}</div>
                        ) : null}
                      </div>

                      <div className="cc-mobileCard__date">
                        {formatDisplayDate(r.fecha || r.fecha_raw)}
                      </div>
                    </div>

                    <div className="cc-mobileCard__amounts">
                      <div className="cc-mobileCard__amountBox">
                        <span className="cc-mobileCard__label">Débito</span>
                        <span
                          className={`cc-mobileCard__value ${
                            Number(r.debito || 0) > 0
                              ? "cc-mobileCard__value--active"
                              : "cc-mobileCard__value--muted"
                          }`}
                        >
                          {Number(r.debito || 0) > 0 ? moneyARS(r.debito) : "—"}
                        </span>
                      </div>

                      <div className="cc-mobileCard__amountBox">
                        <span className="cc-mobileCard__label">Crédito</span>
                        <span
                          className={`cc-mobileCard__value ${
                            Number(r.credito || 0) > 0
                              ? "cc-mobileCard__value--active"
                              : "cc-mobileCard__value--muted"
                          }`}
                        >
                          {Number(r.credito || 0) > 0 ? moneyARS(r.credito) : "—"}
                        </span>
                      </div>
                    </div>

                    <div className="cc-mobileCard__saldoRow">
                      <span className="cc-mobileCard__label">Saldo</span>
                      <span className="cc-mobileCard__saldo">{moneyARS(r.saldo || 0)}</span>
                    </div>

                    <div className="cc-mobileCard__actions">
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
                        className={`cc-mobileCard__actionBtn ${
                          verHabilitado ? "" : "is-disabled"
                        }`}
                      >
                        <FontAwesomeIcon icon={faEye} />
                        <span>{isCobro ? "Ver recibo" : "Ver comprobante"}</span>
                      </button>

                      {puedeEliminar ? (
                        <button
                          type="button"
                          onClick={() => askDeleteCobro(r)}
                          title="Eliminar solo este registro de cobro"
                          className="cc-mobileCard__actionBtn cc-mobileCard__actionBtn--danger"
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                          <span>Eliminar cobro</span>
                        </button>
                      ) : null}
                    </div>
                  </article>
                </React.Fragment>
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
        * Débito = movimiento facturado • Crédito = cobro registrado • Saldo = acumulado.
      </div>
    </div>
  );
}