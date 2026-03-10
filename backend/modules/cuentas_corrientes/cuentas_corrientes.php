<?php
// backend/modules/cuentas_corrientes/cuentas_corrientes.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Este módulo debe ejecutarse vía routes/api.php (tenant_resolver).'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

/* =========================
   Helpers respuesta
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

function cc_param(string $k, $default = null) {
  return $_GET[$k] ?? $_POST[$k] ?? $default;
}

function cc_safe_text($v): string {
  return trim((string)($v ?? ''));
}

function cc_like_term(string $s): string {
  return '%' . $s . '%';
}

function cc_format_date(?string $date): string {
  if (!$date) return '';
  $ts = strtotime($date);
  if (!$ts) return (string)$date;
  return date('d/m/Y', $ts);
}

function cc_sign_from_nombre(string $nombre): int {
  $n = mb_strtolower(trim($nombre), 'UTF-8');
  $n = str_replace(['á','é','í','ó','ú','ü','ñ'], ['a','e','i','o','u','u','n'], $n);

  if (strpos($n, 'credito') !== false) return +1;
  if (strpos($n, 'debito') !== false)  return -1;
  return 0;
}

/* =========================
   Helpers búsqueda personas
========================= */
function cc_find_cliente_id(PDO $pdo, string $q): int
{
  $q = cc_safe_text($q);
  if ($q === '') return 0;

  $sql = "
    SELECT c.id_cliente
    FROM clientes c
    WHERE c.activo = 1
      AND (
        c.nombre LIKE :q
      )
    ORDER BY
      CASE WHEN c.nombre = :exacto THEN 0 ELSE 1 END,
      c.nombre ASC
    LIMIT 1
  ";
  $st = $pdo->prepare($sql);
  $st->execute([
    ':q' => cc_like_term($q),
    ':exacto' => $q,
  ]);
  return (int)($st->fetchColumn() ?: 0);
}

function cc_find_proveedor_id(PDO $pdo, string $q): int
{
  $q = cc_safe_text($q);
  if ($q === '') return 0;

  $sql = "
    SELECT p.id_proveedor
    FROM proveedores p
    WHERE COALESCE(p.activo, 1) = 1
      AND (
        COALESCE(p.razon_social, '') LIKE :q
        OR COALESCE(p.nombre, '') LIKE :q
      )
    ORDER BY
      CASE
        WHEN COALESCE(p.razon_social, '') = :exacto THEN 0
        WHEN COALESCE(p.nombre, '') = :exacto THEN 0
        ELSE 1
      END,
      COALESCE(NULLIF(p.razon_social, ''), p.nombre) ASC
    LIMIT 1
  ";
  $st = $pdo->prepare($sql);
  $st->execute([
    ':q' => cc_like_term($q),
    ':exacto' => $q,
  ]);
  return (int)($st->fetchColumn() ?: 0);
}

/* =========================
   Normalizar URL/archivo comprobante
========================= */
function cc_pick_comprobante_url(array $row): string
{
  $url = cc_safe_text($row['archivo_url'] ?? '');
  $path = cc_safe_text($row['archivo_path'] ?? '');

  if ($url !== '') return $url;
  if ($path !== '') return $path;

  return '';
}

