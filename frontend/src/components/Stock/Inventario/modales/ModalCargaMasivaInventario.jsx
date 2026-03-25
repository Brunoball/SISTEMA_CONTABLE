import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faXmark,
  faDownload,
  faPaperclip,
  faFileCsv,
  faFilePdf,
  faImage,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import "./modalinventario.css";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

const EXTENSIONES_IMAGEN = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif"];

function buildHeadersMultipart() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("La API devolvió una respuesta inválida.");
  }
  if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  return data;
}

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

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

const plantillaCsv = `nombre;sku;precio;precio_promo;stock;descripcion
SMARTWATCH MI BAND 9 XIAOMI;04163;89999;79999;12;Pulsera inteligente Xiaomi
CARGADOR UNIVERSAL NOTEBOOK - ONLY - CON FICHA HP - 8 PINES;00410;25999;;33;Cargador notebook HP
AFEITADORA CORPORAL 3 EN 1;04162;45999;39999;8;Afeitadora corporal
`;

/* ── Badge tipos ── */
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
  if (tipo === "csv") {
    return <FontAwesomeIcon icon={faFileCsv} />;
  }
  if (tipo === "pdf") {
    return <FontAwesomeIcon icon={faFilePdf} />;
  }
  if (tipo === "imagen") {
    return <FontAwesomeIcon icon={faImage} />;
  }
  return <FontAwesomeIcon icon={faTriangleExclamation} />;
}

