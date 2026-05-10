import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import "../Global_css/Global_Modals.css";
import "../Global_css/Global_responsive.css";
import "../Global_css/roots.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInfoCircle,
  faXmark,
  faShoppingCart,
  faCreditCard,
  faBoxOpen,
} from "@fortawesome/free-solid-svg-icons";

function moneyARS(value) {
  const n = Number(value || 0);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(value) {
  const s = String(value ?? "").trim();
  return s ? s : "—";
}

function formatFechaDMY(value) {
  const s = String(value ?? "").trim();
  if (!s) return "—";

  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  }

  return s;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getItemName(item) {
  return safeText(
    item?.producto_nombre ||
      item?.stock_producto_nombre ||
      item?.detalle_nombre ||
      item?.nombre ||
      item?.descripcion ||
      item?.detalle
  );
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";

  return n.toLocaleString("es-AR", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function InfoPill({ label, value, strong = false }) {
  return (
    <div className="mdm-info-pill">
      <span className="mdm-info-pill__label">{label}</span>
      <span className={["mdm-info-pill__value", strong ? "is-strong" : ""].join(" ")}>
        {safeText(value)}
      </span>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="mdm-section-title">
      <div className="mdm-section-title__icon">
        <FontAwesomeIcon icon={icon} />
      </div>
      <div>
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function getTercero(row) {
  const proveedor = String(row?.proveedor || row?.nombre_proveedor || row?.razon_social_proveedor || "").trim();
  if (proveedor) return { label: "Proveedor", value: proveedor };

  const cliente = String(row?.cliente || row?.nombre_cliente || row?.razon_social_cliente || "").trim();
  if (cliente) return { label: "Cliente", value: cliente };

  const tercero = String(row?.tercero || row?.emisor || row?.cheque_emisor || "").trim();
  if (tercero) return { label: "Tercero", value: tercero };

  return { label: "Cliente / proveedor", value: "—" };
}

function getEstado(row) {
  if (row?.pagado === true) return "Pagado";
  if (row?.pagado === false) return "Pendiente";
  if (row?.estado) return row.estado;
  return "";
}

export default function ModalDetalleMovimiento({
  open,
  row,
  onClose,
  title = "Detalle del movimiento",
  hideTerceroYTipo = false,
  hideMediosPago = false,
}) {
  const items = useMemo(() => {
    const arr = toArray(row?.items_detalle || row?.items);
    if (arr.length) return arr;
    if (!row) return [];

    const tieneItemLegacy =
      row?.detalle ||
      row?.descripcion ||
      row?.concepto ||
      row?.cantidad != null ||
      row?.precio != null ||
      row?.total != null;

    if (!tieneItemLegacy) return [];

    return [
      {
        id_item: row?.id_item,
        producto_nombre: row?.detalle || row?.descripcion || row?.concepto,
        cantidad: row?.cantidad ?? 1,
        precio: row?.precio ?? row?.monto_total ?? row?.total ?? 0,
        iva_pct: row?.iva_pct ?? 0,
        subtotal: row?.subtotal ?? row?.monto_total ?? row?.total ?? 0,
        iva_monto: row?.iva_monto ?? 0,
        total: row?.total ?? row?.monto_total ?? 0,
      },
    ];
  }, [row]);

  const medios = useMemo(() => {
    const arr = toArray(row?.medios_pago_detalle);
    if (arr.length) return arr;

    const nombre = String(row?.medio_pago_nombre || row?.medio_pago || "").trim();
    const esCuentaCorriente = nombre.toUpperCase() === "CUENTA CORRIENTE";
    if (!nombre || nombre === "—" || nombre === "-" || esCuentaCorriente) return [];

    return [
      {
        id_medio_pago: row?.id_medio_pago,
        medio_pago_nombre: nombre,
        monto: row?.monto_total ?? row?.total ?? 0,
      },
    ];
  }, [row]);

  const resumenItems = useMemo(
    () =>
      items.reduce(
        (acc, item) => ({
          subtotal: acc.subtotal + Number(item?.subtotal || 0),
          iva: acc.iva + Number(item?.iva_monto || 0),
          total: acc.total + Number(item?.total || 0),
        }),
        { subtotal: 0, iva: 0, total: 0 }
      ),
    [items]
  );

  const totalItems = resumenItems.total;

  const totalMedios = useMemo(
    () => medios.reduce((acc, item) => acc + Number(item?.monto || 0), 0),
    [medios]
  );

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const totalMovimiento = Number(
    row?.monto_total_movimiento ?? row?.monto_total ?? row?.total ?? row?.total_general ?? totalItems ?? 0
  );

  const descripcion =
    row?.detalle_original ||
    row?.descripcion_original ||
    row?.concepto_original ||
    row?.detalle ||
    row?.descripcion ||
    row?.concepto ||
    "Detalle de productos y medios de pago";

  const tercero = getTercero(row);
  const estado = getEstado(row);

  return createPortal(
    <div className="mi-modal__overlay" role="presentation">
      <div
        className="mi-modal__container mi-modal__container--mov mdm-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header mdm-header">
          <div className="mi-modal__head-icon mdm-header__icon" aria-hidden="true">
            <FontAwesomeIcon icon={faInfoCircle} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">{title}</h2>
            <div className="mi-modal__subtitle mdm-subtitle">{safeText(descripcion)}</div>
          </div>

          <button type="button" className="mi-modal__close" onClick={onClose} aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mi-modal__content mdm-content">
          <aside className="mdm-summary-card">
            <InfoPill label="Fecha" value={formatFechaDMY(row?.fecha)} />

            {!hideTerceroYTipo ? (
              <InfoPill label={tercero.label} value={tercero.value} strong />
            ) : null}

            {!hideTerceroYTipo ? (
              <InfoPill
                label="Tipo"
                value={
                  row?.tipo_venta ||
                  row?.pago_tipo_venta ||
                  row?.tipo_operacion ||
                  row?.tipo_operacion_nombre
                }
              />
            ) : null}

            {estado ? <InfoPill label="Estado" value={estado} /> : null}
          </aside>

          <section className="mdm-section mdm-section--items">
            <SectionTitle icon={faShoppingCart} title="Productos / detalle" />

            {items.length === 0 ? (
              <div className="mdm-empty">
                <FontAwesomeIcon icon={faBoxOpen} />
                <span>Este movimiento no tiene productos o detalles cargados.</span>
              </div>
            ) : (
              <div className="mdm-table-wrap">
                <div className="mdm-table mdm-table--items">
                  <div className="mdm-table__row mdm-table__row--head">
                    <span>Producto / detalle</span>
                    <span>Cant.</span>
                    <span>Precio</span>
                    <span>IVA %</span>
                    <span>IVA</span>
                    <span>Total</span>
                  </div>

                  {items.map((item, index) => (
                    <div
                      className="mdm-table__row"
                      key={item?.id_item || `${getItemName(item)}-${index}`}
                    >
                      <span className="mdm-product-cell" title={getItemName(item)}>
                        <span className="mdm-product-name">{getItemName(item)}</span>
                      </span>
                      <span>{formatNumber(item?.cantidad)}</span>
                      <span>{moneyARS(item?.precio)}</span>
                      <span>{formatNumber(item?.iva_pct)}%</span>
                      <span>{moneyARS(item?.iva_monto)}</span>
                      <span className="is-strong">{moneyARS(item?.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {items.length > 0 ? (
              <div className="mi-cr-table__foot mdm-table__foot">
                <div className="mi-cr-foot-actions mdm-foot-actions" />
                <div className="mi-cr-totals mdm-foot-totals">
                  <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                    <span>Subtotal</span>
                    <b>{moneyARS(resumenItems.subtotal)}</b>
                  </div>
                  <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                    <span>IVA</span>
                    <b>{moneyARS(resumenItems.iva)}</b>
                  </div>
                  <div className="mi-cr-totalLine mi-cr-totalLine--total">
                    <span>Total</span>
                    <b>{moneyARS(totalItems || totalMovimiento)}</b>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {!hideMediosPago ? (
            <section className="mdm-section mdm-section--medios">
              <SectionTitle icon={faCreditCard} title="Medios de pago" />

              {medios.length === 0 ? (
                <div className="mdm-empty">
                  <FontAwesomeIcon icon={faCreditCard} />
                  <span>No hay medios de pago cargados para este movimiento.</span>
                </div>
              ) : (
                <div className="mdm-medios-grid">
                  {medios.map((medio, index) => (
                    <div
                      className="mdm-medio-card"
                      key={
                        medio?.id_movimiento_medio_pago ||
                        medio?.id_compra_medio_pago ||
                        `${medio?.id_medio_pago}-${index}`
                      }
                    >
                      <div className="mdm-medio-card__main">
                        <span className="mdm-medio-card__name">
                          {safeText(medio?.medio_pago_nombre || medio?.medio_pago || medio?.nombre)}
                        </span>

                        <span className="mdm-medio-card__meta" style={{justifyContent:"space-between"}}>
                          <span className="mdm-medio-card__sub">
                            {medio?.id_cheque
                              ? `${safeText(medio?.cheque_tipo)} · cheque #${safeText(
                                  medio?.numero_cheque || medio?.id_cheque
                                )}`
                              : "Pago registrado"}
                          </span>
                          <span className="mdm-medio-card__amount">{moneyARS(medio?.monto)}</span>
                        </span>
                      </div>

                      {medio?.id_cheque ? (
                        <div className="mdm-cheque-extra">
                          <span>Emisor: {safeText(medio?.emisor)}</span>
                          <span>F. emisión: {formatFechaDMY(medio?.fecha_emision)}</span>
                          <span>F. pago: {formatFechaDMY(medio?.fecha_pago)}</span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {medios.length > 0 ? (
                <div className="mdm-total-line mdm-total-line--chip">
                  <div className="mi-cr-totals mdm-total-paid-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--total mdm-total-paid-chip">
                      <span>Total pagado</span>
                      <b>{moneyARS(totalMedios || totalMovimiento)}</b>
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModalDetalleMovimientoVenta(props) {
  return <ModalDetalleMovimiento {...props} title={props.title || "Detalle de venta"} />;
}

export function ModalDetalleMovimientoCompra(props) {
  return <ModalDetalleMovimiento {...props} title={props.title || "Detalle de compra"} />;
}

export function ModalDetalleMovimientoIngreso(props) {
  return (
    <ModalDetalleMovimiento
      {...props}
      hideTerceroYTipo
      title={props.title || "Detalle de ingreso"}
    />
  );
}

export function ModalDetalleMovimientoEgreso(props) {
  return (
    <ModalDetalleMovimiento
      {...props}
      hideTerceroYTipo
      title={props.title || "Detalle de egreso"}
    />
  );
}