// src/utils/ordenPagoTemplate.js

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function safe(v) {
  const s = String(v ?? "").trim();
  return s ? esc(s) : "-";
}
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}
function fechaDMY(d = new Date()) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

export function buildOrdenPagoHTML({
  proveedorNombre,
  proveedorId,
  medioPagoNombre,
  total,
  seleccion = [],
  fechaPago = new Date(),
  extra = {},
} = {}) {
  const items = Array.isArray(seleccion) ? seleccion : [];

  const rows = items
    .map((r) => {
      const idMov = Number(r?.id_movimiento || 0) || "-";
      const fecha = safe(r?.fecha);
      const desc = safe(r?.detalle ?? r?.descripcion ?? r?.concepto);
      const monto = Number(r?.monto_total ?? r?.total ?? 0) || 0;

      return `
        <tr>
          <td class="td">${safe(idMov)}</td>
          <td class="td">${fecha}</td>
          <td class="td">${desc}</td>
          <td class="td td-right">${esc(moneyARS(monto))}</td>
        </tr>
      `;
    })
    .join("");

  const nowStr = fechaDMY(fechaPago instanceof Date ? fechaPago : new Date());
  const nota = String(extra?.nota ?? "").trim();

  return `
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Orden de Pago</title>

<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    background: #fff;
    color: #111;
  }

  /* ✅ “Page” para controlar márgenes simétricos en PDF */
  .page {
    max-width: 210mm;
    margin: 0 auto;
    padding: 18px; /* vista normal */
  }

  .wrap {
    width: 100%;
    max-width: 780px;
    margin: 0 auto;
    border: 1px solid #ddd;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
  }

  .head {
    padding: 14px 16px;
    background: #f6f6f6;
    border-bottom: 1px solid #ddd;
  }

  .title {
    display:flex;
    align-items:baseline;
    justify-content: space-between;
    gap:10px;
    flex-wrap: wrap;
  }
  .title h1 { margin:0; font-size: 16px; letter-spacing: .2px; }

  .pill {
    display:inline-block;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid #ccc;
    background:#fff;
    font-size: 11px;
    white-space: nowrap;
  }

  .grid {
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 12px 16px;
  }

  .box {
    border: 1px solid #e2e2e2;
    border-radius: 10px;
    padding: 10px;
    background: #fff;
    min-width: 0;
  }

  .k { font-size: 10px; color:#666; margin-bottom: 4px; }
  .v { font-size: 13px; font-weight: 600; }
  .small { font-size: 10px; color:#666; }

  .contentPad { padding: 0 16px 16px 16px; }

  .tableBox {
    padding:0;
    overflow:hidden;
    border: 1px solid #e2e2e2;
    border-radius: 10px;
    background: #fff;
  }

  table { width: 100%; border-collapse: collapse; }
  th {
    text-align:left;
    font-size: 11px;
    padding: 6px;
    border-bottom: 2px solid #ccc;
    background: #fafafa;
  }

  .td {
    padding: 6px;
    border-bottom: 1px solid #ddd;
    font-size: 11px;
    vertical-align: top;
    word-break: break-word;
  }
  .td-right { text-align: right; }

  .foot {
    padding: 12px 16px;
    border-top: 1px solid #ddd;
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:10px;
    flex-wrap: wrap;
  }
  .tot { font-size: 14px; font-weight: 700; }

  @media (max-width: 560px) {
    .grid { grid-template-columns: 1fr; }
  }

  /* ✅ FIX DEFINITIVO: impresión/PDF SIN corrimiento */
  @media print {
    @page { size: A4; margin: 0; } /* ✅ mata márgenes raros */

    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
      height: 297mm !important;
      background: #fff !important;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 10mm;            /* ✅ margen real simétrico */
      margin: 0 auto !important;
    }

    .wrap {
      width: 100% !important;
      max-width: none !important;
      margin: 0 auto !important;
      border-radius: 0;
    }
  }
</style>
</head>

<body>
  <div class="page">
    <div class="wrap">
      <div class="head">
        <div class="title">
          <h1>COMPROBANTE · ORDEN DE PAGO</h1>
          <span class="pill">Fecha: ${safe(nowStr)}</span>
        </div>
      </div>

      <div class="grid">
        <div class="box">
          <div class="k">Proveedor</div>
          <div class="v">${safe(proveedorNombre)}</div>
          <div class="small">ID: ${safe(proveedorId)}</div>
        </div>

        <div class="box">
          <div class="k">Medio de pago</div>
          <div class="v">${safe(medioPagoNombre)}</div>
          <div class="small">${nota ? safe(nota) : "&nbsp;"}</div>
        </div>
      </div>

      <div class="contentPad">
        <div class="tableBox">
          <table>
            <thead>
              <tr>
                <th style="width:90px;">Mov.</th>
                <th style="width:120px;">Fecha</th>
                <th>Descripción</th>
                <th style="width:140px; text-align:right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows ||
                `<tr><td class="td" colspan="4" style="padding:10px;">Sin items</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="foot">
        <div class="small">Comprobante generado automáticamente.</div>
        <div class="tot">TOTAL: ${esc(moneyARS(total))}</div>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}