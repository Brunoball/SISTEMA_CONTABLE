import BASE_URL from "../../../config/config";

export const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

export function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token = (localStorage.getItem("token") || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

export function buildHeadersMultipart() {
  return buildHeadersGET();
}

export function buildHeadersJSON() {
  return {
    "Content-Type": "application/json",
    ...buildHeadersGET(),
  };
}

export function getUsuarioAuditData() {
  let idUsuarioMaster = 0;
  let idTenant = null;

  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.id_usuario_master ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      0;

    if (Number.isFinite(Number(cand))) {
      idUsuarioMaster = Number(cand);
    }

    const tenantCand =
      u?.idTenant ??
      u?.id_tenant ??
      u?.tenant_id ??
      u?.tenant?.idTenant ??
      null;

    if (
      tenantCand !== null &&
      tenantCand !== undefined &&
      tenantCand !== "" &&
      Number(tenantCand) > 0
    ) {
      idTenant = Number(tenantCand);
    }
  } catch {}

  return { idUsuarioMaster, idTenant };
}

export async function parseJsonOrThrow(res) {
  if (res.status === 401 || res.status === 403) {
    throw new Error("Sesión vencida o no autorizada. Volvé a iniciar sesión.");
  }

  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const preview = text.length > 400 ? `${text.slice(0, 400)}...` : text;
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<")
        ? "La API devolvió HTML en vez de JSON. Revisá la ruta del backend."
        : `Respuesta inválida del servidor. HTTP ${res.status}\n${preview}`
    );
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

  return data;
}

export function normalizeMoneyInput(raw = "") {
  let value = String(raw).replace(/\./g, ",").replace(/[^\d,]/g, "");
  const firstComma = value.indexOf(",");
  if (firstComma !== -1) {
    value =
      value.slice(0, firstComma + 1) +
      value.slice(firstComma + 1).replace(/,/g, "");
  }
  const parts = value.split(",");
  if (parts.length > 1) {
    parts[1] = parts[1].slice(0, 2);
    value = `${parts[0]},${parts[1]}`;
  }
  return value;
}

function parseDecimal(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const normalized = String(raw)
    .trim()
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatFlexibleDecimal(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "";
  const fixed = Number(num).toFixed(2);
  const trimmed = fixed.replace(/\.00$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  return trimmed.replace(".", ",");
}

export function formatMoneyBlur(raw = "") {
  const num = parseDecimal(raw);
  if (num === null || num < 0) return "";
  return formatFlexibleDecimal(num);
}

export function formatMoneyFocus(raw = "") {
  return raw ? String(raw) : "";
}

export function moneyToApi(raw = "") {
  const num = parseDecimal(raw);
  if (num === null) return "";
  return Number(num).toFixed(2);
}

export function moneyToInput(raw = "") {
  const num = parseDecimal(raw);
  if (num === null) return "";
  return formatFlexibleDecimal(num);
}

export function onlyNumbers(v) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

export function toUpperCaseValue(value, fieldType = "text") {
  if (fieldType === "money" || fieldType === "number") return value;
  return String(value ?? "").toUpperCase();
}

export function emptyExtraPriceRow(tipo = null) {
  return {
    id_tipo_precio_stock: String(tipo?.id ?? tipo?.id_tipo_precio_stock ?? ""),
    tipo_nombre: tipo?.nombre || "",
    precio: "",
    margen_porcentaje: "",
    margen_valor: "",
  };
}


export function recalculatePricingGroup({
  cost,
  price,
  marginPct,
  marginValue,
  source,
}) {
  const c = parseDecimal(cost);
  const p = parseDecimal(price);
  const pct = parseDecimal(marginPct);
  const val = parseDecimal(marginValue);

  if (c === null) {
    return {
      price: source === "price" ? formatMoneyBlur(price) : formatMoneyBlur(price),
      marginPct: "",
      marginValue: "",
    };
  }

  if (source === "price") {
    if (p === null) return { price: "", marginPct: "", marginValue: "" };
    const diff = p - c;
    return {
      price: formatFlexibleDecimal(p),
      marginPct: c > 0 ? formatFlexibleDecimal((diff / c) * 100) : "",
      marginValue: formatFlexibleDecimal(diff),
    };
  }

  if (source === "marginPct") {
    if (pct === null) return { price: "", marginPct: "", marginValue: "" };
    const diff = c * (pct / 100);
    return {
      price: formatFlexibleDecimal(c + diff),
      marginPct: formatFlexibleDecimal(pct),
      marginValue: formatFlexibleDecimal(diff),
    };
  }

  if (source === "marginValue") {
    if (val === null) return { price: "", marginPct: "", marginValue: "" };
    return {
      price: formatFlexibleDecimal(c + val),
      marginPct: c > 0 ? formatFlexibleDecimal((val / c) * 100) : "",
      marginValue: formatFlexibleDecimal(val),
    };
  }

  return {
    price: formatMoneyBlur(price),
    marginPct: formatMoneyBlur(marginPct),
    marginValue: formatMoneyBlur(marginValue),
  };
}
