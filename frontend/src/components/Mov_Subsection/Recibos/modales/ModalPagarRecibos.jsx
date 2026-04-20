import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "./ModalPagarRecibos.css";
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faListCheck,
  faMoneyBill1Wave,
  faCircleNotch,
  faMoneyCheckDollar,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";

import ModalReciboGenerado from "./ModalReciboGenerado";
import ModalNuevoCheque from "../../../Global/Modales/ModalNuevoCheque.jsx";
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

function buildAuthHeaders(includeJson = false) {
  const session = getSessionKey();
  const token = (localStorage.getItem("token") || "").trim();
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (session) headers["X-Session"] = session;
  else if (token) headers["Authorization"] = `Bearer ${token}`;
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
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isMedioPagoCheque(mediosPagoList, idMedioPago) {
  const id = Number(idMedioPago);
  if (!Number.isFinite(id) || id <= 0) return false;
  const medio = (Array.isArray(mediosPagoList) ? mediosPagoList : []).find(
    (x) => Number(x?.id ?? 0) === id
  );
  if (!medio) return false;
  const nombre = normalizeText(medio?.nombre ?? "");
  return nombre.includes("cheque") || nombre.includes("echeq");
}

function isMedioPagoEcheq(mediosPagoList, idMedioPago) {
  const id = Number(idMedioPago);
  if (!Number.isFinite(id) || id <= 0) return false;
  const medio = (Array.isArray(mediosPagoList) ? mediosPagoList : []).find(
    (x) => Number(x?.id ?? 0) === id
  );
  if (!medio) return false;
  return normalizeText(medio?.nombre ?? "").includes("echeq");
}

function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, sessionKey, idUsuario };
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
   Money input helpers
========================= */
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================
   Estado de una fila de medio de pago
========================= */
function buildEmptyMedioPago() {
  return {
    id: uid(),
    id_medio_pago: "",
    monto: 0,
    montoDraft: "",
    montoFocused: false,
    chequeData: null,
  };
}

