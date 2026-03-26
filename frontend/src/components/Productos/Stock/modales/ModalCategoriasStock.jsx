import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
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
  return {
    ...buildHeadersGET(),
    "Content-Type": "application/json",
  };
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
    if (e instanceof Error && e.message && !e.message.startsWith("Unexpected token")) {
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

  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
  });

  const isBusy = loading || saving;

  const resetForm = useCallback(() => {
    setModo("crear");
    setEditandoId(null);
    setForm({
      nombre: "",
      descripcion: "",
    });
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
    cargarCategorias();
    resetForm();
  }, [open, cargarCategorias, resetForm]);

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
    const confirmar = window.confirm(
      `¿Querés eliminar la categoría "${nombre}"?`
    );

    if (!confirmar) return;

    setSaving(true);
    setError("");

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
      setError(err?.message || "No se pudo eliminar la categoría.");
      onToast?.("error", err?.message || "No se pudo eliminar la categoría.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: dark ? "rgba(2,6,23,.72)" : "rgba(15,23,42,.42)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(1120px, 96vw)",
          maxHeight: "92vh",
          overflow: "hidden",
          borderRadius: 20,
          background: "var(--nv-bg, #ffffff)",
          color: "var(--nv-text, #0f172a)",
          boxShadow: "0 25px 70px rgba(0,0,0,.22)",
          border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 20px",
            borderBottom: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
            background: "var(--nv-card-bg, rgba(255,255,255,.7))",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "rgba(59,130,246,.12)",
              color: "var(--nv-action, #2563eb)",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <FontAwesomeIcon icon={faLayerGroup} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: "1.08rem",
                fontWeight: 800,
              }}
            >
              Categorías de stock
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: ".9rem",
                color: "var(--nv-muted, #64748b)",
              }}
            >
              Agregá, editá o eliminá categorías para tus productos.
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            disabled={isBusy}
            onClick={() => onClose?.()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
              background: "transparent",
              cursor: isBusy ? "not-allowed" : "pointer",
              color: "inherit",
            }}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            gap: 18,
            padding: 20,
            overflow: "auto",
          }}
        >
          <div
            style={{
              border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
              borderRadius: 18,
              padding: 16,
              background: "var(--nv-card-bg, rgba(255,255,255,.65))",
              height: "fit-content",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: ".96rem",
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <FontAwesomeIcon icon={modo === "crear" ? faPlus : faPenToSquare} />
              {modo === "crear" ? "Nueva categoría" : "Editar categoría"}
            </div>

            {error && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(239,68,68,.10)",
                  color: "#b91c1c",
                  fontSize: ".86rem",
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  style={{ marginTop: 2 }}
                />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".8rem",
                    fontWeight: 700,
                    marginBottom: 6,
                    color: "var(--nv-muted, #64748b)",
                  }}
                >
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nombre: toUpperValue(e.target.value),
                    }))
                  }
                  placeholder="Ej: ACCESORIOS"
                  disabled={saving}
                  style={{
                    width: "100%",
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
                    background: "var(--nv-bg, #fff)",
                    color: "inherit",
                    padding: "0 12px",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: ".8rem",
                    fontWeight: 700,
                    marginBottom: 6,
                    color: "var(--nv-muted, #64748b)",
                  }}
                >
                  Descripción
                </label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      descripcion: toUpperValue(e.target.value),
                    }))
                  }
                  placeholder="DESCRIPCIÓN OPCIONAL"
                  disabled={saving}
                  rows={4}
                  style={{
                    width: "100%",
                    minHeight: 110,
                    borderRadius: 12,
                    border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
                    background: "var(--nv-bg, #fff)",
                    color: "inherit",
                    padding: "10px 12px",
                    outline: "none",
                    resize: "vertical",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 6,
                }}
              >
                <button
                  type="button"
                  onClick={handleGuardar}
                  disabled={saving}
                  style={{
                    height: 42,
                    padding: "0 14px",
                    border: "none",
                    borderRadius: 12,
                    background: "var(--nv-action, #2563eb)",
                    color: "#fff",
                    cursor: saving ? "not-allowed" : "pointer",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                  {saving
                    ? "Guardando..."
                    : modo === "crear"
                    ? "Crear categoría"
                    : "Guardar cambios"}
                </button>

                {modo === "editar" && (
                  <button
                    type="button"
                    onClick={cancelarEdicion}
                    disabled={saving}
                    style={{
                      height: 42,
                      padding: "0 14px",
                      borderRadius: 12,
                      border:
                        "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
                      background: "transparent",
                      color: "inherit",
                      cursor: saving ? "not-allowed" : "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
              borderRadius: 18,
              overflow: "hidden",
              background: "var(--nv-card-bg, rgba(255,255,255,.65))",
              minWidth: 0,
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom:
                  "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: ".96rem" }}>
                  Listado de categorías
                </div>
                <div
                  style={{
                    fontSize: ".84rem",
                    color: "var(--nv-muted, #64748b)",
                    marginTop: 2,
                  }}
                >
                  Total: <b>{categoriasOrdenadas.length}</b>
                </div>
              </div>

              <button
                type="button"
                onClick={cargarCategorias}
                disabled={loading}
                style={{
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 10,
                  border:
                    "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
                  background: "transparent",
                  color: "inherit",
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontWeight: 700,
                }}
              >
                <FontAwesomeIcon icon={faArrowRotateRight} />
                {loading ? "Cargando..." : "Recargar"}
              </button>
            </div>

            <div style={{ overflow: "auto", maxHeight: "58vh" }}>
              {loading ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--nv-muted, #64748b)",
                  }}
                >
                  Cargando categorías...
                </div>
              ) : categoriasOrdenadas.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--nv-muted, #64748b)",
                  }}
                >
                  No hay categorías cargadas.
                </div>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 680,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "rgba(148,163,184,.08)",
                      }}
                    >
                      <th style={thStyle}>Nombre</th>
                      <th style={thStyle}>Descripción</th>
                      <th style={thStyleCenter}>Estado</th>
                      <th style={thStyleCenter}>Productos</th>
                      <th style={thStyleCenter}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoriasOrdenadas.map((cat) => {
                      const activo = Number(cat?.activo || 0) === 1;

                      return (
                        <tr
                          key={cat.id_stock_categoria}
                          style={{
                            borderTop:
                              "1px solid var(--nv-border-md, rgba(148,163,184,.14))",
                          }}
                        >
                          <td style={tdStyleStrong}>{cat.nombre || "—"}</td>
                          <td style={tdStyle}>
                            {cat.descripcion?.trim()
                              ? cat.descripcion
                              : "Sin descripción"}
                          </td>
                          <td style={tdStyleCenter}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 84,
                                height: 28,
                                padding: "0 10px",
                                borderRadius: 999,
                                fontSize: ".78rem",
                                fontWeight: 800,
                                background: activo
                                  ? "rgba(34,197,94,.14)"
                                  : "rgba(239,68,68,.12)",
                                color: activo ? "#15803d" : "#b91c1c",
                              }}
                            >
                              {activo ? "Activa" : "Inactiva"}
                            </span>
                          </td>
                          <td style={tdStyleCenter}>
                            {Number(cat?.total_productos || 0)}
                          </td>
                          <td style={tdStyleCenter}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(cat)}
                                disabled={saving}
                                title="Editar"
                                style={iconBtnStyle}
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleEliminar(cat)}
                                disabled={saving}
                                title="Eliminar"
                                style={{
                                  ...iconBtnStyle,
                                  color: "#dc2626",
                                }}
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: ".84rem",
              color: "var(--nv-muted, #64748b)",
            }}
          >
            Las categorías en uso se desactivan al eliminarse.
          </div>

          <button
            type="button"
            onClick={() => onClose?.()}
            disabled={isBusy}
            style={{
              height: 42,
              padding: "0 14px",
              borderRadius: 12,
              border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
              background: "transparent",
              color: "inherit",
              cursor: isBusy ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const thStyle = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: ".78rem",
  letterSpacing: ".03em",
  fontWeight: 800,
  color: "var(--nv-muted, #64748b)",
  whiteSpace: "nowrap",
};

const thStyleCenter = {
  ...thStyle,
  textAlign: "center",
};

const tdStyle = {
  padding: "12px 14px",
  fontSize: ".9rem",
  verticalAlign: "middle",
};

const tdStyleStrong = {
  ...tdStyle,
  fontWeight: 700,
};

const tdStyleCenter = {
  ...tdStyle,
  textAlign: "center",
};

const iconBtnStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid var(--nv-border-md, rgba(148,163,184,.22))",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};