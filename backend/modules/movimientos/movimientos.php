<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

require_once __DIR__ . '/core/shared_db.php';
require_once __DIR__ . '/../tiendanube/sync/fechas.php';
require_once __DIR__ . '/core/plan_saas.php';
require_once __DIR__ . '/global/medios_pago.php';

/**
 * ✅ ACCIONES:
 * - movimientos_listar (GET)
 * - movimientos_live_token (GET)
 * - movimientos_crear (POST JSON)
 * - movimientos_crear_batch (POST JSON)
 * - movimientos_actualizar (POST JSON)
 * - movimientos_eliminar (POST JSON)
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por routes/api.php
 */

if (!headers_sent()) {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Este módulo debe ejecutarse vía routes/api.php.'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Response helpers
========================= */
function ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}

function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge([
    'exito' => false,
    'mensaje' => $msg
  ], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Helpers
========================= */
function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') return [];
  $j = json_decode($raw, true);
  if (!is_array($j)) {
    if (trim($raw) === '') return [];
    fail('JSON inválido en body.');
  }
  return $j;
}

function require_post(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido. Usá POST.', 200);
  }
}

function as_int($v, int $default = 0): int {
  if ($v === null || $v === '' || $v === false) return $default;
  if (is_int($v)) return $v;
  if (is_string($v)) $v = trim($v);
  if ($v === '' || !is_numeric($v)) return $default;
  return (int)$v;
}

function as_int_or_null($v): ?int {
  if ($v === null || $v === '' || $v === false) return null;
  if (is_string($v) && trim($v) === '') return null;
  if (!is_numeric($v)) return null;
  $n = (int)$v;
  return ($n > 0) ? $n : null;
}

function as_dec($v, int $scale = 2): float {
  if ($v === null || $v === '' || $v === false) return 0.0;

  if (is_string($v)) {
    $s = str_replace(' ', '', trim($v));
    if ($s === '') return 0.0;

    if (preg_match('/^\d{1,3}(\.\d{3})*(,\d+)?$/', $s)) {
      $s = str_replace('.', '', $s);
      $s = str_replace(',', '.', $s);
    } elseif (preg_match('/^\d{1,3}(,\d{3})*(\.\d+)?$/', $s)) {
      $s = str_replace(',', '', $s);
    } elseif (substr_count($s, ',') === 1 && substr_count($s, '.') === 0) {
      $s = str_replace(',', '.', $s);
    }

    $v = $s;
  }

  $n = (float)$v;
  $p = pow(10, $scale);
  return round($n * $p) / $p;
}

function as_date_or_null($v): ?string {
  $s = trim((string)$v);
  if ($s === '') return null;
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
}

function isValidDate(string $d): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $d);
}

function load_movimiento_or_fail(PDO $pdo, int $id_movimiento): array {
  $st = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $st->execute([':id' => $id_movimiento]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) fail('Movimiento no encontrado.');
  return $row;
}


function mvx_medio_pago_nombre_by_id(PDO $pdo, ?int $idMedioPago): string {
  if ($idMedioPago === null || $idMedioPago <= 0) return '';
  $st = $pdo->prepare("SELECT COALESCE(nombre,'') AS nombre FROM medios_pago WHERE id_medio_pago = :id LIMIT 1");
  $st->execute([':id' => $idMedioPago]);
  return (string)($st->fetchColumn() ?: '');
}

function mvx_validar_medio_pago_por_plan(PDO $pdo, ?int $idMedioPago): void {
  if ($idMedioPago === null || $idMedioPago <= 0) return;
  $nombre = mvx_medio_pago_nombre_by_id($pdo, $idMedioPago);
  if (mv_plan_saas_medio_pago_bloqueado($nombre)) {
    fail(mv_plan_saas_error_medio_pago_bloqueado(), 403);
  }
}

/**
 * Devuelve la etiqueta final de operación según reglas del negocio:
 * - 1 + tipo_venta=2 => RECIBO
 * - 1 + tipo_venta!=2 => VENTA
 * - 2 + tipo_venta=2 => ORDEN DE PAGO
 * - 2 + tipo_venta!=2 => COMPRA
 * - 3 => OTROS INGRESOS
 * - 4 => OTROS EGRESOS
 */
function sql_operacion_case(string $mAlias = 'm'): string {
  return "
    CASE
      WHEN {$mAlias}.id_tipo_operacion = 1 AND COALESCE({$mAlias}.id_tipo_venta, 0) = 2 THEN 'RECIBO'
      WHEN {$mAlias}.id_tipo_operacion = 1 THEN 'VENTA'
      WHEN {$mAlias}.id_tipo_operacion = 2 AND COALESCE({$mAlias}.id_tipo_venta, 0) = 2 THEN 'ORDEN DE PAGO'
      WHEN {$mAlias}.id_tipo_operacion = 2 THEN 'COMPRA'
      WHEN {$mAlias}.id_tipo_operacion = 3 THEN 'OTROS INGRESOS'
      WHEN {$mAlias}.id_tipo_operacion = 4 THEN 'OTROS EGRESOS'
      ELSE COALESCE(top.nombre, '')
    END
  ";
}

/**
 * Si el movimiento corresponde a un depósito de cheque/echeq:
 * - m.id_tipo_operacion = 4
 * - mc_dep.id_movimiento = m.id_movimiento
 *
 * Entonces:
 * - detalle    => DEPÓSITO CHEQUE N° xxx / DEPÓSITO ECHEQ N° xxx
 * - tercero    => emisor
 * - medio pago => CHEQUE / ECHEQ
 */
function sql_detalle_final_expr(string $mAlias = 'm', string $detalleAlias = 'sp', string $chequeAlias = 'mc_dep'): string {
  return "
    CASE
      WHEN {$mAlias}.id_tipo_operacion = 4 AND {$chequeAlias}.id_cheque IS NOT NULL
        THEN CONCAT(
          'DEPOSITADO EN BANCO - ',
          UPPER(COALESCE({$chequeAlias}.tipo, 'CHEQUE')),
          CASE
            WHEN COALESCE({$chequeAlias}.numero_cheque, '') <> ''
              THEN CONCAT(' N° ', COALESCE({$chequeAlias}.numero_cheque, ''))
            ELSE ''
          END
        )
      ELSE COALESCE({$detalleAlias}.nombre, '')
    END
  ";
}

function sql_tercero_final_expr(string $mAlias = 'm', string $clienteAlias = 'cl', string $proveedorAlias = 'pr', string $chequeAlias = 'mc_dep'): string {
  return "
    CASE
      WHEN {$mAlias}.id_tipo_operacion = 4 AND {$chequeAlias}.id_cheque IS NOT NULL
        THEN COALESCE({$chequeAlias}.emisor, '')
      ELSE
        CASE
          WHEN {$mAlias}.id_cliente IS NOT NULL THEN COALESCE({$clienteAlias}.nombre, '')
          WHEN {$mAlias}.id_proveedor IS NOT NULL THEN COALESCE({$proveedorAlias}.nombre, '')
          ELSE ''
        END
    END
  ";
}

function sql_medio_pago_final_expr(string $mAlias = 'm', string $medioAlias = 'mp', string $chequeAlias = 'mc_dep'): string {
  return "
    CASE
      WHEN {$mAlias}.id_tipo_operacion = 4 AND {$chequeAlias}.id_cheque IS NOT NULL
        THEN UPPER(COALESCE({$chequeAlias}.tipo, 'CHEQUE'))
      ELSE COALESCE({$medioAlias}.nombre, '')
    END
  ";
}

function sql_cheque_deposito_id_expr(PDO $pdo, string $mAlias = 'm'): string {
  /**
   * IMPORTANTE:
   * Un OTRO EGRESO puede usar un cheque/eCheq como medio de pago y eso NO lo convierte
   * en "depositado en banco". Para evitar falsos positivos, solo se considera depósito
   * bancario cuando existe un evento explícito de depósito en movimientos_cheques_flujo.
   */
  if (!mvx_table_exists($pdo, 'movimientos_cheques_flujo')) {
    return 'NULL';
  }

  return "
    (
      SELECT f_dep.id_cheque
      FROM movimientos_cheques_flujo f_dep
      WHERE f_dep.id_movimiento = {$mAlias}.id_movimiento
        AND f_dep.id_cheque IS NOT NULL
        AND UPPER(COALESCE(f_dep.evento, '')) IN (
          'DEPOSITADO_BANCO',
          'DEPOSITO',
          'DEPOSITO_BANCO',
          'DEPOSITADO_EN_BANCO'
        )
      ORDER BY f_dep.id_flujo DESC
      LIMIT 1
    )
  ";
}


