import React, { useState } from "react";
import "./R2TestUploader.css";
import BASE_URL from "../../../config/config";

// ✅ Mismo patrón que Stock.jsx
const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

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

async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${res.status}: Sesión vencida o no autorizada. Volvé a iniciar sesión.`);
  }
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 400 ? `${text.slice(0, 400)}...` : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }
}

async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeadersGET(),
    cache: "no-store",
  });
  return await parseJsonOrThrow(res);
}

async function apiPost(url, body) {
  const { action, ...rest } = body ?? {};
  const finalUrl = action ? `${url}?action=${encodeURIComponent(action)}` : url;
  const res = await fetch(finalUrl, {
    method: "POST",
    headers: buildHeadersJSON(),
    body: JSON.stringify(rest),
  });
  return await parseJsonOrThrow(res);
}

function esImagen(nombre = "") {
  return /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(String(nombre));
}

function esPdf(nombre = "") {
  return /\.pdf$/i.test(String(nombre));
}

export default function R2TestUploader() {
  const [archivo, setArchivo] = useState(null);
  const [previewLocal, setPreviewLocal] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [archivoDB, setArchivoDB] = useState(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0] || null;

    if (previewLocal) {
      try { URL.revokeObjectURL(previewLocal); } catch {}
    }

    setArchivo(file);
    setArchivoDB(null);
    setMensaje("");

    if (file && esImagen(file.name)) {
      try { setPreviewLocal(URL.createObjectURL(file)); } catch {}
    } else {
      setPreviewLocal("");
    }
  };

  const subirArchivo = async () => {
    if (!archivo) {
      setMensaje("Seleccioná un archivo primero.");
      return;
    }

    setSubiendo(true);
    setMensaje("");
    setArchivoDB(null);

    try {
      // 1) Pedir URL firmada al backend
      // presign_upload.php espera: file_name, content_type, size_bytes
      const presignData = await apiPost(API_URL, {
        action: "r2_test_presign_upload",
        file_name: archivo.name,
        content_type: archivo.type || "application/octet-stream",
        size_bytes: archivo.size,
      });

      if (!presignData?.exito) {
        throw new Error(presignData?.mensaje || "No se pudo generar la URL firmada.");
      }

      // El backend responde: { exito: true, data: { key, upload_url, content_type } }
      const key       = presignData.data?.key        || "";
      const uploadUrl = presignData.data?.upload_url || "";
      const mime      = presignData.data?.content_type || archivo.type || "application/octet-stream";

      if (!uploadUrl) throw new Error("El backend no devolvió upload_url.");
      if (!key)       throw new Error("El backend no devolvió key.");

      // 2) PUT directo a R2 con la URL firmada (sin headers de auth — es pre-firmada)
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: archivo,
      });

      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => "");
        throw new Error(errText || `Error subiendo a R2. HTTP ${putRes.status}`);
      }

      // 3) Guardar metadata en la DB
      // guardar_archivo.php espera: nombre_original, r2_key, mime_type, size_bytes
      const guardarData = await apiPost(API_URL, {
        action: "r2_test_guardar_archivo",
        nombre_original: archivo.name,
        r2_key: key,
        mime_type: mime,
        size_bytes: archivo.size,
      });

      if (!guardarData?.exito) {
        throw new Error(guardarData?.mensaje || "Se subió a R2 pero no se pudo guardar en la base.");
      }

      setMensaje("Archivo subido correctamente. Cargando vista previa...");

      // 4) Buscar el último para obtener la URL firmada de lectura
      await buscarUltimoArchivo();

    } catch (err) {
      setMensaje(err?.message || "Error subiendo archivo.");
    } finally {
      setSubiendo(false);
    }
  };

  const buscarUltimoArchivo = async () => {
    setMensaje("");
    try {
      const params = new URLSearchParams({ action: "r2_test_obtener_ultimo" });
      const data = await apiGet(`${API_URL}?${params.toString()}`);

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo obtener el último archivo.");
      }

      if (!data.archivo) {
        throw new Error("No hay archivos guardados todavía.");
      }

      // obtener_ultimo.php responde con url_firmada — normalizar a url_archivo para la UI
      setArchivoDB({
        ...data.archivo,
        url_archivo: data.archivo.url_firmada || data.archivo.url_archivo || "",
      });

    } catch (err) {
      setMensaje(err?.message || "Error obteniendo archivo.");
    }
  };

  return (
    <div className="r2test-container">
      <h2>Prueba Cloudflare R2</h2>

      <div className="r2test-card">
        <input
          type="file"
          onChange={handleChange}
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />

        <button onClick={subirArchivo} disabled={subiendo || !archivo}>
          {subiendo ? "Subiendo..." : "Subir archivo"}
        </button>

        <button onClick={buscarUltimoArchivo} disabled={subiendo}>
          Buscar último archivo guardado
        </button>

        <div className="r2test-result" style={{ marginTop: 12 }}>
          <p><strong>API:</strong> {API_URL}</p>
        </div>

        {mensaje && <p className="r2test-msg">{mensaje}</p>}

        {previewLocal && (
          <div className="r2test-result">
            <p><strong>Vista previa local:</strong></p>
            <img src={previewLocal} alt="Vista previa" className="r2test-preview" />
          </div>
        )}

        {archivoDB && (
          <div className="r2test-result">
            <p><strong>ID:</strong> {archivoDB.id || "—"}</p>
            <p><strong>Nombre:</strong> {archivoDB.nombre_original || "—"}</p>
            <p><strong>Key R2:</strong> {archivoDB.r2_key || "—"}</p>

            {archivoDB.url_archivo && (
              <a href={archivoDB.url_archivo} target="_blank" rel="noreferrer">
                Abrir archivo
              </a>
            )}

            {esImagen(archivoDB.nombre_original) && archivoDB.url_archivo && (
              <img
                src={archivoDB.url_archivo}
                alt={archivoDB.nombre_original}
                className="r2test-preview"
              />
            )}

            {esPdf(archivoDB.nombre_original) && archivoDB.url_archivo && (
              <iframe
                title={archivoDB.nombre_original}
                src={archivoDB.url_archivo}
                style={{
                  width: "100%",
                  height: "500px",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  marginTop: "12px",
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}