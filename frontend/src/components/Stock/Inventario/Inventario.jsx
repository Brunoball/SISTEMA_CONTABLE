import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../config/config";
import ModalCargaMasivaInventario from "./modales/ModalCargaMasivaInventario";
import ModalHistorialInventario from "./modales/ModalHistorialInventario";
import Toast from "../../Global/Toast";
import "./Inventario.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faPlus,
  faTimes,
  faClockRotateLeft,
  faImage,
  faBoxOpen,
  faFloppyDisk,
  faArrowLeft,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;
const SKELETON_ROWS = 10;

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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";

  const n = Number(value);
  if (!Number.isFinite(n)) return "—";

  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ──────────────────────────────────────────────
   SKELETON
────────────────────────────────────────────── */
const skelWidths = {
  nombre: ["72%", "58%", "66%", "48%"],
  sku: ["44%", "34%", "40%", "30%"],
  precio: ["38%", "30%", "34%", "28%"],
  stock: ["52%", "44%", "48%", "36%"],
  historial: ["44%", "38%", "40%", "36%"],
};

const columns = [
  { key: "nombre", label: "PRODUCTO", fr: 2.4, align: "left", strong: true },
  { key: "stock", label: "STOCK", fr: 1.4, align: "center" },
  { key: "sku", label: "SKU", fr: 1.0, align: "center" },
  { key: "precio", label: "PRECIO", fr: 1.0, align: "right" },
  { key: "historial", label: "HISTORIAL", fr: 0.7, align: "center" },
];

const gridCols = columns.map((c) => `${c.fr}fr`).join(" ");

