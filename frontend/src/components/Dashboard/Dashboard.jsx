// src/components/Dashboard/Dashboard.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUpRightFromSquare,
  faBoxesStacked,
  faChartLine,
  faMoneyBillTrendUp,
  faTruck,
  faCreditCard,
  faUsers,
  faWallet,
  faArrowTrendUp,
} from "@fortawesome/free-solid-svg-icons";

import GifCarga from "../Global/Gif_Carga";
import Toast from "../Global/Toast.jsx";
import "./dashboard.css";
import "../Global/Global_css/Global_responsive.css";
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
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(
    Math.round(n)
  );
}


function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function useCountUp(value, { duration = 850 } = {}) {
  const target = toFiniteNumber(value);
  const [displayValue, setDisplayValue] = useState(0);
  const displayRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const getNow = () =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();

    const requestFrame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback) => setTimeout(() => callback(getNow()), 16);

    const cancelFrame =
      typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : clearTimeout;

    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (frameRef.current) cancelFrame(frameRef.current);

    const startValue = displayRef.current;
    const endValue = target;

    if (reduceMotion || startValue === endValue) {
      displayRef.current = endValue;
      setDisplayValue(endValue);
      return undefined;
    }

    const startedAt = getNow();
    const distance = endValue - startValue;

    const tick = (now) => {
      const elapsed = now - startedAt;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + distance * eased;

      displayRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameRef.current = requestFrame(tick);
      } else {
        displayRef.current = endValue;
        setDisplayValue(endValue);
      }
    };

    frameRef.current = requestFrame(tick);

    return () => {
      if (frameRef.current) cancelFrame(frameRef.current);
    };
  }, [target, duration]);

  return displayValue;
}

