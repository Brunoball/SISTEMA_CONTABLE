import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante";
import "./ModalCargaMasiva.css";

import {
  faBarcode,
  faCubesStacked,
  faTag,
  faAlignLeft,
  faPaperclip,
  faArrowUpFromBracket,
  faImage,
  faEye,
  faTrashCan,
  faFloppyDisk,
  faMoneyBillTrendUp,
  faLayerGroup,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";

import {
  API_URL,
  buildHeadersJSON,
  buildHeadersMultipart,
  emptyExtraPriceRow,
  formatMoneyBlur,
  formatMoneyFocus,
  getUsuarioAuditData,
  moneyToApi,
  normalizeMoneyInput,
  onlyNumbers,
  parseJsonOrThrow,
  recalculatePricingGroup,
  toUpperCaseValue,
} from "./stockFormUtils";

/* ── Utilidades ── */
function normalizeIdValue(value) {
  if (value && typeof value === "object") {
    return String(value.id ?? value.id_stock_categoria ?? value.value ?? "");
  }

  return String(value ?? "");
}

function toCapitalizedText(value) {
  return String(value ?? "")
    .trimStart()
    .normalize("NFC")
    .toUpperCase();
}

function normalizeOptionLabel(value, fallback = "") {
  let result = fallback;

  if (value == null) {
    result = fallback;
  } else if (typeof value === "string" || typeof value === "number") {
    result = String(value);
  } else if (typeof value === "object") {
    result = String(value.nombre ?? value.label ?? value.descripcion ?? fallback);
  }

  return toCapitalizedText(result);
}

function errorToText(err, fallback = "Ocurrió un error inesperado") {
  const value = err?.message ?? err?.mensaje ?? err;

  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);

  if (value && typeof value === "object") {
    if (typeof value.nombre === "string" && value.nombre.trim()) return value.nombre;
    if (typeof value.error === "string" && value.error.trim()) return value.error;
    if (typeof value.mensaje === "string" && value.mensaje.trim()) return value.mensaje;

    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function hasMoneyValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function cleanDecoratedNumber(value) {
  return String(value ?? "")
    .replace(/\$/g, "")
    .replace(/%/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function parseDecoratedNumber(value) {
  const cleaned = cleanDecoratedNumber(value);
  if (!cleaned) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const num = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function formatPriceDisplay(value) {
  const num = parseDecoratedNumber(value);
  if (num === null) return cleanDecoratedNumber(value);

  return `$ ${num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercentDisplay(value) {
  const num = parseDecoratedNumber(value);
  if (num === null) return cleanDecoratedNumber(value);

  return `${num.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} %`;
}

function inferPriceInputKind(name = "") {
  const n = String(name).toLowerCase();

  if (
    n.includes("porcentaje") ||
    n.includes("_pct") ||
    n.includes("pct_") ||
    n.includes("tipo_pct") ||
    n.includes("margen_pct") ||
    n.includes("extra_margen_pct")
  ) {
    return "percent";
  }

  if (
    n.includes("precio") ||
    n.includes("costo") ||
    n.includes("margen_venta_valor") ||
    n.includes("margen_promo_valor") ||
    n.includes("margen_valor") ||
    n.includes("margen_val") ||
    n.includes("tipo_val") ||
    n.includes("extra_margen_val") ||
    n.includes("marginvalue")
  ) {
    return "money";
  }

  return "number";
}

function decoratePriceInputValue(value, kind, focused) {
  const cleaned = cleanDecoratedNumber(value);
  if (!cleaned) return "";
  if (focused) return cleaned;
  if (kind === "percent") return formatPercentDisplay(cleaned);
  if (kind === "money") return formatPriceDisplay(cleaned);
  return cleaned;
}

function withCleanPriceEvent(event, cleanValue) {
  return {
    ...event,
    target: {
      ...event.target,
      name: event.target?.name,
      value: cleanValue,
    },
    currentTarget: {
      ...event.currentTarget,
      name: event.currentTarget?.name,
      value: cleanValue,
    },
  };
}

function formatMoneyEnter(value) {
  if (value === null || value === undefined || value === "") return "";

  const normalized = String(value)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const num = Number(normalized);

  if (!Number.isFinite(num)) return "";

  return num.toFixed(2).replace(".", ",");
}

function formatPricingResultEnter(result) {
  return {
    price: formatMoneyEnter(result.price),
    marginPct: formatMoneyEnter(result.marginPct),
    marginValue: formatMoneyEnter(result.marginValue),
  };
}

function hydratePricingGroupValues({ cost, price, marginPct, marginValue }) {
  const hasPrice = hasMoneyValue(price);
  const hasPct = hasMoneyValue(marginPct);
  const hasVal = hasMoneyValue(marginValue);

  if (hasPrice && hasPct && hasVal) {
    return {
      price: formatMoneyBlur(price),
      marginPct: formatMoneyBlur(marginPct),
      marginValue: formatMoneyBlur(marginValue),
    };
  }

  const source = hasPrice ? "price" : hasPct ? "marginPct" : hasVal ? "marginValue" : null;

  if (!source) {
    return {
      price: "",
      marginPct: "",
      marginValue: "",
    };
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
    precio_costo: formatMoneyBlur(sourceForm.precio_costo),
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
  const value = normalizeMoneyInput(rawValue);
  const next = { ...prev, [fieldName]: value };

  if (fieldName === "precio_costo") return hydratePricingFormValues(next);

  if (["precio", "margen_venta_porcentaje", "margen_venta_valor"].includes(fieldName)) {
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

  if (["precio_promo", "margen_promo_porcentaje", "margen_promo_valor"].includes(fieldName)) {
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

/* ── Subcomponentes ── */
function TipoBadge({ tipo }) {
  const map = {
    imagen: { label: "Imagen", cls: "cmi-badge--img" },
    "": { label: "No válido", cls: "cmi-badge--none" },
  };

  const { label, cls } = map[tipo] ?? map[""];

  return <span className={`cmi-badge ${cls}`}>{label}</span>;
}

function getFirstErrorText(errs) {
  if (!errs || typeof errs !== "object") return "Revisá los campos marcados";

  const first = Object.values(errs).find((value) => {
    if (typeof value === "string") return value.trim();
    return value !== null && value !== undefined && value !== false;
  });

  return errorToText(first, "Revisá los campos marcados");
}

function FloatingField({ label, icon, error, children, style }) {
  return (
    <div
      className={`cmi-floatingField ${error ? "cmi-floatingField--error" : ""}`}
      style={style}
      title={error ? errorToText(error) : undefined}
    >
      <label className="cmi-floatingLabel">
        {icon && <FontAwesomeIcon icon={icon} style={{ fontSize: 10, opacity: 0.8 }} />}
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
  const [focused, setFocused] = useState(false);
  const kind = inferPriceInputKind(name);
  const displayValue = decoratePriceInputValue(value, kind, focused);

  const handleChange = (e) => {
    const cleanValue = cleanDecoratedNumber(e.target.value);
    onChange?.(withCleanPriceEvent(e, cleanValue));
  };

  const handleFocus = (e) => {
    setFocused(true);
    const cleanValue = cleanDecoratedNumber(e.target.value);
    onFocus?.(withCleanPriceEvent(e, cleanValue));
  };

  const handleBlur = (e) => {
    setFocused(false);
    const cleanValue = cleanDecoratedNumber(e.target.value);
    onBlur?.(withCleanPriceEvent(e, cleanValue));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cleanValue = cleanDecoratedNumber(e.currentTarget.value);
      const originalValue = e.currentTarget.value;
      e.currentTarget.value = cleanValue;
      e.target.value = cleanValue;
      onEnter?.(e);
      e.currentTarget.value = originalValue;
      return;
    }

    onKeyDown?.(e);
  };

  return (
    <input
      name={name}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      className={className || "cmi-input"}
      placeholder={placeholder || (kind === "percent" ? "0 %" : "$ 0,00")}
      disabled={disabled}
      inputMode="decimal"
    />
  );
}

function PriceGroupSection({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="cmi-priceBlock__title">
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--nv-action, #0055BB)",
            flexShrink: 0,
          }}
        />
        {title}
      </div>

      {children}
    </div>
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

    if (!loading) onSave?.();
  };

  return (
    <div className="cmi-miniOverlay">
      <div className="cmi-miniModal">
        <div className="cmi-miniModal__head">{title}</div>

        <div className="cmi-miniModal__body">
          <FloatingField label="Nombre *">
            <input
              className="cmi-input"
              value={value}
              onChange={(e) => onChange(toCapitalizedText(e.target.value))}
              onKeyDown={handleMiniEnter}
              placeholder="ESCRIBÍ EL NOMBRE"
              style={{ textTransform: "uppercase" }}
              autoFocus
            />
          </FloatingField>

          <div className="cmi-miniModal__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={loading}>
              Cancelar
            </button>

            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={loading}>
              {loading ? (
                "Guardando..."
              ) : (
                <>
                  <FontAwesomeIcon icon={faCheck} /> Guardar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildEmptyForm() {
  return {
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
    id_categoria_stock: "",
    tipos_precio_extra: [],
  };
}

/* ── Componente principal ── */
export default function ModalCargaIndividualProducto({
  open,
  visible,
  categorias = [],
  loadingCategorias = false,
  tiposPrecio = [],
  loadingTiposPrecio = false,
  onGuardado,
  onRequestClose,
  onLoadingChange,
  onCategoriaCreada,
  onTipoPrecioCreado,
  onToast,
}) {
  const inputImagenRef = useRef(null);

  const [guardando, setGuardando] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMime, setPreviewMime] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Archivo");
  const [form, setForm] = useState(buildEmptyForm);
  const [errores, setErrores] = useState({});
  const [imagenFile, setImagenFile] = useState(null);

  const [miniCategoriaOpen, setMiniCategoriaOpen] = useState(false);
  const [miniCategoriaNombre, setMiniCategoriaNombre] = useState("");
  const [guardandoMiniCategoria, setGuardandoMiniCategoria] = useState(false);

  const [miniTipoOpen, setMiniTipoOpen] = useState(false);
  const [miniTipoNombre, setMiniTipoNombre] = useState("");
  const [guardandoMiniTipo, setGuardandoMiniTipo] = useState(false);

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

  const mostrarToast = (mensaje, tipo = "error") => onToast?.(errorToText(mensaje), tipo);

  const imagenNombre = useMemo(() => imagenFile?.name || "", [imagenFile]);

  const categoriasSafe = useMemo(
    () => (Array.isArray(categorias) ? categorias.filter(Boolean) : []),
    [categorias]
  );

  const tiposPrecioSafe = useMemo(
    () => (Array.isArray(tiposPrecio) ? tiposPrecio.filter(Boolean) : []),
    [tiposPrecio]
  );

  useEffect(() => {
    onLoadingChange?.(guardando);
  }, [guardando, onLoadingChange]);

  useEffect(() => {
    if (!open) {
      setForm(buildEmptyForm());
      setErrores({});
      setGuardando(false);
      setImagenFile(null);
      cerrarPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const cerrarPreview = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);

    setPreviewOpen(false);
    setPreviewUrl("");
    setPreviewMime("");
    setPreviewFileName("");
    setPreviewTitle("Archivo");
  };

  const abrirPreviewLocal = ({ file, title }) => {
    if (!file) return;

    const blobUrl = URL.createObjectURL(file);

    setPreviewUrl(blobUrl);
    setPreviewMime(file.type || "");
    setPreviewFileName(file.name || "archivo");
    setPreviewTitle(title || "Archivo");
    setPreviewOpen(true);
  };

  const limpiarImagen = () => {
    setImagenFile(null);

    if (inputImagenRef.current) {
      inputImagenRef.current.value = "";
    }
  };

  const tomarImagen = (file) => {
    if (!file) return;

    const tipos = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

    if (!tipos.includes(file.type)) {
      const msg = "La imagen debe ser JPG, PNG, WEBP o GIF";
      setErrores((p) => ({ ...p, imagen: msg }));
      mostrarToast(msg, "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const msg = "La imagen no puede superar los 5 MB";
      setErrores((p) => ({ ...p, imagen: msg }));
      mostrarToast(msg, "error");
      return;
    }

    setImagenFile(file);
    setErrores((p) => ({ ...p, imagen: "" }));
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
      setForm((p) => recalculatePricingFormLive(p, name, value));
    } else if (name === "stock") {
      setForm((p) => ({ ...p, [name]: onlyNumbers(value) }));
    } else if (["nombre", "descripcion"].includes(name)) {
      setForm((p) => ({ ...p, [name]: toCapitalizedText(value) }));
    } else if (name === "sku") {
      setForm((p) => ({ ...p, [name]: toUpperCaseValue(value) }));
    } else if (name === "id_categoria_stock") {
      if (value === "__nueva_categoria__") {
        setMiniCategoriaOpen(true);
        return;
      }

      setForm((p) => ({ ...p, [name]: normalizeIdValue(value) }));
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }

    setErrores((p) => ({ ...p, [name]: "" }));
  };

  const handleCostoChangeLive = (rawValue) => {
    const value = normalizeMoneyInput(rawValue);

    recalcularTodoConCosto(value, false);
    setErrores((p) => ({ ...p, precio_costo: "" }));
  };

  const applyPricingResult = (prefix, result) => {
    setForm((p) => ({
      ...p,
      [prefix.price]: result.price,
      [prefix.marginPct]: result.marginPct,
      [prefix.marginVal]: result.marginValue,
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

    const result = withCents ? formatPricingResultEnter(resultRaw) : resultRaw;

    applyPricingResult(prefix, result);
  };

  const recalcularTodoConCosto = (nuevoCosto, withCents = true) => {
    setForm((p) => {
      const ventaRaw = recalculatePricingGroup({
        cost: nuevoCosto,
        price: p.precio,
        marginPct: p.margen_venta_porcentaje,
        marginValue: p.margen_venta_valor,
        source: p.precio
          ? "price"
          : p.margen_venta_porcentaje
            ? "marginPct"
            : p.margen_venta_valor
              ? "marginValue"
              : null,
      });

      const promoRaw = recalculatePricingGroup({
        cost: nuevoCosto,
        price: p.precio_promo,
        marginPct: p.margen_promo_porcentaje,
        marginValue: p.margen_promo_valor,
        source: p.precio_promo
          ? "price"
          : p.margen_promo_porcentaje
            ? "marginPct"
            : p.margen_promo_valor
              ? "marginValue"
              : null,
      });

      const venta = withCents ? formatPricingResultEnter(ventaRaw) : ventaRaw;
      const promo = withCents ? formatPricingResultEnter(promoRaw) : promoRaw;

      const extras = (p.tipos_precio_extra || []).map((item) => {
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

        const result = withCents ? formatPricingResultEnter(resultRaw) : resultRaw;

        return {
          ...item,
          precio: result.price,
          margen_porcentaje: result.marginPct,
          margen_valor: result.marginValue,
        };
      });

      return {
        ...p,
        precio_costo: withCents ? formatMoneyEnter(nuevoCosto) : formatMoneyBlur(nuevoCosto),
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
    setForm((p) => {
      const next = {
        ...p,
        tipos_precio_extra: p.tipos_precio_extra.map((item, i) =>
          i === idx
            ? {
                ...item,
                [field]: ["precio", "margen_porcentaje", "margen_valor"].includes(field)
                  ? normalizeMoneyInput(value)
                  : value,
              }
            : item
        ),
      };

      if (!["precio", "margen_porcentaje", "margen_valor"].includes(field)) return next;

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

    setErrores((p) => ({ ...p, [`tipo_${idx}`]: "" }));
  };

  const handleExtraPriceBlur = (idx, source, withCents = true) => {
    setForm((p) => ({
      ...p,
      tipos_precio_extra: p.tipos_precio_extra.map((item, i) => {
        if (i !== idx) return item;

        const resultRaw = recalculatePricingGroup({
          cost: p.precio_costo,
          price: item.precio,
          marginPct: item.margen_porcentaje,
          marginValue: item.margen_valor,
          source,
        });

        const result = withCents ? formatPricingResultEnter(resultRaw) : resultRaw;

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
      setMiniTipoOpen(true);
      return;
    }

    const yaExiste = form.tipos_precio_extra.some(
      (item) => String(item.id_tipo_precio_stock) === String(val)
    );

    if (yaExiste) return;

    const tipo = tiposPrecioSafe.find((t) => String(t.id ?? t.id_tipo_precio_stock) === String(val));

    setForm((p) => ({
      ...p,
      tipos_precio_extra: [...p.tipos_precio_extra, emptyExtraPriceRow(tipo)],
    }));
  };

  const quitarTipoPrecio = (idx) => {
    setForm((p) => ({
      ...p,
      tipos_precio_extra: p.tipos_precio_extra.filter((_, i) => i !== idx),
    }));
  };

  const validar = (sourceForm = form) => {
    const errs = {};

    const precioVenta = Number(String(sourceForm.precio || "").replace(",", "."));
    const precioCosto =
      sourceForm.precio_costo !== "" ? Number(String(sourceForm.precio_costo).replace(",", ".")) : null;
    const promo =
      sourceForm.precio_promo !== "" ? Number(String(sourceForm.precio_promo).replace(",", ".")) : null;

    if (!sourceForm.nombre.trim()) errs.nombre = "El nombre es obligatorio";

    if (precioCosto !== null && (Number.isNaN(precioCosto) || precioCosto < 0)) {
      errs.precio_costo = "Ingresá un costo válido";
    }

    if (!sourceForm.precio || Number.isNaN(precioVenta) || precioVenta < 0) {
      errs.precio = "Ingresá un precio de venta válido";
    }

    if (sourceForm.precio_promo && (Number.isNaN(promo) || promo < 0)) {
      errs.precio_promo = "Precio promocional inválido";
    }

    if (sourceForm.stock !== "" && (Number.isNaN(Number(sourceForm.stock)) || Number(sourceForm.stock) < 0)) {
      errs.stock = "Stock inválido";
    }

    sourceForm.tipos_precio_extra.forEach((item, idx) => {
      if (!item.id_tipo_precio_stock) {
        errs[`tipo_${idx}`] = "Tipo de precio inválido";
      }

      if (
        item.precio &&
        (Number.isNaN(Number(String(item.precio).replace(",", "."))) ||
          Number(String(item.precio).replace(",", ".")) < 0)
      ) {
        errs[`tipo_${idx}`] = "Precio extra inválido";
      }
    });

    if (imagenFile) {
      const tipos = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];

      if (!tipos.includes(imagenFile.type)) {
        errs.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
      }

      if (imagenFile.size > 5 * 1024 * 1024) {
        errs.imagen = "La imagen no puede superar los 5 MB";
      }
    }

    return errs;
  };

  const guardarNuevaCategoria = async () => {
    const nombreLimpio = toCapitalizedText(miniCategoriaNombre);

    if (!nombreLimpio) return;

    setGuardandoMiniCategoria(true);

    try {
      const res = await fetch(`${API_URL}?action=stock_categorias_crear`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({ nombre: nombreLimpio }),
      });

      const data = await parseJsonOrThrow(res);

      const nueva = data.categoria || data.nueva || {
        id: data.id_stock_categoria,
        id_stock_categoria: data.id_stock_categoria,
        nombre: nombreLimpio,
      };

      const categoriaRegistrada = (await onCategoriaCreada?.(nueva)) || nueva;

      setForm((p) => ({
        ...p,
        id_categoria_stock: normalizeIdValue(categoriaRegistrada),
      }));

      setMiniCategoriaNombre("");
      setMiniCategoriaOpen(false);
    } catch (err) {
      mostrarToast(errorToText(err, "No se pudo crear la categoría"), "error");
    } finally {
      setGuardandoMiniCategoria(false);
    }
  };

  const guardarNuevoTipo = async () => {
    const nombreLimpio = toCapitalizedText(miniTipoNombre);

    if (!nombreLimpio) return;

    setGuardandoMiniTipo(true);

    try {
      const res = await fetch(`${API_URL}?action=stock_tipos_precio_crear`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({ nombre: nombreLimpio }),
      });

      const data = await parseJsonOrThrow(res);

      const nuevo = data.tipo_precio || {
        id: data.id_tipo_precio_stock,
        id_tipo_precio_stock: data.id_tipo_precio_stock,
        nombre: nombreLimpio,
      };

      let tipoRegistrado = nuevo;

      try {
        tipoRegistrado = (await onTipoPrecioCreado?.(nuevo)) || nuevo;
      } catch {}

      setForm((p) => {
        const yaExiste = (p.tipos_precio_extra || []).some(
          (item) =>
            String(item.id_tipo_precio_stock) ===
            String(tipoRegistrado.id ?? tipoRegistrado.id_tipo_precio_stock ?? "")
        );

        if (yaExiste) return p;

        return {
          ...p,
          tipos_precio_extra: [...p.tipos_precio_extra, emptyExtraPriceRow(tipoRegistrado)],
        };
      });

      setMiniTipoNombre("");
      setMiniTipoOpen(false);
    } catch (err) {
      mostrarToast(errorToText(err, "No se pudo crear el tipo de precio"), "error");
    } finally {
      setGuardandoMiniTipo(false);
    }
  };

  const handleGuardar = async () => {
    const formNormalizado = hydratePricingFormValues(form);
    const errs = validar(formNormalizado);

    if (Object.keys(errs).length > 0) {
      setErrores(errs);
      setForm((p) => ({ ...p, ...formNormalizado }));
      mostrarToast(getFirstErrorText(errs), "error");
      return;
    }

    setGuardando(true);
    setErrores({});
    setForm((p) => ({ ...p, ...formNormalizado }));

    try {
      const { idUsuarioMaster, idTenant } = getUsuarioAuditData();
      const fd = new FormData();

      fd.append("nombre", toCapitalizedText(formNormalizado.nombre));
      fd.append("sku", toUpperCaseValue(formNormalizado.sku.trim()));
      fd.append("precio_costo", moneyToApi(formNormalizado.precio_costo));
      fd.append("precio", moneyToApi(formNormalizado.precio));
      fd.append("margen_venta_porcentaje", moneyToApi(formNormalizado.margen_venta_porcentaje));
      fd.append("margen_venta_valor", moneyToApi(formNormalizado.margen_venta_valor));
      fd.append("precio_promo", moneyToApi(formNormalizado.precio_promo));
      fd.append("margen_promo_porcentaje", moneyToApi(formNormalizado.margen_promo_porcentaje));
      fd.append("margen_promo_valor", moneyToApi(formNormalizado.margen_promo_valor));
      fd.append("stock", formNormalizado.stock !== "" ? String(formNormalizado.stock) : "");
      fd.append("descripcion", toCapitalizedText(formNormalizado.descripcion));

      if (formNormalizado.id_categoria_stock) {
        fd.append("id_categoria_stock", normalizeIdValue(formNormalizado.id_categoria_stock));
      }

      if (idUsuarioMaster > 0) {
        fd.append("idUsuarioMaster", String(idUsuarioMaster));
      }

      if (idTenant) {
        fd.append("tenant_id", String(idTenant));
      }

      const tiposPrecioPayload = formNormalizado.tipos_precio_extra.map((item) => ({
        id_tipo_precio_stock: Number(item.id_tipo_precio_stock) || 0,
        tipo_nombre: toCapitalizedText(item.tipo_nombre),
        nombre: toCapitalizedText(item.tipo_nombre),
        precio: moneyToApi(item.precio),
        margen_porcentaje: moneyToApi(item.margen_porcentaje),
        margen_valor: moneyToApi(item.margen_valor),
      }));

      fd.append("tipos_precio", JSON.stringify(tiposPrecioPayload));

      if (imagenFile) {
        fd.append("imagen", imagenFile);
      }

      const res = await fetch(`${API_URL}?action=stock_productos_crear`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: fd,
      });

      await parseJsonOrThrow(res);

      onGuardado?.();
    } catch (err) {
      mostrarToast(errorToText(err, "Error al guardar el producto"), "error");
    } finally {
      setGuardando(false);
    }
  };

  if (!open) return null;

  const hasCosto = !!form.precio_costo;

  return (
    <div style={{ display: visible ? "contents" : "none" }}>
      <div
        className="mi-modal__content"
        style={{
          overflowY: "auto",
          padding: "20px 22px",
          background: "var(--nv-surface, #F7F9FC)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SectionTitle label="Datos del producto" />

            <FloatingField label="Nombre del producto *" error={errores.nombre}>
              <input
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                onKeyDown={handleFieldEnter}
                className="cmi-input"
                placeholder="Ej: Auriculares bluetooth"
                style={{ fontSize: 14, fontWeight: 600 }}
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
                  style={{ textTransform: "uppercase" }}
                />
              </FloatingField>

              <FloatingField label="Stock inicial" icon={faCubesStacked} error={errores.stock}>
                <input
                  name="stock"
                  value={form.stock}
                  onChange={handleChange}
                  onKeyDown={handleFieldEnter}
                  className="cmi-input"
                  placeholder="Ej: 25"
                  inputMode="numeric"
                />
              </FloatingField>

              <FloatingField label="Categoría" icon={faTag}>
                <select
                  name="id_categoria_stock"
                  value={normalizeIdValue(form.id_categoria_stock)}
                  onChange={handleChange}
                  onKeyDown={handleFieldEnter}
                  className="cmi-input cmi-select"
                  disabled={loadingCategorias}
                >
                  <option value="">
                    {loadingCategorias ? "Cargando categorías..." : "Sin categoría"}
                  </option>
                  <option value="__nueva_categoria__">+ Nueva categoría</option>

                  {categoriasSafe.map((cat) => (
                    <option
                      key={cat.id ?? cat.id_stock_categoria}
                      value={cat.id ?? cat.id_stock_categoria}
                    >
                      {normalizeOptionLabel(
                        cat.nombre,
                        `Categoría ${cat.id ?? cat.id_stock_categoria ?? ""}`
                      )}
                    </option>
                  ))}
                </select>
              </FloatingField>
            </div>
          </section>

          <div className="cmi-priceBlock">
            <div className="cmi-priceBlock__title">
              <FontAwesomeIcon icon={faMoneyBillTrendUp} />
              Precios principales
            </div>

            <p className="cmi-priceBlock__subtitle">
              Con el costo cargado podés escribir el precio final o el margen (% / $) y se calcula automáticamente.
            </p>

            <FloatingField label="Precio de costo" error={errores.precio_costo}>
              <PriceInput
                name="precio_costo"
                value={form.precio_costo}
                onChange={(e) => handleCostoChangeLive(e.target.value)}
                onBlur={(e) => recalcularTodoConCosto(e.target.value, true)}
                onFocus={(e) =>
                  setForm((p) => ({
                    ...p,
                    precio_costo: formatMoneyFocus(e.target.value),
                  }))
                }
                onEnter={(e) =>
                  handlePriceEnter(e, () => recalcularTodoConCosto(e.currentTarget.value, true))
                }
                placeholder="0,00"
              />
            </FloatingField>

            <div
              style={{
                height: 1,
                background: "var(--nv-border, rgba(15,23,42,0.08))",
                margin: "0 -16px",
              }}
            />

            <PriceGroupSection title="Precio de venta">
              <div className="fl-row">
                <FloatingField label="Precio de venta *" error={errores.precio}>
                  <PriceInput
                    name="precio"
                    value={form.precio}
                    onChange={handleChange}
                    onBlur={() => handlePricingBlur("price", "venta", true)}
                    onFocus={(e) =>
                      setForm((p) => ({
                        ...p,
                        precio: formatMoneyFocus(e.target.value),
                      }))
                    }
                    onEnter={(e) =>
                      handlePriceEnter(e, () => handlePricingBlur("price", "venta", true))
                    }
                  />
                </FloatingField>

                <FloatingField label="Margen %">
                  <PriceInput
                    name="margen_venta_porcentaje"
                    value={form.margen_venta_porcentaje}
                    onChange={handleChange}
                    onBlur={() => handlePricingBlur("marginPct", "venta", true)}
                    onFocus={(e) =>
                      setForm((p) => ({
                        ...p,
                        margen_venta_porcentaje: formatMoneyFocus(e.target.value),
                      }))
                    }
                    onEnter={(e) =>
                      handlePriceEnter(e, () => handlePricingBlur("marginPct", "venta", true))
                    }
                    disabled={!hasCosto}
                  />
                </FloatingField>

                <FloatingField label="Margen $">
                  <PriceInput
                    name="margen_venta_valor"
                    value={form.margen_venta_valor}
                    onChange={handleChange}
                    onBlur={() => handlePricingBlur("marginValue", "venta", true)}
                    onFocus={(e) =>
                      setForm((p) => ({
                        ...p,
                        margen_venta_valor: formatMoneyFocus(e.target.value),
                      }))
                    }
                    onEnter={(e) =>
                      handlePriceEnter(e, () => handlePricingBlur("marginValue", "venta", true))
                    }
                    disabled={!hasCosto}
                  />
                </FloatingField>
              </div>
            </PriceGroupSection>

            <PriceGroupSection title="Precio promocional">
              <div className="fl-row">
                <FloatingField label="Precio promocional" error={errores.precio_promo}>
                  <PriceInput
                    name="precio_promo"
                    value={form.precio_promo}
                    onChange={handleChange}
                    onBlur={() => handlePricingBlur("price", "promo", true)}
                    onFocus={(e) =>
                      setForm((p) => ({
                        ...p,
                        precio_promo: formatMoneyFocus(e.target.value),
                      }))
                    }
                    onEnter={(e) =>
                      handlePriceEnter(e, () => handlePricingBlur("price", "promo", true))
                    }
                  />
                </FloatingField>

                <FloatingField label="Margen %">
                  <PriceInput
                    name="margen_promo_porcentaje"
                    value={form.margen_promo_porcentaje}
                    onChange={handleChange}
                    onBlur={() => handlePricingBlur("marginPct", "promo", true)}
                    onFocus={(e) =>
                      setForm((p) => ({
                        ...p,
                        margen_promo_porcentaje: formatMoneyFocus(e.target.value),
                      }))
                    }
                    onEnter={(e) =>
                      handlePriceEnter(e, () => handlePricingBlur("marginPct", "promo", true))
                    }
                    disabled={!hasCosto}
                  />
                </FloatingField>

                <FloatingField label="Margen $">
                  <PriceInput
                    name="margen_promo_valor"
                    value={form.margen_promo_valor}
                    onChange={handleChange}
                    onBlur={() => handlePricingBlur("marginValue", "promo", true)}
                    onFocus={(e) =>
                      setForm((p) => ({
                        ...p,
                        margen_promo_valor: formatMoneyFocus(e.target.value),
                      }))
                    }
                    onEnter={(e) =>
                      handlePriceEnter(e, () => handlePricingBlur("marginValue", "promo", true))
                    }
                    disabled={!hasCosto}
                  />
                </FloatingField>
              </div>
            </PriceGroupSection>
          </div>

          <div className="cmi-priceBlock">
            <div className="cmi-priceBlock__title">
              <FontAwesomeIcon icon={faLayerGroup} />
              Tipos de precio adicionales
            </div>

            <FloatingField label="Agregar tipo de precio">
              <select
                className="cmi-input cmi-select"
                value=""
                onChange={(e) => handleTipoSelectChange(e.target.value)}
                onKeyDown={handleFieldEnter}
                disabled={loadingTiposPrecio}
              >
                <option value="">
                  {loadingTiposPrecio ? "Cargando..." : "Seleccioná un tipo para agregar..."}
                </option>

                <option value="__nuevo_tipo__">+ Nuevo tipo de precio</option>

                {tiposPrecioSafe.map((tipo) => (
                  <option
                    key={tipo.id ?? tipo.id_tipo_precio_stock}
                    value={tipo.id ?? tipo.id_tipo_precio_stock}
                  >
                    {normalizeOptionLabel(tipo.nombre, `Tipo ${tipo.id ?? tipo.id_tipo_precio_stock ?? ""}`)}
                  </option>
                ))}
              </select>
            </FloatingField>

            {form.tipos_precio_extra.map((item, idx) => (
              <div className="cmi-extraPriceCard" key={`${item.id_tipo_precio_stock}-${idx}`}>
                <div className="cmi-extraPriceCard__head">
                  <div className="cmi-extraPriceCard__title">
                    {normalizeOptionLabel(item.tipo_nombre, `Tipo ${idx + 1}`)}
                  </div>

                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost"
                    onClick={() => quitarTipoPrecio(idx)}
                    style={{
                      padding: "5px 11px",
                      fontSize: 12,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      color: "#ef4444",
                      borderColor: "rgba(239,68,68,0.25)",
                    }}
                  >
                    <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 11 }} />
                    Quitar
                  </button>
                </div>

                <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                  <FloatingField label="Precio">
                    <PriceInput
                      name={`extra_precio_${idx}`}
                      value={item.precio}
                      onChange={(e) => handleExtraPriceChange(idx, "precio", e.target.value)}
                      onBlur={() => handleExtraPriceBlur(idx, "price", true)}
                      onEnter={(e) =>
                        handlePriceEnter(e, () => handleExtraPriceBlur(idx, "price", true))
                      }
                    />
                  </FloatingField>

                  <FloatingField label="Margen %">
                    <PriceInput
                      name={`extra_margen_pct_${idx}`}
                      value={item.margen_porcentaje}
                      onChange={(e) => handleExtraPriceChange(idx, "margen_porcentaje", e.target.value)}
                      onBlur={() => handleExtraPriceBlur(idx, "marginPct", true)}
                      onEnter={(e) =>
                        handlePriceEnter(e, () => handleExtraPriceBlur(idx, "marginPct", true))
                      }
                      disabled={!hasCosto}
                    />
                  </FloatingField>

                  <FloatingField label="Margen $">
                    <PriceInput
                      name={`extra_margen_val_${idx}`}
                      value={item.margen_valor}
                      onChange={(e) => handleExtraPriceChange(idx, "margen_valor", e.target.value)}
                      onBlur={() => handleExtraPriceBlur(idx, "marginValue", true)}
                      onEnter={(e) =>
                        handlePriceEnter(e, () => handleExtraPriceBlur(idx, "marginValue", true))
                      }
                      disabled={!hasCosto}
                    />
                  </FloatingField>
                </div>
              </div>
            ))}

            {form.tipos_precio_extra.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "12px 0 4px",
                  fontSize: 12,
                  color: "var(--nv-muted, #5A6A7E)",
                  fontStyle: "italic",
                }}
              >
                No hay tipos de precio adicionales. Seleccioná uno arriba para agregar.
              </div>
            )}
          </div>

          <FloatingField label="Descripción" icon={faAlignLeft}>
            <textarea
              name="descripcion"
              value={form.descripcion}
              onChange={handleChange}
              onKeyDown={handleFieldEnter}
              className="cmi-input cmi-textarea"
              placeholder="Breve descripción del producto (opcional)"
              style={{ textTransform: "none" }}
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
              onChange={(e) => tomarImagen(e.target.files?.[0])}
            />

            {!imagenFile ? (
              <button
                type="button"
                className="mit-btn mit-btn--ghost"
                onClick={() => inputImagenRef.current?.click()}
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
            ) : (
              <div className="cmi-fileResume">
                <div className="cmi-fileResume__left">
                  <span className="cmi-fileResume__icon">
                    <FontAwesomeIcon icon={faImage} />
                  </span>

                  <div className="cmi-fileResume__meta">
                    <div className="cmi-fileResume__name">{imagenNombre}</div>
                    <TipoBadge tipo="imagen" />
                  </div>
                </div>

                <div className="cmi-fileActions">
                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost"
                    onClick={() =>
                      abrirPreviewLocal({
                        file: imagenFile,
                        title: "Imagen del producto",
                      })
                    }
                    style={{ padding: "6px 10px", fontSize: 13 }}
                    title="Ver imagen"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>

                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost"
                    onClick={limpiarImagen}
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
      </div>

      <div className="cmi-footer">
        <span className="mi-card__hint cmi-footer__hint">
          Completá los datos del producto y guardá.
        </span>

        <div className="cmi-footer__btns">
          <button
            type="button"
            className="mit-btn mit-btn--ghost"
            onClick={() => !guardando && onRequestClose?.()}
            disabled={guardando}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="mit-btn mit-btn--solid"
            onClick={handleGuardar}
            disabled={guardando}
          >
            {!guardando && <FontAwesomeIcon icon={faFloppyDisk} style={{ fontSize: 13 }} />}
            {guardando ? "Guardando..." : "Guardar producto"}
          </button>
        </div>
      </div>

      <ModalVerComprobante
        open={previewOpen}
        url={previewUrl}
        mime={previewMime}
        fileName={previewFileName}
        title={previewTitle}
        onClose={cerrarPreview}
      />

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
    </div>
  );
}

/* ── Helper visual: título de sección ── */
function SectionTitle({ label }) {
  return (
    <div className="cmi-priceBlock__title">
      <span
        style={{
          display: "inline-block",
          width: 20,
          height: 2.5,
          borderRadius: 999,
          background: "var(--nv-action, #0055BB)",
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}