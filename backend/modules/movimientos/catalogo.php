<?php
// backend/modules/movimientos/catalogo.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php';       // $pdo
require_once __DIR__ . '/../utils/auditoria.php';    // auditar(...)

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
   JWT helpers (solo para sacar id)
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
function get_id_usuario_from_request(array $body = []): int {
  // 1) JWT (sin verificar firma, solo para sacar id del payload)
  $token = get_bearer_token();
  if ($token !== '' && substr_count($token, '.') === 2) {
    $parts = explode('.', $token);
    $payloadJson = base64url_decode($parts[1] ?? '');
    if ($payloadJson !== '') {
      $payload = json_decode($payloadJson, true);
      if (is_array($payload)) {
        $candidates = [
          $payload['idUsuario'] ?? null,
          $payload['id_usuario'] ?? null,
          $payload['uid'] ?? null,
          $payload['sub'] ?? null,
        ];
        foreach ($candidates as $c) {
          if (is_numeric($c)) {
            $id = (int)$c;
            if ($id > 0) return $id;
          }
        }
      }
    }
  }

  // 2) body / POST / GET
  $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
  if (is_numeric($id)) {
    $id = (int)$id;
    if ($id > 0) return $id;
  }

  return 0;
}

/* =========================
   Auditoría safe
========================= */
function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  if ($idUsuario <= 0) return;
  // modulo fijo: movimientos (consistente con tu auditoría)
  auditar($pdo, $idUsuario, 'movimientos', $accion, $entidad, $idEntidad, $detalle);
}

/* ----------------- PDO check ----------------- */
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('No hay conexión a la base de datos.');
}

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");
} catch (Throwable $e) {
  fail('Error inicializando conexión: ' . $e->getMessage());
}

/* =========================================================
   Solo manejamos action=catalogo_crear
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action !== 'catalogo_crear') {
  fail('Acción no válida en catálogo: ' . $action);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  fail('Método no permitido.', 405);
}

$body = read_json_body();
$src = !empty($body) ? $body : ($_POST ?? []);

$catalogo = isset($src['catalogo']) ? trim((string)$src['catalogo']) : '';
$nombre   = isset($src['nombre']) ? trim((string)$src['nombre']) : '';

if ($catalogo === '') fail('Falta campo: catalogo.');
if ($nombre === '') fail('Falta campo: nombre.');

$idUsuario = get_id_usuario_from_request($src);

/**
 * ✅ Mapa de catálogos permitidos (WHITELIST)
 * Adaptado a tu NUEVA DB "sistema_contable" según la imagen:
 * tablas: clasificaciones, clientes, proveedores, detalles,
 *         cuentas_corrientes, medios_pago, tipos_movimiento, tipos_venta
 *
 * catalogo => [tabla, pk, col_nombre]
 */
$MAP = [
  'clasificaciones'    => ['tabla' => 'clasificaciones',    'pk' => 'id_clasificacion',   'col' => 'nombre'],
  'clientes'           => ['tabla' => 'clientes',           'pk' => 'id_cliente',         'col' => 'nombre'],
  'proveedores'        => ['tabla' => 'proveedores',        'pk' => 'id_proveedor',       'col' => 'nombre'],
  'detalles'           => ['tabla' => 'detalles',           'pk' => 'id_detalle',         'col' => 'nombre'],

  'cuentas_corrientes' => ['tabla' => 'cuentas_corrientes', 'pk' => 'id_cuenta_corriente','col' => 'nombre'],
  'medios_pago'        => ['tabla' => 'medios_pago',        'pk' => 'id_medio_pago',      'col' => 'nombre'],

  // ✅ IMPORTANTE: en tu screenshot la tabla se llama "tipos_movimiento"
  // (no "tipos_movimientoS")
  'tipos_movimiento'   => ['tabla' => 'tipos_movimiento',   'pk' => 'id_tipo_movimiento', 'col' => 'nombre'],
  'tipos_venta'        => ['tabla' => 'tipos_venta',        'pk' => 'id_tipo_venta',      'col' => 'nombre'],
];

if (!isset($MAP[$catalogo])) {
  fail('Catálogo no permitido: ' . $catalogo);
}

$tabla = $MAP[$catalogo]['tabla'];
$pk    = $MAP[$catalogo]['pk'];
$col   = $MAP[$catalogo]['col'];

/* =========================================================
   Normalización: guardamos en MAYÚSCULA
========================================================= */
$nombreNorm = mb_strtoupper($nombre, 'UTF-8');
$nombreNorm = preg_replace('/\s+/u', ' ', trim($nombreNorm));
if ($nombreNorm === '') fail('Nombre inválido.');

/* =========================================================
   Seguridad extra: asegurar identificadores válidos
========================================================= */
$rxIdent = '/^[a-zA-Z0-9_]+$/';
if (!preg_match($rxIdent, $tabla) || !preg_match($rxIdent, $pk) || !preg_match($rxIdent, $col)) {
  fail('Configuración inválida del catálogo.');
}

/* =========================================================
   1) Si ya existe (case-insensitive), devolver el existente
========================================================= */
try {
  // Nota: UPPER(...) funciona bien para ASCII; para tildes depende collation.
  // Como guardás TODO en mayúscula, esto suele alcanzar.
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
        'id' => (int)$ex['id'],
        'nombre' => (string)$ex['nombre'],
        'existente' => true,
      ],
    ]);
  }
} catch (Throwable $e) {
  fail('Error verificando duplicado: ' . $e->getMessage());
}

/* =========================================================
   2) Insertar
========================================================= */
try {
  $stmt = $pdo->prepare("INSERT INTO $tabla ($col) VALUES (:nombre)");
  $stmt->execute([':nombre' => $nombreNorm]);

  $newId = (int)$pdo->lastInsertId();
  if ($newId <= 0) {
    // fallback por si lastInsertId falla (raro)
    $st2 = $pdo->prepare("SELECT $pk AS id
                          FROM $tabla
                          WHERE UPPER($col) = UPPER(:n)
                          ORDER BY $pk DESC
                          LIMIT 1");
    $st2->execute([':n' => $nombreNorm]);
    $r2 = $st2->fetch(PDO::FETCH_ASSOC);
    $newId = (int)($r2['id'] ?? 0);
  }

  // Auditoría
  audit_safe($pdo, $idUsuario, 'catalogo_crear', $tabla, $newId, [
    'catalogo' => $catalogo,
    'nuevo' => [
      'id' => $newId,
      'nombre' => $nombreNorm,
    ],
  ]);

  ok([
    'item' => [
      'id' => $newId,
      'nombre' => $nombreNorm,
      'existente' => false,
    ],
  ]);
} catch (Throwable $e) {
  fail('No se pudo crear en ' . $catalogo . '. ' . $e->getMessage());
}
