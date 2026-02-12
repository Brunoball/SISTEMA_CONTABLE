<?php
// backend/modules/cuentas_corrientes/route.php
declare(strict_types=1);

if (!function_exists('route_cuentas_corrientes')) {

  function route_cuentas_corrientes(string $action): bool
  {
    // ✅ CLAVE: hacer visible el $pdo creado en routes/api.php
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {

      // ✅ Alias compatibles con tu frontend
      case 'cc_resumen':
      case 'cuentas_corrientes_resumen':
      case 'cc_detalle':
      case 'cuenta_corriente_detalle':
        require __DIR__ . '/cuentas_corrientes.php';
        return true;

      default:
        return false;
    }
  }
}
