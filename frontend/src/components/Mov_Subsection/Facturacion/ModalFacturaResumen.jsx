import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaBalto.css";
import { saveBaltoInvoicePdf } from "../../../utils/FacturaPdfBuilder";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

function ymdToHuman(ymd) {
  if (!ymd) return "";
  const s = String(ymd);
  if (s.length === 8 && /^\d{8}$/.test(s)) return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  if (s.length >= 10 && s.includes("-")) {
    const [y, m, d] = s.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}
function moneyARS(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0,00";
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export default function ModalFacturaBaltoResumen({
  open,
  onClose,
  onBack,
  onCloseAll,
  apiBase,
  action = "movimientos",
  data,
  docTipo,
  docNro,
  cbteTipo,
  ptoVta,
  onFacturada,
  onDone,
  forceTestAmount = false,
  testAmount = 1000,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const firstRef = useRef(null);

  const docLabel = useMemo(() => {
    const it = DOC_TIPOS.find((x) => x.id === Number(docTipo));
    return it?.label || String(docTipo ?? "");
  }, [docTipo]);

  const idPago = data?.id_pago ?? null;
  const idSistema = data?.id_sistema ?? null;

  const nombreCliente = data?.labelCliente ?? data?.cliente ?? "—";
  const nombreSistema = data?.labelSistema ?? data?.sistema ?? "—";

  const montoReal = Number(data?.monto ?? data?.importe ?? 0);
  const monto = forceTestAmount ? Number(testAmount) : montoReal;

  const fechaPagoISO = String(data?.fecha_pago ?? data?.fecha ?? "").slice(0, 10);

  const resumen = useMemo(() => {
    const doc = String(docNro ?? "").replace(/\D/g, "");
    const pv = String(ptoVta ?? "").replace(/\D/g, "");
    return {
      pago: idPago ? String(idPago) : "—",
      sistemaId: idSistema ? String(idSistema) : "—",
      cliente: nombreCliente,
      sistema: nombreSistema,
      fechaISO: fechaPagoISO,
      montoTxt: moneyARS(monto),
      comprobante: "Factura C (11)",
      receptorTxt: doc ? `${docLabel}: ${doc}` : "—",
      pvTxt: pv || "—",
      anio: data?.anio ?? "—",
      id_mes: data?.id_mes ?? "—",
      periodo_desde: data?.periodo_desde ?? "",
      periodo_hasta: data?.periodo_hasta ?? "",
      vto_pago: data?.vto_pago ?? "",
    };
  }, [idPago, idSistema, nombreCliente, nombreSistema, fechaPagoISO, monto, docNro, ptoVta, docLabel, data]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirm(false);
    setTimeout(() => firstRef.current?.focus?.(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toText = useCallback((v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try { return JSON.stringify(v); } catch { return String(v); }
  }, []);

  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    const raw = await res.text();
    const trimmed = (raw || "").trim();
    if (trimmed.startsWith("<")) throw new Error("Backend devolvió HTML (error PHP).");

    let j = null;
    try { j = trimmed ? JSON.parse(trimmed) : null; } catch { j = null; }

    const pickErr = () =>
      toText(j?.mensaje) || toText(j?.error) || toText(j?.message) || toText(j?.detail) || "";

    if (!res.ok) throw new Error(pickErr() || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(pickErr() || "Error servidor (exito=false)");
    if (j == null) throw new Error("Respuesta inválida (no JSON)");
    return j;
  }, [toText]);

  const validar = useCallback(() => {
    const doc = String(docNro ?? "").replace(/\D/g, "");
    const pv = String(ptoVta ?? "").replace(/\D/g, "");

    const anio = Number(data?.anio || 0);
    const id_mes = Number(data?.id_mes || 0);

    if (!(idPago || idSistema)) return { ok: false, msg: "Falta id_pago o id_sistema." };
    if (!anio || anio < 2000 || anio > 2100) return { ok: false, msg: "Año inválido." };
    if (!id_mes || id_mes < 1 || id_mes > 12) return { ok: false, msg: "Mes inválido." };

    if (!doc) return { ok: false, msg: "Ingresá el documento (solo números)." };
    if (!pv) return { ok: false, msg: "Ingresá el punto de venta." };

    if (Number(docTipo) === 96 && !(doc.length === 7 || doc.length === 8)) {
      return { ok: false, msg: "DNI inválido (7 u 8 dígitos)." };
    }
    if (Number(docTipo) === 80 && doc.length !== 11) {
      return { ok: false, msg: "CUIT inválido (11 dígitos)." };
    }

    const docN = Number(doc);
    const pvN = Number(pv);
    if (!Number.isFinite(docN) || docN <= 0) return { ok: false, msg: "Documento inválido." };
    if (!Number.isFinite(pvN) || pvN <= 0) return { ok: false, msg: "Punto de venta inválido." };

    return {
      ok: true,
      docN,
      pvN,
      anio,
      id_mes,
      id_pago: idPago ? Number(idPago) : null,
      id_sistema: idSistema ? Number(idSistema) : null,
    };
  }, [data, docNro, ptoVta, docTipo, idPago, idSistema]);

  /**
   * ✅ SOLO SE GUARDA EN DB CUANDO estado="emitida"
   */
  const guardarFacturaEnDB = useCallback(async ({ blob, filename, fact, estado }) => {
    if (estado !== "emitida") return { exito: true, skip: true };

    const url = `${apiBase}?action=${action}&op=facturacion_guardar_pdf`;

    const payload = {
      estado: "emitida",
      id_pago: data?.id_pago ?? null,
      id_sistema: data?.id_sistema ?? null,
      anio: Number(data?.anio || 0),
      id_mes: Number(data?.id_mes || 0),
      monto_ars: Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0),

      doc_tipo: Number(docTipo),
      doc_nro: String(docNro || "").replace(/\D/g, ""),
      cbte_tipo: Number(cbteTipo),
      pto_vta: Number(ptoVta),

      cae: fact?.cae ?? null,
      cae_vto: fact?.cae_vto ?? null,
      cbte_nro: fact?.cbte_nro ?? null,
      fecha_cbte: fact?.fecha_cbte ?? null,

      items_facturacion: Array.isArray(data?.items_facturacion) ? data.items_facturacion : [],
      usd_rate: data?.usd_rate ?? null,
      total_usd: data?.total_usd ?? null,
      total_ars: data?.total_ars ?? null,
      periodo_desde: data?.periodo_desde ?? null,
      periodo_hasta: data?.periodo_hasta ?? null,
      vto_pago: data?.vto_pago ?? null,
    };

    const fd = new FormData();
    fd.append("meta", JSON.stringify(payload));
    fd.append("pdf", blob, filename || "factura.pdf");

    const res = await fetch(url, { method: "POST", body: fd });
    const raw = await res.text();
    let j = null;
    try { j = raw ? JSON.parse(raw) : null; } catch { j = null; }

    if (!res.ok) throw new Error(j?.mensaje || j?.error || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(j?.mensaje || "Error guardando factura");
    return j;
  }, [apiBase, action, data, docTipo, docNro, cbteTipo, ptoVta]);

  /**
   * ✅ Solo PDF (NO emite / NO DB)
   */
  const exportarSoloPDF = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);
    if (!confirm) return setError("Tenés que confirmar antes de exportar el PDF.");

    setLoadingPdf(true);
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");

      const importeFinal = forceTestAmount ? Number(testAmount) : Number(monto);

      const factMock = {
        pto_vta: v.pvN,
        cbte_tipo: Number(cbteTipo),
        cbte_nro: 1,
        fecha_cbte: `${y}${m}${d}`,
        importe: importeFinal,
        cae: "00000000000000",
        cae_vto: `${y}${m}${d}`,
        qr_url: "",
        emisor_nombre: data?.emisor_nombre || "BALTO SA",
        emisor_domicilio: data?.emisor_domicilio || "",
        cuit_emisor: data?.cuit_emisor || "",
        cond_iva_emisor: data?.cond_iva_emisor || "",
        receptor_nombre: nombreCliente,
        receptor_domicilio: data?.cliente_domicilio || "",
        doc_tipo: Number(docTipo),
        doc_nro: v.docN,
      };

      await saveBaltoInvoicePdf({
        fact: factMock,
        data: {
          ...data,
          monto: importeFinal,
          importe: importeFinal,
          labelCliente: nombreCliente,
          labelSistema: nombreSistema,
        },
        forceTestAmount,
        testAmount,
        download: true,
      });
    } catch (e) {
      setError(e?.message || "No se pudo exportar el PDF.");
    } finally {
      setLoadingPdf(false);
    }
  }, [validar, confirm, cbteTipo, docTipo, forceTestAmount, testAmount, monto, data, nombreCliente, nombreSistema]);

  /**
   * ✅ Emitir:
   * - POST backend (ARCA)
   * - Genera PDF
   * - Guarda DB (emitida)
   */
  const emitir = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);
    if (!confirm) return setError("Tenés que confirmar antes de emitir.");

    setLoading(true);
    try {
      const url = `${apiBase}?action=${action}&op=facturacion_emitir`;

      const body = {
        id_pago: v.id_pago,
        id_sistema: v.id_sistema,

        doc_tipo: Number(docTipo),
        doc_nro: v.docN,
        cbte_tipo: Number(cbteTipo),
        pto_vta: v.pvN,

        // ✅ importe final ARS
        importe: forceTestAmount ? Number(testAmount) : Number(monto),

        anio: v.anio,
        id_mes: v.id_mes,

        periodo_desde: data?.periodo_desde ?? "",
        periodo_hasta: data?.periodo_hasta ?? "",
        vto_pago: data?.vto_pago ?? "",
      };

      const resp = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const fact = resp?.factura || resp;

      const out = await saveBaltoInvoicePdf({
        fact,
        data: { ...data, labelCliente: nombreCliente, labelSistema: nombreSistema },
        forceTestAmount,
        testAmount,
        download: true,
      });

      const blob = out?.blob instanceof Blob ? out.blob : out instanceof Blob ? out : null;
      const filename = out?.filename || "factura.pdf";
      if (!blob) throw new Error("No se pudo generar el PDF (blob vacío).");

      await guardarFacturaEnDB({ blob, filename, fact, estado: "emitida" });

      onFacturada?.(fact);
      onDone?.(fact);

      onClose?.();
      onCloseAll?.();
    } catch (e) {
      setError(e?.message || "No se pudo emitir la factura.");
    } finally {
      setLoading(false);
    }
  }, [apiBase, action, fetchJSON, validar, confirm, docTipo, cbteTipo, data, onFacturada, onDone, onClose, onCloseAll, forceTestAmount, testAmount, nombreCliente, nombreSistema, guardarFacturaEnDB, monto]);

  if (!open) return null;

  const cerrar = () => { if (!loading && !loadingPdf) onClose?.(); };

  return (
    <div className="mi-modal__overlay" onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}>
      <div className="mi-modal__container" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Resumen antes de emitir</h2>
            <p className="mi-modal__subtitle">Confirmá datos → Emitir → PDF (estilo ARCA)</p>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar" type="button">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="mit-modal__content">
            {error && <div className="arca-alert arca-alert--error" role="alert">{error}</div>}

            <div className="arca-alert arca-alert--info">
              <div className="arca-alert__title"><strong>Resumen de lo que se va a facturar</strong></div>

              <div className="arca-resumen arca-resumen--2col">
                <div className="arca-row"><b>Pago:</b><span>{resumen.pago}</span></div>
                <div className="arca-row"><b>Sistema ID:</b><span>{resumen.sistemaId}</span></div>

                <div className="arca-row"><b>Cliente:</b><span>{resumen.cliente}</span></div>
                <div className="arca-row"><b>Sistema:</b><span>{resumen.sistema}</span></div>

                <div className="arca-row">
                  <b>Monto:</b>
                  <span>
                    {resumen.montoTxt}
                    {forceTestAmount && <em className="arca-pill">(modo prueba)</em>}
                  </span>
                </div>

                <div className="arca-row"><b>Comprobante:</b><span>{resumen.comprobante}</span></div>

                {resumen.fechaISO ? (
                  <div className="arca-row"><b>Fecha pago:</b><span>{ymdToHuman(resumen.fechaISO)}</span></div>
                ) : <div />}

                <div className="arca-row"><b>Receptor:</b><span>{resumen.receptorTxt}</span></div>
                <div className="arca-row"><b>Punto de venta:</b><span>{resumen.pvTxt}</span></div>

                <div className="arca-row">
                  <b>Período:</b>
                  <span>
                    {resumen.periodo_desde ? ymdToHuman(resumen.periodo_desde) : "—"} →{" "}
                    {resumen.periodo_hasta ? ymdToHuman(resumen.periodo_hasta) : "—"}
                  </span>
                </div>
                <div className="arca-row">
                  <b>Vto pago:</b>
                  <span>{resumen.vto_pago ? ymdToHuman(resumen.vto_pago) : "—"}</span>
                </div>
              </div>

              <div className="arca-confirm">
                <label className="arca-check">
                  <input
                    ref={firstRef}
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                    disabled={loading || loadingPdf}
                  />
                  <span className="arca-check__circle" />
                  <span className="arca-check__text">
                    Confirmo que el <b>DNI/CUIT</b> y el <b>monto</b> son correctos.
                  </span>
                </label>
              </div>

              <div className="arca-mini">
                * El PDF se genera con 3 copias: <b>ORIGINAL / DUPLICADO / TRIPLICADO</b>.
              </div>
            </div>
          </div>

          <div className="mit-actions">
            <div className="mit-help">* Campos obligatorios</div>

            <button type="button" className="mit-btn mit-btn--ghost" onClick={() => !(loading || loadingPdf) && onBack?.()} disabled={loading || loadingPdf}>
              Volver
            </button>

            <button type="button" className="mit-btn mit-btn--ghost" onClick={exportarSoloPDF} disabled={loading || loadingPdf || !confirm}>
              {loadingPdf ? "Generando PDF..." : "Solo PDF (sin emitir)"}
            </button>

            <button type="button" className="mit-btn mit-btn--solid" onClick={emitir} disabled={loading || loadingPdf || !confirm}>
              {loading ? "Emitiendo..." : <>Emitir + PDF <FaCheck style={{ marginLeft: 8 }} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}