<?php
// backend/config/db.php
// Configuración de la base de datos
// php -S localhost:3001 -c "C:\PHP\php1\php.ini"

$host   = defined('DB_HOST') ? (string)DB_HOST : 'localhost';
$dbname = defined('DB_NAME') ? (string)DB_NAME : 'sistema_contable';
$user   = defined('DB_USER') ? (string)DB_USER : 'root';
$pass   = defined('DB_PASS') ? (string)DB_PASS : 'Gastex2233';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    die(json_encode([
        'exito' => false,
        'mensaje' => 'Error de conexión a la base de datos: ' . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE));
}
