<?php
// backend/modules/movimientos/comprobantes.php
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
if (!function_exists('comprobantes_json')) {
    function comprobantes_json(array $arr, int $httpCode = 200): void
    {
        if (!headers_sent()) {
            http_response_code($httpCode);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('comprobantes_ok')) {
    function comprobantes_ok(array $arr = []): void
    {
        comprobantes_json(array_merge(['exito' => true], $arr), 200);
    }
}

if (!function_exists('comprobantes_fail')) {
    function comprobantes_fail(string $msg, int $httpCode = 400, array $extra = []): void
    {
        comprobantes_json(array_merge(['exito' => false, 'mensaje' => $msg], $extra), $httpCode);
    }
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
    comprobantes_fail('PDO tenant no disponible.', 500);
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
   HELPERS GENERALES
========================================================= */
if (!function_exists('comprobantes_read_json_body')) {
    function comprobantes_read_json_body(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $j = json_decode($raw, true);
        return is_array($j) ? $j : [];
    }
}

if (!function_exists('comprobantes_n_int')) {
    function comprobantes_n_int($v): ?int
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

if (!function_exists('comprobantes_n_int_zero_ok')) {
    function comprobantes_n_int_zero_ok($v): ?int
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) return null;
        return (int)$v;
    }
}

if (!function_exists('comprobantes_safe_str')) {
    function comprobantes_safe_str($v): string
    {
        return trim((string)$v);
    }
}

if (!function_exists('comprobantes_is_https_request')) {
    function comprobantes_is_https_request(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
        if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
        $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
        return strtolower($xfp) === 'https';
    }
}

if (!function_exists('comprobantes_dirname_n')) {
    function comprobantes_dirname_n(string $path, int $levels): string
    {
        $out = $path;
        for ($i = 0; $i < $levels; $i++) {
            $out = dirname($out);
        }
        return $out;
    }
}

if (!function_exists('comprobantes_get_public_html_dir')) {
    function comprobantes_get_public_html_dir(): string
    {
        $apiDir = realpath(comprobantes_dirname_n(__DIR__, 3));
        if ($apiDir && is_dir($apiDir)) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir && is_dir($projectDir)) {
                $publicHtml = realpath($projectDir . '/..');
                if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
                return $projectDir;
            }
            return dirname($apiDir);
        }

        return comprobantes_dirname_n(__DIR__, 5);
    }
}

if (!function_exists('comprobantes_get_balto_private_dir')) {
    function comprobantes_get_balto_private_dir(): string
    {
        $publicHtml = comprobantes_get_public_html_dir();
        $homeDir = realpath($publicHtml . '/..');

        if ($homeDir && is_dir($homeDir . '/balto_private')) {
            $cand = realpath($homeDir . '/balto_private');
            if ($cand && is_dir($cand)) return $cand;
        }

        $apiDir = realpath(comprobantes_dirname_n(__DIR__, 3));
        if ($apiDir) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir) {
                $cand1 = realpath($projectDir . '/../balto_private');
                if ($cand1 && is_dir($cand1)) return $cand1;

                $cand2 = realpath($projectDir . '/../../balto_private');
                if ($cand2 && is_dir($cand2)) return $cand2;
            }
        }

        comprobantes_fail('No se encontró la carpeta balto_private.', 500, [
            'public_html' => $publicHtml,
        ]);
    }
}

if (!function_exists('comprobantes_get_private_uploads_dir')) {
    function comprobantes_get_private_uploads_dir(): string
    {
        $baltoPrivate = comprobantes_get_balto_private_dir();
        $uploads = $baltoPrivate . '/uploads';

        if (!is_dir($uploads)) {
            comprobantes_fail('No existe la carpeta balto_private/uploads.', 500, [
                'balto_private' => $baltoPrivate,
                'uploads' => $uploads,
            ]);
        }

        return $uploads;
    }
}

if (!function_exists('comprobantes_safe_mkdir')) {
    function comprobantes_safe_mkdir(string $path): void
    {
        if (is_dir($path)) {
            if (!is_writable($path)) {
                comprobantes_fail('Carpeta existe pero no es writable.', 500, ['path' => $path]);
            }
            return;
        }

        if (!@mkdir($path, 0775, true) && !is_dir($path)) {
            comprobantes_fail('No se pudo crear carpeta.', 500, ['path' => $path]);
        }

        if (!is_writable($path)) {
            comprobantes_fail('Carpeta creada pero no es writable.', 500, ['path' => $path]);
        }
    }
}

if (!function_exists('comprobantes_normalize_rel_from_private_uploads')) {
    function comprobantes_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
    {
        $abs = str_replace('\\', '/', $abs);
        $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

        if (strpos($abs, $uploadsBase . '/') === 0) {
            return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
        }

        return ltrim($abs, '/');
    }
}

if (!function_exists('comprobantes_normalize_db_rel_path')) {
    function comprobantes_normalize_db_rel_path(string $path): string
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

if (!function_exists('comprobantes_is_inside')) {
    function comprobantes_is_inside(string $path, string $baseDir): bool
    {
        $pathReal = realpath($path);
        $baseReal = realpath($baseDir);
        if (!$pathReal || !$baseReal) return false;

        $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
        $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

        return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
    }
}

if (!function_exists('comprobantes_api_php_abs_url')) {
    function comprobantes_api_php_abs_url(): string
    {
        $scheme = comprobantes_is_https_request() ? 'https' : 'http';
        $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';

        $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '';
        $pos = strpos($script, '/api/routes/api.php');

        if ($pos !== false) {
            $prefix = substr($script, 0, $pos);
            return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
        }

        return $scheme . '://' . $host . '/api/routes/api.php';
    }
}

if (!function_exists('comprobantes_build_download_url')) {
    function comprobantes_build_download_url(int $idComp): string
    {
        return comprobantes_api_php_abs_url() . '?action=comprobantes_descargar&id_comprobante=' . (int)$idComp;
    }
}

if (!function_exists('comprobantes_tipo_to_folder')) {
    function comprobantes_tipo_to_folder(string $tipo): string
    {
        $t = strtoupper(trim($tipo));
        if ($t === '') $t = 'RECIBO';

        $map = [
            'RECIBO'        => 'recibo',
            'ORDEN_PAGO'    => 'orden_pago',
            'ORDEN DE PAGO' => 'orden_pago',
            'FACTURA'       => 'factura',
            'NOTA_CREDITO'  => 'nota_credito',
            'NOTA_DEBITO'   => 'nota_debito',
        ];

        if (isset($map[$t])) return $map[$t];

        $t = strtolower($t);
        $t = str_replace([' ', '-', '.'], '_', $t);
        $t = preg_replace('/[^a-z0-9_]/', '', $t);
        $t = trim($t, '_');

        return $t !== '' ? $t : 'otros';
    }
}

if (!function_exists('comprobantes_resolve_tenant_id_or_fail')) {
    function comprobantes_resolve_tenant_id_or_fail(): int
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

        comprobantes_fail(
            'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php (con sesión válida).',
            401
        );
    }
}

