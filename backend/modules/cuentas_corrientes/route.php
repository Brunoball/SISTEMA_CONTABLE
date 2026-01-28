<?php
// backend/modules/cuentas_corrientes/route.php
declare(strict_types=1);

function route_cuentas_corrientes(string $action): bool
{
  switch ($action) {

    // ✅ Alias compatibles con tu frontend
    case 'cc_resumen':
    case 'cuentas_corrientes_resumen':
    case 'cc_detalle':
    case 'cuenta_corriente_detalle':
      require_once __DIR__ . '/cuentas_corrientes.php';
      return true;

    default:
      return false;
  }
}
