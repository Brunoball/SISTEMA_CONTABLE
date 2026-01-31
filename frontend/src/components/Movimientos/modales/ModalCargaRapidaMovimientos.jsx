// src/components/Movimientos/modales/ModalCargaRapidaMovimientos.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ModalEditarMovimiento.css";
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
  tipos_movimiento: [],
  tipos_venta: [],
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
    tipos_movimiento: Array.isArray(src.tipos_movimiento) ? src.tipos_movimiento : [],
    tipos_venta: Array.isArray(src.tipos_venta) ? src.tipos_venta : [],
  };
}

/* =========================
   API helpers + auth
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

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`);
  }
}

async function apiPostJson(url, payload) {
  const { token } = getAuthInfo();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });

  return await parseJsonOrThrow(res);
}

/* =========================
   Mini Modal: alta rápida (cliente/proveedor/detalle)
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

export default function ModalCargaRapidaMovimientos({
  open,
  lists,
  periodoDefault,
  onClose,
  onSaveBatch,
  onToast,
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

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
  const [periodo, setPeriodo] = useState(
    normalizePeriodoToMMYYYY(periodoDefault || "") || periodoFromISODate(todayISO())
  );

  // filtros: ahora cliente/proveedor serán inputs + id oculto
  const [filters, setFilters] = useState({
    id_clasificacion: NULL_OPTION,
    id_tipo_venta: NULL_OPTION,
    id_cuenta_corriente: NULL_OPTION,
    id_tipo_movimiento: NULL_OPTION,
    id_medio_pago: NULL_OPTION,

    id_cliente: NULL_OPTION,
    id_proveedor: NULL_OPTION,
  });

  // inputs para autocomplete de cliente/proveedor (derecha)
  const [clienteInput, setClienteInput] = useState("");
  const [clienteFocus, setClienteFocus] = useState(false);
  const clienteInputRef = useRef(null);

  const [proveedorInput, setProveedorInput] = useState("");
  const [proveedorFocus, setProveedorFocus] = useState(false);
  const proveedorInputRef = useRef(null);

  // filas
  const [rows, setRows] = useState(() => [
    {
      id: crypto?.randomUUID?.() || String(Date.now()),
      id_detalle: NULL_OPTION,
      detalleText: "",
      cantidad: 1,
      precio: 0,
      ivaPct: 0,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const closeBtnRef = useRef(null);

  // mini modal alta rápida
  // field: id_cliente | id_proveedor | id_detalle
  // rowId: si es detalle, a qué fila aplicar
  const [addUI, setAddUI] = useState({
    open: false,
    field: null,
    rowId: null,
    text: "",
    saving: false,
  });

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const f = todayISO();
      setFecha(f);

      const per = normalizePeriodoToMMYYYY(periodoDefault || "") || periodoFromISODate(f);
      setPeriodo(per);

      setFilters({
        id_clasificacion: NULL_OPTION,
        id_tipo_venta: NULL_OPTION,
        id_cuenta_corriente: NULL_OPTION,
        id_tipo_movimiento: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_cliente: NULL_OPTION,
        id_proveedor: NULL_OPTION,
      });

      setClienteInput("");
      setClienteFocus(false);

      setProveedorInput("");
      setProveedorFocus(false);

      setRows([
        {
          id: crypto?.randomUUID?.() || String(Date.now()),
          id_detalle: NULL_OPTION,
          detalleText: "",
          cantidad: 1,
          precio: 0,
          ivaPct: 0,
        },
      ]);

      setAddUI({ open: false, field: null, rowId: null, text: "", saving: false });

      setSaving(false);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, periodoDefault]);

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
      {
        id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
        id_detalle: NULL_OPTION,
        detalleText: "",
        cantidad: 1,
        precio: 0,
        ivaPct: 0,
      },
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
     Autocomplete: CLIENTES (filtro derecha)
========================= */
  const clientesList = useMemo(
    () => (Array.isArray(listsNorm.clientes) ? listsNorm.clientes : []),
    [listsNorm.clientes]
  );

  const filteredClientes = useMemo(() => {
    const q = clienteInput.trim().toLowerCase();
    if (!clienteFocus || q.length < 1) return [];
    return clientesList
      .filter((c) => String(c?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [clientesList, clienteInput, clienteFocus]);

  const handleClienteInputChange = useCallback((e) => {
    const value = e.target.value;
    setClienteInput(value);
    setFilters((p) => ({ ...p, id_cliente: NULL_OPTION }));
  }, []);

  const handleSelectCliente = useCallback((cliente) => {
    const nombre = String(cliente?.nombre ?? "").trim();
    setClienteInput(nombre);
    setFilters((p) => ({
      ...p,
      id_cliente: cliente?.id != null ? String(cliente.id) : NULL_OPTION,
    }));
    setClienteFocus(false);
  }, []);

  const startAddCliente = useCallback(() => {
    setClienteFocus(false);
    setAddUI({ open: true, field: "id_cliente", rowId: null, text: "", saving: false });
  }, []);

  /* =========================
     Autocomplete: PROVEEDORES (filtro derecha)
========================= */
  const proveedoresList = useMemo(
    () => (Array.isArray(listsNorm.proveedores) ? listsNorm.proveedores : []),
    [listsNorm.proveedores]
  );

  const filteredProveedores = useMemo(() => {
    const q = proveedorInput.trim().toLowerCase();
    if (!proveedorFocus || q.length < 1) return [];
    return proveedoresList
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [proveedoresList, proveedorInput, proveedorFocus]);

  const handleProveedorInputChange = useCallback((e) => {
    const value = e.target.value;
    setProveedorInput(value);
    setFilters((p) => ({ ...p, id_proveedor: NULL_OPTION }));
  }, []);

  const handleSelectProveedor = useCallback((prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    setProveedorInput(nombre);
    setFilters((p) => ({
      ...p,
      id_proveedor: prov?.id != null ? String(prov.id) : NULL_OPTION,
    }));
    setProveedorFocus(false);
  }, []);

  const startAddProveedor = useCallback(() => {
    setProveedorFocus(false);
    setAddUI({ open: true, field: "id_proveedor", rowId: null, text: "", saving: false });
  }, []);

  /* =========================
     Crear nuevo catálogo (cliente/proveedor/detalle)
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

      // actualizar listas locales
      setLocalLists((prev) => {
        const next = { ...prev };
        const listKey =
          field === "id_cliente"
            ? "clientes"
            : field === "id_proveedor"
            ? "proveedores"
            : "detalles";

        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next[listKey] = arr;
        return next;
      });

      // aplicar selección según campo
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
        if (rowId) {
          updateRow(rowId, { id_detalle: String(newId), detalleText: newNombre });
        }
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
     ✅ VALIDACIÓN SUPER FLEX
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
          id_tipo_venta: toNullableId(filters.id_tipo_venta),
          id_cuenta_corriente: toNullableId(filters.id_cuenta_corriente),
          id_tipo_movimiento: toNullableId(filters.id_tipo_movimiento),
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

  const cancelMini = () => {
    // si cancelás un alta, no tocamos nada crítico; solo cerramos.
    closeAddMini();
  };

  return (
    <div className="mi-modal__overlay">
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1180 }}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Carga rápida</h2>
            <p className="mi-modal__subtitle">
              Planilla a la izquierda + filtros a la derecha. Guardás todo junto.
            </p>
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

        <div style={{ padding: 18 }}>
          <div className="fl-grid" style={{ marginBottom: 14 }}>
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
              <label className="fl-label">Período (MM-YYYY)</label>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
            {/* Planilla */}
            <div
              style={{
                border: "1px solid rgba(148,163,184,.45)",
                borderRadius: 14,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.2fr .7fr .9fr .8fr .9fr .9fr .35fr",
                  padding: "10px 10px",
                  background: "rgba(15, 23, 42, 0.04)",
                  borderBottom: "1px solid rgba(148,163,184,.35)",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                <div>Descripción</div>
                <div style={{ textAlign: "center" }}>Cantidad</div>
                <div style={{ textAlign: "center" }}>Precio</div>
                <div style={{ textAlign: "center" }}>% IVA</div>
                <div style={{ textAlign: "center" }}>IVA</div>
                <div style={{ textAlign: "center" }}>Total</div>
                <div />
              </div>

              <div style={{ maxHeight: 360, overflow: "auto" }}>
                {rowsCalc.map((r) => {
                  const suggestions = suggestDetalles(r.detalleText);
                  const showSug =
                    String(r.detalleText || "").trim().length > 0 &&
                    Number(r.id_detalle || 0) <= 0 &&
                    suggestions.length > 0;

                  return (
                    <div
                      key={r.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2.2fr .7fr .9fr .8fr .9fr .9fr .35fr",
                        gap: 8,
                        padding: "10px 10px",
                        borderBottom: "1px solid rgba(148,163,184,.22)",
                        alignItems: "center",
                        position: "relative",
                      }}
                    >
                      <div style={{ position: "relative" }}>
                        <input
                          className="fl-input"
                          placeholder="Escribí y seleccioná un detalle…"
                          value={r.detalleText}
                          onChange={(e) => {
                            updateRow(r.id, {
                              detalleText: e.target.value,
                              id_detalle: NULL_OPTION,
                            });
                          }}
                          disabled={saving || addUI.open}
                          autoComplete="off"
                          style={{ height: 38 }}
                        />

                        {showSug && (
                          <ul
                            style={{
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              right: 0,
                              marginTop: 4,
                              maxHeight: 220,
                              overflowY: "auto",
                              borderRadius: 10,
                              border: "1px solid rgba(148, 163, 184, 0.5)",
                              background: "white",
                              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
                              padding: 4,
                              zIndex: 60,
                              listStyle: "none",
                            }}
                          >
                            {suggestions.map((d) => (
                              <li
                                key={d.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  updateRow(r.id, {
                                    id_detalle: String(d.id),
                                    detalleText: String(d.nombre || ""),
                                  });
                                }}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  cursor: "pointer",
                                  fontSize: 13,
                                }}
                              >
                                {d.nombre}
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* ✅ Agregar nuevo detalle (por fila) */}
                        <button
                          type="button"
                          onClick={() => startAddDetalleForRow(r.id)}
                          disabled={saving || addUI.saving}
                          style={{
                            marginTop: 6,
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
                        style={{ height: 38, textAlign: "center" }}
                      />

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
                        style={{ height: 38, textAlign: "center" }}
                      />

                      <select
                        className="fl-input fl-select"
                        value={String(r.ivaPct)}
                        onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                        disabled={saving}
                        style={{ height: 38 }}
                      >
                        {IVA_OPTIONS.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>

                      <div style={{ textAlign: "center", fontWeight: 700 }}>
                        {moneyARS(r.ivaMonto)}
                      </div>
                      <div style={{ textAlign: "center", fontWeight: 800 }}>
                        {moneyARS(r.total)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        disabled={saving}
                        title="Eliminar fila"
                        style={{
                          height: 34,
                          borderRadius: 10,
                          border: "1px solid rgba(239,68,68,.35)",
                          background: "rgba(239,68,68,.06)",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  padding: "12px 12px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={addRow}
                  disabled={saving}
                  style={{
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid rgba(15,23,42,.14)",
                    background: "rgba(15,23,42,.04)",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  + Agregar fila
                </button>

                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>Subtotal</span>
                    <b>{moneyARS(resumen.subtotal)}</b>
                  </div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ opacity: 0.7 }}>IVA</span>
                    <b>{moneyARS(resumen.iva)}</b>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 16 }}>
                    <span style={{ opacity: 0.7 }}>TOTAL</span>
                    <b>{moneyARS(resumen.total)}</b>
                  </div>
                </div>
              </div>
            </div>

            {/* Filtros derecha */}
            <aside
              style={{
                border: "1px solid rgba(148,163,184,.45)",
                borderRadius: 14,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Filtros</div>

              <div className="fl-grid" style={{ gridTemplateColumns: "1fr" }}>
                {/* selects normales */}
                {[
                  ["id_clasificacion", "Clasificación (opcional)", listsNorm.clasificaciones],
                  ["id_tipo_venta", "Tipo venta (opcional)", listsNorm.tipos_venta],
                  ["id_cuenta_corriente", "Cuenta corriente (opcional)", listsNorm.cuentas_corrientes],
                  ["id_tipo_movimiento", "Tipo movimiento (opcional)", listsNorm.tipos_movimiento],
                  ["id_medio_pago", "Medio pago (opcional)", listsNorm.medios_pago],
                ].map(([k, label, arr]) => (
                  <div className="fl-field" key={k}>
                    <select
                      className="fl-input fl-select"
                      value={String(filters[k])}
                      onChange={(e) => updateFilter(k, e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>{label}</option>
                      {arr.map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">{String(label).replace(" (opcional)", "")}</label>
                  </div>
                ))}

                {/* ✅ Cliente autocomplete + alta */}
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
                        zIndex: 80,
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

                {/* ✅ Proveedor autocomplete + alta */}
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
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <button
                  type="button"
                  onClick={submit}
                  disabled={saving}
                  className="mit-btn mit-btn--solid"
                  style={{ width: "100%", height: 44 }}
                >
                  {saving ? "Guardando..." : "Guardar todo"}
                </button>

                <button
                  type="button"
                  onClick={() => (!saving ? onClose?.() : null)}
                  disabled={saving}
                  className="mit-btn mit-btn--ghost"
                  style={{ width: "100%", height: 44 }}
                >
                  Cancelar
                </button>
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
          onCancel={cancelMini}
          onSave={guardarNuevoCatalogo}
        />
      </div>
    </div>
  );
}