if (!function_exists('comprobantes_movimiento_exists')) {
    function comprobantes_movimiento_exists(PDO $pdo, int $idMovimiento): bool
    {
        $st = $pdo->prepare("SELECT id_movimiento FROM movimientos WHERE id_movimiento = :id LIMIT 1");
        $st->execute([':id' => $idMovimiento]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('comprobantes_comprobante_exists')) {
    function comprobantes_comprobante_exists(PDO $pdo, int $idComprobante): bool
    {
        $st = $pdo->prepare("SELECT id_comprobante FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute([':id' => $idComprobante]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('comprobantes_get_comprobante_tipo')) {
    function comprobantes_get_comprobante_tipo(PDO $pdo, int $idComprobante): string
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

if (!function_exists('comprobantes_tipo_relacion_from_tipo')) {
    function comprobantes_tipo_relacion_from_tipo(string $tipo): string
    {
        $t = strtoupper(trim($tipo));
        if ($t === 'FACTURA') return 'FACTURA';
        if ($t === 'NOTA_CREDITO') return 'NOTA_CREDITO';
        if ($t === 'NOTA_DEBITO') return 'NOTA_DEBITO';
        return 'OTRO';
    }
}

if (!function_exists('comprobantes_tipo_es_documento_de_movimiento')) {
    function comprobantes_tipo_es_documento_de_movimiento(string $tipo): bool
    {
        $t = strtoupper(trim($tipo));
        return in_array($t, ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'OTRO'], true);
    }
}

if (!function_exists('comprobantes_tipo_es_documento_de_cobro')) {
    function comprobantes_tipo_es_documento_de_cobro(string $tipo): bool
    {
        $t = strtoupper(trim($tipo));
        return in_array($t, ['RECIBO', 'ORDEN_PAGO', 'ORDEN DE PAGO'], true);
    }
}

if (!function_exists('comprobantes_get_last_cobro_by_movimiento')) {
    function comprobantes_get_last_cobro_by_movimiento(PDO $pdo, int $idMovimiento): ?array
    {
        $st = $pdo->prepare("
            SELECT id_cobro, id_movimiento, id_comprobante, fecha_cobro, created_at
            FROM cobros
            WHERE id_movimiento = :idMov
            ORDER BY id_cobro DESC
            LIMIT 1
        ");
        $st->execute([':idMov' => $idMovimiento]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('comprobantes_parse_ids_movimiento_from_request')) {
    function comprobantes_parse_ids_movimiento_from_request(array $src): array
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
            $n = comprobantes_n_int($x);
            if ($n) $idsOk[] = $n;
        }

        return array_values(array_unique($idsOk));
    }
}

if (!function_exists('comprobantes_detect_real_mime')) {
    function comprobantes_detect_real_mime(string $tmpPath, string $fallback = ''): string
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

if (!function_exists('comprobantes_safe_extension_from_name')) {
    function comprobantes_safe_extension_from_name(string $filename): string
    {
        $ext = strtolower((string)pathinfo($filename, PATHINFO_EXTENSION));
        $ext = preg_replace('/[^a-z0-9]+/', '', $ext);
        return $ext;
    }
}

if (!function_exists('comprobantes_ext_from_mime')) {
    function comprobantes_ext_from_mime(string $mime): string
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
   HELPERS DB / COLUMNAS
========================================================= */
if (!function_exists('comprobantes_has_table')) {
    function comprobantes_has_table(PDO $pdo, string $table): bool
    {
        $sql = "
            SELECT COUNT(*) 
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = :table
            LIMIT 1
        ";

        $st = $pdo->prepare($sql);
        $ok = $st->execute([
            ':table' => $table,
        ]);

        if (!$ok) {
            $err = $st->errorInfo();
            throw new Exception('Falló comprobantes_has_table: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
        }

        return ((int)$st->fetchColumn()) > 0;
    }
}

if (!function_exists('comprobantes_has_column')) {
    function comprobantes_has_column(PDO $pdo, string $table, string $column): bool
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

/* =========================================================
   HELPERS ARCA / FISCAL
========================================================= */
if (!function_exists('comprobantes_tipo_puede_ser_fiscal')) {
    function comprobantes_tipo_puede_ser_fiscal(string $tipo): bool
    {
        $t = strtoupper(trim($tipo));
        return in_array($t, ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'], true);
    }
}

if (!function_exists('comprobantes_normalize_date_to_mysql')) {
    function comprobantes_normalize_date_to_mysql($value): ?string
    {
        $s = trim((string)$value);
        if ($s === '') return null;

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            return $s;
        }

        if (preg_match('/^\d{8}$/', $s)) {
            return substr($s, 0, 4) . '-' . substr($s, 4, 2) . '-' . substr($s, 6, 2);
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $s)) {
            return substr($s, 0, 10);
        }

        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $m)) {
            return $m[3] . '-' . $m[2] . '-' . $m[1];
        }

        return null;
    }
}

if (!function_exists('comprobantes_pick_nested')) {
    function comprobantes_pick_nested(array $src, array $paths, $default = null)
    {
        foreach ($paths as $path) {
            $cur = $src;
            $ok = true;

            foreach ($path as $segment) {
                if (is_array($cur) && array_key_exists($segment, $cur)) {
                    $cur = $cur[$segment];
                } else {
                    $ok = false;
                    break;
                }
            }

            if ($ok) return $cur;
        }

        return $default;
    }
}

if (!function_exists('comprobantes_extract_arca_payload')) {
    function comprobantes_extract_arca_payload(array $meta, string $tipo): array
    {
        $tipoNorm = strtoupper(trim($tipo));

        $jsonArca = null;

        if (array_key_exists('json_arca', $meta)) {
            $jsonArca = $meta['json_arca'];
        } elseif (array_key_exists('arca_response', $meta)) {
            $jsonArca = $meta['arca_response'];
        } elseif (array_key_exists('respuesta_arca', $meta)) {
            $jsonArca = $meta['respuesta_arca'];
        } elseif (array_key_exists('afip_response', $meta)) {
            $jsonArca = $meta['afip_response'];
        } elseif (array_key_exists('raw_min', $meta)) {
            $jsonArca = $meta['raw_min'];
        } elseif (array_key_exists('factura_emitida', $meta)) {
            $jsonArca = $meta['factura_emitida'];
        }

        if ($jsonArca === null && is_array($meta)) {
            $jsonArca = comprobantes_pick_nested($meta, [
                ['data', 'factura'],
                ['factura'],
                ['data'],
                ['wsfe'],
                ['arca'],
            ], null);
        }

        $cae = comprobantes_safe_str(
            $meta['cae']
            ?? comprobantes_pick_nested($meta, [
                ['factura', 'cae'],
                ['data', 'factura', 'cae'],
                ['data', 'cae']
            ], '')
        );

        $caeVto = comprobantes_normalize_date_to_mysql(
            $meta['cae_vto']
            ?? ($meta['caeVto'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'cae_vto'],
                ['data', 'factura', 'cae_vto'],
                ['data', 'cae_vto']
            ], ''))
        );

        $cbteNro = comprobantes_n_int_zero_ok(
            $meta['cbte_nro']
            ?? ($meta['cbteNro'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'cbte_nro'],
                ['data', 'factura', 'cbte_nro'],
                ['data', 'cbte_nro']
            ], null))
        );

        $cbteTipo = comprobantes_n_int_zero_ok(
            $meta['cbte_tipo']
            ?? ($meta['cbteTipo'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'cbte_tipo'],
                ['data', 'factura', 'cbte_tipo'],
                ['data', 'cbte_tipo']
            ], null))
        );

        $ptoVta = comprobantes_n_int_zero_ok(
            $meta['pto_vta']
            ?? ($meta['ptoVta'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'pto_vta'],
                ['data', 'factura', 'pto_vta'],
                ['data', 'pto_vta']
            ], null))
        );

        $resultado = comprobantes_safe_str(
            $meta['resultado']
            ?? comprobantes_pick_nested($meta, [
                ['factura', 'resultado'],
                ['data', 'factura', 'resultado'],
                ['data', 'resultado']
            ], '')
        );

        $docTipo = comprobantes_n_int_zero_ok(
            $meta['doc_tipo']
            ?? ($meta['docTipo'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'doc_tipo'],
                ['data', 'factura', 'doc_tipo'],
                ['data', 'doc_tipo']
            ], null))
        );

        $docNro = comprobantes_safe_str(
            $meta['doc_nro']
            ?? ($meta['docNro'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'doc_nro'],
                ['data', 'factura', 'doc_nro'],
                ['data', 'doc_nro']
            ], ''))
        );

        $fechaCbte = comprobantes_normalize_date_to_mysql(
            $meta['fecha_cbte']
            ?? ($meta['fechaCbte'] ?? comprobantes_pick_nested($meta, [
                ['factura', 'fecha_cbte'],
                ['data', 'factura', 'fecha_cbte'],
                ['data', 'fecha_cbte']
            ], ''))
        );

        // PRIORIDAD TOTAL: si el frontend manda emitido_en_arca, se respeta SIEMPRE
        $emitidoExplicitamente = null;

        if (array_key_exists('emitido_en_arca', $meta)) {
            $emitidoExplicitamente = !empty($meta['emitido_en_arca']) ? 1 : 0;
        } elseif (array_key_exists('emitida_en_arca', $meta)) {
            $emitidoExplicitamente = !empty($meta['emitida_en_arca']) ? 1 : 0;
        } elseif (array_key_exists('fue_emitida_en_arca', $meta)) {
            $emitidoExplicitamente = !empty($meta['fue_emitida_en_arca']) ? 1 : 0;
        }

        if ($emitidoExplicitamente !== null) {
            $emitidoEnArca = $emitidoExplicitamente;
        } else {
            $hayEvidenciaRealDeEmision =
                (comprobantes_tipo_puede_ser_fiscal($tipoNorm)) &&
                (
                    $cae !== '' ||
                    $caeVto !== null ||
                    ($cbteNro !== null && $cbteNro > 0) ||
                    $jsonArca !== null
                );

            $emitidoEnArca = $hayEvidenciaRealDeEmision ? 1 : 0;
        }

        $hayDatosFiscales =
            $cae !== '' ||
            $caeVto !== null ||
            ($cbteNro !== null && $cbteNro > 0) ||
            $cbteTipo !== null ||
            $ptoVta !== null ||
            $resultado !== '' ||
            $docTipo !== null ||
            $docNro !== '' ||
            $fechaCbte !== null ||
            $jsonArca !== null;

        return [
            'emitido_en_arca'    => $emitidoEnArca,
            'cae'                => ($cae !== '' ? $cae : null),
            'cae_vto'            => $caeVto,
            'cbte_nro'           => $cbteNro,
            'cbte_tipo'          => $cbteTipo,
            'pto_vta'            => $ptoVta,
            'resultado'          => ($resultado !== '' ? $resultado : null),
            'doc_tipo'           => $docTipo,
            'doc_nro'            => ($docNro !== '' ? $docNro : null),
            'fecha_cbte'         => $fechaCbte,
            'json_arca'          => $jsonArca,
            'hay_datos_fiscales' => $hayDatosFiscales,
        ];
    }
}

