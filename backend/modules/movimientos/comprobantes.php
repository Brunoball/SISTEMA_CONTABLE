<?php
// backend/modules/movimientos/comprobantes.php

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
   JSON
========================================================= */
function comprobantes_json($arr, $httpCode) {
    if (!headers_sent()) {
        http_response_code((int)$httpCode);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function comprobantes_ok($arr = array()) {
    comprobantes_json(array_merge(array('exito' => true), $arr), 200);
}

function comprobantes_fail($msg, $httpCode, $extra) {
    comprobantes_json(array_merge(array('exito' => false, 'mensaje' => $msg), $extra), (int)$httpCode);
}

if (!function_exists('comprobantes_fail_default')) {
    function comprobantes_fail_default($msg, $httpCode = 400, $extra = array()) {
        comprobantes_fail($msg, $httpCode, $extra);
    }
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
    comprobantes_fail_default('PDO tenant no disponible.', 500);
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
function read_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) return array();
    $j = json_decode($raw, true);
    return is_array($j) ? $j : array();
}

function n_int($v) {
    if ($v === null || $v === '') return null;
    if (is_int($v)) return $v > 0 ? $v : null;
    if (is_numeric($v)) {
        $n = (int)$v;
        return $n > 0 ? $n : null;
    }
    return null;
}

function safe_str($v) {
    return trim((string)$v);
}

function is_https_request() {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
    $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
    return strtolower($xfp) === 'https';
}

function dirname_n($path, $levels) {
    $out = $path;
    $levels = (int)$levels;
    for ($i = 0; $i < $levels; $i++) {
        $out = dirname($out);
    }
    return $out;
}

function get_public_html_dir() {
    $apiDir = realpath(dirname_n(__DIR__, 3)); // .../api
    if ($apiDir && is_dir($apiDir)) {
        $projectDir = realpath($apiDir . '/..');
        if ($projectDir && is_dir($projectDir)) {
            $publicHtml = realpath($projectDir . '/..');
            if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
            return $projectDir;
        }
        return dirname($apiDir);
    }

    return dirname_n(__DIR__, 5);
}

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

    comprobantes_fail_default('No se encontró la carpeta balto_private.', 500, array(
        'public_html' => $publicHtml,
    ));
}

function get_private_uploads_dir() {
    $baltoPrivate = get_balto_private_dir();
    $uploads = $baltoPrivate . '/uploads';

    if (!is_dir($uploads)) {
        comprobantes_fail_default('No existe la carpeta balto_private/uploads.', 500, array(
            'balto_private' => $baltoPrivate,
            'uploads' => $uploads,
        ));
    }

    return $uploads;
}

function safe_mkdir($path) {
    if (is_dir($path)) {
        if (!is_writable($path)) {
            comprobantes_fail_default('Carpeta existe pero no es writable.', 500, array('path' => $path));
        }
        return;
    }

    if (!@mkdir($path, 0775, true) && !is_dir($path)) {
        comprobantes_fail_default('No se pudo crear carpeta.', 500, array('path' => $path));
    }

    if (!is_writable($path)) {
        comprobantes_fail_default('Carpeta creada pero no es writable.', 500, array('path' => $path));
    }
}

function normalize_rel_from_private_uploads($abs, $uploadsBase) {
    $abs = str_replace('\\', '/', $abs);
    $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

    if (strpos($abs, $uploadsBase . '/') === 0) {
        return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
    }

    return ltrim($abs, '/');
}

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

