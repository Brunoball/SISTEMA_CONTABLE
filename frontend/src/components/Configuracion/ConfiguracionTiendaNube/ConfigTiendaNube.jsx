import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faStore,
  faPlug,
  faCheckCircle,
  faTriangleExclamation,
  faCircleInfo,
  faIdBadge,
  faBolt,
  faShieldHalved,
  faChevronRight,
  faDownload,
  faXmark,
  faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
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

function ItemDato({ label, value, full = false }) {
  return (
    <div className={`tn-metaItem ${full ? "tn-metaItem--full" : ""}`}>
      <span className="tn-metaItem__label">{label}</span>
      <span className="tn-metaItem__value">{value || "-"}</span>
    </div>
  );
}

function armarMensajeImportacion(resultado) {
  const categorias = resultado?.categorias || {};
  const productos = resultado?.productos || {};

  const totalErrores =
    Number(categorias.errores || 0) + Number(productos.errores || 0);

  const partes = [
    `Categorías: ${Number(categorias.procesadas || 0)}/${Number(
      categorias.total_remotas || 0
    )} procesadas`,
    `Productos: ${Number(productos.procesados || 0)}/${Number(
      productos.total_remotos || 0
    )} procesados`,
  ];

  if (Number(categorias.creadas || 0) > 0) {
    partes.push(`${Number(categorias.creadas)} categorías nuevas`);
  }
  if (Number(productos.creadas || 0) > 0) {
    partes.push(`${Number(productos.creadas)} productos nuevos`);
  }
  if (Number(categorias.actualizadas || 0) > 0) {
    partes.push(`${Number(categorias.actualizadas)} categorías actualizadas`);
  }
  if (Number(productos.actualizadas || 0) > 0) {
    partes.push(`${Number(productos.actualizadas)} productos actualizados`);
  }
  if (Number(productos.omitidas || 0) > 0) {
    partes.push(`${Number(productos.omitidas)} productos omitidos`);
  }
  if (totalErrores > 0) {
    partes.push(`${totalErrores} errores`);
  }

  return `Importación terminada. ${partes.join(" · ")}.`;
}

