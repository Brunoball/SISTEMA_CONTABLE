import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faBasketShopping,
} from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isBlank(v) {
  return String(v ?? "").trim() === "";
}
function moneyARS(v) {
  try {
    return Number(v || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${Number(v || 0).toFixed(2)}`;
  }
}
function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$ ${n.toFixed(2)}`;
  }
}
function parseMoneyInputARS(v) {
  if (v == null) return 0;

  let s = String(v).trim();
  if (!s) return 0;

  s = s.replace(/\$/g, "").replace(/\s+/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}
function uid() {
  return (
    crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function getDetalleId(d) {
  const cand =
    d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getProveedorId(p) {
  const cand =
    p?.id ??
    p?.id_proveedor ??
    p?.idProveedor ??
    p?.proveedor_id ??
    p?.idproveedor ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getMedioPagoId(mp) {
  const cand =
    mp?.id ??
    mp?.id_medio_pago ??
    mp?.medio_pago_id ??
    mp?.idMedioPago ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildEmptyRow() {
  return {
    id: uid(),
    id_detalle: NULL_OPTION,
    detalleText: "",
    cantidad: 1,
    precio: 0,
    precioDraft: "",
    precioFocused: false,
    ivaPct: 0,
  };
}

const SAFE_LISTS = { proveedores: [], detalles: [], medios_pago: [] };

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);
  const mediosPago = pick("medios_pago").length
    ? pick("medios_pago")
    : pick("mediosPago").length
    ? pick("mediosPago")
    : pick("medios").length
    ? pick("medios")
    : pick("medios_de_pago");

  return {
    proveedores: pick("proveedores"),
    detalles: pick("detalles"),
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
  };
}

function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  const token = localStorage.getItem("token") || "";
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
  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}\n${preview}`);
  }
}

function buildAuthHeaders(isJson = true) {
  const { token, sessionKey } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiPostJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(true),
    body: JSON.stringify(payload ?? {}),
  });
  return await parseJsonOrThrow(res);
}
async function apiPostForm(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(false),
    body: formData,
  });
  return await parseJsonOrThrow(res);
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

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
  if (!(Number.isFinite(detId) && detId > 0))
    issues.push(
      detTxt
        ? `el detalle "${detTxt}" no está seleccionado del listado`
        : "falta el detalle"
    );
  if (qtyBlank) issues.push("falta la cantidad");
  else if (!(Number.isFinite(qty) && qty > 0))
    issues.push("la cantidad debe ser > 0");
  if (priceBlank) issues.push("falta el precio");
  else if (!(Number.isFinite(price) && price > 0))
    issues.push("el precio debe ser > 0");
  if (!(Number.isFinite(total) && total > 0))
    issues.push("el total queda en 0 (revisá cantidad/precio)");
  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

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
    const h = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onSave?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
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
    </div>,
    document.body
  );
}

export default function ModalNuevaCompra({
  open,
  lists,
  onClose,
  onToast,
  onSaved,
}) {
  const API_BATCH = `${BASE_URL}/api.php?action=compras_crear_batch`;
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;
  const API_UPLOAD_LINK = `${BASE_URL}/api.php?action=compras_comprobantes_vincular_movimientos_lote_upload`;

  const showToast = useCallback(
    (tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur),
    [onToast]
  );

  const [dark, setDark] = useState(isTemaOscuro);
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const o2 = new MutationObserver(update);
    if (document.body)
      o2.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const p = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = p;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeLists(lists),
  }));
  useEffect(() => setLocalLists({ ...SAFE_LISTS, ...normalizeLists(lists) }), [lists]);

  const mediosPagoList = useMemo(
    () => (Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );
  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );
  const proveedoresList = useMemo(
    () => (Array.isArray(localLists.proveedores) ? localLists.proveedores : []),
    [localLists.proveedores]
  );

  const [fecha, setFecha] = useState(todayISO);
  const [filters, setFilters] = useState({
    forma: NULL_OPTION,
    id_medio_pago: NULL_OPTION,
    id_proveedor: NULL_OPTION,
  });
  const [provInput, setProvInput] = useState("");
  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  const [addUI, setAddUI] = useState({
    open: false,
    kind: null,
    rowId: null,
    text: "",
    saving: false,
  });
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);
  const fechaInputRef = useRef(null);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (!wasOpen && open) {
      setFecha(todayISO());
      setFilters({
        forma: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_proveedor: NULL_OPTION,
      });
      setProvInput("");
      setRows([buildEmptyRow()]);
      setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
      setSaving(false);
      setArchivoAdjunto(null);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  const updateFilter = useCallback((k, v) => setFilters((p) => ({ ...p, [k]: v })), []);

  const handleOpenDate = useCallback(
    (e) => {
      if (saving) return;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const input = fechaInputRef.current;
      if (!input) return;
      input.focus();
      try {
        if (typeof input.showPicker === "function") input.showPicker();
        else input.click();
      } catch {
        input.click();
      }
    },
    [saving]
  );

  const addRow = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback((id) => {
    setRows((p) => {
      const n = p.filter((r) => r.id !== id);
      return n.length ? n : p;
    });
  }, []);
  const updateRow = useCallback((id, patch) => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /* ── Handlers Proveedor con GlobalAutocomplete ── */
  const handleProveedorInputChange = useCallback((val) => {
    setProvInput(val);
    setFilters((p) => ({ ...p, id_proveedor: NULL_OPTION }));
  }, []);

  const handleSelectProveedor = useCallback((prov) => {
    setProvInput(String(prov?.nombre ?? "").trim());
    setFilters((p) => ({
      ...p,
      id_proveedor:
        getProveedorId(prov) != null ? String(getProveedorId(prov)) : NULL_OPTION,
    }));
  }, []);

  /* ── Mini modal handlers ── */
  const startAddDetalleForRow = useCallback(
    (rowId) => {
      if (saving) return;
      setAddUI({ open: true, kind: "detalles", rowId, text: "", saving: false });
    },
    [saving]
  );
  const startAddProveedor = useCallback(() => {
    if (saving) return;
    setAddUI({
      open: true,
      kind: "proveedores",
      rowId: null,
      text: provInput || "",
      saving: false,
    });
  }, [saving, provInput]);
  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
  }, [addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }
    const kind = addUI.kind;
    if (!kind) return;
    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${kind === "detalles" ? "detalle" : "proveedor"}…`, 12000);
    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(API_CATALOGO, { catalogo: kind, nombre, idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear.");
      const item = data?.item || {};
      const newId =
        kind === "detalles"
          ? getDetalleId(item) ?? Number(item?.id)
          : getProveedorId(item) ?? Number(item?.id);
      const newNombre = String(item?.nombre ?? "").trim() || nombre;
      if (!Number.isFinite(Number(newId)) || Number(newId) <= 0) {
        throw new Error("El servidor no devolvió un ID válido.");
      }
      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[kind]) ? prev[kind].slice() : [];
        const already = arr.some((x) => {
          const xid = kind === "detalles" ? getDetalleId(x) : getProveedorId(x);
          return Number(xid) === Number(newId);
        });
        if (!already) arr.push({ id: Number(newId), nombre: newNombre });
        next[kind] = arr;
        return next;
      });
      if (kind === "detalles" && addUI.rowId) {
        updateRow(addUI.rowId, { id_detalle: String(newId), detalleText: newNombre });
      }
      if (kind === "proveedores") {
        updateFilter("id_proveedor", String(newId));
        setProvInput(newNombre);
      }
      setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
      showToast(
        "exito",
        `${kind === "detalles" ? "Detalle" : "Proveedor"} creado: "${newNombre}"`,
        2600
      );
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.", 4200);
    }
  }, [API_CATALOGO, addUI, showToast, updateRow, updateFilter]);

  const rowsCalc = useMemo(
    () =>
      rows.map((r) => {
        const cantidad = Math.max(0, safeNumber(r.cantidad));
        const precio = Math.max(0, safeNumber(r.precio));
        const ivaPct = Math.max(0, safeNumber(r.ivaPct));
        const subtotal = cantidad * precio;
        const ivaMonto = subtotal * (ivaPct / 100);
        const total = subtotal + ivaMonto;
        return { ...r, subtotal, ivaMonto, total };
      }),
    [rows]
  );

  const resumen = useMemo(
    () => ({
      subtotal: rowsCalc.reduce((a, r) => a + (r.subtotal || 0), 0),
      iva: rowsCalc.reduce((a, r) => a + (r.ivaMonto || 0), 0),
      total: rowsCalc.reduce((a, r) => a + (r.total || 0), 0),
    }),
    [rowsCalc]
  );

  const isContado = useMemo(() => String(filters.forma) === "CONTADO", [filters.forma]);
  const isCorriente = useMemo(
    () => String(filters.forma) === "CUENTA_CORRIENTE",
    [filters.forma]
  );

  useEffect(() => {
    if (!open) return;
    setFilters((prev) => {
      const forma = String(prev.forma || "");
      if (forma === "CUENTA_CORRIENTE" && prev.id_medio_pago !== NULL_OPTION) {
        return { ...prev, id_medio_pago: NULL_OPTION };
      }
      return prev;
    });
  }, [open, isCorriente]);

  const validate = useCallback(() => {
    const provId = Number(filters.id_proveedor);
    const provTxt = String(provInput || "").trim();
    if (!((Number.isFinite(provId) && provId > 0) || provTxt.length > 0)) {
      return { ok: false, msg: "Falta seleccionar un Proveedor (obligatorio)." };
    }
    if (!["CONTADO", "CUENTA_CORRIENTE"].includes(String(filters.forma))) {
      return {
        ok: false,
        msg: "Falta seleccionar el Tipo de compra (Contado / Cuenta Corriente).",
      };
    }
    if (isContado) {
      const mp = Number(filters.id_medio_pago);
      if (!Number.isFinite(mp) || mp <= 0) {
        return { ok: false, msg: "Compra Contado: falta seleccionar el Medio de pago." };
      }
    }
    const problems = [];
    rowsCalc.forEach((r, i) => {
      const p = describeLineProblem(r, i + 1);
      if (p) problems.push(p);
    });
    const usable = rowsCalc.filter(
      (r) =>
        Number.isFinite(Number(r.id_detalle)) &&
        Number(r.id_detalle) > 0 &&
        Number(r.total || 0) > 0
    );
    if (!usable.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return {
        ok: false,
        msg: "Cargá al menos 1 fila válida (Detalle + Cantidad + Precio).",
      };
    }
    return { ok: true, warn: problems.length > 0 };
  }, [filters, provInput, isContado, rowsCalc]);

  const subirYVincularArchivo = useCallback(
    async (idsMovimientos, archivo) => {
      if (!archivo || !idsMovimientos?.length) return null;
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", "FACTURA");
      fd.append("force", "0");
      fd.append("ids_movimiento", JSON.stringify(idsMovimientos));
      return await apiPostForm(API_UPLOAD_LINK, fd);
    },
    [API_UPLOAD_LINK]
  );

  // ── FIX: un solo toast "Compra agregada correctamente." ──
  const submit = useCallback(async () => {
    if (saving) return;
    const { sessionKey } = getAuthInfo();
    if (!sessionKey) {
      showToast("error", "No hay sesión activa (Falta X-Session).", 5200);
      return;
    }
    if (addUI.open) {
      showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.", 3200);
      return;
    }
    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }
    setSaving(true);
    if (v.warn)
      showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    try {
      const { idUsuario } = getAuthInfo();
      const idTipoVenta = isCorriente ? 2 : 1;
      const accionFinal = isCorriente ? "guardar" : "pagar";
      const esPagadaFinal = !isCorriente;
      const proveedorIdFinal =
        Number(filters.id_proveedor) > 0 ? Number(filters.id_proveedor) : null;
      const medioPagoIdFinal =
        isContado && Number(filters.id_medio_pago) > 0
          ? Number(filters.id_medio_pago)
          : null;

      const payloads = rowsCalc
        .filter(
          (r) =>
            Number.isFinite(Number(r.id_detalle)) &&
            Number(r.id_detalle) > 0 &&
            Number(r.total || 0) > 0
        )
        .map((r) => ({
          idUsuario,
          fecha,
          id_tipo_venta: idTipoVenta,
          id_proveedor: proveedorIdFinal,
          proveedor_nombre: String(provInput || "").trim() || null,
          id_detalle: Number(r.id_detalle),
          cantidad: Math.round(Number(r.cantidad) * 100) / 100,
          precio: Math.round(Number(r.precio) * 100) / 100,
          iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
          subtotal: Math.round(Number(r.subtotal) * 100) / 100,
          iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
          total: Math.round(Number(r.total) * 100) / 100,
          monto_total: Math.round(Number(r.total) * 100) / 100,
          accion_compra: accionFinal,
          es_pagada: esPagadaFinal,
          ...(isContado
            ? {
                id_medio_pago: medioPagoIdFinal,
                medio_pago_id: medioPagoIdFinal,
                idMedioPago: medioPagoIdFinal,
              }
            : {}),
        }));

      if (!payloads.length) {
        showToast("advertencia", "No hay filas válidas para guardar.", 4200);
        setSaving(false);
        return;
      }

      const data = await apiPostJson(API_BATCH, payloads);
      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo guardar el batch de compras.");
      }

      const idsCreados = Array.isArray(data?.ids)
        ? data.ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
        : [];

      let warningArchivo = "";
      if (archivoAdjunto && idsCreados.length > 0) {
        try {
          const rFile = await subirYVincularArchivo(idsCreados, archivoAdjunto);
          if (!rFile?.exito) {
            warningArchivo = rFile?.mensaje || "No se pudo vincular el archivo.";
          }
        } catch (e) {
          warningArchivo = e?.message || "No se pudo vincular el archivo.";
        }
      }

      if (warningArchivo) {
        showToast(
          "advertencia",
          `Compra guardada, pero el archivo no se pudo vincular: ${warningArchivo}`,
          7000
        );
      } else {
        // ── único toast de éxito ──
        showToast("exito", "Compra agregada correctamente.", 3000);
      }

      await Promise.resolve(onSaved?.(data));
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
      setSaving(false);
    }
  }, [
    saving,
    addUI.open,
    validate,
    showToast,
    isCorriente,
    isContado,
    rowsCalc,
    fecha,
    filters,
    provInput,
    API_BATCH,
    onSaved,
    onClose,
    archivoAdjunto,
    subirYVincularArchivo,
  ]);

  if (!open) return null;

  return createPortal(
    <>
      <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
        <div
          className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""]
            .join(" ")
            .trim()}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faBasketShopping} />
            </div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Nueva Compra</h2>
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

          <div className="mi-modal__content">
            <div className="mi-cr-grid">
              <section className="mi-cr-table">
                <div className="mi-cr-table__head">
                  <div style={{ paddingLeft: 10 }}>Detalle</div>
                  <div>Cant.</div>
                  <div className="right">Precio</div>
                  <div>IVA %</div>
                  <div className="right">IVA $</div>
                  <div className="right">Total</div>
                  <div />
                </div>

                <div className="mi-cr-table__rows">
                  {rowsCalc.map((r) => (
                    <div key={r.id} className="mi-cr-row">

                      {/* ── Detalle con GlobalAutocomplete ── */}
                      <div className="mi-cr-cell mi-cr-cell--detalle">
                        <GlobalAutocomplete
                          value={r.detalleText}
                          onChange={(val) =>
                            updateRow(r.id, {
                              detalleText: val,
                              id_detalle: NULL_OPTION,
                            })
                          }
                          onSelect={(d) => {
                            const did = getDetalleId(d);
                            updateRow(r.id, {
                              id_detalle: String(did || ""),
                              detalleText: String(d?.nombre || ""),
                            });
                          }}
                          options={detallesList}
                          getOptionLabel={(d) => String(d?.nombre ?? "")}
                          getOptionValue={(d) => String(getDetalleId(d) ?? d?.nombre ?? "")}
                          placeholder="Escribí o buscá un detalle…"
                          disabled={saving || addUI.open}
                          showAllOnFocus={false}
                          maxItems={18}
                          inputClassName="nv-cell-input"
                        />
                      </div>

                      <div className="mi-cr-cell mi-cr-cell--center">
                        <input
                          className="nv-cell-input nv-cell-input--center"
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
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div className="mi-cr-cell mi-cr-cell--center">
                        <input
                          className="nv-cell-input nv-cell-input--right"
                          type="text"
                          inputMode="decimal"
                          value={
                            r.precioFocused
                              ? r.precioDraft ?? ""
                              : formatMoneyInputARS(r.precio)
                          }
                          onFocus={(e) => {
                            updateRow(r.id, {
                              precioFocused: true,
                              precioDraft: formatEditableMoney(r.precio),
                            });
                            setTimeout(() => e.target.select(), 0);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const cleaned = raw.replace(/[^\d,.\-]/g, "");
                            updateRow(r.id, {
                              precioDraft: cleaned,
                              precio: parseMoneyInputARS(cleaned),
                            });
                          }}
                          onBlur={() => {
                            const parsed = parseMoneyInputARS(r.precioDraft);
                            updateRow(r.id, {
                              precio: parsed,
                              precioDraft: "",
                              precioFocused: false,
                            });
                          }}
                          placeholder="$ 0,00"
                          disabled={saving}
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div className="mi-cr-cell mi-cr-cell--center">
                        <select
                          className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                          value={String(r.ivaPct)}
                          onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
                          }}
                          disabled={saving}
                          style={{ width: "100%" }}
                        >
                          {IVA_OPTIONS.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                        {moneyARS(r.ivaMonto)}
                      </div>

                      <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                        {moneyARS(r.total)}
                      </div>

                      <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                        <button
                          type="button"
                          className="mi-cr-del"
                          onClick={() => removeRow(r.id)}
                          disabled={saving}
                          title="Eliminar fila"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mi-cr-table__foot">
                  <div className="mi-cr-foot-actions">
                    <button
                      type="button"
                      className="nv-foot-btn"
                      onClick={addRow}
                      disabled={saving}
                    >
                      <span className="nv-foot-btn__icon">+</span>
                      Agregar fila
                    </button>
                    <div className="nv-foot-sep" />
                    <button
                      type="button"
                      className="nv-foot-btn"
                      disabled={saving || addUI.saving}
                      onClick={() => {
                        const lastRow = rows[rows.length - 1];
                        startAddDetalleForRow(lastRow?.id);
                      }}
                    >
                      <span className="nv-foot-btn__icon">✦</span>
                      Nuevo detalle
                    </button>
                  </div>

                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                      <span>Subtotal</span>
                      <b>{moneyARS(resumen.subtotal)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                      <span>IVA</span>
                      <b>{moneyARS(resumen.iva)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--total">
                      <span>Total</span>
                      <b>{moneyARS(resumen.total)}</b>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="mi-cr-filters">
                <div className="mi-cr-filters__top">
                  <div className="mi-cr-filters__title">Datos de compra</div>
                  <div className="mi-cr-filters__dates">
                    <div className="fl-field mi-card--full mi-date-field" onClick={handleOpenDate}>
                      <input
                        ref={fechaInputRef}
                        className="fl-input mi-date-field__input"
                        type="date"
                        placeholder=" "
                        value={fecha}
                        onChange={(e) => setFecha(String(e.target.value || "").trim())}
                        disabled={saving}
                      />
                      <label
                        className="fl-label mi-date-field__label"
                        onClick={handleOpenDate}
                      >
                        Fecha
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mi-cr-filters__body">

                  {/* ── Proveedor con GlobalAutocomplete ── */}
                  <div className="fl-field mi-cr-rel">
                    <GlobalAutocomplete
                      value={provInput}
                      onChange={handleProveedorInputChange}
                      onSelect={handleSelectProveedor}
                      options={proveedoresList}
                      getOptionLabel={(p) => String(p?.nombre ?? "").trim()}
                      getOptionValue={(p) => String(getProveedorId(p) ?? p?.nombre ?? "")}
                      label="Proveedor *"
                      placeholder=" "
                      disabled={saving || addUI.open}
                      showAllOnFocus={true}
                      maxItems={25}
                      inputClassName="fl-input"
                    />
                    <button
                      type="button"
                      className="mi-cr-link"
                      onClick={startAddProveedor}
                      disabled={saving || addUI.saving}
                      style={{
                        fontSize: "11px",
                        color: "#0f766e",
                        background: "none",
                        border: "none",
                        padding: "4px 0 0",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      + Agregar nuevo proveedor
                    </button>
                  </div>

                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(filters.forma)}
                      onChange={(e) => updateFilter("forma", e.target.value)}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Seleccionar...</option>
                      <option value="CONTADO">CONTADO</option>
                      <option value="CUENTA_CORRIENTE">CUENTA CORRIENTE</option>
                    </select>
                    <label className="fl-label">Tipo de compra *</label>
                  </div>

                  {isContado && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(filters.id_medio_pago)}
                        onChange={(e) => updateFilter("id_medio_pago", e.target.value)}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Seleccionar medio</option>
                        {mediosPagoList.map((x) => {
                          const idMp = getMedioPagoId(x);
                          return (
                            <option
                              key={idMp ?? x?.nombre ?? uid()}
                              value={idMp != null ? String(idMp) : ""}
                            >
                              {String(x?.nombre ?? "").trim() || "Medio"}
                            </option>
                          );
                        })}
                      </select>
                      <label className="fl-label">Medio de pago *</label>
                    </div>
                  )}

                  {isCorriente && (
                    <div className="mi-card mi-card--full">
                      <div className="mi-card__title">Cuenta Corriente</div>
                      <div className="mi-card__hint">
                        * Se guardará como <b>Cuenta Corriente</b> y quedará <b>pendiente</b>.
                      </div>
                    </div>
                  )}

                  <div className="mi-uploadCard">
                    <div className="mi-uploadCard__head">
                      <div>
                        <div className="mi-uploadCard__title">Archivo adjunto</div>
                        <div className="mi-uploadCard__sub">
                          PDF, imagen u otro comprobante
                        </div>
                      </div>
                    </div>
                    <div className="mi-uploadCard__body">
                      <div className="mi-uploadBar">
                        <label className="mi-uploadBar__pick">
                          <input
                            type="file"
                            className="mi-uploadBar__input"
                            onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                            disabled={saving}
                          />
                          <span className="mi-uploadBar__btn mi-uploadBar__btn--primary">
                            {archivoAdjunto ? "Cambiar" : "Seleccionar"}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                          onClick={() => setArchivoAdjunto(null)}
                          disabled={saving || !archivoAdjunto}
                        >
                          Quitar
                        </button>
                      </div>
                      <div
                        className={`mi-uploadFile ${
                          archivoAdjunto ? "is-filled" : "is-empty"
                        }`}
                      >
                        {archivoAdjunto ? (
                          <>
                            <div className="mi-uploadFile__icon">
                              <FontAwesomeIcon icon={faFileInvoiceDollar} />
                            </div>
                            <div className="mi-uploadFile__meta">
                              <div
                                className="mi-uploadFile__name"
                                title={archivoAdjunto.name}
                              >
                                {archivoAdjunto.name}
                              </div>
                              <div className="mi-uploadFile__size">
                                {Math.max(1, Math.round((archivoAdjunto.size || 0) / 1024))} KB
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="mi-uploadFile__empty">
                            No hay archivo seleccionado
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mi-cr-filters__actions">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={saving}
                      className="mit-btn mit-btn--solid mit-btn--block"
                    >
                      {saving ? "Guardando..." : "Guardar compra"}
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

          <AddCatalogMiniModal
            open={addUI.open}
            title={addUI.kind === "proveedores" ? "Nuevo proveedor" : "Nuevo detalle"}
            value={addUI.text}
            saving={addUI.saving}
            onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
            onCancel={closeAddMini}
            onSave={guardarNuevoCatalogo}
            dark={dark}
          />
        </div>
      </div>
    </>,
    document.body
  );
}