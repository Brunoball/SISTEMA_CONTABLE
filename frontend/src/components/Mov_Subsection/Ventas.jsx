// src/components/Movimientos/Ventas.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "../Movimientos/movimientos.css"; // reutiliza la estética de Movimientos

import Toast from "../Global/Toast.jsx";

import ModalNuevaVenta from "./modales/ModalNuevaVenta";
import ModalEditarVenta from "./modales/ModalEditarVenta";
import ModalEliminarMovimientos from "../Movimientos/modales/ModalEliminarMovimientos";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faMagnifyingGlass,
  faPlus,
  faFileExcel,
  faPenToSquare,
  faTrashCan,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";

/* =========================
   Helpers
========================= */
function moneyARS(v) {
  const n = Number(v || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
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
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const dd = String(Number(m2[1])).padStart(2, "0");
    const mm = String(Number(m2[2])).padStart(2, "0");
    const yyyy = m2[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

/* =========================
   Período helpers (UI MM-YYYY) <-> (API YYYY-MM)
========================= */
function periodoToMMYYYY(input) {
  const s = String(input ?? "").trim();
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

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{4}\/\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("/");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{1,2}\/\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("/");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }
  if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      const yyyy = s.slice(0, 4);
      const mm = String(Number(s.slice(4))).padStart(2, "0");
      return `${yyyy}-${mm}`;
    } else {
      const mm = String(Number(s.slice(0, 2))).padStart(2, "0");
      const yyyy = s.slice(2);
      return `${yyyy}-${mm}`;
    }
  }
  return s;
}

/* =========================
   Auth helpers
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

/* =========================
   Listas (mismo contrato que Movimientos)
========================= */
const emptyLists = {
  periodos: [],
  clientes: [],
  medios_pago: [],
  tipos_venta: [],
  clasificaciones: [],
  cuentas_corrientes: [],
  detalles: [],
  proveedores: [],
  tipos_movimiento: [],
};

function normalizeLists(raw) {
  const src = raw?.listas && typeof raw.listas === "object" ? raw.listas : raw;
  const getArr = (k) => (Array.isArray(src?.[k]) ? src[k] : []);

  const periodosUI = (getArr("periodos") || []).map(periodoToMMYYYY);

  return {
    periodos: periodosUI,
    clientes: getArr("clientes"),
    medios_pago: getArr("medios_pago"),
    tipos_venta: getArr("tipos_venta"),
    clasificaciones: getArr("clasificaciones"),
    cuentas_corrientes: getArr("cuentas_corrientes"),
    detalles: getArr("detalles"),
    proveedores: getArr("proveedores"),
    tipos_movimiento: getArr("tipos_movimiento"),
  };
}

/* =========================
   ✅ FILTRO VENTAS STRICT
   Regla: solo mostrar
   1) Tipo_movimiento = SALIDA
   2) Cliente obligatorio (id_cliente > 0 o texto cliente)
========================= */
function isSalidaRow(r) {
  // soporta: "SALIDA" o "Salida" o "salida"
  const tm = normalizeSearchText(r?.tipo_movimiento);
  return tm.includes("salida");
}

function hasCliente(r) {
  const idCli = Number(
    r?.id_cliente ?? r?.cliente_id ?? r?.idCliente ?? r?.id_cliente_fk ?? 0
  );
  if (Number.isFinite(idCli) && idCli > 0) return true;

  // fallback por si solo viene texto
  const cliTxt = String(r?.cliente ?? "").trim();
  return cliTxt.length > 0;
}

function isVentaRow(r) {
  return isSalidaRow(r) && hasCliente(r);
}

