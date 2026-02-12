<?php
// backend/modules/analisis_financiero/route.php
declare(strict_types=1);

if (!function_exists('route_analisis_financiero')) {

  function route_analisis_financiero(string $action): bool
  {
    // ✅ CLAVE: hacer visible el $pdo creado en routes/api.php (tenant_bootstrap_or_fail)
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {

      case 'analisis_financiero_resumen':
        require __DIR__ . '/analisis_financiero.php';
        return true;

      // ✅ Periodos reales desde movimientos
      case 'analisis_financiero_periodos':
        require __DIR__ . '/analisis_financiero_periodos.php';
        return true;

      default:
        return false;
    }
  }
}
