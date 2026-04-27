import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import BASE_URL from "../config/config";

// ─── helpers de fecha ────────────────────────────────────────────────────────

function startOfDay(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeDiasAtras(dias) {
  return Math.max(0, Math.min(Number(dias) || 0, 365));
}

function sameDay(a, b) {
  const da = startOfDay(a);
  const db = startOfDay(b);

  if (!da || !db) return false;

  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function sameRange(a, b) {
  if (!a || !b) return false;
  return sameDay(a.from, b.from) && sameDay(a.to, b.to);
}

// ─── helpers de rango ────────────────────────────────────────────────────────

function rangoMesCompleto() {
  const now = new Date();

  return {
    from: startOfMonth(now),
    to: endOfMonth(now),
  };
}

function rangoDiasAtras(dias) {
  const d = normalizeDiasAtras(dias);

  const to = endOfDay(new Date());
  const from = startOfDay(new Date());

  from.setDate(from.getDate() - d);

  return { from, to };
}

function buildRangeFromConfig(config) {
  if (!config) return rangoMesCompleto();

  if (config.modo === "dias_atras") {
    return rangoDiasAtras(config.dias_atras ?? 10);
  }

  return rangoMesCompleto();
}

function normalizeConfig(config) {
  const modo = ["mes_completo", "dias_atras"].includes(config?.modo)
    ? config.modo
    : "mes_completo";

  const dias_atras = normalizeDiasAtras(config?.dias_atras ?? 10);

  return {
    modo,
    dias_atras,
  };
}

/**
 * Sanitiza cualquier rango que venga de una vista.
 *
 * Esto es lo importante:
 * si el modo es "dias_atras", ninguna sección puede pisar el rango global
 * con una fecha vieja guardada en localStorage/sessionStorage.
 */
function sanitizeRangeForConfig(range, config) {
  const cfg = normalizeConfig(config);

  if (cfg.modo === "dias_atras") {
    return rangoDiasAtras(cfg.dias_atras);
  }

  const from = startOfDay(range?.from);
  const to = endOfDay(range?.to);

  if (!from || !to) {
    return buildRangeFromConfig(cfg);
  }

  if (from > to) {
    return {
      from: startOfDay(to),
      to: endOfDay(from),
    };
  }

  return { from, to };
}

function getConfigSignature(config) {
  const cfg = normalizeConfig(config);
  return `${cfg.modo}_${cfg.dias_atras}`;
}

// ─── helpers de sesión ───────────────────────────────────────────────────────

function getSessionKey() {
  return (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    ""
  ).trim();
}

function getTenantId() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null") || {};

    return (
      u?.idTenant ||
      u?.id_tenant ||
      u?.tenant_id ||
      u?.tenant?.idTenant ||
      ""
    );
  } catch {
    return "";
  }
}

// ─── caché en sessionStorage ─────────────────────────────────────────────────

const CACHE_KEY = "cfg_calendario_v2";

function getLocalCachedConfig() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return normalizeConfig(parsed);
  } catch {
    return null;
  }
}

function saveLocalCachedConfig(cfg) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(normalizeConfig(cfg)));

    // Limpio caché vieja para que no quede arrastrando datos anteriores.
    sessionStorage.removeItem("cfg_calendario");
  } catch {
    // sin acción
  }
}

const DEFAULT_CONFIG = { modo: "mes_completo", dias_atras: 10 };

function initialState() {
  const cached = getLocalCachedConfig();
  const config = cached ?? DEFAULT_CONFIG;
  const cleanConfig = normalizeConfig(config);

  return {
    dateRange: buildRangeFromConfig(cleanConfig),
    calendarConfig: cleanConfig,
    configLoaded: !!cached,
  };
}

// ─── contexto ────────────────────────────────────────────────────────────────

const DateRangeContext = createContext(null);

