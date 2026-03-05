<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

/**
 * ✅ ACCIONES:
 * - movimientos_listar (GET)
 *     Acepta DOS formas de pasar el rango:
 *       A) ?periodo=YYYY-MM  (legado)
 *       B) ?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD  (nuevo, desde Calendario)
 * - movimientos_periodos_listar (GET)
 * - movimientos_crear (POST JSON)
 * - movimientos_crear_batch (POST JSON)
 * - movimientos_actualizar (POST JSON)
 * - movimientos_eliminar (POST JSON)
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por routes/api.php (tenant_resolver)
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
  echo json_encode(['exito' => false, 'mensaje' => 'PDO no disponible. Este módulo debe ejecutarse vía routes/api.php (tenant_resolver).'], JSON_UNESCAPED_UNICODE);
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
  if ($raw === false || $raw === '') return [];
  $j = json_decode($raw, true);
  if (!is_array($j)) { if (trim($raw) === '') return []; fail('JSON inválido en body.'); }
  return $j;
}
function require_post(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido. Usá POST.', 200);
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
    if (preg_match('/^\d{1,3}(\.\d{3})*(,\d+)?$/', $s)) { $s = str_replace('.', '', $s); $s = str_replace(',', '.', $s); }
    elseif (preg_match('/^\d{1,3}(,\d{3})*(\.\d+)?$/', $s)) { $s = str_replace(',', '', $s); }
    elseif (substr_count($s, ',') === 1 && substr_count($s, '.') === 0) { $s = str_replace(',', '.', $s); }
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
function normalize_periodo_to_yyyymm(string $p): string {
  $p = trim($p);
  if ($p === '') return '';
  if (preg_match('/^\d{4}\-\d{1,2}$/', $p)) { [$yyyy, $mmRaw] = explode('-', $p); $mm = (int)$mmRaw; if ($mm < 1 || $mm > 12) return $p; return $yyyy . '-' . str_pad((string)$mm, 2, '0', STR_PAD_LEFT); }
  if (preg_match('/^\d{1,2}\-\d{4}$/', $p)) { [$mmRaw, $yyyy] = explode('-', $p); $mm = (int)$mmRaw; if ($mm < 1 || $mm > 12) return $p; return $yyyy . '-' . str_pad((string)$mm, 2, '0', STR_PAD_LEFT); }
  if (preg_match('/^\d{4}\/\d{1,2}$/', $p)) { [$yyyy, $mmRaw] = explode('/', $p); $mm = (int)$mmRaw; if ($mm < 1 || $mm > 12) return $p; return $yyyy . '-' . str_pad((string)$mm, 2, '0', STR_PAD_LEFT); }
  if (preg_match('/^\d{1,2}\/\d{4}$/', $p)) { [$mmRaw, $yyyy] = explode('/', $p); $mm = (int)$mmRaw; if ($mm < 1 || $mm > 12) return $p; return $yyyy . '-' . str_pad((string)$mm, 2, '0', STR_PAD_LEFT); }
  if (preg_match('/^\d{6}$/', $p)) { $yyyy = substr($p, 0, 4); $mm = (int)substr($p, 4, 2); if ($mm < 1 || $mm > 12) return $p; return $yyyy . '-' . str_pad((string)$mm, 2, '0', STR_PAD_LEFT); }
  return $p;
}
function is_valid_periodo_yyyymm(string $p): bool {
  if (!preg_match('/^\d{4}\-\d{2}$/', $p)) return false;
  [, $mm] = explode('-', $p);
  $m = (int)$mm;
  return $m >= 1 && $m <= 12;
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
function build_where_q_fast(string $q, array &$params): string {
  $q = trim($q);
  if ($q === '') return '';
  if (preg_match('/^\d+$/', $q)) { $params[':qid'] = (int)$q; return " AND m.id_movimiento = :qid "; }
  $like = '%' . $q . '%';
  $params[':q_id'] = $like; $params[':q_c'] = $like; $params[':q_tv'] = $like; $params[':q_cc'] = $like;
  $params[':q_cl'] = $like; $params[':q_pr'] = $like; $params[':q_mp'] = $like; $params[':q_d'] = $like;
  return "
    AND (
      CAST(m.id_movimiento AS CHAR) LIKE :q_id OR
      COALESCE(c.nombre,'')  LIKE :q_c  OR
      COALESCE(tv.nombre,'') LIKE :q_tv OR
      COALESCE(cc.nombre,'') LIKE :q_cc OR
      COALESCE(cl.nombre,'') LIKE :q_cl OR
      COALESCE(pr.nombre,'') LIKE :q_pr OR
      COALESCE(mp.nombre,'') LIKE :q_mp OR
      COALESCE(d.nombre,'')  LIKE :q_d
    )
  ";
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action === '') fail('Falta parámetro action.');

/* =========================================================
   LISTAR PERIODOS
========================================================= */
function movimientos_periodos_listar(PDO $pdo): void {
  try {
    $st = $pdo->query("SELECT DISTINCT m.periodo FROM movimientos m WHERE m.periodo IS NOT NULL AND m.periodo <> '' ORDER BY m.periodo DESC");
    $periodos = $st->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $periodos = array_values(array_filter(array_map(fn($p) => trim((string)$p), $periodos)));
    $periodos_ui = array_values(array_map(fn($p) => periodo_yyyymm_to_mmyyyy((string)$p), $periodos));
    ok(['periodos' => $periodos, 'periodos_ui' => $periodos_ui]);
  } catch (Throwable $e) {
    fail('No se pudieron obtener los períodos. ' . $e->getMessage());
  }
}

