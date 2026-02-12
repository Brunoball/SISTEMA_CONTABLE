<?php
// backend/modules/utils/tenant_resolver.php
declare(strict_types=1);

require_once __DIR__ . '/../../config/db_master.php';

function tenant_json_fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function get_session_key(): string {
  return trim((string)($_SERVER['HTTP_X_SESSION'] ?? ''));
}

function client_ip(): string {
  $ip = $_SERVER['HTTP_CF_CONNECTING_IP']
    ?? $_SERVER['HTTP_X_FORWARDED_FOR']
    ?? $_SERVER['REMOTE_ADDR']
    ?? '';
  if (is_string($ip) && str_contains($ip, ',')) $ip = trim(explode(',', $ip)[0]);
  return trim((string)$ip);
}

function tenant_bootstrap_or_fail(): void {
  global $pdo_master, $pdo;

  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    tenant_json_fail('Conexión master no disponible.', 500);
  }

  $key = get_session_key();
  if ($key === '') {
    tenant_json_fail('Falta X-Session.', 401);
  }

  // ✅ Intento 1: con db_port si existe en tu tabla tenants
  $row = null;

  try {
    $st = $pdo_master->prepare("
      SELECT
        s.session_key,
        s.idUsuarioMaster,
        s.idTenant,
        s.activo AS ses_activo,
        s.expira_en,

        t.db_host,
        t.db_name,
        t.db_user,
        t.db_pass,
        t.db_port,
        t.activo AS tenant_activo
      FROM sesiones s
      INNER JOIN tenants t ON t.idTenant = s.idTenant
      WHERE s.session_key = :k
      LIMIT 1
    ");
    $st->execute([':k' => $key]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
  } catch (Throwable $e) {
    // ✅ Fallback: si NO existe t.db_port en tu tabla, reintentamos sin db_port
    $st = $pdo_master->prepare("
      SELECT
        s.session_key,
        s.idUsuarioMaster,
        s.idTenant,
        s.activo AS ses_activo,
        s.expira_en,

        t.db_host,
        t.db_name,
        t.db_user,
        t.db_pass,
        t.activo AS tenant_activo
      FROM sesiones s
      INNER JOIN tenants t ON t.idTenant = s.idTenant
      WHERE s.session_key = :k
      LIMIT 1
    ");
    $st->execute([':k' => $key]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
  }

  if (!$row) tenant_json_fail('Sesión inválida.', 401);
  if ((int)($row['ses_activo'] ?? 0) !== 1) tenant_json_fail('Sesión inactiva.', 401);
  if ((int)($row['tenant_activo'] ?? 0) !== 1) tenant_json_fail('Tenant inactivo.', 403);

  $exp = (string)($row['expira_en'] ?? '');
  if ($exp !== '' && strtotime($exp) !== false && strtotime($exp) < time()) {
    tenant_json_fail('Sesión expirada.', 401);
  }

  // ✅ update ultimo_uso (si existe la columna)
  try {
    $pdo_master->prepare("
      UPDATE sesiones
      SET ultimo_uso = NOW()
      WHERE session_key = :k
    ")->execute([':k' => $key]);
  } catch (Throwable $e) {
    // si no existe ultimo_uso, no rompemos
  }

  // ✅ Definir constantes para que db.php conecte al tenant (db.php las lee)
  if (!defined('DB_HOST')) define('DB_HOST', (string)($row['db_host'] ?? 'localhost'));
  if (!defined('DB_NAME')) define('DB_NAME', (string)($row['db_name'] ?? ''));
  if (!defined('DB_USER')) define('DB_USER', (string)($row['db_user'] ?? ''));
  if (!defined('DB_PASS')) define('DB_PASS', (string)($row['db_pass'] ?? ''));

  // db_port puede no existir en tenants: fallback 3306
  $port = (string)($row['db_port'] ?? '3306');
  if (!defined('DB_PORT')) define('DB_PORT', $port !== '' ? $port : '3306');

  // Crear $pdo tenant (usa constantes)
  require_once __DIR__ . '/../../config/db.php';

  if (!isset($pdo) || !($pdo instanceof PDO)) {
    tenant_json_fail('No se pudo inicializar conexión del tenant.', 500);
  }

  // Smoke test
  $pdo->query('SELECT 1');
}
