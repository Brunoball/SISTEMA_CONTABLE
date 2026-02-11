<?php
// backend/modules/movimientos/ventas.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

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
function is_valid_fecha(string $f): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f);
}
function is_valid_periodo(string $p): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p);
}
function norm_text(string $s): string {
  $s = mb_strtolower(trim($s), 'UTF-8');
  // quitar acentos (simple)
  $s = str_replace(
    ['á','é','í','ó','ú','ä','ë','ï','ö','ü','ñ'],
    ['a','e','i','o','u','a','e','i','o','u','n'],
    $s
  );
  return $s;
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
  auditar($pdo, $idUsuario, 'ventas', $accion, $entidad, $idEntidad, $detalle);
}

/* =========================================================
   Tipo venta -> reglas (contado/corriente)
   (usa nombre del tipo_venta en DB)
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
   VALIDACIÓN de venta (reglas del front)
   - Cliente obligatorio
   - Tipo venta obligatorio
   - Detalle obligatorio (para tu planilla)
   - Contado -> medio pago obligatorio, CC null
   - Corriente -> cuenta corriente obligatoria, medio pago null
========================================================= */
function validar_venta_or_fail(PDO $pdo, array $src): array {
  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) $fecha = today_iso();

  $periodo = trim((string)($src['periodo'] ?? ''));
  if ($periodo === '' || !is_valid_periodo($periodo)) $periodo = periodo_from_fecha($fecha);

  $id_clasificacion    = n_int($src['id_clasificacion'] ?? null);
  $id_tipo_venta       = n_int($src['id_tipo_venta'] ?? null);
  $id_medio_pago       = n_int($src['id_medio_pago'] ?? null);
  $id_cuenta_corriente = n_int($src['id_cuenta_corriente'] ?? null);
  $id_cliente          = n_int($src['id_cliente'] ?? null);
  $id_detalle          = n_int($src['id_detalle'] ?? null);

  $monto_total = n_float($src['monto_total'] ?? null);

  if (!$id_cliente || $id_cliente <= 0) fail('En Ventas el Cliente es obligatorio.');
  if (!$id_tipo_venta || $id_tipo_venta <= 0) fail('En Ventas la Forma de venta (Tipo venta) es obligatoria.');
  if (!$id_detalle || $id_detalle <= 0) fail('En Ventas el Detalle es obligatorio.');

  // Reglas contado/corriente según nombre del tipo_venta
  $tipoVentaNombre = get_tipo_venta_nombre($pdo, $id_tipo_venta);
  $isContado = tipo_venta_is_contado($tipoVentaNombre);
  $isCorriente = tipo_venta_is_corriente($tipoVentaNombre);

  if ($isContado) {
    if (!$id_medio_pago || $id_medio_pago <= 0) fail('Venta Contado: el Medio de pago es obligatorio.');
    $id_cuenta_corriente = null; // forzar null
  }

  if ($isCorriente) {
    if (!$id_cuenta_corriente || $id_cuenta_corriente <= 0) {
      fail('Venta en Cuenta Corriente: la Cuenta Corriente es obligatoria.');
    }
    $id_medio_pago = null; // forzar null
  }

  // Totales desde item (prioridad) o monto_total
  $item = item_payload_from_src($src, (float)($monto_total ?? 0.0), (int)$id_detalle);
  $totalCabecera = (float)$item['total'];

  return [
    'fecha' => $fecha,
    'periodo' => $periodo,
    'id_clasificacion' => $id_clasificacion,
    'id_tipo_venta' => $id_tipo_venta,
    'id_medio_pago' => $id_medio_pago,
    'id_cuenta_corriente' => $id_cuenta_corriente,
    'id_cliente' => $id_cliente,
    'id_proveedor' => null,            // ventas: proveedor null
    'id_detalle' => $id_detalle,
    'monto_total' => $totalCabecera,
    'tipo_venta_nombre' => $tipoVentaNombre,
    'item' => $item,
  ];
}

/* =========================================================
   LISTAR VENTAS (GET)
   ✅ criterio "venta" sin salida:
   - id_cliente IS NOT NULL
   - id_proveedor IS NULL
========================================================= */
function ventas_listar(PDO $pdo): void {
  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  $q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $where = [];
  $params = [];

  // ✅ filtro base ventas
  $where[] = "m.id_cliente IS NOT NULL";
  $where[] = "(m.id_proveedor IS NULL OR m.id_proveedor = 0)";

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
      UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q5) OR
      UPPER(COALESCE(mp.nombre,''))  LIKE UPPER(:q6)
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q6'] = $like;
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

    $tipoVentaTxt = trim((string)($r['tipo_venta'] ?? ''));
    $medioPagoTxt = trim((string)($r['medio_pago_nombre'] ?? ''));

    $data[] = [
      'id_movimiento' => (int)$r['id_movimiento'],
      'fecha' => (string)$r['fecha'],
      'periodo' => (string)$r['periodo'],

      'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'id_cuenta_corriente' => $r['id_cuenta_corriente'] === null ? null : (int)$r['id_cuenta_corriente'],
      'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
      'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
      'id_detalle' => $id_detalle_final,

      // ✅ NUEVO para Ventas.jsx
      'pago_tipo_venta' => $tipoVentaTxt,
      'medio_pago_nombre' => $medioPagoTxt,

      'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
      'monto_total' => (float)$r['monto_total_final'],

      // primer item
      'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
      'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
      'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
      'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
      'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

      // textos
      'clasificacion' => (string)($r['clasificacion'] ?? ''),
      'tipo_venta' => $tipoVentaTxt,
      'cuenta_corriente' => (string)($r['cuenta_corriente'] ?? ''),
      'cliente' => (string)($r['cliente'] ?? ''),
      'proveedor' => (string)($r['proveedor'] ?? ''),
      'detalle' => (string)($r['detalle'] ?? ''),
      'created_at' => (string)($r['created_at'] ?? ''),
    ];
  }

  ok(['ventas' => $data]);
}

