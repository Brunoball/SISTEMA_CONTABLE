// src/components/Mov_Subsection/modales/ModalNuevaCompra.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../../Movimientos/modales/ModalEditarMovimiento.css";
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
function isBlank(v) {
  return String(v ?? "").trim() === "";
}
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${Number(n).toFixed(2)}`;
  }
}
function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================
   ✅ IDs tolerantes
========================= */
function getDetalleId(d) {
  const cand = d?.id ?? d?.id_detalle ?? d?.idDetalle ?? d?.detalle_id ?? d?.iddetalle ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getProveedorId(p) {
  const cand =
    p?.id ?? p?.id_proveedor ?? p?.idProveedor ?? p?.proveedor_id ?? p?.idproveedor ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function getCuentaCorrienteId(cc) {
  const cand = cc?.id ?? cc?.id_cuenta_corriente ?? cc?.idCuentaCorriente ?? cc?.cuenta_corriente_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* =========================
   Período UI (MM-YYYY) <-> API (YYYY-MM)
========================= */
function isoToMMYYYY(iso) {
  const s = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}-${y}`;
}
function mmYYYYToYYYYMM(mmYYYY) {
  const s = String(mmYYYY ?? "").trim();
  if (/^\d{2}[-/]\d{4}$/.test(s)) {
    const [mm, yyyy] = s.split(/[-/]/);
    return `${yyyy}-${mm}`;
  }
  if (/^\d{6}$/.test(s)) {
    const mm = s.slice(0, 2);
    const yyyy = s.slice(2);
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return "";
}
function normalizePeriodoInput(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/* =========================
   Lists normalize
========================= */
const SAFE_LISTS = {
  proveedores: [],
  detalles: [],
  medios_pago: [],
  cuentas_corrientes: [],
};

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src.listas && typeof src.listas === "object" ? src.listas : src;
  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);

  const mediosPago =
    pick("medios_pago").length
      ? pick("medios_pago")
      : pick("mediosPago").length
      ? pick("mediosPago")
      : pick("medios");

  const cuentas =
    pick("cuentas_corrientes").length
      ? pick("cuentas_corrientes")
      : pick("cuentasCorrientes").length
      ? pick("cuentasCorrientes")
      : pick("cuentas");

  return {
    proveedores: pick("proveedores"),
    detalles: pick("detalles"),
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
    cuentas_corrientes: Array.isArray(cuentas) ? cuentas : [],
  };
}

/* =========================
   ✅ Auth + headers (SaaS: X-Session)
========================= */
function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";

  const token = localStorage.getItem("token") || "";

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { token, sessionKey, idUsuario };
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  try {
    const data = JSON.parse(text);
    if (!res.ok) {
      const msg = data?.mensaje || data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    if (e instanceof Error) throw e;
    const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
    throw new Error(`Respuesta inválida (no JSON). HTTP ${res.status}\n${preview}`);
  }
}

function buildAuthHeaders() {
  const { token, sessionKey } = getAuthInfo();
  const headers = { "Content-Type": "application/json" };
  if (sessionKey) headers["X-Session"] = sessionKey;
  if (!sessionKey && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiPostJson(url, payload) {
  const headers = buildAuthHeaders();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload ?? {}),
  });
  return await parseJsonOrThrow(res);
}

/* =========================
   Theme helper (body.dark OR data-theme="oscuro")
========================= */
function isTemaOscuro() {
  const byAttr = document.documentElement.getAttribute("data-theme") === "oscuro";
  const byBody = document.body?.classList?.contains("dark");
  return Boolean(byAttr || byBody);
}

