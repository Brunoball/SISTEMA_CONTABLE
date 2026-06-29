<?php
// backend/modules/movimientos/ventas/clientes_fiscales.php
// Maneja datos fiscales centralizados para clientes y proveedores.
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

    $st = $pdo->prepare("SELECT id_usuario FROM sesiones WHERE session_key = :k LIMIT 1");
    $st->execute([':k' => $sessionKey]);
    $id = $st->fetchColumn();
    $id = is_numeric($id) ? (int)$id : 0;
    return $id > 0 ? $id : 0;
  } catch (Throwable $e) {
    return 0;
  }
}

function cf_get_id_usuario_from_request(PDO $pdo, array $body = []): int {

  if (function_exists('mv_secure_auth_user_id')) {
    $id = mv_secure_auth_user_id();
    if ($id > 0) return $id;
  }

  $id = (int)($GLOBALS['AUTH_USER_MASTER_ID'] ?? 0);
  if ($id > 0) return $id;

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

function cf_current_action(): string {
  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  return strtolower(trim((string)$action));
}

function cf_tipo_entidad_from_request(array $src = []): string {
  $raw = strtolower(cf_safe_str($src['tipo_entidad'] ?? $src['entidad_tipo'] ?? $src['entidad'] ?? ''));
  if (in_array($raw, ['proveedor', 'proveedores', 'provider', 'supplier'], true)) return 'proveedor';
  if (in_array($raw, ['cliente', 'clientes', 'client', 'customer'], true)) return 'cliente';

  $action = cf_current_action();
  if (strpos($action, 'proveedor_fiscal_') === 0) return 'proveedor';
  return 'cliente';
}

function cf_entity_label(string $tipoEntidad): string {
  return $tipoEntidad === 'proveedor' ? 'proveedor' : 'cliente';
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
   NORMALIZADORES
========================================================= */
function cf_format_row(array $row): array {
  $tipo = cf_safe_str($row['tipo_entidad'] ?? '');
  if ($tipo === '') $tipo = !empty($row['id_proveedor']) ? 'proveedor' : 'cliente';

  return [
    'id_cliente_fiscal' => isset($row['id_cliente_fiscal']) ? (int)$row['id_cliente_fiscal'] : null,
    'tipo_entidad' => $tipo === 'proveedor' ? 'proveedor' : 'cliente',
    'id_cliente' => array_key_exists('id_cliente', $row) && $row['id_cliente'] !== null ? (int)$row['id_cliente'] : null,
    'id_proveedor' => array_key_exists('id_proveedor', $row) && $row['id_proveedor'] !== null ? (int)$row['id_proveedor'] : null,
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

function cf_norm_nombre_cliente(string $nombre): string {
  $nombre = preg_replace('/\s+/u', ' ', trim($nombre)) ?? trim($nombre);
  if (function_exists('mb_strtoupper')) return mb_strtoupper($nombre, 'UTF-8');
  return strtoupper($nombre);
}

function cf_format_cliente_row(array $row): array {
  return [
    'id_cliente' => isset($row['id_cliente']) ? (int)$row['id_cliente'] : null,
    'id' => isset($row['id_cliente']) ? (int)$row['id_cliente'] : null,
    'nombre' => isset($row['nombre']) ? (string)$row['nombre'] : '',
    'activo' => isset($row['activo']) ? (int)$row['activo'] : 1,
    'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : null,
  ];
}

function cf_format_proveedor_row(array $row): array {
  return [
    'id_proveedor' => isset($row['id_proveedor']) ? (int)$row['id_proveedor'] : null,
    'id' => isset($row['id_proveedor']) ? (int)$row['id_proveedor'] : null,
    'nombre' => isset($row['nombre']) ? (string)$row['nombre'] : '',
    'activo' => isset($row['activo']) ? (int)$row['activo'] : 1,
    'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : null,
  ];
}

function cf_sql_digits_expr(string $column): string {
  return "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE($column, ''), '-', ''), '.', ''), ' ', ''), '/', ''), '_', '')";
}

function cf_same_str($a, $b): bool {
  return cf_norm_nombre_cliente(cf_safe_str($a)) === cf_norm_nombre_cliente(cf_safe_str($b));
}

function cf_same_nullable_str($a, $b): bool {
  return cf_safe_str($a) === cf_safe_str($b);
}

function cf_fiscal_tiene_mismos_datos(array $fiscal, array $data): bool {
  return
    cf_safe_str($fiscal['tipo_entidad'] ?? 'cliente') === cf_safe_str($data['tipo_entidad'] ?? 'cliente') &&
    (int)($fiscal['id_cliente'] ?? 0) === (int)($data['id_cliente'] ?? 0) &&
    (int)($fiscal['id_proveedor'] ?? 0) === (int)($data['id_proveedor'] ?? 0) &&
    (int)($fiscal['doc_tipo'] ?? 80) === (int)($data['doc_tipo'] ?? 80) &&
    cf_digits($fiscal['doc_nro'] ?? '') === cf_digits($data['doc_nro'] ?? '') &&
    cf_digits($fiscal['cuit'] ?? '') === cf_digits($data['cuit'] ?? '') &&
    cf_same_str($fiscal['razon_social'] ?? '', $data['razon_social'] ?? '') &&
    cf_same_nullable_str($fiscal['condicion_iva'] ?? '', $data['condicion_iva'] ?? '') &&
    cf_same_nullable_str($fiscal['domicilio'] ?? '', $data['domicilio'] ?? '') &&
    (int)($fiscal['activo'] ?? 1) === (int)($data['activo'] ?? 1);
}

/* =========================================================
   VALIDACIONES
========================================================= */
function cf_validar_payload_or_fail(array $src): array {
  $tipoEntidad = cf_tipo_entidad_from_request($src);
  $idCliente = cf_n_int($src['id_cliente'] ?? null);
  $idProveedor = cf_n_int($src['id_proveedor'] ?? null);
  $docTipo = cf_n_int($src['doc_tipo'] ?? 80);
  $docNro = cf_digits($src['doc_nro'] ?? '');
  $cuit = cf_digits($src['cuit'] ?? '');
  $razonSocial = cf_safe_str($src['razon_social'] ?? '');
  $condicionIva = cf_safe_str($src['condicion_iva'] ?? '');
  $domicilio = cf_safe_str($src['domicilio'] ?? '');
  $origen = cf_safe_str($src['origen'] ?? 'manual');
  $activo = cf_n_int($src['activo'] ?? 1);

  if ($tipoEntidad === 'cliente') {
    if (!$idCliente || $idCliente <= 0) cf_fail('Falta id_cliente.');
    $idProveedor = null;
  } else {
    if (!$idProveedor || $idProveedor <= 0) cf_fail('Falta id_proveedor.');
    $idCliente = null;
  }

  if (!$docTipo || $docTipo <= 0) $docTipo = 80;
  if ($docNro === '') cf_fail('Falta doc_nro.');

  if ($docTipo === 80) {
    if (strlen($docNro) !== 11) cf_fail('El CUIT debe tener 11 dígitos.');
    if ($cuit === '') $cuit = $docNro;
    if (strlen($cuit) !== 11) cf_fail('El campo cuit debe tener 11 dígitos.');
  }

  if ($docTipo === 96) {
    if (!(strlen($docNro) === 7 || strlen($docNro) === 8)) cf_fail('El DNI debe tener 7 u 8 dígitos.');
    if ($cuit === '') $cuit = null;
  }

  if ($razonSocial === '') cf_fail('Falta razon_social.');
  if ($condicionIva === '') cf_fail('Falta condicion_iva.');
  if ($activo === null) $activo = 1;
  if ($origen === '') $origen = 'manual';

  return [
    'tipo_entidad' => $tipoEntidad,
    'id_cliente' => $idCliente,
    'id_proveedor' => $idProveedor,
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

/* =========================================================
   CLIENTES / PROVEEDORES SIMPLES
========================================================= */
function cf_get_cliente_by_id(PDO $pdo, int $idCliente): ?array {
  if ($idCliente <= 0) return null;
  $st = $pdo->prepare("SELECT id_cliente, nombre, activo, created_at FROM clientes WHERE id_cliente = :id LIMIT 1");
  $st->execute([':id' => $idCliente]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_get_proveedor_by_id(PDO $pdo, int $idProveedor): ?array {
  if ($idProveedor <= 0) return null;
  $st = $pdo->prepare("SELECT id_proveedor, nombre, activo, created_at FROM proveedores WHERE id_proveedor = :id LIMIT 1");
  $st->execute([':id' => $idProveedor]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_check_cliente_exists_or_fail(PDO $pdo, int $idCliente): array {
  $row = cf_get_cliente_by_id($pdo, $idCliente);
  if (!$row) cf_fail('El cliente indicado no existe.');
  return $row;
}

function cf_check_proveedor_exists_or_fail(PDO $pdo, int $idProveedor): array {
  $row = cf_get_proveedor_by_id($pdo, $idProveedor);
  if (!$row) cf_fail('El proveedor indicado no existe.');
  return $row;
}

function cf_find_cliente_by_nombre(PDO $pdo, string $nombre): ?array {
  $nombre = cf_norm_nombre_cliente($nombre);
  if ($nombre === '') return null;

  $st = $pdo->prepare("SELECT id_cliente, nombre, activo, created_at FROM clientes WHERE UPPER(nombre) = UPPER(:nombre) ORDER BY activo DESC, id_cliente ASC LIMIT 1");
  $st->execute([':nombre' => $nombre]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_find_proveedor_by_nombre(PDO $pdo, string $nombre): ?array {
  $nombre = cf_norm_nombre_cliente($nombre);
  if ($nombre === '') return null;

  $st = $pdo->prepare("SELECT id_proveedor, nombre, activo, created_at FROM proveedores WHERE UPPER(nombre) = UPPER(:nombre) ORDER BY activo DESC, id_proveedor ASC LIMIT 1");
  $st->execute([':nombre' => $nombre]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_find_cliente_by_cuit(PDO $pdo, string $cuit): ?array {
  $cuit = cf_digits($cuit);
  if (strlen($cuit) !== 11) return null;

  $cuitExpr = cf_sql_digits_expr('cf.cuit');
  $docExpr = cf_sql_digits_expr('cf.doc_nro');
  $st = $pdo->prepare("
    SELECT c.id_cliente, c.nombre, c.activo, c.created_at
    FROM clientes_fiscales cf
    INNER JOIN clientes c ON c.id_cliente = cf.id_cliente
    WHERE cf.tipo_entidad = 'cliente'
      AND (cf.cuit = :cuit_1 OR cf.doc_nro = :cuit_2 OR $cuitExpr = :cuit_3 OR $docExpr = :cuit_4)
    ORDER BY cf.activo DESC, c.activo DESC, cf.id_cliente_fiscal ASC, c.id_cliente ASC
    LIMIT 1
  ");
  $st->execute([':cuit_1' => $cuit, ':cuit_2' => $cuit, ':cuit_3' => $cuit, ':cuit_4' => $cuit]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_find_proveedor_by_cuit(PDO $pdo, string $cuit): ?array {
  $cuit = cf_digits($cuit);
  if (strlen($cuit) !== 11) return null;

  $cuitExpr = cf_sql_digits_expr('cf.cuit');
  $docExpr = cf_sql_digits_expr('cf.doc_nro');
  $st = $pdo->prepare("
    SELECT p.id_proveedor, p.nombre, p.activo, p.created_at
    FROM clientes_fiscales cf
    INNER JOIN proveedores p ON p.id_proveedor = cf.id_proveedor
    WHERE cf.tipo_entidad = 'proveedor'
      AND (cf.cuit = :cuit_1 OR cf.doc_nro = :cuit_2 OR $cuitExpr = :cuit_3 OR $docExpr = :cuit_4)
    ORDER BY cf.activo DESC, p.activo DESC, cf.id_cliente_fiscal ASC, p.id_proveedor ASC
    LIMIT 1
  ");
  $st->execute([':cuit_1' => $cuit, ':cuit_2' => $cuit, ':cuit_3' => $cuit, ':cuit_4' => $cuit]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_crear_cliente_simple(PDO $pdo, string $nombre): array {
  $nombre = cf_norm_nombre_cliente($nombre);
  if ($nombre === '') throw new RuntimeException('No se pudo crear el cliente porque la razón social está vacía.');

  $existente = cf_find_cliente_by_nombre($pdo, $nombre);
  if ($existente) {
    if ((int)($existente['activo'] ?? 1) !== 1) {
      $up = $pdo->prepare("UPDATE clientes SET activo = 1 WHERE id_cliente = :id");
      $up->execute([':id' => (int)$existente['id_cliente']]);
      $existente['activo'] = 1;
    }
    return $existente;
  }

  $st = $pdo->prepare("INSERT INTO clientes (nombre, activo) VALUES (:nombre, 1)");
  $st->execute([':nombre' => $nombre]);
  $id = (int)$pdo->lastInsertId();
  $row = cf_get_cliente_by_id($pdo, $id);
  if (!$row) throw new RuntimeException('Se creó el cliente, pero no se pudo recuperarlo.');
  return $row;
}

function cf_crear_proveedor_simple(PDO $pdo, string $nombre): array {
  $nombre = cf_norm_nombre_cliente($nombre);
  if ($nombre === '') throw new RuntimeException('No se pudo crear el proveedor porque la razón social está vacía.');

  $existente = cf_find_proveedor_by_nombre($pdo, $nombre);
  if ($existente) {
    if ((int)($existente['activo'] ?? 1) !== 1) {
      $up = $pdo->prepare("UPDATE proveedores SET activo = 1 WHERE id_proveedor = :id");
      $up->execute([':id' => (int)$existente['id_proveedor']]);
      $existente['activo'] = 1;
    }
    return $existente;
  }

  $st = $pdo->prepare("INSERT INTO proveedores (nombre, activo) VALUES (:nombre, 1)");
  $st->execute([':nombre' => $nombre]);
  $id = (int)$pdo->lastInsertId();
  $row = cf_get_proveedor_by_id($pdo, $id);
  if (!$row) throw new RuntimeException('Se creó el proveedor, pero no se pudo recuperarlo.');
  return $row;
}

/* =========================================================
   FISCALES
========================================================= */
function cf_fiscal_select_sql(): string {
  return "
    SELECT
      id_cliente_fiscal,
      tipo_entidad,
      id_cliente,
      id_proveedor,
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
  ";
}

function cf_find_cliente_fiscal_row_by_entidad(PDO $pdo, string $tipoEntidad, int $idEntidad): ?array {
  if ($idEntidad <= 0) return null;
  $tipoEntidad = $tipoEntidad === 'proveedor' ? 'proveedor' : 'cliente';
  $col = $tipoEntidad === 'proveedor' ? 'id_proveedor' : 'id_cliente';

  $st = $pdo->prepare(cf_fiscal_select_sql() . "
    WHERE tipo_entidad = :tipo_entidad AND $col = :id_entidad
    ORDER BY activo DESC, id_cliente_fiscal ASC
    LIMIT 1
  ");
  $st->execute([':tipo_entidad' => $tipoEntidad, ':id_entidad' => $idEntidad]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function cf_find_cliente_fiscal_row_by_cliente(PDO $pdo, int $idCliente): ?array {
  return cf_find_cliente_fiscal_row_by_entidad($pdo, 'cliente', $idCliente);
}

function cf_find_cliente_fiscal_row_by_proveedor(PDO $pdo, int $idProveedor): ?array {
  return cf_find_cliente_fiscal_row_by_entidad($pdo, 'proveedor', $idProveedor);
}

function cf_find_cliente_fiscal_by_cuit(PDO $pdo, string $cuit, string $tipoEntidad = 'cliente'): ?array {
  $cuit = cf_digits($cuit);
  if (strlen($cuit) !== 11) return null;

  $tipoEntidad = $tipoEntidad === 'proveedor' ? 'proveedor' : 'cliente';
  $cuitExpr = cf_sql_digits_expr('cuit');
  $docExpr = cf_sql_digits_expr('doc_nro');
  $st = $pdo->prepare(cf_fiscal_select_sql() . "
    WHERE tipo_entidad = :tipo_entidad
      AND (cuit = :cuit_1 OR doc_nro = :cuit_2 OR $cuitExpr = :cuit_3 OR $docExpr = :cuit_4)
    ORDER BY activo DESC, id_cliente_fiscal ASC
    LIMIT 1
  ");
  $st->execute([
    ':tipo_entidad' => $tipoEntidad,
    ':cuit_1' => $cuit,
    ':cuit_2' => $cuit,
    ':cuit_3' => $cuit,
    ':cuit_4' => $cuit,
  ]);
  $fiscal = $st->fetch(PDO::FETCH_ASSOC);
  if (!$fiscal) return null;

  if ($tipoEntidad === 'proveedor') {
    $idProveedor = (int)($fiscal['id_proveedor'] ?? 0);
    if ($idProveedor <= 0) return null;
    $proveedor = cf_get_proveedor_by_id($pdo, $idProveedor);
    if (!$proveedor) return null;
    return ['proveedor' => $proveedor, 'cliente_fiscal' => $fiscal];
  }

  $idCliente = (int)($fiscal['id_cliente'] ?? 0);
  if ($idCliente <= 0) return null;
  $cliente = cf_get_cliente_by_id($pdo, $idCliente);
  if (!$cliente) return null;
  return ['cliente' => $cliente, 'cliente_fiscal' => $fiscal];
}

function cf_find_cliente_fiscal_by_cliente(PDO $pdo, int $idCliente): ?array {
  $fiscal = cf_find_cliente_fiscal_row_by_cliente($pdo, $idCliente);
  if (!$fiscal) return null;
  $cliente = cf_get_cliente_by_id($pdo, (int)$fiscal['id_cliente']);
  if (!$cliente) return null;
  return ['cliente' => $cliente, 'cliente_fiscal' => $fiscal];
}

function cf_find_cliente_fiscal_by_proveedor(PDO $pdo, int $idProveedor): ?array {
  $fiscal = cf_find_cliente_fiscal_row_by_proveedor($pdo, $idProveedor);
  if (!$fiscal) return null;
  $proveedor = cf_get_proveedor_by_id($pdo, (int)$fiscal['id_proveedor']);
  if (!$proveedor) return null;
  return ['proveedor' => $proveedor, 'cliente_fiscal' => $fiscal];
}

function cf_upsert_cliente_fiscal(PDO $pdo, array $data): array {
  $tipoEntidad = ($data['tipo_entidad'] ?? 'cliente') === 'proveedor' ? 'proveedor' : 'cliente';
  $idCliente = $tipoEntidad === 'cliente' ? (int)($data['id_cliente'] ?? 0) : null;
  $idProveedor = $tipoEntidad === 'proveedor' ? (int)($data['id_proveedor'] ?? 0) : null;
  $idEntidad = $tipoEntidad === 'proveedor' ? (int)$idProveedor : (int)$idCliente;

  if ($idEntidad <= 0) {
    throw new RuntimeException('No se pudo guardar datos fiscales: falta entidad relacionada.');
  }

  $before = cf_find_cliente_fiscal_row_by_entidad($pdo, $tipoEntidad, $idEntidad);

  if (!$before && !empty($data['cuit'])) {
    $porCuit = cf_find_cliente_fiscal_by_cuit($pdo, (string)$data['cuit'], $tipoEntidad);
    if ($porCuit && !empty($porCuit['cliente_fiscal'])) $before = $porCuit['cliente_fiscal'];
  }

  if ($before) {
    if (cf_fiscal_tiene_mismos_datos($before, $data)) return $before;

    $st = $pdo->prepare("
      UPDATE clientes_fiscales
      SET
        tipo_entidad = :tipo_entidad,
        id_cliente = :id_cliente,
        id_proveedor = :id_proveedor,
        doc_tipo = :doc_tipo,
        doc_nro = :doc_nro,
        cuit = :cuit,
        razon_social = :razon_social,
        condicion_iva = :condicion_iva,
        domicilio = :domicilio,
        origen = :origen,
        activo = :activo,
        updated_at = NOW()
      WHERE id_cliente_fiscal = :id_cliente_fiscal
      LIMIT 1
    ");
    $st->execute([
      ':tipo_entidad' => $tipoEntidad,
      ':id_cliente' => $idCliente,
      ':id_proveedor' => $idProveedor,
      ':doc_tipo' => (int)$data['doc_tipo'],
      ':doc_nro' => (string)$data['doc_nro'],
      ':cuit' => !empty($data['cuit']) ? $data['cuit'] : null,
      ':razon_social' => (string)$data['razon_social'],
      ':condicion_iva' => (string)$data['condicion_iva'],
      ':domicilio' => !empty($data['domicilio']) ? $data['domicilio'] : null,
      ':origen' => (string)$data['origen'],
      ':activo' => (int)$data['activo'],
      ':id_cliente_fiscal' => (int)$before['id_cliente_fiscal'],
    ]);

    $after = cf_find_cliente_fiscal_row_by_entidad($pdo, $tipoEntidad, $idEntidad);
    if (!$after) throw new RuntimeException('No se pudo recuperar el registro fiscal actualizado.');
    return $after;
  }

  $st = $pdo->prepare("
    INSERT INTO clientes_fiscales (
      tipo_entidad,
      id_cliente,
      id_proveedor,
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
      :tipo_entidad,
      :id_cliente,
      :id_proveedor,
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
  ");
  $st->execute([
    ':tipo_entidad' => $tipoEntidad,
    ':id_cliente' => $idCliente,
    ':id_proveedor' => $idProveedor,
    ':doc_tipo' => (int)$data['doc_tipo'],
    ':doc_nro' => (string)$data['doc_nro'],
    ':cuit' => !empty($data['cuit']) ? $data['cuit'] : null,
    ':razon_social' => (string)$data['razon_social'],
    ':condicion_iva' => (string)$data['condicion_iva'],
    ':domicilio' => !empty($data['domicilio']) ? $data['domicilio'] : null,
    ':origen' => (string)$data['origen'],
    ':activo' => (int)$data['activo'],
  ]);

  $idFiscal = (int)$pdo->lastInsertId();
  $st2 = $pdo->prepare(cf_fiscal_select_sql() . " WHERE id_cliente_fiscal = :id LIMIT 1");
  $st2->execute([':id' => $idFiscal]);
  $after = $st2->fetch(PDO::FETCH_ASSOC);
  if (!$after) throw new RuntimeException('No se pudo recuperar el registro fiscal guardado.');
  return $after;
}

/* =========================================================
   GET
========================================================= */
function cliente_fiscal_get(PDO $pdo): void {
  $src = array_merge($_GET ?? [], $_POST ?? []);
  $tipoEntidad = cf_tipo_entidad_from_request($src);

  if ($tipoEntidad === 'proveedor') {
    $idProveedor = cf_n_int($src['id_proveedor'] ?? null);
    if (!$idProveedor || $idProveedor <= 0) cf_fail('Falta id_proveedor.');
    cf_check_proveedor_exists_or_fail($pdo, $idProveedor);
    $row = cf_find_cliente_fiscal_row_by_proveedor($pdo, $idProveedor);
    cf_ok(['existe' => (bool)$row, 'cliente_fiscal' => $row ? cf_format_row($row) : null]);
  }

  $idCliente = cf_n_int($src['id_cliente'] ?? null);
  if (!$idCliente || $idCliente <= 0) cf_fail('Falta id_cliente.');
  cf_check_cliente_exists_or_fail($pdo, $idCliente);
  $row = cf_find_cliente_fiscal_row_by_cliente($pdo, $idCliente);
  cf_ok(['existe' => (bool)$row, 'cliente_fiscal' => $row ? cf_format_row($row) : null]);
}

/* =========================================================
   UPSERT
========================================================= */
function cliente_fiscal_upsert(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') cf_fail('Método no permitido.', 405);

  $body = cf_read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = cf_get_id_usuario_from_request($pdo, $src);
  $data = cf_validar_payload_or_fail($src);
  $tipoEntidad = $data['tipo_entidad'];

  if ($tipoEntidad === 'proveedor') {
    $entidad = cf_check_proveedor_exists_or_fail($pdo, (int)$data['id_proveedor']);
    $before = cf_find_cliente_fiscal_row_by_proveedor($pdo, (int)$data['id_proveedor']);
  } else {
    $entidad = cf_check_cliente_exists_or_fail($pdo, (int)$data['id_cliente']);
    $before = cf_find_cliente_fiscal_row_by_cliente($pdo, (int)$data['id_cliente']);
  }

  if (!$before && !empty($data['cuit'])) {
    $porCuitAntes = cf_find_cliente_fiscal_by_cuit($pdo, (string)$data['cuit'], $tipoEntidad);
    if ($porCuitAntes && !empty($porCuitAntes['cliente_fiscal'])) $before = $porCuitAntes['cliente_fiscal'];
  }

  try {
    $pdo->beginTransaction();
    $after = cf_upsert_cliente_fiscal($pdo, $data);
    $pdo->commit();

    cf_audit_safe($pdo, $idUsuario, $before ? 'actualizar' : 'crear', (int)($after['id_cliente_fiscal'] ?? 0), [
      'tipo_entidad' => $tipoEntidad,
      cf_entity_label($tipoEntidad) => $tipoEntidad === 'proveedor' ? cf_format_proveedor_row($entidad) : cf_format_cliente_row($entidad),
      'antes' => $before ? cf_format_row($before) : null,
      'despues' => cf_format_row($after),
      'sin_duplicar' => true,
    ]);

    $payload = [
      'guardado' => !$before || !cf_fiscal_tiene_mismos_datos($before, $data),
      'ya_existia' => (bool)$before,
      'sin_duplicar' => true,
      'cliente_fiscal' => cf_format_row($after),
    ];

    if ($tipoEntidad === 'proveedor') $payload['proveedor'] = cf_format_proveedor_row($entidad);
    else $payload['cliente'] = cf_format_cliente_row($entidad);

    cf_ok($payload);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    cf_fail('No se pudo guardar/actualizar el dato fiscal. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR / ACTUALIZAR ENTIDAD SIMPLE + DATOS FISCALES DESDE ARCA
========================================================= */
function cliente_fiscal_crear_desde_arca(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') cf_fail('Método no permitido.', 405);

  $body = cf_read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = cf_get_id_usuario_from_request($pdo, $src);
  $tipoEntidad = cf_tipo_entidad_from_request($src);

  $idCliente = cf_n_int($src['id_cliente'] ?? null) ?? 0;
  $idProveedor = cf_n_int($src['id_proveedor'] ?? null) ?? 0;
  $cuit = cf_digits($src['cuit'] ?? ($src['doc_nro'] ?? ''));
  $docNro = cf_digits($src['doc_nro'] ?? $cuit);
  $docTipo = cf_n_int($src['doc_tipo'] ?? 80) ?? 80;
  $razonSocial = cf_norm_nombre_cliente(cf_safe_str($src['razon_social'] ?? ''));
  $condicionIva = cf_safe_str($src['condicion_iva'] ?? ($src['cond_iva'] ?? ''));
  $domicilio = cf_safe_str($src['domicilio'] ?? '');
  $origen = cf_safe_str($src['origen'] ?? 'arca_cuit');
  $actualizarNombreCliente = !isset($src['actualizar_nombre_cliente']) || (int)$src['actualizar_nombre_cliente'] === 1;
  $actualizarNombreProveedor = !isset($src['actualizar_nombre_proveedor']) || (int)$src['actualizar_nombre_proveedor'] === 1;
  $activoEntidad = isset($src['activo']) ? ((int)$src['activo'] === 1 ? 1 : 0) : 1;

  if (strlen($cuit) !== 11) cf_fail('El CUIT debe tener 11 dígitos.');
  if ($docNro === '') $docNro = $cuit;
  if ($docTipo === 80 && strlen($docNro) !== 11) cf_fail('El documento CUIT debe tener 11 dígitos.');
  if ($razonSocial === '') cf_fail('ARCA no devolvió razón social/nombre para ese CUIT.');
  if ($condicionIva === '') $condicionIva = 'No informado';
  if ($origen === '') $origen = 'arca_cuit';

  $existentePorCuit = cf_find_cliente_fiscal_by_cuit($pdo, $cuit, $tipoEntidad);
  if ($existentePorCuit) {
    $payload = [
      'guardado' => false,
      'ya_existia' => true,
      'sin_cambios' => true,
      'mensaje' => 'El CUIT ya estaba cargado. Se usó el ' . cf_entity_label($tipoEntidad) . ' existente sin duplicarlo.',
      'cliente_fiscal' => cf_format_row($existentePorCuit['cliente_fiscal']),
    ];
    if ($tipoEntidad === 'proveedor') $payload['proveedor'] = cf_format_proveedor_row($existentePorCuit['proveedor']);
    else $payload['cliente'] = cf_format_cliente_row($existentePorCuit['cliente']);
    cf_ok($payload);
  }

  try {
    $pdo->beginTransaction();

    $clienteBefore = null;
    $proveedorBefore = null;
    $cliente = null;
    $proveedor = null;

    if ($tipoEntidad === 'proveedor') {
      if ($idProveedor > 0) {
        $proveedorBefore = cf_get_proveedor_by_id($pdo, $idProveedor);
        if (!$proveedorBefore) throw new RuntimeException('El proveedor indicado no existe.');

        if ($actualizarNombreProveedor && cf_norm_nombre_cliente((string)$proveedorBefore['nombre']) !== $razonSocial) {
          $up = $pdo->prepare("UPDATE proveedores SET nombre = :nombre, activo = :activo WHERE id_proveedor = :id");
          $up->execute([':nombre' => $razonSocial, ':activo' => $activoEntidad, ':id' => $idProveedor]);
        } elseif ((int)($proveedorBefore['activo'] ?? 1) !== $activoEntidad) {
          $up = $pdo->prepare("UPDATE proveedores SET activo = :activo WHERE id_proveedor = :id");
          $up->execute([':activo' => $activoEntidad, ':id' => $idProveedor]);
        }
        $proveedor = cf_get_proveedor_by_id($pdo, $idProveedor);
      } else {
        $proveedor = cf_find_proveedor_by_cuit($pdo, $cuit);
        if ($proveedor) {
          $idProveedor = (int)$proveedor['id_proveedor'];
          if ($actualizarNombreProveedor && cf_norm_nombre_cliente((string)$proveedor['nombre']) !== $razonSocial) {
            $up = $pdo->prepare("UPDATE proveedores SET nombre = :nombre, activo = :activo WHERE id_proveedor = :id");
            $up->execute([':nombre' => $razonSocial, ':activo' => $activoEntidad, ':id' => $idProveedor]);
            $proveedor = cf_get_proveedor_by_id($pdo, $idProveedor);
          } elseif ((int)($proveedor['activo'] ?? 1) !== $activoEntidad) {
            $up = $pdo->prepare("UPDATE proveedores SET activo = :activo WHERE id_proveedor = :id");
            $up->execute([':activo' => $activoEntidad, ':id' => $idProveedor]);
            $proveedor = cf_get_proveedor_by_id($pdo, $idProveedor);
          }
        } else {
          $proveedor = cf_crear_proveedor_simple($pdo, $razonSocial);
          $idProveedor = (int)$proveedor['id_proveedor'];
          if ($activoEntidad !== 1) {
            $up = $pdo->prepare("UPDATE proveedores SET activo = :activo WHERE id_proveedor = :id");
            $up->execute([':activo' => $activoEntidad, ':id' => $idProveedor]);
            $proveedor = cf_get_proveedor_by_id($pdo, $idProveedor);
          }
        }
      }

      if (!$proveedor || $idProveedor <= 0) throw new RuntimeException('No se pudo resolver/crear el proveedor simple.');
      $beforeFiscal = cf_find_cliente_fiscal_row_by_proveedor($pdo, $idProveedor);
      $fiscal = cf_upsert_cliente_fiscal($pdo, [
        'tipo_entidad' => 'proveedor',
        'id_cliente' => null,
        'id_proveedor' => $idProveedor,
        'doc_tipo' => $docTipo,
        'doc_nro' => $docNro,
        'cuit' => $cuit,
        'razon_social' => $razonSocial,
        'condicion_iva' => $condicionIva,
        'domicilio' => $domicilio,
        'origen' => $origen,
        'activo' => $activoEntidad,
      ]);

      $pdo->commit();

      cf_audit_safe($pdo, $idUsuario, $beforeFiscal ? 'actualizar_proveedor_desde_arca' : 'crear_proveedor_desde_arca', (int)$idProveedor, [
        'tipo_entidad' => 'proveedor',
        'proveedor_antes' => $proveedorBefore ? cf_format_proveedor_row($proveedorBefore) : null,
        'proveedor_despues' => cf_format_proveedor_row($proveedor),
        'fiscal_antes' => $beforeFiscal ? cf_format_row($beforeFiscal) : null,
        'fiscal_despues' => cf_format_row($fiscal),
      ]);

      cf_ok([
        'guardado' => true,
        'proveedor' => cf_format_proveedor_row($proveedor),
        'cliente_fiscal' => cf_format_row($fiscal),
      ]);
    }

    if ($idCliente > 0) {
      $clienteBefore = cf_get_cliente_by_id($pdo, $idCliente);
      if (!$clienteBefore) throw new RuntimeException('El cliente indicado no existe.');

      if ($actualizarNombreCliente && cf_norm_nombre_cliente((string)$clienteBefore['nombre']) !== $razonSocial) {
        $up = $pdo->prepare("UPDATE clientes SET nombre = :nombre, activo = :activo WHERE id_cliente = :id");
        $up->execute([':nombre' => $razonSocial, ':activo' => $activoEntidad, ':id' => $idCliente]);
      } elseif ((int)($clienteBefore['activo'] ?? 1) !== $activoEntidad) {
        $up = $pdo->prepare("UPDATE clientes SET activo = :activo WHERE id_cliente = :id");
        $up->execute([':activo' => $activoEntidad, ':id' => $idCliente]);
      }
      $cliente = cf_get_cliente_by_id($pdo, $idCliente);
    } else {
      $cliente = cf_find_cliente_by_cuit($pdo, $cuit);
      if ($cliente) {
        $idCliente = (int)$cliente['id_cliente'];
        if ($actualizarNombreCliente && cf_norm_nombre_cliente((string)$cliente['nombre']) !== $razonSocial) {
          $up = $pdo->prepare("UPDATE clientes SET nombre = :nombre, activo = :activo WHERE id_cliente = :id");
          $up->execute([':nombre' => $razonSocial, ':activo' => $activoEntidad, ':id' => $idCliente]);
          $cliente = cf_get_cliente_by_id($pdo, $idCliente);
        } elseif ((int)($cliente['activo'] ?? 1) !== $activoEntidad) {
          $up = $pdo->prepare("UPDATE clientes SET activo = :activo WHERE id_cliente = :id");
          $up->execute([':activo' => $activoEntidad, ':id' => $idCliente]);
          $cliente = cf_get_cliente_by_id($pdo, $idCliente);
        }
      } else {
        $cliente = cf_crear_cliente_simple($pdo, $razonSocial);
        $idCliente = (int)$cliente['id_cliente'];
        if ($activoEntidad !== 1) {
          $up = $pdo->prepare("UPDATE clientes SET activo = :activo WHERE id_cliente = :id");
          $up->execute([':activo' => $activoEntidad, ':id' => $idCliente]);
          $cliente = cf_get_cliente_by_id($pdo, $idCliente);
        }
      }
    }

    if (!$cliente || $idCliente <= 0) throw new RuntimeException('No se pudo resolver/crear el cliente simple.');
    $beforeFiscal = cf_find_cliente_fiscal_row_by_cliente($pdo, $idCliente);
    $fiscal = cf_upsert_cliente_fiscal($pdo, [
      'tipo_entidad' => 'cliente',
      'id_cliente' => $idCliente,
      'id_proveedor' => null,
      'doc_tipo' => $docTipo,
      'doc_nro' => $docNro,
      'cuit' => $cuit,
      'razon_social' => $razonSocial,
      'condicion_iva' => $condicionIva,
      'domicilio' => $domicilio,
      'origen' => $origen,
      'activo' => $activoEntidad,
    ]);

    $pdo->commit();

    cf_audit_safe($pdo, $idUsuario, $beforeFiscal ? 'actualizar_cliente_desde_arca' : 'crear_cliente_desde_arca', (int)$idCliente, [
      'tipo_entidad' => 'cliente',
      'cliente_antes' => $clienteBefore ? cf_format_cliente_row($clienteBefore) : null,
      'cliente_despues' => cf_format_cliente_row($cliente),
      'fiscal_antes' => $beforeFiscal ? cf_format_row($beforeFiscal) : null,
      'fiscal_despues' => cf_format_row($fiscal),
    ]);

    cf_ok([
      'guardado' => true,
      'cliente' => cf_format_cliente_row($cliente),
      'cliente_fiscal' => cf_format_row($fiscal),
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    cf_fail('No se pudo crear/actualizar el dato fiscal desde ARCA. ' . $e->getMessage());
  }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = cf_current_action();

switch ($action) {
  case 'cliente_fiscal_get':
  case 'proveedor_fiscal_get':
    cliente_fiscal_get($pdo);
    break;

  case 'cliente_fiscal_upsert':
  case 'proveedor_fiscal_upsert':
    cliente_fiscal_upsert($pdo);
    break;

  case 'cliente_fiscal_crear_desde_arca':
  case 'cliente_fiscal_resolver_desde_arca':
  case 'proveedor_fiscal_crear_desde_arca':
  case 'proveedor_fiscal_resolver_desde_arca':
    cliente_fiscal_crear_desde_arca($pdo);
    break;

  default:
    cf_fail('Acción no válida en clientes_fiscales: ' . $action);
    break;
}
