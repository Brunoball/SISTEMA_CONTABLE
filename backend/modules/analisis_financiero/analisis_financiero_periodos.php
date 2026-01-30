<?php
// backend/modules/analisis_financiero/analisis_financiero_periodos.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php'; // $pdo

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
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    fail('DB no inicializada ($pdo es null). Revisá backend/config/db.php', 500);
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  // ✅ Solo periodos que existan en movimientos, orden DESC (último primero)
  // Nota: filtramos YYYY-MM válido para evitar basura.
  $sql = "
    SELECT DISTINCT periodo
    FROM movimientos
    WHERE periodo IS NOT NULL
      AND periodo <> ''
      AND periodo REGEXP '^[0-9]{4}-[0-9]{2}$'
    ORDER BY periodo DESC
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
