<?php
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

global $pdo;

require_once __DIR__ . '/../../utils/auditoria.php';

/* ----------------- Helpers compartidos ----------------- */
if (!function_exists('ok')) {
  function ok(array $arr = []): void {
    echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('fail')) {
  function fail(string $msg, int $httpCode = 200, array $extra = []): void {
    http_response_code($httpCode);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('read_json_body')) {
  function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('n_int')) {
  function n_int($v): ?int {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    $n = (int)$v;
    return $n >= 0 ? $n : null;
  }
}

if (!function_exists('n_float')) {
  function n_float($v): ?float {
    if ($v === null || $v === '') return null;
    if (is_string($v)) {
      $s = trim($v);
      if ($s === '') return null;

      if (preg_match('/^\d{1,3}(\.\d{3})*(,\d+)?$/', $s)) {
        $s = str_replace('.', '', $s);
        $s = str_replace(',', '.', $s);
      } elseif (substr_count($s, ',') === 1 && substr_count($s, '.') === 0) {
        $s = str_replace(',', '.', $s);
      }

      if (!is_numeric($s)) return null;
      return (float)$s;
    }
    if (!is_numeric($v)) return null;
    return (float)$v;
  }
}

if (!function_exists('today_iso')) {
  function today_iso(): string {
    return date('Y-m-d');
  }
}

if (!function_exists('is_valid_fecha')) {
  function is_valid_fecha(string $f): bool {
    return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f);
  }
}

if (!function_exists('build_in_params')) {
  function build_in_params(array $ids, string $prefix = ':id'): array {
    $placeholders = [];
    $params = [];
    foreach (array_values($ids) as $i => $id) {
      $ph = $prefix . $i;
      $placeholders[] = $ph;
      $params[$ph] = (int)$id;
    }
    return [$placeholders, $params];
  }
}

/* ----------------- PDO check ----------------- */
if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('Conexión PDO no disponible (tenant no resuelto o sesión inválida).', 500);
}

/* =========================================================
   idUsuario (token/body) - compat
========================================================= */
if (!function_exists('get_bearer_token')) {
  function get_bearer_token(): string {
    $h = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (!empty($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];

    $h = trim($h);
    if ($h === '') return '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return '';
  }
}

if (!function_exists('base64url_decode')) {
  function base64url_decode(string $s): string {
    $s = str_replace(['-', '_'], ['+', '/'], $s);
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
  }
}

if (!function_exists('get_id_usuario_from_request')) {
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
}

if (!function_exists('audit_safe')) {
  function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
    if ($idUsuario <= 0) return;
    auditar($pdo, $idUsuario, 'recibos', $accion, $entidad, $idEntidad, $detalle);
  }
}