/* =========================================================
   LISTAR MOVIMIENTOS (GET)
   Acepta:
     A) ?periodo=YYYY-MM          → WHERE m.periodo = :periodo
     B) ?fecha_desde=&fecha_hasta= → WHERE m.fecha BETWEEN :desde AND :hasta
========================================================= */
function movimientos_listar(PDO $pdo): void {
  $periodoRaw  = isset($_GET['periodo'])     ? trim((string)$_GET['periodo'])     : '';
  $fechaDesde  = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta  = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
  $q           = isset($_GET['q'])           ? trim((string)$_GET['q'])           : '';
  $limit       = as_int($_GET['limit']  ?? 300, 300);
  $offset      = as_int($_GET['offset'] ?? 0,   0);
  $includeTotal = as_int($_GET['include_total'] ?? ($_GET['include_count'] ?? 1), 1) === 1;

  if ($limit < 1) $limit = 1;
  if ($limit > 1000) $limit = 1000;
  if ($offset < 0) $offset = 0;

  // ── Resolver modo de filtro ──────────────────────────────
  $useFecha   = false;
  $whereRange = '';
  $rangeParams = [];

  if ($fechaDesde !== '' && $fechaHasta !== '') {
    // Modo B: rango libre
    if (!isValidDate($fechaDesde)) fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaDesde]);
    if (!isValidDate($fechaHasta)) fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaHasta]);
    if ($fechaDesde > $fechaHasta) [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
    $whereRange  = " AND m.fecha BETWEEN :fecha_desde AND :fecha_hasta ";
    $rangeParams = [':fecha_desde' => $fechaDesde, ':fecha_hasta' => $fechaHasta];
    $useFecha    = true;
  } elseif ($periodoRaw !== '') {
    // Modo A: periodo mensual
    $periodo = normalize_periodo_to_yyyymm($periodoRaw);
    if (!is_valid_periodo_yyyymm($periodo)) fail('Período inválido. Formatos aceptados: YYYY-MM o MM-YYYY (y variantes con /).');
    $whereRange  = " AND m.periodo = :periodo ";
    $rangeParams = [':periodo' => $periodo];
  } else {
    fail('Se requiere "fecha_desde"+"fecha_hasta" o "periodo".');
  }
  // ────────────────────────────────────────────────────────

  try {
    $total_count = null;

    if ($includeTotal) {
      $paramsCount = $rangeParams;
      $whereQ = build_where_q_fast($q, $paramsCount);
      $stCount = $pdo->prepare("
        SELECT COUNT(*) AS cnt
        FROM movimientos m
          LEFT JOIN clasificaciones c       ON c.id_clasificacion = m.id_clasificacion
          LEFT JOIN tipos_venta tv          ON tv.id_tipo_venta = m.id_tipo_venta
          LEFT JOIN cuentas_corrientes cc   ON cc.id_cuenta_corriente = m.id_cuenta_corriente
          LEFT JOIN clientes cl             ON cl.id_cliente = m.id_cliente
          LEFT JOIN proveedores pr          ON pr.id_proveedor = m.id_proveedor
          LEFT JOIN medios_pago mp          ON mp.id_medio_pago = m.id_medio_pago
          LEFT JOIN detalles d              ON d.id_detalle = m.id_detalle
        WHERE 1=1 $whereRange $whereQ
      ");
      foreach ($paramsCount as $k => $v) {
        $stCount->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
      }
      $stCount->execute();
      $total_count = (int)($stCount->fetchColumn() ?: 0);
    }

    $limitPlus  = $limit + 1;
    $paramsList = array_merge($rangeParams, [':limitPlus' => (int)$limitPlus, ':offset' => (int)$offset]);
    $whereQ2    = build_where_q_fast($q, $paramsList);

    $sql = "
      WITH mov AS (
        SELECT
          m.id_movimiento, m.fecha, m.periodo,
          m.id_tipo_operacion, m.id_clasificacion, m.id_tipo_venta,
          m.id_cuenta_corriente, m.id_cliente, m.id_proveedor,
          m.id_detalle, m.monto_total, m.id_medio_pago, m.created_at,
          COALESCE(c.nombre,'')  AS clasificacion,
          COALESCE(tv.nombre,'') AS tipo_venta,
          COALESCE(cc.nombre,'') AS cuenta_corriente,
          COALESCE(cl.nombre,'') AS cliente,
          COALESCE(pr.nombre,'') AS proveedor,
          COALESCE(d.nombre,'')  AS detalle_mov,
          COALESCE(mp.nombre,'') AS medio_pago_nombre
        FROM movimientos m
          LEFT JOIN clasificaciones c       ON c.id_clasificacion = m.id_clasificacion
          LEFT JOIN tipos_venta tv          ON tv.id_tipo_venta = m.id_tipo_venta
          LEFT JOIN cuentas_corrientes cc   ON cc.id_cuenta_corriente = m.id_cuenta_corriente
          LEFT JOIN clientes cl             ON cl.id_cliente = m.id_cliente
          LEFT JOIN proveedores pr          ON pr.id_proveedor = m.id_proveedor
          LEFT JOIN detalles d              ON d.id_detalle = m.id_detalle
          LEFT JOIN medios_pago mp          ON mp.id_medio_pago = m.id_medio_pago
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
        INNER JOIN min_item x ON x.id_movimiento = mi1.id_movimiento AND x.min_id_item = mi1.id_item
      )
      SELECT
        m.id_movimiento, m.fecha, m.periodo, m.id_tipo_operacion,
        m.id_clasificacion, m.id_tipo_venta, m.id_cuenta_corriente,
        m.id_cliente, m.id_proveedor, m.id_detalle, m.monto_total, m.id_medio_pago,
        fi.id_detalle AS item_id_detalle, fi.cantidad AS item_cantidad,
        fi.precio AS item_precio, fi.iva_pct AS item_iva_pct,
        fi.subtotal AS item_subtotal, fi.iva_monto AS item_iva_monto, fi.total AS item_total,
        COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
        m.clasificacion, m.tipo_venta, m.cuenta_corriente, m.cliente, m.proveedor,
        COALESCE(di.nombre, m.detalle_mov, '') AS detalle,
        m.medio_pago_nombre, m.created_at
      FROM mov m
        LEFT JOIN items_sum it  ON it.id_movimiento = m.id_movimiento
        LEFT JOIN first_item fi ON fi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles di   ON di.id_detalle = fi.id_detalle
      ORDER BY m.fecha DESC, m.id_movimiento DESC
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($paramsList as $k => $v) {
      if (in_array($k, [':limitPlus',':offset',':qid'], true)) $stmt->bindValue($k, (int)$v, PDO::PARAM_INT);
      else $stmt->bindValue($k, $v);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $hasMore = count($rows) > $limit;
    if ($hasMore) $rows = array_slice($rows, 0, $limit);

    $data = [];
    foreach ($rows as $r) {
      $id_detalle_final = $r['item_id_detalle'] !== null ? (int)$r['item_id_detalle'] : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);
      $data[] = [
        'id_movimiento'    => (int)$r['id_movimiento'],
        'fecha'            => (string)($r['fecha'] ?? ''),
        'periodo'          => (string)($r['periodo'] ?? ''),
        'periodo_ui'       => periodo_yyyymm_to_mmyyyy((string)($r['periodo'] ?? '')),
        'id_tipo_operacion'  => $r['id_tipo_operacion']  === null ? null : (int)$r['id_tipo_operacion'],
        'id_clasificacion'   => $r['id_clasificacion']   === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta'      => $r['id_tipo_venta']      === null ? null : (int)$r['id_tipo_venta'],
        'id_cuenta_corriente'=> $r['id_cuenta_corriente']=== null ? null : (int)$r['id_cuenta_corriente'],
        'id_cliente'         => $r['id_cliente']         === null ? null : (int)$r['id_cliente'],
        'id_proveedor'       => $r['id_proveedor']       === null ? null : (int)$r['id_proveedor'],
        'id_detalle'         => $id_detalle_final,
        'id_medio_pago'      => $r['id_medio_pago']      === null ? null : (int)$r['id_medio_pago'],
        'monto_total'      => (float)($r['monto_total_final'] ?? 0),
        'cantidad'         => $r['item_cantidad']  === null ? null : (float)$r['item_cantidad'],
        'precio'           => $r['item_precio']    === null ? null : (float)$r['item_precio'],
        'iva_pct'          => $r['item_iva_pct']   === null ? null : (float)$r['item_iva_pct'],
        'subtotal'         => $r['item_subtotal']  === null ? null : (float)$r['item_subtotal'],
        'iva_monto'        => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'            => $r['item_total']     === null ? null : (float)$r['item_total'],
        'clasificacion'    => (string)($r['clasificacion']    ?? ''),
        'tipo_venta'       => (string)($r['tipo_venta']       ?? ''),
        'cuenta_corriente' => (string)($r['cuenta_corriente'] ?? ''),
        'cliente'          => (string)($r['cliente']          ?? ''),
        'proveedor'        => (string)($r['proveedor']        ?? ''),
        'detalle'          => (string)($r['detalle']          ?? ''),
        'medio_pago_nombre'=> (string)($r['medio_pago_nombre']?? ''),
        'created_at'       => (string)($r['created_at']       ?? ''),
      ];
    }

    $nextOffset = $hasMore ? ($offset + $limit) : null;
    $out = [
      'movimientos'  => $data,
      'limit'        => $limit,
      'offset'       => $offset,
      'has_more'     => $hasMore,
      'next_offset'  => $nextOffset,
    ];
    if (!$useFecha) $out['periodo_norm'] = $rangeParams[':periodo'] ?? '';
    if ($includeTotal) $out['total_count'] = (int)$total_count;

    ok($out);
  } catch (Throwable $e) {
    fail('No se pudieron cargar movimientos. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR (POST JSON)
========================================================= */
function movimientos_crear(PDO $pdo): void {
  require_post();
  $in = read_json_body();
  $fecha = as_date_or_null($in['fecha'] ?? null);
  $periodoRaw = (string)($in['periodo'] ?? '');
  $periodo = normalize_periodo_to_yyyymm($periodoRaw);
  if ($periodo === '' && $fecha) $periodo = substr($fecha, 0, 7);
  if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) fail('Período inválido. Acepta YYYY-MM o MM-YYYY (y variantes con /).');
  $id_tipo_operacion   = as_int_or_null($in['id_tipo_operacion'] ?? null) ?? as_int_or_null($in['id_tipo_movimiento'] ?? null) ?? 1;
  $id_clasificacion    = as_int_or_null($in['id_clasificacion']    ?? null);
  $id_tipo_venta       = as_int_or_null($in['id_tipo_venta']       ?? null);
  $id_cuenta_corriente = as_int_or_null($in['id_cuenta_corriente'] ?? null);
  $id_cliente          = as_int_or_null($in['id_cliente']          ?? null);
  $id_proveedor        = as_int_or_null($in['id_proveedor']        ?? null);
  $id_detalle          = as_int_or_null($in['id_detalle']          ?? null);
  $id_medio_pago       = as_int_or_null($in['id_medio_pago']       ?? null);
  $monto_total = as_dec($in['monto_total'] ?? ($in['total'] ?? 0), 2);
  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');
  $item_cantidad = array_key_exists('cantidad',  $in) ? as_dec($in['cantidad'],  3) : null;
  $item_precio   = array_key_exists('precio',    $in) ? as_dec($in['precio'],    2) : null;
  $item_iva_pct  = array_key_exists('iva_pct',   $in) ? as_dec($in['iva_pct'],   2) : null;
  $item_subtotal = array_key_exists('subtotal',  $in) ? as_dec($in['subtotal'],  2) : null;
  $item_iva_monto= array_key_exists('iva_monto', $in) ? as_dec($in['iva_monto'], 2) : null;
  $item_total    = array_key_exists('total',     $in) ? as_dec($in['total'],     2) : null;
  try {
    $pdo->beginTransaction();
    $st = $pdo->prepare("INSERT INTO movimientos (fecha,periodo,id_tipo_operacion,id_clasificacion,id_tipo_venta,id_cuenta_corriente,id_cliente,id_proveedor,id_detalle,monto_total,id_medio_pago) VALUES (:fecha,:periodo,:id_tipo_operacion,:id_clasificacion,:id_tipo_venta,:id_cuenta_corriente,:id_cliente,:id_proveedor,:id_detalle,:monto_total,:id_medio_pago)");
    $st->execute([':fecha'=>$fecha,':periodo'=>$periodo,':id_tipo_operacion'=>$id_tipo_operacion,':id_clasificacion'=>$id_clasificacion,':id_tipo_venta'=>$id_tipo_venta,':id_cuenta_corriente'=>$id_cuenta_corriente,':id_cliente'=>$id_cliente,':id_proveedor'=>$id_proveedor,':id_detalle'=>$id_detalle,':monto_total'=>$monto_total,':id_medio_pago'=>$id_medio_pago]);
    $id_movimiento = (int)$pdo->lastInsertId();
    if ($id_movimiento <= 0) throw new RuntimeException('No se pudo obtener el ID del movimiento.');
    if ($id_detalle !== null) {
      $sti = $pdo->prepare("INSERT INTO movimientos_items (id_movimiento,id_detalle,cantidad,precio,iva_pct,subtotal,iva_monto,total) VALUES (:id_movimiento,:id_detalle,:cantidad,:precio,:iva_pct,:subtotal,:iva_monto,:total)");
      $sti->execute([':id_movimiento'=>$id_movimiento,':id_detalle'=>$id_detalle,':cantidad'=>$item_cantidad??1.000,':precio'=>$item_precio??0.00,':iva_pct'=>$item_iva_pct??0.00,':subtotal'=>$item_subtotal??0.00,':iva_monto'=>$item_iva_monto??0.00,':total'=>$item_total??$monto_total]);
    }
    $pdo->commit();
    ok(['id_movimiento'=>$id_movimiento,'periodo'=>$periodo,'periodo_ui'=>periodo_yyyymm_to_mmyyyy($periodo)]);
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); fail('No se pudo crear el movimiento. '.$e->getMessage()); }
}

/* =========================================================
   CREAR BATCH
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
      if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) throw new RuntimeException('Período inválido en batch: '.($one['periodo']??''));
      $id_tipo_operacion   = as_int_or_null($one['id_tipo_operacion']??null)??as_int_or_null($one['id_tipo_movimiento']??null)??1;
      $id_clasificacion    = as_int_or_null($one['id_clasificacion']    ?? null);
      $id_tipo_venta       = as_int_or_null($one['id_tipo_venta']       ?? null);
      $id_cuenta_corriente = as_int_or_null($one['id_cuenta_corriente'] ?? null);
      $id_cliente          = as_int_or_null($one['id_cliente']          ?? null);
      $id_proveedor        = as_int_or_null($one['id_proveedor']        ?? null);
      $id_detalle          = as_int_or_null($one['id_detalle']          ?? null);
      $id_medio_pago       = as_int_or_null($one['id_medio_pago']       ?? null);
      $monto_total = as_dec($one['monto_total']??($one['total']??0), 2);
      if ($monto_total <= 0) throw new RuntimeException('Monto total inválido en batch.');
      $st = $pdo->prepare("INSERT INTO movimientos (fecha,periodo,id_tipo_operacion,id_clasificacion,id_tipo_venta,id_cuenta_corriente,id_cliente,id_proveedor,id_detalle,monto_total,id_medio_pago) VALUES (:fecha,:periodo,:id_tipo_operacion,:id_clasificacion,:id_tipo_venta,:id_cuenta_corriente,:id_cliente,:id_proveedor,:id_detalle,:monto_total,:id_medio_pago)");
      $st->execute([':fecha'=>$fecha,':periodo'=>$periodo,':id_tipo_operacion'=>$id_tipo_operacion,':id_clasificacion'=>$id_clasificacion,':id_tipo_venta'=>$id_tipo_venta,':id_cuenta_corriente'=>$id_cuenta_corriente,':id_cliente'=>$id_cliente,':id_proveedor'=>$id_proveedor,':id_detalle'=>$id_detalle,':monto_total'=>$monto_total,':id_medio_pago'=>$id_medio_pago]);
      $id_movimiento = (int)$pdo->lastInsertId();
      if ($id_movimiento <= 0) throw new RuntimeException('No se pudo obtener ID en batch.');
      $ids[] = $id_movimiento;
      if ($id_detalle !== null) {
        $sti = $pdo->prepare("INSERT INTO movimientos_items (id_movimiento,id_detalle,cantidad,precio,iva_pct,subtotal,iva_monto,total) VALUES (:id_movimiento,:id_detalle,:cantidad,:precio,:iva_pct,:subtotal,:iva_monto,:total)");
        $sti->execute([':id_movimiento'=>$id_movimiento,':id_detalle'=>$id_detalle,':cantidad'=>array_key_exists('cantidad',$one)?as_dec($one['cantidad'],3):1.000,':precio'=>array_key_exists('precio',$one)?as_dec($one['precio'],2):0.00,':iva_pct'=>array_key_exists('iva_pct',$one)?as_dec($one['iva_pct'],2):0.00,':subtotal'=>array_key_exists('subtotal',$one)?as_dec($one['subtotal'],2):0.00,':iva_monto'=>array_key_exists('iva_monto',$one)?as_dec($one['iva_monto'],2):0.00,':total'=>array_key_exists('total',$one)?as_dec($one['total'],2):$monto_total]);
      }
    }
    $pdo->commit();
    ok(['ids_movimientos'=>$ids,'cantidad'=>count($ids)]);
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); fail('No se pudo guardar el batch. '.$e->getMessage()); }
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
  $periodoRaw = (string)($in['periodo'] ?? ($old['periodo'] ?? ''));
  $periodo = normalize_periodo_to_yyyymm($periodoRaw);
  if ($periodo === '' && $fecha) $periodo = substr((string)$fecha, 0, 7);
  if ($periodo === '' || !is_valid_periodo_yyyymm($periodo)) fail('Período inválido. Acepta YYYY-MM o MM-YYYY (y variantes con /).');
  $id_tipo_operacion   = as_int_or_null($in['id_tipo_operacion']??null)??as_int_or_null($in['id_tipo_movimiento']??null)??as_int_or_null($old['id_tipo_operacion']??null)??1;
  $id_clasificacion    = array_key_exists('id_clasificacion',$in)?as_int_or_null($in['id_clasificacion']):as_int_or_null($old['id_clasificacion']??null);
  $id_tipo_venta       = array_key_exists('id_tipo_venta',$in)?as_int_or_null($in['id_tipo_venta']):as_int_or_null($old['id_tipo_venta']??null);
  $id_cuenta_corriente = array_key_exists('id_cuenta_corriente',$in)?as_int_or_null($in['id_cuenta_corriente']):as_int_or_null($old['id_cuenta_corriente']??null);
  $id_cliente          = array_key_exists('id_cliente',$in)?as_int_or_null($in['id_cliente']):as_int_or_null($old['id_cliente']??null);
  $id_proveedor        = array_key_exists('id_proveedor',$in)?as_int_or_null($in['id_proveedor']):as_int_or_null($old['id_proveedor']??null);
  $id_detalle          = array_key_exists('id_detalle',$in)?as_int_or_null($in['id_detalle']):as_int_or_null($old['id_detalle']??null);
  $id_medio_pago       = array_key_exists('id_medio_pago',$in)?as_int_or_null($in['id_medio_pago']):as_int_or_null($old['id_medio_pago']??null);
  $monto_total = (array_key_exists('monto_total',$in)||array_key_exists('total',$in))?as_dec($in['monto_total']??($in['total']??0),2):as_dec($old['monto_total']??0,2);
  if ($monto_total <= 0) fail('Monto total inválido. Debe ser > 0.');
  $item_cantidad = array_key_exists('cantidad',$in)?as_dec($in['cantidad'],3):null;
  $item_precio   = array_key_exists('precio',$in)?as_dec($in['precio'],2):null;
  $item_iva_pct  = array_key_exists('iva_pct',$in)?as_dec($in['iva_pct'],2):null;
  $item_subtotal = array_key_exists('subtotal',$in)?as_dec($in['subtotal'],2):null;
  $item_iva_monto= array_key_exists('iva_monto',$in)?as_dec($in['iva_monto'],2):null;
  $item_total    = array_key_exists('total',$in)?as_dec($in['total'],2):null;
  try {
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE movimientos SET fecha=:fecha,periodo=:periodo,id_tipo_operacion=:id_tipo_operacion,id_clasificacion=:id_clasificacion,id_tipo_venta=:id_tipo_venta,id_cuenta_corriente=:id_cuenta_corriente,id_cliente=:id_cliente,id_proveedor=:id_proveedor,id_detalle=:id_detalle,monto_total=:monto_total,id_medio_pago=:id_medio_pago WHERE id_movimiento=:id_movimiento LIMIT 1")
      ->execute([':fecha'=>$fecha,':periodo'=>$periodo,':id_tipo_operacion'=>$id_tipo_operacion,':id_clasificacion'=>$id_clasificacion,':id_tipo_venta'=>$id_tipo_venta,':id_cuenta_corriente'=>$id_cuenta_corriente,':id_cliente'=>$id_cliente,':id_proveedor'=>$id_proveedor,':id_detalle'=>$id_detalle,':monto_total'=>$monto_total,':id_medio_pago'=>$id_medio_pago,':id_movimiento'=>$id_movimiento]);
    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento=:id")->execute([':id'=>$id_movimiento]);
    if ($id_detalle !== null) {
      $sti = $pdo->prepare("INSERT INTO movimientos_items (id_movimiento,id_detalle,cantidad,precio,iva_pct,subtotal,iva_monto,total) VALUES (:id_movimiento,:id_detalle,:cantidad,:precio,:iva_pct,:subtotal,:iva_monto,:total)");
      $sti->execute([':id_movimiento'=>$id_movimiento,':id_detalle'=>$id_detalle,':cantidad'=>$item_cantidad??1.000,':precio'=>$item_precio??0.00,':iva_pct'=>$item_iva_pct??0.00,':subtotal'=>$item_subtotal??0.00,':iva_monto'=>$item_iva_monto??0.00,':total'=>$item_total??$monto_total]);
    }
    $pdo->commit();
    ok(['id_movimiento'=>$id_movimiento,'periodo'=>$periodo,'periodo_ui'=>periodo_yyyymm_to_mmyyyy($periodo)]);
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); fail('No se pudo actualizar el movimiento. '.$e->getMessage()); }
}

/* =========================================================
   ELIMINAR
========================================================= */
function movimientos_eliminar(PDO $pdo): void {
  require_post();
  $in = read_json_body();
  $id_movimiento = as_int_or_null($_GET['id_movimiento']??null)??as_int_or_null($in['id_movimiento']??null);
  if (!$id_movimiento) fail('Falta id_movimiento.');
  load_movimiento_or_fail($pdo, $id_movimiento);
  try {
    $pdo->beginTransaction();
    $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento=:id")->execute([':id'=>$id_movimiento]);
    $st = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento=:id LIMIT 1");
    $st->execute([':id'=>$id_movimiento]);
    if ($st->rowCount() < 1) throw new RuntimeException('No se pudo eliminar (rowCount=0).');
    $pdo->commit();
    ok(['id_movimiento'=>$id_movimiento]);
  } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); fail('No se pudo eliminar el movimiento. '.$e->getMessage()); }
}

/* =========================================================
   DISPATCH
========================================================= */
try {
  switch ($action) {
    case 'movimientos_listar':            movimientos_listar($pdo);            break;
    case 'movimientos_periodos_listar':   movimientos_periodos_listar($pdo);   break;
    case 'movimientos_crear':             movimientos_crear($pdo);             break;
    case 'movimientos_crear_batch':       movimientos_crear_batch($pdo);       break;
    case 'movimientos_actualizar':        movimientos_actualizar($pdo);        break;
    case 'movimientos_eliminar':          movimientos_eliminar($pdo);          break;
    default: fail('Acción no válida en movimientos: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en movimientos: ' . $e->getMessage());
}