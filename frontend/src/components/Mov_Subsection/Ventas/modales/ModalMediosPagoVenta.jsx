import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyCheckDollar,
  faPlus,
  faCreditCard,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../../config/config";
import ModalNuevoCheque from "../../../Global/Modales/ModalNuevoCheque.jsx";

const NULL_OPTION = "";

const API_CHECK_NUMERO = `${BASE_URL}/api.php?action=ventas_cheques_obtener&modo=verificar_numero`;

function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

function getAuthHeaders() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";

  const token = localStorage.getItem("token") || "";
  const headers = {};

  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;

  return headers;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}`);
  }
}

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}
function getMedioPagoId(mp) {
  const c = mp?.id ?? mp?.id_medio_pago ?? mp?.medio_pago_id ?? mp?.idMedioPago ?? null;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : null;
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
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  return s;
}

export function buildEmptyMedioPagoVenta() {
  return {
    id: uid(),
    id_medio_pago: NULL_OPTION,
    monto: 0,
    montoDraft: "",
    montoFocused: false,
    cheque: null,
  };
}

function ChequeResumen({ cheque, tipoCheque }) {
  if (!cheque) return null;

  return (
    <div className="nc-cheques-list" style={{ marginTop: 4 }}>
      <div
        className={`nc-cheque-item nc-cheque-item--selected ${
          tipoCheque === "echeq" ? "nc-cheque-item--echeq" : ""
        }`}
        style={{ cursor: "default" }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            border: `2px solid ${tipoCheque === "echeq" ? "#0055BB" : "#0f766e"}`,
            background: tipoCheque === "echeq" ? "#0055BB" : "#0f766e",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--nv-text)",
                letterSpacing: ".04em",
              }}
            >
              N° {cheque?.numero_cheque || "-"}
            </span>

            {tipoCheque === "echeq" && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".07em",
                  color: "#0055BB",
                  background: "rgba(0,85,187,.07)",
                  border: "1px solid rgba(0,85,187,.28)",
                  borderRadius: 999,
                  padding: "1px 5px",
                  lineHeight: 1.5,
                }}
              >
                eCheq
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", fontSize: 11, color: "var(--nv-muted)", lineHeight: 1.3 }}>
            <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cheque?.emisor || "-"}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Pago: {formatFechaDMY(cheque?.fecha_pago)}</span>
          </div>
        </div>

        <span className="nc-cheque-importe">{moneyARS(cheque?.importe || 0)}</span>
      </div>
    </div>
  );
}

function MpRowVenta({ row, mediosPagoList, totalCompra, sumaMediosPago, onUpdate, onRemove, showToast }) {
  const [openChequeModal, setOpenChequeModal] = useState(false);

  const mpSeleccionado = useMemo(
    () => mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(row.id_medio_pago ?? "")) || null,
    [mediosPagoList, row.id_medio_pago]
  );

  const tipoCheque = useMemo(
    () => normalizeChequeTipoFromMedio(mpSeleccionado?.nombre || ""),
    [mpSeleccionado]
  );
  const esCheque = tipoCheque !== null;

  const montoActual = esCheque && row.cheque ? safeNumber(row.cheque?.importe) : safeNumber(row.monto);

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - montoActual);
    return Math.max(0, safeNumber(totalCompra) - sumaOtros);
  }, [sumaMediosPago, totalCompra, montoActual]);

  const puedeCompletarRestante = !esCheque && totalCompra > 0 && restanteParaEstaFila > 0.009;

  const handleChangeMedio = useCallback(
    (val) => {
      const mp = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(val));
      const tipo = normalizeChequeTipoFromMedio(mp?.nombre || "");
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
        `${tipoCheque === "echeq" ? "eCheq" : "Cheque"} ${cheque.numero_cheque || ""} cargado.`,
        2500
      );
    },
    [onUpdate, row.id, showToast, tipoCheque]
  );
  const verificarNumeroChequeVentas = useCallback(
    async ({ numero_cheque, tipoCheque, initialData }) => {
      const numeroCheque = onlyDigits(numero_cheque);

      if (!numeroCheque) {
        return {
          ok: false,
          tipo: "advertencia",
          mensaje: "Ingresá el número de cheque antes de confirmar.",
          duracion: 3200,
        };
      }

      const params = new URLSearchParams();
      params.set("numero_cheque", numeroCheque);
      params.set("tipo", String(tipoCheque || "cheque"));

      const idChequeActual = Number(initialData?.id_cheque || row?.cheque?.id_cheque || 0);
      if (Number.isFinite(idChequeActual) && idChequeActual > 0) {
        params.set("id_cheque", String(idChequeActual));
      }

      const res = await fetch(`${API_CHECK_NUMERO}&${params.toString()}`, {
        method: "GET",
        headers: getAuthHeaders(),
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
    [row?.cheque?.id_cheque]
  );


  return (
    <div className="mp-card">
      <div className="mp-card__top">
        <div>
          <div className="mp-field-label">Medio de pago</div>
          <select
            className="mp-select"
            value={String(row.id_medio_pago || "")}
            onChange={(e) => handleChangeMedio(e.target.value)}
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
        </div>

        <div>
          <div className="mp-field-label">Monto</div>
          <input
            className="mp-input-monto"
            type="text"
            inputMode="decimal"
            value={row.montoFocused ? row.montoDraft ?? "" : formatMoneyInputARS(montoActual)}
            onFocus={(e) => {
              if (esCheque && row.cheque) return;
              onUpdate(row.id, { montoFocused: true, montoDraft: formatEditableMoney(montoActual) });
              setTimeout(() => e.target.select(), 0);
            }}
            onChange={(e) => {
              if (esCheque && row.cheque) return;
              const c = e.target.value.replace(/[^\d,\.\-]/g, "");
              onUpdate(row.id, { montoDraft: c, monto: parseMoneyInputARS(c) });
            }}
            onBlur={() => {
              if (esCheque && row.cheque) return;
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, { monto: p, montoDraft: "", montoFocused: false });
            }}
            placeholder="$ 0,00"
            disabled={esCheque && !!row.cheque}
          />
        </div>

        <div className="mp-card__actions">
          {!esCheque && (
            <button
              type="button"
              className="mp-btn-completar"
              onClick={() => onUpdate(row.id, { monto: restanteParaEstaFila, montoDraft: "", montoFocused: false })}
              disabled={!puedeCompletarRestante}
              title="Completar importe restante"
            >
              ↓ Rest.
            </button>
          )}
          <button type="button" className="mp-btn-del" onClick={() => onRemove(row.id)} title="Quitar">
            ×
          </button>
        </div>
      </div>

      {esCheque && (
        <div className="mp-cheques-panel">
          <div className="mp-cheques-title">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 12 }} />
            {tipoCheque === "echeq" ? "eCheq cargado" : "Cheque cargado"}
          </div>

          {row.cheque ? (
            <>
              <ChequeResumen cheque={row.cheque} tipoCheque={tipoCheque} />
              <button
                type="button"
                className="mit-btn mit-btn--ghost"
                style={{ width: "100%", marginTop: 10, fontSize: 12 }}
                onClick={() => setOpenChequeModal(true)}
              >
                Editar {tipoCheque === "echeq" ? "eCheq" : "cheque"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="mit-btn mit-btn--solid"
              style={{ width: "100%", marginTop: 4 }}
              onClick={() => setOpenChequeModal(true)}
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
          verificarNumeroCheque={verificarNumeroChequeVentas}
        />
      )}
    </div>
  );
}

export function ModalMediosPagoVenta({
  open,
  mediosPagoList,
  totalCompra,
  mediosFilas,
  onUpdate,
  onAdd,
  onRemove,
  onClose,
  onConfirm,
  showToast,
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      onClose?.();
    };
    document.addEventListener("keydown", h, true);
    return () => document.removeEventListener("keydown", h, true);
  }, [open, onClose]);

  const sumaMediosPago = useMemo(
    () =>
      mediosFilas.reduce((a, r) => {
        const mp = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(r.id_medio_pago ?? ""));
        const tipoCheque = normalizeChequeTipoFromMedio(mp?.nombre || "");
        const monto = tipoCheque !== null && r.cheque ? safeNumber(r.cheque.importe) : safeNumber(r.monto);
        return a + monto;
      }, 0),
    [mediosFilas, mediosPagoList]
  );

  const diferenciaRestante = useMemo(
    () => Math.max(0, safeNumber(totalCompra) - sumaMediosPago),
    [totalCompra, sumaMediosPago]
  );
  const cubierto = diferenciaRestante <= 0.01 && totalCompra > 0;

  if (!open) return null;

  return createPortal(
    <div className="mp-modal__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="mp-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mp-modal__head">
          <div className="mp-modal__head-icon"><FontAwesomeIcon icon={faCreditCard} /></div>
          <div className="mp-modal__head-texts">
            <div className="mp-modal__title">Medios de pago</div>
            <div className="mp-modal__subtitle">Total a cubrir: {moneyARS(totalCompra)}</div>
          </div>
          <button type="button" className="mp-modal__close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="mp-modal__body">
          {mediosFilas.map((mp) => (
            <MpRowVenta
              key={mp.id}
              row={mp}
              mediosPagoList={mediosPagoList}
              totalCompra={totalCompra}
              sumaMediosPago={sumaMediosPago}
              onUpdate={onUpdate}
              onRemove={onRemove}
              showToast={showToast}
            />
          ))}
        </div>

        <div className="mp-modal__totals">
          <div className="mp-totals-info">
            <span className="mp-totals-asignado">Asignado: <b>{moneyARS(sumaMediosPago)}</b></span>
            {diferenciaRestante > 0.01 && <span className="mp-totals-falta">Falta: {moneyARS(diferenciaRestante)}</span>}
            {cubierto && <span className="mp-totals-ok"><FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} /> Cubierto</span>}
          </div>
        </div>

        <div className="mp-modal__footer">
          <div className="mp-footer-left">
            <button type="button" className="mp-btn-agregar" onClick={onAdd}>
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar medio
            </button>
          </div>
          <button type="button" className="mp-btn-confirmar" onClick={onConfirm}>
            <FontAwesomeIcon icon={faCheck} style={{ fontSize: 12, opacity: .85 }} /> Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PanelMediosPagoInlineVenta({ mediosFilas, mediosPagoList, totalCompra, onUpdate, onRemove, onAdd, showToast, saving = false }) {
  const filas = Array.isArray(mediosFilas) && mediosFilas.length ? mediosFilas : [buildEmptyMedioPagoVenta()];
  const sumaMediosPago = useMemo(
    () => filas.reduce((a, r) => {
      const mpObj = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(r.id_medio_pago ?? ""));
      const tipoCheque = normalizeChequeTipoFromMedio(String(mpObj?.nombre ?? "").trim());
      const monto = tipoCheque !== null && r.cheque ? safeNumber(r.cheque.importe) : safeNumber(r.monto);
      return a + monto;
    }, 0),
    [filas, mediosPagoList]
  );
  const diferenciaRestante = useMemo(
    () => Math.max(0, safeNumber(totalCompra) - sumaMediosPago),
    [totalCompra, sumaMediosPago]
  );

  return (
    <>
      {filas.map((mp) => (
        <MpRowVenta
          key={mp.id}
          row={mp}
          mediosPagoList={mediosPagoList}
          totalCompra={totalCompra}
          sumaMediosPago={sumaMediosPago}
          onUpdate={onUpdate}
          onRemove={onRemove}
          showToast={showToast}
        />
      ))}

      <div className="nc-mp-totals">
        <span className="nc-mp-totals-asignado">Asignado: <b>{moneyARS(sumaMediosPago)}</b></span>
        {diferenciaRestante > 0.01 && <span className="nc-mp-totals-falta">Falta: {moneyARS(diferenciaRestante)}</span>}
        {diferenciaRestante <= 0.01 && sumaMediosPago > 0 && <span className="nc-mp-totals-ok">✓ Cubierto</span>}
      </div>

      <button type="button" className="nc-pago-btn" onClick={onAdd} disabled={saving}>
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro medio
      </button>
    </>
  );
}

export function PagoResumenPanelVenta({ mediosFilas, mediosPagoList, totalCompra, onEdit }) {
  const filasConMedio = (mediosFilas || []).filter((r) => r.id_medio_pago && r.id_medio_pago !== "");

  const filasNormalizadas = filasConMedio.map((mp) => {
    const mpObj = mediosPagoList.find((x) => String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago ?? ""));
    const nombre = String(mpObj?.nombre ?? "").trim() || "Medio";
    const tipoCheque = normalizeChequeTipoFromMedio(nombre);
    const monto = tipoCheque !== null && mp.cheque ? safeNumber(mp.cheque.importe) : safeNumber(mp.monto);
    return { ...mp, nombre, tipoCheque, monto };
  });

  const sumaMediosPago = filasNormalizadas.reduce((a, r) => a + safeNumber(r.monto), 0);
  const diferenciaRestante = Math.max(0, safeNumber(totalCompra) - sumaMediosPago);
  const cubierto = diferenciaRestante <= 0.01 && totalCompra > 0;

  if (!filasNormalizadas.length) return null;

  return (
    <div className="nc-pago-resumen">
      <div className="nc-pago-resumen__head">
        <span className="nc-pago-resumen__label">Pago configurado</span>
        <button type="button" className="nc-pago-resumen__edit" onClick={onEdit}>✎ Editar</button>
      </div>
      <div className="nc-pago-resumen__body">
        {filasNormalizadas.map((mp) => (
          <div key={mp.id} className="nc-pago-resumen__row">
            <div className="nc-pago-resumen__medio">
              <div className="nc-pago-resumen__dot" />
              <span className="nc-pago-resumen__nombre" title={mp.nombre}>{mp.nombre}</span>
              {mp.tipoCheque !== null && (
                <span className="nc-pago-resumen__cheque-badge">
                  {mp.tipoCheque === "echeq" ? "eCheq" : "Cheque"}
                </span>
              )}
            </div>
            <span className="nc-pago-resumen__monto">{moneyARS(mp.monto)}</span>
          </div>
        ))}

        {filasNormalizadas.length > 1 && (
          <>
            <div className="nc-pago-resumen__divider" />
            <div className="nc-pago-resumen__total-row">
              <span className="nc-pago-resumen__total-label">Total</span>
              <span className="nc-pago-resumen__total-val">{moneyARS(sumaMediosPago)}</span>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          {cubierto ? (
            <span className="nc-pago-resumen__ok-badge">✓ Cubierto</span>
          ) : (
            <span className="nc-pago-resumen__warn-badge">Falta {moneyARS(diferenciaRestante)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
