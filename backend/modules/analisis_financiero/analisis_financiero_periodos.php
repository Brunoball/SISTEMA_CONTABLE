<?php
// backend/modules/analisis_financiero/analisis_financiero_periodos.php
declare(strict_types=1);

/**
 * ✅ ACCIONES (vía route.php):
 * - analisis_financiero_periodos (GET)
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 */

header('Content-Type: application/json; charset=utf-8');

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Ejecutar vía routes/api.php (tenant_resolver).'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

function ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $http = 200, array $extra = []): void {
  http_response_code($http);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  // ✅ por si el bootstrap no lo setea
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  // ✅ Solo periodos que existan en movimientos, orden DESC (último primero)
  // ✅ Filtramos YYYY-MM válido para evitar basura.
  $sql = "
    SELECT DISTINCT m.periodo
    FROM movimientos m
    WHERE m.periodo IS NOT NULL
      AND m.periodo <> ''
      AND m.periodo REGEXP '^[0-9]{4}-[0-9]{2}$'
    ORDER BY m.periodo DESC
  ";

  $st = $pdo->query($sql);
  $periodos = $st->fetchAll(PDO::FETCH_COLUMN) ?: [];

  ok([
    'periodos' => array_values($periodos),
    'total' => count($periodos),
  ]);

} catch (Throwable $e) {
  fail('Error obteniendo períodos: ' . $e->getMessage(), 500);
}
