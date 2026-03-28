<?php
declare(strict_types=1);

// backend/modules/login/logout.php
// ✅ Cierra sesión SaaS REAL: borra session_key de balto_master.sesiones
// ✅ No rompe si se incluye desde routes/api.php (no duplica headers/funciones)

if (!function_exists('logout_get_session_key')) {
  function logout_get_session_key(): string {
    // 1) header directo
    $k = $_SERVER['HTTP_X_SESSION'] ?? '';
    if (is_string($k) && trim($k) !== '') return trim($k);

    // 2) fallback getallheaders
    if (function_exists('getallheaders')) {
      $all = getallheaders();
      if (is_array($all)) {
        $k2 = $all['X-Session'] ?? $all['x-session'] ?? '';
        if (is_string($k2) && trim($k2) !== '') return trim($k2);
      }
    }
    return '';
  }
}

try {
  // Si se llama directo (no vía api.php), ponemos CORS/OPTIONS seguros
  if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $origin = $_SERVER["HTTP_ORIGIN"] ?? '';
    if ($origin !== '') {
      header("Access-Control-Allow-Origin: $origin");
      header("Vary: Origin");
    } else {
      header("Access-Control-Allow-Origin: *");
    }
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, X-Session");
    header("Access-Control-Max-Age: 86400");
  }

  if (($_SERVER["REQUEST_METHOD"] ?? "") === "OPTIONS") {
    http_response_code(200);
    echo json_encode(["ok" => true], JSON_UNESCAPED_UNICODE);
    exit;
  }

  if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    http_response_code(405);
    echo json_encode(["exito" => false, "mensaje" => "Método no permitido. Usá POST."], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ Conectar MASTER (si api.php ya lo incluyó, reutiliza $pdo_master)
  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    require_once __DIR__ . '/../../config/db_master.php';
  }
  if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    throw new RuntimeException("PDO master no disponible.");
  }

  // TZ consistente
  @date_default_timezone_set('America/Argentina/Cordoba');
  try { $pdo_master->exec("SET time_zone = '-03:00'"); } catch (Throwable $e) {}

  $sessionKey = logout_get_session_key();

  // ✅ si no vino X-Session, devolvemos OK igual (front limpia todo)
  if ($sessionKey === '') {
    echo json_encode(["exito" => true, "cerrada" => false, "mensaje" => "Sin X-Session (cliente ya estaba limpio)."], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $st = $pdo_master->prepare("DELETE FROM sesiones WHERE session_key = :k");
  $st->execute([':k' => $sessionKey]);

  echo json_encode([
    "exito" => true,
    "cerrada" => ($st->rowCount() > 0),
  ], JSON_UNESCAPED_UNICODE);
  exit;

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(["exito" => false, "mensaje" => "Error cerrando sesión: " . $e->getMessage()], JSON_UNESCAPED_UNICODE);
  exit;
}