import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FaXmark, FaCircleInfo, FaBuildingColumns } from "react-icons/fa6";

function formatFecha(fecha) {
  const s = String(fecha || "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function moneyARS(valor) {
  const n = Number(valor || 0);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s !== "" ? s : "-";
}

export default function ModalDepositarCheque({
  open,
  onClose,
  onConfirm,
  loading = false,
  cheque = null,
  titulo = "Depositar en el banco",
  pregunta = "¿Querés depositar este registro?",
  tipoLabel = "Cheque",
  confirmText = "Depositar",
  loadingText = "Depositando...",
  infoText = "Al presionar Depositar, este registro se dará de baja de Cartera y se generará automáticamente un movimiento en Otros Egresos, para que la salida de fondos quede correctamente reflejada en el sistema.",
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !loading) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleModalMouseDown = (e) => {
    e.stopPropagation();
  };

  return createPortal(
    <div className="mi-mini__overlay" role="presentation">
      <div
        className="mi-mini__modal"
        onMouseDown={handleModalMouseDown}
        style={{ width: "min(560px, 94vw)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-depositar-cheque-title"
      >
        <div className="mi-mini__head">
          <h4
            id="modal-depositar-cheque-title"
            className="mi-mini__title"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: 0,
            }}
          >
            <FaBuildingColumns />
            <span>{titulo}</span>
          </h4>

          <button
            type="button"
            className="mi-mini__close"
            onClick={() => (!loading ? onClose?.() : null)}
            disabled={loading}
            aria-label="Cerrar"
          >
            <FaXmark />
          </button>
        </div>

        <div className="mi-mini__body">
          <p
            style={{
              margin: "0 0 14px",
              fontSize: "14px",
              color: "var(--mi-muted)",
              fontWeight: 400,
            }}
          >
            {pregunta}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div className="fl-field">
              <input
                className="fl-input"
                type="text"
                readOnly
                value={safeText(cheque?.emisor)}
                placeholder=" "
              />
              <label className="fl-label">Emisor</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                type="text"
                readOnly
                value={safeText(cheque?.numero_cheque)}
                placeholder=" "
              />
              <label className="fl-label">N° de {tipoLabel.toLowerCase()}</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                type="text"
                readOnly
                value={formatFecha(cheque?.fecha_emision)}
                placeholder=" "
              />
              <label className="fl-label">Fecha de emisión</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                type="text"
                readOnly
                value={formatFecha(cheque?.fecha_pago)}
                placeholder=" "
              />
              <label className="fl-label">Fecha de pago</label>
            </div>

            <div className="fl-field" style={{ gridColumn: "1 / -1" }}>
              <input
                className="fl-input"
                type="text"
                readOnly
                value={moneyARS(cheque?.importe)}
                placeholder=" "
                style={{
                  fontWeight: 700,
                  color: "var(--nv-tot-color, #057A55)",
                }}
              />
              <label className="fl-label">Importe</label>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              background:
                "linear-gradient(135deg, rgba(245,158,11,.08) 0%, rgba(245,158,11,.12) 100%)",
              borderLeft: "3px solid #f59e0b",
              fontSize: 13,
              color: "#92400e",
              marginBottom: 4,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              lineHeight: 1.45,
            }}
          >
            <FaCircleInfo style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              <span style={{ fontWeight: 600 }}>Información:</span> {infoText}
            </span>
          </div>

          <div className="mi-mini__actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={() => (!loading ? onClose?.() : null)}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? loadingText : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}