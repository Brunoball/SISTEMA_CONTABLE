<?php
// backend/modules/cuentas_corrientes/comprobantes.php
declare(strict_types=1);

/* =========================================================
   CORS
========================================================= */
$origin = isset($_SERVER['HTTP_ORIGIN']) ? (string)$_SERVER['HTTP_ORIGIN'] : '';

if (!headers_sent()) {
  if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
  } else {
    header("Access-Control-Allow-Origin: *");
  }

  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session, X-IdTenant, X-Id-Tenant, Range');
  header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
}

if (isset($_SERVER['REQUEST_METHOD']) && strtoupper((string)$_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/* =========================================================
   JSON HELPERS
========================================================= */
function cc_comp_json(array $arr, int $httpCode = 200): void
{
  if (!headers_sent()) {
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
  }
  echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function cc_comp_ok(array $arr = []): void
{
  cc_comp_json(array_merge(['exito' => true], $arr), 200);
}

function cc_comp_fail(string $msg, int $httpCode = 400, array $extra = []): void
{
  cc_comp_json(array_merge(['exito' => false, 'mensaje' => $msg], $extra), $httpCode);
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  cc_comp_fail('PDO tenant no disponible.', 500);
}

/* =========================================================
   ACTION
========================================================= */
$action = '';
if (isset($_GET['action'])) {
  $action = (string)$_GET['action'];
} elseif (isset($_POST['action'])) {
  $action = (string)$_POST['action'];
} elseif (isset($_REQUEST['action'])) {
  $action = (string)$_REQUEST['action'];
}
$action = strtolower(trim($action));

/* =========================================================
   HELPERS
========================================================= */
function cc_comp_safe_text($v): string
{
  return trim((string)($v ?? ''));
}

function cc_comp_is_https_request(): bool
{
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
  if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
  $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
  return strtolower($xfp) === 'https';
}

function cc_comp_dirname_n(string $path, int $levels): string
{
  $out = $path;
  for ($i = 0; $i < $levels; $i++) {
    $out = dirname($out);
  }
  return $out;
}

function cc_comp_get_public_html_dir(): string
{
  $apiDir = realpath(cc_comp_dirname_n(__DIR__, 3));
  if ($apiDir && is_dir($apiDir)) {
    $projectDir = realpath($apiDir . '/..');
    if ($projectDir && is_dir($projectDir)) {
      $publicHtml = realpath($projectDir . '/..');
      if ($publicHtml && is_dir($publicHtml)) {
        return $publicHtml;
      }
      return $projectDir;
    }
    return dirname($apiDir);
  }

  return cc_comp_dirname_n(__DIR__, 5);
}

function cc_comp_get_balto_private_dir(): string
{
  $publicHtml = cc_comp_get_public_html_dir();
  $homeDir = realpath($publicHtml . '/..');

  if ($homeDir && is_dir($homeDir . '/balto_private')) {
    $cand = realpath($homeDir . '/balto_private');
    if ($cand && is_dir($cand)) return $cand;
  }

  $apiDir = realpath(cc_comp_dirname_n(__DIR__, 3));
  if ($apiDir) {
    $projectDir = realpath($apiDir . '/..');
    if ($projectDir) {
      $cand1 = realpath($projectDir . '/../balto_private');
      if ($cand1 && is_dir($cand1)) return $cand1;

      $cand2 = realpath($projectDir . '/../../balto_private');
      if ($cand2 && is_dir($cand2)) return $cand2;
    }
  }

  cc_comp_fail('No se encontró la carpeta balto_private.', 500, [
    'public_html' => $publicHtml,
  ]);
}

function cc_comp_get_private_uploads_dir(): string
{
  $baltoPrivate = cc_comp_get_balto_private_dir();
  $uploads = $baltoPrivate . '/uploads';

  if (!is_dir($uploads)) {
    cc_comp_fail('No existe la carpeta balto_private/uploads.', 500, [
      'balto_private' => $baltoPrivate,
      'uploads' => $uploads,
    ]);
  }

  return $uploads;
}

function cc_comp_normalize_db_rel_path(string $path): string
{
  $p = trim(str_replace('\\', '/', $path));
  $p = preg_replace('#/+#', '/', $p);

  while (strpos($p, './') === 0) {
    $p = substr($p, 2);
  }

  $p = ltrim($p, '/');

  if (strpos($p, 'balto_private/uploads/') === 0) {
    $p = substr($p, strlen('balto_private/'));
  }

  if (strpos($p, 'public_html/uploads/') === 0) {
    $p = substr($p, strlen('public_html/'));
  }

  return $p;
}

function cc_comp_is_inside(string $path, string $baseDir): bool
{
  $pathReal = realpath($path);
  $baseReal = realpath($baseDir);

  if (!$pathReal || !$baseReal) return false;

  $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
  $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

  return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
}

function cc_comp_api_php_abs_url(): string
{
  $scheme = cc_comp_is_https_request() ? 'https' : 'http';
  $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';

  $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '';
  $pos = strpos($script, '/api/routes/api.php');

  if ($pos !== false) {
    $prefix = substr($script, 0, $pos);
    return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
  }

  return $scheme . '://' . $host . '/api/routes/api.php';
}

function cc_comp_build_download_url(int $idComp): string
{
  return cc_comp_api_php_abs_url() . '?action=cc_comprobante_descargar&id_comprobante=' . $idComp;
}

/* =========================================================
   DESCARGAR
========================================================= */
if ($action === 'cc_comprobante_descargar') {
  $id = $_GET['id_comprobante'] ?? $_GET['id'] ?? '';
  $id = is_string($id) ? trim($id) : '';

  if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
    cc_comp_fail('Falta id_comprobante válido.', 400);
  }

  $id = (int)$id;

  try {
    $st = $pdo->prepare("
      SELECT
        id_comprobante,
        archivo_path,
        archivo_url,
        archivo_mime,
        archivo_size,
        tipo
      FROM comprobantes_archivos
      WHERE id_comprobante = :id
      LIMIT 1
    ");
    $st->execute([':id' => $id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      cc_comp_fail('Comprobante no encontrado.', 404);
    }

    $uploadsBase = cc_comp_get_private_uploads_dir();

    $rel = cc_comp_safe_text($row['archivo_path'] ?? '');
    if ($rel === '') {
      $rel = cc_comp_safe_text($row['archivo_url'] ?? '');
    }

    $rel = cc_comp_normalize_db_rel_path($rel);

    if ($rel === '') {
      cc_comp_fail('Comprobante sin ruta.', 500);
    }

    $relWithoutUploads = (strpos($rel, 'uploads/') === 0)
      ? substr($rel, strlen('uploads/'))
      : ltrim($rel, '/');

    $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

    if (!is_file($abs)) {
      cc_comp_fail('Archivo no existe en disco.', 404, [
        'abs' => $abs,
        'rel' => $rel,
        'uploadsBase' => $uploadsBase,
      ]);
    }

    if (!cc_comp_is_inside($abs, $uploadsBase)) {
      cc_comp_fail('Ruta inválida.', 403, [
        'abs' => $abs,
        'uploadsBase' => $uploadsBase,
      ]);
    }

    $mime = cc_comp_safe_text($row['archivo_mime'] ?? '');
    if ($mime === '') $mime = 'application/octet-stream';

    $filesize = (int)filesize($abs);
    $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
    if ($ext === '') $ext = 'bin';

    $filename = 'cc_comprobante_' . $id . '.' . $ext;

    if (!headers_sent()) {
      header('Content-Type: ' . $mime);
      header('Content-Disposition: inline; filename="' . $filename . '"');
      header('Accept-Ranges: bytes');
      header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    }

    $range = isset($_SERVER['HTTP_RANGE']) ? (string)$_SERVER['HTTP_RANGE'] : '';
    if ($range && preg_match('/bytes=(\d+)-(\d*)/i', $range, $m)) {
      $start = (int)$m[1];
      $end = ($m[2] !== '') ? (int)$m[2] : ($filesize - 1);

      if ($end >= $filesize) $end = $filesize - 1;
      if ($start < 0) $start = 0;

      if ($start > $end) {
        http_response_code(416);
        exit;
      }

      $length = $end - $start + 1;

      if (!headers_sent()) {
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $filesize);
        header('Content-Length: ' . $length);
      }

      http_response_code(206);

      $fh = fopen($abs, 'rb');
      if ($fh === false) exit;

      fseek($fh, $start);

      $buf = 8192;
      $remaining = $length;

      while ($remaining > 0 && !feof($fh)) {
        $read = ($remaining > $buf) ? $buf : $remaining;
        $data = fread($fh, $read);
        if ($data === false) break;
        echo $data;
        $remaining -= strlen($data);
      }

      fclose($fh);
      exit;
    }

    if (!headers_sent()) {
      header('Content-Length: ' . $filesize);
    }

    readfile($abs);
    exit;
  } catch (Throwable $e) {
    cc_comp_fail('Error al descargar comprobante de cuenta corriente: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   INFO
========================================================= */
if ($action === 'cc_comprobante_info') {
  $id = $_GET['id_comprobante'] ?? $_GET['id'] ?? '';
  $id = is_string($id) ? trim($id) : '';

  if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
    cc_comp_fail('Falta id_comprobante válido.', 400);
  }

  $id = (int)$id;

  try {
    $st = $pdo->prepare("
      SELECT
        id_comprobante,
        tipo,
        archivo_url,
        archivo_path,
        archivo_mime,
        archivo_size,
        sha256
      FROM comprobantes_archivos
      WHERE id_comprobante = :id
      LIMIT 1
    ");
    $st->execute([':id' => $id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      cc_comp_fail('Comprobante no encontrado.', 404);
    }

    $row['cc_download_url'] = cc_comp_build_download_url((int)$row['id_comprobante']);

    cc_comp_ok([
      'data' => $row,
    ]);
  } catch (Throwable $e) {
    cc_comp_fail('Error obteniendo info del comprobante de cuenta corriente: ' . $e->getMessage(), 500);
  }
}

cc_comp_fail('Acción de comprobantes de cuentas corrientes no válida: ' . $action, 400);