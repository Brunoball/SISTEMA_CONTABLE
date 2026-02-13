<?php
// backend/modules/flujo_caja/flujo_caja.php
declare(strict_types=1);

/**
 * ✅ MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 */

header('Content-Type: application/json; charset=utf-8');

global $pdo;
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
   Date helpers
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

/** @return array<int, string> */
function buildDays(string $periodo): array {
  $start = monthStart($periodo);
  $end   = monthEnd($periodo);

  $out = [];
  $dt = DateTime::createFromFormat('Y-m-d', $start);
  $dtEnd = DateTime::createFromFormat('Y-m-d', $end);
  if (!$dt || !$dtEnd) return $out;

  while ($dt <= $dtEnd) {
    $out[] = $dt->format('Y-m-d');
    $dt->modify('+1 day');
  }
  return $out;
}

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  // Este archivo responde 3 actions:
  // flujo_caja_periodos | flujo_caja_clientes | flujo_caja_resumen
  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  $action = strtolower(trim(is_string($action) ? $action : ''));

  /* ==========================================================
     ✅ LISTAR PERIODOS DISPONIBLES EN movimientos.periodo
     action=flujo_caja_periodos
  ========================================================== */
  if ($action === 'flujo_caja_periodos') {
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
    $periodos = array_values(array_filter(array_map(fn($p) => (string)$p, $periodos)));

    ok([
      'periodos' => $periodos,
      'total' => count($periodos),
    ]);
  }

  /* ==========================================================
     ✅ FLUJO POR CLIENTES (total absoluto por periodo opcional)
     action=flujo_caja_clientes
  ========================================================== */
  if ($action === 'flujo_caja_clientes') {

    $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
    $filtrarPeriodo = ($periodo !== '' && isValidPeriodo($periodo));

    $params = [];
    $whereExtra = "";
    if ($filtrarPeriodo) {
      $whereExtra = " AND m.periodo = :periodo ";
      $params[':periodo'] = $periodo;
    }

    $sql = "
      SELECT
        c.id_cliente,
        c.nombre AS cliente,
        COALESCE(SUM(ABS(m.monto_total)), 0) AS total
      FROM clientes c
      LEFT JOIN movimientos m
        ON m.id_cliente = c.id_cliente
        $whereExtra
      GROUP BY c.id_cliente, c.nombre
      ORDER BY c.nombre ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);

    $rows = [];
    while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
      $rows[] = [
        'id_cliente' => (int)($r['id_cliente'] ?? 0),
        'cliente'    => (string)($r['cliente'] ?? ''),
        'total'      => (float)($r['total'] ?? 0),
      ];
    }

    ok([
      'periodo' => $filtrarPeriodo ? $periodo : null,
      'rows' => $rows,
      'total_clientes' => count($rows),
    ]);
  }

  /* ==========================================================
     ✅ FLUJO DIARIO TIPO EXCEL (COMPATIBLE CON TU REACT)
     action=flujo_caja_resumen

     ✅ REGLA:
     - ingresos = SUM(ABS(monto_total)) donde id_tipo_operacion = 1 (VENTA)
     - egresos  = SUM(ABS(monto_total)) donde id_tipo_operacion = 2 (COMPRA)
     - otros    = SUM(MOVIMIENTOS) donde id_tipo_operacion = 3
                 * VERDE (+) si clasificacion = 'VENTAS' o 'OTROS INGRESOS'
                 * ROJO  (-) para el resto (COSTO FIJO, COSTO VARIABLE, GASTOS PERSONALES, OTROS EGRESOS, etc.)
  ========================================================== */
  if ($action === 'flujo_caja_resumen') {

    $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
    if ($periodo === '' || !isValidPeriodo($periodo)) {
      fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodo]);
    }

    $start = monthStart($periodo);
    $end   = monthEnd($periodo);

    $days = buildDays($periodo);
    $today = (new DateTime('today'))->format('Y-m-d');

    // ✅ Clasificaciones que cuentan como "ingreso" dentro de OTROS
    // (por nombre, porque tus IDs pueden variar en otros tenants)
    $sqlIngresoClasif = "
      SELECT id_clasificacion
      FROM clasificaciones
      WHERE activo = 1
        AND UPPER(nombre) IN ('VENTAS', 'OTROS INGRESOS')
    ";
    $stClas = $pdo->query($sqlIngresoClasif);
    $ingresoClasifIds = $stClas->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $ingresoClasifIds = array_values(array_filter(array_map(fn($x) => (int)$x, $ingresoClasifIds)));

    // placeholders IN (...)
    $inPlaceholders = '';
    $inParams = [];
    if (count($ingresoClasifIds) > 0) {
      $tmp = [];
      foreach ($ingresoClasifIds as $i => $idc) {
        $k = ":c$i";
        $tmp[] = $k;
        $inParams[$k] = $idc;
      }
      $inPlaceholders = implode(',', $tmp);
    } else {
      // Si no existieran esas clasificaciones, OTROS se tomará como egreso (negativo) por defecto
      $inPlaceholders = 'NULL';
    }

    // 1) ingresos/egresos/otros por día
    $sqlDia = "
      SELECT
        m.fecha,
        COALESCE(SUM(CASE WHEN m.id_tipo_operacion = 1 THEN ABS(m.monto_total) ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN m.id_tipo_operacion = 2 THEN ABS(m.monto_total) ELSE 0 END), 0) AS egresos,
        COALESCE(SUM(
          CASE
            WHEN m.id_tipo_operacion = 3 THEN
              CASE
                WHEN m.id_clasificacion IN ($inPlaceholders) THEN  ABS(m.monto_total)
                ELSE -ABS(m.monto_total)
              END
            ELSE 0
          END
        ), 0) AS otros
      FROM movimientos m
      WHERE m.fecha BETWEEN :desde AND :hasta
      GROUP BY m.fecha
    ";
    $stDia = $pdo->prepare($sqlDia);
    $paramsDia = array_merge([':desde' => $start, ':hasta' => $end], $inParams);
    $stDia->execute($paramsDia);

    $mapDia = []; // fecha => [ingresos, egresos, otros]
    while ($r = $stDia->fetch(PDO::FETCH_ASSOC)) {
      $f = (string)($r['fecha'] ?? '');
      if ($f !== '') {
        $mapDia[$f] = [
          'ingresos' => (float)($r['ingresos'] ?? 0),
          'egresos'  => (float)($r['egresos'] ?? 0),
          'otros'    => (float)($r['otros'] ?? 0), // ✅ signed
        ];
      }
    }

    // 2) saldo base anterior al mes (incluye otros)
    $sqlSaldoBase = "
      SELECT
        COALESCE(SUM(CASE WHEN m.id_tipo_operacion = 1 THEN ABS(m.monto_total) ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN m.id_tipo_operacion = 2 THEN ABS(m.monto_total) ELSE 0 END), 0) AS egresos,
        COALESCE(SUM(
          CASE
            WHEN m.id_tipo_operacion = 3 THEN
              CASE
                WHEN m.id_clasificacion IN ($inPlaceholders) THEN  ABS(m.monto_total)
                ELSE -ABS(m.monto_total)
              END
            ELSE 0
          END
        ), 0) AS otros
      FROM movimientos m
      WHERE m.fecha < :desde
    ";
    $stBase = $pdo->prepare($sqlSaldoBase);
    $paramsBase = array_merge([':desde' => $start], $inParams);
    $stBase->execute($paramsBase);

    $base = $stBase->fetch(PDO::FETCH_ASSOC) ?: ['ingresos' => 0, 'egresos' => 0, 'otros' => 0];
    $saldoBase = (float)($base['ingresos'] ?? 0) + (float)($base['otros'] ?? 0) - (float)($base['egresos'] ?? 0);

    // 3) construir filas (saldo acumulado)
    $saldo = $saldoBase;
    $rows = [];

    foreach ($days as $iso) {
      $isFuture = ($iso > $today);

      $ing = (float)($mapDia[$iso]['ingresos'] ?? 0.0);
      $egr = (float)($mapDia[$iso]['egresos'] ?? 0.0);
      $otr = (float)($mapDia[$iso]['otros'] ?? 0.0);

      if ($isFuture) {
        $rows[] = [
          'fecha' => $iso,
          'ingresos' => null,
          'egresos' => null,
          'otros' => null,
          'saldo' => $saldo,
        ];
        continue;
      }

      // ✅ saldo = saldo + ingresos + otros - egresos
      $saldo = $saldo + $ing + $otr - $egr;

      $rows[] = [
        'fecha' => $iso,
        'ingresos' => $ing,
        'egresos' => $egr,
        'otros' => $otr, // ✅ signed
        'saldo' => $saldo,
      ];
    }

    ok([
      'periodo' => $periodo,
      'tiendas' => [[
        'id_tienda' => 0,
        'nombre' => 'GENERAL',
        'saldo_base' => $saldoBase,
        'rows' => $rows,
        'debug_clasif_ingreso' => $ingresoClasifIds, // podés borrarlo si no querés
      ]],
    ]);
  }

  fail('Acción no soportada en flujo_caja.php', 200, ['action' => $action]);

} catch (Throwable $e) {
  fail('Error generando flujo de caja: ' . $e->getMessage(), 500);
}
