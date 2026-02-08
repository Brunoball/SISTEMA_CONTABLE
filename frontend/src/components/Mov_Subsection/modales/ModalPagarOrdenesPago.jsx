// src/components/Movimientos/modales/ModalPagarOrdenesPago.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // estética base
import "./ModalPagarRecibos.css"; // ✅ reutilizamos el mismo CSS para misma estética

import BASE_URL from "../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faCheck,
  faListCheck,
  faMoneyBill1Wave,
  faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";

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

export default function ModalPagarOrdenesPago({
  open,
  onClose,
  onConfirm, // async ({ proveedor, seleccion, totalSeleccionado, nota, id_medio_pago, medio_pago }) => void
  onToast, // (tipo,msg,ms)
  proveedor,
  deudas = [],
}) {
  const firstFocusRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);

  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);

  // Medios de pago (backend)
  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [idMedioPago, setIdMedioPago] = useState(""); // string en UI

  const fetchMediosPago = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const url = `${BASE_URL}/api.php?action=global_obtener_listas`;
      const res = await fetch(url, { method: "GET" });
      const data = await res.json().catch(() => null);

      const mp = normalizeMediosPago(data);
      setMediosPago(mp);

      // default: si hay medios, seleccionar el primero
      setIdMedioPago((prev) => {
        if (prev) return prev;
        return mp.length ? String(mp[0].id) : "";
      });
    } catch (e) {
      onToast?.("error", "No se pudieron cargar los medios de pago.", 3200);
      setMediosPago([]);
      setIdMedioPago("");
    } finally {
      setLoadingMedios(false);
    }
  }, [onToast]);

  // Reset al abrir + cargar medios de pago
  useEffect(() => {
    if (!open) return;

    setSelectedIds(new Set());
    setPagaTodo(false);
    setNota("");
    setLoading(false);

    setMediosPago([]);
    setIdMedioPago("");
    fetchMediosPago();

    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, fetchMediosPago]);

  // Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const deudasOrdenadas = useMemo(() => {
    const arr = Array.isArray(deudas) ? [...deudas] : [];
    arr.sort((a, b) => {
      const fa = String(a?.fecha || "");
      const fb = String(b?.fecha || "");
      if (fa === fb) return Number(b?.id_movimiento || 0) - Number(a?.id_movimiento || 0);
      return fb.localeCompare(fa);
    });
    return arr;
  }, [deudas]);

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

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      if (next.size !== deudasOrdenadas.length) setPagaTodo(false);
      if (next.size === deudasOrdenadas.length && deudasOrdenadas.length > 0) setPagaTodo(true);

      return next;
    });
  };

  const toggleAll = () => {
    const all = deudasOrdenadas.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);

    setSelectedIds((prev) => {
      const next = new Set();
      const shouldSelectAll = prev.size !== all.length;

      if (shouldSelectAll) {
        all.forEach((id) => next.add(id));
        setPagaTodo(true);
      } else {
        setPagaTodo(false);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este proveedor no tiene deudas pendientes.", 2600);
      return;
    }
    if (selectedIds.size === 0) {
      onToast?.("error", "Seleccioná al menos una deuda para pagar.", 2600);
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

    const seleccion = deudasOrdenadas.filter((r) =>
      selectedIds.has(Number(r?.id_movimiento || 0))
    );

    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) {
      onToast?.("error", "Medio de pago inválido. Reintentá.", 2800);
      return;
    }

    const payload = {
      proveedor: {
        id_proveedor: proveedor?.id_proveedor ?? null,
        nombre: proveedor?.proveedor ?? "",
      },
      seleccion,
      totalSeleccionado,
      nota: nota.trim(),
      id_medio_pago: mp.id,
      medio_pago: mp.nombre,
    };

    try {
      setLoading(true);
      await onConfirm(payload);
      onClose?.();
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4200);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="mi-modal__overlay" role="dialog" aria-modal="true">
      <div className="mi-modal__container mi-modal__container--mov mpr-modal">
        {/* Header */}
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <FontAwesomeIcon icon={faMoneyBill1Wave} />
              <span>Pagar</span>
              <span className="mpr-dot">·</span>
              <span className="mpr-clientName">{safeText(proveedor?.proveedor)}</span>

              {proveedor?.id_proveedor ? (
                <span
                  className="mpr-clientIdPill"
                  title={`ID Proveedor: ${proveedor.id_proveedor}`}
                >
                  ID {String(proveedor.id_proveedor)}
                </span>
              ) : null}
            </div>

            <div className="mi-modal__subtitle mpr-subtitle">
              Seleccioná una o más deudas pendientes
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

        {/* Body */}
        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            {/* Bloque superior: SOLO Pago */}
            <div className="mpr-topGrid mpr-topGrid--single">
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
                        {!loadingMedios && mediosPago.length === 0 && (
                          <option value="">(Sin medios de pago)</option>
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
                      title="Seleccionar / deseleccionar todas"
                    >
                      <FontAwesomeIcon icon={faListCheck} />
                      {pagaTodo ? "Deseleccionar todas" : "Seleccionar todas"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Nota opcional (si la querés usar, descomentá)
            <div className="mpr-note">
              <div className="mpr-noteTitle">Nota / observaciones</div>
              <textarea
                className="mpr-textarea"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Escribí una nota…"
                disabled={loading}
              />
            </div>
            */}
          </div>

          {/* Tabla de deudas */}
          <div className="mpr-tableWrap">
            <div className="mpr-tableTitle">
              <span>Deudas pendientes</span>

              <div className="mpr-actionsRight">
                <div className="mpr-miniStat">
                  <span>Deudas</span>
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
                <div className="mpr-th mpr-th--right">Monto</div>
              </div>

              <div className="mpr-tbody">
                {!deudasOrdenadas.length && (
                  <div className="mpr-empty">
                    No hay deudas pendientes para este proveedor.
                  </div>
                )}

                {deudasOrdenadas.map((r, idx) => {
                  const id = Number(r?.id_movimiento || 0);
                  const checked = selectedIds.has(id);
                  const monto = Number(r?.monto_total ?? r?.total ?? 0) || 0;

                  return (
                    <div
                      key={id || `${r?.fecha}-${idx}`}
                      className={`mpr-row ${checked ? "is-checked" : ""}`}
                      role="row"
                      onClick={() => id && toggleOne(id)}
                    >
                      <div
                        className="mpr-td mpr-td--center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className={`mpr-checkWrap ${(!id || loading) ? "is-disabled" : ""}`}>
                          <input
                            className="mpr-checkInput"
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(id)}
                            disabled={!id || loading}
                          />
                          <span className="mpr-checkBox" aria-hidden="true" />
                        </label>
                      </div>

                      <div className="mpr-td">{safeText(formatFechaDMY(r?.fecha))}</div>

                      <div
                        className="mpr-td mpr-td--desc"
                        title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                      >
                        {safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                      </div>

                      <div className="mpr-td mpr-td--right">{moneyARS(monto)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mi-modal__footer mpr-footer">
          <button
            type="button"
            className="mpr-btn mpr-btn--ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="mpr-btn mpr-btn--primary"
            onClick={handleConfirm}
            disabled={loading || selectedIds.size === 0 || !idMedioPago}
            title={
              selectedIds.size === 0
                ? "Seleccioná al menos una deuda"
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
