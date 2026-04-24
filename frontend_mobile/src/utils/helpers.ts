export function normalizeRol(value: unknown): 'admin' | 'vista' {
  if (value == null) return 'vista';
  const v = String(value).trim().toLowerCase();
  if (['1', 'admin', 'administrator', 'administrador', 'superadmin'].includes(v)) {
    return 'admin';
  }
  return 'vista';
}

export function normalizePlanNivel(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

export function getFriendlyError(error: unknown): string {
  const err = error as { name?: string; message?: string } | undefined;
  if (err?.name === 'AbortError') return 'Tiempo de espera agotado conectando al servidor.';
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'No se pudo conectar con el servidor. Revisá la URL del backend.';
  }
  return 'No se pudo completar la operación. Intentá nuevamente.';
}
