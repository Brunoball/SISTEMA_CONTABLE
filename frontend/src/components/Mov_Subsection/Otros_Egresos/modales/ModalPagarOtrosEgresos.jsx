import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faMoneyBill1Wave,
  faCircleNotch,
  faPlus,
  faInfoCircle,
  faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../../config/config";
import { filtrarMediosPagoPorPlan } from "../../_shared/planMediosPago";
import { getDetalleMovimiento } from "../../_shared/detalleMovimiento.js";
import "../../../Global/Global_css/Global_Modals.css";
import "../../../Global/Global_css/Global_responsive.css";
import "../../../Global/Global_css/roots.css";
import "../../Recibos/modales/ModalPagarRecibos.css";
import "./ModalPagarOtrosEgresos.css";

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
  return s ? s : "—";
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
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

function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  try {
    return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return String(n).replace(".", ",");
  }
}

function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}

function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    return `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  }
  return s;
}

function getMovimientoId(row) {
  const n = Number(
    row?.id_movimiento ??
      row?.idMovimiento ??
      row?.id_mov ??
      row?.id ??
      row?.id_egreso ??
      row?.idEgreso ??
      row?.movimiento_id ??
      0
  );
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getTotal(row) {
  const n = Number(row?.monto_total ?? row?.total ?? row?.total_general ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function getPagado(row) {
  const explicit = Number(row?.pagado_total ?? row?.monto_pagado ?? row?.total_pagado ?? row?.pagado_total ?? NaN);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);

  const detalle = Array.isArray(row?.medios_pago_detalle) ? row.medios_pago_detalle : [];
  return detalle.reduce((acc, mp) => acc + Math.max(0, safeNumber(mp?.monto ?? mp?.importe ?? 0)), 0);
}

function getSaldo(row) {
  for (const k of ["saldo_pendiente", "saldo_restante", "monto_pendiente", "pendiente", "saldo"]) {
    if (row?.[k] !== undefined && row?.[k] !== null && row?.[k] !== "") {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return Math.max(0, n);
    }
  }
  return Math.max(0, getTotal(row) - getPagado(row));
}

function productosLabel(row) {
  return getDetalleMovimiento(row) || safeText(row?.detalle ?? row?.descripcion ?? row?.concepto);
}

function normalizeMediosPago(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const src = root.listas && typeof root.listas === "object" ? root.listas : root;
  const arr = Array.isArray(src.medios_pago)
    ? src.medios_pago
    : Array.isArray(src.mediosPago)
    ? src.mediosPago
    : [];

  return filtrarMediosPagoPorPlan(arr)
    .map((x) => ({
      id: Number(x?.id ?? x?.id_medio_pago ?? 0) || 0,
      nombre: String(x?.nombre ?? x?.medio_pago ?? x?.descripcion ?? "").trim(),
    }))
    .filter((x) => x.id > 0 && x.nombre);
}

function buildEmptyMedio() {
  return {
    id: uid(),
    id_medio_pago: "",
    monto: 0,
    montoDraft: "",
    montoFocused: false,
  };
}

function buildAuthHeaders(includeJson = false) {
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    localStorage.getItem("x_session") ||
    ""
  ).trim();
  const token = (localStorage.getItem("token") || "").trim();
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function getAuthInfo() {
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}
  return { idUsuario, idUsuarioMaster: idUsuario };
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

function EstadoChipEgreso({ row }) {
  const montoPagado = getPagado(row);
  const saldo = getSaldo(row);
  const estaPagado = saldo <= 0.009;
  const parcial = !estaPagado && montoPagado > 0.009;

  return (
    <span className={`mpr-chip ${estaPagado ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {estaPagado ? "PAGADO" : parcial ? "PENDIENTE PARCIAL" : "PENDIENTE"}
    </span>
  );
}

