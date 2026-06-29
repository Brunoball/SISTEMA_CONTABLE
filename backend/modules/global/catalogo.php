<?php
// backend/modules/movimientos/catalogo.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// ⚠️ Si tu frontend y backend están en el mismo dominio, podés ajustar el ORIGIN a fijo.
// Por ahora lo dejo permisivo como venías (pero habilitando X-Session).
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../core/plan_saas.php';
require_once __DIR__ . '/../../utils/auditoria.php';

/* =========================
   Helpers JSON
========================= */
function ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}
function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

/* =========================
   Auth helpers (multi-tenant)
   - En la estructura nueva el login te valida X-Session en routes/api.php.
   - Ese archivo debería setear el user id en algún lado.
   - Acá intentamos recuperarlo de forma compatible sin romper nada.
========================= */
function base64url_decode(string $s): string {
  $s = str_replace(['-', '_'], ['+', '/'], $s);
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  $out = base64_decode($s, true);
  return $out === false ? '' : $out;
}
function get_bearer_token(): string {
  $h = '';
  if (!empty($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
  elseif (!empty($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];
  $h = trim($h);
  if ($h === '') return '';
  if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
  return '';
}

/**
 * ✅ Intenta obtener idUsuario desde:
 * 1) variables globales que setea routes/api.php (recomendado)
 * 2) JWT (solo leer payload)
 * 3) body/POST/GET (fallback)
 */
function get_id_usuario_from_request(array $body = []): int {
  if (function_exists('mv_secure_auth_user_id')) {
    $id = mv_secure_auth_user_id();
    if ($id > 0) return $id;
  }

  // 1) globals/const (ideal: lo setea routes/api.php tras validar X-Session)
  $candidates = [
    $GLOBALS['AUTH_USER_MASTER_ID'] ?? null,
    $GLOBALS['AUTH_USER_ID'] ?? null,
    $GLOBALS['auth_user_id'] ?? null,
    $GLOBALS['ID_USUARIO'] ?? null,
    (defined('AUTH_USER_ID') ? constant('AUTH_USER_ID') : null),
    (defined('ID_USUARIO') ? constant('ID_USUARIO') : null),
    // si tu resolver guarda algo tipo $GLOBALS['AUTH'] = ['idUsuario'=>...]
    (is_array($GLOBALS['AUTH'] ?? null) ? ($GLOBALS['AUTH']['idUsuario'] ?? null) : null),
  ];
  foreach ($candidates as $c) {
    if (is_numeric($c) && (int)$c > 0) return (int)$c;
  }

  // 2) JWT (sin verificar firma, solo para sacar id del payload)
  $token = get_bearer_token();
  if ($token !== '' && substr_count($token, '.') === 2) {
    $parts = explode('.', $token);
    $payloadJson = base64url_decode($parts[1] ?? '');
    if ($payloadJson !== '') {
      $payload = json_decode($payloadJson, true);
      if (is_array($payload)) {
        $jwtCandidates = [
          $payload['idUsuario'] ?? null,
          $payload['id_usuario'] ?? null,
          $payload['uid'] ?? null,
          $payload['sub'] ?? null,
        ];
        foreach ($jwtCandidates as $c) {
          if (is_numeric($c) && (int)$c > 0) return (int)$c;
        }
      }
    }
  }

  // 3) body / POST / GET
  $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
  if (is_numeric($id) && (int)$id > 0) return (int)$id;

  return 0;
}

/* =========================
   Auditoría safe
========================= */
function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  if ($idUsuario <= 0) return;
  auditar($pdo, $idUsuario, 'movimientos', $accion, $entidad, $idEntidad, $detalle);
}

/* =========================
   ✅ CLAVE: usar $pdo del tenant_resolver
========================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('PDO no disponible. Este módulo debe ejecutarse vía routes/api.php (tenant_resolver).', 500);
}

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");
} catch (Throwable $e) {
  fail('Error inicializando conexión: ' . $e->getMessage(), 500);
}

/* =========================================================
   Solo manejamos action=catalogo_crear
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action !== 'catalogo_crear') {
  fail('Acción no válida en catálogo: ' . $action, 400);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  fail('Método no permitido.', 405);
}

$body = read_json_body();
$src  = !empty($body) ? $body : ($_POST ?? []);

$catalogo = isset($src['catalogo']) ? trim((string)$src['catalogo']) : '';
$nombre   = isset($src['nombre']) ? trim((string)$src['nombre']) : '';

if ($catalogo === '') fail('Falta campo: catalogo.', 400);
if ($nombre === '')   fail('Falta campo: nombre.', 400);

$idUsuario = get_id_usuario_from_request($src);

/**
 * ✅ Mapa de catálogos permitidos (WHITELIST)
 * Tablas del tenant (DB del cliente resuelta por tenant_resolver)
 */
$MAP = [
  'clasificaciones'    => ['tabla' => 'clasificaciones',    'pk' => 'id_clasificacion',    'col' => 'nombre'],
  'clientes'           => ['tabla' => 'clientes',           'pk' => 'id_cliente',          'col' => 'nombre'],
  'proveedores'        => ['tabla' => 'proveedores',        'pk' => 'id_proveedor',        'col' => 'nombre'],
  'detalles'           => ['tabla' => 'detalles',           'pk' => 'id_detalle',          'col' => 'nombre'],
  'cuentas_corrientes' => ['tabla' => 'cuentas_corrientes', 'pk' => 'id_cuenta_corriente', 'col' => 'nombre'],
  'medios_pago'        => ['tabla' => 'medios_pago',        'pk' => 'id_medio_pago',       'col' => 'nombre'],
  'tipos_venta'        => ['tabla' => 'tipos_venta',        'pk' => 'id_tipo_venta',       'col' => 'nombre'],
];

if (!isset($MAP[$catalogo])) {
  fail('Catálogo no permitido: ' . $catalogo, 400);
}

$tabla = $MAP[$catalogo]['tabla'];
$pk    = $MAP[$catalogo]['pk'];
$col   = $MAP[$catalogo]['col'];

/* =========================================================
   Normalización: guardamos en MAYÚSCULA
========================================================= */
$nombreNorm = mb_strtoupper($nombre, 'UTF-8');
$nombreNorm = preg_replace('/\s+/u', ' ', trim($nombreNorm));
if ($nombreNorm === '') fail('Nombre inválido.', 400);

if ($catalogo === 'medios_pago' && mv_plan_saas_medio_pago_bloqueado($nombreNorm)) {
  fail(mv_plan_saas_error_medio_pago_bloqueado(), 403);
}

/* =========================================================
   Seguridad extra: asegurar identificadores válidos
========================================================= */
$rxIdent = '/^[a-zA-Z0-9_]+$/';
if (!preg_match($rxIdent, $tabla) || !preg_match($rxIdent, $pk) || !preg_match($rxIdent, $col)) {
  fail('Configuración inválida del catálogo.', 500);
}

/* =========================================================
   1) Si ya existe (case-insensitive), devolver el existente
========================================================= */
try {
  $sql = "SELECT $pk AS id, $col AS nombre
          FROM $tabla
          WHERE UPPER($col) = UPPER(:n)
          LIMIT 1";
  $st = $pdo->prepare($sql);
  $st->execute([':n' => $nombreNorm]);
  $ex = $st->fetch(PDO::FETCH_ASSOC);

  if ($ex) {
    ok([
      'item' => [
        'id'        => (int)$ex['id'],
        'nombre'    => (string)$ex['nombre'],
        'existente' => true,
      ],
    ]);
  }
} catch (Throwable $e) {
  fail('Error verificando duplicado: ' . $e->getMessage(), 500);
}

/* =========================================================
   2) Insertar
========================================================= */
try {
  $stmt = $pdo->prepare("INSERT INTO $tabla ($col) VALUES (:nombre)");
  $stmt->execute([':nombre' => $nombreNorm]);

  $newId = (int)$pdo->lastInsertId();

  // fallback si lastInsertId no devuelve (según config/driver)
  if ($newId <= 0) {
    $st2 = $pdo->prepare("SELECT $pk AS id
                          FROM $tabla
                          WHERE UPPER($col) = UPPER(:n)
                          ORDER BY $pk DESC
                          LIMIT 1");
    $st2->execute([':n' => $nombreNorm]);
    $r2 = $st2->fetch(PDO::FETCH_ASSOC);
    $newId = (int)($r2['id'] ?? 0);
  }

  audit_safe($pdo, $idUsuario, 'catalogo_crear', $tabla, $newId, [
    'catalogo' => $catalogo,
    'nuevo' => [
      'id'     => $newId,
      'nombre' => $nombreNorm,
    ],
  ]);

  ok([
    'item' => [
      'id'        => $newId,
      'nombre'    => $nombreNorm,
      'existente' => false,
    ],
  ]);
} catch (Throwable $e) {
  fail('No se pudo crear en ' . $catalogo . '. ' . $e->getMessage(), 500);
}
