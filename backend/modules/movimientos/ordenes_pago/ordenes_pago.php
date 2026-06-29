<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/shared_db.php';
require_once __DIR__ . '/../core/plan_saas.php';
require_once __DIR__ . '/../global/cheques.php';
require_once __DIR__ . '/../global/medios_pago.php';

require_once __DIR__ . '/../../utils/auditoria.php';

/* ----------------- Helpers response ----------------- */
function op_ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}

function op_fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function op_read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function op_n_int($v): ?int {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  $n = (int)$v;
  return $n >= 0 ? $n : null;
}

function op_n_float($v): ?float {
  if ($v === null || $v === '') return null;

  if (is_string($v)) {
    $s = trim($v);
    if ($s === '') return null;

    if (preg_match('/^\d{1,3}(\.\d{3})*(,\d+)?$/', $s)) {
      $s = str_replace('.', '', $s);
      $s = str_replace(',', '.', $s);
    } elseif (substr_count($s, ',') === 1 && substr_count($s, '.') === 0) {
      $s = str_replace(',', '.', $s);
    }

    if (!is_numeric($s)) return null;
    return (float)$s;
  }

  if (!is_numeric($v)) return null;
  return (float)$v;
}

function op_today_iso(): string {
  return date('Y-m-d');
}


if (!function_exists('op_round_money')) {
  function op_round_money(float $n): float {
    return round($n, 2);
  }
}

if (!function_exists('op_estado_pago')) {
  function op_estado_pago(float $total, float $cobrado): string {
    $saldo = max(0.0, op_round_money($total - $cobrado));
    if ($saldo <= 0.00001) return 'pagado';
    if ($cobrado > 0.00001) return 'parcialmente_pagado';
    return 'pendiente';
  }
}

if (!function_exists('op_monto_pago_from_request')) {
  function op_monto_pago_from_request(array $src): ?float {
    // Para pagos parciales, la fuente más confiable es la suma de medios_pago.
    // Evita que campos legacy vengan con el saldo completo y fuercen pago total.
    if (isset($src['medios_pago']) && is_array($src['medios_pago'])) {
      $sumaMedios = 0.0;
      foreach ($src['medios_pago'] as $mp) {
        if (!is_array($mp)) continue;
        $m = op_n_float($mp['monto'] ?? $mp['importe'] ?? $mp['valor'] ?? null);
        if ($m !== null && $m > 0) $sumaMedios += (float)$m;
      }
      $sumaMedios = op_round_money($sumaMedios);
      if ($sumaMedios > 0.00001) return $sumaMedios;
    }

    foreach ([
      'monto_pago',
      'monto_a_pagar',
      'monto_orden_pago',
      'importe_pago',
      'importe_orden_pago',
      'total_pago',
      'total_orden_pago',
      'total',
    ] as $key) {
      $v = op_n_float($src[$key] ?? null);
      if ($v !== null && $v > 0) return op_round_money((float)$v);
    }

    return null;
  }
}

if (!function_exists('op_distribuir_pago_equitativo')) {
  function op_distribuir_pago_equitativo(array $pendientes, float $montoPago): array {
    $restante = op_round_money($montoPago);
    $activos = [];

    foreach ($pendientes as $p) {
      $id = (int)($p['id_movimiento'] ?? 0);
      $saldo = op_round_money((float)($p['saldo'] ?? $p['monto'] ?? 0));
      if ($id > 0 && $saldo > 0.00001) {
        $activos[$id] = $saldo;
      }
    }

    $alloc = [];
    while ($restante > 0.00001 && count($activos) > 0) {
      $cuota = op_round_money($restante / count($activos));
      if ($cuota <= 0.00001) $cuota = $restante;

      $aplicoEnVuelta = 0.0;
      foreach (array_keys($activos) as $id) {
        if ($restante <= 0.00001) break;

        $saldoDisponible = op_round_money($activos[$id]);
        $monto = min($cuota, $saldoDisponible, $restante);
        $monto = op_round_money($monto);
        if ($monto <= 0.00001) {
          unset($activos[$id]);
          continue;
        }

        if (!isset($alloc[$id])) $alloc[$id] = 0.0;
        $alloc[$id] = op_round_money($alloc[$id] + $monto);
        $activos[$id] = op_round_money($activos[$id] - $monto);
        $restante = op_round_money($restante - $monto);
        $aplicoEnVuelta = op_round_money($aplicoEnVuelta + $monto);

        if ($activos[$id] <= 0.00001) unset($activos[$id]);
      }

      if ($aplicoEnVuelta <= 0.00001) break;
    }

    $out = [];
    foreach ($alloc as $id => $monto) {
      $monto = op_round_money((float)$monto);
      if ($monto > 0.00001) {
        $out[] = ['id_movimiento' => (int)$id, 'monto' => $monto];
      }
    }
    return $out;
  }
}

function op_is_valid_fecha(string $f): bool {
  if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
  return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

function op_normalizar_fecha_movimiento($value): ?string {
  $s = trim((string)($value ?? ''));
  if ($s === '') return null;
  if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
    $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
    return op_is_valid_fecha($out) ? $out : null;
  }
  if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $s, $m)) {
    $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
    return op_is_valid_fecha($out) ? $out : null;
  }
  return null;
}

function op_build_in_params(array $ids, string $prefix = ':id'): array {
  $placeholders = [];
  $params = [];
  foreach (array_values($ids) as $i => $id) {
    $ph = $prefix . $i;
    $placeholders[] = $ph;
    $params[$ph] = (int)$id;
  }
  return [$placeholders, $params];
}

function op_text_norm(string $s): string {
  $s = trim(mb_strtolower($s, 'UTF-8'));
  $map = [
    'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a',
    'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
    'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
    'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
    'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
    'ñ' => 'n',
  ];
  $s = strtr($s, $map);
  $s = preg_replace('/\s+/', ' ', $s) ?? $s;
  return $s;
}

function op_detect_medio_pago_tipo_cheque(string $nombre): ?string {
  return mv_medios_pago_detect_tipo_cheque($nombre);
}


/* ----------------- PDO check (SaaS) ----------------- */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  op_fail('Conexión PDO no disponible (tenant no resuelto).', 500);
}

/* =========================================================
   idUsuario / auditoría robusta
========================================================= */
function op_get_header_value(string $key): string {
  $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = $_SERVER[$serverKey] ?? '';
  if (!is_string($v)) $v = '';
  return trim($v);
}

function op_get_bearer_token(): string {
  $h = op_get_header_value('Authorization');
  if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
  if ($h === '') return '';
  if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
  return '';
}

