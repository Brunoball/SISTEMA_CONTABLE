// src/context/DateRangeContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import BASE_URL from "../config/config";

// ─── helpers de rango ────────────────────────────────────────────────────────

function rangoMesCompleto() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to:   new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

function rangoDiasAtras(dias) {
  const d    = Math.max(1, Math.min(Number(dias) || 10, 365));
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - d);
  to.setHours(23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function buildRangeFromConfig(config) {
  if (!config) return rangoMesCompleto();
  if (config.modo === "dias_atras") return rangoDiasAtras(config.dias_atras ?? 10);
  return rangoMesCompleto();
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

function getLocalCachedConfig() {
  try {
    const raw = sessionStorage.getItem("cfg_calendario");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalCachedConfig(cfg) {
  try {
    sessionStorage.setItem("cfg_calendario", JSON.stringify(cfg));
  } catch {}
}

const DEFAULT_CONFIG = { modo: "mes_completo", dias_atras: 10 };

function initialState() {
  const cached = getLocalCachedConfig();
  const config = cached ?? DEFAULT_CONFIG;
  return {
    dateRange:      buildRangeFromConfig(config),
    calendarConfig: config,
    configLoaded:   !!cached,
  };
}

// ─── contexto ────────────────────────────────────────────────────────────────

const DateRangeContext = createContext(null);

export function DateRangeProvider({ children }) {
  const init = initialState();

  const [dateRange,      setDateRange]      = useState(init.dateRange);
  const [calendarConfig, setCalendarConfig] = useState(init.calendarConfig);
  const [configLoaded,   setConfigLoaded]   = useState(init.configLoaded);

  const userTouchedRange = useRef(false);

  // ── maxDate: hoy si el modo es dias_atras, null si es mes_completo ───────
  const maxDate = useMemo(() => {
    if (calendarConfig?.modo === "dias_atras") {
      const hoy = new Date();
      hoy.setHours(23, 59, 59, 999);
      return hoy;
    }
    return null;
  }, [calendarConfig?.modo]);

  // ── cargar config desde API ──────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    async function fetchConfig() {
      const tenantId = getTenantId();
      if (!tenantId) { setConfigLoaded(true); return; }

      try {
        const sessionKey = getSessionKey();
        const headers    = sessionKey ? { "X-Session": sessionKey } : {};

        const url =
          `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php` +
          `?action=configuracion_calendario_get&idTenant=${encodeURIComponent(tenantId)}`;

        const res  = await fetch(url, { method: "GET", headers });
        const data = await res.json().catch(() => null);

        if (!alive) return;

        if (data?.exito && data?.config) {
          const cfg = {
            modo:       data.config.modo       ?? "mes_completo",
            dias_atras: Number(data.config.dias_atras ?? 10),
          };
          saveLocalCachedConfig(cfg);
          setCalendarConfig(cfg);
          if (!userTouchedRange.current) {
            setDateRange(buildRangeFromConfig(cfg));
          }
        }
      } catch {
        // fallback al estado inicial
      } finally {
        if (alive) setConfigLoaded(true);
      }
    }

    fetchConfig();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── setter público que marca interacción de usuario ──────────────────────
  const setDateRangeUser = useCallback((newRange) => {
    userTouchedRange.current = true;
    setDateRange(newRange);
  }, []);

  // ── cuando se guarda una nueva config desde el panel ────────────────────
  const applyCalendarConfig = useCallback((cfg) => {
    saveLocalCachedConfig(cfg);
    setCalendarConfig(cfg);
    userTouchedRange.current = false;
    setDateRange(buildRangeFromConfig(cfg));
  }, []);

  return (
    <DateRangeContext.Provider
      value={{
        dateRange,
        setDateRange: setDateRangeUser,
        calendarConfig,
        configLoaded,
        maxDate,              // null en mes_completo | Date(hoy 23:59:59) en dias_atras
        applyCalendarConfig,
      }}
    >
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange debe usarse dentro de DateRangeProvider");
  return ctx;
}
