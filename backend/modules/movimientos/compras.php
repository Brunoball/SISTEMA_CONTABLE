<?php
// backend/modules/movimientos/compras.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
// ✅ agregado X-Session para multi-tenant
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
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
function today_iso(): string { return date('Y-m-d'); }
function periodo_from_fecha(string $fechaISO): string {
  if (preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $fechaISO)) return substr($fechaISO, 0, 7);
  return date('Y-m');
}
function is_valid_fecha(string $f): bool { return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f); }
function is_valid_periodo(string $p): bool { return (bool)preg_match('/^\d{4}\-\d{2}$/', $p); }

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
  auditar($pdo, $idUsuario, 'compras', $accion, $entidad, $idEntidad, $detalle);
}

/* =========================================================
   Constantes / helpers de tipo_operacion
========================================================= */
function get_tipo_operacion_id_compra(PDO $pdo): int {
  $st = $pdo->prepare("SELECT id_tipo_operacion FROM tipos_operacion WHERE activo = 1 AND UPPER(nombre) = 'COMPRA' LIMIT 1");
  $st->execute();
  $id = $st->fetchColumn();
  return $id ? (int)$id : 0;
}

/* =========================================================
   Items helper (1er item)
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
  $precio   = $precio   !== null ? (float)$precio   : 0.0;
  $iva_pct  = $iva_pct  !== null ? (float)$iva_pct  : 0.0;

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
   VALIDACIÓN de compra
========================================================= */
function validar_compra_or_fail(PDO $pdo, array $src): array {
  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) $fecha = today_iso();

  $periodo = trim((string)($src['periodo'] ?? ''));
  if ($periodo === '' || !is_valid_periodo($periodo)) $periodo = periodo_from_fecha($fecha);

  $id_clasificacion    = n_int($src['id_clasificacion'] ?? null);
  $id_medio_pago       = n_int($src['id_medio_pago'] ?? null);
  $id_cuenta_corriente = n_int($src['id_cuenta_corriente'] ?? null);

  $id_proveedor = n_int($src['id_proveedor'] ?? null);
  $id_detalle   = n_int($src['id_detalle'] ?? null);

  $monto_total = n_float($src['monto_total'] ?? null);

  // ✅ tipo_operacion COMPRA (obligatorio y fijo)
  $id_tipo_operacion_compra = get_tipo_operacion_id_compra($pdo);
  if ($id_tipo_operacion_compra <= 0) {
    fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
  }

  if (!$id_proveedor || $id_proveedor <= 0) fail('En Compras el Proveedor es obligatorio.');
  if (!$id_detalle || $id_detalle <= 0) fail('En Compras el Detalle es obligatorio.');

  // ✅ coherencia pago: exactamente uno
  $hasMP = ($id_medio_pago !== null && $id_medio_pago > 0);
  $hasCC = ($id_cuenta_corriente !== null && $id_cuenta_corriente > 0);
  if ($hasMP && $hasCC) fail('Compra inválida: no puede tener medio_pago y cuenta_corriente a la vez.');
  if (!$hasMP && !$hasCC) fail('Compra inválida: debe tener medio_pago (contado) o cuenta_corriente (corriente).');

  if ($hasMP) $id_cuenta_corriente = null;
  if ($hasCC) $id_medio_pago = null;

  $item = item_payload_from_src($src, (float)($monto_total ?? 0.0), (int)$id_detalle);
  $totalCabecera = (float)$item['total'];

  return [
    'fecha' => $fecha,
    'periodo' => $periodo,
    'id_tipo_operacion' => $id_tipo_operacion_compra,
    'id_clasificacion' => $id_clasificacion,
    'id_tipo_venta' => null,
    'id_cliente' => null,
    'id_medio_pago' => $id_medio_pago,
    'id_cuenta_corriente' => $id_cuenta_corriente,
    'id_proveedor' => $id_proveedor,
    'id_detalle' => $id_detalle,
    'monto_total' => $totalCabecera,
    'item' => $item,
  ];
}

