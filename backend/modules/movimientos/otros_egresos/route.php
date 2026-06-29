<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/crud.php';
require_once __DIR__ . '/detalles.php';

$action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? '')));

if ($action === '' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $raw = file_get_contents('php://input');
  if ($raw) {
    $json = json_decode($raw, true);
    if (is_array($json) && isset($json['action'])) {
      $action = strtolower(trim((string)$json['action']));
    }
  }
}

switch ($action) {
  case 'otros_egresos_listar':
    otros_egresos_listar($pdo);
    break;

  case 'otros_egresos_obtener':
    otros_egresos_obtener($pdo);
    break;

  case 'otros_egresos_crear':
    otros_egresos_crear($pdo);
    break;

  case 'otros_egresos_actualizar':
    otros_egresos_actualizar($pdo);
    break;

  case 'otros_egresos_confirmar_pago':
    otros_egresos_confirmar_pago($pdo);
    break;

  case 'otros_egresos_eliminar':
    otros_egresos_eliminar($pdo);
    break;

  case 'otros_egresos_detalles_crear':
    otros_egresos_detalles_crear($pdo);
    break;

  case 'otros_egresos_comprobantes_vincular_movimiento_upload':
  case 'otros_egresos_comprobantes_vincular_movimiento':
  case 'otros_egresos_comprobantes_info':
  case 'otros_egresos_comprobantes_descargar':
  case 'otros_egresos_comprobantes_eliminar':
    require_once __DIR__ . '/../global/comprobantes.php';
    break;


  default:
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
      'exito'           => false,
      'mensaje'         => 'Acción de otros egresos no válida.',
      'action_recibida' => $action,
    ], JSON_UNESCAPED_UNICODE);
    break;
}
exit;