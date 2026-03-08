import jsPDF from "jspdf";

const FIX = {
  emisor_nombre: "BALTO",
  emisor_domicilio: "",
  cuit_emisor: "",
  cond_iva_emisor: "",
  inicio_actividades: "01/01/2025",
  letra: "C",
  tipoTxt: "FACTURA",
  cod_afip: "011",
  pto_vta_fijo: "00002",
  cond_iva_receptor_default: "Consumidor Final",
  cond_venta_default: "Contado / Transferencia Bancaria",
};

function sanitizePdfText(input) {
  let t = input == null ? "" : String(input);
  t = t.replace(/\s+/g, " ").trim();
  t = t
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->");

  let out = "";
  for (let i = 0; i < t.length; i++) {
    out += t.charCodeAt(i) <= 255 ? t[i] : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

function s(v) {
  return v == null ? "" : String(v);
}

function padLeft(v, len) {
  return s(v).padStart(len, "0");
}

function isYMD8(v) {
  const str = String(v || "");
  return str.length === 8 && /^\d{8}$/.test(str);
}

function ymdToHuman(ymd) {
  if (!ymd) return "";
  const str = String(ymd);

  if (isYMD8(str)) {
    return `${str.slice(6, 8)}/${str.slice(4, 6)}/${str.slice(0, 4)}`;
  }

  if (str.length >= 10 && str.includes("-")) {
    const [y, m, d] = str.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  return str;
}

function numEs(v, dec = 2) {
  const n = Number(v);
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function moneyEs(v) {
  return numEs(v, 2);
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const t = String(v || "").toLowerCase().trim();
  return t === "1" || t === "true" || t === "yes" || t === "si";
}

function firstFinite(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function rect(doc, x, y, w, h, lw = 0.55) {
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}

function line(doc, x1, y1, x2, y2, lw = 0.45) {
  doc.setLineWidth(lw);
  doc.line(x1, y1, x2, y2);
}

function fillRect(doc, x, y, w, h, gray = 0.84) {
  const g = Math.max(0, Math.min(1, gray));
  doc.setFillColor(Math.round(g * 255));
  doc.rect(x, y, w, h, "F");
}

function set(doc, font = "helvetica", style = "normal", size = 10) {
  doc.setFont(font, style);
  doc.setFontSize(size);
}

function text(doc, str, x, y, opt) {
  doc.text(sanitizePdfText(str), x, y, opt);
}

function clampToWidth(doc, str, maxW) {
  const t = sanitizePdfText(str);
  if (!t) return "";
  if (doc.getTextWidth(t) <= maxW) return t;

  let out = t;
  while (out.length > 0 && doc.getTextWidth(out + "...") > maxW) {
    out = out.slice(0, -1);
  }
  return out.length ? `${out}...` : "";
}

function wrapByWidth(doc, str, maxW) {
  const t = sanitizePdfText(str);
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

function computeItems(fact, data, totalArs) {
  const total = safeNumber(
    totalArs,
    safeNumber(fact?.importe ?? data?.monto ?? data?.importe ?? 0, 0)
  );

  const fromModal = Array.isArray(data?.items_facturacion)
    ? data.items_facturacion
    : [];

  const modalNorm = fromModal
    .map((it, idx) => {
      const descRaw =
        it?.descripcion ??
        it?.detalle ??
        it?.nombre ??
        it?.label ??
        it?.titulo ??
        it?.plan ??
        "";

      const descBase = sanitizePdfText(s(descRaw).trim());
      if (!descBase) return null;

      const ars = firstFinite(it?.ars, it?.ars_total, it?.subtotal_ars);
      const fallbackArs = firstFinite(
        it?.subtotal,
        it?.precio_unitario,
        it?.precio,
        it?.importe,
        it?.monto
      );

      const valueArs = ars != null ? ars : fallbackArs != null ? fallbackArs : 0;

      return {
        codigo: String(idx + 1),
        descripcion: descBase,
        cantidad: 1,
        unidad: "serv.",
        precio: valueArs,
        bonifPct: 0,
        impBonif: 0,
        subtotal: valueArs,
      };
    })
    .filter(Boolean);

  if (modalNorm.length) {
    const sum = modalNorm.reduce((acc, it) => acc + safeNumber(it.subtotal, 0), 0);
    const diff = total - sum;

    if (Number.isFinite(diff) && Math.abs(diff) >= 0.01) {
      const last = modalNorm[modalNorm.length - 1];
      const newSub = safeNumber(last.subtotal, 0) + diff;
      last.subtotal = newSub;
      last.precio = newSub;
    }

    return modalNorm;
  }

  const desc = sanitizePdfText(
    s(data?.detalle || data?.labelSistema || data?.sistema || "Servicio")
  );

  return [
    {
      codigo: "1",
      descripcion: desc,
      cantidad: 1,
      unidad: "serv.",
      precio: total,
      bonifPct: 0,
      impBonif: 0,
      subtotal: total,
    },
  ];
}

function getMeta(fact) {
  const ptoVta = padLeft(fact?.pto_vta ?? 2, 5);
  const cbteNro = padLeft(fact?.cbte_nro ?? fact?.cbte_numero ?? "", 8);
  const cbteTipo = padLeft(fact?.cbte_tipo ?? 11, 3);
  const fechaEmision = ymdToHuman(fact?.fecha_cbte || fact?.fecha_emision || "");
  const remito = cbteNro ? `${ptoVta}-${cbteNro}` : "";

  return {
    letra: FIX.letra,
    tipoTxt: FIX.tipoTxt,
    cod: FIX.cod_afip,
    cbteTipo,
    ptoVta,
    cbteNro,
    fechaEmision,
    cae: s(fact?.cae || ""),
    caeVto: ymdToHuman(fact?.cae_vto || fact?.fecha_vto_cae || ""),
    qrUrl: s(fact?.qr_url || fact?.qr || ""),
    remito,
  };
}

function getEmisor(data) {
  return {
    razon: data?.emisor_nombre || FIX.emisor_nombre,
    domComercial: data?.emisor_domicilio || FIX.emisor_domicilio,
    cuit: data?.cuit_emisor || FIX.cuit_emisor,
    condIva: data?.cond_iva_emisor || FIX.cond_iva_emisor,
    iibb: data?.cuit_emisor || FIX.cuit_emisor,
    inicioAct: data?.inicio_actividades || FIX.inicio_actividades,
  };
}

function getReceptor(fact, data) {
  const cf = data?.cliente_facturacion || null;

  const docNro = s(
    fact?.doc_nro ?? cf?.doc_nro ?? data?.doc_nro ?? ""
  ).replace(/\D/g, "");

  const nroParaCaja = docNro || s(fact?.receptor_cuit || data?.receptor_cuit || "");

  return {
    cuit: sanitizePdfText(s(nroParaCaja || "")),
    razon: sanitizePdfText(
      s(
        cf?.razon_social ||
          fact?.receptor_nombre ||
          data?.receptor_nombre ||
          data?.labelCliente ||
          data?.cliente ||
          ""
      )
    ),
    dom: sanitizePdfText(
      s(cf?.domicilio || fact?.receptor_domicilio || data?.cliente_domicilio || "")
    ),
    condIva: sanitizePdfText(
      s(
        cf?.cond_iva ||
          fact?.cond_iva_receptor ||
          data?.cond_iva_receptor ||
          FIX.cond_iva_receptor_default
      )
    ),
    condVenta: sanitizePdfText(
      s(
        fact?.condicion_venta ||
          cf?.cond_venta ||
          data?.condicion_venta ||
          FIX.cond_venta_default
      )
    ),
  };
}

function getPeriodo(fact, data) {
  const pick = (...vals) => {
    for (const v of vals) {
      const t = s(v).trim();
      if (t) return t;
    }
    return "";
  };

  const desdeRaw = pick(
    data?.periodo_desde,
    data?.periodo_desde_iso,
    fact?.periodo_desde,
    fact?.FchServDesde,
    fact?.fch_serv_desde
  );

  const hastaRaw = pick(
    data?.periodo_hasta,
    data?.periodo_hasta_iso,
    fact?.periodo_hasta,
    fact?.FchServHasta,
    fact?.fch_serv_hasta
  );

  const vtoRaw = pick(
    data?.vto_pago,
    data?.vto_pago_iso,
    fact?.vto_pago,
    fact?.FchVtoPago,
    fact?.fch_vto_pago,
    fact?.fecha_vto_pago
  );

  return {
    desde: ymdToHuman(desdeRaw),
    hasta: ymdToHuman(hastaRaw),
    vtoPago: ymdToHuman(vtoRaw),
  };
}

async function drawBottomAnchored(doc, ctx, layout) {
  const { fact, data, forceTestAmount, testAmount } = ctx;
  const { W, H, B, innerW } = layout;

  const meta = getMeta(fact);
  const totalReal = safeNumber(fact?.importe ?? data?.monto ?? data?.importe ?? 0, 0);
  const totalTest = safeNumber(testAmount, 1000);
  const total = toBool(forceTestAmount) ? totalTest : totalReal;

  const footerH = 145;
  const gap = 18;
  const totH = 78;
  const footY = H - B - footerH;
  const totY = footY - gap - totH;

  rect(doc, B, totY, innerW, totH, 0.55);

  const padR = 14;
  const xVal = B + innerW - padR;
  const xLbl = xVal - 132;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Subtotal: $", xLbl, totY + 24, { align: "right" });
  text(doc, moneyEs(total), xVal, totY + 24, { align: "right" });

  text(doc, "Importe Otros Tributos: $", xLbl, totY + 44, { align: "right" });
  text(doc, moneyEs(0), xVal, totY + 44, { align: "right" });

  text(doc, "Importe Total: $", xLbl, totY + 64, { align: "right" });
  text(doc, moneyEs(total), xVal, totY + 64, { align: "right" });

  const qrSize = 92;
  const qrX = B + 10;
  const qrY = footY + 20;

  // Sin dependencia qrcode: si no hay imagen QR, deja marco vacío
  rect(doc, qrX, qrY, qrSize, qrSize, 0.4);

  const arcaX = qrX + qrSize + 22;

  set(doc, "helvetica", "bold", 20);
  text(doc, "ARCA", arcaX, footY + 58);
  set(doc, "helvetica", "normal", 6);
  text(doc, "AGENCIA DE RECAUDACION", arcaX, footY + 66);
  text(doc, "Y CONTROL ADUANANERO", arcaX, footY + 73);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Comprobante Autorizado", arcaX, footY + 94);

  set(doc, "helvetica", "italic", 6.7);
  text(
    doc,
    "Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación",
    arcaX,
    footY + 110
  );

  set(doc, "helvetica", "bold", 9);
  text(doc, "Pag. 1/1", W / 2 - 40, footY + 58, { align: "center" });

  set(doc, "helvetica", "bold", 9);
  text(doc, "CAE N°:", W / 2 + 10, footY + 70, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.cae, W / 2 + 55, footY + 70, { align: "left" });

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Vto. de CAE:", W / 2 + 10, footY + 82, { align: "left" });
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.caeVto, W / 2 + 135, footY + 82, { align: "left" });

  set(doc, "courier", "normal", 9);
  text(doc, meta.cae, W - B - 10, H - B - 6, { align: "right" });

  return { totY, footY, total };
}

async function drawPage(doc, pageName, ctx) {
  const { fact, data, forceTestAmount, testAmount } = ctx;

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const B = 10;
  const innerW = W - 2 * B;

  rect(doc, B, B, innerW, H - 2 * B, 0.75);

  const bandH = 28;
  set(doc, "helvetica", "bold", 14);
  text(doc, pageName.toUpperCase(), W / 2, B + 19, { align: "center" });
  line(doc, B, B + bandH, W - B, B + bandH, 0.55);

  const meta = getMeta(fact);
  const em = getEmisor(data);
  const rc = getReceptor(fact, data);
  const per = getPeriodo(fact, data);

  const headerY = B + bandH;
  const headerH = 132;
  rect(doc, B, headerY, innerW, headerH, 0.55);

  const splitX = B + innerW * 0.52;

  const boxW = 50;
  const boxH = 50;
  const boxX = splitX - boxW / 2;
  const boxY = headerY + 0;

  const gap = 1.2;
  line(doc, splitX, headerY, splitX, boxY - gap, 0.55);
  line(doc, splitX, boxY + boxH + gap, splitX, headerY + headerH, 0.55);
  rect(doc, boxX, boxY, boxW, boxH, 0.55);

  set(doc, "helvetica", "bold", 30);
  text(doc, meta.letra, boxX + boxW / 2, boxY + 26, { align: "center" });
  set(doc, "helvetica", "bold", 9);
  text(doc, `COD. ${meta.cod}`, boxX + boxW / 2, boxY + 34, { align: "center" });

  const leftX = B + 12;
  const logoY = headerY + 4;

  // Sin logo por ahora
  set(doc, "helvetica", "bold", 22);
  text(doc, "BALTO", leftX, logoY + 25);

  const lx = leftX;
  const ly = headerY + 72;

  set(doc, "helvetica", "bold", 9);
  text(doc, "Razón Social:", lx, ly);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.razon, splitX - lx - 12), lx + 78, ly);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Domicilio Comercial:", lx, ly + 24);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.domComercial, splitX - lx - 12), lx + 118, ly + 24);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición frente al IVA:", lx, ly + 48);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, em.condIva, splitX - lx - 12), lx + 130, ly + 48);

  const rx = splitX + 1;
  set(doc, "helvetica", "bold", 20);
  text(doc, "FACTURA", rx + 30, headerY + 48);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Punto de Venta:", rx + 40, headerY + 65);
  text(doc, "Comp. Nro:", rx + 168, headerY + 65);

  set(doc, "helvetica", "bold", 9);
  text(doc, meta.ptoVta, rx + 140, headerY + 65, { align: "left" });
  text(doc, meta.cbteNro, rx + 230, headerY + 65, { align: "left" });

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Emisión:", rx + 40, headerY + 80);
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.fechaEmision, rx + 185, headerY + 80);

  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT:", rx + 40, headerY + 102);
  set(doc, "helvetica", "normal", 9);
  text(doc, em.cuit, rx + 185, headerY + 102);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Ingresos Brutos:", rx + 40, headerY + 115);
  set(doc, "helvetica", "normal", 9);
  text(doc, em.iibb, rx + 185, headerY + 115);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Fecha de Inicio de Actividades:", rx + 40, headerY + 128);
  set(doc, "helvetica", "normal", 9);
  text(doc, s(em.inicioAct), W - B - 18, headerY + 128, { align: "right" });

  const periodY = headerY + headerH;
  const periodH = 30;
  rect(doc, B, periodY, innerW, periodH, 0.55);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Período Facturado Desde:", B + 10, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.desde, B + 145, periodY + 20);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Hasta:", B + 240, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.hasta, B + 275, periodY + 20);

  set(doc, "helvetica", "bold", 10);
  text(doc, "Fecha de Vto. para el pago:", B + 355, periodY + 20);
  set(doc, "helvetica", "normal", 10);
  text(doc, per.vtoPago, B + 545, periodY + 20, { align: "right" });

  const recY = periodY + periodH;
  const recH = 78;
  rect(doc, B, recY, innerW, recH, 0.55);

  const recLx = B + 10;
  set(doc, "helvetica", "bold", 9);
  text(doc, "CUIT / DOC:", recLx, recY + 18);
  set(doc, "helvetica", "normal", 9);
  text(doc, rc.cuit, recLx + 58, recY + 18);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición frente al IVA:", recLx, recY + 46);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condIva, 190), recLx + 110, recY + 46);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Condición de venta:", recLx, recY + 62);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.condVenta, 220), recLx + 90, recY + 62);

  const recRx = B + innerW * 0.46;
  set(doc, "helvetica", "bold", 9);
  text(doc, "Apellido y Nombre / Razón Social:", 150, recY + 18);

  set(doc, "helvetica", "normal", 9);
  const razonLines = wrapByWidth(doc, rc.razon, innerW - (recRx - B) - 12);
  text(doc, razonLines[0] || "", recRx + 30, recY + 18);
  if (razonLines[1]) text(doc, razonLines[1], recRx + 185, recY + 30);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Domicilio:", recRx + 0, recY + 46);
  set(doc, "helvetica", "normal", 9);
  text(doc, clampToWidth(doc, rc.dom, innerW - (recRx - B) - 12), recRx + 45, recY + 46);

  set(doc, "helvetica", "bold", 9);
  text(doc, "Remito:", recRx + 0, recY + 62);
  set(doc, "helvetica", "normal", 9);
  text(doc, meta.remito, recRx + 45, recY + 62);

  const layout = { W, H, B, innerW };
  const bottom = await drawBottomAnchored(
    doc,
    { fact, data, forceTestAmount, testAmount },
    layout
  );

  const tblY = recY + recH + 14;
  const tblBottomLimit = bottom.totY - 18;
  const tblH = Math.max(170, tblBottomLimit - tblY);

  rect(doc, B, tblY, innerW, tblH, 0.55);

  const headerRowH = 22;
  fillRect(doc, B, tblY, innerW, headerRowH, 0.84);
  rect(doc, B, tblY, innerW, headerRowH, 0.55);

  const left = B;
  const right = B + innerW;

  const wCodigo = 50;
  const wCant = 70;
  const wUM = 50;
  const wPU = 60;
  const wBonif = 40;
  const wImpBon = 80;
  const wSubt = 52;
  const wProd = Math.max(
    10,
    innerW - (wCodigo + wCant + wUM + wPU + wBonif + wImpBon + wSubt)
  );

  const x0 = left;
  const x1 = x0 + wCodigo;
  const x2 = x1 + wProd;
  const x3 = x2 + wCant;
  const x4 = x3 + wUM;
  const x5 = x4 + wPU;
  const x6 = x5 + wBonif;
  const x7 = x6 + wImpBon;
  const x8 = right;

  const padL = 8;
  const padR = 8;

  line(doc, x1, tblY, x1, tblY + tblH, 0.45);
  line(doc, x2, tblY, x2, tblY + tblH, 0.45);
  line(doc, x3, tblY, x3, tblY + tblH, 0.45);
  line(doc, x4, tblY, x4, tblY + tblH, 0.45);
  line(doc, x5, tblY, x5, tblY + tblH, 0.45);
  line(doc, x6, tblY, x6, tblY + tblH, 0.45);
  line(doc, x7, tblY, x7, tblY + tblH, 0.45);

  set(doc, "helvetica", "bold", 8.6);
  text(doc, "Código", x0 + padL, tblY + 15);
  text(doc, "Producto / Servicio", x1 + padL, tblY + 15);
  text(doc, "Cantidad", x3 - padR, tblY + 15, { align: "right" });
  text(doc, "U. Medida", x4 - padR, tblY + 15, { align: "right" });
  text(doc, "Precio Unit.", x5 - padR, tblY + 15, { align: "right" });
  text(doc, "% Bonif", x6 - padR, tblY + 15, { align: "right" });
  text(doc, "Imp. Bonif.", x7 - padR, tblY + 15, { align: "right" });
  text(doc, "Subtotal", x8 - padR, tblY + 15, { align: "right" });

  const totalReal = safeNumber(fact?.importe ?? data?.monto ?? data?.importe ?? 0, 0);
  const totalTest = safeNumber(testAmount, 1000);
  const total = toBool(forceTestAmount) ? totalTest : totalReal;

  const items = computeItems({ ...fact, importe: total }, data, total);

  set(doc, "helvetica", "normal", 9);
  let y = tblY + headerRowH + 16;
  const maxBodyY = tblY + tblH - 8;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const descMaxW = (x2 - padR) - (x1 + padL);
    const descLines = wrapByWidth(doc, it.descripcion, Math.max(20, descMaxW));

    const lh = 11;
    const blockH = Math.max(14, descLines.length * lh);

    if (y + blockH > maxBodyY) break;

    text(doc, s(it.codigo || String(i + 1)), x0 + padL, y);

    for (let li = 0; li < descLines.length; li++) {
      text(doc, descLines[li], x1 + padL, y + li * lh);
    }

    text(doc, numEs(it.cantidad ?? 1, 2), x3 - padR, y, { align: "right" });
    text(doc, s(it.unidad || "serv."), x4 - padR, y, { align: "right" });
    text(doc, moneyEs(it.precio || 0), x5 - padR, y, { align: "right" });
    text(doc, numEs(it.bonifPct || 0, 2), x6 - padR, y, { align: "right" });
    text(doc, moneyEs(it.impBonif || 0), x7 - padR, y, { align: "right" });
    text(doc, moneyEs(it.subtotal || 0), x8 - padR, y, { align: "right" });

    y += blockH + 4;
  }
}

