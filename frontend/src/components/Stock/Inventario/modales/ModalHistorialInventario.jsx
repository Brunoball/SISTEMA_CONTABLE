import React, { useEffect, useState } from "react";
import BASE_URL from "../../../../config/config";
import "../Inventario.css";

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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La API devolvió una respuesta inválida.");
  }
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

        if (data.exito === false) {
          throw new Error(data.mensaje || "No se pudo cargar el historial.");
        }

        setHistorial(Array.isArray(data.historial) ? data.historial : []);
      } catch (err) {
        if (mounted) setError(err.message || "Error al cargar el historial.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    cargar();

    return () => {
      mounted = false;
    };
  }, [producto.id]);

  return (
    <div className="stock-modal-backdrop">
      <div className="stock-modal stock-modal-lg">
        <div className="stock-modal-header">
          <h3>Historial de inventario</h3>
          <button type="button" onClick={onClose} className="stock-modal-close">
            ×
          </button>
        </div>

        <div className="stock-modal-body">
          <div style={{ marginBottom: 14 }}>
            <strong>Producto:</strong> {producto.nombre}
          </div>

          {loading ? (
            <div>Cargando historial...</div>
          ) : error ? (
            <div className="stock-error-text">{error}</div>
          ) : historial.length === 0 ? (
            <div>No hay movimientos registrados.</div>
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
                  {historial.map((item) => (
                    <tr key={item.id}>
                      <td className="stock-td">{item.created_at || "—"}</td>
                      <td className="stock-td">{item.campo || "—"}</td>
                      <td className="stock-td">{item.valor_anterior || "—"}</td>
                      <td className="stock-td">{item.valor_nuevo || "—"}</td>
                      <td className="stock-td">{item.usuario || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stock-modal-footer">
          <button type="button" onClick={onClose} className="stock-btn-secondary">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalHistorialInventario;