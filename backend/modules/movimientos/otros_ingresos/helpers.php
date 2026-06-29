<?php
declare(strict_types=1);

require_once __DIR__ . '/../global/medios_pago.php';
require_once __DIR__ . '/../../utils/auditoria.php';

/**
 * OTROS INGRESOS
 * - movimientos.id_tipo_operacion = 3
 * - cabecera en movimientos
 * - detalle(s) en movimientos_items
 * - comprobante en comprobantes_archivos.id_movimiento = movimientos.id_movimiento
 *
 * IMPORTANTE:
 * - Para OTROS INGRESOS la UI trabaja con la tabla `detalles`
 * - El id_detalle se persiste en movimientos_items.id_detalle
 * - NO se guarda id_stock_producto en movimientos salvo que el esquema viejo aún tenga esa columna.
 */

if (!function_exists('oi_json_response')) {
  function oi_json_response(array $data, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('oi_read_json_input')) {
  function oi_read_json_input(): array
  {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('oi_read_request_data')) {
  function oi_read_request_data(): array
  {
    $json = oi_read_json_input();
    if (!empty($json)) return $json;
    return is_array($_POST ?? []) ? $_POST : [];
  }
}

if (!function_exists('oi_table_exists')) {
  function oi_table_exists(PDO $pdo, string $table): bool
  {
    static $cache = [];

    if (isset($cache[$table])) {
      return $cache[$table];
    }

    $st = $pdo->prepare("
      SELECT COUNT(*)
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
    ");
    $st->execute([':table' => $table]);

    return $cache[$table] = ((int)$st->fetchColumn() > 0);
  }
}

if (!function_exists('oi_table_columns')) {
  function oi_table_columns(PDO $pdo, string $table): array
  {
    static $cache = [];

    if (isset($cache[$table])) {
      return $cache[$table];
    }

    $st = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $cols = [];
    foreach ($rows as $r) {
      $field = (string)($r['Field'] ?? '');
      if ($field !== '') {
        $cols[$field] = true;
      }
    }

    $cache[$table] = $cols;
    return $cols;
  }
}

if (!function_exists('oi_has_col')) {
  function oi_has_col(PDO $pdo, string $table, string $col): bool
  {
    if (!oi_table_exists($pdo, $table)) return false;
    $cols = oi_table_columns($pdo, $table);
    return isset($cols[$col]);
  }
}

if (!function_exists('oi_pick_first_existing_col')) {
  function oi_pick_first_existing_col(PDO $pdo, string $table, array $candidates): ?string
  {
    foreach ($candidates as $c) {
      if (oi_has_col($pdo, $table, $c)) return $c;
    }
    return null;
  }
}

if (!function_exists('oi_num')) {
  function oi_num($v, float $default = 0): float
  {
    if ($v === null || $v === '') return $default;

    if (is_string($v)) {
      $v = trim($v);
      $v = str_replace(['$', ' '], '', $v);

      if (strpos($v, ',') !== false && strpos($v, '.') !== false) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
      } elseif (strpos($v, ',') !== false) {
        $v = str_replace(',', '.', $v);
      }
    }

    $n = (float)$v;
    return is_finite($n) ? $n : $default;
  }
}

if (!function_exists('oi_int')) {
  function oi_int($v, int $default = 0): int
  {
    return (int)round(oi_num($v, $default));
  }
}

if (!function_exists('oi_str')) {
  function oi_str($v, string $default = ''): string
  {
    $s = trim((string)($v ?? ''));
    return $s !== '' ? $s : $default;
  }
}

if (!function_exists('oi_fecha_valida')) {
  function oi_fecha_valida(string $f): bool
  {
    if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
  }
}

if (!function_exists('oi_date_ymd')) {
  function oi_date_ymd($value, string $default = ''): string
  {
    $s = trim((string)($value ?? ''));
    if ($s === '') return $default;
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
      return oi_fecha_valida($out) ? $out : $default;
    }
    if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
      return oi_fecha_valida($out) ? $out : $default;
    }
    return $default;
  }
}

if (!function_exists('oi_norm_text')) {
  function oi_norm_text($v): string
  {
    $s = preg_replace('/\s+/u', ' ', trim((string)($v ?? '')));
    if ($s === null) $s = trim((string)($v ?? ''));

    if (function_exists('mb_strtolower')) {
      return mb_strtolower($s, 'UTF-8');
    }

    return strtolower($s);
  }
}

/* =========================================================
   AUDITORÍA
========================================================= */

if (!function_exists('oi_get_header_value')) {
  function oi_get_header_value(string $key): string
  {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
    $v = $_SERVER[$serverKey] ?? '';
    if (!is_string($v)) $v = '';
    return trim($v);
  }
}

