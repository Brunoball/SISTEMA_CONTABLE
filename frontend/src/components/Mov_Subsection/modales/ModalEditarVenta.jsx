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
   Dark helper
========================= */
function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
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
   Build form desde row (venta)
========================= */
function buildFormFromRowVenta(row, listsMerged, periodoDefault, fixedLocal) {
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

  // ✅ IMPORTANTÍSIMO: si no encontramos fijos, NO pisamos lo que ya venía del row
  const idSalida = fixedLocal?.idSalida ?? NULL_OPTION;
  const idVenta = fixedLocal?.idVenta ?? NULL_OPTION;

  return {
    id_movimiento: safeNumber(r.id_movimiento) || null,
    fecha,
    periodo: pickPeriodo,

    id_clasificacion: nOrNull(r.id_clasificacion),
    id_cuenta_corriente: sOrNull(r.id_cuenta_corriente),
    id_medio_pago: nOrNull(r.id_medio_pago),

    // ✅ fijos SI existen; sino, usar lo que venía en el row
    id_tipo_movimiento: idSalida !== NULL_OPTION ? idSalida : nOrNull(r.id_tipo_movimiento),
    id_tipo_venta: idVenta !== NULL_OPTION ? idVenta : nOrNull(r.id_tipo_venta),

    id_cliente: sOrNull(r.id_cliente),
    id_proveedor: NULL_OPTION,
    id_detalle: sOrNull(r.id_detalle),

    // números editables
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
function hasIdInList(arr, id) {
  const sid = String(id ?? "").trim();
  if (!sid || sid === NULL_OPTION || sid === ADD_OPTION) return false;
  return (Array.isArray(arr) ? arr : []).some((x) => String(x?.id) === sid);
}

export default function ModalEditarVenta({
  open,
  lists,
  row,
  periodoDefault,
  onClose,
  onSave,
  onCatalogCreated, // (si lo usás en tu flujo, queda compatible)
  onToast,
  dark: darkProp,
}) {
  const API = `${BASE_URL}/api.php`;

  const [darkAuto, setDarkAuto] = useState(isTemaOscuro());
  useEffect(() => {
    const obs = new MutationObserver(() => setDarkAuto(isTemaOscuro()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

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
      idVenta: findIdByIncludes(merged.tiposVenta, "venta"),
      idConsumidorFinal: findIdByIncludes(merged.clientes, "consumidor final"),
    };
    const built = buildFormFromRowVenta(row, merged, periodoDefault, fixedLocal);

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
  const clienteInputRef = useRef(null);

  const [detalleInput, setDetalleInput] = useState(() => {
    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    return nameById(merged.detalles, form.id_detalle);
  });
  const [detalleFocus, setDetalleFocus] = useState(false);

  const closeBtnRef = useRef(null);
  const fechaRef = useRef(null);

  // abrir: reconstruir SIEMPRE con refs + merged actual (fix ids correctos)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (wasOpen) return;

    setSaving(false);

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(listsRef.current) };
    setLocalLists(merged);

    const fixedLocal = {
      idSalida: findIdByIncludes(merged.tiposMovimiento, "salida"),
      idVenta: findIdByIncludes(merged.tiposVenta, "venta"),
      idConsumidorFinal: findIdByIncludes(merged.clientes, "consumidor final"),
    };

    const built = buildFormFromRowVenta(rowRef.current, merged, periodoDefaultRef.current, fixedLocal);

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

  const onCantidadChange = useCallback((v) => recalcFromItem({ cantidad: v === "" ? "" : Number(v) }), [
    recalcFromItem,
  ]);
  const onPrecioChange = useCallback((v) => recalcFromItem({ precio: v === "" ? "" : Number(v) }), [
    recalcFromItem,
  ]);
  const onIvaPctChange = useCallback((v) => recalcFromItem({ iva_pct: v === "" ? "" : Number(v) }), [
    recalcFromItem,
  ]);

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

  const handleClienteInputChange = useCallback((e) => {
    const value = e.target.value;
    setClienteInput(value);
    // hasta que seleccione uno, dejamos null
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

  const filteredDetalles = useMemo(() => {
    const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
    const q = detalleInput.trim().toLowerCase();
    if (!detalleFocus || q.length < 1) return [];
    return all.filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
  }, [safeLists.detalles, detalleInput, detalleFocus]);

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

      id_clasificacion: toNullableId(form.id_clasificacion),

      // ✅ usar lo que está en el form (no null por default)
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

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) {
        throw new Error("Fecha inválida.");
      }

      const perUI = normalizePeriodoToMMYYYY(form.periodo);
      const perAuto = periodoFromISODate(form.fecha);
      const finalPer = perUI || perAuto;

      // ✅ Cliente obligatorio
      let finalIdCliente = form.id_cliente;

      if ((!finalIdCliente || finalIdCliente === NULL_OPTION) && clienteInput.trim()) {
        const foundId = findIdByExact(safeLists.clientes, clienteInput.trim());
        if (foundId !== NULL_OPTION) finalIdCliente = foundId;
      }

      if (!finalIdCliente || finalIdCliente === NULL_OPTION || finalIdCliente === ADD_OPTION) {
        throw new Error("En Ventas el Cliente es obligatorio (seleccioná uno).");
      }

      // ✅ Detalle obligatorio (según tu backend)
      let finalIdDetalle = form.id_detalle;
      if ((!finalIdDetalle || finalIdDetalle === NULL_OPTION) && detalleInput.trim()) {
        const foundId = findIdByExact(safeLists.detalles, detalleInput.trim());
        if (foundId !== NULL_OPTION) finalIdDetalle = foundId;
      }
      if (!finalIdDetalle || finalIdDetalle === NULL_OPTION || finalIdDetalle === ADD_OPTION) {
        throw new Error("En Ventas el Detalle es obligatorio (seleccioná uno).");
      }

      // ✅ Tipo venta obligatorio (según tu backend)
      if (!form.id_tipo_venta || String(form.id_tipo_venta) === NULL_OPTION) {
        throw new Error("En Ventas la Forma de venta (Tipo venta) es obligatoria.");
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

  const tipoVentaExists = hasIdInList(safeLists.tiposVenta, form.id_tipo_venta);
  const tipoMovExists = hasIdInList(safeLists.tiposMovimiento, form.id_tipo_movimiento);

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
            <p className="mi-modal__subtitle">Tipo movimiento: Salida · Cliente obligatorio</p>
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
              <div className="mi-em-panelHead">Datos de la venta</div>

              <div className="mi-em-panelBody">
                <div className="fl-grid">
                  <div className="mi-row3 fl-col-full">
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

                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.id_tipo_venta)}
                        disabled
                      >
                        {!tipoVentaExists && String(form.id_tipo_venta) !== NULL_OPTION && (
                          <option value={String(form.id_tipo_venta)}>Tipo venta actual</option>
                        )}

                        {(safeLists.tiposVenta || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}

                        {String(form.id_tipo_venta) === NULL_OPTION && (
                          <option value={NULL_OPTION}>Venta</option>
                        )}
                      </select>
                      <label className="fl-label">Tipo de venta (fijo)</label>
                    </div>

                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.id_tipo_movimiento)}
                        disabled
                      >
                        {!tipoMovExists && String(form.id_tipo_movimiento) !== NULL_OPTION && (
                          <option value={String(form.id_tipo_movimiento)}>Tipo mov. actual</option>
                        )}

                        {(safeLists.tiposMovimiento || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}

                        {String(form.id_tipo_movimiento) === NULL_OPTION && (
                          <option value={NULL_OPTION}>Salida</option>
                        )}
                      </select>
                      <label className="fl-label">Tipo de movimiento (fijo)</label>
                    </div>
                  </div>

                  <div className="mi-row2 fl-col-full">
                    <div className="fl-field mi-autocomplete" style={{ position: "relative" }}>
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={detalleInput}
                        onChange={handleDetalleInputChange}
                        onFocus={() => setDetalleFocus(true)}
                        onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
                        disabled={saving}
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
                    </div>

                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(form.id_cuenta_corriente)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, id_cuenta_corriente: e.target.value }))
                        }
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>-- Sin cuenta corriente --</option>
                        {(safeLists.cuentasCorrientes || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Cuenta corriente</label>
                    </div>
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
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(form.id_medio_pago)}
                    onChange={(e) => setForm((p) => ({ ...p, id_medio_pago: e.target.value }))}
                    disabled={saving}
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

                <div className="fl-field mi-autocomplete" style={{ position: "relative" }}>
                  <input
                    ref={clienteInputRef}
                    className="fl-input"
                    placeholder=" "
                    value={clienteInput}
                    onChange={handleClienteInputChange}
                    onFocus={() => setClienteFocus(true)}
                    onBlur={() => setTimeout(() => setClienteFocus(false), 120)}
                    disabled={saving}
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
                </div>

                <div className="mi-em-actions">
                  <button
                    type="submit"
                    disabled={saving}
                    className="mit-btn mit-btn--solid mit-btn--block"
                  >
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
      </div>
    </div>,
    document.body
  );
}
