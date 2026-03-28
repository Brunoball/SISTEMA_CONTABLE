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
if (!function_exists('ventas_comp_json')) {
    function ventas_comp_json(array $arr, int $httpCode = 200): void
    {
        if (!headers_sent()) {
            http_response_code($httpCode);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('ventas_comp_ok')) {
    function ventas_comp_ok(array $arr = []): void
    {
        ventas_comp_json(array_merge(['exito' => true], $arr), 200);
    }
}

if (!function_exists('ventas_comp_fail')) {
    function ventas_comp_fail(string $msg, int $httpCode = 400, array $extra = []): void
    {
        ventas_comp_json(array_merge(['exito' => false, 'mensaje' => $msg], $extra), $httpCode);
    }
}

/* =========================================================
   PDO
========================================================= */
global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
    ventas_comp_fail('PDO tenant no disponible.', 500);
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
if (!function_exists('ventas_comp_read_json_body')) {
    function ventas_comp_read_json_body(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) return [];
        $j = json_decode($raw, true);
        return is_array($j) ? $j : [];
    }
}

if (!function_exists('ventas_comp_n_int')) {
    function ventas_comp_n_int($v): ?int
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

if (!function_exists('ventas_comp_n_int_zero_ok')) {
    function ventas_comp_n_int_zero_ok($v): ?int
    {
        if ($v === null || $v === '') return null;
        if (!is_numeric($v)) return null;
        return (int)$v;
    }
}

if (!function_exists('ventas_comp_safe_str')) {
    function ventas_comp_safe_str($v): string
    {
        return trim((string)$v);
    }
}

if (!function_exists('ventas_comp_is_https_request')) {
    function ventas_comp_is_https_request(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
        if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
        $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
        return strtolower($xfp) === 'https';
    }
}

if (!function_exists('ventas_comp_dirname_n')) {
    function ventas_comp_dirname_n(string $path, int $levels): string
    {
        $out = $path;
        for ($i = 0; $i < $levels; $i++) {
            $out = dirname($out);
        }
        return $out;
    }
}

if (!function_exists('ventas_comp_get_public_html_dir')) {
    function ventas_comp_get_public_html_dir(): string
    {
        $apiDir = realpath(ventas_comp_dirname_n(__DIR__, 3));
        if ($apiDir && is_dir($apiDir)) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir && is_dir($projectDir)) {
                $publicHtml = realpath($projectDir . '/..');
                if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
                return $projectDir;
            }
            return dirname($apiDir);
        }

        return ventas_comp_dirname_n(__DIR__, 5);
    }
}

if (!function_exists('ventas_comp_get_balto_private_dir')) {
    function ventas_comp_get_balto_private_dir(): string
    {
        $publicHtml = ventas_comp_get_public_html_dir();
        $homeDir = realpath($publicHtml . '/..');

        if ($homeDir && is_dir($homeDir . '/balto_private')) {
            $cand = realpath($homeDir . '/balto_private');
            if ($cand && is_dir($cand)) return $cand;
        }

        $apiDir = realpath(ventas_comp_dirname_n(__DIR__, 3));
        if ($apiDir) {
            $projectDir = realpath($apiDir . '/..');
            if ($projectDir) {
                $cand1 = realpath($projectDir . '/../balto_private');
                if ($cand1 && is_dir($cand1)) return $cand1;

                $cand2 = realpath($projectDir . '/../../balto_private');
                if ($cand2 && is_dir($cand2)) return $cand2;
            }
        }

        ventas_comp_fail('No se encontró la carpeta balto_private.', 500, [
            'public_html' => $publicHtml,
        ]);
    }
}

if (!function_exists('ventas_comp_get_private_uploads_dir')) {
    function ventas_comp_get_private_uploads_dir(): string
    {
        $baltoPrivate = ventas_comp_get_balto_private_dir();
        $uploads = $baltoPrivate . '/uploads';

        if (!is_dir($uploads)) {
            ventas_comp_fail('No existe la carpeta balto_private/uploads.', 500, [
                'balto_private' => $baltoPrivate,
                'uploads' => $uploads,
            ]);
        }

        return $uploads;
    }
}

