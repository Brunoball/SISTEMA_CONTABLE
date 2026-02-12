<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

/**
 * ✅ ACCIONES:
 * - movimientos_listar (GET)
 * - movimientos_periodos_listar (GET)
 * - movimientos_crear (POST JSON)
 * - movimientos_crear_batch (POST JSON)
 * - movimientos_actualizar (POST JSON) ✅ NUEVO
 * - movimientos_eliminar (POST JSON) ✅ NUEVO
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 */

if (!isset($pdo) || !($pdo instanceof PDO)) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Este módulo debe ejecutarse vía routes/api.php (tenant_resolver).'
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
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Helpers
========================= */
function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $j = json_decode($raw, true);
  return is_array($j) ? $j : [];
}

function as_int_or_null($v): ?int {
  if ($v === null || $v === '' || $v === false) return null;
  if (is_string($v) && trim($v) === '') return null;
  $n = (int)$v;
  return ($n > 0) ? $n : null;
}

function as_dec($v, int $scale = 2): float {
  $n = (float)$v;
  $p = pow(10, $scale);
  return round($n * $p) / $p;
}

function as_date_or_null($v): ?string {
  $s = trim((string)$v);
  if ($s === '') return null;
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s;
  return null;
}

function normalize_periodo_to_yyyymm(string $p): string {
  $p = trim($p);
  if ($p === '') return '';

  // YYYY-MM
  if (preg_match('/^\d{4}\-\d{2}$/', $p)) return $p;

  // MM-YYYY -> YYYY-MM
  if (preg_match('/^\d{1,2}\-\d{4}$/', $p)) {
    [$mm, $yyyy] = explode('-', $p);
    $mm = str_pad((string)((int)$mm), 2, '0', STR_PAD_LEFT);
    return $yyyy . '-' . $mm;
  }

  // YYYY/M -> YYYY-MM
  if (preg_match('/^\d{4}\/\d{1,2}$/', $p)) {
    [$yyyy, $mm] = explode('/', $p);
    $mm = str_pad((string)((int)$mm), 2, '0', STR_PAD_LEFT);
    return $yyyy . '-' . $mm;
  }

  // M/YYYY -> YYYY-MM
  if (preg_match('/^\d{1,2}\/\d{4}$/', $p)) {
    [$mm, $yyyy] = explode('/', $p);
    $mm = str_pad((string)((int)$mm), 2, '0', STR_PAD_LEFT);
    return $yyyy . '-' . $mm;
  }

  // YYYYMM
  if (preg_match('/^\d{6}$/', $p)) {
    $yyyy = substr($p, 0, 4);
    $mm = substr($p, 4, 2);
    return $yyyy . '-' . $mm;
  }

  return $p; // fallback
}

function is_valid_periodo_yyyymm(string $p): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p);
}

function require_post(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
  }
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido. Usá POST.', 200);
  }
}

function load_movimiento_or_fail(PDO $pdo, int $id_movimiento): array {
  $st = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $st->execute([':id' => $id_movimiento]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) fail('Movimiento no encontrado.');
  return $row;
}

/* =========================================================
   ACCIÓN
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action === '') fail('Falta parámetro action.');

/* =========================================================
   LISTAR PERIODOS (GET)
========================================================= */
function movimientos_periodos_listar(PDO $pdo): void {
  try {
    $sql = "
      SELECT DISTINCT m.periodo
      FROM movimientos m
      WHERE m.periodo IS NOT NULL AND m.periodo <> ''
      ORDER BY m.periodo DESC
    ";
    $stmt = $pdo->query($sql);
    $periodos = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $periodos = array_values(array_filter(array_map(fn($p) => (string)$p, $periodos)));
    ok(['periodos' => $periodos]);
  } catch (Throwable $e) {
    fail('No se pudieron obtener los períodos. ' . $e->getMessage());
  }
}