if (!function_exists('oi_get_bearer_token')) {
  function oi_get_bearer_token(): string
  {
    $h = oi_get_header_value('Authorization');
    if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($h === '') return '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return '';
  }
}

if (!function_exists('oi_base64url_decode')) {
  function oi_base64url_decode(string $s): string
  {
    $s = str_replace(['-', '_'], ['+', '/'], $s);
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
  }
}

if (!function_exists('oi_extract_positive_int_from_candidates')) {
  function oi_extract_positive_int_from_candidates(array $candidates): int
  {
    foreach ($candidates as $c) {
      if (is_numeric($c)) {
        $id = (int)$c;
        if ($id > 0) return $id;
      }
    }
    return 0;
  }
}

if (!function_exists('oi_get_id_usuario_from_token')) {
  function oi_get_id_usuario_from_token(): int
  {
    $token = oi_get_bearer_token();
    if ($token === '' || substr_count($token, '.') !== 2) {
      return 0;
    }

    $parts = explode('.', $token);
    $payloadJson = oi_base64url_decode($parts[1] ?? '');
    if ($payloadJson === '') {
      return 0;
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload)) {
      return 0;
    }

    return oi_extract_positive_int_from_candidates([
      $payload['idUsuarioMaster'] ?? null,
      $payload['id_usuario_master'] ?? null,
      $payload['idUsuario'] ?? null,
      $payload['id_usuario'] ?? null,
      $payload['uid'] ?? null,
      $payload['sub'] ?? null,
    ]);
  }
}

