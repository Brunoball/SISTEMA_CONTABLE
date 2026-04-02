import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faFileInvoiceDollar,
  faMoneyCheckDollar,
  faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import BASE_URL from "../../../../config/config.jsx";

// ─── Importar el mismo CSS que usa ModalNuevaCompra ───────────────────────────
import "../../../Global/Global_css/Global_Modals_nueva_compra.css";
import "../../../Global/Global_css/Global_responsive.css";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function moneyARS(v) {
  try {
    return Number(v || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$${Number(v || 0).toFixed(2)}`;
  }
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
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}

function uid() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

function normalizeName(v) {
  return String(v ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   HELPERS DE IDs
========================================================= */
function getMovimientoId(r) {
  const cand =
    r?.id_movimiento ?? r?.idMovimiento ?? r?.id_mov ?? r?.id ?? r?.id_egreso ??
    r?.idEgreso ?? r?.egreso_id ?? r?.movimiento_id ?? r?.id_movimiento_fk ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSavedMovimientoIdFromResponse(data, initialData = null) {
  const candidates = [
    data?.id_movimiento, data?.movimiento_id, data?.id,
    data?.egreso?.id_movimiento, data?.egreso?.id,
    data?.otro_egreso?.id_movimiento, data?.otro_egreso?.id,
    initialData?.id_movimiento, initialData?.id,
  ];
  for (const cand of candidates) {
    const n = Number(cand);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function getMedioPagoId(c) {
  const cand = c?.id ?? c?.id_medio_pago ?? c?.idMedioPago ?? c?.medio_pago_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getDetalleId(d) {
  const cand =
    d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ??
    d?.id_categoria_egreso ?? d?.idCategoriaEgreso ?? d?.categoria_egreso_id ??
    d?.id_stock_producto ?? d?.idStockProducto ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getClasificacionId(c) {
  const cand = c?.id ?? c?.id_clasificacion ?? c?.idClasificacion ?? c?.clasificacion_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionLabel(x) {
  return safeStr(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? "");
}

/* =========================================================
   CHEQUES — helpers
========================================================= */
function normalizeText(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeChequeTipoFromMedio(nombre) {
  const s = normalizeText(nombre);
  if (!s) return null;
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq")) return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}

function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${String(Number(m[3])).padStart(2,"0")}/${String(Number(m[2])).padStart(2,"0")}/${m[1]}`;
  return s;
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

/* =========================================================
   STOCK helpers
========================================================= */
function getStockDisponible(detalle) {
  const cand = detalle?.stock ?? detalle?.stock_disponible ?? detalle?.stockDisponible ??
    detalle?.cantidad_stock ?? detalle?.cantidad ?? null;
  if (cand === null || cand === undefined || cand === "") return null;
  const n = Number(cand);
  return Number.isFinite(n) ? n : null;
}

function isSinStock(stock) {
  return stock !== null && stock !== undefined && Number(stock) <= 0;
}

/* =========================================================
   LISTAS
========================================================= */
function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src?.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);

  const mediosPago = pick("medios_pago").length ? pick("medios_pago")
    : pick("mediosPago").length ? pick("mediosPago")
    : pick("medios").length ? pick("medios") : [];

  const detalles = pick("detalles").length ? pick("detalles")
    : pick("categorias_egreso").length ? pick("categorias_egreso")
    : pick("categoriasEgreso").length ? pick("categoriasEgreso")
    : pick("categorias").length ? pick("categorias") : [];

  const clasificaciones = pick("clasificaciones").length ? pick("clasificaciones")
    : pick("clasificacion").length ? pick("clasificacion") : [];

  return {
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
    detalles: Array.isArray(detalles) ? detalles : [],
    clasificaciones: Array.isArray(clasificaciones) ? clasificaciones : [],
  };
}

function resolveClasificacionesConfig(clasificacionesList) {
  const arr = Array.isArray(clasificacionesList) ? clasificacionesList : [];
  const parsed = arr
    .map((x) => ({ id: getClasificacionId(x), nombreOriginal: optionLabel(x), nombre: normalizeName(optionLabel(x)) }))
    .filter((x) => Number.isFinite(Number(x.id)) && Number(x.id) > 0);

  const fijo =
    parsed.find((x) => x.nombre === "COSTO FIJO") ||
    parsed.find((x) => x.nombre.includes("COSTO FIJO")) || null;

  const noFijo =
    parsed.find((x) => x.id !== fijo?.id && (x.nombre === "COSTO VARIABLE" || x.nombre.includes("VARIABLE") || x.nombre.includes("NO ES COSTO FIJO"))) ||
    parsed.find((x) => x.id !== fijo?.id) || null;

  return {
    idCostoFijo:    String(fijo?.id ?? 1),
    idNoCostoFijo:  String(noFijo?.id ?? 2),
    labelCostoFijo: "Costo fijo",
    labelNoCostoFijo: "No es costo fijo",
  };
}

/* =========================================================
   AUTH
========================================================= */
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") || localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") || localStorage.getItem("X-Session") || "";
  const token = localStorage.getItem("token") || "";
  return { sessionKey, token };
}

function buildAuthHeaders(isJson = true) {
  const { sessionKey, token } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data = null;
  try { data = JSON.parse(text); } catch {
    throw new Error(`Respuesta inválida del servidor. ${text.length > 500 ? text.slice(0,500)+"..." : text}`);
  }
  if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
  return data;
}

