<?php
// backend/modules/movimientos/ventas/clientes_fiscales.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!headers_sent()) {
  if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
  } else {
    header('Access-Control-Allow-Origin: *');
  }
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/*
  ESTE ERA EL ERROR:
  antes estaba:
  require_once dirname(__DIR__) . '/../../utils/auditoria.php';

  y terminaba buscando mal.
*/
require_once __DIR__ . '/../../utils/auditoria.php';

/* =========================================================
   HELPERS BASE
========================================================= */
function cf_ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}

function cf_fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function cf_read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function cf_n_int($v): ?int {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  return (int)$v;
}

function cf_safe_str($v): string {
  return trim((string)($v ?? ''));
}

function cf_digits($v): string {
  return preg_replace('/\D+/', '', (string)($v ?? '')) ?? '';
}

function cf_get_header_value(string $key): string {
  $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = $_SERVER[$serverKey] ?? '';
  if (!is_string($v)) $v = '';
  return trim($v);
}

function cf_get_bearer_token(): string {
  $h = cf_get_header_value('Authorization');
  if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
  if ($h === '') return '';
  if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
  return '';
}

function cf_base64url_decode(string $s): string {
  $s = str_replace(['-', '_'], ['+', '/'], $s);
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  $out = base64_decode($s, true);
  return $out === false ? '' : $out;
}

