<?php
// backend/modules/movimientos/ventas/fiscal.php
declare(strict_types=1);

/* =========================================================
   Estado fiscal de venta
========================================================= */
function obtener_estado_fiscal_venta(PDO $pdo, int $idMovimiento): array {
  $sql = "
    SELECT
      mc.id_comprobante AS id_comprobante_original,
      COALESCE(ca.emitido_en_arca, 0) AS emitido_en_arca,
      cfa.cae,
      cfa.cae_vto,
      cfa.cbte_nro,
      cfa.cbte_tipo,
      cfa.pto_vta,
      cfa.resultado,
      cfa.doc_tipo,
      cfa.doc_nro,
      cfa.fecha_cbte,
      COALESCE((
        SELECT 1
        FROM comprobantes_fiscales_relaciones rel
        WHERE rel.id_comprobante_origen = mc.id_comprobante
          AND rel.tipo_relacion = 'NOTA_CREDITO'
        LIMIT 1
      ), 0) AS tiene_nota_credito
    FROM movimientos_comprobantes mc
    INNER JOIN comprobantes_archivos ca
      ON ca.id_comprobante = mc.id_comprobante
    LEFT JOIN comprobantes_fiscales_arca cfa
      ON cfa.id_comprobante = mc.id_comprobante
    WHERE mc.id_movimiento = :id_movimiento
      AND mc.tipo_relacion = 'FACTURA'
    ORDER BY mc.principal DESC, mc.id_movimiento_comprobante DESC
    LIMIT 1
  ";

  $st = $pdo->prepare($sql);
  $st->execute([':id_movimiento' => $idMovimiento]);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    return [
      'tiene_factura'         => false,
      'id_comprobante_original' => null,
      'emitido_en_arca'       => false,
      'tiene_nota_credito'    => false,
      'requiere_nota_credito' => false,
      'factura'               => null,
    ];
  }

  $emitido = ((int)($row['emitido_en_arca'] ?? 0) === 1);
  $tieneNC = ((int)($row['tiene_nota_credito'] ?? 0) === 1);

  return [
    'tiene_factura'         => true,
    'id_comprobante_original' => (int)$row['id_comprobante_original'],
    'emitido_en_arca'       => $emitido,
    'tiene_nota_credito'    => $tieneNC,
    'requiere_nota_credito' => ($emitido && !$tieneNC),
    'factura'               => $row,
  ];
}

function cfg_facturacion_digits($v): string {
  $out = preg_replace('/\D+/', '', (string)$v);
  return $out ?? '';
}

function normalizar_config_facturacion_row(array $row): array {
  // Alias normalizados para que todos los PDFs y WSFE lean siempre los datos
  // del emisor desde config_facturacion, aunque cada builder use nombres distintos.
  $row['id_config_facturacion'] = (int)($row['idConfigFacturacion'] ?? $row['id_config_facturacion'] ?? 0);
  $row['idConfigFacturacion'] = (int)$row['id_config_facturacion'];
  $row['cuit'] = cfg_facturacion_digits($row['cuit'] ?? '');
  $row['domicilio'] = $row['domicilio_comercial'] ?? '';
  $row['domicilio_fiscal'] = $row['domicilio_comercial'] ?? '';
  $row['inicio_actividades'] = $row['fecha_inicio_actividades'] ?? null;
  $row['emisor_nombre'] = $row['razon_social'] ?: ($row['nombre_fantasia'] ?? '');
  $row['emisor_domicilio'] = $row['domicilio_comercial'] ?? '';
  $row['cuit_emisor'] = $row['cuit'] ?? '';
  $row['cond_iva_emisor'] = $row['condicion_iva'] ?? '';
  $row['ingresos_brutos_emisor'] = $row['ingresos_brutos'] ?? '';
  $row['fecha_inicio_actividades_emisor'] = $row['fecha_inicio_actividades'] ?? null;
  return $row;
}

