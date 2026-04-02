import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyCheckDollar,
  faReceipt,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";

  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${String(Number(m[3])).padStart(2, "0")}/${String(
      Number(m[2])
    ).padStart(2, "0")}/${m[1]}`;
  }

  return s;
}

function getDetalleList(row) {
  if (Array.isArray(row?.medios_pago_detalle)) return row.medios_pago_detalle;

  if (typeof row?.medios_pago_detalle === "string") {
    try {
      const parsed = JSON.parse(row.medios_pago_detalle);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function DetailRow({ label, value }) {
  return (
    <div className="mi-detalle-row">
      <span className="mi-detalle-label">{label}</span>
      <span className="mi-detalle-value">{value}</span>
    </div>
  );
}

export default function ModalDetalleMediosPagoCompra({
  open,
  row,
  onClose,
}) {
  const detalle = getDetalleList(row);
  const total = detalle.reduce((acc, item) => acc + Number(item?.monto || 0), 0);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="mi-modal__overlay" onMouseDown={onClose}>
      <div
        className="mi-modal__container "
        style={{ maxWidth: 860 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faMoneyCheckDollar} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Detalle de medios de pago</h2>
            <div className="mi-modal__subtitle">
              Compra #{safeText(row?.id_movimiento)} · {safeText(row?.proveedor)}
            </div>
          </div>

          <button
            type="button"
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mi-modal__content">
          {detalle.length === 0 ? (
            <div className="mi-card mi-card--full">
              <div className="mi-card__title">Sin medios registrados</div>
              <div className="mi-card__hint">
                Esta compra no tiene detalle de medios de pago guardado.
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  marginBottom: 16,
                  overflow: "auto",
                }}
              >
                {detalle.map((item) => {
                  const esCheque = !!item?.id_cheque;

                  return (
                    <div
                      key={
                        item?.id_compra_medio_pago ||
                        `${item?.id_medio_pago}-${item?.id_cheque || "x"}`
                      }
                      className="mi-card mi-card--full"
                      style={{
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <div
                      >
                        <div>
                          <div className="mi-detalle-title"><div>
                                                        <FontAwesomeIcon icon={faReceipt} />
                            <span>{safeText(item?.medio_pago_nombre)}</span>
                          </div>

                          <div  className="mi-detalle-monto">
                          {moneyARS(item?.monto || 0)}
                          </div>
                          </div>
                          

                          <div
                            style={{
                              display: "grid",
                              gap: 7,
                            }}
                          >
                            <DetailRow
                              label="Monto"
                              value={moneyARS(item?.monto || 0)}
                            />

                            {esCheque && (
                              <div className="mi-detalle-block">
                                <div
                                  style={{
                                    display: "grid",
                                    gap: 7,
                                    marginTop: 4,
                                  }}
                                >
                                  <DetailRow
                                    label="Tipo"
                                    value={safeText(item?.cheque_tipo || "Cheque")}
                                  />
                                  <DetailRow
                                    label="ID cheque"
                                    value={safeText(item?.id_cheque)}
                                  />
                                  <DetailRow
                                    label="Número"
                                    value={safeText(item?.numero_cheque)}
                                  />
                                  <DetailRow
                                    label="Emisor"
                                    value={safeText(item?.emisor)}
                                  />
                                  <DetailRow
                                    label="Fecha emisión"
                                    value={formatFechaDMY(item?.fecha_emision)}
                                  />
                                  <DetailRow
                                    label="Fecha pago"
                                    value={formatFechaDMY(item?.fecha_pago)}
                                  />
                                  <DetailRow
                                    label="Importe cheque"
                                    value={moneyARS(item?.cheque_importe || 0)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>


                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="mi-card mi-card--full"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span className="mi-detalle-title">Total medios</span>
                <span className="mi-detalle-monto">{moneyARS(total)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}