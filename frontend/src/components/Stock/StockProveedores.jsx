import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faBuilding,
  faUserSlash,
  faUserCheck,
  faBoxOpen,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import ModalEliminar from "../Global/Modales/ModalEliminar";
import Toast from "../Global/Toast";
import "../Global/Global_css/Global_Section.css";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

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

function toUpperValue(v) {
  return String(v || "").toUpperCase();
}

function getProveedorId(row) {
  return Number(
    row?.id_proveedor ??
      row?.id_stock_proveedor ??
      row?.id_proveedor_stock ??
      row?.id ??
      0
  );
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
    method: "POST",
    headers: buildHeadersJSON(),
    body: JSON.stringify(body || {}),
  });
  return parseJsonOrThrow(res);
}

const COLUMNS = [
  { key: "nombre", label: "NOMBRE", align: "left" },
  { key: "estado", label: "ESTADO", align: "center" },
  { key: "acciones", label: "ACCIONES", align: "center" },
];

const SKELETON_ROWS = 6;

export default function StockProveedores() {
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accionandoId, setAccionandoId] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [pestana, setPestana] = useState("activos");

  const [dropOpen, setDropOpen] = useState(false);
  const [modo, setModo] = useState("crear");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: "", activo: 1 });

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

  const cargarProveedores = useCallback(
    async (tab) => {
      setLoading(true);
      try {
        const p = new URLSearchParams({
          action: "stock_proveedores_listar",
          activo: tab === "inactivos" ? "0" : "1",
        });

        const data = await apiGet(`${API_URL}?${p.toString()}`);
        setProveedores(Array.isArray(data?.proveedores) ? data.proveedores : []);
      } catch (err) {
        mostrarToast("error", err?.message || "No se pudieron cargar los proveedores.");
      } finally {
        setLoading(false);
      }
    },
    [mostrarToast]
  );

  useEffect(() => {
    cargarProveedores(pestana);
    cerrarDrop();
  }, [pestana]); // eslint-disable-line

  const proveedoresOrdenados = useMemo(() => {
    return [...proveedores].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
        sensitivity: "base",
      })
    );
  }, [proveedores]);

  const iniciarEdicion = useCallback((row) => {
    setModo("editar");
    setEditandoId(getProveedorId(row));
    setForm({
      nombre: toUpperValue(row?.nombre),
      activo: Number(row?.activo ?? 1) === 1 ? 1 : 0,
    });
    setDropOpen(true);
    setTimeout(() => nombreRef.current?.focus(), 120);
  }, []);

  const handleGuardar = async () => {
    const payload = {
      nombre: toUpperValue(form.nombre).trim(),
      activo: Number(form.activo) === 1 ? 1 : 0,
    };

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
          id_proveedor: editandoId,
          id_stock_proveedor: editandoId,
          ...payload,
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
    if (e.key === "Enter") {
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
    const id = getProveedorId(row);

    if (!id || !type) {
      throw new Error("No se encontró el proveedor seleccionado.");
    }

    setModalAccion((p) => ({ ...p, loading: true }));
    setAccionandoId(id);

    try {
      let action = "";
      let mensajeExito = "";
      let tab = pestana;

      if (type === "baja") {
        action = "stock_proveedor_dar_baja";
        mensajeExito = "Proveedor dado de baja correctamente.";
        tab = "activos";
      } else if (type === "alta") {
        action = "stock_proveedor_dar_alta";
        mensajeExito = "Proveedor dado de alta correctamente.";
        tab = "inactivos";
      } else if (type === "eliminar") {
        action = "stock_proveedor_eliminar";
        mensajeExito = "Proveedor eliminado correctamente.";
        tab = pestana;
      } else {
        throw new Error("Acción inválida.");
      }

      const data = await apiPost(action, {
        id_proveedor: id,
        id_stock_proveedor: id,
      });

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) {
        cerrarDrop();
      }

      await cargarProveedores(tab);
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
      window.dispatchEvent(new CustomEvent("balto:listas-updated"));

      setModalAccion({ open: false, type: null, row: null, loading: false });

      mostrarToast("exito", data?.mensaje || mensajeExito);
    } catch (err) {
      mostrarToast("error", err?.message || "No se pudo completar la acción.");
      throw err;
    } finally {
      setAccionandoId(null);
      setModalAccion((p) => ({ ...p, loading: false }));
    }
  }, [modalAccion, pestana, cargarProveedores, editandoId, cerrarDrop, mostrarToast]);

  const modalConfig = useMemo(() => {
    const row = modalAccion.row;
    const nombre = String(row?.nombre || "—");
    const activo = Number(row?.activo ?? 1) === 1;

    if (modalAccion.type === "baja") {
      return {
        title: "Dar de baja proveedor",
        message: "¿Seguro que querés dar de baja este proveedor?",
        warning: "El proveedor pasará a la pestaña de inactivos.",
        loadingMessage: "Dando de baja proveedor...",
        successMessage: "Proveedor dado de baja correctamente.",
        errorMessage: "No se pudo dar de baja el proveedor.",
        confirmLabel: "Dar de baja",
        confirmVariant: "danger",
        details: [
          { label: "ID Proveedor", value: `#${getProveedorId(row)}` },
          { label: "Nombre", value: nombre },
          { label: "Estado actual", value: "Activo" },
        ],
      };
    }

    if (modalAccion.type === "alta") {
      return {
        title: "Dar de alta proveedor",
        message: "¿Seguro que querés dar de alta este proveedor?",
        warning: "El proveedor volverá a la pestaña de activos.",
        loadingMessage: "Dando de alta proveedor...",
        successMessage: "Proveedor dado de alta correctamente.",
        errorMessage: "No se pudo dar de alta el proveedor.",
        confirmLabel: "Dar de alta",
        confirmVariant: "primary",
        details: [
          { label: "ID Proveedor", value: `#${getProveedorId(row)}` },
          { label: "Nombre", value: nombre },
          { label: "Estado actual", value: "Inactivo" },
        ],
      };
    }

    return {
      title: "Eliminar proveedor",
      message: "¿Seguro que querés eliminar este proveedor definitivamente?",
      warning: "Esta acción no se puede deshacer.",
      loadingMessage: "Eliminando proveedor...",
      successMessage: "Proveedor eliminado correctamente.",
      errorMessage: "No se pudo eliminar el proveedor.",
      confirmLabel: "Eliminar",
      confirmVariant: "danger",
      details: [
        { label: "ID Proveedor", value: `#${getProveedorId(row)}` },
        { label: "Nombre", value: nombre },
        { label: "Estado", value: activo ? "Activo" : "Inactivo" },
      ],
    };
  }, [modalAccion]);

  const renderSkelRow = (idx) => (
    <div
      key={`sk-${idx}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton sp-grid"
      role="row"
      aria-hidden="true"
    >
      <div className="mov-gridCell" role="cell">
        <span
          className="mov-skeletonBar"
          style={{ width: ["72%", "58%", "66%", "48%", "62%", "54%"][idx % 6] }}
        />
      </div>
      <div className="mov-gridCell is-center" role="cell">
        <span className="mov-skeletonBar" style={{ width: "44%" }} />
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
                <div className="mov-card__title">Stock · Proveedores</div>
                <div className="mov-card__hint">
                  Mostrando <b>{proveedoresOrdenados.length}</b> proveedor
                  {proveedoresOrdenados.length !== 1 ? "es" : ""}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="mov-tabs">
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "activos" ? "is-active" : ""}`}
                    onClick={() => setPestana("activos")}
                    disabled={loading || saving || modalAccion.loading}
                  >
                    Activos
                  </button>
                  <button
                    type="button"
                    className={`mov-tab ${pestana === "inactivos" ? "is-active" : ""}`}
                    onClick={() => setPestana("inactivos")}
                    disabled={loading || saving || modalAccion.loading}
                  >
                    Inactivos
                  </button>
                </div>
              </div>
            </div>

            <div className="mov-card__actions">
              <div className="sp-dropWrap" ref={dropWrapRef}>
                <button
                  type="button"
                  className={`mov-btn mov-btn--primary ${dropOpen ? "sp-btn--open" : ""}`}
                  onClick={toggleDrop}
                  disabled={saving || modalAccion.loading}
                  title={dropOpen ? "Cerrar" : "Agregar nuevo proveedor"}
                >
                  <FontAwesomeIcon
                    icon={dropOpen && modo === "editar" ? faPenToSquare : faPlus}
                    style={{ marginRight: 7 }}
                  />
                  {dropOpen && modo === "editar" ? "Editando" : "Nuevo proveedor"}
                </button>

                {dropOpen && (
                  <div
                    className="sp-dropdown"
                    role="dialog"
                    aria-modal="false"
                    aria-label={modo === "crear" ? "Nuevo proveedor" : "Editar proveedor"}
                  >
                    <div className="sp-dropdown__title">
                      <FontAwesomeIcon
                        icon={modo === "crear" ? faPlus : faPenToSquare}
                        style={{ opacity: 0.75 }}
                      />
                      {modo === "crear" ? "Nuevo proveedor" : "Editar proveedor"}
                    </div>

                    {modo === "editar" && (
                      <div className="sp-editBanner">
                        <FontAwesomeIcon icon={faPenToSquare} />
                        Editando #{editandoId}
                      </div>
                    )}

                    <div className={`sp-floatingField ${form.nombre ? "is-active" : ""}`}>
                      <input
                        ref={nombreRef}
                        className="sp-input"
                        placeholder=" "
                        value={form.nombre}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, nombre: toUpperValue(e.target.value) }))
                        }
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                      />
                      <label className="sp-floatingLabel">
                        <FontAwesomeIcon icon={faBuilding} /> Nombre *
                      </label>
                    </div>

                    <div className="sp-floatingField is-active">
                      <select
                        className="sp-input"
                        value={String(form.activo)}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, activo: Number(e.target.value) }))
                        }
                        disabled={saving}
                      >
                        <option value="1">Activo</option>
                        <option value="0">Inactivo</option>
                      </select>
                      <label className="sp-floatingLabel">Estado</label>
                    </div>

                    <div className="sp-formActions">
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

          <div className="mov-gridTable mov-gridTable--head sp-grid" role="row">
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
            <div className={["mov-gridBody", loading ? "mov-softLoading" : ""].join(" ")}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkelRow(i))}
                </div>
              ) : proveedoresOrdenados.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <FontAwesomeIcon
                    icon={faBoxOpen}
                    style={{ fontSize: 28, opacity: 0.3, marginBottom: 10, display: "block" }}
                  />
                  <div style={{ fontSize: 13, color: "var(--mov-muted)", fontWeight: 520 }}>
                    {pestana === "activos"
                      ? "No hay proveedores activos."
                      : "No hay proveedores inactivos."}
                  </div>
                </div>
              ) : (
                proveedoresOrdenados.map((row) => {
                  const activo = Number(row?.activo ?? 1) === 1;
                  const isEditing =
                    getProveedorId(row) === Number(editandoId || 0) &&
                    modo === "editar" &&
                    dropOpen;
                  const bloqueado =
                    accionandoId === getProveedorId(row) || saving || modalAccion.loading;

                  return (
                    <div
                      key={getProveedorId(row)}
                      className={[
                        "mov-gridTable",
                        "mov-gridTable--row",
                        "sp-grid",
                        isEditing ? "sp-row--editing" : "",
                      ]
                        .join(" ")
                        .trim()}
                      role="row"
                    >
                      <div className="mov-gridCell is-strong" role="cell" data-label="NOMBRE">
                        <span className="mov-ellipsis" title={row?.nombre || "—"}>
                          {row?.nombre || "—"}
                        </span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="ESTADO">
                        <span className={`sp-chip ${activo ? "sp-chip--active" : "sp-chip--inactive"}`}>
                          {activo ? "Activo" : "Inactivo"}
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
                                onClick={() => iniciarEdicion(row)}
                                disabled={bloqueado}
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn"
                                onClick={() => abrirModalAccion("baja", row)}
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
                              onClick={() => abrirModalAccion("alta", row)}
                              disabled={bloqueado}
                              title="Dar de alta"
                            >
                              <FontAwesomeIcon icon={faUserCheck} />
                            </button>
                          )}

                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            onClick={() => abrirModalAccion("eliminar", row)}
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
                id: getProveedorId(modalAccion.row),
                nombre: modalAccion.row?.nombre || "—",
                estado: Number(modalAccion.row?.activo ?? 1) === 1 ? "Activo" : "Inactivo",
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