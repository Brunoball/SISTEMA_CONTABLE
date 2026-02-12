<?php
// backend/modules/global/route.php
declare(strict_types=1);

if (!function_exists('route_global')) {

  /**
   * Router del módulo GLOBAL
   * - NO crea PDO (eso lo hace routes/api.php con tenant_resolver)
   * - Solo despacha acciones a sus handlers
   */
  function route_global(string $action): bool
  {
    // ✅ CLAVE: traer $pdo del scope global (routes/api.php)
    // Si no, los require_once dentro de esta función NO ven $pdo y revientan.
    global $pdo;

    // ✅ Normalización fuerte
    $action = strtolower(trim((string)$action));

    switch ($action) {

      /* =========================
         LISTAS / GLOBAL
      ========================= */
      case 'global_obtener_listas':
      case 'obtener_listas':
      case 'global_listas':
      case 'listas_obtener':
        require __DIR__ . '/obtener_listas.php';
        return true;

      /* =========================
         TEMA CLARO / OSCURO
      ========================= */
      case 'usuario_tema_actualizar':
      case 'global_usuario_tema_actualizar':
      case 'tema_actualizar':
        require __DIR__ . '/usuario_tema_actualizar.php';
        return true;

      default:
        return false;
    }
  }
}
