import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

function withSessionKey(url) {
  const base = String(url || "").trim();
  if (!base) return "";

  try {
    const sessionKey = (localStorage.getItem("session_key") || "").trim();
    const token = (localStorage.getItem("token") || "").trim();
    const u = new URL(base, window.location.origin);

    if (sessionKey && !u.searchParams.has("session_key")) {
      u.searchParams.set("session_key", sessionKey);
    }

    if (token && !u.searchParams.has("token")) {
      u.searchParams.set("token", token);
    }

    return u.toString();
  } catch {
    return base;
  }
}

function notifyListsUpdated() {
  try {
    window.dispatchEvent(new CustomEvent("balto:listas-updated"));
  } catch {}
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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";

  const raw = typeof value === "string" ? value.replace(",", ".") : value;
  const n = Number(raw);

  if (!Number.isFinite(n)) return "—";

  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toNonNegativeInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function compareValues(a, b, campo) {
  const va = a?.[campo];
  const vb = b?.[campo];

  if (campo === "stock" || campo === "precio_costo" || campo === "precio" || campo === "precio_promo") {
    const na = Number(String(va ?? 0).replace(",", "."));
    const nb = Number(String(vb ?? 0).replace(",", "."));
    return na - nb;
  }

  return String(va ?? "").localeCompare(String(vb ?? ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function getProductoId(prod) {
  return Number(prod?.id ?? prod?.id_stock_producto ?? 0);
}

function getProductoCategoriaId(prod) {
  return Number(
    prod?.id_stock_categoria ??
      prod?.stock_categoria_id ??
      prod?.id_categoria_stock ??
      prod?.id_categoria ??
      0
  );
}

function normalizeCategoria(cat = {}) {
  const id = Number(cat?.id ?? cat?.id_stock_categoria ?? 0);
  return {
    ...cat,
    id,
    id_stock_categoria: id,
    nombre: String(cat?.nombre ?? cat?.label ?? ""),
  };
}

function normalizeProductoListItem(prod = {}) {
  const id = getProductoId(prod);
  if (!id) return null;

  const categoriaId = Number(
    prod?.id_stock_categoria ??
      prod?.stock_categoria_id ??
      prod?.id_categoria_stock ??
      prod?.id_categoria ??
      0
  );

  return {
    ...prod,
    id,
    id_stock_producto: Number(prod?.id_stock_producto ?? id),
    nombre: String(prod?.nombre ?? ""),
    sku: String(prod?.sku ?? ""),
    stock: prod?.stock ?? 0,
    precio_costo: prod?.precio_costo ?? null,
    precio: prod?.precio ?? null,
    precio_promo: prod?.precio_promo ?? null,
    descripcion: prod?.descripcion ?? "",
    imagen_archivo_id:
      Number(prod?.imagen_archivo_id ?? prod?.id_archivo_imagen ?? prod?.archivo_id ?? 0) || 0,
    id_stock_categoria: categoriaId || null,
    id_categoria_stock: categoriaId || null,
    updated_at:
      prod?.updated_at ??
      prod?.updatedAt ??
      prod?.fecha_actualizacion ??
      prod?.fecha_modificacion ??
      prod?.modificado_en ??
      prod?.imagen_actualizada_en ??
      prod?.ultima_actualizacion ??
      "",
  };
}

function mergeProductoEnLista(lista = [], producto = null) {
  const normalizado = normalizeProductoListItem(producto);
  if (!normalizado) return Array.isArray(lista) ? lista : [];

  const base = Array.isArray(lista) ? [...lista] : [];
  const idx = base.findIndex((item) => getProductoId(item) === getProductoId(normalizado));

  if (idx === -1) {
    return [normalizado, ...base];
  }

  base[idx] = {
    ...base[idx],
    ...normalizado,
  };

  return base;
}

function normalizeProductosCollection(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeProductoListItem(item))
    .filter(Boolean);
}

function getProductoImageRefreshToken(prod, refreshKey = 0, intento = 0) {
  const archivoId = Number(prod?.imagen_archivo_id || 0);
  const updateToken =
    prod?.updated_at ??
    prod?.updatedAt ??
    prod?.fecha_actualizacion ??
    prod?.fecha_modificacion ??
    prod?.modificado_en ??
    prod?.imagen_actualizada_en ??
    prod?.ultima_actualizacion ??
    "";

  return `${archivoId}-${String(updateToken || "")}-${String(refreshKey)}-${String(intento)}`;
}

function getProductoImageUrl(prod, apiUrl, refreshKey = 0, intento = 0) {
  const archivoId = Number(prod?.imagen_archivo_id || 0);
  if (!archivoId) return "";

  const params = new URLSearchParams({
    action: "stock_producto_imagen_ver",
    id_archivo: String(archivoId),
    _imgv: getProductoImageRefreshToken(prod, refreshKey, intento),
  });

  return withSessionKey(`${apiUrl}?${params.toString()}`);
}

function getUsuarioAuditData() {
  let idUsuarioMaster = 0;
  let idTenant = null;

  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.id_usuario_master ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      0;

    if (Number.isFinite(Number(cand))) {
      idUsuarioMaster = Number(cand);
    }

    const tenantCand =
      u?.idTenant ??
      u?.id_tenant ??
      u?.tenant_id ??
      u?.tenant?.idTenant ??
      null;

    if (
      tenantCand !== null &&
      tenantCand !== undefined &&
      tenantCand !== "" &&
      Number(tenantCand) > 0
    ) {
      idTenant = Number(tenantCand);
    }
  } catch {}

  return { idUsuarioMaster, idTenant };
}

const COLUMNS = [
  { key: "nombre", label: "PRODUCTO", fr: 2.2, align: "left", sortable: true },
  { key: "sku", label: "SKU", fr: 0.95, align: "center", sortable: true },
  { key: "stock", label: "STOCK", fr: 0.8, align: "center", sortable: true },
  { key: "precio_costo", label: "PRECIO COSTO", fr: 1.0, align: "right", sortable: true },
  { key: "precio", label: "PRECIO VENTA", fr: 1.0, align: "right", sortable: true },
  { key: "precio_promo", label: "PRECIO PROMO", fr: 1.0, align: "right", sortable: true },
  { key: "acciones", label: "ACCIONES", fr: 0.75, align: "center", sortable: false },
];

const GRID_COLS = COLUMNS.map((c) => `${c.fr}fr`).join(" ");
const SKELETON_ROWS = 10;

const SKEL_WIDTHS = {
  nombre: ["68%", "52%", "60%", "48%"],
  sku: ["44%", "36%", "40%", "32%"],
  stock: ["38%", "30%", "34%", "28%"],
  precio_costo: ["48%", "40%", "44%", "36%"],
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
  const [impactoEliminar, setImpactoEliminar] = useState(null);
  const [cargandoImpactoEliminar, setCargandoImpactoEliminar] = useState(false);
  const [errorImpactoEliminar, setErrorImpactoEliminar] = useState("");

  const [toast, setToast] = useState(null);
  const [versionImagenPorProducto, setVersionImagenPorProducto] = useState({});
  const [erroresImagenes, setErroresImagenes] = useState({});
  const [reintentosImagenes, setReintentosImagenes] = useState({});

  const refreshTimersRef = useRef([]);
  const impactoEliminarRequestRef = useRef(0);
  const productosPorPagina = 20;

  const mostrarToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({ tipo, mensaje, duracion, id: Date.now() + Math.random() });
  }, []);

  const cerrarToast = useCallback(() => setToast(null), []);

  const limpiarRefreshTimers = useCallback(() => {
    refreshTimersRef.current.forEach((id) => clearTimeout(id));
    refreshTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      limpiarRefreshTimers();
    };
  }, [limpiarRefreshTimers]);

  const invalidarMiniaturaProducto = useCallback((productoId, seed = Date.now()) => {
    const id = Number(productoId || 0);
    if (!id) return;

    setVersionImagenPorProducto((prev) => ({
      ...prev,
      [id]: seed,
    }));

    setErroresImagenes((prev) => {
      if (!prev?.[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

    setReintentosImagenes((prev) => {
      if (!prev?.[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const programarReintentoImagen = useCallback((productoId) => {
    const timerId = setTimeout(() => {
      setReintentosImagenes((prev) => ({
        ...prev,
        [productoId]: Number(prev?.[productoId] || 0) + 1,
      }));

      setErroresImagenes((prev) => {
        if (!prev?.[productoId]) return prev;
        const next = { ...prev };
        delete next[productoId];
        return next;
      });
    }, 900);

    refreshTimersRef.current.push(timerId);
  }, []);

  const recargarTodo = useCallback(async () => {
    const [productosRes, categoriasRes] = await Promise.allSettled([
      (async () => {
        const params = new URLSearchParams({
          action: "stock_productos_listar",
          activo: "1",
          pagina: "1",
          por_pagina: "10000",
          orden_campo: "nombre",
          orden_dir: "ASC",
        });

        const data = await apiGet(`${API_URL}?${params.toString()}`);
        if (data?.exito === false) {
          throw new Error(data?.mensaje || "Error al obtener productos");
        }

        return normalizeProductosCollection(data?.productos);
      })(),
      (async () => {
        const params = new URLSearchParams({ action: "stock_categorias_listar" });
        const data = await apiGet(`${API_URL}?${params.toString()}`);
        const lista = (Array.isArray(data?.categorias) ? data.categorias : [])
          .map((cat) => normalizeCategoria(cat))
          .filter((cat) => Number(cat.id_stock_categoria) > 0);

        return [...lista].sort((a, b) =>
          String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
            sensitivity: "base",
          })
        );
      })(),
    ]);

    if (productosRes.status === "fulfilled") {
      setProductosRaw(productosRes.value);
    } else {
      setProductosRaw([]);
      throw productosRes.reason;
    }

    if (categoriasRes.status === "fulfilled") {
      setCategorias(categoriasRes.value);
    } else {
      setCategorias([]);
    }
  }, []);


  const refrescarDespuesDeGuardar = useCallback(
    async (productoGuardado = null) => {
      const productoId = getProductoId(productoGuardado);

      if (productoGuardado) {
        setProductosRaw((prev) => mergeProductoEnLista(prev, productoGuardado));
        invalidarMiniaturaProducto(productoId);
      }

      try {
        await recargarTodo();
      } catch {}
    },
    [invalidarMiniaturaProducto, recargarTodo]
  );

  const fetchCategorias = useCallback(async () => {
    setLoadingCategorias(true);

    try {
      const params = new URLSearchParams({ action: "stock_categorias_listar" });
      const data = await apiGet(`${API_URL}?${params.toString()}`);
      const lista = (Array.isArray(data?.categorias) ? data.categorias : [])
        .map((cat) => normalizeCategoria(cat))
        .filter((cat) => Number(cat.id_stock_categoria) > 0);

      setCategorias(
        [...lista].sort((a, b) =>
          String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", {
            sensitivity: "base",
          })
        )
      );
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
      const params = new URLSearchParams({
        action: "stock_productos_listar",
        activo: "1",
        pagina: "1",
        por_pagina: "10000",
        orden_campo: "nombre",
        orden_dir: "ASC",
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);
      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al obtener productos");
      }

      setProductosRaw(normalizeProductosCollection(data.productos));
    } catch (err) {
      setProductosRaw([]);
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProductos();
    fetchCategorias();
  }, [fetchProductos, fetchCategorias]);

  // Escucha actualizaciones de productos (stock-updated)
  useEffect(() => {
    const handleExternalListsUpdate = async () => {
      try {
        await refrescarDespuesDeGuardar();
      } catch {}
    };

    window.addEventListener("balto:stock-updated", handleExternalListsUpdate);
    return () => window.removeEventListener("balto:stock-updated", handleExternalListsUpdate);
  }, [refrescarDespuesDeGuardar]);

  // ✅ NUEVO: Escucha actualizaciones de listas/categorías (listas-updated)
  useEffect(() => {
    const handleExternalCategoriasUpdate = async () => {
      try {
        await fetchCategorias();
      } catch {}
    };

    window.addEventListener("balto:listas-updated", handleExternalCategoriasUpdate);

    return () => {
      window.removeEventListener("balto:listas-updated", handleExternalCategoriasUpdate);
    };
  }, [fetchCategorias]);

  const productosFiltradosYOrdenados = useMemo(() => {
    let lista = Array.isArray(productosRaw) ? [...productosRaw] : [];
    const q = normalizeText(busqueda);
    const categoriaId = Number(categoriaFiltro || 0);

    if (q) {
      lista = lista.filter(
        (p) => normalizeText(p.nombre).includes(q) || normalizeText(p.sku).includes(q)
      );
    }

    if (categoriaId > 0) {
      lista = lista.filter((p) => getProductoCategoriaId(p) === categoriaId);
    }

    lista.sort((a, b) => {
      const result = compareValues(a, b, orden.campo);
      return orden.dir === "ASC" ? result : -result;
    });

    return lista;
  }, [productosRaw, busqueda, categoriaFiltro, orden]);

  const totalProductos = productosFiltradosYOrdenados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalProductos / productosPorPagina));

  useEffect(() => {
    if (paginaActual > totalPaginas) {
      setPaginaActual(totalPaginas);
    }
  }, [paginaActual, totalPaginas]);

  const productos = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    return productosFiltradosYOrdenados.slice(inicio, inicio + productosPorPagina);
  }, [productosFiltradosYOrdenados, paginaActual]);

  const handleBusqueda = (e) => {
    setBusqueda(e.target.value);
    setPaginaActual(1);
  };

  const handleCategoriaFiltro = (e) => {
    setCategoriaFiltro(e.target.value);
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

  const consultarImpactoEliminacion = useCallback(async (productoId) => {
    const id = Number(productoId || 0);
    if (!id) return;

    const requestId = impactoEliminarRequestRef.current + 1;
    impactoEliminarRequestRef.current = requestId;
    setCargandoImpactoEliminar(true);
    setErrorImpactoEliminar("");
    setImpactoEliminar(null);

    try {
      const params = new URLSearchParams({
        action: "stock_producto_impacto_eliminacion",
        id: String(id),
      });

      const data = await apiGet(`${API_URL}?${params.toString()}`);
      if (data?.exito === false) {
        throw new Error(data?.mensaje || "No se pudo consultar el impacto de eliminación.");
      }

      if (impactoEliminarRequestRef.current !== requestId) return;
      setImpactoEliminar(data?.impacto || null);
    } catch (err) {
      if (impactoEliminarRequestRef.current !== requestId) return;
      setErrorImpactoEliminar(
        err?.message || "No se pudo consultar cuántos movimientos se afectarían."
      );
    } finally {
      if (impactoEliminarRequestRef.current === requestId) {
        setCargandoImpactoEliminar(false);
      }
    }
  }, []);

  const handleAbrirEliminar = (producto) => {
    const productoId = getProductoId(producto);

    if (!productoId || productoId <= 0) {
      mostrarToast("error", "ID de producto inválido.");
      return;
    }

    setProductoEliminar({
      ...producto,
      id: productoId,
    });
    setImpactoEliminar(null);
    setErrorImpactoEliminar("");
    setCargandoImpactoEliminar(true);
    setModalEliminarAbierto(true);
    consultarImpactoEliminacion(productoId);
  };

  const handleCerrarEliminar = () => {
    if (eliminando) return;
    impactoEliminarRequestRef.current += 1;
    setModalEliminarAbierto(false);
    setProductoEliminar(null);
    setImpactoEliminar(null);
    setErrorImpactoEliminar("");
    setCargandoImpactoEliminar(false);
  };

  const handleConfirmarEliminar = async () => {
    const productoId = getProductoId(productoEliminar);

    if (!productoId || productoId <= 0) {
      throw new Error("ID de producto inválido.");
    }

    setEliminando(true);

    try {
      const { idUsuarioMaster, idTenant } = getUsuarioAuditData();

      const payload = {
        action: "stock_productos_eliminar",
        id: productoId,
        idUsuarioMaster,
      };

      if (idTenant) {
        payload.tenant_id = idTenant;
      }

      const data = await apiPost(API_URL, payload);

      if (data.exito === false) {
        throw new Error(data.mensaje || "Error al eliminar el producto");
      }

      setProductosRaw((prev) =>
        prev.filter((p) => getProductoId(p) !== productoId)
      );
      
      setErroresImagenes((prev) => {
        const next = { ...prev };
        delete next[productoId];
        return next;
      });
      setReintentosImagenes((prev) => {
        const next = { ...prev };
        delete next[productoId];
        return next;
      });

      setModalEliminarAbierto(false);
      setProductoEliminar(null);
      await refrescarDespuesDeGuardar();
      notifyListsUpdated();
      mostrarToast("exito", "Producto eliminado correctamente.");
    } catch (error) {
      mostrarToast("error", error.message || "No se pudo eliminar el producto.");
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

  const impactoEliminacionProducto = useMemo(() => {
    if (!productoEliminar) return null;

    const baseStyle = {
      marginTop: "12px",
      padding: "12px 14px",
      borderRadius: "14px",
      border: "1px solid #fde68a",
      background: "#fffbeb",
      color: "#92400e",
      fontSize: "13px",
      lineHeight: 1.45,
      textAlign: "left",
    };

    if (cargandoImpactoEliminar) {
      return (
        <div style={baseStyle}>
          <strong>Consultando movimientos...</strong>
          <div>Se está verificando en la base de datos cuántos registros usan este producto.</div>
        </div>
      );
    }

    if (errorImpactoEliminar) {
      return (
        <div
          style={{
            ...baseStyle,
            borderColor: "#fecaca",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          <strong>No se pudo consultar el impacto.</strong>
          <div>{errorImpactoEliminar}</div>
        </div>
      );
    }

    if (!impactoEliminar) return null;

    const itemsAfectados = toNonNegativeInt(impactoEliminar.total_items_afectados);
    const movimientosAfectados = toNonNegativeInt(impactoEliminar.total_movimientos_afectados);
    const movimientosSinProductos = toNonNegativeInt(
      impactoEliminar.movimientos_quedarian_sin_productos
    );
    const movimientosConOtrosProductos = toNonNegativeInt(
      impactoEliminar.movimientos_con_otros_productos
    );

    if (movimientosAfectados <= 0) {
      return (
        <div
          style={{
            ...baseStyle,
            borderColor: "#bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
          }}
        >
          <strong>Impacto en movimientos</strong>
          <div>Este producto no está usado en ningún movimiento.</div>
        </div>
      );
    }

    return (
      <div style={baseStyle}>
        <strong>Impacto en movimientos</strong>
        <div>
          Este producto está usado en {pluralize(itemsAfectados, "ítem", "ítems")} de {" "}
          {pluralize(movimientosAfectados, "movimiento")}.
        </div>
        {movimientosSinProductos > 0 ? (
          <div style={{ marginTop: "6px", fontWeight: 700 }}>
            Atención: {pluralize(movimientosSinProductos, "movimiento")} {" "}
            {movimientosSinProductos === 1 ? "quedaría" : "quedarían"} sin productos asociados.
          </div>
        ) : (
          <div style={{ marginTop: "6px" }}>
            Ningún movimiento quedaría vacío, porque {" "}
            {pluralize(movimientosConOtrosProductos, "movimiento")} {" "}
            {movimientosConOtrosProductos === 1 ? "tiene" : "tienen"} otros productos cargados.
          </div>
        )}
      </div>
    );
  }, [
    productoEliminar,
    cargandoImpactoEliminar,
    errorImpactoEliminar,
    impactoEliminar,
  ]);

  const OrdenIcon = ({ campo }) => {
    if (orden.campo !== campo) {
      return <FontAwesomeIcon icon={faSort} className="prod-sortIcon prod-sortIcon--inactive" />;
    }

    return (
      <FontAwesomeIcon
        icon={orden.dir === "ASC" ? faChevronUp : faChevronDown}
        className="prod-sortIcon prod-sortIcon--active"
      />
    );
  };

  const renderSkeletonRow = (idx) => (
    <div
      key={`skel-${idx}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton"
      style={{ gridTemplateColumns: GRID_COLS }}
      role="row"
      aria-hidden="true"
    >
      {COLUMNS.map((c) => {
        if (c.key === "acciones") {
          return (
            <div key={c.key} className="mov-gridCell mov-gridCell--actions is-center" role="cell">
              <div className="mov-skelActions">
                <span className="mov-skelIcon" />
                <span className="mov-skelIcon" />
              </div>
            </div>
          );
        }

        const list = SKEL_WIDTHS[c.key] || ["60%"];
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

  return (
    <>
      <div className="mov-page">
        {error && (
          <div className="mov-alert" role="alert">
            {error}
          </div>
        )}

        <section className="mov-card mov-card--table">
          <div className="mov-card__head">
            <div className="mov-card__headLeft">
              <div className="title-mov">
                <div className="mov-card__title">Stock · Productos</div>
                <div className="mov-card__hint">
                  Mostrando <b>{totalProductos}</b> productos
                </div>
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

                <div className="cc-filter">
                  <div className="cc-floatingField is-active">
                    <select
                      className="cc-input cc-input--floating"
                      value={categoriaFiltro}
                      onChange={handleCategoriaFiltro}
                      disabled={loading || loadingCategorias}
                    >
                      <option value="">Todas</option>
                      {categorias.map((cat) => (
                        <option key={cat.id_stock_categoria} value={cat.id_stock_categoria}>
                          {cat.nombre}
                        </option>
                      ))}
                    </select>
                    <span className="cc-floatingLabel">
                      <FontAwesomeIcon icon={faLayerGroup} /> Categoría
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mov-card__actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="mov-btn mov-btn--primary"
                onClick={() => setModalAbierto(true)}
              >
                <FontAwesomeIcon icon={faPlus} /> Agregar producto
              </button>
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
                  c.sortable ? "prod-th--sortable" : "",
                ].join(" ")}
                role="columnheader"
                onClick={c.sortable ? () => handleOrden(c.key) : undefined}
              >
                {c.label}
                {c.sortable && <OrdenIcon campo={c.key} />}
              </div>
            ))}
          </div>

          <div className="mov-tableWrap" role="rowgroup">
            <div
              className={[
                "mov-gridBody",
                "mov-gridBody--relative",
                loading ? "mov-softLoading" : "",
              ].join(" ")}
            >
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
                        {busqueda.trim() || categoriaFiltro
                          ? "No se encontraron productos con los filtros seleccionados."
                          : "No hay productos para mostrar."}
                      </div>
                    </div>
                  ) : (
                    productos.map((prod) => {
                      const productoId = getProductoId(prod);
                      const archivoId = Number(prod?.imagen_archivo_id || 0);
                      const intentoImagen = Number(reintentosImagenes?.[productoId] || 0);
                      const imagenRota = !!erroresImagenes[productoId];
                      const imageUrl =
                        archivoId > 0
                          ? getProductoImageUrl(
                              prod,
                              API_URL,
                              versionImagenPorProducto[productoId] || 0,
                              intentoImagen
                            )
                          : "";

                      return (
                        <div
                          key={productoId}
                          className="mov-gridTable mov-gridTable--row"
                          style={{ gridTemplateColumns: GRID_COLS }}
                          role="row"
                        >
                          <div className="mov-gridCell is-strong" role="cell" data-label="PRODUCTO">
                            <div className="prod-productCell">
                              <div className="prod-thumb">
                                {archivoId > 0 && imageUrl && !imagenRota ? (
                                  <img
                                    src={imageUrl}
                                    alt={prod.nombre}
                                    className="prod-thumb__img"
                                    loading="lazy"
                                    decoding="async"
                                    onLoad={() => {
                                      setErroresImagenes((prev) => {
                                        if (!prev?.[productoId]) return prev;
                                        const next = { ...prev };
                                        delete next[productoId];
                                        return next;
                                      });
                                    }}
                                    onError={() => {
                                      if (intentoImagen < 6) {
                                        programarReintentoImagen(productoId);
                                        return;
                                      }

                                      setErroresImagenes((prev) => ({
                                        ...prev,
                                        [productoId]: true,
                                      }));
                                    }}
                                  />
                                ) : (
                                  <span className="prod-thumb__placeholder">
                                    <FontAwesomeIcon icon={faBoxOpen} />
                                  </span>
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

                              if (stockNum > 10) {
                                stockClass = "mov-chip mov-chip--ok";
                                stockLabel = stockNum;
                              } else if (stockNum > 0 && stockNum <= 10) {
                                stockClass = "mov-chip mov-chip--warn";
                                stockLabel = stockNum;
                              }

                              return <span className={stockClass}>{stockLabel}</span>;
                            })()}
                          </div>

                          <div
                            className="mov-gridCell is-right"
                            role="cell"
                            data-label="PRECIO COSTO"
                          >
                            <span className="mov-ellipsissss">{formatMoney(prod.precio_costo)}</span>
                          </div>

                          <div
                            className="mov-gridCell is-right"
                            role="cell"
                            data-label="PRECIO VENTA"
                          >
                            <span className="mov-ellipsissss">{formatMoney(prod.precio)}</span>
                          </div>

                          <div
                            className="mov-gridCell is-right"
                            role="cell"
                            data-label="PRECIO PROMO"
                          >
                            <span className="mov-ellipsissss prod-promo">
                              {formatMoney(prod.precio_promo)}
                            </span>
                          </div>

                          <div
                            className="mov-gridCell mov-gridCell--actions is-center"
                            role="cell"
                            data-label="ACCIONES"
                          >
                            <div className="mov-actionsInline">
                              <button
                                type="button"
                                title="Editar"
                                className="mov-iconBtn"
                                onClick={() => handleAbrirEditar(productoId)}
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                title="Eliminar"
                                className="mov-iconBtn mov-iconBtn--danger"
                                onClick={() => handleAbrirEliminar(prod)}
                              >
                                <FontAwesomeIcon icon={faTrashCan} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
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
                  className={`mov-btn ${p === paginaActual ? "mov-btn--primary" : "mov-btn--ghost"}`}
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
              onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
            >
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
          onGuardado={async (productoGuardado) => {
            setModalAbierto(false);
            await refrescarDespuesDeGuardar(productoGuardado);
            notifyListsUpdated();
            mostrarToast("exito", "Producto agregado correctamente.");
          }}
          onImportado={async (mensaje) => {
            setModalAbierto(false);
            await refrescarDespuesDeGuardar();
            notifyListsUpdated();
            mostrarToast("exito", mensaje || "Importación finalizada correctamente.");
          }}
          categorias={categorias}
          loadingCategorias={loadingCategorias}
        />
      )}

      {modalEditarAbierto && productoEditarId && (
        <ModalEditarProducto
          productoId={productoEditarId}
          onClose={handleCerrarEditar}
          onToast={mostrarToast}
          onGuardado={async (productoGuardado) => {
            handleCerrarEditar();
            await refrescarDespuesDeGuardar(productoGuardado);
            notifyListsUpdated();
            mostrarToast("exito", "Producto editado correctamente.");
          }}
        />
      )}

      <ModalEliminar
        open={modalEliminarAbierto}
        row={
          productoEliminar
            ? {
                id: getProductoId(productoEliminar),
                nombre: productoEliminar.nombre,
                sku: productoEliminar.sku,
                stock: productoEliminar.stock,
                precio_costo: productoEliminar.precio_costo,
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
        confirmDisabled={cargandoImpactoEliminar}
        confirmVariant="danger"
        extraContent={impactoEliminacionProducto}
        details={
          productoEliminar
            ? [
                { label: "ID Producto", value: `#${getProductoId(productoEliminar)}` },
                { label: "Nombre", value: productoEliminar.nombre || "—" },
                { label: "SKU", value: productoEliminar.sku || "—" },
                {
                  label: "Stock",
                  value:
                    productoEliminar.stock === null ||
                    productoEliminar.stock === undefined ||
                    productoEliminar.stock === ""
                      ? "—"
                      : String(productoEliminar.stock),
                },
                { label: "Precio costo", value: formatMoney(productoEliminar.precio_costo) },
                { label: "Precio venta", value: formatMoney(productoEliminar.precio) },
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

export default Stock;