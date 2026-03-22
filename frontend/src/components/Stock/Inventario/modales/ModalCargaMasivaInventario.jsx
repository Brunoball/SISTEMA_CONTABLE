import React, { useMemo, useState } from "react";
import BASE_URL from "../../../../config/config";
import "../Inventario.css";

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

const plantillaCsv = `nombre;sku;precio;precio_promo;stock;descripcion
SMARTWATCH MI BAND 9 XIAOMI;04163;89999;79999;12;Pulsera inteligente Xiaomi
CARGADOR UNIVERSAL NOTEBOOK - ONLY - CON FICHA HP - 8 PINES;00410;25999;;33;Cargador notebook HP
AFEITADORA CORPORAL 3 EN 1;04162;45999;39999;8;Afeitadora corporal
`;

const ETIQUETAS = {
  csv:    { boton: "Importar inventario",      cargando: "Importando..."          },
  pdf:    { boton: "Extraer texto del PDF",    cargando: "Extrayendo texto..."    },
  imagen: { boton: "Reconocer texto (OCR)",    cargando: "Procesando imagen..."   },
  "":     { boton: "Seleccioná un archivo",    cargando: "Procesando..."          },
};

const ModalCargaMasivaInventario = ({ onClose, onImportado, onToast }) => {
  const [archivo,   setArchivo]   = useState(null);
  const [subiendo,  setSubiendo]  = useState(false);
  const [resultado, setResultado] = useState(null);

  const nombreArchivo = useMemo(() => archivo?.name || "", [archivo]);
  const tipoArchivo   = useMemo(() => getTipoArchivo(archivo?.name), [archivo]);

  const descargarPlantilla = () => {
    const blob = new Blob([plantillaCsv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
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
      onToast?.("error", "Formato no válido. Admitido: CSV, PDF, JPG, PNG y otros formatos de imagen.");
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

      const res  = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method:  "POST",
        headers: buildHeadersMultipart(),
        body:    formData,
      });

      const data = await parseJsonOrThrow(res);
      setResultado(data);

      if (tipoArchivo === "csv") {
        onImportado?.(`Importación finalizada. Creados: ${data.creados || 0}. Actualizados: ${data.actualizados || 0}.`);
      } else {
        const chars = data.total_caracteres ?? 0;
        const metodo = data.metodo === "google_vision" ? "Google Vision OCR" : "pdftotext";
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
    <div className="stock-modal-backdrop">
      <div className="stock-modal" style={{ maxWidth: 980, width: "96%" }}>

        {/* ── Header ── */}
        <div className="stock-modal-header">
          <h3>Carga masiva de inventario</h3>
          <button type="button" onClick={onClose} className="stock-modal-close">×</button>
        </div>

        {/* ── Body ── */}
        <div className="stock-modal-body">

          <p style={{ marginBottom: 12 }}>
            Cargá productos con un <strong>CSV</strong>, extraé texto de un{" "}
            <strong>PDF</strong> (vectorial), o usá <strong>OCR con imagen</strong>{" "}
            para reconocer texto en fotos o PDFs escaneados.
          </p>

          {/* Botones de acción */}
          <div className="stock-actions-row">
            <button type="button" className="stock-btn-secondary" onClick={descargarPlantilla}>
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

          {/* Archivo seleccionado */}
          <div style={{ marginBottom: 14 }}>
            <strong>Archivo:</strong>{" "}
            {nombreArchivo
              ? <>
                  {nombreArchivo}{" "}
                  <span style={{
                    fontSize: 12,
                    background: tipoArchivo === "csv" ? "#dbeafe"
                              : tipoArchivo === "pdf" ? "#fef9c3"
                              : "#dcfce7",
                    color: "#374151",
                    borderRadius: 6,
                    padding: "2px 8px",
                    marginLeft: 6,
                    fontWeight: 600,
                  }}>
                    {tipoArchivo === "csv"    && "CSV"}
                    {tipoArchivo === "pdf"    && "PDF → pdftotext"}
                    {tipoArchivo === "imagen" && "Imagen → Google Vision OCR"}
                    {tipoArchivo === ""       && "formato no soportado"}
                  </span>
                </>
              : "Ninguno seleccionado"
            }
          </div>

          {/* Info box: descripción según tipo */}
          <div className="stock-info-box">
            {tipoArchivo === "csv" && <>
              <div><strong>CSV esperado:</strong></div>
              <div>nombre; sku; precio; precio_promo; stock; descripcion</div>
            </>}

            {tipoArchivo === "pdf" && <>
              <div><strong>PDF con texto vectorial:</strong></div>
              <div>
                Se extrae el texto directamente con <code>pdftotext</code>, sin OCR ni conversión a imagen.
                Obtenés el <strong>100% del contenido</strong> en milisegundos.
              </div>
              <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>
                Si el PDF es una foto/escaneado sin texto real, usá una imagen en su lugar.
              </div>
            </>}

            {tipoArchivo === "imagen" && <>
              <div><strong>OCR con Google Vision:</strong></div>
              <div>
                La imagen se envía a Google Vision para reconocer el texto.
                Funciona con fotos de listas de precios, capturas, PDFs escaneados convertidos a imagen, etc.
              </div>
              <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>
                Formatos: JPG, PNG, GIF, BMP, WEBP, TIFF.
              </div>
            </>}

            {tipoArchivo === "" && nombreArchivo && <>
              <div style={{ color: "#dc2626" }}>
                <strong>Formato no soportado.</strong> Usá CSV, PDF o una imagen (JPG, PNG, etc.).
              </div>
            </>}

            {!nombreArchivo && <>
              <div>Seleccioná un archivo para comenzar.</div>
            </>}
          </div>

          {/* Resultado CSV */}
          {resultado && tipoArchivo === "csv" && (
            <div className="stock-info-box" style={{ marginTop: 14 }}>
              <div><strong>Resultado importación:</strong></div>
              <div>Creados: {resultado.creados || 0}</div>
              <div>Actualizados: {resultado.actualizados || 0}</div>
            </div>
          )}

          {/* Resultado PDF / Imagen */}
          {resultado && (tipoArchivo === "pdf" || tipoArchivo === "imagen") && (
            <div style={{ marginTop: 14 }}>
              <div className="stock-info-box" style={{ marginBottom: 10 }}>
                <div><strong>Resultado:</strong></div>
                <div>
                  Método:{" "}
                  <strong>
                    {resultado.metodo === "google_vision" ? "Google Vision OCR" : "pdftotext (sin OCR)"}
                  </strong>
                </div>
                <div>Páginas procesadas: {resultado.total_paginas ?? 1}</div>
                <div>Caracteres detectados: {resultado.total_caracteres ?? 0}</div>
              </div>

              <div className="stock-info-box" style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>Texto extraído:</strong>
                </div>
                <textarea
                  readOnly
                  value={resultado.texto_detectado || ""}
                  style={{
                    width: "100%",
                    minHeight: 300,
                    resize: "vertical",
                    borderRadius: 10,
                    border: "1px solid #d8dbe2",
                    padding: 12,
                    fontSize: 13,
                    lineHeight: 1.5,
                    fontFamily: "monospace",
                    background: "#f9fafb",
                    color: "#1f2937",
                  }}
                />
              </div>
            </div>
          )}

          {/* Errores / observaciones */}
          {resultado && Array.isArray(resultado.errores) && resultado.errores.length > 0 && (
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

        {/* ── Footer ── */}
        <div className="stock-modal-footer">
          <button type="button" onClick={onClose} className="stock-btn-secondary">
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