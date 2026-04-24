import { getString, STORAGE_KEYS } from '../auth/storage';
import { apiAction } from '../config/apiConfig';

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
};

export async function apiRequest<T = any>(action: string, options: ApiOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (options.auth !== false) {
      const sessionKey = await getString(STORAGE_KEYS.sessionKey);
      if (sessionKey) headers['X-Session'] = sessionKey;
    }

    const response = await fetch(apiAction(action), {
      method: options.method ?? 'POST',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`La API devolvió una respuesta inválida: ${text.slice(0, 180)}`);
    }

    if (!response.ok) {
      throw new Error(data?.mensaje || `Error HTTP ${response.status}`);
    }

    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
