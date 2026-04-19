import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faUpload,
  faTrashCan,
  faEye,
  faXmark,
  faMoneyCheckDollar,
  faCircleNotch,
  faPlus,
  faTrash,
  faBackspace,
  faBasketShopping,
} from "@fortawesome/free-solid-svg-icons";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import { PanelMediosPagoInlineCompra, buildEmptyMedioPago } from "./Modalmediospago.jsx";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

/* =========================
   Helpers base
========================= */
function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function safeNumber(v) {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  return s;
}
function calcItemTotals(cantidad, precio, ivaPct) {
  const c = Math.max(0, safeNumber(cantidad));
  const p = Math.max(0, safeNumber(precio));
  const iva = Math.max(0, safeNumber(ivaPct));
  const subtotal = c * p;
  const iva_monto = subtotal * (iva / 100);
  const total = subtotal + iva_monto;
  const r2 = (n) => Math.round(n * 100) / 100;
  return { subtotal: r2(subtotal), iva_monto: r2(iva_monto), total: r2(total) };
}

/* =========================
   IDs tolerantes
========================= */
function getGenericId(x) {
  const cand =
    x?.id ??
    x?.ID ??
    x?.id_item ??
    x?.idCatalogo ??
    x?.id_cuenta_corriente ??
    x?.id_medio_pago ??
    x?.id_cliente ??
    x?.id_proveedor ??
    x?.id_detalle ??
    x?.id_tipo_venta ??
    x?.id_tipo_movimiento ??
    x?.id_comprobante ??
    x?.id_cheque ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getMedioPagoId(mp) {
  const c = mp?.id ?? mp?.id_medio_pago ?? mp?.medio_pago_id ?? mp?.idMedioPago ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function isPositiveId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/* =========================
   Normalización
========================= */
function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}
function getTipoVentaObj(tiposVentaArr, idTipoVenta) {
  const sid = String(idTipoVenta ?? "").trim();
  if (!sid || sid === NULL_OPTION) return null;
  return (
    (Array.isArray(tiposVentaArr) ? tiposVentaArr : []).find(
      (x) => String(getGenericId(x) ?? x?.id) === sid
    ) || null
  );
}
function isTipoVentaContado(tipoVentaObj) {
  const n = normalizeText(tipoVentaObj?.nombre ?? "");
  if (!n) return true;
  return n.includes("contado") || n.includes("efectivo") || n.includes("cash");
}
function normalizeChequeTipoFromMedio(nombre) {
  const s = normalizeText(nombre);
  if (!s) return null;
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq")) return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}
function buildSingleCuentaCorrienteOption(arrRaw) {
  const arr = Array.isArray(arrRaw) ? arrRaw : [];
  if (!arr.length) return { list: [], pickedId: null };
  const hit = arr.find((x) => normalizeText(x?.nombre).includes("cuenta corriente")) || arr[0];
  const pickedId = getGenericId(hit);
  if (!pickedId) return { list: [], pickedId: null };
  return { list: [{ id: pickedId, nombre: "Cuenta Corriente" }], pickedId };
}

/* =========================
   Auth + API
========================= */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, sessionKey, idUsuario };
}
async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`);
  }
  if (!res.ok) {
    const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
function buildAuthHeaders(isJson = true) {
  const { token, sessionKey } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildAuthHeaders(false) });
  return await parseJsonOrThrow(res);
}
async function apiPostJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(true),
    body: JSON.stringify(payload ?? {}),
  });
  return await parseJsonOrThrow(res);
}
async function apiPostForm(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(false),
    body: formData,
  });
  return await parseJsonOrThrow(res);
}

/* =========================
   Helpers comprobante
========================= */
function extractIdComprobanteFromUrlLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m1 = s.match(/[?&]id_comprobante=(\d+)/i);
  if (m1) { const n = Number(m1[1]); return Number.isFinite(n) && n > 0 ? n : null; }
  const m2 = s.match(/[?&]id=(\d+)/i);
  if (m2) { const n = Number(m2[1]); return Number.isFinite(n) && n > 0 ? n : null; }
  return null;
}
function getComprobanteIdFromRow(row) {
  const directCandidates = [
    row?.id_comprobante_principal,
    row?.id_comprobante,
    row?.comprobante_id,
    row?.factura_id_comprobante,
    row?.idFacturaComprobante,
  ];
  for (const cand of directCandidates) {
    const n = Number(cand);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const urlCandidates = [
    row?.factura_url, row?.factura, row?.comprobante_url, row?.comprobante,
    row?.archivo_url, row?.url_factura, row?.path_factura, row?.factura_path,
  ];
  for (const u of urlCandidates) {
    const n = extractIdComprobanteFromUrlLike(u);
    if (n) return n;
  }
  return null;
}
function getComprobanteUrl(row) {
  const idComp = getComprobanteIdFromRow(row);
  if (idComp) {
    const sp = new URLSearchParams();
    sp.set("action", "compras_comprobantes_descargar");
    sp.set("id_comprobante", String(idComp));
    return `${BASE_URL}/api.php?${sp.toString()}`;
  }
  const candidates = [
    row?.factura_url, row?.factura, row?.comprobante_url, row?.comprobante,
    row?.archivo_url, row?.url_factura, row?.path_factura, row?.factura_path,
  ];
  const raw = candidates.find((x) => typeof x === "string" && x.trim() !== "");
  if (!raw) return "";
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = String(BASE_URL || "").replace(/\/$/, "");
  const rel = s.replace(/^\//, "");
  return `${base}/${rel}`;
}
function guessExtensionFromValue(value) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return "";
  const clean = s.split("?")[0].split("#")[0];
  if (clean.endsWith(".pdf")) return ".pdf";
  if (clean.endsWith(".jpg")) return ".jpg";
  if (clean.endsWith(".jpeg")) return ".jpeg";
  if (clean.endsWith(".png")) return ".png";
  if (clean.endsWith(".webp")) return ".webp";
  return "";
}
function sanitizeDisplayName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const onlyName = raw.split("/").pop()?.split("\\").pop()?.split("?")[0]?.trim() || "";
  if (!onlyName) return "";
  const lowered = onlyName.toLowerCase();
  if (
    lowered.includes("api.php") ||
    lowered.includes("action=") ||
    (lowered.includes("comprobante") && lowered.includes("="))
  ) return "";
  return onlyName;
}
function getFriendlyComprobanteName(row, url) {
  const candidates = [
    row?.archivo_nombre, row?.nombre_archivo, row?.factura_nombre,
    row?.comprobante_nombre, row?.archivo,
  ];
  for (const c of candidates) {
    const clean = sanitizeDisplayName(c);
    if (clean) return clean;
  }
  const ext =
    guessExtensionFromValue(url) ||
    guessExtensionFromValue(row?.archivo_nombre) ||
    guessExtensionFromValue(row?.nombre_archivo) ||
    guessExtensionFromValue(row?.factura_nombre) ||
    ".pdf";
  return `Comprobante actual${ext}`;
}

/* =========================
   Safe lists + normalización
========================= */
const SAFE_LISTS = {
  tiposVenta: [],
  cuentasCorrientes: [],
  tiposMovimiento: [],
  proveedores: [],
  detalles: [],
  mediosPago: [],
};
function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};
  const src = l.listas && typeof l.listas === "object" ? l.listas : l;

  const tiposMov =
    Array.isArray(src.tiposMovimiento) && src.tiposMovimiento.length
      ? src.tiposMovimiento
      : Array.isArray(src.tipos_movimiento) ? src.tipos_movimiento : [];

  const tiposVenta =
    Array.isArray(src.tiposVenta) && src.tiposVenta.length
      ? src.tiposVenta
      : Array.isArray(src.tipos_venta) ? src.tipos_venta : [];

  const cuentas =
    Array.isArray(src.cuentasCorrientes) && src.cuentasCorrientes.length
      ? src.cuentasCorrientes
      : Array.isArray(src.cuentas_corrientes) ? src.cuentas_corrientes
      : Array.isArray(src.cuenta_corriente) ? src.cuenta_corriente : [];

  const medios =
    Array.isArray(src.mediosPago) && src.mediosPago.length
      ? src.mediosPago
      : Array.isArray(src.medios_pago) ? src.medios_pago
      : Array.isArray(src.medios) ? src.medios : [];

  const proveedores =
    Array.isArray(src.proveedores) && src.proveedores.length
      ? src.proveedores
      : Array.isArray(src.proveedor) ? src.proveedor : [];

  return {
    tiposVenta: Array.isArray(tiposVenta) ? tiposVenta : [],
    cuentasCorrientes: Array.isArray(cuentas) ? cuentas : [],
    tiposMovimiento: Array.isArray(tiposMov) ? tiposMov : [],
    proveedores,
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    mediosPago: Array.isArray(medios) ? medios : [],
  };
}
function findIdByIncludes(arr, includesText) {
  const inc = normalizeText(includesText);
  const a = Array.isArray(arr) ? arr : [];
  const hit = a.find((x) => normalizeText(x?.nombre).includes(inc));
  const id = getGenericId(hit);
  return id ? String(id) : NULL_OPTION;
}
function nameById(arr, id) {
  const sid = String(id ?? "").trim();
  if (!sid || sid === NULL_OPTION || sid === ADD_OPTION) return "";
  const found = (Array.isArray(arr) ? arr : []).find(
    (x) => String(getGenericId(x) ?? x?.id) === sid
  );
  return String(found?.nombre ?? "").trim();
}

/* =========================
   Build form + medios
========================= */
function buildFormFromRowCompra(row, fixedLocal) {
  const r = row || {};
  const nOrNull = (v) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? String(Number(v)) : NULL_OPTION;
  const cantidad = r.cantidad != null ? safeNumber(r.cantidad) : 1;
  const precio = r.precio != null ? safeNumber(r.precio) : safeNumber(r.monto_total);
  const iva_pct = r.iva_pct != null ? safeNumber(r.iva_pct) : 0;
  const totals = calcItemTotals(cantidad, precio, iva_pct);
  const subtotal = r.subtotal != null ? safeNumber(r.subtotal) : totals.subtotal;
  const iva_monto = r.iva_monto != null ? safeNumber(r.iva_monto) : totals.iva_monto;
  const total = r.total != null ? safeNumber(r.total) : totals.total;
  const monto_total = r.monto_total != null ? safeNumber(r.monto_total) : total;

  const fallbackTipoVenta = isPositiveId(r?.id_tipo_venta)
    ? String(Number(r.id_tipo_venta))
    : normalizeText(r?.cuenta_corriente).includes("cuenta corriente") ? "2" : "1";

  return {
    id_movimiento: safeNumber(r.id_movimiento ?? r.id ?? r.id_compra) || null,
    fecha: String(r.fecha || "").slice(0, 10) || "",
    id_tipo_venta: nOrNull(r.id_tipo_venta) || fallbackTipoVenta,
    id_tipo_movimiento: fixedLocal?.idEntrada ?? NULL_OPTION,
    id_proveedor: nOrNull(r.id_proveedor),
    id_detalle: nOrNull(r.id_detalle),
    monto_total: Math.max(0, Math.round(monto_total * 100) / 100),
    cantidad: Math.max(0, Math.round(cantidad * 1000) / 1000),
    precio: Math.max(0, Math.round(precio * 100) / 100),
    iva_pct: Math.max(0, Math.round(iva_pct * 100) / 100),
    subtotal: Math.max(0, Math.round(subtotal * 100) / 100),
    iva_monto: Math.max(0, Math.round(iva_monto * 100) / 100),
    total: Math.max(0, Math.round(total * 100) / 100),
  };
}
function buildMediosFromRowCompra(row, mediosPagoList) {
  const list = Array.isArray(row?.medios_pago_detalle) ? row.medios_pago_detalle : [];
  const out = [];
  const groupedCheque = new Map();

  if (list.length) {
    for (const mp of list) {
      const idMedio = Number(mp?.id_medio_pago || 0);
      if (!(idMedio > 0)) continue;
      const medioObj = (Array.isArray(mediosPagoList) ? mediosPagoList : []).find(
        (x) => String(getGenericId(x) ?? x?.id_medio_pago) === String(idMedio)
      );
      const tipoCheque =
        normalizeChequeTipoFromMedio(medioObj?.nombre || "") ||
        normalizeText(mp?.cheque_tipo || "");
      const idCheque = Number(mp?.id_cheque || 0);
      if ((tipoCheque === "cheque" || tipoCheque === "echeq") && idCheque > 0) {
        const key = `${idMedio}|${tipoCheque}`;
        if (!groupedCheque.has(key)) {
          groupedCheque.set(key, {
            id: uid(),
            id_medio_pago: String(idMedio),
            monto: 0,
            montoDraft: "",
            montoFocused: false,
            id_cheque: [],
            chequesDisponibles: [],
            loadingCheques: false,
          });
        }
        const rowMp = groupedCheque.get(key);
        rowMp.id_cheque.push(String(idCheque));
        rowMp.monto =
          Math.round(
            (safeNumber(rowMp.monto) + safeNumber(mp?.cheque_importe || mp?.monto || 0)) * 100
          ) / 100;
      } else {
        out.push({
          id: uid(),
          id_medio_pago: String(idMedio),
          monto: Math.round(safeNumber(mp?.monto) * 100) / 100,
          montoDraft: "",
          montoFocused: false,
          id_cheque: [],
          chequesDisponibles: [],
          loadingCheques: false,
        });
      }
    }
  } else if (isPositiveId(row?.id_medio_pago)) {
    out.push({
      id: uid(),
      id_medio_pago: String(Number(row.id_medio_pago)),
      monto: Math.round(safeNumber(row?.monto_total) * 100) / 100,
      montoDraft: "",
      montoFocused: false,
      id_cheque: [],
      chequesDisponibles: [],
      loadingCheques: false,
    });
  }

  groupedCheque.forEach((value) => out.push(value));
  return out.length ? out : [buildEmptyMedioPago()];
}

/* =========================
   Mini modal reutilizable (agregar catálogo)
========================= */
function AddCatalogMiniModal({
  open, title, label = "Nombre", value, saving,
  onChange, onCancel, onSave, dark = false,
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onSave?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onSave]);
  if (!open) return null;
  return createPortal(
    <div className="mi-mini__overlay" onMouseDown={onCancel}>
      <div
        className={["mi-mini__modal", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{title}</h4>
          <button type="button" className="mi-mini__close" onClick={onCancel} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <div className="mi-mini__body">
          <div className="fl-field">
            <input
              ref={inputRef} className="fl-input" placeholder=" "
              value={value} onChange={(e) => onChange?.(e.target.value)}
              disabled={saving} autoComplete="off"
            />
            <label className="fl-label">{label}</label>
          </div>
          <div className="mi-mini__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ============================================================
   MODAL PRINCIPAL — ModalEditarCompra
============================================================ */
export default function ModalEditarCompra({
  open,
  lists,
  row,
  onClose,
  onSave,
  onSaved,
  onToast,
  onCatalogCreated,
  dark: darkProp,
}) {
  const ENDPOINT_BASE = `${BASE_URL}/api.php`;
  const ENDPOINT_UPLOAD_LINK = `${BASE_URL}/api.php?action=compras_comprobantes_vincular_movimientos_lote_upload`;
  const ENDPOINT_DELETE_COMP = `${BASE_URL}/api.php?action=compras_eliminar_comprobante`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // ── Dark mode ──
  const [darkAuto, setDarkAuto] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDarkAuto(isTemaOscuro());
    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const obsBody = new MutationObserver(update);
    if (document.body) obsBody.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    update();
    return () => { obsHtml.disconnect(); obsBody.disconnect(); };
  }, []);
  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;

  // ── Bloquear scroll del body ──
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  const listsRef = useRef(lists);
  const rowRef = useRef(row);
  useEffect(() => void (listsRef.current = lists), [lists]);
  useEffect(() => void (rowRef.current = row), [row]);

  // ── Listas locales ──
  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS, ...normalizeIncomingLists(lists),
  }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const safeLists = useMemo(() => localLists, [localLists]);
  const tiposVentaUI = useMemo(() => {
    if (Array.isArray(safeLists.tiposVenta) && safeLists.tiposVenta.length) return safeLists.tiposVenta;
    return [{ id: 1, nombre: "CONTADO" }, { id: 2, nombre: "CUENTA CORRIENTE" }];
  }, [safeLists.tiposVenta]);

  const ccNormalized = useMemo(
    () => buildSingleCuentaCorrienteOption(safeLists.cuentasCorrientes),
    [safeLists.cuentasCorrientes]
  );

  // ── Estado del formulario ──
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => {
    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    const fixedLocal = { idEntrada: findIdByIncludes(merged.tiposMovimiento, "entrada") };
    return buildFormFromRowCompra(row, fixedLocal);
  });
  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);
  const [detalleInput, setDetalleInput] = useState("");
  const [detalleFocus, setDetalleFocus] = useState(false);
  const [mediosFilas, setMediosFilas] = useState(() => [buildEmptyMedioPago()]);


  // ── Comprobante ──
  // archivoAdjunto unifica la lógica: si hay archivo nuevo seleccionado, se usa ese;
  // si no, se usa el actual (URL). Al quitar → null ambos.
  const [archivoNuevo, setArchivoNuevo]           = useState(null);   // File | null
  const [archivoActualUrl, setArchivoActualUrl]   = useState("");
  const [archivoActualNombre, setArchivoActualNombre] = useState("");
  const [archivoActualId, setArchivoActualId]     = useState(null);
  const [quitarArchivoActual, setQuitarArchivoActual] = useState(false);

  // Para visualizar comprobante — unificado
  const [openVerComp, setOpenVerComp] = useState(false);
  const [compUrl, setCompUrl]         = useState("");

  const closeBtnRef       = useRef(null);
  const fechaRef          = useRef(null);
  const proveedorInputRef = useRef(null);
  const detalleInputRef   = useRef(null);
  const fileInputRef      = useRef(null);
  const rowsContainerRef  = useRef(null);
  const [hasScroll, setHasScroll] = useState(false);

  const [addUI, setAddUI] = useState({ open: false, catalogo: null, text: "", saving: false });

  // ── Scroll check ──
  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;
    const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, [open, form]);

  // ── Derivados ──
  const tipoVentaObj = useMemo(
    () => getTipoVentaObj(tiposVentaUI, form.id_tipo_venta),
    [tiposVentaUI, form.id_tipo_venta]
  );
  const esContado = useMemo(() => isTipoVentaContado(tipoVentaObj), [tipoVentaObj]);

  const resumen = useMemo(() => ({
    subtotal: safeNumber(form.subtotal),
    iva: safeNumber(form.iva_monto),
    total: safeNumber(form.total),
  }), [form.subtotal, form.iva_monto, form.total]);

  const sumaMediosPago = useMemo(
    () => mediosFilas.reduce((acc, mp) => acc + safeNumber(mp.monto), 0),
    [mediosFilas]
  );
  const diferenciaRestante = useMemo(
    () => Math.max(0, safeNumber(resumen.total) - safeNumber(sumaMediosPago)),
    [resumen.total, sumaMediosPago]
  );

  // Al cambiar a cta cte, cerrar modal de medios
  useEffect(() => {
    if (!esContado) {
    }
  }, [esContado]);

  // ── Handlers medios de pago ──
  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, catalogo: null, text: "", saving: false });
  }, [addUI.saving]);

  const updateMedioPago = useCallback((id, patch) => {
    setMediosFilas((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);
  const addMedioPago = useCallback(() => {
    setMediosFilas((prev) => [...prev, buildEmptyMedioPago()]);
  }, []);
  const removeMedioPago = useCallback((id) => {
    setMediosFilas((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : [buildEmptyMedioPago()];
    });
  }, []);

  // ── Cargar cheques para una fila ──
  const cargarChequesParaFila = useCallback(
    async (rowId, idMedioPago, includeIds = []) => {
      const medioObj = (Array.isArray(safeLists.mediosPago) ? safeLists.mediosPago : []).find(
        (x) => String(getGenericId(x) ?? x?.id_medio_pago ?? "") === String(idMedioPago ?? "")
      );
      const tipoCheque = normalizeChequeTipoFromMedio(medioObj?.nombre || "");
      if (!tipoCheque) {
        updateMedioPago(rowId, { chequesDisponibles: [], loadingCheques: false, id_cheque: [] });
        return;
      }
      updateMedioPago(rowId, { loadingCheques: true, chequesDisponibles: [] });
      try {
        const sp = new URLSearchParams();
        sp.set("action", "compras_cheques_cartera_listar");
        sp.set("tipo", tipoCheque);
        if (Array.isArray(includeIds) && includeIds.length) {
          sp.set("include_ids", includeIds.join(","));
        }
        const data = await apiGet(`${BASE_URL}/api.php?${sp.toString()}`);
        updateMedioPago(rowId, {
          chequesDisponibles: Array.isArray(data?.cheques) ? data.cheques : [],
          loadingCheques: false,
        });
      } catch (e) {
        updateMedioPago(rowId, { chequesDisponibles: [], loadingCheques: false });
        showToast("error", e?.message || "No se pudieron cargar los cheques.", 4200);
      }
    },
    [safeLists.mediosPago, showToast, updateMedioPago]
  );

  // ── Catálogo ──
  const startAddProveedor = useCallback(() => {
    if (saving) return;
    setProveedorFocus(false);
    setAddUI({ open: true, catalogo: "proveedores", text: proveedorInput.trim() || "", saving: false });
    setForm((p) => ({ ...p, id_proveedor: ADD_OPTION }));
  }, [saving, proveedorInput]);

  const startAddDetalle = useCallback(() => {
    if (saving) return;
    setDetalleFocus(false);
    setAddUI({ open: true, catalogo: "detalles", text: detalleInput.trim() || "", saving: false });
    setForm((p) => ({ ...p, id_detalle: ADD_OPTION }));
  }, [saving, detalleInput]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const catalogo = addUI.catalogo;
    const nombre = String(addUI.text || "").trim();
    if (!catalogo) return;
    if (!nombre) { showToast("advertencia", "Escribí un nombre antes de guardar.", 2600); return; }
    const { sessionKey, idUsuario } = getAuthInfo();
    if (!sessionKey) { showToast("error", "No hay sesión activa (Falta X-Session).", 5200); return; }
    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${catalogo === "proveedores" ? "proveedor" : "detalle"}…`, 12000);
    try {
      const data = await apiPostJson(`${ENDPOINT_BASE}?action=catalogo_crear`, { catalogo, nombre, idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el ítem.");
      const item = data?.item || {};
      const newId = getGenericId(item);
      const newNombre = String(item?.nombre ?? "").trim() || nombre;
      if (!newId) throw new Error("El servidor no devolvió un ID válido.");
      setLocalLists((prev) => {
        const next = { ...prev };
        const key = catalogo === "proveedores" ? "proveedores" : "detalles";
        const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
        if (!arr.some((x) => Number(getGenericId(x) ?? x?.id) === Number(newId))) {
          arr.push({ id: Number(newId), nombre: newNombre });
        }
        next[key] = arr;
        return next;
      });
      try { onCatalogCreated?.({ catalogo, item: { id: Number(newId), nombre: newNombre } }); } catch {}
      if (catalogo === "proveedores") {
        setForm((p) => ({ ...p, id_proveedor: String(Number(newId)) }));
        setProveedorInput(newNombre);
        setProveedorFocus(false);
        setTimeout(() => proveedorInputRef.current?.focus(), 0);
      } else {
        setForm((p) => ({ ...p, id_detalle: String(Number(newId)) }));
        setDetalleInput(newNombre);
        setDetalleFocus(false);
        setTimeout(() => detalleInputRef.current?.focus(), 0);
      }
      setAddUI({ open: false, catalogo: null, text: "", saving: false });
      showToast("exito", `${catalogo === "proveedores" ? "Proveedor" : "Detalle"} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando el ítem.", 4200);
    }
  }, [ENDPOINT_BASE, addUI.catalogo, addUI.text, showToast, onCatalogCreated]);

  const resolveIdByExactName = useCallback(
    (kind) => {
      const norm = (s) => String(s ?? "").trim().toLowerCase();
      if (kind === "proveedor") {
        const name = norm(proveedorInput);
        if (!name) return null;
        const hit = (Array.isArray(safeLists.proveedores) ? safeLists.proveedores : []).find(
          (p) => norm(p?.nombre) === name
        );
        return hit ? getGenericId(hit) : null;
      }
      if (kind === "detalle") {
        const name = norm(detalleInput);
        if (!name) return null;
        const hit = (Array.isArray(safeLists.detalles) ? safeLists.detalles : []).find(
          (d) => norm(d?.nombre) === name
        );
        return hit ? getGenericId(hit) : null;
      }
      return null;
    },
    [proveedorInput, detalleInput, safeLists.proveedores, safeLists.detalles]
  );

  // ── Reset al abrir ──
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;

    setSaving(false);
    setAddUI({ open: false, catalogo: null, text: "", saving: false });
    setOpenVerComp(false);
    setCompUrl("");

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(listsRef.current) };
    setLocalLists(merged);

    const fixedLocal = { idEntrada: findIdByIncludes(merged.tiposMovimiento, "entrada") };
    const built = buildFormFromRowCompra(rowRef.current, fixedLocal);
    setForm(built);
    setProveedorInput(
      nameById(merged.proveedores, built.id_proveedor) || String(rowRef.current?.proveedor || "").trim()
    );
    setProveedorFocus(false);
    setDetalleInput(
      nameById(merged.detalles, built.id_detalle) || String(rowRef.current?.detalle || "").trim()
    );
    setDetalleFocus(false);

    const mediosIniciales = buildMediosFromRowCompra(rowRef.current, merged.mediosPago);
    setMediosFilas(mediosIniciales);

    mediosIniciales.forEach((mp) => {
      const medioObj = (Array.isArray(merged.mediosPago) ? merged.mediosPago : []).find(
        (x) => String(getGenericId(x) ?? x?.id_medio_pago ?? "") === String(mp.id_medio_pago ?? "")
      );
      const tipoCheque = normalizeChequeTipoFromMedio(medioObj?.nombre || "");
      if (tipoCheque) {
        const includeIds = Array.isArray(mp.id_cheque) ? mp.id_cheque : [];
        setTimeout(() => { cargarChequesParaFila(mp.id, mp.id_medio_pago, includeIds); }, 0);
      }
    });

    const url = getComprobanteUrl(rowRef.current);
    setArchivoActualUrl(url || "");
    setArchivoActualNombre(getFriendlyComprobanteName(rowRef.current, url));
    setArchivoActualId(getComprobanteIdFromRow(rowRef.current));
    setArchivoNuevo(null);
    setQuitarArchivoActual(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open, cargarChequesParaFila]);

  // ── Escape ──
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (openVerComp) { setOpenVerComp(false); return; }
      if (saving || addUI.open) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, addUI.open, onClose, openVerComp]);

  const cerrar = useCallback(() => {
    if (saving || addUI.open || openVerComp) return;
    onClose?.();
  }, [saving, addUI.open, openVerComp, onClose]);

  // ── Fecha ──
  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el || saving || el.disabled) return;
    try { if (typeof el.showPicker === "function") el.showPicker(); else el.focus(); } catch { el.focus(); }
  }, [saving]);

  const onFechaChange = useCallback((iso) => {
    setForm((p) => ({ ...p, fecha: String(iso || "").trim() }));
  }, []);

  // ── Cálculo ──
  const recalcFromItem = useCallback((nextPartial) => {
    setForm((p) => {
      const next = { ...p, ...nextPartial };
      const t = calcItemTotals(safeNumber(next.cantidad), safeNumber(next.precio), safeNumber(next.iva_pct));
      next.subtotal = t.subtotal;
      next.iva_monto = t.iva_monto;
      next.total = t.total;
      next.monto_total = t.total;
      return next;
    });
  }, []);

  const onCantidadChange = useCallback((v) => recalcFromItem({ cantidad: v === "" ? "" : Number(v) }), [recalcFromItem]);
  const onPrecioChange   = useCallback((v) => recalcFromItem({ precio: v === "" ? "" : Number(v) }), [recalcFromItem]);
  const onIvaPctChange   = useCallback((v) => recalcFromItem({ iva_pct: v === "" ? "" : Number(v) }), [recalcFromItem]);

  // ── Autocomplete proveedor/detalle ──
  const filteredProveedores = useMemo(() => {
    const all = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
    const q = proveedorInput.trim().toLowerCase();
    if (!proveedorFocus || q.length < 1) return [];
    return all.filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
  }, [safeLists.proveedores, proveedorInput, proveedorFocus]);

  const filteredDetalles = useMemo(() => {
    const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
    const q = detalleInput.trim().toLowerCase();
    if (!detalleFocus || q.length < 1) return [];
    return all.filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
  }, [safeLists.detalles, detalleInput, detalleFocus]);

  const handleProveedorInputChange = useCallback((e) => {
    setProveedorInput(e.target.value);
    setForm((prev) => ({ ...prev, id_proveedor: NULL_OPTION }));
  }, []);
  const handleSelectProveedor = useCallback((proveedor) => {
    const nombre = String(proveedor?.nombre ?? "").trim();
    const pid = getGenericId(proveedor);
    setProveedorInput(nombre);
    setForm((prev) => ({ ...prev, id_proveedor: pid != null ? String(pid) : NULL_OPTION }));
    setProveedorFocus(false);
  }, []);
  const handleDetalleInputChange = useCallback((e) => {
    setDetalleInput(e.target.value);
    setForm((prev) => ({ ...prev, id_detalle: NULL_OPTION }));
  }, []);
  const handleSelectDetalle = useCallback((det) => {
    const nombre = String(det?.nombre ?? "").trim();
    const did = getGenericId(det);
    setDetalleInput(nombre);
    setForm((prev) => ({ ...prev, id_detalle: did != null ? String(did) : NULL_OPTION }));
    setDetalleFocus(false);
  }, []);

  // ── Payload final ──
  const payload = useMemo(() => {
    const toNullableId = (v) => {
      if (v === NULL_OPTION || v === "" || v == null || v === ADD_OPTION) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const cantidad = Math.max(0, safeNumber(form.cantidad));
    const precio   = Math.max(0, safeNumber(form.precio));
    const iva_pct  = Math.max(0, safeNumber(form.iva_pct));
    const t = calcItemTotals(cantidad, precio, iva_pct);

    const mediosPagoPayload = esContado
      ? mediosFilas.flatMap((mp) => {
          const idMp = Number(mp.id_medio_pago || 0);
          if (!(idMp > 0)) return [];
          const medioObj = (Array.isArray(safeLists.mediosPago) ? safeLists.mediosPago : []).find(
            (x) => String(getMedioPagoId(x) ?? "") === String(idMp)
          );
          const tipoCheque = normalizeChequeTipoFromMedio(medioObj?.nombre || "");
          const seleccionados = Array.isArray(mp.id_cheque) ? mp.id_cheque : [];
          if (tipoCheque && seleccionados.length) {
            return seleccionados.map((idChequeStr) => {
              const ch = (Array.isArray(mp.chequesDisponibles) ? mp.chequesDisponibles : []).find(
                (x) => String(x.id_cheque) === String(idChequeStr)
              );
              return { id_medio_pago: idMp, monto: Math.round(safeNumber(ch?.importe || 0) * 100) / 100, id_cheque: Number(idChequeStr) };
            });
          }
          return [{ id_medio_pago: idMp, monto: Math.round(safeNumber(mp.monto) * 100) / 100 }];
        })
      : [];

    return {
      id_movimiento:      form.id_movimiento,
      fecha:              form.fecha,
      id_tipo_venta:      toNullableId(form.id_tipo_venta),
      id_tipo_movimiento: toNullableId(form.id_tipo_movimiento),
      id_proveedor:       toNullableId(form.id_proveedor),
      id_cliente:         null,
      id_detalle:         toNullableId(form.id_detalle),
      cantidad:           Math.round(cantidad * 1000) / 1000,
      precio:             Math.round(precio * 100) / 100,
      iva_pct:            Math.round(iva_pct * 100) / 100,
      subtotal:           t.subtotal,
      iva_monto:          t.iva_monto,
      total:              t.total,
      monto_total:        Math.max(0, Math.round(t.total * 100) / 100),
      accion_compra:      esContado ? "pagar" : "guardar",
      es_pagada:          esContado,
      id_medio_pago:      null,
      medios_pago:        mediosPagoPayload,
    };
  }, [form, esContado, mediosFilas, safeLists.mediosPago]);

  // ── Comprobante: helpers ──
  const eliminarComprobanteActual = useCallback(async () => {
    if (!form.id_movimiento) throw new Error("Falta id_movimiento para eliminar el comprobante.");
    const body = {
      action: "compras_eliminar_comprobante",
      id_movimiento: Number(form.id_movimiento),
      ...(archivoActualId ? { id_comprobante: Number(archivoActualId) } : {}),
    };
    const data = await apiPostJson(ENDPOINT_DELETE_COMP, body);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el comprobante actual.");
    setArchivoActualUrl("");
    setArchivoActualNombre("");
    setArchivoActualId(null);
    setQuitarArchivoActual(false);
    setOpenVerComp(false);
    setCompUrl("");
    return data;
  }, [ENDPOINT_DELETE_COMP, form.id_movimiento, archivoActualId]);

  const subirNuevoComprobante = useCallback(async (idMovimiento, archivo) => {
    if (!idMovimiento || !archivo) return null;
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("tipo", "FACTURA");
    fd.append("force", "0");
    fd.append("ids_movimiento", JSON.stringify([Number(idMovimiento)]));
    const data = await apiPostForm(ENDPOINT_UPLOAD_LINK, fd);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo subir y vincular el nuevo archivo.");
    setArchivoNuevo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    return data;
  }, [ENDPOINT_UPLOAD_LINK]);

  // ── Comprobante: acciones de UI ──

  // Qué archivo mostrar actualmente en la UI
  // Prioridad: archivo nuevo > archivo actual (si no fue quitado)
  const archivoMostrado = archivoNuevo
    ? { tipo: "nuevo", nombre: archivoNuevo.name, size: archivoNuevo.size, file: archivoNuevo }
    : (!quitarArchivoActual && (archivoActualUrl || archivoActualId))
      ? { tipo: "actual", nombre: archivoActualNombre || "Comprobante actual", url: archivoActualUrl }
      : null;

  // Ver comprobante — mismo comportamiento que NuevaCompra:
  // archivo nuevo → createObjectURL; archivo actual → URL del servidor
  const handleOpenVerComprobante = useCallback(() => {
    if (!archivoMostrado) return;
    if (archivoMostrado.tipo === "nuevo") {
      const url = URL.createObjectURL(archivoMostrado.file);
      setCompUrl(url);
      setOpenVerComp(true);
    } else {
      const targetUrl = String(archivoMostrado.url || "").trim();
      if (!targetUrl) { showToast("advertencia", "No hay comprobante para visualizar.", 2600); return; }
      setCompUrl(targetUrl);
      setOpenVerComp(true);
    }
  }, [archivoMostrado, showToast]);

  const handleCloseVerComprobante = useCallback(() => {
    setOpenVerComp(false);
    // Si era un object URL (archivo nuevo), revocarlo
    if (compUrl && compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
    setCompUrl("");
  }, [compUrl]);

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => {
      if (compUrl && compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
    };
  }, [compUrl]);

  // Quitar archivo — igual que NuevaCompra
  const handleQuitarArchivo = useCallback(() => {
    if (archivoNuevo) {
      // Había un archivo nuevo seleccionado → solo limpiarlo
      setArchivoNuevo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      // Había archivo actual → marcar para eliminar al guardar
      setQuitarArchivoActual(true);
    }
    setOpenVerComp(false);
    if (compUrl && compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
    setCompUrl("");
  }, [archivoNuevo, compUrl]);

  // Seleccionar archivo — igual que NuevaCompra
  const handleOpenFilePicker = useCallback(() => {
    if (saving || addUI.open || openVerComp) return;
    fileInputRef.current?.click();
  }, [saving, addUI.open, openVerComp]);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0] || null;
    setArchivoNuevo(file);
    if (file) {
      // Si había archivo actual marcado para quitar, limpiar esa marca
      setQuitarArchivoActual(false);
      setOpenVerComp(false);
      if (compUrl && compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
      setCompUrl("");
    }
  }, [compUrl]);

  // ── Submit ──
  const submit = async (e) => {
    e.preventDefault();
    if (addUI.open) { showToast("advertencia", "Terminá de crear el registro (o cancelá) antes de guardar.", 3200); return; }
    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);
    try {
      if (!form.id_movimiento) throw new Error("Falta id_movimiento (no puedo actualizar).");
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) throw new Error("Fecha inválida.");
      if (!form.id_tipo_venta || String(form.id_tipo_venta) === NULL_OPTION) throw new Error("Tipo de compra es obligatorio.");

      let proveedorId = form.id_proveedor;
      if (!proveedorId || proveedorId === NULL_OPTION || proveedorId === ADD_OPTION) {
        const resolved = resolveIdByExactName("proveedor");
        if (resolved) proveedorId = String(resolved);
      }
      let detalleId = form.id_detalle;
      if (!detalleId || detalleId === NULL_OPTION || detalleId === ADD_OPTION) {
        const resolved = resolveIdByExactName("detalle");
        if (resolved) detalleId = String(resolved);
      }
      if (!proveedorId || proveedorId === NULL_OPTION || proveedorId === ADD_OPTION)
        throw new Error("Seleccioná un proveedor o crealo con Agregar nuevo proveedor.");
      if (!detalleId || detalleId === NULL_OPTION || detalleId === ADD_OPTION)
        throw new Error("Seleccioná un detalle o crealo con Agregar nuevo detalle.");

      const cantidad = Math.max(0, safeNumber(form.cantidad));
      const precio   = Math.max(0, safeNumber(form.precio));
      if (!(cantidad > 0)) throw new Error("La cantidad debe ser mayor a 0.");
      if (!(precio > 0))   throw new Error("El precio debe ser mayor a 0.");

      if (esContado) {
        if (!payload.medios_pago.length) throw new Error("En compras al contado debés cargar al menos un medio de pago.");
        for (let i = 0; i < mediosFilas.length; i++) {
          const mp = mediosFilas[i];
          if (!mp.id_medio_pago || mp.id_medio_pago === NULL_OPTION)
            throw new Error(`Medio de pago ${i + 1}: falta seleccionar el medio.`);
          const medioObj = (Array.isArray(safeLists.mediosPago) ? safeLists.mediosPago : []).find(
            (x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago ?? "")
          );
          const tipoCheque = normalizeChequeTipoFromMedio(medioObj?.nombre || "");
          const seleccionados = Array.isArray(mp.id_cheque) ? mp.id_cheque : [];
          if (tipoCheque) {
            if (!seleccionados.length)
              throw new Error(`Medio de pago ${i + 1}: debés seleccionar al menos un ${tipoCheque === "echeq" ? "eCheq" : "cheque"}.`);
          } else if (!(safeNumber(mp.monto) > 0)) {
            throw new Error(`Medio de pago ${i + 1}: el monto debe ser mayor a 0.`);
          }
        }
        if (sumaMediosPago < safeNumber(resumen.total) - 0.05)
          throw new Error(`La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total (${moneyARS(resumen.total)}).`);
      }

      const payloadFinal = { ...payload, id_proveedor: Number(proveedorId), id_detalle: Number(detalleId) };
      await onSave?.(payloadFinal);

      const habiaArchivo   = Boolean(archivoActualUrl || archivoActualId);
      const quiereQuitar   = Boolean(quitarArchivoActual);
      const quiereSubirNuevo = Boolean(archivoNuevo);

      if (habiaArchivo && (quiereQuitar || quiereSubirNuevo)) {
        showToast("cargando", quiereSubirNuevo ? "Reemplazando archivo…" : "Quitando archivo…", 12000);
        await eliminarComprobanteActual();
      }
      if (quiereSubirNuevo) {
        showToast("cargando", "Subiendo archivo…", 12000);
        await subirNuevoComprobante(form.id_movimiento, archivoNuevo);
      }

      if (typeof onSaved === "function") await Promise.resolve(onSaved());
      showToast("exito", "Compra actualizada correctamente.", 2400);
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando compra.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  const overlayClass    = ["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim();
  const containerClass  = ["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""].join(" ").trim();
  const miniTitle       = addUI.catalogo === "proveedores" ? "Nuevo proveedor" : addUI.catalogo === "detalles" ? "Nuevo detalle" : "Nuevo";

  return createPortal(
    <>
      <div className={overlayClass}>
        <div
          className={containerClass}
          id="mi-modal__container"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faBasketShopping} />
            </div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Editar compra</h2>
            </div>
            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={cerrar}
              aria-label="Cerrar"
              disabled={saving || addUI.open || openVerComp}
              type="button"
            >✕</button>
          </div>

          <div className="mi-modal__content">
            <div className="mi-cr-grid">

              {/* ── TABLA DE PRODUCTO (UN SOLO ÍTEM) ── */}
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

                <div ref={rowsContainerRef} className={`mi-cr-table__rows${hasScroll ? " has-scroll" : ""}`}>
                  <div className="mi-cr-row">
                    <div className="mi-cr-cell mi-cr-cell--detalle">
                      <div className="fl-field mi-autocomplete" style={{ width: "100%" }}>
                        <input
                          ref={detalleInputRef}
                          className="nv-cell-input"
                          placeholder=" "
                          value={detalleInput}
                          onChange={handleDetalleInputChange}
                          onFocus={() => setDetalleFocus(true)}
                          onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
                          disabled={saving || addUI.open || openVerComp}
                          autoComplete="off"
                        />
                        {detalleFocus && filteredDetalles.length > 0 && (
                          <ul className="mi-cr-suggest">
                            <li
                              className="mi-cr-suggest__item mi-cr-suggest__item--add"
                              onMouseDown={(e) => { e.preventDefault(); startAddDetalle(); }}
                            >
                              <span>+ Agregar "{detalleInput}"</span>
                            </li>
                            {filteredDetalles.map((d) => {
                              const did = getGenericId(d);
                              return (
                                <li
                                  key={did ?? d?.nombre}
                                  className="mi-cr-suggest__item"
                                  onMouseDown={(e) => { e.preventDefault(); handleSelectDetalle(d); }}
                                >
                                  <span className="mi-suggestText">{d.nombre}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center stock_cant">
                      <input
                        className="nv-cell-input nv-cell-input--center"
                        type="number" min="0.001" step="0.001"
                        value={form.cantidad}
                        onChange={(e) => onCantidadChange(e.target.value)}
                        disabled={saving}
                      />
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center">
                      <input
                        className="nv-cell-input nv-cell-input--right"
                        type="number" min="0" step="0.01"
                        value={form.precio}
                        onChange={(e) => onPrecioChange(e.target.value)}
                        disabled={saving}
                      />
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center">
                      <select
                        className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                        value={String(form.iva_pct)}
                        onChange={(e) => onIvaPctChange(e.target.value)}
                        disabled={saving}
                      >
                        {IVA_OPTIONS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                      {moneyARS(form.iva_monto)}
                    </div>
                    <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                      {moneyARS(form.total)}
                    </div>
                    <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell" />
                  </div>
                </div>

                <div className="mi-cr-table__foot">
                  <div className="mi-cr-foot-actions">
                    <div className="nv-foot-sep" />
                  </div>
                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                      <span>Subtotal</span><b>{moneyARS(resumen.subtotal)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                      <span>IVA</span><b>{moneyARS(resumen.iva)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--total">
                      <span>Total</span><b>{moneyARS(resumen.total)}</b>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── PANEL LATERAL ── */}
              <aside className="nc-aside">

                {/* Datos de compra */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" />
                    <span>Datos de compra</span>
                  </div>
                  <div className="nc-section-body">
                    {/* Fecha */}
                    <div className="nc-field" onClick={openDatePicker}>
                      <input
                        ref={fechaRef}
                        className="nc-input"
                        type="date"
                        placeholder=" "
                        value={form.fecha}
                        onChange={(e) => onFechaChange(e.target.value)}
                        disabled={saving}
                      />
                      <label className="nc-label">Fecha</label>
                    </div>

                    {/* Proveedor */}
                    <div className="nc-prov-wrap">
                      <div className="fl-field mi-autocomplete">
                        <input
                          ref={proveedorInputRef}
                          className="nc-input"
                          placeholder=" "
                          value={proveedorInput}
                          onChange={handleProveedorInputChange}
                          onFocus={() => setProveedorFocus(true)}
                          onBlur={() => setTimeout(() => setProveedorFocus(false), 120)}
                          disabled={saving || addUI.open}
                          autoComplete="off"
                        />
                        <label className="fl-label">Proveedor *</label>
                        {proveedorFocus && filteredProveedores.length > 0 && (
                          <ul className="mi-cr-suggest">
                            <li
                              className="mi-cr-suggest__item mi-cr-suggest__item--add"
                              onMouseDown={(e) => { e.preventDefault(); startAddProveedor(); }}
                            >
                              <span>+ Agregar "{proveedorInput}"</span>
                            </li>
                            {filteredProveedores.map((p) => {
                              const pid = getGenericId(p);
                              return (
                                <li
                                  key={pid ?? p?.nombre}
                                  className="mi-cr-suggest__item"
                                  onMouseDown={(e) => { e.preventDefault(); handleSelectProveedor(p); }}
                                >
                                  <span className="mi-suggestText">{p.nombre}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Tipo compra */}
                    <div>
                      <div className="nc-pill-label">Tipo *</div>
                      <div className="nc-pills">
                        <button
                          type="button"
                          className={`nc-pill${esContado ? " nc-pill--active" : ""}`}
                          onClick={() => setForm(p => ({ ...p, id_tipo_venta: "1" }))}
                          disabled={saving}
                        >
                          Contado
                        </button>
                        <button
                          type="button"
                          className={`nc-pill${!esContado ? " nc-pill--active" : ""}`}
                          onClick={() => setForm(p => ({ ...p, id_tipo_venta: "2" }))}
                          disabled={saving}
                        >
                          Cuenta Corriente
                        </button>
                      </div>
                    </div>

                    {/* Resumen medios pago */}
                    {esContado && (
                      <div className="nc-section" style={{ marginTop: 14 }}>
                        <div className="nc-section-head">
                          <div className="nc-section-dot" style={{ background: "#0f766e" }} />
                          <span>Medios de pago</span>
                        </div>
                        <div className="nc-section-body">
                          <PanelMediosPagoInlineCompra
                            mediosFilas={mediosFilas}
                            mediosPagoList={safeLists.mediosPago || []}
                            totalCompra={resumen.total}
                            onUpdate={updateMedioPago}
                            onRemove={removeMedioPago}
                            onAdd={addMedioPago}
                            apiGet={apiGet}
                            BASE_URL={BASE_URL}
                            showToast={showToast}
                            saving={saving}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cuenta corriente */}
                {!esContado && (
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" style={{ background: "#d97706" }} />
                      <span>Cuenta Corriente</span>
                    </div>
                    <div className="nc-section-body">
                      <div className="nc-cc-info">
                        Quedará registrada como <b>pendiente de pago</b>.
                      </div>
                    </div>
                  </div>
                )}

                {/* ── COMPROBANTE ADJUNTO — misma estética y acciones que NuevaCompra ── */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" style={{ background: "#64748b" }} />
                    <span>Comprobante adjunto</span>
                  </div>
                  <div className="nc-section-body">
                    <div className="mi-uploadCard">
                      <div className="mi-uploadCard__head">
                        <div className="mi-uploadCard__title">Comprobante</div>
                        <div className="mi-uploadCard__sub">Seleccioná, visualizá o quitá el archivo antes de guardar</div>
                      </div>
                      <div className="mi-uploadCard__body">

                        {/* Bloque archivo — idéntico a NuevaCompra */}
                        <div className={`mi-uploadFile${archivoMostrado ? " is-filled" : " is-empty"}`}>
                          {archivoMostrado ? (
                            <>
                              <div className="mi-uploadFile__icon">
                                <FontAwesomeIcon icon={faFileInvoiceDollar} />
                              </div>
                              <div className="mi-uploadFile__meta">
                                <div className="mi-uploadFile__name" title={archivoMostrado.nombre}>
                                  {archivoMostrado.nombre}
                                </div>
                                {archivoMostrado.tipo === "nuevo" && (
                                  <div className="mi-uploadFile__size">
                                    {Math.max(1, Math.round((archivoMostrado.size || 0) / 1024))} KB
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={handleOpenVerComprobante}
                                  disabled={saving}
                                  title="Ver comprobante"
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                </button>
                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={handleQuitarArchivo}
                                  disabled={saving || openVerComp}
                                  title="Quitar archivo"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="mi-uploadFile__empty">
                              {quitarArchivoActual
                                ? "El comprobante actual será eliminado al guardar"
                                : "No hay comprobante seleccionado"}
                            </div>
                          )}
                        </div>

                        {/* Barra de acciones — idéntica a NuevaCompra */}
                        <div className="mi-uploadBar" style={{ marginTop: 10 }}>
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="mi-uploadBar__input"
                            onChange={handleFileSelected}
                            disabled={saving}
                            style={{ display: "none" }}
                          />
                          <button
                            type="button"
                            className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                            onClick={handleOpenFilePicker}
                            disabled={saving}
                          >
                            <FontAwesomeIcon icon={faUpload} />{" "}
                            {archivoMostrado ? "Reemplazar archivo" : "Seleccionar archivo"}
                          </button>
                          {/* Botón cancelar quitar solo cuando hay archivo actual marcado y no hay nuevo */}
                          {quitarArchivoActual && !archivoNuevo && (
                            <button
                              type="button"
                              className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                              onClick={() => setQuitarArchivoActual(false)}
                              disabled={saving}
                            >
                              Cancelar
                            </button>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>
                </div>

                {/* Acciones */}
                <div className="nc-actions mi-cr-filters__actions">
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mit-btn--block"
                    onClick={submit}
                    disabled={saving}
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost mit-btn--block"
                    onClick={cerrar}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>

              </aside>
            </div>
          </div>

          <AddCatalogMiniModal
            open={addUI.open}
            title={miniTitle}
            label="Nombre"
            value={addUI.text}
            saving={addUI.saving}
            onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
            onCancel={() => {
              setForm((p) => ({
                ...p,
                id_proveedor: addUI.catalogo === "proveedores" ? NULL_OPTION : p.id_proveedor,
                id_detalle:   addUI.catalogo === "detalles"    ? NULL_OPTION : p.id_detalle,
              }));
              closeAddMini();
            }}
            onSave={guardarNuevoCatalogo}
          />
        </div>
      </div>

      <ModalVerComprobante
        open={openVerComp}
        url={compUrl}
        mime={archivoNuevo?.type || ""}
        fileName={archivoMostrado?.nombre || ""}
        onClose={handleCloseVerComprobante}
        title="Comprobante de compra"
      />
    </>,
    document.body
  );
}