/* =========================
   Helpers comprobantes
========================= */
function cc_get_movimiento_docs_map(PDO $pdo, array $movIds): array
{
  $movIds = array_values(array_unique(array_filter(array_map('intval', $movIds), static function($n) {
    return $n > 0;
  })));

  if (!$movIds) return [];

  $placeholders = implode(',', array_fill(0, count($movIds), '?'));

  $sql = "
    SELECT
      mc.id_movimiento,
      mc.id_comprobante,
      mc.tipo_relacion,
      mc.principal,
      ca.tipo AS archivo_tipo,
      ca.archivo_url,
      ca.archivo_path,
      ca.archivo_mime,
      ca.archivo_size
    FROM movimientos_comprobantes mc
    INNER JOIN comprobantes_archivos ca
      ON ca.id_comprobante = mc.id_comprobante
    WHERE mc.id_movimiento IN ($placeholders)
    ORDER BY
      mc.id_movimiento ASC,
      CASE
        WHEN mc.tipo_relacion = 'FACTURA' AND mc.principal = 1 THEN 0
        WHEN mc.tipo_relacion = 'FACTURA' THEN 1
        WHEN mc.principal = 1 THEN 2
        WHEN mc.tipo_relacion = 'NOTA_DEBITO' THEN 3
        WHEN mc.tipo_relacion = 'NOTA_CREDITO' THEN 4
        ELSE 9
      END ASC,
      mc.id_movimiento_comprobante DESC
  ";

  $st = $pdo->prepare($sql);
  $st->execute($movIds);
  $docs = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $map = [];
  foreach ($docs as $d) {
    $idMov = (int)($d['id_movimiento'] ?? 0);
    if ($idMov <= 0) continue;

    if (!isset($map[$idMov])) {
      $map[$idMov] = [
        'id_comprobante'   => (int)($d['id_comprobante'] ?? 0),
        'tipo_relacion'    => cc_safe_text($d['tipo_relacion'] ?? ''),
        'principal'        => (int)($d['principal'] ?? 0),
        'comprobante_url'  => cc_pick_comprobante_url($d),
        'comprobante_mime' => cc_safe_text($d['archivo_mime'] ?? ''),
        'archivo_tipo'     => cc_safe_text($d['archivo_tipo'] ?? ''),
        'archivo_path'     => cc_safe_text($d['archivo_path'] ?? ''),
        'archivo_size'     => isset($d['archivo_size']) ? (int)$d['archivo_size'] : null,
      ];
    }
  }

  return $map;
}

function cc_get_cobros_by_movimiento(PDO $pdo, array $movIds): array
{
  $movIds = array_values(array_unique(array_filter(array_map('intval', $movIds), static function($n) {
    return $n > 0;
  })));

  if (!$movIds) return [];

  $in = implode(',', array_fill(0, count($movIds), '?'));

  $sqlCobros = "
    SELECT
      c.id_cobro,
      c.id_movimiento,
      c.fecha_cobro,
      c.monto,
      c.id_comprobante,
      c.id_medio_pago,
      ca.archivo_url,
      ca.archivo_path,
      ca.archivo_mime,
      ca.archivo_size,
      ca.tipo AS tipo_archivo
    FROM cobros c
    LEFT JOIN comprobantes_archivos ca
      ON ca.id_comprobante = c.id_comprobante
    WHERE c.id_movimiento IN ($in)
    ORDER BY c.fecha_cobro ASC, c.id_cobro ASC
  ";

  $stCob = $pdo->prepare($sqlCobros);
  $stCob->execute($movIds);
  $cobros = $stCob->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $cobrosByMov = [];
  foreach ($cobros as $c) {
    $mid = (int)($c['id_movimiento'] ?? 0);
    if ($mid <= 0) continue;
    if (!isset($cobrosByMov[$mid])) $cobrosByMov[$mid] = [];
    $cobrosByMov[$mid][] = $c;
  }

  return $cobrosByMov;
}

