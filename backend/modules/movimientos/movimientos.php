<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

/**
 * ✅ ACCIONES:
 * - movimientos_listar (GET)  ✅ OPTIMIZADO + PAGINADO + total_count + periodo flexible
 * - movimientos_periodos_listar (GET) ✅ devuelve periodos en YYYY-MM + MM-YYYY (para UI)
 * - movimientos_crear (POST JSON) ✅ acepta periodo en YYYY-MM / MM-YYYY / MM/YYYY / YYYY/MM / YYYYMM
 * - movimientos_crear_batch (POST JSON) ✅ idem
 * - movimientos_actualizar (POST JSON) ✅ idem
 * - movimientos_eliminar (POST JSON)
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por routes/api.php (tenant_resolver)
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
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
function require_post(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido. Usá POST.', 200);
  }
}
function as_int($v, int $default = 0): int {
  if ($v === null || $v === '' || $v === false) return $default;
  if (!is_numeric($v)) return $default;
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
  $n = (float)$v;
  $p = pow(10, $scale);
  return round($n * $p) / $p;
}
function as_date_or_null($v): ?string {
  $s = trim((string)$v);
  if ($s === '') return null;
  return preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) ? $s : null;
}

/**
 * ✅ Normaliza periodo a YYYY-MM aceptando:
 * - YYYY-MM
 * - MM-YYYY
 * - YYYY/M o YYYY/MM
 * - M/YYYY o MM/YYYY
 * - YYYYMM
 */
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

  // YYYY/M or YYYY/MM -> YYYY-MM
  if (preg_match('/^\d{4}\/\d{1,2}$/', $p)) {
    [$yyyy, $mm] = explode('/', $p);
    $mm = str_pad((string)((int)$mm), 2, '0', STR_PAD_LEFT);
    return $yyyy . '-' . $mm;
  }

  // M/YYYY or MM/YYYY -> YYYY-MM
  if (preg_match('/^\d{1,2}\/\d{4}$/', $p)) {
    [$mm, $yyyy] = explode('/', $p);
    $mm = str_pad((string)((int)$mm), 2, '0', STR_PAD_LEFT);
    return $yyyy . '-' . $mm;
  }

  // YYYYMM -> YYYY-MM
  if (preg_match('/^\d{6}$/', $p)) {
    $yyyy = substr($p, 0, 4);
    $mm   = substr($p, 4, 2);
    return $yyyy . '-' . $mm;
  }

  // fallback (si te llega algo raro, lo dejamos)
  return $p;
}
function is_valid_periodo_yyyymm(string $p): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p);
}
function periodo_yyyymm_to_mmyyyy(string $p): string {
  $p = trim($p);
  if (!is_valid_periodo_yyyymm($p)) return $p;
  [$yyyy, $mm] = explode('-', $p);
  return $mm . '-' . $yyyy;
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
    $periodos = array_values(array_filter(array_map(fn($p) => trim((string)$p), $periodos)));

    // ✅ también para UI nueva MM-YYYY
    $periodos_ui = array_values(array_map(fn($p) => periodo_yyyymm_to_mmyyyy((string)$p), $periodos));

    ok([
      'periodos' => $periodos,         // YYYY-MM (backend estándar)
      'periodos_ui' => $periodos_ui,   // MM-YYYY (para inputs tipo el tuyo)
    ]);
  } catch (Throwable $e) {
    fail('No se pudieron obtener los períodos. ' . $e->getMessage());
  }
}

