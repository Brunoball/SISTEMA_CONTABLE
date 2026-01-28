// src/components/Movimientos/modales/ModalEditarMovimiento.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./ModalEditarMovimiento.css"; // o el css que ya uses
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

/* =========================
   Safe lists + normalización
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
  tiendas: [],
  tiposMovimiento: [],
  comprobantes: [],
  detalles: [],
  productos: [],
  formasTransaccion: [],
  entidades: [],
  clientes: [],
  proveedores: [],
};

function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};

  const tipos =
    Array.isArray(l.tiposMovimiento) && l.tiposMovimiento.length
      ? l.tiposMovimiento
      : Array.isArray(l.tipos_movimiento)
      ? l.tipos_movimiento
      : [];

  const formas =
    Array.isArray(l.formasTransaccion) && l.formasTransaccion.length
      ? l.formasTransaccion
      : Array.isArray(l.formas_transaccion)
      ? l.formas_transaccion
      : [];

  return {
    periodos: Array.isArray(l.periodos) ? l.periodos : [],
    clasificaciones: Array.isArray(l.clasificaciones) ? l.clasificaciones : [],
    tiendas: Array.isArray(l.tiendas) ? l.tiendas : [],
    tiposMovimiento: Array.isArray(tipos) ? tipos : [],
    comprobantes: Array.isArray(l.comprobantes) ? l.comprobantes : [],
    detalles: Array.isArray(l.detalles) ? l.detalles : [],
    productos: Array.isArray(l.productos) ? l.productos : [],
    formasTransaccion: Array.isArray(formas) ? formas : [],
    entidades: Array.isArray(l.entidades) ? l.entidades : [],
    clientes: Array.isArray(l.clientes) ? l.clientes : [],
    proveedores: Array.isArray(l.proveedores) ? l.proveedores : [],
  };
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

function firstId(arr) {
  return arr?.[0]?.id != null ? Number(arr[0].id) : 0;
}

/* =========================
   ✅ Período MM-YYYY helpers
========================= */
function normalizePeriodoToMMYYYY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  let m = "";
  let y = "";

  // YYYY-MM o YYYY/MM
  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    y = parts[0];
    m = parts[1];
  }
  // MM-YYYY o MM/YYYY
  else if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const parts = s.split(/[-/]/);
    m = parts[0];
    y = parts[1];
  }
  // YYYYMM (o MMYYYY, intento adivinar)
  else if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      y = s.slice(0, 4);
      m = s.slice(4);
    } else {
      m = s.slice(0, 2);
      y = s.slice(2);
    }
  } else {
    return s; // fallback
  }

  const mm = String(Number(m)).padStart(2, "0");
  const yyyy = String(y);
  return `${mm}-${yyyy}`;
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
   Catálogo por selector
========================= */
const CATALOGO_MAP = {
  id_clasificacion: { catalogo: "clasificaciones", label: "Clasificación" },
  id_tienda: { catalogo: "tiendas", label: "Tienda" },
  id_tipo_movimiento: { catalogo: "tipos_movimiento", label: "Tipo de movimiento" },
  id_cliente: { catalogo: "clientes", label: "Cliente" },
  id_proveedor: { catalogo: "proveedores", label: "Proveedor" },
  id_comprobante: { catalogo: "comprobantes", label: "Comprobante" },
  id_detalle: { catalogo: "detalles", label: "Detalle" },
  id_producto: { catalogo: "productos", label: "Producto" },
  id_forma_transaccion: { catalogo: "formas_transaccion", label: "Forma de transacción" },
  id_entidad: { catalogo: "entidades", label: "Entidad" },
};

const LISTKEY_BY_CATALOGO = {
  clasificaciones: "clasificaciones",
  tiendas: "tiendas",
  tipos_movimiento: "tiposMovimiento",
  clientes: "clientes",
  proveedores: "proveedores",
  comprobantes: "comprobantes",
  detalles: "detalles",
  productos: "productos",
  formas_transaccion: "formasTransaccion",
  entidades: "entidades",
};