if (!function_exists('comprobantes_save_fiscal_arca')) {
    function comprobantes_save_fiscal_arca(PDO $pdo, int $idComprobante, string $tipo, array $meta): array
    {
        $result = [
            'emitido_en_arca'     => 0,
            'guardo_fiscal_arca'  => false,
            'fiscal_arca_upsert'  => false,
            'debug'               => [],
        ];

        if ($idComprobante <= 0) {
            $result['debug'][] = 'id_comprobante inválido';
            return $result;
        }

        $payload = comprobantes_extract_arca_payload($meta, $tipo);
        $result['emitido_en_arca'] = (int)($payload['emitido_en_arca'] ?? 0);

        // Siempre actualizar comprobantes_archivos
        $stUpComp = $pdo->prepare("
            UPDATE comprobantes_archivos
            SET emitido_en_arca = :emitido
            WHERE id_comprobante = :id
            LIMIT 1
        ");

        $okUpComp = $stUpComp->execute([
            ':emitido' => (int)$payload['emitido_en_arca'],
            ':id'      => $idComprobante,
        ]);

        if (!$okUpComp) {
            $err = $stUpComp->errorInfo();
            throw new Exception('Falló UPDATE comprobantes_archivos.emitido_en_arca: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
        }

        if (!comprobantes_tipo_puede_ser_fiscal($tipo)) {
            $result['debug'][] = 'tipo no fiscal: ' . $tipo;
            return $result;
        }
        
        if ((int)$payload['emitido_en_arca'] !== 1) {
            $result['debug'][] = 'No fue emitido en ARCA: no se guarda en comprobantes_fiscales_arca';
            return $result;
        }

        if (!comprobantes_has_table($pdo, 'comprobantes_fiscales_arca')) {
            $dbName = 'desconocida';
            try {
                $dbName = (string)$pdo->query("SELECT DATABASE()")->fetchColumn();
            } catch (Throwable $e) {}
        
            throw new Exception(
                'La tabla comprobantes_fiscales_arca no existe en esta base tenant. DB actual: ' . $dbName
            );
        }

        $jsonPayloadCompleto = comprobantes_build_json_arca_payload(
            $meta,
            $payload,
            $tipo,
            $idComprobante
        );

        $jsonArcaStr = json_encode(
            $jsonPayloadCompleto,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );

        if ($jsonArcaStr === false) {
            throw new Exception('No se pudo serializar json_arca: ' . json_last_error_msg());
        }

        $st = $pdo->prepare("
            SELECT id_comprobante_fiscal
            FROM comprobantes_fiscales_arca
            WHERE id_comprobante = :id
            LIMIT 1
        ");
        $okSel = $st->execute([':id' => $idComprobante]);

        if (!$okSel) {
            $err = $st->errorInfo();
            throw new Exception('Falló SELECT comprobantes_fiscales_arca: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
        }

        $exists = $st->fetch(PDO::FETCH_ASSOC);

        if ($exists) {
            $stUpd = $pdo->prepare("
                UPDATE comprobantes_fiscales_arca
                SET
                    cae        = :cae,
                    cae_vto    = :cae_vto,
                    cbte_nro   = :cbte_nro,
                    cbte_tipo  = :cbte_tipo,
                    pto_vta    = :pto_vta,
                    resultado  = :resultado,
                    doc_tipo   = :doc_tipo,
                    doc_nro    = :doc_nro,
                    fecha_cbte = :fecha_cbte,
                    json_arca  = :json_arca,
                    updated_at = NOW()
                WHERE id_comprobante = :id_comprobante
                LIMIT 1
            ");

            $okUpd = $stUpd->execute([
                ':cae'            => $payload['cae'],
                ':cae_vto'        => $payload['cae_vto'],
                ':cbte_nro'       => $payload['cbte_nro'],
                ':cbte_tipo'      => $payload['cbte_tipo'],
                ':pto_vta'        => $payload['pto_vta'],
                ':resultado'      => $payload['resultado'],
                ':doc_tipo'       => $payload['doc_tipo'],
                ':doc_nro'        => $payload['doc_nro'],
                ':fecha_cbte'     => $payload['fecha_cbte'],
                ':json_arca'      => $jsonArcaStr,
                ':id_comprobante' => $idComprobante,
            ]);

            if (!$okUpd) {
                $err = $stUpd->errorInfo();
                throw new Exception('Falló UPDATE comprobantes_fiscales_arca: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
            }

            if ($stUpd->rowCount() < 0) {
                throw new Exception('UPDATE comprobantes_fiscales_arca no afectó filas.');
            }

            $result['debug'][] = 'UPDATE comprobantes_fiscales_arca OK';
        } else {
            $stIns = $pdo->prepare("
                INSERT INTO comprobantes_fiscales_arca
                    (
                        id_comprobante,
                        cae,
                        cae_vto,
                        cbte_nro,
                        cbte_tipo,
                        pto_vta,
                        resultado,
                        doc_tipo,
                        doc_nro,
                        fecha_cbte,
                        json_arca
                    )
                VALUES
                    (
                        :id_comprobante,
                        :cae,
                        :cae_vto,
                        :cbte_nro,
                        :cbte_tipo,
                        :pto_vta,
                        :resultado,
                        :doc_tipo,
                        :doc_nro,
                        :fecha_cbte,
                        :json_arca
                    )
            ");

            $okIns = $stIns->execute([
                ':id_comprobante' => $idComprobante,
                ':cae'            => $payload['cae'],
                ':cae_vto'        => $payload['cae_vto'],
                ':cbte_nro'       => $payload['cbte_nro'],
                ':cbte_tipo'      => $payload['cbte_tipo'],
                ':pto_vta'        => $payload['pto_vta'],
                ':resultado'      => $payload['resultado'],
                ':doc_tipo'       => $payload['doc_tipo'],
                ':doc_nro'        => $payload['doc_nro'],
                ':fecha_cbte'     => $payload['fecha_cbte'],
                ':json_arca'      => $jsonArcaStr,
            ]);

            if (!$okIns) {
                $err = $stIns->errorInfo();
                throw new Exception('Falló INSERT comprobantes_fiscales_arca: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
            }

            $nuevoIdFiscal = (int)$pdo->lastInsertId();
            if ($nuevoIdFiscal <= 0) {
                $result['debug'][] = 'INSERT OK pero lastInsertId() vino 0';
            } else {
                $result['debug'][] = 'INSERT comprobantes_fiscales_arca OK id=' . $nuevoIdFiscal;
            }
        }

        // Verificación real
        $stCheck = $pdo->prepare("
            SELECT id_comprobante_fiscal
            FROM comprobantes_fiscales_arca
            WHERE id_comprobante = :id
            LIMIT 1
        ");
        $okCheck = $stCheck->execute([':id' => $idComprobante]);

        if (!$okCheck) {
            $err = $stCheck->errorInfo();
            throw new Exception('Falló verificación final comprobantes_fiscales_arca: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
        }

        $rowCheck = $stCheck->fetch(PDO::FETCH_ASSOC);
        if (!$rowCheck) {
            throw new Exception('No quedó registro en comprobantes_fiscales_arca después del INSERT/UPDATE.');
        }

        $result['fiscal_arca_upsert'] = true;
        $result['guardo_fiscal_arca'] = true;
        $result['debug'][] = 'Verificación final OK id_comprobante=' . $idComprobante;

        return $result;
    }
}

if (!function_exists('comprobantes_build_json_arca_payload')) {
    function comprobantes_build_json_arca_payload(array $meta, array $payload, string $tipo, int $idComprobante): array
    {
        $resumen = [];
        if (isset($meta['resumen_facturacion']) && is_array($meta['resumen_facturacion'])) {
            $resumen = $meta['resumen_facturacion'];
        }

        $clienteFact = [];
        if (isset($meta['cliente_facturacion']) && is_array($meta['cliente_facturacion'])) {
            $clienteFact = $meta['cliente_facturacion'];
        } elseif (isset($resumen['cliente_facturacion']) && is_array($resumen['cliente_facturacion'])) {
            $clienteFact = $resumen['cliente_facturacion'];
        }

        $emisor = [];
        if (isset($meta['emisor']) && is_array($meta['emisor'])) {
            $emisor = $meta['emisor'];
        } else {
            $emisor = [
                'nombre'                   => $resumen['emisor_nombre'] ?? null,
                'domicilio'                => $resumen['emisor_domicilio'] ?? null,
                'cuit'                     => $resumen['cuit_emisor'] ?? null,
                'condicion_iva'            => $resumen['cond_iva_emisor'] ?? null,
                'ingresos_brutos'          => $resumen['ingresos_brutos_emisor'] ?? null,
                'fecha_inicio_actividades' => $resumen['fecha_inicio_actividades_emisor'] ?? null,
                'logo_url'                 => $resumen['logo_url'] ?? null,
            ];
        }

        $items = [];
        if (isset($meta['items_facturacion']) && is_array($meta['items_facturacion'])) {
            $items = $meta['items_facturacion'];
        } elseif (isset($resumen['items_facturacion']) && is_array($resumen['items_facturacion'])) {
            $items = $resumen['items_facturacion'];
        }

        return [
            'id_comprobante' => $idComprobante,
            'tipo'           => strtoupper(trim($tipo)),
            'estado'         => $meta['estado'] ?? null,
            'emitido_en_arca'=> (int)($payload['emitido_en_arca'] ?? 0),

            'fiscal' => [
                'cae'        => $payload['cae'] ?? null,
                'cae_vto'    => $payload['cae_vto'] ?? null,
                'cbte_nro'   => $payload['cbte_nro'] ?? null,
                'cbte_tipo'  => $payload['cbte_tipo'] ?? null,
                'pto_vta'    => $payload['pto_vta'] ?? null,
                'resultado'  => $payload['resultado'] ?? null,
                'doc_tipo'   => $payload['doc_tipo'] ?? null,
                'doc_nro'    => $payload['doc_nro'] ?? null,
                'fecha_cbte' => $payload['fecha_cbte'] ?? null,
            ],

            'cliente_facturacion' => [
                'id_cliente'     => $resumen['id_cliente'] ?? null,
                'doc_tipo'       => $clienteFact['doc_tipo'] ?? ($meta['doc_tipo'] ?? null),
                'doc_nro'        => $clienteFact['doc_nro'] ?? ($meta['doc_nro'] ?? null),
                'cuit'           => $clienteFact['cuit'] ?? null,
                'razon_social'   => $clienteFact['razon_social'] ?? ($meta['razon_social'] ?? null),
                'condicion_iva'  => $clienteFact['cond_iva'] ?? $clienteFact['condicion_iva'] ?? ($meta['cond_iva'] ?? null),
                'domicilio'      => $clienteFact['domicilio'] ?? ($meta['domicilio'] ?? null),
                'origen'         => $clienteFact['origen'] ?? null,
            ],

            'comprobante' => [
                'id_pago'          => $meta['id_pago'] ?? ($resumen['id_pago'] ?? null),
                'id_sistema'       => $meta['id_sistema'] ?? ($resumen['id_sistema'] ?? null),
                'anio'             => $meta['anio'] ?? null,
                'id_mes'           => $meta['id_mes'] ?? null,
                'label_cliente'    => $resumen['labelCliente'] ?? null,
                'label_sistema'    => $resumen['labelSistema'] ?? null,
                'id_tipo_venta'    => $resumen['id_tipo_venta'] ?? null,
                'id_medio_pago'    => $resumen['id_medio_pago'] ?? null,
                'id_clasificacion' => $resumen['id_clasificacion'] ?? null,
                'fecha_cbte_iso'   => $resumen['fecha_cbte_iso'] ?? ($meta['fecha_cbte'] ?? null),
                'vto_pago_iso'     => $resumen['vto_pago_iso'] ?? ($meta['vto_pago'] ?? null),
                'monto_ars'        => $meta['monto_ars'] ?? null,
                'total_ars'        => $meta['total_ars'] ?? ($resumen['total_ars'] ?? null),
                'monto'            => $resumen['monto'] ?? null,
                'importe'          => $resumen['importe'] ?? null,
                'observaciones'    => $meta['observaciones'] ?? ($resumen['observaciones'] ?? null),
            ],

            'emisor' => $emisor,

            'items_facturacion' => $items,

            'qr' => [
                'qr_url'     => $meta['qr_url'] ?? null,
                'qr_base64'  => $meta['qr_base64'] ?? null,
                'qr_payload' => $meta['qr_payload'] ?? null,
            ],

            'respuesta_arca' => $payload['json_arca'] ?? null,
            'meta_original_frontend' => $meta,
        ];
    }
}

/* =========================================================
   MOVIMIENTOS_COMPROBANTES
========================================================= */
if (!function_exists('comprobantes_ensure_movimiento_comprobante_table_exists')) {
    function comprobantes_ensure_movimiento_comprobante_table_exists(PDO $pdo): void
    {
        $st = $pdo->query("SHOW TABLES LIKE 'movimientos_comprobantes'");
        $exists = $st ? (bool)$st->fetchColumn() : false;

        if (!$exists) {
            throw new Exception(
                "La tabla movimientos_comprobantes no existe. Creala manualmente antes de usar comprobantes."
            );
        }
    }
}

if (!function_exists('comprobantes_get_movimiento_comprobante_row')) {
    function comprobantes_get_movimiento_comprobante_row(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipoRelacion): ?array
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

if (!function_exists('comprobantes_get_movimiento_factura_principal')) {
    function comprobantes_get_movimiento_factura_principal(PDO $pdo, int $idMovimiento): ?array
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

if (!function_exists('comprobantes_link_comprobante_to_movimiento_docs')) {
    function comprobantes_link_comprobante_to_movimiento_docs(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipo, bool $force): array
    {
        if ($idMovimiento <= 0) {
            throw new Exception('id_movimiento inválido.');
        }

        if ($idComprobante <= 0) {
            throw new Exception('id_comprobante inválido.');
        }

        if (!comprobantes_movimiento_exists($pdo, $idMovimiento)) {
            throw new Exception('El movimiento no existe.');
        }

        comprobantes_ensure_movimiento_comprobante_table_exists($pdo);

        $tipoRelacion = comprobantes_tipo_relacion_from_tipo($tipo);
        $principal = ($tipoRelacion === 'FACTURA') ? 1 : 0;

        $existingSame = comprobantes_get_movimiento_comprobante_row($pdo, $idMovimiento, $idComprobante, $tipoRelacion);
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
                'id_cobro'                => null,
                'vinculo'                 => 'movimientos_comprobantes',
                'reemplazo'               => false,
                'id_comprobante_anterior' => null,
                'principal'               => $principal,
                'ya_existia'              => true,
            ];
        }

        $principalActual = null;

        if ($tipoRelacion === 'FACTURA') {
            $principalActual = comprobantes_get_movimiento_factura_principal($pdo, $idMovimiento);

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
            ':idMov'    => $idMovimiento,
            ':idComp'   => $idComprobante,
            ':tipo'     => $tipoRelacion,
            ':principal' => $principal,
        ]);

        return [
            'modo'                    => 'movimiento_documental',
            'tipo_documento'          => $tipo,
            'tipo_relacion'           => $tipoRelacion,
            'id_movimiento'           => $idMovimiento,
            'id_comprobante'          => $idComprobante,
            'id_cobro'                => null,
            'vinculo'                 => 'movimientos_comprobantes',
            'reemplazo'               => ($tipoRelacion === 'FACTURA' && !empty($principalActual)),
            'id_comprobante_anterior' => (!empty($principalActual) ? (int)$principalActual['id_comprobante'] : null),
            'principal'               => $principal,
            'ya_existia'              => false,
        ];
    }
}

if (!function_exists('comprobantes_link_comprobante_to_cobro')) {
    function comprobantes_link_comprobante_to_cobro(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipo, bool $force): array
    {
        if ($idMovimiento <= 0) {
            throw new Exception('id_movimiento inválido.');
        }

        if ($idComprobante <= 0) {
            throw new Exception('id_comprobante inválido.');
        }

        if (!comprobantes_movimiento_exists($pdo, $idMovimiento)) {
            throw new Exception('El movimiento no existe.');
        }

        $cobro = comprobantes_get_last_cobro_by_movimiento($pdo, $idMovimiento);
        if (!$cobro) {
            throw new Exception('Ese movimiento todavía no tiene cobros para asociar el comprobante.');
        }

        $idCobro = (int)$cobro['id_cobro'];
        $prevComp = isset($cobro['id_comprobante']) ? (int)$cobro['id_comprobante'] : 0;
        $tipoUp = strtoupper(trim($tipo));

        if ($prevComp > 0 && $prevComp !== $idComprobante && !$force) {
            throw new Exception(
                'El cobro #' . $idCobro . ' ya tiene un comprobante asociado (' . $prevComp . '). Usá force=true para reemplazar.'
            );
        }

        $pdo->prepare("
            UPDATE cobros
            SET id_comprobante = :idComp
            WHERE id_cobro = :idCobro
            LIMIT 1
        ")->execute([
            ':idComp'  => $idComprobante,
            ':idCobro' => $idCobro,
        ]);

        if (comprobantes_has_column($pdo, 'comprobantes_archivos', 'id_cobro')) {
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

        return [
            'modo'                    => 'cobro_documental',
            'tipo_documento'          => $tipoUp,
            'tipo_relacion'           => ($tipoUp === 'ORDEN_PAGO' || $tipoUp === 'ORDEN DE PAGO') ? 'ORDEN_PAGO' : 'RECIBO',
            'id_movimiento'           => $idMovimiento,
            'id_comprobante'          => $idComprobante,
            'id_cobro'                => $idCobro,
            'vinculo'                 => 'cobros.id_comprobante',
            'reemplazo'               => ($prevComp > 0 && $prevComp !== $idComprobante),
            'id_comprobante_anterior' => ($prevComp > 0 ? $prevComp : null),
            'principal'               => 0,
            'ya_existia'              => ($prevComp === $idComprobante),
        ];
    }
}

if (!function_exists('comprobantes_vincular_comprobante_a_movimiento')) {
    function comprobantes_vincular_comprobante_a_movimiento(PDO $pdo, int $idMovimiento, int $idComprobante, bool $force): array
    {
        if ($idMovimiento <= 0) {
            throw new Exception('id_movimiento inválido.');
        }

        if ($idComprobante <= 0) {
            throw new Exception('id_comprobante inválido.');
        }

        if (!comprobantes_comprobante_exists($pdo, $idComprobante)) {
            throw new Exception('El id_comprobante no existe.');
        }

        $tipo = comprobantes_get_comprobante_tipo($pdo, $idComprobante);
        if ($tipo === '') {
            $tipo = 'OTRO';
        }

        if (comprobantes_tipo_es_documento_de_cobro($tipo)) {
            return comprobantes_link_comprobante_to_cobro($pdo, $idMovimiento, $idComprobante, $tipo, $force);
        }

        return comprobantes_link_comprobante_to_movimiento_docs($pdo, $idMovimiento, $idComprobante, $tipo, $force);
    }
}

/* =========================================================
   REGISTRAR ARCHIVO
   FIX: El emitido_en_arca se determina ANTES del INSERT para
   que quede correcto desde el inicio, y luego comprobantes_save_fiscal_arca
   lo reconfirma y guarda los datos fiscales en comprobantes_fiscales_arca.
========================================================= */
/* =========================================================
   REGISTRAR ARCHIVO
   FIX: SOLO marcar emitido_en_arca = 1 si hay CAE real
========================================================= */
if (!function_exists('comprobantes_registrar_archivo_comprobante')) {
    function comprobantes_registrar_archivo_comprobante(PDO $pdo, int $tenantId, string $tipo, array $file, array $meta): array
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
        $mime = comprobantes_detect_real_mime($tmp, $mimeBrowser);
        $size = isset($file['size']) ? (int)$file['size'] : 0;

        $ext = comprobantes_safe_extension_from_name($origName);
        if ($ext === '') {
            $ext = comprobantes_ext_from_mime($mime);
        }
        if ($ext === '') $ext = 'bin';

        $sha = hash_file('sha256', $tmp);
        if (!$sha) {
            throw new Exception('No se pudo calcular hash del archivo.');
        }

        $tipo = strtoupper(trim($tipo !== '' ? $tipo : 'FACTURA'));
        $tipoFolder = comprobantes_tipo_to_folder($tipo);

        $uploadsBase = comprobantes_get_private_uploads_dir();
        comprobantes_safe_mkdir($uploadsBase);

        $tenantDir = $uploadsBase
            . '/tenants/t_' . (int)$tenantId
            . '/comprobantes/' . date('Y')
            . '/' . date('m')
            . '/' . $tipoFolder;

        comprobantes_safe_mkdir($tenantDir);

        $prefix = $tipoFolder;
        $idMovimientoMeta = comprobantes_n_int($meta['id_movimiento'] ?? null);
        $idCobroMeta = comprobantes_n_int($meta['id_cobro'] ?? null);

        if ($idMovimientoMeta) $prefix .= '__mov_' . $idMovimientoMeta;
        if ($idCobroMeta) $prefix .= '__cobro_' . $idCobroMeta;

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

        $relPath = comprobantes_normalize_rel_from_private_uploads($absPath, $uploadsBase);

        // ── FIX CRÍTICO: SOLO marcar emitido si hay CAE real ──────────
        $emitidoEnArca = 0; // Por defecto NO emitido
        
        // Extraer datos para verificar si hay CAE
        $payloadArca = comprobantes_extract_arca_payload($meta, $tipo);
        
        // Verificar si realmente hay un CAE válido
        $cae = $payloadArca['cae'] ?? null;
        $caeValido = $cae !== null && $cae !== '' && $cae !== '00000000000000';
        
        // Verificar si explicitamente se marcó como emitido Y hay CAE válido
        $emitidoExplicito = !empty($meta['emitido_en_arca']) || !empty($payloadArca['emitido_en_arca']);
        
        // SOLO marcar como emitido si hay CAE válido Y (explicitamente marcado O hay datos fiscales)
        if ($caeValido && ($emitidoExplicito || !empty($payloadArca['hay_datos_fiscales']))) {
            $emitidoEnArca = 1;
        }

        // ── INSERT en comprobantes_archivos ──────────────────────────────────
        $pdo->prepare("
            INSERT INTO comprobantes_archivos
                (tipo, archivo_url, archivo_path, archivo_mime, archivo_size, sha256, emitido_en_arca)
            VALUES
                (:tipo, :url, :path, :mime, :size, :sha, :emitido)
        ")->execute([
            ':tipo'    => $tipo,
            ':url'     => '',
            ':path'    => $relPath,
            ':mime'    => ($mime !== '' ? $mime : 'application/octet-stream'),
            ':size'    => max(0, $size),
            ':sha'     => $sha,
            ':emitido' => $emitidoEnArca,
        ]);

        $idComp = (int)$pdo->lastInsertId();
        if ($idComp <= 0) {
            @unlink($absPath);
            throw new Exception('No se pudo obtener id_comprobante.');
        }

        $realUrl = comprobantes_build_download_url($idComp);

        $pdo->prepare("
            UPDATE comprobantes_archivos
            SET archivo_url = :u
            WHERE id_comprobante = :id
            LIMIT 1
        ")->execute([
            ':u'  => $realUrl,
            ':id' => $idComp,
        ]);

        // ── Guardar datos fiscales SOLO si realmente fue emitido ─────────────
        $guardoFiscalArca = false;
        $fiscalArcaUpsert = false;
        $debugFiscal = [];

        if ($emitidoEnArca === 1) {
            try {
                $fiscal = comprobantes_save_fiscal_arca($pdo, $idComp, $tipo, $meta);
                $guardoFiscalArca = !empty($fiscal['guardo_fiscal_arca']);
                $fiscalArcaUpsert = !empty($fiscal['fiscal_arca_upsert']);
                $debugFiscal = $fiscal['debug'] ?? [];
            } catch (Throwable $e) {
                // Log pero no fallamos la operación principal
                error_log('Error guardando fiscal_arca (no crítico): ' . $e->getMessage());
                $debugFiscal[] = 'Error: ' . $e->getMessage();
            }
        }

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
            'emitido_en_arca'    => $emitidoEnArca,
            'guardo_fiscal_arca' => $guardoFiscalArca,
            'fiscal_arca_upsert' => $fiscalArcaUpsert,
            'debug_fiscal_arca'  => $debugFiscal,
        ];
    }
}

/* =========================================================
   TENANT
========================================================= */
$tenantId = comprobantes_resolve_tenant_id_or_fail();

/* =========================================================
   SUBIR SIMPLE
========================================================= */
if ($action === 'comprobantes_subir') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail('Método inválido. Usá POST.', 405);
    }

    $file = null;
    if (isset($_FILES['archivo'])) $file = $_FILES['archivo'];
    if (!$file && isset($_FILES['pdf'])) $file = $_FILES['pdf'];

    if (!$file) {
        comprobantes_fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA';
    $meta = [];

    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    }

    try {
        $pdo->beginTransaction();

        $reg = comprobantes_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);

        $pdo->commit();

        comprobantes_ok([
            'id_comprobante'     => $reg['id_comprobante'],
            'archivo_url'        => $reg['archivo_url'],
            'archivo_path'       => $reg['archivo_path'],
            'sha256'             => $reg['sha256'],
            'filename'           => $reg['filename'],
            'tipo'               => $reg['tipo'],
            'archivo_mime'       => $reg['mime'],
            'emitido_en_arca'    => $reg['emitido_en_arca'],
            'guardo_fiscal_arca' => $reg['guardo_fiscal_arca'],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail('No se pudo subir el comprobante: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   SUBIR + INSERTAR + VINCULAR 1 MOVIMIENTO
========================================================= */
if ($action === 'comprobantes_vincular_movimiento') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail('Método inválido. Usá POST.', 405);
    }

    $body = comprobantes_read_json_body();

    $idMovimiento = comprobantes_n_int($_POST['id_movimiento'] ?? null);
    if (!$idMovimiento) {
        $idMovimiento = comprobantes_n_int($body['id_movimiento'] ?? null);
    }

    if (!$idMovimiento) {
        comprobantes_fail('Falta id_movimiento válido.', 400);
    }

    $force = false;
    if (isset($_POST['force'])) {
        $force = !empty($_POST['force']);
    } else {
        $force = !empty($body['force']);
    }

    $tipo = isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA';

    $meta = [];
    if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
        $tmpMeta = json_decode((string)$_POST['meta'], true);
        if (is_array($tmpMeta)) $meta = $tmpMeta;
    }

    $file = null;
    if (isset($_FILES['pdf'])) $file = $_FILES['pdf'];
    if (!$file && isset($_FILES['archivo'])) $file = $_FILES['archivo'];

    if (!$file) {
        comprobantes_fail('Falta archivo adjunto (campo "pdf" o "archivo").', 400);
    }

    try {
        $pdo->beginTransaction();

        $meta['id_movimiento'] = $idMovimiento;

        $reg = comprobantes_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
        $idComprobante = (int)$reg['id_comprobante'];

        $vinc = comprobantes_vincular_comprobante_a_movimiento($pdo, $idMovimiento, $idComprobante, $force);

        $pdo->commit();

        comprobantes_ok([
            'mensaje'            => 'Archivo subido, registrado y vinculado correctamente.',
            'id_comprobante'     => $idComprobante,
            'id_movimiento'      => $idMovimiento,
            'archivo_url'        => $reg['archivo_url'],
            'archivo_path'       => $reg['archivo_path'],
            'sha256'             => $reg['sha256'],
            'filename'           => $reg['filename'],
            'tipo'               => $reg['tipo'],
            'archivo_mime'       => $reg['mime'],
            'emitido_en_arca'    => $reg['emitido_en_arca'],
            'guardo_fiscal_arca' => $reg['guardo_fiscal_arca'],
            'fiscal_arca_upsert' => $reg['fiscal_arca_upsert'],
            'debug_fiscal_arca'  => $reg['debug_fiscal_arca'] ?? [],
            'vinculo'            => $vinc['vinculo'],
            'reemplazo'          => $vinc['reemplazo'],
            'id_cobro'           => $vinc['id_cobro'],
            'tipo_relacion'      => $vinc['tipo_relacion'],
            'principal'          => $vinc['principal'],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail('No se pudo registrar y vincular el archivo: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   SUBIR 1 ARCHIVO Y VINCULARLO A MUCHOS MOVIMIENTOS
========================================================= */
if ($action === 'comprobantes_vincular_movimientos_lote_upload') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail('Método inválido. Usá POST.', 405);
    }

    $ids = comprobantes_parse_ids_movimiento_from_request($_POST);

    if (!$ids) {
        $body = comprobantes_read_json_body();
        $ids = comprobantes_parse_ids_movimiento_from_request($body);
    }

    if (!$ids) {
        comprobantes_fail('Faltan ids_movimiento válidos.', 400);
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
        comprobantes_fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);
    }

    try {
        $pdo->beginTransaction();

        $meta['id_movimiento'] = (int)$ids[0];

        $reg = comprobantes_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
        $idComprobante = (int)$reg['id_comprobante'];

        $asociados = [];
        foreach ($ids as $idMov) {
            $asociados[] = comprobantes_vincular_comprobante_a_movimiento($pdo, (int)$idMov, $idComprobante, $force);
        }

        $pdo->commit();

        comprobantes_ok([
            'mensaje'            => 'Archivo subido y vinculado al lote correctamente.',
            'id_comprobante'     => $idComprobante,
            'ids_movimiento'     => $ids,
            'archivo_url'        => $reg['archivo_url'],
            'archivo_path'       => $reg['archivo_path'],
            'sha256'             => $reg['sha256'],
            'filename'           => $reg['filename'],
            'tipo'               => $reg['tipo'],
            'archivo_mime'       => $reg['mime'],
            'emitido_en_arca'    => $reg['emitido_en_arca'],
            'guardo_fiscal_arca' => $reg['guardo_fiscal_arca'],
            'asociados'          => $asociados,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail('No se pudo subir y vincular el archivo al lote: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ASOCIAR 1x1 JSON
========================================================= */
if ($action === 'comprobantes_asociar_movimiento' || $action === 'comprobantes_vincular_movimiento_json') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        comprobantes_fail('Método inválido. Usá POST.', 405);
    }

    $body = comprobantes_read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : []);

    $idComp = comprobantes_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $idMov  = comprobantes_n_int($src['id_movimiento'] ?? null);
    $force  = !empty($src['force']);

    if (!$idComp) comprobantes_fail('Falta id_comprobante.', 400);
    if (!$idMov)  comprobantes_fail('Falta id_movimiento.', 400);

    if (!comprobantes_comprobante_exists($pdo, $idComp)) {
        comprobantes_fail('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $vinc = comprobantes_vincular_comprobante_a_movimiento($pdo, $idMov, $idComp, $force);

        $pdo->commit();

        comprobantes_ok($vinc);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail('No se pudo asociar comprobante: ' . $e->getMessage(), 500);
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
        comprobantes_fail('Método inválido. Usá POST.', 405);
    }

    $body = comprobantes_read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : []);

    $idComp = comprobantes_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $force  = !empty($src['force']);

    $idsOk = comprobantes_parse_ids_movimiento_from_request($src);

    if (!$idComp) comprobantes_fail('Falta id_comprobante.', 400);
    if (!$idsOk) comprobantes_fail('Faltan ids_movimiento.', 400);

    if (!comprobantes_comprobante_exists($pdo, $idComp)) {
        comprobantes_fail('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $result = [
            'asociados' => [],
            'errores'   => [],
        ];

        foreach ($idsOk as $idMov) {
            try {
                $vinc = comprobantes_vincular_comprobante_a_movimiento($pdo, $idMov, $idComp, $force);
                $result['asociados'][] = $vinc;
            } catch (Throwable $e) {
                $result['errores'][] = [
                    'id_movimiento' => $idMov,
                    'mensaje'       => $e->getMessage(),
                ];
            }
        }

        $pdo->commit();

        comprobantes_ok([
            'id_comprobante' => $idComp,
            'force'          => $force,
            'result'         => $result,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        comprobantes_fail('No se pudo vincular el comprobante al lote: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   DESCARGAR
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
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            comprobantes_fail('Comprobante no encontrado.', 404);
        }

        $uploadsBase = comprobantes_get_private_uploads_dir();

        $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
        if ($rel === '') {
            $rel = isset($row['archivo_url']) ? (string)$row['archivo_url'] : '';
        }

        $rel = comprobantes_normalize_db_rel_path($rel);

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
            comprobantes_fail('Archivo no existe en disco.', 404, [
                'abs'         => $abs,
                'rel'         => $rel,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        if (!comprobantes_is_inside($abs, $uploadsBase)) {
            comprobantes_fail('Ruta inválida.', 403, [
                'abs'         => $abs,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        $mime = isset($row['archivo_mime']) ? (string)$row['archivo_mime'] : 'application/octet-stream';
        if ($mime === '') $mime = 'application/octet-stream';

        $filesize = (int)filesize($abs);
        $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === '') $ext = 'bin';

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
    } catch (Throwable $e) {
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
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            comprobantes_fail('Comprobante no encontrado.', 404);
        }

        $fiscal = null;
        if (comprobantes_has_table($pdo, 'comprobantes_fiscales_arca')) {
            $stf = $pdo->prepare("
                SELECT *
                FROM comprobantes_fiscales_arca
                WHERE id_comprobante = :id
                LIMIT 1
            ");
            $stf->execute([':id' => $id]);
            $fiscal = $stf->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        comprobantes_ok([
            'data'        => $row,
            'fiscal_arca' => $fiscal,
        ]);
    } catch (Throwable $e) {
        comprobantes_fail('Error: ' . $e->getMessage(), 500);
    }
}

comprobantes_fail('Acción de comprobantes no válida: ' . $action, 400);