// src/components/Configuracion/configuracion.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import BASE_URL from "../../config/config";
import logoTiendaNube from "../../imagenes/logo_tienda_nube.png";
import "./configuracion.css";
import "../Global/Global_css/Global_oscuro.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faCalendarDays,
  faUsersGear,
  faFileInvoiceDollar,
} from "@fortawesome/free-solid-svg-icons";

import { useDateRange } from "../../context/DateRangeContext";

const API_RELATIVE = "api.php";

function buildApiUrl(paramsObj = {}) {
  const baseRaw = String(BASE_URL || "").trim();
  const base = baseRaw.replace(/\/+$/, "") + "/";
  const url = new URL(API_RELATIVE, base);

  const qs = new URLSearchParams();
  Object.entries(paramsObj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });

  url.search = qs.toString();
  return url.toString();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getSessionKey() {
  return String(localStorage.getItem("session_key") || "").trim();
}

function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem("usuario")) || {};
  } catch {
    return {};
  }
}

async function apiFetch(paramsObj = {}, options = {}) {
  const sessionKey = getSessionKey();
  const headers = new Headers(options.headers || {});
  if (sessionKey) headers.set("X-Session", sessionKey);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = buildApiUrl(paramsObj);
  const res = await fetch(url, { ...options, headers });
  return res;
}

function StatusPill({ type = "pending", children }) {
  return (
    <span className={`cfg-status cfg-status--${type}`}>
      {children}
    </span>
  );
}

function CardVisual({ children }) {
  return (
    <div className="cfg-cardLogoBox">
      {children}
    </div>
  );
}

// Ícono SVG para el calendario (no requiere imagen externa)
function CalendarioIcon() {
  return (
    <div
      className="cfg-cardLogo cfg-cardLogo--icon"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        fontSize: "2rem",
        color: "var(--color-primary, #6366f1)",
      }}
    >
      <FontAwesomeIcon icon={faCalendarDays} />
    </div>
  );
}

// ─── etiquetas legibles para cada modo ───────────────────────────────────────
function labelModo(config) {
  if (!config) return "Sin configurar";
  if (config.modo === "dias_atras") {
    const d = Number(config.dias_atras ?? 10);
    return `Últimos ${d} día${d === 1 ? "" : "s"}`;
  }
  return "Mes completo";
}

