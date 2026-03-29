<?php
// backend/modules/movimientos/compras/comprobantes_compras.php
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
   JSON
========================================================= */
if (!function_exists('compras_comp_json')) {
    function compras_comp_json(array $arr, int $httpCode = 200): void
    {
        if (!headers_sent()) {
            http_response_code($httpCode);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('compras_comp_ok')) {
    function compras_comp_ok(array $arr = []): void
    {
        compras_comp_json(array_merge(['exito' => true], $arr), 200);
    }
}

if (!function_exists('compras_comp_fail')) {
    function compras_comp_fail(string $msg, int $httpCode = 400, array $extra = []): void
    {
        compras_comp_json(array_merge(['exito' => false, 'mensaje' => $msg], $extra), $httpCode);
    }
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
    compras_comp_fail('PDO tenant no disponible.', 500);
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
   HELPERS BASE
========================================================= */
if (!function_exists('compras_comp_read_json_body')) {
    function compras_comp_read_json_body(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $j = json_decode($raw, true);
        return is_array($j) ? $j : [];
    }
}

if (!function_exists('compras_comp_n_int')) {
    function compras_comp_n_int($v): ?int
    {
        if ($v === null || $v === '') return null;
        if (is_int($v)) return $v > 0 ? $v : null;
        if (is_numeric($v)) {
            $n = (int)$v;
            return $n > 0 ? $n : null;
        }
        return null;
    }
}

if (!function_exists('compras_comp_safe_str')) {
    function compras_comp_safe_str($v): string
    {
        return trim((string)$v);
    }
}

if (!function_exists('compras_comp_is_https_request')) {
    function compras_comp_is_https_request(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
        if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
        $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
        return strtolower($xfp) === 'https';
    }
}

if (!function_exists('compras_comp_dirname_n')) {
    function compras_comp_dirname_n(string $path, int $levels): string
    {
        $out = $path;
        for ($i = 0; $i < $levels; $i++) {
            $out = dirname($out);
        }
        return $out;
    }
}

if (!function_exists('compras_comp_get_public_html_dir')) {
    function compras_comp_get_public_html_dir(): string
    {
        $apiDir = realpath(compras_comp_dirname_n(__DIR__, 3));
        if ($apiDir && is_dir($apiDir)) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir && is_dir($projectDir)) {
                $publicHtml = realpath($projectDir . '/..');
                if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
                return $projectDir;
            }
            return dirname($apiDir);
        }

        return compras_comp_dirname_n(__DIR__, 5);
    }
}

if (!function_exists('compras_comp_get_balto_private_dir')) {
    function compras_comp_get_balto_private_dir(): string
    {
        $publicHtml = compras_comp_get_public_html_dir();
        $homeDir = realpath($publicHtml . '/..');

        if ($homeDir && is_dir($homeDir . '/balto_private')) {
            $cand = realpath($homeDir . '/balto_private');
            if ($cand && is_dir($cand)) return $cand;
        }

        $apiDir = realpath(compras_comp_dirname_n(__DIR__, 3));
        if ($apiDir) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir) {
                $cand1 = realpath($projectDir . '/../balto_private');
                if ($cand1 && is_dir($cand1)) return $cand1;

                $cand2 = realpath($projectDir . '/../../balto_private');
                if ($cand2 && is_dir($cand2)) return $cand2;
            }
        }

        compras_comp_fail('No se encontró la carpeta balto_private.', 500, [
            'public_html' => $publicHtml,
        ]);
    }
}

if (!function_exists('compras_comp_get_private_uploads_dir')) {
    function compras_comp_get_private_uploads_dir(): string
    {
        $baltoPrivate = compras_comp_get_balto_private_dir();
        $uploads = $baltoPrivate . '/uploads';

        if (!is_dir($uploads)) {
            compras_comp_fail('No existe la carpeta balto_private/uploads.', 500, [
                'balto_private' => $baltoPrivate,
                'uploads' => $uploads,
            ]);
        }

        return $uploads;
    }
}

