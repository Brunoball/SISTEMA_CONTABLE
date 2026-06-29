<?php
// backend/modules/movimientos/compras/listar.php
declare(strict_types=1);

require_once __DIR__ . '/../global/medios_pago.php';

if (!function_exists('compras_listar_resumen_medio_pago')) {
  function compras_listar_resumen_medio_pago(
    array $mediosDetalle,
    ?int $idTipoVenta,
    string $medioLegacy = ''
  ): string {
    $cantidad = count($mediosDetalle);
    $legacy   = trim((string)$medioLegacy);
    $esCC     = ((int)($idTipoVenta ?? 0) === 2);

    if ($cantidad > 0) {
      $principal = trim((string)($mediosDetalle[0]['medio_pago_nombre'] ?? ''));
      if ($principal === '') {
        $principal = ($legacy !== '' && strtoupper($legacy) !== 'CUENTA CORRIENTE')
          ? $legacy
          : 'CONTADO';
      }

      if ($cantidad === 1) return $principal;
      return $principal . ' +' . ($cantidad - 1);
    }

    if ($esCC) return '-';
    return $legacy !== '' ? $legacy : '-';
  }
}

if (!function_exists('compras_listar_label_items')) {
  function compras_listar_label_items(array $itemsDetalle): string
  {
    $cantidad = count($itemsDetalle);
    if ($cantidad <= 0) return 'SIN PRODUCTOS';
    if ($cantidad === 1) return '1 PRODUCTO';
    return $cantidad . ' PRODUCTOS';
  }
}

if (!function_exists('compras_listar_cargar_items_movimientos')) {
  function compras_listar_cargar_items_movimientos(PDO $pdo, array $idsMovimientos): array
  {
    $ids = [];
    foreach ($idsMovimientos as $id) {
      $n = (int)$id;
      if ($n > 0) $ids[$n] = $n;
    }

    if (empty($ids)) return [];

    $ids = array_values($ids);
    $placeholders = implode(',', array_fill(0, count($ids), '?'));

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
        COALESCE(sp.nombre, '') AS stock_producto_nombre,
        COALESCE(d.nombre, '')  AS detalle_nombre,
        COALESCE(sp.nombre, d.nombre, '') AS producto_nombre
      FROM movimientos_items mi
      LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
      LEFT JOIN detalles d         ON d.id_detalle         = mi.id_detalle
      WHERE mi.id_movimiento IN ($placeholders)
      ORDER BY mi.id_movimiento ASC, mi.id_item ASC
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($ids as $i => $idMov) {
      $stmt->bindValue($i + 1, (int)$idMov, PDO::PARAM_INT);
    }
    $stmt->execute();

    $out = [];
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as $row) {
      $idMov = (int)($row['id_movimiento'] ?? 0);
      if ($idMov <= 0) continue;
      if (!isset($out[$idMov])) $out[$idMov] = [];

      $out[$idMov][] = [
        'id_item'               => isset($row['id_item']) ? (int)$row['id_item'] : null,
        'id_movimiento'         => $idMov,
        'id_detalle'            => $row['id_detalle'] === null ? null : (int)$row['id_detalle'],
        'id_stock_producto'     => $row['id_stock_producto'] === null ? null : (int)$row['id_stock_producto'],
        'producto_nombre'       => (string)($row['producto_nombre'] ?? ''),
        'stock_producto_nombre' => (string)($row['stock_producto_nombre'] ?? ''),
        'detalle_nombre'        => (string)($row['detalle_nombre'] ?? ''),
        'cantidad'              => (float)($row['cantidad'] ?? 0),
        'precio'                => (float)($row['precio'] ?? 0),
        'iva_pct'               => (float)($row['iva_pct'] ?? 0),
        'subtotal'              => (float)($row['subtotal'] ?? 0),
        'iva_monto'             => (float)($row['iva_monto'] ?? 0),
        'total'                 => (float)($row['total'] ?? 0),
      ];
    }

    return $out;
  }
}


if (!function_exists('compras_obtener')) {
  function compras_obtener(PDO $pdo): void
  {
    $idMovimiento = 0;
    foreach (['id_movimiento', 'idMovimiento', 'id_compra', 'id'] as $idKey) {
      if (isset($_GET[$idKey]) && is_numeric($_GET[$idKey])) {
        $idMovimiento = max(0, (int)$_GET[$idKey]);
        break;
      }
    }

    if ($idMovimiento <= 0) {
      compra_fail('Falta id_movimiento para obtener la compra.');
    }

    $_GET['id_movimiento'] = (string)$idMovimiento;
    $_GET['limit'] = '1';
    $_GET['offset'] = '0';

    // Reutilizamos el listado para mantener exactamente la misma estructura
    // que consume el frontend, incluyendo items_detalle y medios_pago_detalle.
    compras_listar($pdo);
  }
}

