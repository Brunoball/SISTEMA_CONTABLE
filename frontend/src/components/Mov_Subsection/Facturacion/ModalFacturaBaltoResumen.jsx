import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaBalto.css";
import "../../Global/Global_css/Global_oscuro.css";

import {
  saveBaltoInvoicePdf,
  buildBaltoInvoicePdf,
} from "../../../utils/FacturaPdfBuilder";

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
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(v) {
  return String(v ?? "").trim();
}

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function normalizeFacturaEmitida(resp, fallback = {}) {
  const root = resp && typeof resp === "object" ? resp : {};
  const factura = root?.data?.factura || root?.factura || root?.data || root;

  return {
    modo: safeText(factura?.modo || fallback?.modo || "prod"),
    cuit_emisor: safeText(factura?.cuit_emisor || fallback?.cuit_emisor),
    pto_vta: Number(factura?.pto_vta || fallback?.pto_vta || 0) || 0,
    cbte_tipo: Number(factura?.cbte_tipo || fallback?.cbte_tipo || 0) || 0,
    cbte_nro: Number(factura?.cbte_nro || fallback?.cbte_nro || 0) || 0,
    fecha_cbte: safeText(factura?.fecha_cbte || fallback?.fecha_cbte),
    resultado: safeText(factura?.resultado || fallback?.resultado),
    cae: safeText(factura?.cae || fallback?.cae),
    cae_vto: safeText(factura?.cae_vto || fallback?.cae_vto),
    imp_total: Number(factura?.imp_total || fallback?.imp_total || 0) || 0,
    imp_neto: Number(factura?.imp_neto || fallback?.imp_neto || 0) || 0,
    imp_iva: Number(factura?.imp_iva || fallback?.imp_iva || 0) || 0,
    doc_tipo: Number(factura?.doc_tipo || fallback?.doc_tipo || 0) || 0,
    doc_nro: safeText(factura?.doc_nro || fallback?.doc_nro),
    qr_url: factura?.qr_url || factura?.qr?.url || "",
    qr_base64: factura?.qr_base64 || factura?.qr?.base64 || "",
    qr_payload: factura?.qr_payload || factura?.qr?.payload || null,
    observaciones: Array.isArray(factura?.observaciones) ? factura.observaciones : [],
    eventos: Array.isArray(factura?.eventos) ? factura.eventos : [],
    errores: Array.isArray(factura?.errores) ? factura.errores : [],
    raw_min: factura?.raw_min || {},
    id_comprobante:
      factura?.id_comprobante ??
      root?.id_comprobante ??
      root?.data?.id_comprobante ??
      null,
  };
}

