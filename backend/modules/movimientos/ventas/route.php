<?php
// backend/modules/movimientos/ventas/route.php
declare(strict_types=1);

require_once __DIR__ . '/comun.php';
require_once __DIR__ . '/listar.php';
require_once __DIR__ . '/guardar.php';
require_once __DIR__ . '/fiscal.php';
require_once __DIR__ . '/eliminar.php';
require_once __DIR__ . '/cheques.php';

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

    /* =========================
       CHEQUES DE VENTAS
    ========================= */
    case 'ventas_cheques_guardar':
      ventas_cheques_guardar($pdo);
      break;

    case 'ventas_cheques_obtener':
      ventas_cheques_obtener($pdo);
      break;

    case 'ventas_cheques_listar':
      ventas_cheques_listar($pdo);
      break;

    case 'ventas_cheques_actualizar':
    case 'ventas_cheques_editar':
      ventas_cheques_actualizar($pdo);
      break;

    case 'ventas_cheques_eliminar':
      ventas_cheques_eliminar($pdo);
      break;

    default:
      fail('Acción no válida en ventas: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en ventas: ' . $e->getMessage());
}