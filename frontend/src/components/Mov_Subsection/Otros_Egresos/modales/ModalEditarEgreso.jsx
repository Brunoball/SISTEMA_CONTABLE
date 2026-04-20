import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config.jsx";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";
import "./ModalNuevoEgreso_extra.css";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faEye,
  faTrash,
  faUpload,
  faUndo,
  faPenToSquare,
} from "@fortawesome/free-solid-svg-icons";

/* ─── IVA options ─── */
const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

/* ─── Pure helpers ─── */
function safeNumber(v) {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}
function round3(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 1000) / 1000;
}
function safeText(v) {
  return String(v ?? "").trim();
}
function normalizeName(v) {
  return String(v ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function moneyARS(v) {
  try {
    return Number(v || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${Number(v || 0).toFixed(2)}`;
  }
}
function getDetalleId(d) {
  const c =
    d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ??
    d?.id_categoria_egreso ?? d?.idCategoriaEgreso ?? d?.id_stock_producto ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function optionLabel(x) {
  return String(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? "").trim();
}
function getStockDisponible(d) {
  const c = d?.stock ?? d?.stock_disponible ?? d?.stockDisponible ?? d?.cantidad_stock ?? d?.cantidad ?? null;
  if (c === null || c === undefined || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}
function isSinStock(s) {
  return s !== null && s !== undefined && Number(s) <= 0;
}
function calcItemTotals(cantidad, precio, ivaPct) {
  const c = Math.max(0, safeNumber(cantidad));
  const p = Math.max(0, safeNumber(precio));
  const iva = Math.max(0, safeNumber(ivaPct));
  const subtotal = c * p;
  const iva_monto = subtotal * (iva / 100);
  const total = subtotal + iva_monto;
  return {
    subtotal: round2(subtotal),
    iva_monto: round2(iva_monto),
    total: round2(total),
  };
}
function normalizeDetalles(lists) {
  const raw = Array.isArray(lists?.detalles) ? lists.detalles : [];
  return raw.map((x) => ({
    id: Number(x?.id ?? x?.id_detalle ?? 0),
    nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? "").trim(),
  }));
}
function normalizeMediosPago(lists) {
  const raw = Array.isArray(lists?.medios_pago)
    ? lists.medios_pago
    : Array.isArray(lists?.mediosPago)
      ? lists.mediosPago
      : [];
  return raw.map((x) => ({
    id: Number(x?.id ?? x?.id_medio_pago ?? 0),
    nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? "").trim(),
  }));
}
function normalizeClasificaciones(lists) {
  const raw = Array.isArray(lists?.clasificaciones)
    ? lists.clasificaciones
    : Array.isArray(lists?.clasificacion)
      ? lists.clasificacion
      : [];
  return raw.map((x) => ({
    id: Number(x?.id ?? x?.id_clasificacion ?? 0),
    nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? "").trim(),
  }));
}
function resolveCostoFijoConfig(clasificaciones = []) {
  const arr = Array.isArray(clasificaciones) ? clasificaciones : [];
  const fijo =
    arr.find((x) => normalizeName(x?.nombre) === "COSTO FIJO") ||
    arr.find((x) => normalizeName(x?.nombre).includes("COSTO FIJO")) ||
    null;
  const noFijo =
    arr.find(
      (x) =>
        x.id !== fijo?.id &&
        (normalizeName(x?.nombre) === "COSTO VARIABLE" ||
          normalizeName(x?.nombre).includes("VARIABLE") ||
          normalizeName(x?.nombre).includes("NO ES COSTO FIJO"))
    ) ||
    arr.find((x) => x.id !== fijo?.id) ||
    null;
  return {
    idCostoFijo: String(Number(fijo?.id ?? 1) || 1),
    idNoCostoFijo: String(Number(noFijo?.id ?? 2) || 2),
    labelCostoFijo: "Costo fijo",
    labelNoCostoFijo: "No es costo fijo",
  };
}
function normalizeChequeData(src = {}) {
  const cheque = src?.cheque && typeof src.cheque === "object" ? src.cheque : src;
  return {
    id_cheque: Number(cheque?.id_cheque ?? cheque?.cheque_id ?? src?.id_cheque ?? src?.cheque_id ?? 0) || 0,
    tipo: String(cheque?.tipo ?? cheque?.cheque_tipo ?? src?.cheque_tipo ?? "").trim().toLowerCase(),
    fecha_emision: String(cheque?.fecha_emision ?? cheque?.cheque_fecha_emision ?? src?.cheque_fecha_emision ?? "").slice(0, 10),
    emisor: String(cheque?.emisor ?? cheque?.cheque_emisor ?? src?.cheque_emisor ?? "").trim(),
    numero_cheque: String(cheque?.numero_cheque ?? cheque?.cheque_numero ?? src?.cheque_numero ?? "").trim(),
    importe: round2(safeNumber(cheque?.importe ?? cheque?.cheque_importe ?? src?.cheque_importe ?? src?.monto_total ?? 0)),
    fecha_pago: String(cheque?.fecha_pago ?? cheque?.cheque_fecha_pago ?? src?.cheque_fecha_pago ?? "").slice(0, 10),
  };
}
function makeItem(it = {}) {
  const cantidad = round3(it?.cantidad ?? 1);
  const precio = round2(it?.precio ?? it?.total ?? 0);
  const iva_pct = round2(it?.iva_pct ?? 0);
  const calc = calcItemTotals(cantidad, precio, iva_pct);
  return {
    uid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    id_detalle: String(Number(it?.id_detalle ?? 0) || ""),
    detalle: String(it?.detalle ?? it?.descripcion ?? it?.concepto ?? it?.detalle_nombre ?? "").trim(),
    cantidad,
    precio,
    precioDraft: "",
    precioFocused: false,
    iva_pct,
    stock_disponible: null,
    sinStock: false,
    subtotal: round2(it?.subtotal ?? calc.subtotal),
    iva_monto: round2(it?.iva_monto ?? calc.iva_monto),
    total: round2(it?.total ?? calc.total),
  };
}
function buildInitialState(data, clasificaciones = []) {
  const src = data && typeof data === "object" ? data : {};
  const cheque = normalizeChequeData(src);
  const esMovimientoCheque = cheque.id_cheque > 0;
  const rawItems = Array.isArray(src.items) && src.items.length ? src.items : [src];
  const items = rawItems
    .map((it) => makeItem(it))
    .filter((it) => Number(it.cantidad) > 0 && (Number(it.precio) > 0 || Number(it.total) > 0));
  const { idCostoFijo } = resolveCostoFijoConfig(clasificaciones);
  const idClasifActual = String(Number(src?.id_clasificacion ?? src?.clasificacion_id ?? 0) || "");
  const esCostoFijoInicial =
    !!src?.es_costo_fijo || (!!idClasifActual && idClasifActual === String(idCostoFijo));
  return {
    id_movimiento: Number(src?.id_movimiento ?? src?.id ?? 0) || 0,
    fecha: String(src?.fecha ?? "").slice(0, 10),
    id_medio_pago: String(Number(src?.id_medio_pago ?? 0) || ""),
    id_clasificacion: esCostoFijoInicial ? String(idCostoFijo) : "",
    es_costo_fijo: esCostoFijoInicial,
    es_movimiento_cheque: esMovimientoCheque,
    cheque,
    items: items.length
      ? items
      : [makeItem({ cantidad: 1, precio: Number(src?.monto_total ?? 0) || 0 })],
  };
}
function sumTotalItems(items) {
  return round2(
    (Array.isArray(items) ? items : []).reduce((acc, it) => acc + safeNumber(it?.total), 0)
  );
}
function getAuthInfo() {
  const token = safeText(localStorage.getItem("token"));
  const sessionKey =
    safeText(localStorage.getItem("session_key")) ||
    safeText(localStorage.getItem("sessionKey")) ||
    safeText(localStorage.getItem("X-Session")) ||
    safeText(localStorage.getItem("x_session"));
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, sessionKey, idUsuario };
}
function buildHeadersGET() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function buildHeadersJSON() {
  const { token, sessionKey } = getAuthInfo();
  const h = { "Content-Type": "application/json" };
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function buildHeadersFormData() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}. ${text.slice(0, 300)}`);
  }
}
function getComprobanteDownloadUrl(idMovimiento) {
  return `${BASE_URL}/api.php?action=otros_egresos_comprobantes_descargar&id_movimiento=${Number(idMovimiento || 0)}`;
}
function fileAcceptText() {
  return ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt,.zip";
}

/* ─────────────────────────────────────────
   CHEQUE TABLE — estética de tabla
───────────────────────────────────────── */
function ChequeFields({ cheque, saving, onUpdate }) {
  const fechaEmisionRef = useRef(null);
  const fechaPagoRef = useRef(null);

  const openPicker = useCallback((ref) => {
    const el = ref?.current;
    if (!el || saving || el.disabled) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  }, [saving]);

  const tipoActual =
    cheque?.tipo === "echeq"
      ? "ECHEQ"
      : cheque?.tipo === "cheque"
        ? "CHEQUE"
        : "";

  return (
    <div className="mi-cr-table__rows" style={{ overflowX: "auto", overflowY: "hidden" }}>
      <div
        className="mi-cr-table__head mi-cr-table__head--cheque"
        style={{
          display: "grid",
          gridTemplateColumns: "110px 120px 1.2fr 1.2fr 150px 150px 140px",
        }}
      >
        <div>ID</div>
        <div>Tipo</div>
        <div>Emisor</div>
        <div>N° cheque</div>
        <div>F. emisión</div>
        <div>F. pago</div>
        <div className="right">Importe</div>
      </div>

      <div
        className="mi-cr-row mi-cr-row--cheque"
        style={{
          display: "grid",
          gridTemplateColumns: "110px 120px 1.2fr 1.2fr 150px 150px 140px",
        }}
      >
        <div className="mi-cr-cell">
          <input
            className="nv-cell-input"
            value={String(cheque?.id_cheque || "")}
            disabled
          />
        </div>

        <div className="mi-cr-cell">
          <input
            className="nv-cell-input"
            value={tipoActual}
            disabled
          />
        </div>

        <div className="mi-cr-cell">
          <input
            className="nv-cell-input"
            type="text"
            value={cheque?.emisor || ""}
            onChange={(e) => onUpdate("emisor", e.target.value)}
            disabled={saving}
            placeholder="Emisor"
          />
        </div>

        <div className="mi-cr-cell">
          <input
            className="nv-cell-input"
            type="text"
            value={cheque?.numero_cheque || ""}
            onChange={(e) => onUpdate("numero_cheque", e.target.value)}
            disabled={saving}
            placeholder="Número"
          />
        </div>

        <div
          className="mi-cr-cell"
          onClick={() => openPicker(fechaEmisionRef)}
          style={{ cursor: saving ? "not-allowed" : "pointer" }}
        >
          <input
            ref={fechaEmisionRef}
            className="nv-cell-input"
            type="date"
            value={cheque?.fecha_emision || ""}
            onChange={(e) => onUpdate("fecha_emision", e.target.value)}
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              openPicker(fechaEmisionRef);
            }}
          />
        </div>

        <div
          className="mi-cr-cell"
          onClick={() => openPicker(fechaPagoRef)}
          style={{ cursor: saving ? "not-allowed" : "pointer" }}
        >
          <input
            ref={fechaPagoRef}
            className="nv-cell-input"
            type="date"
            value={cheque?.fecha_pago || ""}
            onChange={(e) => onUpdate("fecha_pago", e.target.value)}
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              openPicker(fechaPagoRef);
            }}
          />
        </div>

        <div className="mi-cr-cell mi-cr-cell--right">
          <input
            className="nv-cell-input nv-cell-input--right"
            type="number"
            min="0"
            step="0.01"
            value={cheque?.importe ?? 0}
            onChange={(e) => onUpdate("importe", e.target.value)}
            disabled={saving}
            placeholder="0,00"
          />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   COMPONENTE PRINCIPAL
