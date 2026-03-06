// ✅ REEMPLAZAR COMPLETO
// src/components/Global/Ver_Comprobantes/ModalVerComprobante.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../Global_css/Global_Modals.css";
import "../Global_css/Global_oscuro.css";
import "../../Mov_Subsection/Recibos/modales/ModalPagarRecibos.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";

function safeText(v) {
  return String(v ?? "").trim();
}

function buildHeadersGET() {
  const sessionKey = safeText(localStorage.getItem("session_key"));
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  return h;
}

function guessKindFromUrlOrMime(url, mime = "") {
  const u = safeText(url).toLowerCase();
  const m = safeText(mime).toLowerCase();

  if (m.includes("pdf")) return "pdf";
  if (m.startsWith("image/")) return "img";

  if (u.includes("action=comprobantes_descargar")) return "pdf";
  if (u.includes("comprobantes_descargar")) return "pdf";
  if (u.includes(".pdf") || u.startsWith("data:application/pdf")) return "pdf";

  if (
    u.includes(".png") ||
    u.includes(".jpg") ||
    u.includes(".jpeg") ||
    u.includes(".webp") ||
    u.startsWith("data:image/")
  ) {
    return "img";
  }

  return "other";
}

export default function ModalVerComprobante({
  open,
  url,
  mime = "",
  onClose,
  title = "Comprobante",
}) {
  const closeBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [blobUrl, setBlobUrl] = useState("");
  const [resolvedMime, setResolvedMime] = useState("");

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

  // focus close
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // fetch protegido con X-Session
  useEffect(() => {
    if (!open || !url) {
      setLoading(false);
      setErrorMsg("");
      setResolvedMime("");
      setBlobUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return "";
      });
      return;
    }

    let cancelled = false;
    let localBlobUrl = "";

    async function run() {
      setLoading(true);
      setErrorMsg("");
      setResolvedMime("");

      setBlobUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return "";
      });

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: buildHeadersGET(),
        });

        if (res.status === 401 || res.status === 403) {
          throw new Error("Sesión vencida o no autorizada para ver este comprobante.");
        }

        if (!res.ok) {
          throw new Error(`No se pudo cargar el comprobante. HTTP ${res.status}`);
        }

        const contentType = safeText(res.headers.get("Content-Type")) || safeText(mime);
        const blob = await res.blob();
        localBlobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
          return;
        }

        setResolvedMime(contentType);
        setBlobUrl(localBlobUrl);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e?.message || "No se pudo cargar el comprobante.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [open, url, mime]);

  const previewUrl = blobUrl || url || "";
  const kind = useMemo(() => {
    return guessKindFromUrlOrMime(previewUrl, resolvedMime || mime);
  }, [previewUrl, resolvedMime, mime]);

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

        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card mpr-viewCard">
              {!url && <div className="mov-emptyRow">No hay comprobante.</div>}

              {!!url && loading && (
                <div className="mov-emptyRow" style={{ padding: 18 }}>
                  Cargando comprobante…
                </div>
              )}

              {!!url && !loading && !!errorMsg && (
                <div className="mov-emptyRow" style={{ padding: 18, color: "#b91c1c" }}>
                  {errorMsg}
                </div>
              )}

              {!!previewUrl && !loading && !errorMsg && kind === "pdf" && (
                <div className="mpr-previewScroll" aria-label="Vista previa PDF">
                  <iframe
                    title="Comprobante PDF"
                    src={previewUrl}
                    className="mpr-pdfFrame"
                  />
                </div>
              )}

              {!!previewUrl && !loading && !errorMsg && kind === "img" && (
                <div className="mpr-previewScroll" aria-label="Vista previa imagen">
                  <div className="mpr-imgWrap">
                    <img src={previewUrl} alt="Comprobante" className="mpr-img" />
                  </div>
                </div>
              )}

              {!!previewUrl && !loading && !errorMsg && kind === "other" && (
                <div className="mov-emptyRow" style={{ padding: 14 }}>
                  No se puede previsualizar este archivo.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mi-modal__footer mpr-footer">
          <div style={{ display: "flex", gap: 10, width: "100%", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="mpr-btn"
              onClick={() => {
                const target = blobUrl || url;
                if (target) window.open(target, "_blank", "noopener,noreferrer");
              }}
              disabled={!blobUrl && !url}
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