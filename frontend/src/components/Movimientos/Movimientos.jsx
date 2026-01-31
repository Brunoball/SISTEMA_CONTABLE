// src/components/Movimientos/Movimientos.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "./movimientos.css";

// ✅ MODAL NUEVO (planilla)
import ModalCargaRapidaMovimientos from "./modales/ModalCargaRapidaMovimientos";

import ModalEditarMovimiento from "./modales/ModalEditarMovimiento";
import ModalEliminarMovimientos from "./modales/ModalEliminarMovimientos";

// ✅ Toast global (fuera de los modales)
import Toast from "../Global/Toast.jsx";

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
function fmtPct(v) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return safeText(v);
  return `${n}%`;
}

/* =========================
   ✅ FECHA -> DD/MM/YYYY
========================= */
function formatFechaDMY(v) {
  const s = String(v ?? "").trim();
  if (!s) return "-";

  // si viene "YYYY-MM-DD ..."
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const yyyy = m1[1];
    const mm = String(Number(m1[2])).padStart(2, "0");
    const dd = String(Number(m1[3])).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}`;
  }

  // si viene "DD/MM/YYYY"
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
   ✅ Período helpers (UI MM-YYYY) <-> (API YYYY-MM)
========================= */
function periodoToMMYYYY(input) {
  const s = String(input ?? "").trim();
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
  // YYYYMM o MMYYYY
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
    return s;
  }

  const mm = String(Number(m)).padStart(2, "0");
  const yyyy = String(y);
  return `${mm}-${yyyy}`;
}

function periodoToYYYYMM(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // si viene MM-YYYY
  if (/^\d{1,2}-\d{4}$/.test(s)) {
    const [mmRaw, yyyy] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  // si viene YYYY-MM
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [yyyy, mmRaw] = s.split("-");
    const mm = String(Number(mmRaw)).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  // si viene YYYY/MM o MM/YYYY
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

  // YYYYMM o MMYYYY
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

  // ✅ periodos UI siempre MM-YYYY
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

/* =========================
   ✅ TABS SIMPLIFICADOS (3)
   - TOTAL solo aparece en: RESUMEN y ITEMS
   - Unificamos "tipo venta + partes + pago" en "Detalle"
========================= */
const TABLE_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "detalle", label: "Detalle" }, // tipo_venta + partes + pago (sin TOTAL)
  { id: "items", label: "Items" }, // detalle + cálculos (con TOTAL)
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
      FECHA: safeText(formatFechaDMY(r.fecha)),
      PERIODO: safeText(periodoToMMYYYY(r.periodo)),
      TOTAL: Number(r.monto_total || 0),
    }));
  }

  // ✅ DETALLE (sin TOTAL para no repetir): tipo_venta + partes + pago
  if (tab === "detalle") {
    return rows.map((r) => ({
      "TIPO VENTA": safeText(r.tipo_venta),
      CLASIFICACION: safeText(r.clasificacion),
      "TIPO MOV.": safeText(r.tipo_movimiento),
      CLIENTE: safeText(r.cliente),
      PROVEEDOR: safeText(r.proveedor),
      "CUENTA CORRIENTE": safeText(r.cuenta_corriente),
      "MEDIO PAGO": safeText(r.medio_pago),
    }));
  }

  // ✅ ITEMS (con TOTAL)
  return rows.map((r) => ({
    DETALLE: safeText(r.detalle),
    CANTIDAD: numOrZero(r.cantidad),
    PRECIO: numOrZero(r.precio),
    SUBTOTAL: numOrZero(r.subtotal),
    "IVA %": r.iva_pct ?? "",
    IVA: numOrZero(r.iva_monto),
    TOTAL: numOrZero(r.total ?? r.monto_total),
  }));
}

/* =========================
   ✅ FULL-TEXT SEARCH helper
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

  const fechaDMY = formatFechaDMY(row?.fecha);
  const periodoUI = periodoToMMYYYY(row?.periodo);

  const montoNum = Number(row?.monto_total || row?.total || 0);
  const montoStr1 = moneyARS(montoNum);
  const montoStr2 = String(montoNum);
  const montoStr3 = String(Math.trunc(montoNum));
  const montoStr4 = String(montoNum).replace(/[^\d]/g, "");
  const montoStr5 = String(montoStr1).replace(/[^\d]/g, "");

  const parts = [];

  if (row && typeof row === "object") {
    for (const k of Object.keys(row)) {
      const val = row[k];
      if (val && typeof val === "object") continue;
      parts.push(String(val ?? ""));
    }
  }

  parts.push(fechaDMY);
  parts.push(periodoUI);
  parts.push(montoStr1, montoStr2, montoStr3, montoStr4, montoStr5);

  const hay = normalizeSearchText(parts.join(" | "));
  return hay.includes(qq);
}

export default function Movimientos() {
  const API = `${BASE_URL}/api.php`;

  const [lists, setLists] = useState(emptyLists);
  const [rows, setRows] = useState([]);

  const [loadingLists, setLoadingLists] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  // filtros (UI)
  const [fPeriodo, setFPeriodo] = useState(""); // ✅ SIEMPRE MM-YYYY
  const [q, setQ] = useState("");

  // tabla tabs (ahora 3)
  const [tab, setTab] = useState("resumen");

  // modales
  const [openAdd, setOpenAdd] = useState(false); // ahora abre Carga Rápida
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // ✅ TOAST GLOBAL
  const [toast, setToast] = useState(null);

  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  /* =========================
     ✅ Cache simple por "periodoAPI|q"
  ========================= */
  const cacheRef = useRef(new Map()); // key -> array rows

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
     ✅ ACTUALIZAR LISTAS cuando se crea algo en catálogos
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
     Cargar listas (y setear período por defecto)
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

      // ✅ SIEMPRE elegir un período por defecto (el primero)
      if ((normalized.periodos || []).length) {
        setFPeriodo((prev) => prev || normalized.periodos[0]); // MM-YYYY
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
     Cargar movimientos
     ✅ SIEMPRE por período (NO "Todos")
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI =
        typeof opts.periodo === "string" ? opts.periodo : fPeriodo; // MM-YYYY
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const perUI = periodoToMMYYYY(periodoUI);
      if (!perUI) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const periodoAPI = periodoToYYYYMM(perUI); // YYYY-MM
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
        if (!data.exito)
          throw new Error(data.mensaje || "No se pudieron cargar movimientos.");

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];

        const movsNorm = movs.map((r) => ({
          ...r,
          periodo: periodoToMMYYYY(r?.periodo),
          fecha: r?.fecha,
        }));

        cacheRef.current.set(cacheKey, movsNorm);
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
     ✅ Filtrado FRONT (UI MM-YYYY) + full text
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];

    return rows.filter((r) => {
      const rPer = periodoToMMYYYY(r?.periodo);
      if (String(rPer) !== String(fPer)) return false;
      return rowMatchesQuery(r, q);
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
     Exportar Excel
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

      // Formato moneda solo si existe TOTAL
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
      const fileName = `movimientos_${tab}_${per}.xlsx`;

      XLSX.writeFile(wb, fileName);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, tab, fPeriodo, showToast]);

  /* =========================
     ✅ helper para invalidar cache del período actual
  ========================= */
  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoUI);
    const keyPrefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(keyPrefix)) cacheRef.current.delete(k);
    }
  }, []);

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

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q });

      showToast("exito", "Movimiento eliminado.", 2600);
    } catch (e) {
      setError(e.message || "Error eliminando movimiento.");
      showToast("error", e.message || "Error eliminando movimiento.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  /* =========================
     Guardar (EDIT/CREATE) ✅ manda idUsuario
  ========================= */
  const saveMovimiento = async (payload, isEdit) => {
    setError("");

    const { idUsuario } = getAuthInfo();
    const action = isEdit ? "movimientos_actualizar" : "movimientos_crear";

    const payloadNorm = {
      ...(payload || {}),
      // UI puede venir MM-YYYY; al backend mandamos YYYY-MM
      periodo: periodoToYYYYMM(payload?.periodo),
    };

    const data = await apiPostJson(`${API}?action=${action}`, {
      ...payloadNorm,
      idUsuario,
    });

    if (!data.exito) throw new Error(data.mensaje || "No se pudo guardar.");
  };

  /* =========================
     ✅ SAVE BATCH (carga rápida)
  ========================= */
  const saveBatchMovimientos = useCallback(
    async (payloads) => {
      const arr = Array.isArray(payloads) ? payloads : [];
      if (!arr.length) throw new Error("No hay filas para guardar.");

      const { idUsuario } = getAuthInfo();

      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];

        const payloadNorm = {
          ...(p || {}),
          periodo: periodoToYYYYMM(p?.periodo), // MM-YYYY -> YYYY-MM
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

  /* =========================
     Columnas por pestaña (3)
     ✅ TOTAL solo en: RESUMEN + ITEMS
========================= */
  const columns = useMemo(() => {
    // ✅ RESUMEN (con TOTAL)
    if (tab === "resumen") {
      return [
        {
          key: "fecha",
          label: "FECHA",
          align: "left",
          render: (r) => safeText(formatFechaDMY(r.fecha)),
        },
        {
          key: "periodo",
          label: "PERÍODO",
          align: "center",
          render: (r) => safeText(periodoToMMYYYY(r.periodo)),
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

    // ✅ DETALLE (SIN TOTAL): tipo_venta + partes + pago en una sola vista
    if (tab === "detalle") {
      return [
        {
          key: "tipo_venta",
          label: "TIPO VENTA",
          align: "left",
          strong: true,
          render: (r) => safeText(r.tipo_venta),
        },
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
        { key: "acciones", label: "ACCIONES", align: "center", render: () => null },
      ];
    }

    // ✅ ITEMS (con TOTAL)
    return [
      {
        key: "detalle",
        label: "DETALLE",
        align: "left",
        strong: true,
        render: (r) => safeText(r.detalle),
      },
      {
        key: "cantidad",
        label: "CANT.",
        align: "center",
        render: (r) => safeText(r?.cantidad ?? r?.qty),
      },
      {
        key: "precio",
        label: "PRECIO",
        align: "center",
        render: (r) => moneyARS(r?.precio ?? r?.precio_unitario ?? 0),
      },
      {
        key: "subtotal",
        label: "SUBTOTAL",
        align: "center",
        render: (r) => moneyARS(r?.subtotal ?? 0),
      },
      {
        key: "iva_pct",
        label: "% IVA",
        align: "center",
        render: (r) => fmtPct(r?.iva_pct),
      },
      {
        key: "iva_monto",
        label: "IVA",
        align: "center",
        render: (r) => moneyARS(r?.iva_monto ?? 0),
      },
      {
        key: "total_item",
        label: "TOTAL",
        align: "center",
        render: (r) => moneyARS(r?.total ?? r?.total_item ?? r?.monto_total ?? 0),
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
                    placeholder="Buscar por cualquier cosa: fecha, monto, cliente, proveedor..."
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

          {/* ✅ botón abre Carga Rápida */}
          <button
            type="button"
            className="mov-btn mov-btn--primary mov-tabsCta"
            onClick={() => setOpenAdd(true)}
            disabled={!fPeriodo}
          >
            <FontAwesomeIcon icon={faPlus} /> Carga rápida
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
            {loadingRows && <div className="mov-emptyRow">Cargando movimientos...</div>}

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
                        {val}
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

      {/* ✅ MODAL CARGA RAPIDA */}
      <ModalCargaRapidaMovimientos
        open={openAdd}
        lists={lists}
        periodoDefault={fPeriodo} // MM-YYYY
        onClose={() => setOpenAdd(false)}
        onToast={showToast}
        onSaveBatch={async (payloads) => {
          try {
            await saveBatchMovimientos(payloads);
            setOpenAdd(false);
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

            invalidateCacheForPeriodo(fPeriodo);
            await loadRows({ periodo: fPeriodo, q });

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
        onConfirm={confirmDelete}
        onToast={showToast}
      />
    </div>
  );
}
