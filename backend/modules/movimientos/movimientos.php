<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php';
require_once __DIR__ . '/../utils/auditoria.php';

/* ----------------- Helpers ----------------- */
function ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}
function read_json_body(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
function n_int($v): ?int {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  $n = (int)$v;
  return $n >= 0 ? $n : null;
}
function n_float($v): ?float {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  return (float)$v;
}
function today_iso(): string {
  return date('Y-m-d');
}
function periodo_from_fecha(string $fechaISO): string {
  // fecha: YYYY-MM-DD => periodo: YYYY-MM
  if (preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $fechaISO)) {
    return substr($fechaISO, 0, 7);
  }
  return date('Y-m');
}
function is_valid_fecha(string $f): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f);
}
function is_valid_periodo(string $p): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p);
}

/* ----------------- PDO check ----------------- */
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('No hay conexión a la base de datos.');
}

/* =========================================================
   idUsuario (token/body)
========================================================= */
function get_bearer_token(): string {
  $h = '';
  if (!empty($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
  elseif (!empty($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];

  $h = trim($h);
  if ($h === '') return '';
  if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
  return '';
}
function base64url_decode(string $s): string {
  $s = str_replace(['-', '_'], ['+', '/'], $s);
  $pad = strlen($s) % 4;
  if ($pad) $s .= str_repeat('=', 4 - $pad);
  $out = base64_decode($s, true);
  return $out === false ? '' : $out;
}
function get_id_usuario_from_request(array $body = []): int {
  $token = get_bearer_token();
  if ($token !== '' && substr_count($token, '.') === 2) {
    $parts = explode('.', $token);
    $payloadJson = base64url_decode($parts[1] ?? '');
    if ($payloadJson !== '') {
      $payload = json_decode($payloadJson, true);
      if (is_array($payload)) {
        $candidates = [
          $payload['idUsuario'] ?? null,
          $payload['id_usuario'] ?? null,
          $payload['uid'] ?? null,
          $payload['sub'] ?? null,
        ];
        foreach ($candidates as $c) {
          if (is_numeric($c)) {
            $id = (int)$c;
            if ($id > 0) return $id;
          }
        }
      }
    }
  }

  $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
  if (is_numeric($id)) {
    $id = (int)$id;
    if ($id > 0) return $id;
  }
  return 0;
}
function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  if ($idUsuario <= 0) return;
  auditar($pdo, $idUsuario, 'movimientos', $accion, $entidad, $idEntidad, $detalle);
}

/* =========================================================
   ACCIÓN
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

if ($action === '') {
  fail('Falta parámetro action.');
}

/* =========================================================
   LISTAR (GET)
========================================================= */
function movimientos_listar(PDO $pdo): void
{
  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  $q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $where = [];
  $params = [];

  if ($periodo !== '') {
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
      m.id_tipo_movimiento,
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
      COALESCE(tm.nombre,'') AS tipo_movimiento,
      COALESCE(cl.nombre,'') AS cliente,
      COALESCE(pr.nombre,'') AS proveedor,

      COALESCE(di.nombre, d.nombre, '') AS detalle,
      COALESCE(mp.nombre,'') AS medio_pago,
      m.created_at
    FROM movimientos m
      LEFT JOIN clasificaciones c       ON c.id_clasificacion = m.id_clasificacion
      LEFT JOIN tipos_venta tv          ON tv.id_tipo_venta = m.id_tipo_venta
      LEFT JOIN cuentas_corrientes cc   ON cc.id_cuenta_corriente = m.id_cuenta_corriente
      LEFT JOIN tipos_movimiento tm     ON tm.id_tipo_movimiento = m.id_tipo_movimiento
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

  // ✅ FIX HY093: NO repetir el mismo placeholder :q con prepares nativos
  if ($q !== '') {
    $like = '%' . $q . '%';

    $where[] = "(
      UPPER(COALESCE(c.nombre,''))   LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))  LIKE UPPER(:q2) OR
      UPPER(COALESCE(cc.nombre,''))  LIKE UPPER(:q3) OR
      UPPER(COALESCE(tm.nombre,''))  LIKE UPPER(:q4) OR
      UPPER(COALESCE(cl.nombre,''))  LIKE UPPER(:q5) OR
      UPPER(COALESCE(pr.nombre,''))  LIKE UPPER(:q6) OR
      UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q7) OR
      UPPER(COALESCE(mp.nombre,''))  LIKE UPPER(:q8)
    )";

    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q6'] = $like;
    $params[':q7'] = $like;
    $params[':q8'] = $like;
  }

  if (!empty($where)) $sql .= " WHERE " . implode(" AND ", $where);
  $sql .= " ORDER BY m.fecha DESC, m.id_movimiento DESC";

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
      'fecha' => (string)$r['fecha'],
      'periodo' => (string)$r['periodo'],

      'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'id_cuenta_corriente' => $r['id_cuenta_corriente'] === null ? null : (int)$r['id_cuenta_corriente'],
      'id_tipo_movimiento' => $r['id_tipo_movimiento'] === null ? null : (int)$r['id_tipo_movimiento'],
      'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
      'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
      'id_detalle' => $id_detalle_final,
      'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],

      'monto_total' => (float)$r['monto_total_final'],

      'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
      'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
      'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
      'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
      'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

      'clasificacion' => (string)$r['clasificacion'],
      'tipo_venta' => (string)$r['tipo_venta'],
      'cuenta_corriente' => (string)$r['cuenta_corriente'],
      'tipo_movimiento' => (string)$r['tipo_movimiento'],
      'cliente' => (string)$r['cliente'],
      'proveedor' => (string)$r['proveedor'],
      'detalle' => (string)$r['detalle'],
      'medio_pago' => (string)$r['medio_pago'],

      'created_at' => (string)($r['created_at'] ?? ''),
    ];
  }

  ok(['movimientos' => $data]);
}

