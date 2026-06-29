<?php
declare(strict_types=1);

require_once __DIR__ . '/comun.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = strtolower(trim((string)$action));

if (strpos($action, 'compras_comprobantes_') === 0 || in_array($action, ['compras_eliminar_comprobante', 'comprobante_eliminar_por_movimiento'], true)) {
  require_once __DIR__ . '/../global/comprobantes.php';
  exit;
}

require_once __DIR__ . '/listar.php';
require_once __DIR__ . '/guardar.php';

$comprasEliminarPath = __DIR__ . '/eliminar.php';
if (is_file($comprasEliminarPath)) {
  require_once $comprasEliminarPath;
}

switch ($action) {

  case 'compras_listar':
    compras_listar($pdo);
  break;

  case 'compras_obtener':
    if (!function_exists('compras_obtener')) {
      compra_fail('No se pudo cargar la función compras_obtener().');
    }
    compras_obtener($pdo);
  break;

  case 'compras_crear':
    compras_crear($pdo);
  break;

  case 'compras_crear_batch':
    compras_crear_batch($pdo);
  break;

  case 'compras_actualizar':
  case 'compras_editar':
    compras_actualizar($pdo);
  break;

  case 'compras_eliminar':
    if (!function_exists('compras_eliminar')) {
      compra_fail('No se pudo cargar la función compras_eliminar(). Verificá que exista backend/modules/movimientos/compras/eliminar.php y que el archivo no esté vacío o mal copiado.');
    }
    compras_eliminar($pdo);
  break;


  case 'compras_eliminar_comprobante':
  case 'comprobante_eliminar_por_movimiento':
    require_once __DIR__ . '/../global/comprobantes.php';
  break;


  default:
    compra_fail('Acción no válida en compras: ' . $action);
}