export async function buildBaltoInvoicePdf({
  fact,
  data,
  forceTestAmount = false,
  testAmount = 1000,
} = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  await drawPage(doc, "ORIGINAL", {
    fact,
    data,
    forceTestAmount,
    testAmount,
  });

  doc.addPage();

  await drawPage(doc, "DUPLICADO", {
    fact,
    data,
    forceTestAmount,
    testAmount,
  });

  doc.addPage();

  await drawPage(doc, "TRIPLICADO", {
    fact,
    data,
    forceTestAmount,
    testAmount,
  });

  return doc;
}

export async function saveBaltoInvoicePdf({
  fact,
  data,
  forceTestAmount = false,
  testAmount = 1000,
  download = true,
  filename: filenameIn,
} = {}) {
  const doc = await buildBaltoInvoicePdf({
    fact,
    data,
    forceTestAmount,
    testAmount,
  });

  const blob = doc.output("blob");

  const safe = (x) =>
    sanitizePdfText(String(x || ""))
      .replace(/[^\w\-]+/g, "_")
      .slice(0, 60);

  const pv = String(fact?.pto_vta ?? FIX.pto_vta_fijo).padStart(5, "0");
  const nro = String(fact?.cbte_nro ?? "0").padStart(8, "0");
  const cli = safe(
    data?.cliente_facturacion?.razon_social ||
      data?.labelCliente ||
      data?.cliente ||
      "CLIENTE"
  );
  const sys = safe(data?.labelSistema || data?.sistema || "SISTEMA");

  const filename =
    filenameIn || `FACTURA_${pv}-${nro}_${cli}_${sys}.pdf`;

  if (download) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return { blob, filename };
}