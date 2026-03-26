import React, { useCallback, useEffect, useMemo, useState } from "react";
import BASE_URL from "../../../config/config";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/Global_responsive.css";
import Toast from "../../Global/Toast.jsx";
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
} from "@fortawesome/free-solid-svg-icons";
import "./Stock.css";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;
const ITEMS_POR_PAGINA = 20;

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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getCategoriaVisual(key) {
  switch (String(key || "").toLowerCase()) {
    case "sin_stock":
      return {
        label: "Sin stock",
        className: "stock-badge stock-badge--sin",
      };
    case "bajo":
      return {
        label: "Stock bajo",
        className: "stock-badge stock-badge--bajo",
      };
    case "medio":
      return {
        label: "Stock medio",
        className: "stock-badge stock-badge--medio",
      };
    case "alto":
      return {
        label: "Stock alto",
        className: "stock-badge stock-badge--alto",
      };
    default:
      return {
        label: "Sin categoría",
        className: "stock-badge",
      };
  }
}

const COLUMNS = [
  { key: "nombre", label: "PRODUCTO", fr: 2.5, align: "left" },
  { key: "sku", label: "SKU", fr: 1.1, align: "center" },
  { key: "stock", label: "CANTIDAD", fr: 0.9, align: "center" },
  { key: "categoria", label: "CATEGORÍA", fr: 1.2, align: "center" },
  { key: "precio", label: "PRECIO", fr: 1, align: "right" },
  { key: "precio_promo", label: "PRECIO PROMO", fr: 1, align: "right" },
];

const GRID_COLS = COLUMNS.map((c) => `${c.fr}fr`).join(" ");

