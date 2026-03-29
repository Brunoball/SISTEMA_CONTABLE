<?php
declare(strict_types=1);

// backend/routes/api.php

require_once __DIR__ . '/../config/bootstrap_env.php';

ini_set('display_errors', '1');
ini_set('log_errors', '1');
error_reporting(E_ALL);

@date_default_timezone_set("America/Argentina/Cordoba");
if (function_exists('mb_internal_encoding')) {
  mb_internal_encoding("UTF-8");
}

/* =========================================================
   Helpers
========================================================= */
if (!function_exists('api_json_response')) {
  function api_json_response(array $payload, int $status = 200): void
  {
    if (!headers_sent()) {
      http_response_code($status);
      header('Content-Type: application/json; charset=utf-8');
      header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('api_is_auth_error_message')) {
  function api_is_auth_error_message(string $msg): bool
  {
    $m = mb_strtolower(trim($msg), 'UTF-8');

    return
      str_contains($m, 'no autorizado') ||
      str_contains($m, 'no autorizada') ||
      str_contains($m, 'unauthorized') ||
      str_contains($m, 'sesión') ||
      str_contains($m, 'sesion') ||
      str_contains($m, 'session') ||
      str_contains($m, 'session_key') ||
      str_contains($m, 'x-session') ||
      str_contains($m, 'expirada') ||
      str_contains($m, 'expiró') ||
      str_contains($m, 'expiro') ||
      str_contains($m, 'inválida') ||
      str_contains($m, 'invalida');
  }
}

if (!function_exists('api_is_real_fatal_error')) {
  function api_is_real_fatal_error(?array $err): bool
  {
    if (!$err || !isset($err['type'])) return false;

    return in_array((int)$err['type'], [
      E_ERROR,
      E_PARSE,
      E_CORE_ERROR,
      E_COMPILE_ERROR,
      E_USER_ERROR,
      E_RECOVERABLE_ERROR,
    ], true);
  }
}

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

  if ($sk === '' && isset($_REQUEST['session_key'])) {
    $sk = trim((string)$_REQUEST['session_key']);
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

  if (!api_is_real_fatal_error($err)) {
    return;
  }

  if (!headers_sent()) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  }

  echo json_encode([
    'exito'   => false,
    'fatal'   => true,
    'mensaje' => 'Fatal error en API.',
    'debug'   => [
      'type'    => $err['type']    ?? null,
      'message' => $err['message'] ?? '',
      'file'    => $err['file']    ?? '',
      'line'    => $err['line']    ?? 0,
    ]
  ], JSON_UNESCAPED_UNICODE);
  exit;
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
  api_json_response(["ok" => true], 200);
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

$action      = is_string($action) ? trim($action) : "";
$actionLower = mb_strtolower($action, 'UTF-8');

/* =========================
   Públicas
========================= */
$PUBLIC_ACTIONS = array(
  'inicio',
  'registro',
  'logout',
  'cerrar_sesion',

  'recuperar_contrasena',
  'validar_token_reset',
  'reset_contrasena',

  'validar_token_recuperacion',
  'reset_password',
  'restablecer_contrasena'
);

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
    api_json_response([
      "exito"   => false,
      "mensaje" => "Falta parámetro action."
    ], 400);
  }

  require_once __DIR__ . "/../modules/login/route.php";
  require_once __DIR__ . "/../modules/global/route.php";

  /* =========================================================
     1) PÚBLICAS
  ========================================================= */
  if (in_array($actionLower, $PUBLIC_ACTIONS, true)) {
    if (function_exists("route_login")  && route_login($actionLower))  exit;
    if (function_exists("route_global") && route_global($actionLower)) exit;

    api_json_response([
      "exito"   => false,
      "mensaje" => "Acción pública no válida: $action"
    ], 404);
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

  $_SERVER['X_IDTENANT']               = (string)($ses['idTenant'] ?? '');
  $_SERVER['HTTP_X_IDTENANT']          = (string)($ses['idTenant'] ?? '');
  $_SERVER['HTTP_X_ID_TENANT']         = (string)($ses['idTenant'] ?? '');
  $_SERVER['X_IDUSUARIO_MASTER']       = (string)($ses['idUsuarioMaster'] ?? '');
  $_SERVER['HTTP_X_IDUSUARIO_MASTER']  = (string)($ses['idUsuarioMaster'] ?? '');
  $_SERVER['HTTP_X_ID_USUARIO_MASTER'] = (string)($ses['idUsuarioMaster'] ?? '');

  if (session_status() !== PHP_SESSION_ACTIVE) {
    @session_start();
  }

  $_SESSION['idTenant']      = (int)($ses['idTenant'] ?? 0);
  $_SESSION['tenant_id']     = (int)($ses['idTenant'] ?? 0);
  $_SESSION['balto_user_id'] = (int)($ses['idUsuarioMaster'] ?? 0);
  $_SESSION['user_id']       = (int)($ses['idUsuarioMaster'] ?? 0);

  /* =========================================================
     3) PRIVADAS MASTER ONLY
  ========================================================= */
  if (in_array($actionLower, $MASTER_ONLY_PRIVATE_ACTIONS, true)) {
    if (function_exists("route_global") && route_global($actionLower)) exit;

    api_json_response([
      "exito"   => false,
      "mensaje" => "Acción privada master no válida: $action"
    ], 404);
  }

  /* =========================================================
     4) PRIVADAS TENANT
  ========================================================= */
  require_once __DIR__ . "/../modules/utils/tenant_resolver.php";
  tenant_bootstrap_or_fail();

  require_once __DIR__ . "/../modules/configuracion/route.php";
  require_once __DIR__ . "/../modules/movimientos/route.php";
  require_once __DIR__ . "/../modules/cheques/route.php";
  require_once __DIR__ . "/../modules/flujo_caja/route.php";
  require_once __DIR__ . "/../modules/cuentas_corrientes/route.php";
  require_once __DIR__ . "/../modules/analisis_financiero/route.php";
  require_once __DIR__ . "/../modules/stock/route.php";

  if (function_exists("route_login")               && route_login($actionLower))               exit;
  if (function_exists("route_global")              && route_global($actionLower))              exit;
  if (function_exists("route_configuracion")       && route_configuracion($actionLower))       exit;
  if (function_exists("route_movimientos")         && route_movimientos($actionLower))         exit;
  if (function_exists("route_cheques")             && route_cheques($actionLower))             exit;
  if (function_exists("route_flujo_caja")          && route_flujo_caja($actionLower))          exit;
  if (function_exists("route_cuentas_corrientes")  && route_cuentas_corrientes($actionLower))  exit;
  if (function_exists("route_analisis_financiero") && route_analisis_financiero($actionLower)) exit;
  if (function_exists("route_stock")               && route_stock($actionLower))               exit;

  api_json_response([
    "exito"   => false,
    "mensaje" => "Acción no válida: $action"
  ], 404);

} catch (Throwable $e) {
  $msg         = trim((string)$e->getMessage());
  $isAuthError = api_is_auth_error_message($msg);

  if ($isAuthError) {
    api_json_response([
      "exito"   => false,
      "mensaje" => "Sesión expirada."
    ], 401);
  }

  api_json_response([
    "exito"   => false,
    "mensaje" => "Error en API: " . $msg,
    "debug"   => [
      "archivo" => $e->getFile(),
      "linea"   => $e->getLine()
    ]
  ], 500);
}  