function op_base64url_decode(string $s): string {
  $s = str_replace(['-', '_'], ['+', '/'], $s);
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  $out = base64_decode($s, true);
  return $out === false ? '' : $out;
}

function op_extract_positive_int_from_candidates(array $candidates): int {
  foreach ($candidates as $c) {
    if (is_numeric($c)) {
      $id = (int)$c;
      if ($id > 0) return $id;
    }
  }
  return 0;
}

function op_get_id_usuario_from_token(): int {
  $token = op_get_bearer_token();
  if ($token === '' || substr_count($token, '.') !== 2) {
    return 0;
  }

  $parts = explode('.', $token);
  $payloadJson = op_base64url_decode($parts[1] ?? '');
  if ($payloadJson === '') {
    return 0;
  }

  $payload = json_decode($payloadJson, true);
  if (!is_array($payload)) {
    return 0;
  }

  return op_extract_positive_int_from_candidates([
    $payload['idUsuarioMaster'] ?? null,
    $payload['id_usuario_master'] ?? null,
    $payload['idUsuario'] ?? null,
    $payload['id_usuario'] ?? null,
    $payload['uid'] ?? null,
    $payload['sub'] ?? null,
  ]);
}

function op_get_id_usuario_from_body_or_request(array $body = []): int {
  return op_extract_positive_int_from_candidates([
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

function op_get_id_usuario_from_x_session(PDO $pdo): int {
  $sessionKey = op_get_header_value('X-Session');
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

    return op_extract_positive_int_from_candidates([
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

function op_get_id_usuario_from_request($pdoOrBody = null, array $body = []): int {
  $pdo = $pdoOrBody instanceof PDO ? $pdoOrBody : null;

  if (is_array($pdoOrBody) && empty($body)) {
    $body = $pdoOrBody;
  }

  if (function_exists('mv_secure_auth_user_id')) {
    $id = mv_secure_auth_user_id();
    if ($id > 0) return $id;
  }

  $id = (int)($GLOBALS['AUTH_USER_MASTER_ID'] ?? 0);
  if ($id > 0) return $id;


  $id = op_get_id_usuario_from_token();
  if ($id > 0) return $id;

  $id = op_get_id_usuario_from_body_or_request($body);
  if ($id > 0) return $id;

  if ($pdo instanceof PDO) {
    $id = op_get_id_usuario_from_x_session($pdo);
    if ($id > 0) return $id;
  }

  return 0;
}

function op_resolver_usuario_auditoria(PDO $pdo, array $src = []): int {
  $id = op_get_id_usuario_from_request($pdo, $src);
  if ($id > 0) return $id;

  if (!empty($_POST) && is_array($_POST)) {
    $id = op_get_id_usuario_from_request($pdo, $_POST);
    if ($id > 0) return $id;
  }

  $id = op_get_id_usuario_from_request($pdo, $_GET ?? []);
  if ($id > 0) return $id;

  return 0;
}

function op_audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  try {
    if ($idUsuario <= 0) {
      $idUsuario = op_resolver_usuario_auditoria($pdo, []);
    }

    if ($idUsuario <= 0) {
      return;
    }

    auditar($pdo, $idUsuario, 'ordenes_pago', $accion, $entidad, $idEntidad, $detalle);
  } catch (Throwable $e) {
    // nunca romper el flujo por auditoría
  }
}

/* =========================================================
   Helpers Items
========================================================= */
function op_item_payload_from_src(array $src, float $monto_total, int $id_stock_producto): array {
  $cantidad  = op_n_float($src['cantidad']  ?? null);
  $precio    = op_n_float($src['precio']    ?? null);
  $iva_pct   = op_n_float($src['iva_pct']   ?? null);
  $subtotal  = op_n_float($src['subtotal']  ?? null);
  $iva_monto = op_n_float($src['iva_monto'] ?? null);
  $total     = op_n_float($src['total']     ?? null);

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
      'id_stock_producto' => $id_stock_producto,
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
    'id_stock_producto' => $id_stock_producto,
    'cantidad'          => $cantidad,
    'precio'            => $precio,
    'iva_pct'           => $iva_pct,
    'subtotal'          => $subtotal,
    'iva_monto'         => $iva_monto,
    'total'             => $total,
  ];
}

/* =========================================================
   HELPERS MULTI-MEDIO DE PAGO
========================================================= */
function op_validar_medios_pago_multi(PDO $pdo, array $mediosPagoRaw, float $montoTotalEsperado): array
{
  try {
    return mv_medios_pago_validar_multi($pdo, $mediosPagoRaw, $montoTotalEsperado, [
      'modo'          => 'salida',
      'empty_message' => 'Debés indicar al menos un medio de pago.',
      'total_label'   => 'la orden de pago',
    ]);
  } catch (Throwable $e) {
    op_fail($e->getMessage(), stripos($e->getMessage(), 'plan') !== false ? 403 : 200);
  }
}


function op_lock_cheques_multi(PDO $pdo, array $mediosValidados): array
{
  try {
    return mv_medios_pago_lock_cheques_salida($pdo, $mediosValidados);
  } catch (Throwable $e) {
    op_fail($e->getMessage(), 400);
  }
}


function op_dar_baja_cheques_multi(PDO $pdo, array $mediosValidados): void
{
  try {
    mv_medios_pago_dar_baja_cheques_salida($pdo, $mediosValidados);
  } catch (Throwable $e) {
    op_fail($e->getMessage(), 400);
  }
}


if (!function_exists('op_registrar_flujo_salida_cheque')) {
  function op_registrar_flujo_salida_cheque(PDO $pdo, int $idMovimiento, array $mp): void
  {
    mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mp);
  }
}


/**
 * Guarda los medios usados por cada movimiento pagado.
 * TABLA REAL DEL ESQUEMA ACTUAL: movimientos_medios_pago
 */
if (!function_exists('op_liberar_vinculo_origen_cheques_en_medios_pago')) {
  function op_liberar_vinculo_origen_cheques_en_medios_pago(PDO $pdo, array $chequeIds): void
  {
    mv_medios_pago_liberar_vinculo_origen_cheques($pdo, $chequeIds);
  }
}


function op_insertar_medios_pago_multi(PDO $pdo, int $idMovimiento, array $mediosValidados): void
{
  try {
    mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosValidados, [
      'contexto'               => 'orden de pago',
      'salida_cheque'          => true,
      'registrar_flujo_salida' => true,
    ]);
  } catch (Throwable $e) {
    throw $e;
  }
}



if (!function_exists('op_normalizar_tipo_cheque')) {
  function op_normalizar_tipo_cheque($tipo): string
  {
    if (function_exists('mv_medios_pago_normalize_tipo_cheque')) {
      return mv_medios_pago_normalize_tipo_cheque($tipo) ?: 'cheque';
    }
    $t = strtolower(trim((string)$tipo));
    return in_array($t, ['echeq', 'echeque'], true) ? 'echeq' : 'cheque';
  }
}


if (!function_exists('op_payment_storage_plan')) {
  function op_payment_storage_plan(array $mediosValidados, ?int $legacyId = null): array
  {
    return mv_medios_pago_storage_plan($mediosValidados, $legacyId);
  }
}


if (!function_exists('op_distribuir_medios_pago_por_movimiento')) {
  function op_distribuir_medios_pago_por_movimiento(array $pendientes, array $mediosValidados): array
  {
    $resultado = [];
    $mediosRestantes = array_values(array_map(static function (array $mp): array {
      $mp['monto_restante'] = round((float)($mp['monto'] ?? 0), 2);
      return $mp;
    }, $mediosValidados));

    $idxMedio = 0;

    foreach ($pendientes as $p) {
      $idMov = (int)($p['id_movimiento'] ?? 0);
      $faltanteMovimiento = round((float)($p['monto'] ?? 0), 2);
      $rows = [];

      while ($faltanteMovimiento > 0.009 && $idxMedio < count($mediosRestantes)) {
        $mp = $mediosRestantes[$idxMedio];
        $restaMedio = round((float)($mp['monto_restante'] ?? 0), 2);

        if ($restaMedio <= 0.009) {
          $idxMedio++;
          continue;
        }

        $usar = min($faltanteMovimiento, $restaMedio);
        $row = $mp;
        unset($row['monto_restante']);
        $row['monto'] = round($usar, 2);
        $rows[] = $row;

        $faltanteMovimiento = round($faltanteMovimiento - $usar, 2);
        $mediosRestantes[$idxMedio]['monto_restante'] = round($restaMedio - $usar, 2);

        if ($mediosRestantes[$idxMedio]['monto_restante'] <= 0.009) {
          $idxMedio++;
        }
      }

      if ($idMov > 0) {
        $resultado[$idMov] = $rows;
      }
    }

    return $resultado;
  }
}


/*
 * Permite pagar varias órdenes de pago con un mismo cheque/eCheq de cartera.
 * La tabla movimientos_medios_pago tiene UNIQUE(id_cheque), por lo que el
 * cheque solo puede quedar vinculado físicamente una vez. Para las órdenes
 * secundarias se guarda el medio sin repetir id_cheque y se registra el flujo
 * de egreso para que los modales de detalle sigan mostrando los datos.
 */
if (!function_exists('op_cheque_key_para_lote')) {
  function op_cheque_key_para_lote(array $mp): ?string
  {
    $idCheque = (int)($mp['id_cheque'] ?? 0);
    if ($idCheque > 0) return 'id:' . $idCheque;

    $tipo = op_normalizar_tipo_cheque($mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? (($mp['cheque']['tipo'] ?? null) ?: 'cheque'));
    $ch = is_array($mp['cheque'] ?? null)
      ? $mp['cheque']
      : (is_array($mp['cheque_data'] ?? null) ? $mp['cheque_data'] : null);

    if (!is_array($ch)) return null;

    $numero = trim((string)($ch['numero_cheque'] ?? ''));
    if ($numero === '') return null;

    $emisor = mb_strtolower(trim((string)($ch['emisor'] ?? '')), 'UTF-8');
    $fechaEmision = trim((string)($ch['fecha_emision'] ?? ''));
    $fechaPago = trim((string)($ch['fecha_pago'] ?? ''));
    $importe = number_format((float)($ch['importe'] ?? $mp['monto'] ?? 0), 2, '.', '');

    return 'nuevo:' . implode('|', [$tipo, mb_strtolower($numero, 'UTF-8'), $emisor, $fechaEmision, $fechaPago, $importe]);
  }
}


if (!function_exists('op_registrar_flujo_cheque_compartido_salida')) {
  function op_registrar_flujo_cheque_compartido_salida(PDO $pdo, int $idCheque, int $idMovimiento, array $mp): void
  {
    if ($idCheque <= 0 || $idMovimiento <= 0) return;

    $tipo = op_normalizar_tipo_cheque($mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? 'cheque');
    $mpFlujo = $mp;
    $mpFlujo['id_cheque'] = $idCheque;
    $mpFlujo['tipo_cheque'] = $tipo;
    $mpFlujo['cheque_tipo'] = $tipo;

    $descripcion = ($tipo === 'echeq' ? 'E-cheq' : 'Cheque') . ' aplicado al pago conjunto de órdenes de pago desde movimiento #' . $idMovimiento . '. Salió de cartera.';

    if (function_exists('mv_medios_pago_registrar_flujo_salida_cheque')) {
      mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mpFlujo, $descripcion);
      return;
    }

    if (function_exists('mov_global_cheques_registrar_salida_flujo')) {
      mov_global_cheques_registrar_salida_flujo($pdo, $idMovimiento, $mpFlujo, $descripcion);
    }
  }
}


if (!function_exists('op_preparar_cheques_compartidos_salida_lote')) {
  function op_preparar_cheques_compartidos_salida_lote(PDO $pdo, array $mediosPorMovimiento, ?string $fechaEvento = null): array
  {
    $vistos = [];
    $flujoExtraRegistrado = [];

    foreach ($mediosPorMovimiento as $idMovRaw => $rows) {
      $idMovimiento = (int)$idMovRaw;
      if ($idMovimiento <= 0 || !is_array($rows)) continue;

      foreach ($rows as $idx => $mp) {
        if (!is_array($mp)) continue;

        $key = op_cheque_key_para_lote($mp);
        if ($key === null) continue;

        $tipo = op_normalizar_tipo_cheque($mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? (($mp['cheque']['tipo'] ?? null) ?: 'cheque'));
        $idCheque = (int)($mp['id_cheque'] ?? 0);
        $mp['tipo_cheque'] = $tipo;
        $mp['cheque_tipo'] = $tipo;
        if ($fechaEvento !== null && $fechaEvento !== '') {
          $mp['fecha_evento'] = $fechaEvento;
          $mp['fecha'] = $fechaEvento;
        }

        if (!isset($vistos[$key])) {
          $vistos[$key] = [
            'id_cheque' => $idCheque,
            'id_movimiento_principal' => $idMovimiento,
            'tipo' => $tipo,
          ];
          $mediosPorMovimiento[$idMovimiento][$idx] = $mp;
          continue;
        }

        $idChequeCompartido = (int)($vistos[$key]['id_cheque'] ?? 0);
        $idMovPrincipal = (int)($vistos[$key]['id_movimiento_principal'] ?? 0);

        if ($idChequeCompartido > 0 && $idMovimiento !== $idMovPrincipal) {
          // Evita el UNIQUE(id_cheque) en movimientos_medios_pago.
          // La relación visible del cheque con esta orden queda en movimientos_cheques_flujo.
          $mp['id_cheque'] = null;

          $flowKey = $idChequeCompartido . ':' . $idMovimiento;
          if (empty($flujoExtraRegistrado[$flowKey])) {
            op_registrar_flujo_cheque_compartido_salida($pdo, $idChequeCompartido, $idMovimiento, $mp);
            $flujoExtraRegistrado[$flowKey] = true;
          }
        } elseif ($idChequeCompartido > 0) {
          $mp['id_cheque'] = $idChequeCompartido;
        }

        $mediosPorMovimiento[$idMovimiento][$idx] = $mp;
      }
    }

    return $mediosPorMovimiento;
  }
}


/* =========================================================
   LISTAR CHEQUES EN CARTERA ACTIVOS
========================================================= */
function ordenes_pago_cheques_cartera_listar(PDO $pdo): void
{
  mov_global_cheques_cartera_listar($pdo);
}


/* =========================================================
   LISTAR (GET)
========================================================= */

if (!function_exists('op_productos_label')) {
  function op_productos_label(array $itemsDetalle): string
  {
    $cantidad = count($itemsDetalle);
    if ($cantidad <= 0) return 'SIN PRODUCTOS';
    if ($cantidad === 1) return '1 PRODUCTO';
    return $cantidad . ' PRODUCTOS';
  }
}

if (!function_exists('op_listar_items_detalle_por_movimientos')) {
  function op_listar_items_detalle_por_movimientos(PDO $pdo, array $idsMovimientos): array
  {
    $ids = [];
    foreach ($idsMovimientos as $id) {
      $n = (int)$id;
      if ($n > 0) $ids[$n] = $n;
    }
    if (!$ids) return [];

    $ids = array_values($ids);
    $ph = implode(',', array_fill(0, count($ids), '?'));

    $sql = "
      SELECT
        mi.id_item,
        mi.id_movimiento,
        mi.id_detalle,
        mi.id_stock_producto,
        mi.cantidad,
        mi.precio,
        mi.iva_pct,
        mi.subtotal,
        mi.iva_monto,
        mi.total,
        COALESCE(sp.nombre, '') AS stock_producto_nombre,
        COALESCE(d.nombre, '') AS detalle_nombre,
        COALESCE(sp.nombre, d.nombre, '') AS producto_nombre
      FROM movimientos_items mi
      LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
      LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
      WHERE mi.id_movimiento IN ($ph)
      ORDER BY mi.id_movimiento ASC, mi.id_item ASC
    ";

    $st = $pdo->prepare($sql);
    foreach ($ids as $i => $idMov) {
      $st->bindValue($i + 1, (int)$idMov, PDO::PARAM_INT);
    }
    $st->execute();

    $out = [];
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as $it) {
      $idMov = (int)($it['id_movimiento'] ?? 0);
      if ($idMov <= 0) continue;
      if (!isset($out[$idMov])) $out[$idMov] = [];

      $out[$idMov][] = [
        'id_item'               => isset($it['id_item']) ? (int)$it['id_item'] : null,
        'id_movimiento'         => $idMov,
        'id_detalle'            => $it['id_detalle'] === null ? null : (int)$it['id_detalle'],
        'id_stock_producto'     => $it['id_stock_producto'] === null ? null : (int)$it['id_stock_producto'],
        'producto_nombre'       => (string)($it['producto_nombre'] ?? ''),
        'stock_producto_nombre' => (string)($it['stock_producto_nombre'] ?? ''),
        'detalle_nombre'        => (string)($it['detalle_nombre'] ?? ''),
        'cantidad'              => (float)($it['cantidad'] ?? 0),
        'precio'                => (float)($it['precio'] ?? 0),
        'iva_pct'               => (float)($it['iva_pct'] ?? 0),
        'subtotal'              => (float)($it['subtotal'] ?? 0),
        'iva_monto'             => (float)($it['iva_monto'] ?? 0),
        'total'                 => (float)($it['total'] ?? 0),
      ];
    }

    return $out;
  }
}

