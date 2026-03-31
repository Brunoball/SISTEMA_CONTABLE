import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faFileInvoiceDollar, faMoneyCheckDollar, faCircleNotch } from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import BASE_URL from "../../../../config/config.jsx";

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
    return Number(v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
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
    r?.id_movimiento ??
    r?.idMovimiento ??
    r?.id_mov ??
    r?.id ??
    r?.id_egreso ??
    r?.idEgreso ??
    r?.egreso_id ??
    r?.movimiento_id ??
    r?.id_movimiento_fk ??
    null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSavedMovimientoIdFromResponse(data, initialData = null) {
  const candidates = [
    data?.id_movimiento,
    data?.movimiento_id,
    data?.id,
    data?.egreso?.id_movimiento,
    data?.egreso?.id,
    data?.otro_egreso?.id_movimiento,
    data?.otro_egreso?.id,
    initialData?.id_movimiento,
    initialData?.id,
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
    d?.id ??
    d?.id_detalle ??
    d?.idDetalle ??
    d?.detalle_id ??
    d?.iddetalle ??
    d?.id_categoria_egreso ??
    d?.idCategoriaEgreso ??
    d?.categoria_egreso_id ??
    null;
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
   CHEQUES — helpers calcados de ModalNuevaCompra
========================================================= */
function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const yyyy = m1[1];
    const mm = String(Number(m1[2])).padStart(2, "0");
    const dd = String(Number(m1[3])).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }
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
  const cand =
    detalle?.stock ??
    detalle?.stock_disponible ??
    detalle?.stockDisponible ??
    detalle?.cantidad_stock ??
    detalle?.cantidad ??
    null;
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

  const mediosPago = pick("medios_pago").length
    ? pick("medios_pago")
    : pick("mediosPago").length
    ? pick("mediosPago")
    : pick("medios").length
    ? pick("medios")
    : [];

  const detalles = pick("detalles").length
    ? pick("detalles")
    : pick("categorias_egreso").length
    ? pick("categorias_egreso")
    : pick("categoriasEgreso").length
    ? pick("categoriasEgreso")
    : pick("categorias").length
    ? pick("categorias")
    : [];

  const clasificaciones = pick("clasificaciones").length
    ? pick("clasificaciones")
    : pick("clasificacion").length
    ? pick("clasificacion")
    : [];

  return {
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
    detalles: Array.isArray(detalles) ? detalles : [],
    clasificaciones: Array.isArray(clasificaciones) ? clasificaciones : [],
  };
}

function resolveClasificacionesConfig(clasificacionesList) {
  const arr = Array.isArray(clasificacionesList) ? clasificacionesList : [];
  const parsed = arr
    .map((x) => ({
      id: getClasificacionId(x),
      nombreOriginal: optionLabel(x),
      nombre: normalizeName(optionLabel(x)),
    }))
    .filter((x) => Number.isFinite(Number(x.id)) && Number(x.id) > 0);

  const fijo =
    parsed.find((x) => x.nombre === "COSTO FIJO") ||
    parsed.find((x) => x.nombre.includes("COSTO FIJO")) ||
    null;

  const noFijo =
    parsed.find(
      (x) =>
        x.id !== fijo?.id &&
        (x.nombre === "COSTO VARIABLE" ||
          x.nombre.includes("VARIABLE") ||
          x.nombre.includes("NO ES COSTO FIJO"))
    ) ||
    parsed.find((x) => x.id !== fijo?.id) ||
    null;

  return {
    idCostoFijo: String(fijo?.id ?? 1),
    idNoCostoFijo: String(noFijo?.id ?? 2),
    labelCostoFijo: "Costo fijo",
    labelNoCostoFijo: "No es costo fijo",
  };
}

/* =========================================================
   AUTH
========================================================= */
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  const token = localStorage.getItem("token") || "";
  return { sessionKey, token };
}

function buildAuthHeaders(isJson = true) {
  const { sessionKey, token } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(`Respuesta inválida del servidor. ${preview}`);
  }
  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders(false),
  });
  return await parseJsonOrThrow(res);
}

async function apiPostForm(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(false),
    body: formData,
  });
  return await parseJsonOrThrow(res);
}

