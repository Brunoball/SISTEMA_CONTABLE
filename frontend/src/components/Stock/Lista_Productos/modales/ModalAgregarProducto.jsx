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
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../../config/config";


const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

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
   Componente principal
========================= */
const ModalAgregarProducto = ({ onClose, onGuardado }) => {
  const [tab, setTab] = useState("individual");
  const [dark, setDark] = useState(isTemaOscuro);

  /* Dark mode observer */
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

  /* Lock scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* Escape key */
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* ── Individual form ── */
  const [form, setForm] = useState({
    nombre: "",
    sku: "",
    precio: "",
    precio_promo: "",
    stock: "",
    descripcion: "",
  });

  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState("");
  const inputImagenRef = useRef();

  /* ── Masivo ── */
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [subiendoMasivo, setSubiendoMasivo] = useState(false);
  const [resultadoMasivo, setResultadoMasivo] = useState(null);
  const fileInputRef = useRef();

  const imagenNombre = useMemo(() => imagenFile?.name || "", [imagenFile]);

  /* ── Individual handlers ── */
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "precio" || name === "precio_promo") {
      setForm((prev) => ({
        ...prev,
        [name]: normalizeMoneyInput(value),
      }));
      setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
      return;
    }

    if (name === "stock") {
      const onlyNumbers = value.replace(/[^\d]/g, "");
      setForm((prev) => ({
        ...prev,
        [name]: onlyNumbers,
      }));
      setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
  };

  const handleMoneyBlur = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: formatMoneyBlur(value),
    }));
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

    if (form.precio_promo && (Number.isNaN(promoNum) || promoNum < 0)) {
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
    if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    setImagenFile(null);
    setImagenPreview("");
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

    if (imagenPreview) URL.revokeObjectURL(imagenPreview);

    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
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
      setErrores({ global: err.message || "Error al guardar el producto" });
    } finally {
      setGuardando(false);
    }
  };

  /* ── Masivo handlers ── */
  const handleCsvChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setResultadoMasivo(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result || "";
      const lines = String(text)
        .split("\n")
        .filter((l) => l.trim());

      if (lines.length < 2) {
        setCsvHeaders([]);
        setCsvPreview([]);
        return;
      }

      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/"/g, ""));

      setCsvHeaders(headers);

      const preview = lines.slice(1, 6).map((line) => {
        const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = values[i] || "";
        });
        return obj;
      });

      setCsvPreview(preview);
    };

    reader.readAsText(file);
  };

  const handleSubirMasivo = async () => {
    if (!csvFile) return;

    setSubiendoMasivo(true);
    setResultadoMasivo(null);

    try {
      const fd = new FormData();
      fd.append("csv", csvFile);

      const res = await fetch(`${API_URL}?action=stock_productos_importar_csv`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: fd,
      });

      const data = await parseJsonOrThrow(res);
      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al procesar el CSV");
      }

      setResultadoMasivo(data);
      if ((data.insertados ?? 0) > 0) onGuardado?.();
    } catch (err) {
      setResultadoMasivo({
        error: err.message || "Error al importar el CSV",
      });
    } finally {
      setSubiendoMasivo(false);
    }
  };

  const handleDescargarPlantilla = () => {
    const blob = new Blob(
      [
        "nombre,sku,precio,precio_promo,stock,descripcion\nProducto Ejemplo,SKU001,1500,1200,10,Descripción del producto\n",
      ],
      { type: "text/csv" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_productos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTabChange = (t) => {
    setTab(t);
    setErrores({});
    setResultadoMasivo(null);
  };

  /* ── Render ── */
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
        className={["mi-modal__container", dark ? "mi-modal--dark" : ""]
          .join(" ")
          .trim()}
        role="dialog"
        aria-modal="true"
        style={{ minHeight: "auto", maxHeight: "92vh" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faBoxOpen} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Agregar Producto</h2>
          </div>

          <button
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={guardando || subiendoMasivo}
            type="button"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* ── TABS ── */}
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
            { key: "masivo", icon: faCloudArrowUp, label: "Carga masiva" },
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
                color: tab === key ? "var(--nv-action)" : "var(--nv-muted)",
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

        {/* ── CONTENT ── */}
        <div
          className="mi-modal__content"
          style={{ overflowY: "auto", padding: 20 }}
        >
          {/* ══════════ TAB: INDIVIDUAL ══════════ */}
          {tab === "individual" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {errores.global && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: "rgba(239,68,68,.08)",
                    border: "1px solid rgba(239,68,68,.25)",
                    borderRadius: 10,
                    color: "#b91c1c",
                    fontSize: "0.88rem",
                    fontWeight: 500,
                  }}
                >
                  <FontAwesomeIcon icon={faCircleExclamation} />
                  {errores.global}
                </div>
              )}

              {/* Nombre + SKU */}
              <div className="mi-row2">
                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    placeholder="Ej: Remera básica negra"
                    style={errores.nombre ? { borderColor: "#ef4444" } : {}}
                  />
                  <span className="cc-floatingLabel">Nombre *</span>
                  {errores.nombre && <ErrorMsg msg={errores.nombre} />}
                </div>

                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="sku"
                    value={form.sku}
                    onChange={handleChange}
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
                    name="precio"
                    value={form.precio}
                    onChange={handleChange}
                    onBlur={handleMoneyBlur}
                    placeholder="0,00"
                    inputMode="decimal"
                    style={errores.precio ? { borderColor: "#ef4444" } : {}}
                  />
                  <span className="cc-floatingLabel">Precio *</span>
                  {errores.precio && <ErrorMsg msg={errores.precio} />}
                </div>

                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="precio_promo"
                    value={form.precio_promo}
                    onChange={handleChange}
                    onBlur={handleMoneyBlur}
                    placeholder="0,00"
                    inputMode="decimal"
                    style={
                      errores.precio_promo ? { borderColor: "#ef4444" } : {}
                    }
                  />
                  <span className="cc-floatingLabel">Precio Promo</span>
                  {errores.precio_promo && (
                    <ErrorMsg msg={errores.precio_promo} />
                  )}
                </div>

                <div className="cc-floatingField is-active">
                  <input
                    className="cc-input cc-input--floating"
                    name="stock"
                    value={form.stock}
                    onChange={handleChange}
                    placeholder="Ej: 25"
                    inputMode="numeric"
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
                  name="descripcion"
                  value={form.descripcion}
                  onChange={handleChange}
                  placeholder="Ej: Producto de algodón, talle único, color negro"
                  rows={3}
                  style={{ resize: "vertical", minHeight: 80 , paddingTop:10}}
                />
                <span className="cc-floatingLabel">Descripción</span>
              </div>

              {/* Imagen */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    color: "var(--nv-muted)",
                  }}
                >
                  Imagen del producto
                </label>

                <div
                  onClick={() => inputImagenRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    tomarImagen(e.dataTransfer.files?.[0]);
                  }}
                  style={{
                    border: `2px dashed ${
                      errores.imagen
                        ? "#ef4444"
                        : imagenFile
                        ? "var(--nv-action)"
                        : "var(--nv-border-md)"
                    }`,
                    borderRadius: 12,
                    background: imagenFile
                      ? "var(--nv-action-10)"
                      : "var(--nv-surface)",
                    padding: 16,
                    cursor: "pointer",
                    transition: "all .2s",
                  }}
                >
                  <input
                    ref={inputImagenRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={(e) => tomarImagen(e.target.files?.[0])}
                  />

                  {!imagenPreview ? (
                    <div
                      style={{
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          background: "var(--nv-action-10)",
                          border: "1px solid var(--nv-action-18)",
                          display: "grid",
                          placeItems: "center",
                          color: "var(--nv-action)",
                          fontSize: 18,
                        }}
                      >
                        <FontAwesomeIcon icon={faImage} />
                      </div>

                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--nv-text)",
                          fontSize: "0.9rem",
                        }}
                      >
                        Arrastrá o hacé click para seleccionar
                      </div>

                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--nv-muted)",
                        }}
                      >
                        JPG, PNG, WEBP o GIF · máx. 5 MB
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "90px 1fr auto",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <img
                        src={imagenPreview}
                        alt="Preview"
                        style={{
                          width: 90,
                          height: 90,
                          objectFit: "cover",
                          borderRadius: 10,
                          border: "1px solid var(--nv-border-md)",
                        }}
                      />

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--nv-text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontSize: "0.88rem",
                          }}
                        >
                          {imagenNombre}
                        </div>

                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--nv-muted)",
                            marginTop: 4,
                          }}
                        >
                          {(imagenFile.size / 1024).toFixed(1)} KB
                        </div>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          style={{
                            marginTop: 8,
                            padding: "5px 10px",
                            fontSize: "0.78rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            inputImagenRef.current?.click();
                          }}
                        >
                          <FontAwesomeIcon
                            icon={faPencil}
                            style={{ fontSize: 10 }}
                          />{" "}
                          Cambiar
                        </button>
                      </div>

                      <button
                        type="button"
                        className="mi-filemeta__remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          limpiarImagen();
                        }}
                        title="Quitar imagen"
                        style={{ alignSelf: "flex-start" }}
                      >
                        <FontAwesomeIcon
                          icon={faTrashCan}
                          style={{ fontSize: 13 }}
                        />
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
              {/* Instrucciones */}
              <div
                style={{
                  borderLeft: "4px solid var(--nv-action)",
                  background: "var(--nv-action-10)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  border: "1px solid var(--nv-action-18)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: "var(--nv-action-18)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--nv-action)",
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    <FontAwesomeIcon icon={faFileCsv} />
                  </div>

                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--nv-action)",
                      fontSize: "0.9rem",
                    }}
                  >
                    Instrucciones
                  </span>
                </div>

                <ol
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: "0.85rem",
                    color: "var(--nv-muted)",
                    lineHeight: 1.8,
                  }}
                >
                  <li>Descargá la plantilla CSV</li>
                  <li>Completá los datos de tus productos</li>
                  <li>Subí el archivo completado</li>
                </ol>

                <button
                  onClick={handleDescargarPlantilla}
                  type="button"
                  className="mit-btn mit-btn--solid"
                  style={{
                    marginTop: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    fontSize: "0.85rem",
                  }}
                >
                  <FontAwesomeIcon icon={faDownload} />
                  Descargar plantilla CSV
                </button>
              </div>

              {/* Columnas esperadas */}
              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    color: "var(--nv-muted)",
                  }}
                >
                  Columnas esperadas
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    "nombre *",
                    "sku",
                    "precio *",
                    "precio_promo",
                    "stock",
                    "descripcion",
                  ].map((col) => (
                    <span
                      key={col}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 20,
                        background: col.includes("*")
                          ? "rgba(245,158,11,.12)"
                          : "var(--nv-surface2)",
                        color: col.includes("*")
                          ? "#b45309"
                          : "var(--nv-muted)",
                        border: `1px solid ${
                          col.includes("*")
                            ? "rgba(245,158,11,.28)"
                            : "var(--nv-border)"
                        }`,
                        fontSize: "0.78rem",
                        fontWeight: col.includes("*") ? 700 : 400,
                      }}
                    >
                      {col}
                    </span>
                  ))}
                </div>

                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: "0.72rem",
                    color: "var(--nv-muted)",
                  }}
                >
                  * campos obligatorios
                </p>
              </div>

              {/* Drop zone CSV */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleCsvChange({
                    target: { files: [e.dataTransfer.files?.[0]] },
                  });
                }}
                style={{
                  border: `2px dashed ${
                    csvFile ? "var(--nv-action)" : "var(--nv-border-md)"
                  }`,
                  borderRadius: 12,
                  padding: 28,
                  textAlign: "center",
                  cursor: "pointer",
                  background: csvFile
                    ? "var(--nv-action-10)"
                    : "var(--nv-surface)",
                  transition: "all .2s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvChange}
                  style={{ display: "none" }}
                />

                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: csvFile
                      ? "var(--nv-action-18)"
                      : "var(--nv-surface2)",
                    border: `1px solid ${
                      csvFile ? "var(--nv-action-18)" : "var(--nv-border)"
                    }`,
                    display: "grid",
                    placeItems: "center",
                    color: csvFile ? "var(--nv-action)" : "var(--nv-muted)",
                    fontSize: 20,
                  }}
                >
                  <FontAwesomeIcon
                    icon={csvFile ? faCheckCircle : faArrowUpFromBracket}
                  />
                </div>

                <p
                  style={{
                    margin: 0,
                    color: csvFile ? "var(--nv-action)" : "var(--nv-muted)",
                    fontWeight: csvFile ? 600 : 400,
                    fontSize: "0.9rem",
                  }}
                >
                  {csvFile
                    ? csvFile.name
                    : "Hacé click o arrastrá tu archivo CSV acá"}
                </p>

                {csvFile && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.78rem",
                      color: "var(--nv-muted)",
                    }}
                  >
                    {(csvFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              {/* Preview CSV */}
              {csvPreview.length > 0 && (
                <div>
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".05em",
                      color: "var(--nv-muted)",
                    }}
                  >
                    Vista previa (primeras 5 filas)
                  </p>

                  <div
                    style={{
                      overflowX: "auto",
                      border: "1px solid var(--nv-border-md)",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.8rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "var(--nv-head-bg)" }}>
                          {csvHeaders.map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "8px 10px",
                                textAlign: "left",
                                color: "var(--nv-muted)",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                fontSize: "0.76rem",
                                textTransform: "uppercase",
                                letterSpacing: ".04em",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr
                            key={i}
                            style={{ borderTop: "1px solid var(--nv-border)" }}
                          >
                            {csvHeaders.map((h) => (
                              <td
                                key={h}
                                style={{
                                  padding: "6px 10px",
                                  color: "var(--nv-text)",
                                  maxWidth: 120,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
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

              {/* Resultado masivo */}
              {resultadoMasivo && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: resultadoMasivo.error
                      ? "rgba(239,68,68,.08)"
                      : "rgba(16,185,129,.08)",
                    border: `1px solid ${
                      resultadoMasivo.error
                        ? "rgba(239,68,68,.25)"
                        : "rgba(16,185,129,.25)"
                    }`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {resultadoMasivo.error ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#b91c1c",
                        fontWeight: 500,
                        fontSize: "0.88rem",
                      }}
                    >
                      <FontAwesomeIcon icon={faCircleExclamation} />
                      {resultadoMasivo.error}
                    </div>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          color: "#057a55",
                          fontWeight: 700,
                          fontSize: "0.9rem",
                        }}
                      >
                        <FontAwesomeIcon icon={faCheckCircle} />
                        Importación completada
                      </div>

                      <p
                        style={{
                          margin: 0,
                          color: "var(--nv-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        Insertados:{" "}
                        <strong style={{ color: "#057a55" }}>
                          {resultadoMasivo.insertados}
                        </strong>
                        {" · "}
                        Errores:{" "}
                        <strong style={{ color: "#b91c1c" }}>
                          {resultadoMasivo.errores}
                        </strong>
                      </p>

                      {resultadoMasivo.mensajes_errores?.length > 0 && (
                        <ul
                          style={{
                            margin: "4px 0 0",
                            paddingLeft: 16,
                            fontSize: "0.78rem",
                            color: "#b91c1c",
                          }}
                        >
                          {resultadoMasivo.mensajes_errores
                            .slice(0, 5)
                            .map((m, i) => (
                              <li key={i}>{m}</li>
                            ))}
                          {resultadoMasivo.mensajes_errores.length > 5 && (
                            <li>
                              …y {resultadoMasivo.mensajes_errores.length - 5}{" "}
                              más
                            </li>
                          )}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="mit-actions">
          <button
            onClick={onClose}
            type="button"
            className="mit-btn mit-btn--ghost"
            disabled={guardando || subiendoMasivo}
          >
            Cancelar
          </button>

          {tab === "individual" ? (
            <button
              onClick={handleGuardar}
              disabled={guardando}
              type="button"
              className="mit-btn mit-btn--solid"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <FontAwesomeIcon icon={faFloppyDisk} />
              {guardando ? "Guardando..." : "Guardar producto"}
            </button>
          ) : (
            <button
              onClick={handleSubirMasivo}
              disabled={!csvFile || subiendoMasivo}
              type="button"
              className="mit-btn mit-btn--solid"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <FontAwesomeIcon icon={faCloudArrowUp} />
              {subiendoMasivo ? "Importando..." : "Importar productos"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ── Helper de error inline ── */
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

export default ModalAgregarProducto;