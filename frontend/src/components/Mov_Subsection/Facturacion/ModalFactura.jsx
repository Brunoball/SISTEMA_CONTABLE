import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FaCheck } from "react-icons/fa";
import "./ModalFacturaBalto.css";
import ModalFacturaBaltoResumen from "./ModalFacturaResumen";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

const CBTE_TIPOS = [{ id: 11, label: "Factura C (11)" }];

// Producción: false
const FORCE_TEST_AMOUNT = false;
const TEST_AMOUNT = null;

// PV BALTO (ajustalo)
const DEFAULT_PTO_VTA = 2;

function moneyARS(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0,00";
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}
function moneyUSD(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "USD 0.00";
  try {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `USD ${n.toFixed(2)}`;
  }
}

// yyyy-mm-dd -> yyyymmdd
function dateToYMD8(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replaceAll("-", "");
  return "";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthFirstLastISO(anio, mesText) {
  const y = Number(anio);
  if (!Number.isFinite(y) || y <= 0) {
    const t = todayISO();
    return { desde: t, hasta: t };
  }

  const map = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12,
  };

  const mm = map[String(mesText || "").toLowerCase().trim()];
  if (!mm) {
    const t = todayISO();
    return { desde: t, hasta: t };
  }

  const last = new Date(y, mm, 0);
  const fISO = `${y}-${String(mm).padStart(2, "0")}-01`;
  const lISO = `${y}-${String(mm).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  return { desde: fISO, hasta: lISO };
}

function useOnClickOutside(ref, handler, when = true) {
  useEffect(() => {
    if (!when) return;
    const listener = (event) => {
      const el = ref?.current;
      if (!el) return;
      if (el.contains(event.target)) return;
      handler?.();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler, when]);
}

function safeStr(x) {
  return String(x ?? "").trim();
}

export default function ModalFacturaBalto({
  open,
  onClose,
  apiBase,
  // BALTO: recomendado -> action="movimientos" y op="facturacion_*"
  action = "movimientos",
  data,
  onFacturada,
  onDone,
}) {
  const [docTipo, setDocTipo] = useState(80);
  const [docNro, setDocNro] = useState("");
  const [cbteTipo, setCbteTipo] = useState(11);

  const [error, setError] = useState("");
  const [openResumen, setOpenResumen] = useState(false);

  // cliente_facturacion (DB)
  const [clienteFact, setClienteFact] = useState(null);
  const [loadingCliente, setLoadingCliente] = useState(false);

  // fechas período
  const [periodoDesde, setPeriodoDesde] = useState("");
  const [periodoHasta, setPeriodoHasta] = useState("");
  const [vtoPago, setVtoPago] = useState("");

  // USD -> ARS
  const [usdRate, setUsdRate] = useState(null);
  const [loadingUsd, setLoadingUsd] = useState(false);
  const [usdErr, setUsdErr] = useState("");

  // PLANES (DB)
  const [planesMant, setPlanesMant] = useState([]);
  const [loadingPlanes, setLoadingPlanes] = useState(false);
  const [planesErr, setPlanesErr] = useState("");

  // selector multi
  const [mantSel, setMantSel] = useState([]);
  const [mantOpen, setMantOpen] = useState(false);
  const [mantSearch, setMantSearch] = useState("");
  const mantWrapRef = useRef(null);

  const [devDesc, setDevDesc] = useState("");
  const [devUsd, setDevUsd] = useState("");

  const firstRef = useRef(null);
  const refDesde = useRef(null);
  const refHasta = useRef(null);
  const refVto = useRef(null);

  const closeMantDropdown = useCallback(() => setMantOpen(false), []);
  useOnClickOutside(mantWrapRef, closeMantDropdown, open && mantOpen);

  // claves (compat: puede venir id_pago o id_sistema)
  const idPagoReal = useMemo(() => (data?.id_pago ? Number(data.id_pago) : 0), [data]);
  const idSistemaReal = useMemo(() => (data?.id_sistema ? Number(data.id_sistema) : 0), [data]);

  const idPagoLabel = useMemo(() => (idPagoReal > 0 ? String(idPagoReal) : "SIN PAGO"), [idPagoReal]);

  const titulo = useMemo(
    () => `${data?.labelCliente || "Cliente"} • ${data?.labelSistema || "Sistema"}`,
    [data]
  );

  const nombreCliente = useMemo(() => data?.labelCliente || data?.cliente || "—", [data]);
  const nombreSistema = useMemo(() => data?.labelSistema || data?.sistema || "—", [data]);

  const openNativePicker = useCallback((inputEl) => {
    if (!inputEl) return;
    try {
      if (typeof inputEl.showPicker === "function") return inputEl.showPicker();
    } catch {}
    try { inputEl.focus(); } catch {}
    try { inputEl.click(); } catch {}
  }, []);

  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    const raw = await res.text();
    const trimmed = (raw || "").trim();

    if (trimmed.startsWith("<")) {
      throw new Error("Backend devolvió HTML (error PHP).");
    }

    let j = null;
    try { j = trimmed ? JSON.parse(trimmed) : null; } catch { j = null; }

    const pickErr = () => j?.mensaje || j?.error || j?.message || j?.detail || "";

    if (!res.ok) throw new Error(pickErr() || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(pickErr() || "Error servidor (exito=false)");
    if (j == null) throw new Error("Respuesta inválida (no JSON)");
    return j;
  }, []);

  // BALTO: dólar oficial
  const getUsdOficialVenta = useCallback(async () => {
    const maybe = Number(data?.usd_rate) || Number(data?.dolar_oficial_venta) || Number(data?.dolar_venta);
    if (Number.isFinite(maybe) && maybe > 0) return maybe;

    const url = `${apiBase}?action=${action}&op=facturacion_dolar_oficial`;
    const j = await fetchJSON(url, { method: "GET", headers: { Accept: "application/json" } });

    if (j?.ok !== true) throw new Error(j?.error || "Dólar oficial: ok=false");

    const venta = Number(j?.venta);
    if (!Number.isFinite(venta) || venta <= 0) throw new Error("Dólar oficial: 'venta' inválida");
    return venta;
  }, [apiBase, action, data, fetchJSON]);

  // BALTO: planes mantenimiento
  const fetchPlanesMantenimiento = useCallback(async () => {
    const url = `${apiBase}?action=${action}&op=facturacion_planes_mantenimiento`;
    const j = await fetchJSON(url, { method: "GET", headers: { Accept: "application/json" } });

    const arr = Array.isArray(j?.planes) ? j.planes : [];
    return arr
      .map((p) => ({
        id: Number(p?.id) || 0,
        nombre: safeStr(p?.nombre),
        descripcion: safeStr(p?.descripcion),
        monto: Number(p?.monto) || 0,
        activo: Number(p?.activo) || 0,
      }))
      .filter((p) => p.id > 0 && p.nombre);
  }, [apiBase, action, fetchJSON]);

  const mantenimientoSeleccionado = useMemo(() => {
    const set = new Set((mantSel || []).map((x) => Number(x)));
    return (planesMant || []).filter((p) => set.has(Number(p.id)));
  }, [mantSel, planesMant]);

  const devUsdNum = useMemo(() => {
    const n = Number(String(devUsd || "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [devUsd]);

  const totalUSD = useMemo(() => {
    const mant = mantenimientoSeleccionado.reduce((acc, it) => acc + (Number(it.monto) || 0), 0);
    return mant + devUsdNum;
  }, [mantenimientoSeleccionado, devUsdNum]);

  const totalARS = useMemo(() => {
    const r = Number(usdRate);
    if (!Number.isFinite(r) || r <= 0) return 0;
    return totalUSD * r;
  }, [totalUSD, usdRate]);

  const itemsDetalle = useMemo(() => {
    const out = [];

    for (const it of mantenimientoSeleccionado) {
      const labelBase = safeStr(it.nombre);
      const desc = safeStr(it.descripcion);
      const label = desc ? `${labelBase} — ${desc}` : labelBase;

      out.push({
        tipo: "mantenimiento",
        id: Number(it.id),
        descripcion: label,
        usd: Number(it.monto) || 0,
      });
    }

    if (devUsdNum > 0 || String(devDesc || "").trim() !== "") {
      out.push({
        tipo: "desarrollo",
        id: "desarrollo_manual",
        descripcion: String(devDesc || "").trim() || "Desarrollo",
        usd: devUsdNum,
      });
    }

    const r = Number(usdRate);
    return out.map((x) => ({
      ...x,
      ars: Number.isFinite(r) && r > 0 ? x.usd * r : 0,
    }));
  }, [mantenimientoSeleccionado, devUsdNum, devDesc, usdRate]);

  const toggleMant = useCallback((id) => {
    const nid = Number(id);
    if (!Number.isFinite(nid) || nid <= 0) return;

    setMantSel((prev) => {
      const set = new Set((prev || []).map((x) => Number(x)));
      if (set.has(nid)) set.delete(nid);
      else set.add(nid);
      return Array.from(set);
    });
    setError("");
  }, []);

  const planesFiltrados = useMemo(() => {
    const q = safeStr(mantSearch).toLowerCase();
    const base = Array.isArray(planesMant) ? planesMant : [];
    if (!q) return base;
    return base.filter((p) => {
      const n = safeStr(p.nombre).toLowerCase();
      const d = safeStr(p.descripcion).toLowerCase();
      return n.includes(q) || d.includes(q);
    });
  }, [planesMant, mantSearch]);

  const selectedLabel = useMemo(() => {
    const n = (mantSel || []).length;
    if (n === 0) return "Seleccionar planes...";
    if (n === 1) {
      const oneId = Number(mantSel[0]);
      const found = (planesMant || []).find((p) => Number(p.id) === oneId);
      return found ? found.nombre : "1 seleccionado";
    }
    return `${n} seleccionados`;
  }, [mantSel, planesMant]);

  // al abrir modal: reset + precarga
  useEffect(() => {
    if (!open) return;

    setError("");
    setOpenResumen(false);

    setDocTipo(80);
    setCbteTipo(11);
    setDocNro("");
    setClienteFact(null);

    setMantSel([]);
    setMantOpen(false);
    setMantSearch("");
    setDevDesc("");
    setDevUsd("");

    setPlanesMant([]);
    setPlanesErr("");

    const { desde, hasta } = monthFirstLastISO(data?.anio, data?.mes);
    setPeriodoDesde(desde);
    setPeriodoHasta(hasta);
    setVtoPago(hasta);

    // dólar
    (async () => {
      setLoadingUsd(true);
      setUsdErr("");
      try {
        const venta = await getUsdOficialVenta();
        setUsdRate(venta);
      } catch (e) {
        setUsdRate(null);
        setUsdErr(e?.message || "No se pudo obtener el dólar oficial.");
      } finally {
        setLoadingUsd(false);
      }
    })();

    // planes
    (async () => {
      setLoadingPlanes(true);
      setPlanesErr("");
      try {
        const planes = await fetchPlanesMantenimiento();
        setPlanesMant(planes);
      } catch (e) {
        setPlanesMant([]);
        setPlanesErr(e?.message || "No se pudieron obtener planes de mantenimiento.");
      } finally {
        setLoadingPlanes(false);
      }
    })();

    // cliente_facturacion: si ya viene del padre, listo
    const cfFromParent = data?.cliente_facturacion;
    if (cfFromParent !== undefined) {
      setClienteFact(cfFromParent || null);
      if (cfFromParent?.doc_tipo) setDocTipo(Number(cfFromParent.doc_tipo));
      if (cfFromParent?.doc_nro) setDocNro(String(cfFromParent.doc_nro).replace(/\D/g, ""));
      setTimeout(() => firstRef.current?.focus?.(), 0);
      return;
    }

    // si no hay id_pago, no pedimos por id_pago
    if (!idPagoReal) {
      setTimeout(() => firstRef.current?.focus?.(), 0);
      return;
    }

    // pedir cliente_facturacion (BALTO)
    (async () => {
      setLoadingCliente(true);
      try {
        const url = `${apiBase}?action=${action}&op=facturacion_cliente_facturacion`;
        const resp = await fetchJSON(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            id_pago: Number(idPagoReal),
            anio: Number(data?.anio || 0),
            mes: String(data?.mes || ""),
          }),
        });

        const cf = resp?.cliente_facturacion ?? null;
        setClienteFact(cf);

        if (cf?.doc_tipo) setDocTipo(Number(cf.doc_tipo));
        if (cf?.doc_nro) setDocNro(String(cf.doc_nro).replace(/\D/g, ""));
      } catch (e) {
        console.warn("cliente_facturacion:", e?.message || e);
      } finally {
        setLoadingCliente(false);
        setTimeout(() => firstRef.current?.focus?.(), 0);
      }
    })();
  }, [open, apiBase, action, data, fetchJSON, getUsdOficialVenta, idPagoReal, fetchPlanesMantenimiento]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const validarInputs = useCallback(() => {
    const doc = String(docNro || "").replace(/\D/g, "");

    if (!(idPagoReal > 0 || idSistemaReal > 0)) {
      return { ok: false, msg: "Falta id_sistema / id_pago (registro inválido)." };
    }

    if (!doc) return { ok: false, msg: "Ingresá el número de documento (solo números)." };

    if (Number(docTipo) === 96 && !(doc.length === 7 || doc.length === 8)) {
      return { ok: false, msg: "DNI inválido (7 u 8 dígitos, sin puntos)." };
    }
    if (Number(docTipo) === 80 && doc.length !== 11) {
      return { ok: false, msg: "CUIT inválido (11 dígitos, sin guiones)." };
    }

    const pvN = Number(DEFAULT_PTO_VTA);
    if (!Number.isFinite(pvN) || pvN <= 0) return { ok: false, msg: "Punto de venta inválido." };

    const r = Number(usdRate);
    if (!Number.isFinite(r) || r <= 0) return { ok: false, msg: "No hay cotización USD válida." };

    const hasMant = (mantSel?.length || 0) > 0;
    const hasDevMonto = devUsdNum > 0;
    if (!hasMant && !hasDevMonto) {
      return { ok: false, msg: "Seleccioná al menos un plan o cargá Desarrollo (USD)." };
    }

    if (!Number.isFinite(totalARS) || totalARS <= 0) {
      return { ok: false, msg: "Total ARS inválido o 0. Revisá montos y dólar." };
    }

    const d = dateToYMD8(periodoDesde);
    const h = dateToYMD8(periodoHasta);
    const v = dateToYMD8(vtoPago);

    if (!d) return { ok: false, msg: "Elegí Período Desde válido." };
    if (!h) return { ok: false, msg: "Elegí Período Hasta válido." };
    if (!v) return { ok: false, msg: "Elegí Vto. válido." };
    if (h < d) return { ok: false, msg: "Período Hasta no puede ser menor que Desde." };

    return { ok: true };
  }, [docNro, docTipo, periodoDesde, periodoHasta, vtoPago, usdRate, mantSel, devUsdNum, totalARS, idPagoReal, idSistemaReal]);

  const irAResumen = useCallback(() => {
    setError("");
    const v = validarInputs();
    if (!v.ok) return setError(v.msg);
    setOpenResumen(true);
  }, [validarInputs]);

  const cerrar = useCallback(() => onClose?.(), [onClose]);

  if (!open) return null;

  return (
    <>
      <div className="mi-modal__overlay" onClick={(e) => e.target.classList.contains("mi-modal__overlay") && cerrar()}>
        <div className="mi-modal__container" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="mi-modal__header">
            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Factura BALTO (CAE)</h2>
              <p className="mi-modal__subtitle">Pago: {idPagoLabel} &nbsp;|&nbsp; {titulo}</p>
            </div>

            <button className="mi-modal__close" onClick={cerrar} aria-label="Cerrar" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mit-modal__body">
            <div className="mi-tabpanel is-active">
              {error && <div className="arca-alert arca-alert--error" role="alert">{error}</div>}

              {loadingCliente ? <div className="arca-alert arca-alert--info" role="status">Cargando datos del cliente...</div> : null}

              {loadingUsd ? (
                <div className="arca-alert arca-alert--info" role="status">Obteniendo dólar oficial...</div>
              ) : usdErr ? (
                <div className="arca-alert arca-alert--error" role="alert">{usdErr}</div>
              ) : usdRate ? (
                <div className="arca-alert arca-alert--info" role="status">
                  Dólar oficial (VENTA): <b>${Number(usdRate).toFixed(2)}</b> ARS
                </div>
              ) : null}

              {loadingPlanes ? (
                <div className="arca-alert arca-alert--info" role="status">Cargando planes...</div>
              ) : planesErr ? (
                <div className="arca-alert arca-alert--error" role="alert">{planesErr}</div>
              ) : null}

              <div className="mi-grid">
                <article className="mi-card">
                  <h3 className="mi-card__title">Cliente / Servicio</h3>

                  <div className="arca-kv">
                    <div className="arca-kv__row"><span className="arca-kv__k">Cliente</span><span className="arca-kv__v">{nombreCliente}</span></div>
                    <div className="arca-kv__row"><span className="arca-kv__k">Sistema</span><span className="arca-kv__v">{nombreSistema}</span></div>

                    <div className="arca-kv__row"><span className="arca-kv__k">Total USD</span><span className="arca-kv__v">{moneyUSD(totalUSD)}</span></div>
                    <div className="arca-kv__row"><span className="arca-kv__k">Total ARS (a facturar)</span><span className="arca-kv__v">{moneyARS(totalARS)}</span></div>

                    <div className="arca-kv__row"><span className="arca-kv__k">Punto de venta</span><span className="arca-kv__v">{DEFAULT_PTO_VTA}</span></div>
                  </div>

                  <div className="arca-mini" style={{ marginTop: 10 }}>
                    {itemsDetalle.length ? (
                      <>
                        <b>Detalle:</b>{" "}
                        {itemsDetalle.map((it, idx) => (
                          <span key={`${it.id}_${idx}`}>
                            {it.descripcion} ({moneyUSD(it.usd)}{usdRate ? ` → ${moneyARS(it.ars)}` : ""})
                            {idx < itemsDetalle.length - 1 ? " • " : ""}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span>Seleccioná planes o cargá desarrollo.</span>
                    )}
                  </div>
                </article>

                <article className="mi-card">
                  <h3 className="mi-card__title">Datos de facturación</h3>

                  <div className="fl-grid">
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={docTipo}
                        onChange={(e) => { setDocTipo(Number(e.target.value)); setError(""); }}
                        ref={firstRef}
                      >
                        {DOC_TIPOS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                      </select>
                      <label className="fl-label">Tipo doc</label>
                    </div>

                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={docNro}
                        onChange={(e) => { setDocNro(e.target.value.replace(/\D/g, "")); setError(""); }}
                        inputMode="numeric"
                      />
                      <label className="fl-label">Nro doc *</label>
                    </div>

                    <div className="fl-field fl-col-full">
                      <select className="fl-input fl-select" value={cbteTipo} onChange={(e) => setCbteTipo(Number(e.target.value))}>
                        {CBTE_TIPOS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <label className="fl-label">Tipo comprobante</label>
                    </div>

                    <div className="fl-field fl-col-full">
                      <input className="fl-input" value={DEFAULT_PTO_VTA} disabled readOnly />
                      <label className="fl-label">Punto de venta *</label>
                    </div>
                  </div>

                  {clienteFact ? (
                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      {clienteFact.razon_social || "—"} • {clienteFact.cond_iva || "—"}
                    </div>
                  ) : (
                    <div className="arca-mini" style={{ marginTop: 10 }}>
                      <b>DB:</b> (sin datos de facturación cargados)
                    </div>
                  )}
                </article>

                {/* Mantenimiento (DB) */}
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Mantenimiento (USD) • Desde DB</h3>

                  <div ref={mantWrapRef} className="arca-dd">
                    <button
                      type="button"
                      className={`arca-dd__trigger ${mantOpen ? "is-open" : ""}`}
                      onClick={() => setMantOpen((v) => !v)}
                      disabled={loadingPlanes || !!planesErr}
                    >
                      <span className="arca-dd__label">{selectedLabel}</span>
                      <span className="arca-dd__chev">{mantOpen ? "▲" : "▼"}</span>
                    </button>

                    {mantOpen && (
                      <div className="arca-dd__panel">
                        <div className="arca-dd__search">
                          <input
                            className="fl-input arca-dd__search-input"
                            placeholder="Buscar plan..."
                            value={mantSearch}
                            onChange={(e) => setMantSearch(e.target.value)}
                          />
                        </div>

                        {planesFiltrados.length === 0 ? (
                          <div className="arca-dd__empty">No hay planes para mostrar.</div>
                        ) : (
                          <div className="arca-dd__list">
                            {planesFiltrados.map((p) => {
                              const checked = mantSel.includes(Number(p.id));
                              return (
                                <label key={p.id} className={`arca-dd__item ${checked ? "is-checked" : ""}`}>
                                  <input className="arca-dd__cb" type="checkbox" checked={checked} onChange={() => toggleMant(p.id)} />
                                  <span className="arca-dd__fakecb" aria-hidden="true" />
                                  <div className="arca-dd__meta">
                                    <div className="arca-dd__top">
                                      <span className="arca-dd__name">{p.nombre}</span>
                                      <span className="arca-dd__amount">{moneyUSD(p.monto)}</span>
                                    </div>
                                    {p.descripcion ? <div className="arca-dd__desc">{p.descripcion}</div> : null}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        <div className="arca-dd__actions">
                          <button type="button" className="mit-btn mit-btn--ghost" onClick={() => setMantSel([])}>
                            Limpiar
                          </button>

                          <button type="button" className="mit-btn mit-btn--solid" onClick={() => setMantOpen(false)} style={{ marginLeft: "auto" }}>
                            Listo <FaCheck style={{ marginLeft: 8 }} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="arca-mini" style={{ marginTop: 10 }}>
                    Se convierte a ARS con dólar oficial (venta). En el PDF se muestran solo importes en ARS.
                  </div>
                </article>

                {/* Desarrollo manual */}
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Desarrollo (USD) • Manual</h3>

                  <div className="fl-grid">
                    <div className="fl-field fl-col-full">
                      <input className="fl-input" placeholder=" " value={devDesc} onChange={(e) => { setDevDesc(e.target.value); setError(""); }} />
                      <label className="fl-label">Descripción (opcional)</label>
                    </div>

                    <div className="fl-field">
                      <input
                        className="fl-input"
                        placeholder=" "
                        value={devUsd}
                        onChange={(e) => { const v = e.target.value.replace(/[^\d.,]/g, ""); setDevUsd(v); setError(""); }}
                        inputMode="decimal"
                      />
                      <label className="fl-label">Monto (USD)</label>
                    </div>

                    <div className="fl-field">
                      <input className="fl-input" value={usdRate && devUsdNum > 0 ? moneyARS(devUsdNum * Number(usdRate)) : "$0,00"} disabled readOnly />
                      <label className="fl-label">Equivalente (ARS)</label>
                    </div>
                  </div>
                </article>

                {/* Período / Vencimiento */}
                <article className="mi-card mi-card--full">
                  <h3 className="mi-card__title">Período / Vencimiento</h3>

                  <div className="fl-grid">
                    <div
                      className="fl-field"
                      onMouseDown={(e) => { e.preventDefault(); openNativePicker(refDesde.current); }}
                      onClick={() => openNativePicker(refDesde.current)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNativePicker(refDesde.current); }
                      }}
                    >
                      <input
                        ref={refDesde}
                        className="fl-input"
                        type="date"
                        value={periodoDesde}
                        onChange={(e) => { setPeriodoDesde(e.target.value); setError(""); }}
                        onClick={(e) => { e.stopPropagation(); openNativePicker(e.currentTarget); }}
                      />
                      <label className="fl-label">Período desde *</label>
                    </div>

                    <div
                      className="fl-field"
                      onMouseDown={(e) => { e.preventDefault(); openNativePicker(refHasta.current); }}
                      onClick={() => openNativePicker(refHasta.current)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNativePicker(refHasta.current); }
                      }}
                    >
                      <input
                        ref={refHasta}
                        className="fl-input"
                        type="date"
                        value={periodoHasta}
                        onChange={(e) => { setPeriodoHasta(e.target.value); setError(""); }}
                        onClick={(e) => { e.stopPropagation(); openNativePicker(e.currentTarget); }}
                      />
                      <label className="fl-label">Período hasta *</label>
                    </div>

                    <div
                      className="fl-field"
                      onMouseDown={(e) => { e.preventDefault(); openNativePicker(refVto.current); }}
                      onClick={() => openNativePicker(refVto.current)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNativePicker(refVto.current); }
                      }}
                    >
                      <input
                        ref={refVto}
                        className="fl-input"
                        type="date"
                        value={vtoPago}
                        onChange={(e) => { setVtoPago(e.target.value); setError(""); }}
                        onClick={(e) => { e.stopPropagation(); openNativePicker(e.currentTarget); }}
                      />
                      <label className="fl-label">Vto. para el pago *</label>
                    </div>
                  </div>
                </article>
              </div>
            </div>

            <div className="mit-actions">
              <button type="button" className="mit-btn mit-btn--ghost" onClick={cerrar}>Cancelar</button>
              <button type="button" className="mit-btn mit-btn--solid" onClick={irAResumen}>
                Continuar <FaCheck style={{ marginLeft: 8 }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ModalFacturaBaltoResumen
        open={openResumen}
        onClose={() => setOpenResumen(false)}
        onBack={() => setOpenResumen(false)}
        onCloseAll={() => onClose?.()}
        apiBase={apiBase}
        action={action}
        data={{
          ...data,
          id_sistema: idSistemaReal || data?.id_sistema || null,
          id_pago: idPagoReal > 0 ? idPagoReal : null,
          cliente_facturacion: clienteFact,

          usd_rate: usdRate,
          total_usd: totalUSD,
          total_ars: totalARS,
          items_facturacion: itemsDetalle,

          monto: totalARS,

          periodo_desde: dateToYMD8(periodoDesde),
          periodo_hasta: dateToYMD8(periodoHasta),
          vto_pago: dateToYMD8(vtoPago),

          periodo_desde_iso: periodoDesde,
          periodo_hasta_iso: periodoHasta,
          vto_pago_iso: vtoPago,
        }}
        docTipo={docTipo}
        docNro={docNro}
        cbteTipo={cbteTipo}
        ptoVta={String(DEFAULT_PTO_VTA)}
        onFacturada={onFacturada}
        onDone={onDone}
        forceTestAmount={FORCE_TEST_AMOUNT}
        testAmount={TEST_AMOUNT}
      />
    </>
  );
}