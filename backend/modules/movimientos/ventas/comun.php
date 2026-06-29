<?php
// backend/modules/movimientos/ventas/comun.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// La fecha operativa de la venta siempre debe venir del modal.
// La zona horaria solo se usa para validar "hoy" y para created_at/auditoría.
$__balto_tz = getenv('APP_TIMEZONE') ?: 'America/Argentina/Buenos_Aires';
if (is_string($__balto_tz) && trim($__balto_tz) !== '') {
  @date_default_timezone_set(trim($__balto_tz));
}
try {
  if (isset($pdo) && $pdo instanceof PDO) {
    $pdo->exec("SET time_zone = '-03:00'");
  }
} catch (Throwable $e) {}

require_once __DIR__ . '/../../utils/auditoria.php';

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

function n_int($v): ?int {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  $n = (int)$v;
  return $n >= 0 ? $n : null;
}

function n_float($v): ?float {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  return (float)$v;
}

function today_iso(): string {
  return date('Y-m-d');
}

function today_ymd8(): string {
  return date('Ymd');
}

function is_valid_fecha(string $f): bool {
  if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

function normalizar_fecha_movimiento($value): ?string {
  $s = trim((string)($value ?? ''));
  if ($s === '') return null;

  if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
    $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
    return is_valid_fecha($out) ? $out : null;
  }

  if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $s, $m)) {
    $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
    return is_valid_fecha($out) ? $out : null;
  }

  return null;
}

function norm_text(string $s): string {
  $s = mb_strtolower(trim($s), 'UTF-8');
  $s = str_replace(
    ['á','é','í','ó','ú','ä','ë','ï','ö','ü','ñ'],
    ['a','e','i','o','u','a','e','i','o','u','n'],
    $s
  );
  return $s;
}

global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('No hay conexión a la base de datos (PDO no disponible).');
}

/* =========================================================
   idUsuario / idUsuarioMaster
========================================================= */
function get_header_value(string $key): string {
  $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = $_SERVER[$serverKey] ?? '';
  if (!is_string($v)) $v = '';
  return trim($v);
}

function get_bearer_token(): string {
  $h = get_header_value('Authorization');
  if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
  if ($h === '') return '';
  if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
  return '';
}

function base64url_decode2(string $s): string {
  $s = str_replace(['-', '_'], ['+', '/'], $s);
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  $out = base64_decode($s, true);
  return $out === false ? '' : $out;
}

function extract_positive_int_from_candidates(array $candidates): int {
  foreach ($candidates as $c) {
    if (is_numeric($c)) {
      $id = (int)$c;
      if ($id > 0) return $id;
    }
  }
  return 0;
}

function get_id_usuario_from_token(): int {
  $token = get_bearer_token();
  if ($token === '' || substr_count($token, '.') !== 2) {
    return 0;
  }

  $parts = explode('.', $token);
  $payloadJson = base64url_decode2($parts[1] ?? '');
  if ($payloadJson === '') {
    return 0;
  }

  $payload = json_decode($payloadJson, true);
  if (!is_array($payload)) {
    return 0;
  }

  return extract_positive_int_from_candidates([
    $payload['idUsuarioMaster'] ?? null,
    $payload['id_usuario_master'] ?? null,
    $payload['idUsuario'] ?? null,
    $payload['id_usuario'] ?? null,
    $payload['uid'] ?? null,
    $payload['sub'] ?? null,
  ]);
}

function get_id_usuario_from_body_or_request(array $body = []): int {
  return extract_positive_int_from_candidates([
    $body['idUsuarioMaster'] ?? null,
    $body['id_usuario_master'] ?? null,
    $body['idUsuario'] ?? null,
    $body['id_usuario'] ?? null,

    $_POST['idUsuarioMaster'] ?? null,
    $_POST['id_usuario_master'] ?? null,
    $_POST['idUsuario'] ?? null,
    $_POST['id_usuario'] ?? null,

    $_GET['idUsuarioMaster'] ?? null,
    $_GET['id_usuario_master'] ?? null,
    $_GET['idUsuario'] ?? null,
    $_GET['id_usuario'] ?? null,
  ]);
}

