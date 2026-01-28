<?php
// backend/modules/flujo_caja/route.php
declare(strict_types=1);

function route_flujo_caja(string $action): bool
{
  switch ($action) {
    case 'flujo_caja_resumen':
      require_once __DIR__ . '/flujo_caja.php';
      return true;

    default:
      return false;
  }
}
