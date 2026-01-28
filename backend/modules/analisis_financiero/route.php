<?php
// backend/modules/analisis_financiero/route.php
declare(strict_types=1);

function route_analisis_financiero(string $action): bool
{
  switch ($action) {
    case 'analisis_financiero_resumen':
      require_once __DIR__ . '/analisis_financiero.php';
      return true;

    default:
      return false;
  }
}