/* =========================================================
   LISTAR COMPRAS (GET)
========================================================= */
function compras_listar(PDO $pdo): void {
  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  $q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $idCompra = get_tipo_operacion_id_compra($pdo);
  if ($idCompra <= 0) fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");

  $where = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :idCompra";
  $params[':idCompra'] = $idCompra;

  $where[] = "m.id_proveedor IS NOT NULL";
  $where[] = "(m.id_cliente IS NULL OR m.id_cliente = 0)";
  $where[] = "(m.id_tipo_venta IS NULL OR m.id_tipo_venta = 0)";

  $where[] = "(
      (m.id_medio_pago IS NOT NULL AND (m.id_cuenta_corriente IS NULL OR m.id_cuenta_corriente = 0))
      OR
      (m.id_cuenta_corriente IS NOT NULL AND (m.id_medio_pago IS NULL OR m.id_medio_pago = 0))
    )";

  if ($periodo !== '') {
    $where[] = "m.periodo = :periodo";
    $params[':periodo'] = $periodo;
  }

  $sql = "
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

      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,
      COALESCE(c.nombre,'')    AS clasificacion,
      COALESCE(cc.nombre,'')   AS cuenta_corriente,
      COALESCE(pr.nombre,'')   AS proveedor,

      COALESCE(di.nombre, d.nombre, '') AS detalle,
      COALESCE(mp.nombre,'') AS medio_pago_nombre,

      m.created_at
    FROM movimientos m
      LEFT JOIN tipos_operacion tope   ON tope.id_tipo_operacion = m.id_tipo_operacion
      LEFT JOIN clasificaciones c       ON c.id_clasificacion = m.id_clasificacion
      LEFT JOIN cuentas_corrientes cc   ON cc.id_cuenta_corriente = m.id_cuenta_corriente
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
      UPPER(COALESCE(cc.nombre,''))  LIKE UPPER(:q2) OR
      UPPER(COALESCE(pr.nombre,''))  LIKE UPPER(:q3) OR
      UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q4) OR
      UPPER(COALESCE(mp.nombre,''))  LIKE UPPER(:q5)
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
  }

  $sql .= " WHERE " . implode(" AND ", $where);
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

      'id_tipo_operacion' => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
      'tipo_operacion' => (string)($r['tipo_operacion_nombre'] ?? ''),

      'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta' => null,
      'id_cuenta_corriente' => $r['id_cuenta_corriente'] === null ? null : (int)$r['id_cuenta_corriente'],
      'id_cliente' => null,
      'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
      'id_detalle' => $id_detalle_final,

      'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
      'medio_pago_nombre' => (string)($r['medio_pago_nombre'] ?? ''),

      'monto_total' => (float)$r['monto_total_final'],

      'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
      'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
      'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
      'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
      'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

      'clasificacion' => (string)($r['clasificacion'] ?? ''),
      'cuenta_corriente' => (string)($r['cuenta_corriente'] ?? ''),
      'proveedor' => (string)($r['proveedor'] ?? ''),
      'detalle' => (string)($r['detalle'] ?? ''),
      'created_at' => (string)($r['created_at'] ?? ''),
    ];
  }

  ok(['compras' => $data]);
}

