<?php
// backend/config/db_master.php
declare(strict_types=1);

// ⚠️ Ajustá credenciales de tu MySQL master
$host   = 'localhost';
$dbname = 'balto_master';
$user   = 'root';
$pass   = 'Gastex2233';

try {
  $pdo_master = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
  ]);
} catch (PDOException $e) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error de conexión a la base master.',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
