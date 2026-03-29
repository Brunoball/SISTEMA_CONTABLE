<?php
declare(strict_types=1);

require_once __DIR__ . '/comun.php';
require_once __DIR__ . '/listar.php';
require_once __DIR__ . '/guardar.php';
require_once __DIR__ . '/eliminar.php';
require_once __DIR__ . '/comprobantes.php';

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = strtolower(trim((string)$action));

switch ($action) {

  case 'compras_listar':
    compras_listar($pdo);
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
    compras_eliminar($pdo);
  break;

  case 'compras_eliminar_comprobante':
  case 'comprobante_eliminar_por_movimiento':
    compras_eliminar_comprobante($pdo);
  break;

  default:
    compra_fail('Acción no válida en compras: ' . $action);
}