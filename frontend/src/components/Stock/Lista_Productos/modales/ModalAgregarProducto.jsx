import React, { useState, useRef, useMemo } from "react";
import BASE_URL from "../../../../config/config";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

/* =========================
   Helpers de autenticación
========================= */
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

/* =========================
   Componente modal
========================= */
const ModalAgregarProducto = ({ onClose, onGuardado }) => {
  const [tab, setTab] = useState("individual");

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

  // Masivo
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [subiendoMasivo, setSubiendoMasivo] = useState(false);
  const [resultadoMasivo, setResultadoMasivo] = useState(null);
  const fileInputRef = useRef();

  const imagenNombre = useMemo(() => imagenFile?.name || "", [imagenFile]);

  /* ── Individual ─────────────────────────────────────── */
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "", global: "" }));
  };

  const validar = () => {
    const errs = {};

    if (!form.nombre.trim()) {
      errs.nombre = "El nombre es obligatorio";
    }

    if (!form.precio || isNaN(form.precio) || Number(form.precio) < 0) {
      errs.precio = "Ingresá un precio válido";
    }

    if (
      form.precio_promo &&
      (isNaN(form.precio_promo) || Number(form.precio_promo) < 0)
    ) {
      errs.precio_promo = "Precio promo inválido";
    }

    if (form.stock !== "" && (isNaN(form.stock) || Number(form.stock) < 0)) {
      errs.stock = "Stock inválido";
    }

    if (imagenFile) {
      const tiposPermitidos = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      if (!tiposPermitidos.includes(imagenFile.type)) {
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      }

      const maxBytes = 5 * 1024 * 1024;
      if (imagenFile.size > maxBytes) {
        errs.imagen = "La imagen no puede superar los 5 MB";
      }
    }

    return errs;
  };

  const limpiarImagen = () => {
    if (imagenPreview) {
      URL.revokeObjectURL(imagenPreview);
    }
    setImagenFile(null);
    setImagenPreview("");
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  };

  const tomarImagen = (file) => {
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

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setErrores((prev) => ({
        ...prev,
        imagen: "La imagen no puede superar los 5 MB",
      }));
      return;
    }

    if (imagenPreview) {
      URL.revokeObjectURL(imagenPreview);
    }

    const blobUrl = URL.createObjectURL(file);
    setImagenFile(file);
    setImagenPreview(blobUrl);
    setErrores((prev) => ({ ...prev, imagen: "", global: "" }));
  };

  const handleImagenInput = (e) => {
    const file = e.target.files?.[0];
    if (file) tomarImagen(file);
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
      const formData = new FormData();
      formData.append("nombre", form.nombre.trim());
      formData.append("sku", form.sku.trim());
      formData.append("precio", String(form.precio));
      formData.append("precio_promo", form.precio_promo !== "" ? String(form.precio_promo) : "");
      formData.append("stock", form.stock !== "" ? String(form.stock) : "");
      formData.append("descripcion", form.descripcion.trim());

      if (imagenFile) {
        formData.append("imagen", imagenFile);
      }

      const res = await fetch(`${API_URL}?action=stock_productos_crear`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: formData,
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

  /* ── Masivo ──────────────────────────────────────────── */
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
      const formData = new FormData();
      formData.append("csv", csvFile);

      const res = await fetch(`${API_URL}?action=stock_productos_importar_csv`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: formData,
      });

      const data = await parseJsonOrThrow(res);

      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al procesar el CSV");
      }

      setResultadoMasivo(data);

      if ((data.insertados ?? 0) > 0) {
        onGuardado?.();
      }
    } catch (err) {
      setResultadoMasivo({ error: err.message || "Error al importar el CSV" });
    } finally {
      setSubiendoMasivo(false);
    }
  };

  const handleDescargarPlantilla = () => {
    const header =
      "nombre,sku,precio,precio_promo,stock,descripcion\n";
    const ejemplo =
      "Producto Ejemplo,SKU001,1500,1200,10,Descripción del producto\n";

    const blob = new Blob([header + ejemplo], { type: "text/csv" });
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
          maxWidth: "620px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #f0f0f0" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>
              Agregar Producto
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

          <div style={{ display: "flex", gap: "4px" }}>
            {[
              { key: "individual", label: "📦 Individual" },
              { key: "masivo", label: "📋 Carga masiva" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                style={{
                  padding: "8px 18px",
                  border: "none",
                  borderBottom:
                    tab === key ? "2px solid #4361ee" : "2px solid transparent",
                  background: "none",
                  cursor: "pointer",
                  fontWeight: tab === key ? 700 : 400,
                  color: tab === key ? "#4361ee" : "#888",
                  fontSize: "0.9rem",
                  transition: "all 0.15s",
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {tab === "individual" && (
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

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#555" }}>
                  Imagen del producto
                </label>

                <div
                  onClick={() => inputImagenRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) tomarImagen(file);
                  }}
                  style={{
                    border: `2px dashed ${errores.imagen ? "#e74c3c" : imagenFile ? "#4361ee" : "#d8d8d8"}`,
                    borderRadius: "12px",
                    background: imagenFile ? "#f4f7ff" : "#fafafa",
                    padding: "18px",
                    cursor: "pointer",
                    transition: "all .2s ease",
                  }}
                >
                  <input
                    ref={inputImagenRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    style={{ display: "none" }}
                    onChange={handleImagenInput}
                  />

                  {!imagenPreview ? (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🖼️</div>
                      <div style={{ fontWeight: 600, color: "#444", marginBottom: "4px" }}>
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
                        gridTemplateColumns: "110px 1fr auto",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <img
                        src={imagenPreview}
                        alt="Preview"
                        style={{
                          width: "110px",
                          height: "110px",
                          objectFit: "cover",
                          borderRadius: "10px",
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
                          }}
                        >
                          {imagenNombre}
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "#888", marginTop: "4px" }}>
                          {(imagenFile.size / 1024).toFixed(1)} KB
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          limpiarImagen();
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                          color: "#555",
                          fontWeight: 600,
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </div>

                {errores.imagen && (
                  <span style={{ fontSize: "0.78rem", color: "#e74c3c" }}>
                    {errores.imagen}
                  </span>
                )}
              </div>
            </div>
          )}

          {tab === "masivo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div
                style={{
                  padding: "14px 16px",
                  background: "#f0f4ff",
                  borderRadius: "10px",
                  borderLeft: "4px solid #4361ee",
                }}
              >
                <p
                  style={{
                    margin: "0 0 8px",
                    fontWeight: 600,
                    color: "#4361ee",
                    fontSize: "0.9rem",
                  }}
                >
                  📋 Instrucciones
                </p>

                <ol
                  style={{
                    margin: 0,
                    paddingLeft: "18px",
                    fontSize: "0.85rem",
                    color: "#555",
                    lineHeight: "1.7",
                  }}
                >
                  <li>Descargá la plantilla CSV</li>
                  <li>Completá los datos de tus productos</li>
                  <li>Subí el archivo completado</li>
                </ol>

                <button
                  onClick={handleDescargarPlantilla}
                  style={{
                    marginTop: "10px",
                    padding: "6px 14px",
                    background: "#4361ee",
                    color: "#fff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                  type="button"
                >
                  ⬇ Descargar plantilla CSV
                </button>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "#555",
                  }}
                >
                  Columnas esperadas en el CSV:
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
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
                        borderRadius: "20px",
                        background: col.includes("*") ? "#fff0e0" : "#f0f0f0",
                        color: col.includes("*") ? "#e67e22" : "#555",
                        fontSize: "0.8rem",
                        fontWeight: col.includes("*") ? 700 : 400,
                      }}
                    >
                      {col}
                    </span>
                  ))}
                </div>

                <p style={{ margin: "6px 0 0", fontSize: "0.75rem", color: "#999" }}>
                  * campos obligatorios
                </p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleCsvChange({ target: { files: [file] } });
                }}
                style={{
                  border: `2px dashed ${csvFile ? "#4361ee" : "#ddd"}`,
                  borderRadius: "10px",
                  padding: "30px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: csvFile ? "#f0f4ff" : "#fafafa",
                  transition: "all 0.2s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvChange}
                  style={{ display: "none" }}
                />

                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>
                  {csvFile ? "✅" : "📂"}
                </div>

                <p
                  style={{
                    margin: 0,
                    color: csvFile ? "#4361ee" : "#888",
                    fontWeight: csvFile ? 600 : 400,
                    fontSize: "0.9rem",
                  }}
                >
                  {csvFile ? csvFile.name : "Hacé click o arrastrá tu archivo CSV acá"}
                </p>

                {csvFile && (
                  <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#888" }}>
                    {(csvFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>

              {csvPreview.length > 0 && (
                <div>
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "#555",
                    }}
                  >
                    Vista previa (primeras 5 filas):
                  </p>

                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.8rem",
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f0f0f0" }}>
                          {csvHeaders.map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "6px 8px",
                                textAlign: "left",
                                color: "#555",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {csvPreview.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                            {csvHeaders.map((h) => (
                              <td
                                key={h}
                                style={{
                                  padding: "5px 8px",
                                  color: "#333",
                                  maxWidth: "120px",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {row[h] || "-"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {resultadoMasivo && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "10px",
                    background: resultadoMasivo.error ? "#fff0f0" : "#f0fff4",
                    borderLeft: `4px solid ${
                      resultadoMasivo.error ? "#e74c3c" : "#27ae60"
                    }`,
                  }}
                >
                  {resultadoMasivo.error ? (
                    <p style={{ margin: 0, color: "#e74c3c", fontSize: "0.9rem" }}>
                      ❌ {resultadoMasivo.error}
                    </p>
                  ) : (
                    <>
                      <p
                        style={{
                          margin: "0 0 4px",
                          fontWeight: 700,
                          color: "#27ae60",
                          fontSize: "0.95rem",
                        }}
                      >
                        ✅ Importación completada
                      </p>

                      <p style={{ margin: 0, color: "#555", fontSize: "0.85rem" }}>
                        Insertados: <strong>{resultadoMasivo.insertados}</strong> ·
                        Errores: <strong>{resultadoMasivo.errores}</strong>
                      </p>

                      {resultadoMasivo.mensajes_errores?.length > 0 && (
                        <ul
                          style={{
                            margin: "6px 0 0",
                            paddingLeft: "16px",
                            fontSize: "0.8rem",
                            color: "#c0392b",
                          }}
                        >
                          {resultadoMasivo.mensajes_errores.slice(0, 5).map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}

                          {resultadoMasivo.mensajes_errores.length > 5 && (
                            <li>
                              …y {resultadoMasivo.mensajes_errores.length - 5} más
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

          {tab === "individual" ? (
            <button
              onClick={handleGuardar}
              disabled={guardando}
              style={{
                padding: "9px 24px",
                borderRadius: "8px",
                border: "none",
                background: guardando ? "#a0aff7" : "#4361ee",
                color: "#fff",
                cursor: guardando ? "not-allowed" : "pointer",
                fontSize: "0.9rem",
                fontWeight: 600,
                transition: "background 0.2s",
              }}
              type="button"
            >
              {guardando ? "Guardando..." : "Guardar producto"}
            </button>
          ) : (
            <button
              onClick={handleSubirMasivo}
              disabled={!csvFile || subiendoMasivo}
              style={{
                padding: "9px 24px",
                borderRadius: "8px",
                border: "none",
                background: !csvFile || subiendoMasivo ? "#a0aff7" : "#4361ee",
                color: "#fff",
                cursor:
                  !csvFile || subiendoMasivo ? "not-allowed" : "pointer",
                fontSize: "0.9rem",
                fontWeight: 600,
                transition: "background 0.2s",
              }}
              type="button"
            >
              {subiendoMasivo ? "Importando..." : "Importar productos"}
            </button>
          )}
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

export default ModalAgregarProducto;