/* =========================================================
   Helpers ITEMS
========================================================= */
if (!function_exists('item_payload_from_src')) {
  function item_payload_from_src(array $src, float $monto_total, int $id_detalle): array {
    $cantidad  = n_float($src['cantidad']  ?? null);
    $precio    = n_float($src['precio']    ?? null);
    $iva_pct   = n_float($src['iva_pct']   ?? null);
    $subtotal  = n_float($src['subtotal']  ?? null);
    $iva_monto = n_float($src['iva_monto'] ?? null);
    $total     = n_float($src['total']     ?? null);

    $hasItemFields = (
      $cantidad !== null ||
      $precio !== null ||
      $iva_pct !== null ||
      $subtotal !== null ||
      $iva_monto !== null ||
      $total !== null
    );

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
}

/* =========================================================
   BASE FILTER RECIBOS
========================================================= */
if (!function_exists('recibos_base_filters')) {
  function recibos_base_filters(array &$where, array &$params): void {
    $where[] = "m.id_tipo_operacion = :op_venta";
    $params[':op_venta'] = 1;

    $where[] = "m.id_tipo_venta = :tv_ctacte";
    $params[':tv_ctacte'] = 2;
  }
}

if (!function_exists('recibos_only_pending_filter')) {
  function recibos_only_pending_filter(array &$where): void {
    $where[] = "COALESCE(cb.cobrado_total, 0) <= 0.00001";
  }
}

/* =========================================================
   LISTAR RECIBOS PENDIENTES (GET)
========================================================= */
if (!function_exists('recibos_listar')) {
  function recibos_listar(PDO $pdo): void
  {
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
    $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

    $limit  = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
    $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

    if ($limit <= 0) $limit = 100;
    if ($limit > 100) $limit = 100;
    if ($offset < 0) $offset = 0;

    $limitPlus = $limit + 1;

    $where = [];
    $params = [];

    recibos_base_filters($where, $params);

    if ($fechaDesde !== '' && is_valid_fecha($fechaDesde)) {
      $where[] = "m.fecha >= :fecha_desde";
      $params[':fecha_desde'] = $fechaDesde;
    }

    if ($fechaHasta !== '' && is_valid_fecha($fechaHasta)) {
      $where[] = "m.fecha <= :fecha_hasta";
      $params[':fecha_hasta'] = $fechaHasta;
    }

    $from = "
      FROM movimientos m
        LEFT JOIN clasificaciones c ON c.id_clasificacion = m.id_clasificacion
        LEFT JOIN tipos_venta tv    ON tv.id_tipo_venta = m.id_tipo_venta
        LEFT JOIN clientes cl       ON cl.id_cliente = m.id_cliente
        LEFT JOIN proveedores pr    ON pr.id_proveedor = m.id_proveedor
        LEFT JOIN detalles d        ON d.id_detalle = m.id_detalle
        LEFT JOIN medios_pago mp    ON mp.id_medio_pago = m.id_medio_pago

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

        LEFT JOIN (
          SELECT id_movimiento, SUM(total) AS total_sum
          FROM movimientos_items
          GROUP BY id_movimiento
        ) it ON it.id_movimiento = m.id_movimiento

        LEFT JOIN (
          SELECT
            id_movimiento,
            SUM(monto) AS cobrado_total,
            MAX(fecha_cobro) AS ultimo_cobro,
            MAX(id_comprobante) AS ultimo_id_comprobante
          FROM cobros
          GROUP BY id_movimiento
        ) cb ON cb.id_movimiento = m.id_movimiento

        LEFT JOIN comprobantes_archivos ca
          ON ca.id_comprobante = cb.ultimo_id_comprobante
    ";

    if ($q !== '') {
      $like = '%' . $q . '%';

      $where[] = "(
        UPPER(COALESCE(c.nombre,'')) LIKE UPPER(:q1) OR
        UPPER(COALESCE(tv.nombre,'')) LIKE UPPER(:q2) OR
        UPPER(COALESCE(cl.nombre,'')) LIKE UPPER(:q3) OR
        UPPER(COALESCE(pr.nombre,'')) LIKE UPPER(:q4) OR
        UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q5) OR
        UPPER(COALESCE(mp.nombre,'')) LIKE UPPER(:q6)
      )";

      $params[':q1'] = $like;
      $params[':q2'] = $like;
      $params[':q3'] = $like;
      $params[':q4'] = $like;
      $params[':q5'] = $like;
      $params[':q6'] = $like;
    }

    recibos_only_pending_filter($where);

    $whereSql = (!empty($where)) ? (" WHERE " . implode(" AND ", $where)) : "";

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
        COALESCE(cb.cobrado_total, 0) AS cobrado_total,
        COALESCE(cb.ultimo_cobro, '') AS ultimo_cobro,
        COALESCE(cb.ultimo_id_comprobante, 0) AS id_comprobante,
        COALESCE(ca.archivo_url, '') AS comprobante_url,

        m.created_at
      $from
      $whereSql
      ORDER BY m.fecha DESC, m.id_movimiento DESC
      LIMIT :lim OFFSET :off
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) $stmt->bindValue($k, $v);
    $stmt->bindValue(':lim', (int)$limitPlus, PDO::PARAM_INT);
    $stmt->bindValue(':off', (int)$offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $hasMore = count($rows) > $limit;
    if ($hasMore) array_pop($rows);

    $nextOffset = $hasMore ? ($offset + $limit) : null;

    $totalCount = null;
    if ($offset === 0) {
      $sqlCount = "
        SELECT COUNT(DISTINCT m.id_movimiento) AS total
        $from
        $whereSql
      ";
      $stc = $pdo->prepare($sqlCount);
      foreach ($params as $k => $v) $stc->bindValue($k, $v);
      $stc->execute();
      $totalCount = (int)($stc->fetchColumn() ?: 0);
    }

    $data = [];
    foreach ($rows as $r) {
      $id_detalle_final = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

      $tipoVentaTxt = trim((string)($r['tipo_venta'] ?? ''));
      $medioPagoTxt = trim((string)($r['medio_pago_nombre'] ?? ''));

      $montoFinal = (float)($r['monto_total_final'] ?? 0);
      $cobrado = (float)($r['cobrado_total'] ?? 0);

      $data[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)$r['fecha'],
        'id_tipo_operacion' => (int)$r['id_tipo_operacion'],
        'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
        'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
        'id_detalle' => $id_detalle_final,
        'pago_tipo_venta' => $tipoVentaTxt,
        'medio_pago_nombre' => $medioPagoTxt,
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'monto_total' => $montoFinal,
        'cobrado_total' => $cobrado,
        'ultimo_cobro' => (string)($r['ultimo_cobro'] ?? ''),
        'pagado' => false,
        'id_comprobante' => (int)($r['id_comprobante'] ?? 0),
        'comprobante_url' => (string)($r['comprobante_url'] ?? ''),
        'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],
        'clasificacion' => (string)($r['clasificacion'] ?? ''),
        'tipo_venta' => $tipoVentaTxt,
        'cliente' => (string)($r['cliente'] ?? ''),
        'proveedor' => (string)($r['proveedor'] ?? ''),
        'detalle' => (string)($r['detalle'] ?? ''),
        'created_at' => (string)($r['created_at'] ?? ''),
      ];
    }

    ok([
      'movimientos' => $data,
      'has_more' => $hasMore,
      'next_offset' => $nextOffset,
      'limit' => $limit,
      'offset' => $offset,
      'total_count' => $totalCount,
    ]);
  }
}

