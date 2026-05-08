/* =========================================================
   Restricciones de medios de pago por plan SaaS
   - Plan 1 / Básico: no permite CHEQUE ni ECHEQ.
   - Plan 2 / Pro: permite todos los medios.
   Importante: no borra medios de pago de la DB; solo filtra la UI.
========================================================= */

function normalizePlanId(value) {
  const n = Number(value);
  return n === 2 ? 2 : 1;
}

function getUsuarioStorage() {
  try {
    const raw = localStorage.getItem("usuario");
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function getPlanSaasIdActual() {
  const usuario = getUsuarioStorage();

  return normalizePlanId(
    usuario?.idPlan ??
      usuario?.id_plan ??
      usuario?.plan_id ??
      usuario?.planId ??
      usuario?.plan_nivel ??
      1
  );
}

export function esPlanBasicoSaas() {
  return getPlanSaasIdActual() === 1;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function esMedioPagoChequeOEcheq(medio) {
  const nombre = normalizeText(
    typeof medio === "string"
      ? medio
      : medio?.nombre ?? medio?.medio_pago ?? medio?.label ?? medio?.descripcion ?? ""
  );

  if (!nombre) return false;

  return (
    nombre === "CHEQUE" ||
    nombre === "ECHEQ" ||
    nombre === "E CHEQ" ||
    nombre.includes("CHEQUE") ||
    nombre.includes("ECHEQ") ||
    nombre.includes("E CHEQ")
  );
}

export function medioPagoPermitidoPorPlan(medio) {
  if (!esPlanBasicoSaas()) return true;
  return !esMedioPagoChequeOEcheq(medio);
}

export function filtrarMediosPagoPorPlan(mediosPago) {
  const lista = Array.isArray(mediosPago) ? mediosPago : [];
  if (!esPlanBasicoSaas()) return lista;
  return lista.filter((medio) => medioPagoPermitidoPorPlan(medio));
}
