<?php
declare(strict_types=1);

require_once __DIR__ . '/otros_ingresos.php';
require_once __DIR__ . '/comprobantes_ingresos.php';

$action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? '')));

switch ($action) {
  case 'otros_ingresos_listar':
    otros_ingresos_listar($pdo);
    break;

  case 'otros_ingresos_obtener':
    otros_ingresos_obtener($pdo);
    break;

  case 'otros_ingresos_crear':
    otros_ingresos_crear($pdo);
    break;

  case 'otros_ingresos_actualizar':
    otros_ingresos_actualizar($pdo);
    break;

  case 'otros_ingresos_eliminar':
    otros_ingresos_eliminar($pdo);
    break;

  case 'otros_ingresos_comprobantes_vincular_movimiento_upload':
    otros_ingresos_comprobantes_vincular_movimiento_upload($pdo);
    break;

  case 'otros_ingresos_comprobantes_info':
    otros_ingresos_comprobantes_info($pdo);
    break;

  case 'otros_ingresos_comprobantes_descargar':
    otros_ingresos_comprobantes_descargar($pdo);
    break;

  case 'otros_ingresos_comprobantes_eliminar':
    otros_ingresos_comprobantes_eliminar($pdo);
    break;

  default:
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
      'exito' => false,
      'mensaje' => 'Acción de otros ingresos no válida.',
      'action_recibida' => $action,
    ], JSON_UNESCAPED_UNICODE);
    break;
}
exit;