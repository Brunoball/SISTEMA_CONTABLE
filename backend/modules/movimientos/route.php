<?php
// backend/modules/movimientos/route.php
declare(strict_types=1);

if (!function_exists('route_movimientos')) {

  function route_movimientos(string $action): bool
  {
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {

      /* =========================
         ✅ CATÁLOGO
      ========================= */
      case 'catalogo_crear':
        require __DIR__ . '/catalogo.php';
        return true;

      /* =========================
         ✅ CONFIRMAR PAGO (GENÉRICO)
      ========================= */
      case 'movimientos_confirmar_pago':
        require __DIR__ . '/confirmar_pago.php';
        return true;

      /* =========================
         ✅ ÓRDENES DE PAGO
      ========================= */
      case 'ordenes_pago_listar':
      case 'ordenes_pago_actualizar':
      case 'ordenes_pago_eliminar':
      case 'ordenes_pago_confirmar_pago':
        require __DIR__ . '/ordenes_pago.php';
        return true;

      /* =========================
         ✅ RECIBOS
      ========================= */
      case 'recibos_listar':
      case 'recibos_cliente_listar':
      case 'recibos_actualizar':
      case 'recibos_eliminar':
      case 'recibos_confirmar_pago':
        require __DIR__ . '/recibos.php';
        return true;

      /* =========================
         ✅ COMPROBANTES
      ========================= */
      case 'comprobantes_subir':
      case 'comprobantes_info':
      case 'comprobantes_descargar':
      case 'comprobantes_link':
      case 'comprobantes_descargar_token':
      case 'comprobantes_asociar_movimiento':
      case 'comprobantes_asociar_movimientos':
        require __DIR__ . '/comprobantes.php';
        return true;

      /* =========================
         ✅ MOVIMIENTOS
      ========================= */
      case 'movimientos_listar':
      case 'movimientos_periodos_listar':
      case 'movimientos_crear':
      case 'movimientos_crear_batch':
      case 'movimientos_actualizar':
      case 'movimientos_eliminar':
        require __DIR__ . '/movimientos.php';
        return true;

      /* =========================
         ✅ VENTAS  →  movimientos/ventas/
      ========================= */
      case 'ventas_listar':
      case 'ventas_crear':
      case 'ventas_crear_batch':
      case 'ventas_actualizar':
      case 'ventas_eliminar':
        require __DIR__ . '/ventas/ventas.php';
        return true;

      /* =========================
         ✅ CLIENTES FISCALES  →  movimientos/ventas/
      ========================= */
      case 'cliente_fiscal_get':
      case 'cliente_fiscal_upsert':
        require __DIR__ . '/ventas/clientes_fiscales.php';
        return true;

      /* =========================
         ✅ CONFIG FACTURACIÓN
         trae datos del emisor desde config_facturacion
      ========================= */
      case 'config_facturacion_get':
        require __DIR__ . '/ventas/ventas.php';
        return true;

      /* =========================
         ✅ COMPRAS
      ========================= */
      case 'compras_listar':
      case 'compras_crear':
      case 'compras_crear_batch':
      case 'compras_actualizar':
      case 'compras_eliminar':
        require __DIR__ . '/compras.php';
        return true;

      /* =========================
         ✅ ARCA / PADRÓN (consultar CUIT)
      ========================= */
      case 'padron_cuit':
      case 'arca_padron_cuit':
        require __DIR__ . '/facturacion/padron.php';
        return true;

      default:
        return false;
    }
  }
}