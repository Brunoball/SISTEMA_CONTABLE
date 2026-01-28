<?php
// backend/modules/flujo_caja/route.php
declare(strict_types=1);

function route_flujo_caja(string $action): bool
{
  switch ($action) {

    // ✅ Ambos actions usan el MISMO archivo
    case 'flujo_caja_resumen':
    case 'flujo_caja_clientes':
      require_once __DIR__ . '/flujo_caja.php';
      return true;

    default:
      return false;
  }
}
