import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
import ModalFacturaBaltoResumen from "../../Facturacion/ModalFacturaBaltoResumen.jsx";
import ModalNuevoCheque from "./ModalNuevoCheque.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
} from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

/* =========================================================
   Helpers
========================================================= */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function plusDaysISOFrom(baseIso, days = 10) {
  const base = String(baseIso || todayISO()).slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(base) ? new Date(`${base}T00:00:00`) : new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function safeNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function isBlank(v) { return String(v ?? "").trim() === ""; }
function moneyARS(v) {
  try { return Number(v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" }); }
  catch { return `$${Number(v || 0).toFixed(2)}`; }
}
function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$ ${n.toFixed(2)}`;
  }
}
function parseMoneyInputARS(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\$/g, "").replace(/\s+/g, "");
  s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}
function uid() { return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function onlyDigits(v) { return String(v ?? "").replace(/\D/g, ""); }
function safeStr(v) { return String(v ?? "").trim(); }
function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getDetalleId(d) {
  const cand = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getClienteId(c) {
  const cand = c?.id ?? c?.id_cliente ?? c?.idCliente ?? c?.cliente_id ?? c?.idcliente ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function fechaToYYYYMM(isoDate) {
  const s = String(isoDate ?? "").trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
}
function getStockDisponible(detalle) {
  const cand =
    detalle?.stock ??
    detalle?.stock_disponible ??
    detalle?.stockDisponible ??
    detalle?.cantidad_stock ??
    detalle?.cantidad ??
    null;

  if (cand === null || cand === undefined || cand === "") return null;
  const n = Number(cand);
  return Number.isFinite(n) ? n : null;
}
function isSinStock(stock) {
  return stock !== null && stock !== undefined && Number(stock) <= 0;
}

const SAFE_LISTS = { clientes: [], detalles: [], medios_pago: [], tipos_venta: [], cuentas_corrientes: [] };

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);
  const mediosPago = pick("medios_pago").length ? pick("medios_pago") : pick("mediosPago").length ? pick("mediosPago") : pick("medios");
  const cuentas = pick("cuentas_corrientes").length ? pick("cuentas_corrientes") : pick("cuentasCorrientes").length ? pick("cuentasCorrientes") : pick("cuentas");
  const tiposVenta = pick("tipos_venta").length ? pick("tipos_venta") : pick("tiposVenta").length ? pick("tiposVenta") : pick("tipo_venta").length ? pick("tipo_venta") : [];
  return {
    clientes: pick("clientes"),
    detalles: pick("detalles"),
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
    cuentas_corrientes: Array.isArray(cuentas) ? cuentas : [],
    tipos_venta: Array.isArray(tiposVenta) ? tiposVenta : [],
  };
}

function getAuthInfo() {
  const sessionKey = localStorage.getItem("session_key") || localStorage.getItem("sessionKey") || localStorage.getItem("x_session") || localStorage.getItem("X-Session") || "";
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, sessionKey, idUsuario };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}\n${preview}`);
  }
}

function buildAuthHeaders(isJson = true) {
  const { token, sessionKey } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiPostJson(url, payload) {
  const res = await fetch(url, { method: "POST", headers: buildAuthHeaders(true), body: JSON.stringify(payload ?? {}) });
  return await parseJsonOrThrow(res);
}
async function apiGetJson(url) {
  const res = await fetch(url, { method: "GET", headers: buildAuthHeaders(false) });
  return await parseJsonOrThrow(res);
}

function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro" || document.body?.classList?.contains("dark");
}

function normalizeArcaSummary(s) {
  const x = s && typeof s === "object" ? s : {};
  return {
    cuit: safeStr(x.cuit),
    razon_social: safeStr(x.razon_social),
    condicion_iva: safeStr(x.iva || x.condicion_iva),
    domicilio: safeStr(x.domicilio),
    doc_tipo: 80,
    doc_nro: safeStr(x.cuit),
    origen: "arca_cuit"
  };
}
function normalizeClienteFiscalDb(data) {
  const s = data && typeof data === "object" ? data : {};
  return {
    id_cliente_fiscal: Number(s.id_cliente_fiscal || 0) || null,
    id_cliente: Number(s.id_cliente || 0) || null,
    doc_tipo: Number(s.doc_tipo || 80) || 80,
    doc_nro: safeStr(s.doc_nro),
    cuit: safeStr(s.cuit),
    razon_social: safeStr(s.razon_social),
    condicion_iva: safeStr(s.condicion_iva || s.cond_iva),
    domicilio: safeStr(s.domicilio),
    origen: safeStr(s.origen || "manual")
  };
}
function resolveClienteByInput(clientes, inputValue) {
  const q = normalizeText(inputValue);
  if (!q) return null;
  const arr = Array.isArray(clientes) ? clientes : [];
  const wm = arr.map(c => ({ raw: c, id: getClienteId(c), nombreNorm: normalizeText(c?.nombre) })).filter(x => x.id && x.nombreNorm);
  if (!wm.length) return null;
  const exact = wm.find(x => x.nombreNorm === q); if (exact) return exact.raw;
  const starts = wm.filter(x => x.nombreNorm.startsWith(q)); if (starts.length === 1) return starts[0].raw;
  const contains = wm.filter(x => x.nombreNorm.includes(q)); if (contains.length === 1) return contains[0].raw;
  return null;
}

function isContadoTipoVenta(tv) {
  return String(tv?.nombre ?? "").toLowerCase().includes("contado") || String(tv?.nombre ?? "").toLowerCase().includes("efectivo");
}
function isMedioPagoCheque(mediosPagoList, idMedioPago) {
  const id = Number(idMedioPago);
  if (!Number.isFinite(id) || id <= 0) return false;
  const medio = mediosPagoList.find(x => Number(x?.id ?? x?.id_medio_pago ?? 0) === id);
  if (!medio) return false;
  const nombre = normalizeText(medio?.nombre ?? "");
  return nombre.includes("cheque") || nombre.includes("echeq");
}
function isMedioPagoEcheq(mediosPagoList, idMedioPago) {
  const id = Number(idMedioPago);
  if (!Number.isFinite(id) || id <= 0) return false;
  const medio = mediosPagoList.find(x => Number(x?.id ?? x?.id_medio_pago ?? 0) === id);
  if (!medio) return false;
  const nombre = normalizeText(medio?.nombre ?? "");
  return nombre.includes("echeq");
}

function describeLineProblem(r, idx1based) {
  const detId = Number(r.id_detalle);
  const detTxt = String(r.detalleText || "").trim();
  const qtyBlank = isBlank(r.cantidad);
  const priceBlank = isBlank(r.precio);
  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);
  const touched = detTxt !== "" || String(r.id_detalle || "").trim() !== "" || !qtyBlank || !priceBlank || safeNumber(r.cantidad) !== 0 || safeNumber(r.precio) !== 0;
  if (!touched) return null;
  const issues = [];
  if (!(Number.isFinite(detId) && detId > 0)) issues.push(detTxt ? `el detalle "${detTxt}" no está seleccionado del listado` : "falta el detalle");
  if (qtyBlank) issues.push("falta la cantidad");
  else if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser > 0");
  if (priceBlank) issues.push("falta el precio");
  else if (!(Number.isFinite(price) && price > 0)) issues.push("el precio debe ser > 0");
  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0");
  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

function buildEmptyRow() {
  return {
    id: uid(),
    id_detalle: NULL_OPTION,
    detalleText: "",
    cantidad: 1,
    precio: 0,
    precioDraft: "",
    precioFocused: false,
    ivaPct: 0,
    stock_disponible: null,
    sinStock: false,
  };
}

