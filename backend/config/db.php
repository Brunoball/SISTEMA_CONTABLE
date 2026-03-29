<?php
// backend/config/db.php
declare(strict_types=1);

mysqli_report(MYSQLI_REPORT_OFF);

/**
 * Lee config en este orden:
 * 1) Constantes (DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_PORT) -> para multi-tenant
 * 2) Variables de entorno (getenv)
 * 3) Default
 */
function env(string $key, ?string $default = null): ?string {
  if (defined($key)) {
    $v = constant($key);
    if ($v !== null && $v !== '') return (string)$v;
  }

  $v = getenv($key);
  if ($v === false || $v === '') return $default;
  return $v;
}

$DB_HOST = env('DB_HOST', 'localhost');
$DB_NAME = env('DB_NAME', 'u590795856_balto_master'); // fallback local
$DB_USER = env('DB_USER', 'u590795856_admin_balto');
$DB_PASS = env('DB_PASS', '');
$DB_PORT = (int)(env('DB_PORT', '3306'));

try {
  if ($DB_NAME === '' || $DB_USER === '') {
    throw new RuntimeException("DB_NAME o DB_USER vacío. Revisá env/constantes.");
  }

  $dsn = "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4";
  $pdo = new PDO($dsn, $DB_USER, $DB_PASS, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ]);

  $pdo->exec("SET NAMES utf8mb4");
} catch (Throwable $e) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'No se pudo conectar a la base de datos.',
    'debug'   => [
      'host' => $DB_HOST,
      'db'   => $DB_NAME,
      'user' => $DB_USER,
      'pass' => ($DB_PASS === '' ? 'VACIO' : 'OK'),
      'port' => $DB_PORT,
      'err'  => $e->getMessage(),
    ]
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
