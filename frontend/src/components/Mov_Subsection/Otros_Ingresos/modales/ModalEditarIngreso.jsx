import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filtrarMediosPagoPorPlan } from "../../_shared/planMediosPago";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faFileLines,
  faEye,
  faTrashCan,
  faPlus,
  faMoneyCheckDollar,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../../config/config.jsx";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import ModalNuevoCheque from "../../../Global/Modales/ModalNuevoCheque.jsx";
import ModalNuevaDescripcion from "./ModalNuevaDescripcion.jsx";

// ─── Constantes ────────────────────────────────────────────────────────────────
const NULL_OPTION = "";
const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
  { label: "27 %", value: 27 },
];

// ─── Helpers generales ─────────────────────────────────────────────────────────
function safeNumber(v) {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}
function safeText(v) {
  return String(v ?? "").trim();
}

function isAllowedComprobanteFile(file) {
  if (!file) return false;

  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();

  const isImageMime = mime.startsWith("image/");
  const isPdfMime = mime === "application/pdf";
  const isImageExt = /\.(jpg|jpeg|png|webp|gif|bmp|svg|heic|heif|avif|tif|tiff)$/i.test(name);
  const isPdfExt = /\.pdf$/i.test(name);

  return isImageMime || isPdfMime || isImageExt || isPdfExt;
}
function uid() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  return moneyARS(v);
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
  return n === 0 ? "" : String(n).replace(".", ",");
}
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m)
    return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  return s;
}
function calcItemTotals(cantidad, precio, ivaPct) {
  const c = Math.max(0, safeNumber(cantidad));
  const p = Math.max(0, safeNumber(precio));
  const iva = Math.max(0, safeNumber(ivaPct));
  const subtotal = c * p;
  const iva_monto = subtotal * (iva / 100);
  const total = subtotal + iva_monto;
  return { subtotal: round2(subtotal), iva_monto: round2(iva_monto), total: round2(total) };
}
function normalizeText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    Boolean(document.body?.classList?.contains("dark"))
  );
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Helpers de listas ─────────────────────────────────────────────────────────
function getDetalleId(d) {
  const cand =
    d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ??
    d?.id_categoria_ingreso ?? d?.idCategoriaIngreso ?? d?.categoria_ingreso_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getMedioPagoId(c) {
  const cand = c?.id ?? c?.id_medio_pago ?? c?.idMedioPago ?? c?.medio_pago_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function optionLabel(x) {
  return safeText(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? "");
}
function getStockDisponible(detalle) {
  const cand =
    detalle?.stock ?? detalle?.stock_disponible ?? detalle?.stockDisponible ??
    detalle?.cantidad_stock ?? detalle?.cantidad ?? null;
  if (cand === null || cand === undefined || cand === "") return null;
  const n = Number(cand);
  return Number.isFinite(n) ? n : null;
}
function isSinStock(stock) {
  return stock !== null && stock !== undefined && Number(stock) <= 0;
}
function getComprobanteDownloadUrl(idMovimiento) {
  return `${BASE_URL}/api.php?action=otros_ingresos_comprobantes_descargar&id_movimiento=${Number(idMovimiento || 0)}`;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
function getAuthInfo() {
  const token = safeText(localStorage.getItem("token"));
  const sessionKey =
    safeText(localStorage.getItem("session_key")) ||
    safeText(localStorage.getItem("sessionKey")) ||
    safeText(localStorage.getItem("X-Session")) ||
    safeText(localStorage.getItem("x_session"));
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { token, sessionKey, idUsuario };
}
function buildHeadersGET() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function buildHeadersJSON() {
  const { token, sessionKey } = getAuthInfo();
  const h = { "Content-Type": "application/json" };
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
function buildHeadersFormData() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Respuesta inválida del servidor. HTTP ${res.status}. ${text.slice(0, 400)}`
    );
  }
}

// ─── Detección de tipo de cheque ───────────────────────────────────────────────
function detectChequeTipo(nombre) {
  const s = normalizeText(nombre);
  if (!s) return null;
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq")) return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}

// ─── Normalización de listas ───────────────────────────────────────────────────
function normalizeDetalles(lists) {
  return Array.isArray(lists?.detalles_ingresos)
    ? lists.detalles_ingresos
    : Array.isArray(lists?.detallesIngresos)
    ? lists.detallesIngresos
    : Array.isArray(lists?.detalles_ingreso)
    ? lists.detalles_ingreso
    : Array.isArray(lists?.detallesIngreso)
    ? lists.detallesIngreso
    : Array.isArray(lists?.detalles)
    ? lists.detalles
    : Array.isArray(lists?.categorias_ingreso)
    ? lists.categorias_ingreso
    : Array.isArray(lists?.categoriasIngreso)
    ? lists.categoriasIngreso
    : [];
}
function normalizeMediosPago(lists) {
  const raw = Array.isArray(lists?.medios_pago)
    ? lists.medios_pago
    : Array.isArray(lists?.mediosPago)
    ? lists.mediosPago
    : [];
  return raw.map((x) => ({
    id: Number(x?.id ?? x?.id_medio_pago ?? 0),
    nombre: String(x?.nombre ?? x?.descripcion ?? x?.detalle ?? "").trim(),
  }));
}

// ─── Builders de entidades ─────────────────────────────────────────────────────
function makeItem(it = {}) {
  const cantidad = Number(it?.cantidad ?? 1) || 1;
  const precio = Number(it?.precio ?? it?.importe ?? it?.monto ?? it?.total ?? 0) || 0;
  const iva_pct = Number(it?.iva_pct ?? it?.ivaPct ?? 0) || 0;
  const calc = calcItemTotals(cantidad, precio, iva_pct);
  return {
    uid: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    id_detalle: String(Number(it?.id_detalle ?? 0) || ""),
    detalle: String(
      it?.detalle ?? it?.descripcion ?? it?.concepto ?? it?.detalle_nombre ?? ""
    ).trim(),
    cantidad,
    precio,
    iva_pct,
    subtotal: round2(it?.subtotal ?? calc.subtotal),
    iva_monto: round2(it?.iva_monto ?? calc.iva_monto),
    total: round2(it?.total ?? calc.total),
    stock_disponible: null,
    sinStock: false,
    precioDraft: "",
    precioFocused: false,
  };
}
function makeMedioPagoRow(mp = {}) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    id_medio_pago: String(Number(mp?.id_medio_pago ?? 0) || ""),
    monto: Number(mp?.monto ?? mp?.cheque_importe ?? 0) || 0,
    montoDraft: "",
    montoFocused: false,
    id_movimiento_medio_pago: Number(mp?.id_movimiento_medio_pago ?? 0) || null,
    id_cheque: Number(mp?.id_cheque ?? 0) || null,
    cheque:
      Number(mp?.id_cheque ?? 0) > 0
        ? {
            id_cheque: Number(mp?.id_cheque ?? 0),
            tipo_cheque: safeText(
              mp?.cheque_tipo ||
                detectChequeTipo(mp?.medio_pago_nombre || "") ||
                "cheque"
            ),
            emisor: safeText(mp?.emisor),
            numero_cheque: safeText(mp?.numero_cheque),
            fecha_emision: safeText(mp?.fecha_emision),
            fecha_pago: safeText(mp?.fecha_pago),
            importe: Number(mp?.cheque_importe ?? mp?.monto ?? 0) || 0,
          }
        : null,
  };
}
function buildInitialState(data) {
  const src = data && typeof data === "object" ? data : {};
  const rawItems =
    Array.isArray(src.items) && src.items.length
      ? src.items
      : Array.isArray(src.detalles) && src.detalles.length
      ? src.detalles
      : [src];
  const items = rawItems
    .map((it) => makeItem(it))
    .filter(
      (it) =>
        Number(it.cantidad) > 0 &&
        (Number(it.precio) > 0 || Number(it.total) > 0 || Number(it.id_detalle) > 0)
    );
  const medios =
    Array.isArray(src.medios_pago_detalle) && src.medios_pago_detalle.length
      ? src.medios_pago_detalle.map((mp) => makeMedioPagoRow(mp))
      : [
          makeMedioPagoRow({
            id_medio_pago: src?.id_medio_pago,
            monto: src?.monto_total ?? src?.total ?? src?.total_general ?? 0,
          }),
        ];
  return {
    id_movimiento: Number(src?.id_movimiento ?? src?.id ?? 0) || 0,
    fecha: String(src?.fecha ?? "").slice(0, 10),
    items: items.length
      ? items
      : [makeItem({ cantidad: 1, precio: Number(src?.monto_total ?? 0) || 0 })],
    medios,
  };
}
function sumTotalItems(items) {
  return round2(
    (Array.isArray(items) ? items : []).reduce((acc, it) => acc + safeNumber(it?.total), 0)
  );
}

// ─── Subcomponente: resumen visual de cheque ───────────────────────────────────
function ChequeResumen({ cheque, tipoCheque }) {
  if (!cheque) return null;
  const esEcheq = tipoCheque === "echeq";
  const label = safeText(cheque?.numero_cheque) || "-";
  const emisor = safeText(cheque?.emisor) || "-";
  return (
    <div className="nc-cheques-list">
      <div
        className={`nc-cheque-item nc-cheque-item--selected${esEcheq ? " nc-cheque-item--echeq" : ""}`}
      >
        <div className="nc-cheque-main">
          <div className="nc-cheque-top">
            <span className="nc-cheque-number">N° {label}</span>
            {esEcheq && (
              <span className="nc-cheque-badge nc-cheque-badge--echeq">eCheq</span>
            )}
          </div>
          <div className="nc-cheque-meta">
            <span className="nc-cheque-emisor" title={emisor}>{emisor}</span>
            <span className="nc-cheque-separator">·</span>
            <span>Pago: {formatFechaDMY(cheque?.fecha_pago)}</span>
          </div>
        </div>
        <span className="nc-cheque-importe">{moneyARS(cheque?.importe || 0)}</span>
        <div
          aria-hidden="true"
          className={`nc-cheque-check-icon nc-cheque-check-icon--corner${
            esEcheq
              ? " nc-cheque-check-icon--echeq"
              : " nc-cheque-check-icon--cheque"
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

// ─── Subcomponente: fila de medio de pago ──────────────────────────────────────
function MedioPagoRow({
  row,
  mediosPago,
  totalIngreso,
  sumaMediosPago,
  onUpdate,
  onRemove,
  saving,
  showToast,
  apiCheckNumero,
}) {
  const [openChequeModal, setOpenChequeModal] = useState(false);

  const medio = useMemo(
    () => mediosPago.find((x) => String(x.id) === String(row.id_medio_pago)) || null,
    [mediosPago, row.id_medio_pago]
  );
  const tipoCheque = useMemo(() => detectChequeTipo(medio?.nombre || ""), [medio]);
  const esCheque = tipoCheque !== null;

  const montoActual = esCheque && row.cheque
    ? safeNumber(row.cheque?.importe)
    : safeNumber(row.monto);

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - montoActual);
    return Math.max(0, safeNumber(totalIngreso) - sumaOtros);
  }, [sumaMediosPago, totalIngreso, montoActual]);

  // Sincronizar monto cuando se carga un cheque
  useEffect(() => {
    if (
      esCheque &&
      row.cheque?.importe > 0 &&
      Number(row.monto) !== Number(row.cheque.importe)
    ) {
      onUpdate(row.id, {
        monto: Number(row.cheque.importe),
        montoDraft: "",
        montoFocused: false,
      });
    }
  }, [esCheque, row.cheque, row.id, row.monto, onUpdate]);

  const handleChangeMedio = useCallback(
    (val) => {
      const mp = mediosPago.find((x) => String(x.id) === String(val));
      const tipo = detectChequeTipo(mp?.nombre || "");
      onUpdate(row.id, {
        id_medio_pago: val,
        monto: tipo === null ? safeNumber(row.monto) : safeNumber(row.cheque?.importe),
        montoDraft: "",
        montoFocused: false,
        cheque: tipo === null ? null : row.cheque,
      });
    },
    [mediosPago, onUpdate, row.id, row.monto, row.cheque]
  );

  const handleSaveCheque = useCallback(
    (datosCheque) => {
      const cheque = {
        ...datosCheque,
        tipo_cheque: tipoCheque || "cheque",
        id_cheque: row.cheque?.id_cheque || null,
        archivo_nombre:
          datosCheque?.archivo_nombre ||
          (datosCheque?.archivo instanceof File ? datosCheque.archivo.name : ""),
      };
      onUpdate(row.id, {
        cheque,
        id_cheque: cheque.id_cheque || row.id_cheque || null,
        monto: safeNumber(cheque.importe),
        montoDraft: "",
        montoFocused: false,
      });
      setOpenChequeModal(false);
      showToast?.(
        "exito",
        `${tipoCheque === "echeq" ? "eCheq" : "Cheque"} ${cheque.numero_cheque || ""} actualizado.`);
    },
    [onUpdate, row.id, row.cheque, row.id_cheque, showToast, tipoCheque]
  );

  const verificarNumeroCheque = useCallback(
    async ({ numero_cheque, tipoCheque: tc, initialData }) => {
      const numeroCheque = String(numero_cheque ?? "").replace(/\D/g, "");
      if (!numeroCheque) {
        return {
          ok: false,
          tipo: "advertencia",
          mensaje: "Ingresá el número de cheque antes de confirmar.",
        };
      }
      const params = new URLSearchParams();
      params.set("numero_cheque", numeroCheque);
      params.set("tipo", String(tc || "cheque"));
      const idChequeActual = Number(initialData?.id_cheque || row?.cheque?.id_cheque || 0);
      if (Number.isFinite(idChequeActual) && idChequeActual > 0) {
        params.set("id_cheque", String(idChequeActual));
      }
      const res = await fetch(`${apiCheckNumero}&${params.toString()}`, {
        method: "GET",
        headers: buildHeadersGET(),
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito)
        throw new Error(data?.mensaje || "No se pudo verificar el número del cheque.");
      if (data?.existe || data?.disponible === false) {
        return {
          ok: false,
          tipo: "error",
          mensaje: data?.mensaje || "Ese número de cheque ya existe.",
        };
      }
      return { ok: true };
    },
    [apiCheckNumero, row?.cheque?.id_cheque]
  );

  return (
    <div className="nc-mp-card">
      {/* Selector de medio */}
      <div className="nc-mp-row nc-mp-row--medio">
        <div className="nc-field" style={{ position: "relative" }}>
          <select
            className="nc-input nc-select"
            value={String(row.id_medio_pago || "")}
            onChange={(e) => handleChangeMedio(e.target.value)}
            disabled={saving}
          >
            <option value={NULL_OPTION}>Seleccionar…</option>
            {mediosPago.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.nombre}
              </option>
            ))}
          </select>
          <label
            className={`nc-label${
              row.id_medio_pago && row.id_medio_pago !== "" ? " nc-label--up" : ""
            }`}
          >
            Medio de pago
          </label>
        </div>
      </div>

      {/* Monto */}
      <div className="nc-mp-row nc-mp-row--monto">
        <div className="nc-field nc-mp-monto-field" style={{ position: "relative" }}>
          <input
            className={`nc-input nc-mp-monto-input${
              esCheque && row.cheque ? " nc-mp-input-monto--locked" : ""
            }`}
            type="text"
            inputMode="decimal"
            value={
              row.montoFocused
                ? row.montoDraft ?? ""
                : formatMoneyInputARS(montoActual)
            }
            onFocus={(e) => {
              if (esCheque && row.cheque) return;
              onUpdate(row.id, {
                montoFocused: true,
                montoDraft: formatEditableMoney(montoActual),
              });
              setTimeout(() => e.target.select(), 0);
            }}
            onChange={(e) => {
              if (esCheque && row.cheque) return;
              const c = e.target.value.replace(/[^\d,.\-]/g, "");
              onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) });
            }}
            onBlur={() => {
              if (esCheque && row.cheque) return;
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false });
            }}
            onKeyDown={(e) => {
              if (esCheque && row.cheque) return;
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="$ 0,00"
            disabled={saving || (esCheque && !!row.cheque)}
            style={{ height: 32, padding: "0 10px", fontSize: 13, textAlign: "right" }}
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
              disabled={saving || restanteParaEstaFila <= 0.009}
              title="Completar importe restante"
            >
              ↓ Rest.
            </button>
          )}
          <button
            type="button"
            className="nc-mp-del-btn"
            onClick={() => onRemove(row)}
            disabled={saving}
            title="Quitar"
          >
            ×
          </button>
        </div>
      </div>

      {/* Sección cheque */}
      {esCheque && (
        <div className="nc-mp-cheques">
          <div className="nc-mp-cheques-title">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 12 }} />
            {tipoCheque === "echeq" ? "eCheq cargado" : "Cheque cargado"}
          </div>

          {row.cheque ? (
            <>
              <ChequeResumen cheque={row.cheque} tipoCheque={tipoCheque} />
              <button
                type="button"
                className="nc-pago-btn"
                onClick={() => setOpenChequeModal(true)}
                disabled={saving}
              >
                Editar {tipoCheque === "echeq" ? "eCheq" : "cheque"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="nc-pago-btn"
              onClick={() => setOpenChequeModal(true)}
              disabled={saving}
            >
              Cargar {tipoCheque === "echeq" ? "eCheq" : "cheque"}
            </button>
          )}
        </div>
      )}

      {openChequeModal && (
        <ModalNuevoCheque
          open={openChequeModal}
          onClose={() => setOpenChequeModal(false)}
          onSave={handleSaveCheque}
          initialData={
            row.cheque
              ? {
                  id_cheque: row.cheque.id_cheque,
                  fecha_emision: row.cheque.fecha_emision,
                  emisor: row.cheque.emisor,
                  numero_cheque: row.cheque.numero_cheque,
                  importe: row.cheque.importe,
                  fecha_pago: row.cheque.fecha_pago,
                  observaciones: row.cheque.observaciones,
                  archivo: row.cheque.archivo,
                  archivo_nombre: row.cheque.archivo_nombre,
                }
              : undefined
          }
          tipoCheque={tipoCheque || "cheque"}
          saving={false}
          verificarNumeroCheque={verificarNumeroCheque}
        />
      )}
    </div>
  );
}

