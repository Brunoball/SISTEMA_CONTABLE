import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faUpload,
  faTrashCan,
  faEye,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

const IVA_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "10,5%", value: 10.5 },
  { label: "21%", value: 21 },
];

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
    null;

  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isPositiveId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

/* =========================
   Cuenta Corriente: unificar
========================= */
function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildSingleCuentaCorrienteOption(arrRaw) {
  const arr = Array.isArray(arrRaw) ? arrRaw : [];
  if (!arr.length) return { list: [], pickedId: null };

  const hit =
    arr.find((x) => normalizeText(x?.nombre).includes("cuenta corriente")) || arr[0];
  const pickedId = getGenericId(hit);
  if (!pickedId) return { list: [], pickedId: null };

  return { list: [{ id: pickedId, nombre: "Cuenta Corriente" }], pickedId };
}

function resolveCuentaCorrienteIdFlexible({
  formValue,
  row,
  cuentas,
  pickedId,
}) {
  const directCandidates = [
    formValue,
    row?.id_cuenta_corriente,
    row?.idCuentaCorriente,
    pickedId,
  ];

  for (const cand of directCandidates) {
    if (isPositiveId(cand)) return Number(cand);
  }

  const cuentasArr = Array.isArray(cuentas) ? cuentas : [];

  if (cuentasArr.length === 1) {
    const onlyId = getGenericId(cuentasArr[0]);
    if (onlyId) return onlyId;
  }

  const hasCCText = [
    row?.cuenta_corriente,
    row?.tipo_venta,
    row?.tipo_venta_nombre,
    row?.tipoVenta,
    row?.nombre_tipo_venta,
  ].some((txt) => normalizeText(txt).includes("cuenta corriente"));

  if (hasCCText) {
    const byName = cuentasArr.find((x) =>
      normalizeText(x?.nombre).includes("cuenta corriente")
    );
    const byNameId = getGenericId(byName);
    if (byNameId) return byNameId;
  }

  return null;
}

function rowLooksCuentaCorriente(row, tiposVentaArr = []) {
  if (!row) return false;

  if (isPositiveId(row?.id_cuenta_corriente) || isPositiveId(row?.idCuentaCorriente)) {
    return true;
  }

  const textHit = [
    row?.cuenta_corriente,
    row?.tipo_venta,
    row?.tipo_venta_nombre,
    row?.tipoVenta,
    row?.nombre_tipo_venta,
  ].some((txt) => normalizeText(txt).includes("cuenta corriente"));

  if (textHit) return true;

  const tipoId = Number(row?.id_tipo_venta ?? row?.idTipoVenta);
  if (Number.isFinite(tipoId) && tipoId > 0) {
    const tipoObj = (Array.isArray(tiposVentaArr) ? tiposVentaArr : []).find(
      (x) => String(getGenericId(x) ?? x?.id) === String(tipoId)
    );
    if (tipoObj) {
      const nombre = normalizeText(tipoObj?.nombre);
      if (nombre && !nombre.includes("contado")) return true;
    }
  }

  return false;
}

/* =========================
   Auth helpers
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

/* =========================
   API helpers
========================= */
async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(
      `Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`
    );
  }

  if (!res.ok) {
    const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function apiPostJson(url, payload) {
  const { token, sessionKey } = getAuthInfo();
  const headers = { "Content-Type": "application/json" };
  if (sessionKey) headers["X-Session"] = sessionKey;
  else if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });

  return await parseJsonOrThrow(res);
}

async function apiPostForm(url, formData) {
  const { token, sessionKey } = getAuthInfo();
  const headers = {};
  if (sessionKey) headers["X-Session"] = sessionKey;
  else if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formData,
  });

  return await parseJsonOrThrow(res);
}

/* =========================
   Helpers base
========================= */
function safeNumber(v) {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   Cálculo item
========================= */
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
      : Array.isArray(src.tipos_movimiento)
      ? src.tipos_movimiento
      : [];

  const tiposVenta =
    Array.isArray(src.tiposVenta) && src.tiposVenta.length
      ? src.tiposVenta
      : Array.isArray(src.tipos_venta)
      ? src.tipos_venta
      : [];

  const cuentas =
    Array.isArray(src.cuentasCorrientes) && src.cuentasCorrientes.length
      ? src.cuentasCorrientes
      : Array.isArray(src.cuentas_corrientes)
      ? src.cuentas_corrientes
      : Array.isArray(src.cuenta_corriente)
      ? src.cuenta_corriente
      : [];

  const medios =
    Array.isArray(src.mediosPago) && src.mediosPago.length
      ? src.mediosPago
      : Array.isArray(src.medios_pago)
      ? src.medios_pago
      : Array.isArray(src.medios)
      ? src.medios
      : [];

  const proveedores =
    Array.isArray(src.proveedores) && src.proveedores.length
      ? src.proveedores
      : Array.isArray(src.proveedor)
      ? src.proveedor
      : [];

  return {
    tiposVenta: Array.isArray(tiposVenta) ? tiposVenta : [],
    cuentasCorrientes: Array.isArray(cuentas) ? cuentas : [],
    tiposMovimiento: Array.isArray(tiposMov) ? tiposMov : [],
    proveedores,
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    mediosPago: Array.isArray(medios) ? medios : [],
  };
}

