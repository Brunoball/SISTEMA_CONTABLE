import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faArrowRotateRight,
  faTruckField,
  faBuilding,
  faUserSlash,
  faUserCheck,
  faBoxOpen,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import ModalAccionEntidadStock from "./modales/ModalAccionEntidadStock";
import Toast from "../Global/Toast";

const EXTRA_CSS = `
/* ── Grid tabla ── */
.sp-grid { grid-template-columns: 1fr 120px 108px; }

/* ── Wrapper del botón: necesario para posicionar el dropdown ── */
.sp-dropWrap {
  position: relative;
}

/* ── Dropdown flotante ── */
.sp-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 300;
  width: 300px;

  background: #fff;
  border: 1px solid rgba(10,37,64,.13);
  border-radius: 14px;
  box-shadow: 0 20px 48px -10px rgba(10,37,64,.22), 0 4px 12px rgba(10,37,64,.08);

  padding: 18px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  /* animación entrada */
  animation: sp-dropIn 180ms cubic-bezier(.4,0,.2,1) both;
  transform-origin: top right;
}

@keyframes sp-dropIn {
  from { opacity: 0; transform: scale(.95) translateY(-6px); }
  to   { opacity: 1; transform: scale(1)  translateY(0);     }
}

/* flecha decorativa apuntando al botón */
.sp-dropdown::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 18px;
  width: 11px;
  height: 11px;
  background: #fff;
  border-left: 1px solid rgba(10,37,64,.13);
  border-top:  1px solid rgba(10,37,64,.13);
  transform: rotate(45deg);
  border-radius: 2px 0 0 0;
}

/* título del dropdown */
.sp-dropdown__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--balto-ink);
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 2px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(10,37,64,.08);
}

/* banner edición */
.sp-editBanner {
  font-size: 11px;
  font-weight: 650;
  color: var(--balto-action);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: -4px;
}

/* ── Floating field ── */
.sp-floatingField { position: relative; width: 100%; }

.sp-input {
  width: 100%;
  height: 52px;
  padding: 22px 14px 8px;
  border-radius: 10px;
  border: 1.5px solid rgba(10,37,64,.14);
  background: #fff;
  outline: none;
  font-size: 13px;
  font-weight: 500;
  color: rgba(10,37,64,.90);
  font-family: inherit;
  transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
}
.sp-input:hover   { border-color: rgba(10,37,64,.28); }
.sp-input:focus   { border-color: rgba(0,85,187,.55); box-shadow: 0 0 0 3px rgba(0,85,187,.18); background: #fafcff; }
.sp-input:disabled{ opacity: .55; cursor: not-allowed; background: #f6f9fc; }

.sp-floatingLabel {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  font-weight: 500;
  color: rgba(66,84,102,.76);
  pointer-events: none;
  background: #fff;
  padding: 0 6px;
  margin-left: -6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  z-index: 2;
  transition: top 150ms ease, transform 150ms ease, font-size 150ms ease, color 150ms ease;
}
.sp-floatingField.is-active .sp-floatingLabel,
.sp-floatingField:focus-within .sp-floatingLabel,
.sp-input:not(:placeholder-shown) + .sp-floatingLabel {
  top: 0;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #0055BB;
  letter-spacing: .02em;
}

/* ── Acciones del form ── */
.sp-formActions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}
.sp-formActions .mov-btn {
  flex: 1;
  height: 42px;
  justify-content: center;
}

/* ── Botón activo ── */
.sp-btn--open {
  background: color-mix(in srgb, var(--balto-action) 10%, #fff) !important;
  border-color: color-mix(in srgb, var(--balto-action) 35%, #fff) !important;
  color: var(--balto-action) !important;
  box-shadow: none !important;
}

/* ── Chips estado ── */
.sp-chip {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 3px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 700; letter-spacing: .2px;
  border: 1px solid transparent; user-select: none;
}
.sp-chip--active  { background: rgba(16,185,129,.12); color: #057A55; border-color: rgba(16,185,129,.30); }
.sp-chip--inactive{ background: rgba(148,163,184,.12); color: #64748b; border-color: rgba(148,163,184,.30); }

/* ── Fila activa en edición ── */
.sp-row--editing { background: rgba(0,85,187,.05) !important; }
.sp-row--editing:hover { background: rgba(0,85,187,.08) !important; }

/* ─── Dark mode ─────────────────────────────────────────────────────────── */
html[data-theme="oscuro"] .sp-dropdown {
  background: #0f1929 !important;
  border-color: rgba(148,163,184,.18) !important;
  box-shadow: 0 24px 56px -12px rgba(0,0,0,.65), 0 4px 14px rgba(0,0,0,.30) !important;
}
html[data-theme="oscuro"] .sp-dropdown::before {
  background: #0f1929 !important;
  border-color: rgba(148,163,184,.18) !important;
}
html[data-theme="oscuro"] .sp-dropdown__title { color: rgba(226,232,240,.92) !important; border-bottom-color: rgba(148,163,184,.14) !important; }
html[data-theme="oscuro"] .sp-input {
  background: rgba(15,23,42,.88) !important;
  color: rgba(226,232,240,.92) !important;
  border-color: rgba(148,163,184,.18) !important;
}
html[data-theme="oscuro"] .sp-input:focus {
  background: rgba(15,23,42,.96) !important;
  border-color: rgba(78,161,255,.45) !important;
  box-shadow: 0 0 0 3px rgba(78,161,255,.18) !important;
}
html[data-theme="oscuro"] .sp-floatingLabel { background: transparent !important; color: rgba(226,232,240,.65) !important; }
html[data-theme="oscuro"] .sp-floatingField.is-active .sp-floatingLabel,
html[data-theme="oscuro"] .sp-floatingField:focus-within .sp-floatingLabel { color: rgba(78,161,255,.92) !important; }
html[data-theme="oscuro"] .sp-btn--open { background: rgba(78,161,255,.12) !important; border-color: rgba(78,161,255,.28) !important; color: rgba(78,161,255,.95) !important; }
html[data-theme="oscuro"] .sp-chip--active  { background: rgba(16,185,129,.16) !important; color: #34d399 !important; }
html[data-theme="oscuro"] .sp-chip--inactive{ background: rgba(148,163,184,.16) !important; color: #94a3b8 !important; }
html[data-theme="oscuro"] .sp-row--editing  { background: rgba(78,161,255,.08) !important; }
html[data-theme="oscuro"] .sp-editBanner    { color: rgba(78,161,255,.90) !important; }
`;

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token      = (localStorage.getItem("token")      || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"]     = sessionKey;
  if (token)      h["Authorization"] = `Bearer ${token}`;
  return h;
}
function buildHeadersJSON() { return { ...buildHeadersGET(), "Content-Type": "application/json" }; }
function toUpperValue(v)    { return String(v || "").toUpperCase(); }
function getProveedorId(row) {
  return Number(row?.id_proveedor ?? row?.id_stock_proveedor ?? row?.id_proveedor_stock ?? row?.id ?? 0);
}
async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) throw new Error("Sesión vencida o no autorizada.");
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    const data = JSON.parse(text);
    if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e instanceof Error && !e.message.startsWith("Unexpected token")) throw e;
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}`);
  }
}
async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
  return parseJsonOrThrow(res);
}
async function apiPost(action, body) {
  const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: "POST", headers: buildHeadersJSON(), body: JSON.stringify(body || {}),
  });
  return parseJsonOrThrow(res);
}

const COLUMNS = [
  { key: "nombre",   label: "NOMBRE",   align: "left"   },
  { key: "estado",   label: "ESTADO",   align: "center" },
  { key: "acciones", label: "ACCIONES", align: "center" },
];
const SKELETON_ROWS = 6;

export default function StockProveedores() {
  const [toast,         setToast]         = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [accionandoId,  setAccionandoId]  = useState(null);
  const [proveedores,   setProveedores]   = useState([]);
  const [pestana,       setPestana]       = useState("activos");

  /* dropdown */
  const [dropOpen,    setDropOpen]    = useState(false);
  const [modo,        setModo]        = useState("crear");
  const [editandoId,  setEditandoId]  = useState(null);
  const [form,        setForm]        = useState({ nombre: "", activo: 1 });

  const dropWrapRef = useRef(null);
  const nombreRef   = useRef(null);

  const [modalAccion, setModalAccion] = useState({ open: false, type: null, row: null, loading: false });

  /* cerrar dropdown al hacer click fuera */
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e) => {
      if (dropWrapRef.current && !dropWrapRef.current.contains(e.target)) {
        cerrarDrop();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]); // eslint-disable-line

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) =>
    setToast({ tipo, mensaje, duracion, id: Date.now() + Math.random() }), []);

  const resetForm = useCallback(() => {
    setModo("crear");
    setEditandoId(null);
    setForm({ nombre: "", activo: 1 });
  }, []);

  const cerrarDrop = useCallback(() => {
    setDropOpen(false);
    setTimeout(resetForm, 180);
  }, [resetForm]);

  const abrirDropNuevo = useCallback(() => {
    resetForm();
    setDropOpen(true);
    setTimeout(() => nombreRef.current?.focus(), 120);
  }, [resetForm]);

  const toggleDrop = useCallback(() => {
    dropOpen ? cerrarDrop() : abrirDropNuevo();
  }, [dropOpen, cerrarDrop, abrirDropNuevo]);

  /* carga */
  const cargarProveedores = useCallback(async (tab) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ action: "stock_proveedores_listar", activo: tab === "inactivos" ? "0" : "1" });
      const data = await apiGet(`${API_URL}?${p.toString()}`);
      setProveedores(Array.isArray(data?.proveedores) ? data.proveedores : []);
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudieron cargar los proveedores.");
    } finally {
      setLoading(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    cargarProveedores(pestana);
    cerrarDrop();
  }, [pestana]); // eslint-disable-line

  const proveedoresOrdenados = useMemo(
    () => [...proveedores].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" })),
    [proveedores]
  );

  /* editar desde fila */
  const iniciarEdicion = useCallback((row) => {
    setModo("editar");
    setEditandoId(getProveedorId(row));
    setForm({ nombre: toUpperValue(row?.nombre), activo: Number(row?.activo ?? 1) === 1 ? 1 : 0 });
    setDropOpen(true);
    setTimeout(() => nombreRef.current?.focus(), 120);
  }, []);

  /* guardar */
  const handleGuardar = async () => {
    const payload = { nombre: toUpperValue(form.nombre).trim(), activo: Number(form.activo) === 1 ? 1 : 0 };
    if (!payload.nombre) {
      mostrarToast("error", "El nombre del proveedor es obligatorio.");
      nombreRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      if (modo === "crear") {
        const data = await apiPost("stock_proveedor_crear", payload);
        mostrarToast("exito", data?.mensaje || "Proveedor creado correctamente.");
      } else {
        const data = await apiPost("stock_proveedor_actualizar", {
          id_proveedor: editandoId, id_stock_proveedor: editandoId, ...payload,
        });
        mostrarToast("exito", data?.mensaje || "Proveedor actualizado correctamente.");
      }
      const tab = payload.activo === 1 ? "activos" : "inactivos";
      setPestana(tab);
      await cargarProveedores(tab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));
      cerrarDrop();
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter")  { e.preventDefault(); handleGuardar(); }
    if (e.key === "Escape") { e.preventDefault(); cerrarDrop();    }
  };

  /* modal */
  const abrirModalAccion  = useCallback((type, row) => setModalAccion({ open: true, type, row, loading: false }), []);
  const cerrarModalAccion = useCallback(() => setModalAccion({ open: false, type: null, row: null, loading: false }), []);

  const ejecutarAccionModal = useCallback(async () => {
    const { row, type } = modalAccion;
    const id = getProveedorId(row);
    if (!id || !type) return;
    setModalAccion((p) => ({ ...p, loading: true }));
    setAccionandoId(id);
    try {
      let action = "", fallback = "", tab = pestana;
      if      (type === "baja") { action = "stock_proveedor_dar_baja"; fallback = "Proveedor dado de baja."; tab = "activos";   }
      else if (type === "alta") { action = "stock_proveedor_dar_alta"; fallback = "Proveedor dado de alta."; tab = "inactivos"; }
      else                      { action = "stock_proveedor_eliminar"; fallback = "Proveedor eliminado.";    tab = pestana;     }

      const data = await apiPost(action, { id_proveedor: id, id_stock_proveedor: id });
      mostrarToast("exito", data?.mensaje || fallback);

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) cerrarDrop();

      await cargarProveedores(tab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));
      cerrarModalAccion();
    } catch (err) {
      setModalAccion((p) => ({ ...p, loading: false }));
      mostrarToast("error", err?.message || "No se pudo completar la acción.");
    } finally {
      setAccionandoId(null);
    }
  }, [modalAccion, pestana, cargarProveedores, editandoId, cerrarDrop, cerrarModalAccion, mostrarToast]);

  const modalConfig = useMemo(() => {
    const nombre  = String(modalAccion.row?.nombre || "—");
    const details = [{ label: "Proveedor", value: nombre }];
    if (modalAccion.type === "baja")
      return { title: "Dar de baja proveedor",  message: "¿Seguro que querés dar de baja este proveedor?",           warning: "Pasará a inactivos.",                  confirmLabel: "Dar de baja", cancelLabel: "Cancelar", variant: "danger",  details };
    if (modalAccion.type === "alta")
      return { title: "Dar de alta proveedor",   message: "¿Seguro que querés dar de alta este proveedor?",           warning: "Volverá a activos.",                   confirmLabel: "Dar de alta", cancelLabel: "Cancelar", variant: "success", details };
    return   { title: "Eliminar proveedor",      message: "¿Seguro que querés eliminar este proveedor definitivamente?", warning: "Esta acción no se puede deshacer.", confirmLabel: "Eliminar",    cancelLabel: "Cancelar", variant: "danger",  details };
  }, [modalAccion]);

  /* skeleton */
  const renderSkelRow = (idx) => (
    <div key={`sk-${idx}`} className="mov-gridTable mov-gridTable--row mov-row--skeleton sp-grid" role="row" aria-hidden="true">
      <div className="mov-gridCell" role="cell"><span className="mov-skeletonBar" style={{ width: ["72%","58%","66%","48%","62%","54%"][idx % 6] }} /></div>
      <div className="mov-gridCell is-center" role="cell"><span className="mov-skeletonBar" style={{ width: "44%" }} /></div>
      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell">
        <div className="mov-skelActions"><span className="mov-skelIcon" /><span className="mov-skelIcon" /></div>
      </div>
    </div>
  );

  /* ════════════════════════════ JSX ══════════════════════════════════════ */
  return (
    <>
      <style>{EXTRA_CSS}</style>

      <div className="mov-page">
        <section className="mov-card mov-card--table">

          {/* ── HEAD ── */}
          <div className="mov-card__head">
            <div className="mov-card__headLeft">

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="mov-card__title">
                  Stock · Proveedores
                </div>
                <div className="mov-card__hint">
                  Mostrando <b>{proveedoresOrdenados.length}</b> proveedor{proveedoresOrdenados.length !== 1 ? "es" : ""}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="mov-tabs">
                  <button type="button" className={`mov-tab ${pestana === "activos"   ? "is-active" : ""}`} onClick={() => setPestana("activos")}   disabled={loading || saving}>Activos</button>
                  <button type="button" className={`mov-tab ${pestana === "inactivos" ? "is-active" : ""}`} onClick={() => setPestana("inactivos")} disabled={loading || saving}>Inactivos</button>
                </div>
              </div>
            </div>

            {/* ── acciones (recargar + nuevo) ── */}
            <div className="mov-card__actions">
              {/* nuevo proveedor — wrapper posicionado */}
              <div className="sp-dropWrap" ref={dropWrapRef}>
                <button type="button"
                  className={`mov-btn mov-btn--primary ${dropOpen ? "sp-btn--open" : ""}`}
                  onClick={toggleDrop}
                  disabled={saving}
                  title={dropOpen ? "Cerrar" : "Agregar nuevo proveedor"}
                >
                  <FontAwesomeIcon
                    icon={dropOpen && modo === "editar" ? faPenToSquare : faPlus}
                    style={{ marginRight: 7 }}
                  />
                  {dropOpen && modo === "editar" ? "Editando" : "Nuevo proveedor"}
                </button>

                {/* ── DROPDOWN FLOTANTE ── */}
                {dropOpen && (
                  <div className="sp-dropdown" role="dialog" aria-modal="false" aria-label={modo === "crear" ? "Nuevo proveedor" : "Editar proveedor"}>

                    {/* título */}
                    <div className="sp-dropdown__title">
                      <FontAwesomeIcon icon={modo === "crear" ? faPlus : faPenToSquare} style={{ opacity: .75 }} />
                      {modo === "crear" ? "Nuevo proveedor" : "Editar proveedor"}
                    </div>

                    {/* banner edición */}
                    {modo === "editar" && (
                      <div className="sp-editBanner">
                        <FontAwesomeIcon icon={faPenToSquare} />
                        Editando #{editandoId}
                      </div>
                    )}

                    {/* nombre */}
                    <div className={`sp-floatingField ${form.nombre ? "is-active" : ""}`}>
                      <input
                        ref={nombreRef}
                        className="sp-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) => setForm((p) => ({ ...p, nombre: toUpperValue(e.target.value) }))}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <label className="sp-floatingLabel">
                        <FontAwesomeIcon icon={faBuilding} /> Nombre *
                      </label>
                    </div>

                    {/* estado */}
                    <div className="sp-floatingField is-active">
                      <select
                        className="sp-input"
                        value={String(form.activo)}
                        onChange={(e) => setForm((p) => ({ ...p, activo: Number(e.target.value) }))}
                        disabled={saving}
                      >
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                      </select>
                      <label className="sp-floatingLabel">Estado</label>
                    </div>

                    {/* acciones */}
                    <div className="sp-formActions">
                      <button type="button" className="mov-btn mov-btn--primary"
                        onClick={handleGuardar} disabled={saving}
                      >
                        <FontAwesomeIcon icon={faFloppyDisk} style={{ marginRight: 7 }} />
                        {saving ? "Guardando…" : modo === "crear" ? "Crear" : "Guardar"}
                      </button>
                      <button type="button" className="mov-btn mov-btn--ghost"
                        onClick={cerrarDrop} disabled={saving}
                      >
                        <FontAwesomeIcon icon={faTimes} style={{ marginRight: 6 }} />
                        Cancelar
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── HEADER TABLA ── */}
          <div className="mov-gridTable mov-gridTable--head sp-grid" role="row">
            {COLUMNS.map((c) => (
              <div key={c.key}
                className={["mov-gridCell","mov-gridCell--head", c.align === "center" ? "is-center" : "", c.align === "right" ? "is-right" : ""].join(" ")}
                role="columnheader"
              >
                {c.label}
              </div>
            ))}
          </div>

          {/* ── BODY ── */}
          <div className="mov-tableWrap" role="rowgroup">
            <div className={["mov-gridBody", loading ? "mov-softLoading" : ""].join(" ")}>

              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkelRow(i))}
                </div>

              ) : proveedoresOrdenados.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <FontAwesomeIcon icon={faBoxOpen} style={{ fontSize: 28, opacity: .3, marginBottom: 10, display: "block" }} />
                  <div style={{ fontSize: 13, color: "var(--mov-muted)", fontWeight: 520 }}>
                    {pestana === "activos" ? "No hay proveedores activos." : "No hay proveedores inactivos."}
                  </div>
                </div>

              ) : (
                proveedoresOrdenados.map((row) => {
                  const activo    = Number(row?.activo ?? 1) === 1;
                  const isEditing = getProveedorId(row) === Number(editandoId || 0) && modo === "editar" && dropOpen;
                  const bloqueado = accionandoId === getProveedorId(row) || saving;

                  return (
                    <div key={getProveedorId(row)}
                      className={["mov-gridTable","mov-gridTable--row","sp-grid", isEditing ? "sp-row--editing" : ""].join(" ").trim()}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="NOMBRE">
                        <span className="mov-ellipsissss" title={row?.nombre || "—"}>{row?.nombre || "—"}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="ESTADO">
                        <span className={`sp-chip ${activo ? "sp-chip--active" : "sp-chip--inactive"}`}>
                          {activo ? "Activo" : "Inactivo"}
                        </span>
                      </div>

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="ACCIONES">
                        <div className="mov-actionsInline">
                          {activo ? (
                            <>
                              <button type="button" className="mov-iconBtn"
                                onClick={() => iniciarEdicion(row)} disabled={bloqueado} title="Editar">
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>
                              <button type="button" className="mov-iconBtn"
                                onClick={() => abrirModalAccion("baja", row)} disabled={bloqueado} title="Dar de baja">
                                <FontAwesomeIcon icon={faUserSlash} />
                              </button>
                            </>
                          ) : (
                            <button type="button" className="mov-iconBtn"
                              onClick={() => abrirModalAccion("alta", row)} disabled={bloqueado} title="Dar de alta">
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}
                          <button type="button" className="mov-iconBtn mov-iconBtn--danger"
                            onClick={() => abrirModalAccion("eliminar", row)} disabled={bloqueado} title="Eliminar">
                            <FontAwesomeIcon icon={faTrashCan} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      <ModalAccionEntidadStock
        open={modalAccion.open}
        onClose={cerrarModalAccion}
        onConfirm={ejecutarAccionModal}
        loading={modalAccion.loading}
        title={modalConfig.title}
        message={modalConfig.message}
        warning={modalConfig.warning}
        confirmLabel={modalConfig.confirmLabel}
        cancelLabel={modalConfig.cancelLabel}
        details={modalConfig.details}
        variant={modalConfig.variant}
      />

      {toast && (
        <Toast key={toast.id} tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={() => setToast(null)} />
      )}
    </>
  );
}