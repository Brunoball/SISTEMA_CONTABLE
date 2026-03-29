<?php
// backend/modules/movimientos/compras/guardar.php
declare(strict_types=1);

if (!function_exists('compras_crear')) {
  function compras_crear(PDO $pdo): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
      compra_fail('Método no permitido.', 405);
    }

    $body = compra_read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);

    $maybeId = compra_n_int($src['id_movimiento'] ?? null);
    if ($maybeId !== null && $maybeId > 0) {
      compras_actualizar($pdo);
      return;
    }

    $idUsuario = compra_get_id_usuario_from_request($src);
    $v = compra_validar_o_fallar($pdo, $src);

    try {
      $pdo->beginTransaction();

      $newId = compra_insertar_movimiento($pdo, $v);
      $it = $v['item'];
      compra_insertar_item($pdo, $newId, $it);

      $pdo->commit();

      compra_auditar_seguro($pdo, $idUsuario, 'crear', 'compras', $newId, [
        'nuevo' => [
          'movimiento' => [
            'fecha' => $v['fecha'],
            'id_tipo_operacion' => $v['id_tipo_operacion'],
            'id_clasificacion' => $v['id_clasificacion'],
            'id_tipo_venta' => $v['id_tipo_venta'],
            'id_proveedor' => $v['id_proveedor'],
            'id_detalle' => $v['id_detalle'],
            'monto_total' => $v['monto_total'],
            'id_medio_pago' => $v['id_medio_pago'],
          ],
          'item' => $it,
        ]
      ]);

      compra_ok(['id_movimiento' => $newId]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      compra_fail('No se pudo crear la compra. ' . $e->getMessage());
    }
  }
}

if (!function_exists('compras_crear_batch')) {
  function compras_crear_batch(PDO $pdo): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
      compra_fail('Método no permitido.', 405);
    }

    $body = compra_read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);

    $idUsuario = compra_get_id_usuario_from_request(is_array($src) ? $src : []);

    $items = [];
    if (is_array($src) && array_keys($src) === range(0, count($src) - 1)) {
      $items = $src;
    } elseif (is_array($src) && isset($src['items']) && is_array($src['items'])) {
      $items = $src['items'];
    }

    if (!$items || !is_array($items)) {
      compra_fail('Batch inválido: faltan items.');
    }

    try {
      $pdo->beginTransaction();

      $ids = [];
      $auditPack = [];

      foreach ($items as $i => $one) {
        if (!is_array($one)) {
          compra_fail("Ítem batch inválido en índice $i.");
        }

        $v = compra_validar_o_fallar($pdo, $one);
        $newId = compra_insertar_movimiento($pdo, $v);

        $it = $v['item'];
        compra_insertar_item($pdo, $newId, $it);

        $ids[] = $newId;
        $auditPack[] = [
          'id' => $newId,
          'fecha' => $v['fecha'],
          'id_tipo_operacion' => $v['id_tipo_operacion'],
          'id_tipo_venta' => $v['id_tipo_venta'],
          'id_proveedor' => $v['id_proveedor'],
          'id_medio_pago' => $v['id_medio_pago'],
          'monto_total' => $v['monto_total'],
          'item' => $it,
        ];
      }

      $pdo->commit();

      compra_auditar_seguro($pdo, $idUsuario, 'crear_batch', 'compras', null, [
        'cantidad' => count($ids),
        'ids' => $ids,
        'items' => $auditPack,
      ]);

      compra_ok(['creados' => count($ids), 'ids' => $ids]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      compra_fail('No se pudo crear el batch de compras. ' . $e->getMessage());
    }
  }
}

if (!function_exists('compras_actualizar')) {
  function compras_actualizar(PDO $pdo): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
      compra_fail('Método no permitido.', 405);
    }

    $body = compra_read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = compra_get_id_usuario_from_request($src);

    $id_movimiento = compra_n_int($src['id_movimiento'] ?? null);
    if (!$id_movimiento) {
      compra_fail('Falta id_movimiento.');
    }

    $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $beforeSt->execute([':id' => $id_movimiento]);
    $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
    if (!$before) {
      compra_fail('La compra no existe: ' . $id_movimiento);
    }

    $idCompra = compra_get_tipo_operacion_id($pdo);
    if ($idCompra <= 0) {
      compra_fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
    }

    if ((int)($before['id_tipo_operacion'] ?? 0) !== $idCompra) {
      compra_fail('Este movimiento no es una compra (tipo_operacion).');
    }

    $merge = $src;
    foreach ([
      'fecha',
      'id_clasificacion', 'id_tipo_venta', 'id_medio_pago',
      'id_proveedor', 'id_detalle', 'monto_total',
      'cantidad', 'precio', 'iva_pct', 'subtotal', 'iva_monto', 'total'
    ] as $k) {
      if (!array_key_exists($k, $merge) && array_key_exists($k, $before)) {
        $merge[$k] = $before[$k];
      }
    }

    $v = compra_validar_o_fallar($pdo, $merge);

    try {
      $pdo->beginTransaction();

      $upd = $pdo->prepare("
        UPDATE movimientos SET
          fecha = :fecha,
          id_tipo_operacion = :id_tipo_operacion,
          id_clasificacion = :id_clasificacion,
          id_tipo_venta = :id_tipo_venta,
          id_cliente = NULL,
          id_proveedor = :id_proveedor,
          id_detalle = :id_detalle,
          monto_total = :monto_total,
          id_medio_pago = :id_medio_pago
        WHERE id_movimiento = :id_movimiento
        LIMIT 1
      ");

      $upd->execute([
        ':fecha' => $v['fecha'],
        ':id_tipo_operacion' => $v['id_tipo_operacion'],
        ':id_clasificacion' => $v['id_clasificacion'],
        ':id_tipo_venta' => $v['id_tipo_venta'],
        ':id_proveedor' => $v['id_proveedor'],
        ':id_detalle' => $v['id_detalle'],
        ':monto_total' => $v['monto_total'],
        ':id_medio_pago' => $v['id_medio_pago'],
        ':id_movimiento' => $id_movimiento,
      ]);

      $it = $v['item'];
      compra_guardar_primer_item($pdo, $id_movimiento, $it);

      $pdo->commit();

      $afterSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
      $afterSt->execute([':id' => $id_movimiento]);
      $after = $afterSt->fetch(PDO::FETCH_ASSOC);

      compra_auditar_seguro($pdo, $idUsuario, 'actualizar', 'compras', $id_movimiento, [
        'antes' => $before,
        'despues' => $after ?: null,
        'item' => $it,
      ]);

      compra_ok(['actualizado' => true, 'id_movimiento' => $id_movimiento]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      compra_fail('No se pudo actualizar la compra. ' . $e->getMessage());
    }
  }
}