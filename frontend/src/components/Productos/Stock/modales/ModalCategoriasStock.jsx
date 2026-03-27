import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
import "../Stock.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faPlus,
  faPenToSquare,
  faTrashCan,
  faFloppyDisk,
  faArrowRotateRight,
  faTriangleExclamation,
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
  const [error, setError] = useState("");
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
    setError("");

    try {
      const params = new URLSearchParams({
        action: "stock_categorias_listar",
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);
      setCategorias(Array.isArray(data?.categorias) ? data.categorias : []);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar las categorías.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    setError("");
  };

  const cancelarEdicion = () => {
    resetForm();
    setError("");
  };

  const handleGuardar = async () => {
    const nombre = toUpperValue(form.nombre).trim();
    const descripcion = toUpperValue(form.descripcion).trim();

    if (!nombre) {
      setError("El nombre de la categoría es obligatorio.");
      return;
    }

    setSaving(true);
    setError("");

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
      setError(err?.message || "No se pudo guardar la categoría.");
      onToast?.("error", err?.message || "No se pudo guardar la categoría.");
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async (cat) => {
    const nombre = String(cat?.nombre || "esta categoría");
    if (!window.confirm(`¿Querés eliminar la categoría "${nombre}"?`)) return;

    setSaving(true);
    setError("");

    try {
      const data = await apiPost("stock_categoria_eliminar", {
        id_stock_categoria: Number(cat?.id_stock_categoria || 0),
      });

      onToast?.("exito", data?.mensaje || "Categoría eliminada correctamente.");
      await cargarCategorias();
      await onActualizado?.();

      if (
        Number(cat?.id_stock_categoria || 0) === Number(editandoId || 0)
      ) {
        resetForm();
      }
    } catch (err) {
      setError(err?.message || "No se pudo eliminar la categoría.");
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
      ]
        .join(" ")
        .trim()}
    >
      <div
        className={[
          "mi-modal__container",
          "mi-modal-categorias",
          dark ? "mi-modal--dark" : "",
        ]
          .join(" ")
          .trim()}
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

        <div className="mi-modal__content mi-modal-categorias__content">
          <div className="mi-modal-categorias__grid">
            <aside className="mi-cr-filters mi-cr-filters--categorias">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title mi-cr-filters__title--icon">
                  <FontAwesomeIcon
                    icon={modo === "crear" ? faPlus : faPenToSquare}
                    className="mi-cr-filters__title-icon"
                  />
                  <span>
                    {modo === "crear" ? "Nueva categoría" : "Editar categoría"}
                  </span>
                </div>
              </div>

              <div className="mi-cr-filters__body mi-cr-filters__body--categorias">
                {error && (
                  <div className="mov-mi-error mov-mi-error--categorias">
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      className="mov-mi-error__icon"
                    />
                    <span className="mov-mi-error__text">{error}</span>
                  </div>
                )}

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
                    <FontAwesomeIcon icon={faTag} className="fl-label__icon" />
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
                    <FontAwesomeIcon
                      icon={faAlignLeft}
                      className="fl-label__icon"
                    />
                    Descripción
                  </label>
                </div>

                <div className="mi-cr-filters__actions mi-cr-filters__actions--stack">
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mit-btn--block"
                    onClick={handleGuardar}
                    disabled={saving}
                  >
                    <FontAwesomeIcon
                      icon={faFloppyDisk}
                      className="mit-btn__icon"
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
                      className="mit-btn mit-btn--ghost mit-btn--block mi-cr-cancel-btn"
                      onClick={cancelarEdicion}
                      disabled={saving}
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>

                <div className="mi-card__hint mi-card__hint--categorias">
                  Las categorías <b>en uso</b> se desactivan al eliminarse.
                </div>
              </div>
            </aside>

            <section className="mi-cr-table mi-cr-table--categorias">
              <div className="mi-cr-table__foot mi-cr-table__foot--top">
                <div className="mi-cr-table__summary">
                  <FontAwesomeIcon
                    icon={faBoxesStacked}
                    className="mi-cr-table__summary-icon"
                  />

                  <div>
                    <div className="mi-cr-table__summary-title">
                      Listado de categorías
                    </div>
                    <div className="mi-cr-table__summary-subtitle">
                      Total: <b>{categoriasOrdenadas.length}</b>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="nv-foot-btn"
                  onClick={cargarCategorias}
                  disabled={loading}
                >
                  <FontAwesomeIcon icon={faArrowRotateRight} />
                  {loading ? "Cargando..." : "Recargar"}
                </button>
              </div>

              <div className="mi-cr-table__rows mi-cr-table__rows--categorias">
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
                  <>
                    <div className="mi-cr-table__head mi-cr-grid-categorias">
                      <div className="mi-cr-table__head-cell mi-cr-table__head-cell--pl">
                        Nombre
                      </div>
                      <div className="mi-cr-table__head-cell">Descripción</div>
                      <div className="mi-cr-table__head-cell mi-cr-table__head-cell--center">
                        Estado
                      </div>
                      <div className="mi-cr-table__head-cell mi-cr-table__head-cell--center">
                        Productos
                      </div>
                      <div className="mi-cr-table__head-cell mi-cr-table__head-cell--center">
                        Acciones
                      </div>
                    </div>

                    {categoriasOrdenadas.map((cat) => {
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
                          ]
                            .join(" ")
                            .trim()}
                        >
                          <div className="mi-cr-cell mi-cr-cell--pl">
                            <span className="mi-cr-cell__nombre">
                              {cat.nombre || "—"}
                            </span>
                          </div>

                          <div className="mi-cr-cell">
                            <span
                              className={[
                                "mi-cr-cell__descripcion",
                                cat.descripcion?.trim()
                                  ? ""
                                  : "mi-cr-cell__descripcion--empty",
                              ]
                                .join(" ")
                                .trim()}
                            >
                              {cat.descripcion?.trim() || "Sin descripción"}
                            </span>
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center">
                            <span
                              className={[
                                "mi-cr-status",
                                activo
                                  ? "mi-cr-status--activo"
                                  : "mi-cr-status--inactivo",
                              ]
                                .join(" ")
                                .trim()}
                            >
                              <FontAwesomeIcon

                                className="mi-cr-status__icon"
                              />
                              {activo ? "Activa" : "Inactiva"}
                            </span>
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center mi-cr-cell--mono">
                            <span className="mi-cr-productos">
                              <FontAwesomeIcon
                                icon={faBoxesStacked}
                                className="mi-cr-productos__icon"
                              />
                              {Number(cat?.total_productos || 0)}
                            </span>
                          </div>

                          <div className="mi-cr-cell mi-cr-cell--center mi-cr-cell--actions">
                            <button
                              type="button"
                              className="nv-foot-btn nv-foot-btn--sm"
                              onClick={() => iniciarEdicion(cat)}
                              disabled={saving}
                              title="Editar"
                            >
                              <FontAwesomeIcon
                                icon={faPenToSquare}
                                className="nv-foot-btn__icon"
                              />
                              
                            </button>

                            <button
                              type="button"
                              className="nv-foot-btn nv-foot-btn--sm nv-foot-btn--danger"
                              onClick={() => handleEliminar(cat)}
                              disabled={saving}
                              title="Eliminar"
                            >
                              <FontAwesomeIcon
                                icon={faTrashCan}
                                className="nv-foot-btn__icon"
                              />
                              
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
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