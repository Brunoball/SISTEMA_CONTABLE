import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../Recibos/modales/ModalPagarRecibos.css";
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

import ModalOrdenPagoGenerada from "./ModalOrdenPagoGenerada";
import { buildOrdenPagoHTML } from "../../../../utils/ordenPagoTemplate";

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

function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
}

function getAuthInfo() {
  return {
    sessionKey: (localStorage.getItem("session_key") || "").trim(),
    token: (localStorage.getItem("token") || "").trim(),
  };
}

function buildAuthHeaders(includeJson = false) {
  const { sessionKey, token } = getAuthInfo();
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers["Authorization"] = `Bearer ${token}`;
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

function isPagadoRow(row) {
  if (row?.pagado === true) return true;
  if (Number(row?.pagado ?? 0) === 1) return true;
  const cob = Number(row?.cobrado_total ?? 0);
  if (Number.isFinite(cob) && cob > 0.00001) return true;
  return false;
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

function getChequeIdsArray(value) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x)).filter(Boolean);
  }
  if (value == null || value === "") return [];
  return [String(value)];
}

/* =========================
   UI
========================= */
function EstadoChip({ pagado }) {
  return (
    <span className={`mpr-chip ${pagado ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {pagado ? "PAGADO" : "PENDIENTE"}
    </span>
  );
}

function ChequesCarteraCards({ cheques, idsSeleccionados, onToggle }) {
  if (!cheques.length) return null;

  return (
    <div className="mpr-cheques-cards">
      {cheques.map((ch, idx) => {
        const idCheque = String(ch?.id_cheque || "");
        const checked = idsSeleccionados.includes(idCheque);

        return (
          <div
            key={ch?.id_cheque || idx}
            className={`mpr-cheque-card-item ${checked ? "is-checked" : ""}`}
            onClick={() => onToggle(idCheque)}
          >
            <div className="mpr-cheque-card__top">
              <label className="mpr-check" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(idCheque)}
                />
                <span className="mpr-check__box" aria-hidden="true" />
              </label>
              <span className="mpr-cheque-card__numero">N° {safeText(ch?.numero_cheque)}</span>
            </div>

            <div className="mpr-cheque-card__body">
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

            <div className="mpr-cheque-card__importe">{moneyARS(ch?.importe || 0)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MedioPagoRow({
  row,
  mediosPagoList,
  onUpdate,
  onRemove,
  saving,
  showToast,
  canRemove,
  totalSeleccionado,
  sumaMediosPago,
}) {
  const mpSeleccionado = useMemo(
    () => mediosPagoList.find((x) => String(x.id) === String(row.id_medio_pago)) || null,
    [mediosPagoList, row.id_medio_pago]
  );

  const tipoCheque = useMemo(
    () => normalizeChequeTipoFromMedio(mpSeleccionado?.nombre || ""),
    [mpSeleccionado]
  );

  const esCheque = tipoCheque !== null;

  const chequesSeleccionados = useMemo(
    () => getChequeIdsArray(row.id_cheque),
    [row.id_cheque]
  );

  const chequesSeleccionadosData = useMemo(() => {
    return row.chequesDisponibles.filter((x) =>
      chequesSeleccionados.includes(String(x.id_cheque))
    );
  }, [row.chequesDisponibles, chequesSeleccionados]);

  const importeCheques = useMemo(() => {
    if (!esCheque || chequesSeleccionadosData.length === 0) return 0;
    return chequesSeleccionadosData.reduce((acc, ch) => acc + Number(ch?.importe || 0), 0);
  }, [esCheque, chequesSeleccionadosData]);

  const restanteGlobal = useMemo(() => {
    return Math.max(0, safeNumber(totalSeleccionado) - safeNumber(sumaMediosPago));
  }, [totalSeleccionado, sumaMediosPago]);

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - safeNumber(row.monto));
    return Math.max(0, safeNumber(totalSeleccionado) - sumaOtros);
  }, [sumaMediosPago, totalSeleccionado, row.monto]);

  const handleChangeMedio = useCallback(
    async (val) => {
      const mp = mediosPagoList.find((x) => String(x.id) === String(val));
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
          sp.set("action", "ordenes_pago_cheques_cartera_listar");
          sp.set("tipo", tipo);

          const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?${sp.toString()}`, {
            method: "GET",
            headers: buildAuthHeaders(false),
          });

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
    [row.id, row.monto, mediosPagoList, onUpdate, showToast]
  );

  const handleToggleCheque = useCallback(
    (idChequeStr) => {
      const current = getChequeIdsArray(row.id_cheque);
      const next = current.includes(idChequeStr)
        ? current.filter((x) => x !== idChequeStr)
        : [...current, idChequeStr];

      onUpdate(row.id, { id_cheque: next });
    },
    [row.id, row.id_cheque, onUpdate]
  );

  useEffect(() => {
    if (esCheque) {
      onUpdate(row.id, {
        monto: importeCheques,
        montoDraft: "",
        montoFocused: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCheque, importeCheques]);

  const puedeCompletarRestante =
    !saving &&
    !esCheque &&
    totalSeleccionado > 0 &&
    restanteParaEstaFila > 0.009;

  return (
    <div
      style={{
        border: "1px solid rgba(0,0,0,.1)",
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        background: "rgba(0,0,0,.02)",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: "#666" }}>
            Medio de pago
          </div>
          <select
            className="fl-input fl-select"
            value={String(row.id_medio_pago || "")}
            onChange={(e) => handleChangeMedio(e.target.value)}
            disabled={saving}
            style={{ width: "100%" }}
          >
            <option value="">Seleccionar...</option>
            {mediosPagoList.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.nombre}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: "1 1 150px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: "#666" }}>
            Monto
          </div>

          <input
            className="nv-cell-input nv-cell-input--right"
            type="text"
            inputMode="decimal"
            value={row.montoFocused ? row.montoDraft ?? "" : formatMoneyInputARS(row.monto)}
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
            disabled={saving || (esCheque && chequesSeleccionados.length > 0)}
            style={{
              width: "100%",
              background: esCheque && chequesSeleccionados.length > 0 ? "#f3f4f6" : undefined,
            }}
            title={
              esCheque && chequesSeleccionados.length > 0
                ? "El monto se completa automáticamente con la suma de los cheques"
                : ""
            }
          />

          {!esCheque && (
            <div
              style={{
                marginTop: 6,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 11, color: "#666" }}>
                Falta cubrir: <b>{moneyARS(restanteGlobal)}</b>
              </span>

              <button
                type="button"
                onClick={() =>
                  onUpdate(row.id, {
                    monto: restanteParaEstaFila,
                    montoDraft: "",
                    montoFocused: false,
                  })
                }
                disabled={!puedeCompletarRestante}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  border: "1px solid #0f766e",
                  background: "transparent",
                  color: "#0f766e",
                  borderRadius: 6,
                  padding: "6px 8px",
                  cursor: puedeCompletarRestante ? "pointer" : "not-allowed",
                  opacity: puedeCompletarRestante ? 1 : 0.55,
                  width: "100%",
                }}
                title="Completa automáticamente el importe faltante"
              >
                Completar restante
              </button>
            </div>
          )}
        </div>

        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(row.id)}
            disabled={saving}
            style={{
              marginTop: 20,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#dc2626",
              fontSize: 18,
              padding: "0 4px",
            }}
            title="Quitar medio de pago"
          >
            ×
          </button>
        )}
      </div>

      {esCheque && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", marginBottom: 6 }}>
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ marginRight: 5 }} />
            {tipoCheque === "echeq" ? "eCheqs en cartera" : "Cheques en cartera"} — seleccioná
            uno o varios
          </div>

          {row.loadingCheques ? (
            <div style={{ padding: "8px 0" }}>
              <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
              Cargando...
            </div>
          ) : row.chequesDisponibles.length === 0 ? (
            <div style={{ padding: "8px 0", color: "#888", fontSize: 13 }}>
              No hay {tipoCheque === "echeq" ? "eCheqs" : "cheques"} activos en cartera.
            </div>
          ) : (
            <ChequesCarteraCards
              cheques={row.chequesDisponibles}
              idsSeleccionados={chequesSeleccionados}
              onToggle={handleToggleCheque}
            />
          )}

          {chequesSeleccionadosData.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#0f766e" }}>
              ✓ {chequesSeleccionadosData.length}{" "}
              {tipoCheque === "echeq" ? "eCheq(s)" : "cheque(s)"} seleccionado(s) — Total:{" "}
              {moneyARS(importeCheques)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================
   COMPONENTE PRINCIPAL
========================= */
export default function ModalPagarOrdenesPago({
  open,
  onClose,
  onConfirm,
  onToast,
  proveedor,
  deudas = [],
  onOrdenPagoFinalizado,
  lists,
}) {
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);
  const tbodyRef = useRef(null);
  const [tbodyHasScroll, setTbodyHasScroll] = useState(false);

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isTemaOscuro()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(() => []);

  const mediosPagoFromContext = useMemo(() => normalizeMediosPago(lists || {}), [lists]);
  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);

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
    () => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0),
    [mediosFilas]
  );

  const [openOrden, setOpenOrden] = useState(false);
  const [ordenHtml, setOrdenHtml] = useState("");
  const [ordenTitle, setOrdenTitle] = useState("Orden de Pago");
  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId, setUltimoCobroId] = useState(null);

  const showToast = useCallback(
    (tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur),
    [onToast]
  );

  const fetchMediosPagoFallback = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?action=global_obtener_listas`, {
        method: "GET",
        headers: buildAuthHeaders(false),
      });
      setMediosPago(normalizeMediosPago(data));
    } catch (e) {
      showToast("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
    } finally {
      setLoadingMedios(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!open) return;

    setSelectedIds(new Set());
    setPagaTodo(false);
    setLoading(false);
    setRows(Array.isArray(deudas) ? [...deudas] : []);
    setOpenOrden(false);
    setOrdenHtml("");
    setOrdenTitle("Orden de Pago");
    setIdsMovimientosPagados([]);
    setUltimoCobroId(null);
    setMediosFilas([buildEmptyMedioPago()]);

    if (mediosPagoFromContext.length > 0) {
      setMediosPago(mediosPagoFromContext);
      setLoadingMedios(false);
    } else {
      setMediosPago([]);
      fetchMediosPagoFallback();
    }

    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, deudas, mediosPagoFromContext, fetchMediosPagoFallback]);

  useEffect(() => {
    if (!open || openOrden) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!loading) onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openOrden, onClose, loading]);

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

  const diferenciaRestante = useMemo(
    () => Math.max(0, totalSeleccionado - sumaMediosPago),
    [totalSeleccionado, sumaMediosPago]
  );

  const cantSeleccionadas = useMemo(() => selectedIds.size, [selectedIds]);

  const recomputeTbodyScroll = useCallback(() => {
    const el = tbodyRef.current;
    if (!el) return;
    setTbodyHasScroll(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    if (!open || openOrden) return;
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
  }, [open, openOrden, recomputeTbodyScroll, deudasOrdenadas.length]);

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

  const buildMediosPagoPayload = useCallback(() => {
    return mediosFilas.flatMap((mp) => {
      const idsCheques = getChequeIdsArray(mp.id_cheque);
      const mpData = mediosPago.find((x) => String(x.id) === String(mp.id_medio_pago));
      const tipoCheque = normalizeChequeTipoFromMedio(mpData?.nombre || "");

      if (tipoCheque !== null && idsCheques.length > 0) {
        return idsCheques.map((idChequeStr) => {
          const ch = mp.chequesDisponibles.find(
            (x) => String(x.id_cheque) === String(idChequeStr)
          );
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
          id_cheque: null,
        },
      ];
    });
  }, [mediosFilas, mediosPago]);

  const confirmPagoDefault = async ({ ids_movimiento, medios_pago }) => {
    return await fetchJsonOrThrow(`${BASE_URL}/api.php?action=ordenes_pago_confirmar_pago`, {
      method: "POST",
      headers: buildAuthHeaders(true),
      body: JSON.stringify({ ids_movimiento, medios_pago }),
    });
  };

  const buildOrdenFromSeleccion = useCallback(
    ({ proveedorInfo, mediosPagoInfo, seleccion }) => {
      const total = seleccion.reduce(
        (acc, r) => acc + (Number(r?.monto_total ?? r?.total ?? 0) || 0),
        0
      );

      const mpNombre =
        mediosPagoInfo.length === 1
          ? mediosPagoInfo[0].nombre
          : mediosPagoInfo.map((x) => x.nombre).join(" + ");

      const html = buildOrdenPagoHTML({
        proveedorNombre: proveedorInfo?.nombre ?? proveedor?.proveedor ?? "",
        proveedorId: proveedorInfo?.id_proveedor ?? proveedor?.id_proveedor ?? "",
        medioPagoNombre: mpNombre,
        total,
        seleccion,
        fechaPago: new Date(),
      });

      return {
        html,
        title: `Orden de Pago - ${proveedorInfo?.nombre || proveedor?.proveedor || "Proveedor"}`,
      };
    },
    [proveedor]
  );

  const validate = useCallback(() => {
    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    if (seleccion.length === 0) {
      return { ok: false, msg: "Seleccioná al menos una deuda PENDIENTE para pagar." };
    }

    const chequesRepetidos = new Set();

    for (let i = 0; i < mediosFilas.length; i++) {
      const mp = mediosFilas[i];

      if (!mp.id_medio_pago) {
        return { ok: false, msg: `Medio de pago ${i + 1}: falta seleccionar el medio.` };
      }

      const mpData = mediosPago.find((x) => String(x.id) === String(mp.id_medio_pago));
      const tipoCheque = normalizeChequeTipoFromMedio(mpData?.nombre || "");
      const idsCheques = getChequeIdsArray(mp.id_cheque);

      if (tipoCheque !== null) {
        if (!idsCheques.length) {
          return {
            ok: false,
            msg: `Medio de pago ${i + 1}: debés seleccionar al menos un ${
              tipoCheque === "echeq" ? "eCheq" : "cheque"
            } de cartera.`,
          };
        }

        for (const idCh of idsCheques) {
          if (chequesRepetidos.has(idCh)) {
            return {
              ok: false,
              msg: `El cheque/eCheq ID ${idCh} está repetido en más de un medio de pago.`,
            };
          }
          chequesRepetidos.add(idCh);
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
        msg: `La suma de los medios de pago (${moneyARS(
          sumaMediosPago
        )}) no cubre el total a pagar (${moneyARS(totalSeleccionado)}).`,
      };
    }

    return { ok: true };
  }, [deudasOrdenadas, selectedIds, mediosFilas, mediosPago, sumaMediosPago, totalSeleccionado]);

  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      showToast("error", "Este proveedor no tiene deudas.", 2600);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("error", v.msg, 3200);
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);
    const mediosPagoPayload = buildMediosPagoPayload();

    console.log("ids_movimiento:", ids);
    console.log("mediosPagoPayload:", mediosPagoPayload);

    const mediosPagoInfo = mediosFilas.map((mp) => {
      const mpData = mediosPago.find((x) => String(x.id) === String(mp.id_medio_pago));
      const idsCheques = getChequeIdsArray(mp.id_cheque);

      if (idsCheques.length > 1) {
        return { nombre: `${mpData?.nombre || "Medio de pago"} x${idsCheques.length}` };
      }

      return { nombre: mpData?.nombre || "Medio de pago" };
    });

    try {
      setLoading(true);

      // SIEMPRE manda el modal directo al backend
      const resp = await confirmPagoDefault({
        ids_movimiento: ids,
        medios_pago: mediosPagoPayload,
      });

      // onConfirm queda como callback opcional posterior
      if (typeof onConfirm === "function") {
        try {
          await Promise.resolve(
            onConfirm({
              proveedor: {
                id_proveedor: proveedor?.id_proveedor ?? null,
                nombre: proveedor?.proveedor ?? "",
              },
              seleccion,
              totalSeleccionado,
              medios_pago: mediosPagoPayload,
              ids_movimiento: ids,
              response: resp,
            })
          );
        } catch (hookErr) {
          console.warn("onConfirm callback error:", hookErr);
        }
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

      const built = buildOrdenFromSeleccion({
        proveedorInfo: {
          id_proveedor: proveedor?.id_proveedor ?? null,
          nombre: proveedor?.proveedor ?? "",
        },
        mediosPagoInfo,
        seleccion,
      });

      setOrdenHtml(built.html);
      setOrdenTitle(built.title);
      setOpenOrden(true);
      setSelectedIds(new Set());
      setPagaTodo(false);
      setMediosFilas([buildEmptyMedioPago()]);
      showToast("exito", "Pago realizado correctamente.", 3000);
      setTimeout(recomputeTbodyScroll, 0);
    } catch (e) {
      showToast("error", e?.message || "No se pudo registrar el pago.", 4200);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

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
      {!openOrden && (
        <div className={overlayClass} role="dialog" aria-modal="true">
          <div className={modalClass} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
            <div className="mi-modal__header mpr-header">
              <div className="mi-modal__head-icon" aria-hidden="true">
                <FontAwesomeIcon icon={faMoneyBill1Wave} />
              </div>

              <div className="mi-modal__head-left">
                <h2 className="mi-modal__title">
                  Pagar
                  <span className="mpr-header-dot">·</span>
                  <span className="mpr-header-cliente">{safeText(proveedor?.proveedor)}</span>
                  {proveedor?.id_proveedor && (
                    <span className="mpr-header-id">ID {String(proveedor.id_proveedor)}</span>
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

            <div className="mi-modal__content mpr-content-wrap">
              <div className="mpr-layout">
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
                      <div className="mpr-empty">No hay deudas para este proveedor.</div>
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
                            <label
                              className={`mpr-check ${
                                !id || loading || pagado ? "is-disabled" : ""
                              }`}
                            >
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

                <aside className="mpr-aside">
                  <div className="mpr-aside__top">
                    <div className="mpr-aside__title">Datos del pago</div>
                  </div>

                  <div className="mpr-aside__body">
                    {loadingMedios && (
                      <div style={{ padding: "8px 0", fontSize: 13, color: "#666" }}>
                        <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
                        Cargando medios de pago…
                      </div>
                    )}

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

                    <div className="mi-card mi-card--full" style={{ marginTop: 10, padding: 12 }}>
                      <div
                        className="mi-card__title"
                        style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <FontAwesomeIcon icon={faMoneyCheckDollar} />
                        Medios de pago
                      </div>

                      {mediosFilas.map((mp) => (
                        <MedioPagoRow
                          key={mp.id}
                          row={mp}
                          mediosPagoList={mediosPago}
                          onUpdate={updateMedioPago}
                          onRemove={removeMedioPago}
                          saving={loading}
                          showToast={showToast}
                          canRemove={mediosFilas.length > 1}
                          totalSeleccionado={totalSeleccionado}
                          sumaMediosPago={sumaMediosPago}
                        />
                      ))}

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: "1px solid rgba(0,0,0,.08)",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: "#666" }}>
                          Asignado: <b>{moneyARS(sumaMediosPago)}</b>
                        </span>

                        <span style={{ color: "#666" }}>
                          Total a cubrir: <b>{moneyARS(totalSeleccionado)}</b>
                        </span>

                        {diferenciaRestante > 0.01 ? (
                          <span style={{ color: "#dc2626", fontWeight: 700 }}>
                            Falta cubrir: {moneyARS(diferenciaRestante)}
                          </span>
                        ) : totalSeleccionado > 0 ? (
                          <span style={{ color: "#0f766e", fontWeight: 700 }}>✓ Cubierto</span>
                        ) : (
                          <span style={{ color: "#666", fontWeight: 600 }}>
                            Seleccioná una deuda para calcular el pago
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={addMedioPago}
                        disabled={loading}
                        style={{
                          marginTop: 10,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          color: "#0f766e",
                          background: "none",
                          border: "1px dashed #0f766e",
                          borderRadius: 8,
                          padding: "6px 12px",
                          cursor: "pointer",
                          width: "100%",
                          justifyContent: "center",
                          fontWeight: 600,
                        }}
                      >
                        <FontAwesomeIcon icon={faPlus} /> Agregar otro medio de pago
                      </button>
                    </div>

                    <div className="mpr-aside__actions" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="mit-btn mit-btn--solid mit-btn--block"
                        onClick={handleConfirm}
                        disabled={loading || selectedIds.size === 0 || loadingMedios}
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

      <ModalOrdenPagoGenerada
        open={openOrden}
        html={ordenHtml}
        title={ordenTitle}
        onToast={onToast}
        onClose={() => {
          setOpenOrden(false);
          onClose?.();
        }}
        idsMovimientos={idsMovimientosPagados}
        idCobro={ultimoCobroId}
        onFinalizar={(saved) => {
          onOrdenPagoFinalizado?.(saved, {
            idsMovimiento: idsMovimientosPagados,
            idCobro: ultimoCobroId,
          });
          setOpenOrden(false);
          onClose?.();
        }}
      />
    </>,
    document.body
  );
}