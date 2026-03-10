<?php
// backend/modules/movimientos/ventas.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

// ✅ multi-tenant: $pdo viene desde routes/api.php (tenant_resolver)
require_once __DIR__ . '/../../utils/auditoria.php';

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
function is_valid_fecha(string $f): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f);
}
function norm_text(string $s): string {
  $s = mb_strtolower(trim($s), 'UTF-8');
  $s = str_replace(
    ['á','é','í','ó','ú','ä','ë','ï','ö','ü','ñ'],
    ['a','e','i','o','u','a','e','i','o','u','n'],
    $s
  );
  return $s;
}

/* ----------------- PDO check ----------------- */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('No hay conexión a la base de datos (PDO no disponible).');
}

/* =========================================================
   idUsuario (JWT/body/X-Session)
========================================================= */
function get_header_value(string $key): string {
  $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = $_SERVER[$serverKey] ?? '';
  if (!is_string($v)) $v = '';
  return trim($v);
}
function get_bearer_token(): string {
  $h = get_header_value('Authorization');
  if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
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
function get_id_usuario_from_x_session(PDO $pdo): int {
  $sessionKey = get_header_value('X-Session');
  if ($sessionKey === '') return 0;

  try {
    $chk = $pdo->query("SHOW TABLES LIKE 'sesiones'");
    $exists = $chk ? (bool)$chk->fetchColumn() : false;
    if (!$exists) return 0;

    $st = $pdo->prepare("
      SELECT id_usuario
      FROM sesiones
      WHERE session_key = :k
      LIMIT 1
    ");
    $st->execute([':k' => $sessionKey]);
    $id = $st->fetchColumn();
    $id = is_numeric($id) ? (int)$id : 0;
    return $id > 0 ? $id : 0;
  } catch (Throwable $e) {
    return 0;
  }
}
function get_id_usuario_from_request(PDO $pdo, array $body = []): int {
  // 1) JWT
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

  // 2) body / post / get
  $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
  if (is_numeric($id)) {
    $id = (int)$id;
    if ($id > 0) return $id;
  }

  // 3) X-Session
  $idSess = get_id_usuario_from_x_session($pdo);
  if ($idSess > 0) return $idSess;

  return 0;
}

function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
  if ($idUsuario <= 0) return;
  auditar($pdo, $idUsuario, 'ventas', $accion, $entidad, $idEntidad, $detalle);
}

/* =========================================================
   ✅ FIX: tipo_operacion VENTA = 1 (FIJO)
========================================================= */
function get_tipo_operacion_id_venta(PDO $pdo): int {
  return 1;
}

/* =========================================================
   Tipo venta -> reglas (contado/corriente)
========================================================= */
function get_tipo_venta_nombre(PDO $pdo, ?int $idTipoVenta): string {
  if (!$idTipoVenta || $idTipoVenta <= 0) return '';
  $st = $pdo->prepare("SELECT nombre FROM tipos_venta WHERE id_tipo_venta = :id LIMIT 1");
  $st->execute([':id' => $idTipoVenta]);
  $row = $st->fetch(PDO::FETCH_ASSOC);
  return isset($row['nombre']) ? (string)$row['nombre'] : '';
}
function tipo_venta_is_contado(string $nombre): bool {
  $n = norm_text($nombre);
  return (strpos($n, 'contado') !== false) || (strpos($n, 'efectivo') !== false);
}
function tipo_venta_is_corriente(string $nombre): bool {
  $n = norm_text($nombre);
  return (strpos($n, 'corriente') !== false) || (strpos($n, 'cuenta corriente') !== false);
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
   ✅ VALIDACIÓN Venta
========================================================= */
function validar_venta_or_fail(PDO $pdo, array $src): array {
  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) $fecha = today_iso();

  $id_clasificacion = n_int($src['id_clasificacion'] ?? null);
  $id_tipo_venta    = n_int($src['id_tipo_venta'] ?? null);
  $id_medio_pago    = n_int($src['id_medio_pago'] ?? null);
  $id_cliente       = n_int($src['id_cliente'] ?? null);
  $id_detalle       = n_int($src['id_detalle'] ?? null);

  $monto_total = n_float($src['monto_total'] ?? null);

  $id_tipo_operacion_venta = get_tipo_operacion_id_venta($pdo);
  if ($id_tipo_operacion_venta <= 0) fail("Tipo de operación VENTA inválido (id <= 0).");

  if (!$id_cliente || $id_cliente <= 0) fail('En Ventas el Cliente es obligatorio.');
  if (!$id_tipo_venta || $id_tipo_venta <= 0) fail('En Ventas la Forma de venta (Tipo venta) es obligatoria.');
  if (!$id_detalle || $id_detalle <= 0) fail('En Ventas el Detalle es obligatorio.');

  $tipoVentaNombre = get_tipo_venta_nombre($pdo, $id_tipo_venta);
  $isContado = tipo_venta_is_contado($tipoVentaNombre);
  $isCorriente = tipo_venta_is_corriente($tipoVentaNombre);

  if ($isContado) {
    if (!$id_medio_pago || $id_medio_pago <= 0) {
      fail('Venta Contado: el Medio de pago es obligatorio.');
    }
  } else {
    $id_medio_pago = null;
  }

  $item = item_payload_from_src($src, (float)($monto_total ?? 0.0), (int)$id_detalle);
  $totalCabecera = (float)$item['total'];

  return [
    'fecha' => $fecha,
    'id_tipo_operacion' => $id_tipo_operacion_venta,
    'id_clasificacion' => $id_clasificacion,
    'id_tipo_venta' => $id_tipo_venta,
    'id_medio_pago' => $id_medio_pago,
    'id_cliente' => $id_cliente,
    'id_proveedor' => null,
    'id_detalle' => $id_detalle,
    'monto_total' => $totalCabecera,
    'tipo_venta_nombre' => $tipoVentaNombre,
    'is_contado' => $isContado,
    'is_corriente' => $isCorriente,
    'item' => $item,
  ];
}

/* =========================================================
   LISTAR VENTAS (GET)
========================================================= */
function ventas_listar(PDO $pdo): void {
  $q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $limit  = isset($_GET['limit'])  ? (int)$_GET['limit']  : 100;
  $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

  if ($limit < 1) $limit = 100;
  if ($limit > 500) $limit = 500;
  if ($offset < 0) $offset = 0;

  $limitPlus = $limit + 1;

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ($idVenta <= 0) fail("Tipo_operacion VENTA inválido.");

  $where = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :idVenta";
  $params[':idVenta'] = $idVenta;

  $where[] = "m.id_cliente IS NOT NULL";
  $where[] = "(m.id_proveedor IS NULL OR m.id_proveedor = 0)";
  $where[] = "m.id_tipo_venta IS NOT NULL";

  $sql = "
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
      m.id_comprobante,

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
      COALESCE(cl.nombre,'') AS cliente,
      COALESCE(pr.nombre,'') AS proveedor,

      COALESCE(di.nombre, d.nombre, '') AS detalle,
      COALESCE(mp.nombre,'') AS medio_pago_nombre,

      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,
      COALESCE(ca.archivo_url,'') AS comprobante_url,

      m.created_at
    FROM movimientos m
      LEFT JOIN tipos_operacion tope   ON tope.id_tipo_operacion = m.id_tipo_operacion
      LEFT JOIN clasificaciones c      ON c.id_clasificacion = m.id_clasificacion
      LEFT JOIN tipos_venta tv         ON tv.id_tipo_venta = m.id_tipo_venta
      LEFT JOIN clientes cl            ON cl.id_cliente = m.id_cliente
      LEFT JOIN proveedores pr         ON pr.id_proveedor = m.id_proveedor
      LEFT JOIN detalles d             ON d.id_detalle = m.id_detalle
      LEFT JOIN medios_pago mp         ON mp.id_medio_pago = m.id_medio_pago
      LEFT JOIN comprobantes_archivos ca ON ca.id_comprobante = m.id_comprobante

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
      UPPER(COALESCE(cl.nombre,''))  LIKE UPPER(:q3) OR
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
  $sql .= " LIMIT :lim OFFSET :off";

  $stmt = $pdo->prepare($sql);
  foreach ($params as $k => $v) $stmt->bindValue($k, $v);
  $stmt->bindValue(':lim', $limitPlus, PDO::PARAM_INT);
  $stmt->bindValue(':off', $offset, PDO::PARAM_INT);

  $stmt->execute();
  $rowsAll = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $hasMore = count($rowsAll) > $limit;
  $rows = $hasMore ? array_slice($rowsAll, 0, $limit) : $rowsAll;
  $nextOffset = $hasMore ? ($offset + $limit) : null;

  $data = [];
  foreach ($rows as $r) {
    $id_detalle_final = $r['item_id_detalle'] !== null
      ? (int)$r['item_id_detalle']
      : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

    $tipoVentaTxt = trim((string)($r['tipo_venta'] ?? ''));
    $medioPagoTxt = trim((string)($r['medio_pago_nombre'] ?? ''));

    $data[] = [
      'id_movimiento' => (int)$r['id_movimiento'],
      'fecha' => (string)$r['fecha'],

      'id_tipo_operacion' => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
      'tipo_operacion' => (string)($r['tipo_operacion_nombre'] ?? ''),

      'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
      'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
      'id_detalle' => $id_detalle_final,

      'pago_tipo_venta' => $tipoVentaTxt,
      'medio_pago_nombre' => $medioPagoTxt,

      'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
      'monto_total' => (float)$r['monto_total_final'],

      'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
      'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
      'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
      'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
      'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

      'id_comprobante' => $r['id_comprobante'] === null ? null : (int)$r['id_comprobante'],
      'comprobante_url' => (string)($r['comprobante_url'] ?? ''),

      'clasificacion' => (string)($r['clasificacion'] ?? ''),
      'tipo_venta' => $tipoVentaTxt,
      'cliente' => (string)($r['cliente'] ?? ''),
      'proveedor' => (string)($r['proveedor'] ?? ''),
      'detalle' => (string)($r['detalle'] ?? ''),
      'created_at' => (string)($r['created_at'] ?? ''),
    ];
  }

  ok([
    'ventas' => $data,
    'has_more' => $hasMore,
    'next_offset' => $nextOffset,
    'limit' => $limit,
    'offset' => $offset,
  ]);
}

/* =========================================================
   CREAR 1 VENTA (POST)
========================================================= */
function ventas_crear(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($pdo, $src);

  $v = validar_venta_or_fail($pdo, $src);

  try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion, id_tipo_venta,
        id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago, id_comprobante
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion, :id_tipo_venta,
        :id_cliente, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago, NULL
      )
    ");

    $stmt->execute([
      ':fecha' => $v['fecha'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_tipo_venta' => $v['id_tipo_venta'],
      ':id_cliente' => $v['id_cliente'],
      ':id_proveedor' => null,
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

    audit_safe($pdo, $idUsuario, 'crear', 'ventas', $newId, [
      'nuevo' => [
        'movimiento' => [
          'fecha' => $v['fecha'],
          'id_tipo_operacion' => $v['id_tipo_operacion'],
          'id_clasificacion' => $v['id_clasificacion'],
          'id_tipo_venta' => $v['id_tipo_venta'],
          'id_cliente' => $v['id_cliente'],
          'id_detalle' => $v['id_detalle'],
          'monto_total' => $v['monto_total'],
          'id_medio_pago' => $v['id_medio_pago'],
          'tipo_venta_nombre' => $v['tipo_venta_nombre'],
          'id_comprobante' => null,
        ],
        'item' => $it,
      ],
    ]);

    ok(['id_movimiento' => $newId]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear la venta. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR BATCH (POST) - ModalNuevaVenta
========================================================= */
function ventas_crear_batch(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);

  $idUsuario = get_id_usuario_from_request($pdo, is_array($src) ? [] : $src);

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

      $v = validar_venta_or_fail($pdo, $one);

      $stmt = $pdo->prepare("
        INSERT INTO movimientos (
          fecha,
          id_tipo_operacion,
          id_clasificacion, id_tipo_venta,
          id_cliente, id_proveedor, id_detalle,
          monto_total, id_medio_pago, id_comprobante
        ) VALUES (
          :fecha,
          :id_tipo_operacion,
          :id_clasificacion, :id_tipo_venta,
          :id_cliente, :id_proveedor, :id_detalle,
          :monto_total, :id_medio_pago, NULL
        )
      ");
      $stmt->execute([
        ':fecha' => $v['fecha'],
        ':id_tipo_operacion' => $v['id_tipo_operacion'],
        ':id_clasificacion' => $v['id_clasificacion'],
        ':id_tipo_venta' => $v['id_tipo_venta'],
        ':id_cliente' => $v['id_cliente'],
        ':id_proveedor' => null,
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
        'id_tipo_operacion' => $v['id_tipo_operacion'],
        'id_cliente' => $v['id_cliente'],
        'id_tipo_venta' => $v['id_tipo_venta'],
        'tipo_venta_nombre' => $v['tipo_venta_nombre'],
        'id_medio_pago' => $v['id_medio_pago'],
        'monto_total' => $v['monto_total'],
        'id_comprobante' => null,
        'item' => $it,
      ];
    }

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'crear_batch', 'ventas', null, [
      'cantidad' => count($ids),
      'ids' => $ids,
      'items' => $auditPack,
    ]);

    ok(['creados' => count($ids), 'ids' => $ids]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el batch de ventas. ' . $e->getMessage());
  }
}

/* =========================================================
   ACTUALIZAR VENTA (POST)
========================================================= */
function ventas_actualizar(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($pdo, $src);

  $id_movimiento = n_int($src['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id_movimiento]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La venta no existe: ' . $id_movimiento);

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idVenta) {
    fail('Este movimiento no es una venta (tipo_operacion).');
  }

  $merge = $src;
  foreach ([
    'fecha','id_clasificacion','id_tipo_venta','id_medio_pago',
    'id_cliente','id_detalle','monto_total','cantidad','precio','iva_pct','subtotal','iva_monto','total'
  ] as $k) {
    if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
      $merge[$k] = $before[$k];
    }
  }

  $v = validar_venta_or_fail($pdo, $merge);

  try {
    $pdo->beginTransaction();

    $upd = $pdo->prepare("
      UPDATE movimientos SET
        fecha = :fecha,
        id_tipo_operacion = :id_tipo_operacion,
        id_clasificacion = :id_clasificacion,
        id_tipo_venta = :id_tipo_venta,
        id_cliente = :id_cliente,
        id_proveedor = NULL,
        id_detalle = :id_detalle,
        monto_total = :monto_total,
        id_medio_pago = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ");
    $upd->execute([
      ':fecha' => $v['fecha'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_tipo_venta' => $v['id_tipo_venta'],
      ':id_cliente' => $v['id_cliente'],
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

    audit_safe($pdo, $idUsuario, 'actualizar', 'ventas', $id_movimiento, [
      'antes' => $before,
      'despues' => $after ?: null,
      'item' => $it,
    ]);

    ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar la venta. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR VENTA
========================================================= */
function ventas_eliminar(PDO $pdo): void {
  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($pdo, $src);

  $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
  $id = n_int($id);
  if (!$id) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La venta no existe.');

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idVenta) {
    fail('Este movimiento no es una venta (tipo_operacion).');
  }

  try {
    $stmt = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id");
    $stmt->execute([':id' => $id]);

    audit_safe($pdo, $idUsuario, 'eliminar', 'ventas', $id, [
      'eliminado' => true,
      'antes' => $before ?: null,
    ]);

    ok(['eliminado' => true, 'id_movimiento' => $id]);
  } catch (Throwable $e) {
    fail('No se pudo eliminar la venta. ' . $e->getMessage());
  }
}

function facturacion_config_get(PDO $pdo): void
{
    header('Content-Type: application/json; charset=utf-8');

    try {
        $sql = "
            SELECT
                idConfigFacturacion,
                razon_social,
                nombre_fantasia,
                cuit,
                ingresos_brutos,
                condicion_iva,
                domicilio_comercial,
                fecha_inicio_actividades,
                punto_venta,
                tipo_comprobante_default,
                codigo_comprobante,
                email_facturacion,
                telefono_facturacion,
                sitio_web,
                logo_url,
                activo
            FROM config_facturacion
            WHERE activo = 1
            ORDER BY idConfigFacturacion DESC
            LIMIT 1
        ";

        $st = $pdo->query($sql);
        $row = $st ? $st->fetch(PDO::FETCH_ASSOC) : false;

        if (!$row) {
            http_response_code(404);
            echo json_encode([
                'exito' => false,
                'mensaje' => 'No hay configuración de facturación activa.'
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        echo json_encode([
            'exito' => true,
            'config' => $row
        ], JSON_UNESCAPED_UNICODE);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode([
            'exito' => false,
            'mensaje' => 'Error obteniendo config_facturacion.',
            'error' => $e->getMessage()
        ], JSON_UNESCAPED_UNICODE);
    }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

try {
  switch ($action) {
    case 'ventas_listar':
      ventas_listar($pdo);
      break;

    case 'ventas_crear':
      ventas_crear($pdo);
      break;

    case 'ventas_crear_batch':
      ventas_crear_batch($pdo);
      break;

    case 'ventas_actualizar':
      ventas_actualizar($pdo);
      break;

    case 'ventas_eliminar':
      ventas_eliminar($pdo);
      break;

    case 'config_facturacion_get':
      facturacion_config_get($pdo);
      exit;

    default:
      fail('Acción no válida en ventas: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en ventas: ' . $e->getMessage());
}