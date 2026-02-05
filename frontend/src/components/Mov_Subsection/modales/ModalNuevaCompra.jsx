// src/components/Compras/modales/ModalNuevaCompra.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css"; // ✅ misma estética
import BASE_URL from "../../../config/config";

const NULL_OPTION = "";
const IVA_OPTIONS = [
  { label: "0%", value: 0 },
  { label: "10,5%", value: 10.5 },
  { label: "21%", value: 21 },
];

/* =========================
   Helpers
========================= */
function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}

/* =========================
   Período helpers (UI MM-YYYY) <-> API YYYY-MM
========================= */
function normalizePeriodoToMMYYYY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  let m = "";
  let y = "";

  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    y = parts[0];
    m = parts[1];
  } else if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const parts = s.split(/[-/]/);
    m = parts[0];
    y = parts[1];
  } else if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      y = s.slice(0, 4);
      m = s.slice(4);
    } else {
      m = s.slice(0, 2);
      y = s.slice(2);
    }
  } else {
    return s;
  }

  const mm = String(Number(m)).padStart(2, "0");
  const yyyy = String(y);
  return `${mm}-${yyyy}`;
}
function periodoFromISODate(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}-${y}`;
}
function periodoMMYYYY_to_YYYYMM(mmYYYY) {
  const s = String(mmYYYY ?? "").trim();
  if (!/^\d{2}-\d{4}$/.test(s)) return "";
  const [mm, yyyy] = s.split("-");
  return `${yyyy}-${mm}`;
}
function toNullableId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function toNullableDateISO(v) {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/* =========================
   Tipo movimiento helper
   (listas: tipos_movimiento => {id, nombre})
========================= */
function pickTipoMovimientoIdByName(listsNorm, name) {
  const arr = Array.isArray(listsNorm?.tipos_movimiento) ? listsNorm.tipos_movimiento : [];
  const target = String(name || "").trim().toLowerCase();

  const found =
    arr.find((x) => String(x?.nombre ?? "").trim().toLowerCase() === target) ||
    arr.find((x) => String(x?.nombre ?? "").toLowerCase().includes(target));

  const id = Number(found?.id); // ✅ TU backend devuelve "id"
  return Number.isFinite(id) && id > 0 ? id : null;
}

/* =========================
   Lists normalize (por si viene envuelto en listas)
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
  proveedores: [],
  medios_pago: [],
  cuentas_corrientes: [],
  detalles: [],
  tipos_movimiento: [],
};

function normalizeIncomingLists(lists) {
  const src = lists?.listas && typeof lists.listas === "object" ? lists.listas : lists;
  const pick = (k) => (Array.isArray(src?.[k]) ? src[k] : []);
  return {
    periodos: pick("periodos"),
    clasificaciones: pick("clasificaciones"),
    proveedores: pick("proveedores"),
    medios_pago: pick("medios_pago"),
    cuentas_corrientes: pick("cuentas_corrientes"),
    detalles: pick("detalles"),
    tipos_movimiento: pick("tipos_movimiento"),
  };
}

/* =========================
   Modal
========================= */
export default function ModalNuevaCompra({
  open,
  lists,
  periodoDefault, // UI: MM-YYYY
  onClose,
  onToast,
  onSaveCompra, // async (payloadPlano) => {}
}) {
  const API = `${BASE_URL}/api.php`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  // ✅ lock scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const [localLists, setLocalLists] = useState(() => ({
    ...SAFE_LISTS,
    ...normalizeIncomingLists(lists),
  }));
  useEffect(() => {
    setLocalLists({ ...SAFE_LISTS, ...normalizeIncomingLists(lists) });
  }, [lists]);

  const listsNorm = useMemo(() => localLists, [localLists]);

  const closeBtnRef = useRef(null);

  // estado principal
  const [fecha, setFecha] = useState(todayISO());
  const [periodoUI, setPeriodoUI] = useState(
    normalizePeriodoToMMYYYY(periodoDefault || "") || periodoFromISODate(todayISO())
  );

  const [compra, setCompra] = useState({
    id_clasificacion: NULL_OPTION,

    id_proveedor: NULL_OPTION,
    proveedor_nombre: "",
    proveedor_cuit: "",

    forma_compra: "contado", // contado | cuenta_corriente
    id_cuenta_corriente: NULL_OPTION,
    id_medio_pago: NULL_OPTION,
  });

  // 1 item (alineado a backend)
  const [item, setItem] = useState({
    id_detalle: null,
    detalle: "",
    cantidad: 1,
    precio: 0,
    ivaPct: 0,
  });

  const [saving, setSaving] = useState(false);

  // reset al abrir
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const f = todayISO();
      setFecha(f);
      setPeriodoUI(normalizePeriodoToMMYYYY(periodoDefault || "") || periodoFromISODate(f));

      setCompra({
        id_clasificacion: NULL_OPTION,

        id_proveedor: NULL_OPTION,
        proveedor_nombre: "",
        proveedor_cuit: "",

        forma_compra: "contado",
        id_cuenta_corriente: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
      });

      setItem({
        id_detalle: null,
        detalle: "",
        cantidad: 1,
        precio: 0,
        ivaPct: 0,
      });

      setSaving(false);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, periodoDefault]);

  /* =========================
     Autocomplete proveedor
  ========================= */
  const proveedorInputRef = useRef(null);
  const [provFocus, setProvFocus] = useState(false);
  const [provInput, setProvInput] = useState("");

  const proveedoresList = useMemo(
    () => (Array.isArray(listsNorm.proveedores) ? listsNorm.proveedores : []),
    [listsNorm.proveedores]
  );

  const filteredProveedores = useMemo(() => {
    const q = provInput.trim().toLowerCase();
    if (!provFocus || q.length < 1) return [];
    return proveedoresList
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [proveedoresList, provInput, provFocus]);

  const handleProveedorInputChange = (e) => {
    const value = e.target.value;
    setProvInput(value);
    setCompra((p) => ({
      ...p,
      id_proveedor: NULL_OPTION,
      proveedor_nombre: value,
    }));
  };

  const handleSelectProveedor = (prov) => {
    const nombre = String(prov?.nombre ?? "").trim();

    setProvInput(nombre);
    setCompra((p) => ({
      ...p,
      id_proveedor: prov?.id != null ? String(prov.id) : NULL_OPTION, // ✅ listas trae id
      proveedor_nombre: nombre,
      // CUIT no viene en listas -> lo dejas manual
    }));
    setProvFocus(false);
  };

  /* =========================
     Autocomplete detalle (item)
  ========================= */
  const detalleInputRef = useRef(null);
  const [detFocus, setDetFocus] = useState(false);

  const detallesList = useMemo(
    () => (Array.isArray(listsNorm.detalles) ? listsNorm.detalles : []),
    [listsNorm.detalles]
  );

  const filteredDetalles = useMemo(() => {
    const q = String(item.detalle || "").trim().toLowerCase();
    if (!detFocus || q.length < 1) return [];
    return detallesList
      .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [detallesList, item.detalle, detFocus]);

  const handleSelectDetalle = (det) => {
    const nombre = String(det?.nombre ?? "").trim();
    const idDet = Number(det?.id);
    setItem((p) => ({
      ...p,
      detalle: nombre,
      id_detalle: Number.isFinite(idDet) && idDet > 0 ? idDet : null,
    }));
    setDetFocus(false);
  };

  /* =========================
     Totales (item)
  ========================= */
  const itemCalc = useMemo(() => {
    const cantidad = Math.max(0, safeNumber(item.cantidad));
    const precio = Math.max(0, safeNumber(item.precio));
    const ivaPct = Math.max(0, safeNumber(item.ivaPct));
    const subtotal = cantidad * precio;
    const ivaMonto = subtotal * (ivaPct / 100);
    const total = subtotal + ivaMonto;
    return { cantidad, precio, ivaPct, subtotal, ivaMonto, total };
  }, [item]);

  /* =========================
     Validación
  ========================= */
  const validate = useCallback(() => {
    const provOk =
      Number(compra.id_proveedor) > 0 ||
      String(provInput).trim() !== "" ||
      String(compra.proveedor_nombre).trim() !== "";

    if (!provOk) return { ok: false, msg: "Seleccioná un proveedor (obligatorio)." };

    if (!(Number(compra.id_clasificacion) > 0)) {
      return { ok: false, msg: "Seleccioná la clasificación (obligatoria)." };
    }

    const detOk = Number(item.id_detalle) > 0;
    if (!detOk) return { ok: false, msg: "Seleccioná un detalle válido (obligatorio)." };

    if (Number(itemCalc.total) <= 0) return { ok: false, msg: "El total debe ser mayor a 0." };

    if (compra.forma_compra === "contado" && !(Number(compra.id_medio_pago) > 0)) {
      return { ok: false, msg: "Seleccioná un medio de pago (contado)." };
    }

    return { ok: true };
  }, [compra, provInput, item, itemCalc.total]);

  /* =========================
     Submit (POST JSON plano)
     ✅ Compra = ENTRADA => id_tipo_movimiento
========================= */
  const submit = useCallback(async () => {
    if (saving) return;

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 3600);
      return;
    }

    setSaving(true);
    showToast("cargando", "Guardando compra…", 12000);

    try {
      const fechaISO = toNullableDateISO(fecha) || todayISO();

      // UI MM-YYYY -> API YYYY-MM
      const perUI = normalizePeriodoToMMYYYY(periodoUI) || periodoFromISODate(fechaISO);
      const periodoAPI = periodoMMYYYY_to_YYYYMM(perUI);

      const idEntrada = pickTipoMovimientoIdByName(listsNorm, "entrada");
      if (!idEntrada) {
        throw new Error(
          "No se encontró el tipo de movimiento 'ENTRADA' en listas.tipos_movimiento (global_obtener_listas)."
        );
      }

      const payload = {
        // backend: si faltan, autocompleta, pero mandamos bien
        fecha: fechaISO,
        periodo: periodoAPI,

        id_tipo_movimiento: idEntrada, // ✅ ENTRADA = Compra

        id_clasificacion: toNullableId(compra.id_clasificacion),

        id_proveedor: toNullableId(compra.id_proveedor),
        // estos 2 son extras tuyos (backend hoy los ignora, no pasa nada)
        proveedor_nombre: String(compra.proveedor_nombre || provInput || "").trim(),
        proveedor_cuit: String(compra.proveedor_cuit || "").trim() || null,

        id_cuenta_corriente:
          compra.forma_compra === "cuenta_corriente" ? toNullableId(compra.id_cuenta_corriente) : null,
        id_medio_pago: compra.forma_compra === "contado" ? toNullableId(compra.id_medio_pago) : null,

        // item plano (backend lo transforma a movimientos_items)
        id_detalle: toNullableId(item.id_detalle),
        cantidad: Math.round(Number(itemCalc.cantidad) * 100) / 100,
        precio: Math.round(Number(itemCalc.precio) * 100) / 100,
        iva_pct: Math.round(Number(itemCalc.ivaPct) * 100) / 100,
        subtotal: Math.round(Number(itemCalc.subtotal) * 100) / 100,
        iva_monto: Math.round(Number(itemCalc.ivaMonto) * 100) / 100,
        total: Math.round(Number(itemCalc.total) * 100) / 100,

        // cabecera
        monto_total: Math.round(Number(itemCalc.total) * 100) / 100,
      };

      // si el padre pasa handler, usamos eso
      if (onSaveCompra) {
        await onSaveCompra(payload);
      } else {
        // fallback: post directo
        const token = localStorage.getItem("token") || "";
        const headers = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${API}?action=movimientos_crear`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Respuesta inválida del servidor. HTTP ${res.status}\n${text.slice(0, 600)}`);
        }
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la compra.");
      }

      showToast("exito", "Compra guardada.", 2600);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando compra.", 4500);
      setSaving(false);
    }
  }, [API, compra, fecha, item, itemCalc, listsNorm, onClose, onSaveCompra, periodoUI, provInput, saving, showToast, validate]);

  if (!open) return null;

  const modalJSX = (
    <div className="mi-modal__overlay mi-modal__overlay--mov" onMouseDown={() => (!saving ? onClose?.() : null)}>
      <div
        className="mi-modal__container mi-modal__container--mov"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header mi-modal__header--car">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Nueva Compra</h2>
            <p className="mi-modal__subtitle">Carga 1 detalle (alineado al backend actual).</p>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={() => (!saving ? onClose?.() : null)}
            aria-label="Cerrar"
            disabled={saving}
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="mi-modal__content mi-modal__content--car">
          <div className="mi-cr-grid">
            {/* =========================
                Izquierda: item
            ========================= */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__head">
                <div>Detalle</div>
                <div style={{ textAlign: "center" }}>Cant.</div>
                <div style={{ textAlign: "center" }}>Precio</div>
                <div style={{ textAlign: "center" }}>% IVA</div>
                <div style={{ textAlign: "center" }}>IVA</div>
                <div style={{ textAlign: "center" }}>Total</div>
              </div>

              <div className="mi-cr-table__rows">
                <div className="mi-cr-row mi-cr-row--car">
                  {/* Detalle */}
                  <div className="mi-cr-cell mi-cr-col mi-cr-col--desc" style={{ position: "relative" }}>
                    <input
                      ref={detalleInputRef}
                      className="fl-input"
                      placeholder="Detalle del ítem…"
                      value={item.detalle}
                      onChange={(e) => setItem((p) => ({ ...p, detalle: e.target.value, id_detalle: null }))}
                      onFocus={() => setDetFocus(true)}
                      onBlur={() => setTimeout(() => setDetFocus(false), 120)}
                      disabled={saving}
                      autoComplete="off"
                      style={{ height: 38 }}
                    />

                    {detFocus && filteredDetalles.length > 0 && (
                      <ul className="mi-cr-suggest">
                        {filteredDetalles.map((d) => (
                          <li
                            key={d.id}
                            className="mi-cr-suggest__item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectDetalle(d);
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {d.nombre}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Cantidad */}
                  <div className="mi-cr-cell mi-cr-col mi-cr-col--qty">
                    <input
                      className="fl-input"
                      type="number"
                      min="0"
                      step="1"
                      value={item.cantidad}
                      onChange={(e) =>
                        setItem((p) => ({
                          ...p,
                          cantidad: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                      disabled={saving}
                      style={{ height: 38, textAlign: "center" }}
                    />
                  </div>

                  {/* Precio */}
                  <div className="mi-cr-cell mi-cr-col mi-cr-col--price">
                    <input
                      className="fl-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio}
                      onChange={(e) =>
                        setItem((p) => ({
                          ...p,
                          precio: e.target.value === "" ? "" : Number(e.target.value),
                        }))
                      }
                      disabled={saving}
                      style={{ height: 38, textAlign: "center" }}
                    />
                  </div>

                  {/* % IVA */}
                  <div className="mi-cr-cell mi-cr-col mi-cr-col--iva">
                    <select
                      className="fl-input fl-select fl-select-iva--car fl-select-iva--compra"
                      value={String(item.ivaPct)}
                      onChange={(e) => setItem((p) => ({ ...p, ivaPct: Number(e.target.value) }))}
                      disabled={saving}
                      style={{ height: 38, textAlign: "center" }}
                    >
                      {IVA_OPTIONS.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* IVA monto */}
                  <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto">
                    <div style={{ textAlign: "center", paddingTop: 10 }}>{moneyARS(itemCalc.ivaMonto)}</div>
                  </div>

                  {/* Total */}
                  <div className="mi-cr-cell mi-cr-col mi-cr-col--total">
                    <div style={{ textAlign: "center", paddingTop: 10 }}>{moneyARS(itemCalc.total)}</div>
                  </div>
                </div>
              </div>

              <div className="mi-cr-table__foot">
                <div className="mi-cr-totals">
                  <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                    <span>Subtotal</span>
                    <b>{moneyARS(itemCalc.subtotal)}</b>
                  </div>

                  <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                    <span>IVA</span>
                    <b>{moneyARS(itemCalc.ivaMonto)}</b>
                  </div>

                  <div className="mi-cr-totalLine mi-cr-totalLine--total mi-cr-totalLine--big">
                    <span>TOTAL</span>
                    <b>{moneyARS(itemCalc.total)}</b>
                  </div>
                </div>
              </div>
            </section>

            {/* =========================
                Derecha: datos compra
            ========================= */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos de compra</div>

                <div className="mi-cr-filters__dates">
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      type="date"
                      value={fecha}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFecha(v);
                        const perAuto = periodoFromISODate(v);
                        if (perAuto) setPeriodoUI(perAuto);
                      }}
                      disabled={saving}
                    />
                    <label className="fl-label">Fecha</label>
                  </div>

                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder="MM-YYYY"
                      inputMode="numeric"
                      value={periodoUI}
                      onChange={(e) => {
                        const digits = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
                        let next = "";
                        if (digits.length <= 2) next = digits;
                        else next = `${digits.slice(0, 2)}-${digits.slice(2)}`;
                        if (digits.length === 6) next = normalizePeriodoToMMYYYY(next);
                        setPeriodoUI(next);
                      }}
                      disabled={saving}
                    />
                    <label className="fl-label">Período</label>
                  </div>
                </div>
              </div>

              <div className="mi-cr-filters__body">
                <div className="fl-grid" style={{ gridTemplateColumns: "1fr" }}>
                  {/* Clasificación */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={String(compra.id_clasificacion)}
                      onChange={(e) => setCompra((p) => ({ ...p, id_clasificacion: e.target.value }))}
                      disabled={saving}
                    >
                      <option value={NULL_OPTION}>Clasificación (obligatoria)</option>
                      {(listsNorm.clasificaciones || []).map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </select>
                    <label className="fl-label">Clasificación</label>
                  </div>

                  {/* Proveedor autocomplete */}
                  <div className="fl-field" style={{ position: "relative" }}>
                    <input
                      ref={proveedorInputRef}
                      className="fl-input"
                      placeholder=" "
                      value={provInput}
                      onChange={handleProveedorInputChange}
                      onFocus={() => setProvFocus(true)}
                      onBlur={() => setTimeout(() => setProvFocus(false), 120)}
                      disabled={saving}
                      autoComplete="off"
                    />
                    <label className="fl-label">Proveedor (obligatorio)</label>

                    {provFocus && filteredProveedores.length > 0 && (
                      <ul className="mi-cr-suggest">
                        {filteredProveedores.map((p) => (
                          <li
                            key={p.id}
                            className="mi-cr-suggest__item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectProveedor(p);
                            }}
                          >
                            {p.nombre}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* CUIT proveedor (manual) */}
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      placeholder=" "
                      value={compra.proveedor_cuit}
                      onChange={(e) => setCompra((p) => ({ ...p, proveedor_cuit: e.target.value }))}
                      disabled={saving}
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <label className="fl-label">CUIT Proveedor (opcional)</label>
                  </div>

                  {/* Forma compra */}
                  <div className="fl-field">
                    <select
                      className="fl-input fl-select"
                      value={compra.forma_compra}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCompra((p) => ({
                          ...p,
                          forma_compra: next,
                          id_cuenta_corriente: next === "cuenta_corriente" ? p.id_cuenta_corriente : NULL_OPTION,
                          id_medio_pago: next === "contado" ? p.id_medio_pago : NULL_OPTION,
                        }));
                      }}
                      disabled={saving}
                    >
                      <option value="contado">Contado</option>
                      <option value="cuenta_corriente">Cuenta Corriente</option>
                    </select>
                    <label className="fl-label">Forma de compra</label>
                  </div>

                  {/* Cuenta corriente */}
                  {compra.forma_compra === "cuenta_corriente" && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(compra.id_cuenta_corriente)}
                        onChange={(e) => setCompra((p) => ({ ...p, id_cuenta_corriente: e.target.value }))}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Cuenta corriente (opcional)</option>
                        {(listsNorm.cuentas_corrientes || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Cuenta Corriente</label>
                    </div>
                  )}

                  {/* Medio pago */}
                  {compra.forma_compra === "contado" && (
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(compra.id_medio_pago)}
                        onChange={(e) => setCompra((p) => ({ ...p, id_medio_pago: e.target.value }))}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Medio de pago (obligatorio)</option>
                        {(listsNorm.medios_pago || []).map((x) => (
                          <option key={x.id} value={String(x.id)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>
                  )}
                </div>

                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid"
                    style={{ width: "100%", height: 44 }}
                  >
                    {saving ? "Guardando..." : "Guardar compra"}
                  </button>

                  <button
                    type="button"
                    onClick={() => (!saving ? onClose?.() : null)}
                    disabled={saving}
                    className="mit-btn mit-btn--ghost"
                    style={{ width: "100%", height: 44 }}
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
  );

  return createPortal(modalJSX, document.body);
}
