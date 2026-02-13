// src/components/Movimientos/modales/ModalPagarRecibos.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // estética base
import "./ModalPagarRecibos.css"; // css propio del modal

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

function normalizeSearchText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
   ✅ Auth helpers (X-Session)
========================= */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";
  const session =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";
  return { token, session };
}

function buildAuthHeaders() {
  const { token, session } = getAuthInfo();
  const headers = {};
  if (session) headers["X-Session"] = session; // ✅ SaaS
  if (token) headers["Authorization"] = `Bearer ${token}`; // compat viejo
  return headers;
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
    : [];

  return arr
    .map((x) => ({
      id: Number(x?.id ?? x?.id_medio_pago ?? 0) || 0,
      nombre: String(x?.nombre ?? x?.medio_pago ?? "").trim(),
    }))
    .filter((x) => x.id > 0 && x.nombre);
}

/* =========================
   Estado (pagado/pendiente)
========================= */
function isPagadoRow(row) {
  const idMP = Number(row?.id_medio_pago ?? row?.idMedioPago ?? 0);
  if (Number.isFinite(idMP) && idMP > 0) return true;

  const mpTxt = String(row?.medio_pago_nombre ?? row?.medio_pago ?? "").trim();
  if (mpTxt) return true;

  const tv = normalizeSearchText(row?.tipo_venta ?? row?.pago_tipo_venta ?? "");
  if (tv.includes("contado")) return true;

  return false;
}