/* =========================================================
   LISTAR PENDIENTES POR CLIENTE (GET)
========================================================= */
if (!function_exists('recibos_cliente_listar')) {
  function recibos_cliente_listar(PDO $pdo): void
  {
    $id_cliente = isset($_GET['id_cliente']) ? (int)$_GET['id_cliente'] : 0;
    if ($id_cliente <= 0) fail('Falta id_cliente.');

    $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 500;
    if ($limit <= 0) $limit = 500;
    if ($limit > 2000) $limit = 2000;

    $whereExtra = '';
    $paramsExtra = [];

    if ($fechaDesde !== '' && is_valid_fecha($fechaDesde)) {
      $whereExtra .= " AND m.fecha >= :fecha_desde ";
      $paramsExtra[':fecha_desde'] = $fechaDesde;
    }

    if ($fechaHasta !== '' && is_valid_fecha($fechaHasta)) {
      $whereExtra .= " AND m.fecha <= :fecha_hasta ";
      $paramsExtra[':fecha_hasta'] = $fechaHasta;
    }

    $sql = "
      SELECT
        m.id_movimiento,
        m.fecha,
        m.id_tipo_operacion,
        m.id_tipo_venta,
        m.id_cliente,
        m.id_medio_pago,
        COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
        COALESCE(cl.nombre,'') AS cliente,
        COALESCE(di.nombre, d.nombre, '') AS detalle,
        COALESCE(cb.cobrado_total, 0) AS cobrado_total,
        COALESCE(mp.nombre,'') AS medio_pago_nombre,
        COALESCE(cb.ultimo_id_comprobante, 0) AS id_comprobante,
        COALESCE(ca.archivo_url, '') AS comprobante_url

      FROM movimientos m
        LEFT JOIN clientes cl ON cl.id_cliente = m.id_cliente
        LEFT JOIN detalles d  ON d.id_detalle = m.id_detalle

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

        LEFT JOIN (
          SELECT id_movimiento, SUM(total) AS total_sum
          FROM movimientos_items
          GROUP BY id_movimiento
        ) it ON it.id_movimiento = m.id_movimiento

        LEFT JOIN (
          SELECT
            id_movimiento,
            SUM(monto) AS cobrado_total,
            MAX(id_comprobante) AS ultimo_id_comprobante
          FROM cobros
          GROUP BY id_movimiento
        ) cb ON cb.id_movimiento = m.id_movimiento

        LEFT JOIN comprobantes_archivos ca
          ON ca.id_comprobante = cb.ultimo_id_comprobante

        LEFT JOIN medios_pago mp ON mp.id_medio_pago = m.id_medio_pago

      WHERE m.id_tipo_operacion = :op_venta
        AND m.id_tipo_venta = :tv_ctacte
        AND m.id_cliente = :id_cliente
        $whereExtra
        AND COALESCE(cb.cobrado_total, 0) <= 0.00001

      ORDER BY m.fecha DESC, m.id_movimiento DESC
      LIMIT :lim
    ";

    $st = $pdo->prepare($sql);
    $st->bindValue(':op_venta', 1, PDO::PARAM_INT);
    $st->bindValue(':tv_ctacte', 2, PDO::PARAM_INT);
    $st->bindValue(':id_cliente', $id_cliente, PDO::PARAM_INT);

    foreach ($paramsExtra as $k => $v) {
      $st->bindValue($k, $v, PDO::PARAM_STR);
    }

    $st->bindValue(':lim', (int)$limit, PDO::PARAM_INT);
    $st->execute();

    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $out = [];

    foreach ($rows as $r) {
      $out[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)$r['fecha'],
        'id_tipo_operacion' => (int)$r['id_tipo_operacion'],
        'id_tipo_venta' => (int)$r['id_tipo_venta'],
        'id_cliente' => (int)$r['id_cliente'],
        'cliente' => (string)($r['cliente'] ?? ''),
        'detalle' => (string)($r['detalle'] ?? ''),
        'monto_total' => (float)($r['monto_total_final'] ?? 0),
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'medio_pago_nombre' => (string)($r['medio_pago_nombre'] ?? ''),
        'cobrado_total' => 0.0,
        'pagado' => false,
        'id_comprobante' => (int)($r['id_comprobante'] ?? 0),
        'comprobante_url' => (string)($r['comprobante_url'] ?? ''),
      ];
    }

    ok([
      'movimientos' => $out,
      'count' => count($out),
    ]);
  }
}

