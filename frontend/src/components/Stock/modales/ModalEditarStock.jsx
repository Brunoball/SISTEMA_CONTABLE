import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./ModalCargaMasiva.css";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante";
import {
  faBoxOpen,
  faTag,
  faDollarSign,
  faAlignLeft,
  faTrashCan,
  faRefresh,
  faXmark,
  faFloppyDisk,
  faPaperclip,
  faArrowUpFromBracket,
  faBarcode,
  faCubesStacked,
  faEye,
  faPercent,
  faMoneyBillTrendUp,
  faLayerGroup,
  faTriangleExclamation,
  faImage,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../config/config";

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

function buildHeadersMultipart() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
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

function getProductoImageUrlByArchivoId(archivoId) {
  const id = Number(archivoId || 0);
  if (!id) return "";

  const params = new URLSearchParams({
    action: "stock_producto_imagen_ver",
    id_archivo: String(id),
  });

  return withSessionKey(`${API_URL}?${params.toString()}`);
}

function inferImageMimeFromUrl(url = "") {
  const s = String(url || "").toLowerCase().split("?")[0].split("#")[0];

  if (s.endsWith(".png")) return "image/png";
  if (s.endsWith(".jpg") || s.endsWith(".jpeg")) return "image/jpeg";
  if (s.endsWith(".webp")) return "image/webp";
  if (s.endsWith(".gif")) return "image/gif";

  return "image/jpeg";
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

async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error("Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }

  const text = await res.text();

  if (!text) {
    throw new Error("Respuesta vacía del servidor.");
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 400 ? text.slice(0, 400) + "..." : text;

    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

  return data;
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

function parseNumberFromInput(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);

  return Number.isNaN(num) ? null : num;
}

function formatNumberForDisplay(value) {
  if (value === null || value === undefined || value === "") return "";

  const num =
    typeof value === "number"
      ? value
      : parseFloat(String(value).replace(",", "."));

  if (Number.isNaN(num)) return "";
  if (Number.isInteger(num)) return num.toString();

  return num.toString().replace(".", ",");
}

function formatNumberWithCents(value) {
  if (value === null || value === undefined || value === "") return "";

  const num = parseNumberFromInput(value);
  if (num === null) return "";

  return num.toFixed(2).replace(".", ",");
}

function formatNumberForApi(value) {
  if (value === null || value === undefined || value === "") return null;

  const num = typeof value === "number" ? value : parseNumberFromInput(value);
  if (num === null) return null;

  return Number(num.toFixed(2));
}

function formatPricingResult(result, withCents = false) {
  const formatter = withCents ? formatNumberWithCents : formatNumberForDisplay;

  return {
    price: formatter(result.price),
    marginPct: formatter(result.marginPct),
    marginValue: formatter(result.marginValue),
  };
}

function recalculatePricingGroup({
  cost,
  price,
  marginPct,
  marginValue,
  source,
}) {
  const c = cost !== null && cost !== "" ? parseNumberFromInput(cost) : null;
  let p = price !== null && price !== "" ? parseNumberFromInput(price) : null;
  let pct =
    marginPct !== null && marginPct !== ""
      ? parseNumberFromInput(marginPct)
      : null;
  let val =
    marginValue !== null && marginValue !== ""
      ? parseNumberFromInput(marginValue)
      : null;

  if (!source) {
    return {
      price: formatNumberForDisplay(price),
      marginPct: formatNumberForDisplay(marginPct),
      marginValue: formatNumberForDisplay(marginValue),
    };
  }

  if (source === "price") {
    if (p === null) {
      return {
        price: "",
        marginPct: formatNumberForDisplay(marginPct),
        marginValue: formatNumberForDisplay(marginValue),
      };
    }

    if (c !== null) {
      val = p - c;
      pct = c !== 0 ? (val / c) * 100 : 0;
    }

    return {
      price: formatNumberForDisplay(p),
      marginPct:
        c !== null ? formatNumberForDisplay(pct) : formatNumberForDisplay(marginPct),
      marginValue:
        c !== null ? formatNumberForDisplay(val) : formatNumberForDisplay(marginValue),
    };
  }

  if (source === "marginPct") {
    if (c === null || pct === null) {
      return {
        price: formatNumberForDisplay(price),
        marginPct: formatNumberForDisplay(marginPct),
        marginValue: formatNumberForDisplay(marginValue),
      };
    }

    val = (c * pct) / 100;
    p = c + val;

    return {
      price: formatNumberForDisplay(p),
      marginPct: formatNumberForDisplay(pct),
      marginValue: formatNumberForDisplay(val),
    };
  }

  if (source === "marginValue") {
    if (c === null || val === null) {
      return {
        price: formatNumberForDisplay(price),
        marginPct: formatNumberForDisplay(marginPct),
        marginValue: formatNumberForDisplay(marginValue),
      };
    }

    p = c + val;
    pct = c !== 0 ? (val / c) * 100 : 0;

    return {
      price: formatNumberForDisplay(p),
      marginPct: formatNumberForDisplay(pct),
      marginValue: formatNumberForDisplay(val),
    };
  }

  return {
    price: formatNumberForDisplay(price),
    marginPct: formatNumberForDisplay(marginPct),
    marginValue: formatNumberForDisplay(marginValue),
  };
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function hydratePricingGroupValues({ cost, price, marginPct, marginValue }) {
  const hasPrice = hasValue(price);
  const hasPct = hasValue(marginPct);
  const hasVal = hasValue(marginValue);

  if (hasPrice && hasPct && hasVal) {
    return {
      price: formatNumberForDisplay(price),
      marginPct: formatNumberForDisplay(marginPct),
      marginValue: formatNumberForDisplay(marginValue),
    };
  }

  const source = hasPrice
    ? "price"
    : hasPct
      ? "marginPct"
      : hasVal
        ? "marginValue"
        : null;

  if (!source) {
    return { price: "", marginPct: "", marginValue: "" };
  }

  return recalculatePricingGroup({
    cost,
    price,
    marginPct,
    marginValue,
    source,
  });
}

function hydratePricingFormValues(sourceForm) {
  const venta = hydratePricingGroupValues({
    cost: sourceForm.precio_costo,
    price: sourceForm.precio,
    marginPct: sourceForm.margen_venta_porcentaje,
    marginValue: sourceForm.margen_venta_valor,
  });

  const promo = hydratePricingGroupValues({
    cost: sourceForm.precio_costo,
    price: sourceForm.precio_promo,
    marginPct: sourceForm.margen_promo_porcentaje,
    marginValue: sourceForm.margen_promo_valor,
  });

  const extras = (sourceForm.tipos_precio_extra || []).map((item) => {
    const result = hydratePricingGroupValues({
      cost: sourceForm.precio_costo,
      price: item.precio,
      marginPct: item.margen_porcentaje,
      marginValue: item.margen_valor,
    });

    return {
      ...item,
      precio: result.price,
      margen_porcentaje: result.marginPct,
      margen_valor: result.marginValue,
    };
  });

  return {
    ...sourceForm,
    precio_costo: formatNumberForDisplay(sourceForm.precio_costo),
    precio: venta.price,
    margen_venta_porcentaje: venta.marginPct,
    margen_venta_valor: venta.marginValue,
    precio_promo: promo.price,
    margen_promo_porcentaje: promo.marginPct,
    margen_promo_valor: promo.marginValue,
    tipos_precio_extra: extras,
  };
}

function recalculatePricingFormLive(prev, fieldName, rawValue) {
  const next = { ...prev, [fieldName]: rawValue };

  if (fieldName === "precio_costo") {
    return hydratePricingFormValues(next);
  }

  if (
    ["precio", "margen_venta_porcentaje", "margen_venta_valor"].includes(
      fieldName
    )
  ) {
    const source =
      fieldName === "precio"
        ? "price"
        : fieldName === "margen_venta_porcentaje"
          ? "marginPct"
          : "marginValue";

    const result = recalculatePricingGroup({
      cost: next.precio_costo,
      price: next.precio,
      marginPct: next.margen_venta_porcentaje,
      marginValue: next.margen_venta_valor,
      source,
    });

    return {
      ...next,
      precio: result.price,
      margen_venta_porcentaje: result.marginPct,
      margen_venta_valor: result.marginValue,
    };
  }

  if (
    ["precio_promo", "margen_promo_porcentaje", "margen_promo_valor"].includes(
      fieldName
    )
  ) {
    const source =
      fieldName === "precio_promo"
        ? "price"
        : fieldName === "margen_promo_porcentaje"
          ? "marginPct"
          : "marginValue";

    const result = recalculatePricingGroup({
      cost: next.precio_costo,
      price: next.precio_promo,
      marginPct: next.margen_promo_porcentaje,
      marginValue: next.margen_promo_valor,
      source,
    });

    return {
      ...next,
      precio_promo: result.price,
      margen_promo_porcentaje: result.marginPct,
      margen_promo_valor: result.marginValue,
    };
  }

  return next;
}

function emptyExtraPriceRow(tipo = null) {
  return {
    id_tipo_precio_stock: String(tipo?.id_tipo_precio_stock ?? tipo?.id ?? ""),
    tipo_nombre: normalizeOptionLabel(tipo, ""),
    precio: "",
    margen_porcentaje: "",
    margen_valor: "",
  };
}

function findTipoPrecioByName(preciosPorTipo, names = []) {
  const wanted = names.map((n) => String(n || "").trim().toUpperCase());

  return (Array.isArray(preciosPorTipo) ? preciosPorTipo : []).find((item) =>
    wanted.includes(String(item?.tipo_nombre || "").trim().toUpperCase())
  );
}

function normalizarProducto(data) {
  const p = data?.producto || data?.data || data || {};
  const preciosPorTipo = Array.isArray(p.precios_por_tipo)
    ? p.precios_por_tipo
    : [];

  const costoItem = findTipoPrecioByName(preciosPorTipo, ["PRECIO DE COSTO"]);
  const ventaItem = findTipoPrecioByName(preciosPorTipo, ["PRECIO DE VENTA"]);
  const promoItem = findTipoPrecioByName(preciosPorTipo, [
    "PRECIO PROMOCIONAL",
    "PRECIO PROMO",
  ]);

  const tiposExtra = preciosPorTipo
    .filter((item) => {
      const nombre = String(item?.tipo_nombre || "").trim().toUpperCase();

      return ![
        "PRECIO DE COSTO",
        "PRECIO DE VENTA",
        "PRECIO PROMOCIONAL",
        "PRECIO PROMO",
      ].includes(nombre);
    })
    .map((item) => ({
      id_tipo_precio_stock: String(item?.id_tipo_precio_stock ?? item?.id ?? ""),
      tipo_nombre: normalizeOptionLabel(item, item?.tipo_nombre ?? ""),
      precio: formatNumberForDisplay(item?.precio ?? item?.monto ?? ""),
      margen_porcentaje: formatNumberForDisplay(item?.margen_porcentaje ?? ""),
      margen_valor: formatNumberForDisplay(item?.margen_valor ?? ""),
    }));

  return {
    id: p.id ?? p.id_stock_producto ?? "",
    nombre: toUpperCaseValue(p.nombre ?? ""),
    sku: toUpperCaseValue(p.sku ?? ""),
    precio_costo: formatNumberForDisplay(
      costoItem?.precio ?? costoItem?.monto ?? p.precio_costo ?? ""
    ),
    precio: formatNumberForDisplay(
      ventaItem?.precio ?? ventaItem?.monto ?? p.precio ?? ""
    ),
    margen_venta_porcentaje: formatNumberForDisplay(
      ventaItem?.margen_porcentaje ?? ""
    ),
    margen_venta_valor: formatNumberForDisplay(ventaItem?.margen_valor ?? ""),
    precio_promo: formatNumberForDisplay(
      promoItem?.precio ?? promoItem?.monto ?? p.precio_promo ?? ""
    ),
    margen_promo_porcentaje: formatNumberForDisplay(
      promoItem?.margen_porcentaje ?? ""
    ),
    margen_promo_valor: formatNumberForDisplay(promoItem?.margen_valor ?? ""),
    stock:
      p.stock !== null && p.stock !== undefined && p.stock !== ""
        ? String(p.stock)
        : "",
    descripcion: toUpperCaseValue(p.descripcion ?? ""),
    imagen_url: p.imagen_url ?? p.imagen ?? "",
    imagen_archivo_id: p.imagen_archivo_id ? Number(p.imagen_archivo_id) : null,
    id_categoria_stock: normalizeCategoriaId(p.id_categoria_stock),
    tipos_precio_extra:
      Array.isArray(p.tipos_precio_extra) && p.tipos_precio_extra.length > 0
        ? p.tipos_precio_extra.map((item) => ({
            id_tipo_precio_stock: String(
              item?.id_tipo_precio_stock ?? item?.id ?? ""
            ),
            tipo_nombre: normalizeOptionLabel(item, item?.tipo_nombre ?? ""),
            precio: formatNumberForDisplay(item?.precio ?? item?.monto ?? ""),
            margen_porcentaje: formatNumberForDisplay(
              item?.margen_porcentaje ?? ""
            ),
            margen_valor: formatNumberForDisplay(item?.margen_valor ?? ""),
          }))
        : tiposExtra,
  };
}

function FloatingField({ label, icon, error, children, style }) {
  return (
    <div
      className="cmi-floatingField cmi-floatingField--active"
      style={style}
      data-error={error ? "true" : undefined}
    >
      <label className="cmi-floatingLabel cmi-floatingLabel--active">
        {icon && (
          <FontAwesomeIcon
            icon={icon}
            style={{ marginRight: 5, opacity: 0.7, fontSize: 11 }}
          />
        )}
        {label}
      </label>
      {children}
    </div>
  );
}

function PriceInput({
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  onEnter,
  placeholder,
  disabled,
  className,
}) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onEnter?.(e);
      return;
    }

    onKeyDown?.(e);
  };

  return (
    <input
      name={name}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      className={className || "cmi-input"}
      placeholder={placeholder || "0,00"}
      disabled={disabled}
      inputMode="decimal"
    />
  );
}

function MiniCreateModal({ open, title, value, loading, onChange, onCancel, onSave }) {
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key !== "Escape") return;

      e.preventDefault();
      e.stopPropagation();

      if (!loading) onCancel?.();
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const handleMiniEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    if (!loading) {
      onSave?.();
    }
  };

  return createPortal(
    <div
      className="cmi-miniOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onCancel?.();
        }
      }}
    >
      <div className="cmi-miniModal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmi-miniModal__head">{title}</div>

        <div className="cmi-miniModal__body">
          <FloatingField label="Nombre *">
            <input
              className="cmi-input"
              value={value}
              onChange={(e) => onChange(toUpperCaseValue(e.target.value))}
              onKeyDown={handleMiniEnter}
              placeholder="ESCRIBÍ EL NOMBRE"
              style={{ textTransform: "uppercase" }}
              autoFocus
            />
          </FloatingField>

          <div className="cmi-miniModal__actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={onCancel}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={onSave}
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function buildEmptyForm() {
  return {
    id: "",
    nombre: "",
    sku: "",
    precio_costo: "",
    precio: "",
    margen_venta_porcentaje: "",
    margen_venta_valor: "",
    precio_promo: "",
    margen_promo_porcentaje: "",
    margen_promo_valor: "",
    stock: "",
    descripcion: "",
    imagen_url: "",
    imagen_archivo_id: null,
    id_categoria_stock: "",
    tipos_precio_extra: [],
  };
}