if (!function_exists('oi_get_id_usuario_from_body_or_request')) {
  function oi_get_id_usuario_from_body_or_request(array $body = []): int
  {
    return oi_extract_positive_int_from_candidates([
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

if (!function_exists('oi_get_id_usuario_from_x_session')) {
  function oi_get_id_usuario_from_x_session(PDO $pdo): int
  {
    $sessionKey = oi_get_header_value('X-Session');
    if ($sessionKey === '') return 0;

    try {
      if (!oi_table_exists($pdo, 'sesiones')) return 0;

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

      return oi_extract_positive_int_from_candidates([
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

if (!function_exists('oi_get_id_usuario_from_request')) {
  function oi_get_id_usuario_from_request(PDO $pdo, array $body = []): int
  {

    if (function_exists('mv_secure_auth_user_id')) {
      $id = mv_secure_auth_user_id();
      if ($id > 0) return $id;
    }

    $id = (int)($GLOBALS['AUTH_USER_MASTER_ID'] ?? 0);
    if ($id > 0) return $id;

    $id = oi_get_id_usuario_from_token();
    if ($id > 0) return $id;

    $id = oi_get_id_usuario_from_body_or_request($body);
    if ($id > 0) return $id;

    $id = oi_get_id_usuario_from_x_session($pdo);
    if ($id > 0) return $id;

    return 0;
  }
}

if (!function_exists('oi_resolver_usuario_auditoria')) {
  function oi_resolver_usuario_auditoria(PDO $pdo, array $src = []): int
  {
    $id = oi_get_id_usuario_from_request($pdo, $src);
    if ($id > 0) return $id;

    if (!empty($_POST) && is_array($_POST)) {
      $id = oi_get_id_usuario_from_request($pdo, $_POST);
      if ($id > 0) return $id;
    }

    $id = oi_get_id_usuario_from_request($pdo, $_GET ?? []);
    if ($id > 0) return $id;

    return 0;
  }
}

if (!function_exists('oi_audit_safe')) {
  function oi_audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void
  {
    try {
      if ($idUsuario <= 0) {
        $idUsuario = oi_get_id_usuario_from_request($pdo, []);
      }

      if ($idUsuario <= 0) {
        return;
      }

      auditar($pdo, $idUsuario, 'otros_ingresos', $accion, $entidad, $idEntidad, $detalle);
    } catch (Throwable $e) {
      // nunca romper por auditoría
    }
  }
}

/* =========================================================
   HELPERS DETALLES / ITEMS / MOVIMIENTO
========================================================= */

if (!function_exists('oi_guess_detalles_pk')) {
  function oi_guess_detalles_pk(PDO $pdo): ?string
  {
    return oi_pick_first_existing_col($pdo, 'detalles', ['id_detalle', 'id']);
  }
}

if (!function_exists('oi_guess_detalles_nombre_col')) {
  function oi_guess_detalles_nombre_col(PDO $pdo): ?string
  {
    return oi_pick_first_existing_col($pdo, 'detalles', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('oi_detalle_to_front')) {
  function oi_detalle_to_front(array $row, ?string $pkCol, ?string $nombreCol): array
  {
    $id = $pkCol ? (int)($row[$pkCol] ?? 0) : (int)($row['id_detalle'] ?? $row['id'] ?? 0);
    $nombre = $nombreCol ? (string)($row[$nombreCol] ?? '') : (string)($row['nombre'] ?? '');

    return [
      'id_detalle' => $id > 0 ? $id : null,
      'id'         => $id > 0 ? $id : null,
      'nombre'     => trim($nombre),
      'activo'     => isset($row['activo']) ? (int)$row['activo'] : 1,
    ];
  }
}

if (!function_exists('oi_fetch_detalle_by_id')) {
  function oi_fetch_detalle_by_id(PDO $pdo, int $idDetalle): ?array
  {
    if ($idDetalle <= 0) return null;

    $pkCol     = oi_guess_detalles_pk($pdo);
    $nombreCol = oi_guess_detalles_nombre_col($pdo);

    if (!$pkCol || !$nombreCol) {
      throw new RuntimeException('La tabla detalles no tiene la estructura esperada.');
    }

    $sql = "SELECT * FROM detalles WHERE `{$pkCol}` = :id LIMIT 1";
    $st  = $pdo->prepare($sql);
    $st->bindValue(':id', $idDetalle, PDO::PARAM_INT);
    $st->execute();

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? oi_detalle_to_front($row, $pkCol, $nombreCol) : null;
  }
}

if (!function_exists('oi_find_existing_detalle_by_nombre')) {
  function oi_find_existing_detalle_by_nombre(PDO $pdo, string $nombre): ?array
  {
    $nombre = oi_str($nombre);
    if ($nombre === '') return null;

    $pkCol     = oi_guess_detalles_pk($pdo);
    $nombreCol = oi_guess_detalles_nombre_col($pdo);

    if (!$pkCol || !$nombreCol) {
      throw new RuntimeException('La tabla detalles no tiene la estructura esperada.');
    }

    $sql = "SELECT * FROM detalles WHERE LOWER(TRIM(`{$nombreCol}`)) = :nombre_norm LIMIT 1";
    $st  = $pdo->prepare($sql);
    $st->bindValue(':nombre_norm', oi_norm_text($nombre));
    $st->execute();

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? $row : null;
  }
}

if (!function_exists('oi_normalize_items')) {
  function oi_normalize_items(array $payload): array
  {
    $items = [];

    if (isset($payload['items']) && is_array($payload['items'])) {
      foreach ($payload['items'] as $it) {
        if (!is_array($it)) continue;

        $idDetalle = oi_int(
          $it['id_detalle'] ?? $it['idDetalle'] ?? $it['id_stock_producto'] ?? 0,
          0
        );
        $cantidad = oi_num($it['cantidad'] ?? 0, 0);
        $precio   = oi_num($it['precio'] ?? 0, 0);
        $ivaPct   = oi_num($it['iva_pct'] ?? $it['ivaPct'] ?? 0, 0);

        if ($cantidad <= 0 || $precio <= 0) {
          continue;
        }

        $subtotal = oi_num($it['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto = oi_num(
          $it['iva_monto'] ?? ($subtotal * ($ivaPct / 100)),
          $subtotal * ($ivaPct / 100)
        );
        $total = oi_num($it['total'] ?? ($subtotal + $ivaMonto), $subtotal + $ivaMonto);

        if ($subtotal <= 0 || $total <= 0) {
          continue;
        }

        $items[] = [
          'id_detalle'        => $idDetalle > 0 ? $idDetalle : null,
          'id_stock_producto' => $idDetalle > 0 ? $idDetalle : null,
          'cantidad'          => $cantidad,
          'precio'            => $precio,
          'iva_pct'           => $ivaPct,
          'subtotal'          => $subtotal,
          'iva_monto'         => $ivaMonto,
          'total'             => $total,
        ];
      }
    }

    if (!$items) {
      $cantidad  = max(1, oi_num($payload['cantidad'] ?? 1, 1));
      $precio    = oi_num($payload['precio'] ?? 0, 0);
      $ivaPct    = oi_num($payload['iva_pct'] ?? $payload['ivaPct'] ?? 0, 0);

      if ($precio > 0) {
        $subtotal  = oi_num($payload['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto  = oi_num(
          $payload['iva_monto'] ?? ($subtotal * ($ivaPct / 100)),
          $subtotal * ($ivaPct / 100)
        );
        $total = oi_num(
          $payload['monto_total'] ?? $payload['total'] ?? ($subtotal + $ivaMonto),
          $subtotal + $ivaMonto
        );
        $idDetalle = oi_int(
          $payload['id_detalle'] ?? $payload['idDetalle'] ?? $payload['id_stock_producto'] ?? 0,
          0
        );

        if ($subtotal > 0 && $total > 0) {
          $items[] = [
            'id_detalle'        => $idDetalle > 0 ? $idDetalle : null,
            'id_stock_producto' => $idDetalle > 0 ? $idDetalle : null,
            'cantidad'          => $cantidad,
            'precio'            => $precio,
            'iva_pct'           => $ivaPct,
            'subtotal'          => $subtotal,
            'iva_monto'         => $ivaMonto,
            'total'             => $total,
          ];
        }
      }
    }

    return $items;
  }
}

if (!function_exists('oi_first_item_detalle_id')) {
  function oi_first_item_detalle_id(array $items): ?int
  {
    foreach ($items as $it) {
      $id = (int)($it['id_detalle'] ?? $it['id_stock_producto'] ?? 0);
      if ($id > 0) return $id;
    }
    return null;
  }
}

if (!function_exists('oi_sum_items_total')) {
  function oi_sum_items_total(array $items): float
  {
    $total = 0.0;
    foreach ($items as $it) {
      $total += oi_num($it['total'] ?? 0, 0);
    }
    return $total;
  }
}


if (!function_exists('oi_round_money')) {
  function oi_round_money(float $n): float
  {
    return round($n, 2);
  }
}

if (!function_exists('oi_estado_pago')) {
  function oi_estado_pago(float $total, float $cobrado): string
  {
    $total = oi_round_money(max(0.0, $total));
    $cobrado = oi_round_money(max(0.0, $cobrado));
    $saldo = oi_round_money(max(0.0, $total - $cobrado));

    if ($saldo <= 0.00001) return 'pagado';
    if ($cobrado > 0.00001) return 'parcialmente_pagado';
    return 'pendiente';
  }
}

if (!function_exists('oi_suma_medios_validados')) {
  function oi_suma_medios_validados(array $medios): float
  {
    $total = 0.0;
    foreach ($medios as $mp) {
      if (!is_array($mp)) continue;
      $total += oi_num($mp['monto'] ?? 0, 0);
    }
    return oi_round_money($total);
  }
}

if (!function_exists('oi_validar_medios_pago_parcial')) {
  function oi_validar_medios_pago_parcial(PDO $pdo, array $mediosPagoRaw, float $saldoMaximo, array $options = []): array
  {
    $permitirVacio = (bool)($options['permitir_vacio'] ?? false);
    $emptyMessage = (string)($options['empty_message'] ?? 'Debés indicar al menos un medio de pago.');
    $totalLabel = (string)($options['total_label'] ?? 'ingreso');

    if (empty($mediosPagoRaw)) {
      if ($permitirVacio) return [];
      throw new RuntimeException($emptyMessage);
    }

    // Validamos formato/medios/cheques, pero NO exigimos cubrir el total.
    $mediosValidados = mv_medios_pago_validar_multi($pdo, $mediosPagoRaw, 0.0, [
      'modo' => 'flexible',
      'permitir_pago_parcial' => true,
      'allow_partial' => true,
      'permitir_crear_cheque' => false,
      'permitir_cheque_sin_detalle' => true,
      'include_original_index' => true,
      'empty_message' => $emptyMessage,
      'total_label' => $totalLabel,
    ]);

    $suma = oi_suma_medios_validados($mediosValidados);
    $saldoMaximo = oi_round_money(max(0.0, $saldoMaximo));

    if (!$permitirVacio && $suma <= 0.00001) {
      throw new RuntimeException('El importe cobrado debe ser mayor a 0.');
    }

    if ($saldoMaximo > 0.00001 && $suma > ($saldoMaximo + 0.05)) {
      throw new RuntimeException(sprintf(
        'La suma de los medios de pago ($%.2f) no puede superar el saldo pendiente del %s ($%.2f).',
        $suma,
        $totalLabel,
        $saldoMaximo
      ));
    }

    return $mediosValidados;
  }
}

if (!function_exists('oi_distribuir_pago_equitativo')) {
  function oi_distribuir_pago_equitativo(array $pendientes, float $montoPago): array
  {
    $restante = oi_round_money($montoPago);
    $activos = [];

    foreach ($pendientes as $p) {
      $id = (int)($p['id_movimiento'] ?? 0);
      $saldo = oi_round_money((float)($p['saldo'] ?? $p['monto'] ?? 0));
      if ($id > 0 && $saldo > 0.00001) {
        $activos[$id] = $saldo;
      }
    }

    $alloc = [];
    while ($restante > 0.00001 && count($activos) > 0) {
      $cuota = oi_round_money($restante / count($activos));
      if ($cuota <= 0.00001) $cuota = $restante;

      $aplicoEnVuelta = 0.0;
      foreach (array_keys($activos) as $id) {
        if ($restante <= 0.00001) break;

        $saldoDisponible = oi_round_money((float)$activos[$id]);
        $monto = min($cuota, $saldoDisponible, $restante);
        $monto = oi_round_money($monto);
        if ($monto <= 0.00001) {
          unset($activos[$id]);
          continue;
        }

        if (!isset($alloc[$id])) $alloc[$id] = 0.0;
        $alloc[$id] = oi_round_money($alloc[$id] + $monto);
        $activos[$id] = oi_round_money($activos[$id] - $monto);
        $restante = oi_round_money($restante - $monto);
        $aplicoEnVuelta = oi_round_money($aplicoEnVuelta + $monto);

        if ($activos[$id] <= 0.00001) unset($activos[$id]);
      }

      if ($aplicoEnVuelta <= 0.00001) break;
    }

    $out = [];
    foreach ($pendientes as $p) {
      $id = (int)($p['id_movimiento'] ?? 0);
      $monto = oi_round_money((float)($alloc[$id] ?? 0));
      if ($id <= 0 || $monto <= 0.00001) continue;

      $saldoPrevio = oi_round_money((float)($p['saldo'] ?? $p['monto'] ?? 0));
      $out[] = [
        'id_movimiento' => $id,
        'monto' => $monto,
        'saldo_previo' => $saldoPrevio,
        'saldo_restante' => oi_round_money(max(0.0, $saldoPrevio - $monto)),
      ];
    }

    return $out;
  }
}

if (!function_exists('oi_distribuir_medios_pago_por_movimiento')) {
  function oi_distribuir_medios_pago_por_movimiento(array $distribucion, array $mediosValidados): array
  {
    $resultado = [];
    $mediosRestantes = array_values(array_map(static function (array $mp): array {
      $mp['monto_restante'] = round((float)($mp['monto'] ?? 0), 2);
      return $mp;
    }, $mediosValidados));

    $idxMedio = 0;

    foreach ($distribucion as $p) {
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

if (!function_exists('oi_build_movimiento_data')) {
  function oi_build_movimiento_data(PDO $pdo, array $payload): array
  {
    $items = oi_normalize_items($payload);
    $fecha = oi_date_ymd($payload['fecha'] ?? null, '');
    if ($fecha === '') {
      throw new RuntimeException('La fecha de Otros Ingresos es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.');
    }
    $mediosRaw = mv_medios_pago_raw_desde_src($payload, mv_medios_pago_float($payload['monto_total'] ?? $payload['total'] ?? $payload['total_general'] ?? 0));
    $firstMedio = is_array($mediosRaw[0] ?? null) ? $mediosRaw[0] : [];
    $idMedioPago = oi_int($firstMedio['id_medio_pago'] ?? $payload['id_medio_pago'] ?? 0, 0);
    $idUsuario = function_exists('mv_secure_auth_user_id') ? (int)mv_secure_auth_user_id() : 0;
    if ($idUsuario <= 0) {
      $idUsuario = oi_int(
        $payload['idUsuarioMaster'] ?? $payload['idUsuario'] ?? $payload['id_usuario'] ?? 0,
        0
      );
    }

    $total = oi_sum_items_total($items);

    $data = [];

    if (oi_has_col($pdo, 'movimientos', 'fecha')) {
      $data['fecha'] = $fecha;
    }
    if (oi_has_col($pdo, 'movimientos', 'id_tipo_operacion')) {
      $data['id_tipo_operacion'] = 3;
    }
    if (oi_has_col($pdo, 'movimientos', 'id_clasificacion')) {
      $data['id_clasificacion'] = null;
    }
    if (oi_has_col($pdo, 'movimientos', 'id_tipo_venta')) {
      $data['id_tipo_venta'] = null;
    }
    if (oi_has_col($pdo, 'movimientos', 'id_cliente')) {
      $data['id_cliente'] = null;
    }
    if (oi_has_col($pdo, 'movimientos', 'id_proveedor')) {
      $data['id_proveedor'] = null;
    }
    if (oi_has_col($pdo, 'movimientos', 'monto_total')) {
      $data['monto_total'] = $total;
    }
    if (oi_has_col($pdo, 'movimientos', 'id_medio_pago')) {
      $data['id_medio_pago'] = $idMedioPago > 0 ? $idMedioPago : null;
    }

    if (oi_has_col($pdo, 'movimientos', 'id_stock_producto')) {
      $data['id_stock_producto'] = null;
    }

    if (oi_has_col($pdo, 'movimientos', 'created_at')) {
      $data['created_at'] = date('Y-m-d H:i:s');
    }

    $colUserCreate = oi_pick_first_existing_col(
      $pdo,
      'movimientos',
      ['id_usuario', 'idUsuario', 'usuario_id', 'created_by']
    );

    if ($colUserCreate && $idUsuario > 0) {
      $data[$colUserCreate] = $idUsuario;
    }

    return $data;
  }
}

if (!function_exists('oi_insert')) {
  function oi_insert(PDO $pdo, string $table, array $data): int
  {
    if (!$data) {
      throw new RuntimeException("No hay datos para insertar en {$table}.");
    }

    $cols   = array_keys($data);
    $fields = '`' . implode('`,`', $cols) . '`';
    $params = ':' . implode(',:', $cols);

    $sql = "INSERT INTO `{$table}` ({$fields}) VALUES ({$params})";
    $st  = $pdo->prepare($sql);

    foreach ($data as $k => $v) {
      $st->bindValue(':' . $k, $v);
    }

    $st->execute();
    return (int)$pdo->lastInsertId();
  }
}

if (!function_exists('oi_update')) {
  function oi_update(PDO $pdo, string $table, array $data, int $id): void
  {
    if ($id <= 0) {
      throw new RuntimeException('ID inválido para actualizar.');
    }

    if (!$data) {
      throw new RuntimeException("No hay datos para actualizar en {$table}.");
    }

    $idCol = oi_pick_first_existing_col($pdo, $table, ['id_movimiento', 'id']);
    if (!$idCol) {
      throw new RuntimeException("No se encontró la PK de {$table}.");
    }

    $sets = [];
    foreach ($data as $k => $v) {
      $sets[] = "`{$k}` = :{$k}";
    }

    $sql = "UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE `{$idCol}` = :_id LIMIT 1";
    $st  = $pdo->prepare($sql);

    foreach ($data as $k => $v) {
      $st->bindValue(':' . $k, $v);
    }

    $st->bindValue(':_id', $id, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oi_delete_items_by_movimiento')) {
  function oi_delete_items_by_movimiento(PDO $pdo, int $idMovimiento): void
  {
    $sql = "DELETE FROM movimientos_items WHERE id_movimiento = :id_movimiento";
    $st  = $pdo->prepare($sql);
    $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oi_insert_items')) {
  function oi_insert_items(PDO $pdo, int $idMovimiento, array $items): void
  {
    if ($idMovimiento <= 0) {
      throw new RuntimeException('ID de movimiento inválido para movimientos_items.');
    }

    if (!$items) {
      return;
    }

    $sql = "
      INSERT INTO movimientos_items
      (
        id_movimiento,
        id_detalle,
        id_stock_producto,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      )
      VALUES
      (
        :id_movimiento,
        :id_detalle,
        :id_stock_producto,
        :cantidad,
        :precio,
        :iva_pct,
        :subtotal,
        :iva_monto,
        :total
      )
    ";

    $st = $pdo->prepare($sql);

    foreach ($items as $it) {
      $idDetalle = (int)($it['id_detalle'] ?? 0);
      if ($idDetalle <= 0) {
        throw new RuntimeException('Cada fila válida debe tener id_detalle.');
      }

      $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
      $st->bindValue(':id_detalle', $idDetalle, PDO::PARAM_INT);

      if (oi_has_col($pdo, 'movimientos_items', 'id_stock_producto')) {
        $st->bindValue(':id_stock_producto', null, PDO::PARAM_NULL);
      } else {
        $st->bindValue(':id_stock_producto', null, PDO::PARAM_NULL);
      }

      $st->bindValue(':cantidad', oi_num($it['cantidad'] ?? 0, 0));
      $st->bindValue(':precio', oi_num($it['precio'] ?? 0, 0));
      $st->bindValue(':iva_pct', oi_num($it['iva_pct'] ?? 0, 0));
      $st->bindValue(':subtotal', oi_num($it['subtotal'] ?? 0, 0));
      $st->bindValue(':iva_monto', oi_num($it['iva_monto'] ?? 0, 0));
      $st->bindValue(':total', oi_num($it['total'] ?? 0, 0));
      $st->execute();
    }
  }
}

if (!function_exists('oi_validate_payload')) {
  function oi_validate_payload(PDO $pdo, array $payload): array
  {
    $fecha     = oi_date_ymd($payload['fecha'] ?? null, '');
    $items     = oi_normalize_items($payload);
    $mediosRaw = mv_medios_pago_raw_desde_src($payload, mv_medios_pago_float($payload['monto_total'] ?? $payload['total'] ?? $payload['total_general'] ?? 0));

    if ($fecha === '') {
      return ['ok' => false, 'mensaje' => 'La fecha es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.'];
    }

    if (!$items) {
      return ['ok' => false, 'mensaje' => 'Debés cargar al menos un ítem válido.'];
    }

    foreach ($items as $it) {
      if ((int)($it['id_detalle'] ?? 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'La descripción/detalle es obligatoria en todas las filas válidas.'];
      }
      if (oi_num($it['cantidad'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'La cantidad debe ser mayor a 0.'];
      }
      if (oi_num($it['precio'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El importe debe ser mayor a 0.'];
      }
      if (oi_num($it['subtotal'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El subtotal debe ser mayor a 0.'];
      }
      if (oi_num($it['total'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El total debe ser mayor a 0.'];
      }
    }

    return [
      'ok'         => true,
      'items'      => $items,
      'medios_raw' => $mediosRaw,
    ];
  }
}

if (!function_exists('oi_guess_medios_pago_pk')) {
  function oi_guess_medios_pago_pk(PDO $pdo): ?string
  {
    return oi_pick_first_existing_col($pdo, 'medios_pago', ['id_medio_pago', 'id']);
  }
}

if (!function_exists('oi_guess_medios_pago_nombre_col')) {
  function oi_guess_medios_pago_nombre_col(PDO $pdo): ?string
  {
    return oi_pick_first_existing_col($pdo, 'medios_pago', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('oi_fetch_movimiento_by_id')) {
  function oi_fetch_movimiento_by_id(PDO $pdo, int $idMovimiento): ?array
  {
    if ($idMovimiento <= 0) return null;

    $st = $pdo->prepare("
      SELECT *
      FROM movimientos
      WHERE id_movimiento = :id
      LIMIT 1
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('oi_fetch_items_by_movimiento')) {
  function oi_fetch_items_by_movimiento(PDO $pdo, int $idMovimiento): array
  {
    if ($idMovimiento <= 0) return [];

    $detPk        = oi_guess_detalles_pk($pdo);
    $detNombreCol = oi_guess_detalles_nombre_col($pdo);

    $joinDetalle = '';
    $selectDetalle = "'' AS detalle_nombre";

    if ($detPk && $detNombreCol) {
      $joinDetalle   = "LEFT JOIN detalles d ON d.`{$detPk}` = mi.id_detalle";
      $selectDetalle = "COALESCE(d.`{$detNombreCol}`, '') AS detalle_nombre";
    }

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
        {$selectDetalle}
      FROM movimientos_items mi
      {$joinDetalle}
      WHERE mi.id_movimiento = :id
      ORDER BY mi.id_item ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute([':id' => $idMovimiento]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$it) {
      $idDet = (int)($it['id_detalle'] ?? $it['id_stock_producto'] ?? 0);
      $it['id_detalle'] = $idDet;
      $it['id_stock_producto'] = $idDet;
    }
    unset($it);

    return $rows;
  }
}


if (!function_exists('oi_productos_label')) {
  function oi_productos_label(array $itemsDetalle): string
  {
    $cantidad = count($itemsDetalle);
    if ($cantidad <= 0) return 'SIN PRODUCTOS';
    if ($cantidad === 1) return '1 PRODUCTO';
    return $cantidad . ' PRODUCTOS';
  }
}

if (!function_exists('oi_fetch_items_by_movimientos')) {
  function oi_fetch_items_by_movimientos(PDO $pdo, array $idsMovimientos): array
  {
    $ids = [];
    foreach ($idsMovimientos as $id) {
      $n = (int)$id;
      if ($n > 0) $ids[$n] = $n;
    }
    if (!$ids) return [];

    $ids = array_values($ids);
    $ph = implode(',', array_fill(0, count($ids), '?'));

    $detPk        = oi_guess_detalles_pk($pdo);
    $detNombreCol = oi_guess_detalles_nombre_col($pdo);

    $joinDetalle = '';
    $selectDetalle = "'' AS detalle_nombre";

    if ($detPk && $detNombreCol) {
      $joinDetalle   = "LEFT JOIN detalles d ON d.`{$detPk}` = mi.id_detalle";
      $selectDetalle = "COALESCE(d.`{$detNombreCol}`, '') AS detalle_nombre";
    }

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
        {$selectDetalle}
      FROM movimientos_items mi
      {$joinDetalle}
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

      $nombre = (string)($it['detalle_nombre'] ?? '');
      $out[$idMov][] = [
        'id_item'               => isset($it['id_item']) ? (int)$it['id_item'] : null,
        'id_movimiento'         => $idMov,
        'id_detalle'            => $it['id_detalle'] === null ? null : (int)$it['id_detalle'],
        'id_stock_producto'     => $it['id_stock_producto'] === null ? null : (int)$it['id_stock_producto'],
        'producto_nombre'       => $nombre,
        'stock_producto_nombre' => '',
        'detalle_nombre'        => $nombre,
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

if (!function_exists('oi_fetch_comprobantes_by_movimiento')) {
  function oi_fetch_comprobantes_by_movimiento(PDO $pdo, int $idMovimiento): array
  {
    if ($idMovimiento <= 0) return [];
    if (!oi_table_exists($pdo, 'comprobantes_archivos')) return [];

    $st = $pdo->prepare("
      SELECT *
      FROM comprobantes_archivos
      WHERE id_movimiento = :id
      ORDER BY id_comprobante ASC
    ");
    $st->execute([':id' => $idMovimiento]);

    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }
}

if (!function_exists('oi_fetch_comprobantes_by_movimientos_global')) {
  function oi_fetch_comprobantes_by_movimientos_global(PDO $pdo, array $idsMovimientos): array
  {
    $ids = [];
    foreach ($idsMovimientos as $id) {
      $n = (int)$id;
      if ($n > 0) $ids[$n] = $n;
    }
    if (!$ids || !oi_table_exists($pdo, 'comprobantes_archivos')) return [];

    $ids = array_values($ids);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $tipoFiltro = "UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca.tipo,''), ' ', ''), '-', ''), '_', '')) IN ('OTROSINGRESOS', 'OTROINGRESO')";

    $parts = [];
    $params = [];

    if (oi_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')) {
      $parts[] = "
        SELECT ca.id_movimiento, ca.id_comprobante
        FROM comprobantes_archivos ca
        WHERE ca.id_movimiento IN ($ph)
          AND {$tipoFiltro}
      ";
      $params = array_merge($params, $ids);
    }

    if (oi_table_exists($pdo, 'movimientos_comprobantes')) {
      $parts[] = "
        SELECT mc.id_movimiento, mc.id_comprobante
        FROM movimientos_comprobantes mc
        INNER JOIN comprobantes_archivos ca ON ca.id_comprobante = mc.id_comprobante
        WHERE mc.id_movimiento IN ($ph)
          AND {$tipoFiltro}
      ";
      $params = array_merge($params, $ids);
    }

    if (!$parts) return [];

    $sql = "
      SELECT
        ref.id_movimiento,
        ca.id_comprobante,
        ca.tipo,
        ca.archivo_url,
        ca.archivo_path,
        ca.archivo_mime,
        ca.archivo_size,
        ca.sha256,
        ca.created_at
      FROM (" . implode("
UNION ALL
", $parts) . ") ref
      INNER JOIN comprobantes_archivos ca ON ca.id_comprobante = ref.id_comprobante
      ORDER BY ref.id_movimiento ASC, ca.id_comprobante DESC
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $out = [];
    foreach ($rows as $r) {
      $idMov = (int)($r['id_movimiento'] ?? 0);
      if ($idMov <= 0 || isset($out[$idMov])) continue;
      $out[$idMov] = $r;
    }
    return $out;
  }
}

if (!function_exists('oi_comp_delete_file_from_disk')) {
  function oi_comp_delete_file_from_disk(string $archivoPath): void
  {
    $archivoPath = trim(str_replace('\\', '/', $archivoPath));
    if ($archivoPath === '') return;

    try {
      if (strpos($archivoPath, 'r2://') === 0) {
        $r2Key = ltrim(substr($archivoPath, strlen('r2://')), '/');
        if ($r2Key !== '' && function_exists('mvx_r2_delete_object')) {
          try {
            mvx_r2_delete_object($r2Key);
          } catch (Throwable $inner) {
            // silencioso
          }
        }
        return;
      }

      $apiDir = realpath(dirname(__DIR__, 3));
      $projectDir = $apiDir ? realpath($apiDir . '/..') : null;
      $publicHtml = $projectDir ? realpath($projectDir . '/..') : null;
      $homeDir = $publicHtml ? realpath($publicHtml . '/..') : null;
      $baltoPrivate = $homeDir ? realpath($homeDir . '/balto_private') : null;
      $uploadsBase = $baltoPrivate ? realpath($baltoPrivate . '/uploads') : null;

      if (!$uploadsBase) return;

      if (strpos($archivoPath, 'uploads/') === 0) {
        $abs = rtrim($uploadsBase, '/') . '/' . ltrim(substr($archivoPath, strlen('uploads/')), '/');
      } elseif ($archivoPath[0] === '/' || preg_match('/^[A-Za-z]:\//', $archivoPath)) {
        $abs = $archivoPath;
      } else {
        $abs = rtrim($uploadsBase, '/') . '/' . ltrim($archivoPath, '/');
      }

      if (is_file($abs)) {
        @unlink($abs);
      }
    } catch (Throwable $e) {
      // silencioso
    }
  }
}