function MedioPagoRowEgreso({ row, mediosPagoList, onUpdate, onRemove, onCompletar, saving, canRemove, restanteParaEstaFila }) {
  const montoVisible = safeNumber(row.monto);
  const puedeCompletarRestante = !saving && restanteParaEstaFila > 0.009;

  return (
    <div className="nc-mp-card">
      <div className="nc-mp-row nc-mp-row--medio">
        <div className="nc-field" style={{ position: "relative" }}>
          <select
            className="nc-input nc-select"
            value={String(row.id_medio_pago || "")}
            onChange={(e) => onUpdate(row.id, { id_medio_pago: e.target.value })}
            disabled={saving}
          >
            <option value="">Seleccionar…</option>
            {mediosPagoList.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.nombre}
              </option>
            ))}
          </select>
          <label className={`nc-label${row.id_medio_pago ? " nc-label--up" : ""}`}>Medio de pago</label>
        </div>
      </div>

      <div className="nc-mp-row nc-mp-row--monto">
        <div className="nc-field nc-mp-monto-field" style={{ position: "relative" }}>
          <input
            className="nc-input nc-mp-monto-input"
            type="text"
            inputMode="decimal"
            value={row.montoFocused ? row.montoDraft ?? "" : formatMoneyInputARS(montoVisible)}
            onFocus={(e) => {
              if (saving) return;
              onUpdate(row.id, {
                montoFocused: true,
                montoDraft: formatEditableMoney(montoVisible),
              });
              setTimeout(() => e.target.select(), 0);
            }}
            onChange={(e) => {
              if (saving) return;
              const c = e.target.value.replace(/[^\d,.-]/g, "");
              onUpdate(row.id, {
                montoDraft: c,
                monto: parseMoneyInputARS(c),
              });
            }}
            onBlur={() => {
              if (saving) return;
              const p = parseMoneyInputARS(row.montoDraft);
              onUpdate(row.id, {
                monto: p,
                montoDraft: "",
                montoFocused: false,
              });
            }}
            onKeyDown={(e) => {
              if (saving) return;
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="$ 0,00"
            disabled={saving}
            style={{ height: 32, padding: "0 10px", fontSize: 13, textAlign: "right" }}
          />
          <label className="nc-label nc-label--up">Monto</label>
        </div>

        <div className="nc-mp-actions-col">
          <button
            type="button"
            className="nc-mp-completar"
            onClick={() => onCompletar(row.id)}
            disabled={!puedeCompletarRestante}
            title="Completar importe restante"
          >
            ↓ Rest.
          </button>
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
    </div>
  );
}

function PanelMediosPagoEgreso({ medios, mediosPagoList, saldo, onUpdate, onRemove, onAdd, onCompletar, saving, loadingMedios, suma, diferencia }) {
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
          <FontAwesomeIcon icon={faCircleNotch} spin style={{ fontSize: 11 }} />
          Cargando medios de pago…
        </div>
      )}

      {(Array.isArray(medios) ? medios : []).map((mp) => {
        const restanteParaEstaFila = Math.max(0, saldo - (suma - safeNumber(mp.monto)));
        return (
          <MedioPagoRowEgreso
            key={mp.id}
            row={mp}
            mediosPagoList={mediosPagoList}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onCompletar={onCompletar}
            saving={saving}
            canRemove={medios.length > 1}
            restanteParaEstaFila={restanteParaEstaFila}
          />
        );
      })}

      <div className="nc-mp-totals">
        <span className="nc-mp-totals-asignado">
          Asignado: <b>{moneyARS(suma)}</b>
        </span>
        {diferencia > 0.01 && <span className="nc-mp-totals-falta">Saldo sin cubrir: {moneyARS(diferencia)}</span>}
        {diferencia <= 0.01 && saldo > 0 && <span className="nc-mp-totals-ok">✓ Saldo cubierto</span>}
      </div>

      <button type="button" className="nc-pago-btn" onClick={onAdd} disabled={saving}>
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 11 }} /> Agregar otro medio
      </button>
    </>
  );
}

