import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "./ModalPagarRecibos.css";
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faCheck,
  faListCheck,
  faMoneyBill1Wave,
  faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";

import ModalReciboGenerado from "./ModalReciboGenerado";
import ModalNuevoChequeRecibo from "./ModalNuevoChequeRecibo";
import { buildReciboHTML } from "../../../../utils/reciboTemplate";

/* =========================
   Helpers
========================= */
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
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
  return s;
}

function todayDMY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
}

function getSessionKey() {
  return (localStorage.getItem("session_key") || "").trim();
}

function buildAuthHeaders() {
  const session = getSessionKey();
  const headers = {};
  if (session) headers["X-Session"] = session;
  return headers;
}

function normalizeMediosPago(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const src = root.listas && typeof root.listas === "object" ? root.listas : root;

  const arr = Array.isArray(src.medios_pago)
    ? src.medios_pago
    : Array.isArray(src.mediosPago)
    ? src.mediosPago
    : [];

  return arr
    .map((x) => ({
      id: Number(x?.id ?? x?.id_medio_pago ?? 0) || 0,
      nombre: String(x?.nombre ?? x?.medio_pago ?? "").trim(),
    }))
    .filter((x) => x.id > 0 && x.nombre);
}

function isPagadoRow(row) {
  if (row?.pagado === true) return true;
  const cob = Number(row?.cobrado_total ?? 0);
  if (Number.isFinite(cob) && cob > 0.00001) return true;
  return false;
}

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isMedioPagoCheque(mediosPagoList, idMedioPago) {
  const id = Number(idMedioPago);
  if (!Number.isFinite(id) || id <= 0) return false;
  const medio = (Array.isArray(mediosPagoList) ? mediosPagoList : []).find(
    (x) => Number(x?.id ?? x?.id_medio_pago ?? 0) === id
  );
  if (!medio) return false;
  const nombre = normalizeText(medio?.nombre ?? "");
  return nombre.includes("cheque") || nombre.includes("echeq");
}

function isMedioPagoEcheq(mediosPagoList, idMedioPago) {
  const id = Number(idMedioPago);
  if (!Number.isFinite(id) || id <= 0) return false;
  const medio = (Array.isArray(mediosPagoList) ? mediosPagoList : []).find(
    (x) => Number(x?.id ?? x?.id_medio_pago ?? 0) === id
  );
  if (!medio) return false;
  const nombre = normalizeText(medio?.nombre ?? "");
  return nombre.includes("echeq");
}

function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  const token = localStorage.getItem("token") || "";
  return { token, sessionKey };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  try {
    const data = JSON.parse(text);
    if (!res.ok || data?.exito === false) {
      throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}`);
  }
}

async function fetchJsonOrThrow(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 700 ? text.slice(0, 700) + "..." : text;
    throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
  }
  if (!res.ok) throw new Error(data?.mensaje || `HTTP ${res.status}`);
  if (data?.exito === false) throw new Error(data?.mensaje || "Operación fallida.");
  return data;
}

/* =========================
   Sub-componentes
========================= */
function EstadoChip({ pagado }) {
  return (
    <span className={`mpr-chip ${pagado ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {pagado ? "PAGADO" : "PENDIENTE"}
    </span>
  );
}