function get_config_facturacion_activas(PDO $pdo): array {
  $sql = "
    SELECT
      idConfigFacturacion,
      razon_social,
      nombre_fantasia,
      cuit,
      ingresos_brutos,
      condicion_iva,
      domicilio_comercial,
      fecha_inicio_actividades,
      punto_venta,
      tipo_comprobante_default,
      codigo_comprobante,
      activo
    FROM config_facturacion
    WHERE activo = 1
    ORDER BY idConfigFacturacion ASC
  ";
  $st = $pdo->query($sql);
  $rows = $st ? ($st->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
  return array_map('normalizar_config_facturacion_row', $rows);
}

function get_config_facturacion_activa(PDO $pdo, ?int $idConfig = null, ?string $cuit = null): array {
  $cuit = cfg_facturacion_digits($cuit ?? '');
  $params = [];
  $whereExtra = '';

  if ($idConfig !== null && $idConfig > 0) {
    $whereExtra = ' AND idConfigFacturacion = :idConfig ';
    $params[':idConfig'] = $idConfig;
  } elseif ($cuit !== '') {
    $whereExtra = ' AND REPLACE(REPLACE(cuit, \'-\', \'\'), \' \', \'\') = :cuit ';
    $params[':cuit'] = $cuit;
  }

  $sql = "
    SELECT
      idConfigFacturacion,
      razon_social,
      nombre_fantasia,
      cuit,
      ingresos_brutos,
      condicion_iva,
      domicilio_comercial,
      fecha_inicio_actividades,
      punto_venta,
      tipo_comprobante_default,
      codigo_comprobante,
      activo
    FROM config_facturacion
    WHERE activo = 1
    {$whereExtra}
    ORDER BY idConfigFacturacion DESC
    LIMIT 1
  ";

  $st = $pdo->prepare($sql);
  $st->execute($params);
  $row = $st->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    if ($idConfig !== null && $idConfig > 0) {
      fail('No existe una configuración de facturación activa con ese ID.');
    }
    if ($cuit !== '') {
      fail('No existe una configuración de facturación activa para el CUIT emisor seleccionado.');
    }
    fail('No hay configuración de facturación activa.');
  }

  return normalizar_config_facturacion_row($row);
}

function extract_config_facturacion_from_json_arca(array $jsonArca): array {
  $candidates = [
    $jsonArca['config_facturacion'] ?? null,
    $jsonArca['emisor'] ?? null,
    $jsonArca['meta_original_frontend']['config_facturacion'] ?? null,
    $jsonArca['meta_original_frontend']['resumen_facturacion']['config_facturacion'] ?? null,
    $jsonArca['meta_original_frontend']['resumen_facturacion']['raw'] ?? null,
  ];

  foreach ($candidates as $candidate) {
    if (is_array($candidate) && !empty($candidate)) {
      return $candidate;
    }
  }

  return [];
}

function extract_cuit_emisor_real_arca(array $jsonArca): string {
  // La fuente de verdad para saber QUIÉN emitió realmente es ARCA/QR,
  // no el resumen del frontend. En algunos registros viejos el resumen quedó
  // con la config fiscal equivocada, pero la respuesta de ARCA y el QR tienen
  // el CUIT real que autorizó el CAE.
  $candidates = [
    $jsonArca['respuesta_arca']['cab']['Cuit'] ?? '',
    $jsonArca['qr']['qr_payload']['cuit'] ?? '',
    $jsonArca['meta_original_frontend']['json_arca']['cab']['Cuit'] ?? '',
    $jsonArca['meta_original_frontend']['qr_payload']['cuit'] ?? '',
    $jsonArca['meta_original_frontend']['factura']['cuit_emisor'] ?? '',
    $jsonArca['meta_original_frontend']['cuit_emisor'] ?? '',
    $jsonArca['cuit_emisor'] ?? '',
  ];

  foreach ($candidates as $candidate) {
    $digits = cfg_facturacion_digits($candidate);
    if (strlen($digits) === 11) {
      return $digits;
    }
  }

  return '';
}

function extract_cuit_emisor_from_json_arca(array $jsonArca): string {
  $real = extract_cuit_emisor_real_arca($jsonArca);
  if ($real !== '') {
    return $real;
  }

  // Fallback solamente si el comprobante viejo no guardó respuesta ARCA/QR.
  $cfg = extract_config_facturacion_from_json_arca($jsonArca);
  $candidates = [
    $cfg['cuit'] ?? '',
    $cfg['cuit_emisor'] ?? '',
    $jsonArca['emisor']['cuit'] ?? '',
    $jsonArca['meta_original_frontend']['resumen_facturacion']['cuit_emisor'] ?? '',
  ];

  foreach ($candidates as $candidate) {
    $digits = cfg_facturacion_digits($candidate);
    if (strlen($digits) === 11) {
      return $digits;
    }
  }

  return '';
}

