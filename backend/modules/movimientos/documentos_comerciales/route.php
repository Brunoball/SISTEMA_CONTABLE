<?php
// backend/modules/movimientos/documentos_comerciales/route.php
declare(strict_types=1);

require_once __DIR__ . '/../ventas/comun.php';
require_once __DIR__ . '/../ventas/guardar.php';
require_once __DIR__ . '/presupuestos.php';
require_once __DIR__ . '/facturas.php';
require_once __DIR__ . '/remitos.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? strtolower(trim($action)) : '';

try {
  switch ($action) {
    /* =========================
       PRESUPUESTOS
       Se mantienen los nombres viejos para no romper el frontend.
    ========================= */
    case 'presupuestos_listar':
      presupuestos_listar($pdo);
      break;

    case 'presupuestos_live_token':
      presupuestos_live_token($pdo);
      break;

    case 'presupuestos_obtener':
      presupuestos_obtener($pdo);
      break;

    case 'presupuestos_crear':
      presupuestos_crear($pdo);
      break;

    case 'presupuestos_documentos_cliente':
    case 'documentos_comerciales_presupuestos_documentos_cliente':
      presupuestos_documentos_cliente($pdo);
      break;

    case 'presupuestos_convertir_venta':
      presupuestos_convertir_venta($pdo);
      break;

    case 'presupuestos_eliminar':
      presupuestos_eliminar($pdo);
      break;

    /* =========================
       FACTURAS
    ========================= */
    case 'documentos_comerciales_facturas_clientes_listar':
      facturas_clientes_listar($pdo);
      break;

    case 'documentos_comerciales_facturas_documentos_cliente':
      facturas_documentos_cliente($pdo);
      break;

    /* =========================
       REMITOS
    ========================= */
    case 'documentos_comerciales_remitos_clientes_listar':
      remitos_clientes_listar($pdo);
      break;

    case 'documentos_comerciales_remitos_documentos_cliente':
      remitos_documentos_cliente($pdo);
      break;

    /* =========================
       DOCUMENTOS COMERCIALES
       Acciones genéricas compatibles con el frontend anterior.
       Usan el parámetro grupo=facturas|remitos|presupuestos.
    ========================= */
    case 'documentos_comerciales_clientes_listar':
      documentos_comerciales_clientes_listar($pdo);
      break;

    case 'documentos_comerciales_documentos_cliente':
      documentos_comerciales_documentos_cliente($pdo);
      break;

    default:
      fail('Acción no válida en documentos comerciales: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en documentos comerciales: ' . $e->getMessage());
}
