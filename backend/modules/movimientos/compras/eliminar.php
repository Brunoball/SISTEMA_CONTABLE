<?php
// backend/modules/movimientos/compras/eliminar.php
declare(strict_types=1);

require_once __DIR__ . '/../global/medios_pago.php';

/* =========================================================
   HELPERS SQL
========================================================= */
if (!function_exists('compra_table_exists')) {
  function compra_table_exists(PDO $pdo, string $tableName): bool
  {
    $sql = "
      SELECT COUNT(*)
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table_name
    ";
    $st = $pdo->prepare($sql);
    $st->execute([':table_name' => $tableName]);
    return ((int)$st->fetchColumn()) > 0;
  }
}

if (!function_exists('compra_column_exists')) {
  function compra_column_exists(PDO $pdo, string $tableName, string $columnName): bool
  {
    $sql = "
      SELECT COUNT(*)
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table_name
        AND COLUMN_NAME = :column_name
    ";
    $st = $pdo->prepare($sql);
    $st->execute([
      ':table_name'  => $tableName,
      ':column_name' => $columnName,
    ]);

    return ((int)$st->fetchColumn()) > 0;
  }
}

/* =========================================================
   HELPERS STOCK / ITEMS PARA ELIMINAR COMPRA
========================================================= */

if (!function_exists('compra_eliminar_obtener_items_para_stock')) {
  /**
   * Busca TODOS los items de la compra para poder revertir stock.
   */
  function compra_eliminar_obtener_items_para_stock(PDO $pdo, int $idMovimiento): array
  {
    $sql = "
      SELECT
        mi.id_item,
        mi.id_movimiento,
        mi.id_stock_producto,
        mi.cantidad
      FROM movimientos_items mi
      WHERE mi.id_movimiento = :id_movimiento
      ORDER BY mi.id_item ASC
    ";

    $st = $pdo->prepare($sql);
    $st->execute([':id_movimiento' => $idMovimiento]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $out = [];
    foreach ($rows as $row) {
      $out[] = [
        'id_item'           => (int)($row['id_item'] ?? 0),
        'id_movimiento'     => (int)($row['id_movimiento'] ?? 0),
        'id_stock_producto' => (int)($row['id_stock_producto'] ?? 0),
        'id_detalle'        => (int)($row['id_stock_producto'] ?? 0),
        'cantidad'          => (float)($row['cantidad'] ?? 0),
      ];
    }

    return $out;
  }
}

if (!function_exists('compra_eliminar_normalizar_cantidad_stock')) {
  function compra_eliminar_normalizar_cantidad_stock($cantidadRaw): int
  {
    $cantidad = (float)$cantidadRaw;

    if (!is_finite($cantidad) || $cantidad <= 0) {
      compra_fail('La cantidad del item de la compra es inválida para revertir stock.');
    }

    $cantidadInt = (int)round($cantidad);

    if ($cantidadInt <= 0) {
      compra_fail('La cantidad normalizada para revertir stock quedó inválida.');
    }

    return $cantidadInt;
  }
}

if (!function_exists('compra_eliminar_lock_producto_stock')) {
  function compra_eliminar_lock_producto_stock(PDO $pdo, int $idProducto): ?array
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

if (!function_exists('compra_eliminar_revertir_stock')) {
  /**
   * Resta del stock la cantidad previamente sumada por la compra.
   * Nunca deja stock negativo.
   *
   * Importante: si el producto de stock ya no existe, NO se bloquea
   * la eliminación de la compra. En ese caso se omite solo la reversión
   * de stock de ese item y se permite borrar el movimiento igual.
   */
  function compra_eliminar_revertir_stock(PDO $pdo, int $idProducto, int $cantidadARestar): array
  {
    if ($idProducto <= 0) {
      compra_fail('No se pudo revertir stock: id de producto inválido.');
    }

    if ($cantidadARestar <= 0) {
      compra_fail('No se pudo revertir stock: cantidad inválida.');
    }

    $producto = compra_eliminar_lock_producto_stock($pdo, $idProducto);
    if (!$producto) {
      return [
        'id_stock_producto' => $idProducto,
        'cantidad'          => $cantidadARestar,
        'revertido'         => false,
        'omitido'           => true,
        'motivo'            => 'producto_stock_inexistente',
      ];
    }

    $stockActual = (int)($producto['stock'] ?? 0);

    if ($stockActual < $cantidadARestar) {
      compra_fail(
        "No se puede eliminar la compra porque el stock actual del producto ID {$idProducto} " .
        "es {$stockActual} y la compra intenta revertir {$cantidadARestar}."
      );
    }

    $upd = $pdo->prepare("
      UPDATE stock_productos
      SET stock = COALESCE(stock, 0) - :cantidad
      WHERE id_stock_producto = :id
      LIMIT 1
    ");
    $upd->execute([
      ':cantidad' => $cantidadARestar,
      ':id'       => $idProducto,
    ]);

    if ($upd->rowCount() <= 0) {
      compra_fail("No se pudo revertir stock del producto ID {$idProducto}.");
    }

    return [
      'id_stock_producto' => $idProducto,
      'cantidad'          => $cantidadARestar,
      'stock_anterior'    => $stockActual,
      'stock_nuevo'       => $stockActual - $cantidadARestar,
      'revertido'         => true,
      'omitido'           => false,
      'motivo'            => null,
    ];
  }
}


/* =========================================================
   HELPERS CHEQUES / ORDEN DE PAGO AL ELIMINAR COMPRA
========================================================= */

if (!function_exists('compra_eliminar_evento_salida_cheque_sql')) {
  function compra_eliminar_evento_salida_cheque_sql(string $alias = ''): string
  {
    $prefix = $alias !== '' ? $alias . '.' : '';
    return "(UPPER(COALESCE({$prefix}evento, '')) IN ('EGRESO_CARTERA', 'BAJA') OR UPPER(COALESCE({$prefix}evento, '')) LIKE 'EGRESO%')";
  }
}

if (!function_exists('compra_eliminar_unique_positive_ids')) {
  function compra_eliminar_unique_positive_ids(array $ids): array
  {
    return array_values(array_unique(array_filter(array_map('intval', $ids), static fn(int $id): bool => $id > 0)));
  }
}

if (!function_exists('compra_eliminar_obtener_cheques_salida_for_update')) {
  /**
   * Obtiene los cheques/eCheqs que salieron de cartera por este movimiento.
   * Cubre dos formas de vínculo:
   *  - movimientos_medios_pago.id_cheque (pago normal)
   *  - movimientos_cheques_flujo EGRESO_CARTERA/BAJA (pago conjunto o histórico)
   */
  function compra_eliminar_obtener_cheques_salida_for_update(PDO $pdo, int $idMovimiento): array
  {
    if ($idMovimiento <= 0) return [];

    $ids = [];

    if (
      compra_table_exists($pdo, 'movimientos_medios_pago') &&
      compra_column_exists($pdo, 'movimientos_medios_pago', 'id_movimiento') &&
      compra_column_exists($pdo, 'movimientos_medios_pago', 'id_cheque')
    ) {
      $st = $pdo->prepare("\n        SELECT DISTINCT id_cheque\n        FROM movimientos_medios_pago\n        WHERE id_movimiento = :id_movimiento\n          AND id_cheque IS NOT NULL\n          AND id_cheque > 0\n      ");
      $st->execute([':id_movimiento' => $idMovimiento]);
      foreach (($st->fetchAll(PDO::FETCH_COLUMN) ?: []) as $idCheque) {
        $ids[] = (int)$idCheque;
      }
    }

    if (
      compra_table_exists($pdo, 'movimientos_cheques_flujo') &&
      compra_column_exists($pdo, 'movimientos_cheques_flujo', 'id_movimiento') &&
      compra_column_exists($pdo, 'movimientos_cheques_flujo', 'id_cheque') &&
      compra_column_exists($pdo, 'movimientos_cheques_flujo', 'evento')
    ) {
      $st = $pdo->prepare("\n        SELECT DISTINCT id_cheque\n        FROM movimientos_cheques_flujo\n        WHERE id_movimiento = :id_movimiento\n          AND id_cheque IS NOT NULL\n          AND id_cheque > 0\n          AND " . compra_eliminar_evento_salida_cheque_sql() . "\n      ");
      $st->execute([':id_movimiento' => $idMovimiento]);
      foreach (($st->fetchAll(PDO::FETCH_COLUMN) ?: []) as $idCheque) {
        $ids[] = (int)$idCheque;
      }
    }

    $ids = compra_eliminar_unique_positive_ids($ids);
    if (!$ids || !compra_table_exists($pdo, 'movimientos_cheques')) return $ids;

    // Bloquea esos cheques dentro de la misma transacción para evitar carreras.
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $lock = $pdo->prepare("\n      SELECT id_cheque\n      FROM movimientos_cheques\n      WHERE id_cheque IN ($placeholders)\n      FOR UPDATE\n    ");
    foreach ($ids as $i => $idCheque) {
      $lock->bindValue($i + 1, $idCheque, PDO::PARAM_INT);
    }
    $lock->execute();

    return $ids;
  }
}

if (!function_exists('compra_eliminar_borrar_flujo_salida_cheques')) {
  function compra_eliminar_borrar_flujo_salida_cheques(PDO $pdo, int $idMovimiento): int
  {
    if (
      $idMovimiento <= 0 ||
      !compra_table_exists($pdo, 'movimientos_cheques_flujo') ||
      !compra_column_exists($pdo, 'movimientos_cheques_flujo', 'id_movimiento') ||
      !compra_column_exists($pdo, 'movimientos_cheques_flujo', 'evento')
    ) {
      return 0;
    }

    $st = $pdo->prepare("\n      DELETE FROM movimientos_cheques_flujo\n      WHERE id_movimiento = :id_movimiento\n        AND " . compra_eliminar_evento_salida_cheque_sql() . "\n    ");
    $st->execute([':id_movimiento' => $idMovimiento]);
    return (int)$st->rowCount();
  }
}

if (!function_exists('compra_eliminar_cheque_tiene_salida_vigente')) {
  function compra_eliminar_cheque_tiene_salida_vigente(PDO $pdo, int $idCheque): bool
  {
    if ($idCheque <= 0) return false;

    if (
      compra_table_exists($pdo, 'movimientos_medios_pago') &&
      compra_column_exists($pdo, 'movimientos_medios_pago', 'id_cheque')
    ) {
      $stMp = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM movimientos_medios_pago\n        WHERE id_cheque = :id_cheque\n      ");
      $stMp->execute([':id_cheque' => $idCheque]);
      if ((int)$stMp->fetchColumn() > 0) return true;
    }

    if (
      compra_table_exists($pdo, 'movimientos_cheques_flujo') &&
      compra_column_exists($pdo, 'movimientos_cheques_flujo', 'id_cheque') &&
      compra_column_exists($pdo, 'movimientos_cheques_flujo', 'evento')
    ) {
      $stFlujo = $pdo->prepare("\n        SELECT COUNT(*)\n        FROM movimientos_cheques_flujo\n        WHERE id_cheque = :id_cheque\n          AND " . compra_eliminar_evento_salida_cheque_sql() . "\n      ");
      $stFlujo->execute([':id_cheque' => $idCheque]);
      if ((int)$stFlujo->fetchColumn() > 0) return true;
    }

    return false;
  }
}

if (!function_exists('compra_eliminar_reactivar_cheques_si_corresponde')) {
  /**
   * Reactiva en cartera solo los cheques que, después de borrar este movimiento,
   * ya no queden usados por ninguna otra orden/egreso. Esto evita reactivar mal
   * un cheque compartido en pagos de varias órdenes.
   */
  function compra_eliminar_reactivar_cheques_si_corresponde(PDO $pdo, array $chequeIds): array
  {
    $chequeIds = compra_eliminar_unique_positive_ids($chequeIds);
    $resultado = [];

    if (!$chequeIds || !compra_table_exists($pdo, 'movimientos_cheques')) return $resultado;

    foreach ($chequeIds as $idCheque) {
      $tieneUsoVigente = compra_eliminar_cheque_tiene_salida_vigente($pdo, $idCheque);

      if ($tieneUsoVigente) {
        $resultado[] = [
          'id_cheque'   => $idCheque,
          'reactivado'  => false,
          'motivo'      => 'sigue_usado_en_otro_movimiento',
        ];
        continue;
      }

      $st = $pdo->prepare("\n        UPDATE movimientos_cheques\n        SET activo = 1\n        WHERE id_cheque = :id_cheque\n        LIMIT 1\n      ");
      $st->execute([':id_cheque' => $idCheque]);

      $resultado[] = [
        'id_cheque'   => $idCheque,
        'reactivado'  => true,
        'motivo'      => 'sin_egresos_vigentes',
      ];
    }

    return $resultado;
  }
}

/* =========================================================
   ELIMINAR COMPRA + REVERTIR STOCK
========================================================= */
if (!function_exists('compras_eliminar')) {
  function compras_eliminar(PDO $pdo): void
  {
    $body = compra_read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = compra_resolver_usuario_auditoria($pdo, $src);

    $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
    $id = compra_n_int($id);

    if (!$id) {
      compra_fail('Falta id_movimiento.');
    }

    $beforeSt = $pdo->prepare("
      SELECT *
      FROM movimientos
      WHERE id_movimiento = :id
      LIMIT 1
    ");
    $beforeSt->execute([':id' => $id]);
    $before = $beforeSt->fetch(PDO::FETCH_ASSOC);

    if (!$before) {
      compra_fail('La compra no existe.');
    }

    $idCompra = compra_get_tipo_operacion_id($pdo);
    if ($idCompra <= 0) {
      compra_fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
    }

    if ((int)($before['id_tipo_operacion'] ?? 0) !== $idCompra) {
      compra_fail('Este movimiento no es una compra (tipo_operacion).');
    }

    try {
      $pdo->beginTransaction();

      $lockMov = $pdo->prepare("
        SELECT *
        FROM movimientos
        WHERE id_movimiento = :id
        LIMIT 1
        FOR UPDATE
      ");
      $lockMov->execute([':id' => $id]);
      $mov = $lockMov->fetch(PDO::FETCH_ASSOC);

      if (!$mov) {
        compra_fail('La compra ya no existe o fue eliminada por otro proceso.');
      }

      $beforeMedios = compra_obtener_medios_pago_movimiento($pdo, (int)$id);

      $items = compra_eliminar_obtener_items_para_stock($pdo, (int)$id);

      if (empty($items)) {
        compra_fail(
          'No se encontraron items de la compra para revertir stock. Verificá la tabla movimientos_items.'
        );
      }

      $stockProcesado = [];
      foreach ($items as $item) {
        $idProducto = (int)($item['id_stock_producto'] ?? $item['id_detalle'] ?? 0);
        $cantidad   = compra_eliminar_normalizar_cantidad_stock($item['cantidad'] ?? 0);

        if ($idProducto <= 0) {
          compra_fail('Uno de los items de la compra no tiene un id_stock_producto válido para stock.');
        }

        $stockProcesado[] = compra_eliminar_revertir_stock($pdo, $idProducto, $cantidad);
      }

      $chequesSalidaIds = compra_eliminar_obtener_cheques_salida_for_update($pdo, (int)$id);
      $flujosSalidaEliminados = compra_eliminar_borrar_flujo_salida_cheques($pdo, (int)$id);
      $mediosPagoEliminadosCount = 0;

      if (
        compra_table_exists($pdo, 'movimientos_medios_pago') &&
        compra_column_exists($pdo, 'movimientos_medios_pago', 'id_movimiento')
      ) {
        $delMp = $pdo->prepare("
          DELETE FROM movimientos_medios_pago
          WHERE id_movimiento = :id_movimiento
        ");
        $delMp->execute([':id_movimiento' => $id]);
        $mediosPagoEliminadosCount = (int)$delMp->rowCount();
      }

      $chequesReactivados = compra_eliminar_reactivar_cheques_si_corresponde($pdo, $chequesSalidaIds);


      if (
        compra_table_exists($pdo, 'cobros') &&
        compra_column_exists($pdo, 'cobros', 'id_movimiento')
      ) {
        $idsCobros = [];
        $stCobros = $pdo->prepare("
          SELECT id_cobro
          FROM cobros
          WHERE id_movimiento = :id_movimiento
        ");
        $stCobros->execute([':id_movimiento' => $id]);
        foreach (($stCobros->fetchAll(PDO::FETCH_COLUMN) ?: []) as $idCobro) {
          $idCobroInt = (int)$idCobro;
          if ($idCobroInt > 0) $idsCobros[] = $idCobroInt;
        }

        if ($idsCobros && compra_table_exists($pdo, 'comprobantes_archivos') && compra_column_exists($pdo, 'comprobantes_archivos', 'id_cobro')) {
          $phCobros = implode(',', array_fill(0, count($idsCobros), '?'));
          $delCompCobros = $pdo->prepare("DELETE FROM comprobantes_archivos WHERE id_cobro IN ($phCobros)");
          foreach ($idsCobros as $i => $idCobro) {
            $delCompCobros->bindValue($i + 1, $idCobro, PDO::PARAM_INT);
          }
          $delCompCobros->execute();
        }

        $delCobros = $pdo->prepare("
          DELETE FROM cobros
          WHERE id_movimiento = :id_movimiento
        ");
        $delCobros->execute([':id_movimiento' => $id]);
      }

      if (
        compra_table_exists($pdo, 'movimientos_comprobantes') &&
        compra_column_exists($pdo, 'movimientos_comprobantes', 'id_movimiento')
      ) {
        $delMovComp = $pdo->prepare("
          DELETE FROM movimientos_comprobantes
          WHERE id_movimiento = :id_movimiento
        ");
        $delMovComp->execute([':id_movimiento' => $id]);
      }

      if (
        compra_table_exists($pdo, 'comprobantes_archivos') &&
        compra_column_exists($pdo, 'comprobantes_archivos', 'id_movimiento')
      ) {
        $delCompArch = $pdo->prepare("
          DELETE FROM comprobantes_archivos
          WHERE id_movimiento = :id_movimiento
        ");
        $delCompArch->execute([':id_movimiento' => $id]);
      }

      $delItems = $pdo->prepare("
        DELETE FROM movimientos_items
        WHERE id_movimiento = :id_movimiento
      ");
      $delItems->execute([':id_movimiento' => $id]);

      $stmt = $pdo->prepare("
        DELETE FROM movimientos
        WHERE id_movimiento = :id
        LIMIT 1
      ");
      $stmt->execute([':id' => $id]);

      if ($stmt->rowCount() <= 0) {
        compra_fail('No se pudo eliminar la compra.');
      }

      $pdo->commit();

      $idUsuarioAudit = compra_resolver_usuario_auditoria($pdo, $src);

      compra_auditar_seguro($pdo, $idUsuarioAudit, 'eliminar', 'compras', $id, [
        'eliminado'              => true,
        'antes'                  => $before ?: null,
        'antes_medios_pago'      => $beforeMedios,
        'items_revertidos'       => $items,
        'stock_revertido'        => true,
        'stock_procesado'        => $stockProcesado ?? [],
        'medios_pago_eliminados' => true,
        'medios_pago_eliminados_count' => $mediosPagoEliminadosCount ?? 0,
        'cheques_salida_ids'     => $chequesSalidaIds ?? [],
        'flujos_salida_eliminados' => $flujosSalidaEliminados ?? 0,
        'cheques_reactivados'    => $chequesReactivados ?? [],
      ]);

      compra_ok([
        'eliminado'              => true,
        'id_movimiento'          => $id,
        'stock_revertido'        => true,
        'stock_procesado'        => $stockProcesado ?? [],
        'items_revertidos'       => $items,
        'medios_pago_eliminados' => true,
        'medios_pago_eliminados_count' => $mediosPagoEliminadosCount ?? 0,
        'cheques_salida_ids'     => $chequesSalidaIds ?? [],
        'flujos_salida_eliminados' => $flujosSalidaEliminados ?? 0,
        'cheques_reactivados'    => $chequesReactivados ?? [],
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit,
          'audit_intentado'      => $idUsuarioAudit > 0,
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }
      compra_fail('No se pudo eliminar la compra. ' . $e->getMessage());
    }
  }
}