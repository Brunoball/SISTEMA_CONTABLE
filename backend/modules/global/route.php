<?php
// backend/modules/global/route.php
declare(strict_types=1);

if (!function_exists('route_global')) {

  /**
   * Router del módulo GLOBAL
   * - NO crea PDO (eso lo hace routes/api.php con tenant_resolver / db_master)
   * - Solo despacha acciones a sus handlers
   */
  function route_global(string $action): bool
  {
    global $pdo, $pdo_master;

    $action = mb_strtolower(trim((string)$action));

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

      /* =========================
         LOGO DEL TENANT
      ========================= */
      case 'tenant_logo_ver':
      case 'global_tenant_logo_ver':
      case 'logo_tenant_ver':
      case 'ver_logo_tenant':
        require __DIR__ . '/tenant_logo.php';
        return true;

      default:
        return false;
    }
  }
}