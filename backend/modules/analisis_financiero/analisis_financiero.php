<?php
// backend/modules/analisis_financiero/analisis_financiero.php
declare(strict_types=1);

/**
 * ✅ ACCIONES (vía route.php):
 * - analisis_financiero_resumen (GET)
 *   Acepta DOS formas de pasar el rango:
 *     A) ?periodo=YYYY-MM                                  (legado, mes completo)
 *     B) ?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD   (nuevo, desde Calendario)
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 */

header('Content-Type: application/json; charset=utf-8');

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
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
function isValidDate(string $d): bool {
  return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $d);
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
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  // ── Resolver start / end ─────────────────────────────────
  $periodoParam = isset($_GET['periodo'])     ? trim((string)$_GET['periodo'])     : '';
  $fechaDesde   = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta   = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

  if ($fechaDesde !== '' && $fechaHasta !== '') {
    // Modo B: rango libre desde el Calendario
    if (!isValidDate($fechaDesde)) {
      fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaDesde]);
    }
    if (!isValidDate($fechaHasta)) {
      fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaHasta]);
    }
    if ($fechaDesde > $fechaHasta) {
      [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
    }
    $desde        = $fechaDesde;
    $hasta        = $fechaHasta;
    $periodoLabel = substr($fechaDesde, 0, 7); // YYYY-MM del primer día (para label)
    $modoFecha    = true;
  } elseif ($periodoParam !== '') {
    // Modo A: periodo mensual clásico (legado)
    if (!isValidPeriodo($periodoParam)) {
      fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodoParam]);
    }
    $desde        = monthStart($periodoParam);
    $hasta        = monthEnd($periodoParam);
    $periodoLabel = $periodoParam;
    $modoFecha    = false;
  } else {
    fail('Se requiere "fecha_desde"+"fecha_hasta" o "periodo".', 200);
  }
  // ─────────────────────────────────────────────────────────

  // ✅ IDs fijos según tabla clasificaciones
  $ID_COSTO_FIJO        = 1;
  $ID_COSTO_VARIABLE    = 2;
  $ID_VENTAS            = 3;
  $ID_GASTOS_PERSONALES = 4;
  $ID_OTROS_EGRESOS     = 5;

  $ventas           = 0.0;
  $costoVariable    = 0.0;
  $costoFijo        = 0.0;
  $otrosEgresos     = 0.0;
  $gastosPersonales = 0.0;

  $source = 'fecha'; // siempre por fecha ahora

  /* =========================================================
     1) Intento por PERIODO (solo en modo A cuando $modoFecha=false)
        Conservamos la lógica original para no romper nada.
  ========================================================= */
  $hayAlgoPeriodo = false;

  if (!$modoFecha && $periodoParam !== '') {
    // A) Ventas con condición extra por periodo
    $stV = $pdo->prepare("
      SELECT COALESCE(SUM(m.monto_total),0) total
      FROM movimientos m
      WHERE m.periodo = :periodo
        AND m.id_clasificacion = :idVentas
        AND (m.id_tipo_venta = 1 OR m.id_cuenta_corriente = 1)
    ");
    $stV->execute([':periodo' => $periodoParam, ':idVentas' => $ID_VENTAS]);
    $ventas = f($stV->fetchColumn());

    // B) Resto de clasificaciones por periodo
    $stO = $pdo->prepare("
      SELECT m.id_clasificacion, COALESCE(SUM(m.monto_total),0) total
      FROM movimientos m
      WHERE m.periodo = :periodo
        AND m.id_clasificacion IN (1,2,4,5)
      GROUP BY m.id_clasificacion
    ");
    $stO->execute([':periodo' => $periodoParam]);
    $rowsOtros = $stO->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $hayAlgoPeriodo = ($ventas != 0.0) || (count($rowsOtros) > 0);

    if ($hayAlgoPeriodo) {
      $source = 'periodo';
      foreach ($rowsOtros as $r) {
        $id    = (int)($r['id_clasificacion'] ?? 0);
        $total = f($r['total'] ?? 0);
        if ($id === $ID_COSTO_VARIABLE)    $costoVariable    = $total;
        if ($id === $ID_COSTO_FIJO)        $costoFijo        = $total;
        if ($id === $ID_OTROS_EGRESOS)     $otrosEgresos     = $total;
        if ($id === $ID_GASTOS_PERSONALES) $gastosPersonales = $total;
      }
    }
  }

  /* =========================================================
     2) Por FECHA: modo B directo, o fallback del modo A
  ========================================================= */
  if ($modoFecha || !$hayAlgoPeriodo) {
    $source = 'fecha';

    // Ventas por fecha con condición extra
    $stV2 = $pdo->prepare("
      SELECT COALESCE(SUM(m.monto_total),0) total
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_clasificacion = :idVentas
        AND (m.id_tipo_venta = 1 OR m.id_cuenta_corriente = 1)
    ");
    $stV2->execute([':desde' => $desde, ':hasta' => $hasta, ':idVentas' => $ID_VENTAS]);
    $ventas = f($stV2->fetchColumn());

    // Resto por fecha
    $stO2 = $pdo->prepare("
      SELECT m.id_clasificacion, COALESCE(SUM(m.monto_total),0) total
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_clasificacion IN (1,2,4,5)
      GROUP BY m.id_clasificacion
    ");
    $stO2->execute([':desde' => $desde, ':hasta' => $hasta]);
    $rowsOtros2 = $stO2->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // reset
    $costoVariable = $costoFijo = $otrosEgresos = $gastosPersonales = 0.0;

    foreach ($rowsOtros2 as $r) {
      $id    = (int)($r['id_clasificacion'] ?? 0);
      $total = f($r['total'] ?? 0);
      if ($id === $ID_COSTO_VARIABLE)    $costoVariable    = $total;
      if ($id === $ID_COSTO_FIJO)        $costoFijo        = $total;
      if ($id === $ID_OTROS_EGRESOS)     $otrosEgresos     = $total;
      if ($id === $ID_GASTOS_PERSONALES) $gastosPersonales = $total;
    }
  }

  // Resultado neto
  $resultadoNeto = $ventas - $costoVariable - $costoFijo - $otrosEgresos;

  ok([
    'periodo' => $periodoLabel,
    'rango'   => ['desde' => $desde, 'hasta' => $hasta],
    'source'  => $source,
    'valores' => [
      'ventas'            => $ventas,
      'costo_variable'    => $costoVariable,
      'costo_fijo'        => $costoFijo,
      'otros_egresos'     => $otrosEgresos,
      'resultado_neto'    => $resultadoNeto,
      'gastos_personales' => $gastosPersonales,
    ],
  ]);

} catch (Throwable $e) {
  fail('Error generando análisis financiero: ' . $e->getMessage(), 500);
}