function sql_cheque_deposito_fecha_expr(PDO $pdo, string $mAlias = 'm'): string {
  /**
   * Fecha operativa real del depósito bancario de cheque/eCheq.
   *
   * Hubo casos donde el movimiento quedó con m.fecha distinto a la fecha real
   * del evento DEPOSITADO_BANCO. Para listados, filtros y token en vivo se usa
   * la fecha del flujo cuando existe; para movimientos normales queda m.fecha.
   */
  if (!mvx_table_exists($pdo, 'movimientos_cheques_flujo')) {
    return 'NULL';
  }

  return "
    (
      SELECT f_dep.fecha_evento
      FROM movimientos_cheques_flujo f_dep
      WHERE f_dep.id_movimiento = {$mAlias}.id_movimiento
        AND f_dep.id_cheque IS NOT NULL
        AND UPPER(COALESCE(f_dep.evento, '')) IN (
          'DEPOSITADO_BANCO',
          'DEPOSITO',
          'DEPOSITO_BANCO',
          'DEPOSITADO_EN_BANCO'
        )
      ORDER BY f_dep.id_flujo DESC
      LIMIT 1
    )
  ";
}

/* =========================================================
   HELPERS MEDIOS DE PAGO MÚLTIPLES
========================================================= */
function mvx_table_exists(PDO $pdo, string $table): bool {
  static $cache = [];
  if (isset($cache[$table])) return $cache[$table];
  $st = $pdo->prepare("
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = :table
    LIMIT 1
  ");
  $st->execute([':table' => $table]);
  $cache[$table] = ((int)$st->fetchColumn() > 0);
  return $cache[$table];
}

function mvx_pick_first_existing_col(PDO $pdo, string $table, array $cols): ?string {
  static $cache = [];
  $key = $table . '|' . implode(',', $cols);
  if (isset($cache[$key])) return $cache[$key];

  $st = $pdo->prepare("
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = :table
      AND COLUMN_NAME IN (" . implode(',', array_fill(0, count($cols), '?')) . ")
    LIMIT 1
  ");
  $params = array_merge([$table], $cols);
  $st->execute($params);
  $col = $st->fetchColumn() ?: null;
  // Try to honor preference order
  if ($col) {
    foreach ($cols as $preferred) {
      // re-check which one SQL returned; just return it
    }
  }
  $cache[$key] = $col;
  return $col;
}

function mvx_guess_medios_pago_pk(PDO $pdo): ?string {
  if (!mvx_table_exists($pdo, 'movimientos_medios_pago')) return null;
  $candidates = [
    'id_movimiento_medio_pago',
    'id_compra_medio_pago',
    'id_movimientos_medio_pago',
    'id',
  ];
  // Query information_schema for the first matching column
  $placeholders = implode(',', array_fill(0, count($candidates), '?'));
  $st = $pdo->prepare("
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'movimientos_medios_pago'
      AND COLUMN_NAME IN ($placeholders)
    ORDER BY ORDINAL_POSITION
    LIMIT 1
  ");
  $st->execute($candidates);
  return $st->fetchColumn() ?: null;
}

/**
 * Retorna un mapa [ id_movimiento => [ [...medio1], [...medio2], ... ] ]
 * consultando movimientos_medios_pago.
 * Si la tabla no existe, devuelve [].
 */
function mvx_listar_medios_pago_por_movimientos(PDO $pdo, array $idsMovimientos): array {
  $idsMovimientos = array_values(array_unique(array_filter(array_map('intval', $idsMovimientos))));
  if (!$idsMovimientos || !mvx_table_exists($pdo, 'movimientos_medios_pago')) return [];

  $pk       = mvx_guess_medios_pago_pk($pdo);
  $orderCol = $pk ? "cmp.`{$pk}`" : "cmp.id_movimiento";
  $chequeDescripcionExpr = mvx_table_exists($pdo, 'movimientos_cheques_flujo')
    ? "COALESCE((
        SELECT f_desc.descripcion
        FROM movimientos_cheques_flujo f_desc
        WHERE f_desc.id_cheque = ch.id_cheque
          AND f_desc.id_movimiento = cmp.id_movimiento
          AND COALESCE(f_desc.descripcion, '') <> ''
        ORDER BY
          CASE UPPER(COALESCE(f_desc.evento, ''))
            WHEN 'INGRESO_CARTERA' THEN 1
            WHEN 'EGRESO_CARTERA' THEN 2
            WHEN 'DEPOSITADO_BANCO' THEN 3
            ELSE 9
          END,
          f_desc.id_flujo DESC
        LIMIT 1
      ), '')"
    : "''";

  $placeholders = implode(',', array_fill(0, count($idsMovimientos), '?'));
  $sql = "
    SELECT
      " . ($pk ? "cmp.`{$pk}`" : "0") . " AS id_movimiento_medio_pago,
      cmp.id_movimiento,
      cmp.id_medio_pago,
      cmp.monto,
      ch.id_cheque,
      cmp.cheque_tipo,
      COALESCE(mp.nombre, '') AS medio_pago_nombre,
      COALESCE(ch.tipo, cmp.cheque_tipo, '') AS cheque_tipo_real,
      COALESCE(ch.numero_cheque, '') AS numero_cheque,
      COALESCE(ch.emisor, '') AS emisor,
      COALESCE(DATE_FORMAT(ch.fecha_emision, '%Y-%m-%d'), '') AS fecha_emision,
      COALESCE(DATE_FORMAT(ch.fecha_pago, '%Y-%m-%d'), '') AS fecha_pago,
      COALESCE(ch.importe, 0) AS cheque_importe,
      {$chequeDescripcionExpr} AS cheque_descripcion
    FROM movimientos_medios_pago cmp
    LEFT JOIN medios_pago mp ON mp.id_medio_pago = cmp.id_medio_pago
    LEFT JOIN movimientos_cheques ch
      ON ch.id_cheque = COALESCE(
        cmp.id_cheque,
        (
          SELECT chx.id_cheque
          FROM movimientos_cheques chx
          WHERE chx.id_movimiento = cmp.id_movimiento
            AND (
              COALESCE(cmp.cheque_tipo, '') <> ''
              OR UPPER(COALESCE(mp.nombre, '')) LIKE '%CHEQUE%'
              OR UPPER(COALESCE(mp.nombre, '')) LIKE '%ECHEQ%'
            )
            AND (
              COALESCE(cmp.cheque_tipo, '') = ''
              OR LOWER(COALESCE(chx.tipo, '')) = LOWER(COALESCE(cmp.cheque_tipo, ''))
            )
            AND ABS(COALESCE(chx.importe, 0) - COALESCE(cmp.monto, 0)) < 0.01
          ORDER BY chx.id_cheque ASC
          LIMIT 1
        )
      )
    WHERE cmp.id_movimiento IN ($placeholders)
    ORDER BY cmp.id_movimiento ASC, {$orderCol} ASC
  ";

  $st = $pdo->prepare($sql);
  foreach ($idsMovimientos as $i => $idMov) {
    $st->bindValue($i + 1, $idMov, PDO::PARAM_INT);
  }
  $st->execute();
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $out = [];
  foreach ($rows as $r) {
    $idMov = (int)($r['id_movimiento'] ?? 0);
    if ($idMov <= 0) continue;
    if (!isset($out[$idMov])) $out[$idMov] = [];
    $out[$idMov][] = [
      'id_movimiento_medio_pago' => (int)($r['id_movimiento_medio_pago'] ?? 0),
      'id_movimiento'            => $idMov,
      'id_medio_pago'            => (int)($r['id_medio_pago'] ?? 0),
      'medio_pago_nombre'        => (string)($r['medio_pago_nombre'] ?? ''),
      'monto'                    => (float)($r['monto'] ?? 0),
      'id_cheque'                => ($r['id_cheque'] === null || $r['id_cheque'] === '') ? null : (int)$r['id_cheque'],
      'cheque_tipo'              => (string)($r['cheque_tipo_real'] ?? $r['cheque_tipo'] ?? ''),
      'tipo_cheque'              => (string)($r['cheque_tipo_real'] ?? $r['cheque_tipo'] ?? ''),
      'numero_cheque'            => (string)($r['numero_cheque'] ?? ''),
      'emisor'                   => (string)($r['emisor'] ?? ''),
      'fecha_emision'            => (string)($r['fecha_emision'] ?? ''),
      'fecha_pago'               => (string)($r['fecha_pago'] ?? ''),
      'cheque_importe'           => (float)($r['cheque_importe'] ?? 0),
      'cheque_descripcion'       => trim((string)($r['cheque_descripcion'] ?? '')),
      'descripcion'              => trim((string)($r['cheque_descripcion'] ?? '')),
      'observaciones'            => trim((string)($r['cheque_descripcion'] ?? '')),
      'nombre_medio'             => (string)($r['medio_pago_nombre'] ?? ''),
      'cheque'                   => (!empty($r['id_cheque']) || trim((string)($r['numero_cheque'] ?? '')) !== '') ? [
        'id_cheque'      => ($r['id_cheque'] === null || $r['id_cheque'] === '') ? null : (int)$r['id_cheque'],
        'tipo'           => (string)($r['cheque_tipo_real'] ?? $r['cheque_tipo'] ?? ''),
        'tipo_cheque'    => (string)($r['cheque_tipo_real'] ?? $r['cheque_tipo'] ?? ''),
        'cheque_tipo'    => (string)($r['cheque_tipo_real'] ?? $r['cheque_tipo'] ?? ''),
        'numero_cheque'  => (string)($r['numero_cheque'] ?? ''),
        'emisor'         => (string)($r['emisor'] ?? ''),
        'fecha_emision'  => (string)($r['fecha_emision'] ?? ''),
        'fecha_pago'     => (string)($r['fecha_pago'] ?? ''),
        'importe'        => (float)($r['cheque_importe'] ?? 0),
        'descripcion'    => trim((string)($r['cheque_descripcion'] ?? '')),
        'observaciones'  => trim((string)($r['cheque_descripcion'] ?? '')),
      ] : null,
    ];
  }
  return $out;
}

/**
 * Dado el array de medios detallados de UN movimiento y el nombre legacy (del JOIN simple),
 * devuelve una etiqueta resumida: "EFECTIVO" si hay 1, "EFECTIVO +2" si hay 3, etc.
 */
function mvx_medio_pago_resumen(array $mediosDetalle, string $legacy = ''): string {
  $cantidad = count($mediosDetalle);
  if ($cantidad <= 0) return $legacy;

  $principal = trim((string)($mediosDetalle[0]['medio_pago_nombre'] ?? ''));
  if ($principal === '') $principal = $legacy !== '' ? $legacy : 'CONTADO';

  if ($cantidad === 1) return $principal;
  return $principal . ' +' . ($cantidad - 1);
}


if (!function_exists('mvx_items_label')) {
  function mvx_items_label(array $itemsDetalle): string {
    $cantidad = count($itemsDetalle);
    if ($cantidad <= 0) return 'SIN PRODUCTOS';
    if ($cantidad === 1) return '1 PRODUCTO';
    return $cantidad . ' PRODUCTOS';
  }
}


if (!function_exists('mvx_deposito_cheque_label')) {
  function mvx_deposito_cheque_label(?string $tipoCheque): string {
    $tipo = strtoupper(trim((string)$tipoCheque));
    $tipo = str_replace(['-', '_'], ' ', $tipo);

    if (strpos($tipo, 'ECHEQ') !== false || strpos($tipo, 'E CHEQ') !== false) {
      return 'ECHEQ DEPOSITADO';
    }

    return 'CHEQUE DEPOSITADO';
  }
}

if (!function_exists('mvx_deposito_cheque_item')) {
  function mvx_deposito_cheque_item(array $row, string $label, float $importe): array {
    return [
      'id_item'               => null,
      'id_movimiento'         => isset($row['id_movimiento']) ? (int)$row['id_movimiento'] : null,
      'id_detalle'            => null,
      'id_stock_producto'     => null,
      'producto_nombre'       => $label,
      'stock_producto_nombre' => $label,
      'detalle_nombre'        => $label,
      'detalle'               => $label,
      'descripcion'           => $label,
      'cantidad'              => 1,
      'precio'                => $importe,
      'iva_pct'               => 0,
      'subtotal'              => $importe,
      'iva_monto'             => 0,
      'total'                 => $importe,
    ];
  }
}

if (!function_exists('mvx_deposito_cheque_medio_pago')) {
  function mvx_deposito_cheque_medio_pago(array $row, string $tipoCheque, float $importe): array {
    $tipoLower = strtolower(trim($tipoCheque !== '' ? $tipoCheque : 'cheque'));
    return [
      'id_movimiento_medio_pago' => 0,
      'id_movimiento'            => isset($row['id_movimiento']) ? (int)$row['id_movimiento'] : null,
      'id_medio_pago'            => isset($row['id_medio_pago']) && $row['id_medio_pago'] !== null ? (int)$row['id_medio_pago'] : null,
      'medio_pago_nombre'        => strtoupper($tipoLower),
      'nombre_medio'             => strtoupper($tipoLower),
      'medio_pago'               => strtoupper($tipoLower),
      'monto'                    => $importe,
      'id_cheque'                => !empty($row['cheque_id']) ? (int)$row['cheque_id'] : null,
      'cheque_tipo'              => $tipoLower,
      'tipo_cheque'              => $tipoLower,
      'numero_cheque'            => (string)($row['cheque_numero'] ?? ''),
      'emisor'                   => (string)($row['cheque_emisor'] ?? ''),
      'fecha_emision'            => (string)($row['cheque_fecha_emision'] ?? ''),
      'fecha_pago'               => (string)($row['cheque_fecha_pago'] ?? ''),
      'cheque_importe'           => $importe,
      'cheque_descripcion'       => trim((string)($row['cheque_descripcion'] ?? '')),
      'descripcion'              => trim((string)($row['cheque_descripcion'] ?? '')),
      'observaciones'            => trim((string)($row['cheque_descripcion'] ?? '')),
      'cheque'                   => [
        'id_cheque'      => !empty($row['cheque_id']) ? (int)$row['cheque_id'] : null,
        'tipo'           => $tipoLower,
        'tipo_cheque'    => $tipoLower,
        'cheque_tipo'    => $tipoLower,
        'numero_cheque'  => (string)($row['cheque_numero'] ?? ''),
        'emisor'         => (string)($row['cheque_emisor'] ?? ''),
        'fecha_emision'  => (string)($row['cheque_fecha_emision'] ?? ''),
        'fecha_pago'     => (string)($row['cheque_fecha_pago'] ?? ''),
        'importe'        => $importe,
        'descripcion'    => trim((string)($row['cheque_descripcion'] ?? '')),
        'observaciones'  => trim((string)($row['cheque_descripcion'] ?? '')),
      ],
    ];
  }
}

if (!function_exists('mvx_listar_items_detalle_por_movimientos')) {
  function mvx_listar_items_detalle_por_movimientos(PDO $pdo, array $idsMovimientos): array {
    $idsMovimientos = array_values(array_unique(array_filter(array_map('intval', $idsMovimientos))));
    if (!$idsMovimientos || !mvx_table_exists($pdo, 'movimientos_items')) return [];

    $ph = implode(',', array_fill(0, count($idsMovimientos), '?'));
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
        COALESCE(d.nombre, '')  AS detalle_nombre,
        COALESCE(sp.nombre, d.nombre, '') AS producto_nombre
      FROM movimientos_items mi
      LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
      LEFT JOIN detalles d         ON d.id_detalle         = mi.id_detalle
      WHERE mi.id_movimiento IN ($ph)
      ORDER BY mi.id_movimiento ASC, mi.id_item ASC
    ";

    $st = $pdo->prepare($sql);
    foreach ($idsMovimientos as $i => $idMov) {
      $st->bindValue($i + 1, $idMov, PDO::PARAM_INT);
    }
    $st->execute();

    $out = [];
    foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
      $idMov = (int)($row['id_movimiento'] ?? 0);
      if ($idMov <= 0) continue;
      if (!isset($out[$idMov])) $out[$idMov] = [];

      $out[$idMov][] = [
        'id_item'               => isset($row['id_item']) ? (int)$row['id_item'] : null,
        'id_movimiento'         => $idMov,
        'id_detalle'            => $row['id_detalle'] === null ? null : (int)$row['id_detalle'],
        'id_stock_producto'     => $row['id_stock_producto'] === null ? null : (int)$row['id_stock_producto'],
        'producto_nombre'       => (string)($row['producto_nombre'] ?? ''),
        'stock_producto_nombre' => (string)($row['stock_producto_nombre'] ?? ''),
        'detalle_nombre'        => (string)($row['detalle_nombre'] ?? ''),
        'cantidad'              => (float)($row['cantidad'] ?? 0),
        'precio'                => (float)($row['precio'] ?? 0),
        'iva_pct'               => (float)($row['iva_pct'] ?? 0),
        'subtotal'              => (float)($row['subtotal'] ?? 0),
        'iva_monto'             => (float)($row['iva_monto'] ?? 0),
        'total'                 => (float)($row['total'] ?? 0),
      ];
    }

    return $out;
  }
}

