<?php
// backend/modules/movimientos/comprobantes.php

/* =========================================================
   CORS ROBUSTO
========================================================= */
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
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

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

/* =========================================================
   RESP JSON
========================================================= */
function comprobantes_ok($arr = array()) {
  if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
  }
  echo json_encode(array_merge(array('exito' => true), $arr));
  exit;
}

function comprobantes_fail($msg, $httpCode = 400, $extra = array()) {
  if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
  }
  http_response_code((int)$httpCode);
  echo json_encode(array_merge(array('exito' => false, 'mensaje' => $msg), $extra));
  exit;
}

global $pdo;

$action = '';
if (isset($_GET['action'])) {
  $action = $_GET['action'];
} elseif (isset($_POST['action'])) {
  $action = $_POST['action'];
} elseif (isset($_REQUEST['action'])) {
  $action = $_REQUEST['action'];
}
$action = is_string($action) ? strtolower(trim($action)) : '';

if (!isset($pdo) || !($pdo instanceof PDO)) {
  comprobantes_fail('PDO tenant no disponible.', 500);
}

/* =========================================================
   Helpers generales
========================================================= */
function read_json_body() {
  $raw = file_get_contents('php://input');
  if (!$raw) return array();

  $data = json_decode($raw, true);
  return is_array($data) ? $data : array();
}

function n_int($v) {
  if ($v === null || $v === '') return null;
  if (!is_numeric($v)) return null;
  $n = (int)$v;
  return ($n > 0) ? $n : null;
}

function str_starts_with_compat($haystack, $needle) {
  return substr($haystack, 0, strlen($needle)) === $needle;
}

function dirname_n($path, $levels) {
  $levels = (int)$levels;
  $out = $path;
  $i = 0;
  while ($i < $levels) {
    $out = dirname($out);
    $i++;
  }
  return $out;
}

