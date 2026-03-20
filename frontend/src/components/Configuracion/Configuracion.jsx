import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStore,
  faChevronRight,
  faPlug,
  faLink,
  faCheckCircle,
  faClock,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../config/config";
import "./configuracion.css";

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

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    try {
      window.dispatchEvent(
        new CustomEvent("auth:unauthorized", {
          detail: { status: res.status },
        })
      );
    } catch {}
  }

  return res;
}

function StatusPill({ type = "pending", children }) {
  return (
    <span className={`cfg-status cfg-status--${type}`}>
      {children}
    </span>
  );
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tiendanube, setTiendanube] = useState({
    connected: false,
    webhooks_configured: false,
    store_id: "",
    updated_at: "",
  });

  const cargarResumen = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!tenantId) {
      setError("No se detectó el idTenant en la sesión.");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(
        {
          action: "tiendanube_status",
          idTenant: tenantId,
        },
        { method: "GET" }
      );

      const txt = await res.text();
      const data = safeJsonParse(txt);

      if (!res.ok || !data?.exito) {
        throw new Error(
          data?.mensaje || data?.error || "No se pudo cargar el estado de configuración."
        );
      }

      const c = data?.conexion || {};

      setTiendanube({
        connected: Boolean(c.connected),
        webhooks_configured: Boolean(c.webhooks_configured),
        store_id: c.store_id || "",
        updated_at: c.updated_at || "",
      });
    } catch (e) {
      setError(e?.message || "Error al cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  const cards = useMemo(() => {
    const estadoTiendaNube = tiendanube.connected
      ? tiendanube.webhooks_configured
        ? { text: "Completado", type: "success" }
        : { text: "Parcial", type: "warning" }
      : { text: "Pendiente", type: "pending" };

    return [
      {
        id: "tiendanube",
        title: "Tienda Nube",
        description:
          "Conectá tu tienda, validá el vínculo OAuth y configurá los webhooks para sincronización.",
        icon: faStore,
        route: "/panel/configuracion/tiendanube",
        status: estadoTiendaNube,
        metaTop: tiendanube.connected ? "Conexión activa" : "Sin conexión",
        metaBottom: tiendanube.store_id
          ? `Store ID: ${tiendanube.store_id}`
          : "Todavía no configurado",
      },
      {
        id: "integraciones",
        title: "Integraciones futuras",
        description:
          "Este espacio queda preparado para futuras configuraciones como pasarelas, sincronizadores y APIs externas.",
        icon: faPlug,
        route: "",
        status: { text: "Próximamente", type: "neutral" },
        metaTop: "Módulo reservado",
        metaBottom: "Todavía no disponible",
      },
      {
        id: "enlaces",
        title: "Enlaces y accesos",
        description:
          "Configuraciones globales de conexiones, URLs, callbacks y enlaces externos del tenant.",
        icon: faLink,
        route: "",
        status: { text: "Próximamente", type: "neutral" },
        metaTop: "Módulo reservado",
        metaBottom: "Todavía no disponible",
      },
    ];
  }, [tiendanube]);

  return (
    <section className="cfg-page">
      <div className="cfg-top">
        <div>
          <div className="cfg-eyebrow">
            <FontAwesomeIcon icon={faGear} />
            <span>Configuración general</span>
          </div>
          <h1 className="cfg-title">Centro de configuración</h1>
          <p className="cfg-subtitle">
            Elegí una sección para administrar conexiones, integraciones y
            parámetros del sistema.
          </p>
        </div>

        <button
          type="button"
          className="cfg-refresh"
          onClick={cargarResumen}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "Actualizar estados"}
        </button>
      </div>

      {error && <div className="cfg-alert cfg-alert--error">{error}</div>}

      <div className="cfg-cards">
        {cards.map((card) => {
          const disabled = !card.route;

          return (
            <div key={card.id} className="cfg-cardWrap">
              <div className="cfg-cardTopStatus">
                <StatusPill type={card.status.type}>{card.status.text}</StatusPill>
              </div>

              <button
                type="button"
                className={`cfg-card ${disabled ? "is-disabled" : ""}`}
                onClick={() => {
                  if (!disabled) navigate(card.route);
                }}
                disabled={disabled}
              >
                <div className="cfg-cardIcon">
                  <FontAwesomeIcon icon={card.icon} />
                </div>

                <div className="cfg-cardBody">
                  <div className="cfg-cardHeader">
                    <h2>{card.title}</h2>
                    {!disabled && (
                      <span className="cfg-cardArrow">
                        <FontAwesomeIcon icon={faChevronRight} />
                      </span>
                    )}
                  </div>

                  <p className="cfg-cardDescription">{card.description}</p>

                  <div className="cfg-cardMeta">
                    <div className="cfg-cardMetaItem">
                      <span className="cfg-cardMetaLabel">Estado</span>
                      <span className="cfg-cardMetaValue">{card.metaTop}</span>
                    </div>

                    <div className="cfg-cardMetaItem">
                      <span className="cfg-cardMetaLabel">Detalle</span>
                      <span className="cfg-cardMetaValue">{card.metaBottom}</span>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      <div className="cfg-summaryGrid">
        <div className="cfg-summaryCard">
          <div className="cfg-summaryIcon cfg-summaryIcon--ok">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>
          <div>
            <div className="cfg-summaryLabel">Configuraciones completas</div>
            <div className="cfg-summaryValue">
              {tiendanube.connected && tiendanube.webhooks_configured ? "1" : "0"}
            </div>
          </div>
        </div>

        <div className="cfg-summaryCard">
          <div className="cfg-summaryIcon cfg-summaryIcon--wait">
            <FontAwesomeIcon icon={faClock} />
          </div>
          <div>
            <div className="cfg-summaryLabel">Pendientes</div>
            <div className="cfg-summaryValue">
              {tiendanube.connected && tiendanube.webhooks_configured ? "0" : "1"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}