async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildAuthHeaders(false) });
  return await parseJsonOrThrow(res);
}

async function apiPostForm(url, formData) {
  const res = await fetch(url, { method: "POST", headers: buildAuthHeaders(false), body: formData });
  return await parseJsonOrThrow(res);
}

/* =========================================================
   ROWS helpers
========================================================= */
function buildEmptyRow() {
  return { id: uid(), id_detalle: NULL_OPTION, detalle: "", cantidad: 1, precio: 0, precioDraft: "", precioFocused: false, ivaPct: 0, stock_disponible: null, sinStock: false };
}

function buildRowFromData(r) {
  return {
    id: uid(),
    id_detalle: String(getDetalleId(r) ?? ""),
    detalle: safeStr(r?.detalle ?? r?.descripcion ?? r?.concepto),
    cantidad: Math.max(1, safeNumber(r?.cantidad || 1)),
    precio: safeNumber(r?.precio ?? r?.importe ?? r?.monto ?? 0),
    precioDraft: "", precioFocused: false,
    ivaPct: safeNumber(r?.iva_pct ?? r?.ivaPct ?? 0),
    stock_disponible: null, sinStock: false,
  };
}

function buildRowsFromInitial(data) {
  const items =
    Array.isArray(data?.items) && data.items.length ? data.items :
    Array.isArray(data?.detalles) && data.detalles.length ? data.detalles : null;

  if (items?.length) {
    return items.map((x) => ({
      id: uid(),
      id_detalle: String(getDetalleId(x) ?? ""),
      detalle: safeStr(x?.detalle ?? x?.descripcion ?? x?.concepto ?? x?.detalle_nombre ?? ""),
      cantidad: Math.max(1, safeNumber(x?.cantidad || 1)),
      precio: safeNumber(x?.precio ?? x?.importe ?? x?.monto ?? 0),
      precioDraft: "", precioFocused: false,
      ivaPct: safeNumber(x?.iva_pct ?? x?.ivaPct ?? 0),
      stock_disponible: null, sinStock: false,
    }));
  }
  return [buildRowFromData(data)];
}

function describeLineProblem(r, idx1based) {
  const detalle = safeStr(r.detalle);
  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);
  const touched = detalle !== "" || String(r.id_detalle || "").trim() !== "" || qty !== 0 || price !== 0;
  if (!touched) return null;
  const issues = [];
  if (!detalle) issues.push("falta la descripción");
  if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser > 0");
  if (!(Number.isFinite(price) && price > 0)) issues.push("el importe debe ser > 0");
  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0");
  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

/* =========================================================
   MEDIOS DE PAGO helpers
========================================================= */
function buildEmptyMedioPago() {
  return { id: uid(), id_medio_pago: NULL_OPTION, monto: 0, montoDraft: "", montoFocused: false, id_cheque: [], chequesDisponibles: [], loadingCheques: false };
}

function buildMediosPagoFromInitial(data) {
  const detalle = Array.isArray(data?.medios_pago_detalle) ? data.medios_pago_detalle : [];

  if (detalle.length) {
    const rows = [];
    let currentChequeRow = null;

    detalle.forEach((mp) => {
      const idMedio = String(mp?.id_medio_pago ?? "");
      const idCheque = Number(mp?.id_cheque ?? 0);
      const chequeTipo = safeStr(mp?.cheque_tipo).toLowerCase();

      if (idCheque > 0) {
        const canMerge = currentChequeRow &&
          String(currentChequeRow.id_medio_pago) === idMedio &&
          String(currentChequeRow._chequeTipo || "") === chequeTipo;

        if (!canMerge) {
          currentChequeRow = { ...buildEmptyMedioPago(), id_medio_pago: idMedio, monto: 0, id_cheque: [], chequesDisponibles: [], loadingCheques: false, _chequeTipo: chequeTipo };
          rows.push(currentChequeRow);
        }
        currentChequeRow.id_cheque.push(String(idCheque));
        currentChequeRow.monto += safeNumber(mp?.monto ?? mp?.cheque_importe ?? 0);
        currentChequeRow.chequesDisponibles.push({
          id_cheque: idCheque, tipo: chequeTipo,
          emisor: safeStr(mp?.emisor), numero_cheque: safeStr(mp?.numero_cheque),
          fecha_emision: safeStr(mp?.fecha_emision), fecha_pago: safeStr(mp?.fecha_pago),
          importe: safeNumber(mp?.cheque_importe ?? mp?.monto),
        });
      } else {
        rows.push({ ...buildEmptyMedioPago(), id_medio_pago: idMedio, monto: safeNumber(mp?.monto), loadingCheques: false });
        currentChequeRow = null;
      }
    });

    return rows.map(({ _chequeTipo, ...rest }) => rest);
  }

  const legacyId = Number(data?.id_medio_pago ?? data?.medio_pago_id ?? 0);
  const legacyMonto = safeNumber(data?.monto_total ?? data?.total ?? 0);
  if (legacyId > 0) return [{ ...buildEmptyMedioPago(), id_medio_pago: String(legacyId), monto: legacyMonto }];
  return [buildEmptyMedioPago()];
}