function api_php_abs_url() {
    $scheme = is_https_request() ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';

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

function tipo_to_folder($tipo) {
    $t = strtoupper(trim($tipo));
    if ($t === '') $t = 'RECIBO';

    $map = array(
        'RECIBO'        => 'recibo',
        'ORDEN_PAGO'    => 'orden_pago',
        'ORDEN DE PAGO' => 'orden_pago',
        'FACTURA'       => 'factura',
        'NOTA_CREDITO'  => 'nota_credito',
        'NOTA_DEBITO'   => 'nota_debito',
    );

    if (isset($map[$t])) return $map[$t];

    $t = strtolower($t);
    $t = str_replace(array(' ', '-', '.'), '_', $t);
    $t = preg_replace('/[^a-z0-9_]/', '', $t);
    $t = trim($t, '_');

    return $t !== '' ? $t : 'otros';
}

function resolve_tenant_id_or_fail() {
    $ses = isset($GLOBALS['SESSION_MASTER']) ? $GLOBALS['SESSION_MASTER'] : null;
    if (is_array($ses)) {
        $idT = isset($ses['idTenant']) ? (int)$ses['idTenant'] : 0;
        if ($idT > 0) return $idT;
    }

    $srv = '';
    if (isset($_SERVER['X_IDTENANT'])) {
        $srv = (string)$_SERVER['X_IDTENANT'];
    } elseif (isset($_SERVER['HTTP_X_IDTENANT'])) {
        $srv = (string)$_SERVER['HTTP_X_IDTENANT'];
    }

    $srv = trim($srv);
    if ($srv !== '' && ctype_digit($srv) && (int)$srv > 0) {
        return (int)$srv;
    }

    comprobantes_fail_default(
        'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php (con sesión válida).',
        401
    );
}

function movimiento_exists($pdo, $idMovimiento) {
    $st = $pdo->prepare("SELECT id_movimiento FROM movimientos WHERE id_movimiento = :id LIMIT 1");
    $st->execute(array(':id' => $idMovimiento));
    return (bool)$st->fetch(PDO::FETCH_ASSOC);
}

function cobro_by_movimiento($pdo, $idMovimiento) {
    try {
        $st = $pdo->prepare("
            SELECT id_cobro, id_movimiento, id_comprobante
            FROM cobros
            WHERE id_movimiento = :idMov
            ORDER BY id_cobro DESC
            LIMIT 1
        ");
        $st->execute(array(':idMov' => $idMovimiento));
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ? $row : null;
    } catch (Exception $e) {
        return null;
    }
}

/* =========================================================
   VINCULAR DIRECTO
========================================================= */
function vincular_comprobante_a_movimiento($pdo, $idMovimiento, $idComprobante, $force) {
    if ((int)$idMovimiento <= 0) {
        throw new Exception('id_movimiento inválido.');
    }

    if ((int)$idComprobante <= 0) {
        throw new Exception('id_comprobante inválido.');
    }

    if (!movimiento_exists($pdo, (int)$idMovimiento)) {
        throw new Exception('El movimiento no existe.');
    }

    $result = array(
        'id_movimiento' => (int)$idMovimiento,
        'id_comprobante' => (int)$idComprobante,
        'vinculo' => null,
        'reemplazo' => false,
        'id_comprobante_anterior' => null,
        'id_cobro' => null,
    );

    $vinculado = false;

    /* =========================
      1) movimientos.id_comprobante
    ========================= */
    try {
        $stPrev = $pdo->prepare("
            SELECT id_comprobante
            FROM movimientos
            WHERE id_movimiento = :id
            LIMIT 1
        ");
        $stPrev->execute(array(':id' => $idMovimiento));
        $prev = (int)($stPrev->fetchColumn() ? $stPrev->fetchColumn() : 0);

        if ($prev > 0 && !$force) {
            throw new Exception('Ese movimiento ya tiene comprobante asociado. Usá force=true para reemplazar.');
        }

        $up = $pdo->prepare("
            UPDATE movimientos
            SET id_comprobante = :idComp
            WHERE id_movimiento = :idMov
            LIMIT 1
        ");
        $up->execute(array(
            ':idComp' => $idComprobante,
            ':idMov'  => $idMovimiento,
        ));

        if ((int)$up->rowCount() >= 0) {
            $result['vinculo'] = 'movimientos.id_comprobante';
            $result['reemplazo'] = ($prev > 0);
            $result['id_comprobante_anterior'] = $prev > 0 ? $prev : null;
            $vinculado = true;
        }
    } catch (Exception $e) {
        // seguimos e intentamos con cobros
    }

    /* =========================
      2) cobros.id_comprobante
    ========================= */
    $cobro = cobro_by_movimiento($pdo, (int)$idMovimiento);
    if ($cobro) {
        $idCobro = isset($cobro['id_cobro']) ? (int)$cobro['id_cobro'] : 0;
        $prevCobro = isset($cobro['id_comprobante']) ? (int)$cobro['id_comprobante'] : 0;

        if ($idCobro > 0) {
            if ($prevCobro > 0 && !$force) {
                if (!$vinculado) {
                    throw new Exception('Ese cobro ya tiene comprobante asociado. Usá force=true para reemplazar.');
                }
            } else {
                try {
                    $upCobro = $pdo->prepare("
                        UPDATE cobros
                        SET id_comprobante = :idComp
                        WHERE id_cobro = :idCobro
                        LIMIT 1
                    ");
                    $upCobro->execute(array(
                        ':idComp'  => $idComprobante,
                        ':idCobro' => $idCobro,
                    ));

                    try {
                        $upComp = $pdo->prepare("
                            UPDATE comprobantes_archivos
                            SET id_cobro = :idCobro
                            WHERE id_comprobante = :idComp
                            LIMIT 1
                        ");
                        $upComp->execute(array(
                            ':idCobro' => $idCobro,
                            ':idComp'  => $idComprobante,
                        ));
                    } catch (Exception $e2) {
                        // no rompemos el flujo
                    }

                    $result['id_cobro'] = $idCobro;

                    if (!$result['vinculo']) {
                        $result['vinculo'] = 'cobros.id_comprobante';
                    } else {
                        $result['vinculo'] .= ' + cobros.id_comprobante';
                    }

                    $result['reemplazo'] = $result['reemplazo'] || ($prevCobro > 0);

                    if ($prevCobro > 0 && !$result['id_comprobante_anterior']) {
                        $result['id_comprobante_anterior'] = $prevCobro;
                    }

                    $vinculado = true;
                } catch (Exception $e3) {
                    if (!$vinculado) {
                        throw new Exception('No se pudo vincular también en cobros: ' . $e3->getMessage());
                    }
                }
            }
        }
    }

    if (!$vinculado) {
        throw new Exception('No se pudo vincular el comprobante al movimiento.');
    }

    return $result;
}

function registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta) {
    $err = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) {
        throw new Exception('Error al subir archivo (UPLOAD_ERR=' . $err . ').');
    }

    $tmp = isset($file['tmp_name']) ? (string)$file['tmp_name'] : '';
    if ($tmp === '' || !is_file($tmp)) {
        throw new Exception('Archivo temporal inválido.');
    }

    $origName = isset($file['name']) ? (string)$file['name'] : 'comprobante.pdf';
    $mime = isset($file['type']) ? (string)$file['type'] : 'application/pdf';
    $size = isset($file['size']) ? (int)$file['size'] : 0;

    $ext = strtolower((string)pathinfo($origName, PATHINFO_EXTENSION));
    if ($ext !== 'pdf') {
        throw new Exception('El archivo debe ser PDF.');
    }

    $sha = hash_file('sha256', $tmp);
    if (!$sha) {
        throw new Exception('No se pudo calcular hash del archivo.');
    }

    $tipo = strtoupper(trim($tipo ? $tipo : 'FACTURA'));
    $tipoFolder = tipo_to_folder($tipo);

    $uploadsBase = get_private_uploads_dir();
    safe_mkdir($uploadsBase);

    $tenantDir = $uploadsBase
        . '/tenants/t_' . (int)$tenantId
        . '/comprobantes/' . date('Y')
        . '/' . date('m')
        . '/' . $tipoFolder;

    safe_mkdir($tenantDir);

    $prefix = $tipoFolder;
    $idMovimientoMeta = n_int(isset($meta['id_movimiento']) ? $meta['id_movimiento'] : null);
    $idCobroMeta = n_int(isset($meta['id_cobro']) ? $meta['id_cobro'] : null);

    if ($idMovimientoMeta) $prefix .= '__mov_' . $idMovimientoMeta;
    if ($idCobroMeta) $prefix .= '__cobro_' . $idCobroMeta;

    $finalName = $prefix . '__' . $sha . '.pdf';
    $absPath = $tenantDir . '/' . $finalName;

    $moved = false;
    if (is_uploaded_file($tmp) && @move_uploaded_file($tmp, $absPath)) {
        $moved = true;
    } elseif (@rename($tmp, $absPath)) {
        $moved = true;
    } elseif (@copy($tmp, $absPath)) {
        $moved = true;
        @unlink($tmp);
    }

    if (!$moved || !is_file($absPath) || (int)filesize($absPath) <= 0) {
        throw new Exception('No se pudo guardar el archivo en el servidor.');
    }

    $relPath = normalize_rel_from_private_uploads($absPath, $uploadsBase);

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
        @unlink($absPath);
        throw new Exception('No se pudo obtener id_comprobante.');
    }

    $realUrl = build_download_url($idComp);

    $upUrl = $pdo->prepare("
        UPDATE comprobantes_archivos
        SET archivo_url = :u
        WHERE id_comprobante = :id
        LIMIT 1
    ");
    $upUrl->execute(array(
        ':u'  => $realUrl,
        ':id' => $idComp,
    ));

    return array(
        'id_comprobante' => $idComp,
        'archivo_url'    => $realUrl,
        'archivo_path'   => $relPath,
        'sha256'         => $sha,
        'filename'       => $finalName,
        'mime'           => ($mime !== '' ? $mime : 'application/pdf'),
        'size'           => max(0, $size),
        'uploadsBase'    => $uploadsBase,
        'tenantDir'      => $tenantDir,
        'tipo'           => $tipo,
        'tipoFolder'     => $tipoFolder,
    );
}

/* =========================================================
   TENANT
========================================================= */
$tenantId = resolve_tenant_id_or_fail();

/* =========================================================
   SUBIR SIMPLE
========================================================= */
if ($action === 'comprobantes_subir') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail_default('Método inválido. Usá POST.', 405);
    }

    $file = null;
    if (isset($_FILES['archivo'])) $file = $_FILES['archivo'];
    if (!$file && isset($_FILES['pdf'])) $file = $_FILES['pdf'];

    if (!$file) {
        comprobantes_fail_default('Falta archivo PDF (campo "archivo" o "pdf").', 400);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA';
    $meta = array();

    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    }

    try {
        $pdo->beginTransaction();

        $reg = registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);

        $pdo->commit();

        comprobantes_ok(array(
            'id_comprobante' => $reg['id_comprobante'],
            'archivo_url'    => $reg['archivo_url'],
            'archivo_path'   => $reg['archivo_path'],
            'sha256'         => $reg['sha256'],
            'filename'       => $reg['filename'],
        ));
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail_default('No se pudo subir el comprobante: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   SUBIR + INSERTAR + VINCULAR 1 MOVIMIENTO
========================================================= */
if ($action === 'comprobantes_vincular_movimiento') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail_default('Método inválido. Usá POST.', 405);
    }

    $body = read_json_body();

    $idMovimiento = n_int(isset($_POST['id_movimiento']) ? $_POST['id_movimiento'] : null);
    if (!$idMovimiento) {
        $idMovimiento = n_int(isset($body['id_movimiento']) ? $body['id_movimiento'] : null);
    }

    if (!$idMovimiento) {
        comprobantes_fail_default('Falta id_movimiento válido.', 400);
    }

    $force = false;
    if (isset($_POST['force'])) {
        $force = !empty($_POST['force']);
    } else {
        $force = !empty($body['force']);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA';

    $meta = array();
    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    }

    $file = null;
    if (isset($_FILES['pdf'])) $file = $_FILES['pdf'];
    if (!$file && isset($_FILES['archivo'])) $file = $_FILES['archivo'];

    if (!$file) {
        comprobantes_fail_default('Falta archivo PDF (campo "pdf" o "archivo").', 400);
    }

    try {
        $pdo->beginTransaction();

        $meta['id_movimiento'] = $idMovimiento;

        $reg = registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
        $idComprobante = (int)$reg['id_comprobante'];

        $vinc = vincular_comprobante_a_movimiento($pdo, $idMovimiento, $idComprobante, $force);

        $pdo->commit();

        comprobantes_ok(array(
            'mensaje'        => 'PDF subido, registrado y vinculado correctamente.',
            'id_comprobante' => $idComprobante,
            'id_movimiento'  => $idMovimiento,
            'archivo_url'    => $reg['archivo_url'],
            'archivo_path'   => $reg['archivo_path'],
            'sha256'         => $reg['sha256'],
            'filename'       => $reg['filename'],
            'vinculo'        => $vinc['vinculo'],
            'reemplazo'      => $vinc['reemplazo'],
            'id_cobro'       => $vinc['id_cobro'],
        ));
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail_default('No se pudo registrar y vincular el PDF: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ASOCIAR 1x1 JSON
========================================================= */
if ($action === 'comprobantes_asociar_movimiento') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail_default('Método inválido. Usá POST.', 405);
    }

    $body = read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : array());

    $idComp = n_int(isset($src['id_comprobante']) ? $src['id_comprobante'] : (isset($src['idComp']) ? $src['idComp'] : null));
    $idMov  = n_int(isset($src['id_movimiento']) ? $src['id_movimiento'] : null);
    $force  = !empty($src['force']);

    if (!$idComp) comprobantes_fail_default('Falta id_comprobante.', 400);
    if (!$idMov)  comprobantes_fail_default('Falta id_movimiento.', 400);

    $st = $pdo->prepare("SELECT 1 FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
    $st->execute(array(':id' => $idComp));
    if (!(bool)$st->fetchColumn()) {
        comprobantes_fail_default('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $vinc = vincular_comprobante_a_movimiento($pdo, $idMov, $idComp, $force);

        $pdo->commit();

        comprobantes_ok($vinc);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail_default('No se pudo asociar comprobante: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   VINCULAR LOTE
========================================================= */
if ($action === 'comprobantes_vincular_movimientos_lote' || $action === 'comprobantes_asociar_movimientos') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail_default('Método inválido. Usá POST.', 405);
    }

    $body = read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : array());

    $idComp = n_int(isset($src['id_comprobante']) ? $src['id_comprobante'] : (isset($src['idComp']) ? $src['idComp'] : null));
    $force  = !empty($src['force']);

    $ids = array();
    if (isset($src['ids_movimiento']) && is_array($src['ids_movimiento'])) {
        $ids = $src['ids_movimiento'];
    } elseif (isset($src['ids_movimientos']) && is_array($src['ids_movimientos'])) {
        $ids = $src['ids_movimientos'];
    }

    $idsOk = array();
    foreach ($ids as $x) {
        $n = n_int($x);
        if ($n) $idsOk[] = $n;
    }
    $idsOk = array_values(array_unique($idsOk));

    if (!$idComp) comprobantes_fail_default('Falta id_comprobante.', 400);
    if (!$idsOk) comprobantes_fail_default('Faltan ids_movimiento.', 400);

    $st = $pdo->prepare("SELECT 1 FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
    $st->execute(array(':id' => $idComp));
    if (!(bool)$st->fetchColumn()) {
        comprobantes_fail_default('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $result = array(
            'asociados' => array(),
            'errores'   => array(),
        );

        foreach ($idsOk as $idMov) {
            try {
                $vinc = vincular_comprobante_a_movimiento($pdo, $idMov, $idComp, $force);
                $result['asociados'][] = $vinc;
            } catch (Exception $e) {
                $result['errores'][] = array(
                    'id_movimiento' => $idMov,
                    'mensaje' => $e->getMessage(),
                );
            }
        }

        $pdo->commit();

        comprobantes_ok(array(
            'id_comprobante' => $idComp,
            'force' => $force,
            'result' => $result,
        ));
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail_default('No se pudo vincular el comprobante al lote: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   DESCARGAR
========================================================= */
if ($action === 'comprobantes_descargar') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        comprobantes_fail_default('Falta id_comprobante válido.', 400);
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
            comprobantes_fail_default('Comprobante no encontrado.', 404);
        }

        $uploadsBase = get_private_uploads_dir();

        $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
        if ($rel === '') {
            $rel = isset($row['archivo_url']) ? (string)$row['archivo_url'] : '';
        }

        $rel = normalize_db_rel_path($rel);

        if ($rel === '') {
            comprobantes_fail_default('Comprobante sin ruta.', 500);
        }

        if (strpos($rel, 'uploads/') === 0) {
            $relWithoutUploads = substr($rel, strlen('uploads/'));
        } else {
            $relWithoutUploads = ltrim($rel, '/');
        }

        $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

        if (!is_file($abs)) {
            comprobantes_fail_default('Archivo no existe en disco.', 404, array(
                'abs' => $abs,
                'rel' => $rel,
                'uploadsBase' => $uploadsBase,
            ));
        }

        if (!is_inside($abs, $uploadsBase)) {
            comprobantes_fail_default('Ruta inválida.', 403, array(
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
    } catch (Exception $e) {
        comprobantes_fail_default('Error al descargar: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   INFO
========================================================= */
if ($action === 'comprobantes_info') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        comprobantes_fail_default('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
        $st = $pdo->prepare("SELECT * FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute(array(':id' => $id));
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            comprobantes_fail_default('Comprobante no encontrado.', 404);
        }

        comprobantes_ok(array('data' => $row));
    } catch (Exception $e) {
        comprobantes_fail_default('Error: ' . $e->getMessage(), 500);
    }
}

comprobantes_fail_default('Acción de comprobantes no válida: ' . $action, 400);