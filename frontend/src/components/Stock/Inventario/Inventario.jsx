import React, { useCallback, useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import ModalCargaMasivaInventario from "./modales/ModalCargaMasivaInventario";
import ModalHistorialInventario from "./modales/ModalHistorialInventario";
import Toast from "../../Global/Toast";
import "./Inventario.css";

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
    throw new Error("Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }

  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La API devolvió una respuesta inválida.");
  }
}

async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeadersGET(),
  });
  return parseJsonOrThrow(res);
}

async function apiPost(url, body) {
  const { action, ...rest } = body ?? {};
  const finalUrl = action ? `${url}?action=${encodeURIComponent(action)}` : url;

  const res = await fetch(finalUrl, {
    method: "POST",
    headers: buildHeadersJSON(),
    body: JSON.stringify(rest),
  });

  return parseJsonOrThrow(res);
}

const Inventario = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const [total, setTotal] = useState(0);
  const [orden, setOrden] = useState({ campo: "nombre", dir: "ASC" });

  const [stockDrafts, setStockDrafts] = useState({});
  const [guardandoId, setGuardandoId] = useState(null);

  const [modalCargaOpen, setModalCargaOpen] = useState(false);
  const [historialProducto, setHistorialProducto] = useState(null);

  const [toast, setToast] = useState(null);
  const [imagenesMap, setImagenesMap] = useState({});

  const porPagina = 50;

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2600) => {
    setToast({
      id: Date.now() + Math.random(),
      tipo,
      mensaje,
      duracion,
    });
  }, []);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        action: "stock_inventario_listar",
        busqueda,
        pagina: String(paginaActual),
        por_pagina: String(porPagina),
        orden_campo: orden.campo,
        orden_dir: orden.dir,
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);

      if (data.exito === false) {
        throw new Error(data.mensaje || "No se pudo cargar el inventario.");
      }

      const lista = Array.isArray(data.productos) ? data.productos : [];
      setProductos(lista);
      setTotal(Number(data.total || 0));

      const nuevosDrafts = {};
      lista.forEach((p) => {
        nuevosDrafts[p.id] = String(
          p.stock === null || p.stock === undefined ? 0 : p.stock
        );
      });
      setStockDrafts(nuevosDrafts);
    } catch (err) {
      setProductos([]);
      setTotal(0);
      setError(err.message || "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, [busqueda, paginaActual, orden]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  useEffect(() => {
    let cancelado = false;
    const objectUrls = [];

    async function cargarImagenes() {
      const conImagen = productos.filter(
        (p) => Number(p.imagen_archivo_id || 0) > 0
      );

      if (conImagen.length === 0) {
        setImagenesMap({});
        return;
      }

      const nuevoMap = {};

      await Promise.all(
        conImagen.map(async (prod) => {
          try {
            const params = new URLSearchParams({
              action: "stock_producto_imagen_ver",
              id_archivo: String(prod.imagen_archivo_id),
            });

            const res = await fetch(`${API_URL}?${params.toString()}`, {
              method: "GET",
              headers: buildHeadersGET(),
            });

            if (!res.ok) return;

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            nuevoMap[prod.id] = url;
          } catch {
            // silencioso
          }
        })
      );

      if (!cancelado) {
        setImagenesMap(nuevoMap);
      } else {
        objectUrls.forEach((u) => URL.revokeObjectURL(u));
      }
    }

    cargarImagenes();

    return () => {
      cancelado = true;
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [productos]);

  const totalPaginas = useMemo(() => {
    return Math.max(1, Math.ceil(total / porPagina));
  }, [total]);

  const handleOrden = (campo) => {
    setOrden((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === "ASC" ? "DESC" : "ASC" }
        : { campo, dir: "ASC" }
    );
    setPaginaActual(1);
  };

  const handleGuardarStock = async (producto) => {
    const valor = stockDrafts[producto.id] ?? "0";
    const stock = Number(valor);

    if (!Number.isFinite(stock) || stock < 0) {
      mostrarToast("error", "Ingresá un stock válido.");
      return;
    }

    try {
      setGuardandoId(producto.id);

      const data = await apiPost(API_URL, {
        action: "stock_inventario_actualizar_stock",
        id: producto.id,
        stock,
      });

      if (data.exito === false) {
        throw new Error(data.mensaje || "No se pudo actualizar el stock.");
      }

      setProductos((prev) =>
        prev.map((p) =>
          p.id === producto.id ? { ...p, stock } : p
        )
      );

      mostrarToast("exito", `Stock actualizado para "${producto.nombre}".`);
    } catch (err) {
      mostrarToast("error", err.message || "Error al actualizar el stock.");
    } finally {
      setGuardandoId(null);
    }
  };

  const abrirHistorial = (producto) => {
    setHistorialProducto(producto);
  };

  const OrdenIcon = ({ campo }) => {
    if (orden.campo !== campo) {
      return <span className="inventario-orden inventario-orden-inactivo">↕</span>;
    }
    return (
      <span className="inventario-orden inventario-orden-activo">
        {orden.dir === "ASC" ? "↑" : "↓"}
      </span>
    );
  };

  return (
    <>
      <div className="inventario-page">
        <div className="inventario-header">
          <div>
            <h1 className="inventario-title">Inventario</h1>
            <p className="inventario-subtitle">
              Carga masiva de productos y control manual de cantidades.
            </p>
          </div>

          <button
            type="button"
            className="inventario-btn-primary"
            onClick={() => setModalCargaOpen(true)}
          >
            + Carga masiva CSV
          </button>
        </div>

        <div className="inventario-toolbar">
          <div className="inventario-search-wrap">
            <span className="inventario-search-icon">🔍</span>
            <input
              type="text"
              className="inventario-search-input"
              placeholder="Buscar por nombre, SKU o descripción..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPaginaActual(1);
              }}
            />
          </div>

          <div className="inventario-total">{total} productos</div>
        </div>

        <div className="inventario-card">
          {loading ? (
            <div className="inventario-empty">Cargando inventario...</div>
          ) : error ? (
            <div className="inventario-empty inventario-empty-error">{error}</div>
          ) : productos.length === 0 ? (
            <div className="inventario-empty">No se encontraron productos.</div>
          ) : (
            <div className="inventario-table-wrap">
              <table className="inventario-table">
                <thead>
                  <tr>
                    <th onClick={() => handleOrden("nombre")}>
                      Producto <OrdenIcon campo="nombre" />
                    </th>
                    <th onClick={() => handleOrden("stock")}>
                      Stock <OrdenIcon campo="stock" />
                    </th>
                    <th onClick={() => handleOrden("sku")}>
                      SKU <OrdenIcon campo="sku" />
                    </th>
                    <th onClick={() => handleOrden("precio")}>
                      Precio <OrdenIcon campo="precio" />
                    </th>
                    <th>Historial</th>
                  </tr>
                </thead>

                <tbody>
                  {productos.map((prod) => {
                    const stockActual = Number(prod.stock || 0);
                    const draft = stockDrafts[prod.id] ?? String(stockActual);
                    const sinStock = Number(draft || 0) <= 0;

                    return (
                      <tr key={prod.id}>
                        <td>
                          <div className="inventario-producto-cell">
                            <div className="inventario-thumb">
                              {imagenesMap[prod.id] ? (
                                <img
                                  src={imagenesMap[prod.id]}
                                  alt={prod.nombre}
                                  className="inventario-thumb-img"
                                />
                              ) : (
                                <span className="inventario-thumb-empty">📷</span>
                              )}
                            </div>

                            <div className="inventario-producto-info">
                              <div className="inventario-producto-nombre">
                                {prod.nombre}
                              </div>
                              <div className="inventario-producto-desc">
                                {prod.descripcion || "Sin descripción"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="inventario-stock-box">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={draft}
                              onChange={(e) =>
                                setStockDrafts((prev) => ({
                                  ...prev,
                                  [prod.id]: e.target.value,
                                }))
                              }
                              className={`inventario-stock-input ${
                                sinStock ? "inventario-stock-input-danger" : ""
                              }`}
                            />

                            <button
                              type="button"
                              className="inventario-btn-save"
                              onClick={() => handleGuardarStock(prod)}
                              disabled={guardandoId === prod.id}
                            >
                              {guardandoId === prod.id ? "..." : "Guardar"}
                            </button>
                          </div>
                        </td>

                        <td>{prod.sku || "—"}</td>

                        <td>
                          {prod.precio !== null &&
                          prod.precio !== undefined &&
                          prod.precio !== ""
                            ? `$${Number(prod.precio).toLocaleString("es-AR")}`
                            : "—"}
                        </td>

                        <td>
                          <button
                            type="button"
                            className="inventario-btn-history"
                            onClick={() => abrirHistorial(prod)}
                            title="Ver historial"
                          >
                            🕘
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPaginas > 1 && (
          <div className="inventario-pagination">
            <button
              type="button"
              className="inventario-page-btn"
              disabled={paginaActual === 1}
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </button>

            <span className="inventario-page-info">
              Página {paginaActual} de {totalPaginas}
            </span>

            <button
              type="button"
              className="inventario-page-btn"
              disabled={paginaActual === totalPaginas}
              onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {modalCargaOpen && (
        <ModalCargaMasivaInventario
          onClose={() => setModalCargaOpen(false)}
          onImportado={async (mensaje) => {
            setModalCargaOpen(false);
            await fetchProductos();
            mostrarToast("exito", mensaje || "Inventario importado correctamente.");
          }}
          onToast={mostrarToast}
        />
      )}

      {historialProducto && (
        <ModalHistorialInventario
          producto={historialProducto}
          onClose={() => setHistorialProducto(null)}
        />
      )}

      {toast && (
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
};

export default Inventario;