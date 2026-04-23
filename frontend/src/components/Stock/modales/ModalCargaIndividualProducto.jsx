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
  faCircleExclamation,
  faMoneyBillTrendUp,
  faPercent,
  faDollarSign,
  faLayerGroup,
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

function normalizeIdValue(value) {
  if (value && typeof value === "object") {
    return String(value.id ?? value.id_stock_categoria ?? value.value ?? "");
  }
  return String(value ?? "");
}

function normalizeOptionLabel(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    return String(value.nombre ?? value.label ?? value.descripcion ?? fallback);
  }
  return fallback;
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

  if (fieldName === "precio_costo") {
    return hydratePricingFormValues(next);
  }

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

function TipoBadge({ tipo }) {
  const map = {
    imagen: { label: "OCR IMG", cls: "cmi-badge--img" },
    "": { label: "NO VÁLIDO", cls: "cmi-badge--none" },
  };

  const { label, cls } = map[tipo] ?? map[""];
  return <span className={`cmi-badge ${cls}`}>{label}</span>;
}

const ErrorMsg = ({ msg }) => (
  <span
    style={{
      fontSize: "0.76rem",
      color: "#ef4444",
      marginTop: 2,
      display: "flex",
      alignItems: "center",
      gap: 4,
    }}
  >
    <FontAwesomeIcon icon={faCircleExclamation} style={{ fontSize: 10 }} />
    {errorToText(msg)}
  </span>
);

function FloatingField({ label, icon, error, children, style }) {
  return (
    <div className="cmi-floatingField cmi-floatingField--active" style={style}>
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
      {error && <ErrorMsg msg={error} />}
    </div>
  );
}

function PriceInput({
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled,
  className,
}) {
  return (
    <input
      name={name}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      className={className || "cmi-input"}
      placeholder={placeholder || "0"}
      disabled={disabled}
      inputMode="decimal"
    />
  );
}