// ─── Panel inline de medios de pago ───────────────────────────────────────────
function PanelMediosPago({
  mediosFilas,
  mediosPago,
  totalIngreso,
  onUpdate,
  onRemove,
  onAdd,
  saving,
  showToast,
  apiCheckNumero,
}) {
  const filas =
    Array.isArray(mediosFilas) && mediosFilas.length
      ? mediosFilas
      : [makeMedioPagoRow()];

  const sumaMediosPago = useMemo(
    () =>
      filas.reduce((a, r) => {
        const mp = mediosPago.find((x) => String(x.id) === String(r.id_medio_pago ?? ""));
        const tipoCheque = detectChequeTipo(String(mp?.nombre ?? "").trim());
        const monto =
          tipoCheque !== null && r.cheque
            ? safeNumber(r.cheque.importe)
            : safeNumber(r.monto);
        return a + monto;
      }, 0),
    [filas, mediosPago]
  );

  const diferenciaRestante = useMemo(
    () => Math.max(0, safeNumber(totalIngreso) - sumaMediosPago),
    [totalIngreso, sumaMediosPago]
  );

  return (
    <>
      {filas.map((mp) => (
        <MedioPagoRow
          key={mp.id}
          row={mp}
          mediosPago={mediosPago}
          totalIngreso={totalIngreso}
          sumaMediosPago={sumaMediosPago}
          onUpdate={onUpdate}
          onRemove={onRemove}
          saving={saving}
          showToast={showToast}
          apiCheckNumero={apiCheckNumero}
        />
      ))}

      <div className="nc-mp-totals">
        <span className="nc-mp-totals-asignado">
          Asignado: <b>{moneyARS(sumaMediosPago)}</b>
        </span>
        {diferenciaRestante > 0.01 && (
          <span className="nc-mp-totals-falta">Falta: {moneyARS(diferenciaRestante)}</span>
        )}
        {diferenciaRestante <= 0.01 && sumaMediosPago > 0 && (
          <span className="nc-mp-totals-ok">✓ Cubierto</span>
        )}
      </div>

      <button
        type="button"
        className="nc-pago-btn"
        onClick={onAdd}
        disabled={saving}
      >
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro medio
      </button>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function ModalEditarIngreso({
  open,
  initialData,
  lists,
  onClose,
  onToast,
  onSubmit,
  onSaved,
  dark: darkProp,
}) {
  const API = `${BASE_URL}/api.php`;
  const API_CHECK_NUMERO = `${BASE_URL}/api.php?action=ventas_cheques_obtener&modo=verificar_numero`;

  const showToast = useCallback(
    (tipo, mensaje) => onToast?.(tipo, mensaje),
    [onToast]
  );

  const [darkAuto, setDarkAuto] = useState(isTemaOscuro);
  const [saving, setSaving] = useState(false);
  const [loadingComprobante, setLoadingComprobante] = useState(false);
  const [form, setForm] = useState(() => buildInitialState(initialData));
  const [comprobanteActual, setComprobanteActual] = useState(null);
  const [archivoNuevo, setArchivoNuevo] = useState(null);
  const [marcarEliminarComprobante, setMarcarEliminarComprobante] = useState(false);
  const [openViewer, setOpenViewer] = useState(false);
  const [viewerData, setViewerData] = useState({ url: "", mime: "", title: "Comprobante" });
  const [openNuevaDescripcionModal, setOpenNuevaDescripcionModal] = useState(false);
  const [currentRowIdForNewDesc, setCurrentRowIdForNewDesc] = useState(null);
  const [removedChequeIds, setRemovedChequeIds] = useState([]);

  const closeBtnRef = useRef(null);
  const inputFileRef = useRef(null);
  const fechaRef = useRef(null);

  // Tema oscuro
  useEffect(() => {
    const update = () => setDarkAuto(isTemaOscuro());
    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const obsBody = new MutationObserver(update);
    if (document.body)
      obsBody.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    update();
    return () => { obsHtml.disconnect(); obsBody.disconnect(); };
  }, []);

  const dark = typeof darkProp === "boolean" ? darkProp : darkAuto;
  const detalles = useMemo(() => normalizeDetalles(lists), [lists]);
  const mediosPago = useMemo(() => filtrarMediosPagoPorPlan(normalizeMediosPago(lists)), [lists]);

  // Bloqueo scroll body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setForm(buildInitialState(initialData));
    setArchivoNuevo(null);
    setMarcarEliminarComprobante(false);
    setComprobanteActual(null);
    setRemovedChequeIds([]);
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open, initialData]);

  // Escape key
  useEffect(() => {
    if (!open) return;

    const h = (e) => {
      if (e.key !== "Escape" || saving) return;

      // Si está abierto el modal superior de cheque,
      // este modal padre NO debe cerrarse con Escape.
      if (document.body.classList.contains("modal-nuevo-cheque-open")) {
        return;
      }

      if (openViewer || openNuevaDescripcionModal) return;

      e.preventDefault();
      e.stopPropagation();



      onClose?.();
    };

    document.addEventListener("keydown", h, true);

    return () => {
      document.removeEventListener("keydown", h, true);
    };
  }, [open, saving, openViewer, openNuevaDescripcionModal, onClose]);

  // Carga info comprobante existente
  const cargarInfoComprobante = useCallback(async () => {
    const idMovimiento = Number(initialData?.id_movimiento ?? initialData?.id ?? 0);
    if (!open || !(idMovimiento > 0)) { setComprobanteActual(null); return; }
    setLoadingComprobante(true);
    try {
      const res = await fetch(
        `${API}?action=otros_ingresos_comprobantes_info&id_movimiento=${idMovimiento}`,
        { method: "GET", headers: buildHeadersGET() }
      );
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo obtener el comprobante.");
      setComprobanteActual(data?.comprobante ?? null);
    } catch (err) {
      setComprobanteActual(null);
      showToast("error", err?.message || "No se pudo obtener el comprobante.");
    } finally {
      setLoadingComprobante(false);
    }
  }, [API, initialData, open, showToast]);

  useEffect(() => { if (open) cargarInfoComprobante(); }, [open, cargarInfoComprobante]);

  // Enriquecer ítems con stock desde listas
  useEffect(() => {
    if (!open || !Array.isArray(detalles) || !detalles.length) return;
    setForm((prev) => ({
      ...prev,
      items: (prev.items || []).map((it) => {
        const detalleObj =
          detalles.find(
            (d) => String(getDetalleId(d) ?? "") === String(it.id_detalle || "")
          ) || null;
        if (!detalleObj) return it;
        const stockDisponible = getStockDisponible(detalleObj);
        const sinStock = isSinStock(stockDisponible);
        return {
          ...it,
          detalle: it.detalle || optionLabel(detalleObj),
          stock_disponible: stockDisponible,
          sinStock,
        };
      }),
    }));
  }, [open, detalles]);

  // ─── Handlers de ítems ───────────────────────────────────────────────────────
  const updateItem = useCallback(
    (uid, patch) =>
      setForm((prev) => ({
        ...prev,
        items: prev.items.map((it) => {
          if (it.uid !== uid) return it;
          const next = { ...it, ...patch };
          const cantidad = next.cantidad === "" ? "" : safeNumber(next.cantidad);
          const precio = round2(safeNumber(next.precio));
          const iva_pct = round2(safeNumber(next.iva_pct));
          const calc = calcItemTotals(
            cantidad === "" ? 0 : cantidad,
            precio,
            iva_pct
          );
          return { ...next, cantidad, precio, iva_pct, ...calc };
        }),
      })),
    []
  );

  const handleSelectDetalle = useCallback(
    (item, uid) => {
      if (item?.__isNewOption) {
        setCurrentRowIdForNewDesc(uid);
        setOpenNuevaDescripcionModal(true);
        return;
      }
      const precio = safeNumber(item?.precio || 0);
      const stockDisponible = getStockDisponible(item);
      const sinStock = isSinStock(stockDisponible);
      updateItem(uid, {
        id_detalle: String(getDetalleId(item) ?? ""),
        detalle: optionLabel(item),
        precio,
        stock_disponible: stockDisponible,
        sinStock,
        cantidad: sinStock ? "" : 1,
      });
      if (sinStock)
        showToast(
          "advertencia",
          `El producto "${optionLabel(item)}" no tiene stock disponible.`);
    },
    [updateItem, showToast]
  );

  const handleCantidadChange = useCallback(
    (uid, newCantidad) => {
      const row = form.items.find((r) => r.uid === uid);
      if (!row) return;
      if (row.sinStock || isSinStock(row.stock_disponible)) {
        updateItem(uid, { cantidad: "" });
        return;
      }
      const stockDisponible = row.stock_disponible;
      let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);
      if (typeof cantidadFinal === "number" && cantidadFinal < 0) cantidadFinal = 0;
      if (
        stockDisponible !== null &&
        stockDisponible !== undefined &&
        stockDisponible !== "" &&
        typeof cantidadFinal === "number" &&
        cantidadFinal > Number(stockDisponible)
      ) {
        cantidadFinal = Number(stockDisponible);
        showToast("advertencia", `Stock máximo disponible: ${stockDisponible}`);
      }
      updateItem(uid, { cantidad: cantidadFinal });
    },
    [form.items, updateItem, showToast]
  );

  const addItem = useCallback(
    () =>
      setForm((p) => ({
        ...p,
        items: [...p.items, makeItem({ cantidad: 1, precio: 0, iva_pct: 0 })],
      })),
    []
  );

  const removeItem = useCallback(
    (uid) =>
      setForm((p) =>
        (p.items || []).length <= 1
          ? p
          : { ...p, items: p.items.filter((it) => it.uid !== uid) }
      ),
    []
  );

  // ─── Handlers de medios de pago ──────────────────────────────────────────────
  const updateMedioPago = useCallback(
    (id, patch) =>
      setForm((prev) => ({
        ...prev,
        medios: prev.medios.map((mp) => (mp.id === id ? { ...mp, ...patch } : mp)),
      })),
    []
  );

  const addMedioPago = useCallback(
    () =>
      setForm((prev) => ({
        ...prev,
        medios: [...prev.medios, makeMedioPagoRow()],
      })),
    []
  );

  // onRemove recibe el objeto row completo para poder capturar id_cheque
  const removeMedioPago = useCallback((row) => {
    setForm((prev) => {
      const next = prev.medios.filter((x) => x.id !== row.id);
      return { ...prev, medios: next.length ? next : [makeMedioPagoRow()] };
    });
    if (row?.id_cheque) setRemovedChequeIds((p) => [...p, Number(row.id_cheque)]);
  }, []);

  // ─── Cálculos ────────────────────────────────────────────────────────────────
  const totalGeneral = useMemo(() => sumTotalItems(form.items), [form.items]);
  const sumaMediosPago = useMemo(
    () => (form.medios || []).reduce((acc, mp) => acc + safeNumber(mp?.monto), 0),
    [form.medios]
  );
  const resumen = {
    subtotal: round2(
      (form.items || []).reduce((a, it) => a + safeNumber(it?.subtotal), 0)
    ),
    iva: round2((form.items || []).reduce((a, it) => a + safeNumber(it?.iva_monto), 0)),
    total: totalGeneral,
  };

  // ─── Comprobante ─────────────────────────────────────────────────────────────
  const mostrarArchivoActual = Boolean(
    (comprobanteActual?.archivo_url || comprobanteActual) &&
      !marcarEliminarComprobante &&
      !archivoNuevo
  );

  const nombreComprobanteVisible = useMemo(() => {
    if (marcarEliminarComprobante) return "";
    if (archivoNuevo || comprobanteActual) return "Comprobante adjunto";
    return "";
  }, [archivoNuevo, marcarEliminarComprobante, comprobanteActual]);

  const abrirViewer = useCallback(async () => {
    const idMovimiento = Number(form.id_movimiento || 0);
    if (!(idMovimiento > 0)) return;

    if (archivoNuevo) {
      setViewerData({
        url: URL.createObjectURL(archivoNuevo),
        mime: archivoNuevo.type || "application/octet-stream",
        title: "Comprobante adjunto",
      });
      setOpenViewer(true);
      return;
    }

    if (!comprobanteActual || marcarEliminarComprobante) return;

    setLoadingComprobante(true);
    try {
      const idComprobante = Number(
        comprobanteActual?.id_comprobante ??
          comprobanteActual?.comprobante_id ??
          comprobanteActual?.id_archivo ??
          0
      );

      const sp = new URLSearchParams();
      sp.set("action", "otros_ingresos_comprobantes_descargar");
      if (idComprobante > 0) sp.set("id_comprobante", String(idComprobante));
      sp.set("id_movimiento", String(idMovimiento));

      const res = await fetch(`${API}?${sp.toString()}`, {
        method: "GET",
        headers: buildHeadersGET(),
      });
      const data = await parseJsonOrThrow(res);

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo obtener el comprobante.");
      }

      const signedUrl = String(data?.url || data?.archivo_url || "").trim();
      if (!signedUrl) {
        throw new Error("El backend no devolvió la URL del comprobante.");
      }

      setViewerData({
        url: signedUrl,
        mime: safeText(comprobanteActual?.archivo_mime) || safeText(data?.mime) || "application/octet-stream",
        title: "Comprobante del ingreso",
      });
      setOpenViewer(true);
    } catch (err) {
      showToast("error", err?.message || "No se pudo abrir el comprobante.");
    } finally {
      setLoadingComprobante(false);
    }
  }, [API, form.id_movimiento, archivoNuevo, comprobanteActual, marcarEliminarComprobante, showToast]);

  const cerrarViewer = useCallback(() => {
    if (viewerData?.url?.startsWith("blob:")) URL.revokeObjectURL(viewerData.url);
    setOpenViewer(false);
    setViewerData({ url: "", mime: "", title: "Comprobante" });
  }, [viewerData]);

  const seleccionarArchivo = useCallback((e) => {
    const file = e.target.files?.[0] || null;

    if (!file) return;

    if (!isAllowedComprobanteFile(file)) {
      showToast("advertencia", "Archivo inválido. Solo se permiten imágenes o archivos PDF.");
      setArchivoNuevo(null);

      if (inputFileRef.current) inputFileRef.current.value = "";

      return;
    }

    setArchivoNuevo(file);
    setMarcarEliminarComprobante(false);
  }, [showToast]);

  const quitarArchivoNuevo = useCallback(() => {
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  }, []);

  const marcarEliminar = useCallback(() => {
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
    setMarcarEliminarComprobante(true);
  }, []);

  const restaurarComprobanteActual = useCallback(() => {
    setMarcarEliminarComprobante(false);
    setArchivoNuevo(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
  }, []);

  const openDatePicker = useCallback(() => {
    const el = fechaRef.current;
    if (!el || saving || el.disabled) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.focus();
    } catch { el.focus(); }
  }, [saving]);

  // ⭐ FUNCIÓN PARA VALIDAR Y ACTUALIZAR LA FECHA ⭐
  const handleFechaChange = useCallback((e) => {
    const nuevaFecha = e.target.value;

    if (nuevaFecha && nuevaFecha > todayISO()) {
      showToast("advertencia", "No podés seleccionar una fecha posterior al día actual.");
      return;
    }

    setForm((p) => ({ ...p, fecha: nuevaFecha }));
  }, [showToast]);

  const cerrar = useCallback(() => { if (!saving) onClose?.(); }, [saving, onClose]);

  // ─── Operaciones de API sobre comprobante y cheques ───────────────────────────
  const eliminarComprobanteExistente = useCallback(
    async (idMovimiento) => {
      const { idUsuario } = getAuthInfo();
      const res = await fetch(`${API}?action=otros_ingresos_comprobantes_eliminar`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({
          id_movimiento: idMovimiento,
          idUsuario,
          idUsuarioMaster: idUsuario,
        }),
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el comprobante.");
      return data;
    },
    [API]
  );

  const subirComprobanteNuevo = useCallback(
    async (idMovimiento, archivo) => {
      const { idUsuario } = getAuthInfo();
      const fd = new FormData();
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("archivo", archivo);
      fd.append("idUsuario", String(idUsuario || 0));
      fd.append("idUsuarioMaster", String(idUsuario || 0));
      const res = await fetch(
        `${API}?action=otros_ingresos_comprobantes_vincular_movimiento_upload`,
        { method: "POST", headers: buildHeadersFormData(), body: fd }
      );
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo subir el comprobante.");
      return data;
    },
    [API]
  );

  const guardarCheque = useCallback(
    async (idMovimiento, medioDetalle, chequeData) => {
      if (!chequeData) return null;
      const { token, sessionKey, idUsuario } = getAuthInfo();
      const fd = new FormData();
      fd.append("id_movimiento", String(idMovimiento));
      fd.append(
        "id_movimiento_medio_pago",
        String(Number(medioDetalle?.id_movimiento_medio_pago || 0))
      );
      fd.append("id_medio_pago", String(Number(medioDetalle?.id_medio_pago || 0)));
      fd.append("tipo", chequeData.tipo_cheque || "cheque");
      fd.append("fecha_emision", chequeData.fecha_emision || "");
      fd.append("emisor", chequeData.emisor || "");
      fd.append("numero_cheque", chequeData.numero_cheque || "");
      fd.append("importe", String(chequeData.importe || 0));
      fd.append("fecha_pago", chequeData.fecha_pago || "");
      fd.append("observaciones", chequeData.observaciones || "");
      fd.append("idUsuario", String(idUsuario || 0));
      fd.append("idUsuarioMaster", String(idUsuario || 0));
      if (chequeData.archivo instanceof File) {
        fd.append(
          "archivo",
          chequeData.archivo,
          chequeData.archivo_nombre || chequeData.archivo.name || "adjunto"
        );
      }
      const headers = {};
      if (sessionKey) headers["X-Session"] = sessionKey;
      if (token) headers.Authorization = `Bearer ${token}`;
      const action = chequeData.id_cheque
        ? "otros_ingresos_cheques_actualizar"
        : "otros_ingresos_cheques_guardar";
      if (chequeData.id_cheque) fd.append("id_cheque", String(Number(chequeData.id_cheque)));
      const res = await fetch(`${API}?action=${action}`, {
        method: "POST",
        headers,
        body: fd,
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar el cheque.");
      return data;
    },
    [API]
  );

  const eliminarCheque = useCallback(
    async (idCheque) => {
      const { idUsuario } = getAuthInfo();
      const res = await fetch(`${API}?action=otros_ingresos_cheques_eliminar`, {
        method: "POST",
        headers: buildHeadersJSON(),
        body: JSON.stringify({ id_cheque: idCheque, idUsuario, idUsuarioMaster: idUsuario }),
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar el cheque.");
      return data;
    },
    [API]
  );

  // ─── Validación ──────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.fecha || "").trim()))
      return { ok: false, msg: "La fecha es obligatoria." };

    // ⭐ VALIDACIÓN DE FECHA FUTURA ⭐
    if (form.fecha > todayISO()) {
      return { ok: false, msg: "La fecha no puede ser posterior al día actual." };
    }

    if (!Array.isArray(form.medios) || !form.medios.length)
      return { ok: false, msg: "Debés cargar al menos un medio de pago." };

    for (let i = 0; i < form.medios.length; i++) {
      const mp = form.medios[i];
      if (!(Number(mp.id_medio_pago || 0) > 0))
        return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
      const medio = mediosPago.find((x) => String(x.id) === String(mp.id_medio_pago));
      const tipoCheque = detectChequeTipo(medio?.nombre || "");
      if (tipoCheque) {
        if (!mp.cheque)
          return {
            ok: false,
            msg: `Medio de pago ${i + 1}: debés cargar el ${tipoCheque === "echeq" ? "eCheq" : "cheque"}.`,
          };
      } else if (!(safeNumber(mp.monto) > 0)) {
        return { ok: false, msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.` };
      }
    }

    if (sumaMediosPago < totalGeneral - 0.05 && totalGeneral > 0)
      return {
        ok: false,
        msg: `La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no cubre el total del ingreso (${moneyARS(totalGeneral)}).`,
      };

    const items = (form.items || [])
      .map((it) => ({
        ...it,
        id_detalle: Number(it.id_detalle || 0),
        cantidad: safeNumber(it.cantidad),
        precio: round2(safeNumber(it.precio)),
        iva_pct: round2(safeNumber(it.iva_pct)),
      }))
      .filter(
        (it) =>
          it.id_detalle > 0 &&
          it.cantidad > 0 &&
          it.precio > 0 &&
          safeNumber(it.total) > 0
      );

    if (!items.length) return { ok: false, msg: "Debés cargar al menos un ítem válido." };
    return { ok: true, items };
  }, [form, mediosPago, sumaMediosPago, totalGeneral]);

  // ─── Submit ───────────────────────────────────────────────────────────────────
  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    try {
      setSaving(true);
      showToast("cargando", "Actualizando ingreso…");

      const v = validate();
      if (!v.ok) throw new Error(v.msg);

      if (archivoNuevo && !isAllowedComprobanteFile(archivoNuevo)) {
        throw new Error("Archivo inválido. Solo se permiten imágenes o archivos PDF.");
      }

      const items = v.items.map((it) => ({
        id_detalle: it.id_detalle,
        detalle: safeText(it.detalle),
        cantidad: safeNumber(it.cantidad),
        precio: round2(safeNumber(it.precio)),
        iva_pct: round2(safeNumber(it.iva_pct)),
        ...calcItemTotals(it.cantidad, it.precio, it.iva_pct),
      }));

      const payload = {
        id_movimiento: Number(form.id_movimiento || 0),
        fecha: String(form.fecha || "").trim(),
        id_medio_pago: Number(form.medios?.[0]?.id_medio_pago || 0),
        id_detalle: items[0]?.id_detalle ?? null,
        monto_total: sumTotalItems(items),
        medios_pago: (form.medios || []).map((mp) => ({
          id_movimiento_medio_pago: mp.id_movimiento_medio_pago || null,
          id_medio_pago: Number(mp.id_medio_pago || 0),
          monto: safeNumber(mp.cheque?.importe ?? mp.monto),
          id_cheque: mp.id_cheque || null,
          cheque_tipo: mp.cheque?.tipo_cheque || null,
        })),
        items,
      };

      if (!(payload.id_movimiento > 0))
        throw new Error("Falta el ID del ingreso a editar.");

      const resp = await onSubmit?.(payload, true);
      const idMovimientoFinal = Number(
        resp?.id_movimiento ?? resp?.id ?? payload.id_movimiento ?? 0
      );
      if (!(idMovimientoFinal > 0))
        throw new Error("No se pudo determinar el ID del ingreso actualizado.");

      // Comprobante
      if (marcarEliminarComprobante && comprobanteActual && !archivoNuevo) {
        await eliminarComprobanteExistente(idMovimientoFinal);
      }
      if (archivoNuevo) {
        await subirComprobanteNuevo(idMovimientoFinal, archivoNuevo);
      }

      // Cheques
      const mediosDetalle = Array.isArray(resp?.medios_pago_detalle)
        ? resp.medios_pago_detalle
        : [];
      for (let index = 0; index < (form.medios || []).length; index++) {
        const mp = form.medios[index];
        if (!mp.cheque) continue;
        const detalleMp =
          mediosDetalle.find(
            (x) =>
              Number(x?.id_movimiento_medio_pago || 0) ===
              Number(mp.id_movimiento_medio_pago || 0)
          ) ||
          mediosDetalle[index] ||
          null;
        await guardarCheque(idMovimientoFinal, detalleMp, mp.cheque);
      }

      // Cheques eliminados
      for (const idCheque of removedChequeIds) {
        try { await eliminarCheque(idCheque); } catch {}
      }

      await onSaved?.(resp);
    } catch (err) {
      showToast("error", err?.message || "Error actualizando ingreso.");
      setSaving(false);
    }
  };

  // ─── Descripción nueva ───────────────────────────────────────────────────────
  const handleGuardarNuevaDescripcion = useCallback(
    async (nombre) => {
      try {
        const { token, sessionKey, idUsuario } = getAuthInfo();
        const headers = { "Content-Type": "application/json" };
        if (sessionKey) headers["X-Session"] = sessionKey;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API}?action=otros_ingresos_detalles_crear`, {
          method: "POST",
          headers,
          body: JSON.stringify({ nombre, idUsuario, idUsuarioMaster: idUsuario }),
        });
        const data = await parseJsonOrThrow(res);
        if (!data?.exito || !data?.detalle)
          throw new Error(data?.mensaje || "No se pudo crear la descripción.");
        const item = data.detalle;
        const precio = safeNumber(item?.precio || 0);
        const stockDisponible = getStockDisponible(item);
        const sinStock = isSinStock(stockDisponible);
        updateItem(currentRowIdForNewDesc, {
          id_detalle: String(item.id_detalle || item.id || ""),
          detalle: item.nombre || nombre,
          precio,
          stock_disponible: stockDisponible,
          sinStock,
          cantidad: sinStock ? "" : 1,
        });
        showToast("exito", "Descripción creada y seleccionada correctamente.");
        return true;
      } catch (e) {
        showToast("error", e?.message || "No se pudo crear la descripción.");
        return false;
      }
    },
    [API, currentRowIdForNewDesc, updateItem, showToast]
  );

  // Lista de detalles con opción de nueva descripción
  const enhancedDetalles = useMemo(
    () => [
      { id: "new_option", __isNewOption: true, nombre: "+ Agregar nueva descripción" },
      ...detalles,
    ],
    [detalles]
  );

  if (!open) return null;
  return createPortal(
    <>
      <div className="mi-modal__overlay mi-modal__overlay--mov">
        <div
          className={`mi-modal__container mi-modal__container--mov${dark ? " mi-modal--dark" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-editar-ingreso-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faPenToSquare} />
            </div>
            <div className="mi-modal__head-left">
              <h2 id="modal-editar-ingreso-title" className="mi-modal__title">
                Editar ingreso
              </h2>
              <p className="mi-modal__subtitle">
                Modificá fecha, medios de pago, ítems y comprobante
              </p>
            </div>
            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={cerrar}
              aria-label="Cerrar"
              disabled={saving}
              type="button"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="mi-modal__content">
            <form onSubmit={submit} style={{ display: "contents" }}>
              <div className="mi-cr-grid">
                {/* Tabla de ítems */}
                <section className="mi-cr-table">
                  <div
                    className="mi-cr-table__head"
                    style={{
                      gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr",
                    }}
                  >
                    <div style={{ paddingLeft: 10 }}>Descripción</div>
                    <div>Cant.</div>
                    <div className="right">Importe</div>
                    <div>IVA %</div>
                    <div className="right">IVA $</div>
                    <div className="right">Total</div>
                    <div />
                  </div>

                  <div className="mi-cr-table__rows">
                    {(form.items || []).map((it) => {
                      const stockNum =
                        it.stock_disponible !== null && it.stock_disponible !== undefined
                          ? Number(it.stock_disponible)
                          : null;
                      const rowSinStock = it.sinStock || isSinStock(stockNum);

                      return (
                        <div
                          key={it.uid}
                          className={`mi-cr-row${rowSinStock ? " mi-cr-row--sin-stock" : ""}`}
                          style={{
                            gridTemplateColumns:
                              "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr",
                          }}
                        >
                          {/* Descripción */}
                          <div className="mi-cr-cell mi-cr-cell--detalle">
                            <GlobalAutocomplete
                              value={it.detalle}
                              onChange={(val) =>
                                updateItem(it.uid, {
                                  detalle: val,
                                  id_detalle: NULL_OPTION,
                                  stock_disponible: null,
                                  sinStock: false,
                                })
                              }
                              onSelect={(item) => handleSelectDetalle(item, it.uid)}
                              options={enhancedDetalles}
                              getOptionLabel={(d) => optionLabel(d)}
                              getOptionValue={(d) =>
                                String(getDetalleId(d) ?? optionLabel(d))
                              }
                              placeholder="Escribí o buscá un detalle…"
                              disabled={saving}
                              showAllOnFocus={false}
                              maxItems={18}
                              inputClassName="nv-cell-input"
                            />
                          </div>

                          {/* Cantidad */}
                          <div className="mi-cr-cell mi-cr-cell--center">
                            <input
                              className="nv-cell-input nv-cell-input--center"
                              type="number"
                              min={rowSinStock ? undefined : "1"}
                              step="1"
                              style={{
                                width: "100%",
                                background: rowSinStock ? "#f3f4f6" : undefined,
                                color: rowSinStock ? "#b91c1c" : undefined,
                                borderColor: rowSinStock ? "#fca5a5" : undefined,
                                cursor: rowSinStock ? "not-allowed" : undefined,
                                opacity: rowSinStock ? 0.9 : 1,
                              }}
                              value={rowSinStock ? "" : it.cantidad}
                              onChange={(e) =>
                                handleCantidadChange(
                                  it.uid,
                                  e.target.value === "" ? "" : Number(e.target.value)
                                )
                              }
                              disabled={saving || rowSinStock}
                              placeholder={rowSinStock ? "0" : ""}
                              title={
                                rowSinStock
                                  ? "No podés ingresar cantidad porque el stock es 0"
                                  : ""
                              }
                            />
                            {it.stock_disponible !== null &&
                              it.stock_disponible !== undefined && (
                                <div
                                  style={{
                                    fontSize: "10px",
                                    marginTop: "2px",
                                    fontWeight: rowSinStock ? 700 : 500,
                                    color: rowSinStock ? "#b91c1c" : "#666",
                                  }}
                                >
                                  {rowSinStock
                                    ? "Sin stock"
                                    : `Stock: ${it.stock_disponible}`}
                                </div>
                              )}
                          </div>

                          {/* Precio */}
                          <div className="mi-cr-cell mi-cr-cell--center">
                            <input
                              className="nv-cell-input nv-cell-input--right"
                              type="text"
                              inputMode="decimal"
                              value={
                                it.precioFocused
                                  ? it.precioDraft ?? ""
                                  : formatMoneyInputARS(it.precio)
                              }
                              onFocus={(e) => {
                                updateItem(it.uid, {
                                  precioFocused: true,
                                  precioDraft: formatEditableMoney(it.precio),
                                });
                                setTimeout(() => e.target.select(), 0);
                              }}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^\d,.\-]/g, "");
                                updateItem(it.uid, {
                                  precioDraft: cleaned,
                                  precio: parseMoneyInputARS(cleaned),
                                });
                              }}
                              onBlur={() => {
                                const parsed = parseMoneyInputARS(it.precioDraft);
                                updateItem(it.uid, {
                                  precio: parsed,
                                  precioDraft: "",
                                  precioFocused: false,
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              placeholder="$ 0,00"
                              disabled={saving}
                              style={{ width: "100%", padding: "0" }}
                            />
                          </div>

                          {/* IVA % */}
                          <div className="mi-cr-cell mi-cr-cell--center">
                            <select
                              className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                              style={{ width: "100%" }}
                              value={String(it.iva_pct)}
                              onChange={(e) =>
                                updateItem(it.uid, { iva_pct: Number(e.target.value) })
                              }
                              disabled={saving}
                            >
                              {IVA_OPTIONS.map((x) => (
                                <option key={x.value} value={x.value}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* IVA $ */}
                          <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                            {moneyARS(it.iva_monto)}
                          </div>

                          {/* Total */}
                          <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                            {moneyARS(it.total)}
                          </div>

                          {/* Eliminar */}
                          <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                            <button
                              type="button"
                              className="mi-cr-del"
                              onClick={() => removeItem(it.uid)}
                              disabled={saving}
                              title="Eliminar ítem"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer de tabla */}
                  <div className="mi-cr-table__foot">
                    <div className="mi-cr-foot-actions">
                      <button
                        type="button"
                        className="nv-foot-btn"
                        onClick={addItem}
                        disabled={saving}
                      >
                        <span className="nv-foot-btn__icon">
                          <FontAwesomeIcon icon={faPlus} />
                        </span>
                        Agregar ítem
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

                {/* Sidebar */}
                <div className="mi-cr-filters">
                  <aside className="nc-aside">
                    <div className="nc-section">
                      <div className="nc-section-head">
                        <div className="nc-section-dot" />
                        <span>Datos del ingreso</span>
                      </div>

                      <div className="nc-section-body">
                        {/* ⭐ FECHA CON VALIDACIONES ⭐ */}
                        <div className="nc-field" onClick={openDatePicker}>
                          <input
                            ref={fechaRef}
                            className="nc-input"
                            type="date"
                            placeholder=" "
                            value={form.fecha}
                            max={todayISO()}
                            onChange={handleFechaChange}
                            disabled={saving}
                          />
                          <label className="nc-label">Fecha</label>
                        </div>

                        {/* Medios de pago integrados */}
                        <PanelMediosPago
                          mediosFilas={form.medios || []}
                          mediosPago={mediosPago}
                          totalIngreso={resumen.total}
                          onUpdate={updateMedioPago}
                          onRemove={removeMedioPago}
                          onAdd={addMedioPago}
                          saving={saving}
                          showToast={showToast}
                          apiCheckNumero={API_CHECK_NUMERO}
                        />

                        {/* Comprobante */}
                        <div className="mi-uploadCard" style={{ marginTop: 14 }}>
                          <div className="mi-uploadCard__head">
                            <div className="mi-uploadCard__title">Comprobante</div>
                            <div className="mi-uploadCard__sub">
                              Seleccioná, visualizá o quitá el archivo antes de guardar
                            </div>
                          </div>

                          <div className="mi-uploadCard__body">
                            {loadingComprobante ? (
                              <div style={{ fontSize: 13, opacity: 0.75, padding: "8px 0" }}>
                                Cargando comprobante…
                              </div>
                            ) : (
                              <>
                                {/* Archivo ya vinculado */}
                                {mostrarArchivoActual && (
                                  <div className="mi-uploadFile is-filled">
                                    <div className="mi-uploadFile__icon">
                                      <FontAwesomeIcon icon={faFileLines} />
                                    </div>
                                    <div className="mi-uploadFile__meta">
                                      <div
                                        className="mi-uploadFile__name"
                                        title={nombreComprobanteVisible}
                                      >
                                        {nombreComprobanteVisible}
                                      </div>

                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        marginLeft: "auto",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                        onClick={abrirViewer}
                                        disabled={saving}
                                      >
                                        <FontAwesomeIcon icon={faEye} />
                                      </button>
                                      <button
                                        type="button"
                                        className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                        onClick={marcarEliminar}
                                        disabled={saving}
                                      >
                                        <FontAwesomeIcon icon={faTrashCan} />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Archivo nuevo seleccionado */}
                                {archivoNuevo && (
                                  <div
                                    className="mi-uploadFile is-filled"
                                    style={{ marginTop: mostrarArchivoActual ? 10 : 0 }}
                                  >
                                    <div className="mi-uploadFile__icon">
                                      <FontAwesomeIcon icon={faFileLines} />
                                    </div>
                                    <div className="mi-uploadFile__meta">
                                      <div
                                        className="mi-uploadFile__name"
                                        title="Comprobante adjunto"
                                      >
                                        Comprobante adjunto
                                      </div>

                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        marginLeft: "auto",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                        onClick={abrirViewer}
                                        disabled={saving}
                                      >
                                        <FontAwesomeIcon icon={faEye} />
                                      </button>
                                      <button
                                        type="button"
                                        className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                        onClick={quitarArchivoNuevo}
                                        disabled={saving}
                                      >
                                        <FontAwesomeIcon icon={faTrashCan} />
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Sin comprobante */}
                                {!mostrarArchivoActual && !archivoNuevo && (
                                  <div className="mi-uploadFile is-empty">
                                    <div className="mi-uploadFile__meta">
                                      <div className="mi-uploadFile__size">
                                        No hay comprobante seleccionado
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Restaurar comprobante */}
                                {marcarEliminarComprobante && !archivoNuevo && (
                                  <div
                                    style={{
                                      marginTop: 10,
                                      display: "flex",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                      onClick={restaurarComprobanteActual}
                                      disabled={saving}
                                    >
                                      Restaurar comprobante actual
                                    </button>
                                  </div>
                                )}

                                {/* Seleccionar / reemplazar */}
                                <div className="mi-uploadBar" style={{ marginTop: 12 }}>
                                  <input
                                    ref={inputFileRef}
                                    type="file"
                                    accept="image/*,application/pdf,.pdf"
                                    className="mi-uploadBar__input"
                                    onChange={seleccionarArchivo}
                                    disabled={saving}
                                    style={{ display: "none" }}
                                  />
                                  <button
                                    type="button"
                                    className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                                    onClick={() => inputFileRef.current?.click()}
                                    disabled={saving}
                                  >
                                    {archivoNuevo || mostrarArchivoActual
                                      ? "Reemplazar archivo"
                                      : "Seleccionar archivo"}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </aside>

                  {/* Acciones */}
                  <div className="nc-actions mi-cr-filters__actions mi-cr-filters__actions--sticky">
                    <button
                      type="submit"
                      disabled={saving}
                      className="mit-btn mit-btn--solid mit-btn--block"
                    >
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                    <button
                      type="button"
                      onClick={cerrar}
                      disabled={saving}
                      className="mit-btn mit-btn--ghost mit-btn--block"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Modal nueva descripción */}
      {openNuevaDescripcionModal && (
        <ModalNuevaDescripcion
          open={openNuevaDescripcionModal}
          onClose={() => setOpenNuevaDescripcionModal(false)}
          onSave={handleGuardarNuevaDescripcion}
          dark={dark}
        />
      )}

      {/* Viewer de comprobante */}
      <ModalVerComprobante
        open={openViewer}
        url={viewerData.url}
        mime={viewerData.mime}
        title={viewerData.title}
        onClose={cerrarViewer}
      />
    </>,
    document.body
  );
}