function cf_get_id_usuario_from_x_session(PDO $pdo): int {
  $sessionKey = cf_get_header_value('X-Session');
  if ($sessionKey === '') return 0;

  try {
    $chk = $pdo->query("SHOW TABLES LIKE 'sesiones'");
    $exists = $chk ? (bool)$chk->fetchColumn() : false;
    if (!$exists) return 0;

    $st = $pdo->prepare("
      SELECT id_usuario
      FROM sesiones
      WHERE session_key = :k
      LIMIT 1
    ");
    $st->execute([':k' => $sessionKey]);
    $id = $st->fetchColumn();
    $id = is_numeric($id) ? (int)$id : 0;
    return $id > 0 ? $id : 0;
  } catch (Throwable $e) {
    return 0;
  }
}

function cf_get_id_usuario_from_request(PDO $pdo, array $body = []): int {
  $token = cf_get_bearer_token();
  if ($token !== '' && substr_count($token, '.') === 2) {
    $parts = explode('.', $token);
    $payloadJson = cf_base64url_decode($parts[1] ?? '');
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

  $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
  if (is_numeric($id)) {
    $id = (int)$id;
    if ($id > 0) return $id;
  }

  $idSess = cf_get_id_usuario_from_x_session($pdo);
  if ($idSess > 0) return $idSess;

  return 0;
}

function cf_audit_safe(PDO $pdo, int $idUsuario, string $accion, $idEntidad, $detalle): void {
  if ($idUsuario <= 0) return;
  auditar($pdo, $idUsuario, 'clientes_fiscales', $accion, 'clientes_fiscales', $idEntidad, $detalle);
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  cf_fail('No hay conexión a la base de datos (PDO no disponible).');
}

/* =========================================================
   NORMALIZADOR DE RESPUESTA
========================================================= */
function cf_format_row(array $row): array {
  return [
    'id_cliente_fiscal' => isset($row['id_cliente_fiscal']) ? (int)$row['id_cliente_fiscal'] : null,
    'id_cliente' => isset($row['id_cliente']) ? (int)$row['id_cliente'] : null,
    'doc_tipo' => isset($row['doc_tipo']) ? (int)$row['doc_tipo'] : 80,
    'doc_nro' => isset($row['doc_nro']) ? (string)$row['doc_nro'] : '',
    'cuit' => array_key_exists('cuit', $row) && $row['cuit'] !== null ? (string)$row['cuit'] : null,
    'razon_social' => isset($row['razon_social']) ? (string)$row['razon_social'] : '',
    'condicion_iva' => isset($row['condicion_iva']) ? (string)$row['condicion_iva'] : '',
    'domicilio' => array_key_exists('domicilio', $row) && $row['domicilio'] !== null ? (string)$row['domicilio'] : null,
    'origen' => isset($row['origen']) ? (string)$row['origen'] : 'manual',
    'activo' => isset($row['activo']) ? (int)$row['activo'] : 1,
    'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : null,
    'updated_at' => isset($row['updated_at']) ? (string)$row['updated_at'] : null,
  ];
}

/* =========================================================
   VALIDACIONES
========================================================= */
function cf_validar_payload_or_fail(array $src): array {
  $idCliente = cf_n_int($src['id_cliente'] ?? null);
  $docTipo = cf_n_int($src['doc_tipo'] ?? 80);
  $docNro = cf_digits($src['doc_nro'] ?? '');
  $cuit = cf_digits($src['cuit'] ?? '');
  $razonSocial = cf_safe_str($src['razon_social'] ?? '');
  $condicionIva = cf_safe_str($src['condicion_iva'] ?? '');
  $domicilio = cf_safe_str($src['domicilio'] ?? '');
  $origen = cf_safe_str($src['origen'] ?? 'manual');
  $activo = cf_n_int($src['activo'] ?? 1);

  if (!$idCliente || $idCliente <= 0) {
    cf_fail('Falta id_cliente.');
  }

  if (!$docTipo || $docTipo <= 0) {
    $docTipo = 80;
  }

  if ($docNro === '') {
    cf_fail('Falta doc_nro.');
  }

  if ($docTipo === 80) {
    if (strlen($docNro) !== 11) {
      cf_fail('El CUIT debe tener 11 dígitos.');
    }
    if ($cuit === '') $cuit = $docNro;
    if (strlen($cuit) !== 11) {
      cf_fail('El campo cuit debe tener 11 dígitos.');
    }
  }

  if ($docTipo === 96) {
    if (!(strlen($docNro) === 7 || strlen($docNro) === 8)) {
      cf_fail('El DNI debe tener 7 u 8 dígitos.');
    }
    if ($cuit === '') $cuit = null;
  }

  if ($razonSocial === '') {
    cf_fail('Falta razon_social.');
  }

  if ($condicionIva === '') {
    cf_fail('Falta condicion_iva.');
  }

  if ($activo === null) $activo = 1;
  if ($origen === '') $origen = 'manual';

  return [
    'id_cliente' => $idCliente,
    'doc_tipo' => $docTipo,
    'doc_nro' => $docNro,
    'cuit' => $cuit !== '' ? $cuit : null,
    'razon_social' => $razonSocial,
    'condicion_iva' => $condicionIva,
    'domicilio' => $domicilio !== '' ? $domicilio : null,
    'origen' => $origen,
    'activo' => (int)$activo,
  ];
}

function cf_check_cliente_exists_or_fail(PDO $pdo, int $idCliente): array {
  $st = $pdo->prepare("
    SELECT id_cliente, nombre, activo, created_at
    FROM clientes
    WHERE id_cliente = :id
    LIMIT 1
  ");
  $st->execute([':id' => $idCliente]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    cf_fail('El cliente indicado no existe.');
  }

  return $row;
}

/* =========================================================
   GET
========================================================= */
function cliente_fiscal_get(PDO $pdo): void {
  $idCliente = cf_n_int($_GET['id_cliente'] ?? $_POST['id_cliente'] ?? null);
  if (!$idCliente || $idCliente <= 0) {
    cf_fail('Falta id_cliente.');
  }

  cf_check_cliente_exists_or_fail($pdo, $idCliente);

  $st = $pdo->prepare("
    SELECT
      id_cliente_fiscal,
      id_cliente,
      doc_tipo,
      doc_nro,
      cuit,
      razon_social,
      condicion_iva,
      domicilio,
      origen,
      activo,
      created_at,
      updated_at
    FROM clientes_fiscales
    WHERE id_cliente = :id_cliente
    LIMIT 1
  ");
  $st->execute([':id_cliente' => $idCliente]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    cf_ok([
      'existe' => false,
      'cliente_fiscal' => null,
    ]);
  }

  cf_ok([
    'existe' => true,
    'cliente_fiscal' => cf_format_row($row),
  ]);
}

/* =========================================================
   UPSERT
========================================================= */
function cliente_fiscal_upsert(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    cf_fail('Método no permitido.', 405);
  }

  $body = cf_read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = cf_get_id_usuario_from_request($pdo, $src);

  $data = cf_validar_payload_or_fail($src);
  $cliente = cf_check_cliente_exists_or_fail($pdo, (int)$data['id_cliente']);

  try {
    $beforeSt = $pdo->prepare("
      SELECT
        id_cliente_fiscal,
        id_cliente,
        doc_tipo,
        doc_nro,
        cuit,
        razon_social,
        condicion_iva,
        domicilio,
        origen,
        activo,
        created_at,
        updated_at
      FROM clientes_fiscales
      WHERE id_cliente = :id_cliente
      LIMIT 1
    ");
    $beforeSt->execute([':id_cliente' => $data['id_cliente']]);
    $before = $beforeSt->fetch(PDO::FETCH_ASSOC);

    $pdo->beginTransaction();

    $sql = "
      INSERT INTO clientes_fiscales (
        id_cliente,
        doc_tipo,
        doc_nro,
        cuit,
        razon_social,
        condicion_iva,
        domicilio,
        origen,
        activo,
        created_at,
        updated_at
      ) VALUES (
        :id_cliente,
        :doc_tipo,
        :doc_nro,
        :cuit,
        :razon_social,
        :condicion_iva,
        :domicilio,
        :origen,
        :activo,
        NOW(),
        NOW()
      )
      ON DUPLICATE KEY UPDATE
        doc_tipo = VALUES(doc_tipo),
        doc_nro = VALUES(doc_nro),
        cuit = VALUES(cuit),
        razon_social = VALUES(razon_social),
        condicion_iva = VALUES(condicion_iva),
        domicilio = VALUES(domicilio),
        origen = VALUES(origen),
        activo = VALUES(activo),
        updated_at = NOW()
    ";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':id_cliente' => $data['id_cliente'],
      ':doc_tipo' => $data['doc_tipo'],
      ':doc_nro' => $data['doc_nro'],
      ':cuit' => $data['cuit'],
      ':razon_social' => $data['razon_social'],
      ':condicion_iva' => $data['condicion_iva'],
      ':domicilio' => $data['domicilio'],
      ':origen' => $data['origen'],
      ':activo' => $data['activo'],
    ]);

    $afterSt = $pdo->prepare("
      SELECT
        id_cliente_fiscal,
        id_cliente,
        doc_tipo,
        doc_nro,
        cuit,
        razon_social,
        condicion_iva,
        domicilio,
        origen,
        activo,
        created_at,
        updated_at
      FROM clientes_fiscales
      WHERE id_cliente = :id_cliente
      LIMIT 1
    ");
    $afterSt->execute([':id_cliente' => $data['id_cliente']]);
    $after = $afterSt->fetch(PDO::FETCH_ASSOC);

    if (!$after) {
      throw new RuntimeException('No se pudo recuperar el registro fiscal guardado.');
    }

    $pdo->commit();

    cf_audit_safe($pdo, $idUsuario, $before ? 'actualizar' : 'crear', (int)$data['id_cliente'], [
      'cliente' => [
        'id_cliente' => (int)$cliente['id_cliente'],
        'nombre' => (string)$cliente['nombre'],
      ],
      'antes' => $before ? cf_format_row($before) : null,
      'despues' => cf_format_row($after),
    ]);

    cf_ok([
      'guardado' => true,
      'cliente_fiscal' => cf_format_row($after),
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    cf_fail('No se pudo guardar/actualizar el cliente fiscal. ' . $e->getMessage());
  }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

switch ($action) {
  case 'cliente_fiscal_get':
    cliente_fiscal_get($pdo);
    break;

  case 'cliente_fiscal_upsert':
    cliente_fiscal_upsert($pdo);
    break;

  default:
    cf_fail('Acción no válida en clientes_fiscales: ' . $action);
    break;
}