/* =========================================================
   LISTAR MOVIMIENTOS (GET)
========================================================= */
function movimientos_listar(PDO $pdo): void {
  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  $q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $where = [];
  $params = [];

  if ($periodo !== '') {
    if (!is_valid_periodo_yyyymm($periodo)) fail('Período inválido. Formato esperado: YYYY-MM');
    $where[] = "m.periodo = :periodo";
    $params[':periodo'] = $periodo;
  }

  $sql = "
    SELECT
      m.id_movimiento,
      m.fecha,
      m.periodo,

      m.id_clasificacion,
      m.id_tipo_venta,
      m.id_cuenta_corriente,
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

      COALESCE(c.nombre,'')  AS clasificacion,
      COALESCE(tv.nombre,'') AS tipo_venta,
      COALESCE(cc.nombre,'') AS cuenta_corriente,
      COALESCE(cl.nombre,'') AS cliente,
      COALESCE(pr.nombre,'') AS proveedor,
      COALESCE(di.nombre, d.nombre, '') AS detalle,
      COALESCE(mp.nombre,'') AS medio_pago_nombre,

      m.created_at
    FROM movimientos m
      LEFT JOIN clasificaciones c       ON c.id_clasificacion = m.id_clasificacion
      LEFT JOIN tipos_venta tv          ON tv.id_tipo_venta = m.id_tipo_venta
      LEFT JOIN cuentas_corrientes cc   ON cc.id_cuenta_corriente = m.id_cuenta_corriente
      LEFT JOIN clientes cl             ON cl.id_cliente = m.id_cliente
      LEFT JOIN proveedores pr          ON pr.id_proveedor = m.id_proveedor
      LEFT JOIN detalles d              ON d.id_detalle = m.id_detalle
      LEFT JOIN medios_pago mp          ON mp.id_medio_pago = m.id_medio_pago

      LEFT JOIN (
        SELECT id_movimiento, SUM(total) AS total_sum
        FROM movimientos_items
        GROUP BY id_movimiento
      ) it ON it.id_movimiento = m.id_movimiento

      LEFT JOIN (
        SELECT mi1.*
        FROM movimientos_items mi1
        INNER JOIN (
          SELECT id_movimiento, MIN(id_item) AS min_id_item
          FROM movimientos_items
          GROUP BY id_movimiento
        ) x ON x.id_movimiento = mi1.id_movimiento AND x.min_id_item = mi1.id_item
      ) fi ON fi.id_movimiento = m.id_movimiento

      LEFT JOIN detalles di ON di.id_detalle = fi.id_detalle
  ";

  if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = "(
      UPPER(COALESCE(c.nombre,''))   LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))  LIKE UPPER(:q2) OR
      UPPER(COALESCE(cc.nombre,''))  LIKE UPPER(:q3) OR
      UPPER(COALESCE(cl.nombre,''))  LIKE UPPER(:q4) OR
      UPPER(COALESCE(pr.nombre,''))  LIKE UPPER(:q5) OR
      UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q6) OR
      UPPER(COALESCE(mp.nombre,''))  LIKE UPPER(:q7)
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q6'] = $like;
    $params[':q7'] = $like;
  }

  if (!empty($where)) $sql .= " WHERE " . implode(" AND ", $where);
  $sql .= " ORDER BY m.fecha DESC, m.id_movimiento DESC";

  try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $data = [];
    foreach ($rows as $r) {
      $id_detalle_final = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

      $data[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)($r['fecha'] ?? ''),
        'periodo' => (string)($r['periodo'] ?? ''),

        'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cuenta_corriente' => $r['id_cuenta_corriente'] === null ? null : (int)$r['id_cuenta_corriente'],
        'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
        'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
        'id_detalle' => $id_detalle_final,
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],

        'monto_total' => (float)($r['monto_total_final'] ?? 0),

        'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

        'clasificacion' => (string)($r['clasificacion'] ?? ''),
        'tipo_venta' => (string)($r['tipo_venta'] ?? ''),
        'cuenta_corriente' => (string)($r['cuenta_corriente'] ?? ''),
        'cliente' => (string)($r['cliente'] ?? ''),
        'proveedor' => (string)($r['proveedor'] ?? ''),
        'detalle' => (string)($r['detalle'] ?? ''),
        'medio_pago_nombre' => (string)($r['medio_pago_nombre'] ?? ''),

        'created_at' => (string)($r['created_at'] ?? ''),
      ];
    }

    ok(['movimientos' => $data]);
  } catch (Throwable $e) {
    fail('No se pudieron cargar movimientos. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR MOVIMIENTO (POST JSON)
========================================================= */
function movimientos_crear(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $fecha   = as_date_or_null($in['fecha'] ?? null);
  $periodo = normalize_periodo_to_yyyymm((string)($in['periodo'] ?? ''));

  if ($periodo === '' && $fecha) $periodo = substr($fecha, 0, 7); // YYYY-MM
  if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) {
    fail('Período inválido. Debe ser YYYY-MM (ej: 2026-02).');
  }

  // tu tabla exige id_tipo_operacion NOT NULL
  $id_tipo_operacion = as_int_or_null($in['id_tipo_operacion'] ?? null)
    ?? as_int_or_null($in['id_tipo_movimiento'] ?? null)
    ?? 1; // default

  $id_clasificacion     = as_int_or_null($in['id_clasificacion'] ?? null);
  $id_tipo_venta        = as_int_or_null($in['id_tipo_venta'] ?? null);
  $id_cuenta_corriente  = as_int_or_null($in['id_cuenta_corriente'] ?? null);
  $id_cliente           = as_int_or_null($in['id_cliente'] ?? null);
  $id_proveedor         = as_int_or_null($in['id_proveedor'] ?? null);
  $id_detalle           = as_int_or_null($in['id_detalle'] ?? null);
  $id_medio_pago        = as_int_or_null($in['id_medio_pago'] ?? null);

  $monto_total = as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2);
  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');

  // Item (si hay detalle)
  $item_cantidad = isset($in['cantidad']) ? as_dec($in['cantidad'], 3) : null;
  $item_precio   = isset($in['precio']) ? as_dec($in['precio'], 2) : null;
  $item_iva_pct  = isset($in['iva_pct']) ? as_dec($in['iva_pct'], 2) : null;
  $item_subtotal = isset($in['subtotal']) ? as_dec($in['subtotal'], 2) : null;
  $item_iva_monto= isset($in['iva_monto']) ? as_dec($in['iva_monto'], 2) : null;
  $item_total    = isset($in['total']) ? as_dec($in['total'], 2) : null;

  $shouldInsertItem = ($id_detalle !== null);

  try {
    $pdo->beginTransaction();

    $sqlMov = "
      INSERT INTO movimientos (
        fecha, periodo, id_tipo_operacion,
        id_clasificacion, id_tipo_venta, id_cuenta_corriente,
        id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha, :periodo, :id_tipo_operacion,
        :id_clasificacion, :id_tipo_venta, :id_cuenta_corriente,
        :id_cliente, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago
      )
    ";
    $st = $pdo->prepare($sqlMov);
    $st->execute([
      ':fecha' => $fecha,
      ':periodo' => $periodo,
      ':id_tipo_operacion' => $id_tipo_operacion,
      ':id_clasificacion' => $id_clasificacion,
      ':id_tipo_venta' => $id_tipo_venta,
      ':id_cuenta_corriente' => $id_cuenta_corriente,
      ':id_cliente' => $id_cliente,
      ':id_proveedor' => $id_proveedor,
      ':id_detalle' => $id_detalle,
      ':monto_total' => $monto_total,
      ':id_medio_pago' => $id_medio_pago,
    ]);

    $id_movimiento = (int)$pdo->lastInsertId();
    if ($id_movimiento <= 0) throw new RuntimeException('No se pudo obtener el ID del movimiento.');

    if ($shouldInsertItem) {
      $sqlItem = "
        INSERT INTO movimientos_items (
          id_movimiento, id_detalle,
          cantidad, precio, iva_pct, subtotal, iva_monto, total
        ) VALUES (
          :id_movimiento, :id_detalle,
          :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total
        )
      ";
      $sti = $pdo->prepare($sqlItem);
      $sti->execute([
        ':id_movimiento' => $id_movimiento,
        ':id_detalle' => $id_detalle,
        ':cantidad' => ($item_cantidad !== null ? $item_cantidad : 1.000),
        ':precio' => ($item_precio !== null ? $item_precio : 0.00),
        ':iva_pct' => ($item_iva_pct !== null ? $item_iva_pct : 0.00),
        ':subtotal' => ($item_subtotal !== null ? $item_subtotal : 0.00),
        ':iva_monto' => ($item_iva_monto !== null ? $item_iva_monto : 0.00),
        ':total' => ($item_total !== null ? $item_total : $monto_total),
      ]);
    }

    $pdo->commit();

    ok([
      'id_movimiento' => $id_movimiento,
      'periodo' => $periodo
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR BATCH (POST JSON)
   body: { items: [ {..movimiento..}, ... ] }
========================================================= */
function movimientos_crear_batch(PDO $pdo): void {
  require_post();
  $in = read_json_body();
  $items = $in['items'] ?? $in['movimientos'] ?? null;
  if (!is_array($items) || !count($items)) fail('No hay items para guardar.');

  $ids = [];

  try {
    $pdo->beginTransaction();

    foreach ($items as $one) {
      if (!is_array($one)) continue;

      $fecha   = as_date_or_null($one['fecha'] ?? null);
      $periodo = normalize_periodo_to_yyyymm((string)($one['periodo'] ?? ''));
      if ($periodo === '' && $fecha) $periodo = substr($fecha, 0, 7);
      if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) {
        throw new RuntimeException('Período inválido en batch: ' . ($one['periodo'] ?? ''));
      }

      $id_tipo_operacion = as_int_or_null($one['id_tipo_operacion'] ?? null)
        ?? as_int_or_null($one['id_tipo_movimiento'] ?? null)
        ?? 1;

      $id_clasificacion     = as_int_or_null($one['id_clasificacion'] ?? null);
      $id_tipo_venta        = as_int_or_null($one['id_tipo_venta'] ?? null);
      $id_cuenta_corriente  = as_int_or_null($one['id_cuenta_corriente'] ?? null);
      $id_cliente           = as_int_or_null($one['id_cliente'] ?? null);
      $id_proveedor         = as_int_or_null($one['id_proveedor'] ?? null);
      $id_detalle           = as_int_or_null($one['id_detalle'] ?? null);
      $id_medio_pago        = as_int_or_null($one['id_medio_pago'] ?? null);

      $monto_total = as_dec($one['monto_total'] ?? ($one['total'] ?? 0), 2);
      if ($monto_total <= 0) throw new RuntimeException('Monto total inválido en batch.');

      $sqlMov = "
        INSERT INTO movimientos (
          fecha, periodo, id_tipo_operacion,
          id_clasificacion, id_tipo_venta, id_cuenta_corriente,
          id_cliente, id_proveedor, id_detalle,
          monto_total, id_medio_pago
        ) VALUES (
          :fecha, :periodo, :id_tipo_operacion,
          :id_clasificacion, :id_tipo_venta, :id_cuenta_corriente,
          :id_cliente, :id_proveedor, :id_detalle,
          :monto_total, :id_medio_pago
        )
      ";
      $st = $pdo->prepare($sqlMov);
      $st->execute([
        ':fecha' => $fecha,
        ':periodo' => $periodo,
        ':id_tipo_operacion' => $id_tipo_operacion,
        ':id_clasificacion' => $id_clasificacion,
        ':id_tipo_venta' => $id_tipo_venta,
        ':id_cuenta_corriente' => $id_cuenta_corriente,
        ':id_cliente' => $id_cliente,
        ':id_proveedor' => $id_proveedor,
        ':id_detalle' => $id_detalle,
        ':monto_total' => $monto_total,
        ':id_medio_pago' => $id_medio_pago,
      ]);

      $id_movimiento = (int)$pdo->lastInsertId();
      if ($id_movimiento <= 0) throw new RuntimeException('No se pudo obtener ID en batch.');
      $ids[] = $id_movimiento;

      if ($id_detalle !== null) {
        $sti = $pdo->prepare("
          INSERT INTO movimientos_items (
            id_movimiento, id_detalle,
            cantidad, precio, iva_pct, subtotal, iva_monto, total
          ) VALUES (
            :id_movimiento, :id_detalle,
            :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total
          )
        ");
        $sti->execute([
          ':id_movimiento' => $id_movimiento,
          ':id_detalle' => $id_detalle,
          ':cantidad' => isset($one['cantidad']) ? as_dec($one['cantidad'], 3) : 1.000,
          ':precio' => isset($one['precio']) ? as_dec($one['precio'], 2) : 0.00,
          ':iva_pct' => isset($one['iva_pct']) ? as_dec($one['iva_pct'], 2) : 0.00,
          ':subtotal' => isset($one['subtotal']) ? as_dec($one['subtotal'], 2) : 0.00,
          ':iva_monto' => isset($one['iva_monto']) ? as_dec($one['iva_monto'], 2) : 0.00,
          ':total' => isset($one['total']) ? as_dec($one['total'], 2) : $monto_total,
        ]);
      }
    }

    $pdo->commit();
    ok(['ids_movimientos' => $ids, 'cantidad' => count($ids)]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo guardar el batch. ' . $e->getMessage());
  }
}

/* =========================================================
   ACTUALIZAR (EDITAR) MOVIMIENTO (POST JSON) ✅ NUEVO
========================================================= */
function movimientos_actualizar(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $id_movimiento = as_int_or_null($in['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  // aseguro que exista
  $old = load_movimiento_or_fail($pdo, $id_movimiento);

  $fecha   = as_date_or_null($in['fecha'] ?? $old['fecha'] ?? null);
  $periodo = normalize_periodo_to_yyyymm((string)($in['periodo'] ?? ($old['periodo'] ?? '')));

  if ($periodo === '' && $fecha) $periodo = substr((string)$fecha, 0, 7);
  if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) {
    fail('Período inválido. Debe ser YYYY-MM (ej: 2026-02).');
  }

  $id_tipo_operacion = as_int_or_null($in['id_tipo_operacion'] ?? null)
    ?? as_int_or_null($in['id_tipo_movimiento'] ?? null)
    ?? as_int_or_null($old['id_tipo_operacion'] ?? null)
    ?? 1;

  $id_clasificacion     = array_key_exists('id_clasificacion', $in) ? as_int_or_null($in['id_clasificacion']) : as_int_or_null($old['id_clasificacion'] ?? null);
  $id_tipo_venta        = array_key_exists('id_tipo_venta', $in) ? as_int_or_null($in['id_tipo_venta']) : as_int_or_null($old['id_tipo_venta'] ?? null);
  $id_cuenta_corriente  = array_key_exists('id_cuenta_corriente', $in) ? as_int_or_null($in['id_cuenta_corriente']) : as_int_or_null($old['id_cuenta_corriente'] ?? null);
  $id_cliente           = array_key_exists('id_cliente', $in) ? as_int_or_null($in['id_cliente']) : as_int_or_null($old['id_cliente'] ?? null);
  $id_proveedor         = array_key_exists('id_proveedor', $in) ? as_int_or_null($in['id_proveedor']) : as_int_or_null($old['id_proveedor'] ?? null);
  $id_detalle           = array_key_exists('id_detalle', $in) ? as_int_or_null($in['id_detalle']) : as_int_or_null($old['id_detalle'] ?? null);
  $id_medio_pago        = array_key_exists('id_medio_pago', $in) ? as_int_or_null($in['id_medio_pago']) : as_int_or_null($old['id_medio_pago'] ?? null);

  // monto_total: si viene 0, lo recalculo desde total, sino tomo el de BD
  $monto_total = null;
  if (array_key_exists('monto_total', $in) || array_key_exists('total', $in)) {
    $monto_total = as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2);
  } else {
    $monto_total = as_dec($old['monto_total'] ?? 0, 2);
  }

  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');

  // Item (si hay detalle)
  $item_cantidad = array_key_exists('cantidad', $in) ? as_dec($in['cantidad'], 3) : null;
  $item_precio   = array_key_exists('precio', $in) ? as_dec($in['precio'], 2) : null;
  $item_iva_pct  = array_key_exists('iva_pct', $in) ? as_dec($in['iva_pct'], 2) : null;
  $item_subtotal = array_key_exists('subtotal', $in) ? as_dec($in['subtotal'], 2) : null;
  $item_iva_monto= array_key_exists('iva_monto', $in) ? as_dec($in['iva_monto'], 2) : null;
  $item_total    = array_key_exists('total', $in) ? as_dec($in['total'], 2) : null;

  try {
    $pdo->beginTransaction();

    $sqlUp = "
      UPDATE movimientos SET
        fecha = :fecha,
        periodo = :periodo,
        id_tipo_operacion = :id_tipo_operacion,
        id_clasificacion = :id_clasificacion,
        id_tipo_venta = :id_tipo_venta,
        id_cuenta_corriente = :id_cuenta_corriente,
        id_cliente = :id_cliente,
        id_proveedor = :id_proveedor,
        id_detalle = :id_detalle,
        monto_total = :monto_total,
        id_medio_pago = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ";
    $st = $pdo->prepare($sqlUp);
    $st->execute([
      ':fecha' => $fecha,
      ':periodo' => $periodo,
      ':id_tipo_operacion' => $id_tipo_operacion,
      ':id_clasificacion' => $id_clasificacion,
      ':id_tipo_venta' => $id_tipo_venta,
      ':id_cuenta_corriente' => $id_cuenta_corriente,
      ':id_cliente' => $id_cliente,
      ':id_proveedor' => $id_proveedor,
      ':id_detalle' => $id_detalle,
      ':monto_total' => $monto_total,
      ':id_medio_pago' => $id_medio_pago,
      ':id_movimiento' => $id_movimiento,
    ]);

    // ✅ estrategia simple y estable:
    // - borro todos los items del movimiento
    // - si hay id_detalle, inserto 1 item nuevo coherente con lo que edita el modal
    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id")
        ->execute([':id' => $id_movimiento]);

    if ($id_detalle !== null) {
      $sqlItem = "
        INSERT INTO movimientos_items (
          id_movimiento, id_detalle,
          cantidad, precio, iva_pct, subtotal, iva_monto, total
        ) VALUES (
          :id_movimiento, :id_detalle,
          :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total
        )
      ";
      $sti = $pdo->prepare($sqlItem);
      $sti->execute([
        ':id_movimiento' => $id_movimiento,
        ':id_detalle' => $id_detalle,
        ':cantidad' => ($item_cantidad !== null ? $item_cantidad : 1.000),
        ':precio' => ($item_precio !== null ? $item_precio : 0.00),
        ':iva_pct' => ($item_iva_pct !== null ? $item_iva_pct : 0.00),
        ':subtotal' => ($item_subtotal !== null ? $item_subtotal : 0.00),
        ':iva_monto' => ($item_iva_monto !== null ? $item_iva_monto : 0.00),
        ':total' => ($item_total !== null ? $item_total : $monto_total),
      ]);
    }

    $pdo->commit();
    ok(['id_movimiento' => $id_movimiento, 'periodo' => $periodo]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR MOVIMIENTO (POST JSON) ✅ NUEVO
========================================================= */
function movimientos_eliminar(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $id_movimiento = as_int_or_null($_GET['id_movimiento'] ?? null)
    ?? as_int_or_null($in['id_movimiento'] ?? null);

  if (!$id_movimiento) fail('Falta id_movimiento.');

  // aseguro que exista
  load_movimiento_or_fail($pdo, $id_movimiento);

  try {
    $pdo->beginTransaction();

    // 1) items
    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id")
        ->execute([':id' => $id_movimiento]);

    // 2) movimiento
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

    case 'movimientos_periodos_listar':
      movimientos_periodos_listar($pdo);
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