/* =========================
   ✅ Cuenta Corriente: UNIFICAR (sin Débito/Crédito)
   - Si el backend trae "Cuenta Corriente Débito" / "Cuenta Corriente Crédito"
     mostramos UNA sola opción: "Cuenta Corriente"
   - Usamos el ID del primer ítem encontrado como id_cuenta_corriente real.
========================= */
function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function buildSingleCuentaCorrienteOption(arrRaw) {
  const arr = Array.isArray(arrRaw) ? arrRaw : [];
  if (!arr.length) return { list: [], pickedId: null };

  // elegimos la primera que sea "cuenta corriente" (sea débito/crédito o no)
  const hit =
    arr.find((x) => normalizeText(x?.nombre).includes("cuenta corriente")) ||
    arr[0];

  const pickedId = getCuentaCorrienteId(hit);
  if (!pickedId) return { list: [], pickedId: null };

  return {
    list: [{ id: pickedId, nombre: "Cuenta Corriente" }],
    pickedId,
  };
}

/* =========================
   Mini Modal: alta rápida (detalle / proveedor)
========================= */
function AddCatalogMiniModal({
  open,
  title,
  value,
  saving,
  onChange,
  onCancel,
  onSave,
  dark = false,
}) {
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
      <div
        className={["mi-mini__modal", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={onCancel}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={onSave}
              disabled={saving}
            >
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
   Validación filas (mensajes)
========================= */
function describeLineProblem(r, idx1based) {
  const detId = Number(r.id_detalle);
  const detTxt = String(r.detalleText || "").trim();

  const qtyBlank = isBlank(r.cantidad);
  const priceBlank = isBlank(r.precio);

  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);

  const touched =
    detTxt !== "" ||
    String(r.id_detalle || "").trim() !== "" ||
    !qtyBlank ||
    !priceBlank ||
    safeNumber(r.cantidad) !== 0 ||
    safeNumber(r.precio) !== 0;

  if (!touched) return null;

  const issues = [];
  if (!(Number.isFinite(detId) && detId > 0)) {
    issues.push(detTxt ? `el detalle "${detTxt}" no está seleccionado del listado` : "falta el detalle");
  }

  if (qtyBlank) issues.push("falta la cantidad");
  else if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser mayor a 0");

  if (priceBlank) issues.push("falta el precio");
  else if (!(Number.isFinite(price) && price > 0)) issues.push("el precio debe ser mayor a 0");

  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0 (revisá cantidad/precio)");

  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

/* =========================
   Modal
========================= */
export default function ModalNuevaCompra({ open, lists, onClose, onToast, onSaved }) {
  const API_BATCH = `${BASE_URL}/api.php?action=compras_crear_batch`;
  const API_CATALOGO = `${BASE_URL}/api.php?action=catalogo_crear`;

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const [dark, setDark] = useState(isTemaOscuro());
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());

    const obsHtml = new MutationObserver(update);
    obsHtml.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const obsBody = new MutationObserver(update);
    if (document.body) obsBody.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    update();
    return () => {
      obsHtml.disconnect();
      obsBody.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const [localLists, setLocalLists] = useState(() => ({ ...SAFE_LISTS, ...normalizeLists(lists) }));
  useEffect(() => setLocalLists({ ...SAFE_LISTS, ...normalizeLists(lists) }), [lists]);

  const mediosPagoList = useMemo(
    () => (Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );

  // ✅ AHORA: "Cuenta Corriente" solo (sin débito/crédito)
  const ccNormalized = useMemo(() => {
    return buildSingleCuentaCorrienteOption(localLists.cuentas_corrientes);
  }, [localLists.cuentas_corrientes]);

  const cuentasCorrientesList = useMemo(() => ccNormalized.list, [ccNormalized.list]);
  const cuentaCorrientePickedId = useMemo(() => ccNormalized.pickedId, [ccNormalized.pickedId]);

  const [fecha, setFecha] = useState(todayISO());
  const [periodoUI, setPeriodoUI] = useState(isoToMMYYYY(todayISO()));

  const [filters, setFilters] = useState({
    forma: NULL_OPTION,
    id_medio_pago: NULL_OPTION,
    id_cuenta_corriente: NULL_OPTION,
    id_proveedor: NULL_OPTION,
    proveedor_cuit: "",
  });

  const [accionContado, setAccionContado] = useState("pagar");

  // proveedor autocomplete
  const [provInput, setProvInput] = useState("");
  const [provFocus, setProvFocus] = useState(false);
  const closeBtnRef = useRef(null);

  // filas
  const [rows, setRows] = useState(() => [
    { id: uid(), id_detalle: NULL_OPTION, detalleText: "", cantidad: 1, precio: 0, ivaPct: 0 },
  ]);

  const [saving, setSaving] = useState(false);

  // ✅ mini modal genérico: detalle / proveedor
  const [addUI, setAddUI] = useState({
    open: false,
    kind: null, // "detalles" | "proveedores"
    rowId: null,
    text: "",
    saving: false,
  });

  const prevOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const f = todayISO();
      setFecha(f);
      setPeriodoUI(isoToMMYYYY(f));

      setFilters({
        forma: NULL_OPTION,
        id_medio_pago: NULL_OPTION,
        id_cuenta_corriente: NULL_OPTION,
        id_proveedor: NULL_OPTION,
        proveedor_cuit: "",
      });

      setAccionContado("pagar");
      setProvInput("");
      setProvFocus(false);

      setRows([{ id: uid(), id_detalle: NULL_OPTION, detalleText: "", cantidad: 1, precio: 0, ivaPct: 0 }]);
      setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
      setSaving(false);

      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open]);

  const updateFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  const onFechaChange = (iso) => {
    const v = String(iso || "").trim();
    setFecha(v);
    setPeriodoUI(isoToMMYYYY(v));
  };
  const onPeriodoChange = (raw) => setPeriodoUI(normalizePeriodoInput(raw));

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: uid(), id_detalle: NULL_OPTION, detalleText: "", cantidad: 1, precio: 0, ivaPct: 0 },
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

  /* ========= detalles sugerencias ========= */
  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );

  const suggestDetalles = useCallback(
    (txt) => {
      const q = String(txt || "").trim().toLowerCase();
      if (!q) return [];
      return detallesList
        .filter((d) => String(d?.nombre ?? "").toLowerCase().includes(q))
        .slice(0, 18);
    },
    [detallesList]
  );

  /* ========= mini modal: abrir/cerrar ========= */
  const startAddDetalleForRow = useCallback(
    (rowId) => {
      if (saving) return;
      setAddUI({ open: true, kind: "detalles", rowId, text: "", saving: false });
    },
    [saving]
  );

  const startAddProveedor = useCallback(() => {
    if (saving) return;
    setProvFocus(false);
    setAddUI({ open: true, kind: "proveedores", rowId: null, text: provInput || "", saving: false });
  }, [saving, provInput]);

  const closeAddMini = useCallback(() => {
    if (addUI.saving) return;
    setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
  }, [addUI.saving]);

  const guardarNuevoCatalogo = useCallback(async () => {
    const nombre = String(addUI.text || "").trim();
    if (!nombre) {
      showToast("advertencia", "Escribí un nombre antes de guardar.", 2600);
      return;
    }
    const kind = addUI.kind;
    if (!kind) return;

    setAddUI((p) => ({ ...p, saving: true }));
    showToast("cargando", `Creando ${kind === "detalles" ? "detalle" : "proveedor"}…`, 12000);

    try {
      const { idUsuario } = getAuthInfo();
      const data = await apiPostJson(API_CATALOGO, { catalogo: kind, nombre, idUsuario });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo crear.");

      const item = data?.item || {};
      const newId =
        kind === "detalles" ? (getDetalleId(item) ?? Number(item?.id)) : (getProveedorId(item) ?? Number(item?.id));
      const newNombre = String(item?.nombre ?? "").trim() || nombre;

      if (!Number.isFinite(Number(newId)) || Number(newId) <= 0) {
        throw new Error("El servidor no devolvió un ID válido.");
      }

      setLocalLists((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(prev[kind]) ? prev[kind].slice() : [];
        const already = arr.some((x) => {
          const xid = kind === "detalles" ? getDetalleId(x) : getProveedorId(x);
          return Number(xid) === Number(newId);
        });
        if (!already) arr.push({ id: Number(newId), nombre: newNombre });
        next[kind] = arr;
        return next;
      });

      if (kind === "detalles" && addUI.rowId) {
        updateRow(addUI.rowId, { id_detalle: String(newId), detalleText: newNombre });
      }

      if (kind === "proveedores") {
        updateFilter("id_proveedor", String(newId));
        setProvInput(newNombre);
      }

      setAddUI({ open: false, kind: null, rowId: null, text: "", saving: false });
      showToast("exito", `${kind === "detalles" ? "Detalle" : "Proveedor"} creado: "${newNombre}"`, 2600);
    } catch (e) {
      setAddUI((p) => ({ ...p, saving: false }));
      showToast("error", e?.message || "Error creando.", 4200);
    }
  }, [API_CATALOGO, addUI, showToast]);

  /* ========= proveedor autocomplete ========= */
  const proveedoresList = useMemo(
    () => (Array.isArray(localLists.proveedores) ? localLists.proveedores : []),
    [localLists.proveedores]
  );

  const filteredProveedores = useMemo(() => {
    const q = provInput.trim().toLowerCase();
    if (!provFocus || q.length < 1) return [];
    return proveedoresList
      .filter((p) => String(p?.nombre ?? "").toLowerCase().includes(q))
      .slice(0, 25);
  }, [proveedoresList, provInput, provFocus]);

  const handleProveedorInputChange = useCallback((e) => {
    const value = e.target.value;
    setProvInput(value);
    setFilters((p) => ({ ...p, id_proveedor: NULL_OPTION }));
  }, []);

  const handleSelectProveedor = useCallback((prov) => {
    const nombre = String(prov?.nombre ?? "").trim();
    const pid = getProveedorId(prov);

    setProvInput(nombre);
    setFilters((p) => ({ ...p, id_proveedor: pid != null ? String(pid) : NULL_OPTION }));
    setProvFocus(false);
  }, []);

  /* ========= cálculos ========= */
  const rowsCalc = useMemo(() => {
    return rows.map((r) => {
      const cantidad = Math.max(0, safeNumber(r.cantidad));
      const precio = Math.max(0, safeNumber(r.precio));
      const ivaPct = Math.max(0, safeNumber(r.ivaPct));
      const subtotal = cantidad * precio;
      const ivaMonto = subtotal * (ivaPct / 100);
      const total = subtotal + ivaMonto;
      return { ...r, subtotal, ivaMonto, total };
    });
  }, [rows]);

  const resumen = useMemo(() => {
    const subtotal = rowsCalc.reduce((acc, r) => acc + (r.subtotal || 0), 0);
    const iva = rowsCalc.reduce((acc, r) => acc + (r.ivaMonto || 0), 0);
    const total = rowsCalc.reduce((acc, r) => acc + (r.total || 0), 0);
    return { subtotal, iva, total };
  }, [rowsCalc]);

  const isContado = useMemo(() => String(filters.forma) === "CONTADO", [filters.forma]);
  const isCorriente = useMemo(() => String(filters.forma) === "CUENTA_CORRIENTE", [filters.forma]);

  // ✅ cuando elige "Cuenta Corriente", autoseleccionamos la única opción (Cuenta Corriente)
  useEffect(() => {
    if (!open) return;

    setFilters((p) => {
      const forma = String(p.forma || "");
      // limpiar lo que no aplica
      if (forma === "CONTADO" && p.id_cuenta_corriente !== NULL_OPTION) return { ...p, id_cuenta_corriente: NULL_OPTION };
      if (forma === "CUENTA_CORRIENTE" && p.id_medio_pago !== NULL_OPTION) return { ...p, id_medio_pago: NULL_OPTION };

      // auto-set de cuenta corriente única
      if (
        forma === "CUENTA_CORRIENTE" &&
        (String(p.id_cuenta_corriente) === NULL_OPTION || !String(p.id_cuenta_corriente || "").trim()) &&
        cuentaCorrientePickedId
      ) {
        return { ...p, id_cuenta_corriente: String(cuentaCorrientePickedId) };
      }

      return p;
    });

    if (isCorriente) setAccionContado("guardar");
  }, [open, isCorriente, cuentaCorrientePickedId]);

  const validate = useCallback(() => {
    const provId = Number(filters.id_proveedor);
    const provTxt = String(provInput || "").trim();
    if (!((Number.isFinite(provId) && provId > 0) || provTxt.length > 0)) {
      return { ok: false, msg: "Falta seleccionar un Proveedor (obligatorio)." };
    }

    if (!["CONTADO", "CUENTA_CORRIENTE"].includes(String(filters.forma))) {
      return { ok: false, msg: "Falta seleccionar el Tipo de compra (Contado / Cuenta Corriente)." };
    }

    if (isContado) {
      const mp = Number(filters.id_medio_pago);
      if (!Number.isFinite(mp) || mp <= 0)
        return { ok: false, msg: "Compra Contado: falta seleccionar el Medio de pago." };
    }

    if (isCorriente) {
      const cc = Number(filters.id_cuenta_corriente);
      if (!Number.isFinite(cc) || cc <= 0)
        return { ok: false, msg: "Cuenta Corriente: falta seleccionar la Cuenta Corriente." };
    }

    const periodoApi = mmYYYYToYYYYMM(periodoUI) || (fecha ? String(fecha).slice(0, 7) : "");
    if (!/^\d{4}-\d{2}$/.test(periodoApi))
      return { ok: false, msg: "Período inválido. Usá MM-YYYY (ej: 02-2026)." };

    const problems = [];
    rowsCalc.forEach((r, idx) => {
      const p = describeLineProblem(r, idx + 1);
      if (p) problems.push(p);
    });

    const usableLines = rowsCalc.filter((r) => {
      const det = Number(r.id_detalle);
      const total = Number(r.total || 0);
      return Number.isFinite(det) && det > 0 && total > 0;
    });

    if (!usableLines.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return { ok: false, msg: "Cargá al menos 1 fila válida (Detalle + Cantidad + Precio)." };
    }

    return { ok: true, warn: problems.length > 0, periodoApi };
  }, [filters, provInput, isContado, isCorriente, periodoUI, fecha, rowsCalc]);

  const submit = useCallback(async () => {
    if (saving) return;

    const { sessionKey } = getAuthInfo();
    if (!sessionKey) {
      showToast("error", "No hay sesión activa (Falta X-Session). Iniciá sesión de nuevo.", 5200);
      return;
    }

    if (addUI.open) {
      showToast("advertencia", "Terminá de crear (o cancelá) antes de guardar.", 3200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }

    setSaving(true);

    if (v.warn) showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    else showToast("cargando", "Guardando compra…", 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const periodoApi = v.periodoApi;
      const accionFinal = isCorriente ? "guardar" : accionContado;
      const esPagadaFinal = isCorriente ? false : accionFinal === "pagar";

      const payloads = rowsCalc
        .filter((r) => {
          const det = Number(r.id_detalle);
          const total = Number(r.total || 0);
          return Number.isFinite(det) && det > 0 && total > 0;
        })
        .map((r) => ({
          idUsuario,
          fecha,
          periodo: periodoApi,

          id_proveedor: Number(filters.id_proveedor) > 0 ? Number(filters.id_proveedor) : null,
          proveedor_nombre: String(provInput || "").trim() || null,
          proveedor_cuit: String(filters.proveedor_cuit || "").trim() || null,

          id_medio_pago: isContado ? Number(filters.id_medio_pago) : null,
          id_cuenta_corriente: isCorriente ? Number(filters.id_cuenta_corriente) : null,

          id_detalle: Number(r.id_detalle),
          cantidad: Math.round(Number(r.cantidad) * 100) / 100,
          precio: Math.round(Number(r.precio) * 100) / 100,
          iva_pct: Math.round(Number(r.ivaPct) * 100) / 100,
          subtotal: Math.round(Number(r.subtotal) * 100) / 100,
          iva_monto: Math.round(Number(r.ivaMonto) * 100) / 100,
          total: Math.round(Number(r.total) * 100) / 100,

          monto_total: Math.round(Number(r.total) * 100) / 100,

          accion_compra: accionFinal,
          es_pagada: esPagadaFinal,
        }));

      if (!payloads.length) {
        showToast("advertencia", "No hay filas válidas para guardar.", 4200);
        setSaving(false);
        return;
      }

      const data = await apiPostJson(API_BATCH, payloads);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar el batch de compras.");

      showToast("exito", `Listo: ${data?.creados ?? payloads.length} ítems guardados.`, 2800);
      onSaved?.(data);
      onClose?.();
    } catch (e) {
      showToast("error", e?.message || "Error guardando.", 4500);
      setSaving(false);
    }
  }, [
    saving,
    addUI.open,
    validate,
    showToast,
    isCorriente,
    accionContado,
    rowsCalc,
    fecha,
    filters,
    provInput,
    isContado,
    API_BATCH,
    onSaved,
    onClose,
  ]);

  if (!open) return null;

  const miniOpen = addUI.open;
  const miniTitle = addUI.kind === "proveedores" ? "Nuevo proveedor" : "Nuevo detalle";

  const modalJSX = (
    <div
      className={["mi-modal__overlay", "mi-modal__overlay--mov", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}
      onMouseDown={() => (!saving ? onClose?.() : null)}
    >
      <div
        className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header mi-modal__header--car">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Nueva Compra</h2>
            <p className="mi-modal__subtitle">Planilla a la izquierda + datos de compra a la derecha.</p>
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
            {/* Tabla */}
            <section className="mi-cr-table">
              <div className="mi-cr-table__head">
                <div>Detalle</div>
                <div className="mi-cr-center">Cantidad</div>
                <div className="mi-cr-center">Precio</div>
                <div className="mi-cr-center">% IVA</div>
                <div className="mi-cr-center">IVA</div>
                <div className="mi-cr-center">Total</div>
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
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--desc mi-cr-rel">
                        <input
                          className="fl-input"
                          placeholder="Escribí o seleccioná un detalle…"
                          value={r.detalleText}
                          onChange={(e) => updateRow(r.id, { detalleText: e.target.value, id_detalle: NULL_OPTION })}
                          disabled={saving || addUI.open}
                          autoComplete="off"
                        />

                        {showSug && (
                          <ul className="mi-cr-suggest">
                            {suggestions.map((d) => {
                              const did = getDetalleId(d);
                              return (
                                <li
                                  key={did ?? d?.nombre ?? uid()}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    updateRow(r.id, { id_detalle: String(did || ""), detalleText: String(d?.nombre || "") });
                                  }}
                                  className="mi-cr-suggest__item"
                                >
                                  {d.nombre}
                                </li>
                              );
                            })}
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
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--qty mi-cr-center">
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
                        />
                      </div>

                      {/* Precio */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--price mi-cr-center">
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
                        />
                      </div>

                      {/* IVA */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--iva mi-cr-center">
                        <select
                          className="fl-input fl-select fl-select-iva--car fl-select-iva--compra"
                          value={String(r.ivaPct)}
                          onChange={(e) => updateRow(r.id, { ivaPct: Number(e.target.value) })}
                          disabled={saving}
                        >
                          {IVA_OPTIONS.map((x) => (
                            <option key={x.value} value={x.value}>
                              {x.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* IVA monto */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--ivaMonto mi-cr-center">
                        <div className="mi-cr-money mi-cr-money--soft">{moneyARS(r.ivaMonto)}</div>
                      </div>

                      {/* Total */}
                      <div className="mi-cr-cell mi-cr-col mi-cr-col--total mi-cr-center">
                        <div className="mi-cr-money mi-cr-money--strong">{moneyARS(r.total)}</div>
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

            {/* Derecha */}
            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos de compra</div>

                <div className="mi-cr-filters__dates">
                  <div className="fl-field">
                    <input
                      className="fl-input"
                      type="date"
                      value={fecha}
                      onChange={(e) => onFechaChange(e.target.value)}
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
                      onChange={(e) => onPeriodoChange(e.target.value)}
                      disabled={saving}
                    />
                    <label className="fl-label">Período</label>
                  </div>
                </div>
              </div>

              <div className="mi-cr-filters__body">
                {/* Proveedor */}
                <div className="fl-field mi-cr-rel">
                  <input
                    className="fl-input"
                    placeholder=" "
                    value={provInput}
                    onChange={handleProveedorInputChange}
                    onFocus={() => setProvFocus(true)}
                    onBlur={() => setTimeout(() => setProvFocus(false), 120)}
                    disabled={saving || addUI.open}
                    autoComplete="off"
                  />
                  <label className="fl-label">Proveedor *</label>

                  {provFocus && filteredProveedores.length > 0 && (
                    <ul className="mi-cr-suggest">
                      {filteredProveedores.map((p) => {
                        const pid = getProveedorId(p);
                        return (
                          <li
                            key={pid ?? p?.nombre ?? uid()}
                            className="mi-cr-suggest__item"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectProveedor(p);
                            }}
                          >
                            {p.nombre}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <button
                    type="button"
                    className="mi-cr-link"
                    onClick={startAddProveedor}
                    disabled={saving || addUI.saving}
                  >
                    + Agregar nuevo proveedor
                  </button>
                </div>

                {/* CUIT */}
                <div className="fl-field">
                  <input
                    className="fl-input"
                    placeholder=" "
                    value={filters.proveedor_cuit}
                    onChange={(e) => updateFilter("proveedor_cuit", e.target.value)}
                    disabled={saving}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                  <label className="fl-label">CUIT Proveedor (opcional)</label>
                </div>

                {/* Forma */}
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(filters.forma)}
                    onChange={(e) => updateFilter("forma", e.target.value)}
                    disabled={saving}
                  >
                    <option value={NULL_OPTION}>Tipo de compra *</option>
                    <option value="CONTADO">CONTADO</option>
                    <option value="CUENTA_CORRIENTE">CUENTA CORRIENTE</option>
                  </select>
                  <label className="fl-label">Tipo de compra</label>
                </div>

                {/* Contado */}
                {isContado && (
                  <>
                    <div className="fl-field">
                      <select
                        className="fl-input fl-select"
                        value={String(filters.id_medio_pago)}
                        onChange={(e) => updateFilter("id_medio_pago", e.target.value)}
                        disabled={saving}
                      >
                        <option value={NULL_OPTION}>Medio de pago *</option>
                        {mediosPagoList.map((x) => (
                          <option key={x.id ?? x.id_medio_pago} value={String(x.id ?? x.id_medio_pago)}>
                            {x.nombre}
                          </option>
                        ))}
                      </select>
                      <label className="fl-label">Medio de pago</label>
                    </div>

                    <div className="mi-card mi-card--full">
                      <div className="mi-card__title">Pago (Contado)</div>

                      <div className="mi-card__actionsRow">
                        <button
                          type="button"
                          className={`mit-btn ${accionContado === "guardar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                          onClick={() => setAccionContado("guardar")}
                          disabled={saving}
                        >
                          Guardar
                        </button>

                        <button
                          type="button"
                          className={`mit-btn ${accionContado === "pagar" ? "mit-btn--solid" : "mit-btn--ghost"}`}
                          onClick={() => setAccionContado("pagar")}
                          disabled={saving}
                        >
                          Pagar
                        </button>
                      </div>

                      <div className="mi-card__hint">
                        {accionContado === "guardar" ? (
                          <>
                            * <b>Guardar</b>: queda <b>pendiente</b>.
                          </>
                        ) : (
                          <>
                            * <b>Pagar</b>: queda <b>pagada</b>.
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}


                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid mit-btn--block"
                  >
                    {saving ? "Guardando..." : "Guardar compra"}
                  </button>

                  <button
                    type="button"
                    onClick={() => (!saving ? onClose?.() : null)}
                    disabled={saving}
                    className="mit-btn mit-btn--ghost mit-btn--block"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Mini modal */}
        <AddCatalogMiniModal
          open={miniOpen}
          title={miniTitle}
          value={addUI.text}
          saving={addUI.saving}
          onChange={(txt) => setAddUI((p) => ({ ...p, text: txt }))}
          onCancel={closeAddMini}
          onSave={guardarNuevoCatalogo}
          dark={dark}
        />
      </div>
    </div>
  );

  return createPortal(modalJSX, document.body);
}
