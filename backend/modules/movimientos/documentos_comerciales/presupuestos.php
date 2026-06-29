<?php
// backend/modules/movimientos/documentos_comerciales/presupuestos.php
declare(strict_types=1);

function presu_str($v): string {
  return trim((string)($v ?? ''));
}

function presu_num($v, float $fallback = 0.0): float {
  if ($v === null || $v === '') return $fallback;
  if (!is_numeric($v)) return $fallback;
  return (float)$v;
}

function presu_pos_int($v): ?int {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  $n = (int)$v;
  return $n > 0 ? $n : null;
}

function presu_items_label($cantidad): string {
  $n = (int)$cantidad;
  if ($n <= 0) return 'SIN PRODUCTOS';
  if ($n === 1) return '1 PRODUCTO';
  return $n . ' PRODUCTOS';
}

function presu_bool_table_exists(PDO $pdo, string $table): bool {
  if (!preg_match('/^[a-zA-Z0-9_]+$/', $table)) return false;

  try {
    $db = (string)($pdo->query('SELECT DATABASE()')->fetchColumn() ?: '');
    if ($db === '') return false;

    $st = $pdo->prepare("
      SELECT COUNT(*)
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = :db
        AND TABLE_NAME = :table
      LIMIT 1
    ");
    $st->execute([':db' => $db, ':table' => $table]);
    return (int)$st->fetchColumn() > 0;
  } catch (Throwable $e) {
    try {
      $pdo->query("SELECT 1 FROM `{$table}` LIMIT 1");
      return true;
    } catch (Throwable $e2) {
      return false;
    }
  }
}

function presu_ensure_conversion_table(PDO $pdo): void {
  try {
    $pdo->exec("
      CREATE TABLE IF NOT EXISTS presupuestos_conversiones (
        id_conversion INT UNSIGNED NOT NULL AUTO_INCREMENT,
        id_presupuesto INT UNSIGNED NOT NULL,
        id_venta INT UNSIGNED NOT NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'convertido',
        fecha_conversion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id_conversion),
        UNIQUE KEY uniq_presupuesto (id_presupuesto),
        KEY idx_venta (id_venta),
        KEY idx_estado (estado)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
  } catch (Throwable $e) {
    throw new RuntimeException('No se pudo preparar la tabla presupuestos_conversiones: ' . $e->getMessage());
  }
}

function presu_conversion_table_available(PDO $pdo): bool {
  if (!$pdo->inTransaction()) {
    presu_ensure_conversion_table($pdo);
  }
  return presu_bool_table_exists($pdo, 'presupuestos_conversiones');
}


function presu_conversion_valid_join_sql(string $alias = 'conv'): string {
  if (!preg_match('/^[a-zA-Z0-9_]+$/', $alias)) {
    $alias = 'conv';
  }

  return "
    LEFT JOIN (
      SELECT
        pc.id_conversion,
        pc.id_presupuesto,
        pc.id_venta,
        pc.estado,
        pc.fecha_conversion,
        pc.created_at
      FROM presupuestos_conversiones pc
      INNER JOIN movimientos p ON p.id_movimiento = pc.id_presupuesto
      INNER JOIN tipos_operacion tp
        ON tp.id_tipo_operacion = p.id_tipo_operacion
       AND UPPER(tp.nombre) = 'PRESUPUESTO'
      INNER JOIN movimientos v ON v.id_movimiento = pc.id_venta
      INNER JOIN tipos_operacion tv
        ON tv.id_tipo_operacion = v.id_tipo_operacion
       AND UPPER(tv.nombre) = 'VENTA'
      WHERE pc.id_venta > 0
        AND pc.id_venta <> pc.id_presupuesto
        AND pc.fecha_conversion >= DATE_SUB(p.created_at, INTERVAL 2 MINUTE)
        AND v.created_at >= DATE_SUB(p.created_at, INTERVAL 2 MINUTE)
    ) {$alias} ON {$alias}.id_presupuesto = m.id_movimiento
  ";
}

function presu_limpiar_conversiones_de_presupuesto(PDO $pdo, int $idPresupuesto): void {
  if ($idPresupuesto <= 0 || !presu_bool_table_exists($pdo, 'presupuestos_conversiones')) return;
  $st = $pdo->prepare("DELETE FROM presupuestos_conversiones WHERE id_presupuesto = :id");
  $st->execute([':id' => $idPresupuesto]);
}


function presu_ensure_meta_table(PDO $pdo): void {
  try {
    $pdo->exec("
      CREATE TABLE IF NOT EXISTS presupuestos_meta (
        id_meta INT UNSIGNED NOT NULL AUTO_INCREMENT,
        id_movimiento INT UNSIGNED NOT NULL,
        validez_dias INT UNSIGNED DEFAULT NULL,
        fecha_validez DATE DEFAULT NULL,
        plazo_entrega VARCHAR(500) DEFAULT NULL,
        forma_pago TEXT DEFAULT NULL,
        condiciones_comerciales TEXT DEFAULT NULL,
        notas TEXT DEFAULT NULL,
        garantia VARCHAR(500) DEFAULT NULL,
        lugar_entrega VARCHAR(300) DEFAULT NULL,
        moneda VARCHAR(30) DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_meta),
        UNIQUE KEY uq_presupuesto_meta_mov (id_movimiento),
        KEY idx_fecha_validez (fecha_validez)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
  } catch (Throwable $e) {
    throw new RuntimeException('No se pudo preparar la tabla presupuestos_meta: ' . $e->getMessage());
  }

  // Blindaje para bases que ya tengan una versión vieja/parcial de la tabla.
  $cols = [
    'validez_dias' => 'ALTER TABLE presupuestos_meta ADD COLUMN validez_dias INT UNSIGNED DEFAULT NULL',
    'fecha_validez' => 'ALTER TABLE presupuestos_meta ADD COLUMN fecha_validez DATE DEFAULT NULL',
    'plazo_entrega' => 'ALTER TABLE presupuestos_meta ADD COLUMN plazo_entrega VARCHAR(500) DEFAULT NULL',
    'forma_pago' => 'ALTER TABLE presupuestos_meta ADD COLUMN forma_pago TEXT DEFAULT NULL',
    'condiciones_comerciales' => 'ALTER TABLE presupuestos_meta ADD COLUMN condiciones_comerciales TEXT DEFAULT NULL',
    'notas' => 'ALTER TABLE presupuestos_meta ADD COLUMN notas TEXT DEFAULT NULL',
    'garantia' => 'ALTER TABLE presupuestos_meta ADD COLUMN garantia VARCHAR(500) DEFAULT NULL',
    'lugar_entrega' => 'ALTER TABLE presupuestos_meta ADD COLUMN lugar_entrega VARCHAR(300) DEFAULT NULL',
    'moneda' => 'ALTER TABLE presupuestos_meta ADD COLUMN moneda VARCHAR(30) DEFAULT NULL',
    'updated_at' => 'ALTER TABLE presupuestos_meta ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  ];

  foreach ($cols as $col => $ddl) {
    try {
      $db = (string)($pdo->query('SELECT DATABASE()')->fetchColumn() ?: '');
      if ($db === '') continue;
      $st = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = :db
          AND TABLE_NAME = 'presupuestos_meta'
          AND COLUMN_NAME = :col
        LIMIT 1
      ");
      $st->execute([':db' => $db, ':col' => $col]);
      if ((int)$st->fetchColumn() <= 0) {
        $pdo->exec($ddl);
      }
    } catch (Throwable $e) {
      // Si el usuario no tiene permiso para information_schema o ALTER, no debe romper listados antiguos.
    }
  }
}

function presu_clean_multiline($v, int $maxLen = 1200): string {
  $txt = trim((string)($v ?? ''));
  if ($txt === '') return '';
  $txt = str_replace(["\r\n", "\r"], "\n", $txt);
  $txt = preg_replace('/[ \t]+/', ' ', $txt) ?? $txt;
  $txt = preg_replace('/\n{3,}/', "\n\n", $txt) ?? $txt;
  $txt = trim($txt);
  if ($maxLen > 0 && strlen($txt) > $maxLen) $txt = substr($txt, 0, $maxLen);
  return trim($txt);
}

function presu_add_days_iso(string $fecha, int $dias): ?string {
  if (!is_valid_fecha($fecha) || $dias <= 0) return null;
  try {
    $dt = new DateTimeImmutable($fecha);
    return $dt->modify('+' . $dias . ' days')->format('Y-m-d');
  } catch (Throwable $e) {
    return null;
  }
}

function presu_normalizar_meta(array $body, string $fecha): array {
  $src = [];
  if (isset($body['condiciones_presupuesto']) && is_array($body['condiciones_presupuesto'])) {
    $src = $body['condiciones_presupuesto'];
  }

  $validezRaw = $body['validez_dias'] ?? $src['validez_dias'] ?? $src['validezDias'] ?? 7;
  $validezDias = null;
  if ($validezRaw !== null && $validezRaw !== '') {
    if (!is_numeric($validezRaw)) fail('La validez del presupuesto debe ser un número de días.');
    $validezDias = max(0, min(3650, (int)$validezRaw));
  }

  $fechaValidez = presu_normalizar_fecha($body['fecha_validez'] ?? $src['fecha_validez'] ?? $src['fechaValidez'] ?? null);
  if ($fechaValidez === null && $validezDias !== null && $validezDias > 0) {
    $fechaValidez = presu_add_days_iso($fecha, $validezDias);
  }

  return [
    'validez_dias' => $validezDias,
    'fecha_validez' => $fechaValidez,
    'plazo_entrega' => presu_clean_multiline($body['plazo_entrega'] ?? $src['plazo_entrega'] ?? $src['plazoEntrega'] ?? '', 500),
    'forma_pago' => presu_clean_multiline($body['forma_pago'] ?? $src['forma_pago'] ?? $src['formaPago'] ?? '', 1400),
    'condiciones_comerciales' => presu_clean_multiline($body['condiciones_comerciales'] ?? $src['condiciones_comerciales'] ?? $src['condicionesComerciales'] ?? '', 1600),
    'notas' => presu_clean_multiline($body['notas'] ?? $src['notas'] ?? $body['observaciones'] ?? '', 1200),
    'garantia' => presu_clean_multiline($body['garantia'] ?? $src['garantia'] ?? '', 500),
    'lugar_entrega' => presu_clean_multiline($body['lugar_entrega'] ?? $src['lugar_entrega'] ?? $src['lugarEntrega'] ?? '', 300),
    'moneda' => substr(presu_str($body['moneda'] ?? $src['moneda'] ?? 'ARS'), 0, 30),
  ];
}

function presu_guardar_meta(PDO $pdo, int $idMovimiento, array $meta): void {
  if ($idMovimiento <= 0) return;

  // IMPORTANTE: MySQL hace COMMIT implícito con CREATE/ALTER TABLE.
  // Por eso la tabla se prepara antes de beginTransaction() en presupuestos_crear().
  // Si este helper se llama fuera de una transacción, ahí sí puede preparar la tabla.
  if (!$pdo->inTransaction()) {
    presu_ensure_meta_table($pdo);
  }
  $st = $pdo->prepare("
    INSERT INTO presupuestos_meta
      (id_movimiento, validez_dias, fecha_validez, plazo_entrega, forma_pago, condiciones_comerciales, notas, garantia, lugar_entrega, moneda)
    VALUES
      (:id_movimiento, :validez_dias, :fecha_validez, :plazo_entrega, :forma_pago, :condiciones_comerciales, :notas, :garantia, :lugar_entrega, :moneda)
    ON DUPLICATE KEY UPDATE
      validez_dias = VALUES(validez_dias),
      fecha_validez = VALUES(fecha_validez),
      plazo_entrega = VALUES(plazo_entrega),
      forma_pago = VALUES(forma_pago),
      condiciones_comerciales = VALUES(condiciones_comerciales),
      notas = VALUES(notas),
      garantia = VALUES(garantia),
      lugar_entrega = VALUES(lugar_entrega),
      moneda = VALUES(moneda),
      updated_at = NOW()
  ");
  $st->execute([
    ':id_movimiento' => $idMovimiento,
    ':validez_dias' => $meta['validez_dias'],
    ':fecha_validez' => $meta['fecha_validez'],
    ':plazo_entrega' => $meta['plazo_entrega'] !== '' ? $meta['plazo_entrega'] : null,
    ':forma_pago' => $meta['forma_pago'] !== '' ? $meta['forma_pago'] : null,
    ':condiciones_comerciales' => $meta['condiciones_comerciales'] !== '' ? $meta['condiciones_comerciales'] : null,
    ':notas' => $meta['notas'] !== '' ? $meta['notas'] : null,
    ':garantia' => $meta['garantia'] !== '' ? $meta['garantia'] : null,
    ':lugar_entrega' => $meta['lugar_entrega'] !== '' ? $meta['lugar_entrega'] : null,
    ':moneda' => $meta['moneda'] !== '' ? $meta['moneda'] : 'ARS',
  ]);
}

function presu_fetch_meta_por_movimientos(PDO $pdo, array $idsMovimientos): array {
  $ids = [];
  foreach ($idsMovimientos as $id) {
    $n = (int)$id;
    if ($n > 0) $ids[$n] = $n;
  }
  if (!$ids) return [];

  try {
    presu_ensure_meta_table($pdo);
    $ids = array_values($ids);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("SELECT * FROM presupuestos_meta WHERE id_movimiento IN ($ph)");
    foreach ($ids as $i => $idMov) $st->bindValue($i + 1, $idMov, PDO::PARAM_INT);
    $st->execute();
    $out = [];
    foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
      $idMov = (int)($row['id_movimiento'] ?? 0);
      if ($idMov <= 0) continue;
      $row['validez_dias'] = $row['validez_dias'] === null ? null : (int)$row['validez_dias'];
      $out[$idMov] = $row;
    }
    return $out;
  } catch (Throwable $e) {
    return [];
  }
}

function presu_attach_meta(PDO $pdo, array $row): array {
  $id = (int)($row['id_movimiento'] ?? 0);
  if ($id <= 0) return $row;
  $meta = presu_fetch_meta_por_movimientos($pdo, [$id]);
  $m = $meta[$id] ?? [];
  if ($m) {
    $row = array_merge($row, $m);
    $row['condiciones_presupuesto'] = $m;
  }
  return $row;
}


/* =========================================================
   Auditoría propia de Presupuestos
   - No usa audit_safe() porque viene de ventas/comun.php y registra
     el módulo como "ventas".
   - Mantiene el flujo sin romper si la auditoría falla.
   - Usa auditar() si está disponible y tiene fallback directo a la
     tabla auditoria con las columnas reales del sistema.
========================================================= */
function presu_header_value(string $key): string {
  if (function_exists('get_header_value')) {
    try {
      return (string)get_header_value($key);
    } catch (Throwable $e) {}
  }

  $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = $_SERVER[$serverKey] ?? '';
  return is_string($v) ? trim($v) : '';
}

function presu_base64url_decode(string $s): string {
  if (function_exists('base64url_decode2')) {
    try {
      return (string)base64url_decode2($s);
    } catch (Throwable $e) {}
  }

  $s = str_replace(['-', '_'], ['+', '/'], $s);
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  $out = base64_decode($s, true);
  return $out === false ? '' : $out;
}

function presu_positive_int_from_candidates(array $candidates): int {
  if (function_exists('extract_positive_int_from_candidates')) {
    try {
      $id = (int)extract_positive_int_from_candidates($candidates);
      if ($id > 0) return $id;
    } catch (Throwable $e) {}
  }

  foreach ($candidates as $c) {
    if (is_numeric($c)) {
      $id = (int)$c;
      if ($id > 0) return $id;
    }
  }
  return 0;
}

function presu_bearer_payload(): array {
  $h = presu_header_value('Authorization');
  if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
  if ($h === '' || stripos($h, 'Bearer ') !== 0) return [];

  $token = trim(substr($h, 7));
  if ($token === '' || substr_count($token, '.') !== 2) return [];

  $parts = explode('.', $token);
  $payloadJson = presu_base64url_decode((string)($parts[1] ?? ''));
  if ($payloadJson === '') return [];

  $payload = json_decode($payloadJson, true);
  return is_array($payload) ? $payload : [];
}

function presu_resolver_tenant_auditoria(PDO $pdo, array $src = []): ?int {
  // Fuente confiable: sesión validada por backend/routes/api.php.
  // No se usa idTenant del body/query del frontend como fuente de verdad.
  if (function_exists('mv_secure_auth_tenant_id')) {
    try {
      $id = (int)mv_secure_auth_tenant_id();
      if ($id > 0) return $id;
    } catch (Throwable $e) {}
  }

  $id = presu_positive_int_from_candidates([
    $GLOBALS['AUTH_TENANT_ID'] ?? null,
    $GLOBALS['SESSION_MASTER']['idTenant'] ?? null,
    $GLOBALS['SESSION_MASTER']['id_tenant'] ?? null,
    $GLOBALS['SESSION_MASTER']['tenant_id'] ?? null,
    $GLOBALS['tenant']['idTenant'] ?? null,
    $GLOBALS['tenant']['id_tenant'] ?? null,
    $GLOBALS['tenant']['tenant_id'] ?? null,
    $GLOBALS['currentTenant']['idTenant'] ?? null,
    $GLOBALS['currentTenant']['id_tenant'] ?? null,
    $GLOBALS['currentTenant']['tenant_id'] ?? null,
    $_SESSION['idTenant'] ?? null,
    $_SESSION['id_tenant'] ?? null,
    $_SESSION['tenant_id'] ?? null,
    $_SERVER['X_IDTENANT'] ?? null,
    $_SERVER['HTTP_X_IDTENANT'] ?? null,
    $_SERVER['HTTP_X_ID_TENANT'] ?? null,
  ]);

  return $id > 0 ? $id : null;
}

function presu_resolver_usuario_auditoria(PDO $pdo, array $src = []): int {
  // Fuente confiable: usuario resuelto desde la sesión de MASTER.
  // El frontend puede enviar idUsuarioMaster, pero route.php/core/secure_context.php
  // lo valida contra la sesión antes de llegar a este archivo.
  if (function_exists('mv_secure_auth_user_id')) {
    try {
      $id = (int)mv_secure_auth_user_id();
      if ($id > 0) return $id;
    } catch (Throwable $e) {}
  }

  $id = presu_positive_int_from_candidates([
    $GLOBALS['AUTH_USER_MASTER_ID'] ?? null,
    $GLOBALS['SESSION_MASTER']['idUsuarioMaster'] ?? null,
    $GLOBALS['SESSION_MASTER']['id_usuario_master'] ?? null,
    $GLOBALS['SESSION_MASTER']['idUsuario'] ?? null,
    $GLOBALS['SESSION_MASTER']['id_usuario'] ?? null,
    $_SESSION['idUsuarioMaster'] ?? null,
    $_SESSION['id_usuario_master'] ?? null,
    $_SESSION['balto_user_id'] ?? null,
    $_SESSION['user_id'] ?? null,
    $_SERVER['X_IDUSUARIO_MASTER'] ?? null,
    $_SERVER['HTTP_X_IDUSUARIO_MASTER'] ?? null,
    $_SERVER['HTTP_X_ID_USUARIO_MASTER'] ?? null,
  ]);
  if ($id > 0) return $id;

  // Fallback de compatibilidad. No debería ser necesario si entra por routes/api.php.
  if (function_exists('get_id_usuario_from_request')) {
    try {
      $id = (int)get_id_usuario_from_request($pdo, $src);
      if ($id > 0) return $id;
    } catch (Throwable $e) {}
  }

  return 0;
}

function presu_client_ip(): ?string {
  $candidates = [
    $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
    $_SERVER['HTTP_X_REAL_IP'] ?? null,
    $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
    $_SERVER['REMOTE_ADDR'] ?? null,
  ];

  foreach ($candidates as $v) {
    if (!is_string($v) || trim($v) === '') continue;
    $first = trim(explode(',', $v)[0]);
    if ($first !== '') return substr($first, 0, 45);
  }
  return null;
}

function presu_audit_items_resumen(array $items): array {
  $out = [];
  foreach ($items as $it) {
    if (!is_array($it)) continue;
    $out[] = [
      'id_detalle' => presu_pos_int($it['id_detalle'] ?? null),
      'id_stock_producto' => presu_pos_int($it['id_stock_producto'] ?? null),
      'descripcion' => presu_str($it['descripcion'] ?? $it['detalle'] ?? $it['producto_nombre'] ?? ''),
      'cantidad' => (float)($it['cantidad'] ?? 0),
      'precio' => (float)($it['precio'] ?? $it['precio_unitario'] ?? 0),
      'total' => (float)($it['total'] ?? 0),
    ];
  }
  return $out;
}

function presu_cliente_nombre(PDO $pdo, ?int $idCliente): string {
  if (!$idCliente || $idCliente <= 0) return '';
  try {
    $st = $pdo->prepare("SELECT COALESCE(nombre, '') FROM clientes WHERE id_cliente = :id LIMIT 1");
    $st->execute([':id' => $idCliente]);
    return trim((string)($st->fetchColumn() ?: ''));
  } catch (Throwable $e) {
    return '';
  }
}

function presu_auditar_directo(PDO $pdo, int $idUsuario, string $modulo, string $accion, ?string $entidad, $idEntidad, $detalle, array $src = []): bool {
  try {
    if ($idUsuario <= 0) return false;
    if (!presu_bool_table_exists($pdo, 'auditoria')) return false;

    $detalleArr = is_array($detalle) ? $detalle : ['detalle' => $detalle];
    if ($idEntidad !== null && $idEntidad !== '') {
      $detalleArr['id_entidad'] = is_numeric($idEntidad) ? (int)$idEntidad : $idEntidad;
    }

    $detalleJson = json_encode($detalleArr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($detalleJson === false) {
      $detalleJson = json_encode(['detalle' => 'No se pudo serializar el detalle de auditoría'], JSON_UNESCAPED_UNICODE);
    }

    $st = $pdo->prepare("
      INSERT INTO auditoria
        (idUsuarioMaster, idTenant, modulo, accion, entidad, detalle, ip, user_agent)
      VALUES
        (:idUsuarioMaster, :idTenant, :modulo, :accion, :entidad, :detalle, :ip, :user_agent)
    ");

    $idTenant = presu_resolver_tenant_auditoria($pdo, $src);
    $st->bindValue(':idUsuarioMaster', $idUsuario, PDO::PARAM_INT);
    if ($idTenant !== null && $idTenant > 0) {
      $st->bindValue(':idTenant', $idTenant, PDO::PARAM_INT);
    } else {
      $st->bindValue(':idTenant', null, PDO::PARAM_NULL);
    }
    $st->bindValue(':modulo', substr($modulo, 0, 50));
    $st->bindValue(':accion', substr($accion, 0, 50));
    $st->bindValue(':entidad', $entidad !== null ? substr($entidad, 0, 60) : null, $entidad !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
    $st->bindValue(':detalle', $detalleJson);
    $ip = presu_client_ip();
    $ua = isset($_SERVER['HTTP_USER_AGENT']) ? substr((string)$_SERVER['HTTP_USER_AGENT'], 0, 255) : null;
    $st->bindValue(':ip', $ip, $ip !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
    $st->bindValue(':user_agent', $ua, $ua !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
    $st->execute();
    return true;
  } catch (Throwable $e) {
    // La auditoría nunca debe romper la operación principal.
    return false;
  }
}

function presu_audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle, array $src = []): void {
  try {
    if ($idUsuario <= 0) {
      $idUsuario = presu_resolver_usuario_auditoria($pdo, $src);
    }

    if ($idUsuario <= 0) return;

    $modulo = 'presupuestos';
    $detalleArr = is_array($detalle) ? $detalle : ['detalle' => $detalle];
    $detalleArr['modulo_origen'] = 'documentos_comerciales/presupuestos';
    if ($idEntidad !== null && $idEntidad !== '') {
      $detalleArr['id_entidad'] = is_numeric($idEntidad) ? (int)$idEntidad : $idEntidad;
    }

    // Primero se inserta directo en auditoria para garantizar que el módulo
    // quede como "presupuestos" y no como "ventas". Si por alguna razón la
    // tabla no está disponible, recién ahí se intenta con el helper global.
    $registrado = presu_auditar_directo($pdo, $idUsuario, $modulo, $accion, $entidad, $idEntidad, $detalleArr, $src);

    if (!$registrado && function_exists('auditar')) {
      try {
        auditar($pdo, $idUsuario, $modulo, $accion, $entidad, $idEntidad, $detalleArr);
      } catch (Throwable $e) {}
    }
  } catch (Throwable $e) {
    // La auditoría nunca debe romper la operación principal.
  }
}

function presu_tipo_venta_cuenta_corriente(PDO $pdo): int {
  try {
    $st = $pdo->query("SELECT id_tipo_venta FROM tipos_venta WHERE activo = 1 AND UPPER(nombre) LIKE '%CUENTA%' ORDER BY id_tipo_venta ASC LIMIT 1");
    $id = (int)($st ? $st->fetchColumn() : 0);
    if ($id > 0) return $id;
  } catch (Throwable $e) {}
  return 2;
}

function presu_tipo_venta_nombre(PDO $pdo, ?int $idTipoVenta): string {
  if (!$idTipoVenta || $idTipoVenta <= 0) return '';
  try {
    $st = $pdo->prepare("SELECT COALESCE(nombre,'') FROM tipos_venta WHERE id_tipo_venta = :id LIMIT 1");
    $st->execute([':id' => $idTipoVenta]);
    return trim((string)($st->fetchColumn() ?: ''));
  } catch (Throwable $e) { return ''; }
}

function presu_tipo_venta_es_contado(string $nombre): bool {
  $n = mb_strtolower(trim($nombre), 'UTF-8');
  $n = str_replace(['á','é','í','ó','ú','ñ'], ['a','e','i','o','u','n'], $n);
  return strpos($n, 'contado') !== false || strpos($n, 'efectivo') !== false;
}


function presu_resumen_medio_pago_venta(array $mediosDetalle, ?int $idTipoVenta, string $medioLegacy = '', ?int $idCobro = null): string {
  $cantidad = count($mediosDetalle);
  $legacy = trim((string)$medioLegacy);
  $tipoVenta = $idTipoVenta ?? 0;
  $esCuentaCorriente = ((int)$tipoVenta === presu_tipo_venta_cuenta_corriente_id_cache());
  $cobrado = ((int)($idCobro ?? 0) > 0);

  if ($cantidad > 0) {
    $principal = trim((string)($mediosDetalle[0]['medio_pago_nombre'] ?? $mediosDetalle[0]['nombre_medio'] ?? ''));
    if ($principal === '') {
      $principal = ($legacy !== '' && strtoupper($legacy) !== 'CUENTA CORRIENTE') ? $legacy : 'CONTADO';
    }
    return $cantidad === 1 ? $principal : ($principal . ' +' . ($cantidad - 1));
  }

  if ($legacy !== '' && strtoupper($legacy) !== 'CUENTA CORRIENTE') return $legacy;
  if ($esCuentaCorriente && $cobrado) return 'Cuenta corriente pagada';
  if ($esCuentaCorriente) return 'Cuenta corriente pendiente';
  return $legacy !== '' ? $legacy : '—';
}

function presu_tipo_venta_cuenta_corriente_id_cache(): int {
  // En Balto el ID histórico de CUENTA CORRIENTE es 2. Esta función evita romper
  // el resumen si se llama fuera del contexto donde tenemos PDO disponible.
  return 2;
}

function presu_fetch_ventas_generadas_por_ids(PDO $pdo, array $idsVentas): array {
  $ids = [];
  foreach ($idsVentas as $id) {
    $n = (int)$id;
    if ($n > 0) $ids[$n] = $n;
  }
  if (!$ids) return [];

  $ids = array_values($ids);
  $ph = implode(',', array_fill(0, count($ids), '?'));

  $sql = "
    SELECT
      m.id_movimiento,
      m.fecha,
      m.id_tipo_operacion,
      m.id_tipo_venta,
      COALESCE(tv.nombre, '') AS tipo_venta_nombre,
      m.id_cliente,
      COALESCE(c.nombre, '') AS cliente,
      m.monto_total,
      m.id_medio_pago,
      COALESCE(mp.nombre, '') AS medio_pago_legacy_nombre,
      cbult.id_cobro AS recibo_id_cobro,
      cbult.id_medio_pago AS recibo_id_medio_pago,
      COALESCE(mp_cb.nombre, '') AS recibo_medio_pago_nombre,
      cbult.fecha_cobro AS recibo_fecha_cobro,
      cbult.monto AS recibo_monto
    FROM movimientos m
    LEFT JOIN tipos_venta tv ON tv.id_tipo_venta = m.id_tipo_venta
    LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
    LEFT JOIN medios_pago mp ON mp.id_medio_pago = m.id_medio_pago
    LEFT JOIN (
      SELECT c1.*
      FROM cobros c1
      INNER JOIN (
        SELECT id_movimiento, MAX(id_cobro) AS max_id_cobro
        FROM cobros
        GROUP BY id_movimiento
      ) c2 ON c2.id_movimiento = c1.id_movimiento AND c2.max_id_cobro = c1.id_cobro
    ) cbult ON cbult.id_movimiento = m.id_movimiento
    LEFT JOIN medios_pago mp_cb ON mp_cb.id_medio_pago = cbult.id_medio_pago
    WHERE m.id_movimiento IN ($ph)
  ";

  $st = $pdo->prepare($sql);
  foreach ($ids as $i => $id) $st->bindValue($i + 1, $id, PDO::PARAM_INT);
  $st->execute();

  $mediosPorVenta = function_exists('mv_medios_pago_listar_detalle_por_movimientos')
    ? mv_medios_pago_listar_detalle_por_movimientos($pdo, $ids)
    : [];

  $out = [];
  foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
    $idVenta = (int)($row['id_movimiento'] ?? 0);
    if ($idVenta <= 0) continue;

    $mediosDetalle = $mediosPorVenta[$idVenta] ?? [];
    $legacy = trim((string)($row['medio_pago_legacy_nombre'] ?? ''));
    if ($legacy === '' && !empty($row['recibo_medio_pago_nombre'])) {
      $legacy = trim((string)$row['recibo_medio_pago_nombre']);
    }

    $out[$idVenta] = [
      'id_movimiento' => $idVenta,
      'id_venta' => $idVenta,
      'fecha' => (string)($row['fecha'] ?? ''),
      'id_tipo_operacion' => isset($row['id_tipo_operacion']) ? (int)$row['id_tipo_operacion'] : null,
      'id_tipo_venta' => isset($row['id_tipo_venta']) ? (int)$row['id_tipo_venta'] : null,
      'tipo_venta_nombre' => (string)($row['tipo_venta_nombre'] ?? ''),
      'id_cliente' => isset($row['id_cliente']) ? (int)$row['id_cliente'] : null,
      'cliente' => (string)($row['cliente'] ?? ''),
      'monto_total' => (float)($row['monto_total'] ?? 0),
      'id_medio_pago' => isset($row['id_medio_pago']) && $row['id_medio_pago'] !== null ? (int)$row['id_medio_pago'] : null,
      'medio_pago_legacy_nombre' => (string)($row['medio_pago_legacy_nombre'] ?? ''),
      'medio_pago_nombre' => presu_resumen_medio_pago_venta(
        $mediosDetalle,
        isset($row['id_tipo_venta']) && $row['id_tipo_venta'] !== null ? (int)$row['id_tipo_venta'] : null,
        $legacy,
        isset($row['recibo_id_cobro']) && $row['recibo_id_cobro'] !== null ? (int)$row['recibo_id_cobro'] : 0
      ),
      'cantidad_medios_pago' => count($mediosDetalle),
      'medios_pago_detalle' => $mediosDetalle,
      'recibo_id_cobro' => isset($row['recibo_id_cobro']) && $row['recibo_id_cobro'] !== null ? (int)$row['recibo_id_cobro'] : null,
      'recibo_fecha_cobro' => (string)($row['recibo_fecha_cobro'] ?? ''),
      'recibo_monto' => isset($row['recibo_monto']) && $row['recibo_monto'] !== null ? (float)$row['recibo_monto'] : null,
    ];
  }

  return $out;
}

function presu_load_presupuesto(PDO $pdo, int $id, bool $forUpdate = false): array {
  $lock = $forUpdate ? ' FOR UPDATE' : '';
  $st = $pdo->prepare("
    SELECT m.*, c.nombre AS cliente
    FROM movimientos m
    INNER JOIN tipos_operacion t ON t.id_tipo_operacion = m.id_tipo_operacion
    LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
    WHERE m.id_movimiento = :id
      AND UPPER(t.nombre) = 'PRESUPUESTO'
    LIMIT 1{$lock}
  ");
  $st->execute([':id' => $id]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) fail('Documento comercial no encontrado.');
  return presu_attach_meta($pdo, $row);
}

function presu_fetch_items_por_movimientos(PDO $pdo, array $idsMovimientos): array {
  $ids = [];
  foreach ($idsMovimientos as $id) {
    $n = (int)$id;
    if ($n > 0) $ids[$n] = $n;
  }
  if (!$ids) return [];

  $ids = array_values($ids);
  $placeholders = implode(',', array_fill(0, count($ids), '?'));
  $stItems = $pdo->prepare("
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
      mi.created_at,
      COALESCE(d.nombre, sp.nombre, 'Producto / Servicio') AS descripcion,
      COALESCE(d.nombre, '') AS detalle_nombre,
      COALESCE(sp.nombre, '') AS stock_producto_nombre,
      COALESCE(sp.nombre, d.nombre, 'Producto / Servicio') AS producto_nombre,
      sp.sku AS codigo,
      sp.stock AS stock_actual
    FROM movimientos_items mi
    LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
    LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
    WHERE mi.id_movimiento IN ($placeholders)
    ORDER BY mi.id_movimiento ASC, mi.id_item ASC
  ");

  foreach ($ids as $i => $idMov) {
    $stItems->bindValue($i + 1, $idMov, PDO::PARAM_INT);
  }
  $stItems->execute();

  $out = [];
  $rows = $stItems->fetchAll(PDO::FETCH_ASSOC) ?: [];
  foreach ($rows as $row) {
    $idMov = (int)($row['id_movimiento'] ?? 0);
    if ($idMov <= 0) continue;
    if (!isset($out[$idMov])) $out[$idMov] = [];

    $out[$idMov][] = [
      'id_item'               => isset($row['id_item']) ? (int)$row['id_item'] : null,
      'id_movimiento'         => $idMov,
      'id_detalle'            => $row['id_detalle'] === null ? null : (int)$row['id_detalle'],
      'id_stock_producto'     => $row['id_stock_producto'] === null ? null : (int)$row['id_stock_producto'],
      'descripcion'           => (string)($row['descripcion'] ?? ''),
      'detalle_nombre'        => (string)($row['detalle_nombre'] ?? ''),
      'stock_producto_nombre' => (string)($row['stock_producto_nombre'] ?? ''),
      'producto_nombre'       => (string)($row['producto_nombre'] ?? ''),
      'codigo'                => (string)($row['codigo'] ?? ''),
      'stock_actual'          => $row['stock_actual'] === null ? null : (float)$row['stock_actual'],
      'cantidad'              => (float)($row['cantidad'] ?? 0),
      'precio'                => (float)($row['precio'] ?? 0),
      'precio_unitario'       => (float)($row['precio'] ?? 0),
      'iva_pct'               => (float)($row['iva_pct'] ?? 0),
      'subtotal'              => (float)($row['subtotal'] ?? 0),
      'iva_monto'             => (float)($row['iva_monto'] ?? 0),
      'total'                 => (float)($row['total'] ?? 0),
      'created_at'            => (string)($row['created_at'] ?? ''),
    ];
  }

  return $out;
}

function presu_fetch_items(PDO $pdo, int $idMovimiento): array {
  $items = presu_fetch_items_por_movimientos($pdo, [$idMovimiento]);
  return $items[$idMovimiento] ?? [];
}

function presu_stock_descontar_si_corresponde(PDO $pdo, ?int $idStockProducto, $cantidad): void {
  if (!$idStockProducto || $idStockProducto <= 0) return;
  $st = $pdo->prepare("
    SELECT id_stock_producto, nombre, stock
    FROM stock_productos
    WHERE id_stock_producto = :id
    LIMIT 1
    FOR UPDATE
  ");
  $st->execute([':id' => $idStockProducto]);
  $prod = $st->fetch(PDO::FETCH_ASSOC);
  if (!$prod) return;

  $cant = (float)$cantidad;
  if ($cant <= 0) fail('La cantidad para convertir el documento comercial debe ser mayor a 0.');
  $cantInt = (int)round($cant);
  if (abs($cant - $cantInt) > 0.00001) fail('La cantidad debe ser entera para impactar stock al convertir el documento comercial en venta.');

  if ($prod['stock'] !== null && (int)$prod['stock'] < $cantInt) {
    $nombre = trim((string)($prod['nombre'] ?? ('ID ' . $idStockProducto)));
    fail('Stock insuficiente para "' . $nombre . '". Disponible: ' . (int)$prod['stock'] . ', requerido: ' . $cantInt . '.');
  }

  $upd = $pdo->prepare("UPDATE stock_productos SET stock = COALESCE(stock, 0) - :cant WHERE id_stock_producto = :id LIMIT 1");
  $upd->execute([':cant' => $cantInt, ':id' => $idStockProducto]);
}

function presu_conversion_existente(PDO $pdo, int $idPresupuesto): ?array {
  if (!presu_conversion_table_available($pdo)) return null;

  $st = $pdo->prepare("
    SELECT pc.*
    FROM presupuestos_conversiones pc
    INNER JOIN movimientos p ON p.id_movimiento = pc.id_presupuesto
    INNER JOIN tipos_operacion tp
      ON tp.id_tipo_operacion = p.id_tipo_operacion
     AND UPPER(tp.nombre) = 'PRESUPUESTO'
    INNER JOIN movimientos v ON v.id_movimiento = pc.id_venta
    INNER JOIN tipos_operacion tv
      ON tv.id_tipo_operacion = v.id_tipo_operacion
     AND UPPER(tv.nombre) = 'VENTA'
    WHERE pc.id_presupuesto = :id
      AND pc.id_venta > 0
      AND pc.id_venta <> pc.id_presupuesto
      AND pc.fecha_conversion >= DATE_SUB(p.created_at, INTERVAL 2 MINUTE)
      AND v.created_at >= DATE_SUB(p.created_at, INTERVAL 2 MINUTE)
    LIMIT 1
  ");
  $st->execute([':id' => $idPresupuesto]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return $row ?: null;
}

function presu_registrar_conversion(PDO $pdo, int $idPresupuesto, int $idVenta): array {
  if ($idPresupuesto <= 0 || $idVenta <= 0) {
    throw new RuntimeException('Datos inválidos para registrar la conversión del documento comercial.');
  }

  // Si existía una conversión vieja/inválida con el mismo ID de presupuesto,
  // se limpia antes de registrar la conversión real hecha manualmente desde el modal.
  presu_limpiar_conversiones_de_presupuesto($pdo, $idPresupuesto);

  $st = $pdo->prepare("
    INSERT INTO presupuestos_conversiones
      (id_presupuesto, id_venta, estado, fecha_conversion, created_at)
    VALUES
      (:id_presupuesto, :id_venta, 'convertido', NOW(), NOW())
  ");
  $st->execute([
    ':id_presupuesto' => $idPresupuesto,
    ':id_venta' => $idVenta,
  ]);

  $conversion = presu_conversion_existente($pdo, $idPresupuesto);
  if (!$conversion || (int)($conversion['id_venta'] ?? 0) !== $idVenta) {
    throw new RuntimeException('La venta se creó, pero no se pudo registrar el historial de conversión del documento comercial.');
  }

  return $conversion;
}

function presu_tipo_documento_label(string $tipo): string {
  $t = strtoupper(trim($tipo));
  if ($t === 'PRESUPUESTO') return 'Documento comercial';
  if ($t === 'REMITO') return 'Remito';
  if ($t === 'VENTA_NO_FACTURADA') return 'Factura no emitida';
  if ($t === 'FACTURA') return 'Factura emitida';
  if ($t === 'NOTA_CREDITO') return 'Nota de crédito';
  if ($t === 'NOTA_DEBITO') return 'Nota de débito';
  return $tipo !== '' ? $tipo : 'Comprobante';
}

function presu_tipo_operacion_venta_id(PDO $pdo): int {
  try {
    $st = $pdo->prepare("SELECT id_tipo_operacion FROM tipos_operacion WHERE UPPER(nombre) = 'VENTA' LIMIT 1");
    $st->execute();
    $id = (int)($st->fetchColumn() ?: 0);
    if ($id > 0) return $id;
  } catch (Throwable $e) {}
  return 1;
}

function presu_tipo_operacion_id(PDO $pdo): int {
  $st = $pdo->prepare("SELECT id_tipo_operacion FROM tipos_operacion WHERE UPPER(nombre) = 'PRESUPUESTO' LIMIT 1");
  $st->execute();
  $id = (int)($st->fetchColumn() ?: 0);
  if ($id > 0) return $id;

  $ins = $pdo->prepare("INSERT INTO tipos_operacion (nombre, activo) VALUES ('PRESUPUESTO', 1)");
  $ins->execute();
  $newId = (int)$pdo->lastInsertId();
  if ($newId > 0) return $newId;

  $st2 = $pdo->prepare("SELECT id_tipo_operacion FROM tipos_operacion WHERE UPPER(nombre) = 'PRESUPUESTO' ORDER BY id_tipo_operacion DESC LIMIT 1");
  $st2->execute();
  $fallback = (int)($st2->fetchColumn() ?: 0);
  if ($fallback <= 0) fail('No se pudo crear el tipo de operación PRESUPUESTO.');
  return $fallback;
}

function presu_normalizar_fecha($v): ?string {
  $f = presu_str($v);
  if ($f === '') return null;

  if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $f, $m)) {
    $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
    return is_valid_fecha($out) ? $out : null;
  }

  if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $f, $m)) {
    $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
    return is_valid_fecha($out) ? $out : null;
  }

  return null;
}

function presu_require_fecha_modal($v, string $label): string {
  $fecha = presu_normalizar_fecha($v);
  if ($fecha === null) {
    fail('La fecha ' . $label . ' es obligatoria y debe venir desde el modal en formato AAAA-MM-DD. No se inventa fecha en el backend.');
  }
  if ($fecha > today_iso()) {
    fail('La fecha ' . $label . ' no puede ser posterior al día actual.');
  }
  return $fecha;
}

function presu_normalizar_items(array $items): array {
  $out = [];
  foreach ($items as $idx => $it) {
    if (!is_array($it)) continue;

    $descripcion = presu_str($it['descripcion'] ?? $it['detalle'] ?? $it['nombre'] ?? '');
    $cantidad = presu_num($it['cantidad'] ?? 0, 0);
    $precio = presu_num($it['precio'] ?? $it['precio_unitario'] ?? 0, 0);
    $ivaPct = presu_num($it['iva_pct'] ?? $it['ivaPct'] ?? 0, 0);

    if ($descripcion === '' && $cantidad <= 0 && $precio <= 0) continue;
    if ($descripcion === '') fail('Fila ' . ($idx + 1) . ': falta el detalle.');
    if ($cantidad <= 0) fail('Fila ' . ($idx + 1) . ': la cantidad debe ser mayor a 0.');
    if ($precio <= 0) fail('Fila ' . ($idx + 1) . ': el precio debe ser mayor a 0.');

    $subtotal = presu_num($it['subtotal'] ?? null, $cantidad * $precio);
    $ivaMonto = presu_num($it['iva_monto'] ?? null, $subtotal * $ivaPct / 100);
    $total = presu_num($it['total'] ?? null, $subtotal + $ivaMonto);

    $out[] = [
      'id_detalle'         => presu_pos_int($it['id_detalle'] ?? null),
      'id_stock_producto'  => presu_pos_int($it['id_stock_producto'] ?? null),
      'descripcion'        => $descripcion,
      'cantidad'           => $cantidad,
      'precio'             => $precio,
      'iva_pct'            => $ivaPct,
      'subtotal'           => $subtotal,
      'iva_monto'          => $ivaMonto,
      'total'              => $total,
    ];
  }

  if (!$out) fail('Agregá al menos un producto o servicio al documento comercial.');
  return $out;
}

function presupuestos_crear(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $fecha = presu_require_fecha_modal($body['fecha'] ?? null, 'del presupuesto');
  $idCliente = presu_pos_int($body['id_cliente'] ?? null);
  if (!$idCliente) fail('Seleccioná un cliente válido.');

  $items = presu_normalizar_items(is_array($body['items'] ?? null) ? $body['items'] : []);
  $metaPresupuesto = presu_normalizar_meta($body, $fecha);
  $totalItems = array_reduce($items, static fn($acc, $it) => $acc + (float)$it['total'], 0.0);
  $total = presu_num($body['monto_total'] ?? $body['total'] ?? null, $totalItems);
  if ($total <= 0) $total = $totalItems;

  $idUsuario = presu_resolver_usuario_auditoria($pdo, $body);

  presu_ensure_conversion_table($pdo);
  presu_ensure_meta_table($pdo);
  $pdo->beginTransaction();
  try {
    $idTipo = presu_tipo_operacion_id($pdo);

    $stMov = $pdo->prepare("\n      INSERT INTO movimientos\n        (fecha, id_tipo_operacion, id_clasificacion, id_tipo_venta, id_cliente, id_proveedor, monto_total, id_medio_pago)\n      VALUES\n        (:fecha, :id_tipo_operacion, NULL, NULL, :id_cliente, NULL, :monto_total, NULL)\n    ");
    $stMov->execute([
      ':fecha' => $fecha,
      ':id_tipo_operacion' => $idTipo,
      ':id_cliente' => $idCliente,
      ':monto_total' => $total,
    ]);

    $idMovimiento = (int)$pdo->lastInsertId();
    if ($idMovimiento <= 0) throw new RuntimeException('No se pudo obtener el ID del documento comercial.');

    // Un presupuesto recién creado jamás debe quedar marcado como convertido.
    // Esto protege contra registros viejos de presupuestos_conversiones que hayan quedado
    // apuntando al mismo ID después de pruebas, borrados o importaciones de datos.
    presu_limpiar_conversiones_de_presupuesto($pdo, $idMovimiento);
    presu_guardar_meta($pdo, $idMovimiento, $metaPresupuesto);

    $stItem = $pdo->prepare("\n      INSERT INTO movimientos_items\n        (id_movimiento, id_detalle, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)\n      VALUES\n        (:id_movimiento, :id_detalle, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)\n    ");

    foreach ($items as $it) {
      $stItem->execute([
        ':id_movimiento' => $idMovimiento,
        ':id_detalle' => $it['id_detalle'],
        ':id_stock_producto' => $it['id_stock_producto'],
        ':cantidad' => $it['cantidad'],
        ':precio' => $it['precio'],
        ':iva_pct' => $it['iva_pct'],
        ':subtotal' => $it['subtotal'],
        ':iva_monto' => $it['iva_monto'],
        ':total' => $it['total'],
      ]);
    }

    presu_audit_safe($pdo, $idUsuario, 'crear', 'presupuestos', $idMovimiento, [
      'accion_legible' => 'Agregar presupuesto',
      'tabla_base' => 'movimientos',
      'id_movimiento' => $idMovimiento,
      'fecha' => $fecha,
      'id_cliente' => $idCliente,
      'cliente' => presu_cliente_nombre($pdo, $idCliente),
      'monto_total' => $total,
      'cantidad_items' => count($items),
      'condiciones_presupuesto' => $metaPresupuesto,
      'items' => presu_audit_items_resumen($items),
    ], $body);

    if ($pdo->inTransaction()) {
      $pdo->commit();
    }

    ok([
      'mensaje' => 'Documento comercial creado correctamente.',
      'id_movimiento' => $idMovimiento,
      'ids_movimiento' => [$idMovimiento],
      'monto_total' => $total,
      'condiciones_presupuesto' => $metaPresupuesto,
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function presupuestos_listar(PDO $pdo): void {
  presu_conversion_table_available($pdo);
  try { presu_ensure_meta_table($pdo); } catch (Throwable $e) {}

  $desde = presu_str($_GET['fecha_desde'] ?? '');
  $hasta = presu_str($_GET['fecha_hasta'] ?? '');
  $q = presu_str($_GET['q'] ?? '');
  $limit = (int)($_GET['limit'] ?? 101);
  $offset = (int)($_GET['offset'] ?? 0);

  if ($limit <= 0) $limit = 101;
  if ($limit > 250) $limit = 250;
  if ($offset < 0) $offset = 0;

  $params = [];
  $where = "WHERE UPPER(t.nombre) = 'PRESUPUESTO'";

  if (is_valid_fecha($desde)) {
    $where .= " AND m.fecha >= :desde";
    $params[':desde'] = $desde;
  }

  if (is_valid_fecha($hasta)) {
    $where .= " AND m.fecha <= :hasta";
    $params[':hasta'] = $hasta;
  }

  if ($q !== '') {
    $where .= "
      AND (
        c.nombre LIKE :q
        OR CAST(m.id_movimiento AS CHAR) LIKE :q
        OR CAST(m.monto_total AS CHAR) LIKE :q
        OR EXISTS (
          SELECT 1
          FROM movimientos_items mix
          LEFT JOIN detalles dx ON dx.id_detalle = mix.id_detalle
          LEFT JOIN stock_productos spx ON spx.id_stock_producto = mix.id_stock_producto
          WHERE mix.id_movimiento = m.id_movimiento
            AND COALESCE(dx.nombre, spx.nombre, 'Producto / Servicio') LIKE :q
          LIMIT 1
        )
      )";
    $params[':q'] = '%' . $q . '%';
  }

  $conversionJoin = presu_conversion_valid_join_sql('conv');

  $sql = "
    SELECT
      m.id_movimiento,
      m.fecha,
      m.monto_total,
      m.created_at,
      m.id_cliente,
      c.nombre AS cliente,
      COALESCE(
        NULLIF(GROUP_CONCAT(DISTINCT COALESCE(d.nombre, sp.nombre, 'Producto / Servicio') ORDER BY mi.id_item SEPARATOR ', '), ''),
        'Documento comercial'
      ) AS detalle_original,
      COUNT(DISTINCT mi.id_item) AS cantidad_items,
      MAX(ca.id_comprobante) AS presupuesto_id_comprobante,
      SUBSTRING_INDEX(GROUP_CONCAT(ca.archivo_url ORDER BY ca.id_comprobante DESC SEPARATOR '||'), '||', 1) AS presupuesto_comprobante_url,
      SUBSTRING_INDEX(GROUP_CONCAT(ca.archivo_mime ORDER BY ca.id_comprobante DESC SEPARATOR '||'), '||', 1) AS presupuesto_comprobante_mime,
      SUBSTRING_INDEX(GROUP_CONCAT(ca.tipo ORDER BY ca.id_comprobante DESC SEPARATOR '||'), '||', 1) AS presupuesto_comprobante_tipo,
      CASE WHEN conv.id_venta IS NULL THEN 0 ELSE 1 END AS convertido_a_venta,
      conv.id_venta AS id_venta_generada,
      conv.fecha_conversion AS fecha_conversion
    FROM movimientos m
    INNER JOIN tipos_operacion t ON t.id_tipo_operacion = m.id_tipo_operacion
    LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
    LEFT JOIN movimientos_items mi ON mi.id_movimiento = m.id_movimiento
    LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
    LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
    LEFT JOIN movimientos_comprobantes mc ON mc.id_movimiento = m.id_movimiento
    LEFT JOIN comprobantes_archivos ca ON ca.id_comprobante = mc.id_comprobante AND UPPER(ca.tipo) = 'PRESUPUESTO'
    $conversionJoin
    $where
    GROUP BY
      m.id_movimiento,
      m.fecha,
      m.monto_total,
      m.created_at,
      m.id_cliente,
      c.nombre,
      conv.id_venta,
      conv.fecha_conversion
    ORDER BY m.fecha DESC, m.id_movimiento DESC
    LIMIT :limit OFFSET :offset
  ";

  $st = $pdo->prepare($sql);
  foreach ($params as $k => $v) $st->bindValue($k, $v);
  $st->bindValue(':limit', $limit, PDO::PARAM_INT);
  $st->bindValue(':offset', $offset, PDO::PARAM_INT);
  $st->execute();
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $idsMovimientos = [];
  foreach ($rows as $rowTmp) {
    $idTmp = (int)($rowTmp['id_movimiento'] ?? 0);
    if ($idTmp > 0) $idsMovimientos[] = $idTmp;
  }
  $itemsPorMovimiento = presu_fetch_items_por_movimientos($pdo, $idsMovimientos);
  $metaPorMovimiento = presu_fetch_meta_por_movimientos($pdo, $idsMovimientos);

  $idsVentasGeneradas = [];
  foreach ($rows as $rowTmp) {
    $idVentaTmp = (int)($rowTmp['id_venta_generada'] ?? 0);
    if ($idVentaTmp > 0) $idsVentasGeneradas[] = $idVentaTmp;
  }
  $ventasGeneradas = presu_fetch_ventas_generadas_por_ids($pdo, $idsVentasGeneradas);

  foreach ($rows as &$r) {
    $r['id_movimiento'] = (int)$r['id_movimiento'];
    $r['id_cliente'] = isset($r['id_cliente']) ? (int)$r['id_cliente'] : null;
    $metaPresupuestoRow = $metaPorMovimiento[(int)$r['id_movimiento']] ?? [];
    if ($metaPresupuestoRow) {
      $r = array_merge($r, $metaPresupuestoRow);
      $r['condiciones_presupuesto'] = $metaPresupuestoRow;
    }
    $r['monto_total'] = (float)($r['monto_total'] ?? 0);
    $itemsDetalle = $itemsPorMovimiento[(int)$r['id_movimiento']] ?? [];
    $r['cantidad_items'] = count($itemsDetalle) > 0 ? count($itemsDetalle) : (int)($r['cantidad_items'] ?? 0);
    $r['items_detalle'] = $itemsDetalle;
    $idVentaGenerada = (int)($r['id_venta_generada'] ?? 0);
    $ventaGenerada = $idVentaGenerada > 0 ? ($ventasGeneradas[$idVentaGenerada] ?? null) : null;
    $mediosVenta = is_array($ventaGenerada['medios_pago_detalle'] ?? null) ? $ventaGenerada['medios_pago_detalle'] : [];
    $r['venta_generada'] = $ventaGenerada;
    $r['venta_fecha'] = $ventaGenerada ? (string)($ventaGenerada['fecha'] ?? '') : '';
    $r['venta_id_tipo_venta'] = $ventaGenerada['id_tipo_venta'] ?? null;
    $r['venta_tipo_venta_nombre'] = $ventaGenerada ? (string)($ventaGenerada['tipo_venta_nombre'] ?? '') : '';
    $r['venta_medio_pago_nombre'] = $ventaGenerada ? (string)($ventaGenerada['medio_pago_nombre'] ?? '') : '';
    $r['venta_cantidad_medios_pago'] = count($mediosVenta);
    $r['venta_medios_pago_detalle'] = $mediosVenta;
    $r['cantidad_medios_pago'] = count($mediosVenta);
    $r['medios_pago_detalle'] = $mediosVenta;
    $r['medio_pago_nombre'] = $ventaGenerada ? (string)($ventaGenerada['medio_pago_nombre'] ?? '—') : '—';
    $r['tipo_operacion_nombre'] = 'PRESUPUESTO';
    $r['detalle_original'] = (string)($r['detalle_original'] ?? '');
    $r['detalle'] = presu_items_label($r['cantidad_items']);
    $r['presupuesto_id_comprobante'] = isset($r['presupuesto_id_comprobante']) ? (int)$r['presupuesto_id_comprobante'] : null;
    $r['convertido_a_venta'] = (int)($r['convertido_a_venta'] ?? 0);
    $r['id_venta_generada'] = isset($r['id_venta_generada']) ? (int)$r['id_venta_generada'] : null;
  }
  unset($r);

  ok([
    'presupuestos' => $rows,
    'movimientos' => $rows,
    'limit' => $limit,
    'offset' => $offset,
    'has_more' => count($rows) >= $limit,
  ]);
}


function presupuestos_live_token(PDO $pdo): void {
  presu_conversion_table_available($pdo);
  try { presu_ensure_meta_table($pdo); } catch (Throwable $e) {}

  $desde = presu_str($_GET['fecha_desde'] ?? '');
  $hasta = presu_str($_GET['fecha_hasta'] ?? '');
  $q = presu_str($_GET['q'] ?? '');

  $params = [];
  $where = "WHERE UPPER(t.nombre) = 'PRESUPUESTO'";

  if (is_valid_fecha($desde)) {
    $where .= " AND m.fecha >= :desde";
    $params[':desde'] = $desde;
  }

  if (is_valid_fecha($hasta)) {
    $where .= " AND m.fecha <= :hasta";
    $params[':hasta'] = $hasta;
  }

  if ($q !== '') {
    $where .= "
      AND (
        c.nombre LIKE :q
        OR CAST(m.id_movimiento AS CHAR) LIKE :q
        OR CAST(m.monto_total AS CHAR) LIKE :q
        OR EXISTS (
          SELECT 1
          FROM movimientos_items mix
          LEFT JOIN detalles dx ON dx.id_detalle = mix.id_detalle
          LEFT JOIN stock_productos spx ON spx.id_stock_producto = mix.id_stock_producto
          WHERE mix.id_movimiento = m.id_movimiento
            AND COALESCE(dx.nombre, spx.nombre, 'Producto / Servicio') LIKE :q
          LIMIT 1
        )
      )";
    $params[':q'] = '%' . $q . '%';
  }

  $conversionJoin = presu_conversion_valid_join_sql('conv');

  $sql = "
    SELECT
      COUNT(DISTINCT m.id_movimiento) AS total,
      COALESCE(MAX(m.id_movimiento), 0) AS max_id,
      COALESCE(MAX(m.created_at), '') AS max_created,
      COALESCE(MAX(conv.fecha_conversion), '') AS max_conversion,
      COALESCE(MAX(pm.updated_at), '') AS max_meta
    FROM movimientos m
    INNER JOIN tipos_operacion t ON t.id_tipo_operacion = m.id_tipo_operacion
    LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
    LEFT JOIN presupuestos_meta pm ON pm.id_movimiento = m.id_movimiento
    $conversionJoin
    $where
  ";

  $st = $pdo->prepare($sql);
  $st->execute($params);
  $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
  $token = sha1(json_encode([
    'total' => (int)($row['total'] ?? 0),
    'max_id' => (int)($row['max_id'] ?? 0),
    'max_created' => (string)($row['max_created'] ?? ''),
    'max_conversion' => (string)($row['max_conversion'] ?? ''),
    'max_meta' => (string)($row['max_meta'] ?? ''),
  ], JSON_UNESCAPED_UNICODE));

  ok(['token' => $token, 'resumen' => $row]);
}


function presupuestos_obtener(PDO $pdo): void {
  $id = presu_pos_int($_GET['id_movimiento'] ?? $_GET['id'] ?? null);
  if (!$id) fail('Falta id_movimiento.');

  $mov = presu_load_presupuesto($pdo, $id, false);
  $items = presu_fetch_items($pdo, $id);
  $conversion = presu_conversion_existente($pdo, $id);
  $ventaGenerada = null;
  $mediosVenta = [];

  $idVenta = (int)($conversion['id_venta'] ?? 0);
  if ($idVenta > 0) {
    $ventas = presu_fetch_ventas_generadas_por_ids($pdo, [$idVenta]);
    $ventaGenerada = $ventas[$idVenta] ?? null;
    $mediosVenta = is_array($ventaGenerada['medios_pago_detalle'] ?? null) ? $ventaGenerada['medios_pago_detalle'] : [];
  }

  ok([
    'presupuesto' => $mov,
    'items' => $items,
    'condiciones_presupuesto' => $mov['condiciones_presupuesto'] ?? null,
    'conversion' => $conversion,
    'venta_generada' => $ventaGenerada,
    'venta' => $ventaGenerada,
    'cantidad_medios_pago' => count($mediosVenta),
    'medios_pago_detalle' => $mediosVenta,
    'medio_pago_nombre' => $ventaGenerada ? (string)($ventaGenerada['medio_pago_nombre'] ?? '—') : '—',
  ]);
}

function presupuestos_documentos_cliente(PDO $pdo): void {
  presu_conversion_table_available($pdo);

  $idCliente = presu_pos_int($_GET['id_cliente'] ?? $_GET['id'] ?? null);
  if (!$idCliente) fail('Falta id_cliente.');

  $tiposPermitidos = ['PRESUPUESTO'];
  $in = implode(',', array_fill(0, count($tiposPermitidos), '?'));

  $conversionJoin = presu_conversion_valid_join_sql('conv');

  $sql = "
    SELECT
      ca.id_comprobante,
      ca.tipo,
      ca.emitido_en_arca,
      ca.archivo_url,
      ca.archivo_mime,
      ca.archivo_size,
      ca.created_at,
      MIN(m.id_movimiento) AS id_movimiento,
      MAX(m.fecha) AS fecha,
      MAX(COALESCE(m.monto_total, 0)) AS monto_total,
      m.id_cliente,
      c.nombre AS cliente,
      GROUP_CONCAT(DISTINCT COALESCE(d.nombre, sp.nombre, 'Producto / Servicio') ORDER BY mi.id_item SEPARATOR ', ') AS detalle_original,
      COUNT(DISTINCT mi.id_item) AS cantidad_items,
      CASE WHEN conv.id_venta IS NULL THEN 0 ELSE 1 END AS convertido_a_venta,
      conv.id_venta AS id_venta_generada,
      conv.fecha_conversion AS fecha_conversion
    FROM movimientos m
    INNER JOIN movimientos_comprobantes mc ON mc.id_movimiento = m.id_movimiento
    INNER JOIN comprobantes_archivos ca ON ca.id_comprobante = mc.id_comprobante
    LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
    LEFT JOIN movimientos_items mi ON mi.id_movimiento = m.id_movimiento
    LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
    LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
    $conversionJoin
    WHERE m.id_cliente = ?
      AND UPPER(ca.tipo) IN ($in)
    GROUP BY
      ca.id_comprobante,
      ca.tipo,
      ca.emitido_en_arca,
      ca.archivo_url,
      ca.archivo_mime,
      ca.archivo_size,
      ca.created_at,
      m.id_cliente,
      c.nombre,
      conv.id_venta,
      conv.fecha_conversion
    ORDER BY ca.created_at DESC, ca.id_comprobante DESC
    LIMIT 300
  ";

  $st = $pdo->prepare($sql);
  $params = array_merge([$idCliente], $tiposPermitidos);
  $st->execute($params);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $idsMovimientos = [];
  foreach ($rows as $rowTmp) {
    $idTmp = (int)($rowTmp['id_movimiento'] ?? 0);
    if ($idTmp > 0) $idsMovimientos[] = $idTmp;
  }
  $itemsPorMovimiento = presu_fetch_items_por_movimientos($pdo, $idsMovimientos);

  $idsVentasGeneradas = [];
  foreach ($rows as $rowTmp) {
    $idVentaTmp = (int)($rowTmp['id_venta_generada'] ?? 0);
    if ($idVentaTmp > 0) $idsVentasGeneradas[] = $idVentaTmp;
  }
  $ventasGeneradas = presu_fetch_ventas_generadas_por_ids($pdo, $idsVentasGeneradas);

  foreach ($rows as &$r) {
    $r['id_comprobante'] = (int)($r['id_comprobante'] ?? 0);
    $r['id_movimiento'] = (int)($r['id_movimiento'] ?? 0);
    $r['id_cliente'] = (int)($r['id_cliente'] ?? 0);
    $r['monto_total'] = (float)($r['monto_total'] ?? 0);
    $itemsDetalle = $itemsPorMovimiento[(int)$r['id_movimiento']] ?? [];
    $r['cantidad_items'] = count($itemsDetalle) > 0 ? count($itemsDetalle) : (int)($r['cantidad_items'] ?? 0);
    $r['items_detalle'] = $itemsDetalle;
    $idVentaGenerada = (int)($r['id_venta_generada'] ?? 0);
    $ventaGenerada = $idVentaGenerada > 0 ? ($ventasGeneradas[$idVentaGenerada] ?? null) : null;
    $mediosVenta = is_array($ventaGenerada['medios_pago_detalle'] ?? null) ? $ventaGenerada['medios_pago_detalle'] : [];
    $r['venta_generada'] = $ventaGenerada;
    $r['venta_fecha'] = $ventaGenerada ? (string)($ventaGenerada['fecha'] ?? '') : '';
    $r['venta_id_tipo_venta'] = $ventaGenerada['id_tipo_venta'] ?? null;
    $r['venta_tipo_venta_nombre'] = $ventaGenerada ? (string)($ventaGenerada['tipo_venta_nombre'] ?? '') : '';
    $r['venta_medio_pago_nombre'] = $ventaGenerada ? (string)($ventaGenerada['medio_pago_nombre'] ?? '') : '';
    $r['venta_cantidad_medios_pago'] = count($mediosVenta);
    $r['venta_medios_pago_detalle'] = $mediosVenta;
    $r['cantidad_medios_pago'] = count($mediosVenta);
    $r['medios_pago_detalle'] = $mediosVenta;
    $r['medio_pago_nombre'] = $ventaGenerada ? (string)($ventaGenerada['medio_pago_nombre'] ?? '—') : '—';
    $r['convertido_a_venta'] = (int)($r['convertido_a_venta'] ?? 0);
    $r['id_venta_generada'] = isset($r['id_venta_generada']) ? (int)$r['id_venta_generada'] : null;
    $r['tipo_operacion_nombre'] = 'PRESUPUESTO';
    $r['detalle_original'] = (string)($r['detalle_original'] ?? '');
    $r['detalle'] = presu_items_label($r['cantidad_items']);
    $r['emitido_en_arca'] = (int)($r['emitido_en_arca'] ?? 0);
    $r['documento_label'] = presu_tipo_documento_label((string)($r['tipo'] ?? ''));
  }
  unset($r);

  ok([
    'documentos' => $rows,
    'cantidad' => count($rows),
    'id_cliente' => $idCliente,
  ]);
}


function presupuestos_convertir_venta(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $idPresupuesto = presu_pos_int($body['id_presupuesto'] ?? $body['id_movimiento'] ?? null);
  if (!$idPresupuesto) fail('Falta id_presupuesto.');

  $fechaVenta = presu_require_fecha_modal($body['fecha'] ?? null, 'de la venta asignada desde presupuesto');
  $idTipoVenta = presu_pos_int($body['id_tipo_venta'] ?? null) ?: presu_tipo_venta_cuenta_corriente($pdo);
  $idMedioPagoLegacy = presu_pos_int($body['id_medio_pago'] ?? null);
  $idUsuario = presu_resolver_usuario_auditoria($pdo, $body);
  $mediosPagoRaw = is_array($body['medios_pago'] ?? null) ? $body['medios_pago'] : [];

  presu_ensure_conversion_table($pdo);
  $pdo->beginTransaction();
  try {

    $presu = presu_load_presupuesto($pdo, $idPresupuesto, true);
    $idCliente = presu_pos_int($presu['id_cliente'] ?? null);
    if (!$idCliente) fail('El documento comercial no tiene cliente válido.');

    $conversionPrevia = presu_conversion_existente($pdo, $idPresupuesto);
    if ($conversionPrevia && (int)($conversionPrevia['id_venta'] ?? 0) > 0) {
      fail('Este documento comercial ya fue asignado como venta.', 200, [
        'id_venta' => (int)$conversionPrevia['id_venta'],
        'ya_convertido' => true,
      ]);
    }

    $items = presu_fetch_items($pdo, $idPresupuesto);
    if (!$items) fail('El documento comercial no tiene items para convertir.');

    $tipoVentaNombre = presu_tipo_venta_nombre($pdo, $idTipoVenta);
    $esContado = presu_tipo_venta_es_contado($tipoVentaNombre);

    $total = (float)($presu['monto_total'] ?? 0);
    if ($total <= 0) foreach ($items as $it) $total += (float)($it['total'] ?? 0);

    $mediosValidados = [];
    $planPago = ['id_medio_pago' => null, 'rows' => []];

    if ($esContado) {
      if (empty($mediosPagoRaw) && $idMedioPagoLegacy && $idMedioPagoLegacy > 0) {
        $mediosPagoRaw = [[
          'id_medio_pago' => $idMedioPagoLegacy,
          'monto' => $total,
        ]];
      }

      if (!function_exists('ventas_validar_medios_pago_multi')) {
        fail('No está disponible la validación de medios de pago de ventas.');
      }

      $mediosValidados = ventas_validar_medios_pago_multi($pdo, $mediosPagoRaw, $total);
      $planPago = ventas_payment_storage_plan($mediosValidados, $idMedioPagoLegacy);
    }

    $idTipoOperacionVenta = presu_tipo_operacion_venta_id($pdo);

    foreach ($items as $it) {
      presu_stock_descontar_si_corresponde($pdo, presu_pos_int($it['id_stock_producto'] ?? null), $it['cantidad'] ?? 0);
    }

    $stMov = $pdo->prepare("
      INSERT INTO movimientos
        (fecha, id_tipo_operacion, id_clasificacion, id_tipo_venta, id_cliente, id_proveedor, monto_total, id_medio_pago)
      VALUES
        (:fecha, :id_tipo_operacion, NULL, :id_tipo_venta, :id_cliente, NULL, :monto_total, :id_medio_pago)
    ");
    $stMov->execute([
      ':fecha' => $fechaVenta,
      ':id_tipo_operacion' => $idTipoOperacionVenta,
      ':id_tipo_venta' => $idTipoVenta,
      ':id_cliente' => $idCliente,
      ':monto_total' => $total,
      ':id_medio_pago' => $planPago['id_medio_pago'],
    ]);
    $idVenta = (int)$pdo->lastInsertId();
    if ($idVenta <= 0) throw new RuntimeException('No se pudo obtener el ID de la venta creada.');

    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");
    foreach ($items as $it) {
      $insItem->execute([
        ':id_movimiento' => $idVenta,
        ':id_detalle' => presu_pos_int($it['id_detalle'] ?? null),
        ':id_stock_producto' => presu_pos_int($it['id_stock_producto'] ?? null),
        ':cantidad' => (float)($it['cantidad'] ?? 0),
        ':precio' => (float)($it['precio'] ?? 0),
        ':iva_pct' => (float)($it['iva_pct'] ?? 0),
        ':subtotal' => (float)($it['subtotal'] ?? 0),
        ':iva_monto' => (float)($it['iva_monto'] ?? 0),
        ':total' => (float)($it['total'] ?? 0),
      ]);
    }

    $mediosPersistidos = $planPago['rows'];
    $chequesCreados = [];

    if ($esContado && !empty($mediosValidados)) {
      $persistCheques = ventas_persistir_cheques_desde_medios($pdo, $idVenta, $mediosValidados);
      $chequesCreados = $persistCheques['cheques_creados'] ?? [];

      if (!empty($mediosPersistidos)) {
        foreach ($mediosPersistidos as $idx => $mp) {
          if (!empty($mediosPersistidos[$idx]['id_cheque'])) continue;

          $uid = (string)($mp['frontend_row_uid'] ?? '');
          if (isset($persistCheques['mapa_ids_cheque_por_index'][$idx])) {
            $mediosPersistidos[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque_por_index'][$idx];
            continue;
          }
          if ($uid !== '' && isset($persistCheques['mapa_ids_cheque'][$uid])) {
            $mediosPersistidos[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque'][$uid];
          }
        }
        ventas_insertar_medios_pago_multi($pdo, $idVenta, $mediosPersistidos);
      }
    }

    $conversionCreada = presu_registrar_conversion($pdo, $idPresupuesto, $idVenta);
    $ventasGeneradas = presu_fetch_ventas_generadas_por_ids($pdo, [$idVenta]);
    $ventaGenerada = $ventasGeneradas[$idVenta] ?? null;

    presu_audit_safe($pdo, $idUsuario, 'asignar_como_venta', 'presupuestos', $idPresupuesto, [
      'accion_legible' => 'Asignar presupuesto como venta',
      'tabla_base' => 'movimientos',
      'id_presupuesto' => $idPresupuesto,
      'id_venta' => $idVenta,
      'id_movimiento_venta' => $idVenta,
      'id_cliente' => $idCliente,
      'cliente' => presu_cliente_nombre($pdo, $idCliente),
      'monto_total' => $total,
      'cantidad_items' => count($items),
      'items' => presu_audit_items_resumen($items),
      'id_tipo_venta' => $idTipoVenta,
      'tipo_venta_nombre' => $tipoVentaNombre,
      'medios_pago' => $mediosPersistidos,
      'cheques_creados' => $chequesCreados,
      'conversion' => $conversionCreada,
      'venta_generada' => $ventaGenerada,
    ], $body);

    if ($pdo->inTransaction()) {
      $pdo->commit();
    }

    ok([
      'mensaje' => 'Documento comercial guardado como venta correctamente.',
      'id_presupuesto' => $idPresupuesto,
      'id_venta' => $idVenta,
      'id_movimiento' => $idVenta,
      'id_movimiento_venta' => $idVenta,
      'ids' => [$idVenta],
      'ids_movimiento' => [$idVenta],
      'ids_movimientos' => [$idVenta],
      'monto_total' => $total,
      'id_medio_pago' => $planPago['id_medio_pago'],
      'id_tipo_venta' => $idTipoVenta,
      'tipo_venta_nombre' => $tipoVentaNombre,
      'medios_pago' => $mediosPersistidos,
      'cheques_creados' => $chequesCreados,
      'conversion' => $conversionCreada,
      'venta_generada' => $ventaGenerada,
      'venta' => $ventaGenerada,
      'medio_pago_nombre' => $ventaGenerada ? (string)($ventaGenerada['medio_pago_nombre'] ?? '—') : '—',
      'cantidad_medios_pago' => is_array($ventaGenerada['medios_pago_detalle'] ?? null) ? count($ventaGenerada['medios_pago_detalle']) : 0,
      'medios_pago_detalle' => is_array($ventaGenerada['medios_pago_detalle'] ?? null) ? $ventaGenerada['medios_pago_detalle'] : [],
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}

function presupuestos_eliminar(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);
  $body = read_json_body();
  $id = presu_pos_int($body['id_movimiento'] ?? $_POST['id_movimiento'] ?? null);
  if (!$id) fail('Falta id_movimiento.');

  $st = $pdo->prepare("\n    SELECT
      m.id_movimiento,
      m.fecha,
      m.id_cliente,
      COALESCE(c.nombre, '') AS cliente,
      m.monto_total,
      m.created_at
    FROM movimientos m
    INNER JOIN tipos_operacion t ON t.id_tipo_operacion = m.id_tipo_operacion
    LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
    WHERE m.id_movimiento = :id
      AND UPPER(t.nombre) = 'PRESUPUESTO'
    LIMIT 1
  " );
  $st->execute([':id' => $id]);
  $presupuestoAntes = $st->fetch(PDO::FETCH_ASSOC);
  if (!$presupuestoAntes) fail('El movimiento no corresponde a un documento comercial.');

  $itemsAntes = presu_fetch_items($pdo, $id);
  $conversion = presu_conversion_existente($pdo, $id);
  if ($conversion && (int)($conversion['id_venta'] ?? 0) > 0) {
    fail('No se puede eliminar: este documento comercial ya fue asignado como venta.');
  }

  $idUsuario = presu_resolver_usuario_auditoria($pdo, $body);
  $pdo->beginTransaction();
  try {
    $pdo->prepare("DELETE FROM movimientos_comprobantes WHERE id_movimiento = :id")->execute([':id' => $id]);
    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id")->execute([':id' => $id]);
    $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id")->execute([':id' => $id]);

    presu_audit_safe($pdo, $idUsuario, 'eliminar', 'presupuestos', $id, [
      'accion_legible' => 'Eliminar presupuesto',
      'tabla_base' => 'movimientos',
      'id_movimiento' => $id,
      'fecha' => (string)($presupuestoAntes['fecha'] ?? ''),
      'id_cliente' => isset($presupuestoAntes['id_cliente']) ? (int)$presupuestoAntes['id_cliente'] : null,
      'cliente' => (string)($presupuestoAntes['cliente'] ?? ''),
      'monto_total' => (float)($presupuestoAntes['monto_total'] ?? 0),
      'cantidad_items' => count($itemsAntes),
      'items' => presu_audit_items_resumen($itemsAntes),
    ], $body);
    if ($pdo->inTransaction()) {
      $pdo->commit();
    }

    ok(['mensaje' => 'Documento comercial eliminado correctamente.', 'id_movimiento' => $id]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
  }
}
