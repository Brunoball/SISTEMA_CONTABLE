<?php
declare(strict_types=1);

$origin = isset($_SERVER['HTTP_ORIGIN']) ? (string)$_SERVER['HTTP_ORIGIN'] : '';

if (!headers_sent()) {
    if ($origin !== '') {
        header("Access-Control-Allow-Origin: " . $origin);
        header("Vary: Origin");
    } else {
        header("Access-Control-Allow-Origin: *");
    }

    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session, X-IdTenant, X-Id-Tenant, Range');
    header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges, Content-Type');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
}

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function tenant_logo_fail(string $msg, int $httpCode, array $extra = array()): void {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }

    http_response_code($httpCode);

    $base = array(
        'exito'   => false,
        'mensaje' => $msg
    );

    echo json_encode(array_merge($base, $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

global $pdo_master;

if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
    tenant_logo_fail('PDO master no disponible.', 500);
}

function dirname_n_tenant_logo(string $path, int $levels): string {
    $out = $path;
    for ($i = 0; $i < $levels; $i++) {
        $out = dirname($out);
    }
    return $out;
}

function get_public_html_dir_tenant_logo(): string {
    $apiDir = realpath(dirname_n_tenant_logo(__DIR__, 3));

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

    return dirname_n_tenant_logo(__DIR__, 5);
}

function get_balto_private_dir_tenant_logo(): string {
    $publicHtml = get_public_html_dir_tenant_logo();
    $homeDir = realpath($publicHtml . '/..');

    if ($homeDir && is_dir($homeDir . '/balto_private')) {
        $cand = realpath($homeDir . '/balto_private');
        if ($cand && is_dir($cand)) {
            return $cand;
        }
    }

    $apiDir = realpath(dirname_n_tenant_logo(__DIR__, 3));

    if ($apiDir) {
        $projectDir = realpath($apiDir . '/..');

        if ($projectDir) {
            $cand1 = realpath($projectDir . '/../balto_private');
            if ($cand1 && is_dir($cand1)) {
                return $cand1;
            }

            $cand2 = realpath($projectDir . '/../../balto_private');
            if ($cand2 && is_dir($cand2)) {
                return $cand2;
            }
        }
    }

    tenant_logo_fail('No se encontró balto_private.', 500);
}

function get_private_uploads_dir_tenant_logo(): string {
    $baltoPrivate = get_balto_private_dir_tenant_logo();
    $uploads = rtrim($baltoPrivate, '/') . '/uploads';

    if (!is_dir($uploads)) {
        tenant_logo_fail('No existe balto_private/uploads.', 500);
    }

    return $uploads;
}

function normalize_db_rel_path_tenant_logo(string $path): string {
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

function is_inside_tenant_logo(string $path, string $baseDir): bool {
    $pathReal = realpath($path);
    $baseReal = realpath($baseDir);

    if (!$pathReal || !$baseReal) {
        return false;
    }

    $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
    $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

    return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
}

function mime_tenant_logo(string $abs): string {
    $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));

    switch ($ext) {
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'gif':
            return 'image/gif';
        case 'svg':
            return 'image/svg+xml';
        default:
            return 'application/octet-stream';
    }
}

/* =========================================================
   Sesión master
========================================================= */
$ses = isset($GLOBALS['SESSION_MASTER']) ? $GLOBALS['SESSION_MASTER'] : null;
$idTenant = 0;

if (is_array($ses) && isset($ses['idTenant'])) {
    $idTenant = (int)$ses['idTenant'];
}

if ($idTenant <= 0) {
    tenant_logo_fail('Sesión inválida.', 401);
}

/* =========================================================
   Tipo de logo
   ?tipo=principal  -> logo_url
   ?tipo=icono      -> logo_icono_url
========================================================= */
$tipo = isset($_GET['tipo']) ? mb_strtolower(trim((string)$_GET['tipo'])) : 'principal';

$campo = 'logo_url';
if ($tipo === 'icono') {
    $campo = 'logo_icono_url';
}

try {
    $sql = "
        SELECT {$campo} AS logo_path
        FROM tenants
        WHERE idTenant = :idTenant
          AND activo = 1
        LIMIT 1
    ";

    $st = $pdo_master->prepare($sql);
    $st->execute(array(':idTenant' => $idTenant));
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        tenant_logo_fail('Tenant no encontrado.', 404);
    }

    $rel = isset($row['logo_path']) ? (string)$row['logo_path'] : '';
    $rel = normalize_db_rel_path_tenant_logo($rel);

    if ($rel === '') {
        tenant_logo_fail(
            $tipo === 'icono'
                ? 'El tenant no tiene logo icono configurado.'
                : 'El tenant no tiene logo principal configurado.',
            404
        );
    }

    $uploadsBase = get_private_uploads_dir_tenant_logo();

    if (strpos($rel, 'uploads/') === 0) {
        $relWithoutUploads = substr($rel, strlen('uploads/'));
    } else {
        $relWithoutUploads = ltrim($rel, '/');
    }

    $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

    if (!is_file($abs)) {
        tenant_logo_fail('Logo no encontrado en disco.', 404, array(
            'tipo'      => $tipo,
            'logo_path' => $rel,
            'abs'       => $abs
        ));
    }

    if (!is_inside_tenant_logo($abs, $uploadsBase)) {
        tenant_logo_fail('Ruta inválida.', 403);
    }

    $mime = mime_tenant_logo($abs);
    $size = (int)filesize($abs);
    $filename = basename($abs);

    if (!headers_sent()) {
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . $size);
        header('Content-Disposition: inline; filename="' . $filename . '"');
    }

    readfile($abs);
    exit;

} catch (Throwable $e) {
    tenant_logo_fail('Error al obtener logo.', 500, array(
        'detalle' => $e->getMessage()
    ));
}