function AnimatedValue({
  value,
  formatter = formatNumber,
  className = "",
  as: Tag = "span",
  duration = 850,
}) {
  const animatedValue = useCountUp(value, { duration });

  return <Tag className={className}>{formatter(animatedValue)}</Tag>;
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

function formatMonthLabel(iso) {
  let date = null;

  if (iso) {
    const [y, m] = String(iso).split("-");
    if (y && m) date = new Date(Number(y), Number(m) - 1, 1);
  }

  if (!date || Number.isNaN(date.getTime())) {
    const now = new Date();
    date = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
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
  const visibleRows = safeRows.length > 12 ? safeRows.slice(-12) : safeRows;

  const maxValue = Math.max(
    1,
    ...visibleRows.map((r) => Number(r.ingresos || 0) + Number(r.egresos || 0))
  );

  if (visibleRows.length === 0) {
    return (
      <div className="db-empty">
        Todavía no hay movimientos del mes actual para graficar.
      </div>
    );
  }

  const gridTemplateColumns = `repeat(${visibleRows.length}, minmax(30px, 1fr))`;
  const minWidth = Math.max(420, visibleRows.length * 38);

  return (
    <div className="db-chart" role="img" aria-label="Ingresos y egresos del mes actual">
      <div className="db-chart__plot" style={{ gridTemplateColumns, minWidth }}>
        {visibleRows.map((row) => {
          const ingresos = Math.max(0, Number(row.ingresos || 0));
          const egresos = Math.max(0, Number(row.egresos || 0));
          const total = ingresos + egresos;
          const totalHeight = Math.max(5, Math.round((total / maxValue) * 126));
          const ingPct = total > 0 ? (ingresos / total) * 100 : 0;
          const egrPct = total > 0 ? (egresos / total) * 100 : 0;

          return (
            <div
              className="db-chart__item"
              key={row.fecha}
              title={`${row.label || row.fecha}\nIngresos: ${formatMoney(
                ingresos
              )}\nEgresos: ${formatMoney(egresos)}\nMovimientos: ${formatNumber(
                row.movimientos || 0
              )}`}
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

function IndItem({
  icon,
  label,
  value,
  formatter = formatNumber,
  valueClass = "",
  iconClass = "",
}) {
  return (
    <div className="db-ind-item">
      <div className={`db-ind-icon db-ind-icon--${iconClass}`}>
        <FontAwesomeIcon icon={icon} />
      </div>

      <div className="db-ind-item__body">
        <span className="db-ind-label">{label}</span>
        <AnimatedValue
          as="strong"
          className={`db-ind-value ${valueClass}`}
          value={value}
          formatter={formatter}
        />
      </div>
    </div>
  );
}

function SideIndicators({ kpis }) {
  const saldoClass = moneyClass(kpis.saldo_periodo);

  return (
    <div className="db-ind-wrapper">
      <div
        className={`db-ind-resultado ${
          saldoClass === "is-positive"
            ? "db-ind-resultado--pos"
            : saldoClass === "is-negative"
            ? "db-ind-resultado--neg"
            : ""
        }`}
      >
        <div
          className={`db-ind-icon db-ind-icon--${
            Number(kpis.saldo_periodo) >= 0 ? "green" : "red"
          }`}
        >
          <FontAwesomeIcon icon={faArrowTrendUp} />
        </div>

        <div className="db-ind-resultado__body">
          <span className="db-ind-label">Resultado del mes</span>
          <AnimatedValue
            as="strong"
            className={`db-ind-value ${saldoClass}`}
            value={kpis.saldo_periodo}
            formatter={formatMoney}
          />
        </div>
      </div>


      <div className="db-ind-row">
        <IndItem
          icon={faArrowUpRightFromSquare}
          label="Ingresos mes"
          value={kpis.ingresos_periodo}
          formatter={formatMoney}
          valueClass="is-positive"
          iconClass="green"
        />

        <IndItem
          icon={faArrowDown}
          label="Egresos mes"
          value={kpis.egresos_periodo}
          formatter={formatMoney}
          valueClass="is-negative"
          iconClass="red"
        />
      </div>


      <div className="db-ind-row">
        <IndItem
          icon={faTruck}
          label="Proveedores activos"
          value={kpis.proveedores_activos}
          formatter={formatNumber}
          iconClass="amber"
        />

        <IndItem
          icon={faCreditCard}
          label="Saldo proveedores"
          value={kpis.saldo_proveedores_cc}
          formatter={formatMoney}
          iconClass="teal"
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { ensureListsLoaded } = useListas();

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [toast, setToast] = useState(null);

  const didWarmupRef = useRef(false);
  const abortRef = useRef(null);

  const showToast = useCallback((tipo, mensaje, duracion = 3200) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const usuario = useMemo(() => getUsuarioFromStorage(), []);

  const fetchDashboard = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingDashboard(true);

    try {
      const sessionKey = getSessionKey(usuario);
      const headers = { Accept: "application/json" };

      if (sessionKey) headers["X-Session"] = sessionKey;

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
        const mensaje = error?.message || "No se pudo cargar el dashboard.";
        setDashboard(EMPTY_DASHBOARD);
        showToast("error", mensaje, 5200);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingDashboard(false);
      }
    }
  }, [usuario, showToast]);

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
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchDashboard]);

  const kpis = dashboard.kpis || {};

  const rangoDesde = dashboard.rango?.desde ? formatDateES(dashboard.rango.desde) : "";
  const rangoHasta = dashboard.rango?.hasta ? formatDateES(dashboard.rango.hasta) : "";
  const mesActualLabel = formatMonthLabel(dashboard.rango?.desde);

  const topCards = useMemo(
    () => [
      {
        key: "caja",
        label: "Caja actual",
        value: kpis.saldo_caja_actual,
        formatter: formatMoney,
        detail: "Saldo real acumulado",
        icon: faWallet,
        tone: "green",
        valueClass: moneyClass(kpis.saldo_caja_actual),
      },
      {
        key: "ingresos",
        label: "Ingresos mes actual",
        value: kpis.ingresos_periodo,
        formatter: formatMoney,
        detail: (
          <>
            <AnimatedValue value={kpis.movimientos_periodo} formatter={formatNumber} />
            {" movimientos del mes"}
          </>
        ),
        icon: faMoneyBillTrendUp,
        tone: "blue",
        valueClass: "is-positive",
      },
      {
        key: "stock",
        label: "Stock valorizado",
        value: kpis.stock_valorizado,
        formatter: formatMoney,
        detail: (
          <>
            <AnimatedValue value={kpis.productos_con_stock} formatter={formatNumber} />
            {" productos con stock"}
          </>
        ),
        icon: faBoxesStacked,
        tone: "pink",
        valueClass: "",
      },
      {
        key: "cc",
        label: "Saldo clientes",
        value: kpis.saldo_clientes_cc,
        formatter: formatMoney,
        detail: (
          <>
            <AnimatedValue value={kpis.clientes_activos} formatter={formatNumber} />
            {" clientes activos"}
          </>
        ),
        icon: faUsers,
        tone: "yellow",
        valueClass: "",
      },
    ],
    [kpis]
  );

  return (
    <>
      {(loadingInicial || (loadingDashboard && !dashboard.series_diaria.length)) && (
        <GifCarga />
      )}

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      <div className="db">
        <header className="db-header db-header--dashboard">
          <div className="db-header__left">
            <h1 className="db-title">Panel Contable</h1>
            <p className="db-subtitle">
              Vista general del sistema: caja, movimientos del mes, stock,
              clientes y proveedores.
            </p>
          </div>

          <div className="db-header__right db-actions">
            <div
              className="db-period-chip db-period-chip--header"
              title={
                rangoDesde && rangoHasta
                  ? `${rangoDesde} / ${rangoHasta}`
                  : mesActualLabel
              }
            >
              <FontAwesomeIcon icon={faChartLine} />
              <span>Mes actual</span>
              <strong>{mesActualLabel}</strong>
            </div>
          </div>
        </header>

        <section className="db-kpi-grid">
          {topCards.map((card) => (
            <article className={`db-kpi db-kpi--${card.tone}`} key={card.key}>
              <div className="db-kpi__icon" aria-hidden="true">
                <FontAwesomeIcon icon={card.icon} />
              </div>

              <div className="db-kpi__body">
                <span className="db-kpi__label">{card.label}</span>

                <AnimatedValue
                  as="strong"
                  className={`db-kpi__value ${card.valueClass}`}
                  value={card.value}
                  formatter={card.formatter}
                />

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
                  Datos calculados desde ventas, compras, otros ingresos, otros
                  egresos y cobros.
                </p>
              </div>

              <div className="db-legend">
                <span>
                  <i className="db-dot db-dot--ingresos" />
                  Ingresos
                </span>

                <span>
                  <i className="db-dot db-dot--egresos" />
                  Egresos
                </span>
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

            <SideIndicators kpis={kpis} />
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