<?php
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
if (!function_exists('opcomp_json')) {
    function opcomp_json(array $arr, int $httpCode = 200): void
    {
        if (!headers_sent()) {
            http_response_code($httpCode);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('opcomp_ok')) {
    function opcomp_ok(array $arr = []): void
    {
        opcomp_json(array_merge(['exito' => true], $arr), 200);
    }
}

if (!function_exists('opcomp_fail')) {
    function opcomp_fail(string $msg, int $httpCode = 400, array $extra = []): void
    {
        opcomp_json(array_merge(['exito' => false, 'mensaje' => $msg], $extra), $httpCode);
    }
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
    opcomp_fail('PDO tenant no disponible.', 500);
}

/* =========================================================
   HELPERS
========================================================= */
if (!function_exists('opcomp_read_json_body')) {
    function opcomp_read_json_body(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $j = json_decode($raw, true);
        return is_array($j) ? $j : [];
    }
}

if (!function_exists('opcomp_n_int')) {
    function opcomp_n_int($v): ?int
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

if (!function_exists('opcomp_n_int_zero_ok')) {
    function opcomp_n_int_zero_ok($v): ?int
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) return null;
        return (int)$v;
    }
}

if (!function_exists('opcomp_safe_str')) {
    function opcomp_safe_str($v): string
    {
        return trim((string)$v);
    }
}

if (!function_exists('opcomp_is_https_request')) {
    function opcomp_is_https_request(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
        if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
        $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
        return strtolower($xfp) === 'https';
    }
}

if (!function_exists('opcomp_dirname_n')) {
    function opcomp_dirname_n(string $path, int $levels): string
    {
        $out = $path;
        for ($i = 0; $i < $levels; $i++) {
            $out = dirname($out);
        }
        return $out;
    }
}

if (!function_exists('opcomp_get_public_html_dir')) {
    function opcomp_get_public_html_dir(): string
    {
        $apiDir = realpath(opcomp_dirname_n(__DIR__, 3));
        if ($apiDir && is_dir($apiDir)) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir && is_dir($projectDir)) {
                $publicHtml = realpath($projectDir . '/..');
                if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
                return $projectDir;
            }
            return dirname($apiDir);
        }

        return opcomp_dirname_n(__DIR__, 5);
    }
}

if (!function_exists('opcomp_get_balto_private_dir')) {
    function opcomp_get_balto_private_dir(): string
    {
        $publicHtml = opcomp_get_public_html_dir();
        $homeDir = realpath($publicHtml . '/..');

        if ($homeDir && is_dir($homeDir . '/balto_private')) {
            $cand = realpath($homeDir . '/balto_private');
            if ($cand && is_dir($cand)) return $cand;
        }

        $apiDir = realpath(opcomp_dirname_n(__DIR__, 3));
        if ($apiDir) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir) {
                $cand1 = realpath($projectDir . '/../balto_private');
                if ($cand1 && is_dir($cand1)) return $cand1;

                $cand2 = realpath($projectDir . '/../../balto_private');
                if ($cand2 && is_dir($cand2)) return $cand2;
            }
        }

        opcomp_fail('No se encontró la carpeta balto_private.', 500, [
            'public_html' => $publicHtml,
        ]);
    }
}

if (!function_exists('opcomp_get_private_uploads_dir')) {
    function opcomp_get_private_uploads_dir(): string
    {
        $baltoPrivate = opcomp_get_balto_private_dir();
        $uploads = $baltoPrivate . '/uploads';

        if (!is_dir($uploads)) {
            opcomp_fail('No existe la carpeta balto_private/uploads.', 500, [
                'balto_private' => $baltoPrivate,
                'uploads' => $uploads,
            ]);
        }

        return $uploads;
    }
}

if (!function_exists('opcomp_safe_mkdir')) {
    function opcomp_safe_mkdir(string $path): void
    {
        if (is_dir($path)) {
            if (!is_writable($path)) {
                opcomp_fail('Carpeta existe pero no es writable.', 500, ['path' => $path]);
            }
            return;
        }

        if (!@mkdir($path, 0775, true) && !is_dir($path)) {
            opcomp_fail('No se pudo crear carpeta.', 500, ['path' => $path]);
        }

        if (!is_writable($path)) {
            opcomp_fail('Carpeta creada pero no es writable.', 500, ['path' => $path]);
        }
    }
}

