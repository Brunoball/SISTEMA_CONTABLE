// src/components/Movimientos/OrdenesPago.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "../Movimientos/movimientos.css"; // ✅ misma estética

import Toast from "../Global/Toast.jsx";

// ✅ GIF carga inline en tabla (igual que Recibos)
import GifCarga from "../Global/Gif_Carga.jsx";
import "../Global/gif_carga.css";

import ModalPagarOrdenesPago from "./modales/ModalPagarOrdenesPago"; // ✅ pagar OP
import ModalEditarOrdenPago from "./modales/ModalEditarOrdenPago"; // ✅ editar OP
import ModalEliminarMovimientos from "../Movimientos/modales/ModalEliminarMovimientos"; // ✅ borrar (reutilizado)

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faMagnifyingGlass,
  faFileExcel,
  faPenToSquare,
  faTrashCan,
  faMoneyBill1Wave,
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
  } catch {}

  return { token, idUsuario };
}

/* =========================
   Listas
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
   ✅ FILTRO ORDENES DE PAGO (pendientes)
   Regla espejo: tipo_venta = CUENTA CORRIENTE + tiene proveedor
========================= */
function hasProveedor(row) {
  const idProv = Number(
    row?.id_proveedor ?? row?.proveedor_id ?? row?.idProveedor ?? row?.id_proveedor_fk ?? 0
  );
  if (Number.isFinite(idProv) && idProv > 0) return true;

  const provTxt = String(row?.proveedor ?? "").trim();
  return provTxt.length > 0;
}

function isCuentaCorrienteTipoVenta(row) {
  const label = String(row?.tipo_venta ?? row?.tipoVenta ?? row?.condicion_venta ?? "").trim();
  const s = normalizeSearchText(label);

  if (s.includes("cuenta corriente")) return true;
  if (s.includes("cuenta") && s.includes("corriente")) return true;
  if (s.includes("cta") && s.includes("cte")) return true;
  if (s.includes("ctacte")) return true;

  return false;
}

function isOrdenPagoPendienteRow(row) {
  return hasProveedor(row) && isCuentaCorrienteTipoVenta(row);
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
  const s = String(name || "OrdenesPago")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "OrdenesPago").slice(0, 31);
}

