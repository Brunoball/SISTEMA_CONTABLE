<?php
// backend/modules/movimientos/comprobantes.php
declare(strict_types=1);

/* =========================================================
   CORS ROBUSTO
========================================================= */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!headers_sent()) {
  if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
  } else {
    header("Access-Control-Allow-Origin: *");
  }
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session, Range');
  header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/* =========================================================
   RESP JSON
========================================================= */
function comprobantes_ok(array $arr = []): void {
  if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
  echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
  exit;
}
function comprobantes_fail(string $msg, int $httpCode = 400, array $extra = []): void {
  if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

global $pdo;

$action = $_GET['action'] ?? $_POST['action'] ?? $_REQUEST['action'] ?? '';
$action = is_string($action) ? strtolower(trim($action)) : '';

if (!($pdo instanceof PDO)) {
  comprobantes_fail('PDO tenant no disponible.', 500);
}

/* =========================================================
   Helpers
========================================================= */
function get_header_case_insensitive(string $key): string {
  $k = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = $_SERVER[$k] ?? '';
  if (is_string($v) && trim($v) !== '') return trim($v);

  if (function_exists('getallheaders')) {
    $h = getallheaders();
    if (is_array($h)) {
      foreach ($h as $kk => $vv) {
        if (strcasecmp((string)$kk, $key) === 0) {
          return is_string($vv) ? trim($vv) : '';
        }
      }
    }
  }
  return '';
}

function is_https_request(): bool {
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
  if ((string)($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
  $xfp = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
  if (is_string($xfp) && strtolower($xfp) === 'https') return true;
  return false;
}

/**
 * ✅ Root REAL: public_html (no BALTO, no api)
 * Este archivo está en: public_html/[BALTO]/api/modules/movimientos/comprobantes.php
 * __DIR__ = .../api/modules/movimientos
 * dirname(__DIR__, 3) = .../api
 * dirname(.../api) = .../public_html/[BALTO]   (si estás dentro de /BALTO)
 *
 * Pero vos pedís guardar en: public_html/uploads/tenants/...
 * O sea: dirname(public_html/[BALTO]) => public_html
 */
function get_public_html_dir(): string {
  $apiDir = realpath(dirname(__DIR__, 3));     // .../api
  if ($apiDir && is_dir($apiDir)) {
    $projectDir = realpath($apiDir . '/..');   // .../[BALTO]
    if ($projectDir && is_dir($projectDir)) {
      $publicHtml = realpath($projectDir . '/..'); // .../public_html
      if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
      // fallback: si el proyecto está directo en public_html (sin carpeta)
      return $projectDir;
    }
    return dirname($apiDir);
  }
  return dirname(__DIR__, 5);
}

function safe_mkdir(string $path): void {
  if (is_dir($path)) {
    if (!is_writable($path)) {
      comprobantes_fail('Carpeta existe pero NO es writable (permisos).', 500, ['path' => $path]);
    }
    return;
  }
  if (!@mkdir($path, 0775, true) && !is_dir($path)) {
    comprobantes_fail('No se pudo crear carpeta (permisos).', 500, ['path' => $path]);
  }
  if (!is_writable($path)) {
    comprobantes_fail('Carpeta creada pero NO es writable (permisos).', 500, ['path' => $path]);
  }
}

function normalize_rel(string $abs, string $root): string {
  $abs = str_replace('\\', '/', $abs);
  $root = rtrim(str_replace('\\', '/', $root), '/');
  if (strpos($abs, $root . '/') === 0) return ltrim(substr($abs, strlen($root)), '/');
  return $abs;
}

function is_inside(string $path, string $baseDir): bool {
  $pathReal = realpath($path);
  $baseReal = realpath($baseDir);
  if (!$pathReal || !$baseReal) return false;

  $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
  $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

  return strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal;
}

/**
 * ✅ URL absoluta al api.php real (tu endpoint)
 * Mantiene subcarpeta si existe (ej /BALTO/api/routes/api.php)
 */
function api_php_abs_url(): string {
  $scheme = is_https_request() ? 'https' : 'http';
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';

  $script = (string)($_SERVER['SCRIPT_NAME'] ?? '');
  // si tu api vive en /BALTO/api/routes/api.php
  $pos = strpos($script, '/api/routes/api.php');
  if ($pos !== false) {
    $prefix = substr($script, 0, $pos); // "/BALTO" o ""
    return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
  }

  // fallback seguro
  return $scheme . '://' . $host . '/api/routes/api.php';
}

function build_download_url(int $idComp): string {
  return api_php_abs_url() . '?action=comprobantes_descargar&id_comprobante=' . $idComp;
}

/* =========================================================
   Tenant ID
========================================================= */
$tenantId = get_header_case_insensitive('X-IdTenant');
if ($tenantId === '') $tenantId = get_header_case_insensitive('X-Id-Tenant');
if ($tenantId === '' || !ctype_digit($tenantId)) $tenantId = '0';

/* =========================================================
   SUBIR PDF Y VINCULAR A COBRO
========================================================= */
if ($action === 'comprobantes_subir') {

  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    comprobantes_fail('Método inválido. Usá POST.', 405);
  }

  $idCobroRaw = $_POST['id_cobro'] ?? null;
  $idMovRaw   = $_POST['id_movimiento'] ?? null;

  $idCobroStr = is_string($idCobroRaw) ? trim($idCobroRaw) : (is_numeric($idCobroRaw) ? (string)$idCobroRaw : '');
  $idMovStr   = is_string($idMovRaw) ? trim($idMovRaw) : (is_numeric($idMovRaw) ? (string)$idMovRaw : '');

  $idCobro = 0;
  $idMovFromPost = 0;

  if ($idCobroStr !== '' && ctype_digit($idCobroStr) && (int)$idCobroStr > 0) $idCobro = (int)$idCobroStr;
  if ($idMovStr !== '' && ctype_digit($idMovStr) && (int)$idMovStr > 0) $idMovFromPost = (int)$idMovStr;

  if ($idCobro <= 0 && $idMovFromPost <= 0) {
    comprobantes_fail('Falta id_cobro o id_movimiento válido.', 400);
  }

  $tipo = $_POST['tipo'] ?? 'RECIBO';
  $tipo = is_string($tipo) ? strtoupper(trim($tipo)) : 'RECIBO';
  if ($tipo === '') $tipo = 'RECIBO';

  // ✅ resolver cobro + movimiento
  $cobro = null;

  if ($idCobro > 0) {
    $stc = $pdo->prepare("SELECT id_cobro, id_movimiento, id_comprobante FROM cobros WHERE id_cobro = :id LIMIT 1");
    $stc->execute([':id' => $idCobro]);
    $cobro = $stc->fetch(PDO::FETCH_ASSOC);
    if (!$cobro) comprobantes_fail('El cobro no existe.', 404);
    if (!empty($cobro['id_comprobante'])) {
      comprobantes_fail('Este cobro ya tiene un comprobante vinculado.', 409, [
        'id_comprobante' => (int)$cobro['id_comprobante'],
      ]);
    }
  } else {
    $stc = $pdo->prepare("
      SELECT id_cobro, id_movimiento, id_comprobante
      FROM cobros
      WHERE id_movimiento = :idMov
      ORDER BY id_cobro DESC
      LIMIT 1
    ");
    $stc->execute([':idMov' => $idMovFromPost]);
    $cobro = $stc->fetch(PDO::FETCH_ASSOC);

    if (!$cobro) {
      comprobantes_fail('No existe cobro para ese id_movimiento. Confirmá el pago antes de guardar el recibo.', 404, [
        'id_movimiento' => $idMovFromPost,
      ]);
    }

    $idCobro = (int)($cobro['id_cobro'] ?? 0);
    if ($idCobro <= 0) comprobantes_fail('No se pudo resolver id_cobro para el movimiento.', 500);

    if (!empty($cobro['id_comprobante'])) {
      comprobantes_fail('Este cobro ya tiene un comprobante vinculado.', 409, [
        'id_comprobante' => (int)$cobro['id_comprobante'],
        'id_cobro' => $idCobro,
      ]);
    }
  }

  if (!isset($_FILES['archivo'])) comprobantes_fail('Falta archivo (campo "archivo").', 400);

  $f = $_FILES['archivo'];
  $err = (int)($f['error'] ?? UPLOAD_ERR_NO_FILE);
  if ($err !== UPLOAD_ERR_OK) comprobantes_fail('Error al subir archivo (UPLOAD_ERR=' . $err . ').', 400);

  $tmp = (string)($f['tmp_name'] ?? '');
  if ($tmp === '' || !is_file($tmp)) comprobantes_fail('Archivo temporal inválido.', 400);

  $origName = (string)($f['name'] ?? 'comprobante.pdf');
  $mime = (string)($f['type'] ?? 'application/pdf');
  $size = (int)($f['size'] ?? 0);

  $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
  if ($ext !== 'pdf') comprobantes_fail('El archivo debe ser PDF.', 400);

  $sha = hash_file('sha256', $tmp);
  if (!$sha) comprobantes_fail('No se pudo calcular hash del archivo.', 500);

  // ✅ public_html/uploads/tenants/...
  $publicHtml = get_public_html_dir();
  $uploadsBase = $publicHtml . '/uploads';
  safe_mkdir($uploadsBase);

  $tenantDir = $uploadsBase . '/tenants/t_' . $tenantId . '/comprobantes/' . date('Y') . '/' . date('m');
  safe_mkdir($tenantDir);

  $idMov = (int)($cobro['id_movimiento'] ?? $idMovFromPost);
  if ($idMov <= 0) comprobantes_fail('No se pudo resolver id_movimiento.', 500);

  $finalName = 'cobro_' . $idCobro . '__mov_' . $idMov . '__' . $sha . '.pdf';
  $absPath = $tenantDir . '/' . $finalName;

  // mover con fallback hostinger
  $moved = false;
  if (is_uploaded_file($tmp) && @move_uploaded_file($tmp, $absPath)) {
    $moved = true;
  } else {
    if (@rename($tmp, $absPath)) $moved = true;
    else if (@copy($tmp, $absPath)) { $moved = true; @unlink($tmp); }
  }

  if (!$moved || !is_file($absPath) || (int)filesize($absPath) <= 0) {
    comprobantes_fail('No se pudo guardar el archivo en el servidor.', 500, [
      'tmp' => $tmp,
      'absPath' => $absPath,
      'tenantDir' => $tenantDir,
      'public_html' => $publicHtml,
      'uploadsBase' => $uploadsBase,
    ]);
  }

  // ✅ guardamos ruta relativa a public_html
  $relPath = normalize_rel($absPath, $publicHtml);

  try {
    $pdo->beginTransaction();

    $ins = $pdo->prepare("
      INSERT INTO comprobantes_archivos
        (tipo, archivo_url, archivo_path, archivo_mime, archivo_size, sha256)
      VALUES
        (:tipo, :url, :path, :mime, :size, :sha)
    ");

    $ins->execute([
      ':tipo' => $tipo,
      ':url'  => '', // placeholder
      ':path' => $relPath,
      ':mime' => $mime !== '' ? $mime : 'application/pdf',
      ':size' => max(0, $size),
      ':sha'  => $sha,
    ]);

    $idComp = (int)$pdo->lastInsertId();
    if ($idComp <= 0) throw new RuntimeException('No se pudo obtener id_comprobante.');

    $realUrl = build_download_url($idComp);

    $upUrl = $pdo->prepare("UPDATE comprobantes_archivos SET archivo_url = :u WHERE id_comprobante = :id LIMIT 1");
    $upUrl->execute([':u' => $realUrl, ':id' => $idComp]);

    $upCob = $pdo->prepare("UPDATE cobros SET id_comprobante = :idComp WHERE id_cobro = :idCobro LIMIT 1");
    $upCob->execute([':idComp' => $idComp, ':idCobro' => $idCobro]);

    $pdo->commit();

    comprobantes_ok([
      'id_comprobante' => $idComp,
      'id_cobro' => $idCobro,
      'id_movimiento' => $idMov,
      'archivo_url' => $realUrl,
      'archivo_path' => $relPath,
      'sha256' => $sha,
      'filename' => $finalName,
      'debug' => [
        'public_html' => $publicHtml,
        'uploadsBase' => $uploadsBase,
        'tenantDir' => $tenantDir,
      ],
    ]);

  } catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    @unlink($absPath);
    comprobantes_fail('Error DB al registrar comprobante: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   DESCARGAR PDF (INLINE)
========================================================= */
if ($action === 'comprobantes_descargar') {

  $id = $_GET['id_comprobante'] ?? $_GET['id'] ?? '';
  $id = is_string($id) ? trim($id) : '';
  if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
    comprobantes_fail('Falta id_comprobante válido.', 400);
  }
  $id = (int)$id;

  try {
    $st = $pdo->prepare("
      SELECT id_comprobante, archivo_path, archivo_mime
      FROM comprobantes_archivos
      WHERE id_comprobante = :id
      LIMIT 1
    ");
    $st->execute([':id' => $id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) comprobantes_fail('Comprobante no encontrado.', 404);

    $publicHtml = get_public_html_dir();
    $uploadsBase = $publicHtml . '/uploads';

    $rel = (string)($row['archivo_path'] ?? '');
    if ($rel === '') comprobantes_fail('Comprobante sin ruta.', 500);

    $abs = $publicHtml . '/' . ltrim($rel, '/');
    if (!is_file($abs)) comprobantes_fail('Archivo no existe en disco.', 404, ['abs' => $abs, 'rel' => $rel, 'public_html' => $publicHtml]);
    if (!is_inside($abs, $uploadsBase)) comprobantes_fail('Ruta inválida.', 403);

    $mime = (string)($row['archivo_mime'] ?? 'application/pdf');
    if ($mime === '') $mime = 'application/pdf';

    $filesize = (int)filesize($abs);
    $filename = 'comprobante_' . $id . '.pdf';

    // ✅ PDF headers (NO JSON)
    if (!headers_sent()) {
      header('Content-Type: ' . $mime);
      header('Content-Disposition: inline; filename="' . $filename . '"');
      header('Accept-Ranges: bytes');
      header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    }

    // ✅ Range support
    $range = $_SERVER['HTTP_RANGE'] ?? '';
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
    comprobantes_fail('Error al descargar: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   INFO
========================================================= */
if ($action === 'comprobantes_info') {

  $id = $_GET['id_comprobante'] ?? $_GET['id'] ?? '';
  $id = is_string($id) ? trim($id) : '';
  if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
    comprobantes_fail('Falta id_comprobante válido.', 400);
  }
  $id = (int)$id;

  try {
    $st = $pdo->prepare("SELECT * FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
    $st->execute([':id' => $id]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row) comprobantes_fail('Comprobante no encontrado.', 404);

    comprobantes_ok(['data' => $row]);
  } catch (Throwable $e) {
    comprobantes_fail('Error: ' . $e->getMessage(), 500);
  }
}

comprobantes_fail('Acción de comprobantes no válida: ' . $action, 400);
