// src/components/Movimientos/modales/ModalEditarVenta.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css";
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

const IVA_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "10,5%", value: 10.5 },
  { label: "21%", value: 21 },
];

/* =========================
   ✅ Auth + headers (SaaS: X-Session)
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
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { token, sessionKey, idUsuario };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}\n${preview}`);
  }
}

function buildAuthHeaders() {
  const { token, sessionKey } = getAuthInfo();
  const headers = { "Content-Type": "application/json" };
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (!sessionKey && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiPostJson(url, payload) {
  const headers = buildAuthHeaders();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
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

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* =========================
   Fecha / Periodo helpers
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

function periodoMMYYYY_to_YYYYMM(mmYYYY) {
  const s = String(mmYYYY ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{4}$/.test(s)) {
    const [mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}`;
  }
  return s;
}

function periodoFromISODate(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}-${y}`;
}

/* =========================
   Util: buscar ID por nombre
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
  const id = Number(hit?.id);
  return Number.isFinite(id) && id > 0 ? String(id) : NULL_OPTION;
}

function findIdByExact(arr, exactText) {
  const ex = normText(exactText);
  const a = Array.isArray(arr) ? arr : [];
  const hit = a.find((x) => normText(x?.nombre) === ex);
  const id = Number(hit?.id);
  return Number.isFinite(id) && id > 0 ? String(id) : NULL_OPTION;
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
  periodos: [],
  clasificaciones: [],
  tiposVenta: [],
  cuentasCorrientes: [],
  tiposMovimiento: [],
  clientes: [],
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
      : [];

  return {
    periodos: Array.isArray(src.periodos) ? src.periodos : [],
    clasificaciones: Array.isArray(src.clasificaciones) ? src.clasificaciones : [],
    tiposVenta: Array.isArray(tiposVenta) ? tiposVenta : [],
    cuentasCorrientes: Array.isArray(cuentas) ? cuentas : [],
    tiposMovimiento: Array.isArray(tiposMov) ? tiposMov : [],
    clientes: Array.isArray(src.clientes) ? src.clientes : [],
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    mediosPago: Array.isArray(medios) ? medios : [],
  };
}

/* =========================
   Build form desde row (venta)
========================= */
function buildFormFromRowVenta(row, periodoDefault, fixedLocal) {
  const r = row || {};

  const fecha = String(r.fecha || "").slice(0, 10) || "";
  const perRow = normalizePeriodoToMMYYYY(r.periodo || "");
  const perDef = normalizePeriodoToMMYYYY(periodoDefault || "");
  const perByFecha = periodoFromISODate(fecha || todayISO());
  const pickPeriodo = perRow || perDef || perByFecha || "";

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

  // ⚠️ id_tipo_movimiento: el backend lo necesita, pero NO lo mostramos en UI
  const idSalida = fixedLocal?.idSalida ?? NULL_OPTION;

  return {
    id_movimiento: safeNumber(r.id_movimiento) || null,
    fecha,
    periodo: pickPeriodo,

    id_cuenta_corriente: sOrNull(r.id_cuenta_corriente),
    id_medio_pago: nOrNull(r.id_medio_pago),

    // ✅ editable en UI
    id_tipo_venta: nOrNull(r.id_tipo_venta),

    // ✅ fijo interno (no UI)
    id_tipo_movimiento: idSalida !== NULL_OPTION ? idSalida : nOrNull(r.id_tipo_movimiento),

    id_cliente: sOrNull(r.id_cliente),
    id_detalle: sOrNull(r.id_detalle),

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
   UI helpers
========================= */
function nameById(arr, id) {
  const sid = String(id ?? "").trim();
  if (!sid || sid === NULL_OPTION || sid === ADD_OPTION) return "";
  const found = (Array.isArray(arr) ? arr : []).find((x) => String(x?.id) === sid);
  return String(found?.nombre ?? "").trim();
}

function getTipoVentaObj(tiposVentaArr, idTipoVenta) {
  const sid = String(idTipoVenta ?? "").trim();
  if (!sid || sid === NULL_OPTION) return null;
  return (Array.isArray(tiposVentaArr) ? tiposVentaArr : []).find((x) => String(x?.id) === sid) || null;
}

function isTipoVentaContado(tipoVentaObj) {
  const n = String(tipoVentaObj?.nombre ?? "").toLowerCase();
  return n.includes("contado") || n.includes("efectivo");
}

function isTipoVentaCuentaCorriente(tipoVentaObj) {
  const n = String(tipoVentaObj?.nombre ?? "").toLowerCase();
  return n.includes("cuenta") || n.includes("corriente");
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
   ✅ Mini modal reutilizable
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
          <button type="button" className="mi-mini__close" onClick={onCancel} disabled={saving} aria-label="Cerrar">
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

export default function ModalEditarVenta({
  open,
  lists,
  row,
  periodoDefault,
  onClose,
  onSave,
  onToast,
  onCatalogCreated, // ✅ NUEVO: avisar al padre
  dark: darkProp,
}) {
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // ✅ DARK automático + soporta prop
  const [darkAuto, setDarkAuto] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDarkAuto(isTemaOscuro());

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
  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;

  // bloquear scroll del body
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
  const periodoDefaultRef = useRef(periodoDefault);
  useEffect(() => void (listsRef.current = lists), [lists]);
  useEffect(() => void (rowRef.current = row), [row]);
  useEffect(() => void (periodoDefaultRef.current = periodoDefault), [periodoDefault]);

  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeIncomingLists(lists),
  }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const safeLists = useMemo(() => localLists, [localLists]);

  const [saving, setSaving] = useState(false);

  // --------- form ----------
  const [form, setForm] = useState(() => {
    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    const fixedLocal = {
      idSalida: findIdByIncludes(merged.tiposMovimiento, "salida"),
      idConsumidorFinal: findIdByIncludes(merged.clientes, "consumidor final"),
    };
    const built = buildFormFromRowVenta(row, periodoDefault, fixedLocal);

    // si no hay cliente => consumidor final
    const hasCliente = String(built.id_cliente || "").trim() && String(built.id_cliente) !== NULL_OPTION;
    if (!hasCliente && fixedLocal.idConsumidorFinal !== NULL_OPTION) {
      built.id_cliente = String(fixedLocal.idConsumidorFinal);
    }
    return built;
  });

  // Autocomplete states
  const [clienteInput, setClienteInput] = useState(() => {
    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    return nameById(merged.clientes, form.id_cliente);
  });
  const [clienteFocus, setClienteFocus] = useState(false);

  const [detalleInput, setDetalleInput] = useState(() => {
    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    return nameById(merged.detalles, form.id_detalle);
  });
  const [detalleFocus, setDetalleFocus] = useState(false);

  const closeBtnRef = useRef(null);
  const fechaRef = useRef(null);

  // ✅ Mini modal: alta rápida (cliente/detalle)
  const [addUI, setAddUI] = useState({
    open: false,
    catalogo: null, // "clientes" | "detalles"
    text: "",
    saving: false,
  });

  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, catalogo: null, text: "", saving: false });
  }, [addUI.saving]);

  const startAddCliente = useCallback(() => {
    if (saving) return;
    setAddUI({ open: true, catalogo: "clientes", text: clienteInput.trim() || "", saving: false });
  }, [saving, clienteInput]);

  const startAddDetalle = useCallback(() => {
    if (saving) return;
    setAddUI({ open: true, catalogo: "detalles", text: detalleInput.trim() || "", saving: false });
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
      showToast("error", "No hay sesión activa (Falta X-Session). Iniciá sesión de nuevo.", 5200);
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${catalogo === "clientes" ? "cliente" : "detalle"}…`, 12000);

    try {
      const data = await apiPostJson(API_CATALOGO, {
        catalogo,
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el ítem.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) throw new Error("El servidor no devolvió un ID válido.");

      // ✅ actualizar listas locales del modal
      setLocalLists((prev) => {
        const next = { ...prev };
        const key = catalogo === "clientes" ? "clientes" : "detalles";
        const arr = Array.isArray(prev[key]) ? prev[key].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) arr.push({ id: newId, nombre: newNombre });
        next[key] = arr;
        return next;
      });

      // ✅ avisar al padre (Ventas.jsx) para que actualice SU estado lists
      onCatalogCreated?.({
        catalogo,
        item: { id: newId, nombre: newNombre },
      });

      // setear en el form + input correspondiente
      if (catalogo === "clientes") {
        setForm((p) => ({ ...p, id_cliente: String(newId) }));
        setClienteInput(newNombre);
        setClienteFocus(false);
      } else {
        setForm((p) => ({ ...p, id_detalle: String(newId) }));
        setDetalleInput(newNombre);
        setDetalleFocus(false);
      }

      setAddUI({ open: false, catalogo: null, text: "", saving: false });
      showToast("exito", `${catalogo === "clientes" ? "Cliente" : "Detalle"} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando el ítem.", 4200);
    }
  }, [API_CATALOGO, addUI.catalogo, addUI.text, showToast, onCatalogCreated]);

  // abrir: reconstruir SIEMPRE
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;

    setSaving(false);
    setAddUI({ open: false, catalogo: null, text: "", saving: false });

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(listsRef.current) };
    setLocalLists(merged);

    const fixedLocal = {
      idSalida: findIdByIncludes(merged.tiposMovimiento, "salida"),
      idConsumidorFinal: findIdByIncludes(merged.clientes, "consumidor final"),
    };

    const built = buildFormFromRowVenta(rowRef.current, periodoDefaultRef.current, fixedLocal);

    const hasCliente = String(built.id_cliente || "").trim() && String(built.id_cliente) !== NULL_OPTION;
    const nextBuilt = { ...built };
    if (!hasCliente && fixedLocal.idConsumidorFinal !== NULL_OPTION) {
      nextBuilt.id_cliente = String(fixedLocal.idConsumidorFinal);
    }

    setForm(nextBuilt);

    setClienteInput(nameById(merged.clientes, nextBuilt.id_cliente));
    setClienteFocus(false);

    setDetalleInput(nameById(merged.detalles, nextBuilt.id_detalle));
    setDetalleFocus(false);

    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  // ESC cierra (si no está guardando ni mini modal)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (saving || addUI.open) return;
      onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, addUI.open, onClose]);

  const cerrar = useCallback(() => {
    if (saving || addUI.open) return;
    onClose?.();
  }, [saving, addUI.open, onClose]);

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
    setForm((p) => {
      const perAuto = periodoFromISODate(v);
      return { ...p, fecha: v, periodo: perAuto || p.periodo };
    });
  }, []);

  const onPeriodoChange = useCallback((raw) => {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 6);
    let next = "";
    if (digits.length <= 2) next = digits;
    else next = `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length === 6) next = normalizePeriodoToMMYYYY(next);
    setForm((p) => ({ ...p, periodo: next }));
  }, []);

  /* =========================
     Item handlers
  ========================= */
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

  const onCantidadChange = useCallback((v) => recalcFromItem({ cantidad: v === "" ? "" : Number(v) }), [recalcFromItem]);
  const onPrecioChange = useCallback((v) => recalcFromItem({ precio: v === "" ? "" : Number(v) }), [recalcFromItem]);
  const onIvaPctChange = useCallback((v) => recalcFromItem({ iva_pct: v === "" ? "" : Number(v) }), [recalcFromItem]);

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

  /* =========================
     Autocomplete: Cliente / Detalle
  ========================= */
  const filteredClientes = useMemo(() => {
    const all = Array.isArray(safeLists.clientes) ? safeLists.clientes : [];
    const q = clienteInput.trim().toLowerCase();
    if (!clienteFocus || q.length < 1) return [];
    return all.filter((c) => String(c?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
  }, [safeLists.clientes, clienteInput, clienteFocus]);

  const filteredDetalles = useMemo(() => {
    const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
    const q = detalleInput.trim().toLowerCase();
    if (!detalleFocus || q.length < 1) return [];
    return all.filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
  }, [safeLists.detalles, detalleInput, detalleFocus]);

  const handleClienteInputChange = useCallback((e) => {
    const value = e.target.value;
    setClienteInput(value);
    setForm((prev) => ({ ...prev, id_cliente: NULL_OPTION }));
  }, []);

  const handleSelectCliente = useCallback((cliente) => {
    const nombre = String(cliente?.nombre ?? "").trim();
    setClienteInput(nombre);
    setForm((prev) => ({
      ...prev,
      id_cliente: cliente?.id != null ? String(cliente.id) : NULL_OPTION,
    }));
    setClienteFocus(false);
  }, []);

  const handleDetalleInputChange = useCallback((e) => {
    const value = e.target.value;
    setDetalleInput(value);
    setForm((prev) => ({ ...prev, id_detalle: NULL_OPTION }));
  }, []);

  const handleSelectDetalle = useCallback((det) => {
    const nombre = String(det?.nombre ?? "").trim();
    setDetalleInput(nombre);
    setForm((prev) => ({
      ...prev,
      id_detalle: det?.id != null ? String(det.id) : NULL_OPTION,
    }));
    setDetalleFocus(false);
  }, []);

  // ✅ Auto-fijar ID al salir del input si hay match exacto
  const autoFixClienteIdOnBlur = useCallback(() => {
    setTimeout(() => setClienteFocus(false), 120);
    setForm((p) => {
      const cur = String(p.id_cliente || "");
      if (cur && cur !== NULL_OPTION) return p;
      const txt = clienteInput.trim();
      if (!txt) return p;
      const found = findIdByExact(safeLists.clientes, txt);
      if (found === NULL_OPTION) return p;
      return { ...p, id_cliente: found };
    });
  }, [clienteInput, safeLists.clientes]);

  const autoFixDetalleIdOnBlur = useCallback(() => {
    setTimeout(() => setDetalleFocus(false), 120);
    setForm((p) => {
      const cur = String(p.id_detalle || "");
      if (cur && cur !== NULL_OPTION) return p;
      const txt = detalleInput.trim();
      if (!txt) return p;
      const found = findIdByExact(safeLists.detalles, txt);
      if (found === NULL_OPTION) return p;
      return { ...p, id_detalle: found };
    });
  }, [detalleInput, safeLists.detalles]);

  /* =========================
     Mostrar/Ocultar según Tipo de venta
  ========================= */
  const tipoVentaObj = useMemo(
    () => getTipoVentaObj(safeLists.tiposVenta, form.id_tipo_venta),
    [safeLists.tiposVenta, form.id_tipo_venta]
  );
  const esContado = useMemo(() => isTipoVentaContado(tipoVentaObj), [tipoVentaObj]);
  const esCuentaCorriente = useMemo(() => isTipoVentaCuentaCorriente(tipoVentaObj), [tipoVentaObj]);

  // Cuando cambia tipo venta, limpiamos el campo que no aplica
  useEffect(() => {
    if (!open) return;
    setForm((p) => {
      const next = { ...p };
      if (esContado) next.id_cuenta_corriente = NULL_OPTION;
      else if (esCuentaCorriente) next.id_medio_pago = NULL_OPTION;
      return next;
    });
  }, [open, esContado, esCuentaCorriente]);

  /* =========================
     Payload final (venta)
========================= */
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
      periodo: periodoMMYYYY_to_YYYYMM(normalizePeriodoToMMYYYY(form.periodo)),

      id_tipo_venta: toNullableId(form.id_tipo_venta),
      id_tipo_movimiento: toNullableId(form.id_tipo_movimiento),

      id_cuenta_corriente: toNullableId(form.id_cuenta_corriente),
      id_medio_pago: toNullableId(form.id_medio_pago),

      id_cliente: toNullableId(form.id_cliente),
      id_proveedor: null,

      id_detalle: toNullableId(form.id_detalle),

      cantidad: Math.round(cantidad * 1000) / 1000,
      precio: Math.round(precio * 100) / 100,
      iva_pct: Math.round(iva_pct * 100) / 100,
      subtotal: t.subtotal,
      iva_monto: t.iva_monto,
      total: t.total,
      monto_total: Math.max(0, Math.round(t.total * 100) / 100),
    };
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    if (addUI.open) {
      showToast("advertencia", "Cerrá el mini modal (guardar o cancelar) antes de guardar la venta.", 3200);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) {
        throw new Error("Fecha inválida.");
      }

      const perUI = normalizePeriodoToMMYYYY(form.periodo);
      const perAuto = periodoFromISODate(form.fecha);
      const finalPer = perUI || perAuto;

      // ✅ Tipo venta obligatorio
      if (!form.id_tipo_venta || String(form.id_tipo_venta) === NULL_OPTION) {
        throw new Error("En Ventas la Forma de venta (Tipo venta) es obligatoria.");
      }

      // ✅ Cliente obligatorio (con autofix por texto exacto)
      let finalIdCliente = form.id_cliente;
      if ((!finalIdCliente || finalIdCliente === NULL_OPTION) && clienteInput.trim()) {
        const foundId = findIdByExact(safeLists.clientes, clienteInput.trim());
        if (foundId !== NULL_OPTION) finalIdCliente = foundId;
      }
      if (!finalIdCliente || finalIdCliente === NULL_OPTION || finalIdCliente === ADD_OPTION) {
        throw new Error("En Ventas el Cliente es obligatorio (seleccioná uno).");
      }

      // ✅ Detalle obligatorio (con autofix por texto exacto)
      let finalIdDetalle = form.id_detalle;
      if ((!finalIdDetalle || finalIdDetalle === NULL_OPTION) && detalleInput.trim()) {
        const foundId = findIdByExact(safeLists.detalles, detalleInput.trim());
        if (foundId !== NULL_OPTION) finalIdDetalle = foundId;
      }
      if (!finalIdDetalle || finalIdDetalle === NULL_OPTION || finalIdDetalle === ADD_OPTION) {
        throw new Error("En Ventas el Detalle es obligatorio (seleccioná uno).");
      }

      // ✅ Reglas por tipo venta
      if (esContado) {
        if (!form.id_medio_pago || String(form.id_medio_pago) === NULL_OPTION) {
          throw new Error("En ventas al contado el Medio de pago es obligatorio.");
        }
      }
      if (esCuentaCorriente) {
        if (!form.id_cuenta_corriente || String(form.id_cuenta_corriente) === NULL_OPTION) {
          throw new Error("En ventas por Cuenta Corriente la Cuenta Corriente es obligatoria.");
        }
      }

      const cantidad = Math.max(0, safeNumber(form.cantidad));
      const precio = Math.max(0, safeNumber(form.precio));
      const iva_pct = Math.max(0, safeNumber(form.iva_pct));
      const t = calcItemTotals(cantidad, precio, iva_pct);

      const payloadFinal = {
        ...payload,
        periodo: periodoMMYYYY_to_YYYYMM(finalPer || ""),
        id_cliente: Number(finalIdCliente),
        id_detalle: Number(finalIdDetalle),
        cantidad: Math.round(cantidad * 1000) / 1000,
        precio: Math.round(precio * 100) / 100,
        iva_pct: Math.round(iva_pct * 100) / 100,
        subtotal: t.subtotal,
        iva_monto: t.iva_monto,
        total: t.total,
        monto_total: Math.max(0, Math.round(t.total * 100) / 100),
      };

      await onSave?.(payloadFinal);

      showToast("exito", "Venta actualizada.", 2400);
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando venta.", 4200);
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
    addUI.catalogo === "clientes" ? "Nuevo cliente" : addUI.catalogo === "detalles" ? "Nuevo detalle" : "Nuevo";

  return createPortal(
    <div className={overlayClass} onMouseDown={cerrar}>
      <div
        className={containerClass}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar venta</h2>
            <p className="mi-modal__subtitle">Cliente y Detalle obligatorios</p>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            disabled={saving || addUI.open}
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mi-em-form">
          <div className="mi-em-grid">
            {/* Izquierda */}
            <section className="mi-em-panel">
              <div className="mi-em-panelHead">Datos de la venta</div>

              <div className="mi-em-panelBody">
                <div className="fl-grid">
                  <div className="mi-row2 fl-col-full">
                    {/* ✅ Tipo de venta editable */}
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.id_tipo_venta)}
                        onChange={(e) => setForm((p) => ({ ...p, id_tipo_venta: e.target.value }))}
                        disabled={saving || addUI.open}
                      >
                        <option value={NULL_OPTION}>-- Seleccionar tipo de venta --</option>
                        {(safeLists.tiposVenta || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Tipo de venta</label>
                    </div>
                  </div>

                  <div className="mi-row2 fl-col-full">
                    {/* ✅ Detalle autocomplete + agregar */}
                    <div className="fl-field mi-autocomplete" style={{ position: "relative" }}>
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={detalleInput}
                        onChange={handleDetalleInputChange}
                        onFocus={() => setDetalleFocus(true)}
                        onBlur={autoFixDetalleIdOnBlur}
                        disabled={saving || addUI.open}
                        autoComplete="off"
                      />
                      <label className="fl-label">Detalle (obligatorio)</label>

                      {detalleFocus && filteredDetalles.length > 0 && (
                        <ul className="mi-cr-suggest">
                          {filteredDetalles.map((d) => (
                            <li
                              key={d.id}
                              className="mi-cr-suggest__item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectDetalle(d);
                              }}
                            >
                              <span
                                style={{
                                  flex: 1,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {d.nombre}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <button
                        type="button"
                        onClick={startAddDetalle}
                        disabled={saving || addUI.open || addUI.saving}
                        className="mi-cr-link"
                        style={{ marginTop: 8 }}
                      >
                        + Agregar nuevo detalle
                      </button>
                    </div>

                    {/* ✅ Cuenta Corriente SOLO si es cuenta corriente */}
                    {esCuentaCorriente ? (
                      <div className="fl-field">
                        <select
                          className="fl-input fl-select"
                          value={String(form.id_cuenta_corriente)}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, id_cuenta_corriente: e.target.value }))
                          }
                          disabled={saving || addUI.open}
                        >
                          <option value={NULL_OPTION}>-- Seleccionar cuenta corriente --</option>
                          {(safeLists.cuentasCorrientes || []).map((x) => (
                            <option key={x.id} value={String(x.id)}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">Cuenta corriente (obligatoria)</label>
                      </div>
                    ) : (
                      <div className="fl-field" style={{ opacity: 0.6 }}>
                        <input className="fl-input" disabled value="No aplica" />
                        <label className="fl-label">Cuenta corriente</label>
                      </div>
                    )}
                  </div>

                  <div className="mi-em-item fl-col-full">
                    <div className="mi-em-itemTitle">Ítem de la venta (editable)</div>

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
                          disabled={saving || addUI.open}
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
                          disabled={saving || addUI.open}
                        />
                        <label className="fl-label">Precio unitario</label>
                      </div>

                      <div className="fl-field">
                        <select
                          className="fl-input fl-select"
                          value={String(form.iva_pct)}
                          onChange={(e) => onIvaPctChange(e.target.value)}
                          disabled={saving || addUI.open}
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
                      disabled={saving || addUI.open}
                    />
                    <label className="fl-label">Monto total (ajusta el precio)</label>
                  </div>
                </div>
              </div>
            </section>

            {/* Derecha */}
            <aside className="mi-em-aside">
              <div className="mi-em-asideTitle">Relaciones y pago</div>

              <div className="mi-em-dates">
                <div className="fl-field">
                  <input
                    ref={fechaRef}
                    className="fl-input"
                    type="date"
                    value={form.fecha}
                    onChange={(e) => onFechaChange(e.target.value)}
                    disabled={saving || addUI.open}
                    onClick={openDatePicker}
                    onFocus={openDatePicker}
                  />
                  <label className="fl-label">Fecha</label>
                </div>

                <div className="fl-field">
                  <input
                    className="fl-input"
                    placeholder="MM-YYYY"
                    inputMode="numeric"
                    value={form.periodo}
                    onChange={(e) => onPeriodoChange(e.target.value)}
                    disabled={saving || addUI.open}
                  />
                  <label className="fl-label">Período</label>
                </div>
              </div>

              <div className="mi-em-asideBody">
                {/* ✅ Medio de pago SOLO si es contado */}
                {esContado ? (
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_medio_pago)}
                      onChange={(e) => setForm((p) => ({ ...p, id_medio_pago: e.target.value }))}
                      disabled={saving || addUI.open}
                    >
                      <option value={NULL_OPTION}>-- Seleccionar medio de pago --</option>
                      {(safeLists.mediosPago || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Medio de pago (obligatorio)</label>
                  </div>
                ) : (
                  <div className="fl-field" style={{ opacity: 0.6 }}>
                    <input className="fl-input" disabled value="No aplica" />
                    <label className="fl-label">Medio de pago</label>
                  </div>
                )}

                {/* ✅ Cliente autocomplete + agregar */}
                <div className="fl-field mi-autocomplete" style={{ position: "relative" }}>
                  <input
                    className="fl-input"
                    placeholder=" "
                    value={clienteInput}
                    onChange={handleClienteInputChange}
                    onFocus={() => setClienteFocus(true)}
                    onBlur={autoFixClienteIdOnBlur}
                    disabled={saving || addUI.open}
                    autoComplete="off"
                  />
                  <label className="fl-label">Cliente (obligatorio)</label>

                  {clienteFocus && filteredClientes.length > 0 && (
                    <ul className="mi-cr-suggest">
                      {filteredClientes.map((c) => (
                        <li
                          key={c.id}
                          className="mi-cr-suggest__item"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectCliente(c);
                          }}
                        >
                          <span
                            style={{
                              flex: 1,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {c.nombre}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <button
                    type="button"
                    onClick={startAddCliente}
                    disabled={saving || addUI.open || addUI.saving}
                    className="mi-cr-link"
                    style={{ marginTop: 8 }}
                  >
                    + Agregar nuevo cliente
                  </button>
                </div>

                <div className="mi-em-actions">
                  <button
                    type="submit"
                    disabled={saving || addUI.open}
                    className="mit-btn mit-btn--solid mit-btn--block"
                  >
                    {saving ? "Guardando..." : "Guardar"}
                  </button>

                  <button
                    type="button"
                    onClick={cerrar}
                    disabled={saving || addUI.open}
                    className="mit-btn mit-btn--ghost mit-btn--block"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </form>

        {/* ✅ Mini modal (cliente/detalle) con dark */}
        <AddCatalogMiniModal
          open={addUI.open}
          title={miniTitle}
          label="Nombre"
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={closeAddMini}
          onSave={guardarNuevoCatalogo}
          dark={dark}
        />
      </div>
    </div>,
    document.body
  );
}
