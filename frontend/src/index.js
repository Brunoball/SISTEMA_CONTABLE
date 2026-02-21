// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

import NetworkProvider from "./context/NetworkContext"; // ✅ IMPORT

// =============================
// 🚨 INTERCEPTOR GLOBAL DE FETCH
// (detecta corte de internet)
// =============================
if (!window.__BALTO_FETCH_PATCHED__) {
  window.__BALTO_FETCH_PATCHED__ = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    try {
      return await realFetch(...args);
    } catch (e) {
      try {
        window.dispatchEvent(
          new CustomEvent("net:fetch_failed", {
            detail: { error: String(e) },
          })
        );
      } catch {}
      throw e;
    }
  };
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <NetworkProvider>
      <App />
    </NetworkProvider>
  </React.StrictMode>
);

reportWebVitals();