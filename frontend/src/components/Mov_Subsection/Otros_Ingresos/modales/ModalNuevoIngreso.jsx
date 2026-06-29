import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filtrarMediosPagoPorPlan } from "../../_shared/planMediosPago";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faFileInvoiceDollar, faEye, faTrash, faUpload, faMoneyCheckDollar, faCheck } from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import BASE_URL from "../../../../config/config";
import ModalNuevoCheque from "../../../Global/Modales/ModalNuevoCheque.jsx";
import ModalNuevaDescripcion from "./ModalNuevaDescripcion.jsx";
import ModalVerComprobante from "../../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";

// ─── Constantes ────────────────────────────────────────────────────────────────
const NULL_OPTION = "";
const NOMBRE_COMPROBANTE_GENERICO = "Comprobante adjunto";
const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
  { label: "27 %", value: 27 },
];

// ─── Helpers generales ─────────────────────────────────────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeStr(v) {
  return String(v ?? "").trim();
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
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m)
    return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  return s;
}
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
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

// ─── Helpers de listas ─────────────────────────────────────────────────────────
function getDetalleId(d) {
  const c =
    d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ??
    d?.id_categoria_ingreso ?? d?.idCategoriaIngreso ?? d?.categoria_ingreso_id ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getMedioPagoId(c) {
  const cand = c?.id ?? c?.id_medio_pago ?? c?.idMedioPago ?? c?.medio_pago_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function optionLabel(x) {
  return safeStr(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? "");
}
function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}
function getSavedMovimientoIdFromResponse(data, init = null) {
  for (const c of [
    data?.id_movimiento, data?.movimiento_id, data?.id,
    data?.ingreso?.id_movimiento, data?.ingreso?.id,
    data?.otro_ingreso?.id_movimiento, data?.otro_ingreso?.id,
    init?.id_movimiento, init?.id,
  ]) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") || localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") || localStorage.getItem("X-Session") || "";
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const c = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(c))) idUsuario = Number(c);
  } catch {}
  return { sessionKey, token, idUsuario, idUsuarioMaster: idUsuario };
}
function buildAuthHeaders(isJson = true) {
  const { sessionKey, token } = getAuthInfo();
  const h = {};
  if (isJson) h["Content-Type"] = "application/json";
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor.`);
  }
  if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
  return data;
}
async function apiPostForm(url, fd) {
  return await parseJsonOrThrow(await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(false),
    body: fd,
  }));
}

// ─── Normalización de listas ───────────────────────────────────────────────────
function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src?.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);
  const pickExplicitArray = (keys) => {
    for (const k of keys) {
      if (Array.isArray(l?.[k])) return l[k];
    }
    return [];
  };

  const medios_pago =
    pick("medios_pago").length ? pick("medios_pago") :
    pick("mediosPago").length ? pick("mediosPago") :
    pick("medios").length ? pick("medios") : [];

  // IMPORTANTE:
  // En las listas globales, `detalles` pertenece al stock (`stock_productos`).
  // Otros ingresos debe trabajar exclusivamente con la tabla `detalles`, que llega
  // por las claves específicas `detalles_ingresos` / variantes. Si esa tabla está
  // vacía, el autocompletado debe quedar vacío y permitir crear una descripción,
  // nunca caer a productos de stock.
  const detalles = pickExplicitArray([
    "detalles_ingresos",
    "detallesIngresos",
    "detalles_ingreso",
    "detallesIngreso",
  ]);

  return { medios_pago, detalles };
}

// ─── Detección de cheque desde medio de pago ───────────────────────────────────
function detectChequeTipo(nombre) {
  const s = normalizeText(nombre);
  if (!s) return null;
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq")) return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}

// ─── Builders de filas vacías ──────────────────────────────────────────────────
function buildEmptyRow() {
  return {
    id: uid(),
    id_detalle: NULL_OPTION,
    detalle: "",
    cantidad: 1,
    precio: 0,
    precioDraft: "",
    precioFocused: false,
    ivaPct: 0,
    stock_disponible: null,
    sinStock: false,
  };
}
function buildEmptyMedioPago() {
  return {
    id: uid(),
    id_medio_pago: NULL_OPTION,
    monto: 0,
    montoDraft: "",
    montoFocused: false,
    cheque: null,
    id_movimiento_medio_pago: null,
    id_cheque: null,
  };
}

// ─── Subcomponente: resumen visual de un cheque cargado ────────────────────────
function ChequeResumen({ cheque, tipoCheque }) {
  if (!cheque) return null;
  const esEcheq = tipoCheque === "echeq";
  return (
    <div className="nc-cheques-list">
      <div className={`nc-cheque-item nc-cheque-item--selected${esEcheq ? " nc-cheque-item--echeq" : ""}`}>
        <div className="nc-cheque-main">
          <div className="nc-cheque-top">
            <span className="nc-cheque-number">N° {safeText(cheque?.numero_cheque)}</span>
            {esEcheq && <span className="nc-cheque-badge nc-cheque-badge--echeq">eCheq</span>}
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
          className={`nc-cheque-check-icon nc-cheque-check-icon--corner${
            esEcheq ? " nc-cheque-check-icon--echeq" : " nc-cheque-check-icon--cheque"
          }`}
        >
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponente: fila de medio de pago ──────────────────────────────────────
function MedioPagoRow({
  row,
  mediosPagoList,
  totalIngreso,
  sumaMediosPago,
  onUpdate,
  onRemove,
  saving,
  showToast,
  apiCheckNumero,
}) {
  const [openChequeModal, setOpenChequeModal] = useState(false);

  const mpSeleccionado = useMemo(
    () =>
      mediosPagoList.find(
        (x) => String(getMedioPagoId(x) ?? "") === String(row.id_medio_pago ?? "")
      ) || null,
    [mediosPagoList, row.id_medio_pago]
  );

  const tipoCheque = useMemo(
    () => detectChequeTipo(mpSeleccionado?.nombre || ""),
    [mpSeleccionado]
  );
  const esCheque = tipoCheque !== null;

  const montoActual = esCheque && row.cheque
    ? safeNumber(row.cheque?.importe)
    : safeNumber(row.monto);

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - montoActual);
    return Math.max(0, safeNumber(totalIngreso) - sumaOtros);
  }, [sumaMediosPago, totalIngreso, montoActual]);

  const puedeCompletarRestante = !saving && !esCheque && totalIngreso > 0 && restanteParaEstaFila > 0.009;

  const handleChangeMedio = useCallback(
    (val) => {
      const mp = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(val));
      const tipo = detectChequeTipo(mp?.nombre || "");
      onUpdate(row.id, {
        id_medio_pago: val,
        monto: tipo === null ? safeNumber(row.monto) : safeNumber(row.cheque?.importe),
        montoDraft: "",
        montoFocused: false,
        cheque: tipo === null ? null : row.cheque,
      });
    },
    [mediosPagoList, onUpdate, row.id, row.monto, row.cheque]
  );

  const handleSaveCheque = useCallback(
    (datosCheque) => {
      const cheque = {
        ...datosCheque,
        tipo: tipoCheque || "cheque",
        archivo_nombre:
          datosCheque?.archivo_nombre ||
          (datosCheque?.archivo instanceof File ? datosCheque.archivo.name : ""),
      };
      onUpdate(row.id, {
        cheque,
        monto: safeNumber(cheque.importe),
        montoDraft: "",
        montoFocused: false,
      });
      setOpenChequeModal(false);
      showToast?.(
        "exito",
        `${tipoCheque === "echeq" ? "eCheq" : "Cheque"} ${cheque.numero_cheque || ""} cargado.`);
    },
    [onUpdate, row.id, showToast, tipoCheque]
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
        headers: buildAuthHeaders(false),
      });
      const data = await parseJsonOrThrow(res);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo verificar el número del cheque.");
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
            {mediosPagoList.map((x) => {
              const idMp = getMedioPagoId(x);
              return (
                <option key={idMp ?? x?.nombre ?? uid()} value={idMp != null ? String(idMp) : ""}>
                  {String(x?.nombre ?? "").trim() || "Medio"}
                </option>
              );
            })}
          </select>
          <label className={`nc-label${row.id_medio_pago && row.id_medio_pago !== "" ? " nc-label--up" : ""}`}>
            Medio de pago
          </label>
        </div>
      </div>

      {/* Monto */}
      <div className="nc-mp-row nc-mp-row--monto">
        <div className="nc-field nc-mp-monto-field" style={{ position: "relative" }}>
          <input
            className="nc-input nc-mp-monto-input"
            type="text"
            inputMode="decimal"
            value={row.montoFocused ? row.montoDraft ?? "" : formatMoneyInputARS(montoActual)}
            onFocus={(e) => {
              if (saving || (esCheque && !!row.cheque)) return;
              onUpdate(row.id, {
                montoFocused: true,
                montoDraft: formatEditableMoney(montoActual),
              });
              setTimeout(() => e.target.select(), 0);
            }}
            onChange={(e) => {
              if (saving || (esCheque && !!row.cheque)) return;
              const c = e.target.value.replace(/[^\d,.\-]/g, "");
              onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) });
            }}
            onBlur={() => {
              if (saving || (esCheque && !!row.cheque)) return;
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false });
            }}
            onKeyDown={(e) => {
              if (saving || (esCheque && !!row.cheque)) return;
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
                onUpdate(row.id, { monto: restanteParaEstaFila, montoDraft: "", montoFocused: false })
              }
              disabled={!puedeCompletarRestante}
              title="Completar importe restante"
            >
              ↓ Rest.
            </button>
          )}
          <button
            type="button"
            className="nc-mp-del-btn"
            onClick={() => onRemove(row.id)}
            disabled={saving}
            title="Quitar"
          >
            ×
          </button>
        </div>
      </div>

      {/* Cheque */}
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
  mediosPagoList,
  totalIngreso,
  onUpdate,
  onRemove,
  onAdd,
  saving,
  showToast,
  apiCheckNumero,
}) {
  const filas =
    Array.isArray(mediosFilas) && mediosFilas.length ? mediosFilas : [buildEmptyMedioPago()];

  const sumaMediosPago = useMemo(
    () =>
      filas.reduce((a, r) => {
        const mpObj = mediosPagoList.find(
          (x) => String(getMedioPagoId(x) ?? "") === String(r.id_medio_pago ?? "")
        );
        const tipoCheque = detectChequeTipo(String(mpObj?.nombre ?? "").trim());
        const monto =
          tipoCheque !== null && r.cheque ? safeNumber(r.cheque.importe) : safeNumber(r.monto);
        return a + monto;
      }, 0),
    [filas, mediosPagoList]
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
          mediosPagoList={mediosPagoList}
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
          <span className="nc-mp-totals-falta">Pendiente: {moneyARS(diferenciaRestante)}</span>
        )}
        {diferenciaRestante <= 0.01 && sumaMediosPago > 0 && (
          <span className="nc-mp-totals-ok">✓ Cobro completo</span>
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
export default function ModalNuevoIngreso({
  open,
  mode = "create",
  initialData = null,
  lists,
  onClose,
  onToast,
  onSubmit,
  onSaved,
}) {
  const API_UPLOAD = `${BASE_URL}/api.php?action=otros_ingresos_comprobantes_vincular_movimiento_upload`;
  const API_CHEQUES_GUARDAR = `${BASE_URL}/api.php?action=mov_global_cheques_guardar`;
  const API_DETALLES_CREAR = `${BASE_URL}/api.php?action=otros_ingresos_detalles_crear`;
  const API_CHECK_NUMERO = `${BASE_URL}/api.php?action=mov_global_cheques_obtener&modo=verificar_numero`;

  const showToast = useCallback(
    (tipo, mensaje) => onToast?.(tipo, mensaje),
    [onToast]
  );

  const [dark, setDark] = useState(isTemaOscuro);
  const [saving, setSaving] = useState(false);
  const [fecha, setFecha] = useState(todayISO);
  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [mediosFilas, setMediosFilas] = useState(() => [buildEmptyMedioPago()]);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);
  const [openViewer, setOpenViewer] = useState(false);
  const [viewerData, setViewerData] = useState({ url: "", mime: "", title: NOMBRE_COMPROBANTE_GENERICO });
  const [openNuevaDescripcionModal, setOpenNuevaDescripcionModal] = useState(false);
  const [currentRowIdForNewDesc, setCurrentRowIdForNewDesc] = useState(null);

  const rowsContainerRef = useRef(null);
  const [hasScroll, setHasScroll] = useState(false);
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);
  const inputFileRef = useRef(null);

  const localLists = useMemo(() => normalizeLists(lists), [lists]);
  const mediosPagoList = useMemo(
    () => filtrarMediosPagoPorPlan(Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );
  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );
  const enhancedDetallesList = useMemo(
    () => [
      { id: "new_option", __isNewOption: true, nombre: "+ Agregar nueva descripción" },
      ...detallesList,
    ],
    [detallesList]
  );

  // Tema oscuro
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update);
    if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  // Bloqueo de scroll del body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key !== "Escape" || saving) return;

      // Si está abierto ModalNuevoCheque, este modal padre NO debe cerrarse.
      // El Escape lo maneja únicamente el modal superior.
      if (document.body.classList.contains("modal-nuevo-cheque-open")) {
        return;
      }

      if (openViewer || openNuevaDescripcionModal) return;

      e.preventDefault();
      e.stopPropagation();


      onClose?.();
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, onClose, saving, openViewer, openNuevaDescripcionModal]);

  // Reset al abrir
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    if (!wasOpen && open) {
      setFecha(safeStr(initialData?.fecha).slice(0, 10) || todayISO());
      setRows([buildEmptyRow()]);
      setMediosFilas([buildEmptyMedioPago()]);
      setArchivoAdjunto(null);
      setOpenViewer(false);
      setViewerData({ url: "", mime: "", title: NOMBRE_COMPROBANTE_GENERICO });
      setSaving(false);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, initialData]);

  // Scroll detection
  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;
    const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => { ro.disconnect(); window.removeEventListener("resize", check); };
  }, [open, rows]);

  // ─── Handlers de filas de ítems ──────────────────────────────────────────────
  const updateRow = useCallback(
    (id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );
  const addRow = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback(
    (id) =>
      setRows((p) => {
        const n = p.filter((r) => r.id !== id);
        return n.length ? n : [buildEmptyRow()];
      }),
    []
  );

  // ─── Handlers de medios de pago ──────────────────────────────────────────────
  const updateMedioPago = useCallback(
    (id, patch) => setMediosFilas((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );
  const addMedioPago = useCallback(() => setMediosFilas((p) => [...p, buildEmptyMedioPago()]), []);
  const removeMedioPago = useCallback(
    (id) =>
      setMediosFilas((p) => {
        const next = p.filter((x) => x.id !== id);
        return next.length ? next : [buildEmptyMedioPago()];
      }),
    []
  );

  // ─── Descripción nueva ───────────────────────────────────────────────────────
  const handleCrearNuevaDescripcion = useCallback((rowId) => {
    setCurrentRowIdForNewDesc(rowId);
    setOpenNuevaDescripcionModal(true);
  }, []);

  const handleGuardarNuevaDescripcion = useCallback(
    async (nombreDescripcion) => {
      try {
        const { sessionKey, token, idUsuario, idUsuarioMaster } = getAuthInfo();
        const headers = { "Content-Type": "application/json" };
        if (sessionKey) headers["X-Session"] = sessionKey;
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(API_DETALLES_CREAR, {
          method: "POST",
          headers,
          body: JSON.stringify({ nombre: nombreDescripcion, idUsuario, idUsuarioMaster }),
        });
        const data = await parseJsonOrThrow(response);
        if (data.exito && data.detalle) {
          const precio = safeNumber(data.detalle?.precio || 0);
          updateRow(currentRowIdForNewDesc, {
            id_detalle: String(data.detalle.id_detalle || data.detalle.id || ""),
            detalle: data.detalle.nombre || nombreDescripcion,
            precio,
            stock_disponible: null,
            sinStock: false,
            cantidad: 1,
          });
          showToast("exito", "Descripción creada y seleccionada correctamente.");
          return true;
        }
        throw new Error(data.mensaje || "Error al crear la descripción");
      } catch (error) {
        showToast("error", error.message || "No se pudo crear la descripción.");
        return false;
      }
    },
    [API_DETALLES_CREAR, currentRowIdForNewDesc, updateRow, showToast]
  );

  const handleSelectDetalle = useCallback(
    (item, rowId) => {
      if (item && item.__isNewOption) {
        handleCrearNuevaDescripcion(rowId);
        return;
      }
      const precio = safeNumber(item?.precio || 0);
      updateRow(rowId, {
        id_detalle: String(getDetalleId(item) ?? ""),
        detalle: optionLabel(item),
        precio,
        stock_disponible: null,
        sinStock: false,
        cantidad: 1,
      });
    },
    [updateRow, showToast, handleCrearNuevaDescripcion]
  );

  const handleCantidadChange = useCallback(
    (rowId, newCantidad) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;
      let cantidadFinal = newCantidad === "" ? "" : Number(newCantidad);
      if (typeof cantidadFinal === "number" && cantidadFinal < 0) cantidadFinal = 0;
      updateRow(rowId, { cantidad: cantidadFinal });
    },
    [rows, updateRow, showToast]
  );

  // ─── Cálculos de totales ─────────────────────────────────────────────────────
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
      subtotal: rowsCalc.reduce((a, r) => a + safeNumber(r.subtotal), 0),
      iva: rowsCalc.reduce((a, r) => a + safeNumber(r.ivaMonto), 0),
      total: rowsCalc.reduce((a, r) => a + safeNumber(r.total), 0),
    }),
    [rowsCalc]
  );

  const sumaMediosPago = useMemo(
    () => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0),
    [mediosFilas]
  );
  const diferenciaRestante = useMemo(
    () => Math.max(0, resumen.total - sumaMediosPago),
    [resumen.total, sumaMediosPago]
  );

  // ─── Comprobante ─────────────────────────────────────────────────────────────
  const abrirViewer = useCallback(() => {
    if (!archivoAdjunto) return;
    setViewerData({
      url: URL.createObjectURL(archivoAdjunto),
      mime: archivoAdjunto.type || "application/octet-stream",
      title: NOMBRE_COMPROBANTE_GENERICO,
    });
    setOpenViewer(true);
  }, [archivoAdjunto]);

  const cerrarViewer = useCallback(() => {
    if (viewerData?.url?.startsWith("blob:")) URL.revokeObjectURL(viewerData.url);
    setOpenViewer(false);
    setViewerData({ url: "", mime: "", title: NOMBRE_COMPROBANTE_GENERICO });
  }, [viewerData]);

  const handleArchivoAdjuntoSeleccionado = useCallback((e) => {
    const file = e.target.files?.[0] || null;

    if (!file) return;

    if (!isAllowedComprobanteFile(file)) {
      showToast("advertencia", "Archivo inválido. Solo se permiten imágenes o archivos PDF.");
      setArchivoAdjunto(null);

      if (inputFileRef.current) inputFileRef.current.value = "";

      return;
    }

    setArchivoAdjunto(file);
  }, [showToast]);

  // ⭐ FUNCIÓN DE VALIDACIÓN DE FECHA PARA EL onChange ⭐
  const handleFechaChange = useCallback((e) => {
    const nuevaFecha = e.target.value;
    
    if (nuevaFecha && nuevaFecha > todayISO()) {
      showToast("advertencia", "No podés seleccionar una fecha posterior al día actual.");
      return;
    }
    
    setFecha(nuevaFecha);
  }, [showToast]);

  // ─── Validación ──────────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    if (!safeStr(fecha)) return { ok: false, msg: "Falta la fecha." };
    
    // ⭐ VALIDACIÓN DE FECHA FUTURA ⭐
    if (fecha > todayISO()) {
      return { ok: false, msg: "La fecha no puede ser posterior al día actual." };
    }
    
    for (let i = 0; i < mediosFilas.length; i++) {
      const mp = mediosFilas[i];
      const tieneMedio = !!mp.id_medio_pago && mp.id_medio_pago !== NULL_OPTION;
      const montoManual = safeNumber(mp.monto);
      const montoCheque = safeNumber(mp.cheque?.importe);
      const tieneMonto = montoManual > 0 || montoCheque > 0;
      const tieneCheque = !!mp.cheque;

      // Para Otros Ingresos el cobro inicial es opcional:
      // se puede crear pendiente, parcial o totalmente cobrado.
      // Si la fila no tiene importe/cheque, se ignora aunque haya quedado un medio seleccionado.
      if (!tieneMonto && !tieneCheque) continue;

      if (!tieneMedio)
        return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
      const medio = mediosPagoList.find(
        (x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago)
      );
      const tipoCheque = detectChequeTipo(medio?.nombre || "");
      if (tipoCheque) {
        if (!mp.cheque)
          return {
            ok: false,
            msg: `Medio de pago ${i + 1}: debés cargar el ${tipoCheque === "echeq" ? "eCheq" : "cheque"}.`,
          };
        if (montoCheque <= 0)
          return { ok: false, msg: `Medio de pago ${i + 1}: el importe del cheque es inválido.` };
      } else if (montoManual <= 0) {
        return { ok: false, msg: `Medio de pago ${i + 1}: el monto debe ser mayor a 0.` };
      }
    }

    // Única validación del cobro inicial: no puede superar el total del ingreso.
    // No se exige que cubra el total, porque el saldo puede quedar pendiente.
    if (sumaMediosPago > resumen.total + 0.05 && resumen.total > 0)
      return {
        ok: false,
        msg: `La suma de los medios de pago (${moneyARS(sumaMediosPago)}) no puede superar el total del ingreso (${moneyARS(resumen.total)}).`,
      };

    const problems = [];
    rowsCalc.forEach((r, i) => {
      const touched =
        safeStr(r.detalle) !== "" ||
        String(r.id_detalle || "").trim() !== "" ||
        safeNumber(r.cantidad) !== 0 ||
        safeNumber(r.precio) !== 0;
      if (!touched) return;
      const issues = [];
      if (!safeStr(r.detalle)) issues.push("falta la descripción");
      if (!(safeNumber(r.cantidad) > 0)) issues.push("la cantidad debe ser > 0");
      if (!(safeNumber(r.precio) > 0)) issues.push("el importe debe ser > 0");
      if (!(safeNumber(r.total) > 0)) issues.push("el total queda en 0");
      if (issues.length) problems.push(`Fila ${i + 1}: ${issues.join(", ")}.`);
    });
    const usable = rowsCalc.filter(
      (r) =>
        safeStr(r.detalle) !== "" &&
        Number(r.id_detalle || 0) > 0 &&
        safeNumber(r.cantidad) > 0 &&
        safeNumber(r.precio) > 0 &&
        safeNumber(r.total) > 0
    );
    if (!usable.length)
      return {
        ok: false,
        msg: problems.length
          ? `No hay filas válidas. ${problems.slice(0, 2).join(" ")}${problems.length > 2 ? ` (y ${problems.length - 2} más)` : ""}`
          : "Cargá al menos 1 fila válida (Descripción + Cantidad + Importe).",
      };
    if (problems.length) {
      return {
        ok: false,
        msg: `Completá o eliminá las filas incompletas antes de guardar. ${problems.slice(0, 2).join(" ")}${problems.length > 2 ? ` (y ${problems.length - 2} más)` : ""}`,
      };
    }
    return { ok: true, usable };
  }, [fecha, mediosFilas, mediosPagoList, sumaMediosPago, resumen.total, rowsCalc]);

  // ─── Build payload ────────────────────────────────────────────────────────────
  const buildPayload = useCallback(() => {
    const usableRows = rowsCalc.filter(
      (r) =>
        safeStr(r.detalle) !== "" &&
        Number(r.id_detalle || 0) > 0 &&
        safeNumber(r.cantidad) > 0 &&
        safeNumber(r.precio) > 0 &&
        safeNumber(r.total) > 0
    );
    const detalleFinal =
      usableRows.length === 1
        ? safeStr(usableRows[0].detalle)
        : usableRows.map((x) => safeStr(x.detalle)).filter(Boolean).join(" | ");
    const subtotalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.subtotal), 0);
    const ivaFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.ivaMonto), 0);
    const totalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.total), 0);
    const mediosPayload = mediosFilas
      .filter((mp) => Number(mp.id_medio_pago || 0) > 0 && safeNumber(mp.cheque?.importe ?? mp.monto) > 0)
      .map((mp, index) => ({
        id_medio_pago: Number(mp.id_medio_pago),
        monto: safeNumber(mp.cheque?.importe ?? mp.monto),
        cheque_tipo: mp.cheque?.tipo || null,
        original_index: index,
      }));
    return {
      fecha: safeStr(fecha).slice(0, 10),
      id_medio_pago: mediosPayload[0]?.id_medio_pago || null,
      medio_pago_nombre: optionLabel(
        mediosPagoList.find(
          (x) => Number(getMedioPagoId(x)) === Number(mediosPayload[0]?.id_medio_pago)
        )
      ),
      medios_pago: mediosPayload,
      detalle: detalleFinal,
      descripcion: detalleFinal,
      concepto: detalleFinal,
      cantidad: usableRows.length === 1 ? safeNumber(usableRows[0].cantidad) : 1,
      precio:
        usableRows.length === 1 ? safeNumber(usableRows[0].precio) : safeNumber(subtotalFinal),
      subtotal: safeNumber(subtotalFinal),
      iva_monto: safeNumber(ivaFinal),
      monto_total: safeNumber(totalFinal),
      total: safeNumber(totalFinal),
      total_general: safeNumber(totalFinal),
      items: usableRows.map((x, idx) => ({
        orden: idx + 1,
        id_detalle: Number(x.id_detalle || 0) || null,
        detalle: safeStr(x.detalle),
        descripcion: safeStr(x.detalle),
        concepto: safeStr(x.detalle),
        cantidad: safeNumber(x.cantidad),
        precio: safeNumber(x.precio),
        iva_pct: safeNumber(x.ivaPct),
        subtotal: safeNumber(x.subtotal),
        iva_monto: safeNumber(x.ivaMonto),
        total: safeNumber(x.total),
      })),
    };
  }, [rowsCalc, fecha, mediosFilas, mediosPagoList]);

  // ─── Side effects de guardado ─────────────────────────────────────────────────
  const subirArchivo = useCallback(
    async (idMovimiento, archivo) => {
      if (!archivo || !idMovimiento) return null;
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", "OTRO_INGRESO");
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("force_replace", "1");
      return await apiPostForm(API_UPLOAD, fd);
    },
    [API_UPLOAD]
  );

  const guardarChequeEnBackend = useCallback(
    async (idMovimiento, medioDetalle, chequeData) => {
      if (!chequeData) return null;
      const fd = new FormData();
      const { token, sessionKey, idUsuario, idUsuarioMaster } = getAuthInfo();
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("id_movimiento_medio_pago", String(Number(medioDetalle?.id_movimiento_medio_pago || 0)));
      fd.append("id_medio_pago", String(Number(medioDetalle?.id_medio_pago || 0)));
      fd.append("tipo", chequeData.tipo || chequeData.tipo_cheque || "cheque");
      fd.append("fecha_emision", chequeData.fecha_emision || todayISO());
      fd.append("emisor", chequeData.emisor || "");
      fd.append("numero_cheque", chequeData.numero_cheque || "");
      fd.append("importe", String(chequeData.importe || 0));
      fd.append("fecha_pago", chequeData.fecha_pago || todayISO());
      fd.append("observaciones", chequeData.observaciones || "");
      fd.append("idUsuario", String(idUsuario || 0));
      fd.append("idUsuarioMaster", String(idUsuarioMaster || 0));
      if (chequeData.archivo instanceof File)
        fd.append(
          "archivo",
          chequeData.archivo,
          chequeData.archivo_nombre || chequeData.archivo.name || "adjunto"
        );
      const headers = {};
      if (sessionKey) headers["X-Session"] = sessionKey;
      if (token) headers.Authorization = `Bearer ${token}`;
      return await parseJsonOrThrow(
        await fetch(API_CHEQUES_GUARDAR, { method: "POST", headers, body: fd })
      );
    },
    [API_CHEQUES_GUARDAR]
  );

  // ─── Submit ───────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (saving) return;
    if (typeof onSubmit !== "function") {
      showToast("error", "Falta la función de guardado del modal.");
      return;
    }
    const v = validate();
    if (!v.ok) { showToast("advertencia", v.msg || "Faltan datos."); return; }

    if (archivoAdjunto && !isAllowedComprobanteFile(archivoAdjunto)) {
      showToast("advertencia", "Archivo inválido. Solo se permiten imágenes o archivos PDF.");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      const data = await onSubmit(payload, mode === "edit");
      const idMovimientoFinal = getSavedMovimientoIdFromResponse(data, initialData);
      if (!idMovimientoFinal)
        throw new Error("El backend no devolvió un id_movimiento válido.");

      let warningArchivo = "";
      if (archivoAdjunto) {
        try {
          const r = await subirArchivo(idMovimientoFinal, archivoAdjunto);
          if (!r?.exito) warningArchivo = r?.mensaje || "No se pudo vincular el archivo.";
        } catch (e) {
          warningArchivo = e?.message || "No se pudo vincular el archivo.";
        }
      }

      const mediosDetalle = Array.isArray(data?.medios_pago_detalle) ? data.medios_pago_detalle : [];
      for (let index = 0; index < mediosFilas.length; index++) {
        const row = mediosFilas[index];
        if (!row.cheque) continue;
        const detalleMp =
          mediosDetalle.find((x) => Number(x?.original_index) === index) ||
          mediosDetalle[index] ||
          null;
        try {
          await guardarChequeEnBackend(idMovimientoFinal, detalleMp, row.cheque);
        } catch (eCheque) {
          showToast(
            "advertencia",
            `Ingreso guardado, pero no se pudo guardar un cheque: ${eCheque?.message || "error"}`);
        }
      }

      if (warningArchivo)
        showToast(
          "advertencia",
          `Ingreso guardado, pero el archivo no se pudo vincular: ${warningArchivo}`);

      await onSaved?.({ ...(data || {}), id_movimiento: idMovimientoFinal });
    } catch (e) {
      showToast("error", e?.message || "No se pudo guardar el ingreso.");
    } finally {
      setSaving(false);
    }
  }, [
    saving, onSubmit, validate, buildPayload, mode, onSaved,
    showToast, initialData, archivoAdjunto, subirArchivo, mediosFilas, guardarChequeEnBackend,
  ]);

  const btnLabel = saving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Guardar ingreso";

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
          {/* Header */}
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faPlus} />
            </div>
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">
                {mode === "edit" ? "Editar Ingreso" : "Nuevo Ingreso"}
              </h2>
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

          {/* Content */}
          <div className="mi-modal__content">
            <div className="mi-cr-grid">
              {/* Tabla de ítems */}
              <section className="mi-cr-table">
                <div className="mi-cr-table__head">
                  <div style={{ paddingLeft: 10 }}>Descripción</div>
                  <div>Cant.</div>
                  <div className="right">Importe</div>
                  <div>IVA %</div>
                  <div className="right">IVA $</div>
                  <div className="right">Total</div>
                  <div />
                </div>

                <div
                  ref={rowsContainerRef}
                  className={`mi-cr-table__rows${hasScroll ? " has-scroll" : ""}`}
                >
                  {rowsCalc.map((r) => {
                    return (
                      <div
                        key={r.id}
                        className="mi-cr-row"
                      >
                        <div className="mi-cr-cell mi-cr-cell--detalle">
                          <GlobalAutocomplete
                            value={r.detalle}
                            onChange={(val) =>
                              updateRow(r.id, {
                                detalle: val,
                                id_detalle: NULL_OPTION,
                                stock_disponible: null,
                                sinStock: false,
                              })
                            }
                            onSelect={(item) => handleSelectDetalle(item, r.id)}
                            options={enhancedDetallesList}
                            getOptionLabel={(d) => optionLabel(d)}
                            getOptionValue={(d) => String(getDetalleId(d) ?? optionLabel(d))}
                            placeholder="Escribí o buscá una descripción…"
                            disabled={saving}
                            showAllOnFocus={false}
                            maxItems={18}
                            inputClassName="nv-cell-input"
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <input
                            className="nv-cell-input nv-cell-input--center"
                            type="number"
                            min="1"
                            step="1"
                            value={r.cantidad}
                            onChange={(e) =>
                              handleCantidadChange(
                                r.id,
                                e.target.value === "" ? "" : Number(e.target.value)
                              )
                            }
                            disabled={saving}
                            placeholder=""
                            title=""
                            style={{ width: "100%" }}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--right">
                          <input
                            className="nv-cell-input nv-cell-input--right"
                            type="text"
                            inputMode="decimal"
                            value={
                              r.precioFocused
                                ? r.precioDraft ?? ""
                                : formatMoneyInputARS(r.precio)
                            }
                            onFocus={(e) => {
                              updateRow(r.id, {
                                precioFocused: true,
                                precioDraft: formatEditableMoney(r.precio),
                              });
                              setTimeout(() => e.target.select(), 0);
                            }}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^\d,.\-]/g, "");
                              updateRow(r.id, {
                                precioDraft: cleaned,
                                precio: parseMoneyInputARS(cleaned),
                              });
                            }}
                            onBlur={() => {
                              const parsed = parseMoneyInputARS(r.precioDraft);
                              updateRow(r.id, {
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
                            style={{ width: "100%" }}
                          />
                        </div>

                        <div className="mi-cr-cell mi-cr-cell--center">
                          <select
                            className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                            value={String(r.ivaPct)}
                            onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
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
                      <div className="nc-field">
                        <input
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={fecha}
                          max={todayISO()}
                          onChange={handleFechaChange}
                          disabled={saving}
                        />
                        <label className="nc-label">Fecha</label>
                      </div>

                      {/* Medios de pago integrados */}
                      <PanelMediosPago
                        mediosFilas={mediosFilas}
                        mediosPagoList={mediosPagoList}
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
                                <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
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
                                    onClick={() => {
                                      setArchivoAdjunto(null);
                                      if (inputFileRef.current) inputFileRef.current.value = "";
                                    }}
                                    disabled={saving}
                                  >
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="mi-uploadFile__meta">
                                <div className="mi-uploadFile__size">No hay comprobante seleccionado</div>
                              </div>
                            )}
                          </div>

                          <div className="mi-uploadBar" style={{ marginTop: 12 }}>
                            <input
                              ref={inputFileRef}
                              type="file"
                              accept="image/*,application/pdf,.pdf"
                              className="mi-uploadBar__input"
                              onChange={handleArchivoAdjuntoSeleccionado}
                              disabled={saving}
                              style={{ display: "none" }}
                            />
                            <button
                              type="button"
                              className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                              onClick={() => inputFileRef.current?.click()}
                              disabled={saving}
                            >
                              {archivoAdjunto ? "Reemplazar archivo" : "Seleccionar archivo"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>

                <div className="nc-actions mi-cr-filters__actions mi-cr-filters__actions--sticky">
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mit-btn--block"
                    onClick={submit}
                    disabled={saving}
                  >
                    {btnLabel}
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
        </div>
      </div>

      {openNuevaDescripcionModal && (
        <ModalNuevaDescripcion
          open={openNuevaDescripcionModal}
          onClose={() => setOpenNuevaDescripcionModal(false)}
          onSave={handleGuardarNuevaDescripcion}
          dark={dark}
        />
      )}

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
