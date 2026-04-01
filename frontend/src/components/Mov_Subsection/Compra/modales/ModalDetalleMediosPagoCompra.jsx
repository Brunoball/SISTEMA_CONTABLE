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
    return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
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

export default function ModalDetalleMediosPagoCompra({ open, row, onClose }) {
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
        className="mi-modal__container mi-modal__container--mov"
        style={{ maxWidth: 860 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faMoneyCheckDollar} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Detalle de medios de pago</h2>
            <div className="mi-modal__subtitle" style={{ fontSize: 13, opacity: 0.85 }}>
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
                }}
              >
                {detalle.map((item) => {
                  const esCheque = !!item?.id_cheque;

                  return (
                    <div
                      key={item?.id_compra_medio_pago || `${item?.id_medio_pago}-${item?.id_cheque || "x"}`}
                      className="mi-card mi-card--full"
                      style={{
                        border: "1px solid rgba(0,0,0,.08)",
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontWeight: 700,
                              fontSize: 15,
                              marginBottom: 8,
                            }}
                          >
                            <FontAwesomeIcon icon={faReceipt} />
                            {safeText(item?.medio_pago_nombre)}
                          </div>

                          <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                            <div>
                              <b>Monto:</b> {moneyARS(item?.monto || 0)}
                            </div>

                            {esCheque && (
                              <>
                                <div>
                                  <b>Tipo:</b> {safeText(item?.cheque_tipo || "Cheque")}
                                </div>
                                <div>
                                  <b>ID cheque:</b> {safeText(item?.id_cheque)}
                                </div>
                                <div>
                                  <b>Número:</b> {safeText(item?.numero_cheque)}
                                </div>
                                <div>
                                  <b>Emisor:</b> {safeText(item?.emisor)}
                                </div>
                                <div>
                                  <b>Fecha emisión:</b> {formatFechaDMY(item?.fecha_emision)}
                                </div>
                                <div>
                                  <b>Fecha pago:</b> {formatFechaDMY(item?.fecha_pago)}
                                </div>
                                <div>
                                  <b>Importe cheque:</b> {moneyARS(item?.cheque_importe || 0)}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 18,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {moneyARS(item?.monto || 0)}
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
                  fontWeight: 800,
                  fontSize: 16,
                }}
              >
                <span>Total medios</span>
                <span>{moneyARS(total)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}