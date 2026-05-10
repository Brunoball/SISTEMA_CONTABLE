import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../../config/config.jsx";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/roots.css";
import "../../Global/Global_css/Global_oscuro.css";
import Toast from "../../Global/Toast.jsx";
import Calendario from "../../Global/Calendario/Calendario.jsx";
import "../../Global/Calendario/calendario.css";
import ModalNuevoPresupuesto from "./modales/ModalNuevoPresupuesto.jsx";
import ModalEliminar from "../../Global/Modales/ModalEliminar.jsx";
import BotonExportar from "../../Global/Boton_Exportar/BotonExportar.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faCalendarDays,
  faChevronDown,
  faEye,
  faFileExcel,
  faMagnifyingGlass,
  faPlus,
  faTimes,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";
import * as XLSX from "xlsx";
import { useListas } from "../../../context/ListasContext.jsx";
import { useDateRange } from "../../../context/DateRangeContext";

const PAGE_SIZE = 100;
const PROBE_LIMIT = PAGE_SIZE + 1;
const SKELETON_ROWS = 10;
const LIVE_POLL_MS = 6000;

function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

function normalizeSearchText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) return `${String(Number(m1[3])).padStart(2, "0")}/${String(Number(m1[2])).padStart(2, "0")}/${m1[1]}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${String(Number(m2[1])).padStart(2, "0")}/${String(Number(m2[2])).padStart(2, "0")}/${m2[3]}`;
  return s;
}

