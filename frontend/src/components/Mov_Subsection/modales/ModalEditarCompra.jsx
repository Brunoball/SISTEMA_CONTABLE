// src/components/Compras/modales/ModalEditarCompra.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
   ✅ IDs tolerantes
========================= */
function getProveedorId(p) {
  const cand = p?.id ?? p?.id_proveedor ?? p?.idProveedor ?? p?.proveedor_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getDetalleId(d) {
  const cand = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getGenericId(x) {
  const cand =
    x?.id ??
    x?.ID ??
    x?.id_item ??
    x?.idCatalogo ??
    x?.id_cuenta_corriente ??
    x?.id_medio_pago ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* =========================
   ✅ Cuenta Corriente: unificar (sin Débito/Crédito)
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

  // elegimos la primera que sea "cuenta corriente" (sea debito/credito o no), si no existe, la primera del array
  const hit = arr.find((x) => normalizeText(x?.nombre).includes("cuenta corriente")) || arr[0];

  const pickedId = getGenericId(hit);
  if (!pickedId) return { list: [], pickedId: null };

  return { list: [{ id: pickedId, nombre: "Cuenta Corriente" }], pickedId };
}

/* =========================
   Safe lists + normalización
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
  cuentasCorrientes: [],
  proveedores: [],
  detalles: [],
  mediosPago: [],
};

function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};
  const src = l.listas && typeof l.listas === "object" ? l.listas : l;

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

  return {
    periodos: Array.isArray(src.periodos) ? src.periodos : [],
    clasificaciones: Array.isArray(src.clasificaciones) ? src.clasificaciones : [],
    cuentasCorrientes: Array.isArray(cuentas) ? cuentas : [],
    proveedores: Array.isArray(src.proveedores) ? src.proveedores : [],
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    mediosPago: Array.isArray(medios) ? medios : [],
  };
}

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

// UI: MM-YYYY
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

// API: YYYY-MM
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
   Dark helper
========================= */
function isTemaOscuro() {
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
}

/* =========================
   Auth helpers (✅ X-Session)
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
   Catálogo map (compras)
========================= */
const CATALOGO_MAP = {
  id_clasificacion: { catalogo: "clasificaciones", label: "Clasificación" },
  id_cuenta_corriente: { catalogo: "cuentas_corrientes", label: "Cuenta corriente" },
  id_proveedor: { catalogo: "proveedores", label: "Proveedor" },
  id_detalle: { catalogo: "detalles", label: "Detalle" },
  id_medio_pago: { catalogo: "medios_pago", label: "Medio de pago" },
};

const LISTKEY_BY_CATALOGO = {
  clasificaciones: "clasificaciones",
  cuentas_corrientes: "cuentasCorrientes",
  proveedores: "proveedores",
  detalles: "detalles",
  medios_pago: "mediosPago",
};

/* =========================
   Mini Modal: alta rápida
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
   Build form desde row (compra)
========================= */
function buildFormFromRowCompra(row, periodoDefault) {
  const r = row || {};

  const fecha = String(r.fecha || "").slice(0, 10) || "";
  const perRow = normalizePeriodoToMMYYYY(r.periodo || "");
  const perDef = normalizePeriodoToMMYYYY(periodoDefault || "");
  const perByFecha = periodoFromISODate(fecha || todayISO());
  const pickPeriodo = perRow || perDef || perByFecha || "";

  const nOrNull = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? String(Number(v)) : NULL_OPTION);

  const sOrNull = (v) => {
    if (v == null || v === "" || v === 0) return NULL_OPTION;
    return String(v);
  };

  const cantidad = r.cantidad != null ? safeNumber(r.cantidad) : 1;
  const precio = r.precio != null ? safeNumber(r.precio) : safeNumber(r.monto_total);
  const iva_pct = r.iva_pct != null ? safeNumber(r.iva_pct) : 0;

  const totals = calcItemTotals(cantidad, precio, iva_pct);

  const subtotal = r.subtotal != null ? safeNumber(r.subtotal) : totals.subtotal;
  const iva_monto = r.iva_monto != null ? safeNumber(r.iva_monto) : totals.iva_monto;
  const total = r.total != null ? safeNumber(r.total) : totals.total;

  const monto_total = r.monto_total != null ? safeNumber(r.monto_total) : total;

  return {
    id_movimiento: safeNumber(r.id_movimiento ?? r.id ?? r.id_compra) || null,
    fecha,
    periodo: pickPeriodo,

    id_clasificacion: nOrNull(r.id_clasificacion),
    id_cuenta_corriente: sOrNull(r.id_cuenta_corriente),

    id_proveedor: sOrNull(r.id_proveedor),
    id_detalle: sOrNull(r.id_detalle),
    id_medio_pago: nOrNull(r.id_medio_pago),

    monto_total: Math.max(0, Math.round(monto_total * 100) / 100),

    cantidad: Math.max(0, Math.round(cantidad * 1000) / 1000),
    precio: Math.max(0, Math.round(precio * 100) / 100),
    iva_pct: Math.max(0, Math.round(iva_pct * 100) / 100),

    subtotal: Math.max(0, Math.round(subtotal * 100) / 100),
    iva_monto: Math.max(0, Math.round(iva_monto * 100) / 100),
    total: Math.max(0, Math.round(total * 100) / 100),
  };
}

export default function ModalEditarCompra({
  open,
  lists,
  row,
  periodoDefault,
  onClose,
  onSave,
  onCatalogCreated,
  onToast,
  dark: darkProp,
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // dark auto
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

  // bloquear scroll
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

  const [localLists, setLocalLists] = useState(() => ({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);
  const safeLists = useMemo(() => localLists, [localLists]);

  // ✅ Cuenta Corriente unificada (solo “Cuenta Corriente”)
  const ccNormalized = useMemo(
    () => buildSingleCuentaCorrienteOption(safeLists.cuentasCorrientes),
    [safeLists.cuentasCorrientes]
  );
  const cuentasCorrientesList = useMemo(() => ccNormalized.list, [ccNormalized.list]);
  const cuentaCorrientePickedId = useMemo(() => ccNormalized.pickedId, [ccNormalized.pickedId]);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildFormFromRowCompra(row, periodoDefault));
  const [addUI, setAddUI] = useState({ open: false, field: null, text: "", saving: false });

  // Autocomplete
  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);
  const proveedorInputRef = useRef(null);

  const [detalleInput, setDetalleInput] = useState("");
  const [detalleFocus, setDetalleFocus] = useState(false);
  const detalleInputRef = useRef(null);

  const closeBtnRef = useRef(null);
  const fechaRef = useRef(null);

  // abrir: reconstruir SIEMPRE
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;

    setSaving(false);
    setAddUI({ open: false, field: null, text: "", saving: false });

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(listsRef.current) };
    setLocalLists(merged);

    const built = buildFormFromRowCompra(rowRef.current, periodoDefaultRef.current);
    setForm(built);

    const nameById = (arr, id, kind) => {
      const sid = String(id ?? "").trim();
      if (!sid || sid === NULL_OPTION || sid === ADD_OPTION) return "";
      const a = Array.isArray(arr) ? arr : [];
      const found = a.find((x) => {
        const xid =
          kind === "proveedores"
            ? getProveedorId(x)
            : kind === "detalles"
            ? getDetalleId(x)
            : getGenericId(x);
        return String(xid ?? "") === sid;
      });
      return String(found?.nombre ?? "").trim();
    };

    setProveedorInput(nameById(merged.proveedores, built.id_proveedor, "proveedores"));
    setProveedorFocus(false);

    setDetalleInput(nameById(merged.detalles, built.id_detalle, "detalles"));
    setDetalleFocus(false);

    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  // ✅ si no hay CC seteada, auto-seteamos la opción unificada (si existe)
  useEffect(() => {
    if (!open) return;
    setForm((p) => {
      const hasCC =
        p.id_cuenta_corriente &&
        p.id_cuenta_corriente !== NULL_OPTION &&
        p.id_cuenta_corriente !== ADD_OPTION;

      if (hasCC) return p;
      if (!cuentaCorrientePickedId) return p;

      return { ...p, id_cuenta_corriente: String(cuentaCorrientePickedId) };
    });
  }, [open, cuentaCorrientePickedId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const cerrar = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [saving, onClose]);

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
     API helper (✅ X-Session + errores)
  ========================= */
  const parseJsonOrThrow = useCallback(async (res) => {
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
  }, []);

  const apiPostJson = useCallback(
    async (url, payload) => {
      const { token, sessionKey } = getAuthInfo();
      const headers = { "Content-Type": "application/json" };

      if (sessionKey) headers["X-Session"] = sessionKey;
      else if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload ?? {}) });
      return await parseJsonOrThrow(res);
    },
    [parseJsonOrThrow]
  );

  /* =========================
     Alta rápida catálogo (mini modal)
  ========================= */
  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, field: null, text: "", saving: false });
  }, [addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async () => {
    if (!addUI.field) return;

    const meta = CATALOGO_MAP[addUI.field];
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

      const item = data?.item || {};

      let newId = null;
      if (meta.catalogo === "proveedores") newId = getProveedorId(item) ?? getGenericId(item);
      else if (meta.catalogo === "detalles") newId = getDetalleId(item) ?? getGenericId(item);
      else newId = getGenericId(item);

      const newNombre = String(item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(Number(newId)) || Number(newId) <= 0) {
        throw new Error("El servidor no devolvió un ID válido del registro creado.");
      }

      const listKey = LISTKEY_BY_CATALOGO[meta.catalogo];
      if (!listKey) throw new Error("Catálogo desconocido para actualizar listas.");

      const pushNormalized = (catalogo, id, nombre) => {
        if (catalogo === "proveedores") return { id_proveedor: Number(id), nombre };
        if (catalogo === "detalles") return { id_detalle: Number(id), nombre };
        return { id: Number(id), nombre };
      };

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];

        const already = arr.some((x) => {
          const xid =
            meta.catalogo === "proveedores"
              ? getProveedorId(x)
              : meta.catalogo === "detalles"
              ? getDetalleId(x)
              : getGenericId(x);
          return Number(xid) === Number(newId);
        });

        if (!already) arr.push(pushNormalized(meta.catalogo, newId, newNombre));
        next[listKey] = arr;
        return next;
      });

      setForm((prev) => ({ ...prev, [addUI.field]: String(Number(newId)) }));

      if (addUI.field === "id_proveedor") {
        setProveedorInput(newNombre);
        setProveedorFocus(false);
        setTimeout(() => proveedorInputRef.current?.focus(), 0);
      }
      if (addUI.field === "id_detalle") {
        setDetalleInput(newNombre);
        setDetalleFocus(false);
        setTimeout(() => detalleInputRef.current?.focus(), 0);
      }

      try {
        onCatalogCreated?.(meta.catalogo, { id: Number(newId), nombre: newNombre });
      } catch {}

      setAddUI({ open: false, field: null, text: "", saving: false });
      showToast("exito", `${meta.label} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando el registro.", 4200);
    }
  }, [API, addUI, apiPostJson, onCatalogCreated, showToast]);

  /* =========================
     Autocomplete: Proveedor / Detalle
  ========================= */
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
    const value = e.target.value;
    setProveedorInput(value);
    setForm((prev) => ({ ...prev, id_proveedor: NULL_OPTION }));
  }, []);

  const handleSelectProveedor = useCallback((prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    const pid = getProveedorId(prov);
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
    const did = getDetalleId(det);
    setDetalleInput(nombre);
    setForm((prev) => ({ ...prev, id_detalle: did != null ? String(did) : NULL_OPTION }));
    setDetalleFocus(false);
  }, []);

  const startAddProveedor = useCallback(() => {
    setProveedorFocus(false);
    setAddUI({ open: true, field: "id_proveedor", text: proveedorInput || "", saving: false });
    setForm((prev) => ({ ...prev, id_proveedor: ADD_OPTION }));
  }, [proveedorInput]);

  const startAddDetalle = useCallback(() => {
    setDetalleFocus(false);
    setAddUI({ open: true, field: "id_detalle", text: detalleInput || "", saving: false });
    setForm((prev) => ({ ...prev, id_detalle: ADD_OPTION }));
  }, [detalleInput]);

  /* =========================
     Select con “OTRO (AGREGAR…)”
  ========================= */
  const onSelectWithAdd = useCallback((field, rawValue) => {
    if (rawValue === ADD_OPTION) {
      const isMini = field === "id_proveedor" || field === "id_detalle";
      if (isMini) return;
      setAddUI({ open: false, field, text: "", saving: false });
      setForm((p) => ({ ...p, [field]: ADD_OPTION }));
      return;
    }
    setAddUI((p) => (p.field === field && !p.open ? { open: false, field: null, text: "", saving: false } : p));
    setForm((p) => ({ ...p, [field]: rawValue }));
  }, []);

  const renderAddInline = (field) => {
    if (addUI.open) return null;
    if (addUI.field !== field) return null;
    if (field === "id_proveedor" || field === "id_detalle") return null;

    const label = CATALOGO_MAP[field]?.label || "Registro";

    return (
      <div className="mi-addInline">
        <div className="fl-field">
          <input
            className="fl-input"
            placeholder=" "
            value={addUI.text}
            onChange={(e) => setAddUI((p) => ({ ...p, text: e.target.value }))}
            disabled={addUI.saving}
          />
          <label className="fl-label">{`Nuevo ${label}`}</label>
        </div>

        <div className="mi-addInline__actions">
          <button
            type="button"
            className="mit-btn mit-btn--ghost"
            onClick={() => {
              setAddUI({ open: false, field: null, text: "", saving: false });
              setForm((p) => ({ ...p, [field]: NULL_OPTION }));
            }}
            disabled={addUI.saving}
          >
            Cancelar
          </button>

          <button type="button" className="mit-btn mit-btn--solid" onClick={guardarNuevoCatalogo} disabled={addUI.saving}>
            {addUI.saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    );
  };

  /* =========================
     ✅ Sync por nombre exacto (antes de guardar)
  ========================= */
  const resolveIdByExactName = useCallback(
    (kind) => {
      const norm = (s) => String(s ?? "").trim().toLowerCase();
      if (kind === "proveedor") {
        const name = norm(proveedorInput);
        if (!name) return null;
        const all = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
        const hit = all.find((p) => norm(p?.nombre) === name);
        return hit ? getProveedorId(hit) : null;
      }
      if (kind === "detalle") {
        const name = norm(detalleInput);
        if (!name) return null;
        const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
        const hit = all.find((d) => norm(d?.nombre) === name);
        return hit ? getDetalleId(hit) : null;
      }
      return null;
    },
    [proveedorInput, detalleInput, safeLists.proveedores, safeLists.detalles]
  );

  /* =========================
     Payload final
  ========================= */
  const payload = useMemo(() => {
    const isAdd = (v) => v === ADD_OPTION;
    const toNullableId = (v) => {
      if (v === NULL_OPTION || v === "" || v == null) return null;
      if (isAdd(v)) return null;
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

      id_clasificacion: toNullableId(form.id_clasificacion),
      id_cuenta_corriente: toNullableId(form.id_cuenta_corriente),

      id_proveedor: toNullableId(form.id_proveedor),
      id_detalle: toNullableId(form.id_detalle),
      id_medio_pago: toNullableId(form.id_medio_pago),

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
      showToast("advertencia", "Terminá de crear el registro (o cancelá) antes de guardar.", 3200);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      if (!form.id_movimiento) throw new Error("Falta id_movimiento (no puedo actualizar).");
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) throw new Error("Fecha inválida.");

      // ✅ FIX: si el usuario creó proveedor/detalle y quedó ID vacío, resolvemos por nombre exacto
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
        throw new Error("Seleccioná un proveedor (o crealo con “Agregar nuevo proveedor”).");
      }
      if (!detalleId || detalleId === NULL_OPTION || detalleId === ADD_OPTION) {
        throw new Error("Seleccioná un detalle (o crealo con “Agregar nuevo detalle”).");
      }

      const perUI = normalizePeriodoToMMYYYY(form.periodo);
      const perAuto = periodoFromISODate(form.fecha);
      const finalPer = perUI || perAuto;

      const cantidad = Math.max(0, safeNumber(form.cantidad));
      const precio = Math.max(0, safeNumber(form.precio));
      const iva_pct = Math.max(0, safeNumber(form.iva_pct));
      const t = calcItemTotals(cantidad, precio, iva_pct);

      const payloadFinal = {
        ...payload,
        id_proveedor: Number(proveedorId),
        id_detalle: Number(detalleId),

        periodo: periodoMMYYYY_to_YYYYMM(finalPer || ""),
        cantidad: Math.round(cantidad * 1000) / 1000,
        precio: Math.round(precio * 100) / 100,
        iva_pct: Math.round(iva_pct * 100) / 100,
        subtotal: t.subtotal,
        iva_monto: t.iva_monto,
        total: t.total,
        monto_total: Math.max(0, Math.round(t.total * 100) / 100),
      };

      await onSave?.(payloadFinal);

      showToast("exito", "Compra actualizada.", 2400);
      onClose?.();
    } catch (e2) {
      showToast("error", e2?.message || "Error guardando compra.", 4200);
      setSaving(false);
    }
  };

  const miniOpen = addUI.open && ["id_proveedor", "id_detalle"].includes(addUI.field);
  const miniTitle = addUI.field ? `Nuevo ${CATALOGO_MAP[addUI.field]?.label || "registro"}` : "Nuevo registro";

  if (!open) return null;

  const overlayClass = ["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""]
    .join(" ")
    .trim();

  const containerClass = ["mi-modal__container", "mi-modal__container--mov", "mi-modal__container--compra", dark ? "mi-modal--dark" : ""]
    .join(" ")
    .trim();

  return createPortal(
    <div className={overlayClass} onMouseDown={cerrar}>
      <div className={containerClass} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar compra</h2>
            <p className="mi-modal__subtitle">Actualizá los campos y guardá.</p>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            disabled={saving}
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mi-em-form">
          <div className="mi-em-grid">
            {/* Izquierda */}
            <section className="mi-em-panel">
              <div className="mi-em-panelHead">Datos de la compra</div>

              <div className="mi-em-panelBody">
                {/* Fila 1 */}
                <div className="mi-row2">
                  {/* Clasificación */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_clasificacion)}
                      onChange={(e) => onSelectWithAdd("id_clasificacion", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>-- Seleccionar clasificación --</option>
                      {(safeLists.clasificaciones || []).map((x) => {
                        const xid = getGenericId(x) ?? Number(x?.id);
                        return (
                          <option key={xid ?? x?.nombre} value={String(xid ?? "")}>
                            {x.nombre}
                          </option>
                        );
                      })}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Clasificación</label>
                    {renderAddInline("id_clasificacion")}
                  </div>

                  {/* Detalle (autocomplete) */}
                  <div className="fl-field mi-autocomplete">
                    <input
                      ref={detalleInputRef}
                      className="fl-input"
                      placeholder=" "
                      value={detalleInput}
                      onChange={handleDetalleInputChange}
                      onFocus={() => setDetalleFocus(true)}
                      onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
                      disabled={saving || addUI.open}
                      autoComplete="off"
                    />
                    <label className="fl-label">Detalle</label>

                    {detalleFocus && filteredDetalles.length > 0 && (
                      <ul className="mi-cr-suggest">
                        {filteredDetalles.map((d) => {
                          const did = getDetalleId(d);
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

                    <button type="button" onClick={startAddDetalle} disabled={saving || addUI.saving} className="mi-link">
                      + Agregar nuevo detalle
                    </button>
                  </div>
                </div>

                {/* Ítem */}
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
                        disabled={saving}
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
                        disabled={saving}
                      />
                      <label className="fl-label">Precio unitario</label>
                    </div>

                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.iva_pct)}
                        onChange={(e) => onIvaPctChange(e.target.value)}
                        disabled={saving}
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
                    disabled={saving}
                  />
                  <label className="fl-label">Monto total (ajusta el precio)</label>
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
                    disabled={saving}
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
                    disabled={saving}
                  />
                  <label className="fl-label">Período</label>
                </div>
              </div>

              <div className="mi-em-asideBody">
                {/* Medio pago */}
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(form.id_medio_pago)}
                    onChange={(e) => onSelectWithAdd("id_medio_pago", e.target.value)}
                    disabled={saving}
                  >
                    <option value={NULL_OPTION}>-- Seleccionar medio de pago --</option>
                    {(safeLists.mediosPago || []).map((x) => {
                      const xid = getGenericId(x) ?? Number(x?.id ?? x?.id_medio_pago);
                      return (
                        <option key={xid ?? x?.nombre} value={String(xid ?? "")}>
                          {x.nombre}
                        </option>
                      );
                    })}
                    <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                  </select>
                  <label className="fl-label">Medio de pago</label>
                  {renderAddInline("id_medio_pago")}
                </div>


                {/* Proveedor (autocomplete) */}
                <div className="fl-field mi-autocomplete">
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
                  <label className="fl-label">Proveedor</label>

                  {proveedorFocus && filteredProveedores.length > 0 && (
                    <ul className="mi-cr-suggest">
                      {filteredProveedores.map((p) => {
                        const pid = getProveedorId(p);
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

                  <button type="button" onClick={startAddProveedor} disabled={saving || addUI.saving} className="mi-link">
                    + Agregar nuevo proveedor
                  </button>
                </div>

                <div className="mi-em-actions">
                  <button type="submit" disabled={saving} className="mit-btn mit-btn--solid mit-btn--block">
                    {saving ? "Guardando..." : "Guardar"}
                  </button>

                  <button
                    type="button"
                    onClick={cerrar}
                    disabled={saving}
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
          open={miniOpen}
          title={miniTitle}
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={() => {
            // revertir ADD_OPTION si cancelás
            setForm((p) => ({
              ...p,
              id_proveedor: addUI.field === "id_proveedor" ? NULL_OPTION : p.id_proveedor,
              id_detalle: addUI.field === "id_detalle" ? NULL_OPTION : p.id_detalle,
            }));
            closeAddMini();
          }}
          onSave={guardarNuevoCatalogo}
          dark={dark}
        />
      </div>
    </div>,
    document.body
  );
}