if (!function_exists('ventas_comp_safe_mkdir')) {
    function ventas_comp_safe_mkdir(string $path): void
    {
        if (is_dir($path)) {
            if (!is_writable($path)) {
                ventas_comp_fail('Carpeta existe pero no es writable.', 500, ['path' => $path]);
            }
            return;
        }

        if (!@mkdir($path, 0775, true) && !is_dir($path)) {
            ventas_comp_fail('No se pudo crear carpeta.', 500, ['path' => $path]);
        }

        if (!is_writable($path)) {
            ventas_comp_fail('Carpeta creada pero no es writable.', 500, ['path' => $path]);
        }
    }
}

if (!function_exists('ventas_comp_normalize_rel_from_private_uploads')) {
    function ventas_comp_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
    {
        $abs = str_replace('\\', '/', $abs);
        $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

        if (strpos($abs, $uploadsBase . '/') === 0) {
            return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
        }

        return ltrim($abs, '/');
    }
}

if (!function_exists('ventas_comp_normalize_db_rel_path')) {
    function ventas_comp_normalize_db_rel_path(string $path): string
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

if (!function_exists('ventas_comp_is_inside')) {
    function ventas_comp_is_inside(string $path, string $baseDir): bool
    {
        $pathReal = realpath($path);
        $baseReal = realpath($baseDir);
        if (!$pathReal || !$baseReal) return false;

        $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
        $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

        return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
    }
}

if (!function_exists('ventas_comp_api_php_abs_url')) {
    function ventas_comp_api_php_abs_url(): string
    {
        $scheme = ventas_comp_is_https_request() ? 'https' : 'http';
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

if (!function_exists('ventas_comp_build_download_url')) {
    function ventas_comp_build_download_url(int $idComp): string
    {
        return ventas_comp_api_php_abs_url() . '?action=ventas_comprobantes_descargar&id_comprobante=' . (int)$idComp;
    }
}

if (!function_exists('ventas_comp_tipo_to_folder')) {
    function ventas_comp_tipo_to_folder(string $tipo): string
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

if (!function_exists('ventas_comp_resolve_tenant_id_or_fail')) {
    function ventas_comp_resolve_tenant_id_or_fail(): int
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

        ventas_comp_fail(
            'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php con sesión válida.',
            401
        );
    }
}

if (!function_exists('ventas_comp_movimiento_exists')) {
    function ventas_comp_movimiento_exists(PDO $pdo, int $idMovimiento): bool
    {
        $st = $pdo->prepare("SELECT id_movimiento FROM movimientos WHERE id_movimiento = :id LIMIT 1");
        $st->execute([':id' => $idMovimiento]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('ventas_comp_comprobante_exists')) {
    function ventas_comp_comprobante_exists(PDO $pdo, int $idComprobante): bool
    {
        $st = $pdo->prepare("SELECT id_comprobante FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute([':id' => $idComprobante]);
        return (bool)$st->fetch(PDO::FETCH_ASSOC);
    }
}

if (!function_exists('ventas_comp_get_comprobante_tipo')) {
    function ventas_comp_get_comprobante_tipo(PDO $pdo, int $idComprobante): string
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

if (!function_exists('ventas_comp_tipo_relacion_from_tipo')) {
    function ventas_comp_tipo_relacion_from_tipo(string $tipo): string
    {
        $t = strtoupper(trim($tipo));
        if ($t === 'FACTURA') return 'FACTURA';
        if ($t === 'NOTA_CREDITO') return 'NOTA_CREDITO';
        if ($t === 'NOTA_DEBITO') return 'NOTA_DEBITO';
        return 'OTRO';
    }
}

if (!function_exists('ventas_comp_parse_ids_movimiento_from_request')) {
    function ventas_comp_parse_ids_movimiento_from_request(array $src): array
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
            $n = ventas_comp_n_int($x);
            if ($n) $idsOk[] = $n;
        }

        return array_values(array_unique($idsOk));
    }
}

if (!function_exists('ventas_comp_detect_real_mime')) {
    function ventas_comp_detect_real_mime(string $tmpPath, string $fallback = ''): string
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

if (!function_exists('ventas_comp_safe_extension_from_name')) {
    function ventas_comp_safe_extension_from_name(string $filename): string
    {
        $ext = strtolower((string)pathinfo($filename, PATHINFO_EXTENSION));
        $ext = preg_replace('/[^a-z0-9]+/', '', $ext);
        return $ext;
    }
}

if (!function_exists('ventas_comp_ext_from_mime')) {
    function ventas_comp_ext_from_mime(string $mime): string
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

if (!function_exists('ventas_comp_has_table')) {
    function ventas_comp_has_table(PDO $pdo, string $table): bool
    {
        $sql = "
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = :table
            LIMIT 1
        ";

        $st = $pdo->prepare($sql);
        $ok = $st->execute([':table' => $table]);

        if (!$ok) {
            $err = $st->errorInfo();
            throw new Exception('Falló ventas_comp_has_table: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
        }

        return ((int)$st->fetchColumn()) > 0;
    }
}

/* =========================================================
   HELPERS FISCALES / ARCA
========================================================= */
if (!function_exists('ventas_comp_tipo_puede_ser_fiscal')) {
    function ventas_comp_tipo_puede_ser_fiscal(string $tipo): bool
    {
        $t = strtoupper(trim($tipo));
        return in_array($t, ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'], true);
    }
}

if (!function_exists('ventas_comp_normalize_date_to_mysql')) {
    function ventas_comp_normalize_date_to_mysql($value): ?string
    {
        $s = trim((string)$value);
        if ($s === '') return null;

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return $s;
        if (preg_match('/^\d{8}$/', $s)) return substr($s, 0, 4) . '-' . substr($s, 4, 2) . '-' . substr($s, 6, 2);
        if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $s)) return substr($s, 0, 10);

        if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $s, $m)) {
            return $m[3] . '-' . $m[2] . '-' . $m[1];
        }

        return null;
    }
}

if (!function_exists('ventas_comp_pick_nested')) {
    function ventas_comp_pick_nested(array $src, array $paths, $default = null)
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

if (!function_exists('ventas_comp_extract_arca_payload')) {
    function ventas_comp_extract_arca_payload(array $meta, string $tipo): array
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
            $jsonArca = ventas_comp_pick_nested($meta, [
                ['data', 'factura'],
                ['factura'],
                ['data'],
                ['wsfe'],
                ['arca'],
            ], null);
        }

        $cae = ventas_comp_safe_str(
            $meta['cae']
            ?? ventas_comp_pick_nested($meta, [
                ['factura', 'cae'],
                ['data', 'factura', 'cae'],
                ['data', 'cae']
            ], '')
        );

        $caeVto = ventas_comp_normalize_date_to_mysql(
            $meta['cae_vto']
            ?? ($meta['caeVto'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'cae_vto'],
                ['data', 'factura', 'cae_vto'],
                ['data', 'cae_vto']
            ], ''))
        );

        $cbteNro = ventas_comp_n_int_zero_ok(
            $meta['cbte_nro']
            ?? ($meta['cbteNro'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'cbte_nro'],
                ['data', 'factura', 'cbte_nro'],
                ['data', 'cbte_nro']
            ], null))
        );

        $cbteTipo = ventas_comp_n_int_zero_ok(
            $meta['cbte_tipo']
            ?? ($meta['cbteTipo'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'cbte_tipo'],
                ['data', 'factura', 'cbte_tipo'],
                ['data', 'cbte_tipo']
            ], null))
        );

        $ptoVta = ventas_comp_n_int_zero_ok(
            $meta['pto_vta']
            ?? ($meta['ptoVta'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'pto_vta'],
                ['data', 'factura', 'pto_vta'],
                ['data', 'pto_vta']
            ], null))
        );

        $resultado = ventas_comp_safe_str(
            $meta['resultado']
            ?? ventas_comp_pick_nested($meta, [
                ['factura', 'resultado'],
                ['data', 'factura', 'resultado'],
                ['data', 'resultado']
            ], '')
        );

        $docTipo = ventas_comp_n_int_zero_ok(
            $meta['doc_tipo']
            ?? ($meta['docTipo'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'doc_tipo'],
                ['data', 'factura', 'doc_tipo'],
                ['data', 'doc_tipo']
            ], null))
        );

        $docNro = ventas_comp_safe_str(
            $meta['doc_nro']
            ?? ($meta['docNro'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'doc_nro'],
                ['data', 'factura', 'doc_nro'],
                ['data', 'doc_nro']
            ], ''))
        );

        $fechaCbte = ventas_comp_normalize_date_to_mysql(
            $meta['fecha_cbte']
            ?? ($meta['fechaCbte'] ?? ventas_comp_pick_nested($meta, [
                ['factura', 'fecha_cbte'],
                ['data', 'factura', 'fecha_cbte'],
                ['data', 'fecha_cbte']
            ], ''))
        );

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
                ventas_comp_tipo_puede_ser_fiscal($tipoNorm) &&
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

