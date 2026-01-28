<?php
// backend/modules/global/route.php
declare(strict_types=1);

function route_global(string $action): bool
{
  switch ($action) {

    // ✅ Alias para tu frontend actual
    case 'global_obtener_listas':
    case 'obtener_listas':
      require_once __DIR__ . '/obtener_listas.php';
      return true;

    default:
      return false;
  }
}