function startOfDay(d) {
  if (!d) return null;
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dateToAPI(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateUI(d) {
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function getMovimientoId(r) {
  const cand = r?.id_movimiento ?? r?.idMovimiento ?? r?.id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getComprobanteId(row) {
  const n = Number(row?.presupuesto_id_comprobante ?? row?.id_comprobante ?? row?.comprobante_id ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getComprobanteMime(row) {
  return String(row?.presupuesto_comprobante_mime ?? row?.archivo_mime ?? row?.comprobante_mime ?? "").trim();
}

function buildExportRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    FECHA: safeText(formatFechaDMY(r?.fecha)),
    DESCRIPCION: safeText(r?.detalle ?? r?.descripcion ?? r?.concepto),
    CLIENTE: safeText(r?.cliente ?? r?.cliente_nombre),
    TOTAL: Number(r?.monto_total ?? r?.total ?? 0) || 0,
  }));
}

function slugifySheetName(name) {
  const s = String(name || "Presupuestos").replace(/[\[\]\*\/\\\?\:]/g, " ").replace(/\s+/g, " ").trim();
  return (s || "Presupuestos").slice(0, 31);
}

function escapeCSV(value) {
  const s = String(value ?? "");
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
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

function getAuthInfo() {
  const token = (localStorage.getItem("token") || "").trim();
  const sessionKey = (localStorage.getItem("session_key") || localStorage.getItem("sessionKey") || localStorage.getItem("X-Session") || "").trim();
  return { token, sessionKey };
}

export default function Presupuesto() {
  const API = `${BASE_URL}/api.php`;
  const { lists: listasCtx, loadingLists, error: errorLists, ensureListsLoaded } = useListas();
  const { dateRange, setDateRange } = useDateRange();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [showCalendario, setShowCalendario] = useState(false);
  const [openVerComprobante, setOpenVerComprobante] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState("");
  const [comprobanteMime, setComprobanteMime] = useState("application/pdf");
  const offsetRef = useRef(0);
  const searchTimerRef = useRef(null);
  const hasLoadedRowsRef = useRef(false);
  const lastQueryRef = useRef("");
  const liveTimerRef = useRef(null);
  const liveTokenRef = useRef("");
  const signedUrlCacheRef = useRef(new Map());

  const showToast = useCallback((tipo, mensaje, duracion = 3200) => setToast({ tipo, mensaje, duracion }), []);
  const closeToast = useCallback(() => setToast(null), []);

  const buildHeadersGET = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = {};
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const buildHeadersPOST = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.length > 600 ? `${text.slice(0, 600)}...` : text;
      throw new Error(`Respuesta inválida. HTTP ${res.status}\n${preview}`);
    }
    if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
    return data;
  }, []);

  const apiGet = useCallback(async (url) => {
    const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
    return await parseJsonOrThrow(res);
  }, [buildHeadersGET, parseJsonOrThrow]);

  const apiPostJson = useCallback(async (url, payload) => {
    const res = await fetch(url, { method: "POST", headers: buildHeadersPOST(), body: JSON.stringify(payload ?? {}) });
    return await parseJsonOrThrow(res);
  }, [buildHeadersPOST, parseJsonOrThrow]);

  const getComprobanteSignedUrl = useCallback(async (idComprobante) => {
    const id = Number(idComprobante || 0);
    if (!id) return "";
    const key = String(id);
    if (signedUrlCacheRef.current.has(key)) return signedUrlCacheRef.current.get(key) || "";
    const data = await apiGet(`${API}?action=ventas_comprobantes_descargar&id_comprobante=${encodeURIComponent(id)}`);
    const url = String(data?.url || data?.download_url || data?.archivo_url || "").trim();
    if (url) signedUrlCacheRef.current.set(key, url);
    return url;
  }, [API, apiGet]);

  const normalizePresupuestoRow = useCallback((r) => ({
    ...r,
    id_movimiento: getMovimientoId(r),
    cliente: String(r?.cliente ?? r?.cliente_nombre ?? "").trim(),
    detalle: String(r?.detalle ?? r?.descripcion ?? r?.concepto ?? "").trim(),
    monto_total: Number(r?.monto_total ?? r?.total ?? 0) || 0,
    presupuesto_id_comprobante: getComprobanteId(r),
    presupuesto_comprobante_url: String(r?.presupuesto_comprobante_url ?? r?.comprobante_url ?? "").trim(),
    presupuesto_comprobante_mime: getComprobanteMime(r),
  }), []);

  const fetchLiveToken = useCallback(async (from, to, query) => {
    const p = new URLSearchParams({ action: "presupuestos_live_token" });
    if (from) p.set("fecha_desde", dateToAPI(from));
    if (to) p.set("fecha_hasta", dateToAPI(to));
    if (query) p.set("q", query);
    const data = await apiGet(`${API}?${p.toString()}`);
    return String(data?.token || "");
  }, [API, apiGet]);

  const loadRows = useCallback(async ({ from = dateRange.from, to = dateRange.to, query = q, offset = 0, append = false } = {}) => {
    append ? setLoadingMore(true) : setLoadingRows(true);
    setError("");
    try {
      const p = new URLSearchParams({
        action: "presupuestos_listar",
        limit: String(PROBE_LIMIT),
        offset: String(offset),
      });
      if (from) p.set("fecha_desde", dateToAPI(from));
      if (to) p.set("fecha_hasta", dateToAPI(to));
      if (query) p.set("q", query);
      const data = await apiGet(`${API}?${p.toString()}`);
      const arr = Array.isArray(data?.presupuestos) ? data.presupuestos : Array.isArray(data?.movimientos) ? data.movimientos : [];
      const normalized = arr.slice(0, PAGE_SIZE).map(normalizePresupuestoRow);
      setHasMore(arr.length > PAGE_SIZE || !!data?.has_more);
      offsetRef.current = offset + normalized.length;
      setRows((prev) => (append ? [...prev, ...normalized] : normalized));
    } catch (e) {
      setError(e?.message || "No se pudieron cargar los presupuestos.");
    } finally {
      setLoadingRows(false);
      setLoadingMore(false);
    }
  }, [API, apiGet, dateRange.from, dateRange.to, normalizePresupuestoRow, q]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await ensureListsLoaded?.({ force: false, background: true });
      } catch {}
      if (!alive) return;
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const queryChanged = hasLoadedRowsRef.current && q !== lastQueryRef.current;
    const delay = queryChanged ? 300 : 0;

    searchTimerRef.current = setTimeout(async () => {
      await loadRows({ from: dateRange.from, to: dateRange.to, query: q, offset: 0, append: false });
      hasLoadedRowsRef.current = true;
      lastQueryRef.current = q;
      try { liveTokenRef.current = await fetchLiveToken(dateRange.from, dateRange.to, q); } catch {}
    }, delay);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, dateRange.from, dateRange.to, fetchLiveToken, loadRows]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || loadingRows || loadingMore) return;
      try {
        const token = await fetchLiveToken(dateRange.from, dateRange.to, q);
        if (!cancelled && token && liveTokenRef.current && token !== liveTokenRef.current) {
          liveTokenRef.current = token;
          await loadRows({ from: dateRange.from, to: dateRange.to, query: q, offset: 0, append: false });
        } else if (!cancelled && token && !liveTokenRef.current) {
          liveTokenRef.current = token;
        }
      } catch {}
    };
    liveTimerRef.current = setInterval(tick, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, [dateRange.from, dateRange.to, fetchLiveToken, loadRows, loadingMore, loadingRows, q]);

  const handleDateRangeChange = useCallback((newRange) => {
    setDateRange(newRange);
  }, [setDateRange]);

  const reloadVista = useCallback(async () => {
    signedUrlCacheRef.current.clear();
    await loadRows({ from: dateRange.from, to: dateRange.to, query: q, offset: 0, append: false });
    try { liveTokenRef.current = await fetchLiveToken(dateRange.from, dateRange.to, q); } catch {}
  }, [dateRange.from, dateRange.to, fetchLiveToken, loadRows, q]);

  const handleLoadMore = useCallback(async () => {
    await loadRows({ from: dateRange.from, to: dateRange.to, query: q, offset: offsetRef.current, append: true });
  }, [dateRange.from, dateRange.to, loadRows, q]);

  const handleOpenNuevoPresupuesto = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setOpenAdd(true);
  }, []);

  const handleVerComprobante = useCallback(async (row) => {
    const id = getComprobanteId(row);
    if (!id) {
      showToast("error", "Este presupuesto todavía no tiene PDF vinculado.", 3500);
      return;
    }
    try {
      const url = await getComprobanteSignedUrl(id);
      if (!url) throw new Error("No se pudo obtener la URL del presupuesto.");
      setComprobanteUrl(url);
      setComprobanteMime(getComprobanteMime(row) || "application/pdf");
      setOpenVerComprobante(true);
    } catch (e) {
      showToast("error", e?.message || "No se pudo abrir el presupuesto.", 4500);
    }
  }, [getComprobanteSignedUrl, showToast]);

  const confirmDelete = useCallback(async () => {
    const id = getMovimientoId(selectedRow);
    if (!id) return;
    setDeletingId(id);
    try {
      await apiPostJson(`${API}?action=presupuestos_eliminar`, { id_movimiento: id });
      showToast("exito", "Presupuesto eliminado correctamente.", 3000);
      setOpenDel(false);
      setSelectedRow(null);
      await reloadVista();
    } catch (e) {
      showToast("error", e?.message || "No se pudo eliminar el presupuesto.", 4500);
    } finally {
      setDeletingId(null);
    }
  }, [API, apiPostJson, reloadVista, selectedRow, showToast]);

  const filteredRows = useMemo(() => {
    const qq = normalizeSearchText(q);
    if (!qq) return rows;
    return rows.filter((r) => normalizeSearchText(Object.values(r).join(" | ")).includes(qq));
  }, [q, rows]);

  const dateRangeLabel = useMemo(() => {
    if (dateRange.from && dateRange.to) return `${formatDateUI(dateRange.from)} - ${formatDateUI(dateRange.to)}`;
    if (dateRange.from) return `Desde ${formatDateUI(dateRange.from)}`;
    if (dateRange.to) return `Hasta ${formatDateUI(dateRange.to)}`;
    return "Todo el período";
  }, [dateRange]);

  const columns = useMemo(() => [
    { key: "fecha",align: "center", label: "Fecha", render: (r) => formatFechaDMY(r.fecha) },
    { key: "detalle", label: "Descripción", render: (r) => safeText(r.detalle || r.descripcion || r.concepto) },
    { key: "cliente",align: "center", label: "Cliente", render: (r) => safeText(r.cliente) },
    { key: "total", label: "Total", align: "right", strong: true, render: (r) => moneyARS(r.monto_total) },
    { key: "acciones", label: "Acciones", align: "center" },
  ], []);
  const gridCols = "0.9fr 2.2fr 1.6fr 1.1fr 1.1fr";

  const exportOptions = useMemo(() => [
    {
      key: "excel",
      label: "Excel",
      icon: faFileExcel,
      onClick: () => {
        const exportRows = buildExportRows(filteredRows);
        const ws = XLSX.utils.json_to_sheet(exportRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, slugifySheetName("Presupuestos"));
        XLSX.writeFile(wb, `presupuestos_${new Date().toISOString().slice(0, 10)}.xlsx`);
      },
    },
    {
      key: "csv",
      label: "CSV",
      onClick: () => {
        const exportRows = buildExportRows(filteredRows);
        const headers = Object.keys(exportRows[0] || { FECHA: "", DESCRIPCION: "", CLIENTE: "", TOTAL: "" });
        const csv = [headers.join(";"), ...exportRows.map((row) => headers.map((h) => escapeCSV(row[h])).join(";"))].join("\n");
        downloadBlob(csv, `presupuestos_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
      },
    },
  ], [filteredRows]);

  const isAnyLoading = loadingRows || loadingMore;
  const lists = listasCtx || { clientes: [], detalles: [] };

  const renderSkeletonRow = (idx) => (
    <div key={`skel-${idx}`} className="mov-gridTable mov-gridTable--row mov-row--skeleton" style={{ gridTemplateColumns: gridCols }} role="row" aria-hidden="true">
      {columns.map((c) => (
        <div key={c.key} className={["mov-gridCell", c.align === "right" ? "is-right" : "", c.align === "center" ? "is-center" : ""].join(" ")} role="cell" data-label={c.label}>
          {c.key === "acciones" ? <div className="mov-skelActions"><span className="mov-skelIcon" /><span className="mov-skelIcon" /></div> : <span className="mov-skeletonBar" style={{ width: ["44%", "62%", "48%", "72%"][idx % 4] }} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="mov-page">
      {toast && <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />}
      {errorLists && <div className="mov-alert" role="alert">{errorLists}</div>}
      {error && <div className="mov-alert" role="alert">{error}</div>}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Movs · Presupuestos</div>
              <div className="mov-card__hint">Mostrando <b>{filteredRows.length}</b> presupuestos{hasMore && filteredRows.length > 0 ? " (hay más)" : ""}</div>
            </div>

            <div className="mov-headFilters">
              <div className="cc-filter cc-filter--cal">
                <div className={`cc-floatingField cc-floatingField--calendar is-active ${showCalendario ? "is-open" : ""}`}>
                  <button type="button" className={`cc-calTrigger ${showCalendario ? "is-open" : ""}`} onClick={() => setShowCalendario((v) => !v)} disabled={isAnyLoading || loadingLists} title="Seleccionar rango de fechas">
                    {dateRangeLabel}
                    <span className="cc-calTrigger__iconRight"><FontAwesomeIcon icon={faChevronDown} /></span>
                  </button>
                  <span className="cc-floatingLabel cc-floatingLabel--active"><FontAwesomeIcon icon={faCalendarDays} /> Período</span>
                  {showCalendario && <div className="cc-calDropdown"><Calendario value={dateRange} onChange={async (newRange) => { if (newRange.from && newRange.to) setShowCalendario(false); await handleDateRangeChange(newRange); }} onClose={() => setShowCalendario(false)} /></div>}
                </div>
              </div>

              <div className="cc-filter">
                <div className="cc-floatingField cc-floatingField--search is-active">
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input className="cc-input cc-input--floating" id="vents-comppr-wit" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descripción, cliente..." disabled={loadingLists} />
                      <span className="cc-floatingLabel"><FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda</span>
                      {q.trim() !== "" && <button type="button" className="cc-clearSearch cc-clearSearch--inside" title="Limpiar búsqueda" onClick={() => setQ("")}><FontAwesomeIcon icon={faTimes} /></button>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <BotonExportar disabled={loadingRows || filteredRows.length === 0} loading={false} label="Exportar" title={filteredRows.length ? "Exportar archivo" : "No hay datos para exportar"} opciones={exportOptions} align="right" />
            <button type="button" className="mov-btn mov-btn--primary" onClick={handleOpenNuevoPresupuesto} title="Crear nuevo presupuesto">
              <FontAwesomeIcon icon={faPlus} /> Nuevo Presupuesto
            </button>
          </div>
        </div>

        <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: gridCols }} role="row">
          {columns.map((c) => <div key={c.key} className={["mov-gridCell", "mov-gridCell--head", c.align === "right" ? "is-right" : "", c.align === "center" ? "is-center" : ""].join(" ")} role="columnheader">{c.label}</div>)}
        </div>

        <div className="mov-tableWrap" role="rowgroup">
          <div className={["mov-gridBody", "mov-gridBody--relative", loadingRows ? "mov-softLoading" : ""].join(" ")}>
            {loadingRows ? <div className="mov-skeletonWrap" aria-busy="true">{Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}</div> : <>
              {filteredRows.map((r) => {
                const key = `presupuesto-${getMovimientoId(r) || `${r.fecha}-${r.cliente}-${r.monto_total}`}`;
                const idComp = getComprobanteId(r);
                const tieneComprobante = !!idComp;
                return (
                  <div key={key} className="mov-gridTable mov-gridTable--row" style={{ gridTemplateColumns: gridCols }} role="row">
                    {columns.map((c) => {
                      if (c.key === "acciones") {
                        return (
                          <div key={c.key} className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label={c.label}>
                            <div className="mov-actionsInline">
                              <button type="button" className={["mov-iconBtn", tieneComprobante ? "mov-iconBtn--comprobante" : "mov-iconBtn--disabled"].join(" ")} title={tieneComprobante ? "Ver presupuesto" : "Sin presupuesto PDF"} disabled={!tieneComprobante || isAnyLoading} onClick={() => handleVerComprobante(r)} style={{ opacity: tieneComprobante ? 1 : 0.35, cursor: tieneComprobante ? "pointer" : "not-allowed" }}>
                                <FontAwesomeIcon icon={faEye} />
                              </button>
                              <button type="button" className="mov-iconBtn mov-iconBtn--danger" title="Eliminar" disabled={isAnyLoading || loadingLists || deletingId === r.id_movimiento} onClick={() => { setSelectedRow(r); setOpenDel(true); }}>
                                {deletingId === r.id_movimiento ? "..." : <FontAwesomeIcon icon={faTrashCan} />}
                              </button>
                            </div>
                          </div>
                        );
                      }
                      const val = c.render ? c.render(r) : safeText(r[c.key]);
                      return <div key={c.key} className={["mov-gridCell", c.align === "right" ? "is-right" : "", c.align === "center" ? "is-center" : "", c.strong ? "is-strong" : ""].filter(Boolean).join(" ")} role="cell" data-label={c.label} title={typeof val === "string" ? val : undefined}><span className="mov-ellipsissss">{val}</span></div>;
                    })}
                  </div>
                );
              })}

              {!isAnyLoading && filteredRows.length === 0 && <div className="cc-emptyState"><FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" /><div className="cc-emptyText">{q.trim() ? `No se encontraron presupuestos para "${q.trim()}".` : "No hay presupuestos para mostrar en el rango de fechas seleccionado."}</div></div>}
              {!loadingRows && hasMore && filteredRows.length > 0 && <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}><button type="button" className="mov-btn mov-btn--loadAll" onClick={handleLoadMore} disabled={loadingMore || loadingLists}>{loadingMore ? "Cargando…" : "Cargar 100 más"}</button></div>}
              {loadingMore && <div className="mov-skeletonMore" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => renderSkeletonRow(i))}</div>}
            </>}
          </div>
        </div>
      </section>

      <ModalNuevoPresupuesto open={openAdd} lists={lists} onClose={() => setOpenAdd(false)} onToast={showToast} onSaved={async () => { setOpenAdd(false); setQ(""); await reloadVista(); }} />

      <ModalEliminar
        open={openDel}
        row={selectedRow}
        loading={deletingId === selectedRow?.id_movimiento}
        onClose={() => { setOpenDel(false); setSelectedRow(null); }}
        onConfirm={confirmDelete}
        onToast={showToast}
        title="Eliminar presupuesto"
        message="¿Seguro que querés eliminar este presupuesto?"
        warning="Esta acción elimina el movimiento de presupuesto. No impacta caja ni stock."
        loadingMessage="Eliminando presupuesto…"
        successMessage="Presupuesto eliminado correctamente."
        errorMessage="No se pudo eliminar el presupuesto."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        details={[
          { label: "ID Movimiento", value: `#${selectedRow?.id_movimiento ?? "—"}` },
          { label: "Cliente", value: selectedRow?.cliente || "—" },
          { label: "Concepto", value: selectedRow?.detalle || "—" },
          { label: "Monto", value: moneyARS(selectedRow?.monto_total || 0) },
        ]}
      />

      <ModalVerComprobante open={openVerComprobante} url={comprobanteUrl} mime={comprobanteMime} title="Presupuesto" onClose={() => { setOpenVerComprobante(false); setComprobanteUrl(""); setComprobanteMime("application/pdf"); }} />
    </div>
  );
}
