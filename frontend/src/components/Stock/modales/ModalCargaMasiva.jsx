import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./ModalCargaMasiva.css";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante";
import ModalCargaIndividualProducto from "./ModalCargaIndividualProducto";
import { useListas } from "../../../context/ListasContext";

import {
  faBoxOpen,
  faCloudArrowUp,
  faFileCsv,
  faImage,
  faXmark,
  faArrowUpFromBracket,
  faDownload,
  faTrashCan,
  faCircleExclamation,
  faCheckCircle,
  faBoxesStacked,
  faFilePdf,
  faTriangleExclamation,
  faTag,
  faBarcode,
  faCubesStacked,
  faAlignLeft,
  faEye,
  faListCheck,
  faPlus,
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
  formatMoneyFocus,
  getUsuarioAuditData,
  moneyToApi,
  moneyToInput,
  normalizeMoneyInput,
  onlyNumbers,
  parseJsonOrThrow,
  recalculatePricingGroup,
  toUpperCaseValue,
} from "./stockFormUtils";

const EXTENSIONES_IMAGEN = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif"];

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

function getTipoArchivo(nombre) {
  if (!nombre) return "";
  const ext = nombre.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  if (EXTENSIONES_IMAGEN.includes(ext)) return "imagen";
  return "";
}

function getMetodoLabel(metodo) {
  switch (metodo) {
    case "google_vision":
      return "Google Vision OCR";
    case "php_pdfparser":
      return "PDF Parser";
    case "pdf_ocr_google_vision":
    case "imagick_google_vision":
      return "PDF escaneado + Google Vision OCR";
    default:
      return metodo || "No informado";
  }
}

function TipoBadge({ tipo }) {
  const map = {
    csv: { label: "CSV", cls: "cmi-badge--csv" },
    pdf: { label: "PDF", cls: "cmi-badge--pdf" },
    imagen: { label: "OCR IMG", cls: "cmi-badge--img" },
    "": { label: "NO VÁLIDO", cls: "cmi-badge--none" },
  };

  const { label, cls } = map[tipo] ?? map[""];
  return <span className={`cmi-badge ${cls}`}>{label}</span>;
}

function IconoArchivo({ tipo }) {
  if (tipo === "csv") return <FontAwesomeIcon icon={faFileCsv} />;
  if (tipo === "pdf") return <FontAwesomeIcon icon={faFilePdf} />;
  if (tipo === "imagen") return <FontAwesomeIcon icon={faImage} />;
  return <FontAwesomeIcon icon={faTriangleExclamation} />;
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
    {msg}
  </span>
);

const plantillaCsvMasivo = `nombre;sku;precio_costo;precio_venta;margen_venta_porcentaje;margen_venta_valor;precio_promocional;margen_promo_porcentaje;margen_promo_valor;stock;descripcion
SMARTWATCH MI BAND 9 XIAOMI;04163;65000;89999;;;79999;;;12;Pulsera inteligente Xiaomi
CARGADOR UNIVERSAL NOTEBOOK - ONLY - CON FICHA HP - 8 PINES;00410;18000;25999;;; ;;;33;Cargador notebook HP
AFEITADORA CORPORAL 3 EN 1;04162;32000;45999;;;39999;;;8;Afeitadora corporal
`;

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