/* =========================================================
   ESTILOS clasificación
========================================================= */
const S = {
  clasificacionBox: {
    border: "1px solid rgba(148,163,184,.32)",
    borderRadius: 14,
    padding: "12px 14px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  clasificacionHead: {
    paddingBottom: 10,
    marginBottom: 10,
    borderBottom: "1px solid rgba(148,163,184,.18)",
  },
  clasificacionTitle: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  clasificacionSub: {
    marginTop: 3,
    fontSize: 12,
    color: "var(--mi-muted, #516173)",
    lineHeight: 1.3,
  },
  toggleRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 4,
  },
  toggleOption: (checked, disabled) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: checked
      ? "1.5px solid rgba(0,85,187,.40)"
      : "1.5px solid rgba(148,163,184,.28)",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .16s ease",
    userSelect: "none",
    opacity: disabled ? 0.6 : 1,
  }),
  toggleDot: (checked) => ({
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: checked ? "5px solid #0055BB" : "2px solid rgba(148,163,184,.7)",
    background: checked ? "#fff" : "transparent",
    flexShrink: 0,
    transition: "all .16s ease",
    boxShadow: checked ? "0 0 0 3px rgba(0,85,187,.14)" : "none",
  }),
  toggleLabel: (checked) => ({
    fontSize: 13,
    fontWeight: checked ? 600 : 500,
    color: checked ? "#0A2540" : "var(--mi-muted, #516173)",
    transition: "all .16s ease",
  }),
  toggleBadge: {
    marginLeft: "auto",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    padding: "2px 7px",
    borderRadius: 999,
    background: "rgba(0,85,187,.10)",
    color: "#0055BB",
    border: "1px solid rgba(0,85,187,.18)",
  },
};

/* =========================================================
   ROWS helpers
========================================================= */
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

function buildRowFromData(r) {
  const cantidad = Math.max(1, safeNumber(r?.cantidad || 1));
  const precio = safeNumber(r?.precio ?? r?.importe ?? r?.monto ?? 0);
  const ivaPct = safeNumber(r?.iva_pct ?? r?.ivaPct ?? 0);
  return {
    id: uid(),
    id_detalle: String(getDetalleId(r) ?? ""),
    detalle: safeStr(r?.detalle ?? r?.descripcion ?? r?.concepto),
    cantidad,
    precio,
    precioDraft: "",
    precioFocused: false,
    ivaPct,
    stock_disponible: null,
    sinStock: false,
  };
}

function buildRowsFromInitial(data) {
  const items =
    Array.isArray(data?.items) && data.items.length
      ? data.items
      : Array.isArray(data?.detalles) && data.detalles.length
      ? data.detalles
      : null;

  if (items?.length) {
    return items.map((x) => ({
      id: uid(),
      id_detalle: String(getDetalleId(x) ?? ""),
      detalle: safeStr(x?.detalle ?? x?.descripcion ?? x?.concepto ?? x?.detalle_nombre ?? ""),
      cantidad: Math.max(1, safeNumber(x?.cantidad || 1)),
      precio: safeNumber(x?.precio ?? x?.importe ?? x?.monto ?? 0),
      precioDraft: "",
      precioFocused: false,
      ivaPct: safeNumber(x?.iva_pct ?? x?.ivaPct ?? 0),
      stock_disponible: null,
      sinStock: false,
    }));
  }

  return [buildRowFromData(data)];
}

function describeLineProblem(r, idx1based) {
  const detalle = safeStr(r.detalle);
  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);
  const touched =
    detalle !== "" || String(r.id_detalle || "").trim() !== "" || qty !== 0 || price !== 0;
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
   ChequesCarteraCards — calcado de ModalNuevaCompra