/* =========================
   Sub-componentes UI
========================= */
function EstadoChip({ pagado }) {
  return (
    <span className={`mpr-chip ${pagado ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {pagado ? "PAGADO" : "PENDIENTE"}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
   FILA MEDIO DE PAGO (adaptada para Recibos: cheques nuevos)
───────────────────────────────────────────────────────── */
function MedioPagoRowRecibo({
  row,
  mediosPagoList,
  onUpdate,
  onRemove,
  saving,
  canRemove,
  totalSeleccionado,
  sumaMediosPago,
  onRequestCheque,
}) {
  const esCheque = useMemo(
    () => isMedioPagoCheque(mediosPagoList, row.id_medio_pago),
    [mediosPagoList, row.id_medio_pago]
  );
  const esEcheq = useMemo(
    () => isMedioPagoEcheq(mediosPagoList, row.id_medio_pago),
    [mediosPagoList, row.id_medio_pago]
  );
  const tipoCheque = esEcheq ? "echeq" : "cheque";

  const montoEfectivo = esCheque && row.chequeData
    ? Number(row.chequeData.importe || 0)
    : row.monto;

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - montoEfectivo);
    return Math.max(0, safeNumber(totalSeleccionado) - sumaOtros);
  }, [sumaMediosPago, totalSeleccionado, montoEfectivo]);

  const puedeCompletarRestante =
    !saving && !esCheque && totalSeleccionado > 0 && restanteParaEstaFila > 0.009;

  // Sincronizar monto cuando cambia el chequeData
  useEffect(() => {
    if (esCheque && row.chequeData) {
      onUpdate(row.id, { monto: Number(row.chequeData.importe || 0) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.chequeData?.importe, esCheque]);

  const handleChangeMedio = useCallback(
    (val) => {
      const isChq = isMedioPagoCheque(mediosPagoList, val);
      onUpdate(row.id, {
        id_medio_pago: val,
        chequeData: null,
        monto: isChq ? 0 : row.monto,
        montoDraft: "",
        montoFocused: false,
      });
    },
    [row.id, row.monto, mediosPagoList, onUpdate]
  );

  return (
    <div className="nc-mp-card">
      <div className="nc-mp-inline">
        {/* Selector de medio */}
        <div className="nc-mp-medio">
          <div className="nc-mp-sublabel">Medio</div>
          <select
            className="nc-mp-select"
            value={String(row.id_medio_pago || "")}
            onChange={(e) => handleChangeMedio(e.target.value)}
            disabled={saving}
          >
            <option value="">Seleccionar...</option>
            {mediosPagoList.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Monto (solo para medios no-cheque) */}
        {!esCheque && (
          <div className="nc-mp-monto-wrap">
            <div className="nc-mp-sublabel">Monto</div>
            <input
              className="nc-mp-input-monto"
              type="text"
              inputMode="decimal"
              value={
                row.montoFocused
                  ? row.montoDraft ?? ""
                  : formatMoneyInputARS(row.monto)
              }
              onFocus={(e) => {
                onUpdate(row.id, {
                  montoFocused: true,
                  montoDraft: formatEditableMoney(row.monto),
                });
                setTimeout(() => e.target.select(), 0);
              }}
              onChange={(e) => {
                const c = e.target.value.replace(/[^\d,.\-]/g, "");
                onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) });
              }}
              onBlur={() => {
                const p = parseMoneyInputARS(row.montoDraft);
                onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false });
              }}
              placeholder="$ 0,00"
              disabled={saving}
            />
          </div>
        )}

        {/* Acciones de fila */}
        <div className="nc-mp-actions-col">
          {!esCheque && (
            <button
              type="button"
              className="nc-mp-completar"
              onClick={() =>
                onUpdate(row.id, {
                  monto: restanteParaEstaFila,
                  montoDraft: "",
                  montoFocused: false,
                })
              }
              disabled={!puedeCompletarRestante}
              title="Completar importe restante"
            >
              ↓ Rest.
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              className="nc-mp-del-btn"
              onClick={() => onRemove(row.id)}
              disabled={saving}
              title="Quitar medio de pago"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Sección de cheque/echeq */}
      {esCheque && (
        <div className="nc-mp-cheques">
          <div className="nc-mp-cheques-title">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 11 }} />
            {esEcheq ? "eCheq" : "Cheque"}
          </div>

          {row.chequeData ? (
            <div className="mpr-cheque-loaded">
              <div className="mpr-cheque-info">
                <div className="mpr-cheque-info__ok">
                  ✓ {tipoCheque === "echeq" ? "eCheq" : "Cheque"} cargado
                </div>
                <div className="mpr-cheque-info__row">
                  <b>N°:</b> {row.chequeData.numero_cheque}
                </div>
                <div className="mpr-cheque-info__row">
                  <b>Emisor:</b> {row.chequeData.emisor}
                </div>
                <div className="mpr-cheque-info__row">
                  <b>Importe:</b> {moneyARS(row.chequeData.importe || 0)}
                </div>
                <div className="mpr-cheque-info__row">
                  <b>Fecha pago:</b> {row.chequeData.fecha_pago}
                </div>
                {row.chequeData.archivo_nombre && (
                  <div className="mpr-cheque-info__row">
                    <b>Archivo:</b> {row.chequeData.archivo_nombre}
                  </div>
                )}
              </div>
              <div className="mpr-cheque-actions">
                <button
                  type="button"
                  className="mit-btn mit-btn--ghost"
                  onClick={() => onRequestCheque(row.id)}
                  disabled={saving}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="mit-btn mit-btn--ghost"
                  onClick={() => onUpdate(row.id, { chequeData: null, monto: 0 })}
                  disabled={saving}
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="mit-btn mit-btn--solid"
              style={{ width: "100%", marginTop: 4 }}
              onClick={() => onRequestCheque(row.id)}
              disabled={saving}
            >
              Cargar {tipoCheque === "echeq" ? "eCheq" : "cheque"}
            </button>
          )}
        </div>
      )}
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

  /* =========================
     Estado principal
  ========================= */
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingCheque, setSavingCheque] = useState(false);
  const [rows, setRows] = useState(() => []);

  /* =========================
     Medios de pago - lista global
  ========================= */
  const mediosPagoFromContext = useMemo(
    () => normalizeMediosPago(lists || {}),
    [lists]
  );
  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);

  /* =========================
     Medios de pago - filas múltiples
  ========================= */
  const [mediosFilas, setMediosFilas] = useState(() => [buildEmptyMedioPago()]);

  const addMedioPago = useCallback(() => {
    setMediosFilas((p) => [...p, buildEmptyMedioPago()]);
  }, []);

  const removeMedioPago = useCallback((id) => {
    setMediosFilas((p) => {
      const next = p.filter((r) => r.id !== id);
      return next.length ? next : p;
    });
  }, []);

  const updateMedioPago = useCallback((id, patch) => {
    setMediosFilas((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const sumaMediosPago = useMemo(
    () =>
      mediosFilas.reduce((acc, mp) => {
        const esCheque = isMedioPagoCheque(mediosPago, mp.id_medio_pago);
        const monto = esCheque && mp.chequeData
          ? Number(mp.chequeData.importe || 0)
          : safeNumber(mp.monto);
        return acc + monto;
      }, 0),
    [mediosFilas, mediosPago]
  );

  const diferenciaRestante = useMemo(
    () => Math.max(0, 0), // se calcula abajo con totalSeleccionado
    []
  );

  /* =========================
     Modal cheque - por fila
  ========================= */
  const [chequeModalRowId, setChequeModalRowId] = useState(null);

  const openChequeModalForRow = useCallback((rowId) => {
    setChequeModalRowId(rowId);
  }, []);

  const rowParaCheque = useMemo(
    () => (chequeModalRowId ? mediosFilas.find((r) => r.id === chequeModalRowId) || null : null),
    [chequeModalRowId, mediosFilas]
  );

  const tipoChequeParaModal = useMemo(
    () =>
      rowParaCheque
        ? isMedioPagoEcheq(mediosPago, rowParaCheque.id_medio_pago)
          ? "echeq"
          : "cheque"
        : "cheque",
    [rowParaCheque, mediosPago]
  );

  /* =========================
     Recibo generado
  ========================= */
  const [openRecibo, setOpenRecibo] = useState(false);
  const [reciboHtml, setReciboHtml] = useState("");
  const [reciboTitle, setReciboTitle] = useState("Recibo");
  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId, setUltimoCobroId] = useState(null);

  /* =========================
     Init al abrir
  ========================= */
  const fetchMediosPagoFallback = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const url = `${BASE_URL}/api.php?action=global_obtener_listas`;
      const data = await fetchJsonOrThrow(url, {
        method: "GET",
        headers: buildAuthHeaders(false),
      });
      setMediosPago(normalizeMediosPago(data));
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
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
    setSavingCheque(false);
    setRows(Array.isArray(deudas) ? [...deudas] : []);
    setOpenRecibo(false);
    setReciboHtml("");
    setReciboTitle("Recibo");
    setIdsMovimientosPagados([]);
    setUltimoCobroId(null);
    setMediosFilas([buildEmptyMedioPago()]);
    setChequeModalRowId(null);

    if (mediosPagoFromContext.length > 0) {
      setMediosPago(mediosPagoFromContext);
      setLoadingMedios(false);
    } else {
      setMediosPago([]);
      fetchMediosPagoFallback();
    }

    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, deudas, mediosPagoFromContext, fetchMediosPagoFallback]);

  /* ESC handler */
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

  /* =========================
     Datos ordenados
  ========================= */
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

  const diferenciaReal = useMemo(
    () => Math.max(0, totalSeleccionado - sumaMediosPago),
    [totalSeleccionado, sumaMediosPago]
  );

  const cantSeleccionadas = useMemo(() => selectedIds.size, [selectedIds]);

  /* =========================
     Scroll tbody
  ========================= */
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

  /* =========================
     Toggle selección
  ========================= */
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

  /* =========================
     Guardar cheque en backend
  ========================= */
  const API_RECIBOS_CHEQUES_GUARDAR = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php?action=recibos_cheques_guardar`;

  const guardarChequeEnBackend = useCallback(async (idMovimiento, datosCheque) => {
    if (!datosCheque) return null;

    const fd = new FormData();
    const { token, sessionKey, idUsuario } = getAuthInfo();

    fd.append("id_movimiento", String(idMovimiento));
    fd.append("idUsuario", String(idUsuario || 0));
    fd.append("tipo", datosCheque.tipo || datosCheque.tipo_cheque || "cheque");
    fd.append("tipo_cheque", datosCheque.tipo_cheque || datosCheque.tipo || "cheque");
    fd.append("fecha_emision", datosCheque.fecha_emision || new Date().toISOString().slice(0, 10));
    fd.append("emisor", datosCheque.emisor || "");
    fd.append("numero_cheque", datosCheque.numero_cheque || "");
    fd.append("importe", String(datosCheque.importe || 0));
    fd.append("fecha_pago", datosCheque.fecha_pago || new Date().toISOString().slice(0, 10));
    fd.append("observaciones", datosCheque.observaciones || "");
    if (datosCheque.id_comprobante) fd.append("id_comprobante", String(datosCheque.id_comprobante));
    if (datosCheque.archivo instanceof File) {
      fd.append("archivo", datosCheque.archivo, datosCheque.archivo_nombre || datosCheque.archivo.name || "adjunto");
    }

    const headers = {};
    if (sessionKey) headers["X-Session"] = sessionKey;
    else if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(API_RECIBOS_CHEQUES_GUARDAR, { method: "POST", headers, body: fd });
    return await parseJsonOrThrow(res);
  }, []);

  /* =========================
     Guardar cheque desde modal
  ========================= */
  const handleSaveCheque = useCallback(
    (datosCheque) => {
      if (!datosCheque.emisor) {
        onToast?.("advertencia", "El emisor es obligatorio.", 3000);
        return;
      }
      if (!datosCheque.numero_cheque) {
        onToast?.("advertencia", "El número de cheque es obligatorio.", 3000);
        return;
      }
      if (!datosCheque.importe || Number(datosCheque.importe) <= 0) {
        onToast?.("advertencia", "El importe debe ser mayor a 0.", 3000);
        return;
      }
      if (!datosCheque.fecha_pago) {
        onToast?.("advertencia", "La fecha de pago es obligatoria.", 3000);
        return;
      }

      if (chequeModalRowId) {
        updateMedioPago(chequeModalRowId, {
          chequeData: datosCheque,
          monto: Number(datosCheque.importe || 0),
        });
        onToast?.(
          "exito",
          `${datosCheque.tipo_cheque === "echeq" ? "eCheq" : "Cheque"} ${datosCheque.numero_cheque} cargado.`,
          3200
        );
      }
      setChequeModalRowId(null);
    },
    [chequeModalRowId, updateMedioPago, onToast]
  );

  /* =========================
     Validaciones
  ========================= */
  const validate = useCallback(() => {
    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    if (seleccion.length === 0) {
      return { ok: false, msg: "Seleccioná al menos una deuda PENDIENTE para pagar." };
    }

    for (let i = 0; i < mediosFilas.length; i++) {
      const mp = mediosFilas[i];

      if (!mp.id_medio_pago) {
        return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
      }

      const esCheque = isMedioPagoCheque(mediosPago, mp.id_medio_pago);
      const tipoCheque = isMedioPagoEcheq(mediosPago, mp.id_medio_pago) ? "echeq" : "cheque";

      if (esCheque) {
        if (!mp.chequeData) {
          return {
            ok: false,
            msg: `Medio de pago ${i + 1}: debés cargar los datos del ${tipoCheque === "echeq" ? "eCheq" : "cheque"}.`,
          };
        }
      } else {
        if (safeNumber(mp.monto) <= 0) {
          return { ok: false, msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.` };
        }
      }
    }

    if (sumaMediosPago < totalSeleccionado - 0.05 && totalSeleccionado > 0) {
      return {
        ok: false,
        msg: `La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total a cobrar (${moneyARS(totalSeleccionado)}).`,
      };
    }

    return { ok: true };
  }, [deudasOrdenadas, selectedIds, mediosFilas, mediosPago, sumaMediosPago, totalSeleccionado]);

  /* =========================
     Construir payload de medios_pago
  ========================= */
  const buildMediosPagoPayload = useCallback(() => {
    return mediosFilas.map((mp) => {
      const esCheque = isMedioPagoCheque(mediosPago, mp.id_medio_pago);
      return {
        id_medio_pago: Number(mp.id_medio_pago),
        monto: esCheque && mp.chequeData ? Number(mp.chequeData.importe || 0) : safeNumber(mp.monto),
        cheque_data: esCheque ? mp.chequeData : null,
      };
    });
  }, [mediosFilas, mediosPago]);

  /* =========================
     Construir nombre de medios para el recibo
  ========================= */
  const buildMpNombre = useCallback(() => {
    const nombres = mediosFilas.map((mp) => {
      const found = mediosPago.find((x) => String(x.id) === String(mp.id_medio_pago));
      return found?.nombre || "Medio de pago";
    });
    return nombres.length === 1 ? nombres[0] : nombres.join(" + ");
  }, [mediosFilas, mediosPago]);

  /* =========================
     Construir recibo HTML
  ========================= */
  const buildReciboFromSeleccion = useCallback(
    ({ clienteInfo, mpNombre, seleccion }) => {
      const items = seleccion.map((r) => ({
        id_movimiento: r?.id_movimiento,
        fecha: r?.fecha,
        descripcion: r?.detalle ?? r?.descripcion ?? r?.concepto,
        monto: Number(r?.monto_total ?? r?.total ?? 0) || 0,
      }));
      const total = items.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
      const payload = {
        fecha_cobro: todayDMY(),
        cliente: {
          id_cliente: clienteInfo?.id_cliente ?? null,
          nombre: clienteInfo?.nombre ?? cliente?.cliente ?? "",
        },
        medio_pago: { id: null, nombre: mpNombre },
        total,
        items,
      };
      return {
        html: buildReciboHTML(payload),
        title: `Recibo - ${payload?.cliente?.nombre || "Cliente"}`,
      };
    },
    [cliente]
  );

  /* =========================
     Pago por defecto (sin onConfirm)
  ========================= */
  const confirmPagoDefault = async ({ ids_movimiento, medios_pago }) => {
    const url = `${BASE_URL}/api.php?action=recibos_confirmar_pago`;
    const primaryMedio = medios_pago?.[0]?.id_medio_pago || 0;
    return await fetchJsonOrThrow(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders(false) },
      body: JSON.stringify({
        ids_movimiento,
        medios_pago,
        id_medio_pago: primaryMedio, // backward compat
      }),
    });
  };

  /* =========================
     Confirmar pago
  ========================= */
  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.", 2600);
      return;
    }

    const v = validate();
    if (!v.ok) {
      onToast?.("error", v.msg, 3200);
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);
    const mediosPagoPayload = buildMediosPagoPayload();
    const mpNombre = buildMpNombre();

    try {
      setLoading(true);

      // Guardar cheques en backend (uno por movimiento por cada medio cheque)
      const chequeFilas = mediosFilas.filter(
        (mp) => isMedioPagoCheque(mediosPago, mp.id_medio_pago) && mp.chequeData
      );

      if (chequeFilas.length > 0) {
        setSavingCheque(true);
        try {
          for (const mp of chequeFilas) {
            for (const idMovimiento of ids) {
              await guardarChequeEnBackend(idMovimiento, mp.chequeData);
            }
          }
        } catch (err) {
          onToast?.("error", `Error al guardar cheque: ${err.message}`, 4200);
          setLoading(false);
          setSavingCheque(false);
          return;
        }
        setSavingCheque(false);
      }

      // Confirmar pago
      let resp = null;
      if (onConfirm) {
        resp = await onConfirm({
          cliente: {
            id_cliente: cliente?.id_cliente ?? null,
            nombre: cliente?.cliente ?? "",
          },
          seleccion,
          totalSeleccionado,
          nota: nota.trim(),
          medios_pago: mediosPagoPayload,
          id_medio_pago: mediosPagoPayload[0]?.id_medio_pago || 0, // backward compat
          medio_pago: mpNombre,
          ids_movimiento: ids,
        });
      } else {
        resp = await confirmPagoDefault({
          ids_movimiento: ids,
          medios_pago: mediosPagoPayload,
        });
      }

      const idsCobroResp = Array.isArray(resp?.ids_cobro)
        ? resp.ids_cobro.map((x) => Number(x || 0)).filter(Boolean)
        : [];

      setIdsMovimientosPagados(ids);
      setUltimoCobroId(Number(idsCobroResp?.[0] || resp?.id_cobro || 0) || null);

      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const id = Number(r?.id_movimiento || 0);
          if (!id || !ids.includes(id)) return r;
          return {
            ...r,
            cobrado_total: Number(r?.monto_total ?? r?.total ?? 0) || 0,
            pagado: true,
          };
        })
      );

      onAfterPaid?.(ids, { nombre: mpNombre });

      const built = buildReciboFromSeleccion({
        clienteInfo: {
          id_cliente: cliente?.id_cliente ?? null,
          nombre: cliente?.cliente ?? "",
        },
        mpNombre,
        seleccion,
      });

      setReciboHtml(built.html);
      setReciboTitle(built.title);
      setOpenRecibo(true);
      setSelectedIds(new Set());
      setPagaTodo(false);
      setMediosFilas([buildEmptyMedioPago()]);

      onToast?.("exito", "Pago realizado correctamente.", 3000);
      setTimeout(recomputeTbodyScroll, 0);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4200);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Factura (sin cambios)
  ========================= */
  const handleFactura = async () => {
    if (!onFactura) {
      onToast?.("error", "Falta conectar la acción de factura (onFactura).", 3200);
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.", 2600);
      return;
    }
    if (seleccion.length === 0) {
      onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para facturar.", 2600);
      return;
    }

    const v = validate();
    if (!v.ok) {
      onToast?.("error", v.msg, 3200);
      return;
    }

    const mediosPagoPayload = buildMediosPagoPayload();
    const mpNombre = buildMpNombre();

    try {
      setLoading(true);
      await onFactura({
        cliente: {
          id_cliente: cliente?.id_cliente ?? null,
          nombre: cliente?.cliente ?? "",
        },
        seleccion,
        totalSeleccionado,
        nota: nota.trim(),
        medios_pago: mediosPagoPayload,
        id_medio_pago: mediosPagoPayload[0]?.id_medio_pago || 0,
        medio_pago: mpNombre,
      });
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo generar la factura.", 4200);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Render
  ========================= */
  if (!open) return null;

  const isProcessing = loading || savingCheque;
  const canConfirm = !isProcessing && selectedIds.size > 0 && !loadingMedios && mediosFilas.every((mp) => mp.id_medio_pago);

  const modalClass = [
    "mi-modal__container",
    "mi-modal__container--mov",
    "mpr-modal",
    dark ? "mi-modal--dark" : "",
  ]
    .join(" ")
    .trim();

  const overlayClass = [
    "mi-modal__overlay",
    "mi-modal__overlay--mov",
    dark ? "mi-modal__overlay--dark" : "",
  ]
    .join(" ")
    .trim();

  return createPortal(
    <>
      {!openRecibo && (
        <div className={overlayClass} role="dialog" aria-modal="true">
          <div className={modalClass} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="mi-modal__header mpr-header">
              <div className="mi-modal__head-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faMoneyBill1Wave} />
              </div>
              <div className="mi-modal__head-left">
                <h2 className="mi-modal__title">
                  Cobrar
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
                disabled={isProcessing}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            {/* Contenido */}
            <div className="mi-modal__content mpr-content-wrap">
              <div className="mpr-layout">
                {/* Tabla de deudas */}
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
                            <label className={`mpr-check ${!id || isProcessing || pagado ? "is-disabled" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(id, r)}
                                disabled={!id || isProcessing || pagado}
                              />
                              <span className="mpr-check__box" aria-hidden="true" />
                            </label>
                          </div>
                          <div className="mpr-td">{safeText(formatFechaDMY(r?.fecha))}</div>
                          <div
                            className="mpr-td mpr-td--desc"
                            title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                          >
                            {safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                          </div>
                          <div className="mpr-td mpr-td--center">
                            <EstadoChip pagado={pagado} />
                          </div>
                          <div className="mpr-td mpr-td--right mpr-td--mono">
                            {moneyARS(monto)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mpr-tfoot">
                    <div className="mpr-tfoot-stats">
                      <span className="mpr-stat">
                        Total <b>{deudasOrdenadas.length}</b>
                      </span>
                      <span className="mpr-stat-sep" />
                      <span className="mpr-stat">
                        Seleccionadas <b>{cantSeleccionadas}</b>
                      </span>
                    </div>
                    <div className="mpr-tfoot-totals">
                      <div className="mpr-total-pill">
                        <span>Total seleccionado</span>
                        <b>{moneyARS(totalSeleccionado)}</b>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Aside de datos del pago */}
                <aside className="nc-aside">
                  {/* Sección: Selección */}
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Datos del cobro</span>
                    </div>
                    <div className="nc-section-body">
                      <button
                        type="button"
                        className="nv-foot-btn"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={toggleAll}
                        disabled={!deudasOrdenadas.length || isProcessing}
                      >
                        <span className="nv-foot-btn__icon">
                          <FontAwesomeIcon icon={faListCheck} style={{ fontSize: 10 }} />
                        </span>
                        {pagaTodo ? "Deseleccionar todas" : "Seleccionar todas"}
                      </button>
                    </div>
                  </div>

                  {/* Sección: Medios de pago */}
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" style={{ background: "#0f766e" }} />
                      <span>Medios de cobro</span>
                    </div>
                    <div className="nc-section-body">
                      {loadingMedios && (
                        <div style={{ padding: "4px 0", fontSize: 12, color: "var(--nv-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                          <FontAwesomeIcon icon={faCircleNotch} spin style={{ fontSize: 11 }} />
                          Cargando medios de pago…
                        </div>
                      )}

                      {mediosFilas.map((mp) => (
                        <MedioPagoRowRecibo
                          key={mp.id}
                          row={mp}
                          mediosPagoList={mediosPago}
                          onUpdate={updateMedioPago}
                          onRemove={removeMedioPago}
                          saving={isProcessing}
                          canRemove={mediosFilas.length > 1}
                          totalSeleccionado={totalSeleccionado}
                          sumaMediosPago={sumaMediosPago}
                          onRequestCheque={openChequeModalForRow}
                        />
                      ))}

                      {/* Totales de medios */}
                      <div className="nc-mp-totals">
                        <span className="nc-mp-totals-asignado">
                          Asignado: <b>{moneyARS(sumaMediosPago)}</b>
                        </span>
                        {diferenciaReal > 0.01 && (
                          <span className="nc-mp-totals-falta">
                            Falta: {moneyARS(diferenciaReal)}
                          </span>
                        )}
                        {diferenciaReal <= 0.01 && totalSeleccionado > 0 && (
                          <span className="nc-mp-totals-ok">✓ Cubierto</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="nc-add-mp-btn"
                        onClick={addMedioPago}
                        disabled={isProcessing}
                      >
                        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
                        Agregar otro medio
                      </button>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="mpr-aside__actions">
                    <button
                      type="button"
                      className="mit-btn mit-btn--solid mit-btn--block"
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                    >
                      {isProcessing ? (
                        <>
                          <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
                          Procesando…
                        </>
                      ) : (
                        "Confirmar cobro"
                      )}
                    </button>
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost mit-btn--block"
                      onClick={onClose}
                      disabled={isProcessing}
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

      {/* Modal de recibo generado */}
      <ModalReciboGenerado
        open={openRecibo}
        html={reciboHtml}
        title={reciboTitle}
        onToast={onToast}
        onClose={() => {
          setOpenRecibo(false);
          onClose?.();
        }}
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

      {/* Modal de cheque/echeq - único, se abre para la fila activa */}
      <ModalNuevoCheque
        open={chequeModalRowId !== null}
        onClose={() => setChequeModalRowId(null)}
        onSave={handleSaveCheque}
        tipoCheque={tipoChequeParaModal}
        initialData={rowParaCheque?.chequeData || null}
        datosIniciales={rowParaCheque?.chequeData || null}
        importeTotal={totalSeleccionado}
        cliente={cliente?.cliente}
        onToast={onToast}
        saving={isProcessing}
      />
    </>,
    document.body
  );
}