if (!function_exists('ventas_comp_build_json_arca_payload')) {
    function ventas_comp_build_json_arca_payload(array $meta, array $payload, string $tipo, int $idComprobante): array
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

if (!function_exists('ventas_comp_save_fiscal_arca')) {
    function ventas_comp_save_fiscal_arca(PDO $pdo, int $idComprobante, string $tipo, array $meta): array
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

        $payload = ventas_comp_extract_arca_payload($meta, $tipo);
        $result['emitido_en_arca'] = (int)($payload['emitido_en_arca'] ?? 0);

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

        if (!ventas_comp_tipo_puede_ser_fiscal($tipo)) {
            $result['debug'][] = 'tipo no fiscal: ' . $tipo;
            return $result;
        }

        if ((int)$payload['emitido_en_arca'] !== 1) {
            $result['debug'][] = 'No fue emitido en ARCA: no se guarda en comprobantes_fiscales_arca';
            return $result;
        }

        if (!ventas_comp_has_table($pdo, 'comprobantes_fiscales_arca')) {
            $dbName = 'desconocida';
            try {
                $dbName = (string)$pdo->query("SELECT DATABASE()")->fetchColumn();
            } catch (Throwable $e) {
            }

            throw new Exception(
                'La tabla comprobantes_fiscales_arca no existe en esta base tenant. DB actual: ' . $dbName
            );
        }

        $jsonPayloadCompleto = ventas_comp_build_json_arca_payload(
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
            if ($nuevoIdFiscal > 0) {
                $result['debug'][] = 'INSERT comprobantes_fiscales_arca OK id=' . $nuevoIdFiscal;
            } else {
                $result['debug'][] = 'INSERT OK pero lastInsertId() vino 0';
            }
        }

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

/* =========================================================
   MOVIMIENTOS_COMPROBANTES SOLO VENTAS
========================================================= */
if (!function_exists('ventas_comp_ensure_movimiento_comprobante_table_exists')) {
    function ventas_comp_ensure_movimiento_comprobante_table_exists(PDO $pdo): void
    {
        $st = $pdo->query("SHOW TABLES LIKE 'movimientos_comprobantes'");
        $exists = $st ? (bool)$st->fetchColumn() : false;

        if (!$exists) {
            throw new Exception(
                "La tabla movimientos_comprobantes no existe. Creala manualmente antes de usar comprobantes de ventas."
            );
        }
    }
}

if (!function_exists('ventas_comp_get_movimiento_comprobante_row')) {
    function ventas_comp_get_movimiento_comprobante_row(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipoRelacion): ?array
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

if (!function_exists('ventas_comp_get_movimiento_factura_principal')) {
    function ventas_comp_get_movimiento_factura_principal(PDO $pdo, int $idMovimiento): ?array
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

if (!function_exists('ventas_comp_link_comprobante_to_movimiento_docs')) {
    function ventas_comp_link_comprobante_to_movimiento_docs(PDO $pdo, int $idMovimiento, int $idComprobante, string $tipo, bool $force): array
    {
        if ($idMovimiento <= 0) throw new Exception('id_movimiento inválido.');
        if ($idComprobante <= 0) throw new Exception('id_comprobante inválido.');

        if (!ventas_comp_movimiento_exists($pdo, $idMovimiento)) {
            throw new Exception('El movimiento no existe.');
        }

        ventas_comp_ensure_movimiento_comprobante_table_exists($pdo);

        $tipoRelacion = ventas_comp_tipo_relacion_from_tipo($tipo);
        $principal = ($tipoRelacion === 'FACTURA') ? 1 : 0;

        $existingSame = ventas_comp_get_movimiento_comprobante_row($pdo, $idMovimiento, $idComprobante, $tipoRelacion);
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
            $principalActual = ventas_comp_get_movimiento_factura_principal($pdo, $idMovimiento);

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

if (!function_exists('ventas_comp_vincular_comprobante_a_movimiento')) {
    function ventas_comp_vincular_comprobante_a_movimiento(PDO $pdo, int $idMovimiento, int $idComprobante, bool $force): array
    {
        if ($idMovimiento <= 0) throw new Exception('id_movimiento inválido.');
        if ($idComprobante <= 0) throw new Exception('id_comprobante inválido.');

        if (!ventas_comp_comprobante_exists($pdo, $idComprobante)) {
            throw new Exception('El id_comprobante no existe.');
        }

        $tipo = ventas_comp_get_comprobante_tipo($pdo, $idComprobante);
        if ($tipo === '') $tipo = 'OTRO';

        return ventas_comp_link_comprobante_to_movimiento_docs($pdo, $idMovimiento, $idComprobante, $tipo, $force);
    }
}

/* =========================================================
   REGISTRAR ARCHIVO
========================================================= */
if (!function_exists('ventas_comp_registrar_archivo_comprobante')) {
    function ventas_comp_registrar_archivo_comprobante(PDO $pdo, int $tenantId, string $tipo, array $file, array $meta): array
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
        $mime = ventas_comp_detect_real_mime($tmp, $mimeBrowser);
        $size = isset($file['size']) ? (int)$file['size'] : 0;

        $ext = ventas_comp_safe_extension_from_name($origName);
        if ($ext === '') {
            $ext = ventas_comp_ext_from_mime($mime);
        }
        if ($ext === '') $ext = 'bin';

        $sha = hash_file('sha256', $tmp);
        if (!$sha) {
            throw new Exception('No se pudo calcular hash del archivo.');
        }

        $tipo = strtoupper(trim($tipo !== '' ? $tipo : 'FACTURA'));
        $tipoFolder = ventas_comp_tipo_to_folder($tipo);

        $uploadsBase = ventas_comp_get_private_uploads_dir();
        ventas_comp_safe_mkdir($uploadsBase);

        $tenantDir = $uploadsBase
            . '/tenants/t_' . (int)$tenantId
            . '/comprobantes/' . date('Y')
            . '/' . date('m')
            . '/' . $tipoFolder;

        ventas_comp_safe_mkdir($tenantDir);

        $prefix = $tipoFolder;
        $idMovimientoMeta = ventas_comp_n_int($meta['id_movimiento'] ?? null);
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

        $relPath = ventas_comp_normalize_rel_from_private_uploads($absPath, $uploadsBase);

        $emitidoEnArca = 0;
        $payloadArca = ventas_comp_extract_arca_payload($meta, $tipo);

        $cae = $payloadArca['cae'] ?? null;
        $caeValido = $cae !== null && $cae !== '' && $cae !== '00000000000000';
        $emitidoExplicito = !empty($meta['emitido_en_arca']) || !empty($payloadArca['emitido_en_arca']);

        if ($caeValido && ($emitidoExplicito || !empty($payloadArca['hay_datos_fiscales']))) {
            $emitidoEnArca = 1;
        }

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

        $realUrl = ventas_comp_build_download_url($idComp);

        $pdo->prepare("
            UPDATE comprobantes_archivos
            SET archivo_url = :u
            WHERE id_comprobante = :id
            LIMIT 1
        ")->execute([
            ':u'  => $realUrl,
            ':id' => $idComp,
        ]);

        $guardoFiscalArca = false;
        $fiscalArcaUpsert = false;
        $debugFiscal = [];

        if ($emitidoEnArca === 1) {
            try {
                $fiscal = ventas_comp_save_fiscal_arca($pdo, $idComp, $tipo, $meta);
                $guardoFiscalArca = !empty($fiscal['guardo_fiscal_arca']);
                $fiscalArcaUpsert = !empty($fiscal['fiscal_arca_upsert']);
                $debugFiscal = $fiscal['debug'] ?? [];
            } catch (Throwable $e) {
                error_log('Error guardando fiscal_arca ventas: ' . $e->getMessage());
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
$tenantId = ventas_comp_resolve_tenant_id_or_fail();

/* =========================================================
   ACCIÓN: SUBIR + VINCULAR 1 MOVIMIENTO DE VENTA
========================================================= */
if ($action === 'ventas_comprobantes_vincular_movimiento') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        ventas_comp_fail('Método inválido. Usá POST.', 405);
    }

    $body = ventas_comp_read_json_body();

    $idMovimiento = ventas_comp_n_int($_POST['id_movimiento'] ?? null);
    if (!$idMovimiento) {
        $idMovimiento = ventas_comp_n_int($body['id_movimiento'] ?? null);
    }

    if (!$idMovimiento) {
        ventas_comp_fail('Falta id_movimiento válido.', 400);
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
        ventas_comp_fail('Falta archivo adjunto (campo "pdf" o "archivo").', 400);
    }

    try {
        $pdo->beginTransaction();

        $meta['id_movimiento'] = $idMovimiento;

        $reg = ventas_comp_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
        $idComprobante = (int)$reg['id_comprobante'];

        $vinc = ventas_comp_vincular_comprobante_a_movimiento($pdo, $idMovimiento, $idComprobante, $force);

        $pdo->commit();

        ventas_comp_ok([
            'mensaje'            => 'Archivo de venta subido, registrado y vinculado correctamente.',
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
            'tipo_relacion'      => $vinc['tipo_relacion'],
            'principal'          => $vinc['principal'],
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ventas_comp_fail('No se pudo registrar y vincular el comprobante de venta: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: VINCULAR MISMO COMPROBANTE A LOTE DE VENTAS
========================================================= */
if ($action === 'ventas_comprobantes_vincular_movimientos_lote') {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') {
        ventas_comp_fail('Método inválido. Usá POST.', 405);
    }

    $body = ventas_comp_read_json_body();
    $src  = !empty($body) ? $body : (isset($_POST) ? $_POST : []);

    $idComp = ventas_comp_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $force  = !empty($src['force']);
    $idsOk  = ventas_comp_parse_ids_movimiento_from_request($src);

    if (!$idComp) ventas_comp_fail('Falta id_comprobante.', 400);
    if (!$idsOk) ventas_comp_fail('Faltan ids_movimiento.', 400);

    if (!ventas_comp_comprobante_exists($pdo, $idComp)) {
        ventas_comp_fail('El id_comprobante no existe.', 404);
    }

    try {
        $pdo->beginTransaction();

        $result = [
            'asociados' => [],
            'errores'   => [],
        ];

        foreach ($idsOk as $idMov) {
            try {
                $vinc = ventas_comp_vincular_comprobante_a_movimiento($pdo, (int)$idMov, $idComp, $force);
                $result['asociados'][] = $vinc;
            } catch (Throwable $e) {
                $result['errores'][] = [
                    'id_movimiento' => $idMov,
                    'mensaje'       => $e->getMessage(),
                ];
            }
        }

        $pdo->commit();

        ventas_comp_ok([
            'id_comprobante' => $idComp,
            'force'          => $force,
            'result'         => $result,
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        ventas_comp_fail('No se pudo vincular el comprobante al lote de ventas: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   ACCIÓN: DESCARGAR COMPROBANTE DE VENTA
========================================================= */
if ($action === 'ventas_comprobantes_descargar') {
    $id = isset($_GET['id_comprobante']) ? $_GET['id_comprobante'] : (isset($_GET['id']) ? $_GET['id'] : '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
        ventas_comp_fail('Falta id_comprobante válido.', 400);
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
            ventas_comp_fail('Comprobante no encontrado.', 404);
        }

        $uploadsBase = ventas_comp_get_private_uploads_dir();

        $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
        if ($rel === '') {
            $rel = isset($row['archivo_url']) ? (string)$row['archivo_url'] : '';
        }

        $rel = ventas_comp_normalize_db_rel_path($rel);

        if ($rel === '') {
            ventas_comp_fail('Comprobante sin ruta.', 500);
        }

        if (strpos($rel, 'uploads/') === 0) {
            $relWithoutUploads = substr($rel, strlen('uploads/'));
        } else {
            $relWithoutUploads = ltrim($rel, '/');
        }

        $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

        if (!is_file($abs)) {
            ventas_comp_fail('Archivo no existe en disco.', 404, [
                'abs'         => $abs,
                'rel'         => $rel,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        if (!ventas_comp_is_inside($abs, $uploadsBase)) {
            ventas_comp_fail('Ruta inválida.', 403, [
                'abs'         => $abs,
                'uploadsBase' => $uploadsBase,
            ]);
        }

        $mime = isset($row['archivo_mime']) ? (string)$row['archivo_mime'] : 'application/octet-stream';
        if ($mime === '') $mime = 'application/octet-stream';

        $filesize = (int)filesize($abs);
        $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
        if ($ext === '') $ext = 'bin';

        $filename = 'venta_comprobante_' . $id . '.' . $ext;

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
        ventas_comp_fail('Error al descargar comprobante de venta: ' . $e->getMessage(), 500);
    }
}

ventas_comp_fail('Acción de comprobantes de ventas no válida: ' . $action, 400);