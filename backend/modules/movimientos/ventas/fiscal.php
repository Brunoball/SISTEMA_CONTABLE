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
      'tiene_factura' => false,
      'id_comprobante_original' => null,
      'emitido_en_arca' => false,
      'tiene_nota_credito' => false,
      'requiere_nota_credito' => false,
      'factura' => null,
    ];
  }

  $emitido = ((int)($row['emitido_en_arca'] ?? 0) === 1);
  $tieneNC = ((int)($row['tiene_nota_credito'] ?? 0) === 1);

  return [
    'tiene_factura' => true,
    'id_comprobante_original' => (int)$row['id_comprobante_original'],
    'emitido_en_arca' => $emitido,
    'tiene_nota_credito' => $tieneNC,
    'requiere_nota_credito' => ($emitido && !$tieneNC),
    'factura' => $row,
  ];
}

function get_config_facturacion_activa(PDO $pdo): array {
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
      email_facturacion,
      telefono_facturacion,
      sitio_web,
      logo_url,
      activo
    FROM config_facturacion
    WHERE activo = 1
    ORDER BY idConfigFacturacion DESC
    LIMIT 1
  ";
  $st = $pdo->query($sql);
  $row = $st ? $st->fetch(PDO::FETCH_ASSOC) : false;
  if (!$row) fail('No hay configuración de facturación activa.');
  return $row;
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

  $cfg = get_config_facturacion_activa($pdo);
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
      mi.id_detalle,
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
  ");
  $stItems->execute([':id' => $idMovimiento]);
  $rowsItems = $stItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

  if ($rowsItems) {
    foreach ($rowsItems as $i => $it) {
      $items[] = [
        'id' => (int)$it['id_item'],
        'codigo' => (string)($i + 1),
        'descripcion' => (string)($it['detalle_nombre'] ?? 'Item'),
        'cantidad' => (float)($it['cantidad'] ?? 0),
        'unidad' => 'u',
        'precio_unitario' => (float)($it['precio'] ?? 0),
        'precio' => (float)($it['precio'] ?? 0),
        'bonif_pct' => 0,
        'impBonif' => 0,
        'subtotal' => (float)($it['subtotal'] ?? 0),
        'ars' => (float)($it['total'] ?? 0),
        'iva_pct' => (float)($it['iva_pct'] ?? 0),
        'iva_monto' => (float)($it['iva_monto'] ?? 0),
        'total' => (float)($it['total'] ?? 0),
      ];
    }
  } else {
    $items[] = [
      'id' => 1,
      'codigo' => '1',
      'descripcion' => 'Anulación de venta',
      'cantidad' => 1,
      'unidad' => 'u',
      'precio_unitario' => (float)($mov['monto_total'] ?? 0),
      'precio' => (float)($mov['monto_total'] ?? 0),
      'bonif_pct' => 0,
      'impBonif' => 0,
      'subtotal' => (float)($mov['monto_total'] ?? 0),
      'ars' => (float)($mov['monto_total'] ?? 0),
      'iva_pct' => 0,
      'iva_monto' => 0,
      'total' => (float)($mov['monto_total'] ?? 0),
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
        'cuit' => (string)($cfg['cuit'] ?? ''),
        'fecha' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($factura['fecha_cbte'] ?? ''))
          ? str_replace('-', '', (string)$factura['fecha_cbte'])
          : null,
      ]],

      'items_facturacion' => $items,
      'config_facturacion' => $cfg,
      'json_arca_original' => $jsonArca,
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
    $cfg = get_config_facturacion_activa($pdo);
    echo json_encode([
      'exito' => true,
      'config' => $cfg
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