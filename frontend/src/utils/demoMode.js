// src/utils/demoMode.js
// Helper central para detectar el plan DEMO desde el usuario guardado en localStorage.
// El plan DEMO se maneja como acceso visual completo (nivel Pro), pero bloquea
// acciones sensibles como facturación real y configuración legal/Tienda Nube.

export function normalizeBaltoPlanId(value, planName = "") {
  const n = Number(value);
  const name = String(planName || "").trim().toLowerCase();

  if (n === 3 || name.includes("demo")) return 3;
  if (n === 2 || name.includes("pro") || name.includes("avanzado")) return 2;
  return 1;
}

export function getBaltoUsuario() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    return u && typeof u === "object" ? u : null;
  } catch {
    return null;
  }
}

export function getBaltoPlanIdFromUsuario(usuario = null) {
  const u = usuario || getBaltoUsuario() || {};
  return normalizeBaltoPlanId(
    u?.idPlan ?? u?.id_plan ?? u?.plan_id ?? u?.plan_nivel ?? 1,
    u?.plan_nombre ?? u?.plan ?? u?.nombre_plan ?? ""
  );
}

export function isBaltoDemoMode(usuario = null) {
  const u = usuario || getBaltoUsuario() || {};
  const name = String(u?.plan_nombre ?? u?.plan ?? u?.nombre_plan ?? "").trim().toLowerCase();
  return getBaltoPlanIdFromUsuario(u) === 3 || name.includes("demo") || Number(u?.es_demo || 0) === 1;
}

export const DEMO_BLOCK_MESSAGE =
  "Modo demo: esta acción está bloqueada para evitar cambios reales. Podés navegar y probar el sistema, pero no emitir comprobantes fiscales ni modificar configuraciones sensibles.";
