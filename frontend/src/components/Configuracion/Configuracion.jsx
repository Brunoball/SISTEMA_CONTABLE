import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import BASE_URL from "../../config/config";
import logoTiendaNube from "../../imagenes/logo_tienda_nube.png";
import "./configuracion.css";
import "../Global/Global_css/Global_oscuro.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

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

  return res;
}

function StatusPill({ type = "pending", children }) {
  return (
    <span className={`cfg-status cfg-status--${type}`}>
      {children}
    </span>
  );
}

function CardVisual() {
  return (
    <div className="cfg-cardLogoBox">
      <img
        src={logoTiendaNube}
        alt="Logo Tienda Nube"
        className="cfg-cardLogo"
      />
    </div>
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

  const [tiendanube, setTiendanube] = useState({
    connected: false,
    webhooks_configured: false,
    store_id: "",
  });

  const cargarResumen = useCallback(async () => {
    if (!tenantId) return;

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
  }, [tenantId]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  const card = useMemo(() => {
    const estado = tiendanube.connected
      ? tiendanube.webhooks_configured
        ? { text: "Finalizada", type: "success" }
        : { text: "Parcial", type: "warning" }
      : { text: "Pendiente", type: "pending" };

    return {
      title: "Tienda Nube",
      description:
        "Conectá tu tienda y configurá la sincronización con una interfaz simple.",
      route: "/panel/configuracion/tiendanube",
      status: estado,
      metaTop: tiendanube.connected ? "Conexión activa" : "Sin conexión",
      metaBottom: tiendanube.store_id
        ? `Store ID: ${tiendanube.store_id}`
        : "Todavía no configurado",
    };
  }, [tiendanube]);

  return (
    <section className="cfg-page">
      <div className="cfg-cards">
        <div className="cfg-cardWrap">
          <button
            type="button"
            className="cfg-card"
            onClick={() => navigate(card.route)}
          >
            <div className="cfg-cardMain">
              <CardVisual />

              <div className="cfg-cardBody">
                {/* HEADER */}
                <div className="cfg-cardHeader">
                  <h2>{card.title}</h2>

                  {/* CHIP ARRIBA DERECHA */}
                  <StatusPill type={card.status.type}>
                    Finalizada
                  </StatusPill>
                </div>

                <p className="cfg-cardDescription">{card.description}</p>
              </div>
            </div>

            {/* FOOTER */}
            <div className="cfg-cardFooter">
              <div className="cfg-cardFooterLeft">
                <div className="cfg-cardMetaLine">
                  <span className="cfg-cardMetaLabel">Estado</span>
                  <span className="cfg-cardMetaValue">{card.metaTop}</span>
                </div>

                <div className="cfg-cardMetaLine">
                  <span className="cfg-cardMetaLabel">Detalle</span>
                  <span className="cfg-cardMetaValue">
                    {card.metaBottom}
                  </span>
                </div>
              </div>

              {/* 👉 FLECHA ABAJO DERECHA */}
              <div className="cfg-cardFooterRight">
                <span className="cfg-cardArrow">
                  <FontAwesomeIcon icon={faChevronRight} />
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </section>
  );
}