function build_where_q_fast(PDO $pdo, string $q, array &$params): string {
  $q = trim($q);
  if ($q === '') return '';

  if (preg_match('/^\d+$/', $q)) {
    $params[':qid'] = (int)$q;
    return " AND m.id_movimiento = :qid ";
  }

  $like = '%' . $q . '%';
  $params[':q_id'] = $like;
  $params[':q_op'] = $like;
  $params[':q_c']  = $like;
  $params[':q_tv'] = $like;
  $params[':q_cl'] = $like;
  $params[':q_pr'] = $like;
  $params[':q_mp'] = $like;
  $params[':q_d']  = $like;
  $params[':q_ch_emisor'] = $like;
  $params[':q_ch_num']    = $like;
  $params[':q_ch_tipo']   = $like;

  $operacionExpr = sql_operacion_case('m');
  $detalleExpr   = sql_detalle_final_expr('m', 'fiq', 'mc_dep');
  $terceroExpr   = sql_tercero_final_expr('m', 'cl', 'pr', 'mc_dep');
  $medioExpr     = sql_medio_pago_final_expr('m', 'mp', 'mc_dep');
  $chequeIdExpr  = sql_cheque_deposito_id_expr($pdo, 'm');

  $mediosSearchSql = '';
  if (mvx_table_exists($pdo, 'movimientos_medios_pago') && mvx_table_exists($pdo, 'movimientos_cheques')) {
    $mediosSearchSql = "
      OR EXISTS (
        SELECT 1
        FROM movimientos_medios_pago mmpq
        LEFT JOIN medios_pago mpq ON mpq.id_medio_pago = mmpq.id_medio_pago
        LEFT JOIN movimientos_cheques chq
          ON chq.id_cheque = COALESCE(
            mmpq.id_cheque,
            (
              SELECT chx.id_cheque
              FROM movimientos_cheques chx
              WHERE chx.id_movimiento = mmpq.id_movimiento
                AND (
                  COALESCE(mmpq.cheque_tipo, '') <> ''
                  OR UPPER(COALESCE(mpq.nombre, '')) LIKE '%CHEQUE%'
                  OR UPPER(COALESCE(mpq.nombre, '')) LIKE '%ECHEQ%'
                )
                AND (
                  COALESCE(mmpq.cheque_tipo, '') = ''
                  OR LOWER(COALESCE(chx.tipo, '')) = LOWER(COALESCE(mmpq.cheque_tipo, ''))
                )
                AND ABS(COALESCE(chx.importe, 0) - COALESCE(mmpq.monto, 0)) < 0.01
              ORDER BY chx.id_cheque ASC
              LIMIT 1
            )
          )
        WHERE mmpq.id_movimiento = m.id_movimiento
          AND (
            COALESCE(mpq.nombre, '') LIKE :q_mp
            OR COALESCE(CAST(mmpq.monto AS CHAR), '') LIKE :q_mp
            OR COALESCE(chq.emisor, '') LIKE :q_ch_emisor
            OR COALESCE(chq.numero_cheque, '') LIKE :q_ch_num
            OR UPPER(COALESCE(chq.tipo, '')) LIKE UPPER(:q_ch_tipo)
          )
      )
    ";
  }

  return "
    AND (
      CAST(m.id_movimiento AS CHAR) LIKE :q_id OR
      {$operacionExpr} LIKE :q_op OR
      COALESCE(c.nombre,'') LIKE :q_c OR
      COALESCE(tv.nombre,'') LIKE :q_tv OR
      {$terceroExpr} LIKE :q_cl OR
      {$medioExpr} LIKE :q_mp OR
      {$detalleExpr} LIKE :q_d OR
      COALESCE(mc_dep.emisor,'') LIKE :q_ch_emisor OR
      COALESCE(mc_dep.numero_cheque,'') LIKE :q_ch_num OR
      UPPER(COALESCE(mc_dep.tipo,'')) LIKE UPPER(:q_ch_tipo)
      {$mediosSearchSql}
    )
  ";
}