/* =========================
   Historial tipo cuenta corriente
   - Un movimiento genera DÉBITO
   - Un cobro del movimiento genera CRÉDITO
========================= */
function cc_historial_por_entidad(PDO $pdo, array $cfg): array
{
  $entityType      = $cfg['entityType'];      // cliente | proveedor
  $idField         = $cfg['idField'];         // id_cliente | id_proveedor
  $entityId        = (int)$cfg['entityId'];
  $tipoOperacion   = (int)$cfg['tipoOperacion'];
  $tipoVenta       = (int)$cfg['tipoVenta'];
  $fechaDesde      = cc_safe_text($cfg['fechaDesde']);
  $fechaHasta      = cc_safe_text($cfg['fechaHasta']);

  if ($entityId <= 0) {
    return [
      'rows' => [],
      'totales' => [
        'debito' => 0,
        'credito' => 0,
        'saldo' => 0,
      ],
    ];
  }

  $whereFechasMov = "";
  $paramsMov = [
    ':entityId' => $entityId,
    ':tipoOperacion' => $tipoOperacion,
    ':tipoVenta' => $tipoVenta,
  ];

  if ($fechaDesde !== '') {
    $whereFechasMov .= " AND m.fecha >= :fechaDesde ";
    $paramsMov[':fechaDesde'] = $fechaDesde;
  }
  if ($fechaHasta !== '') {
    $whereFechasMov .= " AND m.fecha <= :fechaHasta ";
    $paramsMov[':fechaHasta'] = $fechaHasta;
  }

  $sqlMov = "
    SELECT
      m.id_movimiento,
      m.fecha,
      m.periodo,
      m.monto_total,
      m.id_cuenta_corriente,
      m.id_detalle,
      m.id_medio_pago,
      m.id_comprobante
    FROM movimientos m
    WHERE m.{$idField} = :entityId
      AND m.id_tipo_operacion = :tipoOperacion
      AND m.id_tipo_venta = :tipoVenta
      {$whereFechasMov}
    ORDER BY m.fecha ASC, m.id_movimiento ASC
  ";
  $stMov = $pdo->prepare($sqlMov);
  $stMov->execute($paramsMov);
  $movimientos = $stMov->fetchAll(PDO::FETCH_ASSOC) ?: [];

  if (!$movimientos) {
    return [
      'rows' => [],
      'totales' => [
        'debito' => 0,
        'credito' => 0,
        'saldo' => 0,
      ],
    ];
  }

  $movIds = array_values(array_filter(array_map(static function($r) {
    return (int)($r['id_movimiento'] ?? 0);
  }, $movimientos), static function($n) {
    return $n > 0;
  }));

  // ✅ NUEVO: docs documentales del movimiento (facturas/notas/etc.)
  $movDocsMap = cc_get_movimiento_docs_map($pdo, $movIds);

  // ✅ Cobros del movimiento (recibos)
  $cobrosByMov = cc_get_cobros_by_movimiento($pdo, $movIds);

  $ledger = [];

  foreach ($movimientos as $m) {
    $idMov            = (int)($m['id_movimiento'] ?? 0);
    $fecha            = (string)($m['fecha'] ?? '');
    $periodo          = cc_safe_text($m['periodo'] ?? '');
    $monto            = (float)($m['monto_total'] ?? 0);

    $docMov = $movDocsMap[$idMov] ?? null;

    // fallback viejo: por si todavía hay algo guardado en movimientos.id_comprobante
    $idComprobanteMov = $docMov
      ? (int)($docMov['id_comprobante'] ?? 0)
      : (int)($m['id_comprobante'] ?? 0);

    $movUrl = $docMov
      ? cc_safe_text($docMov['comprobante_url'] ?? '')
      : '';

    $movMime = $docMov
      ? cc_safe_text($docMov['comprobante_mime'] ?? '')
      : '';

    $movTipoRelacion = $docMov
      ? cc_safe_text($docMov['tipo_relacion'] ?? '')
      : '';

    $comprobanteMovimiento = '';
    if ($entityType === 'cliente') {
      if ($movTipoRelacion === 'FACTURA') {
        $comprobanteMovimiento = 'Factura / Movimiento #' . $idMov;
      } elseif ($movTipoRelacion === 'NOTA_CREDITO') {
        $comprobanteMovimiento = 'Nota de crédito / Movimiento #' . $idMov;
      } elseif ($movTipoRelacion === 'NOTA_DEBITO') {
        $comprobanteMovimiento = 'Nota de débito / Movimiento #' . $idMov;
      } else {
        $comprobanteMovimiento = 'Factura / Movimiento #' . $idMov;
      }
    } else {
      if ($movTipoRelacion === 'FACTURA') {
        $comprobanteMovimiento = 'Factura proveedor / Movimiento #' . $idMov;
      } elseif ($movTipoRelacion === 'NOTA_CREDITO') {
        $comprobanteMovimiento = 'Nota de crédito proveedor / Movimiento #' . $idMov;
      } elseif ($movTipoRelacion === 'NOTA_DEBITO') {
        $comprobanteMovimiento = 'Nota de débito proveedor / Movimiento #' . $idMov;
      } else {
        $comprobanteMovimiento = 'Comprobante / Movimiento #' . $idMov;
      }
    }

    if ($periodo !== '') {
      $comprobanteMovimiento .= ' · ' . $periodo;
    }

    // ✅ fila DÉBITO: usa movimientos_comprobantes si existe
    $ledger[] = [
      'tipo_registro'    => 'movimiento',
      'id'               => 'mov_' . $idMov,
      'id_movimiento'    => $idMov,
      'id_cobro'         => null,
      'id_comprobante'   => $idComprobanteMov > 0 ? $idComprobanteMov : null,
      'fecha_raw'        => $fecha,
      'fecha'            => cc_format_date($fecha),
      'comprobante'      => $comprobanteMovimiento,
      'detalle'          => $entityType === 'cliente'
        ? 'Cargo generado al cliente'
        : 'Cargo generado al proveedor',
      'debito'           => $monto,
      'credito'          => 0,
      'comprobante_url'  => $movUrl,
      'comprobante_mime' => $movMime,
      'sort_fecha'       => $fecha ?: '0000-00-00',
      'sort_tipo'        => 1,
      'meta'             => [
        'periodo'          => $periodo,
        'id_detalle'       => $m['id_detalle'] ?? null,
        'id_medio_pago'    => $m['id_medio_pago'] ?? null,
        'id_comprobante'   => $idComprobanteMov > 0 ? $idComprobanteMov : null,
        'tipo_relacion'    => $movTipoRelacion,
        'principal'        => $docMov['principal'] ?? null,
        'archivo_url'      => $docMov['comprobante_url'] ?? null,
        'archivo_path'     => $docMov['archivo_path'] ?? null,
        'archivo_mime'     => $movMime,
        'archivo_size'     => $docMov['archivo_size'] ?? null,
        'tipo_archivo'     => $docMov['archivo_tipo'] ?? null,
        'origen_documento' => $docMov ? 'movimientos_comprobantes' : ((int)($m['id_comprobante'] ?? 0) > 0 ? 'movimientos.id_comprobante' : null),
      ],
    ];

    // ✅ filas CRÉDITO por cobros: usan cobros.id_comprobante
    $cobrosDelMovimiento = $cobrosByMov[$idMov] ?? [];
    foreach ($cobrosDelMovimiento as $c) {
      $fechaCobro      = (string)($c['fecha_cobro'] ?? '');
      $montoCobro      = (float)($c['monto'] ?? 0);
      $idCobro         = (int)($c['id_cobro'] ?? 0);
      $idComprobante   = (int)($c['id_comprobante'] ?? 0);
      $comprobanteUrl  = cc_pick_comprobante_url($c);
      $comprobanteMime = cc_safe_text($c['archivo_mime'] ?? '');

      $ledger[] = [
        'tipo_registro'    => 'cobro',
        'id'               => 'cob_' . $idCobro,
        'id_movimiento'    => $idMov,
        'id_cobro'         => $idCobro,
        'id_comprobante'   => $idComprobante > 0 ? $idComprobante : null,
        'fecha_raw'        => $fechaCobro,
        'fecha'            => cc_format_date($fechaCobro),
        'comprobante'      => 'Recibo X-' . str_pad((string)$idCobro, 3, '0', STR_PAD_LEFT),
        'detalle'          => 'Cancelación / pago del movimiento #' . $idMov,
        'debito'           => 0,
        'credito'          => $montoCobro,
        'comprobante_url'  => $comprobanteUrl,
        'comprobante_mime' => $comprobanteMime,
        'sort_fecha'       => $fechaCobro ?: '0000-00-00',
        'sort_tipo'        => 2,
        'meta'             => [
          'id_comprobante'   => $c['id_comprobante'] ?? null,
          'id_medio_pago'    => $c['id_medio_pago'] ?? null,
          'archivo_url'      => $c['archivo_url'] ?? null,
          'archivo_path'     => $c['archivo_path'] ?? null,
          'archivo_mime'     => $c['archivo_mime'] ?? null,
          'archivo_size'     => $c['archivo_size'] ?? null,
          'tipo_archivo'     => $c['tipo_archivo'] ?? null,
          'origen_documento' => 'cobros.id_comprobante',
        ],
      ];
    }
  }

  usort($ledger, static function(array $a, array $b): int {
    $cmpFecha = strcmp((string)$a['sort_fecha'], (string)$b['sort_fecha']);
    if ($cmpFecha !== 0) return $cmpFecha;

    $cmpTipo = ((int)$a['sort_tipo']) <=> ((int)$b['sort_tipo']);
    if ($cmpTipo !== 0) return $cmpTipo;

    return strcmp((string)$a['id'], (string)$b['id']);
  });

  $saldo = 0.0;
  $debitoTotal = 0.0;
  $creditoTotal = 0.0;
  $rows = [];

  foreach ($ledger as $r) {
    $debito = (float)($r['debito'] ?? 0);
    $credito = (float)($r['credito'] ?? 0);

    $debitoTotal += $debito;
    $creditoTotal += $credito;
    $saldo += $debito - $credito;

    $r['saldo'] = $saldo;
    unset($r['sort_fecha'], $r['sort_tipo']);
    $rows[] = $r;
  }

  return [
    'rows' => $rows,
    'totales' => [
      'debito' => $debitoTotal,
      'credito' => $creditoTotal,
      'saldo' => $saldo,
    ],
  ];
}