/* ─────────────────────────────────────────────
   MODAL PRINCIPAL
───────────────────────────────────────────── */
export default function ModalCargaMasivaInventario({ open, onClose, onImportado, onToast }) {
  const closeBtnRef = useRef(null);

  /* dark mode */
  const [dark, setDark] = useState(isTemaOscuro);
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update);
    if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  /* body scroll lock */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  /* autofocus close btn */
  useEffect(() => {
    if (open) setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  /* state */
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const nombreArchivo = useMemo(() => archivo?.name || "", [archivo]);
  const tipoArchivo = useMemo(() => getTipoArchivo(archivo?.name), [archivo]);

  /* reset al cerrar */
  useEffect(() => {
    if (!open) {
      setArchivo(null);
      setSubiendo(false);
      setResultado(null);
    }
  }, [open]);

  /* descargar plantilla */
  const descargarPlantilla = () => {
    const blob = new Blob([plantillaCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_inventario.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* importar */
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
        action = "stock_inventario_importar_csv";
        formData.append("archivo_csv", archivo);
      }
      if (tipoArchivo === "pdf") {
        action = "stock_inventario_importar_pdf";
        formData.append("archivo_pdf", archivo);
      }
      if (tipoArchivo === "imagen") {
        action = "stock_inventario_ocr_imagen";
        formData.append("archivo_imagen", archivo);
      }

      const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: formData,
      });

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
        onToast?.("success", `Texto extraído con ${metodo}: ${chars} caracteres.`);
      }
    } catch (err) {
      onToast?.("error", err.message || "Error al procesar el archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  const btnLabel = subiendo
    ? tipoArchivo === "csv"
      ? "Importando…"
      : tipoArchivo === "pdf"
      ? "Extrayendo…"
      : "Procesando…"
    : tipoArchivo === "csv"
    ? "Importar inventario"
    : tipoArchivo === "pdf"
    ? "Extraer texto del PDF"
    : tipoArchivo === "imagen"
    ? "Reconocer texto (OCR)"
    : "Seleccioná un archivo";

  if (!open) return null;

  return createPortal(
    <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
      <div
        className={["mi-modal__container", "cmi-container", dark ? "mi-modal--dark" : ""]
          .join(" ")
          .trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faBoxesStacked} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Carga masiva de inventario</h2>
            <p className="mi-modal__subtitle">Importá por CSV o extraé texto desde PDF / imagen</p>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={() => !subiendo && onClose?.()}
            aria-label="Cerrar"
            disabled={subiendo}
            type="button"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mi-modal__content cmi-body">
          <p className="cmi-desc">
            Cargá productos con un <strong>CSV</strong>, extraé texto de un <strong>PDF</strong> o
            utilizá <strong>OCR con imagen</strong> para reconocer texto en fotos, listas o
            capturas.
          </p>

          <div className="mi-card mi-card--full cmi-section">
            <div className="mi-card__title" style={{ marginBottom: 12 }}>
              Archivo a procesar
            </div>

            <div className="cmi-topActions">
              <button
                type="button"
                className="mit-btn mit-btn--ghost"
                onClick={descargarPlantilla}
                disabled={subiendo}
              >
                <FontAwesomeIcon icon={faDownload} style={{ marginRight: 8 }} />
                Descargar plantilla CSV
              </button>

              <label
                className={`mit-btn mit-btn--solid cmi-fileLabel ${
                  subiendo ? "cmi-fileLabel--disabled" : ""
                }`}
              >
                <FontAwesomeIcon icon={faPaperclip} style={{ marginRight: 8 }} />
                Seleccionar archivo
                <input
                  type="file"
                  accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif,text/csv,application/pdf,image/*"
                  className="cmi-hiddenInput"
                  disabled={subiendo}
                  onChange={(e) => {
                    setArchivo(e.target.files?.[0] || null);
                    setResultado(null);
                  }}
                />
              </label>
            </div>

            <div className={`cmi-fileBox ${nombreArchivo ? "cmi-fileBox--has" : ""}`}>
              {nombreArchivo ? (
                <div className="cmi-fileBox__inner">
                  <div className="cmi-fileBox__icon">
                    <IconoArchivo tipo={tipoArchivo} />
                  </div>

                  <div className="cmi-fileBox__meta">
                    <span className="cmi-fileBox__name">{nombreArchivo}</span>
                    <span className="cmi-fileBox__size">
                      {archivo ? (archivo.size / 1024).toFixed(1) + " KB" : ""}
                    </span>
                  </div>

                  <TipoBadge tipo={tipoArchivo} />
                </div>
              ) : (
                <span className="cmi-fileBox__empty">Ningún archivo seleccionado</span>
              )}
            </div>
          </div>

          {nombreArchivo && (
            <div className="mi-card mi-card--full cmi-section">
              <div className="mi-card__title" style={{ marginBottom: 8 }}>
                {tipoArchivo === "csv" && "Formato CSV"}
                {tipoArchivo === "pdf" && "Procesamiento PDF"}
                {tipoArchivo === "imagen" && "OCR de imagen"}
                {tipoArchivo === "" && "Formato no soportado"}
              </div>

              <div className={`cmi-infoBox ${tipoArchivo === "" ? "cmi-infoBox--error" : ""}`}>
                {tipoArchivo === "csv" && (
                  <>
                    <div className="cmi-infoBox__line cmi-infoBox__line--head">
                      Columnas esperadas:
                    </div>
                    <code className="cmi-code">
                      nombre; sku; precio; precio_promo; stock; descripcion
                    </code>
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

          {resultado && tipoArchivo === "csv" && (
            <div className="mi-card mi-card--full cmi-section">
              <div className="mi-card__title" style={{ marginBottom: 10 }}>
                Resultado de importación
              </div>

              <div className="cmi-resultGrid">
                <div className="cmi-resultItem">
                  <span className="cmi-resultItem__label">Creados</span>
                  <b className="cmi-resultItem__val cmi-resultItem__val--ok">
                    {resultado.creados || 0}
                  </b>
                </div>

                <div className="cmi-resultItem">
                  <span className="cmi-resultItem__label">Actualizados</span>
                  <b className="cmi-resultItem__val cmi-resultItem__val--upd">
                    {resultado.actualizados || 0}
                  </b>
                </div>
              </div>
            </div>
          )}

          {resultado && (tipoArchivo === "pdf" || tipoArchivo === "imagen") && (
            <div className="mi-card mi-card--full cmi-section">
              <div className="mi-card__title" style={{ marginBottom: 10 }}>
                Resultado de extracción
              </div>

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

          {resultado && Array.isArray(resultado.errores) && resultado.errores.length > 0 && (
            <div className="cmi-warnBox">
              <div className="cmi-warnBox__title">
                <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: 8 }} />
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

        <div className="cmi-footer">
          <div className="mi-card__hint cmi-footer__hint">
            {tipoArchivo === "csv" &&
              "El CSV se procesará fila a fila actualizando o creando productos."}
            {tipoArchivo === "pdf" &&
              "Se extraerá el texto del PDF para revisión o importación."}
            {tipoArchivo === "imagen" &&
              "Se aplicará OCR sobre la imagen para detectar texto."}
            {tipoArchivo === "" && !nombreArchivo && "Seleccioná un archivo para continuar."}
            {tipoArchivo === "" && nombreArchivo && "El formato no es válido."}
          </div>

          <div className="cmi-footer__btns">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={() => !subiendo && onClose?.()}
              disabled={subiendo}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={handleImportar}
              disabled={subiendo || !tipoArchivo}
            >
              {btnLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}