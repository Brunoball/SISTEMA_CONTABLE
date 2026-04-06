import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_Modals_nueva_compra.css";
import "./ModalPagarRecibos.css";
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faListCheck,
  faMoneyBill1Wave,
  faCircleNotch,
  faMoneyCheckDollar,
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
    const mm   = String(Number(m1[2])).padStart(2, "0");
    const dd   = String(Number(m1[3])).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

function todayDMY() {
  const d    = new Date();
  const dd   = String(d.getDate()).padStart(2, "0");
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
}

function getSessionKey() {
  return (localStorage.getItem("session_key") || "").trim();
}

function buildAuthHeaders(includeJson = false) {
  const sessionKey = getSessionKey();
  const token      = (localStorage.getItem("token") || "").trim();
  const headers    = {};
  if (includeJson) headers["Content-Type"]  = "application/json";
  if (sessionKey)  headers["X-Session"]     = sessionKey;
  if (token)       headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function normalizeMediosPago(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const src  = root.listas && typeof root.listas === "object" ? root.listas : root;
  const arr  = Array.isArray(src.medios_pago)
    ? src.medios_pago
    : Array.isArray(src.mediosPago)
    ? src.mediosPago
    : [];
  return arr
    .map((x) => ({
      id:     Number(x?.id ?? x?.id_medio_pago ?? 0) || 0,
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

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency", currency: "ARS",
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  } catch {
    return `$ ${n.toFixed(2)}`;
  }
}

function parseMoneyInputARS(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\$/g, "").replace(/\s+/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}

function normalizeChequeTipoFromMedio(nombre) {
  const s = String(nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq")) return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
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
    localStorage.getItem("session_key")  ||
    localStorage.getItem("sessionKey")   ||
    localStorage.getItem("x_session")    ||
    localStorage.getItem("X-Session")    || "";
  const token = localStorage.getItem("token") || "";
  return { token, sessionKey };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    const data = JSON.parse(text);
    if (!res.ok || data?.exito === false)
      throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}`);
  }
}

async function fetchJsonOrThrow(url, opts = {}) {
  const res  = await fetch(url, opts);
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data;
  try { data = JSON.parse(text); }
  catch {
    const preview = text.length > 700 ? text.slice(0, 700) + "..." : text;
    throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
  }
  if (!res.ok)              throw new Error(data?.mensaje || `HTTP ${res.status}`);
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

/* ─────────────────────────────────────────────────────────
   TARJETAS DE CHEQUES — diseño minimalista nc-*
   Fila compacta: checkbox · número + meta · importe
───────────────────────────────────────────────────────── */
function ChequesCarteraCards({ cheques, idsSeleccionados, onToggle, esEcheq = false }) {
  if (!cheques.length) return null;

  /* colores según tipo */
  const accent       = esEcheq ? "#0055BB"             : "#0f766e";
  const accentBg     = esEcheq ? "rgba(0,85,187,.07)"  : "rgba(15,118,110,.07)";
  const accentBorder = esEcheq ? "rgba(0,85,187,.28)"  : "rgba(15,118,110,.28)";
  const accentGlow   = esEcheq ? "rgba(0,85,187,.10)"  : "rgba(15,118,110,.10)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {cheques.map((ch, idx) => {
        const checked = idsSeleccionados.includes(String(ch?.id_cheque));

        return (
          <div
            key={ch?.id_cheque || idx}
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            onClick={() => onToggle(String(ch?.id_cheque || ""))}
            onKeyDown={(e) =>
              (e.key === " " || e.key === "Enter") &&
              onToggle(String(ch?.id_cheque || ""))
            }
            style={{
              display: "grid",
              gridTemplateColumns: "16px 1fr auto",
              alignItems: "center",
              gap: 10,
              padding: "9px 11px",
              border: checked
                ? `1.5px solid ${accent}`
                : "1.5px solid var(--nv-border-md)",
              borderRadius: 9,
              background: checked ? accentBg : "var(--nv-bg)",
              cursor: "pointer",
              transition: "border-color .14s, background .14s, box-shadow .14s",
              boxShadow: checked ? `0 0 0 3px ${accentGlow}` : "var(--nv-shadow-sm)",
              outline: "none",
              userSelect: "none",
            }}
          >
            {/* ── Checkbox visual ── */}
            <div
              aria-hidden="true"
              style={{
                width: 16, height: 16,
                borderRadius: 4,
                border: checked ? `2px solid ${accent}` : "1.5px solid var(--nv-border-md)",
                background: checked ? accent : "var(--nv-bg)",
                display: "grid", placeItems: "center",
                flexShrink: 0,
                transition: "all .14s",
              }}
            >
              {checked && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path
                    d="M1 3.5L3.5 6L8 1"
                    stroke="#fff"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            {/* ── Info principal ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              {/* número + badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12, fontWeight: 700,
                  color: "var(--nv-text)", letterSpacing: ".04em",
                }}>
                  N°&nbsp;{safeText(ch?.numero_cheque)}
                </span>
                {esEcheq && (
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: ".07em",
                    color: accent,
                    background: accentBg,
                    border: `1px solid ${accentBorder}`,
                    borderRadius: 999, padding: "1px 5px", lineHeight: 1.5,
                  }}>
                    eCheq
                  </span>
                )}
              </div>

              {/* emisor · fecha pago */}
              <div style={{
                display: "flex", flexWrap: "wrap", gap: "2px 8px",
                fontSize: 11, color: "var(--nv-muted)", lineHeight: 1.3,
              }}>
                <span style={{
                  maxWidth: 120,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {safeText(ch?.emisor)}
                </span>
                <span style={{ opacity: .4 }}>·</span>
                <span>Pago:&nbsp;{safeText(formatFechaDMY(ch?.fecha_pago))}</span>
              </div>
            </div>

            {/* ── Importe ── */}
            <span style={{
              fontSize: 13, fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              color: checked ? accent : "var(--nv-text)",
              whiteSpace: "nowrap",
              transition: "color .14s",
            }}>
              {moneyARS(ch?.importe || 0)}
            </span>
          </div>
        );
      })}
    </div>
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
  const dialogRef     = useRef(null);
  const firstFocusRef = useRef(null);
  const tbodyRef      = useRef(null);
  const [tbodyHasScroll, setTbodyHasScroll] = useState(false);

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isTemaOscuro()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo,    setPagaTodo]    = useState(false);
  const [nota,        setNota]        = useState("");
  const [loading,     setLoading]     = useState(false);
  const [rows,        setRows]        = useState(() => []);

  const mediosPagoFromContext = useMemo(() => normalizeMediosPago(lists || {}), [lists]);

  const [mediosPago,    setMediosPago]    = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [idMedioPago,   setIdMedioPago]   = useState("");
  const [monto,         setMonto]         = useState(0);
  const [montoDraft,    setMontoDraft]    = useState("");
  const [montoFocused,  setMontoFocused]  = useState(false);

  const [openRecibo,            setOpenRecibo]            = useState(false);
  const [reciboHtml,            setReciboHtml]            = useState("");
  const [reciboTitle,           setReciboTitle]           = useState("Recibo");
  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId,         setUltimoCobroId]         = useState(null);

  const [openChequeModal, setOpenChequeModal] = useState(false);
  const [chequeGuardado,  setChequeGuardado]  = useState(null);
  const [savingCheque,    setSavingCheque]    = useState(false);

  const [chequesCartera,          setChequesCartera]          = useState([]);
  const [loadingCheques,          setLoadingCheques]          = useState(false);
  const [idsChequesSeleccionados, setIdsChequesSeleccionados] = useState([]);

  const esMedioPagoCheque = useMemo(
    () => isMedioPagoCheque(mediosPago, idMedioPago),
    [mediosPago, idMedioPago]
  );
  const tipoChequeDetectado = useMemo(
    () => (isMedioPagoEcheq(mediosPago, idMedioPago) ? "echeq" : "cheque"),
    [mediosPago, idMedioPago]
  );

  /* ── fetch helpers ── */
  const fetchMediosPagoFallback = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const data = await fetchJsonOrThrow(
        `${BASE_URL}/api.php?action=global_obtener_listas`,
        { method: "GET", headers: buildAuthHeaders(false) }
      );
      setMediosPago(normalizeMediosPago(data));
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
      setIdMedioPago("");
    } finally {
      setLoadingMedios(false);
    }
  }, [onToast]);

  const fetchChequesCartera = useCallback(async (tipo) => {
    try {
      setLoadingCheques(true);
      setChequesCartera([]);
      setIdsChequesSeleccionados([]);
      const sp = new URLSearchParams();
      sp.set("action", "ordenes_pago_cheques_cartera_listar");
      sp.set("tipo", tipo);
      const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?${sp.toString()}`, {
        method: "GET", headers: buildAuthHeaders(false),
      });
      setChequesCartera(Array.isArray(data?.cheques) ? data.cheques : []);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los cheques.", 4000);
      setChequesCartera([]);
    } finally {
      setLoadingCheques(false);
    }
  }, [onToast]);

  /* ── reset on open ── */
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
    setChequesCartera([]);
    setLoadingCheques(false);
    setIdsChequesSeleccionados([]);
    setIdMedioPago("");
    setMonto(0);
    setMontoDraft("");
    setMontoFocused(false);
    setChequeGuardado(null);
    setOpenChequeModal(false);

    if (mediosPagoFromContext.length > 0) {
      setMediosPago(mediosPagoFromContext);
      setLoadingMedios(false);
    } else {
      setMediosPago([]);
      fetchMediosPagoFallback();
    }
    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, deudas, mediosPagoFromContext, fetchMediosPagoFallback]);

  /* ── cambio de medio de pago ── */
  const handleChangeMedioPago = useCallback(async (val) => {
    setIdMedioPago(val);
    setMonto(0); setMontoDraft(""); setMontoFocused(false);
    setChequeGuardado(null);
    setChequesCartera([]); setIdsChequesSeleccionados([]);
    if (!val) return;
    const mp   = mediosPago.find((x) => String(x.id) === String(val));
    const tipo = normalizeChequeTipoFromMedio(mp?.nombre || "");
    if (tipo !== null) await fetchChequesCartera(tipo);
  }, [mediosPago, fetchChequesCartera]);

  /* ── ESC ── */
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
    if (!esMedioPagoCheque) {
      setChequeGuardado(null); setOpenChequeModal(false);
      setChequesCartera([]); setIdsChequesSeleccionados([]);
    }
  }, [esMedioPagoCheque]);

  /* ── datos derivados ── */
  const deudasOrdenadas = useMemo(() => {
    const arr = Array.isArray(rows) ? [...rows] : [];
    arr.sort((a, b) => {
      const fa = String(a?.fecha || "");
      const fb = String(b?.fecha || "");
      if (fa === fb)
        return Number(b?.id_movimiento || 0) - Number(a?.id_movimiento || 0);
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

  const importeChequesSeleccionados = useMemo(() => {
    if (!esMedioPagoCheque || !idsChequesSeleccionados.length) return 0;
    return idsChequesSeleccionados.reduce((acc, idStr) => {
      const ch = chequesCartera.find((x) => String(x.id_cheque) === idStr);
      return acc + (ch ? Number(ch.importe || 0) : 0);
    }, 0);
  }, [esMedioPagoCheque, idsChequesSeleccionados, chequesCartera]);

  const cantSeleccionadas      = useMemo(() => selectedIds.size, [selectedIds]);
  const montoActual            = esMedioPagoCheque ? importeChequesSeleccionados : safeNumber(monto);
  const diferenciaRestante     = Math.max(0, totalSeleccionado - montoActual);
  const puedeCompletarRestante =
    !loading && !esMedioPagoCheque && totalSeleccionado > 0 && diferenciaRestante > 0.009;

  /* ── scroll tbody ── */
  const recomputeTbodyScroll = useCallback(() => {
    const el = tbodyRef.current;
    if (!el) return;
    setTbodyHasScroll(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    if (!open || openRecibo) return;
    const t  = setTimeout(recomputeTbodyScroll, 0);
    const el = tbodyRef.current;
    if (!el) return () => clearTimeout(t);
    const ro = new ResizeObserver(() => recomputeTbodyScroll());
    ro.observe(el);
    const mo = new MutationObserver(() => recomputeTbodyScroll());
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", recomputeTbodyScroll);
    return () => {
      clearTimeout(t); ro.disconnect(); mo.disconnect();
      window.removeEventListener("resize", recomputeTbodyScroll);
    };
  }, [open, openRecibo, recomputeTbodyScroll, deudasOrdenadas.length]);

  /* ── toggles ── */
  const toggleOne = (id, row) => {
    if (!id || loading || isPagadoRow(row)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  const handleToggleCheque = useCallback((idChequeStr) => {
    setIdsChequesSeleccionados((prev) =>
      prev.includes(idChequeStr)
        ? prev.filter((x) => x !== idChequeStr)
        : [...prev, idChequeStr]
    );
  }, []);

  /* ── API ── */
  const confirmPagoDefault = async ({ ids_movimiento, id_medio_pago }) =>
    fetchJsonOrThrow(`${BASE_URL}/api.php?action=recibos_confirmar_pago`, {
      method: "POST",
      headers: buildAuthHeaders(true),
      body: JSON.stringify({ ids_movimiento, id_medio_pago }),
    });

  const API_RECIBOS_CHEQUES_GUARDAR =
    `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php?action=recibos_cheques_guardar`;

  const guardarChequeEnBackend = useCallback(async (idMovimiento, datosCheque) => {
    if (!datosCheque) return null;
    const fd = new FormData();
    fd.append("id_movimiento", String(idMovimiento));
    fd.append("tipo",          datosCheque.tipo_cheque || "cheque");
    fd.append("fecha_emision", datosCheque.fecha_emision || new Date().toISOString().slice(0, 10));
    fd.append("emisor",        datosCheque.emisor || "");
    fd.append("numero_cheque", datosCheque.numero_cheque || "");
    fd.append("importe",       String(datosCheque.importe || 0));
    fd.append("fecha_pago",    datosCheque.fecha_pago || new Date().toISOString().slice(0, 10));
    fd.append("observaciones", datosCheque.observaciones || "");
    if (datosCheque.archivo instanceof File)
      fd.append("archivo", datosCheque.archivo,
        datosCheque.archivo_nombre || datosCheque.archivo.name || "adjunto");
    const { token, sessionKey } = getAuthInfo();
    const headers = {};
    if (sessionKey) headers["X-Session"]  = sessionKey;
    else if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API_RECIBOS_CHEQUES_GUARDAR, { method: "POST", headers, body: fd });
    return parseJsonOrThrow(res);
  }, []);

  const handleSaveCheque = useCallback(async (datosCheque) => {
    if (savingCheque) return;
    if (!datosCheque.emisor)
      { onToast?.("advertencia", "El emisor es obligatorio.", 3000); return; }
    if (!datosCheque.numero_cheque)
      { onToast?.("advertencia", "El número de cheque es obligatorio.", 3000); return; }
    if (!datosCheque.importe || Number(datosCheque.importe) <= 0)
      { onToast?.("advertencia", "El importe debe ser mayor a 0.", 3000); return; }
    if (!datosCheque.fecha_pago)
      { onToast?.("advertencia", "La fecha de pago es obligatoria.", 3000); return; }
    setChequeGuardado(datosCheque);
    setOpenChequeModal(false);
    onToast?.("exito", `Cheque ${datosCheque.numero_cheque} cargado correctamente.`, 3200);
  }, [savingCheque, onToast]);

  const buildReciboFromSeleccion = useCallback(({ clienteInfo, mp, seleccion }) => {
    const items = seleccion.map((r) => ({
      id_movimiento: r?.id_movimiento,
      fecha:         r?.fecha,
      descripcion:   r?.detalle ?? r?.descripcion ?? r?.concepto,
      monto:         Number(r?.monto_total ?? r?.total ?? 0) || 0,
    }));
    const total   = items.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
    const payload = {
      fecha_cobro: todayDMY(),
      cliente:     { id_cliente: clienteInfo?.id_cliente ?? null, nombre: clienteInfo?.nombre ?? cliente?.cliente ?? "" },
      medio_pago:  { id: mp?.id, nombre: mp?.nombre },
      total, items,
    };
    return {
      html:  buildReciboHTML(payload),
      title: `Recibo - ${payload?.cliente?.nombre || "Cliente"}`,
    };
  }, [cliente]);

  /* ── confirmar pago ── */
  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) { onToast?.("error", "Este cliente no tiene registros.", 2600); return; }
    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });
    if (seleccion.length === 0) { onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para pagar.", 2600); return; }
    if (!idMedioPago)           { onToast?.("error", "Seleccioná un medio de pago.", 2600); return; }
    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp)                    { onToast?.("error", "Medio de pago inválido. Reintentá.", 2800); return; }
    if (esMedioPagoCheque && idsChequesSeleccionados.length === 0 && !chequeGuardado) {
      onToast?.("error",
        `Debés seleccionar al menos un ${tipoChequeDetectado === "echeq" ? "eCheq" : "cheque"} de cartera.`,
        3200);
      return;
    }
    if (!esMedioPagoCheque && safeNumber(monto) <= 0) {
      onToast?.("error", "El monto debe ser mayor a 0.", 2800); return;
    }

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);
    try {
      setLoading(true);
      if (esMedioPagoCheque && chequeGuardado && idsChequesSeleccionados.length === 0) {
        setSavingCheque(true);
        try {
          for (const idMov of ids) await guardarChequeEnBackend(idMov, chequeGuardado);
          onToast?.("exito",
            `${tipoChequeDetectado === "echeq" ? "Echeq" : "Cheque"} guardado correctamente.`, 3000);
        } catch (err) {
          onToast?.("error", `Error al guardar ${tipoChequeDetectado}: ${err.message}`, 4200);
          setLoading(false); setSavingCheque(false); return;
        }
        setSavingCheque(false);
      }

      let resp = null;
      if (onConfirm) {
        resp = await onConfirm({
          cliente:     { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" },
          seleccion, totalSeleccionado, nota: nota.trim(),
          id_medio_pago: mp.id, medio_pago: mp.nombre,
          monto: esMedioPagoCheque ? importeChequesSeleccionados : safeNumber(monto),
          ids_movimiento:      ids,
          cheque_data:         esMedioPagoCheque ? chequeGuardado : null,
          ids_cheques_cartera: esMedioPagoCheque ? idsChequesSeleccionados : [],
        });
      } else {
        resp = await confirmPagoDefault({ ids_movimiento: ids, id_medio_pago: mp.id });
      }

      const idsCobroResp = Array.isArray(resp?.ids_cobro)
        ? resp.ids_cobro.map((x) => Number(x || 0)).filter(Boolean) : [];
      setIdsMovimientosPagados(ids);
      setUltimoCobroId(Number(idsCobroResp?.[0] || resp?.id_cobro || 0) || null);
      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const id = Number(r?.id_movimiento || 0);
          if (!id || !ids.includes(id)) return r;
          return { ...r,
            cobrado_total:    Number(r?.monto_total ?? r?.total ?? 0) || 0,
            pagado:           true,
            id_medio_pago:    mp.id,
            medio_pago_nombre: mp.nombre,
          };
        })
      );
      onAfterPaid?.(ids, mp);
      const built = buildReciboFromSeleccion({
        clienteInfo: { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" },
        mp, seleccion,
      });
      setReciboHtml(built.html);
      setReciboTitle(built.title);
      setOpenRecibo(true);
      setSelectedIds(new Set()); setPagaTodo(false);
      setChequeGuardado(null); setIdsChequesSeleccionados([]);
      setMonto(0); setMontoDraft(""); setMontoFocused(false);
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
    if (seleccion.length === 0)  { onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para facturar.", 2600); return; }
    if (!idMedioPago)            { onToast?.("error", "Seleccioná un medio de pago.", 2600); return; }
    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp)                     { onToast?.("error", "Medio de pago inválido. Reintentá.", 2800); return; }
    if (esMedioPagoCheque && idsChequesSeleccionados.length === 0 && !chequeGuardado) {
      onToast?.("error", `Debés cargar los datos del ${tipoChequeDetectado} antes de facturar.`, 3200); return;
    }
    try {
      setLoading(true);
      await onFactura({
        cliente: { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" },
        seleccion, totalSeleccionado, nota: nota.trim(),
        id_medio_pago: mp.id, medio_pago: mp.nombre,
        cheque_data:         esMedioPagoCheque ? chequeGuardado : null,
        ids_cheques_cartera: esMedioPagoCheque ? idsChequesSeleccionados : [],
      });
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo generar la factura.", 4200);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const modalClass   = ["mi-modal__container", "mi-modal__container--mov", "mpr-modal", dark ? "mi-modal--dark" : ""].join(" ").trim();
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

                {/* ── TABLA ── */}
                <section className="mpr-table-section">
                  <div className="mpr-thead">
                    <div className="mpr-th mpr-th--sel">Sel</div>
                    <div className="mpr-th">Fecha</div>
                    <div className="mpr-th mpr-th--desc">Descripción</div>
                    <div className="mpr-th mpr-th--center">Estado</div>
                    <div className="mpr-th mpr-th--right">Monto</div>
                  </div>

                  <div
                    ref={tbodyRef}
                    className={`mpr-tbody ${tbodyHasScroll ? "mpr-tbody--scroll" : ""}`}
                  >
                    {!deudasOrdenadas.length && (
                      <div className="mpr-empty">No hay registros para este cliente.</div>
                    )}
                    {deudasOrdenadas.map((r, idx) => {
                      const id       = Number(r?.id_movimiento || 0);
                      const pagado   = isPagadoRow(r);
                      const checked  = selectedIds.has(id);
                      const montoRow = Number(r?.monto_total ?? r?.total ?? 0) || 0;
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
                          <div className="mpr-td mpr-td--desc"
                            title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}>
                            {safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                          </div>
                          <div className="mpr-td mpr-td--center">
                            <EstadoChip pagado={pagado} />
                          </div>
                          <div className="mpr-td mpr-td--right mpr-td--mono">
                            {moneyARS(montoRow)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

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

                {/* ── ASIDE nc-* ── */}
                <aside className="nc-aside">

                  {/* Sección: datos */}
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Datos del pago</span>
                    </div>
                    <div className="nc-section-body">
                      <button
                        type="button"
                        className="nv-foot-btn"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={toggleAll}
                        disabled={!deudasOrdenadas.length || loading}
                      >
                        <span className="nv-foot-btn__icon">
                          <FontAwesomeIcon icon={faListCheck} style={{ fontSize: 10 }} />
                        </span>
                        {pagaTodo ? "Deseleccionar todas" : "Seleccionar todas"}
                      </button>
                    </div>
                  </div>

                  {/* Sección: medio de pago */}
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" style={{ background: "#0f766e" }} />
                      <span>Medio de pago</span>
                    </div>
                    <div className="nc-section-body">
                      {loadingMedios && (
                        <div style={{
                          padding: "4px 0", fontSize: 12,
                          color: "var(--nv-muted)",
                          display: "flex", alignItems: "center", gap: 6,
                        }}>
                          <FontAwesomeIcon icon={faCircleNotch} spin style={{ fontSize: 11 }} />
                          Cargando medios de pago…
                        </div>
                      )}

                      <div className="nc-mp-card">
                        <div className="nc-mp-inline">

                          {/* selector */}
                          <div className="nc-mp-medio">
                            <div className="nc-mp-sublabel">Medio</div>
                            <select
                              className="nc-mp-select"
                              value={idMedioPago}
                              onChange={(e) => handleChangeMedioPago(e.target.value)}
                              disabled={loading || loadingMedios}
                            >
                              <option value="">
                                {loadingMedios ? "Cargando…" : "Seleccionar…"}
                              </option>
                              {!loadingMedios && mediosPago.length === 0 && (
                                <option value="" disabled>(Sin medios de pago)</option>
                              )}
                              {mediosPago.map((x) => (
                                <option key={x.id} value={String(x.id)}>{x.nombre}</option>
                              ))}
                            </select>
                          </div>

                          {/* monto */}
                          <div className="nc-mp-monto-wrap">
                            <div className="nc-mp-sublabel">Monto</div>
                            <input
                              className="nc-mp-input-monto"
                              type="text"
                              inputMode="decimal"
                              value={
                                montoFocused
                                  ? montoDraft ?? ""
                                  : formatMoneyInputARS(
                                      esMedioPagoCheque ? importeChequesSeleccionados : monto
                                    )
                              }
                              onFocus={(e) => {
                                setMontoFocused(true);
                                setMontoDraft(formatEditableMoney(monto));
                                setTimeout(() => e.target.select(), 0);
                              }}
                              onChange={(e) => {
                                const c = e.target.value.replace(/[^\d,.\-]/g, "");
                                setMontoDraft(c);
                                setMonto(parseMoneyInputARS(c));
                              }}
                              onBlur={() => {
                                const p = parseMoneyInputARS(montoDraft);
                                setMonto(p); setMontoDraft(""); setMontoFocused(false);
                              }}
                              placeholder="$ 0,00"
                              disabled={
                                loading ||
                                (esMedioPagoCheque && idsChequesSeleccionados.length > 0)
                              }
                              style={{
                                background:
                                  esMedioPagoCheque && idsChequesSeleccionados.length > 0
                                    ? "rgba(0,0,0,.03)"
                                    : undefined,
                              }}
                            />
                          </div>

                          {/* botón ↓ Rest. */}
                          <div className="nc-mp-actions-col">
                            <button
                              type="button"
                              className="nc-mp-completar"
                              onClick={() => {
                                setMonto(diferenciaRestante);
                                setMontoDraft(""); setMontoFocused(false);
                              }}
                              disabled={!puedeCompletarRestante}
                              title="Completar importe restante"
                            >
                              ↓ Rest.
                            </button>
                          </div>
                        </div>

                        {/* Panel cheques */}
                        {esMedioPagoCheque && (
                          <div className="nc-mp-cheques">
                            <div className="nc-mp-cheques-title">
                              <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 11 }} />
                              {tipoChequeDetectado === "echeq"
                                ? "eCheqs en cartera"
                                : "Cheques en cartera"}
                            </div>

                            {loadingCheques ? (
                              <div className="nc-mp-cheques-loading">
                                <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
                                Cargando…
                              </div>
                            ) : chequesCartera.length === 0 ? (
                              <div className="nc-mp-cheques-empty">
                                No hay {tipoChequeDetectado === "echeq" ? "eCheqs" : "cheques"} activos en cartera.
                              </div>
                            ) : (
                              <ChequesCarteraCards
                                cheques={chequesCartera}
                                idsSeleccionados={idsChequesSeleccionados}
                                onToggle={handleToggleCheque}
                                esEcheq={tipoChequeDetectado === "echeq"}
                              />
                            )}

                            {idsChequesSeleccionados.length > 0 && (
                              <div className="nc-mp-cheques-sum">
                                ✓ {idsChequesSeleccionados.length} cheque(s) — {moneyARS(importeChequesSeleccionados)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Totalizador */}
                      <div className="nc-mp-totals">
                        <span className="nc-mp-totals-asignado">
                          Asignado: <b>{moneyARS(montoActual)}</b>
                        </span>
                        {diferenciaRestante > 0.01 && (
                          <span className="nc-mp-totals-falta">
                            Falta: {moneyARS(diferenciaRestante)}
                          </span>
                        )}
                        {diferenciaRestante <= 0.01 && totalSeleccionado > 0 && (
                          <span className="nc-mp-totals-ok">✓ Cubierto</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="nc-actions">
                    <button
                      type="button"
                      className="nc-btn-guardar"
                      onClick={handleConfirm}
                      disabled={
                        loading ||
                        selectedIds.size === 0 ||
                        !idMedioPago ||
                        loadingMedios ||
                        (esMedioPagoCheque && idsChequesSeleccionados.length === 0 && !chequeGuardado)
                      }
                    >
                      {loading ? "Procesando…" : "Confirmar pago"}
                    </button>
                    <button
                      type="button"
                      className="nc-btn-cancelar"
                      onClick={onClose}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
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
          onReciboFinalizado?.(saved, {
            idsMovimiento: idsMovimientosPagados,
            idCobro: ultimoCobroId,
          });
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