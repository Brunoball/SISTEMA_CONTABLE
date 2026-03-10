import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import BASE_URL from "../../../../config/config";
import ModalFacturaBaltoResumen from "../../Facturacion/ModalFacturaBaltoResumen.jsx";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "10,5%", value: 10.5 },
  { label: "21%", value: 21 },
];

/* =========================
   Helpers
========================= */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function plusDaysISOFrom(baseIso, days = 10) {
  const base = String(baseIso || todayISO()).slice(0, 10);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(base) ? new Date(`${base}T00:00:00`) : new Date();
  d.setDate(d.getDate() + Number(days || 0));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isBlank(v) {
  return String(v ?? "").trim() === "";
}
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}
function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function safeStr(v) {
  return String(v ?? "").trim();
}
function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   IDs tolerantes
========================= */
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

/* =========================
   Período: solo YYYY-MM para API, derivado de fecha
========================= */
function fechaToYYYYMM(isoDate) {
  const s = String(isoDate ?? "").trim().slice(0, 7); // "YYYY-MM"
  return /^\d{4}-\d{2}$/.test(s) ? s : "";
}

/* =========================
   Lists normalize
========================= */
const SAFE_LISTS = {
  clientes: [],
  detalles: [],
  medios_pago: [],
  tipos_venta: [],
  cuentas_corrientes: [],
};

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);

  const mediosPago =
    pick("medios_pago").length
      ? pick("medios_pago")
      : pick("mediosPago").length
      ? pick("mediosPago")
      : pick("medios");

  const cuentas =
    pick("cuentas_corrientes").length
      ? pick("cuentas_corrientes")
      : pick("cuentasCorrientes").length
      ? pick("cuentasCorrientes")
      : pick("cuentas");

  const tiposVenta =
    pick("tipos_venta").length
      ? pick("tipos_venta")
      : pick("tiposVenta").length
      ? pick("tiposVenta")
      : pick("tipo_venta").length
      ? pick("tipo_venta")
      : [];

  return {
    clientes: pick("clientes"),
    detalles: pick("detalles"),
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
    cuentas_corrientes: Array.isArray(cuentas) ? cuentas : [],
    tipos_venta: Array.isArray(tiposVenta) ? tiposVenta : [],
  };
}

/* =========================
   Auth + headers
========================= */
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";

  const token = localStorage.getItem("token") || "";

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
  if (!sessionKey && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiPostJson(url, payload) {
  const headers = buildAuthHeaders(true);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });
  return await parseJsonOrThrow(res);
}

async function apiGetJson(url) {
  const headers = buildAuthHeaders(false);
  const res = await fetch(url, {
    method: "GET",
    headers,
  });
  return await parseJsonOrThrow(res);
}

/* =========================
   Theme helper
========================= */
function isTemaOscuro() {
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
}

