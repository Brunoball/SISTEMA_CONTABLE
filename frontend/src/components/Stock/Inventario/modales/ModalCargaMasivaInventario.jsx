import React, { useMemo, useState } from "react";
import BASE_URL from "../../../../config/config";
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

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

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

const plantillaCsv = `nombre;sku;precio;precio_promo;stock;descripcion
SMARTWATCH MI BAND 9 XIAOMI;04163;89999;79999;12;Pulsera inteligente Xiaomi
CARGADOR UNIVERSAL NOTEBOOK - ONLY - CON FICHA HP - 8 PINES;00410;25999;;33;Cargador notebook HP
AFEITADORA CORPORAL 3 EN 1;04162;45999;39999;8;Afeitadora corporal
`;

const ETIQUETAS = {
  csv: { boton: "Importar inventario", cargando: "Importando..." },
  pdf: { boton: "Extraer texto del PDF", cargando: "Extrayendo texto..." },
  imagen: { boton: "Reconocer texto (OCR)", cargando: "Procesando imagen..." },
  "": { boton: "Seleccioná un archivo", cargando: "Procesando..." },
};

const ModalCargaMasivaInventario = ({ onClose, onImportado, onToast }) => {
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const nombreArchivo = useMemo(() => archivo?.name || "", [archivo]);
  const tipoArchivo = useMemo(() => getTipoArchivo(archivo?.name), [archivo]);

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
      } else if (tipoArchivo === "pdf") {
        action = "stock_inventario_importar_pdf";
        formData.append("archivo_pdf", archivo);
      } else if (tipoArchivo === "imagen") {
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
          `Importación finalizada. Creados: ${data.creados || 0}. Actualizados: ${data.actualizados || 0}.`
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

  const etiqueta = ETIQUETAS[tipoArchivo] ?? ETIQUETAS[""];

  return (
    <div className="stock-modal-backdrop" onClick={onClose}>
      <div
        className="stock-modal stock-modal-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stock-modal-header">
          <div className="stock-modal-titleWrap">
            <h3 className="stock-modal-title">Carga masiva de inventario</h3>
            <p className="stock-modal-subtitle">
              Importación por CSV o extracción de texto desde PDF / imagen
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="stock-modal-close"
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        <div className="stock-modal-body">
          <p className="stock-modal-text">
            Cargá productos con un <strong>CSV</strong>, extraé texto de un{" "}
            <strong>PDF</strong> o utilizá <strong>OCR con imagen</strong> para
            reconocer texto en fotos, listas o capturas.
          </p>

          <div className="stock-actions-row">
            <button
              type="button"
              className="stock-btn-secondary"
              onClick={descargarPlantilla}
            >
              Descargar plantilla CSV
            </button>

            <label className="stock-btn-primary stock-file-label">
              Seleccionar archivo
              <input
                type="file"
                accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif,text/csv,application/pdf,image/*"
                className="stock-hidden-input"
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] || null);
                  setResultado(null);
                }}
              />
            </label>
          </div>

          <div className="stock-file-box">
            <strong>Archivo:</strong>{" "}
            {nombreArchivo ? (
              <>
                {nombreArchivo}
                <span
                  className={[
                    "stock-badge",
                    tipoArchivo === "csv"
                      ? "stock-badge--csv"
                      : tipoArchivo === "pdf"
                      ? "stock-badge--pdf"
                      : tipoArchivo === "imagen"
                      ? "stock-badge--img"
                      : "stock-badge--default",
                  ].join(" ")}
                >
                  {tipoArchivo === "csv" && "CSV"}
                  {tipoArchivo === "pdf" && "PDF"}
                  {tipoArchivo === "imagen" && "IMAGEN OCR"}
                  {tipoArchivo === "" && "NO SOPORTADO"}
                </span>
              </>
            ) : (
              "Ninguno seleccionado"
            )}
          </div>

          <div className="stock-info-box">
            {tipoArchivo === "csv" && (
              <>
                <div><strong>CSV esperado:</strong></div>
                <div>nombre; sku; precio; precio_promo; stock; descripcion</div>
              </>
            )}

            {tipoArchivo === "pdf" && (
              <>
                <div><strong>PDF:</strong></div>
                <div>
                  El sistema intentará leer texto real del PDF y, si es escaneado,
                  hará OCR automático con Google Vision.
                </div>
              </>
            )}

            {tipoArchivo === "imagen" && (
              <>
                <div><strong>OCR con imagen:</strong></div>
                <div>
                  El sistema reconocerá el texto contenido en la imagen seleccionada.
                </div>
              </>
            )}

            {tipoArchivo === "" && nombreArchivo && (
              <div className="stock-error-text">
                Formato no soportado. Usá CSV, PDF o imagen.
              </div>
            )}

            {!nombreArchivo && <div>Seleccioná un archivo para comenzar.</div>}
          </div>

          {resultado && tipoArchivo === "csv" && (
            <div className="stock-info-box" style={{ marginTop: 14 }}>
              <div><strong>Resultado importación:</strong></div>
              <div>Creados: {resultado.creados || 0}</div>
              <div>Actualizados: {resultado.actualizados || 0}</div>
            </div>
          )}

          {resultado && (tipoArchivo === "pdf" || tipoArchivo === "imagen") && (
            <div style={{ marginTop: 14 }}>
              <div className="stock-info-box" style={{ marginBottom: 12 }}>
                <div><strong>Resultado:</strong></div>
                <div>
                  Método: <strong>{getMetodoLabel(resultado.metodo)}</strong>
                </div>
                <div>OCR usado: {resultado.ocr_usado ? "Sí" : "No"}</div>
                <div>Páginas procesadas: {resultado.total_paginas ?? 1}</div>
                <div>Caracteres detectados: {resultado.total_caracteres ?? 0}</div>
              </div>

              <div className="stock-info-box">
                <div style={{ marginBottom: 8 }}>
                  <strong>Texto extraído:</strong>
                </div>

                <textarea
                  readOnly
                  value={resultado.texto_detectado || ""}
                  className="stock-textarea-result"
                />
              </div>
            </div>
          )}

          {resultado &&
            Array.isArray(resultado.errores) &&
            resultado.errores.length > 0 && (
              <div className="stock-warning-box">
                <strong>Observaciones / errores:</strong>
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {resultado.errores.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        <div className="stock-modal-footer">
          <button
            type="button"
            onClick={onClose}
            className="stock-btn-secondary"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleImportar}
            className="stock-btn-primary"
            disabled={subiendo || !tipoArchivo}
          >
            {subiendo ? etiqueta.cargando : etiqueta.boton}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalCargaMasivaInventario;