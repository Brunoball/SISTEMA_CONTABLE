<?php
declare(strict_types=1);

require_once __DIR__ . '/../global/medios_pago.php';

require_once __DIR__ . '/../../utils/auditoria.php';

if (!function_exists('oe_json_response')) {
  function oe_json_response(array $data, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('oe_read_json_input')) {
  function oe_read_json_input(): array
  {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('oe_table_columns')) {
  function oe_table_columns(PDO $pdo, string $table): array
  {
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];

    $sql = "
      SELECT COLUMN_NAME
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = :table
    ";

    $st = $pdo->prepare($sql);
    $st->execute([':table' => $table]);

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $cols = [];
    foreach ($rows as $r) {
      $field = (string)($r['COLUMN_NAME'] ?? '');
      if ($field !== '') $cols[$field] = true;
    }

    $cache[$table] = $cols;
    return $cache[$table];
  }
}

if (!function_exists('oe_has_col')) {
  function oe_has_col(PDO $pdo, string $table, string $col): bool
  {
    return isset(oe_table_columns($pdo, $table)[$col]);
  }
}

if (!function_exists('oe_pick_first_existing_col')) {
  function oe_pick_first_existing_col(PDO $pdo, string $table, array $candidates): ?string
  {
    foreach ($candidates as $c) {
      if (oe_has_col($pdo, $table, $c)) return $c;
    }
    return null;
  }
}

if (!function_exists('oe_table_exists')) {
  function oe_table_exists(PDO $pdo, string $table): bool
  {
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];

    $sql = "
      SELECT COUNT(*)
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = :table
      LIMIT 1
    ";

    $st = $pdo->prepare($sql);
    $st->execute([':table' => $table]);

    $cache[$table] = ((int)$st->fetchColumn() > 0);
    return $cache[$table];
  }
}

if (!function_exists('oe_num')) {
  function oe_num($v, float $default = 0): float
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

if (!function_exists('oe_int')) {
  function oe_int($v, int $default = 0): int
  {
    return (int)round(oe_num($v, $default));
  }
}

if (!function_exists('oe_str')) {
  function oe_str($v, string $default = ''): string
  {
    $s = trim((string)($v ?? ''));
    return $s !== '' ? $s : $default;
  }
}

if (!function_exists('oe_bool_or_null')) {
  function oe_bool_or_null($v): ?bool
  {
    if ($v === null) return null;

    if (is_bool($v)) return $v;
    if (is_int($v) || is_float($v)) return ((int)$v) !== 0;

    $s = strtolower(trim((string)$v));
    if ($s === '') return null;

    $trueValues  = ['1', 'true', 'si', 'sí', 'yes', 'on'];
    $falseValues = ['0', 'false', 'no', 'off', 'null', 'ninguno', 'ninguna'];

    if (in_array($s, $trueValues, true)) return true;
    if (in_array($s, $falseValues, true)) return false;

    return null;
  }
}

/* =========================================================
   HELPERS AUDITORÍA
========================================================= */
if (!function_exists('oe_get_header_value')) {
  function oe_get_header_value(string $key): string
  {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
    $v = $_SERVER[$serverKey] ?? '';
    if (!is_string($v)) $v = '';
    return trim($v);
  }
}

if (!function_exists('oe_get_bearer_token')) {
  function oe_get_bearer_token(): string
  {
    $h = oe_get_header_value('Authorization');
    if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($h === '') return '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return '';
  }
}

if (!function_exists('oe_base64url_decode')) {
  function oe_base64url_decode(string $s): string
  {
    $s = str_replace(['-', '_'], ['+', '/'], $s);
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
  }
}

if (!function_exists('oe_extract_positive_int_from_candidates')) {
  function oe_extract_positive_int_from_candidates(array $candidates): int
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

if (!function_exists('oe_get_id_usuario_from_token')) {
  function oe_get_id_usuario_from_token(): int
  {
    $token = oe_get_bearer_token();
    if ($token === '' || substr_count($token, '.') !== 2) {
      return 0;
    }

    $parts = explode('.', $token);
    $payloadJson = oe_base64url_decode($parts[1] ?? '');
    if ($payloadJson === '') {
      return 0;
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload)) {
      return 0;
    }

    return oe_extract_positive_int_from_candidates([
      $payload['idUsuarioMaster'] ?? null,
      $payload['id_usuario_master'] ?? null,
      $payload['idUsuario'] ?? null,
      $payload['id_usuario'] ?? null,
      $payload['uid'] ?? null,
      $payload['sub'] ?? null,
    ]);
  }
}

if (!function_exists('oe_get_id_usuario_from_body_or_request')) {
  function oe_get_id_usuario_from_body_or_request(array $body = []): int
  {
    return oe_extract_positive_int_from_candidates([
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

if (!function_exists('oe_get_id_usuario_from_x_session')) {
  function oe_get_id_usuario_from_x_session(PDO $pdo): int
  {
    $sessionKey = oe_get_header_value('X-Session');
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

      return oe_extract_positive_int_from_candidates([
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

if (!function_exists('oe_get_id_usuario_from_request')) {
  function oe_get_id_usuario_from_request(PDO $pdo, array $body = []): int
  {

    if (function_exists('mv_secure_auth_user_id')) {
      $id = mv_secure_auth_user_id();
      if ($id > 0) return $id;
    }

    $id = (int)($GLOBALS['AUTH_USER_MASTER_ID'] ?? 0);
    if ($id > 0) return $id;

    $id = oe_get_id_usuario_from_token();
    if ($id > 0) return $id;

    $id = oe_get_id_usuario_from_body_or_request($body);
    if ($id > 0) return $id;

    $id = oe_get_id_usuario_from_x_session($pdo);
    if ($id > 0) return $id;

    return 0;
  }
}

if (!function_exists('oe_audit_safe')) {
  function oe_audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void
  {
    try {
      if ($idUsuario <= 0) {
        $idUsuario = oe_get_id_usuario_from_request($pdo, []);
      }

      if ($idUsuario <= 0) {
        return;
      }

      auditar($pdo, $idUsuario, 'otros_egresos', $accion, $entidad, $idEntidad, $detalle);
    } catch (Throwable $e) {
      // nunca romper flujo por auditoría
    }
  }
}

if (!function_exists('oe_fetch_movimiento_by_id')) {
  function oe_fetch_movimiento_by_id(PDO $pdo, int $idMovimiento): ?array
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

if (!function_exists('oe_fetch_items_by_movimiento')) {
  function oe_fetch_items_by_movimiento(PDO $pdo, int $idMovimiento): array
  {
    if ($idMovimiento <= 0) return [];

    $sql = "
      SELECT *
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':id' => $idMovimiento]);

    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }
}

if (!function_exists('oe_detect_deposito_cheque_id_from_movimiento')) {
  function oe_detect_deposito_cheque_id_from_movimiento(PDO $pdo, array $movimiento): ?int
  {
    if ((int)($movimiento['id_tipo_operacion'] ?? 0) !== 4) {
      return null;
    }

    $idMovimiento = (int)($movimiento['id_movimiento'] ?? 0);
    if ($idMovimiento <= 0) return null;

    // Un movimiento tipo 4 se considera depósito bancario de cheque/eCheq
    // solamente si tiene un evento explícito de depósito. No alcanza con que
    // exista movimientos_medios_pago.id_cheque, porque eso representa un
    // egreso normal pagado con cheque/eCheq.
    if (
      oe_table_exists($pdo, 'movimientos_cheques_flujo')
      && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_cheque')
      && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_movimiento')
    ) {
      $orderByFlujo = oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_flujo') ? ' ORDER BY id_flujo DESC ' : '';
      $st = $pdo->prepare("\n        SELECT id_cheque\n        FROM movimientos_cheques_flujo\n        WHERE id_movimiento = :id_movimiento\n          AND id_cheque IS NOT NULL\n          AND UPPER(COALESCE(evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')\n        {$orderByFlujo}\n        LIMIT 1\n      ");
      $st->execute([':id_movimiento' => $idMovimiento]);
      $idCheque = (int)($st->fetchColumn() ?: 0);
      if ($idCheque > 0) return $idCheque;
    }

    return null;
  }
}


/* =========================================================
   HELPERS CHEQUES DEPOSITADOS DESDE OTROS EGRESOS
   Un movimiento de tipo 4 que viene de DEPOSITADO_BANCO se edita
   como cheque real: movimientos + movimientos_cheques + flujos.
========================================================= */
if (!function_exists('oe_fecha_valida')) {
  function oe_fecha_valida(string $f): bool
  {
    if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
  }
}

if (!function_exists('oe_date_ymd')) {
  function oe_date_ymd($value, string $default = ''): string
  {
    $s = trim((string)($value ?? ''));
    if ($s === '') return $default;
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
      return oe_fecha_valida($out) ? $out : $default;
    }
    if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
      return oe_fecha_valida($out) ? $out : $default;
    }
    return $default;
  }
}

if (!function_exists('oe_detect_cheque_id_from_movimiento_id')) {
  function oe_detect_cheque_id_from_movimiento_id(PDO $pdo, int $idMovimiento): ?int
  {
    if ($idMovimiento <= 0 || !oe_table_exists($pdo, 'movimientos_cheques')) return null;

    // Esta función se usa para detectar movimientos creados por la acción
    // "Depositar en banco". Por eso solo debe mirar flujos de depósito,
    // nunca movimientos_medios_pago.id_cheque de un egreso normal.
    if (oe_table_exists($pdo, 'movimientos_cheques_flujo')) {
      $st = $pdo->prepare("\n        SELECT id_cheque\n        FROM movimientos_cheques_flujo\n        WHERE id_movimiento = :id_movimiento\n          AND id_cheque IS NOT NULL\n          AND UPPER(COALESCE(evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')\n        ORDER BY id_flujo DESC\n        LIMIT 1\n      ");
      $st->execute([':id_movimiento' => $idMovimiento]);
      $id = (int)($st->fetchColumn() ?: 0);
      if ($id > 0) return $id;
    }

    return null;
  }
}

if (!function_exists('oe_get_cheque_row')) {
  function oe_get_cheque_row(PDO $pdo, int $idCheque): ?array
  {
    if ($idCheque <= 0 || !oe_table_exists($pdo, 'movimientos_cheques')) return null;
    $st = $pdo->prepare("SELECT * FROM movimientos_cheques WHERE id_cheque = :id LIMIT 1");
    $st->execute([':id' => $idCheque]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('oe_get_deposito_cheque_context')) {
  function oe_get_deposito_cheque_context(PDO $pdo, int $idMovimiento): ?array
  {
    if ($idMovimiento <= 0) return null;

    $mov = oe_fetch_movimiento_by_id($pdo, $idMovimiento);
    if (!$mov || (int)($mov['id_tipo_operacion'] ?? 0) !== 4) return null;

    $idCheque = oe_detect_cheque_id_from_movimiento_id($pdo, $idMovimiento);
    if (!$idCheque) return null;

    $cheque = oe_get_cheque_row($pdo, $idCheque);
    if (!$cheque) return null;

    $flujoDeposito = null;
    if (oe_table_exists($pdo, 'movimientos_cheques_flujo')) {
      $st = $pdo->prepare("\n        SELECT *\n        FROM movimientos_cheques_flujo\n        WHERE id_movimiento = :id_movimiento\n          AND id_cheque = :id_cheque\n          AND UPPER(COALESCE(evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')\n        ORDER BY id_flujo DESC\n        LIMIT 1\n      ");
      $st->execute([':id_movimiento' => $idMovimiento, ':id_cheque' => $idCheque]);
      $flujoDeposito = $st->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    if (!$flujoDeposito) return null;

    return [
      'movimiento' => $mov,
      'cheque' => $cheque,
      'id_cheque' => $idCheque,
      'id_movimiento_deposito' => $idMovimiento,
      'id_movimiento_origen' => (int)($cheque['id_movimiento'] ?? 0),
      'flujo_deposito' => $flujoDeposito,
    ];
  }
}

if (!function_exists('oe_actualizar_descripcion_flujo_cheque')) {
  function oe_actualizar_descripcion_flujo_cheque(string $evento, string $tipo, string $numero, string $emisor, int $idMovimientoOrigen): string
  {
    $tipoLabel = strtolower($tipo) === 'echeq' ? 'eCheq' : 'Cheque';
    $eventoUp = strtoupper($evento);
    if ($eventoUp === 'INGRESO_CARTERA') return $tipoLabel . ' Nº ' . $numero . ' ingresado a cartera. Emisor: ' . $emisor;
    if ($eventoUp === 'EGRESO_CARTERA') return $tipoLabel . ' Nº ' . $numero . ' egresó de cartera por depósito en banco. Movimiento origen: ' . $idMovimientoOrigen . '.';
    return $tipoLabel . ' Nº ' . $numero . ' depositado en banco. Emisor: ' . $emisor . ' | Movimiento origen: ' . $idMovimientoOrigen;
  }
}

if (!function_exists('oe_update_or_insert_flujo_cheque')) {
  function oe_update_or_insert_flujo_cheque(PDO $pdo, int $idCheque, int $idMovimiento, string $evento, string $tipo, string $fecha, float $importe, string $descripcion, ?string $usuario = null): void
  {
    if ($idCheque <= 0 || $idMovimiento <= 0 || !oe_table_exists($pdo, 'movimientos_cheques_flujo')) return;

    $st = $pdo->prepare("\n      SELECT id_flujo\n      FROM movimientos_cheques_flujo\n      WHERE id_cheque = :id_cheque\n        AND id_movimiento = :id_movimiento\n        AND UPPER(COALESCE(evento,'')) = :evento\n      ORDER BY id_flujo DESC\n      LIMIT 1\n    ");
    $st->execute([':id_cheque' => $idCheque, ':id_movimiento' => $idMovimiento, ':evento' => strtoupper($evento)]);
    $idFlujo = (int)($st->fetchColumn() ?: 0);

    if ($idFlujo > 0) {
      $up = $pdo->prepare("\n        UPDATE movimientos_cheques_flujo\n        SET tipo_cheque = :tipo, fecha_evento = :fecha, importe = :importe, descripcion = :descripcion\n        WHERE id_flujo = :id_flujo\n        LIMIT 1\n      ");
      $up->execute([':tipo' => $tipo, ':fecha' => $fecha, ':importe' => $importe, ':descripcion' => $descripcion, ':id_flujo' => $idFlujo]);
      return;
    }

    $ins = $pdo->prepare("\n      INSERT INTO movimientos_cheques_flujo\n        (tipo_cheque, id_cheque, id_movimiento, evento, fecha_evento, importe, descripcion, usuario)\n      VALUES\n        (:tipo, :id_cheque, :id_movimiento, :evento, :fecha, :importe, :descripcion, :usuario)\n    ");
    $ins->execute([
      ':tipo' => $tipo,
      ':id_cheque' => $idCheque,
      ':id_movimiento' => $idMovimiento,
      ':evento' => strtoupper($evento),
      ':fecha' => $fecha,
      ':importe' => $importe,
      ':descripcion' => $descripcion,
      ':usuario' => $usuario,
    ]);
  }
}

if (!function_exists('oe_actualizar_deposito_cheque')) {
  function oe_actualizar_deposito_cheque(PDO $pdo, int $idMovimiento, array $payload, int $idUsuario = 0): array
  {
    $ctx = oe_get_deposito_cheque_context($pdo, $idMovimiento);
    if (!$ctx) throw new RuntimeException('No se pudo resolver el cheque vinculado al depósito bancario.');

    $chequeBefore = $ctx['cheque'];
    $movBefore = $ctx['movimiento'];
    $idCheque = (int)$ctx['id_cheque'];
    $idMovOrigen = (int)($ctx['id_movimiento_origen'] ?? 0);

    // El tipo del cheque/eCheq ya está definido por el registro original.
    // No permitimos que una edición desde Otros Egresos lo cambie por payload,
    // porque eso puede moverlo de sección y desordenar el historial de flujo.
    $tipo = strtolower(oe_str($chequeBefore['tipo'] ?? 'cheque'));
    if (!in_array($tipo, ['cheque', 'echeq'], true)) $tipo = 'cheque';

    $fechaMovimiento = oe_date_ymd($payload['fecha'] ?? null, '');
    $fechaEmision = oe_date_ymd($payload['fecha_emision'] ?? $payload['cheque_fecha_emision'] ?? $chequeBefore['fecha_emision'] ?? '', '');
    $fechaPago = oe_date_ymd($payload['fecha_pago'] ?? $payload['cheque_fecha_pago'] ?? $chequeBefore['fecha_pago'] ?? '', '');
    $emisor = oe_str($payload['emisor'] ?? $payload['cheque_emisor'] ?? $chequeBefore['emisor'] ?? '');
    $numero = oe_str($payload['numero_cheque'] ?? $payload['cheque_numero'] ?? $chequeBefore['numero_cheque'] ?? '');
    $importe = round(oe_num($payload['importe'] ?? $payload['cheque_importe'] ?? $payload['monto_total'] ?? $chequeBefore['importe'] ?? 0, 0), 2);

    if ($fechaMovimiento === '') throw new RuntimeException('La fecha del movimiento es obligatoria.');
    if ($fechaEmision === '') throw new RuntimeException('La fecha de emisión del cheque es obligatoria.');
    if ($fechaPago === '') throw new RuntimeException('La fecha de pago del cheque es obligatoria.');
    if ($emisor === '') throw new RuntimeException('El emisor del cheque es obligatorio.');
    if ($numero === '') throw new RuntimeException('El número de cheque es obligatorio.');
    if ($importe <= 0) throw new RuntimeException('El importe del cheque debe ser mayor a 0.');

    $pdo->beginTransaction();

    $movData = ['fecha' => $fechaMovimiento, 'monto_total' => $importe];
    if (isset($payload['id_medio_pago'])) {
      $idMedioPago = oe_int($payload['id_medio_pago'], 0);
      if ($idMedioPago > 0) $movData['id_medio_pago'] = $idMedioPago;
    }
    if (oe_has_col($pdo, 'movimientos', 'id_detalle')) $movData['id_detalle'] = $idCheque;
    oe_update($pdo, 'movimientos', $movData, $idMovimiento);

    $upCheque = $pdo->prepare("\n      UPDATE movimientos_cheques\n      SET tipo = :tipo, fecha_emision = :fecha_emision, emisor = :emisor, numero_cheque = :numero, importe = :importe, fecha_pago = :fecha_pago, activo = 0\n      WHERE id_cheque = :id_cheque\n      LIMIT 1\n    ");
    $upCheque->execute([
      ':tipo' => $tipo,
      ':fecha_emision' => $fechaEmision,
      ':emisor' => $emisor,
      ':numero' => $numero,
      ':importe' => $importe,
      ':fecha_pago' => $fechaPago,
      ':id_cheque' => $idCheque,
    ]);

    if ($idMovOrigen > 0) {
      oe_update_or_insert_flujo_cheque($pdo, $idCheque, $idMovOrigen, 'INGRESO_CARTERA', $tipo, $fechaEmision, $importe, oe_actualizar_descripcion_flujo_cheque('INGRESO_CARTERA', $tipo, $numero, $emisor, $idMovOrigen));
    }
    $usuario = oe_get_header_value('X-Session') ?: null;
    oe_update_or_insert_flujo_cheque($pdo, $idCheque, $idMovimiento, 'DEPOSITADO_BANCO', $tipo, $fechaMovimiento, $importe, oe_actualizar_descripcion_flujo_cheque('DEPOSITADO_BANCO', $tipo, $numero, $emisor, $idMovOrigen), $usuario);
    oe_update_or_insert_flujo_cheque($pdo, $idCheque, $idMovimiento, 'EGRESO_CARTERA', $tipo, $fechaMovimiento, $importe, oe_actualizar_descripcion_flujo_cheque('EGRESO_CARTERA', $tipo, $numero, $emisor, $idMovOrigen), $usuario);

    if (oe_table_exists($pdo, 'movimientos_items')) oe_delete_items_by_movimiento($pdo, $idMovimiento);

    $pdo->commit();

    $afterMov = oe_fetch_movimiento_by_id($pdo, $idMovimiento);
    $afterCheque = oe_get_cheque_row($pdo, $idCheque);
    oe_audit_safe($pdo, $idUsuario, 'actualizar', 'otros_egresos_cheque_depositado', $idMovimiento, [
      'movimiento_antes' => $movBefore,
      'movimiento_despues' => $afterMov,
      'cheque_antes' => $chequeBefore,
      'cheque_despues' => $afterCheque,
      'id_cheque' => $idCheque,
      'id_movimiento_origen' => $idMovOrigen,
    ]);

    return ['id_movimiento' => $idMovimiento, 'id_cheque' => $idCheque, 'movimiento' => $afterMov, 'cheque' => $afterCheque];
  }
}

/* =========================================================
   HELPERS EXISTENTES
========================================================= */
if (!function_exists('oe_guess_clasificaciones_pk')) {
  function oe_guess_clasificaciones_pk(PDO $pdo): ?string
  {
    return oe_pick_first_existing_col($pdo, 'clasificaciones', ['id_clasificacion', 'id']);
  }
}

if (!function_exists('oe_guess_clasificaciones_nombre_col')) {
  function oe_guess_clasificaciones_nombre_col(PDO $pdo): ?string
  {
    return oe_pick_first_existing_col($pdo, 'clasificaciones', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('oe_guess_medios_pago_pk')) {
  function oe_guess_medios_pago_pk(PDO $pdo): ?string
  {
    return mv_medios_pago_pk($pdo);
  }
}


if (!function_exists('oe_guess_medios_pago_nombre_col')) {
  function oe_guess_medios_pago_nombre_col(PDO $pdo): ?string
  {
    return mv_medios_pago_nombre_col($pdo);
  }
}


if (!function_exists('oe_guess_movimientos_medios_pago_pk')) {
  function oe_guess_movimientos_medios_pago_pk(PDO $pdo): ?string
  {
    return mv_medios_pago_movimientos_pk($pdo);
  }
}


if (!function_exists('oe_guess_costo_fijo_id')) {
  function oe_guess_costo_fijo_id(PDO $pdo): ?int
  {
    static $cache = null;
    static $loaded = false;

    if ($loaded) return $cache;
    $loaded = true;
    $cache = null;

    try {
      $pk  = oe_guess_clasificaciones_pk($pdo);
      $col = oe_guess_clasificaciones_nombre_col($pdo);

      if (!$pk || !$col) return null;

      $sql = "
        SELECT `{$pk}` AS id
        FROM clasificaciones
        WHERE UPPER(TRIM(`{$col}`)) = 'COSTO FIJO'
        LIMIT 1
      ";
      $st = $pdo->query($sql);
      $id = (int)($st->fetchColumn() ?: 0);

      if ($id > 0) {
        $cache = $id;
        return $cache;
      }

      $sql = "
        SELECT `{$pk}` AS id
        FROM clasificaciones
        WHERE UPPER(`{$col}`) LIKE '%COSTO%FIJO%'
        ORDER BY `{$pk}` ASC
        LIMIT 1
      ";
      $st = $pdo->query($sql);
      $id = (int)($st->fetchColumn() ?: 0);

      if ($id > 0) {
        $cache = $id;
        return $cache;
      }

      return null;
    } catch (Throwable $e) {
      return null;
    }
  }
}

if (!function_exists('oe_is_costo_fijo_id')) {
  function oe_is_costo_fijo_id(PDO $pdo, ?int $idClasificacion): bool
  {
    $idClasificacion = (int)($idClasificacion ?? 0);
    if ($idClasificacion <= 0) return false;

    $idCostoFijo = oe_guess_costo_fijo_id($pdo);
    if ($idCostoFijo <= 0) return false;

    return $idClasificacion === $idCostoFijo;
  }
}

if (!function_exists('oe_resolve_id_clasificacion')) {
  function oe_resolve_id_clasificacion(PDO $pdo, array $payload): ?int
  {
    $idCostoFijo = oe_guess_costo_fijo_id($pdo);

    $flag = oe_bool_or_null(
      $payload['es_costo_fijo']
      ?? $payload['costo_fijo']
      ?? $payload['esCostoFijo']
      ?? $payload['is_costo_fijo']
      ?? null
    );

    if ($flag === true) {
      return $idCostoFijo > 0 ? $idCostoFijo : null;
    }

    if ($flag === false) {
      return null;
    }

    $idClasificacion = oe_int(
      $payload['id_clasificacion']
      ?? $payload['clasificacion_id']
      ?? $payload['idClasificacion']
      ?? 0,
      0
    );

    if ($idClasificacion <= 0) {
      return null;
    }

    return oe_is_costo_fijo_id($pdo, $idClasificacion) ? $idClasificacion : null;
  }
}

if (!function_exists('oe_text_norm')) {
  function oe_text_norm(string $s): string
  {
    $s = trim(mb_strtolower($s, 'UTF-8'));
    $map = [
      'á'=>'a','à'=>'a','ä'=>'a','â'=>'a',
      'é'=>'e','è'=>'e','ë'=>'e','ê'=>'e',
      'í'=>'i','ì'=>'i','ï'=>'i','î'=>'i',
      'ó'=>'o','ò'=>'o','ö'=>'o','ô'=>'o',
      'ú'=>'u','ù'=>'u','ü'=>'u','û'=>'u',
      'ñ'=>'n',
    ];
    $s = strtr($s, $map);
    return preg_replace('/\s+/', ' ', $s) ?? $s;
  }
}

if (!function_exists('oe_detect_medio_pago_tipo_cheque')) {
  function oe_detect_medio_pago_tipo_cheque(string $nombre): ?string
  {
    return mv_medios_pago_detect_tipo_cheque($nombre);
  }
}


if (!function_exists('oe_get_medio_pago_row')) {
  function oe_get_medio_pago_row(PDO $pdo, int $idMedioPago): ?array
  {
    return mv_medios_pago_get_row($pdo, $idMedioPago);
  }
}


if (!function_exists('oe_normalize_items')) {
  function oe_normalize_items(array $payload): array
  {
    $items = [];

    if (isset($payload['items']) && is_array($payload['items'])) {
      foreach ($payload['items'] as $it) {
        if (!is_array($it)) continue;

        $idDetalle = oe_int(
          $it['id_detalle']
          ?? $it['idDetalle']
          ?? $it['detalle_id']
          ?? 0,
          0
        );

        $idStockProducto = oe_int(
          $it['id_stock_producto']
          ?? $it['idStockProducto']
          ?? 0,
          0
        );

        $cantidad = oe_num($it['cantidad'] ?? 0, 0);
        $precio   = oe_num($it['precio'] ?? 0, 0);
        $ivaPct   = oe_num($it['iva_pct'] ?? $it['ivaPct'] ?? 0, 0);

        if ($cantidad <= 0 || $precio <= 0) continue;

        $subtotal = oe_num($it['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto = oe_num($it['iva_monto'] ?? ($subtotal * ($ivaPct / 100)), $subtotal * ($ivaPct / 100));
        $total    = oe_num($it['total'] ?? ($subtotal + $ivaMonto), $subtotal + $ivaMonto);

        if ($subtotal <= 0 || $total <= 0) continue;

        $items[] = [
          'id_detalle'        => $idDetalle > 0 ? $idDetalle : null,
          'id_stock_producto' => $idStockProducto > 0 ? $idStockProducto : null,
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
      $cantidad = max(1, oe_num($payload['cantidad'] ?? 1, 1));
      $precio   = oe_num($payload['precio'] ?? 0, 0);
      $ivaPct   = oe_num($payload['iva_pct'] ?? $payload['ivaPct'] ?? 0, 0);

      if ($precio > 0) {
        $subtotal = oe_num($payload['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto = oe_num($payload['iva_monto'] ?? ($subtotal * ($ivaPct / 100)), $subtotal * ($ivaPct / 100));
        $total    = oe_num($payload['monto_total'] ?? $payload['total'] ?? ($subtotal + $ivaMonto), $subtotal + $ivaMonto);

        $idDetalle = oe_int(
          $payload['id_detalle']
          ?? $payload['idDetalle']
          ?? $payload['detalle_id']
          ?? 0,
          0
        );

        $idStockProducto = oe_int(
          $payload['id_stock_producto']
          ?? $payload['idStockProducto']
          ?? 0,
          0
        );

        if ($subtotal > 0 && $total > 0) {
          $items[] = [
            'id_detalle'        => $idDetalle > 0 ? $idDetalle : null,
            'id_stock_producto' => $idStockProducto > 0 ? $idStockProducto : null,
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

if (!function_exists('oe_first_item_detalle_id')) {
  function oe_first_item_detalle_id(array $items): ?int
  {
    foreach ($items as $it) {
      $id = (int)($it['id_detalle'] ?? 0);
      if ($id > 0) return $id;
    }
    return null;
  }
}

if (!function_exists('oe_first_item_stock_producto_id')) {
  function oe_first_item_stock_producto_id(array $items): ?int
  {
    foreach ($items as $it) {
      $id = (int)($it['id_stock_producto'] ?? 0);
      if ($id > 0) return $id;
    }
    return null;
  }
}

if (!function_exists('oe_sum_items_total')) {
  function oe_sum_items_total(array $items): float
  {
    $total = 0.0;
    foreach ($items as $it) {
      $total += oe_num($it['total'] ?? 0, 0);
    }
    return $total;
  }
}


if (!function_exists('oe_round_money')) {
  function oe_round_money(float $n): float
  {
    return round($n, 2);
  }
}

if (!function_exists('oe_estado_pago')) {
  function oe_estado_pago(float $total, float $pagado): string
  {
    $total = oe_round_money(max(0.0, $total));
    $pagado = oe_round_money(max(0.0, $pagado));
    $saldo = oe_round_money(max(0.0, $total - $pagado));

    if ($saldo <= 0.00001) return 'pagado';
    if ($pagado > 0.00001) return 'parcialmente_pagado';
    return 'pendiente';
  }
}

if (!function_exists('oe_suma_medios_validados')) {
  function oe_suma_medios_validados(array $medios): float
  {
    $total = 0.0;
    foreach ($medios as $mp) {
      if (!is_array($mp)) continue;
      $total += oe_num($mp['monto'] ?? 0, 0);
    }
    return oe_round_money($total);
  }
}

if (!function_exists('oe_validar_medios_pago_parcial')) {
  function oe_validar_medios_pago_parcial(PDO $pdo, array $mediosPagoRaw, float $saldoMaximo, array $options = []): array
  {
    $permitirVacio = (bool)($options['permitir_vacio'] ?? false);
    $emptyMessage = (string)($options['empty_message'] ?? 'Debés indicar al menos un medio de pago.');
    $totalLabel = (string)($options['total_label'] ?? 'egreso');

    if (empty($mediosPagoRaw)) {
      if ($permitirVacio) return [];
      throw new RuntimeException($emptyMessage);
    }

    $mediosValidados = mv_medios_pago_validar_multi($pdo, $mediosPagoRaw, 0.0, [
      'modo' => 'salida',
      'permitir_pago_parcial' => true,
      'allow_partial' => true,
      'permitir_crear_cheque' => false,
      'permitir_cheque_sin_detalle' => true,
      'include_original_index' => true,
      'empty_message' => $emptyMessage,
      'total_label' => $totalLabel,
    ]);

    $suma = oe_suma_medios_validados($mediosValidados);
    $saldoMaximo = oe_round_money(max(0.0, $saldoMaximo));

    if (!$permitirVacio && $suma <= 0.00001) {
      throw new RuntimeException('El importe pagado debe ser mayor a 0.');
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

if (!function_exists('oe_distribuir_pago_equitativo')) {
  function oe_distribuir_pago_equitativo(array $pendientes, float $montoPago): array
  {
    $restante = oe_round_money($montoPago);
    $activos = [];

    foreach ($pendientes as $p) {
      $id = (int)($p['id_movimiento'] ?? 0);
      $saldo = oe_round_money((float)($p['saldo'] ?? $p['monto'] ?? 0));
      if ($id > 0 && $saldo > 0.00001) $activos[$id] = $saldo;
    }

    $alloc = [];
    while ($restante > 0.00001 && count($activos) > 0) {
      $cuota = oe_round_money($restante / count($activos));
      if ($cuota <= 0.00001) $cuota = $restante;
      $aplicoEnVuelta = 0.0;

      foreach (array_keys($activos) as $id) {
        if ($restante <= 0.00001) break;
        $saldoDisponible = oe_round_money((float)$activos[$id]);
        $monto = oe_round_money(min($cuota, $saldoDisponible, $restante));
        if ($monto <= 0.00001) { unset($activos[$id]); continue; }
        if (!isset($alloc[$id])) $alloc[$id] = 0.0;
        $alloc[$id] = oe_round_money($alloc[$id] + $monto);
        $activos[$id] = oe_round_money($activos[$id] - $monto);
        $restante = oe_round_money($restante - $monto);
        $aplicoEnVuelta = oe_round_money($aplicoEnVuelta + $monto);
        if ($activos[$id] <= 0.00001) unset($activos[$id]);
      }
      if ($aplicoEnVuelta <= 0.00001) break;
    }

    $out = [];
    foreach ($pendientes as $p) {
      $id = (int)($p['id_movimiento'] ?? 0);
      $monto = oe_round_money((float)($alloc[$id] ?? 0));
      if ($id <= 0 || $monto <= 0.00001) continue;
      $saldoPrevio = oe_round_money((float)($p['saldo'] ?? $p['monto'] ?? 0));
      $out[] = [
        'id_movimiento' => $id,
        'monto' => $monto,
        'saldo_previo' => $saldoPrevio,
        'saldo_restante' => oe_round_money(max(0.0, $saldoPrevio - $monto)),
      ];
    }
    return $out;
  }
}

if (!function_exists('oe_distribuir_medios_pago_por_movimiento')) {
  function oe_distribuir_medios_pago_por_movimiento(array $distribucion, array $mediosValidados): array
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
        if ($restaMedio <= 0.009) { $idxMedio++; continue; }
        $usar = round(min($restaMedio, $faltanteMovimiento), 2);
        $row = $mp;
        $row['monto'] = $usar;
        unset($row['monto_restante']);
        $rows[] = $row;
        $mediosRestantes[$idxMedio]['monto_restante'] = round($restaMedio - $usar, 2);
        $faltanteMovimiento = round($faltanteMovimiento - $usar, 2);
        if ($mediosRestantes[$idxMedio]['monto_restante'] <= 0.009) $idxMedio++;
      }

      if ($idMov > 0 && $rows) $resultado[$idMov] = $rows;
    }
    return $resultado;
  }
}

if (!function_exists('oe_extract_medios_pago_raw')) {
  function oe_extract_medios_pago_raw(array $payload): array
  {
    return mv_medios_pago_raw_desde_src(
      $payload,
      mv_medios_pago_float($payload['monto_total'] ?? $payload['total'] ?? $payload['total_general'] ?? 0)
    );
  }
}


if (!function_exists('oe_build_movimiento_data')) {
  function oe_build_movimiento_data(PDO $pdo, array $payload): array
  {
    $items           = oe_normalize_items($payload);
    $fecha           = oe_date_ymd($payload['fecha'] ?? null, '');
    if ($fecha === '') {
      throw new RuntimeException('La fecha de Otros Egresos es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.');
    }
    $mediosRaw       = oe_extract_medios_pago_raw($payload);
    $firstMedio      = is_array($mediosRaw[0] ?? null) ? $mediosRaw[0] : [];
    $idMedioPago     = oe_int($firstMedio['id_medio_pago'] ?? $payload['id_medio_pago'] ?? 0, 0);
    $idClasificacion = oe_resolve_id_clasificacion($pdo, $payload);
    $idUsuario       = oe_get_id_usuario_from_request($pdo, $payload);
    $total           = oe_sum_items_total($items);
    $firstDetalle    = oe_first_item_detalle_id($items);
    $firstStockProd  = oe_first_item_stock_producto_id($items);

    $data = [
      'fecha'             => $fecha,
      'id_tipo_operacion' => 4,
      'id_clasificacion'  => $idClasificacion,
      'id_tipo_venta'     => null,
      'id_cliente'        => null,
      'id_proveedor'      => null,
      'monto_total'       => $total,
      'id_medio_pago'     => $idMedioPago > 0 ? $idMedioPago : null,
    ];

    if (oe_has_col($pdo, 'movimientos', 'id_detalle')) {
      $data['id_detalle'] = $firstDetalle > 0 ? $firstDetalle : null;
    }

    if (oe_has_col($pdo, 'movimientos', 'id_stock_producto')) {
      $data['id_stock_producto'] = $firstStockProd > 0 ? $firstStockProd : null;
    }

    if (oe_has_col($pdo, 'movimientos', 'created_at')) {
      $data['created_at'] = date('Y-m-d H:i:s');
    }

    $colUser = oe_pick_first_existing_col($pdo, 'movimientos', ['id_usuario', 'idUsuario', 'usuario_id', 'created_by']);
    if ($colUser && $idUsuario > 0) {
      $data[$colUser] = $idUsuario;
    }

    return $data;
  }
}

if (!function_exists('oe_insert')) {
  function oe_insert(PDO $pdo, string $table, array $data): int
  {
    if (!$data) {
      throw new RuntimeException("No hay datos para insertar en {$table}.");
    }

    $cols   = array_keys($data);
    $fields = '`' . implode('`,`', $cols) . '`';
    $params = ':' . implode(',:', $cols);
    $sql    = "INSERT INTO `{$table}` ({$fields}) VALUES ({$params})";

    $st = $pdo->prepare($sql);
    foreach ($data as $k => $v) {
      $st->bindValue(':' . $k, $v);
    }
    $st->execute();

    return (int)$pdo->lastInsertId();
  }
}

if (!function_exists('oe_update')) {
  function oe_update(PDO $pdo, string $table, array $data, int $id): void
  {
    if ($id <= 0) {
      throw new RuntimeException('ID inválido para actualizar.');
    }
    if (!$data) {
      throw new RuntimeException("No hay datos para actualizar en {$table}.");
    }

    $idCol = oe_pick_first_existing_col($pdo, $table, ['id_movimiento', 'id']);
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

if (!function_exists('oe_delete_items_by_movimiento')) {
  function oe_delete_items_by_movimiento(PDO $pdo, int $idMovimiento): void
  {
    $st = $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id");
    $st->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oe_insert_items')) {
  function oe_insert_items(PDO $pdo, int $idMovimiento, array $items): void
  {
    if ($idMovimiento <= 0) {
      throw new RuntimeException('ID de movimiento inválido para movimientos_items.');
    }
    if (!$items) return;

    $cols = ['id_movimiento'];
    $vals = [':id_movimiento'];

    $hasIdDetalle = oe_has_col($pdo, 'movimientos_items', 'id_detalle');
    $hasIdStock   = oe_has_col($pdo, 'movimientos_items', 'id_stock_producto');

    if ($hasIdDetalle) {
      $cols[] = 'id_detalle';
      $vals[] = ':id_detalle';
    }

    if ($hasIdStock) {
      $cols[] = 'id_stock_producto';
      $vals[] = ':id_stock_producto';
    }

    $cols = array_merge($cols, ['cantidad', 'precio', 'iva_pct', 'subtotal', 'iva_monto', 'total']);
    $vals = array_merge($vals, [':cantidad', ':precio', ':iva_pct', ':subtotal', ':iva_monto', ':total']);

    $sql = "
      INSERT INTO movimientos_items
        (`" . implode('`,`', $cols) . "`)
      VALUES
        (" . implode(',', $vals) . ")
    ";

    $st = $pdo->prepare($sql);

    foreach ($items as $it) {
      $idDetalle = (int)($it['id_detalle'] ?? 0);
      $idStock   = (int)($it['id_stock_producto'] ?? 0);

      if ($hasIdDetalle && $idDetalle <= 0) {
        throw new RuntimeException('Cada fila válida debe tener id_detalle.');
      }

      $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);

      if ($hasIdDetalle) {
        if ($idDetalle > 0) $st->bindValue(':id_detalle', $idDetalle, PDO::PARAM_INT);
        else $st->bindValue(':id_detalle', null, PDO::PARAM_NULL);
      }

      if ($hasIdStock) {
        if ($idStock > 0) $st->bindValue(':id_stock_producto', $idStock, PDO::PARAM_INT);
        else $st->bindValue(':id_stock_producto', null, PDO::PARAM_NULL);
      }

      $st->bindValue(':cantidad', oe_num($it['cantidad'] ?? 0));
      $st->bindValue(':precio', oe_num($it['precio'] ?? 0));
      $st->bindValue(':iva_pct', oe_num($it['iva_pct'] ?? 0));
      $st->bindValue(':subtotal', oe_num($it['subtotal'] ?? 0));
      $st->bindValue(':iva_monto', oe_num($it['iva_monto'] ?? 0));
      $st->bindValue(':total', oe_num($it['total'] ?? 0));
      $st->execute();
    }
  }
}

if (!function_exists('oe_validate_payload')) {
  function oe_validate_payload(PDO $pdo, array $payload): array
  {
    $fecha     = oe_date_ymd($payload['fecha'] ?? null, '');
    $items     = oe_normalize_items($payload);
    $mediosRaw = oe_extract_medios_pago_raw($payload);

    $flag = oe_bool_or_null(
      $payload['es_costo_fijo']
      ?? $payload['costo_fijo']
      ?? $payload['esCostoFijo']
      ?? $payload['is_costo_fijo']
      ?? null
    );

    if ($fecha === '') {
      return ['ok' => false, 'mensaje' => 'La fecha es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.'];
    }

    if (!$items) {
      return ['ok' => false, 'mensaje' => 'Debés cargar al menos un ítem válido.'];
    }

    if ($flag === true && !oe_guess_costo_fijo_id($pdo)) {
      return ['ok' => false, 'mensaje' => 'No se encontró la clasificación COSTO FIJO en la tabla clasificaciones.'];
    }

    foreach ($items as $it) {
      if ((int)($it['id_detalle'] ?? 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'La descripción es obligatoria en todas las filas válidas.'];
      }
      if (oe_num($it['cantidad'] ?? 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'La cantidad debe ser mayor a 0.'];
      }
      if (oe_num($it['precio'] ?? 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El importe debe ser mayor a 0.'];
      }
      if (oe_num($it['subtotal'] ?? 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El subtotal debe ser mayor a 0.'];
      }
      if (oe_num($it['total'] ?? 0) <= 0) {
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