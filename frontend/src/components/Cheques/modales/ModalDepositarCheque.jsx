import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaXmark, FaCircleInfo, FaBuildingColumns } from "react-icons/fa6";

function formatFecha(fecha) {
  const s = String(fecha || "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function toISODate(fecha) {
  const s = String(fecha || "").trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = String(iso[1]).padStart(4, "0");
    const m = String(iso[2]).padStart(2, "0");
    const d = String(iso[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const visual = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (visual) {
    const d = String(visual[1]).padStart(2, "0");
    const m = String(visual[2]).padStart(2, "0");
    const y = String(visual[3]).padStart(4, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
}

function todayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isValidISODate(fecha) {
  const s = String(fecha || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
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
  const [fechaDeposito, setFechaDeposito] = useState("");
  const [fechaError, setFechaError] = useState("");

  useEffect(() => {
    if (!open) return;

    const inicial =
      toISODate(cheque?.fecha_deposito) ||
      toISODate(cheque?.fechaDeposito) ||
      todayLocalISO();

    setFechaDeposito(inicial);
    setFechaError("");
  }, [open, cheque?.fecha_deposito, cheque?.fechaDeposito]);

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

            <div className="fl-field" style={{ gridColumn: "1 / -1" }}>
              <input
                className="fl-input"
                type="date"
                value={fechaDeposito}
                onChange={(e) => {
                  setFechaDeposito(e.target.value);
                  setFechaError("");
                }}
                disabled={loading}
                placeholder=" "
                required
              />
              <label className="fl-label">Fecha de depósito</label>
              {fechaError && (
                <small
                  style={{
                    display: "block",
                    marginTop: 6,
                    color: "#b91c1c",
                    fontWeight: 700,
                  }}
                >
                  {fechaError}
                </small>
              )}
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
              onClick={() => {
                const fecha = toISODate(fechaDeposito);
                if (!isValidISODate(fecha)) {
                  setFechaError("Seleccioná una fecha de depósito válida.");
                  return;
                }

                onConfirm?.(fecha);
              }}
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