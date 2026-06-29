import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { filtrarMediosPagoPorPlan } from "../../_shared/planMediosPago";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";
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
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";

import ModalReciboGenerado from "./ModalReciboGenerado";
import ModalNuevoCheque from "../../../Global/Modales/ModalNuevoCheque.jsx";
import ModalDetalleMovimiento from "../../../Global/Modales/ModalDetalleMovimiento.jsx";
import { buildReciboHTML } from "../../../../utils/reciboTemplate";
import { getDetalleMovimiento } from "../../_shared/detalleMovimiento.js";

const API_CHECK_NUMERO_CHEQUE = `${BASE_URL}/api.php?action=mov_global_cheques_obtener&modo=verificar_numero`;
const API_CHEQUES_ACTUALIZAR = `${BASE_URL}/api.php?action=mov_global_cheques_actualizar`;

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

function productosLabel(row) {
  return getDetalleMovimiento(row);
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

function todayISO() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function getMontoTotalRow(row) {
  const n = Number(row?.monto_total ?? row?.total ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getCobradoTotalRow(row) {
  const n = Number(
    row?.cobrado_total ??
      row?.monto_cobrado ??
      row?.total_cobrado ??
      row?.pagado_total ??
      0
  );
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getSaldoPendienteRow(row) {
  const explicitKeys = [
    "saldo_pendiente",
    "saldo_restante",
    "monto_pendiente",
    "pendiente",
    "saldo",
  ];

  for (const key of explicitKeys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      const n = Number(row[key]);
      if (Number.isFinite(n)) return Math.max(0, n);
    }
  }

  const total = getMontoTotalRow(row);
  const cobrado = getCobradoTotalRow(row);

  if (total > 0 || cobrado > 0) return Math.max(0, total - cobrado);
  if (row?.pagado === true) return 0;
  return total;
}

function isPagadoRow(row) {
  return getSaldoPendienteRow(row) <= 0.009;
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
function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

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
function EstadoChip({ row, pagado }) {
  const parcial = !pagado && getCobradoTotalRow(row) > 0.009;
  return (
    <span className={`mpr-chip ${pagado ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {pagado ? "PAGADO" : parcial ? "PENDIENTE PARCIAL" : "PENDIENTE"}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
   CHEQUE RESUMEN — misma estética que ModalNuevaVenta
───────────────────────────────────────────────────────── */
function ChequeResumen({ cheque, tipoCheque }) {
  if (!cheque) return null;
  const esEcheq = tipoCheque === "echeq";
  return (
    <div className="nc-cheques-list">
      <div
        className={`nc-cheque-item nc-cheque-item--selected ${
          esEcheq ? "nc-cheque-item--echeq" : ""
        }`}
      >
        <div className="nc-cheque-main">
          <div className="nc-cheque-top">
            <span className="nc-cheque-number">N° {safeText(cheque?.numero_cheque)}</span>
            {esEcheq && (
              <span className="nc-cheque-badge nc-cheque-badge--echeq">eCheq</span>
            )}
          </div>
          <div className="nc-cheque-meta">
            <span className="nc-cheque-emisor" title={safeText(cheque?.emisor)}>
              {safeText(cheque?.emisor)}
            </span>
            <span className="nc-cheque-separator">·</span>
            <span>Pago: {formatFechaDMY(cheque?.fecha_pago)}</span>
          </div>
        </div>
        <span className="nc-cheque-importe">{moneyARS(cheque?.importe || 0)}</span>
        <div
          aria-hidden="true"
          className={`nc-cheque-check-icon nc-cheque-check-icon--corner ${
            esEcheq
              ? "nc-cheque-check-icon--echeq"
              : "nc-cheque-check-icon--cheque"
          }`}
        >
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path
              d="M1 3.5L3.5 6L8 1"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   FILA MEDIO DE PAGO — panel de cheque con estética de NuevaVenta
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
  const mpSeleccionado = useMemo(
    () =>
      mediosPagoList.find(
        (x) => String(x?.id ?? "") === String(row.id_medio_pago)
      ) || null,
    [mediosPagoList, row.id_medio_pago]
  );

  const esCheque = useMemo(
    () => isMedioPagoCheque(mediosPagoList, row.id_medio_pago),
    [mediosPagoList, row.id_medio_pago]
  );
  const esEcheq = useMemo(
    () => isMedioPagoEcheq(mediosPagoList, row.id_medio_pago),
    [mediosPagoList, row.id_medio_pago]
  );
  const tipoCheque = esEcheq ? "echeq" : "cheque";

  const montoCheque =
    esCheque && row.chequeData ? Number(row.chequeData.importe || 0) : 0;
  const montoVisible = esCheque ? montoCheque : row.monto;

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(
      0,
      safeNumber(sumaMediosPago) - safeNumber(montoVisible)
    );
    return Math.max(0, safeNumber(totalSeleccionado) - sumaOtros);
  }, [sumaMediosPago, totalSeleccionado, montoVisible]);

  const puedeCompletarRestante =
    !saving &&
    !esCheque &&
    totalSeleccionado > 0 &&
    restanteParaEstaFila > 0.009;

  useEffect(() => {
    if (esCheque && row.chequeData) {
      onUpdate(row.id, {
        monto: Number(row.chequeData.importe || 0),
        montoDraft: "",
        montoFocused: false,
      });
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
      {/* ── Selector de medio ── */}
      <div className="nc-mp-row nc-mp-row--medio">
        <div className="nc-field" style={{ position: "relative" }}>
          <select
            className="nc-input nc-select"
            value={String(row.id_medio_pago || "")}
            onChange={(e) => handleChangeMedio(e.target.value)}
            disabled={saving}
          >
            <option value="">Seleccionar…</option>
            {mediosPagoList.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.nombre}
              </option>
            ))}
          </select>
          <label
            className={`nc-label${
              row.id_medio_pago ? " nc-label--up" : ""
            }`}
          >
            Medio de pago
          </label>
        </div>
      </div>

      {/* ── Monto ── */}
      <div className="nc-mp-row nc-mp-row--monto">
        <div
          className="nc-field nc-mp-monto-field"
          style={{ position: "relative" }}
        >
          <input
            className="nc-input nc-mp-monto-input"
            type="text"
            inputMode="decimal"
            value={
              row.montoFocused
                ? row.montoDraft ?? ""
                : formatMoneyInputARS(montoVisible)
            }
            onFocus={(e) => {
              if (saving || esCheque) return;
              onUpdate(row.id, {
                montoFocused: true,
                montoDraft: formatEditableMoney(montoVisible),
              });
              setTimeout(() => e.target.select(), 0);
            }}
            onChange={(e) => {
              if (saving || esCheque) return;
              const c = e.target.value.replace(/[^\d,.\-]/g, "");
              onUpdate(row.id, {
                montoDraft: c,
                monto: parseMoneyInputARS(c),
              });
            }}
            onBlur={() => {
              if (saving || esCheque) return;
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, {
                monto: p,
                montoDraft: "",
                montoFocused: false,
              });
            }}
            onKeyDown={(e) => {
              if (saving || esCheque) return;
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="$ 0,00"
            disabled={saving || esCheque}
            style={{
              background: esCheque ? "rgba(0,0,0,.03)" : undefined,
              height: 32,
              padding: "0 10px",
              fontSize: 13,
              textAlign: "right",
            }}
          />
          <label className="nc-label nc-label--up">Monto</label>
        </div>

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

      {/* ── Panel de cheque — estética idéntica a ModalNuevaVenta ── */}
      {esCheque && (
        <div className="nc-mp-cheques">
          <div className="nc-mp-cheques-title">
            <FontAwesomeIcon
              icon={faMoneyCheckDollar}
              style={{ fontSize: 12 }}
            />
            {esEcheq ? "eCheq cargado" : "Cheque cargado"}
          </div>

          {row.chequeData ? (
            <>
              {/* Resumen visual igual al de NuevaVenta */}
              <ChequeResumen cheque={row.chequeData} tipoCheque={tipoCheque} />

              {/* Acciones en fila */}
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  className="nc-pago-btn"
                  style={{ flex: 1 }}
                  onClick={() => onRequestCheque(row.id)}
                  disabled={saving}
                >
                  Editar {tipoCheque === "echeq" ? "eCheq" : "cheque"}
                </button>

              </div>
            </>
          ) : (
            <button
              type="button"
              className="nc-pago-btn"
              onClick={() => onRequestCheque(row.id)}
              disabled={saving || !mpSeleccionado}
            >
              Cargar {tipoCheque === "echeq" ? "eCheq" : "cheque"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PanelMediosPagoReciboLocal({
  mediosFilas,
  mediosPagoList,
  totalSeleccionado,
  onUpdate,
  onRemove,
  onAdd,
  saving,
  loadingMedios,
  sumaMediosPago,
  diferenciaReal,
  onRequestCheque,
}) {
  return (
    <>
      {loadingMedios && (
        <div
          style={{
            padding: "4px 0",
            fontSize: 12,
            color: "var(--nv-muted)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FontAwesomeIcon
            icon={faCircleNotch}
            spin
            style={{ fontSize: 11 }}
          />
          Cargando medios de pago…
        </div>
      )}

      {(Array.isArray(mediosFilas) ? mediosFilas : []).map((mp) => (
        <MedioPagoRowRecibo
          key={mp.id}
          row={mp}
          mediosPagoList={mediosPagoList}
          onUpdate={onUpdate}
          onRemove={onRemove}
          saving={saving}
          canRemove={mediosFilas.length > 1}
          totalSeleccionado={totalSeleccionado}
          sumaMediosPago={sumaMediosPago}
          onRequestCheque={onRequestCheque}
        />
      ))}

      <div className="nc-mp-totals">
        <span className="nc-mp-totals-asignado">
          Asignado: <b>{moneyARS(sumaMediosPago)}</b>
        </span>
        {diferenciaReal > 0.01 && (
          <span className="nc-mp-totals-falta">
            Saldo sin cubrir: {moneyARS(diferenciaReal)}
          </span>
        )}
        {diferenciaReal <= 0.01 && totalSeleccionado > 0 && (
          <span className="nc-mp-totals-ok">✓ Saldo cubierto</span>
        )}
      </div>

      <button
        type="button"
        className="nc-pago-btn"
        onClick={onAdd}
        disabled={saving}
      >
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro
        medio
      </button>
    </>
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
  const [rows, setRows] = useState(() => []);
  const [openDetalleDeuda, setOpenDetalleDeuda] = useState(false);
  const [detalleDeudaRow, setDetalleDeudaRow] = useState(null);

  /* =========================
     Medios de pago - lista global
  ========================= */
  const mediosPagoFromContext = useMemo(
    () => filtrarMediosPagoPorPlan(normalizeMediosPago(lists || {})),
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
    setMediosFilas((p) =>
      p.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }, []);

  const abrirDetalleDeuda = useCallback((row) => {
    setDetalleDeudaRow(row || null);
    setOpenDetalleDeuda(true);
  }, []);

  const cerrarDetalleDeuda = useCallback(() => {
    setOpenDetalleDeuda(false);
    setDetalleDeudaRow(null);
  }, []);

  const sumaMediosPago = useMemo(
    () =>
      mediosFilas.reduce((acc, mp) => {
        const esCheque = isMedioPagoCheque(mediosPago, mp.id_medio_pago);
        const monto =
          esCheque && mp.chequeData
            ? Number(mp.chequeData.importe || 0)
            : safeNumber(mp.monto);
        return acc + monto;
      }, 0),
    [mediosFilas, mediosPago]
  );

  /* =========================
     Modal cheque - por fila
  ========================= */
  const [chequeModalRowId, setChequeModalRowId] = useState(null);

  const openChequeModalForRow = useCallback((rowId) => {
    setChequeModalRowId(rowId);
  }, []);

  const rowParaCheque = useMemo(
    () =>
      chequeModalRowId
        ? mediosFilas.find((r) => r.id === chequeModalRowId) || null
        : null,
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
      setMediosPago(filtrarMediosPagoPorPlan(normalizeMediosPago(data)));
    } catch (e) {
      onToast?.(
        "error",
        e?.message || "No se pudieron cargar los medios de pago."
      );
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
    setRows(Array.isArray(deudas) ? [...deudas] : []);
    setOpenDetalleDeuda(false);
    setDetalleDeudaRow(null);
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
    if (!open || openRecibo || openDetalleDeuda) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!loading) onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openRecibo, openDetalleDeuda, onClose, loading]);

  /* =========================
     Datos ordenados
  ========================= */
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
      if (selectedIds.has(id)) sum += getSaldoPendienteRow(r);
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
      setPagaTodo(
        next.size === pendientes.length && pendientes.length > 0
      );
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

  const verificarNumeroChequeRecibos = useCallback(
    async ({ numero_cheque, tipoCheque, initialData }) => {
      const numeroCheque = onlyDigits(numero_cheque);
      const tipoNormalizado = String(tipoCheque || "cheque").toLowerCase() === "echeq" ? "echeq" : "cheque";

      if (!numeroCheque) {
        return {
          ok: false,
          tipo: "advertencia",
          mensaje: "Ingresá el número de cheque antes de confirmar.",
          duracion: 3200,
        };
      }

      const rowActualId = chequeModalRowId;
      const duplicadoEnModal = mediosFilas.some((mp) => {
        if (!mp || mp.id === rowActualId) return false;
        const ch = mp.chequeData;
        if (!ch) return false;
        const numero = onlyDigits(ch.numero_cheque);
        const tipo = String(ch.tipo || ch.tipo_cheque || "cheque").toLowerCase() === "echeq" ? "echeq" : "cheque";
        return numero && numero === numeroCheque && tipo === tipoNormalizado;
      });

      if (duplicadoEnModal) {
        return {
          ok: false,
          tipo: "error",
          mensaje: `Ya cargaste otro ${tipoNormalizado === "echeq" ? "eCheq" : "cheque"} con el número ${numeroCheque} en este cobro.`,
          duracion: 4600,
        };
      }

      const params = new URLSearchParams();
      params.set("numero_cheque", numeroCheque);
      params.set("tipo", tipoNormalizado);

      const idChequeActual = Number(initialData?.id_cheque || rowParaCheque?.chequeData?.id_cheque || 0);
      if (Number.isFinite(idChequeActual) && idChequeActual > 0) {
        params.set("id_cheque", String(idChequeActual));
      }

      const res = await fetch(`${API_CHECK_NUMERO_CHEQUE}&${params.toString()}`, {
        method: "GET",
        headers: buildAuthHeaders(false),
      });
      const data = await parseJsonOrThrow(res);

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo verificar el número del cheque.");
      }

      if (data?.existe || data?.disponible === false) {
        return {
          ok: false,
          tipo: "error",
          mensaje: data?.mensaje || "Ese número de cheque ya existe.",
          duracion: 4600,
        };
      }

      return { ok: true };
    },
    [chequeModalRowId, mediosFilas, rowParaCheque?.chequeData?.id_cheque]
  );

  /* =========================
     Guardar cheque desde modal
  ========================= */
  const handleSaveCheque = useCallback(
    (datosCheque) => {
      if (!datosCheque.emisor) {
        onToast?.("advertencia", "El emisor es obligatorio.");
        return;
      }
      if (!datosCheque.numero_cheque) {
        onToast?.(
          "advertencia",
          "El número de cheque es obligatorio."
        );
        return;
      }
      if (!datosCheque.importe || Number(datosCheque.importe) <= 0) {
        onToast?.(
          "advertencia",
          "El importe debe ser mayor a 0."
        );
        return;
      }
      if (!datosCheque.fecha_pago) {
        onToast?.(
          "advertencia",
          "La fecha de pago es obligatoria."
        );
        return;
      }

      if (chequeModalRowId) {
        updateMedioPago(chequeModalRowId, {
          chequeData: datosCheque,
          monto: Number(datosCheque.importe || 0),
        });
        onToast?.(
          "exito",
          `${
            datosCheque.tipo_cheque === "echeq" ? "eCheq" : "Cheque"
          } ${datosCheque.numero_cheque} cargado.`
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
      return {
        ok: false,
        msg: "Seleccioná al menos una deuda PENDIENTE para pagar.",
      };
    }

    for (let i = 0; i < mediosFilas.length; i++) {
      const mp = mediosFilas[i];

      if (!mp.id_medio_pago) {
        return {
          ok: false,
          msg: `Medio de pago ${i + 1}: falta seleccionar el medio.`,
        };
      }

      const esCheque = isMedioPagoCheque(mediosPago, mp.id_medio_pago);
      const tipoCheque = isMedioPagoEcheq(mediosPago, mp.id_medio_pago)
        ? "echeq"
        : "cheque";

      if (esCheque) {
        if (!mp.chequeData) {
          return {
            ok: false,
            msg: `Medio de pago ${i + 1}: debés cargar los datos del ${
              tipoCheque === "echeq" ? "eCheq" : "cheque"
            }.`,
          };
        }
      } else {
        if (safeNumber(mp.monto) <= 0) {
          return {
            ok: false,
            msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.`,
          };
        }
      }
    }

    if (sumaMediosPago <= 0.009) {
      return {
        ok: false,
        msg: "El importe a pagar debe ser mayor a 0.",
      };
    }

    if (totalSeleccionado > 0 && sumaMediosPago > totalSeleccionado + 0.05) {
      return {
        ok: false,
        msg: `La suma de los medios de pago (${moneyARS(
          sumaMediosPago
        )}) no puede superar el saldo adeudado (${moneyARS(totalSeleccionado)}).`,
      };
    }

    return { ok: true };
  }, [
    deudasOrdenadas,
    selectedIds,
    mediosFilas,
    mediosPago,
    sumaMediosPago,
    totalSeleccionado,
  ]);

  /* =========================
     Construir payload de medios_pago
  ========================= */
  const buildMediosPagoPayload = useCallback(() => {
    return mediosFilas.map((mp) => {
      const esCheque = isMedioPagoCheque(mediosPago, mp.id_medio_pago);
      return {
        id: mp.id,
        frontend_row_uid: mp.id,
        id_medio_pago: Number(mp.id_medio_pago),
        monto:
          esCheque && mp.chequeData
            ? Number(mp.chequeData.importe || 0)
            : safeNumber(mp.monto),
        cheque_data: esCheque ? mp.chequeData : null,
      };
    });
  }, [mediosFilas, mediosPago]);

  /* =========================
     Construir nombre de medios para el recibo
  ========================= */
  const buildMpNombre = useCallback(() => {
    const nombres = mediosFilas.map((mp) => {
      const found = mediosPago.find(
        (x) => String(x.id) === String(mp.id_medio_pago)
      );
      return found?.nombre || "Medio de pago";
    });
    return nombres.length === 1 ? nombres[0] : nombres.join(" + ");
  }, [mediosFilas, mediosPago]);

  /* =========================
     Construir recibo HTML
  ========================= */
  const buildReciboFromSeleccion = useCallback(
    ({ clienteInfo, mpNombre, seleccion, montoCobrado }) => {
      let restante = Math.max(0, safeNumber(montoCobrado));
      const items = seleccion
        .map((r) => {
          const saldo = getSaldoPendienteRow(r);
          const aplicado = Math.min(saldo, restante);
          restante = Math.max(0, restante - aplicado);
          return {
            id_movimiento: r?.id_movimiento,
            fecha: r?.fecha,
            descripcion: r?.detalle ?? r?.descripcion ?? r?.concepto,
            monto: aplicado,
          };
        })
        .filter((it) => Number(it.monto || 0) > 0.009);
      const total = items.reduce(
        (acc, it) => acc + (Number(it.monto) || 0),
        0
      );
      const payload = {
        fecha_cobro: todayDMY(),
        cliente: {
          id_cliente: clienteInfo?.id_cliente ?? null,
          nombre:
            clienteInfo?.nombre ?? cliente?.cliente ?? "",
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
     Adjuntar archivo de cheque/eCheq creado desde Recibos
  ========================= */
  const actualizarChequeConArchivo = useCallback(
    async ({ idCheque, idMovimiento, cheque }) => {
      if (!(cheque?.archivo instanceof File)) return null;

      const fd = new FormData();
      const { idUsuario } = getAuthInfo();

      fd.append("id_cheque", String(idCheque));
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("idUsuario", String(idUsuario || 0));
      fd.append("tipo", String(cheque?.tipo || cheque?.tipo_cheque || "cheque"));
      fd.append("tipo_cheque", String(cheque?.tipo || cheque?.tipo_cheque || "cheque"));

      const fechaEmisionCheque = String(cheque?.fecha_emision || "").slice(0, 10);
      const fechaPagoCheque = String(cheque?.fecha_pago || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEmisionCheque)) {
        throw new Error("El cheque no tiene fecha de emisión válida cargada desde el modal.");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPagoCheque)) {
        throw new Error("El cheque no tiene fecha de pago válida cargada desde el modal.");
      }

      fd.append("fecha_emision", fechaEmisionCheque);
      fd.append("emisor", String(cheque?.emisor || "").trim().toUpperCase());
      fd.append("numero_cheque", String(cheque?.numero_cheque || "").trim());
      fd.append("importe", String(safeNumber(cheque?.importe || 0)));
      fd.append("fecha_pago", fechaPagoCheque);
      fd.append("observaciones", String(cheque?.observaciones || "").trim());
      fd.append("archivo", cheque.archivo, cheque.archivo_nombre || cheque.archivo.name || "adjunto");

      const res = await fetch(API_CHEQUES_ACTUALIZAR, {
        method: "POST",
        headers: buildAuthHeaders(false),
        body: fd,
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo adjuntar el archivo del cheque.");
      }
      return data;
    },
    []
  );

  const subirArchivosChequesCreados = useCallback(
    async (info) => {
      const warnings = [];
      const creados = Array.isArray(info?.cheques_creados)
        ? info.cheques_creados
        : [];
      if (!creados.length) return warnings;

      const filasCheque = mediosFilas.filter(
        (mp) => mp?.chequeData && mp.chequeData.archivo instanceof File
      );

      for (const mp of filasCheque) {
        const backendCheque = creados.find(
          (x) => String(x?.frontend_row_uid || "") === String(mp.id)
        );
        if (!backendCheque?.id_cheque || !backendCheque?.id_movimiento) {
          warnings.push(
            `No se pudo vincular el archivo del cheque ${mp?.chequeData?.numero_cheque || ""}.`
          );
          continue;
        }

        try {
          await actualizarChequeConArchivo({
            idCheque: backendCheque.id_cheque,
            idMovimiento: backendCheque.id_movimiento,
            cheque: mp.chequeData,
          });
        } catch (e) {
          warnings.push(
            e?.message ||
              `No se pudo adjuntar el archivo del cheque ${mp?.chequeData?.numero_cheque || ""}.`
          );
        }
      }

      return warnings;
    },
    [mediosFilas, actualizarChequeConArchivo]
  );

  /* =========================
     Pago por defecto (sin onConfirm)
  ========================= */
  const confirmPagoDefault = async ({ ids_movimiento, medios_pago }) => {
    const url = `${BASE_URL}/api.php?action=recibos_confirmar_pago`;
    const primaryMedio = medios_pago?.[0]?.id_medio_pago || 0;
    return await fetchJsonOrThrow(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(false),
      },
      body: JSON.stringify({
        ids_movimiento,
        medios_pago,
        fecha_cobro: todayISO(),
        fecha_pago: todayISO(),
        fecha: todayISO(),
        id_medio_pago: primaryMedio,
      }),
    });
  };

  /* =========================
     Confirmar pago
  ========================= */
  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.");
      return;
    }

    const v = validate();
    if (!v.ok) {
      onToast?.("error", v.msg);
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    const ids = seleccion
      .map((r) => Number(r?.id_movimiento || 0))
      .filter(Boolean);
    const mediosPagoPayload = buildMediosPagoPayload();
    const mpNombre = buildMpNombre();

    try {
      setLoading(true);

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
          fecha_cobro: todayISO(),
          fecha_pago: todayISO(),
          fecha: todayISO(),
          id_medio_pago: mediosPagoPayload[0]?.id_medio_pago || 0,
          medio_pago: mpNombre,
          ids_movimiento: ids,
        });
      } else {
        resp = await confirmPagoDefault({
          ids_movimiento: ids,
          medios_pago: mediosPagoPayload,
        });
      }

      const warningsArchivosCheque = await subirArchivosChequesCreados(resp);

      const idsCobroResp = Array.isArray(resp?.ids_cobro)
        ? resp.ids_cobro.map((x) => Number(x || 0)).filter(Boolean)
        : [];

      setIdsMovimientosPagados(ids);
      setUltimoCobroId(
        Number(idsCobroResp?.[0] || resp?.id_cobro || 0) || null
      );

      let restantePagoLocal = Math.max(0, safeNumber(sumaMediosPago));
      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const id = Number(r?.id_movimiento || 0);
          if (!id || !ids.includes(id)) return r;

          const saldoAntes = getSaldoPendienteRow(r);
          const aplicado = Math.min(saldoAntes, restantePagoLocal);
          restantePagoLocal = Math.max(0, restantePagoLocal - aplicado);

          const nuevoCobrado = getCobradoTotalRow(r) + aplicado;
          const nuevoSaldo = Math.max(0, getMontoTotalRow(r) - nuevoCobrado);

          return {
            ...r,
            cobrado_total: nuevoCobrado,
            saldo_pendiente: nuevoSaldo,
            pagado: nuevoSaldo <= 0.009,
          };
        })
      );

      onAfterPaid?.(ids, {
        nombre: mpNombre,
        seleccion,
        montoCobrado: sumaMediosPago,
      });

      const built = buildReciboFromSeleccion({
        clienteInfo: {
          id_cliente: cliente?.id_cliente ?? null,
          nombre: cliente?.cliente ?? "",
        },
        mpNombre,
        seleccion,
        montoCobrado: sumaMediosPago,
      });

      setReciboHtml(built.html);
      setReciboTitle(built.title);
      setOpenRecibo(true);
      setSelectedIds(new Set());
      setPagaTodo(false);
      setMediosFilas([buildEmptyMedioPago()]);

      if (warningsArchivosCheque.length > 0) {
        onToast?.(
          "advertencia",
          `Pago realizado, pero hubo problemas con archivo/s de cheque: ${warningsArchivosCheque.join(" | ")}`
        );
      } else {
        onToast?.("exito", "Pago realizado correctamente.");
      }
      setTimeout(recomputeTbodyScroll, 0);
    } catch (e) {
      onToast?.(
        "error",
        e?.message || "No se pudo registrar el pago."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Factura
  ========================= */
  const handleFactura = async () => {
    if (!onFactura) {
      onToast?.(
        "error",
        "Falta conectar la acción de factura (onFactura)."
      );
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.");
      return;
    }
    if (seleccion.length === 0) {
      onToast?.(
        "error",
        "Seleccioná al menos una deuda PENDIENTE para facturar."
      );
      return;
    }

    const v = validate();
    if (!v.ok) {
      onToast?.("error", v.msg);
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
      onToast?.(
        "error",
        e?.message || "No se pudo generar la factura."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     Render
  ========================= */
  if (!open) return null;

  const isProcessing = loading;
  const canConfirm =
    !isProcessing &&
    selectedIds.size > 0 &&
    !loadingMedios &&
    mediosFilas.every((mp) => mp.id_medio_pago);

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
          <div
            className={modalClass}
            ref={dialogRef}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mi-modal__header">
              <div className="mi-modal__head-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faMoneyBill1Wave} />
              </div>
              <div className="mi-modal__head-left">
                <h2 className="mi-modal__title">Pagar recibo</h2>
                <p className="mi-modal__subtitle">
                  {safeText(cliente?.cliente)}
                  {cliente?.id_cliente
                    ? ` · ID ${String(cliente.id_cliente)}`
                    : ""}
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
                ✕
              </button>
            </div>

            <div className="mi-modal__content">
              <div className="mi-cr-grid">
                <section className="mi-cr-table">
                  <div className="mpr-thead">
                    <div className="mpr-th mpr-th--sel">Sel</div>
                    <div className="mpr-th">Fecha</div>
                    <div className="mpr-th mpr-th--desc">Descripción</div>
                    <div className="mpr-th mpr-th--center">Estado</div>
                    <div className="mpr-th mpr-th--right">Monto</div>
                    <div className="mpr-th mpr-th--info">Info</div>
                  </div>

                  <div
                    ref={tbodyRef}
                    className={`mpr-tbody ${
                      tbodyHasScroll ? "mpr-tbody--scroll" : ""
                    }`}
                  >
                    {!deudasOrdenadas.length && (
                      <div className="mpr-empty">
                        No hay registros para este cliente.
                      </div>
                    )}

                    {deudasOrdenadas.map((r, idx) => {
                      const id = Number(r?.id_movimiento || 0);
                      const pagado = isPagadoRow(r);
                      const checked = selectedIds.has(id);
                      const monto = getMontoTotalRow(r);
                      const saldoPendiente = getSaldoPendienteRow(r);

                      return (
                        <div
                          key={id || `${r?.fecha}-${idx}`}
                          className={`mpr-row ${
                            checked ? "is-checked" : ""
                          } ${pagado ? "is-paid" : ""}`}
                          role="row"
                          onClick={() => id && toggleOne(id, r)}
                          title={
                            pagado
                              ? "Este registro ya está PAGADO"
                              : undefined
                          }
                        >
                          <div
                            className="mpr-td mpr-td--sel"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <label
                              className={`mpr-check ${
                                !id || isProcessing || pagado
                                  ? "is-disabled"
                                  : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOne(id, r)}
                                disabled={!id || isProcessing || pagado}
                              />
                              <span
                                className="mpr-check__box"
                                aria-hidden="true"
                              />
                            </label>
                          </div>
                          <div className="mpr-td">
                            {safeText(formatFechaDMY(r?.fecha))}
                          </div>
                          <div
                            className="mpr-td mpr-td--desc"
                            title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                          >
                            {productosLabel(r)}
                          </div>
                          <div className="mpr-td mpr-td--center">
                            <EstadoChip row={r} pagado={pagado} />
                          </div>
                          <div className="mpr-td mpr-td--right mpr-td--mono">
                            {moneyARS(saldoPendiente)}
                          </div>
                          <div className="mpr-td mpr-td--info" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="mpr-info-btn"
                              onClick={() => abrirDetalleDeuda(r)}
                              title="Ver detalle de la deuda"
                              aria-label="Ver detalle de la deuda"
                            >
                              <FontAwesomeIcon icon={faInfoCircle} />
                            </button>
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
                        <span>Saldo seleccionado</span>
                        <b>{moneyARS(totalSeleccionado)}</b>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="mi-cr-filters">
                  <aside className="nc-aside">
                    <div className="nc-section">
                      <div className="nc-section-head">
                        <div className="nc-section-dot" />
                        <span>Datos del cobro</span>
                      </div>

                      <div className="nc-section-body">
                        <button
                          type="button"
                          className="nv-foot-btn"
                          style={{
                            width: "100%",
                            justifyContent: "center",
                          }}
                          onClick={toggleAll}
                          disabled={
                            !deudasOrdenadas.length || isProcessing
                          }
                        >
                          <span className="nv-foot-btn__icon">
                            <FontAwesomeIcon
                              icon={faListCheck}
                              style={{ fontSize: 10 }}
                            />
                          </span>
                          {pagaTodo
                            ? "Deseleccionar todas"
                            : "Seleccionar todas"}
                        </button>

                        <div className="nc-section-divider" />

                        <PanelMediosPagoReciboLocal
                          mediosFilas={mediosFilas}
                          mediosPagoList={mediosPago}
                          totalSeleccionado={totalSeleccionado}
                          onUpdate={updateMedioPago}
                          onRemove={removeMedioPago}
                          onAdd={addMedioPago}
                          saving={isProcessing}
                          loadingMedios={loadingMedios}
                          sumaMediosPago={sumaMediosPago}
                          diferenciaReal={diferenciaReal}
                          onRequestCheque={openChequeModalForRow}
                        />
                      </div>
                    </div>
                  </aside>

                  <div className="nc-actions mi-cr-filters__actions mi-cr-filters__actions--sticky">
                    <button
                      type="button"
                      className="mit-btn mit-btn--solid mit-btn--block"
                      onClick={handleConfirm}
                      disabled={!canConfirm}
                    >
                      {isProcessing ? (
                        <>
                          <FontAwesomeIcon
                            icon={faCircleNotch}
                            spin
                            style={{ marginRight: 6 }}
                          />
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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de recibo generado */}
      <ModalDetalleMovimiento
        open={openDetalleDeuda}
        row={detalleDeudaRow}
        title="Detalle de deuda a cobrar"
        hideMediosPago
        onClose={cerrarDetalleDeuda}
      />

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

      {/* Modal de cheque/echeq */}
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
        verificarNumeroCheque={verificarNumeroChequeRecibos}
      />
    </>,
    document.body
  );
}