export default function ModalEditarProducto({
  productoId,
  onClose,
  onGuardado,
  onToast,
}) {
  const closeBtnRef = useRef(null);
  const inputImagenRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState({});
  const [dark, setDark] = useState(isTemaOscuro);

  const [form, setForm] = useState(buildEmptyForm());
  const [categorias, setCategorias] = useState([]);
  const [loadingCategorias, setLoadingCategorias] = useState(false);
  const [tiposPrecio, setTiposPrecio] = useState([]);
  const [loadingTiposPrecio, setLoadingTiposPrecio] = useState(false);

  const [nuevaImagenFile, setNuevaImagenFile] = useState(null);
  const [nuevaImagenPreview, setNuevaImagenPreview] = useState("");
  const [eliminarImagenActual, setEliminarImagenActual] = useState(false);

  const [miniCategoriaOpen, setMiniCategoriaOpen] = useState(false);
  const [miniCategoriaNombre, setMiniCategoriaNombre] = useState("");
  const [guardandoMiniCategoria, setGuardandoMiniCategoria] = useState(false);

  const [miniTipoOpen, setMiniTipoOpen] = useState(false);
  const [miniTipoNombre, setMiniTipoNombre] = useState("");
  const [guardandoMiniTipo, setGuardandoMiniTipo] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMime, setPreviewMime] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");

  const mostrarToast = (mensaje, tipo = "error", duracion = 2500) => {
    onToast?.(tipo, errorToText(mensaje), duracion);
  };

  const focusNextField = (currentTarget) => {
    const root =
      currentTarget?.closest?.(".mi-modal__container") ||
      currentTarget?.closest?.(".mi-modal__content") ||
      document;

    const fields = Array.from(
      root.querySelectorAll(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      )
    ).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    const index = fields.indexOf(currentTarget);

    if (index >= 0 && fields[index + 1]) {
      fields[index + 1].focus();
      fields[index + 1].select?.();
    }
  };

  const handleFieldEnter = (e) => {
    if (e.key !== "Enter") return;
    if (e.currentTarget?.tagName === "TEXTAREA" && e.shiftKey) return;

    e.preventDefault();
    focusNextField(e.currentTarget);
  };

  const handlePriceEnter = (e, formatAction) => {
    e.preventDefault();
    formatAction?.(e);

    requestAnimationFrame(() => {
      focusNextField(e.currentTarget);
    });
  };

  const nuevaImagenNombre = useMemo(
    () => nuevaImagenFile?.name || "",
    [nuevaImagenFile]
  );

  const imagenActualUrl = useMemo(() => {
    if (eliminarImagenActual) return "";
    if (nuevaImagenFile) return "";

    if (Number(form.imagen_archivo_id || 0) > 0) {
      return getProductoImageUrlByArchivoId(form.imagen_archivo_id);
    }

    return form.imagen_url ? String(form.imagen_url).trim() : "";
  }, [
    form.imagen_archivo_id,
    form.imagen_url,
    eliminarImagenActual,
    nuevaImagenFile,
  ]);

  const imagenActualMime = useMemo(
    () => inferImageMimeFromUrl(imagenActualUrl),
    [imagenActualUrl]
  );

  const isLoading = loading || guardando;

  useEffect(() => {
    let cancelado = false;

    const fetchCatalogos = async () => {
      setLoadingCategorias(true);
      setLoadingTiposPrecio(true);

      try {
        const [resListas, resTipos] = await Promise.allSettled([
          fetch(`${API_URL}?action=obtener_listas`, {
            method: "GET",
            headers: buildHeadersGET(),
          }),
          fetch(`${API_URL}?action=stock_tipos_precio_listar`, {
            method: "GET",
            headers: buildHeadersGET(),
          }),
        ]);

        if (!cancelado) {
          if (resListas.status === "fulfilled") {
            try {
              const dataListas = await parseJsonOrThrow(resListas.value);
              const rawCategorias = Array.isArray(
                dataListas?.listas?.stock_categorias
              )
                ? dataListas.listas.stock_categorias
                : [];

              setCategorias(
                rawCategorias
                  .map((cat) => ({
                    id: String(cat.id_stock_categoria ?? cat.id ?? "").trim(),
                    nombre: String(cat.nombre ?? cat.label ?? "")
                      .trim()
                      .toUpperCase(),
                    activo:
                      cat.activo === undefined || cat.activo === null
                        ? 1
                        : Number(cat.activo),
                  }))
                  .filter((c) => c.id !== "")
              );
            } catch {
              setCategorias([]);
            }
          } else {
            setCategorias([]);
          }

          if (resTipos.status === "fulfilled") {
            try {
              const dataTipos = await parseJsonOrThrow(resTipos.value);
              const rawTipos = Array.isArray(dataTipos?.tipos_precio)
                ? dataTipos.tipos_precio
                : [];

              setTiposPrecio(
                rawTipos
                  .map((tipo) => ({
                    id: String(tipo.id_tipo_precio_stock ?? tipo.id ?? "").trim(),
                    id_tipo_precio_stock: String(
                      tipo.id_tipo_precio_stock ?? tipo.id ?? ""
                    ).trim(),
                    nombre: String(tipo.nombre ?? tipo.label ?? "")
                      .trim()
                      .toUpperCase(),
                    activo:
                      tipo.activo === undefined || tipo.activo === null
                        ? 1
                        : Number(tipo.activo),
                  }))
                  .filter((t) => t.id !== "")
              );
            } catch {
              setTiposPrecio([]);
            }
          } else {
            setTiposPrecio([]);
          }
        }
      } finally {
        if (!cancelado) {
          setLoadingCategorias(false);
          setLoadingTiposPrecio(false);
        }
      }
    };

    fetchCatalogos();

    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (nuevaImagenPreview) {
        URL.revokeObjectURL(nuevaImagenPreview);
      }
    };
  }, [nuevaImagenPreview]);

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());

    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const o2 = new MutationObserver(update);

    if (document.body) {
      o2.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (
        e.key === "Escape" &&
        !guardando &&
        !previewOpen &&
        !miniCategoriaOpen &&
        !miniTipoOpen
      ) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", h);

    return () => document.removeEventListener("keydown", h);
  }, [onClose, guardando, previewOpen, miniCategoriaOpen, miniTipoOpen]);

  useEffect(() => {
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    let mounted = true;

    const cargarProducto = async () => {
      if (!productoId) {
        mostrarToast("ID de producto inválido.", "error");
        setLoading(false);
        onClose?.();
        return;
      }

      setLoading(true);
      setErrores({});

      try {
        const url = `${API_URL}?action=stock_producto_obtener&id=${encodeURIComponent(
          productoId
        )}`;

        const res = await fetch(url, {
          method: "GET",
          headers: buildHeadersGET(),
        });

        const data = await parseJsonOrThrow(res);

        if (mounted) {
          setForm(hydratePricingFormValues(normalizarProducto(data)));
        }
      } catch (err) {
        if (mounted) {
          mostrarToast(err, "error");
          onClose?.();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    cargarProducto();

    return () => {
      mounted = false;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const cerrarPreview = () => {
    setPreviewOpen(false);
    setPreviewUrl("");
    setPreviewMime("");
    setPreviewFileName("");
  };

  const abrirPreview = ({ src, mime = "", name = "" }) => {
    if (!src) return;

    setPreviewUrl(src);
    setPreviewMime(mime);
    setPreviewFileName(name);
    setPreviewOpen(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (
      [
        "precio_costo",
        "precio",
        "margen_venta_porcentaje",
        "margen_venta_valor",
        "precio_promo",
        "margen_promo_porcentaje",
        "margen_promo_valor",
      ].includes(name)
    ) {
      setForm((prev) => recalculatePricingFormLive(prev, name, value));
    } else if (name === "stock") {
      setForm((prev) => ({
        ...prev,
        [name]: value.replace(/[^\d]/g, ""),
      }));
    } else if (["nombre", "sku", "descripcion"].includes(name)) {
      setForm((prev) => ({
        ...prev,
        [name]: toUpperCaseValue(value),
      }));
    } else if (name === "id_categoria_stock") {
      if (value === "__nueva_categoria__") {
        setMiniCategoriaOpen(true);
        return;
      }

      setForm((prev) => ({
        ...prev,
        [name]: normalizeIdValue(value),
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    setErrores((prev) => ({
      ...prev,
      [name]: "",
    }));
  };

  const handleCostoChangeLive = (rawValue) => {
    recalcularTodoConCosto(rawValue, false);

    setErrores((prev) => ({
      ...prev,
      precio_costo: "",
    }));
  };

  const handlePricingBlur = (source, groupName, withCents = true) => {
    const prefix =
      groupName === "venta"
        ? {
            price: "precio",
            marginPct: "margen_venta_porcentaje",
            marginVal: "margen_venta_valor",
          }
        : {
            price: "precio_promo",
            marginPct: "margen_promo_porcentaje",
            marginVal: "margen_promo_valor",
          };

    const resultRaw = recalculatePricingGroup({
      cost: form.precio_costo,
      price: form[prefix.price],
      marginPct: form[prefix.marginPct],
      marginValue: form[prefix.marginVal],
      source,
    });

    const result = formatPricingResult(resultRaw, withCents);

    setForm((prev) => ({
      ...prev,
      [prefix.price]: result.price,
      [prefix.marginPct]: result.marginPct,
      [prefix.marginVal]: result.marginValue,
    }));
  };

  const recalcularTodoConCosto = (nuevoCosto, withCents = false) => {
    setForm((prev) => {
      const ventaRaw = recalculatePricingGroup({
        cost: nuevoCosto,
        price: prev.precio,
        marginPct: prev.margen_venta_porcentaje,
        marginValue: prev.margen_venta_valor,
        source: prev.precio
          ? "price"
          : prev.margen_venta_porcentaje
            ? "marginPct"
            : prev.margen_venta_valor
              ? "marginValue"
              : null,
      });

      const promoRaw = recalculatePricingGroup({
        cost: nuevoCosto,
        price: prev.precio_promo,
        marginPct: prev.margen_promo_porcentaje,
        marginValue: prev.margen_promo_valor,
        source: prev.precio_promo
          ? "price"
          : prev.margen_promo_porcentaje
            ? "marginPct"
            : prev.margen_promo_valor
              ? "marginValue"
              : null,
      });

      const venta = formatPricingResult(ventaRaw, withCents);
      const promo = formatPricingResult(promoRaw, withCents);

      const extras = (prev.tipos_precio_extra || []).map((item) => {
        const resultRaw = recalculatePricingGroup({
          cost: nuevoCosto,
          price: item.precio,
          marginPct: item.margen_porcentaje,
          marginValue: item.margen_valor,
          source: item.precio
            ? "price"
            : item.margen_porcentaje
              ? "marginPct"
              : item.margen_valor
                ? "marginValue"
                : null,
        });

        const result = formatPricingResult(resultRaw, withCents);

        return {
          ...item,
          precio: result.price,
          margen_porcentaje: result.marginPct,
          margen_valor: result.marginValue,
        };
      });

      return {
        ...prev,
        precio_costo: withCents
          ? formatNumberWithCents(nuevoCosto)
          : formatNumberForDisplay(nuevoCosto),
        precio: venta.price,
        margen_venta_porcentaje: venta.marginPct,
        margen_venta_valor: venta.marginValue,
        precio_promo: promo.price,
        margen_promo_porcentaje: promo.marginPct,
        margen_promo_valor: promo.marginValue,
        tipos_precio_extra: extras,
      };
    });
  };

  const handleExtraPriceChange = (idx, field, value) => {
    setForm((prev) => {
      const next = {
        ...prev,
        tipos_precio_extra: prev.tipos_precio_extra.map((item, i) =>
          i === idx ? { ...item, [field]: value } : item
        ),
      };

      if (!["precio", "margen_porcentaje", "margen_valor"].includes(field)) {
        return next;
      }

      return {
        ...next,
        tipos_precio_extra: next.tipos_precio_extra.map((item, i) => {
          if (i !== idx) return item;

          const source =
            field === "precio"
              ? "price"
              : field === "margen_porcentaje"
                ? "marginPct"
                : "marginValue";

          const result = recalculatePricingGroup({
            cost: next.precio_costo,
            price: item.precio,
            marginPct: item.margen_porcentaje,
            marginValue: item.margen_valor,
            source,
          });

          return {
            ...item,
            precio: result.price,
            margen_porcentaje: result.marginPct,
            margen_valor: result.marginValue,
          };
        }),
      };
    });

    setErrores((prev) => ({
      ...prev,
      [`tipo_${idx}`]: "",
    }));
  };

  const handleExtraPriceBlur = (idx, source, withCents = true) => {
    setForm((prev) => ({
      ...prev,
      tipos_precio_extra: prev.tipos_precio_extra.map((item, i) => {
        if (i !== idx) return item;

        const resultRaw = recalculatePricingGroup({
          cost: prev.precio_costo,
          price: item.precio,
          marginPct: item.margen_porcentaje,
          marginValue: item.margen_valor,
          source,
        });

        const result = formatPricingResult(resultRaw, withCents);

        return {
          ...item,
          precio: result.price,
          margen_porcentaje: result.marginPct,
          margen_valor: result.marginValue,
        };
      }),
    }));
  };

  const handleTipoSelectChange = (val) => {
    if (!val) return;

    if (val === "__nuevo_tipo__") {
      setMiniTipoNombre("");
      setMiniTipoOpen(true);
      return;
    }

    const yaExiste = form.tipos_precio_extra.some(
      (item) => String(item.id_tipo_precio_stock) === String(val)
    );

    if (yaExiste) return;

    const tipo = tiposPrecio.find(
      (t) => String(t.id ?? t.id_tipo_precio_stock) === String(val)
    );

    setForm((prev) => ({
      ...prev,
      tipos_precio_extra: [...prev.tipos_precio_extra, emptyExtraPriceRow(tipo)],
    }));
  };

  const quitarTipoPrecio = (idx) => {
    setForm((prev) => ({
      ...prev,
      tipos_precio_extra: prev.tipos_precio_extra.filter((_, i) => i !== idx),
    }));
  };

  const limpiarNuevaImagen = () => {
    if (nuevaImagenPreview) {
      URL.revokeObjectURL(nuevaImagenPreview);
    }

    setNuevaImagenFile(null);
    setNuevaImagenPreview("");

    if (inputImagenRef.current) {
      inputImagenRef.current.value = "";
    }
  };

  const tomarNuevaImagen = (file) => {
    if (!file) return;

    const tiposPermitidos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!tiposPermitidos.includes(file.type)) {
      const msg = "La imagen debe ser JPG, PNG, WEBP o GIF";

      setErrores((prev) => ({
        ...prev,
        imagen: msg,
      }));

      mostrarToast(msg, "error");

      if (inputImagenRef.current) {
        inputImagenRef.current.value = "";
      }

      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const msg = "La imagen no puede superar los 5 MB";

      setErrores((prev) => ({
        ...prev,
        imagen: msg,
      }));

      mostrarToast(msg, "error");

      if (inputImagenRef.current) {
        inputImagenRef.current.value = "";
      }

      return;
    }

    if (nuevaImagenPreview) {
      URL.revokeObjectURL(nuevaImagenPreview);
    }

    const blobUrl = URL.createObjectURL(file);

    setNuevaImagenFile(file);
    setNuevaImagenPreview(blobUrl);
    setEliminarImagenActual(false);

    setErrores((prev) => ({
      ...prev,
      imagen: "",
    }));
  };

  const handleImagenInput = (e) => {
    const file = e.target.files?.[0];

    if (file) {
      tomarNuevaImagen(file);
    }
  };

  const handleEliminarImagenActual = () => {
    setEliminarImagenActual(true);
    limpiarNuevaImagen();

    setErrores((prev) => ({
      ...prev,
      imagen: "",
    }));
  };

  const handleCancelarEliminarImagen = () => {
    setEliminarImagenActual(false);
  };

  const guardarNuevaCategoria = async () => {
    const nombreLimpio = String(miniCategoriaNombre || "")
      .trim()
      .toUpperCase();

    if (!nombreLimpio) {
      mostrarToast("El nombre de la categoría es obligatorio", "error");
      return;
    }

    setGuardandoMiniCategoria(true);

    try {
      const res = await fetch(`${API_URL}?action=stock_categorias_crear`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({ nombre: nombreLimpio }),
      });

      const data = await parseJsonOrThrow(res);

      const nueva =
        data.categoria ||
        data.nueva || {
          id: data.id_stock_categoria,
          id_stock_categoria: data.id_stock_categoria,
          nombre: nombreLimpio,
        };

      const normalizada = {
        id: String(nueva.id ?? nueva.id_stock_categoria ?? "").trim(),
        nombre: String(nueva.nombre ?? nombreLimpio).trim().toUpperCase(),
        activo:
          nueva.activo === undefined || nueva.activo === null
            ? 1
            : Number(nueva.activo),
      };

      setCategorias((prev) => {
        const existe = prev.some((x) => String(x.id) === String(normalizada.id));

        if (existe) return prev;

        return [...prev, normalizada].sort((a, b) =>
          String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
        );
      });

      setForm((prev) => ({
        ...prev,
        id_categoria_stock: normalizada.id,
      }));

      setMiniCategoriaNombre("");
      setMiniCategoriaOpen(false);
    } catch (err) {
      mostrarToast(err, "error");
    } finally {
      setGuardandoMiniCategoria(false);
    }
  };

  const guardarNuevoTipo = async () => {
    const nombreLimpio = String(miniTipoNombre || "").trim().toUpperCase();

    if (!nombreLimpio) {
      mostrarToast("El nombre del tipo de precio es obligatorio", "error");
      return;
    }

    setGuardandoMiniTipo(true);

    try {
      const res = await fetch(`${API_URL}?action=stock_tipos_precio_crear`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({ nombre: nombreLimpio }),
      });

      const data = await parseJsonOrThrow(res);

      const nuevo =
        data.tipo_precio || {
          id: data.id_tipo_precio_stock,
          id_tipo_precio_stock: data.id_tipo_precio_stock,
          nombre: nombreLimpio,
        };

      const normalizado = {
        id: String(nuevo.id ?? nuevo.id_tipo_precio_stock ?? "").trim(),
        id_tipo_precio_stock: String(
          nuevo.id_tipo_precio_stock ?? nuevo.id ?? ""
        ).trim(),
        nombre: String(nuevo.nombre ?? nombreLimpio).trim().toUpperCase(),
        activo:
          nuevo.activo === undefined || nuevo.activo === null
            ? 1
            : Number(nuevo.activo),
      };

      setTiposPrecio((prev) => {
        const existe = prev.some(
          (x) =>
            String(x.id ?? x.id_tipo_precio_stock) ===
            String(normalizado.id ?? normalizado.id_tipo_precio_stock)
        );

        if (existe) return prev;

        return [...prev, normalizado].sort((a, b) =>
          String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
        );
      });

      setForm((prev) => {
        const yaExiste = (prev.tipos_precio_extra || []).some(
          (item) =>
            String(item.id_tipo_precio_stock) ===
            String(normalizado.id ?? normalizado.id_tipo_precio_stock)
        );

        if (yaExiste) return prev;

        return {
          ...prev,
          tipos_precio_extra: [
            ...prev.tipos_precio_extra,
            emptyExtraPriceRow(normalizado),
          ],
        };
      });

      setMiniTipoNombre("");
      setMiniTipoOpen(false);
    } catch (err) {
      mostrarToast(err, "error");
    } finally {
      setGuardandoMiniTipo(false);
    }
  };

  const validar = (sourceForm = form) => {
    const errs = {};

    const precioVenta = parseNumberFromInput(sourceForm.precio);
    const precioCosto = parseNumberFromInput(sourceForm.precio_costo);
    const promo = parseNumberFromInput(sourceForm.precio_promo);

    if (!sourceForm.nombre.trim()) {
      errs.nombre = "El nombre es obligatorio";
    }

    if (precioCosto !== null && precioCosto < 0) {
      errs.precio_costo = "Ingresá un costo válido";
    }

    if (!sourceForm.precio || precioVenta === null || precioVenta < 0) {
      errs.precio = "Ingresá un precio de venta válido";
    }

    if (sourceForm.precio_promo && (promo === null || promo < 0)) {
      errs.precio_promo = "Precio promocional inválido";
    }

    if (
      sourceForm.stock !== "" &&
      (Number.isNaN(Number(sourceForm.stock)) || Number(sourceForm.stock) < 0)
    ) {
      errs.stock = "Stock inválido";
    }

    sourceForm.tipos_precio_extra.forEach((item, idx) => {
      if (!item.id_tipo_precio_stock) {
        errs[`tipo_${idx}`] = "Tipo de precio inválido";
      }

      if (
        item.precio &&
        (parseNumberFromInput(item.precio) === null ||
          parseNumberFromInput(item.precio) < 0)
      ) {
        errs[`tipo_${idx}`] = "Precio extra inválido";
      }
    });

    if (nuevaImagenFile) {
      const tipos = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
      ];

      if (!tipos.includes(nuevaImagenFile.type)) {
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      }

      if (nuevaImagenFile.size > 5 * 1024 * 1024) {
        errs.imagen = "La imagen no puede superar los 5 MB";
      }
    }

    return errs;
  };

  const handleGuardar = async () => {
    const formNormalizado = hydratePricingFormValues(form);
    const errs = validar(formNormalizado);

    if (Object.keys(errs).length > 0) {
      setErrores(errs);
      setForm((prev) => ({
        ...prev,
        ...formNormalizado,
      }));

      mostrarToast(
        Object.values(errs)[0] || "Revisá los campos del formulario",
        "error"
      );

      return;
    }

    setGuardando(true);
    setErrores({});

    setForm((prev) => ({
      ...prev,
      ...formNormalizado,
    }));

    try {
      const categoriaId = normalizeCategoriaId(
        formNormalizado.id_categoria_stock
      );

      const { idUsuarioMaster, idTenant } = getUsuarioAuditData();

      const fd = new FormData();

      fd.append("id", String(Number(formNormalizado.id || productoId)));
      fd.append("nombre", toUpperCaseValue(formNormalizado.nombre.trim()));
      fd.append("sku", toUpperCaseValue(formNormalizado.sku.trim()));

      fd.append(
        "precio_costo",
        formNormalizado.precio_costo !== ""
          ? String(formatNumberForApi(formNormalizado.precio_costo) ?? "")
          : ""
      );

      fd.append("precio", String(formatNumberForApi(formNormalizado.precio) ?? ""));

      fd.append(
        "margen_venta_porcentaje",
        formNormalizado.margen_venta_porcentaje !== ""
          ? String(formatNumberForApi(formNormalizado.margen_venta_porcentaje) ?? "")
          : ""
      );

      fd.append(
        "margen_venta_valor",
        formNormalizado.margen_venta_valor !== ""
          ? String(formatNumberForApi(formNormalizado.margen_venta_valor) ?? "")
          : ""
      );

      fd.append(
        "precio_promo",
        formNormalizado.precio_promo !== ""
          ? String(formatNumberForApi(formNormalizado.precio_promo) ?? "")
          : ""
      );

      fd.append(
        "margen_promo_porcentaje",
        formNormalizado.margen_promo_porcentaje !== ""
          ? String(formatNumberForApi(formNormalizado.margen_promo_porcentaje) ?? "")
          : ""
      );

      fd.append(
        "margen_promo_valor",
        formNormalizado.margen_promo_valor !== ""
          ? String(formatNumberForApi(formNormalizado.margen_promo_valor) ?? "")
          : ""
      );

      fd.append(
        "stock",
        formNormalizado.stock !== "" ? String(formNormalizado.stock) : ""
      );

      fd.append("descripcion", toUpperCaseValue(formNormalizado.descripcion.trim()));

      fd.append("id_categoria_stock", categoriaId !== "" ? categoriaId : "");

      if (idUsuarioMaster > 0) {
        fd.append("idUsuarioMaster", String(idUsuarioMaster));
      }

      if (idTenant) {
        fd.append("tenant_id", String(idTenant));
      }

      const tiposPrecioPayload = formNormalizado.tipos_precio_extra.map((item) => ({
        id_tipo_precio_stock: Number(item.id_tipo_precio_stock) || 0,
        tipo_nombre: String(item.tipo_nombre || "").trim(),
        nombre: String(item.tipo_nombre || "").trim(),
        precio: formatNumberForApi(item.precio),
        margen_porcentaje: formatNumberForApi(item.margen_porcentaje),
        margen_valor: formatNumberForApi(item.margen_valor),
      }));

      fd.append("tipos_precio", JSON.stringify(tiposPrecioPayload));

      if (eliminarImagenActual && !nuevaImagenFile) {
        fd.append("eliminar_imagen", "1");
      }

      if (nuevaImagenFile) {
        fd.append("imagen", nuevaImagenFile);
      }

      const res = await fetch(`${API_URL}?action=stock_productos_actualizar`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: fd,
      });

      const data = await parseJsonOrThrow(res);

      const productoGuardado =
        data?.producto ?? data?.data?.producto ?? data?.data ?? null;

      onGuardado?.(productoGuardado);
      mostrarToast("Producto actualizado correctamente", "exito");
      onClose?.();
    } catch (err) {
      mostrarToast(err.message || "Error al actualizar el producto", "error");
    } finally {
      setGuardando(false);
    }
  };

  const tieneImagenActual = !eliminarImagenActual && !nuevaImagenFile && !!imagenActualUrl;

  return createPortal(
    <>
      <div
        className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""]
          .join(" ")
          .trim()}
      >
        <div
          className={[
            "mi-modal__container",
            "cmi-container",
            dark ? "mi-modal--dark" : "",
          ]
            .join(" ")
            .trim()}
          role="dialog"
          aria-modal="true"
          style={{ minHeight: "auto", maxHeight: "92vh", width: "min(1180px, 96vw)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faBoxOpen} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Editar producto</h2>
              <p className="mi-modal__subtitle">
                {form.nombre
                  ? `Modificando: ${form.nombre}`
                  : "Actualizá los datos del producto"}
              </p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !guardando && onClose?.()}
              aria-label="Cerrar"
              disabled={guardando}
              type="button"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="mi-modal__content" style={{ overflowY: "auto", padding: 20 }}>
            {loading ? (
              <div className="cmi-uploadBox">
                <div className="cmi-uploadBox__title">
                  <FontAwesomeIcon icon={faRefresh} spin /> Cargando producto...
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <FloatingField
                  label="Nombre del producto *"
                  icon={faBoxOpen}
                  error={errores.nombre}
                >
                  <input
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    onKeyDown={handleFieldEnter}
                    className="cmi-input"
                    placeholder="Ej: AURICULARES BLUETOOTH"
                    disabled={guardando}
                    style={{ textTransform: "uppercase" }}
                  />
                </FloatingField>

                <div className="fl-row">
                  <FloatingField label="SKU / Código" icon={faBarcode}>
                    <input
                      name="sku"
                      value={form.sku}
                      onChange={handleChange}
                      onKeyDown={handleFieldEnter}
                      className="cmi-input"
                      placeholder="Ej: 04163"
                      disabled={guardando}
                      style={{ textTransform: "uppercase" }}
                    />
                  </FloatingField>

                  <FloatingField label="Stock" icon={faCubesStacked} error={errores.stock}>
                    <input
                      name="stock"
                      value={form.stock}
                      onChange={handleChange}
                      onKeyDown={handleFieldEnter}
                      className="cmi-input"
                      placeholder="Ej: 25"
                      inputMode="numeric"
                      disabled={guardando}
                    />
                  </FloatingField>

                  <FloatingField label="Categoría" icon={faTag}>
                    <select
                      name="id_categoria_stock"
                      value={form.id_categoria_stock}
                      onChange={handleChange}
                      onKeyDown={handleFieldEnter}
                      className="cmi-input cmi-select"
                      disabled={guardando || loadingCategorias}
                    >
                      <option value="">
                        {loadingCategorias ? "Cargando categorías..." : "Sin categoría"}
                      </option>
                      <option value="__nueva_categoria__">+ Nueva categoría</option>

                      {categorias.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nombre}
                        </option>
                      ))}
                    </select>
                  </FloatingField>
                </div>

                <div className="cmi-priceBlock">
                  <div className="cmi-priceBlock__title">
                    <FontAwesomeIcon icon={faMoneyBillTrendUp} /> Precios principales
                  </div>

                  <div className="cmi-priceBlock__subtitle">
                    Con el costo cargado podés escribir el precio final o el margen en % / $ y se calcula solo.
                  </div>

                  <FloatingField label="Precio de costo" error={errores.precio_costo}>
                    <PriceInput
                      name="precio_costo"
                      value={form.precio_costo}
                      onChange={(e) => handleCostoChangeLive(e.target.value)}
                      onBlur={(e) => recalcularTodoConCosto(e.target.value, true)}
                      onEnter={(e) =>
                        handlePriceEnter(e, () =>
                          recalcularTodoConCosto(e.currentTarget.value, true)
                        )
                      }
                      placeholder="0,00"
                      disabled={guardando}
                    />
                  </FloatingField>

                  <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                    <FloatingField label="Precio de venta *" error={errores.precio}>
                      <PriceInput
                        name="precio"
                        value={form.precio}
                        onChange={handleChange}
                        onBlur={() => handlePricingBlur("price", "venta", true)}
                        onEnter={(e) =>
                          handlePriceEnter(e, () =>
                            handlePricingBlur("price", "venta", true)
                          )
                        }
                        disabled={guardando}
                      />
                    </FloatingField>

                    <FloatingField label="Margen %" icon={faPercent}>
                      <PriceInput
                        name="margen_venta_porcentaje"
                        value={form.margen_venta_porcentaje}
                        onChange={handleChange}
                        onBlur={() => handlePricingBlur("marginPct", "venta", true)}
                        onEnter={(e) =>
                          handlePriceEnter(e, () =>
                            handlePricingBlur("marginPct", "venta", true)
                          )
                        }
                        disabled={!form.precio_costo || guardando}
                      />
                    </FloatingField>

                    <FloatingField label="Margen $" icon={faDollarSign}>
                      <PriceInput
                        name="margen_venta_valor"
                        value={form.margen_venta_valor}
                        onChange={handleChange}
                        onBlur={() => handlePricingBlur("marginValue", "venta", true)}
                        onEnter={(e) =>
                          handlePriceEnter(e, () =>
                            handlePricingBlur("marginValue", "venta", true)
                          )
                        }
                        disabled={!form.precio_costo || guardando}
                      />
                    </FloatingField>
                  </div>

                  <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                    <FloatingField label="Precio promocional" error={errores.precio_promo}>
                      <PriceInput
                        name="precio_promo"
                        value={form.precio_promo}
                        onChange={handleChange}
                        onBlur={() => handlePricingBlur("price", "promo", true)}
                        onEnter={(e) =>
                          handlePriceEnter(e, () =>
                            handlePricingBlur("price", "promo", true)
                          )
                        }
                        disabled={guardando}
                      />
                    </FloatingField>

                    <FloatingField label="Margen promo %" icon={faPercent}>
                      <PriceInput
                        name="margen_promo_porcentaje"
                        value={form.margen_promo_porcentaje}
                        onChange={handleChange}
                        onBlur={() => handlePricingBlur("marginPct", "promo", true)}
                        onEnter={(e) =>
                          handlePriceEnter(e, () =>
                            handlePricingBlur("marginPct", "promo", true)
                          )
                        }
                        disabled={!form.precio_costo || guardando}
                      />
                    </FloatingField>

                    <FloatingField label="Margen promo $" icon={faDollarSign}>
                      <PriceInput
                        name="margen_promo_valor"
                        value={form.margen_promo_valor}
                        onChange={handleChange}
                        onBlur={() => handlePricingBlur("marginValue", "promo", true)}
                        onEnter={(e) =>
                          handlePriceEnter(e, () =>
                            handlePricingBlur("marginValue", "promo", true)
                          )
                        }
                        disabled={!form.precio_costo || guardando}
                      />
                    </FloatingField>
                  </div>
                </div>

                <div className="cmi-priceBlock">
                  <div className="cmi-priceBlock__title">
                    <FontAwesomeIcon icon={faLayerGroup} /> Tipos de precio adicionales
                  </div>

                  <div className="cmi-addPriceRow">
                    <FloatingField label="Agregar tipo de precio" style={{ flex: 1 }}>
                      <select
                        className="cmi-input cmi-select"
                        value=""
                        onChange={(e) => handleTipoSelectChange(e.target.value)}
                        onKeyDown={handleFieldEnter}
                        disabled={loadingTiposPrecio || guardando}
                      >
                        <option value="">
                          {loadingTiposPrecio
                            ? "CARGANDO TIPOS..."
                            : "SELECCIONAR TIPO PARA AGREGAR..."}
                        </option>
                        <option value="__nuevo_tipo__">+ NUEVO TIPO DE PRECIO</option>

                        {tiposPrecio.map((tipo) => (
                          <option
                            key={tipo.id ?? tipo.id_tipo_precio_stock}
                            value={tipo.id ?? tipo.id_tipo_precio_stock}
                          >
                            {tipo.nombre}
                          </option>
                        ))}
                      </select>
                    </FloatingField>
                  </div>

                  {(form.tipos_precio_extra || []).map((tipoItem, idx) => (
                    <div
                      className="cmi-extraPriceCard"
                      key={`${tipoItem.id_tipo_precio_stock}-${idx}`}
                    >
                      <div className="cmi-extraPriceCard__head">
                        <div className="cmi-extraPriceCard__title">
                          {tipoItem.tipo_nombre || `Tipo ${idx + 1}`}
                        </div>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() => quitarTipoPrecio(idx)}
                          disabled={guardando}
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      </div>

                      <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                        <FloatingField label="Precio" error={errores[`tipo_${idx}`]}>
                          <PriceInput
                            name={`tipo_precio_${idx}`}
                            value={tipoItem.precio}
                            onChange={(e) =>
                              handleExtraPriceChange(idx, "precio", e.target.value)
                            }
                            onBlur={() => handleExtraPriceBlur(idx, "price", true)}
                            onEnter={(e) =>
                              handlePriceEnter(e, () =>
                                handleExtraPriceBlur(idx, "price", true)
                              )
                            }
                            disabled={guardando}
                          />
                        </FloatingField>

                        <FloatingField label="Margen %">
                          <PriceInput
                            name={`tipo_pct_${idx}`}
                            value={tipoItem.margen_porcentaje}
                            onChange={(e) =>
                              handleExtraPriceChange(
                                idx,
                                "margen_porcentaje",
                                e.target.value
                              )
                            }
                            onBlur={() => handleExtraPriceBlur(idx, "marginPct", true)}
                            onEnter={(e) =>
                              handlePriceEnter(e, () =>
                                handleExtraPriceBlur(idx, "marginPct", true)
                              )
                            }
                            disabled={!form.precio_costo || guardando}
                          />
                        </FloatingField>

                        <FloatingField label="Margen $">
                          <PriceInput
                            name={`tipo_val_${idx}`}
                            value={tipoItem.margen_valor}
                            onChange={(e) =>
                              handleExtraPriceChange(idx, "margen_valor", e.target.value)
                            }
                            onBlur={() => handleExtraPriceBlur(idx, "marginValue", true)}
                            onEnter={(e) =>
                              handlePriceEnter(e, () =>
                                handleExtraPriceBlur(idx, "marginValue", true)
                              )
                            }
                            disabled={!form.precio_costo || guardando}
                          />
                        </FloatingField>
                      </div>
                    </div>
                  ))}
                </div>

                <FloatingField label="Descripción" icon={faAlignLeft}>
                  <textarea
                    name="descripcion"
                    value={form.descripcion}
                    onChange={handleChange}
                    onKeyDown={handleFieldEnter}
                    className="cmi-input cmi-textarea"
                    placeholder="BREVE DESCRIPCIÓN DEL PRODUCTO (OPCIONAL)"
                    rows={3}
                    disabled={guardando}
                    style={{ textTransform: "uppercase" }}
                  />
                </FloatingField>

                <div className="cmi-uploadBox">
                  <div className="cmi-uploadBox__title">
                    <FontAwesomeIcon icon={faPaperclip} />
                    Imagen del producto
                  </div>

                  <input
                    ref={inputImagenRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
                    hidden
                    onChange={handleImagenInput}
                  />

                  {!tieneImagenActual && !nuevaImagenFile && !eliminarImagenActual && (
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost"
                      onClick={() => inputImagenRef.current?.click()}
                      disabled={guardando}
                      style={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                      }}
                    >
                      <FontAwesomeIcon icon={faArrowUpFromBracket} style={{ fontSize: 12 }} />
                      Seleccionar imagen
                    </button>
                  )}

                  {tieneImagenActual && (
                    <div className="cmi-fileResume">
                      <div className="cmi-fileResume__left">
                        <span className="cmi-fileResume__icon">
                          <FontAwesomeIcon icon={faImage} />
                        </span>

                        <div className="cmi-fileResume__meta">
                          <div className="cmi-fileResume__name">
                            {form.nombre ? `${form.nombre.slice(0, 28)}…` : "Imagen actual"}
                          </div>
                          <span className="cmi-badge cmi-badge--img">Imagen</span>
                        </div>
                      </div>

                      <div className="cmi-fileActions">
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() =>
                            abrirPreview({
                              src: imagenActualUrl,
                              mime: imagenActualMime,
                              name: form.nombre || "imagen_actual",
                            })
                          }
                          disabled={guardando || !imagenActualUrl}
                          style={{ padding: "6px 10px", fontSize: 13 }}
                          title="Ver imagen"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() => inputImagenRef.current?.click()}
                          disabled={guardando}
                          style={{ padding: "6px 10px", fontSize: 13 }}
                          title="Reemplazar imagen"
                        >
                          <FontAwesomeIcon icon={faArrowUpFromBracket} />
                        </button>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={handleEliminarImagenActual}
                          disabled={guardando}
                          style={{
                            padding: "6px 10px",
                            fontSize: 13,
                            color: "#ef4444",
                            borderColor: "rgba(239,68,68,0.25)",
                          }}
                          title="Eliminar imagen"
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      </div>
                    </div>
                  )}

                  {eliminarImagenActual && !nuevaImagenFile && (
                    <div className="cmi-deleteWarn">
                      <div className="cmi-deleteWarn__left">
                        <div className="cmi-deleteWarn__icon" aria-hidden="true">
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        </div>

                        <div className="cmi-deleteWarn__body">
                          <div className="cmi-deleteWarn__title">
                            La imagen se eliminará al guardar
                          </div>

                          <div className="cmi-deleteWarn__desc">
                            Esta acción no se puede deshacer. Podés subir una nueva imagen antes de guardar.
                          </div>
                        </div>
                      </div>

                      <div className="cmi-deleteWarn__actions">
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() => inputImagenRef.current?.click()}
                          disabled={guardando}
                          style={{ fontSize: 12, padding: "6px 12px" }}
                        >
                          <FontAwesomeIcon
                            icon={faArrowUpFromBracket}
                            style={{ marginRight: 6 }}
                          />
                          Reemplazar imagen
                        </button>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={handleCancelarEliminarImagen}
                          disabled={guardando}
                          style={{ fontSize: 12, padding: "6px 12px" }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {nuevaImagenFile && (
                    <div className="cmi-fileResume">
                      <div className="cmi-fileResume__left">
                        <span className="cmi-fileResume__icon">
                          <FontAwesomeIcon icon={faImage} />
                        </span>

                        <div className="cmi-fileResume__meta">
                          <div className="cmi-fileResume__name">{nuevaImagenNombre}</div>
                          <span className="cmi-badge cmi-badge--img">Imagen</span>
                        </div>
                      </div>

                      <div className="cmi-fileActions">
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() =>
                            abrirPreview({
                              src: nuevaImagenPreview,
                              mime: nuevaImagenFile?.type || "image/jpeg",
                              name: nuevaImagenNombre,
                            })
                          }
                          disabled={!nuevaImagenPreview}
                          style={{ padding: "6px 10px", fontSize: 13 }}
                          title="Ver imagen"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>

                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={limpiarNuevaImagen}
                          disabled={guardando}
                          style={{
                            padding: "6px 10px",
                            fontSize: 13,
                            color: "#ef4444",
                            borderColor: "rgba(239,68,68,0.25)",
                          }}
                          title="Quitar imagen"
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="cmi-footer">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={() => !guardando && onClose?.()}
              disabled={guardando}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={handleGuardar}
              disabled={isLoading}
            >
              <FontAwesomeIcon
                icon={guardando ? faRefresh : faFloppyDisk}
                spin={guardando}
                style={{ marginRight: 8 }}
              />
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>

      <MiniCreateModal
        open={miniCategoriaOpen}
        title="Nueva categoría"
        value={miniCategoriaNombre}
        loading={guardandoMiniCategoria}
        onChange={setMiniCategoriaNombre}
        onCancel={() => {
          setMiniCategoriaOpen(false);
          setMiniCategoriaNombre("");
        }}
        onSave={guardarNuevaCategoria}
      />

      <MiniCreateModal
        open={miniTipoOpen}
        title="Nuevo tipo de precio"
        value={miniTipoNombre}
        loading={guardandoMiniTipo}
        onChange={setMiniTipoNombre}
        onCancel={() => {
          setMiniTipoOpen(false);
          setMiniTipoNombre("");
        }}
        onSave={guardarNuevoTipo}
      />

      <ModalVerComprobante
        open={previewOpen}
        url={previewUrl}
        mime={previewMime}
        fileName={previewFileName}
        title="Imagen del producto"
        onClose={cerrarPreview}
      />
    </>,
    document.body
  );
}

/* ── Helpers ── */

function normalizeCategoriaId(value) {
  if (value === null || value === undefined) return "";

  const s = String(value).trim();

  if (s === "" || s === "0" || s.toLowerCase() === "null") {
    return "";
  }

  return s;
}

function normalizeIdValue(value) {
  if (value && typeof value === "object") {
    return String(value.id ?? value.id_stock_categoria ?? value.value ?? "");
  }

  return String(value ?? "");
}

function normalizeOptionLabel(value, fallback = "") {
  if (value == null) return fallback;

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    return String(value.nombre ?? value.label ?? value.descripcion ?? fallback);
  }

  return fallback;
}

function toUpperCaseValue(value = "") {
  return String(value || "").toUpperCase();
}

function errorToText(err, fallback = "Ocurrió un error inesperado") {
  const value = err?.message ?? err?.mensaje ?? err;

  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (value && typeof value === "object") {
    if (typeof value.nombre === "string" && value.nombre.trim()) {
      return value.nombre;
    }

    if (typeof value.error === "string" && value.error.trim()) {
      return value.error;
    }

    if (typeof value.mensaje === "string" && value.mensaje.trim()) {
      return value.mensaje;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}