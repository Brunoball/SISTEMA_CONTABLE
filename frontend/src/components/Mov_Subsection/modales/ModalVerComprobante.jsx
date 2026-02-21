// ✅ REEMPLAZAR COMPLETO
// src/components/Mov_Subsection/modales/ModalVerComprobante.jsx

import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import "../../Global/Global_css/Global_Modals.css";

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

  // lock scroll
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

  const modal = (
    <div className="mi-modal__overlay mi-modal__overlay--mov" onMouseDown={onClose}>
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 1100 }}
      >
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <span>{title}</span>
            </div>
            <div className="mi-modal__subtitle mpr-subtitle">
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "underline" }}
                >
                  Abrir en nueva pestaña
                </a>
              ) : (
                "—"
              )}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card" style={{ overflow: "hidden" }}>
              {!url && <div className="mov-emptyRow">No hay comprobante.</div>}

              {!!url && kind === "pdf" && (
                <iframe
                  title="Comprobante PDF"
                  src={url}
                  style={{
                    width: "100%",
                    height: "74vh",
                    border: "0",
                    background: "#fff",
                  }}
                />
              )}

              {!!url && kind === "img" && (
                <div style={{ width: "100%", textAlign: "center", padding: 10 }}>
                  <img
                    src={url}
                    alt="Comprobante"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "74vh",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,.10)",
                      background: "#fff",
                    }}
                  />
                </div>
              )}

              {!!url && kind === "other" && (
                <div className="mov-emptyRow" style={{ padding: 14 }}>
                  No se puede previsualizar este archivo.{" "}
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "underline" }}
                  >
                    Abrir
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mi-modal__footer mpr-footer">
          <button type="button" className="mpr-btn mpr-btn--primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}