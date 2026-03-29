<?php
// backend/modules/movimientos/ventas/eliminar.php
declare(strict_types=1);

/* =========================================================
   ELIMINAR
========================================================= */
function ventas_eliminar(PDO $pdo): void {
  $body      = read_json_body();
  $src       = !empty($body) ? $body : ($_POST ?? []);
  $idUsuario = get_id_usuario_from_request($pdo, $src);

  $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
  $id = n_int($id);
  if (!$id) fail('Falta id_movimiento.');

  $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
  $beforeSt->execute([':id' => $id]);
  $before = $beforeSt->fetch(PDO::FETCH_ASSOC);
  if (!$before) fail('La venta no existe.');

  $idVenta = get_tipo_operacion_id_venta($pdo);
  if ((int)($before['id_tipo_operacion'] ?? 0) !== $idVenta) {
    fail('Este movimiento no es una venta (tipo_operacion).');
  }

  $estadoFiscal = obtener_estado_fiscal_venta($pdo, (int)$id);
  if ($estadoFiscal['requiere_nota_credito']) {
    fail(
      'Este registro tiene asociado una factura emitida en ARCA, antes de eliminar se necesita crear una nota de crédito.',
      200,
      [
        'requiere_nota_credito'      => true,
        'id_movimiento'              => (int)$id,
        'id_comprobante_original'    => $estadoFiscal['id_comprobante_original'],
        'factura'                    => $estadoFiscal['factura'],
      ]
    );
  }

  try {
    $pdo->beginTransaction();

    $stmtItems = $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id");
    $stmtItems->execute([':id' => $id]);

    $stmtMovComp = $pdo->prepare("DELETE FROM movimientos_comprobantes WHERE id_movimiento = :id");
    $stmtMovComp->execute([':id' => $id]);

    $stmt = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id");
    $stmt->execute([':id' => $id]);

    $pdo->commit();

    audit_safe($pdo, $idUsuario, 'eliminar', 'ventas', $id, [
      'eliminado' => true,
      'antes'     => $before ?: null,
    ]);

    ok(['eliminado' => true, 'id_movimiento' => $id]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    fail('No se pudo eliminar la venta. ' . $e->getMessage());
  }
}