/* =========================================================
   ACTUALIZAR RECIBO (POST)
========================================================= */
if (!function_exists('recibos_actualizar')) {
  function recibos_actualizar(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = get_id_usuario_from_request($src);

    $id_movimiento = n_int($src['id_movimiento'] ?? null);
    if (!$id_movimiento) fail('Falta id_movimiento.');

    $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $beforeSt->execute([':id' => $id_movimiento]);
    $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
    if (!$before) fail('El movimiento no existe: ' . $id_movimiento);

    if ((int)($before['id_tipo_operacion'] ?? 0) !== 1 || (int)($before['id_tipo_venta'] ?? 0) !== 2) {
      fail('Este movimiento no es un recibo (VENTA + CUENTA CORRIENTE).');
    }

    $fecha = trim((string)($src['fecha'] ?? ''));
    if ($fecha === '' || !is_valid_fecha($fecha)) {
      $fecha = !empty($before['fecha']) ? (string)$before['fecha'] : today_iso();
    }

    $id_clasificacion = array_key_exists('id_clasificacion', $src)
      ? n_int($src['id_clasificacion'])
      : n_int($before['id_clasificacion'] ?? null);

    $id_tipo_venta = array_key_exists('id_tipo_venta', $src)
      ? n_int($src['id_tipo_venta'])
      : n_int($before['id_tipo_venta'] ?? null);

    $id_medio_pago = n_int($before['id_medio_pago'] ?? null);

    $id_cliente = array_key_exists('id_cliente', $src)
      ? n_int($src['id_cliente'])
      : n_int($before['id_cliente'] ?? null);

    $id_proveedor = array_key_exists('id_proveedor', $src)
      ? n_int($src['id_proveedor'])
      : n_int($before['id_proveedor'] ?? null);

    $id_detalle = array_key_exists('id_detalle', $src)
      ? n_int($src['id_detalle'])
      : n_int($before['id_detalle'] ?? null);

    $monto_total_in = array_key_exists('monto_total', $src)
      ? n_float($src['monto_total'])
      : null;

    $hasDetalleValido = ($id_detalle !== null && $id_detalle > 0);

    $item = null;
    if ($hasDetalleValido) {
      $baseMonto = ($monto_total_in !== null)
        ? (float)$monto_total_in
        : (float)($before['monto_total'] ?? 0);

      $item = item_payload_from_src($src, $baseMonto, (int)$id_detalle);
    }

    if ($item !== null) {
      $totalCabecera = (float)$item['total'];
    } elseif ($monto_total_in !== null) {
      $totalCabecera = (float)$monto_total_in;
    } else {
      $totalCabecera = isset($before['monto_total']) ? (float)$before['monto_total'] : 0.0;
    }

    try {
      $pdo->beginTransaction();

      $sql = "
        UPDATE movimientos SET
          fecha = :fecha,
          id_clasificacion = :id_clasificacion,
          id_tipo_venta = :id_tipo_venta,
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
        ':id_clasificacion' => $id_clasificacion,
        ':id_tipo_venta' => $id_tipo_venta,
        ':id_cliente' => $id_cliente,
        ':id_proveedor' => $id_proveedor,
        ':id_detalle' => $hasDetalleValido ? $id_detalle : null,
        ':monto_total' => $totalCabecera,
        ':id_medio_pago' => $id_medio_pago,
        ':id_movimiento' => $id_movimiento,
      ]);

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

      audit_safe($pdo, $idUsuario, 'actualizar', 'recibos', $id_movimiento, [
        'antes' => $before,
        'despues' => $after ?: null,
        'item' => $item,
      ]);

      ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo actualizar el recibo. ' . $e->getMessage());
    }
  }
}

