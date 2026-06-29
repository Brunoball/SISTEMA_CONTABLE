<?php
// backend/modules/movimientos/documentos_comerciales/facturas.php
declare(strict_types=1);

if (!function_exists('doccom_normalizar')) {
  function doccom_normalizar(string $v): string {
    $s = mb_strtolower(trim($v), 'UTF-8');
    return str_replace(['á','é','í','ó','ú','ñ'], ['a','e','i','o','u','n'], $s);
  }
}

if (!function_exists('doccom_tipos_documento')) {
  function doccom_tipos_documento(): array {
    return ['PRESUPUESTO', 'REMITO', 'VENTA_NO_FACTURADA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'];
  }
}

if (!function_exists('doccom_tipos_facturas')) {
  function doccom_tipos_facturas(): array {
    return ['FACTURA', 'VENTA_NO_FACTURADA', 'NOTA_CREDITO', 'NOTA_DEBITO'];
  }
}

if (!function_exists('doccom_tipos_por_grupo')) {
  function doccom_tipos_por_grupo(string $grupo): array {
    $g = doccom_normalizar($grupo);

    if (in_array($g, ['factura', 'facturas', 'facturacion'], true)) {
      return doccom_tipos_facturas();
    }
    if (in_array($g, ['remito', 'remitos'], true)) {
      return ['REMITO'];
    }
    if (in_array($g, ['presupuesto', 'presupuestos'], true)) {
      return ['PRESUPUESTO'];
    }

    return doccom_tipos_documento();
  }
}

if (!function_exists('doccom_tipo_grupo')) {
  function doccom_tipo_grupo(string $tipo): string {
    $t = strtoupper(trim($tipo));
    if ($t === 'REMITO') return 'remitos';
    if ($t === 'PRESUPUESTO') return 'presupuestos';
    if (in_array($t, ['FACTURA', 'VENTA_NO_FACTURADA', 'NOTA_CREDITO', 'NOTA_DEBITO'], true)) return 'facturas';
    return 'documentos';
  }
}

if (!function_exists('doccom_numero_visual')) {
  function doccom_numero_visual(array $row): string {
    $tipo = strtoupper(trim((string)($row['tipo'] ?? '')));
    $label = function_exists('presu_tipo_documento_label') ? presu_tipo_documento_label($tipo) : ($tipo !== '' ? $tipo : 'Comprobante');

    $pto = (int)($row['pto_vta'] ?? 0);
    $nro = (int)($row['cbte_nro'] ?? 0);

    if ($nro > 0) {
      $ptoFmt = $pto > 0 ? str_pad((string)$pto, 4, '0', STR_PAD_LEFT) : '0000';
      $nroFmt = str_pad((string)$nro, 8, '0', STR_PAD_LEFT);
      return $label . ' ' . $ptoFmt . '-' . $nroFmt;
    }

    $idComp = (int)($row['id_comprobante'] ?? 0);
    $idMov = (int)($row['id_movimiento'] ?? 0);

    if ($tipo === 'PRESUPUESTO' && $idMov > 0) return 'Presupuesto #' . $idMov;
    if ($tipo === 'REMITO' && $idComp > 0) return 'Remito #' . $idComp;
    if ($tipo === 'VENTA_NO_FACTURADA' && $idComp > 0) return 'Factura no emitida #' . $idComp;
    if ($idComp > 0) return $label . ' #' . $idComp;

    return $label;
  }
}

if (!function_exists('doccom_bind_tipos')) {
  function doccom_bind_tipos(array $tipos): array {
    $out = [];
    foreach ($tipos as $t) {
      $t = strtoupper(trim((string)$t));
      if ($t !== '') $out[] = $t;
    }
    return $out ?: doccom_tipos_documento();
  }
}