if (!function_exists('compras_comp_safe_mkdir')) {
    function compras_comp_safe_mkdir(string $path): void
    {
        if (is_dir($path)) {
            if (!is_writable($path)) {
                compras_comp_fail('Carpeta existe pero no es writable.', 500, ['path' => $path]);
            }
            return;
        }

        if (!@mkdir($path, 0775, true) && !is_dir($path)) {
            compras_comp_fail('No se pudo crear carpeta.', 500, ['path' => $path]);
        }

        if (!is_writable($path)) {
            compras_comp_fail('Carpeta creada pero no es writable.', 500, ['path' => $path]);
        }
    }
}

if (!function_exists('compras_comp_normalize_rel_from_private_uploads')) {
    function compras_comp_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
    {
        $abs = str_replace('\\', '/', $abs);
        $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

        if (strpos($abs, $uploadsBase . '/') === 0) {
            return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
        }

        return ltrim($abs, '/');
    }
}

if (!function_exists('compras_comp_normalize_db_rel_path')) {
    function compras_comp_normalize_db_rel_path(string $path): string
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
}

if (!function_exists('compras_comp_is_inside')) {
    function compras_comp_is_inside(string $path, string $baseDir): bool
    {
        $pathReal = realpath($path);
        $baseReal = realpath($baseDir);
        if (!$pathReal || !$baseReal) return false;

        $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
        $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

        return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
    }
}

if (!function_exists('compras_comp_api_php_abs_url')) {
    function compras_comp_api_php_abs_url(): string
    {
        $scheme = compras_comp_is_https_request() ? 'https' : 'http';
        $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';
        $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '';

        $posRoutes = strpos($script, '/api/routes/api.php');
        if ($posRoutes !== false) {
            $prefix = substr($script, 0, $posRoutes);
            return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
        }

        $posApi = strpos($script, '/api.php');
        if ($posApi !== false) {
            $prefix = substr($script, 0, $posApi);
            return $scheme . '://' . $host . $prefix . '/api.php';
        }

        return $scheme . '://' . $host . '/api/routes/api.php';
    }
}

if (!function_exists('compras_comp_build_download_url')) {
    function compras_comp_build_download_url(int $idComp): string
    {
        return compras_comp_api_php_abs_url() . '?action=compras_comprobantes_descargar&id_comprobante=' . (int)$idComp;
    }
}

if (!function_exists('compras_comp_tipo_to_folder')) {
    function compras_comp_tipo_to_folder(string $tipo): string
    {
        $t = strtoupper(trim($tipo));
        if ($t === '') $t = 'FACTURA';

        $map = [
            'FACTURA'      => 'factura',
            'NOTA_CREDITO' => 'nota_credito',
            'NOTA_DEBITO'  => 'nota_debito',
            'OTRO'         => 'otros',
        ];

        if (isset($map[$t])) return $map[$t];

        $t = strtolower($t);
        $t = str_replace([' ', '-', '.'], '_', $t);
        $t = preg_replace('/[^a-z0-9_]/', '', $t);
        $t = trim($t, '_');

        return $t !== '' ? $t : 'otros';
    }
}

if (!function_exists('compras_comp_resolve_tenant_id_or_fail')) {
    function compras_comp_resolve_tenant_id_or_fail(): int
    {
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
        } elseif (isset($_SERVER['HTTP_X_ID_TENANT'])) {
            $srv = (string)$_SERVER['HTTP_X_ID_TENANT'];
        }

        $srv = trim($srv);
        if ($srv !== '' && ctype_digit($srv) && (int)$srv > 0) {
            return (int)$srv;
        }

        compras_comp_fail(
            'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php con sesión válida.',
            401
        );
    }
}

