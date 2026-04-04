import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "./Stock.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faLayerGroup,
  faTag,
  faAlignLeft,
  faBoxesStacked,
  faUserSlash,
  faUserCheck,
  faTimes,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";
import ModalAccionEntidadStock from "./modales/ModalAccionEntidadStock";
import Toast from "../Global/Toast";

/* ─── CSS extra (dropdown + chips) ─── */
const EXTRA_CSS = `
/* ── Grid tabla ── */
.scat-grid { grid-template-columns: 1.4fr 2fr 110px 90px 108px; }

/* ── Wrapper del botón ── */
.scat-dropWrap {
  position: relative;
}

/* ── Dropdown flotante ── */
.scat-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 300;
  width: 320px;

  background: #fff;
  border: 1px solid rgba(10,37,64,.13);
  border-radius: 14px;
  box-shadow: 0 20px 48px -10px rgba(10,37,64,.22), 0 4px 12px rgba(10,37,64,.08);

  padding: 18px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  animation: scat-dropIn 180ms cubic-bezier(.4,0,.2,1) both;
  transform-origin: top right;
}

@keyframes scat-dropIn {
  from { opacity: 0; transform: scale(.95) translateY(-6px); }
  to   { opacity: 1; transform: scale(1)  translateY(0);     }
}

.scat-dropdown::before {
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

.scat-dropdown__title {
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

.scat-editBanner {
  font-size: 11px;
  font-weight: 650;
  color: var(--balto-action);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: -4px;
}

/* ── Floating field ── */
.scat-floatingField { position: relative; width: 100%; }

.scat-input {
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
.scat-input:hover   { border-color: rgba(10,37,64,.28); }
.scat-input:focus   { border-color: rgba(0,85,187,.55); box-shadow: 0 0 0 3px rgba(0,85,187,.18); background: #fafcff; }
.scat-input:disabled{ opacity: .55; cursor: not-allowed; background: #f6f9fc; }

/* textarea variante */
.scat-input--textarea {
  height: auto;
  min-height: 80px;
  padding-top: 22px;
  resize: vertical;
}

.scat-floatingLabel {
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

/* label para textarea: ancla arriba desde el inicio */
.scat-floatingField--textarea .scat-floatingLabel {
  top: 14px;
  transform: none;
}

.scat-floatingField.is-active .scat-floatingLabel,
.scat-floatingField:focus-within .scat-floatingLabel,
.scat-input:not(:placeholder-shown) + .scat-floatingLabel {
  top: 0;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 700;
  color: #0055BB;
  letter-spacing: .02em;
}

/* textarea: cuando activo el label queda arriba fijo */
.scat-floatingField--textarea.is-active .scat-floatingLabel,
.scat-floatingField--textarea:focus-within .scat-floatingLabel {
  top: -8px;
  transform: none;
  font-size: 11px;
  font-weight: 700;
  color: #0055BB;
  letter-spacing: .02em;
}

/* ── Acciones del form ── */
.scat-formActions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}
.scat-formActions .mov-btn {
  flex: 1;
  height: 42px;
  justify-content: center;
}

/* ── Botón activo ── */
.scat-btn--open {
  background: color-mix(in srgb, var(--balto-action) 10%, #fff) !important;
  border-color: color-mix(in srgb, var(--balto-action) 35%, #fff) !important;
  color: var(--balto-action) !important;
  box-shadow: none !important;
}

/* ── Chips estado ── */
.scat-chip {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 3px 10px; border-radius: 999px;
  font-size: 11px; font-weight: 700; letter-spacing: .2px;
  border: 1px solid transparent; user-select: none;
}
.scat-chip--active  { background: rgba(16,185,129,.12); color: #057A55; border-color: rgba(16,185,129,.30); }
.scat-chip--inactive{ background: rgba(148,163,184,.12); color: #64748b; border-color: rgba(148,163,184,.30); }

/* ── Fila en edición ── */
.scat-row--editing { background: rgba(0,85,187,.05) !important; }
.scat-row--editing:hover { background: rgba(0,85,187,.08) !important; }

/* ── Contador de productos ── */
.scat-prodCount {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--balto-text, #425466);
}

/* ─── Dark mode ─── */
html[data-theme="oscuro"] .scat-dropdown {
  background: #0f1929 !important;
  border-color: rgba(148,163,184,.18) !important;
  box-shadow: 0 24px 56px -12px rgba(0,0,0,.65), 0 4px 14px rgba(0,0,0,.30) !important;
}
html[data-theme="oscuro"] .scat-dropdown::before {
  background: #0f1929 !important;
  border-color: rgba(148,163,184,.18) !important;
}
html[data-theme="oscuro"] .scat-dropdown__title { color: rgba(226,232,240,.92) !important; border-bottom-color: rgba(148,163,184,.14) !important; }
html[data-theme="oscuro"] .scat-input {
  background: rgba(15,23,42,.88) !important;
  color: rgba(226,232,240,.92) !important;
  border-color: rgba(148,163,184,.18) !important;
}
html[data-theme="oscuro"] .scat-input:focus {
  background: rgba(15,23,42,.96) !important;
  border-color: rgba(78,161,255,.45) !important;
  box-shadow: 0 0 0 3px rgba(78,161,255,.18) !important;
}
html[data-theme="oscuro"] .scat-floatingLabel { background: transparent !important; color: rgba(226,232,240,.65) !important; }
html[data-theme="oscuro"] .scat-floatingField.is-active .scat-floatingLabel,
html[data-theme="oscuro"] .scat-floatingField:focus-within .scat-floatingLabel { color: rgba(78,161,255,.92) !important; }
html[data-theme="oscuro"] .scat-btn--open { background: rgba(78,161,255,.12) !important; border-color: rgba(78,161,255,.28) !important; color: rgba(78,161,255,.95) !important; }
html[data-theme="oscuro"] .scat-chip--active  { background: rgba(16,185,129,.16) !important; color: #34d399 !important; }
html[data-theme="oscuro"] .scat-chip--inactive{ background: rgba(148,163,184,.16) !important; color: #94a3b8 !important; }
html[data-theme="oscuro"] .scat-row--editing  { background: rgba(78,161,255,.08) !important; }
html[data-theme="oscuro"] .scat-editBanner    { color: rgba(78,161,255,.90) !important; }
html[data-theme="oscuro"] .scat-prodCount     { color: rgba(226,232,240,.75) !important; }
`;

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const COLUMNS = [
  { key: "nombre",          label: "NOMBRE",      align: "left"   },
  { key: "descripcion",     label: "DESCRIPCIÓN", align: "left"   },
  { key: "estado",          label: "ESTADO",      align: "center" },
  { key: "total_productos", label: "PRODUCTOS",   align: "center" },
  { key: "acciones",        label: "ACCIONES",    align: "center" },
];
const SKELETON_ROWS = 6;

