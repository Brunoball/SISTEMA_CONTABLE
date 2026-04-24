// frontend/src/utils/reciboTemplate.js

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";

  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const yyyy = m1[1];
    const mm = String(Number(m1[2])).padStart(2, "0");
    const dd = String(Number(m1[3])).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }

  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const dd = String(Number(m2[1])).padStart(2, "0");
    const mm = String(Number(m2[2])).padStart(2, "0");
    const yyyy = m2[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}

function todayDMY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * payload recomendado:
 * {
 *   nro: "RC-000001" (opcional),
 *   fecha_cobro: "DD/MM/YYYY" (opcional),
 *   cliente: { id_cliente, nombre },
 *   medio_pago: { id, nombre },
 *   total: number,
 *   items: [{ id_movimiento, fecha, descripcion, monto, medio_pago }]
 * }
 */
export function buildReciboHTML(payload) {
  const fechaCobro = esc(payload?.fecha_cobro || todayDMY());
  const nro = esc(payload?.nro || "");
  const clienteNom = esc(payload?.cliente?.nombre || payload?.cliente?.cliente || "—");

  const medioPagoRaw = payload?.medio_pago?.nombre || "—";
  const medioPago = esc(medioPagoRaw);

  const total = moneyARS(payload?.total || 0);

  const items = Array.isArray(payload?.items) ? payload.items : [];

  const rows = items
    .map((it) => {
      const fecha = esc(formatFechaDMY(it?.fecha));
      const desc = esc(it?.descripcion || it?.detalle || it?.concepto || "—");

      const medioItem = esc(
        it?.medio_pago?.nombre ||
          it?.medio_pago ||
          it?.medio ||
          it?.nombre_medio_pago ||
          medioPagoRaw ||
          "—"
      );

      const monto = moneyARS(it?.monto || it?.monto_total || it?.total || 0);

      return `
        <tr>
          <td class="c center">${fecha}</td>
          <td class="c">${desc}</td>
          <td class="c center">${medioItem}</td>
          <td class="c right">${monto}</td>
        </tr>
      `;
    })
    .join("");

  const itemsBlock =
    items.length > 0
      ? `
      <table class="tbl">
        <thead>
          <tr>
            <th class="center" style="width:110px">Fecha</th>
            <th>Descripción</th>
            <th class="center" style="width:200px">Medio de pago</th>
            <th class="right" style="width:130px">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `
      : `<div class="muted">Sin ítems.</div>`;

  const cantidadItems = items.length;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Recibo</title>
  <style>
    :root{
      --text:#0f172a;
      --muted:#64748b;
      --line:#e2e8f0;
      --soft:#f8fafc;
      --accent:#0ea5e9;
      --accentSoft:#e0f2fe;
    }

    *{ box-sizing:border-box; }

    html, body{
      margin:0;
      padding:0;
      background:#fff;
      color:var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page { size: A4; margin: 10mm; }

    body{ padding:24px; }

    @media print{
      body{ padding:0 !important; }

      .paper{
        margin:0 !important;
        width:100% !important;
        max-width:190mm !important;
        border:none !important;
        border-radius:0 !important;
        padding:0 !important;
        overflow:visible !important;
        page-break-after:avoid !important;
        break-after:avoid !important;
      }

      .top, .grid, .tbl, .totals, .footer{
        break-inside:avoid !important;
        page-break-inside:avoid !important;
      }
    }

    .paper{
      max-width:1020px;
      margin:0 auto;
      background:#fff;
      border:1px solid var(--line);
      border-radius:18px;
      padding:22px;
      position:relative;
      overflow:hidden;
    }

    .paper::before{
      content:"";
      position:absolute;
      top:0;
      left:0;
      right:0;
      height:5px;
      background:linear-gradient(90deg, var(--accent), #38bdf8);
    }

    .top{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:16px;
      padding-bottom:14px;
      border-bottom:1px solid var(--line);
      margin-bottom:14px;
    }

    .brand{
      display:flex;
      flex-direction:column;
      gap:8px;
      min-width:0;
    }

    .headRow{
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
    }

    .brand .title{
      font-size:19px;
      font-weight:650;
      letter-spacing:0.2px;
      margin:0;
    }

    .pill{
      display:inline-block;
      padding:6px 10px;
      border-radius:999px;
      background:var(--soft);
      border:1px solid var(--line);
      color:var(--text);
      font-weight:600;
      font-size:12px;
      white-space:nowrap;
    }

    .pillAccent{
      background:var(--accentSoft);
      border-color:#bae6fd;
      color:#0369a1;
    }

    .meta{
      text-align:right;
      font-size:12px;
      color:var(--muted);
      display:flex;
      flex-direction:column;
      gap:6px;
      white-space:nowrap;
    }

    .grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px 14px;
      margin:12px 0 14px;
    }

    .field{
      border:1px solid var(--line);
      border-radius:12px;
      padding:11px 12px;
      background:#fff;
    }

    .field .k{
      font-size:11px;
      color:var(--muted);
      margin-bottom:4px;
    }

    .field .v{
      font-size:13px;
      font-weight:700;
      color:var(--text);
      word-break:break-word;
    }

    .tbl{
      width:100%;
      border-collapse:separate;
      border-spacing:0;
      overflow:hidden;
      border-radius:14px;
      border:1px solid var(--line);
    }

    .tbl thead th{
      background:var(--soft);
      font-size:12px;
      text-align:left;
      padding:10px 10px;
      border-bottom:1px solid var(--line);
      color:#0b1220;
      font-weight:700;
    }

    .tbl tbody td{
      padding:10px 10px;
      border-bottom:1px solid var(--line);
      font-size:12px;
      vertical-align:top;
    }

    .tbl tbody tr:last-child td{
      border-bottom:none;
    }

    .center{ text-align:center; }
    .right{ text-align:right; }

    .muted{
      color:var(--muted);
      font-size:12px;
    }

    .totals{
      display:flex;
      justify-content:flex-end;
      margin-top:14px;
    }

    .totalBox{
      border:1px solid var(--line);
      background:var(--soft);
      border-radius:14px;
      padding:12px 14px;
      min-width:260px;
      text-align:right;
    }

    .totalBox .k{
      font-size:11px;
      color:var(--muted);
      margin-bottom:4px;
    }

    .totalBox .v{
      font-size:20px;
      font-weight:650;
      letter-spacing:0.2px;
    }

    .footer{
      margin-top:16px;
      padding-top:12px;
      border-top:1px dashed var(--line);
      display:flex;
      justify-content:space-between;
      gap:10px;
      color:var(--muted);
      font-size:11px;
    }
  </style>
</head>
<body>
  <div class="paper">
    <div class="top">
      <div class="brand">
        <div class="headRow">
          <div class="title">RECIBO DE COBRO</div>
          <div class="pill pillAccent">Medio: ${medioPago}</div>
        </div>

        ${nro ? `<div class="pill">N° ${nro}</div>` : ``}
      </div>

      <div class="meta">
        <div><b>Fecha de cobro:</b> ${fechaCobro}</div>
      </div>
    </div>

    <div class="grid">
      <div class="field">
        <div class="k">Cliente</div>
        <div class="v">${clienteNom}</div>
      </div>

      <div class="field">
        <div class="k">Comprobantes abonados</div>
        <div class="v">${cantidadItems || "—"}</div>
      </div>
    </div>

    ${itemsBlock}

    <div class="totals">
      <div class="totalBox">
        <div class="k">TOTAL COBRADO</div>
        <div class="v">${total}</div>
      </div>
    </div>

    <div class="footer">
      <div>Generado automáticamente al confirmar el pago.</div>
      <div>${new Date().toLocaleString("es-AR")}</div>
    </div>
  </div>
</body>
</html>`;
}