/* =========================================================
   CREAR 1 VENTA (POST)
========================================================= */
function ventas_crear(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $v = validar_venta_or_fail($pdo, $src);

  try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha, periodo,
        id_clasificacion, id_tipo_venta, id_cuenta_corriente,
        id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha, :periodo,
        :id_clasificacion, :id_tipo_venta, :id_cuenta_corriente,
        :id_cliente, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago
      )
    ");

    $stmt->execute([
      ':fecha' => $v['fecha'],
      ':periodo' => $v['periodo'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_tipo_venta' => $v['id_tipo_venta'],
      ':id_cuenta_corriente' => $v['id_cuenta_corriente'],
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
          'periodo' => $v['periodo'],
          'id_clasificacion' => $v['id_clasificacion'],
          'id_tipo_venta' => $v['id_tipo_venta'],
          'id_cuenta_corriente' => $v['id_cuenta_corriente'],
          'id_cliente' => $v['id_cliente'],
          'id_detalle' => $v['id_detalle'],
          'monto_total' => $v['monto_total'],
          'id_medio_pago' => $v['id_medio_pago'],
          'tipo_venta_nombre' => $v['tipo_venta_nombre'],
        ],
        'item' => $it,
      ]
    ]);

    ok(['id_movimiento' => $newId]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear la venta. ' . $e->getMessage());
  }
}

/* =========================================================
   CREAR BATCH (POST) - para ModalNuevaVenta
   body puede ser:
   - { items: [ {...}, {...} ] }
   - [ {...}, {...} ]
========================================================= */
function ventas_crear_batch(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request(is_array($src) ? [] : $src);

  $items = [];

  if (is_array($src) && array_keys($src) === range(0, count($src) - 1)) {
    // array directo
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
          fecha, periodo,
          id_clasificacion, id_tipo_venta, id_cuenta_corriente,
          id_cliente, id_proveedor, id_detalle,
          monto_total, id_medio_pago
        ) VALUES (
          :fecha, :periodo,
          :id_clasificacion, :id_tipo_venta, :id_cuenta_corriente,
          :id_cliente, :id_proveedor, :id_detalle,
          :monto_total, :id_medio_pago
        )
      ");
      $stmt->execute([
        ':fecha' => $v['fecha'],
        ':periodo' => $v['periodo'],
        ':id_clasificacion' => $v['id_clasificacion'],
        ':id_tipo_venta' => $v['id_tipo_venta'],
        ':id_cuenta_corriente' => $v['id_cuenta_corriente'],
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
        'periodo' => $v['periodo'],
        'id_cliente' => $v['id_cliente'],
        'id_tipo_venta' => $v['id_tipo_venta'],
        'tipo_venta_nombre' => $v['tipo_venta_nombre'],
        'id_medio_pago' => $v['id_medio_pago'],
        'id_cuenta_corriente' => $v['id_cuenta_corriente'],
        'monto_total' => $v['monto_total'],
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
   - actualiza cabecera y 1er item
========================================================= */
function ventas_actualizar(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $id_movimiento = n_int($src['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id_movimiento]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La venta no existe: ' . $id_movimiento);

  // ✅ asegurar que sea venta según criterio base
  if (empty($before['id_cliente']) || (!empty($before['id_proveedor']) && (int)$before['id_proveedor'] > 0)) {
    fail('Este movimiento no parece una venta (cliente/proveedor).');
  }

  // Mezclar: si no viene un campo, tomar before (igual que tu movimientos.php)
  $merge = $src;
  foreach (['fecha','periodo','id_clasificacion','id_tipo_venta','id_medio_pago','id_cuenta_corriente','id_cliente','id_detalle','monto_total','cantidad','precio','iva_pct','subtotal','iva_monto','total'] as $k) {
    if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
      $merge[$k] = $before[$k];
    }
  }

  // Validar con tus reglas
  $v = validar_venta_or_fail($pdo, $merge);

  try {
    $pdo->beginTransaction();

    $upd = $pdo->prepare("
      UPDATE movimientos SET
        fecha = :fecha,
        periodo = :periodo,
        id_clasificacion = :id_clasificacion,
        id_tipo_venta = :id_tipo_venta,
        id_cuenta_corriente = :id_cuenta_corriente,
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
      ':periodo' => $v['periodo'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_tipo_venta' => $v['id_tipo_venta'],
      ':id_cuenta_corriente' => $v['id_cuenta_corriente'],
      ':id_cliente' => $v['id_cliente'],
      ':id_detalle' => $v['id_detalle'],
      ':monto_total' => $v['monto_total'],
      ':id_medio_pago' => $v['id_medio_pago'],
      ':id_movimiento' => $id_movimiento,
    ]);

    // update/insert primer item
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
  $idUsuario = get_id_usuario_from_request($src);

  $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
  $id = n_int($id);
  if (!$id) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);

  if (!$before) fail('La venta no existe.');

  // ✅ asegurar venta
  if (empty($before['id_cliente']) || (!empty($before['id_proveedor']) && (int)$before['id_proveedor'] > 0)) {
    fail('Este movimiento no parece una venta (cliente/proveedor).');
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

    default:
      fail('Acción no válida en ventas: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en ventas: ' . $e->getMessage());
}
