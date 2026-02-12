<?php
// backend/modules/movimientos/ordenes_pago.php
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
  auditar($pdo, $idUsuario, 'ordenes_pago', $accion, $entidad, $idEntidad, $detalle);
}

/* =========================================================
   Helpers Items (igual que movimientos.php)
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
   Buscar ID "CONTADO" (si existe)
========================================================= */
function find_tipo_venta_contado_id(PDO $pdo): ?int {
  // Intentamos encontrar una opción "CONTADO" (o parecida)
  $sql = "
    SELECT id_tipo_venta
    FROM tipos_venta
    WHERE UPPER(nombre) = 'CONTADO'
       OR UPPER(nombre) LIKE '%CONTADO%'
    ORDER BY (UPPER(nombre) = 'CONTADO') DESC, id_tipo_venta ASC
    LIMIT 1
  ";
  $st = $pdo->prepare($sql);
  $st->execute();
  $row = $st->fetch(PDO::FETCH_ASSOC);
  if (!$row) return null;
  $id = (int)($row['id_tipo_venta'] ?? 0);
  return $id > 0 ? $id : null;
}

/* =========================================================
   LISTAR (GET)
   - Devolvemos misma estructura que movimientos_listar
   - (El filtrado "pendiente" lo seguís haciendo en frontend)
========================================================= */
function ordenes_pago_listar(PDO $pdo): void
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

      // Texto (como ya venías usando en frontend)
      'pago_tipo_venta' => $tipoVentaTxt,
      'medio_pago_nombre' => $medioPagoTxt,

      // IDs
      'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],

      'monto_total' => (float)$r['monto_total_final'],

      // primer item (para edición)
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

  ok(['movimientos' => $data]);
}

/* =========================================================
   ACTUALIZAR (POST) - Orden de Pago
========================================================= */
function ordenes_pago_actualizar(PDO $pdo): void
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

  $fecha = trim((string)($src['fecha'] ?? ''));
  if ($fecha === '' || !is_valid_fecha($fecha)) {
    $fecha = !empty($before['fecha']) ? (string)$before['fecha'] : today_iso();
  }

  $periodo = trim((string)($src['periodo'] ?? ''));
  if ($periodo === '' || !is_valid_periodo($periodo)) $periodo = periodo_from_fecha($fecha);

  // En OP dejamos lo demás igual; actualizamos lo relevante
  $id_proveedor = array_key_exists('id_proveedor', $src) ? n_int($src['id_proveedor']) : n_int($before['id_proveedor'] ?? null);
  $id_detalle   = array_key_exists('id_detalle', $src)   ? n_int($src['id_detalle'])   : n_int($before['id_detalle'] ?? null);

  $id_medio_pago = array_key_exists('id_medio_pago', $src) ? n_int($src['id_medio_pago']) : n_int($before['id_medio_pago'] ?? null);
  $monto_total_in = array_key_exists('monto_total', $src) ? n_float($src['monto_total']) : null;

  if (!$id_proveedor || $id_proveedor <= 0) {
    fail('Seleccioná un proveedor.');
  }

  $hasDetalleValido = ($id_detalle !== null && $id_detalle > 0);

  $item = null;
  if ($hasDetalleValido) {
    $baseMonto = ($monto_total_in !== null) ? (float)$monto_total_in : (float)($before['monto_total'] ?? 0);
    $item = item_payload_from_src($src, $baseMonto, (int)$id_detalle);
  }

  $totalCabecera = null;
  if ($item !== null) $totalCabecera = (float)$item['total'];
  else if ($monto_total_in !== null) $totalCabecera = (float)$monto_total_in;
  else $totalCabecera = isset($before['monto_total']) ? (float)$before['monto_total'] : 0.0;

  try {
    $pdo->beginTransaction();

    // OJO: no tocamos tipo_venta acá para no romper el estado "pendiente"
    $sql = "
      UPDATE movimientos SET
        fecha = :fecha,
        periodo = :periodo,
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

    audit_safe($pdo, $idUsuario, 'actualizar', 'ordenes_pago', $id_movimiento, [
      'antes' => $before,
      'despues' => $after ?: null,
      'item' => $item,
    ]);

    ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar la orden de pago. ' . $e->getMessage());
  }
}

/* =========================================================
   ELIMINAR (POST/GET)
========================================================= */
function ordenes_pago_eliminar(PDO $pdo): void
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

    audit_safe($pdo, $idUsuario, 'eliminar', 'ordenes_pago', $id, [
      'eliminado' => true,
      'antes' => $before ?: null,
    ]);

    ok(['eliminado' => true, 'id_movimiento' => $id]);
  } catch (Throwable $e) {
    fail('No se pudo eliminar la orden de pago. ' . $e->getMessage());
  }
}

/* =========================================================
   CONFIRMAR PAGO (POST)
   Recibe:
   - ids_movimiento: [1,2,3]
   - id_medio_pago:  X
   Efecto:
   - setea id_medio_pago
   - cambia id_tipo_venta a CONTADO si existe; si no, lo pone NULL
   - (opcional) limpia id_cuenta_corriente
========================================================= */
function ordenes_pago_confirmar_pago(PDO $pdo): void
{
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($src);

  $ids = $src['ids_movimiento'] ?? $src['ids_movimientos'] ?? [];
  if (!is_array($ids)) $ids = [];

  $clean = [];
  foreach ($ids as $x) {
    $n = n_int($x);
    if ($n && $n > 0) $clean[] = $n;
  }
  $clean = array_values(array_unique($clean));
  if (!count($clean)) fail('No hay movimientos seleccionados.');

  $id_medio_pago = n_int($src['id_medio_pago'] ?? null);
  if (!$id_medio_pago || $id_medio_pago <= 0) fail('Seleccioná un medio de pago.');

  $idContado = find_tipo_venta_contado_id($pdo); // puede ser null

  try {
    $pdo->beginTransaction();

    $placeholders = implode(',', array_fill(0, count($clean), '?'));

    $sql = "
      UPDATE movimientos
      SET
        id_medio_pago = ?,
        id_tipo_venta = " . ($idContado ? (string)$idContado : "NULL") . ",
        id_cuenta_corriente = NULL
      WHERE id_movimiento IN ($placeholders)
    ";

    $params = array_merge([$id_medio_pago], $clean);
    $st = $pdo->prepare($sql);
    $st->execute($params);

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'confirmar_pago', 'ordenes_pago', null, [
      'ids_movimiento' => $clean,
      'id_medio_pago' => $id_medio_pago,
      'id_tipo_venta_contado' => $idContado,
    ]);

    ok(['mensaje' => 'Pago confirmado.', 'ids' => $clean]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo confirmar el pago. ' . $e->getMessage());
  }
}

/* =========================================================
   DISPATCH
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action === '') fail('Falta parámetro action.');

try {
  switch ($action) {
    case 'ordenes_pago_listar':
      ordenes_pago_listar($pdo);
      break;

    case 'ordenes_pago_actualizar':
      ordenes_pago_actualizar($pdo);
      break;

    case 'ordenes_pago_eliminar':
      ordenes_pago_eliminar($pdo);
      break;

    case 'ordenes_pago_confirmar_pago':
      ordenes_pago_confirmar_pago($pdo);
      break;

    default:
      fail('Acción no válida en ordenes_pago: ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en ordenes_pago: ' . $e->getMessage());
}
