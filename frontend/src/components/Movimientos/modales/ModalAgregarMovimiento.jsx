// src/components/Movimientos/modales/ModalAgregarMovimiento.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./ModalEditarMovimiento.css"; // Reutiliza estética
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

/* =========================
   Safe lists + normalización (adaptado a NUEVA tabla)
   ✅ Solo usamos:
   - periodos
   - clasificaciones
   - tiposVenta
   - cuentasCorrientes
   - tiposMovimiento
   - clientes
   - proveedores
   - detalles
   - mediosPago
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
  tiposVenta: [],
  cuentasCorrientes: [],
  tiposMovimiento: [],
  clientes: [],
  proveedores: [],
  detalles: [],
  mediosPago: [],
};

function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};
  const src = l.listas && typeof l.listas === "object" ? l.listas : l;

  // ✅ soporta variantes de keys del backend
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
    proveedores: Array.isArray(src.proveedores) ? src.proveedores : [],
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    mediosPago: Array.isArray(medios) ? medios : [],
  };
}

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

// ✅ NUEVO: derivar período desde una fecha ISO (YYYY-MM-DD) => MM-YYYY
function periodoFromISODate(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}-${y}`;
}

function buildEmptyForm(lists, periodoDefault) {
  const safeLists = normalizeIncomingLists(lists);

  const fecha = todayISO();
  const per =
    normalizePeriodoToMMYYYY(periodoDefault || "") ||
    periodoFromISODate(fecha); // ✅ si no hay default, lo toma de la fecha

  return {
    id_movimiento: null,
    fecha,

    // ✅ siempre MM-YYYY
    periodo: per,

    // ✅ campos NUEVA TABLA - TODOS vacíos por defecto
    id_clasificacion: NULL_OPTION,
    id_tipo_venta: NULL_OPTION,
    id_cuenta_corriente: NULL_OPTION,
    id_tipo_movimiento: NULL_OPTION,

    id_cliente: NULL_OPTION,
    id_proveedor: NULL_OPTION,
    id_detalle: NULL_OPTION,

    id_medio_pago: NULL_OPTION,

    // ✅ único importe que queda en tabla
    monto_total: 0,
  };
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
   Catálogo por selector (adaptado)
========================= */
const CATALOGO_MAP = {
  id_clasificacion: { catalogo: "clasificaciones", label: "Clasificación" },
  id_tipo_venta: { catalogo: "tipos_venta", label: "Tipo de venta" },
  id_cuenta_corriente: { catalogo: "cuentas_corrientes", label: "Cuenta corriente" },
  id_tipo_movimiento: { catalogo: "tipos_movimiento", label: "Tipo de movimiento" },
  id_cliente: { catalogo: "clientes", label: "Cliente" },
  id_proveedor: { catalogo: "proveedores", label: "Proveedor" },
  id_detalle: { catalogo: "detalles", label: "Detalle" },
  id_medio_pago: { catalogo: "medios_pago", label: "Medio de pago" },
};

// catálogo -> key lista local
const LISTKEY_BY_CATALOGO = {
  clasificaciones: "clasificaciones",
  tipos_venta: "tiposVenta",
  cuentas_corrientes: "cuentasCorrientes",
  tipos_movimiento: "tiposMovimiento",
  clientes: "clientes",
  proveedores: "proveedores",
  detalles: "detalles",
  medios_pago: "mediosPago",
};

