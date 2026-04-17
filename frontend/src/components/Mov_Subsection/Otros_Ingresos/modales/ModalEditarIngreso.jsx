import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faFileLines,
  faEye,
  faTrashCan,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../../config/config.jsx";
import "../../../Global/Global_css/Global_Modals.css";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

/* ── helpers base ── */
function safeNumber(v) {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}
function round3(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 1000) / 1000;
}
function safeText(v) {
  return String(v ?? "").trim();
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

function calcItemTotals(cantidad, precio, ivaPct) {
  const c = Math.max(0, safeNumber(cantidad));
  const p = Math.max(0, safeNumber(precio));
  const iva = Math.max(0, safeNumber(ivaPct));
  const subtotal = c * p;
  const iva_monto = subtotal * (iva / 100);
  const total = subtotal + iva_monto;
  return {
    subtotal: round2(subtotal),
    iva_monto: round2(iva_monto),
    total: round2(total),
  };
}

function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getDetalleId(d) {
  const cand =
    d?.id ??
    d?.id_detalle ??
    d?.idDetalle ??
    d?.detalle_id ??
    d?.iddetalle ??
    d?.id_categoria_ingreso ??
    d?.idCategoriaIngreso ??
    d?.categoria_ingreso_id ??
    null;

  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionLabel(x) {
  return safeText(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? "");
}

function getStockDisponible(detalle) {
  const cand =
    detalle?.stock ??
    detalle?.stock_disponible ??
    detalle?.stockDisponible ??
    detalle?.cantidad_stock ??
    detalle?.cantidad ??
    null;

  if (cand === null || cand === undefined || cand === "") return null;
  const n = Number(cand);
  return Number.isFinite(n) ? n : null;
}

function isSinStock(stock) {
  return stock !== null && stock !== undefined && Number(stock) <= 0;
}

function normalizeDetalles(lists) {
  const raw = Array.isArray(lists?.detalles)
    ? lists.detalles
    : Array.isArray(lists?.categorias_ingreso)
      ? lists.categorias_ingreso
      : Array.isArray(lists?.categoriasIngreso)
        ? lists.categoriasIngreso
        : [];
  return raw;
}

function normalizeMediosPago(lists) {
  const raw = Array.isArray(lists?.medios_pago)
    ? lists.medios_pago
    : Array.isArray(lists?.mediosPago)
      ? lists.mediosPago
      : [];
  return raw.map((x) => ({
    id: Number(x?.id ?? x?.id_medio_pago ?? 0),
    nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? "").trim(),
  }));
}

function makeItem(it = {}) {
  const cantidad = round3(it?.cantidad ?? 1);
  const precio = round2(it?.precio ?? it?.total ?? 0);
  const iva_pct = round2(it?.iva_pct ?? 0);
  const calc = calcItemTotals(cantidad, precio, iva_pct);

  return {
    uid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    id_detalle: String(Number(it?.id_detalle ?? 0) || ""),
    detalle: String(it?.detalle ?? it?.descripcion ?? it?.concepto ?? it?.detalle_nombre ?? "").trim(),
    cantidad,
    precio,
    iva_pct,
    subtotal: round2(it?.subtotal ?? calc.subtotal),
    iva_monto: round2(it?.iva_monto ?? calc.iva_monto),
    total: round2(it?.total ?? calc.total),
    stock_disponible: null,
    sinStock: false,
    precioDraft: "",
    precioFocused: false,
  };
}

function buildInitialState(data) {
  const src = data && typeof data === "object" ? data : {};
  const rawItems = Array.isArray(src.items) && src.items.length
    ? src.items
    : Array.isArray(src.detalles) && src.detalles.length
      ? src.detalles
      : [src];

  const items = rawItems
    .map((it) => makeItem(it))
    .filter(
      (it) =>
        Number(it.cantidad) > 0 &&
        (Number(it.precio) > 0 || Number(it.total) > 0 || Number(it.id_detalle) > 0)
    );

  return {
    id_movimiento: Number(src?.id_movimiento ?? src?.id ?? 0) || 0,
    fecha: String(src?.fecha ?? "").slice(0, 10),
    id_medio_pago: String(Number(src?.id_medio_pago ?? src?.medio_pago_id ?? 0) || ""),
    items: items.length
      ? items
      : [makeItem({ cantidad: 1, precio: Number(src?.monto_total ?? 0) || 0 })],
  };
}

function sumTotalItems(items) {
  return round2(
    (Array.isArray(items) ? items : []).reduce((acc, it) => acc + safeNumber(it?.total), 0)
  );
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    Boolean(document.body?.classList?.contains("dark"))
  );
}

