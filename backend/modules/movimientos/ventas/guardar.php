<?php
// backend/modules/movimientos/ventas/guardar.php
declare(strict_types=1);

require_once __DIR__ . '/../core/plan_saas.php';
require_once __DIR__ . '/../global/cheques.php';
require_once __DIR__ . '/../global/medios_pago.php';

/* =========================================================
   HELPERS STOCK
========================================================= */
if (!function_exists('ventas_stock_normalizar_cantidad')) {
  function ventas_stock_normalizar_cantidad($cantidad): int
  {
    $n = (float)$cantidad;
    if (!is_finite($n) || $n <= 0) {
      fail('La cantidad para impactar stock debe ser mayor a 0.');
    }

    $entera = (int)round($n);
    if (abs($n - $entera) > 0.00001) {
      fail('La cantidad de productos debe ser un número entero para impactar stock.');
    }

    return $entera;
  }
}

if (!function_exists('ventas_stock_lock_producto')) {
  function ventas_stock_lock_producto(PDO $pdo, int $idStockProducto): array
  {
    $st = $pdo->prepare("
      SELECT
        id_stock_producto,
        nombre,
        COALESCE(stock, 0) AS stock
      FROM stock_productos
      WHERE id_stock_producto = :id_stock_producto
      LIMIT 1
      FOR UPDATE
    ");
    $st->execute([':id_stock_producto' => $idStockProducto]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      fail("No existe el producto de stock con id {$idStockProducto}.");
    }

    return $row;
  }
}

if (!function_exists('ventas_stock_descontar')) {
  function ventas_stock_descontar(PDO $pdo, int $idStockProducto, $cantidad): void
  {
    $cant = ventas_stock_normalizar_cantidad($cantidad);
    $prod = ventas_stock_lock_producto($pdo, $idStockProducto);

    $stockActual = (int)($prod['stock'] ?? 0);
    if ($stockActual < $cant) {
      $nombre = (string)($prod['nombre'] ?? ('ID ' . $idStockProducto));
      fail("Stock insuficiente para \"{$nombre}\". Disponible: {$stockActual}, requerido: {$cant}.");
    }

    $upd = $pdo->prepare("
      UPDATE stock_productos
      SET stock = stock - :cantidad
      WHERE id_stock_producto = :id_stock_producto
      LIMIT 1
    ");
    $upd->execute([
      ':cantidad'          => $cant,
      ':id_stock_producto' => $idStockProducto,
    ]);
  }
}

if (!function_exists('ventas_stock_reponer')) {
  function ventas_stock_reponer(PDO $pdo, int $idStockProducto, $cantidad): void
  {
    $cant = ventas_stock_normalizar_cantidad($cantidad);
    ventas_stock_lock_producto($pdo, $idStockProducto);

    $upd = $pdo->prepare("
      UPDATE stock_productos
      SET stock = stock + :cantidad
      WHERE id_stock_producto = :id_stock_producto
      LIMIT 1
    ");
    $upd->execute([
      ':cantidad'          => $cant,
      ':id_stock_producto' => $idStockProducto,
    ]);
  }
}


/* =========================================================
   HELPERS MULTI-MEDIO DE PAGO
========================================================= */
if (!function_exists('ventas_get_medio_pago_row')) {
  function ventas_get_medio_pago_row(PDO $pdo, int $idMedioPago): ?array
  {
    return mv_medios_pago_get_row($pdo, $idMedioPago);
  }
}





if (!function_exists('ventas_detect_medio_pago_tipo_cheque')) {
  function ventas_detect_medio_pago_tipo_cheque(string $nombre): ?string
  {
    return mv_medios_pago_detect_tipo_cheque($nombre);
  }
}





if (!function_exists('ventas_payment_storage_plan')) {
  function ventas_payment_storage_plan(array $mediosValidados, ?int $legacyId = null): array
  {
    return mv_medios_pago_storage_plan($mediosValidados, $legacyId);
  }
}





if (!function_exists('ventas_persistir_cheques_desde_medios')) {
  function ventas_persistir_cheques_desde_medios(PDO $pdo, int $idMovimiento, array $mediosValidados): array
  {
    try {
      return mv_medios_pago_persistir_cheques_entrada($pdo, $idMovimiento, $mediosValidados);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}





if (!function_exists('ventas_medios_pago_raw_desde_src')) {
  function ventas_medios_pago_raw_desde_src(array $src, float $montoTotal): array
  {
    return mv_medios_pago_raw_desde_src($src, $montoTotal);
  }
}





if (!function_exists('ventas_normalize_cheque_payload')) {
  function ventas_normalize_cheque_payload(array $src, string $tipoCheque, float $fallbackMonto = 0.0): array
  {
    try {
      return mv_medios_pago_normalizar_cheque_entrada($src, $tipoCheque, $fallbackMonto);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}





if (!function_exists('ventas_validar_medios_pago_multi')) {
  function ventas_validar_medios_pago_multi(PDO $pdo, array $mediosPagoRaw, float $montoTotalEsperado): array
  {
    try {
      return mv_medios_pago_validar_multi($pdo, $mediosPagoRaw, $montoTotalEsperado, [
        'modo'                  => 'entrada',
        'permitir_crear_cheque' => true,
        'empty_message'         => 'Venta contado: debés indicar al menos un medio de pago.',
        'total_label'           => 'la venta',
      ]);
    } catch (Throwable $e) {
      fail($e->getMessage(), stripos($e->getMessage(), 'plan') !== false ? 403 : 200);
    }
  }
}






if (!function_exists('ventas_guardar_flujo_table_exists')) {
  function ventas_guardar_flujo_table_exists(PDO $pdo): bool
  {
    static $cache = null;
    if ($cache !== null) return $cache;
    try {
      $pdo->query("SELECT 1 FROM movimientos_cheques_flujo LIMIT 1");
      $cache = true;
    } catch (Throwable $e) {
      $cache = false;
    }
    return $cache;
  }
}

if (!function_exists('ventas_guardar_registrar_flujo_ingreso_cheque')) {
  function ventas_guardar_registrar_flujo_ingreso_cheque(PDO $pdo, int $idCheque, int $idMovimiento, array $cheque): void
  {
    if ($idCheque <= 0 || $idMovimiento <= 0 || !ventas_guardar_flujo_table_exists($pdo)) return;

    $tipoCheque = strtolower(trim((string)($cheque['tipo'] ?? 'cheque')));
    if ($tipoCheque === '') $tipoCheque = 'cheque';

    $fechaEvento = normalizar_fecha_movimiento($cheque['fecha_emision'] ?? null);
    if ($fechaEvento === null) {
      throw new RuntimeException('Cheque: la fecha de emisión es obligatoria y debe venir desde el modal.');
    }

    $descripcion = (($tipoCheque === 'echeq') ? 'E-cheq' : 'Cheque') . ' ingresado a cartera desde movimiento #' . $idMovimiento . '.';

    $pdo->prepare("DELETE FROM movimientos_cheques_flujo WHERE id_cheque = :id_cheque AND UPPER(COALESCE(evento,'')) IN ('INGRESO_CARTERA','INGRESO','ALTA','ALTA_CARTERA')")
      ->execute([':id_cheque' => $idCheque]);

    $st = $pdo->prepare("
      INSERT INTO movimientos_cheques_flujo
        (tipo_cheque, id_cheque, id_movimiento, evento, fecha_evento, importe, descripcion, usuario)
      VALUES
        (:tipo_cheque, :id_cheque, :id_movimiento, 'INGRESO_CARTERA', :fecha_evento, :importe, :descripcion, NULL)
    ");

    $st->execute([
      ':tipo_cheque'   => $tipoCheque,
      ':id_cheque'     => $idCheque,
      ':id_movimiento' => $idMovimiento,
      ':fecha_evento'  => $fechaEvento,
      ':importe'       => (float)($cheque['importe'] ?? 0),
      ':descripcion'   => $descripcion,
    ]);
  }
}

if (!function_exists('ventas_insertar_medios_pago_multi')) {
  function ventas_insertar_medios_pago_multi(PDO $pdo, int $idMovimiento, array $mediosValidados): void
  {
    try {
      mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosValidados, [
        'contexto'      => 'venta',
        'salida_cheque' => false,
      ]);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}





if (!function_exists('ventas_insertar_cheque_desde_payload')) {
  function ventas_insertar_cheque_desde_payload(PDO $pdo, int $idMovimiento, array $mp): int
  {
    $cheque = $mp['cheque'] ?? null;
    if (!is_array($cheque)) {
      fail('No se recibieron los datos del cheque para persistir.');
    }

    try {
      return mov_global_cheques_crear_registro($pdo, $idMovimiento, $cheque, null, true);
    } catch (Throwable $e) {
      fail($e->getMessage());
    }
  }
}


/* =========================================================
   HELPERS LEGACY DETALLE
   movimientos.id_stock_producto -> FK a detalles.id_detalle
========================================================= */
if (!function_exists('ventas_detalle_exists')) {
  function ventas_detalle_exists(PDO $pdo, int $idDetalle): bool
  {
    if ($idDetalle <= 0) return false;

    try {
      $st = $pdo->prepare("
        SELECT 1
        FROM detalles
        WHERE id_detalle = :id_detalle
        LIMIT 1
      ");
      $st->execute([':id_detalle' => $idDetalle]);
      return (bool)$st->fetchColumn();
    } catch (Throwable $e) {
      return false;
    }
  }
}

if (!function_exists('ventas_resolver_id_detalle_legado')) {
  function ventas_resolver_id_detalle_legado(
    PDO $pdo,
    array $src = [],
    ?array $fallbackMovimiento = null,
    ?array $fallbackItem = null
  ): ?int {
    $candidatos = [
      $src['id_detalle'] ?? null,
      $src['legacy_id_detalle'] ?? null,
      $src['id_detalle_legacy'] ?? null,
      $src['detalle_id'] ?? null,

      $fallbackItem['id_detalle'] ?? null,

      // En movimientos.id_stock_producto vive el valor legacy (detalle)
      $fallbackMovimiento['id_stock_producto'] ?? null,
    ];

    foreach ($candidatos as $c) {
      $n = n_int($c);
      if ($n !== null && $n > 0 && ventas_detalle_exists($pdo, $n)) {
        return $n;
      }
    }

    return null;
  }
}

if (!function_exists('ventas_id_detalle_item')) {
  function ventas_id_detalle_item(): ?int
  {
    // Ventas trabaja con productos de stock. En movimientos_items el producto
    // se guarda únicamente en id_stock_producto; id_detalle no aplica.
    return null;
  }
}

/* =========================================================
   HELPERS ITEMS / MOVIMIENTOS
========================================================= */
if (!function_exists('ventas_obtener_primer_item_movimiento')) {
  function ventas_obtener_primer_item_movimiento(PDO $pdo, int $idMovimiento): ?array
  {
    $st = $pdo->prepare("
      SELECT
        id_item,
        id_movimiento,
        id_detalle,
        id_stock_producto,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
      LIMIT 1
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('ventas_obtener_movimiento_por_id')) {
  function ventas_obtener_movimiento_por_id(PDO $pdo, int $idMovimiento): ?array
  {
    $st = $pdo->prepare("
      SELECT *
      FROM movimientos
      WHERE id_movimiento = :id
      LIMIT 1
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('ventas_ajustar_stock_en_actualizacion')) {
  function ventas_ajustar_stock_en_actualizacion(PDO $pdo, ?array $itemAntes, array $itemNuevo): void
  {
    $nuevoStockProducto = (int)($itemNuevo['id_stock_producto'] ?? 0);
    $nuevoCantidad      = ventas_stock_normalizar_cantidad($itemNuevo['cantidad'] ?? 0);

    if ($nuevoStockProducto <= 0) {
      fail('El item nuevo no tiene un id_stock_producto válido para stock.');
    }

    if (!$itemAntes) {
      ventas_stock_descontar($pdo, $nuevoStockProducto, $nuevoCantidad);
      return;
    }

    $antesStockProducto = (int)($itemAntes['id_stock_producto'] ?? 0);
    $antesCantidad      = ventas_stock_normalizar_cantidad($itemAntes['cantidad'] ?? 0);

    if ($antesStockProducto === $nuevoStockProducto) {
      $delta = $nuevoCantidad - $antesCantidad;

      if ($delta > 0) {
        ventas_stock_descontar($pdo, $nuevoStockProducto, $delta);
      } elseif ($delta < 0) {
        ventas_stock_reponer($pdo, $nuevoStockProducto, abs($delta));
      }
      return;
    }

    if ($antesStockProducto > 0) {
      ventas_stock_reponer($pdo, $antesStockProducto, $antesCantidad);
    }
    ventas_stock_descontar($pdo, $nuevoStockProducto, $nuevoCantidad);
  }
}

/* =========================================================
   HELPERS AUDITORÍA DEBUG
========================================================= */
if (!function_exists('ventas_resolver_usuario_auditoria')) {
  function ventas_resolver_usuario_auditoria(PDO $pdo, array $src = []): int
  {
    $id = get_id_usuario_from_request($pdo, $src);
    if ($id > 0) return $id;

    if (!empty($_POST) && is_array($_POST)) {
      $id = get_id_usuario_from_request($pdo, $_POST);
      if ($id > 0) return $id;
    }

    $id = get_id_usuario_from_request($pdo, $_GET ?? []);
    if ($id > 0) return $id;

    return 0;
  }
}

/* =========================================================
   CREAR
========================================================= */
function ventas_crear(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = ventas_resolver_usuario_auditoria($pdo, $src);

  $v = validar_venta_or_fail($pdo, $src);

  $idDetalleVenta = ventas_id_detalle_item();

  $mediosPagoRaw   = ventas_medios_pago_raw_desde_src($src, (float)($v['monto_total'] ?? 0));
  $mediosValidados = [];
  if (!empty($mediosPagoRaw) || !empty($v['is_contado'])) {
    $mediosValidados = ventas_validar_medios_pago_multi($pdo, $mediosPagoRaw, (float)($v['monto_total'] ?? 0));
  }

  $planPago = ventas_payment_storage_plan($mediosValidados, $v['id_medio_pago'] ?? null);
  $vPersist = $v;
  $vPersist['id_medio_pago'] = $planPago['id_medio_pago'];

  try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion,
        id_tipo_venta,
        id_cliente,
        id_proveedor,
        monto_total,
        id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion,
        :id_tipo_venta,
        :id_cliente,
        :id_proveedor,
        :monto_total,
        :id_medio_pago
      )
    ");

    $stmt->execute([
      ':fecha'              => $vPersist['fecha'],
      ':id_tipo_operacion'  => $vPersist['id_tipo_operacion'],
      ':id_clasificacion'   => $vPersist['id_clasificacion'],
      ':id_tipo_venta'      => $vPersist['id_tipo_venta'],
      ':id_cliente'         => $vPersist['id_cliente'],
      ':id_proveedor'       => null,
      ':monto_total'        => $vPersist['monto_total'],
      ':id_medio_pago'      => $vPersist['id_medio_pago'],
    ]);

    $newId = (int)$pdo->lastInsertId();

    $it = $v['item'];
    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");
    $insItem->execute([
      ':id_movimiento'     => $newId,
      ':id_detalle'        => $idDetalleVenta,
      ':id_stock_producto' => $it['id_stock_producto'],
      ':cantidad'          => $it['cantidad'],
      ':precio'            => $it['precio'],
      ':iva_pct'           => $it['iva_pct'],
      ':subtotal'          => $it['subtotal'],
      ':iva_monto'         => $it['iva_monto'],
      ':total'             => $it['total'],
    ]);

    ventas_stock_descontar($pdo, (int)$it['id_stock_producto'], $it['cantidad']);

    $persistCheques    = ventas_persistir_cheques_desde_medios($pdo, $newId, $mediosValidados);
    $chequesCreados    = $persistCheques['cheques_creados'];
    $mediosPersistidos = $planPago['rows'];

    if (!empty($mediosPersistidos)) {
      foreach ($mediosPersistidos as $idx => $mp) {
        if (!empty($mediosPersistidos[$idx]['id_cheque'])) {
          continue;
        }

        $uid = (string)($mp['frontend_row_uid'] ?? '');

        if (isset($persistCheques['mapa_ids_cheque_por_index'][$idx])) {
          $mediosPersistidos[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque_por_index'][$idx];
          continue;
        }

        if ($uid !== '' && isset($persistCheques['mapa_ids_cheque'][$uid])) {
          $mediosPersistidos[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque'][$uid];
        }
      }

      ventas_insertar_medios_pago_multi($pdo, $newId, $mediosPersistidos);
    }

    $pdo->commit();

    $movGuardado  = ventas_obtener_movimiento_por_id($pdo, $newId);
    $itemGuardado = ventas_obtener_primer_item_movimiento($pdo, $newId);

    $idUsuarioAudit = ventas_resolver_usuario_auditoria($pdo, $src);

    if ($idUsuarioAudit > 0) {
      audit_safe($pdo, $idUsuarioAudit, 'crear', 'ventas', $newId, [
        'creado' => true,
        'nuevo' => [
          'movimiento' => $movGuardado ?: [
            'id_movimiento'         => $newId,
            'fecha'                 => $vPersist['fecha'],
            'id_tipo_operacion'     => $vPersist['id_tipo_operacion'],
            'id_clasificacion'      => $vPersist['id_clasificacion'],
            'id_tipo_venta'         => $vPersist['id_tipo_venta'],
            'id_cliente'            => $vPersist['id_cliente'],
            'id_proveedor'          => null,
            'id_detalle'            => $idDetalleVenta,
            'id_stock_producto'     => $vPersist['id_stock_producto'],
            'monto_total'           => $vPersist['monto_total'],
            'id_medio_pago'         => $vPersist['id_medio_pago'],
          ],
          'item' => $itemGuardado ?: $it,
          'medios_pago' => $mediosPersistidos,
          'cheques_creados' => $chequesCreados,
        ],
        'stock_descontado' => true,
        'tipo_venta_nombre' => $vPersist['tipo_venta_nombre'] ?? '',
      ]);
    }

    ok([
      'id_movimiento'   => $newId,
      'medios_pago'     => $mediosPersistidos,
      'cheques_creados' => $chequesCreados,
      'audit_debug' => [
        'idUsuario_inicial'    => $idUsuario,
        'idUsuario_auditoria'  => $idUsuarioAudit > 0 ? $idUsuarioAudit : 0,
        'audit_intentado'      => $idUsuarioAudit > 0,
        'id_detalle'           => $idDetalleVenta,
        'id_stock_producto'    => $vPersist['id_stock_producto'],
      ],
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear la venta. ' . $e->getMessage());
  }
}


/* =========================================================
   CREAR BATCH
========================================================= */
function ventas_crear_batch(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = ventas_resolver_usuario_auditoria($pdo, is_array($src) ? $src : []);

  $items = [];
  $mediosPagoRaw = [];

  if (is_array($src) && array_keys($src) === range(0, count($src) - 1)) {
    $items = $src;
  } elseif (is_array($src) && isset($src['items']) && is_array($src['items'])) {
    $items = $src['items'];
    $mediosPagoRaw = is_array($src['medios_pago'] ?? null) ? $src['medios_pago'] : [];
  }

  if (!$items || !is_array($items)) fail('Batch inválido: faltan items.');

  try {
    $pdo->beginTransaction();

    $auditPack = [];
    $validados = [];
    $montoTotalBatch = 0.0;

    foreach ($items as $i => $one) {
      if (!is_array($one)) fail("Ítem batch inválido en índice $i.");
      $v = validar_venta_or_fail($pdo, $one);
      $validados[] = $v;
      $montoTotalBatch += (float)($v['monto_total'] ?? 0);
    }

    if (empty($validados)) fail('Batch inválido: no se pudo validar ningún ítem.');

    $fechaCabeceraBatch = (string)($validados[0]['fecha'] ?? '');
    foreach ($validados as $idxVal => $vVal) {
      if ((string)($vVal['fecha'] ?? '') !== $fechaCabeceraBatch) {
        fail('Batch inválido: todas las filas de una venta deben venir con la misma fecha seleccionada en el modal.');
      }
    }

    $primer = $validados[0];
    $esContado = (bool)($primer['is_contado'] ?? false);

    $mediosValidados = [];
    if ($esContado) {
      $mediosPagoRaw = !empty($mediosPagoRaw)
        ? $mediosPagoRaw
        : ventas_medios_pago_raw_desde_src((array)$primer, $montoTotalBatch);

      $mediosValidados = ventas_validar_medios_pago_multi($pdo, $mediosPagoRaw, $montoTotalBatch);
    }

    $planPago = ventas_payment_storage_plan($mediosValidados, $primer['id_medio_pago'] ?? null);

    // IMPORTANTE:
    // El batch representa UNA venta con varios productos.
    // Por eso se crea un solo registro cabecera en movimientos y luego un item por producto.
    $cabecera = $primer;
    $cabecera['monto_total'] = $montoTotalBatch;
    $cabecera['id_medio_pago'] = $planPago['id_medio_pago'];

    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion,
        id_tipo_venta,
        id_cliente,
        id_proveedor,
        monto_total,
        id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion,
        :id_tipo_venta,
        :id_cliente,
        :id_proveedor,
        :monto_total,
        :id_medio_pago
      )
    ");
    $stmt->execute([
      ':fecha'              => $cabecera['fecha'],
      ':id_tipo_operacion'  => $cabecera['id_tipo_operacion'],
      ':id_clasificacion'   => $cabecera['id_clasificacion'],
      ':id_tipo_venta'      => $cabecera['id_tipo_venta'],
      ':id_cliente'         => $cabecera['id_cliente'],
      ':id_proveedor'       => null,
      ':monto_total'        => $cabecera['monto_total'],
      ':id_medio_pago'      => $cabecera['id_medio_pago'],
    ]);

    $newId = (int)$pdo->lastInsertId();
    if ($newId <= 0) fail('No se pudo obtener el ID de la venta creada.');

    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");

    foreach ($validados as $v) {
      $idDetalleVenta = ventas_id_detalle_item();
      $it = $v['item'];

      $insItem->execute([
        ':id_movimiento'     => $newId,
        ':id_detalle'        => $idDetalleVenta,
        ':id_stock_producto' => $it['id_stock_producto'],
        ':cantidad'          => $it['cantidad'],
        ':precio'            => $it['precio'],
        ':iva_pct'           => $it['iva_pct'],
        ':subtotal'          => $it['subtotal'],
        ':iva_monto'         => $it['iva_monto'],
        ':total'             => $it['total'],
      ]);

      ventas_stock_descontar($pdo, (int)$it['id_stock_producto'], $it['cantidad']);

      $auditPack[] = [
        'id'                => $newId,
        'fecha'             => $cabecera['fecha'],
        'id_tipo_operacion' => $cabecera['id_tipo_operacion'],
        'id_cliente'        => $cabecera['id_cliente'],
        'id_tipo_venta'     => $cabecera['id_tipo_venta'],
        'tipo_venta_nombre' => $cabecera['tipo_venta_nombre'] ?? null,
        'id_medio_pago'     => $cabecera['id_medio_pago'],
        'id_detalle'        => $idDetalleVenta,
        'id_stock_producto' => $v['id_stock_producto'],
        'monto_total'       => $it['total'],
        'item'              => $it,
      ];
    }

    $mediosPersistidos = $planPago['rows'];
    $chequesCreados = [];

    $persistCheques = ventas_persistir_cheques_desde_medios($pdo, $newId, $mediosValidados);
    $chequesCreados = $persistCheques['cheques_creados'];

    if (!empty($mediosPersistidos)) {
      foreach ($mediosPersistidos as $idx => $mp) {
        if (!empty($mediosPersistidos[$idx]['id_cheque'])) {
          continue;
        }

        $uid = (string)($mp['frontend_row_uid'] ?? '');

        if (isset($persistCheques['mapa_ids_cheque_por_index'][$idx])) {
          $mediosPersistidos[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque_por_index'][$idx];
          continue;
        }

        if ($uid !== '' && isset($persistCheques['mapa_ids_cheque'][$uid])) {
          $mediosPersistidos[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque'][$uid];
        }
      }

      ventas_insertar_medios_pago_multi($pdo, $newId, $mediosPersistidos);
    }

    $pdo->commit();

    $idUsuarioAudit = ventas_resolver_usuario_auditoria($pdo, is_array($src) ? $src : []);

    if ($idUsuarioAudit > 0) {
      audit_safe($pdo, $idUsuarioAudit, 'crear_batch', 'ventas', $newId, [
        'cantidad_movimientos' => 1,
        'cantidad_items'       => count($auditPack),
        'ids'                  => [$newId],
        'id_movimiento'        => $newId,
        'monto_total'          => $montoTotalBatch,
        'items'                => $auditPack,
        'medios_pago'          => $mediosPersistidos,
        'cheques_creados'      => $chequesCreados,
      ]);
    }

    ok([
      'creados'          => 1,
      'items_creados'    => count($auditPack),
      'id_movimiento'    => $newId,
      'ids'              => [$newId],
      'ids_movimiento'   => [$newId],
      'ids_movimientos'  => [$newId],
      'monto_total'      => $montoTotalBatch,
      'medios_pago'      => $mediosPersistidos,
      'cheques_creados'  => $chequesCreados,
      'audit_debug' => [
        'idUsuario_inicial'    => $idUsuario,
        'idUsuario_auditoria'  => $idUsuarioAudit > 0 ? $idUsuarioAudit : 0,
        'audit_intentado'      => $idUsuarioAudit > 0,
      ],
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo crear el batch de ventas. ' . $e->getMessage());
  }
}

/* =========================================================
   ACTUALIZAR
========================================================= */
function ventas_actualizar(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = ventas_resolver_usuario_auditoria($pdo, $src);

  $id_movimiento = n_int($src['id_movimiento'] ?? null);
  if (!$id_movimiento) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id_movimiento]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La venta no existe: ' . $id_movimiento);

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idVenta) {
    fail('Este movimiento no es una venta (tipo_operacion).');
  }

  $itemAntes = ventas_obtener_primer_item_movimiento($pdo, $id_movimiento);

  $merge = $src;
  foreach ([
    'fecha',
    'id_clasificacion',
    'id_tipo_venta',
    'id_medio_pago',
    'id_cliente',
    'monto_total',
    'cantidad',
    'precio',
    'iva_pct',
    'subtotal',
    'iva_monto',
    'total'
  ] as $k) {
    if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
      $merge[$k] = $before[$k];
    }
  }

  if ($itemAntes) {
    foreach (['id_stock_producto', 'cantidad', 'precio', 'iva_pct', 'subtotal', 'iva_monto', 'total'] as $k) {
      if (!array_key_exists($k, $merge) || $merge[$k] === null || $merge[$k] === '') {
        if (array_key_exists($k, $itemAntes)) {
          $merge[$k] = $itemAntes[$k];
        }
      }
    }
  }

  $v = validar_venta_or_fail($pdo, $merge);

  $idDetalleVenta = ventas_id_detalle_item();

  try {
    $pdo->beginTransaction();

    $upd = $pdo->prepare("
      UPDATE movimientos SET
        fecha             = :fecha,
        id_tipo_operacion = :id_tipo_operacion,
        id_clasificacion  = :id_clasificacion,
        id_tipo_venta     = :id_tipo_venta,
        id_cliente        = :id_cliente,
        id_proveedor      = NULL,
        monto_total       = :monto_total,
        id_medio_pago     = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ");
    $upd->execute([
      ':fecha'              => $v['fecha'],
      ':id_tipo_operacion'  => $v['id_tipo_operacion'],
      ':id_clasificacion'   => $v['id_clasificacion'],
      ':id_tipo_venta'      => $v['id_tipo_venta'],
      ':id_cliente'         => $v['id_cliente'],
      ':monto_total'        => $v['monto_total'],
      ':id_medio_pago'      => $v['id_medio_pago'],
      ':id_movimiento'      => $id_movimiento,
    ]);

    $it = $v['item'];

    ventas_ajustar_stock_en_actualizacion($pdo, $itemAntes, $it);

    if ($itemAntes && !empty($itemAntes['id_item'])) {
      $id_item = (int)$itemAntes['id_item'];

      $updItem = $pdo->prepare("
        UPDATE movimientos_items SET
          id_detalle        = :id_detalle,
          id_stock_producto = :id_stock_producto,
          cantidad          = :cantidad,
          precio            = :precio,
          iva_pct           = :iva_pct,
          subtotal          = :subtotal,
          iva_monto         = :iva_monto,
          total             = :total
        WHERE id_item = :id_item
        LIMIT 1
      ");
      $updItem->execute([
        ':id_detalle'        => $idDetalleVenta,
        ':id_stock_producto' => $it['id_stock_producto'],
        ':cantidad'          => $it['cantidad'],
        ':precio'            => $it['precio'],
        ':iva_pct'           => $it['iva_pct'],
        ':subtotal'          => $it['subtotal'],
        ':iva_monto'         => $it['iva_monto'],
        ':total'             => $it['total'],
        ':id_item'           => $id_item,
      ]);
    } else {
      $ins = $pdo->prepare("
        INSERT INTO movimientos_items
          (id_movimiento, id_detalle, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
        VALUES
          (:id_movimiento, :id_detalle, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
      ");
      $ins->execute([
        ':id_movimiento'     => $id_movimiento,
        ':id_detalle'        => $idDetalleVenta,
        ':id_stock_producto' => $it['id_stock_producto'],
        ':cantidad'          => $it['cantidad'],
        ':precio'            => $it['precio'],
        ':iva_pct'           => $it['iva_pct'],
        ':subtotal'          => $it['subtotal'],
        ':iva_monto'         => $it['iva_monto'],
        ':total'             => $it['total'],
      ]);
    }

    $pdo->commit();

    $afterSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $afterSt->execute([':id' => $id_movimiento]);
    $after = $afterSt->fetch(PDO::FETCH_ASSOC);

    $idUsuarioAudit = ventas_resolver_usuario_auditoria($pdo, $src);

    if ($idUsuarioAudit > 0) {
      audit_safe($pdo, $idUsuarioAudit, 'actualizar', 'ventas', $id_movimiento, [
        'antes'             => $before,
        'despues'           => $after ?: null,
        'item_antes'        => $itemAntes,
        'item'              => $it,
        'id_detalle'        => $idDetalleVenta,
      ]);
    }

    ok([
      'actualizado'   => true,
      'id_movimiento' => $id_movimiento,
      'audit_debug' => [
        'idUsuario_inicial'    => $idUsuario,
        'idUsuario_auditoria'  => $idUsuarioAudit,
        'audit_intentado'      => $idUsuarioAudit > 0,
        'id_detalle'           => $idDetalleVenta,
        'id_stock_producto'    => $v['id_stock_producto'],
      ],
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar la venta. ' . $e->getMessage());
  }
}