/* =========================================================
   HELPERS ITEMS
========================================================= */
function item_payload_from_src(array $src, float $monto_total, int $id_detalle): array {
  $cantidad  = n_float($src['cantidad']  ?? null);
  $precio    = n_float($src['precio']    ?? null);
  $iva_pct   = n_float($src['iva_pct']   ?? null);
  $subtotal  = n_float($src['subtotal']  ?? null);
  $iva_monto = n_float($src['iva_monto'] ?? null);
  $total     = n_float($src['total']     ?? null);

  $hasItemFields = ($cantidad !== null || $precio !== null || $iva_pct !== null || $subtotal !== null || $iva_monto !== null || $total !== null);

  if (!$hasItemFields) {
    return [
      'id_detalle' => $id_detalle,
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
    'id_detalle' => $id_detalle,
    'cantidad' => $cantidad,
    'precio' => $precio,
    'iva_pct' => $iva_pct,
    'subtotal' => $subtotal,
    'iva_monto' => $iva_monto,
    'total' => $total,
  ];
}

/* =========================================================
   CREAR (POST) - FLEX
   ✅ no obliga ids
   ✅ si falta fecha => hoy
   ✅ si falta periodo => desde fecha
   ✅ si no hay id_detalle => se crea igual sin item
========================================================= */
function movimientos_crear(PDO $pdo): void
{
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) $fecha = today_iso();

  $periodo = trim((string)($src['periodo'] ?? ''));
  if ($periodo === '' || !is_valid_periodo($periodo)) $periodo = periodo_from_fecha($fecha);

  $id_clasificacion   = n_int($src['id_clasificacion'] ?? null);
  $id_tipo_venta      = n_int($src['id_tipo_venta'] ?? null);
  $id_tipo_movimiento = n_int($src['id_tipo_movimiento'] ?? null);
  $id_medio_pago      = n_int($src['id_medio_pago'] ?? null);

  $id_cuenta_corriente = n_int($src['id_cuenta_corriente'] ?? null);
  $id_cliente          = n_int($src['id_cliente'] ?? null);
  $id_proveedor        = n_int($src['id_proveedor'] ?? null);
  $id_detalle          = n_int($src['id_detalle'] ?? null);

  // monto_total puede venir o no; si no viene y hay item => lo calculamos; si no hay item => 0
  $monto_total = n_float($src['monto_total'] ?? null);

  $hasDetalleValido = ($id_detalle !== null && $id_detalle > 0);

  // si hay detalle, armamos item (si no, no insertamos item)
  $item = null;
  if ($hasDetalleValido) {
    $baseMonto = ($monto_total !== null) ? (float)$monto_total : 0.0;
    $item = item_payload_from_src($src, $baseMonto, (int)$id_detalle);
  }

  // total final cabecera: si hay item => item.total, si no => monto_total o 0
  $totalCabecera = 0.0;
  if ($item !== null) $totalCabecera = (float)$item['total'];
  else if ($monto_total !== null) $totalCabecera = (float)$monto_total;

  try {
    $pdo->beginTransaction();

    $sql = "
      INSERT INTO movimientos (
        fecha, periodo,
        id_clasificacion, id_tipo_venta, id_cuenta_corriente,
        id_tipo_movimiento, id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha, :periodo,
        :id_clasificacion, :id_tipo_venta, :id_cuenta_corriente,
        :id_tipo_movimiento, :id_cliente, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago
      )
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
      ':fecha' => $fecha,
      ':periodo' => $periodo,

      ':id_clasificacion' => $id_clasificacion,
      ':id_tipo_venta' => $id_tipo_venta,
      ':id_cuenta_corriente' => $id_cuenta_corriente,
      ':id_tipo_movimiento' => $id_tipo_movimiento,
      ':id_cliente' => $id_cliente,
      ':id_proveedor' => $id_proveedor,
      ':id_detalle' => $hasDetalleValido ? $id_detalle : null,

      ':monto_total' => $totalCabecera,
      ':id_medio_pago' => $id_medio_pago,
    ]);

    $newId = (int)$pdo->lastInsertId();

    // si hay detalle, insertamos item
    if ($item !== null) {
      $insItem = $pdo->prepare("
        INSERT INTO movimientos_items
          (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
        VALUES
          (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
      ");
      $insItem->execute([
        ':id_movimiento' => $newId,
        ':id_detalle' => $item['id_detalle'],
        ':cantidad' => $item['cantidad'],
        ':precio' => $item['precio'],
        ':iva_pct' => $item['iva_pct'],
        ':subtotal' => $item['subtotal'],
        ':iva_monto' => $item['iva_monto'],
        ':total' => $item['total'],
      ]);
    }

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'crear', 'movimientos', $newId, [
      'nuevo' => [
        'fecha' => $fecha,
        'periodo' => $periodo,
        'id_clasificacion' => $id_clasificacion,
        'id_tipo_venta' => $id_tipo_venta,
        'id_cuenta_corriente' => $id_cuenta_corriente,
        'id_tipo_movimiento' => $id_tipo_movimiento,
        'id_cliente' => $id_cliente,
        'id_proveedor' => $id_proveedor,
        'id_detalle' => $hasDetalleValido ? $id_detalle : null,
        'monto_total' => $totalCabecera,
        'id_medio_pago' => $id_medio_pago,
        'item' => $item,
      ]
    ]);

    ok(['id_movimiento' => $newId]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   ACTUALIZAR (POST) - FLEX
   ✅ no obliga ids
   ✅ si falta fecha => mantiene la anterior o hoy
   ✅ si falta periodo => desde fecha
   ✅ si no hay id_detalle => actualiza cabecera y borra item/lo deja? (acá dejamos item como esté)
========================================================= */
function movimientos_actualizar(PDO $pdo): void
{
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $id_movimiento = n_int($src['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id_movimiento]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('El movimiento no existe: ' . $id_movimiento);

  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) {
    $fecha = !empty($before['fecha']) ? (string)$before['fecha'] : today_iso();
  }

  $periodo = trim((string)($src['periodo'] ?? ''));
  if ($periodo === '' || !is_valid_periodo($periodo)) {
    $periodo = periodo_from_fecha($fecha);
  }

  $id_clasificacion   = array_key_exists('id_clasificacion', $src) ? n_int($src['id_clasificacion']) : n_int($before['id_clasificacion'] ?? null);
  $id_tipo_venta      = array_key_exists('id_tipo_venta', $src) ? n_int($src['id_tipo_venta']) : n_int($before['id_tipo_venta'] ?? null);
  $id_tipo_movimiento = array_key_exists('id_tipo_movimiento', $src) ? n_int($src['id_tipo_movimiento']) : n_int($before['id_tipo_movimiento'] ?? null);
  $id_medio_pago      = array_key_exists('id_medio_pago', $src) ? n_int($src['id_medio_pago']) : n_int($before['id_medio_pago'] ?? null);

  $id_cuenta_corriente = array_key_exists('id_cuenta_corriente', $src) ? n_int($src['id_cuenta_corriente']) : n_int($before['id_cuenta_corriente'] ?? null);
  $id_cliente          = array_key_exists('id_cliente', $src) ? n_int($src['id_cliente']) : n_int($before['id_cliente'] ?? null);
  $id_proveedor        = array_key_exists('id_proveedor', $src) ? n_int($src['id_proveedor']) : n_int($before['id_proveedor'] ?? null);

  $id_detalle = array_key_exists('id_detalle', $src) ? n_int($src['id_detalle']) : n_int($before['id_detalle'] ?? null);

  $monto_total_in = array_key_exists('monto_total', $src) ? n_float($src['monto_total']) : null;

  $hasDetalleValido = ($id_detalle !== null && $id_detalle > 0);

  // armamos item solo si hay detalle válido
  $item = null;
  if ($hasDetalleValido) {
    $baseMonto = ($monto_total_in !== null) ? (float)$monto_total_in : 0.0;
    $item = item_payload_from_src($src, $baseMonto, (int)$id_detalle);
  }

  // si hay item => cabecera = item.total; si no => monto_total que venga; si no => mantener
  $totalCabecera = null;
  if ($item !== null) $totalCabecera = (float)$item['total'];
  else if ($monto_total_in !== null) $totalCabecera = (float)$monto_total_in;
  else $totalCabecera = isset($before['monto_total']) ? (float)$before['monto_total'] : 0.0;

  try {
    $pdo->beginTransaction();

    $sql = "
      UPDATE movimientos SET
        fecha = :fecha,
        periodo = :periodo,
        id_clasificacion = :id_clasificacion,
        id_tipo_venta = :id_tipo_venta,
        id_cuenta_corriente = :id_cuenta_corriente,
        id_tipo_movimiento = :id_tipo_movimiento,
        id_cliente = :id_cliente,
        id_proveedor = :id_proveedor,
        id_detalle = :id_detalle,
        monto_total = :monto_total,
        id_medio_pago = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
      ':fecha' => $fecha,
      ':periodo' => $periodo,
      ':id_clasificacion' => $id_clasificacion,
      ':id_tipo_venta' => $id_tipo_venta,
      ':id_cuenta_corriente' => $id_cuenta_corriente,
      ':id_tipo_movimiento' => $id_tipo_movimiento,
      ':id_cliente' => $id_cliente,
      ':id_proveedor' => $id_proveedor,
      ':id_detalle' => $hasDetalleValido ? $id_detalle : null,
      ':monto_total' => $totalCabecera,
      ':id_medio_pago' => $id_medio_pago,
      ':id_movimiento' => $id_movimiento,
    ]);

    // si hay item => update/insert primer item
    if ($item !== null) {
      $getFirst = $pdo->prepare("SELECT id_item FROM movimientos_items WHERE id_movimiento = :id ORDER BY id_item ASC LIMIT 1");
      $getFirst->execute([':id' => $id_movimiento]);
      $first = $getFirst->fetch(PDO::FETCH_ASSOC);

      if ($first && !empty($first['id_item'])) {
        $id_item = (int)$first['id_item'];
        $upd = $pdo->prepare("
          UPDATE movimientos_items SET
            id_detalle = :id_detalle,
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
            (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
          VALUES
            (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
        ");
        $ins->execute([
          ':id_movimiento' => $id_movimiento,
          ':id_detalle' => $item['id_detalle'],
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

    $afterSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $afterSt->execute([':id' => $id_movimiento]);
    $after = $afterSt->fetch(PDO::FETCH_ASSOC);

    audit_safe($pdo, $idUsuario, 'actualizar', 'movimientos', $id_movimiento, [
      'antes' => $before,
      'despues' => $after ?: null,
      'item' => $item,
    ]);

    ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar el movimiento. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR
========================================================= */
function movimientos_eliminar(PDO $pdo): void
{
  $body = read_json_body();
  $idUsuario = get_id_usuario_from_request(!empty($body) ? $body : ($_POST ?? []));

  $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
  $id = n_int($id);
  if (!$id) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);

  try {
    $stmt = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id");
    $stmt->execute([':id' => $id]);

    audit_safe($pdo, $idUsuario, 'eliminar', 'movimientos', $id, [
      'eliminado' => true,
      'antes' => $before ?: null,
    ]);

    ok(['eliminado' => true, 'id_movimiento' => $id]);
  } catch (Throwable $e) {
    fail('No se pudo eliminar. ' . $e->getMessage());
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
    case 'movimientos_crear':
      movimientos_crear($pdo);
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
