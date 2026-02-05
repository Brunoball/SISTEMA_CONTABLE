import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ✅ misma estética

function isPdfUrl(url) {
  const u = String(url || "").toLowerCase();
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

export default function ModalVerComprobante({ open, url, onClose, title = "Comprobante" }) {
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
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
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
    if (isPdfUrl(url)) return "pdf";
    if (isImageUrl(url)) return "img";
    return "other";
  }, [url]);

  if (!open) return null;

  const modal = (
    <div className="mi-modal__overlay mi-modal__overlay--mov" onMouseDown={onClose}>
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 980 }}
      >
        <div className="mi-modal__header mi-modal__header--car">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">{title}</h2>
            <p className="mi-modal__subtitle">
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
            </p>
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

        <div className="mi-modal__content mi-modal__content--car" style={{ padding: 14 }}>
          {!url && <div className="mov-emptyRow">No hay comprobante.</div>}

          {!!url && kind === "pdf" && (
            <iframe
              title="Comprobante PDF"
              src={url}
              style={{
                width: "100%",
                height: "70vh",
                border: "1px solid rgba(255,255,255,.10)",
                borderRadius: 12,
              }}
            />
          )}

          {!!url && kind === "img" && (
            <div style={{ width: "100%", textAlign: "center" }}>
              <img
                src={url}
                alt="Comprobante"
                style={{
                  maxWidth: "100%",
                  maxHeight: "70vh",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.10)",
                }}
              />
            </div>
          )}

          {!!url && kind === "other" && (
            <div className="mov-emptyRow">
              No se puede previsualizar este archivo.{" "}
              <a href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                Abrir
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
