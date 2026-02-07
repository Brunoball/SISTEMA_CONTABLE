<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../../config/db.php';

try {
  if (!isset($pdo) || !($pdo instanceof PDO)) {
    throw new RuntimeException('Conexión PDO no disponible.');
  }

  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $input = json_decode(file_get_contents("php://input"), true);
  if (!is_array($input)) $input = [];

  $ids = $input['ids_movimiento'] ?? [];
  $id_medio_pago = (int)($input['id_medio_pago'] ?? 0);

  if (!is_array($ids) || count($ids) === 0) {
    echo json_encode(["exito"=>false,"mensaje"=>"Faltan ids_movimiento"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($x)=>$x>0)));
  if (count($ids) === 0) {
    echo json_encode(["exito"=>false,"mensaje"=>"ids_movimiento inválidos"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ Buscar ID de tipo_venta CONTADO (como en tu tabla)
  $stmtTV = $pdo->prepare("
    SELECT id_tipo_venta
    FROM tipos_venta
    WHERE activo = 1 AND UPPER(nombre) LIKE '%CONTAD%'
    ORDER BY id_tipo_venta ASC
    LIMIT 1
  ");
  $stmtTV->execute();
  $id_contado = (int)($stmtTV->fetchColumn() ?: 0);

  if ($id_contado <= 0) {
    echo json_encode(["exito"=>false,"mensaje"=>"No existe tipo_venta 'CONTADO'."], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $placeholders = implode(',', array_fill(0, count($ids), '?'));

  $pdo->beginTransaction();

  // ✅ Pasar a contado + guardar medio de pago si vino
  if ($id_medio_pago > 0) {
    $sql = "
      UPDATE movimientos
      SET id_tipo_venta = ?, id_medio_pago = ?
      WHERE id_movimiento IN ($placeholders)
    ";
    $params = array_merge([$id_contado, $id_medio_pago], $ids);
  } else {
    $sql = "
      UPDATE movimientos
      SET id_tipo_venta = ?
      WHERE id_movimiento IN ($placeholders)
    ";
    $params = array_merge([$id_contado], $ids);
  }

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);

  $pdo->commit();

  echo json_encode([
    "exito" => true,
    "mensaje" => "Pago confirmado: deudas pasadas a CONTADO.",
    "actualizados" => $stmt->rowCount()
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  echo json_encode(["exito"=>false,"mensaje"=>"Error: ".$e->getMessage()], JSON_UNESCAPED_UNICODE);
  exit;
}
