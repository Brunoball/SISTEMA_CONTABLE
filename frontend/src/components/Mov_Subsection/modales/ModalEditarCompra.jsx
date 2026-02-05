// src/components/Compras/modales/ModalEditarCompra.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ✅ misma estética
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

const IVA_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "10,5%", value: 10.5 },
  { label: "21%", value: 21 },
];

/* =========================
   Safe lists + normalización
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
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
    cuentasCorrientes: Array.isArray(cuentas) ? cuentas : [],
    tiposMovimiento: Array.isArray(tiposMov) ? tiposMov : [],
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

/* =========================
   Fecha / Periodo helpers
========================= */
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
   Auth helpers
========================= */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {
    // ignore
  }

  return { token, idUsuario };
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

  return {
    subtotal: r2(subtotal),
    iva_monto: r2(iva_monto),
    total: r2(total),
  };
}

function bytesToHuman(n) {
  const b = Number(n || 0);
  if (!Number.isFinite(b) || b <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* =========================
   Detectar ID "Salida" en tiposMovimiento
========================= */
function findSalidaTipoMovId(tiposMovimiento) {
  const arr = Array.isArray(tiposMovimiento) ? tiposMovimiento : [];
  const found = arr.find((x) => String(x?.nombre ?? "").trim().toLowerCase() === "salida");
  return found?.id != null ? String(found.id) : null;
}

/* =========================
   Build form desde row
   - row: compra/movimiento
   - items: si row.items viene, lo usa; si no, arma 1 item desde monto_total
========================= */
function buildFormFromRow(row, listsMerged, periodoDefault) {
  const r = row || {};

  const fecha = String(r.fecha || "").slice(0, 10) || "";
  const perRow = normalizePeriodoToMMYYYY(r.periodo || "");
  const perDef = normalizePeriodoToMMYYYY(periodoDefault || "");
  const perByFecha = periodoFromISODate(fecha || todayISO());
  const pickPeriodo = perRow || perDef || perByFecha || "";

  const nOrNull = (v) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? String(Number(v)) : NULL_OPTION;

  const sOrNull = (v) => {
    if (v == null || v === "" || v === 0) return NULL_OPTION;
    return String(v);
  };

  // ✅ tipo_movimiento fijo: SALIDA (si existe en listas)
  const salidaId = findSalidaTipoMovId(listsMerged.tiposMovimiento);

  // ✅ items
  const incomingItems = Array.isArray(r.items) ? r.items : Array.isArray(r.detalles_items) ? r.detalles_items : null;

  const items =
    incomingItems && incomingItems.length
      ? incomingItems.map((it, idx) => {
          const cantidad = it.cantidad != null ? safeNumber(it.cantidad) : 1;
          const precio = it.precio != null ? safeNumber(it.precio) : safeNumber(it.monto_total ?? 0);
          const iva_pct = it.iva_pct != null ? safeNumber(it.iva_pct) : safeNumber(it.iva ?? 0);
          const t = calcItemTotals(cantidad, precio, iva_pct);
          return {
            _tmpId: it._tmpId ?? `it-${idx}-${Date.now()}`,
            id_detalle: sOrNull(it.id_detalle),
            detalle_texto: String(it.detalle_texto ?? it.detalle ?? it.descripcion ?? "").trim(),
            cantidad: Math.max(0, Math.round(cantidad * 1000) / 1000),
            precio: Math.max(0, Math.round(precio * 100) / 100),
            iva_pct: Math.max(0, Math.round(iva_pct * 100) / 100),
            subtotal: t.subtotal,
            iva_monto: t.iva_monto,
            total: t.total,
          };
        })
      : (() => {
          const cantidad = 1;
          const precio = safeNumber(r.monto_total ?? r.total ?? 0);
          const iva_pct = safeNumber(r.iva_pct ?? 0);
          const t = calcItemTotals(cantidad, precio, iva_pct);
          return [
            {
              _tmpId: `it-0-${Date.now()}`,
              id_detalle: sOrNull(r.id_detalle),
              detalle_texto: String(r.detalle_texto ?? r.detalle ?? "").trim(),
              cantidad: 1,
              precio: Math.round(precio * 100) / 100,
              iva_pct: Math.round(iva_pct * 100) / 100,
              subtotal: t.subtotal,
              iva_monto: t.iva_monto,
              total: t.total,
            },
          ];
        })();

  const totals = items.reduce(
    (acc, it) => {
      acc.subtotal += safeNumber(it.subtotal);
      acc.iva_monto += safeNumber(it.iva_monto);
      acc.total += safeNumber(it.total);
      return acc;
    },
    { subtotal: 0, iva_monto: 0, total: 0 }
  );
  const r2 = (n) => Math.round(n * 100) / 100;

  return {
    id_movimiento: safeNumber(r.id_movimiento) || null,
    fecha,
    periodo: pickPeriodo,

    id_clasificacion: nOrNull(r.id_clasificacion),
    id_cuenta_corriente: sOrNull(r.id_cuenta_corriente),
    id_tipo_movimiento: salidaId || nOrNull(r.id_tipo_movimiento), // ✅ intenta salida

    id_proveedor: sOrNull(r.id_proveedor),

    id_medio_pago: nOrNull(r.id_medio_pago),

    // totales generales
    subtotal: r2(totals.subtotal),
    iva_monto: r2(totals.iva_monto),
    monto_total: r2(totals.total),

    // items
    items,

    // factura (si ya existía en backend)
    factura_path: String(r.factura_path ?? r.factura_url ?? "").trim(),
    factura_nombre: String(r.factura_nombre ?? "").trim(),
  };
}

/* =========================
   Mini Modal: alta rápida (catálogo)
========================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave }) {
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

  return (
    <div className="mi-mini__overlay" onMouseDown={onCancel}>
      <div className="mi-mini__modal" onMouseDown={(e) => e.stopPropagation()}>
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
    </div>
  );
}

export default function ModalEditarCompra({
  open,
  lists,
  row, // compra seleccionada (viene de la tabla)
  periodoDefault,
  onClose,
  onToast,
  onSaveCompra, // async ({ compra, items, facturaFile }) => {}
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

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

  const [form, setForm] = useState(() =>
    buildFormFromRow(row, { ...SAFE_LISTS, ...normalizeIncomingLists(lists) }, periodoDefault)
  );

  // Proveedor autocomplete
  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);
  const proveedorInputRef = useRef(null);

  // Detalle autocomplete (por fila: guardamos un inputMap)
  const [detalleFocusId, setDetalleFocusId] = useState(null);

  // Factura
  const [facturaFile, setFacturaFile] = useState(null);
  const [isDrag, setIsDrag] = useState(false);
  const fileInputRef = useRef(null);

  // Mini modal: alta rápida (proveedor/detalle/medio/cc/clasif)
  const [addUI, setAddUI] = useState({ open: false, field: null, text: "", saving: false });

  const closeBtnRef = useRef(null);
  const fechaRef = useRef(null);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (wasOpen) return;

    setSaving(false);
    setAddUI({ open: false, field: null, text: "", saving: false });

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(listsRef.current) };
    setLocalLists(merged);

    const built = buildFormFromRow(rowRef.current, merged, periodoDefaultRef.current);
    setForm(built);

    // proveedor input display
    const nameById = (arr, id) => {
      const sid = String(id ?? "").trim();
      if (!sid || sid === NULL_OPTION || sid === ADD_OPTION) return "";
      const found = (Array.isArray(arr) ? arr : []).find((x) => String(x?.id) === sid);
      return String(found?.nombre ?? "").trim();
    };

    setProveedorInput(nameById(merged.proveedores, built.id_proveedor));
    setProveedorFocus(false);

    // factura: al abrir modal, reseteamos "nuevo archivo" (pero dejamos link existente)
    setFacturaFile(null);
    setIsDrag(false);

    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
     Totales + items
========================= */
  const recalcAllTotals = useCallback((items) => {
    const r2 = (n) => Math.round(n * 100) / 100;
    const totals = (items || []).reduce(
      (acc, it) => {
        acc.subtotal += safeNumber(it.subtotal);
        acc.iva_monto += safeNumber(it.iva_monto);
        acc.total += safeNumber(it.total);
        return acc;
      },
      { subtotal: 0, iva_monto: 0, total: 0 }
    );
    return { subtotal: r2(totals.subtotal), iva_monto: r2(totals.iva_monto), monto_total: r2(totals.total) };
  }, []);

  const updateItem = useCallback(
    (tmpId, patch) => {
      setForm((p) => {
        const nextItems = (p.items || []).map((it) => {
          if (it._tmpId !== tmpId) return it;
          const next = { ...it, ...patch };
          const t = calcItemTotals(next.cantidad, next.precio, next.iva_pct);
          next.subtotal = t.subtotal;
          next.iva_monto = t.iva_monto;
          next.total = t.total;
          return next;
        });
        const totals = recalcAllTotals(nextItems);
        return { ...p, items: nextItems, ...totals };
      });
    },
    [recalcAllTotals]
  );

  const addRow = useCallback(() => {
    setForm((p) => {
      const nextItems = Array.isArray(p.items) ? p.items.slice() : [];
      nextItems.push({
        _tmpId: `it-${nextItems.length}-${Date.now()}`,
        id_detalle: NULL_OPTION,
        detalle_texto: "",
        cantidad: 1,
        precio: 0,
        iva_pct: 0,
        ...calcItemTotals(1, 0, 0),
      });
      const totals = recalcAllTotals(nextItems);
      return { ...p, items: nextItems, ...totals };
    });
  }, [recalcAllTotals]);

  const removeRow = useCallback(
    (tmpId) => {
      setForm((p) => {
        const nextItems = (p.items || []).filter((it) => it._tmpId !== tmpId);
        const safeNext = nextItems.length ? nextItems : [
          {
            _tmpId: `it-0-${Date.now()}`,
            id_detalle: NULL_OPTION,
            detalle_texto: "",
            cantidad: 1,
            precio: 0,
            iva_pct: 0,
            ...calcItemTotals(1, 0, 0),
          },
        ];
        const totals = recalcAllTotals(safeNext);
        return { ...p, items: safeNext, ...totals };
      });
    },
    [recalcAllTotals]
  );

  /* =========================
     Proveedor autocomplete
========================= */
  const filteredProveedores = useMemo(() => {
    const all = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
    const q = proveedorInput.trim().toLowerCase();
    if (!proveedorFocus || q.length < 1) return [];
    return all.filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
  }, [safeLists.proveedores, proveedorInput, proveedorFocus]);

  const handleProveedorInputChange = useCallback((e) => {
    const value = e.target.value;
    setProveedorInput(value);
    setForm((prev) => ({ ...prev, id_proveedor: NULL_OPTION }));
  }, []);

  const handleSelectProveedor = useCallback((prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    setProveedorInput(nombre);
    setForm((prev) => ({
      ...prev,
      id_proveedor: prov?.id != null ? String(prov.id) : NULL_OPTION,
    }));
    setProveedorFocus(false);
  }, []);

  /* =========================
     Detalle autocomplete (por fila)
========================= */
  const detalles = useMemo(() => (Array.isArray(safeLists.detalles) ? safeLists.detalles : []), [safeLists.detalles]);

  const filteredDetallesByItem = useCallback(
    (it) => {
      const q = String(it?.detalle_texto ?? "").trim().toLowerCase();
      if (!q || q.length < 1) return [];
      return detalles.filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q)).slice(0, 20);
    },
    [detalles]
  );

  const selectDetalleForItem = useCallback((tmpId, det) => {
    const nombre = String(det?.nombre ?? "").trim();
    updateItem(tmpId, { id_detalle: det?.id != null ? String(det.id) : NULL_OPTION, detalle_texto: nombre });
    setDetalleFocusId(null);
  }, [updateItem]);

  /* =========================
     Factura: picker + drag&drop
========================= */
  const acceptFile = useCallback((file) => {
    if (!file) return;

    const maxMB = 15; // si querés otro límite decime
    const maxBytes = maxMB * 1024 * 1024;

    const okType =
      file.type === "application/pdf" ||
      file.type.startsWith("image/") ||
      /\.pdf$/i.test(file.name);

    if (!okType) {
      showToast("advertencia", "Adjuntá un PDF o una imagen (JPG/PNG).", 3200);
      return;
    }
    if (file.size > maxBytes) {
      showToast("advertencia", `Archivo demasiado grande. Máx ${maxMB} MB.`, 3600);
      return;
    }

    setFacturaFile(file);
    showToast("exito", `Factura seleccionada: ${file.name}`, 2400);
  }, [showToast]);

  const onPickFile = useCallback(() => {
    if (saving) return;
    fileInputRef.current?.click();
  }, [saving]);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (saving) return;
      setIsDrag(false);
      const f = e.dataTransfer?.files?.[0];
      acceptFile(f);
    },
    [acceptFile, saving]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    setIsDrag(true);
  }, [saving]);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDrag(false);
  }, []);

  /* =========================
     API helper (solo si querés alta rápida)
========================= */
  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    try {
      return JSON.parse(text);
    } catch {
      const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
      throw new Error(`Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`);
    }
  }, []);

  const apiPostJson = useCallback(
    async (url, payload) => {
      const { token } = getAuthInfo();
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload ?? {}),
      });

      return await parseJsonOrThrow(res);
    },
    [parseJsonOrThrow]
  );

  /* =========================
     Alta rápida catálogo (proveedor/detalle/medio/etc.)
     - usa action=catalogo_crear (igual que tu base)
========================= */
  const CATALOGO_MAP = useMemo(
    () => ({
      id_clasificacion: { catalogo: "clasificaciones", label: "Clasificación", listKey: "clasificaciones" },
      id_cuenta_corriente: { catalogo: "cuentas_corrientes", label: "Cuenta corriente", listKey: "cuentasCorrientes" },
      id_tipo_movimiento: { catalogo: "tipos_movimiento", label: "Tipo de movimiento", listKey: "tiposMovimiento" },
      id_proveedor: { catalogo: "proveedores", label: "Proveedor", listKey: "proveedores" },
      id_detalle: { catalogo: "detalles", label: "Detalle", listKey: "detalles" },
      id_medio_pago: { catalogo: "medios_pago", label: "Medio de pago", listKey: "mediosPago" },
    }),
    []
  );

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

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error("El servidor no devolvió un ID válido del registro creado.");
      }

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[meta.listKey]) ? prev[meta.listKey].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) arr.push({ id: newId, nombre: newNombre });
        next[meta.listKey] = arr;
        return next;
      });

      if (addUI.field === "id_proveedor") {
        setProveedorInput(newNombre);
        setForm((p) => ({ ...p, id_proveedor: String(newId) }));
        setTimeout(() => proveedorInputRef.current?.focus(), 0);
      }

      if (addUI.field === "id_detalle" && addUI._tmpIdForItem) {
        // si venía desde una fila
        updateItem(addUI._tmpIdForItem, { id_detalle: String(newId), detalle_texto: newNombre });
      }

      setAddUI({ open: false, field: null, text: "", saving: false });
      showToast("exito", `${meta.label} creado: "${newNombre}"`, 2400);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando el registro.", 4200);
    }
  }, [API, CATALOGO_MAP, addUI, apiPostJson, showToast, updateItem]);

  /* =========================
     Validaciones compra
     - Proveedor obligatorio
     - tipo_movimiento fijo en SALIDA (si existe)
     - medio_pago solo si NO hay cuenta_corriente (Contado)
========================= */
  useEffect(() => {
    // si tiene cuenta corriente, limpiamos medio de pago (porque sería CC)
    const hasCC = String(form.id_cuenta_corriente || "").trim() && String(form.id_cuenta_corriente) !== NULL_OPTION;
    if (hasCC && form.id_medio_pago !== NULL_OPTION) {
      setForm((p) => ({ ...p, id_medio_pago: NULL_OPTION }));
    }
  }, [form.id_cuenta_corriente]); // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [saving, onClose]);

  const submit = async (e) => {
    e.preventDefault();

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear el registro (o cancelá) antes de guardar.", 3200);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando compra…", 12000);

    try {
      // fecha obligatoria
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) throw new Error("Fecha inválida.");

      // proveedor obligatorio (ID)
      const idProv = Number(String(form.id_proveedor || "").trim());
      if (!Number.isFinite(idProv) || idProv <= 0) {
        throw new Error("Proveedor obligatorio. Seleccionalo desde la lista (o crealo con +).");
      }

      // periodo auto si falta
      const perUI = normalizePeriodoToMMYYYY(form.periodo);
      const perAuto = periodoFromISODate(form.fecha);
      const finalPer = perUI || perAuto;

      // tipo_movimiento salida
      const salidaId = findSalidaTipoMovId(safeLists.tiposMovimiento);
      if (!salidaId) {
        // no bloqueamos, pero avisamos
        showToast("advertencia", 'No encontré "Salida" en tiposMovimiento. Se guardará con el tipo actual.', 3800);
      }

      // items: validación mínima
      const itemsClean = (form.items || [])
        .map((it) => {
          const cantidad = Math.max(0, safeNumber(it.cantidad));
          const precio = Math.max(0, safeNumber(it.precio));
          const iva_pct = Math.max(0, safeNumber(it.iva_pct));
          const t = calcItemTotals(cantidad, precio, iva_pct);

          const id_detalle = Number(String(it.id_detalle || "").trim());
          const detalle_texto = String(it.detalle_texto || "").trim();

          return {
            id_detalle: Number.isFinite(id_detalle) && id_detalle > 0 ? id_detalle : null,
            detalle_texto: detalle_texto || null, // por si no hay catálogo, guardás texto (si tu backend lo soporta)
            cantidad: Math.round(cantidad * 1000) / 1000,
            precio: Math.round(precio * 100) / 100,
            iva_pct: Math.round(iva_pct * 100) / 100,
            subtotal: t.subtotal,
            iva_monto: t.iva_monto,
            total: t.total,
          };
        })
        .filter((it) => it.cantidad > 0 || it.precio > 0 || it.detalle_texto || it.id_detalle != null);

      if (!itemsClean.length) throw new Error("Agregá al menos 1 ítem con cantidad/precio o detalle.");

      const totals = itemsClean.reduce(
        (acc, it) => {
          acc.subtotal += safeNumber(it.subtotal);
          acc.iva_monto += safeNumber(it.iva_monto);
          acc.total += safeNumber(it.total);
          return acc;
        },
        { subtotal: 0, iva_monto: 0, total: 0 }
      );

      const compra = {
        id_movimiento: form.id_movimiento,
        fecha: form.fecha,
        periodo: periodoMMYYYY_to_YYYYMM(finalPer || ""),

        id_clasificacion: (() => {
          const n = Number(String(form.id_clasificacion || "").trim());
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),

        id_proveedor: idProv,

        // CC
        id_cuenta_corriente: (() => {
          const n = Number(String(form.id_cuenta_corriente || "").trim());
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),

        // tipo_mov
        id_tipo_movimiento: (() => {
          const n = Number(String(salidaId || form.id_tipo_movimiento || "").trim());
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),

        // medio pago (solo contado)
        id_medio_pago: (() => {
          const hasCC = (() => {
            const n = Number(String(form.id_cuenta_corriente || "").trim());
            return Number.isFinite(n) && n > 0;
          })();
          if (hasCC) return null;
          const n = Number(String(form.id_medio_pago || "").trim());
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),

        subtotal: Math.round(totals.subtotal * 100) / 100,
        iva_monto: Math.round(totals.iva_monto * 100) / 100,
        monto_total: Math.round(totals.total * 100) / 100,
      };

      await onSaveCompra?.({ compra, items: itemsClean, facturaFile });

      showToast("exito", "Compra actualizada.", 2400);
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando compra.", 4200);
      setSaving(false);
    }
  };

  const miniOpen = addUI.open && (addUI.field === "id_proveedor" || addUI.field === "id_detalle");
  const miniTitle = addUI.field === "id_proveedor" ? "Nuevo proveedor" : "Nuevo detalle";

  const cancelMini = () => {
    // si estaba creando detalle para una fila, no hacemos nada más que cerrar
    closeAddMini();
  };

  /* =========================
     UI
========================= */
  if (!open) return null;

  const hasCC = (() => {
    const n = Number(String(form.id_cuenta_corriente || "").trim());
    return Number.isFinite(n) && n > 0;
  })();

  const existingFacturaUrl = (() => {
    if (!form.factura_path) return "";
    // si ya viene con http/https lo dejamos; si viene path, lo pegamos a BASE_URL
    const s = String(form.factura_path).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return `${BASE_URL}${s.startsWith("/") ? "" : "/"}${s}`;
  })();

  return createPortal(
    <div className="mi-modal__overlay" onMouseDown={cerrar}>
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 1180 }}
      >
        <div className="mi-modal__header mi-modal__header--car">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar compra</h2>
            <p className="mi-modal__subtitle">Compras = Salida + Proveedor obligatorio.</p>
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

        <form onSubmit={submit} className="mi-modal__content mi-modal__content--car" style={{ padding: 10 }}>
          <div className="mi-cr-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
            {/* Izquierda: Items + detalle */}
            <div className="mi-cr-table">
              <div className="mi-cr-table__head" style={{ gridTemplateColumns: "2.2fr .7fr .9fr .8fr .9fr .9fr .3fr" }}>
                <div className="mi-cr-col">DETALLE</div>
                <div className="mi-cr-col mi-cr-col--qty">CANT</div>
                <div className="mi-cr-col">PRECIO</div>
                <div className="mi-cr-col">IVA</div>
                <div className="mi-cr-col">SUBT</div>
                <div className="mi-cr-col">TOTAL</div>
              </div>

              <div className="mi-cr-table__rows">
                {(form.items || []).map((it) => {
                  const sug = detalleFocusId === it._tmpId ? filteredDetallesByItem(it) : [];
                  return (
                    <div key={it._tmpId} className="mi-cr-row mi-cr-row--car" style={{ gridTemplateColumns: "2.2fr .7fr .9fr .8fr .9fr .9fr .3fr" }}>
                      {/* detalle */}
                      <div className="mi-cr-col" style={{ position: "relative" }}>
                        <div className="fl-field">
                          <input
                            className="fl-input"
                            placeholder=" "
                            value={it.detalle_texto}
                            onChange={(e) => updateItem(it._tmpId, { detalle_texto: e.target.value, id_detalle: NULL_OPTION })}
                            onFocus={() => setDetalleFocusId(it._tmpId)}
                            onBlur={() => setTimeout(() => setDetalleFocusId(null), 120)}
                            disabled={saving || addUI.open}
                            autoComplete="off"
                          />
                          <label className="fl-label">Detalle</label>
                        </div>

                        {detalleFocusId === it._tmpId && sug.length > 0 && (
                          <ul className="mi-cr-suggest">
                            {sug.map((d) => (
                              <li
                                key={d.id}
                                className="mi-cr-suggest__item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  selectDetalleForItem(it._tmpId, d);
                                }}
                              >
                                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {d.nombre}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        <button
                          type="button"
                          className="mi-cr-link"
                          onClick={() => setAddUI({ open: true, field: "id_detalle", text: "", saving: false, _tmpIdForItem: it._tmpId })}
                          disabled={saving || addUI.saving}
                        >
                          + Agregar nuevo detalle
                        </button>
                      </div>

                      {/* cant */}
                      <div className="mi-cr-col mi-cr-col--qty">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={it.cantidad}
                          onChange={(e) => updateItem(it._tmpId, { cantidad: e.target.value === "" ? "" : Number(e.target.value) })}
                          disabled={saving}
                        />
                      </div>

                      {/* precio */}
                      <div className="mi-cr-col">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.precio}
                          onChange={(e) => updateItem(it._tmpId, { precio: e.target.value === "" ? "" : Number(e.target.value) })}
                          disabled={saving}
                        />
                      </div>

                      {/* iva */}
                      <div className="mi-cr-col">
                        <select
                          className="fl-input fl-select fl-select-iva--car fl-select-iva--compra"
                          value={String(it.iva_pct)}
                          onChange={(e) => updateItem(it._tmpId, { iva_pct: Number(e.target.value) })}
                          disabled={saving}
                        >
                          {IVA_OPTIONS.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* subt */}
                      <div className="mi-cr-col mi-cr-col--compraS">
                        {Number(it.subtotal || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                      </div>

                      {/* total */}
                      <div className="mi-cr-col mi-cr-col--compraS" >
                        {Number(it.total || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                      </div>

                      {/* del */}
                      <div className="mi-cr-col" style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          title="Eliminar fila"
                          onClick={() => removeRow(it._tmpId)}
                          disabled={saving}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mi-cr-table__foot">
                <button type="button" className="mi-cr-addrow" onClick={addRow} disabled={saving}>
                  Agregar fila
                </button>

                <div className="mi-cr-totals" style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                    <span>Subtotal</span>
                    <b>{Number(form.subtotal || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</b>
                  </div>
                  <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                    <span>IVA</span>
                    <b>{Number(form.iva_monto || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</b>
                  </div>
                  <div className="mi-cr-totalLine mi-cr-totalLine--total">
                    <span>Total</span>
                    <b>{Number(form.monto_total || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</b>
                  </div>
                </div>
              </div>
            </div>

            {/* Derecha: relaciones + factura + acciones */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Compra y pago</div>

                <div className="mi-cr-filters__dates">
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
              </div>

              <div className="mi-cr-filters__body">
                {/* Clasificación */}
                              <div className="fl-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(form.id_clasificacion)}
                    onChange={(e) => setForm((p) => ({ ...p, id_clasificacion: e.target.value }))}
                    disabled={saving}
                  >
                    <option value={NULL_OPTION}>-- Seleccionar clasificación --</option>
                    {(safeLists.clasificaciones || []).map((x) => (
                      <option key={x.id} value={String(x.id)}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Clasificación</label>
                </div>

                {/* Tipo movimiento fijo (Salida) */}
                <div className="fl-field">
                  <select className="fl-input fl-select" value={String(form.id_tipo_movimiento)} disabled>
                    <option value={String(form.id_tipo_movimiento || NULL_OPTION)}>Salida (fijo)</option>
                  </select>
                  <label className="fl-label">Tipo de movimiento</label>
                </div>

                {/* Cuenta corriente */}
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(form.id_cuenta_corriente)}
                    onChange={(e) => setForm((p) => ({ ...p, id_cuenta_corriente: e.target.value }))}
                    disabled={saving}
                  >
                    <option value={NULL_OPTION}>-- Contado (sin CC) --</option>
                    {(safeLists.cuentasCorrientes || []).map((x) => (
                      <option key={x.id} value={String(x.id)}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Cuenta corriente</label>
                </div>

                {/* Medio pago (solo contado) */}
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(form.id_medio_pago)}
                    onChange={(e) => setForm((p) => ({ ...p, id_medio_pago: e.target.value }))}
                    disabled={saving || hasCC}
                    title={hasCC ? "Con cuenta corriente, no aplica medio de pago." : ""}
                  >
                    <option value={NULL_OPTION}>-- Seleccionar medio de pago --</option>
                    {(safeLists.mediosPago || []).map((x) => (
                      <option key={x.id} value={String(x.id)}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Medio de pago</label>
                </div>

                {/* Proveedor (obligatorio) */}
                <div className="fl-field" style={{ position: "relative" }}>
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
                  <label className="fl-label">Proveedor (obligatorio)</label>

                  {proveedorFocus && filteredProveedores.length > 0 && (
                    <ul
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
                        maxHeight: 230,
                        overflowY: "auto",
                        borderRadius: 10,
                        border: "1px solid rgba(148, 163, 184, 0.5)",
                        background: "white",
                        boxShadow: "0 18px 45px rgba(15, 23, 42, 0.28)",
                        padding: 4,
                        zIndex: 80,
                        listStyle: "none",
                      }}
                    >
                      {filteredProveedores.map((p) => (
                        <li
                          key={p.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectProveedor(p);
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                            fontSize: 13,
                            display: "flex",
                            alignItems: "center",
                          }}
                          className="mi-autocomplete-item"
                        >
                          <span
                            style={{
                              flex: 1,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.nombre}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <button
                    type="button"
                    className="mi-cr-link"
                    onClick={() => setAddUI({ open: true, field: "id_proveedor", text: "", saving: false })}
                    disabled={saving || addUI.saving}
                  >
                    + Agregar nuevo proveedor
                  </button>
                </div>

                {/* Factura */}
                <div className="mi-file">
                  <div className="mi-file__row">
                    <div style={{ minWidth: 0 }}>
                      <div className="mi-file__title">Factura (PDF / imagen)</div>
                      <div className="mi-file__hint">Se adjunta y se guarda vinculada a la compra.</div>
                    </div>

                    <div className="mi-file__actions">
                      <button type="button" className="mi-filebtn mi-filebtn--primary" onClick={onPickFile} disabled={saving}>
                        Elegir archivo
                      </button>
                    </div>

                    <input
                      ref={fileInputRef}
                      className="mi-file__input"
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => acceptFile(e.target.files?.[0])}
                      disabled={saving}
                    />
                  </div>

                  <div
                    className={`mi-drop ${isDrag ? "is-drag" : ""}`}
                    onClick={onPickFile}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onPickFile();
                    }}
                  >
                    <div className="mi-drop__icon">⇪</div>
                    <div className="mi-drop__text">{isDrag ? "Soltá el archivo acá" : "Arrastrá y soltá la factura"}</div>
                    <div className="mi-drop__sub">o hacé click para seleccionar</div>
                  </div>

                  {/* Preview nuevo archivo */}
                  {facturaFile && (
                    <div className="mi-filemeta">
                      <div style={{ minWidth: 0 }}>
                        <div className="mi-filemeta__name" title={facturaFile.name}>
                          {facturaFile.name}
                        </div>
                        <div className="mi-filemeta__info">{bytesToHuman(facturaFile.size)}</div>
                      </div>

                      <button
                        type="button"
                        className="mi-filemeta__remove"
                        title="Quitar"
                        onClick={() => setFacturaFile(null)}
                        disabled={saving}
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Link a factura ya guardada */}
                  {!facturaFile && existingFacturaUrl && (
                    <div className="mi-filemeta">
                      <div style={{ minWidth: 0 }}>
                        <div className="mi-filemeta__name" title={form.factura_nombre || "Factura guardada"}>
                          {form.factura_nombre || "Factura guardada"}
                        </div>
                        <div className="mi-filemeta__info">
                          <a href={existingFacturaUrl} target="_blank" rel="noreferrer" style={{ color: "var(--mi-primary-600)", fontWeight: 600 }}>
                            Ver factura
                          </a>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="mi-filemeta__remove"
                        title="Quitar (solo en UI)"
                        onClick={() => {
                          // ojo: esto NO borra en backend, solo para que puedas reemplazarla
                          setForm((p) => ({ ...p, factura_path: "", factura_nombre: "" }));
                          showToast("info", "Factura marcada para reemplazar (subí una nueva).", 2600);
                        }}
                        disabled={saving}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
                                    <div className="mi-cr-filters__actions" style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <button type="submit" disabled={saving} className="mit-btn mit-btn--solid" style={{ width: "100%", height: 44 }}>
                    {saving ? "Guardando..." : "Guardar"}
                  </button>

                  <button type="button" onClick={cerrar} disabled={saving} className="mit-btn mit-btn--ghost" style={{ width: "100%", height: 44 }}>
                    Cancelar
                  </button>
                </div>    

              </div>
                              {/* Acciones */}

            </aside>
          </div>
        </form>

        <AddCatalogMiniModal
          open={miniOpen}
          title={miniTitle}
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={cancelMini}
          onSave={guardarNuevoCatalogo}
        />
      </div>
    </div>,
    document.body
  );
}
