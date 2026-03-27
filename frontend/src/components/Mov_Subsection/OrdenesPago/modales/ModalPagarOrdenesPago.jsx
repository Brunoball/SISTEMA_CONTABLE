import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/Global_Modals.css";
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

function EstadoChip({ estado }) {
  const isOk = String(estado).toUpperCase() === "PAGADO";
  return (
    <span className={`mpr-chip ${isOk ? "mpr-chip--ok" : "mpr-chip--warn"}`}>
      {estado}
    </span>
  );
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
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pagaTodo, setPagaTodo] = useState(false);
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState(() => []);

  const mediosPagoFromContext = useMemo(() => {
    return normalizeMediosPago(lists || {});
  }, [lists]);

  const [mediosPago, setMediosPago] = useState([]);
  const [loadingMedios, setLoadingMedios] = useState(false);
  const [idMedioPago, setIdMedioPago] = useState("");

  const medioPagoSeleccionado = useMemo(() => {
    return mediosPago.find((x) => String(x.id) === String(idMedioPago)) || null;
  }, [mediosPago, idMedioPago]);

  const tipoChequeRequerido = useMemo(() => {
    return normalizeChequeTipoFromMedio(medioPagoSeleccionado?.nombre || "");
  }, [medioPagoSeleccionado]);

  const requiereChequeCartera = tipoChequeRequerido === "cheque" || tipoChequeRequerido === "echeq";

  const [chequesCartera, setChequesCartera] = useState([]);
  const [loadingCheques, setLoadingCheques] = useState(false);
  const [idChequeSeleccionado, setIdChequeSeleccionado] = useState("");

  const chequeSeleccionado = useMemo(() => {
    return chequesCartera.find((x) => String(x.id_cheque) === String(idChequeSeleccionado)) || null;
  }, [chequesCartera, idChequeSeleccionado]);

  const [openOrden, setOpenOrden] = useState(false);
  const [ordenHtml, setOrdenHtml] = useState("");
  const [ordenTitle, setOrdenTitle] = useState("Orden de Pago");

  const [idsMovimientosPagados, setIdsMovimientosPagados] = useState([]);
  const [ultimoCobroId, setUltimoCobroId] = useState(null);

  const fetchMediosPagoFallback = useCallback(async () => {
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

  const fetchChequesCartera = useCallback(
    async (tipo) => {
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

        const lista = Array.isArray(data?.cheques) ? data.cheques : [];
        setChequesCartera(lista);
      } catch (e) {
        setChequesCartera([]);
        setIdChequeSeleccionado("");
        onToast?.("error", e?.message || "No se pudieron cargar los cheques en cartera.", 4200);
      } finally {
        setLoadingCheques(false);
      }
    },
    [onToast]
  );

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

  const confirmPagoDefault = async ({ ids_movimiento, id_medio_pago, id_cheque }) => {
    const url = `${BASE_URL}/api.php?action=ordenes_pago_confirmar_pago`;
    return await fetchJsonOrThrow(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(),
      },
      body: JSON.stringify({ ids_movimiento, id_medio_pago, id_cheque }),
    });
  };

  const buildOrdenFromSeleccion = useCallback(
    ({ proveedorInfo, mp, seleccion, cheque }) => {
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

      const title = `Orden de Pago - ${proveedorInfo?.nombre || proveedor?.proveedor || "Proveedor"}`;

      return { html, title };
    },
    [proveedor]
  );

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
      onToast?.("error", `Seleccioná un ${tipoChequeRequerido === "echeq" ? "eCheq" : "cheque"} de cartera.`, 3000);
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

      const firstCobro =
        Number(idsCobroResp?.[0] || resp?.id_cobro || 0) || null;
      setUltimoCobroId(firstCobro);

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

      const proveedorInfo = {
        id_proveedor: proveedor?.id_proveedor ?? null,
        nombre: proveedor?.proveedor ?? "",
      };
      const built = buildOrdenFromSeleccion({
        proveedorInfo,
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
                          className="mpr-select fl-input fl-select"
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

                {requiereChequeCartera && (
                  <div className="mpr-card">
                    <div className="mpr-tableTitle" style={{ marginBottom: 12 }}>
                      <span>
                        <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ marginRight: 8 }} />
                        {tipoChequeRequerido === "echeq" ? "eCheqs en cartera" : "Cheques en cartera"}
                      </span>
                    </div>

                    {loadingCheques ? (
                      <div className="mpr-empty">Cargando cheques disponibles…</div>
                    ) : chequesCartera.length === 0 ? (
                      <div className="mpr-empty">
                        No hay {tipoChequeRequerido === "echeq" ? "eCheqs" : "cheques"} activos en cartera.
                      </div>
                    ) : (
                      <div className="mpr-table">
                        <div className="mpr-thead" role="row">
                          <div className="mpr-th mpr-th--center">Sel</div>
                          <div className="mpr-th">Número</div>
                          <div className="mpr-th">Emisor</div>
                          <div className="mpr-th">F. emisión</div>
                          <div className="mpr-th">F. pago</div>
                          <div className="mpr-th mpr-th--right">Importe</div>
                        </div>

                        <div className="mpr-tbody" style={{ maxHeight: 220 }}>
                          {chequesCartera.map((ch, idx) => {
                            const checked = String(ch?.id_cheque) === String(idChequeSeleccionado);
                            return (
                              <div
                                key={ch?.id_cheque || idx}
                                className={`mpr-row ${checked ? "is-checked" : ""}`}
                                role="row"
                                onClick={() => setIdChequeSeleccionado(String(ch?.id_cheque || ""))}
                              >
                                <div className="mpr-td mpr-td--center" onClick={(e) => e.stopPropagation()}>
                                  <label className="mpr-checkWrap">
                                    <input
                                      className="mpr-checkInput"
                                      type="radio"
                                      name="orden_pago_cheque_cartera"
                                      checked={checked}
                                      onChange={() => setIdChequeSeleccionado(String(ch?.id_cheque || ""))}
                                    />
                                    <span className="mpr-checkBox" aria-hidden="true" />
                                  </label>
                                </div>

                                <div className="mpr-td">{safeText(ch?.numero_cheque)}</div>
                                <div className="mpr-td" title={safeText(ch?.emisor)}>
                                  {safeText(ch?.emisor)}
                                </div>
                                <div className="mpr-td">{safeText(formatFechaDMY(ch?.fecha_emision))}</div>
                                <div className="mpr-td">{safeText(formatFechaDMY(ch?.fecha_pago))}</div>
                                <div className="mpr-td mpr-td--right">{moneyARS(ch?.importe || 0)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {chequeSeleccionado && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,.08)",
                        }}
                      >
                        <b>Seleccionado:</b>{" "}
                        {String(chequeSeleccionado?.tipo || "").toUpperCase()} Nº{" "}
                        {safeText(chequeSeleccionado?.numero_cheque)} —{" "}
                        {safeText(chequeSeleccionado?.emisor)} —{" "}
                        {moneyARS(chequeSeleccionado?.importe || 0)}
                      </div>
                    )}
                  </div>
                )}

                <div className="mpr-tableWrap">
                  <div className="mpr-tableTitle">
                    <span>Registros del proveedor</span>
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
                className="mpr-btn mpr-btn--primary"
                onClick={handleConfirm}
                disabled={
                  loading ||
                  selectedIds.size === 0 ||
                  !idMedioPago ||
                  (requiereChequeCartera && !idChequeSeleccionado)
                }
              >
                <FontAwesomeIcon icon={faCheck} />
                {loading ? "Procesando…" : "Confirmar pago"}
              </button>
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