<?php
declare(strict_types=1);

/**
 * Endpoint: action=padron_cuit
 * Input:
 *  - GET: ?cuit=20xxxxxxxxx
 *  - o JSON body: {"cuit":"20xxxxxxxxx"}
 *
 * Output: JSON con info del padrón A5.
 */

if (!function_exists('json_ok')) {
  function json_ok($data = [], int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
  }
}
if (!function_exists('json_error')) {
  function json_error(string $msg, int $code = 400, $extra = null): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    $out = ['ok' => false, 'error' => $msg];
    if ($extra !== null) $out['extra'] = $extra;
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('balto_require_session')) {
  /**
   * Guard mínimo: si tu api.php YA valida X-Session antes de llegar acá,
   * esto es redundante, pero no molesta.
   *
   * Ajustalo a tu sistema real si querés.
   */
  function balto_require_session(): void
  {
    if (session_status() !== PHP_SESSION_ACTIVE) {
      @session_start();
    }
    $ok = false;
    if (!empty($_SESSION['user_id']) || !empty($_SESSION['balto_user_id']) || !empty($_SESSION['user'])) {
      $ok = true;
    }
    if (!$ok) json_error("No autorizado (sesión requerida).", 401);
  }
}

balto_require_session();

// action
$action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? '')));
if ($action === '') $action = 'padron_cuit';
if ($action !== 'padron_cuit') json_error("Acción no soportada en padrón: $action", 400);

// input
$raw = file_get_contents('php://input') ?: '';
$body = [];
if ($raw !== '') {
  $tmp = json_decode($raw, true);
  if (is_array($tmp)) $body = $tmp;
}
$cuit = (string)($_GET['cuit'] ?? $_POST['cuit'] ?? ($body['cuit'] ?? ''));
$cuit = preg_replace('/\D+/', '', $cuit ?? '');
if ($cuit === '' || strlen($cuit) !== 11) json_error("CUIT inválido. Debe tener 11 dígitos.", 422);

require __DIR__ . '/arca_wsaa.php';
$config = require __DIR__ . '/arca_config.php';

// config sanity
if (empty($config['cuit'])) {
  json_error("Falta configurar ARCA_CUIT (CUIT representada) en .env o en arca_config.php", 500);
}
if (!file_exists((string)$config['cert_path'])) json_error("No existe certificado: " . $config['cert_path'], 500);
if (!file_exists((string)$config['key_path']))  json_error("No existe clave privada: " . $config['key_path'], 500);

// resolve mode endpoints
$mode = $config['mode'] ?? 'homo';
$wsaaWsdl = $config['wsaa'][$mode] ?? null;
if (!$wsaaWsdl) json_error("WSAA WSDL no configurado para mode=$mode", 500);

$padronCfg = $config['padron_a5'] ?? [];
$wsn = (string)($padronCfg['wsn'] ?? 'ws_sr_padron_a5');

$preferLocal = !empty($padronCfg['prefer_local_wsdl']);
$localWsdl = (string)($padronCfg['local_wsdl'] ?? '');
$remoteWsdl = (string)($padronCfg[$mode . '_wsdl'] ?? '');
$endpoint = (string)($padronCfg[$mode . '_endpoint'] ?? '');

$wsdl = $remoteWsdl;
if ($preferLocal && $localWsdl !== '' && file_exists($localWsdl)) $wsdl = $localWsdl;

if ($wsdl === '' || $endpoint === '') {
  json_error("Padron A5 wsdl/endpoint no configurado correctamente (mode=$mode).", 500, [
    'wsdl' => $wsdl,
    'endpoint' => $endpoint,
  ]);
}

// 1) WSAA -> token/sign para servicio PADRON A5
try {
  $cred = ArcaWsaa::login(
    $wsaaWsdl,
    $wsn,
    (string)$config['cert_path'],
    (string)$config['key_path'],
    (string)($config['key_pass'] ?? ''),
    (bool)($config['ssl_verify'] ?? true),
    (string)($config['ca_file'] ?? ''),
    (bool)($config['ssl_fallback_if_fail'] ?? false),
    (bool)($config['debug_log'] ?? false),
    (string)($config['wsaa_sign']['openssl_bin'] ?? 'openssl')
  );
} catch (Throwable $e) {
  json_error("WSAA error: " . $e->getMessage(), 500);
}

// 2) PADRON A5 -> getPersona(cuit)
require __DIR__ . '/padron_arca.php';

$auth = [
  'Token' => $cred['token'],
  'Sign'  => $cred['sign'],
  'Cuit'  => (int)$config['cuit'],
];

try {
  $padron = new ArcaPadronA5(
    $wsdl,
    $endpoint,
    (bool)($config['ssl_verify'] ?? true),
    (string)($config['ca_file'] ?? ''),
    (bool)($config['debug_log'] ?? false)
  );

  $resp = $padron->getPersona($auth, (int)$cuit);
} catch (Throwable $e) {
  json_error("PADRON A5 error: " . $e->getMessage(), 500);
}

// ⚠️ La respuesta viene “cruda” (cambia según WSDL).
// Para el modal: devolvemos crudo + un “resumen” tentativo si encontramos claves típicas.
$summary = [
  'cuit' => $cuit,
  'razon_social' => null,
  'nombre' => null,
  'apellido' => null,
  'domicilio' => null,
  'iva' => null,
];

$flat = json_encode($resp);
if (is_string($flat) && $flat !== '') {
  // Intento simple de encontrar campos típicos (no rompe si no existen)
  $summary['razon_social'] = $resp['personaReturn']['datosGenerales']['razonSocial']
    ?? $resp['return']['datosGenerales']['razonSocial']
    ?? $resp['datosGenerales']['razonSocial']
    ?? null;

  $summary['nombre'] = $resp['personaReturn']['datosGenerales']['nombre']
    ?? $resp['return']['datosGenerales']['nombre']
    ?? $resp['datosGenerales']['nombre']
    ?? null;

  $summary['apellido'] = $resp['personaReturn']['datosGenerales']['apellido']
    ?? $resp['return']['datosGenerales']['apellido']
    ?? $resp['datosGenerales']['apellido']
    ?? null;

  // domicilio fiscal típico
  $dom = $resp['personaReturn']['datosGenerales']['domicilioFiscal']
    ?? $resp['return']['datosGenerales']['domicilioFiscal']
    ?? $resp['datosGenerales']['domicilioFiscal']
    ?? null;

  if (is_array($dom)) {
    $parts = [];
    foreach (['direccion','calle','numero','localidad','codPostal','provincia'] as $k) {
      if (!empty($dom[$k])) $parts[] = (string)$dom[$k];
    }
    $summary['domicilio'] = $parts ? implode(' ', $parts) : null;
  }

  // IVA (depende de cómo venga)
  $summary['iva'] = $resp['personaReturn']['datosRegimenGeneral']['impuesto']['descripcionImpuesto']
    ?? $resp['return']['datosRegimenGeneral']['impuesto']['descripcionImpuesto']
    ?? null;
}

json_ok([
  'summary' => $summary,
  'raw' => $resp,
]);