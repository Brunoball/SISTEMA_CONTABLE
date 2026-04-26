// src/components/Movimientos/modales/ModalEditarOrdenPago.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/roots.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faCalendarDays,
  faTruck,
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [, m] = s.split("-");
  return `${m}-${s.slice(0, 4)}`;
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
    const preview = text.length > 600 ? `${text.slice(0, 600)}...` : text;
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

  const res = await fetch(url, { method: "GET", headers });
  return await parseJsonOrThrow(res);
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

function getArr(x) {
  return Array.isArray(x) ? x : [];
}

function getIdGeneric(x) {
  const cand =
    x?.id ??
    x?.id_detalle ??
    x?.idDetalle ??
    x?.detalle_id ??
    x?.id_proveedor ??
    x?.idProveedor ??
    x?.proveedor_id ??
    0;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getIdProveedor(x) {
  const cand = x?.id ?? x?.id_proveedor ?? x?.idProveedor ?? x?.proveedor_id ?? 0;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* =========================
   Lists normalize
========================= */
function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;

  return {
    detalles: Array.isArray(l.detalles) ? l.detalles : [],
    proveedores: Array.isArray(l.proveedores) ? l.proveedores : [],
  };
}

/* =========================
   Mini modal: agregar catálogo
========================= */
function AddCatalogMiniModal({
  open,
  title,
  value,
  saving,
  onChange,
  onCancel,
  onSave,
  dark,
  label = "Nombre",
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
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel?.();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onSave?.();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onSave]);

  if (!open) return null;

  return createPortal(
    <div className={`mi-mini__overlay ${dark ? "mi-mini__overlay--dark" : ""}`}>
      <div
        className={`mi-mini__modal ${dark ? "mi-mini__modal--dark" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{title}</h4>
          <button type="button" className="mi-mini__close" onClick={onCancel} disabled={saving}>
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
            <label className="fl-label">{label}</label>
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
   ModalEditarOrdenPago
========================= */
export default function ModalEditarOrdenPago({
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
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;

  const darkOn = isDarkEnabled(dark);

  const showToast = useCallback(
    (tipo, mensaje) => onToast?.(tipo, mensaje),
    [onToast]
  );

  const [saving, setSaving] = useState(false);

  const [localLists, setLocalLists] = useState(() => normalizeLists(lists));
  useEffect(() => setLocalLists(normalizeLists(lists)), [lists]);

  const refreshLists = useCallback(async () => {
    const data = await apiGetJson(API_LISTS);
    const normalized = normalizeLists(data);
    setLocalLists((prev) => ({
      detalles: normalized.detalles?.length ? normalized.detalles : prev.detalles,
      proveedores: normalized.proveedores?.length ? normalized.proveedores : prev.proveedores,
    }));
  }, [API_LISTS]);

  const [detalleFocus, setDetalleFocus] = useState(false);
  const [detalleArmed, setDetalleArmed] = useState(false);

  const [provFocus, setProvFocus] = useState(false);
  const [provArmed, setProvArmed] = useState(false);

  const [addUI, setAddUI] = useState({
    open: false,
    catalogo: "detalles",
    text: "",
    saving: false,
  });

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

  const defaultsRef = useRef({
    fecha: "",
    periodoMMYYYY: "",
    monto: 0,
    id_proveedor: NULL_OPTION,
    proveedorTxt: "",
    id_detalle: NULL_OPTION,
    detalleTxt: "",
  });

  const [form, setForm] = useState(() => ({
    id_movimiento: null,
    fecha: "",
    periodo: "",
    id_proveedor: NULL_OPTION,
    proveedorInput: "",
    id_detalle: NULL_OPTION,
    detalleInput: "",
    monto_total: "",
  }));

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

    refreshLists().catch(() => {});

    const r = row || {};
    const fecha = String(r.fecha || "").slice(0, 10);

    const perRow = periodoToMMYYYY(r.periodo);
    const perDef = periodoToMMYYYY(periodoDefault);
    const perAuto = periodoFromISODate(fecha);

    const idProv = r.id_proveedor ?? r.proveedor_id ?? r.idProveedor ?? NULL_OPTION;
    const idDet = r.id_detalle ?? NULL_OPTION;

    const detName = String(
      getArr(localLists.detalles).find((d) => String(getIdGeneric(d)) === String(idDet))?.nombre ?? ""
    ).trim();
    const detFallback = String(r.detalle ?? r.descripcion ?? r.concepto ?? "").trim();

    const provNameFromList = String(
      getArr(localLists.proveedores).find((p) => String(getIdProveedor(p)) === String(idProv))?.nombre ?? ""
    ).trim();
    const provFallback = String(r.proveedor ?? "").trim();

    const monto = safeNumber(r.monto_total ?? r.total ?? 0);

    defaultsRef.current = {
      fecha: fecha || "",
      periodoMMYYYY: perRow || perDef || perAuto || "",
      monto,
      id_proveedor: String(idProv ?? NULL_OPTION),
      proveedorTxt: (provNameFromList || provFallback || "").trim(),
      id_detalle: String(idDet ?? NULL_OPTION),
      detalleTxt: (detName || detFallback || "").trim(),
    };

    setSaving(false);
    setAddUI({ open: false, catalogo: "detalles", text: "", saving: false });

    setDetalleFocus(false);
    setDetalleArmed(false);
    setProvFocus(false);
    setProvArmed(false);

    setForm({
      id_movimiento: safeNumber(r.id_movimiento) || null,
      fecha: defaultsRef.current.fecha,
      periodo: defaultsRef.current.periodoMMYYYY,
      id_proveedor: defaultsRef.current.id_proveedor,
      proveedorInput: defaultsRef.current.proveedorTxt,
      id_detalle: defaultsRef.current.id_detalle,
      detalleInput: defaultsRef.current.detalleTxt,
      monto_total: defaultsRef.current.monto ? String(defaultsRef.current.monto) : "",
    });

    setTimeout(() => closeBtnRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, periodoDefault]);

  useEffect(() => {
    if (!open || saving || addUI.open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, saving, addUI.open, onClose]);

  const filteredDetalles = useMemo(() => {
    const all = getArr(localLists.detalles);
    const q = normalizeSearchText(form.detalleInput);
    if (!detalleFocus || !detalleArmed || q.length < 1) return [];
    return all.filter((d) => normalizeSearchText(d?.nombre).includes(q)).slice(0, 25);
  }, [localLists.detalles, form.detalleInput, detalleFocus, detalleArmed]);

  const filteredProveedores = useMemo(() => {
    const all = getArr(localLists.proveedores);
    const q = normalizeSearchText(form.proveedorInput);
    if (!provFocus || !provArmed || q.length < 1) return [];
    return all.filter((p) => normalizeSearchText(p?.nombre).includes(q)).slice(0, 25);
  }, [localLists.proveedores, form.proveedorInput, provFocus, provArmed]);

  const handleDetalleInputChange = (e) => {
    const value = e.target.value;
    setDetalleArmed(true);
    setForm((p) => ({ ...p, detalleInput: value, id_detalle: NULL_OPTION }));
  };

  const handleSelectDetalle = (det) => {
    const nombre = String(det?.nombre ?? "").trim();
    const did = getIdGeneric(det) || det?.id;
    setForm((p) => ({ ...p, detalleInput: nombre, id_detalle: String(did ?? NULL_OPTION) }));
    setDetalleFocus(false);
    setDetalleArmed(false);
  };

  const handleProveedorInputChange = (e) => {
    const value = e.target.value;
    setProvArmed(true);
    setForm((p) => ({ ...p, proveedorInput: value, id_proveedor: NULL_OPTION }));
  };

  const handleSelectProveedor = (prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    const pid = getIdProveedor(prov) || prov?.id;
    setForm((p) => ({ ...p, proveedorInput: nombre, id_proveedor: String(pid ?? NULL_OPTION) }));
    setProvFocus(false);
    setProvArmed(false);
  };

  const startAdd = (catalogo) => {
    if (saving) return;

    setDetalleFocus(false);
    setDetalleArmed(false);
    setProvFocus(false);
    setProvArmed(false);

    setAddUI({ open: true, catalogo, text: "", saving: false });
  };

  const guardarNuevoCatalogo = async () => {
    const nombre = String(addUI.text || "").trim();
    const catalogo = addUI.catalogo;

    if (!nombre) {
      showToast("advertencia", "Escribí un nombre.");
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${catalogo.slice(0, -1)}…`);

    try {
      const { idUsuario } = getAuthInfo();

      const data = await apiPostJson(API_CATALOGO, {
        catalogo,
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || `No se pudo crear ${catalogo}.`);

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error("El servidor no devolvió un ID válido.");
      }

      if (catalogo === "detalles") {
        setLocalLists((prev) => {
          const arr = getArr(prev.detalles).slice();
          if (!arr.some((x) => getIdGeneric(x) === newId)) arr.push({ id: newId, nombre: newNombre });
          return { ...prev, detalles: arr };
        });
        setForm((p) => ({ ...p, id_detalle: String(newId), detalleInput: newNombre }));
      } else if (catalogo === "proveedores") {
        setLocalLists((prev) => {
          const arr = getArr(prev.proveedores).slice();
          if (!arr.some((x) => getIdProveedor(x) === newId)) arr.push({ id: newId, nombre: newNombre });
          return { ...prev, proveedores: arr };
        });
        setForm((p) => ({ ...p, id_proveedor: String(newId), proveedorInput: newNombre }));
      }

      setAddUI({ open: false, catalogo: "detalles", text: "", saving: false });
      showToast("exito", `${catalogo.slice(0, -1)} creado: "${newNombre}"`);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.");
    }
  };

  // ⭐ FUNCIÓN PARA VALIDAR Y ACTUALIZAR LA FECHA ⭐
  const handleFechaChange = useCallback((e) => {
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
  }, [showToast]);

  const resumen = useMemo(() => {
    const monto = Math.max(0, safeNumber(form.monto_total));
    return {
      total: monto,
      proveedor: String(form.proveedorInput || "").trim() || "Sin proveedor",
      detalle: String(form.detalleInput || "").trim() || "Sin detalle",
      periodo: String(form.periodo || "").trim() || "--",
    };
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.");
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…");

    try {
      const fechaFinal = String(form.fecha || defaultsRef.current.fecha || "").trim();
      
      // ⭐ VALIDACIÓN DE FECHA ⭐
      if (!fechaFinal || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFinal)) {
        throw new Error("Fecha inválida.");
      }
      
      if (fechaFinal > todayISO()) {
        throw new Error("La fecha no puede ser posterior al día actual.");
      }

      const perUI =
        periodoToMMYYYY(form.periodo) ||
        defaultsRef.current.periodoMMYYYY ||
        periodoFromISODate(fechaFinal) ||
        "";

      const perAPI = perUI ? periodoToYYYYMM(perUI) : "";

      const provTxt = String(form.proveedorInput || "").trim();
      const idProv =
        form.id_proveedor && form.id_proveedor !== NULL_OPTION ? Number(form.id_proveedor) : null;

      const detTxt = String(form.detalleInput || "").trim();
      const idDet =
        form.id_detalle && form.id_detalle !== NULL_OPTION ? Number(form.id_detalle) : null;

      const montoIngresado = String(form.monto_total ?? "").trim();
      const montoFinal =
        montoIngresado === ""
          ? safeNumber(defaultsRef.current.monto)
          : Math.max(0, Math.round(safeNumber(montoIngresado) * 100) / 100);

      const payloadFinal = {
        id_movimiento: form.id_movimiento,
        fecha: fechaFinal,
        periodo: perAPI,
        id_proveedor: Number.isFinite(idProv) && idProv > 0 ? idProv : null,
        proveedor: provTxt,
        id_detalle: Number.isFinite(idDet) && idDet > 0 ? idDet : null,
        detalle: detTxt,
        monto_total: montoFinal,
      };

      await onSave?.(payloadFinal);

      showToast("exito", "Orden de pago actualizada.");
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando orden de pago.");
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <>
      <div className={`mi-modal__overlay ${darkOn ? "mi-modal__overlay--dark" : ""}`}>
        <div
          className="mi-modal__container"
          id="mov--modaleditarordenpago"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon">
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Editar orden de pago</h2>
              <p className="mi-modal__subtitle">
                Modificá fecha, proveedor, detalle y monto con la misma estética del otro modal.
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
                          onChange={(e) => setForm((p) => ({ ...p, monto_total: e.target.value }))}
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
                            disabled={saving || addUI.open}
                            autoComplete="off"
                          />
                          <label className="nc-label">Detalle</label>
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
                      <span>Proveedor</span>
                    </div>

                    <div className="nc-section-body">
                      <div className="mi-er-rel">
                        <div className="nc-field">
                          <input
                            className="nc-input"
                            placeholder=" "
                            value={form.proveedorInput}
                            onChange={handleProveedorInputChange}
                            onFocus={() => {
                              setProvFocus(true);
                              setProvArmed(true);
                            }}
                            onBlur={() => setTimeout(() => setProvFocus(false), 120)}
                            disabled={saving || addUI.open}
                            autoComplete="off"
                          />
                          <label className="nc-label">Proveedor</label>
                        </div>

                        {!!filteredProveedores.length && (
                          <div className="mi-er-autocomplete">
                            {filteredProveedores.map((prov) => {
                              const id = getIdProveedor(prov);
                              const nombre = String(prov?.nombre ?? "").trim();

                              return (
                                <button
                                  key={`prov-${id}-${nombre}`}
                                  type="button"
                                  className="mi-er-autocomplete__item"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSelectProveedor(prov)}
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
                      onClick={() => openNativeDatePicker(fechaInputRef.current)}
                    >

                      <input
                        ref={fechaInputRef}
                        className="nc-input"
                        type="date"
                        placeholder=" "
                        value={form.fecha}

                        onMouseDown={(e) => {
                          if (saving) return;
                          e.preventDefault();
                          openNativeDatePicker(e.currentTarget);
                        }}
                        onClick={(e) => openNativeDatePicker(e.currentTarget)}
                        onFocus={(e) => openNativeDatePicker(e.currentTarget)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm((p) => ({
                            ...p,
                            fecha: v,
                            periodo: periodoFromISODate(v) || p.periodo,
                          }));
                        }}

                        max={todayISO()}
                        onChange={handleFechaChange}

                        disabled={saving}
                      />
                      <label className="nc-label">Fecha</label>
                    </div>
                  </div>
                </div>

                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" />
                    <span>Resumen de la orden</span>
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
                        <FontAwesomeIcon icon={faTruck} />
                        <span>
                          <b>Proveedor:</b> {resumen.proveedor}
                        </span>
                      </div>

                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faBoxOpen} />
                        <span>
                          <b>Detalle:</b> {resumen.detalle}
                        </span>
                      </div>

                      <div className="mi-er-summary-row">
                        <FontAwesomeIcon icon={faFileInvoiceDollar} />
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

          <AddCatalogMiniModal
            open={addUI.open}
            title={addUI.catalogo === "proveedores" ? "Agregar proveedor" : "Agregar detalle"}
            value={addUI.text}
            saving={addUI.saving}
            onChange={(text) => setAddUI((p) => ({ ...p, text }))}
            onCancel={() =>
              !addUI.saving &&
              setAddUI({ open: false, catalogo: "detalles", text: "", saving: false })
            }
            onSave={guardarNuevoCatalogo}
            dark={darkOn}
            label={addUI.catalogo === "proveedores" ? "Proveedor" : "Detalle"}
          />
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