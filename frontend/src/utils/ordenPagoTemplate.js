// src/utils/ordenPagoTemplate.js

function safe(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
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

/**
 * Genera HTML “imprimible” estilo comprobante (similar a recibos),
 * pero adaptado a Órdenes de Pago.
 */
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
          <td style="padding:6px;border-bottom:1px solid #ddd;">${idMov}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${safe(fecha)}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;">${desc}</td>
          <td style="padding:6px;border-bottom:1px solid #ddd;text-align:right;">${moneyARS(monto)}</td>
        </tr>
      `;
    })
    .join("");

  const nowStr = fechaDMY(fechaPago instanceof Date ? fechaPago : new Date());

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Orden de Pago</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 18px; color: #111; }
    .wrap { max-width: 780px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden; }
    .head { padding: 14px 16px; background: #f6f6f6; border-bottom: 1px solid #ddd; }
    .title { display:flex; align-items:baseline; gap:10px; }
    .title h1 { margin:0; font-size: 18px; }
    .pill { display:inline-block; padding: 3px 10px; border-radius: 999px; border: 1px solid #ccc; background:#fff; font-size: 12px; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px 16px; }
    .box { border: 1px solid #e2e2e2; border-radius: 10px; padding: 10px; }
    .k { font-size: 11px; color:#666; margin-bottom: 4px; }
    .v { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align:left; font-size: 12px; padding: 8px 6px; border-bottom: 2px solid #ccc; background: #fafafa; }
    .foot { padding: 12px 16px; border-top: 1px solid #ddd; display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .tot { font-size: 16px; font-weight: 700; }
    .small { font-size: 11px; color:#666; }
    @media print {
      body { padding: 0; }
      .wrap { border: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div class="title">
        <h1>COMPROBANTE · ORDEN DE PAGO</h1>
        <span class="pill">Fecha: ${nowStr}</span>
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
        <div class="small">${safe(extra?.nota ?? "")}</div>
      </div>
    </div>

    <div style="padding: 0 16px 16px 16px;">
      <div class="box" style="padding:0; overflow:hidden;">
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
            ${rows || `<tr><td colspan="4" style="padding:10px;">Sin items</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="foot">
      <div class="small">
        Comprobante generado automáticamente.
      </div>
      <div class="tot">TOTAL: ${moneyARS(total)}</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}