function ModalInstructivo({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="tn-modal-overlay" onClick={onClose}>
      <div
        className="tn-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tn-modal-title"
      >
        <div className="tn-modal__header">
          <div className="tn-modal__headerIcon">
            <FontAwesomeIcon icon={faListCheck} />
          </div>

          <h2 id="tn-modal-title" className="tn-modal__title">
            Guía de conexión: Tienda Nube
          </h2>

          <button type="button" className="tn-modal__close" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="tn-modal__body">
          <p className="tn-modal__intro">
            Seguí esta guía paso a paso para conectar Balto con tu tienda Tienda
            Nube. Una vez completada la integración, todo lo que hagas en Balto
            impactará automáticamente en tu tienda, y viceversa.
          </p>

          <div className="tn-steps">
            <div className="tn-step">
              <div className="tn-step__number">1</div>
              <div className="tn-step__content">
                <h3 className="tn-step__title">Conectar con Tienda Nube</h3>
                <p className="tn-step__description">
                  Presioná el botón <strong>"Conectar con Tienda Nube"</strong> en
                  la sección de Acciones. Esto iniciará el flujo de autorización
                  de Tienda Nube.
                </p>
                <div className="tn-step__note">
                  <FontAwesomeIcon icon={faCircleInfo} />
                  <span>
                    ⚠️ Importante: Vas a cerrar sesión en Balto para conectarte
                    con Tienda Nube.
                  </span>
                </div>
              </div>
            </div>

            <div className="tn-step">
              <div className="tn-step__number">2</div>
              <div className="tn-step__content">
                <h3 className="tn-step__title">
                  Iniciar sesión nuevamente en Balto
                </h3>
                <p className="tn-step__description">
                  Después de autorizar la conexión en Tienda Nube, volvé a iniciar
                  sesión en Balto con tus credenciales habituales.
                </p>
              </div>
            </div>

            <div className="tn-step">
              <div className="tn-step__number">3</div>
              <div className="tn-step__content">
                <h3 className="tn-step__title">Volver a Configuración</h3>
                <p className="tn-step__description">
                  Una vez dentro de Balto, navegá nuevamente a{" "}
                  <strong>Configuración → Tienda Nube</strong>. Vas a ver que el
                  estado de conexión ya aparece como "Conectada".
                </p>
              </div>
            </div>

            <div className="tn-step">
              <div className="tn-step__number">4</div>
              <div className="tn-step__content">
                <h3 className="tn-step__title">Configurar Webhooks</h3>
                <p className="tn-step__description">
                  Presioná el botón <strong>"Configurar webhooks"</strong>. Esto
                  es fundamental para que los eventos de Tienda Nube (como nuevas
                  ventas, actualizaciones de stock, etc.) se sincronicen
                  automáticamente con Balto.
                </p>
              </div>
            </div>

            <div className="tn-step">
              <div className="tn-step__number">5</div>
              <div className="tn-step__content">
                <h3 className="tn-step__title">
                  Importar catálogo existente (opcional)
                </h3>
                <p className="tn-step__description">
                  Si ya tenés productos y categorías cargados en Tienda Nube,
                  presioná <strong>"Obtener todo lo de Tienda Nube"</strong> para
                  importarlos a Balto. Esto te permitirá administrarlos desde el
                  sistema.
                </p>
              </div>
            </div>
          </div>

          <div className="tn-modal__final">
            <div className="tn-modal__finalIcon">
              <FontAwesomeIcon icon={faCheckCircle} />
            </div>
            <div className="tn-modal__finalText">
              <strong>¡Listo! Todo configurado.</strong>
              <p>
                A partir de ahora, podés manejar todo desde Balto. Cualquier
                acción que realices (productos, ventas, stock) se sincronizará
                automáticamente con Tienda Nube, y viceversa. La integración está
                completamente activa.
              </p>
            </div>
          </div>
        </div>

        <div className="tn-modal__footer">
          <button type="button" className="tn-modal__button" onClick={onClose}>
            Entendido, ¡comenzar!
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

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
  const [loadingImport, setLoadingImport] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [toast, setToast] = useState(null);

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

  const mostrarToast = useCallback((tipo, mensaje, duracion = 3000) => {
    setToast({
      tipo,
      mensaje: String(mensaje || "").trim() || "Aviso del sistema.",
      duracion,
      key: Date.now(),
    });
  }, []);

  const limpiarMensajes = () => {
    setToast(null);
  };

  const abrirModal = () => setIsModalOpen(true);
  const cerrarModal = () => setIsModalOpen(false);

  const cargarEstado = useCallback(async () => {
    setLoading(true);

    if (!tenantId) {
      setLoading(false);
      mostrarToast("error", "No se detectó el idTenant en la sesión del usuario.", 4200);
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
      mostrarToast("error", e?.message || "Error al cargar la configuración.", 4200);
    } finally {
      setLoading(false);
    }
  }, [tenantId, mostrarToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("tn_connected") === "1") {
      mostrarToast("exito", "Tienda conectada correctamente.");
      params.delete("tn_connected");
    }

    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    window.history.replaceState({}, "", next);

    cargarEstado();
  }, [cargarEstado, mostrarToast]);

  const handleConectar = async () => {
    limpiarMensajes();
    setLoadingConnect(true);

    try {
      if (!tenantId) {
        mostrarToast("error", "No se encontró el tenant. Volvé a iniciar sesión.", 4200);
        return;
      }

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
      mostrarToast("error", e?.message || "No se pudo iniciar la conexión.", 4200);
    } finally {
      setLoadingConnect(false);
    }
  };

  const handleConfigurarWebhooks = async () => {
    limpiarMensajes();
    setLoadingWebhook(true);

    try {
      if (!tenantId) {
        mostrarToast("error", "No se encontró el tenant. Volvé a iniciar sesión.", 4200);
        return;
      }

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

      mostrarToast("exito", data?.mensaje || "Webhooks configurados correctamente.");
      await cargarEstado();
    } catch (e) {
      mostrarToast("error", e?.message || "Error al configurar webhooks.", 4200);
    } finally {
      setLoadingWebhook(false);
    }
  };

  const handleImportarCatalogo = async () => {
    limpiarMensajes();
    setLoadingImport(true);

    try {
      if (!tenantId) {
        mostrarToast("error", "No se encontró el tenant. Volvé a iniciar sesión.", 4200);
        return;
      }

      const res = await apiFetch(
        {
          action: "stock_tiendanube_importar_faltantes",
          idTenant: tenantId,
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
          data?.mensaje ||
            data?.error ||
            "No se pudo importar el catálogo desde Tienda Nube."
        );
      }

      mostrarToast("exito", armarMensajeImportacion(data?.resultado || {}), 5200);
      await cargarEstado();
    } catch (e) {
      mostrarToast("error", e?.message || "Error al importar productos y categorías.", 4200);
    } finally {
      setLoadingImport(false);
    }
  };

  const progreso = useMemo(() => {
    const total = 2;
    let hechos = 0;
    if (conexion.connected) hechos += 1;
    if (conexion.webhooks_configured) hechos += 1;
    return Math.round((hechos / total) * 100);
  }, [conexion.connected, conexion.webhooks_configured]);

  if (loading) {
    return (
      <>
        {toast && (
          <Toast
            key={toast.key}
            tipo={toast.tipo}
            mensaje={toast.mensaje}
            duracion={toast.duracion}
            onClose={() => setToast(null)}
          />
        )}

        <section className="tn-page">
        <div className="tn-hero">
          <div className="tn-hero__icon">
            <FontAwesomeIcon icon={faStore} />
          </div>

          <div className="tn-hero__content">
            <div className="tn-hero__eyebrow">Integración externa</div>
            <h1 className="tn-title">Configuración de Tienda Nube</h1>
            <p className="tn-subtitle">Cargando configuración...</p>
          </div>

          <div className="tn-hero__side">
            <button
              type="button"
              className="mov-btn mov-btn--primary"
              onClick={() => navigate("/panel/configuracion")}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              <span>Volver</span>
            </button>
          </div>
        </div>
        </section>
      </>
    );
  }

  return (
    <>
      {toast && (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <section className="tn-page">
      <ModalInstructivo isOpen={isModalOpen} onClose={cerrarModal} />

      <div className="tn-topbar" />

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

        <div className="tn-hero__side">
          <div className="tn-hero__progress">
            <div className="tn-hero__progressLabel">Progreso</div>
            <div className="tn-hero__progressValue">{progreso}%</div>
          </div>

          <button
            type="button"
            className="mov-btn mov-btn--primary"
            onClick={() => navigate("/panel/configuracion")}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            <span>Volver</span>
          </button>
        </div>
      </div>

      <div className="tn-contentScroll">
      <div className="tn-metaGrid">
        <div className="tn-metaCard">
          <div className="tn-metaCard__top">
            <div className="tn-metaCard__icon">
              <FontAwesomeIcon icon={faCircleInfo} />
            </div>

            <div className="tn-metaCard__head">
              <h2>Estado general</h2>
              <p>Consultá el estado actual de la integración y su progreso.</p>
            </div>
          </div>

          <div className="tn-metaCard__body">
            <ItemDato label="Tenant" value={tenantId || "-"} />
            <ItemDato
              label="Estado de conexión"
              value={<EstadoBadge connected={conexion.connected} />}
            />
            <ItemDato
              label="Webhooks"
              value={<WebhookBadge configured={conexion.webhooks_configured} />}
            />
            <ItemDato
              label="Última actualización"
              value={formatearFecha(conexion.updated_at)}
            />
          </div>
        </div>

        <div className="tn-metaCard">
          <div className="tn-metaCard__top">
            <div className="tn-metaCard__icon">
              <FontAwesomeIcon icon={faIdBadge} />
            </div>

            <div className="tn-metaCard__head">
              <h2>Datos de la conexión</h2>
              <p>Visualizá los identificadores técnicos y datos de la app.</p>
            </div>
          </div>

          <div className="tn-metaCard__body">
            <ItemDato label="Store ID" value={conexion.store_id} />
            <ItemDato label="User ID" value={conexion.user_id} />
            <ItemDato label="App ID" value={conexion.app_id} />
            <ItemDato label="Nombre de la app" value={conexion.app_name} />
            <ItemDato label="Scopes" value={conexion.scope || "-"} full />
          </div>
        </div>

        <div className="tn-metaCard">
          <div className="tn-metaCard__top">
            <div className="tn-metaCard__icon">
              <FontAwesomeIcon icon={faBolt} />
            </div>

            <div className="tn-metaCard__head">
              <h2>Acciones</h2>
              <p>Ejecutá las acciones principales para dejar la integración lista.</p>
            </div>

            <button
              type="button"
              className="tn-infoButton"
              onClick={abrirModal}
              title="Ver guía de conexión"
            >
              <FontAwesomeIcon icon={faCircleInfo} />
              <span>Guía</span>
            </button>
          </div>

          <div className="tn-metaCard__body tn-metaCard__body--stack">
            <button
              type="button"
              className="tn-actionRow"
              onClick={handleConectar}
              disabled={!tenantId || loadingConnect}
            >
              <div className="tn-actionRow__text">
                <span className="tn-actionRow__title">
                  {loadingConnect ? "Redirigiendo..." : "Conectar con Tienda Nube"}
                </span>
                <span className="tn-actionRow__desc">
                  Inicia el flujo OAuth y autoriza la app.
                </span>
              </div>
              <FontAwesomeIcon icon={faChevronRight} />
            </button>

            <button
              type="button"
              className="tn-actionRow"
              onClick={handleConfigurarWebhooks}
              disabled={!tenantId || !conexion.connected || loadingWebhook}
            >
              <div className="tn-actionRow__text">
                <span className="tn-actionRow__title">
                  {loadingWebhook ? "Configurando..." : "Configurar webhooks"}
                </span>
                <span className="tn-actionRow__desc">
                  Registra los eventos para automatizar la integración.
                </span>
              </div>
              <FontAwesomeIcon icon={faChevronRight} />
            </button>

            <button
              type="button"
              className="tn-actionRow"
              onClick={handleImportarCatalogo}
              disabled={!tenantId || !conexion.connected || loadingImport}
            >
              <div className="tn-actionRow__text">
                <span className="tn-actionRow__title">
                  {loadingImport
                    ? "Obteniendo catálogo..."
                    : "Obtener todo lo de Tienda Nube"}
                </span>
                <span className="tn-actionRow__desc">
                  Importa las categorías y productos que ya existen en la tienda.
                </span>
              </div>
              <FontAwesomeIcon icon={loadingImport ? faPlug : faDownload} />
            </button>
          </div>
        </div>

        <div className="tn-metaCard">
          <div className="tn-metaCard__top">
            <div className="tn-metaCard__icon">
              <FontAwesomeIcon icon={faShieldHalved} />
            </div>

            <div className="tn-metaCard__head">
              <h2>Checklist visual</h2>
              <p>Verificá rápidamente qué parte ya quedó lista y qué falta.</p>
            </div>
          </div>

          <div className="tn-metaCard__body tn-metaCard__body--stack">
            <div className={`tn-statusRow ${conexion.connected ? "ok" : "warn"}`}>
              <div className="tn-statusRow__left">
                <div className="tn-statusRow__icon">
                  <FontAwesomeIcon
                    icon={conexion.connected ? faCheckCircle : faTriangleExclamation}
                  />
                </div>
                <div>
                  <div className="tn-statusRow__title">App autorizada</div>
                  <div className="tn-statusRow__desc">
                    {conexion.connected
                      ? "La tienda autorizó correctamente el acceso."
                      : "Falta completar la autorización desde Tienda Nube."}
                  </div>
                </div>
              </div>
              <span
                className={`tn-badge ${
                  conexion.connected ? "tn-badge--ok" : "tn-badge--warn"
                }`}
              >
                {conexion.connected ? "Lista" : "Pendiente"}
              </span>
            </div>

            <div
              className={`tn-statusRow ${
                conexion.webhooks_configured ? "ok" : "warn"
              }`}
            >
              <div className="tn-statusRow__left">
                <div className="tn-statusRow__icon">
                  <FontAwesomeIcon
                    icon={
                      conexion.webhooks_configured
                        ? faCheckCircle
                        : faTriangleExclamation
                    }
                  />
                </div>
                <div>
                  <div className="tn-statusRow__title">Webhooks registrados</div>
                  <div className="tn-statusRow__desc">
                    {conexion.webhooks_configured
                      ? "Los eventos ya quedaron configurados."
                      : "Falta registrar los webhooks necesarios para automatizar."}
                  </div>
                </div>
              </div>
              <span
                className={`tn-badge ${
                  conexion.webhooks_configured ? "tn-badge--ok" : "tn-badge--warn"
                }`}
              >
                {conexion.webhooks_configured ? "Listos" : "Pendientes"}
              </span>
            </div>
          </div>
        </div>
        </div>
      </div>
      </section>
    </>
  );
}