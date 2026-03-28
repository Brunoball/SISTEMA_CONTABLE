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
  return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f);
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
   idUsuario
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

function get_id_usuario_from_x_session(PDO $pdo): int {
  $sessionKey = get_header_value('X-Session');
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

function get_id_usuario_from_request(PDO $pdo, array $body = []): int {
  $token = get_bearer_token();
  if ($token !== '' && substr_count($token, '.') === 2) {
    $parts = explode('.', $token);
    $payloadJson = base64url_decode2($parts[1] ?? '');
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

  $idSess = get_id_usuario_from_x_session($pdo);
  if ($idSess > 0) return $idSess;

  return 0;
}

function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  if ($idUsuario <= 0) return;
  auditar($pdo, $idUsuario, 'ventas', $accion, $entidad, $idEntidad, $detalle);
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

function item_payload_from_src(array $src, float $monto_total, int $id_detalle): array {
  $cantidad  = n_float($src['cantidad']  ?? null);
  $precio    = n_float($src['precio']    ?? null);
  $iva_pct   = n_float($src['iva_pct']   ?? null);
  $subtotal  = n_float($src['subtotal']  ?? null);
  $iva_monto = n_float($src['iva_monto'] ?? null);
  $total     = n_float($src['total']     ?? null);

  $hasItemFields = ($cantidad !== null || $precio !== null || $iva_pct !== null || $subtotal !== null || $iva_monto !== null || $total !== null);

  if (!$hasItemFields) {
    return [
      'id_detalle' => $id_detalle,
      'cantidad' => 1.0,
      'precio' => (float)$monto_total,
      'iva_pct' => 0.0,
      'subtotal' => (float)$monto_total,
      'iva_monto' => 0.0,
      'total' => (float)$monto_total,
    ];
  }

  $cantidad = $cantidad !== null ? (float)$cantidad : 1.0;
  $precio   = $precio !== null ? (float)$precio : 0.0;
  $iva_pct  = $iva_pct !== null ? (float)$iva_pct : 0.0;

  $calc_sub = $cantidad * $precio;
  $calc_iva = $calc_sub * ($iva_pct / 100.0);
  $calc_tot = $calc_sub + $calc_iva;

  $subtotal  = $subtotal  !== null ? (float)$subtotal  : $calc_sub;
  $iva_monto = $iva_monto !== null ? (float)$iva_monto : $calc_iva;
  $total     = $total     !== null ? (float)$total     : $calc_tot;

  return [
    'id_detalle' => $id_detalle,
    'cantidad' => $cantidad,
    'precio' => $precio,
    'iva_pct' => $iva_pct,
    'subtotal' => $subtotal,
    'iva_monto' => $iva_monto,
    'total' => $total,
  ];
}

function validar_venta_or_fail(PDO $pdo, array $src): array {
  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) $fecha = today_iso();

  $id_clasificacion = n_int($src['id_clasificacion'] ?? null);
  $id_tipo_venta    = n_int($src['id_tipo_venta'] ?? null);
  $id_medio_pago    = n_int($src['id_medio_pago'] ?? null);
  $id_cliente       = n_int($src['id_cliente'] ?? null);
  $id_detalle       = n_int($src['id_detalle'] ?? null);

  $monto_total = n_float($src['monto_total'] ?? null);

  $id_tipo_operacion_venta = get_tipo_operacion_id_venta($pdo);
  if ($id_tipo_operacion_venta <= 0) fail("Tipo de operación VENTA inválido (id <= 0).");

  if (!$id_cliente || $id_cliente <= 0) fail('En Ventas el Cliente es obligatorio.');
  if (!$id_tipo_venta || $id_tipo_venta <= 0) fail('En Ventas la Forma de venta (Tipo venta) es obligatoria.');
  if (!$id_detalle || $id_detalle <= 0) fail('En Ventas el Detalle es obligatorio.');

  $tipoVentaNombre = get_tipo_venta_nombre($pdo, $id_tipo_venta);
  $isContado = tipo_venta_is_contado($tipoVentaNombre);
  $isCorriente = tipo_venta_is_corriente($tipoVentaNombre);

  if ($isContado) {
    if (!$id_medio_pago || $id_medio_pago <= 0) {
      fail('Venta Contado: el Medio de pago es obligatorio.');
    }
  } else {
    $id_medio_pago = null;
  }

  $item = item_payload_from_src($src, (float)($monto_total ?? 0.0), (int)$id_detalle);
  $totalCabecera = (float)$item['total'];

  return [
    'fecha' => $fecha,
    'id_tipo_operacion' => $id_tipo_operacion_venta,
    'id_clasificacion' => $id_clasificacion,
    'id_tipo_venta' => $id_tipo_venta,
    'id_medio_pago' => $id_medio_pago,
    'id_cliente' => $id_cliente,
    'id_proveedor' => null,
    'id_detalle' => $id_detalle,
    'monto_total' => $totalCabecera,
    'tipo_venta_nombre' => $tipoVentaNombre,
    'is_contado' => $isContado,
    'is_corriente' => $isCorriente,
    'item' => $item,
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