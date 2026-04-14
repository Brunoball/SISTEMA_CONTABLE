// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import NetworkProvider from "./context/NetworkContext";

if (!window.__BALTO_FETCH_PATCHED__) {
  window.__BALTO_FETCH_PATCHED__ = true;

  const realFetch = window.fetch.bind(window);
  const DEFAULT_TIMEOUT_MS = 15000;

  function mergeSignals(signalA, signalB) {
    if (!signalA) return signalB;
    if (!signalB) return signalA;

    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function") {
      return AbortSignal.any([signalA, signalB]);
    }

    return signalB;
  }

  window.fetch = async (input, init = {}) => {
    const ctrl = new AbortController();
    const timeoutMs =
      typeof init?.timeoutMs === "number" && init.timeoutMs > 0
        ? init.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    const timeoutId = setTimeout(() => {
      ctrl.abort();
    }, timeoutMs);

    try {
      const response = await realFetch(input, {
        ...init,
        signal: mergeSignals(init.signal, ctrl.signal),
      });

      try {
        window.dispatchEvent(new CustomEvent("net:fetch_ok"));
      } catch {}

      return response;
    } catch (e) {
      const isAbort = e?.name === "AbortError";

      try {
        window.dispatchEvent(
          new CustomEvent(isAbort ? "net:fetch_timeout" : "net:fetch_failed", {
            detail: {
              error: String(e),
              url: typeof input === "string" ? input : "",
              timeoutMs,
            },
          })
        );
      } catch {}

      throw e;
    } finally {
      clearTimeout(timeoutId);
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