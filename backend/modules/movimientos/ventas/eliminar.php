<?php
// backend/modules/movimientos/ventas/eliminar.php
declare(strict_types=1);

/* =========================================================
   HELPERS STOCK
========================================================= */
if (!function_exists('ventas_eliminar_stock_normalizar_cantidad')) {
  function ventas_eliminar_stock_normalizar_cantidad($cantidad): int
  {
    $n = (float)$cantidad;
    if (!is_finite($n) || $n <= 0) {
      fail('La cantidad para stock debe ser mayor a 0.');
    }

    $entera = (int)round($n);
    if (abs($n - $entera) > 0.00001) {
      fail('La cantidad del producto debe ser entera para impactar stock.');
    }

    return $entera;
  }
}

if (!function_exists('ventas_eliminar_stock_lock_producto')) {
  function ventas_eliminar_stock_lock_producto(PDO $pdo, int $idStockProducto): ?array
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

    // En eliminación no bloqueamos la baja si el producto de stock ya fue borrado.
    // Puede pasar con ventas viejas que quedaron referenciando un producto inexistente.
    return $row ?: null;
  }
}

if (!function_exists('ventas_eliminar_stock_reponer')) {
  function ventas_eliminar_stock_reponer(PDO $pdo, int $idStockProducto, $cantidad): bool
  {
    $cant = ventas_eliminar_stock_normalizar_cantidad($cantidad);

    $producto = ventas_eliminar_stock_lock_producto($pdo, $idStockProducto);
    if ($producto === null) {
      return false;
    }

    $upd = $pdo->prepare("
      UPDATE stock_productos
      SET stock = COALESCE(stock, 0) + :cantidad
      WHERE id_stock_producto = :id_stock_producto
      LIMIT 1
    ");
    $upd->execute([
      ':cantidad'          => $cant,
      ':id_stock_producto' => $idStockProducto,
    ]);

    return true;
  }
}

/* =========================================================
   HELPERS SQL
========================================================= */
if (!function_exists('ventas_table_exists')) {
  function ventas_table_exists(PDO $pdo, string $tableName): bool
  {
    $sql = "
      SELECT COUNT(*)
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table_name
    ";
    $st = $pdo->prepare($sql);
    $st->execute([
      ':table_name' => $tableName,
    ]);

    return ((int)$st->fetchColumn()) > 0;
  }
}

if (!function_exists('ventas_column_exists')) {
  function ventas_column_exists(PDO $pdo, string $tableName, string $columnName): bool
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

if (!function_exists('ventas_build_in_named_params')) {
  function ventas_build_in_named_params(string $prefix, array $values): array
  {
    $params = [];
    $placeholders = [];

    foreach (array_values($values) as $i => $value) {
      $key = ':' . $prefix . $i;
      $placeholders[] = $key;
      $params[$key] = $value;
    }

    return [
      'sql'    => implode(', ', $placeholders),
      'params' => $params,
    ];
  }
}

if (!function_exists('ventas_detect_first_existing_column')) {
  function ventas_detect_first_existing_column(PDO $pdo, string $tableName, array $candidates): ?string
  {
    foreach ($candidates as $col) {
      if (ventas_column_exists($pdo, $tableName, $col)) {
        return $col;
      }
    }
    return null;
  }
}

if (!function_exists('ventas_detect_cheques_pk_column')) {
  function ventas_detect_cheques_pk_column(PDO $pdo): ?string
  {
    if (!ventas_table_exists($pdo, 'movimientos_cheques')) {
      return null;
    }

    return ventas_detect_first_existing_column($pdo, 'movimientos_cheques', [
      'id_movimiento_cheque',
      'id_cheque',
      'cheque_id',
      'id',
    ]);
  }
}

/* =========================================================
   ELIMINAR
========================================================= */
function ventas_eliminar(PDO $pdo): void
{
  $body      = read_json_body();
  $src       = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($pdo, $src);

  $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
  $id = n_int($id);
  if (!$id) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("
    SELECT *
    FROM movimientos
    WHERE id_movimiento = :id
    LIMIT 1
  ");
  $beforeSt->execute([':id' => $id]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);

  if (!$before) fail('La venta no existe.');

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idVenta) {
    fail('Este movimiento no es una venta (tipo_operacion).');
  }


  $estadoFiscal = obtener_estado_fiscal_venta($pdo, (int)$id);
  if (!empty($estadoFiscal['requiere_nota_credito'])) {
    fail(
      'Este registro tiene asociado una factura emitida en ARCA, antes de eliminar se necesita crear una nota de crédito.',
      200,
      [
        'requiere_nota_credito'   => true,
        'id_movimiento'           => (int)$id,
        'id_comprobante_original' => $estadoFiscal['id_comprobante_original'] ?? null,
        'factura'                 => $estadoFiscal['factura'] ?? null,
      ]
    );
  }

  try {
    $pdo->beginTransaction();

    /* =========================
       1) CARGAR ITEMS Y REPONER STOCK
    ========================= */
    $stmtGetItems = $pdo->prepare("
      SELECT
        id_item,
        id_movimiento,
        id_stock_producto,
        id_stock_producto AS id_detalle,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
    ");
    $stmtGetItems->execute([':id' => $id]);
    $items = $stmtGetItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $stockRepuesto = true;
    $stockProductosNoEncontrados = [];

    foreach ($items as $it) {
      $idStockProducto = (int)($it['id_stock_producto'] ?? ($it['id_detalle'] ?? 0));
      $cantidad        = $it['cantidad'] ?? 0;

      if ($idStockProducto > 0 && (float)$cantidad > 0) {
        $repuesto = ventas_eliminar_stock_reponer($pdo, $idStockProducto, $cantidad);
        if (!$repuesto) {
          $stockRepuesto = false;
          $stockProductosNoEncontrados[] = $idStockProducto;
        }
      }
    }

    $stockProductosNoEncontrados = array_values(array_unique(array_filter(
      array_map('intval', $stockProductosNoEncontrados),
      fn($x) => $x > 0
    )));

    /* =========================
       2) BUSCAR IDS DE CHEQUES DEL MOVIMIENTO
    ========================= */
    $idsCheques = [];
    $chequesPkColumn = ventas_detect_cheques_pk_column($pdo);

    if ($chequesPkColumn !== null && ventas_column_exists($pdo, 'movimientos_cheques', 'id_movimiento')) {
      $sqlCheques = "
        SELECT {$chequesPkColumn} AS cheque_ref_id
        FROM movimientos_cheques
        WHERE id_movimiento = :id
      ";
      $stCheques = $pdo->prepare($sqlCheques);
      $stCheques->execute([':id' => $id]);

      $idsCheques = array_map(
        'intval',
        array_column($stCheques->fetchAll(PDO::FETCH_ASSOC) ?: [], 'cheque_ref_id')
      );
      $idsCheques = array_values(array_filter($idsCheques, fn($x) => $x > 0));
    }

    /* =========================
       3) BORRAR FLUJO DE CHEQUES
    ========================= */
    if (!empty($idsCheques) && ventas_table_exists($pdo, 'movimientos_cheques_flujo')) {
      $flujoChequeCol = ventas_detect_first_existing_column($pdo, 'movimientos_cheques_flujo', [
        'id_movimiento_cheque',
        'id_cheque',
        'cheque_id',
      ]);

      if ($flujoChequeCol !== null) {
        $in = ventas_build_in_named_params('mcf', $idsCheques);

        $sql = "
          DELETE FROM movimientos_cheques_flujo
          WHERE {$flujoChequeCol} IN ({$in['sql']})
        ";
        $st = $pdo->prepare($sql);
        $st->execute($in['params']);
      }
    }

    /* =========================
       4) BORRAR MEDIOS DE PAGO DEL MOVIMIENTO
          Y/O VINCULADOS A CHEQUES
    ========================= */
    if (ventas_table_exists($pdo, 'movimientos_medios_pago')) {
      $conds = [];
      $params = [];

      if (ventas_column_exists($pdo, 'movimientos_medios_pago', 'id_movimiento')) {
        $conds[] = "id_movimiento = :id_movimiento";
        $params[':id_movimiento'] = $id;
      }

      $mmpChequeCol = ventas_detect_first_existing_column($pdo, 'movimientos_medios_pago', [
        'id_cheque',
        'id_movimiento_cheque',
        'cheque_id',
      ]);

      if (!empty($idsCheques) && $mmpChequeCol !== null) {
        $in = ventas_build_in_named_params('mmpc', $idsCheques);
        $conds[] = "{$mmpChequeCol} IN ({$in['sql']})";
        $params = array_merge($params, $in['params']);
      }

      if (!empty($conds)) {
        $sql = "DELETE FROM movimientos_medios_pago WHERE " . implode(' OR ', $conds);
        $st = $pdo->prepare($sql);
        $st->execute($params);
      }
    }

    /* =========================
       5) BORRAR COBROS DEL MOVIMIENTO
    ========================= */
    if (ventas_table_exists($pdo, 'cobros') && ventas_column_exists($pdo, 'cobros', 'id_movimiento')) {
      $stCobros = $pdo->prepare("
        DELETE FROM cobros
        WHERE id_movimiento = :id
      ");
      $stCobros->execute([':id' => $id]);
    }

    /* =========================
       6) BORRAR COMPROBANTES / ARCHIVOS
    ========================= */
    if (ventas_table_exists($pdo, 'movimientos_comprobantes')) {
      $stmtMovComp = $pdo->prepare("
        DELETE FROM movimientos_comprobantes
        WHERE id_movimiento = :id
      ");
      $stmtMovComp->execute([':id' => $id]);
    }

    if (
      ventas_table_exists($pdo, 'comprobantes_archivos') &&
      ventas_column_exists($pdo, 'comprobantes_archivos', 'id_movimiento')
    ) {
      $stmtCompArch = $pdo->prepare("
        DELETE FROM comprobantes_archivos
        WHERE id_movimiento = :id
      ");
      $stmtCompArch->execute([':id' => $id]);
    }

    /* =========================
       7) BORRAR ITEMS
    ========================= */
    $stmtItems = $pdo->prepare("
      DELETE FROM movimientos_items
      WHERE id_movimiento = :id
    ");
    $stmtItems->execute([':id' => $id]);

    /* =========================
       8) BORRAR CHEQUES DEL MOVIMIENTO
    ========================= */
    if (ventas_table_exists($pdo, 'movimientos_cheques') && ventas_column_exists($pdo, 'movimientos_cheques', 'id_movimiento')) {
      $stmtCheques = $pdo->prepare("
        DELETE FROM movimientos_cheques
        WHERE id_movimiento = :id
      ");
      $stmtCheques->execute([':id' => $id]);
    }

    /* =========================
       9) BORRAR VÍNCULO DE PRESUPUESTO CONVERTIDO
          Si esta venta nació desde un presupuesto/documento comercial,
          eliminamos el registro de conversión para que el presupuesto
          vuelva a quedar disponible como no convertido.
    ========================= */
    $conversionPresupuestoEliminada = 0;

    if (
      ventas_table_exists($pdo, 'presupuestos_conversiones') &&
      ventas_column_exists($pdo, 'presupuestos_conversiones', 'id_venta')
    ) {
      $stmtConversion = $pdo->prepare("
        DELETE FROM presupuestos_conversiones
        WHERE id_venta = :id
      ");
      $stmtConversion->execute([':id' => $id]);
      $conversionPresupuestoEliminada = (int)$stmtConversion->rowCount();
    }

    /* =========================
       10) BORRAR MOVIMIENTO
    ========================= */
    $stmt = $pdo->prepare("
      DELETE FROM movimientos
      WHERE id_movimiento = :id
    ");
    $stmt->execute([':id' => $id]);

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'eliminar', 'ventas', $id, [
      'eliminado'         => true,
      'antes'             => $before ?: null,
      'items'             => $items,
      'ids_cheques'       => $idsCheques,
      'cheques_pk_column' => $chequesPkColumn,
      'stock_repuesto'                     => $stockRepuesto,
      'conversion_presupuesto_eliminada'  => $conversionPresupuestoEliminada,
      'stock_productos_no_encontrados' => $stockProductosNoEncontrados,
    ]);

    ok([
      'eliminado'                        => true,
      'id_movimiento'                    => $id,
      'ids_cheques'                      => $idsCheques,
      'cheques_pk_column'                => $chequesPkColumn,
      'stock_repuesto'                   => $stockRepuesto,
      'conversion_presupuesto_eliminada' => $conversionPresupuestoEliminada,
      'stock_productos_no_encontrados' => $stockProductosNoEncontrados,
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }

    fail('No se pudo eliminar la venta. ' . $e->getMessage());
  }
}