function extract_id_config_facturacion_from_json_arca(array $jsonArca): ?int {
  $cfg = extract_config_facturacion_from_json_arca($jsonArca);
  $id = (int)($cfg['idConfigFacturacion'] ?? $cfg['id_config_facturacion'] ?? 0);
  return $id > 0 ? $id : null;
}

/* =========================================================
   CONTEXTO PARA NOTA DE CRÉDITO
========================================================= */
function ventas_nota_credito_contexto(PDO $pdo): void {
  $idMovimiento = n_int($_GET['id_movimiento'] ?? null);
  if (!$idMovimiento) fail('Falta id_movimiento.');

  $stMov = $pdo->prepare("
    SELECT
      m.*,
      cl.nombre AS cliente_nombre
    FROM movimientos m
    LEFT JOIN clientes cl ON cl.id_cliente = m.id_cliente
    WHERE m.id_movimiento = :id
    LIMIT 1
  ");
  $stMov->execute([':id' => $idMovimiento]);
  $mov = $stMov->fetch(PDO::FETCH_ASSOC);
  if (!$mov) fail('La venta no existe.');

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ((int)$mov['id_tipo_operacion'] !== $idVenta) {
    fail('El movimiento no corresponde a una venta.');
  }

  $estadoFiscal = obtener_estado_fiscal_venta($pdo, $idMovimiento);
  if (!$estadoFiscal['tiene_factura'] || !$estadoFiscal['emitido_en_arca']) {
    fail('La venta no tiene una factura ARCA válida para emitir nota de crédito.');
  }

  if ($estadoFiscal['tiene_nota_credito']) {
    fail('La venta ya tiene una nota de crédito vinculada.');
  }

  $factura = $estadoFiscal['factura'];
  $cbteTipoNC = map_factura_to_nc_cbte_tipo((int)($factura['cbte_tipo'] ?? 0));

  $stFiscal = $pdo->prepare("
    SELECT
      cfa.*
    FROM comprobantes_fiscales_arca cfa
    WHERE cfa.id_comprobante = :id_comprobante
    LIMIT 1
  ");
  $stFiscal->execute([
    ':id_comprobante' => (int)$estadoFiscal['id_comprobante_original'],
  ]);
  $fiscalRow = $stFiscal->fetch(PDO::FETCH_ASSOC) ?: [];

  $jsonArca = [];
  if (!empty($fiscalRow['json_arca'])) {
    $tmp = json_decode((string)$fiscalRow['json_arca'], true);
    if (is_array($tmp)) $jsonArca = $tmp;
  }

  // IMPORTANTE multi CUIT:
  // La nota de crédito debe salir por la MISMA cuenta fiscal que emitió
  // la factura original. Para eso la fuente de verdad es el CUIT autorizado
  // por ARCA en respuesta_arca.cab.Cuit / qr_payload.cuit.
  // No usamos primero id_config_facturacion porque puede venir de un resumen
  // viejo del frontend y quedar desfasado.
  $cuitEmisorReal = extract_cuit_emisor_from_json_arca($jsonArca);
  $cfg = $cuitEmisorReal !== ''
    ? get_config_facturacion_activa($pdo, null, $cuitEmisorReal)
    : get_config_facturacion_activa($pdo, extract_id_config_facturacion_from_json_arca($jsonArca), null);

  $jsonClienteFact = [];
  if (isset($jsonArca['cliente_facturacion']) && is_array($jsonArca['cliente_facturacion'])) {
    $jsonClienteFact = $jsonArca['cliente_facturacion'];
  } elseif (
    isset($jsonArca['meta_original_frontend']['cliente_facturacion']) &&
    is_array($jsonArca['meta_original_frontend']['cliente_facturacion'])
  ) {
    $jsonClienteFact = $jsonArca['meta_original_frontend']['cliente_facturacion'];
  } elseif (
    isset($jsonArca['meta_original_frontend']['resumen_facturacion']['cliente_facturacion']) &&
    is_array($jsonArca['meta_original_frontend']['resumen_facturacion']['cliente_facturacion'])
  ) {
    $jsonClienteFact = $jsonArca['meta_original_frontend']['resumen_facturacion']['cliente_facturacion'];
  }

  $docNro = (string)(
    $jsonClienteFact['doc_nro']
    ?? $jsonClienteFact['cuit']
    ?? $factura['doc_nro']
    ?? ''
  );

  $clienteFiscal = [
    'doc_tipo' => (int)(
      $jsonClienteFact['doc_tipo']
      ?? $factura['doc_tipo']
      ?? 80
    ),
    'doc_nro' => $docNro,
    'cuit' => (string)(
      $jsonClienteFact['cuit']
      ?? $docNro
    ),
    'razon_social' => (string)(
      $jsonClienteFact['razon_social']
      ?? $jsonClienteFact['nombre']
      ?? $mov['cliente_nombre']
      ?? ''
    ),
    'condicion_iva' => (string)(
      $jsonClienteFact['condicion_iva']
      ?? $jsonClienteFact['cond_iva']
      ?? 'Consumidor Final'
    ),
    'domicilio' => (string)(
      $jsonClienteFact['domicilio']
      ?? ''
    ),
    'origen' => !empty($jsonClienteFact) ? 'json_arca' : 'fallback_movimiento',
  ];

  $items = [];
  $stItems = $pdo->prepare("
    SELECT
      mi.id_item,
      mi.id_stock_producto,
      mi.cantidad,
      mi.precio,
      mi.iva_pct,
      mi.subtotal,
      mi.iva_monto,
      mi.total,
      COALESCE(sp.nombre, '') AS detalle_nombre
    FROM movimientos_items mi
    LEFT JOIN stock_productos sp
      ON sp.id_stock_producto = mi.id_stock_producto
    WHERE mi.id_movimiento = :id
    ORDER BY mi.id_item ASC
  ");
  $stItems->execute([':id' => $idMovimiento]);
  $rowsItems = $stItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

  if ($rowsItems) {
    foreach ($rowsItems as $i => $it) {
      $items[] = [
        'id'              => (int)$it['id_item'],
        'codigo'          => (string)($i + 1),
        'descripcion'     => (string)($it['detalle_nombre'] ?? 'Item'),
        'cantidad'        => (float)($it['cantidad'] ?? 0),
        'unidad'          => 'u',
        'precio_unitario' => (float)($it['precio'] ?? 0),
        'precio'          => (float)($it['precio'] ?? 0),
        'bonif_pct'       => 0,
        'impBonif'        => 0,
        'subtotal'        => (float)($it['subtotal'] ?? 0),
        'ars'             => (float)($it['total'] ?? 0),
        'iva_pct'         => (float)($it['iva_pct'] ?? 0),
        'iva_monto'       => (float)($it['iva_monto'] ?? 0),
        'total'           => (float)($it['total'] ?? 0),
      ];
    }
  } else {
    $items[] = [
      'id'              => 1,
      'codigo'          => '1',
      'descripcion'     => 'Anulación de venta',
      'cantidad'        => 1,
      'unidad'          => 'u',
      'precio_unitario' => (float)($mov['monto_total'] ?? 0),
      'precio'          => (float)($mov['monto_total'] ?? 0),
      'bonif_pct'       => 0,
      'impBonif'        => 0,
      'subtotal'        => (float)($mov['monto_total'] ?? 0),
      'ars'             => (float)($mov['monto_total'] ?? 0),
      'iva_pct'         => 0,
      'iva_monto'       => 0,
      'total'           => (float)($mov['monto_total'] ?? 0),
    ];
  }

  ok([
    'contexto' => [
      'id_movimiento' => (int)$mov['id_movimiento'],
      'id_cliente' => (int)$mov['id_cliente'],
      'id_tipo_venta' => (int)$mov['id_tipo_venta'],
      'id_medio_pago' => $mov['id_medio_pago'] !== null ? (int)$mov['id_medio_pago'] : null,
      'cliente_nombre' => (string)($mov['cliente_nombre'] ?? ''),
      'total' => (float)($mov['monto_total'] ?? 0),

      'cliente_facturacion' => $clienteFiscal,

      'factura_original' => [
        'id_comprobante' => (int)$estadoFiscal['id_comprobante_original'],
        'cae' => (string)($factura['cae'] ?? ''),
        'cae_vto' => (string)($factura['cae_vto'] ?? ''),
        'cbte_nro' => (int)($factura['cbte_nro'] ?? 0),
        'cbte_tipo' => (int)($factura['cbte_tipo'] ?? 0),
        'pto_vta' => (int)($factura['pto_vta'] ?? 0),
        'resultado' => (string)($factura['resultado'] ?? ''),
        'doc_tipo' => (int)($factura['doc_tipo'] ?? 80),
        'doc_nro' => (string)($factura['doc_nro'] ?? ''),
        'fecha_cbte' => (string)($factura['fecha_cbte'] ?? ''),
      ],

      'nota_credito' => [
        'cbte_tipo' => $cbteTipoNC,
        'pto_vta' => (int)($factura['pto_vta'] ?? (int)($cfg['punto_venta'] ?? 2)),
      ],

      'cbtes_asoc' => [[
        'tipo' => (int)($factura['cbte_tipo'] ?? 0),
        'pto_vta' => (int)($factura['pto_vta'] ?? 0),
        'nro' => (int)($factura['cbte_nro'] ?? 0),
        'cuit' => (string)($cuitEmisorReal !== '' ? $cuitEmisorReal : ($cfg['cuit'] ?? '')),
        'fecha' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($factura['fecha_cbte'] ?? ''))
          ? str_replace('-', '', (string)$factura['fecha_cbte'])
          : null,
      ]],

      'items_facturacion' => $items,
      'config_facturacion' => $cfg,
      'json_arca_original' => $jsonArca,
      'emisor_resuelto_desde_arca' => [
        'cuit_emisor_real' => $cuitEmisorReal,
        'id_config_facturacion' => (int)($cfg['id_config_facturacion'] ?? 0),
        'razon_social' => (string)($cfg['razon_social'] ?? ''),
      ],
    ]
  ]);
}

/* =========================================================
   VINCULAR NOTA DE CRÉDITO
========================================================= */
function ventas_nota_credito_vincular(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido.', 405);
  }

  $body = read_json_body();
  $idUsuario = get_id_usuario_from_request($pdo, $body);

  $idMovimiento = n_int($body['id_movimiento'] ?? null);
  $idCompOrig   = n_int($body['id_comprobante_original'] ?? null);
  $idCompNC     = n_int($body['id_comprobante_nota_credito'] ?? null);

  if (!$idMovimiento) fail('Falta id_movimiento.');
  if (!$idCompOrig)   fail('Falta id_comprobante_original.');
  if (!$idCompNC)     fail('Falta id_comprobante_nota_credito.');

  try {
    $pdo->beginTransaction();

    $stDup = $pdo->prepare("
      SELECT id_relacion
      FROM comprobantes_fiscales_relaciones
      WHERE id_comprobante_origen = :o
        AND id_comprobante_relacionado = :r
        AND tipo_relacion = 'NOTA_CREDITO'
      LIMIT 1
    ");
    $stDup->execute([
      ':o' => $idCompOrig,
      ':r' => $idCompNC,
    ]);
    $dup = $stDup->fetch(PDO::FETCH_ASSOC);

    if (!$dup) {
      $ins = $pdo->prepare("
        INSERT INTO comprobantes_fiscales_relaciones
          (id_comprobante_origen, id_comprobante_relacionado, tipo_relacion)
        VALUES
          (:o, :r, 'NOTA_CREDITO')
      ");
      $ins->execute([
        ':o' => $idCompOrig,
        ':r' => $idCompNC,
      ]);
    }

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'nota_credito_vincular', 'ventas', $idMovimiento, [
      'id_movimiento' => $idMovimiento,
      'id_comprobante_original' => $idCompOrig,
      'id_comprobante_nota_credito' => $idCompNC,
      'ya_existia_relacion' => $dup ? 1 : 0,
    ]);

    ok([
      'id_movimiento' => $idMovimiento,
      'id_comprobante_original' => $idCompOrig,
      'id_comprobante_nota_credito' => $idCompNC,
      'vinculada' => true,
      'ya_existia_relacion' => $dup ? true : false,
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    fail('No se pudo vincular la nota de crédito. ' . $e->getMessage());
  }
}

function facturacion_config_get(PDO $pdo): void {
  try {
    $idConfig = (int)($_GET['id_config_facturacion'] ?? $_GET['idConfigFacturacion'] ?? 0);
    $cuit = cfg_facturacion_digits($_GET['cuit'] ?? $_GET['cuit_emisor'] ?? $_GET['arca_cuit'] ?? '');

    $configs = get_config_facturacion_activas($pdo);
    $cfg = get_config_facturacion_activa(
      $pdo,
      $idConfig > 0 ? $idConfig : null,
      $cuit !== '' ? $cuit : null
    );

    echo json_encode([
      'exito' => true,
      'config' => $cfg,
      'configs' => $configs,
    ], JSON_UNESCAPED_UNICODE);
    exit;
  } catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
      'exito' => false,
      'mensaje' => 'Error obteniendo config_facturacion.',
      'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }
}
