import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "./Stock.css";
import "../Global/Global_css/Global_Section.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faTag,
  faAlignLeft,
  faBoxesStacked,
  faUserSlash,
  faUserCheck,
  faTimes,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";
import ModalEliminar from "../Global/Modales/ModalEliminar";
import Toast from "../Global/Toast";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const COLUMNS = [
  { key: "nombre", label: "NOMBRE", align: "left" },
  { key: "descripcion", label: "DESCRIPCIÓN", align: "left" },
  { key: "estado", label: "ESTADO", align: "center" },
  { key: "total_productos", label: "PRODUCTOS", align: "center" },
  { key: "acciones", label: "ACCIONES", align: "center" },
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

function getUsuarioAuditData() {
  let idUsuarioMaster = 0;
  let idTenant = null;

  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.id_usuario_master ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      0;

    if (Number.isFinite(Number(cand))) {
      idUsuarioMaster = Number(cand);
    }

    const tenantCand =
      u?.idTenant ??
      u?.id_tenant ??
      u?.tenant_id ??
      u?.tenant?.idTenant ??
      null;

    if (
      tenantCand !== null &&
      tenantCand !== undefined &&
      tenantCand !== "" &&
      Number(tenantCand) > 0
    ) {
      idTenant = Number(tenantCand);
    }
  } catch {}

  return { idUsuarioMaster, idTenant };
}

function toUpperValue(value) {
  return String(value || "").toUpperCase();
}

function getCategoriaId(cat) {
  return Number(cat?.id_stock_categoria ?? cat?.id ?? 0);
}

