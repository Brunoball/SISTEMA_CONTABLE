<?php
// backend/modules/movimientos/compras/guardar.php
declare(strict_types=1);

require_once __DIR__ . '/../core/shared_db.php';
require_once __DIR__ . '/../core/plan_saas.php';
require_once __DIR__ . '/../global/cheques.php';
require_once __DIR__ . '/../global/medios_pago.php';

/* =========================================================
   HELPERS CHEQUES PARA COMPRAS
========================================================= */
if (!function_exists('compra_text_norm')) {
  function compra_text_norm(string $s): string
  {
    $s = trim(mb_strtolower($s, 'UTF-8'));
    $map = [
      'á'=>'a','à'=>'a','ä'=>'a','â'=>'a',
      'é'=>'e','è'=>'e','ë'=>'e','ê'=>'e',
      'í'=>'i','ì'=>'i','ï'=>'i','î'=>'i',
      'ó'=>'o','ò'=>'o','ö'=>'o','ô'=>'o',
      'ú'=>'u','ù'=>'u','ü'=>'u','û'=>'u',
      'ñ'=>'n',
    ];
    $s = strtr($s, $map);
    return preg_replace('/\s+/', ' ', $s) ?? $s;
  }
}

if (!function_exists('compra_parse_id_list')) {
  function compra_parse_id_list($raw): array
  {
    if (is_array($raw)) {
      $vals = $raw;
    } else {
      $txt = trim((string)$raw);
      if ($txt === '') return [];
      $json = json_decode($txt, true);
      if (is_array($json)) $vals = $json;
      else $vals = preg_split('/[,\s]+/', $txt) ?: [];
    }

    $ids = [];
    foreach ($vals as $v) {
      if (is_numeric($v)) {
        $n = (int)$v;
        if ($n > 0) $ids[] = $n;
      }
    }

    return array_values(array_unique($ids));
  }
}

if (!function_exists('compra_detect_medio_pago_tipo_cheque')) {
  function compra_detect_medio_pago_tipo_cheque(string $nombre): ?string
  {
    return mv_medios_pago_detect_tipo_cheque($nombre);
  }
}





if (!function_exists('compra_get_medio_pago_row')) {
  function compra_get_medio_pago_row(PDO $pdo, int $idMedioPago): ?array
  {
    return mv_medios_pago_get_row($pdo, $idMedioPago);
  }
}





