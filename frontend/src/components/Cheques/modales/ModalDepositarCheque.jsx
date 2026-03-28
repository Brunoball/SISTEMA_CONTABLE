import React from "react";
import { createPortal } from "react-dom";
import "../../Global/Global_css/Global_Modals.css";
import "../../Global/Global_css/Global_responsive.css";

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
  infoText = "Por ahora, al presionar Depositar, el registro solamente se dará de baja de cartera.",
}) {
  if (!open) return null;

  return createPortal(
    <div
      className="global-modal-overlay"
      onClick={loading ? undefined : onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <div
        className="global-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "560px",
          width: "95%",
          backgroundColor: "#fff",
          borderRadius: "16px",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
        }}
      >
        <div
          className="global-modal-header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
              color: "#111827",
            }}
          >
            {titulo}
          </h3>

          <button
            type="button"
            className="global-modal-close"
            onClick={onClose}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              fontSize: "28px",
              cursor: loading ? "not-allowed" : "pointer",
              color: "#6b7280",
              padding: "0 8px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div className="global-modal-body" style={{ padding: "24px" }}>
          <p
            style={{
              marginTop: 0,
              marginBottom: "16px",
              fontSize: "14px",
              color: "#374151",
            }}
          >
            {pregunta}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "16px",
              backgroundColor: "#f9fafb",
              padding: "16px",
              borderRadius: "12px",
            }}
          >
            <div>
              <strong
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Emisor:
              </strong>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#111827",
                  wordBreak: "break-word",
                }}
              >
                {safeText(cheque?.emisor)}
              </div>
            </div>

            <div>
              <strong
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                N° de {tipoLabel.toLowerCase()}:
              </strong>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                {safeText(cheque?.numero_cheque)}
              </div>
            </div>

            <div>
              <strong
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Fecha de emisión:
              </strong>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                {formatFecha(cheque?.fecha_emision)}
              </div>
            </div>

            <div>
              <strong
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Fecha de pago:
              </strong>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                {formatFecha(cheque?.fecha_pago)}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <strong
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Importe:
              </strong>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#059669" }}>
                {moneyARS(cheque?.importe)}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: "8px",
              padding: "12px 16px",
              borderRadius: "10px",
              background:
                "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.12) 100%)",
              borderLeft: "3px solid #f59e0b",
              fontSize: "13px",
              color: "#92400e",
            }}
          >
            <span style={{ fontWeight: 600 }}>ℹ️ Información:</span> {infoText}
          </div>
        </div>

        <div
          className="global-modal-footer"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            padding: "16px 24px",
            borderTop: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <button
            type="button"
            className="mov-btn mov-btn--ghost"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              backgroundColor: "transparent",
              border: "1px solid #d1d5db",
              color: "#374151",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="mov-btn"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "8px 24px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 500,
              backgroundColor: loading ? "#9ca3af" : "#059669",
              border: "none",
              color: "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? loadingText : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}