function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}
function buildHeadersJSON() {
  return { ...buildHeadersGET(), "Content-Type": "application/json" };
}
function toUpperValue(value) {
  return String(value || "").toUpperCase();
}
function getCategoriaId(cat) {
  return Number(cat?.id_stock_categoria ?? cat?.id ?? 0);
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
    if (e instanceof Error && e.message && !e.message.startsWith("Unexpected token")) throw e;
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}`);
  }
}
async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
  return parseJsonOrThrow(res);
}
async function apiPost(action, body) {
  const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: buildHeadersJSON(),
    body: JSON.stringify(body || {}),
  });
  return parseJsonOrThrow(res);
}

export default function StockCategorias() {
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accionandoId, setAccionandoId] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [pestana, setPestana] = useState("activas");

  /* dropdown */
  const [dropOpen, setDropOpen] = useState(false);
  const [modo, setModo] = useState("crear");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", activo: 1 });

  const dropWrapRef = useRef(null);
  const nombreRef = useRef(null);

  const [modalAccion, setModalAccion] = useState({ open: false, type: null, row: null, loading: false });

  /* cerrar dropdown al hacer click fuera */
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e) => {
      if (dropWrapRef.current && !dropWrapRef.current.contains(e.target)) cerrarDrop();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]); // eslint-disable-line

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({ tipo, mensaje, duracion, id: Date.now() + Math.random() });
  }, []);

  const resetForm = useCallback(() => {
    setModo("crear");
    setEditandoId(null);
    setForm({ nombre: "", descripcion: "", activo: 1 });
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
  const cargarCategorias = useCallback(async (tab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: "stock_categorias_listar",
        activo: tab === "inactivas" ? "0" : "1",
      });
      const data = await apiGet(`${API_URL}?${params.toString()}`);
      setCategorias(Array.isArray(data?.categorias) ? data.categorias : []);
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudieron cargar las categorías.");
    } finally {
      setLoading(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    cargarCategorias(pestana);
    cerrarDrop();
  }, [pestana]); // eslint-disable-line

  const categoriasOrdenadas = useMemo(
    () => [...categorias].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" })
    ),
    [categorias]
  );

  /* editar desde fila */
  const iniciarEdicion = useCallback((cat) => {
    setModo("editar");
    setEditandoId(getCategoriaId(cat));
    setForm({
      nombre: toUpperValue(cat?.nombre),
      descripcion: toUpperValue(cat?.descripcion),
      activo: Number(cat?.activo ?? 1) === 1 ? 1 : 0,
    });
    setDropOpen(true);
    setTimeout(() => nombreRef.current?.focus(), 120);
  }, []);

  /* guardar */
  const handleGuardar = async () => {
    const payload = {
      nombre: toUpperValue(form.nombre).trim(),
      descripcion: toUpperValue(form.descripcion).trim(),
      activo: Number(form.activo) === 1 ? 1 : 0,
    };
    if (!payload.nombre) {
      mostrarToast("error", "El nombre de la categoría es obligatorio.");
      nombreRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      if (modo === "crear") {
        const data = await apiPost("stock_categoria_crear", payload);
        mostrarToast("exito", data?.mensaje || "Categoría creada correctamente.");
      } else {
        const data = await apiPost("stock_categoria_actualizar", {
          id_stock_categoria: editandoId,
          ...payload,
        });
        mostrarToast("exito", data?.mensaje || "Categoría actualizada correctamente.");
      }
      const tab = payload.activo === 1 ? "activas" : "inactivas";
      setPestana(tab);
      await cargarCategorias(tab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));
      cerrarDrop();
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudo guardar la categoría.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); handleGuardar(); }
    if (e.key === "Escape") { e.preventDefault(); cerrarDrop(); }
  };

  /* modal acciones */
  const abrirModalAccion = useCallback((type, row) => {
    setModalAccion({ open: true, type, row, loading: false });
  }, []);

  const cerrarModalAccion = useCallback(() => {
    setModalAccion({ open: false, type: null, row: null, loading: false });
  }, []);

  const ejecutarAccionModal = useCallback(async () => {
    const { row, type } = modalAccion;
    const id = getCategoriaId(row);
    if (!id || !type) return;

    setModalAccion((prev) => ({ ...prev, loading: true }));
    setAccionandoId(id);

    try {
      let action = "", successFallback = "", recargarTab = pestana;

      if (type === "baja") {
        action = "stock_categoria_dar_baja";
        successFallback = "Categoría dada de baja.";
        recargarTab = "activas";
      } else if (type === "alta") {
        action = "stock_categoria_dar_alta";
        successFallback = "Categoría dada de alta.";
        recargarTab = "inactivas";
      } else {
        action = "stock_categoria_eliminar";
        successFallback = "Categoría eliminada.";
        recargarTab = pestana;
      }

      const data = await apiPost(action, { id_stock_categoria: id });
      mostrarToast("exito", data?.mensaje || successFallback);

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) cerrarDrop();

      await cargarCategorias(recargarTab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));
      cerrarModalAccion();
    } catch (err) {
      setModalAccion((prev) => ({ ...prev, loading: false }));
      mostrarToast("error", err?.message || "No se pudo completar la acción.");
    } finally {
      setAccionandoId(null);
    }
  }, [modalAccion, pestana, cargarCategorias, editandoId, cerrarDrop, cerrarModalAccion, mostrarToast]);

  const modalConfig = useMemo(() => {
    const cat = modalAccion.row;
    const nombre = String(cat?.nombre || "—");
    const totalProductos = Number(cat?.total_productos || 0);

    if (modalAccion.type === "baja") {
      return {
        title: "Dar de baja categoría",
        message: "¿Seguro que querés dar de baja esta categoría?",
        warning: totalProductos > 0 ? `Seguirá asociada a ${totalProductos} producto(s).` : "Pasará a inactivas.",
        confirmLabel: "Dar de baja",
        cancelLabel: "Cancelar",
        variant: "danger",
        details: [{ label: "Categoría", value: nombre }, { label: "Productos", value: String(totalProductos) }],
      };
    }
    if (modalAccion.type === "alta") {
      return {
        title: "Dar de alta categoría",
        message: "¿Seguro que querés dar de alta esta categoría?",
        warning: "Volverá a activas.",
        confirmLabel: "Dar de alta",
        cancelLabel: "Cancelar",
        variant: "success",
        details: [{ label: "Categoría", value: nombre }, { label: "Productos", value: String(totalProductos) }],
      };
    }
    return {
      title: "Eliminar categoría",
      message: totalProductos > 0
        ? `¿Eliminar? Los ${totalProductos} productos quedarán sin categoría.`
        : "¿Seguro que querés eliminar esta categoría?",
      warning: "Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
      details: [{ label: "Categoría", value: nombre }, { label: "Productos", value: String(totalProductos) }],
    };
  }, [modalAccion]);

  /* skeleton */
  const renderSkelRow = (idx) => (
    <div key={`sk-${idx}`} className="mov-gridTable mov-gridTable--row mov-row--skeleton scat-grid" role="row" aria-hidden="true">
      <div className="mov-gridCell" role="cell">
        <span className="mov-skeletonBar" style={{ width: ["72%","58%","66%","48%","62%","54%"][idx % 6] }} />
      </div>
      <div className="mov-gridCell" role="cell">
        <span className="mov-skeletonBar" style={{ width: ["55%","44%","60%","38%","50%","42%"][idx % 6] }} />
      </div>
      <div className="mov-gridCell is-center" role="cell">
        <span className="mov-skeletonBar" style={{ width: "44%" }} />
      </div>
      <div className="mov-gridCell is-center" role="cell">
        <span className="mov-skeletonBar" style={{ width: "30%" }} />
      </div>
      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell">
        <div className="mov-skelActions"><span className="mov-skelIcon" /><span className="mov-skelIcon" /></div>
      </div>
    </div>
  );

  return (
    <>
      <style>{EXTRA_CSS}</style>

      <div className="mov-page">
        <section className="mov-card mov-card--table">

          {/* ── HEAD ── */}
          <div className="mov-card__head">
            <div className="mov-card__headLeft">

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="mov-card__title">Stock · Categorías</div>
                <div className="mov-card__hint">
                  Mostrando <b>{categoriasOrdenadas.length}</b> categoría{categoriasOrdenadas.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="mov-tabs">
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "activas" ? "is-active" : ""}`}
                    onClick={() => setPestana("activas")}
                    disabled={loading || saving}
                  >
                    Activas
                  </button>
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "inactivas" ? "is-active" : ""}`}
                    onClick={() => setPestana("inactivas")}
                    disabled={loading || saving}
                  >
                    Inactivas
                  </button>
                </div>
              </div>
            </div>

            {/* ── Nuevo categoría con dropdown ── */}
            <div className="mov-card__actions">
              <div className="scat-dropWrap" ref={dropWrapRef}>
                <button
                  type="button"
                  className={`mov-btn mov-btn--primary ${dropOpen ? "scat-btn--open" : ""}`}
                  onClick={toggleDrop}
                  disabled={saving}
                  title={dropOpen ? "Cerrar" : "Agregar nueva categoría"}
                >
                  <FontAwesomeIcon
                    icon={dropOpen && modo === "editar" ? faPenToSquare : faPlus}
                    style={{ marginRight: 7 }}
                  />
                  {dropOpen && modo === "editar" ? "Editando" : "Nueva categoría"}
                </button>

                {/* ── DROPDOWN FLOTANTE ── */}
                {dropOpen && (
                  <div
                    className="scat-dropdown"
                    role="dialog"
                    aria-modal="false"
                    aria-label={modo === "crear" ? "Nueva categoría" : "Editar categoría"}
                  >
                    {/* título */}
                    <div className="scat-dropdown__title">
                      <FontAwesomeIcon icon={modo === "crear" ? faPlus : faPenToSquare} style={{ opacity: .75 }} />
                      {modo === "crear" ? "Nueva categoría" : "Editar categoría"}
                    </div>

                    {/* banner edición */}
                    {modo === "editar" && (
                      <div className="scat-editBanner">
                        <FontAwesomeIcon icon={faPenToSquare} />
                        Editando #{editandoId}
                      </div>
                    )}

                    {/* nombre */}
                    <div className={`scat-floatingField ${form.nombre ? "is-active" : ""}`}>
                      <input
                        ref={nombreRef}
                        className="scat-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) => setForm((p) => ({ ...p, nombre: toUpperValue(e.target.value) }))}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <label className="scat-floatingLabel">
                        <FontAwesomeIcon icon={faTag} /> Nombre *
                      </label>
                    </div>

                    {/* descripción */}
                    <div className={`scat-floatingField scat-floatingField--textarea ${form.descripcion ? "is-active" : ""}`}>
                      <textarea
                        className="scat-input scat-input--textarea"
                        placeholder=" "
                        value={form.descripcion}
                        onChange={(e) => setForm((p) => ({ ...p, descripcion: toUpperValue(e.target.value) }))}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                        rows={3}
                      />
                      <label className="scat-floatingLabel">
                        <FontAwesomeIcon icon={faAlignLeft} /> Descripción
                      </label>
                    </div>

                    {/* estado */}
                    <div className="scat-floatingField is-active">
                      <select
                        className="scat-input"
                        value={String(form.activo)}
                        onChange={(e) => setForm((p) => ({ ...p, activo: Number(e.target.value) }))}
                        disabled={saving}
                      >
                        <option value="1">Activa</option>
                        <option value="0">Inactiva</option>
                      </select>
                      <label className="scat-floatingLabel">Estado</label>
                    </div>

                    {/* acciones */}
                    <div className="scat-formActions">
                      <button
                        type="button"
                        className="mov-btn mov-btn--primary"
                        onClick={handleGuardar}
                        disabled={saving}
                      >
                        <FontAwesomeIcon icon={faFloppyDisk} style={{ marginRight: 7 }} />
                        {saving ? "Guardando…" : modo === "crear" ? "Crear" : "Guardar"}
                      </button>
                      <button
                        type="button"
                        className="mov-btn mov-btn--ghost"
                        onClick={cerrarDrop}
                        disabled={saving}
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
          <div className="mov-gridTable mov-gridTable--head scat-grid" role="row">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={[
                  "mov-gridCell",
                  "mov-gridCell--head",
                  c.align === "center" ? "is-center" : "",
                  c.align === "right"  ? "is-right"  : "",
                ].join(" ")}
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

              ) : categoriasOrdenadas.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <FontAwesomeIcon
                    icon={faBoxOpen}
                    style={{ fontSize: 28, opacity: .3, marginBottom: 10, display: "block" }}
                  />
                  <div style={{ fontSize: 13, color: "var(--mov-muted)", fontWeight: 520 }}>
                    {pestana === "activas" ? "No hay categorías activas." : "No hay categorías inactivas."}
                  </div>
                </div>

              ) : (
                categoriasOrdenadas.map((cat) => {
                  const activo = Number(cat?.activo ?? 1) === 1;
                  const isEditing =
                    getCategoriaId(cat) === Number(editandoId || 0) &&
                    modo === "editar" &&
                    dropOpen;
                  const bloqueado = accionandoId === getCategoriaId(cat) || saving;
                  const totalProductos = Number(cat?.total_productos || 0);

                  return (
                    <div
                      key={getCategoriaId(cat)}
                      className={[
                        "mov-gridTable",
                        "mov-gridTable--row",
                        "scat-grid",
                        isEditing ? "scat-row--editing" : "",
                      ].join(" ").trim()}
                      role="row"
                    >
                      {/* nombre */}
                      <div className="mov-gridCell is-strong" role="cell" data-label="NOMBRE">
                        <span className="mov-ellipsissss" title={cat?.nombre || "—"}>
                          {cat?.nombre || "—"}
                        </span>
                      </div>

                      {/* descripción */}
                      <div className="mov-gridCell" role="cell" data-label="DESCRIPCIÓN">
                        <span
                          className="mov-ellipsissss"
                          title={cat?.descripcion?.trim() || "Sin descripción"}
                          style={{
                            color: cat?.descripcion?.trim() ? undefined : "var(--mov-muted)",
                            fontStyle: cat?.descripcion?.trim() ? "normal" : "italic",
                            opacity: cat?.descripcion?.trim() ? 1 : 0.65,
                          }}
                        >
                          {cat?.descripcion?.trim() || "Sin descripción"}
                        </span>
                      </div>

                      {/* estado */}
                      <div className="mov-gridCell is-center" role="cell" data-label="ESTADO">
                        <span className={`scat-chip ${activo ? "scat-chip--active" : "scat-chip--inactive"}`}>
                          {activo ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      {/* productos */}
                      <div className="mov-gridCell is-center" role="cell" data-label="PRODUCTOS">
                        <span className="scat-prodCount">
                          <FontAwesomeIcon icon={faBoxesStacked} style={{ fontSize: 11, opacity: .55 }} />
                          {totalProductos}
                        </span>
                      </div>

                      {/* acciones */}
                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="ACCIONES">
                        <div className="mov-actionsInline">
                          {activo ? (
                            <>
                              <button
                                type="button"
                                className="mov-iconBtn"
                                onClick={() => iniciarEdicion(cat)}
                                disabled={bloqueado}
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>
                              <button
                                type="button"
                                className="mov-iconBtn"
                                onClick={() => abrirModalAccion("baja", cat)}
                                disabled={bloqueado}
                                title="Dar de baja"
                              >
                                <FontAwesomeIcon icon={faUserSlash} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="mov-iconBtn"
                              onClick={() => abrirModalAccion("alta", cat)}
                              disabled={bloqueado}
                              title="Dar de alta"
                            >
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            onClick={() => abrirModalAccion("eliminar", cat)}
                            disabled={bloqueado}
                            title="Eliminar"
                          >
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
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}