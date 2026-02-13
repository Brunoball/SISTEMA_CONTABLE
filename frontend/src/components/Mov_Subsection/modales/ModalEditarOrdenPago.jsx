// src/components/Movimientos/modales/ModalEditarOrdenPago.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ✅ estética + dark por clases
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const ADD_OPTION = "__ADD__";

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

function getAuthInfo() {
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, idUsuario };
}

function getArr(x) {
  return Array.isArray(x) ? x : [];
}

function findById(arr, id) {
  const sid = String(id ?? "");
  return getArr(arr).find(
    (it) => String(it?.id ?? it?.id_detalle ?? it?.id_proveedor) === sid
  );
}

function isDarkEnabled(darkProp) {
  if (darkProp === true) return true;
  if (typeof document === "undefined") return false;
  return document.body?.classList?.contains("dark");
}

/* =========================
   Mini modal genérico para catálogos
========================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave, dark }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div className={`mi-mini__overlay ${dark ? "mi-mini__overlay--dark" : ""}`} onMouseDown={onCancel}>
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
   Modal editar Orden de Pago
========================= */
export default function ModalEditarOrdenPago({
  open,
  row,
  lists,
  periodoDefault,
  onClose,
  onSave,
  onToast,
  dark, // ✅ opcional: si no lo pasás, toma body.dark
}) {
  const API = `${BASE_URL}/api.php`;
  const darkOn = isDarkEnabled(dark);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [saving, setSaving] = useState(false);

  // ✅ Autocomplete detalle: solo dropdown si el usuario tipeó
  const [detalleFocus, setDetalleFocus] = useState(false);
  const [detalleArmed, setDetalleArmed] = useState(false);
  const detalleInputRef = useRef(null);

  // Mini modal "nuevo detalle"
  const [addDetUI, setAddDetUI] = useState({ open: false, text: "", saving: false });

  // Mini modal "nuevo proveedor"
  const [addProvUI, setAddProvUI] = useState({ open: false, text: "", saving: false });

  // Form
  const [form, setForm] = useState(() => ({
    id_movimiento: null,
    fecha: "",
    periodo: "",
    id_proveedor: NULL_OPTION,
    proveedorTxt: "",
    id_detalle: NULL_OPTION,
    detalleInput: "",
    monto_total: 0,
  }));

  /* =========================
     POST JSON helper
  ========================= */
  const apiPostJson = useCallback(async (url, payload) => {
    const { token } = getAuthInfo();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
    });

    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Respuesta inválida (no JSON).");
    }
  }, []);

  /* =========================
     Init al abrir
  ========================= */
  useEffect(() => {
    if (!open) return;

    const r = row || {};
    const fecha = String(r.fecha || "").slice(0, 10);

    const perRow = periodoToMMYYYY(r.periodo);
    const perDef = periodoToMMYYYY(periodoDefault);
    const perAuto = periodoFromISODate(fecha);

    const idProv = r.id_proveedor ?? r.proveedor_id ?? r.idProveedor ?? NULL_OPTION;
    const idDet = r.id_detalle ?? NULL_OPTION;

    const detalles = getArr(lists?.detalles);
    const proveedores = getArr(lists?.proveedores);

    const detName = String(findById(detalles, idDet)?.nombre ?? "").trim();
    const detFallback = String(r.detalle ?? r.descripcion ?? r.concepto ?? "").trim();

    const provNameFromList = String(findById(proveedores, idProv)?.nombre ?? "").trim();
    const provFallback = String(r.proveedor ?? "").trim();

    setSaving(false);
    setDetalleFocus(false);
    setDetalleArmed(false);

    setAddDetUI({ open: false, text: "", saving: false });
    setAddProvUI({ open: false, text: "", saving: false });

    setForm({
      id_movimiento: safeNumber(r.id_movimiento) || null,
      fecha: fecha || "",
      periodo: perRow || perDef || perAuto || "",
      id_proveedor: String(idProv ?? NULL_OPTION),
      proveedorTxt: provNameFromList || provFallback || "",
      id_detalle: String(idDet ?? NULL_OPTION),
      detalleInput: detName || detFallback || "",
      monto_total: safeNumber(r.monto_total ?? r.total ?? 0),
    });
  }, [open, row, lists, periodoDefault]);

  /* =========================
     Detalle autocomplete
  ========================= */
  const filteredDetalles = useMemo(() => {
    const all = getArr(lists?.detalles);
    const q = normalizeSearchText(form.detalleInput);

    if (!detalleFocus || !detalleArmed || q.length < 1) return [];
    return all.filter((d) => normalizeSearchText(d?.nombre).includes(q)).slice(0, 25);
  }, [lists, form.detalleInput, detalleFocus, detalleArmed]);

  const handleDetalleInputChange = (e) => {
    const value = e.target.value;
    setDetalleArmed(true);
    setForm((p) => ({ ...p, detalleInput: value, id_detalle: NULL_OPTION }));
  };

  const handleSelectDetalle = (det) => {
    const nombre = String(det?.nombre ?? "").trim();
    setForm((p) => ({
      ...p,
      detalleInput: nombre,
      id_detalle: String(det?.id ?? NULL_OPTION),
    }));
    setDetalleFocus(false);
    setDetalleArmed(false);
  };

  /* =========================
     Proveedor select + agregar
  ========================= */
  const proveedoresList = useMemo(() => getArr(lists?.proveedores), [lists]);

  const startAddProveedor = () => setAddProvUI({ open: true, text: "", saving: false });

  const guardarNuevoProveedor = async () => {
    const nombre = String(addProvUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre para el proveedor.", 2600);
      return;
    }

    setAddProvUI((p) => ({ ...p, saving: true }));
    showToast("cargando", "Creando proveedor…", 12000);

    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(`${API}?action=catalogo_crear`, {
        catalogo: "proveedores",
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el proveedor.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) throw new Error("El servidor no devolvió un ID válido.");

      setForm((p) => ({
        ...p,
        id_proveedor: String(newId),
        proveedorTxt: newNombre,
      }));

      setAddProvUI({ open: false, text: "", saving: false });
      showToast("exito", `Proveedor creado: "${newNombre}"`, 2400);
    } catch (e) {
      setAddProvUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando proveedor.", 4200);
    }
  };

  /* =========================
     Nuevo detalle
  ========================= */
  const startAddDetalle = () => {
    setDetalleFocus(false);
    setDetalleArmed(false);
    setAddDetUI({ open: true, text: "", saving: false });
  };

  const guardarNuevoDetalle = async () => {
    const nombre = String(addDetUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre para el detalle.", 2600);
      return;
    }

    setAddDetUI((p) => ({ ...p, saving: true }));
    showToast("cargando", "Creando detalle…", 12000);

    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(`${API}?action=catalogo_crear`, {
        catalogo: "detalles",
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el detalle.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) throw new Error("El servidor no devolvió un ID válido.");

      setForm((p) => ({
        ...p,
        id_detalle: String(newId),
        detalleInput: newNombre,
      }));

      setAddDetUI({ open: false, text: "", saving: false });
      showToast("exito", `Detalle creado: "${newNombre}"`, 2400);

      setDetalleFocus(false);
      setDetalleArmed(false);
    } catch (e) {
      setAddDetUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando detalle.", 4200);
    }
  };

  /* =========================
     Submit
  ========================= */
  const submit = async (e) => {
    e.preventDefault();

    if (addDetUI.open || addProvUI.open) {
      showToast("advertencia", "Terminá de crear el catálogo (o cancelá) antes de guardar.", 3200);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) throw new Error("Fecha inválida.");

      const perUI = periodoToMMYYYY(form.periodo) || periodoFromISODate(form.fecha);
      const perAPI = periodoToYYYYMM(perUI);

      const idProv =
        form.id_proveedor && form.id_proveedor !== NULL_OPTION ? Number(form.id_proveedor) : null;
      if (!idProv) throw new Error("Seleccioná un proveedor.");

      const payloadFinal = {
        id_movimiento: form.id_movimiento,
        fecha: form.fecha,
        periodo: perAPI, // YYYY-MM

        id_proveedor: idProv,
        proveedor: String(form.proveedorTxt || "").trim(),

        id_detalle:
          form.id_detalle && form.id_detalle !== NULL_OPTION ? Number(form.id_detalle) : null,
        detalle: String(form.detalleInput || "").trim(),

        monto_total: Math.max(0, Math.round(safeNumber(form.monto_total) * 100) / 100),
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
      onMouseDown={() => !saving && onClose?.()}
    >
      <div
        className={[
          "mi-modal__container",
          "mi-modal__container--mov",
          darkOn ? "mi-modal--dark" : "",
        ].join(" ")}
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

          <button
            className="mi-modal__close"
            onClick={() => !saving && onClose?.()}
            disabled={saving}
            type="button"
          >
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
                  setForm((p) => ({ ...p, fecha: v, periodo: periodoFromISODate(v) || p.periodo }));
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

          {/* Proveedor */}
          <div className="fl-field mi-field--mt12">
            <select
              className="fl-input fl-select"
              value={form.id_proveedor}
              onChange={(e) => {
                const v = e.target.value;

                if (v === ADD_OPTION) {
                  setForm((p) => ({ ...p, id_proveedor: p.id_proveedor || NULL_OPTION }));
                  startAddProveedor();
                  return;
                }

                const prov = findById(proveedoresList, v);
                const nombre = String(prov?.nombre ?? "").trim();
                setForm((p) => ({ ...p, id_proveedor: v, proveedorTxt: nombre || p.proveedorTxt }));
              }}
              disabled={saving}
            >
              <option value={NULL_OPTION}>(Seleccionar proveedor)</option>
              <option value={ADD_OPTION}>+ Agregar proveedor…</option>
              {proveedoresList.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <label className="fl-label">Proveedor</label>
          </div>

          {/* Detalle (autocomplete + agregar) */}
          <div className="fl-field mi-field--mt12 mi-field--rel">
            <input
              ref={detalleInputRef}
              className="fl-input"
              placeholder=" "
              value={form.detalleInput}
              onChange={handleDetalleInputChange}
              onFocus={() => setDetalleFocus(true)}
              onBlur={() => setTimeout(() => setDetalleFocus(false), 120)}
              disabled={saving || addDetUI.open || addProvUI.open}
              autoComplete="off"
            />
            <label className="fl-label">Descripción (Detalle)</label>

            {detalleFocus && detalleArmed && filteredDetalles.length > 0 && (
              <ul className="mi-cr-suggest">
                {filteredDetalles.map((d) => (
                  <li
                    key={d.id}
                    className="mi-cr-suggest__item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectDetalle(d);
                    }}
                  >
                    <span className="mi-suggestText">{d.nombre}</span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={startAddDetalle}
              disabled={saving || addProvUI.open}
              className="mi-cr-link"
            >
              + Agregar nuevo detalle
            </button>
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
            <button
              type="submit"
              disabled={saving}
              className="mit-btn mit-btn--solid btn--modalordenpago"
            >
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

        {/* Mini modal: nuevo detalle */}
        <AddCatalogMiniModal
          open={addDetUI.open}
          title="Nuevo detalle"
          value={addDetUI.text}
          saving={addDetUI.saving}
          onChange={(txt) => setAddDetUI((p) => ({ ...p, text: txt }))}
          onCancel={() => !addDetUI.saving && setAddDetUI({ open: false, text: "", saving: false })}
          onSave={guardarNuevoDetalle}
          dark={darkOn}
        />

        {/* Mini modal: nuevo proveedor */}
        <AddCatalogMiniModal
          open={addProvUI.open}
          title="Nuevo proveedor"
          value={addProvUI.text}
          saving={addProvUI.saving}
          onChange={(txt) => setAddProvUI((p) => ({ ...p, text: txt }))}
          onCancel={() => !addProvUI.saving && setAddProvUI({ open: false, text: "", saving: false })}
          onSave={guardarNuevoProveedor}
          dark={darkOn}
        />
      </div>
    </div>,
    document.body
  );
}