/* =========================
   Util
========================= */
function normText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function findIdByIncludes(arr, includesText) {
  const inc = normText(includesText);
  const a = Array.isArray(arr) ? arr : [];
  const hit = a.find((x) => normText(x?.nombre).includes(inc));
  const id = getGenericId(hit);
  return id ? String(id) : NULL_OPTION;
}

function findIdByExactOrIncludesName(arr, text) {
  const target = normText(text);
  if (!target) return null;
  const list = Array.isArray(arr) ? arr : [];

  const exact = list.find((x) => normText(x?.nombre) === target);
  if (exact) return getGenericId(exact);

  const partial = list.find((x) => {
    const n = normText(x?.nombre);
    return n.includes(target) || target.includes(n);
  });
  return partial ? getGenericId(partial) : null;
}

function nameById(arr, id) {
  const sid = String(id ?? "").trim();
  if (!sid || sid === NULL_OPTION || sid === ADD_OPTION) return "";
  const found = (Array.isArray(arr) ? arr : []).find(
    (x) => String(getGenericId(x) ?? x?.id) === sid
  );
  return String(found?.nombre ?? "").trim();
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
  return n.includes("contado") || n.includes("efectivo") || n.includes("cash");
}

function isTemaOscuro() {
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
}

/* =========================
   Helpers comprobante
========================= */
function extractIdComprobanteFromUrlLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  const m1 = s.match(/[?&]id_comprobante=(\d+)/i);
  if (m1) {
    const n = Number(m1[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const m2 = s.match(/[?&]id=(\d+)/i);
  if (m2) {
    const n = Number(m2[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

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
    row?.factura_url,
    row?.factura,
    row?.comprobante_url,
    row?.comprobante,
    row?.archivo_url,
    row?.url_factura,
    row?.path_factura,
    row?.factura_path,
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
    row?.factura_url,
    row?.factura,
    row?.comprobante_url,
    row?.comprobante,
    row?.archivo_url,
    row?.url_factura,
    row?.path_factura,
    row?.factura_path,
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
  ) {
    return "";
  }

  return onlyName;
}

function getFriendlyComprobanteName(row, url) {
  const candidates = [
    row?.archivo_nombre,
    row?.nombre_archivo,
    row?.factura_nombre,
    row?.comprobante_nombre,
    row?.archivo,
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
   Build form desde row
========================= */
function buildFormFromRowCompra(row, fixedLocal, cuentaCorrientePickedId) {
  const r = row || {};
  const nOrNull = (v) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? String(Number(v)) : NULL_OPTION;
  const sOrNull = (v) => (v == null || v === "" || v === 0 ? NULL_OPTION : String(v));

  const cantidad = r.cantidad != null ? safeNumber(r.cantidad) : 1;
  const precio = r.precio != null ? safeNumber(r.precio) : safeNumber(r.monto_total);
  const iva_pct = r.iva_pct != null ? safeNumber(r.iva_pct) : 0;

  const totals = calcItemTotals(cantidad, precio, iva_pct);

  const subtotal = r.subtotal != null ? safeNumber(r.subtotal) : totals.subtotal;
  const iva_monto = r.iva_monto != null ? safeNumber(r.iva_monto) : totals.iva_monto;
  const total = r.total != null ? safeNumber(r.total) : totals.total;
  const monto_total = r.monto_total != null ? safeNumber(r.monto_total) : total;

  const idEntrada = fixedLocal?.idEntrada ?? NULL_OPTION;
  const rowCC = sOrNull(r.id_cuenta_corriente);
  const ccFallback = cuentaCorrientePickedId ? String(cuentaCorrientePickedId) : NULL_OPTION;

  return {
    id_movimiento: safeNumber(r.id_movimiento ?? r.id ?? r.id_compra) || null,
    fecha: String(r.fecha || "").slice(0, 10) || "",
    id_tipo_venta: nOrNull(r.id_tipo_venta),
    id_tipo_movimiento: idEntrada !== NULL_OPTION ? idEntrada : nOrNull(r.id_tipo_movimiento),
    id_proveedor: sOrNull(r.id_proveedor),
    id_detalle: sOrNull(r.id_detalle),
    id_medio_pago: nOrNull(r.id_medio_pago),
    id_cuenta_corriente: rowCC !== NULL_OPTION ? rowCC : ccFallback,
    monto_total: Math.max(0, Math.round(monto_total * 100) / 100),
    cantidad: Math.max(0, Math.round(cantidad * 1000) / 1000),
    precio: Math.max(0, Math.round(precio * 100) / 100),
    iva_pct: Math.max(0, Math.round(iva_pct * 100) / 100),
    subtotal: Math.max(0, Math.round(subtotal * 100) / 100),
    iva_monto: Math.max(0, Math.round(iva_monto * 100) / 100),
    total: Math.max(0, Math.round(total * 100) / 100),
  };
}

/* =========================
   Mini modal reutilizable
========================= */
function AddCatalogMiniModal({
  open,
  title,
  label = "Nombre",
  value,
  saving,
  onChange,
  onCancel,
  onSave,
  dark = false,
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
          <button
            type="button"
            className="mi-mini__close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mi-mini__body">
          <div className="fl-field">
            <input
              ref={inputRef}
              className="fl-input"
              placeholder=" "
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
            <label className="fl-label">{label}</label>
          </div>

          <div className="mi-mini__actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

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

  const [darkAuto, setDarkAuto] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDarkAuto(isTemaOscuro());

    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const obsBody = new MutationObserver(update);
    if (document.body) {
      obsBody.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    update();
    return () => {
      obsHtml.disconnect();
      obsBody.disconnect();
    };
  }, []);

  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const listsRef = useRef(lists);
  const rowRef = useRef(row);
  useEffect(() => void (listsRef.current = lists), [lists]);
  useEffect(() => void (rowRef.current = row), [row]);

  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeIncomingLists(lists),
  }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const safeLists = useMemo(() => localLists, [localLists]);

  const ccNormalized = useMemo(
    () => buildSingleCuentaCorrienteOption(safeLists.cuentasCorrientes),
    [safeLists.cuentasCorrientes]
  );
  const cuentaCorrientePickedId = useMemo(
    () => ccNormalized.pickedId,
    [ccNormalized.pickedId]
  );

  const [saving, setSaving] = useState(false);

  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);

  const [detalleInput, setDetalleInput] = useState("");
  const [detalleFocus, setDetalleFocus] = useState(false);

  const [archivoNuevo, setArchivoNuevo] = useState(null);
  const [archivoActualUrl, setArchivoActualUrl] = useState("");
  const [archivoActualNombre, setArchivoActualNombre] = useState("");
  const [archivoActualId, setArchivoActualId] = useState(null);
  const [quitarArchivoActual, setQuitarArchivoActual] = useState(false);

  const [openVerComp, setOpenVerComp] = useState(false);
  const [compUrl, setCompUrl] = useState("");

  const closeBtnRef = useRef(null);
  const fechaRef = useRef(null);
  const proveedorInputRef = useRef(null);
  const detalleInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [addUI, setAddUI] = useState({
    open: false,
    catalogo: null,
    text: "",
    saving: false,
  });

  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, catalogo: null, text: "", saving: false });
  }, [addUI.saving]);

  const startAddProveedor = useCallback(() => {
    if (saving) return;
    setProveedorFocus(false);
    setAddUI({
      open: true,
      catalogo: "proveedores",
      text: proveedorInput.trim() || "",
      saving: false,
    });
    setForm((p) => ({ ...p, id_proveedor: ADD_OPTION }));
  }, [saving, proveedorInput]);

  const startAddDetalle = useCallback(() => {
    if (saving) return;
    setDetalleFocus(false);
    setAddUI({
      open: true,
      catalogo: "detalles",
      text: detalleInput.trim() || "",
      saving: false,
    });
    setForm((p) => ({ ...p, id_detalle: ADD_OPTION }));
  }, [saving, detalleInput]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const catalogo = addUI.catalogo;
    const nombre = String(addUI.text || "").trim();

    if (!catalogo) return;
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }

    const { sessionKey, idUsuario } = getAuthInfo();
    if (!sessionKey) {
      showToast(
        "error",
        "No hay sesión activa (Falta X-Session). Iniciá sesión de nuevo.",
        5200
      );
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast(
      "cargando",
      `Creando ${catalogo === "proveedores" ? "proveedor" : "detalle"}…`,
      12000
    );

    try {
      const data = await apiPostJson(`${ENDPOINT_BASE}?action=catalogo_crear`, {
        catalogo,
        nombre,
        idUsuario,
      });
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

      try {
        onCatalogCreated?.({
          catalogo,
          item: { id: Number(newId), nombre: newNombre },
        });
      } catch {}

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
      showToast(
        "exito",
        `${catalogo === "proveedores" ? "Proveedor" : "Detalle"} creado: "${newNombre}"`,
        2600
      );
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
        const all = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
        const hit = all.find((p) => norm(p?.nombre) === name);
        return hit ? getGenericId(hit) : null;
      }

      if (kind === "detalle") {
        const name = norm(detalleInput);
        if (!name) return null;
        const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
        const hit = all.find((d) => norm(d?.nombre) === name);
        return hit ? getGenericId(hit) : null;
      }

      return null;
    },
    [proveedorInput, detalleInput, safeLists.proveedores, safeLists.detalles]
  );

  const [form, setForm] = useState(() => {
    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    const fixedLocal = {
      idEntrada: findIdByIncludes(merged.tiposMovimiento, "entrada"),
    };

    const ccPick = buildSingleCuentaCorrienteOption(merged.cuentasCorrientes).pickedId;
    return buildFormFromRowCompra(row, fixedLocal, ccPick);
  });

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

    const fixedLocal = {
      idEntrada: findIdByIncludes(merged.tiposMovimiento, "entrada"),
    };

    const ccPick = buildSingleCuentaCorrienteOption(merged.cuentasCorrientes).pickedId;
    const built = buildFormFromRowCompra(rowRef.current, fixedLocal, ccPick);

    setForm(built);
    setProveedorInput(nameById(merged.proveedores, built.id_proveedor));
    setProveedorFocus(false);
    setDetalleInput(nameById(merged.detalles, built.id_detalle));
    setDetalleFocus(false);

    const url = getComprobanteUrl(rowRef.current);
    setArchivoActualUrl(url || "");
    setArchivoActualNombre(getFriendlyComprobanteName(rowRef.current, url));
    setArchivoActualId(getComprobanteIdFromRow(rowRef.current));
    setArchivoNuevo(null);
    setQuitarArchivoActual(false);

    if (fileInputRef.current) fileInputRef.current.value = "";

    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const currentRow = rowRef.current || {};
    const medios = Array.isArray(safeLists.mediosPago) ? safeLists.mediosPago : [];
    const proveedores = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
    const detalles = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];

    setForm((prev) => {
      let next = { ...prev };
      let changed = false;

      if ((!next.id_proveedor || next.id_proveedor === NULL_OPTION) && currentRow?.id_proveedor) {
        next.id_proveedor = String(Number(currentRow.id_proveedor));
        changed = true;
      } else if (
        (!next.id_proveedor || next.id_proveedor === NULL_OPTION) &&
        currentRow?.proveedor
      ) {
        const idProv = findIdByExactOrIncludesName(proveedores, currentRow.proveedor);
        if (idProv) {
          next.id_proveedor = String(idProv);
          changed = true;
        }
      }

      if ((!next.id_detalle || next.id_detalle === NULL_OPTION) && currentRow?.id_detalle) {
        next.id_detalle = String(Number(currentRow.id_detalle));
        changed = true;
      } else if (
        (!next.id_detalle || next.id_detalle === NULL_OPTION) &&
        currentRow?.detalle
      ) {
        const idDet = findIdByExactOrIncludesName(detalles, currentRow.detalle);
        if (idDet) {
          next.id_detalle = String(idDet);
          changed = true;
        }
      }

      if (
        (!next.id_medio_pago || next.id_medio_pago === NULL_OPTION) &&
        currentRow?.id_medio_pago
      ) {
        next.id_medio_pago = String(Number(currentRow.id_medio_pago));
        changed = true;
      } else if (
        (!next.id_medio_pago || next.id_medio_pago === NULL_OPTION) &&
        currentRow?.medio_pago_nombre
      ) {
        const idMp = findIdByExactOrIncludesName(medios, currentRow.medio_pago_nombre);
        if (idMp) {
          next.id_medio_pago = String(idMp);
          changed = true;
        }
      }

      if (
        (!next.id_cuenta_corriente || next.id_cuenta_corriente === NULL_OPTION) &&
        currentRow?.id_cuenta_corriente
      ) {
        next.id_cuenta_corriente = String(Number(currentRow.id_cuenta_corriente));
        changed = true;
      }

      return changed ? next : prev;
    });

    if ((!proveedorInput || !proveedorInput.trim()) && currentRow?.proveedor) {
      setProveedorInput(String(currentRow.proveedor).trim());
    }

    if ((!detalleInput || !detalleInput.trim()) && currentRow?.detalle) {
      setDetalleInput(String(currentRow.detalle).trim());
    }
  }, [
    open,
    safeLists.mediosPago,
    safeLists.proveedores,
    safeLists.detalles,
    proveedorInput,
    detalleInput,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (openVerComp) {
        setOpenVerComp(false);
        return;
      }
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

  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el) return;
    if (saving || el.disabled) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  }, [saving]);

  const onFechaChange = useCallback((iso) => {
    const v = String(iso || "").trim();
    setForm((p) => ({ ...p, fecha: v }));
  }, []);

  const recalcFromItem = useCallback((nextPartial) => {
    setForm((p) => {
      const next = { ...p, ...nextPartial };
      const cantidad = safeNumber(next.cantidad);
      const precio = safeNumber(next.precio);
      const iva_pct = safeNumber(next.iva_pct);
      const t = calcItemTotals(cantidad, precio, iva_pct);
      next.subtotal = t.subtotal;
      next.iva_monto = t.iva_monto;
      next.total = t.total;
      next.monto_total = t.total;
      return next;
    });
  }, []);

  const onCantidadChange = useCallback(
    (v) => recalcFromItem({ cantidad: v === "" ? "" : Number(v) }),
    [recalcFromItem]
  );
  const onPrecioChange = useCallback(
    (v) => recalcFromItem({ precio: v === "" ? "" : Number(v) }),
    [recalcFromItem]
  );
  const onIvaPctChange = useCallback(
    (v) => recalcFromItem({ iva_pct: v === "" ? "" : Number(v) }),
    [recalcFromItem]
  );

  const onMontoTotalManual = useCallback((v) => {
    const mt = v === "" ? "" : Number(v);
    setForm((p) => {
      const next = { ...p, monto_total: mt };
      const cantidad = Math.max(0, safeNumber(next.cantidad) || 1);
      const iva_pct = Math.max(0, safeNumber(next.iva_pct));
      const factor = cantidad * (1 + iva_pct / 100);
      const precio = factor > 0 ? safeNumber(mt) / factor : safeNumber(mt);
      const t = calcItemTotals(cantidad, precio, iva_pct);
      next.precio = Math.round(precio * 100) / 100;
      next.subtotal = t.subtotal;
      next.iva_monto = t.iva_monto;
      next.total = t.total;
      return next;
    });
  }, []);

  const filteredProveedores = useMemo(() => {
    const all = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
    const q = proveedorInput.trim().toLowerCase();
    if (!proveedorFocus || q.length < 1) return [];
    return all
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [safeLists.proveedores, proveedorInput, proveedorFocus]);

  const filteredDetalles = useMemo(() => {
    const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
    const q = detalleInput.trim().toLowerCase();
    if (!detalleFocus || q.length < 1) return [];
    return all
      .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [safeLists.detalles, detalleInput, detalleFocus]);

  const handleProveedorInputChange = useCallback((e) => {
    const value = e.target.value;
    setProveedorInput(value);
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
    const value = e.target.value;
    setDetalleInput(value);
    setForm((prev) => ({ ...prev, id_detalle: NULL_OPTION }));
  }, []);

  const handleSelectDetalle = useCallback((det) => {
    const nombre = String(det?.nombre ?? "").trim();
    const did = getGenericId(det);
    setDetalleInput(nombre);
    setForm((prev) => ({ ...prev, id_detalle: did != null ? String(did) : NULL_OPTION }));
    setDetalleFocus(false);
  }, []);

  const tipoVentaObj = useMemo(
    () => getTipoVentaObj(safeLists.tiposVenta, form.id_tipo_venta),
    [safeLists.tiposVenta, form.id_tipo_venta]
  );
  const esContado = useMemo(() => isTipoVentaContado(tipoVentaObj), [tipoVentaObj]);

  useEffect(() => {
    if (!open) return;
    setForm((p) => {
      const next = { ...p };
      if (esContado) {
        next.id_cuenta_corriente = NULL_OPTION;
      } else {
        next.id_medio_pago = NULL_OPTION;
        const hasCC =
          next.id_cuenta_corriente &&
          next.id_cuenta_corriente !== NULL_OPTION &&
          next.id_cuenta_corriente !== ADD_OPTION;
        if (!hasCC && cuentaCorrientePickedId) {
          next.id_cuenta_corriente = String(cuentaCorrientePickedId);
        }
      }
      return next;
    });
  }, [open, esContado, cuentaCorrientePickedId]);

  const payload = useMemo(() => {
    const toNullableId = (v) => {
      if (v === NULL_OPTION || v === "" || v == null) return null;
      if (v === ADD_OPTION) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const cantidad = Math.max(0, safeNumber(form.cantidad));
    const precio = Math.max(0, safeNumber(form.precio));
    const iva_pct = Math.max(0, safeNumber(form.iva_pct));
    const t = calcItemTotals(cantidad, precio, iva_pct);

    return {
      id_movimiento: form.id_movimiento,
      fecha: form.fecha,
      id_tipo_venta: toNullableId(form.id_tipo_venta),
      id_tipo_movimiento: toNullableId(form.id_tipo_movimiento),
      id_proveedor: toNullableId(form.id_proveedor),
      id_cliente: null,
      id_detalle: toNullableId(form.id_detalle),
      id_medio_pago: esContado ? toNullableId(form.id_medio_pago) : null,
      id_cuenta_corriente: !esContado ? toNullableId(form.id_cuenta_corriente) : null,
      cantidad: Math.round(cantidad * 1000) / 1000,
      precio: Math.round(precio * 100) / 100,
      iva_pct: Math.round(iva_pct * 100) / 100,
      subtotal: t.subtotal,
      iva_monto: t.iva_monto,
      total: t.total,
      monto_total: Math.max(0, Math.round(t.total * 100) / 100),
    };
  }, [form, esContado]);

  const eliminarComprobanteActual = useCallback(async () => {
    if (!form.id_movimiento) {
      throw new Error("Falta id_movimiento para eliminar el comprobante.");
    }

    const body = {
      action: "compras_eliminar_comprobante",
      id_movimiento: Number(form.id_movimiento),
      ...(archivoActualId ? { id_comprobante: Number(archivoActualId) } : {}),
    };

    const data = await apiPostJson(ENDPOINT_DELETE_COMP, body);
    if (!data?.exito) {
      throw new Error(data?.mensaje || "No se pudo eliminar el comprobante actual.");
    }

    setArchivoActualUrl("");
    setArchivoActualNombre("");
    setArchivoActualId(null);
    setQuitarArchivoActual(false);
    setOpenVerComp(false);
    setCompUrl("");

    return data;
  }, [ENDPOINT_DELETE_COMP, form.id_movimiento, archivoActualId]);

  const subirNuevoComprobante = useCallback(
    async (idMovimiento, archivo) => {
      if (!idMovimiento || !archivo) return null;

      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", "FACTURA");
      fd.append("force", "0");
      fd.append("ids_movimiento", JSON.stringify([Number(idMovimiento)]));

      const data = await apiPostForm(ENDPOINT_UPLOAD_LINK, fd);
      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo subir y vincular el nuevo archivo.");
      }

      setArchivoNuevo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return data;
    },
    [ENDPOINT_UPLOAD_LINK]
  );

  const handleOpenVerComprobante = useCallback(() => {
    const targetUrl = String(archivoActualUrl || "").trim();
    if (!targetUrl) {
      showToast("advertencia", "No hay comprobante para visualizar.", 2600);
      return;
    }

    setCompUrl(targetUrl);
    setOpenVerComp(true);
  }, [archivoActualUrl, showToast]);

  const handleCloseVerComprobante = useCallback(() => {
    setOpenVerComp(false);
    setCompUrl("");
  }, []);

  const handleReplaceFileClick = useCallback(() => {
    if (saving || addUI.open || openVerComp) return;
    fileInputRef.current?.click();
  }, [saving, addUI.open, openVerComp]);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0] || null;
    setArchivoNuevo(file);
    if (file) {
      setQuitarArchivoActual(false);
      setOpenVerComp(false);
      setCompUrl("");
    }
  }, []);

  const submit = async (e) => {
    e.preventDefault();

    if (addUI.open) {
      showToast(
        "advertencia",
        "Terminá de crear el registro (o cancelá) antes de guardar.",
        3200
      );
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      if (!form.id_movimiento) throw new Error("Falta id_movimiento (no puedo actualizar).");
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) {
        throw new Error("Fecha inválida.");
      }

      if (!form.id_tipo_venta || String(form.id_tipo_venta) === NULL_OPTION) {
        throw new Error("Tipo de compra es obligatorio.");
      }

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

      if (!proveedorId || proveedorId === NULL_OPTION || proveedorId === ADD_OPTION) {
        throw new Error("Seleccioná un proveedor o crealo con Agregar nuevo proveedor.");
      }
      if (!detalleId || detalleId === NULL_OPTION || detalleId === ADD_OPTION) {
        throw new Error("Seleccioná un detalle o crealo con Agregar nuevo detalle.");
      }

      let finalMedioPago = form.id_medio_pago;
      let finalCuentaCorrienteId = null;

      const originalEraCC = rowLooksCuentaCorriente(rowRef.current, safeLists.tiposVenta);
      const editQuedaEnCC = !esContado;

      if (esContado) {
        if (!finalMedioPago || String(finalMedioPago) === NULL_OPTION) {
          throw new Error("En compras al contado el Medio de pago es obligatorio.");
        }
      } else {
        finalMedioPago = NULL_OPTION;

        finalCuentaCorrienteId = resolveCuentaCorrienteIdFlexible({
          formValue: form.id_cuenta_corriente,
          row: rowRef.current,
          cuentas: safeLists.cuentasCorrientes,
          pickedId: cuentaCorrientePickedId,
        });

        const estaCambiandoAHCC = !originalEraCC && editQuedaEnCC;

        if (!finalCuentaCorrienteId && estaCambiandoAHCC) {
          throw new Error(
            "No se pudo determinar la Cuenta Corriente. Revisá la lista de cuentas corrientes."
          );
        }

        if (finalCuentaCorrienteId && String(finalCuentaCorrienteId) !== String(form.id_cuenta_corriente)) {
          setForm((p) => ({ ...p, id_cuenta_corriente: String(finalCuentaCorrienteId) }));
        }
      }

      const cantidad = Math.max(0, safeNumber(form.cantidad));
      const precio = Math.max(0, safeNumber(form.precio));
      const iva_pct = Math.max(0, safeNumber(form.iva_pct));
      const t = calcItemTotals(cantidad, precio, iva_pct);

      const payloadFinal = {
        ...payload,
        id_proveedor: Number(proveedorId),
        id_cliente: null,
        id_detalle: Number(detalleId),
        id_medio_pago: esContado ? Number(finalMedioPago) : null,
        cantidad: Math.round(cantidad * 1000) / 1000,
        precio: Math.round(precio * 100) / 100,
        iva_pct: Math.round(iva_pct * 100) / 100,
        subtotal: t.subtotal,
        iva_monto: t.iva_monto,
        total: t.total,
        monto_total: Math.max(0, Math.round(t.total * 100) / 100),
      };

      if (esContado) {
        payloadFinal.id_cuenta_corriente = null;
      } else if (finalCuentaCorrienteId) {
        payloadFinal.id_cuenta_corriente = Number(finalCuentaCorrienteId);
      } else {
        delete payloadFinal.id_cuenta_corriente;
      }

      await onSave?.(payloadFinal);

      const habiaArchivo = Boolean(archivoActualUrl || archivoActualId);
      const quiereQuitar = Boolean(quitarArchivoActual);
      const quiereSubirNuevo = Boolean(archivoNuevo);

      if (habiaArchivo && (quiereQuitar || quiereSubirNuevo)) {
        showToast(
          "cargando",
          quiereSubirNuevo ? "Reemplazando archivo…" : "Quitando archivo…",
          12000
        );
        await eliminarComprobanteActual();
      }

      if (quiereSubirNuevo) {
        showToast("cargando", "Subiendo archivo…", 12000);
        await subirNuevoComprobante(form.id_movimiento, archivoNuevo);
      }

      if (typeof onSaved === "function") {
        await Promise.resolve(onSaved());
      }

      showToast("exito", "Compra actualizada correctamente.", 2400);
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando compra.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  const overlayClass = [
    "mi-modal__overlay",
    "mi-modal__overlay--mov",
    dark ? "mi-modal__overlay--dark" : "",
  ]
    .join(" ")
    .trim();

  const containerClass = [
    "mi-modal__container",
    "mi-modal__container--mov",
    "mi-modal__container--venta",
    dark ? "mi-modal--dark" : "",
  ]
    .join(" ")
    .trim();

  const miniTitle =
    addUI.catalogo === "proveedores"
      ? "Nuevo proveedor"
      : addUI.catalogo === "detalles"
      ? "Nuevo detalle"
      : "Nuevo";

  const mostrarArchivoActual = Boolean((archivoActualUrl || archivoActualId) && !quitarArchivoActual);

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
          <div className="mi-modal__header">
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Editar compra</h2>
              <p className="mi-modal__subtitle">
                Actualizá los campos, el comprobante y guardá.
              </p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={cerrar}
              aria-label="Cerrar"
              disabled={saving || addUI.open || openVerComp}
              type="button"
            >
              ✕
            </button>
          </div>

          <form onSubmit={submit} className="mi-em-form">
            <div className="mi-em-grid">
              <section className="mi-em-panel">
                <div className="mi-em-panelHead">Datos de la compra</div>

                <div className="mi-em-panelBody">
                  <div className="mi-row2">
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.id_tipo_venta)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, id_tipo_venta: e.target.value }))
                        }
                        disabled={saving || addUI.open || openVerComp}
                      >
                        <option value={NULL_OPTION}>-- Seleccionar tipo de compra --</option>
                        {(safeLists.tiposVenta || []).map((x) => {
                          const xid = getGenericId(x) ?? Number(x?.id);
                          return (
                            <option key={xid ?? x?.nombre} value={String(xid ?? "")}>
                              {x.nombre}
                            </option>
                          );
                        })}
                      </select>
                      <label className="fl-label">Tipo de compra</label>
                    </div>

                    <div className="fl-field mi-autocomplete">
                      <input
                        ref={detalleInputRef}
                        className="fl-input"
                        placeholder=" "
                        value={detalleInput}
                        onChange={handleDetalleInputChange}
                        onFocus={() => setDetalleFocus(true)}
                        onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
                        disabled={saving || addUI.open || openVerComp}
                        autoComplete="off"
                      />
                      <label className="fl-label">Detalle</label>

                      {detalleFocus && filteredDetalles.length > 0 && (
                        <ul className="mi-cr-suggest">
                          {filteredDetalles.map((d) => {
                            const did = getGenericId(d);
                            return (
                              <li
                                key={did ?? d?.nombre}
                                className="mi-cr-suggest__item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectDetalle(d);
                                }}
                              >
                                <span className="mi-suggestText">{d.nombre}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <button
                        type="button"
                        onClick={startAddDetalle}
                        disabled={saving || addUI.saving || openVerComp}
                        className="mi-link"
                      >
                        + Agregar nuevo detalle
                      </button>
                    </div>
                  </div>

                  <div className="mi-em-item fl-col-full">
                    <div className="mi-em-itemTitle">Ítem de la compra (editable)</div>

                    <div className="mi-em-itemGrid3">
                      <div className="fl-field">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder=" "
                          value={form.cantidad}
                          onChange={(e) => onCantidadChange(e.target.value)}
                          disabled={saving || addUI.open || openVerComp}
                        />
                        <label className="fl-label">Cantidad</label>
                      </div>

                      <div className="fl-field">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder=" "
                          value={form.precio}
                          onChange={(e) => onPrecioChange(e.target.value)}
                          disabled={saving || addUI.open || openVerComp}
                        />
                        <label className="fl-label">Precio unitario</label>
                      </div>

                      <div className="fl-field">
                        <select
                          className="fl-input fl-select"
                          value={String(form.iva_pct)}
                          onChange={(e) => onIvaPctChange(e.target.value)}
                          disabled={saving || addUI.open || openVerComp}
                        >
                          {IVA_OPTIONS.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">IVA %</label>
                      </div>
                    </div>

                    <div className="mi-em-itemTotalsGrid3">
                      <div className="fl-field">
                        <input className="fl-input" value={form.subtotal} disabled />
                        <label className="fl-label">Subtotal</label>
                      </div>
                      <div className="fl-field">
                        <input className="fl-input" value={form.iva_monto} disabled />
                        <label className="fl-label">IVA $</label>
                      </div>
                      <div className="fl-field">
                        <input className="fl-input" value={form.total} disabled />
                        <label className="fl-label">Total</label>
                      </div>
                    </div>
                  </div>

                  <div className="fl-field fl-col-full">
                    <input
                      className="fl-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder=" "
                      value={form.monto_total}
                      onChange={(e) => onMontoTotalManual(e.target.value)}
                      disabled={saving || addUI.open || openVerComp}
                    />
                    <label className="fl-label">Monto total (ajusta el precio)</label>
                  </div>
                </div>
              </section>

              <aside className="mi-em-aside">
                <div className="mi-em-asideTitle">Relaciones, pago y archivo</div>

                <div className="mi-em-dates">
                  <div className="fl-field fl-col-full">
                    <input
                      ref={fechaRef}
                      className="fl-input "
                      type="date"
                      value={form.fecha}
                      onChange={(e) => onFechaChange(e.target.value)}
                      disabled={saving || addUI.open || openVerComp}
                      onClick={openDatePicker}
                      onFocus={openDatePicker}
                    />
                    <label className="fl-label">Fecha</label>
                  </div>
                </div>

                <div className="mi-em-asideBody  mi-em-asideBodyheght">
                  {esContado ? (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.id_medio_pago)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, id_medio_pago: e.target.value }))
                        }
                        disabled={saving || addUI.open || openVerComp}
                      >
                        <option value={NULL_OPTION}>-- Seleccionar medio de pago --</option>
                        {(safeLists.mediosPago || []).map((x) => {
                          const xid =
                            getGenericId(x) ?? Number(x?.id ?? x?.id_medio_pago);
                          return (
                            <option key={xid ?? x?.nombre} value={String(xid ?? "")}>
                              {x.nombre}
                            </option>
                          );
                        })}
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>
                  ) : (
                    <div className="fl-field" style={{ opacity: 0.6 }}>
                      <input className="fl-input" value="No aplica" disabled />
                      <label className="fl-label">Medio de pago</label>
                    </div>
                  )}

                  <div className="fl-field mi-autocomplete">
                    <input
                      ref={proveedorInputRef}
                      className="fl-input"
                      placeholder=" "
                      value={proveedorInput}
                      onChange={handleProveedorInputChange}
                      onFocus={() => setProveedorFocus(true)}
                      onBlur={() => setTimeout(() => setProveedorFocus(false), 120)}
                      disabled={saving || addUI.open || openVerComp}
                      autoComplete="off"
                    />
                    <label className="fl-label">Proveedor</label>

                    {proveedorFocus && filteredProveedores.length > 0 && (
                      <ul className="mi-cr-suggest">
                        {filteredProveedores.map((p) => {
                          const pid = getGenericId(p);
                          return (
                            <li
                              key={pid ?? p?.nombre}
                              className="mi-cr-suggest__item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectProveedor(p);
                              }}
                            >
                              <span className="mi-suggestText">{p.nombre}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <button
                      type="button"
                      onClick={startAddProveedor}
                      disabled={saving || addUI.saving || openVerComp}
                      className="mi-link"
                    >
                      + Agregar nuevo proveedor
                    </button>
                  </div>

                  <div className="mi-uploadCard">
                    <div className="mi-uploadCard__head">
                      <div>
                        <div className="mi-uploadCard__title">Comprobante</div>
                        <div className="mi-uploadCard__sub">
                          Ver, quitar o reemplazar archivo actual
                        </div>
                      </div>
                    </div>

                    <div className="mi-uploadCard__body">
                      {mostrarArchivoActual ? (
                        <div className="mi-uploadFile is-filled">
                          <div className="mi-uploadFile__icon">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} />
                          </div>

                          <div className="mi-uploadFile__meta">
                            <div
                              className="mi-uploadFile__name"
                              title={archivoActualNombre || "Comprobante actual"}
                            >
                              {archivoActualNombre || "Comprobante actual"}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginLeft: "auto",
                              flexWrap: "wrap",
                            }}
                          >
                            {archivoActualUrl ? (
                              <button
                                type="button"
                                className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                onClick={handleOpenVerComprobante}
                                disabled={saving || addUI.open}
                                title="Ver comprobante actual"
                              >
                                <FontAwesomeIcon icon={faEye} /> Ver
                              </button>
                            ) : null}

                            <button
                              type="button"
                              className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                              onClick={() => {
                                setQuitarArchivoActual(true);
                                setArchivoNuevo(null);
                                if (fileInputRef.current) fileInputRef.current.value = "";
                                setOpenVerComp(false);
                                setCompUrl("");
                              }}
                              disabled={saving || addUI.open || openVerComp}
                              title="Quitar comprobante actual"
                            >
                              <FontAwesomeIcon icon={faTrashCan} /> Quitar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`mi-uploadFile ${archivoNuevo ? "is-filled" : "is-empty"}`}>
                          {archivoNuevo ? (
                            <>
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

                              <button
                                type="button"
                                className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                onClick={() => {
                                  setArchivoNuevo(null);
                                  if (fileInputRef.current) fileInputRef.current.value = "";
                                }}
                                disabled={saving || addUI.open || openVerComp}
                                style={{ marginLeft: "auto" }}
                              >
                                <FontAwesomeIcon icon={faXmark} /> Quitar selección
                              </button>
                            </>
                          ) : (
                            <div className="mi-uploadFile__empty">
                              {quitarArchivoActual
                                ? "El comprobante actual será eliminado al guardar"
                                : "No hay comprobante cargado"}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mi-uploadBar" style={{ marginTop: 10 }}>
                        {quitarArchivoActual && !archivoNuevo ? (
                          <button
                            type="button"
                            className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                            onClick={() => setQuitarArchivoActual(false)}
                            disabled={saving || addUI.open || openVerComp}
                          >
                            Cancelar quitar
                          </button>
                        ) : null}

                        <input
                          ref={fileInputRef}
                          type="file"
                          className="mi-uploadBar__input"
                          onChange={handleFileSelected}
                          disabled={saving || addUI.open || openVerComp}
                          style={{ display: "none" }}
                        />

                        <button
                          type="button"
                          className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                          onClick={handleReplaceFileClick}
                          disabled={saving || addUI.open || openVerComp}
                        >
                          <FontAwesomeIcon icon={faUpload} />{" "}
                          {mostrarArchivoActual ? "Reemplazar archivo" : "Seleccionar archivo"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mi-em-actions">
                    <button
                      type="submit"
                      disabled={saving || addUI.open || openVerComp}
                      className="mit-btn mit-btn--solid mit-btn--block"
                    >
                      {saving ? "Guardando..." : "Guardar"}
                    </button>

                    <button
                      type="button"
                      onClick={cerrar}
                      disabled={saving || addUI.open || openVerComp}
                      className="mit-btn mit-btn--ghost mit-btn--block"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </form>

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
                id_proveedor:
                  addUI.catalogo === "proveedores" ? NULL_OPTION : p.id_proveedor,
                id_detalle: addUI.catalogo === "detalles" ? NULL_OPTION : p.id_detalle,
              }));
              closeAddMini();
            }}
            onSave={guardarNuevoCatalogo}
            dark={dark}
          />
        </div>
      </div>

      <ModalVerComprobante
        open={openVerComp}
        url={compUrl}
        onClose={handleCloseVerComprobante}
        title="Comprobante de compra"
      />
    </>,
    document.body
  );
}