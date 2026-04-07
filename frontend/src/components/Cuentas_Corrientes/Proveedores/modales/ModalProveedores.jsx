import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
import "../../cuentas_corrientes.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faArrowRotateRight,
  faTruckField,
  faBuilding,
  faUserSlash,
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";
import ModalEliminar from "../../../Global/Modales/ModalEliminar";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

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
    throw new Error("Sesión vencida o no autorizada. Volvé a iniciar sesión.");
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
    if (
      e instanceof Error &&
      e.message &&
      !e.message.startsWith("Unexpected token")
    ) {
      throw e;
    }

    const preview = text.length > 400 ? `${text.slice(0, 400)}...` : text;

    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }
}

async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeadersGET(),
  });
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

export default function ModalProveedores({
  open,
  onClose,
  onActualizado,
  onToast,
}) {
  const closeBtnRef = useRef(null);

  const [dark, setDark] = useState(isTemaOscuro);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accionandoId, setAccionandoId] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [pestana, setPestana] = useState("activos");
  const [modo, setModo] = useState("crear");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({
    nombre: "",
    activo: 1,
  });

  const [modalAccion, setModalAccion] = useState({
    open: false,
    type: null,
    row: null,
    loading: false,
  });

  const isBusy = loading || saving || modalAccion.loading;

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());

    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const o2 = new MutationObserver(update);
    if (document.body) {
      o2.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

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

    const h = (e) => {
      if (e.key === "Escape" && !isBusy) onClose?.();
    };

    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose, isBusy]);

  useEffect(() => {
    if (open) {
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  const resetForm = useCallback(() => {
    setModo("crear");
    setEditandoId(null);
    setForm({
      nombre: "",
      activo: pestana === "inactivos" ? 0 : 1,
    });
  }, [pestana]);

  const cargarProveedores = useCallback(
    async (tabActual = pestana) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          action: "cc_proveedores_listar",
          activo: tabActual === "inactivos" ? "0" : "1",
        });

        const data = await apiGet(`${API_URL}?${params.toString()}`);
        setProveedores(Array.isArray(data?.proveedores) ? data.proveedores : []);
      } catch (err) {
        onToast?.("error", err?.message || "No se pudieron cargar los proveedores.");
      } finally {
        setLoading(false);
      }
    },
    [onToast, pestana]
  );

  useEffect(() => {
    if (!open) return;
    cargarProveedores(pestana);
    resetForm();
  }, [open, pestana, cargarProveedores, resetForm]);

  const proveedoresOrdenados = useMemo(() => {
    return [...proveedores].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
        sensitivity: "base",
      })
    );
  }, [proveedores]);

  const iniciarEdicion = (row) => {
    setModo("editar");
    setEditandoId(getProveedorId(row));
    setForm({
      nombre: toUpperValue(row?.nombre),
      activo: Number(row?.activo ?? 1) === 1 ? 1 : 0,
    });
  };

  const cancelarEdicion = () => {
    resetForm();
  };

  const handleGuardar = async () => {
    const payload = {
      nombre: toUpperValue(form.nombre).trim(),
      activo: Number(form.activo) === 1 ? 1 : 0,
    };

    if (!payload.nombre) {
      onToast?.("error", "El nombre del proveedor es obligatorio.");
      return;
    }

    setSaving(true);

    try {
      if (modo === "crear") {
        const data = await apiPost("cc_proveedor_crear", payload);
        onToast?.("exito", data?.mensaje || "Proveedor creado correctamente.");

        if (payload.activo === 1) {
          setPestana("activos");
        } else {
          setPestana("inactivos");
        }
      } else {
        const data = await apiPost("cc_proveedor_actualizar", {
          id_proveedor: editandoId,
          id_stock_proveedor: editandoId,
          ...payload,
        });
        onToast?.("exito", data?.mensaje || "Proveedor actualizado correctamente.");

        if (payload.activo === 1) {
          setPestana("activos");
        } else {
          setPestana("inactivos");
        }
      }

      await cargarProveedores(payload.activo === 1 ? "activos" : "inactivos");
      await onActualizado?.();
      resetForm();
    } catch (err) {
      onToast?.("error", err?.message || "No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  };

  const abrirModalAccion = useCallback((type, row) => {
    setModalAccion({
      open: true,
      type,
      row,
      loading: false,
    });
  }, []);

  const cerrarModalAccion = useCallback(() => {
    if (modalAccion.loading) return;

    setModalAccion({
      open: false,
      type: null,
      row: null,
      loading: false,
    });
  }, [modalAccion.loading]);

  const ejecutarAccionModal = useCallback(async () => {
    const { row, type } = modalAccion;
    const id = getProveedorId(row);

    if (!id || !type) {
      throw new Error("No se encontró el proveedor seleccionado.");
    }

    setModalAccion((prev) => ({ ...prev, loading: true }));
    setAccionandoId(id);

    try {
      let action = "";
      let successFallback = "";

      if (type === "baja") {
        action = "cc_proveedor_dar_baja";
        successFallback = "Proveedor dado de baja correctamente.";
      } else if (type === "alta") {
        action = "cc_proveedor_dar_alta";
        successFallback = "Proveedor dado de alta correctamente.";
      } else if (type === "eliminar") {
        action = "cc_proveedor_eliminar";
        successFallback = "Proveedor eliminado correctamente.";
      } else {
        throw new Error("Acción inválida.");
      }

      const data = await apiPost(action, {
        id_proveedor: id,
        id_stock_proveedor: id,
      });

      onToast?.("exito", data?.mensaje || successFallback);

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) {
        resetForm();
      }

      await cargarProveedores(pestana);
      await onActualizado?.();

      setModalAccion({
        open: false,
        type: null,
        row: null,
        loading: false,
      });
    } catch (err) {
      onToast?.("error", err?.message || "No se pudo completar la acción.");
      throw err;
    } finally {
      setAccionandoId(null);
      setModalAccion((prev) => ({ ...prev, loading: false }));
    }
  }, [
    modalAccion,
    editandoId,
    cargarProveedores,
    pestana,
    onActualizado,
    onToast,
    resetForm,
  ]);

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

  if (!open) return null;

  return createPortal(
    <div
      className={[
        "mi-modal__overlay",
        dark ? "mi-modal__overlay--dark" : "",
      ].join(" ").trim()}
    >
      <div
        className={[
          "mi-modal__container",
          "mi-modal__container--categorias",
          dark ? "mi-modal--dark" : "",
        ].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faTruckField} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Proveedores</h2>
            <p className="mi-modal__subtitle">
              Agregá, editá, da de baja, da de alta o eliminá proveedores.
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="mi-modal__close"
            disabled={isBusy}
            onClick={() => onClose?.()}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mi-modal__content">
          <div className="mi-cr-grid">
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">
                  <FontAwesomeIcon
                    icon={modo === "crear" ? faPlus : faPenToSquare}
                    style={{ marginRight: 8, opacity: 0.75, fontSize: 13 }}
                  />
                  {modo === "crear" ? "Nuevo proveedor" : "Editar proveedor"}
                </div>
              </div>

              <div className="mi-cr-filters__body">
                <div className="fl-field">
                  <input
                    type="text"
                    className="fl-input"
                    placeholder=" "
                    value={form.nombre}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        nombre: toUpperValue(e.target.value),
                      }))
                    }
                    disabled={saving}
                  />
                  <label className="fl-label">
                    <FontAwesomeIcon icon={faBuilding} style={{ marginRight: 5 }} />
                    Nombre *
                  </label>
                </div>

                <div className="fl-field">
                  <select
                    className="fl-input"
                    value={String(form.activo)}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        activo: Number(e.target.value) === 1 ? 1 : 0,
                      }))
                    }
                    disabled={saving}
                  >
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                  <label className="fl-label">Estado</label>
                </div>

                <div
                  className="mi-cr-filters__actions"
                  style={{ flexDirection: "column" }}
                >
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mit-btn--block"
                    onClick={handleGuardar}
                    disabled={saving}
                  >
                    <FontAwesomeIcon icon={faFloppyDisk} style={{ marginRight: 8 }} />
                    {saving
                      ? "Guardando..."
                      : modo === "crear"
                      ? "Crear proveedor"
                      : "Guardar cambios"}
                  </button>

                  {modo === "editar" && (
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost mit-btn--block"
                      onClick={cancelarEdicion}
                      disabled={saving}
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>
              </div>
            </aside>

            <section className="mi-cr-table">
              <div className="mi-cr-table__foot mi-cr-table__foot--top">
                <div className="mi-cr-table__summary">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--nv-text)" }}>
                      Listado de proveedores
                    </div>
                    <div style={{ fontSize: 12, color: "var(--nv-muted)" }}>
                      Total: <b>{proveedoresOrdenados.length}</b>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className={`mit-btn ${pestana === "activos" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                    onClick={() => {
                      setPestana("activos");
                      setModo("crear");
                      setEditandoId(null);
                      setForm((prev) => ({ ...prev, activo: 1 }));
                    }}
                    disabled={loading || saving || modalAccion.loading}
                  >
                    Activos
                  </button>

                  <button
                    type="button"
                    className={`mit-btn ${pestana === "inactivos" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                    onClick={() => {
                      setPestana("inactivos");
                      setModo("crear");
                      setEditandoId(null);
                      setForm((prev) => ({ ...prev, activo: 0 }));
                    }}
                    disabled={loading || saving || modalAccion.loading}
                  >
                    Inactivos
                  </button>
                </div>
              </div>

              <div className="cc-cliente-table">
                <div className="cc-cliente-table__desktopHead">
                  <div className="cc-grid-header">
                    <div className="cc-grid-header__cell">Proveedor</div>
                    <div className="cc-grid-header__cell">Estado</div>
                    <div className="cc-grid-header__cell">Acciones</div>
                  </div>
                </div>

                <div className="cc-cliente-table__body">
                  {loading ? (
                    <div className="cc-loading-state">
                      <FontAwesomeIcon icon={faArrowRotateRight} spin />
                      <span>Cargando proveedores...</span>
                    </div>
                  ) : proveedoresOrdenados.length === 0 ? (
                    <div className="cc-empty-state">
                      <FontAwesomeIcon icon={faTruckField} />
                      <span>
                        {pestana === "activos"
                          ? "No hay proveedores activos."
                          : "No hay proveedores inactivos."}
                      </span>
                    </div>
                  ) : (
                    <div className="cc-grid-rows">
                      {proveedoresOrdenados.map((row) => {
                        const activo = Number(row?.activo ?? 1) === 1;
                        const bloqueado =
                          accionandoId === getProveedorId(row) ||
                          saving ||
                          modalAccion.loading;

                        return (
                          <div key={getProveedorId(row)} className="cc-grid-row">
                            <div className="cc-grid-cell">
                              <span
                                className="cc-ellipsis-text"
                                title={row?.nombre || "—"}
                              >
                                {row?.nombre || "—"}
                              </span>
                            </div>

                            <div className="cc-grid-cell">
                              <span
                                className={`cc-status-badge ${
                                  activo
                                    ? "cc-status-badge--active"
                                    : "cc-status-badge--inactive"
                                }`}
                              >
                                {activo ? "Activo" : "Inactivo"}
                              </span>
                            </div>

                            <div className="cc-grid-cell">
                              <div className="cc-actions-group">
                                {activo ? (
                                  <>
                                    <button
                                      type="button"
                                      className="cc-action-btn"
                                      onClick={() => iniciarEdicion(row)}
                                      disabled={bloqueado}
                                      title="Editar"
                                    >
                                      <FontAwesomeIcon icon={faPenToSquare} />
                                    </button>

                                    <button
                                      type="button"
                                      className="cc-action-btn"
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
                                    className="cc-action-btn"
                                    onClick={() => abrirModalAccion("alta", row)}
                                    disabled={bloqueado}
                                    title="Dar de alta"
                                  >
                                    <FontAwesomeIcon icon={faUserCheck} />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  className="cc-action-btn cc-action-btn--danger"
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
                      })}
                    </div>
                  )}
                </div>

                <div className="cc-cliente-table__footWrap">
                  <span style={{ fontSize: 12, color: "var(--nv-muted)" }}>
                    Administrá el padrón de <b>proveedores</b>.
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="mit-actions">
          <span className="mit-help">
            Gestión de proveedores con activos, inactivos, alta, baja y eliminación.
          </span>
          <button
            type="button"
            className="mit-btn mit-btn--ghost"
            onClick={() => onClose?.()}
            disabled={isBusy}
          >
            Cerrar
          </button>
        </div>
      </div>

      <ModalEliminar
        open={modalAccion.open}
        row={
          modalAccion.row
            ? {
                id: getProveedorId(modalAccion.row),
                nombre: modalAccion.row?.nombre || "—",
                estado:
                  Number(modalAccion.row?.activo ?? 1) === 1 ? "Activo" : "Inactivo",
              }
            : null
        }
        loading={modalAccion.loading}
        onClose={cerrarModalAccion}
        onConfirm={ejecutarAccionModal}
        onToast={onToast}
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
    </div>,
    document.body
  );
}

function EmptyState({ icon, text, spin = false }) {
  return (
    <div className="mi-empty-state">
      <div className="mi-empty-state__iconWrap">
        <FontAwesomeIcon icon={icon} spin={spin} />
      </div>
      <span className="mi-empty-state__text">{text}</span>
    </div>
  );
}