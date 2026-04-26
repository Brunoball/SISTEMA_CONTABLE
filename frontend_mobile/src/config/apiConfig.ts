// src/config/apiConfig.ts

export const API_BASE_URL = 'https://balto.3devsnet.com/api/routes';

export function apiAction(action: string) {
  const base = API_BASE_URL.replace(/\/+$/, '');
  return `${base}/api.php?action=${encodeURIComponent(action)}`;
}

export const LOGIN_ENDPOINT = apiAction('inicio');
export const REGISTER_ENDPOINT = apiAction('registro');