/* =========================
   Acción
========================= */
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$action = is_string($action) ? trim($action) : '';

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  // alias viejos
  if ($action === 'cuentas_corrientes_resumen') $action = 'cc_resumen';
  if ($action === 'cuenta_corriente_detalle')  $action = 'cc_detalle';

  /* =========================================================
     RESUMEN HISTÓRICO GENERAL
  ========================================================= */
  if ($action === 'cc_resumen') {
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

    if (count($ccName) === 0) {
      cc_ok([
        'cuentas' => [],
        'rows' => [],
        'totales' => ['columnas' => new stdClass(), 'saldo' => 0],
        'total_clientes' => 0,
      ]);
    }

    $stCli = $pdo->query("
      SELECT id_cliente, nombre
      FROM clientes
      WHERE activo = 1
      ORDER BY nombre ASC
    ");
    $clientes = $stCli->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $sqlMov = "
      SELECT
        m.id_cliente,
        m.id_cuenta_corriente,
        COALESCE(SUM(m.monto_total), 0) AS total
      FROM movimientos m
      WHERE m.id_cliente IS NOT NULL
        AND m.id_cuenta_corriente IS NOT NULL
      GROUP BY m.id_cliente, m.id_cuenta_corriente
    ";
    $stM = $pdo->prepare($sqlMov);
    $stM->execute();
    $movAgg = $stM->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $idx = [];
    foreach ($movAgg as $r) {
      $cid = (int)($r['id_cliente'] ?? 0);
      $ccid = (int)($r['id_cuenta_corriente'] ?? 0);
      $tot = (float)($r['total'] ?? 0);

      if ($cid <= 0 || $ccid <= 0) continue;
      if (!isset($ccName[$ccid])) continue;

      if (!isset($idx[$cid])) $idx[$cid] = [];
      $idx[$cid][$ccid] = $tot;
    }

    $rowsOut = [];
    $totCols = [];
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
        $totCols[$ccid] += $val;

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

    $cuentasOut = [];
    foreach ($ccName as $ccid => $nm) {
      $cuentasOut[] = [
        'id_cuenta_corriente' => (int)$ccid,
        'nombre' => (string)$nm,
        'signo_saldo' => (int)($ccSign[$ccid] ?? 0),
      ];
    }

    cc_ok([
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
     DETALLE SIMPLE VIEJO
  ========================================================= */
  if ($action === 'cc_detalle') {
    $idCliente = (int)cc_param('id_cliente', 0);
    if ($idCliente <= 0) {
      cc_fail('Falta id_cliente válido.', 200, ['id_recibido' => $idCliente]);
    }

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
      ORDER BY m.fecha ASC, m.id_movimiento ASC
    ";
    $st = $pdo->prepare($sql);
    $st->bindValue(':id_cliente', $idCliente, PDO::PARAM_INT);
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
      'detalle' => $detalle,
      'saldo_final' => $saldo,
      'total_movimientos' => count($detalle),
    ]);
  }

  /* =========================================================
     NUEVO: HISTORIAL CLIENTE
  ========================================================= */
  if ($action === 'cc_historial_cliente') {
    $idCliente = (int)cc_param('id_cliente', 0);
    $q = cc_safe_text((string)cc_param('q', ''));
    $fechaDesde = cc_safe_text((string)cc_param('fecha_desde', ''));
    $fechaHasta = cc_safe_text((string)cc_param('fecha_hasta', ''));

    if ($idCliente <= 0 && $q !== '') {
      $idCliente = cc_find_cliente_id($pdo, $q);
    }

    if ($idCliente <= 0) {
      cc_ok([
        'rows' => [],
        'totales' => ['debito' => 0, 'credito' => 0, 'saldo' => 0],
      ]);
    }

    $data = cc_historial_por_entidad($pdo, [
      'entityType'    => 'cliente',
      'idField'       => 'id_cliente',
      'entityId'      => $idCliente,
      'tipoOperacion' => 1,
      'tipoVenta'     => 2,
      'fechaDesde'    => $fechaDesde,
      'fechaHasta'    => $fechaHasta,
    ]);

    cc_ok($data);
  }

  /* =========================================================
     NUEVO: HISTORIAL PROVEEDOR
  ========================================================= */
  if ($action === 'cc_historial_proveedor') {
    $idProveedor = (int)cc_param('proveedor_id', 0);
    $q = cc_safe_text((string)cc_param('q', ''));
    $fechaDesde = cc_safe_text((string)cc_param('fecha_desde', ''));
    $fechaHasta = cc_safe_text((string)cc_param('fecha_hasta', ''));

    if ($idProveedor <= 0 && $q !== '') {
      $idProveedor = cc_find_proveedor_id($pdo, $q);
    }

    if ($idProveedor <= 0) {
      cc_ok([
        'rows' => [],
        'totales' => ['debito' => 0, 'credito' => 0, 'saldo' => 0],
      ]);
    }

    $data = cc_historial_por_entidad($pdo, [
      'entityType'    => 'proveedor',
      'idField'       => 'id_proveedor',
      'entityId'      => $idProveedor,
      'tipoOperacion' => 2,
      'tipoVenta'     => 2,
      'fechaDesde'    => $fechaDesde,
      'fechaHasta'    => $fechaHasta,
    ]);

    cc_ok($data);
  }

  cc_fail('Acción no soportada en cuentas_corrientes.php', 200, ['action' => $action]);

} catch (Throwable $e) {
  cc_fail('Error en cuentas_corrientes: ' . $e->getMessage(), 500);
}