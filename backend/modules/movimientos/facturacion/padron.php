<?php
declare(strict_types=1);

/**
 * Endpoint: padron_cuit / constancia_cuit
 * Input:
 *  - GET: ?action=movimientos&op=padron_cuit&cuit=20xxxxxxxxx
 *  - GET: ?action=padron_cuit&cuit=20xxxxxxxxx
 *  - JSON body: {"cuit":"20xxxxxxxxx"}
 *
 * Output:
 *  {
 *    ok: true,
 *    data: {
 *      summary: {...},
 *      raw: {...}
 *    }
 *  }
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
    if ($extra !== null) {
      $out['extra'] = $extra;
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('balto_require_session')) {
  function balto_require_session(): void
  {
    if (session_status() !== PHP_SESSION_ACTIVE) {
      @session_start();
    }

    $ok = false;
    if (!empty($_SESSION['user_id']) || !empty($_SESSION['balto_user_id']) || !empty($_SESSION['user'])) {
      $ok = true;
    }

    if (!$ok) {
      json_error("No autorizado (sesión requerida).", 401);
    }
  }
}

if (!function_exists('arr_get')) {
  function arr_get(array $arr, array $path, $default = null) {
    $tmp = $arr;
    foreach ($path as $k) {
      if (!is_array($tmp) || !array_key_exists($k, $tmp)) {
        return $default;
      }
      $tmp = $tmp[$k];
    }
    return $tmp;
  }
}

if (!function_exists('normalize_list')) {
  function normalize_list($value): array {
    if ($value === null) return [];
    if (!is_array($value)) return [$value];

    $isAssoc = array_keys($value) !== range(0, count($value) - 1);
    return $isAssoc ? [$value] : $value;
  }
}

if (!function_exists('pick_persona_root')) {
  function pick_persona_root(array $resp): array
  {
    foreach (['personaReturn', 'return'] as $k) {
      if (isset($resp[$k]) && is_array($resp[$k])) {
        return $resp[$k];
      }
    }

    // por si viniera ya "plano"
    return $resp;
  }
}

balto_require_session();

// Aceptamos tanto action=padron_cuit como op=padron_cuit
$action = strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? '')));
$op     = strtolower(trim((string)($_GET['op'] ?? $_POST['op'] ?? '')));

$validOps = ['padron_cuit', 'constancia_cuit'];

if ($op !== '' && in_array($op, $validOps, true)) {
  // OK
} elseif ($action !== '' && in_array($action, $validOps, true)) {
  // OK
} elseif ($op === '' && $action === '') {
  $op = 'padron_cuit';
} else {
  json_error("Acción no soportada. Use op=padron_cuit o action=padron_cuit.", 400, [
    'action' => $action,
    'op' => $op,
  ]);
}

// input
$raw = file_get_contents('php://input') ?: '';
$body = [];
if ($raw !== '') {
  $tmp = json_decode($raw, true);
  if (is_array($tmp)) {
    $body = $tmp;
  }
}

$cuit = (string)($_GET['cuit'] ?? $_POST['cuit'] ?? ($body['cuit'] ?? ''));
$cuit = preg_replace('/\D+/', '', $cuit ?? '');

if ($cuit === '' || strlen($cuit) !== 11) {
  json_error("CUIT inválido. Debe tener 11 dígitos.", 422);
}

require __DIR__ . '/arca_wsaa.php';
require __DIR__ . '/padron_arca.php';

$config = require __DIR__ . '/arca_config.php';

// sanity config
if (empty($config['cuit'])) {
  json_error("Falta configurar ARCA_CUIT (CUIT representada) en .env o en arca_config.php", 500);
}
if (!file_exists((string)$config['cert_path'])) {
  json_error("No existe certificado: " . $config['cert_path'], 500);
}
if (!file_exists((string)$config['key_path'])) {
  json_error("No existe clave privada: " . $config['key_path'], 500);
}

$mode = $config['mode'] ?? 'homo';
$wsaaWsdl = $config['wsaa'][$mode] ?? null;
if (!$wsaaWsdl) {
  json_error("WSAA WSDL no configurado para mode=$mode", 500);
}

$svcCfg = $config['constancia_inscripcion'] ?? [];
$wsn = (string)($svcCfg['wsn'] ?? 'ws_sr_constancia_inscripcion');

$preferLocal = !empty($svcCfg['prefer_local_wsdl']);
$localWsdl = (string)($svcCfg['local_wsdl'] ?? '');
$remoteWsdl = (string)($svcCfg[$mode . '_wsdl'] ?? '');
$endpoint = (string)($svcCfg[$mode . '_endpoint'] ?? '');

$wsdl = $remoteWsdl;
if ($preferLocal && $localWsdl !== '' && file_exists($localWsdl)) {
  $wsdl = $localWsdl;
}

if ($wsdl === '' || $endpoint === '') {
  json_error("Constancia Inscripción wsdl/endpoint no configurado correctamente (mode=$mode).", 500, [
    'wsdl' => $wsdl,
    'endpoint' => $endpoint,
  ]);
}

// 1) WSAA
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

// 2) WS constancia
$auth = [
  'Token' => $cred['token'],
  'Sign'  => $cred['sign'],
  'Cuit'  => (int)$config['cuit'],
];

try {
  $svc = new ArcaConstanciaInscripcion(
    $wsdl,
    $endpoint,
    (bool)($config['ssl_verify'] ?? true),
    (string)($config['ca_file'] ?? ''),
    (bool)($config['debug_log'] ?? false)
  );

  $resp = $svc->getPersonaV2($auth, (int)$cuit);
} catch (Throwable $e) {
  json_error("Constancia Inscripción error: " . $e->getMessage(), 500);
}

$persona = pick_persona_root($resp);
$datosGenerales = is_array($persona['datosGenerales'] ?? null) ? $persona['datosGenerales'] : [];
$datosRegimenGeneral = is_array($persona['datosRegimenGeneral'] ?? null) ? $persona['datosRegimenGeneral'] : [];
$datosMonotributo = is_array($persona['datosMonotributo'] ?? null) ? $persona['datosMonotributo'] : [];
$domFiscal = is_array($datosGenerales['domicilioFiscal'] ?? null) ? $datosGenerales['domicilioFiscal'] : [];

// impuestos
$impuestos = normalize_list($datosRegimenGeneral['impuesto'] ?? null);
$impuestosDesc = [];
foreach ($impuestos as $imp) {
  if (is_array($imp) && !empty($imp['descripcionImpuesto'])) {
    $impuestosDesc[] = (string)$imp['descripcionImpuesto'];
  }
}
$impuestosDesc = array_values(array_unique($impuestosDesc));

// actividades rg
$actividades = normalize_list($datosRegimenGeneral['actividad'] ?? null);
$actividadesOut = [];
foreach ($actividades as $act) {
  if (!is_array($act)) continue;
  $actividadesOut[] = [
    'descripcion' => (string)($act['descripcionActividad'] ?? ''),
    'id' => isset($act['idActividad']) ? (string)$act['idActividad'] : null,
    'orden' => isset($act['orden']) ? (string)$act['orden'] : null,
    'periodo' => isset($act['periodo']) ? (string)$act['periodo'] : null,
  ];
}

// monotributo
$catMono = $datosMonotributo['categoriaMonotributo'] ?? null;
if (is_array($catMono)) {
  $catMono = $catMono['descripcionCategoria'] ?? $catMono['categoria'] ?? null;
}

// domicilio legible
$domParts = [];
foreach ([
  'direccion',
  'localidad',
  'descripcionProvincia',
  'provincia',
  'codPostal'
] as $k) {
  if (!empty($domFiscal[$k])) {
    $domParts[] = (string)$domFiscal[$k];
  }
}
$domicilio = $domParts ? implode(' - ', $domParts) : null;

// mejor condición IVA visible
$condIva = null;
foreach ($impuestosDesc as $descImp) {
  $descUpper = mb_strtoupper($descImp, 'UTF-8');
  if (str_contains($descUpper, 'IVA')) {
    $condIva = $descImp;
    break;
  }
}
if ($condIva === null && $catMono) {
  $condIva = 'MONOTRIBUTO';
}

$tipoPersona = (string)($datosGenerales['tipoPersona'] ?? '');
$nombreCompleto = trim(
  implode(' ', array_filter([
    (string)($datosGenerales['apellido'] ?? ''),
    (string)($datosGenerales['nombre'] ?? ''),
  ]))
);

$summary = [
  'cuit' => (string)($datosGenerales['idPersona'] ?? $cuit),
  'tipo_persona' => $tipoPersona ?: null,
  'estado_clave' => (string)($datosGenerales['estadoClave'] ?? '') ?: null,
  'tipo_clave' => (string)($datosGenerales['tipoClave'] ?? '') ?: null,

  'razon_social' => (string)($datosGenerales['razonSocial'] ?? '') ?: null,
  'nombre' => (string)($datosGenerales['nombre'] ?? '') ?: null,
  'apellido' => (string)($datosGenerales['apellido'] ?? '') ?: null,
  'nombre_completo' => $nombreCompleto !== '' ? $nombreCompleto : null,

  'domicilio' => $domicilio,
  'domicilio_fiscal' => $domFiscal ?: null,

  'iva' => $condIva,
  'impuestos' => $impuestosDesc,
  'monotributo_categoria' => is_string($catMono) && $catMono !== '' ? $catMono : null,
  'mes_cierre' => isset($datosGenerales['mesCierre']) ? (string)$datosGenerales['mesCierre'] : null,
  'actividad_principal' => $actividadesOut[0]['descripcion'] ?? null,
  'actividades' => $actividadesOut,
];

// si vino error de constancia, lo exponemos
$errorConstancia = $persona['errorConstancia'] ?? null;
$errorRegimenGeneral = $persona['errorRegimenGeneral'] ?? null;
$errorMonotributo = $persona['errorMonotributo'] ?? null;

json_ok([
  'summary' => $summary,
  'raw' => $resp,
  'errors' => [
    'errorConstancia' => $errorConstancia,
    'errorRegimenGeneral' => $errorRegimenGeneral,
    'errorMonotributo' => $errorMonotributo,
  ],
]);