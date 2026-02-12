<?php
declare(strict_types=1);

// backend/routes/api.php

require_once __DIR__ . '/../config/bootstrap_env.php';

ini_set('display_errors', '1');
error_reporting(E_ALL);

register_shutdown_function(function () {
  $err = error_get_last();
  if (!$err) return;

  http_response_code(500);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode([
    'exito' => false,
    'fatal' => true,
    'error' => $err,
  ], JSON_UNESCAPED_UNICODE);
});

$origin = $_SERVER["HTTP_ORIGIN"] ?? "*";
header("Access-Control-Allow-Origin: $origin");
header("Vary: Origin");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Session");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=utf-8");

if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
  http_response_code(200);
  echo json_encode(["ok" => true], JSON_UNESCAPED_UNICODE);
  exit;
}

date_default_timezone_set("America/Argentina/Cordoba");
mb_internal_encoding("UTF-8");

$action =
  $_GET["action"] ?? $_POST["action"] ?? $_REQUEST["action"] ??
  $_GET["accion"] ?? $_POST["accion"] ?? $_REQUEST["accion"] ?? "";

$action = is_string($action) ? trim($action) : "";

$PUBLIC_ACTIONS = ['inicio', 'registro', 'logout', 'cerrar_sesion'];

try {
  if ($action === "") {
    echo json_encode(["exito" => false, "mensaje" => "Falta parámetro action."], JSON_UNESCAPED_UNICODE);
    exit;
  }

  require_once __DIR__ . "/../modules/global/route.php";
  require_once __DIR__ . "/../modules/login/route.php";

  if (in_array($action, $PUBLIC_ACTIONS, true)) {
    if (function_exists("route_global") && route_global($action)) exit;
    if (function_exists("route_login") && route_login($action)) exit;

    echo json_encode(["exito" => false, "mensaje" => "Acción pública no válida: $action"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ PRIVADAS: resolver tenant + crear $pdo
  require_once __DIR__ . "/../modules/utils/tenant_resolver.php";
  tenant_bootstrap_or_fail(); // <-- ahora EXISTE y crea $pdo tenant

  require_once __DIR__ . "/../modules/movimientos/route.php";
  require_once __DIR__ . "/../modules/flujo_caja/route.php";
  require_once __DIR__ . "/../modules/cuentas_corrientes/route.php";
  require_once __DIR__ . "/../modules/analisis_financiero/route.php";

  if (function_exists("route_global") && route_global($action)) exit;
  if (function_exists("route_login") && route_login($action)) exit;
  if (function_exists("route_movimientos") && route_movimientos($action)) exit;
  if (function_exists("route_flujo_caja") && route_flujo_caja($action)) exit;
  if (function_exists("route_cuentas_corrientes") && route_cuentas_corrientes($action)) exit;
  if (function_exists("route_analisis_financiero") && route_analisis_financiero($action)) exit;

  echo json_encode(["exito" => false, "mensaje" => "Acción no válida: $action"], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  echo json_encode(["exito" => false, "mensaje" => "Error en API: " . $e->getMessage()], JSON_UNESCAPED_UNICODE);
  exit;
}
