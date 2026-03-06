<?php
// backend/modules/cuentas_corrientes/route.php
declare(strict_types=1);

if (!function_exists('route_cuentas_corrientes')) {
  function route_cuentas_corrientes(string $action): bool
  {
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {
      case 'cc_resumen':
      case 'cuentas_corrientes_resumen':
      case 'cc_detalle':
      case 'cuenta_corriente_detalle':

      // ✅ NUEVAS acciones
      case 'cc_historial_cliente':
      case 'cc_historial_proveedor':

        require __DIR__ . '/cuentas_corrientes.php';
        return true;

      default:
        return false;
    }
  }
}