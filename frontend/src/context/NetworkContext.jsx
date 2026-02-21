// src/context/NetworkContext.jsx
import React, { createContext, useContext, useEffect, useState, useRef, useMemo } from "react";
import BASE_URL from "../config/config";

// ✅ Usa tu Toast global
import Toast from "../components/Global/Toast.jsx";

const NetworkContext = createContext(null);
export const useNetwork = () => useContext(NetworkContext);

function buildPingUrl() {
  const base = String(BASE_URL || "").trim().replace(/\/+$/, "");
  return `${base}/api.php?action=inicio`;
}

export default function NetworkProvider({ children }) {
  const [offline, setOffline] = useState(!navigator.onLine);

  // ✅ Toast global "Conexión restablecida"
  const [toastOk, setToastOk] = useState(false);

  const retryTimer = useRef(null);
  const prevOfflineRef = useRef(offline);

  // 🔴 Navegador detecta conexión
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

  // 🔴 Cualquier fetch fallido (por tu patch global)
  useEffect(() => {
    const handler = () => {
      setOffline(true);
    };

    window.addEventListener("net:fetch_failed", handler);
    return () => window.removeEventListener("net:fetch_failed", handler);
  }, []);

  // ✅ Ping al backend real (para levantar overlay cuando vuelve todo)
  useEffect(() => {
    if (!offline) {
      if (retryTimer.current) clearInterval(retryTimer.current);
      retryTimer.current = null;
      return;
    }

    const pingUrl = buildPingUrl();

    const tick = async () => {
      // si el browser sigue offline, ni gastes
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

  // ✅ Mostrar Toast global cuando pasamos de OFFLINE -> ONLINE
  useEffect(() => {
    const prev = prevOfflineRef.current;

    if (prev === true && offline === false) {
      setToastOk(true);
    }

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

      {/* ✅ Toast GLOBAL del sistema */}
      {toastOk && (
        <Toast
          tipo="exito"
          mensaje="Conexión restablecida"
          duracion={4500}   // ✅ antes 2500 -> ahora más tiempo
          onClose={() => setToastOk(false)}
        />
      )}

      {/* OVERLAY GLOBAL */}
      {offline && (
        <div style={overlayStyle}>
          <div style={boxStyle}>
            {/* ✅ ICONO WIFI OFF */}
            <div style={iconWrapStyle} aria-hidden="true">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="72"
                height="72"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#facc15"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-wifi-off"
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

            <h2 style={{ marginTop: 0 }}>Sin conexión</h2>

            <p style={{ margin: "10px 0 0" }}>
              No pudimos comunicarnos con Internet o con el servidor.
              <br />
              Estamos reintentando automáticamente…
            </p>

            <div style={actionsStyle}>
              <button style={btnStyle} onClick={() => window.location.reload()}>
                Reintentar ahora
              </button>

              <button
                style={btnGhostStyle}
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

          <style>{pulseCss}</style>
        </div>
      )}
    </NetworkContext.Provider>
  );
}

/* =========================
   Styles
========================= */

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 999999,
  padding: 16,
};

const boxStyle = {
  width: 440,
  maxWidth: "95%",
  background: "#111",
  color: "#fff",
  borderRadius: 14,
  padding: 22,
  textAlign: "center",
  boxShadow: "0 20px 60px rgba(0,0,0,.6)",
  border: "1px solid rgba(255,255,255,.08)",
};

const iconWrapStyle = {
  display: "flex",
  justifyContent: "center",
  marginBottom: 10,
  animation: "baltoPulse 1.6s ease-in-out infinite",
};

const actionsStyle = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  justifyContent: "center",
  flexWrap: "wrap",
};

const btnStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontWeight: "bold",
};

const btnGhostStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.25)",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  fontWeight: "bold",
};

const pulseCss = `
@keyframes baltoPulse {
  0% { transform: scale(1); opacity: 0.95; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.95; }
}
`;