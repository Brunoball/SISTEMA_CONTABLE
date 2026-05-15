// src/components/Movimientos/modales/ModalEditarRecibo.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/roots.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faReceipt,
  faCalendarDays,
  faUser,
  faBoxOpen,
  faDollarSign,
} from "@fortawesome/free-solid-svg-icons";

const NULL_OPTION = "";

/* =========================
   Helpers
========================= */
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
    return `$ ${safeNumber(v).toFixed(2)}`;
  }
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function periodoToMMYYYY(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${mm}-${yyyy}`;
  }

  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${mm}-${yyyy}`;
  }

  return s;
}

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  return s;
}

function periodoFromISODate(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";

  const [y, m] = s.split("-");
  return `${m}-${y}`;
}

function normalizeSearchText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDarkEnabled(darkProp) {
  if (darkProp === true) return true;
  if (typeof document === "undefined") return false;

  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");

  return Boolean(byAttr || byBody);
}

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

    const cand =
      u?.idUsuarioMaster ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      u?.user_id ??
      0;

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

async function apiGetJson(url) {
  const { token, sessionKey } = getAuthInfo();

  const headers = {};

  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  return await parseJsonOrThrow(res);
}

function getArr(x) {
  return Array.isArray(x) ? x : [];
}

function getIdGeneric(x) {
  const cand =
    x?.id ??
    x?.id_stock_producto ??
    x?.idStockProducto ??
    x?.stock_producto_id ??
    x?.id_detalle ??
    x?.idDetalle ??
    x?.detalle_id ??
    0;
  const n = Number(cand);

  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getIdCliente(x) {
  const cand = x?.id ?? x?.id_cliente ?? x?.idCliente ?? x?.cliente_id ?? 0;
  const n = Number(cand);

  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getReciboItemsDetalle(row) {
  const raw = row?.items_detalle ?? row?.itemsDetalle ?? row?.items ?? row?.productos ?? [];

  if (Array.isArray(raw)) return raw.filter(Boolean);

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getPrimerItemRecibo(row) {
  const items = getReciboItemsDetalle(row);
  return items.length ? items[0] : null;
}

function getProductoIdFromRecibo(row) {
  const item = getPrimerItemRecibo(row);
  const cand =
    item?.id_stock_producto ??
    item?.idStockProducto ??
    item?.stock_producto_id ??
    item?.id_detalle ??
    item?.idDetalle ??
    row?.id_stock_producto ??
    row?.idStockProducto ??
    row?.stock_producto_id ??
    row?.id_detalle ??
    row?.idDetalle ??
    null;

  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? String(n) : NULL_OPTION;
}

function isResumenProductosLabel(value) {
  const s = normalizeSearchText(value);
  return (
    s === "sin productos" ||
    /^\d+\s+producto(s)?$/.test(s) ||
    /^producto(s)?\s*:\s*\d+$/.test(s)
  );
}

function getProductoNombreFromRecibo(row) {
  const item = getPrimerItemRecibo(row);
  const fromItem = String(
    item?.producto_nombre ??
      item?.stock_producto_nombre ??
      item?.detalle_nombre ??
      item?.nombre ??
      item?.descripcion ??
      ""
  ).trim();
  if (fromItem) return fromItem;

  const original = String(
    row?.detalle_original ?? row?.producto_nombre ?? row?.stock_producto_nombre ?? ""
  ).trim();
  if (original) return original.split("|")[0].trim();

  const detalle = String(row?.detalle ?? row?.descripcion ?? row?.concepto ?? "").trim();
  return detalle && !isResumenProductosLabel(detalle) ? detalle : "";
}

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;

  return {
    detalles: Array.isArray(l.detalles) ? l.detalles : [],
    clientes: Array.isArray(l.clientes) ? l.clientes : [],
  };
}

export default function ModalEditarRecibo({
  open,
  row,
  lists,
  periodoDefault,
  onClose,
  onSave,
  onToast,
  dark,
}) {
  const API_LISTS = `${BASE_URL}/api.php?action=global_obtener_listas`;
  const darkOn = isDarkEnabled(dark);

  const showToast = useCallback((tipo, mensaje) => onToast?.(tipo, mensaje), [onToast]);

  const [saving, setSaving] = useState(false);
  const [localLists, setLocalLists] = useState(() => normalizeLists(lists));

  const [form, setForm] = useState({
    id_movimiento: null,
    fecha: "",
    periodo: "",
    id_cliente: NULL_OPTION,
    clienteInput: "",
    id_detalle: NULL_OPTION,
    detalleInput: "",
    monto_total: "",
  });

  const [detalleFocus, setDetalleFocus] = useState(false);
  const [detalleArmed, setDetalleArmed] = useState(false);
  const [clienteFocus, setClienteFocus] = useState(false);
  const [clienteArmed, setClienteArmed] = useState(false);

  const closeBtnRef = useRef(null);
  const fechaInputRef = useRef(null);

  const openNativeDatePicker = useCallback(
    (input) => {
      if (!input || saving) return;

      input.focus();

      if (typeof input.showPicker === "function") {
        try {
          input.showPicker();
        } catch {}
      }
    },
    [saving]
  );

  useEffect(() => {
    setLocalLists(normalizeLists(lists));
  }, [lists]);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscKey = (e) => {
      if (e.key === "Escape") {
        if (!saving) onClose?.();
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => document.removeEventListener("keydown", handleEscKey);
  }, [open, saving, onClose]);

  const refreshLists = useCallback(async () => {
    const data = await apiGetJson(API_LISTS);
    const normalized = normalizeLists(data);

    setLocalLists((prev) => ({
      detalles: normalized.detalles?.length ? normalized.detalles : prev.detalles,
      clientes: normalized.clientes?.length ? normalized.clientes : prev.clientes,
    }));
  }, [API_LISTS]);

  useEffect(() => {
    if (!open) return;

    refreshLists().catch(() => {});

    const r = row || {};
    const fecha = String(r.fecha || "").slice(0, 10);

    const perRow = periodoToMMYYYY(r.periodo);
    const perDef = periodoToMMYYYY(periodoDefault);
    const perAuto = periodoFromISODate(fecha);

    const idCliente = r.id_cliente ?? r.cliente_id ?? r.idCliente ?? NULL_OPTION;

    const clienteTxt = String(
      r.cliente ?? r.nombre_cliente ?? r.razon_social_cliente ?? ""
    ).trim();

    // La tabla muestra "1 PRODUCTO" como resumen, pero para editar necesitamos
    // el producto real guardado en movimientos_items / detalle_original.
    const idDetalle = getProductoIdFromRecibo(r);
    const productoTxt = getProductoNombreFromRecibo(r);
    const detFallback = productoTxt || "";

    const cliName = String(
      getArr(localLists.clientes).find(
        (c) => String(getIdCliente(c)) === String(idCliente)
      )?.nombre ??
        getArr(localLists.clientes).find(
          (c) => String(getIdCliente(c)) === String(idCliente)
        )?.razon_social ??
        ""
    ).trim();

    const detName = String(
      getArr(localLists.detalles).find(
        (d) => String(getIdGeneric(d)) === String(idDetalle)
      )?.nombre ?? ""
    ).trim();

    setSaving(false);
    setDetalleFocus(false);
    setDetalleArmed(false);
    setClienteFocus(false);
    setClienteArmed(false);

    setForm({
      id_movimiento: safeNumber(r.id_movimiento) || null,
      fecha: fecha || "",
      periodo: perRow || perDef || perAuto || "",
      id_cliente: String(idCliente ?? NULL_OPTION),
      clienteInput: cliName || clienteTxt || "",
      id_detalle: String(idDetalle ?? NULL_OPTION),
      detalleInput: detFallback || detName || "",
      monto_total: safeNumber(r.monto_total ?? r.total ?? 0),
    });

    setTimeout(() => closeBtnRef.current?.focus(), 0);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, periodoDefault]);

  const filteredDetalles = useMemo(() => {
    const all = getArr(localLists.detalles);
    const q = normalizeSearchText(form.detalleInput);

    if (!detalleFocus || !detalleArmed || q.length < 1) return [];

    return all.filter((d) => normalizeSearchText(d?.nombre).includes(q)).slice(0, 25);
  }, [localLists.detalles, form.detalleInput, detalleFocus, detalleArmed]);

  const filteredClientes = useMemo(() => {
    const all = getArr(localLists.clientes);
    const q = normalizeSearchText(form.clienteInput);

    if (!clienteFocus || !clienteArmed || q.length < 1) return [];

    return all
      .filter((c) =>
        normalizeSearchText(c?.nombre ?? c?.razon_social ?? c?.cliente).includes(q)
      )
      .slice(0, 25);
  }, [localLists.clientes, form.clienteInput, clienteFocus, clienteArmed]);

  const handleDetalleInputChange = (e) => {
    const value = e.target.value;

    setDetalleArmed(true);

    setForm((p) => ({
      ...p,
      detalleInput: value,
      id_detalle: NULL_OPTION,
    }));
  };

  const handleSelectDetalle = (det) => {
    const nombre = String(det?.nombre ?? "").trim();
    const did = getIdGeneric(det) || det?.id;

    setForm((p) => ({
      ...p,
      detalleInput: nombre,
      id_detalle: String(did ?? NULL_OPTION),
    }));

    setDetalleFocus(false);
    setDetalleArmed(false);
  };

  const handleClienteInputChange = (e) => {
    const value = e.target.value;

    setClienteArmed(true);

    setForm((p) => ({
      ...p,
      clienteInput: value,
      id_cliente: NULL_OPTION,
    }));
  };

  const handleSelectCliente = (cli) => {
    const nombre = String(cli?.nombre ?? cli?.razon_social ?? cli?.cliente ?? "").trim();
    const cid = getIdCliente(cli) || cli?.id;

    setForm((p) => ({
      ...p,
      clienteInput: nombre,
      id_cliente: String(cid ?? NULL_OPTION),
    }));

    setClienteFocus(false);
    setClienteArmed(false);
  };

  const handleFechaChange = useCallback(
    (e) => {
      const nuevaFecha = e.target.value;

      if (nuevaFecha && nuevaFecha > todayISO()) {
        showToast("advertencia", "No podés seleccionar una fecha posterior al día actual.");
        return;
      }

      setForm((p) => ({
        ...p,
        fecha: nuevaFecha,
        periodo: periodoFromISODate(nuevaFecha) || p.periodo,
      }));
    },
    [showToast]
  );

  const resumen = useMemo(() => {
    const monto = Math.max(0, safeNumber(form.monto_total));

    return {
      total: monto,
      cliente: String(form.clienteInput || "").trim() || "Sin cliente",
      detalle: String(form.detalleInput || "").trim() || "Sin detalle",
      periodo: String(form.periodo || "").trim() || "--",
    };
  }, [form]);

  const submit = async (e) => {
    e?.preventDefault?.();

    if (saving) return;

    try {
      setSaving(true);

      if (!String(form.fecha || "").trim()) {
        throw new Error("Completá la fecha.");
      }

      if (form.fecha > todayISO()) {
        throw new Error("La fecha no puede ser posterior al día actual.");
      }

      const perUI = periodoToMMYYYY(form.periodo) || periodoFromISODate(form.fecha);
      const perAPI = periodoToYYYYMM(perUI);

      if (!perAPI) {
        throw new Error("No se pudo calcular el período desde la fecha.");
      }

      const idDet =
        form.id_detalle && form.id_detalle !== NULL_OPTION ? Number(form.id_detalle) : null;

      if (!idDet) {
        throw new Error("Seleccioná un detalle.");
      }

      const montoFinal = Math.max(0, Math.round(safeNumber(form.monto_total) * 100) / 100);

      if (!(montoFinal > 0)) {
        throw new Error("Ingresá un monto válido mayor a 0.");
      }

      const payloadFinal = {
        id_movimiento: form.id_movimiento,
        fecha: form.fecha,
        periodo: perAPI,
        id_cliente:
          form.id_cliente && form.id_cliente !== NULL_OPTION
            ? Number(form.id_cliente)
            : null,
        cliente: String(form.clienteInput || "").trim(),
        // Compatibilidad: el backend nuevo usa id_stock_producto; id_detalle queda como alias
        // porque varios componentes todavía nombran al producto como "detalle".
        id_stock_producto: idDet,
        id_detalle: idDet,
        detalle: String(form.detalleInput || "").trim(),
        monto_total: montoFinal,
      };

      await onSave?.(payloadFinal);

      showToast("exito", "Recibo actualizado.");
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando recibo.");
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className={`mi-modal__overlay ${darkOn ? "mi-modal__overlay--dark" : ""}`}>
        <div
          className="mi-modal__container"
          id="mov--modaleditarrecibo"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon">
              <FontAwesomeIcon icon={faReceipt} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Editar recibo</h2>
              <p className="mi-modal__subtitle">
                Modificá fecha, cliente, detalle y monto con la misma estética de Nueva Compra.
              </p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mi-modal__content">
            <div className="mi-er-layout">
              <section className="mi-er-main">
                <form onSubmit={submit} className="mi-er-form">
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Monto</span>
                    </div>

                    <div className="nc-section-body">
                      <div className="nc-field">
                        <input
                          className="nc-input"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder=" "
                          value={form.monto_total}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              monto_total: e.target.value,
                            }))
                          }
                          disabled={saving}
                        />

                        <label className="nc-label">Monto total</label>
                      </div>

                      <div className="nc-cc-info">
                        <b>Total actual:</b> {moneyARS(form.monto_total || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Detalle</span>
                    </div>

                    <div className="nc-section-body">
                      <div className="mi-er-rel">
                        <div className="nc-field">
                          <input
                            className="nc-input"
                            placeholder=" "
                            value={form.detalleInput}
                            onChange={handleDetalleInputChange}
                            onFocus={() => {
                              setDetalleFocus(true);
                              setDetalleArmed(true);
                            }}
                            onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
                            disabled={saving}
                            autoComplete="off"
                          />

                          <label className="nc-label">Detalle *</label>
                        </div>

                        {!!filteredDetalles.length && (
                          <div className="mi-er-autocomplete">
                            {filteredDetalles.map((det) => {
                              const id = getIdGeneric(det);
                              const nombre = String(det?.nombre ?? "").trim();

                              return (
                                <button
                                  key={`det-${id}-${nombre}`}
                                  type="button"
                                  className="mi-er-autocomplete__item"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectDetalle(det)}
                                >
                                  {nombre}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Cliente</span>
                    </div>

                    <div className="nc-section-body">
                      <div className="mi-er-rel">
                        <div className="nc-field">
                          <input
                            className="nc-input"
                            placeholder=" "
                            value={form.clienteInput}
                            onChange={handleClienteInputChange}
                            onFocus={() => {
                              setClienteFocus(true);
                              setClienteArmed(true);
                            }}
                            onBlur={() => setTimeout(() => setClienteFocus(false), 120)}
                            disabled={saving}
                            autoComplete="off"
                          />

                          <label className="nc-label">Cliente</label>
                        </div>

                        {!!filteredClientes.length && (
                          <div className="mi-er-autocomplete">
                            {filteredClientes.map((cli) => {
                              const id = getIdCliente(cli);

                              const nombre = String(
                                cli?.nombre ?? cli?.razon_social ?? cli?.cliente ?? ""
                              ).trim();

                              return (
                                <button
                                  key={`cli-${id}-${nombre}`}
                                  type="button"
                                  className="mi-er-autocomplete__item"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectCliente(cli)}
                                >
                                  {nombre}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </form>
              </section>

              <aside className="nc-aside">
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" />
                    <span>Fecha</span>
                  </div>

                  <div className="nc-section-body">
                    <div
                      className="nc-field"
                      onMouseDown={(e) => {
                        if (saving) return;

                        e.preventDefault();
                        openNativeDatePicker(fechaInputRef.current);
                      }}
                    >
                      <input
                        ref={fechaInputRef}
                        className="nc-input"
                        type="date"
                        placeholder=" "
                        value={form.fecha}
                        max={todayISO()}
                        onChange={handleFechaChange}
                        onClick={(e) => {
                          if (saving) return;
                          openNativeDatePicker(e.currentTarget);
                        }}
                        onFocus={(e) => {
                          if (saving) return;
                          openNativeDatePicker(e.currentTarget);
                        }}
                        disabled={saving}
                      />

                      <label className="nc-label">Fecha</label>
                    </div>
                  </div>
                </div>

                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" />
                    <span>Resumen del recibo</span>
                  </div>

                  <div className="nc-section-body">
                    <div className="nc-cc-info">
                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faCalendarDays} />
                        <span>
                          <b>Fecha:</b> {form.fecha || "--"}
                        </span>
                      </div>

                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faUser} />
                        <span>
                          <b>Cliente:</b> {resumen.cliente}
                        </span>
                      </div>

                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faBoxOpen} />
                        <span>
                          <b>Detalle:</b> {resumen.detalle}
                        </span>
                      </div>

                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faReceipt} />
                        <span>
                          <b>Período:</b> {resumen.periodo}
                        </span>
                      </div>

                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faDollarSign} />
                        <span>
                          <b>Total:</b> {moneyARS(resumen.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="nc-actions">
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mi-er-action"
                    onClick={submit}
                    disabled={saving}
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>

                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost mi-er-action"
                    onClick={() => !saving && onClose?.()}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mi-er-layout{
          flex:1;
          min-height:0;
          display:grid;
          grid-template-columns:minmax(0,1fr) 430px;
          gap:18px;
          overflow:hidden;
        }

        .mi-er-main{
          min-width:0;
          min-height:0;
          border:1px solid var(--nv-border-md);
          border-radius:14px;
          background:var(--nv-bg);
          box-shadow:var(--nv-shadow-sm);
          overflow:auto;
          padding:16px;
        }

        .mi-er-form{
          display:flex;
          flex-direction:column;
          gap:14px;
        }

        .mi-er-rel{
          position:relative;
        }

        .mi-er-autocomplete{
          position:absolute;
          top:calc(100% + 6px);
          left:0;
          right:0;
          z-index:50;
          background:var(--nv-bg);
          border:1px solid var(--nv-border-md);
          border-radius:12px;
          box-shadow:var(--nv-shadow-md);
          overflow:hidden;
          max-height:240px;
          overflow-y:auto;
        }

        .mi-er-autocomplete__item{
          width:100%;
          border:none;
          background:transparent;
          text-align:left;
          padding:10px 12px;
          font-size:13px;
          color:var(--nv-text);
          cursor:pointer;
          transition:background .12s ease;
          font-family:inherit;
        }

        .mi-er-autocomplete__item:hover{
          background:var(--nv-row-hover);
        }

        .mi-er-summary-row{
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:12px;
        }

        .mi-er-summary-row:last-child{
          margin-bottom:0;
        }

        .mi-er-action{
          flex:1;
        }

        @media (max-width: 1100px){
          .mi-er-layout{
            grid-template-columns:1fr;
          }
        }
      `}</style>
    </>,
    document.body
  );
}