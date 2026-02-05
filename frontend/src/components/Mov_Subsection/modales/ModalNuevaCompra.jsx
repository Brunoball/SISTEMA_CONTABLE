// src/components/Compras/modales/ModalNuevaCompra.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ✅ MISMA estética/clases
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";
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
function prettyBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
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
  proveedores: [],
  medios_pago: [],
  cuentas_corrientes: [],
  detalles: [],
};

function normalizeIncomingLists(lists) {
  const l = lists && typeof lists === "object" ? lists : {};
  const src = l.listas && typeof l.listas === "object" ? l.listas : l;

  return {
    periodos: Array.isArray(src.periodos) ? src.periodos : [],
    clasificaciones: Array.isArray(src.clasificaciones) ? src.clasificaciones : [],
    proveedores: Array.isArray(src.proveedores) ? src.proveedores : [],
    medios_pago: Array.isArray(src.medios_pago) ? src.medios_pago : [],
    cuentas_corrientes: Array.isArray(src.cuentas_corrientes) ? src.cuentas_corrientes : [],
    detalles: Array.isArray(src.detalles) ? src.detalles : [],
  };
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
   Mini Modal: alta rápida (Detalle)
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

/* =========================
   Modal
========================= */
export default function ModalNuevaCompra({
  open,
  lists,
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

  // ✅ lock scroll mientras está abierto
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // listas locales
  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeIncomingLists(lists),
  }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const listsNorm = useMemo(() => localLists, [localLists]);

  // estado principal
  const [fecha, setFecha] = useState(todayISO());
  const [periodo, setPeriodo] = useState(
    normalizePeriodoToMMYYYY(periodoDefault || "") || periodoFromISODate(todayISO())
  );

  const [compra, setCompra] = useState({
    id_clasificacion: NULL_OPTION,
    id_proveedor: NULL_OPTION,
    proveedor_nombre: "",
    proveedor_cuit: "",

    forma_compra: "contado", // "contado" | "cuenta_corriente"
    id_cuenta_corriente: NULL_OPTION,
    id_medio_pago: NULL_OPTION,

    cheque_tipo: "",
    cheque_numero: "",
    cheque_banco: "",
    cheque_fecha_emision: "",
    cheque_fecha_cobro: "",
    cheque_titular: "",
    cheque_cuit: "",
  });

  // items tipo planilla
  const [items, setItems] = useState(() => [
    {
      id: crypto?.randomUUID?.() || String(Date.now()),
      detalle: "",
      cantidad: 1,
      precio: 0,
      ivaPct: 0,
    },
  ]);

  const [saving, setSaving] = useState(false);
  const closeBtnRef = useRef(null);

  // autocomplete proveedor
  const proveedorInputRef = useRef(null);
  const [provFocus, setProvFocus] = useState(false);
  const [provInput, setProvInput] = useState("");

  // factura
  const fileRef = useRef(null);
  const [facturaFile, setFacturaFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // ✅ Detalle autocomplete por fila
  const [detalleFocusRow, setDetalleFocusRow] = useState(null);

  // ✅ Alta rápida detalle (mini modal)
  const [addDetalleUI, setAddDetalleUI] = useState({
    open: false,
    text: "",
    saving: false,
    rowId: null,
  });

  // reset al abrir
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

      setCompra({
        id_clasificacion: NULL_OPTION,
        id_proveedor: NULL_OPTION,
        proveedor_nombre: "",
        proveedor_cuit: "",

        forma_compra: "contado",
        id_cuenta_corriente: NULL_OPTION,
        id_medio_pago: NULL_OPTION,

        cheque_tipo: "",
        cheque_numero: "",
        cheque_banco: "",
        cheque_fecha_emision: "",
        cheque_fecha_cobro: "",
        cheque_titular: "",
        cheque_cuit: "",
      });

      setItems([
        {
          id: crypto?.randomUUID?.() || String(Date.now()),
          detalle: "",
          cantidad: 1,
          precio: 0,
          ivaPct: 0,
        },
      ]);

      setFacturaFile(null);
      setDragOver(false);
      setProvInput("");
      setProvFocus(false);

      setDetalleFocusRow(null);
      setAddDetalleUI({ open: false, text: "", saving: false, rowId: null });

      setSaving(false);

      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, periodoDefault]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
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

  // items CRUD
  const addRow = () => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
        detalle: "",
        cantidad: 1,
        precio: 0,
        ivaPct: 0,
      },
    ]);
  };
  const removeRow = (id) => {
    setItems((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : prev;
    });
  };
  const updateRow = (id, patch) => {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  // cálculo items
  const itemsCalc = useMemo(() => {
    return items.map((r) => {
      const cantidad = Math.max(0, safeNumber(r.cantidad));
      const precio = Math.max(0, safeNumber(r.precio));
      const ivaPct = Math.max(0, safeNumber(r.ivaPct));
      const subtotal = cantidad * precio;
      const ivaMonto = subtotal * (ivaPct / 100);
      const total = subtotal + ivaMonto;
      return { ...r, subtotal, ivaMonto, total };
    });
  }, [items]);

  const resumen = useMemo(() => {
    const subtotal = itemsCalc.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const iva = itemsCalc.reduce((acc, r) => acc + (r.ivaMonto || 0), 0);
    const total = itemsCalc.reduce((acc, r) => acc + (r.total || 0), 0);
    return { subtotal, iva, total };
  }, [itemsCalc]);

  /* =========================
     Autocomplete proveedores
  ========================= */
  const proveedoresList = useMemo(
    () => (Array.isArray(listsNorm.proveedores) ? listsNorm.proveedores : []),
    [listsNorm.proveedores]
  );

  const filteredProveedores = useMemo(() => {
    const q = provInput.trim().toLowerCase();
    if (!provFocus || q.length < 1) return [];
    return proveedoresList
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [proveedoresList, provInput, provFocus]);

  const handleProveedorInputChange = (e) => {
    const value = e.target.value;
    setProvInput(value);
    setCompra((p) => ({
      ...p,
      id_proveedor: NULL_OPTION,
      proveedor_nombre: value,
    }));
  };

  const handleSelectProveedor = (prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    const cuit = String(
      prov?.cuit ?? prov?.cuit_proveedor ?? prov?.proveedor_cuit ?? prov?.cuil ?? ""
    ).trim();

    setProvInput(nombre);
    setCompra((p) => ({
      ...p,
      id_proveedor: prov?.id != null ? String(prov.id) : NULL_OPTION,
      proveedor_nombre: nombre,
      proveedor_cuit: cuit || p.proveedor_cuit,
    }));
    setProvFocus(false);
  };

  /* =========================
     Forma compra + medio pago
  ========================= */
  const medioPagoLabel = useMemo(() => {
    const id = Number(compra.id_medio_pago);
    const mp = (listsNorm.medios_pago || []).find((x) => Number(x?.id) === id);
    return String(mp?.nombre ?? "").toLowerCase();
  }, [compra.id_medio_pago, listsNorm.medios_pago]);

  const isCheque =
    medioPagoLabel.includes("cheque") && !medioPagoLabel.includes("e") && medioPagoLabel.trim() !== "";
  const isECheq = medioPagoLabel.includes("e") && medioPagoLabel.includes("cheq");

  useEffect(() => {
    if (compra.forma_compra !== "contado") {
      setCompra((p) => ({ ...p, cheque_tipo: "" }));
      return;
    }
    if (isECheq) setCompra((p) => ({ ...p, cheque_tipo: "ECHEQ" }));
    else if (isCheque) setCompra((p) => ({ ...p, cheque_tipo: "CHEQUE" }));
    else setCompra((p) => ({ ...p, cheque_tipo: "" }));
  }, [isCheque, isECheq, compra.forma_compra]);

  /* =========================
     ✅ Detalles: autocomplete + alta rápida
  ========================= */
  const detallesList = useMemo(
    () => (Array.isArray(listsNorm.detalles) ? listsNorm.detalles : []),
    [listsNorm.detalles]
  );

  const filteredDetallesByRow = useCallback(
    (row) => {
      const q = String(row?.detalle || "").trim().toLowerCase();
      if (!q) return [];
      return detallesList
        .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
        .slice(0, 25);
    },
    [detallesList]
  );

  const handleSelectDetalleRow = useCallback((rowId, det) => {
    const nombre = String(det?.nombre ?? "").trim();
    updateRow(rowId, { detalle: nombre });
    setDetalleFocusRow(null);
  }, []);

  const startAddDetalleForRow = useCallback((rowId) => {
    setDetalleFocusRow(null);
    setAddDetalleUI({ open: true, text: "", saving: false, rowId });
  }, []);

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
      const token = localStorage.getItem("token") || "";
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

  const guardarNuevoDetalle = useCallback(async () => {
    const nombre = String(addDetalleUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un detalle antes de guardar.", 2600);
      return;
    }

    setAddDetalleUI((p) => ({ ...p, saving: true }));
    showToast("cargando", "Creando detalle…", 12000);

    try {
      let idUsuario = 0;
      try {
        const u = JSON.parse(localStorage.getItem("usuario") || "null");
        const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
        if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
      } catch {}

      // ✅ si tu backend usa otro action, cambiá acá
      const data = await apiPostJson(`${API}?action=catalogo_crear`, {
        catalogo: "detalles",
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el detalle.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error("El servidor no devolvió un ID válido del detalle creado.");
      }

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev.detalles) ? prev.detalles.slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next.detalles = arr;
        return next;
      });

      if (addDetalleUI.rowId) {
        updateRow(addDetalleUI.rowId, { detalle: newNombre });
      }

      setAddDetalleUI({ open: false, text: "", saving: false, rowId: null });
      showToast("exito", `Detalle creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddDetalleUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando detalle.", 4200);
    }
  }, [API, addDetalleUI, apiPostJson, showToast]);

  /* =========================
     Validación
  ========================= */
  const validate = useCallback(() => {
    const provOk =
      (Number(compra.id_proveedor) > 0 && String(compra.proveedor_nombre).trim() !== "") ||
      String(provInput).trim() !== "" ||
      String(compra.proveedor_nombre).trim() !== "";

    if (!provOk) return { ok: false, msg: "Seleccioná un proveedor (obligatorio)." };

    if (!(Number(compra.id_clasificacion) > 0)) {
      return { ok: false, msg: "Seleccioná la clasificación (costo fijo/variable)." };
    }

    const usableItems = itemsCalc.filter((r) => {
      const total = Number(r.total || 0);
      const det = String(r.detalle || "").trim();
      return det.length > 0 && total > 0;
    });
    if (!usableItems.length) {
      return { ok: false, msg: "Cargá al menos 1 ítem con detalle y total > 0." };
    }

    if (compra.forma_compra === "contado" && !(Number(compra.id_medio_pago) > 0)) {
      return { ok: false, msg: "Seleccioná un medio de pago (contado)." };
    }

    const wantCheque = compra.forma_compra === "contado" && (isCheque || isECheq);
    if (wantCheque) {
      if (!String(compra.cheque_numero || "").trim())
        return { ok: false, msg: "Completá el número de cheque / e-cheq." };
      if (!String(compra.cheque_banco || "").trim())
        return { ok: false, msg: "Completá el banco del cheque / e-cheq." };
      if (!String(compra.cheque_fecha_emision || "").trim())
        return { ok: false, msg: "Completá la fecha de emisión del cheque / e-cheq." };
      if (!String(compra.cheque_fecha_cobro || "").trim())
        return { ok: false, msg: "Completá la fecha de cobro/pago del cheque / e-cheq." };
    }

    return { ok: true };
  }, [compra, isCheque, isECheq, itemsCalc, provInput]);

  /* =========================
     Submit
  ========================= */
  const submit = async () => {
    if (saving) return;

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 3600);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando compra…", 12000);

    try {
      const fechaToSend = toNullableDateISO(fecha);
      const periodoToSend = toNullablePeriodoMMYYYY(periodo, fechaToSend || todayISO());

      const usableItems = itemsCalc
        .filter((r) => String(r.detalle || "").trim().length > 0 && Number(r.total || 0) > 0)
        .map((r) => ({
          detalle: String(r.detalle || "").trim(),
          cantidad: Math.round(Number(r.cantidad) * 100) / 100,
          precio: Math.round(Number(r.precio) * 100) / 100,
          iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
          subtotal: Math.round(Number(r.subtotal) * 100) / 100,
          iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
          total: Math.round(Number(r.total) * 100) / 100,
        }));

      const compraPayload = {
        fecha: fechaToSend,
        periodo: periodoToSend,

        tipo_movimiento: "Salida",

        id_clasificacion: toNullableId(compra.id_clasificacion),

        id_proveedor: toNullableId(compra.id_proveedor),
        proveedor: String(compra.proveedor_nombre || provInput || "").trim(),
        proveedor_cuit: String(compra.proveedor_cuit || "").trim() || null,

        forma_compra: compra.forma_compra,
        id_cuenta_corriente:
          compra.forma_compra === "cuenta_corriente" ? toNullableId(compra.id_cuenta_corriente) : null,
        id_medio_pago: compra.forma_compra === "contado" ? toNullableId(compra.id_medio_pago) : null,

        monto_total: Math.round(Number(resumen.total) * 100) / 100,

        cheque:
          compra.forma_compra === "contado" && (isCheque || isECheq)
            ? {
                tipo: compra.cheque_tipo || (isECheq ? "ECHEQ" : "CHEQUE"),
                numero: String(compra.cheque_numero || "").trim(),
                banco: String(compra.cheque_banco || "").trim(),
                fecha_emision: String(compra.cheque_fecha_emision || "").trim(),
                fecha_cobro: String(compra.cheque_fecha_cobro || "").trim(),
                titular: String(compra.cheque_titular || "").trim(),
                cuit: String(compra.cheque_cuit || "").trim(),
              }
            : null,
      };

      await onSaveCompra?.({
        compra: compraPayload,
        items: usableItems,
        facturaFile: facturaFile || null,
      });

      showToast("exito", "Compra guardada.", 2600);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando compra.", 4500);
      setSaving(false);
    }
  };

  if (!open) return null;

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
            <h2 className="mi-modal__title">Nueva Compra</h2>
            <p className="mi-modal__subtitle">
              Ítems a la izquierda + datos de compra a la derecha (proveedor, forma, factura).
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

        <div className="mi-modal__content mi-modal__content--car">
          <div className="mi-cr-grid">
            {/* =========================
                Izquierda: planilla items
            ========================= */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__head">
                <div>Detalle</div>
                <div style={{ textAlign: "center" }}>Cant.</div>
                <div style={{ textAlign: "center" }}>Precio</div>
                <div style={{ textAlign: "center" }}>% IVA</div>
                <div style={{ textAlign: "center" }}>IVA</div>
                <div style={{ textAlign: "center" }}>Total</div>
                <div />
              </div>

              <div className="mi-cr-table__rows">
                {itemsCalc.map((r) => (
                  <div key={r.id} className="mi-cr-row mi-cr-row--car">
                    {/* ✅ Detalle + Autocomplete + "+ Agregar nuevo detalle" */}
                    <div className="mi-cr-cell mi-cr-col mi-cr-col--desc" style={{ position: "relative" }}>
                      <input
                        className="fl-input"
                        placeholder="Detalle del ítem…"
                        value={r.detalle}
                        onChange={(e) => updateRow(r.id, { detalle: e.target.value })}
                        onFocus={() => setDetalleFocusRow(r.id)}
                        onBlur={() => setTimeout(() => setDetalleFocusRow(null), 120)}
                        disabled={saving || addDetalleUI.open}
                        autoComplete="off"
                        style={{ height: 38 }}
                      />

                      {detalleFocusRow === r.id && filteredDetallesByRow(r).length > 0 && (
                        <ul className="mi-cr-suggest">
                          {filteredDetallesByRow(r).map((d) => (
                            <li
                              key={d.id}
                              className="mi-cr-suggest__item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectDetalleRow(r.id, d);
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
                        className="mi-cr-link"
                        onClick={() => startAddDetalleForRow(r.id)}
                        disabled={saving || addDetalleUI.saving}
                      >
                        + Agregar nuevo detalle
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
                        className="fl-input fl-select fl-select-iva--car  fl-select-iva--compra"
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
                      <div style={{ textAlign: "center", paddingTop: 10 }}>
                        {moneyARS(r.ivaMonto)}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="mi-cr-cell mi-cr-col mi-cr-col--total">
                      <div style={{ textAlign: "center", paddingTop: 10 }}>
                        {moneyARS(r.total)}
                      </div>
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
                ))}
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

            {/* =========================
                Derecha: datos compra
            ========================= */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos de compra</div>

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
                <div className="fl-grid" style={{ gridTemplateColumns: "1fr" }}>
                  {/* Clasificación */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(compra.id_clasificacion)}
                      onChange={(e) => setCompra((p) => ({ ...p, id_clasificacion: e.target.value }))}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Clasificación (obligatoria)</option>
                      {(listsNorm.clasificaciones || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Clasificación</label>
                  </div>

                  {/* Proveedor autocomplete */}
                  <div className="fl-field" style={{ position: "relative" }}>
                    <input
                      ref={proveedorInputRef}
                      className="fl-input"
                      placeholder=" "
                      value={provInput}
                      onChange={handleProveedorInputChange}
                      onFocus={() => setProvFocus(true)}
                      onBlur={() => setTimeout(() => setProvFocus(false), 120)}
                      disabled={saving}
                      autoComplete="off"
                    />
                    <label className="fl-label">Proveedor (obligatorio)</label>

                    {provFocus && filteredProveedores.length > 0 && (
                      <ul className="mi-cr-suggest">
                        {filteredProveedores.map((p) => (
                          <li
                            key={p.id}
                            className="mi-cr-suggest__item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectProveedor(p);
                            }}
                          >
                            {p.nombre}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* CUIT proveedor */}
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={compra.proveedor_cuit}
                      onChange={(e) => setCompra((p) => ({ ...p, proveedor_cuit: e.target.value }))}
                      disabled={saving}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <label className="fl-label">CUIT Proveedor</label>
                  </div>

                  {/* Forma compra */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={compra.forma_compra}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCompra((p) => ({
                          ...p,
                          forma_compra: next,
                          id_medio_pago: next === "cuenta_corriente" ? NULL_OPTION : p.id_medio_pago,
                        }));
                      }}
                      disabled={saving}
                    >
                      <option value="contado">Contado</option>
                      <option value="cuenta_corriente">Cuenta Corriente</option>
                    </select>
                    <label className="fl-label">Forma de compra</label>
                  </div>

                  {/* Cuenta corriente */}
                  {compra.forma_compra === "cuenta_corriente" && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(compra.id_cuenta_corriente)}
                        onChange={(e) => setCompra((p) => ({ ...p, id_cuenta_corriente: e.target.value }))}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Cuenta corriente (opcional)</option>
                        {(listsNorm.cuentas_corrientes || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Cuenta Corriente</label>
                    </div>
                  )}

                  {/* Medio pago */}
                  {compra.forma_compra === "contado" && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(compra.id_medio_pago)}
                        onChange={(e) => setCompra((p) => ({ ...p, id_medio_pago: e.target.value }))}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Medio de pago (obligatorio)</option>
                        {(listsNorm.medios_pago || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>
                  )}

                  {/* Datos cheque / e-cheq */}
                  {compra.forma_compra === "contado" && (isCheque || isECheq) && (
                    <div className="mi-file" style={{ marginTop: 4 }}>
                      <div className="mi-file__row">
                        <div>
                          <p className="mi-file__title">Datos {isECheq ? "e-Cheq" : "Cheque"}</p>
                          <div className="mi-file__hint">
                            Estos campos se muestran solo si el medio de pago es cheque/e-cheq.
                          </div>
                        </div>
                      </div>

                      <div className="fl-grid" style={{ marginTop: 10 }}>
                        <div className="fl-field">
                          <input
                            className="fl-input"
                            placeholder=" "
                            value={compra.cheque_numero}
                            onChange={(e) => setCompra((p) => ({ ...p, cheque_numero: e.target.value }))}
                            disabled={saving}
                            autoComplete="off"
                          />
                          <label className="fl-label">Número</label>
                        </div>

                        <div className="fl-field">
                          <input
                            className="fl-input"
                            placeholder=" "
                            value={compra.cheque_banco}
                            onChange={(e) => setCompra((p) => ({ ...p, cheque_banco: e.target.value }))}
                            disabled={saving}
                            autoComplete="off"
                          />
                          <label className="fl-label">Banco</label>
                        </div>

                        <div className="fl-field">
                          <input
                            className="fl-input"
                            type="date"
                            value={compra.cheque_fecha_emision}
                            onChange={(e) => setCompra((p) => ({ ...p, cheque_fecha_emision: e.target.value }))}
                            disabled={saving}
                          />
                          <label className="fl-label">Fecha emisión</label>
                        </div>

                        <div className="fl-field">
                          <input
                            className="fl-input"
                            type="date"
                            value={compra.cheque_fecha_cobro}
                            onChange={(e) => setCompra((p) => ({ ...p, cheque_fecha_cobro: e.target.value }))}
                            disabled={saving}
                          />
                          <label className="fl-label">Fecha cobro/pago</label>
                        </div>

                        <div className="fl-field">
                          <input
                            className="fl-input"
                            placeholder=" "
                            value={compra.cheque_titular}
                            onChange={(e) => setCompra((p) => ({ ...p, cheque_titular: e.target.value }))}
                            disabled={saving}
                            autoComplete="off"
                          />
                          <label className="fl-label">Titular (opcional)</label>
                        </div>

                        <div className="fl-field">
                          <input
                            className="fl-input"
                            placeholder=" "
                            value={compra.cheque_cuit}
                            onChange={(e) => setCompra((p) => ({ ...p, cheque_cuit: e.target.value }))}
                            disabled={saving}
                            autoComplete="off"
                            inputMode="numeric"
                          />
                          <label className="fl-label">CUIT (opcional)</label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* =========================
                      Adjuntar factura (opcional)
                  ========================= */}
                  <div className="mi-file">
                    <div className="mi-file__row">
                      <div>
                        <p className="mi-file__title">Adjuntar factura (opcional)</p>
                        <div className="mi-file__hint">PDF o imagen (JPG/PNG). Máx. 10MB</div>
                      </div>

                      <div className="mi-file__actions">
                        <button
                          type="button"
                          className="mi-filebtn mi-filebtn--primary"
                          onClick={() => fileRef.current?.click()}
                          disabled={saving}
                        >
                          Elegir archivo
                        </button>

                        {facturaFile && (
                          <button
                            type="button"
                            className="mi-filebtn"
                            onClick={() => setFacturaFile(null)}
                            disabled={saving}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      ref={fileRef}
                      className="mi-file__input"
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        e.target.value = "";
                        setFacturaFile(f);
                      }}
                    />

                    <div
                      className={`mi-drop ${dragOver ? "is-drag" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => fileRef.current?.click()}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const f = e.dataTransfer.files?.[0] || null;
                        setFacturaFile(f);
                      }}
                    >
                      <div className="mi-drop__icon">📎</div>
                      <div className="mi-drop__text">
                        {facturaFile ? "Archivo seleccionado" : "Arrastrá la factura acá"}
                      </div>
                      <div className="mi-drop__sub">
                        {facturaFile ? "o tocá para cambiar" : "o tocá para elegir un archivo"}
                      </div>
                    </div>

                    {facturaFile && (
                      <div className="mi-filemeta">
                        <div className="mi-filemeta__name" title={facturaFile.name}>
                          {facturaFile.name}
                        </div>
                        <div className="mi-filemeta__info">{prettyBytes(facturaFile.size)}</div>

                        <button
                          type="button"
                          className="mi-filemeta__remove"
                          title="Quitar archivo"
                          onClick={() => setFacturaFile(null)}
                          disabled={saving}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid"
                    style={{ width: "100%", height: 44 }}
                  >
                    {saving ? "Guardando..." : "Guardar compra"}
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

        {/* ✅ Mini modal para crear Detalle */}
        <AddCatalogMiniModal
          open={addDetalleUI.open}
          title="Nuevo detalle"
          value={addDetalleUI.text}
          saving={addDetalleUI.saving}
          onChange={(txt) => setAddDetalleUI((p) => ({ ...p, text: txt }))}
          onCancel={() => {
            if (addDetalleUI.saving) return;
            setAddDetalleUI({ open: false, text: "", saving: false, rowId: null });
          }}
          onSave={guardarNuevoDetalle}
        />
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}
