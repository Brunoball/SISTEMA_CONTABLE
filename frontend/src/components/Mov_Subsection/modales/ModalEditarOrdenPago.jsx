// src/components/Movimientos/modales/ModalEditarOrdenPago.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css";
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
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [yyyy, mm] = s.split("-");
    return `${mm}-${yyyy}`;
  }
  if (/^\d{2}-\d{4}$/.test(s)) return s;
  return s;
}

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  if (/^\d{2}-\d{4}$/.test(s)) {
    const [mm, yyyy] = s.split("-");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) return s;
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
  return getArr(arr).find((it) => String(it?.id ?? it?.id_detalle ?? it?.id_proveedor) === sid);
}

/* =========================
   Mini modal genérico para catálogos
========================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div className="mi-mini__overlay" onMouseDown={onCancel}>
      <div className="mi-mini__modal" onMouseDown={(e) => e.stopPropagation()}>
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
  onSave, // async (payloadFinal) => void
  onToast,
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [saving, setSaving] = useState(false);

  // Autocomplete detalle
  const [detalleFocus, setDetalleFocus] = useState(false);
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

  // Init al abrir
  useEffect(() => {
    if (!open) return;

    const r = row || {};
    const fecha = String(r.fecha || "").slice(0, 10);

    const perRow = periodoToMMYYYY(r.periodo);
    const perDef = periodoToMMYYYY(periodoDefault);
    const perAuto = periodoFromISODate(fecha);

    const idProv = r.id_proveedor ?? r.proveedor_id ?? r.idProveedor ?? NULL_OPTION;
    const provTxt = String(r.proveedor ?? "").trim();

    const idDet = r.id_detalle ?? NULL_OPTION;

    const detalles = getArr(lists?.detalles);
    const proveedores = getArr(lists?.proveedores);

    const detName = String(findById(detalles, idDet)?.nombre ?? "").trim();
    const detFallback = String(r.detalle ?? r.descripcion ?? r.concepto ?? "").trim();

    const provNameFromList = String(findById(proveedores, idProv)?.nombre ?? "").trim();

    setSaving(false);
    setDetalleFocus(false);
    setAddDetUI({ open: false, text: "", saving: false });
    setAddProvUI({ open: false, text: "", saving: false });

    setForm({
      id_movimiento: safeNumber(r.id_movimiento) || null,
      fecha: fecha || "",
      periodo: perRow || perDef || perAuto || "",
      id_proveedor: String(idProv ?? NULL_OPTION),
      proveedorTxt: provNameFromList || provTxt || "",
      id_detalle: String(idDet ?? NULL_OPTION),
      detalleInput: detName || detFallback || "",
      monto_total: safeNumber(r.monto_total ?? r.total ?? 0),
    });

    setTimeout(() => detalleInputRef.current?.focus(), 0);
  }, [open, row, lists, periodoDefault]);

  /* =========================
     Detalle autocomplete
  ========================= */
  const filteredDetalles = useMemo(() => {
    const all = getArr(lists?.detalles);
    const q = normalizeSearchText(form.detalleInput);
    if (!detalleFocus || q.length < 1) return [];
    return all.filter((d) => normalizeSearchText(d?.nombre).includes(q)).slice(0, 25);
  }, [lists, form.detalleInput, detalleFocus]);

  const handleDetalleInputChange = (e) => {
    const value = e.target.value;
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
  };

  const startAddDetalle = () => {
    setDetalleFocus(false);
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
    } catch (e) {
      setAddDetUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando detalle.", 4200);
    }
  };

  /* =========================
     Proveedor (select + agregar)
  ========================= */
  const proveedoresList = useMemo(() => getArr(lists?.proveedores), [lists]);

  const startAddProveedor = () => {
    setAddProvUI({ open: true, text: "", saving: false });
  };

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

      const idProv =
        form.id_proveedor && form.id_proveedor !== NULL_OPTION ? Number(form.id_proveedor) : null;
      if (!idProv) throw new Error("Seleccioná un proveedor.");

      const payloadFinal = {
        id_movimiento: form.id_movimiento,
        fecha: form.fecha,
        periodo: periodoToYYYYMM(perUI),

        // Proveedor
        id_proveedor: idProv,
        proveedor: String(form.proveedorTxt || "").trim(),

        // Detalle
        id_detalle: form.id_detalle && form.id_detalle !== NULL_OPTION ? Number(form.id_detalle) : null,
        detalle: String(form.detalleInput || "").trim(),

        monto_total: Math.max(0, Math.round(safeNumber(form.monto_total) * 100) / 100),
      };

      await onSave?.(payloadFinal);

      showToast("exito", "Orden de pago actualizada.", 2400);
      onClose?.();
    } catch (e2) {
      showToast("error", e2?.message || "Error guardando orden de pago.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="mi-modal__overlay" onMouseDown={() => !saving && onClose?.()}>
      <div
        className="mi-modal__container mi-modal__container--mov"
        id="mov--modaleditarordenpago"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar orden de pago</h2>
            <p className="mi-modal__subtitle">Fecha, período, proveedor, descripción/detalle y monto.</p>
          </div>

          <button className="mi-modal__close" onClick={() => !saving && onClose?.()} disabled={saving} type="button">
            ✕
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: 14 }}>
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
                    periodo: periodoFromISODate(v) || p.periodo,
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

          {/* Proveedor */}
          <div className="fl-field" style={{ marginTop: 12 }}>
            <select
              className="fl-input"
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
                setForm((p) => ({
                  ...p,
                  id_proveedor: v,
                  proveedorTxt: nombre || p.proveedorTxt,
                }));
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

          {/* Descripción = Detalle */}
          <div className="fl-field" style={{ position: "relative", marginTop: 12 }}>
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

            {detalleFocus && filteredDetalles.length > 0 && (
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
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.nombre}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" onClick={startAddDetalle} disabled={saving || addProvUI.open} className="mi-cr-link">
              + Agregar nuevo detalle
            </button>
          </div>

          {/* Monto */}
          <div className="fl-field" style={{ marginTop: 12 }}>
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

          <div style={{ marginTop: 14, display: "flex", gap: 10 }} className="content-btn-modalordenpago">
            <button
              type="submit"
              disabled={saving}
              className="mit-btn mit-btn--solid btn--modalordenpago"
              style={{ width: "100%", height: 44 }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>

            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              className="mit-btn mit-btn--ghost btn--modalordenpago"
              style={{ width: "100%", height: 44 }}
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
        />
      </div>
    </div>,
    document.body
  );
}
