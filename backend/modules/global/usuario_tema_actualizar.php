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

  // ✅ Aceptamos ambos nombres por compat:
  // - idUsuario (tu frontend actual)
  // - idUsuarioMaster (por si querés ser más explícito)
  $idUsuarioMaster = (int)($data['idUsuarioMaster'] ?? $data['idUsuario'] ?? 0);
  $tema = strtolower(trim((string)($data['tema'] ?? '')));

  if ($idUsuarioMaster <= 0) fail('Falta idUsuarioMaster.', 400);
  if (!in_array($tema, ['claro', 'oscuro'], true)) {
    fail('Tema inválido. Use claro u oscuro.', 400);
  }

  // ✅ Conexión MASTER (balto_master)
  require_once __DIR__ . '/../../config/db_master.php'; // -> $pdo_master

  // ⚠️ OJO: tu login usa "usuarios_master" (sin s). Mantengo eso.
  // Si tu tabla se llama "usuarios_masters", cambiá acá:
  $TABLE = 'usuarios_master';

  // ✅ validar existencia
  $chk = $pdo_master->prepare("SELECT idUsuarioMaster FROM {$TABLE} WHERE idUsuarioMaster = :id LIMIT 1");
  $chk->execute([':id' => $idUsuarioMaster]);
  if (!$chk->fetchColumn()) {
    fail('Usuario master no encontrado.', 404);
  }

  // ✅ update tema en MASTER
  $upd = $pdo_master->prepare("UPDATE {$TABLE} SET tema = :tema WHERE idUsuarioMaster = :id LIMIT 1");
  $upd->execute([
    ':tema' => $tema,
    ':id' => $idUsuarioMaster,
  ]);

  ok([
    'exito' => true,
    'tema' => $tema,
    'idUsuarioMaster' => $idUsuarioMaster,
  ]);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error del servidor.',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
