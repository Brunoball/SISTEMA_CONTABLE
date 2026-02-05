// src/components/Compras/Compras.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import ModalEditarCompra from "./modales/ModalEditarCompra";
import "../Movimientos/movimientos.css"; // ✅ misma estética que Ventas/Movimientos

import Toast from "../Global/Toast.jsx";

import ModalNuevaCompra from "./modales/ModalNuevaCompra";
import ModalEliminarMovimientos from "../Movimientos/modales/ModalEliminarMovimientos";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faTrashCan,
  faPlus,
  faMagnifyingGlass,
  faCalendarDays,
  faFileExcel,
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
    return `$${Number(n).toFixed(2)}`;
  }
}
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}
function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   FECHA -> DD/MM/YYYY
========================= */
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "—";

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
   Listas
========================= */
const emptyLists = {
  periodos: [],
  clasificaciones: [],
  proveedores: [],
  cuentas_corrientes: [],
  medios_pago: [],
  detalles: [],
  tipos_movimiento: [],
  tipos_compra: [],
};

function normalizeLists(raw) {
  const src = raw?.listas && typeof raw.listas === "object" ? raw.listas : raw;
  const pickArr = (k) => (Array.isArray(src?.[k]) ? src[k] : []);
  const periodos = pickArr("periodos").map(periodoToMMYYYY);

  return {
    periodos,
    clasificaciones: pickArr("clasificaciones"),
    proveedores: pickArr("proveedores"),
    cuentas_corrientes: pickArr("cuentas_corrientes"),
    medios_pago: pickArr("medios_pago"),
    detalles: pickArr("detalles"),
    tipos_movimiento: pickArr("tipos_movimiento"),
    tipos_compra: pickArr("tipos_compra"),
  };
}

/* =========================
   Full-text search
========================= */
function normalizeSearchText(v) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
   Reglas de Compras
   - tipo_movimiento = "Salida"
   - proveedor obligatorio
========================= */
function normalizeTipoMov(s) {
  const v = String(s ?? "").trim().toLowerCase();
  if (!v) return "";
  if (v === "salida" || v === "egreso" || v === "compra") return "salida";
  if (v === "entrada" || v === "ingreso") return "entrada";
  return v;
}

function isCompraRow(r) {
  const tipo = normalizeTipoMov(r?.tipo_movimiento);
  const prov = String(r?.proveedor ?? "").trim();
  return tipo === "salida" && prov !== "";
}

/* ✅ “FORMA DE PAGO” en Compras:
   - si hay cuenta_corriente => "Cuenta Corriente"
   - si no => "Contado" (y en PAGO mostramos el medio_pago)
*/
function getCompraCategoria(r) {
  const cc = String(r?.cuenta_corriente ?? "").trim();
  return cc ? "Cuenta Corriente" : "Contado";
}

function getCompraPagoLabel(r) {
  const cat = getCompraCategoria(r);
  if (cat === "Cuenta Corriente") return "Cuenta Corriente";
  const mp = String(r?.medio_pago ?? "").trim();
  return mp ? mp : "—";
}

/* =========================
   Excel export
========================= */
function slugifySheetName(name) {
  const s = String(name || "Compras")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Compras").slice(0, 31);
}

function buildExportRows(rows) {
  return rows.map((r) => ({
    FECHA: safeText(formatFechaDMY(r.fecha)),
    DESCRIPCION: safeText(r.detalle ?? r.descripcion ?? r.concepto ?? r.detalles ?? ""),
    PROVEEDOR: safeText(r.proveedor),
    PAGO: safeText(getCompraPagoLabel(r)),
    TOTAL: numOrZero(r.monto_total ?? r.total ?? 0),
  }));
}

