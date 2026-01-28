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
function prevDay(string $isoDate): string {
  $dt = DateTime::createFromFormat('Y-m-d', $isoDate);
  if (!$dt) return $isoDate;
  $dt->modify('-1 day');
  return $dt->format('Y-m-d');
}
function buildDaysWithPrev(string $periodo): array {
  $start = monthStart($periodo);
  $end   = monthEnd($periodo);
  $prev  = prevDay($start);

  $out = [];
  $out[] = $prev;

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
   Inputs
========================= */
$periodo = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
if ($periodo === '' || !isValidPeriodo($periodo)) {
  fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodo]);
}

$idTiendaRaw = isset($_GET['id_tienda']) ? trim((string)$_GET['id_tienda']) : '';
$idTienda = null;
if ($idTiendaRaw !== '') {
  $n = (int)$idTiendaRaw;
  if ($n <= 0) {
    fail('Parámetro "id_tienda" inválido.', 200, ['id_tienda_recibido' => $idTiendaRaw]);
  }
  $idTienda = $n;
}

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    fail('DB no inicializada ($pdo es null). Revisá backend/config/db.php', 500);
  }

  /* =========================
     Config (SOLO caja: 1/4/5)
  ========================= */
  $TIPO_INGRESO = 1;
  $TIPO_EGRESO  = 2;

  // ✅ Este reporte SOLO mira estas formas:
  $FORMA_EFECTIVO = 1;
  $FORMA_TRANSFER = 4;
  $FORMA_TARJETA  = 5;

  /* =========================
     Rango fechas
  ========================= */
  $start = monthStart($periodo);
  $end   = monthEnd($periodo);
  $startWithPrev = prevDay($start);

  $days = buildDaysWithPrev($periodo);
  $today = (new DateTime('today'))->format('Y-m-d');

  /* =========================
     0) Tiendas objetivo
  ========================= */
  if ($idTienda !== null) {
    $st = $pdo->prepare("SELECT id_tienda, nombre FROM tiendas WHERE id_tienda = :id AND activo = 1 LIMIT 1");
    $st->execute([':id' => $idTienda]);
    $t = $st->fetch(PDO::FETCH_ASSOC);
    if (!$t) fail("La tienda seleccionada no existe o está inactiva.", 200, ['id_tienda' => $idTienda]);

    $tiendas = [[
      'id_tienda' => (int)$t['id_tienda'],
      'nombre'    => (string)$t['nombre'],
    ]];
  } else {
    $tiendas = [];
    $st = $pdo->query("SELECT id_tienda, nombre FROM tiendas WHERE activo = 1 ORDER BY nombre ASC");
    while ($t = $st->fetch(PDO::FETCH_ASSOC)) {
      $tiendas[] = [
        'id_tienda' => (int)$t['id_tienda'],
        'nombre'    => (string)$t['nombre'],
      ];
    }
    if (!$tiendas) fail("No hay tiendas activas para mostrar.", 200);
  }

  $tidMain = (int)$tiendas[0]['id_tienda'];

  /* =========================
     1) INGRESOS (SOLO 1/4/5)
     (incluye el día anterior)
  ========================= */
  $sqlIngresos = "
    SELECT
      m.id_tienda AS id_tienda,
      m.fecha AS fecha,
      m.id_forma_transaccion AS forma,
      SUM(m.monto_total) AS total
    FROM movimientos m
    WHERE m.id_tienda = :id_tienda
      AND m.id_tipo_movimiento = :tipo_ingreso
      AND m.fecha BETWEEN :desde AND :hasta
      AND m.id_forma_transaccion IN (:f_ef, :f_tr, :f_tj)
    GROUP BY m.id_tienda, m.fecha, m.id_forma_transaccion
  ";

  $stIng = $pdo->prepare($sqlIngresos);
  $stIng->execute([
    ':id_tienda'    => $tidMain,
    ':tipo_ingreso' => $TIPO_INGRESO,
    ':desde'        => $startWithPrev,
    ':hasta'        => $end,
    ':f_ef'         => $FORMA_EFECTIVO,
    ':f_tr'         => $FORMA_TRANSFER,
    ':f_tj'         => $FORMA_TARJETA,
  ]);

  $ingresosByTienda = [];
  while ($row = $stIng->fetch(PDO::FETCH_ASSOC)) {
    $tid   = (int)$row['id_tienda'];
    $f     = (string)$row['fecha'];
    $forma = (int)$row['forma'];
    $total = (float)$row['total'];

    if (!isset($ingresosByTienda[$tid])) $ingresosByTienda[$tid] = [];
    if (!isset($ingresosByTienda[$tid][$f])) {
      $ingresosByTienda[$tid][$f] = ['efectivo' => 0.0, 'transferencias' => 0.0, 'tarjeta' => 0.0];
    }

    if ($forma === $FORMA_EFECTIVO) {
      $ingresosByTienda[$tid][$f]['efectivo'] += $total;
    } elseif ($forma === $FORMA_TRANSFER) {
      $ingresosByTienda[$tid][$f]['transferencias'] += $total;
    } elseif ($forma === $FORMA_TARJETA) {
      $ingresosByTienda[$tid][$f]['tarjeta'] += $total;
    }
  }

  /* =========================
     2) EGRESOS (SOLO 1/4/5)
     (incluye el día anterior)
  ========================= */
  $sqlEgresos = "
    SELECT
      m.id_tienda AS id_tienda,
      m.fecha AS fecha,
      SUM(m.monto_total) AS total
    FROM movimientos m
    WHERE m.id_tienda = :id_tienda
      AND m.id_tipo_movimiento = :tipo_egreso
      AND m.fecha BETWEEN :desde AND :hasta
      AND m.id_forma_transaccion IN (:f_ef, :f_tr, :f_tj)
    GROUP BY m.id_tienda, m.fecha
  ";

  $stEg = $pdo->prepare($sqlEgresos);
  $stEg->execute([
    ':id_tienda'   => $tidMain,
    ':tipo_egreso' => $TIPO_EGRESO,
    ':desde'       => $startWithPrev,
    ':hasta'       => $end,
    ':f_ef'        => $FORMA_EFECTIVO,
    ':f_tr'        => $FORMA_TRANSFER,
    ':f_tj'        => $FORMA_TARJETA,
  ]);

  $egresosByTienda = [];
  while ($row = $stEg->fetch(PDO::FETCH_ASSOC)) {
    $tid   = (int)$row['id_tienda'];
    $f     = (string)$row['fecha'];
    $total = (float)$row['total'];

    if (!isset($egresosByTienda[$tid])) $egresosByTienda[$tid] = [];
    $egresosByTienda[$tid][$f] = ($egresosByTienda[$tid][$f] ?? 0.0) + $total;
  }

  /* =========================
     ✅ 3) SALDO BASE (SOLO 1/4/5)
     = (ingresos 1/4/5) - (egresos 1/4/5)
     de TODO lo anterior al mes seleccionado
  ========================= */
  $sqlSaldoBase = "
    SELECT
      COALESCE(SUM(
        CASE
          WHEN id_tipo_movimiento = :ingreso
               AND id_forma_transaccion IN (:f_ef, :f_tr, :f_tj)
            THEN monto_total
          WHEN id_tipo_movimiento = :egreso
               AND id_forma_transaccion IN (:f_ef, :f_tr, :f_tj)
            THEN -monto_total
          ELSE 0
        END
      ),0) AS saldo
    FROM movimientos
    WHERE id_tienda = :id_tienda
      AND fecha < :desde
  ";

  $stSaldo = $pdo->prepare($sqlSaldoBase);
  $stSaldo->execute([
    ':ingreso'   => $TIPO_INGRESO,
    ':egreso'    => $TIPO_EGRESO,
    ':id_tienda' => $tidMain,
    ':desde'     => $start,
    ':f_ef'      => $FORMA_EFECTIVO,
    ':f_tr'      => $FORMA_TRANSFER,
    ':f_tj'      => $FORMA_TARJETA,
  ]);

  $saldoBase = (float)($stSaldo->fetchColumn() ?: 0.0);

  /* =========================
     4) Filas día por día
  ========================= */
  $t = $tiendas[0];
  $tid = (int)$t['id_tienda'];

  $saldo = $saldoBase;
  $rows = [];

  foreach ($days as $iso) {
    $isFuture = ($iso > $today);

    $tarjeta = (float)($ingresosByTienda[$tid][$iso]['tarjeta'] ?? 0.0);
    $transferencias = (float)($ingresosByTienda[$tid][$iso]['transferencias'] ?? 0.0);
    $efectivo = (float)($ingresosByTienda[$tid][$iso]['efectivo'] ?? 0.0);

    $egresos = (float)($egresosByTienda[$tid][$iso] ?? 0.0);

    if ($isFuture) {
      $rows[] = [
        'fecha' => $iso,
        'tarjeta' => null,
        'transferencias' => null,
        'efectivo' => null,
        'egresos' => null,
        'saldo' => $saldo,
      ];
      continue;
    }

    $saldo = $saldo + $tarjeta + $transferencias + $efectivo - $egresos;

    $rows[] = [
      'fecha' => $iso,
      'tarjeta' => $tarjeta,
      'transferencias' => $transferencias,
      'efectivo' => $efectivo,
      'egresos' => $egresos,
      'saldo' => $saldo,
    ];
  }

  ok([
    'periodo' => $periodo,
    'tiendas' => [[
      'id_tienda'  => $tid,
      'nombre'     => (string)$t['nombre'],
      'saldo_base' => $saldoBase,
      'rows'       => $rows,
    ]],
  ]);

} catch (Throwable $e) {
  fail('Error generando flujo de caja: ' . $e->getMessage(), 500);
}