function getAuthInfo() {
  const token = safeText(localStorage.getItem("token"));
  const sessionKey =
    safeText(localStorage.getItem("session_key")) ||
    safeText(localStorage.getItem("sessionKey")) ||
    safeText(localStorage.getItem("X-Session")) ||
    safeText(localStorage.getItem("x_session"));

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { token, sessionKey, idUsuario };
}

function buildHeadersGET() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function buildHeadersJSON() {
  const { token, sessionKey } = getAuthInfo();
  const h = { "Content-Type": "application/json" };
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function buildHeadersFormData() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}. ${text.slice(0, 400)}`);
  }
}

function getComprobanteDownloadUrl(idMovimiento) {
  return `${BASE_URL}/api.php?action=otros_ingresos_comprobantes_descargar&id_movimiento=${Number(idMovimiento || 0)}`;
}

/* ============================================================
   MODAL PRINCIPAL
============================================================ */
export default function ModalEditarIngreso({
  open,
  initialData,
  lists,
  onClose,
  onToast,
  onSubmit,
  onSaved,
  dark: darkProp,
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [darkAuto, setDarkAuto] = useState(isTemaOscuro);
  const [saving, setSaving] = useState(false);
  const [loadingComprobante, setLoadingComprobante] = useState(false);
  const [form, setForm] = useState(() => buildInitialState(initialData));

  const [comprobanteActual, setComprobanteActual] = useState(null);
  const [archivoNuevo, setArchivoNuevo] = useState(null);
  const [marcarEliminarComprobante, setMarcarEliminarComprobante] = useState(false);

  const [openViewer, setOpenViewer] = useState(false);
  const [viewerData, setViewerData] = useState({ url: "", mime: "", title: "Comprobante" });

  const closeBtnRef = useRef(null);
  const inputFileRef = useRef(null);
  const fechaRef = useRef(null);

  /* dark mode observer */
  useEffect(() => {
    const update = () => setDarkAuto(isTemaOscuro());
    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const obsBody = new MutationObserver(update);
    if (document.body) {
      obsBody.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    update();
    return () => {
      obsHtml.disconnect();
      obsBody.disconnect();
    };
  }, []);

  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;

  const detalles = useMemo(() => normalizeDetalles(lists), [lists]);
  const mediosPago = useMemo(() => normalizeMediosPago(lists), [lists]);

  /* overflow */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* reset */
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(buildInitialState(initialData));
    setArchivoNuevo(null);
    setMarcarEliminarComprobante(false);
    setComprobanteActual(null);
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open, initialData]);

  /* escape */
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape" && !saving) onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, saving, onClose]);

  /* cargar comprobante */
  const cargarInfoComprobante = useCallback(async () => {
    const idMovimiento = Number(initialData?.id_movimiento ?? initialData?.id ?? 0);
    if (!open || !(idMovimiento > 0)) {
      setComprobanteActual(null);
      return;
    }
    setLoadingComprobante(true);
    try {
      const res = await fetch(
        `${API}?action=otros_ingresos_comprobantes_info&id_movimiento=${idMovimiento}`,
        { method: "GET", headers: buildHeadersGET() }
      );
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo obtener el comprobante.");
      setComprobanteActual(data?.comprobante ?? null);
    } catch (err) {
      setComprobanteActual(null);
      showToast("error", err?.message || "No se pudo obtener el comprobante.", 3500);
    } finally {
      setLoadingComprobante(false);
    }
  }, [API, initialData, open, showToast]);

  useEffect(() => {
    if (open) cargarInfoComprobante();
  }, [open, cargarInfoComprobante]);

  /* enriquecer items con stock/detalle según listas */
  useEffect(() => {
    if (!open) return;
    if (!Array.isArray(detalles) || !detalles.length) return;

    setForm((prev) => ({
      ...prev,
      items: (prev.items || []).map((it) => {
        const detalleObj =
          detalles.find((d) => String(getDetalleId(d) ?? "") === String(it.id_detalle || "")) || null;

        if (!detalleObj) return it;

        const stockDisponible = getStockDisponible(detalleObj);
        const sinStock = isSinStock(stockDisponible);

        return {
          ...it,
          detalle: it.detalle || optionLabel(detalleObj),
          stock_disponible: stockDisponible,
          sinStock,
        };
      }),
    }));
  }, [open, detalles]);

  /* ── mutaciones ítems ── */
  const updateItem = useCallback((uid, patch) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.uid !== uid) return it;
        const next = { ...it, ...patch };
        const cantidad = next.cantidad === "" ? "" : round3(safeNumber(next.cantidad));
        const precio = round2(safeNumber(next.precio));
        const iva_pct = round2(safeNumber(next.iva_pct));
        const calc = calcItemTotals(cantidad === "" ? 0 : cantidad, precio, iva_pct);

        return {
          ...next,
          cantidad,
          precio,
          iva_pct,
          subtotal: calc.subtotal,
          iva_monto: calc.iva_monto,
          total: calc.total,
        };
      }),
    }));
  }, []);

  const handleSelectDetalle = useCallback(
    (item, uid) => {
      const precio = safeNumber(item?.precio || 0);
      const stockDisponible = getStockDisponible(item);
      const sinStock = isSinStock(stockDisponible);

      updateItem(uid, {
        id_detalle: String(getDetalleId(item) ?? ""),
        detalle: optionLabel(item),
        precio,
        stock_disponible: stockDisponible,
        sinStock,
        cantidad: sinStock ? "" : 1,
      });

      if (sinStock) {
        showToast(
          "advertencia",
          `El producto "${optionLabel(item)}" no tiene stock disponible.`,
          2500
        );
      }
    },
    [updateItem, showToast]
  );

  const handleCantidadChange = useCallback(
    (uid, newCantidad) => {
      const row = form.items.find((r) => r.uid === uid);
      if (!row) return;

      if (row.sinStock || isSinStock(row.stock_disponible)) {
        updateItem(uid, { cantidad: "" });
        return;
      }

      const stockDisponible = row.stock_disponible;
      let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);

      if (typeof cantidadFinal === "number" && cantidadFinal < 0) {
        cantidadFinal = 0;
      }

      if (
        stockDisponible !== null &&
        stockDisponible !== undefined &&
        stockDisponible !== "" &&
        typeof cantidadFinal === "number" &&
        cantidadFinal > Number(stockDisponible)
      ) {
        cantidadFinal = Number(stockDisponible);
        showToast("advertencia", `Stock máximo disponible: ${stockDisponible}`, 2000);
      }

      updateItem(uid, { cantidad: cantidadFinal });
    },
    [form.items, updateItem, showToast]
  );

  const addItem = useCallback(() => {
    setForm((p) => ({
      ...p,
      items: [
        ...p.items,
        makeItem({ cantidad: 1, precio: 0, iva_pct: 0 }),
      ],
    }));
  }, []);

  const removeItem = useCallback((uid) => {
    setForm((p) => {
      if ((p.items || []).length <= 1) return p;
      return { ...p, items: p.items.filter((it) => it.uid !== uid) };
    });
  }, []);

  const totalGeneral = useMemo(() => sumTotalItems(form.items), [form.items]);

  const cerrar = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [saving, onClose]);

  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el || saving || el.disabled) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  }, [saving]);

  /* comprobante */
  const mostrarArchivoActual = Boolean(
    (comprobanteActual?.archivo_url || comprobanteActual) &&
      !marcarEliminarComprobante &&
      !archivoNuevo
  );

  const nombreComprobanteVisible = useMemo(() => {
    if (archivoNuevo) return archivoNuevo.name;
    if (marcarEliminarComprobante) return "";
    return safeText(comprobanteActual?.archivo_url).split("/").pop() || "Comprobante actual";
  }, [archivoNuevo, marcarEliminarComprobante, comprobanteActual]);

  const abrirViewer = useCallback(() => {
    const idMovimiento = Number(form.id_movimiento || 0);
    if (!(idMovimiento > 0)) return;

    if (archivoNuevo) {
      setViewerData({
        url: URL.createObjectURL(archivoNuevo),
        mime: archivoNuevo.type || "application/octet-stream",
        title: `Comprobante - ${archivoNuevo.name}`,
      });
      setOpenViewer(true);
      return;
    }

    if (!comprobanteActual || marcarEliminarComprobante) return;

    setViewerData({
      url: getComprobanteDownloadUrl(idMovimiento),
      mime: safeText(comprobanteActual?.archivo_mime) || "application/octet-stream",
      title: "Comprobante del ingreso",
    });
    setOpenViewer(true);
  }, [form.id_movimiento, archivoNuevo, comprobanteActual, marcarEliminarComprobante]);

  const cerrarViewer = useCallback(() => {
    if (viewerData?.url?.startsWith("blob:")) URL.revokeObjectURL(viewerData.url);
    setOpenViewer(false);
    setViewerData({ url: "", mime: "", title: "Comprobante" });
  }, [viewerData]);

  const seleccionarArchivo = useCallback((e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    setArchivoNuevo(file);
    setMarcarEliminarComprobante(false);
  }, []);

  const quitarArchivoNuevo = useCallback(() => {
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  }, []);

  const marcarEliminar = useCallback(() => {
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
    setMarcarEliminarComprobante(true);
  }, []);

  const restaurarComprobanteActual = useCallback(() => {
    setMarcarEliminarComprobante(false);
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  }, []);

  const eliminarComprobanteExistente = useCallback(
    async (idMovimiento) => {
      const { idUsuario } = getAuthInfo();
      const res = await fetch(`${API}?action=otros_ingresos_comprobantes_eliminar`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({
          id_movimiento: idMovimiento,
          idUsuario,
          idUsuarioMaster: idUsuario,
        }),
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el comprobante.");
      return data;
    },
    [API]
  );

  const subirComprobanteNuevo = useCallback(
    async (idMovimiento, archivo) => {
      const { idUsuario } = getAuthInfo();
      const fd = new FormData();
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("archivo", archivo);
      fd.append("idUsuario", String(idUsuario || 0));
      fd.append("idUsuarioMaster", String(idUsuario || 0));

      const res = await fetch(`${API}?action=otros_ingresos_comprobantes_vincular_movimiento_upload`, {
        method: "POST",
        headers: buildHeadersFormData(),
        body: fd,
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo subir el comprobante.");
      return data;
    },
    [API]
  );

  /* ── submit ── */
  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      showToast("cargando", "Actualizando ingreso…", 12000);

      const fecha = String(form.fecha || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        throw new Error("La fecha es obligatoria.");
      }

      const id_medio_pago = Number(form.id_medio_pago || 0);
      if (!(id_medio_pago > 0)) {
        throw new Error("El medio de pago es obligatorio.");
      }

      const items = (form.items || [])
        .map((it) => {
          const id_detalle = Number(it.id_detalle || 0);
          const cantidad = round3(safeNumber(it.cantidad));
          const precio = round2(safeNumber(it.precio));
          const iva_pct = round2(safeNumber(it.iva_pct));
          const calc = calcItemTotals(cantidad, precio, iva_pct);

          return {
            id_detalle,
            detalle: safeText(it.detalle),
            cantidad,
            precio,
            iva_pct,
            ...calc,
          };
        })
        .filter((it) => it.id_detalle > 0 && it.cantidad > 0 && it.precio > 0 && it.total > 0);

      if (!items.length) {
        throw new Error("Debés cargar al menos un ítem válido.");
      }

      const payload = {
        id_movimiento: Number(form.id_movimiento || 0),
        fecha,
        id_medio_pago,
        id_detalle: items[0]?.id_detalle ?? null,
        monto_total: sumTotalItems(items),
        items,
      };

      if (!(payload.id_movimiento > 0)) {
        throw new Error("Falta el ID del ingreso a editar.");
      }

      const resp = await onSubmit?.(payload, true);
      const idMovimientoFinal = Number(resp?.id_movimiento ?? resp?.id ?? payload.id_movimiento ?? 0);

      if (!(idMovimientoFinal > 0)) {
        throw new Error("No se pudo determinar el ID del ingreso actualizado.");
      }

      if (marcarEliminarComprobante && comprobanteActual && !archivoNuevo) {
        await eliminarComprobanteExistente(idMovimientoFinal);
      }

      if (archivoNuevo) {
        await subirComprobanteNuevo(idMovimientoFinal, archivoNuevo);
      }

      await onSaved?.(resp);
    } catch (err) {
      showToast("error", err?.message || "Error actualizando ingreso.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  const resumen = {
    subtotal: round2((form.items || []).reduce((a, it) => a + safeNumber(it?.subtotal), 0)),
    iva: round2((form.items || []).reduce((a, it) => a + safeNumber(it?.iva_monto), 0)),
    total: totalGeneral,
  };

  return createPortal(
    <>
      <div className="mi-modal__overlay mi-modal__overlay--mov">
        <div
          className={`mi-modal__container mi-modal__container--mov ${dark ? "mi-modal--dark" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-editar-ingreso-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faPenToSquare} />
            </div>

            <div className="mi-modal__head-left">
              <h2 id="modal-editar-ingreso-title" className="mi-modal__title">
                Editar ingreso
              </h2>
              <p className="mi-modal__subtitle">
                Modificá fecha, medio de pago, ítems y comprobante
              </p>
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

          <div className="mi-modal__content">
            <form onSubmit={submit} style={{ display: "contents" }}>
              <div className="mi-cr-grid">
                <section className="mi-cr-table">
                  <div
                    className="mi-cr-table__head"
                    style={{ gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr" }}
                  >
                    <div style={{ paddingLeft: 10 }}>Descripción</div>
                    <div>Cant.</div>
                    <div className="right">Importe</div>
                    <div>IVA %</div>
                    <div className="right">IVA $</div>
                    <div className="right">Total</div>
                    <div />
                  </div>

                  <div className="mi-cr-table__rows">
                    {(form.items || []).map((it) => {
                      const stockNum =
                        it.stock_disponible !== null && it.stock_disponible !== undefined
                          ? Number(it.stock_disponible)
                          : null;

                      const rowSinStock = it.sinStock || isSinStock(stockNum);

                      return (
                        <div
                          key={it.uid}
                          className={`mi-cr-row ${rowSinStock ? "mi-cr-row--sin-stock" : ""}`}
                          style={{ gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr" }}
                        >
                          <div className="mi-cr-cell mi-cr-cell--detalle">
                            <GlobalAutocomplete
                              value={it.detalle}
                              onChange={(val) =>
                                updateItem(it.uid, {
                                  detalle: val,
                                  id_detalle: NULL_OPTION,
                                  stock_disponible: null,
                                  sinStock: false,
                                })
                              }
                              onSelect={(item) => handleSelectDetalle(item, it.uid)}
                              options={detalles}
                              getOptionLabel={(d) => optionLabel(d)}
                              getOptionValue={(d) => String(getDetalleId(d) ?? optionLabel(d))}
                              placeholder="Escribí o buscá un detalle…"
                              disabled={saving}
                              showAllOnFocus={false}
                              maxItems={18}
                              inputClassName="nv-cell-input"
                            />
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center">
                            <input
                              className="nv-cell-input nv-cell-input--center"
                              type="number"
                              min={rowSinStock ? undefined : "1"}
                              step="1"
                              style={{
                                width: "100%",
                                background: rowSinStock ? "#f3f4f6" : undefined,
                                color: rowSinStock ? "#b91c1c" : undefined,
                                borderColor: rowSinStock ? "#fca5a5" : undefined,
                                cursor: rowSinStock ? "not-allowed" : undefined,
                                opacity: rowSinStock ? 0.9 : 1,
                              }}
                              value={rowSinStock ? "" : it.cantidad}
                              onChange={(e) =>
                                handleCantidadChange(
                                  it.uid,
                                  e.target.value === "" ? "" : Number(e.target.value)
                                )
                              }
                              disabled={saving || rowSinStock}
                              placeholder={rowSinStock ? "0" : ""}
                              title={rowSinStock ? "No podés ingresar cantidad porque el stock es 0" : ""}
                            />

                            {it.stock_disponible !== null && it.stock_disponible !== undefined && (
                              <div
                                style={{
                                  fontSize: "10px",
                                  marginTop: "2px",
                                  fontWeight: rowSinStock ? 700 : 500,
                                  color: rowSinStock ? "#b91c1c" : "#666",
                                }}
                              >
                                {rowSinStock ? "Sin stock" : `Stock: ${it.stock_disponible}`}
                              </div>
                            )}
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center">
                            <input
                              className="nv-cell-input nv-cell-input--right"
                              type="text"
                              inputMode="decimal"
                              value={
                                it.precioFocused
                                  ? it.precioDraft ?? ""
                                  : formatMoneyInputARS(it.precio)
                              }
                              onFocus={(e) => {
                                updateItem(it.uid, {
                                  precioFocused: true,
                                  precioDraft: formatEditableMoney(it.precio),
                                });
                                setTimeout(() => e.target.select(), 0);
                              }}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const cleaned = raw.replace(/[^\d,.\-]/g, "");
                                updateItem(it.uid, {
                                  precioDraft: cleaned,
                                  precio: parseMoneyInputARS(cleaned),
                                });
                              }}
                              onBlur={() => {
                                const parsed = parseMoneyInputARS(it.precioDraft);
                                updateItem(it.uid, {
                                  precio: parsed,
                                  precioDraft: "",
                                  precioFocused: false,
                                });
                              }}
                              placeholder="$ 0,00"
                              disabled={saving}
                              style={{ width: "100%", padding: "0" }}
                            />
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center">
                            <select
                              className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                              style={{ width: "100%" }}
                              value={String(it.iva_pct)}
                              onChange={(e) => updateItem(it.uid, { iva_pct: Number(e.target.value) })}
                              disabled={saving}
                            >
                              {IVA_OPTIONS.map((x) => (
                                <option key={x.value} value={x.value}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                            {moneyARS(it.iva_monto)}
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                            {moneyARS(it.total)}
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                            <button
                              type="button"
                              className="mi-cr-del"
                              onClick={() => removeItem(it.uid)}
                              disabled={saving}
                              title="Eliminar ítem"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mi-cr-table__foot">
                    <div className="mi-cr-foot-actions">
                      <button
                        type="button"
                        className="nv-foot-btn"
                        onClick={addItem}
                        disabled={saving}
                      >
                        <span className="nv-foot-btn__icon">
                          <FontAwesomeIcon icon={faPlus} />
                        </span>
                        Agregar ítem
                      </button>

                      <div className="nv-foot-sep" />
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

                <aside className="nc-aside">
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Datos generales</span>
                    </div>

                    <div className="nc-section-body">
                      <div className="nc-field" onClick={openDatePicker}>
                        <input
                          ref={fechaRef}
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={form.fecha}
                          onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                          disabled={saving}
                        />
                        <label className="nc-label">Fecha</label>
                      </div>

                      <div className="nc-field">
                        <select
                          className="nc-input"
                          style={{ paddingTop: 10, paddingBottom: 10, cursor: "pointer" }}
                          value={String(form.id_medio_pago || "")}
                          onChange={(e) => setForm((p) => ({ ...p, id_medio_pago: e.target.value }))}
                          disabled={saving}
                        >
                          <option value="">— Seleccionar —</option>
                          {mediosPago.map((x) => (
                            <option key={x.id} value={String(x.id)}>
                              {x.nombre}
                            </option>
                          ))}
                        </select>
                        <label className="nc-label">Medio de pago *</label>
                      </div>
                    </div>
                  </div>

                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" style={{ background: "#64748b" }} />
                      <span>Comprobante adjunto</span>
                    </div>

                    <div className="nc-section-body">
                      <div className="mi-uploadCard">
                        <div className="mi-uploadCard__head">
                          <div className="mi-uploadCard__title">Comprobante</div>
                          <div className="mi-uploadCard__sub">
                            Seleccioná, visualizá o quitá el archivo antes de guardar
                          </div>
                        </div>

                        <div className="mi-uploadCard__body">
                          {loadingComprobante ? (
                            <div style={{ fontSize: 13, opacity: 0.75, padding: "8px 0" }}>
                              Cargando comprobante…
                            </div>
                          ) : (
                            <>
                              {mostrarArchivoActual && (
                                <div className="mi-uploadFile is-filled">
                                  <div className="mi-uploadFile__icon">
                                    <FontAwesomeIcon icon={faFileLines} />
                                  </div>

                                  <div className="mi-uploadFile__meta">
                                    <div className="mi-uploadFile__name" title={nombreComprobanteVisible}>
                                      {nombreComprobanteVisible}
                                    </div>
                                    <div className="mi-uploadFile__size">
                                      Archivo ya vinculado al ingreso
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      marginLeft: "auto",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={abrirViewer}
                                      disabled={saving}
                                      title="Ver comprobante"
                                    >
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>

                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={marcarEliminar}
                                      disabled={saving}
                                      title="Quitar comprobante actual"
                                    >
                                      <FontAwesomeIcon icon={faTrashCan} />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {archivoNuevo && (
                                <div className="mi-uploadFile is-filled" style={{ marginTop: mostrarArchivoActual ? 10 : 0 }}>
                                  <div className="mi-uploadFile__icon">
                                    <FontAwesomeIcon icon={faFileLines} />
                                  </div>

                                  <div className="mi-uploadFile__meta">
                                    <div className="mi-uploadFile__name" title={archivoNuevo.name}>
                                      {archivoNuevo.name}
                                    </div>
                                    <div className="mi-uploadFile__size">
                                      {Math.max(1, Math.round((archivoNuevo.size || 0) / 1024))} KB
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 8,
                                      marginLeft: "auto",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={abrirViewer}
                                      disabled={saving}
                                      title="Ver comprobante"
                                    >
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>

                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={quitarArchivoNuevo}
                                      disabled={saving}
                                      title="Quitar archivo"
                                    >
                                      <FontAwesomeIcon icon={faTrashCan} />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {!mostrarArchivoActual && !archivoNuevo && (
                                <div className="mi-uploadFile is-empty">
                                  <div className="mi-uploadFile__meta">
                                    <div className="mi-uploadFile__name">
                                      No hay archivo seleccionado
                                    </div>
                                    <div className="mi-uploadFile__size">
                                      PDF, imagen u otro comprobante
                                    </div>
                                  </div>
                                </div>
                              )}

                              {marcarEliminarComprobante && !archivoNuevo && (
                                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                  <button
                                    type="button"
                                    className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                    onClick={restaurarComprobanteActual}
                                    disabled={saving}
                                  >
                                    Restaurar comprobante actual
                                  </button>
                                </div>
                              )}

                              <div className="mi-uploadBar" style={{ marginTop: 12 }}>
                                <input
                                  ref={inputFileRef}
                                  type="file"
                                  className="mi-uploadBar__input"
                                  onChange={seleccionarArchivo}
                                  disabled={saving}
                                  style={{ display: "none" }}
                                />

                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                                  onClick={() => inputFileRef.current?.click()}
                                  disabled={saving}
                                >
                                  {archivoNuevo || mostrarArchivoActual
                                    ? "Reemplazar archivo"
                                    : "Seleccionar archivo"}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="nc-actions mi-cr-filters__actions">
                    <button
                      type="submit"
                      disabled={saving}
                      className="mit-btn mit-btn--solid mit-btn--block"
                    >
                      {saving ? "Guardando..." : "Guardar cambios"}
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
                </aside>
              </div>
            </form>
          </div>
        </div>
      </div>

      <ModalVerComprobante
        open={openViewer}
        url={viewerData.url}
        mime={viewerData.mime}
        title={viewerData.title}
        onClose={cerrarViewer}
      />
    </>,
    document.body
  );
}