function resolveMovimientoCreateAction(actionProp) {
  const a = String(actionProp || "").trim().toLowerCase();
  if (!a || a === "movimientos" || a === "ventas" || a === "venta") {
    return "ventas_crear";
  }
  return a;
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

  // ✅ NUEVO:
  // cuando true, este modal NO intenta crear movimiento ni subir comprobante.
  // solo genera/emite PDF y devuelve blob al padre.
  skipMovimientoAutocreacion = false,
}) {
  const [loading, setLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [tabActiva, setTabActiva] = useState("resumen");
  const firstRef = useRef(null);

  const movimientoIdRef = useRef(0);

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

  const primerItem = useMemo(() => items?.[0] || {}, [items]);

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
      iva:
        data?.cliente_facturacion?.cond_iva ||
        data?.cliente_facturacion?.condicion_iva ||
        "—",
      domicilio: data?.cliente_facturacion?.domicilio || "—",
      observaciones: safeText(data?.observaciones),
    };
  }, [
    idPago,
    idSistema,
    nombreCliente,
    nombreSistema,
    fechaCbteISO,
    vtoPagoISO,
    monto,
    docNro,
    ptoVta,
    docLabel,
    data,
    cbteTipo,
  ]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirm(false);
    setTabActiva("resumen");
    movimientoIdRef.current = Number(data?.id_movimiento || 0) || 0;
    setTimeout(() => firstRef.current?.focus?.(), 0);
  }, [open, data]);

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
          fecha_cbte: isoToYmd8(
            fechaCbteISO || new Date().toISOString().slice(0, 10)
          ),
          imp_total: Number(monto) || 0,
          importe: Number(monto) || 0,
          cae: "00000000000000",
          cae_vto: isoToYmd8(
            vtoPagoISO || new Date().toISOString().slice(0, 10)
          ),
          resultado: "P",
          qr_url: "",
          qr_base64: "",
          qr_payload: null,
          emisor_nombre: emisorNombre || "BALTO",
          emisor_domicilio: emisorDomicilio || "",
          cuit_emisor: emisorCuit || "",
          cond_iva_emisor: emisorCondIva || "",
          ingresos_brutos_emisor: emisorIibb || "",
          fecha_inicio_actividades_emisor: emisorFechaInicio || "",
          receptor_nombre:
            data?.cliente_facturacion?.razon_social || nombreCliente,
          receptor_domicilio:
            data?.cliente_facturacion?.domicilio ||
            data?.cliente_domicilio ||
            "",
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

  const fetchJSON = useCallback(
    async (url, opts) => {
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
        toText(j?.mensaje) ||
        toText(j?.error) ||
        toText(j?.message) ||
        toText(j?.detail) ||
        "";

      if (!res.ok) throw new Error(pickErr() || `HTTP ${res.status}`);
      if (j && typeof j === "object" && j.exito === false) {
        throw new Error(pickErr() || "Error servidor");
      }
      if (j == null) throw new Error("Respuesta inválida (no JSON)");
      return j;
    },
    [toText]
  );

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
  }, [
    data,
    docNro,
    ptoVta,
    docTipo,
    idPago,
    idSistema,
    fechaCbteISO,
    vtoPagoISO,
    items,
    monto,
  ]);

  const buildMovimientoPayload = useCallback(() => {
    const idDetalle =
      toNumberOrNull(data?.id_detalle) ??
      toNumberOrNull(primerItem?.id_detalle) ??
      toNumberOrNull(primerItem?.id) ??
      null;

    const cantidad = Number(primerItem?.cantidad ?? 1) || 1;
    const precioUnitario =
      Number(
        primerItem?.precio_unitario ??
          primerItem?.precio ??
          primerItem?.subtotal ??
          monto
      ) || Number(monto) || 0;

    const ivaPct = Number(primerItem?.iva_pct ?? 0) || 0;
    const subtotal =
      Number(primerItem?.subtotal ?? cantidad * precioUnitario) ||
      cantidad * precioUnitario;
    const ivaMonto = Number(primerItem?.iva_monto ?? 0) || 0;
    const total =
      Number(primerItem?.total ?? primerItem?.ars ?? monto) || Number(monto) || 0;

    return {
      fecha: fechaCbteISO,
      periodo: safeText(data?.periodo) || String(fechaCbteISO || "").slice(0, 7),
      id_clasificacion: toNumberOrNull(data?.id_clasificacion),
      id_tipo_venta: toNumberOrNull(data?.id_tipo_venta),
      id_medio_pago: toNumberOrNull(data?.id_medio_pago),
      id_cliente: toNumberOrNull(data?.id_cliente),
      id_detalle: idDetalle,
      monto_total: Number(monto) || total,
      cantidad,
      precio: precioUnitario,
      iva_pct: ivaPct,
      subtotal,
      iva_monto: ivaMonto,
      total,
    };
  }, [data, primerItem, monto, fechaCbteISO]);

  const ensureMovimientoGuardado = useCallback(async () => {
    if (skipMovimientoAutocreacion) return null;

    const ya = Number(movimientoIdRef.current || data?.id_movimiento || 0) || 0;
    if (ya > 0) return ya;

    const createAction = resolveMovimientoCreateAction(action);
    const payload = buildMovimientoPayload();

    if (!payload.id_cliente) {
      throw new Error("No se puede guardar la venta: falta id_cliente.");
    }
    if (!payload.id_tipo_venta) {
      throw new Error("No se puede guardar la venta: falta id_tipo_venta.");
    }
    if (!payload.id_detalle) {
      throw new Error("No se puede guardar la venta: falta id_detalle.");
    }

    const resp = await fetchJSON(`${apiBase}?action=${encodeURIComponent(createAction)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const newId =
      Number(resp?.id_movimiento || 0) ||
      Number(resp?.data?.id_movimiento || 0) ||
      0;

    if (newId <= 0) {
      throw new Error("El backend creó la venta pero no devolvió id_movimiento.");
    }

    movimientoIdRef.current = newId;
    return newId;
  }, [skipMovimientoAutocreacion, data?.id_movimiento, action, buildMovimientoPayload, apiBase, fetchJSON]);

  const guardarFacturaEnDB = useCallback(
    async ({ blob, filename, fact, estado, idMovimiento }) => {
      if (estado !== "emitida") return { exito: true, skip: true };

      const idMovPrincipal = Number(idMovimiento || 0);
      if (idMovPrincipal <= 0) {
        throw new Error("No hay id_movimiento válido para vincular la factura.");
      }

      const fd = new FormData();
      fd.append("tipo", "FACTURA");
      fd.append("id_movimiento", String(idMovPrincipal));
      fd.append(
        "pdf",
        blob instanceof Blob ? blob : new Blob([blob], { type: "application/pdf" }),
        filename || "factura.pdf"
      );

      const meta = {
        tipo: "FACTURA",
        estado: "emitida",
        id_pago: idPago ?? null,
        id_sistema: idSistema ?? null,
        anio: Number(fact?.anio || 0),
        id_mes: Number(fact?.id_mes || 0),
        monto_ars: Number(fact?.imp_total ?? fact?.importe ?? data?.monto ?? 0),
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
        resultado: fact?.resultado ?? null,
        qr_url: fact?.qr_url ?? null,
        qr_base64: fact?.qr_base64 ?? null,
        qr_payload: fact?.qr_payload ?? null,
        items_facturacion: Array.isArray(data?.items_facturacion) ? data.items_facturacion : [],
        total_ars: data?.total_ars ?? null,
        vto_pago: isoToYmd8(vtoPagoISO) || null,
        observaciones: data?.observaciones ?? "",
      };
      fd.append("meta", JSON.stringify(meta));

      const res = await fetch(`${apiBase}?action=comprobantes_vincular_movimiento`, {
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

      if (!res.ok) {
        throw new Error(j?.mensaje || j?.error || `HTTP ${res.status}`);
      }
      if (j && typeof j === "object" && j.exito === false) {
        throw new Error(j?.mensaje || "Error guardando comprobante");
      }

      return j || {};
    },
    [apiBase, data, docTipo, docNro, cbteTipo, ptoVta, vtoPagoISO, idPago, idSistema]
  );

  const finalizarUnaSolaVez = useCallback(
    async (fact) => {
      if (typeof onDone === "function") {
        await Promise.resolve(onDone(fact));
        return;
      }
      if (typeof onFacturada === "function") {
        await Promise.resolve(onFacturada(fact));
      }
    },
    [onDone, onFacturada]
  );

  const exportarSoloPDF = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);
    if (!confirm) return setError("Tenés que confirmar antes de descargar el PDF.");

    setLoadingPdf(true);
    try {
      const idMovimiento = skipMovimientoAutocreacion
        ? null
        : await ensureMovimientoGuardado();

      const importeFinal = forceTestAmount ? Number(testAmount) : Number(monto);

      const factPdfOnly = {
        modo: "pdf_only",
        pto_vta: v.pvN,
        cbte_tipo: Number(cbteTipo),
        cbte_nro: 0,
        fecha_cbte: isoToYmd8(fechaCbteISO),
        imp_total: importeFinal,
        importe: importeFinal,
        cae: "",
        cae_vto: isoToYmd8(vtoPagoISO),
        resultado: "P",
        qr_url: "",
        qr_base64: "",
        qr_payload: null,
        anio: v.anio,
        id_mes: v.id_mes,
        doc_tipo: Number(docTipo),
        doc_nro: v.docN,
        emisor_nombre: emisorNombre || "BALTO",
        emisor_domicilio: emisorDomicilio || "",
        cuit_emisor: emisorCuit || "",
        cond_iva_emisor: emisorCondIva || "",
        ingresos_brutos_emisor: emisorIibb || "",
        fecha_inicio_actividades_emisor: emisorFechaInicio || "",
        receptor_nombre: data?.cliente_facturacion?.razon_social || nombreCliente,
        receptor_domicilio:
          data?.cliente_facturacion?.domicilio || data?.cliente_domicilio || "",
        cond_iva_receptor:
          data?.cliente_facturacion?.cond_iva ||
          data?.cliente_facturacion?.condicion_iva ||
          "",
      };

      const out = await saveBaltoInvoicePdf({
        fact: factPdfOnly,
        data: {
          ...data,
          id_movimiento: idMovimiento,
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

      const blob =
        out?.blob instanceof Blob ? out.blob : out instanceof Blob ? out : null;
      const filename = out?.filename || "factura.pdf";

      let idComprobante = null;

      if (!skipMovimientoAutocreacion && blob && idMovimiento) {
        const dbResp = await guardarFacturaEnDB({
          blob,
          filename,
          fact: {
            ...factPdfOnly,
            anio: v.anio,
            id_mes: v.id_mes,
            importe: importeFinal,
            fecha_cbte: factPdfOnly.fecha_cbte || isoToYmd8(fechaCbteISO),
          },
          estado: "emitida",
          idMovimiento,
        });

        idComprobante =
          dbResp?.id_comprobante ??
          dbResp?.comprobante?.id_comprobante ??
          null;
      }

      const factFinal = {
        ...factPdfOnly,
        id_movimiento: idMovimiento,
        id_comprobante: idComprobante,
        pdf_blob: blob || null,
        pdf_filename: filename,
      };

      await finalizarUnaSolaVez(factFinal);

      onClose?.();
      onCloseAll?.();
    } catch (e) {
      setError(e?.message || "No se pudo descargar el PDF.");
    } finally {
      setLoadingPdf(false);
    }
  }, [
    validar,
    confirm,
    skipMovimientoAutocreacion,
    ensureMovimientoGuardado,
    forceTestAmount,
    testAmount,
    monto,
    cbteTipo,
    docTipo,
    fechaCbteISO,
    vtoPagoISO,
    emisorNombre,
    emisorDomicilio,
    emisorCuit,
    emisorCondIva,
    emisorIibb,
    emisorFechaInicio,
    data,
    nombreCliente,
    nombreSistema,
    items,
    guardarFacturaEnDB,
    finalizarUnaSolaVez,
    onClose,
    onCloseAll,
  ]);

  const emitir = useCallback(async () => {
    setError("");
    const v = validar();
    if (!v.ok) return setError(v.msg);
    if (!confirm) return setError("Tenés que confirmar antes de emitir.");

    setLoading(true);
    try {
      const idMovimiento = skipMovimientoAutocreacion
        ? null
        : await ensureMovimientoGuardado();

      const url = `${apiBase}?action=wsfe_emitir`;

      const body = {
        data: {
          id_movimiento: idMovimiento,
          id_pago: v.id_pago,
          id_sistema: v.id_sistema,
          cliente_facturacion: {
            doc_tipo: Number(docTipo),
            doc_nro: String(v.docN),
            cuit: Number(docTipo) === 80 ? String(v.docN) : "",
            razon_social: data?.cliente_facturacion?.razon_social || null,
            cond_iva:
              data?.cliente_facturacion?.cond_iva ||
              data?.cliente_facturacion?.condicion_iva ||
              null,
            condicion_iva:
              data?.cliente_facturacion?.condicion_iva ||
              data?.cliente_facturacion?.cond_iva ||
              null,
            domicilio: data?.cliente_facturacion?.domicilio || null,
          },

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

          total_ars: forceTestAmount ? Number(testAmount) : Number(monto),
          monto: forceTestAmount ? Number(testAmount) : Number(monto),
          importe: forceTestAmount ? Number(testAmount) : Number(monto),

          anio: v.anio,
          id_mes: v.id_mes,

          fecha_cbte_iso: fechaCbteISO,
          vto_pago_iso: vtoPagoISO,
          fecha_cbte: isoToYmd8(fechaCbteISO),
          vto_pago: isoToYmd8(vtoPagoISO),
          items_facturacion: items,
          observaciones: data?.observaciones || "",

          emisor_nombre: emisorNombre || null,
          emisor_domicilio: emisorDomicilio || null,
          cuit_emisor: emisorCuit || null,
          cond_iva_emisor: emisorCondIva || null,
          ingresos_brutos_emisor: emisorIibb || null,
          fecha_inicio_actividades_emisor: emisorFechaInicio || null,
        },
      };

      const resp = await fetchJSON(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const fact = normalizeFacturaEmitida(resp, {
        pto_vta: v.pvN,
        cbte_tipo: Number(cbteTipo),
        fecha_cbte: fechaCbteISO,
        doc_tipo: Number(docTipo),
        doc_nro: String(v.docN),
      });

      if (!fact?.cae) {
        throw new Error("ARCA no devolvió CAE.");
      }

      const out = await saveBaltoInvoicePdf({
        fact: {
          ...fact,
          anio: v.anio,
          id_mes: v.id_mes,
          importe: Number(fact?.imp_total || monto),
          imp_total: Number(fact?.imp_total || monto),
          fecha_cbte: fact?.fecha_cbte || isoToYmd8(fechaCbteISO),
          cae_vto: fact?.cae_vto || isoToYmd8(vtoPagoISO),
          emisor_nombre: emisorNombre || fact?.emisor_nombre,
          emisor_domicilio: emisorDomicilio || fact?.emisor_domicilio,
          cuit_emisor: emisorCuit || fact?.cuit_emisor,
          cond_iva_emisor: emisorCondIva || fact?.cond_iva_emisor,
          ingresos_brutos_emisor: emisorIibb || fact?.ingresos_brutos_emisor,
          fecha_inicio_actividades_emisor:
            emisorFechaInicio || fact?.fecha_inicio_actividades_emisor,
          receptor_nombre:
            data?.cliente_facturacion?.razon_social || fact?.receptor_nombre,
          receptor_domicilio:
            data?.cliente_facturacion?.domicilio || fact?.receptor_domicilio,
          cond_iva_receptor:
            data?.cliente_facturacion?.cond_iva ||
            data?.cliente_facturacion?.condicion_iva ||
            fact?.cond_iva_receptor,
        },
        data: {
          ...data,
          id_movimiento: idMovimiento,
          labelCliente: nombreCliente,
          labelSistema: nombreSistema,
          fecha_cbte: isoToYmd8(fact?.fecha_cbte || fechaCbteISO),
          vto_pago: isoToYmd8(vtoPagoISO),
          items_facturacion: items,
          total_ars: Number(fact?.imp_total || monto),
          monto: Number(fact?.imp_total || monto),
          importe: Number(fact?.imp_total || monto),
        },
        forceTestAmount,
        testAmount,
        download: true,
      });

      const blob =
        out?.blob instanceof Blob ? out.blob : out instanceof Blob ? out : null;
      const filename = out?.filename || "factura.pdf";
      if (!blob) throw new Error("No se pudo generar el PDF.");

      let idComprobante = null;

      if (!skipMovimientoAutocreacion && idMovimiento) {
        const dbResp = await guardarFacturaEnDB({
          blob,
          filename,
          fact: {
            ...fact,
            anio: v.anio,
            id_mes: v.id_mes,
            importe: Number(fact?.imp_total || monto),
            fecha_cbte: fact?.fecha_cbte || isoToYmd8(fechaCbteISO),
          },
          estado: "emitida",
          idMovimiento,
        });

        idComprobante =
          dbResp?.id_comprobante ??
          dbResp?.comprobante?.id_comprobante ??
          fact?.id_comprobante ??
          null;
      }

      const factFinal = {
        ...fact,
        id_movimiento: idMovimiento,
        id_comprobante: idComprobante,
        pdf_blob: blob,
        pdf_filename: filename,
      };

      await finalizarUnaSolaVez(factFinal);

      onClose?.();
      onCloseAll?.();
    } catch (e) {
      setError(e?.message || "No se pudo emitir la factura.");
    } finally {
      setLoading(false);
    }
  }, [
    validar,
    confirm,
    skipMovimientoAutocreacion,
    ensureMovimientoGuardado,
    apiBase,
    docTipo,
    cbteTipo,
    data,
    forceTestAmount,
    testAmount,
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
    nombreCliente,
    nombreSistema,
    fetchJSON,
    guardarFacturaEnDB,
    finalizarUnaSolaVez,
    onClose,
    onCloseAll,
  ]);

  if (!open) return null;

  const cerrar = () => {
    if (!loading && !loadingPdf) onClose?.();
  };

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && cerrar()
      }
    >
      <div
        className="mi-modal__container mfb-modal-container"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Resumen antes de emitir</h2>
            <p className="mi-modal__subtitle">
              Confirmá datos → Vista previa → Descargar PDF o Emitir + PDF
            </p>
          </div>

          <button
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mit-modal__body">
          <div className="mfb-tabs">
            <button
              type="button"
              className={`mfb-tab ${tabActiva === "resumen" ? "is-active" : ""}`}
              onClick={() => setTabActiva("resumen")}
            >
              Resumen de facturación
            </button>

            <button
              type="button"
              className={`mfb-tab ${tabActiva === "preview" ? "is-active" : ""}`}
              onClick={() => setTabActiva("preview")}
            >
              Vista previa PDF
            </button>
          </div>

          {error && (
            <div className="mov-mi-error mfb-error-top" role="alert">
              {error}
            </div>
          )}

          {tabActiva === "resumen" && (
            <div className="mi-tabpanel padding-tabpanel">
              <div className="mi-card">
                <div className="arca-alert arca-alert--info">
                  <div className="arca-alert__title">
                    <strong>Resumen de facturación</strong>
                  </div>

                  <div className="arca-resumen-grid">
                    <div className="arca-col">
                      <div className="arca-row"><b>Cliente:</b><span>{resumen.cliente}</span></div>
                      <div className="arca-row"><b>Sistema:</b><span>{resumen.sistema}</span></div>
                      <div className="arca-row"><b>Fecha:</b><span>{ymdToHuman(resumen.fechaISO)}</span></div>
                      <div className="arca-row"><b>Vencimiento:</b><span>{ymdToHuman(resumen.vtoISO)}</span></div>
                      <div className="arca-row"><b>Receptor:</b><span>{resumen.receptorTxt}</span></div>
                      <div className="arca-row"><b>Punto de venta:</b><span>{resumen.pvTxt}</span></div>
                      <div className="arca-row"><b>IVA cliente:</b><span>{resumen.iva}</span></div>
                      <div className="arca-row"><b>Domicilio cliente:</b><span>{resumen.domicilio}</span></div>
                    </div>

                    <div className="arca-col">
                      <div className="arca-row"><b>Emisor:</b><span>{emisorNombre}</span></div>
                      <div className="arca-row"><b>CUIT emisor:</b><span>{emisorCuit}</span></div>
                      <div className="arca-row"><b>IVA emisor:</b><span>{emisorCondIva}</span></div>
                      <div className="arca-row"><b>Domicilio comercial:</b><span>{emisorDomicilio}</span></div>
                      <div className="arca-row"><b>Ing. Brutos:</b><span>{emisorIibb}</span></div>
                      <div className="arca-row"><b>Inicio actividades:</b><span>{emisorFechaInicio}</span></div>
                      <div className="arca-row"><b>Monto total:</b><span>{resumen.montoTxt}</span></div>
                      <div className="arca-row"><b>Comprobante:</b><span>{resumen.comprobante}</span></div>
                    </div>
                  </div>

                  <div className="mfb-mt14">
                    <strong>Detalle</strong>
                    <div className="mfb-mt8">
                      {(items || []).map((it, idx) => (
                        <div
                          key={`${it?.id || idx}_${idx}`}
                          className="arca-mini mfb-mb6"
                        >
                          {idx + 1}. {it.descripcion} — Cant: {it.cantidad} — P.Unit:{" "}
                          {moneyARS(it.precio_unitario || it.precio || 0)} — IVA:{" "}
                          {moneyARS(it.iva_monto || 0)} — Total:{" "}
                          {moneyARS(it.total || it.ars || it.subtotal || 0)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="arca-confirm mfb-mt14">
                    <label className="arca-check mfb-check">
                      <input
                        ref={firstRef}
                        type="checkbox"
                        checked={confirm}
                        onChange={(e) => setConfirm(e.target.checked)}
                        disabled={loading || loadingPdf}
                        className="mfb-check__input"
                      />

                      <span className="mfb-check__box">
                        <FaCheck className="mfb-check__icon" />
                      </span>

                      <span className="mfb-check__text">
                        Confirmo que los <b>datos del cliente</b>, del <b>emisor</b>, el <b>detalle</b> y el <b>monto</b> son correctos.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tabActiva === "preview" && (
            <div className="mi-tabpanel ">
              <div className="mi-card">
                <h3 className="mi-card__title">Vista previa del PDF</h3>

                {loadingPreview ? (
                  <div className="arca-alert arca-alert--info">
                    Generando vista previa...
                  </div>
                ) : previewUrl ? (
                  <iframe
                    title="Vista previa factura PDF"
                    src={previewUrl}
                    className="mfb-preview"
                  />
                ) : (
                  <div className="arca-alert arca-alert--error">
                    No se pudo generar la vista previa del PDF.
                  </div>
                )}
              </div>
            </div>
          )}

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
              {loadingPdf ? "Guardando y descargando..." : "Descargar PDF"}
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={emitir}
              disabled={loading || loadingPdf || !confirm}
            >
              {loading ? (
                "Emitiendo..."
              ) : (
                <>
                  Emitir + PDF <FaCheck className="mfb-icon" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}