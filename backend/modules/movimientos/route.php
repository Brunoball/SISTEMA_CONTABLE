<?php
// backend/modules/movimientos/route.php
declare(strict_types=1);

if (!function_exists('route_movimientos')) {

  function route_movimientos(string $action): bool
  {
    // ✅ CLAVE: hacer visible el $pdo creado en routes/api.php
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {

      case 'catalogo_crear':
        require __DIR__ . '/catalogo.php';
        return true;

      /* ✅ ÓRDENES DE PAGO */
      case 'ordenes_pago_listar':
      case 'ordenes_pago_actualizar':
      case 'ordenes_pago_eliminar':
      case 'ordenes_pago_confirmar_pago':
        require __DIR__ . '/ordenes_pago.php';
        return true;

      /* ✅ RECIBOS */
      case 'recibos_listar':
      case 'recibos_actualizar':
      case 'recibos_eliminar':
      case 'recibos_confirmar_pago':
        require __DIR__ . '/recibos.php';
        return true;

      /* ✅ MOVIMIENTOS */
      case 'movimientos_listar':
      case 'movimientos_periodos_listar':
      case 'movimientos_crear':
      case 'movimientos_crear_batch':
      case 'movimientos_actualizar':     // ✅ NUEVO
      case 'movimientos_eliminar':       // ✅ NUEVO
        require __DIR__ . '/movimientos.php';
        return true;

      /* ✅ VENTAS */
      case 'ventas_listar':
      case 'ventas_crear':
      case 'ventas_crear_batch':
      case 'ventas_actualizar':
      case 'ventas_eliminar':
        require __DIR__ . '/ventas.php';
        return true;

      /* ✅ COMPRAS */
      case 'compras_listar':
      case 'compras_crear':
      case 'compras_actualizar':
      case 'compras_eliminar':
        require __DIR__ . '/compras.php';
        return true;

      default:
        return false;
    }
  }
}
