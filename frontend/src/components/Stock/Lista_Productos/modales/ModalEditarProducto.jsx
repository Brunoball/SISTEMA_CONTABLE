import React, { useEffect, useState, useRef, useMemo } from "react";
import BASE_URL from "../../../../config/config";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

/* =========================
   Helpers de autenticación
========================= */
function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function buildHeadersJSON() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = { "Content-Type": "application/json" };
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function buildHeadersMultipart() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error("Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 400 ? text.slice(0, 400) + "..." : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }
}

const normalizarProducto = (data) => {
  const p = data?.producto || data?.data || data || {};
  return {
    id: p.id ?? "",
    nombre: p.nombre ?? "",
    sku: p.sku ?? "",
    precio:
      p.precio !== null && p.precio !== undefined && p.precio !== ""
        ? String(p.precio)
        : "",
    precio_promo:
      p.precio_promo !== null &&
      p.precio_promo !== undefined &&
      p.precio_promo !== ""
        ? String(p.precio_promo)
        : "",
    stock:
      p.stock !== null && p.stock !== undefined && p.stock !== ""
        ? String(p.stock)
        : "",
    descripcion: p.descripcion ?? "",
    imagen_url: p.imagen_url ?? p.imagen ?? "",
    imagen_archivo_id: p.imagen_archivo_id ? Number(p.imagen_archivo_id) : null,
  };
};

