// src/components/Ventas/modales/ModalNuevaVenta.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css";
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
function isBlank(v) {
  return String(v ?? "").trim() === "";
}
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================
   Período UI (MM-YYYY) <-> API (YYYY-MM)
========================= */
function isoToMMYYYY(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}-${y}`;
}
function mmYYYYToYYYYMM(mmYYYY) {
  const s = String(mmYYYY ?? "").trim();
  if (/^\d{2}[-/]\d{4}$/.test(s)) {
    const [mm, yyyy] = s.split(/[-/]/);
    return `${yyyy}-${mm}`;
  }
  if (/^\d{6}$/.test(s)) {
    const mm = s.slice(0, 2);
    const yyyy = s.slice(2);
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return "";
}
function normalizePeriodoInput(raw) {
  const digits = String(raw || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/* =========================
   Lists normalize
========================= */
function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;

  return {
    clientes: Array.isArray(l.clientes) ? l.clientes : [],
    detalles: Array.isArray(l.detalles) ? l.detalles : [],
    medios_pago: Array.isArray(l.medios_pago) ? l.medios_pago : [],
    tipos_venta: Array.isArray(l.tipos_venta) ? l.tipos_venta : [],
    cuentas_corrientes: Array.isArray(l.cuentas_corrientes) ? l.cuentas_corrientes : [],
  };
}

/* =========================
   ✅ Auth + API (JWT + X-Session)
========================= */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";

  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
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

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}\n${preview}`);
  }

  if (!res.ok) {
    const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

async function apiPostJson(url, payload) {
  const { token, sessionKey } = getAuthInfo();

  const headers = { "Content-Type": "application/json" };
  if (sessionKey) headers["X-Session"] = sessionKey;
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
function AddCatalogMiniModal({
  open,
  title,
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

/* =========================
   Validación detallada filas
========================= */
function describeLineProblem(r, idx1based) {
  const detId = Number(r.id_detalle);
  const detTxt = String(r.detalleText || "").trim();

  const qtyBlank = isBlank(r.cantidad);
  const priceBlank = isBlank(r.precio);

  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);

  const touched =
    detTxt !== "" ||
    String(r.id_detalle || "").trim() !== "" ||
    !qtyBlank ||
    !priceBlank ||
    safeNumber(r.cantidad) !== 0 ||
    safeNumber(r.precio) !== 0;

  if (!touched) return null;

  const issues = [];
  if (!(Number.isFinite(detId) && detId > 0)) {
    issues.push(detTxt ? `la descripción "${detTxt}" no está seleccionada del listado` : "falta la descripción (detalle)");
  }
  if (qtyBlank) issues.push("falta la cantidad");
  else if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser mayor a 0");

  if (priceBlank) issues.push("falta el precio");
  else if (!(Number.isFinite(price) && price > 0)) issues.push("el precio debe ser mayor a 0");

  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0 (revisá cantidad / precio)");

  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

/* =========================
   Theme helper (body.dark OR data-theme="oscuro")
========================= */
function isTemaOscuro() {
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
}

export default function ModalNuevaVenta({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH = `${BASE_URL}/api.php?action=ventas_crear_batch`;
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;

  // ✅ dark automático (data-theme="oscuro" o body.dark)
  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());

    // observa data-theme en <html> y class en <body>
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

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  /* =========================
     Lock scroll
  ========================= */
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /* =========================
     Listas normalizadas
  ========================= */
  const [localLists, setLocalLists] = useState(() => normalizeLists(lists));
  useEffect(() => setLocalLists(normalizeLists(lists)), [lists]);

  /* =========================
     Estado base
  ========================= */
  const [fecha, setFecha] = useState(todayISO());
  const [periodoUI, setPeriodoUI] = useState(isoToMMYYYY(todayISO()));

  const [filters, setFilters] = useState({
    id_tipo_venta: NULL_OPTION,
    id_medio_pago: NULL_OPTION,
    id_cuenta_corriente: NULL_OPTION,
    id_cliente: NULL_OPTION,
  });

  const [accionContado, setAccionContado] = useState("facturar"); // guardar | facturar

  // autocomplete cliente
  const [clienteInput, setClienteInput] = useState("");
  const [clienteFocus, setClienteFocus] = useState(false);
  const clienteInputRef = useRef(null);

  // filas
  const [rows, setRows] = useState(() => [
    {
      id: uid(),
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

  /* =========================
     Reset al abrir
  ========================= */
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const f = todayISO();
      setFecha(f);
      setPeriodoUI(isoToMMYYYY(f));

      setFilters({
        id_tipo_venta: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_cuenta_corriente: NULL_OPTION,
        id_cliente: NULL_OPTION,
      });

      setAccionContado("facturar");
      setClienteInput("");
      setClienteFocus(false);

      setRows([
        {
          id: uid(),
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
  }, [open]);

  /* =========================
     ESC cierra
  ========================= */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const updateFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  const onFechaChange = (iso) => {
    const v = String(iso || "").trim();
    setFecha(v);
    setPeriodoUI(isoToMMYYYY(v));
  };
  const onPeriodoChange = (raw) => setPeriodoUI(normalizePeriodoInput(raw));

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: uid(),
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
     Detalles: sugerencias
  ========================= */
  const detallesList = useMemo(() => localLists.detalles, [localLists.detalles]);
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
     Clientes: autocomplete
  ========================= */
  const clientesList = useMemo(() => localLists.clientes, [localLists.clientes]);

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

      const data = await apiPostJson(API_CATALOGO, {
        catalogo: meta.catalogo,
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el registro.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) throw new Error("El servidor no devolvió un ID válido.");

      setLocalLists((prev) => {
        const next = { ...prev };
        const listKey = field === "id_cliente" ? "clientes" : "detalles";
        const arr = Array.isArray(prev[listKey]) ? prev[listKey].slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) arr.push({ id: newId, nombre: newNombre });
        next[listKey] = arr;
        return next;
      });

      if (field === "id_cliente") {
        setFilters((p) => ({ ...p, id_cliente: String(newId) }));
        setClienteInput(newNombre);
        setTimeout(() => clienteInputRef.current?.focus(), 0);
      } else {
        const rowId = addUI.rowId;
        if (rowId) updateRow(rowId, { id_detalle: String(newId), detalleText: newNombre });
      }

      setAddUI({ open: false, field: null, rowId: null, text: "", saving: false });
      showToast("exito", `${meta.label} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando el registro.", 4200);
    }
  }, [API_CATALOGO, addUI, showToast]);

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
     Tipo venta => reglas UI
  ========================= */
  const tipoVentaSelected = useMemo(() => {
    const id = Number(filters.id_tipo_venta);
    if (!Number.isFinite(id) || id <= 0) return null;
    return (localLists.tipos_venta || []).find((x) => Number(x?.id) === id) || null;
  }, [filters.id_tipo_venta, localLists.tipos_venta]);

  const isContado = useMemo(() => isContadoTipoVenta(tipoVentaSelected), [tipoVentaSelected]);
  const isCorriente = useMemo(() => isCorrienteTipoVenta(tipoVentaSelected), [tipoVentaSelected]);

  useEffect(() => {
    if (!open) return;

    if (isCorriente) {
      setAccionContado("guardar");
      setFilters((p) => ({ ...p, id_medio_pago: NULL_OPTION }));
    }
    if (!isContado) setFilters((p) => ({ ...p, id_medio_pago: NULL_OPTION }));
    if (!isCorriente) setFilters((p) => ({ ...p, id_cuenta_corriente: NULL_OPTION }));
  }, [open, isContado, isCorriente]);

  /* =========================
     VALIDACIÓN
  ========================= */
  const validate = useCallback(() => {
    const cli = Number(filters.id_cliente);
    if (!Number.isFinite(cli) || cli <= 0) return { ok: false, msg: "Falta seleccionar un Cliente (obligatorio)." };

    const tv = Number(filters.id_tipo_venta);
    if (!Number.isFinite(tv) || tv <= 0) return { ok: false, msg: "Falta seleccionar la Forma de venta." };

    if (isContado) {
      const mp = Number(filters.id_medio_pago);
      if (!Number.isFinite(mp) || mp <= 0) return { ok: false, msg: "Venta Contado: falta seleccionar el Medio de pago." };
    }

    if (isCorriente) {
      const cc = Number(filters.id_cuenta_corriente);
      if (!Number.isFinite(cc) || cc <= 0) return { ok: false, msg: "Cuenta Corriente: falta seleccionar la Cuenta Corriente." };
    }

    const periodoApi = mmYYYYToYYYYMM(periodoUI) || (fecha ? String(fecha).slice(0, 7) : "");
    if (!/^\d{4}-\d{2}$/.test(periodoApi))
      return { ok: false, msg: "Período inválido. Usá MM-YYYY (ej: 02-2026)." };

    const problems = [];
    rowsCalc.forEach((r, idx) => {
      const p = describeLineProblem(r, idx + 1);
      if (p) problems.push(p);
    });

    const usableLines = rowsCalc.filter((r) => {
      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return Number.isFinite(det) && det > 0 && total > 0;
    });

    if (!usableLines.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas para guardar. ${msg}${extra}` };
      }
      return { ok: false, msg: "Cargá al menos 1 fila válida: elegí un Detalle y completá Cantidad/Precio." };
    }

    return { ok: true, warn: problems.length > 0, problems };
  }, [filters, fecha, periodoUI, isContado, isCorriente, rowsCalc]);

  const submit = async () => {
    if (saving) return;

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear el registro (o cancelá) antes de guardar.", 3200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 3800);
      return;
    }

    const periodoApi = mmYYYYToYYYYMM(periodoUI) || (fecha ? String(fecha).slice(0, 7) : "");
    const fechaApi = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : todayISO();

    const usableLines = rowsCalc.filter((r) => {
      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return Number.isFinite(det) && det > 0 && total > 0;
    });

    setSaving(true);
    showToast("cargando", "Guardando venta…", 12000);

    try {
      const payload = {
        fecha: fechaApi,
        periodo: periodoApi,

        id_cliente: Number(filters.id_cliente),
        id_tipo_venta: Number(filters.id_tipo_venta),

        id_medio_pago: isContado ? Number(filters.id_medio_pago) : null,
        id_cuenta_corriente: isCorriente ? Number(filters.id_cuenta_corriente) : null,

        accion_contado: isContado ? accionContado : null,

        items: usableLines.map((r) => ({
          id_detalle: Number(r.id_detalle),
          cantidad: Math.round(Number(r.cantidad) * 100) / 100,
          precio: Math.round(Number(r.precio) * 100) / 100,
          iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
          subtotal: Math.round(Number(r.subtotal) * 100) / 100,
          iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
          total: Math.round(Number(r.total) * 100) / 100,
          monto_total: Math.round(Number(r.total) * 100) / 100,
        })),
      };

      const data = await apiPostJson(API_BATCH, payload);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la venta.");

      showToast("exito", "Venta guardada.", 2600);
      onSaved?.(data);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando la venta.", 4500);
      setSaving(false);
    }
  };

  if (!open) return null;

  const miniOpen = addUI.open && ["id_cliente", "id_detalle"].includes(addUI.field);
  const miniTitle = addUI.field === "id_cliente" ? "Nuevo cliente" : "Nuevo detalle";

  const modalJSX = (
    <div
      className={[
        "mi-modal__overlay",
        "mi-modal__overlay--mov",
        dark ? "mi-modal__overlay--dark" : "",
      ].join(" ").trim()}
      onMouseDown={() => (!saving ? onClose?.() : null)}
    >
      <div
        className={[
          "mi-modal__container",
          "mi-modal__container--mov",
          dark ? "mi-modal--dark" : "",
        ].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header mi-modal__header--car">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Nueva Venta</h2>
            <p className="mi-modal__subtitle">Cargá varias filas y guardá todo junto.</p>
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
                <div className="mi-cr-center">Cantidad</div>
                <div className="mi-cr-center">Precio</div>
                <div className="mi-cr-center">% IVA</div>
                <div className="mi-cr-center">IVA</div>
                <div className="mi-cr-center">Total</div>
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
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--desc mi-cr-rel">
                        <input
                          className="fl-input"
                          placeholder="Escribí y seleccioná un detalle…"
                          value={r.detalleText}
                          onChange={(e) =>
                            updateRow(r.id, { detalleText: e.target.value, id_detalle: NULL_OPTION })
                          }
                          disabled={saving || addUI.open}
                          autoComplete="off"
                        />

                        {showSug && (
                          <ul className="mi-cr-suggest">
                            {suggestions.map((d) => (
                              <li
                                key={d.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  updateRow(r.id, { id_detalle: String(d.id), detalleText: String(d.nombre || "") });
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
                          + Agregar nuevo detalle
                        </button>
                      </div>

                      {/* Cantidad */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--qty mi-cr-center">
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
                        />
                      </div>

                      {/* Precio */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--price mi-cr-center">
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
                        />
                      </div>

                      {/* % IVA */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--iva mi-cr-center">
                        <select
                          className="fl-input fl-select fl-select-iva--car"
                          value={String(r.ivaPct)}
                          onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                          disabled={saving}
                        >
                          {IVA_OPTIONS.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* IVA monto */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto mi-cr-center">
                        <div className="mi-cr-money mi-cr-money--soft">{moneyARS(r.ivaMonto)}</div>
                      </div>

                      {/* Total */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--total mi-cr-center">
                        <div className="mi-cr-money mi-cr-money--strong">{moneyARS(r.total)}</div>
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

            {/* Filtros derecha */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos</div>

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
                      value={periodoUI}
                      onChange={(e) => onPeriodoChange(e.target.value)}
                      disabled={saving}
                    />
                    <label className="fl-label">Período</label>
                  </div>
                </div>
              </div>

              <div className="mi-cr-filters__body">
                {/* Cliente */}
                <div className="fl-field mi-cr-rel">
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

                  <button
                    type="button"
                    className="mi-cr-link"
                    onClick={startAddCliente}
                    disabled={saving || addUI.saving}
                  >
                    + Agregar nuevo cliente
                  </button>
                </div>

                {/* Tipo venta */}
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(filters.id_tipo_venta)}
                    onChange={(e) => updateFilter("id_tipo_venta", e.target.value)}
                    disabled={saving}
                  >
                    <option value={NULL_OPTION}>Forma de venta</option>
                    {(localLists.tipos_venta || []).map((x) => (
                      <option key={x.id} value={String(x.id)}>
                        {x.nombre}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Forma de venta</label>
                </div>

                {/* Medio pago (solo contado) */}
                {isContado && (
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_medio_pago)}
                      onChange={(e) => updateFilter("id_medio_pago", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Medio de pago</option>
                      {(localLists.medios_pago || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Medio de pago</label>
                  </div>
                )}

                {/* Cuenta corriente (solo corriente) */}
                {isCorriente && (
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.id_cuenta_corriente)}
                      onChange={(e) => updateFilter("id_cuenta_corriente", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Cuenta corriente</option>
                      {(localLists.cuentas_corrientes || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Cuenta corriente</label>
                  </div>
                )}

                {/* Acción contado */}
                {isContado && (
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={accionContado}
                      onChange={(e) => setAccionContado(e.target.value)}
                      disabled={saving}
                    >
                      <option value="facturar">Facturar</option>
                      <option value="guardar">Guardar</option>
                    </select>
                    <label className="fl-label">Acción</label>
                  </div>
                )}

                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid mit-btn--block"
                  >
                    {saving ? "Guardando..." : "Guardar venta"}
                  </button>

                  <button
                    type="button"
                    onClick={() => (!saving ? onClose?.() : null)}
                    disabled={saving}
                    className="mit-btn mit-btn--ghost mit-btn--block"
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
          dark={dark}
        />
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}