export function DateRangeProvider({ children }) {
  const init = initialState();

  const [dateRange, setDateRangeState] = useState(init.dateRange);
  const [calendarConfig, setCalendarConfig] = useState(init.calendarConfig);
  const [configLoaded, setConfigLoaded] = useState(init.configLoaded);

  const userTouchedRange = useRef(false);
  const lastConfigSignature = useRef(getConfigSignature(init.calendarConfig));

  // ── maxDate: hoy si el modo es dias_atras, null si es mes_completo ───────

  const maxDate = useMemo(() => {
    if (calendarConfig?.modo === "dias_atras") {
      return endOfDay(new Date());
    }

    return null;
  }, [calendarConfig?.modo]);

  // ── rango permitido por configuración ─────────────────────────────────────

  const enforcedRange = useMemo(() => {
    return buildRangeFromConfig(calendarConfig);
  }, [calendarConfig]);

  // ── setter interno seguro ─────────────────────────────────────────────────

  const setSafeDateRange = useCallback(
    (range) => {
      const sanitized = sanitizeRangeForConfig(range, calendarConfig);

      setDateRangeState((prev) => {
        if (sameRange(prev, sanitized)) return prev;
        return sanitized;
      });
    },
    [calendarConfig]
  );

  // ── cargar config desde API ───────────────────────────────────────────────

  useEffect(() => {
    let alive = true;

    async function fetchConfig() {
      const tenantId = getTenantId();

      if (!tenantId) {
        if (alive) setConfigLoaded(true);
        return;
      }

      try {
        const sessionKey = getSessionKey();
        const headers = sessionKey ? { "X-Session": sessionKey } : {};

        const url =
          `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php` +
          `?action=configuracion_calendario_get&idTenant=${encodeURIComponent(
            tenantId
          )}`;

        const res = await fetch(url, { method: "GET", headers });
        const data = await res.json().catch(() => null);

        if (!alive) return;

        if (data?.exito && data?.config) {
          const cfg = normalizeConfig({
            modo: data.config.modo ?? "mes_completo",
            dias_atras: Number(data.config.dias_atras ?? 10),
          });

          const nextSignature = getConfigSignature(cfg);
          const previousSignature = lastConfigSignature.current;
          const configChanged = nextSignature !== previousSignature;

          saveLocalCachedConfig(cfg);
          setCalendarConfig(cfg);
          lastConfigSignature.current = nextSignature;

          /**
           * Si la configuración cambió, se fuerza el rango global.
           * Si no cambió, también se fuerza cuando el modo es dias_atras,
           * porque ese modo no debe permitir rangos viejos guardados por vistas.
           */
          if (configChanged || cfg.modo === "dias_atras" || !userTouchedRange.current) {
            userTouchedRange.current = false;
            setDateRangeState(buildRangeFromConfig(cfg));
          }
        }
      } catch {
        // fallback al estado inicial
      } finally {
        if (alive) setConfigLoaded(true);
      }
    }

    fetchConfig();

    return () => {
      alive = false;
    };
  }, []);

  // ── protección final: si el modo es dias_atras, el rango jamás queda viejo ─

  useEffect(() => {
    if (calendarConfig?.modo !== "dias_atras") return;

    setDateRangeState((prev) => {
      const fixed = buildRangeFromConfig(calendarConfig);
      if (sameRange(prev, fixed)) return prev;
      return fixed;
    });
  }, [calendarConfig]);

  // ── setter público usado por las vistas ────────────────────────────────────

  const setDateRangeUser = useCallback(
    (newRange) => {
      /**
       * Si es modo dias_atras, no dejo que una vista pise el rango global.
       * Esto evita definitivamente casos como:
       * 06/09/2025 → 27/04/2026.
       */
      if (calendarConfig?.modo === "dias_atras") {
        userTouchedRange.current = false;
        setDateRangeState(buildRangeFromConfig(calendarConfig));
        return;
      }

      userTouchedRange.current = true;
      setSafeDateRange(newRange);
    },
    [calendarConfig, setSafeDateRange]
  );

  // ── cuando se guarda una nueva config desde el panel ──────────────────────

  const applyCalendarConfig = useCallback((cfg) => {
    const cleanConfig = normalizeConfig(cfg);

    saveLocalCachedConfig(cleanConfig);
    setCalendarConfig(cleanConfig);

    lastConfigSignature.current = getConfigSignature(cleanConfig);
    userTouchedRange.current = false;

    setDateRangeState(buildRangeFromConfig(cleanConfig));
  }, []);

  // ── método útil por si alguna vista necesita volver al rango global ───────

  const resetDateRangeToGlobalConfig = useCallback(() => {
    userTouchedRange.current = false;
    setDateRangeState(buildRangeFromConfig(calendarConfig));
  }, [calendarConfig]);

  return (
    <DateRangeContext.Provider
      value={{
        dateRange,
        setDateRange: setDateRangeUser,
        calendarConfig,
        configLoaded,
        maxDate,
        enforcedRange,
        applyCalendarConfig,
        resetDateRangeToGlobalConfig,
      }}
    >
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);

  if (!ctx) {
    throw new Error("useDateRange debe usarse dentro de DateRangeProvider");
  }

  return ctx;
}