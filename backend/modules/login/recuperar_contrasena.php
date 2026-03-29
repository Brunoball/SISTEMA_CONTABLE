<?php
declare(strict_types=1);

// backend/modules/login/recuperar_contrasena.php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

define('DEBUG_RECUPERAR', true);

function ok(array $arr, int $httpCode = 200): void {
  http_response_code($httpCode);
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge([
    'exito' => false,
    'mensaje' => $msg
  ], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function client_ip_recuperar(): string {
  $ip = $_SERVER['HTTP_CF_CONNECTING_IP']
    ?? $_SERVER['HTTP_X_FORWARDED_FOR']
    ?? $_SERVER['REMOTE_ADDR']
    ?? '';

  if (is_string($ip) && strpos($ip, ',') !== false) {
    $ip = trim(explode(',', $ip)[0]);
  }

  return trim((string)$ip);
}

function mask_email(string $email): string {
  if (!str_contains($email, '@')) {
    return 'tu correo registrado';
  }

  [$local, $domain] = explode('@', $email, 2);

  if (mb_strlen($local) <= 2) {
    return mb_substr($local, 0, 1) . '***@' . $domain;
  }

  return mb_substr($local, 0, 2) . str_repeat('*', min(mb_strlen($local) - 2, 4)) . '@' . $domain;
}

function build_front_base_url(): string {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ((string)($_SERVER['SERVER_PORT'] ?? '') === '443')
    || ((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || (
      !empty($_SERVER['HTTP_CF_VISITOR']) &&
      str_contains((string)$_SERVER['HTTP_CF_VISITOR'], 'https')
    );

  $scheme = $https ? 'https' : 'http';
  $host   = (string)($_SERVER['HTTP_HOST'] ?? '');

  if ($host === '') {
    $host = (string)($_SERVER['SERVER_NAME'] ?? 'localhost');
  }

  return $scheme . '://' . $host;
}

function build_reset_url(string $token): string {
  return build_front_base_url() . '/reset-password?token=' . urlencode($token);
}

try {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido.', 405);
  }

  @date_default_timezone_set('America/Argentina/Cordoba');
  mb_internal_encoding("UTF-8");

  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);

  if (!is_array($data)) {
    $data = $_POST ?? [];
  }

  $usuario = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));

  if ($usuario === '') {
    fail('Ingresá tu nombre de usuario.', 400, DEBUG_RECUPERAR ? [
      'debug' => [
        'raw' => $raw,
        'post' => $_POST,
        'data' => $data
      ]
    ] : []);
  }

  require_once __DIR__ . '/../../config/db_master.php';
  require_once __DIR__ . '/../utils/mailer.php';

  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    throw new RuntimeException('PDO master no disponible.');
  }

  try {
    $pdo_master->exec("SET time_zone = '-03:00'");
  } catch (Throwable $e) {
  }

  $stmt = $pdo_master->prepare("
    SELECT
      idUsuarioMaster,
      usuario,
      email_recuperacion,
      activo
    FROM usuarios_master
    WHERE usuario = :usuario
    LIMIT 1
  ");

  if (!$stmt) {
    throw new RuntimeException('No se pudo preparar la consulta de usuarios_master.');
  }

  $stmt->execute([
    ':usuario' => $usuario
  ]);

  $u = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$u) {
    fail('No encontramos una cuenta válida con ese usuario.', 404);
  }

  if ((int)($u['activo'] ?? 0) !== 1) {
    fail('La cuenta está inactiva.', 403);
  }

  $email = trim((string)($u['email_recuperacion'] ?? ''));
  if ($email === '') {
    fail('La cuenta no tiene un correo de recuperación configurado.', 400);
  }

  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail('El correo de recuperación registrado no es válido.', 400, DEBUG_RECUPERAR ? [
      'debug' => [
        'email_recuperacion' => $email
      ]
    ] : []);
  }

  $idUsuarioMaster = (int)($u['idUsuarioMaster'] ?? 0);
  if ($idUsuarioMaster <= 0) {
    throw new RuntimeException('idUsuarioMaster inválido.');
  }

  $ip = client_ip_recuperar();
  $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

  $stmtInvalidar = $pdo_master->prepare("
    UPDATE password_resets
    SET usado = 1, usado_en = NOW()
    WHERE idUsuarioMaster = :idUsuarioMaster
      AND usado = 0
  ");

  if (!$stmtInvalidar) {
    throw new RuntimeException('No se pudo preparar el UPDATE de password_resets.');
  }

  $stmtInvalidar->execute([
    ':idUsuarioMaster' => $idUsuarioMaster
  ]);

  $token = bin2hex(random_bytes(32));
  $tokenHash = hash('sha256', $token);

  $stmtInsert = $pdo_master->prepare("
    INSERT INTO password_resets
    (
      idUsuarioMaster,
      token_hash,
      expiracion,
      usado,
      creado_en,
      ip_solicitud,
      user_agent
    )
    VALUES
    (
      :idUsuarioMaster,
      :token_hash,
      DATE_ADD(NOW(), INTERVAL 30 MINUTE),
      0,
      NOW(),
      :ip,
      :ua
    )
  ");

  if (!$stmtInsert) {
    throw new RuntimeException('No se pudo preparar el INSERT de password_resets.');
  }

  $stmtInsert->execute([
    ':idUsuarioMaster' => $idUsuarioMaster,
    ':token_hash'      => $tokenHash,
    ':ip'              => $ip,
    ':ua'              => $ua,
  ]);

  $link = build_reset_url($token);

  $subject = 'Recuperar contraseña - Balto';

  $html = "
    <div style='margin:0;padding:24px;background:#f7f8fb;font-family:Arial,Helvetica,sans-serif;color:#111'>
      <div style='max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden'>
        <div style='padding:18px 20px;border-bottom:1px solid #e5e7eb'>
          <h1 style='margin:0;font-size:20px;color:#0f172a'>Balto</h1>
        </div>
        <div style='padding:20px'>
          <h2 style='margin:0 0 12px;color:#0f172a;font-size:18px'>Restablecer contraseña</h2>
          <p style='margin:0 0 10px'>Hola, recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
          <p style='margin:0 0 18px'>Hacé clic en el siguiente botón para continuar:</p>
          <p style='margin:0 0 22px'>
            <a href='{$link}' style='display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600'>
              Restablecer contraseña
            </a>
          </p>
          <p style='margin:0 0 10px;color:#475569'>Este enlace expira en 30 minutos.</p>
          <p style='margin:0;color:#475569'>Si no solicitaste este cambio, podés ignorar este correo.</p>
        </div>
      </div>
    </div>
  ";

  $alt = "Recibimos una solicitud para restablecer tu contraseña.\n\nAbrí este enlace:\n{$link}\n\nEste enlace expira en 30 minutos.";

  $resMail = enviar_mail(
    $email,
    (string)($u['usuario'] ?? ''),
    $subject,
    $html,
    $alt
  );

  if (empty($resMail['exito'])) {
    fail(
      'No se pudo enviar el correo de recuperación.',
      500,
      DEBUG_RECUPERAR ? [
        'debug' => [
          'mail_error' => (string)($resMail['error'] ?? 'Error desconocido')
        ]
      ] : []
    );
  }

  ok([
    'exito'   => true,
    'mensaje' => 'Te enviamos las instrucciones a tu correo registrado.',
    'email'   => mask_email($email),
  ]);

} catch (Throwable $e) {
  error_log('[recuperar_contrasena] ' . $e->getMessage());
  error_log('[recuperar_contrasena][file] ' . $e->getFile() . ':' . $e->getLine());
  error_log('[recuperar_contrasena][trace] ' . $e->getTraceAsString());

  fail(
    'Error del servidor al procesar la recuperación.',
    500,
    DEBUG_RECUPERAR ? [
      'debug' => [
        'error'   => $e->getMessage(),
        'archivo' => $e->getFile(),
        'linea'   => $e->getLine(),
      ]
    ] : []
  );
}
