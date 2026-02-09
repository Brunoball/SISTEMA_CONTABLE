<?php
// backend/modules/global/usuario_tema_actualizar.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../config/db.php'; // $pdo

function ok(array $arr): void {
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido.', 405);
  }

  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) $data = $_POST ?? [];

  $idUsuario = (int)($data['idUsuario'] ?? 0);
  $tema = strtolower(trim((string)($data['tema'] ?? '')));

  if ($idUsuario <= 0) fail('Falta idUsuario.', 400);
  if (!in_array($tema, ['claro', 'oscuro'], true)) fail('Tema inválido. Use claro u oscuro.', 400);

  // ✅ opcional: validar que el usuario exista
  $chk = $pdo->prepare("SELECT idUsuario FROM usuarios WHERE idUsuario = :id LIMIT 1");
  $chk->execute([':id' => $idUsuario]);
  if (!$chk->fetchColumn()) {
    fail('Usuario no encontrado.', 404);
  }

  $upd = $pdo->prepare("UPDATE usuarios SET tema = :tema WHERE idUsuario = :id LIMIT 1");
  $upd->execute([
    ':tema' => $tema,
    ':id' => $idUsuario,
  ]);

  ok([
    'exito' => true,
    'tema' => $tema,
  ]);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error del servidor.',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
