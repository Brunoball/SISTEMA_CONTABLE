import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMoneyCheckDollar,
  faPlus,
  faCircleNotch,
  faCreditCard,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";

// ── Helpers ──
const NULL_OPTION = "";
function uid() {
  return (
    crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
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
  if (s.includes(",") && s.includes("."))
    s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}
function getMedioPagoId(mp) {
  const c =
    mp?.id ??
    mp?.id_medio_pago ??
    mp?.medio_pago_id ??
    mp?.idMedioPago ??
    null;
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
  if (s.includes("echeq") || s.includes("e-cheq") || s.includes("e cheq"))
    return "echeq";
  if (s.includes("cheque")) return "cheque";
  return null;
}
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m)
    return `${String(Number(m[3])).padStart(2, "0")}/${String(
      Number(m[2])
    ).padStart(2, "0")}/${m[1]}`;
  return s;
}

export function buildEmptyMedioPago() {
  return {
    id: uid(),
    id_medio_pago: NULL_OPTION,
    monto: 0,
    montoDraft: "",
    montoFocused: false,
    id_cheque: [],
    chequesDisponibles: [],
    loadingCheques: false,
  };
}

// ============================================================
// CHEQUE CARD — nuevo diseño inspirado en cheque bancario real
// ============================================================
function ChequeCard({ ch, checked, onToggle }) {
  const isEcheq = String(ch?.tipo || "").toLowerCase().includes("echeq");

  return (
    <button
      type="button"
      className={["cheque-card", checked ? "cheque-card--selected" : "", isEcheq ? "cheque-card--echeq" : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onToggle(String(ch?.id_cheque || ""))}
    >
      {/* ── HEADER ── */}
      <div className="cheque-card__header">
        <div className="cheque-card__header-dots" aria-hidden="true" />

        {/* Brand */}
        <div className="cheque-card__brand">
          <div className="cheque-card__logo-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2C5.8 2 4 3.6 4 5.6c0 1.4.8 2.6 2 3.2V13h4V8.8c1.2-.6 2-1.8 2-3.2C12 3.6 10.2 2 8 2z"
                fill="currentColor"
                opacity="0.9"
              />
            </svg>
          </div>
          <div>
            <div className="cheque-card__bank-name">
              {safeText(ch?.banco) !== "-" ? safeText(ch?.banco) : "Cheque"}
            </div>
            <div className="cheque-card__bank-sub">
              {isEcheq ? "E-CHEQ ELECTRÓNICO" : "CHEQUE DE PAGO DIFERIDO"}
            </div>
          </div>
        </div>

        {/* Número */}
        <div className="cheque-card__header-right">
          <span className="cheque-card__num-label">N°</span>
          <span className="cheque-card__num-value">
            {safeText(ch?.numero_cheque)}
          </span>
        </div>

        {/* Slash decorativo */}
        <div className="cheque-card__slash" aria-hidden="true" />
      </div>

      {/* ── BODY ── */}
      <div className="cheque-card__body">
        {/* Fila 1: Emisor + Fecha emisión */}
        <div className="cheque-card__row cheque-card__row--spaced">
          <div className="cheque-card__field cheque-card__field--wide">
            <span className="cheque-card__field-label">Emisor</span>
            <div className="cheque-card__field-line">
              {safeText(ch?.emisor)}
            </div>
          </div>
          <div className="cheque-card__field">
            <span className="cheque-card__field-label">F. emisión</span>
            <div className="cheque-card__field-line cheque-card__field-line--mono">
              {safeText(formatFechaDMY(ch?.fecha_emision))}
            </div>
          </div>
        </div>

        {/* Fila 2: A la orden de + Importe */}
        <div className="cheque-card__row cheque-card__row--spaced">
                    <div className="cheque-card__field">
            <span className="cheque-card__field-label">F. pago</span>
            <div className="cheque-card__field-line cheque-card__field-line--mono">
              {safeText(formatFechaDMY(ch?.fecha_pago))}
            </div>
          </div>

          <div className="cheque-card__importe-box">
            <span className="cheque-card__importe-symbol">$</span>
            <span className="cheque-card__importe-value">
              {ch?.importe > 0
                ? moneyARS(ch.importe)
                : <span className="cheque-card__field-empty">0,00</span>}
            </span>
          </div>
        </div>


      </div>

      {/* ── MICR ── */}
      <div className="cheque-card__micr">
        <div className="cheque-card__micr-accent" aria-hidden="true" />
        <span className="cheque-card__micr-text">

        </span>
        <div className="cheque-card__security">
          <svg width="11" height="13" viewBox="0 0 12 14" fill="none">
            <rect x="1" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="6" cy="9" r="1.2" fill="currentColor" />
          </svg>
          <span>Seguridad</span>
        </div>
      </div>

      {/* Badge seleccionado */}
      {checked && (
        <div className="cheque-card__check-badge" aria-label="Seleccionado">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4l2.5 2.5L9 1"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

// ── Lista de tarjetas de cheques ──
function ChequesCarteraCards({ cheques, idsSeleccionados, onToggle }) {
  if (!cheques.length) return null;
  return (
    <div className="cheques-cards-pn">
      {cheques.map((ch, idx) => {
        const checked = idsSeleccionados.includes(String(ch?.id_cheque));
        return (
          <ChequeCard
            key={ch?.id_cheque || idx}
            ch={ch}
            checked={checked}
            onToggle={onToggle}
          />
        );
      })}
    </div>
  );
}

// ── Fila de un medio de pago dentro del mini-modal ──
function MpRow({
  row,
  idx,
  mediosPagoList,
  totalCompra,
  sumaMediosPago,
  onUpdate,
  onRemove,
  apiGet,
  BASE_URL,
  showToast,
}) {
  const mpSeleccionado = useMemo(
    () =>
      mediosPagoList.find(
        (x) =>
          String(getMedioPagoId(x) ?? "") === String(row.id_medio_pago ?? "")
      ) || null,
    [mediosPagoList, row.id_medio_pago]
  );

  const tipoCheque = useMemo(
    () => normalizeChequeTipoFromMedio(mpSeleccionado?.nombre || ""),
    [mpSeleccionado]
  );

  const esCheque = tipoCheque !== null;

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(0, safeNumber(sumaMediosPago) - safeNumber(row.monto));
    return Math.max(0, safeNumber(totalCompra) - sumaOtros);
  }, [sumaMediosPago, totalCompra, row.monto]);

  const puedeCompletarRestante =
    !esCheque && totalCompra > 0 && restanteParaEstaFila > 0.009;

  const handleChangeMedio = useCallback(
    async (val) => {
      const mp = mediosPagoList.find(
        (x) => String(getMedioPagoId(x) ?? "") === String(val)
      );
      const tipo = normalizeChequeTipoFromMedio(mp?.nombre || "");
      onUpdate(row.id, {
        id_medio_pago: val,
        id_cheque: [],
        chequesDisponibles: [],
        loadingCheques: tipo !== null,
      });
      if (tipo !== null) {
        try {
          const sp = new URLSearchParams();
          sp.set("action", "compras_cheques_cartera_listar");
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
    [row.id, mediosPagoList, onUpdate, apiGet, BASE_URL, showToast]
  );

  const handleToggleCheque = useCallback(
    (idChequeStr) => {
      const current = Array.isArray(row.id_cheque)
        ? row.id_cheque
        : row.id_cheque
        ? [row.id_cheque]
        : [];
      const next = current.includes(idChequeStr)
        ? current.filter((x) => x !== idChequeStr)
        : [...current, idChequeStr];
      onUpdate(row.id, { id_cheque: next });
    },
    [row.id, row.id_cheque, onUpdate]
  );

  const chequesSeleccionados = Array.isArray(row.id_cheque)
    ? row.id_cheque
    : row.id_cheque
    ? [String(row.id_cheque)]
    : [];

  const importeCheques = useMemo(() => {
    if (!esCheque || !chequesSeleccionados.length) return 0;
    return chequesSeleccionados.reduce((acc, idStr) => {
      const ch = row.chequesDisponibles.find(
        (x) => String(x.id_cheque) === idStr
      );
      return acc + (ch ? Number(ch.importe || 0) : 0);
    }, 0);
  }, [esCheque, chequesSeleccionados, row.chequesDisponibles]);

  useEffect(() => {
    if (esCheque && chequesSeleccionados.length > 0) {
      onUpdate(row.id, { monto: importeCheques });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importeCheques, esCheque]);

  return (
    <div className="mp-card">
      {/* Fila principal */}
      <div className="mp-card__top">
        {/* Selector medio */}
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
                <option
                  key={idMp ?? x?.nombre ?? uid()}
                  value={idMp != null ? String(idMp) : ""}
                >
                  {String(x?.nombre ?? "").trim() || "Medio"}
                </option>
              );
            })}
          </select>
        </div>

        {/* Monto */}
        <div>
          <div className="mp-field-label">Monto</div>
          <input
            className="mp-input-monto"
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
              const raw = e.target.value;
              const c = raw.replace(/[^\d,.\-]/g, "");
              onUpdate(row.id, {
                montoDraft: c,
                monto: parseMoneyInputARS(c),
              });
            }}
            onBlur={() => {
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, {
                monto: p,
                montoDraft: "",
                montoFocused: false,
              });
            }}
            placeholder="$ 0,00"
            disabled={esCheque && chequesSeleccionados.length > 0}
          />
        </div>

        {/* Acciones */}
        <div className="mp-card__actions">
          {!esCheque && (
            <button
              type="button"
              className="mp-btn-completar"
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
          <button
            type="button"
            className="mp-btn-del"
            onClick={() => onRemove(row.id)}
            title="Quitar"
          >
            ×
          </button>
        </div>
      </div>

      {/* Panel cheques */}
      {esCheque && (
        <div className="mp-cheques-panel">
          <div className="mp-cheques-title">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 12 }} />
            {tipoCheque === "echeq" ? "eCheqs en cartera" : "Cheques en cartera"}
          </div>

          {row.loadingCheques ? (
            <div className="mp-cheques-loading">
              <FontAwesomeIcon icon={faCircleNotch} spin />
              Cargando…
            </div>
          ) : row.chequesDisponibles.length === 0 ? (
            <div className="mp-cheques-empty">
              No hay {tipoCheque === "echeq" ? "eCheqs" : "cheques"} activos en
              cartera.
            </div>
          ) : (
            <ChequesCarteraCards
              cheques={row.chequesDisponibles}
              idsSeleccionados={chequesSeleccionados}
              onToggle={handleToggleCheque}
            />
          )}

          {chequesSeleccionados.length > 0 && (
            <div className="mp-cheques-sum">
              ✓ {chequesSeleccionados.length} cheque(s) — {moneyARS(importeCheques)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MINI-MODAL PRINCIPAL
// ============================================================
export function ModalMediosPago({
  open,
  mediosPagoList,
  totalCompra,
  mediosFilas,
  onUpdate,
  onAdd,
  onRemove,
  onClose,
  onConfirm,
  apiGet,
  BASE_URL,
  showToast,
  dark,
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const sumaMediosPago = useMemo(
    () => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0),
    [mediosFilas]
  );

  const diferenciaRestante = useMemo(
    () => Math.max(0, safeNumber(totalCompra) - sumaMediosPago),
    [totalCompra, sumaMediosPago]
  );

  const cubierto = diferenciaRestante <= 0.01 && totalCompra > 0;

  if (!open) return null;

  return createPortal(
    <div
      className="mp-modal__overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={["mp-modal", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mp-modal__head">
          <div className="mp-modal__head-icon">
            <FontAwesomeIcon icon={faCreditCard} />
          </div>
          <div className="mp-modal__head-texts">
            <div className="mp-modal__title">Medios de pago</div>
            <div className="mp-modal__subtitle">
              Total a cubrir: {moneyARS(totalCompra)}
            </div>
          </div>
          <button
            type="button"
            className="mp-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="mp-modal__body">
          {mediosFilas.map((mp, idx) => (
            <MpRow
              key={mp.id}
              row={mp}
              idx={idx}
              mediosPagoList={mediosPagoList}
              totalCompra={totalCompra}
              sumaMediosPago={sumaMediosPago}
              onUpdate={onUpdate}
              onRemove={onRemove}
              apiGet={apiGet}
              BASE_URL={BASE_URL}
              showToast={showToast}
            />
          ))}
        </div>

        {/* Totales */}
        <div className="mp-modal__totals">
          <div className="mp-totals-info">
            <span className="mp-totals-asignado">
              Asignado: <b>{moneyARS(sumaMediosPago)}</b>
            </span>
            {diferenciaRestante > 0.01 && (
              <span className="mp-totals-falta">
                Falta: {moneyARS(diferenciaRestante)}
              </span>
            )}
            {cubierto && (
              <span className="mp-totals-ok">
                <FontAwesomeIcon icon={faCheck} style={{ fontSize: 11 }} />
                Cubierto
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mp-modal__footer">
          <div className="mp-footer-left">
            <button type="button" className="mp-btn-agregar" onClick={onAdd}>
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
              Agregar medio
            </button>
          </div>
          <button type="button" className="mp-btn-confirmar" onClick={onConfirm}>
            <FontAwesomeIcon icon={faCheck} style={{ fontSize: 12, opacity: 0.85 }} />
            Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================
// RESUMEN MINIMALISTA EN PANEL
// ============================================================
export function PagoResumenPanel({
  mediosFilas,
  mediosPagoList,
  totalCompra,
  onEdit,
}) {
  const sumaMediosPago = useMemo(
    () => mediosFilas.reduce((a, r) => a + safeNumber(r.monto), 0),
    [mediosFilas]
  );

  const diferenciaRestante = useMemo(
    () => Math.max(0, safeNumber(totalCompra) - sumaMediosPago),
    [totalCompra, sumaMediosPago]
  );

  const cubierto = diferenciaRestante <= 0.01 && totalCompra > 0;

  const filasConMedio = mediosFilas.filter(
    (r) => r.id_medio_pago && r.id_medio_pago !== ""
  );

  if (!filasConMedio.length) return null;

  return (
    <div className="nc-pago-resumen">
      <div className="nc-pago-resumen__head">
        <span className="nc-pago-resumen__label">Pago configurado</span>
        <button type="button" className="nc-pago-resumen__edit" onClick={onEdit}>
          ✎ Editar
        </button>
      </div>

      <div className="nc-pago-resumen__body">
        {filasConMedio.map((mp) => {
          const mpObj = mediosPagoList.find(
            (x) =>
              String(getMedioPagoId(x) ?? "") === String(mp.id_medio_pago ?? "")
          );
          const nombre = String(mpObj?.nombre ?? "").trim() || "Medio";
          const tipoCheque = normalizeChequeTipoFromMedio(nombre);
          const esCheque = tipoCheque !== null;
          const cantCheques = Array.isArray(mp.id_cheque)
            ? mp.id_cheque.length
            : mp.id_cheque
            ? 1
            : 0;

          return (
            <div key={mp.id} className="nc-pago-resumen__row">
              <div className="nc-pago-resumen__medio">
                <div className="nc-pago-resumen__dot" />
                <span className="nc-pago-resumen__nombre" title={nombre}>
                  {nombre}
                </span>
                {esCheque && cantCheques > 0 && (
                  <span className="nc-pago-resumen__cheque-badge">
                    {cantCheques} {tipoCheque === "echeq" ? "eCheq" : "ch."}
                  </span>
                )}
              </div>
              <span className="nc-pago-resumen__monto">{moneyARS(mp.monto)}</span>
            </div>
          );
        })}

        {filasConMedio.length > 1 && (
          <>
            <div className="nc-pago-resumen__divider" />
            <div className="nc-pago-resumen__total-row">
              <span className="nc-pago-resumen__total-label">Total</span>
              <span className="nc-pago-resumen__total-val">
                {moneyARS(sumaMediosPago)}
              </span>
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          {cubierto ? (
            <span className="nc-pago-resumen__ok-badge">✓ Cubierto</span>
          ) : (
            <span className="nc-pago-resumen__warn-badge">
              Falta {moneyARS(diferenciaRestante)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}