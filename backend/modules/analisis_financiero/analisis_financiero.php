<?php
// backend/modules/analisis_financiero/analisis_financiero.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php'; // $pdo

/* =========================
   Response helpers
========================= */
/** @param array<string, mixed> $arr */
/** @param array<string, mixed> $arr */
function ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $http = 200, array $extra = []): void {
  http_response_code($http);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Helpers
========================= */
function isValidPeriodo(string $p): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p);
}
function monthStart(string $periodo): string { return $periodo . '-01'; }
function monthEnd(string $periodo): string {
  $dt = DateTime::createFromFormat('Y-m-d', $periodo . '-01');
  if (!$dt) return $periodo . '-28';
  $dt->modify('last day of this month');
  return $dt->format('Y-m-d');
}
function f($v): float { return (float)($v ?? 0); }

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    fail('DB no inicializada ($pdo es null). RevisÃƒÂ¡ backend/config/db.php', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  if ($periodo === '' || !isValidPeriodo($periodo)) {
    fail('ParÃƒÂ¡metro "periodo" invÃƒÂ¡lido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodo]);
  }

  // IDs fijos segÃƒÂºn tu tabla clasificaciones
  $ID_COSTO_FIJO        = 1;
  $ID_COSTO_VARIABLE    = 2;
  $ID_VENTAS            = 3;
  $ID_GASTOS_PERSONALES = 4;
  $ID_OTROS_EGRESOS     = 5;

  // 1) Primero probamos por periodo (columna movimientos.periodo)
  $sqlPeriodo = "
    SELECT id_clasificacion, COALESCE(SUM(monto_total),0) total
    FROM movimientos
    WHERE periodo = :periodo
      AND id_clasificacion IN (1,2,3,4,5)
    GROUP BY id_clasificacion
  ";
  $st = $pdo->prepare($sqlPeriodo);
  $st->execute([':periodo' => $periodo]);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC);

  $source = 'periodo';

  // 2) Si no hay filas, fallback por fecha del mes (por si tu periodo estÃƒÂ¡ mal cargado)
  if (!$rows || count($rows) === 0) {
    $desde = monthStart($periodo);
    $hasta = monthEnd($periodo);

    $sqlFecha = "
      SELECT id_clasificacion, COALESCE(SUM(monto_total),0) total
      FROM movimientos
      WHERE fecha BETWEEN :desde AND :hasta
        AND id_clasificacion IN (1,2,3,4,5)
      GROUP BY id_clasificacion
    ";
    $st2 = $pdo->prepare($sqlFecha);
    $st2->execute([':desde' => $desde, ':hasta' => $hasta]);
    $rows = $st2->fetchAll(PDO::FETCH_ASSOC);

    $source = 'fecha';
  }

  // Inicializamos
  $ventas = 0.0;
  $costoVariable = 0.0;
  $costoFijo = 0.0;
  $otrosEgresos = 0.0;
  $gastosPersonales = 0.0;

  foreach ($rows as $r) {
    $id = (int)($r['id_clasificacion'] ?? 0);
    $total = f($r['total'] ?? 0);

    if ($id === $ID_VENTAS) $ventas = $total;
    if ($id === $ID_COSTO_VARIABLE) $costoVariable = $total;
    if ($id === $ID_COSTO_FIJO) $costoFijo = $total;
    if ($id === $ID_OTROS_EGRESOS) $otrosEgresos = $total;
    if ($id === $ID_GASTOS_PERSONALES) $gastosPersonales = $total;
  }

  $resultadoNeto = $ventas - $costoVariable - $costoFijo - $otrosEgresos;

  ok([
    'periodo' => $periodo,
    'source' => $source, // Ã¢Å“â€¦ te dice si calculÃƒÂ³ por periodo o por fecha
    'valores' => [
      'ventas' => $ventas,
      'costo_variable' => $costoVariable,
      'costo_fijo' => $costoFijo,
      'otros_egresos' => $otrosEgresos,
      'resultado_neto' => $resultadoNeto,
      'gastos_personales' => $gastosPersonales,
    ],
  ]);

} catch (Throwable $e) {
  fail('Error generando anÃƒÂ¡lisis financiero: ' . $e->getMessage(), 500);
}
