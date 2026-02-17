<?php
declare(strict_types=1);

// backend/modules/login/logout.php
// ✅ Cierra sesión SaaS REAL: borra session_key de balto_master.sesiones
// ✅ FIX: evita "Cannot redeclare getSessionKey()" cuando api.php ya incluyó require_session.php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$origin = $_SERVER["HTTP_ORIGIN"] ?? "*";
header("Access-Control-Allow-Origin: $origin");
header("Vary: Origin");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Session");
header("Access-Control-Max-Age: 86400");

if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
  http_response_code(200);
  echo json_encode(["ok" => true], JSON_UNESCAPED_UNICODE);
  exit;
}

function ok(array $arr = []): void {
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $msg, int $httpCode = 200, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

/**
 * ✅ Obtener X-Session sin redeclarar getSessionKey()
 * - Si require_session.php ya está cargado, puede existir getSessionKey()
 * - Si no existe, usamos lectura directa
 */
function logout_get_session_key(): string {
  // 1) si ya existe getSessionKey(), la usamos
  if (function_exists('getSessionKey')) {
    $k = getSessionKey();
    return is_string($k) ? trim($k) : '';
  }

  // 2) fallback directo
  $k = $_SERVER['HTTP_X_SESSION'] ?? '';
  if ((!is_string($k) || trim($k) === '') && function_exists('getallheaders')) {
    $all = getallheaders();
    if (is_array($all)) {
      $k = $all['X-Session'] ?? $all['x-session'] ?? $k;
    }
  }
  return trim((string)$k);
}

try {
  if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    fail("Método no permitido. Usá POST.", 405);
  }

  $sessionKey = logout_get_session_key();

  // ✅ Si no hay header, igual devolvemos OK (cliente puede limpiar igual)
  if ($sessionKey === '') {
    ok(['cerrada' => false, 'mensaje' => 'Sin X-Session (cliente ya estaba limpio).']);
  }

  // ✅ Conectar MASTER (si api.php ya lo incluyó, esto no rompe)
  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    require_once __DIR__ . '/../../config/db_master.php';
  }

  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    throw new RuntimeException("PDO master no disponible.");
  }

  // ✅ Eliminar sesión
  $st = $pdo_master->prepare("DELETE FROM sesiones WHERE session_key = :k");
  $st->execute([':k' => $sessionKey]);

  ok([
    'cerrada' => ($st->rowCount() > 0),
  ]);

} catch (Throwable $e) {
  fail("Error cerrando sesión: " . $e->getMessage(), 500);
}