/* =========================
   Componente modal editar
========================= */
const ModalEditarProducto = ({ productoId, onClose, onGuardado }) => {
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState({});
  const [form, setForm] = useState({
    id: "",
    nombre: "",
    sku: "",
    precio: "",
    precio_promo: "",
    stock: "",
    descripcion: "",
    imagen_url: "",
    imagen_archivo_id: null,
  });

  // Estado de imagen actual (blob cargado desde la API protegida)
  const [imagenActualBlob, setImagenActualBlob] = useState(null);
  const [imagenActualCargando, setImagenActualCargando] = useState(false);

  // Estado de nueva imagen a subir
  const [nuevaImagenFile, setNuevaImagenFile] = useState(null);
  const [nuevaImagenPreview, setNuevaImagenPreview] = useState("");

  // Indica si el usuario quiere eliminar la imagen actual (sin reemplazarla)
  const [eliminarImagenActual, setEliminarImagenActual] = useState(false);

  const inputImagenRef = useRef();
  const nuevaImagenNombre = useMemo(() => nuevaImagenFile?.name || "", [nuevaImagenFile]);

  /* ── Cargar producto ─────────────────────────────────── */
  useEffect(() => {
    let mounted = true;

    const cargarProducto = async () => {
      if (!productoId) {
        setErrores({ global: "ID de producto inválido." });
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrores({});

      try {
        const url = `${API_URL}?action=stock_producto_obtener&id=${encodeURIComponent(productoId)}`;
        const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
        const data = await parseJsonOrThrow(res);

        if (data.exito === false) {
          throw new Error(data.mensaje || "No se pudo cargar el producto");
        }

        if (mounted) {
          setForm(normalizarProducto(data));
        }
      } catch (err) {
        if (mounted) {
          setErrores({ global: err.message || "Error al cargar el producto" });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargarProducto();
    return () => { mounted = false; };
  }, [productoId]);

  /* ── Cargar blob de imagen actual (protegida) ────────── */
  useEffect(() => {
    let cancelado = false;
    let objectUrl = null;

    const cargarImagen = async () => {
      const archivoId = form.imagen_archivo_id;
      if (!archivoId || archivoId <= 0) {
        setImagenActualBlob(null);
        return;
      }

      setImagenActualCargando(true);

      try {
        const params = new URLSearchParams({
          action: "stock_producto_imagen_ver",
          id_archivo: String(archivoId),
        });
        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: buildHeadersGET(),
        });

        if (!res.ok) {
          if (!cancelado) setImagenActualBlob(null);
          return;
        }

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!cancelado) setImagenActualBlob(objectUrl);
      } catch {
        if (!cancelado) setImagenActualBlob(null);
      } finally {
        if (!cancelado) setImagenActualCargando(false);
      }
    };

    cargarImagen();

    return () => {
      cancelado = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [form.imagen_archivo_id]);

  /* ── Cleanup blob nueva imagen ───────────────────────── */
  useEffect(() => {
    return () => {
      if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);
    };
  }, [nuevaImagenPreview]);

  /* ── Handlers form ───────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
  };

  /* ── Handlers imagen nueva ───────────────────────────── */
  const tomarNuevaImagen = (file) => {
    if (!file) return;

    const tiposPermitidos = [
      "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
    ];

    if (!tiposPermitidos.includes(file.type)) {
      setErrores((prev) => ({ ...prev, imagen: "La imagen debe ser JPG, PNG, WEBP o GIF" }));
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrores((prev) => ({ ...prev, imagen: "La imagen no puede superar los 5 MB" }));
      return;
    }

    if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);

    const blobUrl = URL.createObjectURL(file);
    setNuevaImagenFile(file);
    setNuevaImagenPreview(blobUrl);
    setEliminarImagenActual(false); // Si sube nueva, ya no tiene sentido solo eliminar
    setErrores((prev) => ({ ...prev, imagen: "", global: "" }));
  };

  const handleImagenInput = (e) => {
    const file = e.target.files?.[0];
    if (file) tomarNuevaImagen(file);
  };

  const limpiarNuevaImagen = () => {
    if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);
    setNuevaImagenFile(null);
    setNuevaImagenPreview("");
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  };

  const handleEliminarImagenActual = () => {
    setEliminarImagenActual(true);
    limpiarNuevaImagen();
    setErrores((prev) => ({ ...prev, imagen: "", global: "" }));
  };

  const handleCancelarEliminarImagen = () => {
    setEliminarImagenActual(false);
  };

  /* ── Validación ──────────────────────────────────────── */
  const validar = () => {
    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio";
    if (form.precio === "" || isNaN(form.precio) || Number(form.precio) < 0)
      errs.precio = "Ingresá un precio válido";
    if (
      form.precio_promo !== "" &&
      (isNaN(form.precio_promo) || Number(form.precio_promo) < 0)
    )
      errs.precio_promo = "Precio promo inválido";
    if (form.stock !== "" && (isNaN(form.stock) || Number(form.stock) < 0))
      errs.stock = "Stock inválido";

    if (nuevaImagenFile) {
      const tiposPermitidos = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (!tiposPermitidos.includes(nuevaImagenFile.type))
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      if (nuevaImagenFile.size > 5 * 1024 * 1024)
        errs.imagen = "La imagen no puede superar los 5 MB";
    }

    return errs;
  };

  /* ── Guardar ─────────────────────────────────────────── */
  const handleGuardar = async () => {
    const errs = validar();
    if (Object.keys(errs).length > 0) {
      setErrores(errs);
      return;
    }

    setGuardando(true);
    setErrores({});

    try {
      // Caso 1: hay nueva imagen → usar multipart (también actualiza los campos de texto)
      if (nuevaImagenFile) {
        const formData = new FormData();
        formData.append("id", String(Number(form.id || productoId)));
        formData.append("nombre", form.nombre.trim());
        formData.append("sku", form.sku.trim());
        formData.append("precio", String(form.precio));
        formData.append("precio_promo", form.precio_promo !== "" ? String(form.precio_promo) : "");
        formData.append("stock", form.stock !== "" ? String(form.stock) : "");
        formData.append("descripcion", form.descripcion.trim());
        formData.append("imagen", nuevaImagenFile);

        const res = await fetch(`${API_URL}?action=stock_productos_actualizar`, {
          method: "POST",
          headers: buildHeadersMultipart(),
          body: formData,
        });
        const data = await parseJsonOrThrow(res);
        if (data.exito === false) throw new Error(data.mensaje || "Error al actualizar el producto");

      } else {
        // Caso 2: sin nueva imagen → JSON normal
        const body = {
          id: Number(form.id || productoId),
          nombre: form.nombre.trim(),
          sku: form.sku.trim() || null,
          precio: Number(form.precio),
          precio_promo: form.precio_promo !== "" ? Number(form.precio_promo) : null,
          stock: form.stock !== "" ? Number(form.stock) : null,
          descripcion: form.descripcion.trim() || null,
        };

        // Si quiere eliminar la imagen actual, mandamos imagen_url vacía y la acción de eliminar
        if (eliminarImagenActual) {
          body.imagen_url = null;
          body.eliminar_imagen = true;
        }

        const res = await fetch(`${API_URL}?action=stock_productos_actualizar`, {
          method: "POST",
          headers: buildHeadersJSON(),
          body: JSON.stringify(body),
        });
        const data = await parseJsonOrThrow(res);
        if (data.exito === false) throw new Error(data.mensaje || "Error al actualizar el producto");
      }

      onGuardado?.();
    } catch (err) {
      setErrores({ global: err.message || "Error al actualizar" });
    } finally {
      setGuardando(false);
    }
  };

  /* ── Tiene imagen actual activa ──────────────────────── */
  const tieneImagenActual =
    !eliminarImagenActual &&
    !nuevaImagenFile &&
    (imagenActualBlob || (form.imagen_url && form.imagen_url.trim() !== ""));

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "580px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
              Editar Producto
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.4rem",
                cursor: "pointer",
                color: "#888",
                lineHeight: 1,
                padding: "2px 6px",
              }}
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {loading ? (
            <div style={{ color: "#666", fontSize: "0.95rem" }}>Cargando producto...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {errores.global && <div style={alertStyle()}>{errores.global}</div>}

              <CampoForm
                label="Nombre *"
                error={errores.nombre}
                input={
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Nombre del producto"
                    style={inputStyle(!!errores.nombre)}
                  />
                }
              />

              <CampoForm
                label="SKU"
                input={
                  <input
                    name="sku"
                    value={form.sku}
                    onChange={handleChange}
                    placeholder="Código único de producto (opcional)"
                    style={inputStyle(false)}
                  />
                }
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <CampoForm
                  label="Precio *"
                  error={errores.precio}
                  input={
                    <div style={inputWrapperStyle(!!errores.precio)}>
                      <span style={{ color: "#888", paddingLeft: "10px" }}>$</span>
                      <input
                        name="precio"
                        value={form.precio}
                        onChange={handleChange}
                        placeholder="0"
                        type="number"
                        min="0"
                        step="0.01"
                        style={{
                          ...inputStyle(false),
                          border: "none",
                          padding: "0 10px",
                          flex: 1,
                        }}
                      />
                    </div>
                  }
                />

                <CampoForm
                  label="Precio Promo"
                  error={errores.precio_promo}
                  input={
                    <div style={inputWrapperStyle(!!errores.precio_promo)}>
                      <span style={{ color: "#888", paddingLeft: "10px" }}>$</span>
                      <input
                        name="precio_promo"
                        value={form.precio_promo}
                        onChange={handleChange}
                        placeholder="0"
                        type="number"
                        min="0"
                        step="0.01"
                        style={{
                          ...inputStyle(false),
                          border: "none",
                          padding: "0 10px",
                          flex: 1,
                        }}
                      />
                    </div>
                  }
                />
              </div>

              <CampoForm
                label="Stock"
                error={errores.stock}
                input={
                  <input
                    name="stock"
                    value={form.stock}
                    onChange={handleChange}
                    placeholder="Cantidad disponible"
                    type="number"
                    min="0"
                    step="1"
                    style={inputStyle(!!errores.stock)}
                  />
                }
              />

              <CampoForm
                label="Descripción"
                input={
                  <textarea
                    name="descripcion"
                    value={form.descripcion}
                    onChange={handleChange}
                    placeholder="Descripción del producto..."
                    rows={3}
                    style={{
                      ...inputStyle(false),
                      resize: "vertical",
                      minHeight: "80px",
                    }}
                  />
                }
              />

              {/* ── Sección imagen ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
                  Imagen del producto
                </label>

                {/* Estado: imagen actual visible y sin cambios */}
                {tieneImagenActual && (
                  <div
                    style={{
                      border: "1px solid #e5e5e5",
                      borderRadius: "12px",
                      padding: "14px",
                      background: "#fafafa",
                      display: "grid",
                      gridTemplateColumns: "90px 1fr auto",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: "90px",
                        height: "90px",
                        borderRadius: "8px",
                        border: "1px solid #e5e5e5",
                        overflow: "hidden",
                        background: "#f0f0f0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {imagenActualCargando ? (
                        <span style={{ fontSize: "0.75rem", color: "#aaa" }}>Cargando...</span>
                      ) : imagenActualBlob ? (
                        <img
                          src={imagenActualBlob}
                          alt="Imagen actual"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: "1.8rem" }}>🖼️</span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#333", fontSize: "0.88rem", marginBottom: "4px" }}>
                        Imagen actual
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#888" }}>
                        Podés reemplazarla subiendo una nueva o eliminarla.
                      </div>
                    </div>

                    {/* Acciones */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => inputImagenRef.current?.click()}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "7px",
                          border: "1px solid #4361ee",
                          background: "#fff",
                          color: "#4361ee",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        🔄 Reemplazar
                      </button>
                      <button
                        type="button"
                        onClick={handleEliminarImagenActual}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "7px",
                          border: "1px solid #e74c3c",
                          background: "#fff",
                          color: "#e74c3c",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        🗑 Eliminar
                      </button>
                    </div>
                  </div>
                )}

                {/* Estado: imagen marcada para eliminar */}
                {eliminarImagenActual && !nuevaImagenFile && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      background: "#fff5f5",
                      border: "1px solid #fcc",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <span style={{ fontSize: "0.88rem", color: "#c0392b", fontWeight: 500 }}>
                      ⚠️ La imagen se eliminará al guardar
                    </span>
                    <button
                      type="button"
                      onClick={handleCancelarEliminarImagen}
                      style={{
                        padding: "5px 12px",
                        borderRadius: "7px",
                        border: "1px solid #ccc",
                        background: "#fff",
                        color: "#555",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {/* Zona drag & drop para nueva imagen */}
                {!tieneImagenActual && (
                  <div
                    onClick={() => inputImagenRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) tomarNuevaImagen(file);
                    }}
                    style={{
                      border: `2px dashed ${errores.imagen ? "#e74c3c" : nuevaImagenFile ? "#4361ee" : "#d8d8d8"}`,
                      borderRadius: "12px",
                      background: nuevaImagenFile ? "#f4f7ff" : "#fafafa",
                      padding: "18px",
                      cursor: "pointer",
                      transition: "all .2s ease",
                    }}
                  >
                    {!nuevaImagenPreview ? (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🖼️</div>
                        <div style={{ fontWeight: 600, color: "#444", marginBottom: "4px", fontSize: "0.9rem" }}>
                          Arrastrá una imagen o hacé click para seleccionar
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "#888" }}>
                          JPG, PNG, WEBP o GIF · máximo 5 MB
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "90px 1fr auto",
                          gap: "12px",
                          alignItems: "center",
                        }}
                      >
                        <img
                          src={nuevaImagenPreview}
                          alt="Preview nueva"
                          style={{
                            width: "90px",
                            height: "90px",
                            objectFit: "cover",
                            borderRadius: "8px",
                            border: "1px solid #e5e5e5",
                            background: "#fff",
                          }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#333",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              fontSize: "0.88rem",
                            }}
                          >
                            {nuevaImagenNombre}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#888", marginTop: "4px" }}>
                            {(nuevaImagenFile.size / 1024).toFixed(1)} KB
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#4361ee", marginTop: "2px" }}>
                            Nueva imagen seleccionada
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            limpiarNuevaImagen();
                          }}
                          style={{
                            padding: "7px 12px",
                            borderRadius: "8px",
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                            color: "#555",
                            fontWeight: 600,
                            fontSize: "0.82rem",
                          }}
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Zona para nueva imagen cuando YA hay una actual (reemplazar) */}
                {tieneImagenActual && nuevaImagenFile && (
                  <div
                    style={{
                      border: "2px dashed #4361ee",
                      borderRadius: "12px",
                      background: "#f4f7ff",
                      padding: "14px",
                      display: "grid",
                      gridTemplateColumns: "90px 1fr auto",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <img
                      src={nuevaImagenPreview}
                      alt="Preview nueva"
                      style={{
                        width: "90px",
                        height: "90px",
                        objectFit: "cover",
                        borderRadius: "8px",
                        border: "1px solid #c7d4fc",
                        background: "#fff",
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#333",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: "0.88rem",
                        }}
                      >
                        {nuevaImagenNombre}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#888", marginTop: "4px" }}>
                        {(nuevaImagenFile.size / 1024).toFixed(1)} KB
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#4361ee", marginTop: "2px" }}>
                        Reemplazará la imagen actual al guardar
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={limpiarNuevaImagen}
                      style={{
                        padding: "7px 12px",
                        borderRadius: "8px",
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                        color: "#555",
                        fontWeight: 600,
                        fontSize: "0.82rem",
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                )}

                {/* Input file oculto */}
                <input
                  ref={inputImagenRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={handleImagenInput}
                />

                {errores.imagen && (
                  <span style={{ fontSize: "0.78rem", color: "#e74c3c" }}>
                    {errores.imagen}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #f0f0f0",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: "0.9rem",
              color: "#555",
              fontWeight: 500,
            }}
            type="button"
          >
            Cancelar
          </button>

          <button
            onClick={handleGuardar}
            disabled={guardando || loading}
            style={{
              padding: "9px 24px",
              borderRadius: "8px",
              border: "none",
              background: guardando || loading ? "#a0aff7" : "#4361ee",
              color: "#fff",
              cursor: guardando || loading ? "not-allowed" : "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
              transition: "background 0.2s",
            }}
            type="button"
          >
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Helpers de UI
========================= */
const CampoForm = ({ label, input, error }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
    <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
      {label}
    </label>
    {input}
    {error && (
      <span style={{ fontSize: "0.78rem", color: "#e74c3c" }}>{error}</span>
    )}
  </div>
);

const inputStyle = (hasError) => ({
  padding: "9px 12px",
  borderRadius: "8px",
  border: `1px solid ${hasError ? "#e74c3c" : "#ddd"}`,
  fontSize: "0.9rem",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  transition: "border-color 0.15s",
});

const inputWrapperStyle = (hasError) => ({
  display: "flex",
  alignItems: "center",
  borderRadius: "8px",
  border: `1px solid ${hasError ? "#e74c3c" : "#ddd"}`,
  overflow: "hidden",
  background: "#fff",
});

const alertStyle = () => ({
  padding: "10px 14px",
  background: "#fff0f0",
  borderRadius: "8px",
  color: "#e74c3c",
  fontSize: "0.9rem",
  fontWeight: 400,
});

export default ModalEditarProducto;