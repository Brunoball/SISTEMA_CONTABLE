// ✅ REEMPLAZAR COMPLETO
// src/components/Movimientos/modales/ModalPagarOrdenesPago.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_Modals.css";
import "../../Recibos/modales/ModalPagarRecibos.css";
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCheck, faListCheck, faMoneyBill1Wave, faCircleNotch } from "@fortawesome/free-solid-svg-icons";

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

/* =========================
   Dark mode helper
========================= */
function isTemaOscuro() {
  return document.documentElement.getAttribute("data-theme") === "oscuro";
}

/* =========================
   Auth helpers (X-Session)
========================= */
function getSessionKey() {
  return (localStorage.getItem("session_key") || "").trim();
}
function buildAuthHeaders() {
  const session = getSessionKey();
  const headers = {};
  if (session) headers["X-Session"] = session;
  return headers;
}

/* =========================
   fetch JSON helper
========================= */
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

/* =========================
   Medios de pago normalizer
========================= */
function normalizeMediosPago(raw) {
  const root = raw && typeof raw === "object" ? raw : {};
  const src = root.listas && typeof root.listas === "object" ? root.listas : root;

  const arr = Array.isArray(src.medios_pago)
    ? src.medios_pago
    : Array.isArray(src.mediosPago)
    ? src.mediosPago
    : Array.isArray(src.medios)
    ? src.medios
    : [];

  return arr
    .map((x) => ({
      id: Number(x?.id ?? x?.id_medio_pago ?? x?.idMedioPago ?? 0) || 0,
      nombre: String(x?.nombre ?? x?.medio_pago ?? x?.medioPago ?? "").trim(),
    }))
    .filter((x) => x.id > 0 && x.nombre);
}

/* =========================
   Estado (pagado/pendiente)
   (OrdenesPago suele venir con pagado 0/1)
========================= */
function isPagadoRow(row) {
  if (row?.pagado === true) return true;
  if (Number(row?.pagado ?? 0) === 1) return true;

  // fallback por si viene “cobrado_total” o algo parecido
  const cob = Number(row?.cobrado_total ?? 0);
  if (Number.isFinite(cob) && cob > 0.00001) return true;

  return false;
}

function EstadoChip({ estado }) {
  const isOk = String(estado).toUpperCase() === "PAGADO";
  return <span className={`mpr-chip ${isOk ? "mpr-chip--ok" : "mpr-chip--warn"}`}>{estado}</span>;
}