/* =========================================================
   CREAR 1 COMPRA (POST)
========================================================= */
function compras_crear(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $v = validar_compra_or_fail($pdo, $src);

  try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha, periodo,
        id_tipo_operacion,
        id_clasificacion, id_tipo_venta, id_cuenta_corriente,
        id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha, :periodo,
        :id_tipo_operacion,
        :id_clasificacion, NULL, :id_cuenta_corriente,
        NULL, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago
      )
    ");

    $stmt->execute([
      ':fecha' => $v['fecha'],
      ':periodo' => $v['periodo'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_cuenta_corriente' => $v['id_cuenta_corriente'],
      ':id_proveedor' => $v['id_proveedor'],
      ':id_detalle' => $v['id_detalle'],
      ':monto_total' => $v['monto_total'],
      ':id_medio_pago' => $v['id_medio_pago'],
    ]);

    $newId = (int)$pdo->lastInsertId();

    $it = $v['item'];
    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");
    $insItem->execute([
      ':id_movimiento' => $newId,
      ':id_detalle' => $it['id_detalle'],
      ':cantidad' => $it['cantidad'],
      ':precio' => $it['precio'],
      ':iva_pct' => $it['iva_pct'],
      ':subtotal' => $it['subtotal'],
      ':iva_monto' => $it['iva_monto'],
      ':total' => $it['total'],
    ]);

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'crear', 'compras', $newId, [
      'nuevo' => [
        'movimiento' => [
          'fecha' => $v['fecha'],
          'periodo' => $v['periodo'],
          'id_tipo_operacion' => $v['id_tipo_operacion'],
          'id_clasificacion' => $v['id_clasificacion'],
          'id_cuenta_corriente' => $v['id_cuenta_corriente'],
          'id_proveedor' => $v['id_proveedor'],
          'id_detalle' => $v['id_detalle'],
          'monto_total' => $v['monto_total'],
          'id_medio_pago' => $v['id_medio_pago'],
        ],
        'item' => $it,
      ]
    ]);

    ok(['id_movimiento' => $newId]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear la compra. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR BATCH (POST)
========================================================= */
function compras_crear_batch(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request(is_array($src) ? [] : $src);

  $items = [];
  if (is_array($src) && array_keys($src) === range(0, count($src) - 1)) {
    $items = $src;
  } elseif (is_array($src) && isset($src['items']) && is_array($src['items'])) {
    $items = $src['items'];
  }

  if (!$items || !is_array($items)) fail('Batch inválido: faltan items.');

  try {
    $pdo->beginTransaction();

    $ids = [];
    $auditPack = [];

    foreach ($items as $i => $one) {
      if (!is_array($one)) fail("Ítem batch inválido en índice $i.");

      $v = validar_compra_or_fail($pdo, $one);

      $stmt = $pdo->prepare("
        INSERT INTO movimientos (
          fecha, periodo,
          id_tipo_operacion,
          id_clasificacion, id_tipo_venta, id_cuenta_corriente,
          id_cliente, id_proveedor, id_detalle,
          monto_total, id_medio_pago
        ) VALUES (
          :fecha, :periodo,
          :id_tipo_operacion,
          :id_clasificacion, NULL, :id_cuenta_corriente,
          NULL, :id_proveedor, :id_detalle,
          :monto_total, :id_medio_pago
        )
      ");
      $stmt->execute([
        ':fecha' => $v['fecha'],
        ':periodo' => $v['periodo'],
        ':id_tipo_operacion' => $v['id_tipo_operacion'],
        ':id_clasificacion' => $v['id_clasificacion'],
        ':id_cuenta_corriente' => $v['id_cuenta_corriente'],
        ':id_proveedor' => $v['id_proveedor'],
        ':id_detalle' => $v['id_detalle'],
        ':monto_total' => $v['monto_total'],
        ':id_medio_pago' => $v['id_medio_pago'],
      ]);

      $newId = (int)$pdo->lastInsertId();

      $it = $v['item'];
      $insItem = $pdo->prepare("
        INSERT INTO movimientos_items
          (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
        VALUES
          (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
      ");
      $insItem->execute([
        ':id_movimiento' => $newId,
        ':id_detalle' => $it['id_detalle'],
        ':cantidad' => $it['cantidad'],
        ':precio' => $it['precio'],
        ':iva_pct' => $it['iva_pct'],
        ':subtotal' => $it['subtotal'],
        ':iva_monto' => $it['iva_monto'],
        ':total' => $it['total'],
      ]);

      $ids[] = $newId;
      $auditPack[] = [
        'id' => $newId,
        'fecha' => $v['fecha'],
        'periodo' => $v['periodo'],
        'id_tipo_operacion' => $v['id_tipo_operacion'],
        'id_proveedor' => $v['id_proveedor'],
        'id_medio_pago' => $v['id_medio_pago'],
        'id_cuenta_corriente' => $v['id_cuenta_corriente'],
        'monto_total' => $v['monto_total'],
        'item' => $it,
      ];
    }

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'crear_batch', 'compras', null, [
      'cantidad' => count($ids),
      'ids' => $ids,
      'items' => $auditPack,
    ]);

    ok(['creados' => count($ids), 'ids' => $ids]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el batch de compras. ' . $e->getMessage());
  }
}

/* =========================================================
   ACTUALIZAR COMPRA (POST)
========================================================= */
function compras_actualizar(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $id_movimiento = n_int($src['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id_movimiento]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La compra no existe: ' . $id_movimiento);

  $idCompra = get_tipo_operacion_id_compra($pdo);
  if ($idCompra <= 0) fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idCompra) {
    fail('Este movimiento no es una compra (tipo_operacion).');
  }

  $merge = $src;
  foreach ([
    'fecha','periodo','id_clasificacion','id_medio_pago','id_cuenta_corriente',
    'id_proveedor','id_detalle','monto_total','cantidad','precio','iva_pct','subtotal','iva_monto','total'
  ] as $k) {
    if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
      $merge[$k] = $before[$k];
    }
  }

  $v = validar_compra_or_fail($pdo, $merge);

  try {
    $pdo->beginTransaction();

    $upd = $pdo->prepare("
      UPDATE movimientos SET
        fecha = :fecha,
        periodo = :periodo,
        id_tipo_operacion = :id_tipo_operacion,
        id_clasificacion = :id_clasificacion,
        id_tipo_venta = NULL,
        id_cuenta_corriente = :id_cuenta_corriente,
        id_cliente = NULL,
        id_proveedor = :id_proveedor,
        id_detalle = :id_detalle,
        monto_total = :monto_total,
        id_medio_pago = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ");
    $upd->execute([
      ':fecha' => $v['fecha'],
      ':periodo' => $v['periodo'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_cuenta_corriente' => $v['id_cuenta_corriente'],
      ':id_proveedor' => $v['id_proveedor'],
      ':id_detalle' => $v['id_detalle'],
      ':monto_total' => $v['monto_total'],
      ':id_medio_pago' => $v['id_medio_pago'],
      ':id_movimiento' => $id_movimiento,
    ]);

    $it = $v['item'];

    $getFirst = $pdo->prepare("SELECT id_item FROM movimientos_items WHERE id_movimiento = :id ORDER BY id_item ASC LIMIT 1");
    $getFirst->execute([':id' => $id_movimiento]);
    $first = $getFirst->fetch(PDO::FETCH_ASSOC);

    if ($first && !empty($first['id_item'])) {
      $id_item = (int)$first['id_item'];
      $updItem = $pdo->prepare("
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
      $updItem->execute([
        ':id_detalle' => $it['id_detalle'],
        ':cantidad' => $it['cantidad'],
        ':precio' => $it['precio'],
        ':iva_pct' => $it['iva_pct'],
        ':subtotal' => $it['subtotal'],
        ':iva_monto' => $it['iva_monto'],
        ':total' => $it['total'],
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
        ':id_detalle' => $it['id_detalle'],
        ':cantidad' => $it['cantidad'],
        ':precio' => $it['precio'],
        ':iva_pct' => $it['iva_pct'],
        ':subtotal' => $it['subtotal'],
        ':iva_monto' => $it['iva_monto'],
        ':total' => $it['total'],
      ]);
    }

    $pdo->commit();

    $afterSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $afterSt->execute([':id' => $id_movimiento]);
    $after = $afterSt->fetch(PDO::FETCH_ASSOC);

    audit_safe($pdo, $idUsuario, 'actualizar', 'compras', $id_movimiento, [
      'antes' => $before,
      'despues' => $after ?: null,
      'item' => $it,
    ]);

    ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar la compra. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR COMPRA
========================================================= */
function compras_eliminar(PDO $pdo): void {
  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
  $id = n_int($id);
  if (!$id) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La compra no existe.');

  $idCompra = get_tipo_operacion_id_compra($pdo);
  if ($idCompra <= 0) fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idCompra) {
    fail('Este movimiento no es una compra (tipo_operacion).');
  }

  try {
    $stmt = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id");
    $stmt->execute([':id' => $id]);

    audit_safe($pdo, $idUsuario, 'eliminar', 'compras', $id, [
      'eliminado' => true,
      'antes' => $before ?: null,
    ]);

    ok(['eliminado' => true, 'id_movimiento' => $id]);
  } catch (Throwable $e) {
    fail('No se pudo eliminar la compra. ' . $e->getMessage());
  }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

try {
  switch ($action) {
    case 'compras_listar':
      compras_listar($pdo);
      break;

    case 'compras_crear':
      compras_crear($pdo);
      break;

    case 'compras_crear_batch':
      compras_crear_batch($pdo);
      break;

    case 'compras_actualizar':
      compras_actualizar($pdo);
      break;

    case 'compras_eliminar':
      compras_eliminar($pdo);
      break;

    default:
      fail('Acción no válida en compras: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en compras: ' . $e->getMessage());
}
