<?php
// backend/modules/cuentas_corrientes/route.php
declare(strict_types=1);

if (!function_exists('route_cuentas_corrientes')) {
  function route_cuentas_corrientes(string $action): bool
  {
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {
      /* =========================================
         CUENTAS CORRIENTES
      ========================================= */
      case 'cc_resumen':
      case 'cuentas_corrientes_resumen':

      case 'cc_saldos_clientes':
      case 'cc_saldos_proveedores':

      case 'cc_detalle':
      case 'cuenta_corriente_detalle':

      case 'cc_historial_cliente':
      case 'cc_historial_proveedor':

      case 'cc_eliminar_cobro':
        require __DIR__ . '/cuentas_corrientes.php';
        return true;

      /* =========================================
         COMPROBANTES PROPIOS DE CUENTAS CORRIENTES
      ========================================= */
      case 'cc_comprobante_descargar':
      case 'cc_comprobante_info':
        require __DIR__ . '/comprobantes.php';
        return true;

      default:
        return false;
    }
  }
}