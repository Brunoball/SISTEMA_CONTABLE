import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../config/config";
import "../Stock.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faArrowRotateRight,
  faLayerGroup,
  faTag,
  faAlignLeft,
  faCircleCheck,
  faCircleXmark,
  faBoxesStacked,
} from "@fortawesome/free-solid-svg-icons";

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

export default function ModalCategoriasStock({
  open,
  onClose,
  onActualizado,
  onToast,
}) {
  const closeBtnRef = useRef(null);

  const [dark, setDark] = useState(isTemaOscuro);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [modo, setModo] = useState("crear");
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nombre: "", descripcion: "" });

  const isBusy = loading || saving;

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
    setForm({ nombre: "", descripcion: "" });
  }, []);

  const cargarCategorias = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "stock_categorias_listar" });
      const data = await apiGet(`${API_URL}?${params.toString()}`);
      setCategorias(Array.isArray(data?.categorias) ? data.categorias : []);
    } catch (err) {
      onToast?.("error", err?.message || "No se pudieron cargar las categorías.");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (!open) return;
    cargarCategorias();
    resetForm();
  }, [open, cargarCategorias, resetForm]);

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) =>
      String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
        sensitivity: "base",
      })
    );
  }, [categorias]);

  const iniciarEdicion = (cat) => {
    setModo("editar");
    setEditandoId(Number(cat?.id_stock_categoria || 0));
    setForm({
      nombre: toUpperValue(cat?.nombre),
      descripcion: toUpperValue(cat?.descripcion),
    });
  };

  const cancelarEdicion = () => {
    resetForm();
  };

  const handleGuardar = async () => {
    const nombre = toUpperValue(form.nombre).trim();
    const descripcion = toUpperValue(form.descripcion).trim();

    if (!nombre) {
      onToast?.("error", "El nombre de la categoría es obligatorio.");
      return;
    }

    setSaving(true);

    try {
      if (modo === "crear") {
        const data = await apiPost("stock_categoria_crear", {
          nombre,
          descripcion,
          activo: 1,
        });
        onToast?.("exito", data?.mensaje || "Categoría creada correctamente.");
      } else {
        const data = await apiPost("stock_categoria_actualizar", {
          id_stock_categoria: editandoId,
          nombre,
          descripcion,
          activo: 1,
        });
        onToast?.(
          "exito",
          data?.mensaje || "Categoría actualizada correctamente."
        );
      }

      await cargarCategorias();
      await onActualizado?.();
      resetForm();
    } catch (err) {
      onToast?.("error", err?.message || "No se pudo guardar la categoría.");
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (cat) => {
    const nombre = String(cat?.nombre || "esta categoría");
    if (!window.confirm(`¿Querés eliminar la categoría "${nombre}"?`)) return;

    setSaving(true);

    try {
      const data = await apiPost("stock_categoria_eliminar", {
        id_stock_categoria: Number(cat?.id_stock_categoria || 0),
      });

      onToast?.(
        "exito",
        data?.mensaje || "Categoría eliminada correctamente."
      );

      await cargarCategorias();
      await onActualizado?.();

      if (Number(cat?.id_stock_categoria || 0) === Number(editandoId || 0)) {
        resetForm();
      }
    } catch (err) {
      onToast?.("error", err?.message || "No se pudo eliminar la categoría.");
    } finally {
      setSaving(false);
    }
  };

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
            <FontAwesomeIcon icon={faLayerGroup} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Categorías de stock</h2>
            <p className="mi-modal__subtitle">
              Agregá, editá o eliminá categorías para tus productos.
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
            {/* PANEL IZQUIERDO */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">
                  <FontAwesomeIcon
                    icon={modo === "crear" ? faPlus : faPenToSquare}
                    style={{ marginRight: 8, opacity: 0.75, fontSize: 13 }}
                  />
                  {modo === "crear" ? "Nueva categoría" : "Editar categoría"}
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
                    <FontAwesomeIcon icon={faTag} style={{ marginRight: 5 }} />
                    Nombre *
                  </label>
                </div>

                <div className="fl-field">
                  <textarea
                    className="fl-input fl-input--textarea"
                    placeholder=" "
                    value={form.descripcion}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        descripcion: toUpperValue(e.target.value),
                      }))
                    }
                    disabled={saving}
                    rows={4}
                  />
                  <label className="fl-label">
                    <FontAwesomeIcon icon={faAlignLeft} style={{ marginRight: 5 }} />
                    Descripción
                  </label>
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
                    <FontAwesomeIcon
                      icon={faFloppyDisk}
                      style={{ marginRight: 8 }}
                    />
                    {saving
                      ? "Guardando..."
                      : modo === "crear"
                      ? "Crear categoría"
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
                  Las categorías <b>en uso</b> se desactivan al eliminarse.
                </div>
              </div>
            </aside>

            {/* TABLA DERECHA */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__foot mi-cr-table__foot--top">
                <div className="mi-cr-table__summary">

                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--nv-text)",
                      }}
                    >
                      Listado de categorías
                    </div>
                    <div style={{ fontSize: 12, color: "var(--nv-muted)" }}>
                      Total: <b>{categoriasOrdenadas.length}</b>
                    </div>
                  </div>
                </div>

              </div>

              {!loading && categoriasOrdenadas.length > 0 && (
                <div className="mi-cr-table__head mi-cr-grid-categorias">
                  <div
                    className="mi-cr-table__head-cell"
                    style={{ paddingLeft: 10 }}
                  >
                    Nombre
                  </div>
                  <div className="mi-cr-table__head-cell">Descripción</div>
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
                    Productos
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
                    text="Cargando categorías..."
                  />
                ) : categoriasOrdenadas.length === 0 ? (
                  <EmptyState
                    icon={faLayerGroup}
                    text="No hay categorías cargadas."
                  />
                ) : (
                  categoriasOrdenadas.map((cat) => {
                    const activo = Number(cat?.activo || 0) === 1;
                    const isEditing =
                      Number(cat?.id_stock_categoria) === editandoId &&
                      modo === "editar";

                    return (
                      <div
                        key={cat.id_stock_categoria}
                        className={[
                          "mi-cr-row",
                          "mi-cr-grid-categorias",
                          isEditing ? "mi-cr-row--editing" : "",
                        ].join(" ").trim()}
                      >
                        {/* Nombre */}
                        <div
                          className="mi-cr-cell mi-cr-cell--ellipsis"
                          style={{ paddingLeft: 10, minWidth: 0 }}
                        >
                          <span
                            className="mi-cr-cell__ellipsis"
                            title={cat.nombre || "—"}
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
                            {cat.nombre || "—"}
                          </span>
                        </div>

                        {/* Descripción */}
                        <div
                          className="mi-cr-cell mi-cr-cell--ellipsis"
                          style={{ minWidth: 0 }}
                        >
                          <span
                            className="mi-cr-cell__ellipsis"
                            title={cat.descripcion?.trim() || "Sin descripción"}
                            style={{
                              display: "block",
                              width: "100%",
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontSize: 12,
                              color: cat.descripcion?.trim()
                                ? "var(--nv-muted)"
                                : "var(--nv-placeholder)",
                              fontStyle: cat.descripcion?.trim()
                                ? "normal"
                                : "italic",
                            }}
                          >
                            {cat.descripcion?.trim() || "Sin descripción"}
                          </span>
                        </div>

                        {/* Estado */}
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

                            {activo ? "Activa" : "Inactiva"}
                          </span>
                        </div>

                        {/* Productos */}
                        <div className="mi-cr-cell mi-cr-cell--center mi-cr-cell--mono">
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 13,
                              color: "var(--nv-text)",
                            }}
                          >
                            <FontAwesomeIcon
                              icon={faBoxesStacked}
                              style={{ fontSize: 11, color: "var(--nv-muted)" }}
                            />
                            {Number(cat?.total_productos || 0)}
                          </span>
                        </div>

                        {/* Acciones */}
                        <div className="mi-cr-cell mi-cr-cell--center">
                          <div style={{ display: "flex", gap: 6 , padding: 5}}>
                            <button
                              type="button"
                              className="nv-foot-btn nv-foot-btn--sm"
                              onClick={() => iniciarEdicion(cat)}
                              disabled={saving}
                              title="Editar"
                            >
                              <FontAwesomeIcon icon={faPenToSquare} />
                            </button>

                            <button
                              type="button"
                              className="nv-foot-btn nv-foot-btn--sm nv-foot-btn--danger"
                              onClick={() => handleEliminar(cat)}
                              disabled={saving}
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
                  Las categorías <b>en uso</b> se desactivan al eliminarse.
                </span>
              </div>
            </section>
          </div>
        </div>

        <div className="mit-actions">
          <span className="mit-help">
            Las categorías en uso se desactivan al eliminarse.
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