if (!function_exists('compras_comp_movimiento_exists')) {
    function compras_comp_movimiento_exists(PDO $pdo, int $idMovimiento): bool
    {
        $st = $pdo->prepare("SELECT id_movimiento FROM movimientos WHERE id_movimiento = :id LIMIT 1");
        $st->execute([':id' => $idMovimiento]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('compras_comp_comprobante_exists')) {
    function compras_comp_comprobante_exists(PDO $pdo, int $idComprobante): bool
    {
        $st = $pdo->prepare("SELECT id_comprobante FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute([':id' => $idComprobante]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('compras_comp_get_comprobante_tipo')) {
    function compras_comp_get_comprobante_tipo(PDO $pdo, int $idComprobante): string
    {
        $st = $pdo->prepare("
            SELECT tipo
            FROM comprobantes_archivos
            WHERE id_comprobante = :id
            LIMIT 1
        ");
        $st->execute([':id' => $idComprobante]);
        $tipo = $st->fetchColumn();
        return strtoupper(trim((string)$tipo));
    }
}

if (!function_exists('compras_comp_tipo_relacion_from_tipo')) {
    function compras_comp_tipo_relacion_from_tipo(string $tipo): string
    {
        $t = strtoupper(trim($tipo));
        if ($t === 'FACTURA') return 'FACTURA';
        if ($t === 'NOTA_CREDITO') return 'NOTA_CREDITO';
        if ($t === 'NOTA_DEBITO') return 'NOTA_DEBITO';
        return 'OTRO';
    }
}

if (!function_exists('compras_comp_parse_ids_movimiento_from_request')) {
    function compras_comp_parse_ids_movimiento_from_request(array $src): array
    {
        $ids = [];

        if (isset($src['ids_movimiento']) && is_array($src['ids_movimiento'])) {
            $ids = $src['ids_movimiento'];
        } elseif (isset($src['ids_movimientos']) && is_array($src['ids_movimientos'])) {
            $ids = $src['ids_movimientos'];
        } elseif (isset($src['ids_movimiento']) && is_string($src['ids_movimiento'])) {
            $raw = trim((string)$src['ids_movimiento']);
            if ($raw !== '') {
                $tmp = json_decode($raw, true);
                $ids = is_array($tmp) ? $tmp : (preg_split('/[\s,;]+/', $raw) ?: []);
            }
        } elseif (isset($src['ids_movimientos']) && is_string($src['ids_movimientos'])) {
            $raw = trim((string)$src['ids_movimientos']);
            if ($raw !== '') {
                $tmp = json_decode($raw, true);
                $ids = is_array($tmp) ? $tmp : (preg_split('/[\s,;]+/', $raw) ?: []);
            }
        }

        $idsOk = [];
        foreach ((array)$ids as $x) {
            $n = compras_comp_n_int($x);
            if ($n) $idsOk[] = $n;
        }

        return array_values(array_unique($idsOk));
    }
}

if (!function_exists('compras_comp_detect_real_mime')) {
    function compras_comp_detect_real_mime(string $tmpPath, string $fallback = ''): string
    {
        $mime = trim((string)$fallback);
        if (function_exists('finfo_open')) {
            $fi = @finfo_open(FILEINFO_MIME_TYPE);
            if ($fi) {
                $det = @finfo_file($fi, $tmpPath);
                @finfo_close($fi);
                if (is_string($det) && trim($det) !== '') {
                    $mime = trim($det);
                }
            }
        }
        return $mime !== '' ? $mime : 'application/octet-stream';
    }
}

if (!function_exists('compras_comp_safe_extension_from_name')) {
    function compras_comp_safe_extension_from_name(string $filename): string
    {
        $ext = strtolower((string)pathinfo($filename, PATHINFO_EXTENSION));
        $ext = preg_replace('/[^a-z0-9]+/', '', $ext);
        return $ext;
    }
}

if (!function_exists('compras_comp_ext_from_mime')) {
    function compras_comp_ext_from_mime(string $mime): string
    {
        $map = [
            'application/pdf' => 'pdf',
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'text/plain' => 'txt',
            'text/csv' => 'csv',
            'application/zip' => 'zip',
            'application/x-zip-compressed' => 'zip',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
            'application/vnd.ms-excel' => 'xls',
        ];
        $mime = strtolower(trim($mime));
        return $map[$mime] ?? 'bin';
    }
}

/* =========================================================
   MOVIMIENTOS_COMPROBANTES SOLO COMPRAS
========================================================= */
if (!function_exists('compras_comp_ensure_movimiento_comprobante_table_exists')) {
    function compras_comp_ensure_movimiento_comprobante_table_exists(PDO $pdo): void
    {
        $st = $pdo->query("SHOW TABLES LIKE 'movimientos_comprobantes'");
        $exists = $st ? (bool)$st->fetchColumn() : false;

        if (!$exists) {
            throw new Exception(
                "La tabla movimientos_comprobantes no existe. Creala manualmente antes de usar comprobantes de compras."
            );
        }
    }
}

if (!function_exists('compras_comp_get_movimiento_comprobante_row')) {
    function compras_comp_get_movimiento_comprobante_row(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipoRelacion): ?array
    {
        $st = $pdo->prepare("
            SELECT *
            FROM movimientos_comprobantes
            WHERE id_movimiento = :idMov
              AND id_comprobante = :idComp
              AND tipo_relacion = :tipo
            LIMIT 1
        ");
        $st->execute([
            ':idMov' => $idMovimiento,
            ':idComp' => $idComprobante,
            ':tipo' => $tipoRelacion,
        ]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('compras_comp_get_movimiento_factura_principal')) {
    function compras_comp_get_movimiento_factura_principal(PDO $pdo, int $idMovimiento): ?array
    {
        $st = $pdo->prepare("
            SELECT *
            FROM movimientos_comprobantes
            WHERE id_movimiento = :idMov
              AND tipo_relacion = 'FACTURA'
              AND principal = 1
            ORDER BY id_movimiento_comprobante DESC
            LIMIT 1
        ");
        $st->execute([':idMov' => $idMovimiento]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('compras_comp_link_comprobante_to_movimiento_docs')) {
    function compras_comp_link_comprobante_to_movimiento_docs(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipo, bool $force): array
    {
        if ($idMovimiento <= 0) throw new Exception('id_movimiento inválido.');
        if ($idComprobante <= 0) throw new Exception('id_comprobante inválido.');

        if (!compras_comp_movimiento_exists($pdo, $idMovimiento)) {
            throw new Exception('El movimiento no existe.');
        }

        compras_comp_ensure_movimiento_comprobante_table_exists($pdo);

        $tipoRelacion = compras_comp_tipo_relacion_from_tipo($tipo);
        $principal = ($tipoRelacion === 'FACTURA') ? 1 : 0;

        $existingSame = compras_comp_get_movimiento_comprobante_row($pdo, $idMovimiento, $idComprobante, $tipoRelacion);
        if ($existingSame) {
            if ($principal === 1 && (int)$existingSame['principal'] !== 1) {
                $pdo->prepare("
                    UPDATE movimientos_comprobantes
                    SET principal = 1
                    WHERE id_movimiento_comprobante = :id
                    LIMIT 1
                ")->execute([':id' => (int)$existingSame['id_movimiento_comprobante']]);
            }

            return [
                'modo'                    => 'movimiento_documental',
                'tipo_documento'          => $tipo,
                'tipo_relacion'           => $tipoRelacion,
                'id_movimiento'           => $idMovimiento,
                'id_comprobante'          => $idComprobante,
                'vinculo'                 => 'movimientos_comprobantes',
                'reemplazo'               => false,
                'id_comprobante_anterior' => null,
                'principal'               => $principal,
                'ya_existia'              => true,
            ];
        }

        $principalActual = null;

        if ($tipoRelacion === 'FACTURA') {
            $principalActual = compras_comp_get_movimiento_factura_principal($pdo, $idMovimiento);

            if ($principalActual && (int)$principalActual['id_comprobante'] !== $idComprobante) {
                if (!$force) {
                    throw new Exception(
                        'Ese movimiento ya tiene una FACTURA principal asociada (' .
                        (int)$principalActual['id_comprobante'] .
                        '). Usá force=true para reemplazar la principal.'
                    );
                }

                $pdo->prepare("
                    UPDATE movimientos_comprobantes
                    SET principal = 0
                    WHERE id_movimiento = :idMov
                      AND tipo_relacion = 'FACTURA'
                      AND principal = 1
                ")->execute([':idMov' => $idMovimiento]);
            }
        }

        $pdo->prepare("
            INSERT INTO movimientos_comprobantes
                (id_movimiento, id_comprobante, tipo_relacion, principal)
            VALUES
                (:idMov, :idComp, :tipo, :principal)
        ")->execute([
            ':idMov'     => $idMovimiento,
            ':idComp'    => $idComprobante,
            ':tipo'      => $tipoRelacion,
            ':principal' => $principal,
        ]);

        return [
            'modo'                    => 'movimiento_documental',
            'tipo_documento'          => $tipo,
            'tipo_relacion'           => $tipoRelacion,
            'id_movimiento'           => $idMovimiento,
            'id_comprobante'          => $idComprobante,
            'vinculo'                 => 'movimientos_comprobantes',
            'reemplazo'               => ($tipoRelacion === 'FACTURA' && !empty($principalActual)),
            'id_comprobante_anterior' => (!empty($principalActual) ? (int)$principalActual['id_comprobante'] : null),
            'principal'               => $principal,
            'ya_existia'              => false,
        ];
    }
}

if (!function_exists('compras_comp_vincular_comprobante_a_movimiento')) {
    function compras_comp_vincular_comprobante_a_movimiento(PDO $pdo, int $idMovimiento, int $idComprobante, bool $force): array
    {
        if ($idMovimiento <= 0) throw new Exception('id_movimiento inválido.');
        if ($idComprobante <= 0) throw new Exception('id_comprobante inválido.');

        if (!compras_comp_comprobante_exists($pdo, $idComprobante)) {
            throw new Exception('El id_comprobante no existe.');
        }

        $tipo = compras_comp_get_comprobante_tipo($pdo, $idComprobante);
        if ($tipo === '') $tipo = 'OTRO';

        return compras_comp_link_comprobante_to_movimiento_docs($pdo, $idMovimiento, $idComprobante, $tipo, $force);
    }
}

/* =========================================================
   REGISTRAR ARCHIVO
   COMPRAS: documental puro, sin fiscal ARCA
========================================================= */
if (!function_exists('compras_comp_registrar_archivo_comprobante')) {
    function compras_comp_registrar_archivo_comprobante(PDO $pdo, int $tenantId, string $tipo, array $file, array $meta): array
    {
        $err = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
        if ($err !== UPLOAD_ERR_OK) {
            throw new Exception('Error al subir archivo (UPLOAD_ERR=' . $err . ').');
        }

        $tmp = isset($file['tmp_name']) ? (string)$file['tmp_name'] : '';
        if ($tmp === '' || !is_file($tmp)) {
            throw new Exception('Archivo temporal inválido.');
        }

        $origName = isset($file['name']) ? (string)$file['name'] : 'comprobante.bin';
        $mimeBrowser = isset($file['type']) ? (string)$file['type'] : '';
        $mime = compras_comp_detect_real_mime($tmp, $mimeBrowser);
        $size = isset($file['size']) ? (int)$file['size'] : 0;

        $ext = compras_comp_safe_extension_from_name($origName);
        if ($ext === '') {
            $ext = compras_comp_ext_from_mime($mime);
        }
        if ($ext === '') $ext = 'bin';

        $sha = hash_file('sha256', $tmp);
        if (!$sha) {
            throw new Exception('No se pudo calcular hash del archivo.');
        }

        $tipo = strtoupper(trim($tipo !== '' ? $tipo : 'FACTURA'));
        $tipoFolder = compras_comp_tipo_to_folder($tipo);

        $uploadsBase = compras_comp_get_private_uploads_dir();
        compras_comp_safe_mkdir($uploadsBase);

        $tenantDir = $uploadsBase
            . '/tenants/t_' . (int)$tenantId
            . '/comprobantes/' . date('Y')
            . '/' . date('m')
            . '/' . $tipoFolder;

        compras_comp_safe_mkdir($tenantDir);

        $prefix = $tipoFolder;
        $idMovimientoMeta = compras_comp_n_int($meta['id_movimiento'] ?? null);
        if ($idMovimientoMeta) $prefix .= '__mov_' . $idMovimientoMeta;

        $finalName = $prefix . '__' . $sha . '.' . $ext;
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

        $relPath = compras_comp_normalize_rel_from_private_uploads($absPath, $uploadsBase);

        $pdo->prepare("
            INSERT INTO comprobantes_archivos
                (tipo, archivo_url, archivo_path, archivo_mime, archivo_size, sha256, emitido_en_arca)
            VALUES
                (:tipo, :url, :path, :mime, :size, :sha, 0)
        ")->execute([
            ':tipo' => $tipo,
            ':url'  => '',
            ':path' => $relPath,
            ':mime' => ($mime !== '' ? $mime : 'application/octet-stream'),
            ':size' => max(0, $size),
            ':sha'  => $sha,
        ]);

        $idComp = (int)$pdo->lastInsertId();
        if ($idComp <= 0) {
            @unlink($absPath);
            throw new Exception('No se pudo obtener id_comprobante.');
        }

        $realUrl = compras_comp_build_download_url($idComp);

        $pdo->prepare("
            UPDATE comprobantes_archivos
            SET archivo_url = :u
            WHERE id_comprobante = :id
            LIMIT 1
        ")->execute([
            ':u'  => $realUrl,
            ':id' => $idComp,
        ]);

        return [
            'id_comprobante'     => $idComp,
            'archivo_url'        => $realUrl,
            'archivo_path'       => $relPath,
            'sha256'             => $sha,
            'filename'           => $finalName,
            'mime'               => ($mime !== '' ? $mime : 'application/octet-stream'),
            'size'               => max(0, $size),
            'uploadsBase'        => $uploadsBase,
            'tenantDir'          => $tenantDir,
            'tipo'               => $tipo,
            'tipoFolder'         => $tipoFolder,
            'emitido_en_arca'    => 0,
            'guardo_fiscal_arca' => false,
            'fiscal_arca_upsert' => false,
            'debug_fiscal_arca'  => [],
        ];
    }
}

/* =========================================================
   TENANT
========================================================= */
$tenantId = compras_comp_resolve_tenant_id_or_fail();

/* =========================================================
   ACCIÓN: SUBIR SIMPLE
========================================================= */
if ($action === 'compras_comprobantes_subir') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        compras_comp_fail('Método inválido. Usá POST.', 405);
    }

    $file = null;
    if (isset($_FILES['archivo'])) $file = $_FILES['archivo'];
    if (!$file && isset($_FILES['pdf'])) $file = $_FILES['pdf'];

    if (!$file) {
        compras_comp_fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA';
    $meta = [];

    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    }

    try {
        $pdo->beginTransaction();

        $reg = compras_comp_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);

        $pdo->commit();

        compras_comp_ok([
            'id_comprobante'     => $reg['id_comprobante'],
            'archivo_url'        => $reg['archivo_url'],
            'archivo_path'       => $reg['archivo_path'],
            'sha256'             => $reg['sha256'],
            'filename'           => $reg['filename'],
            'tipo'               => $reg['tipo'],
            'archivo_mime'       => $reg['mime'],
            'emitido_en_arca'    => 0,
            'guardo_fiscal_arca' => false,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        compras_comp_fail('No se pudo subir el comprobante de compra: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: SUBIR + VINCULAR 1 MOVIMIENTO DE COMPRA
========================================================= */
if ($action === 'compras_comprobantes_vincular_movimiento') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        compras_comp_fail('Método inválido. Usá POST.', 405);
    }

    $body = compras_comp_read_json_body();

    $idMovimiento = compras_comp_n_int($_POST['id_movimiento'] ?? null);
    if (!$idMovimiento) {
        $idMovimiento = compras_comp_n_int($body['id_movimiento'] ?? null);
    }

    if (!$idMovimiento) {
        compras_comp_fail('Falta id_movimiento válido.', 400);
    }

    $force = false;
    if (isset($_POST['force'])) {
        $force = !empty($_POST['force']);
    } else {
        $force = !empty($body['force']);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : ((string)($body['tipo'] ?? 'FACTURA'));
    $tipo = strtoupper(trim($tipo !== '' ? $tipo : 'FACTURA'));

    $meta = [];
    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    } elseif (!empty($body['meta']) && is_array($body['meta'])) {
        $meta = $body['meta'];
    }

    $file = null;
    if (isset($_FILES['pdf'])) $file = $_FILES['pdf'];
    if (!$file && isset($_FILES['archivo'])) $file = $_FILES['archivo'];

    if (!$file) {
        compras_comp_fail('Falta archivo adjunto (campo "pdf" o "archivo").', 400);
    }

    try {
        $pdo->beginTransaction();

        $meta['id_movimiento'] = $idMovimiento;

        $reg = compras_comp_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
        $idComprobante = (int)$reg['id_comprobante'];

        $vinc = compras_comp_vincular_comprobante_a_movimiento($pdo, $idMovimiento, $idComprobante, $force);

        $pdo->commit();

        compras_comp_ok([
            'mensaje'            => 'Archivo de compra subido, registrado y vinculado correctamente.',
            'id_comprobante'     => $idComprobante,
            'id_movimiento'      => $idMovimiento,
            'archivo_url'        => $reg['archivo_url'],
            'archivo_path'       => $reg['archivo_path'],
            'sha256'             => $reg['sha256'],
            'filename'           => $reg['filename'],
            'tipo'               => $reg['tipo'],
            'archivo_mime'       => $reg['mime'],
            'emitido_en_arca'    => 0,
            'guardo_fiscal_arca' => false,
            'vinculo'            => $vinc['vinculo'],
            'reemplazo'          => $vinc['reemplazo'],
            'tipo_relacion'      => $vinc['tipo_relacion'],
            'principal'          => $vinc['principal'],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        compras_comp_fail('No se pudo registrar y vincular el comprobante de compra: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: SUBIR 1 ARCHIVO Y VINCULARLO A MUCHAS COMPRAS
========================================================= */
if ($action === 'compras_comprobantes_vincular_movimientos_lote_upload') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        compras_comp_fail('Método inválido. Usá POST.', 405);
    }

    $ids = compras_comp_parse_ids_movimiento_from_request($_POST);

    if (!$ids) {
        $body = compras_comp_read_json_body();
        $ids = compras_comp_parse_ids_movimiento_from_request($body);
    }

    if (!$ids) {
        compras_comp_fail('Faltan ids_movimiento válidos.', 400);
    }

    $force = false;
    if (isset($_POST['force'])) {
        $force = !empty($_POST['force']);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA';

    $meta = [];
    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    }

    $file = null;
    if (isset($_FILES['archivo'])) $file = $_FILES['archivo'];
    if (!$file && isset($_FILES['pdf'])) $file = $_FILES['pdf'];

    if (!$file) {
        compras_comp_fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);
    }

    try {
        $pdo->beginTransaction();

        $meta['id_movimiento'] = (int)$ids[0];

        $reg = compras_comp_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
        $idComprobante = (int)$reg['id_comprobante'];

        $asociados = [];
        foreach ($ids as $idMov) {
            $asociados[] = compras_comp_vincular_comprobante_a_movimiento($pdo, (int)$idMov, $idComprobante, $force);
        }

        $pdo->commit();

        compras_comp_ok([
            'mensaje'            => 'Archivo de compra subido y vinculado al lote correctamente.',
            'id_comprobante'     => $idComprobante,
            'ids_movimiento'     => $ids,
            'archivo_url'        => $reg['archivo_url'],
            'archivo_path'       => $reg['archivo_path'],
            'sha256'             => $reg['sha256'],
            'filename'           => $reg['filename'],
            'tipo'               => $reg['tipo'],
            'archivo_mime'       => $reg['mime'],
            'emitido_en_arca'    => 0,
            'guardo_fiscal_arca' => false,
            'asociados'          => $asociados,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        compras_comp_fail('No se pudo subir y vincular el archivo al lote de compras: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: ASOCIAR 1x1 JSON
========================================================= */
if (
    $action === 'compras_comprobantes_asociar_movimiento' ||
    $action === 'compras_comprobantes_vincular_movimiento_json'
) {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        compras_comp_fail('Método inválido. Usá POST.', 405);
    }

    $body = compras_comp_read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : []);

    $idComp = compras_comp_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $idMov  = compras_comp_n_int($src['id_movimiento'] ?? null);
    $force  = !empty($src['force']);

    if (!$idComp) compras_comp_fail('Falta id_comprobante.', 400);
    if (!$idMov)  compras_comp_fail('Falta id_movimiento.', 400);

    if (!compras_comp_comprobante_exists($pdo, $idComp)) {
        compras_comp_fail('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $vinc = compras_comp_vincular_comprobante_a_movimiento($pdo, $idMov, $idComp, $force);

        $pdo->commit();

        compras_comp_ok($vinc);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        compras_comp_fail('No se pudo asociar comprobante de compra: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: VINCULAR LOTE JSON
========================================================= */
if (
    $action === 'compras_comprobantes_vincular_movimientos_lote' ||
    $action === 'compras_comprobantes_asociar_movimientos' ||
    $action === 'compras_comprobantes_vincular_movimientos'
) {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        compras_comp_fail('Método inválido. Usá POST.', 405);
    }

    $body = compras_comp_read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : []);

    $idComp = compras_comp_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $force  = !empty($src['force']);
    $idsOk  = compras_comp_parse_ids_movimiento_from_request($src);

    if (!$idComp) compras_comp_fail('Falta id_comprobante.', 400);
    if (!$idsOk) compras_comp_fail('Faltan ids_movimiento.', 400);

    if (!compras_comp_comprobante_exists($pdo, $idComp)) {
        compras_comp_fail('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $result = [
            'asociados' => [],
            'errores'   => [],
        ];

        foreach ($idsOk as $idMov) {
            try {
                $vinc = compras_comp_vincular_comprobante_a_movimiento($pdo, $idMov, $idComp, $force);
                $result['asociados'][] = $vinc;
            } catch (Throwable $e) {
                $result['errores'][] = [
                    'id_movimiento' => $idMov,
                    'mensaje'       => $e->getMessage(),
                ];
            }
        }

        $pdo->commit();

        compras_comp_ok([
            'id_comprobante' => $idComp,
            'force'          => $force,
            'result'         => $result,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        compras_comp_fail('No se pudo vincular el comprobante al lote de compras: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: DESCARGAR
========================================================= */
if ($action === 'compras_comprobantes_descargar') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        compras_comp_fail('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
        $st = $pdo->prepare("
            SELECT id_comprobante, archivo_path, archivo_url, archivo_mime
            FROM comprobantes_archivos
            WHERE id_comprobante = :id
            LIMIT 1
        ");
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            compras_comp_fail('Comprobante no encontrado.', 404);
        }

        $uploadsBase = compras_comp_get_private_uploads_dir();

        $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
        if ($rel === '') {
            $rel = isset($row['archivo_url']) ? (string)$row['archivo_url'] : '';
        }

        $rel = compras_comp_normalize_db_rel_path($rel);

        if ($rel === '') {
            compras_comp_fail('Comprobante sin ruta.', 500);
        }

        if (strpos($rel, 'uploads/') === 0) {
            $relWithoutUploads = substr($rel, strlen('uploads/'));
        } else {
            $relWithoutUploads = ltrim($rel, '/');
        }

        $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

        if (!is_file($abs)) {
            compras_comp_fail('Archivo no existe en disco.', 404, [
                'abs'         => $abs,
                'rel'         => $rel,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        if (!compras_comp_is_inside($abs, $uploadsBase)) {
            compras_comp_fail('Ruta inválida.', 403, [
                'abs'         => $abs,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        $mime = isset($row['archivo_mime']) ? (string)$row['archivo_mime'] : 'application/octet-stream';
        if ($mime === '') $mime = 'application/octet-stream';

        $filesize = (int)filesize($abs);
        $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === '') $ext = 'bin';

        $filename = 'compra_comprobante_' . $id . '.' . $ext;

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
        compras_comp_fail('Error al descargar comprobante de compra: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: INFO
========================================================= */
if ($action === 'compras_comprobantes_info') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        compras_comp_fail('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
        $st = $pdo->prepare("SELECT * FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            compras_comp_fail('Comprobante no encontrado.', 404);
        }

        compras_comp_ok([
            'data'        => $row,
            'fiscal_arca' => null,
        ]);
    } catch (Throwable $e) {
        compras_comp_fail('Error: ' . $e->getMessage(), 500);
    }
}

compras_comp_fail('Acción de comprobantes de compras no válida: ' . $action, 400);