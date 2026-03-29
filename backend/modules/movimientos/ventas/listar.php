<?php
// backend/modules/movimientos/ventas/listar.php
declare(strict_types=1);

function ventas_live_token(PDO $pdo): void {
  $q          = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
  $limit      = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;

  if ($limit < 1) $limit = 100;
  if ($limit > 300) $limit = 300;

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ($idVenta <= 0) fail("Tipo_operacion VENTA inválido.");

  $where  = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :idVenta";
  $params[':idVenta'] = $idVenta;

  $where[] = "m.id_cliente IS NOT NULL";
  $where[] = "(m.id_proveedor IS NULL OR m.id_proveedor = 0)";
  $where[] = "m.id_tipo_venta IS NOT NULL";

  if ($fechaDesde !== '' && is_valid_fecha($fechaDesde)) {
    $where[] = "m.fecha >= :fecha_desde";
    $params[':fecha_desde'] = $fechaDesde;
  }

  if ($fechaHasta !== '' && is_valid_fecha($fechaHasta)) {
    $where[] = "m.fecha <= :fecha_hasta";
    $params[':fecha_hasta'] = $fechaHasta;
  }

  if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = "(
      UPPER(COALESCE(c.nombre,''))            LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))           LIKE UPPER(:q2) OR
      UPPER(COALESCE(cl.nombre,''))           LIKE UPPER(:q3) OR
      UPPER(COALESCE(di.nombre, d.nombre,'')) LIKE UPPER(:q4) OR
      UPPER(COALESCE(mp.nombre,''))           LIKE UPPER(:q5)
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
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
      COALESCE(c.nombre,'')    AS clasificacion,
      COALESCE(tv.nombre,'')   AS tipo_venta,
      COALESCE(cl.nombre,'')   AS cliente,
      COALESCE(pr.nombre,'')   AS proveedor,
      COALESCE(di.nombre, d.nombre, '') AS detalle,
      COALESCE(mp.nombre,'')   AS medio_pago_nombre,
      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,
      m.created_at
    FROM movimientos m
      LEFT JOIN tipos_operacion tope ON tope.id_tipo_operacion = m.id_tipo_operacion
      LEFT JOIN clasificaciones c    ON c.id_clasificacion     = m.id_clasificacion
      LEFT JOIN tipos_venta tv       ON tv.id_tipo_venta       = m.id_tipo_venta
      LEFT JOIN clientes cl          ON cl.id_cliente          = m.id_cliente
      LEFT JOIN proveedores pr       ON pr.id_proveedor        = m.id_proveedor
      LEFT JOIN detalles d           ON d.id_detalle           = m.id_detalle
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
      LEFT JOIN medios_pago mp ON mp.id_medio_pago = m.id_medio_pago
    WHERE " . implode(" AND ", $where) . "
    ORDER BY m.fecha DESC, m.id_movimiento DESC
    LIMIT :lim
  ";

  $stmt = $pdo->prepare($sql);

  foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
  }
  $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
  $stmt->execute();

  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $payload = [
    'fecha_desde' => $fechaDesde,
    'fecha_hasta' => $fechaHasta,
    'q'           => $q,
    'limit'       => $limit,
    'rows'        => $rows,
  ];

  $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if ($json === false) {
    fail('No se pudo generar el token en vivo.');
  }

  ok([
    'live_token' => hash('sha256', $json),
    'count'      => count($rows),
    'limit'      => $limit,
  ]);
}