/* =========================
   Build form desde row
========================= */
function buildFormFromRow(row, lists, periodoDefault) {
  const safeLists = normalizeIncomingLists(lists);
  const r = row || {};

  // ✅ siempre MM-YYYY
  const pickPeriodo = normalizePeriodoToMMYYYY(
    r.periodo || periodoDefault || safeLists.periodos?.[0] || ""
  );

  const nOr0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const sOrNull = (v) => (v == null || v === "" ? NULL_OPTION : String(v));

  return {
    id_movimiento: nOr0(r.id_movimiento) || null,
    fecha: String(r.fecha || "").slice(0, 10) || "",
    periodo: pickPeriodo,

    id_clasificacion: nOr0(r.id_clasificacion) || firstId(safeLists.clasificaciones),
    id_tienda: nOr0(r.id_tienda) || firstId(safeLists.tiendas),
    id_tipo_movimiento: nOr0(r.id_tipo_movimiento) || firstId(safeLists.tiposMovimiento),

    id_cliente: sOrNull(r.id_cliente),
    id_proveedor: sOrNull(r.id_proveedor),

    id_comprobante: sOrNull(r.id_comprobante),
    id_detalle: sOrNull(r.id_detalle),
    id_producto: sOrNull(r.id_producto),

    mueve_stock: r.mueve_stock == null ? true : !!Number(r.mueve_stock),
    id_tipo_movimiento_stock: nOr0(r.id_tipo_movimiento_stock) || firstId(safeLists.tiposMovimiento),

    cant_unidad: r.cant_unidad == null ? 1 : nOr0(r.cant_unidad),
    precio_unitario_costos: r.precio_unitario_costos == null ? 0 : Number(r.precio_unitario_costos),
    precio_unit_venta: r.precio_unit_venta == null ? 0 : Number(r.precio_unit_venta),

    subtotal: Number(r.subtotal || 0),
    iva: Number(r.iva || 0),
    monto_total: Number(r.monto_total || 0),

    id_forma_transaccion: nOr0(r.id_forma_transaccion) || firstId(safeLists.formasTransaccion),
    id_entidad: sOrNull(r.id_entidad),
  };
}

