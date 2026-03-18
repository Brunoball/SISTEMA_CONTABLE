import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faFileInvoiceDollar } from "@fortawesome/free-solid-svg-icons";
import GlobalAutocomplete from "../../../Global/GlobalAutocomplete/GlobalAutocomplete.jsx";
import BASE_URL from "../../../../config/config";

const NULL_OPTION = "";

const IVA_OPTIONS = [
  { label: "0 %", value: 0 },
  { label: "10,5 %", value: 10.5 },
  { label: "21 %", value: 21 },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function moneyARS(v) {
  try {
    return Number(v || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  } catch {
    return `$${Number(v || 0).toFixed(2)}`;
  }
}

function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `$ ${n.toFixed(2)}`;
  }
}

function parseMoneyInputARS(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\$/g, "").replace(/\s+/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}

function uid() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

function getMovimientoId(r) {
  const cand =
    r?.id_movimiento ??
    r?.idMovimiento ??
    r?.id_mov ??
    r?.id ??
    r?.id_ingreso ??
    r?.idIngreso ??
    r?.ingreso_id ??
    r?.movimiento_id ??
    r?.id_movimiento_fk ??
    null;

  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getSavedMovimientoIdFromResponse(data, initialData = null) {
  const candidates = [
    data?.id_movimiento,
    data?.movimiento_id,
    data?.id,
    data?.ingreso?.id_movimiento,
    data?.ingreso?.id,
    data?.otro_ingreso?.id_movimiento,
    data?.otro_ingreso?.id,
    initialData?.id_movimiento,
    initialData?.id,
  ];

  for (const cand of candidates) {
    const n = Number(cand);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function getMedioPagoId(c) {
  const cand = c?.id ?? c?.id_medio_pago ?? c?.idMedioPago ?? c?.medio_pago_id ?? null;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getDetalleId(d) {
  const cand =
    d?.id ??
    d?.id_detalle ??
    d?.idDetalle ??
    d?.detalle_id ??
    d?.iddetalle ??
    d?.id_categoria_ingreso ??
    d?.idCategoriaIngreso ??
    d?.categoria_ingreso_id ??
    null;

  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionLabel(x) {
  return safeStr(x?.nombre ?? x?.categoria ?? x?.descripcion ?? x?.detalle ?? "");
}

function normalizeLists(lists) {
  const src = lists && typeof lists === "object" ? lists : {};
  const l = src?.listas && typeof src.listas === "object" ? src.listas : src;

  const pick = (k) => (Array.isArray(l?.[k]) ? l[k] : []);

  const mediosPago = pick("medios_pago").length
    ? pick("medios_pago")
    : pick("mediosPago").length
    ? pick("mediosPago")
    : pick("medios").length
    ? pick("medios")
    : [];

  const detalles = pick("detalles").length
    ? pick("detalles")
    : pick("categorias_ingreso").length
    ? pick("categorias_ingreso")
    : pick("categoriasIngreso").length
    ? pick("categoriasIngreso")
    : pick("categorias").length
    ? pick("categorias")
    : [];

  return {
    medios_pago: Array.isArray(mediosPago) ? mediosPago : [],
    detalles: Array.isArray(detalles) ? detalles : [],
  };
}

function buildEmptyRow() {
  return {
    id: uid(),
    id_detalle: NULL_OPTION,
    detalle: "",
    cantidad: 1,
    precio: 0,
    precioDraft: "",
    precioFocused: false,
    ivaPct: 0,
  };
}

function buildRowFromData(r) {
  const cantidad = Math.max(1, safeNumber(r?.cantidad || 1));
  const precio = safeNumber(r?.precio ?? r?.importe ?? r?.monto ?? 0);
  const ivaPct = safeNumber(r?.iva_pct ?? r?.ivaPct ?? 0);

  return {
    id: uid(),
    id_detalle: String(getDetalleId(r) ?? ""),
    detalle: safeStr(r?.detalle ?? r?.descripcion ?? r?.concepto),
    cantidad,
    precio,
    precioDraft: "",
    precioFocused: false,
    ivaPct,
  };
}

function buildRowsFromInitial(data) {
  const items =
    Array.isArray(data?.items) && data.items.length
      ? data.items
      : Array.isArray(data?.detalles) && data.detalles.length
      ? data.detalles
      : null;

  if (items?.length) {
    return items.map((x) => ({
      id: uid(),
      id_detalle: String(getDetalleId(x) ?? ""),
      detalle: safeStr(x?.detalle ?? x?.descripcion ?? x?.concepto),
      cantidad: Math.max(1, safeNumber(x?.cantidad || 1)),
      precio: safeNumber(x?.precio ?? x?.importe ?? x?.monto ?? 0),
      precioDraft: "",
      precioFocused: false,
      ivaPct: safeNumber(x?.iva_pct ?? x?.ivaPct ?? 0),
    }));
  }

  return [buildRowFromData(data)];
}

function describeLineProblem(r, idx1based) {
  const detalle = safeStr(r.detalle);
  const qty = safeNumber(r.cantidad);
  const price = safeNumber(r.precio);
  const total = safeNumber(r.total);
  const touched =
    detalle !== "" ||
    String(r.id_detalle || "").trim() !== "" ||
    qty !== 0 ||
    price !== 0;

  if (!touched) return null;

  const issues = [];
  if (!detalle) issues.push("falta la descripción");
  if (!(Number.isFinite(qty) && qty > 0)) issues.push("la cantidad debe ser > 0");
  if (!(Number.isFinite(price) && price > 0)) issues.push("el importe debe ser > 0");
  if (!(Number.isFinite(total) && total > 0)) issues.push("el total queda en 0");

  if (!issues.length) return null;
  return `Fila ${idx1based}: ${issues.join(", ")}.`;
}

function getAuthInfo() {
  const sessionKey =
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x_session") ||
    localStorage.getItem("X-Session") ||
    "";

  const token = localStorage.getItem("token") || "";

  return { sessionKey, token };
}

function buildAuthHeaders(isJson = true) {
  const { sessionKey, token } = getAuthInfo();
  const headers = {};
  if (isJson) headers["Content-Type"] = "application/json";
  if (sessionKey) headers["X-Session"] = sessionKey;
  else if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 500 ? `${text.slice(0, 500)}...` : text;
    throw new Error(`Respuesta inválida del servidor. ${preview}`);
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || data?.error || `HTTP ${res.status}`);
  }

  return data;
}

async function apiPostForm(url, formData) {
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(false),
    body: formData,
  });
  return await parseJsonOrThrow(res);
}

export default function ModalNuevoIngreso({
  open,
  mode = "create",
  initialData = null,
  lists,
  onClose,
  onToast,
  onSubmit,
  onSaved,
}) {
  const API_UPLOAD = `${BASE_URL}/api.php?action=otros_ingresos_comprobantes_vincular_movimiento_upload`;

  const showToast = useCallback(
    (tipo, mensaje, dur = 2800) => onToast?.(tipo, mensaje, dur),
    [onToast]
  );

  const [dark, setDark] = useState(isTemaOscuro);
  const [saving, setSaving] = useState(false);

  const [fecha, setFecha] = useState(todayISO);
  const [filters, setFilters] = useState({
    id_medio_pago: "",
  });

  const [rows, setRows] = useState(() => [buildEmptyRow()]);
  const [archivoAdjunto, setArchivoAdjunto] = useState(null);

  const rowsContainerRef = useRef(null);
  const [hasScroll, setHasScroll] = useState(false);
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);

  const localLists = useMemo(() => normalizeLists(lists), [lists]);
  const mediosPagoList = useMemo(
    () => (Array.isArray(localLists.medios_pago) ? localLists.medios_pago : []),
    [localLists.medios_pago]
  );
  const detallesList = useMemo(
    () => (Array.isArray(localLists.detalles) ? localLists.detalles : []),
    [localLists.detalles]
  );

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const o2 = new MutationObserver(update);
    if (document.body) {
      o2.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape" && !saving) onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose, saving]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    if (!wasOpen && open) {
      const isEdit = mode === "edit";
      const movId = getMovimientoId(initialData);

      setFecha(safeStr(initialData?.fecha).slice(0, 10) || todayISO());

      setFilters({
        id_medio_pago: String(initialData?.id_medio_pago ?? initialData?.medio_pago_id ?? ""),
      });

      setRows(
        isEdit && (movId || initialData)
          ? buildRowsFromInitial(initialData)
          : [buildEmptyRow()]
      );

      setArchivoAdjunto(null);
      setSaving(false);
      setTimeout(() => closeBtnRef.current?.focus(), 0);
    }
  }, [open, mode, initialData]);

  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;

    const checkScroll = () => {
      const scroll = el.scrollHeight > el.clientHeight + 1;
      setHasScroll(scroll);
    };

    checkScroll();
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);
    window.addEventListener("resize", checkScroll);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", checkScroll);
    };
  }, [open, rows]);

  const addRow = useCallback(() => {
    setRows((p) => [...p, buildEmptyRow()]);
  }, []);

  const removeRow = useCallback((id) => {
    setRows((p) => {
      const next = p.filter((r) => r.id !== id);
      return next.length ? next : [buildEmptyRow()];
    });
  }, []);

  const updateRow = useCallback((id, patch) => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const selectedMedioPago = useMemo(() => {
    const id = Number(filters.id_medio_pago);
    if (!Number.isFinite(id) || id <= 0) return null;
    return mediosPagoList.find((x) => Number(getMedioPagoId(x)) === id) || null;
  }, [filters.id_medio_pago, mediosPagoList]);

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
    return {
      subtotal: rowsCalc.reduce((a, r) => a + safeNumber(r.subtotal), 0),
      iva: rowsCalc.reduce((a, r) => a + safeNumber(r.ivaMonto), 0),
      total: rowsCalc.reduce((a, r) => a + safeNumber(r.total), 0),
    };
  }, [rowsCalc]);

  const validate = useCallback(() => {
    const mp = Number(filters.id_medio_pago);
    if (!Number.isFinite(mp) || mp <= 0) {
      return { ok: false, msg: "Falta seleccionar el medio de pago." };
    }

    if (!safeStr(fecha)) {
      return { ok: false, msg: "Falta la fecha." };
    }

    const problems = [];
    rowsCalc.forEach((r, i) => {
      const p = describeLineProblem(r, i + 1);
      if (p) problems.push(p);
    });

    const usable = rowsCalc.filter(
      (r) =>
        safeStr(r.detalle) !== "" &&
        Number(r.id_detalle || 0) > 0 &&
        safeNumber(r.cantidad) > 0 &&
        safeNumber(r.precio) > 0 &&
        safeNumber(r.total) > 0
    );

    if (!usable.length) {
      if (problems.length) {
        const msg = problems.slice(0, 2).join(" ");
        const extra = problems.length > 2 ? ` (y ${problems.length - 2} más)` : "";
        return { ok: false, msg: `No hay filas válidas. ${msg}${extra}` };
      }
      return {
        ok: false,
        msg: "Cargá al menos 1 fila válida (Descripción + Cantidad + Importe).",
      };
    }

    return { ok: true, warn: problems.length > 0, usable };
  }, [filters, fecha, rowsCalc]);

  const buildPayload = useCallback(() => {
    const usableRows = rowsCalc.filter(
      (r) =>
        safeStr(r.detalle) !== "" &&
        Number(r.id_detalle || 0) > 0 &&
        safeNumber(r.cantidad) > 0 &&
        safeNumber(r.precio) > 0 &&
        safeNumber(r.total) > 0
    );

    const detalleFinal =
      usableRows.length === 1
        ? safeStr(usableRows[0].detalle)
        : usableRows.map((x) => safeStr(x.detalle)).filter(Boolean).join(" | ");

    const subtotalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.subtotal), 0);
    const ivaFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.ivaMonto), 0);
    const totalFinal = usableRows.reduce((acc, x) => acc + safeNumber(x.total), 0);

    const movId = getMovimientoId(initialData);

    return {
      ...(movId ? { id_movimiento: movId, id_ingreso: movId, id: movId } : {}),
      fecha: safeStr(fecha).slice(0, 10),
      id_medio_pago: Number(filters.id_medio_pago),
      medio_pago_nombre: optionLabel(selectedMedioPago),
      detalle: detalleFinal,
      descripcion: detalleFinal,
      concepto: detalleFinal,
      cantidad: usableRows.length === 1 ? safeNumber(usableRows[0].cantidad) : 1,
      precio: usableRows.length === 1 ? safeNumber(usableRows[0].precio) : safeNumber(subtotalFinal),
      subtotal: safeNumber(subtotalFinal),
      iva_monto: safeNumber(ivaFinal),
      monto_total: safeNumber(totalFinal),
      total: safeNumber(totalFinal),
      total_general: safeNumber(totalFinal),
      items: usableRows.map((x, idx) => ({
        orden: idx + 1,
        id_detalle: Number(x.id_detalle || 0) || null,
        detalle: safeStr(x.detalle),
        descripcion: safeStr(x.detalle),
        concepto: safeStr(x.detalle),
        cantidad: safeNumber(x.cantidad),
        precio: safeNumber(x.precio),
        iva_pct: safeNumber(x.ivaPct),
        subtotal: safeNumber(x.subtotal),
        iva_monto: safeNumber(x.ivaMonto),
        total: safeNumber(x.total),
      })),
    };
  }, [rowsCalc, initialData, fecha, filters, selectedMedioPago]);

  const subirArchivo = useCallback(
    async (idMovimiento, archivo) => {
      if (!archivo || !idMovimiento) return null;

      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("tipo", "OTRO_INGRESO");
      fd.append("id_movimiento", String(idMovimiento));
      fd.append("force_replace", "1");

      return await apiPostForm(API_UPLOAD, fd);
    },
    [API_UPLOAD]
  );

  const submit = useCallback(async () => {
    if (saving) return;

    if (typeof onSubmit !== "function") {
      showToast("error", "Falta la función de guardado del modal.", 4200);
      return;
    }

    const v = validate();
    if (!v.ok) {
      showToast("advertencia", v.msg || "Faltan datos.", 4200);
      return;
    }

    setSaving(true);

    if (v.warn) {
      showToast("advertencia", "Hay filas incompletas: se guardarán solo las válidas.", 3600);
    }

    try {
      const payload = buildPayload();
      const data = await onSubmit(payload, mode === "edit");

      const idMovimientoFinal = getSavedMovimientoIdFromResponse(data, initialData);

      if (!idMovimientoFinal) {
        throw new Error(
          "El backend guardó el movimiento pero no devolvió un id_movimiento válido."
        );
      }

      let warningArchivo = "";

      if (archivoAdjunto) {
        try {
          const respArchivo = await subirArchivo(idMovimientoFinal, archivoAdjunto);
          if (!respArchivo?.exito) {
            warningArchivo = respArchivo?.mensaje || "No se pudo vincular el archivo.";
          }
        } catch (e) {
          warningArchivo = e?.message || "No se pudo vincular el archivo.";
        }
      }

      if (warningArchivo) {
        showToast(
          "advertencia",
          `Ingreso guardado, pero el archivo no se pudo vincular: ${warningArchivo}`,
          7000
        );
      }

      await onSaved?.({
        ...(data || {}),
        id_movimiento: idMovimientoFinal,
      });
    } catch (e) {
      showToast("error", e?.message || "No se pudo guardar el ingreso.", 4500);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    onSubmit,
    validate,
    buildPayload,
    mode,
    onSaved,
    showToast,
    initialData,
    archivoAdjunto,
    subirArchivo,
  ]);

  if (!open) return null;

  const btnLabel = saving
    ? "Procesando..."
    : mode === "edit"
    ? "Guardar cambios"
    : "Guardar ingreso";

  return createPortal(
    <div
      className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        className={["mi-modal__container", "mi-modal__container--mov", dark ? "mi-modal--dark" : ""]
          .join(" ")
          .trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faPlus} />
          </div>

          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">
              {mode === "edit" ? "Editar Ingreso" : "Nuevo Ingreso"}
            </h2>
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

        <div className="mi-modal__content">
          <div className="mi-cr-grid">
            <section className="mi-cr-table">
              <div
                className="mi-cr-table__head"
                style={{ gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr" }}
              >
                <div style={{ paddingLeft: 10 }}>Descripción</div>
                <div>Cant.</div>
                <div className="right">Importe</div>
                <div>IVA %</div>
                <div className="right">IVA $</div>
                <div className="right">Total</div>
                <div />
              </div>

              <div
                ref={rowsContainerRef}
                className={`mi-cr-table__rows ${hasScroll ? "has-scroll" : ""}`}
              >
                {rowsCalc.map((r) => (
                  <div
                    key={r.id}
                    className="mi-cr-row"
                    style={{ gridTemplateColumns: "2.4fr 0.8fr 1.1fr 0.9fr 1fr 1.1fr 0.45fr" }}
                  >
                    <div className="mi-cr-cell mi-cr-cell--detalle">
                      <GlobalAutocomplete
                        value={r.detalle}
                        onChange={(val) =>
                          updateRow(r.id, {
                            detalle: val,
                            id_detalle: NULL_OPTION,
                          })
                        }
                        onSelect={(item) => {
                          updateRow(r.id, {
                            id_detalle: String(getDetalleId(item) ?? ""),
                            detalle: optionLabel(item),
                          });
                        }}
                        options={detallesList}
                        getOptionLabel={(d) => optionLabel(d)}
                        getOptionValue={(d) => String(getDetalleId(d) ?? optionLabel(d))}
                        placeholder="Escribí o buscá una descripción…"
                        disabled={saving}
                        showAllOnFocus={false}
                        maxItems={18}
                        inputClassName="nv-cell-input"
                      />
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center">
                      <input
                        className="nv-cell-input nv-cell-input--center"
                        type="number"
                        min="0"
                        step="1"
                        value={r.cantidad}
                        onChange={(e) =>
                          updateRow(r.id, {
                            cantidad: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        disabled={saving}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center">
                      <input
                        className="nv-cell-input nv-cell-input--right"
                        type="text"
                        inputMode="decimal"
                        value={r.precioFocused ? r.precioDraft ?? "" : formatMoneyInputARS(r.precio)}
                        onFocus={(e) => {
                          updateRow(r.id, {
                            precioFocused: true,
                            precioDraft: formatEditableMoney(r.precio),
                          });
                          setTimeout(() => e.target.select(), 0);
                        }}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const cleaned = raw.replace(/[^\d,.\-]/g, "");
                          updateRow(r.id, {
                            precioDraft: cleaned,
                            precio: parseMoneyInputARS(cleaned),
                          });
                        }}
                        onBlur={() => {
                          const parsed = parseMoneyInputARS(r.precioDraft);
                          updateRow(r.id, {
                            precio: parsed,
                            precioDraft: "",
                            precioFocused: false,
                          });
                        }}
                        placeholder="$ 0,00"
                        disabled={saving}
                        style={{ width: "100%", padding: "0" }}
                      />
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center">
                      <select
                        className="nv-cell-input nv-cell-input--center nv-cell-input--select"
                        value={String(r.ivaPct)}
                        onChange={(e) =>
                          updateRow(r.id, { ivaPct: Number(e.target.value) })
                        }
                        disabled={saving}
                        style={{ width: "100%" }}
                      >
                        {IVA_OPTIONS.map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--soft">
                      {moneyARS(r.ivaMonto)}
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--right mi-cr-cell--mono mi-cr-cell--total-val">
                      {moneyARS(r.total)}
                    </div>

                    <div className="mi-cr-cell mi-cr-cell--center" id="delete_cell">
                      <button
                        type="button"
                        className="mi-cr-del"
                        onClick={() => removeRow(r.id)}
                        disabled={saving}
                        title="Eliminar fila"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mi-cr-table__foot">
                <div className="mi-cr-foot-actions">
                  <button type="button" className="nv-foot-btn" onClick={addRow} disabled={saving}>
                    <span className="nv-foot-btn__icon">+</span>
                    Agregar fila
                  </button>
                </div>

                <div className="mi-cr-totals">
                  <div className="mi-cr-totalLine mi-cr-totalLine--sub">
                    <span>Subtotal</span>
                    <b>{moneyARS(resumen.subtotal)}</b>
                  </div>

                  <div className="mi-cr-totalLine mi-cr-totalLine--iva">
                    <span>IVA</span>
                    <b>{moneyARS(resumen.iva)}</b>
                  </div>

                  <div className="mi-cr-totalLine mi-cr-totalLine--total">
                    <span>Total</span>
                    <b>{moneyARS(resumen.total)}</b>
                  </div>
                </div>
              </div>
            </section>

            <aside className="mi-cr-filters">
              <div className="mi-cr-filters__top">
                <div className="mi-cr-filters__title">Datos del ingreso</div>

                <div className="mi-cr-filters__dates">
                  <div
                    className="fl-field fl-col-full mi-date-field"
                    onClick={() => {
                      if (saving) return;
                      const el = document.getElementById("ni-fecha-input");
                      if (!el) return;
                      if (typeof el.showPicker === "function") {
                        el.showPicker();
                      } else {
                        el.focus();
                        el.click();
                      }
                    }}
                  >
                    <input
                      id="ni-fecha-input"
                      className="fl-input"
                      type="date"
                      placeholder=" "
                      value={fecha}
                      onChange={(e) => setFecha(String(e.target.value || "").trim())}
                      disabled={saving}
                    />
                    <label className="fl-label">Fecha</label>
                  </div>
                </div>
              </div>

              <div className="mi-cr-filters__body">
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={String(filters.id_medio_pago)}
                    onChange={(e) =>
                      setFilters((p) => ({ ...p, id_medio_pago: e.target.value }))
                    }
                    disabled={saving}
                  >
                    <option value="">Seleccionar medio</option>
                    {mediosPagoList.map((x) => (
                      <option
                        key={getMedioPagoId(x) ?? optionLabel(x)}
                        value={String(getMedioPagoId(x) ?? "")}
                      >
                        {optionLabel(x)}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Medio de pago *</label>
                </div>

                <div className="mi-uploadCard">
                  <div className="mi-uploadCard__head">
                    <div>
                      <div className="mi-uploadCard__title">Archivo adjunto</div>
                      <div className="mi-uploadCard__sub">
                        PDF, imagen u otro comprobante
                      </div>
                    </div>
                  </div>

                  <div className="mi-uploadCard__body">
                    <div className="mi-uploadBar">
                      <label className="mi-uploadBar__pick">
                        <input
                          type="file"
                          className="mi-uploadBar__input"
                          onChange={(e) => setArchivoAdjunto(e.target.files?.[0] || null)}
                          disabled={saving}
                        />
                        <span className="mi-uploadBar__btn mi-uploadBar__btn--primary">
                          {archivoAdjunto ? "Cambiar" : "Seleccionar"}
                        </span>
                      </label>

                      <button
                        type="button"
                        className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                        onClick={() => setArchivoAdjunto(null)}
                        disabled={saving || !archivoAdjunto}
                      >
                        Quitar
                      </button>
                    </div>

                    <div
                      className={`mi-uploadFile ${
                        archivoAdjunto ? "is-filled" : "is-empty"
                      }`}
                    >
                      {archivoAdjunto ? (
                        <>
                          <div className="mi-uploadFile__icon">
                            <FontAwesomeIcon icon={faFileInvoiceDollar} />
                          </div>

                          <div className="mi-uploadFile__meta">
                            <div className="mi-uploadFile__name" title={archivoAdjunto.name}>
                              {archivoAdjunto.name}
                            </div>
                            <div className="mi-uploadFile__size">
                              {Math.max(1, Math.round((archivoAdjunto.size || 0) / 1024))} KB
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="mi-uploadFile__empty">
                          No hay archivo seleccionado
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mi-cr-filters__actions">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={saving}
                    className="mit-btn mit-btn--solid mit-btn--block"
                  >
                    {btnLabel}
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
      </div>
    </div>,
    document.body
  );
}