/* =========================
   Full-text match
========================= */
function rowMatchesQuery(row, query) {
  const qq = normalizeSearchText(query);
  if (!qq) return true;

  const montoNum = Number(row?.monto_total || row?.total || 0);
  const parts = [];

  if (row && typeof row === "object") {
    for (const k of Object.keys(row)) {
      const val = row[k];
      if (val && typeof val === "object") continue;
      parts.push(String(val ?? ""));
    }
  }

  parts.push(formatFechaDMY(row?.fecha));
  parts.push(periodoToMMYYYY(row?.periodo));
  parts.push(String(montoNum), String(Math.trunc(montoNum)), moneyARS(montoNum));

  const hay = normalizeSearchText(parts.join(" | "));
  return hay.includes(qq);
}

/* =========================
   Excel
========================= */
function slugifySheetName(name) {
  const s = String(name || "Ventas")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Ventas").slice(0, 31);
}

export default function Ventas() {
  const API = `${BASE_URL}/api.php`;

  const [lists, setLists] = useState(emptyLists);
  const [rows, setRows] = useState([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  // filtros
  const [fPeriodo, setFPeriodo] = useState(""); // UI MM-YYYY
  const [q, setQ] = useState("");

  // modales
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // cache por "periodoAPI|q"
  const cacheRef = useRef(new Map());

  /* =========================
     API helpers
  ========================= */
  const buildHeaders = useCallback(() => {
    const { token } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    try {
      return JSON.parse(text);
    } catch {
      const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
      throw new Error(`Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`);
    }
  }, []);

  const apiGet = useCallback(
    async (url) => {
      const headers = {};
      const { token } = getAuthInfo();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { method: "GET", headers });
      return await parseJsonOrThrow(res);
    },
    [parseJsonOrThrow]
  );

  const apiPostJson = useCallback(
    async (url, payload) => {
      const res = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload ?? {}),
      });
      return await parseJsonOrThrow(res);
    },
    [buildHeaders, parseJsonOrThrow]
  );

  /* =========================
     Listas
  ========================= */
  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setError("");
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar listas.");

      const normalized = normalizeLists(data);
      setLists(normalized);

      if ((normalized.periodos || []).length) {
        setFPeriodo((prev) => prev || normalized.periodos[0]);
      } else {
        setFPeriodo("");
      }

      return normalized;
    } catch (e) {
      setError(e.message || "Error cargando listas.");
      setLists(emptyLists);
      setFPeriodo("");
      return emptyLists;
    } finally {
      setLoadingLists(false);
    }
  }, [API, apiGet]);

  const refreshPeriodos = useCallback(async () => {
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data?.exito) return;
      const normalized = normalizeLists(data);
      const nextPeriodos = Array.isArray(normalized.periodos) ? normalized.periodos : [];
      setLists((prev) => ({ ...prev, periodos: nextPeriodos }));
    } catch {
      // ignore
    }
  }, [API, apiGet]);

  /* =========================
     Movimientos (se filtra a ventas en frontend)
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const perUI = periodoToMMYYYY(periodoUI);
      if (!perUI) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const periodoAPI = periodoToYYYYMM(perUI);
      const cacheKey = `${periodoAPI}|${(qLocal || "").trim()}`;

      if (cacheRef.current.has(cacheKey)) {
        setRows(cacheRef.current.get(cacheKey) || []);
        setLoadingRows(false);
        return;
      }

      setLoadingRows(true);
      setError("");

      try {
        const sp = new URLSearchParams();
        sp.set("action", "movimientos_listar");
        sp.set("periodo", periodoAPI);
        if (qLocal) sp.set("q", qLocal);

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar ventas.");

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
        const norm = movs.map((r) => ({
          ...r,
          periodo: periodoToMMYYYY(r?.periodo),
          fecha: r?.fecha,
        }));

        cacheRef.current.set(cacheKey, norm);
        setRows(norm);
      } catch (e) {
        setError(e.message || "Error cargando ventas.");
        setRows([]);
      } finally {
        setLoadingRows(false);
      }
    },
    [API, apiGet, fPeriodo, q]
  );

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoUI);
    const keyPrefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(keyPrefix)) cacheRef.current.delete(k);
    }
  }, []);

  /* =========================
     Init
  ========================= */
  useEffect(() => {
    (async () => {
      const normalized = await loadLists();
      const perDefault = (normalized.periodos || [])[0] || "";
      if (perDefault) {
        await loadRows({ periodo: perDefault, q: "" });
      } else {
        setRows([]);
        setLoadingRows(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Filtrado: período + ventas + búsqueda
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];

    return rows
      .filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer))
      .filter((r) => isVentaRow(r))
      .filter((r) => rowMatchesQuery(r, q));
  }, [rows, fPeriodo, q]);

  /* =========================
     Columnas
  ========================= */
  const columns = useMemo(() => {
    return [
      {
        key: "fecha",
        label: "FECHA",
        fr: 0.9,
        render: (r) => safeText(formatFechaDMY(r.fecha)),
      },
      {
        key: "detalle",
        label: "DESCRIPCIÓN",
        fr: 2.2,
        strong: true,
        align: "left",
        render: (r) => safeText(r.detalle ?? r.descripcion ?? r.concepto),
      },
      {
        key: "cliente",
        label: "CLIENTE",
        fr: 1.6,
        align: "left",
        render: (r) => safeText(r.cliente),
      },
      {
        key: "medio_pago",
        label: "PAGO",
        fr: 1.2,
        align: "left",
        render: (r) => {
          const tv = normalizeSearchText(r?.tipo_venta);
          const esContado = tv.includes("contado");
          if (!esContado) return "—"; // cuenta corriente u otra forma => no aplica
          const mp = String(r.medio_pago ?? "").trim();
          return mp ? mp : "—";
        },
      },
      {
        key: "total",
        label: "TOTAL",
        fr: 1.1,
        align: "right",
        render: (r) => moneyARS(r.monto_total ?? r.total ?? r.total_general ?? 0),
      },
      { key: "acciones", label: "ACCIONES", fr: 0.8, align: "center", render: () => null },
    ];
  }, []);

  const gridCols = useMemo(() => {
    const fallback = `repeat(${columns.length}, minmax(0, 1fr))`;
    if (!Array.isArray(columns) || !columns.length) return fallback;
    return columns
      .map((c) => {
        const n = Number(c.fr);
        return Number.isFinite(n) && n > 0 ? `${n}fr` : "1fr";
      })
      .join(" ");
  }, [columns]);

  /* =========================
     Acciones modales
  ========================= */
  const openEditModal = (r) => {
    setSelectedRow(r);
    setOpenEdit(true);
  };
  const openDeleteModal = (r) => {
    setSelectedRow(r);
    setOpenDel(true);
  };

  /* =========================
     Guardar / eliminar
  ========================= */
  const saveMovimiento = async (payload, isEdit) => {
    setError("");
    const { idUsuario } = getAuthInfo();
    const action = isEdit ? "movimientos_actualizar" : "movimientos_crear";

    const payloadNorm = {
      ...(payload || {}),
      periodo: periodoToYYYYMM(payload?.periodo),
    };

    const data = await apiPostJson(`${API}?action=${action}`, {
      ...payloadNorm,
      idUsuario,
    });

    if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar.");
  };

  const confirmDelete = async () => {
    if (!selectedRow?.id_movimiento) return;

    const id = selectedRow.id_movimiento;
    setDeletingId(id);
    setError("");
    showToast("cargando", "Eliminando venta…", 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const sp = new URLSearchParams();
      sp.set("action", "movimientos_eliminar");
      sp.set("id_movimiento", String(id));

      const data = await apiPostJson(`${API}?${sp.toString()}`, { idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");

      setOpenDel(false);
      setSelectedRow(null);

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q });

      await refreshPeriodos();
      showToast("exito", "Venta eliminada.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando venta.");
      showToast("error", e.message || "Error eliminando venta.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  const saveBatchMovimientos = useCallback(
    async (payloads) => {
      const arr = Array.isArray(payloads) ? payloads : [];
      if (!arr.length) throw new Error("No hay filas para guardar.");

      const { idUsuario } = getAuthInfo();

      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];

        const payloadNorm = {
          ...(p || {}),
          periodo: periodoToYYYYMM(p?.periodo),
        };

        const data = await apiPostJson(`${API}?action=movimientos_crear`, {
          ...payloadNorm,
          idUsuario,
        });

        if (!data?.exito) {
          const msg = data?.mensaje || `Error guardando fila ${i + 1}.`;
          throw new Error(msg);
        }
      }

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q: "" });
    },
    [API, apiPostJson, fPeriodo, invalidateCacheForPeriodo, loadRows]
  );

  /* =========================
     Excel “Ventas”
  ========================= */
  const exportToExcel = useCallback(() => {
    try {
      if (!filteredRows.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      const dataToExport = filteredRows.map((r) => ({
        FECHA: safeText(formatFechaDMY(r.fecha)),
        DESCRIPCION: safeText(r.detalle ?? r.descripcion ?? r.concepto),
        CLIENTE: safeText(r.cliente),
        PAGO: safeText(String(r.medio_pago ?? "").trim() || "Cuenta Corriente"),
        TOTAL: Number(r.monto_total ?? r.total ?? 0) || 0,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToExport);

      // formato moneda para TOTAL si existe
      const headers = Object.keys(dataToExport[0] || {});
      const totalColIndex = headers.findIndex((h) => h === "TOTAL");
      if (totalColIndex >= 0 && ws["!ref"]) {
        const colLetter = XLSX.utils.encode_col(totalColIndex);
        const range = XLSX.utils.decode_range(ws["!ref"]);
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const cell = ws[`${colLetter}${r + 1}`];
          if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00';
        }
      }

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName(`Ventas_${per}`));

      XLSX.writeFile(wb, `ventas_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast]);

  return (
    <div className="mov-page">
      {toast && <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />}

      {error && <div className="mov-alert" role="alert">{error}</div>}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div>
              <div className="mov-card__title">Movimientos · Ventas</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> ventas
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="mov-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select
                  value={periodoToMMYYYY(fPeriodo)}
                  onChange={async (e) => {
                    const ui = periodoToMMYYYY(e.target.value);
                    setFPeriodo(ui);
                    await loadRows({ periodo: ui, q });
                  }}
                  disabled={loadingRows || loadingLists}
                >
                  {(lists.periodos || []).map((p) => {
                    const ui = periodoToMMYYYY(p);
                    return (
                      <option key={ui} value={ui}>
                        {ui}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="mov-search">
                <label>
                  <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                </label>

                <div className="mov-searchInput">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        await loadRows({ periodo: fPeriodo, q: e.currentTarget.value });
                      }
                    }}
                    placeholder="Buscar por fecha, cliente, descripción, monto…"
                    disabled={loadingRows}
                  />

                  {q.trim() !== "" && !loadingRows && (
                    <button
                      type="button"
                      className="mov-clearSearch"
                      title="Limpiar búsqueda"
                      onClick={async () => {
                        setQ("");
                        await loadRows({ periodo: fPeriodo, q: "" });
                        const input = document.querySelector(".mov-searchInput input");
                        input?.focus();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions">
            <button
              type="button"
              className="mov-btn mov-btn--ghost mov-btn--clear mov-btn--excel"
              onClick={exportToExcel}
              disabled={loadingRows || filteredRows.length === 0}
              title={filteredRows.length ? "Exportar a Excel" : "No hay datos para exportar"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>
          </div>
        </div>

        <div className="mov-tabsBar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }} />
          <button
            type="button"
            className="mov-btn mov-btn--primary mov-tabsCta"
            onClick={() => setOpenAdd(true)}
            disabled={!fPeriodo}
            title={!fPeriodo ? "Primero seleccioná un período" : "Crear nueva venta"}
          >
            <FontAwesomeIcon icon={faPlus} /> Nueva Venta
          </button>
        </div>

        {/* HEADER */}
        <div className="mov-gridTable mov-gridTable--head" style={{ gridTemplateColumns: gridCols }} role="row">
          {columns.map((c) => (
            <div
              key={c.key}
              className={[
                "mov-gridCell",
                "mov-gridCell--head",
                c.align === "right" ? "is-right" : "",
                c.align === "center" ? "is-center" : "",
              ].join(" ")}
              role="columnheader"
            >
              {c.label}
            </div>
          ))}
        </div>

        {/* BODY */}
        <div className="mov-tableWrap" role="rowgroup">
          <div className="mov-gridBody">
            {loadingRows && <div className="mov-emptyRow">Cargando ventas…</div>}

            {!loadingRows &&
              filteredRows.map((r) => (
                <div
                  key={r.id_movimiento}
                  className="mov-gridTable mov-gridTable--row"
                  style={{ gridTemplateColumns: gridCols }}
                  role="row"
                >
                  {columns.map((c) => {
                    if (c.key === "acciones") {
                      return (
                        <div
                          key={c.key}
                          className={[
                            "mov-gridCell",
                            "mov-gridCell--actions",
                            c.align === "center" ? "is-center" : "",
                          ].join(" ")}
                          role="cell"
                        >
                          <div className="mov-actionsInline">
                            <button type="button" className="mov-iconBtn" title="Editar" onClick={() => openEditModal(r)}>
                              <FontAwesomeIcon icon={faPenToSquare} />
                            </button>

                            <button
                              type="button"
                              className="mov-iconBtn mov-iconBtn--danger"
                              title="Eliminar"
                              disabled={deletingId === r.id_movimiento}
                              onClick={() => openDeleteModal(r)}
                            >
                              {deletingId === r.id_movimiento ? "..." : <FontAwesomeIcon icon={faTrashCan} />}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const val = c.render ? c.render(r) : safeText(r[c.key]);
                    return (
                      <div
                        key={c.key}
                        className={[
                          "mov-gridCell",
                          c.align === "right" ? "is-right" : "",
                          c.align === "center" ? "is-center" : "",
                          c.strong ? "is-strong" : "",
                        ].filter(Boolean).join(" ")}
                        role="cell"
                        title={typeof val === "string" ? val : undefined}
                      >
                        <span className="mov-ellipsissss">{val}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

            {!loadingRows && filteredRows.length === 0 && (
              <div className="mov-emptyRow">
                {!fPeriodo ? "No hay período disponible para cargar ventas." : "No hay ventas para mostrar en este período."}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MODAL NUEVA VENTA */}
      <ModalNuevaVenta
        open={openAdd}
        lists={lists}
        periodoDefault={fPeriodo}
        onClose={() => setOpenAdd(false)}
        onToast={showToast}
        onSaveBatch={async (payloads) => {
          try {
            showToast("cargando", "Guardando ventas…", 12000);

            await saveBatchMovimientos(payloads);
            await refreshPeriodos();

            const firstPer = Array.isArray(payloads) && payloads[0]?.periodo ? payloads[0].periodo : "";
            const ui = periodoToMMYYYY(firstPer) || fPeriodo;

            setQ("");
            setFPeriodo(ui);
            invalidateCacheForPeriodo(ui);
            await loadRows({ periodo: ui, q: "" });

            setOpenAdd(false);
            showToast("exito", "Ventas guardadas.", 2400);
          } catch (e) {
            showToast("error", e?.message || "Error guardando ventas.", 4200);
            throw e;
          }
        }}
      />

      {/* MODAL EDITAR */}
      <ModalEditarVenta
        open={openEdit}
        lists={lists}
        row={selectedRow}
        periodoDefault={fPeriodo}
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onCatalogCreated={() => {}}
        onToast={showToast}
        onSave={async (payload) => {
          await saveMovimiento(payload, true);
        }}
      />

      {/* DELETE */}
      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId === selectedRow?.id_movimiento}
        onClose={() => {
          setOpenDel(false);
          setSelectedRow(null);
        }}
        onConfirm={confirmDelete}
        onToast={showToast}
      />
    </div>
  );
}
