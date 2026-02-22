// ✅ REEMPLAZAR COMPLETO
// src/components/OrdenesPago/modales/ModalOrdenPagoGenerada.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../Recibos/modales/ModalPagarRecibos.css";
import BASE_URL from "../../../../config/config";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faPrint,
  faCircleNotch,
  faCheck,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";

/* =========================
  Helpers
========================= */
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

function getSessionKey() {
  return (localStorage.getItem("session_key") || "").trim();
}

function buildAuthHeaders() {
  const session = getSessionKey();
  const headers = {};
  if (session) headers["X-Session"] = session;
  return headers;
}

function resolveSiteBase() {
  const raw = String(BASE_URL || "").replace(/\/+$/, "");
  return raw
    .replace(/\/api\.php$/i, "")
    .replace(/\/api\/routes$/i, "")
    .replace(/\/api\/routes\/api\.php$/i, "");
}

function nicePdfUrl(idComprobante) {
  const sessionKey = getSessionKey();
  const sp = new URLSearchParams();
  if (sessionKey) sp.set("session_key", sessionKey);
  const qs = sp.toString();
  return qs
    ? `${resolveSiteBase()}/c/${Number(idComprobante)}.pdf?${qs}`
    : `${resolveSiteBase()}/c/${Number(idComprobante)}.pdf`;
}

async function fetchJsonOrThrow(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 700 ? text.slice(0, 700) + "..." : text;
    throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
  }
  if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);
  if (data?.exito === false) throw new Error(data?.mensaje || "Operación fallida.");
  return data;
}

/* =========================
  ✅ EXTRAER <style> + <body> del HTML
========================= */
function extractBodyWithStyles(fullHtml) {
  const s = String(fullHtml || "").trim();
  if (!s) return { styles: "", body: "" };

  try {
    const doc = new DOMParser().parseFromString(s, "text/html");
    const styles = Array.from(doc.querySelectorAll("style"))
      .map((x) => x.textContent || "")
      .join("\n");

    const body = doc.body ? doc.body.innerHTML : s;
    return { styles, body };
  } catch {
    return { styles: "", body: s };
  }
}

