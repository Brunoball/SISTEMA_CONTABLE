<?php
declare(strict_types=1);

// backend/modules/cheques/cheques_cartera/cheques_cartera_comprobante_ver.php

/* =========================================================
   CORS / HEADERS BASE
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
   PDO
========================================================= */
global $pdo;

/* =========================================================
   HELPERS JSON
========================================================= */
if (!function_exists('cheq_comp_json')) {
  function cheq_comp_json(array $arr, int $httpCode = 200): void
  {
    while (ob_get_level() > 0) {
      @ob_end_clean();
    }

    if (!headers_sent()) {
      http_response_code($httpCode);
      header('Content-Type: application/json; charset=utf-8');
      header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    }

    echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('cheq_comp_fail')) {
  function cheq_comp_fail(string $msg, int $httpCode = 400, array $extra = []): void
  {
    cheq_comp_json(array_merge([
      'exito'   => false,
      'mensaje' => $msg,
    ], $extra), $httpCode);
  }
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
  cheq_comp_fail('PDO tenant no disponible.', 500);
}

/* =========================================================
   HELPERS GENERALES
========================================================= */
if (!function_exists('cheq_comp_safe_text')) {
  function cheq_comp_safe_text($v): string
  {
    return trim((string)($v ?? ''));
  }
}

if (!function_exists('cheq_comp_dirname_n')) {
  function cheq_comp_dirname_n(string $path, int $levels): string
  {
    $out = $path;
    for ($i = 0; $i < $levels; $i++) {
      $out = dirname($out);
    }
    return $out;
  }
}

if (!function_exists('cheq_comp_get_public_html_dir')) {
  function cheq_comp_get_public_html_dir(): string
  {
    $apiDir = realpath(cheq_comp_dirname_n(__DIR__, 4)); // .../api
    if ($apiDir && is_dir($apiDir)) {
      $projectDir = realpath($apiDir . DIRECTORY_SEPARATOR . '..');
      if ($projectDir && is_dir($projectDir)) {
        return $projectDir;
      }
      return $apiDir;
    }

    $fallback = realpath(dirname(__DIR__, 5));
    if ($fallback && is_dir($fallback)) {
      return $fallback;
    }

    cheq_comp_fail('No se pudo resolver public_html del proyecto.', 500, [
      'debug' => [
        'dir_actual' => __DIR__,
      ]
    ]);
  }
}

if (!function_exists('cheq_comp_get_private_uploads_dir')) {
  function cheq_comp_get_private_uploads_dir(): string
  {
    $publicHtml = cheq_comp_get_public_html_dir();
    $parentDir  = realpath($publicHtml . DIRECTORY_SEPARATOR . '..');

    $candidates = [];

    if ($parentDir) {
      $candidates[] = $parentDir . DIRECTORY_SEPARATOR . 'balto_private' . DIRECTORY_SEPARATOR . 'uploads';
      $candidates[] = $parentDir . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'uploads';
    }

    $candidates[] = $publicHtml . DIRECTORY_SEPARATOR . 'balto_private' . DIRECTORY_SEPARATOR . 'uploads';
    $candidates[] = $publicHtml . DIRECTORY_SEPARATOR . 'private' . DIRECTORY_SEPARATOR . 'uploads';

    foreach ($candidates as $cand) {
      $real = realpath($cand);
      if ($real && is_dir($real)) {
        return $real;
      }
    }

    cheq_comp_fail('No se pudo resolver la carpeta privada de uploads.', 500, [
      'debug' => [
        'publicHtml' => $publicHtml,
        'candidatos' => $candidates,
      ]
    ]);
  }
}

if (!function_exists('cheq_comp_normalize_db_rel_path')) {
  function cheq_comp_normalize_db_rel_path(string $path): string
  {
    $p = trim(str_replace('\\', '/', $path));
    $p = preg_replace('#/+#', '/', $p);

    while (strpos($p, './') === 0) {
      $p = substr($p, 2);
    }

    $p = ltrim($p, '/');

    if (preg_match('#^https?://#i', $p)) {
      $parsed = parse_url($p, PHP_URL_QUERY);
      if (is_string($parsed) && $parsed !== '') {
        parse_str($parsed, $qs);
        foreach (['archivo_path', 'path', 'file', 'archivo'] as $k) {
          if (!empty($qs[$k]) && is_string($qs[$k])) {
            $p = trim(str_replace('\\', '/', $qs[$k]));
            $p = preg_replace('#/+#', '/', $p);
            $p = ltrim($p, '/');
            break;
          }
        }
      }
    }

    if (strpos($p, 'balto_private/uploads/') === 0) {
      $p = substr($p, strlen('balto_private/'));
    }

    if (strpos($p, 'private/uploads/') === 0) {
      $p = substr($p, strlen('private/'));
    }

    if (strpos($p, 'public_html/uploads/') === 0) {
      $p = substr($p, strlen('public_html/'));
    }

    return $p;
  }
}

if (!function_exists('cheq_comp_is_inside')) {
  function cheq_comp_is_inside(string $path, string $baseDir): bool
  {
    $pathReal = realpath($path);
    $baseReal = realpath($baseDir);

    if (!$pathReal || !$baseReal) return false;

    $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
    $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

    return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
  }
}

if (!function_exists('cheq_comp_guess_mime_from_extension')) {
  function cheq_comp_guess_mime_from_extension(string $path): string
  {
    $ext = strtolower((string)pathinfo($path, PATHINFO_EXTENSION));

    return match ($ext) {
      'pdf'  => 'application/pdf',
      'png'  => 'image/png',
      'jpg', 'jpeg' => 'image/jpeg',
      'webp' => 'image/webp',
      'gif'  => 'image/gif',
      default => 'application/octet-stream',
    };
  }
}

if (!function_exists('cheq_comp_safe_filename')) {
  function cheq_comp_safe_filename(string $name, string $fallback = 'comprobante.pdf'): string
  {
    $name = trim($name);
    if ($name === '') {
      $name = $fallback;
    }

    $name = preg_replace('/[^\w\-.áéíóúÁÉÍÓÚñÑüÜ]+/u', '_', $name);
    $name = trim((string)$name, '._');

    return $name !== '' ? $name : $fallback;
  }
}

/* =========================================================
   MAIN
========================================================= */
$idCheque = isset($_GET['id_cheque']) && ctype_digit((string)$_GET['id_cheque'])
  ? (int)$_GET['id_cheque']
  : 0;

if ($idCheque <= 0) {
  cheq_comp_fail('ID de cheque inválido.', 400);
}

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  $sql = "
    SELECT *
    FROM (
      SELECT
        mc.id_cheque,
        mc.id_movimiento,
        ca.id_comprobante,
        ca.tipo,
        ca.archivo_url,
        ca.archivo_path,
        ca.archivo_mime,
        ca.archivo_size,
        ca.sha256,
        ca.created_at,
        1 AS prioridad
      FROM movimientos_cheques mc
      INNER JOIN comprobantes_archivos ca
        ON ca.id_comprobante = mc.id_comprobante
      WHERE mc.id_cheque = :id_cheque_directo
        AND mc.tipo = 'cheque'
        AND mc.activo = 1

      UNION ALL

      SELECT
        mc.id_cheque,
        mc.id_movimiento,
        ca.id_comprobante,
        ca.tipo,
        ca.archivo_url,
        ca.archivo_path,
        ca.archivo_mime,
        ca.archivo_size,
        ca.sha256,
        ca.created_at,
        2 AS prioridad
      FROM movimientos_cheques mc
      INNER JOIN movimientos_comprobantes mco
        ON mco.id_movimiento = mc.id_movimiento
      INNER JOIN comprobantes_archivos ca
        ON ca.id_comprobante = mco.id_comprobante
      WHERE mc.id_cheque = :id_cheque_rel
        AND mc.tipo = 'cheque'
        AND mc.activo = 1
    ) t
    ORDER BY t.prioridad ASC, t.id_comprobante DESC
    LIMIT 1
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->bindValue(':id_cheque_directo', $idCheque, PDO::PARAM_INT);
  $stmt->bindValue(':id_cheque_rel', $idCheque, PDO::PARAM_INT);
  $stmt->execute();

  $row = $stmt->fetch(PDO::FETCH_ASSOC);

  if (!$row) {
    cheq_comp_fail('El cheque no tiene comprobante relacionado.', 404);
  }

  $idComp      = (int)($row['id_comprobante'] ?? 0);
  $archivoPath = cheq_comp_safe_text($row['archivo_path'] ?? '');
  $archivoUrl  = cheq_comp_safe_text($row['archivo_url'] ?? '');
  $mime        = cheq_comp_safe_text($row['archivo_mime'] ?? '');
  $tipo        = strtoupper(cheq_comp_safe_text($row['tipo'] ?? 'CHEQUE'));

  $uploadsBase = cheq_comp_get_private_uploads_dir();

  $rel = $archivoPath !== '' ? $archivoPath : $archivoUrl;
  $rel = cheq_comp_normalize_db_rel_path($rel);

  if ($rel === '') {
    cheq_comp_fail('Comprobante sin ruta.', 500, [
      'debug' => [
        'id_cheque'      => $idCheque,
        'id_comprobante' => $idComp,
        'archivo_path'   => $archivoPath,
        'archivo_url'    => $archivoUrl,
      ]
    ]);
  }

  $relWithoutUploads = (strpos($rel, 'uploads/') === 0)
    ? substr($rel, strlen('uploads/'))
    : ltrim($rel, '/');

  $abs = rtrim($uploadsBase, '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relWithoutUploads);

  if (!is_file($abs)) {
    cheq_comp_fail('Archivo no existe en disco.', 404, [
      'debug' => [
        'id_cheque'      => $idCheque,
        'id_comprobante' => $idComp,
        'archivo_path'   => $archivoPath,
        'archivo_url'    => $archivoUrl,
        'rel'            => $rel,
        'abs'            => $abs,
        'uploadsBase'    => $uploadsBase,
      ]
    ]);
  }

  if (!cheq_comp_is_inside($abs, $uploadsBase)) {
    cheq_comp_fail('Ruta inválida.', 403, [
      'debug' => [
        'abs'         => $abs,
        'uploadsBase' => $uploadsBase,
      ]
    ]);
  }

  if ($mime === '') {
    $mime = cheq_comp_guess_mime_from_extension($abs);
  }

  $filesize = (int)filesize($abs);
  $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
  if ($ext === '') {
    $ext = ($mime === 'application/pdf') ? 'pdf' : 'bin';
  }

  $filename = cheq_comp_safe_filename(
    $tipo . '_CHEQUE_' . $idCheque . '.' . $ext,
    'COMPROBANTE_CHEQUE_' . $idCheque . '.' . $ext
  );

  while (ob_get_level() > 0) {
    @ob_end_clean();
  }

  if (function_exists('ini_set')) {
    @ini_set('zlib.output_compression', 'Off');
    @ini_set('output_buffering', 'Off');
  }

  if (!headers_sent()) {
    header('Content-Type: ' . $mime);
    header('Content-Disposition: inline; filename="' . $filename . '"');
    header('Accept-Ranges: bytes');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('X-Content-Type-Options: nosniff');
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
    if ($fh === false) {
      exit;
    }

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
  cheq_comp_fail('Error al obtener el comprobante del cheque: ' . $e->getMessage(), 500, [
    'debug' => [
      'archivo' => $e->getFile(),
      'linea'   => $e->getLine(),
    ]
  ]);
}