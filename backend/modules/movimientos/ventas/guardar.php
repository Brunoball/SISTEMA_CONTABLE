<?php
// backend/modules/movimientos/ventas/guardar.php
declare(strict_types=1);

/* =========================================================
   CREAR
========================================================= */
function ventas_crear(PDO $pdo): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

  $body = read_json_body();
  $src = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($pdo, $src);

  $v = validar_venta_or_fail($pdo, $src);

  try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion, id_tipo_venta,
        id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion, :id_tipo_venta,
        :id_cliente, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago
      )
    ");

    $stmt->execute([
      ':fecha'              => $v['fecha'],
      ':id_tipo_operacion'  => $v['id_tipo_operacion'],
      ':id_clasificacion'   => $v['id_clasificacion'],
      ':id_tipo_venta'      => $v['id_tipo_venta'],
      ':id_cliente'         => $v['id_cliente'],
      ':id_proveedor'       => null,
      ':id_detalle'         => $v['id_detalle'],
      ':monto_total'        => $v['monto_total'],
      ':id_medio_pago'      => $v['id_medio_pago'],
    ]);

    $newId = (int)$pdo->lastInsertId();

    $it = $v['item'];
    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");
    $insItem->execute([
      ':id_movimiento' => $newId,
      ':id_detalle'    => $it['id_detalle'],
      ':cantidad'      => $it['cantidad'],
      ':precio'        => $it['precio'],
      ':iva_pct'       => $it['iva_pct'],
      ':subtotal'      => $it['subtotal'],
      ':iva_monto'     => $it['iva_monto'],
      ':total'         => $it['total'],
    ]);

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'crear', 'ventas', $newId, [
      'nuevo' => [
        'movimiento' => [
          'fecha'              => $v['fecha'],
          'id_tipo_operacion'  => $v['id_tipo_operacion'],
          'id_clasificacion'   => $v['id_clasificacion'],
          'id_tipo_venta'      => $v['id_tipo_venta'],
          'id_cliente'         => $v['id_cliente'],
          'id_detalle'         => $v['id_detalle'],
          'monto_total'        => $v['monto_total'],
          'id_medio_pago'      => $v['id_medio_pago'],
          'tipo_venta_nombre'  => $v['tipo_venta_nombre'],
        ],
        'item' => $it,
      ],
    ]);

    ok(['id_movimiento' => $newId]);
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
  $idUsuario = get_id_usuario_from_request($pdo, is_array($src) ? [] : $src);

  $items = [];
  if (is_array($src) && array_keys($src) === range(0, count($src) - 1)) {
    $items = $src;
  } elseif (is_array($src) && isset($src['items']) && is_array($src['items'])) {
    $items = $src['items'];
  }

  if (!$items || !is_array($items)) fail('Batch inválido: faltan items.');

  try {
    $pdo->beginTransaction();

    $ids = [];
    $auditPack = [];

    foreach ($items as $i => $one) {
      if (!is_array($one)) fail("Ítem batch inválido en índice $i.");

      $v = validar_venta_or_fail($pdo, $one);

      $stmt = $pdo->prepare("
        INSERT INTO movimientos (
          fecha,
          id_tipo_operacion,
          id_clasificacion, id_tipo_venta,
          id_cliente, id_proveedor, id_detalle,
          monto_total, id_medio_pago
        ) VALUES (
          :fecha,
          :id_tipo_operacion,
          :id_clasificacion, :id_tipo_venta,
          :id_cliente, :id_proveedor, :id_detalle,
          :monto_total, :id_medio_pago
        )
      ");
      $stmt->execute([
        ':fecha'             => $v['fecha'],
        ':id_tipo_operacion' => $v['id_tipo_operacion'],
        ':id_clasificacion'  => $v['id_clasificacion'],
        ':id_tipo_venta'     => $v['id_tipo_venta'],
        ':id_cliente'        => $v['id_cliente'],
        ':id_proveedor'      => null,
        ':id_detalle'        => $v['id_detalle'],
        ':monto_total'       => $v['monto_total'],
        ':id_medio_pago'     => $v['id_medio_pago'],
      ]);

      $newId = (int)$pdo->lastInsertId();

      $it = $v['item'];
      $insItem = $pdo->prepare("
        INSERT INTO movimientos_items
          (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
        VALUES
          (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
      ");
      $insItem->execute([
        ':id_movimiento' => $newId,
        ':id_detalle'    => $it['id_detalle'],
        ':cantidad'      => $it['cantidad'],
        ':precio'        => $it['precio'],
        ':iva_pct'       => $it['iva_pct'],
        ':subtotal'      => $it['subtotal'],
        ':iva_monto'     => $it['iva_monto'],
        ':total'         => $it['total'],
      ]);

      $ids[] = $newId;
      $auditPack[] = [
        'id'                => $newId,
        'fecha'             => $v['fecha'],
        'id_tipo_operacion' => $v['id_tipo_operacion'],
        'id_cliente'        => $v['id_cliente'],
        'id_tipo_venta'     => $v['id_tipo_venta'],
        'tipo_venta_nombre' => $v['tipo_venta_nombre'],
        'id_medio_pago'     => $v['id_medio_pago'],
        'monto_total'       => $v['monto_total'],
        'item'              => $it,
      ];
    }

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'crear_batch', 'ventas', null, [
      'cantidad' => count($ids),
      'ids'      => $ids,
      'items'    => $auditPack,
    ]);

    ok(['creados' => count($ids), 'ids' => $ids]);
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
  $idUsuario = get_id_usuario_from_request($pdo, $src);

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

  $merge = $src;
  foreach ([
    'fecha','id_clasificacion','id_tipo_venta','id_medio_pago',
    'id_cliente','id_detalle','monto_total','cantidad','precio','iva_pct','subtotal','iva_monto','total'
  ] as $k) {
    if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
      $merge[$k] = $before[$k];
    }
  }

  $v = validar_venta_or_fail($pdo, $merge);

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
        id_detalle        = :id_detalle,
        monto_total       = :monto_total,
        id_medio_pago     = :id_medio_pago
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ");
    $upd->execute([
      ':fecha'             => $v['fecha'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion'  => $v['id_clasificacion'],
      ':id_tipo_venta'     => $v['id_tipo_venta'],
      ':id_cliente'        => $v['id_cliente'],
      ':id_detalle'        => $v['id_detalle'],
      ':monto_total'       => $v['monto_total'],
      ':id_medio_pago'     => $v['id_medio_pago'],
      ':id_movimiento'     => $id_movimiento,
    ]);

    $it = $v['item'];

    $getFirst = $pdo->prepare("SELECT id_item FROM movimientos_items WHERE id_movimiento = :id ORDER BY id_item ASC LIMIT 1");
    $getFirst->execute([':id' => $id_movimiento]);
    $first = $getFirst->fetch(PDO::FETCH_ASSOC);

    if ($first && !empty($first['id_item'])) {
      $id_item = (int)$first['id_item'];
      $updItem = $pdo->prepare("
        UPDATE movimientos_items SET
          id_detalle = :id_detalle,
          cantidad   = :cantidad,
          precio     = :precio,
          iva_pct    = :iva_pct,
          subtotal   = :subtotal,
          iva_monto  = :iva_monto,
          total      = :total
        WHERE id_item = :id_item
        LIMIT 1
      ");
      $updItem->execute([
        ':id_detalle' => $it['id_detalle'],
        ':cantidad'   => $it['cantidad'],
        ':precio'     => $it['precio'],
        ':iva_pct'    => $it['iva_pct'],
        ':subtotal'   => $it['subtotal'],
        ':iva_monto'  => $it['iva_monto'],
        ':total'      => $it['total'],
        ':id_item'    => $id_item,
      ]);
    } else {
      $ins = $pdo->prepare("
        INSERT INTO movimientos_items
          (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
        VALUES
          (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
      ");
      $ins->execute([
        ':id_movimiento' => $id_movimiento,
        ':id_detalle'    => $it['id_detalle'],
        ':cantidad'      => $it['cantidad'],
        ':precio'        => $it['precio'],
        ':iva_pct'       => $it['iva_pct'],
        ':subtotal'      => $it['subtotal'],
        ':iva_monto'     => $it['iva_monto'],
        ':total'         => $it['total'],
      ]);
    }

    $pdo->commit();

    $afterSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $afterSt->execute([':id' => $id_movimiento]);
    $after = $afterSt->fetch(PDO::FETCH_ASSOC);

    audit_safe($pdo, $idUsuario, 'actualizar', 'ventas', $id_movimiento, [
      'antes'   => $before,
      'despues' => $after ?: null,
      'item'    => $it,
    ]);

    ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo actualizar la venta. ' . $e->getMessage());
  }
}