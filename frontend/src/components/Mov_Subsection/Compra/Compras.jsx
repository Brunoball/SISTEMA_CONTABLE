// src/components/Compras/Compras.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../../config/config.jsx";
import "../../Global/Global_Section.css";
import "../../Global/Global_oscuro.css";
import Toast from "../../Global/Toast.jsx";

import ModalNuevaCompra from "./modales_compra/ModalNuevaCompra.jsx";
import ModalEditarCompra from "./modales_compra/ModalEditarCompra.jsx";
import ModalVerComprobante from "../modales/ModalVerComprobante.jsx";
import ModalEliminarMovimientos from "../../Movimientos/modales/ModalEliminarMovimientos.jsx";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenToSquare,
  faTrashCan,
  faPlus,
  faMagnifyingGlass,
  faCalendarDays,
  faFileExcel,
  faEye,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";
import { useListas } from "../../../context/ListasContext.jsx";

/* =========================
   PERF: paginado
========================= */
const PAGE_SIZE = 100;
const SKELETON_ROWS = 10;
const PAGE_LIMIT_API = PAGE_SIZE + 1;

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
function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return fallback;
}
function getRowId(r) {
  return r?.id_compra ?? r?.idCompra ?? r?.id_movimiento ?? r?.idMovimiento ?? r?.id ?? r?.ID ?? null;
}
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

/* Período UI (MM-YYYY) */
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

/* API período (YYYY-MM) */
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

function getAuthInfo() {
  const token = (localStorage.getItem("token") || "").trim();
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    localStorage.getItem("x_session") ||
    ""
  ).trim();

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { token, sessionKey, idUsuario };
}

function getCompraPagoLabel(r) {
  const cc = String(r?.cuenta_corriente ?? "").trim();
  if (cc) return "CUENTA CORRIENTE";
  const mp = String(r?.medio_pago_nombre ?? r?.medio_pago ?? "").trim();
  return mp ? mp : "CONTADO";
}

function getComprobanteUrl(r) {
  const candidates = [
    r?.factura_url,
    r?.factura,
    r?.comprobante_url,
    r?.comprobante,
    r?.archivo_url,
    r?.url_factura,
    r?.path_factura,
    r?.factura_path,
  ];
  const raw = candidates.find((x) => typeof x === "string" && x.trim() !== "");
  if (!raw) return "";
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = String(BASE_URL || "").replace(/\/$/, "");
  const rel = s.replace(/^\//, "");
  return `${base}/${rel}`;
}

function slugifySheetName(name) {
  const s = String(name || "Compras")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Compras").slice(0, 31);
}

function buildExportRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    FECHA: safeText(formatFechaDMY(pick(r, ["fecha"], ""))),
    PERIODO: safeText(periodoToMMYYYY(pick(r, ["periodo"], ""))),
    DESCRIPCION: safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
    PROVEEDOR: safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], "")),
    PAGO: safeText(getCompraPagoLabel(r)),
    TOTAL: numOrZero(pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0)),
  }));
}

