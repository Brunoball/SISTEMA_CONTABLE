import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxOpen,
  faTag,
  faDollarSign,
  faLayerGroup,
  faAlignLeft,
  faImage,
  faTrash,
  faRefresh,
  faXmark,
  faFloppyDisk,
} from "@fortawesome/free-solid-svg-icons";
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

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
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
  const [dark, setDark] = useState(isTemaOscuro);
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

  const [imagenActualBlob, setImagenActualBlob] = useState(null);
  const [imagenActualCargando, setImagenActualCargando] = useState(false);
  const [nuevaImagenFile, setNuevaImagenFile] = useState(null);
  const [nuevaImagenPreview, setNuevaImagenPreview] = useState("");
  const [eliminarImagenActual, setEliminarImagenActual] = useState(false);

  const inputImagenRef = useRef();
  const nuevaImagenNombre = useMemo(
    () => nuevaImagenFile?.name || "",
    [nuevaImagenFile]
  );

  /* Dark mode observer */
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const o2 = new MutationObserver(update);
    if (document.body)
      o2.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  /* Block body scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ESC to close */
  useEffect(() => {
    const h = (e) => e.key === "Escape" && !guardando && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, guardando]);

  /* ── Cargar producto ── */
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
        const url = `${API_URL}?action=stock_producto_obtener&id=${encodeURIComponent(
          productoId
        )}`;
        const res = await fetch(url, {
          method: "GET",
          headers: buildHeadersGET(),
        });
        const data = await parseJsonOrThrow(res);
        if (data.exito === false)
          throw new Error(data.mensaje || "No se pudo cargar el producto");
        if (mounted) setForm(normalizarProducto(data));
      } catch (err) {
        if (mounted)
          setErrores({ global: err.message || "Error al cargar el producto" });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    cargarProducto();
    return () => {
      mounted = false;
    };
  }, [productoId]);

  /* ── Cargar blob de imagen actual ── */
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

  /* Cleanup blob nueva imagen */
  useEffect(() => {
    return () => {
      if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);
    };
  }, [nuevaImagenPreview]);

  /* ── Handlers form ── */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
  };

  /* ── Handlers imagen ── */
  const tomarNuevaImagen = (file) => {
    if (!file) return;
    const tiposPermitidos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!tiposPermitidos.includes(file.type)) {
      setErrores((prev) => ({
        ...prev,
        imagen: "La imagen debe ser JPG, PNG, WEBP o GIF",
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrores((prev) => ({
        ...prev,
        imagen: "La imagen no puede superar los 5 MB",
      }));
      return;
    }
    if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);
    const blobUrl = URL.createObjectURL(file);
    setNuevaImagenFile(file);
    setNuevaImagenPreview(blobUrl);
    setEliminarImagenActual(false);
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

  const handleCancelarEliminarImagen = () => setEliminarImagenActual(false);

  /* ── Validación ── */
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
      const tiposPermitidos = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!tiposPermitidos.includes(nuevaImagenFile.type))
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      if (nuevaImagenFile.size > 5 * 1024 * 1024)
        errs.imagen = "La imagen no puede superar los 5 MB";
    }
    return errs;
  };

  /* ── Guardar ── */
  const handleGuardar = async () => {
    const errs = validar();
    if (Object.keys(errs).length > 0) {
      setErrores(errs);
      return;
    }
    setGuardando(true);
    setErrores({});
    try {
      if (nuevaImagenFile) {
        const formData = new FormData();
        formData.append("id", String(Number(form.id || productoId)));
        formData.append("nombre", form.nombre.trim());
        formData.append("sku", form.sku.trim());
        formData.append("precio", String(form.precio));
        formData.append(
          "precio_promo",
          form.precio_promo !== "" ? String(form.precio_promo) : ""
        );
        formData.append("stock", form.stock !== "" ? String(form.stock) : "");
        formData.append("descripcion", form.descripcion.trim());
        formData.append("imagen", nuevaImagenFile);
        const res = await fetch(`${API_URL}?action=stock_productos_actualizar`, {
          method: "POST",
          headers: buildHeadersMultipart(),
          body: formData,
        });
        const data = await parseJsonOrThrow(res);
        if (data.exito === false)
          throw new Error(data.mensaje || "Error al actualizar el producto");
      } else {
        const body = {
          id: Number(form.id || productoId),
          nombre: form.nombre.trim(),
          sku: form.sku.trim() || null,
          precio: Number(form.precio),
          precio_promo:
            form.precio_promo !== "" ? Number(form.precio_promo) : null,
          stock: form.stock !== "" ? Number(form.stock) : null,
          descripcion: form.descripcion.trim() || null,
        };
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
        if (data.exito === false)
          throw new Error(data.mensaje || "Error al actualizar el producto");
      }
      onGuardado?.();
    } catch (err) {
      setErrores({ global: err.message || "Error al actualizar" });
    } finally {
      setGuardando(false);
    }
  };

  const tieneImagenActual =
    !eliminarImagenActual &&
    !nuevaImagenFile &&
    (imagenActualBlob || (form.imagen_url && form.imagen_url.trim() !== ""));

  /* ── Render ── */
  return createPortal(
    <div
      className={[
        "mi-modal__overlay",
        dark ? "mi-modal__overlay--dark" : "",
      ]
        .join(" ")
        .trim()}
      onClick={(e) => e.target === e.currentTarget && !guardando && onClose?.()}
    >
      <div
        className={[
          "mi-modal__container",
          "mep-container",
          dark ? "mi-modal--dark" : "",
        ]
          .join(" ")
          .trim()}
        role="dialog"
        aria-modal="true"
      >
        {/* ══ HEADER ══ */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faBoxOpen} />
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Editar Producto</h2>
            {form.nombre && <p className="mi-modal__subtitle">{form.nombre}</p>}
          </div>
          <button
            className="mi-modal__close"
            onClick={() => !guardando && onClose?.()}
            aria-label="Cerrar"
            disabled={guardando}
            type="button"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* ══ CONTENT ══ */}
        <div className="mi-modal__content mep-content">
          {loading ? (
            <div className="mep-loading">
              <div className="mep-loading__dot" />
              <span>Cargando producto...</span>
            </div>
          ) : (
            <div className="mep-grid">
              {/* ── COLUMNA IZQUIERDA: datos ── */}
              <div className="mep-fields">
                {errores.global && (
                  <div className="mov-mi-error">
                    <FontAwesomeIcon icon={faXmark} style={{ marginRight: 8 }} />
                    {errores.global}
                  </div>
                )}

                {/* Nombre */}
                <div className="fl-field">
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder=" "
                    className={`fl-input ${errores.nombre ? "fl-input--error" : ""}`}
                    disabled={guardando}
                  />
                  <label className="fl-label">
                    <FontAwesomeIcon icon={faBoxOpen} className="mep-label-icon" />
                    Nombre *
                  </label>
                  {errores.nombre && (
                    <span className="mep-field-error">{errores.nombre}</span>
                  )}
                </div>

                {/* SKU */}
                <div className="fl-field">
                  <input
                    name="sku"
                    value={form.sku}
                    onChange={handleChange}
                    placeholder=" "
                    className="fl-input"
                    disabled={guardando}
                  />
                  <label className="fl-label">
                    <FontAwesomeIcon icon={faTag} className="mep-label-icon" />
                    SKU
                  </label>
                </div>

                {/* Precios */}
                <div className="mep-row2">
                  <div className="fl-field">
                    <input
                      name="precio"
                      value={form.precio}
                      onChange={handleChange}
                      placeholder=" "
                      type="number"
                      min="0"
                      step="0.01"
                      className={`fl-input ${errores.precio ? "fl-input--error" : ""}`}
                      disabled={guardando}
                    />
                    <label className="fl-label">
                      <FontAwesomeIcon
                        icon={faDollarSign}
                        className="mep-label-icon"
                      />
                      Precio *
                    </label>
                    {errores.precio && (
                      <span className="mep-field-error">{errores.precio}</span>
                    )}
                  </div>

                  <div className="fl-field">
                    <input
                      name="precio_promo"
                      value={form.precio_promo}
                      onChange={handleChange}
                      placeholder=" "
                      type="number"
                      min="0"
                      step="0.01"
                      className={`fl-input ${
                        errores.precio_promo ? "fl-input--error" : ""
                      }`}
                      disabled={guardando}
                    />
                    <label className="fl-label">
                      <FontAwesomeIcon
                        icon={faDollarSign}
                        className="mep-label-icon"
                      />
                      Precio Promo
                    </label>
                    {errores.precio_promo && (
                      <span className="mep-field-error">
                        {errores.precio_promo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stock */}
                <div className="fl-field">
                  <input
                    name="stock"
                    value={form.stock}
                    onChange={handleChange}
                    placeholder=" "
                    type="number"
                    min="0"
                    step="1"
                    className={`fl-input ${errores.stock ? "fl-input--error" : ""}`}
                    disabled={guardando}
                  />
                  <label className="fl-label">
                    <FontAwesomeIcon
                      icon={faLayerGroup}
                      className="mep-label-icon"
                    />
                    Stock
                  </label>
                  {errores.stock && (
                    <span className="mep-field-error">{errores.stock}</span>
                  )}
                </div>

                {/* Descripción */}
                <div className="fl-field">
                  <textarea
                    name="descripcion"
                    value={form.descripcion}
                    onChange={handleChange}
                    placeholder=" "
                    rows={3}
                    className="fl-input mep-textarea"
                    disabled={guardando}
                  />
                  <label className="fl-label">
                    <FontAwesomeIcon
                      icon={faAlignLeft}
                      className="mep-label-icon"
                    />
                    Descripción
                  </label>
                </div>
              </div>

              {/* ── COLUMNA DERECHA: imagen ── */}
              <aside className="mep-aside">
                <div className="mi-card mi-card--full mep-img-card">
                  <div className="mi-card__title mep-aside-title">
                    <FontAwesomeIcon
                      icon={faImage}
                      style={{ marginRight: 8, opacity: 0.7 }}
                    />
                    Imagen del producto
                  </div>

                  {/* Imagen actual */}
                  {tieneImagenActual && (
                    <div className="mep-img-current">
                      <div className="mep-img-thumb">
                        {imagenActualCargando ? (
                          <span className="mep-img-loading">Cargando...</span>
                        ) : imagenActualBlob ? (
                          <img
                            src={imagenActualBlob}
                            alt="Imagen actual"
                            className="mep-img-thumb__img"
                          />
                        ) : (
                          <FontAwesomeIcon
                            icon={faImage}
                            className="mep-img-placeholder-icon"
                          />
                        )}
                      </div>
                      <div className="mep-img-info">
                        <div className="mep-img-info__label">Imagen actual</div>
                        <div className="mep-img-info__hint">
                          Reemplazá o eliminá la imagen
                        </div>
                      </div>
                      <div className="mep-img-actions">
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost mep-img-btn"
                          onClick={() => inputImagenRef.current?.click()}
                          disabled={guardando}
                        >
                          <FontAwesomeIcon icon={faRefresh} />
                          Reemplazar
                        </button>
                        <button
                          type="button"
                          className="mit-btn mep-img-btn mep-img-btn--danger"
                          onClick={handleEliminarImagenActual}
                          disabled={guardando}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Marcada para eliminar */}
                  {eliminarImagenActual && !nuevaImagenFile && (
                    <div className="mep-img-delete-warning">
                      <span>⚠️ La imagen se eliminará al guardar</span>
                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost mep-img-btn"
                        onClick={handleCancelarEliminarImagen}
                        disabled={guardando}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* Drop zone */}
                  {!tieneImagenActual && (
                    <div
                      className={`mep-dropzone ${
                        nuevaImagenFile ? "mep-dropzone--active" : ""
                      } ${errores.imagen ? "mep-dropzone--error" : ""}`}
                      onClick={() => inputImagenRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files?.[0];
                        if (file) tomarNuevaImagen(file);
                      }}
                    >
                      {!nuevaImagenPreview ? (
                        <div className="mep-dropzone__empty">
                          <div className="mep-dropzone__icon">
                            <FontAwesomeIcon icon={faImage} />
                          </div>
                          <div className="mep-dropzone__text">
                            Arrastrá una imagen o hacé click
                          </div>
                          <div className="mep-dropzone__hint">
                            JPG, PNG, WEBP o GIF · máx 5 MB
                          </div>
                        </div>
                      ) : (
                        <div className="mep-dropzone__preview">
                          <img
                            src={nuevaImagenPreview}
                            alt="Preview"
                            className="mep-dropzone__preview-img"
                          />
                          <div className="mep-dropzone__preview-meta">
                            <div className="mep-dropzone__preview-name">
                              {nuevaImagenNombre}
                            </div>
                            <div className="mep-dropzone__preview-size">
                              {(nuevaImagenFile.size / 1024).toFixed(1)} KB
                            </div>
                            <div className="mep-dropzone__preview-badge">
                              Nueva imagen seleccionada
                            </div>
                          </div>
                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost mep-img-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              limpiarNuevaImagen();
                            }}
                            disabled={guardando}
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview reemplazo */}
                  {tieneImagenActual && nuevaImagenFile && (
                    <div className="mep-img-replace">
                      <img
                        src={nuevaImagenPreview}
                        alt="Nueva imagen"
                        className="mep-img-replace__thumb"
                      />
                      <div className="mep-img-replace__meta">
                        <div className="mep-img-replace__name">
                          {nuevaImagenNombre}
                        </div>
                        <div className="mep-img-replace__size">
                          {(nuevaImagenFile.size / 1024).toFixed(1)} KB
                        </div>
                        <div className="mep-img-replace__badge">
                          Reemplazará la imagen al guardar
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost mep-img-btn"
                        onClick={limpiarNuevaImagen}
                        disabled={guardando}
                      >
                        Quitar
                      </button>
                    </div>
                  )}

                  {errores.imagen && (
                    <span className="mep-field-error" style={{ marginTop: 6 }}>
                      {errores.imagen}
                    </span>
                  )}

                  <input
                    ref={inputImagenRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={handleImagenInput}
                  />
                </div>
              </aside>
            </div>
          )}
        </div>

        {/* ══ FOOTER ══ */}
        <div className="mep-footer">
          <button
            type="button"
            className="mit-btn mit-btn--ghost"
            onClick={() => !guardando && onClose?.()}
            disabled={guardando}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="mit-btn mit-btn--solid"
            onClick={handleGuardar}
            disabled={guardando || loading}
          >
            <FontAwesomeIcon
              icon={guardando ? faRefresh : faFloppyDisk}
              style={{
                marginRight: 8,
                ...(guardando
                  ? { animation: "mep-spin 1s linear infinite" }
                  : {}),
              }}
            />
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>

        {/* ══ ESTILOS ══ */}
        <style>{`
          .mi-modal__overlay {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            background: rgba(10, 25, 40, 0.38);
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
            z-index: 999999;
            overflow-y: auto;
          }

          .mi-modal__overlay--dark {
            background: rgba(0, 0, 0, 0.58);
          }

          .mep-container {
            width: min(780px, 96vw);
            min-height: auto !important;
            max-height: 92vh;
            display: flex;
            flex-direction: column;
            animation: mi-modal-pop-min .16s ease-out;
          }

          .mep-content {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            padding: 18px !important;
            background: var(--nv-surface, #F7F9FC);
          }

          .mep-loading {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 20px;
            color: var(--nv-muted, #5A6A7E);
            font-size: 14px;
            border: 1px solid var(--nv-border, rgba(15,23,42,.10));
            border-radius: 12px;
            background: var(--nv-bg, #fff);
          }

          .mep-loading__dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--blue-action, #0055BB);
            box-shadow: 0 0 0 6px rgba(0,85,187,.12);
            flex: 0 0 auto;
            animation: mep-pulse 1.2s ease infinite;
          }

          .mep-grid {
            display: grid;
            grid-template-columns: 1fr 280px;
            gap: 14px;
            align-items: start;
          }

          .mep-fields {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .mep-row2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }

          .fl-input--error {
            border-color: #e74c3c !important;
          }

          .fl-input--error:focus {
            box-shadow: 0 0 0 3px rgba(231,76,60,.14) !important;
          }

          .mep-field-error {
            font-size: 11.5px;
            color: #e74c3c;
            margin-top: 3px;
            display: block;
          }

          .mep-label-icon {
            margin-right: 5px;
            opacity: 0.6;
            font-size: 11px;
          }

          .mep-textarea {
            resize: vertical;
            min-height: 86px;
            padding-top: 18px !important;
            line-height: 1.45;
          }

          .mep-aside {
            position: sticky;
            top: 0;
          }

          .mep-img-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 14px !important;
            border: 1px solid var(--mi-border, rgba(148,163,184,.45)) !important;
            border-radius: 14px !important;
            background: var(--nv-bg, #fff);
            box-shadow: 0 2px 10px rgba(15,23,42,.04);
          }

          .mep-aside-title {
            font-size: 13px !important;
            font-weight: 700 !important;
            color: var(--nv-muted, #5A6A7E);
            text-transform: uppercase;
            letter-spacing: .05em;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--nv-border, rgba(15,23,42,.10));
          }

          .mep-img-current {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 12px;
            border: 1px solid var(--nv-border-md, rgba(15,23,42,.16));
            border-radius: 12px;
            background: var(--nv-surface, #F7F9FC);
          }

          .mep-img-thumb {
            width: 100%;
            height: 140px;
            border-radius: 8px;
            border: 1px solid var(--nv-border, rgba(15,23,42,.10));
            background: var(--nv-surface2, #EEF2F8);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
          }

          .mep-img-thumb__img {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .mep-img-loading {
            font-size: 11px;
            color: var(--nv-muted, #5A6A7E);
          }

          .mep-img-placeholder-icon {
            font-size: 2rem;
            color: var(--nv-muted, #5A6A7E);
            opacity: 0.4;
          }

          .mep-img-info {
            min-width: 0;
          }

          .mep-img-info__label {
            font-weight: 600;
            font-size: 13px;
            color: var(--nv-text, #0A2540);
          }

          .mep-img-info__hint {
            font-size: 11.5px;
            color: var(--nv-muted, #5A6A7E);
            margin-top: 2px;
          }

          .mep-img-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }

          .mep-img-btn {
            height: 34px !important;
            padding: 0 10px !important;
            font-size: 12px !important;
            border-radius: 9px !important;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          }

          .mep-img-btn--danger {
            background: rgba(231,76,60,.08) !important;
            border: 1px solid rgba(231,76,60,.30) !important;
            color: #c0392b !important;
          }

          .mep-img-btn--danger:hover:not(:disabled) {
            background: rgba(231,76,60,.15) !important;
            transform: translateY(-1px);
          }

          .mep-img-delete-warning {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid rgba(231,76,60,.25);
            border-radius: 10px;
            background: rgba(231,76,60,.06);
            font-size: 12.5px;
            color: #c0392b;
            font-weight: 500;
          }

          .mep-dropzone {
            border: 2px dashed var(--nv-border-md, rgba(15,23,42,.16));
            border-radius: 12px;
            background: var(--nv-surface, #F7F9FC);
            cursor: pointer;
            transition: all .2s ease;
            padding: 16px;
          }

          .mep-dropzone:hover {
            border-color: var(--nv-action, #0055BB);
            background: var(--nv-action-10, rgba(0,85,187,.10));
          }

          .mep-dropzone--active {
            border-color: var(--nv-action, #0055BB);
            background: rgba(0,85,187,.05);
          }

          .mep-dropzone--error {
            border-color: #e74c3c;
          }

          .mep-dropzone__empty {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            padding: 8px 0;
          }

          .mep-dropzone__icon {
            width: 44px;
            height: 44px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            background: var(--nv-action-10, rgba(0,85,187,.10));
            border: 1px solid var(--nv-action-18, rgba(0,85,187,.18));
            color: var(--nv-action, #0055BB);
            font-size: 18px;
            margin-bottom: 4px;
          }

          .mep-dropzone__text {
            font-size: 13px;
            font-weight: 600;
            color: var(--nv-text, #0A2540);
          }

          .mep-dropzone__hint {
            font-size: 11.5px;
            color: var(--nv-muted, #5A6A7E);
          }

          .mep-dropzone__preview {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
          }

          .mep-dropzone__preview-img {
            width: 100%;
            height: 120px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid var(--nv-border, rgba(15,23,42,.10));
          }

          .mep-dropzone__preview-meta {
            width: 100%;
            text-align: left;
          }

          .mep-dropzone__preview-name {
            font-size: 12px;
            font-weight: 600;
            color: var(--nv-text, #0A2540);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mep-dropzone__preview-size {
            font-size: 11px;
            color: var(--nv-muted, #5A6A7E);
            margin-top: 2px;
          }

          .mep-dropzone__preview-badge {
            font-size: 11px;
            color: var(--nv-action, #0055BB);
            margin-top: 2px;
            font-weight: 500;
          }

          .mep-img-replace {
            display: flex;
            flex-direction: column;
            gap: 8px;
            border: 2px dashed var(--nv-action, #0055BB);
            border-radius: 12px;
            background: var(--nv-action-10, rgba(0,85,187,.06));
            padding: 12px;
          }

          .mep-img-replace__thumb {
            width: 100%;
            height: 120px;
            object-fit: cover;
            border-radius: 8px;
            border: 1px solid rgba(0,85,187,.20);
          }

          .mep-img-replace__name {
            font-size: 12px;
            font-weight: 600;
            color: var(--nv-text, #0A2540);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mep-img-replace__size {
            font-size: 11px;
            color: var(--nv-muted, #5A6A7E);
            margin-top: 2px;
          }

          .mep-img-replace__badge {
            font-size: 11px;
            color: var(--nv-action, #0055BB);
            font-weight: 500;
            margin-top: 2px;
          }

          .mep-footer {
            flex: 0 0 auto;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 14px 18px;
            border-top: 1px solid var(--nv-border, rgba(15,23,42,.10));
            background: var(--nv-bg, #fff);
          }

          .mep-footer .mit-btn {
            height: 40px;
            padding: 0 20px;
            font-size: 13.5px;
          }

          .mi-modal--dark .mep-content {
            background: var(--nv-surface, rgba(10,25,40,.72)) !important;
          }

          .mi-modal--dark .mep-img-card {
            background: rgba(6,18,28,.78) !important;
            border-color: rgba(255,255,255,.10) !important;
          }

          .mi-modal--dark .mep-img-current {
            background: rgba(255,255,255,.04) !important;
            border-color: rgba(255,255,255,.10) !important;
          }

          .mi-modal--dark .mep-img-thumb {
            background: rgba(255,255,255,.06) !important;
            border-color: rgba(255,255,255,.08) !important;
          }

          .mi-modal--dark .mep-img-info__label {
            color: rgba(255,255,255,.92) !important;
          }

          .mi-modal--dark .mep-img-info__hint,
          .mi-modal--dark .mep-img-loading {
            color: rgba(226,232,240,.70) !important;
          }

          .mi-modal--dark .mep-dropzone {
            background: rgba(255,255,255,.03) !important;
            border-color: rgba(255,255,255,.14) !important;
          }

          .mi-modal--dark .mep-dropzone:hover {
            background: rgba(0,85,187,.12) !important;
            border-color: rgba(0,85,187,.50) !important;
          }

          .mi-modal--dark .mep-dropzone__text {
            color: rgba(255,255,255,.90) !important;
          }

          .mi-modal--dark .mep-dropzone__hint {
            color: rgba(226,232,240,.65) !important;
          }

          .mi-modal--dark .mep-dropzone__preview-name,
          .mi-modal--dark .mep-img-replace__name {
            color: rgba(255,255,255,.90) !important;
          }

          .mi-modal--dark .mep-img-delete-warning {
            background: rgba(231,76,60,.10) !important;
            border-color: rgba(231,76,60,.28) !important;
            color: rgba(255,180,180,.92) !important;
          }

          .mi-modal--dark .mep-img-replace {
            background: rgba(0,85,187,.08) !important;
            border-color: rgba(0,85,187,.40) !important;
          }

          .mi-modal--dark .mep-footer {
            background: rgba(6,18,28,.96) !important;
            border-top-color: rgba(255,255,255,.08) !important;
          }

          .mi-modal--dark .mep-loading {
            background: rgba(10,25,40,.72) !important;
            border-color: rgba(255,255,255,.10) !important;
            color: rgba(226,232,240,.78) !important;
          }

          .mi-modal--dark .mep-aside-title {
            color: rgba(210,220,235,.70) !important;
            border-bottom-color: rgba(255,255,255,.08) !important;
          }

          @keyframes mep-pulse {
            0%, 100% { box-shadow: 0 0 0 6px rgba(0,85,187,.12); }
            50% { box-shadow: 0 0 0 10px rgba(0,85,187,.05); }
          }

          @keyframes mep-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          @media (max-width: 600px) {
            .mep-grid {
              grid-template-columns: 1fr;
            }

            .mep-aside {
              position: static;
            }

            .mep-row2 {
              grid-template-columns: 1fr;
            }

            .mi-modal__overlay {
              padding: 10px;
              align-items: flex-start;
            }

            .mep-container {
              width: min(100%, 100%);
              max-height: calc(100vh - 20px);
            }
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
};

export default ModalEditarProducto;