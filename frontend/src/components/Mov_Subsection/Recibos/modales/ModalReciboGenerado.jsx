// ✅ REEMPLAZAR COMPLETO
// src/components/Movimientos/modales/ModalReciboGenerado.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../Recibos/modales/ModalPagarRecibos.css";
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
      @page { size: A4; margin: 10mm; }
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

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getSessionKey() {
  const keys = ["session_key", "SESSION_KEY", "balto_session_key", "BALTO_SESSION_KEY", "x_session", "X_SESSION", "X-Session", "x-session"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

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

// ✅ px por mm a 96dpi
const mmToPx = (mm) => Math.round((mm * 96) / 25.4);

/* =========================
   ✅ CSS EXTRA (sin parpadeo)
   - oculta subtítulo
   - baja font-weight título y total
   - chip al lado del título (cuando lo reubicamos)
========================= */
const EXTRA_RECIBO_CSS = `
/* Título más fino */
.paper .rc-title{
  font-weight: 600 !important;
  letter-spacing: .2px !important;
}

/* Chip al lado del título */
.paper .rc-headRow{
  display:flex !important;
  align-items:center !important;
  gap:10px !important;
  flex-wrap: wrap !important;
}
.paper .rc-chip{
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
  padding:6px 10px !important;
  border-radius:999px !important;
  background: rgba(241,245,249,.75) !important;
  border: 1px solid rgba(226,232,240,1) !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  white-space: nowrap !important;
}

/* Ocultar "Sistema Contable · Comprobante interno" (si quedó) */
.paper .recibo-subtitle,
.paper .rc-subtitle{
  display:none !important;
}

/* Total más fino */
.paper .totalBox .v,
.paper .totalBox .amount,
.paper .rc-totalValue,
.paper .total-amount{
  font-weight: 600 !important;
}
`;

/* =========================
   ✅ PREPROCESAR HTML (ANTES DE RENDER)
   Evita el salto visual: acá movemos el chip en el string.
========================= */
function transformReciboBodyHtml(bodyHtml) {
  const s = String(bodyHtml || "").trim();
  if (!s) return s;

  try {
    const doc = new DOMParser().parseFromString(`<body>${s}</body>`, "text/html");
    const root = doc.body;

    // 1) borrar el texto exacto del subtítulo si existe en el HTML
    //    ("Sistema Contable · Comprobante interno")
    const allEls = Array.from(root.querySelectorAll("*"));
    for (const el of allEls) {
      const t = normalizeText(el.textContent);
      if (t === "sistema contable · comprobante interno" || t === "sistema contable · comprobante interno.") {
        el.remove();
        break;
      }
    }

    // 2) encontrar título "RECIBO DE COBRO"
    let titleEl = null;
    for (const el of allEls) {
      const t = normalizeText(el.textContent);
      if (t === "recibo de cobro" || t.includes("recibo de cobro")) {
        // elegimos el primero que sea “corto” (evita agarrar un contenedor grande)
        if (String(el.textContent || "").trim().length <= 40) {
          titleEl = el;
          break;
        }
      }
    }

    // 3) encontrar chip “Medio: …” o “Medio de pago: …”
    let chipEl = null;
    const allEls2 = Array.from(root.querySelectorAll("*"));
    for (const el of allEls2) {
      const t = normalizeText(el.textContent);
      if (t.startsWith("medio:") || t.startsWith("medio de pago:")) {
        // evitamos agarrar un contenedor gigante
        if (String(el.textContent || "").trim().length <= 60) {
          chipEl = el;
          break;
        }
      }
    }

    // 4) reubicar: chip al lado del título (sin animación / sin efecto)
    if (titleEl) {
      titleEl.classList.add("rc-title");

      // si el chip existe, lo metemos al lado
      if (chipEl) {
        chipEl.classList.add("rc-chip");

        // si ya están juntos, no hacemos nada
        const alreadyRow = titleEl.parentElement && titleEl.parentElement.classList.contains("rc-headRow");
        if (!alreadyRow) {
          const row = doc.createElement("div");
          row.className = "rc-headRow";

          const parent = titleEl.parentElement;
          if (parent) {
            parent.insertBefore(row, titleEl);
            row.appendChild(titleEl);
            row.appendChild(chipEl);
          }
        }
      }
    }

    return root.innerHTML;
  } catch {
    return s;
  }
}

export default function ModalReciboGenerado({
  open,
  onClose,
  onFinalizar,
  html,
  title = "Recibo",
  onToast,
  idsMovimientos = [],
  idCobro = null,
}) {
  const firstFocusRef = useRef(null);
  const previewRef = useRef(null);
  const exportHostRef = useRef(null);

  const [busy, setBusy] = useState(false);

  const savedRef = useRef(null);
  const savingRef = useRef(false);

  const fullHtml = useMemo(() => ensureFullHtmlDocument(html, title), [html, title]);

  // ✅ parse styles + body
  const extracted = useMemo(() => extractBodyWithStyles(fullHtml), [fullHtml]);

  // ✅ transform BEFORE render (sin parpadeo)
  const previewMarkup = useMemo(() => {
    const transformedBody = transformReciboBodyHtml(extracted.body || "");
    const mergedStyles = `${extracted.styles || ""}\n${EXTRA_RECIBO_CSS}`.trim();
    const stylesTag = mergedStyles ? `<style>${mergedStyles}</style>` : "";
    return `${stylesTag}${transformedBody || ""}`;
  }, [extracted.styles, extracted.body]);

  const idsMovs = useMemo(() => {
    const arr = Array.isArray(idsMovimientos) ? idsMovimientos : [idsMovimientos];
    return arr.map((x) => Number(x || 0)).filter((x) => Number.isFinite(x) && x > 0);
  }, [idsMovimientos]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => firstFocusRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // ESC = finalizar (guarda)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestCloseAndSave();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* =========================
     ✅ buildWrapperForPdf desde PREVIEW INLINE
  ========================= */
  const buildWrapperForPdf = useCallback(async () => {
    if (!previewRef.current) throw new Error("No hay vista previa para exportar.");

    const host = exportHostRef.current;
    if (!host) throw new Error("No se pudo preparar el área de exportación.");

    host.innerHTML = "";

    const src = previewRef.current;
    const clone = src.cloneNode(true);

    const A4_W = 794; // 96dpi aprox
    const pad = mmToPx(10); // 10mm

    const wrapper = document.createElement("div");
    wrapper.style.width = `${A4_W}px`;
    wrapper.style.background = "#ffffff";
    wrapper.style.margin = "0";
    wrapper.style.padding = `${pad}px`;
    wrapper.style.boxSizing = "border-box";
    wrapper.style.display = "block";
    wrapper.style.height = "auto";
    wrapper.style.overflow = "hidden";

    clone.style.marginLeft = "auto";
    clone.style.marginRight = "auto";
    clone.style.width = "100%";
    clone.style.maxWidth = `${A4_W - pad * 2}px`;

    wrapper.appendChild(clone);
    host.appendChild(wrapper);

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return wrapper;
  }, []);

  const handlePrint = useCallback(() => {
    try {
      if (!fullHtml) throw new Error("No hay HTML para imprimir.");

      const w = window.open("", "_blank");
      if (!w) throw new Error("El navegador bloqueó el popup de impresión.");

      w.document.open();
      w.document.write(fullHtml);
      w.document.close();
      w.focus();
      w.print();

      onToast?.("exito", "Panel de impresión abierto.", 2200);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo imprimir.", 4200);
    }
  }, [fullHtml, onToast]);

  const handleExportPdf = useCallback(async () => {
    try {
      setBusy(true);

      const wrapper = await buildWrapperForPdf();
      const filename = `${sanitizeFileName(title)}.pdf`;

      const contentH = Math.ceil(wrapper.scrollHeight || 0);

      const opt = {
        margin: 0, // wrapper ya tiene padding 10mm
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
          windowHeight: contentH > 0 ? contentH : undefined,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      await html2pdf().set(opt).from(wrapper).save();
      onToast?.("exito", "PDF exportado ✅", 2400);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo exportar el PDF.", 4200);
    } finally {
      setBusy(false);
    }
  }, [title, onToast, buildWrapperForPdf]);

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

      if (idsMovs[0]) fd.append("id_movimiento", String(idsMovs[0]));
      idsMovs.forEach((id) => fd.append("ids_movimiento[]", String(id)));

      const cob = Number(idCobro);
      if (Number.isFinite(cob) && cob > 0) fd.append("id_cobro", String(cob));

      fd.append("archivo", file);

      const url = getApiPhpUrl();

      const res = await fetchWithTimeout(url, { method: "POST", headers: { "X-Session": sessionKey }, body: fd }, 60000);

      const { ok, data, text } = await parseJsonFromResponse(res);

      if (!res.ok || !ok || !data?.exito) {
        const msg =
          data?.mensaje ||
          `No se pudo guardar el comprobante (HTTP ${res.status}).` +
            (text ? ` Respuesta: ${text.slice(0, 250)}` : "");
        throw new Error(msg);
      }

      const idComp = extractIdComprobante(data);
      if (!idComp) throw new Error("El backend guardó el PDF pero no devolvió id_comprobante.");

      return { ...data, id_comprobante: idComp };
    },
    [title, idsMovs, idCobro]
  );

  const asociarComprobanteAMovimientos = useCallback(async (idComprobante, ids) => {
    const sessionKey = getSessionKey();
    if (!sessionKey) throw new Error("Sesión inválida (no hay X-Session).");

    const url = getApiPhpUrl();

    const ACTIONS_BATCH = ["comprobantes_asociar_movimientos", "comprobantes_vincular_movimientos", "comprobantes_asignar_movimientos", "comprobantes_set_movimientos"];
    const ACTIONS_ONE = ["comprobantes_asociar_movimiento", "comprobantes_vincular_movimiento", "comprobantes_asignar_movimiento", "comprobantes_set_movimiento"];

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

    // 1) batch
    for (const action of ACTIONS_BATCH) {
      try {
        return await postJson(action, { id_comprobante: Number(idComprobante), ids_movimiento: ids });
      } catch (e) {
        const msg = String(e?.message || "").toLowerCase();
        if (msg.includes("acción no válida") || msg.includes("accion no valida") || msg.includes("action no valida")) continue;
        throw e;
      }
    }

    // 2) 1x1
    for (const id of ids) {
      let okOne = false;
      for (const action of ACTIONS_ONE) {
        try {
          await postJson(action, { id_comprobante: Number(idComprobante), id_movimiento: Number(id) });
          okOne = true;
          break;
        } catch (e) {
          const msg = String(e?.message || "").toLowerCase();
          if (msg.includes("acción no válida") || msg.includes("accion no valida") || msg.includes("action no valida")) continue;
          throw e;
        }
      }
      if (!okOne) {
        throw new Error(
          `Tu backend no tiene action para asociar comprobante a movimientos.\n` +
            `Probé batch: ${ACTIONS_BATCH.join(", ")}\n` +
            `Probé 1x1: ${ACTIONS_ONE.join(", ")}`
        );
      }
    }

    return { exito: true };
  }, []);

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
      const contentH = Math.ceil(wrapper.scrollHeight || 0);

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
          windowHeight: contentH > 0 ? contentH : undefined,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      const worker = html2pdf().set(opt).from(wrapper).toPdf();
      const pdfBlob = await worker.output("blob");
      if (!pdfBlob) throw new Error("No se pudo generar el PDF (blob).");

      const saved = await uploadPdfToServer(pdfBlob);
      const idComp = extractIdComprobante(saved);

      await asociarComprobanteAMovimientos(idComp, idsMovs);

      const finalSaved = { ...saved, id_comprobante: idComp, ids_movimiento: idsMovs };
      savedRef.current = finalSaved;

      onToast?.("exito", "Recibo guardado y vinculado ✅", 2600);
      return finalSaved;
    } finally {
      savingRef.current = false;
    }
  }, [idsMovs, buildWrapperForPdf, uploadPdfToServer, asociarComprobanteAMovimientos, onToast]);

  const requestCloseAndSave = useCallback(async () => {
    if (busy) return;
    try {
      setBusy(true);
      const saved = await ensureSaved();
      onFinalizar?.(saved);
      onClose?.();
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo guardar el recibo.", 4500);
    } finally {
      setBusy(false);
    }
  }, [busy, ensureSaved, onFinalizar, onClose, onToast]);

  const handleFinalizar = useCallback(() => requestCloseAndSave(), [requestCloseAndSave]);

  if (!open) return null;

  const overlayClass = "mi-modal__overlay mi-modal__overlay--mov";
  const modalClass = "mi-modal__container mi-modal__container--mov mpr-modal";

  return createPortal(
    <div className={overlayClass} role="dialog" aria-modal="true" onMouseDown={handleFinalizar}>
      <div className={modalClass} style={{ width: "min(980px, 96vw)", maxWidth: "980px" }} onMouseDown={(e) => e.stopPropagation()}>
        {/* HEADER (igual Orden de Pago) */}
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <span>{title}</span>
            </div>
            <div className="mi-modal__subtitle mpr-subtitle">Vista previa · Acciones abajo · Finalizar (guarda automático)</div>
          </div>

          <button
            ref={firstFocusRef}
            type="button"
            className="mi-modal__close"
            onClick={handleFinalizar}
            title="Cerrar (guarda)"
            disabled={busy}
          >
            <FontAwesomeIcon icon={busy ? faCircleNotch : faXmark} spin={busy} />
          </button>
        </div>

        {/* BODY */}
        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card mpr-viewCard">
              <div className="mpr-previewScroll">
                <div
                  ref={previewRef}
                  style={{ background: "#fff", padding: 12, borderRadius: 10 }}
                  dangerouslySetInnerHTML={{
                    __html: previewMarkup || "<div style='padding:12px'>Sin vista previa</div>",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="mi-modal__footer mpr-footer">
          <button type="button" className="mpr-btn mpr-btn--ghost" onClick={handlePrint} disabled={busy}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faPrint} spin={busy} /> Imprimir
          </button>

          <button type="button" className="mpr-btn mpr-btn--ghost" onClick={handleExportPdf} disabled={busy}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faFilePdf} spin={busy} /> Exportar PDF
          </button>

          <button type="button" className="mpr-btn mpr-btn--primary" onClick={handleFinalizar} disabled={busy}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faCheck} spin={busy} /> Finalizar
          </button>
        </div>

        {/* host invisible para export */}
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