export default function OrdenesPago() {
  const API = `${BASE_URL}/api.php`;

  /* =========================
     STATE
  ========================= */
  const [lists, setLists] = useState(emptyLists);
  const [rows, setRows] = useState([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState("");

  // filtros
  const [fPeriodo, setFPeriodo] = useState(""); // UI MM-YYYY
  const [q, setQ] = useState("");

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // cache por "periodoAPI|q"
  const cacheRef = useRef(new Map());

  /* =========================
     ✅ Pagar (modal)
  ========================= */
  const [openPagar, setOpenPagar] = useState(false);
  const [pagarProveedor, setPagarProveedor] = useState(null);
  const [pagarDeudas, setPagarDeudas] = useState([]);

  const closePagarModal = useCallback(() => {
    setOpenPagar(false);
    setPagarProveedor(null);
    setPagarDeudas([]);
  }, []);

  const getDeudasProveedor = useCallback(
    (rowProv) => {
      const idProv = Number(rowProv?.id_proveedor || 0);
      const nombreProv = String(rowProv?.proveedor || "").trim();

      return (rows || [])
        .filter((r) => {
          const rid = Number(r?.id_proveedor || 0);
          const rnom = String(r?.proveedor || "").trim();

          const same =
            (idProv > 0 && rid === idProv) ||
            (!idProv && nombreProv && rnom.toLowerCase() === nombreProv.toLowerCase());

          return same;
        })
        .filter((r) => isOrdenPagoPendienteRow(r));
    },
    [rows]
  );

  const openPagarModal = useCallback(
    (r) => {
      const deudas = getDeudasProveedor(r);
      setPagarProveedor(r);
      setPagarDeudas(deudas);
      setOpenPagar(true);
    },
    [getDeudasProveedor]
  );

  /* =========================
     ✅ Editar (modal)
  ========================= */
  const [openEditar, setOpenEditar] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const closeEditarModal = useCallback(() => {
    setOpenEditar(false);
    setEditRow(null);
  }, []);

  const openEditarModal = useCallback((r) => {
    setEditRow(r);
    setOpenEditar(true);
  }, []);

  /* =========================
     ✅ Eliminar (modal)
  ========================= */
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const openDeleteModal = useCallback((r) => {
    setSelectedRow(r);
    setOpenDel(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setOpenDel(false);
    setSelectedRow(null);
  }, []);

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

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const ui = periodoToMMYYYY(periodoUI);
    const periodoAPI = periodoToYYYYMM(ui);
    const keyPrefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(keyPrefix)) cacheRef.current.delete(k);
    }
  }, []);

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

  /* =========================
     ✅ Órdenes de pago (listar)
     Ahora NO usa movimientos_listar
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
        sp.set("action", "ordenes_pago_listar");
        sp.set("periodo", periodoAPI);
        if (qLocal) sp.set("q", qLocal);

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar órdenes de pago.");

        // ✅ soporta "ordenes" o "movimientos" según cómo lo devuelvas en backend
        const list = Array.isArray(data.ordenes) ? data.ordenes : Array.isArray(data.movimientos) ? data.movimientos : [];
        const norm = list.map((r) => ({
          ...r,
          periodo: periodoToMMYYYY(r?.periodo),
          fecha: r?.fecha,
        }));

        cacheRef.current.set(cacheKey, norm);
        setRows(norm);
      } catch (e) {
        setError(e.message || "Error cargando órdenes de pago.");
        setRows([]);
      } finally {
        setLoadingRows(false);
      }
    },
    [API, apiGet, fPeriodo, q]
  );

  /* =========================
     ✅ Confirmar pago OP (ya estaba bien)
  ========================= */
  const onConfirmPago = useCallback(
    async (payload) => {
      try {
        showToast("cargando", "Confirmando pago…", 12000);

        const ids =
          payload?.ids_movimiento ??
          payload?.ids_movimientos ??
          payload?.seleccion?.map((x) => Number(x?.id_movimiento || 0)).filter(Boolean) ??
          [];

        const data = await apiPostJson(`${API}?action=ordenes_pago_confirmar_pago`, {
          ids_movimiento: ids,
          id_medio_pago: Number(payload?.id_medio_pago || payload?.idMedioPago || 0),
        });

        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo confirmar el pago.");

        invalidateCacheForPeriodo(fPeriodo);
        await loadRows({ periodo: fPeriodo, q });

        showToast("exito", data?.mensaje || "Pago confirmado.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error confirmando pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, fPeriodo, q, invalidateCacheForPeriodo, loadRows, showToast]
  );

  /* =========================
     ✅ Guardar edición OP
     Ahora NO usa movimientos_actualizar
  ========================= */
  const onSaveEditar = useCallback(
    async (payloadFinal) => {
      try {
        showToast("cargando", "Guardando cambios…", 12000);

        const { idUsuario } = getAuthInfo();

        const data = await apiPostJson(`${API}?action=ordenes_pago_actualizar`, {
          ...payloadFinal,
          idUsuario,
        });

        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la orden de pago.");

        invalidateCacheForPeriodo(fPeriodo);
        await loadRows({ periodo: fPeriodo, q });

        showToast("exito", data?.mensaje || "Orden de pago actualizada.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error guardando orden de pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, fPeriodo, q, invalidateCacheForPeriodo, loadRows, showToast]
  );

  /* =========================
     ✅ Eliminar OP
     Ahora NO usa movimientos_eliminar
  ========================= */
  const confirmDelete = useCallback(async () => {
    if (!selectedRow?.id_movimiento) return;

    const id = selectedRow.id_movimiento;
    setDeletingId(id);
    setError("");
    showToast("cargando", "Eliminando orden de pago…", 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const data = await apiPostJson(`${API}?action=ordenes_pago_eliminar`, {
        id_movimiento: Number(id),
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");

      closeDeleteModal();

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q });

      showToast("exito", "Orden de pago eliminada.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando orden de pago.");
      showToast("error", e.message || "Error eliminando orden de pago.", 4200);
    } finally {
      setDeletingId(null);
    }
  }, [API, apiPostJson, closeDeleteModal, fPeriodo, invalidateCacheForPeriodo, loadRows, q, selectedRow, showToast]);

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
     Filtrado: período + pendientes(CC) + búsqueda
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];

    return rows
      .filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer))
      .filter((r) => isOrdenPagoPendienteRow(r))
      .filter((r) => rowMatchesQuery(r, q));
  }, [rows, fPeriodo, q]);

  /* =========================
     Columnas
  ========================= */
  const columns = useMemo(() => {
    return [
      { key: "fecha", label: "FECHA", align: "center", fr: 0.9, render: (r) => safeText(formatFechaDMY(r.fecha)) },
      {
        key: "detalle",
        label: "DESCRIPCIÓN",
        fr: 2.4,
        strong: true,
        align: "left",
        render: (r) => safeText(r.detalle ?? r.descripcion ?? r.concepto),
      },
      { key: "proveedor", label: "PROVEEDOR", fr: 1.8, align: "center", render: (r) => safeText(r.proveedor) },
      { key: "monto", label: "MONTO", fr: 1.1, align: "center", render: (r) => moneyARS(r.monto_total ?? r.total ?? 0) },
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
     Excel
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
        PROVEEDOR: safeText(r.proveedor),
        MONTO: Number(r.monto_total ?? r.total ?? 0) || 0,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToExport);

      const headers = Object.keys(dataToExport[0] || {});
      const montoColIndex = headers.findIndex((h) => h === "MONTO");
      if (montoColIndex >= 0 && ws["!ref"]) {
        const colLetter = XLSX.utils.encode_col(montoColIndex);
        const range = XLSX.utils.decode_range(ws["!ref"]);
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const cell = ws[`${colLetter}${r + 1}`];
          if (cell && typeof cell.v === "number") cell.z = '"$"#,##0.00';
        }
      }

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName(`OrdenPagoPend_${per}`));

      XLSX.writeFile(wb, `ordenes_pago_pendientes_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast]);

  return (
    <div className="mov-page">
      {toast && <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />}

      {error && (
        <div className="mov-alert" role="alert">
          {error}
        </div>
      )}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div>
              <div className="mov-card__title">Movimientos · Órdenes de Pago</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> pendientes
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
                    placeholder="Buscar por fecha, proveedor, descripción, monto…"
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
          </div>
        </div>

        {/* HEADER */}
        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: gridCols, overflowX: "auto", scrollbarGutter: "stable" }}
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
            {/* ✅ LOADER DENTRO DE TABLA */}
            {loadingRows && (
              <div className="mov-emptyRow mov-emptyRow--loading">
                <GifCarga />
              </div>
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
                          className={["mov-gridCell", "mov-gridCell--actions", "is-center"].join(" ")}
                          role="cell"
                        >
                          <div className="mov-actionsInline">
                            <button type="button" className="mov-iconBtn" title="Pagar" onClick={() => openPagarModal(r)}>
                              <FontAwesomeIcon icon={faMoneyBill1Wave} />
                            </button>

                            <button type="button" className="mov-iconBtn" title="Editar" onClick={() => openEditarModal(r)}>
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
                        <span className="mov-ellipsissss">{val}</span>
                      </div>
                    );
                  })}
                </div>
              ))}

            {!loadingRows && filteredRows.length === 0 && (
              <div className="mov-emptyRow">
                {!fPeriodo
                  ? "No hay período disponible para cargar órdenes de pago."
                  : "No hay órdenes de pago pendientes (Cuenta Corriente) en este período."}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* MODAL PAGAR */}
      <ModalPagarOrdenesPago
        open={openPagar}
        onClose={closePagarModal}
        proveedor={pagarProveedor}
        deudas={pagarDeudas}
        onToast={showToast}
        onConfirm={onConfirmPago}
      />

      {/* MODAL EDITAR */}
      <ModalEditarOrdenPago
        open={openEditar}
        row={editRow}
        lists={lists}
        periodoDefault={fPeriodo}
        onClose={closeEditarModal}
        onToast={showToast}
        onSave={onSaveEditar}
      />

      {/* DELETE */}
      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId === selectedRow?.id_movimiento}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        onToast={showToast}
      />
    </div>
  );
}