if (!function_exists('doccom_clientes_listar_por_tipos')) {
  function doccom_clientes_listar_por_tipos(PDO $pdo, array $tipos, string $grupoRespuesta): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') fail('Método no permitido.', 405);

    $q = function_exists('presu_str') ? presu_str($_GET['q'] ?? '') : trim((string)($_GET['q'] ?? ''));
    $limit = (int)($_GET['limit'] ?? 120);
    $soloConDocumentos = (function_exists('presu_str') ? presu_str($_GET['solo_con_documentos'] ?? '1') : trim((string)($_GET['solo_con_documentos'] ?? '1'))) !== '0';

    if ($limit <= 0) $limit = 120;
    if ($limit > 300) $limit = 300;

    $tipos = doccom_bind_tipos($tipos);
    $inTipos = implode(',', array_fill(0, count($tipos), '?'));
    $joinDocs = $soloConDocumentos ? 'INNER JOIN' : 'LEFT JOIN';

    $where = "WHERE COALESCE(c.activo, 1) = 1";
    $params = $tipos;

    if ($q !== '') {
      $where .= "
        AND (
          c.nombre LIKE ?
          OR COALESCE(c.cuit, '') LIKE ?
          OR COALESCE(cf.razon_social, '') LIKE ?
          OR CAST(c.id_cliente AS CHAR) LIKE ?
        )";
      $like = '%' . $q . '%';
      $params[] = $like;
      $params[] = $like;
      $params[] = $like;
      $params[] = $like;
    }

    $sql = "
      SELECT
        c.id_cliente,
        c.nombre,
        c.cuit,
        cf.razon_social,
        cf.condicion_iva,
        cf.domicilio,
        COALESCE(docs.total_documentos, 0) AS total_documentos,
        COALESCE(docs.total_facturas, 0) AS total_facturas,
        COALESCE(docs.total_remitos, 0) AS total_remitos,
        COALESCE(docs.total_presupuestos, 0) AS total_presupuestos,
        docs.ultimo_documento
      FROM clientes c
      $joinDocs (
        SELECT
          m.id_cliente,
          COUNT(DISTINCT ca.id_comprobante) AS total_documentos,
          COUNT(DISTINCT CASE WHEN ca.tipo IN ('FACTURA', 'VENTA_NO_FACTURADA', 'NOTA_CREDITO', 'NOTA_DEBITO') THEN ca.id_comprobante END) AS total_facturas,
          COUNT(DISTINCT CASE WHEN ca.tipo = 'REMITO' THEN ca.id_comprobante END) AS total_remitos,
          COUNT(DISTINCT CASE WHEN ca.tipo = 'PRESUPUESTO' THEN ca.id_comprobante END) AS total_presupuestos,
          MAX(ca.created_at) AS ultimo_documento
        FROM comprobantes_archivos ca
        INNER JOIN movimientos_comprobantes mc ON mc.id_comprobante = ca.id_comprobante
        INNER JOIN movimientos m ON m.id_movimiento = mc.id_movimiento
        WHERE m.id_cliente IS NOT NULL
          AND ca.tipo IN ($inTipos)
        GROUP BY m.id_cliente
      ) docs ON docs.id_cliente = c.id_cliente
      LEFT JOIN clientes_fiscales cf ON cf.id_cliente = c.id_cliente AND COALESCE(cf.activo, 1) = 1
      $where
      ORDER BY COALESCE(docs.ultimo_documento, c.created_at) DESC, c.nombre ASC
      LIMIT $limit
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as &$r) {
      $r['id_cliente'] = (int)($r['id_cliente'] ?? 0);
      $r['total_documentos'] = (int)($r['total_documentos'] ?? 0);
      $r['total_facturas'] = (int)($r['total_facturas'] ?? 0);
      $r['total_remitos'] = (int)($r['total_remitos'] ?? 0);
      $r['total_presupuestos'] = (int)($r['total_presupuestos'] ?? 0);
    }
    unset($r);

    ok([
      'clientes' => $rows,
      'cantidad' => count($rows),
      'grupo' => $grupoRespuesta,
      'tipos' => $tipos,
    ]);
  }
}

