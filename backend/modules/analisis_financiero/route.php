<?php
// backend/modules/analisis_financiero/route.php
declare(strict_types=1);

function route_analisis_financiero(string $action): bool
{
  switch ($action) {

    case 'analisis_financiero_resumen':
      require_once __DIR__ . '/analisis_financiero.php';
      return true;

    // ✅ NUEVO: periodos reales desde movimientos (como flujo de caja)
    case 'analisis_financiero_periodos':
      require_once __DIR__ . '/analisis_financiero_periodos.php';
      return true;

    default:
      return false;
  }
}
