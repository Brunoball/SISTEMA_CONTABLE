<?php
// backend/modules/movimientos/ventas/listar.php
declare(strict_types=1);

require_once __DIR__ . '/../global/medios_pago.php';

if (!function_exists('ventas_listar_resumen_medio_pago')) {
  function ventas_listar_resumen_medio_pago(
    array $mediosDetalle,
    ?int $idTipoVenta,
    string $medioLegacy = '',
    ?int $idCobro = null
  ): string {
    $cantidad = count($mediosDetalle);
    $legacy   = trim((string)$medioLegacy);
    $esCC     = ((int)($idTipoVenta ?? 0) === 2);
    $cobrado  = ((int)($idCobro ?? 0) > 0);

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

    if ($esCC) {
      if (!$cobrado) return '-';

      if ($legacy !== '' && strtoupper($legacy) !== 'CUENTA CORRIENTE') {
        return $legacy;
      }

      return '-';
    }

    return $legacy;
  }
}

if (!function_exists('ventas_listar_cargar_items_movimientos')) {
  function ventas_listar_cargar_items_movimientos(PDO $pdo, array $idsMovimientos): array
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

if (!function_exists('ventas_listar_resumen_items')) {
  function ventas_listar_resumen_items(array $itemsDetalle, string $fallback = ''): string
  {
    $cantidad = count($itemsDetalle);

    if ($cantidad <= 0) {
      return 'Sin productos';
    }

    if ($cantidad === 1) {
      return '1 producto';
    }

    return $cantidad . ' productos';
  }
}

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

  // La sección Ventas debe mostrar todo movimiento cuyo tipo de operación sea VENTA.
  // Algunas ventas externas (por ejemplo Tienda Nube) pueden entrar sin medio de pago
  // o sin tipo de venta/cliente en casos puntuales, y antes quedaban ocultas por
  // estos filtros extra. El criterio real de la sección es id_tipo_operacion = venta.

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
      UPPER(COALESCE(c.nombre,''))                    LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))                   LIKE UPPER(:q2) OR
      UPPER(COALESCE(cl.nombre,''))                   LIKE UPPER(:q3) OR
      UPPER(COALESCE(spi.nombre, dfi.nombre, ''))      LIKE UPPER(:q4) OR
      UPPER(COALESCE(mp.nombre,''))                   LIKE UPPER(:q5) OR
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
        FROM movimientos_medios_pago vmpq
        LEFT JOIN medios_pago mpq ON mpq.id_medio_pago = vmpq.id_medio_pago
        WHERE vmpq.id_movimiento = m.id_movimiento
          AND UPPER(COALESCE(mpq.nombre,'')) LIKE UPPER(:q6)
      )
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q6'] = $like;
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
      COALESCE(c.nombre,'')    AS clasificacion,
      COALESCE(tv.nombre,'')   AS tipo_venta,
      COALESCE(cl.nombre,'')   AS cliente,
      COALESCE(pr.nombre,'')   AS proveedor,
      COALESCE(spi.nombre, dfi.nombre, '') AS detalle,
      COALESCE(it.item_count, 0) AS cantidad_items,
      COALESCE(mp.nombre,'')   AS medio_pago_nombre,
      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,
      COALESCE(cbult.id_cobro, 0) AS recibo_id_cobro,
      m.created_at
    FROM movimientos m
      LEFT JOIN tipos_operacion tope ON tope.id_tipo_operacion = m.id_tipo_operacion
      LEFT JOIN clasificaciones c    ON c.id_clasificacion     = m.id_clasificacion
      LEFT JOIN tipos_venta tv       ON tv.id_tipo_venta       = m.id_tipo_venta
      LEFT JOIN clientes cl          ON cl.id_cliente          = m.id_cliente
      LEFT JOIN proveedores pr       ON pr.id_proveedor        = m.id_proveedor
      LEFT JOIN (
        SELECT id_movimiento, COUNT(*) AS item_count
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
      LEFT JOIN stock_productos spi ON spi.id_stock_producto = fi.id_stock_producto
      LEFT JOIN detalles dfi        ON dfi.id_detalle = fi.id_detalle
      LEFT JOIN medios_pago mp      ON mp.id_medio_pago = m.id_medio_pago
      LEFT JOIN (
        SELECT c1.id_movimiento, MAX(c1.id_cobro) AS id_cobro
        FROM cobros c1
        GROUP BY c1.id_movimiento
      ) cbult ON cbult.id_movimiento = m.id_movimiento
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

  $idsMovimientos = [];
  foreach ($rows as $r) {
    $idMov = (int)($r['id_movimiento'] ?? 0);
    if ($idMov > 0) $idsMovimientos[] = $idMov;
  }
  $idsMovimientos = array_values(array_unique($idsMovimientos));

  $mediosResumen = mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovimientos);

  $itemsPorMovimiento = ventas_listar_cargar_items_movimientos($pdo, $idsMovimientos);

  $payloadRows = [];
  foreach ($rows as $r) {
    $idMov = (int)($r['id_movimiento'] ?? 0);
    $detalle = $mediosResumen[$idMov] ?? [];
    $itemsDetalle = $itemsPorMovimiento[$idMov] ?? [];
    $detalleResumen = ventas_listar_resumen_items($itemsDetalle, (string)($r['detalle'] ?? ''));
    $payloadRows[] = [
      'id_movimiento'        => $idMov,
      'fecha'                => (string)($r['fecha'] ?? ''),
      'id_tipo_venta'        => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'cliente'              => (string)($r['cliente'] ?? ''),
      'detalle'              => $detalleResumen,
      'cantidad_items'       => count($itemsDetalle),
      'items_detalle'        => $itemsDetalle,
      'medio_pago_nombre'    => ventas_listar_resumen_medio_pago(
        $detalle,
        $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
        (string)($r['medio_pago_nombre'] ?? ''),
        isset($r['recibo_id_cobro']) ? (int)$r['recibo_id_cobro'] : 0
      ),
      'cantidad_medios_pago' => count($detalle),
      'monto_total'          => (float)($r['monto_total'] ?? 0),
      'recibo_id_cobro'      => isset($r['recibo_id_cobro']) && (int)$r['recibo_id_cobro'] > 0 ? (int)$r['recibo_id_cobro'] : null,
    ];
  }

  $payload = [
    'fecha_desde' => $fechaDesde,
    'fecha_hasta' => $fechaHasta,
    'q'           => $q,
    'limit'       => $limit,
    'rows'        => $payloadRows,
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

if (!function_exists('ventas_obtener')) {
  function ventas_obtener(PDO $pdo): void
  {
    $idMovimiento = 0;
    foreach (['id_movimiento', 'idMovimiento', 'id_venta', 'id'] as $idKey) {
      if (isset($_GET[$idKey]) && is_numeric($_GET[$idKey])) {
        $idMovimiento = max(0, (int)$_GET[$idKey]);
        break;
      }
    }

    if ($idMovimiento <= 0) {
      fail('Falta id_movimiento para obtener la venta.');
    }

    $_GET['id_movimiento'] = (string)$idMovimiento;
    $_GET['limit'] = '1';
    $_GET['offset'] = '0';

    // Reutilizamos el listado para mantener exactamente la misma estructura
    // que consume el frontend, pero forzando una consulta fresca por ID.
    ventas_listar($pdo);
  }
}

function ventas_listar(PDO $pdo): void {
  $q          = isset($_GET['q'])           ? trim((string)$_GET['q'])           : '';
  $fechaDesde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
  $fechaHasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';

  $limit  = isset($_GET['limit'])  ? (int)$_GET['limit']  : 100;
  $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

  $idMovimientoFiltro = 0;
  foreach (['id_movimiento', 'idMovimiento', 'id_venta', 'id'] as $idKey) {
    if (isset($_GET[$idKey]) && is_numeric($_GET[$idKey])) {
      $idMovimientoFiltro = max(0, (int)$_GET[$idKey]);
      break;
    }
  }

  if ($limit < 1)   $limit  = 100;
  if ($limit > 500) $limit  = 500;
  if ($offset < 0)  $offset = 0;

  $limitPlus = $limit + 1;

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ($idVenta <= 0) fail("Tipo_operacion VENTA inválido.");

  $where  = [];
  $params = [];

  $where[] = "m.id_tipo_operacion = :idVenta";
  $params[':idVenta'] = $idVenta;

  // La sección Ventas debe mostrar todo movimiento cuyo tipo de operación sea VENTA.
  // Algunas ventas externas (por ejemplo Tienda Nube) pueden entrar sin medio de pago
  // o sin tipo de venta/cliente en casos puntuales, y antes quedaban ocultas por
  // estos filtros extra. El criterio real de la sección es id_tipo_operacion = venta.

  // Permite obtener una venta puntual y fresca para modales de detalle.
  // Esto evita que el frontend muestre un registro viejo de cache cuando una
  // venta en cuenta corriente ya fue cobrada desde Recibos.
  if ($idMovimientoFiltro > 0) {
    $where[] = "m.id_movimiento = :id_movimiento_filtro";
    $params[':id_movimiento_filtro'] = $idMovimientoFiltro;
    $limit = 1;
    $offset = 0;
    $limitPlus = 2;
  }

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
      m.monto_total,
      m.id_medio_pago,

      fi.id_item AS item_id_item,
      fi.id_detalle AS item_id_detalle,
      fi.id_stock_producto AS item_id_stock_producto,
      fi.cantidad   AS item_cantidad,
      fi.precio     AS item_precio,
      fi.iva_pct    AS item_iva_pct,
      fi.subtotal   AS item_subtotal,
      fi.iva_monto  AS item_iva_monto,
      fi.total      AS item_total,

      COALESCE(it.total_sum, m.monto_total, 0) AS monto_total_final,
      COALESCE(it.item_count, 0) AS cantidad_items,

      COALESCE(c.nombre,'')    AS clasificacion,
      COALESCE(tv.nombre,'')   AS tipo_venta,
      COALESCE(cl.nombre,'')   AS cliente,
      COALESCE(pr.nombre,'')   AS proveedor,
      COALESCE(spi.nombre, dfi.nombre, '') AS detalle,
      COALESCE(mp.nombre,'')   AS medio_pago_nombre,
      COALESCE(tope.nombre,'') AS tipo_operacion_nombre,

      mc_fact.id_comprobante AS factura_id_comprobante,
      COALESCE(ca_fact.archivo_url, '')      AS factura_comprobante_url,
      COALESCE(ca_fact.archivo_mime, '')     AS factura_comprobante_mime,
      COALESCE(ca_fact.tipo, '')             AS factura_comprobante_tipo,
      COALESCE(ca_fact.emitido_en_arca, 0)   AS factura_emitida_en_arca,

      COALESCE(cfa_fact.cbte_tipo, 0) AS factura_arca_cbte_tipo,
      COALESCE(cfa_fact.pto_vta, 0)   AS factura_arca_pto_vta,
      COALESCE(cfa_fact.cbte_nro, 0)  AS factura_arca_cbte_nro,
      COALESCE(cfa_fact.cae, '')      AS factura_arca_cae,

      COALESCE(rel_nc.tiene_nc, 0) AS factura_tiene_nota_credito,

      mc_rem.id_comprobante AS remito_id_comprobante,
      COALESCE(ca_rem.archivo_url, '')  AS remito_comprobante_url,
      COALESCE(ca_rem.archivo_mime, '') AS remito_comprobante_mime,
      COALESCE(ca_rem.tipo, '')         AS remito_comprobante_tipo,

      cbult.id_cobro       AS recibo_id_cobro,
      cbult.id_comprobante AS recibo_id_comprobante,
      COALESCE(cbult.fecha_cobro, '')   AS recibo_fecha_cobro,
      COALESCE(ca_rec.archivo_url, '')  AS recibo_comprobante_url,
      COALESCE(ca_rec.archivo_mime, '') AS recibo_comprobante_mime,
      COALESCE(ca_rec.tipo, '')         AS recibo_comprobante_tipo,

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
      LEFT JOIN medios_pago mp       ON mp.id_medio_pago       = m.id_medio_pago

      LEFT JOIN (
        SELECT id_movimiento, SUM(total) AS total_sum, COUNT(*) AS item_count
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

      LEFT JOIN stock_productos spi ON spi.id_stock_producto = fi.id_stock_producto
      LEFT JOIN detalles dfi        ON dfi.id_detalle = fi.id_detalle

      LEFT JOIN (
        SELECT mc1.*
        FROM movimientos_comprobantes mc1
        INNER JOIN comprobantes_archivos ca1
          ON ca1.id_comprobante = mc1.id_comprobante
         AND (
              mc1.tipo_relacion = 'FACTURA'
              OR UPPER(COALESCE(ca1.tipo, '')) IN ('FACTURA', 'VENTA_NO_FACTURADA')
         )
        INNER JOIN (
          SELECT mc2.id_movimiento, MAX(mc2.id_movimiento_comprobante) AS max_id_movimiento_comprobante
          FROM movimientos_comprobantes mc2
          INNER JOIN comprobantes_archivos ca2
            ON ca2.id_comprobante = mc2.id_comprobante
           AND (
                mc2.tipo_relacion = 'FACTURA'
                OR UPPER(COALESCE(ca2.tipo, '')) IN ('FACTURA', 'VENTA_NO_FACTURADA')
           )
          GROUP BY mc2.id_movimiento
        ) ult_fact ON ult_fact.id_movimiento = mc1.id_movimiento
                  AND ult_fact.max_id_movimiento_comprobante = mc1.id_movimiento_comprobante
      ) mc_fact ON mc_fact.id_movimiento = m.id_movimiento

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
        SELECT mc1.*
        FROM movimientos_comprobantes mc1
        INNER JOIN comprobantes_archivos ca1
          ON ca1.id_comprobante = mc1.id_comprobante
         AND UPPER(ca1.tipo) = 'REMITO'
        INNER JOIN (
          SELECT mc2.id_movimiento, MAX(mc2.id_movimiento_comprobante) AS max_id_movimiento_comprobante
          FROM movimientos_comprobantes mc2
          INNER JOIN comprobantes_archivos ca2
            ON ca2.id_comprobante = mc2.id_comprobante
           AND UPPER(ca2.tipo) = 'REMITO'
          GROUP BY mc2.id_movimiento
        ) ult_rem ON ult_rem.id_movimiento = mc1.id_movimiento
                 AND ult_rem.max_id_movimiento_comprobante = mc1.id_movimiento_comprobante
      ) mc_rem ON mc_rem.id_movimiento = m.id_movimiento

      LEFT JOIN comprobantes_archivos ca_rem
        ON ca_rem.id_comprobante = mc_rem.id_comprobante

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
      UPPER(COALESCE(c.nombre,''))                    LIKE UPPER(:q1) OR
      UPPER(COALESCE(tv.nombre,''))                   LIKE UPPER(:q2) OR
      UPPER(COALESCE(cl.nombre,''))                   LIKE UPPER(:q3) OR
      UPPER(COALESCE(spi.nombre, dfi.nombre, ''))      LIKE UPPER(:q4) OR
      UPPER(COALESCE(mp.nombre,''))                   LIKE UPPER(:q5) OR
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
        FROM movimientos_medios_pago vmpq
        LEFT JOIN medios_pago mpq ON mpq.id_medio_pago = vmpq.id_medio_pago
        WHERE vmpq.id_movimiento = m.id_movimiento
          AND UPPER(COALESCE(mpq.nombre,'')) LIKE UPPER(:q6)
      )
    )";
    $params[':q1'] = $like;
    $params[':q2'] = $like;
    $params[':q3'] = $like;
    $params[':q4'] = $like;
    $params[':q5'] = $like;
    $params[':q6'] = $like;
    $params[':q_items'] = $like;
  }

  $sql .= " WHERE " . implode(" AND ", $where);
  $sql .= " ORDER BY m.fecha DESC, m.id_movimiento DESC";
  $sql .= " LIMIT :lim OFFSET :off";

  $stmt = $pdo->prepare($sql);
  foreach ($params as $k => $v) {
    $stmt->bindValue($k, $v);
  }
  $stmt->bindValue(':lim', $limitPlus, PDO::PARAM_INT);
  $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
  $stmt->execute();

  $rowsAll = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

  $hasMore    = count($rowsAll) > $limit;
  $rows       = $hasMore ? array_slice($rowsAll, 0, $limit) : $rowsAll;
  $nextOffset = $hasMore ? ($offset + $limit) : null;

  $idsMovimientos = [];
  foreach ($rows as $r) {
    $idMov = (int)($r['id_movimiento'] ?? 0);
    if ($idMov > 0) $idsMovimientos[] = $idMov;
  }
  $idsMovimientos = array_values(array_unique($idsMovimientos));

  $mediosPorMovimiento = mv_medios_pago_listar_detalle_por_movimientos($pdo, $idsMovimientos);

  $itemsPorMovimiento = ventas_listar_cargar_items_movimientos($pdo, $idsMovimientos);

  $data = [];
  foreach ($rows as $r) {
    $id_stock_producto_final = $r['item_id_stock_producto'] !== null
      ? (int)$r['item_id_stock_producto']
      : null;

    $tipoVentaTxt   = trim((string)($r['tipo_venta'] ?? ''));
    $idMovActual    = (int)$r['id_movimiento'];
    $mediosDetalle  = $mediosPorMovimiento[$idMovActual] ?? [];
    $cantidadMedios = count($mediosDetalle);
    $itemsDetalle   = $itemsPorMovimiento[$idMovActual] ?? [];
    $detalleResumen = ventas_listar_resumen_items($itemsDetalle, (string)($r['detalle'] ?? ''));

    $medioPagoTxt = ventas_listar_resumen_medio_pago(
      $mediosDetalle,
      $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      trim((string)($r['medio_pago_nombre'] ?? '')),
      isset($r['recibo_id_cobro']) ? (int)$r['recibo_id_cobro'] : 0
    );

    $facturaIdComp      = isset($r['factura_id_comprobante']) ? (int)$r['factura_id_comprobante'] : 0;
    $idComprobanteFinal = $facturaIdComp > 0 ? $facturaIdComp : null;

    $data[] = [
      'id_movimiento'       => (int)$r['id_movimiento'],
      'fecha'               => (string)$r['fecha'],
      'id_tipo_operacion'   => $r['id_tipo_operacion'] === null ? null : (int)$r['id_tipo_operacion'],
      'tipo_operacion'      => (string)($r['tipo_operacion_nombre'] ?? ''),
      'id_clasificacion'    => $r['id_clasificacion'] === null ? null : (int)$r['id_clasificacion'],
      'id_tipo_venta'       => $r['id_tipo_venta'] === null ? null : (int)$r['id_tipo_venta'],
      'id_cliente'          => $r['id_cliente'] === null ? null : (int)$r['id_cliente'],
      'id_proveedor'        => $r['id_proveedor'] === null ? null : (int)$r['id_proveedor'],

      'id_item'             => isset($r['item_id_item']) && $r['item_id_item'] !== null ? (int)$r['item_id_item'] : null,
      'id_stock_producto'   => $id_stock_producto_final,
      'id_detalle'          => isset($r['item_id_detalle']) && $r['item_id_detalle'] !== null ? (int)$r['item_id_detalle'] : $id_stock_producto_final,

      'pago_tipo_venta'     => $tipoVentaTxt,
      'medio_pago_nombre'   => $medioPagoTxt,
      'cantidad_medios_pago'=> $cantidadMedios,
      'medios_pago_detalle' => $mediosDetalle,
      'cantidad_items'      => count($itemsDetalle),
      'items_detalle'       => $itemsDetalle,
      'id_medio_pago'       => $r['id_medio_pago'] === null ? null : (int)$r['id_medio_pago'],
      'monto_total'         => (float)$r['monto_total_final'],

      'cantidad'            => $r['item_cantidad'] === null ? null : (float)$r['item_cantidad'],
      'precio'              => $r['item_precio'] === null ? null : (float)$r['item_precio'],
      'iva_pct'             => $r['item_iva_pct'] === null ? null : (float)$r['item_iva_pct'],
      'subtotal'            => $r['item_subtotal'] === null ? null : (float)$r['item_subtotal'],
      'iva_monto'           => $r['item_iva_monto'] === null ? null : (float)$r['item_iva_monto'],
      'total'               => $r['item_total'] === null ? null : (float)$r['item_total'],

      'id_comprobante'               => $idComprobanteFinal,
      'comprobante_url'              => (string)($r['factura_comprobante_url'] ?? ''),
      'archivo_mime'                 => (string)($r['factura_comprobante_mime'] ?? ''),
      'factura_id_comprobante'       => $facturaIdComp > 0 ? $facturaIdComp : null,
      'factura_comprobante_url'      => (string)($r['factura_comprobante_url'] ?? ''),
      'factura_comprobante_mime'     => (string)($r['factura_comprobante_mime'] ?? ''),
      'factura_comprobante_tipo'     => (string)($r['factura_comprobante_tipo'] ?? ''),
      'factura_emitida_en_arca'      => (int)($r['factura_emitida_en_arca'] ?? 0),
      'factura_tiene_nota_credito'   => (int)($r['factura_tiene_nota_credito'] ?? 0),
      'factura_arca_cbte_tipo'       => (int)($r['factura_arca_cbte_tipo'] ?? 0),
      'factura_arca_pto_vta'         => (int)($r['factura_arca_pto_vta'] ?? 0),
      'factura_arca_cbte_nro'        => (int)($r['factura_arca_cbte_nro'] ?? 0),
      'factura_arca_cae'             => (string)($r['factura_arca_cae'] ?? ''),

      'remito_id_comprobante'        => isset($r['remito_id_comprobante']) && (int)$r['remito_id_comprobante'] > 0 ? (int)$r['remito_id_comprobante'] : null,
      'remito_comprobante_url'       => (string)($r['remito_comprobante_url'] ?? ''),
      'remito_comprobante_mime'      => (string)($r['remito_comprobante_mime'] ?? ''),
      'remito_comprobante_tipo'      => (string)($r['remito_comprobante_tipo'] ?? ''),

      'recibo_id_cobro'              => isset($r['recibo_id_cobro']) && (int)$r['recibo_id_cobro'] > 0 ? (int)$r['recibo_id_cobro'] : null,
      'recibo_id_comprobante'        => isset($r['recibo_id_comprobante']) && (int)$r['recibo_id_comprobante'] > 0 ? (int)$r['recibo_id_comprobante'] : null,
      'recibo_fecha_cobro'           => (string)($r['recibo_fecha_cobro'] ?? ''),
      'recibo_comprobante_url'       => (string)($r['recibo_comprobante_url'] ?? ''),
      'recibo_comprobante_mime'      => (string)($r['recibo_comprobante_mime'] ?? ''),
      'recibo_comprobante_tipo'      => (string)($r['recibo_comprobante_tipo'] ?? ''),

      'debug_factura_join'           => (string)($r['debug_factura_join'] ?? 'NO'),

      'clasificacion'                => (string)($r['clasificacion'] ?? ''),
      'tipo_venta'                   => $tipoVentaTxt,
      'cliente'                      => (string)($r['cliente'] ?? ''),
      'proveedor'                    => (string)($r['proveedor'] ?? ''),
      'detalle'                      => $detalleResumen,
      'created_at'                   => (string)($r['created_at'] ?? ''),
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