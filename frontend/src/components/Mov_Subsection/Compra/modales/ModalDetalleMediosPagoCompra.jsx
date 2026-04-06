import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyCheckDollar,
  faXmark,
  faCreditCard,
  faMoneyBill,
} from "@fortawesome/free-solid-svg-icons";

// ── Helpers ──
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
    return `$${n.toFixed(2)}`;
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
  if (m)
    return `${String(Number(m[3])).padStart(2, "0")}/${String(
      Number(m[2])
    ).padStart(2, "0")}/${m[1]}`;
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

function normalizeTipo(nombre) {
  const s = String(nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq"))
    return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}

// ============================================================
// TARJETA DE CHEQUE — mismo diseño que ChequeCard
// ============================================================
function ChequeDetalle({ item }) {
  const tipoCheque = normalizeTipo(item?.cheque_tipo || item?.medio_pago_nombre || "");
  const isEcheq = tipoCheque === "echeq";

  return (
    <div className={["cheque-card", isEcheq ? "cheque-card--echeq" : ""].filter(Boolean).join(" ")}>
      {/* ── HEADER ── */}
      <div className="cheque-card__header">
        <div className="cheque-card__header-dots" aria-hidden="true" />

        <div className="cheque-card__brand">
          <div className="cheque-card__logo-icon">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 13 }} />
          </div>
          <div>
            <div className="cheque-card__bank-name">
              {safeText(item?.medio_pago_nombre)}
            </div>
            <div className="cheque-card__bank-sub">
              {isEcheq ? "E-CHEQ ELECTRÓNICO" : "CHEQUE DE PAGO DIFERIDO"}
            </div>
          </div>
        </div>

        <div className="cheque-card__header-right">
          <span className="cheque-card__num-label">N°</span>
          <span className="cheque-card__num-value">
            {safeText(item?.numero_cheque)}
          </span>
        </div>

        <div className="cheque-card__slash" aria-hidden="true" />
      </div>

      {/* ── BODY ── */}
      <div className="cheque-card__body">
        {/* Fila 1: Emisor + Fecha emisión */}
        <div className="cheque-card__row cheque-card__row--spaced">
          <div className="cheque-card__field cheque-card__field--wide">
            <span className="cheque-card__field-label">Emisor</span>
            <div className="cheque-card__field-line">
              {safeText(item?.emisor)}
            </div>
          </div>
          <div className="cheque-card__field">
            <span className="cheque-card__field-label">F. emisión</span>
            <div className="cheque-card__field-line cheque-card__field-line--mono">
              {formatFechaDMY(item?.fecha_emision)}
            </div>
          </div>
        </div>

        {/* Fila 2: ID cheque + Importe */}
        <div className="cheque-card__row cheque-card__row--spaced">
          <div className="cheque-card__field cheque-card__field--wide">
            <span className="cheque-card__field-label">ID cheque</span>
            <div className="cheque-card__field-line cheque-card__field-line--mono">
              {safeText(item?.id_cheque)}
            </div>
          </div>
          <div className="cheque-card__importe-box">
            <span className="cheque-card__importe-symbol">$</span>
            <span className="cheque-card__importe-value">
              {moneyARS(item?.cheque_importe || item?.monto || 0)}
            </span>
          </div>
        </div>

        {/* Fila 3: Fecha pago + Tipo */}
        <div className="cheque-card__row cheque-card__row--spaced">
          <div className="cheque-card__field">
            <span className="cheque-card__field-label">F. pago</span>
            <div className="cheque-card__field-line cheque-card__field-line--mono">
              {formatFechaDMY(item?.fecha_pago)}
            </div>
          </div>
          <div className="cheque-card__field cheque-card__field--firma">
            <span className="cheque-card__field-label">Tipo</span>
            <div className="cheque-card__firma-line">
              <span className="cheque-card__firmante">
                {safeText(item?.cheque_tipo || (isEcheq ? "eCheq" : "Cheque"))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MICR ── */}
      <div className="cheque-card__micr">
        <div className="cheque-card__micr-accent" aria-hidden="true" />
        <span className="cheque-card__micr-text">
        </span>
        <div className="cheque-card__security">
          <svg width="11" height="13" viewBox="0 0 12 14" fill="none">
            <rect x="1" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="6" cy="9" r="1.2" fill="currentColor" />
          </svg>
          <span>Seguridad</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TARJETA DE MEDIO NO-CHEQUE
// ============================================================
function MedioGenericoDetalle({ item }) {
  return (
    <div className="mdp-medio-card">
      <div className="mdp-medio-card__icon">
        <FontAwesomeIcon icon={faCreditCard} />
      </div>
      <div className="mdp-medio-card__info">
        <span className="mdp-medio-card__nombre">
          {safeText(item?.medio_pago_nombre)}
        </span>
        <span className="mdp-medio-card__sub">Medio de pago</span>
      </div>
      <div className="mdp-medio-card__monto">
        {moneyARS(item?.monto || 0)}
      </div>
    </div>
  );
}

// ============================================================
// MODAL PRINCIPAL
// ============================================================
export default function ModalDetalleMediosPagoCompra({ open, row, onClose }) {
  const detalle = getDetalleList(row);
  const total = detalle.reduce((acc, item) => acc + Number(item?.monto || 0), 0);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="mi-modal__overlay"
      onMouseDown={onClose}
    >
      <div
        className="mi-modal__container mdp-container"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faMoneyCheckDollar} />
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Detalle de medios de pago</h2>
            <div className="mi-modal__subtitle" style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>
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

        {/* ── CONTENT ── */}
        <div className="mi-modal__content mdp-content">
          {detalle.length === 0 ? (
            <div className="mdp-empty">
              <FontAwesomeIcon icon={faMoneyBill} style={{ fontSize: 28, opacity: 0.3 }} />
              <span>Esta compra no tiene detalle de medios de pago guardado.</span>
            </div>
          ) : (
            <>
              <div className="mdp-items-grid">
                {detalle.map((item) => {
                  const esCheque = !!item?.id_cheque;
                  const key =
                    item?.id_compra_medio_pago ||
                    `${item?.id_medio_pago}-${item?.id_cheque || "x"}`;

                  return esCheque ? (
                    <ChequeDetalle key={key} item={item} />
                  ) : (
                    <MedioGenericoDetalle key={key} item={item} />
                  );
                })}
              </div>

              {/* ── TOTAL ── */}
              <div className="mdp-total-bar">
                <span className="mdp-total-bar__label">Total medios</span>
                <span className="mdp-total-bar__value">{moneyARS(total)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}