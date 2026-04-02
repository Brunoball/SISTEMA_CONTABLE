// ============================================================
// ARCHIVO: ModalMediosPago.jsx
// Mini-modal independiente para seleccionar medios de pago
// Importar y usar dentro de ModalNuevaCompra.jsx
// ============================================================

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

// ── Helpers (copiados de ModalNuevaCompra para que sea autónomo) ──
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
  if (
    s.includes("echeq") ||
    s.includes("e-cheq") ||
    s.includes("e cheq")
  )
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

// ── Tarjetas de cheques ──
function ChequesCarteraCards({ cheques, idsSeleccionados, onToggle }) {
  if (!cheques.length) return null;
  return (
    <div className="mpr-cheques-cards">
      {cheques.map((ch, idx) => {
        const checked = idsSeleccionados.includes(String(ch?.id_cheque));
        return (
          <button
            key={ch?.id_cheque || idx}
            type="button"
            className={`mpr-cheque-card-item ${checked ? "is-checked" : ""}`}
            onClick={() => onToggle(String(ch?.id_cheque || ""))}
          >
            <div className="mpr-cheque-card-top">
              <label
                className="mpr-cheque-check"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(String(ch?.id_cheque || ""))}
                />
                <span className="mpr-cheque-check-ui" />
              </label>
              <div className="mpr-cheque-head-texts">
                <span className="mpr-cheque-number">
                  N° {safeText(ch?.numero_cheque)}
                </span>
              </div>
            </div>
            <div className="mpr-cheque-card-body">
              <div className="mpr-cheque-line">
                <span className="mpr-cheque-label">Emisor</span>
                <span className="mpr-cheque-value">
                  {safeText(ch?.emisor)}
                </span>
              </div>
              <div className="mpr-cheque-line">
                <span className="mpr-cheque-label">F. emisión</span>
                <span className="mpr-cheque-value">
                  {safeText(formatFechaDMY(ch?.fecha_emision))}
                </span>
              </div>
              <div className="mpr-cheque-line">
                <span className="mpr-cheque-label">F. pago</span>
                <span className="mpr-cheque-value">
                  {safeText(formatFechaDMY(ch?.fecha_pago))}
                </span>
              </div>
            </div>
          </button>
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
          String(getMedioPagoId(x) ?? "") ===
          String(row.id_medio_pago ?? "")
      ) || null,
    [mediosPagoList, row.id_medio_pago]
  );

  const tipoCheque = useMemo(
    () => normalizeChequeTipoFromMedio(mpSeleccionado?.nombre || ""),
    [mpSeleccionado]
  );

  const esCheque = tipoCheque !== null;

  const restanteParaEstaFila = useMemo(() => {
    const sumaOtros = Math.max(
      0,
      safeNumber(sumaMediosPago) - safeNumber(row.monto)
    );
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
            chequesDisponibles: Array.isArray(data?.cheques)
              ? data.cheques
              : [],
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
            <FontAwesomeIcon
              icon={faMoneyCheckDollar}
              style={{ fontSize: 12 }}
            />
            {tipoCheque === "echeq"
              ? "eCheqs en cartera"
              : "Cheques en cartera"}
          </div>

          {row.loadingCheques ? (
            <div className="mp-cheques-loading">
              <FontAwesomeIcon icon={faCircleNotch} spin />
              Cargando…
            </div>
          ) : row.chequesDisponibles.length === 0 ? (
            <div className="mp-cheques-empty">
              No hay{" "}
              {tipoCheque === "echeq" ? "eCheqs" : "cheques"} activos en
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
              ✓ {chequesSeleccionados.length} cheque(s) —{" "}
              {moneyARS(importeCheques)}
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
            <button
              type="button"
              className="mp-btn-agregar"
              onClick={onAdd}
            >
              <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} />
              Agregar medio
            </button>
          </div>
          <button
            type="button"
            className="mp-btn-confirmar"
            onClick={onConfirm}
          >
            <FontAwesomeIcon
              icon={faCheck}
              style={{ fontSize: 12, opacity: 0.85 }}
            />
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
        <button
          type="button"
          className="nc-pago-resumen__edit"
          onClick={onEdit}
        >
          ✎ Editar
        </button>
      </div>

      <div className="nc-pago-resumen__body">
        {filasConMedio.map((mp) => {
          const mpObj = mediosPagoList.find(
            (x) =>
              String(getMedioPagoId(x) ?? "") ===
              String(mp.id_medio_pago ?? "")
          );
          const nombre =
            String(mpObj?.nombre ?? "").trim() || "Medio";
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
              <span className="nc-pago-resumen__monto">
                {moneyARS(mp.monto)}
              </span>
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

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          {cubierto ? (
            <span className="nc-pago-resumen__ok-badge">
              ✓ Cubierto
            </span>
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