async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error("Sesión vencida o no autorizada.");
  }

  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  try {
    const data = JSON.parse(text);
    if (!res.ok || data?.exito === false) {
      throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.message && !e.message.startsWith("Unexpected token")) {
      throw e;
    }
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

  const [dropOpen, setDropOpen] = useState(false);
  const [modo, setModo] = useState("crear");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "", activo: 1 });

  const dropWrapRef = useRef(null);
  const nombreRef = useRef(null);

  const [modalAccion, setModalAccion] = useState({
    open: false,
    type: null,
    row: null,
    loading: false,
  });

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

  const cargarCategorias = useCallback(
    async (tab) => {
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
    },
    [mostrarToast]
  );

  useEffect(() => {
    cargarCategorias(pestana);
    cerrarDrop();
  }, [pestana]); // eslint-disable-line

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
        sensitivity: "base",
      })
    );
  }, [categorias]);

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

  const handleGuardar = async () => {
    const { idUsuarioMaster, idTenant } = getUsuarioAuditData();

    const payload = {
      nombre: toUpperValue(form.nombre).trim(),
      descripcion: toUpperValue(form.descripcion).trim(),
      activo: Number(form.activo) === 1 ? 1 : 0,
      idUsuarioMaster,
    };

    if (idTenant) {
      payload.tenant_id = idTenant;
    }

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
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      handleGuardar();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cerrarDrop();
    }
  };

  const abrirModalAccion = useCallback((type, row) => {
    setModalAccion({ open: true, type, row, loading: false });
  }, []);

  const cerrarModalAccion = useCallback(() => {
    if (modalAccion.loading) return;
    setModalAccion({ open: false, type: null, row: null, loading: false });
  }, [modalAccion.loading]);

  const ejecutarAccionModal = useCallback(async () => {
    const { row, type } = modalAccion;
    const id = getCategoriaId(row);

    if (!id || !type) {
      throw new Error("No se encontró la categoría seleccionada.");
    }

    setModalAccion((prev) => ({ ...prev, loading: true }));
    setAccionandoId(id);

    try {
      const { idUsuarioMaster, idTenant } = getUsuarioAuditData();

      let action = "";
      let mensajeExito = "";
      let recargarTab = pestana;

      if (type === "baja") {
        action = "stock_categoria_dar_baja";
        mensajeExito = "Categoría dada de baja correctamente.";
        recargarTab = "activas";
      } else if (type === "alta") {
        action = "stock_categoria_dar_alta";
        mensajeExito = "Categoría dada de alta correctamente.";
        recargarTab = "inactivas";
      } else if (type === "eliminar") {
        action = "stock_categoria_eliminar";
        mensajeExito = "Categoría eliminada correctamente.";
        recargarTab = pestana;
      } else {
        throw new Error("Acción inválida.");
      }

      const payload = {
        id_stock_categoria: id,
        idUsuarioMaster,
      };

      if (idTenant) {
        payload.tenant_id = idTenant;
      }

      const data = await apiPost(action, payload);

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) {
        cerrarDrop();
      }

      await cargarCategorias(recargarTab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));

      setModalAccion({ open: false, type: null, row: null, loading: false });

      mostrarToast("exito", data?.mensaje || mensajeExito);
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudo completar la acción.");
      throw err;
    } finally {
      setAccionandoId(null);
      setModalAccion((prev) => ({ ...prev, loading: false }));
    }
  }, [modalAccion, pestana, editandoId, cargarCategorias, cerrarDrop, mostrarToast]);

  const modalConfig = useMemo(() => {
    const cat = modalAccion.row;
    const nombre = String(cat?.nombre || "—");
    const totalProductos = Number(cat?.total_productos || 0);
    const activa = Number(cat?.activo ?? 1) === 1;

    if (modalAccion.type === "baja") {
      return {
        title: "Dar de baja categoría",
        message: "¿Seguro que querés dar de baja esta categoría?",
        warning:
          totalProductos > 0
            ? `La categoría seguirá asociada a ${totalProductos} producto(s).`
            : "La categoría pasará a la pestaña de inactivas.",
        loadingMessage: "Dando de baja categoría...",
        successMessage: "Categoría dada de baja correctamente.",
        errorMessage: "No se pudo dar de baja la categoría.",
        confirmLabel: "Dar de baja",
        confirmVariant: "danger",
        details: [
          { label: "ID Categoría", value: `#${getCategoriaId(cat)}` },
          { label: "Nombre", value: nombre },
          { label: "Estado actual", value: "Activa" },
          { label: "Productos", value: String(totalProductos) },
        ],
      };
    }

    if (modalAccion.type === "alta") {
      return {
        title: "Dar de alta categoría",
        message: "¿Seguro que querés dar de alta esta categoría?",
        warning: "La categoría volverá a la pestaña de activas.",
        loadingMessage: "Dando de alta categoría...",
        successMessage: "Categoría dada de alta correctamente.",
        errorMessage: "No se pudo dar de alta la categoría.",
        confirmLabel: "Dar de alta",
        confirmVariant: "primary",
        details: [
          { label: "ID Categoría", value: `#${getCategoriaId(cat)}` },
          { label: "Nombre", value: nombre },
          { label: "Estado actual", value: "Inactiva" },
          { label: "Productos", value: String(totalProductos) },
        ],
      };
    }

    return {
      title: "Eliminar categoría",
      message: "¿Seguro que querés eliminar esta categoría definitivamente?",
      warning:
        totalProductos > 0
          ? `Esta acción no se puede deshacer. Los ${totalProductos} producto(s) pueden quedar sin categoría.`
          : "Esta acción no se puede deshacer.",
      loadingMessage: "Eliminando categoría...",
      successMessage: "Categoría eliminada correctamente.",
      errorMessage: "No se pudo eliminar la categoría.",
      confirmLabel: "Eliminar",
      confirmVariant: "danger",
      details: [
        { label: "ID Categoría", value: `#${getCategoriaId(cat)}` },
        { label: "Nombre", value: nombre },
        { label: "Estado", value: activa ? "Activa" : "Inactiva" },
        { label: "Productos", value: String(totalProductos) },
      ],
    };
  }, [modalAccion]);

  const renderSkelRow = (idx) => (
    <div
      key={`sk-${idx}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton scat-grid"
      role="row"
      aria-hidden="true"
    >
      <div className="mov-gridCell" role="cell">
        <span
          className="mov-skeletonBar"
          style={{ width: ["72%", "58%", "66%", "48%", "62%", "54%"][idx % 6] }}
        />
      </div>
      <div className="mov-gridCell" role="cell">
        <span
          className="mov-skeletonBar"
          style={{ width: ["55%", "44%", "60%", "38%", "50%", "42%"][idx % 6] }}
        />
      </div>
      <div className="mov-gridCell is-center" role="cell">
        <span className="mov-skeletonBar" style={{ width: "44%" }} />
      </div>
      <div className="mov-gridCell is-center" role="cell">
        <span className="mov-skeletonBar" style={{ width: "30%" }} />
      </div>
      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell">
        <div className="mov-skelActions">
          <span className="mov-skelIcon" />
          <span className="mov-skelIcon" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="mov-page">
        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="mov-card__title">Stock · Categorías</div>
                <div className="mov-card__hint">
                  Mostrando <b>{categoriasOrdenadas.length}</b> categoría
                  {categoriasOrdenadas.length !== 1 ? "s" : ""}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="mov-tabs">
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "activas" ? "is-active" : ""}`}
                    onClick={() => setPestana("activas")}
                    disabled={loading || saving || modalAccion.loading}
                  >
                    Activas
                  </button>
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "inactivas" ? "is-active" : ""}`}
                    onClick={() => setPestana("inactivas")}
                    disabled={loading || saving || modalAccion.loading}
                  >
                    Inactivas
                  </button>
                </div>
              </div>
            </div>

            <div className="mov-card__actions">
              <div className="scat-dropWrap" ref={dropWrapRef}>
                <button
                  type="button"
                  className={`mov-btn mov-btn--primary ${dropOpen ? "scat-btn--open" : ""}`}
                  onClick={toggleDrop}
                  disabled={saving || modalAccion.loading}
                  title={dropOpen ? "Cerrar" : "Agregar nueva categoría"}
                >
                  <FontAwesomeIcon
                    icon={dropOpen && modo === "editar" ? faPenToSquare : faPlus}
                    style={{ marginRight: 7 }}
                  />
                  {dropOpen && modo === "editar" ? "Editando" : "Nueva categoría"}
                </button>

                {dropOpen && (
                  <div
                    className="scat-dropdown"
                    role="dialog"
                    aria-modal="false"
                    aria-label={modo === "crear" ? "Nueva categoría" : "Editar categoría"}
                  >
                    <div className="scat-dropdown__title">
                      <FontAwesomeIcon
                        icon={modo === "crear" ? faPlus : faPenToSquare}
                        style={{ opacity: 0.75 }}
                      />
                      {modo === "crear" ? "Nueva categoría" : "Editar categoría"}
                    </div>

                    {modo === "editar" && (
                      <div className="scat-editBanner">
                        <FontAwesomeIcon icon={faPenToSquare} />
                        Editando #{editandoId}
                      </div>
                    )}

                    <div className={`scat-floatingField ${form.nombre ? "is-active" : ""}`}>
                      <input
                        ref={nombreRef}
                        className="scat-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, nombre: toUpperValue(e.target.value) }))
                        }
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <label className="scat-floatingLabel">
                        <FontAwesomeIcon icon={faTag} /> Nombre *
                      </label>
                    </div>

                    <div
                      className={`scat-floatingField scat-floatingField--textarea ${
                        form.descripcion ? "is-active" : ""
                      }`}
                    >
                      <textarea
                        className="scat-input scat-input--textarea"
                        placeholder=" "
                        value={form.descripcion}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, descripcion: toUpperValue(e.target.value) }))
                        }
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                        rows={3}
                      />
                      <label className="scat-floatingLabel">
                        <FontAwesomeIcon icon={faAlignLeft} /> Descripción
                      </label>
                    </div>

                    <div className="scat-floatingField is-active">
                      <select
                        className="scat-input"
                        value={String(form.activo)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, activo: Number(e.target.value) }))
                        }
                        disabled={saving}
                      >
                        <option value="1">Activa</option>
                        <option value="0">Inactiva</option>
                      </select>
                      <label className="scat-floatingLabel">Estado</label>
                    </div>

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

          <div className="mov-gridTable mov-gridTable--head scat-grid" role="row">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={[
                  "mov-gridCell",
                  "mov-gridCell--head",
                  c.align === "center" ? "is-center" : "",
                  c.align === "right" ? "is-right" : "",
                ].join(" ")}
                role="columnheader"
              >
                {c.label}
              </div>
            ))}
          </div>

          <div className="mov-tableWrap" role="rowgroup">
            <div className={["mov-gridBody mov-gridBody--relative", loading ? "mov-softLoading" : ""].join(" ")}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkelRow(i))}
                </div>
              ) : categoriasOrdenadas.length === 0 ? (
                <div className="cc-emptyState">
                  <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                  <div className="cc-emptyText">
                    {pestana === "activas"
                      ? "No hay categorías activas."
                      : "No hay categorías inactivas."}
                  </div>
                </div>
              ) : (
                categoriasOrdenadas.map((cat) => {
                  const activo = Number(cat?.activo ?? 1) === 1;
                  const isEditing =
                    getCategoriaId(cat) === Number(editandoId || 0) &&
                    modo === "editar" &&
                    dropOpen;
                  const bloqueado =
                    accionandoId === getCategoriaId(cat) || saving || modalAccion.loading;
                  const totalProductos = Number(cat?.total_productos || 0);

                  return (
                    <div
                      key={getCategoriaId(cat)}
                      className={[
                        "mov-gridTable",
                        "mov-gridTable--row",
                        "scat-grid",
                        isEditing ? "scat-row--editing" : "",
                      ]
                        .join(" ")
                        .trim()}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="NOMBRE">
                        <span className="mov-ellipsissss" title={cat?.nombre || "—"}>
                          {cat?.nombre || "—"}
                        </span>
                      </div>

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

                      <div className="mov-gridCell is-center" role="cell" data-label="ESTADO">
                        <span
                          className={`scat-chip ${
                            activo ? "scat-chip--active" : "scat-chip--inactive"
                          }`}
                        >
                          {activo ? "Activa" : "Inactiva"}
                        </span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="PRODUCTOS">
                        <span className="scat-prodCount">
                          <FontAwesomeIcon
                            icon={faBoxesStacked}
                            style={{ fontSize: 11, opacity: 0.55 }}
                          />
                          {totalProductos}
                        </span>
                      </div>

                      <div
                        className="mov-gridCell mov-gridCell--actions is-center"
                        role="cell"
                        data-label="ACCIONES"
                      >
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

      <ModalEliminar
        open={modalAccion.open}
        row={
          modalAccion.row
            ? {
                id: getCategoriaId(modalAccion.row),
                nombre: modalAccion.row?.nombre || "—",
                estado: Number(modalAccion.row?.activo ?? 1) === 1 ? "Activa" : "Inactiva",
              }
            : null
        }
        loading={modalAccion.loading}
        onClose={cerrarModalAccion}
        onConfirm={ejecutarAccionModal}
        onToast={mostrarToast}
        title={modalConfig.title}
        message={modalConfig.message}
        warning={modalConfig.warning}
        loadingMessage={modalConfig.loadingMessage}
        successMessage={modalConfig.successMessage}
        errorMessage={modalConfig.errorMessage}
        confirmLabel={modalConfig.confirmLabel}
        cancelLabel="Cancelar"
        confirmVariant={modalConfig.confirmVariant}
        details={modalConfig.details}
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