export default function Configuracion() {
  const navigate = useNavigate();
  const usuario = useMemo(() => getUsuario(), []);
  const tenantId =
    usuario?.idTenant ||
    usuario?.id_tenant ||
    usuario?.tenant_id ||
    usuario?.tenant?.idTenant ||
    "";

  // ── estado Tienda Nube ─────────────────────────────────────────────────
  const [tiendanube, setTiendanube] = useState({
    connected: false,
    webhooks_configured: false,
    store_id: "",
  });

  const [datosLegales, setDatosLegales] = useState({
    razon_social: "",
    nombre_fantasia: "",
    cuit: "",
    condicion_iva: "",
  });

  // ── config de calendario (leída del contexto global) ──────────────────
  const { calendarConfig, configLoaded } = useDateRange();

  const cargarResumen = useCallback(async () => {
    if (tenantId) {
      try {
        const res = await apiFetch({
          action: "tiendanube_status",
          idTenant: tenantId,
        });
        const txt = await res.text();
        const data = safeJsonParse(txt);
        const c = data?.conexion || {};
        setTiendanube({
          connected: Boolean(c.connected),
          webhooks_configured: Boolean(c.webhooks_configured),
          store_id: c.store_id || "",
        });
      } catch {}
    }

    try {
      const res = await apiFetch({ action: "config_facturacion_get" });
      const txt = await res.text();
      const data = safeJsonParse(txt);
      const c = data?.config || {};

      setDatosLegales({
        razon_social: c.razon_social || "",
        nombre_fantasia: c.nombre_fantasia || "",
        cuit: c.cuit || "",
        condicion_iva: c.condicion_iva || "",
      });
    } catch {}
  }, [tenantId]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  // ── cards ──────────────────────────────────────────────────────────────
  const cards = useMemo(() => {
    // Card Tienda Nube
    const tiendaNubeEstado = tiendanube.connected
      ? tiendanube.webhooks_configured
        ? { text: "Finalizada", type: "success" }
        : { text: "Parcial",    type: "warning" }
      : { text: "Sin conexión", type: "pending" };

    // Card Calendario
    const modoLabel = configLoaded ? labelModo(calendarConfig) : "Cargando…";
    const calendarioEstado = configLoaded
      ? { text: "Configurado", type: "success" }
      : { text: "Cargando",   type: "pending" };

    return [
      {
        id: "tiendanube",
        title: "Tienda Nube",
        description:
          "Conectá tu tienda y configurá la sincronización con una interfaz simple.",
        route: "/panel/configuracion/tiendanube",
        status: tiendaNubeEstado,
        metaTop:    tiendanube.connected ? "Conexión activa" : "Sin conexión",
        metaBottom: tiendanube.store_id
          ? `Store ID: ${tiendanube.store_id}`
          : "Todavía no configurado",
        icon: (
          <img
            src={logoTiendaNube}
            alt="Logo Tienda Nube"
            className="cfg-cardLogo"
          />
        ),
      },
      {
        id: "usuarios",
        title: "Usuarios del sistema",
        description: "Creá usuarios y asigná roles para limitar el acceso a cada empleado.",
        route: "/panel/configuracion/usuarios",
        status: { text: "Administrable", type: "success" },
        metaTop: "Roles activos",
        metaBottom: "Administrador / Empleado básico",
        icon: (
          <div className="cfg-cardLogo cfg-cardLogo--icon">
            <FontAwesomeIcon icon={faUsersGear} />
          </div>
        ),
      },
      {
        id: "datos-legales",
        title: "Datos legales",
        description:
          "Actualizá razón social, CUIT, condición fiscal, domicilio y datos de facturación.",
        route: "/panel/configuracion/datos-legales",
        status: datosLegales.razon_social ? { text: "Configurado", type: "success" } : { text: "Pendiente", type: "pending" },
        metaTop: datosLegales.razon_social || "Sin razón social",
        metaBottom: datosLegales.cuit ? `CUIT: ${datosLegales.cuit}` : "CUIT sin cargar",
        icon: (
          <div className="cfg-cardLogo cfg-cardLogo--icon">
            <FontAwesomeIcon icon={faFileInvoiceDollar} />
          </div>
        ),
      },
      {
        id: "calendario",
        title: "Calendario global",
        description:
          "Elegí cómo se carga el rango de fechas por defecto en todas las vistas.",
        route: "/panel/configuracion/calendario",
        status: calendarioEstado,
        metaTop:    "Modo activo",
        metaBottom: modoLabel,
        icon: <CalendarioIcon />,
      },
    ];
  }, [tiendanube, datosLegales, calendarConfig, configLoaded]);

  return (
    <section className="cfg-page">
      <div className="cfg-cards">
        {cards.map((card) => (
          <div key={card.id} className="cfg-cardWrap">
            <button
              type="button"
              className="cfg-card"
              onClick={() => navigate(card.route)}
            >
              <div className="cfg-cardMain">
                <CardVisual>{card.icon}</CardVisual>

                <div className="cfg-cardBody">
                  <div className="cfg-cardHeader">
                    <h2>{card.title}</h2>
                    <StatusPill type={card.status.type}>
                      {card.status.text}
                    </StatusPill>
                  </div>
                  <p className="cfg-cardDescription">{card.description}</p>
                </div>
              </div>

              <div className="cfg-cardFooter">
                <div className="cfg-cardFooterLeft">
                  <div className="cfg-cardMetaLine">
                    <span className="cfg-cardMetaLabel">Estado</span>
                    <span className="cfg-cardMetaValue">{card.metaTop}</span>
                  </div>
                  <div className="cfg-cardMetaLine">
                    <span className="cfg-cardMetaLabel">Detalle</span>
                    <span className="cfg-cardMetaValue">{card.metaBottom}</span>
                  </div>
                </div>
                <div className="cfg-cardFooterRight">
                  <span className="cfg-cardArrow">
                    <FontAwesomeIcon icon={faChevronRight} />
                  </span>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
