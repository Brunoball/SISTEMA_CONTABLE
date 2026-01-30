// src/components/Movimientos/Movimientos.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import BASE_URL from "../../config/config";
import "./movimientos.css";

import ModalAgregarMovimiento from "./modales/ModalAgregarMovimiento";
import ModalEditarMovimiento from "./modales/ModalEditarMovimiento";
import ModalEliminarMovimientos from "./modales/ModalEliminarMovimientos";

// ✅ Toast global (fuera de los modales)
import Toast from "../Global/Toast.jsx";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faTrashCan,
  faPlus,
  faBroom,
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
    return `$${n.toFixed(2)}`;
  }
}
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
}

/* =========================
   ✅ Período MM-YYYY helpers
========================= */
function normalizePeriodoToMMYYYY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";

  let m = "";
  let y = "";

  // YYYY-MM o YYYY/MM
  if (/^\d{4}[-/]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/]/);
    y = parts[0];
    m = parts[1];
  }
  // MM-YYYY o MM/YYYY
  else if (/^\d{1,2}[-/]\d{4}$/.test(s)) {
    const parts = s.split(/[-/]/);
    m = parts[0];
    y = parts[1];
  }
  // YYYYMM (o MMYYYY, intento adivinar)
  else if (/^\d{6}$/.test(s)) {
    const a = Number(s.slice(0, 4));
    if (a >= 1900 && a <= 2100) {
      y = s.slice(0, 4);
      m = s.slice(4);
    } else {
      m = s.slice(0, 2);
      y = s.slice(2);
    }
  } else {
    return s; // fallback
  }

  const mm = String(Number(m)).padStart(2, "0");
  const yyyy = String(y);
  return `${mm}-${yyyy}`;
}

/* =========================
   ✅ Listas nuevas del sistema_contable
========================= */
const emptyLists = {
  periodos: [],
  clasificaciones: [],
  clientes: [],
  cuentas_corrientes: [],
  detalles: [],
  medios_pago: [],
  proveedores: [],
  tipos_movimiento: [],
  tipos_venta: [],
};

function normalizeLists(raw) {
  const src = raw?.listas && typeof raw.listas === "object" ? raw.listas : raw;
  const getArr = (k) => (Array.isArray(src?.[k]) ? src[k] : []);

  return {
    periodos: (getArr("periodos") || []).map(normalizePeriodoToMMYYYY),

    clasificaciones: getArr("clasificaciones"),
    clientes: getArr("clientes"),
    cuentas_corrientes: getArr("cuentas_corrientes"),
    detalles: getArr("detalles"),
    medios_pago: getArr("medios_pago"),
    proveedores: getArr("proveedores"),
    tipos_movimiento: getArr("tipos_movimiento"),
    tipos_venta: getArr("tipos_venta"),
  };
}

/* =========================
   Tabs de tabla (mantenidos)
========================= */
const TABLE_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "detalle", label: "Detalle" },
  { id: "partes", label: "Partes" },
  { id: "pago", label: "Pago" },
];

/* =========================
   Auth helpers (idUsuario + token)
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
   Excel helpers
========================= */
function slugifySheetName(name) {
  const s = String(name || "Movimientos")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Movimientos").slice(0, 31);
}

function buildExportRows(rows, tab) {
  if (tab === "resumen") {
    return rows.map((r) => ({
      FECHA: safeText(r.fecha),
      PERIODO: safeText(normalizePeriodoToMMYYYY(r.periodo)),
      TOTAL: Number(r.monto_total || 0),
    }));
  }

  if (tab === "detalle") {
    return rows.map((r) => ({
      DETALLE: safeText(r.detalle),
      "TIPO VENTA": safeText(r.tipo_venta),
      TOTAL: Number(r.monto_total || 0),
    }));
  }

  if (tab === "partes") {
    return rows.map((r) => ({
      CLASIFICACION: safeText(r.clasificacion),
      "TIPO MOV.": safeText(r.tipo_movimiento),
      CLIENTE: safeText(r.cliente),
      PROVEEDOR: safeText(r.proveedor),
    }));
  }

  // pago
  return rows.map((r) => ({
    "CUENTA CORRIENTE": safeText(r.cuenta_corriente),
    "MEDIO PAGO": safeText(r.medio_pago),
    TOTAL: Number(r.monto_total || 0),
  }));
}

