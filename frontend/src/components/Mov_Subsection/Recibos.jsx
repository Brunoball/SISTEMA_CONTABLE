// src/components/Movimientos/Recibos.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import "../Global/Global_Section.css";

import Toast from "../Global/Toast.jsx";

import ModalEditarRecibo from "./modales/ModalEditarRecibo";
import ModalPagarRecibos from "./modales/ModalPagarRecibos";
import ModalEliminarMovimientos from "../Movimientos/modales/ModalEliminarMovimientos";

// ✅ NUEVO: Ver comprobante
import ModalVerComprobante from "../Mov_Subsection/modales/ModalVerComprobante";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faMagnifyingGlass,
  faFileExcel,
  faPenToSquare,
  faTrashCan,
  faMoneyBill1Wave,
  faEye,
} from "@fortawesome/free-solid-svg-icons";

import * as XLSX from "xlsx";
import { useListas } from "../../context/ListasContext";

/* =========================
   PERF
========================= */
const PAGE_SIZE = 100;
const MIN_LOADING_MS = 0;
const FORCE_SHOW_LOADER_DEV = false;

/* =========================
   Skeleton rows
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
    return `$${Number(n).toFixed(2)}`;
  }
}
function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "-";
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
   ✅ Auth (X-Session)
========================= */
function getAuthInfo() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand = u?.idUsuarioMaster ?? u?.idUsuario ?? u?.id_usuario ?? u?.id ?? u?.user_id ?? 0;
    if (Number.isFinite(Number(cand))) idUsuario = Number(cand);
  } catch {}

  return { sessionKey, idUsuario };
}

/* =========================
   ✅ Recibos (PAGADO/PENDIENTE)
========================= */
function isReciboPagado(row) {
  if (row?.pagado === true) return true;
  const cob = Number(row?.cobrado_total ?? 0);
  if (Number.isFinite(cob) && cob > 0.00001) return true;
  return false;
}