function compras_listar(PDO $pdo): void
{
  $q          = isset($_GET['q'])           ? trim((string)$_GET['q'])           : '';
  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
  $idMovimientoFiltro = 0;
  foreach (['id_movimiento', 'idMovimiento', 'id_compra', 'id'] as $idKey) {
    if (isset($_GET[$idKey]) && is_numeric($_GET[$idKey])) {
      $idMovimientoFiltro = max(0, (int)$_GET[$idKey]);
      break;
    }
  }

  $limit  = isset($_GET['limit'])  ? (int)$_GET['limit']  : 100;
  $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

  if ($limit < 1)   $limit  = 100;
  if ($limit > 500) $limit  = 500;
  if ($offset < 0)  $offset = 0;

  $limitPlus = $limit + 1;

  $idCompra = compra_get_tipo_operacion_id($pdo);
  if ($idCompra <= 0) compra_fail("Tipo_operacion COMPRA inválido.");

  $where  = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :idCompra";
  $params[':idCompra'] = $idCompra;
  $where[] = "m.id_proveedor IS NOT NULL";
  $where[] = "(m.id_cliente IS NULL OR m.id_cliente = 0)";

  // Permite obtener una compra puntual y fresca para modales de detalle.
  // Esto evita que el frontend muestre un registro viejo de cache cuando una
  // compra en cuenta corriente ya fue pagada desde Orden de Pago.
  if ($idMovimientoFiltro > 0) {
    $where[] = "m.id_movimiento = :id_movimiento_filtro";
    $params[':id_movimiento_filtro'] = $idMovimientoFiltro;
    $limit = 1;
    $offset = 0;
    $limitPlus = 2;
  }

  if ($fechaDesde !== '' && compra_fecha_valida($fechaDesde)) {
    $where[] = "m.fecha >= :fecha_desde";
    $params[':fecha_desde'] = $fechaDesde;
  }

  if ($fechaHasta !== '' && compra_fecha_valida($fechaHasta)) {
    $where[] = "m.fecha <= :fecha_hasta";
    $params[':fecha_hasta'] = $fechaHasta;
  }

  if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = "(
      UPPER(COALESCE(c.nombre,''))                    LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))                   LIKE UPPER(:q2) OR
      UPPER(COALESCE(pr.nombre,''))                   LIKE UPPER(:q3) OR
      UPPER(COALESCE(mp.nombre,''))                   LIKE UPPER(:q4) OR
      EXISTS (
        SELECT 1
        FROM movimientos_items miq
        LEFT JOIN stock_productos spq ON spq.id_stock_producto = miq.id_stock_producto
        LEFT JOIN detalles dq         ON dq.id_detalle         = miq.id_detalle
        WHERE miq.id_movimiento = m.id_movimiento
          AND UPPER(COALESCE(spq.nombre, dq.nombre, '')) LIKE UPPER(:q_items)
      ) OR
      EXISTS (
        SELECT 1
        FROM movimientos_medios_pago mmpq
        LEFT JOIN medios_pago mpq ON mpq.id_medio_pago = mmpq.id_medio_pago
        WHERE mmpq.id_movimiento = m.id_movimiento
          AND UPPER(COALESCE(mpq.nombre,'')) LIKE UPPER(:q5)
      )
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q_items'] = $like;
  }

  $sql = "
    SELECT
      m.id_movimiento,
      m.fecha,
      m.id_tipo_operacion,
      m.id_clasificacion,
      m.id_tipo_venta,
      m.id_cliente,
      m.id_proveedor,
      m.monto_total,
      m.id_medio_pago,
      COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
      COALESCE(it.item_count, 0) AS cantidad_items,
      COALESCE(c.nombre,'')    AS clasificacion,
      COALESCE(tv.nombre,'')   AS tipo_venta,
      COALESCE(pr.nombre,'')   AS proveedor,
      COALESCE(mp.nombre,'')   AS medio_pago_nombre,
      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,
      mc.id_comprobante AS id_comprobante,
      COALESCE(ca.archivo_url, '') AS comprobante_url,
      COALESCE(ca.archivo_mime, '') AS archivo_mime,
      COALESCE(ca.tipo, '') AS comprobante_tipo,
      m.created_at
    FROM movimientos m
      LEFT JOIN tipos_operacion tope ON tope.id_tipo_operacion = m.id_tipo_operacion
      LEFT JOIN clasificaciones c    ON c.id_clasificacion     = m.id_clasificacion
      LEFT JOIN tipos_venta tv       ON tv.id_tipo_venta       = m.id_tipo_venta
      LEFT JOIN proveedores pr       ON pr.id_proveedor        = m.id_proveedor
      LEFT JOIN medios_pago mp       ON mp.id_medio_pago       = m.id_medio_pago
      LEFT JOIN (
        SELECT id_movimiento, SUM(total) AS total_sum, COUNT(*) AS item_count
        FROM movimientos_items
        GROUP BY id_movimiento
      ) it ON it.id_movimiento = m.id_movimiento
      LEFT JOIN (
        SELECT mc1.*
        FROM movimientos_comprobantes mc1
        INNER JOIN comprobantes_archivos ca1
          ON ca1.id_comprobante = mc1.id_comprobante
         AND (
              UPPER(COALESCE(ca1.tipo, '')) IN ('COMPRA', 'FACTURA_COMPRA')
              OR mc1.principal = 1
         )
        INNER JOIN (
          SELECT mc2.id_movimiento, MAX(mc2.id_movimiento_comprobante) AS max_id_movimiento_comprobante
          FROM movimientos_comprobantes mc2
          INNER JOIN comprobantes_archivos ca2
            ON ca2.id_comprobante = mc2.id_comprobante
           AND (
                UPPER(COALESCE(ca2.tipo, '')) IN ('COMPRA', 'FACTURA_COMPRA')
                OR mc2.principal = 1
           )
          GROUP BY mc2.id_movimiento
        ) ult_comp ON ult_comp.id_movimiento = mc1.id_movimiento
                  AND ult_comp.max_id_movimiento_comprobante = mc1.id_movimiento_comprobante
      ) mc ON mc.id_movimiento = m.id_movimiento
      LEFT JOIN comprobantes_archivos ca
        ON ca.id_comprobante = mc.id_comprobante
    WHERE " . implode(" AND ", $where) . "
    ORDER BY m.fecha DESC, m.id_movimiento DESC
    LIMIT :lim OFFSET :off
  ";

  $stmt = $pdo->prepare($sql);
  foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
  }
  $stmt->bindValue(':lim', $limitPlus, PDO::PARAM_INT);
  $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
  $stmt->execute();

  $rowsAll = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
  $hasMore = count($rowsAll) > $limit;
  $rows = $hasMore ? array_slice($rowsAll, 0, $limit) : $rowsAll;
  $nextOffset = $hasMore ? ($offset + $limit) : null;

  $idsMovimientos = [];
  foreach ($rows as $r) {
    $idMov = (int)($r['id_movimiento'] ?? 0);
    if ($idMov > 0) $idsMovimientos[] = $idMov;
  }
  $idsMovimientos = array_values(array_unique($idsMovimientos));

  $mediosPorMovimiento = mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovimientos);

  $itemsPorMovimiento = compras_listar_cargar_items_movimientos($pdo, $idsMovimientos);

  $data = [];
  foreach ($rows as $r) {
    $idMov = (int)($r['id_movimiento'] ?? 0);
    $itemsDetalle = $itemsPorMovimiento[$idMov] ?? [];
    $mediosDetalle = $mediosPorMovimiento[$idMov] ?? [];
    $detalleOriginal = implode(' | ', array_values(array_filter(array_map(
      static fn($it) => trim((string)($it['producto_nombre'] ?? $it['stock_producto_nombre'] ?? $it['detalle_nombre'] ?? '')),
      $itemsDetalle
    ))));

    $data[] = [
      'id_movimiento'        => $idMov,
      'fecha'                => (string)($r['fecha'] ?? ''),
      'id_tipo_operacion'    => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
      'tipo_operacion'       => (string)($r['tipo_operacion_nombre'] ?? ''),
      'id_clasificacion'     => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta'        => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'id_cliente'           => null,
      'id_proveedor'         => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
      'pago_tipo_venta'      => (string)($r['tipo_venta'] ?? ''),
      'pago_nombre'          => (string)($r['tipo_venta'] ?? ''),
      'cuenta_corriente'     => (string)($r['tipo_venta'] ?? ''),
      'tipo_venta'           => (string)($r['tipo_venta'] ?? ''),
      'pagado'               => ((int)($r['id_tipo_venta'] ?? 0) === 1) || count($mediosDetalle) > 0,
      'estado'               => ((int)($r['id_tipo_venta'] ?? 0) === 2)
                                  ? (count($mediosDetalle) > 0 ? 'Pagado' : 'Pendiente')
                                  : 'Pagado',
      'proveedor'            => (string)($r['proveedor'] ?? ''),
      'cliente'              => '',
      'detalle'              => compras_listar_label_items($itemsDetalle),
      'detalle_original'     => $detalleOriginal,
      'cantidad_items'       => count($itemsDetalle),
      'items_detalle'        => $itemsDetalle,
      'medio_pago_nombre'    => compras_listar_resumen_medio_pago(
        $mediosDetalle,
        $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        (string)($r['medio_pago_nombre'] ?? '')
      ),
      'cantidad_medios_pago' => count($mediosDetalle),
      'medios_pago_detalle'  => $mediosDetalle,
      'id_medio_pago'        => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
      'monto_total'          => (float)($r['monto_total_final'] ?? $r['monto_total'] ?? 0),
      'id_comprobante'       => isset($r['id_comprobante']) && (int)$r['id_comprobante'] > 0 ? (int)$r['id_comprobante'] : null,
      'comprobante_url'      => (string)($r['comprobante_url'] ?? ''),
      'archivo_mime'         => (string)($r['archivo_mime'] ?? ''),
      'comprobante_tipo'     => (string)($r['comprobante_tipo'] ?? ''),
      'clasificacion'        => (string)($r['clasificacion'] ?? ''),
      'created_at'           => (string)($r['created_at'] ?? ''),
    ];
  }

  compra_ok([
    'compras'     => $data,
    'has_more'   => $hasMore,
    'next_offset'=> $nextOffset,
    'limit'      => $limit,
    'offset'     => $offset,
  ]);
}
