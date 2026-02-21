import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";

import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faPrint, faFilePdf, faCheck, faCircleNotch } from "@fortawesome/free-solid-svg-icons";

import html2pdf from "html2pdf.js/dist/html2pdf.min";

/* =========================
   Helpers
========================= */
function sanitizeFileName(name) {
  return String(name || "Recibo")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureFullHtmlDocument(html, title) {
  const s = String(html || "").trim();
  const hasHtmlTag = /<html[\s>]/i.test(s);
  const hasBodyTag = /<body[\s>]/i.test(s);

  const printCss = `
    <style>
      @page { size: A4; margin: 12mm; }
      html, body { background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style>
  `;

  if (hasHtmlTag && hasBodyTag) {
    if (/<head[\s>]/i.test(s) && /<\/head>/i.test(s)) {
      return s.replace(/<\/head>/i, `${printCss}</head>`);
    }
    return s;
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${String(title || "Recibo")}</title>
  ${printCss}
</head>
<body>
  ${s}
</body>
</html>`;
}

async function waitIframeReady(iframe) {
  if (!iframe) throw new Error("No se encontró el iframe.");
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("No se pudo acceder al documento del iframe.");

  if (doc.readyState === "complete" || doc.readyState === "interactive") return;

  await new Promise((resolve) => {
    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      resolve();
    };
    iframe.addEventListener("load", onLoad);
  });
}

async function waitAssetsInDoc(doc) {
  try {
    if (doc.fonts && doc.fonts.ready) await doc.fonts.ready;
  } catch {}

  const imgs = Array.from(doc.images || []);
  if (!imgs.length) return;

  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

/* =========================
   ✅ INLINE COMPUTED STYLES
========================= */
function copyComputedStylesDeep(srcNode, dstNode, srcWin) {
  if (!srcNode || !dstNode) return;

  if (srcNode.nodeType === 1 && dstNode.nodeType === 1) {
    const cs = srcWin.getComputedStyle(srcNode);
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      try {
        dstNode.style.setProperty(prop, cs.getPropertyValue(prop), cs.getPropertyPriority(prop));
      } catch {}
    }
    dstNode.style.webkitPrintColorAdjust = "exact";
    dstNode.style.printColorAdjust = "exact";
  }

  const srcChildren = srcNode.childNodes || [];
  const dstChildren = dstNode.childNodes || [];
  const len = Math.min(srcChildren.length, dstChildren.length);
  for (let i = 0; i < len; i++) copyComputedStylesDeep(srcChildren[i], dstChildren[i], srcWin);
}

function getSessionKey() {
  const keys = [
    "session_key",
    "SESSION_KEY",
    "balto_session_key",
    "BALTO_SESSION_KEY",
    "x_session",
    "X_SESSION",
    "X-Session",
    "x-session",
  ];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/**
 * ✅ URL BLINDADA:
 * - BASE_URL = https://dominio.com/api/routes   => https://dominio.com/api/routes/api.php
 * - BASE_URL = https://dominio.com/api/routes/api.php => queda igual
 */
function getApiPhpUrl() {
  const base = String(BASE_URL || "").replace(/\/+$/, "");
  if (/\/api\.php$/i.test(base)) return base;
  return `${base}/api.php`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function parseJsonFromResponse(res) {
  const text = await res.text();
  if (!text) return { ok: false, data: null, text: "" };
  try {
    return { ok: true, data: JSON.parse(text), text };
  } catch {
    return { ok: false, data: null, text };
  }
}

function extractIdComprobante(data) {
  const cand =
    data?.id_comprobante ??
    data?.idComprobante ??
    data?.comprobante_id ??
    data?.data?.id_comprobante ??
    data?.data?.idComprobante ??
    data?.data?.comprobante_id ??
    data?.data?.id ??
    data?.id ??
    0;
  const n = Number(cand || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function ModalReciboGenerado({
  open,
  onClose,
  onFinalizar,
  html,
  title = "Recibo",
  onToast,
  // ✅ AHORA: varios movimientos
  idsMovimientos = [],
  idCobro = null,
}) {
  const firstFocusRef = useRef(null);
  const viewFrameRef = useRef(null);
  const exportHostRef = useRef(null);

  const [busy, setBusy] = useState(false);

  // ✅ evita doble guardado
  const savedRef = useRef(null);
  const savingRef = useRef(false);

  const fullHtml = useMemo(() => ensureFullHtmlDocument(html, title), [html, title]);

  const idsMovs = useMemo(() => {
    const arr = Array.isArray(idsMovimientos) ? idsMovimientos : [idsMovimientos];
    return arr.map((x) => Number(x || 0)).filter((x) => Number.isFinite(x) && x > 0);
  }, [idsMovimientos]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open]);

  // ✅ ESC ahora cierra pero GUARDANDO
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestCloseAndSave("escape");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buildWrapperForPdf = useCallback(async () => {
    const iframe = viewFrameRef.current;
    if (!iframe) throw new Error("No se pudo preparar el PDF.");

    await waitIframeReady(iframe);

    const srcDoc = iframe.contentDocument;
    const srcWin = iframe.contentWindow;
    if (!srcDoc || !srcWin) throw new Error("No se pudo acceder al documento del recibo.");

    await waitAssetsInDoc(srcDoc);

    const host = exportHostRef.current;
    if (!host) throw new Error("No se pudo preparar el área de exportación.");

    host.innerHTML = "";

    const srcBody = srcDoc.body;
    const clone = srcBody.cloneNode(true);

    copyComputedStylesDeep(srcBody, clone, srcWin);

    const wrapper = document.createElement("div");
    wrapper.style.width = "794px"; // A4 @ 96dpi
    wrapper.style.minHeight = "1123px";
    wrapper.style.background = "#ffffff";
    wrapper.style.padding = "0";
    wrapper.style.margin = "0";
    wrapper.style.boxSizing = "border-box";
    wrapper.appendChild(clone);

    host.appendChild(wrapper);

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return wrapper;
  }, []);

  const handlePrint = useCallback(async () => {
    try {
      setBusy(true);

      const iframe = viewFrameRef.current;
      if (!iframe) throw new Error("No se pudo preparar la impresión.");

      await waitIframeReady(iframe);

      const w = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!w || !doc) throw new Error("No se pudo acceder al contenido para imprimir.");

      await waitAssetsInDoc(doc);
      await new Promise((r) => setTimeout(r, 80));

      w.focus();
      w.print();

      onToast?.("exito", "Panel de impresión abierto.", 2200);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo imprimir.", 4200);
    } finally {
      setBusy(false);
    }
  }, [onToast]);

  const handleExportPdf = useCallback(async () => {
    try {
      setBusy(true);

      const wrapper = await buildWrapperForPdf();
      const filename = `${sanitizeFileName(title)}.pdf`;

      const opt = {
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      };

      await html2pdf().set(opt).from(wrapper).save();
      onToast?.("exito", "PDF exportado con el mismo diseño.", 2400);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo exportar el PDF.", 4200);
    } finally {
      setBusy(false);
    }
  }, [title, onToast, buildWrapperForPdf]);

  // ✅ 1) SUBE PDF (una sola vez)
  const uploadPdfToServer = useCallback(
    async (pdfBlob) => {
      const sessionKey = getSessionKey();
      if (!sessionKey) throw new Error("Sesión inválida (no hay X-Session).");

      const safeName = sanitizeFileName(title);
      const file = new File([pdfBlob], `${safeName}.pdf`, { type: "application/pdf" });

      const fd = new FormData();
      fd.append("action", "comprobantes_subir");
      fd.append("tipo", "RECIBO");
      fd.append("titulo", String(title || "Recibo"));

      // ✅ compat: mandamos también 1 id_movimiento “principal”
      if (idsMovs[0]) fd.append("id_movimiento", String(idsMovs[0]));

      // ✅ NUEVO: mandamos TODOS los ids (si tu backend los acepta)
      // (no rompe nada si el backend los ignora)
      idsMovs.forEach((id) => fd.append("ids_movimiento[]", String(id)));

      const cob = Number(idCobro);
      if (Number.isFinite(cob) && cob > 0) fd.append("id_cobro", String(cob));

      fd.append("archivo", file);

      const url = getApiPhpUrl();

      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "X-Session": sessionKey },
          body: fd,
        },
        60000
      );

      const { ok, data, text } = await parseJsonFromResponse(res);

      if (!res.ok || !ok || !data?.exito) {
        const msg =
          data?.mensaje ||
          `No se pudo guardar el comprobante (HTTP ${res.status}).` +
            (text ? ` Respuesta: ${text.slice(0, 250)}` : "");
        throw new Error(msg);
      }

      const idComp = extractIdComprobante(data);
      if (!idComp) {
        // igual puede funcionar si el backend devuelve id dentro de otro campo:
        // si no hay id, no podemos asociar a múltiples
        throw new Error("El backend guardó el PDF pero no devolvió id_comprobante (necesario para vincular a varios).");
      }

      return { ...data, id_comprobante: idComp };
    },
    [title, idsMovs, idCobro]
  );

  // ✅ 2) ASOCIAR id_comprobante A TODOS los movimientos
  const asociarComprobanteAMovimientos = useCallback(async (idComprobante, ids) => {
    const sessionKey = getSessionKey();
    if (!sessionKey) throw new Error("Sesión inválida (no hay X-Session).");

    const url = getApiPhpUrl();

    const ACTIONS_BATCH = [
      "comprobantes_asociar_movimientos",
      "comprobantes_vincular_movimientos",
      "comprobantes_asignar_movimientos",
      "comprobantes_set_movimientos",
    ];

    const ACTIONS_ONE = [
      "comprobantes_asociar_movimiento",
      "comprobantes_vincular_movimiento",
      "comprobantes_asignar_movimiento",
      "comprobantes_set_movimiento",
    ];

    const postJson = async (action, payload) => {
      const res = await fetchWithTimeout(
        `${url}?action=${encodeURIComponent(action)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session": sessionKey },
          body: JSON.stringify(payload || {}),
        },
        60000
      );
      const { ok, data, text } = await parseJsonFromResponse(res);
      if (!res.ok || !ok || !data?.exito) {
        const msg = data?.mensaje || `HTTP ${res.status}` + (text ? ` ${text.slice(0, 200)}` : "");
        throw new Error(msg);
      }
      return data;
    };

    // ✅ primero intentamos batch (1 request)
    for (const action of ACTIONS_BATCH) {
      try {
        const data = await postJson(action, {
          id_comprobante: Number(idComprobante),
          ids_movimiento: ids,
        });
        return data;
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("acción no válida") || msg.includes("accion no valida") || msg.includes("action no valida")) {
          continue;
        }
        // si falla por otra cosa, cortamos
        throw e;
      }
    }

    // ✅ si no existe batch, intentamos uno por uno
    for (const id of ids) {
      let okOne = false;
      for (const action of ACTIONS_ONE) {
        try {
          await postJson(action, {
            id_comprobante: Number(idComprobante),
            id_movimiento: Number(id),
          });
          okOne = true;
          break;
        } catch (e) {
          const msg = String(e?.message || "").toLowerCase();
          if (msg.includes("acción no válida") || msg.includes("accion no valida") || msg.includes("action no valida")) {
            continue;
          }
          throw e;
        }
      }
      if (!okOne) {
        throw new Error(
          `Tu backend no tiene action para asociar comprobante a movimientos.\n` +
            `Probé batch: ${ACTIONS_BATCH.join(", ")}\n` +
            `Probé 1x1: ${ACTIONS_ONE.join(", ")}\n` +
            `Decime cómo se llama tu action y la conecto.`
        );
      }
    }

    return { exito: true };
  }, []);

  // ✅ Guardado central (para X / Escape / Finalizar)
  const ensureSaved = useCallback(async () => {
    if (savedRef.current) return savedRef.current;
    if (savingRef.current) {
      while (savingRef.current) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 80));
      }
      if (savedRef.current) return savedRef.current;
    }

    if (!idsMovs.length) throw new Error("Faltan idsMovimientos válidos para vincular el recibo.");

    savingRef.current = true;
    try {
      const wrapper = await buildWrapperForPdf();

      const opt = {
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      };

      // ✅ BLOB para subir
      const worker = html2pdf().set(opt).from(wrapper).toPdf();
      const pdfBlob = await worker.output("blob");
      if (!pdfBlob) throw new Error("No se pudo generar el PDF (blob).");

      // 1) subir
      const saved = await uploadPdfToServer(pdfBlob);
      const idComp = extractIdComprobante(saved);

      // 2) asociar a TODOS
      await asociarComprobanteAMovimientos(idComp, idsMovs);

      const finalSaved = { ...saved, id_comprobante: idComp, ids_movimiento: idsMovs };
      savedRef.current = finalSaved;

      onToast?.("exito", "Recibo guardado y vinculado a todos los registros ✅", 2600);
      return finalSaved;
    } finally {
      savingRef.current = false;
    }
  }, [idsMovs, buildWrapperForPdf, uploadPdfToServer, asociarComprobanteAMovimientos, onToast]);

  // ✅ Cerrar SIEMPRE guardando
  const requestCloseAndSave = useCallback(
    async (reason = "close") => {
      if (busy) return;
      try {
        setBusy(true);

        const saved = await ensureSaved();

        // ✅ avisamos al padre SIEMPRE (para activar el ojo sin recargar)
        onFinalizar?.(saved);

        // ✅ cerramos modal
        onClose?.();
      } catch (e) {
        onToast?.("error", e?.message || "No se pudo guardar el recibo.", 4500);
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureSaved, onFinalizar, onClose, onToast]
  );

  const handleFinalizar = useCallback(() => requestCloseAndSave("finalizar"), [requestCloseAndSave]);

  if (!open) return null;

  return createPortal(
    <div
      className="mi-modal__overlay mi-modal__overlay--mov"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        className="mi-modal__container mi-modal__container--mov"
        style={{ width: "min(980px, 96vw)", maxWidth: "980px", position: "relative" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="mi-modal__title">{title}</div>

          <button
            ref={firstFocusRef}
            type="button"
            className="mi-modal__close"
            onClick={() => requestCloseAndSave("x")}
            title="Cerrar"
            disabled={busy}
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mi-modal__body" style={{ padding: 0 }}>
          <iframe
            ref={viewFrameRef}
            title="Vista previa del recibo"
            srcDoc={fullHtml}
            style={{ width: "100%", height: "70vh", border: "0", borderRadius: "10px", background: "white" }}
          />
        </div>

        <div className="mi-modal__footer" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="mov-btn mov-btn--ghost" onClick={handlePrint} disabled={busy}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faPrint} spin={busy} /> Imprimir
          </button>

          <button type="button" className="mov-btn mov-btn--ghost" onClick={handleExportPdf} disabled={busy}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faFilePdf} spin={busy} /> Exportar PDF
          </button>

          <button type="button" className="mov-btn mov-btn--primary" onClick={handleFinalizar} disabled={busy}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faCheck} spin={busy} /> Finalizar
          </button>
        </div>

        <div
          ref={exportHostRef}
          style={{
            position: "fixed",
            left: "0",
            top: "0",
            width: "794px",
            opacity: 0,
            pointerEvents: "none",
            zIndex: -1,
            background: "#fff",
          }}
        />
      </div>
    </div>,
    document.body
  );
}