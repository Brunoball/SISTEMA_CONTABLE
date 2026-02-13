<?php
// backend/modules/movimientos/confirmar_pago.php
declare(strict_types=1);

/**
 * Confirma pago de movimientos:
 * - setea id_tipo_venta = CONTADO
 * - setea id_medio_pago = (opcional pero recomendado)
 *
 * INPUT JSON:
 * {
 *   "ids_movimiento": [1,2,3]  // o "ids_movimientos"
 *   "id_medio_pago": 5         // opcional pero recomendado
 * }
 *
 * RESP:
 * { exito: true, actualizados: N, id_tipo_venta_contado: X, id_medio_pago: Y|null }
 */

// ✅ Multi-tenant: $pdo ya viene creado por routes/api.php (tenant_resolver)
if (!isset($pdo) || !($pdo instanceof PDO)) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Ejecutá esto vía routes/api.php (tenant_resolver).'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

header('Content-Type: application/json; charset=utf-8');

function json_fail(string $msg, int $code = 200, array $extra = []): void {
  http_response_code($code);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function json_ok(array $extra = []): void {
  echo json_encode(array_merge(['exito' => true], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function read_json(): array {
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $j = json_decode($raw, true);
  return is_array($j) ? $j : [];
}

function only_post(): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
  }
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    json_fail('Método no permitido. Usá POST.');
  }
}

only_post();

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $input = read_json();

  $ids = $input['ids_movimiento'] ?? $input['ids_movimientos'] ?? [];
  $id_medio_pago = (int)($input['id_medio_pago'] ?? $input['idMedioPago'] ?? 0);

  if (!is_array($ids) || count($ids) === 0) {
    json_fail('Faltan ids_movimiento.');
  }

  // Normalizar ids: int > 0, únicos
  $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($x) => $x > 0)));
  if (count($ids) === 0) {
    json_fail('ids_movimiento inválidos.');
  }

  // ✅ Buscar ID de tipo_venta CONTADO
  $stmtTV = $pdo->prepare("
    SELECT id_tipo_venta
    FROM tipos_venta
    WHERE activo = 1
      AND UPPER(nombre) LIKE '%CONTAD%'
    ORDER BY id_tipo_venta ASC
    LIMIT 1
  ");
  $stmtTV->execute();
  $id_contado = (int)($stmtTV->fetchColumn() ?: 0);

  if ($id_contado <= 0) {
    json_fail("No existe tipo_venta 'CONTADO'.");
  }

  // ✅ Validar medio de pago si vino
  if ($id_medio_pago > 0) {
    $stmtMP = $pdo->prepare("
      SELECT 1
      FROM medios_pago
      WHERE id_medio_pago = :id
      LIMIT 1
    ");
    $stmtMP->execute([':id' => $id_medio_pago]);
    $ok = (int)($stmtMP->fetchColumn() ?: 0);
    if ($ok !== 1) {
      json_fail('id_medio_pago inválido.');
    }
  }

  // ✅ IN (...) con placeholders NOMBRADOS (evita HY093 para siempre)
  $inParts = [];
  $params = [
    ':id_contado' => $id_contado,
  ];

  foreach ($ids as $i => $id) {
    $ph = ':id' . $i;
    $inParts[] = $ph;
    $params[$ph] = (int)$id;
  }

  $inSql = implode(',', $inParts);

  $pdo->beginTransaction();

  if ($id_medio_pago > 0) {
    $sql = "
      UPDATE movimientos
      SET id_tipo_venta = :id_contado,
          id_medio_pago = :id_medio_pago
      WHERE id_movimiento IN ($inSql)
    ";
    $params[':id_medio_pago'] = $id_medio_pago;
  } else {
    $sql = "
      UPDATE movimientos
      SET id_tipo_venta = :id_contado
      WHERE id_movimiento IN ($inSql)
    ";
  }

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);

  $pdo->commit();

  json_ok([
    'mensaje' => 'Pago confirmado: movimientos pasados a CONTADO.',
    'actualizados' => $stmt->rowCount(),
    'id_tipo_venta_contado' => $id_contado,
    'id_medio_pago' => $id_medio_pago > 0 ? $id_medio_pago : null,
  ]);

} catch (Throwable $e) {
  if ($pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  json_fail('Error: ' . $e->getMessage());
}
