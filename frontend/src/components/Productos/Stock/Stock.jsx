import React, { useCallback, useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/Global_responsive.css";
import Toast from "../../Global/Toast.jsx";
import ModalCategoriasStock from "./modales/ModalCategoriasStock";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faMagnifyingGlass,
  faTimes,
  faTriangleExclamation,
  faBoxOpen,
  faLayerGroup,
  faWarehouse,
  faFilter,
  faArrowRotateRight,
  faTag,
} from "@fortawesome/free-solid-svg-icons";
import "./Stock.css";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;
const ITEMS_POR_PAGINA = 20;

/* =========================================
   Helpers auth / api
========================================= */
function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();

  const headers = {};
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return headers;
}

async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${res.status}: Sesión vencida o no autorizada. Volvé a iniciar sesión.`
    );
  }

  const text = await res.text();

  if (!text) {
    throw new Error("Respuesta vacía del servidor.");
  }

  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 400 ? `${text.slice(0, 400)}...` : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `La API devolvió una respuesta inválida. HTTP ${res.status}\n${preview}`
    );
  }
}

async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeadersGET(),
  });

  const data = await parseJsonOrThrow(res);

  if (data?.exito === false) {
    throw new Error(data?.mensaje || "Error en la API.");
  }

  return data;
}

/* =========================================
   Helpers visuales
========================================= */
function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getCategoriaStockKey(stockValue) {
  const stock = Number(stockValue || 0);

  if (stock <= 0) return "sin_stock";
  if (stock <= 5) return "bajo";
  if (stock <= 15) return "medio";
  return "alto";
}

function getCategoriaVisualByStock(stockValue) {
  const key = getCategoriaStockKey(stockValue);

  switch (key) {
    case "sin_stock":
      return {
        key,
        label: "Sin stock",
        className: "stock-badge stock-badge--sin",
      };
    case "bajo":
      return {
        key,
        label: "Stock bajo",
        className: "stock-badge stock-badge--bajo",
      };
    case "medio":
      return {
        key,
        label: "Stock medio",
        className: "stock-badge stock-badge--medio",
      };
    case "alto":
      return {
        key,
        label: "Stock alto",
        className: "stock-badge stock-badge--alto",
      };
    default:
      return {
        key: "",
        label: "Sin categoría",
        className: "stock-badge",
      };
  }
}

const COLUMNS = [
  { key: "nombre", label: "PRODUCTO", fr: 2.2, align: "left" },
  { key: "sku", label: "SKU", fr: 1.1, align: "center" },
  { key: "categoria_global", label: "CATEGORÍA", fr: 1.3, align: "center" },
  { key: "stock", label: "CANTIDAD", fr: 0.9, align: "center" },
  { key: "nivel_stock", label: "NIVEL STOCK", fr: 1.2, align: "center" },
  { key: "precio", label: "PRECIO", fr: 1, align: "right" },
  { key: "precio_promo", label: "PRECIO PROMO", fr: 1, align: "right" },
];

const GRID_COLS = COLUMNS.map((c) => `${c.fr}fr`).join(" ");

export default function Stock() {
  const [allProductos, setAllProductos] = useState([]);
  const [categoriasGlobales, setCategoriasGlobales] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("todas");
  const [nivelSeleccionado, setNivelSeleccionado] = useState("todas");
  const [paginaActual, setPaginaActual] = useState(1);

  const [toast, setToast] = useState(null);
  const [modalCategoriasOpen, setModalCategoriasOpen] = useState(false);

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({
      id: `${Date.now()}-${Math.random()}`,
      tipo,
      mensaje,
      duracion,
    });
  }, []);

  const cerrarToast = useCallback(() => setToast(null), []);

  /* =========================================
     Fetch categorías globales
  ========================================= */
  const fetchCategoriasGlobales = useCallback(async () => {
    const params = new URLSearchParams({ action: "obtener_listas" });
    const data = await apiGet(`${API_URL}?${params.toString()}`);

    const cats = Array.isArray(data?.listas?.stock_categorias)
      ? data.listas.stock_categorias
      : [];

    setCategoriasGlobales(
      cats.map((cat) => ({
        id: String(cat.id ?? cat.id_stock_categoria ?? ""),
        nombre: String(cat.nombre ?? "Sin nombre"),
      }))
    );
  }, []);

  /* =========================================
     Fetch todos los productos activos
  ========================================= */
  const fetchTodosLosProductos = useCallback(async () => {
    const acumulados = [];
    let pagina = 1;
    let totalPaginas = 1;

    do {
      const params = new URLSearchParams({
        action: "stock_productos_listar",
        pagina: String(pagina),
        por_pagina: "100",
        activo: "1",
        orden_campo: "nombre",
        orden_dir: "ASC",
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);

      const productosPagina = Array.isArray(data?.productos)
        ? data.productos
        : [];
      acumulados.push(...productosPagina);

      totalPaginas = Number(data?.total_paginas || 1);
      pagina += 1;
    } while (pagina <= totalPaginas);

    setAllProductos(acumulados);
  }, []);

  const recargarTodo = useCallback(
    async ({ mostrarToastExito = false } = {}) => {
      setLoading(true);
      setError("");

      try {
        await Promise.all([fetchCategoriasGlobales(), fetchTodosLosProductos()]);

        if (mostrarToastExito) {
          mostrarToast("exito", "Stock actualizado correctamente.");
        }
      } catch (err) {
        const msg = err?.message || "No se pudo actualizar la información.";
        setError(msg);
        mostrarToast("error", msg);
      } finally {
        setLoading(false);
      }
    },
    [fetchCategoriasGlobales, fetchTodosLosProductos, mostrarToast]
  );

  useEffect(() => {
    recargarTodo({ mostrarToastExito: false });
  }, [recargarTodo]);

  /* =========================================
     Limpiar filtros
  ========================================= */
  const limpiarFiltros = useCallback(() => {
    setBusqueda("");
    setCategoriaSeleccionada("todas");
    setNivelSeleccionado("todas");
    setPaginaActual(1);
  }, []);

  /* =========================================
     Resumen sobre TODOS los productos
  ========================================= */
  const resumen = useMemo(() => {
    const base = {
      total_productos: allProductos.length,
      total_unidades: 0,
      sin_stock: 0,
      bajo: 0,
      medio: 0,
      alto: 0,
    };

    allProductos.forEach((prod) => {
      const stock = Number(prod?.stock || 0);
      base.total_unidades += stock;

      const nivel = getCategoriaStockKey(stock);
      if (nivel === "sin_stock") base.sin_stock += 1;
      if (nivel === "bajo") base.bajo += 1;
      if (nivel === "medio") base.medio += 1;
      if (nivel === "alto") base.alto += 1;
    });

    return base;
  }, [allProductos]);

  /* =========================================
     Filtrado frontend
  ========================================= */
  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return allProductos.filter((prod) => {
      const nombre = String(prod?.nombre || "").toLowerCase();
      const sku = String(prod?.sku || "").toLowerCase();
      const descripcion = String(prod?.descripcion || "").toLowerCase();
      const categoriaNombre = String(
        prod?.categoria_nombre || ""
      ).toLowerCase();
      const idCategoria = String(prod?.id_categoria_stock ?? "");
      const nivel = getCategoriaStockKey(prod?.stock);

      const matchBusqueda =
        q === "" ||
        nombre.includes(q) ||
        sku.includes(q) ||
        descripcion.includes(q) ||
        categoriaNombre.includes(q);

      const matchCategoria =
        categoriaSeleccionada === "todas" ||
        idCategoria === String(categoriaSeleccionada);

      const matchNivel =
        nivelSeleccionado === "todas" || nivel === nivelSeleccionado;

      return matchBusqueda && matchCategoria && matchNivel;
    });
  }, [allProductos, busqueda, categoriaSeleccionada, nivelSeleccionado]);

  /* =========================================
     Paginación frontend
  ========================================= */
  const total = productosFiltrados.length;

  const totalPaginas = useMemo(() => {
    return Math.max(1, Math.ceil(total / ITEMS_POR_PAGINA));
  }, [total]);

  useEffect(() => {
    if (paginaActual > totalPaginas) {
      setPaginaActual(1);
    }
  }, [paginaActual, totalPaginas]);

  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const fin = inicio + ITEMS_POR_PAGINA;
    return productosFiltrados.slice(inicio, fin);
  }, [productosFiltrados, paginaActual]);

  const paginasVisibles = useMemo(() => {
    return Array.from({ length: totalPaginas }, (_, i) => i + 1)
      .filter(
        (p) => p === 1 || p === totalPaginas || Math.abs(p - paginaActual) <= 2
      )
      .reduce((acc, p, i, arr) => {
        if (i > 0 && p - arr[i - 1] > 1) acc.push("...");
        acc.push(p);
        return acc;
      }, []);
  }, [totalPaginas, paginaActual]);

  /* =========================================
     Cards resumen
  ========================================= */
  const cardsResumen = [
    {
      title: "Total productos",
      value: resumen.total_productos,
      icon: faBoxesStacked,
      className: "stock-summaryCard--blue",
      onClick: () => {
        setNivelSeleccionado("todas");
        setPaginaActual(1);
      },
    },
    {
      title: "Sin stock",
      value: resumen.sin_stock,
      icon: faTriangleExclamation,
      className: "stock-summaryCard--red",
      onClick: () => {
        setNivelSeleccionado("sin_stock");
        setPaginaActual(1);
      },
    },
    {
      title: "Stock bajo",
      value: resumen.bajo,
      icon: faLayerGroup,
      className: "stock-summaryCard--orange",
      onClick: () => {
        setNivelSeleccionado("bajo");
        setPaginaActual(1);
      },
    },
    {
      title: "Stock medio",
      value: resumen.medio,
      icon: faWarehouse,
      className: "stock-summaryCard--yellow",
      onClick: () => {
        setNivelSeleccionado("medio");
        setPaginaActual(1);
      },
    },
    {
      title: "Stock alto",
      value: resumen.alto,
      icon: faBoxOpen,
      className: "stock-summaryCard--green",
      onClick: () => {
        setNivelSeleccionado("alto");
        setPaginaActual(1);
      },
    },
  ];

  return (
    <>
      <div className="mov-page stock-page">
        <section className="mov-card stock-heroCard">
          <div className="stock-heroCard__left">
            <div className="stock-heroIcon">
              <FontAwesomeIcon icon={faBoxesStacked} />
            </div>
            <div>
              <h2 className="stock-heroTitle">Stock</h2>
              <p className="stock-heroText">
                Visualizá todos los productos y filtralos por categoría global o
                por nivel de stock.
              </p>
            </div>
          </div>

          <div
            className="stock-heroCard__right"
            style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="mov-btn mov-btn--ghost"
              onClick={() => setModalCategoriasOpen(true)}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faTag} /> Categorías
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--ghost"
              onClick={limpiarFiltros}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faFilter} /> Limpiar filtros
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={() => recargarTodo({ mostrarToastExito: true })}
              disabled={loading}
            >
              <FontAwesomeIcon icon={faArrowRotateRight} /> Actualizar
            </button>
          </div>
        </section>

        {error && (
          <div className="mov-alert" role="alert">
            {error}
          </div>
        )}

        <section className="stock-summaryGrid">
          {cardsResumen.map((card) => (
            <button
              key={card.title}
              type="button"
              className={`stock-summaryCard ${card.className}`}
              onClick={card.onClick}
              disabled={loading}
            >
              <div className="stock-summaryCard__icon">
                <FontAwesomeIcon icon={card.icon} />
              </div>
              <div className="stock-summaryCard__body">
                <span className="stock-summaryCard__title">{card.title}</span>
                <strong className="stock-summaryCard__value">
                  {loading ? "..." : card.value}
                </strong>
              </div>
            </button>
          ))}

          <div className="stock-summaryCard stock-summaryCard--dark stock-summaryCard--static">
            <div className="stock-summaryCard__icon">
              <FontAwesomeIcon icon={faWarehouse} />
            </div>
            <div className="stock-summaryCard__body">
              <span className="stock-summaryCard__title">Total unidades</span>
              <strong className="stock-summaryCard__value">
                {loading ? "..." : resumen.total_unidades}
              </strong>
            </div>
          </div>
        </section>

        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div className="title-mov">
                <div className="mov-card__title">Stock por productos</div>
                <div className="mov-card__hint">
                  Mostrando <b>{total}</b> productos
                </div>
              </div>

              <div className="mov-headFilters stock-headFilters">
                <div className="cc-filter">
                  <div className="cc-floatingField cc-floatingField--search is-active">
                    <div className="cc-searchInput">
                      <div className="cc-searchInput__fieldWrap">
                        <input
                          className="cc-input cc-input--floating"
                          value={busqueda}
                          onChange={(e) => {
                            setBusqueda(e.target.value);
                            setPaginaActual(1);
                          }}
                          placeholder="Buscar por nombre, SKU, descripción o categoría..."
                          disabled={loading}
                        />

                        <span className="cc-floatingLabel">
                          <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                        </span>

                        {busqueda.trim() !== "" && (
                          <button
                            type="button"
                            className="cc-clearSearch cc-clearSearch--inside"
                            title="Limpiar búsqueda"
                            onClick={() => {
                              setBusqueda("");
                              setPaginaActual(1);
                            }}
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="stock-selectWrap">
                  <label className="stock-selectLabel">
                    <FontAwesomeIcon icon={faTag} /> Categoría global
                  </label>
                  <select
                    className="stock-select"
                    value={categoriaSeleccionada}
                    onChange={(e) => {
                      setCategoriaSeleccionada(e.target.value);
                      setPaginaActual(1);
                    }}
                    disabled={loading}
                  >
                    <option value="todas">Todas</option>
                    {categoriasGlobales.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div
            className="mov-gridTable mov-gridTable--head"
            style={{ gridTemplateColumns: GRID_COLS }}
            role="row"
          >
            {COLUMNS.map((c) => (
              <div
                key={c.key}
                className={[
                  "mov-gridCell",
                  "mov-gridCell--head",
                  c.align === "right" ? "is-right" : "",
                  c.align === "center" ? "is-center" : "",
                ].join(" ")}
                role="columnheader"
              >
                {c.label}
              </div>
            ))}
          </div>

          <div className="mov-tableWrap" role="rowgroup">
            <div className="mov-gridBody mov-gridBody--relative">
              {loading ? (
                <div className="stock-loadingState">Cargando stock...</div>
              ) : productosPaginados.length === 0 ? (
                <div className="cc-emptyState">
                  <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                  <div className="cc-emptyText">
                    No se encontraron productos con los filtros seleccionados.
                  </div>
                </div>
              ) : (
                productosPaginados.map((prod) => {
                  const visual = getCategoriaVisualByStock(prod.stock);

                  return (
                    <div
                      key={prod.id}
                      className="mov-gridTable mov-gridTable--row"
                      style={{ gridTemplateColumns: GRID_COLS }}
                      role="row"
                    >
                      <div
                        className="mov-gridCell is-strong"
                        role="cell"
                        data-label="PRODUCTO"
                      >
                        <span className="mov-ellipsissss">
                          {prod.nombre || "—"}
                        </span>
                      </div>

                      <div
                        className="mov-gridCell is-center"
                        role="cell"
                        data-label="SKU"
                      >
                        <span className="mov-ellipsissss">
                          {prod.sku || "—"}
                        </span>
                      </div>

                      <div
                        className="mov-gridCell is-center"
                        role="cell"
                        data-label="CATEGORÍA"
                      >
                        <span className="mov-ellipsissss">
                          {prod.categoria_nombre || "Sin categoría"}
                        </span>
                      </div>

                      <div
                        className="mov-gridCell is-center"
                        role="cell"
                        data-label="CANTIDAD"
                      >
                        <span
                          className={
                            Number(prod.stock || 0) <= 0
                              ? "mov-chip mov-chip--warn"
                              : "mov-chip mov-chip--ok"
                          }
                        >
                          {Number(prod.stock || 0)}
                        </span>
                      </div>

                      <div
                        className="mov-gridCell is-center"
                        role="cell"
                        data-label="NIVEL STOCK"
                      >
                        <span className={visual.className}>{visual.label}</span>
                      </div>

                      <div
                        className="mov-gridCell is-right"
                        role="cell"
                        data-label="PRECIO"
                      >
                        {formatMoney(prod.precio)}
                      </div>

                      <div
                        className="mov-gridCell is-right"
                        role="cell"
                        data-label="PRECIO PROMO"
                      >
                        {formatMoney(prod.precio_promo)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {totalPaginas > 1 && (
          <div className="prod-pagination">
            <button
              type="button"
              className="mov-btn mov-btn--ghost"
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
            >
              ← Anterior
            </button>

            {paginasVisibles.map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} className="prod-page-dots">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`mov-btn ${
                    p === paginaActual ? "mov-btn--primary" : "mov-btn--ghost"
                  }`}
                  onClick={() => setPaginaActual(p)}
                  style={{ minWidth: 40, padding: "0 10px" }}
                >
                  {p}
                </button>
              )
            )}

            <button
              type="button"
              className="mov-btn mov-btn--ghost"
              onClick={() =>
                setPaginaActual((p) => Math.min(totalPaginas, p + 1))
              }
              disabled={paginaActual === totalPaginas}
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      <ModalCategoriasStock
        open={modalCategoriasOpen}
        onClose={() => setModalCategoriasOpen(false)}
        onToast={mostrarToast}
        onActualizado={async () => {
          await recargarTodo({ mostrarToastExito: false });
        }}
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
}