function get_id_usuario_from_x_session(PDO $pdo): int {
  $sessionKey = get_header_value('X-Session');
  if ($sessionKey === '') return 0;

  try {
    $chk = $pdo->query("SHOW TABLES LIKE 'sesiones'");
    $exists = $chk ? (bool)$chk->fetchColumn() : false;
    if (!$exists) return 0;

    $st = $pdo->prepare("
      SELECT *
      FROM sesiones
      WHERE session_key = :k
      LIMIT 1
    ");
    $st->execute([':k' => $sessionKey]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row || !is_array($row)) {
      return 0;
    }

    return extract_positive_int_from_candidates([
      $row['idUsuarioMaster'] ?? null,
      $row['id_usuario_master'] ?? null,
      $row['id_usuario'] ?? null,
      $row['idUsuario'] ?? null,
      $row['uid'] ?? null,
      $row['sub'] ?? null,
    ]);
  } catch (Throwable $e) {
    return 0;
  }
}

function get_id_usuario_from_request(PDO $pdo, array $body = []): int {

  if (function_exists('mv_secure_auth_user_id')) {
    $id = mv_secure_auth_user_id();
    if ($id > 0) return $id;
  }

  $id = (int)($GLOBALS['AUTH_USER_MASTER_ID'] ?? 0);
  if ($id > 0) return $id;

  $id = get_id_usuario_from_token();
  if ($id > 0) return $id;

  $id = get_id_usuario_from_body_or_request($body);
  if ($id > 0) return $id;

  $id = get_id_usuario_from_x_session($pdo);
  if ($id > 0) return $id;

  return 0;
}

function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  try {
    if ($idUsuario <= 0) {
      $idUsuario = get_id_usuario_from_request($pdo, []);
    }

    // Igual que auditar(): nunca romper el sistema por auditoría
    if ($idUsuario <= 0) {
      return;
    }

    auditar($pdo, $idUsuario, 'ventas', $accion, $entidad, $idEntidad, $detalle);
  } catch (Throwable $e) {
    // No romper flujo por auditoría
  }
}

/* =========================================================
   Helpers de negocio
========================================================= */
function get_tipo_operacion_id_venta(PDO $pdo): int {
  return 1;
}