function EstadoChip({ estado }) {
  const isOk = String(estado).toUpperCase() === "PAGADO";
  return (
    <span className={`mpr-chip ${isOk ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {estado}
    </span>
  );
}

/* =========================
   ✅ fetch JSON helper
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
  if (!res.ok) {
    throw new Error(data?.mensaje || `HTTP ${res.status}`);
  }
  if (data?.exito === false) {
    throw new Error(data?.mensaje || "Operación fallida.");
  }
  return data;
}

export default function ModalPagarRecibos({
  open,
  onClose,
  onConfirm,  // opcional: si no viene, el modal confirma directo contra el backend
  onToast,    // (tipo,msg,ms)
  onAfterPaid, // ✅ NUEVO opcional: (ids, {id, nombre}) => void para que el padre actualice su tabla
  cliente,
  deudas = [],
  onFactura, // opcional
}) {
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);

  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ Local copy de deudas para que el chip cambie a PAGADO instantáneo
  const [rows, setRows] = useState(() => []);

  // Medios de pago (backend)
  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);

  // ✅ IMPORTANTE: arranca vacío => obliga a elegir
  const [idMedioPago, setIdMedioPago] = useState(""); // string en UI

  const fetchMediosPago = useCallback(async () => {
    try {
      setLoadingMedios(true);

      const url = `${BASE_URL}/api.php?action=global_obtener_listas`;
      const data = await fetchJsonOrThrow(url, {
        method: "GET",
        headers: buildAuthHeaders(),
      });

      const mp = normalizeMediosPago(data);
      setMediosPago(mp);

      // ✅ NO auto-seleccionar el primero
      // setIdMedioPago(prev => prev || (mp.length ? String(mp[0].id) : ""));
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
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

    setRows(Array.isArray(deudas) ? [...deudas] : []); // ✅ copiar deudas al abrir

    setMediosPago([]);
    setIdMedioPago("");
    fetchMediosPago();

    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, fetchMediosPago, deudas]);

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

    // ✅ si ya está pagado, no se selecciona
    if (isPagadoRow(row)) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      // pagaTodo solo si todas las PENDIENTES están seleccionadas
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

  // ✅ Confirmación default (si el padre no manda onConfirm)
  const confirmPagoDefault = async ({ ids_movimiento, id_medio_pago }) => {
    const url = `${BASE_URL}/api.php?action=recibos_confirmar_pago`;
    return await fetchJsonOrThrow(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify({ ids_movimiento, id_medio_pago }),
    });
  };

  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.", 2600);
      return;
    }

    // ✅ solo pendientes
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

    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) {
      onToast?.("error", "Medio de pago inválido. Reintentá.", 2800);
      return;
    }

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);

    try {
      setLoading(true);

      // 1) Backend
      if (onConfirm) {
        await onConfirm({
          cliente: {
            id_cliente: cliente?.id_cliente ?? null,
            nombre: cliente?.cliente ?? "",
          },
          seleccion,
          totalSeleccionado,
          nota: nota.trim(),
          id_medio_pago: mp.id,
          medio_pago: mp.nombre,
        });
      } else {
        await confirmPagoDefault({ ids_movimiento: ids, id_medio_pago: mp.id });
      }

      // 2) ✅ Marcar como PAGADO en el modal (chip cambia instantáneo)
      setRows((prev) =>
        (Array.isArray(prev) ? prev : []).map((r) => {
          const id = Number(r?.id_movimiento || 0);
          if (!id || !ids.includes(id)) return r;
          return {
            ...r,
            id_medio_pago: mp.id,
            medio_pago_nombre: mp.nombre,
            tipo_venta: "CONTADO",
            pago_tipo_venta: "CONTADO",
          };
        })
      );

      // 3) ✅ avisar al padre para que también cambie afuera (si quiere)
      onAfterPaid?.(ids, mp);

      onToast?.("ok", "Pago confirmado ✅", 2200);

      // 4) limpiar selección
      setSelectedIds(new Set());
      setPagaTodo(false);

      // ✅ Si querés que NO se cierre el modal, comentá la línea de abajo
      onClose?.();
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4200);
    } finally {
      setLoading(false);
    }
  };

  const handleFactura = async () => {
    if (!onFactura) {
      onToast?.("error", "Falta conectar la acción de factura (onFactura).", 3200);
      return;
    }

    const seleccion = deudasOrdenadas.filter((r) => {
      const id = Number(r?.id_movimiento || 0);
      return id && selectedIds.has(id) && !isPagadoRow(r);
    });

    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.", 2600);
      return;
    }
    if (seleccion.length === 0) {
      onToast?.("error", "Seleccioná al menos una deuda PENDIENTE para facturar.", 2600);
      return;
    }
    if (!idMedioPago) {
      onToast?.("error", "Seleccioná un medio de pago.", 2600);
      return;
    }

    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) {
      onToast?.("error", "Medio de pago inválido. Reintentá.", 2800);
      return;
    }

    const payload = {
      cliente: {
        id_cliente: cliente?.id_cliente ?? null,
        nombre: cliente?.cliente ?? "",
      },
      seleccion,
      totalSeleccionado,
      nota: nota.trim(),
      id_medio_pago: mp.id,
      medio_pago: mp.nombre,
    };

    try {
      setLoading(true);
      await onFactura(payload);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo generar la factura.", 4200);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="mi-modal__overlay" role="dialog" aria-modal="true">
      <div className="mi-modal__container mi-modal__container--mov mpr-modal" ref={dialogRef}>
        {/* Header */}
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <FontAwesomeIcon icon={faMoneyBill1Wave} />
              <span>Pagar</span>
              <span className="mpr-dot">·</span>
              <span className="mpr-clientName">{safeText(cliente?.cliente)}</span>

              {cliente?.id_cliente ? (
                <span className="mpr-clientIdPill" title={`ID Cliente: ${cliente.id_cliente}`}>
                  ID {String(cliente.id_cliente)}
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

        {/* Body */}
        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
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
            </div>
          </div>

          {/* Tabla */}
          <div className="mpr-tableWrap">
            <div className="mpr-tableTitle">
              <span>Registros del cliente</span>

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

              <div className="mpr-tbody mpr-tbody--pr">
                {!deudasOrdenadas.length && (
                  <div className="mpr-empty">No hay registros para este cliente.</div>
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
                      style={pagado ? { cursor: "default" } : undefined}
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

                      <div
                        className="mpr-td mpr-td--desc"
                        title={safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                      >
                        {safeText(r?.detalle ?? r?.descripcion ?? r?.concepto)}
                      </div>

                      <div className="mpr-td mpr-td--center" style={{ textAlign: "center" }}>
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

        {/* Footer */}
        <div className="mi-modal__footer mpr-footer">
          <button type="button" className="mpr-btn mpr-btn--ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </button>

          <button
            type="button"
            className="mpr-btn mpr-btn--ghost"
            onClick={handleFactura}
            disabled={loading || selectedIds.size === 0 || !idMedioPago || !onFactura}
            title={
              !onFactura
                ? "Acción no conectada"
                : selectedIds.size === 0
                ? "Seleccioná al menos una deuda pendiente"
                : !idMedioPago
                ? "Seleccioná un medio de pago"
                : "Hacer factura"
            }
          >
            <FontAwesomeIcon icon={faMoneyBill1Wave} />
            Hacer factura
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