========================================================= */
function ChequesCarteraCards({ cheques, idSeleccionado, onSelect }) {
  if (!cheques.length) return null;

  return (
    <div className="mpr-cheques-cards">
      {cheques.map((ch, idx) => {
        const checked = String(ch?.id_cheque) === String(idSeleccionado);
        return (
          <div
            key={ch?.id_cheque || idx}
            className={`mpr-cheque-card-item ${checked ? "is-checked" : ""}`}
            onClick={() => onSelect(String(ch?.id_cheque || ""))}
            style={{
              border: checked ? "1px solid #0f766e" : "1px solid rgba(0,0,0,.08)",
              borderRadius: 12,
              padding: 10,
              cursor: "pointer",
              marginBottom: 8,
              background: checked ? "rgba(15,118,110,.06)" : "transparent",
            }}
          >
            <div
              className="mpr-cheque-card__top"
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
            >
              <label
                className="mpr-check"
                onClick={(e) => e.stopPropagation()}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="egreso_cheque_cartera"
                  checked={checked}
                  onChange={() => onSelect(String(ch?.id_cheque || ""))}
                />
              </label>
              <span className="mpr-cheque-card__numero" style={{ fontWeight: 700 }}>
                N° {safeText(ch?.numero_cheque)}
              </span>
            </div>

            <div className="mpr-cheque-card__body" style={{ display: "grid", gap: 4 }}>
              <div className="mpr-cheque-card__row">
                <b>Emisor:</b> <span>{safeText(ch?.emisor)}</span>
              </div>
              <div className="mpr-cheque-card__row">
                <b>F. emisión:</b> <span>{safeText(formatFechaDMY(ch?.fecha_emision))}</span>
              </div>
              <div className="mpr-cheque-card__row">
                <b>F. pago:</b> <span>{safeText(formatFechaDMY(ch?.fecha_pago))}</span>
              </div>
            </div>

            <div
              className="mpr-cheque-card__importe"
              style={{ marginTop: 8, fontWeight: 800, textAlign: "right" }}
            >
              {moneyARS(ch?.importe || 0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   MODAL PRINCIPAL
========================================================= */
export default function ModalNuevoEgreso({
  open,
  mode = "create",
  initialData = null,
  lists,
  onClose,
  onToast,
  onSubmit,
  onSaved,
}) {
  const API_UPLOAD = `${BASE_URL}/api.php?action=otros_egresos_comprobantes_vincular_movimiento_upload`;
  const API_CHEQUES_CARTERA = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur),
    [onToast]
  );

  const [dark, setDark] = useState(isTemaOscuro);
  const [saving, setSaving] = useState(false);
  const [fecha, setFecha] = useState(todayISO);
  const [filters, setFilters] = useState({
    id_medio_pago: "",
    id_clasificacion: "",
  });
  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);

  /* ── Estado de cheques en cartera (igual que en Compras) ── */
  const [chequesCartera, setChequesCartera] = useState([]);
  const [loadingCheques, setLoadingCheques] = useState(false);
  const [idChequeSeleccionado, setIdChequeSeleccionado] = useState("");

  const rowsContainerRef = useRef(null);
  const [hasScroll, setHasScroll] = useState(false);
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);
  const fechaInputRef = useRef(null);

  const localLists = useMemo(() => normalizeLists(lists), [lists]);
  const mediosPagoList = useMemo(
    () => (Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );
  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );
  const clasificacionesList = useMemo(
    () => (Array.isArray(localLists.clasificaciones) ? localLists.clasificaciones : []),
    [localLists.clasificaciones]
  );

  const clasificacionConfig = useMemo(
    () => resolveClasificacionesConfig(clasificacionesList),
    [clasificacionesList]
  );

  const isCostoFijoChecked =
    String(filters.id_clasificacion) === String(clasificacionConfig.idCostoFijo);
  const isNoCostoFijoChecked =
    String(filters.id_clasificacion) === String(clasificacionConfig.idNoCostoFijo);

  /* ── Medio de pago seleccionado ── */
  const medioPagoSeleccionado = useMemo(() => {
    const id = Number(filters.id_medio_pago);
    if (!Number.isFinite(id) || id <= 0) return null;
    return mediosPagoList.find((x) => Number(getMedioPagoId(x)) === id) || null;
  }, [filters.id_medio_pago, mediosPagoList]);

  /* ── Detectar si el medio de pago requiere cheque/echeq ── */
  const tipoChequeRequerido = useMemo(
    () => normalizeChequeTipoFromMedio(medioPagoSeleccionado?.nombre || ""),
    [medioPagoSeleccionado]
  );

  const requiereChequeCartera = useMemo(
    () => tipoChequeRequerido === "cheque" || tipoChequeRequerido === "echeq",
    [tipoChequeRequerido]
  );

  const chequeSeleccionado = useMemo(
    () =>
      chequesCartera.find(
        (x) => String(x?.id_cheque) === String(idChequeSeleccionado)
      ) || null,
    [chequesCartera, idChequeSeleccionado]
  );

  /* ── Dark mode observer ── */
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update);
    if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  /* ── Body overflow ── */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* ── Escape key ── */
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose, saving]);

  /* ── Reset al abrir ── */
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const isEdit = mode === "edit";
      const movId = getMovimientoId(initialData);

      setFecha(safeStr(initialData?.fecha).slice(0, 10) || todayISO());
      setFilters({
        id_medio_pago: String(initialData?.id_medio_pago ?? initialData?.medio_pago_id ?? ""),
        id_clasificacion: String(
          initialData?.id_clasificacion ?? initialData?.clasificacion_id ?? ""
        ),
      });
      setRows(
        isEdit && (movId || initialData) ? buildRowsFromInitial(initialData) : [buildEmptyRow()]
      );
      setArchivoAdjunto(null);
      setSaving(false);
      setChequesCartera([]);
      setLoadingCheques(false);
      setIdChequeSeleccionado("");
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, mode, initialData]);

  /* ── Scroll detection ── */
  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;
    const checkScroll = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
    checkScroll();
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    window.addEventListener("resize", checkScroll);
    return () => { ro.disconnect(); window.removeEventListener("resize", checkScroll); };
  }, [open, rows]);

  /* ── Fetch cheques en cartera (calcado de Compras) ── */
  const fetchChequesCartera = useCallback(
    async (tipo) => {
      if (!tipo) {
        setChequesCartera([]);
        setIdChequeSeleccionado("");
        return;
      }
      try {
        setLoadingCheques(true);
        setChequesCartera([]);
        setIdChequeSeleccionado("");

        const sp = new URLSearchParams();
        sp.set("action", "otros_egresos_cheques_cartera_listar");
        sp.set("tipo", tipo);

        const data = await apiGet(`${API_CHEQUES_CARTERA}?${sp.toString()}`);
        setChequesCartera(Array.isArray(data?.cheques) ? data.cheques : []);
      } catch (e) {
        setChequesCartera([]);
        setIdChequeSeleccionado("");
        showToast(
          "error",
          e?.message || "No se pudieron cargar los cheques en cartera.",
          4200
        );
      } finally {
        setLoadingCheques(false);
      }
    },
    [showToast, API_CHEQUES_CARTERA]
  );

  /* ── Trigger fetch cuando cambia el medio de pago ── */
  useEffect(() => {
    if (!open) return;

    if (!requiereChequeCartera) {
      setChequesCartera([]);
      setIdChequeSeleccionado("");
      setLoadingCheques(false);
      return;
    }

    fetchChequesCartera(tipoChequeRequerido);
  }, [open, requiereChequeCartera, tipoChequeRequerido, fetchChequesCartera]);

  /* =========================================================
     Handlers de filas
  ========================================================= */
  const addRow = useCallback(() => setRows((p) => [...p, buildEmptyRow()]), []);
  const removeRow = useCallback(
    (id) =>
      setRows((p) => {
        const n = p.filter((r) => r.id !== id);
        return n.length ? n : [buildEmptyRow()];
      }),
    []
  );
  const updateRow = useCallback(
    (id, patch) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    []
  );

  const handleSelectDetalle = useCallback(
    (item, rowId) => {
      const precio = safeNumber(item?.precio || 0);
      const stockDisponible = getStockDisponible(item);
      const sinStock = isSinStock(stockDisponible);

      updateRow(rowId, {
        id_detalle: String(getDetalleId(item) ?? ""),
        detalle: optionLabel(item),
        precio,
        stock_disponible: stockDisponible,
        sinStock,
        cantidad: sinStock ? "" : 1,
      });

      if (sinStock) {
        showToast(
          "advertencia",
          `El producto "${optionLabel(item)}" no tiene stock disponible.`,
          2500
        );
      }
    },
    [updateRow, showToast]
  );

  const handleCantidadChange = useCallback(
    (rowId, newCantidad) => {
      const row = rows.find((r) => r.id === rowId);
      if (!row) return;

      if (row.sinStock || isSinStock(row.stock_disponible)) {
        updateRow(rowId, { cantidad: "" });
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
        showToast("advertencia", `Stock máximo disponible: ${stockDisponible}`, 2000);
      }

      updateRow(rowId, { cantidad: cantidadFinal });
    },
    [rows, updateRow, showToast]
  );

  const handleOpenDate = useCallback(
    (e) => {
      if (saving) return;
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const input = fechaInputRef.current;
      if (!input) return;
      input.focus();
      try {
        if (typeof input.showPicker === "function") input.showPicker();
        else input.click();
      } catch {
        input.click();
      }
    },
    [saving]
  );

  /* =========================================================
     Cálculos
  ========================================================= */
  const rowsCalc = useMemo(() => {
    return rows.map((r) => {
      const cantidad = Math.max(0, safeNumber(r.cantidad));
      const precio = Math.max(0, safeNumber(r.precio));
      const ivaPct = Math.max(0, safeNumber(r.ivaPct));
      const subtotal = cantidad * precio;
      const ivaMonto = subtotal * (ivaPct / 100);
      const total = subtotal + ivaMonto;
      return { ...r, subtotal, ivaMonto, total };
    });
  }, [rows]);

  const resumen = useMemo(
    () => ({
      subtotal: rowsCalc.reduce((a, r) => a + safeNumber(r.subtotal), 0),
      iva: rowsCalc.reduce((a, r) => a + safeNumber(r.ivaMonto), 0),
      total: rowsCalc.reduce((a, r) => a + safeNumber(r.total), 0),
    }),
    [rowsCalc]
  );

  /* =========================================================
     Validación — incluye cheque si requiere
  ========================================================= */
  const validate = useCallback(() => {
    const mp = Number(filters.id_medio_pago);
    const clas = Number(filters.id_clasificacion);

    if (!Number.isFinite(mp) || mp <= 0) {
      return { ok: false, msg: "Falta seleccionar el medio de pago." };
    }

    if (!Number.isFinite(clas) || clas <= 0) {
      return { ok: false, msg: "Debés indicar si el egreso es costo fijo o no." };
    }

    if (!safeStr(fecha)) {
      return { ok: false, msg: "Falta la fecha." };
    }

    /* ── Validación de cheque en cartera ── */
    if (requiereChequeCartera) {
      const idCheque = Number(idChequeSeleccionado);
      if (!Number.isFinite(idCheque) || idCheque <= 0) {
        return {
          ok: false,
          msg: `Seleccioná un ${
            tipoChequeRequerido === "echeq" ? "eCheq" : "cheque"
          } en cartera para este medio de pago.`,
        };
      }
    }

    const problems = [];
    rowsCalc.forEach((r, i) => {
      const p = describeLineProblem(r, i + 1);
      if (p) problems.push(p);
    });

    const usable = rowsCalc.filter(
      (r) =>
        safeStr(r.detalle) !== "" &&
        Number(r.id_detalle || 0) > 0 &&
        safeNumber(r.cantidad) > 0 &&
        safeNumber(r.precio) > 0 &&
        safeNumber(r.total) > 0
    );

    if (!usable.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return {
        ok: false,
        msg: "Cargá al menos 1 fila válida (Descripción + Cantidad + Importe).",
      };
    }

    return { ok: true, warn: problems.length > 0, usable };
  }, [filters, fecha, rowsCalc, requiereChequeCartera, idChequeSeleccionado, tipoChequeRequerido]);

  /* =========================================================
     buildPayload — incluye id_cheque si hay cheque seleccionado
  ========================================================= */
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
    const movId = getMovimientoId(initialData);

    const idChequeFinal =
      requiereChequeCartera && Number(idChequeSeleccionado) > 0
        ? Number(idChequeSeleccionado)
        : null;

    return {
      ...(movId ? { id_movimiento: movId, id_egreso: movId, id: movId } : {}),
      fecha: safeStr(fecha).slice(0, 10),
      id_medio_pago: Number(filters.id_medio_pago),
      medio_pago_nombre: optionLabel(medioPagoSeleccionado),
      id_clasificacion: Number(filters.id_clasificacion),
      clasificacion_nombre: isCostoFijoChecked
        ? clasificacionConfig.labelCostoFijo.toUpperCase()
        : isNoCostoFijoChecked
        ? clasificacionConfig.labelNoCostoFijo.toUpperCase()
        : "",
      detalle: detalleFinal,
      descripcion: detalleFinal,
      concepto: detalleFinal,
      cantidad: usableRows.length === 1 ? safeNumber(usableRows[0].cantidad) : 1,
      precio:
        usableRows.length === 1
          ? safeNumber(usableRows[0].precio)
          : safeNumber(subtotalFinal),
      subtotal: safeNumber(subtotalFinal),
      iva_monto: safeNumber(ivaFinal),
      monto_total: safeNumber(totalFinal),
      total: safeNumber(totalFinal),
      total_general: safeNumber(totalFinal),
      /* ── cheque en cartera ── */
      ...(idChequeFinal
        ? {
            id_cheque: idChequeFinal,
            cheque_tipo: tipoChequeRequerido,
          }
        : {}),
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
  }, [
    rowsCalc,
    initialData,
    fecha,
    filters,
    medioPagoSeleccionado,
    clasificacionConfig,
    isCostoFijoChecked,
    isNoCostoFijoChecked,
    requiereChequeCartera,
    idChequeSeleccionado,
    tipoChequeRequerido,
  ]);

  /* =========================================================
     Subir archivo
  ========================================================= */
  const subirArchivo = useCallback(
    async (idMovimiento, archivo) => {
      if (!archivo || !idMovimiento) return null;
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", "OTRO_EGRESO");
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("force_replace", "1");
      return await apiPostForm(API_UPLOAD, fd);
    },
    [API_UPLOAD]
  );

  /* =========================================================
     Submit
  ========================================================= */
  const submit = useCallback(async () => {
    if (saving) return;

    if (typeof onSubmit !== "function") {
      showToast("error", "Falta la función de guardado del modal.", 4200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }

    setSaving(true);
    if (v.warn) {
      showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    }

    try {
      const payload = buildPayload();
      const data = await onSubmit(payload, mode === "edit");
      const idMovimientoFinal = getSavedMovimientoIdFromResponse(data, initialData);

      if (!idMovimientoFinal) {
        throw new Error(
          "El backend guardó el movimiento pero no devolvió un id_movimiento válido."
        );
      }

      let warningArchivo = "";
      if (archivoAdjunto) {
        try {
          const respArchivo = await subirArchivo(idMovimientoFinal, archivoAdjunto);
          if (!respArchivo?.exito) {
            warningArchivo = respArchivo?.mensaje || "No se pudo vincular el archivo.";
          }
        } catch (e) {
          warningArchivo = e?.message || "No se pudo vincular el archivo.";
        }
      }

      if (warningArchivo) {
        showToast(
          "advertencia",
          `Egreso guardado, pero el archivo no se pudo vincular: ${warningArchivo}`,
          7000
        );
      }

      await onSaved?.({ ...(data || {}), id_movimiento: idMovimientoFinal });
    } catch (e) {
      showToast("error", e?.message || "No se pudo guardar el egreso.", 4500);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    onSubmit,
    validate,
    buildPayload,
    mode,
    onSaved,
    showToast,
    initialData,
    archivoAdjunto,
    subirArchivo,
  ]);

  if (!open) return null;

  const btnLabel =
    saving ? "Procesando..." : mode === "edit" ? "Guardar cambios" : "Guardar egreso";

  return createPortal(
    <div className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}>
      <div
        className={[
          "mi-modal__container",
          "mi-modal__container--mov",
          dark ? "mi-modal--dark" : "",
        ]
          .join(" ")
          .trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faPlus} />
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">
              {mode === "edit" ? "Editar Egreso" : "Nuevo Egreso"}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={() => (!saving ? onClose?.() : null)}
            aria-label="Cerrar"
            disabled={saving}
            type="button"
          >
            ✕
          </button>
        </div>

        {/* ── CONTENT ── */}
        <div className="mi-modal__content">
          <div className="mi-cr-grid">

            {/* ── TABLA DE ITEMS ── */}
            <section className="mi-cr-table">
              <div
                className="mi-cr-table__head"
                style={{ gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr" }}
              >
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
                className={`mi-cr-table__rows ${hasScroll ? "has-scroll" : ""}`}
              >
                {rowsCalc.map((r) => {
                  const stockNum =
                    r.stock_disponible !== null && r.stock_disponible !== undefined
                      ? Number(r.stock_disponible)
                      : null;
                  const rowSinStock = r.sinStock || isSinStock(stockNum);

                  return (
                    <div
                      key={r.id}
                      className={`mi-cr-row ${rowSinStock ? "mi-cr-row--sin-stock" : ""}`}
                      style={{ gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr" }}
                    >
                      {/* Descripción */}
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
                          options={detallesList}
                          getOptionLabel={(d) => optionLabel(d)}
                          getOptionValue={(d) => String(getDetalleId(d) ?? optionLabel(d))}
                          placeholder="Escribí o buscá una descripción…"
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
                          value={rowSinStock ? "" : r.cantidad}
                          onChange={(e) =>
                            handleCantidadChange(
                              r.id,
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
                          style={{
                            width: "100%",
                            background: rowSinStock ? "#f3f4f6" : undefined,
                            color: rowSinStock ? "#b91c1c" : undefined,
                            borderColor: rowSinStock ? "#fca5a5" : undefined,
                            cursor: rowSinStock ? "not-allowed" : undefined,
                            opacity: rowSinStock ? 0.9 : 1,
                          }}
                        />
                        {r.stock_disponible !== null && r.stock_disponible !== undefined && (
                          <div
                            style={{
                              fontSize: "10px",
                              marginTop: "2px",
                              fontWeight: rowSinStock ? 700 : 500,
                              color: rowSinStock ? "#b91c1c" : "#666",
                            }}
                          >
                            {rowSinStock ? "Sin stock" : `Stock: ${r.stock_disponible}`}
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
                            r.precioFocused ? r.precioDraft ?? "" : formatMoneyInputARS(r.precio)
                          }
                          onFocus={(e) => {
                            updateRow(r.id, {
                              precioFocused: true,
                              precioDraft: formatEditableMoney(r.precio),
                            });
                            setTimeout(() => e.target.select(), 0);
                          }}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const cleaned = raw.replace(/[^\d,.\-]/g, "");
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
                          placeholder="$ 0,00"
                          disabled={saving}
                          style={{ width: "100%", padding: "0" }}
                        />
                      </div>

                      {/* IVA % */}
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

                      {/* IVA $ */}
                      <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                        {moneyARS(r.ivaMonto)}
                      </div>

                      {/* Total */}
                      <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                        {moneyARS(r.total)}
                      </div>

                      {/* Eliminar */}
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

              {/* Foot */}
              <div className="mi-cr-table__foot">
                <div className="mi-cr-foot-actions">
                  <button
                    type="button"
                    className="nv-foot-btn"
                    onClick={addRow}
                    disabled={saving}
                  >
                    <span className="nv-foot-btn__icon">+</span>
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

            {/* ── FILTROS / ASIDE ── */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos del egreso</div>

                <div className="mi-cr-filters__dates">
                  <div
                    className="fl-field fl-col-full mi-date-field"
                    onClick={handleOpenDate}
                  >
                    <input
                      ref={fechaInputRef}
                      id="ne-fecha-input"
                      className="fl-input mi-date-field__input"
                      type="date"
                      placeholder=" "
                      value={fecha}
                      onChange={(e) => setFecha(String(e.target.value || "").trim())}
                      disabled={saving}
                    />
                    <label className="fl-label mi-date-field__label" onClick={handleOpenDate}>
                      Fecha
                    </label>
                  </div>
                </div>
              </div>

              <div className="mi-cr-filters__body">

                {/* ── Clasificación ── */}
                <div style={S.clasificacionBox}>
                  <div style={S.clasificacionHead}>
                    <div style={S.clasificacionTitle}>Clasificación *</div>
                    <div style={S.clasificacionSub}>
                      Indicá si este egreso es un costo fijo
                    </div>
                  </div>
                  <div style={S.toggleRow}>
                    <div
                      style={S.toggleOption(isCostoFijoChecked, saving)}
                      onClick={() => {
                        if (saving) return;
                        setFilters((p) => ({
                          ...p,
                          id_clasificacion: clasificacionConfig.idCostoFijo,
                        }));
                      }}
                      role="radio"
                      aria-checked={isCostoFijoChecked}
                      tabIndex={saving ? -1 : 0}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          if (!saving)
                            setFilters((p) => ({
                              ...p,
                              id_clasificacion: clasificacionConfig.idCostoFijo,
                            }));
                        }
                      }}
                    >
                      <span style={S.toggleDot(isCostoFijoChecked)} />
                      <span style={S.toggleLabel(isCostoFijoChecked)}>
                        {clasificacionConfig.labelCostoFijo}
                      </span>
                      {isCostoFijoChecked && <span style={S.toggleBadge}>activo</span>}
                    </div>

                    <div
                      style={S.toggleOption(isNoCostoFijoChecked, saving)}
                      onClick={() => {
                        if (saving) return;
                        setFilters((p) => ({
                          ...p,
                          id_clasificacion: clasificacionConfig.idNoCostoFijo,
                        }));
                      }}
                      role="radio"
                      aria-checked={isNoCostoFijoChecked}
                      tabIndex={saving ? -1 : 0}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          if (!saving)
                            setFilters((p) => ({
                              ...p,
                              id_clasificacion: clasificacionConfig.idNoCostoFijo,
                            }));
                        }
                      }}
                    >
                      <span style={S.toggleDot(isNoCostoFijoChecked)} />
                      <span style={S.toggleLabel(isNoCostoFijoChecked)}>
                        {clasificacionConfig.labelNoCostoFijo}
                      </span>
                      {isNoCostoFijoChecked && <span style={S.toggleBadge}>activo</span>}
                    </div>
                  </div>
                </div>

                {/* ── Medio de pago ── */}
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(filters.id_medio_pago)}
                    onChange={(e) =>
                      setFilters((p) => ({ ...p, id_medio_pago: e.target.value }))
                    }
                    disabled={saving}
                  >
                    <option value="">Seleccionar medio</option>
                    {mediosPagoList.map((x) => (
                      <option
                        key={getMedioPagoId(x) ?? optionLabel(x)}
                        value={String(getMedioPagoId(x) ?? "")}
                      >
                        {optionLabel(x)}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Medio de pago *</label>
                </div>

                {/* ── Cheques/eCheqs en cartera (calcado de Compras) ── */}
                {requiereChequeCartera && (
                  <div className="mi-card mi-card--full" style={{ marginTop: 8 }}>
                    <div className="mi-card__title">
                      <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ marginRight: 6 }} />
                      {tipoChequeRequerido === "echeq"
                        ? "eCheqs en cartera"
                        : "Cheques en cartera"}
                    </div>

                    {loadingCheques ? (
                      <div style={{ padding: "10px 0" }}>
                        <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
                        Cargando cheques disponibles...
                      </div>
                    ) : chequesCartera.length === 0 ? (
                      <div style={{ padding: "10px 0" }}>
                        No hay {tipoChequeRequerido === "echeq" ? "eCheqs" : "cheques"} activos en cartera.
                      </div>
                    ) : (
                      <ChequesCarteraCards
                        cheques={chequesCartera}
                        idSeleccionado={idChequeSeleccionado}
                        onSelect={setIdChequeSeleccionado}
                      />
                    )}

                    {chequeSeleccionado && (
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        <div style={{ fontWeight: 700, color: "#0f766e", marginBottom: 6 }}>
                          ✓ {String(chequeSeleccionado?.tipo || "").toUpperCase()} seleccionado
                        </div>
                        <div><b>N°:</b> {safeText(chequeSeleccionado?.numero_cheque)}</div>
                        <div><b>Emisor:</b> {safeText(chequeSeleccionado?.emisor)}</div>
                        <div><b>Importe:</b> {moneyARS(chequeSeleccionado?.importe || 0)}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Archivo adjunto ── */}
                <div className="mi-uploadCard">
                  <div className="mi-uploadCard__head">
                    <div>
                      <div className="mi-uploadCard__title">Archivo adjunto</div>
                      <div className="mi-uploadCard__sub">PDF, imagen u otro comprobante</div>
                    </div>
                  </div>
                  <div className="mi-uploadCard__body">
                    <div className="mi-uploadBar">
                      <label className="mi-uploadBar__pick">
                        <input
                          type="file"
                          className="mi-uploadBar__input"
                          onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                          disabled={saving}
                        />
                        <span className="mi-uploadBar__btn mi-uploadBar__btn--primary">
                          {archivoAdjunto ? "Cambiar" : "Seleccionar"}
                        </span>
                      </label>
                      <button
                        type="button"
                        className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                        onClick={() => setArchivoAdjunto(null)}
                        disabled={saving || !archivoAdjunto}
                      >
                        Quitar
                      </button>
                    </div>
                    <div className={`mi-uploadFile ${archivoAdjunto ? "is-filled" : "is-empty"}`}>
                      {archivoAdjunto ? (
                        <>
                          <div className="mi-uploadFile__icon">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} />
                          </div>
                          <div className="mi-uploadFile__meta">
                            <div className="mi-uploadFile__name" title={archivoAdjunto.name}>
                              {archivoAdjunto.name}
                            </div>
                            <div className="mi-uploadFile__size">
                              {Math.max(1, Math.round((archivoAdjunto.size || 0) / 1024))} KB
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="mi-uploadFile__empty">No hay archivo seleccionado</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Acciones ── */}
                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid mit-btn--block"
                  >
                    {btnLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => (!saving ? onClose?.() : null)}
                    disabled={saving}
                    className="mit-btn mit-btn--ghost mit-btn--block"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}