function SkeletonRow({ idx }) {
  return (
    <div
      className="mov-gridTable mov-gridTable--row mov-row--skeleton"
      style={{ gridTemplateColumns: gridCols }}
      role="row"
      aria-hidden="true"
    >
      {columns.map((c) => {
        if (c.key === "historial") {
          return (
            <div
              key={c.key}
              className="mov-gridCell mov-gridCell--actions is-center"
              role="cell"
            >
              <div className="mov-skelActions">
                <span className="mov-skelIcon" />
              </div>
            </div>
          );
        }

        if (c.key === "stock") {
          return (
            <div key={c.key} className="mov-gridCell is-center" role="cell">
              <div className="mov-skelActions">
                <span className="mov-skelIcon" style={{ width: 64 }} />
                <span className="mov-skelIcon" style={{ width: 60 }} />
              </div>
            </div>
          );
        }

        const list = skelWidths[c.key] || ["60%"];
        const w = list[idx % list.length];

        return (
          <div
            key={c.key}
            className={[
              "mov-gridCell",
              c.align === "right" ? "is-right" : "",
              c.align === "center" ? "is-center" : "",
            ].join(" ")}
            role="cell"
          >
            <span className="mov-skeletonBar" style={{ width: w }} />
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────
   PORTAL MODAL WRAPPER
────────────────────────────────────────────── */
function ModalPortal({ children, onClose }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
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

  const totalPaginas = useMemo(
    () => Math.max(1, Math.ceil(total / porPagina)),
    [total]
  );

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
        prev.map((p) => (p.id === producto.id ? { ...p, stock } : p))
      );

      mostrarToast("exito", `Stock actualizado para "${producto.nombre}".`);
    } catch (err) {
      mostrarToast("error", err.message || "Error al actualizar el stock.");
    } finally {
      setGuardandoId(null);
    }
  };

  const OrdenIcon = ({ campo }) => {
    if (orden.campo !== campo) {
      return <span className="inv-sortIcon inv-sortIcon--off">↕</span>;
    }
    return (
      <span className="inv-sortIcon inv-sortIcon--on">
        {orden.dir === "ASC" ? "↑" : "↓"}
      </span>
    );
  };

  const showSkeleton = loading;

  return (
    <>
      <div className="mov-page">
        {toast && (
          <Toast
            key={toast.id}
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            duracion={toast.duracion}
            onClose={() => setToast(null)}
          />
        )}

        {error && (
          <div className="mov-alert" role="alert">
            {error}
          </div>
        )}

        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div className="title-mov">
                <div className="mov-card__title">Stock · Inventario</div>
                <div className="mov-card__hint">
                  Mostrando <b>{productos.length}</b> de <b>{total}</b> productos
                </div>
              </div>

              <div className="mov-headFilters">
                <div className="cc-filter">
                  <div className="cc-floatingField cc-floatingField--search is-active">
                    <div className="cc-searchInput">
                      <div className="cc-searchInput__fieldWrap">
                        <input
                          className="cc-input cc-input--floating"
                          id="inv-search-input"
                          value={busqueda}
                          onChange={(e) => {
                            setBusqueda(e.target.value);
                            setPaginaActual(1);
                          }}
                          placeholder="Buscar por nombre, SKU o descripción..."
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
              </div>
            </div>

            <div
              className="mov-card__actions"
              style={{ display: "flex", gap: 10, alignItems: "center" }}
            >
              <button
                type="button"
                className="mov-btn mov-btn--primary"
                onClick={() => setModalCargaOpen(true)}
                title="Carga masiva de productos por CSV"
              >
                <FontAwesomeIcon icon={faPlus} /> Carga masiva CSV
              </button>
            </div>
          </div>

          <div
            className="mov-gridTable mov-gridTable--head"
            style={{ gridTemplateColumns: gridCols }}
            role="row"
          >
            {columns.map((c) => (
              <div
                key={c.key}
                className={[
                  "mov-gridCell",
                  "mov-gridCell--head",
                  c.key !== "historial" ? "inv-sortable" : "",
                  c.align === "right" ? "is-right" : "",
                  c.align === "center" ? "is-center" : "",
                ].join(" ")}
                role="columnheader"
                onClick={
                  c.key !== "historial" ? () => handleOrden(c.key) : undefined
                }
                style={
                  c.key !== "historial"
                    ? { cursor: "pointer", userSelect: "none" }
                    : {}
                }
              >
                {c.label}
                {c.key !== "historial" && <OrdenIcon campo={c.key} />}
              </div>
            ))}
          </div>

          <div className="mov-tableWrap" role="rowgroup">
            <div
              className={[
                "mov-gridBody",
                "mov-gridBody--relative",
                showSkeleton ? "mov-softLoading" : "",
              ].join(" ")}
            >
              {showSkeleton ? (
                <div className="mov-skeletonWrap" aria-busy="true">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                    <SkeletonRow key={i} idx={i} />
                  ))}
                </div>
              ) : (
                <>
                  {productos.length === 0 && (
                    <div className="cc-emptyState">
                      <FontAwesomeIcon
                        icon={faBoxOpen}
                        className="cc-emptyIcon"
                      />
                      <div className="cc-emptyText">
                        {busqueda.trim()
                          ? `No se encontraron productos para "${busqueda.trim()}".`
                          : "No hay productos en el inventario."}
                      </div>
                    </div>
                  )}

                  {productos.map((prod) => {
                    const draft =
                      stockDrafts[prod.id] ?? String(Number(prod.stock || 0));
                    const sinStock = Number(draft || 0) <= 0;
                    const guardando = guardandoId === prod.id;

                    return (
                      <div
                        key={prod.id}
                        className="mov-gridTable mov-gridTable--row"
                        style={{ gridTemplateColumns: gridCols }}
                        role="row"
                      >
                        <div
                          className="mov-gridCell is-strong"
                          role="cell"
                          data-label="PRODUCTO"
                        >
                          <div className="inv-productCell">
                            <div className="inv-thumb">
                              {imagenesMap[prod.id] ? (
                                <img
                                  src={imagenesMap[prod.id]}
                                  alt={prod.nombre}
                                  className="inv-thumb__img"
                                />
                              ) : (
                                <span className="prod-thumb__placeholder">
                                  <FontAwesomeIcon icon={faBoxOpen} />
                                </span>
                              )}
                            </div>

                            <div className="inv-productInfo">
                              <span className="inv-productName mov-ellipsissss">
                                {prod.nombre}
                              </span>
                              <span className="inv-productDesc mov-ellipsissss">
                                {prod.descripcion || "Sin descripción"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div
                          className="mov-gridCell is-center"
                          role="cell"
                          data-label="STOCK"
                        >
                          <div className="inv-stockBox">
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
                              className={[
                                "inv-stockInput",
                                sinStock ? "inv-stockInput--danger" : "",
                              ].join(" ")}
                            />
                            <button
                              type="button"
                              className="mov-iconBtn inv-saveBtn"
                              title="Guardar stock"
                              disabled={guardando}
                              onClick={() => handleGuardarStock(prod)}
                            >
                              {guardando ? (
                                <span className="inv-savingDot">…</span>
                              ) : (
                                <FontAwesomeIcon icon={faFloppyDisk} />
                              )}
                            </button>
                          </div>
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
                          className="mov-gridCell is-right"
                          role="cell"
                          data-label="PRECIO"
                        >
                          <span className="mov-ellipsissss">
                            {formatMoney(prod.precio)}
                          </span>
                        </div>

                        <div
                          className="mov-gridCell mov-gridCell--actions is-center"
                          role="cell"
                          data-label="HISTORIAL"
                        >
                          <div className="mov-actionsInline">
                            <button
                              type="button"
                              className="mov-iconBtn"
                              title="Ver historial"
                              onClick={() => setHistorialProducto(prod)}
                            >
                              <FontAwesomeIcon icon={faClockRotateLeft} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </section>

        {totalPaginas > 1 && (
          <div className="inv-pagination">
            <button
              type="button"
              className="mov-btn"
              disabled={paginaActual === 1}
              onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
            >
              <FontAwesomeIcon icon={faArrowLeft} /> Anterior
            </button>

            <span className="inv-pageInfo">
              Página <b>{paginaActual}</b> de <b>{totalPaginas}</b>
            </span>

            <button
              type="button"
              className="mov-btn"
              disabled={paginaActual === totalPaginas}
              onClick={() =>
                setPaginaActual((p) => Math.min(totalPaginas, p + 1))
              }
            >
              Siguiente <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </div>
        )}
      </div>

{modalCargaOpen && (
  <ModalPortal onClose={() => setModalCargaOpen(false)}>
    <ModalCargaMasivaInventario
      open={modalCargaOpen}
      onClose={() => setModalCargaOpen(false)}
      onImportado={async (mensaje) => {
        setModalCargaOpen(false);
        await fetchProductos();
        mostrarToast(
          "exito",
          mensaje || "Inventario importado correctamente."
        );
      }}
      onToast={mostrarToast}
    />
  </ModalPortal>
)}

      {historialProducto && (
        <ModalPortal onClose={() => setHistorialProducto(null)}>
          <ModalHistorialInventario
            producto={historialProducto}
            onClose={() => setHistorialProducto(null)}
          />
        </ModalPortal>
      )}
    </>
  );
};

export default Inventario;