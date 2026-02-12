import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ✅ no importa, backend blindado
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

  // YYYY-MM -> MM-YYYY
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${mm}-${yyyy}`;
  }
  // MM-YYYY
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

  // MM-YYYY -> YYYY-MM
  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  // YYYY-MM
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

/* =========================
   Mini modal: agregar catálogo
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
   ModalEditarRecibo
========================= */
export default function ModalEditarRecibo({ open, row, lists, periodoDefault, onClose, onSave, onToast }) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    id_movimiento: null,
    fecha: "",
    periodo: "",
    id_cliente: NULL_OPTION,
    cliente: "",
    id_detalle: NULL_OPTION,
    detalleInput: "",
    monto_total: 0,
  }));

  // ✅ Autocomplete: focus + armado (solo muestra dropdown si el usuario tipeó)
  const [detalleFocus, setDetalleFocus] = useState(false);
  const [detalleArmed, setDetalleArmed] = useState(false);
  const detalleInputRef = useRef(null);

  const [addUI, setAddUI] = useState({ open: false, text: "", saving: false });

  /* =========================
     Init form
  ========================= */
  useEffect(() => {
    if (!open) return;

    const r = row || {};
    const fecha = String(r.fecha || "").slice(0, 10);

    const perRow = periodoToMMYYYY(r.periodo);
    const perDef = periodoToMMYYYY(periodoDefault);
    const perAuto = periodoFromISODate(fecha);

    const idCliente = r.id_cliente ?? r.cliente_id ?? r.idCliente ?? NULL_OPTION;
    const clienteTxt = String(r.cliente ?? "").trim();

    const idDetalle = r.id_detalle ?? NULL_OPTION;

    const detalles = Array.isArray(lists?.detalles) ? lists.detalles : [];
    const detName = String(detalles.find((d) => String(d?.id) === String(idDetalle))?.nombre ?? "").trim();

    const detFallback = String(r.detalle ?? r.descripcion ?? r.concepto ?? "").trim();

    setSaving(false);
    setAddUI({ open: false, text: "", saving: false });

    // ✅ MUY IMPORTANTE: al abrir NO queremos dropdown
    setDetalleFocus(false);
    setDetalleArmed(false);

    setForm({
      id_movimiento: safeNumber(r.id_movimiento) || null,
      fecha: fecha || "",
      periodo: perRow || perDef || perAuto || "",
      id_cliente: String(idCliente ?? NULL_OPTION),
      cliente: clienteTxt,
      id_detalle: String(idDetalle ?? NULL_OPTION),
      detalleInput: detName || detFallback || "",
      monto_total: safeNumber(r.monto_total ?? r.total ?? 0),
    });

    // ❌ Antes: autofocus que disparaba dropdown
    // setTimeout(() => detalleInputRef.current?.focus(), 0);
  }, [open, row, lists, periodoDefault]);

  /* =========================
     Autocomplete detalles
  ========================= */
  const filteredDetalles = useMemo(() => {
    const all = Array.isArray(lists?.detalles) ? lists.detalles : [];
    const q = normalizeSearchText(form.detalleInput);

    // ✅ SOLO mostrar si el usuario tipeó (armed)
    if (!detalleFocus || !detalleArmed || q.length < 1) return [];

    return all.filter((d) => normalizeSearchText(d?.nombre).includes(q)).slice(0, 25);
  }, [lists, form.detalleInput, detalleFocus, detalleArmed]);

  const handleDetalleInputChange = (e) => {
    const value = e.target.value;
    setDetalleArmed(true); // ✅ ahora sí, el usuario escribió
    setForm((p) => ({ ...p, detalleInput: value, id_detalle: NULL_OPTION }));
  };

  const handleSelectDetalle = (det) => {
    const nombre = String(det?.nombre ?? "").trim();
    setForm((p) => ({ ...p, detalleInput: nombre, id_detalle: String(det?.id ?? NULL_OPTION) }));

    // ✅ al seleccionar, cerramos y “desarmamos”
    setDetalleFocus(false);
    setDetalleArmed(false);
  };

  /* =========================
     POST JSON helper
  ========================= */
  const apiPostJson = useCallback(async (url, payload) => {
    const { token } = getAuthInfo();
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload ?? {}) });
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Respuesta inválida (no JSON).");
    }
    return data;
  }, []);

  /* =========================
     Nuevo detalle
  ========================= */
  const startAddDetalle = () => {
    setDetalleFocus(false);
    setDetalleArmed(false);
    setAddUI({ open: true, text: "", saving: false });
  };

  const guardarNuevoDetalle = async () => {
    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre para el detalle.", 2600);
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
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

      setForm((p) => ({ ...p, id_detalle: String(newId), detalleInput: newNombre }));

      setAddUI({ open: false, text: "", saving: false });
      showToast("exito", `Detalle creado: "${newNombre}"`, 2400);

      // ✅ no abrir dropdown
      setDetalleFocus(false);
      setDetalleArmed(false);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando detalle.", 4200);
    }
  };

  /* =========================
     Submit
  ========================= */
  const submit = async (e) => {
    e.preventDefault();

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear el detalle (o cancelá) antes de guardar.", 3200);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando cambios…", 12000);

    try {
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) {
        throw new Error("Fecha inválida.");
      }

      const perUI = periodoToMMYYYY(form.periodo) || periodoFromISODate(form.fecha);
      const perAPI = periodoToYYYYMM(perUI);

      const payloadFinal = {
        id_movimiento: form.id_movimiento,
        fecha: form.fecha,
        periodo: perAPI, // YYYY-MM

        id_cliente: form.id_cliente && form.id_cliente !== NULL_OPTION ? Number(form.id_cliente) : null,
        cliente: String(form.cliente || "").trim(),

        id_detalle: form.id_detalle && form.id_detalle !== NULL_OPTION ? Number(form.id_detalle) : null,
        detalle: String(form.detalleInput || "").trim(),

        monto_total: Math.max(0, Math.round(safeNumber(form.monto_total) * 100) / 100),
      };

      await onSave?.(payloadFinal);

      showToast("exito", "Recibo actualizado.", 2400);
      onClose?.();
    } catch (err) {
      showToast("error", err?.message || "Error guardando recibo.", 4200);
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="mi-modal__overlay" onMouseDown={() => !saving && onClose?.()}>
      <div
        className="mi-modal__container mi-modal__container--mov"
        id="mov--modaleditarrecibo"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar recibo</h2>
            <p className="mi-modal__subtitle">Fecha, período, descripción/detalle, cliente y monto.</p>
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

          {/* ✅ Descripción = Detalle (autocomplete + agregar) */}
          <div className="fl-field" style={{ position: "relative", marginTop: 12 }}>
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

            <button type="button" onClick={startAddDetalle} disabled={saving} className="mi-cr-link">
              + Agregar nuevo detalle
            </button>
          </div>

          {/* Cliente */}
          <div className="fl-field" style={{ marginTop: 12 }}>
            <input
              className="fl-input"
              placeholder=" "
              value={form.cliente}
              onChange={(e) => setForm((p) => ({ ...p, cliente: e.target.value }))}
              disabled={saving}
            />
            <label className="fl-label">Cliente (texto)</label>
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

          <div style={{ marginTop: 14, display: "flex", gap: 10 }} className="content-btn-modalrecibo">
            <button
              type="submit"
              disabled={saving}
              className="mit-btn mit-btn--solid btn--modalrecibo"
              style={{ width: "100%", height: 44 }}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              className="mit-btn mit-btn--ghost btn--modalrecibo"
              style={{ width: "100%", height: 44 }}
            >
              Cancelar
            </button>
          </div>
        </form>

        <AddCatalogMiniModal
          open={addUI.open}
          title="Nuevo detalle"
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={() => !addUI.saving && setAddUI({ open: false, text: "", saving: false })}
          onSave={guardarNuevoDetalle}
        />
      </div>
    </div>,
    document.body
  );
}