function get_tipo_venta_nombre(PDO $pdo, ?int $idTipoVenta): string {
  if (!$idTipoVenta || $idTipoVenta <= 0) return '';
  $st = $pdo->prepare("SELECT nombre FROM tipos_venta WHERE id_tipo_venta = :id LIMIT 1");
  $st->execute([':id' => $idTipoVenta]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return isset($row['nombre']) ? (string)$row['nombre'] : '';
}

function tipo_venta_is_contado(string $nombre): bool {
  $n = norm_text($nombre);
  return (strpos($n, 'contado') !== false) || (strpos($n, 'efectivo') !== false);
}

function tipo_venta_is_corriente(string $nombre): bool {
  $n = norm_text($nombre);
  return (strpos($n, 'corriente') !== false) || (strpos($n, 'cuenta corriente') !== false);
}


if (!function_exists('ventas_cheques_buscar_duplicado_por_numero')) {
  function ventas_cheques_buscar_duplicado_por_numero(PDO $pdo, string $numeroCheque, ?string $tipoCheque = null, ?int $excludeIdCheque = null): ?array
  {
    $numeroCheque = trim($numeroCheque);
    if ($numeroCheque === '') {
      return null;
    }

    $sql = "
      SELECT
        c.id_cheque,
        c.tipo,
        c.id_movimiento,
        c.emisor,
        c.numero_cheque,
        c.importe,
        c.fecha_emision,
        c.fecha_pago,
        m.fecha AS movimiento_fecha
      FROM movimientos_cheques c
      LEFT JOIN movimientos m
        ON m.id_movimiento = c.id_movimiento
      WHERE c.activo = 1
        AND TRIM(c.numero_cheque) = :numero_cheque
    ";

    if ($tipoCheque !== null && trim($tipoCheque) !== '') {
      $sql .= " AND c.tipo = :tipo";
    }

    if ($excludeIdCheque !== null && $excludeIdCheque > 0) {
      $sql .= " AND c.id_cheque <> :exclude_id_cheque";
    }

    $sql .= " ORDER BY c.id_cheque DESC LIMIT 1";

    $st = $pdo->prepare($sql);
    $st->bindValue(':numero_cheque', $numeroCheque, PDO::PARAM_STR);

    if ($tipoCheque !== null && trim($tipoCheque) !== '') {
      $st->bindValue(':tipo', trim($tipoCheque), PDO::PARAM_STR);
    }

    if ($excludeIdCheque !== null && $excludeIdCheque > 0) {
      $st->bindValue(':exclude_id_cheque', $excludeIdCheque, PDO::PARAM_INT);
    }

    $st->execute();
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('ventas_cheques_mensaje_duplicado_por_numero')) {
  function ventas_cheques_mensaje_duplicado_por_numero(array $dup): string
  {
    $tipo = strtolower(trim((string)($dup['tipo'] ?? 'cheque'))) === 'echeq' ? 'eCheq' : 'cheque';
    $numero = trim((string)($dup['numero_cheque'] ?? ''));
    $movimiento = isset($dup['id_movimiento']) ? (int)$dup['id_movimiento'] : 0;
    $emisor = trim((string)($dup['emisor'] ?? ''));

    $extra = [];
    if ($movimiento > 0) {
      $extra[] = 'movimiento #' . $movimiento;
    }
    if ($emisor !== '') {
      $extra[] = 'emisor ' . $emisor;
    }

    $suffix = $extra ? ' (' . implode(', ', $extra) . ')' : '';

    return 'Ya existe un ' . $tipo . ' activo con el número ' . $numero . $suffix . '.';
  }
}


function item_payload_from_src(array $src, float $monto_total, int $idStockProducto): array {
  $cantidad  = n_float($src['cantidad']  ?? null);
  $precio    = n_float($src['precio']    ?? null);
  $iva_pct   = n_float($src['iva_pct']   ?? null);
  $subtotal  = n_float($src['subtotal']  ?? null);
  $iva_monto = n_float($src['iva_monto'] ?? null);
  $total     = n_float($src['total']     ?? null);

  $hasItemFields = (
    $cantidad !== null ||
    $precio !== null ||
    $iva_pct !== null ||
    $subtotal !== null ||
    $iva_monto !== null ||
    $total !== null
  );

  if (!$hasItemFields) {
    return [
      'id_stock_producto' => $idStockProducto,
      'id_detalle'        => null,
      'cantidad'          => 1.0,
      'precio'            => (float)$monto_total,
      'iva_pct'           => 0.0,
      'subtotal'          => (float)$monto_total,
      'iva_monto'         => 0.0,
      'total'             => (float)$monto_total,
    ];
  }

  $cantidad = $cantidad !== null ? (float)$cantidad : 1.0;
  $precio   = $precio   !== null ? (float)$precio   : 0.0;
  $iva_pct  = $iva_pct  !== null ? (float)$iva_pct  : 0.0;

  $calc_sub = $cantidad * $precio;
  $calc_iva = $calc_sub * ($iva_pct / 100.0);
  $calc_tot = $calc_sub + $calc_iva;

  $subtotal  = $subtotal  !== null ? (float)$subtotal  : $calc_sub;
  $iva_monto = $iva_monto !== null ? (float)$iva_monto : $calc_iva;
  $total     = $total     !== null ? (float)$total     : $calc_tot;

  return [
    'id_stock_producto' => $idStockProducto,
    'id_detalle'        => null,
    'cantidad'          => $cantidad,
    'precio'            => $precio,
    'iva_pct'           => $iva_pct,
    'subtotal'          => $subtotal,
    'iva_monto'         => $iva_monto,
    'total'             => $total,
  ];
}

function validar_venta_or_fail(PDO $pdo, array $src): array {
  $fecha = normalizar_fecha_movimiento($src['fecha'] ?? null);
  if ($fecha === null) {
    fail('La fecha de la venta es obligatoria y debe venir desde el modal en formato AAAA-MM-DD. No se guardó nada.');
  }
  if ($fecha > today_iso()) {
    fail('La fecha de la venta no puede ser posterior al día actual.');
  }

  $id_clasificacion = n_int($src['id_clasificacion'] ?? null);
  $id_tipo_venta    = n_int($src['id_tipo_venta'] ?? null);
  $id_medio_pago    = n_int($src['id_medio_pago'] ?? null);
  $id_cliente       = n_int($src['id_cliente'] ?? null);

  $id_stock_producto = n_int($src['id_stock_producto'] ?? ($src['id_detalle'] ?? null));
  $monto_total       = n_float($src['monto_total'] ?? null);

  $id_tipo_operacion_venta = get_tipo_operacion_id_venta($pdo);
  if ($id_tipo_operacion_venta <= 0) fail("Tipo de operación VENTA inválido (id <= 0).");

  if (!$id_cliente || $id_cliente <= 0) {
    fail('En Ventas el Cliente es obligatorio.');
  }

  if (!$id_tipo_venta || $id_tipo_venta <= 0) {
    fail('En Ventas la Forma de venta (Tipo venta) es obligatoria.');
  }

  if (!$id_stock_producto || $id_stock_producto <= 0) {
    fail('En Ventas el Producto es obligatorio.');
  }

  $tipoVentaNombre = get_tipo_venta_nombre($pdo, $id_tipo_venta);
  $isContado   = tipo_venta_is_contado($tipoVentaNombre);
  $isCorriente = tipo_venta_is_corriente($tipoVentaNombre);

  if ($isContado) {
    if (!$id_medio_pago || $id_medio_pago <= 0) {
      fail('Venta Contado: el Medio de pago es obligatorio.');
    }
  } else {
    $id_medio_pago = null;
  }

  $item = item_payload_from_src($src, (float)($monto_total ?? 0.0), (int)$id_stock_producto);
  $totalCabecera = (float)$item['total'];

  return [
    'fecha'              => $fecha,
    'id_tipo_operacion'  => $id_tipo_operacion_venta,
    'id_clasificacion'   => $id_clasificacion,
    'id_tipo_venta'      => $id_tipo_venta,
    'id_medio_pago'      => $id_medio_pago,
    'id_cliente'         => $id_cliente,
    'id_proveedor'       => null,
    'id_stock_producto'  => $id_stock_producto,
    'id_detalle'         => null,
    'monto_total'        => $totalCabecera,
    'tipo_venta_nombre'  => $tipoVentaNombre,
    'is_contado'         => $isContado,
    'is_corriente'       => $isCorriente,
    'item'               => $item,
  ];
}

function map_factura_to_nc_cbte_tipo(int $cbteTipoFactura): int {
  switch ($cbteTipoFactura) {
    case 1:  return 3;
    case 6:  return 8;
    case 11: return 13;
    default: return 13;
  }
}