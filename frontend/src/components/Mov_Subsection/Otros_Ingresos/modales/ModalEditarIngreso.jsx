import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config.jsx";
import "../../../Global/Global_css/Global_Modals.css";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";

const IVA_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "10,5%", value: 10.5 },
  { label: "21%", value: 21 },
];

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

function normalizeDetalles(lists) {
  const raw = Array.isArray(lists?.detalles) ? lists.detalles : [];
  return raw.map((x) => ({
    id: Number(x?.id ?? x?.id_detalle ?? 0),
    nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? "").trim(),
  }));
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
    cantidad,
    precio,
    iva_pct,
    subtotal: round2(it?.subtotal ?? calc.subtotal),
    iva_monto: round2(it?.iva_monto ?? calc.iva_monto),
    total: round2(it?.total ?? calc.total),
  };
}

function buildInitialState(data) {
  const src = data && typeof data === "object" ? data : {};
  const rawItems = Array.isArray(src.items) && src.items.length ? src.items : [src];
  const items = rawItems
    .map((it) => makeItem(it))
    .filter((it) => Number(it.cantidad) > 0 && (Number(it.precio) > 0 || Number(it.total) > 0));
  return {
    id_movimiento: Number(src?.id_movimiento ?? src?.id ?? 0) || 0,
    fecha: String(src?.fecha ?? "").slice(0, 10),
    id_medio_pago: String(Number(src?.id_medio_pago ?? 0) || ""),
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
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
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
    const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}. ${preview}`);
  }
}

function getComprobanteDownloadUrl(idMovimiento) {
  return `${BASE_URL}/api.php?action=otros_ingresos_comprobantes_descargar&id_movimiento=${Number(
    idMovimiento || 0
  )}`;
}

function fileAcceptText() {
  return ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt,.zip";
}

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

  const [darkAuto, setDarkAuto] = useState(isTemaOscuro());
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

  useEffect(() => {
    const update = () => setDarkAuto(isTemaOscuro());
    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const obsBody = new MutationObserver(update);
    if (document.body) obsBody.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    update();
    return () => { obsHtml.disconnect(); obsBody.disconnect(); };
  }, []);

  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;

  const detalles = useMemo(() => normalizeDetalles(lists), [lists]);
  const mediosPago = useMemo(() => normalizeMediosPago(lists), [lists]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(buildInitialState(initialData));
    setArchivoNuevo(null);
    setMarcarEliminarComprobante(false);
    setComprobanteActual(null);
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open, initialData]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  const cargarInfoComprobante = useCallback(async () => {
    const idMovimiento = Number(initialData?.id_movimiento ?? initialData?.id ?? 0);
    if (!open || !(idMovimiento > 0)) { setComprobanteActual(null); return; }
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

  useEffect(() => { if (open) cargarInfoComprobante(); }, [open, cargarInfoComprobante]);

  const updateItem = useCallback((uid, patch) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.uid !== uid) return it;
        const next = { ...it, ...patch };
        const cantidad = round3(safeNumber(next.cantidad));
        const precio = round2(safeNumber(next.precio));
        const iva_pct = round2(safeNumber(next.iva_pct));
        const calc = calcItemTotals(cantidad, precio, iva_pct);
        return { ...next, cantidad, precio, iva_pct, ...calc };
      }),
    }));
  }, []);

  const handleMontoItemManual = useCallback((uid, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.uid !== uid) return it;
        const totalDeseado = round2(safeNumber(value));
        const cantidad = Math.max(0.001, round3(safeNumber(it.cantidad) || 1));
        const iva_pct = round2(safeNumber(it.iva_pct));
        const divisor = cantidad * (1 + iva_pct / 100);
        const precio = divisor > 0 ? round2(totalDeseado / divisor) : round2(totalDeseado);
        const calc = calcItemTotals(cantidad, precio, iva_pct);
        return { ...it, cantidad, precio, ...calc };
      }),
    }));
  }, []);

  const addItem = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, makeItem({ cantidad: 1, precio: 0, iva_pct: 0 })],
    }));
  }, []);

  const removeItem = useCallback((uid) => {
    setForm((prev) => {
      if ((prev.items || []).length <= 1) return prev;
      return { ...prev, items: prev.items.filter((it) => it.uid !== uid) };
    });
  }, []);

  const totalGeneral = useMemo(() => sumTotalItems(form.items), [form.items]);

  const cerrar = useCallback(() => { if (saving) return; onClose?.(); }, [saving, onClose]);

  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el || saving || el.disabled) return;
    try { if (typeof el.showPicker === "function") el.showPicker(); else el.focus(); } catch { el.focus(); }
  }, [saving]);

  const mostrarArchivoActual = Boolean(
    (comprobanteActual?.archivo_url || comprobanteActual) && !marcarEliminarComprobante && !archivoNuevo
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
      setViewerData({ url: URL.createObjectURL(archivoNuevo), mime: archivoNuevo.type || "application/octet-stream", title: `Comprobante - ${archivoNuevo.name}` });
      setOpenViewer(true);
      return;
    }
    if (!comprobanteActual || marcarEliminarComprobante) return;
    setViewerData({ url: getComprobanteDownloadUrl(idMovimiento), mime: safeText(comprobanteActual?.archivo_mime) || "application/octet-stream", title: "Comprobante del ingreso" });
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

  const eliminarComprobanteExistente = useCallback(async (idMovimiento) => {
    const res = await fetch(`${API}?action=otros_ingresos_comprobantes_eliminar`, {
      method: "POST",
      headers: buildHeadersJSON(),
      body: JSON.stringify({ id_movimiento: idMovimiento }),
    });
    const data = await parseJsonOrThrow(res);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el comprobante.");
    return data;
  }, [API]);

  const subirComprobanteNuevo = useCallback(async (idMovimiento, archivo) => {
    const fd = new FormData();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("archivo", archivo);
    const res = await fetch(
      `${API}?action=otros_ingresos_comprobantes_vincular_movimiento_upload`,
      { method: "POST", headers: buildHeadersFormData(), body: fd }
    );
    const data = await parseJsonOrThrow(res);
    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo subir el comprobante.");
    return data;
  }, [API]);

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    try {
      setSaving(true);
      showToast("cargando", "Actualizando ingreso…", 12000);
      const fecha = String(form.fecha || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("La fecha es obligatoria.");
      const id_medio_pago = Number(form.id_medio_pago || 0);
      if (!(id_medio_pago > 0)) throw new Error("El medio de pago es obligatorio.");
      const items = (form.items || [])
        .map((it) => {
          const id_detalle = Number(it.id_detalle || 0);
          const cantidad = round3(safeNumber(it.cantidad));
          const precio = round2(safeNumber(it.precio));
          const iva_pct = round2(safeNumber(it.iva_pct));
          const calc = calcItemTotals(cantidad, precio, iva_pct);
          return { id_detalle, cantidad, precio, iva_pct, ...calc };
        })
        .filter((it) => it.id_detalle > 0 && it.cantidad > 0 && it.precio > 0 && it.total > 0);
      if (!items.length) throw new Error("Debés cargar al menos un ítem válido.");
      const payload = {
        id_movimiento: Number(form.id_movimiento || 0),
        fecha,
        id_medio_pago,
        id_detalle: items[0]?.id_detalle ?? null,
        monto_total: sumTotalItems(items),
        items,
      };
      if (!(payload.id_movimiento > 0)) throw new Error("Falta el ID del ingreso a editar.");
      const resp = await onSubmit?.(payload, true);
      const idMovimientoFinal = Number(resp?.id_movimiento ?? resp?.id ?? payload.id_movimiento ?? 0);
      if (!(idMovimientoFinal > 0)) throw new Error("No se pudo determinar el ID del ingreso actualizado.");
      if (marcarEliminarComprobante && comprobanteActual && !archivoNuevo) {
        await eliminarComprobanteExistente(idMovimientoFinal);
      }
      if (archivoNuevo) await subirComprobanteNuevo(idMovimientoFinal, archivoNuevo);
      await onSaved?.(resp);
    } catch (err) {
      showToast("error", err?.message || "Error actualizando ingreso.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  const overlayClass = [
    "mi-modal__overlay",
    "mi-modal__overlay--mov",
    dark ? "mi-modal__overlay--dark" : "",
  ].join(" ").trim();

  const containerClass = [
    "mi-modal__container",
    "mi-modal__container--mov",
    "mi-modal__container--venta",
    dark ? "mi-modal--dark" : "",
  ].join(" ").trim();

  return createPortal(
    <>
      <div
        className={overlayClass}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <div
          className={containerClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mi-modal-editar-ingreso-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* ── HEADER ── */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-left">
              <h2 id="mi-modal-editar-ingreso-title" className="mi-modal__title">
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

          {/* ── FORM ── */}
          <form onSubmit={submit} className="mi-em-form">
            <div className="mi-em-grid">

              {/* ════════ PANEL IZQUIERDO — Ítems ════════ */}
              <section className="mi-em-panel">
                <div
                  className="mi-em-panelHead"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                >
                  <span>Ítems del ingreso</span>
                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost"
                    onClick={addItem}
                    disabled={saving}
                    style={{ height: 34, padding: "0 14px", fontSize: 13 }}
                  >
                    + Agregar ítem
                  </button>
                </div>

                <div className="mi-em-panelBody">
                  <div style={{ display: "grid", gap: 14 }}>
                    {(form.items || []).map((it, index) => (
                      <div
                        key={it.uid}
                        style={{
                          border: "1px solid rgba(148,163,184,.28)",
                          borderRadius: 14,
                          padding: 14,
                          display: "grid",
                          gap: 12,
                        }}
                      >
                        {/* Cabecera ítem */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                          <strong style={{ fontSize: 13 }}>
                            Ítem {index + 1}
                          </strong>
                          {(form.items || []).length > 1 && (
                            <button
                              type="button"
                              className="mit-btn mit-btn--ghost"
                              onClick={() => removeItem(it.uid)}
                              disabled={saving}
                              style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                            >
                              Quitar
                            </button>
                          )}
                        </div>

                        {/* Grid inputs: Detalle | Cantidad | Precio | IVA% | Monto total */}
{/* Fila 1: Detalle | Cantidad | Precio */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "1.6fr 0.8fr 1fr",
    gap: 12,
  }}
>
  <div className="fl-field">
    <select
      className="fl-input fl-select"
      value={String(it.id_detalle || "")}
      onChange={(e) => updateItem(it.uid, { id_detalle: e.target.value })}
      disabled={saving}
    >
      <option value="">-- Seleccionar --</option>
      {detalles.map((d) => (
        <option key={d.id} value={String(d.id)}>
          {d.nombre}
        </option>
      ))}
    </select>
    <label className="fl-label">Detalle</label>
  </div>

  <div className="fl-field">
    <input
      className="fl-input"
      type="number"
      min="0"
      step="0.001"
      value={it.cantidad}
      onChange={(e) => updateItem(it.uid, { cantidad: e.target.value })}
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
      value={it.precio}
      onChange={(e) => updateItem(it.uid, { precio: e.target.value })}
      disabled={saving}
    />
    <label className="fl-label">Precio</label>
  </div>
</div>

{/* Fila 2: IVA % | Monto total */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "0.8fr 1fr",
    gap: 12,
    marginTop: 12,
  }}
>
  <div className="fl-field">
    <select
      className="fl-input fl-select"
      value={String(it.iva_pct)}
      onChange={(e) => updateItem(it.uid, { iva_pct: e.target.value })}
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

  <div className="fl-field">
    <input
      className="fl-input"
      type="number"
      min="0"
      step="0.01"
      value={it.total}
      onChange={(e) => handleMontoItemManual(it.uid, e.target.value)}
      disabled={saving}
    />
    <label className="fl-label">Monto total</label>
  </div>
</div>

{/* Fila 3: Subtotal | IVA $ | Total final */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
    marginTop: 12,
  }}
>
  <div className="fl-field">
    <input className="fl-input" value={it.subtotal} disabled />
    <label className="fl-label">Subtotal</label>
  </div>

  <div className="fl-field">
    <input className="fl-input" value={it.iva_monto} disabled />
    <label className="fl-label">IVA $</label>
  </div>

  <div className="fl-field">
    <input className="fl-input" value={it.total} disabled />
    <label className="fl-label">Total final</label>
  </div>
</div>


                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* ════════ ASIDE DERECHO — Datos generales ════════ */}
              <aside className="mi-em-aside">
                <div className="mi-em-asideTitle">Datos generales</div>

                <div className="mi-em-dates">
                  <div className="fl-field fl-col-full">
                    <input
                      ref={fechaRef}
                      className="fl-input mi-date-field"
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
                      disabled={saving}
                      onClick={openDatePicker}
                      onFocus={openDatePicker}
                    />
                    <label className="fl-label">Fecha</label>
                  </div>
                </div>

                <div className="mi-em-asideBody mi-em-asideBodyheght">

                  {/* ── Medio de pago ── */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(form.id_medio_pago || "")}
                      onChange={(e) => setForm((p) => ({ ...p, id_medio_pago: e.target.value }))}
                      disabled={saving}
                    >
                      <option value="">-- Seleccionar medio de pago --</option>
                      {mediosPago.map((x) => (
                        <option key={x.id} value={String(x.id)}>{x.nombre}</option>
                      ))}
                    </select>
                    <label className="fl-label">Medio de pago</label>
                  </div>

                  {/* ── Total general ── */}
                  <div className="fl-field">
                    <input className="fl-input" value={totalGeneral} disabled />
                    <label className="fl-label">Total general</label>
                  </div>

                  {/* ── Comprobante ── */}
                  <div className="mi-uploadCard">
                    <div className="mi-uploadCard__head">
                      <div>
                        <div className="mi-uploadCard__title">Comprobante</div>
                        <div className="mi-uploadCard__sub">
                          Ver, quitar o reemplazar el archivo actual
                        </div>
                      </div>
                    </div>

                    <div className="mi-uploadCard__body">
                      {loadingComprobante ? (
                        <div style={{ fontSize: 13, opacity: 0.75, padding: "8px 0" }}>
                          Cargando comprobante…
                        </div>
                      ) : (
                        <>
                          {/* Archivo actual */}
                          {mostrarArchivoActual && (
                            <div className="mi-uploadFile is-filled">
                              <div className="mi-uploadFile__icon">📄</div>
                              <div className="mi-uploadFile__meta">
                                <div className="mi-uploadFile__name" title={nombreComprobanteVisible}>
                                  {nombreComprobanteVisible}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={abrirViewer}
                                  disabled={saving}
                                  title="Ver comprobante"
                                >
                                  👁 Ver
                                </button>
                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={marcarEliminar}
                                  disabled={saving}
                                  title="Quitar comprobante"
                                >
                                  🗑 Quitar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Archivo nuevo seleccionado */}
                          {archivoNuevo && (
                            <div className="mi-uploadFile is-filled">
                              <div className="mi-uploadFile__icon">📄</div>
                              <div className="mi-uploadFile__meta">
                                <div className="mi-uploadFile__name" title={archivoNuevo.name}>
                                  {archivoNuevo.name}
                                </div>
                                <div className="mi-uploadFile__size">
                                  {Math.max(1, Math.round((archivoNuevo.size || 0) / 1024))} KB
                                </div>
                              </div>
                              <button
                                type="button"
                                className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                onClick={quitarArchivoNuevo}
                                disabled={saving}
                                style={{ marginLeft: "auto" }}
                              >
                                ✕ Quitar
                              </button>
                            </div>
                          )}

                          {/* Sin comprobante / marcado para eliminar */}
                          {!mostrarArchivoActual && !archivoNuevo && (
                            <div className="mi-uploadFile">
                              <div className="mi-uploadFile__empty">
                                {marcarEliminarComprobante
                                  ? "El comprobante actual será eliminado al guardar"
                                  : "Este ingreso no tiene comprobante asociado"}
                              </div>
                            </div>
                          )}

                          {/* Barra de acciones */}
                          <div className="mi-uploadBar" style={{ marginTop: 10 }}>
                            {marcarEliminarComprobante && !archivoNuevo && (
                              <button
                                type="button"
                                className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                onClick={restaurarComprobanteActual}
                                disabled={saving}
                              >
                                Cancelar quitar
                              </button>
                            )}

                            <input
                              ref={inputFileRef}
                              type="file"
                              accept={fileAcceptText()}
                              onChange={seleccionarArchivo}
                              disabled={saving}
                              style={{ display: "none" }}
                            />

                            <button
                              type="button"
                              className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                              onClick={() => inputFileRef.current?.click()}
                              disabled={saving}
                              style={{
                                gridColumn: marcarEliminarComprobante && !archivoNuevo ? "auto" : "1 / -1",
                              }}
                            >
                              ↑ {mostrarArchivoActual ? "Reemplazar archivo" : "Seleccionar archivo"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Acciones ── */}
                  <div className="mi-em-actions">
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

                </div>
              </aside>
            </div>
          </form>
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