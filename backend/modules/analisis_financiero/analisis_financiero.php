<?php
// backend/modules/analisis_financiero/analisis_financiero.php
declare(strict_types=1);

/**
 * ✅ ACCIONES (vía route.php):
 * - analisis_financiero_resumen (GET)
 *   Acepta:
 *     ?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
 *
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 *
 * ✅ LÓGICA:
 * - VENTAS:
 *   * id_tipo_operacion = 1 + id_tipo_venta = 1 (contado)
 *   * id_tipo_operacion = 1 + id_tipo_venta = 2 (cuenta corriente) SOLO si existe en cobros
 *
 * - COSTO VARIABLE:
 *   * id_tipo_operacion = 2 + id_tipo_venta = 1 (contado)
 *   * id_tipo_operacion = 2 + id_tipo_venta = 2 (cuenta corriente) SOLO si existe en cobros
 *
 * - COSTO FIJO / OTROS EGRESOS / GASTOS PERSONALES:
 *   * por id_clasificacion
 *
 * ✅ NUEVA REGLA PEDIDA:
 * - Si id_tipo_operacion = 4 y id_clasificacion IS NULL  => sumar en OTROS EGRESOS
 * - Si id_tipo_operacion = 4 y id_clasificacion = 1      => sumar en COSTO FIJO
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
if (!function_exists('af_ok')) {
  function af_ok(array $arr = []): void {
    echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('af_fail')) {
  function af_fail(string $msg, int $http = 200, array $extra = []): void {
    http_response_code($http);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

/* =========================
   Helpers
========================= */
if (!function_exists('af_isValidDate')) {
  function af_isValidDate(string $d): bool {
    return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $d);
  }
}

if (!function_exists('af_f')) {
  function af_f($v): float {
    return (float)($v ?? 0);
  }
}

/**
 * Suma por operación con lógica:
 * - contado => entra siempre
 * - cuenta corriente => entra solo si existe en cobros
 *
 * @param PDO    $pdo
 * @param string $desde
 * @param string $hasta
 * @param int    $idTipoOperacion 1=venta, 2=compra
 */
if (!function_exists('af_sumarPorOperacionYCondicionCobro')) {
  function af_sumarPorOperacionYCondicionCobro(
    PDO $pdo,
    string $desde,
    string $hasta,
    int $idTipoOperacion
  ): float {
    $sql = "
      SELECT COALESCE(SUM(m.monto_total), 0) AS total
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_tipo_operacion = :id_tipo_operacion
        AND (
          m.id_tipo_venta = 1
          OR (
            m.id_tipo_venta = 2
            AND EXISTS (
              SELECT 1
              FROM cobros c
              WHERE c.id_movimiento = m.id_movimiento
            )
          )
        )
    ";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':desde'             => $desde,
      ':hasta'             => $hasta,
      ':id_tipo_operacion' => $idTipoOperacion,
    ]);

    return af_f($st->fetchColumn());
  }
}

/**
 * Obtiene totales por clasificación para:
 * 1 = costo fijo
 * 4 = gastos personales
 * 5 = otros egresos
 *
 * ⚠️ No usamos 2 (costo variable) porque ahora se calcula
 * con lógica especial por operación + cobros.
 *
 * ✅ EXCLUIMOS id_tipo_operacion = 4 de esta consulta
 * porque esos movimientos ahora tienen lógica especial.
 */
if (!function_exists('af_obtenerClasificacionesPorFecha')) {
  function af_obtenerClasificacionesPorFecha(PDO $pdo, string $desde, string $hasta): array {
    $sql = "
      SELECT m.id_clasificacion, COALESCE(SUM(m.monto_total), 0) AS total
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_clasificacion IN (1,4,5)
        AND (m.id_tipo_operacion IS NULL OR m.id_tipo_operacion <> 4)
      GROUP BY m.id_clasificacion
    ";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':desde' => $desde,
      ':hasta' => $hasta,
    ]);

    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }
}

/**
 * ✅ NUEVO:
 * Trae totales especiales de movimientos con id_tipo_operacion = 4
 *
 * Reglas:
 * - id_clasificacion IS NULL => otros_egresos
 * - id_clasificacion = 1     => costo_fijo
 */
