<?php
// backend/config/db_master.php
declare(strict_types=1);

function env_master(string $key, ?string $default = null): ?string {
  if (defined($key)) {
    $v = constant($key);
    if ($v !== null && $v !== '') return (string)$v;
  }

  $v = getenv($key);
  if ($v === false || $v === '') return $default;
  return $v;
}

$host   = env_master('MASTER_DB_HOST', 'localhost');
$dbname = env_master('MASTER_DB_NAME', 'u590795856_balto_master');
$user   = env_master('MASTER_DB_USER', 'u590795856_admin_balto');
$pass   = env_master('MASTER_DB_PASS', '');

// ✅ PRO: no hardcodear password en el repo
if ($pass === '') {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Falta MASTER_DB_PASS en el entorno.',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  $pdo_master = new PDO("mysql:host={$host};dbname={$dbname};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ]);

  $pdo_master->exec("SET NAMES utf8mb4");
} catch (Throwable $e) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error de conexión a la base master.',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
