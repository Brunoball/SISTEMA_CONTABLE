<?php
declare(strict_types=1);

require_once __DIR__ . '/otros_egresos.php';
require_once __DIR__ . '/comprobantes_egresos.php';

$action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? '')));

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

  case 'otros_egresos_eliminar':
    otros_egresos_eliminar($pdo);
    break;

  case 'otros_egresos_comprobantes_vincular_movimiento_upload':
    otros_egresos_comprobantes_vincular_movimiento_upload($pdo);
    break;

  case 'otros_egresos_comprobantes_info':
    otros_egresos_comprobantes_info($pdo);
    break;

  case 'otros_egresos_comprobantes_descargar':
    otros_egresos_comprobantes_descargar($pdo);
    break;

  case 'otros_egresos_comprobantes_eliminar':
    otros_egresos_comprobantes_eliminar($pdo);
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