export default function ModalPagarOrdenesPago({
  open,
  onClose,
  onConfirm,
  onToast,
  proveedor,
  deudas = [],
  // ✅ si vienen listas del padre, las usamos (evita fetch extra)
  lists = null,
}) {
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isTemaOscuro()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ rows local para poder “marcar pagado” sin recargar
  const [rows, setRows] = useState(() => []);

  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [idMedioPago, setIdMedioPago] = useState("");

  const hydrateFromListsIfAny = useCallback(() => {
    const mp = normalizeMediosPago(lists);
    if (mp.length) {
      setMediosPago(mp);
      setLoadingMedios(false);
      return true;
    }
    return false;
  }, [lists]);

  const fetchMediosPago = useCallback(async () => {
    // ✅ primero intentamos listas del padre
    if (hydrateFromListsIfAny()) return;

    try {
      setLoadingMedios(true);

      const url = `${BASE_URL}/api.php?action=global_obtener_listas`;
      const data = await fetchJsonOrThrow(url, { method: "GET", headers: buildAuthHeaders() });

      const mp = normalizeMediosPago(data);
      setMediosPago(mp);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
      setIdMedioPago("");
    } finally {
      setLoadingMedios(false);
    }
  }, [hydrateFromListsIfAny, onToast]);

  useEffect(() => {
    if (!open) return;

    setSelectedIds(new Set());
    setPagaTodo(false);
    setLoading(false);

    setRows(Array.isArray(deudas) ? [...deudas] : []);

    setMediosPago([]);
    setIdMedioPago("");
    fetchMediosPago();

    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, fetchMediosPago, deudas]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  const cantSeleccionadas = useMemo(() => selectedIds.size, [selectedIds]);

  const toggleOne = (id, row) => {
    if (!id) return;
    if (loading) return;
    if (isPagadoRow(row)) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      const pendientes = deudasOrdenadas.filter((x) => !isPagadoRow(x));
      if (next.size !== pendientes.length) setPagaTodo(false);
      if (pendientes.length > 0 && next.size === pendientes.length) setPagaTodo(true);

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

      if (shouldSelectAll) {
        pendientes.forEach((id) => next.add(id));
        setPagaTodo(true);
      } else {
        setPagaTodo(false);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este proveedor no tiene deudas.", 2600);
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    if (seleccion.length === 0) {
      onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para pagar.", 2600);
      return;
    }

    if (!idMedioPago) {
      onToast?.("error", "Seleccioná un medio de pago.", 2600);
      return;
    }

    if (!onConfirm) {
      onToast?.("error", "Falta conectar la acción de confirmación (onConfirm).", 3200);
      return;
    }

    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) {
      onToast?.("error", "Medio de pago inválido. Reintentá.", 2800);
      return;
    }

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);

    const payload = {
      proveedor: {
        id_proveedor: proveedor?.id_proveedor ?? null,
        nombre: proveedor?.proveedor ?? "",
      },
      seleccion,
      totalSeleccionado,
      id_medio_pago: mp.id,
      medio_pago: mp.nombre,
    };

    try {
      setLoading(true);

      await onConfirm(payload);

      // ✅ UX: marcar pagado local sin recargar
      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const id = Number(r?.id_movimiento || 0);
          if (!id || !ids.includes(id)) return r;
          // compat: algunos usan "pagado" 1/0
          return {
            ...r,
            pagado: 1,
            cobrado_total: Number(r?.monto_total ?? r?.total ?? 0) || 0,
          };
        })
      );

      setSelectedIds(new Set());
      setPagaTodo(false);

      onToast?.("exito", "Pago confirmado.", 2400);

      // si querés cerrar automáticamente como el anterior:
      onClose?.();
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4200);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const modalClass = ["mi-modal__container", "mi-modal__container--mov", "mpr-modal", dark ? "mi-modal--dark" : ""]
    .join(" ")
    .trim();

  const overlayClass = ["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""]
    .join(" ")
    .trim();

  return createPortal(
    <div className={overlayClass} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={modalClass} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header (igual Recibos) */}
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <FontAwesomeIcon icon={faMoneyBill1Wave} />
              <span>Pagar</span>
              <span className="mpr-dot">·</span>
              <span className="mpr-clientName">{safeText(proveedor?.proveedor)}</span>

              {proveedor?.id_proveedor ? (
                <span className="mpr-clientIdPill" title={`ID Proveedor: ${proveedor.id_proveedor}`}>
                  ID {String(proveedor.id_proveedor)}
                </span>
              ) : null}
            </div>

            <div className="mi-modal__subtitle mpr-subtitle">
              Se muestran pendientes y pagadas (las pagadas quedan bloqueadas)
            </div>
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

        {/* Body (igual Recibos) */}
        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card">
              <div className="mpr-formRow">
                <div className="mpr-field">
                  <label>Medio de pago</label>

                  <div className="mpr-selectWrap">
                    <select
                      value={idMedioPago}
                      onChange={(e) => setIdMedioPago(e.target.value)}
                      disabled={loading || loadingMedios}
                      className="mpr-select"
                    >
                      <option value="">
                        {loadingMedios ? "Cargando medios de pago…" : "Seleccioná un medio de pago…"}
                      </option>

                      {!loadingMedios && mediosPago.length === 0 && (
                        <option value="" disabled>
                          (Sin medios de pago)
                        </option>
                      )}

                      {mediosPago.map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>

                    {loadingMedios && (
                      <span className="mpr-selectSpinner" title="Cargando…">
                        <FontAwesomeIcon icon={faCircleNotch} spin />
                      </span>
                    )}
                  </div>
                </div>

                <div className="mpr-field">
                  <label>Total seleccionado</label>
                  <div className="mpr-totalPill">{moneyARS(totalSeleccionado)}</div>
                </div>

                <div className="mpr-field mpr-field--actions">
                  <label className="mpr-labelGhost">Acciones</label>
                  <button
                    type="button"
                    className="mov-btn mov-btn--ghost mpr-btnWide mpr-btnInCard"
                    onClick={toggleAll}
                    disabled={!deudasOrdenadas.length || loading}
                    title="Seleccionar / deseleccionar todas (solo pendientes)"
                  >
                    <FontAwesomeIcon icon={faListCheck} />
                    {pagaTodo ? "Deseleccionar todas" : "Seleccionar todas"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mpr-tableWrap">
              <div className="mpr-tableTitle">
                <span>Deudas del proveedor</span>
                <div className="mpr-actionsRight">
                  <div className="mpr-miniStat">
                    <span>Total</span>
                    <b>{deudasOrdenadas.length}</b>
                  </div>
                  <div className="mpr-miniStat">
                    <span>Seleccionadas</span>
                    <b>{cantSeleccionadas}</b>
                  </div>
                </div>
              </div>

              <div className="mpr-table">
                <div className="mpr-thead" role="row">
                  <div className="mpr-th mpr-th--center">Sel</div>
                  <div className="mpr-th">Fecha</div>
                  <div className="mpr-th">Descripción</div>
                  <div className="mpr-th mpr-th--center">Estado</div>
                  <div className="mpr-th mpr-th--right">Monto</div>
                </div>

                <div className="mpr-tbody">
                  {!deudasOrdenadas.length && <div className="mpr-empty">No hay deudas para este proveedor.</div>}

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
                        <div className="mpr-td mpr-td--center" onClick={(e) => e.stopPropagation()}>
                          <label className={`mpr-checkWrap ${!id || loading || pagado ? "is-disabled" : ""}`}>
                            <input
                              className="mpr-checkInput"
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleOne(id, r)}
                              disabled={!id || loading || pagado}
                            />
                            <span className="mpr-checkBox" aria-hidden="true" />
                          </label>
                        </div>

                        <div className="mpr-td">{safeText(formatFechaDMY(r?.fecha))}</div>

                        <div className="mpr-td mpr-td--desc" title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}>
                          {safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                        </div>

                        <div className="mpr-td mpr-td--center">
                          <EstadoChip estado={pagado ? "PAGADO" : "PENDIENTE"} />
                        </div>

                        <div className="mpr-td mpr-td--right">{moneyARS(monto)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (igual Recibos, sin Factura) */}
        <div className="mi-modal__footer mpr-footer">
          <button type="button" className="mpr-btn mpr-btn--ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </button>

          <button
            type="button"
            className="mpr-btn mpr-btn--primary"
            onClick={handleConfirm}
            disabled={loading || selectedIds.size === 0 || !idMedioPago}
            title={
              selectedIds.size === 0
                ? "Seleccioná al menos una deuda pendiente"
                : !idMedioPago
                ? "Seleccioná un medio de pago"
                : "Confirmar pago"
            }
          >
            <FontAwesomeIcon icon={faCheck} />
            {loading ? "Procesando…" : "Confirmar pago"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}