/* =========================
   Excel
========================= */
function slugifySheetName(name) {
  const s = String(name || "Recibos")
    .replace(/[\[\]\*\/\\\?\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "Recibos").slice(0, 31);
}

/* =========================
   detect backend "acción no válida"
========================= */
function isAccionNoValidaErrorMessage(msg) {
  const s = String(msg || "").toLowerCase();
  return (
    s.includes("acción no válida") ||
    s.includes("accion no valida") ||
    s.includes("action no válida") ||
    s.includes("action no valida")
  );
}

export default function Recibos() {
  const API = `${BASE_URL}/api.php`;

  // ✅ LISTAS CENTRALIZADAS
  const {
    lists: listasCtx,
    loadingLists: loadingListsCtx,
    errorLists: errorListsCtx,
    ensureListsLoaded,
    refreshLists,
  } = useListas();

  /* =========================
     STATE
  ========================= */
  const [rows, setRows] = useState([]);

  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const [fPeriodo, setFPeriodo] = useState(""); // MM-YYYY
  const [q, setQ] = useState("");

  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  const [openEdit, setOpenEdit] = useState(false);
  const [openDel, setOpenDel] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  // pagar
  const [openPagar, setOpenPagar] = useState(false);
  const [pagarCliente, setPagarCliente] = useState(null);
  const [pagarDeudas, setPagarDeudas] = useState([]);
  const [loadingClienteDeudas, setLoadingClienteDeudas] = useState(false);

  // ✅ ver comprobante (SERVER URL REAL, NO blob)
  const [openVer, setOpenVer] = useState(false);
  const [verUrl, setVerUrl] = useState("");
  const [verMime, setVerMime] = useState("");
  const [verTitle, setVerTitle] = useState("Comprobante");

  // toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((tipo, mensaje, duracion = 2800) => {
    setToast({ tipo, mensaje, duracion });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const cacheRef = useRef(new Map());
  const reqIdRef = useRef(0);

  const searchTimerRef = useRef(null);
  const skipSearchRef = useRef(false);
  const [uiPending, setUiPending] = useState(false);
  const didInitRef = useRef(false);

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
      const data = await parseJsonOrThrow(res);
      if (data?.exito === false) throw new Error(data?.mensaje || "Operación fallida.");
      return data;
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
      const data = await parseJsonOrThrow(res);
      if (data?.exito === false) throw new Error(data?.mensaje || "Operación fallida.");
      return data;
    },
    [buildHeaders, parseJsonOrThrow]
  );

  const invalidateCacheForPeriodo = useCallback((periodoUI) => {
    const periodoAPI = periodoToYYYYMM(periodoUI);
    const prefix = `${periodoAPI}|`;
    for (const k of cacheRef.current.keys()) {
      if (String(k).startsWith(prefix)) cacheRef.current.delete(k);
    }
  }, []);

  /* =========================
     ✅ VER COMPROBANTE (SIN BLOB)
     - iframe no puede mandar headers => usamos ?session_key=
  ========================= */
  const openVerComprobante = useCallback(
    async (row) => {
      const idComp = Number(row?.id_comprobante || 0);
      if (!idComp) {
        showToast("error", "Este recibo no tiene comprobante asociado.", 2800);
        return;
      }

      const { sessionKey } = getAuthInfo();
      if (!sessionKey) {
        showToast("error", "Sesión inválida (no hay X-Session).", 3200);
        return;
      }

      const sp = new URLSearchParams();
      sp.set("action", "comprobantes_descargar");
      sp.set("id_comprobante", String(idComp));
      sp.set("session_key", sessionKey); // ✅ para iframe/nueva pestaña (sin headers)

      const serverUrl = `${API}?${sp.toString()}`;

      setVerTitle(`Comprobante · ${safeText(row?.cliente)}`);
      setVerMime(String(row?.comprobante_mime || row?.mime || "")); // opcional si lo traés del backend
      setVerUrl(serverUrl);
      setOpenVer(true);
    },
    [API, showToast]
  );

  const closeVerComprobante = useCallback(() => {
    setOpenVer(false);
    setVerUrl("");
    setVerMime("");
    setVerTitle("Comprobante");
  }, []);

  /* =========================
     ✅ LOAD ROWS (lista principal)
  ========================= */
  const loadRows = useCallback(
    async (opts = {}) => {
      const periodoUI = typeof opts.periodo === "string" ? opts.periodo : fPeriodo;
      const qLocal = typeof opts.q === "string" ? opts.q : q;

      const append = !!opts.append;
      const offset = Number.isFinite(Number(opts.offset)) ? Number(opts.offset) : 0;

      const perUI = periodoToMMYYYY(periodoUI);
      if (!perUI) {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setLoadingMore(false);
        setLoadingAll(false);
        setError("");
        setUiPending(false);
        return { hasMore: false, nextOffset: null, received: 0 };
      }

      const periodoAPI = periodoToYYYYMM(perUI);
      const qKey = (qLocal || "").trim();
      const cacheKey = `${periodoAPI}|${qKey}`;

      const myReqId = ++reqIdRef.current;
      const start = Date.now();

      if (!append) setUiPending(true);

      if (!append) setLoadingRows(true);
      else setLoadingMore(true);

      setError("");

      try {
        if (!append && offset === 0 && cacheRef.current.has(cacheKey) && !FORCE_SHOW_LOADER_DEV) {
          const cached = cacheRef.current.get(cacheKey);
          setRows(cached?.rows || []);
          setHasMore(!!cached?.hasMore);
          setNextOffset(cached?.nextOffset ?? null);
          setLoadingRows(false);
          if (myReqId === reqIdRef.current) setUiPending(false);
          return {
            hasMore: !!cached?.hasMore,
            nextOffset: cached?.nextOffset ?? null,
            received: Array.isArray(cached?.rows) ? cached.rows.length : 0,
          };
        }

        const sp = new URLSearchParams();
        sp.set("action", "recibos_listar");
        sp.set("periodo", periodoAPI);
        if (qKey) sp.set("q", qKey);
        sp.set("limit", String(PAGE_SIZE));
        sp.set("offset", String(offset));

        const data = await apiGet(`${API}?${sp.toString()}`);

        if (myReqId !== reqIdRef.current) {
          if (append) setLoadingMore(false);
          else setLoadingRows(false);
          return null;
        }

        const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
        const movsNorm = movs.map((r) => ({ ...r, periodo: periodoToMMYYYY(r?.periodo) }));

        const newHasMore = !!data.has_more;
        const newNextOffset =
          data.next_offset !== undefined && data.next_offset !== null ? Number(data.next_offset) : null;

        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_LOADING_MS - elapsed);

        return await new Promise((resolve) => {
          const apply = () => {
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

            if (append) setLoadingMore(false);
            else setLoadingRows(false);

            if (myReqId === reqIdRef.current) setUiPending(false);

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
            if (myReqId !== reqIdRef.current) {
              if (append) setLoadingMore(false);
              else setLoadingRows(false);
              resolve(null);
              return;
            }

            setError(e.message || "Error cargando recibos.");
            if (append) setLoadingMore(false);
            else setLoadingRows(false);

            if (myReqId === reqIdRef.current) setUiPending(false);

            resolve(null);
          }, remaining);
        });
      }
    },
    [API, apiGet, fPeriodo, q]
  );

  /* =========================
     ✅ INIT
  ========================= */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await ensureListsLoaded({ force: false, background: true });
      } catch {}

      if (!alive) return;

      const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos.map(periodoToMMYYYY) : [];
      const perDefault = periodos[0] || "";

      if (perDefault) {
        skipSearchRef.current = true;
        setFPeriodo((prev) => prev || perDefault);
        await loadRows({ periodo: perDefault, q: "", offset: 0, append: false });
      } else {
        setRows([]);
        setHasMore(false);
        setNextOffset(null);
        setLoadingRows(false);
        setUiPending(false);
      }

      if (alive) didInitRef.current = true;
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ sync período si desaparece
  useEffect(() => {
    const periodos = Array.isArray(listasCtx?.periodos) ? listasCtx.periodos.map(periodoToMMYYYY) : [];

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

  // ✅ debounce búsqueda
  useEffect(() => {
    if (!fPeriodo) return;
    if (!didInitRef.current) return;

    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    setUiPending(true);

    searchTimerRef.current = setTimeout(async () => {
      await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [q, fPeriodo, loadRows]);

  /* =========================
     visibles
  ========================= */
  const filteredRows = useMemo(() => {
    const fPer = periodoToMMYYYY(fPeriodo);
    if (!fPer) return [];

    return (Array.isArray(rows) ? rows : []).filter((r) => {
      const perRow = periodoToMMYYYY(r?.periodo);
      if (!perRow) return true;
      return String(perRow) === String(fPer);
    });
  }, [rows, fPeriodo]);

  const stats = useMemo(() => {
    let pagados = 0;
    let pendientes = 0;
    for (const r of filteredRows) {
      if (isReciboPagado(r)) pagados++;
      else pendientes++;
    }
    return { pagados, pendientes, total: filteredRows.length };
  }, [filteredRows]);

  /* =========================
     Columnas
  ========================= */
  const columns = useMemo(() => {
    return [
      { key: "fecha", label: "FECHA", align: "center", fr: 0.9, render: (r) => safeText(formatFechaDMY(r.fecha)) },
      {
        key: "detalle",
        label: "DESCRIPCION",
        fr: 2.4,
        strong: true,
        align: "left",
        render: (r) => safeText(r.detalle ?? r.descripcion ?? r.concepto),
      },
      { key: "cliente", label: "CLIENTE", fr: 1.7, align: "center", render: (r) => safeText(r.cliente) },
      {
        key: "estado",
        label: "ESTADO",
        fr: 0.9,
        align: "center",
        render: (r) => {
          const pag = isReciboPagado(r);
          return (
            <span className={`mov-chip ${pag ? "mov-chip--ok" : "mov-chip--warn"}`}>
              {pag ? "PAGADO" : "PENDIENTE"}
            </span>
          );
        },
      },
      { key: "monto", label: "MONTO", fr: 1.1, align: "center", render: (r) => moneyARS(r.monto_total ?? r.total ?? 0) },
      { key: "acciones", label: "ACCIONES", fr: 0.9, align: "center", render: () => null },
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
     ✅ FIX IMPORTANTE:
     Traer registros del cliente con fallback de action
  ========================= */
  const fetchRecibosCliente = useCallback(
    async (rowCliente) => {
      const idCli = Number(rowCliente?.id_cliente || 0);
      if (!idCli) throw new Error("El registro no tiene id_cliente.");

      const ACTIONS = [
        "recibos_cliente_listar",
        "recibos_listar_cliente",
        "recibos_cliente",
        "recibos_listar_por_cliente",
      ];

      let lastErr = null;

      for (const action of ACTIONS) {
        try {
          const sp = new URLSearchParams();
          sp.set("action", action);
          sp.set("id_cliente", String(idCli));

          const data = await apiGet(`${API}?${sp.toString()}`);
          const movs = Array.isArray(data.movimientos) ? data.movimientos : [];
          return movs;
        } catch (e) {
          const msg = e?.message || "";
          if (isAccionNoValidaErrorMessage(msg)) {
            lastErr = e;
            continue;
          }
          throw e;
        }
      }

      throw new Error(
        `Tu backend no tiene ninguna action de listar recibos por cliente.\nProbé: ${ACTIONS.join(", ")}.\n` +
          `Solución: agregá esa action en api.php o decime cuál nombre usaste.`
      );
    },
    [API, apiGet]
  );

  const openPagarModal = useCallback(
    async (r) => {
      try {
        setLoadingClienteDeudas(true);
        const deudas = await fetchRecibosCliente(r);

        setPagarCliente(r);
        setPagarDeudas(deudas);
        setOpenPagar(true);
      } catch (e) {
        showToast("error", e?.message || "No se pudieron cargar los registros del cliente.", 5200);
      } finally {
        setLoadingClienteDeudas(false);
      }
    },
    [fetchRecibosCliente, showToast]
  );

  /* =========================
     Confirmar pago
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

        const { idUsuario } = getAuthInfo();

        const data = await apiPostJson(`${API}?action=recibos_confirmar_pago`, {
          ids_movimiento: ids,
          id_medio_pago: Number(payload?.id_medio_pago || payload?.idMedioPago || 0),
          idUsuario,
        });

        invalidateCacheForPeriodo(fPeriodo);
        await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });

        try {
          await refreshLists();
        } catch {}

        showToast("exito", data?.mensaje || "Pago confirmado.", 2400);
      } catch (e) {
        showToast("error", e?.message || "Error confirmando pago.", 4200);
        throw e;
      }
    },
    [API, apiPostJson, fPeriodo, q, invalidateCacheForPeriodo, loadRows, refreshLists, showToast]
  );

  /* =========================
     ✅ Eliminar
  ========================= */
  const confirmDelete = async () => {
    if (!selectedRow?.id_movimiento) return;

    const id = selectedRow.id_movimiento;
    setDeletingId(id);
    setError("");
    showToast("cargando", "Eliminando…", 12000);

    try {
      const { idUsuario } = getAuthInfo();

      const sp = new URLSearchParams();
      sp.set("action", "recibos_eliminar");
      sp.set("id_movimiento", String(id));

      await apiPostJson(`${API}?${sp.toString()}`, { idUsuario });

      setOpenDel(false);
      setSelectedRow(null);

      invalidateCacheForPeriodo(fPeriodo);
      await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });

      try {
        await refreshLists();
      } catch {}

      showToast("exito", "Registro eliminado.", 2400);
    } catch (e) {
      setError(e.message || "Error eliminando.");
      showToast("error", e.message || "Error eliminando.", 4200);
    } finally {
      setDeletingId(null);
    }
  };

  /* =========================
     Excel
  ========================= */
  const exportToExcel = useCallback(() => {
    try {
      if (!filteredRows.length) {
        showToast("error", "No hay datos para exportar.", 2500);
        return;
      }

      if (hasMore) {
        showToast(
          "error",
          "Ojo: faltan recibos sin cargar. Si querés exportar todo, tocá “Cargar todos” primero.",
          5200
        );
      }

      const dataToExport = filteredRows.map((r) => ({
        FECHA: safeText(formatFechaDMY(r.fecha)),
        DESCRIPCION: safeText(r.detalle ?? r.descripcion ?? r.concepto),
        CLIENTE: safeText(r.cliente),
        ESTADO: isReciboPagado(r) ? "PAGADO" : "PENDIENTE",
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
      XLSX.utils.book_append_sheet(wb, ws, slugifySheetName(`Recibos_${per}`));
      XLSX.writeFile(wb, `recibos_${per}.xlsx`);

      showToast("exito", "Excel exportado.", 2200);
    } catch (e) {
      showToast("error", e?.message || "Error exportando Excel.", 3500);
    }
  }, [filteredRows, fPeriodo, showToast, hasMore]);

  /* =========================
     ✅ BOTÓN: "Cargar todos"
  ========================= */
  const handleLoadAll = useCallback(async () => {
    if (!hasMore || loadingMore || loadingRows || loadingListsCtx) return;
    if (nextOffset === null) return;

    setLoadingAll(true);
    showToast("cargando", "Cargando todos los recibos…", 12000);

    let offset = nextOffset;
    let guard = 0;

    try {
      while (offset !== null && guard < 3000) {
        const currentPer = periodoToMMYYYY(fPeriodo);
        const currentQ = (q || "").trim();

        const res = await loadRows({ periodo: currentPer, q: currentQ, offset, append: true });
        if (!res) break;

        offset = res.nextOffset;
        guard += 1;

        if (!res.hasMore || offset === null) break;
      }

      showToast("exito", "Listo: ya se cargaron todos.", 2600);
    } catch (e) {
      showToast("error", e?.message || "Error cargando todos.", 4200);
    } finally {
      setLoadingAll(false);
    }
  }, [hasMore, loadingMore, loadingRows, loadingListsCtx, nextOffset, fPeriodo, q, loadRows, showToast]);

  const softLoading = loadingRows;

  const skelWidths = useMemo(() => {
    return {
      fecha: ["46%", "38%", "42%", "34%"],
      detalle: ["72%", "58%", "66%", "48%"],
      cliente: ["62%", "54%", "46%", "58%"],
      estado: ["44%", "34%", "40%", "30%"],
      monto: ["38%", "30%", "34%", "28%"],
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

  const lists =
    listasCtx || {
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

  const periodoUI = periodoToMMYYYY(fPeriodo);
  const isInit = loadingListsCtx || !periodoUI;

  const showEmpty =
    !isInit &&
    !uiPending &&
    !loadingRows &&
    !loadingMore &&
    !loadingAll &&
    filteredRows.length === 0;

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
              <div className="mov-card__title">Movimientos · Recibos</div>
              <div className="mov-card__hint">
                Total <b>{stats.total}</b> · Pendientes <b>{stats.pendientes}</b> · Pagados <b>{stats.pagados}</b>
                {" · "}
                Mostrando <b>{filteredRows.length}</b>
                {hasMore ? " (hay más)" : ""}
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

                    setUiPending(true);
                    setFPeriodo(ui);
                    setQ("");

                    skipSearchRef.current = true;

                    await loadRows({ periodo: ui, q: "", offset: 0, append: false });
                  }}
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

                        setUiPending(true);

                        skipSearchRef.current = true;
                        await loadRows({
                          periodo: fPeriodo,
                          q: e.currentTarget.value,
                          offset: 0,
                          append: false,
                        });
                      }
                    }}
                    placeholder="Buscar por fecha, cliente, descripción, monto…"
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

                        setUiPending(true);

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
              <FontAwesomeIcon icon={faFileExcel} /> Exportar Excel
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
        <div className="mov-tableWrap mov-table---Wrap" role="rowgroup">
          <div className={["mov-gridBody mov-gridBody--relative", softLoading ? "mov-softLoading" : ""].join(" ")}>
            {loadingRows ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => renderSkeletonRow(i))}
              </div>
            ) : (
              <>
                {filteredRows.map((r) => {
                  const pagado = isReciboPagado(r);
                  const hasComp = Number(r?.id_comprobante || 0) > 0;

                  return (
                    <div
                      key={r.id_movimiento}
                      className={`mov-gridTable mov-gridTable--row ${pagado ? "mov-row--paid" : ""}`}
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
                                {/* ✅ VER COMPROBANTE (SERVER URL REAL) */}
                                <button
                                  type="button"
                                  className={`mov-iconBtn ${!hasComp ? "mov-iconBtn--disabled" : ""}`}
                                  title={hasComp ? "Ver comprobante" : "Sin comprobante"}
                                  onClick={() => hasComp && openVerComprobante(r)}
                                  disabled={!hasComp || loadingRows || loadingMore || loadingAll || loadingListsCtx}
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                </button>

                                <button
                                  type="button"
                                  className="mov-iconBtn"
                                  title="Pagar"
                                  onClick={() => openPagarModal(r)}
                                  disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx || loadingClienteDeudas}
                                >
                                  <FontAwesomeIcon icon={faMoneyBill1Wave} />
                                </button>

                                <button
                                  type="button"
                                  className="mov-iconBtn"
                                  title="Editar"
                                  onClick={() => {
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
                                  disabled={loadingRows || loadingMore || loadingAll || loadingListsCtx || deletingId === r.id_movimiento}
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
                              c.strong ? "is-strong" : "",
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
                  );
                })}

                {showEmpty && <div className="mov-emptyRow">No hay recibos para este período.</div>}

                {!loadingRows && filteredRows.length > 0 && hasMore && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={handleLoadAll}
                      disabled={loadingMore || loadingAll || loadingListsCtx}
                      title="Cargar todos los recibos restantes"
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

      {/* ✅ MODAL VER COMPROBANTE */}
      <ModalVerComprobante open={openVer} url={verUrl} mime={verMime} title={verTitle} onClose={closeVerComprobante} />

      {/* PAGAR */}
      <ModalPagarRecibos
        open={openPagar}
        onClose={() => {
          setOpenPagar(false);
          setPagarCliente(null);
          setPagarDeudas([]);
        }}
        onConfirm={onConfirmPago}
        onToast={showToast}
        cliente={pagarCliente}
        deudas={pagarDeudas}
        lists={lists}
      />

      {/* EDITAR */}
      <ModalEditarRecibo
        open={openEdit}
        row={selectedRow}
        lists={lists}
        periodoDefault={fPeriodo}
        onClose={() => {
          setOpenEdit(false);
          setSelectedRow(null);
        }}
        onToast={showToast}
        onSave={async (payloadFinal) => {
          const { idUsuario } = getAuthInfo();

          const data = await apiPostJson(`${API}?action=recibos_actualizar`, {
            ...payloadFinal,
            idUsuario,
          });

          invalidateCacheForPeriodo(fPeriodo);
          await loadRows({ periodo: fPeriodo, q, offset: 0, append: false });

          try {
            await refreshLists();
          } catch {}

          return data;
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
