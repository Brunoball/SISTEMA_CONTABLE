import React, { useEffect, useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./ModalCargaMasiva.css";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante";
import {
  faBoxOpen,
  faTag,
  faDollarSign,
  faAlignLeft,
  faTrashCan,
  faRefresh,
  faXmark,
  faFloppyDisk,
  faCircleExclamation,
  faPaperclip,
  faArrowUpFromBracket,
  faTriangleExclamation,
  faBarcode,
  faCubesStacked,
  faEye,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../config/config";

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

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 400 ? text.slice(0, 400) + "..." : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

  return data;
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

/* =========================
   Helpers monetarios
========================= */
function normalizeMoneyInput(raw = "") {
  let value = String(raw).replace(/[^\d,]/g, "");

  const firstComma = value.indexOf(",");
  if (firstComma !== -1) {
    value =
      value.slice(0, firstComma + 1) +
      value.slice(firstComma + 1).replace(/,/g, "");
  }

  const parts = value.split(",");
  if (parts.length > 1) {
    parts[1] = parts[1].slice(0, 2);
    value = `${parts[0]},${parts[1]}`;
  }

  return value;
}

function formatMoneyBlur(raw = "") {
  const cleaned = String(raw).replace(/[^\d,]/g, "").trim();
  if (!cleaned || cleaned === ",") return "";

  const normalized = cleaned.replace(",", ".");
  const num = Number(normalized);
  if (Number.isNaN(num) || num < 0) return "";
  return num.toFixed(2).replace(".", ",");
}

function formatMoneyFocus(raw = "") {
  if (!raw) return "";
  if (raw === "0,00") return "";
  if (raw.endsWith(",00")) return raw.slice(0, -3);
  return raw;
}

function moneyToApi(raw = "") {
  if (raw === "" || raw === null || raw === undefined) return null;
  const num = Number(String(raw).replace(",", "."));
  if (Number.isNaN(num)) return null;
  return Number(num.toFixed(2));
}

function normalizeCategoriaId(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (s === "" || s === "0" || s.toLowerCase() === "null") return "";
  return s;
}

const normalizarProducto = (data) => {
  const p = data?.producto || data?.data || data || {};

  const precio =
    p.precio !== null && p.precio !== undefined && p.precio !== ""
      ? Number(p.precio).toFixed(2).replace(".", ",")
      : "";

  const precioPromo =
    p.precio_promo !== null &&
    p.precio_promo !== undefined &&
    p.precio_promo !== ""
      ? Number(p.precio_promo).toFixed(2).replace(".", ",")
      : "";

  return {
    id: p.id ?? "",
    nombre: p.nombre ?? "",
    sku: p.sku ?? "",
    precio,
    precio_promo: precioPromo,
    stock:
      p.stock !== null && p.stock !== undefined && p.stock !== ""
        ? String(p.stock)
        : "",
    descripcion: p.descripcion ?? "",
    imagen_url: p.imagen_url ?? p.imagen ?? "",
    imagen_archivo_id: p.imagen_archivo_id ? Number(p.imagen_archivo_id) : null,
    id_categoria_stock: normalizeCategoriaId(p.id_categoria_stock),
  };
};

/* =========================
   Componentes UI reutilizables
========================= */
const ErrorMsg = ({ msg }) => (
  <span
    style={{
      fontSize: "0.76rem",
      color: "#ef4444",
      marginTop: 2,
      display: "flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    <FontAwesomeIcon icon={faCircleExclamation} style={{ fontSize: 10 }} />
    {msg}
  </span>
);

function FloatingField({ label, icon, error, children, style }) {
  return (
    <div className="cmi-floatingField cmi-floatingField--active" style={style}>
      {children}
      <label className="cmi-floatingLabel cmi-floatingLabel--active">
        {icon && (
          <FontAwesomeIcon
            icon={icon}
            style={{ marginRight: 5, opacity: 0.7, fontSize: 11 }}
          />
        )}
        {label}
      </label>
      {error && <ErrorMsg msg={error} />}
    </div>
  );
}

function PriceInput({
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled,
  className,
}) {
  return (
    <input
      name={name}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      className={className || "cmi-input"}
      placeholder={placeholder || "0,00"}
      disabled={disabled}
      inputMode="decimal"
    />
  );
}

/* =========================
   Modal editar producto
========================= */
export default function ModalEditarProducto({
  productoId,
  onClose,
  onGuardado,
}) {
  const closeBtnRef = useRef(null);

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
    id_categoria_stock: "",
  });

  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);

  useEffect(() => {
    let cancelado = false;

    const fetchCategorias = async () => {
      setLoadingCategorias(true);
      try {
        const params = new URLSearchParams({ action: "obtener_listas" });
        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: buildHeadersGET(),
        });

        const data = await parseJsonOrThrow(res);

        const raw = Array.isArray(data?.listas?.stock_categorias)
          ? data.listas.stock_categorias
          : [];

        const normalizadas = raw.map((cat) => ({
          id: String(cat.id_stock_categoria ?? cat.id ?? "").trim(),
          nombre: String(cat.nombre ?? cat.label ?? "").trim().toUpperCase(), // Mayúsculas
          activo:
            cat.activo === undefined || cat.activo === null
              ? 1
              : Number(cat.activo),
        }));

        if (!cancelado) {
          setCategorias(normalizadas.filter((c) => c.id !== ""));
        }
      } catch {
        if (!cancelado) setCategorias([]);
      } finally {
        if (!cancelado) setLoadingCategorias(false);
      }
    };

    fetchCategorias();
    return () => {
      cancelado = true;
    };
  }, []);

  const [imagenActualBlob, setImagenActualBlob] = useState(null);
  const [imagenActualCargando, setImagenActualCargando] = useState(false);
  const [nuevaImagenFile, setNuevaImagenFile] = useState(null);
  const [nuevaImagenPreview, setNuevaImagenPreview] = useState("");
  const [eliminarImagenActual, setEliminarImagenActual] = useState(false);

  const inputImagenRef = useRef(null);

  // ── Preview modal states ──
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMime, setPreviewMime] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");

  const cerrarPreview = () => {
    setPreviewOpen(false);
    setPreviewUrl("");
    setPreviewMime("");
    setPreviewFileName("");
  };

  const abrirPreview = ({ src, mime = "", name = "" }) => {
    if (!src) return;
    setPreviewUrl(src);
    setPreviewMime(mime);
    setPreviewFileName(name);
    setPreviewOpen(true);
  };

  const nuevaImagenNombre = useMemo(
    () => nuevaImagenFile?.name || "",
    [nuevaImagenFile]
  );

  const isLoading = loading || guardando;

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape" && !guardando && !previewOpen) onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, guardando, previewOpen]);

  useEffect(() => {
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, []);

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

        if (mounted) {
          setForm(normalizarProducto(data));
        }
      } catch (err) {
        if (mounted) {
          setErrores({
            global: err.message || "Error al cargar el producto",
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargarProducto();

    return () => {
      mounted = false;
    };
  }, [productoId]);

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

  useEffect(() => {
    return () => {
      if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);
    };
  }, [nuevaImagenPreview]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "precio" || name === "precio_promo") {
      setForm((prev) => ({
        ...prev,
        [name]: normalizeMoneyInput(value),
      }));
    } else if (name === "stock") {
      setForm((prev) => ({
        ...prev,
        [name]: value.replace(/[^\d]/g, ""),
      }));
    } else if (name === "nombre") {
      // Transformar a mayúsculas
      setForm((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    } else if (name === "sku") {
      // Transformar a mayúsculas
      setForm((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    } else if (name === "descripcion") {
      // Transformar a mayúsculas
      setForm((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
  };

  const handleMoneyBlur = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: formatMoneyBlur(value),
    }));
  };

  const handleMoneyFocus = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: formatMoneyFocus(value),
    }));
  };

  const limpiarNuevaImagen = () => {
    if (nuevaImagenPreview) URL.revokeObjectURL(nuevaImagenPreview);
    setNuevaImagenFile(null);
    setNuevaImagenPreview("");
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  };

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

  const handleEliminarImagenActual = () => {
    setEliminarImagenActual(true);
    limpiarNuevaImagen();
    setErrores((prev) => ({ ...prev, imagen: "", global: "" }));
  };

  const handleCancelarEliminarImagen = () => {
    setEliminarImagenActual(false);
  };

  const validar = () => {
    const errs = {};

    const precioNum = Number(String(form.precio || "").replace(",", "."));
    const promoNum =
      form.precio_promo !== ""
        ? Number(String(form.precio_promo).replace(",", "."))
        : null;

    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio";

    if (!form.precio || Number.isNaN(precioNum) || precioNum < 0) {
      errs.precio = "Ingresá un precio válido";
    }

    if (form.precio_promo !== "" && (Number.isNaN(promoNum) || promoNum < 0)) {
      errs.precio_promo = "Precio promo inválido";
    }

    if (
      form.stock !== "" &&
      (Number.isNaN(Number(form.stock)) || Number(form.stock) < 0)
    ) {
      errs.stock = "Stock inválido";
    }

    if (nuevaImagenFile) {
      const tiposPermitidos = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      if (!tiposPermitidos.includes(nuevaImagenFile.type)) {
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      }

      if (nuevaImagenFile.size > 5 * 1024 * 1024) {
        errs.imagen = "La imagen no puede superar los 5 MB";
      }
    }

    return errs;
  };

  const handleGuardar = async () => {
    const errs = validar();
    if (Object.keys(errs).length > 0) {
      setErrores(errs);
      return;
    }

    setGuardando(true);
    setErrores({});

    try {
      const categoriaId = normalizeCategoriaId(form.id_categoria_stock);

      if (nuevaImagenFile) {
        const fd = new FormData();
        fd.append("id", String(Number(form.id || productoId)));
        fd.append("nombre", form.nombre.trim().toUpperCase());
        fd.append("sku", form.sku.trim().toUpperCase());
        fd.append("precio", String(moneyToApi(form.precio) ?? ""));
        fd.append(
          "precio_promo",
          form.precio_promo !== ""
            ? String(moneyToApi(form.precio_promo) ?? "")
            : ""
        );
        fd.append("stock", form.stock !== "" ? String(form.stock) : "");
        fd.append("descripcion", form.descripcion.trim().toUpperCase());

        if (categoriaId !== "") {
          fd.append("id_categoria_stock", categoriaId);
        }

        fd.append("imagen", nuevaImagenFile);

        const res = await fetch(`${API_URL}?action=stock_productos_actualizar`, {
          method: "POST",
          headers: buildHeadersMultipart(),
          body: fd,
        });

        await parseJsonOrThrow(res);
      } else {
        const body = {
          id: Number(form.id || productoId),
          nombre: form.nombre.trim().toUpperCase(),
          sku: form.sku.trim().toUpperCase() || null,
          precio: moneyToApi(form.precio),
          precio_promo:
            form.precio_promo !== "" ? moneyToApi(form.precio_promo) : null,
          stock: form.stock !== "" ? Number(form.stock) : null,
          descripcion: form.descripcion.trim().toUpperCase() || null,
          id_categoria_stock: categoriaId !== "" ? Number(categoriaId) : null,
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

        await parseJsonOrThrow(res);
      }

      onGuardado?.();
    } catch (err) {
      setErrores({ global: err.message || "Error al actualizar el producto" });
    } finally {
      setGuardando(false);
    }
  };

  const tieneImagenActual =
    !eliminarImagenActual &&
    !nuevaImagenFile &&
    (imagenActualBlob || (form.imagen_url && form.imagen_url.trim() !== ""));

  return createPortal(
    <>
      <div
        className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""]
          .join(" ")
          .trim()}
      >
        <div
          className={[
            "mi-modal__container",
            "cmi-container",
            dark ? "mi-modal--dark" : "",
          ]
            .join(" ")
            .trim()}
          role="dialog"
          aria-modal="true"
          style={{ minHeight: "auto", maxHeight: "92vh" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faBoxOpen} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Editar producto</h2>
              <p className="mi-modal__subtitle">
                {form.nombre
                  ? `Modificando: ${form.nombre}`
                  : "Actualizá los datos del producto"}
              </p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !guardando && onClose?.()}
              aria-label="Cerrar"
              disabled={guardando}
              type="button"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div
            className="mi-modal__content"
            style={{ overflowY: "auto", padding: 20 }}
          >
            {loading ? (
              <div className="cmi-uploadBox">
                <div className="cmi-uploadBox__title">
                  <FontAwesomeIcon icon={faRefresh} spin /> Cargando producto...
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {errores.global && (
                  <div className="cmi-warnBox">
                    <div className="cmi-warnBox__title">
                      <FontAwesomeIcon
                        icon={faTriangleExclamation}
                        style={{ marginRight: 8 }}
                      />
                      Error
                    </div>
                    <div>{errores.global}</div>
                  </div>
                )}

                <FloatingField
                  label="Nombre del producto *"
                  icon={faBoxOpen}
                  error={errores.nombre}
                >
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    className="cmi-input"
                    placeholder="Ej: AURICULARES BLUETOOTH SAMSUNG WH-1000"
                    disabled={guardando}
                    style={{ textTransform: "uppercase" }}
                  />
                </FloatingField>

                <div className="fl-row">
                  <FloatingField label="SKU / Código" icon={faBarcode}>
                    <input
                      name="sku"
                      value={form.sku}
                      onChange={handleChange}
                      className="cmi-input"
                      placeholder="Ej: 04163"
                      disabled={guardando}
                      style={{ textTransform: "uppercase" }}
                    />
                  </FloatingField>

                  <FloatingField
                    label="Stock"
                    icon={faCubesStacked}
                    error={errores.stock}
                  >
                    <input
                      name="stock"
                      value={form.stock}
                      onChange={handleChange}
                      className="cmi-input"
                      placeholder="Ej: 25"
                      inputMode="numeric"
                      disabled={guardando}
                    />
                  </FloatingField>
                </div>

                <div className="fl-row">
                  <FloatingField
                    label="Precio *"
                    icon={faDollarSign}
                    error={errores.precio}
                  >
                    <PriceInput
                      name="precio"
                      value={form.precio}
                      onChange={handleChange}
                      onBlur={handleMoneyBlur}
                      onFocus={handleMoneyFocus}
                      placeholder="0,00"
                      disabled={guardando}
                    />
                  </FloatingField>

                  <FloatingField
                    label="Precio promocional"
                    icon={faDollarSign}
                    error={errores.precio_promo}
                  >
                    <PriceInput
                      name="precio_promo"
                      value={form.precio_promo}
                      onChange={handleChange}
                      onBlur={handleMoneyBlur}
                      onFocus={handleMoneyFocus}
                      placeholder="0,00"
                      disabled={guardando}
                    />
                  </FloatingField>
                </div>

                <FloatingField label="Categoría" icon={faTag}>
                  <select
                    name="id_categoria_stock"
                    value={form.id_categoria_stock}
                    onChange={handleChange}
                    className="cmi-input cmi-select"
                    disabled={guardando || loadingCategorias}
                  >
                    <option value="">
                      {loadingCategorias ? "Cargando categorías..." : "Sin categoría"}
                    </option>

                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </FloatingField>

                <FloatingField label="Descripción" icon={faAlignLeft}>
                  <textarea
                    name="descripcion"
                    value={form.descripcion}
                    onChange={handleChange}
                    className="cmi-input cmi-textarea"
                    placeholder="BREVE DESCRIPCIÓN DEL PRODUCTO (OPCIONAL)"
                    rows={3}
                    disabled={guardando}
                    style={{ textTransform: "uppercase" }}
                  />
                </FloatingField>

                <div className="cmi-uploadBox">
                  <div className="cmi-uploadBox__title">
                    <FontAwesomeIcon icon={faPaperclip} /> Imagen del producto
                  </div>

                  <input
                    ref={inputImagenRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
                    hidden
                    onChange={handleImagenInput}
                  />

                  {/* ── Imagen actual ── */}
                  {tieneImagenActual && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div className="cmi-fileRow" style={{ alignItems: "center" }}>
                        <span>Imagen actual</span>

                        <div className="cmi-fileActions">
                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost"
                            onClick={() =>
                              abrirPreview({
                                src: imagenActualBlob || form.imagen_url,
                                mime: "image/jpeg",
                                name: form.nombre || "imagen_actual",
                              })
                            }
                            disabled={
                              guardando ||
                              imagenActualCargando ||
                              (!imagenActualBlob && !form.imagen_url)
                            }
                            aria-label="Ver imagen"
                            title="Ver imagen"
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>

                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost"
                            onClick={() => inputImagenRef.current?.click()}
                            disabled={guardando}
                          >
                            <FontAwesomeIcon icon={faArrowUpFromBracket} /> Reemplazar
                          </button>

                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost"
                            onClick={handleEliminarImagenActual}
                            disabled={guardando}
                          >
                            <FontAwesomeIcon icon={faTrashCan} /> Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Aviso eliminar imagen ── */}
                  {eliminarImagenActual && !nuevaImagenFile && (
                    <div className="cmi-warnBox" style={{ marginTop: 10 }}>
                      <div className="cmi-warnBox__title">
                        <FontAwesomeIcon
                          icon={faTriangleExclamation}
                          style={{ marginRight: 8 }}
                        />
                        Atención
                      </div>
                      <div style={{ marginBottom: 10 }}>
                        La imagen actual se eliminará al guardar.
                      </div>
                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost"
                        onClick={handleCancelarEliminarImagen}
                        disabled={guardando}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* ── Sin imagen: botón seleccionar ── */}
                  {!tieneImagenActual && !nuevaImagenFile && (
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost"
                      onClick={() => inputImagenRef.current?.click()}
                      disabled={guardando}
                    >
                      <FontAwesomeIcon icon={faArrowUpFromBracket} /> Seleccionar imagen
                    </button>
                  )}

                  {/* ── Nueva imagen seleccionada ── */}
                  {nuevaImagenFile && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div className="cmi-fileRow">
                        <span>{nuevaImagenNombre}</span>

                        <div className="cmi-fileActions">
                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost"
                            onClick={() =>
                              abrirPreview({
                                src: nuevaImagenPreview,
                                mime: nuevaImagenFile?.type || "image/jpeg",
                                name: nuevaImagenNombre,
                              })
                            }
                            disabled={!nuevaImagenPreview}
                            aria-label="Ver imagen"
                            title="Ver imagen"
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>

                          <button
                            type="button"
                            className="mit-btn mit-btn--ghost"
                            onClick={limpiarNuevaImagen}
                            disabled={guardando}
                          >
                            <FontAwesomeIcon icon={faTrashCan} /> Quitar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {errores.imagen && <ErrorMsg msg={errores.imagen} />}
                </div>
              </div>
            )}
          </div>

          <div className="cmi-footer">
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
              disabled={isLoading}
            >
              <FontAwesomeIcon
                icon={guardando ? faRefresh : faFloppyDisk}
                spin={guardando}
                style={{ marginRight: 8 }}
              />
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>

      <ModalVerComprobante
        open={previewOpen}
        url={previewUrl}
        mime={previewMime}
        fileName={previewFileName}
        title="Imagen del producto"
        onClose={cerrarPreview}
      />
    </>,
    document.body
  );
}