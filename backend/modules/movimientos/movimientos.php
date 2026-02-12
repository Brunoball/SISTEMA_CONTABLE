<?php
// backend/modules/movimientos/movimientos.php
declare(strict_types=1);

/**
 * ✅ SOLO OBTENER:
 * - movimientos_listar (GET)
 * - movimientos_periodos_listar (GET)  -> periodos donde hay movimientos
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 */

// Si este archivo se ejecuta directo (no vía api.php), $pdo no existirá.
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
   Validators
========================= */
function is_valid_periodo(string $p): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p); // YYYY-MM
}

/* =========================================================
   ACCIÓN
========================================================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';
if ($action === '') fail('Falta parámetro action.');

/* =========================================================
   LISTAR PERIODOS (GET)
   Devuelve periodos (YYYY-MM) donde EXISTEN registros.
========================================================= */
function movimientos_periodos_listar(PDO $pdo): void
{
  try {
    $sql = "
      SELECT DISTINCT m.periodo
      FROM movimientos m
      WHERE m.periodo IS NOT NULL AND m.periodo <> ''
      ORDER BY m.periodo DESC
    ";
    $stmt = $pdo->query($sql);
    $periodos = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

    // Normalización mínima: asegurar strings
    $periodos = array_values(array_filter(array_map(fn($p) => (string)$p, $periodos)));

    ok(['periodos' => $periodos]);
  } catch (Throwable $e) {
    fail('No se pudieron obtener los períodos. ' . $e->getMessage());
  }
}

/* =========================================================
   LISTAR MOVIMIENTOS (GET)
   - periodo: YYYY-MM (obligatorio en tu UI, pero acá lo acepto opcional)
   - q: búsqueda
   Devuelve exactamente lo que tu JSX espera en data.movimientos[]
========================================================= */
function movimientos_listar(PDO $pdo): void
{
  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  $q       = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

  $where = [];
  $params = [];

  if ($periodo !== '') {
    if (!is_valid_periodo($periodo)) fail('Período inválido. Formato esperado: YYYY-MM');
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

      -- primer item del movimiento (si existe)
      fi.id_detalle AS item_id_detalle,
      fi.cantidad   AS item_cantidad,
      fi.precio     AS item_precio,
      fi.iva_pct    AS item_iva_pct,
      fi.subtotal   AS item_subtotal,
      fi.iva_monto  AS item_iva_monto,
      fi.total      AS item_total,

      -- total calculado por items (si hay)
      COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,

      -- textos para UI
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

        // ids
        'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta' => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        'id_cuenta_corriente' => $r['id_cuenta_corriente'] === null ? null : (int)$r['id_cuenta_corriente'],
        'id_cliente' => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
        'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
        'id_detalle' => $id_detalle_final,
        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],

        // valores (tu UI usa monto_total o monto_total_final; acá lo dejo en monto_total)
        'monto_total' => (float)($r['monto_total_final'] ?? 0),

        // primer item (para edición rápida / modal)
        'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

        // textos (tabla)
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
   DISPATCH (SOLO OBTENER)
========================================================= */
try {
  switch ($action) {
    case 'movimientos_listar':
      movimientos_listar($pdo);
      break;

    case 'movimientos_periodos_listar':
      movimientos_periodos_listar($pdo);
      break;

    default:
      fail('Acción no válida en movimientos (solo obtener): ' . $action);
  }
} catch (Throwable $e) {
  fail('Error en movimientos: ' . $e->getMessage());
}
