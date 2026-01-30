// src/components/Movimientos/modales/ModalEditarMovimiento.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import "./ModalEditarMovimiento.css"; // Reutiliza estética
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

/* =========================
   Safe lists + normalización (adaptado a NUEVA tabla)
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

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   ✅ Período MM-YYYY helpers
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

/* =========================
   Mini Modal: alta rápida (cliente/proveedor/detalle)
========================= */
function AddCatalogMiniModal({
  open,
  title,
  value,
  saving,
  onChange,
  onCancel,
  onSave,
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
    </div>
  );
}

/* =========================
   Build form desde row (NUEVA ESTRUCTURA)
========================= */
function buildFormFromRow(row, lists, periodoDefault) {
  const r = row || {};
  const pickPeriodo = normalizePeriodoToMMYYYY(r.periodo || periodoDefault || "");

  const nOrNull = (v) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NULL_OPTION;
  const sOrNull = (v) => (v == null || v === "" || v === 0 ? NULL_OPTION : String(v));

  return {
    id_movimiento: safeNumber(r.id_movimiento) || null,
    fecha: String(r.fecha || "").slice(0, 10) || "",
    periodo: pickPeriodo,

    id_clasificacion: nOrNull(r.id_clasificacion),
    id_tipo_venta: nOrNull(r.id_tipo_venta),
    id_cuenta_corriente: sOrNull(r.id_cuenta_corriente),
    id_tipo_movimiento: nOrNull(r.id_tipo_movimiento),

    id_cliente: sOrNull(r.id_cliente),
    id_proveedor: sOrNull(r.id_proveedor),
    id_detalle: sOrNull(r.id_detalle),

    id_medio_pago: nOrNull(r.id_medio_pago),

    monto_total: safeNumber(r.monto_total) || 0,
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
  onToast,
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // ✅ refs para NO resetear por cambios de props mientras está abierto
  const listsRef = useRef(lists);
  const rowRef = useRef(row);
  const periodoDefaultRef = useRef(periodoDefault);
  useEffect(() => {
    listsRef.current = lists;
  }, [lists]);
  useEffect(() => {
    rowRef.current = row;
  }, [row]);
  useEffect(() => {
    periodoDefaultRef.current = periodoDefault;
  }, [periodoDefault]);

  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeIncomingLists(lists),
  }));

  // ✅ actualizar listas SIN tocar form
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const safeLists = useMemo(() => localLists, [localLists]);

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() =>
    buildFormFromRow(row, { ...SAFE_LISTS, ...normalizeIncomingLists(lists) }, periodoDefault)
  );

  // UI agregar:
  // - inline para selects comunes
  // - mini modal para cliente/proveedor/detalle
  const [addUI, setAddUI] = useState({
    open: false,
    field: null,
    text: "",
    saving: false,
  });

  // ✅ Autocomplete de clientes
  const [clienteInput, setClienteInput] = useState("");
  const [clienteFocus, setClienteFocus] = useState(false);
  const clienteInputRef = useRef(null);

  // ✅ Autocomplete de proveedores
  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);
  const proveedorInputRef = useRef(null);

  // ✅ Autocomplete de detalles
  const [detalleInput, setDetalleInput] = useState("");
  const [detalleFocus, setDetalleFocus] = useState(false);
  const detalleInputRef = useRef(null);

  const closeBtnRef = useRef(null);

  // ✅ Date picker: abrir con click en todo el input
  const fechaRef = useRef(null);

  // ✅ Dirty flag
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // ✅ Init SOLO al ABRIR
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;
    if (wasOpen) return;

    dirtyRef.current = false;
    setSaving(false);
    setAddUI({ open: false, field: null, text: "", saving: false });

    const merged = { ...SAFE_LISTS, ...normalizeIncomingLists(listsRef.current) };
    setLocalLists(merged);

    const built = buildFormFromRow(rowRef.current, merged, periodoDefaultRef.current);
    setForm(built);

    const nameById = (arr, id) => {
      const sid = String(id ?? "").trim();
      if (!sid || sid === NULL_OPTION) return "";
      const found = (Array.isArray(arr) ? arr : []).find((x) => String(x?.id) === sid);
      return String(found?.nombre ?? "").trim();
    };

    setClienteInput(nameById(merged.clientes, built.id_cliente));
    setClienteFocus(false);

    setProveedorInput(nameById(merged.proveedores, built.id_proveedor));
    setProveedorFocus(false);

    setDetalleInput(nameById(merged.detalles, built.id_detalle));
    setDetalleFocus(false);

    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  // ✅ ESC cierra
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

  const onChange = useCallback(
    (k, v) => {
      markDirty();
      setForm((prev) => ({ ...prev, [k]: v }));
    },
    [markDirty]
  );

  const onPeriodoChange = useCallback(
    (raw) => {
      markDirty();
      const digits = String(raw || "").replace(/\D/g, "").slice(0, 6);
      let next = "";

      if (digits.length <= 2) next = digits;
      else next = `${digits.slice(0, 2)}-${digits.slice(2)}`;

      if (digits.length === 6) next = normalizePeriodoToMMYYYY(next);

      setForm((p) => ({ ...p, periodo: next }));
    },
    [markDirty]
  );

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
      throw new Error(
        `Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`
      );
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

  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, field: null, text: "", saving: false });
  }, [addUI.saving]);

  /* =========================
     Guardar nuevo registro del catálogo
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

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next[listKey] = arr;
        return next;
      });

      // en este modal, estos 3 SIEMPRE string (por tu backend actual)
      setForm((prev) => ({ ...prev, [addUI.field]: String(newId) }));

      if (addUI.field === "id_cliente") {
        setClienteInput(newNombre);
        setTimeout(() => clienteInputRef.current?.focus(), 0);
      }
      if (addUI.field === "id_proveedor") {
        setProveedorInput(newNombre);
        setTimeout(() => proveedorInputRef.current?.focus(), 0);
      }
      if (addUI.field === "id_detalle") {
        setDetalleInput(newNombre);
        setTimeout(() => detalleInputRef.current?.focus(), 0);
      }

      try {
        onCatalogCreated?.(meta.catalogo, { id: newId, nombre: newNombre });
      } catch {}

      setAddUI({ open: false, field: null, text: "", saving: false });
      showToast("exito", `${meta.label} creado: "${newNombre}"`, 2600);
    } catch (e) {
      const msg = e?.message || "Error creando el registro.";
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", msg, 4200);
    }
  }, [API, addUI, apiPostJson, onCatalogCreated, showToast]);

  // ✅ cerrar SOLO por X o ESC (nunca por click afuera)
  const cerrar = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [saving, onClose]);

  /* =========================
     Autocomplete de CLIENTES / PROVEEDORES / DETALLES
  ========================= */
  const handleClienteInputChange = useCallback(
    (e) => {
      markDirty();
      const value = e.target.value;
      setClienteInput(value);
      setForm((prev) => ({ ...prev, id_cliente: NULL_OPTION }));
    },
    [markDirty]
  );

  const handleSelectCliente = useCallback(
    (cliente) => {
      markDirty();
      const nombre = String(cliente?.nombre ?? "").trim();
      setClienteInput(nombre);
      setForm((prev) => ({
        ...prev,
        id_cliente: cliente?.id != null ? String(cliente.id) : NULL_OPTION,
      }));
      setClienteFocus(false);
    },
    [markDirty]
  );

  const startAddCliente = useCallback(() => {
    markDirty();
    setClienteFocus(false);
    setAddUI({ open: true, field: "id_cliente", text: "", saving: false });
    setForm((prev) => ({ ...prev, id_cliente: ADD_OPTION }));
  }, [markDirty]);

  const filteredClientes = useMemo(() => {
    const all = Array.isArray(safeLists.clientes) ? safeLists.clientes : [];
    const q = clienteInput.trim().toLowerCase();
    if (!clienteFocus || q.length < 1) return [];
    return all
      .filter((c) => String(c?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [safeLists.clientes, clienteInput, clienteFocus]);

  // --- PROVEEDORES
  const handleProveedorInputChange = useCallback(
    (e) => {
      markDirty();
      const value = e.target.value;
      setProveedorInput(value);
      setForm((prev) => ({ ...prev, id_proveedor: NULL_OPTION }));
    },
    [markDirty]
  );

  const handleSelectProveedor = useCallback(
    (prov) => {
      markDirty();
      const nombre = String(prov?.nombre ?? "").trim();
      setProveedorInput(nombre);
      setForm((prev) => ({
        ...prev,
        id_proveedor: prov?.id != null ? String(prov.id) : NULL_OPTION,
      }));
      setProveedorFocus(false);
    },
    [markDirty]
  );

  const startAddProveedor = useCallback(() => {
    markDirty();
    setProveedorFocus(false);
    setAddUI({ open: true, field: "id_proveedor", text: "", saving: false });
    setForm((prev) => ({ ...prev, id_proveedor: ADD_OPTION }));
  }, [markDirty]);

  const filteredProveedores = useMemo(() => {
    const all = Array.isArray(safeLists.proveedores) ? safeLists.proveedores : [];
    const q = proveedorInput.trim().toLowerCase();
    if (!proveedorFocus || q.length < 1) return [];
    return all
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [safeLists.proveedores, proveedorInput, proveedorFocus]);

  // --- DETALLES
  const handleDetalleInputChange = useCallback(
    (e) => {
      markDirty();
      const value = e.target.value;
      setDetalleInput(value);
      setForm((prev) => ({ ...prev, id_detalle: NULL_OPTION }));
    },
    [markDirty]
  );

  const handleSelectDetalle = useCallback(
    (det) => {
      markDirty();
      const nombre = String(det?.nombre ?? "").trim();
      setDetalleInput(nombre);
      setForm((prev) => ({
        ...prev,
        id_detalle: det?.id != null ? String(det.id) : NULL_OPTION,
      }));
      setDetalleFocus(false);
    },
    [markDirty]
  );

  const startAddDetalle = useCallback(() => {
    markDirty();
    setDetalleFocus(false);
    setAddUI({ open: true, field: "id_detalle", text: "", saving: false });
    setForm((prev) => ({ ...prev, id_detalle: ADD_OPTION }));
  }, [markDirty]);

  const filteredDetalles = useMemo(() => {
    const all = Array.isArray(safeLists.detalles) ? safeLists.detalles : [];
    const q = detalleInput.trim().toLowerCase();
    if (!detalleFocus || q.length < 1) return [];
    return all
      .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [safeLists.detalles, detalleInput, detalleFocus]);

  /* =========================
     Payload final (EDIT)
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
      id_movimiento: form.id_movimiento,

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

    if (addUI.open) {
      showToast(
        "advertencia",
        "Terminá de crear el registro (o cancelá) antes de guardar.",
        3200
      );
      return;
    }

    setSaving(true);

    try {
      const per = normalizePeriodoToMMYYYY(form.periodo);
      if (!per || !/^\d{2}-\d{4}$/.test(per)) {
        throw new Error('Período inválido. Usá formato "MM-YYYY".');
      }

      const req = [
        ["id_clasificacion", "Clasificación"],
        ["id_tipo_venta", "Tipo de venta"],
        ["id_tipo_movimiento", "Tipo de movimiento"],
        ["id_medio_pago", "Medio de pago"],
      ];
      for (const [k, label] of req) {
        if (form[k] === ADD_OPTION)
          throw new Error(`Tenés "${label}" en "Agregar…". Guardalo primero.`);
        const n = Number(form[k]);
        if (!Number.isFinite(n) || n <= 0)
          throw new Error(`Seleccioná un valor válido para "${label}".`);
      }

      const opc = [
        ["id_cuenta_corriente", "Cuenta corriente"],
        ["id_cliente", "Cliente"],
        ["id_proveedor", "Proveedor"],
        ["id_detalle", "Detalle"],
      ];
      for (const [k, label] of opc) {
        if (form[k] === ADD_OPTION)
          throw new Error(`Tenés "${label}" en "Agregar…". Guardalo o elegí otra opción.`);
      }

      const mt = safeNumber(form.monto_total);
      if (mt <= 0) throw new Error("Ingresá un monto total mayor a 0.");

      if (
        clienteInput.trim() &&
        (form.id_cliente === NULL_OPTION || form.id_cliente === "" || form.id_cliente == null)
      ) {
        throw new Error("Seleccioná el cliente desde las sugerencias (o agregalo) para guardar el ID.");
      }

      if (
        proveedorInput.trim() &&
        (form.id_proveedor === NULL_OPTION || form.id_proveedor === "" || form.id_proveedor == null)
      ) {
        throw new Error("Seleccioná el proveedor desde las sugerencias (o agregalo) para guardar el ID.");
      }

      if (
        detalleInput.trim() &&
        (form.id_detalle === NULL_OPTION || form.id_detalle === "" || form.id_detalle == null)
      ) {
        throw new Error("Seleccioná el detalle desde las sugerencias (o agregalo) para guardar el ID.");
      }

      await onSave?.(payload);
    } catch (e2) {
      showToast("error", e2?.message || "Error guardando movimiento.", 4200);
      setSaving(false);
    }
  };

  /* =========================
     Helper UI: elegir "Agregar…"
  ========================= */
  const onSelectWithAdd = useCallback(
    (field, rawValue, castToNumber) => {
      markDirty();

      if (rawValue === ADD_OPTION) {
        // mini modal para estos 3:
        const isMini =
          field === "id_cliente" || field === "id_proveedor" || field === "id_detalle";

        setForm((p) => ({ ...p, [field]: ADD_OPTION }));

        if (isMini) {
          setAddUI({ open: true, field, text: "", saving: false });
        } else {
          setAddUI({ open: false, field, text: "", saving: false });
        }
        return;
      }

      if (addUI.field === field && !addUI.open) {
        setAddUI({ open: false, field: null, text: "", saving: false });
      }

      const v = castToNumber ? Number(rawValue) : rawValue;
      setForm((p) => ({ ...p, [field]: v }));
    },
    [addUI.field, addUI.open, markDirty]
  );

  // Inline add: SOLO para selects (no cliente/proveedor/detalle)
  const renderAddInline = (field) => {
    if (addUI.open) return null;
    if (addUI.field !== field) return null;

    if (field === "id_cliente" || field === "id_proveedor" || field === "id_detalle") return null;

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
              setAddUI({ open: false, field: null, text: "", saving: false });
              setForm((p) => ({ ...p, [field]: NULL_OPTION }));
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

  const miniOpen =
    addUI.open && ["id_cliente", "id_proveedor", "id_detalle"].includes(addUI.field);

  const miniTitle =
    addUI.field === "id_cliente"
      ? "Nuevo cliente"
      : addUI.field === "id_proveedor"
      ? "Nuevo proveedor"
      : "Nuevo detalle";

  const cancelMini = () => {
    setForm((p) => ({
      ...p,
      id_cliente: addUI.field === "id_cliente" ? NULL_OPTION : p.id_cliente,
      id_proveedor: addUI.field === "id_proveedor" ? NULL_OPTION : p.id_proveedor,
      id_detalle: addUI.field === "id_detalle" ? NULL_OPTION : p.id_detalle,
    }));
    closeAddMini();
  };

  if (!open) return null;

  return (
    // ✅ NO tiene onClick para cerrar por overlay
    <div className="mi-modal__overlay">
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
                      onChange={(e) =>
                        onSelectWithAdd("id_clasificacion", e.target.value, true)
                      }
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
                      onChange={(e) =>
                        onSelectWithAdd("id_tipo_movimiento", e.target.value, true)
                      }
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
                      value={String(form.id_cuenta_corriente)}
                      onChange={(e) =>
                        onSelectWithAdd(
                          "id_cuenta_corriente",
                          e.target.value,
                          e.target.value !== ADD_OPTION
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

                  {/* Cliente */}
                  <div className="fl-field" style={{ position: "relative" }}>
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
                    <label className="fl-label">Cliente</label>

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
                  </div>

                  {/* Proveedor */}
                  <div className="fl-field fl-col-full" style={{ position: "relative" }}>
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
                      onClick={startAddProveedor}
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
                      + Agregar nuevo proveedor
                    </button>
                  </div>

                  {/* Detalle */}
                  <div className="fl-field fl-col-full" style={{ position: "relative" }}>
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
                      <ul
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: 4,
                          maxHeight: 150,
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
                        {filteredDetalles.map((d) => (
                          <li
                            key={d.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectDetalle(d);
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
                              {d.nombre}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <button
                      type="button"
                      onClick={startAddDetalle}
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
                      + Agregar nuevo detalle
                    </button>
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

          {/* Mini modal (cliente/proveedor/detalle) */}
          <AddCatalogMiniModal
            open={miniOpen}
            title={miniTitle}
            value={addUI.text}
            saving={addUI.saving}
            onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
            onCancel={cancelMini}
            onSave={guardarNuevoCatalogo}
          />

          {/* Footer */}
          <div className="mit-actions">
            <div className="mit-help">{saving ? "Guardando…" : " "}</div>

            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={cerrar}
              disabled={saving}
            >
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
