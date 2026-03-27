import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./ModalCargaMasiva.css";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante"; // AJUSTÁ ESTA RUTA SI EN TU PROYECTO ESTÁ EN OTRO LADO

import {
  faBoxOpen,
  faCloudArrowUp,
  faFileCsv,
  faImage,
  faXmark,
  faFloppyDisk,
  faArrowUpFromBracket,
  faDownload,
  faTrashCan,
  faCircleExclamation,
  faCheckCircle,
  faBoxesStacked,
  faFilePdf,
  faPaperclip,
  faTriangleExclamation,
  faTag,
  faBarcode,
  faCubesStacked,
  faAlignLeft,
  faEye,
} from "@fortawesome/free-solid-svg-icons";

import BASE_URL from "../../../../config/config";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const EXTENSIONES_IMAGEN = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "webp",
  "tiff",
  "tif",
];

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

function buildHeadersMultipart() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

function buildHeadersGET() {
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

/* =========================
   Helpers monetarios — con centavos automáticos
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
  if (raw === "" || raw === null || raw === undefined) return "";
  const num = Number(String(raw).replace(",", "."));
  if (Number.isNaN(num)) return "";
  return num.toFixed(2);
}

/* =========================
   Helpers tipo archivo masivo
========================= */
function getTipoArchivo(nombre) {
  if (!nombre) return "";
  const ext = nombre.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  if (EXTENSIONES_IMAGEN.includes(ext)) return "imagen";
  return "";
}

function getMetodoLabel(metodo) {
  switch (metodo) {
    case "google_vision":
      return "Google Vision OCR";
    case "php_pdfparser":
      return "PDF Parser";
    case "pdf_ocr_google_vision":
      return "PDF escaneado + Google Vision OCR";
    default:
      return metodo || "No informado";
  }
}

function TipoBadge({ tipo }) {
  const map = {
    csv: { label: "CSV", cls: "cmi-badge--csv" },
    pdf: { label: "PDF", cls: "cmi-badge--pdf" },
    imagen: { label: "OCR IMG", cls: "cmi-badge--img" },
    "": { label: "NO VÁLIDO", cls: "cmi-badge--none" },
  };

  const { label, cls } = map[tipo] ?? map[""];
  return <span className={`cmi-badge ${cls}`}>{label}</span>;
}

function IconoArchivo({ tipo }) {
  if (tipo === "csv") return <FontAwesomeIcon icon={faFileCsv} />;
  if (tipo === "pdf") return <FontAwesomeIcon icon={faFilePdf} />;
  if (tipo === "imagen") return <FontAwesomeIcon icon={faImage} />;
  return <FontAwesomeIcon icon={faTriangleExclamation} />;
}

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
    <FontAwesomeIcon
      icon={faCircleExclamation}
      style={{ fontSize: 10 }}
    />
    {msg}
  </span>
);

const plantillaCsvMasivo = `nombre;sku;precio;precio_promo;stock;descripcion
SMARTWATCH MI BAND 9 XIAOMI;04163;89999;79999;12;Pulsera inteligente Xiaomi
CARGADOR UNIVERSAL NOTEBOOK - ONLY - CON FICHA HP - 8 PINES;00410;25999;;33;Cargador notebook HP
AFEITADORA CORPORAL 3 EN 1;04162;45999;39999;8;Afeitadora corporal
`;

/* =========================
   FloatingField — siempre activo
========================= */
function FloatingField({ label, icon, error, children, style }) {
  return (
    <div
      className="cmi-floatingField cmi-floatingField--active"
      style={style}
    >
      {children}
      <label className="cmi-floatingLabel cmi-floatingLabel--active">
        {icon && (
          <FontAwesomeIcon
            icon={icon}
            style={{
              marginRight: 5,
              opacity: 0.7,
              fontSize: 11,
            }}
          />
        )}
        {label}
      </label>
      {error && <ErrorMsg msg={error} />}
    </div>
  );
}

/* =========================
   PriceInput — con centavos automáticos
========================= */
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