export default function Stock() {
  const [resumen, setResumen] = useState({
    total_productos: 0,
    total_unidades: 0,
    sin_stock: 0,
    bajo: 0,
    medio: 0,
    alto: 0,
  });

  const [productos, setProductos] = useState([]);
  const [total, setTotal] = useState(0);

  const [loadingResumen, setLoadingResumen] = useState(true);
  const [loadingLista, setLoadingLista] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [paginaActual, setPaginaActual] = useState(1);

  const [toast, setToast] = useState(null);

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({
      id: `${Date.now()}-${Math.random()}`,
      tipo,
      mensaje,
      duracion,
    });
  }, []);

  const cerrarToast = useCallback(() => setToast(null), []);

  const fetchResumen = useCallback(async () => {
    setLoadingResumen(true);

    try {
      const data = await apiGet(`${API_URL}?action=stock_resumen_categorias`);

      setResumen({
        total_productos: Number(data?.resumen?.total_productos || 0),
        total_unidades: Number(data?.resumen?.total_unidades || 0),
        sin_stock: Number(data?.resumen?.sin_stock || 0),
        bajo: Number(data?.resumen?.bajo || 0),
        medio: Number(data?.resumen?.medio || 0),
        alto: Number(data?.resumen?.alto || 0),
      });
    } finally {
      setLoadingResumen(false);
    }
  }, []);

  const fetchProductos = useCallback(async () => {
    setLoadingLista(true);
    setError("");

    try {
      const params = new URLSearchParams({
        action: "stock_categorias_listar",
        busqueda: busqueda.trim(),
        categoria,
        pagina: String(paginaActual),
        por_pagina: String(ITEMS_POR_PAGINA),
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);

      setProductos(Array.isArray(data?.productos) ? data.productos : []);
      setTotal(Number(data?.total || 0));
    } catch (err) {
      setProductos([]);
      setTotal(0);
      setError(err?.message || "Error al cargar el stock.");
    } finally {
      setLoadingLista(false);
    }
  }, [busqueda, categoria, paginaActual]);

  const recargarTodo = useCallback(async () => {
    try {
      await Promise.all([fetchResumen(), fetchProductos()]);
      mostrarToast("exito", "Stock actualizado correctamente.");
    } catch (err) {
      setError(err?.message || "No se pudo actualizar la información.");
      mostrarToast("error", err?.message || "Error al actualizar.");
    }
  }, [fetchResumen, fetchProductos, mostrarToast]);

  const limpiarFiltros = useCallback(() => {
    setBusqueda("");
    setCategoria("todas");
    setPaginaActual(1);
  }, []);

  useEffect(() => {
    fetchResumen().catch((err) => {
      setError(err?.message || "No se pudo cargar el resumen.");
    });
  }, [fetchResumen]);

  useEffect(() => {
    fetchProductos().catch((err) => {
      setError(err?.message || "No se pudo cargar la lista.");
    });
  }, [fetchProductos]);

  const totalPaginas = useMemo(() => {
    return Math.max(1, Math.ceil(total / ITEMS_POR_PAGINA));
  }, [total]);

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

  const cardsResumen = [
    {
      title: "Total productos",
      value: resumen.total_productos,
      icon: faBoxesStacked,
      className: "stock-summaryCard--blue",
      onClick: () => {
        setCategoria("todas");
        setPaginaActual(1);
      },
    },
    {
      title: "Sin stock",
      value: resumen.sin_stock,
      icon: faTriangleExclamation,
      className: "stock-summaryCard--red",
      onClick: () => {
        setCategoria("sin_stock");
        setPaginaActual(1);
      },
    },
    {
      title: "Stock bajo",
      value: resumen.bajo,
      icon: faLayerGroup,
      className: "stock-summaryCard--orange",
      onClick: () => {
        setCategoria("bajo");
        setPaginaActual(1);
      },
    },
    {
      title: "Stock medio",
      value: resumen.medio,
      icon: faWarehouse,
      className: "stock-summaryCard--yellow",
      onClick: () => {
        setCategoria("medio");
        setPaginaActual(1);
      },
    },
    {
      title: "Stock alto",
      value: resumen.alto,
      icon: faBoxOpen,
      className: "stock-summaryCard--green",
      onClick: () => {
        setCategoria("alto");
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
                Visualizá los productos agrupados por categorías según su cantidad
                disponible.
              </p>
            </div>
          </div>

          <div className="stock-heroCard__right">
            <button
              type="button"
              className="mov-btn mov-btn--ghost"
              onClick={limpiarFiltros}
              disabled={loadingLista}
            >
              <FontAwesomeIcon icon={faFilter} /> Limpiar filtros
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={recargarTodo}
              disabled={loadingLista || loadingResumen}
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
              disabled={loadingResumen}
            >
              <div className="stock-summaryCard__icon">
                <FontAwesomeIcon icon={card.icon} />
              </div>
              <div className="stock-summaryCard__body">
                <span className="stock-summaryCard__title">{card.title}</span>
                <strong className="stock-summaryCard__value">
                  {loadingResumen ? "..." : card.value}
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
                {loadingResumen ? "..." : resumen.total_unidades}
              </strong>
            </div>
          </div>
        </section>

        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div className="title-mov">
                <div className="mov-card__title">Stock por categorías</div>
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
                          placeholder="Buscar por nombre o SKU..."
                          disabled={loadingLista}
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
                  <label className="stock-selectLabel">Categoría</label>
                  <select
                    className="stock-select"
                    value={categoria}
                    onChange={(e) => {
                      setCategoria(e.target.value);
                      setPaginaActual(1);
                    }}
                    disabled={loadingLista}
                  >
                    <option value="todas">Todas</option>
                    <option value="sin_stock">Sin stock</option>
                    <option value="bajo">Stock bajo</option>
                    <option value="medio">Stock medio</option>
                    <option value="alto">Stock alto</option>
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
              {loadingLista ? (
                <div className="stock-loadingState">Cargando stock...</div>
              ) : productos.length === 0 ? (
                <div className="cc-emptyState">
                  <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                  <div className="cc-emptyText">
                    {busqueda.trim()
                      ? `No se encontraron productos para "${busqueda.trim()}".`
                      : "No hay productos para mostrar en esta categoría."}
                  </div>
                </div>
              ) : (
                productos.map((prod) => {
                  const visual = getCategoriaVisual(prod.categoria_stock);

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
                        <span className="mov-ellipsissss">{prod.nombre || "—"}</span>
                      </div>

                      <div
                        className="mov-gridCell is-center"
                        role="cell"
                        data-label="SKU"
                      >
                        <span className="mov-ellipsissss">{prod.sku || "—"}</span>
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
                        data-label="CATEGORÍA"
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