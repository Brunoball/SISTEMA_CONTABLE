// ✅ REEMPLAZAR COMPLETO
// src/components/Movimientos/modales/ModalPagarRecibos.jsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "./ModalPagarRecibos.css";
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faCheck,
  faListCheck,
  faMoneyBill1Wave,
  faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";

// ✅ Modal recibo
import ModalReciboGenerado from "./ModalReciboGenerado";
import { buildReciboHTML } from "../../../../utils/reciboTemplate";

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
function todayDMY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
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
  if (row?.pagado === true) return true;
  const cob = Number(row?.cobrado_total ?? 0);
  if (Number.isFinite(cob) && cob > 0.00001) return true;
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

export default function ModalPagarRecibos({
  open,
  onClose,
  onConfirm,
  onToast,
  onAfterPaid,
  cliente,
  deudas = [],
  onFactura,
  onReciboFinalizado,
}) {
  const dialogRef = useRef(null);
  const firstFocusRef = useRef(null);

  const tbodyRef = useRef(null);
  const [tbodyHasScroll, setTbodyHasScroll] = useState(false);

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isTemaOscuro()));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);

  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState(() => []);

  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [idMedioPago, setIdMedioPago] = useState("");

  // ✅ modal de recibo
  const [openRecibo, setOpenRecibo] = useState(false);
  const [reciboHtml, setReciboHtml] = useState("");
  const [reciboTitle, setReciboTitle] = useState("Recibo");

  // ✅ guardamos TODOS los ids_movimiento pagados
  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId, setUltimoCobroId] = useState(null);

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
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
      setIdMedioPago("");
    } finally {
      setLoadingMedios(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (!open) return;

    setSelectedIds(new Set());
    setPagaTodo(false);
    setNota("");
    setLoading(false);

    setRows(Array.isArray(deudas) ? [...deudas] : []);

    setMediosPago([]);
    setIdMedioPago("");
    fetchMediosPago();

    setOpenRecibo(false);
    setReciboHtml("");
    setReciboTitle("Recibo");
    setIdsMovimientosPagados([]);
    setUltimoCobroId(null);

    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, fetchMediosPago, deudas]);

  // ✅ IMPORTANTE:
  // este ESC solo funciona cuando está visible el modal de pago.
  // si está abierto el recibo, el de pago NO se renderiza, así evitamos el "doble modal".
  useEffect(() => {
    if (!open || openRecibo) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (!loading) onClose?.();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, openRecibo, onClose, loading]);

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

  const recomputeTbodyScroll = useCallback(() => {
    const el = tbodyRef.current;
    if (!el) return;
    setTbodyHasScroll(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    if (!open || openRecibo) return;

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
  }, [open, openRecibo, recomputeTbodyScroll, deudasOrdenadas.length]);

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

  const buildReciboFromSeleccion = useCallback(
    ({ clienteInfo, mp, seleccion }) => {
      const items = seleccion.map((r) => ({
        id_movimiento: r?.id_movimiento,
        fecha: r?.fecha,
        descripcion: r?.detalle ?? r?.descripcion ?? r?.concepto,
        monto: Number(r?.monto_total ?? r?.total ?? 0) || 0,
      }));

      const total = items.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);

      const payload = {
        fecha_cobro: todayDMY(),
        cliente: {
          id_cliente: clienteInfo?.id_cliente ?? null,
          nombre: clienteInfo?.nombre ?? cliente?.cliente ?? "",
        },
        medio_pago: { id: mp?.id, nombre: mp?.nombre },
        total,
        items,
      };

      const html = buildReciboHTML(payload);
      const title = `Recibo - ${payload?.cliente?.nombre || "Cliente"}`;

      return { html, title };
    },
    [cliente]
  );

  const handleConfirm = async () => {
    if (!deudasOrdenadas.length) {
      onToast?.("error", "Este cliente no tiene registros.", 2600);
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

    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) {
      onToast?.("error", "Medio de pago inválido. Reintentá.", 2800);
      return;
    }

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);

    try {
      setLoading(true);

      let resp = null;
      if (onConfirm) {
        resp = await onConfirm({
          cliente: {
            id_cliente: cliente?.id_cliente ?? null,
            nombre: cliente?.cliente ?? "",
          },
          seleccion,
          totalSeleccionado,
          nota: nota.trim(),
          id_medio_pago: mp.id,
          medio_pago: mp.nombre,
          ids_movimiento: ids,
        });
      } else {
        resp = await confirmPagoDefault({ ids_movimiento: ids, id_medio_pago: mp.id });
      }

      setIdsMovimientosPagados(ids);

      const firstCobro = Number(resp?.ids_cobro?.[0] || resp?.id_cobro || 0) || null;
      setUltimoCobroId(firstCobro);

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

      onAfterPaid?.(ids, mp);

      const clienteInfo = {
        id_cliente: cliente?.id_cliente ?? null,
        nombre: cliente?.cliente ?? "",
      };
      const built = buildReciboFromSeleccion({ clienteInfo, mp, seleccion });

      setReciboHtml(built.html);
      setReciboTitle(built.title);

      // ✅ PRIMERO abrimos el recibo
      // ✅ y dejamos de renderizar el modal de pago
      setOpenRecibo(true);

      setSelectedIds(new Set());
      setPagaTodo(false);

      onToast?.("exito", "Pago confirmado. Revisá el recibo y finalizá.", 2600);

      setTimeout(recomputeTbodyScroll, 0);
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
      cliente: { id_cliente: cliente?.id_cliente ?? null, nombre: cliente?.cliente ?? "" },
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
      {/* ✅ SOLO renderiza el modal de pago si NO está abierto el recibo */}
      {!openRecibo && (
        <div className={overlayClass} role="dialog" aria-modal="true">
          <div className={modalClass} ref={dialogRef} onMouseDown={(e) => e.stopPropagation()}>
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
                            {loadingMedios
                              ? "Cargando medios de pago…"
                              : "Seleccioná un medio de pago…"}
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

                  <div className={`mpr-table ${tbodyHasScroll ? "mpr-table--hasScroll" : ""}`}>
                    <div className="mpr-thead" role="row">
                      <div className="mpr-th mpr-th--center">Sel</div>
                      <div className="mpr-th">Fecha</div>
                      <div className="mpr-th">Descripción</div>
                      <div className="mpr-th mpr-th--center">Estado</div>
                      <div className="mpr-th mpr-th--right">Monto</div>
                    </div>

                    <div ref={tbodyRef} className="mpr-tbody">
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
                            className={`mpr-row ${checked ? "is-checked" : ""} ${
                              pagado ? "is-paid" : ""
                            }`}
                            role="row"
                            onClick={() => id && toggleOne(id, r)}
                            title={pagado ? "Este registro ya está PAGADO" : undefined}
                          >
                            <div
                              className="mpr-td mpr-td--center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <label
                                className={`mpr-checkWrap ${
                                  !id || loading || pagado ? "is-disabled" : ""
                                }`}
                              >
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
              >
                <FontAwesomeIcon icon={faCheck} />
                {loading ? "Procesando…" : "Confirmar pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ Modal del recibo generado */}
      <ModalReciboGenerado
        open={openRecibo}
        html={reciboHtml}
        title={reciboTitle}
        onToast={onToast}
        onClose={() => {
          // ✅ si por alguna razón querés cerrar desde el hijo, cerramos todo
          setOpenRecibo(false);
          onClose?.();
        }}
        idsMovimientos={idsMovimientosPagados}
        idCobro={ultimoCobroId}
        onFinalizar={(saved) => {
          onReciboFinalizado?.(saved, { idsMovimiento: idsMovimientosPagados });

          // ✅ cerrar todo de una, sin mostrar el modal anterior
          setOpenRecibo(false);
          onClose?.();
        }}
      />
    </>,
    document.body
  );
}