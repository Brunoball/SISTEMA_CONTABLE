<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

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
 * - m.id_detalle = mc_dep.id_cheque
 *
 * Entonces:
 * - detalle    => DEPÓSITO CHEQUE N° xxx / DEPÓSITO ECHEQ N° xxx
 * - tercero    => emisor
 * - medio pago => CHEQUE / ECHEQ
 */
function sql_detalle_final_expr(string $mAlias = 'm', string $detalleAlias = 'd', string $chequeAlias = 'mc_dep'): string {
  return "
    CASE
      WHEN {$mAlias}.id_tipo_operacion = 4 AND {$chequeAlias}.id_cheque IS NOT NULL
        THEN CONCAT(
          'DEPÓSITO ',
          UPPER(COALESCE({$chequeAlias}.tipo, 'CHEQUE')),
          ' N° ',
          COALESCE({$chequeAlias}.numero_cheque, '')
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

function build_where_q_fast(string $q, array &$params): string {
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
  $detalleExpr   = sql_detalle_final_expr('m', 'd', 'mc_dep');
  $terceroExpr   = sql_tercero_final_expr('m', 'cl', 'pr', 'mc_dep');
  $medioExpr     = sql_medio_pago_final_expr('m', 'mp', 'mc_dep');

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

  $whereRange = " AND m.fecha BETWEEN :fecha_desde AND :fecha_hasta ";
  $params = [
    ':fecha_desde' => $fechaDesde,
    ':fecha_hasta' => $fechaHasta,
    ':limit'       => $limit,
  ];

  $whereQ = build_where_q_fast($q, $params);
  $operacionExpr = sql_operacion_case('m');
  $detalleExpr   = sql_detalle_final_expr('m', 'd', 'mc_dep');
  $terceroExpr   = sql_tercero_final_expr('m', 'cl', 'pr', 'mc_dep');
  $medioExpr     = sql_medio_pago_final_expr('m', 'mp', 'mc_dep');

  try {
    $sql = "
      SELECT
        m.id_movimiento,
        m.fecha,
        {$operacionExpr} AS operacion,
        m.id_tipo_operacion,
        m.id_clasificacion,
        m.id_tipo_venta,
        m.id_cliente,
        m.id_proveedor,
        m.id_detalle,
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
        LEFT JOIN detalles d          ON d.id_detalle = m.id_detalle
        LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
        LEFT JOIN movimientos_cheques mc_dep
          ON mc_dep.id_cheque = m.id_detalle
         AND m.id_tipo_operacion = 4
      WHERE 1=1
        $whereRange
        $whereQ
      ORDER BY m.fecha DESC, m.id_movimiento DESC
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
    $total_count = null;

    if ($includeTotal) {
      $paramsCount = $rangeParams;
      $whereQ = build_where_q_fast($q, $paramsCount);

      $stCount = $pdo->prepare("
        SELECT COUNT(*) AS cnt
        FROM movimientos m
          LEFT JOIN tipos_operacion top ON top.id_tipo_operacion = m.id_tipo_operacion
          LEFT JOIN clasificaciones c   ON c.id_clasificacion = m.id_clasificacion
          LEFT JOIN tipos_venta tv      ON tv.id_tipo_venta = m.id_tipo_venta
          LEFT JOIN clientes cl         ON cl.id_cliente = m.id_cliente
          LEFT JOIN proveedores pr      ON pr.id_proveedor = m.id_proveedor
          LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
          LEFT JOIN detalles d          ON d.id_detalle = m.id_detalle
          LEFT JOIN movimientos_cheques mc_dep
            ON mc_dep.id_cheque = m.id_detalle
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

    $whereQ2 = build_where_q_fast($q, $paramsList);
    $operacionExpr = sql_operacion_case('m');

    $sql = "
      WITH mov AS (
        SELECT
          m.id_movimiento,
          m.fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          m.id_detalle,
          m.monto_total,
          m.id_medio_pago,
          m.created_at,
          {$operacionExpr} AS operacion,
          COALESCE(c.nombre,'')  AS clasificacion,
          COALESCE(tv.nombre,'') AS tipo_venta,
          COALESCE(cl.nombre,'') AS cliente,
          COALESCE(pr.nombre,'') AS proveedor,
          COALESCE(d.nombre,'')  AS detalle_mov,
          COALESCE(mp.nombre,'') AS medio_pago_nombre,
          mc_dep.id_cheque       AS cheque_id,
          COALESCE(mc_dep.tipo,'') AS cheque_tipo,
          COALESCE(mc_dep.emisor,'') AS cheque_emisor,
          COALESCE(mc_dep.numero_cheque,'') AS cheque_numero
        FROM movimientos m
          LEFT JOIN tipos_operacion top ON top.id_tipo_operacion = m.id_tipo_operacion
          LEFT JOIN clasificaciones c   ON c.id_clasificacion = m.id_clasificacion
          LEFT JOIN tipos_venta tv      ON tv.id_tipo_venta = m.id_tipo_venta
          LEFT JOIN clientes cl         ON cl.id_cliente = m.id_cliente
          LEFT JOIN proveedores pr      ON pr.id_proveedor = m.id_proveedor
          LEFT JOIN detalles d          ON d.id_detalle = m.id_detalle
          LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
          LEFT JOIN movimientos_cheques mc_dep
            ON mc_dep.id_cheque = m.id_detalle
           AND m.id_tipo_operacion = 4
        WHERE 1=1 $whereRange $whereQ2
        ORDER BY m.fecha DESC, m.id_movimiento DESC
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
        m.id_detalle,
        m.monto_total,
        m.id_medio_pago,
        fi.id_detalle AS item_id_detalle,
        fi.cantidad   AS item_cantidad,
        fi.precio     AS item_precio,
        fi.iva_pct    AS item_iva_pct,
        fi.subtotal   AS item_subtotal,
        fi.iva_monto  AS item_iva_monto,
        fi.total      AS item_total,
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
        COALESCE(di.nombre, '') AS item_detalle_nombre,
        m.created_at
      FROM mov m
        LEFT JOIN items_sum it  ON it.id_movimiento = m.id_movimiento
        LEFT JOIN first_item fi ON fi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles di   ON di.id_detalle = fi.id_detalle
      ORDER BY m.fecha DESC, m.id_movimiento DESC
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

    $data = [];
    foreach ($rows as $r) {
      $esDepositoCheque =
        (int)($r['id_tipo_operacion'] ?? 0) === 4 &&
        !empty($r['cheque_id']);

      $id_detalle_final = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

      $detalleFinal = '';
      $terceroFinal = '';
      $medioPagoFinal = '';

      if ($esDepositoCheque) {
        $tipoCheque = strtoupper(trim((string)($r['cheque_tipo'] ?? 'CHEQUE')));
        if ($tipoCheque === '') {
          $tipoCheque = 'CHEQUE';
        }

        $numeroCheque = trim((string)($r['cheque_numero'] ?? ''));
        $detalleFinal = 'DEPÓSITO ' . $tipoCheque . ($numeroCheque !== '' ? ' N° ' . $numeroCheque : '');
        $terceroFinal = (string)($r['cheque_emisor'] ?? '');
        $medioPagoFinal = $tipoCheque;
      } else {
        $detalleFinal = (string)(
          ($r['item_detalle_nombre'] ?? '') !== ''
            ? $r['item_detalle_nombre']
            : ($r['detalle_mov'] ?? '')
        );

        $cliente = trim((string)($r['cliente'] ?? ''));
        $proveedor = trim((string)($r['proveedor'] ?? ''));
        $terceroFinal = $cliente !== '' ? $cliente : $proveedor;
        $medioPagoFinal = (string)($r['medio_pago_nombre'] ?? '');
      }

      $data[] = [
        'id_movimiento'      => (int)$r['id_movimiento'],
        'fecha'              => (string)($r['fecha'] ?? ''),
        'id_tipo_operacion'  => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
        'id_clasificacion'   => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta'      => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cliente'         => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
        'id_proveedor'       => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
        'id_detalle'         => $id_detalle_final,
        'id_medio_pago'      => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'monto_total'        => (float)($r['monto_total_final'] ?? 0),
        'cantidad'           => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'             => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'            => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'           => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto'          => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'              => $r['item_total'] === null ? null : (float)$r['item_total'],
        'operacion'          => (string)($r['operacion'] ?? ''),
        'clasificacion'      => (string)($r['clasificacion'] ?? ''),
        'tipo_venta'         => (string)($r['tipo_venta'] ?? ''),
        'cliente'            => (string)($terceroFinal ?? ''),
        'proveedor'          => '',
        'detalle'            => (string)($detalleFinal ?? ''),
        'medio_pago_nombre'  => (string)($medioPagoFinal ?? ''),
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

  $id_clasificacion = as_int_or_null($in['id_clasificacion'] ?? null);
  $id_tipo_venta    = as_int_or_null($in['id_tipo_venta'] ?? null);
  $id_cliente       = as_int_or_null($in['id_cliente'] ?? null);
  $id_proveedor     = as_int_or_null($in['id_proveedor'] ?? null);
  $id_detalle       = as_int_or_null($in['id_detalle'] ?? null);
  $id_medio_pago    = as_int_or_null($in['id_medio_pago'] ?? null);

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
        id_detalle,
        monto_total,
        id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion,
        :id_tipo_venta,
        :id_cliente,
        :id_proveedor,
        :id_detalle,
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
      ':id_detalle'        => $id_detalle,
      ':monto_total'       => $monto_total,
      ':id_medio_pago'     => $id_medio_pago,
    ]);

    $id_movimiento = (int)$pdo->lastInsertId();
    if ($id_movimiento <= 0) {
      throw new RuntimeException('No se pudo obtener el ID del movimiento.');
    }

    if ($id_detalle !== null) {
      $sti = $pdo->prepare("
        INSERT INTO movimientos_items (
          id_movimiento,
          id_detalle,
          cantidad,
          precio,
          iva_pct,
          subtotal,
          iva_monto,
          total
        ) VALUES (
          :id_movimiento,
          :id_detalle,
          :cantidad,
          :precio,
          :iva_pct,
          :subtotal,
          :iva_monto,
          :total
        )
      ");

      $sti->execute([
        ':id_movimiento' => $id_movimiento,
        ':id_detalle'    => $id_detalle,
        ':cantidad'      => $item_cantidad ?? 1.000,
        ':precio'        => $item_precio ?? 0.00,
        ':iva_pct'       => $item_iva_pct ?? 0.00,
        ':subtotal'      => $item_subtotal ?? 0.00,
        ':iva_monto'     => $item_iva_monto ?? 0.00,
        ':total'         => $item_total ?? $monto_total,
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

  $ids = [];

  try {
    $pdo->beginTransaction();

    foreach ($items as $one) {
      if (!is_array($one)) continue;

      $fecha = as_date_or_null($one['fecha'] ?? null);
      if (!$fecha) {
        throw new RuntimeException('Fecha inválida en batch.');
      }

      $id_tipo_operacion = as_int_or_null($one['id_tipo_operacion'] ?? null)
        ?? as_int_or_null($one['id_tipo_movimiento'] ?? null)
        ?? 1;

      $id_clasificacion = as_int_or_null($one['id_clasificacion'] ?? null);
      $id_tipo_venta    = as_int_or_null($one['id_tipo_venta'] ?? null);
      $id_cliente       = as_int_or_null($one['id_cliente'] ?? null);
      $id_proveedor     = as_int_or_null($one['id_proveedor'] ?? null);
      $id_detalle       = as_int_or_null($one['id_detalle'] ?? null);
      $id_medio_pago    = as_int_or_null($one['id_medio_pago'] ?? null);

      $monto_total = as_dec($one['monto_total'] ?? ($one['total'] ?? 0), 2);
      if ($monto_total <= 0) {
        throw new RuntimeException('Monto total inválido en batch.');
      }

      $st = $pdo->prepare("
        INSERT INTO movimientos (
          fecha,
          id_tipo_operacion,
          id_clasificacion,
          id_tipo_venta,
          id_cliente,
          id_proveedor,
          id_detalle,
          monto_total,
          id_medio_pago
        ) VALUES (
          :fecha,
          :id_tipo_operacion,
          :id_clasificacion,
          :id_tipo_venta,
          :id_cliente,
          :id_proveedor,
          :id_detalle,
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
        ':id_detalle'        => $id_detalle,
        ':monto_total'       => $monto_total,
        ':id_medio_pago'     => $id_medio_pago,
      ]);

      $id_movimiento = (int)$pdo->lastInsertId();
      if ($id_movimiento <= 0) {
        throw new RuntimeException('No se pudo obtener ID en batch.');
      }

      $ids[] = $id_movimiento;

      if ($id_detalle !== null) {
        $sti = $pdo->prepare("
          INSERT INTO movimientos_items (
            id_movimiento,
            id_detalle,
            cantidad,
            precio,
            iva_pct,
            subtotal,
            iva_monto,
            total
          ) VALUES (
            :id_movimiento,
            :id_detalle,
            :cantidad,
            :precio,
            :iva_pct,
            :subtotal,
            :iva_monto,
            :total
          )
        ");

        $sti->execute([
          ':id_movimiento' => $id_movimiento,
          ':id_detalle'    => $id_detalle,
          ':cantidad'      => array_key_exists('cantidad', $one) ? as_dec($one['cantidad'], 3) : 1.000,
          ':precio'        => array_key_exists('precio', $one) ? as_dec($one['precio'], 2) : 0.00,
          ':iva_pct'       => array_key_exists('iva_pct', $one) ? as_dec($one['iva_pct'], 2) : 0.00,
          ':subtotal'      => array_key_exists('subtotal', $one) ? as_dec($one['subtotal'], 2) : 0.00,
          ':iva_monto'     => array_key_exists('iva_monto', $one) ? as_dec($one['iva_monto'], 2) : 0.00,
          ':total'         => array_key_exists('total', $one) ? as_dec($one['total'], 2) : $monto_total,
        ]);
      }
    }

    $pdo->commit();
    ok([
      'ids_movimientos' => $ids,
      'cantidad' => count($ids),
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
    : as_int_or_null($old['id_detalle'] ?? null);

  $id_medio_pago = array_key_exists('id_medio_pago', $in)
    ? as_int_or_null($in['id_medio_pago'])
    : as_int_or_null($old['id_medio_pago'] ?? null);

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
        id_detalle = :id_detalle,
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
      ':id_detalle'        => $id_detalle,
      ':monto_total'       => $monto_total,
      ':id_medio_pago'     => $id_medio_pago,
      ':id_movimiento'     => $id_movimiento,
    ]);

    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id")
      ->execute([':id' => $id_movimiento]);

    if ($id_detalle !== null) {
      $sti = $pdo->prepare("
        INSERT INTO movimientos_items (
          id_movimiento,
          id_detalle,
          cantidad,
          precio,
          iva_pct,
          subtotal,
          iva_monto,
          total
        ) VALUES (
          :id_movimiento,
          :id_detalle,
          :cantidad,
          :precio,
          :iva_pct,
          :subtotal,
          :iva_monto,
          :total
        )
      ");

      $sti->execute([
        ':id_movimiento' => $id_movimiento,
        ':id_detalle'    => $id_detalle,
        ':cantidad'      => $item_cantidad ?? 1.000,
        ':precio'        => $item_precio ?? 0.00,
        ':iva_pct'       => $item_iva_pct ?? 0.00,
        ':subtotal'      => $item_subtotal ?? 0.00,
        ':iva_monto'     => $item_iva_monto ?? 0.00,
        ':total'         => $item_total ?? $monto_total,
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