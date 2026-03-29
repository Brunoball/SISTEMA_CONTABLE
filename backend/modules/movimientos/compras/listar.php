<?php
// backend/modules/movimientos/compras/listar.php
declare(strict_types=1);

if (!function_exists('compras_listar')) {
  function compras_listar(PDO $pdo): void {
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

    $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
    $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

    if ($fechaDesde !== '' && !compra_fecha_valida($fechaDesde)) $fechaDesde = '';
    if ($fechaHasta !== '' && !compra_fecha_valida($fechaHasta)) $fechaHasta = '';

    $limitRaw  = $_GET['limit'] ?? null;
    $offsetRaw = $_GET['offset'] ?? null;

    $limit  = compra_n_int($limitRaw);
    $offset = compra_n_int($offsetRaw);

    if ($limit === null) $limit = 101;
    if ($offset === null) $offset = 0;

    if ($limit < 1) $limit = 1;
    if ($limit > 501) $limit = 501;
    if ($offset < 0) $offset = 0;

    $pageSize = ($limit > 1) ? ($limit - 1) : 1;

    $idCompra = compra_get_tipo_operacion_id($pdo);
    if ($idCompra <= 0) {
      compra_fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
    }

    $where = [];
    $params = [];

    $where[] = "m.id_tipo_operacion = :idCompra";
    $params[':idCompra'] = $idCompra;

    $where[] = "m.id_proveedor IS NOT NULL";
    $where[] = "(m.id_cliente IS NULL OR m.id_cliente = 0)";
    $where[] = "(
      (COALESCE(m.id_tipo_venta, 1) = 1 AND (m.id_medio_pago IS NOT NULL AND m.id_medio_pago > 0))
      OR
      (COALESCE(m.id_tipo_venta, 1) = 2)
    )";

    if ($fechaDesde !== '') {
      $where[] = "m.fecha >= :fechaDesde";
      $params[':fechaDesde'] = $fechaDesde;
    }

    if ($fechaHasta !== '') {
      $where[] = "m.fecha <= :fechaHasta";
      $params[':fechaHasta'] = $fechaHasta;
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
        m.id_detalle,
        m.monto_total,
        m.id_medio_pago,

        fi.id_detalle AS item_id_detalle,
        fi.cantidad   AS item_cantidad,
        fi.precio     AS item_precio,
        fi.iva_pct    AS item_iva_pct,
        fi.subtotal   AS item_subtotal,
        fi.iva_monto  AS item_iva_monto,
        fi.total      AS item_total,

        COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,

        COALESCE(tope.nombre,'') AS tipo_operacion_nombre,
        COALESCE(c.nombre,'')    AS clasificacion,
        COALESCE(pr.nombre,'')   AS proveedor,
        COALESCE(di.nombre, d.nombre, '') AS detalle,
        COALESCE(mp.nombre,'') AS medio_pago_nombre,

        comp.id_comprobante AS id_comprobante_principal,
        COALESCE(comp.archivo_url, '') AS comprobante_url,
        COALESCE(comp.archivo_mime, '') AS comprobante_mime,
        COALESCE(comp.tipo, '') AS comprobante_tipo,

        m.created_at
      FROM movimientos m
        LEFT JOIN tipos_operacion tope   ON tope.id_tipo_operacion = m.id_tipo_operacion
        LEFT JOIN clasificaciones c      ON c.id_clasificacion = m.id_clasificacion
        LEFT JOIN proveedores pr         ON pr.id_proveedor = m.id_proveedor
        LEFT JOIN detalles d             ON d.id_detalle = m.id_detalle
        LEFT JOIN medios_pago mp         ON mp.id_medio_pago = m.id_medio_pago

        LEFT JOIN (
          SELECT id_movimiento, SUM(total) AS total_sum
          FROM movimientos_items
          GROUP BY id_movimiento
        ) it ON it.id_movimiento = m.id_movimiento

        LEFT JOIN (
          SELECT mi1.*
          FROM movimientos_items mi1
          INNER JOIN (
            SELECT id_movimiento, MIN(id_item) AS min_id_item
            FROM movimientos_items
            GROUP BY id_movimiento
          ) x ON x.id_movimiento = mi1.id_movimiento AND x.min_id_item = mi1.id_item
        ) fi ON fi.id_movimiento = m.id_movimiento

        LEFT JOIN detalles di ON di.id_detalle = fi.id_detalle

        LEFT JOIN (
          SELECT
            mc_pick.id_movimiento,
            mc_pick.id_comprobante,
            ca.archivo_url,
            ca.archivo_mime,
            ca.tipo
          FROM movimientos_comprobantes mc_pick
          INNER JOIN (
            SELECT
              x.id_movimiento,
              CASE
                WHEN MAX(CASE WHEN x.principal = 1 THEN x.id_movimiento_comprobante ELSE 0 END) > 0
                  THEN MAX(CASE WHEN x.principal = 1 THEN x.id_movimiento_comprobante ELSE 0 END)
                ELSE MAX(x.id_movimiento_comprobante)
              END AS picked_id
            FROM movimientos_comprobantes x
            GROUP BY x.id_movimiento
          ) pick ON pick.id_movimiento = mc_pick.id_movimiento
                AND pick.picked_id = mc_pick.id_movimiento_comprobante
          INNER JOIN comprobantes_archivos ca
            ON ca.id_comprobante = mc_pick.id_comprobante
        ) comp ON comp.id_movimiento = m.id_movimiento
    ";

    if ($q !== '') {
      $like = '%' . $q . '%';
      $where[] = "(
        UPPER(COALESCE(c.nombre,'')) LIKE UPPER(:q1) OR
        UPPER(COALESCE(pr.nombre,'')) LIKE UPPER(:q2) OR
        UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q3) OR
        UPPER(COALESCE(mp.nombre,'')) LIKE UPPER(:q4)
      )";
      $params[':q1'] = $like;
      $params[':q2'] = $like;
      $params[':q3'] = $like;
      $params[':q4'] = $like;
    }

    $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY m.fecha DESC, m.id_movimiento DESC';
    $sql .= ' LIMIT ' . (int)$limit . ' OFFSET ' . (int)$offset;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $hasMore = (count($rows) > $pageSize);
    if ($hasMore) {
      $rows = array_slice($rows, 0, $pageSize);
    }
    $nextOffset = $hasMore ? ($offset + $pageSize) : null;

    $data = [];
    foreach ($rows as $r) {
      $id_detalle_final = $r['item_id_detalle'] !== null
        ? (int)$r['item_id_detalle']
        : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

      $data[] = [
        'id_movimiento' => (int)$r['id_movimiento'],
        'fecha' => (string)$r['fecha'],

        'id_tipo_operacion' => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
        'tipo_operacion' => (string)($r['tipo_operacion_nombre'] ?? ''),

        'id_clasificacion' => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
        'id_tipo_venta' => $r['id_tipo_venta'] === null ? 1 : (int)$r['id_tipo_venta'],
        'id_cliente' => null,

        'id_proveedor' => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],
        'id_detalle' => $id_detalle_final,

        'id_medio_pago' => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
        'medio_pago_nombre' => (string)($r['medio_pago_nombre'] ?? ''),

        'monto_total' => (float)$r['monto_total_final'],

        'cantidad'  => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
        'precio'    => $r['item_precio'] === null ? null : (float)$r['item_precio'],
        'iva_pct'   => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
        'subtotal'  => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
        'iva_monto' => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
        'total'     => $r['item_total'] === null ? null : (float)$r['item_total'],

        'clasificacion' => (string)($r['clasificacion'] ?? ''),
        'proveedor' => (string)($r['proveedor'] ?? ''),
        'detalle' => (string)($r['detalle'] ?? ''),

        'id_comprobante_principal' => $r['id_comprobante_principal'] === null ? null : (int)$r['id_comprobante_principal'],
        'comprobante_url' => (string)($r['comprobante_url'] ?? ''),
        'factura_url' => (string)($r['comprobante_url'] ?? ''),
        'archivo_url' => (string)($r['comprobante_url'] ?? ''),
        'archivo_mime' => (string)($r['comprobante_mime'] ?? ''),
        'comprobante_tipo' => (string)($r['comprobante_tipo'] ?? ''),

        'created_at' => (string)($r['created_at'] ?? ''),
      ];
    }

    compra_ok([
      'compras' => $data,
      'has_more' => $hasMore,
      'next_offset' => $nextOffset,
      'offset' => (int)$offset,
      'limit' => (int)$pageSize,
    ]);
  }
}