export default function Movimientos() {
  const API = `${BASE_URL}/api.php`;

  const [lists, setLists] = useState(emptyLists);
  const [rows, setRows] = useState([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  // filtros
  const [fPeriodo, setFPeriodo] = useState("");
  const [q, setQ] = useState("");

  // tabla tabs
  const [tab, setTab] = useState("resumen");

  // modales
  const [openAdd, setOpenAdd] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // ✅ TOAST GLOBAL (vive fuera de los modales)
  const [toast, setToast] = useState(null);

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  /* =========================
     API helpers robustos + Authorization
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
      const data = JSON.parse(text);
      return data;
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
      const data = await parseJsonOrThrow(res);
      return data;
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
      const data = await parseJsonOrThrow(res);
      return data;
    },
    [buildHeaders, parseJsonOrThrow]
  );

  /* =========================
     ✅ ACTUALIZAR LISTAS GLOBALMENTE cuando se crea algo en un catálogo
  ========================= */
  const handleCatalogCreated = useCallback((catalogo, item) => {
    const keyByCatalogo = {
      clasificaciones: "clasificaciones",
      clientes: "clientes",
      cuentas_corrientes: "cuentas_corrientes",
      detalles: "detalles",
      medios_pago: "medios_pago",
      proveedores: "proveedores",
      tipos_movimiento: "tipos_movimiento",
      tipos_venta: "tipos_venta",
    };

    const listKey = keyByCatalogo[String(catalogo || "").trim()];
    if (!listKey) return;

    const newId = Number(item?.id);
    const newNombre = String(item?.nombre ?? "").trim();
    if (!Number.isFinite(newId) || newId <= 0 || !newNombre) return;

    setLists((prev) => {
      const prevArr = Array.isArray(prev?.[listKey]) ? prev[listKey] : [];
      const exists = prevArr.some((x) => Number(x?.id) === newId);
      if (exists) return prev;

      return {
        ...prev,
        [listKey]: [...prevArr, { id: newId, nombre: newNombre }],
      };
    });
  }, []);

  /* =========================
     Cargar listas
  ========================= */
  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setError("");
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data.exito)
        throw new Error(data.mensaje || "No se pudieron cargar listas.");

      const normalized = normalizeLists(data);
      setLists(normalized);

      // ✅ default de período normalizado a MM-YYYY
      if (!fPeriodo && (normalized.periodos || []).length) {
        setFPeriodo(normalized.periodos[0]);
      }

      return normalized;
    } catch (e) {
      setError(e.message || "Error cargando listas.");
      setLists(emptyLists);
      return emptyLists;
    } finally {
      setLoadingLists(false);
    }
  }, [API, apiGet, fPeriodo]);

  /* =========================
     Cargar movimientos
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoRaw =
        typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const periodo = normalizePeriodoToMMYYYY(periodoRaw);

      const qLocal = typeof opts.q === "string" ? opts.q : q;

      setLoadingRows(true);
      setError("");

      try {
        const sp = new URLSearchParams();
        sp.set("action", "movimientos_listar");
        if (periodo) sp.set("periodo", periodo);
        if (qLocal) sp.set("q", qLocal);

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data.exito)
          throw new Error(data.mensaje || "No se pudieron cargar movimientos.");

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];

        // ✅ normaliza periodo para UI
        const movsNorm = movs.map((r) => ({
          ...r,
          periodo: normalizePeriodoToMMYYYY(r?.periodo),
        }));

        setRows(movsNorm);
      } catch (e) {
        setError(e.message || "Error cargando movimientos.");
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
      await loadLists();
      await loadRows({ periodo: "" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Filtrado FRONT
  ========================= */
  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const fPer = normalizePeriodoToMMYYYY(fPeriodo);

    return rows.filter((r) => {
      const rPer = normalizePeriodoToMMYYYY(r?.periodo);

      if (fPer && String(rPer) !== String(fPer)) return false;

      if (qq) {
        const hay =
          String(r.clasificacion || "").toLowerCase().includes(qq) ||
          String(r.tipo_venta || "").toLowerCase().includes(qq) ||
          String(r.cuenta_corriente || "").toLowerCase().includes(qq) ||
          String(r.tipo_movimiento || "").toLowerCase().includes(qq) ||
          String(r.cliente || "").toLowerCase().includes(qq) ||
          String(r.proveedor || "").toLowerCase().includes(qq) ||
          String(r.detalle || "").toLowerCase().includes(qq) ||
          String(r.medio_pago || "").toLowerCase().includes(qq);

        if (!hay) return false;
      }

      return true;
    });
  }, [rows, fPeriodo, q]);

  /* =========================
     Acciones (abrir modales)
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
     Exportar Excel (según pestaña actual)
  ========================= */
  const exportToExcel = useCallback(() => {
    try {
      const dataToExport = buildExportRows(filteredRows, tab);

      if (!dataToExport.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      const wb = XLSX.utils.book_new();
      const sheetName = slugifySheetName(`Movimientos_${tab}`);
      const ws = XLSX.utils.json_to_sheet(dataToExport);

      // formato numérico para columna TOTAL si existe
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

      const per = normalizePeriodoToMMYYYY(fPeriodo) || "TODOS";
      const fileName = `movimientos_${tab}_${per}.xlsx`;

      XLSX.writeFile(wb, fileName);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, tab, fPeriodo, showToast]);

  /* =========================
     Eliminar (confirmación) ✅ manda idUsuario
  ========================= */
  const confirmDelete = async () => {
    if (!selectedRow?.id_movimiento) return;

    const id = selectedRow.id_movimiento;
    setDeletingId(id);
    setError("");

    showToast("cargando", "Eliminando movimiento…", 12000);

    try {
      const { idUsuario } = getAuthInfo();
      const sp = new URLSearchParams();
      sp.set("action", "movimientos_eliminar");
      sp.set("id_movimiento", String(id));

      const data = await apiPostJson(`${API}?${sp.toString()}`, { idUsuario });
      if (!data.exito) throw new Error(data.mensaje || "No se pudo eliminar.");

      setOpenDel(false);
      setSelectedRow(null);

      // ✅ mostrar TODO luego de eliminar
      setFPeriodo("");
      await loadRows({ periodo: "", q });

      showToast("exito", "Movimiento eliminado.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando movimiento.");
      showToast("error", e.message || "Error eliminando movimiento.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  /* =========================
     Guardar (Add / Edit) ✅ agrega idUsuario
  ========================= */
  const saveMovimiento = async (payload, isEdit) => {
    setError("");

    const { idUsuario } = getAuthInfo();
    const action = isEdit ? "movimientos_actualizar" : "movimientos_crear";

    const payloadNorm = {
      ...(payload || {}),
      periodo: normalizePeriodoToMMYYYY(payload?.periodo),
    };

    const data = await apiPostJson(`${API}?action=${action}`, {
      ...payloadNorm,
      idUsuario,
    });

    if (!data.exito) throw new Error(data.mensaje || "No se pudo guardar.");
  };

  /* =========================
     Columnas por pestaña (adaptadas)
  ========================= */
  const columns = useMemo(() => {
    if (tab === "resumen") {
      return [
        {
          key: "fecha",
          label: "FECHA",
          align: "left",
          render: (r) => safeText(r.fecha),
        },
        {
          key: "periodo",
          label: "PERÍODO",
          align: "center",
          render: (r) => safeText(normalizePeriodoToMMYYYY(r.periodo)),
        },
        {
          key: "monto_total",
          label: "TOTAL",
          align: "center",
          render: (r) => moneyARS(r.monto_total),
        },
        { key: "acciones", label: "ACCIONES", align: "center", render: () => null },
      ];
    }

    if (tab === "detalle") {
      return [
        {
          key: "detalle",
          label: "DETALLE",
          align: "left",
          strong: true,
          render: (r) => safeText(r.detalle),
        },
        {
          key: "tipo_venta",
          label: "TIPO VENTA",
          align: "center",
          render: (r) => safeText(r.tipo_venta),
        },
        {
          key: "monto_total",
          label: "TOTAL",
          align: "center",
          render: (r) => moneyARS(r.monto_total),
        },
        { key: "acciones", label: "ACCIONES", align: "center", render: () => null },
      ];
    }

    if (tab === "partes") {
      return [
        {
          key: "clasificacion",
          label: "CLASIFICACIÓN",
          align: "left",
          render: (r) => safeText(r.clasificacion),
        },
        {
          key: "tipo_movimiento",
          label: "TIPO MOV.",
          align: "center",
          render: (r) => safeText(r.tipo_movimiento),
        },
        {
          key: "cliente",
          label: "CLIENTE",
          align: "center",
          render: (r) => safeText(r.cliente),
        },
        {
          key: "proveedor",
          label: "PROVEEDOR",
          align: "center",
          render: (r) => safeText(r.proveedor),
        },
        { key: "acciones", label: "ACCIONES", align: "center", render: () => null },
      ];
    }

    // pago
    return [
      {
        key: "cuenta_corriente",
        label: "CUENTA CORRIENTE",
        align: "left",
        render: (r) => safeText(r.cuenta_corriente),
      },
      {
        key: "medio_pago",
        label: "MEDIO PAGO",
        align: "left",
        render: (r) => safeText(r.medio_pago),
      },
      {
        key: "monto_total",
        label: "TOTAL",
        align: "center",
        render: (r) => moneyARS(r.monto_total),
      },
      { key: "acciones", label: "ACCIONES", align: "center", render: () => null },
    ];
  }, [tab]);

  const gridCols = useMemo(
    () => `repeat(${columns.length}, minmax(0, 1fr))`,
    [columns.length]
  );

  return (
    <div className="mov-page">
      {/* ✅ Toast global */}
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

      {/* Tabla */}
      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div>
              <div className="mov-card__title">Movimientos</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> registros
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="mov-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>

                <select
                  value={normalizePeriodoToMMYYYY(fPeriodo)}
                  onChange={async (e) => {
                    const v = normalizePeriodoToMMYYYY(e.target.value);
                    setFPeriodo(v);
                    await loadRows({ periodo: v, q });
                  }}
                  disabled={loadingRows}
                >
                  <option value="">Todos</option>
                  {(lists.periodos || []).map((p) => {
                    const mmYYYY = normalizePeriodoToMMYYYY(p);
                    return (
                      <option key={mmYYYY} value={mmYYYY}>
                        {mmYYYY}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="mov-search">
                <label>
                  <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                </label>
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
                  placeholder="Buscar por cliente, proveedor, detalle, medio pago..."
                  disabled={loadingRows}
                />
              </div>
            </div>
          </div>

          <div className="mov-card__actions">
            {/* ✅ EXPORTAR EXCEL */}
            <button
              type="button"
              className="mov-btn mov-btn--ghost mov-btn--clear mov-btn--excel"

              onClick={exportToExcel}
              disabled={loadingRows || filteredRows.length === 0}
              title={
                filteredRows.length
                  ? "Exportar a Excel"
                  : "No hay datos para exportar"
              }
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--ghost mov-btn--clear mov-btn--dangerSoft"
              onClick={async () => {
                showToast("cargando", "Limpiando búsqueda…", 4000);

                setQ("");
                await loadRows({ periodo: fPeriodo, q: "" });

                showToast("exito", "Búsqueda limpiada.", 2000);
              }}
            >
              <FontAwesomeIcon icon={faBroom} /> Limpiar
            </button>
          </div>
        </div>

        <div className="mov-tabsBar">
          <div className="mov-tabs">
            {TABLE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`mov-tab ${tab === t.id ? "is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mov-btn mov-btn--primary mov-tabsCta"
            onClick={() => setOpenAdd(true)}
          >
            <FontAwesomeIcon icon={faPlus} /> Nuevo movimiento
          </button>
        </div>

        {/* HEADER */}
        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: gridCols }}
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
            {loadingRows && (
              <div className="mov-emptyRow">Cargando movimientos...</div>
            )}

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
                              {deletingId === r.id_movimiento ? (
                                "..."
                              ) : (
                                <FontAwesomeIcon icon={faTrashCan} />
                              )}
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
                        {val}
                      </div>
                    );
                  })}
                </div>
              ))}

            {!loadingRows && filteredRows.length === 0 && (
              <div className="mov-emptyRow">No hay movimientos para mostrar.</div>
            )}
          </div>
        </div>
      </section>

      {/* MODALES */}
      <ModalAgregarMovimiento
        open={openAdd}
        lists={lists}
        periodoDefault={fPeriodo}
        onClose={() => setOpenAdd(false)}
        onCatalogCreated={handleCatalogCreated}
        onToast={showToast}
        onSave={async (payload) => {
          try {
            showToast("cargando", "Guardando movimiento…", 12000);
            await saveMovimiento(payload, false);

            // ✅ luego de guardar: mostrar TODOS
            setFPeriodo("");
            await loadRows({ periodo: "", q });

            setOpenAdd(false);
            showToast("exito", "Movimiento guardado correctamente.", 2600);
          } catch (e) {
            showToast("error", e?.message || "Error guardando movimiento.", 4200);
            throw e;
          }
        }}
      />

      <ModalEditarMovimiento
        open={openEdit}
        lists={lists}
        row={selectedRow}
        periodoDefault={fPeriodo}
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onCatalogCreated={handleCatalogCreated}
        onToast={showToast}
        onSave={async (payload) => {
          try {
            showToast("cargando", "Guardando cambios…", 12000);
            await saveMovimiento(payload, true);

            // ✅ luego de editar: mostrar TODOS
            setFPeriodo("");
            await loadRows({ periodo: "", q });

            setOpenEdit(false);
            setSelectedRow(null);
            showToast("exito", "Movimiento actualizado.", 2600);
          } catch (e) {
            showToast("error", e?.message || "Error actualizando movimiento.", 4200);
            throw e;
          }
        }}
      />

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
