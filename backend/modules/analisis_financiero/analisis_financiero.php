<?php
// backend/modules/analisis_financiero/analisis_financiero.php
declare(strict_types=1);

/**
 * ✅ ACCIONES (vía route.php):
 * - analisis_financiero_resumen (GET)   params: periodo=YYYY-MM
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

/* =========================
   Response helpers
========================= */
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
  // ✅ por si el bootstrap no lo setea
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
  if ($periodo === '' || !isValidPeriodo($periodo)) {
    fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodo]);
  }

  // ✅ IDs fijos según tu tabla clasificaciones
  $ID_COSTO_FIJO        = 1;
  $ID_COSTO_VARIABLE    = 2;
  $ID_VENTAS            = 3;
  $ID_GASTOS_PERSONALES = 4;
  $ID_OTROS_EGRESOS     = 5;

  // Inicializamos
  $ventas = 0.0;
  $costoVariable = 0.0;
  $costoFijo = 0.0;
  $otrosEgresos = 0.0;
  $gastosPersonales = 0.0;

  $source = 'periodo';

  /* =========================================================
     1) Intento por PERIODO
     - Ventas: id_clasificacion=3 AND (id_tipo_venta=1 OR id_cuenta_corriente=1)
     - Otros: por id_clasificacion normal (1,2,4,5)
  ========================================================= */

  // A) Ventas con condición extra
  $sqlVentasPeriodo = "
    SELECT COALESCE(SUM(m.monto_total),0) total
    FROM movimientos m
    WHERE m.periodo = :periodo
      AND m.id_clasificacion = :idVentas
      AND (m.id_tipo_venta = 1 OR m.id_cuenta_corriente = 1)
  ";
  $stV = $pdo->prepare($sqlVentasPeriodo);
  $stV->execute([
    ':periodo' => $periodo,
    ':idVentas' => $ID_VENTAS,
  ]);
  $ventas = f($stV->fetchColumn());

  // B) Resto de clasificaciones (sin ventas)
  // ✅ OJO: IN con placeholders puede fallar en algunos drivers, mejor fijo:
  $sqlOtrosPeriodo = "
    SELECT m.id_clasificacion, COALESCE(SUM(m.monto_total),0) total
    FROM movimientos m
    WHERE m.periodo = :periodo
      AND m.id_clasificacion IN (1,2,4,5)
    GROUP BY m.id_clasificacion
  ";
  $stO = $pdo->prepare($sqlOtrosPeriodo);
  $stO->execute([':periodo' => $periodo]);
  $rowsOtros = $stO->fetchAll(PDO::FETCH_ASSOC) ?: [];

  // Detectamos si hay algo cargado por periodo (ventas u otros)
  $hayAlgoPeriodo = ($ventas != 0.0) || (count($rowsOtros) > 0);

  foreach ($rowsOtros as $r) {
    $id = (int)($r['id_clasificacion'] ?? 0);
    $total = f($r['total'] ?? 0);

    if ($id === $ID_COSTO_VARIABLE)    $costoVariable = $total;
    if ($id === $ID_COSTO_FIJO)        $costoFijo = $total;
    if ($id === $ID_OTROS_EGRESOS)     $otrosEgresos = $total;
    if ($id === $ID_GASTOS_PERSONALES) $gastosPersonales = $total;
  }

  /* =========================================================
     2) FALLBACK por FECHA si por periodo no hubo nada
  ========================================================= */
  if (!$hayAlgoPeriodo) {
    $source = 'fecha';
    $desde = monthStart($periodo);
    $hasta = monthEnd($periodo);

    // A) Ventas por fecha con condición extra
    $sqlVentasFecha = "
      SELECT COALESCE(SUM(m.monto_total),0) total
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_clasificacion = :idVentas
        AND (m.id_tipo_venta = 1 OR m.id_cuenta_corriente = 1)
    ";
    $stV2 = $pdo->prepare($sqlVentasFecha);
    $stV2->execute([
      ':desde' => $desde,
      ':hasta' => $hasta,
      ':idVentas' => $ID_VENTAS,
    ]);
    $ventas = f($stV2->fetchColumn());

    // B) Resto por fecha (1,2,4,5)
    $sqlOtrosFecha = "
      SELECT m.id_clasificacion, COALESCE(SUM(m.monto_total),0) total
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_clasificacion IN (1,2,4,5)
      GROUP BY m.id_clasificacion
    ";
    $stO2 = $pdo->prepare($sqlOtrosFecha);
    $stO2->execute([
      ':desde' => $desde,
      ':hasta' => $hasta,
    ]);
    $rowsOtros2 = $stO2->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // reset antes de cargar fallback
    $costoVariable = 0.0;
    $costoFijo = 0.0;
    $otrosEgresos = 0.0;
    $gastosPersonales = 0.0;

    foreach ($rowsOtros2 as $r) {
      $id = (int)($r['id_clasificacion'] ?? 0);
      $total = f($r['total'] ?? 0);

      if ($id === $ID_COSTO_VARIABLE)    $costoVariable = $total;
      if ($id === $ID_COSTO_FIJO)        $costoFijo = $total;
      if ($id === $ID_OTROS_EGRESOS)     $otrosEgresos = $total;
      if ($id === $ID_GASTOS_PERSONALES) $gastosPersonales = $total;
    }
  }

  // ✅ Resultado neto (ventas - costo variable - costo fijo - otros egresos)
  $resultadoNeto = $ventas - $costoVariable - $costoFijo - $otrosEgresos;

  ok([
    'periodo' => $periodo,
    'source' => $source,
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
  fail('Error generando análisis financiero: ' . $e->getMessage(), 500);
}
