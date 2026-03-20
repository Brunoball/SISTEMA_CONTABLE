import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faStore,
  faPlug,
  faLink,
  faCheckCircle,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../config/config";
import "./configTiendanube.css";

const API_RELATIVE = "api.php";

function buildApiUrl(paramsObj = {}) {
  const baseRaw = String(BASE_URL || "").trim();
  const base = baseRaw.replace(/\/+$/, "") + "/";
  const url = new URL(API_RELATIVE, base);

  const qs = new URLSearchParams();
  Object.entries(paramsObj).forEach(([k, v]) => {
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

function formatearFecha(fecha) {
  if (!fecha) return "-";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
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

const EstadoBadge = ({ connected }) => {
  return (
    <span className={`tn-badge ${connected ? "tn-badge--ok" : "tn-badge--off"}`}>
      {connected ? "Conectada" : "No conectada"}
    </span>
  );
};

const WebhookBadge = ({ configured }) => {
  return (
    <span className={`tn-badge ${configured ? "tn-badge--ok" : "tn-badge--warn"}`}>
      {configured ? "Configurados" : "Pendientes"}
    </span>
  );
};

export default function ConfigTiendaNube() {
  const navigate = useNavigate();
  const usuario = useMemo(() => getUsuario(), []);
  const tenantId =
    usuario?.idTenant ||
    usuario?.id_tenant ||
    usuario?.tenant_id ||
    usuario?.tenant?.idTenant ||
    "";

  const [loading, setLoading] = useState(true);
  const [loadingConnect, setLoadingConnect] = useState(false);
  const [loadingWebhook, setLoadingWebhook] = useState(false);

  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [conexion, setConexion] = useState({
    connected: false,
    store_id: "",
    user_id: "",
    app_id: "",
    app_name: "",
    scope: "",
    webhooks_configured: false,
    updated_at: "",
  });

  const limpiarMensajes = () => {
    setError("");
    setOkMsg("");
  };

  const cargarEstado = useCallback(async () => {
    setLoading(true);
    limpiarMensajes();

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

      if (!res.ok) {
        throw new Error(
          data?.mensaje ||
            data?.error ||
            "No se pudo obtener el estado de Tienda Nube."
        );
      }

      if (!data?.exito) {
        throw new Error(
          data?.mensaje || "La API respondió sin éxito al consultar Tienda Nube."
        );
      }

      const c = data?.conexion || {};

      setConexion({
        connected: Boolean(c.connected),
        store_id: c.store_id || "",
        user_id: c.user_id || "",
        app_id: c.app_id || "",
        app_name: c.app_name || "",
        scope: c.scope || "",
        webhooks_configured: Boolean(c.webhooks_configured),
        updated_at: c.updated_at || "",
      });
    } catch (e) {
      setError(e?.message || "Error al cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("tn_connected") === "1") {
      setOkMsg("Tienda conectada correctamente.");
      params.delete("tn_connected");
    }

    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    window.history.replaceState({}, "", next);

    cargarEstado();
  }, [cargarEstado]);

  const handleConectar = async () => {
    limpiarMensajes();
    setLoadingConnect(true);

    try {
      const res = await apiFetch(
        {
          action: "tiendanube_connect_url",
          idTenant: tenantId,
        },
        { method: "GET" }
      );

      const txt = await res.text();
      const data = safeJsonParse(txt);

      if (!res.ok || !data?.exito || !data?.auth_url) {
        throw new Error(
          data?.mensaje ||
            data?.error ||
            "No se pudo generar la URL de conexión con Tienda Nube."
        );
      }

      window.location.href = data.auth_url;
    } catch (e) {
      setError(e?.message || "No se pudo iniciar la conexión.");
    } finally {
      setLoadingConnect(false);
    }
  };

  const handleConfigurarWebhooks = async () => {
    limpiarMensajes();
    setLoadingWebhook(true);

    try {
      const res = await apiFetch(
        {
          action: "tiendanube_configurar_webhooks",
        },
        {
          method: "POST",
          body: JSON.stringify({
            idTenant: tenantId,
          }),
        }
      );

      const txt = await res.text();
      const data = safeJsonParse(txt);

      if (!res.ok || !data?.exito) {
        throw new Error(
          data?.mensaje || data?.error || "No se pudieron configurar los webhooks."
        );
      }

      setOkMsg(data?.mensaje || "Webhooks configurados correctamente.");
      await cargarEstado();
    } catch (e) {
      setError(e?.message || "Error al configurar webhooks.");
    } finally {
      setLoadingWebhook(false);
    }
  };

  const progreso = useMemo(() => {
    let total = 2;
    let hechos = 0;
    if (conexion.connected) hechos += 1;
    if (conexion.webhooks_configured) hechos += 1;
    return Math.round((hechos / total) * 100);
  }, [conexion.connected, conexion.webhooks_configured]);

  return (
    <section className="tn-page">
      <div className="tn-topbar">
        <button
          type="button"
          className="tn-backBtn"
          onClick={() => navigate("/panel/configuracion")}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
          <span>Volver a configuración</span>
        </button>

        <button
          type="button"
          className="tn-btn tn-btn--ghost"
          onClick={cargarEstado}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "Actualizar estado"}
        </button>
      </div>

      <div className="tn-hero">
        <div className="tn-hero__icon">
          <FontAwesomeIcon icon={faStore} />
        </div>

        <div className="tn-hero__content">
          <div className="tn-hero__eyebrow">Integración externa</div>
          <h1 className="tn-title">Configuración de Tienda Nube</h1>
          <p className="tn-subtitle">
            Conectá Balto con tu tienda para sincronizar ventas, pedidos, clientes
            y automatizaciones futuras.
          </p>
        </div>

        <div className="tn-hero__progress">
          <div className="tn-hero__progressLabel">Progreso</div>
          <div className="tn-hero__progressValue">{progreso}%</div>
        </div>
      </div>

      {!tenantId && (
        <div className="tn-alert tn-alert--error">
          No se detectó el <b>idTenant</b> en la sesión del usuario. Revisá el
          objeto guardado en <code>localStorage.usuario</code>.
        </div>
      )}

      {error && <div className="tn-alert tn-alert--error">{error}</div>}
      {okMsg && <div className="tn-alert tn-alert--success">{okMsg}</div>}

      <div className="tn-steps">
        <div className={`tn-step ${conexion.connected ? "is-done" : "is-pending"}`}>
          <div className="tn-step__icon">
            <FontAwesomeIcon icon={conexion.connected ? faCheckCircle : faLink} />
          </div>
          <div className="tn-step__body">
            <div className="tn-step__title">1. Conexión OAuth</div>
            <div className="tn-step__text">
              {conexion.connected
                ? "La tienda ya está vinculada correctamente con Balto."
                : "Todavía no se autorizó la app desde Tienda Nube."}
            </div>
          </div>
        </div>

        <div
          className={`tn-step ${
            conexion.webhooks_configured ? "is-done" : "is-pending"
          }`}
        >
          <div className="tn-step__icon">
            <FontAwesomeIcon
              icon={conexion.webhooks_configured ? faCheckCircle : faPlug}
            />
          </div>
          <div className="tn-step__body">
            <div className="tn-step__title">2. Webhooks</div>
            <div className="tn-step__text">
              {conexion.webhooks_configured
                ? "Los eventos necesarios ya quedaron registrados."
                : "Todavía falta registrar los webhooks para automatizar la integración."}
            </div>
          </div>
        </div>
      </div>

      <div className="tn-grid">
        <div className="tn-card">
          <div className="tn-card__head">
            <h2>Estado general</h2>
          </div>

          <div className="tn-fields">
            <div className="tn-field">
              <span className="tn-label">Tenant</span>
              <span className="tn-value">{tenantId || "-"}</span>
            </div>

            <div className="tn-field">
              <span className="tn-label">Estado de conexión</span>
              <span className="tn-value">
                <EstadoBadge connected={conexion.connected} />
              </span>
            </div>

            <div className="tn-field">
              <span className="tn-label">Webhooks</span>
              <span className="tn-value">
                <WebhookBadge configured={conexion.webhooks_configured} />
              </span>
            </div>

            <div className="tn-field">
              <span className="tn-label">Última actualización</span>
              <span className="tn-value">{formatearFecha(conexion.updated_at)}</span>
            </div>
          </div>
        </div>

        <div className="tn-card">
          <div className="tn-card__head">
            <h2>Datos de la conexión</h2>
          </div>

          <div className="tn-fields">
            <div className="tn-field">
              <span className="tn-label">Store ID</span>
              <span className="tn-value">{conexion.store_id || "-"}</span>
            </div>

            <div className="tn-field">
              <span className="tn-label">User ID</span>
              <span className="tn-value">{conexion.user_id || "-"}</span>
            </div>

            <div className="tn-field">
              <span className="tn-label">App ID</span>
              <span className="tn-value">{conexion.app_id || "-"}</span>
            </div>

            <div className="tn-field">
              <span className="tn-label">Nombre de la app</span>
              <span className="tn-value">{conexion.app_name || "-"}</span>
            </div>

            <div className="tn-field tn-field--full">
              <span className="tn-label">Scopes</span>
              <span className="tn-value tn-value--pre">{conexion.scope || "-"}</span>
            </div>
          </div>
        </div>

        <div className="tn-card tn-card--full">
          <div className="tn-card__head">
            <h2>Acciones</h2>
          </div>

          <div className="tn-actions">
            <button
              type="button"
              className="tn-btn tn-btn--primary"
              onClick={handleConectar}
              disabled={!tenantId || loadingConnect}
            >
              {loadingConnect ? "Redirigiendo..." : "Conectar con Tienda Nube"}
            </button>

            <button
              type="button"
              className="tn-btn tn-btn--secondary"
              onClick={handleConfigurarWebhooks}
              disabled={!tenantId || !conexion.connected || loadingWebhook}
            >
              {loadingWebhook ? "Configurando..." : "Configurar webhooks"}
            </button>
          </div>

          <div className="tn-help">
            <p>
              <b>Conectar con Tienda Nube:</b> inicia el flujo OAuth y redirige a
              Tienda Nube para autorizar la app.
            </p>
            <p>
              <b>Configurar webhooks:</b> registra los eventos necesarios para que
              Balto reciba cambios de pedidos, productos o clientes.
            </p>
          </div>
        </div>

        <div className="tn-card tn-card--full">
          <div className="tn-card__head">
            <h2>Checklist visual</h2>
          </div>

          <div className="tn-checklist">
            <div className={`tn-checkItem ${conexion.connected ? "ok" : "warn"}`}>
              <div className="tn-checkItem__icon">
                <FontAwesomeIcon
                  icon={conexion.connected ? faCheckCircle : faTriangleExclamation}
                />
              </div>
              <div>
                <div className="tn-checkItem__title">App autorizada</div>
                <div className="tn-checkItem__text">
                  {conexion.connected
                    ? "La tienda autorizó correctamente el acceso."
                    : "Falta completar la autorización desde Tienda Nube."}
                </div>
              </div>
            </div>

            <div
              className={`tn-checkItem ${
                conexion.webhooks_configured ? "ok" : "warn"
              }`}
            >
              <div className="tn-checkItem__icon">
                <FontAwesomeIcon
                  icon={
                    conexion.webhooks_configured
                      ? faCheckCircle
                      : faTriangleExclamation
                  }
                />
              </div>
              <div>
                <div className="tn-checkItem__title">Webhooks registrados</div>
                <div className="tn-checkItem__text">
                  {conexion.webhooks_configured
                    ? "Los eventos ya quedaron configurados."
                    : "Falta registrar los webhooks necesarios para automatizar."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}