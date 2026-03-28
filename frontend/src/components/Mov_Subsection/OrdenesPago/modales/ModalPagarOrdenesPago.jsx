import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
import "../../Recibos/modales/ModalPagarRecibos.css"; // reutiliza los mismos tokens y clases
import BASE_URL from "../../../../config/config";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faCheck,
  faListCheck,
  faMoneyBill1Wave,
  faCircleNotch,
  faMoneyCheckDollar,
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

function buildAuthHeaders() {
  const { sessionKey, token } = getAuthInfo();
  const headers = {};
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

/* =========================
   Sub-componentes
========================= */
function EstadoChip({ pagado }) {
  return (
    <span className={`mpr-chip ${pagado ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {pagado ? "PAGADO" : "PENDIENTE"}
    </span>
  );
}

/* Cheques en cartera como tarjetas */
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
          >
            <div className="mpr-cheque-card__top">
              <label
                className="mpr-check"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="radio"
                  name="orden_pago_cheque_cartera"
                  checked={checked}
                  onChange={() => onSelect(String(ch?.id_cheque || ""))}
                />
                <span className="mpr-check__box" aria-hidden="true" />
              </label>

              <span className="mpr-cheque-card__numero">
                N° {safeText(ch?.numero_cheque)}
              </span>
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

            <div className="mpr-cheque-card__importe">
              {moneyARS(ch?.importe || 0)}
            </div>
          </div>
        );
      })}
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
  const [idMedioPago, setIdMedioPago] = useState("");

  const medioPagoSeleccionado = useMemo(
    () => mediosPago.find((x) => String(x.id) === String(idMedioPago)) || null,
    [mediosPago, idMedioPago]
  );

  const tipoChequeRequerido = useMemo(
    () => normalizeChequeTipoFromMedio(medioPagoSeleccionado?.nombre || ""),
    [medioPagoSeleccionado]
  );

  const requiereChequeCartera = tipoChequeRequerido === "cheque" || tipoChequeRequerido === "echeq";

  const [chequesCartera, setChequesCartera] = useState([]);
  const [loadingCheques, setLoadingCheques] = useState(false);
  const [idChequeSeleccionado, setIdChequeSeleccionado] = useState("");

  const chequeSeleccionado = useMemo(
    () => chequesCartera.find((x) => String(x.id_cheque) === String(idChequeSeleccionado)) || null,
    [chequesCartera, idChequeSeleccionado]
  );

  const [openOrden, setOpenOrden] = useState(false);
  const [ordenHtml, setOrdenHtml] = useState("");
  const [ordenTitle, setOrdenTitle] = useState("Orden de Pago");
  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId, setUltimoCobroId] = useState(null);

  const fetchMediosPagoFallback = useCallback(async () => {
    try {
      setLoadingMedios(true);
      const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?action=global_obtener_listas`, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      setMediosPago(normalizeMediosPago(data));
    } catch (e) {
      onToast?.("error", e?.message || "No se pudieron cargar los medios de pago.", 4200);
      setMediosPago([]);
      setIdMedioPago("");
    } finally {
      setLoadingMedios(false);
    }
  }, [onToast]);

  const fetchChequesCartera = useCallback(async (tipo) => {
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
      sp.set("action", "ordenes_pago_cheques_cartera_listar");
      sp.set("tipo", tipo);
      const data = await fetchJsonOrThrow(`${BASE_URL}/api.php?${sp.toString()}`, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      setChequesCartera(Array.isArray(data?.cheques) ? data.cheques : []);
    } catch (e) {
      setChequesCartera([]);
      setIdChequeSeleccionado("");
      onToast?.("error", e?.message || "No se pudieron cargar los cheques en cartera.", 4200);
    } finally {
      setLoadingCheques(false);
    }
  }, [onToast]);

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
    setChequesCartera([]);
    setLoadingCheques(false);
    setIdChequeSeleccionado("");
    if (mediosPagoFromContext.length > 0) {
      setMediosPago(mediosPagoFromContext);
      setLoadingMedios(false);
    } else {
      setMediosPago([]);
      fetchMediosPagoFallback();
    }
    setIdMedioPago("");
    setTimeout(() => firstFocusRef.current?.focus(), 50);
  }, [open, deudas, mediosPagoFromContext, fetchMediosPagoFallback]);

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

  const confirmPagoDefault = async ({ ids_movimiento, id_medio_pago, id_cheque }) => {
    return await fetchJsonOrThrow(`${BASE_URL}/api.php?action=ordenes_pago_confirmar_pago`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeaders() },
      body: JSON.stringify({ ids_movimiento, id_medio_pago, id_cheque }),
    });
  };

  const buildOrdenFromSeleccion = useCallback(({ proveedorInfo, mp, seleccion, cheque }) => {
    const total = seleccion.reduce(
      (acc, r) => acc + (Number(r?.monto_total ?? r?.total ?? 0) || 0),
      0
    );
    const detalleExtra =
      cheque && (cheque?.numero_cheque || cheque?.emisor)
        ? ` - ${String(cheque?.tipo || "").toUpperCase()} ${safeText(cheque?.numero_cheque)}`
        : "";

    const html = buildOrdenPagoHTML({
      proveedorNombre: proveedorInfo?.nombre ?? proveedor?.proveedor ?? "",
      proveedorId: proveedorInfo?.id_proveedor ?? proveedor?.id_proveedor ?? "",
      medioPagoNombre: `${mp?.nombre ?? ""}${detalleExtra}`,
      total,
      seleccion,
      fechaPago: new Date(),
    });

    return {
      html,
      title: `Orden de Pago - ${proveedorInfo?.nombre || proveedor?.proveedor || "Proveedor"}`,
    };
  }, [proveedor]);

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

    const mp = mediosPago.find((x) => String(x.id) === String(idMedioPago));
    if (!mp) {
      onToast?.("error", "Medio de pago inválido. Reintentá.", 2800);
      return;
    }

    if (requiereChequeCartera && !idChequeSeleccionado) {
      onToast?.(
        "error",
        `Seleccioná un ${tipoChequeRequerido === "echeq" ? "eCheq" : "cheque"} de cartera.`,
        3000
      );
      return;
    }

    const ids = seleccion.map((r) => Number(r?.id_movimiento || 0)).filter(Boolean);

    try {
      setLoading(true);
      let resp = null;

      if (onConfirm) {
        resp = await onConfirm({
          proveedor: {
            id_proveedor: proveedor?.id_proveedor ?? null,
            nombre: proveedor?.proveedor ?? "",
          },
          seleccion,
          totalSeleccionado,
          id_medio_pago: mp.id,
          medio_pago: mp.nombre,
          id_cheque: requiereChequeCartera ? Number(idChequeSeleccionado || 0) : null,
          cheque: chequeSeleccionado || null,
          ids_movimiento: ids,
        });
      } else {
        resp = await confirmPagoDefault({
          ids_movimiento: ids,
          id_medio_pago: mp.id,
          id_cheque: requiereChequeCartera ? Number(idChequeSeleccionado || 0) : null,
        });
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
            id_medio_pago: mp.id,
            medio_pago_nombre: mp.nombre,
          };
        })
      );

      if (requiereChequeCartera && idChequeSeleccionado) {
        setChequesCartera((prev) =>
          (Array.isArray(prev) ? prev : []).filter(
            (x) => String(x?.id_cheque) !== String(idChequeSeleccionado)
          )
        );
      }

      const built = buildOrdenFromSeleccion({
        proveedorInfo: {
          id_proveedor: proveedor?.id_proveedor ?? null,
          nombre: proveedor?.proveedor ?? "",
        },
        mp,
        seleccion,
        cheque: chequeSeleccionado,
      });

      setOrdenHtml(built.html);
      setOrdenTitle(built.title);
      setOpenOrden(true);
      setSelectedIds(new Set());
      setPagaTodo(false);
      setIdChequeSeleccionado("");
      onToast?.("exito", "Pago realizado correctamente.", 3000);
      setTimeout(recomputeTbodyScroll, 0);
    } catch (e) {
      onToast?.("error", e?.message || "No se pudo registrar el pago.", 4200);
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
                            <label className={`mpr-check ${!id || loading || pagado ? "is-disabled" : ""}`}>
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

                          <div className="mpr-td mpr-td--right mpr-td--mono">{moneyARS(monto)}</div>
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
                    <div className="fl-field">
                      <div className="mpr-select-wrap">
                        <select
                          className="fl-input fl-select"
                          value={idMedioPago}
                          onChange={(e) => setIdMedioPago(e.target.value)}
                          disabled={loading || loadingMedios}
                        >
                          <option value="">
                            {loadingMedios ? "Cargando…" : "Seleccionar medio de pago…"}
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

                        <label className="fl-label">Medio de pago *</label>

                        {loadingMedios && (
                          <span className="mpr-select-spinner">
                            <FontAwesomeIcon icon={faCircleNotch} spin />
                          </span>
                        )}
                      </div>
                    </div>

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

                    {requiereChequeCartera && (
                      <div className="mi-card mi-card--full mpr-cheque-card">
                        <div className="mi-card__title">
                          <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ marginRight: 6 }} />
                          {tipoChequeRequerido === "echeq" ? "eCheqs en cartera" : "Cheques en cartera"}
                        </div>

                        {loadingCheques ? (
                          <div className="mpr-empty" style={{ padding: "10px 0" }}>
                            <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: 6 }} />
                            Cargando cheques disponibles…
                          </div>
                        ) : chequesCartera.length === 0 ? (
                          <div className="mpr-empty" style={{ padding: "10px 0", textAlign: "left" }}>
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
                          <div className="mpr-cheque-info" style={{ marginTop: 8 }}>
                            <div className="mpr-cheque-info__ok">
                              ✓ {String(chequeSeleccionado?.tipo || "").toUpperCase()} seleccionado
                            </div>
                            <div className="mpr-cheque-info__row">
                              <b>N°:</b> {safeText(chequeSeleccionado?.numero_cheque)}
                            </div>
                            <div className="mpr-cheque-info__row">
                              <b>Emisor:</b> {safeText(chequeSeleccionado?.emisor)}
                            </div>
                            <div className="mpr-cheque-info__row">
                              <b>Importe:</b> {moneyARS(chequeSeleccionado?.importe || 0)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mpr-aside__actions">
                      <button
                        type="button"
                        className="mit-btn mit-btn--solid mit-btn--block"
                        onClick={handleConfirm}
                        disabled={
                          loading ||
                          selectedIds.size === 0 ||
                          !idMedioPago ||
                          (requiereChequeCartera && !idChequeSeleccionado)
                        }
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