/* =========================================================
   HELPERS STOCK PARA COMPRAS
========================================================= */
if (!function_exists('compra_stock_producto_lock')) {
  function compra_stock_producto_lock(PDO $pdo, int $idProducto): ?array
  {
    if ($idProducto <= 0) return null;

    $st = $pdo->prepare("
      SELECT id_stock_producto, nombre, stock
      FROM stock_productos
      WHERE id_stock_producto = :id
      LIMIT 1
      FOR UPDATE
    ");
    $st->execute([':id' => $idProducto]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('compra_stock_normalizar_cantidad')) {
  function compra_stock_normalizar_cantidad($cantidadRaw): int
  {
    $cantidad = (float)$cantidadRaw;

    if (!is_finite($cantidad) || $cantidad <= 0) {
      compra_fail('La cantidad del producto debe ser mayor a 0 para actualizar stock.');
    }

    $cantidadInt = (int)round($cantidad);

    if ($cantidadInt <= 0) {
      compra_fail('La cantidad del producto normalizada para stock quedó inválida.');
    }

    return $cantidadInt;
  }
}

if (!function_exists('compra_stock_ajustar_producto')) {
  function compra_stock_ajustar_producto(PDO $pdo, int $idProducto, int $delta): void
  {
    if ($idProducto <= 0 || $delta === 0) return;

    $producto = compra_stock_producto_lock($pdo, $idProducto);
    if (!$producto) {
      compra_fail("No existe el producto de stock con ID {$idProducto}.");
    }

    $stockActual = (int)round((float)($producto['stock'] ?? 0));
    $nuevoStock  = $stockActual + $delta;

    if ($nuevoStock < 0) {
      compra_fail("El stock del producto ID {$idProducto} quedaría negativo al actualizar la compra.");
    }

    $upd = $pdo->prepare("
      UPDATE stock_productos
      SET stock = :stock
      WHERE id_stock_producto = :id
      LIMIT 1
    ");
    $upd->execute([
      ':stock' => $nuevoStock,
      ':id'    => $idProducto,
    ]);
  }
}

if (!function_exists('compra_stock_sumar_desde_validado')) {
  function compra_stock_sumar_desde_validado(PDO $pdo, array $v): void
  {
    $idProducto = (int)($v['id_stock_producto'] ?? $v['item']['id_stock_producto'] ?? $v['id_detalle'] ?? $v['item']['id_detalle'] ?? 0);
    $cantidad   = compra_stock_normalizar_cantidad($v['item']['cantidad'] ?? 0);

    if ($idProducto <= 0) {
      compra_fail('No se pudo actualizar stock: falta id_stock_producto/id de producto.');
    }

    compra_stock_ajustar_producto($pdo, $idProducto, $cantidad);
  }
}

if (!function_exists('compra_get_primer_item_movimiento_for_update')) {
  function compra_get_primer_item_movimiento_for_update(PDO $pdo, int $idMovimiento): ?array
  {
    if ($idMovimiento <= 0) return null;

    $st = $pdo->prepare("
      SELECT *
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
      LIMIT 1
      FOR UPDATE
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('compra_stock_recalcular_desde_update')) {
  function compra_stock_recalcular_desde_update(PDO $pdo, ?array $beforeItem, array $v): void
  {
    $newId  = (int)($v['item']['id_stock_producto'] ?? $v['id_stock_producto'] ?? 0);
    $newQty = compra_stock_normalizar_cantidad($v['item']['cantidad'] ?? 0);

    $oldId  = (int)($beforeItem['id_stock_producto'] ?? 0);
    $oldQty = $beforeItem ? compra_stock_normalizar_cantidad($beforeItem['cantidad'] ?? 0) : 0;

    if ($oldId > 0 && $oldId === $newId) {
      $delta = $newQty - $oldQty;
      if ($delta !== 0) {
        compra_stock_ajustar_producto($pdo, $newId, $delta);
      }
      return;
    }

    if ($oldId > 0 && $oldQty > 0) {
      compra_stock_ajustar_producto($pdo, $oldId, -$oldQty);
    }

    if ($newId > 0 && $newQty > 0) {
      compra_stock_ajustar_producto($pdo, $newId, $newQty);
    }
  }
}

/* =========================================================
   LISTAR CHEQUES EN CARTERA
========================================================= */
if (!function_exists('compras_cheques_cartera_listar')) {
  function compras_cheques_cartera_listar(PDO $pdo): void
  {
    $tipo = strtolower(trim((string)($_GET['tipo'] ?? '')));
    if ($tipo !== '' && !in_array($tipo, ['cheque', 'echeq'], true)) {
      compra_fail('Tipo de cheque inválido.', 400);
    }

    $includeIds = compra_parse_id_list($_GET['include_ids'] ?? '');
    $params = [];
    $where  = [];

    if ($tipo !== '') {
      $where[] = "mc.tipo = :tipo";
      $params[':tipo'] = $tipo;
    }

    if (!empty($includeIds)) {
      $namedIds = [];
      foreach ($includeIds as $i => $idInc) {
        $ph = ':inc_' . $i;
        $namedIds[] = $ph;
        $params[$ph] = (int)$idInc;
      }
      $where[] = "(mc.activo = 1 OR mc.id_cheque IN (" . implode(',', $namedIds) . "))";
    } else {
      $where[] = "mc.activo = 1";
    }

    $sql = "
      SELECT mc.id_cheque, mc.tipo, mc.id_movimiento, mc.id_comprobante,
             mc.fecha_emision, mc.emisor, mc.numero_cheque, mc.importe,
             mc.fecha_pago, mc.activo, mc.created_at, mc.updated_at,
             COALESCE(ca.archivo_url,'')  AS comprobante_url,
             COALESCE(ca.archivo_path,'') AS comprobante_path
      FROM movimientos_cheques mc
      LEFT JOIN comprobantes_archivos ca ON ca.id_comprobante = mc.id_comprobante
      WHERE " . implode(' AND ', $where) . "
      ORDER BY mc.fecha_pago ASC, mc.fecha_emision ASC, mc.id_cheque DESC
    ";

    $st = $pdo->prepare($sql);

    foreach ($params as $k => $v) {
      if ($k === ':tipo') {
        $st->bindValue($k, $v, PDO::PARAM_STR);
      } else {
        $st->bindValue($k, (int)$v, PDO::PARAM_INT);
      }
    }

    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $includeMap = array_fill_keys($includeIds, true);

    $data = array_map(static function(array $r) use ($includeMap): array {
      $idCheque = (int)($r['id_cheque'] ?? 0);
      return [
        'id_cheque'           => $idCheque,
        'tipo'                => (string)($r['tipo'] ?? ''),
        'id_movimiento'       => (int)($r['id_movimiento'] ?? 0),
        'id_comprobante'      => $r['id_comprobante'] === null ? null : (int)$r['id_comprobante'],
        'fecha_emision'       => (string)($r['fecha_emision'] ?? ''),
        'emisor'              => (string)($r['emisor'] ?? ''),
        'numero_cheque'       => (string)($r['numero_cheque'] ?? ''),
        'importe'             => (float)($r['importe'] ?? 0),
        'fecha_pago'          => (string)($r['fecha_pago'] ?? ''),
        'activo'              => (int)($r['activo'] ?? 0),
        'seleccionado_actual' => isset($includeMap[$idCheque]),
        'comprobante_url'     => (string)($r['comprobante_url'] ?? ''),
        'comprobante_path'    => (string)($r['comprobante_path'] ?? ''),
        'created_at'          => (string)($r['created_at'] ?? ''),
        'updated_at'          => (string)($r['updated_at'] ?? ''),
      ];
    }, $rows);

    compra_ok([
      'cheques'     => $data,
      'tipo'        => $tipo,
      'include_ids' => $includeIds,
    ]);
  }
}

/* =========================================================
   HELPERS MULTI-MEDIO DE PAGO
========================================================= */
if (!function_exists('compra_medios_pago_raw_desde_src')) {
  function compra_medios_pago_raw_desde_src(array $src, float $montoTotal): array
  {
    return mv_medios_pago_raw_desde_src($src, $montoTotal);
  }
}





if (!function_exists('compra_validar_medios_pago_multi')) {
  function compra_validar_medios_pago_multi(PDO $pdo, array $mediosPagoRaw, float $montoTotalEsperado): array
  {
    try {
      return mv_medios_pago_validar_multi($pdo, $mediosPagoRaw, $montoTotalEsperado, [
        'modo'          => 'salida',
        'empty_message' => 'Compra contado: debés indicar al menos un medio de pago.',
        'total_label'   => 'la compra',
      ]);
    } catch (Throwable $e) {
      compra_fail($e->getMessage(), stripos($e->getMessage(), 'plan') !== false ? 403 : 200);
    }
  }
}





if (!function_exists('compra_lock_cheques_multi')) {
  function compra_lock_cheques_multi(PDO $pdo, array $mediosValidados): array
  {
    try {
      return mv_medios_pago_lock_cheques_salida($pdo, $mediosValidados);
    } catch (Throwable $e) {
      compra_fail($e->getMessage(), 400);
    }
  }
}





if (!function_exists('compra_dar_baja_cheques_multi')) {
  function compra_dar_baja_cheques_multi(PDO $pdo, array $mediosValidados): void
  {
    try {
      mv_medios_pago_dar_baja_cheques_salida($pdo, $mediosValidados);
    } catch (Throwable $e) {
      compra_fail($e->getMessage(), 400);
    }
  }
}





if (!function_exists('compra_registrar_flujo_salida_cheque')) {
  function compra_registrar_flujo_salida_cheque(PDO $pdo, int $idMovimiento, array $mp): void
  {
    mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mp);
  }
}





if (!function_exists('compra_reactivar_cheques_por_ids')) {
  function compra_reactivar_cheques_por_ids(PDO $pdo, array $chequeIds): void
  {
    mv_medios_pago_reactivar_cheques_por_ids($pdo, $chequeIds);
  }
}





if (!function_exists('compra_liberar_vinculo_origen_cheques_en_medios_pago')) {
  function compra_liberar_vinculo_origen_cheques_en_medios_pago(PDO $pdo, array $chequeIds): void
  {
    mv_medios_pago_liberar_vinculo_origen_cheques($pdo, $chequeIds);
  }
}





if (!function_exists('compra_insertar_medios_pago_multi')) {
  function compra_insertar_medios_pago_multi(PDO $pdo, int $idMovimiento, array $mediosValidados): void
  {
    try {
      mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosValidados, [
        'contexto'                 => 'compra',
        'salida_cheque'            => true,
        'registrar_flujo_salida'   => true,
      ]);
    } catch (Throwable $e) {
      throw $e;
    }
  }
}





if (!function_exists('compra_medios_pago_movimiento_for_update')) {
  function compra_medios_pago_movimiento_for_update(PDO $pdo, int $idMovimiento): array
  {
    return mv_medios_pago_movimiento_for_update($pdo, $idMovimiento);
  }
}





if (!function_exists('compra_eliminar_medios_pago_movimiento')) {
  function compra_eliminar_medios_pago_movimiento(PDO $pdo, int $idMovimiento): void
  {
    mv_medios_pago_eliminar_por_movimiento($pdo, $idMovimiento, ['borrar_flujo_salida' => true]);
  }
}





/* =========================================================
   CREAR (compra individual)
========================================================= */
if (!function_exists('compras_crear')) {
  function compras_crear(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') compra_fail('Método no permitido.', 405);

    $body = compra_read_json_body();
    $src  = !empty($body) ? $body : ($_POST ?? []);

    $maybeId = compra_n_int($src['id_movimiento'] ?? null);
    if ($maybeId !== null && $maybeId > 0) {
      compras_actualizar($pdo);
      return;
    }

    $idUsuario = compra_resolver_usuario_auditoria($pdo, $src);
    $v         = compra_validar_o_fallar($pdo, $src);

    $esPagada      = (bool)($v['es_pagada'] ?? false);
    $mediosPagoRaw = compra_medios_pago_raw_desde_src($src, (float)($v['monto_total'] ?? 0));

    $mediosValidados = [];
    if ($esPagada) {
      $mediosValidados = compra_validar_medios_pago_multi($pdo, $mediosPagoRaw, (float)($v['monto_total'] ?? 0));
    }

    $planPago = mvx_payment_storage_plan($mediosValidados, $v['id_medio_pago'] ?? null);
    $vPersist = $v;
    $vPersist['id_medio_pago'] = $planPago['id_medio_pago'];

    try {
      $pdo->beginTransaction();

      if (!empty($mediosValidados)) {
        compra_lock_cheques_multi($pdo, $mediosValidados);
      }

      $newId = compra_insertar_movimiento($pdo, $vPersist);
      compra_insertar_item($pdo, $newId, $v['item']);
      compra_stock_sumar_desde_validado($pdo, $v);

      if (!empty($planPago['rows'])) {
        compra_insertar_medios_pago_multi($pdo, $newId, $planPago['rows']);
      }
      if (!empty($mediosValidados)) {
        compra_dar_baja_cheques_multi($pdo, $mediosValidados);
      }

      $pdo->commit();

      $movGuardado    = compra_obtener_movimiento_por_id($pdo, $newId);
      $itemGuardado   = compra_obtener_primer_item_movimiento($pdo, $newId);
      $mediosGuardado = compra_obtener_medios_pago_movimiento($pdo, $newId);

      $idUsuarioAudit = compra_resolver_usuario_auditoria($pdo, $src);

      compra_auditar_seguro($pdo, $idUsuarioAudit, 'crear', 'compras', $newId, [
        'creado' => true,
        'nuevo' => [
          'movimiento'   => $movGuardado ?: [
            'id_movimiento'     => $newId,
            'fecha'             => $v['fecha'],
            'id_tipo_operacion' => $v['id_tipo_operacion'],
            'id_clasificacion'  => $v['id_clasificacion'],
            'id_tipo_venta'     => $v['id_tipo_venta'],
            'id_cliente'        => null,
            'id_proveedor'      => $v['id_proveedor'],
            'id_stock_producto' => $v['id_stock_producto'],
            'monto_total'       => $v['monto_total'],
            'id_medio_pago'     => $v['id_medio_pago'],
          ],
          'item'         => $itemGuardado ?: $v['item'],
          'medios_pago'  => !empty($mediosGuardado) ? $mediosGuardado : $mediosValidados,
        ],
        'stock_actualizado' => true,
      ]);

      compra_ok([
        'id_movimiento'      => $newId,
        'medios_pago'        => count($mediosValidados),
        'cheques_usados'     => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
        'stock_actualizado'  => true,
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit,
          'audit_intentado'      => $idUsuarioAudit > 0,
        ],
      ]);

    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      compra_fail('No se pudo crear la compra. ' . $e->getMessage());
    }
  }
}

/* =========================================================
   CREAR BATCH
========================================================= */
if (!function_exists('compras_crear_batch')) {
  function compras_crear_batch(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') compra_fail('Método no permitido.', 405);

    $body = compra_read_json_body();
    $src  = !empty($body) ? $body : ($_POST ?? []);

    $idUsuario = compra_resolver_usuario_auditoria($pdo, is_array($src) ? $src : []);

    $items         = [];
    $mediosPagoRaw = [];

    if (is_array($src) && isset($src['items']) && is_array($src['items'])) {
      $items         = $src['items'];
      $mediosPagoRaw = is_array($src['medios_pago'] ?? null) ? $src['medios_pago'] : [];
    } elseif (is_array($src) && array_keys($src) === range(0, count($src) - 1)) {
      $items = $src;
      foreach ($src as $one) {
        if (is_array($one) && !empty($one['medios_pago']) && is_array($one['medios_pago'])) {
          $mediosPagoRaw = $one['medios_pago'];
          break;
        }
      }
    }

    if (!$items || !is_array($items)) compra_fail('Batch inválido: faltan items.');

    try {
      $pdo->beginTransaction();

      $validados = [];
      $montoTotalBatch = 0.0;

      foreach ($items as $i => $one) {
        if (!is_array($one)) compra_fail("Ítem batch inválido en índice $i.");
        $v = compra_validar_o_fallar($pdo, $one);
        $validados[]      = $v;
        $montoTotalBatch += (float)($v['monto_total'] ?? 0);
      }

      if (empty($validados)) compra_fail('Batch inválido: no se pudo validar ningún ítem.');

      $primer   = $validados[0];
      $esPagada = (bool)($primer['es_pagada'] ?? false);

      $mediosValidados = [];
      if ($esPagada) {
        $mediosValidados = compra_validar_medios_pago_multi($pdo, $mediosPagoRaw, $montoTotalBatch);
        compra_lock_cheques_multi($pdo, $mediosValidados);
      }

      $planPago = mvx_payment_storage_plan($mediosValidados, $primer['id_medio_pago'] ?? null);

      // IMPORTANTE:
      // El batch representa UNA compra con varios productos.
      // Por eso se crea un solo movimiento cabecera y luego un item por producto.
      $cabecera = $primer;
      $cabecera['monto_total'] = $montoTotalBatch;
      $cabecera['id_medio_pago'] = $planPago['id_medio_pago'];

      $newId = compra_insertar_movimiento($pdo, $cabecera);
      if ($newId <= 0) compra_fail('No se pudo obtener el ID de la compra creada.');

      $auditPack = [];
      foreach ($validados as $v) {
        compra_insertar_item($pdo, $newId, $v['item']);
        compra_stock_sumar_desde_validado($pdo, $v);

        $auditPack[] = [
          'id'             => $newId,
          'fecha'          => $cabecera['fecha'],
          'id_tipo_venta'  => $cabecera['id_tipo_venta'],
          'id_proveedor'   => $cabecera['id_proveedor'],
          'monto_total'    => $v['monto_total'],
          'item'           => $v['item'],
        ];
      }

      if (!empty($planPago['rows'])) {
        compra_insertar_medios_pago_multi($pdo, $newId, $planPago['rows']);
      }

      if (!empty($mediosValidados)) {
        compra_dar_baja_cheques_multi($pdo, $mediosValidados);
      }

      $pdo->commit();

      $idUsuarioAudit = compra_resolver_usuario_auditoria($pdo, is_array($src) ? $src : []);

      compra_auditar_seguro($pdo, $idUsuarioAudit, 'crear_batch', 'compras', $newId, [
        'cantidad_movimientos' => 1,
        'cantidad_items'       => count($auditPack),
        'ids'                  => [$newId],
        'id_movimiento'        => $newId,
        'monto_total'          => $montoTotalBatch,
        'items'                => $auditPack,
        'medios_pago'          => $mediosValidados,
        'stock_actualizado'    => true,
      ]);

      compra_ok([
        'exito'             => true,
        'creados'           => 1,
        'items_creados'     => count($auditPack),
        'id_movimiento'     => $newId,
        'ids'               => [$newId],
        'ids_movimiento'    => [$newId],
        'ids_movimientos'   => [$newId],
        'monto_total'       => $montoTotalBatch,
        'medios_pago'       => count($mediosValidados),
        'cheques_usados'    => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
        'stock_actualizado' => true,
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit,
          'audit_intentado'      => $idUsuarioAudit > 0,
        ],
      ]);

    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      compra_fail('No se pudo crear el batch de compras. ' . $e->getMessage());
    }
  }
}

/* =========================================================
   ACTUALIZAR
   - Soporta medios múltiples
   - Soporta cheques / eCheqs
   - Recalcula delta de stock
========================================================= */
if (!function_exists('compras_actualizar')) {
  function compras_actualizar(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') compra_fail('Método no permitido.', 405);

    $body = compra_read_json_body();
    $src  = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = compra_resolver_usuario_auditoria($pdo, $src);

    $id_movimiento = compra_n_int($src['id_movimiento'] ?? null);
    if (!$id_movimiento) compra_fail('Falta id_movimiento.');

    try {
      $pdo->beginTransaction();

      $beforeSt = $pdo->prepare("
        SELECT *
        FROM movimientos
        WHERE id_movimiento = :id
        LIMIT 1
        FOR UPDATE
      ");
      $beforeSt->execute([':id' => $id_movimiento]);
      $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
      if (!$before) compra_fail('La compra no existe: ' . $id_movimiento);

      $idCompra = compra_get_tipo_operacion_id($pdo);
      if ($idCompra <= 0) compra_fail("No existe el tipo_operacion 'COMPRA'.");
      if ((int)($before['id_tipo_operacion'] ?? 0) !== $idCompra) compra_fail('Este movimiento no es una compra.');

      $beforeItem   = compra_get_primer_item_movimiento_for_update($pdo, $id_movimiento);
      $beforeMedios = compra_medios_pago_movimiento_for_update($pdo, $id_movimiento);
      $beforeChequeIds = array_values(array_unique(array_filter(array_map(
        static fn(array $x): int => isset($x['id_cheque']) && $x['id_cheque'] !== null ? (int)$x['id_cheque'] : 0,
        $beforeMedios
      ))));

      $merge = $src;
      foreach ([
        'id_clasificacion','id_tipo_venta','id_medio_pago','id_proveedor',
        'id_stock_producto','id_detalle','monto_total','cantidad','precio','iva_pct',
        'subtotal','iva_monto','total'
      ] as $k) {
        if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
          $merge[$k] = $before[$k];
        }
      }

      if (!array_key_exists('cantidad', $merge) && $beforeItem && array_key_exists('cantidad', $beforeItem)) {
        $merge['cantidad'] = $beforeItem['cantidad'];
      }
      if (!array_key_exists('precio', $merge) && $beforeItem && array_key_exists('precio', $beforeItem)) {
        $merge['precio'] = $beforeItem['precio'];
      }
      if (!array_key_exists('iva_pct', $merge) && $beforeItem && array_key_exists('iva_pct', $beforeItem)) {
        $merge['iva_pct'] = $beforeItem['iva_pct'];
      }
      if (!array_key_exists('subtotal', $merge) && $beforeItem && array_key_exists('subtotal', $beforeItem)) {
        $merge['subtotal'] = $beforeItem['subtotal'];
      }
      if (!array_key_exists('iva_monto', $merge) && $beforeItem && array_key_exists('iva_monto', $beforeItem)) {
        $merge['iva_monto'] = $beforeItem['iva_monto'];
      }
      if (!array_key_exists('total', $merge) && $beforeItem && array_key_exists('total', $beforeItem)) {
        $merge['total'] = $beforeItem['total'];
      }
      if (!array_key_exists('id_detalle', $merge) && $beforeItem && array_key_exists('id_stock_producto', $beforeItem)) {
        $merge['id_detalle'] = $beforeItem['id_stock_producto'];
      }

      $v = compra_validar_o_fallar($pdo, $merge);

      $esPagada      = (bool)($v['es_pagada'] ?? false);
      $mediosPagoRaw = compra_medios_pago_raw_desde_src($src, (float)($v['monto_total'] ?? 0));
      $mediosValidados = [];

      if ($esPagada) {
        if (!empty($beforeChequeIds)) {
          compra_reactivar_cheques_por_ids($pdo, $beforeChequeIds);
        }

        $mediosValidados = compra_validar_medios_pago_multi($pdo, $mediosPagoRaw, (float)($v['monto_total'] ?? 0));
        if (!empty($mediosValidados)) {
          compra_lock_cheques_multi($pdo, $mediosValidados);
        }
      }

      $planPago = mvx_payment_storage_plan($mediosValidados, $v['id_medio_pago'] ?? null);
      compra_eliminar_medios_pago_movimiento($pdo, $id_movimiento);

      $upd = $pdo->prepare("
        UPDATE movimientos SET
          fecha = :fecha,
          id_tipo_operacion = :id_tipo_operacion,
          id_clasificacion = :id_clasificacion,
          id_tipo_venta = :id_tipo_venta,
          id_cliente = NULL,
          id_proveedor = :id_proveedor,
          monto_total = :monto_total,
          id_medio_pago = :id_medio_pago
        WHERE id_movimiento = :id_movimiento
        LIMIT 1
      ");
      $upd->execute([
        ':fecha'             => $v['fecha'],
        ':id_tipo_operacion' => $v['id_tipo_operacion'],
        ':id_clasificacion'  => $v['id_clasificacion'],
        ':id_tipo_venta'     => $v['id_tipo_venta'],
        ':id_proveedor'      => $v['id_proveedor'],
        ':monto_total'       => $v['monto_total'],
        ':id_medio_pago'     => $planPago['id_medio_pago'],
        ':id_movimiento'     => $id_movimiento,
      ]);

      compra_guardar_primer_item($pdo, $id_movimiento, $v['item']);
      compra_stock_recalcular_desde_update($pdo, $beforeItem, $v);

      if (!empty($planPago['rows'])) {
        compra_insertar_medios_pago_multi($pdo, $id_movimiento, $planPago['rows']);
      }

      // Si al editar la compra se selecciona un cheque/eCheq nuevo, el detalle
      // y el flujo ya quedan registrados arriba. Falta marcarlo como usado para
      // que salga de cartera. Esto mantiene el comportamiento inverso ya existente:
      // si se cambia de cheque/eCheq a efectivo/otro medio, los cheques anteriores
      // se reactivan antes de validar y vuelven a estar disponibles.
      if (!empty($mediosValidados)) {
        compra_dar_baja_cheques_multi($pdo, $mediosValidados);
      }

      $pdo->commit();

      $after       = compra_obtener_movimiento_por_id($pdo, $id_movimiento);
      $afterItem   = compra_obtener_primer_item_movimiento($pdo, $id_movimiento);
      $afterMedios = compra_obtener_medios_pago_movimiento($pdo, $id_movimiento);

      $idUsuarioAudit = compra_resolver_usuario_auditoria($pdo, $src);

      compra_auditar_seguro($pdo, $idUsuarioAudit, 'actualizar', 'compras', $id_movimiento, [
        'antes'              => $before,
        'antes_item'         => $beforeItem,
        'antes_medios_pago'  => $beforeMedios,
        'despues'            => $after ?: null,
        'despues_item'       => $afterItem ?: $v['item'],
        'despues_medios_pago'=> !empty($afterMedios) ? $afterMedios : $mediosValidados,
        'stock_actualizado'  => true,
      ]);

      compra_ok([
        'actualizado'        => true,
        'id_movimiento'      => $id_movimiento,
        'medios_pago'        => count($mediosValidados),
        'cheques_usados'     => array_values(array_filter(array_column($mediosValidados, 'id_cheque'))),
        'stock_actualizado'  => true,
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit,
          'audit_intentado'      => $idUsuarioAudit > 0,
        ],
      ]);

    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      compra_fail('No se pudo actualizar la compra. ' . $e->getMessage());
    }
  }
}