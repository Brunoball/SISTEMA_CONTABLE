import * as SecureStore from 'expo-secure-store';

export const STORAGE_KEYS = {
  sessionKey: 'session_key',
  usuario: 'usuario',
  rememberFlag: 'rememberLogin',
  rememberedUser: 'remember_nombre',
  rememberedPass: 'remember_contrasena',
} as const;

export async function saveString(key: string, value: string) {
  await SecureStore.setItemAsync(key, value);
}

export async function getString(key: string) {
  return SecureStore.getItemAsync(key);
}

export async function removeString(key: string) {
  await SecureStore.deleteItemAsync(key);
}

export async function saveJson<T>(key: string, value: T) {
  await saveString(key, JSON.stringify(value));
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getString(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearAuth() {
  await Promise.all([
    removeString(STORAGE_KEYS.sessionKey),
    removeString(STORAGE_KEYS.usuario),
  ]);
}