/* =========================
  ✅ HTML -> PDF desde un nodo REAL (html2canvas + jsPDF)
  - Captura SOLO el "papel" (mpr-paper) para que no afecte el modo oscuro
========================= */
async function nodeToPdfBlob(containerNode, filename = "comprobante.pdf") {
  if (!containerNode) throw new Error("No se encontró el nodo para exportar a PDF.");

  // ✅ Capturar SOLO el comprobante (papel) si existe
  const target =
    containerNode.querySelector(".mpr-paper") ||
    containerNode.querySelector(".wrap") ||
    containerNode.querySelector(".page") ||
    containerNode;

  const canvas = await html2canvas(target, {
    scale: 2,
    backgroundColor: "#fff", // ✅ siempre blanco
    useCORS: true,
    scrollX: 0,
    scrollY: 0,
    windowWidth: target.scrollWidth || target.offsetWidth,
    windowHeight: target.scrollHeight || target.offsetHeight,
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF("p", "pt", "a4");
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const margin = 18;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  const imgW = canvas.width;
  const imgH = canvas.height;
  const ratio = Math.min(maxW / imgW, maxH / imgH);

  const renderW = imgW * ratio;
  const renderH = imgH * ratio;

  const x = (pageW - renderW) / 2;
  const y = margin;

  pdf.addImage(imgData, "PNG", x, y, renderW, renderH, undefined, "FAST");

  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  return { blob, file };
}

export default function ModalOrdenPagoGenerada({
  open,
  onClose,
  onToast,
  html,
  idsMovimiento = [],
  titulo = "Comprobante · Orden de Pago",
  // Firma sugerida: onSaved({ id_comprobante, ids_movimiento })
  onSaved,
}) {
  const firstRef = useRef(null);
  const previewRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [idComprobante, setIdComprobante] = useState(null);

  // ✅ vista previa renderizable (styles + body)
  const preview = useMemo(() => extractBodyWithStyles(html), [html]);
  const previewMarkup = useMemo(() => {
    const styles = preview.styles ? `<style>${preview.styles}</style>` : "";
    return `${styles}${preview.body || ""}`;
  }, [preview.styles, preview.body]);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setIdComprobante(null);
    const t = setTimeout(() => firstRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const idsOk = useMemo(() => {
    const arr = Array.isArray(idsMovimiento) ? idsMovimiento : [];
    const clean = arr.map((x) => Number(x || 0)).filter((n) => n > 0);
    return Array.from(new Set(clean));
  }, [idsMovimiento]);

  const handlePrint = useCallback(() => {
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) {
      onToast?.("error", "El navegador bloqueó el popup de impresión.", 3500);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [html, onToast]);

  const handleExportPdfLocal = useCallback(async () => {
    try {
      if (!previewRef.current) throw new Error("No hay vista previa para exportar.");
      setSaving(true);

      const { blob } = await nodeToPdfBlob(previewRef.current, "orden_pago.pdf");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "orden_pago.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      onToast?.("exito", "PDF exportado ✅", 2200);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo exportar el PDF.", 4500);
    } finally {
      setSaving(false);
    }
  }, [onToast]);

  const handleView = useCallback(() => {
    if (!idComprobante) {
      onToast?.("error", "Todavía no se guardó el comprobante.", 2200);
      return;
    }
    const url = nicePdfUrl(idComprobante);
    window.open(url, "_blank", "noopener,noreferrer");
  }, [idComprobante, onToast]);

  // ✅ Guardado interno (se usa automáticamente al cerrar)
  const saveToServerIfNeeded = useCallback(async () => {
    if (idComprobante) return idComprobante; // ya está
    if (!html) throw new Error("No hay HTML para generar el PDF.");
    if (idsOk.length === 0) throw new Error("No hay movimientos para asociar.");
    if (!previewRef.current) throw new Error("No hay vista previa para exportar.");

    setSaving(true);

    // ✅ 1) Generar PDF desde el nodo (captura papel blanco)
    const { file } = await nodeToPdfBlob(previewRef.current, "orden_pago.pdf");

    // ✅ 2) Subir
    const fd = new FormData();
    fd.append("tipo", "ORDEN_PAGO");
    fd.append("id_movimiento", String(idsOk[0]));
    fd.append("archivo", file);

    const upUrl = `${BASE_URL}/api.php?action=comprobantes_subir`;
    const upData = await fetchJsonOrThrow(upUrl, {
      method: "POST",
      headers: buildAuthHeaders(),
      body: fd,
    });

    const newIdComp = Number(upData?.id_comprobante || 0);
    if (!newIdComp) throw new Error("No se recibió id_comprobante al subir.");

    // ✅ 3) Asociar batch
    const assocUrl = `${BASE_URL}/api.php?action=comprobantes_asociar_movimientos`;
    await fetchJsonOrThrow(assocUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
      body: JSON.stringify({
        id_comprobante: newIdComp,
        ids_movimiento: idsOk,
        force: true,
      }),
    });

    setIdComprobante(newIdComp);

    // ✅ avisar al padre
    try {
      onSaved?.({ id_comprobante: newIdComp, ids_movimiento: idsOk });
    } catch {}

    onToast?.("exito", "Comprobante guardado y asociado ✅", 2400);

    return newIdComp;
  }, [html, idsOk, idComprobante, onToast, onSaved]);

  // ✅ Cerrar = guardar primero (si falla, NO cierra)
  const requestClose = useCallback(async () => {
    if (saving) return;
    try {
      await saveToServerIfNeeded();
      onClose?.();
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo guardar el comprobante.", 4500);
    } finally {
      setSaving(false);
    }
  }, [saving, saveToServerIfNeeded, onClose, onToast]);

  // ✅ ESC también guarda y cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  if (!open) return null;

  // ✅ Dark del modal según tu theme global (sin props)
  const isDark = typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-theme") === "oscuro"
    : false;

  const overlayClass =
    "mi-modal__overlay mi-modal__overlay--mov" + (isDark ? " mi-modal__overlay--dark" : "");

  const modalClass = "mi-modal__container mi-modal__container--mov mpr-modal";

  const canPrint = !!html && !saving;
  const canExport = !!previewMarkup && !saving;
  const canFinalize = !saving;
  const canView = !!idComprobante && !saving;

  return createPortal(
    <div className={overlayClass} role="dialog" aria-modal="true" onMouseDown={requestClose}>
      <div className={modalClass} onMouseDown={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <span>{safeText(titulo)}</span>
              {idComprobante ? (
                <span className="mpr-clientIdPill" title="ID comprobante">
                  #{idComprobante}
                </span>
              ) : null}
            </div>
            <div className="mi-modal__subtitle mpr-subtitle">
              Vista previa · Acciones abajo · Finalizar (guarda automático)
            </div>
          </div>

          <button
            ref={firstRef}
            type="button"
            className="mi-modal__close"
            onClick={requestClose}
            title="Cerrar (guarda automático)"
            disabled={saving}
          >
            <FontAwesomeIcon icon={saving ? faCircleNotch : faXmark} spin={saving} />
          </button>
        </div>

        {/* BODY */}
        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card mpr-viewCard">
              <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#777" }}>
                  Movimientos asociados: <b>{idsOk.length}</b>
                </div>
                <div style={{ flex: 1 }} />
                {idComprobante ? (
                  <div style={{ fontSize: 12, color: "#777" }}>
                    ID: <b>#{idComprobante}</b>
                  </div>
                ) : null}
              </div>

              <div className="mpr-previewScroll">
                {/* ✅ "PAPEL": SIEMPRE CLARO, NO afectado por dark */}
                <div className="mpr-paper" ref={previewRef}>
                  <div
                    className="mpr-paper__inner"
                    dangerouslySetInnerHTML={{
                      __html: previewMarkup || "<div style='padding:12px'>Sin vista previa</div>",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER (✅ botones abajo) */}
        <div className="mi-modal__footer mpr-footer">
          <button
            type="button"
            className="mpr-btn mpr-btn--ghost"
            onClick={handlePrint}
            disabled={!canPrint}
            title="Imprimir"
          >
            <FontAwesomeIcon icon={faPrint} />
            Imprimir
          </button>

          <button
            type="button"
            className="mpr-btn mpr-btn--ghost"
            onClick={handleExportPdfLocal}
            disabled={!canExport}
            title="Exportar PDF (sin guardar en servidor)"
          >
            <FontAwesomeIcon icon={saving ? faCircleNotch : faFilePdf} spin={saving} />
            Exportar PDF
          </button>

          {/* Si querés recuperar "Ver PDF" después, descomentá:
          <button
            type="button"
            className="mpr-btn mpr-btn--ghost"
            onClick={handleView}
            disabled={!canView}
            title="Ver PDF guardado"
          >
            <FontAwesomeIcon icon={faEye} />
            Ver
          </button>
          */}

          <button
            type="button"
            className="mpr-btn mpr-btn--primary"
            onClick={requestClose}
            disabled={!canFinalize}
            title="Finalizar (guarda automático)"
          >
            <FontAwesomeIcon icon={saving ? faCircleNotch : faCheck} spin={saving} />
            {saving ? "Guardando…" : "Finalizar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}