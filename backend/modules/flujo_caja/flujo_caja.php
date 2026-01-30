<?php
// backend/modules/flujo_caja/flujo_caja.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php'; // $pdo

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

/* =========================
   Acción
========================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    fail('DB no inicializada ($pdo es null). Revisá backend/config/db.php', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

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
    $st = $pdo->prepare($sql);
    $st->execute();

    $periodos = [];
    while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
      $p = (string)($r['periodo'] ?? '');
      if ($p !== '' && isValidPeriodo($p)) $periodos[] = $p;
    }

    ok([
      'periodos' => $periodos,
      'total' => count($periodos),
    ]);
  }

  /* ==========================================================
     … A) FLUJO POR CLIENTES (opcional)
     action=flujo_caja_clientes
  ========================================================== */
  if ($action === 'flujo_caja_clientes') {

    $TIPO_INGRESO = 1;
    $TIPO_EGRESO  = 2;

    $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
    $filtrarPeriodo = ($periodo !== '' && isValidPeriodo($periodo));

    $params = [
      ':ing' => $TIPO_INGRESO,
      ':egr' => $TIPO_EGRESO,
    ];

    $whereExtra = "";
    if ($filtrarPeriodo) {
      $whereExtra = " AND m.periodo = :periodo ";
      $params[':periodo'] = $periodo;
    }

    $sql = "
      SELECT
        c.id_cliente,
        c.nombre AS cliente,
        COALESCE(SUM(CASE WHEN m.id_tipo_movimiento = :ing THEN m.monto_total ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN m.id_tipo_movimiento = :egr THEN m.monto_total ELSE 0 END), 0) AS egresos
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
      $ing = (float)$r['ingresos'];
      $egr = (float)$r['egresos'];
      $rows[] = [
        'id_cliente' => (int)$r['id_cliente'],
        'cliente'    => (string)$r['cliente'],
        'ingresos'   => $ing,
        'egresos'    => $egr,
        'saldo'      => $ing - $egr,
      ];
    }

    ok([
      'periodo' => $filtrarPeriodo ? $periodo : null,
      'rows' => $rows,
      'total_clientes' => count($rows),
    ]);
  }

  /* ==========================================================
     ✅ B) FLUJO DIARIO TIPO EXCEL (ARREGLADO)
     - NO incluye el último día del mes anterior
     - arranca desde el día 01 con saldo = saldoBase + (ing-eg)
     action=flujo_caja_resumen
  ========================================================== */
  if ($action === 'flujo_caja_resumen') {

    $periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
    if ($periodo === '' || !isValidPeriodo($periodo)) {
      fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodo]);
    }

    $TIPO_INGRESO = 1;
    $TIPO_EGRESO  = 2;

    $start = monthStart($periodo);
    $end   = monthEnd($periodo);

    // ✅ días SOLO del mes (sin "día previo")
    $days = buildDays($periodo);
    $today = (new DateTime('today'))->format('Y-m-d');

    // 1) totales por día (ing/eg) SOLO dentro del mes
    $sqlDia = "
      SELECT
        fecha,
        COALESCE(SUM(CASE WHEN id_tipo_movimiento = :ing THEN monto_total ELSE 0 END), 0) AS ingresos,
        COALESCE(SUM(CASE WHEN id_tipo_movimiento = :egr THEN monto_total ELSE 0 END), 0) AS egresos
      FROM movimientos
      WHERE fecha BETWEEN :desde AND :hasta
      GROUP BY fecha
    ";

    $stDia = $pdo->prepare($sqlDia);
    $stDia->execute([
      ':ing' => $TIPO_INGRESO,
      ':egr' => $TIPO_EGRESO,
      ':desde' => $start,
      ':hasta' => $end,
    ]);

    $mapDia = [];
    while ($r = $stDia->fetch(PDO::FETCH_ASSOC)) {
      $f = (string)$r['fecha'];
      $mapDia[$f] = [
        'ingresos' => (float)$r['ingresos'],
        'egresos'  => (float)$r['egresos'],
      ];
    }

    // 2) saldo base (todo lo anterior al mes)
    $sqlSaldoBase = "
      SELECT
        COALESCE(SUM(CASE WHEN id_tipo_movimiento = :ing THEN monto_total ELSE 0 END), 0)
        -
        COALESCE(SUM(CASE WHEN id_tipo_movimiento = :egr THEN monto_total ELSE 0 END), 0)
        AS saldo
      FROM movimientos
      WHERE fecha < :desde
    ";

    $stBase = $pdo->prepare($sqlSaldoBase);
    $stBase->execute([
      ':ing' => $TIPO_INGRESO,
      ':egr' => $TIPO_EGRESO,
      ':desde' => $start,
    ]);

    $saldoBase = (float)($stBase->fetchColumn() ?: 0.0);

    // 3) construir filas: arrancar desde saldoBase
    $saldo = $saldoBase;
    $rows = [];

    foreach ($days as $iso) {
      $isFuture = ($iso > $today);

      $ing = (float)($mapDia[$iso]['ingresos'] ?? 0.0);
      $egr = (float)($mapDia[$iso]['egresos'] ?? 0.0);

      if ($isFuture) {
        // Futuro: no mostrar importes, pero mantener saldo acumulado hasta hoy
        $rows[] = [
          'fecha' => $iso,
          'ingresos' => null,
          'egresos' => null,
          'saldo' => $saldo,
        ];
        continue;
      }

      // ✅ saldo del día = saldo anterior + (ing - egr)
      $saldo = $saldo + $ing - $egr;

      $rows[] = [
        'fecha' => $iso,
        'ingresos' => $ing,
        'egresos' => $egr,
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
      ]],
    ]);
  }

  fail('Acción no soportada en flujo_caja.php', 200, ['action' => $action]);

} catch (Throwable $e) {
  fail('Error generando flujo de caja: ' . $e->getMessage(), 500);
}
