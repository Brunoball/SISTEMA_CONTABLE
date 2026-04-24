// Cambiá esta URL por la ruta real de tu backend si es distinta.
// Ejemplo típico: https://tudominio.com/api
export const API_BASE_URL = 'https://balto.3devsnet.com/api/routes';

export function apiAction(action: string) {
  return `${API_BASE_URL}/api.php?action=${encodeURIComponent(action)}`;
}

export const LOGIN_ENDPOINT = apiAction('inicio');
export const REGISTER_ENDPOINT = apiAction('registro');