/* =========================================================
   CONFIRMAR PAGO (POST) - OPTIMIZADO Y CORREGIDO
========================================================= */
if (!function_exists('recibos_confirmar_pago')) {
  function recibos_confirmar_pago(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = get_id_usuario_from_request($src);

    $ids = $src['ids_movimiento'] ?? $src['ids_movimientos'] ?? [];
    if (!is_array($ids)) $ids = [];

    $idsOk = [];
    foreach ($ids as $x) {
      $n = n_int($x);
      if ($n !== null && $n > 0) $idsOk[] = $n;
    }
    $idsOk = array_values(array_unique($idsOk));
    if (!$idsOk) fail('Faltan ids_movimiento para confirmar.');

    $id_medio_pago = n_int($src['id_medio_pago'] ?? null);
    if ($id_medio_pago === null || $id_medio_pago <= 0) fail('Falta id_medio_pago.');

    try {
      $pdo->beginTransaction();

      $vmp = $pdo->prepare("SELECT 1 FROM medios_pago WHERE id_medio_pago = :id LIMIT 1");
      $vmp->execute([':id' => (int)$id_medio_pago]);
      if ((int)($vmp->fetchColumn() ?: 0) !== 1) {
        $pdo->rollBack();
        fail('id_medio_pago inválido.');
      }

      [$inMov, $paramsMov] = build_in_params($idsOk, ':mov');
      [$inCob, $paramsCob] = build_in_params($idsOk, ':cob');

      $inSqlMov = implode(',', $inMov);
      $inSqlCob = implode(',', $inCob);

      $sqlMovs = "
        SELECT
          m.id_movimiento,
          m.id_tipo_operacion,
          m.id_tipo_venta,
          m.id_medio_pago,
          COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
          COALESCE(cb.cobrado_total, 0) AS cobrado_total
        FROM movimientos m
        LEFT JOIN (
          SELECT id_movimiento, SUM(total) AS total_sum
          FROM movimientos_items
          GROUP BY id_movimiento
        ) it ON it.id_movimiento = m.id_movimiento
        LEFT JOIN (
          SELECT id_movimiento, SUM(monto) AS cobrado_total
          FROM cobros
          WHERE id_movimiento IN ($inSqlCob)
          GROUP BY id_movimiento
        ) cb ON cb.id_movimiento = m.id_movimiento
        WHERE m.id_movimiento IN ($inSqlMov)
        FOR UPDATE
      ";

      $stMovs = $pdo->prepare($sqlMovs);

      foreach ($paramsCob as $k => $v) {
        $stMovs->bindValue($k, $v, PDO::PARAM_INT);
      }
      foreach ($paramsMov as $k => $v) {
        $stMovs->bindValue($k, $v, PDO::PARAM_INT);
      }

      $stMovs->execute();

      $rows = $stMovs->fetchAll(PDO::FETCH_ASSOC) ?: [];
      if (!$rows) {
        $pdo->rollBack();
        fail('No se encontraron movimientos para cobrar.');
      }

      $validos = [];
      $pendientes = [];
      $yaPagados = [];

      foreach ($rows as $r) {
        $idMov = (int)($r['id_movimiento'] ?? 0);
        $tipoOp = (int)($r['id_tipo_operacion'] ?? 0);
        $tipoVenta = (int)($r['id_tipo_venta'] ?? 0);
        $montoTotal = (float)($r['monto_total_final'] ?? 0);
        $cobrado = (float)($r['cobrado_total'] ?? 0);

        if ($idMov <= 0) continue;
        if ($tipoOp !== 1 || $tipoVenta !== 2) continue;

        $validos[] = $idMov;

        if ($cobrado > 0.00001) {
          $yaPagados[] = $idMov;
        } else {
          $pendientes[] = [
            'id_movimiento' => $idMov,
            'monto' => $montoTotal,
          ];
        }
      }

      if (!$validos) {
        $pdo->rollBack();
        fail('No hay movimientos válidos para cobrar (deben ser VENTA + CUENTA CORRIENTE).');
      }

      $idsCobro = [];
      $insertados = 0;

      if (!empty($pendientes)) {
        $sqlIns = "
          INSERT INTO cobros (id_movimiento, fecha_cobro, monto, id_medio_pago)
          VALUES (:id_movimiento, :fecha_cobro, :monto, :id_medio_pago)
        ";
        $stIns = $pdo->prepare($sqlIns);

        $hoy = today_iso();

        foreach ($pendientes as $p) {
          $stIns->execute([
            ':id_movimiento' => (int)$p['id_movimiento'],
            ':fecha_cobro'   => $hoy,
            ':monto'         => (float)$p['monto'],
            ':id_medio_pago' => (int)$id_medio_pago,
          ]);

          $idCobro = (int)$pdo->lastInsertId();
          if ($idCobro > 0) $idsCobro[] = $idCobro;
          $insertados++;
        }

        $idsInsertadosMov = array_map(
          static fn(array $x): int => (int)$x['id_movimiento'],
          $pendientes
        );

        if (!empty($idsInsertadosMov)) {
          [$inUpd, $paramsUpd] = build_in_params($idsInsertadosMov, ':u');
          $inSqlUpd = implode(',', $inUpd);

          $sqlUpdMov = "
            UPDATE movimientos
            SET id_medio_pago = :id_medio_pago_upd
            WHERE id_movimiento IN ($inSqlUpd)
              AND id_tipo_operacion = 1
              AND id_tipo_venta = 2
          ";
          $stUpdMov = $pdo->prepare($sqlUpdMov);
          $stUpdMov->bindValue(':id_medio_pago_upd', (int)$id_medio_pago, PDO::PARAM_INT);
          foreach ($paramsUpd as $k => $v) {
            $stUpdMov->bindValue($k, $v, PDO::PARAM_INT);
          }
          $stUpdMov->execute();
        }
      }

      $pdo->commit();

      audit_safe($pdo, $idUsuario, 'confirmar_pago', 'recibos', null, [
        'ids_movimiento_solicitados' => $idsOk,
        'ids_movimiento_validos' => $validos,
        'ids_movimiento_ya_pagados' => $yaPagados,
        'ids_cobro' => $idsCobro,
        'id_medio_pago' => $id_medio_pago,
        'cobros_insertados' => $insertados,
      ]);

      if ($insertados <= 0 && !empty($yaPagados)) {
        ok([
          'mensaje' => 'Los movimientos seleccionados ya estaban pagados.',
          'cobros_insertados' => 0,
          'movimientos_actualizados' => 0,
          'ids_movimiento' => $validos,
          'ids_movimiento_ya_pagados' => $yaPagados,
          'id_medio_pago' => $id_medio_pago,
          'ids_cobro' => [],
          'id_cobro' => null,
        ]);
      }

      ok([
        'mensaje' => 'Pago registrado correctamente.',
        'cobros_insertados' => $insertados,
        'movimientos_actualizados' => $insertados,
        'ids_movimiento' => $validos,
        'ids_movimiento_ya_pagados' => $yaPagados,
        'id_medio_pago' => $id_medio_pago,
        'ids_cobro' => $idsCobro,
        'id_cobro' => $idsCobro[0] ?? null,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo confirmar el pago. ' . $e->getMessage());
    }
  }
}

/* =========================================================
   ROUTE RECIBOS
========================================================= */
if (!function_exists('route_recibos_action')) {
  function route_recibos_action(PDO $pdo, string $action): bool
  {
    $action = strtolower(trim((string)$action));

    switch ($action) {
      case 'recibos_listar':
        recibos_listar($pdo);
        return true;

      case 'recibos_cliente_listar':
        recibos_cliente_listar($pdo);
        return true;

      case 'recibos_actualizar':
        recibos_actualizar($pdo);
        return true;

      case 'recibos_eliminar':
        if (function_exists('recibos_eliminar')) {
          recibos_eliminar($pdo);
          return true;
        }
        return false;

      case 'recibos_confirmar_pago':
        recibos_confirmar_pago($pdo);
        return true;

      default:
        return false;
    }
  }
}

if (!defined('MOVIMIENTOS_RECIBOS_ROUTE_BOOTSTRAP')) {
  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  $action = strtolower(trim((string)$action));

  if ($action === '') fail('Falta parámetro action.');

  try {
    if (!route_recibos_action($pdo, $action)) {
      fail('Acción no válida en recibos: ' . $action);
    }
  } catch (Throwable $e) {
    fail('Error en recibos: ' . $e->getMessage());
  }
}