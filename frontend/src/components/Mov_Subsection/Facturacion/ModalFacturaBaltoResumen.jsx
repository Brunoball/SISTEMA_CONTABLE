import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaBalto.css";
import { saveBaltoInvoicePdf, buildBaltoInvoicePdf } from "../../../utils/FacturaPdfBuilder";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

function isoToYmd8(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replaceAll("-", "");
  return "";
}

function ymdToHuman(ymd) {
  if (!ymd) return "";
  const s = String(ymd);
  if (s.length === 8 && /^\d{8}$/.test(s)) {
    return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  }
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

function safeText(v) {
  return String(v ?? "").trim();
}

function getAuthHeaders(extra = {}) {
  const headers = new Headers({
    Accept: "application/json",
    ...extra,
  });
  const sessionKey = String(localStorage.getItem("session_key") || "").trim();
  if (sessionKey) headers.set("X-Session", sessionKey);
  return headers;
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
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const firstRef = useRef(null);

  const docLabel = useMemo(() => {
    const it = DOC_TIPOS.find((x) => x.id === Number(docTipo));
    return it?.label || String(docTipo ?? "");
  }, [docTipo]);

  const idPago = data?.id_pago ?? null;
  const idSistema = data?.id_sistema ?? null;

  const nombreCliente =
    data?.cliente_facturacion?.razon_social ||
    data?.labelCliente ||
    data?.cliente ||
    "—";

  const nombreSistema = data?.labelSistema || data?.sistema || "—";

  const items = useMemo(
    () => (Array.isArray(data?.items_facturacion) ? data.items_facturacion : []),
    [data]
  );

  const montoReal = Number(data?.total_ars ?? data?.monto ?? data?.importe ?? 0);
  const monto = forceTestAmount ? Number(testAmount) : montoReal;

  const fechaCbteISO = String(data?.fecha_cbte_iso ?? "").slice(0, 10);
  const vtoPagoISO = String(data?.vto_pago_iso ?? "").slice(0, 10);

  const emisorNombre = safeText(data?.emisor_nombre);
  const emisorDomicilio = safeText(data?.emisor_domicilio);
  const emisorCuit = safeText(data?.cuit_emisor);
  const emisorCondIva = safeText(data?.cond_iva_emisor);
  const emisorIibb = safeText(data?.ingresos_brutos_emisor);
  const emisorFechaInicio = safeText(data?.fecha_inicio_actividades_emisor);

  const resumen = useMemo(() => {
    const doc = String(docNro ?? "").replace(/\D/g, "");
    const pv = String(ptoVta ?? "").replace(/\D/g, "");
    return {
      pago: idPago ? String(idPago) : "—",
      sistemaId: idSistema ? String(idSistema) : "—",
      cliente: nombreCliente,
      sistema: nombreSistema,
      fechaISO: fechaCbteISO,
      vtoISO: vtoPagoISO,
      montoTxt: moneyARS(monto),
      comprobante: `Factura C (${String(cbteTipo || 11).padStart(3, "0")})`,
      receptorTxt: doc ? `${docLabel}: ${doc}` : "—",
      pvTxt: pv || "—",
      iva: data?.cliente_facturacion?.cond_iva || data?.cliente_facturacion?.condicion_iva || "—",
      domicilio: data?.cliente_facturacion?.domicilio || "—",
      observaciones: safeText(data?.observaciones),
    };
  }, [idPago, idSistema, nombreCliente, nombreSistema, fechaCbteISO, vtoPagoISO, monto, docNro, ptoVta, docLabel, data, cbteTipo]);

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

  useEffect(() => {
    let revokeUrl = "";

    async function generarPreview() {
      if (!open) return;
      setLoadingPreview(true);
      setPreviewUrl("");

      try {
        const factMock = {
          pto_vta: Number(ptoVta) || 2,
          cbte_tipo: Number(cbteTipo) || 11,
          cbte_nro: 1,
          fecha_cbte: isoToYmd8(fechaCbteISO || new Date().toISOString().slice(0, 10)),
          importe: Number(monto) || 0,
          cae: "00000000000000",
          cae_vto: isoToYmd8(vtoPagoISO || new Date().toISOString().slice(0, 10)),
          qr_url: "",
          emisor_nombre: emisorNombre || "BALTO",
          emisor_domicilio: emisorDomicilio || "",
          cuit_emisor: emisorCuit || "",
          cond_iva_emisor: emisorCondIva || "",
          ingresos_brutos_emisor: emisorIibb || "",
          fecha_inicio_actividades_emisor: emisorFechaInicio || "",
          receptor_nombre: data?.cliente_facturacion?.razon_social || nombreCliente,
          receptor_domicilio: data?.cliente_facturacion?.domicilio || data?.cliente_domicilio || "",
          cond_iva_receptor:
            data?.cliente_facturacion?.cond_iva ||
            data?.cliente_facturacion?.condicion_iva ||
            "",
          doc_tipo: Number(docTipo),
          doc_nro: String(docNro || "").replace(/\D/g, ""),
        };

        const doc = await buildBaltoInvoicePdf({
          fact: factMock,
          data: {
            ...data,
            labelCliente: nombreCliente,
            labelSistema: nombreSistema,
            fecha_cbte: isoToYmd8(fechaCbteISO),
            vto_pago: isoToYmd8(vtoPagoISO),
            total_ars: monto,
            monto,
            importe: monto,
            items_facturacion: items,
          },
          forceTestAmount,
          testAmount,
        });

        const blob = doc.output("blob");
        revokeUrl = URL.createObjectURL(blob);
        setPreviewUrl(revokeUrl);
      } catch (e) {
        console.warn("Preview PDF:", e?.message || e);
        setPreviewUrl("");
      } finally {
        setLoadingPreview(false);
      }
    }

    generarPreview();

    return () => {
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [
    open,
    data,
    docTipo,
    docNro,
    cbteTipo,
    ptoVta,
    nombreCliente,
    nombreSistema,
    monto,
    forceTestAmount,
    testAmount,
    fechaCbteISO,
    vtoPagoISO,
    items,
    emisorNombre,
    emisorDomicilio,
    emisorCuit,
    emisorCondIva,
    emisorIibb,
    emisorFechaInicio,
  ]);

  const toText = useCallback((v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }, []);

  const fetchJSON = useCallback(async (url, opts) => {
    const headers = getAuthHeaders(opts?.headers || {});
    const res = await fetch(url, { ...opts, headers });
    const raw = await res.text();
    const trimmed = (raw || "").trim();

    if (trimmed.startsWith("<")) {
      throw new Error("Backend devolvió HTML (error PHP).");
    }

    let j = null;
    try {
      j = trimmed ? JSON.parse(trimmed) : null;
    } catch {
      j = null;
    }

    const pickErr = () =>
      toText(j?.mensaje) || toText(j?.error) || toText(j?.message) || toText(j?.detail) || "";

    if (!res.ok) throw new Error(pickErr() || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) {
      throw new Error(pickErr() || "Error servidor");
    }
    if (j == null) throw new Error("Respuesta inválida (no JSON)");
    return j;
  }, [toText]);

  const validar = useCallback(() => {
    const doc = String(docNro ?? "").replace(/\D/g, "");
    const pv = String(ptoVta ?? "").replace(/\D/g, "");

    if (!doc) return { ok: false, msg: "Falta documento." };
    if (!pv) return { ok: false, msg: "Falta punto de venta." };

    if (Number(docTipo) === 96 && !(doc.length === 7 || doc.length === 8)) {
      return { ok: false, msg: "DNI inválido (7 u 8 dígitos)." };
    }

    if (Number(docTipo) === 80 && doc.length !== 11) {
      return { ok: false, msg: "CUIT inválido (11 dígitos)." };
    }

    if (!safeText(data?.cliente_facturacion?.razon_social)) {
      return { ok: false, msg: "Falta razón social / apellido y nombre del cliente." };
    }

    if (
      !safeText(data?.cliente_facturacion?.cond_iva) &&
      !safeText(data?.cliente_facturacion?.condicion_iva)
    ) {
      return { ok: false, msg: "Falta condición frente al IVA del cliente." };
    }

    if (!safeText(data?.cliente_facturacion?.domicilio)) {
      return { ok: false, msg: "Falta domicilio del cliente." };
    }

    if (!fechaCbteISO) {
      return { ok: false, msg: "Falta fecha del comprobante." };
    }

    if (!vtoPagoISO) {
      return { ok: false, msg: "Falta fecha de vencimiento." };
    }

    if (!Array.isArray(items) || !items.length) {
      return { ok: false, msg: "No hay ítems para facturar." };
    }

    if (!Number.isFinite(Number(monto)) || Number(monto) <= 0) {
      return { ok: false, msg: "El monto total es inválido." };
    }

    const fecha = new Date(fechaCbteISO);
    const anio = fecha.getFullYear();
    const id_mes = fecha.getMonth() + 1;

    return {
      ok: true,
      docN: Number(doc),
      pvN: Number(pv),
      anio,
      id_mes,
      id_pago: idPago ? Number(idPago) : null,
      id_sistema: idSistema ? Number(idSistema) : null,
    };
  }, [data, docNro, ptoVta, docTipo, idPago, idSistema, fechaCbteISO, vtoPagoISO, items, monto]);

  const guardarFacturaEnDB = useCallback(async ({ blob, filename, fact, estado }) => {
    if (estado !== "emitida") return { exito: true, skip: true };

    if (!data?.id_pago && !data?.id_sistema) {
      return { exito: true, skip: true };
    }

    const url = `${apiBase}?action=${action}&op=facturacion_guardar_pdf`;

    const payload = {
      estado: "emitida",
      id_pago: data?.id_pago ?? null,
      id_sistema: data?.id_sistema ?? null,
      anio: Number(fact?.anio || 0),
      id_mes: Number(fact?.id_mes || 0),
      monto_ars: Number(fact?.importe ?? data?.monto ?? data?.importe ?? 0),

      doc_tipo: Number(docTipo),
      doc_nro: String(docNro || "").replace(/\D/g, ""),
      cbte_tipo: Number(cbteTipo),
      pto_vta: Number(ptoVta),

      razon_social: data?.cliente_facturacion?.razon_social || null,
      cond_iva:
        data?.cliente_facturacion?.cond_iva ||
        data?.cliente_facturacion?.condicion_iva ||
        null,
      domicilio: data?.cliente_facturacion?.domicilio || null,

      cae: fact?.cae ?? null,
      cae_vto: fact?.cae_vto ?? null,
      cbte_nro: fact?.cbte_nro ?? null,
      fecha_cbte: fact?.fecha_cbte ?? null,

      items_facturacion: Array.isArray(data?.items_facturacion) ? data.items_facturacion : [],
      total_ars: data?.total_ars ?? null,
      vto_pago: isoToYmd8(vtoPagoISO) || null,
      observaciones: data?.observaciones ?? "",
    };

    const fd = new FormData();
    fd.append("meta", JSON.stringify(payload));
    fd.append("pdf", blob, filename || "factura.pdf");

    const res = await fetch(url, {
      method: "POST",
      body: fd,
      headers: getAuthHeaders(),
    });

    const raw = await res.text();
    let j = null;
    try {
      j = raw ? JSON.parse(raw) : null;
    } catch {
      j = null;
    }

    if (!res.ok) throw new Error(j?.mensaje || j?.error || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(j?.mensaje || "Error guardando factura");
    return j;
  }, [apiBase, action, data, docTipo, docNro, cbteTipo, ptoVta, vtoPagoISO]);

  const exportarSoloPDF = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);
    if (!confirm) return setError("Tenés que confirmar antes de descargar el PDF.");

    setLoadingPdf(true);
    try {
      const importeFinal = forceTestAmount ? Number(testAmount) : Number(monto);

      const factMock = {
        pto_vta: v.pvN,
        cbte_tipo: Number(cbteTipo),
        cbte_nro: 1,
        fecha_cbte: isoToYmd8(fechaCbteISO),
        importe: importeFinal,
        cae: "00000000000000",
        cae_vto: isoToYmd8(vtoPagoISO),
        qr_url: "",
        emisor_nombre: emisorNombre || "BALTO",
        emisor_domicilio: emisorDomicilio || "",
        cuit_emisor: emisorCuit || "",
        cond_iva_emisor: emisorCondIva || "",
        ingresos_brutos_emisor: emisorIibb || "",
        fecha_inicio_actividades_emisor: emisorFechaInicio || "",
        receptor_nombre: data?.cliente_facturacion?.razon_social || nombreCliente,
        receptor_domicilio: data?.cliente_facturacion?.domicilio || data?.cliente_domicilio || "",
        cond_iva_receptor:
          data?.cliente_facturacion?.cond_iva ||
          data?.cliente_facturacion?.condicion_iva ||
          "",
        doc_tipo: Number(docTipo),
        doc_nro: v.docN,
      };

      await saveBaltoInvoicePdf({
        fact: factMock,
        data: {
          ...data,
          monto: importeFinal,
          importe: importeFinal,
          total_ars: importeFinal,
          fecha_cbte: isoToYmd8(fechaCbteISO),
          vto_pago: isoToYmd8(vtoPagoISO),
          labelCliente: nombreCliente,
          labelSistema: nombreSistema,
          items_facturacion: items,
        },
        forceTestAmount,
        testAmount,
        download: true,
      });
    } catch (e) {
      setError(e?.message || "No se pudo descargar el PDF.");
    } finally {
      setLoadingPdf(false);
    }
  }, [
    validar,
    confirm,
    cbteTipo,
    docTipo,
    forceTestAmount,
    testAmount,
    monto,
    data,
    nombreCliente,
    nombreSistema,
    fechaCbteISO,
    vtoPagoISO,
    items,
    emisorNombre,
    emisorDomicilio,
    emisorCuit,
    emisorCondIva,
    emisorIibb,
    emisorFechaInicio,
  ]);

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

        razon_social: data?.cliente_facturacion?.razon_social || null,
        cond_iva:
          data?.cliente_facturacion?.cond_iva ||
          data?.cliente_facturacion?.condicion_iva ||
          null,
        domicilio: data?.cliente_facturacion?.domicilio || null,

        importe: forceTestAmount ? Number(testAmount) : Number(monto),

        anio: v.anio,
        id_mes: v.id_mes,

        fecha_cbte: isoToYmd8(fechaCbteISO),
        vto_pago: isoToYmd8(vtoPagoISO),
        items_facturacion: items,
        observaciones: data?.observaciones || "",
      };

      const resp = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const fact = resp?.factura || resp;

      const out = await saveBaltoInvoicePdf({
        fact: {
          ...fact,
          anio: v.anio,
          id_mes: v.id_mes,
          fecha_cbte: fact?.fecha_cbte || isoToYmd8(fechaCbteISO),
          cae_vto: fact?.cae_vto || isoToYmd8(vtoPagoISO),
          emisor_nombre: emisorNombre || fact?.emisor_nombre,
          emisor_domicilio: emisorDomicilio || fact?.emisor_domicilio,
          cuit_emisor: emisorCuit || fact?.cuit_emisor,
          cond_iva_emisor: emisorCondIva || fact?.cond_iva_emisor,
          ingresos_brutos_emisor: emisorIibb || fact?.ingresos_brutos_emisor,
          fecha_inicio_actividades_emisor: emisorFechaInicio || fact?.fecha_inicio_actividades_emisor,
          receptor_nombre: data?.cliente_facturacion?.razon_social || fact?.receptor_nombre,
          receptor_domicilio: data?.cliente_facturacion?.domicilio || fact?.receptor_domicilio,
          cond_iva_receptor:
            data?.cliente_facturacion?.cond_iva ||
            data?.cliente_facturacion?.condicion_iva ||
            fact?.cond_iva_receptor,
        },
        data: {
          ...data,
          labelCliente: nombreCliente,
          labelSistema: nombreSistema,
          fecha_cbte: isoToYmd8(fechaCbteISO),
          vto_pago: isoToYmd8(vtoPagoISO),
          items_facturacion: items,
          total_ars: monto,
          monto,
          importe: monto,
        },
        forceTestAmount,
        testAmount,
        download: true,
      });

      const blob = out?.blob instanceof Blob ? out.blob : out instanceof Blob ? out : null;
      const filename = out?.filename || "factura.pdf";
      if (!blob) throw new Error("No se pudo generar el PDF.");

      await guardarFacturaEnDB({
        blob,
        filename,
        fact: {
          ...fact,
          anio: v.anio,
          id_mes: v.id_mes,
          importe: monto,
          fecha_cbte: fact?.fecha_cbte || isoToYmd8(fechaCbteISO),
        },
        estado: "emitida",
      });

      if (onFacturada) {
        await Promise.resolve(onFacturada(fact));
      }
      if (onDone) {
        await Promise.resolve(onDone(fact));
      }

      onClose?.();
      onCloseAll?.();
    } catch (e) {
      setError(e?.message || "No se pudo emitir la factura.");
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    action,
    fetchJSON,
    validar,
    confirm,
    docTipo,
    cbteTipo,
    data,
    onFacturada,
    onDone,
    onClose,
    onCloseAll,
    forceTestAmount,
    testAmount,
    nombreCliente,
    nombreSistema,
    guardarFacturaEnDB,
    monto,
    fechaCbteISO,
    vtoPagoISO,
    items,
    emisorNombre,
    emisorDomicilio,
    emisorCuit,
    emisorCondIva,
    emisorIibb,
    emisorFechaInicio,
  ]);

  if (!open) return null;

  const cerrar = () => {
    if (!loading && !loadingPdf) onClose?.();
  };

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}
    >
      <div
        className="mi-modal__container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1180 }}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Resumen antes de emitir</h2>
            <p className="mi-modal__subtitle">
              Confirmá datos → Vista previa → Descargar PDF o Emitir + PDF
            </p>
          </div>

          <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar" type="button">
            ×
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="mi-grid" style={{ gridTemplateColumns: "390px 1fr", gap: 16 }}>
            <div className="mi-card">
              {error && (
                <div className="arca-alert arca-alert--error" role="alert">
                  {error}
                </div>
              )}

              <div className="arca-alert arca-alert--info">
                <div className="arca-alert__title">
                  <strong>Resumen de facturación</strong>
                </div>

                <div className="arca-resumen arca-resumen--2col">
                  <div className="arca-row">
                    <b>Cliente:</b>
                    <span>{resumen.cliente}</span>
                  </div>

                  <div className="arca-row">
                    <b>Sistema:</b>
                    <span>{resumen.sistema}</span>
                  </div>

                  <div className="arca-row">
                    <b>Monto total:</b>
                    <span>{resumen.montoTxt}</span>
                  </div>

                  <div className="arca-row">
                    <b>Comprobante:</b>
                    <span>{resumen.comprobante}</span>
                  </div>

                  <div className="arca-row">
                    <b>Fecha:</b>
                    <span>{ymdToHuman(resumen.fechaISO)}</span>
                  </div>

                  <div className="arca-row">
                    <b>Vencimiento:</b>
                    <span>{ymdToHuman(resumen.vtoISO)}</span>
                  </div>

                  <div className="arca-row">
                    <b>Receptor:</b>
                    <span>{resumen.receptorTxt}</span>
                  </div>

                  <div className="arca-row">
                    <b>Punto de venta:</b>
                    <span>{resumen.pvTxt}</span>
                  </div>

                  <div className="arca-row">
                    <b>IVA cliente:</b>
                    <span>{resumen.iva}</span>
                  </div>

                  <div className="arca-row arca-row--full">
                    <b>Domicilio cliente:</b>
                    <span>{resumen.domicilio}</span>
                  </div>

                  <div className="arca-row arca-row--full">
                    <b>Emisor:</b>
                    <span>{emisorNombre || "—"}</span>
                  </div>

                  <div className="arca-row">
                    <b>CUIT emisor:</b>
                    <span>{emisorCuit || "—"}</span>
                  </div>

                  <div className="arca-row">
                    <b>IVA emisor:</b>
                    <span>{emisorCondIva || "—"}</span>
                  </div>

                  <div className="arca-row arca-row--full">
                    <b>Domicilio comercial:</b>
                    <span>{emisorDomicilio || "—"}</span>
                  </div>

                  <div className="arca-row">
                    <b>Ing. Brutos:</b>
                    <span>{emisorIibb || "—"}</span>
                  </div>

                  <div className="arca-row">
                    <b>Inicio actividades:</b>
                    <span>{emisorFechaInicio || "—"}</span>
                  </div>

                  {resumen.observaciones ? (
                    <div className="arca-row arca-row--full">
                      <b>Observaciones:</b>
                      <span>{resumen.observaciones}</span>
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: 14 }}>
                  <strong>Detalle</strong>
                  <div style={{ marginTop: 8 }}>
                    {(items || []).map((it, idx) => (
                      <div key={`${it?.id || idx}_${idx}`} className="arca-mini" style={{ marginBottom: 6 }}>
                        {idx + 1}. {it.descripcion} — Cant: {it.cantidad} — P.Unit: {moneyARS(it.precio_unitario || it.precio || 0)} — IVA: {moneyARS(it.iva_monto || 0)} — Total: {moneyARS(it.total || it.ars || it.subtotal || 0)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="arca-confirm" style={{ marginTop: 14 }}>
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
                      Confirmo que los <b>datos del cliente</b>, del <b>emisor</b>, el <b>detalle</b> y el <b>monto</b> son correctos.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="mi-card">
              <h3 className="mi-card__title">Vista previa del PDF</h3>

              {loadingPreview ? (
                <div className="arca-alert arca-alert--info">Generando vista previa...</div>
              ) : previewUrl ? (
                <iframe
                  title="Vista previa factura PDF"
                  src={previewUrl}
                  style={{
                    width: "100%",
                    height: "70vh",
                    border: "1px solid rgba(255,255,255,.08)",
                    borderRadius: 12,
                    background: "#fff",
                  }}
                />
              ) : (
                <div className="arca-alert arca-alert--error">
                  No se pudo generar la vista previa del PDF.
                </div>
              )}
            </div>
          </div>

          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={() => !(loading || loadingPdf) && onBack?.()}
              disabled={loading || loadingPdf}
            >
              Volver
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={exportarSoloPDF}
              disabled={loading || loadingPdf || !confirm}
            >
              {loadingPdf ? "Generando PDF..." : "Descargar PDF"}
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={emitir}
              disabled={loading || loadingPdf || !confirm}
            >
              {loading ? "Emitiendo..." : <>Emitir + PDF <FaCheck style={{ marginLeft: 8 }} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}