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

function cc_read_json_body(): array
{
  $raw = file_get_contents('php://input');
  if (!$raw) return [];
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function cc_table_exists(PDO $pdo, string $tableName): bool
{
  static $cache = [];

  $tableName = trim($tableName);
  if ($tableName === '') return false;

  if (array_key_exists($tableName, $cache)) {
    return $cache[$tableName];
  }

  $sql = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table";
  $st = $pdo->prepare($sql);
  $st->execute([':table' => $tableName]);

  $exists = (int)$st->fetchColumn() > 0;
  $cache[$tableName] = $exists;

  return $exists;
}

/* =========================
   Helpers eliminación comprobantes
========================= */
function cc_count_other_cobro_refs(PDO $pdo, int $idComprobante, int $idCobroActual): int
{
  if ($idComprobante <= 0) return 0;

  $sql = "
    SELECT COUNT(*)
    FROM cobros
    WHERE id_comprobante = :id_comprobante
      AND id_cobro <> :id_cobro
  ";
  $st = $pdo->prepare($sql);
  $st->execute([
    ':id_comprobante' => $idComprobante,
    ':id_cobro' => $idCobroActual,
  ]);

  return (int)$st->fetchColumn();
}

function cc_count_movimientos_comprobantes_refs(PDO $pdo, int $idComprobante): int
{
  if ($idComprobante <= 0) return 0;
  if (!cc_table_exists($pdo, 'movimientos_comprobantes')) return 0;

  $sql = "
    SELECT COUNT(*)
    FROM movimientos_comprobantes
    WHERE id_comprobante = :id_comprobante
  ";
  $st = $pdo->prepare($sql);
  $st->execute([
    ':id_comprobante' => $idComprobante,
  ]);

  return (int)$st->fetchColumn();
}

function cc_can_delete_comprobante(PDO $pdo, int $idComprobante, int $idCobroActual): array
{
  if ($idComprobante <= 0) {
    return [
      'puede_eliminar' => false,
      'motivo' => 'id_comprobante inválido',
      'refs' => [
        'cobros' => 0,
        'movimientos_comprobantes' => 0,
        'total' => 0,
      ],
    ];
  }

  $refsCobros = cc_count_other_cobro_refs($pdo, $idComprobante, $idCobroActual);
  $refsMovimientosComprobantes = cc_count_movimientos_comprobantes_refs($pdo, $idComprobante);

  $total = $refsCobros + $refsMovimientosComprobantes;

  return [
    'puede_eliminar' => $total === 0,
    'motivo' => $total === 0 ? 'sin referencias' : 'comprobante aún referenciado',
    'refs' => [
      'cobros' => $refsCobros,
      'movimientos_comprobantes' => $refsMovimientosComprobantes,
      'total' => $total,
    ],
  ];
}

/* =========================
   Helpers búsqueda entidades
========================= */
function cc_find_cliente_id(PDO $pdo, string $q): int
{
  $q = cc_safe_text($q);
  if ($q === '') return 0;

  $sql = "
    SELECT c.id_cliente
    FROM clientes c
    WHERE COALESCE(c.activo, 1) = 1
      AND COALESCE(c.nombre, '') LIKE :q
    ORDER BY
      CASE WHEN COALESCE(c.nombre, '') = :exacto THEN 0 ELSE 1 END,
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
      AND COALESCE(p.nombre, '') LIKE :q
    ORDER BY
      CASE WHEN COALESCE(p.nombre, '') = :exacto THEN 0 ELSE 1 END,
      p.nombre ASC
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

  if (!cc_table_exists($pdo, 'movimientos_comprobantes')) {
    return [];
  }

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
========================= */
function cc_historial_por_entidad(PDO $pdo, array $cfg): array
{
  $entityType    = $cfg['entityType'];
  $idField       = $cfg['idField'];
  $entityId      = (int)$cfg['entityId'];
  $tipoOperacion = (int)$cfg['tipoOperacion'];
  $tipoVenta     = (int)$cfg['tipoVenta'];
  $fechaDesde    = cc_safe_text($cfg['fechaDesde']);
  $fechaHasta    = cc_safe_text($cfg['fechaHasta']);

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
  ];

  $whereTipoVenta = " AND m.id_tipo_venta = :tipoVenta ";
  if ($entityType === 'cliente') {
    // Historial completo del cliente: incluye ventas de contado (1) y cuenta corriente (2).
    $whereTipoVenta = " AND m.id_tipo_venta IN (1, 2) ";
  } else {
    $paramsMov[':tipoVenta'] = $tipoVenta;
  }

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
      m.monto_total,
      m.id_detalle,
      m.id_medio_pago,
      m.id_tipo_venta
    FROM movimientos m
    WHERE m.{$idField} = :entityId
      AND m.id_tipo_operacion = :tipoOperacion
      {$whereTipoVenta}
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

  $movDocsMap = cc_get_movimiento_docs_map($pdo, $movIds);
  $cobrosByMov = cc_get_cobros_by_movimiento($pdo, $movIds);

  $ledger = [];

  foreach ($movimientos as $m) {
    $idMov = (int)($m['id_movimiento'] ?? 0);
    $fecha = (string)($m['fecha'] ?? '');
    $monto = (float)($m['monto_total'] ?? 0);

    $docMov = $movDocsMap[$idMov] ?? null;

    $idComprobanteMov = $docMov ? (int)($docMov['id_comprobante'] ?? 0) : 0;
    $movUrl = $docMov ? cc_safe_text($docMov['comprobante_url'] ?? '') : '';
    $movMime = $docMov ? cc_safe_text($docMov['comprobante_mime'] ?? '') : '';
    $movTipoRelacion = $docMov ? cc_safe_text($docMov['tipo_relacion'] ?? '') : '';

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
    ];

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
      ];
    }

    // Compatibilidad con ventas de contado antiguas: si la venta fue de contado
    // y todavía no tiene fila en cobros, se muestra la cancelación para que el
    // historial quede completo y el saldo no quede inflado artificialmente.
    if ($entityType === 'cliente' && (int)($m['id_tipo_venta'] ?? 0) === 1 && empty($cobrosDelMovimiento)) {
      $ledger[] = [
        'tipo_registro'    => 'cobro',
        'id'               => 'cob_auto_contado_' . $idMov,
        'id_movimiento'    => $idMov,
        'id_cobro'         => null,
        'id_comprobante'   => null,
        'fecha_raw'        => $fecha,
        'fecha'            => cc_format_date($fecha),
        'comprobante'      => 'Recibo automático / Contado #' . $idMov,
        'detalle'          => 'Cancelación automática por venta de contado #' . $idMov,
        'debito'           => 0,
        'credito'          => $monto,
        'comprobante_url'  => '',
        'comprobante_mime' => '',
        'sort_fecha'       => $fecha ?: '0000-00-00',
        'sort_tipo'        => 2,
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
   Listado saldos clientes
========================= */
function cc_saldos_clientes(PDO $pdo): array
{
  $sql = "
    SELECT
      c.id_cliente,
      c.nombre,
      COALESCE(deb.debito_total, 0) AS debito,
      COALESCE(cre.credito_total, 0) AS credito,
      COALESCE(deb.debito_total, 0) - COALESCE(cre.credito_total, 0) AS saldo
    FROM clientes c
    LEFT JOIN (
      SELECT
        m.id_cliente,
        SUM(COALESCE(m.monto_total, 0)) AS debito_total
      FROM movimientos m
      WHERE m.id_cliente IS NOT NULL
        AND m.id_tipo_operacion = 1
        AND m.id_tipo_venta IN (1, 2)
      GROUP BY m.id_cliente
    ) deb ON deb.id_cliente = c.id_cliente
    LEFT JOIN (
      SELECT id_cliente, SUM(credito) AS credito_total
      FROM (
        SELECT
          m.id_cliente,
          SUM(COALESCE(cob.monto, 0)) AS credito
        FROM cobros cob
        INNER JOIN movimientos m ON m.id_movimiento = cob.id_movimiento
        WHERE m.id_cliente IS NOT NULL
          AND m.id_tipo_operacion = 1
          AND m.id_tipo_venta IN (1, 2)
        GROUP BY m.id_cliente

        UNION ALL

        SELECT
          m.id_cliente,
          SUM(COALESCE(m.monto_total, 0)) AS credito
        FROM movimientos m
        WHERE m.id_cliente IS NOT NULL
          AND m.id_tipo_operacion = 1
          AND m.id_tipo_venta = 1
          AND NOT EXISTS (
            SELECT 1
            FROM cobros cob
            WHERE cob.id_movimiento = m.id_movimiento
          )
        GROUP BY m.id_cliente
      ) creditos
      GROUP BY id_cliente
    ) cre ON cre.id_cliente = c.id_cliente
    WHERE COALESCE(c.activo, 1) = 1
    ORDER BY c.nombre ASC
  ";

  $st = $pdo->query($sql);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $out = [];
  $saldoTotal = 0.0;

  foreach ($rows as $r) {
    $saldo = (float)($r['saldo'] ?? 0);
    $saldoTotal += $saldo;

    $out[] = [
      'id_cliente' => (int)($r['id_cliente'] ?? 0),
      'nombre'     => (string)($r['nombre'] ?? ''),
      'saldo'      => $saldo,
    ];
  }

  return [
    'rows' => $out,
    'total_clientes' => count($out),
    'saldo_total' => $saldoTotal,
  ];
}

/* =========================
   Listado saldos proveedores
========================= */
function cc_saldos_proveedores(PDO $pdo): array
{
  $sql = "
    SELECT
      p.id_proveedor,
      p.nombre,
      COALESCE(deb.debito_total, 0) AS debito,
      COALESCE(cre.credito_total, 0) AS credito,
      COALESCE(deb.debito_total, 0) - COALESCE(cre.credito_total, 0) AS saldo
    FROM proveedores p
    LEFT JOIN (
      SELECT
        m.id_proveedor,
        SUM(COALESCE(m.monto_total, 0)) AS debito_total
      FROM movimientos m
      WHERE m.id_proveedor IS NOT NULL
        AND m.id_tipo_operacion = 2
        AND m.id_tipo_venta = 2
      GROUP BY m.id_proveedor
    ) deb ON deb.id_proveedor = p.id_proveedor
    LEFT JOIN (
      SELECT
        m.id_proveedor,
        SUM(COALESCE(cob.monto, 0)) AS credito_total
      FROM cobros cob
      INNER JOIN movimientos m ON m.id_movimiento = cob.id_movimiento
      WHERE m.id_proveedor IS NOT NULL
        AND m.id_tipo_operacion = 2
        AND m.id_tipo_venta = 2
      GROUP BY m.id_proveedor
    ) cre ON cre.id_proveedor = p.id_proveedor
    WHERE COALESCE(p.activo, 1) = 1
    ORDER BY p.nombre ASC
  ";

  $st = $pdo->query($sql);
  $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $out = [];
  $saldoTotal = 0.0;

  foreach ($rows as $r) {
    $saldo = (float)($r['saldo'] ?? 0);
    $saldoTotal += $saldo;

    $out[] = [
      'id_proveedor' => (int)($r['id_proveedor'] ?? 0),
      'nombre'       => (string)($r['nombre'] ?? ''),
      'saldo'        => $saldo,
    ];
  }

  return [
    'rows' => $out,
    'total_proveedores' => count($out),
    'saldo_total' => $saldoTotal,
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

  if ($action === 'cuentas_corrientes_resumen') $action = 'cc_resumen';
  if ($action === 'cuenta_corriente_detalle')  $action = 'cc_detalle';

  if ($action === 'cc_eliminar_cobro') {
    $json = cc_read_json_body();
    $idCobro = (int)($json['id_cobro'] ?? cc_param('id_cobro', 0));

    if ($idCobro <= 0) {
      cc_fail('Falta id_cobro válido.', 200, ['id_cobro' => $idCobro]);
    }

    $stCobro = $pdo->prepare("
      SELECT
        c.id_cobro,
        c.id_movimiento,
        c.id_comprobante,
        c.monto,
        c.fecha_cobro
      FROM cobros c
      WHERE c.id_cobro = :id_cobro
      LIMIT 1
    ");
    $stCobro->execute([':id_cobro' => $idCobro]);
    $cobro = $stCobro->fetch(PDO::FETCH_ASSOC);

    if (!$cobro) {
      cc_fail('El registro de cobro no existe o ya fue eliminado.');
    }

    $idComprobante = (int)($cobro['id_comprobante'] ?? 0);

    $pdo->beginTransaction();

    $stDelCobro = $pdo->prepare("
      DELETE FROM cobros
      WHERE id_cobro = :id_cobro
      LIMIT 1
    ");
    $stDelCobro->execute([':id_cobro' => $idCobro]);

    if ($stDelCobro->rowCount() < 1) {
      throw new RuntimeException('No se pudo eliminar el cobro.');
    }

    $comprobanteEliminado = false;
    $infoRefs = [
      'cobros' => 0,
      'movimientos_comprobantes' => 0,
      'total' => 0,
    ];

    if ($idComprobante > 0) {
      $check = cc_can_delete_comprobante($pdo, $idComprobante, $idCobro);
      $infoRefs = $check['refs'];

      if ($check['puede_eliminar']) {
        $stDelComp = $pdo->prepare("
          DELETE FROM comprobantes_archivos
          WHERE id_comprobante = :id_comprobante
          LIMIT 1
        ");
        $stDelComp->execute([
          ':id_comprobante' => $idComprobante,
        ]);

        $comprobanteEliminado = $stDelComp->rowCount() > 0;
      }
    }

    $pdo->commit();

    cc_ok([
      'mensaje' => $comprobanteEliminado
        ? 'Cobro y comprobante eliminados correctamente.'
        : 'Cobro eliminado correctamente.',
      'id_cobro' => $idCobro,
      'id_movimiento' => (int)($cobro['id_movimiento'] ?? 0),
      'id_comprobante' => $idComprobante > 0 ? $idComprobante : null,
      'comprobante_eliminado' => $comprobanteEliminado,
      'comprobante_refs_restantes' => $infoRefs,
    ]);
  }

  if ($action === 'cc_resumen' || $action === 'cc_saldos_clientes') {
    cc_ok(cc_saldos_clientes($pdo));
  }

  if ($action === 'cc_saldos_proveedores') {
    cc_ok(cc_saldos_proveedores($pdo));
  }

  if ($action === 'cc_detalle') {
    $idCliente = (int)cc_param('id_cliente', 0);
    if ($idCliente <= 0) {
      cc_fail('Falta id_cliente válido.', 200, ['id_recibido' => $idCliente]);
    }

    $data = cc_historial_por_entidad($pdo, [
      'entityType'    => 'cliente',
      'idField'       => 'id_cliente',
      'entityId'      => $idCliente,
      'tipoOperacion' => 1,
      'tipoVenta'     => 2,
      'fechaDesde'    => cc_safe_text((string)cc_param('fecha_desde', '')),
      'fechaHasta'    => cc_safe_text((string)cc_param('fecha_hasta', '')),
    ]);

    cc_ok([
      'id_cliente'        => $idCliente,
      'rows'              => $data['rows'],
      'saldo_final'       => (float)($data['totales']['saldo'] ?? 0),
      'total_movimientos' => count($data['rows'] ?? []),
      'totales'           => $data['totales'] ?? ['debito' => 0, 'credito' => 0, 'saldo' => 0],
    ]);
  }

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

  if ($action === 'cc_historial_proveedor') {
    $idProveedor = (int)cc_param('id_proveedor', cc_param('proveedor_id', 0));
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

  cc_fail('Acción no válida.', 404, ['action' => $action]);
} catch (Throwable $e) {
  if ($pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }

  cc_fail('Error interno: ' . $e->getMessage(), 500);
}