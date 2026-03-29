<?php
// backend/modules/flujo_caja/flujo_caja.php
declare(strict_types=1);

/**
 * MULTI-TENANT:
 * - NO incluir config/db.php
 * - $pdo ya viene creado por tenant_bootstrap_or_fail() en routes/api.php
 *
 * LÓGICA:
 *  INGRESOS =
 *      a) Ventas contado                 (id_tipo_operacion=1, id_tipo_venta=1) → m.fecha
 *      b) Ventas CC cobradas             (id_tipo_operacion=1, id_tipo_venta=2) → c.fecha_cobro
 *      c) Otros ingresos                 (id_tipo_operacion=3)                   → m.fecha
 *
 *  EGRESOS  =
 *      a) Compras contado                (id_tipo_operacion=2, id_tipo_venta=1) → m.fecha
 *      b) Compras CC pagadas             (id_tipo_operacion=2, id_tipo_venta=2) → c.fecha_cobro
 *      c) Otros egresos                  (id_tipo_operacion=4)                   → m.fecha
 */

header('Content-Type: application/json; charset=utf-8');

global $pdo;
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
    $out   = [];
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
       LISTAR PERIODOS DISPONIBLES
       action=flujo_caja_periodos
    ========================================================== */
    if ($action === 'flujo_caja_periodos') {
        $sql = "
            SELECT DISTINCT DATE_FORMAT(fecha, '%Y-%m') AS periodo
            FROM movimientos
            WHERE fecha IS NOT NULL
            ORDER BY periodo DESC
        ";
        $st       = $pdo->query($sql);
        $periodos = $st->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $periodos = array_values(array_filter(array_map(fn($p) => (string)$p, $periodos)));

        ok([
            'periodos' => $periodos,
            'total'    => count($periodos),
        ]);
    }

    /* ==========================================================
       FLUJO POR CLIENTES
       action=flujo_caja_clientes
    ========================================================== */
    if ($action === 'flujo_caja_clientes') {

        $periodo        = isset($_GET['periodo']) ? trim((string)$_GET['periodo']) : '';
        $filtrarPeriodo = ($periodo !== '' && isValidPeriodo($periodo));

        $params = [];
        $whereExtra = "";

        if ($filtrarPeriodo) {
            $whereExtra = " AND DATE_FORMAT(m.fecha, '%Y-%m') = :periodo ";
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
            'periodo'        => $filtrarPeriodo ? $periodo : null,
            'rows'           => $rows,
            'total_clientes' => count($rows),
        ]);
    }

    /* ==========================================================
       FLUJO DIARIO
       action=flujo_caja_resumen

       INGRESOS:
         a) Ventas contado:         id_tipo_operacion=1, id_tipo_venta=1 → m.fecha
         b) Ventas CC cobradas:     id_tipo_operacion=1, id_tipo_venta=2 → c.fecha_cobro
         c) Otros ingresos:         id_tipo_operacion=3                  → m.fecha

       EGRESOS:
         a) Compras contado:        id_tipo_operacion=2, id_tipo_venta=1 → m.fecha
         b) Compras CC pagadas:     id_tipo_operacion=2, id_tipo_venta=2 → c.fecha_cobro
         c) Otros egresos:          id_tipo_operacion=4                  → m.fecha
    ========================================================== */
    if ($action === 'flujo_caja_resumen') {

        // ── Resolver start / end ─────────────────────────────
        $periodoParam = isset($_GET['periodo'])     ? trim((string)$_GET['periodo'])     : '';
        $fechaDesde   = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
        $fechaHasta   = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

        if ($fechaDesde !== '' && $fechaHasta !== '') {
            if (!isValidDate($fechaDesde)) {
                fail('Parámetro "fecha_desde" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaDesde]);
            }
            if (!isValidDate($fechaHasta)) {
                fail('Parámetro "fecha_hasta" inválido. Formato esperado YYYY-MM-DD', 200, ['recibido' => $fechaHasta]);
            }
            if ($fechaDesde > $fechaHasta) {
                [$fechaDesde, $fechaHasta] = [$fechaHasta, $fechaDesde];
            }
            $start        = $fechaDesde;
            $end          = $fechaHasta;
            $periodoLabel = substr($fechaDesde, 0, 7);
        } elseif ($periodoParam !== '') {
            if (!isValidPeriodo($periodoParam)) {
                fail('Parámetro "periodo" inválido. Formato esperado YYYY-MM', 200, ['periodo_recibido' => $periodoParam]);
            }
            $start        = monthStart($periodoParam);
            $end          = monthEnd($periodoParam);
            $periodoLabel = $periodoParam;
        } else {
            fail('Se requiere "fecha_desde"+"fecha_hasta" o "periodo".', 200);
        }
        // ─────────────────────────────────────────────────────

        $days  = buildDaysFromRange($start, $end);
        $today = (new DateTime('today'))->format('Y-m-d');

        /* ── QUERY principal: ingresos y egresos por día ────── */
        $sqlDia = "
            SELECT
                dia,
                COALESCE(SUM(ingreso), 0) AS ingresos,
                COALESCE(SUM(egreso),  0) AS egresos
            FROM (

                -- 1) Ventas contado (fecha del movimiento)
                SELECT
                    m.fecha AS dia,
                    ABS(m.monto_total) AS ingreso,
                    0 AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 1
                  AND m.id_tipo_venta = 1
                  AND m.fecha BETWEEN :desde1 AND :hasta1

                UNION ALL

                -- 2) Ventas CC cobradas (fecha_cobro)
                SELECT
                    c.fecha_cobro AS dia,
                    ABS(m.monto_total) AS ingreso,
                    0 AS egreso
                FROM movimientos m
                INNER JOIN cobros c ON c.id_movimiento = m.id_movimiento
                WHERE m.id_tipo_operacion = 1
                  AND m.id_tipo_venta = 2
                  AND c.fecha_cobro BETWEEN :desde2 AND :hasta2

                UNION ALL

                -- 3) Otros ingresos (fecha del movimiento)
                SELECT
                    m.fecha AS dia,
                    ABS(m.monto_total) AS ingreso,
                    0 AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 3
                  AND m.fecha BETWEEN :desde3 AND :hasta3

                UNION ALL

                -- 4) Compras contado (fecha del movimiento)
                SELECT
                    m.fecha AS dia,
                    0 AS ingreso,
                    ABS(m.monto_total) AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 2
                  AND m.id_tipo_venta = 1
                  AND m.fecha BETWEEN :desde4 AND :hasta4

                UNION ALL

                -- 5) Compras CC pagadas (fecha_cobro)
                SELECT
                    c.fecha_cobro AS dia,
                    0 AS ingreso,
                    ABS(m.monto_total) AS egreso
                FROM movimientos m
                INNER JOIN cobros c ON c.id_movimiento = m.id_movimiento
                WHERE m.id_tipo_operacion = 2
                  AND m.id_tipo_venta = 2
                  AND c.fecha_cobro BETWEEN :desde5 AND :hasta5

                UNION ALL

                -- 6) Otros egresos (fecha del movimiento)
                SELECT
                    m.fecha AS dia,
                    0 AS ingreso,
                    ABS(m.monto_total) AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 4
                  AND m.fecha BETWEEN :desde6 AND :hasta6

            ) t
            GROUP BY dia
        ";

        $stDia = $pdo->prepare($sqlDia);
        $stDia->execute([
            ':desde1' => $start, ':hasta1' => $end,
            ':desde2' => $start, ':hasta2' => $end,
            ':desde3' => $start, ':hasta3' => $end,
            ':desde4' => $start, ':hasta4' => $end,
            ':desde5' => $start, ':hasta5' => $end,
            ':desde6' => $start, ':hasta6' => $end,
        ]);

        $mapDia = [];
        while ($r = $stDia->fetch(PDO::FETCH_ASSOC)) {
            $f = (string)($r['dia'] ?? '');
            if ($f !== '') {
                $mapDia[$f] = [
                    'ingresos' => (float)($r['ingresos'] ?? 0),
                    'egresos'  => (float)($r['egresos']  ?? 0),
                ];
            }
        }

        /* ── SALDO BASE: todo lo anterior a $start ─────────── */
        $sqlSaldoBase = "
            SELECT
                COALESCE(SUM(ingreso), 0) AS ingresos,
                COALESCE(SUM(egreso),  0) AS egresos
            FROM (

                -- 1) Ventas contado anteriores
                SELECT ABS(m.monto_total) AS ingreso, 0 AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 1
                  AND m.id_tipo_venta = 1
                  AND m.fecha < :desde1

                UNION ALL

                -- 2) Ventas CC cobradas anteriores
                SELECT ABS(m.monto_total) AS ingreso, 0 AS egreso
                FROM movimientos m
                INNER JOIN cobros c ON c.id_movimiento = m.id_movimiento
                WHERE m.id_tipo_operacion = 1
                  AND m.id_tipo_venta = 2
                  AND c.fecha_cobro < :desde2

                UNION ALL

                -- 3) Otros ingresos anteriores
                SELECT ABS(m.monto_total) AS ingreso, 0 AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 3
                  AND m.fecha < :desde3

                UNION ALL

                -- 4) Compras contado anteriores
                SELECT 0 AS ingreso, ABS(m.monto_total) AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 2
                  AND m.id_tipo_venta = 1
                  AND m.fecha < :desde4

                UNION ALL

                -- 5) Compras CC pagadas anteriores
                SELECT 0 AS ingreso, ABS(m.monto_total) AS egreso
                FROM movimientos m
                INNER JOIN cobros c ON c.id_movimiento = m.id_movimiento
                WHERE m.id_tipo_operacion = 2
                  AND m.id_tipo_venta = 2
                  AND c.fecha_cobro < :desde5

                UNION ALL

                -- 6) Otros egresos anteriores
                SELECT 0 AS ingreso, ABS(m.monto_total) AS egreso
                FROM movimientos m
                WHERE m.id_tipo_operacion = 4
                  AND m.fecha < :desde6

            ) t
        ";

        $stBase = $pdo->prepare($sqlSaldoBase);
        $stBase->execute([
            ':desde1' => $start,
            ':desde2' => $start,
            ':desde3' => $start,
            ':desde4' => $start,
            ':desde5' => $start,
            ':desde6' => $start,
        ]);

        $base      = $stBase->fetch(PDO::FETCH_ASSOC) ?: ['ingresos' => 0, 'egresos' => 0];
        $saldoBase = (float)($base['ingresos'] ?? 0) - (float)($base['egresos'] ?? 0);

        /* ── Construir filas con saldo acumulado ───────────── */
        $saldo = $saldoBase;
        $rows  = [];

        foreach ($days as $iso) {
            $isFuture = ($iso > $today);

            $ing = (float)($mapDia[$iso]['ingresos'] ?? 0.0);
            $egr = (float)($mapDia[$iso]['egresos']  ?? 0.0);

            if ($isFuture) {
                $rows[] = [
                    'fecha'    => $iso,
                    'ingresos' => null,
                    'egresos'  => null,
                    'saldo'    => $saldo,
                ];
                continue;
            }

            $saldo += $ing - $egr;

            $rows[] = [
                'fecha'    => $iso,
                'ingresos' => $ing,
                'egresos'  => $egr,
                'saldo'    => $saldo,
            ];
        }

        ok([
            'periodo' => $periodoLabel,
            'rango'   => ['desde' => $start, 'hasta' => $end],
            'tiendas' => [[
                'id_tienda'  => 0,
                'nombre'     => 'GENERAL',
                'saldo_base' => $saldoBase,
                'rows'       => $rows,
            ]],
        ]);
    }

    fail('Acción no soportada en flujo_caja.php', 200, ['action' => $action]);

} catch (Throwable $e) {
    fail('Error generando flujo de caja: ' . $e->getMessage(), 500);
}