function MiniCreateModal({
  open,
  title,
  value,
  loading,
  onChange,
  onCancel,
  onSave,
}) {
  if (!open) return null;

  return (
    <div className="cmi-miniOverlay">
      <div className="cmi-miniModal">
        <div className="cmi-miniModal__head">{title}</div>
        <div className="cmi-miniModal__body">
          <FloatingField label="Nombre *">
            <input
              className="cmi-input"
              value={value}
              onChange={(e) => onChange(toUpperCaseValue(e.target.value))}
              placeholder="Escribí el nombre"
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

  const mostrarToast = (mensaje, tipo = "error") => {
    onToast?.(errorToText(mensaje), tipo);
  };

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
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const cerrarPreview = () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
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
    if (inputImagenRef.current) inputImagenRef.current.value = "";
  };

  const tomarImagen = (file) => {
    if (!file) return;
    const tipos = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!tipos.includes(file.type)) {
      setErrores((p) => ({ ...p, imagen: "La imagen debe ser JPG, PNG, WEBP o GIF" }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrores((p) => ({ ...p, imagen: "La imagen no puede superar los 5 MB" }));
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
    } else if (["nombre", "sku", "descripcion"].includes(name)) {
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
    recalcularTodoConCosto(value);
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

  const handlePricingBlur = (source, groupName) => {
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

    const result = recalculatePricingGroup({
      cost: form.precio_costo,
      price: form[prefix.price],
      marginPct: form[prefix.marginPct],
      marginValue: form[prefix.marginVal],
      source,
    });

    applyPricingResult(prefix, result);
  };

  const recalcularTodoConCosto = (nuevoCosto) => {
    setForm((p) => {
      const venta = recalculatePricingGroup({
        cost: nuevoCosto,
        price: p.precio,
        marginPct: p.margen_venta_porcentaje,
        marginValue: p.margen_venta_valor,
        source: p.precio ? "price" : p.margen_venta_porcentaje ? "marginPct" : p.margen_venta_valor ? "marginValue" : null,
      });

      const promo = recalculatePricingGroup({
        cost: nuevoCosto,
        price: p.precio_promo,
        marginPct: p.margen_promo_porcentaje,
        marginValue: p.margen_promo_valor,
        source: p.precio_promo ? "price" : p.margen_promo_porcentaje ? "marginPct" : p.margen_promo_valor ? "marginValue" : null,
      });

      const extras = (p.tipos_precio_extra || []).map((item) => {
        const result = recalculatePricingGroup({
          cost: nuevoCosto,
          price: item.precio,
          marginPct: item.margen_porcentaje,
          marginValue: item.margen_valor,
          source: item.precio ? "price" : item.margen_porcentaje ? "marginPct" : item.margen_valor ? "marginValue" : null,
        });
        return {
          ...item,
          precio: result.price,
          margen_porcentaje: result.marginPct,
          margen_valor: result.marginValue,
        };
      });

      return {
        ...p,
        precio_costo: formatMoneyBlur(nuevoCosto),
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

      if (!["precio", "margen_porcentaje", "margen_valor"].includes(field)) {
        return next;
      }

      return {
        ...next,
        tipos_precio_extra: next.tipos_precio_extra.map((item, i) => {
          if (i !== idx) return item;
          const source = field === "precio" ? "price" : field === "margen_porcentaje" ? "marginPct" : "marginValue";
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

  const handleExtraPriceBlur = (idx, source) => {
    setForm((p) => ({
      ...p,
      tipos_precio_extra: p.tipos_precio_extra.map((item, i) => {
        if (i !== idx) return item;
        const result = recalculatePricingGroup({
          cost: p.precio_costo,
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

    const tipo = tiposPrecioSafe.find(
      (t) => String(t.id ?? t.id_tipo_precio_stock) === String(val)
    );

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
      sourceForm.precio_costo !== ""
        ? Number(String(sourceForm.precio_costo).replace(",", "."))
        : null;
    const promo =
      sourceForm.precio_promo !== ""
        ? Number(String(sourceForm.precio_promo).replace(",", "."))
        : null;

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
    const nombreLimpio = String(miniCategoriaNombre || "").trim().toUpperCase();
    if (!nombreLimpio) return;

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

      const categoriaRegistrada = (await onCategoriaCreada?.(nueva)) || nueva;
      const categoriaId = normalizeIdValue(categoriaRegistrada);

      setForm((p) => ({
        ...p,
        id_categoria_stock: categoriaId,
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
    const nombreLimpio = String(miniTipoNombre || "").trim().toUpperCase();
    if (!nombreLimpio) return;

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

        if (yaExiste) {
          return p;
        }

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
      return;
    }

    setGuardando(true);
    setErrores({});
    setForm((p) => ({ ...p, ...formNormalizado }));

    try {
      const { idUsuarioMaster, idTenant } = getUsuarioAuditData();

      const fd = new FormData();
      fd.append("nombre", toUpperCaseValue(formNormalizado.nombre.trim()));
      fd.append("sku", toUpperCaseValue(formNormalizado.sku.trim()));
      fd.append("precio_costo", moneyToApi(formNormalizado.precio_costo));
      fd.append("precio", moneyToApi(formNormalizado.precio));
      fd.append("margen_venta_porcentaje", moneyToApi(formNormalizado.margen_venta_porcentaje));
      fd.append("margen_venta_valor", moneyToApi(formNormalizado.margen_venta_valor));
      fd.append("precio_promo", moneyToApi(formNormalizado.precio_promo));
      fd.append("margen_promo_porcentaje", moneyToApi(formNormalizado.margen_promo_porcentaje));
      fd.append("margen_promo_valor", moneyToApi(formNormalizado.margen_promo_valor));
      fd.append("stock", formNormalizado.stock !== "" ? String(formNormalizado.stock) : "");
      fd.append("descripcion", toUpperCaseValue(formNormalizado.descripcion.trim()));
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
        tipo_nombre: String(item.tipo_nombre || "").trim(),
        nombre: String(item.tipo_nombre || "").trim(),
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

  return (
    <div style={{ display: visible ? "contents" : "none" }}>
      <div className="mi-modal__content" style={{ overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FloatingField label="Nombre del producto *" error={errores.nombre}>
            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              className="cmi-input"
              placeholder="Ej: AURICULARES BLUETOOTH"
              style={{ textTransform: "uppercase" }}
            />
          </FloatingField>

          <div className="fl-row">
            <FloatingField label="SKU / Código" icon={faBarcode}>
              <input
                name="sku"
                value={form.sku}
                onChange={handleChange}
                className="cmi-input"
                placeholder="Ej: 04163"
                style={{ textTransform: "uppercase" }}
              />
            </FloatingField>

            <FloatingField label="Stock" icon={faCubesStacked} error={errores.stock}>
              <input
                name="stock"
                value={form.stock}
                onChange={handleChange}
                className="cmi-input"
                placeholder="Ej: 25"
                inputMode="numeric"
              />
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
                onBlur={(e) => recalcularTodoConCosto(e.target.value)}
                onFocus={(e) =>
                  setForm((p) => ({ ...p, precio_costo: formatMoneyFocus(e.target.value) }))
                }
                placeholder="0,00"
              />
            </FloatingField>

            <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
              <FloatingField label="Precio de venta *" error={errores.precio}>
                <PriceInput
                  name="precio"
                  value={form.precio}
                  onChange={handleChange}
                  onBlur={() => handlePricingBlur("price", "venta")}
                  onFocus={(e) =>
                    setForm((p) => ({ ...p, precio: formatMoneyFocus(e.target.value) }))
                  }
                />
              </FloatingField>

              <FloatingField label="Margen %" icon={faPercent}>
                <PriceInput
                  name="margen_venta_porcentaje"
                  value={form.margen_venta_porcentaje}
                  onChange={handleChange}
                  onBlur={() => handlePricingBlur("marginPct", "venta")}
                  onFocus={(e) =>
                    setForm((p) => ({
                      ...p,
                      margen_venta_porcentaje: formatMoneyFocus(e.target.value),
                    }))
                  }
                  disabled={!form.precio_costo}
                />
              </FloatingField>

              <FloatingField label="Margen $" icon={faDollarSign}>
                <PriceInput
                  name="margen_venta_valor"
                  value={form.margen_venta_valor}
                  onChange={handleChange}
                  onBlur={() => handlePricingBlur("marginValue", "venta")}
                  onFocus={(e) =>
                    setForm((p) => ({
                      ...p,
                      margen_venta_valor: formatMoneyFocus(e.target.value),
                    }))
                  }
                  disabled={!form.precio_costo}
                />
              </FloatingField>
            </div>

            <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
              <FloatingField label="Precio promocional" error={errores.precio_promo}>
                <PriceInput
                  name="precio_promo"
                  value={form.precio_promo}
                  onChange={handleChange}
                  onBlur={() => handlePricingBlur("price", "promo")}
                  onFocus={(e) =>
                    setForm((p) => ({ ...p, precio_promo: formatMoneyFocus(e.target.value) }))
                  }
                />
              </FloatingField>

              <FloatingField label="Margen promo %" icon={faPercent}>
                <PriceInput
                  name="margen_promo_porcentaje"
                  value={form.margen_promo_porcentaje}
                  onChange={handleChange}
                  onBlur={() => handlePricingBlur("marginPct", "promo")}
                  onFocus={(e) =>
                    setForm((p) => ({
                      ...p,
                      margen_promo_porcentaje: formatMoneyFocus(e.target.value),
                    }))
                  }
                  disabled={!form.precio_costo}
                />
              </FloatingField>

              <FloatingField label="Margen promo $" icon={faDollarSign}>
                <PriceInput
                  name="margen_promo_valor"
                  value={form.margen_promo_valor}
                  onChange={handleChange}
                  onBlur={() => handlePricingBlur("marginValue", "promo")}
                  onFocus={(e) =>
                    setForm((p) => ({
                      ...p,
                      margen_promo_valor: formatMoneyFocus(e.target.value),
                    }))
                  }
                  disabled={!form.precio_costo}
                />
              </FloatingField>
            </div>
          </div>

          <div className="cmi-priceBlock">
            <div className="cmi-priceBlock__title">
              <FontAwesomeIcon icon={faLayerGroup} /> Tipos de precio adicionales
            </div>

            <FloatingField label="Agregar tipo de precio">
              <select
                className="cmi-input cmi-select"
                value=""
                onChange={(e) => handleTipoSelectChange(e.target.value)}
                disabled={loadingTiposPrecio}
              >
                <option value="">
                  {loadingTiposPrecio ? "Cargando tipos..." : "Seleccionar tipo para agregar..."}
                </option>
                <option value="__nuevo_tipo__">+ Nuevo tipo de precio</option>
                {tiposPrecioSafe.map((tipo) => (
                  <option
                    key={tipo.id ?? tipo.id_tipo_precio_stock}
                    value={tipo.id ?? tipo.id_tipo_precio_stock}
                  >
                    {normalizeOptionLabel(tipo.nombre, `TIPO ${tipo.id ?? tipo.id_tipo_precio_stock ?? ""}`)}
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
                  <button type="button" className="mit-btn mit-btn--ghost" onClick={() => quitarTipoPrecio(idx)}>
                    <FontAwesomeIcon icon={faTrashCan} /> Quitar
                  </button>
                </div>

                {errores[`tipo_${idx}`] && <ErrorMsg msg={errores[`tipo_${idx}`]} />}

                <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                  <FloatingField label="Precio">
                    <PriceInput
                      name={`extra_precio_${idx}`}
                      value={item.precio}
                      onChange={(e) => handleExtraPriceChange(idx, "precio", e.target.value)}
                      onBlur={() => handleExtraPriceBlur(idx, "price")}
                    />
                  </FloatingField>

                  <FloatingField label="Margen %">
                    <PriceInput
                      name={`extra_margen_pct_${idx}`}
                      value={item.margen_porcentaje}
                      onChange={(e) =>
                        handleExtraPriceChange(idx, "margen_porcentaje", e.target.value)
                      }
                      onBlur={() => handleExtraPriceBlur(idx, "marginPct")}
                      disabled={!form.precio_costo}
                    />
                  </FloatingField>

                  <FloatingField label="Margen $">
                    <PriceInput
                      name={`extra_margen_val_${idx}`}
                      value={item.margen_valor}
                      onChange={(e) => handleExtraPriceChange(idx, "margen_valor", e.target.value)}
                      onBlur={() => handleExtraPriceBlur(idx, "marginValue")}
                      disabled={!form.precio_costo}
                    />
                  </FloatingField>
                </div>
              </div>
            ))}
          </div>

          <FloatingField label="Categoría" icon={faTag}>
            <select
              name="id_categoria_stock"
              value={normalizeIdValue(form.id_categoria_stock)}
              onChange={handleChange}
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
                  {normalizeOptionLabel(cat.nombre, `CATEGORÍA ${cat.id ?? cat.id_stock_categoria ?? ""}`)}
                </option>
              ))}
            </select>
          </FloatingField>

          <FloatingField label="Descripción" icon={faAlignLeft}>
            <textarea
              name="descripcion"
              value={form.descripcion}
              onChange={handleChange}
              className="cmi-input cmi-textarea"
              placeholder="Breve descripción del producto (opcional)"
              rows={3}
              style={{ textTransform: "uppercase" }}
            />
          </FloatingField>

          <div className="cmi-uploadBox">
            <div className="cmi-uploadBox__title">
              <FontAwesomeIcon icon={faPaperclip} /> Imagen del producto
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
              >
                <FontAwesomeIcon icon={faArrowUpFromBracket} /> Seleccionar imagen
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
                    aria-label="Ver archivo"
                    title="Ver archivo"
                  >
                    <FontAwesomeIcon icon={faEye} />
                  </button>

                  <button type="button" className="mit-btn mit-btn--ghost" onClick={limpiarImagen}>
                    <FontAwesomeIcon icon={faTrashCan} /> Quitar
                  </button>
                </div>
              </div>
            )}

            {errores.imagen && <ErrorMsg msg={errores.imagen} />}
          </div>
        </div>
      </div>

      <div className="cmi-footer">
        <div className="mi-card__hint cmi-footer__hint">
          Completá los datos del producto y guardá.
        </div>

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
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <FontAwesomeIcon icon={faFloppyDisk} />
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