export default function ModalEditarMovimiento({
  open,
  lists,
  row,
  periodoDefault,
  onClose,
  onSave,
  onCatalogCreated,
  onToast, // ✅ toast global desde Movimientos
}) {
  const API = `${BASE_URL}/api.php`;

  // ✅ helper toast (no renderiza acá)
  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // ✅ Copia local para que el select muestre al instante el item creado
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

  // UI “Agregar…” inline
  const [addUI, setAddUI] = useState({
    field: null,
    text: "",
    saving: false,
  });

  const closeBtnRef = useRef(null);

  // ✅ Date picker: abrir con click en todo el input (sin readOnly para evitar "immutable controls")
  const fechaRef = useRef(null);

  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el) return;
    if (saving || el.disabled) return;

    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
      } else {
        el.focus();
      }
    } catch {
      el.focus();
    }
  }, [saving]);

  useEffect(() => {
    if (!open) return;

    setSaving(false);
    setAddUI({ field: null, text: "", saving: false });

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    setLocalLists(merged);
    setForm(buildFormFromRow(row, merged, periodoDefault));

    setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, lists, row, periodoDefault, onClose]);

  /* =========================
     ✅ Cálculo:
     SUBTOTAL = (CANT*PUC) + (CANT*PUV)
     IVA = SUBTOTAL*0.21
     TOTAL = SUBTOTAL + IVA
  ========================= */
  useEffect(() => {
    if (!open) return;

    const cant = safeNumber(form.cant_unidad);
    const puc = safeNumber(form.precio_unitario_costos);
    const puv = safeNumber(form.precio_unit_venta);

    const sub = Math.max(0, Math.round((cant * puc + cant * puv) * 100) / 100);
    const iva = Math.round(sub * 0.21 * 100) / 100;
    const total = Math.round((sub + iva) * 100) / 100;

    setForm((prev) => ({ ...prev, subtotal: sub, iva, monto_total: total }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cant_unidad, form.precio_unitario_costos, form.precio_unit_venta, open]);

  const onChange = useCallback((k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  // ✅ período: fuerza formato MM-YYYY mientras tipeás
  const onPeriodoChange = useCallback((raw) => {
    const digits = String(raw || "").replace(/\D/g, "").slice(0, 6); // MMYYYY
    let next = "";

    if (digits.length <= 2) next = digits;
    else next = `${digits.slice(0, 2)}-${digits.slice(2)}`;

    if (digits.length === 6) next = normalizePeriodoToMMYYYY(next);

    setForm((p) => ({ ...p, periodo: next }));
  }, []);

  /* =========================
     API helper
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
     Guardar nuevo registro del catálogo (y actualizar TODO)
  ========================= */
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

      const listKey = LISTKEY_BY_CATALOGO[meta.catalogo];
      if (!listKey) throw new Error("Catálogo desconocido para actualizar listas.");

      // ✅ 1) Actualiza el modal al instante
      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next[listKey] = arr;
        return next;
      });

      // ✅ 2) Selecciona el nuevo ID en el select
      setForm((prev) => ({
        ...prev,
        [addUI.field]:
          addUI.field === "id_cliente" ||
          addUI.field === "id_proveedor" ||
          addUI.field === "id_comprobante" ||
          addUI.field === "id_detalle" ||
          addUI.field === "id_producto" ||
          addUI.field === "id_entidad"
            ? String(newId)
            : Number(newId),
      }));

      // ✅ 3) Actualiza también el padre (Movimientos)
      try {
        onCatalogCreated?.(meta.catalogo, { id: newId, nombre: newNombre });
      } catch {
        // no rompe el flujo
      }

      // ✅ 4) Cierra UI “Agregar…”
      setAddUI({ field: null, text: "", saving: false });

      showToast("exito", `${meta.label} creado: "${newNombre}"`, 2600);
    } catch (e) {
      const msg = e?.message || "Error creando el registro.";
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", msg, 4200);
    }
  }, [API, addUI, apiPostJson, onCatalogCreated, showToast]);

  const cerrar = () => {
    if (saving) return;
    onClose?.();
  };

  /* =========================
     Payload final (EDIT)
  ========================= */
  const payload = useMemo(() => {
    const isAdd = (v) => v === ADD_OPTION;

    return {
      id_movimiento: form.id_movimiento,

      fecha: form.fecha,
      // ✅ mandamos el valor tal como se ve (MM-YYYY)
      // si tu backend espera YYYY-MM avisame y te lo convierto antes de enviar
      periodo: normalizePeriodoToMMYYYY(form.periodo),

      id_clasificacion: isAdd(form.id_clasificacion) ? null : Number(form.id_clasificacion),
      id_tienda: isAdd(form.id_tienda) ? null : Number(form.id_tienda),
      id_tipo_movimiento: isAdd(form.id_tipo_movimiento) ? null : Number(form.id_tipo_movimiento),

      id_cliente: form.id_cliente === NULL_OPTION || isAdd(form.id_cliente) ? null : Number(form.id_cliente),
      id_proveedor: form.id_proveedor === NULL_OPTION || isAdd(form.id_proveedor) ? null : Number(form.id_proveedor),

      id_comprobante:
        form.id_comprobante === NULL_OPTION || isAdd(form.id_comprobante) ? null : Number(form.id_comprobante),
      id_detalle: form.id_detalle === NULL_OPTION || isAdd(form.id_detalle) ? null : Number(form.id_detalle),
      id_producto: form.id_producto === NULL_OPTION || isAdd(form.id_producto) ? null : Number(form.id_producto),

      mueve_stock: !!form.mueve_stock,
      id_tipo_movimiento_stock: form.mueve_stock ? Number(form.id_tipo_movimiento_stock) : null,

      cant_unidad: form.cant_unidad === "" ? null : Number(form.cant_unidad),
      precio_unitario_costos: form.precio_unitario_costos === "" ? null : Number(form.precio_unitario_costos),
      precio_unit_venta: form.precio_unit_venta === "" ? null : Number(form.precio_unit_venta),

      subtotal: Number(form.subtotal || 0),
      iva: Number(form.iva || 0),
      monto_total: Number(form.monto_total || 0),

      id_forma_transaccion: isAdd(form.id_forma_transaccion) ? null : Number(form.id_forma_transaccion),
      id_entidad: form.id_entidad === NULL_OPTION || isAdd(form.id_entidad) ? null : Number(form.id_entidad),
    };
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // ✅ Bloqueo si dejó algún select en “Agregar…”
      const bloqueantes = ["id_clasificacion", "id_tienda", "id_tipo_movimiento", "id_forma_transaccion"];
      for (const f of bloqueantes) {
        if (form[f] === ADD_OPTION) {
          throw new Error(`Tenés "${CATALOGO_MAP[f]?.label || f}" en “Agregar…”. Guardalo primero.`);
        }
      }

      const opc = ["id_cliente", "id_proveedor", "id_comprobante", "id_detalle", "id_producto", "id_entidad"];
      for (const f of opc) {
        if (form[f] === ADD_OPTION) {
          throw new Error(`Tenés "${CATALOGO_MAP[f]?.label || f}" en “Agregar…”. Guardalo o elegí otra opción.`);
        }
      }

      // ✅ valida periodo simple (MM-YYYY)
      const per = normalizePeriodoToMMYYYY(form.periodo);
      if (per && !/^\d{2}-\d{4}$/.test(per)) {
        throw new Error('Período inválido. Usá formato "MM-YYYY".');
      }

      await onSave?.(payload);
    } catch (e2) {
      showToast("error", e2?.message || "Error guardando movimiento.", 4200);
      setSaving(false);
    }
  };

  /* =========================
     Helper UI: elegir “Agregar…”
  ========================= */
  const onSelectWithAdd = useCallback(
    (field, rawValue, castToNumber) => {
      if (rawValue === ADD_OPTION) {
        setForm((p) => ({ ...p, [field]: ADD_OPTION }));
        setAddUI({ field, text: "", saving: false });
        return;
      }

      if (addUI.field === field) setAddUI({ field: null, text: "", saving: false });

      const v = castToNumber ? Number(rawValue) : rawValue;
      setForm((p) => ({ ...p, [field]: v }));
    },
    [addUI.field]
  );

  const renderAddInline = (field) => {
    if (addUI.field !== field) return null;

    const label = CATALOGO_MAP[field]?.label || "Registro";

    return (
      <div style={{ marginTop: 10 }}>
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

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button
            type="button"
            className="mit-btn mit-btn--ghost"
            onClick={() => {
              setAddUI({ field: null, text: "", saving: false });

              setForm((p) => {
                const copy = { ...p };

                if (
                  field === "id_cliente" ||
                  field === "id_proveedor" ||
                  field === "id_comprobante" ||
                  field === "id_detalle" ||
                  field === "id_producto" ||
                  field === "id_entidad"
                ) {
                  copy[field] = NULL_OPTION;
                  return copy;
                }

                const mapKey = {
                  id_clasificacion: "clasificaciones",
                  id_tienda: "tiendas",
                  id_tipo_movimiento: "tiposMovimiento",
                  id_forma_transaccion: "formasTransaccion",
                }[field];

                const first = mapKey ? firstId(safeLists[mapKey] || []) : 0;
                copy[field] = first || 0;
                return copy;
              });
            }}
            disabled={addUI.saving}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="mit-btn mit-btn--solid"
            onClick={guardarNuevoCatalogo}
            disabled={addUI.saving}
          >
            {addUI.saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    );
  };

  if (!open) return null;

  /* =========================
     UI (igual que tu modal, con toasts)
     Nota: acá no renderizamos Toast.
  ========================= */
  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar movimiento</h2>
            <p className="mi-modal__subtitle">Modificá los campos y guardá.</p>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            disabled={saving}
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form className="mit-modal__body" onSubmit={submit}>
          <div className="mi-tabpanel is-active">
            <div className="mi-grid">
              {/* Datos generales */}
              <article className="mi-card">
                <h3 className="mi-card__title">Datos generales</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <input
                      ref={fechaRef}
                      className="fl-input"
                      type="date"
                      placeholder=" "
                      value={form.fecha}
                      onChange={(e) => onChange("fecha", e.target.value)}
                      disabled={saving}
                      // ✅ abrir picker con click en todo el input
                      onClick={openDatePicker}
                      onFocus={openDatePicker}
                      // ✅ bloquear tipeo manual
                      onKeyDown={(e) => {
                        if (e.key === "Tab" || e.key === "Shift") return;
                        e.preventDefault();
                      }}
                      onPaste={(e) => e.preventDefault()}
                    />
                    <label className="fl-label">Fecha</label>
                  </div>

                  {/* ✅ Período ahora siempre MM-YYYY */}
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder="MM-YYYY"
                      inputMode="numeric"
                      value={form.periodo}
                      onChange={(e) => onPeriodoChange(e.target.value)}
                      disabled={saving}
                    />
<label className="fl-label">Período (MM-YYYY)</label>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_clasificacion)}
                      onChange={(e) => onSelectWithAdd("id_clasificacion", e.target.value, true)}
                      disabled={saving}
                    >
                      {(safeLists.clasificaciones || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Clasificación</label>
                    {renderAddInline("id_clasificacion")}
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_tienda)}
                      onChange={(e) => onSelectWithAdd("id_tienda", e.target.value, true)}
                      disabled={saving}
                    >
                      {(safeLists.tiendas || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Tienda</label>
                    {renderAddInline("id_tienda")}
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_tipo_movimiento)}
                      onChange={(e) => onSelectWithAdd("id_tipo_movimiento", e.target.value, true)}
                      disabled={saving}
                    >
                      {(safeLists.tiposMovimiento || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Tipo de movimiento</label>
                    {renderAddInline("id_tipo_movimiento")}
                  </div>
                </div>
              </article>

              {/* Relaciones */}
              <article className="mi-card">
                <h3 className="mi-card__title">Relaciones</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.id_cliente}
                      onChange={(e) => onSelectWithAdd("id_cliente", e.target.value, false)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Sin cliente</option>
                      {(safeLists.clientes || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Cliente</label>
                    {renderAddInline("id_cliente")}
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.id_proveedor}
                      onChange={(e) => onSelectWithAdd("id_proveedor", e.target.value, false)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Sin proveedor</option>
                      {(safeLists.proveedores || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Proveedor</label>
                    {renderAddInline("id_proveedor")}
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.id_comprobante === NULL_OPTION ? "" : String(form.id_comprobante)}
                      onChange={(e) =>
                        onSelectWithAdd(
                          "id_comprobante",
                          e.target.value === "" ? NULL_OPTION : e.target.value,
                          e.target.value !== "" && e.target.value !== ADD_OPTION
                        )
                      }
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Sin comprobante</option>
                      {(safeLists.comprobantes || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Comprobante</label>
                    {renderAddInline("id_comprobante")}
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.id_detalle === NULL_OPTION ? "" : String(form.id_detalle)}
                      onChange={(e) =>
                        onSelectWithAdd(
                          "id_detalle",
                          e.target.value === "" ? NULL_OPTION : e.target.value,
                          e.target.value !== "" && e.target.value !== ADD_OPTION
                        )
                      }
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Sin detalle</option>
                      {(safeLists.detalles || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Detalle</label>
                    {renderAddInline("id_detalle")}
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={form.id_producto === NULL_OPTION ? "" : String(form.id_producto)}
                      onChange={(e) =>
                        onSelectWithAdd(
                          "id_producto",
                          e.target.value === "" ? NULL_OPTION : e.target.value,
                          e.target.value !== "" && e.target.value !== ADD_OPTION
                        )
                      }
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Sin producto</option>
                      {(safeLists.productos || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Producto</label>
                    {renderAddInline("id_producto")}
                  </div>
                </div>
              </article>

              {/* Stock */}
              <article className="mi-card">
                <h3 className="mi-card__title">Stock</h3>

                <div className="fl-grid">
                  <div className="fl-field fl-col-full">
                    <label className="mit-switch">
                      <input
                        type="checkbox"
                        checked={!!form.mueve_stock}
                        onChange={(e) => onChange("mueve_stock", e.target.checked)}
                        disabled={saving}
                      />
                      <span className="mit-switch__track" />
                      <span className="mit-switch__text">
                        {form.mueve_stock ? "Mueve stock" : "No mueve stock"}
                      </span>
                    </label>
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_tipo_movimiento_stock)}
                      disabled={!form.mueve_stock || saving}
                      onChange={(e) => onChange("id_tipo_movimiento_stock", Number(e.target.value))}
                    >
                      {(safeLists.tiposMovimiento || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Tipo mov. stock</label>
                  </div>
                </div>
              </article>

              {/* Importes */}
              <article className="mi-card">
                <h3 className="mi-card__title">Importes</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      type="number"
                      min="0"
                      placeholder=" "
                      value={form.cant_unidad}
                      onChange={(e) => onChange("cant_unidad", e.target.value === "" ? "" : Number(e.target.value))}
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
                      value={form.precio_unitario_costos}
                      onChange={(e) =>
                        onChange("precio_unitario_costos", e.target.value === "" ? "" : Number(e.target.value))
                      }
                      disabled={saving}
                    />
                    <label className="fl-label">Precio unit. costo</label>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder=" "
                      value={form.precio_unit_venta}
                      onChange={(e) => onChange("precio_unit_venta", e.target.value === "" ? "" : Number(e.target.value))}
                      disabled={saving}
                    />
                    <label className="fl-label">Precio unit. venta</label>
                  </div>

                  <div className="fl-field">
                    <input className="fl-input" placeholder=" " value={moneyARS(form.iva)} disabled />
                    <label className="fl-label">IVA (auto 21%)</label>
                  </div>

                  <div className="fl-field">
                    <input className="fl-input" placeholder=" " value={moneyARS(form.subtotal)} disabled />
                    <label className="fl-label">Subtotal</label>
                  </div>

                  <div className="fl-field">
                    <input className="fl-input" placeholder=" " value={moneyARS(form.monto_total)} disabled />
                    <label className="fl-label">Monto total</label>
                  </div>
                </div>
              </article>

              {/* Pago / Entidad */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Pago / Entidad</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_forma_transaccion)}
                      onChange={(e) => onSelectWithAdd("id_forma_transaccion", e.target.value, true)}
                      disabled={saving}
                    >
                      {(safeLists.formasTransaccion || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Forma de transacción</label>
                    {renderAddInline("id_forma_transaccion")}
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.id_entidad === NULL_OPTION ? "" : String(form.id_entidad)}
                      onChange={(e) =>
                        onSelectWithAdd(
                          "id_entidad",
                          e.target.value === "" ? NULL_OPTION : e.target.value,
                          e.target.value !== "" && e.target.value !== ADD_OPTION
                        )
                      }
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Sin entidad</option>
                      {(safeLists.entidades || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Entidad</label>
                    {renderAddInline("id_entidad")}
                  </div>
                </div>
              </article>
            </div>
          </div>

          {/* Footer */}
          <div className="mit-actions">
            <div className="mit-help">{saving ? "Guardando…" : " "}</div>

            <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar} disabled={saving}>
              Cancelar
            </button>

            <button type="submit" className="mit-btn mit-btn--solid" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
