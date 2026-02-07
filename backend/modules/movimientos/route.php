<?php
// backend/modules/movimientos/route.php
declare(strict_types=1);

if (!function_exists('route_movimientos')) {
  function route_movimientos(string $action): bool
  {
    switch (trim($action)) {

      // ✅ Nuevo: alta rápida de catálogos (selects)
      case 'catalogo_crear':
        require_once __DIR__ . '/catalogo.php';
        return true;
        case 'recibos_confirmar_pago':
  require_once __DIR__ . '/recibos_confirmar_pago.php';
  return true;


      case 'movimientos_listar':
      case 'movimientos_crear':
      case 'movimientos_actualizar':
      case 'movimientos_eliminar':
        require_once __DIR__ . '/movimientos.php';
        return true;

      default:
        return false;
    }
  }
}