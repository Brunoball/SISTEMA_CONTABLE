// src/components/Movimientos/Movimientos.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import BASE_URL from "../../config/config";
import "../Global/Global_Section.css";

// ✅ MODALES
import ModalCargaRapidaMovimientos from "./modales/ModalCargaRapidaMovimientos";
import ModalEditarMovimiento from "./modales/ModalEditarMovimiento";
import ModalEliminarMovimientos from "./modales/ModalEliminarMovimientos";

// ✅ Toast global
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

// ✅ NUEVO: Listas desde Dashboard/Provider
import { useListas } from "../../context/ListasContext";

/* =========================
   DEV: Loader mínimo (opcional)
========================= */
const MIN_LOADING_MS = 0; // 0 desactiva
const FORCE_SHOW_LOADER_DEV = false; // true solo dev

/* =========================
   PERF: paginado
========================= */
const PAGE_SIZE = 100; // ✅ SIEMPRE 100 de arranque

/* =========================
   Skeleton rows (shimmer)
========================= */
const SKELETON_ROWS = 10;

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

/* ✅ Auth (X-Session) */
function getAuthInfo() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      u?.user_id ??
      0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { sessionKey, idUsuario };
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
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const total = pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0);

    const cliente = safeText(pick(r, ["cliente", "nombre_cliente", "razon_social_cliente"], ""));
    const proveedor = safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""));
    const tercero = cliente !== "-" ? cliente : proveedor;

    return {
      FECHA: safeText(formatFechaDMY(pick(r, ["fecha", "fecha_movimiento", "created_at"], ""))),
      PERIODO: safeText(periodoToMMYYYY(pick(r, ["periodo"], ""))),
      DESCRIPCION: safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      "TIPO PAGO": safeText(pick(r, ["medio_pago_nombre", "medio_pago", "tipo_pago", "forma_pago"], "")),
      "CLIENTE/PROVEEDOR": tercero,
      TOTAL: numOrZero(total),
    };
  });
}