function ventas_listar(PDO $pdo): void {
  $q          = isset($_GET['q'])          ? trim((string)$_GET['q'])          : '';
  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

  $limit  = isset($_GET['limit'])  ? (int)$_GET['limit']  : 100;
  $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

  if ($limit < 1)    $limit  = 100;
  if ($limit > 500)  $limit  = 500;
  if ($offset < 0)   $offset = 0;

  $limitPlus = $limit + 1;

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ($idVenta <= 0) fail("Tipo_operacion VENTA inválido.");

  $where  = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :idVenta";
  $params[':idVenta'] = $idVenta;

  $where[] = "m.id_cliente IS NOT NULL";
  $where[] = "(m.id_proveedor IS NULL OR m.id_proveedor = 0)";
  $where[] = "m.id_tipo_venta IS NOT NULL";

  if ($fechaDesde !== '' && is_valid_fecha($fechaDesde)) {
    $where[] = "m.fecha >= :fecha_desde";
    $params[':fecha_desde'] = $fechaDesde;
  }

  if ($fechaHasta !== '' && is_valid_fecha($fechaHasta)) {
    $where[] = "m.fecha <= :fecha_hasta";
    $params[':fecha_hasta'] = $fechaHasta;
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

      COALESCE(c.nombre,'')    AS clasificacion,
      COALESCE(tv.nombre,'')   AS tipo_venta,
      COALESCE(cl.nombre,'')   AS cliente,
      COALESCE(pr.nombre,'')   AS proveedor,
      COALESCE(di.nombre, d.nombre, '') AS detalle,
      COALESCE(mp.nombre,'')   AS medio_pago_nombre,
      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,

      mc_fact.id_comprobante AS factura_id_comprobante,
      COALESCE(ca_fact.archivo_url, '')       AS factura_comprobante_url,
      COALESCE(ca_fact.archivo_mime, '')      AS factura_comprobante_mime,
      COALESCE(ca_fact.tipo, '')              AS factura_comprobante_tipo,
      COALESCE(ca_fact.emitido_en_arca, 0)   AS factura_emitida_en_arca,

      COALESCE(cfa_fact.cbte_tipo, 0) AS factura_arca_cbte_tipo,
      COALESCE(cfa_fact.pto_vta, 0)   AS factura_arca_pto_vta,
      COALESCE(cfa_fact.cbte_nro, 0)  AS factura_arca_cbte_nro,
      COALESCE(cfa_fact.cae, '')      AS factura_arca_cae,

      COALESCE(rel_nc.tiene_nc, 0) AS factura_tiene_nota_credito,

      cbult.id_cobro        AS recibo_id_cobro,
      cbult.id_comprobante  AS recibo_id_comprobante,
      COALESCE(cbult.fecha_cobro, '')      AS recibo_fecha_cobro,
      COALESCE(ca_rec.archivo_url, '')     AS recibo_comprobante_url,
      COALESCE(ca_rec.archivo_mime, '')    AS recibo_comprobante_mime,
      COALESCE(ca_rec.tipo, '')            AS recibo_comprobante_tipo,

      CASE
        WHEN mc_fact.id_comprobante IS NOT NULL THEN 'SI'
        ELSE 'NO'
      END AS debug_factura_join,

      m.created_at
    FROM movimientos m
      LEFT JOIN tipos_operacion tope ON tope.id_tipo_operacion = m.id_tipo_operacion
      LEFT JOIN clasificaciones c    ON c.id_clasificacion     = m.id_clasificacion
      LEFT JOIN tipos_venta tv       ON tv.id_tipo_venta       = m.id_tipo_venta
      LEFT JOIN clientes cl          ON cl.id_cliente          = m.id_cliente
      LEFT JOIN proveedores pr       ON pr.id_proveedor        = m.id_proveedor
      LEFT JOIN detalles d           ON d.id_detalle           = m.id_detalle
      LEFT JOIN medios_pago mp       ON mp.id_medio_pago       = m.id_medio_pago

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

      LEFT JOIN movimientos_comprobantes mc_fact
        ON mc_fact.id_movimiento = m.id_movimiento
       AND mc_fact.tipo_relacion = 'FACTURA'
       AND mc_fact.principal     = 1

      LEFT JOIN comprobantes_archivos ca_fact
        ON ca_fact.id_comprobante = mc_fact.id_comprobante

      LEFT JOIN comprobantes_fiscales_arca cfa_fact
        ON cfa_fact.id_comprobante = mc_fact.id_comprobante

      LEFT JOIN (
        SELECT
          id_comprobante_origen,
          MAX(CASE WHEN tipo_relacion = 'NOTA_CREDITO' THEN 1 ELSE 0 END) AS tiene_nc
        FROM comprobantes_fiscales_relaciones
        GROUP BY id_comprobante_origen
      ) rel_nc ON rel_nc.id_comprobante_origen = mc_fact.id_comprobante

      LEFT JOIN (
        SELECT c1.*
        FROM cobros c1
        INNER JOIN (
          SELECT id_movimiento, MAX(id_cobro) AS max_id_cobro
          FROM cobros
          GROUP BY id_movimiento
        ) c2 ON c2.id_movimiento = c1.id_movimiento AND c2.max_id_cobro = c1.id_cobro
      ) cbult ON cbult.id_movimiento = m.id_movimiento

      LEFT JOIN comprobantes_archivos ca_rec
        ON ca_rec.id_comprobante = cbult.id_comprobante
  ";

  if ($q !== '') {
    $like = '%' . $q . '%';
    $where[] = "(
      UPPER(COALESCE(c.nombre,''))              LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))             LIKE UPPER(:q2) OR
      UPPER(COALESCE(cl.nombre,''))             LIKE UPPER(:q3) OR
      UPPER(COALESCE(di.nombre, d.nombre,''))   LIKE UPPER(:q4) OR
      UPPER(COALESCE(mp.nombre,''))             LIKE UPPER(:q5)
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
  }

  $sql .= " WHERE " . implode(" AND ", $where);
  $sql .= " ORDER BY m.fecha DESC, m.id_movimiento DESC";
  $sql .= " LIMIT :lim OFFSET :off";

  $stmt = $pdo->prepare($sql);
  foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
  }
  $stmt->bindValue(':lim',  $limitPlus, PDO::PARAM_INT);
  $stmt->bindValue(':off',  $offset,    PDO::PARAM_INT);
  $stmt->execute();

  $rowsAll = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $hasMore    = count($rowsAll) > $limit;
  $rows       = $hasMore ? array_slice($rowsAll, 0, $limit) : $rowsAll;
  $nextOffset = $hasMore ? ($offset + $limit) : null;

  $data = [];
  foreach ($rows as $r) {
    $id_detalle_final = $r['item_id_detalle'] !== null
      ? (int)$r['item_id_detalle']
      : ($r['id_detalle'] === null ? null : (int)$r['id_detalle']);

    $tipoVentaTxt = trim((string)($r['tipo_venta']       ?? ''));
    $medioPagoTxt = trim((string)($r['medio_pago_nombre'] ?? ''));

    $facturaIdComp     = isset($r['factura_id_comprobante']) ? (int)$r['factura_id_comprobante'] : 0;
    $idComprobanteFinal = $facturaIdComp > 0 ? $facturaIdComp : null;

    $data[] = [
      'id_movimiento'      => (int)$r['id_movimiento'],
      'fecha'              => (string)$r['fecha'],
      'id_tipo_operacion'  => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
      'tipo_operacion'     => (string)($r['tipo_operacion_nombre'] ?? ''),
      'id_clasificacion'   => $r['id_clasificacion']  === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta'      => $r['id_tipo_venta']      === null ? null : (int)$r['id_tipo_venta'],
      'id_cliente'         => $r['id_cliente']         === null ? null : (int)$r['id_cliente'],
      'id_proveedor'       => $r['id_proveedor']       === null ? null : (int)$r['id_proveedor'],
      'id_detalle'         => $id_detalle_final,
      'pago_tipo_venta'    => $tipoVentaTxt,
      'medio_pago_nombre'  => $medioPagoTxt,
      'id_medio_pago'      => $r['id_medio_pago']      === null ? null : (int)$r['id_medio_pago'],
      'monto_total'        => (float)$r['monto_total_final'],
      'cantidad'           => $r['item_cantidad']  === null ? null : (float)$r['item_cantidad'],
      'precio'             => $r['item_precio']    === null ? null : (float)$r['item_precio'],
      'iva_pct'            => $r['item_iva_pct']   === null ? null : (float)$r['item_iva_pct'],
      'subtotal'           => $r['item_subtotal']  === null ? null : (float)$r['item_subtotal'],
      'iva_monto'          => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'              => $r['item_total']     === null ? null : (float)$r['item_total'],
      'id_comprobante'     => $idComprobanteFinal,
      'comprobante_url'    => (string)($r['factura_comprobante_url']  ?? ''),
      'archivo_mime'       => (string)($r['factura_comprobante_mime'] ?? ''),
      'factura_id_comprobante'     => $facturaIdComp > 0 ? $facturaIdComp : null,
      'factura_comprobante_url'    => (string)($r['factura_comprobante_url']  ?? ''),
      'factura_comprobante_mime'   => (string)($r['factura_comprobante_mime'] ?? ''),
      'factura_comprobante_tipo'   => (string)($r['factura_comprobante_tipo'] ?? ''),
      'factura_emitida_en_arca'    => (int)($r['factura_emitida_en_arca']     ?? 0),
      'factura_tiene_nota_credito' => (int)($r['factura_tiene_nota_credito']  ?? 0),
      'factura_arca_cbte_tipo'     => (int)($r['factura_arca_cbte_tipo']      ?? 0),
      'factura_arca_pto_vta'       => (int)($r['factura_arca_pto_vta']        ?? 0),
      'factura_arca_cbte_nro'      => (int)($r['factura_arca_cbte_nro']       ?? 0),
      'factura_arca_cae'           => (string)($r['factura_arca_cae']         ?? ''),
      'recibo_id_cobro'        => isset($r['recibo_id_cobro'])        && (int)$r['recibo_id_cobro']        > 0 ? (int)$r['recibo_id_cobro']        : null,
      'recibo_id_comprobante'  => isset($r['recibo_id_comprobante'])  && (int)$r['recibo_id_comprobante']  > 0 ? (int)$r['recibo_id_comprobante']  : null,
      'recibo_fecha_cobro'     => (string)($r['recibo_fecha_cobro']     ?? ''),
      'recibo_comprobante_url' => (string)($r['recibo_comprobante_url'] ?? ''),
      'recibo_comprobante_mime'=> (string)($r['recibo_comprobante_mime']?? ''),
      'recibo_comprobante_tipo'=> (string)($r['recibo_comprobante_tipo']?? ''),
      'debug_factura_join' => (string)($r['debug_factura_join'] ?? 'NO'),
      'clasificacion' => (string)($r['clasificacion'] ?? ''),
      'tipo_venta'    => $tipoVentaTxt,
      'cliente'       => (string)($r['cliente']   ?? ''),
      'proveedor'     => (string)($r['proveedor']  ?? ''),
      'detalle'       => (string)($r['detalle']    ?? ''),
      'created_at'    => (string)($r['created_at'] ?? ''),
    ];
  }

  ok([
    'ventas'      => $data,
    'has_more'    => $hasMore,
    'next_offset' => $nextOffset,
    'limit'       => $limit,
    'offset'      => $offset,
  ]);
}