function get_header_case_insensitive($key) {
  $k = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
  $v = isset($_SERVER[$k]) ? $_SERVER[$k] : '';
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

function is_https_request() {
  if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
  if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;

  $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? $_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
  if (is_string($xfp) && strtolower($xfp) === 'https') return true;

  return false;
}

/**
 * ✅ Root REAL: public_html
 */
function get_public_html_dir() {
  $apiDir = realpath(dirname_n(__DIR__, 3)); // .../api
  if ($apiDir && is_dir($apiDir)) {
    $projectDir = realpath($apiDir . '/..'); // .../[BALTO]
    if ($projectDir && is_dir($projectDir)) {
      $publicHtml = realpath($projectDir . '/..'); // .../public_html
      if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
      return $projectDir;
    }
    return dirname($apiDir);
  }

  return dirname_n(__DIR__, 5);
}

/**
 * ✅ Root REAL: balto_private
 */
function get_balto_private_dir() {
  $publicHtml = get_public_html_dir();
  $homeDir = realpath($publicHtml . '/..');

  if ($homeDir && is_dir($homeDir . '/balto_private')) {
    $cand = realpath($homeDir . '/balto_private');
    if ($cand && is_dir($cand)) return $cand;
  }

  $apiDir = realpath(dirname_n(__DIR__, 3));
  if ($apiDir) {
    $projectDir = realpath($apiDir . '/..');
    if ($projectDir) {
      $cand1 = realpath($projectDir . '/../balto_private');
      if ($cand1 && is_dir($cand1)) return $cand1;

      $cand2 = realpath($projectDir . '/../../balto_private');
      if ($cand2 && is_dir($cand2)) return $cand2;
    }
  }

  comprobantes_fail('No se encontró la carpeta balto_private.', 500, array(
    'public_html' => $publicHtml,
  ));
}

function get_private_uploads_dir() {
  $baltoPrivate = get_balto_private_dir();
  $uploads = $baltoPrivate . '/uploads';

  if (!is_dir($uploads)) {
    comprobantes_fail('No existe la carpeta balto_private/uploads.', 500, array(
      'balto_private' => $baltoPrivate,
      'uploads' => $uploads,
    ));
  }

  return $uploads;
}

function safe_mkdir($path) {
  if (is_dir($path)) {
    if (!is_writable($path)) {
      comprobantes_fail('Carpeta existe pero NO es writable (permisos).', 500, array('path' => $path));
    }
    return;
  }

  if (!@mkdir($path, 0775, true) && !is_dir($path)) {
    comprobantes_fail('No se pudo crear carpeta (permisos).', 500, array('path' => $path));
  }

  if (!is_writable($path)) {
    comprobantes_fail('Carpeta creada pero NO es writable (permisos).', 500, array('path' => $path));
  }
}

/**
 * Guarda en DB:
 * uploads/tenants/t_X/comprobantes/...
 */
function normalize_rel_from_private_uploads($abs, $uploadsBase) {
  $abs = str_replace('\\', '/', $abs);
  $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

  if (strpos($abs, $uploadsBase . '/') === 0) {
    return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
  }

  return ltrim($abs, '/');
}

/**
 * Normaliza rutas guardadas en DB
 */
function normalize_db_rel_path($path) {
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

function is_inside($path, $baseDir) {
  $pathReal = realpath($path);
  $baseReal = realpath($baseDir);
  if (!$pathReal || !$baseReal) return false;

  $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
  $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

  return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
}

/**
 * ✅ URL absoluta al api.php real
 */
function api_php_abs_url() {
  $scheme = is_https_request() ? 'https' : 'http';
  $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';

  $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '';
  $pos = strpos($script, '/api/routes/api.php');

  if ($pos !== false) {
    $prefix = substr($script, 0, $pos);
    return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
  }

  return $scheme . '://' . $host . '/api/routes/api.php';
}

function build_download_url($idComp) {
  return api_php_abs_url() . '?action=comprobantes_descargar&id_comprobante=' . (int)$idComp;
}

/* =========================================================
   ✅ tipo -> carpeta segura
========================================================= */
function tipo_to_folder($tipo) {
  $t = strtoupper(trim($tipo));
  if ($t === '') $t = 'RECIBO';

  $map = array(
    'RECIBO' => 'recibo',
    'ORDEN_PAGO' => 'orden_pago',
    'ORDEN DE PAGO' => 'orden_pago',
    'FACTURA' => 'factura',
    'NOTA_CREDITO' => 'nota_credito',
    'NOTA_DEBITO' => 'nota_debito',
  );

  if (isset($map[$t])) return $map[$t];

  $t = strtolower($t);
  $t = str_replace(array(' ', '-', '.'), '_', $t);
  $t = preg_replace('/[^a-z0-9_]/', '', $t);
  $t = trim((string)$t, '_');
  if ($t === '') $t = 'otros';

  return $t;
}

/* =========================================================
   ✅ SAAS: Tenant REAL resuelto por api.php
========================================================= */
function resolve_tenant_id_or_fail() {
  $ses = isset($GLOBALS['SESSION_MASTER']) ? $GLOBALS['SESSION_MASTER'] : null;
  if (is_array($ses)) {
    $idT = isset($ses['idTenant']) ? (int)$ses['idTenant'] : 0;
    if ($idT > 0) return $idT;
  }

  $srv = '';
  if (isset($_SERVER['X_IDTENANT'])) {
    $srv = $_SERVER['X_IDTENANT'];
  } elseif (isset($_SERVER['HTTP_X_IDTENANT'])) {
    $srv = $_SERVER['HTTP_X_IDTENANT'];
  }

  $srv = is_string($srv) ? trim($srv) : '';
  if ($srv !== '' && ctype_digit($srv) && (int)$srv > 0) {
    return (int)$srv;
  }

  comprobantes_fail(
    'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php (con sesión válida).',
    401
  );
}

$tenantId = resolve_tenant_id_or_fail();

/* =========================================================
   ✅ SUBIR PDF Y VINCULAR A COBRO
========================================================= */
if ($action === 'comprobantes_subir') {

  if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    comprobantes_fail('Método inválido. Usá POST.', 405);
  }

  $idCobroRaw = isset($_POST['id_cobro']) ? $_POST['id_cobro'] : null;
  $idMovRaw   = isset($_POST['id_movimiento']) ? $_POST['id_movimiento'] : null;

  $idCobroStr = is_string($idCobroRaw) ? trim($idCobroRaw) : (is_numeric($idCobroRaw) ? (string)$idCobroRaw : '');
  $idMovStr   = is_string($idMovRaw) ? trim($idMovRaw) : (is_numeric($idMovRaw) ? (string)$idMovRaw : '');

  $idCobro = 0;
  $idMovFromPost = 0;

  if ($idCobroStr !== '' && ctype_digit($idCobroStr) && (int)$idCobroStr > 0) {
    $idCobro = (int)$idCobroStr;
  }
  if ($idMovStr !== '' && ctype_digit($idMovStr) && (int)$idMovStr > 0) {
    $idMovFromPost = (int)$idMovStr;
  }

  if ($idCobro <= 0 && $idMovFromPost <= 0) {
    comprobantes_fail('Falta id_cobro o id_movimiento válido.', 400);
  }

  $tipo = isset($_POST['tipo']) ? $_POST['tipo'] : 'RECIBO';
  $tipo = is_string($tipo) ? strtoupper(trim($tipo)) : 'RECIBO';
  if ($tipo === '') $tipo = 'RECIBO';

  $tipoFolder = tipo_to_folder($tipo);

  $cobro = null;

  if ($idCobro > 0) {
    $stc = $pdo->prepare("SELECT id_cobro, id_movimiento, id_comprobante FROM cobros WHERE id_cobro = :id LIMIT 1");
    $stc->execute(array(':id' => $idCobro));
    $cobro = $stc->fetch(PDO::FETCH_ASSOC);

    if (!$cobro) comprobantes_fail('El cobro no existe.', 404);

    if (!empty($cobro['id_comprobante'])) {
      comprobantes_fail('Este cobro ya tiene un comprobante vinculado.', 409, array(
        'id_comprobante' => (int)$cobro['id_comprobante'],
      ));
    }
  } else {
    $stc = $pdo->prepare("
      SELECT id_cobro, id_movimiento, id_comprobante
      FROM cobros
      WHERE id_movimiento = :idMov
      ORDER BY id_cobro DESC
      LIMIT 1
    ");
    $stc->execute(array(':idMov' => $idMovFromPost));
    $cobro = $stc->fetch(PDO::FETCH_ASSOC);

    if (!$cobro) {
      comprobantes_fail('No existe cobro para ese id_movimiento. Confirmá el pago antes de guardar el recibo.', 404, array(
        'id_movimiento' => $idMovFromPost,
      ));
    }

    $idCobro = isset($cobro['id_cobro']) ? (int)$cobro['id_cobro'] : 0;
    if ($idCobro <= 0) {
      comprobantes_fail('No se pudo resolver id_cobro para el movimiento.', 500);
    }

    if (!empty($cobro['id_comprobante'])) {
      comprobantes_fail('Este cobro ya tiene un comprobante vinculado.', 409, array(
        'id_comprobante' => (int)$cobro['id_comprobante'],
        'id_cobro' => $idCobro,
      ));
    }
  }

  if (!isset($_FILES['archivo'])) {
    comprobantes_fail('Falta archivo (campo "archivo").', 400);
  }

  $f = $_FILES['archivo'];
  $err = isset($f['error']) ? (int)$f['error'] : UPLOAD_ERR_NO_FILE;
  if ($err !== UPLOAD_ERR_OK) {
    comprobantes_fail('Error al subir archivo (UPLOAD_ERR=' . $err . ').', 400);
  }

  $tmp = isset($f['tmp_name']) ? (string)$f['tmp_name'] : '';
  if ($tmp === '' || !is_file($tmp)) {
    comprobantes_fail('Archivo temporal inválido.', 400);
  }

  $origName = isset($f['name']) ? (string)$f['name'] : 'comprobante.pdf';
  $mime = isset($f['type']) ? (string)$f['type'] : 'application/pdf';
  $size = isset($f['size']) ? (int)$f['size'] : 0;

  $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
  if ($ext !== 'pdf') {
    comprobantes_fail('El archivo debe ser PDF.', 400);
  }

  $sha = hash_file('sha256', $tmp);
  if (!$sha) {
    comprobantes_fail('No se pudo calcular hash del archivo.', 500);
  }

  // ✅ AHORA guarda en balto_private/uploads
  $uploadsBase = get_private_uploads_dir();
  safe_mkdir($uploadsBase);

  $tenantDir = $uploadsBase
    . '/tenants/t_' . $tenantId
    . '/comprobantes/' . date('Y')
    . '/' . date('m')
    . '/' . $tipoFolder;

  safe_mkdir($tenantDir);

  $idMov = isset($cobro['id_movimiento']) ? (int)$cobro['id_movimiento'] : $idMovFromPost;
  if ($idMov <= 0) {
    comprobantes_fail('No se pudo resolver id_movimiento.', 500);
  }

  $finalName = 'cobro_' . $idCobro . '__mov_' . $idMov . '__' . $sha . '.pdf';
  $absPath = $tenantDir . '/' . $finalName;

  $moved = false;
  if (is_uploaded_file($tmp) && @move_uploaded_file($tmp, $absPath)) {
    $moved = true;
  } else {
    if (@rename($tmp, $absPath)) {
      $moved = true;
    } else if (@copy($tmp, $absPath)) {
      $moved = true;
      @unlink($tmp);
    }
  }

  if (!$moved || !is_file($absPath) || (int)filesize($absPath) <= 0) {
    comprobantes_fail('No se pudo guardar el archivo en el servidor.', 500, array(
      'tmp' => $tmp,
      'absPath' => $absPath,
      'tenantDir' => $tenantDir,
      'uploadsBase' => $uploadsBase,
      'tipo' => $tipo,
      'tipoFolder' => $tipoFolder,
      'tenantId' => $tenantId,
    ));
  }

  // ✅ en DB queda uploads/tenants/...
  $relPath = normalize_rel_from_private_uploads($absPath, $uploadsBase);

  try {
    $pdo->beginTransaction();

    $ins = $pdo->prepare("
      INSERT INTO comprobantes_archivos
        (tipo, archivo_url, archivo_path, archivo_mime, archivo_size, sha256)
      VALUES
        (:tipo, :url, :path, :mime, :size, :sha)
    ");

    $ins->execute(array(
      ':tipo' => $tipo,
      ':url'  => '',
      ':path' => $relPath,
      ':mime' => ($mime !== '' ? $mime : 'application/pdf'),
      ':size' => max(0, $size),
      ':sha'  => $sha,
    ));

    $idComp = (int)$pdo->lastInsertId();
    if ($idComp <= 0) {
      throw new Exception('No se pudo obtener id_comprobante.');
    }

    $realUrl = build_download_url($idComp);

    $upUrl = $pdo->prepare("UPDATE comprobantes_archivos SET archivo_url = :u WHERE id_comprobante = :id LIMIT 1");
    $upUrl->execute(array(':u' => $realUrl, ':id' => $idComp));

    $upCob = $pdo->prepare("UPDATE cobros SET id_comprobante = :idComp WHERE id_cobro = :idCobro LIMIT 1");
    $upCob->execute(array(':idComp' => $idComp, ':idCobro' => $idCobro));

    $pdo->commit();

    comprobantes_ok(array(
      'id_comprobante' => $idComp,
      'id_cobro' => $idCobro,
      'id_movimiento' => $idMov,
      'archivo_url' => $realUrl,
      'archivo_path' => $relPath,
      'sha256' => $sha,
      'filename' => $finalName,
      'debug' => array(
        'tenantId' => $tenantId,
        'uploadsBase' => $uploadsBase,
        'tenantDir' => $tenantDir,
        'tipo' => $tipo,
        'tipoFolder' => $tipoFolder,
      ),
    ));

  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    @unlink($absPath);
    comprobantes_fail('Error DB al registrar comprobante: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   ✅ ASOCIAR 1x1 (POST JSON)
========================================================= */
if ($action === 'comprobantes_asociar_movimiento') {

  if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    comprobantes_fail('Método inválido. Usá POST.', 405);
  }

  $body = read_json_body();
  $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : array());

  $idComp = n_int(isset($src['id_comprobante']) ? $src['id_comprobante'] : (isset($src['idComp']) ? $src['idComp'] : null));
  if (!$idComp) comprobantes_fail('Falta id_comprobante.', 400);

  $force = !empty($src['force']) ? true : false;

  $v = $pdo->prepare("SELECT 1 FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
  $v->execute(array(':id' => $idComp));
  if ((int)($v->fetchColumn() ? $v->fetchColumn() : 0) !== 1) {
    $v = $pdo->prepare("SELECT 1 FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
    $v->execute(array(':id' => $idComp));
    if ((int)($v->fetchColumn() ?: 0) !== 1) {
      comprobantes_fail('El id_comprobante no existe.', 404);
    }
  }

  $idCobro = n_int(isset($src['id_cobro']) ? $src['id_cobro'] : null);
  $idMov   = n_int(isset($src['id_movimiento']) ? $src['id_movimiento'] : null);

  if (!$idCobro && !$idMov) {
    comprobantes_fail('Falta id_cobro o id_movimiento.', 400);
  }

  try {
    $pdo->beginTransaction();

    $cobro = null;

    if ($idCobro) {
      $st = $pdo->prepare("SELECT id_cobro, id_movimiento, id_comprobante FROM cobros WHERE id_cobro = :id LIMIT 1");
      $st->execute(array(':id' => $idCobro));
      $cobro = $st->fetch(PDO::FETCH_ASSOC);

      if (!$cobro) {
        $pdo->rollBack();
        comprobantes_fail('El cobro no existe.', 404);
      }
    } else {
      $st = $pdo->prepare("
        SELECT id_cobro, id_movimiento, id_comprobante
        FROM cobros
        WHERE id_movimiento = :idMov
        ORDER BY id_cobro DESC
        LIMIT 1
      ");
      $st->execute(array(':idMov' => $idMov));
      $cobro = $st->fetch(PDO::FETCH_ASSOC);

      if (!$cobro) {
        $pdo->rollBack();
        comprobantes_fail('No existe cobro para ese movimiento (confirmá pago primero).', 404, array(
          'id_movimiento' => $idMov,
        ));
      }
      $idCobro = (int)$cobro['id_cobro'];
    }

    $prev = isset($cobro['id_comprobante']) ? (int)$cobro['id_comprobante'] : 0;
    if ($prev > 0 && !$force) {
      $pdo->rollBack();
      comprobantes_fail('Ese cobro ya tiene comprobante. Pasá force=true si querés reemplazar.', 409, array(
        'id_cobro' => (int)$idCobro,
        'id_movimiento' => isset($cobro['id_movimiento']) ? (int)$cobro['id_movimiento'] : 0,
        'id_comprobante_actual' => $prev,
      ));
    }

    $up = $pdo->prepare("UPDATE cobros SET id_comprobante = :idComp WHERE id_cobro = :idCobro LIMIT 1");
    $up->execute(array(':idComp' => $idComp, ':idCobro' => $idCobro));

    $pdo->commit();

    comprobantes_ok(array(
      'id_comprobante' => $idComp,
      'id_cobro' => (int)$idCobro,
      'id_movimiento' => isset($cobro['id_movimiento']) ? (int)$cobro['id_movimiento'] : 0,
      'reemplazo' => ($prev > 0),
      'id_comprobante_anterior' => $prev,
    ));

  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    comprobantes_fail('No se pudo asociar comprobante: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   ✅ ASOCIAR BATCH (POST JSON)
========================================================= */
if ($action === 'comprobantes_asociar_movimientos') {

  if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    comprobantes_fail('Método inválido. Usá POST.', 405);
  }

  $body = read_json_body();
  $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : array());

  $idComp = n_int(isset($src['id_comprobante']) ? $src['id_comprobante'] : (isset($src['idComp']) ? $src['idComp'] : null));
  if (!$idComp) comprobantes_fail('Falta id_comprobante.', 400);

  $force = !empty($src['force']) ? true : false;

  $ids = isset($src['ids_movimiento']) ? $src['ids_movimiento'] : (isset($src['ids_movimientos']) ? $src['ids_movimientos'] : array());
  if (!is_array($ids)) $ids = array();

  $idsOk = array();
  foreach ($ids as $x) {
    $n = n_int($x);
    if ($n) $idsOk[] = $n;
  }
  $idsOk = array_values(array_unique($idsOk));

  if (!$idsOk) comprobantes_fail('Faltan ids_movimiento.', 400);

  $v = $pdo->prepare("SELECT 1 FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
  $v->execute(array(':id' => $idComp));
  $exists = $v->fetchColumn();
  if ((int)($exists ? $exists : 0) !== 1) {
    comprobantes_fail('El id_comprobante no existe.', 404);
  }

  try {
    $pdo->beginTransaction();

    $result = array(
      'asociados' => array(),
      'sin_cobro' => array(),
      'ya_tenian' => array(),
    );

    $sel = $pdo->prepare("
      SELECT id_cobro, id_movimiento, id_comprobante
      FROM cobros
      WHERE id_movimiento = :idMov
      ORDER BY id_cobro DESC
      LIMIT 1
    ");

    $upd = $pdo->prepare("
      UPDATE cobros
      SET id_comprobante = :idComp
      WHERE id_cobro = :idCobro
      LIMIT 1
    ");

    foreach ($idsOk as $idMov) {
      $sel->execute(array(':idMov' => $idMov));
      $c = $sel->fetch(PDO::FETCH_ASSOC);

      if (!$c) {
        $result['sin_cobro'][] = (int)$idMov;
        continue;
      }

      $idCobro = isset($c['id_cobro']) ? (int)$c['id_cobro'] : 0;
      $prev = isset($c['id_comprobante']) ? (int)$c['id_comprobante'] : 0;

      if ($prev > 0 && !$force) {
        $result['ya_tenian'][] = array(
          'id_movimiento' => (int)$idMov,
          'id_cobro' => $idCobro,
          'id_comprobante_actual' => $prev,
        );
        continue;
      }

      $upd->execute(array(':idComp' => $idComp, ':idCobro' => $idCobro));
      $result['asociados'][] = array(
        'id_movimiento' => (int)$idMov,
        'id_cobro' => $idCobro,
        'reemplazo' => ($prev > 0),
        'id_comprobante_anterior' => $prev,
      );
    }

    $pdo->commit();

    comprobantes_ok(array(
      'id_comprobante' => $idComp,
      'force' => $force,
      'result' => $result,
    ));

  } catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    comprobantes_fail('No se pudo asociar batch: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   DESCARGAR PDF (INLINE)
   ✅ AHORA LEE DESDE balto_private/uploads
========================================================= */
if ($action === 'comprobantes_descargar') {

  $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
  $id = is_string($id) ? trim($id) : '';

  if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
    comprobantes_fail('Falta id_comprobante válido.', 400);
  }
  $id = (int)$id;

  try {
    $st = $pdo->prepare("
      SELECT id_comprobante, archivo_path, archivo_url, archivo_mime
      FROM comprobantes_archivos
      WHERE id_comprobante = :id
      LIMIT 1
    ");
    $st->execute(array(':id' => $id));
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      comprobantes_fail('Comprobante no encontrado.', 404);
    }

    $uploadsBase = get_private_uploads_dir();

    $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
    if ($rel === '') {
      $rel = isset($row['archivo_url']) ? (string)$row['archivo_url'] : '';
    }

    $rel = normalize_db_rel_path($rel);

    if ($rel === '') {
      comprobantes_fail('Comprobante sin ruta.', 500);
    }

    if (strpos($rel, 'uploads/') === 0) {
      $relWithoutUploads = substr($rel, strlen('uploads/'));
    } else {
      $relWithoutUploads = ltrim($rel, '/');
    }

    $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

    if (!is_file($abs)) {
      comprobantes_fail('Archivo no existe en disco.', 404, array(
        'abs' => $abs,
        'rel' => $rel,
        'uploadsBase' => $uploadsBase,
      ));
    }

    if (!is_inside($abs, $uploadsBase)) {
      comprobantes_fail('Ruta inválida.', 403, array(
        'abs' => $abs,
        'uploadsBase' => $uploadsBase,
      ));
    }

    $mime = isset($row['archivo_mime']) ? (string)$row['archivo_mime'] : 'application/pdf';
    if ($mime === '') $mime = 'application/pdf';

    $filesize = (int)filesize($abs);
    $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
    if ($ext === '') $ext = 'pdf';

    $filename = 'comprobante_' . $id . '.' . $ext;

    if (!headers_sent()) {
      header('Content-Type: ' . $mime);
      header('Content-Disposition: inline; filename="' . $filename . '"');
      header('Accept-Ranges: bytes');
      header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    }

    $range = isset($_SERVER['HTTP_RANGE']) ? $_SERVER['HTTP_RANGE'] : '';
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

  } catch (Exception $e) {
    comprobantes_fail('Error al descargar: ' . $e->getMessage(), 500);
  }
}

/* =========================================================
   INFO
========================================================= */
if ($action === 'comprobantes_info') {

  $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
  $id = is_string($id) ? trim($id) : '';

  if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
    comprobantes_fail('Falta id_comprobante válido.', 400);
  }
  $id = (int)$id;

  try {
    $st = $pdo->prepare("SELECT * FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
    $st->execute(array(':id' => $id));
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      comprobantes_fail('Comprobante no encontrado.', 404);
    }

    comprobantes_ok(array('data' => $row));
  } catch (Exception $e) {
    comprobantes_fail('Error: ' . $e->getMessage(), 500);
  }
}

comprobantes_fail('Acción de comprobantes no válida: ' . $action, 400);