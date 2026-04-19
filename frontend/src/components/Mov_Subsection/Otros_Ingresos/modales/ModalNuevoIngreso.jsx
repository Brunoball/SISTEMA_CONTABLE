import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faFileInvoiceDollar, faEye, faTrash, faUpload, faMoneyCheckDollar } from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import BASE_URL from "../../../../config/config";
import ModalNuevoCheque from "../../../Global/Modales/ModalNuevoCheque.jsx";
import ModalNuevaDescripcion from "./ModalNuevaDescripcion.jsx";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";

const NULL_OPTION = "";
const IVA_OPTIONS = [{ label: "0 %", value: 0 }, { label: "10,5 %", value: 10.5 }, { label: "21 %", value: 21 }];

function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function safeNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function safeStr(v) { return String(v ?? "").trim(); }
function moneyARS(v) { try { return Number(v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch { return `$${Number(v || 0).toFixed(2)}`; } }
function formatMoneyInputARS(v) { return moneyARS(v); }
function parseMoneyInputARS(v) { if (v == null) return 0; let s = String(v).trim(); if (!s) return 0; s = s.replace(/\$/g, "").replace(/\s+/g, ""); if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", "."); else if (s.includes(",")) s = s.replace(",", "."); const n = Number(s); return Number.isFinite(n) ? n : 0; }
function formatEditableMoney(v) { const n = safeNumber(v); return n === 0 ? "" : String(n).replace(".", ","); }
function uid() { return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function normalizeText(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); }
function getDetalleId(d) { const c = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.id_categoria_ingreso ?? d?.idCategoriaIngreso ?? d?.categoria_ingreso_id ?? null; const n = Number(c); return Number.isFinite(n) && n > 0 ? n : null; }
function getMedioPagoId(c) { const cand = c?.id ?? c?.id_medio_pago ?? c?.idMedioPago ?? c?.medio_pago_id ?? null; const n = Number(cand); return Number.isFinite(n) && n > 0 ? n : null; }
function optionLabel(x) { return safeStr(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? ""); }
function getStockDisponible(d) { const c = d?.stock ?? d?.stock_disponible ?? d?.stockDisponible ?? d?.cantidad_stock ?? d?.cantidad ?? null; if (c === null || c === undefined || c === "") return null; const n = Number(c); return Number.isFinite(n) ? n : null; }
function isSinStock(s) { return s !== null && s !== undefined && Number(s) <= 0; }
function isTemaOscuro() { return document.documentElement.getAttribute("data-theme") === "oscuro" || document.body?.classList?.contains("dark"); }
function getSavedMovimientoIdFromResponse(data, init = null) { for (const c of [data?.id_movimiento, data?.movimiento_id, data?.id, data?.ingreso?.id_movimiento, data?.ingreso?.id, data?.otro_ingreso?.id_movimiento, data?.otro_ingreso?.id, init?.id_movimiento, init?.id]) { const n = Number(c); if (Number.isFinite(n) && n > 0) return n; } return null; }
function getAuthInfo() {
  const sessionKey = localStorage.getItem("session_key") || localStorage.getItem("sessionKey") || localStorage.getItem("x_session") || localStorage.getItem("X-Session") || "";
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0;
  try { const u = JSON.parse(localStorage.getItem("usuario") || "null"); const c = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0; if (Number.isFinite(Number(c))) idUsuario = Number(c); } catch {}
  return { sessionKey, token, idUsuario, idUsuarioMaster: idUsuario };
}
function buildAuthHeaders(isJson = true) { const { sessionKey, token } = getAuthInfo(); const h = {}; if (isJson) h["Content-Type"] = "application/json"; if (sessionKey) h["X-Session"] = sessionKey; if (token) h.Authorization = `Bearer ${token}`; return h; }
async function parseJsonOrThrow(res) { const text = await res.text(); if (!text) throw new Error("Respuesta vacía del servidor."); let data = null; try { data = JSON.parse(text); } catch { throw new Error(`Respuesta inválida del servidor.`); } if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`); return data; }
async function apiPostForm(url, fd) { return await parseJsonOrThrow(await fetch(url, { method: "POST", headers: buildAuthHeaders(false), body: fd })); }

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src?.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);
  const medios_pago = pick("medios_pago").length ? pick("medios_pago") : pick("mediosPago").length ? pick("mediosPago") : pick("medios").length ? pick("medios") : [];
  const detalles = pick("detalles_ingresos").length ? pick("detalles_ingresos") : pick("detallesIngresos").length ? pick("detallesIngresos") : pick("detalles_ingreso").length ? pick("detalles_ingreso") : pick("detallesIngreso").length ? pick("detallesIngreso") : pick("detalles").length ? pick("detalles") : pick("categorias_ingreso").length ? pick("categorias_ingreso") : pick("categoriasIngreso").length ? pick("categoriasIngreso") : [];
  return { medios_pago, detalles };
}
function detectChequeTipoFromMedio(nombre) {
  const s = normalizeText(nombre);
  if (!s) return null;
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq")) return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}
function buildEmptyRow() { return { id: uid(), id_detalle: NULL_OPTION, detalle: "", cantidad: 1, precio: 0, precioDraft: "", precioFocused: false, ivaPct: 0, stock_disponible: null, sinStock: false }; }
function buildEmptyMedioPago() { return { id: uid(), id_medio_pago: NULL_OPTION, monto: 0, montoDraft: "", montoFocused: false, chequeData: null, id_movimiento_medio_pago: null, id_cheque: null }; }

function MedioPagoIngresoRow({ row, mediosPagoList, totalIngreso, sumaMediosPago, onUpdate, onRemove, saving, onOpenCheque }) {
  const mpSeleccionado = useMemo(() => mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(row.id_medio_pago ?? "")) || null, [mediosPagoList, row.id_medio_pago]);
  const tipoCheque = useMemo(() => detectChequeTipoFromMedio(mpSeleccionado?.nombre || ""), [mpSeleccionado]);
  const esCheque = tipoCheque !== null;
  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - safeNumber(row.monto));
    return Math.max(0, safeNumber(totalIngreso) - sumaOtros);
  }, [sumaMediosPago, totalIngreso, row.monto]);
  const puedeCompletarRestante = !saving && !esCheque && totalIngreso > 0 && restanteParaEstaFila > 0.009;

  useEffect(() => {
    if (esCheque && row.chequeData?.importe > 0 && Number(row.monto) !== Number(row.chequeData.importe)) {
      onUpdate(row.id, { monto: Number(row.chequeData.importe), montoDraft: "", montoFocused: false });
    }
  }, [esCheque, row.chequeData, row.id, row.monto, onUpdate]);

  return <div className="nc-mp-card">
    <div className="nc-mp-inline">
      <div className="nc-mp-medio">
        <div className="nc-mp-sublabel">Medio</div>
        <select className="nc-mp-select" value={String(row.id_medio_pago || "")} onChange={(e) => onUpdate(row.id, { id_medio_pago: e.target.value, chequeData: null, id_cheque: null, monto: 0, montoDraft: "", montoFocused: false })} disabled={saving}>
          <option value={NULL_OPTION}>Seleccionar...</option>
          {mediosPagoList.map((x) => <option key={getMedioPagoId(x) ?? uid()} value={String(getMedioPagoId(x) ?? "")}>{String(x?.nombre ?? "").trim() || "Medio"}</option>)}
        </select>
      </div>
      <div className="nc-mp-monto-wrap">
        <div className="nc-mp-sublabel">Monto</div>
        <input className={`nc-mp-input-monto ${esCheque && row.chequeData ? "nc-mp-input-monto--locked" : ""}`} type="text" inputMode="decimal" value={row.montoFocused ? row.montoDraft ?? "" : formatMoneyInputARS(row.monto)} onFocus={(e) => { onUpdate(row.id, { montoFocused: true, montoDraft: formatEditableMoney(row.monto) }); setTimeout(() => e.target.select(), 0); }} onChange={(e) => { const c = e.target.value.replace(/[^\d,.\-]/g, ""); onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) }); }} onBlur={() => { const p = parseMoneyInputARS(row.montoDraft); onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false }); }} placeholder="$ 0,00" disabled={saving || (esCheque && !!row.chequeData)} />
      </div>
      <div className="nc-mp-actions-col">
        {!esCheque && <button type="button" className="nc-mp-completar" onClick={() => onUpdate(row.id, { monto: restanteParaEstaFila, montoDraft: "", montoFocused: false })} disabled={!puedeCompletarRestante} title="Completar importe restante">↓ Rest.</button>}
        <button type="button" className="nc-mp-del-btn" onClick={() => onRemove(row.id)} disabled={saving} title="Quitar medio de pago">×</button>
      </div>
    </div>
    {esCheque && <div className="nc-mp-cheques">
      <div className="nc-mp-cheques-title"><FontAwesomeIcon icon={faMoneyCheckDollar} /> {tipoCheque === "echeq" ? "eCheq" : "Cheque"}</div>
      {row.chequeData ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.25)", borderRadius: 8, padding: "8px 10px", fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: "#059669", marginBottom: 2 }}>✓ {tipoCheque === "echeq" ? "eCheq" : "Cheque"} cargado</div>
          <div><b>N°:</b> {row.chequeData.numero_cheque}</div>
          <div><b>Emisor:</b> {row.chequeData.emisor}</div>
          <div><b>Importe:</b> {moneyARS(row.chequeData.importe)}</div>
          <div><b>Fecha pago:</b> {row.chequeData.fecha_pago}</div>
          {row.chequeData.archivo_nombre && <div><b>Archivo:</b> {row.chequeData.archivo_nombre}</div>}
        </div>
        <button type="button" className="mit-btn mit-btn--ghost" style={{ width: "100%", fontSize: 12 }} onClick={() => onOpenCheque(row.id, tipoCheque)} disabled={saving}>Editar {tipoCheque === "echeq" ? "eCheq" : "cheque"}</button>
      </div> : <button type="button" className="mit-btn mit-btn--solid" style={{ width: "100%", marginTop: 4 }} onClick={() => onOpenCheque(row.id, tipoCheque)} disabled={saving}>Cargar {tipoCheque === "echeq" ? "eCheq" : "cheque"}</button>}
    </div>}
  </div>;
}

export default function ModalNuevoIngreso({ open, mode = "create", initialData = null, lists, onClose, onToast, onSubmit, onSaved }) {
  const API_UPLOAD = `${BASE_URL}/api.php?action=otros_ingresos_comprobantes_vincular_movimiento_upload`;
  const API_CHEQUES_GUARDAR = `${BASE_URL}/api.php?action=otros_ingresos_cheques_guardar`;
  const API_DETALLES_CREAR = `${BASE_URL}/api.php?action=otros_ingresos_detalles_crear`;
  const showToast = useCallback((tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur), [onToast]);

  const [dark, setDark] = useState(isTemaOscuro);
  const [saving, setSaving] = useState(false);
  const [fecha, setFecha] = useState(todayISO);
  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [mediosFilas, setMediosFilas] = useState(() => [buildEmptyMedioPago()]);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  const [openViewer, setOpenViewer] = useState(false);
  const [viewerData, setViewerData] = useState({ url: "", mime: "", title: "Comprobante" });
  const [openNuevaDescripcionModal, setOpenNuevaDescripcionModal] = useState(false);
  const [currentRowIdForNewDesc, setCurrentRowIdForNewDesc] = useState(null);
  const [chequeEditor, setChequeEditor] = useState({ open: false, medioRowId: null, tipoCheque: "cheque" });

  const rowsContainerRef = useRef(null);
  const [hasScroll, setHasScroll] = useState(false);
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);
  const inputFileRef = useRef(null);

  const localLists = useMemo(() => normalizeLists(lists), [lists]);
  const mediosPagoList = useMemo(() => Array.isArray(localLists.medios_pago) ? localLists.medios_pago : [], [localLists.medios_pago]);
  const detallesList = useMemo(() => Array.isArray(localLists.detalles) ? localLists.detalles : [], [localLists.detalles]);
  const enhancedDetallesList = useMemo(() => [{ id: "new_option", __isNewOption: true, nombre: "+ Agregar nueva descripción" }, ...detallesList], [detallesList]);

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update); o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update); if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  useEffect(() => { if (!open) return; const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key !== "Escape" || saving) return; if (openViewer || chequeEditor.open || openNuevaDescripcionModal) return; e.preventDefault(); e.stopPropagation(); onClose?.(); };
    document.addEventListener("keydown", h, true); return () => document.removeEventListener("keydown", h, true);
  }, [open, onClose, saving, openViewer, chequeEditor.open, openNuevaDescripcionModal]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current; prevOpenRef.current = open; if (!open) return;
    if (!wasOpen && open) {
      setFecha(safeStr(initialData?.fecha).slice(0, 10) || todayISO());
      setRows([buildEmptyRow()]);
      setMediosFilas([buildEmptyMedioPago()]);
      setArchivoAdjunto(null); setOpenViewer(false); setViewerData({ url: "", mime: "", title: "Comprobante" }); setSaving(false); setChequeEditor({ open: false, medioRowId: null, tipoCheque: "cheque" });
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, initialData]);

  useEffect(() => {
    const el = rowsContainerRef.current; if (!el) return;
    const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
    check(); const ro = new ResizeObserver(check); ro.observe(el); window.addEventListener("resize", check);
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, [open, rows]);

  const updateRow = useCallback((id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);
  const addRow = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback((id) => setRows((p) => { const n = p.filter((r) => r.id !== id); return n.length ? n : [buildEmptyRow()]; }), []);
  const updateMedioPago = useCallback((id, patch) => setMediosFilas((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);
  const addMedioPago = useCallback(() => setMediosFilas((p) => [...p, buildEmptyMedioPago()]), []);
  const removeMedioPago = useCallback((id) => setMediosFilas((p) => { const row = p.find((x) => x.id === id); const next = p.filter((x) => x.id !== id); return next.length ? next : [buildEmptyMedioPago()]; }), []);

  const handleCrearNuevaDescripcion = useCallback((rowId) => { setCurrentRowIdForNewDesc(rowId); setOpenNuevaDescripcionModal(true); }, []);
  const handleGuardarNuevaDescripcion = useCallback(async (nombreDescripcion) => {
    try {
      const { sessionKey, token, idUsuario, idUsuarioMaster } = getAuthInfo();
      const headers = { "Content-Type": "application/json" }; if (sessionKey) headers["X-Session"] = sessionKey; if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(API_DETALLES_CREAR, { method: "POST", headers, body: JSON.stringify({ nombre: nombreDescripcion, idUsuario, idUsuarioMaster }) });
      const data = await parseJsonOrThrow(response);
      if (data.exito && data.detalle) {
        const precio = safeNumber(data.detalle?.precio || 0); const stockDisponible = getStockDisponible(data.detalle); const sinStock = isSinStock(stockDisponible);
        updateRow(currentRowIdForNewDesc, { id_detalle: String(data.detalle.id_detalle || data.detalle.id || ""), detalle: data.detalle.nombre || nombreDescripcion, precio, stock_disponible: stockDisponible, sinStock, cantidad: sinStock ? "" : 1 });
        showToast("exito", "Descripción creada y seleccionada correctamente.", 2500); return true;
      }
      throw new Error(data.mensaje || "Error al crear la descripción");
    } catch (error) { showToast("error", error.message || "No se pudo crear la descripción.", 3000); return false; }
  }, [API_DETALLES_CREAR, currentRowIdForNewDesc, updateRow, showToast]);
  const handleSelectDetalle = useCallback((item, rowId) => {
    if (item && item.__isNewOption) { handleCrearNuevaDescripcion(rowId); return; }
    const precio = safeNumber(item?.precio || 0); const stockDisponible = getStockDisponible(item); const sinStock = isSinStock(stockDisponible);
    updateRow(rowId, { id_detalle: String(getDetalleId(item) ?? ""), detalle: optionLabel(item), precio, stock_disponible: stockDisponible, sinStock, cantidad: sinStock ? "" : 1 });
    if (sinStock) showToast("advertencia", `El producto "${optionLabel(item)}" no tiene stock disponible.`, 2500);
  }, [updateRow, showToast, handleCrearNuevaDescripcion]);
  const handleCantidadChange = useCallback((rowId, newCantidad) => {
    const row = rows.find((r) => r.id === rowId); if (!row) return;
    if (row.sinStock || isSinStock(row.stock_disponible)) { updateRow(rowId, { cantidad: "" }); return; }
    let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);
    if (typeof cantidadFinal === "number" && cantidadFinal < 0) cantidadFinal = 0;
    if (row.stock_disponible !== null && row.stock_disponible !== undefined && row.stock_disponible !== "" && typeof cantidadFinal === "number" && cantidadFinal > Number(row.stock_disponible)) { cantidadFinal = Number(row.stock_disponible); showToast("advertencia", `Stock máximo disponible: ${row.stock_disponible}`, 2000); }
    updateRow(rowId, { cantidad: cantidadFinal });
  }, [rows, updateRow, showToast]);

  const rowsCalc = useMemo(() => rows.map((r) => { const cantidad = Math.max(0, safeNumber(r.cantidad)); const precio = Math.max(0, safeNumber(r.precio)); const ivaPct = Math.max(0, safeNumber(r.ivaPct)); const subtotal = cantidad * precio; const ivaMonto = subtotal * (ivaPct / 100); const total = subtotal + ivaMonto; return { ...r, subtotal, ivaMonto, total }; }), [rows]);
  const resumen = useMemo(() => ({ subtotal: rowsCalc.reduce((a, r) => a + safeNumber(r.subtotal), 0), iva: rowsCalc.reduce((a, r) => a + safeNumber(r.ivaMonto), 0), total: rowsCalc.reduce((a, r) => a + safeNumber(r.total), 0) }), [rowsCalc]);
  const sumaMediosPago = useMemo(() => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0), [mediosFilas]);
  const diferenciaRestante = useMemo(() => Math.max(0, resumen.total - sumaMediosPago), [resumen.total, sumaMediosPago]);

  const abrirViewer = useCallback(() => {
    if (!archivoAdjunto) return;
    setViewerData({ url: URL.createObjectURL(archivoAdjunto), mime: archivoAdjunto.type || "application/octet-stream", title: `Comprobante - ${archivoAdjunto.name}` });
    setOpenViewer(true);
  }, [archivoAdjunto]);
  const cerrarViewer = useCallback(() => { if (viewerData?.url?.startsWith("blob:")) URL.revokeObjectURL(viewerData.url); setOpenViewer(false); setViewerData({ url: "", mime: "", title: "Comprobante" }); }, [viewerData]);

  const validate = useCallback(() => {
    if (!safeStr(fecha)) return { ok: false, msg: "Falta la fecha." };
    for (let i = 0; i < mediosFilas.length; i++) {
      const mp = mediosFilas[i];
      if (!mp.id_medio_pago || mp.id_medio_pago === NULL_OPTION) return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
      const medio = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago));
      const tipoCheque = detectChequeTipoFromMedio(medio?.nombre || "");
      if (tipoCheque) {
        if (!mp.chequeData) return { ok: false, msg: `Medio de pago ${i + 1}: debés cargar el ${tipoCheque === "echeq" ? "eCheq" : "cheque"}.` };
        if (safeNumber(mp.chequeData?.importe) <= 0) return { ok: false, msg: `Medio de pago ${i + 1}: el importe del cheque es inválido.` };
      } else if (safeNumber(mp.monto) <= 0) return { ok: false, msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.` };
    }
    if (sumaMediosPago < resumen.total - 0.05 && resumen.total > 0) return { ok: false, msg: `La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total del ingreso (${moneyARS(resumen.total)}).` };
    const problems = [];
    rowsCalc.forEach((r, i) => {
      const touched = safeStr(r.detalle) !== "" || String(r.id_detalle || "").trim() !== "" || safeNumber(r.cantidad) !== 0 || safeNumber(r.precio) !== 0;
      if (!touched) return;
      const issues = [];
      if (!safeStr(r.detalle)) issues.push("falta la descripción");
      if (!(safeNumber(r.cantidad) > 0)) issues.push("la cantidad debe ser > 0");
      if (!(safeNumber(r.precio) > 0)) issues.push("el importe debe ser > 0");
      if (!(safeNumber(r.total) > 0)) issues.push("el total queda en 0");
      if (issues.length) problems.push(`Fila ${i + 1}: ${issues.join(", ")}.`);
    });
    const usable = rowsCalc.filter((r) => safeStr(r.detalle) !== "" && Number(r.id_detalle || 0) > 0 && safeNumber(r.cantidad) > 0 && safeNumber(r.precio) > 0 && safeNumber(r.total) > 0);
    if (!usable.length) return { ok: false, msg: problems.length ? `No hay filas válidas. ${problems.slice(0, 2).join(" ")}${problems.length > 2 ? ` (y ${problems.length - 2} más)` : ""}` : "Cargá al menos 1 fila válida (Descripción + Cantidad + Importe)." };
    return { ok: true, warn: problems.length > 0, usable };
  }, [fecha, mediosFilas, mediosPagoList, sumaMediosPago, resumen.total, rowsCalc]);

  const buildPayload = useCallback(() => {
    const usableRows = rowsCalc.filter((r) => safeStr(r.detalle) !== "" && Number(r.id_detalle || 0) > 0 && safeNumber(r.cantidad) > 0 && safeNumber(r.precio) > 0 && safeNumber(r.total) > 0);
    const detalleFinal = usableRows.length === 1 ? safeStr(usableRows[0].detalle) : usableRows.map((x) => safeStr(x.detalle)).filter(Boolean).join(" | ");
    const subtotalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.subtotal), 0);
    const ivaFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.ivaMonto), 0);
    const totalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.total), 0);
    const mediosPayload = mediosFilas.map((mp, index) => ({ id_medio_pago: Number(mp.id_medio_pago), monto: safeNumber(mp.chequeData?.importe ?? mp.monto), cheque_tipo: mp.chequeData?.tipo_cheque || null, original_index: index }));
    return {
      fecha: safeStr(fecha).slice(0, 10),
      id_medio_pago: mediosPayload[0]?.id_medio_pago || null,
      medio_pago_nombre: optionLabel(mediosPagoList.find((x) => Number(getMedioPagoId(x)) === Number(mediosPayload[0]?.id_medio_pago))),
      medios_pago: mediosPayload,
      detalle: detalleFinal,
      descripcion: detalleFinal,
      concepto: detalleFinal,
      cantidad: usableRows.length === 1 ? safeNumber(usableRows[0].cantidad) : 1,
      precio: usableRows.length === 1 ? safeNumber(usableRows[0].precio) : safeNumber(subtotalFinal),
      subtotal: safeNumber(subtotalFinal),
      iva_monto: safeNumber(ivaFinal),
      monto_total: safeNumber(totalFinal),
      total: safeNumber(totalFinal),
      total_general: safeNumber(totalFinal),
      items: usableRows.map((x, idx) => ({ orden: idx + 1, id_detalle: Number(x.id_detalle || 0) || null, detalle: safeStr(x.detalle), descripcion: safeStr(x.detalle), concepto: safeStr(x.detalle), cantidad: safeNumber(x.cantidad), precio: safeNumber(x.precio), iva_pct: safeNumber(x.ivaPct), subtotal: safeNumber(x.subtotal), iva_monto: safeNumber(x.ivaMonto), total: safeNumber(x.total) })),
    };
  }, [rowsCalc, fecha, mediosFilas, mediosPagoList]);

  const subirArchivo = useCallback(async (idMovimiento, archivo) => {
    if (!archivo || !idMovimiento) return null;
    const fd = new FormData(); fd.append("archivo", archivo); fd.append("tipo", "OTRO_INGRESO"); fd.append("id_movimiento", String(idMovimiento)); fd.append("force_replace", "1");
    return await apiPostForm(API_UPLOAD, fd);
  }, [API_UPLOAD]);
  const guardarChequeEnBackend = useCallback(async (idMovimiento, medioDetalle, chequeData) => {
    if (!chequeData) return null;
    const fd = new FormData();
    const { token, sessionKey, idUsuario, idUsuarioMaster } = getAuthInfo();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("id_movimiento_medio_pago", String(Number(medioDetalle?.id_movimiento_medio_pago || 0)));
    fd.append("id_medio_pago", String(Number(medioDetalle?.id_medio_pago || 0)));
    fd.append("tipo", chequeData.tipo_cheque || "cheque");
    fd.append("fecha_emision", chequeData.fecha_emision || todayISO());
    fd.append("emisor", chequeData.emisor || "");
    fd.append("numero_cheque", chequeData.numero_cheque || "");
    fd.append("importe", String(chequeData.importe || 0));
    fd.append("fecha_pago", chequeData.fecha_pago || todayISO());
    fd.append("observaciones", chequeData.observaciones || "");
    fd.append("idUsuario", String(idUsuario || 0)); fd.append("idUsuarioMaster", String(idUsuarioMaster || 0));
    if (chequeData.archivo instanceof File) fd.append("archivo", chequeData.archivo, chequeData.archivo_nombre || chequeData.archivo.name || "adjunto");
    const headers = {}; if (sessionKey) headers["X-Session"] = sessionKey; if (token) headers.Authorization = `Bearer ${token}`;
    return await parseJsonOrThrow(await fetch(API_CHEQUES_GUARDAR, { method: "POST", headers, body: fd }));
  }, [API_CHEQUES_GUARDAR]);

  const submit = useCallback(async () => {
    if (saving) return;
    if (typeof onSubmit !== "function") { showToast("error", "Falta la función de guardado del modal.", 4200); return; }
    const v = validate(); if (!v.ok) { showToast("advertencia", v.msg || "Faltan datos.", 4200); return; }
    setSaving(true); if (v.warn) showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    try {
      const payload = buildPayload();
      const data = await onSubmit(payload, mode === "edit");
      const idMovimientoFinal = getSavedMovimientoIdFromResponse(data, initialData);
      if (!idMovimientoFinal) throw new Error("El backend no devolvió un id_movimiento válido.");
      let warningArchivo = "";
      if (archivoAdjunto) {
        try { const r = await subirArchivo(idMovimientoFinal, archivoAdjunto); if (!r?.exito) warningArchivo = r?.mensaje || "No se pudo vincular el archivo."; }
        catch (e) { warningArchivo = e?.message || "No se pudo vincular el archivo."; }
      }
      const mediosDetalle = Array.isArray(data?.medios_pago_detalle) ? data.medios_pago_detalle : [];
      for (let index = 0; index < mediosFilas.length; index++) {
        const row = mediosFilas[index];
        if (!row.chequeData) continue;
        const detalleMp = mediosDetalle.find((x) => Number(x?.original_index) === index) || mediosDetalle[index] || null;
        try { await guardarChequeEnBackend(idMovimientoFinal, detalleMp, row.chequeData); }
        catch (eCheque) { showToast("advertencia", `Ingreso guardado, pero no se pudo guardar un cheque: ${eCheque?.message || "error"}`, 5000); }
      }
      if (warningArchivo) showToast("advertencia", `Ingreso guardado, pero el archivo no se pudo vincular: ${warningArchivo}`, 7000);
      await onSaved?.({ ...(data || {}), id_movimiento: idMovimientoFinal });
    } catch (e) { showToast("error", e?.message || "No se pudo guardar el ingreso.", 4500); }
    finally { setSaving(false); }
  }, [saving, onSubmit, validate, buildPayload, mode, onSaved, showToast, initialData, archivoAdjunto, subirArchivo, mediosFilas, guardarChequeEnBackend]);

  const btnLabel = saving ? "Procesando..." : mode === "edit" ? "Guardar cambios" : "Guardar ingreso";
  if (!open) return null;

  return createPortal(<>
    <div className="mi-modal__overlay"><div className="mi-modal__container mi-modal__container--mov" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
      <div className="mi-modal__header"><div className="mi-modal__head-icon" aria-hidden="true"><FontAwesomeIcon icon={faPlus} /></div><div className="mi-modal__head-left"><h2 className="mi-modal__title">{mode === "edit" ? "Editar Ingreso" : "Nuevo Ingreso"}</h2></div><button ref={closeBtnRef} className="mi-modal__close" onClick={() => !saving && onClose?.()} aria-label="Cerrar" disabled={saving} type="button">✕</button></div>
      <div className="mi-modal__content"><div className="mi-cr-grid"><section className="mi-cr-table"><div className="mi-cr-table__head"><div style={{ paddingLeft: 10 }}>Descripción</div><div>Cant.</div><div className="right">Importe</div><div>IVA %</div><div className="right">IVA $</div><div className="right">Total</div><div /></div><div ref={rowsContainerRef} className={`mi-cr-table__rows${hasScroll ? " has-scroll" : ""}`}>{rowsCalc.map((r) => { const stockNum = r.stock_disponible !== null && r.stock_disponible !== undefined ? Number(r.stock_disponible) : null; const rowSinStock = r.sinStock || isSinStock(stockNum); return <div key={r.id} className={`mi-cr-row${rowSinStock ? " mi-cr-row--sin-stock" : ""}`}><div className="mi-cr-cell mi-cr-cell--detalle"><GlobalAutocomplete value={r.detalle} onChange={(val) => updateRow(r.id, { detalle: val, id_detalle: NULL_OPTION, stock_disponible: null, sinStock: false })} onSelect={(item) => handleSelectDetalle(item, r.id)} options={enhancedDetallesList} getOptionLabel={(d) => d && d.__isNewOption ? d.nombre : optionLabel(d)} getOptionValue={(d) => d && d.__isNewOption ? "__new_option__" : String(getDetalleId(d) ?? optionLabel(d))} placeholder="Escribí o buscá un detalle…" disabled={saving} showAllOnFocus={false} maxItems={18} inputClassName="nv-cell-input" /></div><div className="mi-cr-cell mi-cr-cell--center"><input className="nv-cell-input nv-cell-input--center" type="number" min={rowSinStock ? undefined : "1"} step="1" value={rowSinStock ? "" : r.cantidad} onChange={(e) => handleCantidadChange(r.id, e.target.value === "" ? "" : Number(e.target.value))} disabled={saving || rowSinStock} placeholder={rowSinStock ? "0" : ""} title={rowSinStock ? "No podés ingresar cantidad porque el stock es 0" : ""} style={{ width: "100%", background: rowSinStock ? "#f3f4f6" : undefined, color: rowSinStock ? "#b91c1c" : undefined, borderColor: rowSinStock ? "#fca5a5" : undefined, cursor: rowSinStock ? "not-allowed" : undefined, opacity: rowSinStock ? 0.9 : 1 }} />{r.stock_disponible !== null && r.stock_disponible !== undefined && <div style={{ fontSize: "10px", fontWeight: rowSinStock ? 700 : 500, color: rowSinStock ? "#b91c1c" : "#666" }}>{rowSinStock ? "Sin stock" : `Stock: ${r.stock_disponible}`}</div>}</div><div className="mi-cr-cell mi-cr-cell--center"><input className="nv-cell-input nv-cell-input--right" type="text" inputMode="decimal" value={r.precioFocused ? r.precioDraft ?? "" : formatMoneyInputARS(r.precio)} onFocus={(e) => { updateRow(r.id, { precioFocused: true, precioDraft: formatEditableMoney(r.precio) }); setTimeout(() => e.target.select(), 0); }} onChange={(e) => { const c = e.target.value.replace(/[^\d,.\-]/g, ""); updateRow(r.id, { precioDraft: c, precio: parseMoneyInputARS(c) }); }} onBlur={() => { const p = parseMoneyInputARS(r.precioDraft); updateRow(r.id, { precio: p, precioDraft: "", precioFocused: false }); }} placeholder="$ 0,00" disabled={saving} style={{ width: "100%" }} /></div><div className="mi-cr-cell mi-cr-cell--center"><select className="nv-cell-input nv-cell-input--center nv-cell-input--select" value={String(r.ivaPct)} onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })} disabled={saving} style={{ width: "100%" }}>{IVA_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div><div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">{moneyARS(r.ivaMonto)}</div><div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">{moneyARS(r.total)}</div><div className="mi-cr-cell mi-cr-cell--center" id="delete_cell"><button type="button" className="mi-cr-del" onClick={() => removeRow(r.id)} disabled={saving} title="Eliminar fila">×</button></div></div>; })}</div><div className="mi-cr-table__foot"><div className="mi-cr-foot-actions"><button type="button" className="nv-foot-btn" onClick={addRow} disabled={saving}><span className="nv-foot-btn__icon">+</span>Agregar fila</button></div><div className="mi-cr-totals"><div className="mi-cr-totalLine mi-cr-totalLine--sub"><span>Subtotal</span><b>{moneyARS(resumen.subtotal)}</b></div><div className="mi-cr-totalLine mi-cr-totalLine--iva"><span>IVA</span><b>{moneyARS(resumen.iva)}</b></div><div className="mi-cr-totalLine mi-cr-totalLine--total"><span>Total</span><b>{moneyARS(resumen.total)}</b></div></div></div></section>
      <aside className="nc-aside"><div className="nc-section"><div className="nc-section-head"><div className="nc-section-dot" /><span>Datos del ingreso</span></div><div className="nc-section-body"><div className="nc-field"><input className="nc-input" type="date" placeholder=" " value={fecha} onChange={(e) => setFecha(String(e.target.value || "").trim())} disabled={saving} /><label className="nc-label">Fecha</label></div></div></div>
      <div className="nc-section"><div className="nc-section-head"><div className="nc-section-dot" style={{ background: "#0f766e" }} /><span>Medios de pago</span></div><div className="nc-section-body">{mediosFilas.map((mp) => <MedioPagoIngresoRow key={mp.id} row={mp} mediosPagoList={mediosPagoList} totalIngreso={resumen.total} sumaMediosPago={sumaMediosPago} onUpdate={updateMedioPago} onRemove={removeMedioPago} saving={saving} onOpenCheque={(medioRowId, tipoCheque) => setChequeEditor({ open: true, medioRowId, tipoCheque })} />)}<div className="nc-mp-totals"><span className="nc-mp-totals-asignado">Asignado: <b>{moneyARS(sumaMediosPago)}</b></span>{diferenciaRestante > 0.01 && <span className="nc-mp-totals-falta">Falta: {moneyARS(diferenciaRestante)}</span>}{diferenciaRestante <= 0.01 && sumaMediosPago > 0 && <span className="nc-mp-totals-ok">✓ Cubierto</span>}</div><button type="button" className="nc-pago-btn" onClick={addMedioPago} disabled={saving}><FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro medio</button></div></div>
      <div className="nc-section"><div className="nc-section-head"><div className="nc-section-dot" style={{ background: "#64748b" }} /><span>Comprobante adjunto</span></div><div className="nc-section-body"><div className="mi-uploadCard"><div className="mi-uploadCard__head"><div className="mi-uploadCard__title">Comprobante</div><div className="mi-uploadCard__sub">Seleccioná, visualizá o quitá el archivo antes de guardar</div></div><div className="mi-uploadCard__body"><div className={`mi-uploadFile${archivoAdjunto ? " is-filled" : " is-empty"}`}>{archivoAdjunto ? <><div className="mi-uploadFile__icon"><FontAwesomeIcon icon={faFileInvoiceDollar} /></div><div className="mi-uploadFile__meta"><div className="mi-uploadFile__name" title={archivoAdjunto.name}>{archivoAdjunto.name}</div><div className="mi-uploadFile__size">{Math.max(1, Math.round((archivoAdjunto.size || 0) / 1024))} KB</div></div><div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}><button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--ghost" onClick={abrirViewer} disabled={saving} title="Ver comprobante"><FontAwesomeIcon icon={faEye} /></button><button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--ghost" onClick={() => { setArchivoAdjunto(null); if (inputFileRef.current) inputFileRef.current.value = ""; }} disabled={saving || openViewer} title="Quitar archivo"><FontAwesomeIcon icon={faTrash} /></button></div></> : <div className="mi-uploadFile__empty">No hay comprobante seleccionado</div>}</div><div className="mi-uploadBar" style={{ marginTop: 10 }}><input ref={inputFileRef} type="file" className="mi-uploadBar__input" onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)} disabled={saving} style={{ display: "none" }} /><button type="button" className="mi-uploadBar__btn mi-uploadBar__btn--primary" onClick={() => inputFileRef.current?.click()} disabled={saving}><FontAwesomeIcon icon={faUpload} /> {archivoAdjunto ? "Reemplazar archivo" : "Seleccionar archivo"}</button></div></div></div></div></div>
      <div className="nc-actions mi-cr-filters__actions"><button type="button" className="mit-btn mit-btn--solid mit-btn--block" onClick={submit} disabled={saving}>{btnLabel}</button><button type="button" className="mit-btn mit-btn--ghost mit-btn--block" onClick={() => !saving && onClose?.()} disabled={saving}>Cancelar</button></div></aside></div></div></div></div>
      {openNuevaDescripcionModal && <ModalNuevaDescripcion open={openNuevaDescripcionModal} onClose={() => setOpenNuevaDescripcionModal(false)} onSave={handleGuardarNuevaDescripcion} dark={dark} />}
      {chequeEditor.open && <ModalNuevoCheque open={chequeEditor.open} onClose={() => setChequeEditor({ open: false, medioRowId: null, tipoCheque: "cheque" })} onSave={async (datosCheque) => { updateMedioPago(chequeEditor.medioRowId, { chequeData: { ...datosCheque, tipo_cheque: chequeEditor.tipoCheque }, monto: Number(datosCheque?.importe || 0), montoDraft: "", montoFocused: false }); setChequeEditor({ open: false, medioRowId: null, tipoCheque: "cheque" }); showToast("exito", `${chequeEditor.tipoCheque === "echeq" ? "eCheq" : "Cheque"} cargado. Se guardará al confirmar el ingreso.`, 3200); }} initialData={mediosFilas.find((x) => x.id === chequeEditor.medioRowId)?.chequeData || undefined} tipoCheque={chequeEditor.tipoCheque} dark={dark} saving={false} />}
      <ModalVerComprobante open={openViewer} url={viewerData.url} mime={viewerData.mime} title={viewerData.title} onClose={cerrarViewer} />
    </>, document.body);
}
