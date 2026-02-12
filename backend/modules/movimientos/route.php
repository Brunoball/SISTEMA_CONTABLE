<?php
// backend/modules/movimientos/route.php
declare(strict_types=1);

if (!function_exists('route_movimientos')) {

  function route_movimientos(string $action): bool
  {
    switch (trim($action)) {

      case 'catalogo_crear':
        require_once __DIR__ . '/catalogo.php';
        return true;

      /* ✅ ÓRDENES DE PAGO (nuevo módulo) */
      case 'ordenes_pago_listar':
      case 'ordenes_pago_actualizar':
      case 'ordenes_pago_eliminar':
      case 'ordenes_pago_confirmar_pago':
        require_once __DIR__ . '/ordenes_pago.php';
        return true;

      /* ✅ RECIBOS */
      case 'recibos_listar':
      case 'recibos_actualizar':
      case 'recibos_eliminar':
      case 'recibos_confirmar_pago':
        require_once __DIR__ . '/recibos.php';
        return true;

      /* CRUD general (Movimientos.jsx) */
      case 'movimientos_listar':
      case 'movimientos_crear':
      case 'movimientos_actualizar':
      case 'movimientos_eliminar':
        require_once __DIR__ . '/movimientos.php';
        return true;

      /* Ventas */
      case 'ventas_listar':
      case 'ventas_crear':
      case 'ventas_crear_batch':
      case 'ventas_actualizar':
      case 'ventas_eliminar':
        require_once __DIR__ . '/ventas.php';
        return true;

      /* Compras */
      case 'compras_listar':
      case 'compras_crear':
      case 'compras_actualizar':
      case 'compras_eliminar':
        require_once __DIR__ . '/compras.php';
        return true;

      default:
        return false;
    }
  }
}
