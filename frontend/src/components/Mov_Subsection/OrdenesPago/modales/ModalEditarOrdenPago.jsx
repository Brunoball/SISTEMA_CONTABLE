// ✅ REEMPLAZAR COMPLETO
// src/components/Movimientos/modales/ModalEditarOrdenPago.jsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import BASE_URL from "../../../../config/config";

const NULL_OPTION = "";

/* =========================
   Helpers
========================= */
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
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
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onSave?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onSave]);

  if (!open) return null;

  return createPortal(
    <div
      className={`mi-mini__overlay ${dark ? "mi-mini__overlay--dark" : ""}`}
      // ✅ ya no cierra por click afuera
    >
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
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
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
  const detalleInputRef = useRef(null);

  const [provFocus, setProvFocus] = useState(false);
  const [provArmed, setProvArmed] = useState(false);
  const provInputRef = useRef(null);

  const [addUI, setAddUI] = useState({ open: false, catalogo: "detalles", text: "", saving: false });

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

  /* =========================
     Init form + refresh lists
  ========================= */
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
      monto: monto,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, periodoDefault]);

  /* =========================
     ESC: cerrar solo modal principal
  ========================= */
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

  /* =========================
     Autocomplete detalles
  ========================= */
  const filteredDetalles = useMemo(() => {
    const all = getArr(localLists.detalles);
    const q = normalizeSearchText(form.detalleInput);
    if (!detalleFocus || !detalleArmed || q.length < 1) return [];
    return all.filter((d) => normalizeSearchText(d?.nombre).includes(q)).slice(0, 25);
  }, [localLists.detalles, form.detalleInput, detalleFocus, detalleArmed]);

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

  /* =========================
     Autocomplete proveedores
  ========================= */
  const filteredProveedores = useMemo(() => {
    const all = getArr(localLists.proveedores);
    const q = normalizeSearchText(form.proveedorInput);
    if (!provFocus || !provArmed || q.length < 1) return [];
    return all.filter((p) => normalizeSearchText(p?.nombre).includes(q)).slice(0, 25);
  }, [localLists.proveedores, form.proveedorInput, provFocus, provArmed]);

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

  /* =========================
     Nuevo catálogo
  ========================= */
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
      showToast("advertencia", "Escribí un nombre.", 2600);
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${catalogo.slice(0, -1)}…`, 12000);

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

      if (!Number.isFinite(newId) || newId <= 0) throw new Error("El servidor no devolvió un ID válido.");

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
      showToast("exito", `${catalogo.slice(0, -1)} creado: "${newNombre}"`, 2400);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.", 4200);
    }
  };

  /* =========================
     Submit
  ========================= */
  const submit = async (e) => {
    e.preventDefault();

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.", 3200);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      const fechaFinal = String(form.fecha || defaultsRef.current.fecha || "").trim();
      if (!fechaFinal || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFinal)) {
        throw new Error("Fecha inválida.");
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

      showToast("exito", "Orden de pago actualizada.", 2400);
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando orden de pago.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className={`mi-modal__overlay ${darkOn ? "mi-modal__overlay--dark" : ""}`}
      // ✅ ya NO cierra al hacer click afuera
    >
      <div
        className={["mi-modal__container", "mi-modal__container--mov", darkOn ? "mi-modal--dark" : ""].join(" ")}
        id="mov--modaleditarordenpago"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar orden de pago</h2>
            <p className="mi-modal__subtitle">Fecha, período, proveedor, detalle y monto.</p>
          </div>

          <button className="mi-modal__close" onClick={() => !saving && onClose?.()} disabled={saving} type="button">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="mi-modal__formPad">
          <div className="mi-row2">
            <div className="fl-field">
              <input
                className="fl-input"
                type="date"
                value={form.fecha}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((p) => ({
                    ...p,
                    fecha: v,
                    periodo: p.periodo || periodoFromISODate(v) || p.periodo,
                  }));
                }}
                disabled={saving}
              />
              <label className="fl-label">Fecha</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                placeholder="MM-YYYY"
                value={form.periodo}
                onChange={(e) => setForm((p) => ({ ...p, periodo: e.target.value }))}
                disabled={saving}
              />
              <label className="fl-label">Período</label>
            </div>
          </div>

          {/* ✅ Proveedor */}
          <div className="fl-field mi-field--mt12 mi-field--rel">
            <input
              ref={provInputRef}
              className="fl-input"
              placeholder=" "
              value={form.proveedorInput}
              onChange={handleProveedorInputChange}
              onFocus={() => setProvFocus(true)}
              onBlur={() => setTimeout(() => setProvFocus(false), 120)}
              disabled={saving || addUI.open}
              autoComplete="off"
            />
            <label className="fl-label">Proveedor</label>

            {provFocus && provArmed && filteredProveedores.length > 0 && (
              <ul className="mi-cr-suggest">
                {filteredProveedores.map((p) => (
                  <li
                    key={getIdProveedor(p) || p.id}
                    className="mi-cr-suggest__item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectProveedor(p);
                    }}
                  >
                    <span className="mi-cr-suggest__text">{p.nombre}</span>
                  </li>
                ))}
              </ul>
            )}


          </div>

          {/* ✅ Detalle */}
          <div className="fl-field mi-field--mt12 mi-field--rel">
            <input
              ref={detalleInputRef}
              className="fl-input"
              placeholder=" "
              value={form.detalleInput}
              onChange={handleDetalleInputChange}
              onFocus={() => setDetalleFocus(true)}
              onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
              disabled={saving || addUI.open}
              autoComplete="off"
            />
            <label className="fl-label">Descripción (Detalle)</label>

            {detalleFocus && detalleArmed && filteredDetalles.length > 0 && (
              <ul className="mi-cr-suggest">
                {filteredDetalles.map((d) => (
                  <li
                    key={getIdGeneric(d) || d.id}
                    className="mi-cr-suggest__item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectDetalle(d);
                    }}
                  >
                    <span className="mi-cr-suggest__text">{d.nombre}</span>
                  </li>
                ))}
              </ul>
            )}


          </div>

          {/* Monto */}
          <div className="fl-field mi-field--mt12">
            <input
              className="fl-input"
              type="number"
              step="0.01"
              min="0"
              placeholder=" "
              value={form.monto_total}
              onChange={(e) => setForm((p) => ({ ...p, monto_total: e.target.value }))}
              disabled={saving}
            />
            <label className="fl-label">Monto</label>
          </div>

          <div className="content-btn-modalordenpago mi-actions--mt14 ordenpagobuttos">
            <button type="submit" disabled={saving} className="mit-btn mit-btn--solid btn--modalordenpago">
              {saving ? "Guardando..." : "Guardar"}
            </button>

            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              className="mit-btn mit-btn--ghost btn--modalordenpago"
            >
              Cancelar
            </button>
          </div>
        </form>

        <AddCatalogMiniModal
          open={addUI.open}
          title={addUI.catalogo === "proveedores" ? "Nuevo proveedor" : "Nuevo detalle"}
          label={addUI.catalogo === "proveedores" ? "Nombre del proveedor" : "Nombre del detalle"}
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={() => !addUI.saving && setAddUI({ open: false, catalogo: "detalles", text: "", saving: false })}
          onSave={guardarNuevoCatalogo}
          dark={darkOn}
        />
      </div>
    </div>,
    document.body
  );
}