if (!function_exists('doccom_fetch_items_por_movimiento')) {
  function doccom_fetch_items_por_movimiento(PDO $pdo, array $idsMovimiento): array {
    $ids = [];
    foreach ($idsMovimiento as $id) {
      $n = (int)$id;
      if ($n > 0) $ids[$n] = $n;
    }

    if (!$ids) return [];

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $st = $pdo->prepare("
      SELECT
        mi.id_movimiento,
        COUNT(*) AS cantidad_items,
        GROUP_CONCAT(COALESCE(d.nombre, sp.nombre, 'Producto / Servicio') ORDER BY mi.id_item SEPARATOR ', ') AS detalle
      FROM movimientos_items mi
      LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
      LEFT JOIN stock_productos sp ON sp.id_stock_producto = mi.id_stock_producto
      WHERE mi.id_movimiento IN ($placeholders)
      GROUP BY mi.id_movimiento
    ");
    $st->execute(array_values($ids));
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $map = [];
    foreach ($rows as $r) {
      $id = (int)($r['id_movimiento'] ?? 0);
      if ($id <= 0) continue;
      $map[$id] = [
        'detalle' => trim((string)($r['detalle'] ?? '')),
        'cantidad_items' => (int)($r['cantidad_items'] ?? 0),
      ];
    }
    return $map;
  }
}

if (!function_exists('doccom_documentos_cliente_por_tipos')) {
  function doccom_documentos_cliente_por_tipos(PDO $pdo, array $tipos, string $grupoRespuesta): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') fail('Método no permitido.', 405);

    $idCliente = function_exists('presu_pos_int') ? presu_pos_int($_GET['id_cliente'] ?? $_GET['id'] ?? null) : (int)($_GET['id_cliente'] ?? $_GET['id'] ?? 0);
    if (!$idCliente) fail('Falta id_cliente.');

    $q = function_exists('presu_str') ? presu_str($_GET['q'] ?? '') : trim((string)($_GET['q'] ?? ''));
    $limit = (int)($_GET['limit'] ?? 500);
    if ($limit <= 0) $limit = 500;
    if ($limit > 800) $limit = 800;

    $tipos = doccom_bind_tipos($tipos);
    $in = implode(',', array_fill(0, count($tipos), '?'));

    $whereExtra = '';
    $params = array_merge([$idCliente], $tipos);

    if ($q !== '') {
      $whereExtra = "
        AND (
          ca.tipo LIKE ?
          OR CAST(ca.id_comprobante AS CHAR) LIKE ?
          OR CAST(m.id_movimiento AS CHAR) LIKE ?
          OR COALESCE(c.nombre, '') LIKE ?
          OR COALESCE(cfiscal.razon_social, '') LIKE ?
          OR CAST(COALESCE(cf.cbte_nro, '') AS CHAR) LIKE ?
          OR EXISTS (
            SELECT 1
            FROM movimientos_items mix
            LEFT JOIN detalles dx ON dx.id_detalle = mix.id_detalle
            LEFT JOIN stock_productos spx ON spx.id_stock_producto = mix.id_stock_producto
            WHERE mix.id_movimiento = m.id_movimiento
              AND COALESCE(dx.nombre, spx.nombre, 'Producto / Servicio') LIKE ?
            LIMIT 1
          )
        )";
      $like = '%' . $q . '%';
      for ($i = 0; $i < 7; $i++) $params[] = $like;
    }

    $sql = "
      SELECT
        ca.id_comprobante,
        ca.tipo,
        ca.emitido_en_arca,
        ca.archivo_url,
        ca.archivo_mime,
        ca.archivo_size,
        ca.created_at,
        MIN(m.id_movimiento) AS id_movimiento,
        GROUP_CONCAT(DISTINCT m.id_movimiento ORDER BY m.id_movimiento SEPARATOR ',') AS ids_movimiento,
        MAX(m.fecha) AS fecha,
        SUM(COALESCE(m.monto_total, 0)) AS monto_total,
        m.id_cliente,
        c.nombre AS cliente,
        cfiscal.razon_social,
        cfiscal.condicion_iva,
        cfiscal.domicilio,
        cf.cae,
        cf.cae_vto,
        cf.cbte_nro,
        cf.cbte_tipo,
        cf.pto_vta,
        cf.resultado,
        cf.fecha_cbte
      FROM comprobantes_archivos ca
      INNER JOIN movimientos_comprobantes mc ON mc.id_comprobante = ca.id_comprobante
      INNER JOIN movimientos m ON m.id_movimiento = mc.id_movimiento
      LEFT JOIN comprobantes_fiscales_arca cf ON cf.id_comprobante = ca.id_comprobante
      LEFT JOIN clientes c ON c.id_cliente = m.id_cliente
      LEFT JOIN clientes_fiscales cfiscal ON cfiscal.id_cliente = c.id_cliente AND COALESCE(cfiscal.activo, 1) = 1
      WHERE m.id_cliente = ?
        AND ca.tipo IN ($in)
        $whereExtra
      GROUP BY
        ca.id_comprobante,
        ca.tipo,
        ca.emitido_en_arca,
        ca.archivo_url,
        ca.archivo_mime,
        ca.archivo_size,
        ca.created_at,
        m.id_cliente,
        c.nombre,
        cfiscal.razon_social,
        cfiscal.condicion_iva,
        cfiscal.domicilio,
        cf.cae,
        cf.cae_vto,
        cf.cbte_nro,
        cf.cbte_tipo,
        cf.pto_vta,
        cf.resultado,
        cf.fecha_cbte
      ORDER BY COALESCE(ca.created_at, MAX(m.fecha)) DESC, ca.id_comprobante DESC
      LIMIT $limit
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $idsMovimiento = [];
    foreach ($rows as $r) {
      foreach (explode(',', (string)($r['ids_movimiento'] ?? '')) as $id) {
        $id = (int)$id;
        if ($id > 0) $idsMovimiento[$id] = $id;
      }
    }
    $itemsPorMovimiento = doccom_fetch_items_por_movimiento($pdo, array_values($idsMovimiento));

    foreach ($rows as &$r) {
      $ids = [];
      foreach (explode(',', (string)($r['ids_movimiento'] ?? '')) as $id) {
        $id = (int)$id;
        if ($id > 0) $ids[] = $id;
      }

      $detalles = [];
      $cantItems = 0;
      foreach ($ids as $idMov) {
        if (!isset($itemsPorMovimiento[$idMov])) continue;
        $detalle = trim((string)($itemsPorMovimiento[$idMov]['detalle'] ?? ''));
        if ($detalle !== '') $detalles[] = $detalle;
        $cantItems += (int)($itemsPorMovimiento[$idMov]['cantidad_items'] ?? 0);
      }

      $r['id_comprobante'] = (int)($r['id_comprobante'] ?? 0);
      $r['id_movimiento'] = (int)($r['id_movimiento'] ?? 0);
      $r['id_cliente'] = (int)($r['id_cliente'] ?? 0);
      $r['monto_total'] = (float)($r['monto_total'] ?? 0);
      $r['cantidad_items'] = $cantItems;
      $r['emitido_en_arca'] = (int)($r['emitido_en_arca'] ?? 0);
      $r['detalle'] = implode(', ', array_unique($detalles));
      $r['documento_label'] = function_exists('presu_tipo_documento_label') ? presu_tipo_documento_label((string)($r['tipo'] ?? '')) : (string)($r['tipo'] ?? 'Documento');
      $r['grupo'] = doccom_tipo_grupo((string)($r['tipo'] ?? ''));
      $r['numero_visual'] = doccom_numero_visual($r);
    }
    unset($r);

    ok([
      'documentos' => $rows,
      'cantidad' => count($rows),
      'id_cliente' => $idCliente,
      'grupo' => $grupoRespuesta,
      'tipos' => $tipos,
    ]);
  }
}

