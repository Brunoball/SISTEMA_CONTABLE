<?php
// backend/modules/cuentas_corrientes/cuentas_corrientes.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db.php'; // define $pdo

/* =========================
   Response helpers
========================= */
function cc_ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function cc_fail(string $msg, int $http = 200, array $extra = []): void {
  http_response_code($http);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Params / validation
========================= */
function cc_param(string $k, $default = null) {
  return $_GET[$k] ?? $_POST[$k] ?? $default;
}
function cc_isValidPeriodo(?string $p): bool {
  if ($p === null || $p === '') return true; // vacío = sin filtro
  return (bool)preg_match('/^\d{4}\-\d{2}$/', $p); // YYYY-MM
}

/* =========================
   Helpers contables
   - Detecta columnas crédito/débito por nombre
   - Si no coincide, NO suma al saldo (pero sí muestra la columna)
========================= */
function cc_sign_from_nombre(string $nombre): int {
  $n = mb_strtolower(trim($nombre), 'UTF-8');
  if (str_contains($n, 'credito')) return +1; // suma
  if (str_contains($n, 'débito') || str_contains($n, 'debito')) return -1; // resta
  return 0; // otras cuentas (ej: "PRUEBAA") solo se muestran, no afectan saldo
}

/* =========================
   Acción
========================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    cc_fail('DB no inicializada ($pdo no disponible). Revisá backend/config/db.php', 500);
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  // alias
  if ($action === 'cuentas_corrientes_resumen') $action = 'cc_resumen';
  if ($action === 'cuenta_corriente_detalle')  $action = 'cc_detalle';

  /* =========================================================
     ✅ RESUMEN DINÁMICO:
     - Columnas = TODOS los registros de cuentas_corrientes (activo=1)
     - Celdas = SUM(m.movimientos.monto_total) agrupado por cliente + cuenta
     - Saldo = suma de cuentas con "credito" - suma de cuentas con "debito"
       (detectado por nombre en cuentas_corrientes)
  ========================================================= */
  if ($action === 'cc_resumen') {

    $periodo = trim((string)cc_param('periodo', ''));
    if (!cc_isValidPeriodo($periodo)) {
      cc_fail('Periodo inválido. Usá formato YYYY-MM.', 200, ['periodo_recibido' => $periodo]);
    }

    // 1) traer cuentas corrientes (para columnas)
    $stC = $pdo->query("
      SELECT id_cuenta_corriente, nombre
      FROM cuentas_corrientes
      WHERE activo = 1
      ORDER BY id_cuenta_corriente ASC
    ");
    $cuentas = $stC->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // map id => nombre, y signo para saldo
    $ccName = [];
    $ccSign = [];
    foreach ($cuentas as $c) {
      $id = (int)($c['id_cuenta_corriente'] ?? 0);
      $nm = (string)($c['nombre'] ?? '');
      if ($id > 0) {
        $ccName[$id] = $nm;
        $ccSign[$id] = cc_sign_from_nombre($nm);
      }
    }

    // si no hay cuentas, devolvemos vacío
    if (count($ccName) === 0) {
      cc_ok([
        'periodo' => ($periodo !== '' ? $periodo : null),
        'cuentas' => [],
        'rows' => [],
        'totales' => ['columnas' => new stdClass(), 'saldo' => 0],
        'total_clientes' => 0,
      ]);
    }

    // 2) traer todos los clientes activos
    $stCli = $pdo->query("
      SELECT id_cliente, nombre
      FROM clientes
      WHERE activo = 1
      ORDER BY nombre ASC
    ");
    $clientes = $stCli->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // 3) traer movimientos agrupados por cliente + cuenta (con filtro periodo opcional)
    $wherePeriodo = '';
    $params = [];
    if ($periodo !== '') {
      $wherePeriodo = " AND m.periodo = :periodo ";
      $params[':periodo'] = $periodo;
    }

    // solo consideramos movimientos con id_cliente e id_cuenta_corriente
    $sqlMov = "
      SELECT
        m.id_cliente,
        m.id_cuenta_corriente,
        COALESCE(SUM(m.monto_total), 0) AS total
      FROM movimientos m
      WHERE m.id_cliente IS NOT NULL
        AND m.id_cuenta_corriente IS NOT NULL
        $wherePeriodo
      GROUP BY m.id_cliente, m.id_cuenta_corriente
    ";
    $stM = $pdo->prepare($sqlMov);
    foreach ($params as $k => $v) $stM->bindValue($k, $v);
    $stM->execute();
    $movAgg = $stM->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // index: clienteId => (cuentaId => total)
    $idx = [];
    foreach ($movAgg as $r) {
      $cid = (int)($r['id_cliente'] ?? 0);
      $ccid = (int)($r['id_cuenta_corriente'] ?? 0);
      $tot = (float)($r['total'] ?? 0);

      if ($cid <= 0 || $ccid <= 0) continue;
      if (!isset($ccName[$ccid])) continue; // solo cuentas activas conocidas

      if (!isset($idx[$cid])) $idx[$cid] = [];
      $idx[$cid][$ccid] = $tot;
    }

    // 4) armar salida: filas con columnas completas (todas las cuentas)
    $rowsOut = [];
    $totCols = []; // cuentaId => total
    foreach (array_keys($ccName) as $ccid) $totCols[$ccid] = 0.0;
    $totSaldo = 0.0;

    foreach ($clientes as $c) {
      $cid = (int)($c['id_cliente'] ?? 0);
      $nombre = (string)($c['nombre'] ?? '');
      if ($cid <= 0) continue;

      $cols = [];
      $saldo = 0.0;

      foreach ($ccName as $ccid => $_nm) {
        $val = (float)($idx[$cid][$ccid] ?? 0.0);
        $cols[(string)$ccid] = $val;

        // total por columna
        $totCols[$ccid] += $val;

        // saldo según signo (credito +, debito -)
        $sgn = (int)($ccSign[$ccid] ?? 0);
        if ($sgn !== 0) $saldo += ($sgn * $val);
      }

      $totSaldo += $saldo;

      $rowsOut[] = [
        'id_cliente' => $cid,
        'nombre' => $nombre,
        'columnas' => $cols,
        'saldo' => $saldo,
      ];
    }

    // 5) devolver
    $cuentasOut = [];
    foreach ($ccName as $ccid => $nm) {
      $cuentasOut[] = [
        'id_cuenta_corriente' => (int)$ccid,
        'nombre' => (string)$nm,
        'signo_saldo' => (int)($ccSign[$ccid] ?? 0), // útil para debug
      ];
    }

    cc_ok([
      'periodo' => ($periodo !== '' ? $periodo : null),
      'cuentas' => $cuentasOut,
      'rows' => $rowsOut,
      'totales' => [
        'columnas' => $totCols,
        'saldo' => $totSaldo,
      ],
      'total_clientes' => count($rowsOut),
    ]);
  }

  /* =========================================================
     ✅ DETALLE por cliente (opcional)
     - lista movimientos del cliente, mostrando en qué cuenta cayó
     - y saldo acumulado usando signo por nombre de cuenta
  ========================================================= */
  if ($action === 'cc_detalle') {

    $idCliente = (int)cc_param('id_cliente', 0);
    if ($idCliente <= 0) cc_fail('Falta id_cliente válido.', 200, ['id_recibido' => $idCliente]);

    $periodo = trim((string)cc_param('periodo', ''));
    if (!cc_isValidPeriodo($periodo)) {
      cc_fail('Periodo inválido. Usá formato YYYY-MM.', 200, ['periodo_recibido' => $periodo]);
    }

    // map cuentas activas y signo por nombre
    $stC = $pdo->query("
      SELECT id_cuenta_corriente, nombre
      FROM cuentas_corrientes
      WHERE activo = 1
      ORDER BY id_cuenta_corriente ASC
    ");
    $cuentas = $stC->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $ccName = [];
    $ccSign = [];
    foreach ($cuentas as $c) {
      $id = (int)($c['id_cuenta_corriente'] ?? 0);
      $nm = (string)($c['nombre'] ?? '');
      if ($id > 0) {
        $ccName[$id] = $nm;
        $ccSign[$id] = cc_sign_from_nombre($nm);
      }
    }

    $wherePeriodo = '';
    $params = [':id_cliente' => $idCliente];
    if ($periodo !== '') {
      $wherePeriodo = " AND m.periodo = :periodo ";
      $params[':periodo'] = $periodo;
    }

    $sql = "
      SELECT
        m.id_movimiento,
        m.fecha,
        m.periodo,
        m.id_cuenta_corriente,
        m.monto_total
      FROM movimientos m
      WHERE m.id_cliente = :id_cliente
        AND m.id_cuenta_corriente IS NOT NULL
        $wherePeriodo
      ORDER BY m.fecha ASC, m.id_movimiento ASC
    ";
    $st = $pdo->prepare($sql);
    foreach ($params as $k => $v) $st->bindValue($k, $v);
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $saldo = 0.0;
    $detalle = [];

    foreach ($rows as $r) {
      $ccid = (int)($r['id_cuenta_corriente'] ?? 0);
      $monto = (float)($r['monto_total'] ?? 0);

      $sgn = (int)($ccSign[$ccid] ?? 0);
      if ($sgn !== 0) $saldo += ($sgn * $monto);

      $detalle[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)$r['fecha'],
        'periodo' => (string)$r['periodo'],
        'id_cuenta_corriente' => $ccid,
        'cuenta' => (string)($ccName[$ccid] ?? ('Cuenta #' . $ccid)),
        'monto' => $monto,
        'saldo' => $saldo,
      ];
    }

    cc_ok([
      'id_cliente' => $idCliente,
      'periodo' => ($periodo !== '' ? $periodo : null),
      'detalle' => $detalle,
      'saldo_final' => $saldo,
      'total_movimientos' => count($detalle),
    ]);
  }

  cc_fail('Acción no soportada en cuentas_corrientes.php', 200, ['action' => $action]);

} catch (Throwable $e) {
  cc_fail('Error en cuentas_corrientes: ' . $e->getMessage(), 500);
}