if (!function_exists('af_obtenerTotalesEspecialesTipoOperacion4')) {
  function af_obtenerTotalesEspecialesTipoOperacion4(PDO $pdo, string $desde, string $hasta): array {
    $sql = "
      SELECT
        COALESCE(SUM(
          CASE
            WHEN m.id_clasificacion IS NULL THEN m.monto_total
            ELSE 0
          END
        ), 0) AS total_otros_egresos,
        COALESCE(SUM(
          CASE
            WHEN m.id_clasificacion = 1 THEN m.monto_total
            ELSE 0
          END
        ), 0) AS total_costo_fijo
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
        AND m.id_tipo_operacion = 4
    ";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':desde' => $desde,
      ':hasta' => $hasta,
    ]);

    $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];

    return [
      'otros_egresos' => af_f($row['total_otros_egresos'] ?? 0),
      'costo_fijo'    => af_f($row['total_costo_fijo'] ?? 0),
    ];
  }
}

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

  if ($fechaDesde === '' || $fechaHasta === '') {
    af_fail('Se requieren los parámetros "fecha_desde" y "fecha_hasta".', 200);
  }

  if (!af_isValidDate($fechaDesde)) {
    af_fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, [
      'recibido' => $fechaDesde
    ]);
  }

  if (!af_isValidDate($fechaHasta)) {
    af_fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, [
      'recibido' => $fechaHasta
    ]);
  }

  if ($fechaDesde > $fechaHasta) {
    [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
  }

  $desde = $fechaDesde;
  $hasta = $fechaHasta;

  // ✅ IDs fijos según tabla clasificaciones
  $ID_COSTO_FIJO        = 1;
  $ID_GASTOS_PERSONALES = 4;
  $ID_OTROS_EGRESOS     = 5;

  // ✅ IDs fijos según tabla tipos_operacion
  $ID_TIPO_OPERACION_VENTA  = 1;
  $ID_TIPO_OPERACION_COMPRA = 2;
  $ID_TIPO_OPERACION_EXTRA  = 4;

  // ✅ VENTAS: operación 1 + contado o cuenta corriente pagada
  $ventas = af_sumarPorOperacionYCondicionCobro(
    $pdo,
    $desde,
    $hasta,
    $ID_TIPO_OPERACION_VENTA
  );

  // ✅ COSTO VARIABLE: operación 2 + contado o cuenta corriente pagada
  $costoVariable = af_sumarPorOperacionYCondicionCobro(
    $pdo,
    $desde,
    $hasta,
    $ID_TIPO_OPERACION_COMPRA
  );

  // ✅ Clasificaciones normales (excluyendo tipo_operacion = 4)
  $rowsOtros = af_obtenerClasificacionesPorFecha($pdo, $desde, $hasta);

  $costoFijo        = 0.0;
  $otrosEgresos     = 0.0;
  $gastosPersonales = 0.0;

  foreach ($rowsOtros as $r) {
    $id    = (int)($r['id_clasificacion'] ?? 0);
    $total = af_f($r['total'] ?? 0);

    if ($id === $ID_COSTO_FIJO)        $costoFijo        += $total;
    if ($id === $ID_OTROS_EGRESOS)     $otrosEgresos     += $total;
    if ($id === $ID_GASTOS_PERSONALES) $gastosPersonales += $total;
  }

  // ✅ NUEVO: sumar movimientos especiales con id_tipo_operacion = 4
  $totalesTipo4 = af_obtenerTotalesEspecialesTipoOperacion4($pdo, $desde, $hasta);

  $otrosEgresos += af_f($totalesTipo4['otros_egresos'] ?? 0);
  $costoFijo    += af_f($totalesTipo4['costo_fijo'] ?? 0);

  $resultadoNeto = $ventas - $costoVariable - $costoFijo - $otrosEgresos;

  af_ok([
    'rango' => [
      'desde' => $desde,
      'hasta' => $hasta,
    ],
    'source' => 'fecha',
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
  af_fail('Error generando análisis financiero: ' . $e->getMessage(), 500);
}