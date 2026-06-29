<?php
// backend/modules/movimientos/ventas/route.php
declare(strict_types=1);

require_once __DIR__ . '/comun.php';
require_once __DIR__ . '/listar.php';
require_once __DIR__ . '/guardar.php';
require_once __DIR__ . '/fiscal.php';
require_once __DIR__ . '/eliminar.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

try {
  switch ($action) {
    case 'ventas_listar':
      ventas_listar($pdo);
      break;

    case 'ventas_obtener':
      ventas_obtener($pdo);
      break;

    case 'ventas_live_token':
      ventas_live_token($pdo);
      break;

    case 'ventas_nota_credito_contexto':
      ventas_nota_credito_contexto($pdo);
      break;

    case 'ventas_nota_credito_vincular':
      ventas_nota_credito_vincular($pdo);
      break;

    case 'ventas_crear':
      ventas_crear($pdo);
      break;

    case 'ventas_crear_batch':
      ventas_crear_batch($pdo);
      break;

    case 'ventas_actualizar':
    case 'ventas_editar':
      ventas_actualizar($pdo);
      break;

    case 'ventas_eliminar':
      ventas_eliminar($pdo);
      break;

    case 'config_facturacion_get':
      facturacion_config_get($pdo);
      break;


    case 'ventas_comprobantes_descargar':
    case 'ventas_comprobantes_vincular_movimiento':
    case 'ventas_comprobantes_vincular_movimientos_lote':
    case 'ventas_comprobantes_eliminar':
    case 'ventas_eliminar_comprobante':
      require_once __DIR__ . '/../global/comprobantes.php';
      break;


    default:
      fail('Acción no válida en ventas: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en ventas: ' . $e->getMessage());
}