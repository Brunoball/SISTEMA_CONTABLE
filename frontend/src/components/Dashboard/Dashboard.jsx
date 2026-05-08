// src/components/Dashboard/Dashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faChartLine,
  faMoneyBillTrendUp,
  faUsers,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";

import GifCarga from "../Global/Gif_Carga";
import "./dashboard.css";
import { useListas } from "../../context/ListasContext";

const EMPTY_DASHBOARD = {
  rango: null,
  kpis: {},
  series_diaria: [],
};

function normalizeRol(value) {
  if (value == null) return "empleado_basico";
  const v = String(value).trim().toLowerCase();
  if (["1", "admin", "administrator", "administrador", "superadmin"].includes(v)) {
    return "admin";
  }
  return "empleado_basico";
}

function normalizePlanNivel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function getUsuarioFromStorage() {
  try {
    const raw = localStorage.getItem("usuario");
    if (!raw) return null;
    const u = JSON.parse(raw);
    if (u) u.rol = normalizeRol(u.rol ?? u.tipo_rol ?? u.id_rol);
    return u || null;
  } catch {
    return null;
  }
}

function getSessionKey(usuario) {
  return (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("x-session") ||
    usuario?.session_key ||
    usuario?.sessionKey ||
    usuario?.token ||
    ""
  );
}

function getApiEndpoint() {
  // Misma idea de conexión que Flujo de Caja:
  // BASE_URL puede venir como /routes o directamente como /routes/api.php.
  const base = String(BASE_URL || "").trim().replace(/\/+$/, "");

  if (!base) return "api.php";
  if (base.endsWith("/api.php") || base.endsWith(".php")) return base;

  return `${base}/api.php`;
}

function buildApiUrl(action, params = {}) {
  const api = getApiEndpoint();
  const query = new URLSearchParams({ action, ...params });
  const separator = api.includes("?") ? "&" : "?";
  return `${api}${separator}${query.toString()}`;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$ 0,00";

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-AR").format(n);
}

function moneyClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return n < 0 ? "is-negative" : "is-positive";
}