if (!function_exists('opcomp_normalize_rel_from_private_uploads')) {
    function opcomp_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
    {
        $abs = str_replace('\\', '/', $abs);
        $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

        if (strpos($abs, $uploadsBase . '/') === 0) {
            return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
        }

        return ltrim($abs, '/');
    }
}

if (!function_exists('opcomp_normalize_db_rel_path')) {
    function opcomp_normalize_db_rel_path(string $path): string
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

if (!function_exists('opcomp_is_inside')) {
    function opcomp_is_inside(string $path, string $baseDir): bool
    {
        $pathReal = realpath($path);
        $baseReal = realpath($baseDir);
        if (!$pathReal || !$baseReal) return false;

        $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
        $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

        return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
    }
}

if (!function_exists('opcomp_api_php_abs_url')) {
    function opcomp_api_php_abs_url(): string
    {
        $scheme = opcomp_is_https_request() ? 'https' : 'http';
        $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';
        $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '/api.php';

        return $scheme . '://' . $host . $script;
    }
}

if (!function_exists('opcomp_build_download_url')) {
    function opcomp_build_download_url(int $idComp): string
    {
        return opcomp_api_php_abs_url() . '?action=ordenes_pago_comprobante_descargar&id_comprobante=' . (int)$idComp;
    }
}

if (!function_exists('opcomp_has_column')) {
    function opcomp_has_column(PDO $pdo, string $table, string $column): bool
    {
        try {
            $st = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE :c");
            $st->execute([':c' => $column]);
            return (bool)$st->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {
            return false;
        }
    }
}

if (!function_exists('opcomp_resolve_tenant_id_or_fail')) {
    function opcomp_resolve_tenant_id_or_fail(): int
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

        opcomp_fail(
            'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php o api.php con sesión válida.',
            401
        );
    }
}

if (!function_exists('opcomp_movimiento_exists')) {
    function opcomp_movimiento_exists(PDO $pdo, int $idMovimiento): bool
    {
        $st = $pdo->prepare("SELECT id_movimiento FROM movimientos WHERE id_movimiento = :id LIMIT 1");
        $st->execute([':id' => $idMovimiento]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('opcomp_comprobante_exists')) {
    function opcomp_comprobante_exists(PDO $pdo, int $idComprobante): bool
    {
        $st = $pdo->prepare("SELECT id_comprobante FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute([':id' => $idComprobante]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('opcomp_get_comprobante_row')) {
    function opcomp_get_comprobante_row(PDO $pdo, int $idComprobante): ?array
    {
        $st = $pdo->prepare("
            SELECT *
            FROM comprobantes_archivos
            WHERE id_comprobante = :id
            LIMIT 1
        ");
        $st->execute([':id' => $idComprobante]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('opcomp_is_order_payment_type')) {
    function opcomp_is_order_payment_type(string $tipo): bool
    {
        $t = strtoupper(trim($tipo));
        return in_array($t, ['ORDEN_PAGO', 'ORDEN DE PAGO'], true);
    }
}

if (!function_exists('opcomp_parse_ids_movimiento_from_request')) {
    function opcomp_parse_ids_movimiento_from_request(array $src): array
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
                if (is_array($tmp)) {
                    $ids = $tmp;
                } else {
                    $ids = preg_split('/[\s,;]+/', $raw) ?: [];
                }
            }
        } elseif (isset($src['ids_movimientos']) && is_string($src['ids_movimientos'])) {
            $raw = trim((string)$src['ids_movimientos']);
            if ($raw !== '') {
                $tmp = json_decode($raw, true);
                if (is_array($tmp)) {
                    $ids = $tmp;
                } else {
                    $ids = preg_split('/[\s,;]+/', $raw) ?: [];
                }
            }
        }

        $idsOk = [];
        foreach ((array)$ids as $x) {
            $n = opcomp_n_int($x);
            if ($n) $idsOk[] = $n;
        }

        return array_values(array_unique($idsOk));
    }
}

if (!function_exists('opcomp_detect_real_mime')) {
    function opcomp_detect_real_mime(string $tmpPath, string $fallback = ''): string
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

if (!function_exists('opcomp_safe_extension_from_name')) {
    function opcomp_safe_extension_from_name(string $filename): string
    {
        $ext = strtolower((string)pathinfo($filename, PATHINFO_EXTENSION));
        $ext = preg_replace('/[^a-z0-9]+/', '', $ext);
        return $ext;
    }
}

if (!function_exists('opcomp_ext_from_mime')) {
    function opcomp_ext_from_mime(string $mime): string
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
        ];
        $mime = strtolower(trim($mime));
        return $map[$mime] ?? 'bin';
    }
}

if (!function_exists('opcomp_cleanup_file')) {
    function opcomp_cleanup_file(?string $absPath): void
    {
        if ($absPath && is_file($absPath)) {
            @unlink($absPath);
        }
    }
}

if (!function_exists('opcomp_register_orden_pago_file')) {
    function opcomp_register_orden_pago_file(PDO $pdo, int $tenantId, array $file): array
    {
        $err = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
        if ($err !== UPLOAD_ERR_OK) {
            throw new Exception('Error al subir archivo (UPLOAD_ERR=' . $err . ').');
        }

        $tmp = isset($file['tmp_name']) ? (string)$file['tmp_name'] : '';
        if ($tmp === '' || !is_file($tmp)) {
            throw new Exception('Archivo temporal inválido.');
        }

        $origName = isset($file['name']) ? (string)$file['name'] : 'orden_pago.pdf';
        $mimeBrowser = isset($file['type']) ? (string)$file['type'] : '';
        $mime = opcomp_detect_real_mime($tmp, $mimeBrowser);
        $size = isset($file['size']) ? (int)$file['size'] : 0;

        $ext = opcomp_safe_extension_from_name($origName);
        if ($ext === '') {
            $ext = opcomp_ext_from_mime($mime);
        }
        if ($ext === '') $ext = 'bin';

        $sha = hash_file('sha256', $tmp);
        if (!$sha) {
            throw new Exception('No se pudo calcular hash del archivo.');
        }

        $uploadsBase = opcomp_get_private_uploads_dir();
        opcomp_safe_mkdir($uploadsBase);

        $tenantDir = $uploadsBase
            . '/tenants/t_' . (int)$tenantId
            . '/comprobantes/' . date('Y')
            . '/' . date('m')
            . '/ordenes_pago';

        opcomp_safe_mkdir($tenantDir);

        $finalName = 'orden_pago__' . $sha . '.' . $ext;
        $absPath = $tenantDir . '/' . $finalName;

        $moved = false;

        if (is_file($absPath) && (int)@filesize($absPath) > 0) {
            @unlink($tmp);
            $moved = true;
        } elseif (is_uploaded_file($tmp) && @move_uploaded_file($tmp, $absPath)) {
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

        $relPath = opcomp_normalize_rel_from_private_uploads($absPath, $uploadsBase);

        $pdo->prepare("
            INSERT INTO comprobantes_archivos
                (tipo, archivo_url, archivo_path, archivo_mime, archivo_size, sha256, emitido_en_arca)
            VALUES
                ('ORDEN_PAGO', '', :path, :mime, :size, :sha, 0)
        ")->execute([
            ':path' => $relPath,
            ':mime' => ($mime !== '' ? $mime : 'application/octet-stream'),
            ':size' => max(0, $size),
            ':sha'  => $sha,
        ]);

        $idComp = (int)$pdo->lastInsertId();
        if ($idComp <= 0) {
            opcomp_cleanup_file($absPath);
            throw new Exception('No se pudo obtener id_comprobante.');
        }

        $realUrl = opcomp_build_download_url($idComp);

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
            'id_comprobante' => $idComp,
            'archivo_url'    => $realUrl,
            'archivo_path'   => $relPath,
            'archivo_mime'   => ($mime !== '' ? $mime : 'application/octet-stream'),
            'archivo_size'   => max(0, $size),
            'sha256'         => $sha,
            'filename'       => $finalName,
            'abs_path'       => $absPath,
            'tipo'           => 'ORDEN_PAGO',
        ];
    }
}

if (!function_exists('opcomp_get_locked_latest_cobro_by_movimiento')) {
    function opcomp_get_locked_latest_cobro_by_movimiento(PDO $pdo, int $idMovimiento): ?array
    {
        $st = $pdo->prepare("
            SELECT id_cobro, id_movimiento, id_comprobante, fecha_cobro, monto, created_at
            FROM cobros
            WHERE id_movimiento = :idMov
            ORDER BY id_cobro DESC
            LIMIT 1
            FOR UPDATE
        ");
        $st->execute([':idMov' => $idMovimiento]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('opcomp_collect_locked_cobros')) {
    function opcomp_collect_locked_cobros(PDO $pdo, array $idsMovimiento): array
    {
        $locked = [];
 
        foreach ($idsMovimiento as $idMov) {
            $idMov = (int)$idMov;
 
            if ($idMov <= 0) {
                throw new Exception('id_movimiento inválido.');
            }
 
            if (!opcomp_movimiento_exists($pdo, $idMov)) {
                throw new Exception('El movimiento #' . $idMov . ' no existe.');
            }
 
            $cobro = opcomp_get_locked_latest_cobro_by_movimiento($pdo, $idMov);
            if (!$cobro) {
                throw new Exception(
                    'El movimiento #' . $idMov .
                    ' todavía no tiene cobros para asociar el comprobante.'
                );
            }
 
            // FIX: si el cobro tiene un id_comprobante que NO es de tipo
            // ORDEN_PAGO (p.ej. el comprobante del cheque en cartera),
            // lo ignoramos y tratamos el cobro como "sin comprobante previo".
            $prevComp = (int)($cobro['id_comprobante'] ?? 0);
            if ($prevComp > 0) {
                $compRow = opcomp_get_comprobante_row($pdo, $prevComp);
                if (!$compRow || !opcomp_is_order_payment_type((string)($compRow['tipo'] ?? ''))) {
                    // El comprobante existente es del cheque u otro tipo: ignorarlo.
                    $cobro['id_comprobante'] = null;
                }
            }
 
            $locked[] = $cobro;
        }
 
        return $locked;
    }
}

if (!function_exists('opcomp_attach_comprobante_to_locked_cobros')) {
    function opcomp_attach_comprobante_to_locked_cobros(PDO $pdo, int $idComprobante, array $lockedCobros, bool $force = false): array
    {
        if ($idComprobante <= 0) {
            throw new Exception('id_comprobante inválido.');
        }
 
        $asociados = [];
        $idsCobro = [];
 
        foreach ($lockedCobros as $cobro) {
            $idCobro  = (int)($cobro['id_cobro']       ?? 0);
            $idMov    = (int)($cobro['id_movimiento']   ?? 0);
            $prevComp = (int)($cobro['id_comprobante']  ?? 0); // ya saneado en collect
 
            if ($idCobro <= 0 || $idMov <= 0) {
                throw new Exception('Cobro bloqueado inválido.');
            }
 
            if ($prevComp > 0 && $prevComp !== $idComprobante && !$force) {
                throw new Exception(
                    'El cobro #' . $idCobro . ' del movimiento #' . $idMov .
                    ' ya tiene otro comprobante de orden de pago asociado (' . $prevComp . ').'
                );
            }
 
            $yaExistia = ($prevComp === $idComprobante);
            $reemplazo = ($prevComp > 0 && $prevComp !== $idComprobante);
 
            if (!$yaExistia) {
                $pdo->prepare("
                    UPDATE cobros
                    SET id_comprobante = :idComp
                    WHERE id_cobro = :idCobro
                    LIMIT 1
                ")->execute([
                    ':idComp'  => $idComprobante,
                    ':idCobro' => $idCobro,
                ]);
            }
 
            $idsCobro[] = $idCobro;
            $asociados[] = [
                'id_movimiento'           => $idMov,
                'id_cobro'                => $idCobro,
                'id_comprobante'          => $idComprobante,
                'id_comprobante_anterior' => ($prevComp > 0 ? $prevComp : null),
                'ya_existia'              => $yaExistia,
                'reemplazo'               => $reemplazo,
                'vinculo'                 => 'cobros.id_comprobante',
                'tipo_relacion'           => 'ORDEN_PAGO',
            ];
        }
 
        return [
            'asociados' => $asociados,
            'ids_cobro' => array_values(array_unique($idsCobro)),
        ];
    }
}
 
if (!function_exists('opcomp_set_primary_cobro_on_comprobante')) {
    function opcomp_set_primary_cobro_on_comprobante(PDO $pdo, int $idComprobante, ?int $idCobro): void
    {
        if ($idComprobante <= 0 || !$idCobro || $idCobro <= 0) return;
        if (!opcomp_has_column($pdo, 'comprobantes_archivos', 'id_cobro')) return;

        $pdo->prepare("
            UPDATE comprobantes_archivos
            SET id_cobro = :idCobro
            WHERE id_comprobante = :idComp
            LIMIT 1
        ")->execute([
            ':idCobro' => $idCobro,
            ':idComp'  => $idComprobante,
        ]);
    }
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

$tenantId = opcomp_resolve_tenant_id_or_fail();

/* =========================================================
   SUBIR + REGISTRAR + VINCULAR LOTE
========================================================= */
if ($action === 'ordenes_pago_comprobante_subir_y_vincular') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        opcomp_fail('Método inválido. Usá POST.', 405);
    }

    $body = opcomp_read_json_body();

    $ids = opcomp_parse_ids_movimiento_from_request($_POST);
    if (!$ids) {
        $ids = opcomp_parse_ids_movimiento_from_request($body);
    }

    if (!$ids) {
        opcomp_fail('Faltan ids_movimiento válidos.', 400);
    }

    $force = false;
    if (isset($_POST['force'])) {
        $force = !empty($_POST['force']);
    } elseif (isset($body['force'])) {
        $force = !empty($body['force']);
    }

    $file = null;
    if (isset($_FILES['archivo'])) $file = $_FILES['archivo'];
    if (!$file && isset($_FILES['pdf'])) $file = $_FILES['pdf'];

    if (!$file) {
        opcomp_fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);
    }

    $reg = null;

    try {
        $pdo->beginTransaction();

        $lockedCobros = opcomp_collect_locked_cobros($pdo, $ids);

        $distinctExisting = [];
        foreach ($lockedCobros as $cobro) {
            $prevComp = (int)($cobro['id_comprobante'] ?? 0);
            if ($prevComp > 0) {
                $distinctExisting[$prevComp] = true;
            }
        }

        $distinctIds = array_map('intval', array_keys($distinctExisting));

        if (count($distinctIds) > 1) {
            throw new Exception(
                'Los cobros seleccionados ya tienen comprobantes distintos asociados. ' .
                'Resolvé esa inconsistencia antes de subir una nueva orden de pago.'
            );
        }

        if (count($distinctIds) === 1) {
            $existingId = (int)$distinctIds[0];
            $comp = opcomp_get_comprobante_row($pdo, $existingId);

            if (!$comp) {
                throw new Exception('El comprobante ya asociado no existe en comprobantes_archivos.');
            }

            if (!opcomp_is_order_payment_type((string)($comp['tipo'] ?? ''))) {
                throw new Exception(
                    'El comprobante ya asociado (' . $existingId . ') no es de tipo ORDEN_PAGO.'
                );
            }

            $attach = opcomp_attach_comprobante_to_locked_cobros($pdo, $existingId, $lockedCobros, $force);
            opcomp_set_primary_cobro_on_comprobante($pdo, $existingId, $attach['ids_cobro'][0] ?? null);

            $pdo->commit();

            opcomp_ok([
                'mensaje'                => 'La orden de pago ya estaba guardada. Se reutilizó el comprobante existente.',
                'id_comprobante'         => $existingId,
                'archivo_url'            => (string)($comp['archivo_url'] ?? ''),
                'archivo_path'           => (string)($comp['archivo_path'] ?? ''),
                'archivo_mime'           => (string)($comp['archivo_mime'] ?? 'application/pdf'),
                'sha256'                 => (string)($comp['sha256'] ?? ''),
                'tipo'                   => (string)($comp['tipo'] ?? 'ORDEN_PAGO'),
                'reutilizo_existente'    => true,
                'asociados'              => $attach['asociados'],
                'ids_cobro'              => $attach['ids_cobro'],
                'ids_movimiento'         => $ids,
            ]);
        }

        $reg = opcomp_register_orden_pago_file($pdo, $tenantId, $file);
        $idComprobante = (int)$reg['id_comprobante'];

        $attach = opcomp_attach_comprobante_to_locked_cobros($pdo, $idComprobante, $lockedCobros, $force);
        opcomp_set_primary_cobro_on_comprobante($pdo, $idComprobante, $attach['ids_cobro'][0] ?? null);

        $pdo->commit();
        $reg['abs_path'] = null;

        opcomp_ok([
            'mensaje'             => 'Orden de pago guardada y vinculada correctamente.',
            'id_comprobante'      => $idComprobante,
            'archivo_url'         => $reg['archivo_url'],
            'archivo_path'        => $reg['archivo_path'],
            'archivo_mime'        => $reg['archivo_mime'],
            'archivo_size'        => $reg['archivo_size'],
            'sha256'              => $reg['sha256'],
            'filename'            => $reg['filename'],
            'tipo'                => $reg['tipo'],
            'reutilizo_existente' => false,
            'asociados'           => $attach['asociados'],
            'ids_cobro'           => $attach['ids_cobro'],
            'ids_movimiento'      => $ids,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if (is_array($reg) && !empty($reg['abs_path'])) {
            opcomp_cleanup_file((string)$reg['abs_path']);
        }
        opcomp_fail('No se pudo guardar la orden de pago: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ASOCIAR COMPROBANTE EXISTENTE A LOTE
========================================================= */
if ($action === 'ordenes_pago_comprobante_asociar_movimientos') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        opcomp_fail('Método inválido. Usá POST.', 405);
    }

    $body = opcomp_read_json_body();
    $src = !empty($body) ? $body : (isset($_POST) ? $_POST : []);

    $idComp = opcomp_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $ids = opcomp_parse_ids_movimiento_from_request($src);
    $force = !empty($src['force']);

    if (!$idComp) {
        opcomp_fail('Falta id_comprobante.', 400);
    }

    if (!$ids) {
        opcomp_fail('Faltan ids_movimiento.', 400);
    }

    $comp = opcomp_get_comprobante_row($pdo, $idComp);
    if (!$comp) {
        opcomp_fail('El id_comprobante no existe.', 404);
    }

    if (!opcomp_is_order_payment_type((string)($comp['tipo'] ?? ''))) {
        opcomp_fail('El comprobante indicado no es de tipo ORDEN_PAGO.', 400);
    }

    try {
        $pdo->beginTransaction();

        $lockedCobros = opcomp_collect_locked_cobros($pdo, $ids);
        $attach = opcomp_attach_comprobante_to_locked_cobros($pdo, $idComp, $lockedCobros, $force);
        opcomp_set_primary_cobro_on_comprobante($pdo, $idComp, $attach['ids_cobro'][0] ?? null);

        $pdo->commit();

        opcomp_ok([
            'mensaje'        => 'Comprobante de orden de pago asociado correctamente.',
            'id_comprobante' => $idComp,
            'ids_movimiento' => $ids,
            'ids_cobro'      => $attach['ids_cobro'],
            'asociados'      => $attach['asociados'],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        opcomp_fail('No se pudo asociar la orden de pago: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   DESCARGAR
========================================================= */
if ($action === 'ordenes_pago_comprobante_descargar') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        opcomp_fail('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
        $row = opcomp_get_comprobante_row($pdo, $id);
        if (!$row) {
            opcomp_fail('Comprobante no encontrado.', 404);
        }

        if (!opcomp_is_order_payment_type((string)($row['tipo'] ?? ''))) {
            opcomp_fail('El comprobante indicado no pertenece a Órdenes de Pago.', 400);
        }

        $uploadsBase = opcomp_get_private_uploads_dir();

        $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
        if ($rel === '') {
            opcomp_fail('Comprobante sin ruta de archivo.', 500);
        }

        $rel = opcomp_normalize_db_rel_path($rel);

        if (strpos($rel, 'uploads/') === 0) {
            $relWithoutUploads = substr($rel, strlen('uploads/'));
        } else {
            $relWithoutUploads = ltrim($rel, '/');
        }

        $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

        if (!is_file($abs)) {
            opcomp_fail('Archivo no existe en disco.', 404, [
                'abs'         => $abs,
                'rel'         => $rel,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        if (!opcomp_is_inside($abs, $uploadsBase)) {
            opcomp_fail('Ruta inválida.', 403, [
                'abs'         => $abs,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        $mime = isset($row['archivo_mime']) ? (string)$row['archivo_mime'] : 'application/octet-stream';
        if ($mime === '') $mime = 'application/octet-stream';

        $filesize = (int)filesize($abs);
        $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === '') $ext = 'bin';

        $filename = 'orden_pago_' . $id . '.' . $ext;

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
        opcomp_fail('Error al descargar: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   INFO
========================================================= */
if ($action === 'ordenes_pago_comprobante_info') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        opcomp_fail('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
        $row = opcomp_get_comprobante_row($pdo, $id);
        if (!$row) {
            opcomp_fail('Comprobante no encontrado.', 404);
        }

        if (!opcomp_is_order_payment_type((string)($row['tipo'] ?? ''))) {
            opcomp_fail('El comprobante indicado no pertenece a Órdenes de Pago.', 400);
        }

        $stCob = $pdo->prepare("
            SELECT id_cobro, id_movimiento, fecha_cobro, monto, id_comprobante
            FROM cobros
            WHERE id_comprobante = :idComp
            ORDER BY id_cobro DESC
        ");
        $stCob->execute([':idComp' => $id]);
        $cobros = $stCob->fetchAll(PDO::FETCH_ASSOC) ?: [];

        opcomp_ok([
            'data'   => $row,
            'cobros' => $cobros,
        ]);
    } catch (Throwable $e) {
        opcomp_fail('Error: ' . $e->getMessage(), 500);
    }
}

opcomp_fail('Acción de comprobantes de órdenes de pago no válida: ' . $action, 400);