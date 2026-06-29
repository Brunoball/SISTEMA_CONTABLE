<?php
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

global $pdo;

require_once __DIR__ . '/../core/plan_saas.php';
require_once __DIR__ . '/../global/cheques.php';
require_once __DIR__ . '/../global/medios_pago.php';
require_once __DIR__ . '/../../utils/auditoria.php';

/* ----------------- Helpers compartidos ----------------- */
if (!function_exists('ok')) {
  function ok(array $arr = []): void {
    echo json_encode(
      array_merge(['exito' => true], $arr),
      JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
  }
}

if (!function_exists('fail')) {
  function fail(string $msg, int $httpCode = 200, array $extra = []): void {
    http_response_code($httpCode);
    echo json_encode(
      array_merge(['exito' => false, 'mensaje' => $msg], $extra),
      JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
  }
}

if (!function_exists('read_json_body')) {
  function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('n_int')) {
  function n_int($v): ?int {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    $n = (int)$v;
    return $n >= 0 ? $n : null;
  }
}

if (!function_exists('n_float')) {
  function n_float($v): ?float {
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
}

if (!function_exists('today_iso')) {
  function today_iso(): string {
    return date('Y-m-d');
  }
}

if (!function_exists('is_valid_fecha')) {
  function is_valid_fecha(string $f): bool {
    if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
  }
}

if (!function_exists('normalizar_fecha_movimiento')) {
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
}


if (!function_exists('recibos_round_money')) {
  function recibos_round_money(float $n): float {
    return round($n, 2);
  }
}

if (!function_exists('recibos_estado_pago')) {
  function recibos_estado_pago(float $total, float $cobrado): string {
    $saldo = max(0.0, recibos_round_money($total - $cobrado));
    if ($saldo <= 0.00001) return 'pagado';
    if ($cobrado > 0.00001) return 'parcialmente_pagado';
    return 'pendiente';
  }
}

if (!function_exists('recibos_monto_pago_from_request')) {
  function recibos_monto_pago_from_request(array $src): ?float {
    // En pago parcial, la fuente más confiable es la suma de medios_pago.
    // Evita que campos legacy como total_recibo/total vengan con el saldo completo.
    if (isset($src['medios_pago']) && is_array($src['medios_pago'])) {
      $sumaMedios = 0.0;
      foreach ($src['medios_pago'] as $mp) {
        if (!is_array($mp)) continue;
        $m = n_float($mp['monto'] ?? $mp['importe'] ?? $mp['valor'] ?? null);
        if ($m !== null && $m > 0) $sumaMedios += (float)$m;
      }
      $sumaMedios = recibos_round_money($sumaMedios);
      if ($sumaMedios > 0.00001) return $sumaMedios;
    }

    foreach ([
      'monto_pago',
      'monto_a_pagar',
      'monto_cobro',
      'monto_recibo',
      'importe_pago',
      'importe_recibo',
      'total_pago',
      'total_cobro',
      'total_recibo',
      'total',
    ] as $key) {
      $v = n_float($src[$key] ?? null);
      if ($v !== null && $v > 0) return recibos_round_money((float)$v);
    }

    return null;
  }
}

if (!function_exists('recibos_distribuir_pago_equitativo')) {
  function recibos_distribuir_pago_equitativo(array $pendientes, float $montoPago): array {
    $restante = recibos_round_money($montoPago);
    $activos = [];

    foreach ($pendientes as $p) {
      $id = (int)($p['id_movimiento'] ?? 0);
      $saldo = recibos_round_money((float)($p['saldo'] ?? $p['monto'] ?? 0));
      if ($id > 0 && $saldo > 0.00001) {
        $activos[$id] = $saldo;
      }
    }

    $alloc = [];
    while ($restante > 0.00001 && count($activos) > 0) {
      $cuota = recibos_round_money($restante / count($activos));
      if ($cuota <= 0.00001) $cuota = $restante;

      $aplicoEnVuelta = 0.0;
      foreach (array_keys($activos) as $id) {
        if ($restante <= 0.00001) break;

        $saldoDisponible = recibos_round_money($activos[$id]);
        $monto = min($cuota, $saldoDisponible, $restante);
        $monto = recibos_round_money($monto);
        if ($monto <= 0.00001) {
          unset($activos[$id]);
          continue;
        }

        if (!isset($alloc[$id])) $alloc[$id] = 0.0;
        $alloc[$id] = recibos_round_money($alloc[$id] + $monto);
        $activos[$id] = recibos_round_money($activos[$id] - $monto);
        $restante = recibos_round_money($restante - $monto);
        $aplicoEnVuelta = recibos_round_money($aplicoEnVuelta + $monto);

        if ($activos[$id] <= 0.00001) unset($activos[$id]);
      }

      if ($aplicoEnVuelta <= 0.00001) break;
    }

    $out = [];
    foreach ($alloc as $id => $monto) {
      $monto = recibos_round_money((float)$monto);
      if ($monto > 0.00001) {
        $out[] = ['id_movimiento' => (int)$id, 'monto' => $monto];
      }
    }
    return $out;
  }
}

if (!function_exists('build_in_params')) {
  function build_in_params(array $ids, string $prefix = ':id'): array {
    $placeholders = [];
    $params = [];
    foreach (array_values($ids) as $i => $id) {
      $ph = $prefix . $i;
      $placeholders[] = $ph;
      $params[$ph] = (int)$id;
    }
    return [$placeholders, $params];
  }
}

/* ----------------- PDO check ----------------- */
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('Conexión PDO no disponible (tenant no resuelto o sesión inválida).', 500);
}

/* =========================================================
   idUsuario / auditoría robusta
========================================================= */
if (!function_exists('get_header_value')) {
  function get_header_value(string $key): string {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
    $v = $_SERVER[$serverKey] ?? '';
    if (!is_string($v)) $v = '';
    return trim($v);
  }
}

if (!function_exists('get_bearer_token')) {
  function get_bearer_token(): string {
    $h = get_header_value('Authorization');
    if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($h === '') return '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return '';
  }
}

if (!function_exists('base64url_decode')) {
  function base64url_decode(string $s): string {
    $s = str_replace(['-', '_'], ['+', '/'], $s);
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
  }
}

if (!function_exists('extract_positive_int_from_candidates')) {
  function extract_positive_int_from_candidates(array $candidates): int {
    foreach ($candidates as $c) {
      if (is_numeric($c)) {
        $id = (int)$c;
        if ($id > 0) return $id;
      }
    }
    return 0;
  }
}

if (!function_exists('get_id_usuario_from_token')) {
  function get_id_usuario_from_token(): int {
    $token = get_bearer_token();
    if ($token === '' || substr_count($token, '.') !== 2) {
      return 0;
    }

    $parts = explode('.', $token);
    $payloadJson = base64url_decode($parts[1] ?? '');
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
}

if (!function_exists('get_id_usuario_from_body_or_request')) {
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
}

if (!function_exists('get_id_usuario_from_x_session')) {
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
}

if (!function_exists('get_id_usuario_from_request')) {
  function get_id_usuario_from_request($pdoOrBody = null, array $body = []): int {
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


    $id = get_id_usuario_from_token();
    if ($id > 0) return $id;

    $id = get_id_usuario_from_body_or_request($body);
    if ($id > 0) return $id;

    if ($pdo instanceof PDO) {
      $id = get_id_usuario_from_x_session($pdo);
      if ($id > 0) return $id;
    }

    return 0;
  }
}

if (!function_exists('resolver_usuario_auditoria')) {
  function resolver_usuario_auditoria(PDO $pdo, array $src = []): int {
    $id = get_id_usuario_from_request($pdo, $src);
    if ($id > 0) return $id;

    if (!empty($_POST) && is_array($_POST)) {
      $id = get_id_usuario_from_request($pdo, $_POST);
      if ($id > 0) return $id;
    }

    $id = get_id_usuario_from_request($pdo, $_GET ?? []);
    if ($id > 0) return $id;

    return 0;
  }
}

if (!function_exists('audit_safe')) {
  function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
    try {
      if ($idUsuario <= 0) {
        $idUsuario = resolver_usuario_auditoria($pdo, []);
      }

      if ($idUsuario <= 0) {
        return;
      }

      auditar($pdo, $idUsuario, 'recibos', $accion, $entidad, $idEntidad, $detalle);
    } catch (Throwable $e) {
      // nunca romper el flujo por auditoría
    }
  }
}

/* =========================================================
   Helpers ITEMS
========================================================= */
if (!function_exists('item_payload_from_src')) {
  function item_payload_from_src(array $src, float $monto_total, int $id_stock_producto): array {
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
        // En ventas/recibos el producto real vive en movimientos_items.id_stock_producto.
        // id_detalle queda en NULL para no confundirlo con el catálogo viejo de detalles.
        'id_stock_producto' => $id_stock_producto,
        'id_detalle' => null,
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
      'id_stock_producto' => $id_stock_producto,
      'id_detalle' => null,
      'cantidad' => $cantidad,
      'precio' => $precio,
      'iva_pct' => $iva_pct,
      'subtotal' => $subtotal,
      'iva_monto' => $iva_monto,
      'total' => $total,
    ];
  }
}

if (!function_exists('recibo_obtener_primer_item_movimiento')) {
  function recibo_obtener_primer_item_movimiento(PDO $pdo, int $idMovimiento): ?array {
    if ($idMovimiento <= 0) return null;

    $st = $pdo->prepare("
      SELECT
        id_item,
        id_movimiento,
        id_detalle,
        id_stock_producto,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
      LIMIT 1
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}



/* =========================================================
   HELPERS MULTI-MEDIO DE PAGO PARA RECIBOS
========================================================= */
if (!function_exists('recibos_detect_medio_pago_tipo_cheque')) {
  function recibos_detect_medio_pago_tipo_cheque(string $nombre): ?string
  {
    return mv_medios_pago_detect_tipo_cheque($nombre);
  }
}





if (!function_exists('recibos_normalizar_tipo_cheque')) {
  function recibos_normalizar_tipo_cheque($tipo): string
  {
    $t = strtolower(trim((string)$tipo));
    $t = str_replace([' ', '-', '_'], '', $t);
    return in_array($t, ['echeq', 'echeque'], true) ? 'echeq' : 'cheque';
  }
}

if (!function_exists('recibos_normalizar_cheque_payload')) {
  function recibos_normalizar_cheque_payload(array $src, string $tipoCheque, float $fallbackMonto = 0.0): array
  {
    try {
      return mv_medios_pago_normalizar_cheque_entrada($src, $tipoCheque, $fallbackMonto);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}





if (!function_exists('recibos_cheques_buscar_activo_para_movimiento')) {
  function recibos_cheques_buscar_activo_para_movimiento(PDO $pdo, int $idMovimiento, string $numeroCheque, ?string $tipoCheque = null): ?array
  {
    return mov_global_cheques_buscar_activo_para_movimiento($pdo, $idMovimiento, $numeroCheque, $tipoCheque);
  }
}

if (!function_exists('recibos_insertar_cheque_desde_payload')) {
  function recibos_insertar_cheque_desde_payload(PDO $pdo, int $idMovimiento, array $cheque): int
  {
    $data = recibos_normalizar_cheque_payload($cheque, (string)($cheque['tipo'] ?? 'cheque'), (float)($cheque['importe'] ?? 0));

    $existente = mov_global_cheques_buscar_activo_para_movimiento(
      $pdo,
      $idMovimiento,
      (string)$data['numero_cheque'],
      (string)$data['tipo']
    );
    if ($existente && !empty($existente['id_cheque'])) {
      return (int)$existente['id_cheque'];
    }

    try {
      return mov_global_cheques_crear_registro($pdo, $idMovimiento, $data, null, true);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}


if (!function_exists('recibos_crear_cheques_pendientes_para_movimiento')) {
  function recibos_crear_cheques_pendientes_para_movimiento(PDO $pdo, int $idMovimiento, array $rowsMedios): array
  {
    try {
      // mv_medios_pago_persistir_cheques_entrada() NO devuelve las filas de medios de pago;
      // devuelve el mapa de cheques creados/asociados. Para insertar en movimientos_medios_pago
      // hay que completar las filas originales con esos id_cheque y devolver esas filas completas.
      $persistCheques = mv_medios_pago_persistir_cheques_entrada($pdo, $idMovimiento, $rowsMedios);
      return mv_medios_pago_completar_ids_cheques_en_rows($rowsMedios, $persistCheques);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}





if (!function_exists('recibos_validar_medios_pago_multi')) {
  function recibos_validar_medios_pago_multi(PDO $pdo, array $mediosPagoRaw, float $montoTotalEsperado): array
  {
    try {
      return mv_medios_pago_validar_multi($pdo, $mediosPagoRaw, $montoTotalEsperado, [
        'modo'                  => 'entrada',
        'permitir_crear_cheque' => true,
        'empty_message'         => 'Falta medios_pago o id_medio_pago.',
        'total_label'           => 'recibo',
      ]);
    } catch (Throwable $e) {
      fail($e->getMessage(), stripos($e->getMessage(), 'plan') !== false ? 403 : 200);
    }
  }
}





if (!function_exists('recibos_payment_storage_plan')) {
  function recibos_payment_storage_plan(array $mediosValidados, ?int $legacyId = null): array
  {
    return mv_medios_pago_storage_plan($mediosValidados, $legacyId);
  }
}





if (!function_exists('recibos_eliminar_medios_pago_movimiento')) {
  function recibos_eliminar_medios_pago_movimiento(PDO $pdo, int $idMovimiento): void
  {
    mv_medios_pago_eliminar_por_movimiento($pdo, $idMovimiento);
  }
}





if (!function_exists('recibos_insertar_medios_pago_multi')) {
  function recibos_insertar_medios_pago_multi(PDO $pdo, int $idMovimiento, array $mediosValidados): void
  {
    try {
      mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosValidados, [
        'contexto'      => 'recibo',
        'salida_cheque' => false,
      ]);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}





if (!function_exists('recibos_distribuir_medios_pago_por_movimiento')) {
  function recibos_distribuir_medios_pago_por_movimiento(array $pendientes, array $mediosValidados): array
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
 * Cuando se cobran varios recibos juntos con un mismo cheque/eCheq, el medio se
 * reparte por movimiento, pero el cheque físico/digital debe existir una sola vez.
 * Antes se intentaba crear el mismo cheque una vez por cada movimiento cobrado y
 * el segundo insert disparaba el falso duplicado: “Ya existe un cheque activo...”.
 *
 * Esta preparación crea/asocia el cheque una sola vez para el primer movimiento
 * del lote. En los demás movimientos deja la fila de medio de pago como cheque
 * pero sin repetir id_cheque (la tabla tiene UNIQUE sobre id_cheque), y agrega un
 * evento de flujo para que el detalle pueda seguir mostrando los datos del cheque.
 */
if (!function_exists('recibos_cheque_key_para_lote')) {
  function recibos_cheque_key_para_lote(array $mp): ?string
  {
    $tipo = recibos_normalizar_tipo_cheque($mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? (($mp['cheque']['tipo'] ?? null) ?: 'cheque'));
    $idCheque = (int)($mp['id_cheque'] ?? 0);
    if ($idCheque > 0) return 'id:' . $idCheque;

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

if (!function_exists('recibos_registrar_flujo_cheque_compartido')) {
  function recibos_registrar_flujo_cheque_compartido(PDO $pdo, int $idCheque, int $idMovimiento, array $mp): void
  {
    if ($idCheque <= 0 || $idMovimiento <= 0) return;
    if (!function_exists('mov_global_cheques_flujo_table_exists') || !mov_global_cheques_flujo_table_exists($pdo)) return;

    $tipo = recibos_normalizar_tipo_cheque($mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? (($mp['cheque']['tipo'] ?? null) ?: 'cheque'));
    $ch = is_array($mp['cheque'] ?? null) ? $mp['cheque'] : [];
    $fechaEvento = normalizar_fecha_movimiento($ch['fecha_emision'] ?? $mp['fecha_emision'] ?? null);

    if ($fechaEvento === null) {
      $stFecha = $pdo->prepare('SELECT fecha_emision FROM movimientos_cheques WHERE id_cheque = :id_cheque LIMIT 1');
      $stFecha->execute([':id_cheque' => $idCheque]);
      $fechaEvento = normalizar_fecha_movimiento($stFecha->fetchColumn() ?: null);
    }
    if ($fechaEvento === null) $fechaEvento = today_iso();

    // El flujo del cheque debe guardar siempre el importe físico/real del cheque,
    // no el parcial usado para completar una deuda puntual del recibo.
    $monto = 0.0;
    try {
      $stImporteCheque = $pdo->prepare('SELECT importe FROM movimientos_cheques WHERE id_cheque = :id_cheque LIMIT 1');
      $stImporteCheque->execute([':id_cheque' => $idCheque]);
      $monto = (float)($stImporteCheque->fetchColumn() ?: 0);
    } catch (Throwable $e) {
      $monto = 0.0;
    }
    if ($monto <= 0) {
      $monto = (float)($ch['importe'] ?? $mp['cheque_importe'] ?? $mp['importe'] ?? $mp['monto'] ?? 0);
    }

    $stExists = $pdo->prepare("
      SELECT COUNT(*)
      FROM movimientos_cheques_flujo
      WHERE id_cheque = :id_cheque
        AND id_movimiento = :id_movimiento
        AND UPPER(COALESCE(evento, '')) IN ('INGRESO_CARTERA','INGRESO','ALTA','ALTA_CARTERA')
    ");
    $stExists->execute([
      ':id_cheque' => $idCheque,
      ':id_movimiento' => $idMovimiento,
    ]);
    if ((int)$stExists->fetchColumn() > 0) return;

    $descripcion = ($tipo === 'echeq' ? 'E-cheq' : 'Cheque') . ' aplicado al cobro conjunto de recibos desde movimiento #' . $idMovimiento . '.';

    $st = $pdo->prepare("
      INSERT INTO movimientos_cheques_flujo
        (tipo_cheque, id_cheque, id_movimiento, evento, fecha_evento, importe, descripcion, usuario)
      VALUES
        (:tipo_cheque, :id_cheque, :id_movimiento, 'INGRESO_CARTERA', :fecha_evento, :importe, :descripcion, NULL)
    ");
    $st->execute([
      ':tipo_cheque' => $tipo,
      ':id_cheque' => $idCheque,
      ':id_movimiento' => $idMovimiento,
      ':fecha_evento' => $fechaEvento,
      ':importe' => round($monto, 2),
      ':descripcion' => $descripcion,
    ]);
  }
}

if (!function_exists('recibos_preparar_cheques_compartidos_lote')) {
  function recibos_preparar_cheques_compartidos_lote(PDO $pdo, array $mediosPorMovimiento, &$chequesCreados = null): array
  {
    if (!is_array($chequesCreados)) $chequesCreados = [];

    $vistos = [];
    $flujoExtraRegistrado = [];

    foreach ($mediosPorMovimiento as $idMovRaw => $rows) {
      $idMovimiento = (int)$idMovRaw;
      if ($idMovimiento <= 0 || !is_array($rows)) continue;

      foreach ($rows as $idx => $mp) {
        if (!is_array($mp)) continue;

        $key = recibos_cheque_key_para_lote($mp);
        if ($key === null) continue;

        $tipo = recibos_normalizar_tipo_cheque($mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? (($mp['cheque']['tipo'] ?? null) ?: 'cheque'));
        $mp['tipo_cheque'] = $tipo;
        $mp['cheque_tipo'] = $tipo;

        if (!isset($vistos[$key])) {
          $idCheque = (int)($mp['id_cheque'] ?? 0);

          if ($idCheque <= 0) {
            $ch = is_array($mp['cheque'] ?? null)
              ? $mp['cheque']
              : (is_array($mp['cheque_data'] ?? null) ? $mp['cheque_data'] : null);

            if (!is_array($ch)) {
              throw new RuntimeException('Cheque: faltan los datos del cheque para cobrar los recibos.');
            }

            $dataCheque = recibos_normalizar_cheque_payload($ch, $tipo, (float)($ch['importe'] ?? $mp['monto'] ?? 0));
            $idCheque = mov_global_cheques_crear_registro($pdo, $idMovimiento, $dataCheque, null, true);
            $mp['cheque'] = $dataCheque;

            $chequesCreados[] = [
              'frontend_row_uid' => (string)($mp['frontend_row_uid'] ?? ''),
              'id_cheque'        => $idCheque,
              'id_movimiento'    => $idMovimiento,
              'tipo'             => $tipo,
              'numero_cheque'    => (string)($dataCheque['numero_cheque'] ?? ''),
            ];
          }

          $mp['id_cheque'] = $idCheque;
          $vistos[$key] = [
            'id_cheque' => $idCheque,
            'id_movimiento_principal' => $idMovimiento,
            'tipo' => $tipo,
            'cheque' => is_array($mp['cheque'] ?? null) ? $mp['cheque'] : [],
          ];
          $mediosPorMovimiento[$idMovimiento][$idx] = $mp;
          continue;
        }

        $idChequeCompartido = (int)($vistos[$key]['id_cheque'] ?? 0);
        $idMovPrincipal = (int)($vistos[$key]['id_movimiento_principal'] ?? 0);

        // Evita violar UNIQUE(id_cheque) en movimientos_medios_pago. El detalle se
        // recupera por movimientos_cheques_flujo para los movimientos secundarios.
        if ($idMovimiento !== $idMovPrincipal) {
          $mp['id_cheque'] = null;
          if (empty($mp['cheque']) && !empty($vistos[$key]['cheque']) && is_array($vistos[$key]['cheque'])) {
            $mp['cheque'] = $vistos[$key]['cheque'];
          }

          $flowKey = $idChequeCompartido . ':' . $idMovimiento;
          if ($idChequeCompartido > 0 && empty($flujoExtraRegistrado[$flowKey])) {
            recibos_registrar_flujo_cheque_compartido($pdo, $idChequeCompartido, $idMovimiento, $mp);
            $flujoExtraRegistrado[$flowKey] = true;
          }
        } else {
          $mp['id_cheque'] = $idChequeCompartido > 0 ? $idChequeCompartido : null;
        }

        $mediosPorMovimiento[$idMovimiento][$idx] = $mp;
      }
    }

    return $mediosPorMovimiento;
  }
}
/* =========================================================
   BASE FILTER RECIBOS
========================================================= */
if (!function_exists('recibos_base_filters')) {
  function recibos_base_filters(array &$where, array &$params): void {
    $where[] = "m.id_tipo_operacion = :op_venta";
    $params[':op_venta'] = 1;

    $where[] = "m.id_tipo_venta = :tv_ctacte";
    $params[':tv_ctacte'] = 2;
  }
}

if (!function_exists('recibos_only_pending_filter')) {
  function recibos_only_pending_filter(array &$where): void {
    $where[] = "COALESCE(cb.cobrado_total, 0) < (COALESCE(it.total_sum, m.monto_total, 0) - 0.00001)";
  }
}

/* =========================================================
   LISTAR RECIBOS PENDIENTES (GET)
========================================================= */
if (!function_exists('recibos_listar')) {

if (!function_exists('recibos_productos_label')) {
  function recibos_productos_label(array $itemsDetalle): string
  {
    $cantidad = count($itemsDetalle);
    if ($cantidad <= 0) return 'SIN PRODUCTOS';
    if ($cantidad === 1) return '1 PRODUCTO';
    return $cantidad . ' PRODUCTOS';
  }
}

if (!function_exists('recibos_listar_items_detalle_por_movimientos')) {
  function recibos_listar_items_detalle_por_movimientos(PDO $pdo, array $idsMovimientos): array
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
        COALESCE(sp.nombre, sp_legacy.nombre, '') AS stock_producto_nombre,
        COALESCE(d.nombre, '') AS detalle_nombre,
        COALESCE(sp.nombre, sp_legacy.nombre, d.nombre, '') AS producto_nombre
      FROM movimientos_items mi
      LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
      LEFT JOIN stock_productos sp_legacy ON mi.id_stock_producto IS NULL AND sp_legacy.id_stock_producto = mi.id_detalle
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

  function recibos_listar(PDO $pdo): void
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

    recibos_base_filters($where, $params);

    if ($fechaDesde !== '' && is_valid_fecha($fechaDesde)) {
      $where[] = "m.fecha >= :fecha_desde";
      $params[':fecha_desde'] = $fechaDesde;
    }

    if ($fechaHasta !== '' && is_valid_fecha($fechaHasta)) {
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
        LEFT JOIN stock_productos spi_legacy
          ON fi.id_stock_producto IS NULL
         AND spi_legacy.id_stock_producto = fi.id_detalle

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
        UPPER(COALESCE(spi.nombre, spi_legacy.nombre, '')) LIKE UPPER(:q5) OR
        UPPER(COALESCE(mp.nombre,'')) LIKE UPPER(:q6) OR
        EXISTS (
          SELECT 1
          FROM movimientos_items miq
          LEFT JOIN stock_productos spq ON spq.id_stock_producto = miq.id_stock_producto
          LEFT JOIN stock_productos spq_legacy ON miq.id_stock_producto IS NULL AND spq_legacy.id_stock_producto = miq.id_detalle
          LEFT JOIN detalles dq ON dq.id_detalle = miq.id_detalle
          WHERE miq.id_movimiento = m.id_movimiento
            AND UPPER(COALESCE(spq.nombre, spq_legacy.nombre, dq.nombre, '')) LIKE UPPER(:q7)
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

    recibos_only_pending_filter($where);

    $whereSql = (!empty($where)) ? (" WHERE " . implode(" AND ", $where)) : "";

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

        fi.id_detalle AS item_id_detalle,
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

        COALESCE(spi.nombre, spi_legacy.nombre, '') AS detalle,
        COALESCE(mp.nombre,'') AS medio_pago_nombre,
        COALESCE(cb.cobrado_total, 0) AS cobrado_total,
        COALESCE(cb.ultimo_cobro, '') AS ultimo_cobro,
        COALESCE(cb.ultimo_id_comprobante, 0) AS id_comprobante,
        COALESCE(ca.archivo_url, '') AS comprobante_url,

        m.created_at
      $from
      $whereSql
      ORDER BY m.fecha DESC, m.id_movimiento DESC
      LIMIT :lim OFFSET :off
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) $stmt->bindValue($k, $v);
    $stmt->bindValue(':lim', (int)$limitPlus, PDO::PARAM_INT);
    $stmt->bindValue(':off', (int)$offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $hasMore = count($rows) > $limit;
    if ($hasMore) array_pop($rows);

    $nextOffset = $hasMore ? ($offset + $limit) : null;

    $totalCount = null;
    if ($offset === 0) {
      $sqlCount = "
        SELECT COUNT(DISTINCT m.id_movimiento) AS total
        $from
        $whereSql
      ";
      $stc = $pdo->prepare($sqlCount);
      foreach ($params as $k => $v) $stc->bindValue($k, $v);
      $stc->execute();
      $totalCount = (int)($stc->fetchColumn() ?: 0);
    }

    $idsMovimientos = array_values(array_unique(array_filter(array_map(static fn($r) => (int)($r['id_movimiento'] ?? 0), $rows))));
    $itemsPorMovimiento = recibos_listar_items_detalle_por_movimientos($pdo, $idsMovimientos);
    $mediosPorMovimiento = function_exists('mv_medios_pago_listar_detalle_por_movimientos')
      ? mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovimientos)
      : [];

    $data = [];
    foreach ($rows as $r) {
      $idDetalleFinal = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : null;

      $idStockProductoFinal = $r['item_id_stock_producto'] !== null
        ? (int)$r['item_id_stock_producto']
        : null;

      $tipoVentaTxt = trim((string)($r['tipo_venta'] ?? ''));
      $medioPagoTxt = trim((string)($r['medio_pago_nombre'] ?? ''));

      $montoFinal = recibos_round_money((float)($r['monto_total_final'] ?? 0));
      $cobrado = recibos_round_money((float)($r['cobrado_total'] ?? 0));
      $saldoPendiente = max(0.0, recibos_round_money($montoFinal - $cobrado));
      $estadoPago = recibos_estado_pago($montoFinal, $cobrado);
      $idMov = (int)$r['id_movimiento'];
      $itemsDetalle = $itemsPorMovimiento[$idMov] ?? [];
      $mediosDetalle = $mediosPorMovimiento[$idMov] ?? [];
      $detalleOriginal = implode(' | ', array_values(array_filter(array_map(
        static fn($it) => trim((string)($it['producto_nombre'] ?? $it['stock_producto_nombre'] ?? $it['detalle_nombre'] ?? '')),
        $itemsDetalle
      ))));

      $data[] = [
        'id_movimiento' => $idMov,
        'fecha' => (string)$r['fecha'],
        'id_tipo_operacion' => (int)$r['id_tipo_operacion'],
        'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
        'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],

        'id_stock_producto' => $idStockProductoFinal,
        'id_detalle_legacy' => $idDetalleFinal,
        'id_detalle' => $idStockProductoFinal !== null ? $idStockProductoFinal : $idDetalleFinal,

        'pago_tipo_venta' => $tipoVentaTxt,
        'medio_pago_nombre' => $medioPagoTxt,
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'monto_total' => $montoFinal,
        'cobrado_total' => $cobrado,
        'saldo_pendiente' => $saldoPendiente,
        'estado_pago' => $estadoPago,
        'ultimo_cobro' => (string)($r['ultimo_cobro'] ?? ''),
        'pagado' => $estadoPago === 'pagado',
        'id_comprobante' => (int)($r['id_comprobante'] ?? 0),
        'comprobante_url' => (string)($r['comprobante_url'] ?? ''),
        'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],
        'clasificacion' => (string)($r['clasificacion'] ?? ''),
        'tipo_venta' => $tipoVentaTxt,
        'cliente' => (string)($r['cliente'] ?? ''),
        'proveedor' => (string)($r['proveedor'] ?? ''),
        'detalle' => recibos_productos_label($itemsDetalle),
        'detalle_original' => $detalleOriginal,
        'cantidad_items' => count($itemsDetalle),
        'items_detalle' => $itemsDetalle,
        'medios_pago_detalle' => $mediosDetalle,
        'cantidad_medios_pago' => count($mediosDetalle),
        'created_at' => (string)($r['created_at'] ?? ''),
      ];
    }

    ok([
      'movimientos' => $data,
      'has_more' => $hasMore,
      'next_offset' => $nextOffset,
      'limit' => $limit,
      'offset' => $offset,
      'total_count' => $totalCount,
    ]);
  }
}

/* =========================================================
   LISTAR PENDIENTES POR CLIENTE (GET)
========================================================= */
if (!function_exists('recibos_cliente_listar')) {
  function recibos_cliente_listar(PDO $pdo): void
  {
    $id_cliente = isset($_GET['id_cliente']) ? (int)$_GET['id_cliente'] : 0;
    if ($id_cliente <= 0) fail('Falta id_cliente.');

    $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 500;
    if ($limit <= 0) $limit = 500;
    if ($limit > 2000) $limit = 2000;

    $whereExtra = '';
    $paramsExtra = [];

    if ($fechaDesde !== '' && is_valid_fecha($fechaDesde)) {
      $whereExtra .= " AND m.fecha >= :fecha_desde ";
      $paramsExtra[':fecha_desde'] = $fechaDesde;
    }

    if ($fechaHasta !== '' && is_valid_fecha($fechaHasta)) {
      $whereExtra .= " AND m.fecha <= :fecha_hasta ";
      $paramsExtra[':fecha_hasta'] = $fechaHasta;
    }

    $sql = "
      SELECT
        m.id_movimiento,
        m.fecha,
        m.id_tipo_operacion,
        m.id_tipo_venta,
        m.id_cliente,
        m.id_medio_pago,

        COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
        COALESCE(cl.nombre,'') AS cliente,
        COALESCE(spi.nombre, spi_legacy.nombre, '') AS detalle,
        COALESCE(cb.cobrado_total, 0) AS cobrado_total,
        COALESCE(mp.nombre,'') AS medio_pago_nombre,
        COALESCE(cb.ultimo_id_comprobante, 0) AS id_comprobante,
        COALESCE(ca.archivo_url, '') AS comprobante_url,

        fi.id_detalle AS item_id_detalle,
        fi.id_stock_producto AS item_id_stock_producto,
        fi.cantidad   AS item_cantidad,
        fi.precio     AS item_precio,
        fi.iva_pct    AS item_iva_pct,
        fi.subtotal   AS item_subtotal,
        fi.iva_monto  AS item_iva_monto,
        fi.total      AS item_total

      FROM movimientos m
        LEFT JOIN clientes cl ON cl.id_cliente = m.id_cliente
        
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
        LEFT JOIN stock_productos spi_legacy
          ON fi.id_stock_producto IS NULL
         AND spi_legacy.id_stock_producto = fi.id_detalle

        LEFT JOIN (
          SELECT id_movimiento, SUM(total) AS total_sum
          FROM movimientos_items
          GROUP BY id_movimiento
        ) it ON it.id_movimiento = m.id_movimiento

        LEFT JOIN (
          SELECT
            id_movimiento,
            SUM(monto) AS cobrado_total,
            MAX(id_comprobante) AS ultimo_id_comprobante
          FROM cobros
          GROUP BY id_movimiento
        ) cb ON cb.id_movimiento = m.id_movimiento

        LEFT JOIN comprobantes_archivos ca
          ON ca.id_comprobante = cb.ultimo_id_comprobante

        LEFT JOIN medios_pago mp ON mp.id_medio_pago = m.id_medio_pago

      WHERE m.id_tipo_operacion = :op_venta
        AND m.id_tipo_venta = :tv_ctacte
        AND m.id_cliente = :id_cliente
        $whereExtra
        AND COALESCE(cb.cobrado_total, 0) < (COALESCE(it.total_sum, m.monto_total, 0) - 0.00001)

      ORDER BY m.fecha DESC, m.id_movimiento DESC
      LIMIT :lim
    ";

    $st = $pdo->prepare($sql);
    $st->bindValue(':op_venta', 1, PDO::PARAM_INT);
    $st->bindValue(':tv_ctacte', 2, PDO::PARAM_INT);
    $st->bindValue(':id_cliente', $id_cliente, PDO::PARAM_INT);

    foreach ($paramsExtra as $k => $v) {
      $st->bindValue($k, $v, PDO::PARAM_STR);
    }

    $st->bindValue(':lim', (int)$limit, PDO::PARAM_INT);
    $st->execute();

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $out = [];

    foreach ($rows as $r) {
      $idDetalleFinal = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : null;

      $idStockProductoFinal = $r['item_id_stock_producto'] !== null
        ? (int)$r['item_id_stock_producto']
        : null;

      $montoFinal = recibos_round_money((float)($r['monto_total_final'] ?? 0));
      $cobradoTotal = recibos_round_money((float)($r['cobrado_total'] ?? 0));
      $saldoPendiente = max(0.0, recibos_round_money($montoFinal - $cobradoTotal));
      $estadoPago = recibos_estado_pago($montoFinal, $cobradoTotal);

      $out[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)$r['fecha'],
        'id_tipo_operacion' => (int)$r['id_tipo_operacion'],
        'id_tipo_venta' => (int)$r['id_tipo_venta'],
        'id_cliente' => (int)$r['id_cliente'],
        'cliente' => (string)($r['cliente'] ?? ''),
        'detalle' => (string)($r['detalle'] ?? ''),
        'monto_total' => $montoFinal,
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'medio_pago_nombre' => (string)($r['medio_pago_nombre'] ?? ''),
        'cobrado_total' => $cobradoTotal,
        'saldo_pendiente' => $saldoPendiente,
        'estado_pago' => $estadoPago,
        'pagado' => $estadoPago === 'pagado',
        'id_comprobante' => (int)($r['id_comprobante'] ?? 0),
        'comprobante_url' => (string)($r['comprobante_url'] ?? ''),
        'id_stock_producto' => $idStockProductoFinal,
        'id_detalle_legacy' => $idDetalleFinal,
        'id_detalle' => $idStockProductoFinal !== null ? $idStockProductoFinal : $idDetalleFinal,
        'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],
      ];
    }

    ok([
      'movimientos' => $out,
      'count' => count($out),
    ]);
  }
}

/* =========================================================
   ACTUALIZAR RECIBO (POST)
========================================================= */
if (!function_exists('recibos_actualizar')) {
  function recibos_actualizar(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);

    $idUsuario = resolver_usuario_auditoria($pdo, $src);

    $id_movimiento = n_int($src['id_movimiento'] ?? null);
    if (!$id_movimiento) fail('Falta id_movimiento.');

    $beforeSt = $pdo->prepare("
      SELECT *
      FROM movimientos
      WHERE id_movimiento = :id
      LIMIT 1
    ");
    $beforeSt->execute([':id' => $id_movimiento]);
    $before = $beforeSt->fetch(PDO::FETCH_ASSOC);

    if (!$before) fail('El movimiento no existe: ' . $id_movimiento);

    $beforeItem = recibo_obtener_primer_item_movimiento($pdo, $id_movimiento);

    if ((int)($before['id_tipo_operacion'] ?? 0) !== 1 || (int)($before['id_tipo_venta'] ?? 0) !== 2) {
      fail('Este movimiento no es un recibo (VENTA + CUENTA CORRIENTE).');
    }

    $fecha = normalizar_fecha_movimiento($src['fecha'] ?? null);
    if ($fecha === null) {
      fail('La fecha del recibo es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.');
    }

    $id_clasificacion = array_key_exists('id_clasificacion', $src)
      ? n_int($src['id_clasificacion'])
      : n_int($before['id_clasificacion'] ?? null);

    $id_tipo_venta = array_key_exists('id_tipo_venta', $src)
      ? n_int($src['id_tipo_venta'])
      : n_int($before['id_tipo_venta'] ?? null);

    $id_medio_pago = n_int($before['id_medio_pago'] ?? null);

    $id_cliente = array_key_exists('id_cliente', $src)
      ? n_int($src['id_cliente'])
      : n_int($before['id_cliente'] ?? null);

    $id_proveedor = array_key_exists('id_proveedor', $src)
      ? n_int($src['id_proveedor'])
      : n_int($before['id_proveedor'] ?? null);

    $id_stock_producto = array_key_exists('id_stock_producto', $src)
      ? n_int($src['id_stock_producto'])
      : (
          array_key_exists('id_detalle', $src)
            ? n_int($src['id_detalle'])
            : (
                ($beforeItem && array_key_exists('id_stock_producto', $beforeItem))
                  ? n_int($beforeItem['id_stock_producto'])
                  : (
                      ($beforeItem && array_key_exists('id_detalle', $beforeItem))
                        ? n_int($beforeItem['id_detalle'])
                        : null
                    )
              )
        );

    $monto_total_in = array_key_exists('monto_total', $src)
      ? n_float($src['monto_total'])
      : null;

    $hasDetalleValido = ($id_stock_producto !== null && $id_stock_producto > 0);

    $item = null;
    if ($hasDetalleValido) {
      $baseMonto = ($monto_total_in !== null)
        ? (float)$monto_total_in
        : (float)($before['monto_total'] ?? 0);

      $item = item_payload_from_src($src, $baseMonto, (int)$id_stock_producto);
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

      $lock = $pdo->prepare("
        SELECT id_movimiento
        FROM movimientos
        WHERE id_movimiento = :id
        LIMIT 1
        FOR UPDATE
      ");
      $lock->execute([':id' => $id_movimiento]);
      if (!$lock->fetch(PDO::FETCH_ASSOC)) {
        fail('El movimiento ya no existe: ' . $id_movimiento);
      }

      $sql = "
        UPDATE movimientos SET
          fecha = :fecha,
          id_clasificacion = :id_clasificacion,
          id_tipo_venta = :id_tipo_venta,
          id_cliente = :id_cliente,
          id_proveedor = :id_proveedor,
          monto_total = :monto_total,
          id_medio_pago = :id_medio_pago
        WHERE id_movimiento = :id_movimiento
        LIMIT 1
      ";

      $stmt = $pdo->prepare($sql);
      $stmt->execute([
        ':fecha' => $fecha,
        ':id_clasificacion' => $id_clasificacion,
        ':id_tipo_venta' => $id_tipo_venta,
        ':id_cliente' => $id_cliente,
        ':id_proveedor' => $id_proveedor,
        ':monto_total' => $totalCabecera,
        ':id_medio_pago' => $id_medio_pago,
        ':id_movimiento' => $id_movimiento,
      ]);

      if ($item !== null) {
        if ($beforeItem && !empty($beforeItem['id_item'])) {
          $id_item = (int)$beforeItem['id_item'];

          $upd = $pdo->prepare("
            UPDATE movimientos_items SET
              id_detalle = :id_detalle,
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
            ':id_detalle' => $item['id_detalle'],
            ':id_stock_producto' => $item['id_stock_producto'],
            ':cantidad' => $item['cantidad'],
            ':precio' => $item['precio'],
            ':iva_pct' => $item['iva_pct'],
            ':subtotal' => $item['subtotal'],
            ':iva_monto' => $item['iva_monto'],
            ':total' => $item['total'],
            ':id_item' => $id_item,
          ]);
        } else {
          $ins = $pdo->prepare("
            INSERT INTO movimientos_items
              (id_movimiento, id_detalle, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
            VALUES
              (:id_movimiento, :id_detalle, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
          ");
          $ins->execute([
            ':id_movimiento' => $id_movimiento,
            ':id_detalle' => $item['id_detalle'],
            ':id_stock_producto' => $item['id_stock_producto'],
            ':cantidad' => $item['cantidad'],
            ':precio' => $item['precio'],
            ':iva_pct' => $item['iva_pct'],
            ':subtotal' => $item['subtotal'],
            ':iva_monto' => $item['iva_monto'],
            ':total' => $item['total'],
          ]);
        }
      }

      $pdo->commit();

      $afterSt = $pdo->prepare("
        SELECT *
        FROM movimientos
        WHERE id_movimiento = :id
        LIMIT 1
      ");
      $afterSt->execute([':id' => $id_movimiento]);
      $after = $afterSt->fetch(PDO::FETCH_ASSOC);

      $afterItem = recibo_obtener_primer_item_movimiento($pdo, $id_movimiento);

      $idUsuarioAudit = resolver_usuario_auditoria($pdo, $src);

      audit_safe($pdo, $idUsuarioAudit, 'actualizar', 'recibos', $id_movimiento, [
        'antes' => $before ?: null,
        'antes_item' => $beforeItem ?: null,
        'despues' => $after ?: null,
        'despues_item' => $afterItem ?: null,
        'item_payload' => $item,
      ]);

      ok([
        'actualizado' => true,
        'id_movimiento' => $id_movimiento,
        'audit_debug' => [
          'idUsuario_inicial' => $idUsuario,
          'idUsuario_auditoria' => $idUsuarioAudit,
          'audit_intentado' => $idUsuarioAudit > 0,
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo actualizar el recibo. ' . $e->getMessage());
    }
  }
}

/* =========================================================
   CONFIRMAR PAGO (POST)
========================================================= */
if (!function_exists('recibos_confirmar_pago')) {
  function recibos_confirmar_pago(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = resolver_usuario_auditoria($pdo, $src);

    $ids = $src['ids_movimiento'] ?? $src['ids_movimientos'] ?? [];
    if (!is_array($ids)) $ids = [];

    $idsOk = [];
    foreach ($ids as $x) {
      $n = n_int($x);
      if ($n !== null && $n > 0) $idsOk[] = $n;
    }
    $idsOk = array_values(array_unique($idsOk));
    if (!$idsOk) fail('Faltan ids_movimiento para confirmar.');

    /*
     * Compatibilidad:
     * - flujo viejo: id_medio_pago único
     * - flujo nuevo: medios_pago[] con montos para pago parcial/múltiple medio
     */
    $mediosRaw = [];
    if (!empty($src['medios_pago']) && is_array($src['medios_pago'])) {
      $mediosRaw = $src['medios_pago'];
    } elseif (!empty($src['id_medio_pago'])) {
      $mediosRaw = [[
        'id_medio_pago' => $src['id_medio_pago'],
        'monto'         => 0,
        'id_cheque'     => $src['id_cheque'] ?? null,
        'cheque_tipo'   => $src['cheque_tipo'] ?? $src['tipo_cheque'] ?? null,
      ]];
    } else {
      fail('Falta medios_pago o id_medio_pago.');
    }

    $montoPagoSolicitado = recibos_monto_pago_from_request($src);

    try {
      $pdo->beginTransaction();

      [$inMov, $paramsMov] = build_in_params($idsOk, ':mov');
      [$inCob, $paramsCob] = build_in_params($idsOk, ':cob');

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

      $rows = $stMovs->fetchAll(PDO::FETCH_ASSOC) ?: [];
      if (!$rows) {
        $pdo->rollBack();
        fail('No se encontraron movimientos para cobrar.');
      }

      $validos = [];
      $pendientes = [];
      $yaPagados = [];
      $saldoTotal = 0.0;

      foreach ($rows as $r) {
        $idMov = (int)($r['id_movimiento'] ?? 0);
        $tipoOp = (int)($r['id_tipo_operacion'] ?? 0);
        $tipoVenta = (int)($r['id_tipo_venta'] ?? 0);
        $montoTotal = recibos_round_money((float)($r['monto_total_final'] ?? 0));
        $cobrado = recibos_round_money((float)($r['cobrado_total'] ?? 0));
        $saldo = max(0.0, recibos_round_money($montoTotal - $cobrado));

        if ($idMov <= 0) continue;
        if ($tipoOp !== 1 || $tipoVenta !== 2) continue;

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
          $saldoTotal = recibos_round_money($saldoTotal + $saldo);
        }
      }

      if (!$validos) {
        $pdo->rollBack();
        fail('No hay movimientos válidos para cobrar (deben ser VENTA + CUENTA CORRIENTE).');
      }

      if (empty($pendientes)) {
        $pdo->rollBack();
        ok([
          'mensaje' => 'Los movimientos seleccionados ya estaban pagados.',
          'cobros_insertados' => 0,
          'movimientos_actualizados' => 0,
          'ids_movimiento' => $validos,
          'ids_movimiento_ya_pagados' => $yaPagados,
          'id_medio_pago' => null,
          'medios_pago' => [],
          'tabla_medios_pago_usada' => null,
          'ids_cobro' => [],
          'id_cobro' => null,
          'monto_pagado' => 0,
          'saldo_total_previo' => 0,
          'saldo_total_restante' => 0,
          'tipo_pago' => 'sin_saldo',
          'cheques_creados' => [],
        ]);
      }

      $montoPago = $montoPagoSolicitado === null
        ? $saldoTotal
        : recibos_round_money((float)$montoPagoSolicitado);

      if ($montoPago <= 0.00001) {
        $pdo->rollBack();
        fail('El monto a pagar debe ser mayor a cero.');
      }

      if ($montoPago > ($saldoTotal + 0.00001)) {
        $pdo->rollBack();
        fail('El monto a pagar no puede superar el saldo pendiente.', 200, [
          'saldo_pendiente' => $saldoTotal,
          'monto_solicitado' => $montoPago,
        ]);
      }

      $mediosValidados = recibos_validar_medios_pago_multi($pdo, $mediosRaw, $montoPago);
      $legacyId = n_int($src['id_medio_pago'] ?? null);
      $planPago = recibos_payment_storage_plan($mediosValidados, $legacyId);

      $idMedioPagoPrincipal = $planPago['id_medio_pago'] !== null
        ? (int)$planPago['id_medio_pago']
        : null;

      $distribucion = recibos_distribuir_pago_equitativo($pendientes, $montoPago);
      if (empty($distribucion)) {
        $pdo->rollBack();
        fail('No se pudo distribuir el pago entre los movimientos seleccionados.');
      }

      $mediosPorMovimiento = [];
      $chequesCreados = [];
      if (!empty($planPago['rows'])) {
        $mediosPorMovimiento = recibos_distribuir_medios_pago_por_movimiento($distribucion, $planPago['rows']);
        $mediosPorMovimiento = recibos_preparar_cheques_compartidos_lote($pdo, $mediosPorMovimiento, $chequesCreados);
      }

      $idsCobro = [];
      $insertados = 0;
      $montoInsertado = 0.0;
      $idsInsertadosMov = [];

      $sqlIns = "
        INSERT INTO cobros (id_movimiento, fecha_cobro, monto, id_medio_pago)
        VALUES (:id_movimiento, :fecha_cobro, :monto, :id_medio_pago)
      ";
      $stIns = $pdo->prepare($sqlIns);

      $fechaCobro = normalizar_fecha_movimiento($src['fecha_cobro'] ?? $src['fecha_pago'] ?? $src['fecha'] ?? null);
      if ($fechaCobro === null) {
        $fechaCobro = today_iso();
      }

      foreach ($distribucion as $p) {
        $idMovimiento = (int)$p['id_movimiento'];
        $montoCobro = recibos_round_money((float)$p['monto']);
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

        if (!empty($planPago['rows'])) {
          $rowsMediosMovimiento = $mediosPorMovimiento[$idMovimiento] ?? [];
          recibos_insertar_medios_pago_multi($pdo, $idMovimiento, $rowsMediosMovimiento);
        } else {
          recibos_eliminar_medios_pago_movimiento($pdo, $idMovimiento);
        }

        $idsInsertadosMov[] = $idMovimiento;
        $insertados++;
        $montoInsertado = recibos_round_money($montoInsertado + $montoCobro);
      }

      if (!empty($idsInsertadosMov)) {
        $idsInsertadosMov = array_values(array_unique($idsInsertadosMov));
        [$inUpd, $paramsUpd] = build_in_params($idsInsertadosMov, ':u');
        $inSqlUpd = implode(',', $inUpd);

        $sqlUpdMov = "
          UPDATE movimientos
          SET id_medio_pago = :id_medio_pago_upd
          WHERE id_movimiento IN ($inSqlUpd)
            AND id_tipo_operacion = 1
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

      $saldoRestante = max(0.0, recibos_round_money($saldoTotal - $montoInsertado));
      $tipoPago = $saldoRestante <= 0.00001 ? 'pago_total' : 'pago_parcial';

      $pdo->commit();

      audit_safe($pdo, $idUsuario, 'confirmar_pago', 'recibos', null, [
        'ids_movimiento_solicitados' => $idsOk,
        'ids_movimiento_validos' => $validos,
        'ids_movimiento_ya_pagados' => $yaPagados,
        'ids_cobro' => $idsCobro,
        'id_medio_pago' => $idMedioPagoPrincipal,
        'medios_pago' => $mediosValidados,
        'tabla_medios_pago_usada' => !empty($planPago['rows']) ? 'movimientos_medios_pago' : null,
        'cobros_insertados' => $insertados,
        'monto_solicitado' => $montoPagoSolicitado,
        'monto_pagado' => $montoInsertado,
        'saldo_total_previo' => $saldoTotal,
        'saldo_total_restante' => $saldoRestante,
        'tipo_pago' => $tipoPago,
        'distribucion' => $distribucion,
      ]);

      ok([
        'mensaje' => $tipoPago === 'pago_parcial'
          ? 'Pago parcial registrado correctamente.'
          : 'Pago registrado correctamente.',
        'tipo_pago' => $tipoPago,
        'cobros_insertados' => $insertados,
        'movimientos_actualizados' => $insertados,
        'ids_movimiento' => $validos,
        'ids_movimiento_ya_pagados' => $yaPagados,
        'id_medio_pago' => $idMedioPagoPrincipal,
        'medios_pago' => $mediosValidados,
        'tabla_medios_pago_usada' => !empty($planPago['rows']) ? 'movimientos_medios_pago' : null,
        'ids_cobro' => $idsCobro,
        'id_cobro' => $idsCobro[0] ?? null,
        'monto_pagado' => $montoInsertado,
        'saldo_total_previo' => $saldoTotal,
        'saldo_total_restante' => $saldoRestante,
        'distribucion' => $distribucion,
        'cheques_creados' => $chequesCreados,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo confirmar el pago. ' . $e->getMessage());
    }
  }
}

/* =========================================================
   ROUTE RECIBOS
========================================================= */
if (!function_exists('route_recibos_action')) {
  function route_recibos_action(PDO $pdo, string $action): bool
  {
    $action = strtolower(trim((string)$action));

    switch ($action) {
      case 'recibos_listar':
        recibos_listar($pdo);
        return true;

      case 'recibos_cliente_listar':
        recibos_cliente_listar($pdo);
        return true;

      case 'recibos_actualizar':
        recibos_actualizar($pdo);
        return true;

      case 'recibos_eliminar':
        if (function_exists('recibos_eliminar')) {
          recibos_eliminar($pdo);
          return true;
        }
        return false;

      case 'recibos_confirmar_pago':
        recibos_confirmar_pago($pdo);
        return true;

      default:
        return false;
    }
  }
}

if (!defined('MOVIMIENTOS_RECIBOS_ROUTE_BOOTSTRAP')) {
  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  $action = strtolower(trim((string)$action));

  if ($action === '') fail('Falta parámetro action.');

  try {
    if (!route_recibos_action($pdo, $action)) {
      fail('Acción no válida en recibos: ' . $action);
    }
  } catch (Throwable $e) {
    fail('Error en recibos: ' . $e->getMessage());
  }
}