export default function ModalPagarOtrosEgresos({
  open,
  row,
  lists,
  onClose,
  onSaved,
  onToast,
  onOpenDetalle,
  detalleEgresoOpen = false,
}) {
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);
  const [medios, setMedios] = useState(() => [buildEmptyMedio()]);
  const [selected, setSelected] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [mediosPagoFallback, setMediosPagoFallback] = useState([]);
  const [dark, setDark] = useState(isTemaOscuro());

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isTemaOscuro()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const mediosPagoFromContext = useMemo(() => normalizeMediosPago(lists), [lists]);
  const mediosPagoList = mediosPagoFromContext.length ? mediosPagoFromContext : mediosPagoFallback;

  const fetchMediosPagoFallback = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?action=global_obtener_listas`, {
        method: "GET",
        headers: buildAuthHeaders(false),
      });
      setMediosPagoFallback(normalizeMediosPago(data));
    } catch (e) {
      setMediosPagoFallback([]);
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
    } finally {
      setLoadingMedios(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (!open) return;
    setMedios([buildEmptyMedio()]);
    setSelected(true);
    setSaving(false);
    if (!mediosPagoFromContext.length) fetchMediosPagoFallback();
    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, row, mediosPagoFromContext.length, fetchMediosPagoFallback]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;

      // Si el panel de "Detalle de egreso" está abierto arriba de este modal,
      // dejamos que ese panel maneje Escape. Así no se cierra también "Pagar".
      if (detalleEgresoOpen) return;

      e.preventDefault();
      e.stopPropagation();
      if (!saving) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving, detalleEgresoOpen]);

  const total = getTotal(row);
  const pagado = getPagado(row);
  const saldo = getSaldo(row);
  const totalSeleccionado = selected ? saldo : 0;
  const concepto = productosLabel(row);
  const idMovimiento = getMovimientoId(row);

  const suma = useMemo(() => medios.reduce((acc, mp) => acc + safeNumber(mp.monto), 0), [medios]);
  const diferencia = Math.max(0, totalSeleccionado - suma);

  const updateMedio = useCallback((id, patch) => {
    setMedios((prev) => prev.map((mp) => (mp.id === id ? { ...mp, ...patch } : mp)));
  }, []);

  const addMedio = useCallback(() => setMedios((prev) => [...prev, buildEmptyMedio()]), []);

  const removeMedio = useCallback((id) => {
    setMedios((prev) => {
      const next = prev.filter((mp) => mp.id !== id);
      return next.length ? next : [buildEmptyMedio()];
    });
  }, []);

  const completarRestante = useCallback(
    (id) => {
      setMedios((prev) => {
        const actual = prev.find((mp) => mp.id === id);
        const sumaOtros = prev.reduce((acc, mp) => (mp.id === id ? acc : acc + safeNumber(mp.monto)), 0);
        const restante = Math.max(0, totalSeleccionado - sumaOtros);
        if (!actual) return prev;
        return prev.map((mp) =>
          mp.id === id
            ? { ...mp, monto: restante, montoDraft: "", montoFocused: false }
            : mp
        );
      });
    },
    [totalSeleccionado]
  );

  const validate = () => {
    if (!idMovimiento) return "No se encontró el egreso a pagar.";
    if (saldo <= 0.009) return "Este egreso ya está pagado completamente.";
    if (!selected) return "Seleccioná el egreso a pagar.";

    const filas = medios.filter((mp) => Number(mp.id_medio_pago || 0) > 0 || safeNumber(mp.monto) > 0);
    if (!filas.length) return "Debés cargar al menos un medio de pago.";

    for (let i = 0; i < filas.length; i += 1) {
      const mp = filas[i];
      if (!(Number(mp.id_medio_pago || 0) > 0)) return `Medio de pago ${i + 1}: falta seleccionar el medio.`;
      if (!(safeNumber(mp.monto) > 0)) return `Medio de pago ${i + 1}: el monto debe ser mayor a 0.`;
    }

    if (suma <= 0.009) return "El importe a pagar debe ser mayor a 0.";

    if (suma > totalSeleccionado + 0.05) {
      return `La suma de los medios de pago (${moneyARS(suma)}) no puede superar el saldo a pagar (${moneyARS(totalSeleccionado)}).`;
    }

    return "";
  };

  const submit = async () => {
    if (saving) return;
    const msg = validate();
    if (msg) {
      onToast?.("advertencia", msg, 3600);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id_movimiento: idMovimiento,
        medios_pago: medios
          .filter((mp) => Number(mp.id_medio_pago || 0) > 0 && safeNumber(mp.monto) > 0)
          .map((mp, index) => ({
            id_medio_pago: Number(mp.id_medio_pago),
            monto: safeNumber(mp.monto),
            original_index: index,
          })),
        ...getAuthInfo(),
      };

      const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?action=otros_egresos_confirmar_pago`, {
        method: "POST",
        headers: buildAuthHeaders(true),
        body: JSON.stringify(payload),
      });

      onToast?.("exito", data?.mensaje || "Pago registrado correctamente.", 2600);
      await onSaved?.(data);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4600);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const modalClass = ["mi-modal__container", "mi-modal__container--mov", "mpr-modal", dark ? "mi-modal--dark" : ""]
    .join(" ")
    .trim();

  const overlayClass = ["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""]
    .join(" ")
    .trim();

  const canConfirm =
    !saving &&
    !loadingMedios &&
    selected &&
    suma > 0.009 &&
    suma <= totalSeleccionado + 0.05 &&
    medios.some((mp) => Number(mp.id_medio_pago || 0) > 0);

  return createPortal(
    <div className={overlayClass} role="dialog" aria-modal="true">
      <div className={modalClass} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faMoneyBill1Wave} />
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Pagar otro egreso</h2>
            <p className="mi-modal__subtitle">
              {safeText(concepto)}{idMovimiento ? ` · ID ${idMovimiento}` : ""}
            </p>
          </div>
          <button
            ref={firstFocusRef}
            type="button"
            className="mi-modal__close"
            onClick={onClose}
            title="Cerrar"
            disabled={saving}
          >
            <FontAwesomeIcon icon={faXmark} />
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

              <div className="mpr-tbody">
                <div
                  className={`mpr-row ${selected ? "is-checked" : ""}`}
                  role="row"
                  onClick={() => !saving && setSelected((v) => !v)}
                >
                  <div className="mpr-td mpr-td--sel" onClick={(e) => e.stopPropagation()}>
                    <label className={`mpr-check ${saving ? "is-disabled" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelected((v) => !v)}
                        disabled={saving}
                      />
                      <span className="mpr-check__box" aria-hidden="true" />
                    </label>
                  </div>
                  <div className="mpr-td">{safeText(formatFechaDMY(row?.fecha))}</div>
                  <div className="mpr-td mpr-td--desc" title={safeText(concepto)}>{concepto}</div>
                  <div className="mpr-td mpr-td--center">
                    <EstadoChipEgreso row={row} />
                  </div>
                  <div className="mpr-td mpr-td--right mpr-td--mono">{moneyARS(saldo)}</div>
                  <div className="mpr-td mpr-td--info" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="mpr-info-btn"
                      title="Ver detalle de egreso"
                      onClick={() => onOpenDetalle?.(row)}
                      disabled={!row}
                    >
                      <FontAwesomeIcon icon={faInfoCircle} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mpr-tfoot">
                <div className="mpr-tfoot-stats">
                  <span className="mpr-stat">Total <b>1</b></span>
                  <span className="mpr-stat-sep" />
                  <span className="mpr-stat">Seleccionadas <b>{selected ? 1 : 0}</b></span>
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
                    <span>Datos del pago</span>
                  </div>

                  <div className="nc-section-body">
                    <button
                      type="button"
                      className="nv-foot-btn"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={() => !saving && setSelected((v) => !v)}
                      disabled={saving}
                    >
                      <span className="nv-foot-btn__icon">
                        <FontAwesomeIcon icon={faListCheck} style={{ fontSize: 10 }} />
                      </span>
                      {selected ? "Deseleccionar" : "Seleccionar"}
                    </button>

                    <div className="nc-section-divider" />

                    <PanelMediosPagoEgreso
                      medios={medios}
                      mediosPagoList={mediosPagoList}
                      saldo={totalSeleccionado}
                      onUpdate={updateMedio}
                      onRemove={removeMedio}
                      onAdd={addMedio}
                      onCompletar={completarRestante}
                      saving={saving}
                      loadingMedios={loadingMedios}
                      suma={suma}
                      diferencia={diferencia}
                    />
                  </div>
                </div>
              </aside>

              <div className="nc-actions mi-cr-filters__actions mi-cr-filters__actions--sticky">
                <button type="button" className="mit-btn mit-btn--solid mit-btn--block" onClick={submit} disabled={!canConfirm}>
                  {saving ? (
                    <>
                      <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
                      Procesando…
                    </>
                  ) : (
                    "Confirmar pago"
                  )}
                </button>

                <button type="button" className="mit-btn mit-btn--ghost mit-btn--block" onClick={onClose} disabled={saving}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
