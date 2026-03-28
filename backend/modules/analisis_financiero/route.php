<?php
// backend/modules/analisis_financiero/route.php
declare(strict_types=1);

if (!function_exists('route_analisis_financiero')) {

  function route_analisis_financiero(string $action): bool
  {
    // ✅ hace visible el $pdo creado en routes/api.php
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {

      case 'analisis_financiero_resumen':
        require __DIR__ . '/analisis_financiero.php';
        return true;

      default:
        return false;
    }
  }
}