export default function ModalCargaMasiva({
  open,
  onClose,
  onGuardado,
  onToast,
  onImportado,
}) {
  const closeBtnRef = useRef(null);
  const inputImagenRef = useRef(null);
  const fileInputMasivoRef = useRef(null);

  const [tab, setTab] = useState("individual");
  const [dark, setDark] = useState(isTemaOscuro);

  /* =========================
     Categorías
  ========================= */
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);

  /* =========================
     Loading general
  ========================= */
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const isLoading = guardando || subiendo;

  /* =========================
     Modal global de preview
  ========================= */
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMime, setPreviewMime] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Archivo");

  /* =========================
     Tab individual
  ========================= */
  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    precio: "",
    precio_promo: "",
    stock: "",
    descripcion: "",
    id_categoria_stock: "",
  });

  const [errores, setErrores] = useState({});
  const [imagenFile, setImagenFile] = useState(null);

  const imagenNombre = useMemo(() => imagenFile?.name || "", [imagenFile]);

  /* =========================
     Tab masivo
  ========================= */
  const [archivo, setArchivo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);

  const nombreArchivo = useMemo(() => archivo?.name || "", [archivo]);
  const tipoArchivo = useMemo(
    () => getTipoArchivo(archivo?.name),
    [archivo]
  );

  useEffect(() => {
    if (!open) return;

    let cancelado = false;

    const fetchCategorias = async () => {
      setLoadingCategorias(true);
      try {
        const params = new URLSearchParams({ action: "obtener_listas" });
        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: buildHeadersGET(),
        });
        const data = await res.json();

        if (!cancelado && data?.listas?.stock_categorias) {
          setCategorias(data.listas.stock_categorias);
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
  }, [open]);

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
      if (e.key === "Escape" && !isLoading && !previewOpen) onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose, isLoading, previewOpen]);

  useEffect(() => {
    if (open) {
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      resetIndividual();
      resetMasivo();
      cerrarPreview();
      setTab("individual");
    }
  }, [open]);

  function resetIndividual() {
    setForm({
      nombre: "",
      sku: "",
      precio: "",
      precio_promo: "",
      stock: "",
      descripcion: "",
      id_categoria_stock: "",
    });
    setErrores({});
    setGuardando(false);
    limpiarImagen();
  }

  function resetMasivo() {
    setArchivo(null);
    setSubiendo(false);
    setResultado(null);
    setCsvPreview([]);
    setCsvHeaders([]);
    if (fileInputMasivoRef.current) fileInputMasivoRef.current.value = "";
  }

  const cerrarPreview = () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewOpen(false);
    setPreviewUrl("");
    setPreviewMime("");
    setPreviewFileName("");
    setPreviewTitle("Archivo");
  };

  const abrirPreviewLocal = ({ file, title }) => {
    if (!file) return;

    const blobUrl = URL.createObjectURL(file);
    setPreviewUrl(blobUrl);
    setPreviewMime(file.type || "");
    setPreviewFileName(file.name || "archivo");
    setPreviewTitle(title || "Archivo");
    setPreviewOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "precio" || name === "precio_promo") {
      setForm((p) => ({ ...p, [name]: normalizeMoneyInput(value) }));
    } else if (name === "stock") {
      setForm((p) => ({ ...p, [name]: value.replace(/[^\d]/g, "") }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }

    setErrores((p) => ({ ...p, [name]: "", global: "" }));
  };

  const handleMoneyBlur = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: formatMoneyBlur(value) }));
  };

  const handleMoneyFocus = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: formatMoneyFocus(value) }));
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

    if (
      form.precio_promo &&
      (Number.isNaN(promoNum) || promoNum < 0)
    ) {
      errs.precio_promo = "Precio promo inválido";
    }

    if (
      form.stock !== "" &&
      (Number.isNaN(Number(form.stock)) || Number(form.stock) < 0)
    ) {
      errs.stock = "Stock inválido";
    }

    if (imagenFile) {
      const tipos = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      if (!tipos.includes(imagenFile.type)) {
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      }

      if (imagenFile.size > 5 * 1024 * 1024) {
        errs.imagen = "La imagen no puede superar los 5 MB";
      }
    }

    return errs;
  };

  const limpiarImagen = () => {
    setImagenFile(null);
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  };

  const tomarImagen = (file) => {
    if (!file) return;

    const tipos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!tipos.includes(file.type)) {
      setErrores((p) => ({
        ...p,
        imagen: "La imagen debe ser JPG, PNG, WEBP o GIF",
      }));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrores((p) => ({
        ...p,
        imagen: "La imagen no puede superar los 5 MB",
      }));
      return;
    }

    setImagenFile(file);
    setErrores((p) => ({ ...p, imagen: "", global: "" }));
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
      const fd = new FormData();
      fd.append("nombre", form.nombre.trim());
      fd.append("sku", form.sku.trim());
      fd.append("precio", moneyToApi(form.precio));
      fd.append(
        "precio_promo",
        form.precio_promo !== "" ? moneyToApi(form.precio_promo) : ""
      );
      fd.append("stock", form.stock !== "" ? String(form.stock) : "");
      fd.append("descripcion", form.descripcion.trim());

      if (form.id_categoria_stock !== "") {
        fd.append("id_categoria_stock", String(form.id_categoria_stock));
      }

      if (imagenFile) fd.append("imagen", imagenFile);

      const res = await fetch(`${API_URL}?action=stock_productos_crear`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: fd,
      });

      const data = await parseJsonOrThrow(res);

      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al guardar el producto");
      }

      onGuardado?.();
    } catch (err) {
      setErrores({
        global: err.message || "Error al guardar el producto",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleArchivoChange = (file) => {
    if (!file) return;

    setArchivo(file);
    setResultado(null);
    setCsvPreview([]);
    setCsvHeaders([]);
  };

  const descargarPlantilla = () => {
    const blob = new Blob([plantillaCsvMasivo], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_productos.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportar = async () => {
    if (!archivo) {
      onToast?.("error", "Seleccioná un archivo CSV, PDF o imagen.");
      return;
    }

    if (!tipoArchivo) {
      onToast?.(
        "error",
        "Formato no válido. Admitido: CSV, PDF, JPG, PNG y otros formatos de imagen."
      );
      return;
    }

    try {
      setSubiendo(true);
      setResultado(null);

      const formData = new FormData();
      let action = "";

      if (tipoArchivo === "csv") {
        action = "stock_productos_importar_csv";
        formData.append("archivo_csv", archivo);
      }

      if (tipoArchivo === "pdf") {
        action = "stock_productos_importar_pdf";
        formData.append("archivo_pdf", archivo);
      }

      if (tipoArchivo === "imagen") {
        action = "stock_productos_ocr_imagen";
        formData.append("archivo_imagen", archivo);
      }

      const res = await fetch(
        `${API_URL}?action=${encodeURIComponent(action)}`,
        {
          method: "POST",
          headers: buildHeadersMultipart(),
          body: formData,
        }
      );

      const data = await parseJsonOrThrow(res);
      setResultado(data);

      if (tipoArchivo === "csv") {
        onImportado?.(
          `Importación finalizada. Creados: ${data.creados || 0}. Actualizados: ${
            data.actualizados || 0
          }.`
        );
      } else {
        const chars = data.total_caracteres ?? 0;
        const metodo = getMetodoLabel(data.metodo);
        onToast?.(
          "success",
          `Texto extraído con ${metodo}: ${chars} caracteres.`
        );
      }
    } catch (err) {
      onToast?.("error", err.message || "Error al procesar el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  const btnMasivoLabel = subiendo
    ? tipoArchivo === "csv"
      ? "Importando..."
      : tipoArchivo === "pdf"
      ? "Extrayendo..."
      : "Procesando..."
    : tipoArchivo === "csv"
    ? "Importar productos"
    : tipoArchivo === "pdf"
    ? "Extraer texto del PDF"
    : tipoArchivo === "imagen"
    ? "Reconocer texto (OCR)"
    : "Seleccioná un archivo";

  const handleTabChange = (t) => {
    setTab(t);
    setErrores({});
  };

  if (!open) return null;

  return createPortal(
    <>
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
              <FontAwesomeIcon icon={faBoxesStacked} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Productos</h2>
              <p className="mi-modal__subtitle">
                Agregá uno por uno o importá de forma masiva
              </p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !isLoading && onClose?.()}
              aria-label="Cerrar"
              disabled={isLoading}
              type="button"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "0 20px",
              borderBottom: "1px solid var(--nv-border-md)",
              background: "var(--nv-bg)",
              flexShrink: 0,
            }}
          >
            {[
              { key: "individual", icon: faBoxOpen, label: "Individual" },
              {
                key: "masivo",
                icon: faCloudArrowUp,
                label: "Carga masiva",
              },
            ].map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "11px 16px",
                  border: "none",
                  borderBottom:
                    tab === key
                      ? "2px solid var(--nv-action)"
                      : "2px solid transparent",
                  background: "none",
                  cursor: "pointer",
                  fontWeight: tab === key ? 700 : 400,
                  color:
                    tab === key
                      ? "var(--nv-action)"
                      : "var(--nv-muted)",
                  fontSize: "0.88rem",
                  transition: "all .15s",
                  fontFamily: "inherit",
                }}
              >
                <FontAwesomeIcon icon={icon} style={{ fontSize: 13 }} />
                {label}
              </button>
            ))}
          </div>

          <div
            className="mi-modal__content"
            style={{ overflowY: "auto", padding: 20 }}
          >
            {tab === "individual" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
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
                  error={errores.nombre}
                >
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    className="cmi-input"
                    placeholder="Ej: Auriculares Bluetooth Samsung WH-1000"
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
                    />
                  </FloatingField>
                </div>

                <div className="fl-row">
                  <FloatingField
                    label="Precio *"
                    error={errores.precio}
                  >
                    <PriceInput
                      name="precio"
                      value={form.precio}
                      onChange={handleChange}
                      onBlur={handleMoneyBlur}
                      onFocus={handleMoneyFocus}
                      placeholder="0,00"
                    />
                  </FloatingField>

                  <FloatingField
                    label="Precio promocional"
                    error={errores.precio_promo}
                  >
                    <PriceInput
                      name="precio_promo"
                      value={form.precio_promo}
                      onChange={handleChange}
                      onBlur={handleMoneyBlur}
                      onFocus={handleMoneyFocus}
                      placeholder="0,00"
                    />
                  </FloatingField>
                </div>

                <FloatingField label="Categoría" icon={faTag}>
                  <select
                    name="id_categoria_stock"
                    value={form.id_categoria_stock}
                    onChange={handleChange}
                    className="cmi-input cmi-select"
                    disabled={loadingCategorias}
                  >
                    <option value="">
                      {loadingCategorias
                        ? "Cargando categorías..."
                        : "Sin categoría"}
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
                    placeholder="Breve descripción del producto (opcional)"
                    rows={3}
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
                    onChange={(e) => tomarImagen(e.target.files?.[0])}
                  />

                  {!imagenFile ? (
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost"
                      onClick={() => inputImagenRef.current?.click()}
                    >
                      <FontAwesomeIcon icon={faArrowUpFromBracket} />{" "}
                      Seleccionar imagen
                    </button>
                  ) : (
                    <div className="cmi-fileResume">
                      <div className="cmi-fileResume__left">
                        <span className="cmi-fileResume__icon">
                          <FontAwesomeIcon icon={faImage} />
                        </span>

                        <div className="cmi-fileResume__meta">
                          <div className="cmi-fileResume__name">
                            {imagenNombre}
                          </div>
                          <TipoBadge tipo="imagen" />
                        </div>
                      </div>

                      <div className="cmi-fileActions">
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() =>
                            abrirPreviewLocal({
                              file: imagenFile,
                              title: "Imagen del producto",
                            })
                          }
                          aria-label="Ver archivo"
                          title="Ver archivo"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={limpiarImagen}
                        >
                          <FontAwesomeIcon icon={faTrashCan} /> Quitar
                        </button>
                      </div>
                    </div>
                  )}

                  {errores.imagen && <ErrorMsg msg={errores.imagen} />}
                </div>
              </div>
            )}

            {tab === "masivo" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div className="cmi-uploadBox">
                  <div className="cmi-uploadBox__title">
                    <FontAwesomeIcon icon={faCloudArrowUp} /> Archivo masivo
                  </div>

                  <input
                    ref={fileInputMasivoRef}
                    type="file"
                    hidden
                    accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif"
                    onChange={(e) => handleArchivoChange(e.target.files?.[0])}
                  />

                  <div className="cmi-uploadActions">
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost"
                      onClick={() => fileInputMasivoRef.current?.click()}
                    >
                      <FontAwesomeIcon icon={faArrowUpFromBracket} />{" "}
                      Seleccionar archivo
                    </button>

                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost"
                      onClick={descargarPlantilla}
                    >
                      <FontAwesomeIcon icon={faDownload} /> Descargar plantilla
                      CSV
                    </button>
                  </div>

                  {nombreArchivo && (
                    <div className="cmi-fileResume">
                      <div className="cmi-fileResume__left">
                        <span className="cmi-fileResume__icon">
                          <IconoArchivo tipo={tipoArchivo} />
                        </span>

                        <div className="cmi-fileResume__meta">
                          <div className="cmi-fileResume__name">
                            {nombreArchivo}
                          </div>
                          <TipoBadge tipo={tipoArchivo} />
                        </div>
                      </div>

                      <div className="cmi-fileActions">
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() =>
                            abrirPreviewLocal({
                              file: archivo,
                              title: "Archivo masivo",
                            })
                          }
                          aria-label="Ver archivo"
                          title="Ver archivo"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() => {
                            setArchivo(null);
                            setResultado(null);
                            setCsvPreview([]);
                            setCsvHeaders([]);
                            if (fileInputMasivoRef.current) {
                              fileInputMasivoRef.current.value = "";
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faTrashCan} /> Quitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {resultado && tipoArchivo === "csv" && (
                  <div className="cmi-okBox">
                    <div className="cmi-okBox__title">
                      <FontAwesomeIcon
                        icon={faCheckCircle}
                        style={{ marginRight: 8 }}
                      />
                      Resultado de importación
                    </div>

                    <div className="cmi-resultGrid">
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">
                          Creados
                        </span>
                        <b className="cmi-resultItem__val cmi-resultItem__val--ok">
                          {resultado.creados ?? 0}
                        </b>
                      </div>

                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">
                          Actualizados
                        </span>
                        <b className="cmi-resultItem__val">
                          {resultado.actualizados ?? 0}
                        </b>
                      </div>
                    </div>
                  </div>
                )}

                {resultado && tipoArchivo !== "csv" && (
                  <div className="cmi-okBox">
                    <div className="cmi-okBox__title">
                      <FontAwesomeIcon
                        icon={faCheckCircle}
                        style={{ marginRight: 8 }}
                      />
                      Resultado del procesamiento
                    </div>

                    <div className="cmi-resultGrid">
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">
                          Método
                        </span>
                        <b className="cmi-resultItem__val">
                          {getMetodoLabel(resultado.metodo)}
                        </b>
                      </div>

                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">
                          Páginas
                        </span>
                        <b className="cmi-resultItem__val">
                          {resultado.total_paginas ?? 1}
                        </b>
                      </div>

                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">
                          Caracteres
                        </span>
                        <b className="cmi-resultItem__val cmi-resultItem__val--ok">
                          {resultado.total_caracteres ?? 0}
                        </b>
                      </div>
                    </div>

                    {resultado.texto_detectado && (
                      <div className="fl-field" style={{ marginTop: 12 }}>
                        <textarea
                          readOnly
                          value={resultado.texto_detectado}
                          className="fl-input cmi-textarea"
                          placeholder=" "
                        />
                        <label className="fl-label">Texto extraído</label>
                      </div>
                    )}
                  </div>
                )}

                {resultado &&
                  Array.isArray(resultado.errores) &&
                  resultado.errores.length > 0 && (
                    <div className="cmi-warnBox">
                      <div className="cmi-warnBox__title">
                        <FontAwesomeIcon
                          icon={faTriangleExclamation}
                          style={{ marginRight: 8 }}
                        />
                        Observaciones
                      </div>
                      <ul className="cmi-warnBox__list">
                        {resultado.errores.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
          </div>

          <div className="cmi-footer">
            <div className="mi-card__hint cmi-footer__hint">
              {tab === "individual" &&
                "Completá los datos del producto y guardá."}
              {tab === "masivo" &&
                tipoArchivo === "csv" &&
                "El CSV se procesará fila a fila actualizando o creando productos."}
              {tab === "masivo" &&
                tipoArchivo === "pdf" &&
                "Se extraerá el texto del PDF para revisión o importación."}
              {tab === "masivo" &&
                tipoArchivo === "imagen" &&
                "Se aplicará OCR sobre la imagen para detectar texto."}
              {tab === "masivo" &&
                tipoArchivo === "" &&
                !nombreArchivo &&
                "Seleccioná un archivo para continuar."}
              {tab === "masivo" &&
                tipoArchivo === "" &&
                nombreArchivo &&
                "El formato no es válido."}
            </div>

            <div className="cmi-footer__btns">
              <button
                type="button"
                className="mit-btn mit-btn--ghost"
                onClick={() => !isLoading && onClose?.()}
                disabled={isLoading}
              >
                Cancelar
              </button>

              {tab === "individual" ? (
                <button
                  type="button"
                  className="mit-btn mit-btn--solid"
                  onClick={handleGuardar}
                  disabled={guardando}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                  {guardando ? "Guardando..." : "Guardar producto"}
                </button>
              ) : (
                <button
                  type="button"
                  className="mit-btn mit-btn--solid"
                  onClick={handleImportar}
                  disabled={subiendo || !tipoArchivo}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <FontAwesomeIcon icon={faCloudArrowUp} />
                  {btnMasivoLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ModalVerComprobante
        open={previewOpen}
        url={previewUrl}
        mime={previewMime}
        fileName={previewFileName}
        title={previewTitle}
        onClose={cerrarPreview}
      />
    </>,
    document.body
  );
}