import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/* =========================================================
   Helpers
========================================================= */
function safeStr(v, fallback = "—") {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function formatMoney(v) {
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

function formatDate(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }

  if (/^\d{8}$/.test(s)) {
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  }

  return s;
}

function cbteTipoLabel(cbteTipo) {
  const n = Number(cbteTipo || 0);
  if (n === 3) return "NOTA DE CRÉDITO A";
  if (n === 8) return "NOTA DE CRÉDITO B";
  if (n === 13) return "NOTA DE CRÉDITO C";
  return `NOTA DE CRÉDITO (${n || "S/T"})`;
}

function buildFileName(data) {
  const pto = String(data?.pto_vta ?? "0").padStart(4, "0");
  const nro = String(data?.cbte_nro ?? "0").padStart(8, "0");
  const tipo = String(data?.cbte_tipo ?? "NC").replace(/\s+/g, "_");
  return `nota_credito_${tipo}_${pto}_${nro}.pdf`;
}

function normalizeItems(items, totalFallback = 0) {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((it, idx) => ({
      codigo: safeStr(it?.codigo ?? idx + 1, String(idx + 1)),
      descripcion: safeStr(it?.descripcion ?? it?.detalle ?? "Ítem"),
      cantidad: Number(it?.cantidad ?? 1) || 1,
      precio:
        Number(
          it?.precio_unitario ??
            it?.precio ??
            it?.ars ??
            it?.subtotal ??
            it?.total ??
            0
        ) || 0,
      subtotal: Number(it?.subtotal ?? it?.ars ?? it?.total ?? 0) || 0,
      iva_pct: Number(it?.iva_pct ?? 0) || 0,
      iva_monto: Number(it?.iva_monto ?? 0) || 0,
      total: Number(it?.total ?? it?.ars ?? it?.subtotal ?? 0) || 0,
    }));
  }

  return [
    {
      codigo: "1",
      descripcion: "Anulación del comprobante original",
      cantidad: 1,
      precio: Number(totalFallback || 0),
      subtotal: Number(totalFallback || 0),
      iva_pct: 0,
      iva_monto: 0,
      total: Number(totalFallback || 0),
    },
  ];
}

