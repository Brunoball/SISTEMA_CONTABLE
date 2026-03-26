import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  faPencil,
  faCircleExclamation,
  faCheckCircle,
  faBoxesStacked,
  faFilePdf,
  faPaperclip,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../../config/config";


const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const EXTENSIONES_IMAGEN = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif"];

/* =========================
   Dark mode helper
========================= */
function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

/* =========================
   Auth helpers
========================= */
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
  if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  return data;
}

/* =========================
   Helpers monetarios
========================= */
function normalizeMoneyInput(raw = "") {
  let value = String(raw).replace(/[^\d,.-]/g, "");
  value = value.replace(/\./g, ",");
  const firstComma = value.indexOf(",");
  if (firstComma !== -1) {
    value =
      value.slice(0, firstComma + 1) +
      value.slice(firstComma + 1).replace(/,/g, "");
  }
  const parts = value.split(",");
  if (parts.length > 1) {
    parts[1] = parts[1].slice(0, 2);
    value = `${parts[0]}${parts[1] !== undefined ? `,${parts[1]}` : ""}`;
  }
  return value;
}

function formatMoneyBlur(raw = "") {
  const cleaned = normalizeMoneyInput(raw).trim();
  if (!cleaned) return "";
  const normalized = cleaned.replace(",", ".");
  const num = Number(normalized);
  if (Number.isNaN(num) || num < 0) return "";
  return num.toFixed(2).replace(".", ",");
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
    case "google_vision":       return "Google Vision OCR";
    case "php_pdfparser":       return "PDF Parser";
    case "pdf_ocr_google_vision": return "PDF escaneado + Google Vision OCR";
    default: return metodo || "No informado";
  }
}

/* ── Badge tipo archivo ── */
function TipoBadge({ tipo }) {
  const map = {
    csv:    { label: "CSV",      cls: "cmi-badge--csv"  },
    pdf:    { label: "PDF",      cls: "cmi-badge--pdf"  },
    imagen: { label: "OCR IMG",  cls: "cmi-badge--img"  },
    "":     { label: "NO VÁLIDO",cls: "cmi-badge--none" },
  };
  const { label, cls } = map[tipo] ?? map[""];
  return <span className={`cmi-badge ${cls}`}>{label}</span>;
}

function IconoArchivo({ tipo }) {
  if (tipo === "csv")    return <FontAwesomeIcon icon={faFileCsv} />;
  if (tipo === "pdf")    return <FontAwesomeIcon icon={faFilePdf} />;
  if (tipo === "imagen") return <FontAwesomeIcon icon={faImage} />;
  return <FontAwesomeIcon icon={faTriangleExclamation} />;
}

/* ── Helper error inline ── */
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

/* =========================
   Plantillas CSV
========================= */
const plantillaCsvMasivo = `nombre;sku;precio;precio_promo;stock;descripcion
SMARTWATCH MI BAND 9 XIAOMI;04163;89999;79999;12;Pulsera inteligente Xiaomi
CARGADOR UNIVERSAL NOTEBOOK - ONLY - CON FICHA HP - 8 PINES;00410;25999;;33;Cargador notebook HP
AFEITADORA CORPORAL 3 EN 1;04162;45999;39999;8;Afeitadora corporal
`;

