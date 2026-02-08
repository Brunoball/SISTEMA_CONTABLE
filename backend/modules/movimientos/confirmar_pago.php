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

  // Opcional: aceptar solo POST
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    echo json_encode([
      "exito" => false,
      "mensaje" => "Método no permitido. Usá POST."
    ], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $input = json_decode(file_get_contents("php://input"), true);
  if (!is_array($input)) $input = [];

  $ids = $input['ids_movimiento'] ?? $input['ids_movimientos'] ?? [];
  $id_medio_pago = (int)($input['id_medio_pago'] ?? $input['idMedioPago'] ?? 0);

  if (!is_array($ids) || count($ids) === 0) {
    echo json_encode(["exito" => false, "mensaje" => "Faltan ids_movimiento"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Normalizar ids
  $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn($x) => $x > 0)));
  if (count($ids) === 0) {
    echo json_encode(["exito" => false, "mensaje" => "ids_movimiento inválidos"], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ Buscar ID de tipo_venta CONTADO
  $stmtTV = $pdo->prepare("
    SELECT id_tipo_venta
    FROM tipos_venta
    WHERE activo = 1
      AND UPPER(nombre) LIKE '%CONTAD%'
    ORDER BY id_tipo_venta ASC
    LIMIT 1
  ");
  $stmtTV->execute();
  $id_contado = (int)($stmtTV->fetchColumn() ?: 0);

  if ($id_contado <= 0) {
    echo json_encode(["exito" => false, "mensaje" => "No existe tipo_venta 'CONTADO'."], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // Validar medio de pago si vino (opcional pero recomendado)
  if ($id_medio_pago > 0) {
    $stmtMP = $pdo->prepare("
      SELECT 1
      FROM medios_pago
      WHERE id_medio_pago = ?
      LIMIT 1
    ");
    $stmtMP->execute([$id_medio_pago]);
    $ok = (int)($stmtMP->fetchColumn() ?: 0);
    if ($ok !== 1) {
      echo json_encode(["exito" => false, "mensaje" => "id_medio_pago inválido."], JSON_UNESCAPED_UNICODE);
      exit;
    }
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
    "mensaje" => "Pago confirmado: movimientos pasados a CONTADO.",
    "actualizados" => $stmt->rowCount(),
    "id_tipo_venta_contado" => $id_contado,
    "id_medio_pago" => $id_medio_pago > 0 ? $id_medio_pago : null,
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
    $pdo->rollBack();
  }

  echo json_encode([
    "exito" => false,
    "mensaje" => "Error: " . $e->getMessage()
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
