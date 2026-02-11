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

  const id = Number(found?.id); // ✅ backend devuelve "id"
  return Number.isFinite(id) && id > 0 ? id : null;
}

/* =========================
   Lists normalize
   ✅ SIN TODO lo de pago (medios_pago / cuentas_corrientes)
========================= */
const SAFE_LISTS = {
  periodos: [],
  clasificaciones: [],
  proveedores: [],
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
    detalles: pick("detalles"),
    tipos_movimiento: pick("tipos_movimiento"),
  };
}

/* =========================
   API helpers (fallback)
========================= */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";
  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {
    // ignore
  }
  return { token, idUsuario };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`);
  }
}

async function apiPostJson(url, payload) {
  const { token } = getAuthInfo();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });

  return await parseJsonOrThrow(res);
}

/* =========================
   Mini Modal: alta rápida (detalle)
========================= */
function AddCatalogMiniModal({ open, title, value, saving, onChange, onCancel, onSave }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onCancel?.();
      if (e.key === "Enter") onSave?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel, onSave]);

  if (!open) return null;

  return createPortal(
    <div className="mi-mini__overlay" onMouseDown={onCancel}>
      <div className="mi-mini__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{title}</h4>
          <button
            type="button"
            className="mi-mini__close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mi-mini__body">
          <div className="fl-field">
            <input
              ref={inputRef}
              className="fl-input"
              placeholder=" "
              value={value}
              onChange={(e) => onChange?.(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
            <label className="fl-label">Nombre</label>
          </div>

          <div className="mi-mini__actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onCancel} disabled={saving}>
              Cancelar
            </button>

            <button type="button" className="mit-btn mit-btn--solid" onClick={onSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* =========================
   Modal
   ✅ SIN TODO rastro de pago:
   - sin forma_compra
   - sin cuenta corriente
   - sin medio de pago
   - sin validación de pago
   - sin campos en payload
========================= */
export default function ModalNuevaCompra({
  open,
  lists,
  periodoDefault, // UI: MM-YYYY (no obligatorio)
  onClose,
  onToast,
  onSaveCompra, // async (payloadPlano) => {}   (si NO pasás batch, yo hago fallback)
  onSaveBatch, // ✅ opcional: async (payloadsArray) => {}
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

  // estado cabecera compra
  const [fecha, setFecha] = useState(todayISO());
  const [periodoUI, setPeriodoUI] = useState(periodoFromISODate(todayISO())); // ✅ siempre hoy

  const [compra, setCompra] = useState({
    id_proveedor: NULL_OPTION,
    proveedor_nombre: "",
    proveedor_cuit: "",
  });

  // ✅ filas (como Ventas)
  const [rows, setRows] = useState(() => [
    {
      id: crypto?.randomUUID?.() || String(Date.now()),
      id_detalle: NULL_OPTION, // string id o ""
      detalleText: "",
      cantidad: 1,
      precio: 0,
      ivaPct: 0,
    },
  ]);

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
      setPeriodoUI(periodoFromISODate(f)); // ✅ siempre desde la fecha actual

      setCompra({
        id_proveedor: NULL_OPTION,
        proveedor_nombre: "",
        proveedor_cuit: "",
      });

      setRows([
        {
          id: crypto?.randomUUID?.() || String(Date.now()),
          id_detalle: NULL_OPTION,
          detalleText: "",
          cantidad: 1,
          precio: 0,
          ivaPct: 0,
        },
      ]);

      setAddUI({ open: false, rowId: null, text: "", saving: false });
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
     Filas helpers
  ========================= */
  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
        id_detalle: NULL_OPTION,
        detalleText: "",
        cantidad: 1,
        precio: 0,
        ivaPct: 0,
      },
    ]);
  };

  const removeRow = (id) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      return next.length ? next : prev;
    });
  };

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  /* =========================
     Autocomplete detalles (por fila)
  ========================= */
  const detallesList = useMemo(
    () => (Array.isArray(listsNorm.detalles) ? listsNorm.detalles : []),
    [listsNorm.detalles]
  );

  const suggestDetalles = (txt) => {
    const q = String(txt || "").trim().toLowerCase();
    if (!q) return [];
    return detallesList
      .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 18);
  };

  /* =========================
     Mini modal alta detalle (catalogo_crear)
  ========================= */
  const [addUI, setAddUI] = useState({
    open: false,
    rowId: null,
    text: "",
    saving: false,
  });

  const startAddDetalleForRow = useCallback(
    (rowId) => {
      if (saving) return;
      setAddUI({ open: true, rowId, text: "", saving: false });
    },
    [saving]
  );

  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, rowId: null, text: "", saving: false });
  }, [addUI.saving]);

  const guardarNuevoDetalle = useCallback(async () => {
    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", "Creando detalle…", 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const data = await apiPostJson(`${API}?action=catalogo_crear`, {
        catalogo: "detalles",
        nombre,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear el detalle.");

      const newId = Number(data?.item?.id);
      const newNombre = String(data?.item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(newId) || newId <= 0) {
        throw new Error("El servidor no devolvió un ID válido del detalle creado.");
      }

      // push a lista local
      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev.detalles) ? prev.detalles.slice() : [];
        if (!arr.some((x) => Number(x?.id) === newId)) {
          arr.push({ id: newId, nombre: newNombre });
        }
        next.detalles = arr;
        return next;
      });

      // setear fila
      const rowId = addUI.rowId;
      if (rowId) updateRow(rowId, { id_detalle: String(newId), detalleText: newNombre });

      setAddUI({ open: false, rowId: null, text: "", saving: false });
      showToast("exito", `Detalle creado: "${newNombre}"`, 2600);
    } catch (e) {
      const msg = e?.message || "Error creando el detalle.";
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", msg, 4200);
    }
  }, [API, addUI, showToast]);

  /* =========================
     Cálculos por fila
  ========================= */
  const rowsCalc = useMemo(() => {
    return rows.map((r) => {
      const cantidad = Math.max(0, safeNumber(r.cantidad));
      const precio = Math.max(0, safeNumber(r.precio));
      const ivaPct = Math.max(0, safeNumber(r.ivaPct));
      const subtotal = cantidad * precio;
      const ivaMonto = subtotal * (ivaPct / 100);
      const total = subtotal + ivaMonto;
      return { ...r, cantidad, precio, ivaPct, subtotal, ivaMonto, total };
    });
  }, [rows]);

  const resumen = useMemo(() => {
    const subtotal = rowsCalc.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const iva = rowsCalc.reduce((acc, r) => acc + (r.ivaMonto || 0), 0);
    const total = rowsCalc.reduce((acc, r) => acc + (r.total || 0), 0);
    return { subtotal, iva, total };
  }, [rowsCalc]);

  /* =========================
     Validación
     ✅ SIN PAGO
  ========================= */
  const validate = useCallback(() => {
    const provOk =
      Number(compra.id_proveedor) > 0 ||
      String(provInput).trim() !== "" ||
      String(compra.proveedor_nombre).trim() !== "";

    if (!provOk) return { ok: false, msg: "Seleccioná un proveedor (obligatorio)." };

    // filas válidas
    const usableLines = rowsCalc.filter((r) => {
      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return Number.isFinite(det) && det > 0 && total > 0;
    });

    if (!usableLines.length) return { ok: false, msg: "Cargá al menos 1 fila con Detalle y Total > 0." };

    const incompleteTouched = rowsCalc.some((r) => {
      const touched =
        String(r.detalleText || "").trim() !== "" ||
        String(r.id_detalle || "").trim() !== "" ||
        safeNumber(r.cantidad) !== 0 ||
        safeNumber(r.precio) !== 0;
      if (!touched) return false;

      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return !(Number.isFinite(det) && det > 0 && total > 0);
    });

    return { ok: true, warn: incompleteTouched };
  }, [compra, provInput, rowsCalc]);

  /* =========================
     Submit (batch por filas)
     ✅ Compra = ENTRADA (id_tipo_movimiento)
     ✅ SIN PAGO en payload
========================= */
  const submit = useCallback(async () => {
    if (saving) return;

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear el detalle (o cancelá) antes de guardar.", 3200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 3600);
      return;
    }

    setSaving(true);

    if (v.warn) {
      showToast("advertencia", "Hay filas incompletas. Se guardarán solo las filas válidas.", 3500);
    } else {
      showToast("cargando", "Guardando compra…", 12000);
    }

    try {
      const fechaISO = toNullableDateISO(fecha) || todayISO();

      // UI MM-YYYY -> API YYYY-MM
      const perUI = normalizePeriodoToMMYYYY(periodoUI) || normalizePeriodoToMMYYYY(periodoDefault) || periodoFromISODate(fechaISO);
      const periodoAPI = periodoMMYYYY_to_YYYYMM(perUI);

      const idEntrada = pickTipoMovimientoIdByName(listsNorm, "entrada");
      if (!idEntrada) {
        throw new Error(
          "No se encontró el tipo de movimiento 'ENTRADA' en listas.tipos_movimiento (global_obtener_listas)."
        );
      }

      const payloads = rowsCalc
        .filter((r) => {
          const det = Number(r.id_detalle);
          const total = Number(r.total || 0);
          return Number.isFinite(det) && det > 0 && total > 0;
        })
        .map((r) => {
          const payload = {
            fecha: fechaISO,
            periodo: periodoAPI,

            id_tipo_movimiento: idEntrada, // ✅ ENTRADA = Compra

            id_proveedor: toNullableId(compra.id_proveedor),
            proveedor_nombre: String(compra.proveedor_nombre || provInput || "").trim(),
            proveedor_cuit: String(compra.proveedor_cuit || "").trim() || null,

            // fila
            id_detalle: toNullableId(r.id_detalle),
            cantidad: Math.round(Number(r.cantidad) * 100) / 100,
            precio: Math.round(Number(r.precio) * 100) / 100,
            iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
            subtotal: Math.round(Number(r.subtotal) * 100) / 100,
            iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
            total: Math.round(Number(r.total) * 100) / 100,

            // cabecera (por compat)
            monto_total: Math.round(Number(r.total) * 100) / 100,
          };

          Object.keys(payload).forEach((k) => {
            if (payload[k] === undefined) delete payload[k];
          });

          return payload;
        });

      if (!payloads.length) {
        showToast("advertencia", "No hay filas válidas para guardar.", 3500);
        setSaving(false);
        return;
      }

      // ✅ si el padre soporta batch, mejor
      if (onSaveBatch) {
        await onSaveBatch(payloads);
      } else if (onSaveCompra) {
        // fallback: guardo 1 por 1 usando handler existente
        for (const p of payloads) {
          // eslint-disable-next-line no-await-in-loop
          await onSaveCompra(p);
        }
      } else {
        // fallback final: post directo N veces
        for (const p of payloads) {
          // eslint-disable-next-line no-await-in-loop
          const data = await apiPostJson(`${API}?action=movimientos_crear`, p);
          if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar una de las filas.");
        }
      }

      showToast("exito", `Compra guardada: ${payloads.length} fila(s).`, 2600);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando compra.", 4500);
      setSaving(false);
    }
  }, [
    API,
    addUI.open,
    compra,
    fecha,
    listsNorm,
    onClose,
    onSaveBatch,
    onSaveCompra,
    periodoUI,
    periodoDefault,
    provInput,
    rowsCalc,
    saving,
    showToast,
    validate,
  ]);

  if (!open) return null;

  const miniOpen = addUI.open;
  const miniTitle = "Nuevo detalle";

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
            <p className="mi-modal__subtitle">Planilla a la izquierda + datos básicos a la derecha.</p>
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
                Izquierda: planilla items
            ========================= */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__head">
                <div>Detalle</div>
                <div style={{ textAlign: "center" }}>Cant.</div>
                <div style={{ textAlign: "center" }}>Precio</div>
                <div style={{ textAlign: "center" }}>% IVA</div>
                <div style={{ textAlign: "center" }}>IVA</div>
                <div style={{ textAlign: "center" }}>Total</div>
                <div />
              </div>

              <div className="mi-cr-table__rows">
                {rowsCalc.map((r) => {
                  const suggestions = suggestDetalles(r.detalleText);
                  const showSug =
                    String(r.detalleText || "").trim().length > 0 &&
                    Number(r.id_detalle || 0) <= 0 &&
                    suggestions.length > 0;

                  return (
                    <div key={r.id} className="mi-cr-row mi-cr-row--car">
                      {/* Detalle */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--desc" style={{ position: "relative" }}>
                        <input
                          className="fl-input"
                          placeholder="Escribí o seleccioná un detalle…"
                          value={r.detalleText}
                          onChange={(e) =>
                            updateRow(r.id, {
                              detalleText: e.target.value,
                              id_detalle: NULL_OPTION,
                            })
                          }
                          disabled={saving || addUI.open}
                          autoComplete="off"
                          style={{ height: 38 }}
                        />

                        {showSug && (
                          <ul className="mi-cr-suggest">
                            {suggestions.map((d) => (
                              <li
                                key={d.id}
                                className="mi-cr-suggest__item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  updateRow(r.id, {
                                    id_detalle: String(d.id),
                                    detalleText: String(d.nombre || ""),
                                  });
                                }}
                              >
                                {d.nombre}
                              </li>
                            ))}
                          </ul>
                        )}

                        <button
                          type="button"
                          onClick={() => startAddDetalleForRow(r.id)}
                          disabled={saving || addUI.saving}
                          className="mi-cr-link"
                        >
                          + Agregar nuevo detalle
                        </button>
                      </div>

                      {/* Cantidad */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--qty">
                        <input
                          className="fl-input"
                          type="number"
                          min="0"
                          step="1"
                          value={r.cantidad}
                          onChange={(e) =>
                            updateRow(r.id, { cantidad: e.target.value === "" ? "" : Number(e.target.value) })
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
                          value={r.precio}
                          onChange={(e) =>
                            updateRow(r.id, { precio: e.target.value === "" ? "" : Number(e.target.value) })
                          }
                          disabled={saving}
                          style={{ height: 38, textAlign: "center" }}
                        />
                      </div>

                      {/* % IVA */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--iva">
                        <select
                          className="fl-input fl-select fl-select-iva--car fl-select-iva--compra"
                          value={String(r.ivaPct)}
                          onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
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

                      {/* IVA */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto">
                        <div style={{ textAlign: "center", paddingTop: 10 }}>{moneyARS(r.ivaMonto)}</div>
                      </div>

                      {/* Total */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--total">
                        <div style={{ textAlign: "center", paddingTop: 10 }}>{moneyARS(r.total)}</div>
                      </div>

                      {/* Acción */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--action">
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          disabled={saving}
                          title="Eliminar fila"
                          className="mi-cr-del"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mi-cr-table__foot">
                <button type="button" onClick={addRow} disabled={saving} className="mi-cr-addrow">
                  + Agregar fila
                </button>

                <div className="mi-cr-totals">
                  <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                    <span>Subtotal</span>
                    <b>{moneyARS(resumen.subtotal)}</b>
                  </div>

                  <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                    <span>IVA</span>
                    <b>{moneyARS(resumen.iva)}</b>
                  </div>

                  <div className="mi-cr-totalLine mi-cr-totalLine--total mi-cr-totalLine--big">
                    <span>TOTAL</span>
                    <b>{moneyARS(resumen.total)}</b>
                  </div>
                </div>
              </div>
            </section>

            {/* =========================
                Derecha: datos compra (SIN PAGO)
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
                  {/* ✅ Clasificación eliminada */}

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

        {/* Mini modal alta rápida (detalle) */}
        <AddCatalogMiniModal
          open={miniOpen}
          title={miniTitle}
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={closeAddMini}
          onSave={guardarNuevoDetalle}
        />
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}