function PriceInput({ name, value, onChange, onBlur, onFocus, placeholder, disabled, className }) {
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

function MiniCreateModal({ open, title, value, loading, onChange, onCancel, onSave }) {
  if (!open) return null;
  return createPortal(
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
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={loading}>
              Cancelar
            </button>
            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={loading}>
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function normalizarProductoDetectado(item = {}) {
  return {
    nombre: toUpperCaseValue(String(item.nombre ?? "").trim()),
    sku: toUpperCaseValue(String(item.sku ?? "").trim()),
    precio_costo: moneyToInput(item.precio_costo ?? ""),
    precio: moneyToInput(item.precio ?? item.precio_venta ?? ""),
    margen_venta_porcentaje: moneyToInput(item.margen_venta_porcentaje ?? ""),
    margen_venta_valor: moneyToInput(item.margen_venta_valor ?? ""),
    precio_promo: moneyToInput(item.precio_promo ?? item.precio_promocional ?? ""),
    margen_promo_porcentaje: moneyToInput(item.margen_promo_porcentaje ?? ""),
    margen_promo_valor: moneyToInput(item.margen_promo_valor ?? ""),
    stock: item.stock === null || item.stock === undefined ? "" : String(item.stock),
    descripcion: toUpperCaseValue(String(item.descripcion ?? "").trim()),
    id_categoria_stock:
      item.id_categoria_stock === null || item.id_categoria_stock === undefined
        ? ""
        : String(item.id_categoria_stock),
    imagen: null,
    tipos_precio_extra: [],
  };
}

function ModalConfirmarProductosIA({
  open,
  dark,
  productos,
  categorias,
  tiposPrecio,
  loadingCategorias,
  loadingTiposPrecio,
  onClose,
  onChangeProducto,
  onPricingBlur,
  onRecalcByCost,
  onAddFila,
  onRemoveFila,
  onTakeImage,
  onRemoveImage,
  onPreviewImage,
  onConfirm,
  confirmando,
  errores,
  onCategoriaCreate,
  onTipoCreate,
}) {
  const [miniCategoriaOpen, setMiniCategoriaOpen] = useState(false);
  const [miniCategoriaNombre, setMiniCategoriaNombre] = useState("");
  const [miniCategoriaFila, setMiniCategoriaFila] = useState(null);
  const [guardandoMiniCategoria, setGuardandoMiniCategoria] = useState(false);

  const [miniTipoOpen, setMiniTipoOpen] = useState(false);
  const [miniTipoNombre, setMiniTipoNombre] = useState("");
  const [miniTipoFila, setMiniTipoFila] = useState(null);
  const [guardandoMiniTipo, setGuardandoMiniTipo] = useState(false);

  if (!open) return null;

  const guardarCategoria = async () => {
    if (miniCategoriaFila === null || !miniCategoriaNombre.trim()) return;
    setGuardandoMiniCategoria(true);
    try {
      const nueva = await onCategoriaCreate(miniCategoriaNombre.trim());
      onChangeProducto(miniCategoriaFila, "id_categoria_stock", String(nueva.id ?? nueva.id_stock_categoria ?? ""));
      setMiniCategoriaOpen(false);
      setMiniCategoriaNombre("");
      setMiniCategoriaFila(null);
    } finally {
      setGuardandoMiniCategoria(false);
    }
  };

  const guardarTipo = async () => {
    if (miniTipoFila === null || !miniTipoNombre.trim()) return;
    setGuardandoMiniTipo(true);
    try {
      const nuevo = await onTipoCreate(miniTipoNombre.trim());
      const current = productos[miniTipoFila]?.tipos_precio_extra || [];
      onChangeProducto(miniTipoFila, "tipos_precio_extra", [...current, emptyExtraPriceRow(nuevo)]);
      setMiniTipoOpen(false);
      setMiniTipoNombre("");
      setMiniTipoFila(null);
    } finally {
      setGuardandoMiniTipo(false);
    }
  };

  // Agrega un tipo de precio inmediatamente al seleccionarlo del select
  const handleTipoSelectChange = (idx, item, val) => {
    if (!val) return;

    if (val === "__nuevo_tipo__") {
      setMiniTipoFila(idx);
      setMiniTipoOpen(true);
      return;
    }

    const existe = (item.tipos_precio_extra || []).some(
      (x) => String(x.id_tipo_precio_stock) === String(val)
    );
    if (existe) return;

    const tipo = tiposPrecio.find(
      (t) => String(t.id ?? t.id_tipo_precio_stock) === String(val)
    );
    onChangeProducto(idx, "tipos_precio_extra", [
      ...(item.tipos_precio_extra || []),
      emptyExtraPriceRow(tipo),
    ]);
  };

  return createPortal(
    <>
      <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
        <div
          className={["mi-modal__container", "cmi-container", dark ? "mi-modal--dark" : ""]
            .join(" ")
            .trim()}
          role="dialog"
          aria-modal="true"
          style={{ width: "min(1180px, 96vw)", maxHeight: "92vh" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faListCheck} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Confirmar productos detectados</h2>
              <p className="mi-modal__subtitle">Revisá y corregí los datos antes de cargarlos a la base</p>
            </div>

            <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar" disabled={confirmando} type="button">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="mi-modal__content" style={{ overflowY: "auto", padding: 20 }}>
            {errores.global && (
              <div className="cmi-warnBox" style={{ marginBottom: 14 }}>
                <div className="cmi-warnBox__title">
                  <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: 8 }} />
                  Error
                </div>
                <div>{errores.global}</div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div className="mi-card__hint">
                Se detectaron <b>{productos.length}</b> producto{productos.length !== 1 ? "s" : ""}.
              </div>

              <button type="button" className="mit-btn mit-btn--ghost" onClick={onAddFila} disabled={confirmando} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <FontAwesomeIcon icon={faPlus} /> Agregar fila
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {productos.map((item, idx) => {
                const err = errores[`fila_${idx}`] || {};
                return (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--nv-border-md)",
                      borderRadius: 14,
                      padding: 14,
                      background: "var(--nv-bg-soft, rgba(255,255,255,0.02))",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Producto {idx + 1}</div>
                      <button type="button" className="mit-btn mit-btn--ghost" onClick={() => onRemoveFila(idx)} disabled={confirmando || productos.length <= 1}>
                        <FontAwesomeIcon icon={faTrashCan} /> Quitar
                      </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <FloatingField label="Nombre *" error={err.nombre}>
                        <input
                          className="cmi-input"
                          value={item.nombre}
                          onChange={(e) => onChangeProducto(idx, "nombre", toUpperCaseValue(e.target.value))}
                          placeholder="Nombre del producto"
                        />
                      </FloatingField>

                      <div className="fl-row">
                        <FloatingField label="SKU / Código" icon={faBarcode}>
                          <input
                            className="cmi-input"
                            value={item.sku}
                            onChange={(e) => onChangeProducto(idx, "sku", toUpperCaseValue(e.target.value))}
                            placeholder="Ej: 04163"
                          />
                        </FloatingField>

                        <FloatingField label="Stock" icon={faCubesStacked} error={err.stock}>
                          <input
                            className="cmi-input"
                            value={item.stock}
                            onChange={(e) => onChangeProducto(idx, "stock", onlyNumbers(e.target.value))}
                            placeholder="Ej: 25"
                            inputMode="numeric"
                          />
                        </FloatingField>
                      </div>

                      <div className="cmi-priceBlock">
                        <div className="cmi-priceBlock__title">
                          <FontAwesomeIcon icon={faMoneyBillTrendUp} /> Precios principales
                        </div>

                        <FloatingField label="Precio de costo" error={err.precio_costo}>
                          <PriceInput
                            name={`precio_costo_${idx}`}
                            value={item.precio_costo}
                            onChange={(e) => onChangeProducto(idx, "precio_costo", normalizeMoneyInput(e.target.value))}
                            onBlur={(e) => onRecalcByCost(idx, e.target.value)}
                            onFocus={(e) => onChangeProducto(idx, "precio_costo", formatMoneyFocus(e.target.value))}
                          />
                        </FloatingField>

                        <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                          <FloatingField label="Precio de venta *" error={err.precio}>
                            <PriceInput
                              name={`precio_${idx}`}
                              value={item.precio}
                              onChange={(e) => onChangeProducto(idx, "precio", normalizeMoneyInput(e.target.value))}
                              onBlur={() => onPricingBlur(idx, "price", "venta")}
                              onFocus={(e) => onChangeProducto(idx, "precio", formatMoneyFocus(e.target.value))}
                            />
                          </FloatingField>

                          <FloatingField label="Margen %" icon={faPercent}>
                            <PriceInput
                              name={`margen_venta_porcentaje_${idx}`}
                              value={item.margen_venta_porcentaje}
                              onChange={(e) =>
                                onChangeProducto(idx, "margen_venta_porcentaje", normalizeMoneyInput(e.target.value))
                              }
                              onBlur={() => onPricingBlur(idx, "marginPct", "venta")}
                              onFocus={(e) =>
                                onChangeProducto(idx, "margen_venta_porcentaje", formatMoneyFocus(e.target.value))
                              }
                              disabled={!item.precio_costo}
                            />
                          </FloatingField>

                          <FloatingField label="Margen $" icon={faDollarSign}>
                            <PriceInput
                              name={`margen_venta_valor_${idx}`}
                              value={item.margen_venta_valor}
                              onChange={(e) =>
                                onChangeProducto(idx, "margen_venta_valor", normalizeMoneyInput(e.target.value))
                              }
                              onBlur={() => onPricingBlur(idx, "marginValue", "venta")}
                              onFocus={(e) =>
                                onChangeProducto(idx, "margen_venta_valor", formatMoneyFocus(e.target.value))
                              }
                              disabled={!item.precio_costo}
                            />
                          </FloatingField>
                        </div>

                        <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                          <FloatingField label="Precio promocional" error={err.precio_promo}>
                            <PriceInput
                              name={`precio_promo_${idx}`}
                              value={item.precio_promo}
                              onChange={(e) => onChangeProducto(idx, "precio_promo", normalizeMoneyInput(e.target.value))}
                              onBlur={() => onPricingBlur(idx, "price", "promo")}
                              onFocus={(e) => onChangeProducto(idx, "precio_promo", formatMoneyFocus(e.target.value))}
                            />
                          </FloatingField>

                          <FloatingField label="Margen promo %" icon={faPercent}>
                            <PriceInput
                              name={`margen_promo_porcentaje_${idx}`}
                              value={item.margen_promo_porcentaje}
                              onChange={(e) =>
                                onChangeProducto(idx, "margen_promo_porcentaje", normalizeMoneyInput(e.target.value))
                              }
                              onBlur={() => onPricingBlur(idx, "marginPct", "promo")}
                              onFocus={(e) =>
                                onChangeProducto(idx, "margen_promo_porcentaje", formatMoneyFocus(e.target.value))
                              }
                              disabled={!item.precio_costo}
                            />
                          </FloatingField>

                          <FloatingField label="Margen promo $" icon={faDollarSign}>
                            <PriceInput
                              name={`margen_promo_valor_${idx}`}
                              value={item.margen_promo_valor}
                              onChange={(e) =>
                                onChangeProducto(idx, "margen_promo_valor", normalizeMoneyInput(e.target.value))
                              }
                              onBlur={() => onPricingBlur(idx, "marginValue", "promo")}
                              onFocus={(e) =>
                                onChangeProducto(idx, "margen_promo_valor", formatMoneyFocus(e.target.value))
                              }
                              disabled={!item.precio_costo}
                            />
                          </FloatingField>
                        </div>
                      </div>

                      <div className="cmi-priceBlock">
                        <div className="cmi-priceBlock__title">
                          <FontAwesomeIcon icon={faLayerGroup} /> Tipos de precio adicionales
                        </div>

                        {/* SELECT: al cambiar agrega inmediatamente o abre modal si es __nuevo_tipo__ */}
                        <FloatingField label="Agregar tipo de precio">
                          <select
                            className="cmi-input cmi-select"
                            value=""
                            onChange={(e) => handleTipoSelectChange(idx, item, e.target.value)}
                            disabled={loadingTiposPrecio || confirmando}
                          >
                            <option value="">{loadingTiposPrecio ? "Cargando tipos..." : "Seleccionar tipo para agregar..."}</option>
                            <option value="__nuevo_tipo__">+ Nuevo tipo de precio</option>
                            {tiposPrecio.map((tipo) => (
                              <option key={tipo.id ?? tipo.id_tipo_precio_stock} value={tipo.id ?? tipo.id_tipo_precio_stock}>
                                {tipo.nombre}
                              </option>
                            ))}
                          </select>
                        </FloatingField>

                        {(item.tipos_precio_extra || []).map((tipoItem, tIdx) => (
                          <div className="cmi-extraPriceCard" key={`${tipoItem.id_tipo_precio_stock}-${tIdx}`}>
                            <div className="cmi-extraPriceCard__head">
                              <div className="cmi-extraPriceCard__title">{tipoItem.tipo_nombre || `Tipo ${tIdx + 1}`}</div>
                              <button
                                type="button"
                                className="mit-btn mit-btn--ghost"
                                onClick={() =>
                                  onChangeProducto(
                                    idx,
                                    "tipos_precio_extra",
                                    (item.tipos_precio_extra || []).filter((_, i) => i !== tIdx)
                                  )
                                }
                              >
                                <FontAwesomeIcon icon={faTrashCan} /> Quitar
                              </button>
                            </div>

                            <div className="fl-row" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                              <FloatingField label="Precio">
                                <PriceInput
                                  name={`tipo_precio_${idx}_${tIdx}`}
                                  value={tipoItem.precio}
                                  onChange={(e) => {
                                    const next = [...(item.tipos_precio_extra || [])];
                                    next[tIdx] = { ...next[tIdx], precio: normalizeMoneyInput(e.target.value) };
                                    onChangeProducto(idx, "tipos_precio_extra", next);
                                  }}
                                  onBlur={() => {
                                    const result = recalculatePricingGroup({
                                      cost: item.precio_costo,
                                      price: tipoItem.precio,
                                      marginPct: tipoItem.margen_porcentaje,
                                      marginValue: tipoItem.margen_valor,
                                      source: "price",
                                    });
                                    const next = [...(item.tipos_precio_extra || [])];
                                    next[tIdx] = {
                                      ...next[tIdx],
                                      precio: result.price,
                                      margen_porcentaje: result.marginPct,
                                      margen_valor: result.marginValue,
                                    };
                                    onChangeProducto(idx, "tipos_precio_extra", next);
                                  }}
                                />
                              </FloatingField>

                              <FloatingField label="Margen %">
                                <PriceInput
                                  name={`tipo_pct_${idx}_${tIdx}`}
                                  value={tipoItem.margen_porcentaje}
                                  onChange={(e) => {
                                    const next = [...(item.tipos_precio_extra || [])];
                                    next[tIdx] = {
                                      ...next[tIdx],
                                      margen_porcentaje: normalizeMoneyInput(e.target.value),
                                    };
                                    onChangeProducto(idx, "tipos_precio_extra", next);
                                  }}
                                  onBlur={() => {
                                    const result = recalculatePricingGroup({
                                      cost: item.precio_costo,
                                      price: tipoItem.precio,
                                      marginPct: tipoItem.margen_porcentaje,
                                      marginValue: tipoItem.margen_valor,
                                      source: "marginPct",
                                    });
                                    const next = [...(item.tipos_precio_extra || [])];
                                    next[tIdx] = {
                                      ...next[tIdx],
                                      precio: result.price,
                                      margen_porcentaje: result.marginPct,
                                      margen_valor: result.marginValue,
                                    };
                                    onChangeProducto(idx, "tipos_precio_extra", next);
                                  }}
                                  disabled={!item.precio_costo}
                                />
                              </FloatingField>

                              <FloatingField label="Margen $">
                                <PriceInput
                                  name={`tipo_val_${idx}_${tIdx}`}
                                  value={tipoItem.margen_valor}
                                  onChange={(e) => {
                                    const next = [...(item.tipos_precio_extra || [])];
                                    next[tIdx] = { ...next[tIdx], margen_valor: normalizeMoneyInput(e.target.value) };
                                    onChangeProducto(idx, "tipos_precio_extra", next);
                                  }}
                                  onBlur={() => {
                                    const result = recalculatePricingGroup({
                                      cost: item.precio_costo,
                                      price: tipoItem.precio,
                                      marginPct: tipoItem.margen_porcentaje,
                                      marginValue: tipoItem.margen_valor,
                                      source: "marginValue",
                                    });
                                    const next = [...(item.tipos_precio_extra || [])];
                                    next[tIdx] = {
                                      ...next[tIdx],
                                      precio: result.price,
                                      margen_porcentaje: result.marginPct,
                                      margen_valor: result.marginValue,
                                    };
                                    onChangeProducto(idx, "tipos_precio_extra", next);
                                  }}
                                  disabled={!item.precio_costo}
                                />
                              </FloatingField>
                            </div>
                          </div>
                        ))}
                      </div>

                      <FloatingField label="Categoría" icon={faTag}>
                        <select
                          className="cmi-input cmi-select"
                          value={item.id_categoria_stock}
                          onChange={(e) => {
                            if (e.target.value === "__nueva_categoria__") {
                              setMiniCategoriaFila(idx);
                              setMiniCategoriaOpen(true);
                              return;
                            }
                            onChangeProducto(idx, "id_categoria_stock", e.target.value);
                          }}
                          disabled={loadingCategorias || confirmando}
                        >
                          <option value="">{loadingCategorias ? "Cargando categorías..." : "Sin categoría"}</option>
                          <option value="__nueva_categoria__">+ Nueva categoría</option>
                          {categorias.map((cat) => (
                            <option key={cat.id ?? cat.id_stock_categoria} value={cat.id ?? cat.id_stock_categoria}>
                              {cat.nombre}
                            </option>
                          ))}
                        </select>
                      </FloatingField>

                      <FloatingField label="Descripción" icon={faAlignLeft}>
                        <textarea
                          className="cmi-input cmi-textarea"
                          rows={3}
                          value={item.descripcion}
                          onChange={(e) => onChangeProducto(idx, "descripcion", toUpperCaseValue(e.target.value))}
                          placeholder="Descripción opcional"
                        />
                      </FloatingField>

                      <FloatingField label="Imagen del producto" error={err.imagen}>
                        <div className="cmi-uploadBox" style={{ marginTop: 6 }}>
                          <input
                            id={`imagen_detectada_${idx}`}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,.gif,image/*"
                            hidden
                            onChange={(e) => onTakeImage?.(idx, e.target.files?.[0])}
                          />

                          {!item.imagen ? (
                            <button
                              type="button"
                              className="mit-btn mit-btn--ghost"
                              onClick={() => document.getElementById(`imagen_detectada_${idx}`)?.click()}
                              disabled={confirmando}
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
                                  <div className="cmi-fileResume__name">{item.imagen.name}</div>
                                  <TipoBadge tipo="imagen" />
                                </div>
                              </div>

                              <div className="cmi-fileActions">
                                <button type="button" className="mit-btn mit-btn--ghost" onClick={() => onPreviewImage?.(item.imagen)} title="Ver imagen">
                                  <FontAwesomeIcon icon={faEye} />
                                </button>
                                <button type="button" className="mit-btn mit-btn--ghost" onClick={() => onRemoveImage?.(idx)} disabled={confirmando}>
                                  <FontAwesomeIcon icon={faTrashCan} /> Quitar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </FloatingField>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cmi-footer">
            <div className="mi-card__hint cmi-footer__hint">Confirmá solo cuando los datos estén correctos.</div>
            <div className="cmi-footer__btns">
              <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={confirmando}>
                Cancelar
              </button>
              <button
                type="button"
                className="mit-btn mit-btn--solid"
                onClick={onConfirm}
                disabled={confirmando || !productos.length}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <FontAwesomeIcon icon={faCheckCircle} />
                {confirmando ? "Cargando..." : "Confirmar y cargar"}
              </button>
            </div>
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
          setMiniCategoriaFila(null);
        }}
        onSave={guardarCategoria}
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
          setMiniTipoFila(null);
        }}
        onSave={guardarTipo}
      />
    </>,
    document.body
  );
}

export default function ModalCargaMasiva({
  open,
  onClose,
  onGuardado,
  onToast,
  onImportado,
  categorias: categoriasProp,
  loadingCategorias: loadingCategoriasProp,
}) {
  const closeBtnRef = useRef(null);
  const fileInputMasivoRef = useRef(null);

  const [tab, setTab] = useState("individual");
  const [dark, setDark] = useState(isTemaOscuro);

  const [categoriasLocal, setCategoriasLocal] = useState(categoriasProp || []);

  const { lists, loadingLists, ensureListsLoaded, refreshLists, setLists } = useListas();

  const tiposPrecio = useMemo(
    () => (Array.isArray(lists?.stock_tipos_precio) ? lists.stock_tipos_precio : []),
    [lists]
  );

  const loadingTiposPrecio = loadingLists && tiposPrecio.length === 0;

  const loadingCategorias = loadingCategoriasProp || false;

  const [individualLoading, setIndividualLoading] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [clasificando, setClasificando] = useState(false);
  const [confirmandoDetectados, setConfirmandoDetectados] = useState(false);

  const isLoading = individualLoading || subiendo || clasificando || confirmandoDetectados;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewMime, setPreviewMime] = useState("");
  const [previewFileName, setPreviewFileName] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Archivo");

  const [archivo, setArchivo] = useState(null);
  const [resultado, setResultado] = useState(null);

  const [modalConfirmOpen, setModalConfirmOpen] = useState(false);
  const [productosDetectados, setProductosDetectados] = useState([]);
  const [erroresDetectados, setErroresDetectados] = useState({});
  const [textoDetectadoOriginal, setTextoDetectadoOriginal] = useState("");

  useEffect(() => {
    setCategoriasLocal(categoriasProp || []);
  }, [categoriasProp]);

  const nombreArchivo = useMemo(() => archivo?.name || "", [archivo]);
  const tipoArchivo = useMemo(() => getTipoArchivo(archivo?.name), [archivo]);

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update);
    if (document.body) {
      o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape" && !isLoading && !previewOpen && !modalConfirmOpen) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose, isLoading, previewOpen, modalConfirmOpen]);

  useEffect(() => {
    if (open) setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) {
      resetMasivo();
      cerrarPreview();
      cerrarModalConfirmacion();
      setTab("individual");
      setIndividualLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    ensureListsLoaded?.({ force: false, background: true });
  }, [open, ensureListsLoaded]);

  function resetMasivo() {
    setArchivo(null);
    setSubiendo(false);
    setClasificando(false);
    setConfirmandoDetectados(false);
    setResultado(null);
    setTextoDetectadoOriginal("");
    if (fileInputMasivoRef.current) fileInputMasivoRef.current.value = "";
  }

  function cerrarModalConfirmacion() {
    setModalConfirmOpen(false);
    setProductosDetectados([]);
    setErroresDetectados({});
  }

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

  const handleArchivoChange = (file) => {
    if (!file) return;
    setArchivo(file);
    setResultado(null);
    setTextoDetectadoOriginal("");
    cerrarModalConfirmacion();
  };

  const descargarPlantilla = () => {
    const blob = new Blob([plantillaCsvMasivo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_productos.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  async function clasificarTextoDetectado(textoDetectado) {
    const res = await fetch(`${API_URL}?action=stock_productos_clasificar_texto`, {
      method: "POST",
      headers: buildHeadersJSON(),
      body: JSON.stringify({ texto: textoDetectado }),
    });
    return parseJsonOrThrow(res);
  }

  const registrarCategoriaCreadaLocal = async (nueva) => {
    if (!nueva) return null;

    setCategoriasLocal((prev) => {
      const idNuevo = String(nueva.id ?? nueva.id_stock_categoria ?? "");
      const existe = prev.some(
        (x) => String(x.id ?? x.id_stock_categoria) === idNuevo
      );
      if (existe) return prev;

      return [...prev, nueva].sort((a, b) =>
        String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
      );
    });

    try {
      window.dispatchEvent(new Event("balto:listas-updated"));
    } catch {}

    return nueva;
  };

  const registrarTipoPrecioCreadoLocal = async (nuevo) => {
    if (!nuevo) return null;

    setLists((prev) => {
      const actuales = Array.isArray(prev?.stock_tipos_precio)
        ? prev.stock_tipos_precio
        : [];

      const idNuevo = String(nuevo.id ?? nuevo.id_tipo_precio_stock ?? "");
      const existe = actuales.some(
        (x) => String(x.id ?? x.id_tipo_precio_stock) === idNuevo
      );

      const next = existe
        ? actuales
        : [...actuales, nuevo].sort((a, b) =>
            String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
          );

      return {
        ...(prev || {}),
        stock_tipos_precio: next,
      };
    });

    // Intentar refresh en background sin bloquear ni lanzar error
    try {
      if (typeof refreshLists === "function") {
        refreshLists().catch(() => {});
      } else {
        window.dispatchEvent(new Event("balto:listas-updated"));
      }
    } catch {}

    return nuevo;
  };

  const crearCategoriaRapida = async (nombre) => {
    const res = await fetch(`${API_URL}?action=stock_categorias_crear`, {
      method: "POST",
      headers: buildHeadersJSON(),
      body: JSON.stringify({ nombre }),
    });
    const data = await parseJsonOrThrow(res);
    const nueva = data.categoria || {
      id: data.id_stock_categoria,
      id_stock_categoria: data.id_stock_categoria,
      nombre,
    };

    setCategoriasLocal((prev) => {
      const existe = prev.some((x) => String(x.id ?? x.id_stock_categoria) === String(nueva.id ?? nueva.id_stock_categoria));
      if (existe) return prev;
      return [...prev, nueva].sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
    });

    // Refresh en background sin bloquear
    try {
      window.dispatchEvent(new Event("balto:listas-updated"));
    } catch {}

    return nueva;
  };

  const crearTipoPrecioRapido = async (nombre) => {
    const nombreLimpio = String(nombre ?? "").trim().toUpperCase();
    if (!nombreLimpio) {
      throw new Error("El nombre del tipo de precio es obligatorio.");
    }

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

    setLists((prev) => {
      const actuales = Array.isArray(prev?.stock_tipos_precio) ? prev.stock_tipos_precio : [];
      const idNuevo = String(nuevo.id ?? nuevo.id_tipo_precio_stock ?? "");
      const existe = actuales.some((x) => String(x.id ?? x.id_tipo_precio_stock) === idNuevo);
      if (existe) return prev;
      const next = [...actuales, nuevo].sort((a, b) =>
        String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
      );
      return { ...(prev || {}), stock_tipos_precio: next };
    });

    try {
      if (typeof refreshLists === "function") {
        refreshLists().catch(() => {});
      } else {
        window.dispatchEvent(new Event("balto:listas-updated"));
      }
    } catch {}

    return nuevo;
  };

  const handleImportar = async () => {
    if (!archivo) {
      onToast?.("error", "Seleccioná un archivo CSV, PDF o imagen.");
      return;
    }
    if (!tipoArchivo) {
      onToast?.("error", "Formato no válido. Admitido: CSV, PDF, JPG, PNG y otros formatos de imagen.");
      return;
    }

    try {
      setSubiendo(true);
      setResultado(null);
      cerrarModalConfirmacion();

      const formData = new FormData();
      let action = "";

      if (tipoArchivo === "csv") {
        action = "stock_productos_importar_csv";
        formData.append("archivo_csv", archivo);
      }
      if (tipoArchivo === "pdf") {
        action = "stock_productos_importar_pdf";
        formData.append("archivo_pdf", archivo);
      }
      if (tipoArchivo === "imagen") {
        action = "stock_productos_ocr_imagen";
        formData.append("archivo_imagen", archivo);
      }

      const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: buildHeadersMultipart(),
        body: formData,
      });

      const data = await parseJsonOrThrow(res);
      setResultado(data);

      if (tipoArchivo === "csv") {
        onImportado?.(`Importación finalizada. Creados: ${data.creados || 0}. Actualizados: ${data.actualizados || 0}.`);
        return;
      }

      const textoDetectado = String(data.texto_detectado || "").trim();
      setTextoDetectadoOriginal(textoDetectado);
      const chars = data.total_caracteres ?? 0;
      const metodo = getMetodoLabel(data.metodo);
      onToast?.("success", `Texto extraído con ${metodo}: ${chars} caracteres.`);

      if (!textoDetectado) {
        onToast?.("error", "No se detectó texto para clasificar productos.");
        return;
      }

      setClasificando(true);
      const clasificado = await clasificarTextoDetectado(textoDetectado);
      const productos = Array.isArray(clasificado.productos)
        ? clasificado.productos.map(normalizarProductoDetectado)
        : [];

      if (!productos.length) {
        onToast?.("error", "No se pudieron detectar productos confiables desde el texto.");
        return;
      }

      setProductosDetectados(productos);
      setErroresDetectados({});
      setModalConfirmOpen(true);
      onToast?.("success", `Se detectaron ${productos.length} producto${productos.length !== 1 ? "s" : ""}. Revisalos y confirmá.`);
    } catch (err) {
      onToast?.("error", err.message || "Error al procesar el archivo.");
    } finally {
      setSubiendo(false);
      setClasificando(false);
    }
  };

  const handleProductoDetectadoChange = (idx, field, value) => {
    setProductosDetectados((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
    setErroresDetectados((prev) => {
      const next = { ...prev };
      if (next[`fila_${idx}`]?.[field]) next[`fila_${idx}`] = { ...next[`fila_${idx}`], [field]: "" };
      next.global = "";
      return next;
    });
  };

  const handlePricingBlurDetectado = (idx, source, groupName) => {
    setProductosDetectados((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const result = recalculatePricingGroup({
          cost: item.precio_costo,
          price: groupName === "venta" ? item.precio : item.precio_promo,
          marginPct: groupName === "venta" ? item.margen_venta_porcentaje : item.margen_promo_porcentaje,
          marginValue: groupName === "venta" ? item.margen_venta_valor : item.margen_promo_valor,
          source,
        });
        return groupName === "venta"
          ? {
              ...item,
              precio: result.price,
              margen_venta_porcentaje: result.marginPct,
              margen_venta_valor: result.marginValue,
            }
          : {
              ...item,
              precio_promo: result.price,
              margen_promo_porcentaje: result.marginPct,
              margen_promo_valor: result.marginValue,
            };
      })
    );
  };

  const handleRecalcByCostDetectado = (idx, value) => {
    setProductosDetectados((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const venta = recalculatePricingGroup({
          cost: value,
          price: item.precio,
          marginPct: item.margen_venta_porcentaje,
          marginValue: item.margen_venta_valor,
          source: item.precio ? "price" : item.margen_venta_porcentaje ? "marginPct" : item.margen_venta_valor ? "marginValue" : null,
        });
        const promo = recalculatePricingGroup({
          cost: value,
          price: item.precio_promo,
          marginPct: item.margen_promo_porcentaje,
          marginValue: item.margen_promo_valor,
          source: item.precio_promo ? "price" : item.margen_promo_porcentaje ? "marginPct" : item.margen_promo_valor ? "marginValue" : null,
        });
        const extras = (item.tipos_precio_extra || []).map((row) => {
          const r = recalculatePricingGroup({
            cost: value,
            price: row.precio,
            marginPct: row.margen_porcentaje,
            marginValue: row.margen_valor,
            source: row.precio ? "price" : row.margen_porcentaje ? "marginPct" : row.margen_valor ? "marginValue" : null,
          });
          return { ...row, precio: r.price, margen_porcentaje: r.marginPct, margen_valor: r.marginValue };
        });
        return {
          ...item,
          precio_costo: normalizeMoneyInput(value),
          precio: venta.price,
          margen_venta_porcentaje: venta.marginPct,
          margen_venta_valor: venta.marginValue,
          precio_promo: promo.price,
          margen_promo_porcentaje: promo.marginPct,
          margen_promo_valor: promo.marginValue,
          tipos_precio_extra: extras,
        };
      })
    );
  };

  const handleAddFilaDetectada = () => {
    setProductosDetectados((prev) => [...prev, normalizarProductoDetectado({})]);
  };

  const handleRemoveFilaDetectada = (idx) => {
    setProductosDetectados((prev) => prev.filter((_, i) => i !== idx));
    setErroresDetectados({});
  };

  const handleImagenProductoDetectado = (idx, file) => {
    if (!file) return;
    const tipos = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!tipos.includes(file.type)) {
      setErroresDetectados((prev) => ({
        ...prev,
        [`fila_${idx}`]: { ...(prev[`fila_${idx}`] || {}), imagen: "La imagen debe ser JPG, PNG, WEBP o GIF" },
        global: "",
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErroresDetectados((prev) => ({
        ...prev,
        [`fila_${idx}`]: { ...(prev[`fila_${idx}`] || {}), imagen: "La imagen no puede superar los 5 MB" },
        global: "",
      }));
      return;
    }
    setProductosDetectados((prev) => prev.map((item, i) => (i === idx ? { ...item, imagen: file } : item)));
  };

  const handleQuitarImagenProductoDetectado = (idx) => {
    setProductosDetectados((prev) => prev.map((item, i) => (i === idx ? { ...item, imagen: null } : item)));
  };

  function validarProductosDetectados() {
    const errs = {};
    let hayError = false;

    productosDetectados.forEach((item, idx) => {
      const fila = {};
      const venta = Number(String(item.precio || "").replace(",", "."));
      const costo = item.precio_costo !== "" ? Number(String(item.precio_costo).replace(",", ".")) : null;
      const promo = item.precio_promo !== "" ? Number(String(item.precio_promo).replace(",", ".")) : null;

      if (!String(item.nombre || "").trim()) fila.nombre = "El nombre es obligatorio";
      if (costo !== null && (Number.isNaN(costo) || costo < 0)) fila.precio_costo = "Costo inválido";
      if (!item.precio || Number.isNaN(venta) || venta < 0) fila.precio = "Ingresá un precio válido";
      if (item.precio_promo && (Number.isNaN(promo) || promo < 0)) fila.precio_promo = "Precio promo inválido";
      if (item.stock !== "" && (Number.isNaN(Number(item.stock)) || Number(item.stock) < 0)) fila.stock = "Stock inválido";

      if ((item.tipos_precio_extra || []).some((x) => !x.id_tipo_precio_stock)) {
        fila.tipos = "Hay un tipo de precio inválido";
      }

      if (item.imagen) {
        const tipos = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
        if (!tipos.includes(item.imagen.type)) fila.imagen = "La imagen debe ser JPG, PNG, WEBP o GIF";
        if (item.imagen.size > 5 * 1024 * 1024) fila.imagen = "La imagen no puede superar los 5 MB";
      }

      if (Object.keys(fila).length > 0) {
        errs[`fila_${idx}`] = fila;
        hayError = true;
      }
    });

    if (hayError) errs.global = "Revisá los productos marcados antes de confirmar.";
    return errs;
  }

  const handleConfirmarDetectados = async () => {
    const errs = validarProductosDetectados();
    if (Object.keys(errs).length > 0) {
      setErroresDetectados(errs);
      return;
    }

    setConfirmandoDetectados(true);
    setErroresDetectados({});

    let creados = 0;
    const erroresCarga = [];

    try {
      const { idUsuarioMaster, idTenant } = getUsuarioAuditData();
      const batchSize = 3;
      const batches = [];
      for (let i = 0; i < productosDetectados.length; i += batchSize) {
        batches.push(productosDetectados.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(async (item) => {
          const globalIdx = productosDetectados.indexOf(item);
          try {
            const fd = new FormData();
            fd.append("nombre", toUpperCaseValue(String(item.nombre || "").trim()));
            fd.append("sku", toUpperCaseValue(String(item.sku || "").trim()));
            fd.append("precio_costo", moneyToApi(item.precio_costo));
            fd.append("precio", moneyToApi(item.precio));
            fd.append("margen_venta_porcentaje", moneyToApi(item.margen_venta_porcentaje));
            fd.append("margen_venta_valor", moneyToApi(item.margen_venta_valor));
            fd.append("precio_promo", moneyToApi(item.precio_promo));
            fd.append("margen_promo_porcentaje", moneyToApi(item.margen_promo_porcentaje));
            fd.append("margen_promo_valor", moneyToApi(item.margen_promo_valor));
            fd.append("stock", item.stock !== "" ? String(item.stock) : "");
            fd.append("descripcion", toUpperCaseValue(String(item.descripcion || "").trim()));
            if (item.id_categoria_stock !== "") {
              fd.append("id_categoria_stock", String(item.id_categoria_stock));
            }
            if (idUsuarioMaster > 0) fd.append("idUsuarioMaster", String(idUsuarioMaster));
            if (idTenant) fd.append("tenant_id", String(idTenant));

            const tiposPrecioPayload = (item.tipos_precio_extra || []).map((row) => ({
              id_tipo_precio_stock: Number(row.id_tipo_precio_stock) || 0,
              tipo_nombre: String(row.tipo_nombre || "").trim(),
              nombre: String(row.tipo_nombre || "").trim(),
              precio: moneyToApi(row.precio),
              margen_porcentaje: moneyToApi(row.margen_porcentaje),
              margen_valor: moneyToApi(row.margen_valor),
            }));
            fd.append("tipos_precio", JSON.stringify(tiposPrecioPayload));

            if (item.imagen) fd.append("imagen", item.imagen);

            const res = await fetch(`${API_URL}?action=stock_productos_crear`, {
              method: "POST",
              headers: buildHeadersMultipart(),
              body: fd,
            });

            await parseJsonOrThrow(res);
            return { success: true, idx: globalIdx };
          } catch (err) {
            return {
              success: false,
              idx: globalIdx,
              error: `Producto ${globalIdx + 1} (${item.nombre || "sin nombre"}): ${err.message || "Error al guardar"}`,
            };
          }
        });

        const results = await Promise.all(batchPromises);
        for (const result of results) {
          if (result.success) creados++;
          else erroresCarga.push(result.error);
        }
      }

      setResultado((prev) => ({
        ...(prev || {}),
        confirmacion_ia: {
          creados,
          errores: erroresCarga,
          productos_confirmados: productosDetectados.length,
        },
        texto_detectado: textoDetectadoOriginal,
      }));

      cerrarModalConfirmacion();
      if (creados > 0) onGuardado?.();
      if (erroresCarga.length > 0) {
        onToast?.("error", `Se cargaron ${creados} producto(s), pero hubo ${erroresCarga.length} error(es).`);
      } else {
        onImportado?.(`Se cargaron correctamente ${creados} producto(s).`);
      }
    } finally {
      setConfirmandoDetectados(false);
    }
  };

  const btnMasivoLabel = subiendo
    ? tipoArchivo === "csv"
      ? "Importando..."
      : tipoArchivo === "pdf"
      ? "Extrayendo..."
      : "Procesando..."
    : clasificando
    ? "Clasificando..."
    : tipoArchivo === "csv"
    ? "Importar productos"
    : tipoArchivo === "pdf"
    ? "Extraer y clasificar PDF"
    : tipoArchivo === "imagen"
    ? "Reconocer y clasificar"
    : "Seleccioná un archivo";

  if (!open) return null;

  return createPortal(
    <>
      <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
        <div
          className={["mi-modal__container", "cmi-container", dark ? "mi-modal--dark" : ""].join(" ").trim()}
          role="dialog"
          aria-modal="true"
          style={{ minHeight: "auto", maxHeight: "92vh" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faBoxesStacked} />
            </div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Productos</h2>
              <p className="mi-modal__subtitle">Agregá uno por uno o importá de forma masiva</p>
            </div>
            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !isLoading && onClose?.()}
              aria-label="Cerrar"
              disabled={isLoading}
              type="button"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: "1px solid var(--nv-border-md)", background: "var(--nv-bg)", flexShrink: 0 }}>
            {[
              { key: "individual", icon: faBoxOpen, label: "Individual" },
              { key: "masivo", icon: faCloudArrowUp, label: "Carga masiva" },
            ].map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  cerrarModalConfirmacion();
                }}
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "11px 16px",
                  border: "none",
                  borderBottom: tab === key ? "2px solid var(--nv-action)" : "2px solid transparent",
                  background: "none",
                  cursor: "pointer",
                  fontWeight: tab === key ? 700 : 400,
                  color: tab === key ? "var(--nv-action)" : "var(--nv-muted)",
                  fontSize: "0.88rem",
                  transition: "all .15s",
                  fontFamily: "inherit",
                }}
              >
                <FontAwesomeIcon icon={icon} style={{ fontSize: 13 }} />
                {label}
              </button>
            ))}
          </div>

          <ModalCargaIndividualProducto
            open={open}
            visible={tab === "individual"}
            categorias={categoriasLocal}
            loadingCategorias={loadingCategorias}
            tiposPrecio={tiposPrecio}
            loadingTiposPrecio={loadingTiposPrecio}
            onGuardado={onGuardado}
            onRequestClose={() => !isLoading && onClose?.()}
            onLoadingChange={setIndividualLoading}
            onCategoriaCreada={registrarCategoriaCreadaLocal}
            onTipoPrecioCreado={registrarTipoPrecioCreadoLocal}
          />

          <div style={{ display: tab === "masivo" ? "contents" : "none" }}>
            <div className="mi-modal__content" style={{ overflowY: "auto", padding: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="cmi-uploadBox">
                  <div className="cmi-uploadBox__title">
                    <FontAwesomeIcon icon={faCloudArrowUp} /> Archivo masivo
                  </div>

                  <input
                    ref={fileInputMasivoRef}
                    type="file"
                    hidden
                    accept=".csv,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif"
                    onChange={(e) => handleArchivoChange(e.target.files?.[0])}
                  />

                  <div className="cmi-uploadActions">
                    <button type="button" className="mit-btn mit-btn--ghost" onClick={() => fileInputMasivoRef.current?.click()}>
                      <FontAwesomeIcon icon={faArrowUpFromBracket} /> Seleccionar archivo
                    </button>
                    <button type="button" className="mit-btn mit-btn--ghost" onClick={descargarPlantilla}>
                      <FontAwesomeIcon icon={faDownload} /> Descargar plantilla CSV
                    </button>
                  </div>

                  {nombreArchivo && (
                    <div className="cmi-fileResume">
                      <div className="cmi-fileResume__left">
                        <span className="cmi-fileResume__icon">
                          <IconoArchivo tipo={tipoArchivo} />
                        </span>
                        <div className="cmi-fileResume__meta">
                          <div className="cmi-fileResume__name">{nombreArchivo}</div>
                          <TipoBadge tipo={tipoArchivo} />
                        </div>
                      </div>

                      <div className="cmi-fileActions">
                        <button type="button" className="mit-btn mit-btn--ghost" onClick={() => abrirPreviewLocal({ file: archivo, title: "Archivo masivo" })}>
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                        <button
                          type="button"
                          className="mit-btn mit-btn--ghost"
                          onClick={() => {
                            setArchivo(null);
                            setResultado(null);
                            setTextoDetectadoOriginal("");
                            cerrarModalConfirmacion();
                            if (fileInputMasivoRef.current) fileInputMasivoRef.current.value = "";
                          }}
                        >
                          <FontAwesomeIcon icon={faTrashCan} /> Quitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {resultado && tipoArchivo === "csv" && (
                  <div className="cmi-okBox">
                    <div className="cmi-okBox__title">
                      <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: 8 }} /> Resultado de importación
                    </div>
                    <div className="cmi-resultGrid">
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">Creados</span>
                        <b className="cmi-resultItem__val cmi-resultItem__val--ok">{resultado.creados ?? 0}</b>
                      </div>
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">Actualizados</span>
                        <b className="cmi-resultItem__val">{resultado.actualizados ?? 0}</b>
                      </div>
                    </div>
                  </div>
                )}

                {resultado && tipoArchivo !== "csv" && (
                  <div className="cmi-okBox">
                    <div className="cmi-okBox__title">
                      <FontAwesomeIcon icon={faCheckCircle} style={{ marginRight: 8 }} /> Resultado del procesamiento
                    </div>

                    <div className="cmi-resultGrid">
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">Método</span>
                        <b className="cmi-resultItem__val">{getMetodoLabel(resultado.metodo)}</b>
                      </div>
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">Páginas</span>
                        <b className="cmi-resultItem__val">{resultado.total_paginas ?? 1}</b>
                      </div>
                      <div className="cmi-resultItem">
                        <span className="cmi-resultItem__label">Caracteres</span>
                        <b className="cmi-resultItem__val cmi-resultItem__val--ok">{resultado.total_caracteres ?? 0}</b>
                      </div>
                    </div>

                    {resultado?.confirmacion_ia && (
                      <div className="cmi-resultGrid" style={{ marginTop: 12 }}>
                        <div className="cmi-resultItem">
                          <span className="cmi-resultItem__label">Confirmados</span>
                          <b className="cmi-resultItem__val">{resultado.confirmacion_ia.productos_confirmados ?? 0}</b>
                        </div>
                        <div className="cmi-resultItem">
                          <span className="cmi-resultItem__label">Cargados</span>
                          <b className="cmi-resultItem__val cmi-resultItem__val--ok">{resultado.confirmacion_ia.creados ?? 0}</b>
                        </div>
                        <div className="cmi-resultItem">
                          <span className="cmi-resultItem__label">Errores</span>
                          <b className="cmi-resultItem__val">{resultado.confirmacion_ia.errores?.length ?? 0}</b>
                        </div>
                      </div>
                    )}

                    {productosDetectados.length > 0 && (
                      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button type="button" className="mit-btn mit-btn--ghost" onClick={() => setModalConfirmOpen(true)}>
                          <FontAwesomeIcon icon={faImage} /> Cargar imágenes / revisar productos detectados
                        </button>
                      </div>
                    )}

                    {resultado.texto_detectado && (
                      <div className="fl-field" style={{ marginTop: 12 }}>
                        <textarea readOnly value={resultado.texto_detectado} className="fl-input cmi-textarea" placeholder=" " />
                        <label className="fl-label">Texto extraído</label>
                      </div>
                    )}
                  </div>
                )}

                {resultado && Array.isArray(resultado.errores) && resultado.errores.length > 0 && (
                  <div className="cmi-warnBox">
                    <div className="cmi-warnBox__title">
                      <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: 8 }} /> Observaciones
                    </div>
                    <ul className="cmi-warnBox__list">
                      {resultado.errores.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {resultado?.confirmacion_ia?.errores?.length > 0 && (
                  <div className="cmi-warnBox">
                    <div className="cmi-warnBox__title">
                      <FontAwesomeIcon icon={faTriangleExclamation} style={{ marginRight: 8 }} /> Errores al cargar productos
                    </div>
                    <ul className="cmi-warnBox__list">
                      {resultado.confirmacion_ia.errores.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="cmi-footer">
              <div className="mi-card__hint cmi-footer__hint">
                {tipoArchivo === "csv" && "El CSV se procesará fila a fila actualizando o creando productos."}
                {tipoArchivo === "pdf" && "Se extraerá el texto, se clasificarán los productos y luego vas a poder confirmarlos."}
                {tipoArchivo === "imagen" && "Se aplicará OCR, se clasificarán los productos y luego vas a poder confirmarlos."}
                {tipoArchivo === "" && !nombreArchivo && "Seleccioná un archivo para continuar."}
                {tipoArchivo === "" && nombreArchivo && "El formato no es válido."}
              </div>
              <div className="cmi-footer__btns">
                <button type="button" className="mit-btn mit-btn--ghost" onClick={() => !isLoading && onClose?.()} disabled={isLoading}>
                  Cancelar
                </button>
                <button type="button" className="mit-btn mit-btn--solid" onClick={handleImportar} disabled={subiendo || clasificando || !tipoArchivo} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <FontAwesomeIcon icon={faCloudArrowUp} /> {btnMasivoLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ModalVerComprobante open={previewOpen} url={previewUrl} mime={previewMime} fileName={previewFileName} title={previewTitle} onClose={cerrarPreview} />

      <ModalConfirmarProductosIA
        open={modalConfirmOpen}
        dark={dark}
        productos={productosDetectados}
        categorias={categoriasLocal}
        tiposPrecio={tiposPrecio}
        loadingCategorias={loadingCategorias}
        loadingTiposPrecio={loadingTiposPrecio}
        onClose={() => !confirmandoDetectados && cerrarModalConfirmacion()}
        onChangeProducto={handleProductoDetectadoChange}
        onPricingBlur={handlePricingBlurDetectado}
        onRecalcByCost={handleRecalcByCostDetectado}
        onAddFila={handleAddFilaDetectada}
        onRemoveFila={handleRemoveFilaDetectada}
        onTakeImage={handleImagenProductoDetectado}
        onRemoveImage={handleQuitarImagenProductoDetectado}
        onPreviewImage={(file) => abrirPreviewLocal({ file, title: "Imagen del producto detectado" })}
        onConfirm={handleConfirmarDetectados}
        confirmando={confirmandoDetectados}
        errores={erroresDetectados}
        onCategoriaCreate={crearCategoriaRapida}
        onTipoCreate={crearTipoPrecioRapido}
      />
    </>,
    document.body
  );
}