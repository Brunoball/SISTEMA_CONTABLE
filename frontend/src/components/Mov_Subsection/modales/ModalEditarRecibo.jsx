// src/components/Movimientos/modales/ModalEditarRecibo.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css";
import BASE_URL from "../../../config/config";

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
  const cand = x?.id ?? x?.id_detalle ?? x?.idDetalle ?? x?.detalle_id ?? 0;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getIdCliente(x) {
  const cand = x?.id ?? x?.id_cliente ?? x?.idCliente ?? x?.cliente_id ?? 0;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* =========================
   Lists normalize (como Ventas)
   ✅ ahora incluye clientes
========================= */
function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;

  return {
    detalles: Array.isArray(l.detalles) ? l.detalles : [],
    clientes: Array.isArray(l.clientes) ? l.clientes : [],
  };
}

/* =========================
   Mini modal: agregar catálogo
========================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave, dark, label = "Nombre" }) {
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
   ModalEditarRecibo
========================= */
export default function ModalEditarRecibo({ open, row, lists, periodoDefault, onClose, onSave, onToast, dark }) {
  const API_LISTS = `${BASE_URL}/api.php?action=global_obtener_listas`;
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;

  const darkOn = isDarkEnabled(dark);

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion), [onToast]);

  const [saving, setSaving] = useState(false);

  // ✅ localLists con refresh al abrir (fix del bug)
  const [localLists, setLocalLists] = useState(() => normalizeLists(lists));
  useEffect(() => setLocalLists(normalizeLists(lists)), [lists]);

  const refreshLists = useCallback(async () => {
    const data = await apiGetJson(API_LISTS);
    const normalized = normalizeLists(data);
    setLocalLists((prev) => ({
      detalles: normalized.detalles?.length ? normalized.detalles : prev.detalles,
      clientes: normalized.clientes?.length ? normalized.clientes : prev.clientes,
    }));
  }, [API_LISTS]);

  const [form, setForm] = useState(() => ({
    id_movimiento: null,
    fecha: "",
    periodo: "",
    id_cliente: NULL_OPTION,
    clienteInput: "",
    id_detalle: NULL_OPTION,
    detalleInput: "",
    monto_total: 0,
  }));

  // ✅ Autocomplete Detalles
  const [detalleFocus, setDetalleFocus] = useState(false);
  const [detalleArmed, setDetalleArmed] = useState(false);
  const detalleInputRef = useRef(null);

  // ✅ Autocomplete Clientes
  const [clienteFocus, setClienteFocus] = useState(false);
  const [clienteArmed, setClienteArmed] = useState(false);
  const clienteInputRef = useRef(null);

  // Mini-modals
  const [addUI, setAddUI] = useState({ open: false, catalogo: "detalles", text: "", saving: false });

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

    const idCliente = r.id_cliente ?? r.cliente_id ?? r.idCliente ?? NULL_OPTION;
    const clienteTxt = String(r.cliente ?? r.nombre_cliente ?? r.razon_social_cliente ?? "").trim();

    const idDetalle = r.id_detalle ?? NULL_OPTION;

    const detName = String(
      getArr(localLists.detalles).find((d) => String(getIdGeneric(d)) === String(idDetalle))?.nombre ?? ""
    ).trim();

    const detFallback = String(r.detalle ?? r.descripcion ?? r.concepto ?? "").trim();

    // nombre cliente desde lista si hay id
    const cliName = String(
      getArr(localLists.clientes).find((c) => String(getIdCliente(c)) === String(idCliente))?.nombre ?? ""
    ).trim();

    setSaving(false);
    setAddUI({ open: false, catalogo: "detalles", text: "", saving: false });

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
      detalleInput: detName || detFallback || "",
      monto_total: safeNumber(r.monto_total ?? r.total ?? 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row, periodoDefault]); // no metas localLists para no resetear por refresh

  /* =========================
     Autocomplete detalles (usa localLists)
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
    setForm((p) => ({
      ...p,
      detalleInput: nombre,
      id_detalle: String(did ?? NULL_OPTION),
    }));
    setDetalleFocus(false);
    setDetalleArmed(false);
  };

  /* =========================
     Autocomplete clientes (usa localLists)
  ========================= */
  const filteredClientes = useMemo(() => {
    const all = getArr(localLists.clientes);
    const q = normalizeSearchText(form.clienteInput);

    if (!clienteFocus || !clienteArmed || q.length < 1) return [];

    return all
      .filter((c) => normalizeSearchText(c?.nombre ?? c?.razon_social ?? c?.cliente).includes(q))
      .slice(0, 25);
  }, [localLists.clientes, form.clienteInput, clienteFocus, clienteArmed]);

  const handleClienteInputChange = (e) => {
    const value = e.target.value;
    setClienteArmed(true);
    // si escribe, invalidamos id_cliente (igual que detalle)
    setForm((p) => ({ ...p, clienteInput: value, id_cliente: NULL_OPTION }));
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

  /* =========================
     Nuevo catálogo (detalles/clientes)
  ========================= */
  const startAdd = (catalogo) => {
    if (saving) return;

    // cerrar dropdowns
    setDetalleFocus(false);
    setDetalleArmed(false);
    setClienteFocus(false);
    setClienteArmed(false);

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
        catalogo, // "detalles" | "clientes"
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
      } else if (catalogo === "clientes") {
        setLocalLists((prev) => {
          const arr = getArr(prev.clientes).slice();
          if (!arr.some((x) => getIdCliente(x) === newId)) arr.push({ id: newId, nombre: newNombre });
          return { ...prev, clientes: arr };
        });
        setForm((p) => ({ ...p, id_cliente: String(newId), clienteInput: newNombre }));
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
      if (!form.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) throw new Error("Fecha inválida.");

      const perUI = periodoToMMYYYY(form.periodo) || periodoFromISODate(form.fecha);
      const perAPI = periodoToYYYYMM(perUI);

      const idDet = form.id_detalle && form.id_detalle !== NULL_OPTION ? Number(form.id_detalle) : null;
      if (!idDet) throw new Error("Seleccioná un detalle.");

      const payloadFinal = {
        id_movimiento: form.id_movimiento,
        fecha: form.fecha,
        periodo: perAPI, // YYYY-MM

        id_cliente: form.id_cliente && form.id_cliente !== NULL_OPTION ? Number(form.id_cliente) : null,
        cliente: String(form.clienteInput || "").trim(),

        id_detalle: idDet,
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
    <div
      className={`mi-modal__overlay ${darkOn ? "mi-modal__overlay--dark" : ""}`}
      onMouseDown={() => !saving && onClose?.()}
    >
      <div
        className={["mi-modal__container", "mi-modal__container--mov", darkOn ? "mi-modal--dark" : ""].join(" ")}
        id="mov--modaleditarrecibo"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar recibo</h2>
            <p className="mi-modal__subtitle">Fecha, período, detalle, cliente y monto.</p>
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

            <button type="button" onClick={() => startAdd("detalles")} disabled={saving} className="mi-cr-link">
              + Agregar nuevo detalle
            </button>
          </div>

          {/* ✅ Cliente (igual a detalle, con sugerencias + alta) */}
          <div className="fl-field mi-field--mt12 mi-field--rel">
            <input
              ref={clienteInputRef}
              className="fl-input"
              placeholder=" "
              value={form.clienteInput}
              onChange={handleClienteInputChange}
              onFocus={() => setClienteFocus(true)}
              onBlur={() => setTimeout(() => setClienteFocus(false), 120)}
              disabled={saving || addUI.open}
              autoComplete="off"
            />
            <label className="fl-label">Cliente</label>

            {clienteFocus && clienteArmed && filteredClientes.length > 0 && (
              <ul className="mi-cr-suggest">
                {filteredClientes.map((c) => (
                  <li
                    key={getIdCliente(c) || c.id}
                    className="mi-cr-suggest__item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectCliente(c);
                    }}
                  >
                    <span className="mi-cr-suggest__text">{String(c?.nombre ?? c?.razon_social ?? c?.cliente ?? "").trim()}</span>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" onClick={() => startAdd("clientes")} disabled={saving} className="mi-cr-link">
              + Agregar nuevo cliente
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

          <div className="content-btn-modalrecibo mi-actions--mt14">
            <button type="submit" disabled={saving} className="mit-btn mit-btn--solid btn--modalrecibo">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => !saving && onClose?.()}
              disabled={saving}
              className="mit-btn mit-btn--ghost btn--modalrecibo"
            >
              Cancelar
            </button>
          </div>
        </form>

        <AddCatalogMiniModal
          open={addUI.open}
          title={addUI.catalogo === "clientes" ? "Nuevo cliente" : "Nuevo detalle"}
          label={addUI.catalogo === "clientes" ? "Nombre del cliente" : "Nombre del detalle"}
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
