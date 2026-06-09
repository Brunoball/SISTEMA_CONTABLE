import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filtrarMediosPagoPorPlan } from "../../_shared/planMediosPago";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import {
  faFileInvoiceDollar,
  faBasketShopping,
  faEye,
  faUpload,
  faTrash,
  faMoneyCheckDollar,
  faCircleNotch,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import ModalClienteFiscalArca from "../../../Global/Modales/ModalClienteFiscalArca.jsx";

const NULL_OPTION = "";
const NOMBRE_COMPROBANTE_GENERICO = "Comprobante adjunto";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
  { label: "27 %", value: 27 }, 
];

/* ── Helpers ── */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isBlank(v) {
  return String(v ?? "").trim() === "";
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
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}
function safeStr(v) {
  return String(v ?? "").trim();
}
function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeArcaSummary(s) {
  const x = s && typeof s === "object" ? s : {};
  return {
    cuit: safeStr(x.cuit),
    razon_social: safeStr(x.razon_social),
    condicion_iva: safeStr(x.iva || x.condicion_iva),
    domicilio: safeStr(x.domicilio),
    doc_tipo: 80,
    doc_nro: safeStr(x.cuit),
    origen: "arca_cuit",
  };
}
function normalizeProveedorFiscalDb(data) {
  const s = data && typeof data === "object" ? data : {};
  return {
    id_cliente_fiscal: Number(s.id_cliente_fiscal || 0) || null,
    id_proveedor: Number(s.id_proveedor || 0) || null,
    tipo_entidad: safeStr(s.tipo_entidad || "proveedor"),
    doc_tipo: Number(s.doc_tipo || 80) || 80,
    doc_nro: safeStr(s.doc_nro),
    cuit: safeStr(s.cuit),
    razon_social: safeStr(s.razon_social),
    condicion_iva: safeStr(s.condicion_iva || s.cond_iva),
    domicilio: safeStr(s.domicilio),
    origen: safeStr(s.origen || "manual"),
  };
}
function normalizeProveedorSimple(data) {
  const s = data && typeof data === "object" ? data : {};
  const id = getProveedorId(s) || Number(s.id_proveedor || s.id || 0) || null;
  return {
    id_proveedor: id,
    id,
    nombre: safeStr(s.nombre || s.razon_social || s.label || ""),
    activo: Number(s.activo ?? 1) === 0 ? 0 : 1,
  };
}

function isAllowedComprobanteFile(file) {
  if (!file) return false;

  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();

  const isImageMime = mime.startsWith("image/");
  const isPdfMime = mime === "application/pdf";

  const isImageExt = /\.(jpg|jpeg|png|webp|gif|bmp|svg|heic|heif)$/i.test(name);
  const isPdfExt = /\.pdf$/i.test(name);

  return isImageMime || isPdfMime || isImageExt || isPdfExt;
}

function getChequeIdsArray(value) {
  if (Array.isArray(value)) return value.map((x) => String(x)).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value)];
}

function buildEmptyMedioPago() {
  return {
    id: uid(),
    id_medio_pago: "",
    monto: 0,
    montoDraft: "",
    montoFocused: false,
    id_cheque: [],
    chequesDisponibles: [],
    loadingCheques: false,
  };
}