function formatDateES(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

function normalizePayload(payload) {
  const data = payload?.data ?? payload ?? {};
  return {
    rango: data.rango ?? null,
    kpis: data.kpis ?? {},
    series_diaria: Array.isArray(data.series_diaria) ? data.series_diaria : [],
  };
}

function DashboardBarChart({ rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const visibleRows = safeRows.length > 18 ? safeRows.slice(-18) : safeRows;
  const maxValue = Math.max(
    1,
    ...visibleRows.map((r) => Number(r.ingresos || 0) + Number(r.egresos || 0))
  );

  if (visibleRows.length === 0) {
    return <div className="db-empty">Todavía no hay movimientos del mes actual para graficar.</div>;
  }

  const gridTemplateColumns = `repeat(${visibleRows.length}, minmax(30px, 1fr))`;
  const minWidth = Math.max(520, visibleRows.length * 48);

  return (
    <div className="db-chart" role="img" aria-label="Ingresos y egresos del mes actual">
      <div className="db-chart__plot" style={{ gridTemplateColumns, minWidth }}>
        {visibleRows.map((row) => {
          const ingresos = Math.max(0, Number(row.ingresos || 0));
          const egresos = Math.max(0, Number(row.egresos || 0));
          const total = ingresos + egresos;
          const totalHeight = Math.max(6, Math.round((total / maxValue) * 210));
          const ingPct = total > 0 ? (ingresos / total) * 100 : 0;
          const egrPct = total > 0 ? (egresos / total) * 100 : 0;

          return (
            <div
              className="db-chart__item"
              key={row.fecha}
              title={`${row.label || row.fecha}\nIngresos: ${formatMoney(ingresos)}\nEgresos: ${formatMoney(egresos)}\nMovimientos: ${formatNumber(row.movimientos || 0)}`}
            >
              <div className="db-chart__bar" style={{ height: `${totalHeight}px` }}>
                {egresos > 0 && (
                  <span
                    className="db-chart__seg db-chart__seg--egresos"
                    style={{ height: `${egrPct}%` }}
                  />
                )}
                {ingresos > 0 && (
                  <span
                    className="db-chart__seg db-chart__seg--ingresos"
                    style={{ height: `${ingPct}%` }}
                  />
                )}
              </div>
              <span className="db-chart__label">{row.label || "-"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { ensureListsLoaded } = useListas();

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [errorDashboard, setErrorDashboard] = useState("");
  const didWarmupRef = useRef(false);
  const abortRef = useRef(null);

  const usuario = useMemo(() => getUsuarioFromStorage(), []);

  const planNivel = useMemo(() => {
    return normalizePlanNivel(usuario?.plan_nivel ?? usuario?.planNivel ?? usuario?.id_plan ?? 1);
  }, [usuario]);

  const fetchDashboard = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingDashboard(true);
    setErrorDashboard("");

    try {
      const sessionKey = getSessionKey(usuario);
      const headers = { Accept: "application/json" };
      if (sessionKey) headers["X-Session"] = sessionKey;

      // Sin pestañas ni filtros: la API devuelve por defecto el mes actual.
      const res = await fetch(buildApiUrl("dashboard_resumen"), {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      const text = await res.text();
      let json = null;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(text?.slice(0, 180) || "La API no devolvió JSON válido.");
      }

      if (!res.ok || json?.exito === false) {
        throw new Error(json?.mensaje || `Error HTTP ${res.status}`);
      }

      setDashboard(normalizePayload(json));
    } catch (error) {
      if (error?.name !== "AbortError") {
        setDashboard(EMPTY_DASHBOARD);
        setErrorDashboard(error?.message || "No se pudo cargar el dashboard.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingDashboard(false);
      }
    }
  }, [usuario]);

  useEffect(() => {
    if (didWarmupRef.current) return;
    didWarmupRef.current = true;

    let alive = true;
    const fallback = setTimeout(() => {
      if (!alive) return;
      setLoadingInicial(false);
    }, 8000);

    (async () => {
      try {
        await ensureListsLoaded({ force: true, background: true });
      } catch {
        // El provider ya maneja el error general de listas.
      } finally {
        if (!alive) return;
        clearTimeout(fallback);
        setLoadingInicial(false);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(fallback);
    };
  }, [ensureListsLoaded]);

  useEffect(() => {
    fetchDashboard();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchDashboard]);

  const kpis = dashboard.kpis || {};
  const rangoDesde = dashboard.rango?.desde ? formatDateES(dashboard.rango.desde) : "";
  const rangoHasta = dashboard.rango?.hasta ? formatDateES(dashboard.rango.hasta) : "";

  const topCards = useMemo(
    () => [
      {
        key: "caja",
        label: "Caja actual",
        value: formatMoney(kpis.saldo_caja_actual),
        detail: "Saldo real acumulado",
        icon: faWallet,
        tone: "green",
        valueClass: moneyClass(kpis.saldo_caja_actual),
      },
      {
        key: "ingresos",
        label: "Ingresos mes actual",
        value: formatMoney(kpis.ingresos_periodo),
        detail: `${formatNumber(kpis.movimientos_periodo)} movimientos del mes`,
        icon: faMoneyBillTrendUp,
        tone: "blue",
        valueClass: "is-positive",
      },
      {
        key: "stock",
        label: "Stock valorizado",
        value: formatMoney(kpis.stock_valorizado),
        detail: `${formatNumber(kpis.productos_con_stock)} productos con stock`,
        icon: faBoxesStacked,
        tone: "pink",
        valueClass: "",
      },
      {
        key: "cc",
        label: "Saldo clientes",
        value: formatMoney(kpis.saldo_clientes_cc),
        detail: `${formatNumber(kpis.clientes_activos)} clientes activos`,
        icon: faUsers,
        tone: "yellow",
        valueClass: "",
      },
    ],
    [kpis]
  );

  const miniStats = useMemo(
    () => [
      {
        label: "Egresos mes actual",
        value: formatMoney(kpis.egresos_periodo),
        className: "is-negative",
      },
      {
        label: "Resultado mes actual",
        value: formatMoney(kpis.saldo_periodo),
        className: moneyClass(kpis.saldo_periodo),
      },
      {
        label: "Movimientos del mes",
        value: formatNumber(kpis.movimientos_periodo),
        className: "",
      },
      {
        label: "Productos activos",
        value: formatNumber(kpis.productos_activos),
        className: "",
      },
      {
        label: "Proveedores activos",
        value: formatNumber(kpis.proveedores_activos),
        className: "",
      },
      {
        label: "Saldo proveedores",
        value: formatMoney(kpis.saldo_proveedores_cc),
        className: "",
      },
    ],
    [kpis]
  );

  return (
    <>
      {(loadingInicial || (loadingDashboard && !dashboard.series_diaria.length)) && <GifCarga />}

      <div className="db">
        <header className="db-header db-header--dashboard">
          <div className="db-header__left">
            <span className="db-eyebrow">Dashboard general</span>
            <h1 className="db-title">Panel Contable</h1>
            <p className="db-subtitle">
              Vista rápida general del sistema: caja, movimientos del mes actual, stock,
              clientes y proveedores.
            </p>
          </div>

          <div className="db-header__right db-actions">
            <div className="db-pill">
              <span className="db-pill__dot" aria-hidden="true" />
              <span className="db-pill__text">Plan nivel {planNivel}</span>
            </div>
            <button
              type="button"
              className="db-refresh"
              onClick={fetchDashboard}
              disabled={loadingDashboard}
            >
              {loadingDashboard ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </header>

        {errorDashboard && (
          <div className="db-alert">
            <strong>No se pudo cargar el dashboard.</strong>
            <span>{errorDashboard}</span>
          </div>
        )}

        <section className="db-periodbar" aria-label="Período del dashboard">
          <div className="db-period-chip">
            <FontAwesomeIcon icon={faChartLine} />
            <span>Mes actual</span>
          </div>
          {rangoDesde && rangoHasta && (
            <span className="db-periodbar__label">
              {rangoDesde} / {rangoHasta}
            </span>
          )}
        </section>

        <section className="db-kpi-grid">
          {topCards.map((card) => (
            <article className={`db-kpi db-kpi--${card.tone}`} key={card.key}>
              <div className="db-kpi__icon" aria-hidden="true">
                <FontAwesomeIcon icon={card.icon} />
              </div>
              <div className="db-kpi__body">
                <span className="db-kpi__label">{card.label}</span>
                <strong className={`db-kpi__value ${card.valueClass}`}>{card.value}</strong>
                <span className="db-kpi__detail">{card.detail}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="db-main-grid">
          <article className="db-panel db-panel--chart">
            <div className="db-panel__head">
              <div>
                <h2>Ingresos y egresos del mes actual</h2>
                <p>
                  Datos calculados desde ventas, compras, otros ingresos, otros egresos y cobros.
                </p>
              </div>
              <div className="db-legend">
                <span><i className="db-dot db-dot--ingresos" />Ingresos</span>
                <span><i className="db-dot db-dot--egresos" />Egresos</span>
              </div>
            </div>
            <DashboardBarChart rows={dashboard.series_diaria} />
          </article>

          <aside className="db-panel db-panel--side">
            <div className="db-panel__head">
              <div>
                <h2>Indicadores generales</h2>
                <p>Totales principales del sistema y del mes actual.</p>
              </div>
            </div>
            <div className="db-mini-grid">
              {miniStats.map((item) => (
                <div className="db-mini" key={item.label}>
                  <span>{item.label}</span>
                  <strong className={item.className}>{item.value}</strong>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <footer className="db-footer">
          Desarrollado por{" "}
          <a href="https://3devsnet.com" target="_blank" rel="noopener noreferrer">
            3devs.solutions
          </a>
        </footer>
      </div>
    </>
  );
}
