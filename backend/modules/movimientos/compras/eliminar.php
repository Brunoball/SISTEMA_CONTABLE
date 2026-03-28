<?php
// backend/modules/movimientos/compras/eliminar.php
declare(strict_types=1);

if (!function_exists('compras_eliminar')) {
  function compras_eliminar(PDO $pdo): void {
    $body = compra_read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = compra_get_id_usuario_from_request($src);

    $id = $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? null);
    $id = compra_n_int($id);

    if (!$id) {
      compra_fail('Falta id_movimiento.');
    }

    $beforeSt = $pdo->prepare("SELECT * FROM movimientos WHERE id_movimiento = :id LIMIT 1");
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
      $stmt = $pdo->prepare("DELETE FROM movimientos WHERE id_movimiento = :id");
      $stmt->execute([':id' => $id]);

      compra_auditar_seguro($pdo, $idUsuario, 'eliminar', 'compras', $id, [
        'eliminado' => true,
        'antes' => $before ?: null,
      ]);

      compra_ok(['eliminado' => true, 'id_movimiento' => $id]);
    } catch (Throwable $e) {
      compra_fail('No se pudo eliminar la compra. ' . $e->getMessage());
    }
  }
}