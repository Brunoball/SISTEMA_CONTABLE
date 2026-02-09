// src/components/Movimientos/Movimientos.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "./movimientos.css";

// ✅ MODALES
import ModalCargaRapidaMovimientos from "./modales/ModalCargaRapidaMovimientos";
import ModalEditarMovimiento from "./modales/ModalEditarMovimiento";
import ModalEliminarMovimientos from "./modales/ModalEliminarMovimientos";

// ✅ Toast global
import Toast from "../Global/Toast.jsx";

// ✅ Loader overlay
import GifCarga from "../Global/Gif_Carga.jsx";

// ✅ Hook loader PRO (el que creaste en Global)
import useSmoothLoader from "../Global/useSmoothLoader.jsx";

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
   DEV: Loader mínimo (opcional)
========================= */
const MIN_LOADING_MS = 0; // 0 desactiva
const FORCE_SHOW_LOADER_DEV = false; // true solo dev

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
function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return fallback;
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

/* ✅ Período helpers (UI MM-YYYY) <-> (API YYYY-MM) */
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

/* ✅ Listas */
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
  const periodosUI = (getArr("periodos") || []).map(periodoToMMYYYY);

  return {
    periodos: periodosUI,
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

/* ✅ Auth */
function getAuthInfo() {
  const token = localStorage.getItem("token") || "";

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { token, idUsuario };
}

/* ✅ Excel */
function slugifySheetName(name) {
  const s = String(name || "Movimientos")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Movimientos").slice(0, 31);
}

function buildExportRows(rows) {
  return rows.map((r) => {
    const total = pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0);

    const cliente = safeText(pick(r, ["cliente", "nombre_cliente", "razon_social_cliente"], ""));
    const proveedor = safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""));
    const tercero = cliente !== "-" ? cliente : proveedor;

    return {
      FECHA: safeText(formatFechaDMY(pick(r, ["fecha", "fecha_movimiento", "created_at"], ""))),
      PERIODO: safeText(periodoToMMYYYY(pick(r, ["periodo"], ""))),
      DESCRIPCION: safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      "TIPO PAGO": safeText(pick(r, ["medio_pago", "tipo_pago", "forma_pago"], "")),
      "CLIENTE/PROVEEDOR": tercero,
      TOTAL: numOrZero(total),
    };
  });
}