/* =========================================================
   LISTAR MOVIMIENTOS (GET)
   ✅ periodo flexible (acepta MM-YYYY y lo normaliza)
   ✅ paginado robusto (limit+1 => has_more real)
   ✅ total_count real (para que el front muestre el número correcto)
========================================================= */
function movimientos_listar(PDO $pdo): void {
  $periodoRaw = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  $q          = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $limit  = as_int($_GET['limit'] ?? 300, 300);
  $offset = as_int($_GET['offset'] ?? 0, 0);

  if ($limit < 1) $limit = 1;
  if ($limit > 1000) $limit = 1000;
  if ($offset < 0) $offset = 0;

  if ($periodoRaw === '') fail('Falta período.');

  // ✅ acepta MM-YYYY / etc y lo pasa a YYYY-MM
  $periodo = normalize_periodo_to_yyyymm($periodoRaw);
  if (!is_valid_periodo_yyyymm($periodo)) {
    fail('Período inválido. Formatos aceptados: YYYY-MM o MM-YYYY (y variantes con /).');
  }

  // ✅ total_count (con y sin q) para UI
  $totalParams = [':periodo' => $periodo];
  $whereQ = '';
  if ($q !== '') {
    $whereQ = "
      AND (
        CAST(COALESCE(m.id_movimiento, 0) AS CHAR) LIKE :q OR
        EXISTS (SELECT 1 FROM clasificaciones c WHERE c.id_clasificacion = m.id_clasificacion AND c.nombre LIKE :q) OR
        EXISTS (SELECT 1 FROM tipos_venta tv WHERE tv.id_tipo_venta = m.id_tipo_venta AND tv.nombre LIKE :q) OR
        EXISTS (SELECT 1 FROM cuentas_corrientes cc WHERE cc.id_cuenta_corriente = m.id_cuenta_corriente AND cc.nombre LIKE :q) OR
        EXISTS (SELECT 1 FROM clientes cl WHERE cl.id_cliente = m.id_cliente AND cl.nombre LIKE :q) OR
        EXISTS (SELECT 1 FROM proveedores pr WHERE pr.id_proveedor = m.id_proveedor AND pr.nombre LIKE :q) OR
        EXISTS (SELECT 1 FROM medios_pago mp WHERE mp.id_medio_pago = m.id_medio_pago AND mp.nombre LIKE :q) OR
        EXISTS (SELECT 1 FROM detalles d WHERE d.id_detalle = m.id_detalle AND d.nombre LIKE :q)
      )
    ";
    $totalParams[':q'] = '%' . $q . '%';
  }

  try {
    // total_count (con filtros)
    $stCount = $pdo->prepare("
      SELECT COUNT(*) AS cnt
      FROM movimientos m
      WHERE m.periodo = :periodo
      $whereQ
    ");
    foreach ($totalParams as $k => $v) {
      $stCount->bindValue($k, $v);
    }
    $stCount->execute();
    $total_count = (int)($stCount->fetchColumn() ?: 0);

    // ✅ paginado robusto: pedimos 1 extra
    $limitPlus = $limit + 1;

    $sql = "
      WITH mov AS (
        SELECT
          m.id_movimiento,
          m.fecha,
          m.periodo,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cuenta_corriente,
          m.id_cliente,
          m.id_proveedor,
          m.id_detalle,
          m.monto_total,
          m.id_medio_pago,
          m.created_at
        FROM movimientos m
        WHERE m.periodo = :periodo
        $whereQ
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
        m.periodo,
        m.id_tipo_operacion,
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
      FROM mov m
        LEFT JOIN clasificaciones c       ON c.id_clasificacion = m.id_clasificacion
        LEFT JOIN tipos_venta tv          ON tv.id_tipo_venta = m.id_tipo_venta
        LEFT JOIN cuentas_corrientes cc   ON cc.id_cuenta_corriente = m.id_cuenta_corriente
        LEFT JOIN clientes cl             ON cl.id_cliente = m.id_cliente
        LEFT JOIN proveedores pr          ON pr.id_proveedor = m.id_proveedor
        LEFT JOIN detalles d              ON d.id_detalle = m.id_detalle
        LEFT JOIN medios_pago mp          ON mp.id_medio_pago = m.id_medio_pago

        LEFT JOIN items_sum it            ON it.id_movimiento = m.id_movimiento
        LEFT JOIN first_item fi           ON fi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles di             ON di.id_detalle = fi.id_detalle

      ORDER BY m.fecha DESC, m.id_movimiento DESC
    ";

    $stmt = $pdo->prepare($sql);

    // binds
    $stmt->bindValue(':periodo', $periodo);
    if ($q !== '') $stmt->bindValue(':q', '%' . $q . '%');
    $stmt->bindValue(':limitPlus', (int)$limitPlus, PDO::PARAM_INT);
    $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);

    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // ✅ has_more real: si vino > limit, recortamos
    $hasMore = count($rows) > $limit;
    if ($hasMore) $rows = array_slice($rows, 0, $limit);

    $data = [];
    foreach ($rows as $r) {
      $id_detalle_final = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

      $data[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)($r['fecha'] ?? ''),

        // ✅ devolvemos ambos por compat: backend standard + UI nueva
        'periodo' => (string)($r['periodo'] ?? ''),                 // YYYY-MM
        'periodo_ui' => periodo_yyyymm_to_mmyyyy((string)($r['periodo'] ?? '')), // MM-YYYY

        'id_tipo_operacion' => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
        'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cuenta_corriente' => $r['id_cuenta_corriente'] === null ? null : (int)$r['id_cuenta_corriente'],
        'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
        'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
        'id_detalle' => $id_detalle_final,
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],

        'monto_total' => (float)($r['monto_total_final'] ?? 0),

        // primer item (si existe)
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

    $nextOffset = $hasMore ? ($offset + $limit) : null;

    ok([
      'movimientos' => $data,

      // ✅ paginado
      'limit' => $limit,
      'offset' => $offset,
      'has_more' => $hasMore,
      'next_offset' => $nextOffset,

      // ✅ conteo real (para mostrar “X registros” bien)
      'total_count' => $total_count,

      // ✅ para debug/compat
      'periodo_norm' => $periodo,          // YYYY-MM
      'periodo_ui' => periodo_yyyymm_to_mmyyyy($periodo), // MM-YYYY
    ]);
  } catch (Throwable $e) {
    fail('No se pudieron cargar movimientos. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR MOVIMIENTO (POST JSON)
   ✅ periodo flexible (MM-YYYY incluido)
========================================================= */
function movimientos_crear(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $fecha = as_date_or_null($in['fecha'] ?? null);

  $periodoRaw = (string)($in['periodo'] ?? '');
  $periodo = normalize_periodo_to_yyyymm($periodoRaw);

  // si no vino periodo, lo sacamos de la fecha
  if ($periodo === '' && $fecha) $periodo = substr($fecha, 0, 7); // YYYY-MM

  if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) {
    fail('Período inválido. Acepta YYYY-MM o MM-YYYY (y variantes con /).');
  }

  $id_tipo_operacion = as_int_or_null($in['id_tipo_operacion'] ?? null)
    ?? as_int_or_null($in['id_tipo_movimiento'] ?? null)
    ?? 1;

  $id_clasificacion     = as_int_or_null($in['id_clasificacion'] ?? null);
  $id_tipo_venta        = as_int_or_null($in['id_tipo_venta'] ?? null);
  $id_cuenta_corriente  = as_int_or_null($in['id_cuenta_corriente'] ?? null);
  $id_cliente           = as_int_or_null($in['id_cliente'] ?? null);
  $id_proveedor         = as_int_or_null($in['id_proveedor'] ?? null);
  $id_detalle           = as_int_or_null($in['id_detalle'] ?? null);
  $id_medio_pago        = as_int_or_null($in['id_medio_pago'] ?? null);

  $monto_total = as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2);
  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');

  // estos vienen del modal (si mandás items)
  $item_cantidad = array_key_exists('cantidad', $in) ? as_dec($in['cantidad'], 3) : null;
  $item_precio   = array_key_exists('precio', $in) ? as_dec($in['precio'], 2) : null;
  $item_iva_pct  = array_key_exists('iva_pct', $in) ? as_dec($in['iva_pct'], 2) : null;
  $item_subtotal = array_key_exists('subtotal', $in) ? as_dec($in['subtotal'], 2) : null;
  $item_iva_monto= array_key_exists('iva_monto', $in) ? as_dec($in['iva_monto'], 2) : null;
  $item_total    = array_key_exists('total', $in) ? as_dec($in['total'], 2) : null;

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
      'periodo' => $periodo,
      'periodo_ui' => periodo_yyyymm_to_mmyyyy($periodo),
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR BATCH (POST JSON)
   ✅ periodo flexible (MM-YYYY incluido)
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

      $fecha = as_date_or_null($one['fecha'] ?? null);

      $periodoRaw = (string)($one['periodo'] ?? '');
      $periodo = normalize_periodo_to_yyyymm($periodoRaw);
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
          ':cantidad' => array_key_exists('cantidad', $one) ? as_dec($one['cantidad'], 3) : 1.000,
          ':precio' => array_key_exists('precio', $one) ? as_dec($one['precio'], 2) : 0.00,
          ':iva_pct' => array_key_exists('iva_pct', $one) ? as_dec($one['iva_pct'], 2) : 0.00,
          ':subtotal' => array_key_exists('subtotal', $one) ? as_dec($one['subtotal'], 2) : 0.00,
          ':iva_monto' => array_key_exists('iva_monto', $one) ? as_dec($one['iva_monto'], 2) : 0.00,
          ':total' => array_key_exists('total', $one) ? as_dec($one['total'], 2) : $monto_total,
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
   ACTUALIZAR MOVIMIENTO (POST JSON)
   ✅ periodo flexible (MM-YYYY incluido)
========================================================= */
function movimientos_actualizar(PDO $pdo): void {
  require_post();
  $in = read_json_body();

  $id_movimiento = as_int_or_null($in['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $old = load_movimiento_or_fail($pdo, $id_movimiento);

  $fecha = as_date_or_null($in['fecha'] ?? ($old['fecha'] ?? null));

  $periodoRaw = (string)($in['periodo'] ?? ($old['periodo'] ?? ''));
  $periodo = normalize_periodo_to_yyyymm($periodoRaw);
  if ($periodo === '' && $fecha) $periodo = substr((string)$fecha, 0, 7);

  if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) {
    fail('Período inválido. Acepta YYYY-MM o MM-YYYY (y variantes con /).');
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

  $monto_total = (array_key_exists('monto_total', $in) || array_key_exists('total', $in))
    ? as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2)
    : as_dec($old['monto_total'] ?? 0, 2);

  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');

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
    ok([
      'id_movimiento' => $id_movimiento,
      'periodo' => $periodo,
      'periodo_ui' => periodo_yyyymm_to_mmyyyy($periodo),
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR MOVIMIENTO (POST JSON)
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
