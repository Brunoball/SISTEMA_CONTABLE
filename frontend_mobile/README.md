# Balto Mobile

Proyecto base limpio de Balto Mobile en React Native + Expo.

## Ejecutar

```bash
npm install
npx expo install expo-secure-store
npx expo start
```

Con el emulador Android abierto, presionar `a`.

## Configurar backend

Editar `src/config/apiConfig.ts` y poner la URL real de la API.

La app llama a `/api.php?action=inicio` y espera:

```json
{
  "exito": true,
  "session_key": "...",
  "usuario": {}
}
```
