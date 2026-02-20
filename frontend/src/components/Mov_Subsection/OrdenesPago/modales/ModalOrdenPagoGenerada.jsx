// ✅ REEMPLAZAR COMPLETO
// src/components/OrdenesPago/modales/ModalOrdenPagoGenerada.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_Modals.css";
import "../../Recibos/modales/ModalPagarRecibos.css"; // reutiliza estética
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faEye,
  faPrint,
  faCircleNotch,
  faCheck,
  faFilePdf,
} from "@fortawesome/free-solid-svg-icons";

import jsPDF from "jspdf";

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
   ✅ HTML -> PDF desde un nodo REAL
========================= */
async function nodeToPdfBlob(node, filename = "comprobante.pdf") {
  if (!node) throw new Error("No se encontró el nodo para exportar a PDF.");

  const doc = new jsPDF("p", "pt", "a4");

  await doc.html(node, {
    x: 18,
    y: 18,
    width: 559, // 595 - 36
    windowWidth: node.scrollWidth || 794,
    html2canvas: {
      scale: 0.95,
      useCORS: true,
      backgroundColor: "#ffffff",
    },
  });

  const blob = doc.output("blob");
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
    setTimeout(() => firstRef.current?.focus(), 50);
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

    // ✅ 1) Generar PDF desde el nodo
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
    onToast?.("exito", "Comprobante guardado y asociado ✅", 2400);

    return newIdComp;
  }, [html, idsOk, idComprobante, onToast]);

  // ✅ Cerrar = guardar primero (si falla, NO cierra)
  const requestClose = useCallback(async () => {
    if (saving) return;
    try {
      await saveToServerIfNeeded();
      onClose?.(); // ✅ además el padre cierra el modal de pago
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo guardar el comprobante.", 4500);
      // no cerramos
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

  const overlayClass = "mi-modal__overlay mi-modal__overlay--mov";
  const modalClass = "mi-modal__container mi-modal__container--mov mpr-modal";

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
              Vista previa · Imprimir · Exportar PDF · Finalizar (guarda automático)
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
            {/* ✅ ACCIONES */}
            <div className="mpr-card" style={{ marginBottom: 12 }}>
              <div className="mpr-formRow" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <button
                  type="button"
                  className="mov-btn mov-btn--ghost mpr-btnWide mpr-btnInCard"
                  onClick={handlePrint}
                  disabled={!html || saving}
                  title="Imprimir"
                >
                  <FontAwesomeIcon icon={faPrint} />
                  Imprimir
                </button>

                <button
                  type="button"
                  className="mov-btn mov-btn--ghost mpr-btnWide mpr-btnInCard"
                  onClick={handleExportPdfLocal}
                  disabled={!previewMarkup || saving}
                  title="Exportar PDF (sin guardar en servidor)"
                >
                  <FontAwesomeIcon icon={saving ? faCircleNotch : faFilePdf} spin={saving} />
                  Exportar PDF
                </button>

                <button
                  type="button"
                  className="mov-btn mov-btn--primary mpr-btnWide mpr-btnInCard"
                  onClick={requestClose}
                  disabled={saving}
                  title="Finalizar (guarda automático)"
                >
                  <FontAwesomeIcon icon={saving ? faCircleNotch : faCheck} spin={saving} />
                  {saving ? "Guardando…" : "Finalizar"}
                </button>
              </div>

              {/* ✅ Acciones extra (solo si ya guardó y tiene ID) */}
              <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "#777" }}>
                  Movimientos asociados: <b>{idsOk.length}</b>
                </div>

                <div style={{ flex: 1 }} />

                <button
                  type="button"
                  className="mov-btn mov-btn--ghost"
                  onClick={handleView}
                  disabled={!idComprobante || saving}
                  title="Ver PDF guardado (URL linda)"
                >
                  <FontAwesomeIcon icon={faEye} /> Ver PDF
                </button>
              </div>
            </div>

            {/* ✅ VISTA PREVIA */}
            <div className="mpr-card" style={{ overflow: "auto", maxHeight: "60vh" }}>
              <div
                ref={previewRef}
                style={{
                  background: "#fff",
                  padding: 12,
                  borderRadius: 10,
                }}
                dangerouslySetInnerHTML={{
                  __html: previewMarkup || "<div style='padding:12px'>Sin vista previa</div>",
                }}
              />
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mi-modal__footer mpr-footer">
          <button type="button" className="mpr-btn mpr-btn--primary" onClick={requestClose} disabled={saving}>
            {saving ? "Guardando…" : "Finalizar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}