/* =========================
   Component
========================= */
export default function Compras() {
  const API = `${BASE_URL}/api.php`;

  const [lists, setLists] = useState(emptyLists);
  const [rows, setRows] = useState([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState("");

  // filtros
  const [fPeriodo, setFPeriodo] = useState(""); // MM-YYYY
  const [q, setQ] = useState("");

  // modales
  const [openNueva, setOpenNueva] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);

  const [selectedRow, setSelectedRow] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // cache por periodo|q
  const cacheRef = useRef(new Map());

  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    try {
      return JSON.parse(text);
    } catch {
      const preview = text.length > 600 ? text.slice(0, 600) + "..." : text;
      throw new Error(
        `Respuesta inválida del servidor (no es JSON). HTTP ${res.status}\n${preview}`
      );
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

  const buildHeaders = useCallback(() => {
    const { token } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

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

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const ui = periodoToMMYYYY(periodoUI);
    const periodoAPI = periodoToYYYYMM(ui);
    const keyPrefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(keyPrefix)) cacheRef.current.delete(k);
    }
  }, []);

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
      setError(e?.message || "Error cargando listas.");
      setLists(emptyLists);
      setFPeriodo("");
      return emptyLists;
    } finally {
      setLoadingLists(false);
    }
  }, [API, apiGet]);

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
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar compras.");

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
        const norm = movs.map((r) => ({
          ...r,
          periodo: periodoToMMYYYY(r?.periodo),
          fecha: r?.fecha,
        }));

        cacheRef.current.set(cacheKey, norm);
        setRows(norm);
      } catch (e) {
        setError(e?.message || "Error cargando compras.");
        setRows([]);
      } finally {
        setLoadingRows(false);
      }
    },
    [API, apiGet, fPeriodo, q]
  );

  /* =========================
     Init
  ========================= */
  useEffect(() => {
    (async () => {
      const normalized = await loadLists();
      const perDefault = (normalized.periodos || [])[0] || "";
      if (perDefault) await loadRows({ periodo: perDefault, q: "" });
      else {
        setRows([]);
        setLoadingRows(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Filtrado: período + regla compras + búsqueda
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];

    return rows
      .filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer))
      .filter((r) => isCompraRow(r))
      .filter((r) => rowMatchesQuery(r, q));
  }, [rows, fPeriodo, q]);

  /* =========================
     Columnas (IGUAL a Ventas, pero PROVEEDOR + PAGO)
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
        key: "proveedor",
        label: "PROVEEDOR",
        fr: 1.6,
        align: "left",
        render: (r) => safeText(r.proveedor),
      },
      {
        key: "pago",
        label: "PAGO",
        fr: 1.2,
        align: "left",
        render: (r) => safeText(getCompraPagoLabel(r)),
      },
      {
        key: "total",
        label: "TOTAL",
        fr: 1.1,
        align: "center",
        render: (r) => moneyARS(r.monto_total ?? r.total ?? 0),
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
     Exportar Excel
  ========================= */
  const exportToExcel = useCallback(() => {
    try {
      const dataToExport = buildExportRows(filteredRows);

      if (!dataToExport.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      const wb = XLSX.utils.book_new();
      const sheetName = slugifySheetName("Compras");
      const ws = XLSX.utils.json_to_sheet(dataToExport);

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

      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.writeFile(wb, `compras_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast]);

  /* =========================
     Acciones
  ========================= */
  const openEditModal = (r) => {
    setSelectedRow(r);
    setOpenEdit(true);
    
  };
  const openDeleteModal = (r) => {
    setSelectedRow(r);
    setOpenDel(true);
  };

  const confirmDelete = async () => {
    if (!selectedRow?.id_movimiento) return;
    const id = selectedRow.id_movimiento;
    setDeletingId(id);

    try {
      const { idUsuario } = getAuthInfo();
      const sp = new URLSearchParams();
      sp.set("action", "movimientos_eliminar");
      sp.set("id_movimiento", String(id));

      showToast("cargando", "Eliminando compra…", 12000);
      const data = await apiPostJson(`${API}?${sp.toString()}`, { idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");

      setOpenDel(false);
      setSelectedRow(null);

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q });

      showToast("exito", "Compra eliminada.", 2600);
    } catch (e) {
      showToast("error", e?.message || "Error eliminando compra.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  /* =========================
     Guardar compra desde ModalNuevaCompra
  ========================= */
  const onSaveCompra = useCallback(
    async ({ compra, items, facturaFile }) => {
      const { idUsuario } = getAuthInfo();
      showToast("cargando", "Guardando compra…", 12000);

      try {
        if (facturaFile) {
          const { token } = getAuthInfo();
          const headers = {};
          if (token) headers.Authorization = `Bearer ${token}`;

          const fd = new FormData();
          fd.append("compra", JSON.stringify({ ...(compra || {}), idUsuario }));
          fd.append("items", JSON.stringify(items || []));
          fd.append("factura", facturaFile);

          const res = await fetch(`${API}?action=compras_crear`, {
            method: "POST",
            headers,
            body: fd,
          });

          const data = await parseJsonOrThrow(res);
          if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la compra.");
        } else {
          const data = await apiPostJson(`${API}?action=compras_crear`, {
            idUsuario,
            compra: compra || {},
            items: items || [],
          });
          if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la compra.");
        }

        setOpenNueva(false);
        invalidateCacheForPeriodo(fPeriodo);
        await loadRows({ periodo: fPeriodo, q });

        showToast("exito", "Compra guardada.", 2600);
      } catch (e) {
        showToast("error", e?.message || "Error guardando compra.", 4500);
        throw e;
      }
    },
    [API, apiPostJson, fPeriodo, invalidateCacheForPeriodo, loadRows, parseJsonOrThrow, q, showToast]
  );

  return (
    <div className="mov-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      {error && (
        <div className="mov-alert" role="alert">
          {error}
        </div>
      )}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div>
              <div className="mov-card__title">Movimientos · Compras</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b>
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
                        await loadRows({
                          periodo: fPeriodo,
                          q: e.currentTarget.value,
                        });
                      }
                    }}
                    placeholder="Buscar por proveedor, descripción, monto, fecha…"
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
            onClick={() => setOpenNueva(true)}
            disabled={!fPeriodo}
            title={!fPeriodo ? "Primero seleccioná un período" : "Crear nueva compra"}
          >
            <FontAwesomeIcon icon={faPlus} /> Nueva Compra
          </button>
        </div>

        {/* HEADER */}
<div
  className="mov-gridTable mov-gridTable--head"
  style={{
    gridTemplateColumns: gridCols,
    overflowX: "auto",
    scrollbarGutter: "stable",
  }}
  role="row"
>

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
            {loadingRows && <div className="mov-emptyRow">Cargando compras…</div>}

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
                            <button
                              type="button"
                              className="mov-iconBtn"
                              title="Editar"
                              onClick={() => openEditModal(r)}
                            >
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
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        role="cell"
                        title={typeof val === "string" ? val : undefined}
                      >
                        {/* ✅ MISMO TRUCO DE ELLIPSIS que Ventas */}
                        <span className="mov-ellipsissss">{val}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

            {!loadingRows && filteredRows.length === 0 && (
              <div className="mov-emptyRow">
                {!fPeriodo
                  ? "No hay período disponible para cargar compras."
                  : "No hay compras para mostrar en este período."}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ✅ MODAL NUEVA COMPRA */}
      <ModalNuevaCompra
        open={openNueva}
        lists={lists}
        periodoDefault={fPeriodo}
        onClose={() => setOpenNueva(false)}
        onToast={showToast}
        onSaveCompra={onSaveCompra}
      />

      {/* EDIT (placeholder por ahora, pero con estética mov-) */}
      {openEdit && (
        <div className="mov-placeholder" role="dialog" aria-modal="true">
          <div className="mov-placeholder__box">
            <div className="mov-placeholder__title">Editar Compra</div>
            <div className="mov-placeholder__text">
              Seleccionada: <b>{safeText(selectedRow?.proveedor)}</b> ·{" "}
              {moneyARS(selectedRow?.monto_total ?? selectedRow?.total ?? 0)}
            </div>
            <button
              className="mov-btn"
              onClick={() => {
                setOpenEdit(false);
                setSelectedRow(null);
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
      <ModalEditarCompra
  open={openEdit}
  lists={lists}
  row={selectedRow}
  periodoDefault={fPeriodo}
  onClose={() => setOpenEdit(false)}
  onToast={showToast}
  onSaveCompra={async ({ compra, items, facturaFile }) => {
    // acá pegás al backend:
    // - compra + items (JSON)
    // - facturaFile (multipart) si vino
  }}
/>

      {/* DELETE (modal real reutilizado) */}
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