export default function Movimientos() {
  const API = `${BASE_URL}/api.php`;

  const [lists, setLists] = useState(emptyLists);
  const [rows, setRows] = useState([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false); // para deshabilitar UI
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  // filtros
  const [fPeriodo, setFPeriodo] = useState(""); // MM-YYYY
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

  // cache por periodoAPI|q
  const cacheRef = useRef(new Map());

  // ✅ Loader PRO global (hook)
  const {
    visible: uxLoaderVisible,
    begin: uxBegin,
    end: uxEnd,
  } = useSmoothLoader({
    showDelayMs: 80,
    minVisibleMs: 450,
  });

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
      throw new Error(`Respuesta inválida (no es JSON). HTTP ${res.status}\n${preview}`);
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

  const refreshPeriodos = useCallback(async () => {
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data?.exito) return;
      const normalized = normalizeLists(data);
      setLists((prev) => ({ ...prev, periodos: normalized.periodos || [] }));
    } catch {}
  }, [API, apiGet]);

  const loadLists = useCallback(async () => {
    setLoadingLists(true);
    setError("");
    try {
      const data = await apiGet(`${API}?action=global_obtener_listas`);
      if (!data.exito) throw new Error(data.mensaje || "No se pudieron cargar listas.");
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

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoUI);
    const prefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(prefix)) cacheRef.current.delete(k);
    }
  }, []);

  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const perUI = periodoToMMYYYY(periodoUI);
      if (!perUI) {
        setRows([]);
        setLoadingRows(false);
        setError("");
        return;
      }

      const periodoAPI = periodoToYYYYMM(perUI);
      const cacheKey = `${periodoAPI}|${(qLocal || "").trim()}`;

      // ✅ arrancar loader pro (delay + mínimo visible)
      uxBegin();

      const start = Date.now();
      setLoadingRows(true);
      setError("");

      try {
        // ✅ cache hit: no “jump”, actualizamos y cerramos loader
        if (cacheRef.current.has(cacheKey) && !FORCE_SHOW_LOADER_DEV) {
          setRows(cacheRef.current.get(cacheKey) || []);
          setLoadingRows(false);
          uxEnd();
          return;
        }

        // ✅ cache pero forzar loader (solo dev)
        if (cacheRef.current.has(cacheKey) && FORCE_SHOW_LOADER_DEV) {
          const cached = cacheRef.current.get(cacheKey) || [];
          const elapsed = Date.now() - start;
          const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
          setTimeout(() => {
            setRows(cached);
            setLoadingRows(false);
            uxEnd();
          }, remaining);
          return;
        }

        const sp = new URLSearchParams();
        sp.set("action", "movimientos_listar");
        sp.set("periodo", periodoAPI);
        if (qLocal) sp.set("q", qLocal);

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data.exito) throw new Error(data.mensaje || "No se pudieron cargar movimientos.");

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
        const movsNorm = movs.map((r) => ({
          ...r,
          periodo: periodoToMMYYYY(r?.periodo),
        }));

        cacheRef.current.set(cacheKey, movsNorm);

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        if (remaining > 0) {
          setTimeout(() => {
            setRows(movsNorm);
            setLoadingRows(false);
            uxEnd();
          }, remaining);
        } else {
          setRows(movsNorm);
          setLoadingRows(false);
          uxEnd();
        }
      } catch (e) {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        setTimeout(() => {
          setError(e.message || "Error cargando movimientos.");
          setLoadingRows(false);
          uxEnd();
        }, remaining);
      }
    },
    [API, apiGet, fPeriodo, q, uxBegin, uxEnd]
  );

  // sync período si desaparece
  useEffect(() => {
    if (!Array.isArray(lists.periodos)) return;

    if (lists.periodos.length === 0) {
      if (fPeriodo !== "") {
        setFPeriodo("");
        setRows([]);
      }
      return;
    }

    const current = periodoToMMYYYY(fPeriodo);
    if (current && !lists.periodos.includes(current)) {
      const next = lists.periodos[0];
      setFPeriodo(next);
      invalidateCacheForPeriodo(next);
      loadRows({ periodo: next, q: "" });
    }
  }, [lists.periodos, fPeriodo, invalidateCacheForPeriodo, loadRows]);

  // init
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

  // filtrado front (simple)
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];
    return rows.filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer));
  }, [rows, fPeriodo]);

  // ✅ COLUMNAS REDUCIDAS
  const columns = useMemo(() => {
    return [
      {
        key: "descripcion",
        label: "DESCRIPCIÓN",
        align: "left",
        fr: 2.2,
        render: (r) =>
          safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      },
      {
        key: "tipo_pago",
        label: "TIPO PAGO",
        align: "center",
        fr: 1.1,
        render: (r) => safeText(pick(r, ["medio_pago", "tipo_pago", "forma_pago"], "")),
      },
      {
        key: "tercero",
        label: "CLIENTE/PROVEEDOR",
        align: "left",
        fr: 1.6,
        render: (r) => {
          const cliente = safeText(pick(r, ["cliente", "nombre_cliente", "razon_social_cliente"], ""));
          if (cliente !== "-") return cliente;
          return safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""));
        },
      },
      {
        key: "total",
        label: "TOTAL",
        align: "center",
        fr: 1.0,
        render: (r) => {
          const total = pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0);
          return moneyARS(total);
        },
      },
      { key: "acciones", label: "ACCIONES", align: "center", fr: 0.8, render: () => null },
    ];
  }, []);

  const gridCols = useMemo(() => {
    return columns.map((c) => `${Number(c.fr) || 1}fr`).join(" ");
  }, [columns]);

  const openEditModal = (r) => {
    setSelectedRow(r);
    setOpenEdit(true);
  };

  const openDeleteModal = (r) => {
    setSelectedRow(r);
    setOpenDel(true);
  };

  const exportToExcel = useCallback(() => {
    try {
      const dataToExport = buildExportRows(filteredRows);

      if (!dataToExport.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName("Movimientos_Vista"));

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.writeFile(wb, `movimientos_vista_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast]);

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

    if (!data.exito) throw new Error(data.mensaje || "No se pudo guardar.");
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

        if (!data.exito) {
          const msg = data.mensaje || `Error guardando fila ${i + 1}.`;
          throw new Error(msg);
        }
      }

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q: "" });
    },
    [API, apiPostJson, fPeriodo, invalidateCacheForPeriodo, loadRows]
  );

  return (
    <div className="mov-page">
      {toast && (
        <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />
      )}

      {error && <div className="mov-alert" role="alert">{error}</div>}

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
                <label><FontAwesomeIcon icon={faCalendarDays} /> Período</label>
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
                    return <option key={ui} value={ui}>{ui}</option>;
                  })}
                </select>
              </div>

              <div className="mov-search">
                <label><FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda</label>
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
                    placeholder="Buscar…"
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
                        document.querySelector(".mov-searchInput input")?.focus();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mov-card__actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="mov-btn mov-btn--ghost mov-btn--clear mov-btn--excel"
              onClick={exportToExcel}
              disabled={loadingRows || filteredRows.length === 0}
              title={filteredRows.length ? "Exportar a Excel" : "No hay datos para exportar"}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={() => setOpenAdd(true)}
              disabled={!fPeriodo}
              title={!fPeriodo ? "Primero seleccioná un período" : "Nuevo Movimiento"}
            >
              <FontAwesomeIcon icon={faPlus} /> Nuevo Movimiento
            </button>
          </div>
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

        {/* BODY: filas siempre renderizadas + loader overlay */}
        <div className="mov-tableWrap mov-tableWrap--mov" role="rowgroup">
          <div className="mov-gridBody mov-gridBody--relative">
            {/* ✅ overlay pro (no mueve la tabla) */}
            <GifCarga visible={uxLoaderVisible} />

            {filteredRows.map((r) => (
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
                        className={["mov-gridCell", "mov-gridCell--actions", "is-center"].join(" ")}
                        role="cell"
                      >
                        <div className="mov-actionsInline">
                          <button
                            type="button"
                            className="mov-iconBtn"
                            title="Editar"
                            onClick={() => openEditModal(r)}
                            disabled={loadingRows}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>

                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            title="Eliminar"
                            disabled={loadingRows || deletingId === r.id_movimiento}
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
                {!fPeriodo
                  ? "No hay período disponible para cargar movimientos."
                  : "No hay movimientos para mostrar en este período."}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MODAL CARGA RAPIDA */}
      <ModalCargaRapidaMovimientos
        open={openAdd}
        lists={lists}
                  dark={true}
        periodoDefault={fPeriodo}
        onClose={() => setOpenAdd(false)}
        onToast={showToast}
        onSaveBatch={async (payloads) => {
          try {
            showToast("cargando", "Guardando carga rápida…", 12000);

            await saveBatchMovimientos(payloads);
            await refreshPeriodos();

            const firstPer = Array.isArray(payloads) && payloads[0]?.periodo ? payloads[0].periodo : "";
            const ui = periodoToMMYYYY(firstPer) || fPeriodo;

            setQ("");
            setFPeriodo(ui);
            invalidateCacheForPeriodo(ui);
            await loadRows({ periodo: ui, q: "" });

            setOpenAdd(false);
            showToast("exito", "Carga rápida guardada.", 2400);
          } catch (e) {
            showToast("error", e?.message || "Error guardando carga rápida.", 4200);
            throw e;
          }
        }}
      />

      {/* EDIT */}
      <ModalEditarMovimiento
        open={openEdit}
        lists={lists}
        row={selectedRow}
        periodoDefault={fPeriodo}
          dark={true}
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onToast={showToast}
        onSave={async (payload) => {
          try {
            showToast("cargando", "Guardando cambios…", 12000);
            await saveMovimiento(payload, true);

            invalidateCacheForPeriodo(fPeriodo);
            await loadRows({ periodo: fPeriodo, q });
            await refreshPeriodos();

            setOpenEdit(false);
            setSelectedRow(null);
            showToast("exito", "Movimiento actualizado.", 2600);
          } catch (e) {
            showToast("error", e?.message || "Error actualizando movimiento.", 4200);
            throw e;
          }
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
        onConfirm={async () => {
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

            invalidateCacheForPeriodo(fPeriodo);
            await loadRows({ periodo: fPeriodo, q });

            await refreshPeriodos();

            showToast("exito", "Movimiento eliminado.", 2600);
          } catch (e) {
            setError(e.message || "Error eliminando movimiento.");
            showToast("error", e.message || "Error eliminando movimiento.", 4200);
          } finally {
            setDeletingId(null);
          }
        }}
        onToast={showToast}
      />
    </div>
  );
}
