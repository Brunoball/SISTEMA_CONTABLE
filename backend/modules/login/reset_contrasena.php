<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('DEBUG_RESET_PASSWORD', true);

function ok_r(array $arr, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail_r(string $msg, int $code = 400, array $extra = []): void
{
    http_response_code($code);
    echo json_encode(array_merge([
        'exito' => false,
        'mensaje' => $msg,
    ], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        fail_r('Método no permitido.', 405);
    }

    @date_default_timezone_set('America/Argentina/Cordoba');
    if (function_exists('mb_internal_encoding')) {
        mb_internal_encoding('UTF-8');
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST ?? [];
    }

    $action = mb_strtolower(trim((string)($_GET['action'] ?? '')));
    $token  = trim((string)($data['token'] ?? ''));

    if ($action === '') {
        fail_r('Acción no proporcionada.', 400);
    }

    if ($token === '') {
        fail_r('Token no proporcionado.', 400);
    }

    require_once __DIR__ . '/../../config/db_master.php';

    if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
        throw new RuntimeException('PDO master no disponible.');
    }

    $pdo_master->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $tokenHash = hash('sha256', $token);

    $stmt = $pdo_master->prepare("
        SELECT
            pr.idReset,
            pr.idUsuarioMaster,
            pr.expiracion,
            pr.usado
        FROM password_resets pr
        WHERE pr.token_hash = :token_hash
        LIMIT 1
    ");

    if (!$stmt) {
        throw new RuntimeException('No se pudo preparar la consulta de password_resets.');
    }

    $stmt->execute([
        ':token_hash' => $tokenHash
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        fail_r('El enlace no es válido o ya fue utilizado.', 400, [
            'debug' => [
                'detalle' => 'Token no encontrado en password_resets.'
            ]
        ]);
    }

    if ((int)($row['usado'] ?? 0) === 1) {
        fail_r('Este enlace ya fue utilizado. Solicitá uno nuevo.', 400);
    }

    $expiracionRaw = (string)($row['expiracion'] ?? '');
    $expiracionTs = strtotime($expiracionRaw);

    if ($expiracionRaw === '' || $expiracionTs === false) {
        throw new RuntimeException('La columna expiracion tiene un valor inválido.');
    }

    if (time() > $expiracionTs) {
        fail_r('El enlace expiró. Solicitá uno nuevo.', 400, [
            'debug' => [
                'expiracion' => $expiracionRaw,
                'ahora' => date('Y-m-d H:i:s')
            ]
        ]);
    }

    if ($action === 'validar_token_reset') {
        ok_r([
            'exito' => true,
            'mensaje' => 'Token válido.'
        ]);
    }

    if ($action === 'reset_contrasena') {
        $nuevaContra = (string)($data['nueva_contrasena'] ?? '');

        if (mb_strlen($nuevaContra) < 6) {
            fail_r('La contraseña debe tener al menos 6 caracteres.', 400);
        }

        $idUsuarioMaster = (int)($row['idUsuarioMaster'] ?? 0);
        if ($idUsuarioMaster <= 0) {
            throw new RuntimeException('idUsuarioMaster inválido en password_resets.');
        }

        $hash = password_hash($nuevaContra, PASSWORD_BCRYPT, ['cost' => 12]);
        if (!$hash) {
            throw new RuntimeException('No se pudo generar el hash de la contraseña.');
        }

        $stmtUpdate = $pdo_master->prepare("
            UPDATE usuarios_master
            SET hash_contrasena = :hash
            WHERE idUsuarioMaster = :id
        ");

        if (!$stmtUpdate) {
            throw new RuntimeException('No se pudo preparar el UPDATE de usuarios_master.');
        }

        $stmtUpdate->execute([
            ':hash' => $hash,
            ':id' => $idUsuarioMaster
        ]);

        $stmtUsado = $pdo_master->prepare("
            UPDATE password_resets
            SET usado = 1, usado_en = NOW()
            WHERE idReset = :id
        ");

        if (!$stmtUsado) {
            throw new RuntimeException('No se pudo preparar el UPDATE de password_resets.');
        }

        $stmtUsado->execute([
            ':id' => (int)$row['idReset']
        ]);

        ok_r([
            'exito' => true,
            'mensaje' => 'Contraseña actualizada correctamente.'
        ]);
    }

    fail_r('Acción no reconocida.', 400);

} catch (Throwable $e) {
    error_log('[reset_contrasena] ' . $e->getMessage());
    error_log('[reset_contrasena][file] ' . $e->getFile() . ':' . $e->getLine());

    fail_r(
        'Error del servidor. Intentá más tarde.',
        500,
        [
            'debug' => [
                'error' => $e->getMessage(),
                'archivo' => $e->getFile(),
                'linea' => $e->getLine(),
                'action' => (string)($_GET['action'] ?? ''),
            ]
        ]
    );
}