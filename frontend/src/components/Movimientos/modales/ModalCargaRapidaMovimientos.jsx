// src/components/Movimientos/modales/ModalCargaRapidaMovimientos.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Global/Global_Modals.css";
import BASE_URL from "../../../config/config";

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
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================
   Período helpers (MM-YYYY)
========================= */
function normalizePeriodoToMMYYYY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  let m = "";
  let y = "";

  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    y = parts[0];
    m = parts[1];
  } else if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const parts = s.split(/[-/]/);
    m = parts[0];
    y = parts[1];
  } else if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      y = s.slice(0, 4);
      m = s.slice(4);
    } else {
      m = s.slice(0, 2);
      y = s.slice(2);
    }
  } else {
    return s;
  }

  const mm = String(Number(m)).padStart(2, "0");
  const yyyy = String(y);
  return `${mm}-${yyyy}`;
}

function periodoFromISODate(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}-${y}`;
}

/* =========================
   Lists normalize
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
  clientes: [],
  cuentas_corrientes: [],
  detalles: [],
  medios_pago: [],
  proveedores: [],
  tipos_venta: [],
  tipos_operacion: [],
};

function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};
  const src = l.listas && typeof l.listas === "object" ? l.listas : l;

  return {
    periodos: Array.isArray(src.periodos) ? src.periodos : [],
    clasificaciones: Array.isArray(src.clasificaciones) ? src.clasificaciones : [],
    clientes: Array.isArray(src.clientes) ? src.clientes : [],
    cuentas_corrientes: Array.isArray(src.cuentas_corrientes) ? src.cuentas_corrientes : [],
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    medios_pago: Array.isArray(src.medios_pago) ? src.medios_pago : [],
    proveedores: Array.isArray(src.proveedores) ? src.proveedores : [],
    tipos_venta: Array.isArray(src.tipos_venta) ? src.tipos_venta : [],
    tipos_operacion: Array.isArray(src.tipos_operacion)
      ? src.tipos_operacion
      : Array.isArray(src.tipo_operacion)
      ? src.tipo_operacion
      : Array.isArray(src.tipos_operaciones)
      ? src.tipos_operaciones
      : [],
  };
}

/* =========================
   ✅ ID tolerante (fix)
========================= */
function getClienteId(c) {
  const cand = c?.id ?? c?.id_cliente ?? c?.idCliente ?? c?.cliente_id ?? c?.idcliente ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getProveedorId(p) {
  const cand = p?.id ?? p?.id_proveedor ?? p?.idProveedor ?? p?.proveedor_id ?? p?.idproveedor ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getDetalleId(d) {
  const cand = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getIdGeneric(x) {
  const cand =
    x?.id ??
    x?.id_cliente ??
    x?.idCliente ??
    x?.cliente_id ??
    x?.id_proveedor ??
    x?.idProveedor ??
    x?.proveedor_id ??
    x?.id_detalle ??
    x?.idDetalle ??
    x?.detalle_id ??
    x?.id_tipo_operacion ??
    x?.idTipoOperacion ??
    x?.tipo_operacion_id ??
    0;

  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* =========================
   API helpers + auth (JWT + X-Session) ✅
========================= */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";

  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
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

async function apiPostJson(url, payload) {
  const { token, sessionKey } = getAuthInfo();

  const headers = { "Content-Type": "application/json" };
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });

  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}\n${preview}`);
  }

  if (!res.ok) {
    const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

/* =========================
   Mini Modal: alta rápida (cliente/proveedor/detalle)
========================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave, dark = false }) {
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
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>

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

/* =========================
   payload helpers
========================= */
function toNullableId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function toNullableDateISO(v) {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function toNullablePeriodoMMYYYY(v, fallbackFechaISO) {
  const norm = normalizePeriodoToMMYYYY(v);
  if (norm && /^\d{2}-\d{4}$/.test(norm)) return norm;
  const perAuto = periodoFromISODate(fallbackFechaISO);
  if (perAuto && /^\d{2}-\d{4}$/.test(perAuto)) return perAuto;
  return null;
}

/* =========================
   Catálogos soportados
========================= */
const CATALOGO_DEF = {
  id_cliente: { catalogo: "clientes", label: "Cliente" },
  id_proveedor: { catalogo: "proveedores", label: "Proveedor" },
  id_detalle: { catalogo: "detalles", label: "Detalle" },
};

/* =========================
   Theme helper (data-theme + body.dark) ✅
========================= */
function isTemaOscuro() {
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
}

export default function ModalCargaRapidaMovimientos({
  open,
  lists,
  periodoDefault, // (se mantiene por compatibilidad)
  onClose,
  onSaveBatch,
  onToast,
}) {
  const API = `${BASE_URL}/api.php`;

  // ✅ dark automático
  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());

    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const obsBody = new MutationObserver(update);
    if (document.body) obsBody.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    update();
    return () => {
      obsHtml.disconnect();
      obsBody.disconnect();
    };
  }, []);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // ✅ lock scroll del body SOLO mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // listas locales (para poder push cuando creás nuevo)
  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeIncomingLists(lists),
  }));

  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const listsNorm = useMemo(() => localLists, [localLists]);

  const [fecha, setFecha] = useState(todayISO());
  const [periodo, setPeriodo] = useState(periodoFromISODate(todayISO())); // ✅ siempre hoy

  const [filters, setFilters] = useState({
    id_clasificacion: NULL_OPTION,
    id_tipo_operacion: NULL_OPTION, // ✅ Primero se selecciona
    id_tipo_venta: NULL_OPTION,
    id_cuenta_corriente: NULL_OPTION,
    id_medio_pago: NULL_OPTION,
    id_cliente: NULL_OPTION,
    id_proveedor: NULL_OPTION,
  });

  // inputs para autocomplete de cliente/proveedor
  const [clienteInput, setClienteInput] = useState("");
  const [clienteFocus, setClienteFocus] = useState(false);
  const clienteInputRef = useRef(null);

  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);
  const proveedorInputRef = useRef(null);

  // filas
  const [rows, setRows] = useState(() => [
    { id: uid(), id_detalle: NULL_OPTION, detalleText: "", cantidad: 1, precio: 0, ivaPct: 0 },
  ]);

  const [saving, setSaving] = useState(false);
  const closeBtnRef = useRef(null);

  // mini modal alta rápida
  const [addUI, setAddUI] = useState({
    open: false,
    field: null,
    rowId: null,
    text: "",
    saving: false,
  });

  /* =========================
     Reset al abrir
  ========================= */
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const f = todayISO();
      setFecha(f);
      setPeriodo(periodoFromISODate(f));

      setFilters({
        id_clasificacion: NULL_OPTION,
        id_tipo_operacion: NULL_OPTION,
        id_tipo_venta: NULL_OPTION,
        id_cuenta_corriente: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_cliente: NULL_OPTION,
        id_proveedor: NULL_OPTION,
      });

      setClienteInput("");
      setClienteFocus(false);

      setProveedorInput("");
      setProveedorFocus(false);

      setRows([{ id: uid(), id_detalle: NULL_OPTION, detalleText: "", cantidad: 1, precio: 0, ivaPct: 0 }]);

      setAddUI({ open: false, field: null, rowId: null, text: "", saving: false });

      setSaving(false);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, periodoDefault]);

  /* =========================
     ESC cierra
  ========================= */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const onFechaChange = (iso) => {
    const v = String(iso || "").trim();
    setFecha(v);
    const perAuto = periodoFromISODate(v);
    if (perAuto) setPeriodo(perAuto);
  };

  const onPeriodoChange = (raw) => {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 6);
    let next = "";
    if (digits.length <= 2) next = digits;
    else next = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length === 6) next = normalizePeriodoToMMYYYY(next);
    setPeriodo(next);
  };

  const updateFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: uid(), id_detalle: NULL_OPTION, detalleText: "", cantidad: 1, precio: 0, ivaPct: 0 },
    ]);
  };

  const removeRow = (id) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : prev;
    });
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  /* =========================
     Autocomplete: DETALLES (por fila)
  ========================= */
  const detallesList = useMemo(
    () => (Array.isArray(listsNorm.detalles) ? listsNorm.detalles : []),
    [listsNorm.detalles]
  );

  const suggestDetalles = (txt) => {
    const q = String(txt || "").trim().toLowerCase();
    if (!q) return [];
    return detallesList
      .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 18);
  };

  const startAddDetalleForRow = useCallback(
    (rowId) => {
      if (saving) return;
      setAddUI({ open: true, field: "id_detalle", rowId, text: "", saving: false });
    },
    [saving]
  );

  /* =========================
     Autocomplete: CLIENTES
  ========================= */
  const clientesList = useMemo(
    () => (Array.isArray(listsNorm.clientes) ? listsNorm.clientes : []),
    [listsNorm.clientes]
  );

  const filteredClientes = useMemo(() => {
    const qLocal = clienteInput.trim().toLowerCase();
    if (!clienteFocus || qLocal.length < 1) return [];
    return clientesList
      .filter((c) => String(c?.nombre ?? "").toLowerCase().includes(qLocal))
      .slice(0, 25);
  }, [clientesList, clienteInput, clienteFocus]);

  const handleClienteInputChange = useCallback((e) => {
    const value = e.target.value;
    setClienteInput(value);
    setFilters((p) => ({ ...p, id_cliente: NULL_OPTION }));
  }, []);

  const handleSelectCliente = useCallback((cliente) => {
    const nombre = String(cliente?.nombre ?? "").trim();
    const cid = getClienteId(cliente);

    setClienteInput(nombre);
    setFilters((p) => ({ ...p, id_cliente: cid != null ? String(cid) : NULL_OPTION }));
    setClienteFocus(false);
  }, []);

  const startAddCliente = useCallback(() => {
    setClienteFocus(false);
    setAddUI({ open: true, field: "id_cliente", rowId: null, text: "", saving: false });
  }, []);

  /* =========================
     Autocomplete: PROVEEDORES
  ========================= */
  const proveedoresList = useMemo(
    () => (Array.isArray(listsNorm.proveedores) ? listsNorm.proveedores : []),
    [listsNorm.proveedores]
  );

  const filteredProveedores = useMemo(() => {
    const qLocal = proveedorInput.trim().toLowerCase();
    if (!proveedorFocus || qLocal.length < 1) return [];
    return proveedoresList
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(qLocal))
      .slice(0, 25);
  }, [proveedoresList, proveedorInput, proveedorFocus]);

  const handleProveedorInputChange = useCallback((e) => {
    const value = e.target.value;
    setProveedorInput(value);
    setFilters((p) => ({ ...p, id_proveedor: NULL_OPTION }));
  }, []);

  const handleSelectProveedor = useCallback((prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    const pid = getProveedorId(prov);

    setProveedorInput(nombre);
    setFilters((p) => ({ ...p, id_proveedor: pid != null ? String(pid) : NULL_OPTION }));
    setProveedorFocus(false);
  }, []);

  const startAddProveedor = useCallback(() => {
    setProveedorFocus(false);
    setAddUI({ open: true, field: "id_proveedor", rowId: null, text: "", saving: false });
  }, []);

  /* =========================
     Crear nuevo catálogo
  ========================= */
  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, field: null, rowId: null, text: "", saving: false });
  }, [addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const field = addUI.field;
    if (!field) return;

    const meta = CATALOGO_DEF[field];
    if (!meta) return;

    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${meta.label}…`, 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const data = await apiPostJson(`${API}?action=catalogo_crear`, {
        catalogo: meta.catalogo,
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el registro.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error("El servidor no devolvió un ID válido del registro creado.");
      }

      setLocalLists((prev) => {
        const next = { ...prev };
        const listKey =
          field === "id_cliente" ? "clientes" : field === "id_proveedor" ? "proveedores" : "detalles";

        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];
        if (!arr.some((x) => getIdGeneric(x) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next[listKey] = arr;
        return next;
      });

      if (field === "id_cliente") {
        setFilters((p) => ({ ...p, id_cliente: String(newId) }));
        setClienteInput(newNombre);
        setTimeout(() => clienteInputRef.current?.focus(), 0);
      } else if (field === "id_proveedor") {
        setFilters((p) => ({ ...p, id_proveedor: String(newId) }));
        setProveedorInput(newNombre);
        setTimeout(() => proveedorInputRef.current?.focus(), 0);
      } else if (field === "id_detalle") {
        const rowId = addUI.rowId;
        if (rowId) updateRow(rowId, { id_detalle: String(newId), detalleText: newNombre });
      }

      setAddUI({ open: false, field: null, rowId: null, text: "", saving: false });
      showToast("exito", `${meta.label} creado: "${newNombre}"`, 2600);
    } catch (e) {
      const msg = e?.message || "Error creando el registro.";
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", msg, 4200);
    }
  }, [API, addUI, showToast]);

  /* =========================
     Lógica condicional para mostrar campos
  ========================= */
  const tipoOperacionSeleccionado = filters.id_tipo_operacion;
  const tipoVentaSeleccionado = filters.id_tipo_venta;

  // Determinar qué campos de cliente/proveedor mostrar según tipo de operación
  const mostrarCliente = useMemo(() => {
    if (!tipoOperacionSeleccionado || tipoOperacionSeleccionado === NULL_OPTION) return false;
    
    // Buscar el tipo de operación seleccionado
    const tipoOp = listsNorm.tipos_operacion.find(
      (t) => String(getIdGeneric(t)) === String(tipoOperacionSeleccionado)
    );
    
    if (!tipoOp) return false;
    
    const nombreTipo = String(tipoOp?.nombre || "").toLowerCase();
    return nombreTipo.includes("venta") || nombreTipo.includes("movimiento");
  }, [tipoOperacionSeleccionado, listsNorm.tipos_operacion]);

  const mostrarProveedor = useMemo(() => {
    if (!tipoOperacionSeleccionado || tipoOperacionSeleccionado === NULL_OPTION) return false;
    
    const tipoOp = listsNorm.tipos_operacion.find(
      (t) => String(getIdGeneric(t)) === String(tipoOperacionSeleccionado)
    );
    
    if (!tipoOp) return false;
    
    const nombreTipo = String(tipoOp?.nombre || "").toLowerCase();
    return nombreTipo.includes("compra") || nombreTipo.includes("movimiento");
  }, [tipoOperacionSeleccionado, listsNorm.tipos_operacion]);

  // Determinar si mostrar medio de pago o cuenta corriente según tipo de venta
  const tipoVentaEsContado = useMemo(() => {
    if (!tipoVentaSeleccionado || tipoVentaSeleccionado === NULL_OPTION) return false;
    
    const tipoVenta = listsNorm.tipos_venta.find(
      (t) => String(getIdGeneric(t)) === String(tipoVentaSeleccionado)
    );
    
    if (!tipoVenta) return false;
    
    const nombreTipo = String(tipoVenta?.nombre || "").toLowerCase();
    return nombreTipo.includes("contado");
  }, [tipoVentaSeleccionado, listsNorm.tipos_venta]);

  const tipoVentaEsCuentaCorriente = useMemo(() => {
    if (!tipoVentaSeleccionado || tipoVentaSeleccionado === NULL_OPTION) return false;
    
    const tipoVenta = listsNorm.tipos_venta.find(
      (t) => String(getIdGeneric(t)) === String(tipoVentaSeleccionado)
    );
    
    if (!tipoVenta) return false;
    
    const nombreTipo = String(tipoVenta?.nombre || "").toLowerCase();
    return nombreTipo.includes("cuenta corriente") || nombreTipo.includes("cta cte");
  }, [tipoVentaSeleccionado, listsNorm.tipos_venta]);

  /* =========================
     Cálculos por fila
  ========================= */
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

  /* =========================
     VALIDACIÓN SUPER FLEX
  ========================= */
  const validate = useCallback(() => {
    const usableLines = rowsCalc.filter((r) => {
      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return Number.isFinite(det) && det > 0 && total > 0;
    });

    if (!usableLines.length) {
      return { ok: false, msg: "Cargá al menos 1 fila con Detalle y Total > 0." };
    }

    const incompleteTouched = rowsCalc.some((r) => {
      const touched =
        String(r.detalleText || "").trim() !== "" ||
        String(r.id_detalle || "").trim() !== "" ||
        safeNumber(r.cantidad) !== 0 ||
        safeNumber(r.precio) !== 0;
      if (!touched) return false;

      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return !(Number.isFinite(det) && det > 0 && total > 0);
    });

    return { ok: true, warn: incompleteTouched };
  }, [rowsCalc]);

  const submit = async () => {
    if (saving) return;

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear el registro (o cancelá) antes de guardar.", 3200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 3600);
      return;
    }

    setSaving(true);

    if (v.warn) {
      showToast("advertencia", "Hay filas incompletas. Se guardarán solo las filas válidas.", 3500);
    } else {
      showToast("cargando", "Guardando movimientos…", 12000);
    }

    try {
      const fechaToSend = toNullableDateISO(fecha);
      const periodoToSend = toNullablePeriodoMMYYYY(periodo, fechaToSend || todayISO());

      const payloads = rowsCalc
        .filter((r) => {
          const det = Number(r.id_detalle);
          const total = Number(r.total || 0);
          return Number.isFinite(det) && det > 0 && total > 0;
        })
        .map((r) => ({
          fecha: fechaToSend,
          periodo: periodoToSend,

          id_clasificacion: toNullableId(filters.id_clasificacion),
          id_tipo_operacion: toNullableId(filters.id_tipo_operacion),
          id_tipo_venta: toNullableId(filters.id_tipo_venta),
id_cuenta_corriente: null,

          id_medio_pago: toNullableId(filters.id_medio_pago),

          id_cliente: toNullableId(filters.id_cliente),
          id_proveedor: toNullableId(filters.id_proveedor),

          id_detalle: toNullableId(r.id_detalle),

          monto_total: Math.round(Number(r.total) * 100) / 100,

          cantidad: Math.round(Number(r.cantidad) * 100) / 100,
          precio: Math.round(Number(r.precio) * 100) / 100,
          iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
          subtotal: Math.round(Number(r.subtotal) * 100) / 100,
          iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
          total: Math.round(Number(r.total) * 100) / 100,
        }));

      if (!payloads.length) {
        showToast("advertencia", "No hay filas válidas para guardar.", 3500);
        setSaving(false);
        return;
      }

      await onSaveBatch?.(payloads);

      showToast("exito", `Listo: ${payloads.length} movimientos guardados.`, 2800);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
      setSaving(false);
    }
  };

  if (!open) return null;

  const miniOpen = addUI.open && ["id_cliente", "id_proveedor", "id_detalle"].includes(addUI.field);

  const miniTitle =
    addUI.field === "id_cliente"
      ? "Nuevo cliente"
      : addUI.field === "id_proveedor"
      ? "Nuevo proveedor"
      : "Nuevo detalle";

  const modalJSX = (
    <div
      className={["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""]
        .join(" ")
        .trim()}
      onMouseDown={() => (!saving ? onClose?.() : null)}
    >
      <div
        className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""]
          .join(" ")
          .trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header mi-modal__header--car">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Nuevo Movimiento</h2>
            <p className="mi-modal__subtitle">Planilla a la izquierda + filtros a la derecha. Guardás todo junto.</p>
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
            {/* Planilla */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__head">
                <div>Descripción</div>
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
                      {/* Descripción */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--desc mi-cr-rel">
                        <input
                          className="fl-input"
                          placeholder="Escribí y seleccioná un detalle…"
                          value={r.detalleText}
                          onChange={(e) => {
                            updateRow(r.id, { detalleText: e.target.value, id_detalle: NULL_OPTION });
                          }}
                          disabled={saving || addUI.open}
                          autoComplete="off"
                        />

                        {showSug && (
                          <ul className="mi-cr-suggest">
                            {suggestions.map((d) => {
                              const did = getDetalleId(d) ?? d?.id;
                              return (
                                <li
                                  key={did ?? d?.id ?? String(Math.random())}
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

                      {/* Cantidad */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--qty mi-cr-center">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="1"
                          value={r.cantidad}
                          onChange={(e) =>
                            updateRow(r.id, { cantidad: e.target.value === "" ? "" : Number(e.target.value) })
                          }
                          disabled={saving}
                        />
                      </div>

                      {/* Precio */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--price mi-cr-center">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.precio}
                          onChange={(e) =>
                            updateRow(r.id, { precio: e.target.value === "" ? "" : Number(e.target.value) })
                          }
                          disabled={saving}
                        />
                      </div>

                      {/* % IVA */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--iva mi-cr-center">
<select
  className="fl-input fl-select fl-select-iva--car"
  value={String(r.ivaPct)}
  onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
  onKeyDown={(e) => {
    // Evita cambiar opciones con flechas cuando el select está enfocado
    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
  }}
  onWheel={(e) => {
    // Evita que la ruedita cambie el valor
    e.currentTarget.blur();
  }}
  disabled={saving}
>
  {IVA_OPTIONS.map((x) => (
    <option key={x.value} value={x.value}>
      {x.label}
    </option>
  ))}
</select>
                      </div>

                      {/* IVA monto */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto mi-cr-center">
                        <div className="mi-cr-money mi-cr-money--soft">{moneyARS(r.ivaMonto)}</div>
                      </div>

                      {/* Total */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--total mi-cr-center">
                        <div className="mi-cr-money mi-cr-money--strong Total--IVA">{moneyARS(r.total)}</div>
                      </div>

                      {/* Acción */}
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

              {/* footer tabla */}
              <div className="mi-cr-table__foot">
                <button type="button" onClick={addRow} disabled={saving} className="mi-cr-addrow">
                  Agregar fila
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

            {/* Filtros derecha */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Filtros</div>

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

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder="MM-YYYY"
                      inputMode="numeric"
                      value={periodo}
                      onChange={(e) => onPeriodoChange(e.target.value)}
                      disabled={saving}
                    />
                    <label className="fl-label">Período</label>
                  </div>
                </div>
              </div>

              <div className="mi-cr-filters__body">
                <div className="fl-grid mi-cr-onecol" style={{ gridTemplateColumns: "1fr" }}>
                  {/* Clasificación (siempre visible) */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_clasificacion)}
                      onChange={(e) => updateFilter("id_clasificacion", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Clasificación (opcional)</option>
                      {(listsNorm.clasificaciones || []).map((x) => {
                        const xid = getIdGeneric(x);
                        return (
                          <option key={xid || x.id} value={String(xid || x.id || "")}>
                            {x.nombre}
                          </option>
                        );
                      })}
                    </select>
                    <label className="fl-label">Clasificación</label>
                  </div>

                  {/* Tipo Operación (siempre visible primero) */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_tipo_operacion)}
                      onChange={(e) => {
                        updateFilter("id_tipo_operacion", e.target.value);
                        // Resetear campos dependientes
                        updateFilter("id_cliente", NULL_OPTION);
                        updateFilter("id_proveedor", NULL_OPTION);
                        setClienteInput("");
                        setProveedorInput("");
                      }}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Seleccionar tipo de operación *</option>
                      {(listsNorm.tipos_operacion || []).map((x) => {
                        const xid = getIdGeneric(x);
                        return (
                          <option key={xid || x.id} value={String(xid || x.id || "")}>
                            {x.nombre}
                          </option>
                        );
                      })}
                    </select>
                    <label className="fl-label">Tipo Operación</label>
                  </div>

                  {/* Tipo Venta (siempre visible) */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_tipo_venta)}
                      onChange={(e) => {
                        updateFilter("id_tipo_venta", e.target.value);
                        // Resetear campos dependientes
                        updateFilter("id_medio_pago", NULL_OPTION);
                        updateFilter("id_cuenta_corriente", NULL_OPTION);
                      }}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Tipo venta (opcional)</option>
                      {(listsNorm.tipos_venta || []).map((x) => {
                        const xid = getIdGeneric(x);
                        return (
                          <option key={xid || x.id} value={String(xid || x.id || "")}>
                            {x.nombre}
                          </option>
                        );
                      })}
                    </select>
                    <label className="fl-label">Tipo Venta</label>
                  </div>

                  {/* Medio de pago - solo si es contado */}
                  {tipoVentaEsContado && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(filters.id_medio_pago)}
                        onChange={(e) => updateFilter("id_medio_pago", e.target.value)}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Medio pago (opcional)</option>
                        {(listsNorm.medios_pago || []).map((x) => {
                          const xid = getIdGeneric(x);
                          return (
                            <option key={xid || x.id} value={String(xid || x.id || "")}>
                              {x.nombre}
                            </option>
                          );
                        })}
                      </select>
                      <label className="fl-label">Medio Pago</label>
                    </div>
                  )}



                  {/* CLIENTE - condicional según tipo operación */}
                  {mostrarCliente && (
                    <div className="fl-field mi-cr-rel">
                      <input
                        ref={clienteInputRef}
                        className="fl-input"
                        placeholder=" "
                        value={clienteInput}
                        onChange={handleClienteInputChange}
                        onFocus={() => setClienteFocus(true)}
                        onBlur={() => setTimeout(() => setClienteFocus(false), 120)}
                        disabled={saving || addUI.open}
                        autoComplete="off"
                      />
                      <label className="fl-label">Cliente (opcional)</label>

                      {clienteFocus && filteredClientes.length > 0 && (
                        <ul className="mi-cr-suggest">
                          {filteredClientes.map((c) => {
                            const cid = getClienteId(c) ?? c?.id;
                            return (
                              <li
                                key={cid ?? c?.id ?? String(Math.random())}
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
                  )}

                  {/* PROVEEDOR - condicional según tipo operación */}
                  {mostrarProveedor && (
                    <div className="fl-field mi-cr-rel">
                      <input
                        ref={proveedorInputRef}
                        className="fl-input"
                        placeholder=" "
                        value={proveedorInput}
                        onChange={handleProveedorInputChange}
                        onFocus={() => setProveedorFocus(true)}
                        onBlur={() => setTimeout(() => setProveedorFocus(false), 120)}
                        disabled={saving || addUI.open}
                        autoComplete="off"
                      />
                      <label className="fl-label">Proveedor (opcional)</label>

                      {proveedorFocus && filteredProveedores.length > 0 && (
                        <ul className="mi-cr-suggest">
                          {filteredProveedores.map((p) => {
                            const pid = getProveedorId(p) ?? p?.id;
                            return (
                              <li
                                key={pid ?? p?.id ?? String(Math.random())}
                                className="mi-cr-suggest__item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectProveedor(p);
                                }}
                              >
                                {p.nombre}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      <button
                        type="button"
                        className="mi-cr-link"
                        onClick={startAddProveedor}
                        disabled={saving || addUI.saving}
                      >
                        + Agregar nuevo proveedor
                      </button>
                    </div>
                  )}
                </div>

                <div className="mi-cr-filters__actions">
                  <button type="button" onClick={submit} disabled={saving} className="mit-btn mit-btn--solid mit-btn--block">
                    {saving ? "Guardando..." : "Guardar todo"}
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

        {/* Mini modal alta rápida */}
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
  );

  return createPortal(modalJSX, document.body);
}