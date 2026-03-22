import React, { useState, useEffect, useCallback } from "react";
import ModalAgregarProducto from "./modales/ModalAgregarProducto";
import ModalEditarProducto from "./modales/ModalEditarProducto";
import ModalEliminar from "../../Global/Modales/ModalEliminar";
import Toast from "../../Global/Toast";
import BASE_URL from "../../../config/config";
import "./Lista_Productos.css";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

/* =========================
   Helpers de autenticación
========================= */
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
    throw new Error(
      `${res.status}: Sesión vencida o no autorizada. Volvé a iniciar sesión.`
    );
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

async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeadersGET(),
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

/* =========================
   Componente principal
========================= */
const Lista_Productos = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const [totalProductos, setTotalProductos] = useState(0);
  const [orden, setOrden] = useState({ campo: "nombre", dir: "ASC" });

  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
  const [productoEditarId, setProductoEditarId] = useState(null);

  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [productoEliminar, setProductoEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const [toast, setToast] = useState(null);

  const [imagenesMap, setImagenesMap] = useState({});

  const productosPorPagina = 20;

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({
      tipo,
      mensaje,
      duracion,
      id: Date.now() + Math.random(),
    });
  }, []);

  const cerrarToast = useCallback(() => {
    setToast(null);
  }, []);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        action: "stock_productos_listar",
        activo: "1",
        busqueda,
        pagina: String(paginaActual),
        por_pagina: String(productosPorPagina),
        orden_campo: orden.campo,
        orden_dir: orden.dir,
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);

      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al obtener productos");
      }

      setProductos(Array.isArray(data.productos) ? data.productos : []);
      setTotalProductos(Number(data.total || 0));
    } catch (err) {
      setProductos([]);
      setTotalProductos(0);
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, [busqueda, paginaActual, orden]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  /* =========================
     Cargar blobs de imágenes protegidas
  ========================= */
  useEffect(() => {
    let cancelado = false;
    const objectUrls = [];

    async function cargarImagenes() {
      const productosConImagen = productos.filter(
        (p) => Number(p.imagen_archivo_id || 0) > 0
      );

      if (productosConImagen.length === 0) {
        setImagenesMap({});
        return;
      }

      const nuevoMap = {};

      await Promise.all(
        productosConImagen.map(async (prod) => {
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

  const handleBusqueda = (e) => {
    setBusqueda(e.target.value);
    setPaginaActual(1);
  };

  const handleOrden = (campo) => {
    setOrden((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === "ASC" ? "DESC" : "ASC" }
        : { campo, dir: "ASC" }
    );
    setPaginaActual(1);
  };

  const handleAbrirEditar = (id) => {
    if (!id || Number(id) <= 0) {
      mostrarToast("error", "ID de producto inválido.");
      return;
    }

    setProductoEditarId(Number(id));
    setModalEditarAbierto(true);
  };

  const handleCerrarEditar = () => {
    setModalEditarAbierto(false);
    setProductoEditarId(null);
  };

  const handleAbrirEliminar = (producto) => {
    if (!producto?.id || Number(producto.id) <= 0) {
      mostrarToast("error", "ID de producto inválido.");
      return;
    }

    setProductoEliminar(producto);
    setModalEliminarAbierto(true);
  };

  const handleCerrarEliminar = () => {
    if (eliminando) return;
    setModalEliminarAbierto(false);
    setProductoEliminar(null);
  };

  const handleConfirmarEliminar = async () => {
    if (!productoEliminar?.id || Number(productoEliminar.id) <= 0) {
      throw new Error("ID de producto inválido.");
    }

    setEliminando(true);

    try {
      const data = await apiPost(API_URL, {
        action: "stock_productos_eliminar",
        id: Number(productoEliminar.id),
      });

      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al eliminar el producto");
      }

      if (productos.length === 1 && paginaActual > 1) {
        setPaginaActual((prev) => Math.max(1, prev - 1));
      } else {
        await fetchProductos();
      }

      setModalEliminarAbierto(false);
      setProductoEliminar(null);
    } finally {
      setEliminando(false);
    }
  };

  const totalPaginas = Math.ceil(totalProductos / productosPorPagina);

  const OrdenIcon = ({ campo }) => {
    if (orden.campo !== campo) {
      return <span className="stock-orden-icon stock-orden-inactivo">↕</span>;
    }

    return (
      <span className="stock-orden-icon stock-orden-activo">
        {orden.dir === "ASC" ? "↑" : "↓"}
      </span>
    );
  };

  const paginasVisibles = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 2)
    .reduce((acc, p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  return (
    <>
      <div className="stock-page">
        <div className="stock-header">
          <h1 className="stock-title">Productos</h1>

          <div className="stock-header-actions">
            <button
              onClick={() => setModalAbierto(true)}
              className="stock-btn-primary"
              type="button"
            >
              <span className="stock-btn-primary-icon">+</span>
              Agregar producto
            </button>
          </div>
        </div>

        <div className="stock-toolbar">
          <div className="stock-search-wrap">
            <span className="stock-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar por nombre o SKU..."
              value={busqueda}
              onChange={handleBusqueda}
              className="stock-search-input"
            />
          </div>

          <span className="stock-total">{totalProductos} productos</span>
        </div>

        <div className="stock-card">
          {loading ? (
            <div className="stock-empty">Cargando productos...</div>
          ) : error ? (
            <div className="stock-empty stock-empty-error">{error}</div>
          ) : productos.length === 0 ? (
            <div className="stock-empty">No se encontraron productos.</div>
          ) : (
            <div className="stock-table-responsive">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th className="stock-th" onClick={() => handleOrden("nombre")}>
                      Producto <OrdenIcon campo="nombre" />
                    </th>
                    <th className="stock-th" onClick={() => handleOrden("sku")}>
                      SKU <OrdenIcon campo="sku" />
                    </th>
                    <th className="stock-th" onClick={() => handleOrden("stock")}>
                      Stock <OrdenIcon campo="stock" />
                    </th>
                    <th className="stock-th" onClick={() => handleOrden("precio")}>
                      Precio <OrdenIcon campo="precio" />
                    </th>
                    <th className="stock-th" onClick={() => handleOrden("precio_promo")}>
                      Precio Promo <OrdenIcon campo="precio_promo" />
                    </th>
                    <th className="stock-th stock-th-no-pointer">Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {productos.map((prod, i) => (
                    <tr
                      key={prod.id}
                      className={i % 2 === 0 ? "stock-row" : "stock-row stock-row-alt"}
                    >
                      <td className="stock-td">
                        <div className="stock-product-cell">
                          <div className="stock-product-thumb">
                            {imagenesMap[prod.id] ? (
                              <img
                                src={imagenesMap[prod.id]}
                                alt={prod.nombre}
                                className="stock-product-img"
                              />
                            ) : (
                              <span className="stock-product-noimg">📷</span>
                            )}
                          </div>

                          <span className="stock-product-name">{prod.nombre}</span>
                        </div>
                      </td>

                      <td className="stock-td stock-sku">{prod.sku || "-"}</td>

                      <td className="stock-td">
                        <span
                          className={
                            prod.stock === null ||
                            prod.stock === undefined ||
                            Number(prod.stock) === 0
                              ? "stock-badge stock-badge-danger"
                              : "stock-badge stock-badge-success"
                          }
                        >
                          {prod.stock === null ||
                          prod.stock === undefined ||
                          Number(prod.stock) === 0
                            ? "Sin stock"
                            : prod.stock}
                        </span>
                      </td>

                      <td className="stock-td">
                        {prod.precio !== null &&
                        prod.precio !== undefined &&
                        prod.precio !== ""
                          ? `$${Number(prod.precio).toLocaleString("es-AR")}`
                          : "-"}
                      </td>

                      <td className="stock-td">
                        {prod.precio_promo !== null &&
                        prod.precio_promo !== undefined &&
                        prod.precio_promo !== ""
                          ? `$${Number(prod.precio_promo).toLocaleString("es-AR")}`
                          : "-"}
                      </td>

                      <td className="stock-td stock-actions-cell">
                        <div className="stock-actions">
                          <button
                            title="Editar"
                            type="button"
                            onClick={() => handleAbrirEditar(prod.id)}
                            className="stock-action-btn stock-action-edit"
                          >
                            ✏️
                          </button>

                          <button
                            title="Eliminar"
                            type="button"
                            onClick={() => handleAbrirEliminar(prod)}
                            className="stock-action-btn stock-action-delete"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPaginas > 1 && (
          <div className="stock-pagination">
            <button
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
              className="stock-page-btn"
              type="button"
            >
              ← Anterior
            </button>

            {paginasVisibles.map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} className="stock-page-dots">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPaginaActual(p)}
                  className={`stock-page-btn ${p === paginaActual ? "active" : ""}`}
                  type="button"
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
              className="stock-page-btn"
              type="button"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {modalAbierto && (
        <ModalAgregarProducto
          onClose={() => setModalAbierto(false)}
          onGuardado={async () => {
            setModalAbierto(false);
            await fetchProductos();
            mostrarToast("exito", "Producto agregado correctamente.");
          }}
        />
      )}

      {modalEditarAbierto && productoEditarId && (
        <ModalEditarProducto
          productoId={productoEditarId}
          onClose={handleCerrarEditar}
          onGuardado={async () => {
            handleCerrarEditar();
            await fetchProductos();
            mostrarToast("exito", "Producto editado correctamente.");
          }}
        />
      )}

      <ModalEliminar
        open={modalEliminarAbierto}
        row={
          productoEliminar
            ? {
                id: productoEliminar.id,
                nombre: productoEliminar.nombre,
                sku: productoEliminar.sku,
                stock: productoEliminar.stock,
                precio: productoEliminar.precio,
              }
            : null
        }
        loading={eliminando}
        onClose={handleCerrarEliminar}
        onConfirm={handleConfirmarEliminar}
        onToast={mostrarToast}
        title="Eliminar producto"
        message="¿Seguro que querés eliminar este producto definitivamente?"
        warning="Esta acción no se puede deshacer."
        loadingMessage="Eliminando producto..."
        successMessage="Producto eliminado correctamente."
        errorMessage="No se pudo eliminar el producto."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        details={
          productoEliminar
            ? [
                {
                  label: "ID Producto",
                  value: `#${productoEliminar.id}`,
                },
                {
                  label: "Nombre",
                  value: productoEliminar.nombre || "—",
                },
                {
                  label: "SKU",
                  value: productoEliminar.sku || "—",
                },
                {
                  label: "Stock",
                  value:
                    productoEliminar.stock === null ||
                    productoEliminar.stock === undefined ||
                    productoEliminar.stock === ""
                      ? "—"
                      : String(productoEliminar.stock),
                },
                {
                  label: "Precio",
                  value:
                    productoEliminar.precio !== null &&
                    productoEliminar.precio !== undefined &&
                    productoEliminar.precio !== ""
                      ? `$${Number(productoEliminar.precio).toLocaleString("es-AR")}`
                      : "—",
                },
              ]
            : []
        }
      />

      {toast && (
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={cerrarToast}
        />
      )}
    </>
  );
};

export default Lista_Productos;