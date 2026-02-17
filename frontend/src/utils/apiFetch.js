// src/utils/apiFetch.js
import BASE_URL from "../config/config";

/**
 * Fetch centralizado:
 * - Agrega X-Session automáticamente
 * - Si el backend responde 401/403 => dispara evento global "auth:unauthorized"
 */
export async function apiFetch(path, options = {}) {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();

  const headers = new Headers(options.headers || {});
  if (sessionKey) headers.set("X-Session", sessionKey);

  // si mandás JSON, asegurate content-type
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 || res.status === 403) {
    try {
      window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { status: res.status } }));
    } catch {}
  }

  return res;
}
