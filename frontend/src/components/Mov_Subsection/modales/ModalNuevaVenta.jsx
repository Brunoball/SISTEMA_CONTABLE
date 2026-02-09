// src/components/Ventas/modales/ModalNuevaVenta.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ajustá si cambia
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
  clientes: [],
  detalles: [],
  medios_pago: [],
  tipos_venta: [],
  tipos_movimiento: [],
};

function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};
  const src = l.listas && typeof l.listas === "object" ? l.listas : l;

  return {
    clientes: Array.isArray(src.clientes) ? src.clientes : [],
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
    medios_pago: Array.isArray(src.medios_pago) ? src.medios_pago : [],
    tipos_venta: Array.isArray(src.tipos_venta) ? src.tipos_venta : [],
    tipos_movimiento: Array.isArray(src.tipos_movimiento) ? src.tipos_movimiento : [],
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
   Mini Modal: alta rápida (cliente/detalle)
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

  return createPortal(
    <div className="mi-mini__overlay" onMouseDown={onCancel}>
      <div className="mi-mini__modal" onMouseDown={(e) => e.stopPropagation()}>
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
   Catálogos soportados (ventas)
========================= */
const CATALOGO_DEF = {
  id_cliente: { catalogo: "clientes", label: "Cliente" },
  id_detalle: { catalogo: "detalles", label: "Detalle" },
};

function isContadoTipoVenta(tipoVentaObj) {
  const name = String(tipoVentaObj?.nombre ?? "").toLowerCase();
  return name.includes("contado") || name.includes("efectivo");
}
function isCorrienteTipoVenta(tipoVentaObj) {
  const name = String(tipoVentaObj?.nombre ?? "").toLowerCase();
  return name.includes("corriente");
}
function findSalidaTipoMovimientoId(tiposMov) {
  const arr = Array.isArray(tiposMov) ? tiposMov : [];
  const hit = arr.find((x) => String(x?.nombre ?? "").toLowerCase().includes("salida"));
  const id = Number(hit?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export default function ModalNuevaVenta({ open, lists, periodoDefault, onClose, onSaveBatch, onToast }) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion), [onToast]);

  // lock scroll body mientras está abierto
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

  // ✅ siempre hoy
  const [fecha, setFecha] = useState(todayISO());
  const [periodo, setPeriodo] = useState(periodoFromISODate(todayISO()));

  // ✅ Filtros mínimos Ventas
  const [filters, setFilters] = useState({
    id_tipo_venta: NULL_OPTION,
    id_medio_pago: NULL_OPTION, // solo si contado
    id_cliente: NULL_OPTION, // obligatorio
  });

  // ✅ acción SOLO para CONTADO: guardar (pendiente) o facturar (pagado)
  const [accionContado, setAccionContado] = useState("facturar"); // "guardar" | "facturar"

  // autocomplete cliente
  const [clienteInput, setClienteInput] = useState("");
  const [clienteFocus, setClienteFocus] = useState(false);
  const clienteInputRef = useRef(null);

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
  const [addUI, setAddUI] = useState({
    open: false,
    field: null, // "id_cliente" | "id_detalle"
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
      setPeriodo(periodoFromISODate(f));

      setFilters({
        id_tipo_venta: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_cliente: NULL_OPTION,
      });

      setAccionContado("facturar");

      setClienteInput("");
      setClienteFocus(false);

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
     Autocomplete: DETALLES
========================= */
  const detallesList = useMemo(() => (Array.isArray(listsNorm.detalles) ? listsNorm.detalles : []), [listsNorm.detalles]);

  const suggestDetalles = (txt) => {
    const q = String(txt || "").trim().toLowerCase();
    if (!q) return [];
    return detallesList.filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q)).slice(0, 18);
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
  const clientesList = useMemo(() => (Array.isArray(listsNorm.clientes) ? listsNorm.clientes : []), [listsNorm.clientes]);

  const filteredClientes = useMemo(() => {
    const q = clienteInput.trim().toLowerCase();
    if (!clienteFocus || q.length < 1) return [];
    return clientesList.filter((c) => String(c?.nombre ?? "").toLowerCase().includes(q)).slice(0, 25);
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
        const listKey = field === "id_cliente" ? "clientes" : "detalles";

        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next[listKey] = arr;
        return next;
      });

      if (field === "id_cliente") {
        setFilters((p) => ({ ...p, id_cliente: String(newId) }));
        setClienteInput(newNombre);
        setTimeout(() => clienteInputRef.current?.focus(), 0);
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
     Tipo venta -> reglas UI
========================= */
  const tipoVentaSelected = useMemo(() => {
    const id = Number(filters.id_tipo_venta);
    if (!Number.isFinite(id) || id <= 0) return null;
    return (listsNorm.tipos_venta || []).find((x) => Number(x?.id) === id) || null;
  }, [filters.id_tipo_venta, listsNorm.tipos_venta]);

  const isContado = useMemo(() => isContadoTipoVenta(tipoVentaSelected), [tipoVentaSelected]);
  const isCorriente = useMemo(() => isCorrienteTipoVenta(tipoVentaSelected), [tipoVentaSelected]);

  // ✅ reglas:
  // - Si pasa a Corriente: NO hay pago, forzamos "guardar" y limpiamos medio de pago
  // - Si pasa a Contado: medio pago aplica, y dejamos elegir facturar/guardar
  useEffect(() => {
    if (!open) return;

    if (isCorriente) {
      setAccionContado("guardar");
      setFilters((p) => ({ ...p, id_medio_pago: NULL_OPTION }));
    }

    if (!isContado) {
      // si no es contado, medio pago no aplica
      setFilters((p) => ({ ...p, id_medio_pago: NULL_OPTION }));
    }
  }, [open, isContado, isCorriente]);

  /* =========================
     VALIDACIÓN (Ventas)
========================= */
  const validate = useCallback(() => {
    const cli = Number(filters.id_cliente);
    if (!Number.isFinite(cli) || cli <= 0) {
      return { ok: false, msg: "Seleccioná un Cliente para registrar la venta." };
    }

    const tv = Number(filters.id_tipo_venta);
    if (!Number.isFinite(tv) || tv <= 0) {
      return { ok: false, msg: "Seleccioná la Forma de venta (Tipo venta)." };
    }

    // contado => medio pago obligatorio
    if (isContado) {
      const mp = Number(filters.id_medio_pago);
      if (!Number.isFinite(mp) || mp <= 0) {
        return { ok: false, msg: "Seleccioná el Medio de pago para ventas Contado." };
      }
    }

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
  }, [filters.id_cliente, filters.id_tipo_venta, filters.id_medio_pago, isContado, rowsCalc]);

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

    if (v.warn) showToast("advertencia", "Hay filas incompletas. Se guardarán solo las filas válidas.", 3500);
    else showToast("cargando", "Guardando venta…", 12000);

    try {
      const fechaToSend = toNullableDateISO(fecha);
      const periodoToSend = toNullablePeriodoMMYYYY(periodo, fechaToSend || todayISO());

      const idTipoMovSalida = findSalidaTipoMovimientoId(listsNorm.tipos_movimiento);
      if (!idTipoMovSalida) {
        showToast("error", "No está configurado el tipo de movimiento 'Salida'. Revisá tipos_movimiento.", 5200);
        setSaving(false);
        return;
      }

      // ✅ decisión de pago:
      // - Corriente: SIEMPRE guardar (pendiente), NO facturar
      // - Contado: depende accionContado (guardar/facturar)
      const accionFinal = isCorriente ? "guardar" : accionContado;
      const esFacturaFinal = isCorriente ? false : accionFinal === "facturar";

      const payloads = rowsCalc
        .filter((r) => {
          const det = Number(r.id_detalle);
          const total = Number(r.total || 0);
          return Number.isFinite(det) && det > 0 && total > 0;
        })
        .map((r) => {
          const base = {
            fecha: fechaToSend,
            periodo: periodoToSend,

            // Ventas: SIEMPRE salida
            id_tipo_movimiento: idTipoMovSalida,

            id_tipo_venta: toNullableId(filters.id_tipo_venta),
            id_cliente: toNullableId(filters.id_cliente),

            // contado: medio pago
            id_medio_pago: isContado ? toNullableId(filters.id_medio_pago) : null,

            // flags/acción
            es_factura: esFacturaFinal,
            accion_venta: accionFinal, // "guardar" | "facturar" (corriente siempre "guardar")

            id_detalle: toNullableId(r.id_detalle),

            monto_total: Math.round(Number(r.total) * 100) / 100,
            cantidad: Math.round(Number(r.cantidad) * 100) / 100,
            precio: Math.round(Number(r.precio) * 100) / 100,
            iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
            subtotal: Math.round(Number(r.subtotal) * 100) / 100,
            iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
            total: Math.round(Number(r.total) * 100) / 100,
          };

          Object.keys(base).forEach((k) => {
            if (base[k] === undefined) delete base[k];
          });

          return base;
        });

      if (!payloads.length) {
        showToast("advertencia", "No hay filas válidas para guardar.", 3500);
        setSaving(false);
        return;
      }

      await onSaveBatch?.(payloads);

      showToast("exito", `Listo: ${payloads.length} ítems de venta guardados.`, 2800);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
      setSaving(false);
    }
  };

  if (!open) return null;

  const miniOpen = addUI.open && ["id_cliente", "id_detalle"].includes(addUI.field);
  const miniTitle = addUI.field === "id_cliente" ? "Nuevo cliente" : "Nuevo detalle";

  const modalJSX = (
    <div className="mi-modal__overlay mi-modal__overlay--mov">
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
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
            {/* Planilla */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__head">
                <div>Descripción</div>
                <div style={{ textAlign: "center" }}>Cantidad</div>
                <div style={{ textAlign: "center" }}>Precio</div>
                <div style={{ textAlign: "center" }}>% IVA</div>
                <div style={{ textAlign: "center" }}>IVA</div>
                <div style={{ textAlign: "center" }}>Total</div>
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
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--desc" style={{ position: "relative" }}>
                        <input
                          className="fl-input"
                          placeholder="Escribí o seleccioná una descripción…"
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
                          <ul className="mi-cr-suggest">
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
                                className="mi-cr-suggest__item"
                              >
                                {d.nombre}
                              </li>
                            ))}
                          </ul>
                        )}

                        <button
                          type="button"
                          onClick={() => startAddDetalleForRow(r.id)}
                          disabled={saving || addUI.saving}
                          className="mi-cr-link"
                        >
                          + Agregar nueva descripción
                        </button>
                      </div>

                      {/* Cantidad */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--qty">
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
                          style={{ height: 38, textAlign: "center" }}
                        />
                      </div>

                      {/* Precio */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--price">
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
                          style={{ height: 38, textAlign: "center" }}
                        />
                      </div>

                      {/* % IVA */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--iva">
                        <select
                          className="fl-input fl-select fl-select-iva--car fl-select-iva--compra"
                          value={String(r.ivaPct)}
                          onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                          disabled={saving}
                          style={{ height: 38, textAlign: "center" }}
                        >
                          {IVA_OPTIONS.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* IVA monto */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto">
                        <div style={{ textAlign: "center", fontWeight: 700, paddingTop: 10 }}>{moneyARS(r.ivaMonto)}</div>
                      </div>

                      {/* Total */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--total">
                        <div style={{ textAlign: "center", fontWeight: 800, paddingTop: 10 }}>{moneyARS(r.total)}</div>
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

            {/* Panel derecha: datos de venta */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos de venta</div>

                <div className="mi-cr-filters__dates">
                  <div className="fl-field">
                    <input className="fl-input" type="date" value={fecha} onChange={(e) => onFechaChange(e.target.value)} disabled={saving} />
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
                <div className="fl-grid" style={{ gridTemplateColumns: "1fr" }}>
                  {/* CLIENTE */}
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
                    <label className="fl-label">Cliente *</label>

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
                            {c.nombre}
                          </li>
                        ))}
                      </ul>
                    )}

                    <button type="button" className="mi-cr-link" onClick={startAddCliente} disabled={saving || addUI.saving}>
                      + Agregar nuevo cliente
                    </button>
                  </div>

                  {/* TIPO VENTA */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_tipo_venta)}
                      onChange={(e) => updateFilter("id_tipo_venta", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Forma de venta *</option>
                      {(listsNorm.tipos_venta || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Forma de venta</label>
                  </div>

                  {/* CONTADO => MEDIO PAGO + (GUARDAR/FACTURAR) */}
                  {isContado && (
                    <>
                      <div className="fl-field">
                        <select
                          className="fl-input fl-select"
                          value={String(filters.id_medio_pago)}
                          onChange={(e) => updateFilter("id_medio_pago", e.target.value)}
                          disabled={saving}
                        >
                          <option value={NULL_OPTION}>Medio de pago *</option>
                          {(listsNorm.medios_pago || []).map((x) => (
                            <option key={x.id} value={String(x.id)}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                        <label className="fl-label">Medio de pago</label>
                      </div>

                      <div className="mi-card mi-card--full" style={{ padding: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 10, color: "var(--mi-text)" }}>Pago (Contado)</div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={`mit-btn ${accionContado === "guardar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                            onClick={() => setAccionContado("guardar")}
                            disabled={saving}
                            style={{ height: 40 }}
                          >
                            Guardar
                          </button>

                          <button
                            type="button"
                            className={`mit-btn ${accionContado === "facturar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                            onClick={() => setAccionContado("facturar")}
                            disabled={saving}
                            style={{ height: 40 }}
                          >
                            Facturar
                          </button>
                        </div>

                        <div style={{ marginTop: 10, fontSize: 12, color: "var(--mi-muted)", fontWeight: 400 }}>
                          {accionContado === "guardar" ? (
                            <>
                              * <b>Guardar</b>: se registra la venta y queda <b>pendiente de pago</b>.
                            </>
                          ) : (
                            <>
                              * <b>Facturar</b>: se registra la venta como <b>pago realizado</b>.
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* CORRIENTE => SOLO INFO (SIEMPRE GUARDAR) */}
                  {isCorriente && (
                    <div className="mi-card mi-card--full" style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--mi-text)" }}>En cuenta corriente</div>
                      <div style={{ fontSize: 12, color: "var(--mi-muted)" }}>
                        * Se registra la venta en <b>Cuenta Corriente</b> y queda <b>pendiente de pago</b>.
                      </div>
                    </div>
                  )}
                </div>

                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid"
                    style={{ width: "100%", height: 44 }}
                  >
                    {saving ? "Guardando..." : "Guardar venta"}
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
        />
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}