function facturas_clientes_listar(PDO $pdo): void {
  doccom_clientes_listar_por_tipos($pdo, doccom_tipos_facturas(), 'facturas');
}

function facturas_documentos_cliente(PDO $pdo): void {
  doccom_documentos_cliente_por_tipos($pdo, doccom_tipos_facturas(), 'facturas');
}

function documentos_comerciales_clientes_listar(PDO $pdo): void {
  $grupo = function_exists('presu_str') ? presu_str($_GET['grupo'] ?? $_GET['tipo'] ?? 'all') : trim((string)($_GET['grupo'] ?? $_GET['tipo'] ?? 'all'));
  $g = doccom_normalizar($grupo);

  if (in_array($g, ['remito', 'remitos'], true) && function_exists('remitos_clientes_listar')) {
    remitos_clientes_listar($pdo);
    return;
  }

  doccom_clientes_listar_por_tipos($pdo, doccom_tipos_por_grupo($grupo), $grupo ?: 'all');
}

function documentos_comerciales_documentos_cliente(PDO $pdo): void {
  $grupo = function_exists('presu_str') ? presu_str($_GET['grupo'] ?? $_GET['tipo'] ?? 'all') : trim((string)($_GET['grupo'] ?? $_GET['tipo'] ?? 'all'));
  $g = doccom_normalizar($grupo);

  if (in_array($g, ['remito', 'remitos'], true) && function_exists('remitos_documentos_cliente')) {
    remitos_documentos_cliente($pdo);
    return;
  }

  doccom_documentos_cliente_por_tipos($pdo, doccom_tipos_por_grupo($grupo), $grupo ?: 'all');
}
