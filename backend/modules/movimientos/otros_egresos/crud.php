<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/shared_db.php';
require_once __DIR__ . '/../global/medios_pago.php';


if (!function_exists('oe_productos_label')) {
  function oe_productos_label(array $itemsDetalle): string
  {
    $cantidad = count($itemsDetalle);
    if ($cantidad <= 0) return 'SIN PRODUCTOS';
    if ($cantidad === 1) return '1 PRODUCTO';
    return $cantidad . ' PRODUCTOS';
  }
}

if (!function_exists('oe_deposito_cheque_label')) {
  function oe_deposito_cheque_label(?string $tipoCheque): string
  {
    $tipo = strtoupper(trim((string)$tipoCheque));
    $tipo = str_replace(['-', '_'], ' ', $tipo);

    if (strpos($tipo, 'ECHEQ') !== false || strpos($tipo, 'E CHEQ') !== false) {
      return 'ECHEQ DEPOSITADO';
    }

    return 'CHEQUE DEPOSITADO';
  }
}


if (!function_exists('oe_deposito_cheque_medio_pago_detalle')) {
  function oe_deposito_cheque_medio_pago_detalle(array $row, float $importe = 0.0): array
  {
    $tipoRaw = strtoupper(trim((string)($row['cheque_tipo'] ?? $row['tipo_cheque'] ?? 'CHEQUE')));
    $tipoRaw = str_replace(['-', '_'], ' ', $tipoRaw);
    $tipoNorm = (strpos($tipoRaw, 'ECHEQ') !== false || strpos($tipoRaw, 'E CHEQ') !== false) ? 'echeq' : 'cheque';
    $tipoNombre = $tipoNorm === 'echeq' ? 'ECHEQ' : 'CHEQUE';

    $importeFinal = $importe > 0
      ? $importe
      : (float)($row['cheque_importe'] ?? $row['importe'] ?? $row['monto_total'] ?? 0);

    $descripcion = trim((string)(
      $row['cheque_descripcion']
      ?? $row['descripcion_cheque']
      ?? $row['observaciones_cheque']
      ?? $row['descripcion']
      ?? $row['observaciones']
      ?? ''
    ));

    $idCheque = !empty($row['cheque_id'])
      ? (int)$row['cheque_id']
      : (!empty($row['id_cheque']) ? (int)$row['id_cheque'] : null);

    $numero = (string)($row['cheque_numero'] ?? $row['numero_cheque'] ?? '');
    $emisor = (string)($row['cheque_emisor'] ?? $row['emisor'] ?? '');
    $fechaEmision = (string)($row['cheque_fecha_emision'] ?? $row['fecha_emision'] ?? '');
    $fechaPago = (string)($row['cheque_fecha_pago'] ?? $row['fecha_pago'] ?? '');

    return [
      'id_movimiento_medio_pago' => 0,
      'id_movimiento'            => isset($row['id_movimiento']) ? (int)$row['id_movimiento'] : null,
      'id_medio_pago'            => isset($row['id_medio_pago']) && $row['id_medio_pago'] !== null ? (int)$row['id_medio_pago'] : null,
      'medio_pago_nombre'        => $tipoNombre,
      'nombre_medio'             => $tipoNombre,
      'medio_pago'               => $tipoNombre,
      'monto'                    => $importeFinal,
      'id_cheque'                => $idCheque,
      'cheque_tipo'              => $tipoNorm,
      'tipo_cheque'              => $tipoNorm,
      'numero_cheque'            => $numero,
      'emisor'                   => $emisor,
      'fecha_emision'            => $fechaEmision,
      'fecha_pago'               => $fechaPago,
      'cheque_importe'           => $importeFinal,
      'cheque_descripcion'       => $descripcion,
      'descripcion'              => $descripcion,
      'observaciones'            => $descripcion,
      'cheque'                   => [
        'id_cheque'          => $idCheque,
        'tipo'               => $tipoNorm,
        'tipo_cheque'        => $tipoNorm,
        'cheque_tipo'        => $tipoNorm,
        'numero_cheque'      => $numero,
        'emisor'             => $emisor,
        'fecha_emision'      => $fechaEmision,
        'fecha_pago'         => $fechaPago,
        'importe'            => $importeFinal,
        'descripcion'        => $descripcion,
        'observaciones'      => $descripcion,
        'cheque_descripcion' => $descripcion,
      ],
    ];
  }
}

if (!function_exists('oe_listar_items_detalle_por_movimientos')) {
  function oe_listar_items_detalle_por_movimientos(PDO $pdo, array $idsMovimientos): array
  {
    $ids = [];
    foreach ($idsMovimientos as $id) {
      $n = (int)$id;
      if ($n > 0) $ids[$n] = $n;
    }
    if (!$ids) return [];

    $ids = array_values($ids);
    $ph = implode(',', array_fill(0, count($ids), '?'));

    $sql = "
      SELECT
        mi.id_item,
        mi.id_movimiento,
        mi.id_detalle,
        mi.id_stock_producto,
        mi.cantidad,
        mi.precio,
        mi.iva_pct,
        mi.subtotal,
        mi.iva_monto,
        mi.total,
        COALESCE(d.nombre, '') AS detalle_nombre
      FROM movimientos_items mi
      LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
      WHERE mi.id_movimiento IN ($ph)
      ORDER BY mi.id_movimiento ASC, mi.id_item ASC
    ";

    $st = $pdo->prepare($sql);
    foreach ($ids as $i => $idMov) {
      $st->bindValue($i + 1, (int)$idMov, PDO::PARAM_INT);
    }
    $st->execute();

    $out = [];
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as $it) {
      $idMov = (int)($it['id_movimiento'] ?? 0);
      if ($idMov <= 0) continue;
      if (!isset($out[$idMov])) $out[$idMov] = [];

      $nombre = (string)($it['detalle_nombre'] ?? '');
      $out[$idMov][] = [
        'id_item'               => isset($it['id_item']) ? (int)$it['id_item'] : null,
        'id_movimiento'         => $idMov,
        'id_detalle'            => $it['id_detalle'] === null ? null : (int)$it['id_detalle'],
        'id_stock_producto'     => $it['id_stock_producto'] === null ? null : (int)$it['id_stock_producto'],
        'producto_nombre'       => $nombre,
        'stock_producto_nombre' => '',
        'detalle_nombre'        => $nombre,
        'cantidad'              => (float)($it['cantidad'] ?? 0),
        'precio'                => (float)($it['precio'] ?? 0),
        'iva_pct'               => (float)($it['iva_pct'] ?? 0),
        'subtotal'              => (float)($it['subtotal'] ?? 0),
        'iva_monto'             => (float)($it['iva_monto'] ?? 0),
        'total'                 => (float)($it['total'] ?? 0),
      ];
    }

    return $out;
  }
}