export default function ModalAgregarMovimiento({
  open,
  lists,
  periodoDefault,
  onClose,
  onSave,
  onCatalogCreated, // ✅ actualiza padre (Movimientos)
  onToast, // ✅ Toast global (vive en Movimientos)
}) {
  const API = `${BASE_URL}/api.php`;

  // ✅ helper toast (no se renderiza acá, se manda al padre)
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
    buildEmptyForm({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) }, periodoDefault)
  );

  // UI "Agregar…" inline
  const [addUI, setAddUI] = useState({
    field: null,
    text: "",
    saving: false,
  });

  // ✅ NUEVO: Autocomplete de clientes
  const [clienteInput, setClienteInput] = useState("");
  const [clienteFocus, setClienteFocus] = useState(false);
  const clienteInputRef = useRef(null);

  const closeBtnRef = useRef(null);

  // ✅ Date picker: abrir con click en todo el input
  const fechaRef = useRef(null);

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

  useEffect(() => {
    if (!open) return;

    setSaving(false);
    setAddUI({ field: null, text: "", saving: false });

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(lists) };
    setLocalLists(merged);

    // ✅ al abrir: si no viene periodoDefault, el período queda según fecha de hoy
    setForm(buildEmptyForm(merged, periodoDefault));

    // reset autocomplete cliente
    setClienteInput("");
    setClienteFocus(false);

    setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, lists, periodoDefault, onClose]);

  const onChange = useCallback((k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  // ✅ NUEVO: cuando cambia la FECHA, el PERÍODO se autocompleta con MES-AÑO (MM-YYYY)
  const onFechaChange = useCallback((rawISO) => {
    const iso = String(rawISO || "").trim();
    const perAuto = periodoFromISODate(iso);

    setForm((prev) => ({
      ...prev,
      fecha: iso,
      // ✅ siempre se recalcula desde la fecha (lo que pediste)
      periodo: perAuto || prev.periodo,
    }));
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

      // ✅ 2) Selecciona el nuevo ID en el select / campo
      setForm((prev) => ({
        ...prev,
        [addUI.field]:
          addUI.field === "id_cuenta_corriente" ||
          addUI.field === "id_cliente" ||
          addUI.field === "id_proveedor" ||
          addUI.field === "id_detalle"
            ? String(newId)
            : Number(newId),
      }));

      // Si es cliente, también actualizamos el texto del input
      if (addUI.field === "id_cliente") {
        setClienteInput(newNombre);
      }

      // ✅ 3) Actualiza también el padre (Movimientos)
      try {
        onCatalogCreated?.(meta.catalogo, { id: newId, nombre: newNombre });
      } catch {
        // no rompe el flujo
      }

      // ✅ 4) Cierra UI "Agregar…"
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
     Autocomplete de CLIENTES
  ========================= */
  const handleClienteInputChange = useCallback((e) => {
    const value = e.target.value;
    setClienteInput(value);
    // al tipear, limpiamos el ID hasta que elija una sugerencia
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

  const startAddCliente = useCallback(() => {
    setClienteFocus(false);
    setAddUI({ field: "id_cliente", text: "", saving: false });
    setForm((prev) => ({ ...prev, id_cliente: ADD_OPTION }));
  }, []);

  const filteredClientes = useMemo(() => {
    const all = Array.isArray(safeLists.clientes) ? safeLists.clientes : [];
    const q = clienteInput.trim().toLowerCase();

    // No mostrar todo el universo de clientes: solo cuando escribe algo
    if (!clienteFocus || q.length < 1) return [];

    return all
      .filter((c) => String(c?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25); // límite razonable
  }, [safeLists.clientes, clienteInput, clienteFocus]);

  /* =========================
     Payload final (solo campos de NUEVA TABLA)
  ========================= */
  const payload = useMemo(() => {
    const isAdd = (v) => v === ADD_OPTION;

    const toNullableId = (v) => {
      if (v === NULL_OPTION || v === "" || v == null) return null;
      if (isAdd(v)) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    const toRequiredId = (v) => {
      if (isAdd(v)) return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };

    return {
      fecha: form.fecha,
      periodo: normalizePeriodoToMMYYYY(form.periodo),

      id_clasificacion: toRequiredId(form.id_clasificacion),
      id_tipo_venta: toRequiredId(form.id_tipo_venta),
      id_cuenta_corriente: toNullableId(form.id_cuenta_corriente),
      id_tipo_movimiento: toRequiredId(form.id_tipo_movimiento),

      id_cliente: toNullableId(form.id_cliente),
      id_proveedor: toNullableId(form.id_proveedor),
      id_detalle: toNullableId(form.id_detalle),

      monto_total: Math.max(0, Math.round(safeNumber(form.monto_total) * 100) / 100),

      id_medio_pago: toRequiredId(form.id_medio_pago),
    };
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      // ✅ valida periodo simple (MM-YYYY)
      const per = normalizePeriodoToMMYYYY(form.periodo);
      if (!per || !/^\d{2}-\d{4}$/.test(per)) {
        throw new Error('Período inválido. Usá formato "MM-YYYY".');
      }

      // ✅ valida requeridos
      const req = [
        ["id_clasificacion", "Clasificación"],
        ["id_tipo_venta", "Tipo de venta"],
        ["id_tipo_movimiento", "Tipo de movimiento"],
        ["id_medio_pago", "Medio de pago"],
      ];
      for (const [k, label] of req) {
        if (form[k] === ADD_OPTION) throw new Error(`Tenés "${label}" en "Agregar…". Guardalo primero.`);
        const n = Number(form[k]);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`Seleccioná un valor válido para "${label}".`);
      }

      // ✅ opcionales: si están en ADD_OPTION, bloquea
      const opc = [
        ["id_cuenta_corriente", "Cuenta corriente"],
        ["id_cliente", "Cliente"],
        ["id_proveedor", "Proveedor"],
        ["id_detalle", "Detalle"],
      ];
      for (const [k, label] of opc) {
        if (form[k] === ADD_OPTION) throw new Error(`Tenés "${label}" en "Agregar…". Guardalo o elegí otra opción.`);
      }

      // ✅ monto
      const mt = safeNumber(form.monto_total);
      if (mt <= 0) throw new Error("Ingresá un monto total mayor a 0.");

      await onSave?.(payload);
    } catch (e2) {
      showToast("error", e2?.message || "Error guardando movimiento.", 4200);
      setSaving(false);
    }
  };

  /* =========================
     Helper UI: elegir "Agregar…"
     (se sigue usando para los demás selects)
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
                // Vuelve a NULL_OPTION
                copy[field] = NULL_OPTION;
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
            <h2 className="mi-modal__title">Nuevo movimiento</h2>
            <p className="mi-modal__subtitle">Completá los campos y guardá.</p>
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
                      // ✅ CAMBIO: al elegir fecha, autocompleta período (MM-YYYY)
                      onChange={(e) => onFechaChange(e.target.value)}
                      disabled={saving}
                      onClick={openDatePicker}
                      onFocus={openDatePicker}
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
                      <option value={NULL_OPTION}>-- Seleccionar clasificación --</option>
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
                      value={String(form.id_tipo_venta)}
                      onChange={(e) => onSelectWithAdd("id_tipo_venta", e.target.value, true)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>-- Seleccionar tipo de venta --</option>
                      {(safeLists.tiposVenta || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Tipo de venta</label>
                    {renderAddInline("id_tipo_venta")}
                  </div>

                  <div className="fl-field fl-col-full">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_tipo_movimiento)}
                      onChange={(e) => onSelectWithAdd("id_tipo_movimiento", e.target.value, true)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>-- Seleccionar tipo de movimiento --</option>
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
                      value={form.id_cuenta_corriente === NULL_OPTION ? "" : String(form.id_cuenta_corriente)}
                      onChange={(e) =>
                        onSelectWithAdd(
                          "id_cuenta_corriente",
                          e.target.value === "" ? NULL_OPTION : e.target.value,
                          e.target.value !== "" && e.target.value !== ADD_OPTION
                        )
                      }
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>-- Sin cuenta corriente --</option>
                      {(safeLists.cuentasCorrientes || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Cuenta corriente</label>
                    {renderAddInline("id_cuenta_corriente")}
                  </div>

                  {/* ✅ Campo CLIENTE como autocomplete en vez de <select> */}
                  <div className="fl-field" style={{ position: "relative" }}>
                    <input
                      ref={clienteInputRef}
                      className="fl-input"
                      placeholder=" "
                      value={clienteInput}
                      onChange={handleClienteInputChange}
                      onFocus={() => setClienteFocus(true)}
                      onBlur={() => {
                        // pequeño delay para permitir click en las opciones
                        setTimeout(() => setClienteFocus(false), 120);
                      }}
                      disabled={saving || addUI.field === "id_cliente"}
                      autoComplete="off"
                    />
                    <label className="fl-label">Cliente</label>

                    {/* Lista de sugerencias */}
                    {clienteFocus && filteredClientes.length > 0 && (
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
                          zIndex: 40,
                          listStyle: "none",
                        }}
                      >
                        {filteredClientes.map((c) => (
                          <li
                            key={c.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectCliente(c);
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
                              {c.nombre}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Botón para agregar nuevo cliente (equivalente a OTRO (AGREGAR…)) */}
                    <button
                      type="button"
                      onClick={startAddCliente}
                      disabled={saving || addUI.saving}
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        textAlign: "left",
                        padding: 0,
                        background: "none",
                        border: "none",
                        color: "#0f766e",
                        cursor: "pointer",
                      }}
                    >
                      + Agregar nuevo cliente
                    </button>

                    {renderAddInline("id_cliente")}
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={form.id_proveedor}
                      onChange={(e) => onSelectWithAdd("id_proveedor", e.target.value, false)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>-- Sin proveedor --</option>
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

                  <div className="fl-field fl-col-full">
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
                      <option value={NULL_OPTION}>-- Sin detalle --</option>
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
                </div>
              </article>

              {/* Pago */}
              <article className="mi-card mi-card--full">
                <h3 className="mi-card__title">Pago</h3>

                <div className="fl-grid">
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_medio_pago)}
                      onChange={(e) => onSelectWithAdd("id_medio_pago", e.target.value, true)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>-- Seleccionar medio de pago --</option>
                      {(safeLists.mediosPago || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                      <option value={ADD_OPTION}>OTRO (AGREGAR…)</option>
                    </select>
                    <label className="fl-label">Medio de pago</label>
                    {renderAddInline("id_medio_pago")}
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder=" "
                      value={form.monto_total}
                      onChange={(e) =>
                        onChange("monto_total", e.target.value === "" ? "" : Number(e.target.value))
                      }
                      disabled={saving}
                    />
                    <label className="fl-label">Monto total</label>
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
