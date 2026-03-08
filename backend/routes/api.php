<?php
declare(strict_types=1);

// backend/routes/api.php

require_once __DIR__ . '/../config/bootstrap_env.php';

ini_set('display_errors', '1');
error_reporting(E_ALL);

@date_default_timezone_set("America/Argentina/Cordoba");
mb_internal_encoding("UTF-8");

/* =========================================================
   session_key query/body -> X-Session
========================================================= */
if (!isset($_SERVER['HTTP_X_SESSION']) || trim((string)($_SERVER['HTTP_X_SESSION'] ?? '')) === '') {
  $sk = '';
  if (isset($_GET['session_key'])) {
    $sk = trim((string)$_GET['session_key']);
  }
  if ($sk === '' && isset($_POST['session_key'])) {
    $sk = trim((string)$_POST['session_key']);
  }
  if ($sk !== '') {
    $_SERVER['HTTP_X_SESSION'] = $sk;
  }
}

/* =========================
   Fatal -> JSON
========================= */
register_shutdown_function(function () {
  $err = error_get_last();
  if (!$err) return;

  if (!headers_sent()) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  } else {
    http_response_code(500);
  }

  echo json_encode([
    'exito' => false,
    'fatal' => true,
    'error' => $err,
  ], JSON_UNESCAPED_UNICODE);
});

/* =========================
   CORS
========================= */
$origin = isset($_SERVER["HTTP_ORIGIN"]) ? (string)$_SERVER["HTTP_ORIGIN"] : '';

if (!headers_sent()) {
  if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
  } else {
    header("Access-Control-Allow-Origin: *");
  }

  header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
  header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Session, Range, X-IdTenant, X-Id-Tenant");
  header("Access-Control-Max-Age: 86400");
  header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
}

if (isset($_SERVER["REQUEST_METHOD"]) && $_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(200);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(["ok" => true], JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Action
========================= */
$action = isset($_GET["action"]) ? $_GET["action"] : (
  isset($_POST["action"]) ? $_POST["action"] : (
    isset($_REQUEST["action"]) ? $_REQUEST["action"] : ''
  )
);

if ($action === '') {
  $action = isset($_GET["accion"]) ? $_GET["accion"] : (
    isset($_POST["accion"]) ? $_POST["accion"] : (
      isset($_REQUEST["accion"]) ? $_REQUEST["accion"] : ''
    )
  );
}

$action = is_string($action) ? trim($action) : "";
$actionLower = mb_strtolower($action);

/* =========================
   Públicas
========================= */
$PUBLIC_ACTIONS = array('inicio', 'registro', 'logout', 'cerrar_sesion');

/* =========================
   Privadas master-only
========================= */
$MASTER_ONLY_PRIVATE_ACTIONS = array(
  'tenant_logo_ver',
  'global_tenant_logo_ver',
  'logo_tenant_ver',
  'ver_logo_tenant',
);

try {
  if ($action === "") {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
      "exito" => false,
      "mensaje" => "Falta parámetro action."
    ), JSON_UNESCAPED_UNICODE);
    exit;
  }

  require_once __DIR__ . "/../modules/global/route.php";
  require_once __DIR__ . "/../modules/login/route.php";

  /* =========================================================
     1) PÚBLICAS
     inicio/registro/logout siguen manejándose como antes
  ========================================================= */
  if (in_array($actionLower, $PUBLIC_ACTIONS, true)) {
    if (function_exists("route_global") && route_global($action)) exit;
    if (function_exists("route_login") && route_login($action)) exit;

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
      "exito" => false,
      "mensaje" => "Acción pública no válida: $action"
    ), JSON_UNESCAPED_UNICODE);
    exit;
  }

  /* =========================================================
     2) PRIVADAS: sesión MASTER
  ========================================================= */
  require_once __DIR__ . "/../config/db_master.php";
  require_once __DIR__ . "/../modules/login/require_session.php";

  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    throw new RuntimeException("PDO master no disponible.");
  }

  $ses = require_session($pdo_master);
  $GLOBALS['SESSION_MASTER'] = $ses;

  $_SERVER['X_IDTENANT'] = (string)($ses['idTenant'] ?? '');
  $_SERVER['HTTP_X_IDTENANT'] = (string)($ses['idTenant'] ?? '');
  $_SERVER['HTTP_X_ID_TENANT'] = (string)($ses['idTenant'] ?? '');
  $_SERVER['X_IDUSUARIO_MASTER'] = (string)($ses['idUsuarioMaster'] ?? '');
  $_SERVER['HTTP_X_IDUSUARIO_MASTER'] = (string)($ses['idUsuarioMaster'] ?? '');
  $_SERVER['HTTP_X_ID_USUARIO_MASTER'] = (string)($ses['idUsuarioMaster'] ?? '');

  if (session_status() !== PHP_SESSION_ACTIVE) {
    @session_start();
  }
  $_SESSION['idTenant'] = (int)($ses['idTenant'] ?? 0);
  $_SESSION['tenant_id'] = (int)($ses['idTenant'] ?? 0);
  $_SESSION['balto_user_id'] = (int)($ses['idUsuarioMaster'] ?? 0);
  $_SESSION['user_id'] = (int)($ses['idUsuarioMaster'] ?? 0);

  /* =========================================================
     3) PRIVADAS MASTER ONLY
  ========================================================= */
  if (in_array($actionLower, $MASTER_ONLY_PRIVATE_ACTIONS, true)) {
    if (function_exists("route_global") && route_global($action)) exit;

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array(
      "exito" => false,
      "mensaje" => "Acción privada master no válida: $action"
    ), JSON_UNESCAPED_UNICODE);
    exit;
  }

  /* =========================================================
     4) PRIVADAS TENANT
  ========================================================= */
  require_once __DIR__ . "/../modules/utils/tenant_resolver.php";
  tenant_bootstrap_or_fail();

  require_once __DIR__ . "/../modules/movimientos/route.php";
  require_once __DIR__ . "/../modules/flujo_caja/route.php";
  require_once __DIR__ . "/../modules/cuentas_corrientes/route.php";
  require_once __DIR__ . "/../modules/analisis_financiero/route.php";
  require_once __DIR__ . "/../modules/global/route.php";

  if (function_exists("route_global") && route_global($action)) exit;
  if (function_exists("route_login") && route_login($action)) exit;
  if (function_exists("route_movimientos") && route_movimientos($action)) exit;
  if (function_exists("route_flujo_caja") && route_flujo_caja($action)) exit;
  if (function_exists("route_cuentas_corrientes") && route_cuentas_corrientes($action)) exit;
  if (function_exists("route_analisis_financiero") && route_analisis_financiero($action)) exit;

  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array(
    "exito" => false,
    "mensaje" => "Acción no válida: $action"
  ), JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  $msg = $e->getMessage();
  $code = 500;

  if (
    stripos($msg, 'no autorizado') !== false ||
    stripos($msg, 'sesión') !== false ||
    stripos($msg, 'session') !== false ||
    stripos($msg, 'unauthorized') !== false
  ) {
    $code = 401;
  }

  if (!headers_sent()) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
  } else {
    http_response_code($code);
  }

  echo json_encode(array(
    "exito" => false,
    "mensaje" => "Error en API: " . $msg
  ), JSON_UNESCAPED_UNICODE);
  exit;
}