/* ─────────────────────────────────────────────
   LISTAR
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_listar')) {
  function otros_egresos_listar(PDO $pdo): void
  {
    try {
      $fechaDesde = oe_str($_GET['fecha_desde'] ?? '');
      $fechaHasta = oe_str($_GET['fecha_hasta'] ?? '');
      $q          = oe_str($_GET['q'] ?? '');
      $limit      = max(1, min(500, (int)($_GET['limit'] ?? 101)));
      $offset     = max(0, (int)($_GET['offset'] ?? 0));

      $mpPk        = oe_guess_medios_pago_pk($pdo);
      $mpNombreCol = oe_guess_medios_pago_nombre_col($pdo);
      $clPk        = oe_guess_clasificaciones_pk($pdo);
      $clNombreCol = oe_guess_clasificaciones_nombre_col($pdo);

      $joinMedio   = '';
      $selectMedio = "'' AS medio_pago_nombre_base";

      if ($mpPk && $mpNombreCol) {
        $joinMedio   = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre_base";
      }

      $joinClasif   = '';
      $selectClasif = "'' AS clasificacion_nombre";

      if ($clPk && $clNombreCol) {
        $joinClasif   = " LEFT JOIN clasificaciones cl ON cl.`{$clPk}` = m.id_clasificacion ";
        $selectClasif = "COALESCE(cl.`{$clNombreCol}`, '') AS clasificacion_nombre";
      }

      $createdAtSelect = oe_has_col($pdo, 'movimientos', 'created_at')
        ? "m.created_at"
        : "NULL AS created_at";

      $hasMovIdDetalle    = oe_has_col($pdo, 'movimientos', 'id_detalle');
      $movIdDetalleSelect = $hasMovIdDetalle
        ? "m.id_detalle"
        : "NULL AS id_detalle";

      $joinComprobante = oe_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')
        ? "LEFT JOIN comprobantes_archivos ca ON ca.id_movimiento = m.id_movimiento AND ca.tipo = 'OTROS_EGRESOS'"
        : "LEFT JOIN comprobantes_archivos ca ON 1 = 0";

      // IMPORTANTE:
      // Un egreso normal puede usar un cheque/eCheq como medio de pago y tener
      // movimientos_medios_pago.id_cheque. Eso NO significa que sea un depósito bancario.
      // Solo se considera "cheque depositado en banco" cuando existe un flujo explícito
      // DEPOSITADO_BANCO/DEPOSITO para este movimiento.
      $chequeIdExpr = (
        oe_table_exists($pdo, 'movimientos_cheques_flujo')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_cheque')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_movimiento')
      )
        ? "(
          SELECT f_dep.id_cheque
          FROM movimientos_cheques_flujo f_dep
          WHERE f_dep.id_movimiento = m.id_movimiento
            AND f_dep.id_cheque IS NOT NULL
            AND UPPER(COALESCE(f_dep.evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')
          ORDER BY f_dep.id_flujo DESC
          LIMIT 1
        )"
        : 'NULL';

      $chequeFechaDepositoExpr = (
        oe_table_exists($pdo, 'movimientos_cheques_flujo')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_cheque')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_movimiento')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'fecha_evento')
      )
        ? "(
          SELECT f_fecha.fecha_evento
          FROM movimientos_cheques_flujo f_fecha
          WHERE f_fecha.id_movimiento = m.id_movimiento
            AND f_fecha.id_cheque IS NOT NULL
            AND UPPER(COALESCE(f_fecha.evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')
          ORDER BY f_fecha.id_flujo DESC
          LIMIT 1
        )"
        : 'NULL';

      $fechaOperativaExpr = "COALESCE({$chequeFechaDepositoExpr}, m.fecha)";

      $chequeDescripcionDepExpr = oe_table_exists($pdo, 'movimientos_cheques_flujo')
        ? "COALESCE((
          SELECT f_desc.descripcion
          FROM movimientos_cheques_flujo f_desc
          WHERE f_desc.id_cheque = mc_dep.id_cheque
            AND f_desc.id_movimiento = m.id_movimiento
            AND COALESCE(f_desc.descripcion, '') <> ''
          ORDER BY
            CASE UPPER(COALESCE(f_desc.evento, ''))
              WHEN 'DEPOSITADO_BANCO' THEN 1
              WHEN 'DEPOSITO_BANCO' THEN 2
              WHEN 'DEPOSITADO_EN_BANCO' THEN 3
              WHEN 'DEPOSITO' THEN 4
              WHEN 'EGRESO_CARTERA' THEN 5
              WHEN 'INGRESO_CARTERA' THEN 6
              ELSE 9
            END,
            f_desc.id_flujo DESC
          LIMIT 1
        ), '')"
        : "''";

      $hasMovimientosComprobantes = oe_table_exists($pdo, 'movimientos_comprobantes')
        && oe_has_col($pdo, 'movimientos_comprobantes', 'id_movimiento')
        && oe_has_col($pdo, 'movimientos_comprobantes', 'id_comprobante');

      $compMovIdExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.id_comprobante
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : 'NULL';

      $compMovUrlExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.archivo_url
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : "''";

      $compMovMimeExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.archivo_mime
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : "''";

      $compMovTipoExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.tipo
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : "''";

      $sharedChequeCompIdExpr = "(
        SELECT ca_m2.id_comprobante
        FROM movimientos_cheques_flujo f2
        INNER JOIN movimientos_comprobantes mco2
          ON mco2.id_movimiento = f2.id_movimiento
        INNER JOIN comprobantes_archivos ca_m2
          ON ca_m2.id_comprobante = mco2.id_comprobante
        WHERE f2.id_cheque = mc_dep.id_cheque
          AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m2.tipo,''), ' ', ''), '-', ''), '_', '')) IN ('CHEQUE','ECHEQ','ECHEQUE')
        ORDER BY ca_m2.id_comprobante DESC
        LIMIT 1
      )";

      $sharedComprobanteIdExpr = "COALESCE(ca.id_comprobante, {$compMovIdExpr}, {$sharedChequeCompIdExpr}, " . oe_cheques_shared_comprobante_id_sql('mc_dep') . ") AS id_comprobante";
      $sharedComprobanteUrlExpr = "COALESCE(ca.archivo_url, {$compMovUrlExpr}, " . oe_cheques_shared_comprobante_url_sql('mc_dep') . ") AS comprobante_url";
      $sharedComprobanteMimeExpr = "COALESCE(ca.archivo_mime, {$compMovMimeExpr}, " . oe_cheques_shared_comprobante_mime_sql('mc_dep') . ") AS archivo_mime";
      $sharedComprobanteTipoExpr = "COALESCE(ca.tipo, {$compMovTipoExpr}, CASE WHEN mc_dep.id_cheque IS NOT NULL THEN 'CHEQUE' ELSE '' END) AS comprobante_tipo";

      $sql = "
        SELECT
          m.id_movimiento,
          {$fechaOperativaExpr} AS fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          {$movIdDetalleSelect},
            m.monto_total,
          m.id_medio_pago,
          {$createdAtSelect},
          COALESCE(
            GROUP_CONCAT(DISTINCT d.nombre ORDER BY d.nombre SEPARATOR ' | '),
            d0.nombre,
            ''
          ) AS detalle_items,
          '' AS categoria,
          {$selectMedio},
          {$selectClasif},
          {$sharedComprobanteIdExpr},
          {$sharedComprobanteUrlExpr},
          {$sharedComprobanteMimeExpr},
          {$sharedComprobanteTipoExpr},
          mc_dep.id_cheque     AS cheque_id,
          COALESCE(mc_dep.tipo, '')           AS cheque_tipo,
          COALESCE(mc_dep.emisor, '')         AS cheque_emisor,
          COALESCE(mc_dep.numero_cheque, '')  AS cheque_numero,
          COALESCE(DATE_FORMAT(mc_dep.fecha_emision, '%Y-%m-%d'), '') AS cheque_fecha_emision,
          COALESCE(DATE_FORMAT(mc_dep.fecha_pago, '%Y-%m-%d'), '')    AS cheque_fecha_pago,
          COALESCE(mc_dep.importe, m.monto_total, 0)                  AS cheque_importe,
          {$chequeDescripcionDepExpr} AS cheque_descripcion
        FROM movimientos m
        LEFT JOIN movimientos_items mi ON mi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles d           ON d.id_detalle = mi.id_detalle
      ";

      if ($hasMovIdDetalle) {
        $sql .= " LEFT JOIN detalles d0 ON d0.id_detalle = m.id_detalle ";
      } else {
        $sql .= " LEFT JOIN detalles d0 ON 1 = 0 ";
      }

      $sql .= "
        {$joinMedio}
        {$joinClasif}
        {$joinComprobante}
        LEFT JOIN movimientos_cheques mc_dep
          ON mc_dep.id_cheque = {$chequeIdExpr}
         AND m.id_tipo_operacion = 4
        WHERE m.id_tipo_operacion = 4
      ";

      $params = [];

      if ($fechaDesde !== '') {
        $sql .= " AND {$fechaOperativaExpr} >= :fecha_desde";
        $params[':fecha_desde'] = $fechaDesde;
      }

      if ($fechaHasta !== '') {
        $sql .= " AND {$fechaOperativaExpr} <= :fecha_hasta";
        $params[':fecha_hasta'] = $fechaHasta;
      }

      if ($q !== '') {
        $sql .= " AND (
          COALESCE(d.nombre, '') LIKE :q
          OR COALESCE(d0.nombre, '') LIKE :q
          OR COALESCE(CAST(m.monto_total AS CHAR), '') LIKE :q
          OR COALESCE(mc_dep.emisor, '') LIKE :q
          OR COALESCE(mc_dep.numero_cheque, '') LIKE :q
          OR UPPER(COALESCE(mc_dep.tipo, '')) LIKE UPPER(:q)
        ";
        if ($mpPk && $mpNombreCol) $sql .= " OR COALESCE(mp.`{$mpNombreCol}`, '') LIKE :q ";
        if ($clPk && $clNombreCol) $sql .= " OR COALESCE(cl.`{$clNombreCol}`, '') LIKE :q ";
        if (oe_table_exists($pdo, 'movimientos_medios_pago')) {
          $sql .= "
            OR EXISTS (
              SELECT 1
              FROM movimientos_medios_pago mmp_q
              LEFT JOIN medios_pago mp_q ON mp_q.id_medio_pago = mmp_q.id_medio_pago
              WHERE mmp_q.id_movimiento = m.id_movimiento
                AND (
                  COALESCE(mp_q.nombre, '') LIKE :q
                  OR COALESCE(CAST(mmp_q.monto AS CHAR), '') LIKE :q
                )
            )
          ";
        }
        $sql .= ")";
        $params[':q'] = '%' . $q . '%';
      }

      $sql .= "
        GROUP BY
          m.id_movimiento, m.fecha, m.id_tipo_operacion, m.id_clasificacion, m.id_tipo_venta,
          m.id_cliente, m.id_proveedor, m.monto_total, m.id_medio_pago,
          mc_dep.id_cheque, mc_dep.tipo, mc_dep.emisor, mc_dep.numero_cheque,
          mc_dep.fecha_emision, mc_dep.fecha_pago, mc_dep.importe
      ";

      if ($hasMovIdDetalle) $sql .= ", m.id_detalle";
      if (oe_has_col($pdo, 'movimientos', 'created_at')) $sql .= ", m.created_at";
      if ($mpPk && $mpNombreCol) $sql .= ", mp.`{$mpNombreCol}`";
      if ($clPk && $clNombreCol) $sql .= ", cl.`{$clNombreCol}`";
      $sql .= ", ca.id_comprobante, ca.archivo_url, ca.archivo_mime, ca.tipo, mc_dep.id_comprobante";

      $sql .= " ORDER BY fecha DESC, m.id_movimiento DESC LIMIT :limit OFFSET :offset";

      $st = $pdo->prepare($sql);
      foreach ($params as $k => $v) {
        $st->bindValue($k, $v);
      }
      $st->bindValue(':limit', $limit, PDO::PARAM_INT);
      $st->bindValue(':offset', $offset, PDO::PARAM_INT);
      $st->execute();

      $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
      $idsMovimientos = array_values(array_unique(array_map(static fn($r) => (int)($r['id_movimiento'] ?? 0), $rows)));
      $mediosPorMovimiento = mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovimientos);
      $itemsPorMovimiento  = oe_listar_items_detalle_por_movimientos($pdo, $idsMovimientos);

      $idCostoFijo = oe_guess_costo_fijo_id($pdo);

      $data = [];
      foreach ($rows as $r) {
        $esDepositoCheque =
          (int)($r['id_tipo_operacion'] ?? 0) === 4 &&
          !empty($r['cheque_id']);

        if ($esDepositoCheque) {
          $tipoCheque   = strtoupper(trim((string)($r['cheque_tipo'] ?? 'CHEQUE')));
          if ($tipoCheque === '') $tipoCheque = 'CHEQUE';
          $numeroCheque = trim((string)($r['cheque_numero'] ?? ''));
          $detalle      = 'DEPOSITADO EN BANCO - ' . $tipoCheque . ($numeroCheque !== '' ? ' N° ' . $numeroCheque : '');
        } else {
          $detalle = (string)($r['detalle_items'] ?? '');
        }

        $tercero = $esDepositoCheque ? (string)($r['cheque_emisor'] ?? '') : '';
        $idMov = (int)($r['id_movimiento'] ?? 0);
        $mediosDetalle = $mediosPorMovimiento[$idMov] ?? [];
        $itemsDetalle  = $itemsPorMovimiento[$idMov] ?? [];
        if ($esDepositoCheque) {
          $importeMedioDeposito = (float)($r['cheque_importe'] ?? $r['monto_total'] ?? 0);
          if ($importeMedioDeposito <= 0) $importeMedioDeposito = (float)($r['monto_total'] ?? 0);
          $mediosDetalle = [oe_deposito_cheque_medio_pago_detalle($r, $importeMedioDeposito)];
        }
        $detalleOriginal = $detalle;
        $detalleListado  = $esDepositoCheque
          ? oe_deposito_cheque_label((string)($r['cheque_tipo'] ?? 'CHEQUE'))
          : oe_productos_label($itemsDetalle);

        if ($esDepositoCheque) {
          $tipoCheque = strtoupper(trim((string)($r['cheque_tipo'] ?? 'CHEQUE')));
          if ($tipoCheque === '') $tipoCheque = 'CHEQUE';
          $medioPagoNombre = $tipoCheque;
        } else {
          $medioPagoNombre = mv_medios_pago_resumen(
            $mediosDetalle,
            (string)($r['medio_pago_nombre_base'] ?? '')
          );
        }

        $esCostoFijo = $idCostoFijo > 0 && (int)($r['id_clasificacion'] ?? 0) === $idCostoFijo;
        $montoTotal = oe_round_money((float)($r['monto_total'] ?? 0));
        $pagadoTotal = $esDepositoCheque ? $montoTotal : oe_suma_medios_validados($mediosDetalle);
        $saldoPendiente = oe_round_money(max(0.0, $montoTotal - $pagadoTotal));
        $estadoPago = $esDepositoCheque ? 'pagado' : oe_estado_pago($montoTotal, $pagadoTotal);

        $data[] = [
          'id_movimiento'        => $idMov,
          'fecha'                => (string)($r['fecha'] ?? ''),
          'id_tipo_operacion'    => (int)($r['id_tipo_operacion'] ?? 4),
          'id_clasificacion'     => $esCostoFijo ? (int)($r['id_clasificacion'] ?? 0) : null,
          'id_tipo_venta'        => null,
          'id_cliente'           => null,
          'id_proveedor'         => null,
          'id_detalle'           => $r['id_detalle'] !== null ? (int)$r['id_detalle'] : null,
          'id_stock_producto'    => null,
          'monto_total'          => $montoTotal,
          'pagado_total'         => $pagadoTotal,
          'saldo_pendiente'      => $saldoPendiente,
          'estado_pago'          => $estadoPago,
          'id_medio_pago'        => $r['id_medio_pago'] !== null ? (int)$r['id_medio_pago'] : null,
          'created_at'           => (string)($r['created_at'] ?? ''),
          'detalle'              => $detalleListado,
          'detalle_original'     => $detalleOriginal,
          'cantidad_items'       => count($itemsDetalle),
          'items_detalle'        => $itemsDetalle,
          'categoria'            => (string)($r['categoria'] ?? ''),
          'medio_pago_nombre'    => $medioPagoNombre,
          'cantidad_medios_pago' => count($mediosDetalle),
          'medios_pago_detalle'  => $mediosDetalle,
          'clasificacion_nombre' => $esCostoFijo ? 'COSTO FIJO' : '',
          'es_costo_fijo'        => $esCostoFijo,
          'tercero'              => $tercero,
          'cheque_id'            => !empty($r['cheque_id']) ? (int)$r['cheque_id'] : null,
          'cheque_tipo'          => $esDepositoCheque ? strtoupper(trim((string)($r['cheque_tipo'] ?? ''))) : null,
          'cheque_emisor'        => $esDepositoCheque ? (string)($r['cheque_emisor'] ?? '') : null,
          'cheque_numero'        => $esDepositoCheque ? (string)($r['cheque_numero'] ?? '') : null,
          'cheque_fecha_emision' => $esDepositoCheque ? (string)($r['cheque_fecha_emision'] ?? '') : null,
          'cheque_fecha_pago'    => $esDepositoCheque ? (string)($r['cheque_fecha_pago'] ?? '') : null,
          'cheque_importe'       => $esDepositoCheque ? (float)($r['cheque_importe'] ?? $r['monto_total'] ?? 0) : null,
          'cheque_descripcion'  => $esDepositoCheque ? trim((string)($r['cheque_descripcion'] ?? '')) : '',
          'cheque'               => $esDepositoCheque ? [
            'id_cheque'      => !empty($r['cheque_id']) ? (int)$r['cheque_id'] : null,
            'tipo'           => strtolower(trim((string)($r['cheque_tipo'] ?? ''))),
            'emisor'         => (string)($r['cheque_emisor'] ?? ''),
            'numero_cheque'  => (string)($r['cheque_numero'] ?? ''),
            'fecha_emision'  => (string)($r['cheque_fecha_emision'] ?? ''),
            'fecha_pago'     => (string)($r['cheque_fecha_pago'] ?? ''),
            'importe'        => (float)($r['cheque_importe'] ?? $r['monto_total'] ?? 0),
            'descripcion'    => trim((string)($r['cheque_descripcion'] ?? '')),
            'observaciones'  => trim((string)($r['cheque_descripcion'] ?? '')),
            'cheque_descripcion' => trim((string)($r['cheque_descripcion'] ?? '')),
          ] : null,
          'es_deposito_cheque'   => $esDepositoCheque,
          'id_comprobante'       => $r['id_comprobante'] !== null ? (int)$r['id_comprobante'] : null,
          'comprobante_url'      => (string)($r['comprobante_url'] ?? ''),
          'archivo_mime'         => (string)($r['archivo_mime'] ?? ''),
          'comprobante_tipo'     => (string)($r['comprobante_tipo'] ?? ''),
        ];
      }

      $pageSize = 100;
      $hasMore  = count($data) > $pageSize;
      $pageRows = $hasMore ? array_slice($data, 0, $pageSize) : $data;

      oe_json_response([
        'exito'         => true,
        'otros_egresos' => $pageRows,
        'has_more'      => $hasMore,
        'next_offset'   => $hasMore ? ($offset + $pageSize) : null,
      ]);
    } catch (Throwable $e) {
      oe_json_response(['exito' => false, 'mensaje' => 'Error listando otros egresos: ' . $e->getMessage()], 500);
    }
  }
}

/* ─────────────────────────────────────────────
   OBTENER
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_obtener')) {
  function otros_egresos_obtener(PDO $pdo): void
  {
    try {
      $idMovimiento = (int)($_GET['id_movimiento'] ?? $_GET['id'] ?? 0);
      if ($idMovimiento <= 0) {
        oe_json_response(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      $mpPk        = oe_guess_medios_pago_pk($pdo);
      $mpNombreCol = oe_guess_medios_pago_nombre_col($pdo);
      $clPk        = oe_guess_clasificaciones_pk($pdo);
      $clNombreCol = oe_guess_clasificaciones_nombre_col($pdo);

      $joinMedio   = '';
      $selectMedio = "'' AS medio_pago_nombre";

      if ($mpPk && $mpNombreCol) {
        $joinMedio   = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre";
      }

      $joinClasif   = '';
      $selectClasif = "'' AS clasificacion_nombre";

      if ($clPk && $clNombreCol) {
        $joinClasif   = " LEFT JOIN clasificaciones cl ON cl.`{$clPk}` = m.id_clasificacion ";
        $selectClasif = "COALESCE(cl.`{$clNombreCol}`, '') AS clasificacion_nombre";
      }

      $joinComprobante = oe_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')
        ? "LEFT JOIN comprobantes_archivos ca ON ca.id_movimiento = m.id_movimiento AND ca.tipo = 'OTROS_EGRESOS'"
        : "LEFT JOIN comprobantes_archivos ca ON 1 = 0";

      $hasMovIdDetalle    = oe_has_col($pdo, 'movimientos', 'id_detalle');
      $movIdDetalleSelect = $hasMovIdDetalle
        ? "m.id_detalle"
        : "NULL AS id_detalle";

      // IMPORTANTE:
      // Un egreso normal puede usar un cheque/eCheq como medio de pago y tener
      // movimientos_medios_pago.id_cheque. Eso NO significa que sea un depósito bancario.
      // Solo se considera "cheque depositado en banco" cuando existe un flujo explícito
      // DEPOSITADO_BANCO/DEPOSITO para este movimiento.
      $chequeIdExpr = (
        oe_table_exists($pdo, 'movimientos_cheques_flujo')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_cheque')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_movimiento')
      )
        ? "(
          SELECT f_dep.id_cheque
          FROM movimientos_cheques_flujo f_dep
          WHERE f_dep.id_movimiento = m.id_movimiento
            AND f_dep.id_cheque IS NOT NULL
            AND UPPER(COALESCE(f_dep.evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')
          ORDER BY f_dep.id_flujo DESC
          LIMIT 1
        )"
        : 'NULL';

      $chequeFechaDepositoExpr = (
        oe_table_exists($pdo, 'movimientos_cheques_flujo')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_cheque')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'id_movimiento')
        && oe_has_col($pdo, 'movimientos_cheques_flujo', 'fecha_evento')
      )
        ? "(
          SELECT f_fecha.fecha_evento
          FROM movimientos_cheques_flujo f_fecha
          WHERE f_fecha.id_movimiento = m.id_movimiento
            AND f_fecha.id_cheque IS NOT NULL
            AND UPPER(COALESCE(f_fecha.evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')
          ORDER BY f_fecha.id_flujo DESC
          LIMIT 1
        )"
        : 'NULL';

      $fechaOperativaExpr = "COALESCE({$chequeFechaDepositoExpr}, m.fecha)";

      $chequeDescripcionDepExpr = oe_table_exists($pdo, 'movimientos_cheques_flujo')
        ? "COALESCE((
          SELECT f_desc.descripcion
          FROM movimientos_cheques_flujo f_desc
          WHERE f_desc.id_cheque = mc_dep.id_cheque
            AND f_desc.id_movimiento = m.id_movimiento
            AND COALESCE(f_desc.descripcion, '') <> ''
          ORDER BY
            CASE UPPER(COALESCE(f_desc.evento, ''))
              WHEN 'DEPOSITADO_BANCO' THEN 1
              WHEN 'DEPOSITO_BANCO' THEN 2
              WHEN 'DEPOSITADO_EN_BANCO' THEN 3
              WHEN 'DEPOSITO' THEN 4
              WHEN 'EGRESO_CARTERA' THEN 5
              WHEN 'INGRESO_CARTERA' THEN 6
              ELSE 9
            END,
            f_desc.id_flujo DESC
          LIMIT 1
        ), '')"
        : "''";

      $hasMovimientosComprobantes = oe_table_exists($pdo, 'movimientos_comprobantes')
        && oe_has_col($pdo, 'movimientos_comprobantes', 'id_movimiento')
        && oe_has_col($pdo, 'movimientos_comprobantes', 'id_comprobante');

      $compMovIdExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.id_comprobante
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : 'NULL';

      $compMovUrlExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.archivo_url
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : "''";

      $compMovMimeExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.archivo_mime
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : "''";

      $compMovTipoExpr = $hasMovimientosComprobantes
        ? "(
          SELECT ca_m1.tipo
          FROM movimientos_comprobantes mco1
          INNER JOIN comprobantes_archivos ca_m1
            ON ca_m1.id_comprobante = mco1.id_comprobante
          WHERE mco1.id_movimiento = m.id_movimiento
            AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m1.tipo,''), ' ', ''), '-', ''), '_', '')) = 'OTROSEGRESOS'
          ORDER BY ca_m1.id_comprobante DESC
          LIMIT 1
        )"
        : "''";

      $sharedChequeCompIdExpr = "(
        SELECT ca_m2.id_comprobante
        FROM movimientos_cheques_flujo f2
        INNER JOIN movimientos_comprobantes mco2
          ON mco2.id_movimiento = f2.id_movimiento
        INNER JOIN comprobantes_archivos ca_m2
          ON ca_m2.id_comprobante = mco2.id_comprobante
        WHERE f2.id_cheque = mc_dep.id_cheque
          AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca_m2.tipo,''), ' ', ''), '-', ''), '_', '')) IN ('CHEQUE','ECHEQ','ECHEQUE')
        ORDER BY ca_m2.id_comprobante DESC
        LIMIT 1
      )";

      $sharedComprobanteIdExpr = "COALESCE(ca.id_comprobante, {$compMovIdExpr}, {$sharedChequeCompIdExpr}, " . oe_cheques_shared_comprobante_id_sql('mc_dep') . ") AS id_comprobante";
      $sharedComprobanteUrlExpr = "COALESCE(ca.archivo_url, {$compMovUrlExpr}, " . oe_cheques_shared_comprobante_url_sql('mc_dep') . ") AS comprobante_url";
      $sharedComprobanteMimeExpr = "COALESCE(ca.archivo_mime, {$compMovMimeExpr}, " . oe_cheques_shared_comprobante_mime_sql('mc_dep') . ") AS archivo_mime";
      $sharedComprobanteTipoExpr = "COALESCE(ca.tipo, {$compMovTipoExpr}, CASE WHEN mc_dep.id_cheque IS NOT NULL THEN 'CHEQUE' ELSE '' END) AS comprobante_tipo";

      $sqlMov = "
        SELECT
          m.id_movimiento, {$fechaOperativaExpr} AS fecha, m.id_tipo_operacion, m.id_clasificacion,
          m.id_tipo_venta, m.id_cliente, m.id_proveedor, {$movIdDetalleSelect},
            m.monto_total, m.id_medio_pago,
          {$selectMedio},
          {$selectClasif},
          {$sharedComprobanteIdExpr},
          {$sharedComprobanteUrlExpr},
          {$sharedComprobanteMimeExpr},
          {$sharedComprobanteTipoExpr},
          mc_dep.id_cheque    AS cheque_id,
          COALESCE(mc_dep.tipo, '')           AS cheque_tipo,
          COALESCE(mc_dep.emisor, '')         AS cheque_emisor,
          COALESCE(mc_dep.numero_cheque, '')  AS cheque_numero,
          COALESCE(DATE_FORMAT(mc_dep.fecha_emision, '%Y-%m-%d'), '') AS cheque_fecha_emision,
          COALESCE(DATE_FORMAT(mc_dep.fecha_pago, '%Y-%m-%d'), '')    AS cheque_fecha_pago,
          COALESCE(mc_dep.importe, m.monto_total, 0)                  AS cheque_importe,
          {$chequeDescripcionDepExpr} AS cheque_descripcion
        FROM movimientos m
        {$joinMedio}
        {$joinClasif}
        {$joinComprobante}
        LEFT JOIN movimientos_cheques mc_dep
          ON mc_dep.id_cheque = {$chequeIdExpr}
         AND m.id_tipo_operacion = 4
        WHERE m.id_movimiento = :id AND m.id_tipo_operacion = 4
        LIMIT 1
      ";

      $stMov = $pdo->prepare($sqlMov);
      $stMov->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $stMov->execute();

      $mov = $stMov->fetch(PDO::FETCH_ASSOC);
      if (!$mov) {
        oe_json_response(['exito' => false, 'mensaje' => 'Egreso no encontrado.'], 404);
      }

      $esDepositoCheque =
        (int)($mov['id_tipo_operacion'] ?? 0) === 4 &&
        !empty($mov['cheque_id']);

      $sqlItems = "
        SELECT
          mi.id_detalle,
          mi.id_stock_producto,
          mi.cantidad,
          mi.precio,
          mi.iva_pct,
          mi.subtotal,
          mi.iva_monto,
          mi.total,
          COALESCE(d.nombre, '') AS detalle_nombre
        FROM movimientos_items mi
        LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
        WHERE mi.id_movimiento = :id
        ORDER BY mi.id_item ASC
      ";

      $stItems = $pdo->prepare($sqlItems);
      $stItems->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $stItems->execute();
      $items = $stItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

      if (!$items) {
        $detalleFallback = '';
        if ($hasMovIdDetalle && !empty($mov['id_detalle'])) {
          $stDet = $pdo->prepare("SELECT nombre FROM detalles WHERE id_detalle = :id LIMIT 1");
          $stDet->bindValue(':id', (int)$mov['id_detalle'], PDO::PARAM_INT);
          $stDet->execute();
          $detalleFallback = (string)($stDet->fetchColumn() ?: '');
        }

        $items[] = [
          'id_detalle'        => (int)($mov['id_detalle'] ?? 0),
          'id_stock_producto' => null,
          'cantidad'          => 1,
          'precio'            => (float)($mov['monto_total'] ?? 0),
          'iva_pct'           => 0,
          'subtotal'          => (float)($mov['monto_total'] ?? 0),
          'iva_monto'         => 0,
          'total'             => (float)($mov['monto_total'] ?? 0),
          'detalle_nombre'    => $detalleFallback,
        ];
      }

      if ($esDepositoCheque) {
        $tipoCheque   = strtoupper(trim((string)($mov['cheque_tipo'] ?? 'CHEQUE')));
        if ($tipoCheque === '') $tipoCheque = 'CHEQUE';
        $numeroCheque = trim((string)($mov['cheque_numero'] ?? ''));
        $detalleTexto = 'DEPOSITADO EN BANCO - ' . $tipoCheque . ($numeroCheque !== '' ? ' N° ' . $numeroCheque : '');
      } else {
        $detalleTexto = implode(' | ', array_values(array_filter(
          array_map(static fn($it) => trim((string)($it['detalle_nombre'] ?? '')), $items)
        )));
      }

      if ($esDepositoCheque) {
        $tipoCheque = strtoupper(trim((string)($mov['cheque_tipo'] ?? 'CHEQUE')));
        if ($tipoCheque === '') $tipoCheque = 'CHEQUE';
        $mov['medio_pago_nombre'] = $tipoCheque;
      }

      $mediosDetalle = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
      $mediosDetalle = $mediosDetalle[$idMovimiento] ?? [];
      if ($esDepositoCheque) {
        $importeMedioDeposito = (float)($mov['cheque_importe'] ?? $mov['monto_total'] ?? 0);
        if ($importeMedioDeposito <= 0) $importeMedioDeposito = (float)($mov['monto_total'] ?? 0);
        $mediosDetalle = [oe_deposito_cheque_medio_pago_detalle($mov, $importeMedioDeposito)];
      }

      $idCostoFijo = oe_guess_costo_fijo_id($pdo);
      $esCostoFijo = $idCostoFijo > 0 && (int)($mov['id_clasificacion'] ?? 0) === $idCostoFijo;
      $montoTotal = oe_round_money((float)($mov['monto_total'] ?? 0));
      $pagadoTotal = $esDepositoCheque ? $montoTotal : oe_suma_medios_validados($mediosDetalle);
      $saldoPendiente = oe_round_money(max(0.0, $montoTotal - $pagadoTotal));
      $estadoPago = $esDepositoCheque ? 'pagado' : oe_estado_pago($montoTotal, $pagadoTotal);

      $mov['pagado_total'] = $pagadoTotal;
      $mov['saldo_pendiente'] = $saldoPendiente;
      $mov['estado_pago'] = $estadoPago;
      $mov['detalle_original'] = $detalleTexto;
      $mov['detalle'] = $esDepositoCheque
        ? oe_deposito_cheque_label((string)($mov['cheque_tipo'] ?? 'CHEQUE'))
        : $detalleTexto;
      $mov['items'] = $items;
      $mov['items_detalle'] = $items;
      $mov['cantidad_items'] = count($items);
      $mov['medios_pago_detalle'] = $mediosDetalle;
      $mov['cantidad_medios_pago'] = count($mediosDetalle);
      $mov['es_costo_fijo'] = $esCostoFijo;
      $mov['id_clasificacion_original'] = $mov['id_clasificacion'];

      if (!$esCostoFijo) {
        $mov['id_clasificacion'] = null;
        $mov['clasificacion_nombre'] = '';
      } else {
        $mov['clasificacion_nombre'] = 'COSTO FIJO';
      }

      $mov['es_deposito_cheque'] = $esDepositoCheque;
      $mov['cheque_id'] = !empty($mov['cheque_id']) ? (int)$mov['cheque_id'] : null;
      $mov['cheque_tipo'] = $esDepositoCheque ? strtoupper(trim((string)($mov['cheque_tipo'] ?? ''))) : null;
      $mov['cheque_emisor'] = $esDepositoCheque ? (string)($mov['cheque_emisor'] ?? '') : null;
      $mov['cheque_numero'] = $esDepositoCheque ? (string)($mov['cheque_numero'] ?? '') : null;
      $mov['cheque_fecha_emision'] = $esDepositoCheque ? (string)($mov['cheque_fecha_emision'] ?? '') : null;
      $mov['cheque_fecha_pago'] = $esDepositoCheque ? (string)($mov['cheque_fecha_pago'] ?? '') : null;
      $mov['cheque_importe'] = $esDepositoCheque ? (float)($mov['cheque_importe'] ?? $mov['monto_total'] ?? 0) : null;
      $mov['cheque_descripcion'] = $esDepositoCheque ? trim((string)($mov['cheque_descripcion'] ?? '')) : '';
      $mov['cheque'] = $esDepositoCheque ? [
        'id_cheque'      => !empty($mov['cheque_id']) ? (int)$mov['cheque_id'] : null,
        'tipo'           => strtolower(trim((string)($mov['cheque_tipo'] ?? ''))),
        'emisor'         => (string)($mov['cheque_emisor'] ?? ''),
        'numero_cheque'  => (string)($mov['cheque_numero'] ?? ''),
        'fecha_emision'  => (string)($mov['cheque_fecha_emision'] ?? ''),
        'fecha_pago'     => (string)($mov['cheque_fecha_pago'] ?? ''),
        'importe'        => (float)($mov['cheque_importe'] ?? $mov['monto_total'] ?? 0),
        'descripcion'    => trim((string)($mov['cheque_descripcion'] ?? '')),
        'observaciones'  => trim((string)($mov['cheque_descripcion'] ?? '')),
        'cheque_descripcion' => trim((string)($mov['cheque_descripcion'] ?? '')),
      ] : null;
      $mov['tercero'] = $esDepositoCheque ? (string)($mov['cheque_emisor'] ?? '') : '';
      $mov['cliente'] = $mov['tercero'];
      $mov['proveedor'] = '';

      oe_json_response(['exito' => true, 'egreso' => $mov]);
    } catch (Throwable $e) {
      oe_json_response(['exito' => false, 'mensaje' => 'Error obteniendo otro egreso: ' . $e->getMessage()], 500);
    }
  }
}

/* ─────────────────────────────────────────────
   CREAR
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_crear')) {
  function otros_egresos_crear(PDO $pdo): void
  {
    try {
      $payload    = oe_read_json_input();
      $idUsuario  = oe_get_id_usuario_from_request($pdo, $payload);
      $check      = oe_validate_payload($pdo, $payload);

      if (!$check['ok']) {
        oe_json_response(['exito' => false, 'mensaje' => $check['mensaje'] ?? 'Datos inválidos.'], 422);
      }

      $items           = $check['items'];
      $mediosPagoRaw   = $check['medios_raw'];
      $totalEsperado   = oe_sum_items_total($items);
      $mediosValidados = oe_validar_medios_pago_parcial($pdo, $mediosPagoRaw, $totalEsperado, ['permitir_vacio' => true, 'empty_message' => 'Debés indicar al menos un medio de pago.', 'total_label' => 'egreso']);
      $planPago = mvx_payment_storage_plan($mediosValidados, null);

      // Para pagos parciales al crear/editar, el importe pagado debe quedar
      // siempre persistido en movimientos_medios_pago. El plan global, por
      // compatibilidad legacy, no genera fila cuando hay un solo medio normal;
      // eso hacía que un egreso de $2500 con pago inicial de $23 quedara sin
      // monto pagado para calcular saldo/estado.
      if (!empty($mediosValidados)) {
        $planPago['rows'] = $mediosValidados;
      }

      $pdo->beginTransaction();

      if (!empty($mediosValidados)) {
        mv_medios_pago_lock_cheques_salida($pdo, $mediosValidados);
      }

      $movData      = oe_build_movimiento_data($pdo, $payload);
      $movData['id_medio_pago'] = $planPago['id_medio_pago'];
      $idMovimiento = oe_insert($pdo, 'movimientos', $movData);
      oe_insert_items($pdo, $idMovimiento, $items);

      if (!empty($planPago['rows'])) {
        mv_medios_pago_insertar_multi($pdo, $idMovimiento, $planPago['rows'], ['contexto' => 'egreso', 'salida_cheque' => true, 'registrar_flujo_salida' => false]);
      }
      if (!empty($mediosValidados)) {
        mv_medios_pago_dar_baja_cheques_salida($pdo, $mediosValidados);
        foreach ($mediosValidados as $mpChequeUsado) {
          if (!empty($mpChequeUsado['id_cheque'])) {
            mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mpChequeUsado);
          }
        }
      }

      $pdo->commit();

      $movGuardado    = oe_fetch_movimiento_by_id($pdo, $idMovimiento);
      $itemsGuardados = oe_fetch_items_by_movimiento($pdo, $idMovimiento);

      oe_audit_safe($pdo, $idUsuario, 'crear', 'otros_egresos', $idMovimiento, [
        'creado'              => true,
        'nuevo'               => $movGuardado ?: $movData,
        'items'               => $itemsGuardados ?: $items,
        'medios_pago_detalle' => $mediosValidados,
        'cheques_usados'      => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
        'es_costo_fijo'       => !empty($movData['id_clasificacion']),
      ]);

      oe_json_response([
        'exito'               => true,
        'mensaje'             => 'Otro egreso creado correctamente.',
        'id_movimiento'       => $idMovimiento,
        'id'                  => $idMovimiento,
        'id_clasificacion'    => $movData['id_clasificacion'],
        'es_costo_fijo'       => !empty($movData['id_clasificacion']),
        'medios_pago'         => count($mediosValidados),
        'cheques_usados'      => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
        'medios_pago_detalle' => $mediosValidados,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      oe_json_response(['exito' => false, 'mensaje' => 'Error creando otro egreso: ' . $e->getMessage()], 500);
    }
  }
}

/* ─────────────────────────────────────────────
   ACTUALIZAR
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_actualizar')) {
  function otros_egresos_actualizar(PDO $pdo): void
  {
    try {
      $payload      = oe_read_json_input();
      $idUsuario    = oe_get_id_usuario_from_request($pdo, $payload);
      $idMovimiento = oe_int($payload['id_movimiento'] ?? $payload['id_egreso'] ?? $payload['id'] ?? 0, 0);

      if ($idMovimiento <= 0) {
        oe_json_response(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      $beforeMov = oe_fetch_movimiento_by_id($pdo, $idMovimiento);
      if (!$beforeMov) {
        oe_json_response(['exito' => false, 'mensaje' => 'Egreso no encontrado.'], 404);
      }

      $isEdicionCheque = !empty($payload['es_edicion_cheque']) || !empty($payload['id_cheque']) || !empty($payload['cheque_id']);
      if ($isEdicionCheque || oe_get_deposito_cheque_context($pdo, $idMovimiento)) {
        $resCheque = oe_actualizar_deposito_cheque($pdo, $idMovimiento, $payload, $idUsuario);
        oe_json_response([
          'exito' => true,
          'mensaje' => 'Cheque depositado actualizado correctamente.',
          'id_movimiento' => $idMovimiento,
          'id' => $idMovimiento,
          'id_cheque' => (int)($resCheque['id_cheque'] ?? 0),
          'cheque' => $resCheque['cheque'] ?? null,
          'es_deposito_cheque' => true,
        ]);
      }

      $beforeItems = oe_fetch_items_by_movimiento($pdo, $idMovimiento);
      $beforeMediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
      $beforeMedios = $beforeMediosMap[$idMovimiento] ?? [];

      $check = oe_validate_payload($pdo, $payload);
      if (!$check['ok']) {
        oe_json_response(['exito' => false, 'mensaje' => $check['mensaje'] ?? 'Datos inválidos.'], 422);
      }

      $items         = $check['items'];
      $mediosRaw     = $check['medios_raw'];
      $totalEsperado = oe_sum_items_total($items);

      $oldChequeIds = array_values(array_filter(array_map(
        static fn($x) => (int)($x['id_cheque'] ?? 0),
        $beforeMedios
      )));
      $oldChequeDirecto = oe_detect_deposito_cheque_id_from_movimiento($pdo, $beforeMov);
      if ($oldChequeDirecto !== null) {
        $oldChequeIds[] = $oldChequeDirecto;
        $oldChequeIds = array_values(array_unique(array_filter(array_map('intval', $oldChequeIds))));
      }

      $mediosValidados = oe_validar_medios_pago_parcial($pdo, $mediosRaw, $totalEsperado, ['permitir_vacio' => true, 'empty_message' => 'Debés indicar al menos un medio de pago.', 'total_label' => 'egreso']);
      $planPago = mvx_payment_storage_plan($mediosValidados, null);

      // Para pagos parciales al crear/editar, el importe pagado debe quedar
      // siempre persistido en movimientos_medios_pago. El plan global, por
      // compatibilidad legacy, no genera fila cuando hay un solo medio normal;
      // eso hacía que un egreso de $2500 con pago inicial de $23 quedara sin
      // monto pagado para calcular saldo/estado.
      if (!empty($mediosValidados)) {
        $planPago['rows'] = $mediosValidados;
      }

      $pdo->beginTransaction();

      if ($oldChequeIds) {
        mv_medios_pago_reactivar_cheques_por_ids($pdo, $oldChequeIds);
      }

      if (!empty($mediosValidados)) {
        mv_medios_pago_lock_cheques_salida($pdo, $mediosValidados);
      }

      $movData = oe_build_movimiento_data($pdo, $payload);
      $movData['id_medio_pago'] = $planPago['id_medio_pago'];
      unset($movData['created_at']);

      oe_update($pdo, 'movimientos', $movData, $idMovimiento);
      oe_delete_items_by_movimiento($pdo, $idMovimiento);
      oe_insert_items($pdo, $idMovimiento, $items);
      mv_medios_pago_eliminar_por_movimiento($pdo, $idMovimiento, ['borrar_flujo_salida' => true]);

      if (!empty($planPago['rows'])) {
        mv_medios_pago_insertar_multi($pdo, $idMovimiento, $planPago['rows'], ['contexto' => 'egreso', 'salida_cheque' => true, 'registrar_flujo_salida' => false]);
      }
      if (!empty($mediosValidados)) {
        mv_medios_pago_dar_baja_cheques_salida($pdo, $mediosValidados);
        foreach ($mediosValidados as $mpChequeUsado) {
          if (!empty($mpChequeUsado['id_cheque'])) {
            mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mpChequeUsado);
          }
        }
      }

      $pdo->commit();

      $afterMov   = oe_fetch_movimiento_by_id($pdo, $idMovimiento);
      $afterItems = oe_fetch_items_by_movimiento($pdo, $idMovimiento);

      oe_audit_safe($pdo, $idUsuario, 'actualizar', 'otros_egresos', $idMovimiento, [
        'antes'               => $beforeMov,
        'despues'             => $afterMov,
        'items_antes'         => $beforeItems,
        'items_despues'       => $afterItems ?: $items,
        'medios_pago_antes'   => $beforeMedios,
        'medios_pago_despues' => $mediosValidados,
        'cheques_antes'       => $oldChequeIds,
        'cheques_despues'     => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
      ]);

      oe_json_response([
        'exito'               => true,
        'mensaje'             => 'Otro egreso actualizado correctamente.',
        'id_movimiento'       => $idMovimiento,
        'id'                  => $idMovimiento,
        'id_clasificacion'    => $movData['id_clasificacion'],
        'es_costo_fijo'       => !empty($movData['id_clasificacion']),
        'medios_pago'         => count($mediosValidados),
        'cheques_usados'      => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
        'medios_pago_detalle' => $mediosValidados,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      oe_json_response(['exito' => false, 'mensaje' => 'Error actualizando otro egreso: ' . $e->getMessage()], 500);
    }
  }
}


/* ─────────────────────────────────────────────
   CONFIRMAR PAGO PARCIAL / TOTAL
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_confirmar_pago')) {
  function otros_egresos_confirmar_pago(PDO $pdo): void
  {
    try {
      if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        oe_json_response(['exito' => false, 'mensaje' => 'Método no permitido.'], 405);
      }

      $payload = oe_read_json_input();
      $idUsuario = oe_get_id_usuario_from_request($pdo, $payload);

      $ids = [];
      foreach (['ids_movimiento', 'ids_movimientos', 'movimientos', 'ids'] as $key) {
        if (isset($payload[$key]) && is_array($payload[$key])) {
          foreach ($payload[$key] as $id) {
            $id = (int)$id;
            if ($id > 0) $ids[] = $id;
          }
        }
      }
      $idUnico = (int)($payload['id_movimiento'] ?? $payload['id'] ?? 0);
      if ($idUnico > 0) $ids[] = $idUnico;
      $ids = array_values(array_unique(array_filter($ids)));

      if (!$ids) {
        oe_json_response(['exito' => false, 'mensaje' => 'Debés seleccionar al menos un egreso para pagar.'], 422);
      }

      $mediosPagoRaw = isset($payload['medios_pago']) && is_array($payload['medios_pago']) ? $payload['medios_pago'] : [];
      if (!$mediosPagoRaw) {
        oe_json_response(['exito' => false, 'mensaje' => 'Debés indicar al menos un medio de pago.'], 422);
      }

      $pdo->beginTransaction();

      $pendientes = [];
      $saldoTotal = 0.0;
      $movimientosAntes = [];

      foreach ($ids as $idMovimiento) {
        $stMov = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id_movimiento LIMIT 1 FOR UPDATE");
        $stMov->execute([':id_movimiento' => $idMovimiento]);
        $mov = $stMov->fetch(PDO::FETCH_ASSOC);

        if (!$mov || (int)($mov['id_tipo_operacion'] ?? 0) !== 4) {
          throw new RuntimeException('El egreso seleccionado no existe o no pertenece a Otros Egresos.');
        }

        if (oe_get_deposito_cheque_context($pdo, $idMovimiento)) {
          throw new RuntimeException('Los depósitos de cheque no se pagan desde Otros Egresos.');
        }

        $mediosActuales = mv_medios_pago_movimiento_for_update($pdo, $idMovimiento);
        if (!$mediosActuales) {
          $mediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
          $mediosActuales = $mediosMap[$idMovimiento] ?? [];
        }

        $montoTotal = oe_round_money((float)($mov['monto_total'] ?? 0));
        $pagadoTotal = oe_suma_medios_validados($mediosActuales);
        $saldo = oe_round_money(max(0.0, $montoTotal - $pagadoTotal));

        $movimientosAntes[$idMovimiento] = $mov;

        if ($saldo > 0.00001) {
          $pendientes[] = [
            'id_movimiento' => $idMovimiento,
            'monto_total' => $montoTotal,
            'pagado_total' => $pagadoTotal,
            'saldo' => $saldo,
            'monto' => $saldo,
          ];
          $saldoTotal = oe_round_money($saldoTotal + $saldo);
        }
      }

      if (empty($pendientes) || $saldoTotal <= 0.00001) {
        throw new RuntimeException('Los egresos seleccionados ya están pagados.');
      }

      $mediosValidados = oe_validar_medios_pago_parcial($pdo, $mediosPagoRaw, $saldoTotal, [
        'permitir_vacio' => false,
        'empty_message' => 'Debés indicar al menos un medio de pago.',
        'total_label' => 'egreso',
      ]);
      $montoPago = oe_suma_medios_validados($mediosValidados);

      if ($montoPago <= 0.00001) throw new RuntimeException('El importe pagado debe ser mayor a 0.');
      if ($montoPago > ($saldoTotal + 0.05)) {
        throw new RuntimeException(sprintf('La suma de los medios de pago ($%.2f) no puede superar el saldo pendiente ($%.2f).', $montoPago, $saldoTotal));
      }

      if (!empty($mediosValidados)) {
        mv_medios_pago_lock_cheques_salida($pdo, $mediosValidados);
      }

      $distribucion = oe_distribuir_pago_equitativo($pendientes, $montoPago);
      if (!$distribucion) throw new RuntimeException('No se pudo distribuir el pago entre los egresos seleccionados.');

      $mediosPorMovimiento = oe_distribuir_medios_pago_por_movimiento($distribucion, $mediosValidados);
      $mediosInsertadosPorMovimiento = [];

      foreach ($distribucion as $p) {
        $idMovimiento = (int)($p['id_movimiento'] ?? 0);
        $rowsMedios = $mediosPorMovimiento[$idMovimiento] ?? [];
        if ($idMovimiento <= 0 || !$rowsMedios) continue;

        $insertados = mv_medios_pago_insertar_multi($pdo, $idMovimiento, $rowsMedios, [
          'contexto' => 'otro egreso',
          'salida_cheque' => true,
          'registrar_flujo_salida' => false,
          'fallback_sin_tabla' => true,
          'borrar_duplicado_mismo_movimiento' => false,
        ]);
        $mediosInsertadosPorMovimiento[$idMovimiento] = $insertados ?: $rowsMedios;

        if (oe_has_col($pdo, 'movimientos', 'id_medio_pago')) {
          $firstId = (int)($rowsMedios[0]['id_medio_pago'] ?? 0);
          if ($firstId > 0 && empty($movimientosAntes[$idMovimiento]['id_medio_pago'])) {
            $stUpd = $pdo->prepare("UPDATE movimientos SET id_medio_pago = :id_medio_pago WHERE id_movimiento = :id_movimiento LIMIT 1");
            $stUpd->execute([':id_medio_pago' => $firstId, ':id_movimiento' => $idMovimiento]);
          }
        }
      }

      if (!empty($mediosValidados)) {
        mv_medios_pago_dar_baja_cheques_salida($pdo, $mediosValidados);
        foreach ($mediosValidados as $mpChequeUsado) {
          if (!empty($mpChequeUsado['id_cheque'])) {
            foreach ($distribucion as $p) {
              $idMovimiento = (int)($p['id_movimiento'] ?? 0);
              if ($idMovimiento > 0) mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mpChequeUsado);
            }
          }
        }
      }

      $saldoRestante = oe_round_money(max(0.0, $saldoTotal - $montoPago));

      oe_audit_safe($pdo, $idUsuario, 'confirmar_pago', 'otros_egresos', null, [
        'ids_movimiento' => $ids,
        'saldo_total_previo' => $saldoTotal,
        'monto_pagado' => $montoPago,
        'saldo_total_restante' => $saldoRestante,
        'distribucion' => $distribucion,
        'medios_insertados' => $mediosInsertadosPorMovimiento,
      ]);

      $pdo->commit();

      oe_json_response([
        'exito' => true,
        'mensaje' => $saldoRestante <= 0.00001 ? 'Egreso pagado correctamente.' : 'Pago parcial registrado correctamente.',
        'tipo_pago' => $saldoRestante <= 0.00001 ? 'pago_total' : 'pago_parcial',
        'monto_pagado' => $montoPago,
        'saldo_total_previo' => $saldoTotal,
        'saldo_total_restante' => $saldoRestante,
        'distribucion' => $distribucion,
        'medios_pago_detalle' => $mediosInsertadosPorMovimiento,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      oe_json_response(['exito' => false, 'mensaje' => 'Error confirmando pago de otros egresos: ' . $e->getMessage()], 500);
    }
  }
}

/* ─────────────────────────────────────────────
   ELIMINAR
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_eliminar')) {
  function otros_egresos_eliminar(PDO $pdo): void
  {
    try {
      $payload      = oe_read_json_input();
      $idUsuario    = oe_get_id_usuario_from_request($pdo, $payload);
      $idMovimiento = (int)(
        $_GET['id_movimiento']
        ?? $_POST['id_movimiento']
        ?? $payload['id_movimiento']
        ?? $payload['id']
        ?? 0
      );

      if ($idMovimiento <= 0) {
        oe_json_response(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      $beforeMov = oe_fetch_movimiento_by_id($pdo, $idMovimiento);
      if (!$beforeMov) {
        oe_json_response(['exito' => false, 'mensaje' => 'Egreso no encontrado.'], 404);
      }

      $beforeItems = oe_fetch_items_by_movimiento($pdo, $idMovimiento);
      $oldMediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
      $oldMedios    = $oldMediosMap[$idMovimiento] ?? [];
      $oldChequeIds = array_values(array_filter(array_map(
        static fn($x) => (int)($x['id_cheque'] ?? 0),
        $oldMedios
      )));
      $oldChequeDirecto = oe_detect_deposito_cheque_id_from_movimiento($pdo, $beforeMov);
      if ($oldChequeDirecto !== null) {
        $oldChequeIds[] = $oldChequeDirecto;
        $oldChequeIds = array_values(array_unique(array_filter(array_map('intval', $oldChequeIds))));
      }

      $pdo->beginTransaction();

      $comps = [];
      if (oe_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')) {
        $stComp = $pdo->prepare("
          SELECT id_comprobante, archivo_path, archivo_url, archivo_mime, tipo
          FROM comprobantes_archivos
          WHERE id_movimiento = :id AND tipo = 'OTROS_EGRESOS'
          ORDER BY id_comprobante DESC
        ");
        $stComp->execute([':id' => $idMovimiento]);
        $comps = $stComp->fetchAll(PDO::FETCH_ASSOC) ?: [];
      }

      if ($comps) {
        $stDelComp = $pdo->prepare("DELETE FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        foreach ($comps as $comp) {
          $stDelComp->execute([':id' => (int)$comp['id_comprobante']]);
        }
      }

      if ($oldChequeIds) {
        mv_medios_pago_reactivar_cheques_por_ids($pdo, $oldChequeIds);
      }

      mv_medios_pago_eliminar_por_movimiento($pdo, $idMovimiento, ['borrar_flujo_salida' => true]);

      // Blindaje especial: si este egreso era un depósito bancario de cheque/eCheq,
      // no alcanza con borrar medios/items. El flujo DEPOSITADO_BANCO no tiene FK
      // con cascade en varias instalaciones, por lo que debe eliminarse manualmente
      // para no dejar un depósito huérfano apuntando a un movimiento eliminado.
      if ($oldChequeDirecto !== null && oe_table_exists($pdo, 'movimientos_cheques_flujo')) {
        $stDepFlow = $pdo->prepare("
          DELETE FROM movimientos_cheques_flujo
          WHERE id_movimiento = :id
            AND id_cheque = :id_cheque
            AND UPPER(COALESCE(evento,'')) IN (
              'DEPOSITADO_BANCO', 'DEPOSITO', 'DEPOSITO_BANCO', 'DEPOSITADO_EN_BANCO',
              'EGRESO_CARTERA', 'BAJA'
            )
        ");
        $stDepFlow->execute([
          ':id' => $idMovimiento,
          ':id_cheque' => (int)$oldChequeDirecto,
        ]);
      }

      oe_delete_items_by_movimiento($pdo, $idMovimiento);

      $st = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id AND id_tipo_operacion = 4 LIMIT 1");
      $st->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $st->execute();

      $pdo->commit();

      oe_audit_safe($pdo, $idUsuario, 'eliminar', 'otros_egresos', $idMovimiento, [
        'eliminado'           => true,
        'antes'               => $beforeMov,
        'items'               => $beforeItems,
        'medios_pago'         => $oldMedios,
        'cheques_reactivados' => $oldChequeIds,
        'comprobantes'        => $comps,
      ]);

      if ($comps && function_exists('oec_delete_file_from_disk')) {
        foreach ($comps as $comp) {
          if (!empty($comp['archivo_path'])) {
            oec_delete_file_from_disk((string)$comp['archivo_path']);
          }
        }
      }

      oe_json_response(['exito' => true, 'mensaje' => 'Otro egreso eliminado correctamente.']);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      oe_json_response(['exito' => false, 'mensaje' => 'Error eliminando otro egreso: ' . $e->getMessage()], 500);
    }
  }
}