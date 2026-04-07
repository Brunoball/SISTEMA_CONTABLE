import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
import "../../../Stock/Stock.css";
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
import ModalAccionEntidadStock from "../../../Stock/modales/ModalAccionEntidadStock";

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
      } else {
        const data = await apiPost("cc_proveedor_actualizar", {
          id_proveedor: editandoId,
          id_stock_proveedor: editandoId,
          ...payload,
        });
        onToast?.("exito", data?.mensaje || "Proveedor actualizado correctamente.");
      }

      const nuevaPestana = payload.activo === 1 ? "activos" : "inactivos";
      setPestana(nuevaPestana);

      await cargarProveedores(nuevaPestana);
      await onActualizado?.();

      setModo("crear");
      setEditandoId(null);
      setForm({
        nombre: "",
        activo: payload.activo,
      });
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
    setModalAccion({
      open: false,
      type: null,
      row: null,
      loading: false,
    });
  }, []);

  const ejecutarAccionModal = useCallback(async () => {
    const { row, type } = modalAccion;
    const id = getProveedorId(row);

    if (!id || !type) return;

    setModalAccion((prev) => ({ ...prev, loading: true }));
    setAccionandoId(id);

    try {
      let action = "";
      let successFallback = "";
      let recargarTab = pestana;

      if (type === "baja") {
        action = "cc_proveedor_dar_baja";
        successFallback = "Proveedor dado de baja correctamente.";
        recargarTab = "activos";
      } else if (type === "alta") {
        action = "cc_proveedor_dar_alta";
        successFallback = "Proveedor dado de alta correctamente.";
        recargarTab = "inactivos";
      } else if (type === "eliminar") {
        action = "cc_proveedor_eliminar";
        successFallback = "Proveedor eliminado correctamente.";
        recargarTab = pestana;
      }

      const data = await apiPost(action, {
        id_proveedor: id,
        id_stock_proveedor: id,
      });

      onToast?.("exito", data?.mensaje || successFallback);

      if ((type === "baja" || type === "eliminar") && id === Number(editandoId || 0)) {
        resetForm();
      }

      await cargarProveedores(recargarTab);
      await onActualizado?.();
      cerrarModalAccion();
    } catch (err) {
      setModalAccion((prev) => ({ ...prev, loading: false }));
      onToast?.("error", err?.message || "No se pudo completar la acción.");
    } finally {
      setAccionandoId(null);
    }
  }, [
    modalAccion,
    pestana,
    cargarProveedores,
    onActualizado,
    onToast,
    editandoId,
    resetForm,
    cerrarModalAccion,
  ]);

  const modalConfig = useMemo(() => {
    const row = modalAccion.row;
    const nombre = String(row?.nombre || "—");

    if (modalAccion.type === "baja") {
      return {
        title: "Dar de baja proveedor",
        message: "¿Seguro que querés dar de baja este proveedor?",
        warning: "El proveedor dejará de aparecer en la pestaña de activos y pasará a inactivos.",
        confirmLabel: "Dar de baja",
        cancelLabel: "Cancelar",
        variant: "danger",
        details: [
          { label: "Proveedor", value: nombre },
          { label: "Acción", value: "Dar de baja" },
        ],
      };
    }

    if (modalAccion.type === "alta") {
      return {
        title: "Dar de alta proveedor",
        message: "¿Seguro que querés dar de alta este proveedor?",
        warning: "El proveedor volverá a aparecer en la pestaña de activos.",
        confirmLabel: "Dar de alta",
        cancelLabel: "Cancelar",
        variant: "success",
        details: [
          { label: "Proveedor", value: nombre },
          { label: "Acción", value: "Dar de alta" },
        ],
      };
    }

    return {
      title: "Eliminar proveedor",
      message: "¿Seguro que querés eliminar este proveedor definitivamente?",
      warning: "Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
      details: [
        { label: "Proveedor", value: nombre },
        {
          label: "Estado",
          value: Number(row?.activo ?? 1) === 1 ? "Activo" : "Inactivo",
        },
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
            <h2 className="mi-modal__title">Proveedores de cuentas corrientes</h2>
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

                <div
                  style={{
                    fontSize: 12,
                    color: "var(--nv-muted)",
                    marginTop: 4,
                  }}
                >
                  Gestioná tus <b>proveedores</b> desde cuentas corrientes.
                </div>
              </div>
            </aside>

            <section className="mi-cr-table">
              <div
                className="mi-cr-table__foot mi-cr-table__foot--top"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div className="mi-cr-table__summary">
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--nv-text)",
                      }}
                    >
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
                    disabled={loading || saving}
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
                    disabled={loading || saving}
                  >
                    Inactivos
                  </button>
                </div>
              </div>

              {!loading && proveedoresOrdenados.length > 0 && (
                <div className="mi-cr-table__head mi-cr-grid-clientes-stock">
                  <div className="mi-cr-table__head-cell" style={{ paddingLeft: 10 }}>
                    Nombre
                  </div>
                  <div
                    className="mi-cr-table__head-cell"
                    style={{ textAlign: "center" }}
                  >
                    Estado
                  </div>
                  <div
                    className="mi-cr-table__head-cell"
                    style={{ textAlign: "center" }}
                  >
                    Acciones
                  </div>
                </div>
              )}

              <div className="mi-cr-table__rows mi-cr-table__rows--mcs">
                {loading ? (
                  <EmptyState
                    icon={faArrowRotateRight}
                    spin
                    text="Cargando proveedores..."
                  />
                ) : proveedoresOrdenados.length === 0 ? (
                  <EmptyState
                    icon={faTruckField}
                    text={
                      pestana === "activos"
                        ? "No hay proveedores activos."
                        : "No hay proveedores inactivos."
                    }
                  />
                ) : (
                  proveedoresOrdenados.map((row) => {
                    const activo = Number(row?.activo ?? 1) === 1;
                    const isEditing =
                      getProveedorId(row) === Number(editandoId || 0) &&
                      modo === "editar";
                    const bloqueado = accionandoId === getProveedorId(row) || saving;

                    return (
                      <div
                        key={getProveedorId(row)}
                        className={[
                          "mi-cr-row",
                          "mi-cr-grid-clientes-stock",
                          isEditing ? "mi-cr-row--editing" : "",
                        ].join(" ").trim()}
                      >
                        <div
                          className="mi-cr-cell mi-cr-cell--ellipsis"
                          style={{ paddingLeft: 10, minWidth: 0 }}
                        >
                          <span
                            className="mi-cr-cell__ellipsis"
                            title={row?.nombre || "—"}
                            style={{
                              display: "block",
                              width: "100%",
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontWeight: 600,
                              fontSize: 13,
                              color: "var(--nv-text)",
                            }}
                          >
                            {row?.nombre || "—"}
                          </span>
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "3px 10px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background: activo
                                ? "rgba(16,185,129,.12)"
                                : "rgba(148,163,184,.12)",
                              color: activo ? "#057A55" : "#64748b",
                              border: `1px solid ${
                                activo
                                  ? "rgba(16,185,129,.30)"
                                  : "rgba(148,163,184,.30)"
                              }`,
                            }}
                          >
                            {activo ? "Activo" : "Inactivo"}
                          </span>
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <div
                            style={{
                              display: "flex",
                              gap: 6,
                              padding: 5,
                              flexWrap: "wrap",
                              justifyContent: "center",
                            }}
                          >
                            {activo ? (
                              <>
                                <button
                                  type="button"
                                  className="nv-foot-btn nv-foot-btn--sm"
                                  onClick={() => iniciarEdicion(row)}
                                  disabled={bloqueado}
                                  title="Editar"
                                >
                                  <FontAwesomeIcon icon={faPenToSquare} />
                                </button>

                                <button
                                  type="button"
                                  className="nv-foot-btn nv-foot-btn--sm"
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
                                className="nv-foot-btn nv-foot-btn--sm"
                                onClick={() => abrirModalAccion("alta", row)}
                                disabled={bloqueado}
                                title="Dar de alta"
                              >
                                <FontAwesomeIcon icon={faUserCheck} />
                              </button>
                            )}

                            <button
                              type="button"
                              className="nv-foot-btn nv-foot-btn--sm nv-foot-btn--danger"
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

              <div className="mi-cr-table__foot">
                <span style={{ fontSize: 12, color: "var(--nv-muted)" }}>
                  Administrá el padrón de <b>proveedores</b>.
                </span>
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