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

/** @return array<int, string> */
function buildDaysFromRange(string $start, string $end): array {
  $out = [];
  $dt    = DateTime::createFromFormat('Y-m-d', $start);
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

  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  $action = strtolower(trim(is_string($action) ? $action : ''));

  /* ==========================================================
     ✅ LISTAR PERIODOS DISPONIBLES
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
      'total'    => count($periodos),
    ]);
  }

  /* ==========================================================
     ✅ FLUJO POR CLIENTES
     action=flujo_caja_clientes
  ========================================================== */
  if ($action === 'flujo_caja_clientes') {

    $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
    $filtrarPeriodo = ($periodo !== '' && isValidPeriodo($periodo));

    $params     = [];
    $whereExtra = "";
    if ($filtrarPeriodo) {
      $whereExtra      = " AND m.periodo = :periodo ";
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
      'periodo'         => $filtrarPeriodo ? $periodo : null,
      'rows'            => $rows,
      'total_clientes'  => count($rows),
    ]);
  }

  /* ==========================================================
     ✅ FLUJO DIARIO TIPO EXCEL
     action=flujo_caja_resumen

     Acepta DOS formas de pasar el rango:
       A) ?periodo=YYYY-MM          (legado, rango = mes completo)
       B) ?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD  (nuevo, desde Calendario)
  ========================================================== */
  if ($action === 'flujo_caja_resumen') {

    // ── Resolver start / end ─────────────────────────────────
    $periodoParam  = isset($_GET['periodo'])     ? trim((string)$_GET['periodo'])     : '';
    $fechaDesde    = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta    = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

    if ($fechaDesde !== '' && $fechaHasta !== '') {
      // Modo B: rango libre
      if (!isValidDate($fechaDesde)) {
        fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaDesde]);
      }
      if (!isValidDate($fechaHasta)) {
        fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaHasta]);
      }
      if ($fechaDesde > $fechaHasta) {
        // invertir silenciosamente
        [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
      }
      $start        = $fechaDesde;
      $end          = $fechaHasta;
      $periodoLabel = substr($fechaDesde, 0, 7); // YYYY-MM del primer día (para label)
    } elseif ($periodoParam !== '') {
      // Modo A: periodo mensual clásico
      if (!isValidPeriodo($periodoParam)) {
        fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodoParam]);
      }
      $start        = monthStart($periodoParam);
      $end          = monthEnd($periodoParam);
      $periodoLabel = $periodoParam;
    } else {
      fail('Se requiere "fecha_desde"+"fecha_hasta" o "periodo".', 200);
    }
    // ─────────────────────────────────────────────────────────

    $days  = buildDaysFromRange($start, $end);
    $today = (new DateTime('today'))->format('Y-m-d');

    // Clasificaciones que cuentan como "ingreso" dentro de OTROS
    $sqlIngresoClasif = "
      SELECT id_clasificacion
      FROM clasificaciones
      WHERE activo = 1
        AND UPPER(nombre) IN ('VENTAS', 'OTROS INGRESOS')
    ";
    $stClas = $pdo->query($sqlIngresoClasif);
    $ingresoClasifIds = $stClas->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $ingresoClasifIds = array_values(array_filter(array_map(fn($x) => (int)$x, $ingresoClasifIds)));

    $inPlaceholders = '';
    $inParams       = [];
    if (count($ingresoClasifIds) > 0) {
      $tmp = [];
      foreach ($ingresoClasifIds as $i => $idc) {
        $k      = ":c$i";
        $tmp[]  = $k;
        $inParams[$k] = $idc;
      }
      $inPlaceholders = implode(',', $tmp);
    } else {
      $inPlaceholders = 'NULL';
    }

    // 1) ingresos / egresos / otros por día
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
    $stDia    = $pdo->prepare($sqlDia);
    $paramsDia = array_merge([':desde' => $start, ':hasta' => $end], $inParams);
    $stDia->execute($paramsDia);

    $mapDia = [];
    while ($r = $stDia->fetch(PDO::FETCH_ASSOC)) {
      $f = (string)($r['fecha'] ?? '');
      if ($f !== '') {
        $mapDia[$f] = [
          'ingresos' => (float)($r['ingresos'] ?? 0),
          'egresos'  => (float)($r['egresos']  ?? 0),
          'otros'    => (float)($r['otros']    ?? 0),
        ];
      }
    }

    // 2) saldo base: todo lo anterior a $start
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
    $stBase    = $pdo->prepare($sqlSaldoBase);
    $paramsBase = array_merge([':desde' => $start], $inParams);
    $stBase->execute($paramsBase);

    $base      = $stBase->fetch(PDO::FETCH_ASSOC) ?: ['ingresos' => 0, 'egresos' => 0, 'otros' => 0];
    $saldoBase = (float)($base['ingresos'] ?? 0) + (float)($base['otros'] ?? 0) - (float)($base['egresos'] ?? 0);

    // 3) construir filas con saldo acumulado
    $saldo = $saldoBase;
    $rows  = [];

    foreach ($days as $iso) {
      $isFuture = ($iso > $today);

      $ing = (float)($mapDia[$iso]['ingresos'] ?? 0.0);
      $egr = (float)($mapDia[$iso]['egresos']  ?? 0.0);
      $otr = (float)($mapDia[$iso]['otros']    ?? 0.0);

      if ($isFuture) {
        $rows[] = [
          'fecha'    => $iso,
          'ingresos' => null,
          'egresos'  => null,
          'otros'    => null,
          'saldo'    => $saldo,
        ];
        continue;
      }

      $saldo  = $saldo + $ing + $otr - $egr;

      $rows[] = [
        'fecha'    => $iso,
        'ingresos' => $ing,
        'egresos'  => $egr,
        'otros'    => $otr,
        'saldo'    => $saldo,
      ];
    }

    ok([
      'periodo' => $periodoLabel,
      'rango'   => ['desde' => $start, 'hasta' => $end],
      'tiendas' => [[
        'id_tienda'             => 0,
        'nombre'                => 'GENERAL',
        'saldo_base'            => $saldoBase,
        'rows'                  => $rows,
        'debug_clasif_ingreso'  => $ingresoClasifIds,
      ]],
    ]);
  }

  fail('Acción no soportada en flujo_caja.php', 200, ['action' => $action]);

} catch (Throwable $e) {
  fail('Error generando flujo de caja: ' . $e->getMessage(), 500);
}