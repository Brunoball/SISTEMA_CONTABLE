import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";
import "./ModalNuevoPresupuesto.css";
import BASE_URL from "../../../../config/config";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faPlus,
  faTrashCan,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { savePresupuestoPdf } from "../../../../utils/PresupuestoPdfBuilder";

const NULL_OPTION = "";
const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    return `$ ${Number(v || 0).toFixed(2)}`;
  }
}

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getClienteId(c) {
  const cand = c?.id ?? c?.id_cliente ?? c?.idCliente ?? c?.cliente_id ?? c?.idcliente ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getDetalleId(d) {
  const cand = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getStockProductoId(d) {
  const cand = d?.id_stock_producto ?? d?.idStockProducto ?? d?.stock_producto_id ?? d?.id_producto ?? d?.idProducto ?? getDetalleId(d);
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getClienteNombre(c) {
  return safeStr(c?.nombre || c?.razon_social || c?.cliente || c?.label || "");
}

function getDetalleNombre(d) {
  return safeStr(d?.nombre || d?.descripcion || d?.detalle || d?.producto || d?.label || "");
}

function getDetalleCodigo(d) {
  return safeStr(d?.sku || d?.codigo || d?.codigo_barra || d?.codigo_producto || "");
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

function normalizeTipoPrecioNombre(nombre) {
  return String(nombre ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getDetallePreciosDisponibles(detalle) {
  const lista = Array.isArray(detalle?.precios) ? detalle.precios : [];
  const out = [];
  const seen = new Set();

  lista.forEach((p, i) => {
    const idTipo = Number(p?.id_tipo_precio_stock ?? 0);
    const monto = Number(p?.monto ?? p?.precio ?? p?.precio_venta ?? 0);
    const tipoPrecio = safeStr(p?.tipo_precio || p?.nombre || (idTipo > 0 ? `Precio ${idTipo}` : `Precio ${i + 1}`));
    if (!Number.isFinite(monto)) return;
    const key = `${idTipo}|${tipoPrecio}|${monto}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      value: idTipo > 0 ? String(idTipo) : `precio_${i + 1}`,
      id_tipo_precio_stock: idTipo > 0 ? idTipo : null,
      tipo_precio: tipoPrecio || `Precio ${i + 1}`,
      monto,
      label: `${tipoPrecio || `Precio ${i + 1}`} - ${moneyARS(monto)}`,
    });
  });

  if (!out.length) {
    const montoFallback = Number(detalle?.precio ?? detalle?.precio_venta ?? detalle?.precio_promocional ?? 0);
    out.push({
      value: "default",
      id_tipo_precio_stock: null,
      tipo_precio: "PRECIO",
      monto: Number.isFinite(montoFallback) ? montoFallback : 0,
      label: `PRECIO - ${moneyARS(Number.isFinite(montoFallback) ? montoFallback : 0)}`,
    });
  }

  return out;
}

function pickDetallePrecioInicial(precios) {
  if (!Array.isArray(precios) || !precios.length) return null;
  const byName = precios.find((p) => {
    const nombre = normalizeTipoPrecioNombre(p?.tipo_precio);
    return nombre === "PRECIO DE VENTA" || nombre === "PRECIO VENTA" || nombre === "VENTA";
  });
  if (byName) return byName;
  return precios.find((p) => Number(p?.id_tipo_precio_stock ?? 0) === 2) || precios[0] || null;
}

function buildEmptyRow() {
  return {
    id: uid(),
    id_detalle: NULL_OPTION,
    id_stock_producto: NULL_OPTION,
    detalleText: "",
    codigo: "",
    cantidad: 1,
    precio: 0,
    id_tipo_precio_stock: NULL_OPTION,
    precio_tipo_label: "",
    precios_disponibles: [],
    ivaPct: 0,
    stock_disponible: null,
  };
}

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);
  return {
    clientes: pick("clientes"),
    detalles: pick("detalles"),
  };
}

function buildAuthHeaders(isJson = true) {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  const token = localStorage.getItem("token") || "";
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}`);
  }
  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function apiGetJson(url) {
  const res = await fetch(url, { method: "GET", headers: buildAuthHeaders(false) });
  return await parseJsonOrThrow(res);
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
  const headers = buildAuthHeaders(false);
  const res = await fetch(url, { method: "POST", headers, body: formData });
  return await parseJsonOrThrow(res);
}

export default function ModalNuevoPresupuesto({ open, lists, onClose, onToast, onSaved }) {
  const API = `${BASE_URL}/api.php`;
  const normalizedLists = useMemo(() => normalizeLists(lists), [lists]);
  const clientesList = normalizedLists.clientes;
  const detallesList = normalizedLists.detalles;

  const [fecha, setFecha] = useState(todayISO());
  const [cliInput, setCliInput] = useState("");
  const [clienteSel, setClienteSel] = useState(null);
  const [observaciones, setObservaciones] = useState("");
  const [rows, setRows] = useState([buildEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [configFacturacion, setConfigFacturacion] = useState(null);

  useEffect(() => {
    if (!open) return;
    setFecha(todayISO());
    setCliInput("");
    setClienteSel(null);
    setObservaciones("");
    setRows([buildEmptyRow()]);
    setSaving(false);
    let alive = true;
    apiGetJson(`${API}?action=config_facturacion_get`)
      .then((data) => {
        if (!alive) return;
        setConfigFacturacion(data?.config || data?.data || null);
      })
      .catch(() => {
        if (alive) setConfigFacturacion(null);
      });
    return () => {
      alive = false;
    };
  }, [open, API]);

  const updateRow = useCallback((rowId, patch) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((rowId) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, buildEmptyRow()]);
  }, []);

  const handleSelectCliente = useCallback((cliente) => {
    const id = getClienteId(cliente);
    setClienteSel(id ? cliente : null);
    setCliInput(getClienteNombre(cliente));
  }, []);

  const handleClienteInputChange = useCallback((value) => {
    setCliInput(value);
    const norm = normalizeText(value);
    const exact = clientesList.find((c) => normalizeText(getClienteNombre(c)) === norm) || null;
    setClienteSel(exact);
  }, [clientesList]);

  const handleSelectDetalle = useCallback((rowId, detalle) => {
    const precios = getDetallePreciosDisponibles(detalle);
    const inicial = pickDetallePrecioInicial(precios);
    updateRow(rowId, {
      id_detalle: getDetalleId(detalle) || NULL_OPTION,
      id_stock_producto: getStockProductoId(detalle) || NULL_OPTION,
      detalleText: getDetalleNombre(detalle),
      codigo: getDetalleCodigo(detalle),
      precio: inicial ? safeNumber(inicial.monto) : 0,
      id_tipo_precio_stock: inicial?.value || NULL_OPTION,
      precio_tipo_label: inicial?.tipo_precio || "",
      precios_disponibles: precios,
      stock_disponible: getStockDisponible(detalle),
    });
  }, [updateRow]);

  const handleDetalleInputChange = useCallback((rowId, value) => {
    updateRow(rowId, {
      detalleText: value,
      id_detalle: NULL_OPTION,
      id_stock_producto: NULL_OPTION,
      codigo: "",
      precios_disponibles: [],
      precio_tipo_label: "",
    });
  }, [updateRow]);

  const handlePrecioTipoChange = useCallback((rowId, value) => {
    const row = rows.find((r) => r.id === rowId);
    const p = row?.precios_disponibles?.find((x) => String(x.value) === String(value));
    updateRow(rowId, {
      id_tipo_precio_stock: value,
      precio_tipo_label: p?.tipo_precio || "",
      precio: p ? safeNumber(p.monto) : safeNumber(row?.precio),
    });
  }, [rows, updateRow]);

  const computedRows = useMemo(() => {
    return rows.map((r) => {
      const cantidad = safeNumber(r.cantidad);
      const precio = safeNumber(r.precio);
      const ivaPct = safeNumber(r.ivaPct);
      const subtotal = cantidad * precio;
      const iva_monto = subtotal * ivaPct / 100;
      const total = subtotal + iva_monto;
      return { ...r, cantidad, precio, ivaPct, subtotal, iva_monto, total };
    });
  }, [rows]);

  const totals = useMemo(() => {
    return computedRows.reduce(
      (acc, r) => ({
        subtotal: acc.subtotal + safeNumber(r.subtotal),
        iva: acc.iva + safeNumber(r.iva_monto),
        total: acc.total + safeNumber(r.total),
      }),
      { subtotal: 0, iva: 0, total: 0 }
    );
  }, [computedRows]);

  const validate = useCallback(() => {
    const idCliente = getClienteId(clienteSel);
    if (!idCliente) return "Seleccioná un cliente del listado.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return "Seleccioná una fecha válida.";
    const validItems = computedRows.filter((r) => safeStr(r.detalleText) && r.cantidad > 0 && r.precio > 0);
    if (!validItems.length) return "Agregá al menos un producto o servicio con cantidad y precio.";

    const problems = [];
    computedRows.forEach((r, idx) => {
      const touched = safeStr(r.detalleText) || r.cantidad > 0 || r.precio > 0;
      if (!touched) return;
      if (!safeStr(r.detalleText)) problems.push(`Fila ${idx + 1}: falta el detalle.`);
      if (!(r.cantidad > 0)) problems.push(`Fila ${idx + 1}: la cantidad debe ser mayor a 0.`);
      if (!(r.precio > 0)) problems.push(`Fila ${idx + 1}: el precio debe ser mayor a 0.`);
    });
    return problems[0] || "";
  }, [clienteSel, fecha, computedRows]);

  const buildItemsPayload = useCallback(() => {
    return computedRows
      .filter((r) => safeStr(r.detalleText) && r.cantidad > 0 && r.precio > 0)
      .map((r) => ({
        id_detalle: r.id_detalle || null,
        id_stock_producto: r.id_stock_producto || null,
        codigo: r.codigo || "",
        descripcion: safeStr(r.detalleText),
        detalle: safeStr(r.detalleText),
        cantidad: r.cantidad,
        precio: r.precio,
        precio_unitario: r.precio,
        iva_pct: r.ivaPct,
        subtotal: r.subtotal,
        iva_monto: r.iva_monto,
        total: r.total,
        id_tipo_precio_stock: r.id_tipo_precio_stock || null,
        tipo_precio: r.precio_tipo_label || "",
      }));
  }, [computedRows]);

  const uploadPresupuestoPdf = useCallback(async ({ idMovimiento, payload, items }) => {
    const clienteNombre = getClienteNombre(clienteSel) || cliInput;
    const pdfData = {
      ...payload,
      id_movimiento: idMovimiento,
      numero_presupuesto: idMovimiento,
      fecha_cbte_iso: fecha,
      cliente_nombre: clienteNombre,
      cliente: {
        nombre: clienteNombre,
        cuit: safeStr(clienteSel?.cuit || clienteSel?.doc_nro || clienteSel?.dni || ""),
        condicion_iva: safeStr(clienteSel?.condicion_iva || clienteSel?.cond_iva || ""),
        domicilio: safeStr(clienteSel?.domicilio || clienteSel?.direccion || ""),
      },
      config_facturacion: configFacturacion || {},
      items,
      items_facturacion: items,
      subtotal_ars: totals.subtotal,
      iva_ars: totals.iva,
      total_ars: totals.total,
      observaciones,
    };

    const { blob, filename } = await savePresupuestoPdf({ data: pdfData, download: false });
    const file = new File([blob], filename, { type: "application/pdf" });
    const fd = new FormData();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("tipo", "PRESUPUESTO");
    fd.append("force", "1");
    fd.append("pdf", file, filename);
    fd.append("meta", JSON.stringify({
      tipo: "PRESUPUESTO",
      emitido_en_arca: 0,
      id_movimiento: idMovimiento,
      ids_movimiento: [idMovimiento],
      id_cliente: getClienteId(clienteSel),
      razon_social: clienteNombre,
      fecha_cbte: fecha.replace(/-/g, ""),
      fecha_cbte_iso: fecha,
      monto_ars: totals.total,
      resumen_facturacion: pdfData,
    }));

    return await apiPostForm(`${API}?action=ventas_comprobantes_vincular_movimiento`, fd);
  }, [API, clienteSel, cliInput, configFacturacion, fecha, observaciones, totals]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const msg = validate();
    if (msg) {
      onToast?.("error", msg, 4200);
      return;
    }

    const idCliente = getClienteId(clienteSel);
    const items = buildItemsPayload();
    const payload = {
      fecha,
      id_cliente: idCliente,
      cliente_nombre: getClienteNombre(clienteSel) || cliInput,
      subtotal: totals.subtotal,
      iva_total: totals.iva,
      total: totals.total,
      monto_total: totals.total,
      observaciones,
      items,
    };

    setSaving(true);
    try {
      const creado = await apiPostJson(`${API}?action=presupuestos_crear`, payload);
      const idMovimiento = Number(creado?.id_movimiento || creado?.movimiento?.id_movimiento || 0);
      if (!idMovimiento) throw new Error("El presupuesto se guardó, pero el backend no devolvió id_movimiento.");
      await uploadPresupuestoPdf({ idMovimiento, payload, items });
      onToast?.("exito", "Presupuesto generado y vinculado correctamente.", 3200);
      onSaved?.({ id_movimiento: idMovimiento });
    } catch (err) {
      onToast?.("error", err?.message || "No se pudo generar el presupuesto.", 5200);
    } finally {
      setSaving(false);
    }
  }, [API, buildItemsPayload, clienteSel, cliInput, fecha, observaciones, onSaved, onToast, totals, uploadPresupuestoPdf, validate]);

  if (!open) return null;

  return createPortal(
    <div
      className="mi-modal__overlay mi-modal__overlay--mov presupuesto-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.();
      }}
    >
      <div
        className="mi-modal__container mi-modal__container--mov presupuesto-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo presupuesto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true"><FontAwesomeIcon icon={faFileInvoiceDollar} /></div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Nuevo Presupuesto</h2>
            <p className="mi-modal__subtitle">Documento no fiscal, sin ARCA, sin CAE y sin medio de pago.</p>
          </div>
          <button type="button" className="mi-modal__close" onClick={onClose} disabled={saving} title="Cerrar" aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <form className="mi-modal__content presupuesto-modal__content" onSubmit={handleSubmit}>
          <div className="nc-grid nc-grid--2">
            <label className="nc-field">
              <span className="nc-label">Fecha *</span>
              <input className="nc-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={saving} />
            </label>

            <div className="nc-field">
              <GlobalAutocomplete
                value={cliInput}
                onChange={handleClienteInputChange}
                onSelect={handleSelectCliente}
                options={clientesList}
                getOptionLabel={(c) => getClienteNombre(c)}
                getOptionValue={(c) => String(getClienteId(c) || getClienteNombre(c))}
                label="Cliente *"
                placeholder="Buscar cliente…"
                disabled={saving}
                showAllOnFocus={true}
                maxItems={25}
                inputClassName="nc-input"
              />
            </div>
          </div>

          <div className="mi-cr-block">
            <div className="mi-cr-block__head">
              <div>
                <div className="mi-cr-block__title">Productos / servicios</div>
                <div className="mi-cr-block__hint">El presupuesto se arma igual que una venta, pero no impacta caja ni solicita medio de pago.</div>
              </div>
              <button type="button" className="mov-btn mov-btn--soft" onClick={addRow} disabled={saving}>
                <FontAwesomeIcon icon={faPlus} /> Agregar ítem
              </button>
            </div>

            <div className="nv-itemsTable nv-itemsTable--presupuesto">
              <div className="nv-itemsHead" style={{ gridTemplateColumns: "2fr 0.9fr 0.9fr 1fr 0.8fr 1fr 42px" }}>
                <div>Detalle</div>
                <div>Cantidad</div>
                <div>Precio</div>
                <div>Tipo precio</div>
                <div>IVA</div>
                <div>Total</div>
                <div />
              </div>

              {computedRows.map((r) => (
                <div key={r.id} className="nv-itemsRow" style={{ gridTemplateColumns: "2fr 0.9fr 0.9fr 1fr 0.8fr 1fr 42px" }}>
                  <div className="nv-cell">
                    <GlobalAutocomplete
                      value={r.detalleText}
                      onChange={(val) => handleDetalleInputChange(r.id, val)}
                      onSelect={(d) => handleSelectDetalle(r.id, d)}
                      options={detallesList}
                      getOptionLabel={(d) => getDetalleNombre(d)}
                      getOptionValue={(d) => String(getDetalleId(d) || getDetalleNombre(d))}
                      placeholder="Producto o servicio…"
                      disabled={saving}
                      showAllOnFocus={false}
                      maxItems={18}
                      inputClassName="nv-cell-input"
                    />
                  </div>
                  <div className="nv-cell">
                    <input className="nv-cell-input" type="number" min="0" step="0.01" value={r.cantidad} onChange={(e) => updateRow(r.id, { cantidad: e.target.value })} disabled={saving} />
                  </div>
                  <div className="nv-cell">
                    <input className="nv-cell-input" type="number" min="0" step="0.01" value={r.precio} onChange={(e) => updateRow(r.id, { precio: e.target.value })} disabled={saving} />
                  </div>
                  <div className="nv-cell">
                    <select className="nv-cell-input" value={r.id_tipo_precio_stock || ""} onChange={(e) => handlePrecioTipoChange(r.id, e.target.value)} disabled={saving || !r.precios_disponibles?.length}>
                      {(r.precios_disponibles?.length ? r.precios_disponibles : [{ value: "", label: "Precio manual" }]).map((p) => (
                        <option key={p.value || "manual"} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="nv-cell">
                    <select className="nv-cell-input" value={r.ivaPct} onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })} disabled={saving}>
                      {IVA_OPTIONS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                  </div>
                  <div className="nv-cell nv-cell--money">{moneyARS(r.total)}</div>
                  <div className="nv-cell nv-cell--action">
                    <button type="button" className="mov-iconBtn mov-iconBtn--danger" onClick={() => removeRow(r.id)} disabled={saving || rows.length <= 1} title="Eliminar fila">
                      <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="nc-field">
            <span className="nc-label">Observaciones</span>
            <textarea className="nc-input" rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} disabled={saving} placeholder="Notas internas o condiciones del presupuesto…" />
          </label>

          <div className="mi-cr-summary">
            <div><span>Subtotal</span><b>{moneyARS(totals.subtotal)}</b></div>
            <div><span>IVA</span><b>{moneyARS(totals.iva)}</b></div>
            <div className="mi-cr-summary__total"><span>Total</span><b>{moneyARS(totals.total)}</b></div>
          </div>

          <div className="presupuesto-modal__footer">
            <button type="button" className="mov-btn mov-btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="mov-btn mov-btn--primary" disabled={saving}>
              <FontAwesomeIcon icon={faFileInvoiceDollar} /> {saving ? "Generando…" : "Guardar presupuesto"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