export default function Movimientos() {
  const API = `${BASE_URL}/api.php`;

  // ✅ LISTAS CENTRALIZADAS (ya precargadas en Dashboard)
  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

  const [rows, setRows] = useState([]);

  const [loadingRows, setLoadingRows] = useState(false); // carga principal
  const [loadingMore, setLoadingMore] = useState(false); // cargar más / cargar todos
  const [loadingAll, setLoadingAll] = useState(false); // ✅ cargar todos

  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  // filtros
  const [fPeriodo, setFPeriodo] = useState(""); // MM-YYYY
  const [q, setQ] = useState("");

  // paginado
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

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

  // cache por periodoAPI|q  -> { rows, hasMore, nextOffset }
  const cacheRef = useRef(new Map());

  // ✅ ID global monotónico (para descartar respuestas viejas)
  const reqIdRef = useRef(0);

  // ✅ tokens por tipo de carga (evita que una request vieja apague loaders)
  const rowsReqIdRef = useRef(0); // request activa de "carga principal"
  const moreReqIdRef = useRef(0); // request activa de "append"

  // ✅ Debounce búsqueda
  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);

  // ✅ token para cortar loops de "cargar todos" si cambia periodo/q
  const loadAllTokenRef = useRef(0);

  // ✅ Skeleton (FIX anti-parpadeo)
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  /* =========================
     API helpers (X-Session)
  ========================= */
  const buildHeaders = useCallback(() => {
    const { sessionKey } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (sessionKey) h["X-Session"] = sessionKey;
    return h;
  }, []);

  const buildHeadersGET = useCallback(() => {
    const { sessionKey } = getAuthInfo();
    const h = {};
    if (sessionKey) h["X-Session"] = sessionKey;
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
      const res = await fetch(url, { method: "GET", headers: buildHeadersGET() });
      return await parseJsonOrThrow(res);
    },
    [buildHeadersGET, parseJsonOrThrow]
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
      await refreshLists();
    } catch {}
  }, [refreshLists]);

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoUI);
    const prefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(prefix)) cacheRef.current.delete(k);
    }
  }, []);

  /* =========================
     LOAD ROWS (paginado real)
     ✅ include_total por defecto OFF (SaaS)
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

      const perUI = periodoToMMYYYY(periodoUI);

      // ⛔ sin período => limpiar
      if (!perUI) {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setLoadingMore(false);
        setLoadingAll(false);
        setShowSkeleton(false);
        setError("");
        return { hasMore: false, nextOffset: null, received: 0 };
      }

      const periodoAPI = periodoToYYYYMM(perUI);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${periodoAPI}|${qKey}`;

      const myReqId = ++reqIdRef.current;

      // ✅ cache SOLO para carga principal offset=0
      if (!append && offset === 0 && cacheRef.current.has(cacheKey) && !FORCE_SHOW_LOADER_DEV) {
        const cached = cacheRef.current.get(cacheKey);

        rowsReqIdRef.current = myReqId;
        if (rowsReqIdRef.current !== myReqId) return null;

        setShowSkeleton(false);
        setLoadingRows(false);

        setRows(Array.isArray(cached?.rows) ? cached.rows : []);
        setHasMore(!!cached?.hasMore);
        setNextOffset(cached?.nextOffset ?? null);
        setError("");

        return {
          hasMore: !!cached?.hasMore,
          nextOffset: cached?.nextOffset ?? null,
          received: Array.isArray(cached?.rows) ? cached.rows.length : 0,
        };
      }

      if (!append) {
        rowsReqIdRef.current = myReqId;
        setShowSkeleton(true);
        setLoadingRows(true);
      } else {
        moreReqIdRef.current = myReqId;
        setLoadingMore(true);
      }

      setError("");
      const start = Date.now();

      try {
        const sp = new URLSearchParams();
        sp.set("action", "movimientos_listar");
        sp.set("periodo", periodoAPI);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PAGE_SIZE));
        sp.set("offset", String(offset));

        // ✅ FIX BUG: el backend espera include_total (no include_count)
        // ✅ SaaS: COUNT pesado opcional (default 0)
        sp.set("include_total", "0");

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar movimientos.");

        if (myReqId !== reqIdRef.current) return null;

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
        const movsNorm = movs.map((r) => ({ ...r, periodo: periodoToMMYYYY(r?.periodo) }));

        const newHasMore = !!data.has_more;
        const newNextOffset =
          data.next_offset !== undefined && data.next_offset !== null ? Number(data.next_offset) : null;

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        return await new Promise((resolve) => {
          const apply = () => {
            if (myReqId !== reqIdRef.current) return resolve(null);

            if (append) {
              setRows((prev) => {
                const base = Array.isArray(prev) ? prev : [];
                const seen = new Set(base.map((x) => String(x?.id_movimiento)));
                const add = movsNorm.filter((x) => !seen.has(String(x?.id_movimiento)));
                return [...base, ...add];
              });
            } else {
              setRows(movsNorm);
            }

            setHasMore(newHasMore);
            setNextOffset(newNextOffset);

            if (!append && offset === 0) {
              cacheRef.current.set(cacheKey, {
                rows: movsNorm,
                hasMore: newHasMore,
                nextOffset: newNextOffset,
              });
            }

            if (append) {
              if (moreReqIdRef.current === myReqId) setLoadingMore(false);
            } else {
              if (rowsReqIdRef.current === myReqId) {
                setLoadingRows(false);
                setShowSkeleton(false);
              }
            }

            resolve({ hasMore: newHasMore, nextOffset: newNextOffset, received: movsNorm.length });
          };

          if (remaining > 0) setTimeout(apply, remaining);
          else apply();
        });
      } catch (e) {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        return await new Promise((resolve) => {
          setTimeout(() => {
            if (myReqId !== reqIdRef.current) return resolve(null);

            setError(e?.message || "Error cargando movimientos.");

            if (append) {
              if (moreReqIdRef.current === myReqId) setLoadingMore(false);
            } else {
              if (rowsReqIdRef.current === myReqId) {
                setLoadingRows(false);
                setShowSkeleton(false);
              }
            }

            resolve(null);
          }, remaining);
        });
      }
    },
    [API, apiGet, fPeriodo, q]
  );

  /* =========================
     ✅ INIT: asegurar listas + cargar rows
  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      const loadedLists = await ensureListsLoaded({ force: false, background: true }).catch(() => null);
      if (!alive) return;

      const periodosSrc = loadedLists?.periodos ?? listasCtx?.periodos;
      const periodos = Array.isArray(periodosSrc) ? periodosSrc : [];
      const perDefault = periodos[0] || "";

      if (perDefault) {
        setFPeriodo((prev) => prev || perDefault);
        await loadRows({ periodo: perDefault, q: "", offset: 0, append: false });
      } else {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setShowSkeleton(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ sync período si desaparece
  useEffect(() => {
    const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos : [];

    if (periodos.length === 0) {
      if (fPeriodo !== "") {
        setFPeriodo("");
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
      }
      return;
    }

    const current = periodoToMMYYYY(fPeriodo);
    if (current && !periodos.includes(current)) {
      const next = periodos[0];
      setFPeriodo(next);
      invalidateCacheForPeriodo(next);
      loadRows({ periodo: next, q: "", offset: 0, append: false });
    }
  }, [listasCtx?.periodos, fPeriodo, invalidateCacheForPeriodo, loadRows]);

  // debounce búsqueda
  useEffect(() => {
    if (!fPeriodo) return;

    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(() => {
      loadRows({ periodo: fPeriodo, q, offset: 0, append: false });
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, fPeriodo, loadRows]);

  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];
    return (Array.isArray(rows) ? rows : []).filter(
      (r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer)
    );
  }, [rows, fPeriodo]);

  const columns = useMemo(() => {
    return [
      {
        key: "descripcion",
        label: "DESCRIPCIÓN",
        align: "left",
        fr: 2.2,
        render: (r) => safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      },
      {
        key: "tipo_pago",
        label: "TIPO PAGO",
        align: "center",
        fr: 1.1,
        render: (r) => safeText(pick(r, ["medio_pago_nombre", "medio_pago", "tipo_pago", "forma_pago"], "")),
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
          const total = pick(r, ["monto_total", "monto_total_final", "total", "importe_total", "monto", "importe"], 0);
          return moneyARS(total);
        },
      },
      { key: "acciones", label: "ACCIONES", align: "center", fr: 0.8, render: () => null },
    ];
  }, []);

  const gridCols = useMemo(() => columns.map((c) => `${Number(c.fr) || 1}fr`).join(" "), [columns]);

  const exportToExcel = useCallback(() => {
    try {
      const dataToExport = buildExportRows(filteredRows);

      if (!dataToExport.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      if (hasMore) {
        showToast(
          "error",
          "Ojo: faltan registros sin cargar. Si querés exportar todo, tocá “Cargar todos” primero.",
          5200
        );
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
  }, [filteredRows, fPeriodo, showToast, hasMore]);

  /* =========================================================
     ✅ Guardar 1 movimiento
  ========================================================= */
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

  /* =========================================================
     ✅ Guardar BATCH (CARGA RÁPIDA)
  ========================================================= */
  const saveBatchMovimientos = useCallback(
    async (payloads) => {
      const arr = Array.isArray(payloads) ? payloads : [];
      if (!arr.length) throw new Error("No hay filas para guardar.");

      const { idUsuario } = getAuthInfo();

      const movimientos = arr.map((p) => ({
        ...(p || {}),
        periodo: periodoToYYYYMM(p?.periodo),
      }));

      const data = await apiPostJson(`${API}?action=movimientos_crear_batch`, {
        movimientos,
        idUsuario,
      });

      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo guardar la carga rápida.");

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q: "", offset: 0, append: false });

      return data;
    },
    [API, apiPostJson, fPeriodo, invalidateCacheForPeriodo, loadRows]
  );

  const handleChangePeriodo = async (valueUI) => {
    const ui = periodoToMMYYYY(valueUI);
    setFPeriodo(ui);
    setQ("");
    skipSearchRef.current = true;

    // ✅ corta "cargar todos" en curso
    loadAllTokenRef.current += 1;

    invalidateCacheForPeriodo(ui);
    await loadRows({ periodo: ui, q: "", offset: 0, append: false });
  };

  /* =========================================================
     ✅ BOTÓN: "Cargar todos" (robusto si cambia periodo/q)
  ========================================================= */
  const handleLoadAll = useCallback(async () => {
    if (!hasMore || loadingMore || loadingRows || loadingListsCtx || loadingAll) return;
    if (nextOffset === null) return;

    setLoadingAll(true);
    showToast("cargando", "Cargando todos los movimientos…", 12000);

    const myToken = (loadAllTokenRef.current += 1);

    let offset = nextOffset;
    let guard = 0;

    try {
      while (offset !== null && guard < 3000) {
        // ✅ si cambió periodo/q durante el loop, cortamos
        if (myToken !== loadAllTokenRef.current) break;

        const currentPer = periodoToMMYYYY(fPeriodo);
        const currentQ = (q || "").trim();

        const res = await loadRows({ periodo: currentPer, q: currentQ, offset, append: true });
        if (!res) break;

        offset = res.nextOffset;
        guard += 1;

        if (!res.hasMore || offset === null) break;
      }

      if (myToken === loadAllTokenRef.current) {
        showToast("exito", "Listo: ya se cargaron todos.", 2600);
      }
    } catch (e) {
      showToast("error", e?.message || "Error cargando todos.", 4200);
    } finally {
      // solo apagar si sigue siendo el loop vigente
      if (myToken === loadAllTokenRef.current) setLoadingAll(false);
    }
  }, [hasMore, loadingMore, loadingRows, loadingListsCtx, loadingAll, nextOffset, fPeriodo, q, loadRows, showToast]);

  const softLoading = loadingRows && showSkeleton;

  const skelWidths = useMemo(() => {
    return {
      descripcion: ["72%", "58%", "66%", "48%"],
      tipo_pago: ["44%", "34%", "40%", "30%"],
      tercero: ["62%", "54%", "46%", "58%"],
      total: ["38%", "30%", "34%", "28%"],
    };
  }, []);

  const renderSkeletonRow = (idx) => {
    return (
      <div
        key={`skel-${idx}`}
        className="mov-gridTable mov-gridTable--row mov-row--skeleton"
        style={{ gridTemplateColumns: gridCols }}
        role="row"
        aria-hidden="true"
      >
        {columns.map((c) => {
          if (c.key === "acciones") {
            return (
              <div
                key={c.key}
                className="mov-gridCell mov-gridCell--actions is-center"
                role="cell"
                data-label={c.label}
              >
                <div className="mov-skelActions">
                  <span className="mov-skelIcon" />
                  <span className="mov-skelIcon" />
                </div>
              </div>
            );
          }

          const list = skelWidths[c.key] || ["60%"];
          const w = list[idx % list.length];

          return (
            <div
              key={c.key}
              className={[
                "mov-gridCell",
                c.align === "right" ? "is-right" : "",
                c.align === "center" ? "is-center" : "",
              ].join(" ")}
              role="cell"
              data-label={c.label}
            >
              <span className="mov-skeletonBar" style={{ width: w }} />
            </div>
          );
        })}
      </div>
    );
  };

  const lists = listasCtx || {
    periodos: [],
    clasificaciones: [],
    clientes: [],
    cuentas_corrientes: [],
    detalles: [],
    medios_pago: [],
    proveedores: [],
    tipos_movimiento: [],
    tipos_venta: [],
    tipos_operacion: [],
  };

  const listsSafe = useMemo(() => {
    const src = listasCtx || {};
    return {
      periodos: Array.isArray(src.periodos) ? src.periodos : lists.periodos,
      clasificaciones: Array.isArray(src.clasificaciones) ? src.clasificaciones : lists.clasificaciones,
      clientes: Array.isArray(src.clientes) ? src.clientes : lists.clientes,
      cuentas_corrientes: Array.isArray(src.cuentas_corrientes) ? src.cuentas_corrientes : lists.cuentas_corrientes,
      detalles: Array.isArray(src.detalles) ? src.detalles : lists.detalles,
      medios_pago: Array.isArray(src.medios_pago) ? src.medios_pago : lists.medios_pago,
      proveedores: Array.isArray(src.proveedores) ? src.proveedores : lists.proveedores,
      tipos_movimiento: Array.isArray(src.tipos_movimiento) ? src.tipos_movimiento : lists.tipos_movimiento,
      tipos_venta: Array.isArray(src.tipos_venta) ? src.tipos_venta : lists.tipos_venta,
      tipos_operacion: Array.isArray(src.tipos_operacion) ? src.tipos_operacion : lists.tipos_operacion,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listasCtx]);

  const isAnyLoading = loadingRows || loadingMore || loadingAll;

  return (
    <div className="mov-page">
      {toast && (
        <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />
      )}

      {errorListsCtx && (
        <div className="mov-alert" role="alert">
          {errorListsCtx}
        </div>
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
              <div className="mov-card__title">Movimientos</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> registros{hasMore ? " (hay más)" : ""}
                {loadingAll ? " (cargando…)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="mov-filter">
                <label>
                  <FontAwesomeIcon icon={faCalendarDays} /> Período
                </label>
                <select
                  value={periodoToMMYYYY(fPeriodo)}
                  onChange={(e) => handleChangePeriodo(e.target.value)}
                  disabled={loadingRows || loadingListsCtx || loadingMore || loadingAll}
                >
                  {(listsSafe.periodos || []).map((p) => {
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
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        skipSearchRef.current = true;
                        await loadRows({ periodo: fPeriodo, q: e.currentTarget.value, offset: 0, append: false });
                      }
                    }}
                    placeholder="Buscar…"
                    disabled={loadingListsCtx || loadingAll}
                  />

                  {q.trim() !== "" && (
                    <button
                      type="button"
                      className="mov-clearSearch"
                      title="Limpiar búsqueda"
                      onClick={async () => {
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        setQ("");
                        skipSearchRef.current = true;
                        await loadRows({ periodo: fPeriodo, q: "", offset: 0, append: false });
                        document.querySelector(".mov-searchInput input")?.focus();
                      }}
                      disabled={loadingAll}
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
              <FontAwesomeIcon icon={faFileExcel} />
              <span className="mov-btnText mov-btnText--desktop">Exportar Excel</span>
              <span className="mov-btnText mov-btnText--mobile">Exportar</span>
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={async () => {
                await ensureListsLoaded({ force: false, background: true }).catch(() => {});
                setOpenAdd(true);
              }}
              disabled={false}   // ✅ SIEMPRE HABILITADO
              title="Nuevo Movimiento"
            >
              <FontAwesomeIcon icon={faPlus} />
              <span className="mov-btnText mov-btnText--desktop">Nuevo Movimiento</span>
              <span className="mov-btnText mov-btnText--mobile">Movimiento</span>
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

        {/* BODY */}
        <div className="mov-tableWrap mov-tableWrap--mov" role="rowgroup">
          <div className={["mov-gridBody mov-gridBody--relative", softLoading ? "mov-softLoading" : ""].join(" ")}>
            {loadingRows && showSkeleton ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
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
                            data-label={c.label}
                          >
                            <div className="mov-actionsInline">
                              <button
                                type="button"
                                className="mov-iconBtn"
                                title="Editar"
                                onClick={async () => {
                                  await ensureListsLoaded({ force: false, background: true }).catch(() => {});
                                  setSelectedRow(r);
                                  setOpenEdit(true);
                                }}
                                disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx}
                              >
                                <FontAwesomeIcon icon={faPenToSquare} />
                              </button>

                              <button
                                type="button"
                                className="mov-iconBtn mov-iconBtn--danger"
                                title="Eliminar"
                                disabled={
                                  loadingRows ||
                                  loadingMore ||
                                  loadingAll ||
                                  loadingListsCtx ||
                                  deletingId === r.id_movimiento
                                }
                                onClick={() => {
                                  setSelectedRow(r);
                                  setOpenDel(true);
                                }}
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
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="cell"
                          data-label={c.label}
                          title={typeof val === "string" ? val : undefined}
                        >
                          <span className="mov-ellipsissss">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {!isAnyLoading && filteredRows.length === 0 && (
                  <div className="mov-emptyRow">
                    {!fPeriodo
                      ? "No hay período disponible para cargar movimientos."
                      : "No hay movimientos para mostrar en este período."}
                  </div>
                )}

                {!loadingRows && filteredRows.length > 0 && hasMore && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadAll}
                      disabled={loadingMore || loadingAll || loadingListsCtx}
                      title="Cargar todos los movimientos restantes"
                    >
                      {loadingAll ? "Cargando todos…" : "Cargar todos"}
                    </button>
                  </div>
                )}

                {(loadingMore || loadingAll) && (
                  <div className="mov-skeletonMore" aria-busy="true" aria-label="Cargando más registros">
                    {Array.from({ length: 6 }).map((_, i) => renderSkeletonRow(i))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* MODAL CARGA RAPIDA */}
      <ModalCargaRapidaMovimientos
        open={openAdd}
        lists={listsSafe}
        periodoDefault={fPeriodo}
        onClose={() => setOpenAdd(false)}
        onToast={showToast}
        onSaveBatch={async (payloads) => {
          try {
            showToast("cargando", "Guardando carga rápida…", 12000);

            await saveBatchMovimientos(payloads);
            await refreshPeriodos();

            const firstPer = Array.isArray(payloads) && payloads[0]?.periodo ? payloads[0].periodo : "";
            const wantedUI = periodoToMMYYYY(firstPer) || fPeriodo;

            setQ("");
            setFPeriodo(wantedUI);

            // ✅ corta loops en curso
            loadAllTokenRef.current += 1;

            invalidateCacheForPeriodo(wantedUI);
            await loadRows({ periodo: wantedUI, q: "", offset: 0, append: false });

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
        lists={listsSafe}
        row={selectedRow}
        periodoDefault={fPeriodo}
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
            await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });
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

            const data = await (async () => {
              const res = await fetch(`${API}?${sp.toString()}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(getAuthInfo().sessionKey ? { "X-Session": getAuthInfo().sessionKey } : {}),
                },
                body: JSON.stringify({ idUsuario }),
              });
              const txt = await res.text();
              return JSON.parse(txt || "{}");
            })();

            if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");

            setOpenDel(false);
            setSelectedRow(null);

            // ✅ corta loops en curso
            loadAllTokenRef.current += 1;

            invalidateCacheForPeriodo(fPeriodo);
            await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });

            await refreshPeriodos();

            showToast("exito", "Movimiento eliminado.", 2600);
          } catch (e) {
            setError(e?.message || "Error eliminando movimiento.");
            showToast("error", e?.message || "Error eliminando movimiento.", 4200);
          } finally {
            setDeletingId(null);
          }
        }}
        onToast={showToast}
      />
    </div>
  );
}