/* =========================================================
   TOKEN EN VIVO (GET)
========================================================= */
function movimientos_live_token(PDO $pdo): void {
  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
  $q          = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
  $limit      = as_int($_GET['limit'] ?? 100, 100);

  if ($limit < 1) $limit = 1;
  if ($limit > 300) $limit = 300;

  if ($fechaDesde === '' || $fechaHasta === '') {
    fail('Se requieren "fecha_desde" y "fecha_hasta".');
  }

  if (!isValidDate($fechaDesde)) {
    fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, [
      'recibido' => $fechaDesde
    ]);
  }

  if (!isValidDate($fechaHasta)) {
    fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, [
      'recibido' => $fechaHasta
    ]);
  }

  if ($fechaDesde > $fechaHasta) {
    [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
  }

  $chequeFechaDepositoExpr = sql_cheque_deposito_fecha_expr($pdo, 'm');
  $fechaOperativaExpr = "COALESCE({$chequeFechaDepositoExpr}, m.fecha)";
  $whereRange = " AND {$fechaOperativaExpr} BETWEEN :fecha_desde AND :fecha_hasta ";
  $params = [
    ':fecha_desde' => $fechaDesde,
    ':fecha_hasta' => $fechaHasta,
    ':limit'       => $limit,
  ];

  $whereQ = build_where_q_fast($pdo, $q, $params);
  $operacionExpr = sql_operacion_case('m');
  $detalleExpr   = sql_detalle_final_expr('m', 'fiq', 'mc_dep');
  $terceroExpr   = sql_tercero_final_expr('m', 'cl', 'pr', 'mc_dep');
  $medioExpr     = sql_medio_pago_final_expr('m', 'mp', 'mc_dep');

  try {
    if (function_exists('mv_tn_reparar_fechas_desde_sync')) {
      mv_tn_reparar_fechas_desde_sync($pdo);
    }

    $sql = "
      SELECT
        m.id_movimiento,
        {$fechaOperativaExpr} AS fecha,
        {$operacionExpr} AS operacion,
        m.id_tipo_operacion,
        m.id_clasificacion,
        m.id_tipo_venta,
        m.id_cliente,
        m.id_proveedor,
        m.id_medio_pago,
        COALESCE(m.monto_total, 0) AS monto_total,
        COALESCE(c.nombre, '')  AS clasificacion,
        COALESCE(tv.nombre, '') AS tipo_venta,
        {$terceroExpr}          AS tercero,
        {$detalleExpr}          AS detalle,
        {$medioExpr}            AS medio_pago_nombre,
        COALESCE(m.created_at, '') AS created_at
      FROM movimientos m
        LEFT JOIN tipos_operacion top ON top.id_tipo_operacion = m.id_tipo_operacion
        LEFT JOIN clasificaciones c   ON c.id_clasificacion = m.id_clasificacion
        LEFT JOIN tipos_venta tv      ON tv.id_tipo_venta = m.id_tipo_venta
        LEFT JOIN clientes cl         ON cl.id_cliente = m.id_cliente
        LEFT JOIN proveedores pr      ON pr.id_proveedor = m.id_proveedor
        LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
        LEFT JOIN (
          SELECT miq.id_movimiento,
                 COALESCE(spq.nombre, dq.nombre, '') AS nombre
          FROM movimientos_items miq
          INNER JOIN (
            SELECT id_movimiento, MIN(id_item) AS min_id_item
            FROM movimientos_items
            GROUP BY id_movimiento
          ) qx ON qx.id_movimiento = miq.id_movimiento AND qx.min_id_item = miq.id_item
          LEFT JOIN stock_productos spq ON spq.id_stock_producto = miq.id_stock_producto
          LEFT JOIN detalles dq ON dq.id_detalle = miq.id_detalle
        ) fiq ON fiq.id_movimiento = m.id_movimiento
        LEFT JOIN movimientos_cheques mc_dep
          ON mc_dep.id_cheque = {$chequeIdExpr}
         AND m.id_tipo_operacion = 4
      WHERE 1=1
        $whereRange
        $whereQ
      ORDER BY {$fechaOperativaExpr} DESC, COALESCE(m.created_at, CONCAT(m.fecha, ' 00:00:00')) DESC, m.id_movimiento DESC
      LIMIT :limit
    ";

    $stmt = $pdo->prepare($sql);

    foreach ($params as $k => $v) {
      if ($k === ':limit' || $k === ':qid') {
        $stmt->bindValue($k, (int)$v, PDO::PARAM_INT);
      } else {
        $stmt->bindValue($k, $v);
      }
    }

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Enriquecer medio_pago_nombre con medios múltiples si existen
    $idsMovs = array_map(fn($r) => (int)$r['id_movimiento'], $rows);
    $mediosPagoMulti = function_exists('mv_medios_pago_listar_detalle_por_movimientos')
      ? mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovs)
      : mvx_listar_medios_pago_por_movimientos($pdo, $idsMovs);
    foreach ($rows as &$row) {
      $idMov = (int)$row['id_movimiento'];
      $esDep = (int)($row['id_tipo_operacion'] ?? 0) === 4;
      if (!$esDep && !empty($mediosPagoMulti[$idMov])) {
        $row['medio_pago_nombre'] = mvx_medio_pago_resumen(
          $mediosPagoMulti[$idMov],
          (string)($row['medio_pago_nombre'] ?? '')
        );
      }
    }
    unset($row);

    $payload = [
      'fecha_desde' => $fechaDesde,
      'fecha_hasta' => $fechaHasta,
      'q'           => $q,
      'limit'       => $limit,
      'rows'        => $rows,
    ];

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
      throw new RuntimeException('No se pudo serializar el token.');
    }

    $token = hash('sha256', $json);

    ok([
      'live_token' => $token,
      'count'      => count($rows),
      'limit'      => $limit,
    ]);
  } catch (Throwable $e) {
    fail('No se pudo calcular el token en vivo. ' . $e->getMessage());
  }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action === '') fail('Falta parámetro action.');

