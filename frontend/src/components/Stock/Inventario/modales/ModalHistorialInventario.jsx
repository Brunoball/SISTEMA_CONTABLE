import React, { useEffect, useState } from "react";
import BASE_URL from "../../../../config/config";
import "./modalinventario.css";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

function buildHeadersGET() {
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

const ModalHistorialInventario = ({ producto, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [historial, setHistorial] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function cargar() {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({
          action: "stock_inventario_historial",
          id_producto: String(producto.id),
        });

        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: buildHeadersGET(),
        });

        const data = await parseJsonOrThrow(res);

        if (!mounted) return;

        setHistorial(Array.isArray(data.historial) ? data.historial : []);
      } catch (err) {
        if (mounted) {
          setError(err.message || "Error al cargar el historial.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (producto?.id) {
      cargar();
    }

    return () => {
      mounted = false;
    };
  }, [producto]);

  return (
    <div className="stock-modal-backdrop" onClick={onClose}>
      <div
        className="stock-modal stock-modal-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stock-modal-header">
          <div className="stock-modal-titleWrap">
            <h3 className="stock-modal-title">Historial de inventario</h3>
            <p className="stock-modal-subtitle">
              Movimientos registrados del producto seleccionado
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
          <div className="stock-info-box" style={{ marginBottom: 16 }}>
            <div><strong>Producto:</strong> {producto?.nombre || "—"}</div>
            <div><strong>ID:</strong> {producto?.id || "—"}</div>
            <div><strong>SKU:</strong> {producto?.sku || "—"}</div>
          </div>

          {loading ? (
            <div className="stock-loading-box">Cargando historial...</div>
          ) : error ? (
            <div className="stock-error-text">{error}</div>
          ) : historial.length === 0 ? (
            <div className="stock-empty-box">No hay movimientos registrados.</div>
          ) : (
            <div className="stock-table-wrapper">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th className="stock-th">Fecha</th>
                    <th className="stock-th">Campo</th>
                    <th className="stock-th">Antes</th>
                    <th className="stock-th">Después</th>
                    <th className="stock-th">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="stock-td">{item.created_at || "—"}</td>
                      <td className="stock-td">{item.campo || "—"}</td>
                      <td className="stock-td">{item.valor_anterior ?? "—"}</td>
                      <td className="stock-td">{item.valor_nuevo ?? "—"}</td>
                      <td className="stock-td">{item.usuario || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        </div>
      </div>
    </div>
  );
};

export default ModalHistorialInventario;