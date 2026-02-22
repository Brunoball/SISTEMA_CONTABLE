// ✅ REEMPLAZAR COMPLETO
// src/components/Movimientos/modales/ModalVerComprobante.jsx   (ajustá la ruta si lo tenés en otra carpeta)

import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import "../Global_css/Global_Modals.css";
import "../Global_css/Global_oscuro.css";
import "../../Mov_Subsection/Recibos/modales/ModalPagarRecibos.css"; // ✅ reutiliza estética mpr-*

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

function isPdfUrl(url) {
  const u = String(url || "").toLowerCase();
  if (u.includes("action=comprobantes_descargar")) return true;
  if (u.includes("comprobantes_descargar")) return true;
  return u.includes(".pdf") || u.startsWith("data:application/pdf");
}

function isImageUrl(url) {
  const u = String(url || "").toLowerCase();
  return (
    u.includes(".png") ||
    u.includes(".jpg") ||
    u.includes(".jpeg") ||
    u.includes(".webp") ||
    u.startsWith("data:image/")
  );
}

export default function ModalVerComprobante({
  open,
  url,
  mime = "",
  onClose,
  title = "Comprobante",
}) {
  const closeBtnRef = useRef(null);

  // Lock scroll del body
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Focus close
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const kind = useMemo(() => {
    if (!url) return "none";
    const m = String(mime || "").toLowerCase().trim();
    if (m.includes("pdf")) return "pdf";
    if (m.startsWith("image/")) return "img";
    if (isPdfUrl(url)) return "pdf";
    if (isImageUrl(url)) return "img";
    return "other";
  }, [url, mime]);

  if (!open) return null;

  const overlayClass = "mi-modal__overlay mi-modal__overlay--mov";
  const modalClass = "mi-modal__container mi-modal__container--mov mpr-modal";

  return createPortal(
    <div className={overlayClass} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div
        className={modalClass}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 1100 }}
      >
        {/* HEADER (igual estilo Orden de Pago) */}
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <span>{title}</span>
            </div>
            <div className="mi-modal__subtitle mpr-subtitle">
              {url ? "Vista previa del comprobante" : "—"}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* BODY */}
        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card mpr-viewCard">
              {!url && <div className="mov-emptyRow">No hay comprobante.</div>}

              {!!url && kind === "pdf" && (
                <div className="mpr-previewScroll" aria-label="Vista previa PDF">
                  {/* ✅ Importante: el scroll lo hace ESTE contenedor */}
                  <iframe
                    title="Comprobante PDF"
                    src={url}
                    className="mpr-pdfFrame"
                    // sandbox opcional si querés endurecer seguridad:
                    // sandbox="allow-same-origin allow-scripts allow-downloads allow-forms"
                  />
                </div>
              )}

              {!!url && kind === "img" && (
                <div className="mpr-previewScroll" aria-label="Vista previa imagen">
                  <div className="mpr-imgWrap">
                    <img src={url} alt="Comprobante" className="mpr-img" />
                  </div>
                </div>
              )}

              {!!url && kind === "other" && (
                <div className="mov-emptyRow" style={{ padding: 14 }}>
                  No se puede previsualizar este archivo.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FOOTER (botones abajo como pediste) */}
        <div className="mi-modal__footer mpr-footer">
          <div style={{ display: "flex", gap: 10, width: "100%", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="mpr-btn"
              onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
              disabled={!url}
              title="Abrir en nueva pestaña"
            >
              <FontAwesomeIcon icon={faUpRightFromSquare} style={{ marginRight: 8 }} />
              Abrir
            </button>

            <button type="button" className="mpr-btn mpr-btn--primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}