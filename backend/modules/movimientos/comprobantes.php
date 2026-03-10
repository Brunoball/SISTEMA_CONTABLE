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

function comprobante_exists($pdo, $idComprobante) {
    $st = $pdo->prepare("SELECT id_comprobante FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
    $st->execute(array(':id' => $idComprobante));
    return (bool)$st->fetch(PDO::FETCH_ASSOC);
}

function get_comprobante_tipo($pdo, $idComprobante) {
    $st = $pdo->prepare("
        SELECT tipo
        FROM comprobantes_archivos
        WHERE id_comprobante = :id
        LIMIT 1
    ");
    $st->execute(array(':id' => $idComprobante));
    $tipo = $st->fetchColumn();
    return strtoupper(trim((string)$tipo));
}

function tipo_relacion_from_tipo($tipo) {
    $t = strtoupper(trim((string)$tipo));
    if ($t === 'FACTURA') return 'FACTURA';
    if ($t === 'NOTA_CREDITO') return 'NOTA_CREDITO';
    if ($t === 'NOTA_DEBITO') return 'NOTA_DEBITO';
    return 'OTRO';
}

function tipo_es_documento_de_movimiento($tipo) {
    $t = strtoupper(trim((string)$tipo));
    return in_array($t, array('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'OTRO'), true);
}

function tipo_es_documento_de_cobro($tipo) {
    $t = strtoupper(trim((string)$tipo));
    return $t === 'RECIBO';
}

function get_last_cobro_by_movimiento($pdo, $idMovimiento) {
    $st = $pdo->prepare("
        SELECT id_cobro, id_movimiento, id_comprobante, fecha_cobro, created_at
        FROM cobros
        WHERE id_movimiento = :idMov
        ORDER BY id_cobro DESC
        LIMIT 1
    ");
    $st->execute(array(':idMov' => $idMovimiento));
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? $row : null;
}

/* =========================================================
   MOVIMIENTOS_COMPROBANTES
========================================================= */
function ensure_movimiento_comprobante_table_exists($pdo) {
    $st = $pdo->query("SHOW TABLES LIKE 'movimientos_comprobantes'");
    $exists = $st ? (bool)$st->fetchColumn() : false;

    if (!$exists) {
        throw new Exception(
            "La tabla movimientos_comprobantes no existe. Creala manualmente antes de usar comprobantes."
        );
    }
}

function get_movimiento_comprobante_row($pdo, $idMovimiento, $idComprobante, $tipoRelacion) {
    $st = $pdo->prepare("
        SELECT *
        FROM movimientos_comprobantes
        WHERE id_movimiento = :idMov
          AND id_comprobante = :idComp
          AND tipo_relacion = :tipo
        LIMIT 1
    ");
    $st->execute(array(
        ':idMov' => $idMovimiento,
        ':idComp' => $idComprobante,
        ':tipo' => $tipoRelacion,
    ));
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? $row : null;
}

function get_movimiento_factura_principal($pdo, $idMovimiento) {
    $st = $pdo->prepare("
        SELECT *
        FROM movimientos_comprobantes
        WHERE id_movimiento = :idMov
          AND tipo_relacion = 'FACTURA'
          AND principal = 1
        ORDER BY id_movimiento_comprobante DESC
        LIMIT 1
    ");
    $st->execute(array(':idMov' => $idMovimiento));
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ? $row : null;
}

function link_comprobante_to_movimiento_docs($pdo, $idMovimiento, $idComprobante, $tipo, $force) {
    if ((int)$idMovimiento <= 0) {
        throw new Exception('id_movimiento inválido.');
    }

    if ((int)$idComprobante <= 0) {
        throw new Exception('id_comprobante inválido.');
    }

    if (!movimiento_exists($pdo, (int)$idMovimiento)) {
        throw new Exception('El movimiento no existe.');
    }

    ensure_movimiento_comprobante_table_exists($pdo);

    $tipoRelacion = tipo_relacion_from_tipo($tipo);
    $principal = ($tipoRelacion === 'FACTURA') ? 1 : 0;

    $existingSame = get_movimiento_comprobante_row($pdo, $idMovimiento, $idComprobante, $tipoRelacion);
    if ($existingSame) {
        if ($principal === 1 && (int)$existingSame['principal'] !== 1) {
            $upSame = $pdo->prepare("
                UPDATE movimientos_comprobantes
                SET principal = 1
                WHERE id_movimiento_comprobante = :id
                LIMIT 1
            ");
            $upSame->execute(array(':id' => (int)$existingSame['id_movimiento_comprobante']));
        }

        return array(
            'modo' => 'movimiento_documental',
            'tipo_documento' => $tipo,
            'tipo_relacion' => $tipoRelacion,
            'id_movimiento' => (int)$idMovimiento,
            'id_comprobante' => (int)$idComprobante,
            'id_cobro' => null,
            'vinculo' => 'movimientos_comprobantes',
            'reemplazo' => false,
            'id_comprobante_anterior' => null,
            'principal' => $principal,
            'ya_existia' => true,
        );
    }

    if ($tipoRelacion === 'FACTURA') {
        $principalActual = get_movimiento_factura_principal($pdo, $idMovimiento);

        if ($principalActual && (int)$principalActual['id_comprobante'] !== (int)$idComprobante) {
            if (!$force) {
                throw new Exception(
                    'Ese movimiento ya tiene una FACTURA principal asociada (' .
                    (int)$principalActual['id_comprobante'] .
                    '). Usá force=true para reemplazar la principal.'
                );
            }

            $down = $pdo->prepare("
                UPDATE movimientos_comprobantes
                SET principal = 0
                WHERE id_movimiento = :idMov
                  AND tipo_relacion = 'FACTURA'
                  AND principal = 1
            ");
            $down->execute(array(':idMov' => $idMovimiento));
        }
    }

    $ins = $pdo->prepare("
        INSERT INTO movimientos_comprobantes
            (id_movimiento, id_comprobante, tipo_relacion, principal)
        VALUES
            (:idMov, :idComp, :tipo, :principal)
    ");
    $ins->execute(array(
        ':idMov' => $idMovimiento,
        ':idComp' => $idComprobante,
        ':tipo' => $tipoRelacion,
        ':principal' => $principal,
    ));

    return array(
        'modo' => 'movimiento_documental',
        'tipo_documento' => $tipo,
        'tipo_relacion' => $tipoRelacion,
        'id_movimiento' => (int)$idMovimiento,
        'id_comprobante' => (int)$idComprobante,
        'id_cobro' => null,
        'vinculo' => 'movimientos_comprobantes',
        'reemplazo' => ($tipoRelacion === 'FACTURA' && !empty($principalActual)),
        'id_comprobante_anterior' => (!empty($principalActual) ? (int)$principalActual['id_comprobante'] : null),
        'principal' => $principal,
        'ya_existia' => false,
    );
}

function link_comprobante_to_cobro($pdo, $idMovimiento, $idComprobante, $tipo, $force) {
    if ((int)$idMovimiento <= 0) {
        throw new Exception('id_movimiento inválido.');
    }

    if ((int)$idComprobante <= 0) {
        throw new Exception('id_comprobante inválido.');
    }

    if (!movimiento_exists($pdo, (int)$idMovimiento)) {
        throw new Exception('El movimiento no existe.');
    }

    $cobro = get_last_cobro_by_movimiento($pdo, (int)$idMovimiento);
    if (!$cobro) {
        throw new Exception('Ese movimiento todavía no tiene cobros para asociar un RECIBO.');
    }

    $idCobro = (int)$cobro['id_cobro'];
    $prevComp = isset($cobro['id_comprobante']) ? (int)$cobro['id_comprobante'] : 0;

    if ($prevComp > 0 && $prevComp !== (int)$idComprobante && !$force) {
        throw new Exception(
            'El cobro #' . $idCobro . ' ya tiene un recibo asociado (' . $prevComp . '). Usá force=true para reemplazar.'
        );
    }

    $up = $pdo->prepare("
        UPDATE cobros
        SET id_comprobante = :idComp
        WHERE id_cobro = :idCobro
        LIMIT 1
    ");
    $up->execute(array(
        ':idComp' => $idComprobante,
        ':idCobro' => $idCobro,
    ));

    return array(
        'modo' => 'cobro_documental',
        'tipo_documento' => $tipo,
        'tipo_relacion' => 'RECIBO',
        'id_movimiento' => (int)$idMovimiento,
        'id_comprobante' => (int)$idComprobante,
        'id_cobro' => $idCobro,
        'vinculo' => 'cobros.id_comprobante',
        'reemplazo' => ($prevComp > 0 && $prevComp !== (int)$idComprobante),
        'id_comprobante_anterior' => ($prevComp > 0 ? $prevComp : null),
        'principal' => 0,
        'ya_existia' => ($prevComp === (int)$idComprobante),
    );
}

/* =========================================================
   VINCULACIÓN GENERAL
========================================================= */
function vincular_comprobante_a_movimiento($pdo, $idMovimiento, $idComprobante, $force) {
    if ((int)$idMovimiento <= 0) {
        throw new Exception('id_movimiento inválido.');
    }

    if ((int)$idComprobante <= 0) {
        throw new Exception('id_comprobante inválido.');
    }

    if (!comprobante_exists($pdo, (int)$idComprobante)) {
        throw new Exception('El id_comprobante no existe.');
    }

    $tipo = get_comprobante_tipo($pdo, (int)$idComprobante);
    if ($tipo === '') {
        $tipo = 'OTRO';
    }

    if (tipo_es_documento_de_cobro($tipo)) {
        return link_comprobante_to_cobro($pdo, $idMovimiento, $idComprobante, $tipo, $force);
    }

    return link_comprobante_to_movimiento_docs($pdo, $idMovimiento, $idComprobante, $tipo, $force);
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
            'tipo'           => $reg['tipo'],
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
            'tipo'           => $reg['tipo'],
            'vinculo'        => $vinc['vinculo'],
            'reemplazo'      => $vinc['reemplazo'],
            'id_cobro'       => $vinc['id_cobro'],
            'tipo_relacion'  => $vinc['tipo_relacion'],
            'principal'      => $vinc['principal'],
        ));
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail_default('No se pudo registrar y vincular el PDF: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ASOCIAR 1x1 JSON
========================================================= */
if ($action === 'comprobantes_asociar_movimiento' || $action === 'comprobantes_vincular_movimiento_json') {
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

    if (!comprobante_exists($pdo, $idComp)) {
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
if (
    $action === 'comprobantes_vincular_movimientos_lote' ||
    $action === 'comprobantes_asociar_movimientos' ||
    $action === 'comprobantes_vincular_movimientos'
) {
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

    if (!comprobante_exists($pdo, $idComp)) {
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