/* =========================================================
   TARJETAS DE CHEQUES — idéntica a ModalNuevaCompra
========================================================= */
function ChequesCarteraCards({ cheques, idsSeleccionados, onToggle }) {
  if (!cheques.length) return null;
  return (
    <div className="mpr-cheques-cards">
      {cheques.map((ch, idx) => {
        const checked = idsSeleccionados.includes(String(ch?.id_cheque));
        return (
          <div
            key={ch?.id_cheque || idx}
            className={`mpr-cheque-card-item ${checked ? "is-checked" : ""}`}
            onClick={() => onToggle(String(ch?.id_cheque || ""))}
            style={{ border: checked ? "1px solid #0f766e" : "1px solid rgba(0,0,0,.08)", borderRadius: 10, padding: 10, cursor: "pointer", marginBottom: 6, background: checked ? "rgba(15,118,110,.06)" : "transparent" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <input type="checkbox" checked={checked} onChange={() => onToggle(String(ch?.id_cheque || ""))} onClick={(e) => e.stopPropagation()} style={{ cursor: "pointer" }} />
              <span style={{ fontWeight: 700, fontSize: 13 }}>N° {safeText(ch?.numero_cheque)}</span>
            </div>
            <div style={{ display: "grid", gap: 3, fontSize: 12 }}>
              <div><b>Emisor:</b> {safeText(ch?.emisor)}</div>
              <div><b>F. emisión:</b> {safeText(formatFechaDMY(ch?.fecha_emision))}</div>
              <div><b>F. pago:</b> {safeText(formatFechaDMY(ch?.fecha_pago))}</div>
            </div>
            <div style={{ marginTop: 6, fontWeight: 700, textAlign: "right", fontSize: 13 }}>{moneyARS(ch?.importe || 0)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   FILA MEDIO DE PAGO — layout idéntico a ModalNuevaCompra
========================================================= */
function MedioPagoRow({ row, idx, mediosPagoList, totalEgreso, sumaMediosPago, onUpdate, onRemove, saving, dark, showToast }) {
  const mpSeleccionado = useMemo(
    () => mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(row.id_medio_pago ?? "")) || null,
    [mediosPagoList, row.id_medio_pago]
  );
  const tipoCheque = useMemo(() => normalizeChequeTipoFromMedio(mpSeleccionado?.nombre || ""), [mpSeleccionado]);
  const esCheque = tipoCheque !== null;

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - safeNumber(row.monto));
    return Math.max(0, safeNumber(totalEgreso) - sumaOtros);
  }, [sumaMediosPago, totalEgreso, row.monto]);

  const puedeCompletarRestante = !saving && !esCheque && totalEgreso > 0 && restanteParaEstaFila > 0.009;

  const handleChangeMedio = useCallback(async (val) => {
    const mp = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(val));
    const tipo = normalizeChequeTipoFromMedio(mp?.nombre || "");
    onUpdate(row.id, { id_medio_pago: val, id_cheque: [], chequesDisponibles: [], loadingCheques: tipo !== null });
    if (tipo !== null) {
      try {
        const sp = new URLSearchParams();
        sp.set("action", "otros_egresos_cheques_cartera_listar");
        sp.set("tipo", tipo);
        const data = await apiGet(`${BASE_URL}/api.php?${sp.toString()}`);
        onUpdate(row.id, { chequesDisponibles: Array.isArray(data?.cheques) ? data.cheques : [], loadingCheques: false });
      } catch (e) {
        onUpdate(row.id, { chequesDisponibles: [], loadingCheques: false });
        showToast("error", e?.message || "No se pudieron cargar los cheques.", 4200);
      }
    }
  }, [mediosPagoList, onUpdate, row.id, showToast]);

  const handleToggleCheque = useCallback((idChequeStr) => {
    const current = Array.isArray(row.id_cheque) ? row.id_cheque : [];
    const next = current.includes(idChequeStr) ? current.filter((x) => x !== idChequeStr) : [...current, idChequeStr];
    onUpdate(row.id, { id_cheque: next });
  }, [row.id, row.id_cheque, onUpdate]);

  const chequesSeleccionados = Array.isArray(row.id_cheque) ? row.id_cheque : [];

  const importeCheques = useMemo(() => {
    if (!esCheque || !chequesSeleccionados.length) return 0;
    return chequesSeleccionados.reduce((acc, idStr) => {
      const ch = row.chequesDisponibles.find((x) => String(x.id_cheque) === idStr);
      return acc + (ch ? Number(ch.importe || 0) : 0);
    }, 0);
  }, [esCheque, chequesSeleccionados, row.chequesDisponibles]);

  useEffect(() => {
    if (esCheque && chequesSeleccionados.length > 0) onUpdate(row.id, { monto: importeCheques });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importeCheques, esCheque]);

  return (
    <div className="nc-mp-card">
      {/* Fila principal: Medio + Monto + Acciones */}
      <div className="nc-mp-inline">
        <div className="nc-mp-medio">
          <div className="nc-mp-sublabel">Medio</div>
          <select className="nc-mp-select" value={String(row.id_medio_pago || "")} onChange={(e) => handleChangeMedio(e.target.value)} disabled={saving}>
            <option value={NULL_OPTION}>Seleccionar...</option>
            {mediosPagoList.map((x) => {
              const idMp = getMedioPagoId(x);
              return <option key={idMp ?? x?.nombre ?? uid()} value={idMp != null ? String(idMp) : ""}>{String(x?.nombre ?? "").trim() || "Medio"}</option>;
            })}
          </select>
        </div>

        <div className="nc-mp-monto-wrap">
          <div className="nc-mp-sublabel">Monto</div>
          <input
            className="nc-mp-input-monto"
            type="text"
            inputMode="decimal"
            value={row.montoFocused ? (row.montoDraft ?? "") : formatMoneyInputARS(row.monto)}
            onFocus={(e) => { onUpdate(row.id, { montoFocused: true, montoDraft: formatEditableMoney(row.monto) }); setTimeout(() => e.target.select(), 0); }}
            onChange={(e) => { const c = e.target.value.replace(/[^\d,.\-]/g, ""); onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) }); }}
            onBlur={() => { const p = parseMoneyInputARS(row.montoDraft); onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false }); }}
            placeholder="$ 0,00"
            disabled={saving || (esCheque && chequesSeleccionados.length > 0)}
            style={{ background: esCheque && chequesSeleccionados.length > 0 ? "rgba(0,0,0,.03)" : undefined }}
          />
        </div>

        <div className="nc-mp-actions-col">
          {!esCheque && (
            <button type="button" className="nc-mp-completar"
              onClick={() => onUpdate(row.id, { monto: restanteParaEstaFila, montoDraft: "", montoFocused: false })}
              disabled={!puedeCompletarRestante} title="Completar importe restante">
              ↓ Rest.
            </button>
          )}
          <button type="button" className="nc-mp-del-btn" onClick={() => onRemove(row.id)} disabled={saving} title="Quitar medio de pago">×</button>
        </div>
      </div>

      {/* Panel cheques */}
      {esCheque && (
        <div className="nc-mp-cheques">
          <div className="nc-mp-cheques-title">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ marginRight: 5, fontSize: 12 }} />
            {tipoCheque === "echeq" ? "eCheqs en cartera" : "Cheques en cartera"}
          </div>
          {row.loadingCheques ? (
            <div className="nc-mp-cheques-loading"><FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />Cargando...</div>
          ) : row.chequesDisponibles.length === 0 ? (
            <div className="nc-mp-cheques-empty">No hay {tipoCheque === "echeq" ? "eCheqs" : "cheques"} activos en cartera.</div>
          ) : (
            <ChequesCarteraCards cheques={row.chequesDisponibles} idsSeleccionados={chequesSeleccionados} onToggle={handleToggleCheque} />
          )}
          {chequesSeleccionados.length > 0 && (
            <div className="nc-mp-cheques-sum">✓ {chequesSeleccionados.length} cheque(s) — {moneyARS(importeCheques)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MODAL PRINCIPAL
========================================================= */
export default function ModalNuevoEgreso({ open, mode = "create", initialData = null, lists, onClose, onToast, onSubmit, onSaved }) {
  const API_UPLOAD = `${BASE_URL}/api.php?action=otros_egresos_comprobantes_vincular_movimiento_upload`;

  const showToast = useCallback((tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur), [onToast]);

  const [dark, setDark]               = useState(isTemaOscuro);
  const [saving, setSaving]           = useState(false);
  const [fecha, setFecha]             = useState(todayISO);
  const [filters, setFilters]         = useState({ id_clasificacion: "" });
  const [rows, setRows]               = useState(() => [buildEmptyRow()]);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  const [mediosFilas, setMediosFilas] = useState(() => [buildEmptyMedioPago()]);

  const rowsContainerRef = useRef(null);
  const [hasScroll, setHasScroll]    = useState(false);
  const closeBtnRef  = useRef(null);
  const prevOpenRef  = useRef(false);
  const fechaInputRef = useRef(null);

  const localLists        = useMemo(() => normalizeLists(lists), [lists]);
  const mediosPagoList    = useMemo(() => Array.isArray(localLists.medios_pago) ? localLists.medios_pago : [], [localLists.medios_pago]);
  const detallesList      = useMemo(() => Array.isArray(localLists.detalles) ? localLists.detalles : [], [localLists.detalles]);
  const clasificacionesList = useMemo(() => Array.isArray(localLists.clasificaciones) ? localLists.clasificaciones : [], [localLists.clasificaciones]);
  const clasificacionConfig = useMemo(() => resolveClasificacionesConfig(clasificacionesList), [clasificacionesList]);

  const isCostoFijoChecked   = String(filters.id_clasificacion) === String(clasificacionConfig.idCostoFijo);
  const isNoCostoFijoChecked = String(filters.id_clasificacion) === String(clasificacionConfig.idNoCostoFijo);

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update); o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update); if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  useEffect(() => { if (!open) return; const p = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = p; }; }, [open]);
  useEffect(() => { if (!open) return; const h = (e) => { if (e.key === "Escape" && !saving) onClose?.(); }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [open, onClose, saving]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current; prevOpenRef.current = open;
    if (!open) return;
    if (!wasOpen && open) {
      const isEdit = mode === "edit";
      const movId = getMovimientoId(initialData);
      setFecha(safeStr(initialData?.fecha).slice(0, 10) || todayISO());
      setFilters({ id_clasificacion: String(initialData?.id_clasificacion ?? initialData?.clasificacion_id ?? "") });
      setRows(isEdit && (movId || initialData) ? buildRowsFromInitial(initialData) : [buildEmptyRow()]);
      setMediosFilas(isEdit && (movId || initialData) ? buildMediosPagoFromInitial(initialData) : [buildEmptyMedioPago()]);
      setArchivoAdjunto(null); setSaving(false);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, mode, initialData]);

  useEffect(() => {
    const el = rowsContainerRef.current; if (!el) return;
    const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check); ro.observe(el);
    window.addEventListener("resize", check);
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, [open, rows]);

  const addRow    = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback((id) => setRows((p) => { const n = p.filter((r) => r.id !== id); return n.length ? n : [buildEmptyRow()]; }), []);
  const updateRow = useCallback((id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  const addMedioPago    = useCallback(() => setMediosFilas((p) => [...p, buildEmptyMedioPago()]), []);
  const removeMedioPago = useCallback((id) => setMediosFilas((p) => { const n = p.filter((r) => r.id !== id); return n.length ? n : [buildEmptyMedioPago()]; }), []);
  const updateMedioPago = useCallback((id, patch) => setMediosFilas((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  const handleSelectDetalle = useCallback((item, rowId) => {
    const precio = safeNumber(item?.precio || 0);
    const stockDisponible = getStockDisponible(item);
    const sinStock = isSinStock(stockDisponible);
    updateRow(rowId, { id_detalle: String(getDetalleId(item) ?? ""), detalle: optionLabel(item), precio, stock_disponible: stockDisponible, sinStock, cantidad: sinStock ? "" : 1 });
    if (sinStock) showToast("advertencia", `El producto "${optionLabel(item)}" no tiene stock disponible.`, 2500);
  }, [updateRow, showToast]);

  const handleCantidadChange = useCallback((rowId, newCantidad) => {
    const row = rows.find((r) => r.id === rowId); if (!row) return;
    if (row.sinStock || isSinStock(row.stock_disponible)) { updateRow(rowId, { cantidad: "" }); return; }
    let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);
    if (typeof cantidadFinal === "number" && cantidadFinal < 0) cantidadFinal = 0;
    if (row.stock_disponible !== null && row.stock_disponible !== undefined && row.stock_disponible !== "" && typeof cantidadFinal === "number" && cantidadFinal > Number(row.stock_disponible)) {
      cantidadFinal = Number(row.stock_disponible);
      showToast("advertencia", `Stock máximo disponible: ${row.stock_disponible}`, 2000);
    }
    updateRow(rowId, { cantidad: cantidadFinal });
  }, [rows, updateRow, showToast]);

  const handleOpenDate = useCallback((e) => {
    if (saving) return;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const input = fechaInputRef.current; if (!input) return;
    input.focus();
    try { if (typeof input.showPicker === "function") input.showPicker(); else input.click(); } catch { input.click(); }
  }, [saving]);

  const rowsCalc = useMemo(() => rows.map((r) => {
    const cantidad = Math.max(0, safeNumber(r.cantidad));
    const precio   = Math.max(0, safeNumber(r.precio));
    const ivaPct   = Math.max(0, safeNumber(r.ivaPct));
    const subtotal = cantidad * precio;
    const ivaMonto = subtotal * (ivaPct / 100);
    const total    = subtotal + ivaMonto;
    return { ...r, subtotal, ivaMonto, total };
  }), [rows]);

  const resumen = useMemo(() => ({
    subtotal: rowsCalc.reduce((a, r) => a + safeNumber(r.subtotal), 0),
    iva:      rowsCalc.reduce((a, r) => a + safeNumber(r.ivaMonto), 0),
    total:    rowsCalc.reduce((a, r) => a + safeNumber(r.total), 0),
  }), [rowsCalc]);

  const sumaMediosPago    = useMemo(() => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0), [mediosFilas]);
  const diferenciaRestante = useMemo(() => Math.max(0, resumen.total - sumaMediosPago), [resumen.total, sumaMediosPago]);

  const validate = useCallback(() => {
    const clas = Number(filters.id_clasificacion);
    if (!Number.isFinite(clas) || clas <= 0) return { ok: false, msg: "Debés indicar si el egreso es costo fijo o no." };
    if (!safeStr(fecha)) return { ok: false, msg: "Falta la fecha." };

    for (let i = 0; i < mediosFilas.length; i++) {
      const mp = mediosFilas[i];
      if (!mp.id_medio_pago || mp.id_medio_pago === NULL_OPTION) return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
      if (safeNumber(mp.monto) <= 0) return { ok: false, msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.` };
      const mpRow = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago));
      const tipoCheque = normalizeChequeTipoFromMedio(mpRow?.nombre || "");
      if (tipoCheque !== null) {
        const sel = Array.isArray(mp.id_cheque) ? mp.id_cheque : [];
        if (!sel.length) return { ok: false, msg: `Medio de pago ${i + 1}: debés seleccionar al menos un ${tipoCheque === "echeq" ? "eCheq" : "cheque"} en cartera.` };
      }
    }

    if (sumaMediosPago < resumen.total - 0.05 && resumen.total > 0)
      return { ok: false, msg: `La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total del egreso (${moneyARS(resumen.total)}).` };

    const problems = [];
    rowsCalc.forEach((r, i) => { const p = describeLineProblem(r, i + 1); if (p) problems.push(p); });
    const usable = rowsCalc.filter((r) => safeStr(r.detalle) !== "" && Number(r.id_detalle || 0) > 0 && safeNumber(r.cantidad) > 0 && safeNumber(r.precio) > 0 && safeNumber(r.total) > 0);

    if (!usable.length) {
      if (problems.length) { const msg = problems.slice(0,2).join(" "); const extra = problems.length > 2 ? ` (y ${problems.length-2} más)` : ""; return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` }; }
      return { ok: false, msg: "Cargá al menos 1 fila válida (Descripción + Cantidad + Importe)." };
    }
    return { ok: true, warn: problems.length > 0, usable };
  }, [filters, fecha, rowsCalc, mediosFilas, mediosPagoList, resumen.total, sumaMediosPago]);

  const buildPayload = useCallback(() => {
    const usableRows = rowsCalc.filter((r) => safeStr(r.detalle) !== "" && Number(r.id_detalle || 0) > 0 && safeNumber(r.cantidad) > 0 && safeNumber(r.precio) > 0 && safeNumber(r.total) > 0);
    const detalleFinal = usableRows.length === 1 ? safeStr(usableRows[0].detalle) : usableRows.map((x) => safeStr(x.detalle)).filter(Boolean).join(" | ");
    const subtotalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.subtotal), 0);
    const ivaFinal      = usableRows.reduce((acc, x) => acc + safeNumber(x.ivaMonto), 0);
    const totalFinal    = usableRows.reduce((acc, x) => acc + safeNumber(x.total), 0);
    const movId         = getMovimientoId(initialData);

    const mediosPagoPayload = mediosFilas.flatMap((mp) => {
      const chequesSeleccionados = Array.isArray(mp.id_cheque) ? mp.id_cheque : [];
      const mpRow = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago));
      const tipoCheque = normalizeChequeTipoFromMedio(mpRow?.nombre || "");
      if (tipoCheque !== null && chequesSeleccionados.length > 0) {
        return chequesSeleccionados.map((idChequeStr) => {
          const ch = mp.chequesDisponibles.find((x) => String(x.id_cheque) === idChequeStr);
          return { id_medio_pago: Number(mp.id_medio_pago), monto: Number(ch?.importe || 0), id_cheque: Number(idChequeStr), cheque_tipo: tipoCheque };
        });
      }
      return [{ id_medio_pago: Number(mp.id_medio_pago), monto: safeNumber(mp.monto) }];
    });

    const primerMedio = mediosPagoPayload[0] || null;
    const medioLegacy = primerMedio && Number(primerMedio.id_medio_pago) > 0
      ? mediosPagoList.find((x) => Number(getMedioPagoId(x)) === Number(primerMedio.id_medio_pago)) : null;

    return {
      ...(movId ? { id_movimiento: movId, id_egreso: movId, id: movId } : {}),
      fecha: safeStr(fecha).slice(0, 10),
      id_medio_pago: primerMedio ? Number(primerMedio.id_medio_pago) : null,
      medio_pago_nombre: optionLabel(medioLegacy),
      medios_pago: mediosPagoPayload,
      id_clasificacion: Number(filters.id_clasificacion),
      clasificacion_nombre: isCostoFijoChecked ? clasificacionConfig.labelCostoFijo.toUpperCase() : isNoCostoFijoChecked ? clasificacionConfig.labelNoCostoFijo.toUpperCase() : "",
      detalle: detalleFinal, descripcion: detalleFinal, concepto: detalleFinal,
      cantidad:     usableRows.length === 1 ? safeNumber(usableRows[0].cantidad) : 1,
      precio:       usableRows.length === 1 ? safeNumber(usableRows[0].precio) : safeNumber(subtotalFinal),
      subtotal:     safeNumber(subtotalFinal),
      iva_monto:    safeNumber(ivaFinal),
      monto_total:  safeNumber(totalFinal),
      total:        safeNumber(totalFinal),
      total_general: safeNumber(totalFinal),
      items: usableRows.map((x, idx) => ({
        orden: idx+1, id_detalle: Number(x.id_detalle||0)||null, id_stock_producto: Number(x.id_detalle||0)||null,
        detalle: safeStr(x.detalle), descripcion: safeStr(x.detalle), concepto: safeStr(x.detalle),
        cantidad: safeNumber(x.cantidad), precio: safeNumber(x.precio),
        iva_pct: safeNumber(x.ivaPct), subtotal: safeNumber(x.subtotal), iva_monto: safeNumber(x.ivaMonto), total: safeNumber(x.total),
      })),
    };
  }, [rowsCalc, initialData, fecha, filters, mediosFilas, mediosPagoList, clasificacionConfig, isCostoFijoChecked, isNoCostoFijoChecked]);

  const subirArchivo = useCallback(async (idMovimiento, archivo) => {
    if (!archivo || !idMovimiento) return null;
    const fd = new FormData();
    fd.append("archivo", archivo); fd.append("tipo", "OTRO_EGRESO");
    fd.append("id_movimiento", String(idMovimiento)); fd.append("force_replace", "1");
    return await apiPostForm(API_UPLOAD, fd);
  }, [API_UPLOAD]);

  const submit = useCallback(async () => {
    if (saving) return;
    if (typeof onSubmit !== "function") { showToast("error", "Falta la función de guardado del modal.", 4200); return; }
    const v = validate();
    if (!v.ok) { showToast("advertencia", v.msg || "Faltan datos.", 4200); return; }
    setSaving(true);
    if (v.warn) showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    try {
      const payload = buildPayload();
      const data = await onSubmit(payload, mode === "edit");
      const idMovimientoFinal = getSavedMovimientoIdFromResponse(data, initialData);
      if (!idMovimientoFinal) throw new Error("El backend guardó el movimiento pero no devolvió un id_movimiento válido.");
      let warningArchivo = "";
      if (archivoAdjunto) {
        try { const r = await subirArchivo(idMovimientoFinal, archivoAdjunto); if (!r?.exito) warningArchivo = r?.mensaje || "No se pudo vincular el archivo."; }
        catch (e) { warningArchivo = e?.message || "No se pudo vincular el archivo."; }
      }
      if (warningArchivo) showToast("advertencia", `Egreso guardado, pero el archivo no se pudo vincular: ${warningArchivo}`, 7000);
      await onSaved?.({ ...(data || {}), id_movimiento: idMovimientoFinal });
    } catch (e) {
      showToast("error", e?.message || "No se pudo guardar el egreso.", 4500);
    } finally {
      setSaving(false);
    }
  }, [saving, onSubmit, validate, buildPayload, mode, onSaved, showToast, initialData, archivoAdjunto, subirArchivo]);

  if (!open) return null;

  const btnLabel = saving ? "Procesando..." : mode === "edit" ? "Guardar cambios" : "Guardar egreso";

  return createPortal(
    <>
      <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
        <div
          className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""].join(" ").trim()}
          role="dialog" aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true"><FontAwesomeIcon icon={faPlus} /></div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">{mode === "edit" ? "Editar Egreso" : "Nuevo Egreso"}</h2>
            </div>
            <button ref={closeBtnRef} className="mi-modal__close" onClick={() => !saving && onClose?.()} aria-label="Cerrar" disabled={saving} type="button">✕</button>
          </div>

          <div className="mi-modal__content">
            <div className="mi-cr-grid">

              {/* ── TABLA DE PRODUCTOS ── */}
              <section className="mi-cr-table">
                <div className="mi-cr-table__head" style={{ gridTemplateColumns: "2.4fr 72px 1fr 80px 1fr 1fr 36px" }}>
                  <div style={{ paddingLeft: 10 }}>Descripción</div>
                  <div>Cant.</div>
                  <div className="right">Importe</div>
                  <div>IVA %</div>
                  <div className="right">IVA $</div>
                  <div className="right">Total</div>
                  <div />
                </div>

                <div ref={rowsContainerRef} className={`mi-cr-table__rows ${hasScroll ? "has-scroll" : ""}`}>
                  {rowsCalc.map((r) => {
                    const stockNum = r.stock_disponible !== null && r.stock_disponible !== undefined ? Number(r.stock_disponible) : null;
                    const rowSinStock = r.sinStock || isSinStock(stockNum);
                    return (
                      <div key={r.id} className={`mi-cr-row ${rowSinStock ? "mi-cr-row--sin-stock" : ""}`} style={{ gridTemplateColumns: "2.4fr 72px 1fr 80px 1fr 1fr 36px" }}>
                        <div className="mi-cr-cell mi-cr-cell--detalle">
                          <GlobalAutocomplete
                            value={r.detalle}
                            onChange={(val) => updateRow(r.id, { detalle: val, id_detalle: NULL_OPTION, stock_disponible: null, sinStock: false })}
                            onSelect={(item) => handleSelectDetalle(item, r.id)}
                            options={detallesList}
                            getOptionLabel={(d) => optionLabel(d)}
                            getOptionValue={(d) => String(getDetalleId(d) ?? optionLabel(d))}
                            placeholder="Escribí o buscá una descripción…"
                            disabled={saving} showAllOnFocus={false} maxItems={18} inputClassName="nv-cell-input"
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center stock_cant">
                          <input
                            className="nv-cell-input nv-cell-input--center"
                            type="number" min={rowSinStock ? undefined : "1"} step="1"
                            value={rowSinStock ? "" : r.cantidad}
                            onChange={(e) => handleCantidadChange(r.id, e.target.value === "" ? "" : Number(e.target.value))}
                            disabled={saving || rowSinStock}
                            placeholder={rowSinStock ? "0" : ""}
                            title={rowSinStock ? "No podés ingresar cantidad porque el stock es 0" : ""}
                            style={{ width: "100%", background: rowSinStock ? "#f3f4f6" : undefined, color: rowSinStock ? "#b91c1c" : undefined, borderColor: rowSinStock ? "#fca5a5" : undefined, cursor: rowSinStock ? "not-allowed" : undefined, opacity: rowSinStock ? 0.9 : 1 }}
                          />
                          {r.stock_disponible !== null && r.stock_disponible !== undefined && (
                            <div style={{ fontSize: "10px", fontWeight: rowSinStock ? 700 : 500, color: rowSinStock ? "#b91c1c" : "#666" }}>
                              {rowSinStock ? "Sin stock" : `Stock: ${r.stock_disponible}`}
                            </div>
                          )}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <input
                            className="nv-cell-input nv-cell-input--right" type="text" inputMode="decimal"
                            value={r.precioFocused ? r.precioDraft ?? "" : formatMoneyInputARS(r.precio)}
                            onFocus={(e) => { updateRow(r.id, { precioFocused: true, precioDraft: formatEditableMoney(r.precio) }); setTimeout(() => e.target.select(), 0); }}
                            onChange={(e) => { const c = e.target.value.replace(/[^\d,.\-]/g, ""); updateRow(r.id, { precioDraft: c, precio: parseMoneyInputARS(c) }); }}
                            onBlur={() => { const p = parseMoneyInputARS(r.precioDraft); updateRow(r.id, { precio: p, precioDraft: "", precioFocused: false }); }}
                            placeholder="$ 0,00" disabled={saving} style={{ width: "100%" }}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <select
                            className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                            value={String(r.ivaPct)}
                            onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                            onKeyDown={(e) => { if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault(); }}
                            disabled={saving} style={{ width: "100%" }}
                          >
                            {IVA_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                          </select>
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">{moneyARS(r.ivaMonto)}</div>
                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">{moneyARS(r.total)}</div>
                        <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                          <button type="button" className="mi-cr-del" onClick={() => removeRow(r.id)} disabled={saving} title="Eliminar fila">×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mi-cr-table__foot">
                  <div className="mi-cr-foot-actions">
                    <button type="button" className="nv-foot-btn" onClick={addRow} disabled={saving}>
                      <span className="nv-foot-btn__icon">+</span>Agregar fila
                    </button>
                    <div className="nv-foot-sep" />
                  </div>
                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub"><span>Subtotal</span><b>{moneyARS(resumen.subtotal)}</b></div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--iva"><span>IVA</span><b>{moneyARS(resumen.iva)}</b></div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--total"><span>Total</span><b>{moneyARS(resumen.total)}</b></div>
                  </div>
                </div>
              </section>

              {/* ── PANEL LATERAL — nc-aside idéntico a ModalNuevaCompra ── */}
              <aside className="nc-aside">

                {/* ── SECCIÓN 1: DATOS DEL EGRESO ── */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot"></div>
                    <span>Datos del egreso</span>
                  </div>
                  <div className="nc-section-body">

                    {/* Fecha */}
                    <div className="nc-field" onClick={handleOpenDate}>
                      <input ref={fechaInputRef} className="nc-input" type="date" placeholder=" " value={fecha} onChange={(e) => setFecha(String(e.target.value || "").trim())} disabled={saving} />
                      <label className="nc-label" onClick={handleOpenDate}>Fecha</label>
                    </div>

                    {/* Clasificación — mismo sistema de pills que Tipo en compras */}
                    <div>
                      <div className="nc-pill-label">Clasificación *</div>
                      <div className="nc-pills">
                        <button
                          type="button"
                          className={`nc-pill ${isCostoFijoChecked ? "nc-pill--active" : ""}`}
                          onClick={() => { if (!saving) setFilters((p) => ({ ...p, id_clasificacion: clasificacionConfig.idCostoFijo })); }}
                          disabled={saving}
                        >{clasificacionConfig.labelCostoFijo}</button>
                        <button
                          type="button"
                          className={`nc-pill ${isNoCostoFijoChecked ? "nc-pill--active" : ""}`}
                          onClick={() => { if (!saving) setFilters((p) => ({ ...p, id_clasificacion: clasificacionConfig.idNoCostoFijo })); }}
                          disabled={saving}
                        >{clasificacionConfig.labelNoCostoFijo}</button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* ── SECCIÓN 2: MEDIOS DE PAGO ── */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" style={{ background: "#0f766e" }}></div>
                    <span>Medios de pago</span>
                  </div>
                  <div className="nc-section-body">

                    {mediosFilas.map((mp, idx) => (
                      <MedioPagoRow
                        key={mp.id} row={mp} idx={idx}
                        mediosPagoList={mediosPagoList}
                        totalEgreso={resumen.total}
                        sumaMediosPago={sumaMediosPago}
                        onUpdate={updateMedioPago} onRemove={removeMedioPago}
                        saving={saving} dark={dark} showToast={showToast}
                      />
                    ))}

                    {/* Totalizador medios */}
                    <div className="nc-mp-totals">
                      <span className="nc-mp-totals-asignado">Asignado: <b>{moneyARS(sumaMediosPago)}</b></span>
                      {diferenciaRestante > 0.01 && <span className="nc-mp-totals-falta">Falta: {moneyARS(diferenciaRestante)}</span>}
                      {diferenciaRestante <= 0.01 && resumen.total > 0 && <span className="nc-mp-totals-ok">✓ Cubierto</span>}
                    </div>

                    <button type="button" className="nc-add-mp-btn" onClick={addMedioPago} disabled={saving}>
                      <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro medio
                    </button>

                  </div>
                </div>

                {/* ── SECCIÓN 3: COMPROBANTE ── */}
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" style={{ background: "#64748b" }}></div>
                    <span>Comprobante adjunto</span>
                  </div>
                  <div className="nc-section-body">
                    <div className="nc-file-row">
                      <label className="nc-file-label">
                        <input type="file" style={{ display: "none" }} onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)} disabled={saving} />
                        <div className="nc-file-icon"><FontAwesomeIcon icon={faFileInvoiceDollar} style={{ fontSize: 13 }} /></div>
                        <span className={archivoAdjunto ? "nc-file-name" : "nc-file-placeholder"}>
                          {archivoAdjunto ? archivoAdjunto.name : "Seleccionar archivo…"}
                        </span>
                        {archivoAdjunto && <span className="nc-file-size">{Math.max(1, Math.round((archivoAdjunto.size || 0) / 1024))} KB</span>}
                      </label>
                      {archivoAdjunto && (
                        <button type="button" className="nc-file-del" onClick={() => setArchivoAdjunto(null)} disabled={saving} title="Quitar archivo">×</button>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── ACCIONES ── */}
                <div className="nc-actions">
                  <button type="button" className="nc-btn-guardar" onClick={submit} disabled={saving}>{btnLabel}</button>
                  <button type="button" className="nc-btn-cancelar" onClick={() => !saving && onClose?.()} disabled={saving}>Cancelar</button>
                </div>

              </aside>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}