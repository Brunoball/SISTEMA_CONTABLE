<?php
declare(strict_types=1);

if (!defined('MOVIMIENTOS_RECIBOS_ROUTE_BOOTSTRAP')) {
  define('MOVIMIENTOS_RECIBOS_ROUTE_BOOTSTRAP', true);
}

require_once __DIR__ . '/recibos.php';
require_once __DIR__ . '/comprobantes_recibos.php';
require_once __DIR__ . '/cheques_recibos.php';

if (!function_exists('route_movimientos_recibos')) {
  function route_movimientos_recibos(string $action): bool
  {
    global $pdo;

    $action = strtolower(trim((string)$action));
    if ($action === '') return false;

    if (function_exists('route_recibos_action') && route_recibos_action($pdo, $action)) {
      return true;
    }

    if (function_exists('route_recibos_comprobantes_action') && route_recibos_comprobantes_action($pdo, $action)) {
      return true;
    }

    if (function_exists('route_recibos_cheques_action') && route_recibos_cheques_action($pdo, $action)) {
      return true;
    }

    return false;
  }
}

if (!defined('MOVIMIENTOS_RECIBOS_ROUTE_ONLY')) {
  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  $action = strtolower(trim((string)$action));

  if ($action === '') {
    if (function_exists('fail')) fail('Falta parámetro action.');
    http_response_code(400);
    echo json_encode(['exito' => false, 'mensaje' => 'Falta parámetro action.'], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if (!route_movimientos_recibos($action)) {
    if (function_exists('fail')) fail('Acción no válida en recibos: ' . $action);
    http_response_code(400);
    echo json_encode(['exito' => false, 'mensaje' => 'Acción no válida en recibos: ' . $action], JSON_UNESCAPED_UNICODE);
    exit;
  }
}