───────────────────────────────────────── */
export default function ModalEditarEgreso({
  open,
  initialData,
  lists,
  onClose,
  onToast,
  onSubmit,
  onSaved,
}) {
  const API = `${BASE_URL}/api.php`;
  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [saving, setSaving] = useState(false);
  const [loadingComprobante, setLoadingComprobante] = useState(false);

  const clasificaciones = useMemo(() => normalizeClasificaciones(lists), [lists]);
  const clasificacionConfig = useMemo(() => resolveCostoFijoConfig(clasificaciones), [clasificaciones]);
  const detalles = useMemo(() => normalizeDetalles(lists), [lists]);
  const mediosPago = useMemo(() => normalizeMediosPago(lists), [lists]);

  const enhancedDetallesList = useMemo(
    () => [{ id: "new_option", __isNewOption: true, nombre: "+ Agregar nueva descripción" }, ...detalles],
    [detalles]
  );

  const [form, setForm] = useState(() => buildInitialState(initialData, clasificaciones));
  const [comprobanteActual, setComprobanteActual] = useState(null);
  const [archivoNuevo, setArchivoNuevo] = useState(null);
  const [marcarEliminarComprobante, setMarcarEliminarComprobante] = useState(false);
  const [openViewer, setOpenViewer] = useState(false);
  const [viewerData, setViewerData] = useState({ url: "", mime: "", title: "Comprobante" });

  const closeBtnRef = useRef(null);
  const inputFileRef = useRef(null);
  const fechaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !saving && !openViewer) onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose, openViewer]);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(buildInitialState(initialData, clasificaciones));
    setArchivoNuevo(null);
    setMarcarEliminarComprobante(false);
    setComprobanteActual(null);
    setOpenViewer(false);
    setViewerData({ url: "", mime: "", title: "Comprobante" });
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open, initialData, clasificaciones]);

  const cargarInfoComprobante = useCallback(async () => {
    const idMovimiento = Number(initialData?.id_movimiento ?? initialData?.id ?? 0);
    if (!open || !(idMovimiento > 0)) { setComprobanteActual(null); return; }
    setLoadingComprobante(true);
    try {
      const res = await fetch(
        `${API}?action=otros_egresos_comprobantes_info&id_movimiento=${idMovimiento}`,
        { method: "GET", headers: buildHeadersGET() }
      );
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo obtener el comprobante.");
      setComprobanteActual(data?.comprobante ?? null);
    } catch (err) {
      setComprobanteActual(null);
      showToast("error", err?.message || "No se pudo obtener el comprobante.", 3500);
    } finally {
      setLoadingComprobante(false);
    }
  }, [API, initialData, open, showToast]);

  useEffect(() => { if (open) cargarInfoComprobante(); }, [open, cargarInfoComprobante]);

  const updateItem = useCallback((uid, patch) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.uid !== uid) return it;
        const next = { ...it, ...patch };
        const cantidad = round3(safeNumber(next.cantidad));
        const precio = round2(safeNumber(next.precio));
        const iva_pct = round2(safeNumber(next.iva_pct));
        const calc = calcItemTotals(cantidad, precio, iva_pct);
        return {
          ...next,
          cantidad,
          precio,
          iva_pct,
          ...calc,
          detalle: next.detalle ?? it.detalle ?? "",
          id_detalle: next.id_detalle ?? it.id_detalle ?? "",
          stock_disponible: next.stock_disponible !== undefined ? next.stock_disponible : it.stock_disponible,
          sinStock: next.sinStock ?? it.sinStock ?? false,
          precioDraft: next.precioDraft ?? it.precioDraft ?? "",
          precioFocused: next.precioFocused ?? it.precioFocused ?? false,
        };
      }),
    }));
  }, []);

  const handleSelectDetalle = useCallback(
    (item, itemUid) => {
      if (item?.__isNewOption) return;
      const precio = safeNumber(item?.precio || 0);
      const stockDisponible = getStockDisponible(item);
      const sinStock = isSinStock(stockDisponible);
      updateItem(itemUid, {
        id_detalle: String(getDetalleId(item) ?? ""),
        detalle: optionLabel(item),
        precio,
        stock_disponible: stockDisponible,
        sinStock,
        cantidad: sinStock ? "" : 1,
      });
    },
    [updateItem]
  );

  const handleCantidadChange = useCallback(
    (itemUid, newCantidad, itemRef) => {
      if (itemRef?.sinStock || isSinStock(itemRef?.stock_disponible)) {
        updateItem(itemUid, { cantidad: "" });
        return;
      }
      let val = newCantidad === "" ? "" : Number(newCantidad);
      if (typeof val === "number" && val < 0) val = 0;
      if (
        itemRef?.stock_disponible !== null &&
        itemRef?.stock_disponible !== undefined &&
        typeof val === "number" &&
        val > Number(itemRef.stock_disponible)
      ) {
        val = Number(itemRef.stock_disponible);
      }
      updateItem(itemUid, { cantidad: val });
    },
    [updateItem]
  );

  const addItem = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, makeItem({ cantidad: 1, precio: 0, iva_pct: 0 })],
    }));
  }, []);

  const removeItem = useCallback((uid) => {
    setForm((prev) => {
      if ((prev.items || []).length <= 1) return prev;
      return { ...prev, items: prev.items.filter((it) => it.uid !== uid) };
    });
  }, []);

  const totalGeneral = useMemo(() => {
    if (form.es_movimiento_cheque) return round2(safeNumber(form?.cheque?.importe));
    return sumTotalItems(form.items);
  }, [form]);

  const isCostoFijoChecked =
    !!form.es_costo_fijo &&
    String(form.id_clasificacion || "") === String(clasificacionConfig.idCostoFijo);
  const isNoCostoFijoChecked =
    !form.es_costo_fijo && String(form.id_clasificacion || "") === "";

  const handleSelectCostoFijo = useCallback(() => {
    if (saving) return;
    setForm((prev) => ({
      ...prev,
      es_costo_fijo: true,
      id_clasificacion: String(clasificacionConfig.idCostoFijo),
    }));
  }, [clasificacionConfig.idCostoFijo, saving]);

  const handleSelectNoCostoFijo = useCallback(() => {
    if (saving) return;
    setForm((prev) => ({
      ...prev,
      es_costo_fijo: false,
      id_clasificacion: "",
    }));
  }, [saving]);

  const updateChequeField = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      cheque: {
        ...prev.cheque,
        [field]: field === "importe" ? round2(safeNumber(value)) : value,
      },
    }));
  }, []);

  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el || saving || el.disabled) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch { el.focus(); }
  }, [saving]);

  const mostrarArchivoActual = Boolean(
    (comprobanteActual?.archivo_url || comprobanteActual) &&
      !marcarEliminarComprobante &&
      !archivoNuevo
  );

  const nombreComprobanteVisible = useMemo(() => {
    if (archivoNuevo) return archivoNuevo.name;
    if (marcarEliminarComprobante) return "";
    return safeText(comprobanteActual?.archivo_url).split("/").pop() || "Comprobante actual";
  }, [archivoNuevo, marcarEliminarComprobante, comprobanteActual]);

  const abrirViewer = useCallback(() => {
    const idMovimiento = Number(form.id_movimiento || 0);
    if (!(idMovimiento > 0)) return;
    if (archivoNuevo) {
      setViewerData({
        url: URL.createObjectURL(archivoNuevo),
        mime: archivoNuevo.type || "application/octet-stream",
        title: `Comprobante - ${archivoNuevo.name}`
      });
      setOpenViewer(true);
      return;
    }
    if (!comprobanteActual || marcarEliminarComprobante) return;
    setViewerData({
      url: getComprobanteDownloadUrl(idMovimiento),
      mime: safeText(comprobanteActual?.archivo_mime) || "application/octet-stream",
      title: "Comprobante del egreso"
    });
    setOpenViewer(true);
  }, [form.id_movimiento, archivoNuevo, comprobanteActual, marcarEliminarComprobante]);

  const cerrarViewer = useCallback(() => {
    if (viewerData?.url?.startsWith("blob:")) URL.revokeObjectURL(viewerData.url);
    setOpenViewer(false);
    setViewerData({ url: "", mime: "", title: "Comprobante" });
  }, [viewerData]);

  const seleccionarArchivo = useCallback((e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setArchivoNuevo(file);
    setMarcarEliminarComprobante(false);
  }, []);

  const quitarArchivoNuevo = useCallback(() => {
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  }, []);

  const marcarEliminar = useCallback(() => {
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
    setMarcarEliminarComprobante(true);
  }, []);

  const restaurarComprobanteActual = useCallback(() => {
    setMarcarEliminarComprobante(false);
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  }, []);

  const eliminarComprobanteExistente = useCallback(async (idMovimiento) => {
    const res = await fetch(`${API}?action=otros_egresos_comprobantes_eliminar`, {
      method: "POST",
      headers: buildHeadersJSON(),
      body: JSON.stringify({ id_movimiento: idMovimiento }),
    });
    const data = await parseJsonOrThrow(res);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el comprobante.");
    return data;
  }, [API]);

  const subirComprobanteNuevo = useCallback(async (idMovimiento, archivo) => {
    const fd = new FormData();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("archivo", archivo);
    const res = await fetch(`${API}?action=otros_egresos_comprobantes_vincular_movimiento_upload`, {
      method: "POST",
      headers: buildHeadersFormData(),
      body: fd,
    });
    const data = await parseJsonOrThrow(res);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo subir el comprobante.");
    return data;
  }, [API]);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    try {
      setSaving(true);
      showToast("cargando", "Actualizando egreso…", 12000);
      const fecha = String(form.fecha || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("La fecha es obligatoria.");

      let payload;
      if (form.es_movimiento_cheque) {
        const id_cheque = Number(form?.cheque?.id_cheque || 0);
        const fecha_emision = String(form?.cheque?.fecha_emision || "").trim();
        const fecha_pago = String(form?.cheque?.fecha_pago || "").trim();
        const emisor = safeText(form?.cheque?.emisor);
        const numero_cheque = safeText(form?.cheque?.numero_cheque);
        const importe = round2(safeNumber(form?.cheque?.importe));
        if (!(id_cheque > 0)) throw new Error("No se encontró el cheque vinculado.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_emision)) throw new Error("La fecha de emisión del cheque es obligatoria.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_pago)) throw new Error("La fecha de pago del cheque es obligatoria.");
        if (!emisor) throw new Error("El emisor del cheque es obligatorio.");
        if (!numero_cheque) throw new Error("El número de cheque es obligatorio.");
        if (!(importe > 0)) throw new Error("El importe debe ser mayor a 0.");
        payload = {
          id_movimiento: Number(form.id_movimiento || 0),
          fecha,
          id_cheque,
          cheque_id: id_cheque,
          es_edicion_cheque: true,
          fecha_emision,
          emisor,
          numero_cheque,
          importe,
          fecha_pago,
          monto_total: importe,
        };
      } else {
        const id_medio_pago = Number(form.id_medio_pago || 0);
        if (!(id_medio_pago > 0)) throw new Error("El medio de pago es obligatorio.");
        const items = (form.items || [])
          .map((it) => {
            const id_detalle = Number(it.id_detalle || 0);
            const detalle = String(it.detalle ?? "").trim();
            const cantidad = round3(safeNumber(it.cantidad));
            const precio = round2(safeNumber(it.precio));
            const iva_pct = round2(safeNumber(it.iva_pct));
            const calc = calcItemTotals(cantidad, precio, iva_pct);
            return { id_detalle, detalle, cantidad, precio, iva_pct, ...calc };
          })
          .filter((it) => it.id_detalle > 0 && it.cantidad > 0 && it.precio > 0 && it.total > 0);
        if (!items.length) throw new Error("Debés cargar al menos un ítem válido.");
        payload = {
          id_movimiento: Number(form.id_movimiento || 0),
          fecha,
          id_medio_pago,
          id_clasificacion: form.es_costo_fijo ? Number(clasificacionConfig.idCostoFijo) : null,
          es_costo_fijo: !!form.es_costo_fijo,
          id_detalle: items[0]?.id_detalle ?? null,
          monto_total: sumTotalItems(items),
          items,
        };
      }

      if (!(payload.id_movimiento > 0)) throw new Error("Falta el ID del egreso a editar.");

      const resp = await onSubmit?.(payload, true);
      const idMovimientoFinal = Number(resp?.id_movimiento ?? resp?.id ?? payload.id_movimiento ?? 0);
      if (!(idMovimientoFinal > 0)) throw new Error("No se pudo determinar el ID del egreso actualizado.");

      if (marcarEliminarComprobante && comprobanteActual && !archivoNuevo) {
        await eliminarComprobanteExistente(idMovimientoFinal);
      }
      if (archivoNuevo) {
        await subirComprobanteNuevo(idMovimientoFinal, archivoNuevo);
      }
      await onSaved?.(resp);
    } catch (err) {
      showToast("error", err?.message || "Error actualizando egreso.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  const esMovCheque = form.es_movimiento_cheque;
  const chequeTitulo = form?.cheque?.tipo === "echeq" ? "Datos del eCheq" : "Datos del cheque";

  const totalIva = (form.items || []).reduce((a, it) => a + safeNumber(it.iva_monto), 0);
  const totalSubtotal = sumTotalItems(form.items) - totalIva;

  return createPortal(
    <>
      <div className="mi-modal__overlay">
        <div
          className="mi-modal__container mi-modal__container--mov"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mi-ee-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faPenToSquare} />
            </div>
            <div className="mi-modal__head-left">
              <h2 id="mi-ee-title" className="mi-modal__title">
                {esMovCheque ? "Editar cheque / eCheq" : "Editar egreso"}
              </h2>
            </div>
            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !saving && onClose?.()}
              aria-label="Cerrar"
              disabled={saving}
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mi-modal__content">
            <form
              onSubmit={submit}
              style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
            >
              <div className="mi-cr-grid">
                {!esMovCheque ? (
                  <section className="mi-cr-table">
                    <div className="mi-cr-table__head">
                      <div style={{ paddingLeft: 10 }}>Descripción</div>
                      <div>Cant.</div>
                      <div className="right">Importe</div>
                      <div>IVA %</div>
                      <div className="right">IVA $</div>
                      <div className="right">Total</div>
                      <div />
                    </div>

                    <div className="mi-cr-table__rows">
                      {(form.items || []).map((it) => (
                        <div key={it.uid} className="mi-cr-row">
                          <div className="mi-cr-cell mi-cr-cell--detalle">
                            <GlobalAutocomplete
                              value={it.detalle}
                              onChange={(val) =>
                                updateItem(it.uid, {
                                  detalle: val,
                                  id_detalle: "",
                                  stock_disponible: null,
                                  sinStock: false,
                                })
                              }
                              onSelect={(item) => handleSelectDetalle(item, it.uid)}
                              options={enhancedDetallesList}
                              getOptionLabel={(d) => {
                                if (d?.__isNewOption) return d.nombre;
                                return optionLabel(d);
                              }}
                              getOptionValue={(d) => {
                                if (d?.__isNewOption) return "__new_option__";
                                return String(getDetalleId(d) ?? optionLabel(d));
                              }}
                              placeholder="Escribí o buscá una descripción…"
                              disabled={saving}
                              showAllOnFocus={false}
                              maxItems={18}
                              inputClassName="nv-cell-input"
                            />
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center stock_cant">
                            <input
                              className="nv-cell-input nv-cell-input--center"
                              type="text"
                              inputMode="decimal"
                              value={it.sinStock || isSinStock(it.stock_disponible) ? "" : it.cantidad}
                              onChange={(e) => handleCantidadChange(it.uid, e.target.value, it)}
                              disabled={saving || it.sinStock || isSinStock(it.stock_disponible)}
                              placeholder={it.sinStock || isSinStock(it.stock_disponible) ? "0" : ""}
                              title={it.sinStock || isSinStock(it.stock_disponible) ? "No podés ingresar cantidad porque el stock es 0" : ""}
                              style={{
                                width: "100%",
                                background: it.sinStock || isSinStock(it.stock_disponible) ? "#f3f4f6" : undefined,
                                color: it.sinStock || isSinStock(it.stock_disponible) ? "#b91c1c" : undefined,
                                borderColor: it.sinStock || isSinStock(it.stock_disponible) ? "#fca5a5" : undefined,
                                cursor: it.sinStock || isSinStock(it.stock_disponible) ? "not-allowed" : undefined,
                                opacity: it.sinStock || isSinStock(it.stock_disponible) ? 0.9 : 1,
                              }}
                            />
                            {it.stock_disponible !== null && it.stock_disponible !== undefined && (
                              <div style={{ fontSize: "10px", fontWeight: isSinStock(it.stock_disponible) ? 700 : 500, color: isSinStock(it.stock_disponible) ? "#b91c1c" : "#666" }}>
                                {isSinStock(it.stock_disponible) ? "Sin stock" : `Stock: ${it.stock_disponible}`}
                              </div>
                            )}
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center">
                            <input
                              className="nv-cell-input nv-cell-input--right"
                              type="text"
                              inputMode="decimal"
                              value={
                                it.precioFocused
                                  ? (it.precioDraft ?? "")
                                  : it.precio === 0
                                    ? ""
                                    : Number(it.precio).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              }
                              onFocus={(e) => {
                                updateItem(it.uid, {
                                  precioFocused: true,
                                  precioDraft: it.precio === 0 ? "" : String(it.precio).replace(".", ","),
                                });
                                setTimeout(() => e.target.select(), 0);
                              }}
                              onChange={(e) => {
                                const c = e.target.value.replace(/[^\d,.\-]/g, "");
                                let s = c;
                                if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
                                else if (s.includes(",")) s = s.replace(",", ".");
                                const n = Number(s);
                                updateItem(it.uid, { precioDraft: c, precio: Number.isFinite(n) ? n : 0 });
                              }}
                              onBlur={() => {
                                updateItem(it.uid, { precioFocused: false, precioDraft: "" });
                              }}
                              placeholder="$ 0,00"
                              disabled={saving}
                              style={{ width: "100%" }}
                            />
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center">
                            <select
                              className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                              value={String(it.iva_pct)}
                              onChange={(e) => updateItem(it.uid, { iva_pct: e.target.value })}
                              onKeyDown={(e) => {
                                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
                                  e.preventDefault();
                              }}
                              disabled={saving}
                              style={{ width: "100%" }}
                            >
                              {IVA_OPTIONS.map((x) => (
                                <option key={x.value} value={x.value}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                            {moneyARS(it.iva_monto)}
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                            {moneyARS(it.total)}
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                            <button
                              type="button"
                              className="mi-cr-del"
                              onClick={() => removeItem(it.uid)}
                              disabled={saving || (form.items || []).length <= 1}
                              title="Eliminar ítem"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mi-cr-table__foot">
                      <div className="mi-cr-foot-actions">
                        <button
                          type="button"
                          className="nv-foot-btn"
                          onClick={addItem}
                          disabled={saving}
                        >
                          <span className="nv-foot-btn__icon">+</span>Agregar ítem
                        </button>
                        <div className="nv-foot-sep" />
                      </div>
                      <div className="mi-cr-totals">
                        <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                          <span>Subtotal</span>
                          <b>{moneyARS(totalSubtotal)}</b>
                        </div>
                        <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                          <span>IVA</span>
                          <b>{moneyARS(totalIva)}</b>
                        </div>
                        <div className="mi-cr-totalLine mi-cr-totalLine--total">
                          <span>Total</span>
                          <b>{moneyARS(totalGeneral)}</b>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="mi-cr-table" style={{ overflow: "hidden" }}>
                    <div className="mi-cr-table__head">
                      <div style={{ paddingLeft: 10 }}>{chequeTitulo}</div>
                    </div>

                    <ChequeFields
                      cheque={form.cheque}
                      saving={saving}
                      onUpdate={updateChequeField}
                    />

                    <div className="mi-cr-table__foot" style={{ justifyContent: "flex-end" }}>
                      <div className="mi-cr-totals">
                        <div className="mi-cr-totalLine mi-cr-totalLine--total">
                          <span>Importe del cheque</span>
                          <b>{moneyARS(totalGeneral)}</b>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                <aside className="nc-aside">
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>{esMovCheque ? "Datos del movimiento" : "Datos del egreso"}</span>
                    </div>
                    <div className="nc-section-body">
                      <div className="nc-field" onClick={openDatePicker}>
                        <input
                          ref={fechaRef}
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={form.fecha}
                          onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                          disabled={saving}
                        />
                        <label className="nc-label" onClick={openDatePicker}>
                          Fecha
                        </label>
                      </div>

                      {!esMovCheque && (
                        <div className="nc-field">
                          <select
                            className="nc-input"
                            value={String(form.id_medio_pago || "")}
                            onChange={(e) => setForm((p) => ({ ...p, id_medio_pago: e.target.value }))}
                            disabled={saving}
                          >
                            <option value="">Seleccionar...</option>
                            {mediosPago.map((x) => (
                              <option key={x.id} value={String(x.id)}>
                                {x.nombre}
                              </option>
                            ))}
                          </select>
                          <label className="nc-label" style={{ pointerEvents: "none" }}>
                            Medio de pago
                          </label>
                        </div>
                      )}

                      {!esMovCheque && (
                        <div>
                          <div className="nc-pill-label">Clasificación *</div>
                          <div className="nc-pills">
                            <button
                              type="button"
                              className={`nc-pill${isCostoFijoChecked ? " nc-pill--active" : ""}`}
                              onClick={handleSelectCostoFijo}
                              disabled={saving}
                            >
                              {clasificacionConfig.labelCostoFijo}
                            </button>
                            <button
                              type="button"
                              className={`nc-pill${isNoCostoFijoChecked ? " nc-pill--active" : ""}`}
                              onClick={handleSelectNoCostoFijo}
                              disabled={saving}
                            >
                              {clasificacionConfig.labelNoCostoFijo}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" style={{ background: "#64748b" }} />
                      <span>Comprobante adjunto</span>
                    </div>
                    <div className="nc-section-body">
                      <div className="mi-uploadCard">
                        <div className="mi-uploadCard__head">
                          <div className="mi-uploadCard__title">Comprobante</div>
                          <div className="mi-uploadCard__sub">
                            Seleccioná, visualizá o quitá el archivo antes de guardar
                          </div>
                        </div>

                        <div className="mi-uploadCard__body">
                          {loadingComprobante ? (
                            <div style={{ fontSize: 12, opacity: 0.75, padding: "6px 0" }}>
                              Cargando comprobante…
                            </div>
                          ) : (
                            <>
                              {mostrarArchivoActual && (
                                <div className="mi-uploadFile is-filled">
                                  <div className="mi-uploadFile__icon">
                                    <FontAwesomeIcon icon={faFileInvoiceDollar} />
                                  </div>
                                  <div className="mi-uploadFile__meta">
                                    <div className="mi-uploadFile__name" title={nombreComprobanteVisible}>
                                      {nombreComprobanteVisible}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={abrirViewer}
                                      disabled={saving}
                                      title="Ver comprobante"
                                    >
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={marcarEliminar}
                                      disabled={saving}
                                      title="Quitar comprobante"
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {archivoNuevo && (
                                <div className="mi-uploadFile is-filled">
                                  <div className="mi-uploadFile__icon">
                                    <FontAwesomeIcon icon={faFileInvoiceDollar} />
                                  </div>
                                  <div className="mi-uploadFile__meta">
                                    <div className="mi-uploadFile__name" title={archivoNuevo.name}>
                                      {archivoNuevo.name}
                                    </div>
                                    <div className="mi-uploadFile__size">
                                      {Math.max(1, Math.round((archivoNuevo.size || 0) / 1024))} KB
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={abrirViewer}
                                      disabled={saving}
                                      title="Ver comprobante"
                                    >
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={quitarArchivoNuevo}
                                      disabled={saving}
                                      title="Quitar archivo"
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {!mostrarArchivoActual && !archivoNuevo && (
                                <div className="mi-uploadFile is-empty">
                                  <div className="mi-uploadFile__empty">
                                    {marcarEliminarComprobante
                                      ? "El comprobante actual será eliminado al guardar"
                                      : "No hay comprobante seleccionado"}
                                  </div>
                                </div>
                              )}

                              <div className="mi-uploadBar" style={{ marginTop: 10 }}>
                                {marcarEliminarComprobante && !archivoNuevo && (
                                  <button
                                    type="button"
                                    className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                    onClick={restaurarComprobanteActual}
                                    disabled={saving}
                                  >
                                    <FontAwesomeIcon icon={faUndo} /> Cancelar
                                  </button>
                                )}
                                <input
                                  ref={inputFileRef}
                                  type="file"
                                  accept={fileAcceptText()}
                                  onChange={seleccionarArchivo}
                                  disabled={saving}
                                  style={{ display: "none" }}
                                />
                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                                  onClick={() => inputFileRef.current?.click()}
                                  disabled={saving}
                                >
                                  <FontAwesomeIcon icon={faUpload} />{" "}
                                  {mostrarArchivoActual || archivoNuevo
                                    ? "Reemplazar archivo"
                                    : "Seleccionar archivo"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="nc-actions mi-cr-filters__actions">
                    <button
                      type="submit"
                      disabled={saving}
                      className="mit-btn mit-btn--solid mit-btn--block"
                    >
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button
                      type="button"
                      onClick={() => !saving && onClose?.()}
                      disabled={saving}
                      className="mit-btn mit-btn--ghost mit-btn--block"
                    >
                      Cancelar
                    </button>
                  </div>
                </aside>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ModalVerComprobante
        open={openViewer}
        url={viewerData.url}
        mime={viewerData.mime}
        title={viewerData.title}
        onClose={cerrarViewer}
      />
    </>,
    document.body
  );
}