/* =========================================================
   LISTAR MOVIMIENTOS (GET)
========================================================= */
function movimientos_listar(PDO $pdo): void {
  $fechaDesde   = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta   = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
  $q            = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
  $limit        = as_int($_GET['limit'] ?? 300, 300);
  $offset       = as_int($_GET['offset'] ?? 0, 0);
  $includeTotal = as_int($_GET['include_total'] ?? ($_GET['include_count'] ?? 1), 1) === 1;

  if ($limit < 1) $limit = 1;
  if ($limit > 1000) $limit = 1000;
  if ($offset < 0) $offset = 0;

  if ($fechaDesde === '' || $fechaHasta === '') {
    fail('Se requieren "fecha_desde" y "fecha_hasta".');
  }

  if (!isValidDate($fechaDesde)) {
    fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, [
      'recibido' => $fechaDesde
    ]);
  }

  if (!isValidDate($fechaHasta)) {
    fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, [
      'recibido' => $fechaHasta
    ]);
  }

  if ($fechaDesde > $fechaHasta) {
    [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
  }

  $whereRange = " AND m.fecha BETWEEN :fecha_desde AND :fecha_hasta ";
  $rangeParams = [
    ':fecha_desde' => $fechaDesde,
    ':fecha_hasta' => $fechaHasta,
  ];

  try {
    if (function_exists('mv_tn_reparar_fechas_desde_sync')) {
      mv_tn_reparar_fechas_desde_sync($pdo);
    }

    $total_count = null;
    $chequeIdExpr  = sql_cheque_deposito_id_expr($pdo, 'm');
    $chequeFechaDepositoExpr = sql_cheque_deposito_fecha_expr($pdo, 'm');
    $fechaOperativaExpr = "COALESCE({$chequeFechaDepositoExpr}, m.fecha)";
    $whereRange = " AND {$fechaOperativaExpr} BETWEEN :fecha_desde AND :fecha_hasta ";
    $chequeDescripcionDepExpr = mvx_table_exists($pdo, 'movimientos_cheques_flujo')
      ? "COALESCE((
          SELECT f_desc.descripcion
          FROM movimientos_cheques_flujo f_desc
          WHERE f_desc.id_cheque = mc_dep.id_cheque
            AND f_desc.id_movimiento = m.id_movimiento
            AND COALESCE(f_desc.descripcion, '') <> ''
          ORDER BY
            CASE UPPER(COALESCE(f_desc.evento, ''))
              WHEN 'DEPOSITADO_BANCO' THEN 1
              WHEN 'EGRESO_CARTERA' THEN 2
              WHEN 'INGRESO_CARTERA' THEN 3
              ELSE 9
            END,
            f_desc.id_flujo DESC
          LIMIT 1
        ), '')"
      : "''";

    if ($includeTotal) {
      $paramsCount = $rangeParams;
      $whereQ = build_where_q_fast($pdo, $q, $paramsCount);

      $stCount = $pdo->prepare("
        SELECT COUNT(*)
        FROM movimientos m
          LEFT JOIN tipos_operacion top ON top.id_tipo_operacion = m.id_tipo_operacion
          LEFT JOIN clasificaciones c   ON c.id_clasificacion = m.id_clasificacion
          LEFT JOIN tipos_venta tv      ON tv.id_tipo_venta = m.id_tipo_venta
          LEFT JOIN clientes cl         ON cl.id_cliente = m.id_cliente
          LEFT JOIN proveedores pr      ON pr.id_proveedor = m.id_proveedor
          LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
          LEFT JOIN (
            SELECT miq.id_movimiento,
                   COALESCE(spq.nombre, dq.nombre, '') AS nombre
            FROM movimientos_items miq
            INNER JOIN (
              SELECT id_movimiento, MIN(id_item) AS min_id_item
              FROM movimientos_items
              GROUP BY id_movimiento
            ) qx ON qx.id_movimiento = miq.id_movimiento AND qx.min_id_item = miq.id_item
            LEFT JOIN stock_productos spq ON spq.id_stock_producto = miq.id_stock_producto
            LEFT JOIN detalles dq ON dq.id_detalle = miq.id_detalle
          ) fiq ON fiq.id_movimiento = m.id_movimiento
          LEFT JOIN movimientos_cheques mc_dep
            ON mc_dep.id_cheque = {$chequeIdExpr}
           AND m.id_tipo_operacion = 4
        WHERE 1=1 $whereRange $whereQ
      ");

      foreach ($paramsCount as $k => $v) {
        $stCount->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
      }

      $stCount->execute();
      $total_count = (int)($stCount->fetchColumn() ?: 0);
    }

    $limitPlus  = $limit + 1;
    $paramsList = array_merge($rangeParams, [
      ':limitPlus' => (int)$limitPlus,
      ':offset'    => (int)$offset,
    ]);

    $whereQ2 = build_where_q_fast($pdo, $q, $paramsList);
    $operacionExpr = sql_operacion_case('m');

    $sql = "
      WITH mov AS (
        SELECT
          m.id_movimiento,
          {$fechaOperativaExpr} AS fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
            m.monto_total,
          m.id_medio_pago,
          m.created_at,
          {$operacionExpr} AS operacion,
          COALESCE(c.nombre,'')  AS clasificacion,
          COALESCE(tv.nombre,'') AS tipo_venta,
          COALESCE(cl.nombre,'') AS cliente,
          COALESCE(pr.nombre,'') AS proveedor,
          COALESCE(fiq.nombre,'') AS detalle_mov,
          COALESCE(mp.nombre,'') AS medio_pago_nombre,
          mc_dep.id_cheque         AS cheque_id,
          COALESCE(mc_dep.tipo,'') AS cheque_tipo,
          COALESCE(mc_dep.emisor,'') AS cheque_emisor,
          COALESCE(mc_dep.numero_cheque,'') AS cheque_numero,
          COALESCE(DATE_FORMAT(mc_dep.fecha_emision, '%Y-%m-%d'), '') AS cheque_fecha_emision,
          COALESCE(DATE_FORMAT(mc_dep.fecha_pago, '%Y-%m-%d'), '') AS cheque_fecha_pago,
          COALESCE(mc_dep.importe, 0) AS cheque_importe,
          {$chequeDescripcionDepExpr} AS cheque_descripcion
        FROM movimientos m
          LEFT JOIN tipos_operacion top ON top.id_tipo_operacion = m.id_tipo_operacion
          LEFT JOIN clasificaciones c   ON c.id_clasificacion = m.id_clasificacion
          LEFT JOIN tipos_venta tv      ON tv.id_tipo_venta = m.id_tipo_venta
          LEFT JOIN clientes cl         ON cl.id_cliente = m.id_cliente
          LEFT JOIN proveedores pr      ON pr.id_proveedor = m.id_proveedor
          LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
          LEFT JOIN (
            SELECT miq.id_movimiento,
                   COALESCE(spq.nombre, dq.nombre, '') AS nombre
            FROM movimientos_items miq
            INNER JOIN (
              SELECT id_movimiento, MIN(id_item) AS min_id_item
              FROM movimientos_items
              GROUP BY id_movimiento
            ) qx ON qx.id_movimiento = miq.id_movimiento AND qx.min_id_item = miq.id_item
            LEFT JOIN stock_productos spq ON spq.id_stock_producto = miq.id_stock_producto
            LEFT JOIN detalles dq ON dq.id_detalle = miq.id_detalle
          ) fiq ON fiq.id_movimiento = m.id_movimiento
          LEFT JOIN movimientos_cheques mc_dep
            ON mc_dep.id_cheque = {$chequeIdExpr}
           AND m.id_tipo_operacion = 4
        WHERE 1=1 $whereRange $whereQ2
        ORDER BY {$fechaOperativaExpr} DESC, COALESCE(m.created_at, CONCAT(m.fecha, ' 00:00:00')) DESC, m.id_movimiento DESC
        LIMIT :limitPlus OFFSET :offset
      ),
      items_sum AS (
        SELECT mi.id_movimiento, SUM(mi.total) AS total_sum
        FROM movimientos_items mi
        INNER JOIN mov ON mov.id_movimiento = mi.id_movimiento
        GROUP BY mi.id_movimiento
      ),
      min_item AS (
        SELECT mi.id_movimiento, MIN(mi.id_item) AS min_id_item
        FROM movimientos_items mi
        INNER JOIN mov ON mov.id_movimiento = mi.id_movimiento
        GROUP BY mi.id_movimiento
      ),
      first_item AS (
        SELECT mi1.*
        FROM movimientos_items mi1
        INNER JOIN min_item x
          ON x.id_movimiento = mi1.id_movimiento
         AND x.min_id_item = mi1.id_item
      )
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
        fi.id_detalle        AS item_id_detalle,
        fi.id_stock_producto AS item_id_stock_producto,
        fi.cantidad          AS item_cantidad,
        fi.precio            AS item_precio,
        fi.iva_pct           AS item_iva_pct,
        fi.subtotal          AS item_subtotal,
        fi.iva_monto         AS item_iva_monto,
        fi.total             AS item_total,
        COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
        m.operacion,
        m.clasificacion,
        m.tipo_venta,
        m.cliente,
        m.proveedor,
        m.detalle_mov,
        m.medio_pago_nombre,
        m.cheque_id,
        m.cheque_tipo,
        m.cheque_emisor,
        m.cheque_numero,
        m.cheque_fecha_emision,
        m.cheque_fecha_pago,
        m.cheque_importe,
        m.cheque_descripcion,
        COALESCE(d.nombre, '')   AS item_detalle_nombre,
        COALESCE(spi.nombre, '') AS item_stock_nombre,
        m.created_at
      FROM mov m
        LEFT JOIN items_sum it   ON it.id_movimiento = m.id_movimiento
        LEFT JOIN first_item fi  ON fi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles d     ON d.id_detalle = fi.id_detalle
        LEFT JOIN stock_productos spi ON spi.id_stock_producto = fi.id_stock_producto
      ORDER BY m.fecha DESC, COALESCE(m.created_at, CONCAT(m.fecha, ' 00:00:00')) DESC, m.id_movimiento DESC
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($paramsList as $k => $v) {
      if (in_array($k, [':limitPlus', ':offset', ':qid'], true)) {
        $stmt->bindValue($k, (int)$v, PDO::PARAM_INT);
      } else {
        $stmt->bindValue($k, $v);
      }
    }

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $hasMore = count($rows) > $limit;
    if ($hasMore) {
      $rows = array_slice($rows, 0, $limit);
    }

    // Cargar medios de pago múltiples desde movimientos_medios_pago
    $idsMovs = array_map(fn($r) => (int)$r['id_movimiento'], $rows);
    $mediosPagoMulti = function_exists('mv_medios_pago_listar_detalle_por_movimientos')
      ? mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovs)
      : mvx_listar_medios_pago_por_movimientos($pdo, $idsMovs);
    $itemsPorMovimiento = mvx_listar_items_detalle_por_movimientos($pdo, $idsMovs);

    $data = [];
    foreach ($rows as $r) {
      $esDepositoCheque =
        (int)($r['id_tipo_operacion'] ?? 0) === 4 &&
        !empty($r['cheque_id']);

      $idMov = (int)$r['id_movimiento'];
      $itemsDetalle = $itemsPorMovimiento[$idMov] ?? [];
      $mediosDetalle = $mediosPagoMulti[$idMov] ?? [];

      $idDetalleFinal = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : null;

      $idStockProductoFinal = $r['item_id_stock_producto'] !== null
        ? (int)$r['item_id_stock_producto']
        : null;

      $detalleFinal = '';
      $terceroFinal = '';
      $medioPagoFinal = '';

      if ($esDepositoCheque) {
        $tipoCheque = strtoupper(trim((string)($r['cheque_tipo'] ?? 'CHEQUE')));
        if ($tipoCheque === '') {
          $tipoCheque = 'CHEQUE';
        }

        $numeroCheque = trim((string)($r['cheque_numero'] ?? ''));
        $detalleFinal = 'DEPOSITADO EN BANCO - ' . $tipoCheque . ($numeroCheque !== '' ? ' N° ' . $numeroCheque : '');
        $terceroFinal = (string)($r['cheque_emisor'] ?? '');
        $medioPagoFinal = $tipoCheque;
      } else {
        $detalleFinal = mvx_pick_item_description(
          $r['item_stock_nombre'] ?? '',
          $r['item_detalle_nombre'] ?? '',
          $r['detalle_mov'] ?? ''
        );

        $cliente = trim((string)($r['cliente'] ?? ''));
        $proveedor = trim((string)($r['proveedor'] ?? ''));
        $terceroFinal = $cliente !== '' ? $cliente : $proveedor;

        // Usar medios de pago múltiples si existen, sino el JOIN simple
        $legacyNombre = (string)($r['medio_pago_nombre'] ?? '');
        if (!empty($mediosDetalle)) {
          $medioPagoFinal = mvx_medio_pago_resumen($mediosDetalle, $legacyNombre);
        } else {
          $medioPagoFinal = $legacyNombre;
        }
      }

      $idTipoOperacion = $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'];
      $clienteOriginal = trim((string)($r['cliente'] ?? ''));
      $proveedorOriginal = trim((string)($r['proveedor'] ?? ''));

      $importeDeposito = (float)($r['cheque_importe'] ?? $r['monto_total_final'] ?? $r['monto_total'] ?? 0);
      if ($importeDeposito <= 0) {
        $importeDeposito = (float)($r['monto_total_final'] ?? $r['monto_total'] ?? 0);
      }

      $detalleListado = mvx_items_label($itemsDetalle);
      $itemsDetalleOut = $itemsDetalle;
      $mediosDetalleOut = $mediosDetalle;

      if ($esDepositoCheque) {
        $depositoLabel = mvx_deposito_cheque_label((string)($r['cheque_tipo'] ?? 'CHEQUE'));
        $detalleListado = $depositoLabel;
        $itemsDetalleOut = [mvx_deposito_cheque_item($r, $depositoLabel, $importeDeposito)];
        $mediosDetalleOut = [mvx_deposito_cheque_medio_pago($r, $tipoCheque ?? strtoupper(trim((string)($r['cheque_tipo'] ?? 'CHEQUE'))), $importeDeposito)];
      }

      $operacionOut = trim((string)($r['operacion'] ?? ''));
      if ($operacionOut === '') {
        if ($idTipoOperacion === 1) $operacionOut = 'VENTA';
        elseif ($idTipoOperacion === 2) $operacionOut = 'COMPRA';
        elseif ($idTipoOperacion === 3) $operacionOut = 'OTROS INGRESOS';
        elseif ($idTipoOperacion === 4) $operacionOut = 'OTROS EGRESOS';
        elseif ($idTipoOperacion === 5) $operacionOut = 'PRESUPUESTO';
        else $operacionOut = 'MOVIMIENTO';
      }

      $tipoVentaOriginal = trim((string)($r['tipo_venta'] ?? ''));
      $tipoInfoOut = $tipoVentaOriginal !== '' ? $tipoVentaOriginal : $operacionOut;

      // Para el modal global de detalle conviene devolver siempre algún tercero legible.
      // Antes, ingresos/egresos, presupuestos y depósitos de cheque podían llegar vacíos
      // y el modal terminaba mostrando cajas con "—".
      $clienteOut = '';
      $proveedorOut = '';
      $terceroOut = '';
      if ($idTipoOperacion === 1) {
        $clienteOut = $clienteOriginal !== '' ? $clienteOriginal : 'Consumidor final / sin cliente';
        $terceroOut = $clienteOut;
      } elseif ($idTipoOperacion === 2) {
        $proveedorOut = $proveedorOriginal !== '' ? $proveedorOriginal : 'Proveedor no informado';
        $terceroOut = $proveedorOut;
      } elseif ($idTipoOperacion === 5) {
        $clienteOut = $clienteOriginal !== '' ? $clienteOriginal : 'Sin cliente informado';
        $terceroOut = $clienteOut;
      } elseif ($esDepositoCheque) {
        $terceroOut = trim((string)($r['cheque_emisor'] ?? ''));
        if ($terceroOut === '') $terceroOut = 'Banco / depósito de cheque';
      } elseif ($idTipoOperacion === 3 || $idTipoOperacion === 4) {
        $terceroOut = 'No aplica';
      } else {
        $terceroOut = 'No informado';
      }

      $data[] = [
        'id_movimiento'      => (int)$r['id_movimiento'],
        'fecha'              => (string)($r['fecha'] ?? ''),
        'id_tipo_operacion'  => $idTipoOperacion,
        'id_clasificacion'   => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta'      => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cliente'         => in_array($idTipoOperacion, [1, 5], true) && $r['id_cliente'] !== null ? (int)$r['id_cliente'] : null,
        'id_proveedor'       => $idTipoOperacion === 2 && $r['id_proveedor'] !== null ? (int)$r['id_proveedor'] : null,
        'id_stock_producto'  => $idStockProductoFinal,
        'id_detalle'         => $idDetalleFinal,
        'id_medio_pago'      => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'monto_total'        => (float)($r['monto_total_final'] ?? 0),
        'cantidad'           => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'             => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'            => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'           => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto'          => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'              => $r['item_total'] === null ? null : (float)$r['item_total'],
        'operacion'          => $operacionOut,
        'tipo_operacion'     => $operacionOut,
        'tipo_operacion_nombre' => $operacionOut,
        'tipo_movimiento'    => $operacionOut,
        'clasificacion'      => (string)($r['clasificacion'] ?? ''),
        'tipo_venta'         => $tipoVentaOriginal,
        'tipo_venta_nombre'  => $tipoVentaOriginal,
        'pago_tipo_venta'    => $tipoInfoOut,
        'tipo_info'          => $tipoInfoOut,
        'cliente'            => $clienteOut,
        'proveedor'          => $proveedorOut,
        'tercero'            => $terceroOut,
        'cliente_proveedor_label' => $terceroOut,
        'detalle'            => $detalleListado,
        'detalle_original'   => (string)($detalleFinal ?? ''),
        'cantidad_items'     => count($itemsDetalleOut),
        'items_detalle'      => $itemsDetalleOut,
        'items'              => $itemsDetalleOut,
        'cantidad_medios_pago' => count($mediosDetalleOut),
        'medios_pago_detalle'  => $mediosDetalleOut,
        'medio_pago_nombre'  => (string)($medioPagoFinal ?? ''),
        'es_deposito_cheque' => $esDepositoCheque,
        'cheque_id'          => !empty($r['cheque_id']) ? (int)$r['cheque_id'] : null,
        'cheque_tipo'        => $esDepositoCheque ? strtoupper(trim((string)($r['cheque_tipo'] ?? ''))) : null,
        'cheque_emisor'      => $esDepositoCheque ? (string)($r['cheque_emisor'] ?? '') : null,
        'cheque_numero'      => $esDepositoCheque ? (string)($r['cheque_numero'] ?? '') : null,
        'cheque_fecha_emision' => $esDepositoCheque ? (string)($r['cheque_fecha_emision'] ?? '') : null,
        'cheque_fecha_pago'  => $esDepositoCheque ? (string)($r['cheque_fecha_pago'] ?? '') : null,
        'cheque_importe'     => $esDepositoCheque ? (float)($r['cheque_importe'] ?? 0) : null,
        'cheque_descripcion' => $esDepositoCheque ? trim((string)($r['cheque_descripcion'] ?? '')) : '',
        'cheque'             => $esDepositoCheque ? [
          'id_cheque'      => !empty($r['cheque_id']) ? (int)$r['cheque_id'] : null,
          'tipo'           => strtolower(trim((string)($r['cheque_tipo'] ?? ''))),
          'emisor'         => (string)($r['cheque_emisor'] ?? ''),
          'numero_cheque'  => (string)($r['cheque_numero'] ?? ''),
          'fecha_emision'  => (string)($r['cheque_fecha_emision'] ?? ''),
          'fecha_pago'     => (string)($r['cheque_fecha_pago'] ?? ''),
          'importe'        => (float)($r['cheque_importe'] ?? 0),
          'descripcion'    => trim((string)($r['cheque_descripcion'] ?? '')),
          'observaciones'  => trim((string)($r['cheque_descripcion'] ?? '')),
        ] : null,
        'created_at'         => (string)($r['created_at'] ?? ''),
      ];
    }

    $nextOffset = $hasMore ? ($offset + $limit) : null;

    $out = [
      'movimientos' => $data,
      'limit'       => $limit,
      'offset'      => $offset,
      'has_more'    => $hasMore,
      'next_offset' => $nextOffset,
    ];

    if ($includeTotal) {
      $out['total_count'] = (int)$total_count;
    }

    ok($out);
  } catch (Throwable $e) {
    fail('No se pudieron cargar movimientos. ' . $e->getMessage());
  }
}
/* =========================================================
   CREAR
========================================================= */
function movimientos_crear(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $fecha = as_date_or_null($in['fecha'] ?? null);
  if (!$fecha) fail('Fecha inválida. Formato esperado: YYYY-MM-DD.');

  $id_tipo_operacion = as_int_or_null($in['id_tipo_operacion'] ?? null)
    ?? as_int_or_null($in['id_tipo_movimiento'] ?? null)
    ?? 1;

  $id_clasificacion   = as_int_or_null($in['id_clasificacion'] ?? null);
  $id_tipo_venta      = as_int_or_null($in['id_tipo_venta'] ?? null);
  $id_cliente         = as_int_or_null($in['id_cliente'] ?? null);
  $id_proveedor       = as_int_or_null($in['id_proveedor'] ?? null);
  $id_detalle         = as_int_or_null($in['id_detalle'] ?? null);
  $id_stock_producto  = as_int_or_null($in['id_stock_producto'] ?? null);
  $id_medio_pago      = as_int_or_null($in['id_medio_pago'] ?? null);

  mvx_validar_medio_pago_por_plan($pdo, $id_medio_pago);

  $monto_total = as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2);
  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');

  $item_cantidad  = array_key_exists('cantidad', $in)   ? as_dec($in['cantidad'], 3) : null;
  $item_precio    = array_key_exists('precio', $in)     ? as_dec($in['precio'], 2) : null;
  $item_iva_pct   = array_key_exists('iva_pct', $in)    ? as_dec($in['iva_pct'], 2) : null;
  $item_subtotal  = array_key_exists('subtotal', $in)   ? as_dec($in['subtotal'], 2) : null;
  $item_iva_monto = array_key_exists('iva_monto', $in)  ? as_dec($in['iva_monto'], 2) : null;
  $item_total     = array_key_exists('total', $in)      ? as_dec($in['total'], 2) : null;

  try {
    $pdo->beginTransaction();

    $st = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion,
        id_tipo_venta,
        id_cliente,
        id_proveedor,
        monto_total,
        id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion,
        :id_tipo_venta,
        :id_cliente,
        :id_proveedor,
        :monto_total,
        :id_medio_pago
      )
    ");

    $st->execute([
      ':fecha'             => $fecha,
      ':id_tipo_operacion' => $id_tipo_operacion,
      ':id_clasificacion'  => $id_clasificacion,
      ':id_tipo_venta'     => $id_tipo_venta,
      ':id_cliente'        => $id_cliente,
      ':id_proveedor'      => $id_proveedor,
      ':monto_total'       => $monto_total,
      ':id_medio_pago'     => $id_medio_pago,
    ]);

    $id_movimiento = (int)$pdo->lastInsertId();
    if ($id_movimiento <= 0) {
      throw new RuntimeException('No se pudo obtener el ID del movimiento.');
    }

    if ($id_detalle !== null || $id_stock_producto !== null) {
      $sti = $pdo->prepare("
        INSERT INTO movimientos_items (
          id_movimiento,
          id_detalle,
          id_stock_producto,
          cantidad,
          precio,
          iva_pct,
          subtotal,
          iva_monto,
          total
        ) VALUES (
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
      ");

      $sti->execute([
        ':id_movimiento'    => $id_movimiento,
        ':id_detalle'       => $id_detalle,
        ':id_stock_producto'=> $id_stock_producto,
        ':cantidad'         => $item_cantidad ?? 1.000,
        ':precio'           => $item_precio ?? 0.00,
        ':iva_pct'          => $item_iva_pct ?? 0.00,
        ':subtotal'         => $item_subtotal ?? 0.00,
        ':iva_monto'        => $item_iva_monto ?? 0.00,
        ':total'            => $item_total ?? $monto_total,
      ]);
    }

    $pdo->commit();
    ok(['id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR BATCH
========================================================= */
function movimientos_crear_batch(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $items = $in['items'] ?? $in['movimientos'] ?? null;
  if (!is_array($items) || !count($items)) {
    fail('No hay items para guardar.');
  }

  try {
    $pdo->beginTransaction();

    $normalizados = [];
    $montoTotalBatch = 0.0;

    foreach ($items as $idx => $one) {
      if (!is_array($one)) continue;

      $fecha = as_date_or_null($one['fecha'] ?? ($in['fecha'] ?? null));
      if (!$fecha) {
        throw new RuntimeException('Fecha inválida en batch.');
      }

      $id_tipo_operacion = as_int_or_null($one['id_tipo_operacion'] ?? ($one['id_tipo_movimiento'] ?? null))
        ?? as_int_or_null($in['id_tipo_operacion'] ?? ($in['id_tipo_movimiento'] ?? null))
        ?? 1;

      $id_clasificacion  = as_int_or_null($one['id_clasificacion'] ?? ($in['id_clasificacion'] ?? null));
      $id_tipo_venta     = as_int_or_null($one['id_tipo_venta'] ?? ($in['id_tipo_venta'] ?? null));
      $id_cliente        = as_int_or_null($one['id_cliente'] ?? ($in['id_cliente'] ?? null));
      $id_proveedor      = as_int_or_null($one['id_proveedor'] ?? ($in['id_proveedor'] ?? null));
      $id_detalle        = as_int_or_null($one['id_detalle'] ?? null);
      $id_stock_producto = as_int_or_null($one['id_stock_producto'] ?? null);
      $id_medio_pago     = as_int_or_null($one['id_medio_pago'] ?? ($in['id_medio_pago'] ?? null));

      $itemTotal = as_dec($one['total'] ?? ($one['monto_total'] ?? 0), 2);
      if ($itemTotal <= 0) {
        throw new RuntimeException('Total inválido en ítem batch #' . ($idx + 1) . '.');
      }

      $normalizados[] = [
        'cabecera' => [
          'fecha'             => $fecha,
          'id_tipo_operacion' => $id_tipo_operacion,
          'id_clasificacion'  => $id_clasificacion,
          'id_tipo_venta'     => $id_tipo_venta,
          'id_cliente'        => $id_cliente,
          'id_proveedor'      => $id_proveedor,
          'id_medio_pago'     => $id_medio_pago,
        ],
        'item' => [
          'id_detalle'         => $id_detalle,
          'id_stock_producto'  => $id_stock_producto,
          'cantidad'           => array_key_exists('cantidad', $one) ? as_dec($one['cantidad'], 3) : 1.000,
          'precio'             => array_key_exists('precio', $one) ? as_dec($one['precio'], 2) : 0.00,
          'iva_pct'            => array_key_exists('iva_pct', $one) ? as_dec($one['iva_pct'], 2) : 0.00,
          'subtotal'           => array_key_exists('subtotal', $one) ? as_dec($one['subtotal'], 2) : $itemTotal,
          'iva_monto'          => array_key_exists('iva_monto', $one) ? as_dec($one['iva_monto'], 2) : 0.00,
          'total'              => $itemTotal,
        ],
      ];

      $montoTotalBatch += $itemTotal;
    }

    if (empty($normalizados)) {
      throw new RuntimeException('No hay items válidos para guardar.');
    }

    $cabecera = $normalizados[0]['cabecera'];
    $id_medio_pago = $cabecera['id_medio_pago'];

    if ($id_medio_pago !== null) {
      $nombreMedioPlan = mvx_medio_pago_nombre_by_id($pdo, $id_medio_pago);
      if (mv_plan_saas_medio_pago_bloqueado($nombreMedioPlan)) {
        throw new RuntimeException(mv_plan_saas_error_medio_pago_bloqueado());
      }
    }

    // IMPORTANTE:
    // Un batch se guarda como UN movimiento cabecera y sus productos en movimientos_items.
    $st = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion,
        id_tipo_venta,
        id_cliente,
        id_proveedor,
        monto_total,
        id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion,
        :id_tipo_venta,
        :id_cliente,
        :id_proveedor,
        :monto_total,
        :id_medio_pago
      )
    ");

    $st->execute([
      ':fecha'             => $cabecera['fecha'],
      ':id_tipo_operacion' => $cabecera['id_tipo_operacion'],
      ':id_clasificacion'  => $cabecera['id_clasificacion'],
      ':id_tipo_venta'     => $cabecera['id_tipo_venta'],
      ':id_cliente'        => $cabecera['id_cliente'],
      ':id_proveedor'      => $cabecera['id_proveedor'],
      ':monto_total'       => $montoTotalBatch,
      ':id_medio_pago'     => $id_medio_pago,
    ]);

    $id_movimiento = (int)$pdo->lastInsertId();
    if ($id_movimiento <= 0) {
      throw new RuntimeException('No se pudo obtener ID en batch.');
    }

    $sti = $pdo->prepare("
      INSERT INTO movimientos_items (
        id_movimiento,
        id_detalle,
        id_stock_producto,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      ) VALUES (
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
    ");

    $itemsCreados = 0;
    foreach ($normalizados as $row) {
      $it = $row['item'];
      if ($it['id_detalle'] === null && $it['id_stock_producto'] === null) {
        continue;
      }

      $sti->execute([
        ':id_movimiento'     => $id_movimiento,
        ':id_detalle'        => $it['id_detalle'],
        ':id_stock_producto' => $it['id_stock_producto'],
        ':cantidad'          => $it['cantidad'],
        ':precio'            => $it['precio'],
        ':iva_pct'           => $it['iva_pct'],
        ':subtotal'          => $it['subtotal'],
        ':iva_monto'         => $it['iva_monto'],
        ':total'             => $it['total'],
      ]);
      $itemsCreados++;
    }

    $pdo->commit();
    ok([
      'id_movimiento'    => $id_movimiento,
      'ids_movimientos'  => [$id_movimiento],
      'ids_movimiento'   => [$id_movimiento],
      'ids'              => [$id_movimiento],
      'cantidad'         => 1,
      'items_creados'    => $itemsCreados,
      'monto_total'      => $montoTotalBatch,
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo guardar el batch. ' . $e->getMessage());
  }
}

/* =========================================================
   ACTUALIZAR
========================================================= */
function movimientos_actualizar(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $id_movimiento = as_int_or_null($in['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $old = load_movimiento_or_fail($pdo, $id_movimiento);

  $fecha = as_date_or_null($in['fecha'] ?? ($old['fecha'] ?? null));
  if (!$fecha) fail('Fecha inválida. Formato esperado: YYYY-MM-DD.');

  $id_tipo_operacion = as_int_or_null($in['id_tipo_operacion'] ?? null)
    ?? as_int_or_null($in['id_tipo_movimiento'] ?? null)
    ?? as_int_or_null($old['id_tipo_operacion'] ?? null)
    ?? 1;

  $id_clasificacion = array_key_exists('id_clasificacion', $in)
    ? as_int_or_null($in['id_clasificacion'])
    : as_int_or_null($old['id_clasificacion'] ?? null);

  $id_tipo_venta = array_key_exists('id_tipo_venta', $in)
    ? as_int_or_null($in['id_tipo_venta'])
    : as_int_or_null($old['id_tipo_venta'] ?? null);

  $id_cliente = array_key_exists('id_cliente', $in)
    ? as_int_or_null($in['id_cliente'])
    : as_int_or_null($old['id_cliente'] ?? null);

  $id_proveedor = array_key_exists('id_proveedor', $in)
    ? as_int_or_null($in['id_proveedor'])
    : as_int_or_null($old['id_proveedor'] ?? null);

  $id_detalle = array_key_exists('id_detalle', $in)
    ? as_int_or_null($in['id_detalle'])
    : null;

  $id_stock_producto = array_key_exists('id_stock_producto', $in)
    ? as_int_or_null($in['id_stock_producto'])
    : null;

  $id_medio_pago = array_key_exists('id_medio_pago', $in)
    ? as_int_or_null($in['id_medio_pago'])
    : as_int_or_null($old['id_medio_pago'] ?? null);

  mvx_validar_medio_pago_por_plan($pdo, $id_medio_pago);

  $monto_total = (array_key_exists('monto_total', $in) || array_key_exists('total', $in))
    ? as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2)
    : as_dec($old['monto_total'] ?? 0, 2);

  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');

  $item_cantidad  = array_key_exists('cantidad', $in) ? as_dec($in['cantidad'], 3) : null;
  $item_precio    = array_key_exists('precio', $in) ? as_dec($in['precio'], 2) : null;
  $item_iva_pct   = array_key_exists('iva_pct', $in) ? as_dec($in['iva_pct'], 2) : null;
  $item_subtotal  = array_key_exists('subtotal', $in) ? as_dec($in['subtotal'], 2) : null;
  $item_iva_monto = array_key_exists('iva_monto', $in) ? as_dec($in['iva_monto'], 2) : null;
  $item_total     = array_key_exists('total', $in) ? as_dec($in['total'], 2) : null;

  try {
    $pdo->beginTransaction();

    $pdo->prepare("
      UPDATE movimientos
      SET
        fecha = :fecha,
        id_tipo_operacion = :id_tipo_operacion,
        id_clasificacion = :id_clasificacion,
        id_tipo_venta = :id_tipo_venta,
        id_cliente = :id_cliente,
        id_proveedor = :id_proveedor,
        monto_total = :monto_total,
        id_medio_pago = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ")->execute([
      ':fecha'             => $fecha,
      ':id_tipo_operacion' => $id_tipo_operacion,
      ':id_clasificacion'  => $id_clasificacion,
      ':id_tipo_venta'     => $id_tipo_venta,
      ':id_cliente'        => $id_cliente,
      ':id_proveedor'      => $id_proveedor,
      ':monto_total'       => $monto_total,
      ':id_medio_pago'     => $id_medio_pago,
      ':id_movimiento'     => $id_movimiento,
    ]);

    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id")
      ->execute([':id' => $id_movimiento]);

    if ($id_detalle !== null || $id_stock_producto !== null) {
      $sti = $pdo->prepare("
        INSERT INTO movimientos_items (
          id_movimiento,
          id_detalle,
          id_stock_producto,
          cantidad,
          precio,
          iva_pct,
          subtotal,
          iva_monto,
          total
        ) VALUES (
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
      ");

      $sti->execute([
        ':id_movimiento'    => $id_movimiento,
        ':id_detalle'       => $id_detalle,
        ':id_stock_producto'=> $id_stock_producto,
        ':cantidad'         => $item_cantidad ?? 1.000,
        ':precio'           => $item_precio ?? 0.00,
        ':iva_pct'          => $item_iva_pct ?? 0.00,
        ':subtotal'         => $item_subtotal ?? 0.00,
        ':iva_monto'        => $item_iva_monto ?? 0.00,
        ':total'            => $item_total ?? $monto_total,
      ]);
    }

    $pdo->commit();
    ok(['id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR
========================================================= */
function movimientos_eliminar(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $id_movimiento = as_int_or_null($_GET['id_movimiento'] ?? null)
    ?? as_int_or_null($in['id_movimiento'] ?? null);

  if (!$id_movimiento) fail('Falta id_movimiento.');

  load_movimiento_or_fail($pdo, $id_movimiento);

  try {
    $pdo->beginTransaction();

    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id")
      ->execute([':id' => $id_movimiento]);

    $st = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $st->execute([':id' => $id_movimiento]);

    if ($st->rowCount() < 1) {
      throw new RuntimeException('No se pudo eliminar (rowCount=0).');
    }

    $pdo->commit();
    ok(['id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo eliminar el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   DISPATCH
========================================================= */
try {
  switch ($action) {
    case 'movimientos_listar':
      movimientos_listar($pdo);
      break;

    case 'movimientos_live_token':
      movimientos_live_token($pdo);
      break;

    case 'movimientos_crear':
      movimientos_crear($pdo);
      break;

    case 'movimientos_crear_batch':
      movimientos_crear_batch($pdo);
      break;

    case 'movimientos_actualizar':
      movimientos_actualizar($pdo);
      break;

    case 'movimientos_eliminar':
      movimientos_eliminar($pdo);
      break;

    default:
      fail('Acción no válida en movimientos: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en movimientos: ' . $e->getMessage());
}