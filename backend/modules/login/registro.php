<?php
// backend/routes/registro.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../config/db.php'; // Debe definir $pdo (PDO conectado)

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['exito' => false, 'mensaje' => 'Método no permitido.']);
        exit;
    }

    // Acepta JSON o x-www-form-urlencoded
    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) $data = $_POST ?? [];

    // El front envía: nombre, contrasena, rol
    $nombre     = trim((string)($data['nombre'] ?? ''));
    $contrasena = (string)($data['contrasena'] ?? '');
    $rol        = strtolower(trim((string)($data['rol'] ?? '')));

    // Validaciones
    if ($nombre === '' || $contrasena === '' || $rol === '') {
        echo json_encode(['exito' => false, 'mensaje' => 'Faltan datos.']);
        exit;
    }
    if (mb_strlen($nombre) < 4 || mb_strlen($nombre) > 100) {
        echo json_encode(['exito' => false, 'mensaje' => 'El usuario debe tener entre 4 y 100 caracteres.']);
        exit;
    }
    if (strlen($contrasena) < 6) {
        echo json_encode(['exito' => false, 'mensaje' => 'La contraseña debe tener al menos 6 caracteres.']);
        exit;
    }
    if (!in_array($rol, ['vista','admin'], true)) {
        echo json_encode(['exito' => false, 'mensaje' => 'Rol inválido (use "vista" o "admin").']);
        exit;
    }

    // Unicidad por Nombre_Completo (la columna es UNIQUE)
    $st = $pdo->prepare("SELECT COUNT(*) FROM `usuarios` WHERE UPPER(`Nombre_Completo`) = UPPER(:n)");
    $st->execute([':n' => $nombre]);
    if ((int)$st->fetchColumn() > 0) {
        echo json_encode(['exito' => false, 'mensaje' => 'El usuario ya existe.']);
        exit;
    }

    // Hash seguro
    $hash = password_hash($contrasena, PASSWORD_BCRYPT);

    // Insert directo a la nueva estructura
    $st = $pdo->prepare("
        INSERT INTO `usuarios` (`Nombre_Completo`, `Hash_Contrasena`, `rol`)
        VALUES (:nombre, :hash, :rol)
    ");
    $ok = $st->execute([
        ':nombre' => $nombre,
        ':hash'   => $hash,
        ':rol'    => $rol,
    ]);

    if (!$ok) {
        echo json_encode(['exito' => false, 'mensaje' => 'Error al registrar usuario.']);
        exit;
    }

    $id = (int)$pdo->lastInsertId();

    echo json_encode([
        'exito'   => true,
        'usuario' => [
            'idUsuario'       => $id,
            'Nombre_Completo' => $nombre,
            'rol'             => $rol, // 'admin' | 'vista'
        ],
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'exito'   => false,
        'mensaje' => 'Error del servidor.',
        // 'detalle' => $e->getMessage(), // descomentar solo para depurar
    ], JSON_UNESCAPED_UNICODE);
}