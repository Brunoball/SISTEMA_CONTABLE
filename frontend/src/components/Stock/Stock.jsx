import React, { useState, useEffect, useCallback, useMemo } from "react";
import ModalCargaMasiva from "./modales/ModalCargaMasiva";
import ModalEditarProducto from "./modales/ModalEditarStock";
import ModalEliminar from "../Global/Modales/ModalEliminar";
import Toast from "../Global/Toast";
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faMagnifyingGlass,
  faTimes,
  faPenToSquare,
  faTrashCan,
  faBoxOpen,
  faChevronUp,
  faChevronDown,
  faSort,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import "./Stock.css";
import "../Global/Global_css/Global_Section.css";

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

function notifyListsUpdated() {
  try { window.dispatchEvent(new CustomEvent("balto:listas-updated")); } catch {}
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
    const preview = text.length > 400 ? text.slice(0, 400) + "..." : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }
}

async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
  return await parseJsonOrThrow(res);
}

async function apiPost(url, body) {
  const { action, ...rest } = body ?? {};
  const finalUrl = action ? `${url}?action=${encodeURIComponent(action)}` : url;
  const res = await fetch(finalUrl, { method: "POST", headers: buildHeadersJSON(), body: JSON.stringify(rest) });
  return await parseJsonOrThrow(res);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function compareValues(a, b, campo) {
  const va = a?.[campo];
  const vb = b?.[campo];
  if (campo === "stock" || campo === "precio" || campo === "precio_promo") {
    return Number(va ?? 0) - Number(vb ?? 0);
  }
  return String(va ?? "").localeCompare(String(vb ?? ""), "es", { numeric: true, sensitivity: "base" });
}

function getProductoCategoriaId(prod) {
  return Number(prod?.id_stock_categoria ?? prod?.stock_categoria_id ?? prod?.id_categoria_stock ?? prod?.id_categoria ?? 0);
}

const COLUMNS = [
  { key: "nombre", label: "PRODUCTO", fr: 2.4, align: "left", sortable: true },
  { key: "sku", label: "SKU", fr: 1.0, align: "center", sortable: true },
  { key: "stock", label: "STOCK", fr: 0.8, align: "center", sortable: true },
  { key: "precio", label: "PRECIO", fr: 1.0, align: "right", sortable: true },
  { key: "precio_promo", label: "PRECIO PROMO", fr: 1.0, align: "right", sortable: true },
  { key: "acciones", label: "ACCIONES", fr: 0.7, align: "center", sortable: false },
];

const GRID_COLS = COLUMNS.map((c) => `${c.fr}fr`).join(" ");
const SKELETON_ROWS = 10;
const SKEL_WIDTHS = {
  nombre: ["68%", "52%", "60%", "48%"],
  sku: ["44%", "36%", "40%", "32%"],
  stock: ["38%", "30%", "34%", "28%"],
  precio: ["50%", "42%", "46%", "38%"],
  precio_promo: ["46%", "38%", "42%", "34%"],
};

const Stock = () => {
  const [productosRaw, setProductosRaw] = useState([]);
  const [categorias, setCategorias] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [error, setError] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
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
    setToast({ tipo, mensaje, duracion, id: Date.now() + Math.random() });
  }, []);

  const cerrarToast = useCallback(() => setToast(null), []);

  const recargarTodo = useCallback(async () => {
    const [productosRes, categoriasRes] = await Promise.allSettled([
      (async () => {
        const params = new URLSearchParams({ action: "stock_productos_listar", activo: "1", pagina: "1", por_pagina: "10000", orden_campo: "nombre", orden_dir: "ASC" });
        const data = await apiGet(`${API_URL}?${params.toString()}`);
        if (data?.exito === false) throw new Error(data?.mensaje || "Error al obtener productos");
        return Array.isArray(data?.productos) ? data.productos : [];
      })(),
      (async () => {
        const params = new URLSearchParams({ action: "stock_categorias_listar" });
        const data = await apiGet(`${API_URL}?${params.toString()}`);
        const lista = Array.isArray(data?.categorias) ? data.categorias : [];
        return [...lista].sort((a, b) => String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" }));
      })(),
    ]);

    if (productosRes.status === "fulfilled") { setProductosRaw(productosRes.value); }
    else { setProductosRaw([]); throw productosRes.reason; }

    if (categoriasRes.status === "fulfilled") { setCategorias(categoriasRes.value); }
    else { setCategorias([]); }
  }, []);

  const fetchCategorias = useCallback(async () => {
    setLoadingCategorias(true);
    try {
      const params = new URLSearchParams({ action: "stock_categorias_listar" });
      const data = await apiGet(`${API_URL}?${params.toString()}`);
      const lista = Array.isArray(data?.categorias) ? data.categorias : [];
      setCategorias([...lista].sort((a, b) => String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" })));
    } catch (err) {
      setCategorias([]);
      mostrarToast("error", err?.message || "No se pudieron cargar las categorías.");
    } finally {
      setLoadingCategorias(false);
    }
  }, [mostrarToast]);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "stock_productos_listar", activo: "1", pagina: "1", por_pagina: "10000", orden_campo: "nombre", orden_dir: "ASC" });
      const data = await apiGet(`${API_URL}?${params.toString()}`);
      if (data.exito === false) throw new Error(data.mensaje || "Error al obtener productos");
      setProductosRaw(Array.isArray(data.productos) ? data.productos : []);
    } catch (err) {
      setProductosRaw([]);
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProductos(); fetchCategorias(); }, [fetchProductos, fetchCategorias]);

  useEffect(() => {
    const handleExternalListsUpdate = async () => { try { await recargarTodo(); } catch {} };
    window.addEventListener("balto:stock-updated", handleExternalListsUpdate);
    return () => window.removeEventListener("balto:stock-updated", handleExternalListsUpdate);
  }, [recargarTodo]);

  const productosFiltradosYOrdenados = useMemo(() => {
    let lista = Array.isArray(productosRaw) ? [...productosRaw] : [];
    const q = normalizeText(busqueda);
    const categoriaId = Number(categoriaFiltro || 0);

    if (q) lista = lista.filter((p) => normalizeText(p.nombre).includes(q) || normalizeText(p.sku).includes(q));
    if (categoriaId > 0) lista = lista.filter((p) => getProductoCategoriaId(p) === categoriaId);

    lista.sort((a, b) => {
      const result = compareValues(a, b, orden.campo);
      return orden.dir === "ASC" ? result : -result;
    });

    return lista;
  }, [productosRaw, busqueda, categoriaFiltro, orden]);

  const totalProductos = productosFiltradosYOrdenados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalProductos / productosPorPagina));

  useEffect(() => {
    if (paginaActual > totalPaginas) setPaginaActual(totalPaginas);
  }, [paginaActual, totalPaginas]);

  const productos = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    return productosFiltradosYOrdenados.slice(inicio, inicio + productosPorPagina);
  }, [productosFiltradosYOrdenados, paginaActual]);

  useEffect(() => {
    let cancelado = false;
    const objectUrls = [];

    async function cargarImagenes() {
      const productosConImagen = productos.filter((p) => Number(p.imagen_archivo_id || 0) > 0);
      if (productosConImagen.length === 0) { setImagenesMap({}); return; }

      const nuevoMap = {};
      await Promise.all(
        productosConImagen.map(async (prod) => {
          try {
            const params = new URLSearchParams({ action: "stock_producto_imagen_ver", id_archivo: String(prod.imagen_archivo_id) });
            const res = await fetch(`${API_URL}?${params.toString()}`, { method: "GET", headers: buildHeadersGET() });
            if (!res.ok) return;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            nuevoMap[prod.id] = url;
          } catch {}
        })
      );

      if (!cancelado) { setImagenesMap(nuevoMap); }
      else { objectUrls.forEach((u) => URL.revokeObjectURL(u)); }
    }

    cargarImagenes();
    return () => { cancelado = true; objectUrls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [productos]);

  const handleBusqueda = (e) => { setBusqueda(e.target.value); setPaginaActual(1); };
  const handleCategoriaFiltro = (e) => { setCategoriaFiltro(e.target.value); setPaginaActual(1); };
  const handleOrden = (campo) => {
    setOrden((prev) => prev.campo === campo ? { campo, dir: prev.dir === "ASC" ? "DESC" : "ASC" } : { campo, dir: "ASC" });
    setPaginaActual(1);
  };

  const handleAbrirEditar = (id) => {
    if (!id || Number(id) <= 0) { mostrarToast("error", "ID de producto inválido."); return; }
    setProductoEditarId(Number(id));
    setModalEditarAbierto(true);
  };

  const handleCerrarEditar = () => { setModalEditarAbierto(false); setProductoEditarId(null); };

  const handleAbrirEliminar = (producto) => {
    if (!producto?.id || Number(producto.id) <= 0) { mostrarToast("error", "ID de producto inválido."); return; }
    setProductoEliminar(producto);
    setModalEliminarAbierto(true);
  };

  const handleCerrarEliminar = () => {
    if (eliminando) return;
    setModalEliminarAbierto(false);
    setProductoEliminar(null);
  };

  const handleConfirmarEliminar = async () => {
    if (!productoEliminar?.id || Number(productoEliminar.id) <= 0) throw new Error("ID de producto inválido.");
    setEliminando(true);
    try {
      const data = await apiPost(API_URL, { action: "stock_productos_eliminar", id: Number(productoEliminar.id) });
      if (data.exito === false) throw new Error(data.mensaje || "Error al eliminar el producto");
      setModalEliminarAbierto(false);
      setProductoEliminar(null);
      await fetchProductos();
      notifyListsUpdated();
      window.dispatchEvent(new CustomEvent("balto:stock-updated"));
    } finally {
      setEliminando(false);
    }
  };

  const paginasVisibles = Array.from({ length: totalPaginas }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 2)
    .reduce((acc, p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  const OrdenIcon = ({ campo }) => {
    if (orden.campo !== campo) return <FontAwesomeIcon icon={faSort} className="prod-sortIcon prod-sortIcon--inactive" />;
    return <FontAwesomeIcon icon={orden.dir === "ASC" ? faChevronUp : faChevronDown} className="prod-sortIcon prod-sortIcon--active" />;
  };

  const renderSkeletonRow = (idx) => (
    <div key={`skel-${idx}`} className="mov-gridTable mov-gridTable--row mov-row--skeleton" style={{ gridTemplateColumns: GRID_COLS }} role="row" aria-hidden="true">
      {COLUMNS.map((c) => {
        if (c.key === "acciones") {
          return (
            <div key={c.key} className="mov-gridCell mov-gridCell--actions is-center" role="cell">
              <div className="mov-skelActions"><span className="mov-skelIcon" /><span className="mov-skelIcon" /></div>
            </div>
          );
        }
        const list = SKEL_WIDTHS[c.key] || ["60%"];
        const w = list[idx % list.length];
        return (
          <div key={c.key} className={["mov-gridCell", c.align === "right" ? "is-right" : "", c.align === "center" ? "is-center" : ""].join(" ")} role="cell">
            <span className="mov-skeletonBar" style={{ width: w }} />
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="mov-page">
        {error && <div className="mov-alert" role="alert">{error}</div>}

        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div className="title-mov">
                <div className="mov-card__title">Stock · Productos</div>
                <div className="mov-card__hint">Mostrando <b>{totalProductos}</b> productos</div>
              </div>

              <div className="mov-headFilters">
                <div className="cc-filter cc-filter--search">
                  <div className="cc-floatingField cc-floatingField--search is-active">
                    <div className="cc-searchInput">
                      <div className="cc-searchInput__fieldWrap">
                        <input
                          className="cc-input cc-input--floating"
                          value={busqueda}
                          onChange={handleBusqueda}
                          placeholder="Buscar por nombre o SKU..."
                          disabled={loading}
                        />
                        <span className="cc-floatingLabel"><FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda</span>
                        {busqueda.trim() !== "" && (
                          <button type="button" className="cc-clearSearch cc-clearSearch--inside" title="Limpiar búsqueda" onClick={() => { setBusqueda(""); setPaginaActual(1); }}>
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="cc-filter">
                  <div className="cc-floatingField is-active">
                    <select className="cc-input cc-input--floating" value={categoriaFiltro} onChange={handleCategoriaFiltro} disabled={loading || loadingCategorias}>
                      <option value="">Todas</option>
                      {categorias.map((cat) => (
                        <option key={cat.id_stock_categoria} value={cat.id_stock_categoria}>{cat.nombre}</option>
                      ))}
                    </select>
                    <span className="cc-floatingLabel"><FontAwesomeIcon icon={faLayerGroup} /> Categoría</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ Solo botón de agregar producto */}
            <div className="mov-card__actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="mov-btn mov-btn--primary" onClick={() => setModalAbierto(true)}>
                <FontAwesomeIcon icon={faPlus} /> Agregar producto
              </button>
            </div>
          </div>

          <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: GRID_COLS }} role="row">
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={["mov-gridCell", "mov-gridCell--head", c.align === "right" ? "is-right" : "", c.align === "center" ? "is-center" : "", c.sortable ? "prod-th--sortable" : ""].join(" ")}
                role="columnheader"
                onClick={c.sortable ? () => handleOrden(c.key) : undefined}
              >
                {c.label}
                {c.sortable && <OrdenIcon campo={c.key} />}
              </div>
            ))}
          </div>

          <div className="mov-tableWrap" role="rowgroup">
            <div className={["mov-gridBody", "mov-gridBody--relative", loading ? "mov-softLoading" : ""].join(" ")}>
              {loading ? (
                <div className="mov-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
                </div>
              ) : (
                <>
                  {productos.length === 0 ? (
                    <div className="cc-emptyState">
                      <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                      <div className="cc-emptyText">
                        {busqueda.trim() || categoriaFiltro ? "No se encontraron productos con los filtros seleccionados." : "No hay productos para mostrar."}
                      </div>
                    </div>
                  ) : (
                    productos.map((prod) => (
                      <div key={prod.id} className="mov-gridTable mov-gridTable--row" style={{ gridTemplateColumns: GRID_COLS }} role="row">
                        <div className="mov-gridCell is-strong" role="cell" data-label="PRODUCTO">
                          <div className="prod-productCell">
                            <div className="prod-thumb">
                              {imagenesMap[prod.id] ? (
                                <img src={imagenesMap[prod.id]} alt={prod.nombre} className="prod-thumb__img" />
                              ) : (
                                <span className="prod-thumb__placeholder"><FontAwesomeIcon icon={faBoxOpen} /></span>
                              )}
                            </div>
                            <span className="mov-ellipsissss">{prod.nombre}</span>
                          </div>
                        </div>

                        <div className="mov-gridCell is-center" role="cell" data-label="SKU">
                          <span className="mov-ellipsissss prod-sku">{prod.sku || "—"}</span>
                        </div>

                        <div className="mov-gridCell is-center" role="cell" data-label="STOCK">
                          {(() => {
                            const stockNum = Number(prod.stock || 0);
                            let stockClass = "mov-chip mov-chip--danger";
                            let stockLabel = "Sin stock";
                            if (stockNum > 10) { stockClass = "mov-chip mov-chip--ok"; stockLabel = stockNum; }
                            else if (stockNum > 0 && stockNum <= 10) { stockClass = "mov-chip mov-chip--warn"; stockLabel = stockNum; }
                            return <span className={stockClass}>{stockLabel}</span>;
                          })()}
                        </div>

                        <div className="mov-gridCell is-right" role="cell" data-label="PRECIO">
                          <span className="mov-ellipsissss">{formatMoney(prod.precio)}</span>
                        </div>

                        <div className="mov-gridCell is-right" role="cell" data-label="PRECIO PROMO">
                          <span className="mov-ellipsissss prod-promo">{formatMoney(prod.precio_promo)}</span>
                        </div>

                        <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="ACCIONES">
                          <div className="mov-actionsInline">
                            <button type="button" title="Editar" className="mov-iconBtn" onClick={() => handleAbrirEditar(prod.id)}>
                              <FontAwesomeIcon icon={faPenToSquare} />
                            </button>
                            <button type="button" title="Eliminar" className="mov-iconBtn mov-iconBtn--danger" onClick={() => handleAbrirEliminar(prod)}>
                              <FontAwesomeIcon icon={faTrashCan} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {totalPaginas > 1 && (
          <div className="prod-pagination">
            <button type="button" className="mov-btn mov-btn--ghost" onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaActual === 1}>
              ← Anterior
            </button>
            {paginasVisibles.map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} className="prod-page-dots">…</span>
              ) : (
                <button key={p} type="button" className={`mov-btn ${p === paginaActual ? "mov-btn--primary" : "mov-btn--ghost"}`} onClick={() => setPaginaActual(p)} style={{ minWidth: 40, padding: "0 10px" }}>
                  {p}
                </button>
              )
            )}
            <button type="button" className="mov-btn mov-btn--ghost" onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}>
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {modalAbierto && (
        <ModalCargaMasiva
          open={modalAbierto}
          onClose={() => setModalAbierto(false)}
          onToast={mostrarToast}
          onGuardado={async () => {
            setModalAbierto(false);
            await recargarTodo();
            notifyListsUpdated();
            window.dispatchEvent(new CustomEvent("balto:stock-updated"));
            mostrarToast("exito", "Producto agregado correctamente.");
          }}
          onImportado={async (mensaje) => {
            setModalAbierto(false);
            await recargarTodo();
            notifyListsUpdated();
            window.dispatchEvent(new CustomEvent("balto:stock-updated"));
            mostrarToast("exito", mensaje || "Importación finalizada correctamente.");
          }}
        />
      )}

      {modalEditarAbierto && productoEditarId && (
        <ModalEditarProducto
          productoId={productoEditarId}
          onClose={handleCerrarEditar}
          onGuardado={async () => {
            handleCerrarEditar();
            await recargarTodo();
            notifyListsUpdated();
            window.dispatchEvent(new CustomEvent("balto:stock-updated"));
            mostrarToast("exito", "Producto editado correctamente.");
          }}
        />
      )}

      <ModalEliminar
        open={modalEliminarAbierto}
        row={productoEliminar ? { id: productoEliminar.id, nombre: productoEliminar.nombre, sku: productoEliminar.sku, stock: productoEliminar.stock, precio: productoEliminar.precio } : null}
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
                { label: "ID Producto", value: `#${productoEliminar.id}` },
                { label: "Nombre", value: productoEliminar.nombre || "—" },
                { label: "SKU", value: productoEliminar.sku || "—" },
                { label: "Stock", value: productoEliminar.stock === null || productoEliminar.stock === undefined || productoEliminar.stock === "" ? "—" : String(productoEliminar.stock) },
                { label: "Precio", value: formatMoney(productoEliminar.precio) },
              ]
            : []
        }
      />

      {toast && <Toast key={toast.id} tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={cerrarToast} />}
    </>
  );
};

export default Stock;