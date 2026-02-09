<?php
// backend/modules/global/route.php
declare(strict_types=1);

if (!function_exists('route_global')) {
  function route_global(string $action): bool
  {
    $action = trim((string)$action);

    switch ($action) {

      /* =========================
         LISTAS / GLOBAL
      ========================= */
      case 'global_obtener_listas':
      case 'obtener_listas':
        require_once __DIR__ . '/obtener_listas.php';
        return true;

      /* =========================
         TEMA CLARO / OSCURO
      ========================= */
      case 'usuario_tema_actualizar':          // ✅ TU ACTION REAL
      case 'global_usuario_tema_actualizar':   // ✅ alias opcional
        require_once __DIR__ . '/usuario_tema_actualizar.php';
        return true;

      default:
        return false;
    }
  }
}