async function loadImageAsDataUrl(url) {
  const src = String(url || "").trim();
  if (!src) return null;

  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();

    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function buildQrImageDataUrl(qrUrl) {
  const value = String(qrUrl || "").trim();
  if (!value) return null;

  try {
    return await QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch {
    return null;
  }
}

function drawWrappedText(doc, text, x, y, maxWidth, lineHeight = 5, opts = {}) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  doc.text(lines, x, y, opts);
  return y + lines.length * lineHeight;
}

function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Main builder
========================================================= */
export async function buildNotaCreditoPdf(data = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 12;
  const contentW = pageW - margin * 2;

  const primary = [152, 27, 62];
  const accent = [255, 245, 247];
  const dark = [45, 45, 45];
  const muted = [110, 110, 110];
  const border = [220, 220, 220];

  const emisor = {
    nombre: safeStr(data?.emisor_nombre, "EMISOR"),
    domicilio: safeStr(data?.emisor_domicilio, "—"),
    cuit: safeStr(data?.cuit_emisor, "—"),
    iva: safeStr(data?.cond_iva_emisor, "—"),
    iibb: safeStr(data?.ingresos_brutos_emisor, "—"),
    inicioAct: formatDate(data?.fecha_inicio_actividades_emisor),
    logoUrl: String(data?.logo_url || "").trim(),
  };

  const cliente = data?.cliente_facturacion || {};
  const receptor = {
    razonSocial: safeStr(cliente?.razon_social, data?.labelCliente || "CLIENTE"),
    docTipo: safeStr(cliente?.doc_tipo, "—"),
    docNro: safeStr(cliente?.doc_nro ?? cliente?.cuit, "—"),
    cuit: safeStr(cliente?.cuit ?? cliente?.doc_nro, "—"),
    iva: safeStr(
      cliente?.condicion_iva ?? cliente?.cond_iva,
      "—"
    ),
    domicilio: safeStr(cliente?.domicilio, "—"),
  };

  const original = data?.factura_original || {};
  const items = normalizeItems(
    data?.items_facturacion,
    data?.total_ars ?? data?.monto ?? 0
  );

  const total = Number(data?.total_ars ?? data?.monto ?? data?.importe ?? 0) || 0;
  const subtotal = items.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
  const ivaTotal = items.reduce((acc, it) => acc + (Number(it.iva_monto) || 0), 0);

  const fileName = buildFileName(data);
  const tipoLabel = cbteTipoLabel(data?.cbte_tipo);

  const qrUrl = String(data?.qr_url || "").trim();
  const qrImageDataUrl = await buildQrImageDataUrl(qrUrl);

  /* =========================
     Header
  ========================= */
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setFillColor(...accent);
  doc.roundedRect(margin, 10, contentW, 32, 3, 3, "F");

  const logoDataUrl = await loadImageAsDataUrl(emisor.logoUrl);
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin + 4, 13, 18, 18);
    } catch {}
  }

  doc.setTextColor(...primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("NOTA DE CRÉDITO ELECTRÓNICA", margin + 26, 20);

  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text(tipoLabel, margin + 26, 27);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...primary);
  doc.text("NC", pageW - 26, 20, { align: "center" });

  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text(`Pto. Vta: ${safeStr(data?.pto_vta, "—")}`, pageW - 26, 27, {
    align: "center",
  });
  doc.text(`Comp. N°: ${safeStr(data?.cbte_nro, "—")}`, pageW - 26, 32, {
    align: "center",
  });

  let y = 50;

  /* =========================
     Box emisor / comprobante
  ========================= */
  doc.setDrawColor(...border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, 118, 34, 2, 2, "FD");
  doc.roundedRect(margin + 122, y, contentW - 122, 34, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("DATOS DEL EMISOR", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  doc.text(emisor.nombre, margin + 4, y + 12);
  doc.text(`CUIT: ${emisor.cuit}`, margin + 4, y + 17);
  doc.text(`IVA: ${emisor.iva}`, margin + 4, y + 22);
  doc.text(`Ingresos Brutos: ${emisor.iibb}`, margin + 4, y + 27);
  doc.text(`Inicio de actividades: ${emisor.inicioAct}`, margin + 4, y + 32);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text("DATOS FISCALES", margin + 126, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dark);
  doc.text(`Fecha: ${formatDate(data?.fecha_cbte_iso ?? data?.fecha_cbte)}`, margin + 126, y + 12);
  doc.text(`CAE: ${safeStr(data?.cae, "—")}`, margin + 126, y + 17);
  doc.text(`Vto. CAE: ${formatDate(data?.cae_vto)}`, margin + 126, y + 22);
  doc.text(`Resultado: ${safeStr(data?.resultado, "—")}`, margin + 126, y + 27);
  doc.text(`Moneda: PES`, margin + 126, y + 32);

  y += 42;

  /* =========================
     Receptor
  ========================= */
  doc.setFillColor(...accent);
  doc.roundedRect(margin, y, contentW, 30, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("RECEPTOR", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  doc.text(`Razón social: ${receptor.razonSocial}`, margin + 4, y + 12);
  doc.text(`Doc: ${receptor.docTipo} / ${receptor.docNro}`, margin + 4, y + 17);
  doc.text(`CUIT: ${receptor.cuit}`, margin + 4, y + 22);
  doc.text(`IVA: ${receptor.iva}`, margin + 90, y + 12);
  doc.text(`Domicilio: ${receptor.domicilio}`, margin + 90, y + 17);

  y += 38;

  /* =========================
     Comprobante asociado
  ========================= */
  doc.setDrawColor(...border);
  doc.roundedRect(margin, y, contentW, 24, 2, 2, "D");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("COMPROBANTE ORIGINAL ASOCIADO", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text(`Tipo: ${safeStr(original?.cbte_tipo, "—")}`, margin + 4, y + 13);
  doc.text(`Pto. Vta: ${safeStr(original?.pto_vta, "—")}`, margin + 45, y + 13);
  doc.text(`Número: ${safeStr(original?.cbte_nro, "—")}`, margin + 80, y + 13);
  doc.text(`CAE: ${safeStr(original?.cae, "—")}`, margin + 125, y + 13);
  doc.text(`Fecha: ${formatDate(original?.fecha_cbte)}`, margin + 4, y + 19);

  y += 32;

  /* =========================
     Motivo
  ========================= */
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y, contentW, 18, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.setFontSize(10);
  doc.text("MOTIVO DE EMISIÓN", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dark);
  doc.setFontSize(9);
  drawWrappedText(
    doc,
    safeStr(data?.observaciones, "Anulación del comprobante original"),
    margin + 4,
    y + 12,
    contentW - 8,
    4.5
  );

  y += 26;

  /* =========================
     Tabla items
  ========================= */
  const cols = {
    codigo: margin,
    descripcion: margin + 16,
    cantidad: margin + 108,
    precio: margin + 126,
    total: margin + 160,
  };

  doc.setFillColor(...primary);
  doc.rect(margin, y, contentW, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text("CÓD.", cols.codigo + 2, y + 5.5);
  doc.text("DESCRIPCIÓN", cols.descripcion + 2, y + 5.5);
  doc.text("CANT.", cols.cantidad + 2, y + 5.5);
  doc.text("P. UNIT.", cols.precio + 2, y + 5.5);
  doc.text("TOTAL", cols.total + 2, y + 5.5);

  y += 8;

  doc.setTextColor(...dark);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  items.forEach((it, idx) => {
    const rowH = 10;
    if (y + rowH > pageH - 60) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentW, rowH, "F");
    }

    doc.setDrawColor(...border);
    doc.rect(margin, y, contentW, rowH, "D");

    doc.text(safeStr(it.codigo, ""), cols.codigo + 2, y + 6);
    doc.text(
      doc.splitTextToSize(safeStr(it.descripcion, ""), 88),
      cols.descripcion + 2,
      y + 4.5
    );
    doc.text(String(it.cantidad), cols.cantidad + 2, y + 6);
    doc.text(formatMoney(it.precio), cols.precio + 2, y + 6);
    doc.text(formatMoney(it.total), cols.total + 2, y + 6);

    y += rowH;
  });

  y += 6;

  /* =========================
     Totales
  ========================= */
  const totalBoxW = 70;
  const totalBoxX = pageW - margin - totalBoxW;

  doc.setDrawColor(...border);
  doc.roundedRect(totalBoxX, y, totalBoxW, 24, 2, 2, "D");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text("Subtotal:", totalBoxX + 4, y + 7);
  doc.text(formatMoney(subtotal), totalBoxX + totalBoxW - 4, y + 7, { align: "right" });

  doc.text("IVA:", totalBoxX + 4, y + 13);
  doc.text(formatMoney(ivaTotal), totalBoxX + totalBoxW - 4, y + 13, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...primary);
  doc.text("TOTAL NC:", totalBoxX + 4, y + 20);
  doc.text(formatMoney(total), totalBoxX + totalBoxW - 4, y + 20, { align: "right" });

  y += 34;

  /* =========================
     Bloque QR real
  ========================= */
  const qrBlockH = 42;

  if (y + qrBlockH > pageH - 28) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(...border);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, contentW, qrBlockH, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text("VALIDACIÓN QR ARCA", margin + 4, y + 6);

  if (qrImageDataUrl) {
    try {
      doc.addImage(qrImageDataUrl, "PNG", margin + 4, y + 9, 28, 28);
    } catch {}
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text("No se pudo generar la imagen QR.", margin + 4, y + 18);
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...dark);
  doc.setFontSize(8.5);
  doc.text("Escaneá este código para validar el comprobante en ARCA.", margin + 38, y + 14);

  doc.setFont("helvetica", "bold");
  doc.text(`CAE: ${safeStr(data?.cae, "—")}`, margin + 38, y + 21);
  doc.text(`Comprobante: ${safeStr(data?.pto_vta, "—")}-${safeStr(data?.cbte_nro, "—")}`, margin + 38, y + 27);
  doc.text(`Fecha: ${formatDate(data?.fecha_cbte_iso ?? data?.fecha_cbte)}`, margin + 38, y + 33);

  y += qrBlockH + 6;

  /* =========================
     Footer
  ========================= */
  if (y > pageH - 28) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(...border);
  doc.line(margin, pageH - 22, pageW - margin, pageH - 22);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...primary);
  doc.text("Comprobante emitido electrónicamente por ARCA", margin, pageH - 16);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.setFontSize(8);
  doc.text(
    `CAE: ${safeStr(data?.cae, "—")}  |  Vto: ${formatDate(data?.cae_vto)}  |  Resultado: ${safeStr(
      data?.resultado,
      "—"
    )}`,
    margin,
    pageH - 11
  );

  const blob = doc.output("blob");

  return {
    doc,
    blob,
    fileName,
  };
}

export async function saveNotaCreditoPdf(data = {}, options = {}) {
  const { autoDownload = true } = options;
  const built = await buildNotaCreditoPdf(data);

  if (autoDownload) {
    triggerBlobDownload(built.blob, built.fileName);
  }

  return {
    pdfBlob: built.blob,
    pdfFilename: built.fileName,
  };
}