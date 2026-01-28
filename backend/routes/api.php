<?php
// backend/routes/api.php

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: $origin");
header("Vary: Origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
  exit;
}

date_default_timezone_set('America/Argentina/Cordoba');
mb_internal_encoding('UTF-8');

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

/*
  ✅ Routers por módulo
  (Cada router devuelve true si manejó la acción)
*/
require_once __DIR__ . '/../modules/global/route.php';
require_once __DIR__ . '/../modules/login/route.php';
require_once __DIR__ . '/../modules/movimientos/route.php';
require_once __DIR__ . '/../modules/flujo_caja/route.php';
require_once __DIR__ . '/../modules/cuentas_corrientes/route.php'; // ✅ NUEVO

try {
  if ($action === '') {
    http_response_code(200);
    echo json_encode([
      'exito' => false,
      'mensaje' => 'Falta parámetro action.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ GLOBAL (listas / utilidades)
  if (function_exists('route_global') && route_global($action)) {
    exit;
  }

  // ✅ LOGIN
  if (function_exists('route_login') && route_login($action)) {
    exit;
  }

  // ✅ MOVIMIENTOS
  if (function_exists('route_movimientos') && route_movimientos($action)) {
    exit;
  }

  // ✅ FLUJO CAJA
  if (function_exists('route_flujo_caja') && route_flujo_caja($action)) {
    exit;
  }

  // ✅ CUENTAS CORRIENTES
  if (function_exists('route_cuentas_corrientes') && route_cuentas_corrientes($action)) {
    exit;
  }

  // ❌ Acción no encontrada en ningún router
  http_response_code(200);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Acción no válida: ' . $action
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  http_response_code(200);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error en API: ' . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