function ordenes_pago_listar(PDO $pdo): void
{
  $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

  $limit  = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
  $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

  if ($limit <= 0) $limit = 100;
  if ($limit > 100) $limit = 100;
  if ($offset < 0) $offset = 0;

  $limitPlus = $limit + 1;

  $where = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :op_compra";
  $params[':op_compra'] = 2;

  $where[] = "m.id_tipo_venta = :tv_ctacte";
  $params[':tv_ctacte'] = 2;

  $where[] = "COALESCE(cb.cobrado_total, 0) < (COALESCE(it.total_sum, m.monto_total, 0) - 0.00001)";

  if ($fechaDesde !== '' && op_is_valid_fecha($fechaDesde)) {
    $where[] = "m.fecha >= :fecha_desde";
    $params[':fecha_desde'] = $fechaDesde;
  }

  if ($fechaHasta !== '' && op_is_valid_fecha($fechaHasta)) {
    $where[] = "m.fecha <= :fecha_hasta";
    $params[':fecha_hasta'] = $fechaHasta;
  }

  $from = "
    FROM movimientos m
      LEFT JOIN clasificaciones c ON c.id_clasificacion = m.id_clasificacion
      LEFT JOIN tipos_venta tv    ON tv.id_tipo_venta = m.id_tipo_venta
      LEFT JOIN clientes cl       ON cl.id_cliente = m.id_cliente
      LEFT JOIN proveedores pr    ON pr.id_proveedor = m.id_proveedor
            LEFT JOIN medios_pago mp    ON mp.id_medio_pago = m.id_medio_pago

      LEFT JOIN (
        SELECT mi1.*
        FROM movimientos_items mi1
        INNER JOIN (
          SELECT id_movimiento, MIN(id_item) AS min_id_item
          FROM movimientos_items
          GROUP BY id_movimiento
        ) x ON x.id_movimiento = mi1.id_movimiento AND x.min_id_item = mi1.id_item
      ) fi ON fi.id_movimiento = m.id_movimiento
      LEFT JOIN stock_productos spi ON spi.id_stock_producto = fi.id_stock_producto

      LEFT JOIN (
        SELECT id_movimiento, SUM(total) AS total_sum
        FROM movimientos_items
        GROUP BY id_movimiento
      ) it ON it.id_movimiento = m.id_movimiento

      LEFT JOIN (
        SELECT
          id_movimiento,
          SUM(monto) AS cobrado_total,
          MAX(fecha_cobro) AS ultimo_cobro,
          MAX(id_comprobante) AS ultimo_id_comprobante
        FROM cobros
        GROUP BY id_movimiento
      ) cb ON cb.id_movimiento = m.id_movimiento

      LEFT JOIN comprobantes_archivos ca
        ON ca.id_comprobante = cb.ultimo_id_comprobante
  ";

  if ($q !== '') {
    $like = '%' . $q . '%';

    $where[] = "(
      UPPER(COALESCE(c.nombre,'')) LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,'')) LIKE UPPER(:q2) OR
      UPPER(COALESCE(cl.nombre,'')) LIKE UPPER(:q3) OR
      UPPER(COALESCE(pr.nombre,'')) LIKE UPPER(:q4) OR
      UPPER(COALESCE(spi.nombre, '')) LIKE UPPER(:q5) OR
      UPPER(COALESCE(mp.nombre,'')) LIKE UPPER(:q6) OR
      EXISTS (
        SELECT 1
        FROM movimientos_items miq
        LEFT JOIN stock_productos spq ON spq.id_stock_producto = miq.id_stock_producto
        LEFT JOIN detalles dq ON dq.id_detalle = miq.id_detalle
        WHERE miq.id_movimiento = m.id_movimiento
          AND UPPER(COALESCE(spq.nombre, dq.nombre, '')) LIKE UPPER(:q7)
      )
    )";

    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q6'] = $like;
    $params[':q7'] = $like;
  }

  $whereSql = !empty($where) ? " WHERE " . implode(" AND ", $where) : "";

  $sql = "
    SELECT
      m.id_movimiento,
      m.fecha,
      m.id_tipo_operacion,
      m.id_clasificacion,
      m.id_tipo_venta,
      m.id_cliente,
      m.id_proveedor,
      m.monto_total,
      m.id_medio_pago,
      m.created_at,

      fi.id_stock_producto AS item_id_stock_producto,
      fi.cantidad   AS item_cantidad,
      fi.precio     AS item_precio,
      fi.iva_pct    AS item_iva_pct,
      fi.subtotal   AS item_subtotal,
      fi.iva_monto  AS item_iva_monto,
      fi.total      AS item_total,

      COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,

      COALESCE(c.nombre,'')  AS clasificacion,
      COALESCE(tv.nombre,'') AS tipo_venta,
      COALESCE(cl.nombre,'') AS cliente,
      COALESCE(pr.nombre,'') AS proveedor,
      COALESCE(spi.nombre, '') AS detalle,
      COALESCE(mp.nombre,'') AS medio_pago_nombre,

      COALESCE(cb.cobrado_total, 0) AS cobrado_total,
      COALESCE(cb.ultimo_cobro, '') AS ultimo_cobro,
      COALESCE(cb.ultimo_id_comprobante, 0) AS id_comprobante,
      COALESCE(ca.archivo_url, '') AS comprobante_url
    $from
    $whereSql
    ORDER BY m.fecha DESC, m.id_movimiento DESC
    LIMIT :lim OFFSET :off
  ";

  $stmt = $pdo->prepare($sql);
  foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
  }
  $stmt->bindValue(':lim', (int)$limitPlus, PDO::PARAM_INT);
  $stmt->bindValue(':off', (int)$offset, PDO::PARAM_INT);
  $stmt->execute();

  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $hasMore = count($rows) > $limit;
  if ($hasMore) array_pop($rows);

  $nextOffset = $hasMore ? ($offset + $limit) : null;

  $idsMovimientos = array_values(array_unique(array_filter(array_map(static fn($r) => (int)($r['id_movimiento'] ?? 0), $rows))));
  $itemsPorMovimiento = op_listar_items_detalle_por_movimientos($pdo, $idsMovimientos);
  $mediosPorMovimiento = function_exists('mv_medios_pago_listar_detalle_por_movimientos')
    ? mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovimientos)
    : [];

  $data = [];
  foreach ($rows as $r) {
    $id_stock_producto_final = $r['item_id_stock_producto'] !== null
      ? (int)$r['item_id_stock_producto']
      : null;

    $tipoVentaTxt = trim((string)($r['tipo_venta'] ?? ''));
    $medioPagoTxt = trim((string)($r['medio_pago_nombre'] ?? ''));

    $montoFinal = op_round_money((float)($r['monto_total_final'] ?? 0));
    $cobrado = op_round_money((float)($r['cobrado_total'] ?? 0));
    $saldoPendiente = max(0.0, op_round_money($montoFinal - $cobrado));
    $estadoPago = op_estado_pago($montoFinal, $cobrado);
    $idMov = (int)$r['id_movimiento'];
    $itemsDetalle = $itemsPorMovimiento[$idMov] ?? [];
    $mediosDetalle = $mediosPorMovimiento[$idMov] ?? [];
    $detalleOriginal = implode(' | ', array_values(array_filter(array_map(
      static fn($it) => trim((string)($it['producto_nombre'] ?? $it['stock_producto_nombre'] ?? $it['detalle_nombre'] ?? '')),
      $itemsDetalle
    ))));

    $data[] = [
      'id_movimiento'     => $idMov,
      'fecha'             => (string)$r['fecha'],
      'id_tipo_operacion' => (int)$r['id_tipo_operacion'],
      'id_clasificacion'  => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta'     => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'id_cliente'        => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
      'id_proveedor'      => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
      'id_stock_producto' => $id_stock_producto_final,
      'id_detalle'        => $id_stock_producto_final,
      'id_medio_pago'     => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
      'pago_tipo_venta'   => $tipoVentaTxt,
      'medio_pago_nombre' => $medioPagoTxt,
      'monto_total'       => $montoFinal,
      'cobrado_total'     => $cobrado,
      'saldo_pendiente'   => $saldoPendiente,
      'estado_pago'       => $estadoPago,
      'ultimo_cobro'      => (string)($r['ultimo_cobro'] ?? ''),
      'pagado'            => $estadoPago === 'pagado',
      'id_comprobante'    => (int)($r['id_comprobante'] ?? 0),
      'comprobante_url'   => (string)($r['comprobante_url'] ?? ''),
      'cantidad'          => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
      'precio'            => $r['item_precio'] === null ? null : (float)$r['item_precio'],
      'iva_pct'           => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
      'subtotal'          => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
      'iva_monto'         => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'             => $r['item_total'] === null ? null : (float)$r['item_total'],
      'clasificacion'     => (string)($r['clasificacion'] ?? ''),
      'tipo_venta'        => $tipoVentaTxt,
      'cliente'           => (string)($r['cliente'] ?? ''),
      'proveedor'         => (string)($r['proveedor'] ?? ''),
      'detalle'           => op_productos_label($itemsDetalle),
      'detalle_original'  => $detalleOriginal,
      'cantidad_items'    => count($itemsDetalle),
      'items_detalle'     => $itemsDetalle,
      'medios_pago_detalle' => $mediosDetalle,
      'cantidad_medios_pago' => count($mediosDetalle),
      'created_at'        => (string)($r['created_at'] ?? ''),
    ];
  }

  op_ok([
    'movimientos' => $data,
    'has_more'    => $hasMore,
    'next_offset' => $nextOffset,
    'limit'       => $limit,
    'offset'      => $offset,
  ]);
}

