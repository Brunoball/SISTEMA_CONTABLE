// src/context/NetworkContext.jsx
import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import BASE_URL from "../config/config";
import Toast from "../components/Global/Toast.jsx";

import "../components/Global/Global_css/roots.css";

const NetworkContext = createContext(null);
export const useNetwork = () => useContext(NetworkContext);

function buildPingUrl() {
  const base = String(BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/api.php?action=inicio`;
}

export default function NetworkProvider({ children }) {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [toastOk, setToastOk] = useState(false);

  const retryTimer = useRef(null);
  const prevOfflineRef = useRef(offline);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    const handler = () => setOffline(true);
    window.addEventListener("net:fetch_failed", handler);
    return () => window.removeEventListener("net:fetch_failed", handler);
  }, []);

  useEffect(() => {
    if (!offline) {
      if (retryTimer.current) clearInterval(retryTimer.current);
      retryTimer.current = null;
      return;
    }

    const pingUrl = buildPingUrl();

    const tick = async () => {
      if (!navigator.onLine) return;

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3500);

        const res = await fetch(pingUrl, {
          method: "GET",
          cache: "no-store",
          signal: ctrl.signal,
        });

        clearTimeout(t);

        if (res.ok) {
          setOffline(false);
          if (retryTimer.current) clearInterval(retryTimer.current);
          retryTimer.current = null;
        }
      } catch {
        // sigue caído
      }
    };

    retryTimer.current = setInterval(tick, 2500);
    tick();

    return () => {
      if (retryTimer.current) clearInterval(retryTimer.current);
      retryTimer.current = null;
    };
  }, [offline]);

  useEffect(() => {
    const prev = prevOfflineRef.current;
    if (prev === true && offline === false) setToastOk(true);
    prevOfflineRef.current = offline;
  }, [offline]);

  useEffect(() => {
    return () => {
      if (retryTimer.current) clearInterval(retryTimer.current);
    };
  }, []);

  const value = useMemo(() => ({ offline }), [offline]);

  return (
    <NetworkContext.Provider value={value}>
      {children}

      {toastOk && (
        <Toast
          tipo="exito"
          mensaje="Conexión restablecida"
          duracion={4500}
          onClose={() => setToastOk(false)}
        />
      )}

      {offline && (
        <div className="net-overlay">
          <div className="net-box">
            <div className="net-iconWrap" aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="72"
                height="72"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="net-icon"
              >
                <path d="M12 20h.01" />
                <path d="M8.5 16.429a5 5 0 0 1 7 0" />
                <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
                <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
                <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
                <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
                <path d="m2 2 20 20" />
              </svg>
            </div>

            <h2 className="net-title">Sin conexión</h2>

            <p className="net-text">
              No pudimos comunicarnos con Internet o con el servidor.
              <br />
              Estamos reintentando automáticamente…
            </p>

            <div className="net-actions">
              <button className="net-btn" onClick={() => window.location.reload()}>
                Reintentar ahora
              </button>

              <button
                className="net-btnGhost"
                onClick={() => {
                  try {
                    sessionStorage.clear();
                    localStorage.removeItem("token");
                    localStorage.removeItem("session_key");
                    localStorage.removeItem("usuario");
                  } catch {}
                  window.location.href = "/";
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </NetworkContext.Provider>
  );
}