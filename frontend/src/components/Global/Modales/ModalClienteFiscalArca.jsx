import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import "../Global_css/Global_Modals.css";
import "../Global_css/roots.css";
import "./ModalClienteFiscalArca.css";

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function safeText(value) {
  const text = String(value ?? "").trim();
  return text || "—";
}

/**
 * Modal global para consultar CUIT en ARCA y confirmar datos fiscales.
 *
 * Se puede reutilizar en Ventas, Compras, Recibos, Clientes, Facturación, etc.
 * La lógica de consulta/guardado queda afuera para que cada sección decida qué endpoint usar.
 */
export default function ModalClienteFiscalArca({
  open,
  dark = false,
  title = "Datos fiscales del cliente",
  infoTitle = "Consulta por CUIT",
  description = null,
  cuit = "",
  fiscalData = null,
  error = "",
  loading = false,
  saving = false,
  lookupText = "Consultar ARCA",
  searchingText = "Consultando ARCA...",
  confirmText = "Confirmar",
  footerHelp = "",
  requireFiscalData = false,
  onCuitChange,
  onLookup,
  onClose,
  onConfirm,
}) {
  const inputRef = useRef(null);
  const busy = loading || saving;
  const cleanCuit = onlyDigits(cuit);
  const cuitOk = cleanCuit.length === 11;
  const canConfirm = cuitOk && (!requireFiscalData || !!fiscalData) && !busy;

  const helperText = useMemo(() => {
    if (footerHelp) return footerHelp;
    if (requireFiscalData) {
      return "Primero buscá el CUIT. Cuando aparezcan los datos, confirmá para guardar el cliente y sus datos fiscales.";
    }
    return "Ingresá el CUIT, consultá ARCA y confirmá para continuar.";
  }, [footerHelp, requireFiscalData]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === "Enter" && !busy) {
        event.preventDefault();
        if (canConfirm) {
          onConfirm?.();
        } else if (cuitOk) {
          onLookup?.();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, busy, canConfirm, cuitOk, onClose, onConfirm, onLookup]);

  if (!open) return null;

  return createPortal(
    <div className="mi-mini__overlay gcf-modal__overlay">
      <div
        className={["mi-mini__modal", "gcf-modal", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mi-mini__head gcf-modal__head">
          <h4 className="mi-mini__title gcf-modal__title">{title}</h4>
          <button
            type="button"
            className="mi-mini__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mi-mini__body gcf-modal__body">
          <div className="gcf-alert gcf-alert--info">
            <div className="gcf-alert__title">{infoTitle}</div>
            {description && <div className="gcf-alert__description">{description}</div>}
          </div>

          <div className="fl-field gcf-modal__field">
            <input
              ref={inputRef}
              className="fl-input"
              placeholder=" "
              value={cleanCuit}
              onChange={(event) => onCuitChange?.(onlyDigits(event.target.value))}
              disabled={busy}
              autoComplete="off"
              inputMode="numeric"
              maxLength={11}
            />
            <label className="fl-label">
              <FontAwesomeIcon icon={faIdCard} className="gcf-modal__label-icon" />
              CUIT *
            </label>
          </div>

          <button
            type="button"
            className="mit-btn mit-btn--ghost gcf-modal__lookup-btn"
            onClick={onLookup}
            disabled={busy || !cuitOk}
          >
            <FontAwesomeIcon icon={faMagnifyingGlass} className="gcf-modal__btn-icon" />
            {loading ? searchingText : lookupText}
          </button>

          {fiscalData && (
            <div className="gcf-alert gcf-alert--success">
              <div className="gcf-alert__title">Datos encontrados</div>
              <div className="gcf-summary">
                <div className="gcf-summary__row">
                  <b>CUIT:</b>
                  <span>{safeText(fiscalData.cuit)}</span>
                </div>
                <div className="gcf-summary__row">
                  <b>IVA:</b>
                  <span>{safeText(fiscalData.condicion_iva || fiscalData.iva)}</span>
                </div>
                <div className="gcf-summary__row gcf-summary__row--full">
                  <b>Razón social:</b>
                  <span>{safeText(fiscalData.razon_social)}</span>
                </div>
                <div className="gcf-summary__row gcf-summary__row--full">
                  <b>Domicilio:</b>
                  <span>{safeText(fiscalData.domicilio)}</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="gcf-alert gcf-alert--error" role="alert">
              {error}
            </div>
          )}

          {helperText && <div className="gcf-modal__help">{helperText}</div>}

          <div className="mi-mini__actions gcf-modal__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="mit-btn mit-btn--solid" onClick={onConfirm} disabled={!canConfirm}>
              {saving ? "Guardando..." : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