/* =========================================================
   Mini Modal
========================================================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave, dark = false }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onSave?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onCancel, onSave]);

  if (!open) return null;

  return createPortal(
    <div className="mi-mini__overlay">
      <div className={["mi-mini__modal", dark ? "mi-modal--dark" : ""].join(" ").trim()} onMouseDown={e => e.stopPropagation()}>
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{title}</h4>
          <button type="button" className="mi-mini__close" onClick={onCancel} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <div className="mi-mini__body">
          <div className="fl-field">
            <input ref={inputRef} className="fl-input" placeholder=" " value={value} onChange={e => onChange?.(e.target.value)} disabled={saving} autoComplete="off" />
            <label className="fl-label">Nombre</label>
          </div>
          <div className="mi-mini__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* =========================================================
   MODAL PRINCIPAL
========================================================= */
export default function ModalNuevaVenta({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH = `${BASE_URL}/api.php?action=ventas_crear_batch`;
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;
  const API_GET_CLIENTE_FISCAL = `${BASE_URL}/api.php?action=cliente_fiscal_get`;
  const API_SAVE_CLIENTE_FISCAL = `${BASE_URL}/api.php?action=cliente_fiscal_upsert`;
  const API_PADRON_CUIT = `${BASE_URL}/api.php?action=padron_cuit&op=padron_cuit`;
  const API_CONFIG_FACTURACION = `${BASE_URL}/api.php?action=config_facturacion_get`;
  const API_VINCULAR_COMPROBANTE = `${BASE_URL}/api.php?action=ventas_comprobantes_vincular_movimiento`;
  const API_VINCULAR_COMPROBANTE_LOTE = `${BASE_URL}/api.php?action=ventas_comprobantes_vincular_movimientos_lote`;
  const API_CHEQUES_GUARDAR = `${BASE_URL}/api.php?action=ventas_cheques_guardar`;

  const showToast = useCallback((tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur), [onToast]);

  const [dark, setDark] = useState(isTemaOscuro);
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update); o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update); if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const p = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = p; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = e => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const [localLists, setLocalLists] = useState(() => ({ ...SAFE_LISTS, ...normalizeLists(lists) }));
  useEffect(() => setLocalLists({ ...SAFE_LISTS, ...normalizeLists(lists) }), [lists]);

  const mediosPagoList = useMemo(() => Array.isArray(localLists.medios_pago) ? localLists.medios_pago : [], [localLists.medios_pago]);
  const tiposVentaList = useMemo(() => Array.isArray(localLists.tipos_venta) ? localLists.tipos_venta : [], [localLists.tipos_venta]);
  const detallesList = useMemo(() => Array.isArray(localLists.detalles) ? localLists.detalles : [], [localLists.detalles]);
  const clientesList = useMemo(() => Array.isArray(localLists.clientes) ? localLists.clientes : [], [localLists.clientes]);

  const [fecha, setFecha] = useState(todayISO);
  const [filters, setFilters] = useState({ id_tipo_venta: NULL_OPTION, id_medio_pago: NULL_OPTION, id_cliente: NULL_OPTION, id_cuenta_corriente: NULL_OPTION });
  const [accionContado, setAccionContado] = useState("guardar");
  const [cliInput, setCliInput] = useState("");
  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [addUI, setAddUI] = useState({ open: false, kind: null, rowId: null, text: "", saving: false });
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalError, setFiscalError] = useState("");
  const [clienteFiscalDb, setClienteFiscalDb] = useState(null);
  const [fiscalCuitInput, setFiscalCuitInput] = useState("");
  const [fiscalLookupLoading, setFiscalLookupLoading] = useState(false);
  const [fiscalArcaData, setFiscalArcaData] = useState(null);
  const [configFacturacion, setConfigFacturacion] = useState(null);
  const [openResumenFactura, setOpenResumenFactura] = useState(false);
  const [resumenFacturaData, setResumenFacturaData] = useState(null);
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);
  const rowsContainerRef = useRef(null);
  const [hasScroll, setHasScroll] = useState(false);

  const [openChequeModal, setOpenChequeModal] = useState(false);
  const [savingCheque, setSavingCheque] = useState(false);
  const [chequeGuardado, setChequeGuardado] = useState(null);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      setFecha(todayISO());
      setFilters({ id_tipo_venta: NULL_OPTION, id_medio_pago: NULL_OPTION, id_cliente: NULL_OPTION, id_cuenta_corriente: NULL_OPTION });
      setAccionContado("guardar");
      setCliInput("");
      setRows([buildEmptyRow()]);
      setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
      setSaving(false);
      setFiscalLoading(false);
      setFiscalError("");
      setClienteFiscalDb(null);
      setFiscalCuitInput("");
      setFiscalLookupLoading(false);
      setFiscalArcaData(null);
      setConfigFacturacion(null);
      setOpenResumenFactura(false);
      setResumenFacturaData(null);
      setOpenChequeModal(false);
      setSavingCheque(false);
      setChequeGuardado(null);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setChequeGuardado(null);
  }, [filters.id_medio_pago]);

  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;
    const checkScroll = () => {
      const scroll = el.scrollHeight > el.clientHeight + 1;
      setHasScroll(scroll);
    };
    checkScroll();
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);
    window.addEventListener("resize", checkScroll);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", checkScroll);
    };
  }, [open, rows]);

  const updateFilter = useCallback((k, v) => setFilters(p => ({ ...p, [k]: v })), []);
  const addRow = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback(id => setRows(p => { const n = p.filter(r => r.id !== id); return n.length ? n : p; }), []);
  const updateRow = useCallback((id, patch) => setRows(p => p.map(r => r.id === id ? { ...r, ...patch } : r)), []);

  const startAddDetalleForRow = useCallback(rowId => { if (saving) return; setAddUI({ open: true, kind: "detalles", rowId, text: "", saving: false }); }, [saving]);
  const startAddCliente = useCallback(() => { if (saving) return; setAddUI({ open: true, kind: "clientes", rowId: null, text: cliInput || "", saving: false }); }, [saving, cliInput]);
  const closeAddMini = useCallback(() => { if (addUI.saving) return; setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false }); }, [addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const nombre = String(addUI.text || "").trim();
    if (!nombre) { showToast("advertencia", "Escribí un nombre antes de guardar.", 2600); return; }
    const kind = addUI.kind; if (!kind) return;
    setAddUI(p => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${kind === "detalles" ? "detalle" : "cliente"}…`, 12000);
    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(API_CATALOGO, { catalogo: kind, nombre, idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear.");
      const item = data?.item || {};
      const newId = kind === "detalles" ? getDetalleId(item) ?? Number(item?.id) : getClienteId(item) ?? Number(item?.id);
      const newNombre = String(item?.nombre ?? "").trim() || nombre;
      if (!Number.isFinite(Number(newId)) || Number(newId) <= 0) throw new Error("El servidor no devolvió un ID válido.");

      setLocalLists(prev => {
        const next = { ...prev };
        const arr = Array.isArray(prev[kind]) ? prev[kind].slice() : [];
        const already = arr.some(x => {
          const xid = kind === "detalles" ? getDetalleId(x) : getClienteId(x);
          return Number(xid) === Number(newId);
        });
        if (!already) arr.push({ id: Number(newId), nombre: newNombre });
        next[kind] = arr;
        return next;
      });

      if (kind === "detalles" && addUI.rowId) updateRow(addUI.rowId, { id_detalle: String(newId), detalleText: newNombre });
      if (kind === "clientes") {
        updateFilter("id_cliente", String(newId));
        setCliInput(newNombre);
        setClienteFiscalDb(null);
        setFiscalArcaData(null);
        setFiscalCuitInput("");
        setFiscalError("");
      }

      setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
      showToast("exito", `${kind === "detalles" ? "Detalle" : "Cliente"} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI(p => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.", 4200);
    }
  }, [API_CATALOGO, addUI, showToast, updateRow, updateFilter]);

  const clienteResolvedFromInput = useMemo(() => resolveClienteByInput(clientesList, cliInput), [clientesList, cliInput]);
  const selectedClienteId = useMemo(() => {
    const d = Number(filters.id_cliente);
    if (Number.isFinite(d) && d > 0) return d;
    return getClienteId(clienteResolvedFromInput) ?? 0;
  }, [filters.id_cliente, clienteResolvedFromInput]);
  const selectedClienteNombre = useMemo(() => clienteResolvedFromInput?.nombre ? String(clienteResolvedFromInput.nombre).trim() : String(cliInput || "").trim(), [clienteResolvedFromInput, cliInput]);

  useEffect(() => {
    if (!open) return;
    const direct = Number(filters.id_cliente);
    const fallbackId = getClienteId(clienteResolvedFromInput);
    if ((!Number.isFinite(direct) || direct <= 0) && fallbackId) {
      setFilters(prev => String(prev.id_cliente) === String(fallbackId) ? prev : { ...prev, id_cliente: String(fallbackId) });
    }
  }, [open, filters.id_cliente, clienteResolvedFromInput]);

  const handleClienteInputChange = useCallback((val) => {
    setCliInput(val);
    setFilters(p => ({ ...p, id_cliente: NULL_OPTION }));
    setClienteFiscalDb(null);
    setFiscalArcaData(null);
    setFiscalCuitInput("");
    setFiscalError("");
  }, []);

  const handleSelectCliente = useCallback((cli) => {
    setCliInput(String(cli?.nombre ?? "").trim());
    setFilters(p => ({ ...p, id_cliente: getClienteId(cli) != null ? String(getClienteId(cli)) : NULL_OPTION }));
    setClienteFiscalDb(null);
    setFiscalArcaData(null);
    setFiscalCuitInput("");
    setFiscalError("");
  }, []);

  /* =========================================================
     CAMBIO IMPORTANTE: detalle + stock 0 => cantidad bloqueada
  ========================================================= */
  const handleSelectDetalle = useCallback((detalle, rowId) => {
    const precio = Number(detalle?.precio || 0);
    const stockDisponible = getStockDisponible(detalle);
    const sinStock = isSinStock(stockDisponible);

    updateRow(rowId, {
      id_detalle: String(getDetalleId(detalle) || ""),
      detalleText: detalle?.nombre || "",
      precio,
      stock_disponible: stockDisponible,
      sinStock,
      cantidad: sinStock ? "" : 1,
    });

    if (sinStock) {
      showToast("advertencia", `El producto "${detalle?.nombre || ""}" no tiene stock disponible.`, 2500);
    }
  }, [updateRow, showToast]);

  const handleCantidadChange = useCallback((rowId, newCantidad) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    if (row.sinStock || isSinStock(row.stock_disponible)) {
      updateRow(rowId, { cantidad: "" });
      return;
    }

    const stockDisponible = row.stock_disponible;
    let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);

    if (typeof cantidadFinal === "number" && cantidadFinal < 0) {
      cantidadFinal = 0;
    }

    if (
      stockDisponible !== null &&
      stockDisponible !== undefined &&
      stockDisponible !== "" &&
      typeof cantidadFinal === "number" &&
      cantidadFinal > Number(stockDisponible)
    ) {
      cantidadFinal = Number(stockDisponible);
      showToast("advertencia", `Stock máximo disponible: ${stockDisponible}`, 2000);
    }

    updateRow(rowId, { cantidad: cantidadFinal });
  }, [rows, updateRow, showToast]);

  const esMedioPagoCheque = useMemo(() => isMedioPagoCheque(mediosPagoList, filters.id_medio_pago), [mediosPagoList, filters.id_medio_pago]);
  const tipoChequeDetectado = useMemo(() => isMedioPagoEcheq(mediosPagoList, filters.id_medio_pago) ? "echeq" : "cheque", [mediosPagoList, filters.id_medio_pago]);

  const guardarChequeEnBackend = useCallback(async (idMovimiento, datosCheque) => {
    if (!datosCheque) return null;

    const fd = new FormData();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("tipo", datosCheque.tipo_cheque || "cheque");
    fd.append("fecha_emision", datosCheque.fecha_emision || todayISO());
    fd.append("emisor", datosCheque.emisor || "");
    fd.append("numero_cheque", datosCheque.numero_cheque || "");
    fd.append("importe", String(datosCheque.importe || 0));
    fd.append("fecha_pago", datosCheque.fecha_pago || todayISO());
    fd.append("observaciones", datosCheque.observaciones || "");

    if (datosCheque.archivo instanceof File) {
      fd.append("archivo", datosCheque.archivo, datosCheque.archivo_nombre || datosCheque.archivo.name || "adjunto");
    }

    const { token, sessionKey } = getAuthInfo();
    const headers = {};
    if (sessionKey) headers["X-Session"] = sessionKey;
    else if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(API_CHEQUES_GUARDAR, {
      method: "POST",
      headers,
      body: fd,
    });

    return await parseJsonOrThrow(res);
  }, [API_CHEQUES_GUARDAR]);

  const handleSaveCheque = useCallback(async (datosCheque) => {
    if (savingCheque) return;

    if (!datosCheque.emisor) { showToast("advertencia", "El emisor es obligatorio.", 3000); return; }
    if (!datosCheque.numero_cheque) { showToast("advertencia", "El número de cheque es obligatorio.", 3000); return; }
    if (!datosCheque.importe || datosCheque.importe <= 0) { showToast("advertencia", "El importe debe ser mayor a 0.", 3000); return; }
    if (!datosCheque.fecha_pago) { showToast("advertencia", "La fecha de pago es obligatoria.", 3000); return; }

    setChequeGuardado(datosCheque);
    setOpenChequeModal(false);
    showToast("exito", `Cheque ${datosCheque.numero_cheque} cargado. Se guardará al confirmar la venta.`, 3200);
  }, [savingCheque, showToast]);

  const rowsCalc = useMemo(() => rows.map(r => {
    const cantidad = Math.max(0, safeNumber(r.cantidad));
    const precio = Math.max(0, safeNumber(r.precio));
    const ivaPct = Math.max(0, safeNumber(r.ivaPct));
    const subtotal = cantidad * precio;
    const ivaMonto = subtotal * (ivaPct / 100);
    const total = subtotal + ivaMonto;
    return { ...r, subtotal, ivaMonto, total };
  }), [rows]);

  const resumen = useMemo(() => ({
    subtotal: rowsCalc.reduce((a, r) => a + (r.subtotal || 0), 0),
    iva: rowsCalc.reduce((a, r) => a + (r.ivaMonto || 0), 0),
    total: rowsCalc.reduce((a, r) => a + (r.total || 0), 0)
  }), [rowsCalc]);

  const tipoVentaSelected = useMemo(() => {
    const id = Number(filters.id_tipo_venta);
    if (!Number.isFinite(id) || id <= 0) return null;
    return tiposVentaList.find(x => Number(x?.id ?? x?.id_tipo_venta ?? 0) === id) || null;
  }, [filters.id_tipo_venta, tiposVentaList]);

  const isContado = useMemo(() => isContadoTipoVenta(tipoVentaSelected), [tipoVentaSelected]);
  const tipoVentaSeleccionado = tipoVentaSelected !== null;
  const shouldNeedFiscalPanel = open && tipoVentaSeleccionado && accionContado === "facturar" && !clienteFiscalDb;

  const fetchClienteFiscal = useCallback(async idCliente => {
    const id = Number(idCliente); if (!Number.isFinite(id) || id <= 0) return null;
    setFiscalLoading(true); setFiscalError(""); setClienteFiscalDb(null); setFiscalArcaData(null);
    try {
      const data = await apiGetJson(`${API_GET_CLIENTE_FISCAL}&id_cliente=${id}`);
      if (data?.existe && data?.cliente_fiscal) {
        const n = normalizeClienteFiscalDb(data.cliente_fiscal);
        setClienteFiscalDb(n);
        setFiscalCuitInput(n.cuit || n.doc_nro || "");
        return n;
      }
      setClienteFiscalDb(null);
      return null;
    } catch (e) {
      setFiscalError(e?.message || "Error consultando datos fiscales.");
      return null;
    } finally {
      setFiscalLoading(false);
    }
  }, [API_GET_CLIENTE_FISCAL]);

  const fetchConfigFacturacion = useCallback(async () => {
    const data = await apiGetJson(API_CONFIG_FACTURACION);
    const cfg = data?.config || data?.data || data || null;
    if (!cfg) throw new Error("No se pudo obtener config de facturación.");
    setConfigFacturacion(cfg);
    return cfg;
  }, [API_CONFIG_FACTURACION]);

  const buscarFiscalEnArcaPorCuit = useCallback(async cuitRaw => {
    const cuit = onlyDigits(cuitRaw);
    setFiscalError("");
    setFiscalArcaData(null);
    if (cuit.length !== 11) throw new Error("Ingresá un CUIT válido de 11 dígitos.");
    setFiscalLookupLoading(true);
    try {
      const data = await apiGetJson(`${API_PADRON_CUIT}&cuit=${cuit}`);
      const summary = data?.data?.summary ?? data?.summary ?? null;
      if (!summary) throw new Error("ARCA no devolvió datos para ese CUIT.");
      const norm = normalizeArcaSummary(summary);
      if (!norm.cuit || !norm.razon_social) throw new Error("ARCA devolvió datos incompletos.");
      setFiscalArcaData(norm);
      return norm;
    } catch (e) {
      setFiscalArcaData(null);
      setFiscalError(e?.message || "Error consultando ARCA.");
      throw e;
    } finally {
      setFiscalLookupLoading(false);
    }
  }, [API_PADRON_CUIT]);

  const guardarClienteFiscal = useCallback(async fiscalSource => {
    if (!selectedClienteId) throw new Error("Seleccioná un cliente antes de facturar.");
    const fiscal = normalizeClienteFiscalDb(fiscalSource || {});
    if (!fiscal.cuit || !fiscal.razon_social) throw new Error("Datos fiscales inválidos.");
    const { idUsuario } = getAuthInfo();
    const saved = await apiPostJson(API_SAVE_CLIENTE_FISCAL, {
      idUsuario,
      id_cliente: selectedClienteId,
      doc_tipo: Number(fiscal.doc_tipo || 80),
      doc_nro: fiscal.doc_nro || fiscal.cuit,
      cuit: fiscal.cuit,
      razon_social: fiscal.razon_social,
      condicion_iva: fiscal.condicion_iva,
      domicilio: fiscal.domicilio,
      origen: fiscal.origen || "arca_cuit",
      activo: 1
    });
    if (!saved?.exito || !saved?.cliente_fiscal) throw new Error(saved?.mensaje || "No se pudieron guardar los datos fiscales.");
    const n = normalizeClienteFiscalDb(saved.cliente_fiscal);
    setClienteFiscalDb(n);
    setFiscalCuitInput(n.cuit || n.doc_nro || "");
    return n;
  }, [API_SAVE_CLIENTE_FISCAL, selectedClienteId]);

  const resolveFiscalForFacturacion = useCallback(async () => {
    if (!selectedClienteId) throw new Error("Seleccioná un cliente antes de facturar.");
    const cuitIngresado = onlyDigits(fiscalCuitInput);
    if (clienteFiscalDb?.id_cliente === selectedClienteId && clienteFiscalDb?.cuit) return clienteFiscalDb;
    const fiscalDb = await fetchClienteFiscal(selectedClienteId); if (fiscalDb?.cuit) return fiscalDb;
    if (cuitIngresado.length !== 11) throw new Error("Este cliente no tiene datos fiscales guardados. Ingresá el CUIT para continuar.");
    const fiscalArca = await buscarFiscalEnArcaPorCuit(cuitIngresado);
    const fiscalGuardado = await guardarClienteFiscal(fiscalArca);
    showToast("exito", "Datos fiscales obtenidos y guardados correctamente.", 2600);
    return fiscalGuardado;
  }, [selectedClienteId, clienteFiscalDb, fiscalCuitInput, fetchClienteFiscal, buscarFiscalEnArcaPorCuit, guardarClienteFiscal, showToast]);

  const validate = useCallback(() => {
    const cliTxt = String(cliInput || "").trim();
    if (!(selectedClienteId > 0 || cliTxt.length > 0)) return { ok: false, msg: "Falta seleccionar un Cliente (obligatorio)." };
    const tv = Number(filters.id_tipo_venta); if (!Number.isFinite(tv) || tv <= 0) return { ok: false, msg: "Falta seleccionar la Forma de venta." };
    if (isContado) {
      const mp = Number(filters.id_medio_pago);
      if (!Number.isFinite(mp) || mp <= 0) return { ok: false, msg: "Venta Contado: falta seleccionar el Medio de pago." };
      if (esMedioPagoCheque && !chequeGuardado) return { ok: false, msg: "El medio de pago es Cheque: cargá el cheque antes de guardar." };
    }
    const periodoApi = fechaToYYYYMM(fecha); if (!/^\d{4}-\d{2}$/.test(periodoApi)) return { ok: false, msg: "La fecha es inválida." };
    const problems = []; rowsCalc.forEach((r, i) => { const p = describeLineProblem(r, i + 1); if (p) problems.push(p); });
    const usable = rowsCalc.filter(r => Number.isFinite(Number(r.id_detalle)) && Number(r.id_detalle) > 0 && Number(r.total || 0) > 0);
    if (!usable.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return { ok: false, msg: "Cargá al menos 1 fila válida (Detalle + Cantidad + Precio)." };
    }
    return { ok: true, warn: problems.length > 0, periodoApi };
  }, [cliInput, selectedClienteId, filters, isContado, fecha, rowsCalc, esMedioPagoCheque, chequeGuardado]);

  const buildResumenFacturaPayload = useCallback((clienteFiscalResuelto, cfg) => {
    const items = rowsCalc
      .filter(r => Number.isFinite(Number(r.id_detalle)) && Number(r.id_detalle) > 0 && Number(r.total || 0) > 0)
      .map((r, i) => ({
        id: r.id,
        codigo: String(i + 1),
        descripcion: safeStr(r.detalleText),
        cantidad: Number(r.cantidad || 0),
        unidad: "u",
        precio_unitario: Number(r.precio || 0),
        precio: Number(r.precio || 0),
        bonif_pct: 0,
        impBonif: 0,
        subtotal: Number(r.subtotal || 0),
        ars: Number(r.total || 0),
        iva_pct: Number(r.ivaPct || 0),
        iva_monto: Number(r.ivaMonto || 0),
        total: Number(r.total || 0)
      }));

    const puntoVenta = Number(String(cfg?.punto_venta || "2").replace(/\D/g, "")) || 2;
    const codigoCbte = Number(String(cfg?.codigo_comprobante || "11").replace(/\D/g, "")) || 11;

    return {
      id_pago: null,
      id_sistema: null,
      labelCliente: selectedClienteNombre || "Cliente",
      labelSistema: "Nueva venta",
      cliente_facturacion: {
        doc_tipo: Number(clienteFiscalResuelto?.doc_tipo || 80),
        doc_nro: safeStr(clienteFiscalResuelto?.doc_nro || clienteFiscalResuelto?.cuit),
        cuit: safeStr(clienteFiscalResuelto?.cuit),
        razon_social: safeStr(clienteFiscalResuelto?.razon_social),
        cond_iva: safeStr(clienteFiscalResuelto?.condicion_iva || clienteFiscalResuelto?.cond_iva),
        condicion_iva: safeStr(clienteFiscalResuelto?.condicion_iva || clienteFiscalResuelto?.cond_iva),
        domicilio: safeStr(clienteFiscalResuelto?.domicilio),
        origen: safeStr(clienteFiscalResuelto?.origen || "arca_cuit")
      },
      id_cliente: selectedClienteId || null,
      id_tipo_venta: Number(filters.id_tipo_venta || 0) || null,
      id_medio_pago: isContado ? Number(filters.id_medio_pago || 0) || null : null,
      id_clasificacion: null,
      fecha_cbte_iso: String(fecha || todayISO()).slice(0, 10),
      vto_pago_iso: plusDaysISOFrom(fecha || todayISO(), 10),
      cbte_tipo: codigoCbte,
      pto_vta: puntoVenta,
      items_facturacion: items,
      total_ars: Number(resumen.total || 0),
      monto: Number(resumen.total || 0),
      importe: Number(resumen.total || 0),
      observaciones: "",
      emisor_nombre: safeStr(cfg?.razon_social || cfg?.nombre_fantasia || "BALTO"),
      emisor_domicilio: safeStr(cfg?.domicilio_comercial),
      cuit_emisor: safeStr(cfg?.cuit),
      cond_iva_emisor: safeStr(cfg?.condicion_iva),
      ingresos_brutos_emisor: safeStr(cfg?.ingresos_brutos),
      fecha_inicio_actividades_emisor: safeStr(cfg?.fecha_inicio_actividades),
      logo_url: safeStr(cfg?.logo_url)
    };
  }, [rowsCalc, selectedClienteNombre, fecha, resumen.total, selectedClienteId, filters, isContado]);

  const guardarVentaBatch = useCallback(async ({ clienteFiscalResuelto = null, accionFinal = "guardar", esFacturadaFinal = false }) => {
    const { idUsuario } = getAuthInfo();
    const periodoApi = fechaToYYYYMM(fecha);
    const payloads = rowsCalc
      .filter(r => Number.isFinite(Number(r.id_detalle)) && Number(r.id_detalle) > 0 && Number(r.total || 0) > 0)
      .map(r => ({
        idUsuario,
        fecha,
        periodo: periodoApi,
        id_cliente: selectedClienteId > 0 ? selectedClienteId : null,
        cliente_nombre: selectedClienteNombre || null,
        id_tipo_venta: Number(filters.id_tipo_venta),
        id_medio_pago: isContado ? Number(filters.id_medio_pago) : null,
        id_cuenta_corriente: null,
        id_detalle: Number(r.id_detalle),
        cantidad: Math.round(Number(r.cantidad) * 100) / 100,
        precio: Math.round(Number(r.precio) * 100) / 100,
        iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
        subtotal: Math.round(Number(r.subtotal) * 100) / 100,
        iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
        total: Math.round(Number(r.total) * 100) / 100,
        monto_total: Math.round(Number(r.total) * 100) / 100,
        accion_venta: accionFinal,
        es_facturada: esFacturadaFinal,
        cliente_fiscal: esFacturadaFinal ? clienteFiscalResuelto : null
      }));
    if (!payloads.length) throw new Error("No hay filas válidas para guardar.");
    const data = await apiPostJson(API_BATCH, payloads);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar el batch de ventas.");
    return { ...data, periodoApi, fecha, cliente_fiscal: clienteFiscalResuelto, cliente_id: selectedClienteId || null, cliente_nombre: selectedClienteNombre, accion_venta: accionFinal, es_facturada: esFacturadaFinal };
  }, [API_BATCH, fecha, rowsCalc, selectedClienteId, selectedClienteNombre, filters, isContado]);

  const subirComprobanteYVincularPrimerMovimiento = useCallback(async ({ idMovimiento, blob, filename, facturaMeta }) => {
    if (!idMovimiento || !blob) throw new Error("Faltan datos para subir el comprobante.");

    const fd = new FormData();
    fd.append("tipo", "FACTURA");
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("pdf", blob instanceof Blob ? blob : new Blob([blob], { type: "application/pdf" }), filename || "factura.pdf");

    const meta = {
      tipo: "FACTURA",
      estado: "emitida",
      emitido_en_arca: 1,
      id_pago: facturaMeta?.id_pago ?? null,
      id_sistema: facturaMeta?.id_sistema ?? null,
      anio: Number(facturaMeta?.anio || 0),
      id_mes: Number(facturaMeta?.id_mes || 0),
      monto_ars: Number(facturaMeta?.imp_total ?? facturaMeta?.importe ?? resumen.total ?? 0),
      doc_tipo: Number(facturaMeta?.doc_tipo ?? resumenFacturaData?.cliente_facturacion?.doc_tipo ?? 80),
      doc_nro: safeStr(facturaMeta?.doc_nro ?? resumenFacturaData?.cliente_facturacion?.doc_nro ?? resumenFacturaData?.cliente_facturacion?.cuit ?? ""),
      cbte_tipo: Number(facturaMeta?.cbte_tipo || resumenFacturaData?.cbte_tipo || 11),
      pto_vta: Number(facturaMeta?.pto_vta || resumenFacturaData?.pto_vta || 2),
      cbte_nro: facturaMeta?.cbte_nro ?? null,
      razon_social: resumenFacturaData?.cliente_facturacion?.razon_social || null,
      cond_iva: resumenFacturaData?.cliente_facturacion?.cond_iva || resumenFacturaData?.cliente_facturacion?.condicion_iva || null,
      domicilio: resumenFacturaData?.cliente_facturacion?.domicilio || null,
      cae: facturaMeta?.cae ?? null,
      cae_vto: facturaMeta?.cae_vto ?? null,
      fecha_cbte: facturaMeta?.fecha_cbte ?? resumenFacturaData?.fecha_cbte_iso ?? null,
      resultado: facturaMeta?.resultado ?? null,
      qr_url: facturaMeta?.qr_url ?? null,
      qr_base64: facturaMeta?.qr_base64 ?? null,
      qr_payload: facturaMeta?.qr_payload ?? null,
      json_arca: facturaMeta?.json_arca ?? facturaMeta?.raw_min ?? facturaMeta ?? null,
      resumen_facturacion: {
        id_pago: resumenFacturaData?.id_pago ?? null,
        id_sistema: resumenFacturaData?.id_sistema ?? null,
        labelCliente: resumenFacturaData?.labelCliente ?? null,
        labelSistema: resumenFacturaData?.labelSistema ?? null,
        cliente_facturacion: resumenFacturaData?.cliente_facturacion ?? null,
        id_cliente: resumenFacturaData?.id_cliente ?? null,
        id_tipo_venta: resumenFacturaData?.id_tipo_venta ?? null,
        id_medio_pago: resumenFacturaData?.id_medio_pago ?? null,
        id_clasificacion: resumenFacturaData?.id_clasificacion ?? null,
        fecha_cbte_iso: resumenFacturaData?.fecha_cbte_iso ?? null,
        vto_pago_iso: resumenFacturaData?.vto_pago_iso ?? null,
        cbte_tipo: resumenFacturaData?.cbte_tipo ?? null,
        pto_vta: resumenFacturaData?.pto_vta ?? null,
        items_facturacion: Array.isArray(resumenFacturaData?.items_facturacion) ? resumenFacturaData.items_facturacion : [],
        total_ars: Number(resumenFacturaData?.total_ars ?? resumen.total ?? 0),
        monto: Number(resumenFacturaData?.monto ?? resumen.total ?? 0),
        importe: Number(resumenFacturaData?.importe ?? resumen.total ?? 0),
        observaciones: resumenFacturaData?.observaciones ?? "",
        emisor_nombre: resumenFacturaData?.emisor_nombre ?? null,
        emisor_domicilio: resumenFacturaData?.emisor_domicilio ?? null,
        cuit_emisor: resumenFacturaData?.cuit_emisor ?? null,
        cond_iva_emisor: resumenFacturaData?.cond_iva_emisor ?? null,
        ingresos_brutos_emisor: resumenFacturaData?.ingresos_brutos_emisor ?? null,
        fecha_inicio_actividades_emisor: resumenFacturaData?.fecha_inicio_actividades_emisor ?? null,
        logo_url: resumenFacturaData?.logo_url ?? null,
      },
      items_facturacion: Array.isArray(resumenFacturaData?.items_facturacion) ? resumenFacturaData.items_facturacion : [],
      total_ars: resumenFacturaData?.total_ars ?? null,
      vto_pago: resumenFacturaData?.vto_pago_iso ?? null,
      observaciones: resumenFacturaData?.observaciones ?? "",
      cliente_facturacion: resumenFacturaData?.cliente_facturacion ?? null,
      emisor: {
        nombre: resumenFacturaData?.emisor_nombre ?? null,
        domicilio: resumenFacturaData?.emisor_domicilio ?? null,
        cuit: resumenFacturaData?.cuit_emisor ?? null,
        condicion_iva: resumenFacturaData?.cond_iva_emisor ?? null,
        ingresos_brutos: resumenFacturaData?.ingresos_brutos_emisor ?? null,
        fecha_inicio_actividades: resumenFacturaData?.fecha_inicio_actividades_emisor ?? null,
        logo_url: resumenFacturaData?.logo_url ?? null,
      },
    };

    fd.append("meta", JSON.stringify(meta));

    const res = await fetch(API_VINCULAR_COMPROBANTE, {
      method: "POST",
      body: fd,
      headers: buildAuthHeaders(false),
    });

    const j = await parseJsonOrThrow(res);
    if (!j?.exito) throw new Error(j?.mensaje || "No se pudo subir el comprobante.");
    return j;
  }, [API_VINCULAR_COMPROBANTE, resumen.total, resumenFacturaData]);

  const vincularComprobanteAMovimientosLote = useCallback(async (idsMovimiento, idComprobante) => {
    if (!idComprobante || !Array.isArray(idsMovimiento) || !idsMovimiento.length) return;
    const data = await apiPostJson(API_VINCULAR_COMPROBANTE_LOTE, {
      id_comprobante: Number(idComprobante),
      ids_movimiento: idsMovimiento.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0),
      force: false
    });
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo vincular el comprobante al lote.");
    return data;
  }, [API_VINCULAR_COMPROBANTE_LOTE]);

  const abrirResumenFactura = useCallback(async () => {
    const v = validate();
    if (!v.ok) { showToast("advertencia", v.msg || "Faltan datos.", 4200); return; }
    if (v.warn) showToast("advertencia", "Hay filas incompletas: se mostrarán solo las válidas.", 3200);
    setSaving(true);
    try {
      const cf = await resolveFiscalForFacturacion();
      const cfg = configFacturacion || (await fetchConfigFacturacion());
      setResumenFacturaData(buildResumenFacturaPayload(cf, cfg));
      setOpenResumenFactura(true);
    } catch (e) {
      showToast("error", e?.message || "No se pudo preparar la factura.", 4500);
    } finally {
      setSaving(false);
    }
  }, [validate, showToast, resolveFiscalForFacturacion, configFacturacion, fetchConfigFacturacion, buildResumenFacturaPayload]);

  const finalizarFacturacionYGuardarVenta = useCallback(async (factEmitida) => {
    try {
      setSaving(true);

      const cf = normalizeClienteFiscalDb(resumenFacturaData?.cliente_facturacion || clienteFiscalDb || fiscalArcaData || {});

      const info = await guardarVentaBatch({
        clienteFiscalResuelto: cf,
        accionFinal: "facturar",
        esFacturadaFinal: true,
      });

      const idsOk = (
        Array.isArray(info?.ids ?? info?.ids_movimiento ?? info?.ids_movimientos ?? [])
          ? (info?.ids ?? info?.ids_movimiento ?? info?.ids_movimientos ?? [])
          : (info?.id_movimiento ? [info.id_movimiento] : [])
      )
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0);

      if (!idsOk.length) throw new Error("La venta se emitió pero no se devolvieron movimientos para vincular la factura.");
      if (!factEmitida?.pdf_blob) throw new Error("La venta se emitió pero no se recibió el PDF para guardarlo.");

      const subida = await subirComprobanteYVincularPrimerMovimiento({
        idMovimiento: idsOk[0],
        blob: factEmitida.pdf_blob,
        filename: factEmitida.pdf_filename || "factura.pdf",
        facturaMeta: factEmitida,
      });

      const idComprobante = Number(subida?.id_comprobante ?? subida?.comprobante?.id_comprobante ?? 0) || null;
      if (!idComprobante) throw new Error("El backend no devolvió un id_comprobante válido al subir la factura.");

      const restoIds = idsOk.slice(1);
      if (restoIds.length > 0) await vincularComprobanteAMovimientosLote(restoIds, idComprobante);

      if (esMedioPagoCheque && chequeGuardado && idsOk[0]) {
        try {
          await guardarChequeEnBackend(idsOk[0], chequeGuardado);
        } catch (eCheque) {
          showToast("advertencia", `Venta facturada, pero no se pudo guardar el cheque: ${eCheque?.message}`, 5000);
        }
      }

      setOpenResumenFactura(false);
      setResumenFacturaData(null);

      showToast("exito", "Venta agregada correctamente.", 3000);

      onSaved?.({
        ...info,
        factura_emitida: factEmitida || null,
        id_comprobante: idComprobante,
      });
    } catch (e) {
      showToast("error", e?.message || "La factura se emitió pero no se pudo guardar la venta.", 5200);
    } finally {
      setSaving(false);
    }
  }, [
    showToast,
    guardarVentaBatch,
    resumenFacturaData,
    clienteFiscalDb,
    fiscalArcaData,
    onSaved,
    subirComprobanteYVincularPrimerMovimiento,
    vincularComprobanteAMovimientosLote,
    esMedioPagoCheque,
    chequeGuardado,
    guardarChequeEnBackend,
  ]);

  const submit = useCallback(async () => {
    if (saving) return;
    const { sessionKey } = getAuthInfo();
    if (!sessionKey) { showToast("error", "No hay sesión activa (Falta X-Session).", 5200); return; }
    if (addUI.open) { showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.", 3200); return; }
    const v = validate();
    if (!v.ok) { showToast("advertencia", v.msg || "Faltan datos.", 4200); return; }
    if (tipoVentaSeleccionado && accionContado === "facturar") { await abrirResumenFactura(); return; }
    setSaving(true);
    if (v.warn) showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    try {
      const info = await guardarVentaBatch({ clienteFiscalResuelto: null, accionFinal: "guardar", esFacturadaFinal: false });

      if (esMedioPagoCheque && chequeGuardado) {
        const idsOk = (
          Array.isArray(info?.ids ?? info?.ids_movimiento ?? info?.ids_movimientos ?? [])
            ? (info?.ids ?? info?.ids_movimiento ?? info?.ids_movimientos ?? [])
            : (info?.id_movimiento ? [info.id_movimiento] : [])
        ).map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0);

        if (idsOk.length > 0) {
          try {
            await guardarChequeEnBackend(idsOk[0], chequeGuardado);
          } catch (eCheque) {
            showToast("advertencia", `Venta guardada, pero no se pudo guardar el cheque: ${eCheque?.message}`, 5000);
          }
        }
      }

      showToast("exito", "Venta agregada correctamente.", 3000);
      onSaved?.(info);
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
    } finally {
      setSaving(false);
    }
  }, [saving, addUI.open, validate, showToast, tipoVentaSeleccionado, accionContado, guardarVentaBatch, onSaved, abrirResumenFactura, esMedioPagoCheque, chequeGuardado, guardarChequeEnBackend]);

  const onClickFacturar = useCallback(async () => {
    setAccionContado("facturar");
    setFiscalError("");
    if (!selectedClienteId) { showToast("advertencia", "Seleccioná un cliente antes de facturar.", 3200); return; }
    try {
      setSaving(true);
      const fiscal = clienteFiscalDb || (await fetchClienteFiscal(selectedClienteId));
      if (fiscal?.cuit) { await abrirResumenFactura(); return; }
      if (onlyDigits(fiscalCuitInput).length === 11) { await abrirResumenFactura(); return; }
      showToast("advertencia", "Este cliente no tiene datos fiscales guardados. Ingresá el CUIT y presioná Facturar nuevamente.", 4200);
    } catch (e) {
      showToast("error", e?.message || "No se pudo iniciar la facturación.", 4200);
    } finally {
      setSaving(false);
    }
  }, [selectedClienteId, clienteFiscalDb, fiscalCuitInput, fetchClienteFiscal, abrirResumenFactura, showToast]);

  if (!open) return null;

  const btnLabel = saving ? "Procesando..." : accionContado === "facturar" ? "Facturar venta" : "Guardar venta";

  return createPortal(
    <>
      <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
        <div
          className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""].join(" ").trim()}
          role="dialog"
          aria-modal="true"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Nueva Venta</h2>
            </div>
            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => (!saving ? onClose?.() : null)}
              aria-label="Cerrar"
              disabled={saving}
              type="button"
            >✕</button>
          </div>

          <div className="mi-modal__content">
            <div className="mi-cr-grid">
              <section className="mi-cr-table">
                <div className="mi-cr-table__head">
                  <div style={{ paddingLeft: 10 }}>Detalle</div>
                  <div>Cant.</div>
                  <div className="right">Precio</div>
                  <div>IVA %</div>
                  <div className="right">IVA $</div>
                  <div className="right">Total</div>
                  <div />
                </div>

                <div ref={rowsContainerRef} className={`mi-cr-table__rows ${hasScroll ? "has-scroll" : ""}`}>
                  {rowsCalc.map(r => {
                    const stockNum = r.stock_disponible !== null && r.stock_disponible !== undefined ? Number(r.stock_disponible) : null;
                    const rowSinStock = r.sinStock || isSinStock(stockNum);

                    return (
                      <div key={r.id} className={`mi-cr-row ${rowSinStock ? "mi-cr-row--sin-stock" : ""}`}>
                        <div className="mi-cr-cell mi-cr-cell--detalle">
                          <GlobalAutocomplete
                            value={r.detalleText}
                            onChange={(val) =>
                              updateRow(r.id, {
                                detalleText: val,
                                id_detalle: NULL_OPTION,
                                stock_disponible: null,
                                sinStock: false,
                              })
                            }
                            onSelect={(d) => handleSelectDetalle(d, r.id)}
                            options={detallesList}
                            getOptionLabel={(d) => String(d?.nombre ?? "").trim()}
                            getOptionValue={(d) => String(getDetalleId(d) ?? d?.nombre ?? "")}
                            placeholder="Escribí o buscá un detalle…"
                            disabled={saving || addUI.open}
                            showAllOnFocus={false}
                            maxItems={18}
                            inputClassName="nv-cell-input"
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center stock_cant">
                          <input
                            className="nv-cell-input nv-cell-input--center"
                            type="number"
                            min={rowSinStock ? undefined : "1"}
                            step="1"
                            value={rowSinStock ? "" : r.cantidad}
                            onChange={e => handleCantidadChange(r.id, e.target.value === "" ? "" : Number(e.target.value))}
                            disabled={saving || rowSinStock}
                            placeholder={rowSinStock ? "0" : ""}
                            title={rowSinStock ? "No podés ingresar cantidad porque el stock es 0" : ""}
                            style={{
                              width: "100%",
                              background: rowSinStock ? "#f3f4f6" : undefined,
                              color: rowSinStock ? "#b91c1c" : undefined,
                              borderColor: rowSinStock ? "#fca5a5" : undefined,
                              cursor: rowSinStock ? "not-allowed" : undefined,
                              opacity: rowSinStock ? 0.9 : 1,
                            }}
                          />

                          {r.stock_disponible !== null && r.stock_disponible !== undefined && (
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: rowSinStock ? 700 : 500,
                                color: rowSinStock ? "#b91c1c" : "#666",
                              }}
                            >
                              {rowSinStock ? "Sin stock" : `Stock: ${r.stock_disponible}`}
                            </div>
                          )}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <input
                            className="nv-cell-input nv-cell-input--right"
                            type="text"
                            inputMode="decimal"
                            value={r.precioFocused ? (r.precioDraft ?? "") : formatMoneyInputARS(r.precio)}
                            onFocus={(e) => {
                              updateRow(r.id, {
                                precioFocused: true,
                                precioDraft: formatEditableMoney(r.precio),
                              });
                              setTimeout(() => e.target.select(), 0);
                            }}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const cleaned = raw.replace(/[^\d,.\-]/g, "");
                              updateRow(r.id, {
                                precioDraft: cleaned,
                                precio: parseMoneyInputARS(cleaned),
                              });
                            }}
                            onBlur={() => {
                              const parsed = parseMoneyInputARS(r.precioDraft);
                              updateRow(r.id, {
                                precio: parsed,
                                precioDraft: "",
                                precioFocused: false,
                              });
                            }}
                            placeholder="$ 0,00"
                            disabled={saving}
                            style={{ width: "100%", padding: "0" }}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <select
                            className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                            value={String(r.ivaPct)}
                            onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