/* =========================
   Mini Modal
========================= */
function AddCatalogMiniModal({
  open,
  title,
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
            <label className="fl-label">Nombre</label>
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

/* =========================
   Validación filas
========================= */
function describeLineProblem(r, idx1based) {
  const detId = Number(r.id_detalle);
  const detTxt = String(r.detalleText || "").trim();

  const qtyBlank = isBlank(r.cantidad);
  const priceBlank = isBlank(r.precio);

  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);

  const touched =
    detTxt !== "" ||
    String(r.id_detalle || "").trim() !== "" ||
    !qtyBlank ||
    !priceBlank ||
    safeNumber(r.cantidad) !== 0 ||
    safeNumber(r.precio) !== 0;

  if (!touched) return null;

  const issues = [];
  if (!(Number.isFinite(detId) && detId > 0)) {
    issues.push(detTxt ? `el detalle "${detTxt}" no está seleccionado del listado` : "falta el detalle");
  }

  if (qtyBlank) issues.push("falta la cantidad");
  else if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser mayor a 0");

  if (priceBlank) issues.push("falta el precio");
  else if (!(Number.isFinite(price) && price > 0)) issues.push("el precio debe ser mayor a 0");

  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0 (revisá cantidad/precio)");

  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

/* =========================
   Tipo venta
========================= */
function isContadoTipoVenta(tvObj) {
  const name = String(tvObj?.nombre ?? "").toLowerCase();
  return name.includes("contado") || name.includes("efectivo");
}
function isCorrienteTipoVenta(tvObj) {
  const name = String(tvObj?.nombre ?? "").toLowerCase();
  return name.includes("corriente");
}

/* =========================
   Cliente fiscal
========================= */
function normalizeArcaSummary(summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  return {
    cuit: safeStr(s.cuit),
    razon_social: safeStr(s.razon_social),
    condicion_iva: safeStr(s.iva || s.condicion_iva),
    domicilio: safeStr(s.domicilio),
    doc_tipo: 80,
    doc_nro: safeStr(s.cuit),
    origen: "arca_cuit",
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
    origen: safeStr(s.origen || "manual"),
  };
}

function resolveClienteByInput(clientes, inputValue) {
  const q = normalizeText(inputValue);
  if (!q) return null;

  const arr = Array.isArray(clientes) ? clientes : [];

  const withMeta = arr
    .map((c) => ({
      raw: c,
      id: getClienteId(c),
      nombre: safeStr(c?.nombre),
      nombreNorm: normalizeText(c?.nombre),
    }))
    .filter((x) => x.id && x.nombreNorm);

  if (!withMeta.length) return null;

  const exact = withMeta.find((x) => x.nombreNorm === q);
  if (exact) return exact.raw;

  const starts = withMeta.filter((x) => x.nombreNorm.startsWith(q));
  if (starts.length === 1) return starts[0].raw;

  const contains = withMeta.filter((x) => x.nombreNorm.includes(q));
  if (contains.length === 1) return contains[0].raw;

  return null;
}

export default function ModalNuevaVenta({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH = `${BASE_URL}/api.php?action=ventas_crear_batch`;
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;
  const API_GET_CLIENTE_FISCAL = `${BASE_URL}/api.php?action=cliente_fiscal_get`;
  const API_SAVE_CLIENTE_FISCAL = `${BASE_URL}/api.php?action=cliente_fiscal_upsert`;
  const API_PADRON_CUIT = `${BASE_URL}/api.php?action=padron_cuit&op=padron_cuit`;
  const API_CONFIG_FACTURACION = `${BASE_URL}/api.php?action=config_facturacion_get`;
  const API_VINCULAR_COMPROBANTE = `${BASE_URL}/api.php?action=comprobantes_vincular_movimiento`;
  const API_VINCULAR_COMPROBANTE_LOTE = `${BASE_URL}/api.php?action=comprobantes_vincular_movimientos_lote`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());

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

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const [localLists, setLocalLists] = useState(() => ({ ...SAFE_LISTS, ...normalizeLists(lists) }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeLists(lists) });
  }, [lists]);

  const mediosPagoList = useMemo(
    () => (Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );
  const tiposVentaList = useMemo(
    () => (Array.isArray(localLists.tipos_venta) ? localLists.tipos_venta : []),
    [localLists.tipos_venta]
  );

  const [fecha, setFecha] = useState(todayISO());
  // ✅ Período se deriva automáticamente de la fecha (no hay campo UI)

  const [filters, setFilters] = useState({
    id_tipo_venta: NULL_OPTION,
    id_medio_pago: NULL_OPTION,
    id_cliente: NULL_OPTION,
    id_cuenta_corriente: NULL_OPTION,
  });

  const [accionContado, setAccionContado] = useState("guardar");

  const [cliInput, setCliInput] = useState("");
  const [cliFocus, setCliFocus] = useState(false);
  const closeBtnRef = useRef(null);

  const [rows, setRows] = useState(() => [
    {
      id: uid(),
      id_detalle: NULL_OPTION,
      detalleText: "",
      cantidad: 1,
      precio: 0,
      ivaPct: 0,
    },
  ]);

  const [saving, setSaving] = useState(false);

  const [addUI, setAddUI] = useState({
    open: false,
    kind: null,
    rowId: null,
    text: "",
    saving: false,
  });

  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalError, setFiscalError] = useState("");
  const [clienteFiscalDb, setClienteFiscalDb] = useState(null);
  const [fiscalCuitInput, setFiscalCuitInput] = useState("");
  const [fiscalLookupLoading, setFiscalLookupLoading] = useState(false);
  const [fiscalArcaData, setFiscalArcaData] = useState(null);

  const [configFacturacion, setConfigFacturacion] = useState(null);
  const [openResumenFactura, setOpenResumenFactura] = useState(false);
  const [resumenFacturaData, setResumenFacturaData] = useState(null);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const f = todayISO();
      setFecha(f);

      setFilters({
        id_tipo_venta: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_cliente: NULL_OPTION,
        id_cuenta_corriente: NULL_OPTION,
      });

      setAccionContado("guardar");
      setCliInput("");
      setCliFocus(false);

      setRows([
        {
          id: uid(),
          id_detalle: NULL_OPTION,
          detalleText: "",
          cantidad: 1,
          precio: 0,
          ivaPct: 0,
        },
      ]);

      setAddUI({
        open: false,
        kind: null,
        rowId: null,
        text: "",
        saving: false,
      });
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

      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  const updateFilter = useCallback((k, v) => {
    setFilters((p) => ({ ...p, [k]: v }));
  }, []);

  const onFechaChange = (iso) => {
    const v = String(iso || "").trim();
    setFecha(v);
    // Período se deriva solo de la fecha, sin campo UI
  };

  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        id: uid(),
        id_detalle: NULL_OPTION,
        detalleText: "",
        cantidad: 1,
        precio: 0,
        ivaPct: 0,
      },
    ]);
  }, []);

  const removeRow = useCallback((id) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : prev;
    });
  }, []);

  const updateRow = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );

  const suggestDetalles = useCallback(
    (txt) => {
      const q = String(txt || "").trim().toLowerCase();
      if (!q) return [];
      return detallesList
        .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
        .slice(0, 18);
    },
    [detallesList]
  );

  const startAddDetalleForRow = useCallback(
    (rowId) => {
      if (saving) return;
      setAddUI({ open: true, kind: "detalles", rowId, text: "", saving: false });
    },
    [saving]
  );

  const startAddCliente = useCallback(() => {
    if (saving) return;
    setCliFocus(false);
    setAddUI({
      open: true,
      kind: "clientes",
      rowId: null,
      text: cliInput || "",
      saving: false,
    });
  }, [saving, cliInput]);

  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({
      open: false,
      kind: null,
      rowId: null,
      text: "",
      saving: false,
    });
  }, [addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }

    const kind = addUI.kind;
    if (!kind) return;

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${kind === "detalles" ? "detalle" : "cliente"}…`, 12000);

    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(API_CATALOGO, {
        catalogo: kind,
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear.");

      const item = data?.item || {};
      const newId =
        kind === "detalles"
          ? getDetalleId(item) ?? Number(item?.id)
          : getClienteId(item) ?? Number(item?.id);

      const newNombre = String(item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(Number(newId)) || Number(newId) <= 0) {
        throw new Error("El servidor no devolvió un ID válido.");
      }

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[kind]) ? prev[kind].slice() : [];
        const already = arr.some((x) => {
          const xid = kind === "detalles" ? getDetalleId(x) : getClienteId(x);
          return Number(xid) === Number(newId);
        });
        if (!already) arr.push({ id: Number(newId), nombre: newNombre });
        next[kind] = arr;
        return next;
      });

      if (kind === "detalles" && addUI.rowId) {
        updateRow(addUI.rowId, {
          id_detalle: String(newId),
          detalleText: newNombre,
        });
      }

      if (kind === "clientes") {
        updateFilter("id_cliente", String(newId));
        setCliInput(newNombre);
        setClienteFiscalDb(null);
        setFiscalArcaData(null);
        setFiscalCuitInput("");
        setFiscalError("");
      }

      setAddUI({
        open: false,
        kind: null,
        rowId: null,
        text: "",
        saving: false,
      });

      showToast(
        "exito",
        `${kind === "detalles" ? "Detalle" : "Cliente"} creado: "${newNombre}"`,
        2600
      );
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.", 4200);
    }
  }, [API_CATALOGO, addUI, showToast, updateRow, updateFilter]);

  const clientesList = useMemo(
    () => (Array.isArray(localLists.clientes) ? localLists.clientes : []),
    [localLists.clientes]
  );

  const filteredClientes = useMemo(() => {
    const q = cliInput.trim().toLowerCase();
    if (!cliFocus || q.length < 1) return [];
    return clientesList
      .filter((c) => String(c?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [clientesList, cliInput, cliFocus]);

  const clienteResolvedFromInput = useMemo(() => {
    return resolveClienteByInput(clientesList, cliInput);
  }, [clientesList, cliInput]);

  const selectedClienteId = useMemo(() => {
    const direct = Number(filters.id_cliente);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const fallbackId = getClienteId(clienteResolvedFromInput);
    return fallbackId ?? 0;
  }, [filters.id_cliente, clienteResolvedFromInput]);

  const selectedClienteNombre = useMemo(() => {
    if (clienteResolvedFromInput?.nombre) return String(clienteResolvedFromInput.nombre).trim();
    return String(cliInput || "").trim();
  }, [clienteResolvedFromInput, cliInput]);

  useEffect(() => {
    if (!open) return;

    const direct = Number(filters.id_cliente);
    const fallbackId = getClienteId(clienteResolvedFromInput);

    if ((!Number.isFinite(direct) || direct <= 0) && fallbackId) {
      setFilters((prev) => {
        if (String(prev.id_cliente) === String(fallbackId)) return prev;
        return { ...prev, id_cliente: String(fallbackId) };
      });
    }
  }, [open, filters.id_cliente, clienteResolvedFromInput]);

  const handleClienteInputChange = useCallback((e) => {
    const value = e.target.value;
    setCliInput(value);
    setFilters((p) => ({ ...p, id_cliente: NULL_OPTION }));
    setClienteFiscalDb(null);
    setFiscalArcaData(null);
    setFiscalCuitInput("");
    setFiscalError("");
  }, []);

  const handleSelectCliente = useCallback((cli) => {
    const nombre = String(cli?.nombre ?? "").trim();
    const cid = getClienteId(cli);

    setCliInput(nombre);
    setFilters((p) => ({
      ...p,
      id_cliente: cid != null ? String(cid) : NULL_OPTION,
    }));
    setCliFocus(false);

    setClienteFiscalDb(null);
    setFiscalArcaData(null);
    setFiscalCuitInput("");
    setFiscalError("");
  }, []);

  const rowsCalc = useMemo(() => {
    return rows.map((r) => {
      const cantidad = Math.max(0, safeNumber(r.cantidad));
      const precio = Math.max(0, safeNumber(r.precio));
      const ivaPct = Math.max(0, safeNumber(r.ivaPct));
      const subtotal = cantidad * precio;
      const ivaMonto = subtotal * (ivaPct / 100);
      const total = subtotal + ivaMonto;
      return { ...r, subtotal, ivaMonto, total };
    });
  }, [rows]);

  const resumen = useMemo(() => {
    const subtotal = rowsCalc.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const iva = rowsCalc.reduce((acc, r) => acc + (r.ivaMonto || 0), 0);
    const total = rowsCalc.reduce((acc, r) => acc + (r.total || 0), 0);
    return { subtotal, iva, total };
  }, [rowsCalc]);

  const tipoVentaSelected = useMemo(() => {
    const id = Number(filters.id_tipo_venta);
    if (!Number.isFinite(id) || id <= 0) return null;
    return (
      tiposVentaList.find(
        (x) => Number(x?.id ?? x?.id_tipo_venta ?? 0) === id
      ) || null
    );
  }, [filters.id_tipo_venta, tiposVentaList]);

  const isContado = useMemo(() => isContadoTipoVenta(tipoVentaSelected), [tipoVentaSelected]);
  const isCorriente = useMemo(() => isCorrienteTipoVenta(tipoVentaSelected), [tipoVentaSelected]);

  // ✅ El panel fiscal se muestra si: hay tipo de venta seleccionado Y accion = "facturar" Y no tiene datos fiscales
  const tipoVentaSeleccionado = tipoVentaSelected !== null;
  const shouldNeedFiscalPanel =
    open && tipoVentaSeleccionado && accionContado === "facturar" && !clienteFiscalDb;

  const fetchClienteFiscal = useCallback(
    async (idCliente) => {
      const id = Number(idCliente);
      if (!Number.isFinite(id) || id <= 0) return null;

      setFiscalLoading(true);
      setFiscalError("");
      setClienteFiscalDb(null);
      setFiscalArcaData(null);

      try {
        const data = await apiGetJson(`${API_GET_CLIENTE_FISCAL}&id_cliente=${id}`);
        if (data?.existe && data?.cliente_fiscal) {
          const norm = normalizeClienteFiscalDb(data.cliente_fiscal);
          setClienteFiscalDb(norm);
          setFiscalCuitInput(norm.cuit || norm.doc_nro || "");
          return norm;
        }
        setClienteFiscalDb(null);
        return null;
      } catch (e) {
        setFiscalError(e?.message || "No se pudieron consultar los datos fiscales guardados.");
        return null;
      } finally {
        setFiscalLoading(false);
      }
    },
    [API_GET_CLIENTE_FISCAL]
  );

  const fetchConfigFacturacion = useCallback(async () => {
    const data = await apiGetJson(API_CONFIG_FACTURACION);
    const cfg = data?.config || data?.data || data || null;
    if (!cfg) throw new Error("No se pudo obtener la configuración de facturación.");
    setConfigFacturacion(cfg);
    return cfg;
  }, [API_CONFIG_FACTURACION]);

  const buscarFiscalEnArcaPorCuit = useCallback(
    async (cuitRaw) => {
      const cuit = onlyDigits(cuitRaw);

      setFiscalError("");
      setFiscalArcaData(null);

      if (cuit.length !== 11) {
        throw new Error("Ingresá un CUIT válido de 11 dígitos.");
      }

      setFiscalLookupLoading(true);
      try {
        const data = await apiGetJson(`${API_PADRON_CUIT}&cuit=${cuit}`);
        const summary = data?.data?.summary ?? data?.summary ?? null;

        if (!summary) {
          throw new Error("ARCA no devolvió datos para ese CUIT.");
        }

        const norm = normalizeArcaSummary(summary);
        if (!norm.cuit || !norm.razon_social) {
          throw new Error("ARCA devolvió datos incompletos para ese CUIT.");
        }

        setFiscalArcaData(norm);
        return norm;
      } catch (e) {
        setFiscalArcaData(null);
        setFiscalError(e?.message || "No se pudieron obtener los datos de ARCA.");
        throw e;
      } finally {
        setFiscalLookupLoading(false);
      }
    },
    [API_PADRON_CUIT]
  );

  const guardarClienteFiscal = useCallback(
    async (clienteFiscalSource) => {
      if (!selectedClienteId) {
        throw new Error("Seleccioná un cliente antes de facturar.");
      }

      const fiscal = normalizeClienteFiscalDb(clienteFiscalSource || {});
      if (!fiscal.cuit || !fiscal.razon_social) {
        throw new Error("Los datos fiscales son inválidos o incompletos.");
      }

      const { idUsuario } = getAuthInfo();
      const payload = {
        idUsuario,
        id_cliente: selectedClienteId,
        doc_tipo: Number(fiscal.doc_tipo || 80),
        doc_nro: fiscal.doc_nro || fiscal.cuit,
        cuit: fiscal.cuit,
        razon_social: fiscal.razon_social,
        condicion_iva: fiscal.condicion_iva,
        domicilio: fiscal.domicilio,
        origen: fiscal.origen || "arca_cuit",
        activo: 1,
      };

      const saved = await apiPostJson(API_SAVE_CLIENTE_FISCAL, payload);
      if (!saved?.exito || !saved?.cliente_fiscal) {
        throw new Error(saved?.mensaje || "No se pudieron guardar los datos fiscales del cliente.");
      }

      const norm = normalizeClienteFiscalDb(saved.cliente_fiscal);
      setClienteFiscalDb(norm);
      setFiscalCuitInput(norm.cuit || norm.doc_nro || "");
      return norm;
    },
    [API_SAVE_CLIENTE_FISCAL, selectedClienteId]
  );

  const resolveFiscalForFacturacion = useCallback(async () => {
    if (!selectedClienteId) {
      throw new Error("Seleccioná un cliente antes de facturar.");
    }

    const cuitIngresado = onlyDigits(fiscalCuitInput);

    if (clienteFiscalDb?.id_cliente === selectedClienteId && clienteFiscalDb?.cuit) {
      return clienteFiscalDb;
    }

    const fiscalDb = await fetchClienteFiscal(selectedClienteId);
    if (fiscalDb?.cuit) {
      return fiscalDb;
    }

    if (cuitIngresado.length !== 11) {
      throw new Error("Este cliente no tiene datos fiscales guardados. Ingresá el CUIT para continuar.");
    }

    const fiscalArca = await buscarFiscalEnArcaPorCuit(cuitIngresado);
    const fiscalGuardado = await guardarClienteFiscal(fiscalArca);

    showToast("exito", "Datos fiscales obtenidos y guardados correctamente.", 2600);
    return fiscalGuardado;
  }, [
    selectedClienteId,
    clienteFiscalDb,
    fiscalCuitInput,
    fetchClienteFiscal,
    buscarFiscalEnArcaPorCuit,
    guardarClienteFiscal,
    showToast,
  ]);

  const validate = useCallback(() => {
    const cliTxt = String(cliInput || "").trim();

    if (!(selectedClienteId > 0 || cliTxt.length > 0)) {
      return { ok: false, msg: "Falta seleccionar un Cliente (obligatorio)." };
    }

    const tv = Number(filters.id_tipo_venta);
    if (!Number.isFinite(tv) || tv <= 0) {
      return { ok: false, msg: "Falta seleccionar la Forma de venta." };
    }

    if (isContado) {
      const mp = Number(filters.id_medio_pago);
      if (!Number.isFinite(mp) || mp <= 0) {
        return { ok: false, msg: "Venta Contado: falta seleccionar el Medio de pago." };
      }
    }

    // ✅ Período se deriva de la fecha automáticamente
    const periodoApi = fechaToYYYYMM(fecha);
    if (!/^\d{4}-\d{2}$/.test(periodoApi)) {
      return { ok: false, msg: "La fecha es inválida, no se puede determinar el período." };
    }

    const problems = [];
    rowsCalc.forEach((r, idx) => {
      const p = describeLineProblem(r, idx + 1);
      if (p) problems.push(p);
    });

    const usableLines = rowsCalc.filter((r) => {
      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return Number.isFinite(det) && det > 0 && total > 0;
    });

    if (!usableLines.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return {
        ok: false,
        msg: "Cargá al menos 1 fila válida (Detalle + Cantidad + Precio).",
      };
    }

    return { ok: true, warn: problems.length > 0, periodoApi };
  }, [cliInput, selectedClienteId, filters, isContado, fecha, rowsCalc]);

  const buildResumenFacturaPayload = useCallback(
    (clienteFiscalResuelto, cfg) => {
      const itemsFacturacion = rowsCalc
        .filter((r) => {
          const det = Number(r.id_detalle);
          const total = Number(r.total || 0);
          return Number.isFinite(det) && det > 0 && total > 0;
        })
        .map((r, idx) => ({
          id: r.id,
          codigo: String(idx + 1),
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
          total: Number(r.total || 0),
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
          origen: safeStr(clienteFiscalResuelto?.origen || "arca_cuit"),
        },

        id_cliente: selectedClienteId || null,
        id_tipo_venta: Number(filters.id_tipo_venta || 0) || null,
        id_medio_pago: isContado ? Number(filters.id_medio_pago || 0) || null : null,
        id_clasificacion: null,

        fecha_cbte_iso: String(fecha || todayISO()).slice(0, 10),
        vto_pago_iso: plusDaysISOFrom(fecha || todayISO(), 10),
        cbte_tipo: codigoCbte,
        pto_vta: puntoVenta,
        items_facturacion: itemsFacturacion,
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
        logo_url: safeStr(cfg?.logo_url),
      };
    },
    [rowsCalc, selectedClienteNombre, fecha, resumen.total, selectedClienteId, filters, isContado]
  );

  const guardarVentaBatch = useCallback(
    async ({ clienteFiscalResuelto = null, accionFinal = "guardar", esFacturadaFinal = false }) => {
      const { idUsuario } = getAuthInfo();
      // ✅ Período derivado automáticamente de la fecha
      const periodoApi = fechaToYYYYMM(fecha);

      const payloads = rowsCalc
        .filter((r) => {
          const det = Number(r.id_detalle);
          const total = Number(r.total || 0);
          return Number.isFinite(det) && det > 0 && total > 0;
        })
        .map((r) => ({
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
          cliente_fiscal: esFacturadaFinal ? clienteFiscalResuelto : null,
        }));

      if (!payloads.length) {
        throw new Error("No hay filas válidas para guardar.");
      }

      const data = await apiPostJson(API_BATCH, payloads);
      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo guardar el batch de ventas.");
      }

      return {
        ...data,
        periodoApi,
        fecha,
        cliente_fiscal: clienteFiscalResuelto,
        cliente_id: selectedClienteId || null,
        cliente_nombre: selectedClienteNombre,
        accion_venta: accionFinal,
        es_facturada: esFacturadaFinal,
      };
    },
    [API_BATCH, fecha, rowsCalc, selectedClienteId, selectedClienteNombre, filters, isContado]
  );

  const subirComprobanteYVincularPrimerMovimiento = useCallback(
    async ({ idMovimiento, blob, filename, facturaMeta }) => {
      if (!idMovimiento || !blob) {
        throw new Error("Faltan datos para subir el comprobante.");
      }

      const fd = new FormData();
      fd.append("tipo", "FACTURA");
      fd.append("id_movimiento", String(idMovimiento));
      fd.append(
        "pdf",
        blob instanceof Blob ? blob : new Blob([blob], { type: "application/pdf" }),
        filename || "factura.pdf"
      );

      const meta = {
        tipo: "FACTURA",
        estado: "emitida",
        id_pago: facturaMeta?.id_pago ?? null,
        id_sistema: facturaMeta?.id_sistema ?? null,
        anio: Number(facturaMeta?.anio || 0),
        id_mes: Number(facturaMeta?.id_mes || 0),
        monto_ars: Number(facturaMeta?.imp_total ?? facturaMeta?.importe ?? resumen.total ?? 0),
        doc_tipo: Number(facturaMeta?.doc_tipo || 80),
        doc_nro: safeStr(facturaMeta?.doc_nro),
        cbte_tipo: Number(facturaMeta?.cbte_tipo || 11),
        pto_vta: Number(facturaMeta?.pto_vta || 2),
        razon_social:
          resumenFacturaData?.cliente_facturacion?.razon_social || null,
        cond_iva:
          resumenFacturaData?.cliente_facturacion?.cond_iva ||
          resumenFacturaData?.cliente_facturacion?.condicion_iva ||
          null,
        domicilio: resumenFacturaData?.cliente_facturacion?.domicilio || null,
        cae: facturaMeta?.cae ?? null,
        cae_vto: facturaMeta?.cae_vto ?? null,
        cbte_nro: facturaMeta?.cbte_nro ?? null,
        fecha_cbte: facturaMeta?.fecha_cbte ?? null,
        resultado: facturaMeta?.resultado ?? null,
        qr_url: facturaMeta?.qr_url ?? null,
        qr_base64: facturaMeta?.qr_base64 ?? null,
        qr_payload: facturaMeta?.qr_payload ?? null,
        items_facturacion: Array.isArray(resumenFacturaData?.items_facturacion)
          ? resumenFacturaData.items_facturacion
          : [],
        total_ars: resumenFacturaData?.total_ars ?? null,
        vto_pago: resumenFacturaData?.vto_pago_iso ?? null,
        observaciones: resumenFacturaData?.observaciones ?? "",
      };

      fd.append("meta", JSON.stringify(meta));

      const res = await fetch(API_VINCULAR_COMPROBANTE, {
        method: "POST",
        body: fd,
        headers: buildAuthHeaders(false),
      });

      const j = await parseJsonOrThrow(res);
      if (!j?.exito) {
        throw new Error(j?.mensaje || "No se pudo subir el comprobante.");
      }

      return j;
    },
    [API_VINCULAR_COMPROBANTE, resumen.total, resumenFacturaData]
  );

  const vincularComprobanteAMovimientosLote = useCallback(
    async (idsMovimiento, idComprobante) => {
      if (!idComprobante || !Array.isArray(idsMovimiento) || !idsMovimiento.length) return;

      const data = await apiPostJson(API_VINCULAR_COMPROBANTE_LOTE, {
        id_comprobante: Number(idComprobante),
        ids_movimiento: idsMovimiento.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0),
        force: false,
      });

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo vincular el comprobante al lote.");
      }

      return data;
    },
    [API_VINCULAR_COMPROBANTE_LOTE]
  );

  const abrirResumenFactura = useCallback(async () => {
    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }

    if (v.warn) {
      showToast("advertencia", "Hay filas incompletas: se mostrarán solo las válidas.", 3200);
    }

    setSaving(true);
    try {
      const clienteFiscalResuelto = await resolveFiscalForFacturacion();
      const cfg = configFacturacion || (await fetchConfigFacturacion());
      const payloadResumen = buildResumenFacturaPayload(clienteFiscalResuelto, cfg);

      setResumenFacturaData(payloadResumen);
      setOpenResumenFactura(true);
    } catch (e) {
      showToast("error", e?.message || "No se pudo preparar la factura.", 4500);
    } finally {
      setSaving(false);
    }
  }, [
    validate,
    showToast,
    resolveFiscalForFacturacion,
    configFacturacion,
    fetchConfigFacturacion,
    buildResumenFacturaPayload,
  ]);

  const finalizarFacturacionYGuardarVenta = useCallback(
    async (factEmitida) => {
      try {
        setSaving(true);
        showToast("cargando", "Guardando venta facturada…", 12000);

        const clienteFiscalResuelto = normalizeClienteFiscalDb(
          resumenFacturaData?.cliente_facturacion || clienteFiscalDb || fiscalArcaData || {}
        );

        // 1) guardar batch
        const infoToParent = await guardarVentaBatch({
          clienteFiscalResuelto,
          accionFinal: "facturar",
          esFacturadaFinal: true,
        });

        const idsMovimiento =
          infoToParent?.ids ??
          infoToParent?.ids_movimiento ??
          infoToParent?.ids_movimientos ??
          (infoToParent?.id_movimiento ? [infoToParent.id_movimiento] : []);

        const idsOk = (Array.isArray(idsMovimiento) ? idsMovimiento : [])
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0);

        let idComprobante =
          factEmitida?.id_comprobante ??
          factEmitida?.idComprobante ??
          null;

        // 2) si el modal resumen no guardó el comprobante, lo subimos ahora
        if (!idComprobante && factEmitida?.pdf_blob && idsOk.length > 0) {
          const subida = await subirComprobanteYVincularPrimerMovimiento({
            idMovimiento: idsOk[0],
            blob: factEmitida.pdf_blob,
            filename: factEmitida.pdf_filename || "factura.pdf",
            facturaMeta: factEmitida,
          });

          idComprobante =
            subida?.id_comprobante ??
            subida?.comprobante?.id_comprobante ??
            null;
        }

        // 3) vincular ese mismo comprobante a todo el lote
        if (idComprobante && idsOk.length > 0) {
          await vincularComprobanteAMovimientosLote(idsOk, idComprobante);
        }

        showToast("exito", "Factura emitida y venta guardada correctamente.", 3000);

        setOpenResumenFactura(false);
        setResumenFacturaData(null);

        onSaved?.({
          ...infoToParent,
          factura_emitida: factEmitida || null,
          id_comprobante: idComprobante,
        });
      } catch (e) {
        showToast("error", e?.message || "La factura se emitió pero no se pudo guardar la venta.", 5200);
      } finally {
        setSaving(false);
      }
    },
    [
      showToast,
      guardarVentaBatch,
      resumenFacturaData,
      clienteFiscalDb,
      fiscalArcaData,
      onSaved,
      subirComprobanteYVincularPrimerMovimiento,
      vincularComprobanteAMovimientosLote,
    ]
  );

  const submit = useCallback(async () => {
    if (saving) return;

    const { sessionKey } = getAuthInfo();
    if (!sessionKey) {
      showToast("error", "No hay sesión activa (Falta X-Session). Iniciá sesión de nuevo.", 5200);
      return;
    }

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.", 3200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }

    // ✅ Facturar aplica si hay tipo de venta y accion = facturar
    if (tipoVentaSeleccionado && accionContado === "facturar") {
      await abrirResumenFactura();
      return;
    }

    setSaving(true);

    if (v.warn) showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    else showToast("cargando", "Guardando venta…", 12000);

    try {
      const infoToParent = await guardarVentaBatch({
        clienteFiscalResuelto: null,
        accionFinal: "guardar",
        esFacturadaFinal: false,
      });

      showToast("exito", `Listo: ${infoToParent?.creados ?? 1} ítems guardados.`, 2800);
      onSaved?.(infoToParent);
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    addUI.open,
    validate,
    showToast,
    tipoVentaSeleccionado,
    accionContado,
    guardarVentaBatch,
    onSaved,
    abrirResumenFactura,
  ]);

  const onClickFacturar = useCallback(async () => {
    setAccionContado("facturar");
    setFiscalError("");

    if (!selectedClienteId) {
      showToast("advertencia", "Seleccioná un cliente antes de facturar.", 3200);
      return;
    }

    try {
      const cuitIngresado = onlyDigits(fiscalCuitInput);

      setSaving(true);
      const fiscal = clienteFiscalDb || (await fetchClienteFiscal(selectedClienteId));

      if (fiscal?.cuit) {
        await abrirResumenFactura();
        return;
      }

      if (cuitIngresado.length === 11) {
        await abrirResumenFactura();
        return;
      }

      showToast(
        "advertencia",
        "Este cliente no tiene datos fiscales guardados. Ingresá el CUIT y presioná Facturar nuevamente.",
        4200
      );
    } catch (e) {
      showToast("error", e?.message || "No se pudo iniciar la facturación.", 4200);
    } finally {
      setSaving(false);
    }
  }, [
    selectedClienteId,
    clienteFiscalDb,
    fiscalCuitInput,
    fetchClienteFiscal,
    abrirResumenFactura,
    showToast,
  ]);

  if (!open) return null;

  const miniOpen = addUI.open;
  const miniTitle = addUI.kind === "clientes" ? "Nuevo cliente" : "Nuevo detalle";

  const modalJSX = (
    <>
      <div
        className={["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}
        onMouseDown={() => (!saving ? onClose?.() : null)}
      >
        <div
          className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""].join(" ").trim()}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header mi-modal__header--car">
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Nueva Venta</h2>
              <p className="mi-modal__subtitle">Planilla a la izquierda + datos de venta a la derecha.</p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => (!saving ? onClose?.() : null)}
              aria-label="Cerrar"
              disabled={saving}
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mi-modal__content mi-modal__content--car">
            <div className="mi-cr-grid">
              <section className="mi-cr-table">
                <div className="mi-cr-table__head">
                  <div>Detalle</div>
                  <div className="mi-cr-center">Cantidad</div>
                  <div className="mi-cr-center">Precio</div>
                  <div className="mi-cr-center">% IVA</div>
                  <div className="mi-cr-center">IVA</div>
                  <div className="mi-cr-center">Total</div>
                  <div />
                </div>

                <div className="mi-cr-table__rows">
                  {rowsCalc.map((r) => {
                    const suggestions = suggestDetalles(r.detalleText);
                    const showSug =
                      String(r.detalleText || "").trim().length > 0 &&
                      Number(r.id_detalle || 0) <= 0 &&
                      suggestions.length > 0;

                    return (
                      <div key={r.id} className="mi-cr-row mi-cr-row--car">
                        <div className="mi-cr-cell mi-cr-col mi-cr-col--desc mi-cr-rel">
                          <input
                            className="fl-input"
                            placeholder="Escribí o seleccioná un detalle…"
                            value={r.detalleText}
                            onChange={(e) =>
                              updateRow(r.id, {
                                detalleText: e.target.value,
                                id_detalle: NULL_OPTION,
                              })
                            }
                            disabled={saving || addUI.open}
                            autoComplete="off"
                          />

                          {showSug && (
                            <ul className="mi-cr-suggest">
                              {suggestions.map((d) => {
                                const did = getDetalleId(d);
                                return (
                                  <li
                                    key={did ?? d?.nombre ?? uid()}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      updateRow(r.id, {
                                        id_detalle: String(did || ""),
                                        detalleText: String(d?.nombre || ""),
                                      });
                                    }}
                                    className="mi-cr-suggest__item"
                                  >
                                    {d.nombre}
                                  </li>
                                );
                              })}
                            </ul>
                          )}

                          <button
                            type="button"
                            onClick={() => startAddDetalleForRow(r.id)}
                            disabled={saving || addUI.saving}
                            className="mi-cr-link"
                          >
                            + Agregar nuevo detalle
                          </button>
                        </div>

                        <div className="mi-cr-cell mi-cr-col mi-cr-col--qty mi-cr-center">
                          <input
                            className="fl-input"
                            type="number"
                            min="0"
                            step="1"
                            value={r.cantidad}
                            onChange={(e) =>
                              updateRow(r.id, {
                                cantidad: e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                            disabled={saving}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-col mi-cr-col--price mi-cr-center">
                          <input
                            className="fl-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={r.precio}
                            onChange={(e) =>
                              updateRow(r.id, {
                                precio: e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                            disabled={saving}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-col mi-cr-col--iva mi-cr-center">
                          <select
                            className="fl-input fl-select fl-select-iva--car"
                            value={String(r.ivaPct)}
                            onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                            disabled={saving}
                          >
                            {IVA_OPTIONS.map((x) => (
                              <option key={x.value} value={x.value}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto mi-cr-center">
                          <div className="mi-cr-money mi-cr-money--soft">{moneyARS(r.ivaMonto)}</div>
                        </div>

                        <div className="mi-cr-cell mi-cr-col mi-cr-col--total mi-cr-center">
                          <div className="mi-cr-money mi-cr-money--strong">{moneyARS(r.total)}</div>
                        </div>

                        <div className="mi-cr-cell mi-cr-col mi-cr-col--action">
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            disabled={saving}
                            title="Eliminar fila"
                            className="mi-cr-del"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mi-cr-table__foot">
                  <button
                    type="button"
                    onClick={addRow}
                    disabled={saving}
                    className="mi-cr-addrow"
                  >
                    + Agregar fila
                  </button>

                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                      <span>Subtotal</span>
                      <b>{moneyARS(resumen.subtotal)}</b>
                    </div>

                    <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                      <span>IVA</span>
                      <b>{moneyARS(resumen.iva)}</b>
                    </div>

                    <div className="mi-cr-totalLine mi-cr-totalLine--total mi-cr-totalLine--big">
                      <span>TOTAL</span>
                      <b>{moneyARS(resumen.total)}</b>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="mi-cr-filters">
                <div className="mi-cr-filters__top">
                  <div className="mi-cr-filters__title">Datos de venta</div>

                  {/* ✅ Solo campo de Fecha, sin Período */}
                  <div className="mi-cr-filters__dates">
                    <div className="fl-field">
                      <input
                        className="fl-input"
                        type="date"
                        value={fecha}
                        onChange={(e) => onFechaChange(e.target.value)}
                        disabled={saving}
                      />
                      <label className="fl-label">Fecha</label>
                    </div>
                  </div>
                </div>

                <div className="mi-cr-filters__body">
                  <div className="fl-field mi-cr-rel">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={cliInput}
                      onChange={handleClienteInputChange}
                      onFocus={() => setCliFocus(true)}
                      onBlur={() => setTimeout(() => setCliFocus(false), 120)}
                      disabled={saving || addUI.open}
                      autoComplete="off"
                    />
                    <label className="fl-label">Cliente *</label>

                    {cliFocus && filteredClientes.length > 0 && (
                      <ul className="mi-cr-suggest">
                        {filteredClientes.map((c) => {
                          const cid = getClienteId(c);
                          return (
                            <li
                              key={cid ?? c?.nombre ?? uid()}
                              className="mi-cr-suggest__item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectCliente(c);
                              }}
                            >
                              {c.nombre}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <button
                      type="button"
                      className="mi-cr-link"
                      onClick={startAddCliente}
                      disabled={saving || addUI.saving}
                    >
                      + Agregar nuevo cliente
                    </button>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_tipo_venta)}
                      onChange={(e) => updateFilter("id_tipo_venta", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Forma de venta *</option>
                      {tiposVentaList.map((x) => (
                        <option key={x.id ?? x.id_tipo_venta} value={String(x.id ?? x.id_tipo_venta)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Forma de venta</label>
                  </div>

                  {/* ✅ Medio de pago solo para contado */}
                  {isContado && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(filters.id_medio_pago)}
                        onChange={(e) => updateFilter("id_medio_pago", e.target.value)}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Medio de pago *</option>
                        {mediosPagoList.map((x) => (
                          <option key={x.id ?? x.id_medio_pago} value={String(x.id ?? x.id_medio_pago)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>
                  )}

                  {/* ✅ Panel de Facturación: siempre visible cuando hay tipo de venta seleccionado */}
                  {tipoVentaSeleccionado && (
                    <div className="mi-card mi-card--full">
                      <div className="mi-card__title">Facturación</div>

                      <div className="mi-card__actionsRow">
                        <button
                          type="button"
                          className={`mit-btn ${accionContado === "guardar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                          onClick={() => setAccionContado("guardar")}
                          disabled={saving}
                        >
                          Guardar
                        </button>

                        <button
                          type="button"
                          className={`mit-btn ${accionContado === "facturar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                          onClick={onClickFacturar}
                          disabled={saving}
                        >
                          {saving && accionContado === "facturar" ? "Procesando..." : "Facturar"}
                        </button>
                      </div>

                      <div className="mi-card__hint">
                        {accionContado === "guardar" ? (
                          <>
                            * <b>Guardar</b>: queda <b>pendiente</b>.
                          </>
                        ) : clienteFiscalDb ? (
                          <>
                            * Datos fiscales encontrados. Al presionar <b>Facturar</b> se abrirá el resumen.
                          </>
                        ) : (
                          <>
                            * Si el cliente no tiene datos fiscales guardados, ingresá el <b>CUIT</b> abajo y luego presioná <b>Facturar</b> nuevamente.
                          </>
                        )}
                      </div>

                      {shouldNeedFiscalPanel && (
                        <div style={{ marginTop: 12 }}>
                          {!selectedClienteId ? (
                            <div className="mi-card__hint">
                              Seleccioná primero un cliente del listado para poder facturar.
                            </div>
                          ) : fiscalLoading ? (
                            <div className="mi-card__hint">Consultando datos fiscales guardados…</div>
                          ) : !clienteFiscalDb ? (
                            <>
                              <div className="fl-field">
                                <input
                                  className="fl-input"
                                  placeholder=" "
                                  value={fiscalCuitInput}
                                  onChange={(e) => {
                                    setFiscalCuitInput(onlyDigits(e.target.value));
                                    setFiscalArcaData(null);
                                    setFiscalError("");
                                  }}
                                  inputMode="numeric"
                                  disabled={saving || fiscalLookupLoading}
                                  maxLength={11}
                                />
                                <label className="fl-label">Ingresar CUIT *</label>
                              </div>

                              {fiscalArcaData && (
                                <div className="arca-alert arca-alert--info" style={{ marginTop: 10 }}>
                                  <div className="arca-alert__title">
                                    <strong>Datos encontrados</strong>
                                  </div>

                                  <div className="arca-resumen arca-resumen--2col">
                                    <div className="arca-row">
                                      <b>CUIT:</b>
                                      <span>{fiscalArcaData.cuit || "—"}</span>
                                    </div>
                                    <div className="arca-row">
                                      <b>IVA:</b>
                                      <span>{fiscalArcaData.condicion_iva || "—"}</span>
                                    </div>
                                    <div className="arca-row arca-row--full">
                                      <b>Razón social:</b>
                                      <span>{fiscalArcaData.razon_social || "—"}</span>
                                    </div>
                                    <div className="arca-row arca-row--full">
                                      <b>Domicilio:</b>
                                      <span>{fiscalArcaData.domicilio || "—"}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : null}

                          {fiscalError && (
                            <div className="arca-alert arca-alert--error" style={{ marginTop: 10 }}>
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
                      {saving ? "Procesando..." : accionContado === "facturar" ? "Facturar venta" : "Guardar venta"}
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
            open={miniOpen}
            title={miniTitle}
            value={addUI.text}
            saving={addUI.saving}
            onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
            onCancel={closeAddMini}
            onSave={guardarNuevoCatalogo}
            dark={dark}
          />
        </div>
      </div>

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
          docNro={safeStr(
            resumenFacturaData?.cliente_facturacion?.doc_nro ||
              resumenFacturaData?.cliente_facturacion?.cuit
          )}
          cbteTipo={Number(resumenFacturaData?.cbte_tipo || 11)}
          ptoVta={String(resumenFacturaData?.pto_vta || 2)}
          onFacturada={async (fact) => {
            await finalizarFacturacionYGuardarVenta(fact);
          }}
          onDone={async (fact) => {
            await finalizarFacturacionYGuardarVenta(fact);
          }}
          forceTestAmount={false}
          testAmount={null}
          skipMovimientoAutocreacion={true}
        />
      )}
    </>
  );

  return createPortal(modalJSX, document.body);
}