function ChequesCarteraCardsCompra({ cheques, idsSeleccionados, onToggle, esEcheq = false }) {
  if (!cheques.length) return null;

  const accent = esEcheq ? "#0055BB" : "#0f766e";
  const accentBg = esEcheq ? "rgba(0,85,187,.07)" : "rgba(15,118,110,.07)";
  const accentBorder = esEcheq ? "rgba(0,85,187,.28)" : "rgba(15,118,110,.28)";

  return (
    <div className="nc-cheques-list">
      {cheques.map((ch, idx) => {
        const checked = idsSeleccionados.includes(String(ch?.id_cheque));
        return (
          <div
            key={ch?.id_cheque || idx}
            role="checkbox"
            aria-checked={checked}
            tabIndex={0}
            className={`nc-cheque-item ${checked ? "nc-cheque-item--selected" : ""} ${
              esEcheq ? "nc-cheque-item--echeq" : ""
            }`}
            onClick={() => onToggle(String(ch?.id_cheque || ""))}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onToggle(String(ch?.id_cheque || ""))}
          >
            <div className="nc-cheque-check-icon nc-cheque-check-icon--corner nc-cheque-check-icon--echeq nc-cheque-check-icon--cheque"
            >
              {checked && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    fontFamily: "'Courier New', monospace",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--nv-text)",
                    letterSpacing: ".04em",
                  }}
                >
                  N°&nbsp;{safeText(ch?.numero_cheque)}
                </span>

                {esEcheq && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".07em",
                      color: accent,
                      background: accentBg,
                      border: `1px solid ${accentBorder}`,
                      borderRadius: 999,
                      padding: "1px 5px",
                      lineHeight: 1.5,
                    }}
                  >
                    eCheq
                  </span>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "2px 8px",
                  fontSize: 11,
                  color: "var(--nv-muted)",
                  lineHeight: 1.3,
                }}
              >
                <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {safeText(ch?.emisor)}
                </span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>
                  Pago:&nbsp;
                  {safeText(
                    ch?.fecha_pago
                      ? String(ch.fecha_pago).match(/^\d{4}-/)
                        ? `${String(Number(String(ch.fecha_pago).slice(8, 10))).padStart(2, "0")}/${String(
                            Number(String(ch.fecha_pago).slice(5, 7))
                          ).padStart(2, "0")}/${String(ch.fecha_pago).slice(0, 4)}`
                        : ch.fecha_pago
                      : "-"
                  )}
                </span>
              </div>
            </div>

            <span className="nc-cheque-importe">{moneyARS(ch?.importe || 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MedioPagoInlineCompraRow({
  row,
  mediosPagoList,
  onUpdate,
  onRemove,
  saving,
  showToast,
  canRemove,
  totalSeleccionado,
  sumaMediosPago,
  apiGet,
  BASE_URL,
}) {
  const mpSeleccionado = useMemo(
    () => mediosPagoList.find((x) => String(getMedioPagoId(x)) === String(row.id_medio_pago)) || null,
    [mediosPagoList, row.id_medio_pago]
  );
  const tipoCheque = useMemo(() => normalizeChequeTipoFromMedio(mpSeleccionado?.nombre || ""), [mpSeleccionado]);
  const esCheque = tipoCheque !== null;
  const esEcheq = tipoCheque === "echeq";
  const chequesSeleccionados = useMemo(() => getChequeIdsArray(row.id_cheque), [row.id_cheque]);

  const importeCheques = useMemo(() => {
    if (!esCheque || !chequesSeleccionados.length) return 0;
    return chequesSeleccionados.reduce((acc, idStr) => {
      const ch = row.chequesDisponibles.find((x) => String(x.id_cheque) === idStr);
      return acc + (ch ? Number(ch.importe || 0) : 0);
    }, 0);
  }, [esCheque, chequesSeleccionados, row.chequesDisponibles]);

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - safeNumber(row.monto));
    return Math.max(0, safeNumber(totalSeleccionado) - sumaOtros);
  }, [sumaMediosPago, totalSeleccionado, row.monto]);

  const puedeCompletarRestante = !saving && !esCheque && totalSeleccionado > 0 && restanteParaEstaFila > 0.009;

  const handleChangeMedio = useCallback(
    async (val) => {
      const mp = mediosPagoList.find((x) => String(getMedioPagoId(x)) === String(val));
      const tipo = normalizeChequeTipoFromMedio(mp?.nombre || "");
      onUpdate(row.id, {
        id_medio_pago: val,
        id_cheque: [],
        chequesDisponibles: [],
        loadingCheques: tipo !== null,
        monto: tipo !== null ? 0 : row.monto,
        montoDraft: "",
        montoFocused: false,
      });

      if (tipo !== null) {
        try {
          const sp = new URLSearchParams();
          sp.set("action", "mov_global_cheques_cartera_listar");
          sp.set("tipo", tipo);
          const data = await apiGet(`${BASE_URL}/api.php?${sp.toString()}`);
          onUpdate(row.id, {
            chequesDisponibles: Array.isArray(data?.cheques) ? data.cheques : [],
            loadingCheques: false,
          });
        } catch (e) {
          onUpdate(row.id, { chequesDisponibles: [], loadingCheques: false });
          showToast("error", e?.message || "No se pudieron cargar los cheques.", 4000);
        }
      }
    },
    [row.id, row.monto, mediosPagoList, onUpdate, showToast, apiGet, BASE_URL]
  );

  const handleToggleCheque = useCallback(
    (idChequeStr) => {
      const current = getChequeIdsArray(row.id_cheque);
      const next = current.includes(idChequeStr) ? current.filter((x) => x !== idChequeStr) : [...current, idChequeStr];
      onUpdate(row.id, { id_cheque: next });
    },
    [row.id, row.id_cheque, onUpdate]
  );

  useEffect(() => {
    if (esCheque && chequesSeleccionados.length > 0) {
      onUpdate(row.id, { monto: importeCheques, montoDraft: "", montoFocused: false });
    }
  }, [importeCheques, esCheque, chequesSeleccionados.length, onUpdate, row.id]);

  return (
    <div className="nc-mp-card">
      <div className="nc-mp-row nc-mp-row--medio">
        <div className="nc-field" style={{ position: "relative" }}>
          <select className="nc-input nc-select" value={String(row.id_medio_pago || "")} onChange={(e) => handleChangeMedio(e.target.value)} disabled={saving}>
            <option value="">Seleccionar…</option>
            {mediosPagoList.map((x) => (
              <option key={getMedioPagoId(x) || x?.nombre} value={String(getMedioPagoId(x) || "")}>
                {x.nombre}
              </option>
            ))}
          </select>
          <label className={`nc-label${row.id_medio_pago && row.id_medio_pago !== "" ? " nc-label--up" : ""}`}>
            Medio de pago
          </label>
        </div>
      </div>

      <div className="nc-mp-row nc-mp-row--monto">
        <div className="nc-field nc-mp-monto-field" style={{ position: "relative" }}>
          <input
            className="nc-input nc-mp-monto-input"
            type="text"
            inputMode="decimal"
            value={
              row.montoFocused
                ? row.montoDraft ?? ""
                : formatMoneyInputARS(esCheque ? importeCheques : row.monto)
            }
            onFocus={(e) => {
              if (saving || (esCheque && chequesSeleccionados.length > 0)) return;
              onUpdate(row.id, {
                montoFocused: true,
                montoDraft: formatEditableMoney(esCheque ? importeCheques : row.monto),
              });
              setTimeout(() => e.target.select(), 0);
            }}
            onChange={(e) => {
              if (saving || (esCheque && chequesSeleccionados.length > 0)) return;
              const c = e.target.value.replace(/[^\d,.\-]/g, "");
              onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) });
            }}
            onBlur={() => {
              if (saving || (esCheque && chequesSeleccionados.length > 0)) return;
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false });
            }}
            onKeyDown={(e) => {
              if (saving || (esCheque && chequesSeleccionados.length > 0)) return;
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="$ 0,00"
            disabled={saving || (esCheque && chequesSeleccionados.length > 0)}
            style={{
              background: esCheque && chequesSeleccionados.length > 0 ? "rgba(0,0,0,.03)" : undefined,
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
              onClick={() => onUpdate(row.id, { monto: restanteParaEstaFila, montoDraft: "", montoFocused: false })}
              disabled={!puedeCompletarRestante}
              title="Completar importe restante"
            >
              ↓ Rest.
            </button>
          )}
          {canRemove && (
            <button type="button" className="nc-mp-del-btn" onClick={() => onRemove(row.id)} disabled={saving} title="Quitar medio de pago">
              ×
            </button>
          )}
        </div>
      </div>

      {esCheque && (
        <div className="nc-mp-cheques">
          <div className="nc-mp-cheques-title">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 11 }} />
            {esEcheq ? "eCheqs en cartera" : "Cheques en cartera"}
          </div>
          {row.loadingCheques ? (
            <div className="nc-mp-cheques-loading">
              <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
              Cargando…
            </div>
          ) : row.chequesDisponibles.length === 0 ? (
            <div className="nc-mp-cheques-empty">No hay {esEcheq ? "eCheqs" : "cheques"} activos en cartera.</div>
          ) : (
            <ChequesCarteraCardsCompra
              cheques={row.chequesDisponibles}
              idsSeleccionados={chequesSeleccionados}
              onToggle={handleToggleCheque}
              esEcheq={esEcheq}
            />
          )}
          {chequesSeleccionados.length > 0 && <div className="mi-uploadCard__sub">✓ {chequesSeleccionados.length} cheque(s) — {moneyARS(importeCheques)}</div>}
        </div>
      )}
    </div>
  );
}

function PanelMediosPagoCompraLocal({
  mediosFilas,
  mediosPagoList,
  totalCompra,
  onUpdate,
  onRemove,
  onAdd,
  apiGet,
  BASE_URL,
  showToast,
  saving,
}) {
  const sumaMediosPago = useMemo(
    () => (Array.isArray(mediosFilas) ? mediosFilas : []).reduce((acc, mp) => acc + safeNumber(mp?.monto), 0),
    [mediosFilas]
  );

  const diferenciaRestante = Math.max(0, safeNumber(totalCompra) - safeNumber(sumaMediosPago));

  return (
    <>
      {(Array.isArray(mediosFilas) ? mediosFilas : []).map((mp) => (
        <MedioPagoInlineCompraRow
          key={mp.id}
          row={mp}
          mediosPagoList={mediosPagoList}
          onUpdate={onUpdate}
          onRemove={onRemove}
          saving={saving}
          showToast={showToast}
          canRemove={mediosFilas.length > 1}
          totalSeleccionado={totalCompra}
          sumaMediosPago={sumaMediosPago}
          apiGet={apiGet}
          BASE_URL={BASE_URL}
        />
      ))}

      <div className="nc-mp-totals">
        <span className="nc-mp-totals-asignado">
          Asignado: <b>{moneyARS(sumaMediosPago)}</b>
        </span>
        {diferenciaRestante > 0.01 && (
          <span className="nc-mp-totals-falta">Falta: {moneyARS(diferenciaRestante)}</span>
        )}
        {diferenciaRestante <= 0.01 && safeNumber(totalCompra) > 0 && (
          <span className="nc-mp-totals-ok">✓ Cubierto</span>
        )}
      </div>

      <button type="button" className="nc-pago-btn" onClick={onAdd} disabled={saving}>
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro medio
      </button>
    </>
  );
}

