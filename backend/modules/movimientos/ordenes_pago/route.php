<?php
// backend/modules/movimientos/ordenes_pago/route.php
declare(strict_types=1);

if (!function_exists('route_movimientos_ordenes_pago')) {
  function route_movimientos_ordenes_pago(string $action): bool
  {
    $action = strtolower(trim((string)$action));

    switch ($action) {

      /* =========================
         LÓGICA PRINCIPAL ÓRDENES DE PAGO
      ========================= */
      case 'ordenes_pago_listar':
      case 'ordenes_pago_actualizar':
      case 'ordenes_pago_eliminar':
      case 'ordenes_pago_confirmar_pago':
        require __DIR__ . '/ordenes_pago.php';
        return true;

      /* =========================
         COMPROBANTES DE ÓRDENES DE PAGO
      ========================= */
      case 'ordenes_pago_comprobante_subir_y_vincular':
      case 'ordenes_pago_comprobantes_subir_y_vincular':
      case 'ordenes_pago_comprobante_asociar_movimientos':
      case 'ordenes_pago_comprobantes_asociar_movimientos':
      case 'ordenes_pago_comprobante_descargar':
      case 'ordenes_pago_comprobantes_descargar':
      case 'ordenes_pago_comprobante_info':
      case 'ordenes_pago_comprobantes_info':
        global $pdo;
        require_once __DIR__ . '/../global/comprobantes.php';
        return true;

      default:
        return false;
    }
  }
}

/* =========================================================
   EJECUCIÓN DIRECTA SI ESTE ROUTE FUE REQUERIDO
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

if ($action !== '') {
  if (!route_movimientos_ordenes_pago($action)) {
    if (!headers_sent()) {
      header('Content-Type: application/json; charset=utf-8');
      http_response_code(400);
    }
    echo json_encode([
      'exito' => false,
      'mensaje' => 'Acción no válida en ordenes_pago: ' . $action,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }
}