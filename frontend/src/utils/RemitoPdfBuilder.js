// src/utils/RemitoPdfBuilder.js

import jsPDF from "jspdf";

function sanitizePdfText(input) {
  let t = input == null ? "" : String(input);
  t = t.replace(/\s+/g, " ").trim();
  t = t
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/✓/g, "OK");

  let out = "";
  for (let i = 0; i < t.length; i += 1) {
    out += t.charCodeAt(i) <= 255 ? t[i] : " ";
  }

  return out.replace(/\s+/g, " ").trim();
}

function s(v) {
  return v == null ? "" : String(v);
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numEs(v, dec = 2) {
  const n = safeNumber(v, 0);
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function ymdToHuman(value) {
  const str = String(value || "").trim();
  if (!str) return "";

  if (/^\d{8}$/.test(str)) {
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  return str;
}

function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function safeFilePart(value, fallback = "REMITO") {
  const clean = sanitizePdfText(String(value || fallback))
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return clean || fallback;
}

function set(doc, font = "helvetica", style = "normal", size = 10) {
  doc.setFont(font, style);
  doc.setFontSize(size);
}

function text(doc, value, x, y, opt) {
  doc.text(sanitizePdfText(value), x, y, opt);
}

function rect(doc, x, y, w, h, lw = 0.55) {
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}

function line(doc, x1, y1, x2, y2, lw = 0.45) {
  doc.setLineWidth(lw);
  doc.line(x1, y1, x2, y2);
}

function fillRect(doc, x, y, w, h, gray = 0.92) {
  const g = Math.max(0, Math.min(1, gray));
  doc.setFillColor(Math.round(g * 255));
  doc.rect(x, y, w, h, "F");
}

function clampToWidth(doc, value, maxW) {
  const t = sanitizePdfText(value);
  if (!t) return "";
  if (doc.getTextWidth(t) <= maxW) return t;

  let out = t;
  while (out.length > 0 && doc.getTextWidth(`${out}...`) > maxW) {
    out = out.slice(0, -1);
  }

  return out ? `${out}...` : "";
}

function wrapByWidth(doc, value, maxW) {
  const t = sanitizePdfText(value);
  if (!t) return [];

  const words = t.split(" ");
  const lines = [];
  let cur = "";

  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;

    if (doc.getTextWidth(test) <= maxW) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }

  if (cur) lines.push(cur);
  return lines;
}

function normalizeItems(data) {
  const items = Array.isArray(data?.items_facturacion)
    ? data.items_facturacion
    : Array.isArray(data?.items)
    ? data.items
    : [];

  return items
    .map((it, index) => {
      const descripcion = sanitizePdfText(
        it?.descripcion || it?.detalle || it?.nombre || it?.producto || `Item ${index + 1}`
      );
      const cantidad = safeNumber(it?.cantidad ?? it?.qty ?? it?.unidades, 0);
      const unidad = sanitizePdfText(it?.unidad || it?.um || "u");
      const codigo = sanitizePdfText(it?.codigo || it?.sku || it?.id_detalle || it?.id || String(index + 1));

      return {
        codigo: codigo || String(index + 1),
        descripcion: descripcion || `Item ${index + 1}`,
        cantidad,
        unidad: unidad || "u",
      };
    })
    .filter((it) => it.descripcion && safeNumber(it.cantidad, 0) !== 0);
}

function getCliente(data) {
  const cf = data?.cliente_facturacion || {};
  return {
    razon_social: sanitizePdfText(cf.razon_social || data?.labelCliente || data?.cliente || "Cliente"),
    doc_nro: sanitizePdfText(cf.doc_nro || cf.cuit || cf.dni || ""),
    cond_iva: sanitizePdfText(cf.cond_iva || cf.condicion_iva || ""),
    domicilio: sanitizePdfText(cf.domicilio || ""),
  };
}

function getEmisor(data) {
  return {
    nombre: sanitizePdfText(data?.emisor_nombre || data?.razon_social_emisor || "BALTO"),
    domicilio: sanitizePdfText(data?.emisor_domicilio || ""),
    cuit: sanitizePdfText(data?.cuit_emisor || ""),
    cond_iva: sanitizePdfText(data?.cond_iva_emisor || data?.condicion_iva_emisor || ""),
  };
}

function getMovimientoText(data) {
  const ids = Array.isArray(data?.ids_movimiento)
    ? data.ids_movimiento.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
    : [];
  if (ids.length > 1) return `Movimientos #${ids.join(", #")}`;
  if (ids.length === 1) return `Movimiento #${ids[0]}`;
  const id = Number(data?.id_movimiento || 0);
  return id > 0 ? `Movimiento #${id}` : "Movimiento";
}

function header(doc, data, pageInfo = "") {
  const emisor = getEmisor(data);
  const cliente = getCliente(data);
  const fecha = ymdToHuman(data?.fecha_cbte_iso || data?.fecha_cbte || data?.fecha || new Date().toISOString().slice(0, 10));
  const movimientoTxt = getMovimientoText(data);

  doc.setDrawColor(35);
  doc.setTextColor(25);

  rect(doc, 12, 12, 186, 35, 0.7);
  line(doc, 122, 12, 122, 47, 0.55);

  set(doc, "helvetica", "bold", 14);
  text(doc, emisor.nombre || "BALTO", 16, 22);
  set(doc, "helvetica", "normal", 8.2);
  text(doc, emisor.domicilio ? `Domicilio: ${emisor.domicilio}` : "", 16, 29);
  text(doc, emisor.cuit ? `CUIT: ${emisor.cuit}` : "", 16, 35);
  text(doc, emisor.cond_iva ? `Condicion IVA: ${emisor.cond_iva}` : "", 16, 41);

  set(doc, "helvetica", "bold", 22);
  text(doc, "REMITO", 160, 24, { align: "center" });
  set(doc, "helvetica", "normal", 9);
  text(doc, "Documento no fiscal", 160, 31, { align: "center" });
  text(doc, movimientoTxt, 160, 38, { align: "center" });
  text(doc, `Fecha: ${fecha}`, 160, 44, { align: "center" });

  rect(doc, 12, 52, 186, 31, 0.55);
  fillRect(doc, 12, 52, 186, 7, 0.9);
  set(doc, "helvetica", "bold", 9);
  text(doc, "DATOS DEL CLIENTE / DESTINATARIO", 16, 57);
  set(doc, "helvetica", "normal", 8.4);
  text(doc, `Cliente: ${cliente.razon_social || "Consumidor final"}`, 16, 66);
  text(doc, cliente.doc_nro ? `Documento/CUIT: ${cliente.doc_nro}` : "Documento/CUIT: -", 16, 73);
  text(doc, cliente.cond_iva ? `Condicion IVA: ${cliente.cond_iva}` : "Condicion IVA: -", 112, 73);
  text(doc, cliente.domicilio ? `Domicilio: ${cliente.domicilio}` : "Domicilio: -", 16, 80);

  if (pageInfo) {
    set(doc, "helvetica", "normal", 8);
    text(doc, pageInfo, 198, 287, { align: "right" });
  }
}

function drawTableHeader(doc, y) {
  fillRect(doc, 12, y, 186, 8, 0.86);
  rect(doc, 12, y, 186, 8, 0.5);
  set(doc, "helvetica", "bold", 8.2);
  text(doc, "COD.", 15, y + 5.5);
  text(doc, "DESCRIPCION", 37, y + 5.5);
  text(doc, "CANT.", 168, y + 5.5, { align: "right" });
  text(doc, "UN.", 192, y + 5.5, { align: "right" });

  line(doc, 33, y, 33, y + 8, 0.35);
  line(doc, 160, y, 160, y + 8, 0.35);
  line(doc, 176, y, 176, y + 8, 0.35);
}

function drawFooter(doc, data) {
  const obs = sanitizePdfText(
    data?.observaciones_remito ||
      "Se deja constancia de la entrega de los productos detallados. Este remito no incluye precios ni importes."
  );

  rect(doc, 12, 247, 186, 20, 0.55);
  set(doc, "helvetica", "bold", 8.4);
  text(doc, "OBSERVACIONES", 16, 253);
  set(doc, "helvetica", "normal", 7.8);
  const lines = wrapByWidth(doc, obs, 176).slice(0, 2);
  lines.forEach((ln, i) => text(doc, ln, 16, 260 + i * 4));

  line(doc, 28, 280, 84, 280, 0.45);
  line(doc, 126, 280, 182, 280, 0.45);
  set(doc, "helvetica", "normal", 8);
  text(doc, "Entregado por", 56, 285, { align: "center" });
  text(doc, "Recibido por", 154, 285, { align: "center" });
}

export function buildRemitoPdf({ data = {} } = {}) {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const items = normalizeItems(data);

  let page = 1;
  header(doc, data, `Pagina ${page}`);
  drawTableHeader(doc, 90);

  let y = 102;
  const bottomLimit = 239;

  const drawItem = (it, index) => {
    set(doc, "helvetica", "normal", 8.2);
    const descLines = wrapByWidth(doc, it.descripcion, 118).slice(0, 3);
    const rowH = Math.max(8, 4.2 * Math.max(descLines.length, 1) + 3);

    if (y + rowH > bottomLimit) {
      drawFooter(doc, data);
      doc.addPage();
      page += 1;
      header(doc, data, `Pagina ${page}`);
      drawTableHeader(doc, 90);
      y = 102;
    }

    rect(doc, 12, y - 6, 186, rowH, 0.28);
    line(doc, 33, y - 6, 33, y - 6 + rowH, 0.25);
    line(doc, 160, y - 6, 160, y - 6 + rowH, 0.25);
    line(doc, 176, y - 6, 176, y - 6 + rowH, 0.25);

    text(doc, clampToWidth(doc, it.codigo || String(index + 1), 15), 15, y);
    descLines.forEach((ln, i) => text(doc, ln, 37, y + i * 4.2));
    text(doc, numEs(it.cantidad, 2), 168, y, { align: "right" });
    text(doc, clampToWidth(doc, it.unidad || "u", 14), 192, y, { align: "right" });

    y += rowH;
  };

  if (!items.length) {
    rect(doc, 12, 96, 186, 18, 0.35);
    set(doc, "helvetica", "normal", 9);
    text(doc, "No hay productos cargados para este remito.", 105, 107, { align: "center" });
  } else {
    items.forEach(drawItem);
  }

  drawFooter(doc, data);
  return doc;
}

export async function saveRemitoPdf({ data = {}, download = true, filename = "" } = {}) {
  const doc = buildRemitoPdf({ data });
  const cliente = data?.cliente_facturacion?.razon_social || data?.labelCliente || "CLIENTE";
  const finalName =
    filename || `remito_${safeFilePart(cliente, "CLIENTE")}_${nowStamp()}.pdf`;

  if (download) {
    doc.save(finalName);
  }

  const blob = doc.output("blob");
  return { doc, blob, filename: finalName, data };
}

export default saveRemitoPdf;