onKeyDown={(e) => {
  if (
    e.key === "ArrowUp" ||
    e.key === "ArrowDown" ||
    e.key === "ArrowLeft" ||
    e.key === "ArrowRight"
  ) {
    e.preventDefault();
  }
}}
                            disabled={saving}
                            style={{ width: "100%" }}
                          >
                            {IVA_OPTIONS.map((x) => (
                              <option key={x.value} value={x.value}>{x.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                          {moneyARS(r.ivaMonto)}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                          {moneyARS(r.total)}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                          <button
                            type="button"
                            className="mi-cr-del"
                            onClick={() => removeRow(r.id)}
                            disabled={saving}
                            title="Eliminar fila"
                          >×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mi-cr-table__foot">
                  <div className="mi-cr-foot-actions">
                    <button type="button" className="nv-foot-btn" onClick={addRow} disabled={saving}>
                      <span className="nv-foot-btn__icon">+</span>
                      Agregar fila
                    </button>

                    <div className="nv-foot-sep" />

                    <button
                      type="button"
                      className="nv-foot-btn"
                      disabled={saving || addUI.saving}
                      onClick={() => {
                        const lastRow = rows[rows.length - 1];
                        startAddDetalleForRow(lastRow?.id);
                      }}
                    >
                      <span className="nv-foot-btn__icon">✦</span>
                      Nuevo detalle
                    </button>
                  </div>

                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                      <span>Subtotal</span>
                      <b>{moneyARS(resumen.subtotal)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                      <span>IVA</span>
                      <b>{moneyARS(resumen.iva)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--total">
                      <span>Total</span>
                      <b>{moneyARS(resumen.total)}</b>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="mi-cr-filters">
                <div className="mi-cr-filters__top">
                  <div className="mi-cr-filters__title">Datos de venta</div>

                  <div className="mi-cr-filters__dates">
                    <div
                      className="fl-field fl-col-full mi-date-field"
                      onClick={() => {
                        if (saving) return;
                        const el = document.getElementById("nv-fecha-input");
                        if (!el) return;
                        if (typeof el.showPicker === "function") el.showPicker();
                        else { el.focus(); el.click(); }
                      }}
                    >
                      <input
                        id="nv-fecha-input"
                        className="fl-input"
                        type="date"
                        placeholder=" "
                        value={fecha}
                        onChange={e => setFecha(String(e.target.value || "").trim())}
                        disabled={saving}
                      />
                      <label className="fl-label">Fecha</label>
                    </div>
                  </div>
                </div>

                <div className="mi-cr-filters__body">
                  <div className="fl-field mi-cr-rel">
                    <GlobalAutocomplete
                      value={cliInput}
                      onChange={handleClienteInputChange}
                      onSelect={handleSelectCliente}
                      options={clientesList}
                      getOptionLabel={(c) => String(c?.nombre ?? "").trim()}
                      getOptionValue={(c) => String(getClienteId(c) ?? c?.nombre ?? "")}
                      label="Cliente *"
                      placeholder=" "
                      disabled={saving || addUI.open}
                      showAllOnFocus={true}
                      maxItems={25}
                      inputClassName="fl-input"
                    />

                    <button
                      type="button"
                      className="mi-cr-link"
                      onClick={startAddCliente}
                      disabled={saving || addUI.saving}
                      style={{
                        fontSize: "11px",
                        color: "#0f766e",
                        background: "none",
                        border: "none",
                        padding: "4px 0 0",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      + Agregar nuevo cliente
                    </button>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_tipo_venta)}
                      onChange={e => updateFilter("id_tipo_venta", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Seleccionar...</option>
                      {tiposVentaList.map(x => (
                        <option key={x.id ?? x.id_tipo_venta} value={String(x.id ?? x.id_tipo_venta)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Forma de venta *</label>
                  </div>

                  {isContado && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(filters.id_medio_pago)}
                        onChange={e => updateFilter("id_medio_pago", e.target.value)}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Seleccionar medio</option>
                        {mediosPagoList.map(x => (
                          <option key={x.id ?? x.id_medio_pago} value={String(x.id ?? x.id_medio_pago)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Medio de pago *</label>
                    </div>
                  )}

                  {isContado && esMedioPagoCheque && (
                    <div className="mi-card mi-card--full" style={{ marginTop: 4 }}>
                      <div className="mi-card__title">
                        {tipoChequeDetectado === "echeq" ? "Echeq" : "Cheque"}
                      </div>

                      {chequeGuardado ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div
                            style={{
                              background: "rgba(16,185,129,.08)",
                              border: "1px solid rgba(16,185,129,.25)",
                              borderRadius: 8,
                              padding: "8px 10px",
                              fontSize: 12,
                              lineHeight: 1.6,
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#059669", marginBottom: 2 }}>✓ Cheque cargado</div>
                            <div><b>N°:</b> {chequeGuardado.numero_cheque}</div>
                            <div><b>Emisor:</b> {chequeGuardado.emisor}</div>
                            <div><b>Importe:</b> {moneyARS(chequeGuardado.importe)}</div>
                            <div><b>Fecha pago:</b> {chequeGuardado.fecha_pago}</div>
                            {chequeGuardado.archivo_nombre && <div><b>Archivo:</b> {chequeGuardado.archivo_nombre}</div>}
                          </div>
                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost"
                            style={{ width: "100%", fontSize: 12 }}
                            onClick={() => setOpenChequeModal(true)}
                            disabled={saving}
                          >
                            Editar cheque
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="mit-btn mit-btn--solid"
                          style={{ width: "100%", marginTop: 4 }}
                          onClick={() => setOpenChequeModal(true)}
                          disabled={saving}
                        >
                          Cargar {tipoChequeDetectado === "echeq" ? "echeq" : "cheque"}
                        </button>
                      )}
                    </div>
                  )}

                  {tipoVentaSeleccionado && (
                    <div className="mi-card mi-card--full">
                      <div className="mi-card__title">Facturación</div>

                      <div className="mi-card__actionsRow">
                        <button
                          type="button"
                          disabled={saving}
                          className={`mit-btn ${accionContado === "guardar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                          onClick={() => setAccionContado("guardar")}
                        >Guardar</button>
                        <button
                          type="button"
                          disabled={saving}
                          className={`mit-btn ${accionContado === "facturar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                          onClick={onClickFacturar}
                        >
                          {saving && accionContado === "facturar" ? "Procesando..." : "Facturar"}
                        </button>
                      </div>

                      <div className="mi-card__hint">
                        {accionContado === "guardar"
                          ? <><b>Guardar</b>: queda <b>pendiente</b>.</>
                          : clienteFiscalDb
                            ? <>* Datos fiscales encontrados. Presioná <b>Facturar</b> para continuar.</>
                            : <>* Si el cliente no tiene datos fiscales, ingresá el <b>CUIT</b> abajo.</>
                        }
                      </div>

                      {shouldNeedFiscalPanel && (
                        <div>
                          {!selectedClienteId ? (
                            <div className="mi-card__hint">Seleccioná primero un cliente del listado.</div>
                          ) : fiscalLoading ? (
                            <div className="mi-card__hint">Consultando datos fiscales…</div>
                          ) : !clienteFiscalDb ? (
                            <>
                              <div className="fl-field Margen-top">
                                <input
                                  className="fl-input"
                                  placeholder=" "
                                  value={fiscalCuitInput}
                                  onChange={e => {
                                    setFiscalCuitInput(onlyDigits(e.target.value));
                                    setFiscalArcaData(null);
                                    setFiscalError("");
                                  }}
                                  inputMode="numeric"
                                  disabled={saving || fiscalLookupLoading}
                                  maxLength={11}
                                />
                                <label className="fl-label">CUIT *</label>
                              </div>

                              {fiscalArcaData && (
                                <div className="arca-alert arca-alert--info" style={{ marginTop: 8 }}>
                                  <div className="arca-alert__title">Datos encontrados</div>
                                  <div className="arca-resumen">
                                    <div className="arca-row"><b>CUIT:</b><span>{fiscalArcaData.cuit || "—"}</span></div>
                                    <div className="arca-row"><b>IVA:</b><span>{fiscalArcaData.condicion_iva || "—"}</span></div>
                                    <div className="arca-row arca-row--full"><b>Razón social:</b><span>{fiscalArcaData.razon_social || "—"}</span></div>
                                    <div className="arca-row arca-row--full"><b>Domicilio:</b><span>{fiscalArcaData.domicilio || "—"}</span></div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : null}
                          {fiscalError && (
                            <div className="arca-alert arca-alert--error" style={{ marginTop: 8 }}>
                              {fiscalError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mi-cr-filters__actions">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={saving}
                      className="mit-btn mit-btn--solid mit-btn--block"
                    >
                      {btnLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => (!saving ? onClose?.() : null)}
                      disabled={saving}
                      className="mit-btn mit-btn--ghost mit-btn--block"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </div>

          <AddCatalogMiniModal
            open={addUI.open}
            title={addUI.kind === "clientes" ? "Nuevo cliente" : "Nuevo detalle"}
            value={addUI.text}
            saving={addUI.saving}
            onChange={txt => setAddUI(p => ({ ...p, text: txt }))}
            onCancel={closeAddMini}
            onSave={guardarNuevoCatalogo}
            dark={dark}
          />
        </div>
      </div>

      {openChequeModal && (
        <ModalNuevoCheque
          open={openChequeModal}
          onClose={() => setOpenChequeModal(false)}
          onSave={handleSaveCheque}
          initialData={chequeGuardado ? {
            fecha_emision: chequeGuardado.fecha_emision,
            emisor: chequeGuardado.emisor,
            numero_cheque: chequeGuardado.numero_cheque,
            importe: chequeGuardado.importe,
            fecha_pago: chequeGuardado.fecha_pago,
            observaciones: chequeGuardado.observaciones,
            archivo: chequeGuardado.archivo,
            archivo_nombre: chequeGuardado.archivo_nombre,
          } : undefined}
          tipoCheque={tipoChequeDetectado}
          dark={dark}
          saving={savingCheque}
        />
      )}

      {openResumenFactura && resumenFacturaData && (
        <ModalFacturaBaltoResumen
          open={openResumenFactura}
          onClose={() => setOpenResumenFactura(false)}
          onBack={() => setOpenResumenFactura(false)}
          onCloseAll={() => setOpenResumenFactura(false)}
          apiBase={`${BASE_URL}/api.php`}
          action="movimientos"
          data={resumenFacturaData}
          docTipo={Number(resumenFacturaData?.cliente_facturacion?.doc_tipo || 80)}
          docNro={safeStr(resumenFacturaData?.cliente_facturacion?.doc_nro || resumenFacturaData?.cliente_facturacion?.cuit)}
          cbteTipo={Number(resumenFacturaData?.cbte_tipo || 11)}
          ptoVta={String(resumenFacturaData?.pto_vta || 2)}
          onFacturada={async fact => await finalizarFacturacionYGuardarVenta(fact)}
          onDone={async fact => await finalizarFacturacionYGuardarVenta(fact)}
          forceTestAmount={false}
          testAmount={null}
          skipMovimientoAutocreacion={true}
        />
      )}
    </>,
    document.body
  );
}