/* =========================
   Componente principal
========================= */
export default function ModalCargaMasiva({ open, onClose, onGuardado, onToast, onImportado }) {
  const closeBtnRef = useRef(null);
  const [tab, setTab]   = useState("individual");
  const [dark, setDark] = useState(isTemaOscuro);

  /* Dark mode observer */
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update);
    if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  /* Body scroll lock */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && !isLoading && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  /* Autofocus close btn */
  useEffect(() => {
    if (open) setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  /* Reset todo al cerrar */
  useEffect(() => {
    if (!open) {
      resetIndividual();
      resetMasivo();
      setTab("individual");
    }
  }, [open]);

  /* ─────────────────────────────────
     TAB INDIVIDUAL
  ───────────────────────────────── */
  const [form, setForm] = useState({
    nombre: "", sku: "", precio: "", precio_promo: "", stock: "", descripcion: "",
  });
  const [errores,       setErrores]       = useState({});
  const [guardando,     setGuardando]     = useState(false);
  const [imagenFile,    setImagenFile]    = useState(null);
  const [imagenPreview, setImagenPreview] = useState("");
  const inputImagenRef = useRef();

  const imagenNombre = useMemo(() => imagenFile?.name || "", [imagenFile]);

  function resetIndividual() {
    setForm({ nombre: "", sku: "", precio: "", precio_promo: "", stock: "", descripcion: "" });
    setErrores({});
    setGuardando(false);
    limpiarImagen();
  }

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

  const validar = () => {
    const errs = {};
    const precioNum = Number(String(form.precio || "").replace(",", "."));
    const promoNum  = form.precio_promo !== "" ? Number(String(form.precio_promo).replace(",", ".")) : null;
    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio";
    if (!form.precio || Number.isNaN(precioNum) || precioNum < 0) errs.precio = "Ingresá un precio válido";
    if (form.precio_promo && (Number.isNaN(promoNum) || promoNum < 0)) errs.precio_promo = "Precio promo inválido";
    if (form.stock !== "" && (Number.isNaN(Number(form.stock)) || Number(form.stock) < 0)) errs.stock = "Stock inválido";
    if (imagenFile) {
      const tipos = ["image/jpeg","image/jpg","image/png","image/webp","image/gif"];
      if (!tipos.includes(imagenFile.type)) errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      if (imagenFile.size > 5 * 1024 * 1024) errs.imagen = "La imagen no puede superar los 5 MB";
    }
    return errs;
  };

  const limpiarImagen = () => {
    if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    setImagenFile(null);
    setImagenPreview("");
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  };

  const tomarImagen = (file) => {
    if (!file) return;
    const tipos = ["image/jpeg","image/jpg","image/png","image/webp","image/gif"];
    if (!tipos.includes(file.type)) {
      setErrores((p) => ({ ...p, imagen: "La imagen debe ser JPG, PNG, WEBP o GIF" }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrores((p) => ({ ...p, imagen: "La imagen no puede superar los 5 MB" }));
      return;
    }
    if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
    setErrores((p) => ({ ...p, imagen: "", global: "" }));
  };

  const handleGuardar = async () => {
    const errs = validar();
    if (Object.keys(errs).length > 0) { setErrores(errs); return; }
    setGuardando(true);
    setErrores({});
    try {
      const fd = new FormData();
      fd.append("nombre",      form.nombre.trim());
      fd.append("sku",         form.sku.trim());
      fd.append("precio",      moneyToApi(form.precio));
      fd.append("precio_promo",form.precio_promo !== "" ? moneyToApi(form.precio_promo) : "");
      fd.append("stock",       form.stock !== "" ? String(form.stock) : "");
      fd.append("descripcion", form.descripcion.trim());
      if (imagenFile) fd.append("imagen", imagenFile);

      const res  = await fetch(`${API_URL}?action=stock_productos_crear`, {
        method: "POST", headers: buildHeadersMultipart(), body: fd,
      });
      const data = await parseJsonOrThrow(res);
      if (data.exito === false) throw new Error(data.mensaje || "Error al guardar el producto");
      onGuardado?.();
    } catch (err) {
      setErrores({ global: err.message || "Error al guardar el producto" });
    } finally {
      setGuardando(false);
    }
  };

  /* ─────────────────────────────────
     TAB MASIVO
  ───────────────────────────────── */
  const [archivo,        setArchivo]        = useState(null);
  const [subiendo,       setSubiendo]       = useState(false);
  const [resultado,      setResultado]      = useState(null);
  const [csvPreview,     setCsvPreview]     = useState([]);
  const [csvHeaders,     setCsvHeaders]     = useState([]);
  const fileInputMasivoRef = useRef();

  const nombreArchivo = useMemo(() => archivo?.name || "", [archivo]);
  const tipoArchivo   = useMemo(() => getTipoArchivo(archivo?.name), [archivo]);

  function resetMasivo() {
    setArchivo(null);
    setSubiendo(false);
    setResultado(null);
    setCsvPreview([]);
    setCsvHeaders([]);
  }

  const handleArchivoChange = (file) => {
    if (!file) return;
    setArchivo(file);
    setResultado(null);
    setCsvPreview([]);
    setCsvHeaders([]);

    /* preview solo para CSV */
    const tipo = getTipoArchivo(file.name);
    if (tipo !== "csv") return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text  = ev.target?.result || "";
      const lines = String(text).split("\n").filter((l) => l.trim());
      if (lines.length < 2) return;

      /* intenta separar por ; primero, luego por , */
      const sep     = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map((h) => h.trim().replace(/"/g, ""));
      setCsvHeaders(headers);

      const preview = lines.slice(1, 6).map((line) => {
        const values = line.split(sep).map((v) => v.trim().replace(/"/g, ""));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ""; });
        return obj;
      });
      setCsvPreview(preview);
    };
    reader.readAsText(file);
  };

  const descargarPlantilla = () => {
    const blob = new Blob([plantillaCsvMasivo], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "plantilla_inventario.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportar = async () => {
    if (!archivo) { onToast?.("error", "Seleccioná un archivo CSV, PDF o imagen."); return; }
    if (!tipoArchivo) {
      onToast?.("error","Formato no válido. Admitido: CSV, PDF, JPG, PNG y otros formatos de imagen.");
      return;
    }

    try {
      setSubiendo(true);
      setResultado(null);

      const formData = new FormData();
      let action = "";

      if (tipoArchivo === "csv")    { action = "stock_inventario_importar_csv";  formData.append("archivo_csv",    archivo); }
      if (tipoArchivo === "pdf")    { action = "stock_inventario_importar_pdf";  formData.append("archivo_pdf",    archivo); }
      if (tipoArchivo === "imagen") { action = "stock_inventario_ocr_imagen";    formData.append("archivo_imagen", archivo); }

      const res  = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method: "POST", headers: buildHeadersMultipart(), body: formData,
      });
      const data = await parseJsonOrThrow(res);
      setResultado(data);

      if (tipoArchivo === "csv") {
        onImportado?.(`Importación finalizada. Creados: ${data.creados || 0}. Actualizados: ${data.actualizados || 0}.`);
      } else {
        const chars  = data.total_caracteres ?? 0;
        const metodo = getMetodoLabel(data.metodo);
        onToast?.("success", `Texto extraído con ${metodo}: ${chars} caracteres.`);
      }
    } catch (err) {
      onToast?.("error", err.message || "Error al procesar el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  /* ─────────────────────────────────
     Derivados
  ───────────────────────────────── */
  const isLoading = guardando || subiendo;

  const btnMasivoLabel = subiendo
    ? tipoArchivo === "csv"    ? "Importando…"
    : tipoArchivo === "pdf"    ? "Extrayendo…"
    : "Procesando…"
    : tipoArchivo === "csv"    ? "Importar inventario"
    : tipoArchivo === "pdf"    ? "Extraer texto del PDF"
    : tipoArchivo === "imagen" ? "Reconocer texto (OCR)"
    : "Seleccioná un archivo";

  const handleTabChange = (t) => {
    setTab(t);
    setErrores({});
  };

  if (!open) return null;

  /* ─────────────────────────────────
     RENDER
  ───────────────────────────────── */
  return createPortal(
    <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
      <div
        className={["mi-modal__container", "cmi-container", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        style={{ minHeight: "auto", maxHeight: "92vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faBoxesStacked} />
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Productos</h2>
            <p className="mi-modal__subtitle">Agregá uno por uno o importá de forma masiva</p>
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

        {/* ── TABS ── */}
        <div
          style={{
            display: "flex", gap: 4, padding: "0 20px",
            borderBottom: "1px solid var(--nv-border-md)",
            background: "var(--nv-bg)", flexShrink: 0,
          }}
        >
          {[
            { key: "individual", icon: faBoxOpen,      label: "Individual"    },
            { key: "masivo",     icon: faCloudArrowUp,  label: "Carga masiva" },
          ].map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              type="button"
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "11px 16px", border: "none",
                borderBottom: tab === key ? "2px solid var(--nv-action)" : "2px solid transparent",
                background: "none", cursor: "pointer",
                fontWeight: tab === key ? 700 : 400,
                color: tab === key ? "var(--nv-action)" : "var(--nv-muted)",
                fontSize: "0.88rem", transition: "all .15s", fontFamily: "inherit",
              }}
            >
              <FontAwesomeIcon icon={icon} style={{ fontSize: 13 }} />
              {label}
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div className="mi-modal__content" style={{ overflowY: "auto", padding: 20 }}>

          {/* ══════════ TAB: INDIVIDUAL ══════════ */}
          {tab === "individual" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {errores.global && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)",
                  borderRadius: 10, color: "#b91c1c", fontSize: "0.88rem", fontWeight: 500,
                }}>
                  <FontAwesomeIcon icon={faCircleExclamation} />
                  {errores.global}
                </div>
              )}

              {/* Nombre + SKU */}
              <div className="mi-row2">
                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="nombre" value={form.nombre} onChange={handleChange}
                    placeholder="Ej: Remera básica negra"
                    style={errores.nombre ? { borderColor: "#ef4444" } : {}}
                  />
                  <span className="cc-floatingLabel">Nombre *</span>
                  {errores.nombre && <ErrorMsg msg={errores.nombre} />}
                </div>
                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="sku" value={form.sku} onChange={handleChange}
                    placeholder="Ej: REM-NEG-001"
                  />
                  <span className="cc-floatingLabel">SKU</span>
                </div>
              </div>

              {/* Precio + Precio promo + Stock */}
              <div className="mi-row3">
                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="precio" value={form.precio}
                    onChange={handleChange} onBlur={handleMoneyBlur}
                    placeholder="0,00" inputMode="decimal"
                    style={errores.precio ? { borderColor: "#ef4444" } : {}}
                  />
                  <span className="cc-floatingLabel">Precio *</span>
                  {errores.precio && <ErrorMsg msg={errores.precio} />}
                </div>
                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="precio_promo" value={form.precio_promo}
                    onChange={handleChange} onBlur={handleMoneyBlur}
                    placeholder="0,00" inputMode="decimal"
                    style={errores.precio_promo ? { borderColor: "#ef4444" } : {}}
                  />
                  <span className="cc-floatingLabel">Precio Promo</span>
                  {errores.precio_promo && <ErrorMsg msg={errores.precio_promo} />}
                </div>
                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="stock" value={form.stock}
                    onChange={handleChange}
                    placeholder="Ej: 25" inputMode="numeric"
                    style={errores.stock ? { borderColor: "#ef4444" } : {}}
                  />
                  <span className="cc-floatingLabel">Stock</span>
                  {errores.stock && <ErrorMsg msg={errores.stock} />}
                </div>
              </div>

              {/* Descripción */}
              <div className="cc-floatingField is-active">
                <textarea
                  className="cc-input cc-input--floating"
                  name="descripcion" value={form.descripcion} onChange={handleChange}
                  placeholder="Ej: Producto de algodón, talle único, color negro"
                  rows={3} style={{ resize: "vertical", minHeight: 80, paddingTop: 10 }}
                />
                <span className="cc-floatingLabel">Descripción</span>
              </div>

              {/* Imagen */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{
                  fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: ".06em", color: "var(--nv-muted)",
                }}>
                  Imagen del producto
                </label>
                <div
                  onClick={() => inputImagenRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); tomarImagen(e.dataTransfer.files?.[0]); }}
                  style={{
                    border: `2px dashed ${errores.imagen ? "#ef4444" : imagenFile ? "var(--nv-action)" : "var(--nv-border-md)"}`,
                    borderRadius: 12,
                    background: imagenFile ? "var(--nv-action-10)" : "var(--nv-surface)",
                    padding: 16, cursor: "pointer", transition: "all .2s",
                  }}
                >
                  <input
                    ref={inputImagenRef} type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={(e) => tomarImagen(e.target.files?.[0])}
                  />
                  {!imagenPreview ? (
                    <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: "var(--nv-action-10)", border: "1px solid var(--nv-action-18)",
                        display: "grid", placeItems: "center",
                        color: "var(--nv-action)", fontSize: 18,
                      }}>
                        <FontAwesomeIcon icon={faImage} />
                      </div>
                      <div style={{ fontWeight: 600, color: "var(--nv-text)", fontSize: "0.9rem" }}>
                        Arrastrá o hacé click para seleccionar
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--nv-muted)" }}>
                        JPG, PNG, WEBP o GIF · máx. 5 MB
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 12, alignItems: "center" }}>
                      <img
                        src={imagenPreview} alt="Preview"
                        style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, border: "1px solid var(--nv-border-md)" }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--nv-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.88rem" }}>
                          {imagenNombre}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "var(--nv-muted)", marginTop: 4 }}>
                          {(imagenFile.size / 1024).toFixed(1)} KB
                        </div>
                        <button
                          type="button" className="mit-btn mit-btn--ghost"
                          style={{ marginTop: 8, padding: "5px 10px", fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                          onClick={(e) => { e.stopPropagation(); inputImagenRef.current?.click(); }}
                        >
                          <FontAwesomeIcon icon={faPencil} style={{ fontSize: 10 }} /> Cambiar
                        </button>
                      </div>
                      <button
                        type="button" className="mi-filemeta__remove"
                        onClick={(e) => { e.stopPropagation(); limpiarImagen(); }}
                        title="Quitar imagen" style={{ alignSelf: "flex-start" }}
                      >
                        <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 13 }} />
                      </button>
                    </div>
                  )}
                </div>
                {errores.imagen && <ErrorMsg msg={errores.imagen} />}
              </div>
            </div>
          )}

          {/* ══════════ TAB: MASIVO ══════════ */}
          {tab === "masivo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p className="cmi-desc">
                Cargá productos con un <strong>CSV</strong>, extraé texto de un <strong>PDF</strong> o
                utilizá <strong>OCR con imagen</strong> para reconocer texto en fotos, listas o capturas.
              </p>

              {/* Seleccionar archivo */}
              <div className="mi-card mi-card--full cmi-section">
                <div className="mi-card__title" style={{ marginBottom: 12 }}>Archivo a procesar</div>
                <div className="cmi-topActions">
                  <button type="button" className="mit-btn mit-btn--ghost" onClick={descargarPlantilla} disabled={subiendo}>
                    <FontAwesomeIcon icon={faDownload} style={{ marginRight: 8 }} />
                    Descargar plantilla CSV
                  </button>
                  <label className={`mit-btn mit-btn--solid cmi-fileLabel ${subiendo ? "cmi-fileLabel--disabled" : ""}`}>
                    <FontAwesomeIcon icon={faPaperclip} style={{ marginRight: 8 }} />
                    Seleccionar archivo
                    <input
                      ref={fileInputMasivoRef}
                      type="file"
                      accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif,text/csv,application/pdf,image/*"
                      className="cmi-hiddenInput"
                      disabled={subiendo}
                      onChange={(e) => handleArchivoChange(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                <div
                  className={`cmi-fileBox ${nombreArchivo ? "cmi-fileBox--has" : ""}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => !subiendo && fileInputMasivoRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); handleArchivoChange(e.dataTransfer.files?.[0]); }}
                >
                  {nombreArchivo ? (
                    <div className="cmi-fileBox__inner">
                      <div className="cmi-fileBox__icon"><IconoArchivo tipo={tipoArchivo} /></div>
                      <div className="cmi-fileBox__meta">
                        <span className="cmi-fileBox__name">{nombreArchivo}</span>
                        <span className="cmi-fileBox__size">{archivo ? (archivo.size / 1024).toFixed(1) + " KB" : ""}</span>
                      </div>
                      <TipoBadge tipo={tipoArchivo} />
                    </div>
                  ) : (
                    <span className="cmi-fileBox__empty">Ningún archivo seleccionado — hacé click o arrastrá acá</span>
                  )}
                </div>
              </div>

              {/* Info según tipo */}
              {nombreArchivo && (
                <div className="mi-card mi-card--full cmi-section">
                  <div className="mi-card__title" style={{ marginBottom: 8 }}>
                    {tipoArchivo === "csv"    && "Formato CSV"}
                    {tipoArchivo === "pdf"    && "Procesamiento PDF"}
                    {tipoArchivo === "imagen" && "OCR de imagen"}
                    {tipoArchivo === ""       && "Formato no soportado"}
                  </div>
                  <div className={`cmi-infoBox ${tipoArchivo === "" ? "cmi-infoBox--error" : ""}`}>
                    {tipoArchivo === "csv" && (
                      <>
                        <div className="cmi-infoBox__line cmi-infoBox__line--head">Columnas esperadas:</div>
                        <code className="cmi-code">nombre; sku; precio; precio_promo; stock; descripcion</code>
                      </>
                    )}
                    {tipoArchivo === "pdf" && (
                      <div className="cmi-infoBox__line">
                        El sistema intentará leer texto real del PDF y, si es escaneado, realizará OCR
                        automático con <strong>Google Vision</strong>.
                      </div>
                    )}
                    {tipoArchivo === "imagen" && (
                      <div className="cmi-infoBox__line">
                        El sistema reconocerá el texto contenido en la imagen seleccionada utilizando{" "}
                        <strong>Google Vision OCR</strong>.
                      </div>
                    )}
                    {tipoArchivo === "" && (
                      <div className="cmi-infoBox__line cmi-infoBox__line--err">
                        <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: 8 }} />
                        Formato no soportado. Usá CSV, PDF o imagen (JPG, PNG, WEBP…).
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Preview CSV */}
              {csvPreview.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--nv-muted)" }}>
                    Vista previa (primeras 5 filas)
                  </p>
                  <div style={{ overflowX: "auto", border: "1px solid var(--nv-border-md)", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ background: "var(--nv-head-bg)" }}>
                          {csvHeaders.map((h) => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--nv-muted)", fontWeight: 700, whiteSpace: "nowrap", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: ".04em" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i} style={{ borderTop: "1px solid var(--nv-border)" }}>
                            {csvHeaders.map((h) => (
                              <td key={h} style={{ padding: "6px 10px", color: "var(--nv-text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {row[h] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Resultado CSV */}
              {resultado && tipoArchivo === "csv" && (
                <div className="mi-card mi-card--full cmi-section">
                  <div className="mi-card__title" style={{ marginBottom: 10 }}>Resultado de importación</div>
                  <div className="cmi-resultGrid">
                    <div className="cmi-resultItem">
                      <span className="cmi-resultItem__label">Creados</span>
                      <b className="cmi-resultItem__val cmi-resultItem__val--ok">{resultado.creados || 0}</b>
                    </div>
                    <div className="cmi-resultItem">
                      <span className="cmi-resultItem__label">Actualizados</span>
                      <b className="cmi-resultItem__val cmi-resultItem__val--upd">{resultado.actualizados || 0}</b>
                    </div>
                  </div>
                </div>
              )}

              {/* Resultado PDF / imagen */}
              {resultado && (tipoArchivo === "pdf" || tipoArchivo === "imagen") && (
                <div className="mi-card mi-card--full cmi-section">
                  <div className="mi-card__title" style={{ marginBottom: 10 }}>Resultado de extracción</div>
                  <div className="cmi-resultGrid cmi-resultGrid--3">
                    <div className="cmi-resultItem">
                      <span className="cmi-resultItem__label">Método</span>
                      <b className="cmi-resultItem__val">{getMetodoLabel(resultado.metodo)}</b>
                    </div>
                    <div className="cmi-resultItem">
                      <span className="cmi-resultItem__label">Páginas</span>
                      <b className="cmi-resultItem__val">{resultado.total_paginas ?? 1}</b>
                    </div>
                    <div className="cmi-resultItem">
                      <span className="cmi-resultItem__label">Caracteres</span>
                      <b className="cmi-resultItem__val cmi-resultItem__val--ok">{resultado.total_caracteres ?? 0}</b>
                    </div>
                  </div>
                  {resultado.texto_detectado && (
                    <div className="fl-field" style={{ marginTop: 12 }}>
                      <textarea readOnly value={resultado.texto_detectado} className="fl-input cmi-textarea" placeholder=" " />
                      <label className="fl-label">Texto extraído</label>
                    </div>
                  )}
                </div>
              )}

              {/* Errores/observaciones */}
              {resultado && Array.isArray(resultado.errores) && resultado.errores.length > 0 && (
                <div className="cmi-warnBox">
                  <div className="cmi-warnBox__title">
                    <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: 8 }} />
                    Observaciones
                  </div>
                  <ul className="cmi-warnBox__list">
                    {resultado.errores.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="cmi-footer">
          <div className="mi-card__hint cmi-footer__hint">
            {tab === "individual" && "Completá los datos del producto y guardá."}
            {tab === "masivo" && tipoArchivo === "csv"    && "El CSV se procesará fila a fila actualizando o creando productos."}
            {tab === "masivo" && tipoArchivo === "pdf"    && "Se extraerá el texto del PDF para revisión o importación."}
            {tab === "masivo" && tipoArchivo === "imagen" && "Se aplicará OCR sobre la imagen para detectar texto."}
            {tab === "masivo" && tipoArchivo === "" && !nombreArchivo && "Seleccioná un archivo para continuar."}
            {tab === "masivo" && tipoArchivo === "" && nombreArchivo  && "El formato no es válido."}
          </div>

          <div className="cmi-footer__btns">
            <button
              type="button" className="mit-btn mit-btn--ghost"
              onClick={() => !isLoading && onClose?.()}
              disabled={isLoading}
            >
              Cancelar
            </button>

            {tab === "individual" ? (
              <button
                type="button" className="mit-btn mit-btn--solid"
                onClick={handleGuardar} disabled={guardando}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <FontAwesomeIcon icon={faFloppyDisk} />
                {guardando ? "Guardando..." : "Guardar producto"}
              </button>
            ) : (
              <button
                type="button" className="mit-btn mit-btn--solid"
                onClick={handleImportar}
                disabled={subiendo || !tipoArchivo}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <FontAwesomeIcon icon={faCloudArrowUp} />
                {btnMasivoLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}