export default function Compras() {
  const API = `${BASE_URL}/api.php`;

  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState("");

  const [fPeriodo, setFPeriodo] = useState("");
  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  const [openNueva, setOpenNueva] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);

  const [openVerComp, setOpenVerComp] = useState(false);
  const [compUrl, setCompUrl] = useState("");

  const [selectedRow, setSelectedRow] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const cacheRef = useRef(new Map());
  const reqIdRef = useRef(0);

  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);

  const skelTimerRef = useRef(null);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // ✅ evita “No hay…” antes de terminar la carga (y evita flash entre cargas)
  const [ready, setReady] = useState(false);

  const beginSkeleton = useCallback(() => {
    if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    setShowSkeleton(false);
    skelTimerRef.current = setTimeout(() => setShowSkeleton(true), 120);
  }, []);
  const endSkeleton = useCallback(() => {
    if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
    setShowSkeleton(false);
  }, []);

  useEffect(() => {
    return () => {
      if (skelTimerRef.current) clearTimeout(skelTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  /* =========================
     API helpers
  ========================= */
  const buildHeaders = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = { "Content-Type": "application/json" };
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const buildHeadersGET = useCallback(() => {
    const { token, sessionKey } = getAuthInfo();
    const h = {};
    if (sessionKey) h["X-Session"] = sessionKey;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const parseJsonOrThrow = useCallback(async (res) => {
    const text = await res.text();
    if (!text) throw new Error("Respuesta vacía del servidor.");
    try {
      const data = JSON.parse(text);
      // si el backend devuelve {exito:false,...} igual lo tomamos y lo manejamos afuera
      return data;
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
     ✅ FIX: endpoint real de edición
     - intenta varios nombres de action para no clavarte
  ========================= */
  const editarCompraEnBackend = useCallback(
    async (payloadFinal) => {
      const { idUsuario } = getAuthInfo();
      const id = payloadFinal?.id_movimiento ?? payloadFinal?.id ?? getRowId(selectedRow);
      if (!id) throw new Error("No encuentro id_movimiento para editar.");

      // aseguramos id_movimiento en el payload
      const body = { ...payloadFinal, id_movimiento: Number(id), idUsuario };

      // probamos acciones posibles
      const candidates = ["compras_editar", "compras_actualizar", "movimientos_editar"];

      let lastErr = null;
      for (const action of candidates) {
        try {
          const sp = new URLSearchParams();
          sp.set("action", action);
          // algunos backends esperan id_movimiento en query también
          sp.set("id_movimiento", String(id));

          const data = await apiPostJson(`${API}?${sp.toString()}`, body);

          if (data?.exito) return data;

          // si el endpoint existe pero respondió exito:false
          const msg = data?.mensaje || `No se pudo editar (action=${action}).`;
          lastErr = new Error(msg);
        } catch (e) {
          lastErr = e;
        }
      }

      throw lastErr || new Error("No se pudo editar la compra (ningún endpoint respondió OK).");
    },
    [API, apiPostJson, selectedRow]
  );

  /* =========================
     LOAD
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;
      const mode = String(opts.mode || (append ? "more" : "initial"));

      const seenIdsExternal = opts.seenIds instanceof Set ? opts.seenIds : null;

      const perUI = periodoToMMYYYY(periodoUI);

      if (!perUI) {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setLoadingMore(false);
        setLoadingAll(false);
        setError("");
        setReady(true);
        endSkeleton();
        return { hasMore: false, nextOffset: null, received: 0, appended: 0, pageIds: [] };
      }

      const periodoAPI = periodoToYYYYMM(perUI);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${periodoAPI}|${qKey}`;

      const myReqId = ++reqIdRef.current;

      if (!append && offset === 0) setReady(false);

      if (!append) {
        beginSkeleton();
        setLoadingRows(true);
      } else {
        if (mode !== "all") setLoadingMore(true);
      }
      setError("");

      try {
        if (!append && offset === 0 && cacheRef.current.has(cacheKey)) {
          const cached = cacheRef.current.get(cacheKey);
          setRows(cached?.rows || []);
          setHasMore(!!cached?.hasMore);
          setNextOffset(cached?.nextOffset ?? null);
          setLoadingRows(false);
          setReady(true);
          endSkeleton();
          return {
            hasMore: !!cached?.hasMore,
            nextOffset: cached?.nextOffset ?? null,
            received: Array.isArray(cached?.rows) ? cached.rows.length : 0,
            appended: 0,
            pageIds: (Array.isArray(cached?.rows) ? cached.rows : [])
              .map((x) => getRowId(x))
              .filter((id) => id !== null && id !== undefined)
              .map(String),
          };
        }

        const sp = new URLSearchParams();
        sp.set("action", "compras_listar");
        sp.set("periodo", periodoAPI);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PAGE_LIMIT_API));
        sp.set("offset", String(offset));

        const data = await apiGet(`${API}?${sp.toString()}`);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudieron cargar compras.");

        if (myReqId !== reqIdRef.current) {
          if (append) {
            if (mode !== "all") setLoadingMore(false);
          } else setLoadingRows(false);
          endSkeleton();
          return null;
        }

        const raw = Array.isArray(data.compras) ? data.compras : [];
        const rawNorm = raw.map((r) => ({ ...r, periodo: periodoToMMYYYY(r?.periodo) }));

        const backendHasMore =
          data.has_more !== undefined && data.has_more !== null ? !!data.has_more : null;

        const backendNextOffset =
          data.next_offset !== undefined && data.next_offset !== null ? Number(data.next_offset) : null;

        const page = rawNorm.slice(0, PAGE_SIZE);
        let newHasMore = false;
        let newNextOffset = null;

        if (backendHasMore !== null) {
          newHasMore = backendHasMore;
          newNextOffset = backendHasMore ? backendNextOffset : null;
          if (newHasMore && (newNextOffset === null || Number.isNaN(newNextOffset))) {
            newNextOffset = offset + page.length;
          }
        } else {
          newHasMore = rawNorm.length > PAGE_SIZE;
          newNextOffset = newHasMore ? offset + PAGE_SIZE : null;
        }

        const pageIds = page
          .map((x) => getRowId(x))
          .filter((id) => id !== null && id !== undefined)
          .map(String);

        let appendedCount = 0;

        if (append) {
          if (seenIdsExternal) {
            const add = page.filter((x) => {
              const id = getRowId(x);
              if (id === null || id === undefined) return true;
              return !seenIdsExternal.has(String(id));
            });
            appendedCount = add.length;

            setRows((prev) => {
              const prevArr = Array.isArray(prev) ? prev : [];
              return [...prevArr, ...add];
            });
          } else {
            setRows((prev) => {
              const prevArr = Array.isArray(prev) ? prev : [];
              const seen = new Set(prevArr.map((x) => String(getRowId(x))));
              const add = page.filter((x) => {
                const id = getRowId(x);
                if (id === null || id === undefined) return true;
                return !seen.has(String(id));
              });
              appendedCount = add.length; // best-effort
              return [...prevArr, ...add];
            });
            appendedCount = page.length; // best-effort
          }
        } else {
          setRows(page);
          cacheRef.current.set(cacheKey, { rows: page, hasMore: newHasMore, nextOffset: newNextOffset });
        }

        setHasMore(newHasMore);
        setNextOffset(newNextOffset);

        if (append) {
          if (mode !== "all") setLoadingMore(false);
        } else {
          setLoadingRows(false);
          setReady(true);
        }

        endSkeleton();

        return {
          hasMore: newHasMore,
          nextOffset: newNextOffset,
          received: page.length,
          appended: appendedCount,
          pageIds,
        };
      } catch (e) {
        if (myReqId !== reqIdRef.current) {
          if (append) {
            if (mode !== "all") setLoadingMore(false);
          } else setLoadingRows(false);
          endSkeleton();
          return null;
        }

        setError(e?.message || "Error cargando compras.");
        if (append) {
          if (mode !== "all") setLoadingMore(false);
        } else {
          setLoadingRows(false);
          setReady(true);
        }
        endSkeleton();
        return null;
      }
    },
    [API, apiGet, fPeriodo, q, beginSkeleton, endSkeleton]
  );

  /* =========================
     INIT
  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await ensureListsLoaded({ force: false, background: true });
      } catch {}

      if (!alive) return;

      const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos : [];
      const perDefault = periodos[0] || "";

      if (perDefault) {
        skipSearchRef.current = true;
        setReady(false);
        setFPeriodo((prev) => prev || perDefault);
        await loadRows({ periodo: perDefault, q: "", offset: 0, append: false, mode: "initial" });
      } else {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setReady(true);
        endSkeleton();
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================
     Debounce búsqueda
  ========================= */
  useEffect(() => {
    if (!fPeriodo) return;

    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(() => {
      loadRows({ periodo: fPeriodo, q, offset: 0, append: false, mode: "initial" });
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, fPeriodo, loadRows]);

  /* =========================
     Data derivada
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];
    return (Array.isArray(rows) ? rows : []).filter((r) => String(periodoToMMYYYY(r?.periodo)) === String(fPer));
  }, [rows, fPeriodo]);

  /* =========================
     Columnas
  ========================= */
  const columns = useMemo(() => {
    return [
      {
        key: "fecha",
        label: "FECHA",
        fr: 0.9,
        align: "center",
        render: (r) => safeText(formatFechaDMY(pick(r, ["fecha"], ""))),
      },
      {
        key: "detalle",
        label: "DESCRIPCIÓN",
        fr: 2.2,
        strong: true,
        align: "left",
        render: (r) => safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], "")),
      },
      {
        key: "proveedor",
        label: "PROVEEDOR",
        fr: 1.6,
        align: "left",
        render: (r) => safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], "")),
      },
      {
        key: "pago",
        label: "PAGO",
        fr: 1.2,
        align: "center",
        render: (r) => safeText(getCompraPagoLabel(r)),
      },
      {
        key: "total",
        label: "TOTAL",
        fr: 1.1,
        align: "center",
        render: (r) => moneyARS(pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0)),
      },
      { key: "acciones", label: "ACCIONES", fr: 0.95, align: "center", render: () => null },
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
      if (hasMore) {
        showToast(
          "error",
          "Ojo: faltan registros sin cargar. Si querés exportar todo, tocá “Cargar todos” primero.",
          5200
        );
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName("Compras"));

      const per = periodoToMMYYYY(fPeriodo) || "SIN_PERIODO";
      XLSX.writeFile(wb, `compras_${per}.xlsx`);
      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast, hasMore]);

  /* =========================
     Acciones UI
  ========================= */
  const openEditModal = (r) => {
    setSelectedRow(r);
    setOpenEdit(true);
  };
  const openDeleteModal = (r) => {
    setSelectedRow(r);
    setOpenDel(true);
  };
  const openComprobanteModal = (r) => {
    const url = getComprobanteUrl(r);
    if (!url) return;
    setCompUrl(url);
    setOpenVerComp(true);
  };
  const closeComprobanteModal = () => {
    setOpenVerComp(false);
    setCompUrl("");
  };

  const refreshAfterSave = useCallback(
    async (periodoGuardado) => {
      const perUI = periodoToMMYYYY(periodoGuardado || fPeriodo);
      setOpenNueva(false);
      setOpenEdit(false);
      setSelectedRow(null);

      invalidateCacheForPeriodo(perUI);
      await loadRows({ periodo: perUI, q, offset: 0, append: false, mode: "initial" });

      await refreshPeriodos();
    },
    [fPeriodo, q, invalidateCacheForPeriodo, loadRows, refreshPeriodos]
  );

  /* =========================
     ✅ FIX: GUARDAR EDICIÓN (real)
  ========================= */
  const handleSaveEdit = useCallback(
    async (payloadFinal) => {
      showToast("cargando", "Guardando cambios…", 12000);
      try {
        const data = await editarCompraEnBackend(payloadFinal);
        if (!data?.exito) throw new Error(data?.mensaje || "No se pudo actualizar.");

        const per = payloadFinal?.periodo || fPeriodo;
        await refreshAfterSave(per);

        showToast("exito", "Compra actualizada.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error guardando compra.", 4200);
        throw e; // 👈 importante: el modal corta saving si falla
      }
    },
    [editarCompraEnBackend, fPeriodo, refreshAfterSave, showToast]
  );

  const confirmDelete = async () => {
    const id = getRowId(selectedRow);
    if (!id) return;
    setDeletingId(id);

    try {
      const { idUsuario } = getAuthInfo();
      const sp = new URLSearchParams();
      sp.set("action", "compras_eliminar");
      sp.set("id_movimiento", String(id));

      showToast("cargando", "Eliminando compra…", 12000);
      const data = await apiPostJson(`${API}?${sp.toString()}`, { idUsuario });
      if (!data?.exito) throw new Error(data?.mensaje || "No se pudo eliminar.");

      setOpenDel(false);
      setSelectedRow(null);

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q, offset: 0, append: false, mode: "initial" });

      await refreshPeriodos();
      showToast("exito", "Compra eliminada.", 2600);
    } catch (e) {
      showToast("error", e?.message || "Error eliminando compra.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingRows || loadingMore || loadingAll || loadingListsCtx) return;
    if (nextOffset === null) return;

    const currentPer = periodoToMMYYYY(fPeriodo);
    const currentQ = (q || "").trim();

    showToast("cargando", "Cargando más…", 6000);
    await loadRows({
      periodo: currentPer,
      q: currentQ,
      offset: nextOffset,
      append: true,
      mode: "more",
    });
  }, [hasMore, loadingRows, loadingMore, loadingAll, loadingListsCtx, nextOffset, fPeriodo, q, loadRows, showToast]);

  // ✅ CARGAR TODOS
  const handleLoadAll = useCallback(async () => {
    if (!hasMore || loadingRows || loadingMore || loadingAll || loadingListsCtx) return;
    if (nextOffset === null) return;

    setLoadingAll(true);
    showToast("cargando", "Cargando todas las compras…", 12000);

    let offset = nextOffset;
    let guard = 0;

    const seen = new Set(
      (Array.isArray(rows) ? rows : [])
        .map((x) => getRowId(x))
        .filter((id) => id !== null && id !== undefined)
        .map(String)
    );

    let finishedOk = false;
    let stoppedNoProgress = false;

    try {
      while (offset !== null && guard < 3000) {
        const currentPer = periodoToMMYYYY(fPeriodo);
        const currentQ = (q || "").trim();

        const res = await loadRows({
          periodo: currentPer,
          q: currentQ,
          offset,
          append: true,
          mode: "all",
          seenIds: seen,
        });

        if (!res) break;

        (res.pageIds || []).forEach((id) => seen.add(String(id)));

        if (res.hasMore && res.appended === 0) {
          stoppedNoProgress = true;
          break;
        }
        if (res.nextOffset === offset) {
          stoppedNoProgress = true;
          break;
        }

        offset = res.nextOffset;
        guard += 1;

        if (!res.hasMore || offset === null) {
          finishedOk = true;
          break;
        }
      }

      if (finishedOk) {
        showToast("exito", "Listo: ya se cargaron todas.", 2600);
      } else if (stoppedNoProgress) {
        showToast(
          "error",
          "Se detuvo: el backend no está avanzando el paginado (next_offset/has_more). Revisá el endpoint compras_listar.",
          6500
        );
      } else {
        showToast("error", "No se pudo completar la carga total.", 4200);
      }
    } catch (e) {
      showToast("error", e?.message || "Error cargando todas.", 4200);
    } finally {
      setLoadingAll(false);
    }
  }, [hasMore, loadingRows, loadingMore, loadingAll, loadingListsCtx, nextOffset, fPeriodo, q, loadRows, showToast, rows]);

  const softLoading = loadingRows && showSkeleton;
  const lists = listasCtx || { periodos: [] };

  const handleChangePeriodo = async (valueUI) => {
    const ui = periodoToMMYYYY(valueUI);

    skipSearchRef.current = true;

    setReady(false);
    setFPeriodo(ui);
    setQ("");

    await loadRows({ periodo: ui, q: "", offset: 0, append: false, mode: "initial" });
  };

  const renderSkeletonRow = (idx) => (
    <div
      key={`skel-${idx}`}
      className="mov-gridTable mov-gridTable--row mov-row--skeleton"
      style={{ gridTemplateColumns: gridCols }}
      role="row"
      aria-hidden="true"
    >
      {columns.map((c) => (
        <div
          key={c.key}
          className={["mov-gridCell", c.align === "center" ? "is-center" : "", c.align === "right" ? "is-right" : ""].join(" ")}
          role="cell"
          data-label={c.label}
        >
          <span className="mov-skeletonBar" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );

  // ✅ si hay 100 exactos, mostrar SOLO cargar todos
  const showLoadMoreBtn = !loadingRows && hasMore && filteredRows.length > 0 && filteredRows.length < PAGE_SIZE;
  const showLoadAllBtn = !loadingRows && hasMore && filteredRows.length > 0;

  const canShowEmpty = ready && !loadingRows && !loadingListsCtx && filteredRows.length === 0;

  return (
    <div className="mov-page mov-page--compras">
      {toast && <Toast tipo={toast.tipo} mensaje={toast.mensaje} duracion={toast.duracion} onClose={closeToast} />}

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
              <div className="mov-card__title">Movimientos · Compras</div>
              <div className="mov-card__hint">
                Mostrando <b>{filteredRows.length}</b> registros{hasMore ? " (hay más)" : ""}
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
                        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                        skipSearchRef.current = true;
                        await loadRows({
                          periodo: fPeriodo,
                          q: e.currentTarget.value,
                          offset: 0,
                          append: false,
                          mode: "initial",
                        });
                      }
                    }}
                    placeholder="Buscar por proveedor, descripción, monto, fecha…"
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
                        await loadRows({ periodo: fPeriodo, q: "", offset: 0, append: false, mode: "initial" });
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
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
            </button>

            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={() => setOpenNueva(true)}
              disabled={!fPeriodo || loadingListsCtx || loadingAll}
              title={!fPeriodo ? "Primero seleccioná un período" : "Crear nueva compra"}
            >
              <FontAwesomeIcon icon={faPlus} /> Nueva Compra
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
              className={["mov-gridCell", "mov-gridCell--head", c.align === "center" ? "is-center" : "", c.align === "right" ? "is-right" : ""].join(
                " "
              )}
              role="columnheader"
            >
              {c.label}
            </div>
          ))}
        </div>

        {/* BODY */}
        <div className="mov-tableWrap mov-tableWrap--compras" role="rowgroup">
          <div className={["mov-gridBody mov-gridBody--relative mov-gridBody--woes", softLoading ? "mov-softLoading" : ""].join(" ")}>
            {showSkeleton && loadingRows ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {filteredRows.map((r) => {
                  const rowId = getRowId(r) ?? `row-${Math.random()}`;
                  const comp = getComprobanteUrl(r);
                  const canSee = !!comp;
                  const isDeleting = deletingId !== null && String(deletingId) === String(rowId);

                  return (
                    <div key={rowId} className="mov-gridTable mov-gridTable--row" style={{ gridTemplateColumns: gridCols }} role="row">
                      <div className="mov-gridCell is-center" role="cell" data-label="FECHA">
                        {safeText(formatFechaDMY(pick(r, ["fecha"], "")))}
                      </div>

                      <div
                        className="mov-gridCell is-strong"
                        role="cell"
                        data-label="DESCRIPCIÓN"
                        title={safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], ""))}
                      >
                        <span className="mov-ellipsissss">{safeText(pick(r, ["detalle", "descripcion", "concepto", "observacion", "item"], ""))}</span>
                      </div>

                      <div
                        className="mov-gridCell"
                        role="cell"
                        data-label="PROVEEDOR"
                        title={safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""))}
                      >
                        <span className="mov-ellipsissss">{safeText(pick(r, ["proveedor", "nombre_proveedor", "razon_social_proveedor"], ""))}</span>
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="PAGO">
                        {safeText(getCompraPagoLabel(r))}
                      </div>

                      <div className="mov-gridCell is-center" role="cell" data-label="TOTAL">
                        {moneyARS(pick(r, ["monto_total", "total", "importe_total", "monto", "importe"], 0))}
                      </div>

                      <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="ACCIONES">
                        <div className="mov-actionsInline">
                          <button
                            type="button"
                            className={`mov-iconBtn ${!canSee ? "is-disabled" : ""}`}
                            title={canSee ? "Ver comprobante" : "Sin comprobante"}
                            onClick={() => canSee && openComprobanteModal(r)}
                            disabled={!canSee || loadingRows || loadingMore || loadingAll || loadingListsCtx}
                          >
                            <FontAwesomeIcon icon={faEye} />
                          </button>

                          <button
                            type="button"
                            className="mov-iconBtn"
                            title="Editar"
                            onClick={() => openEditModal(r)}
                            disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx}
                          >
                            <FontAwesomeIcon icon={faPenToSquare} />
                          </button>

                          <button
                            type="button"
                            className="mov-iconBtn mov-iconBtn--danger"
                            title="Eliminar"
                            disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx || isDeleting}
                            onClick={() => openDeleteModal(r)}
                          >
                            {isDeleting ? "..." : <FontAwesomeIcon icon={faTrashCan} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ✅ EMPTY (solo cuando terminó la carga) */}
                {canShowEmpty && (
                  <div className="mov-emptyRow">
                    {!fPeriodo ? "No hay período disponible para cargar compras." : "No hay compras para mostrar en este período."}
                  </div>
                )}

                {/* BOTONES */}
                {!loadingRows && filteredRows.length > 0 && hasMore && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "12px 0" }}>
                    {showLoadMoreBtn && (
                      <button
                        type="button"
                        className="mov-btn mov-btn--ghost"
                        onClick={handleLoadMore}
                        disabled={loadingMore || loadingRows || loadingAll || loadingListsCtx}
                        title="Cargar 100 registros más"
                      >
                        {loadingMore ? "Cargando…" : "Cargar más"}
                      </button>
                    )}

                    {showLoadAllBtn && (
                      <button
                        type="button"
                        className="mov-btn mov-btn--loadAll"
                        onClick={handleLoadAll}
                        disabled={loadingMore || loadingRows || loadingAll || loadingListsCtx}
                        title="Cargar todas las compras restantes"
                      >
                        {loadingAll ? "Cargando todas…" : "Cargar todos"}
                      </button>
                    )}
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

      {/* MODALES */}
      <ModalNuevaCompra
        open={openNueva}
        lists={listasCtx || { periodos: [] }}
        onClose={() => setOpenNueva(false)}
        onToast={showToast}
        onSaved={async (info) => {
          const per = info?.periodoUI || info?.periodo || info?.periodoApi || fPeriodo;
          await refreshAfterSave(per);
          showToast("exito", "Compra creada.", 2200);
        }}
      />

      <ModalEditarCompra
        open={openEdit}
        lists={listasCtx || { periodos: [] }}
        row={selectedRow}
        periodoDefault={fPeriodo}
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onToast={showToast}
        onSave={handleSaveEdit} // ✅ AHORA SI: guarda en backend
      />

      <ModalVerComprobante open={openVerComp} url={compUrl} onClose={closeComprobanteModal} title="Comprobante de compra" />

      <ModalEliminarMovimientos
        open={openDel}
        row={selectedRow}
        loading={deletingId !== null && String(deletingId) === String(getRowId(selectedRow))}
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