/* =========================
   COMPONENTE PRINCIPAL
========================= */
export default function ModalPagarRecibos({
  open,
  onClose,
  onConfirm,
  onToast,
  onAfterPaid,
  cliente,
  deudas = [],
  onFactura,
  onReciboFinalizado,
  lists,
}) {
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);
  const tbodyRef = useRef(null);
  const [tbodyHasScroll, setTbodyHasScroll] = useState(false);

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isTemaOscuro()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(() => []);

  const mediosPagoFromContext = useMemo(() => normalizeMediosPago(lists || {}), [lists]);

  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [idMedioPago, setIdMedioPago] = useState("");

  const [openRecibo, setOpenRecibo] = useState(false);
  const [reciboHtml, setReciboHtml] = useState("");
  const [reciboTitle, setReciboTitle] = useState("Recibo");
  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId, setUltimoCobroId] = useState(null);

  const [openChequeModal, setOpenChequeModal] = useState(false);
  const [chequeGuardado, setChequeGuardado] = useState(null);
  const [savingCheque, setSavingCheque] = useState(false);

  const esMedioPagoCheque = useMemo(
    () => isMedioPagoCheque(mediosPago, idMedioPago),
    [mediosPago, idMedioPago]
  );

  const tipoChequeDetectado = useMemo(
    () => (isMedioPagoEcheq(mediosPago, idMedioPago) ? "echeq" : "cheque"),
    [mediosPago, idMedioPago]
  );

  const fetchMediosPagoFallback = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const url = `${BASE_URL}/api.php?action=global_obtener_listas`;
      const data = await fetchJsonOrThrow(url, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      setMediosPago(normalizeMediosPago(data));
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
      setIdMedioPago("");
    } finally {
      setLoadingMedios(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setPagaTodo(false);
    setNota("");
    setLoading(false);
    setRows(Array.isArray(deudas) ? [...deudas] : []);
    setOpenRecibo(false);
    setReciboHtml("");
    setReciboTitle("Recibo");
    setIdsMovimientosPagados([]);
    setUltimoCobroId(null);

    if (mediosPagoFromContext.length > 0) {
      setMediosPago(mediosPagoFromContext);
      setLoadingMedios(false);
    } else {
      setMediosPago([]);
      fetchMediosPagoFallback();
    }

    setIdMedioPago("");
    setChequeGuardado(null);
    setOpenChequeModal(false);
    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, deudas, mediosPagoFromContext, fetchMediosPagoFallback]);

  useEffect(() => {
    if (!open || openRecibo) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!loading) onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openRecibo, onClose, loading]);

  useEffect(() => {
    if (!esMedioPagoCheque && chequeGuardado) {
      setChequeGuardado(null);
      setOpenChequeModal(false);
    }
  }, [esMedioPagoCheque, chequeGuardado]);

  const deudasOrdenadas = useMemo(() => {
    const arr = Array.isArray(rows) ? [...rows] : [];
    arr.sort((a, b) => {
      const fa = String(a?.fecha || "");
      const fb = String(b?.fecha || "");
      if (fa === fb) return Number(b?.id_movimiento || 0) - Number(a?.id_movimiento || 0);
      return fb.localeCompare(fa);
    });
    return arr;
  }, [rows]);

  const totalSeleccionado = useMemo(() => {
    let sum = 0;
    for (const r of deudasOrdenadas) {
      const id = Number(r?.id_movimiento || 0);
      if (!id) continue;
      if (selectedIds.has(id)) sum += Number(r?.monto_total ?? r?.total ?? 0) || 0;
    }
    return sum;
  }, [deudasOrdenadas, selectedIds]);

  const cantSeleccionadas = useMemo(() => selectedIds.size, [selectedIds]);

  const recomputeTbodyScroll = useCallback(() => {
    const el = tbodyRef.current;
    if (!el) return;
    setTbodyHasScroll(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    if (!open || openRecibo) return;
    const t = setTimeout(recomputeTbodyScroll, 0);
    const el = tbodyRef.current;
    if (!el) return () => clearTimeout(t);
    const ro = new ResizeObserver(() => recomputeTbodyScroll());
    ro.observe(el);
    const mo = new MutationObserver(() => recomputeTbodyScroll());
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", recomputeTbodyScroll);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", recomputeTbodyScroll);
    };
  }, [open, openRecibo, recomputeTbodyScroll, deudasOrdenadas.length]);

  const toggleOne = (id, row) => {
    if (!id || loading || isPagadoRow(row)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const pendientes = deudasOrdenadas.filter((x) => !isPagadoRow(x));
      setPagaTodo(next.size === pendientes.length && pendientes.length > 0);
      return next;
    });
  };

  const toggleAll = () => {
    if (loading) return;
    const pendientes = deudasOrdenadas
      .filter((r) => !isPagadoRow(r))
      .map((r) => Number(r?.id_movimiento || 0))
      .filter(Boolean);
    setSelectedIds((prev) => {
      const next = new Set();
      const shouldSelectAll = prev.size !== pendientes.length;
      if (shouldSelectAll) pendientes.forEach((id) => next.add(id));
      setPagaTodo(shouldSelectAll);
      return next;
    });
  };

  const confirmPagoDefault = async ({ ids_movimiento, id_medio_pago }) => {
    const url = `${BASE_URL}/api.php?action=recibos_confirmar_pago`;
    return await fetchJsonOrThrow(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
      body: JSON.stringify({ ids_movimiento, id_medio_pago }),
    });
  };

  const API_RECIBOS_CHEQUES_GUARDAR = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php?action=recibos_cheques_guardar`;

  const guardarChequeEnBackend = useCallback(async (idMovimiento, datosCheque) => {
    if (!datosCheque) return null;
    const fd = new FormData();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("tipo", datosCheque.tipo_cheque || "cheque");
    fd.append("fecha_emision", datosCheque.fecha_emision || new Date().toISOString().slice(0, 10));
    fd.append("emisor", datosCheque.emisor || "");
    fd.append("numero_cheque", datosCheque.numero_cheque || "");
    fd.append("importe", String(datosCheque.importe || 0));
    fd.append("fecha_pago", datosCheque.fecha_pago || new Date().toISOString().slice(0, 10));
    fd.append("observaciones", datosCheque.observaciones || "");
    if (datosCheque.archivo instanceof File) {
      fd.append("archivo", datosCheque.archivo, datosCheque.archivo_nombre || datosCheque.archivo.name || "adjunto");
    }
    const { token, sessionKey } = getAuthInfo();
    const headers = {};
    if (sessionKey) headers["X-Session"] = sessionKey;
    else if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API_RECIBOS_CHEQUES_GUARDAR, { method: "POST", headers, body: fd });
    return await parseJsonOrThrow(res);
  }, []);

  const handleSaveCheque = useCallback(async (datosCheque) => {
    if (savingCheque) return;
    if (!datosCheque.emisor) { onToast?.("advertencia", "El emisor es obligatorio.", 3000); return; }
    if (!datosCheque.numero_cheque) { onToast?.("advertencia", "El número de cheque es obligatorio.", 3000); return; }
    if (!datosCheque.importe || Number(datosCheque.importe) <= 0) { onToast?.("advertencia", "El importe debe ser mayor a 0.", 3000); return; }
    if (!datosCheque.fecha_pago) { onToast?.("advertencia", "La fecha de pago es obligatoria.", 3000); return; }
    setChequeGuardado(datosCheque);
    setOpenChequeModal(false);
    onToast?.("exito", `Cheque ${datosCheque.numero_cheque} cargado correctamente.`, 3200);
  }, [savingCheque, onToast]);

  const buildReciboFromSeleccion = useCallback(({ clienteInfo, mp, seleccion }) => {
    const items = seleccion.map((r) => ({
      id_movimiento: r?.id_movimiento,
      fecha: r?.fecha,
      descripcion: r?.detalle ?? r?.descripcion ?? r?.concepto,
      monto: Number(r?.monto_total ?? r?.total ?? 0) || 0,
    }));
    const total = items.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
    const payload = {
      fecha_cobro: todayDMY(),
      cliente: { id_cliente: clienteInfo?.id_cliente ?? null, nombre: clienteInfo?.nombre ?? cliente?.cliente ?? "" },
      medio_pago: { id: mp?.id, nombre: mp?.nombre },
      total,
      items,
    };
    return {
      html: buildReciboHTML(payload),
      title: `Recibo - ${payload?.cliente?.nombre || "Cliente"}`,
    };
  }, [cliente]);

  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) { onToast?.("error", "Este cliente no tiene registros.", 2600); return; }
    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });
    if (seleccion.length === 0) { onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para pagar.", 2600); return; }
    if (!idMedioPago) { onToast?.("error", "Seleccioná un medio de pago.", 2600); return; }
    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) { onToast?.("error", "Medio de pago inválido. Reintentá.", 2800); return; }
    if (esMedioPagoCheque && !chequeGuardado) { onToast?.("error", `Debés cargar los datos del ${tipoChequeDetectado} antes de confirmar el pago.`, 3200); return; }
    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);
    try {
      setLoading(true);
      if (esMedioPagoCheque && chequeGuardado) {
        setSavingCheque(true);
        try {
          for (const idMovimiento of ids) await guardarChequeEnBackend(idMovimiento, chequeGuardado);
          onToast?.("exito", `${tipoChequeDetectado === "echeq" ? "Echeq" : "Cheque"} guardado correctamente.`, 3000);
        } catch (err) {
          onToast?.("error", `Error al guardar ${tipoChequeDetectado}: ${err.message}`, 4200);
          setLoading(false);
          setSavingCheque(false);
          return;
        }
        setSavingCheque(false);
      }
      let resp = null;
      if (onConfirm) {
        resp = await onConfirm({
          cliente: { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" },
          seleccion, totalSeleccionado, nota: nota.trim(),
          id_medio_pago: mp.id, medio_pago: mp.nombre,
          ids_movimiento: ids, cheque_data: esMedioPagoCheque ? chequeGuardado : null,
        });
      } else {
        resp = await confirmPagoDefault({ ids_movimiento: ids, id_medio_pago: mp.id });
      }
      const idsCobroResp = Array.isArray(resp?.ids_cobro) ? resp.ids_cobro.map((x) => Number(x || 0)).filter(Boolean) : [];
      setIdsMovimientosPagados(ids);
      setUltimoCobroId(Number(idsCobroResp?.[0] || resp?.id_cobro || 0) || null);
      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const id = Number(r?.id_movimiento || 0);
          if (!id || !ids.includes(id)) return r;
          return { ...r, cobrado_total: Number(r?.monto_total ?? r?.total ?? 0) || 0, pagado: true, id_medio_pago: mp.id, medio_pago_nombre: mp.nombre };
        })
      );
      onAfterPaid?.(ids, mp);
      const built = buildReciboFromSeleccion({ clienteInfo: { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" }, mp, seleccion });
      setReciboHtml(built.html);
      setReciboTitle(built.title);
      setOpenRecibo(true);
      setSelectedIds(new Set());
      setPagaTodo(false);
      setChequeGuardado(null);
      onToast?.("exito", "Pago realizado correctamente.", 3000);
      setTimeout(recomputeTbodyScroll, 0);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4200);
    } finally {
      setLoading(false);
    }
  };

  const handleFactura = async () => {
    if (!onFactura) { onToast?.("error", "Falta conectar la acción de factura (onFactura).", 3200); return; }
    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });
    if (!deudasOrdenadas.length) { onToast?.("error", "Este cliente no tiene registros.", 2600); return; }
    if (seleccion.length === 0) { onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para facturar.", 2600); return; }
    if (!idMedioPago) { onToast?.("error", "Seleccioná un medio de pago.", 2600); return; }
    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) { onToast?.("error", "Medio de pago inválido. Reintentá.", 2800); return; }
    if (esMedioPagoCheque && !chequeGuardado) { onToast?.("error", `Debés cargar los datos del ${tipoChequeDetectado} antes de facturar.`, 3200); return; }
    try {
      setLoading(true);
      await onFactura({
        cliente: { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" },
        seleccion, totalSeleccionado, nota: nota.trim(),
        id_medio_pago: mp.id, medio_pago: mp.nombre,
        cheque_data: esMedioPagoCheque ? chequeGuardado : null,
      });
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo generar la factura.", 4200);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const modalClass = ["mi-modal__container", "mi-modal__container--mov", "mpr-modal", dark ? "mi-modal--dark" : ""].join(" ").trim();
  const overlayClass = ["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim();

  return createPortal(
    <>
      {!openRecibo && (
        <div className={overlayClass} role="dialog" aria-modal="true">
          <div className={modalClass} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>

            {/* ── HEADER ── */}
            <div className="mi-modal__header mpr-header">
              <div className="mi-modal__head-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faMoneyBill1Wave} />
              </div>
              <div className="mi-modal__head-left">
                <h2 className="mi-modal__title">
                  Pagar
                  <span className="mpr-header-dot">·</span>
                  <span className="mpr-header-cliente">{safeText(cliente?.cliente)}</span>
                  {cliente?.id_cliente && (
                    <span className="mpr-header-id">ID {String(cliente.id_cliente)}</span>
                  )}
                </h2>
                <p className="mi-modal__subtitle">
                  Pendientes y pagadas · las pagadas quedan bloqueadas
                </p>
              </div>
              <button
                ref={firstFocusRef}
                type="button"
                className="mi-modal__close"
                onClick={onClose}
                title="Cerrar"
                disabled={loading}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {/* ── CONTENT ── */}
            <div className="mi-modal__content mpr-content-wrap">
              <div className="mpr-layout">

                {/* ── TABLA (izquierda) ── */}
                <section className="mpr-table-section">
                  {/* Thead */}
                  <div className="mpr-thead">
                    <div className="mpr-th mpr-th--sel">Sel</div>
                    <div className="mpr-th">Fecha</div>
                    <div className="mpr-th mpr-th--desc">Descripción</div>
                    <div className="mpr-th mpr-th--center">Estado</div>
                    <div className="mpr-th mpr-th--right">Monto</div>
                  </div>

                  {/* Tbody */}
                  <div
                    ref={tbodyRef}
                    className={`mpr-tbody ${tbodyHasScroll ? "mpr-tbody--scroll" : ""}`}
                  >
                    {!deudasOrdenadas.length && (
                      <div className="mpr-empty">No hay registros para este cliente.</div>
                    )}
                    {deudasOrdenadas.map((r, idx) => {
                      const id = Number(r?.id_movimiento || 0);
                      const pagado = isPagadoRow(r);
                      const checked = selectedIds.has(id);
                      const monto = Number(r?.monto_total ?? r?.total ?? 0) || 0;
                      return (
                        <div
                          key={id || `${r?.fecha}-${idx}`}
                          className={`mpr-row ${checked ? "is-checked" : ""} ${pagado ? "is-paid" : ""}`}
                          role="row"
                          onClick={() => id && toggleOne(id, r)}
                          title={pagado ? "Este registro ya está PAGADO" : undefined}
                        >
                          <div className="mpr-td mpr-td--sel" onClick={(e) => e.stopPropagation()}>
                            <label className={`mpr-check ${!id || loading || pagado ? "is-disabled" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(id, r)}
                                disabled={!id || loading || pagado}
                              />
                              <span className="mpr-check__box" aria-hidden="true" />
                            </label>
                          </div>
                          <div className="mpr-td">{safeText(formatFechaDMY(r?.fecha))}</div>
                          <div className="mpr-td mpr-td--desc" title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}>
                            {safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                          </div>
                          <div className="mpr-td mpr-td--center">
                            <EstadoChip pagado={pagado} />
                          </div>
                          <div className="mpr-td mpr-td--right mpr-td--mono">{moneyARS(monto)}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tfoot */}
                  <div className="mpr-tfoot">
                    <div className="mpr-tfoot-stats">
                      <span className="mpr-stat">Total <b>{deudasOrdenadas.length}</b></span>
                      <span className="mpr-stat-sep" />
                      <span className="mpr-stat">Seleccionadas <b>{cantSeleccionadas}</b></span>
                    </div>
                    <div className="mpr-tfoot-totals">
                      <div className="mpr-total-pill">
                        <span>Total seleccionado</span>
                        <b>{moneyARS(totalSeleccionado)}</b>
                      </div>
                    </div>
                  </div>
                </section>

                {/* ── ASIDE (derecha) ── */}
                <aside className="mpr-aside">
                  <div className="mpr-aside__top">
                    <div className="mpr-aside__title">Datos del pago</div>
                  </div>

                  <div className="mpr-aside__body">

                    {/* Medio de pago */}
                    <div className="fl-field">
                      <div className="mpr-select-wrap">
                        <select
                          className="fl-input fl-select"
                          value={idMedioPago}
                          onChange={(e) => setIdMedioPago(e.target.value)}
                          disabled={loading || loadingMedios}
                        >
                          <option value="">
                            {loadingMedios ? "Cargando…" : "Seleccionar medio de pago…"}
                          </option>
                          {!loadingMedios && mediosPago.length === 0 && (
                            <option value="" disabled>(Sin medios de pago)</option>
                          )}
                          {mediosPago.map((x) => (
                            <option key={x.id} value={String(x.id)}>{x.nombre}</option>
                          ))}
                        </select>
                        <label className="fl-label">Medio de pago *</label>
                        {loadingMedios && (
                          <span className="mpr-select-spinner">
                            <FontAwesomeIcon icon={faCircleNotch} spin />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Seleccionar todo */}
                    <button
                      type="button"
                      className="nv-foot-btn mpr-btn-selall"
                      onClick={toggleAll}
                      disabled={!deudasOrdenadas.length || loading}
                    >
                      <span className="nv-foot-btn__icon">
                        <FontAwesomeIcon icon={faListCheck} style={{ fontSize: 10 }} />
                      </span>
                      {pagaTodo ? "Deseleccionar todas" : "Seleccionar todas"}
                    </button>

                    {/* Cheque / Echeq */}
                    {esMedioPagoCheque && (
                      <div className="mi-card mi-card--full mpr-cheque-card">
                        <div className="mi-card__title">
                          {tipoChequeDetectado === "echeq" ? "Echeq" : "Cheque"}
                        </div>

                        {chequeGuardado ? (
                          <div className="mpr-cheque-loaded">
                            <div className="mpr-cheque-info">
                              <div className="mpr-cheque-info__ok">
                                ✓ {tipoChequeDetectado === "echeq" ? "Echeq" : "Cheque"} cargado
                              </div>
                              <div className="mpr-cheque-info__row"><b>N°:</b> {chequeGuardado.numero_cheque}</div>
                              <div className="mpr-cheque-info__row"><b>Emisor:</b> {chequeGuardado.emisor}</div>
                              <div className="mpr-cheque-info__row">
                                <b>Importe:</b> {Number(chequeGuardado.importe || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
                              </div>
                              <div className="mpr-cheque-info__row"><b>Fecha pago:</b> {chequeGuardado.fecha_pago}</div>
                              {chequeGuardado.archivo_nombre && (
                                <div className="mpr-cheque-info__row"><b>Archivo:</b> {chequeGuardado.archivo_nombre}</div>
                              )}
                            </div>
                            <div className="mpr-cheque-actions">
                              <button type="button" className="mit-btn mit-btn--ghost" onClick={() => setOpenChequeModal(true)} disabled={loading}>
                                Editar
                              </button>
                              <button type="button" className="mit-btn mit-btn--ghost" onClick={() => setChequeGuardado(null)} disabled={loading}>
                                Quitar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mit-btn mit-btn--solid"
                            style={{ width: "100%", marginTop: 4 }}
                            onClick={() => setOpenChequeModal(true)}
                            disabled={loading}
                          >
                            Cargar {tipoChequeDetectado === "echeq" ? "echeq" : "cheque"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Acciones finales */}
                                          <button
                        type="button"
                        className="mit-btn mit-btn--ghost mit-btn--block"
                        onClick={handleFactura}
                        disabled={loading || selectedIds.size === 0 || !idMedioPago || !onFactura || (esMedioPagoCheque && !chequeGuardado)}
                        title={
                          !onFactura ? "Acción no conectada"
                          : selectedIds.size === 0 ? "Seleccioná al menos una deuda pendiente"
                          : !idMedioPago ? "Seleccioná un medio de pago"
                          : esMedioPagoCheque && !chequeGuardado ? `Cargá los datos del ${tipoChequeDetectado} primero`
                          : "Hacer factura"
                        }
                      >
                        <FontAwesomeIcon icon={faMoneyBill1Wave} />
                        Hacer factura
                      </button>
                    <div className="mpr-aside__actions">


                      <button
                        type="button"
                        className="mit-btn mit-btn--solid mit-btn--block"
                        onClick={handleConfirm}
                        disabled={loading || selectedIds.size === 0 || !idMedioPago || (esMedioPagoCheque && !chequeGuardado)}
                      >
                        
                        {loading ? "Procesando…" : "Confirmar pago"}
                      </button>

                      <button
                        type="button"
                        className="mit-btn mit-btn--ghost mit-btn--block"
                        onClick={onClose}
                        disabled={loading}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      )}

      <ModalReciboGenerado
        open={openRecibo}
        html={reciboHtml}
        title={reciboTitle}
        onToast={onToast}
        onClose={() => { setOpenRecibo(false); onClose?.(); }}
        idsMovimientos={idsMovimientosPagados}
        idCobro={ultimoCobroId}
        onFinalizar={(saved) => {
          onReciboFinalizado?.(saved, { idsMovimiento: idsMovimientosPagados, idCobro: ultimoCobroId });
          setOpenRecibo(false);
          onClose?.();
        }}
      />

      <ModalNuevoChequeRecibo
        open={openChequeModal}
        onClose={() => setOpenChequeModal(false)}
        onSave={handleSaveCheque}
        tipoCheque={tipoChequeDetectado}
        datosIniciales={chequeGuardado}
        importeTotal={totalSeleccionado}
        cliente={cliente?.cliente}
        onToast={onToast}
      />
    </>,
    document.body
  );
}