/* =========================================================
   ACTUALIZAR (POST)
========================================================= */
function ordenes_pago_actualizar(PDO $pdo): void
{
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') op_fail('Método no permitido.', 405);

  $body = op_read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = op_resolver_usuario_auditoria($pdo, $src);

  $id_movimiento = op_n_int($src['id_movimiento'] ?? null);
  if (!$id_movimiento) op_fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id_movimiento]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) op_fail('El movimiento no existe: ' . $id_movimiento);

  if ((int)($before['id_tipo_operacion'] ?? 0) !== 2 || (int)($before['id_tipo_venta'] ?? 0) !== 2) {
    op_fail('Este movimiento no es una orden de pago (COMPRA + CUENTA CORRIENTE).');
  }

  $fecha = op_normalizar_fecha_movimiento($src['fecha'] ?? null);
  if ($fecha === null) {
    op_fail('La fecha de la orden de pago es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.');
  }

  $id_proveedor = array_key_exists('id_proveedor', $src)
    ? op_n_int($src['id_proveedor'])
    : op_n_int($before['id_proveedor'] ?? null);

  $id_stock_producto = array_key_exists('id_stock_producto', $src)
    ? op_n_int($src['id_stock_producto'])
    : (
        array_key_exists('id_detalle', $src)
          ? op_n_int($src['id_detalle'])
          : op_n_int($before['id_stock_producto'] ?? null)
      );

  $id_medio_pago = array_key_exists('id_medio_pago', $src)
    ? op_n_int($src['id_medio_pago'])
    : op_n_int($before['id_medio_pago'] ?? null);

  $monto_total_in = array_key_exists('monto_total', $src)
    ? op_n_float($src['monto_total'])
    : null;

  if (!$id_proveedor || $id_proveedor <= 0) {
    op_fail('Seleccioná un proveedor.');
  }

  $hasDetalleValido = ($id_stock_producto !== null && $id_stock_producto > 0);

  $item = null;
  if ($hasDetalleValido) {
    $baseMonto = ($monto_total_in !== null)
      ? (float)$monto_total_in
      : (float)($before['monto_total'] ?? 0);

    $item = op_item_payload_from_src($src, $baseMonto, (int)$id_stock_producto);
  }

  if ($item !== null) {
    $totalCabecera = (float)$item['total'];
  } elseif ($monto_total_in !== null) {
    $totalCabecera = (float)$monto_total_in;
  } else {
    $totalCabecera = isset($before['monto_total']) ? (float)$before['monto_total'] : 0.0;
  }

  try {
    $pdo->beginTransaction();

    $sql = "
      UPDATE movimientos SET
        fecha = :fecha,
        id_proveedor = :id_proveedor,
        monto_total = :monto_total,
        id_medio_pago = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
      ':fecha'             => $fecha,
      ':id_proveedor'      => $id_proveedor,
      ':monto_total'       => $totalCabecera,
      ':id_medio_pago'     => $id_medio_pago,
      ':id_movimiento'     => $id_movimiento,
    ]);

    if ($item !== null) {
      $getFirst = $pdo->prepare("SELECT id_item FROM movimientos_items WHERE id_movimiento = :id ORDER BY id_item ASC LIMIT 1");
      $getFirst->execute([':id' => $id_movimiento]);
      $first = $getFirst->fetch(PDO::FETCH_ASSOC);

      if ($first && !empty($first['id_item'])) {
        $id_item = (int)$first['id_item'];
        $upd = $pdo->prepare("
          UPDATE movimientos_items SET
            id_stock_producto = :id_stock_producto,
            cantidad = :cantidad,
            precio = :precio,
            iva_pct = :iva_pct,
            subtotal = :subtotal,
            iva_monto = :iva_monto,
            total = :total
          WHERE id_item = :id_item
          LIMIT 1
        ");
        $upd->execute([
          ':id_stock_producto' => $item['id_stock_producto'],
          ':cantidad'          => $item['cantidad'],
          ':precio'            => $item['precio'],
          ':iva_pct'           => $item['iva_pct'],
          ':subtotal'          => $item['subtotal'],
          ':iva_monto'         => $item['iva_monto'],
          ':total'             => $item['total'],
          ':id_item'           => $id_item,
        ]);
      } else {
        $ins = $pdo->prepare("
          INSERT INTO movimientos_items
            (id_movimiento, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
          VALUES
            (:id_movimiento, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
        ");
        $ins->execute([
          ':id_movimiento'     => $id_movimiento,
          ':id_stock_producto' => $item['id_stock_producto'],
          ':cantidad'          => $item['cantidad'],
          ':precio'            => $item['precio'],
          ':iva_pct'           => $item['iva_pct'],
          ':subtotal'          => $item['subtotal'],
          ':iva_monto'         => $item['iva_monto'],
          ':total'             => $item['total'],
        ]);
      }
    }

    $pdo->commit();

    $afterSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $afterSt->execute([':id' => $id_movimiento]);
    $after = $afterSt->fetch(PDO::FETCH_ASSOC);

    op_audit_safe($pdo, $idUsuario, 'actualizar', 'ordenes_pago', $id_movimiento, [
      'antes'   => $before,
      'despues' => $after ?: null,
      'item'    => $item,
    ]);

    op_ok([
      'mensaje'       => 'Orden de pago actualizada.',
      'actualizado'   => true,
      'id_movimiento' => $id_movimiento
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    op_fail('No se pudo actualizar la orden de pago. ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   CONFIRMAR PAGO (POST)
========================================================= */
function ordenes_pago_confirmar_pago(PDO $pdo): void
{
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') op_fail('Método no permitido.', 405);

  $body = op_read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = op_resolver_usuario_auditoria($pdo, $src);

  $ids = $src['ids_movimiento'] ?? $src['ids_movimientos'] ?? [];
  if (!is_array($ids)) $ids = [];

  $idsOk = [];
  foreach ($ids as $x) {
    $n = op_n_int($x);
    if ($n !== null && $n > 0) $idsOk[] = $n;
  }
  $idsOk = array_values(array_unique($idsOk));
  if (!$idsOk) op_fail('Faltan ids_movimiento para confirmar.');

  /*
   * Compatibilidad:
   * - flujo viejo: id_medio_pago único
   * - flujo nuevo: medios_pago[] con montos para pago parcial/múltiple medio
   */
  $mediosPagoRaw = [];
  if (!empty($src['medios_pago']) && is_array($src['medios_pago'])) {
    $mediosPagoRaw = $src['medios_pago'];
  } elseif (!empty($src['id_medio_pago'])) {
    $mediosPagoRaw = [[
      'id_medio_pago' => $src['id_medio_pago'],
      'monto'         => 0,
      'id_cheque'     => $src['id_cheque'] ?? null,
    ]];
  } else {
    op_fail('Falta medios_pago (o id_medio_pago para retrocompatibilidad).');
  }

  $montoPagoSolicitado = op_monto_pago_from_request($src);
  $fechaCobro = op_normalizar_fecha_movimiento($src['fecha_cobro'] ?? $src['fecha_pago'] ?? $src['fecha'] ?? null);
  if ($fechaCobro === null) {
    op_fail('La fecha de pago es obligatoria y debe venir desde el modal/frontend en formato AAAA-MM-DD.');
  }

  try {
    $pdo->beginTransaction();

    [$inMov, $paramsMov] = op_build_in_params($idsOk, ':mov');
    [$inCob, $paramsCob] = op_build_in_params($idsOk, ':cob');

    $inSqlMov = implode(',', $inMov);
    $inSqlCob = implode(',', $inCob);

    $sqlMovs = "
      SELECT
        m.id_movimiento,
        m.id_tipo_operacion,
        m.id_tipo_venta,
        m.id_medio_pago,
        COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
        COALESCE(cb.cobrado_total, 0) AS cobrado_total
      FROM movimientos m
      LEFT JOIN (
        SELECT id_movimiento, SUM(total) AS total_sum
        FROM movimientos_items
        GROUP BY id_movimiento
      ) it ON it.id_movimiento = m.id_movimiento
      LEFT JOIN (
        SELECT id_movimiento, SUM(monto) AS cobrado_total
        FROM cobros
        WHERE id_movimiento IN ($inSqlCob)
        GROUP BY id_movimiento
      ) cb ON cb.id_movimiento = m.id_movimiento
      WHERE m.id_movimiento IN ($inSqlMov)
      FOR UPDATE
    ";

    $stMovs = $pdo->prepare($sqlMovs);
    foreach ($paramsCob as $k => $v) $stMovs->bindValue($k, $v, PDO::PARAM_INT);
    foreach ($paramsMov as $k => $v) $stMovs->bindValue($k, $v, PDO::PARAM_INT);
    $stMovs->execute();

    $rowsMovs = $stMovs->fetchAll(PDO::FETCH_ASSOC) ?: [];
    if (!$rowsMovs) {
      $pdo->rollBack();
      op_fail('No se encontraron movimientos para pagar.');
    }

    $validos = [];
    $pendientes = [];
    $yaPagados = [];
    $saldoTotal = 0.0;

    foreach ($rowsMovs as $r) {
      $idMov = (int)($r['id_movimiento'] ?? 0);
      $tipoOp = (int)($r['id_tipo_operacion'] ?? 0);
      $tipoVenta = (int)($r['id_tipo_venta'] ?? 0);
      $montoTotal = op_round_money((float)($r['monto_total_final'] ?? 0));
      $cobrado = op_round_money((float)($r['cobrado_total'] ?? 0));
      $saldo = max(0.0, op_round_money($montoTotal - $cobrado));

      if ($idMov <= 0) continue;
      if ($tipoOp !== 2 || $tipoVenta !== 2) continue;

      $validos[] = $idMov;

      if ($saldo <= 0.00001) {
        $yaPagados[] = $idMov;
      } else {
        $pendientes[] = [
          'id_movimiento' => $idMov,
          'monto_total' => $montoTotal,
          'cobrado_total' => $cobrado,
          'saldo' => $saldo,
          'monto' => $saldo,
        ];
        $saldoTotal = op_round_money($saldoTotal + $saldo);
      }
    }

    if (!$validos) {
      $pdo->rollBack();
      op_fail('No hay movimientos válidos para pagar (deben ser COMPRA + CUENTA CORRIENTE).');
    }

    if (empty($pendientes)) {
      $pdo->rollBack();
      op_ok([
        'mensaje' => 'Los movimientos seleccionados ya estaban pagados.',
        'cobros_insertados' => 0,
        'movimientos_actualizados' => 0,
        'ids_movimiento' => $validos,
        'ids_movimiento_ya_pagados' => $yaPagados,
        'ids_cobro' => [],
        'id_cobro' => null,
        'id_medio_pago' => null,
        'medios_pago_cantidad' => 0,
        'monto_pagado' => 0,
        'saldo_total_previo' => 0,
        'saldo_total_restante' => 0,
        'tipo_pago' => 'sin_saldo',
        'distribucion' => [],
        'cheques_dados_de_baja' => [],
      ]);
    }

    if (count($mediosPagoRaw) === 1 && (float)($mediosPagoRaw[0]['monto'] ?? 0) <= 0) {
      $mediosPagoRaw[0]['monto'] = $saldoTotal;
    }

    $montoPago = $montoPagoSolicitado === null
      ? $saldoTotal
      : op_round_money((float)$montoPagoSolicitado);

    if ($montoPago <= 0.00001) {
      $pdo->rollBack();
      op_fail('El monto a pagar debe ser mayor a cero.');
    }

    if ($montoPago > ($saldoTotal + 0.00001)) {
      $pdo->rollBack();
      op_fail('El monto a pagar no puede superar el saldo pendiente.', 200, [
        'saldo_pendiente' => $saldoTotal,
        'monto_solicitado' => $montoPago,
      ]);
    }

    $mediosValidados = op_validar_medios_pago_multi($pdo, $mediosPagoRaw, $montoPago);
    op_lock_cheques_multi($pdo, $mediosValidados);

    $legacyIdMedioPago = op_n_int($src['id_medio_pago'] ?? null);
    $planPago = op_payment_storage_plan($mediosValidados, $legacyIdMedioPago);
    $usarTablaMediosPago = !empty($planPago['rows']);

    $idMedioPagoPrincipal = $planPago['id_medio_pago'] !== null
      ? (int)$planPago['id_medio_pago']
      : null;

    $distribucion = op_distribuir_pago_equitativo($pendientes, $montoPago);
    if (empty($distribucion)) {
      $pdo->rollBack();
      op_fail('No se pudo distribuir el pago entre las órdenes seleccionadas.');
    }

    $mediosPorMovimiento = [];
    if ($usarTablaMediosPago) {
      $mediosPorMovimiento = op_distribuir_medios_pago_por_movimiento($distribucion, $planPago['rows']);
      $mediosPorMovimiento = op_preparar_cheques_compartidos_salida_lote($pdo, $mediosPorMovimiento, $fechaCobro);
    }

    $idsCobro = [];
    $insertados = 0;
    $montoInsertado = 0.0;
    $idsInsertadosMov = [];

    $sqlIns = "
      INSERT INTO cobros (id_movimiento, fecha_cobro, monto, id_medio_pago, id_comprobante)
      VALUES (:id_movimiento, :fecha_cobro, :monto, :id_medio_pago, NULL)
    ";
    $stIns = $pdo->prepare($sqlIns);

    foreach ($distribucion as $p) {
      $idMovimiento = (int)$p['id_movimiento'];
      $montoCobro = op_round_money((float)$p['monto']);
      if ($idMovimiento <= 0 || $montoCobro <= 0.00001) continue;

      $stIns->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
      $stIns->bindValue(':fecha_cobro', $fechaCobro, PDO::PARAM_STR);
      $stIns->bindValue(':monto', $montoCobro);
      if ($idMedioPagoPrincipal !== null && $idMedioPagoPrincipal > 0) {
        $stIns->bindValue(':id_medio_pago', $idMedioPagoPrincipal, PDO::PARAM_INT);
      } else {
        $stIns->bindValue(':id_medio_pago', null, PDO::PARAM_NULL);
      }
      $stIns->execute();

      $idCobro = (int)$pdo->lastInsertId();
      if ($idCobro > 0) $idsCobro[] = $idCobro;

      if ($usarTablaMediosPago) {
        $rowsMediosMovimiento = $mediosPorMovimiento[$idMovimiento] ?? [];
        op_insertar_medios_pago_multi($pdo, $idMovimiento, $rowsMediosMovimiento);
      }

      $idsInsertadosMov[] = $idMovimiento;
      $insertados++;
      $montoInsertado = op_round_money($montoInsertado + $montoCobro);
    }

    if (!empty($idsInsertadosMov)) {
      $idsInsertadosMov = array_values(array_unique($idsInsertadosMov));
      [$inUpd, $paramsUpd] = op_build_in_params($idsInsertadosMov, ':u');
      $inSqlUpd = implode(',', $inUpd);

      $sqlUpdMov = "
        UPDATE movimientos
        SET id_medio_pago = :id_medio_pago_upd
        WHERE id_movimiento IN ($inSqlUpd)
          AND id_tipo_operacion = 2
          AND id_tipo_venta = 2
      ";
      $stUpdMov = $pdo->prepare($sqlUpdMov);
      if ($idMedioPagoPrincipal !== null && $idMedioPagoPrincipal > 0) {
        $stUpdMov->bindValue(':id_medio_pago_upd', $idMedioPagoPrincipal, PDO::PARAM_INT);
      } else {
        $stUpdMov->bindValue(':id_medio_pago_upd', null, PDO::PARAM_NULL);
      }
      foreach ($paramsUpd as $k => $v) $stUpdMov->bindValue($k, $v, PDO::PARAM_INT);
      $stUpdMov->execute();
    }

    if (!empty($mediosValidados)) {
      op_dar_baja_cheques_multi($pdo, $mediosValidados);
    }

    $saldoRestante = max(0.0, op_round_money($saldoTotal - $montoInsertado));
    $tipoPago = $saldoRestante <= 0.00001 ? 'pago_total' : 'pago_parcial';

    $pdo->commit();

    op_audit_safe($pdo, $idUsuario, 'confirmar_pago', 'ordenes_pago', null, [
      'ids_movimiento_solicitados' => $idsOk,
      'ids_movimiento_validos' => $validos,
      'ids_movimiento_ya_pagados' => $yaPagados,
      'ids_cobro' => $idsCobro,
      'id_medio_pago' => $idMedioPagoPrincipal,
      'medios_pago' => $mediosValidados,
      'cobros_insertados' => $insertados,
      'tabla_medios_pago_usada' => $usarTablaMediosPago ? 'movimientos_medios_pago' : null,
      'monto_solicitado' => $montoPagoSolicitado,
      'monto_pagado' => $montoInsertado,
      'saldo_total_previo' => $saldoTotal,
      'saldo_total_restante' => $saldoRestante,
      'tipo_pago' => $tipoPago,
      'distribucion' => $distribucion,
    ]);

    op_ok([
      'mensaje' => $tipoPago === 'pago_parcial'
        ? 'Pago parcial registrado correctamente.'
        : 'Pago registrado correctamente.',
      'tipo_pago' => $tipoPago,
      'cobros_insertados' => $insertados,
      'movimientos_actualizados' => $insertados,
      'ids_movimiento' => $validos,
      'ids_movimiento_ya_pagados' => $yaPagados,
      'id_medio_pago' => $idMedioPagoPrincipal,
      'ids_cobro' => $idsCobro,
      'id_cobro' => $idsCobro[0] ?? null,
      'medios_pago_cantidad' => count($mediosValidados),
      'monto_pagado' => $montoInsertado,
      'saldo_total_previo' => $saldoTotal,
      'saldo_total_restante' => $saldoRestante,
      'distribucion' => $distribucion,
      'cheques_dados_de_baja' => array_values(
        array_filter(array_column($mediosValidados, 'id_cheque'))
      ),
      'tabla_medios_pago_usada' => $usarTablaMediosPago ? 'movimientos_medios_pago' : null,
    ]);

  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    op_fail('No se pudo confirmar el pago. ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action === '') op_fail('Falta parámetro action.');

switch ($action) {
  case 'ordenes_pago_listar':
    ordenes_pago_listar($pdo);
    break;

  case 'ordenes_pago_actualizar':
    ordenes_pago_actualizar($pdo);
    break;

  case 'ordenes_pago_confirmar_pago':
    ordenes_pago_confirmar_pago($pdo);
    break;


  default:
    op_fail('Acción no válida en ordenes_pago: ' . $action, 400);
}