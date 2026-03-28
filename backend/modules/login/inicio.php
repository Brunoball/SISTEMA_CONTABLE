<?php
// backend/modules/login/inicio.php
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

define('DEBUG_LOGIN', false);

function ok(array $arr): void {
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function verify_password(string $inputPass, string $storedHash): bool {
  $stored = trim((string)$storedHash);
  if ($stored === '') return false;

  if (preg_match('/^[a-f0-9]{64}$/i', $stored)) {
    $calc = hash('sha256', $inputPass);
    return hash_equals(strtolower($stored), strtolower($calc));
  }

  if (strpos($stored, '$2y$') === 0 || strpos($stored, '$argon2') === 0) {
    return password_verify($inputPass, $stored);
  }

  return hash_equals($stored, $inputPass);
}

function client_ip(): string {
  $ip = $_SERVER['HTTP_CF_CONNECTING_IP']
    ?? $_SERVER['HTTP_X_FORWARDED_FOR']
    ?? $_SERVER['REMOTE_ADDR']
    ?? '';
  if (is_string($ip) && strpos($ip, ',') !== false) $ip = trim(explode(',', $ip)[0]);
  return trim((string)$ip);
}

function build_base_url_login(): string {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ((string)($_SERVER['SERVER_PORT'] ?? '') === '443');

  $scheme = $https ? 'https' : 'http';
  $host   = (string)($_SERVER['HTTP_HOST'] ?? '');
  if ($host === '') {
    $host = (string)($_SERVER['SERVER_NAME'] ?? 'localhost');
  }

  $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
  $dir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');

  if ($dir === '/' || $dir === '\\') {
    $dir = '';
  }

  return $scheme . '://' . $host . $dir;
}

try {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido.', 405);
  }

  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) $data = $_POST ?? [];

  $nombre     = trim((string)($data['nombre'] ?? $data['usuario'] ?? ''));
  $contrasena = (string)($data['contrasena'] ?? $data['password'] ?? '');

  if ($nombre === '' || $contrasena === '') {
    fail('Faltan datos.');
  }

  @date_default_timezone_set('America/Argentina/Cordoba');

  require_once __DIR__ . '/../../config/db_master.php';

  try { $pdo_master->exec("SET time_zone = '-03:00'"); } catch (Throwable $e) {}

  $sql = "
    SELECT
      um.idUsuarioMaster,
      um.idTenant,
      um.usuario,
      um.hash_contrasena,
      um.rol,
      um.tema,
      um.activo AS usuario_activo,
      um.fecha_creacion,

      t.nombre     AS tenant_nombre,
      t.logo_url,
      t.logo_icono_url,
      t.db_host,
      t.db_name,
      t.db_user,
      t.db_pass,
      t.idPlan,
      t.activo     AS tenant_activo,

      ps.nombre    AS plan_nombre,
      ps.nivel     AS plan_nivel,
      ps.activo    AS plan_activo
    FROM usuarios_master um
    INNER JOIN tenants t ON t.idTenant = um.idTenant
    LEFT JOIN planes_saas ps ON ps.idPlan = t.idPlan
    WHERE um.usuario = :usuario
    LIMIT 1
  ";
  $stmt = $pdo_master->prepare($sql);
  $stmt->execute([':usuario' => $nombre]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);

  $ip = client_ip();
  $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');

  $audit = $pdo_master->prepare("
    INSERT INTO login_auditoria (idUsuarioMaster, idTenant, usuario, ip, user_agent, exito, creado_en)
    VALUES (:idUsuarioMaster, :idTenant, :usuario, :ip, :ua, :exito, NOW())
  ");

  if (DEBUG_LOGIN) {
    ok([
      'debug' => true,
      'input_usuario' => $nombre,
      'usuario_db' => $u,
      'calc_sha256' => hash('sha256', $contrasena),
    ]);
  }

  if (!$u) {
    $audit->execute([
      ':idUsuarioMaster' => null,
      ':idTenant' => null,
      ':usuario' => $nombre,
      ':ip' => $ip,
      ':ua' => $ua,
      ':exito' => 0,
    ]);
    fail('Credenciales incorrectas.', 401);
  }

  if ((int)($u['usuario_activo'] ?? 0) !== 1) {
    $audit->execute([
      ':idUsuarioMaster' => (int)$u['idUsuarioMaster'],
      ':idTenant' => (int)$u['idTenant'],
      ':usuario' => (string)$u['usuario'],
      ':ip' => $ip,
      ':ua' => $ua,
      ':exito' => 0,
    ]);
    fail('Usuario inactivo.', 403);
  }

  if ((int)($u['tenant_activo'] ?? 0) !== 1) {
    $audit->execute([
      ':idUsuarioMaster' => (int)$u['idUsuarioMaster'],
      ':idTenant' => (int)$u['idTenant'],
      ':usuario' => (string)$u['usuario'],
      ':ip' => $ip,
      ':ua' => $ua,
      ':exito' => 0,
    ]);
    fail('Tenant inactivo.', 403);
  }

  $guardado = (string)($u['hash_contrasena'] ?? '');
  if (!verify_password($contrasena, $guardado)) {
    $audit->execute([
      ':idUsuarioMaster' => (int)$u['idUsuarioMaster'],
      ':idTenant' => (int)$u['idTenant'],
      ':usuario' => (string)$u['usuario'],
      ':ip' => $ip,
      ':ua' => $ua,
      ':exito' => 0,
    ]);
    fail('Credenciales incorrectas.', 401);
  }

  $rol = strtolower(trim((string)($u['rol'] ?? 'vista')));
  $rol = in_array($rol, ['admin', 'vista'], true) ? $rol : 'vista';

  $tema = strtolower(trim((string)($u['tema'] ?? 'claro')));
  $tema = in_array($tema, ['claro', 'oscuro'], true) ? $tema : 'claro';

  $planNivel = (int)($u['plan_nivel'] ?? 1);
  if ($planNivel < 1 || $planNivel > 3) $planNivel = 1;

  $planNombre = (string)($u['plan_nombre'] ?? 'basico');
  if ($planNombre === '') $planNombre = 'basico';

  $planActivo = (int)($u['plan_activo'] ?? 1);
  if ($planActivo !== 1) {
    $planNivel = 1;
    $planNombre = 'basico';
  }

  $audit->execute([
    ':idUsuarioMaster' => (int)$u['idUsuarioMaster'],
    ':idTenant' => (int)$u['idTenant'],
    ':usuario' => (string)$u['usuario'],
    ':ip' => $ip,
    ':ua' => $ua,
    ':exito' => 1,
  ]);

  $sessionKey = bin2hex(random_bytes(32));
  $ttlMinutes = 30;

  $pdo_master->prepare("
    INSERT INTO sesiones (session_key, idUsuarioMaster, idTenant, creado_en, ultimo_uso, expira_en, ip, user_agent, activo)
    VALUES (:k, :u, :t, NOW(), NOW(), DATE_ADD(NOW(), INTERVAL :ttl MINUTE), :ip, :ua, 1)
  ")->execute([
    ':k' => $sessionKey,
    ':u' => (int)$u['idUsuarioMaster'],
    ':t' => (int)$u['idTenant'],
    ':ttl' => $ttlMinutes,
    ':ip' => $ip,
    ':ua' => $ua,
  ]);

  $apiBase = build_base_url_login();

  $tenantLogoPrincipalViewUrl = $apiBase . '/api.php?action=tenant_logo_ver&tipo=principal';
  $tenantLogoIconoViewUrl    = $apiBase . '/api.php?action=tenant_logo_ver&tipo=icono';

  ok([
    'exito' => true,
    'session_key' => $sessionKey,
    'usuario' => [
      'idUsuario' => (int)$u['idUsuarioMaster'],
      'idUsuarioMaster' => (int)$u['idUsuarioMaster'],
      'idTenant' => (int)$u['idTenant'],
      'tenant_nombre' => (string)($u['tenant_nombre'] ?? ''),

      'tenant_logo_url_db' => (string)($u['logo_url'] ?? ''),
      'tenant_logo_icono_url_db' => (string)($u['logo_icono_url'] ?? ''),

      'tenant_logo_principal_view_url' => $tenantLogoPrincipalViewUrl,
      'tenant_logo_icono_view_url' => $tenantLogoIconoViewUrl,

      'Nombre_Completo' => (string)$u['usuario'],
      'nombre' => (string)$u['usuario'],
      'rol' => $rol,
      'tema' => $tema,
      'idPlan' => (int)($u['idPlan'] ?? 1),
      'plan_nombre' => $planNombre,
      'plan_nivel' => $planNivel,
      'Fecha_Creacion' => (string)($u['fecha_creacion'] ?? ''),
    ],
  ]);

} catch (Throwable $e) {
  http_response_code(200);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error del servidor.',
    'detalle' => DEBUG_LOGIN ? $e->getMessage() : null,
  ], JSON_UNESCAPED_UNICODE);
  exit;
}