function getDetalleId(d) {
  const c = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getProveedorId(p) {
  const c = p?.id ?? p?.id_proveedor ?? p?.idProveedor ?? p?.proveedor_id ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getMedioPagoId(mp) {
  const c = mp?.id ?? mp?.id_medio_pago ?? mp?.medio_pago_id ?? mp?.idMedioPago ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getStockDisponible(detalle) {
  const c =
    detalle?.stock ??
    detalle?.stock_disponible ??
    detalle?.stockDisponible ??
    detalle?.cantidad_stock ??
    detalle?.cantidad ??
    null;
  if (c === null || c === undefined || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}
function buildEmptyRow() {
  return {
    id: uid(),
    id_detalle: NULL_OPTION,
    detalleText: "",
    cantidad: 1,
    precio: 0,
    precioDraft: "",
    precioFocused: false,
    ivaPct: 0,
    stock_disponible: null,
    sinStock: false,
  };
}
function describeLineProblem(r, idx1based) {
  const detId = Number(r.id_detalle);
  const detTxt = String(r.detalleText || "").trim();
  const qtyBlank = isBlank(r.cantidad);
  const priceBlank = isBlank(r.precio);
  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);

  const touched =
    detTxt !== "" ||
    String(r.id_detalle || "").trim() !== "" ||
    !qtyBlank ||
    !priceBlank ||
    safeNumber(r.cantidad) !== 0 ||
    safeNumber(r.precio) !== 0;

  if (!touched) return null;

  const issues = [];
  if (!(Number.isFinite(detId) && detId > 0)) issues.push(detTxt ? `el detalle "${detTxt}" no está seleccionado` : "falta el detalle");
  if (qtyBlank) issues.push("falta la cantidad");
  else if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser > 0");
  if (priceBlank) issues.push("falta el precio");
  else if (!(Number.isFinite(price) && price > 0)) issues.push("el precio debe ser > 0");
  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0");
  if (!issues.length) return null;

  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

const SAFE_LISTS = { proveedores: [], detalles: [], medios_pago: [] };
const ADD_PROVEEDOR_OPTION = {
  __action: "add_proveedor",
  id: "__add_proveedor__",
  id_proveedor: "__add_proveedor__",
  nombre: "➕ Agregar proveedor por CUIT",
};

function isAddProveedorOption(option) {
  return option?.__action === "add_proveedor";
}

function resolveProveedorByInput(proveedores, inputValue) {
  const q = normalizeText(inputValue);
  if (!q) return null;

  const arr = Array.isArray(proveedores) ? proveedores : [];
  const wm = arr
    .map((p) => ({
      raw: p,
      id: getProveedorId(p),
      nombreNorm: normalizeText(p?.nombre),
    }))
    .filter((x) => x.id && x.nombreNorm);

  if (!wm.length) return null;

  const exact = wm.find((x) => x.nombreNorm === q);
  if (exact) return exact.raw;

  const starts = wm.filter((x) => x.nombreNorm.startsWith(q));
  if (starts.length === 1) return starts[0].raw;

  return null;
}

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);
  const mediosPago = pick("medios_pago").length
    ? pick("medios_pago")
    : pick("mediosPago").length
    ? pick("mediosPago")
    : pick("medios").length
    ? pick("medios")
    : pick("medios_de_pago");

  return {
    proveedores: pick("proveedores"),
    detalles: pick("detalles"),
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
  };
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

/* ── Auth ── */
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";

  const token = localStorage.getItem("token") || "";

  let idUsuario = 0;
  let idUsuarioMaster = 0;

  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const candMaster = u?.idUsuarioMaster ?? u?.id_usuario_master ?? 0;
    const candUser = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? candMaster ?? 0;

    if (Number.isFinite(Number(candMaster)) && Number(candMaster) > 0) idUsuarioMaster = Number(candMaster);
    if (Number.isFinite(Number(candUser)) && Number(candUser) > 0) idUsuario = Number(candUser);
    if (!idUsuario && idUsuarioMaster) idUsuario = idUsuarioMaster;
    if (!idUsuarioMaster && idUsuario) idUsuarioMaster = idUsuario;
  } catch {}

  return { token, sessionKey, idUsuario, idUsuarioMaster };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Respuesta inválida. HTTP ${res.status}`);
  }
}

function buildAuthHeaders(isJson = true) {
  const { token, sessionKey } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: buildAuthHeaders(false) });
  return await parseJsonOrThrow(res);
}
async function apiPostJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(true),
    body: JSON.stringify(payload ?? {}),
  });
  return await parseJsonOrThrow(res);
}
async function apiPostForm(url, fd) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(false),
    body: fd,
  });
  return await parseJsonOrThrow(res);
}

/* ── AddCatalogMiniModal ── */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onSave?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onCancel, onSave]);

  if (!open) return null;

  return createPortal(
    <div className="mi-mini__overlay">
      <div className="mi-mini__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{title}</h4>
          <button type="button" className="mi-mini__close" onClick={onCancel} disabled={saving} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="mi-mini__body">
          <div className="fl-field">
            <input
              ref={inputRef}
              className="fl-input"
              placeholder=" "
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
            <label className="fl-label">Nombre</label>
          </div>

          <div className="mi-mini__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ============================================================
   MODAL PRINCIPAL
============================================================ */
export default function ModalNuevaCompra({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH = `${BASE_URL}/api.php?action=compras_crear_batch`;
  const API_UPLOAD_LINK = `${BASE_URL}/api.php?action=compras_comprobantes_vincular_movimientos_lote_upload`;
  const API_PADRON_CUIT = `${BASE_URL}/api.php?action=padron_cuit&op=padron_cuit`;
  const API_SAVE_PROVEEDOR_DESDE_ARCA = `${BASE_URL}/api.php?action=proveedor_fiscal_crear_desde_arca`;

  const showToast = useCallback((tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur), [onToast]);

  useEffect(() => {
    if (!open) return;
    const p = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = p;
    };
  }, [open]);

  const [localLists, setLocalLists] = useState(() => ({ ...SAFE_LISTS, ...normalizeLists(lists) }));
  useEffect(() => setLocalLists({ ...SAFE_LISTS, ...normalizeLists(lists) }), [lists]);

  const mediosPagoList = useMemo(
    () => filtrarMediosPagoPorPlan(Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );
  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );
  const proveedoresList = useMemo(
    () => (Array.isArray(localLists.proveedores) ? localLists.proveedores : []),
    [localLists.proveedores]
  );
  const proveedoresOptions = useMemo(() => [ADD_PROVEEDOR_OPTION, ...proveedoresList], [proveedoresList]);

  const [fecha, setFecha] = useState(todayISO);
  const [forma, setForma] = useState(NULL_OPTION);
  const [idProveedor, setIdProveedor] = useState(NULL_OPTION);
  const [provInput, setProvInput] = useState("");
  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [saving, setSaving] = useState(false);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  const [addUI, setAddUI] = useState({
    open: false,
    kind: null,
    rowId: null,
    text: "",
    cuit: "",
    fiscalData: null,
    fiscalError: "",
    lookupLoading: false,
    saving: false,
  });
  const [mediosFilas, setMediosFilas] = useState(() => [buildEmptyMedioPago()]);

  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);
  const fechaInputRef = useRef(null);
  const rowsContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const [openVerComp, setOpenVerComp] = useState(false);
  const [compUrl, setCompUrl] = useState("");
  const [hasScroll, setHasScroll] = useState(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;

    if (!wasOpen && open) {
      setFecha(todayISO());
      setForma(NULL_OPTION);
      setIdProveedor(NULL_OPTION);
      setProvInput("");
      setRows([buildEmptyRow()]);
      setMediosFilas([buildEmptyMedioPago()]);
      setAddUI({
        open: false,
        kind: null,
        rowId: null,
        text: "",
        cuit: "",
        fiscalData: null,
        fiscalError: "",
        lookupLoading: false,
        saving: false,
      });
      setSaving(false);
      setArchivoAdjunto(null);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;

    const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
    check();

    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [open, rows]);

  const isContado = String(forma) === "CONTADO";
  const isCorriente = String(forma) === "CUENTA_CORRIENTE";

  useEffect(() => {
    if (isCorriente) {
      setMediosFilas([buildEmptyMedioPago()]);
    }
  }, [isCorriente]);

  const addRow = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback((id) => {
    setRows((p) => {
      const n = p.filter((r) => r.id !== id);
      return n.length ? n : p;
    });
  }, []);
  const updateRow = useCallback((id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))), []);

  const addMedioPago = useCallback(() => setMediosFilas((p) => [...p, buildEmptyMedioPago()]), []);
  const removeMedioPago = useCallback((id) => {
    setMediosFilas((prev) => {
      const n = prev.filter((r) => r.id !== id);
      return n.length ? n : [buildEmptyMedioPago()];
    });
  }, []);
  const updateMedioPago = useCallback(
    (id, patch) => setMediosFilas((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );

  const handleProveedorInputChange = useCallback((val) => {
    setProvInput(val);
    setIdProveedor(NULL_OPTION);
  }, []);

  const startAddProveedor = useCallback(() => {
    if (saving) return;
    setAddUI({
      open: true,
      kind: "proveedores",
      rowId: null,
      text: provInput || "",
      cuit: "",
      fiscalData: null,
      fiscalError: "",
      lookupLoading: false,
      saving: false,
    });
  }, [saving, provInput]);

  const registrarProveedorLocal = useCallback((proveedorRaw, fiscalRaw = null) => {
    const proveedor = normalizeProveedorSimple(proveedorRaw);
    if (!proveedor.id_proveedor) return proveedor;

    setLocalLists((prev) => {
      const arr = Array.isArray(prev.proveedores) ? prev.proveedores.slice() : [];
      const idx = arr.findIndex((x) => Number(getProveedorId(x)) === Number(proveedor.id_proveedor));
      const item = {
        id: Number(proveedor.id_proveedor),
        id_proveedor: Number(proveedor.id_proveedor),
        nombre: proveedor.nombre,
        activo: proveedor.activo,
      };
      if (idx >= 0) arr[idx] = { ...arr[idx], ...item };
      else arr.push(item);
      return { ...prev, proveedores: arr };
    });

    setIdProveedor(String(proveedor.id_proveedor));
    setProvInput(proveedor.nombre || "");

    return { proveedor, fiscal: fiscalRaw ? normalizeProveedorFiscalDb(fiscalRaw) : null };
  }, []);

  const consultarArcaAddProveedor = useCallback(async () => {
    const cuit = onlyDigits(addUI.cuit);
    if (cuit.length !== 11) {
      setAddUI((p) => ({ ...p, fiscalError: "Ingresá un CUIT válido de 11 dígitos." }));
      return null;
    }

    setAddUI((p) => ({ ...p, lookupLoading: true, fiscalError: "", fiscalData: null }));
    try {
      const data = await apiGet(`${API_PADRON_CUIT}&cuit=${cuit}`);
      const summary = data?.data?.summary ?? data?.summary ?? null;
      if (!summary) throw new Error("ARCA no devolvió datos para ese CUIT.");
      const fiscal = normalizeArcaSummary(summary);
      if (!fiscal.cuit || !fiscal.razon_social) throw new Error("ARCA devolvió datos incompletos.");

      setAddUI((p) => ({
        ...p,
        lookupLoading: false,
        fiscalData: fiscal,
        fiscalError: "",
        text: fiscal.razon_social || p.text,
      }));
      return fiscal;
    } catch (e) {
      setAddUI((p) => ({
        ...p,
        lookupLoading: false,
        fiscalData: null,
        fiscalError: e?.message || "No se pudo consultar ARCA.",
      }));
      return null;
    }
  }, [API_PADRON_CUIT, addUI.cuit]);

  const guardarProveedorDesdeArcaEnModal = useCallback(async (fiscalSource) => {
    const fiscal = normalizeProveedorFiscalDb(fiscalSource || {});
    if (!fiscal.cuit || !fiscal.razon_social) {
      throw new Error("Primero consultá un CUIT válido en ARCA.");
    }

    const { idUsuario, idUsuarioMaster } = getAuthInfo();
    const saved = await apiPostJson(API_SAVE_PROVEEDOR_DESDE_ARCA, {
      idUsuario,
      idUsuarioMaster,
      tipo_entidad: "proveedor",
      id_proveedor: null,
      doc_tipo: Number(fiscal.doc_tipo || 80),
      doc_nro: fiscal.doc_nro || fiscal.cuit,
      cuit: fiscal.cuit,
      razon_social: fiscal.razon_social,
      condicion_iva: fiscal.condicion_iva,
      domicilio: fiscal.domicilio,
      origen: fiscal.origen || "arca_cuit",
      actualizar_nombre_proveedor: 1,
      activo: 1,
    });

    if (!saved?.exito || !saved?.proveedor || !saved?.cliente_fiscal) {
      throw new Error(saved?.mensaje || "No se pudo guardar el proveedor fiscal.");
    }

    const result = registrarProveedorLocal(saved.proveedor, saved.cliente_fiscal);
    return {
      proveedor: result.proveedor,
      proveedor_fiscal: result.fiscal,
      ya_existia: !!saved?.ya_existia,
      sin_cambios: !!saved?.sin_cambios,
      mensaje: saved?.mensaje || "",
    };
  }, [API_SAVE_PROVEEDOR_DESDE_ARCA, registrarProveedorLocal]);

  const handleSelectProveedor = useCallback((prov) => {
    if (isAddProveedorOption(prov)) {
      startAddProveedor();
      return;
    }

    setProvInput(String(prov?.nombre ?? "").trim());
    setIdProveedor(getProveedorId(prov) != null ? String(getProveedorId(prov)) : NULL_OPTION);
  }, [startAddProveedor]);

  useEffect(() => {
    if (!open) return;

    const h = (e) => {
      if (e.key !== "Escape") return;
      if (openVerComp || addUI.open) return;

      e.preventDefault();
      e.stopPropagation();

      onClose?.();
    };

    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, onClose, openVerComp, addUI.open]);

  const handleSelectDetalle = useCallback(
    (detalle, rowId) => {
      const stockDisponible = getStockDisponible(detalle);

      updateRow(rowId, {
        id_detalle: String(getDetalleId(detalle) || ""),
        detalleText: detalle?.nombre || "",
        // En compras el precio unitario y la cantidad los define esta compra al proveedor.
        // No se autocompleta precio desde el producto ni se limita por el stock actual.
        stock_disponible: stockDisponible,
        sinStock: false,
        cantidad: 1,
        precio: 0,
        precioDraft: "",
        precioFocused: false,
      });
    },
    [updateRow]
  );

  const handleCantidadChange = useCallback(
    (rowId, newCantidad) => {
      let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);

      if (typeof cantidadFinal === "number" && cantidadFinal < 0) {
        cantidadFinal = 0;
      }

      // En compras no se valida contra el stock disponible: la compra suma stock.
      updateRow(rowId, { cantidad: cantidadFinal });
    },
    [updateRow]
  );

  const resetAddUIState = useCallback(() => {
    setAddUI({
      open: false,
      kind: null,
      rowId: null,
      text: "",
      cuit: "",
      fiscalData: null,
      fiscalError: "",
      lookupLoading: false,
      saving: false,
    });
  }, []);

  const closeAddMini = useCallback(() => {
    if (addUI.saving || addUI.lookupLoading) return;
    resetAddUIState();
  }, [addUI.saving, addUI.lookupLoading, resetAddUIState]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const kind = addUI.kind;
    if (!kind) return;

    if (kind === "proveedores") {
      const cuit = onlyDigits(addUI.cuit);
      if (cuit.length !== 11) {
        const msg = "Ingresá un CUIT válido de 11 dígitos, presioná Consultar ARCA y después confirmá.";
        setAddUI((p) => ({ ...p, fiscalError: msg }));
        showToast("advertencia", msg, 3600);
        return;
      }

      setAddUI((p) => ({ ...p, saving: true, fiscalError: "" }));
      showToast("cargando", "Consultando ARCA y creando proveedor…", 12000);

      try {
        let fiscal = addUI.fiscalData;
        if (!fiscal || onlyDigits(fiscal.cuit) !== cuit) {
          const data = await apiGet(`${API_PADRON_CUIT}&cuit=${cuit}`);
          const summary = data?.data?.summary ?? data?.summary ?? null;
          if (!summary) throw new Error("ARCA no devolvió datos para ese CUIT.");
          fiscal = normalizeArcaSummary(summary);
        }

        const result = await guardarProveedorDesdeArcaEnModal(fiscal);
        resetAddUIState();
        if (result?.ya_existia) {
          showToast(
            "exito",
            `El proveedor ya existía. Se seleccionó "${result?.proveedor?.nombre || fiscal.razon_social}" sin duplicarlo.`,
            3600
          );
        } else {
          showToast("exito", `Proveedor fiscal creado: "${result?.proveedor?.nombre || fiscal.razon_social}"`, 3200);
        }
        return;
      } catch (e) {
        setAddUI((p) => ({ ...p, saving: false, fiscalError: e?.message || "No se pudo guardar el proveedor desde ARCA." }));
        showToast("error", e?.message || "No se pudo guardar el proveedor desde ARCA.", 5200);
        return;
      }
    }

    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${kind === "detalles" ? "detalle" : "proveedor"}…`, 12000);

    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(`${BASE_URL}/api.php?action=catalogo_crear`, {
        catalogo: kind,
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear.");

      const item = data?.item ?? {};
      const newId = kind === "detalles" ? getDetalleId(item) ?? Number(item?.id) : getProveedorId(item) ?? Number(item?.id);
      const newNombre = String(item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(Number(newId)) || Number(newId) <= 0) {
        throw new Error("El servidor no devolvió un ID válido.");
      }

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[kind]) ? prev[kind].slice() : [];
        const already = arr.some((x) => {
          const xid = kind === "detalles" ? getDetalleId(x) : getProveedorId(x);
          return Number(xid) === Number(newId);
        });

        if (!already) arr.push({ id: Number(newId), nombre: newNombre });
        next[kind] = arr;
        return next;
      });

      if (kind === "proveedores") {
        setIdProveedor(String(newId));
        setProvInput(newNombre);
      }

      resetAddUIState();
      showToast("exito", `${kind === "detalles" ? "Detalle" : "Proveedor"} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.", 4200);
    }
  }, [
    addUI,
    API_PADRON_CUIT,
    guardarProveedorDesdeArcaEnModal,
    resetAddUIState,
    showToast,
  ]);

  const proveedorResolvedFromInput = useMemo(
    () => resolveProveedorByInput(proveedoresList, provInput),
    [proveedoresList, provInput]
  );

  const selectedProveedorId = useMemo(() => {
    const d = Number(idProveedor);
    if (Number.isFinite(d) && d > 0) return d;
    return getProveedorId(proveedorResolvedFromInput) ?? 0;
  }, [idProveedor, proveedorResolvedFromInput]);

  useEffect(() => {
    if (!open) return;
    const direct = Number(idProveedor);
    const fallbackId = getProveedorId(proveedorResolvedFromInput);
    if ((!Number.isFinite(direct) || direct <= 0) && fallbackId) {
      setIdProveedor(String(fallbackId));
    }
  }, [open, idProveedor, proveedorResolvedFromInput]);

  const rowsCalc = useMemo(
    () =>
      rows.map((r) => {
        const cantidad = Math.max(0, safeNumber(r.cantidad));
        const precio = Math.max(0, safeNumber(r.precio));
        const ivaPct = Math.max(0, safeNumber(r.ivaPct));
        const subtotal = cantidad * precio;
        const ivaMonto = subtotal * (ivaPct / 100);
        const total = subtotal + ivaMonto;
        return { ...r, subtotal, ivaMonto, total };
      }),
    [rows]
  );

  const resumen = useMemo(
    () => ({
      subtotal: rowsCalc.reduce((a, r) => a + (r.subtotal || 0), 0),
      iva: rowsCalc.reduce((a, r) => a + (r.ivaMonto || 0), 0),
      total: rowsCalc.reduce((a, r) => a + (r.total || 0), 0),
    }),
    [rowsCalc]
  );

  const sumaMediosPago = useMemo(() => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0), [mediosFilas]);

  const validate = useCallback(() => {
    const provId = Number(selectedProveedorId);
    if (!(Number.isFinite(provId) && provId > 0)) {
      return { ok: false, msg: "Falta seleccionar un Proveedor válido de la lista." };
    }

    if (!["CONTADO", "CUENTA_CORRIENTE"].includes(String(forma))) {
      return { ok: false, msg: "Falta seleccionar el Tipo de compra (Contado / Cuenta Corriente)." };
    }

    // ⭐ VALIDACIÓN DE FECHA ⭐
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return {
        ok: false,
        msg: "La fecha es inválida.",
      };
    }

    if (fecha > todayISO()) {
      return {
        ok: false,
        msg: "La fecha no puede ser posterior al día actual.",
      };
    }

    if (isContado) {
      for (let i = 0; i < mediosFilas.length; i++) {
        const mp = mediosFilas[i];

        if (!mp.id_medio_pago || mp.id_medio_pago === NULL_OPTION) {
          return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
        }

        if (safeNumber(mp.monto) <= 0) {
          return { ok: false, msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.` };
        }

        const mpRow = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago));
        const tipoCheque = normalizeChequeTipoFromMedio(mpRow?.nombre || "");

        if (tipoCheque !== null) {
          const sel = Array.isArray(mp.id_cheque) ? mp.id_cheque : mp.id_cheque ? [String(mp.id_cheque)] : [];
          if (!sel.length) {
            return {
              ok: false,
              msg: `Medio de pago ${i + 1}: debés seleccionar al menos un ${
                tipoCheque === "echeq" ? "eCheq" : "cheque"
              } en cartera.`,
            };
          }
        }
      }

      if (sumaMediosPago < resumen.total - 0.05 && resumen.total > 0) {
        return {
          ok: false,
          msg: `La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total de la compra (${moneyARS(
            resumen.total
          )}).`,
        };
      }
    }

    const problems = [];
    rowsCalc.forEach((r, i) => {
      const p = describeLineProblem(r, i + 1);
      if (p) problems.push(p);
    });

    const usable = rowsCalc.filter(
      (r) => Number.isFinite(Number(r.id_detalle)) && Number(r.id_detalle) > 0 && Number(r.total || 0) > 0
    );

    if (!usable.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return { ok: false, msg: "Cargá al menos 1 fila válida (Detalle + Cantidad + Precio)." };
    }

    if (problems.length) {
      const msg = problems.slice(0, 2).join(" ");
      const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
      return {
        ok: false,
        msg: `Completá o eliminá las filas incompletas antes de guardar. ${msg}${extra}`,
      };
    }

    return { ok: true };
  }, [selectedProveedorId, forma, fecha, isContado, mediosFilas, mediosPagoList, rowsCalc, resumen.total, sumaMediosPago]);

  const subirYVincularArchivo = useCallback(
    async (idsMovimientos, archivo) => {
      if (!archivo || !idsMovimientos?.length) return null;
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", "FACTURA");
      fd.append("force", "0");
      fd.append("ids_movimiento", JSON.stringify(idsMovimientos));
      return await apiPostForm(API_UPLOAD_LINK, fd);
    },
    [API_UPLOAD_LINK]
  );

  const handleOpenFilePicker = useCallback(() => {
    if (saving) return;
    fileInputRef.current?.click();
  }, [saving]);

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0] || null;

    if (!file) {
      setArchivoAdjunto(null);
      setOpenVerComp(false);
      if (compUrl) URL.revokeObjectURL(compUrl);
      setCompUrl("");
      return;
    }

    if (!isAllowedComprobanteFile(file)) {
      showToast(
        "advertencia",
        "Archivo inválido. Solo se permiten imágenes o archivos PDF.",
        4200
      );

      setArchivoAdjunto(null);
      setOpenVerComp(false);
      if (compUrl) URL.revokeObjectURL(compUrl);
      setCompUrl("");

      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setArchivoAdjunto(file);
    setOpenVerComp(false);
    if (compUrl) URL.revokeObjectURL(compUrl);
    setCompUrl("");
  }, [compUrl, showToast]);

  const handleOpenVerComprobante = useCallback(() => {
    if (!archivoAdjunto) return;
    const url = URL.createObjectURL(archivoAdjunto);
    setCompUrl(url);
    setOpenVerComp(true);
  }, [archivoAdjunto]);

  const handleCloseVerComprobante = useCallback(() => {
    setOpenVerComp(false);
    if (compUrl) URL.revokeObjectURL(compUrl);
    setCompUrl("");
  }, [compUrl]);

  useEffect(() => {
    return () => {
      if (compUrl) URL.revokeObjectURL(compUrl);
    };
  }, [compUrl]);

  const submit = useCallback(async () => {
    if (saving) return;

    const { sessionKey, token, idUsuario, idUsuarioMaster } = getAuthInfo();
    if (!sessionKey && !token) {
      showToast("error", "No hay sesión activa.", 5200);
      return;
    }

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.", 3200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }

    setSaving(true);

    try {
      const idTipoVenta = isCorriente ? 2 : 1;
      const accionFinal = isCorriente ? "guardar" : "pagar";
      const esPagadaFinal = !isCorriente;
      const proveedorIdFinal = Number(selectedProveedorId) > 0 ? Number(selectedProveedorId) : null;

      const mediosPagoPayload = isContado
        ? mediosFilas.flatMap((mp) => {
            const chequesSeleccionados = Array.isArray(mp.id_cheque)
              ? mp.id_cheque
              : mp.id_cheque
              ? [String(mp.id_cheque)]
              : [];

            const mpRow = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago));
            const tipoCheque = normalizeChequeTipoFromMedio(mpRow?.nombre || "");

            if (tipoCheque !== null && chequesSeleccionados.length > 0) {
              return chequesSeleccionados.map((idChequeStr) => {
                const ch = mp.chequesDisponibles?.find((x) => String(x.id_cheque) === String(idChequeStr));
                return {
                  id_medio_pago: Number(mp.id_medio_pago),
                  monto: Number(ch?.importe || 0),
                  id_cheque: Number(idChequeStr),
                };
              });
            }

            return [
              {
                id_medio_pago: Number(mp.id_medio_pago),
                monto: safeNumber(mp.monto),
              },
            ];
          })
        : [];

      const payloads = rowsCalc
        .filter((r) => Number.isFinite(Number(r.id_detalle)) && Number(r.id_detalle) > 0 && Number(r.total || 0) > 0)
        .map((r) => ({
          idUsuario,
          idUsuarioMaster,
          fecha,
          id_tipo_venta: idTipoVenta,
          id_proveedor: proveedorIdFinal,
          proveedor_nombre: String(provInput || "").trim() || null,
          id_detalle: Number(r.id_detalle),
          id_stock_producto: Number(r.id_detalle),
          cantidad: Math.round(Number(r.cantidad) * 100) / 100,
          precio: Math.round(Number(r.precio) * 100) / 100,
          iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
          subtotal: Math.round(Number(r.subtotal) * 100) / 100,
          iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
          total: Math.round(Number(r.total) * 100) / 100,
          monto_total: Math.round(Number(r.total) * 100) / 100,
          accion_compra: accionFinal,
          es_pagada: esPagadaFinal,
        }));

      if (!payloads.length) {
        showToast("advertencia", "No hay filas válidas para guardar.", 4200);
        setSaving(false);
        return;
      }

      const data = await apiPostJson(API_BATCH, {
        idUsuario,
        idUsuarioMaster,
        items: payloads,
        medios_pago: mediosPagoPayload,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar el batch de compras.");

      const idsCreados = Array.isArray(data?.ids)
        ? data.ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
        : [];

      let warningArchivo = "";

      if (archivoAdjunto && !isAllowedComprobanteFile(archivoAdjunto)) {
        throw new Error("Archivo inválido. Solo se permiten imágenes o archivos PDF.");
      }

      if (archivoAdjunto && idsCreados.length > 0) {
        try {
          const rFile = await subirYVincularArchivo(idsCreados, archivoAdjunto);
          if (!rFile?.exito) warningArchivo = rFile?.mensaje || "No se pudo vincular el archivo.";
        } catch (e) {
          warningArchivo = e?.message || "No se pudo vincular el archivo.";
        }
      }

      if (warningArchivo) {
        showToast("advertencia", `Compra guardada, pero el archivo no se pudo vincular: ${warningArchivo}`, 7000);
      } else {
        showToast("exito", "Compra agregada correctamente.", 3000);
      }

      await Promise.resolve(onSaved?.(data));
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
      setSaving(false);
    }
  }, [
    saving,
    addUI.open,
    validate,
    showToast,
    isCorriente,
    isContado,
    rowsCalc,
    fecha,
    selectedProveedorId,
    provInput,
    mediosFilas,
    mediosPagoList,
    API_BATCH,
    onSaved,
    onClose,
    archivoAdjunto,
    subirYVincularArchivo,
  ]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="mi-modal__overlay">
        <div
          className="mi-modal__container mi-modal__container--mov"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faBasketShopping} />
            </div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Nueva Compra</h2>
            </div>
            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !saving && onClose?.()}
              aria-label="Cerrar"
              disabled={saving}
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="mi-modal__content">
            <div className="mi-cr-grid">
              <section className="mi-cr-table">
                <div className="mi-cr-table__head">
                  <div style={{ paddingLeft: 10 }}>Detalle</div>
                  <div>Cant.</div>
                  <div className="right">Precio</div>
                  <div>IVA %</div>
                  <div className="right">IVA $</div>
                  <div className="right">Total</div>
                  <div />
                </div>

                <div ref={rowsContainerRef} className={`mi-cr-table__rows${hasScroll ? " has-scroll" : ""}`}>
                  {rowsCalc.map((r) => {
                    return (
                      <div key={r.id} className="mi-cr-row">
                        <div className="mi-cr-cell mi-cr-cell--detalle">
                          <GlobalAutocomplete
                            value={r.detalleText}
                            onChange={(val) =>
                              updateRow(r.id, {
                                detalleText: val,
                                id_detalle: NULL_OPTION,
                                stock_disponible: null,
                                sinStock: false,
                              })
                            }
                            onSelect={(d) => handleSelectDetalle(d, r.id)}
                            options={detallesList}
                            getOptionLabel={(d) => String(d?.nombre ?? "").trim()}
                            getOptionValue={(d) => String(getDetalleId(d) ?? d?.nombre ?? "")}
                            placeholder="Escribí o buscá un detalle…"
                            disabled={saving || addUI.open}
                            showAllOnFocus={false}
                            maxItems={18}
                            inputClassName="nv-cell-input"
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center stock_cant">
                          <input
                            className="nv-cell-input nv-cell-input--center"
                            type="number"
                            min="0"
                            step="1"
                            value={r.cantidad}
                            onChange={(e) =>
                              handleCantidadChange(r.id, e.target.value === "" ? "" : Number(e.target.value))
                            }
                            disabled={saving}
                            placeholder=""
                            title="En compras podés ingresar cualquier cantidad; no se limita por el stock actual."
                            style={{ width: "100%" }}
                          />
                          {r.stock_disponible !== null && r.stock_disponible !== undefined && (
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 500,
                                color: "#666",
                              }}
                            >
                              {`Stock: ${r.stock_disponible}`}
                            </div>
                          )}
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <input
                            className="nv-cell-input nv-cell-input--right"
                            type="text"
                            inputMode="decimal"
                            value={r.precioFocused ? r.precioDraft ?? "" : formatMoneyInputARS(r.precio)}
                            onFocus={(e) => {
                              if (saving) return;
                              updateRow(r.id, {
                                precioFocused: true,
                                precioDraft: formatEditableMoney(r.precio),
                              });
                              setTimeout(() => e.target.select(), 0);
                            }}
                            onChange={(e) => {
                              if (saving) return;
                              const limpio = e.target.value.replace(/[^\d,.\-]/g, "");
                              updateRow(r.id, { precioDraft: limpio, precio: parseMoneyInputARS(limpio) });
                            }}
                            onBlur={() => {
                              if (saving) return;
                              const precioFinal = parseMoneyInputARS(r.precioDraft);
                              updateRow(r.id, {
                                precio: precioFinal,
                                precioDraft: "",
                                precioFocused: false,
                              });
                            }}
                            onKeyDown={(e) => {
                              if (saving) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={saving}
                            placeholder="$ 0,00"
                            style={{ width: "100%" }}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <select
                            className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                            value={String(r.ivaPct)}
                            onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                            onKeyDown={(e) => {
                              if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                            disabled={saving}
                            style={{ width: "100%" }}
                          >
                            {IVA_OPTIONS.map((x) => (
                              <option key={x.value} value={x.value}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                          {moneyARS(r.ivaMonto)}
                        </div>
                        <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                          {moneyARS(r.total)}
                        </div>
                        <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                          <button
                            type="button"
                            className="mi-cr-del"
                            onClick={() => removeRow(r.id)}
                            disabled={saving}
                            title="Eliminar fila"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mi-cr-table__foot">
                  <div className="mi-cr-foot-actions">
                    <button type="button" className="nv-foot-btn" onClick={addRow} disabled={saving}>
                      <span className="nv-foot-btn__icon">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M5 1.5V8.5M1.5 5H8.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                      </span>
                      Agregar fila
                    </button>
                    <div className="nv-foot-sep" />
                  </div>

                  <div className="mi-cr-totals">
                    <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                      <span>Subtotal</span>
                      <b>{moneyARS(resumen.subtotal)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                      <span>IVA</span>
                      <b>{moneyARS(resumen.iva)}</b>
                    </div>
                    <div className="mi-cr-totalLine mi-cr-totalLine--total">
                      <span>Total</span>
                      <b>{moneyARS(resumen.total)}</b>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mi-cr-filters">
                <aside className="nc-aside">
                  <div className="nc-section">
                    <div className="nc-section-head">
                      <div className="nc-section-dot" />
                      <span>Datos de compra</span>
                    </div>

                    <div className="nc-section-body">
                      {/* ⭐ INPUT DE FECHA CON VALIDACIONES ⭐ */}
                      <div className="nc-field" onClick={() => fechaInputRef.current?.showPicker?.()}>
                        <input
                          ref={fechaInputRef}
                          id="nc-fecha-input"
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={fecha}
                          max={todayISO()}
                          onChange={(e) => {
                            const nuevaFecha = String(e.target.value || "").trim();

                            if (nuevaFecha && nuevaFecha > todayISO()) {
                              setFecha(todayISO());
                              showToast("advertencia", "No podés seleccionar una fecha posterior al día actual.", 3000);
                              return;
                            }

                            setFecha(nuevaFecha);
                          }}
                          disabled={saving}
                        />
                        <label className="nc-label">Fecha</label>
                      </div>

                      <div className="nc-prov-wrap">
                        <GlobalAutocomplete
                          value={provInput}
                          onChange={handleProveedorInputChange}
                          onSelect={handleSelectProveedor}
                          options={proveedoresOptions}
                          getOptionLabel={(p) => isAddProveedorOption(p) ? "➕ Agregar proveedor por CUIT" : String(p?.nombre ?? "").trim()}
                          getOptionValue={(p) => isAddProveedorOption(p) ? "__add_proveedor__" : String(getProveedorId(p) ?? p?.nombre ?? "")}
                          label="Proveedor *"
                          placeholder=" "
                          disabled={saving || addUI.open}
                          showAllOnFocus={true}
                          maxItems={25}
                          inputClassName="nc-input"
                        />
                      </div>

                      <div className="nc-field">
                        <select
                          className="nc-input nc-select"
                          value={forma === NULL_OPTION ? "" : forma}
                          onChange={(e) => setForma(String(e.target.value || ""))}
                          disabled={saving}
                        >
                          <option value="">Seleccionar.</option>
                          <option value="CONTADO">CONTADO</option>
                          <option value="CUENTA_CORRIENTE">CUENTA CORRIENTE</option>
                        </select>

                        <label className={`nc-label${forma !== NULL_OPTION && forma ? " nc-label--up" : ""}`}>
                          Forma de compra *
                        </label>
                      </div>

                      {isContado && (
                        <PanelMediosPagoCompraLocal
                          mediosFilas={mediosFilas}
                          mediosPagoList={mediosPagoList}
                          totalCompra={resumen.total}
                          onUpdate={updateMedioPago}
                          onRemove={removeMedioPago}
                          onAdd={addMedioPago}
                          apiGet={apiGet}
                          BASE_URL={BASE_URL}
                          showToast={showToast}
                          saving={saving}
                        />
                      )}

                      {isCorriente && (
                        <div className="nc-cc-info">
                          Quedará registrada como <b>pendiente de pago</b>.
                        </div>
                      )}
                      <div className="mi-uploadCard">
                        <div className="mi-uploadCard__head">
                          <div className="mi-uploadCard__title">Comprobante adjunto</div>
                          <div className="mi-uploadCard__sub">
                            Seleccioná, visualizá o quitá el archivo antes de guardar
                          </div>
                        </div>

                        <div className="mi-uploadCard__body">
                          <div className={`mi-uploadFile${archivoAdjunto ? " is-filled" : " is-empty"}`}>
                            {archivoAdjunto ? (
                              <>
                                <div className="mi-uploadFile__icon">
                                  <FontAwesomeIcon icon={faFileInvoiceDollar} />
                                </div>

                                <div className="mi-uploadFile__meta">
                                  <div className="mi-uploadFile__name" title={NOMBRE_COMPROBANTE_GENERICO}>
                                    {NOMBRE_COMPROBANTE_GENERICO}
                                  </div>

                                </div>

                                <div style={{ display: "flex", gap: 8, marginLeft: "auto"}}>
                                  <button
                                    type="button"
                                    className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                    onClick={handleOpenVerComprobante}
                                    disabled={saving}
                                    title="Ver comprobante"
                                  >
                                    <FontAwesomeIcon icon={faEye} />
                                  </button>

                                  <button
                                    type="button"
                                    className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                    onClick={() => {
                                      setArchivoAdjunto(null);
                                      if (fileInputRef.current) fileInputRef.current.value = "";
                                      setOpenVerComp(false);
                                      if (compUrl) URL.revokeObjectURL(compUrl);
                                      setCompUrl("");
                                    }}
                                    disabled={saving || openVerComp}
                                    title="Quitar archivo"
                                  >
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="mi-uploadFile__empty">No hay comprobante seleccionado</div>
                            )}
                          </div>

                          <div className="mi-uploadBar" style={{ marginTop: 10 }}>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*,application/pdf,.pdf"
                              className="mi-uploadBar__input"
                              onChange={handleFileSelected}
                              disabled={saving}
                              style={{ display: "none" }}
                            />

                            <button
                              type="button"
                              className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                              onClick={handleOpenFilePicker}
                              disabled={saving}
                            >
                              <FontAwesomeIcon icon={faUpload} />{" "}
                              {archivoAdjunto ? "Reemplazar archivo" : "Seleccionar archivo"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="nc-section-divider" />


                  </div>


                </aside>
                <div className="nc-actions mi-cr-filters__actions mi-cr-filters__actions--sticky">
                  <button type="button" className="mit-btn mit-btn--solid mit-btn--block" onClick={submit} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar compra"}
                  </button>

                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost mit-btn--block"
                    onClick={() => !saving && onClose?.()}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <AddCatalogMiniModal
            open={addUI.open && addUI.kind !== "proveedores"}
            title={addUI.kind === "proveedores" ? "Nuevo proveedor" : "Nuevo detalle"}
            value={addUI.text}
            saving={addUI.saving}
            onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
            onCancel={closeAddMini}
            onSave={guardarNuevoCatalogo}
          />

          <ModalClienteFiscalArca
            open={addUI.open && addUI.kind === "proveedores"}
            title="Agregar proveedor por CUIT"
            infoTitle="Alta rápida de proveedor"
            description={
              <>
                Ingresá el CUIT, consultamos ARCA, guardamos la razón social en <b>Proveedores</b> y los datos completos en <b>Clientes fiscales</b>.
              </>
            }
            cuit={addUI.cuit}
            fiscalData={addUI.fiscalData}
            error={addUI.fiscalError}
            loading={addUI.lookupLoading}
            saving={addUI.saving}
            confirmText="Confirmar y cargar proveedor"
            footerHelp="Primero buscá el CUIT. Cuando aparezcan los datos, confirmá para guardar la razón social en proveedores y los datos completos en clientes fiscales."
            requireFiscalData={true}
            onCuitChange={(v) => setAddUI((p) => ({ ...p, cuit: v, fiscalData: null, fiscalError: "" }))}
            onLookup={consultarArcaAddProveedor}
            onClose={closeAddMini}
            onConfirm={guardarNuevoCatalogo}
          />
        </div>
      </div>

      <ModalVerComprobante
        open={openVerComp}
        url={compUrl}
        mime={archivoAdjunto?.type || ""}
        fileName={archivoAdjunto ? NOMBRE_COMPROBANTE_GENERICO : ""}
        onClose={handleCloseVerComprobante}
        title={NOMBRE_COMPROBANTE_GENERICO}
      />
    </>,
    document.body
  );
}
