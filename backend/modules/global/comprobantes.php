<?php
// backend/modules/movimientos/comprobantes.php
declare(strict_types=1);

require_once __DIR__ . '/r2_comprobantes_helper.php';

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

if (!function_exists('comprobantes_tipo_usa_numeracion_local_no_emitida')) {
    function comprobantes_tipo_usa_numeracion_local_no_emitida(string $tipo): bool
    {
        $tipo = strtoupper(trim($tipo));
        return $tipo === 'FACTURA';
    }
}

if (!function_exists('comprobantes_next_local_cbte_nro')) {
    function comprobantes_next_local_cbte_nro(PDO $pdo, string $tipo, ?int $excludeId = null): int
    {
        $tipo = strtoupper(trim($tipo));
        $sql = "
            SELECT COUNT(*)
            FROM comprobantes_archivos
            WHERE UPPER(tipo) = :tipo
              AND COALESCE(emitido_en_arca, 0) = 0
        ";

        $params = [':tipo' => $tipo];

        if ($excludeId !== null && $excludeId > 0) {
            $sql .= " AND id_comprobante <> :exclude_id";
            $params[':exclude_id'] = $excludeId;
        }

        $st = $pdo->prepare($sql);
        $ok = $st->execute($params);

        if (!$ok) {
            $err = $st->errorInfo();
            throw new Exception('Falló conteo correlativo comprobantes no emitidos: ' . json_encode($err, JSON_UNESCAPED_UNICODE));
        }

        $count = (int)$st->fetchColumn();
        return $count + 1;
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
        return mvx_public_api_php_abs_url();
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

        // La tabla movimientos_comprobantes usa un enum acotado:
        // FACTURA / NOTA_CREDITO / NOTA_DEBITO / OTRO.
        // Por eso los tipos propios de cada módulo se normalizan sin perder
        // el tipo real guardado en comprobantes_archivos.tipo.
        if ($t === 'FACTURA' || $t === 'VENTA_NO_FACTURADA') return 'FACTURA';
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

if (!function_exists('comprobantes_tipo_es_principal_de_movimiento')) {
    function comprobantes_tipo_es_principal_de_movimiento(string $tipo): bool
    {
        $t = strtoupper(trim($tipo));
        return in_array($t, [
            'FACTURA',
            'VENTA_NO_FACTURADA',
            'COMPRA',
            'OTROS_INGRESOS',
            'OTRO_INGRESO',
            'OTROS_EGRESOS',
            'OTRO_EGRESO',
            'PRESUPUESTO',
        ], true);
    }
}

if (!function_exists('comprobantes_marcar_archivo_movimiento')) {
    function comprobantes_marcar_archivo_movimiento(PDO $pdo, int $idComprobante, int $idMovimiento): void
    {
        if ($idComprobante <= 0 || $idMovimiento <= 0) return;
        if (!comprobantes_has_column($pdo, 'comprobantes_archivos', 'id_movimiento')) return;

        $pdo->prepare("
            UPDATE comprobantes_archivos
            SET id_movimiento = :idMov
            WHERE id_comprobante = :idComp
              AND (id_movimiento IS NULL OR id_movimiento = 0)
            LIMIT 1
        ")->execute([
            ':idMov' => $idMovimiento,
            ':idComp' => $idComprobante,
        ]);
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
            'cbte_nro'            => null,
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
            if (!comprobantes_tipo_usa_numeracion_local_no_emitida($tipo)) {
                $result['debug'][] = 'No fue emitido en ARCA y el tipo no usa numeración local';
                return $result;
            }

            $cbteActual = isset($payload['cbte_nro']) ? (int)$payload['cbte_nro'] : 0;
            if ($cbteActual <= 0) {
                $payload['cbte_nro'] = comprobantes_next_local_cbte_nro($pdo, $tipo, $idComprobante);
                $result['debug'][] = 'Asignado correlativo local no emitido=' . $payload['cbte_nro'];
            }

            if (empty($payload['resultado'])) {
                $payload['resultado'] = 'P';
            }
        }

        $result['cbte_nro'] = isset($payload['cbte_nro']) ? (int)$payload['cbte_nro'] : null;

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

        $tipoUp = strtoupper(trim($tipo));
        $tipoRelacion = comprobantes_tipo_relacion_from_tipo($tipoUp);
        $principal = comprobantes_tipo_es_principal_de_movimiento($tipoUp) ? 1 : 0;

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

            comprobantes_marcar_archivo_movimiento($pdo, $idComprobante, $idMovimiento);

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

        comprobantes_marcar_archivo_movimiento($pdo, $idComprobante, $idMovimiento);

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

        comprobantes_marcar_archivo_movimiento($pdo, $idComprobante, $idMovimiento);

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
        if ($mime === '') $mime = 'application/octet-stream';
        $size = isset($file['size']) ? (int)$file['size'] : 0;

        $ext = comprobantes_safe_extension_from_name($origName);
        if ($ext === '') $ext = comprobantes_ext_from_mime($mime);
        if ($ext === '') $ext = 'bin';

        $sha = hash_file('sha256', $tmp);
        if (!$sha) {
            throw new Exception('No se pudo calcular hash del archivo.');
        }

        $tipo = strtoupper(trim($tipo !== '' ? $tipo : 'FACTURA'));
        if ($tipo === 'ORDEN_DE_PAGO') $tipo = 'ORDEN_PAGO';
        if ($tipo === 'OTRO_INGRESO') $tipo = 'OTROS_INGRESOS';
        if ($tipo === 'OTRO_EGRESO') $tipo = 'OTROS_EGRESOS';

        $tipoFolder = comprobantes_tipo_to_folder($tipo);
        $idMovimientoMeta = comprobantes_n_int($meta['id_movimiento'] ?? null);
        $idCobroMeta = comprobantes_n_int($meta['id_cobro'] ?? null);

        $prefix = $tipoFolder;
        if ($idMovimientoMeta) $prefix .= '__mov_' . $idMovimientoMeta;
        if ($idCobroMeta) $prefix .= '__cobro_' . $idCobroMeta;

        $finalName = $prefix . '__' . date('Ymd_His') . '__' . substr($sha, 0, 32) . '.' . $ext;
        $r2Key = mvx_r2_build_comprobante_key((int)$tenantId, $tipoFolder, $finalName);
        $r2Stored = false;

        try {
            mvx_r2_put_file($tmp, $r2Key, $mime, [
                'Metadata' => [
                    'sha256' => $sha,
                    'tipo' => strtolower($tipo),
                    'tenant_id' => (string)$tenantId,
                    'nombre_original' => substr($origName, 0, 250),
                ],
            ]);
            $r2Stored = true;
        } catch (Throwable $e) {
            throw new Exception('No se pudo guardar el archivo en R2: ' . $e->getMessage());
        }

        $archivoPathDb = 'r2://' . ltrim($r2Key, '/');

        // ── FIX CRÍTICO: SOLO marcar emitido si hay CAE real ──────────
        $emitidoEnArca = 0;
        $payloadArca = comprobantes_extract_arca_payload($meta, $tipo);
        $cae = $payloadArca['cae'] ?? null;
        $caeValido = $cae !== null && $cae !== '' && $cae !== '00000000000000';
        $emitidoExplicito = !empty($meta['emitido_en_arca']) || !empty($payloadArca['emitido_en_arca']);
        if ($caeValido && ($emitidoExplicito || !empty($payloadArca['hay_datos_fiscales']))) {
            $emitidoEnArca = 1;
        }

        try {
            $cols = ['tipo', 'archivo_url', 'archivo_path', 'archivo_mime', 'archivo_size', 'sha256', 'emitido_en_arca'];
            $vals = [':tipo', ':url', ':path', ':mime', ':size', ':sha', ':emitido'];
            $params = [
                ':tipo' => $tipo,
                ':url' => '',
                ':path' => $archivoPathDb,
                ':mime' => $mime,
                ':size' => max(0, $size),
                ':sha' => $sha,
                ':emitido' => $emitidoEnArca,
            ];

            if ($idMovimientoMeta && comprobantes_has_column($pdo, 'comprobantes_archivos', 'id_movimiento')) {
                $cols[] = 'id_movimiento';
                $vals[] = ':id_movimiento';
                $params[':id_movimiento'] = $idMovimientoMeta;
            }

            if ($idCobroMeta && comprobantes_has_column($pdo, 'comprobantes_archivos', 'id_cobro')) {
                $cols[] = 'id_cobro';
                $vals[] = ':id_cobro';
                $params[':id_cobro'] = $idCobroMeta;
            }

            $sql = 'INSERT INTO comprobantes_archivos (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
            $pdo->prepare($sql)->execute($params);

            $idComp = (int)$pdo->lastInsertId();
            if ($idComp <= 0) {
                throw new Exception('No se pudo obtener id_comprobante.');
            }

            $realUrl = comprobantes_build_download_url($idComp);
            $pdo->prepare("UPDATE comprobantes_archivos SET archivo_url = :u WHERE id_comprobante = :id LIMIT 1")
                ->execute([':u' => $realUrl, ':id' => $idComp]);

            $guardoFiscalArca = false;
            $fiscalArcaUpsert = false;
            $cbteNroGuardado = null;
            $debugFiscal = [];

            if ($emitidoEnArca === 1 || comprobantes_tipo_usa_numeracion_local_no_emitida($tipo)) {
                try {
                    $fiscal = comprobantes_save_fiscal_arca($pdo, $idComp, $tipo, $meta);
                    $guardoFiscalArca = !empty($fiscal['guardo_fiscal_arca']);
                    $fiscalArcaUpsert = !empty($fiscal['fiscal_arca_upsert']);
                    $cbteNroGuardado = isset($fiscal['cbte_nro']) ? (int)$fiscal['cbte_nro'] : null;
                    $debugFiscal = $fiscal['debug'] ?? [];
                } catch (Throwable $e) {
                    error_log('Error guardando fiscal_arca (no crítico): ' . $e->getMessage());
                    $debugFiscal[] = 'Error: ' . $e->getMessage();
                }
            }

            return [
                'id_comprobante'     => $idComp,
                'archivo_url'        => $realUrl,
                'archivo_path'       => $archivoPathDb,
                'sha256'             => $sha,
                'filename'           => $finalName,
                'mime'               => $mime,
                'size'               => max(0, $size),
                'archivo_mime'       => $mime,
                'archivo_size'       => max(0, $size),
                'tipo'               => $tipo,
                'tipoFolder'         => $tipoFolder,
                'emitido_en_arca'    => $emitidoEnArca,
                'guardo_fiscal_arca' => $guardoFiscalArca,
                'fiscal_arca_upsert' => $fiscalArcaUpsert,
                'cbte_nro'           => $cbteNroGuardado,
                'debug_fiscal_arca'  => $debugFiscal,
                'r2_key'             => $r2Key,
                'storage'            => 'r2',
            ];
        } catch (Throwable $e) {
            if ($r2Stored) {
                try { mvx_r2_delete_object($r2Key); } catch (Throwable $cleanupError) {
                    error_log('No se pudo limpiar archivo R2 luego de fallo DB: ' . $cleanupError->getMessage());
                }
            }
            throw $e;
        }
    }
}


/* =========================================================
   COMPATIBILIDAD GLOBAL PARA ACCIONES DE SUBMÓDULOS
   Permite eliminar comprobantes_*.php de ventas/compras/recibos/etc.
========================================================= */
if (!function_exists('comprobantes_bool')) {
    function comprobantes_bool($v): bool
    {
        if (is_bool($v)) return $v;
        if (is_numeric($v)) return ((int)$v) === 1;
        $s = strtolower(trim((string)$v));
        return in_array($s, ['1', 'true', 'si', 'sí', 'yes', 'on'], true);
    }
}

if (!function_exists('comprobantes_file_from_request')) {
    function comprobantes_file_from_request(): ?array
    {
        foreach (['archivo', 'pdf', 'file', 'comprobante'] as $k) {
            if (isset($_FILES[$k]) && is_array($_FILES[$k])) return $_FILES[$k];
        }
        return null;
    }
}

if (!function_exists('comprobantes_contexto_accion_modulo')) {
    function comprobantes_contexto_accion_modulo(string $action): array
    {
        $a = strtolower(trim($action));
        $ctx = [
            'modulo' => 'global',
            'tipo_default' => 'FACTURA',
        ];

        if (strpos($a, 'ventas_') === 0) {
            $ctx = ['modulo' => 'ventas', 'tipo_default' => 'FACTURA'];
        } elseif (strpos($a, 'compras_') === 0 || in_array($a, ['compras_eliminar_comprobante', 'comprobante_eliminar_por_movimiento'], true)) {
            $ctx = ['modulo' => 'compras', 'tipo_default' => 'COMPRA'];
        } elseif (strpos($a, 'recibos_') === 0) {
            $ctx = ['modulo' => 'recibos', 'tipo_default' => 'RECIBO'];
        } elseif (strpos($a, 'ordenes_pago_') === 0) {
            $ctx = ['modulo' => 'ordenes_pago', 'tipo_default' => 'ORDEN_PAGO'];
        } elseif (strpos($a, 'otros_ingresos_') === 0) {
            $ctx = ['modulo' => 'otros_ingresos', 'tipo_default' => 'OTROS_INGRESOS'];
        } elseif (strpos($a, 'otros_egresos_') === 0) {
            $ctx = ['modulo' => 'otros_egresos', 'tipo_default' => 'OTROS_EGRESOS'];
        } elseif (strpos($a, 'mov_global_comprobantes_') === 0 || strpos($a, 'mov_global_archivos_') === 0) {
            $modulo = strtolower(trim((string)($_GET['modulo'] ?? $_POST['modulo'] ?? 'global')));
            $map = [
                'ventas' => 'FACTURA',
                'compras' => 'COMPRA',
                'recibos' => 'RECIBO',
                'ordenes_pago' => 'ORDEN_PAGO',
                'otros_ingresos' => 'OTROS_INGRESOS',
                'otros_egresos' => 'OTROS_EGRESOS',
            ];
            if (isset($map[$modulo])) {
                $ctx = ['modulo' => $modulo, 'tipo_default' => $map[$modulo]];
            }
        }

        return $ctx;
    }
}

if (!function_exists('comprobantes_normalizar_tipo_modulo')) {
    function comprobantes_normalizar_tipo_modulo(string $tipo, string $default): string
    {
        $tipo = strtoupper(trim($tipo !== '' ? $tipo : $default));
        if ($tipo === '') $tipo = $default;
        if ($default === 'COMPRA' && $tipo === 'FACTURA') $tipo = 'COMPRA';
        if ($tipo === 'ORDEN_DE_PAGO' || $tipo === 'ORDEN DE PAGO') $tipo = 'ORDEN_PAGO';
        if ($tipo === 'OTRO_INGRESO') $tipo = 'OTROS_INGRESOS';
        if ($tipo === 'OTRO_EGRESO') $tipo = 'OTROS_EGRESOS';
        return $tipo;
    }
}

if (!function_exists('comprobantes_accion_es_archivo_modulo')) {
    function comprobantes_accion_es_archivo_modulo(string $action): bool
    {
        $a = strtolower(trim($action));
        if ($a === '') return false;
        if (strpos($a, 'mov_global_comprobantes_') === 0 || strpos($a, 'mov_global_archivos_') === 0) return true;
        $prefijos = ['ventas_', 'compras_', 'recibos_', 'ordenes_pago_', 'otros_ingresos_', 'otros_egresos_'];
        foreach ($prefijos as $p) {
            if (strpos($a, $p) === 0 && strpos($a, 'comprobante') !== false) return true;
        }
        return in_array($a, ['compras_eliminar_comprobante', 'comprobante_eliminar_por_movimiento'], true);
    }
}

if (!function_exists('comprobantes_operacion_archivo_modulo')) {
    function comprobantes_operacion_archivo_modulo(string $action): string
    {
        $a = strtolower(trim($action));
        if (strpos($a, 'descargar') !== false) return 'descargar';
        if (strpos($a, 'info') !== false) return 'info';
        if (strpos($a, 'eliminar') !== false) return 'eliminar';
        if (strpos($a, 'subir_y_vincular') !== false || strpos($a, 'vincular_movimiento_upload') !== false || strpos($a, 'vincular_movimientos_lote_upload') !== false) return 'subir';
        if (strpos($a, 'subir') !== false) return 'subir';
        if (strpos($a, 'asociar_movimientos') !== false || strpos($a, 'vincular_movimientos') !== false) return 'vincular_lote';
        if (strpos($a, 'asociar_movimiento') !== false || strpos($a, 'vincular_movimiento_json') !== false) return 'vincular';
        if (strpos($a, 'vincular_movimiento') !== false) return comprobantes_file_from_request() ? 'subir' : 'vincular';
        return 'desconocida';
    }
}

if (!function_exists('comprobantes_meta_desde_request')) {
    function comprobantes_meta_desde_request(array $body = []): array
    {
        $meta = [];
        if (isset($_POST['meta']) && is_string($_POST['meta']) && trim($_POST['meta']) !== '') {
            $tmp = json_decode((string)$_POST['meta'], true);
            if (is_array($tmp)) $meta = $tmp;
        } elseif (isset($body['meta']) && is_array($body['meta'])) {
            $meta = $body['meta'];
        }
        return $meta;
    }
}

if (!function_exists('comprobantes_find_by_movimiento_global')) {
    function comprobantes_find_by_movimiento_global(PDO $pdo, int $idMovimiento): ?array
    {
        if ($idMovimiento <= 0) return null;

        if (comprobantes_has_table($pdo, 'movimientos_comprobantes')) {
            $st = $pdo->prepare("\n                SELECT ca.*\n                FROM movimientos_comprobantes mc\n                INNER JOIN comprobantes_archivos ca ON ca.id_comprobante = mc.id_comprobante\n                WHERE mc.id_movimiento = :m\n                ORDER BY mc.principal DESC, mc.id_movimiento_comprobante DESC, ca.id_comprobante DESC\n                LIMIT 1\n            ");
            $st->execute([':m' => $idMovimiento]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) return $row;
        }

        if (comprobantes_has_column($pdo, 'comprobantes_archivos', 'id_movimiento')) {
            $st = $pdo->prepare('SELECT * FROM comprobantes_archivos WHERE id_movimiento = :m ORDER BY id_comprobante DESC LIMIT 1');
            $st->execute([':m' => $idMovimiento]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) return $row;
        }

        if (comprobantes_has_table($pdo, 'cobros')) {
            $st = $pdo->prepare("\n                SELECT ca.*\n                FROM cobros c\n                INNER JOIN comprobantes_archivos ca ON ca.id_comprobante = c.id_comprobante\n                WHERE c.id_movimiento = :m\n                ORDER BY c.id_cobro DESC\n                LIMIT 1\n            ");
            $st->execute([':m' => $idMovimiento]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) return $row;
        }

        return null;
    }
}

if (!function_exists('comprobantes_row_by_id_or_movimiento')) {
    function comprobantes_row_by_id_or_movimiento(PDO $pdo, int $idComprobante = 0, int $idMovimiento = 0): ?array
    {
        if ($idComprobante > 0) {
            $st = $pdo->prepare('SELECT * FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1');
            $st->execute([':id' => $idComprobante]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) return $row;
        }
        if ($idMovimiento > 0) return comprobantes_find_by_movimiento_global($pdo, $idMovimiento);
        return null;
    }
}

if (!function_exists('comprobantes_delete_storage_file')) {
    function comprobantes_delete_storage_file(string $path): void
    {
        $path = trim($path);
        if ($path === '') return;
        if (strpos($path, 'r2://') === 0) {
            $key = ltrim(substr($path, strlen('r2://')), '/');
            if ($key !== '') {
                try { mvx_r2_delete_object($key); } catch (Throwable $e) { error_log('No se pudo borrar R2: ' . $e->getMessage()); }
            }
            return;
        }

        $uploadsBase = comprobantes_get_private_uploads_dir();
        $rel = comprobantes_normalize_db_rel_path($path);
        if (strpos($rel, 'uploads/') === 0) $rel = substr($rel, strlen('uploads/'));
        $abs = rtrim($uploadsBase, '/') . '/' . ltrim($rel, '/');
        if (is_file($abs) && comprobantes_is_inside($abs, $uploadsBase)) @unlink($abs);
    }
}

if (!function_exists('comprobantes_descargar_row_global')) {
    function comprobantes_descargar_row_global(array $row, int $idMovimiento = 0): void
    {
        $id = (int)($row['id_comprobante'] ?? 0);
        $storedPath = trim((string)($row['archivo_path'] ?? ($row['archivo_url'] ?? '')));
        $mime = trim((string)($row['archivo_mime'] ?? '')) ?: 'application/octet-stream';
        $tipo = strtolower(trim((string)($row['tipo'] ?? 'comprobante'))) ?: 'comprobante';

        if ($storedPath === '') comprobantes_fail('Comprobante sin ruta.', 404);

        if (strpos($storedPath, 'r2://') === 0) {
            $r2Key = ltrim(substr($storedPath, strlen('r2://')), '/');
            if ($r2Key === '') comprobantes_fail('Key R2 inválida.', 500);
            $ext = pathinfo($r2Key, PATHINFO_EXTENSION) ?: 'bin';
            $signedUrl = mvx_r2_create_get_signed_url($r2Key, '+20 minutes', [
                'ResponseContentType' => $mime,
                'ResponseContentDisposition' => 'inline; filename="' . $tipo . '_comprobante_' . $id . '.' . $ext . '"',
            ]);

            $raw = comprobantes_bool($_GET['raw'] ?? ($_GET['inline'] ?? false));
            if ($raw) {
                if (!headers_sent()) header('Location: ' . $signedUrl, true, 302);
                exit;
            }

            comprobantes_ok([
                'url' => $signedUrl,
                'download_url' => $signedUrl,
                'modo' => 'r2',
                'id_comprobante' => $id,
                'id_movimiento' => $idMovimiento ?: (int)($row['id_movimiento'] ?? 0),
                'archivo_mime' => $mime,
            ]);
        }

        $uploadsBase = comprobantes_get_private_uploads_dir();
        $rel = comprobantes_normalize_db_rel_path($storedPath);
        if (strpos($rel, 'uploads/') === 0) $rel = substr($rel, strlen('uploads/'));
        $abs = rtrim($uploadsBase, '/') . '/' . ltrim($rel, '/');

        if (!is_file($abs)) comprobantes_fail('Archivo no existe en disco.', 404, ['archivo_path' => $storedPath]);
        if (!comprobantes_is_inside($abs, $uploadsBase)) comprobantes_fail('Ruta inválida.', 403);

        $raw = comprobantes_bool($_GET['raw'] ?? ($_GET['inline'] ?? true));
        $ext = pathinfo($abs, PATHINFO_EXTENSION) ?: 'bin';
        if (!$raw) {
            comprobantes_ok([
                'url' => comprobantes_build_download_url($id) . '&raw=1',
                'download_url' => comprobantes_build_download_url($id) . '&raw=1',
                'modo' => 'local',
                'id_comprobante' => $id,
                'id_movimiento' => $idMovimiento ?: (int)($row['id_movimiento'] ?? 0),
                'archivo_mime' => $mime,
            ]);
        }

        if (!headers_sent()) {
            header('Content-Type: ' . $mime);
            header('Content-Disposition: inline; filename="' . $tipo . '_comprobante_' . $id . '.' . $ext . '"');
            header('Content-Length: ' . (string)filesize($abs));
            header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        }
        readfile($abs);
        exit;
    }
}

if (!function_exists('comprobantes_handle_subir_global')) {
    function comprobantes_handle_subir_global(PDO $pdo, int $tenantId, array $ctx): void
    {
        if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') comprobantes_fail('Método inválido. Usá POST.', 405);
        $body = comprobantes_read_json_body();
        $file = comprobantes_file_from_request();
        if (!$file) comprobantes_fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);

        $tipo = comprobantes_normalizar_tipo_modulo((string)($_POST['tipo'] ?? ($body['tipo'] ?? '')), (string)$ctx['tipo_default']);
        $meta = comprobantes_meta_desde_request($body);

        $ids = comprobantes_parse_ids_movimiento_from_request($_POST ?: []);
        if (!$ids) $ids = comprobantes_parse_ids_movimiento_from_request($body ?: []);
        if (!$ids && isset($meta['ids_movimiento']) && is_array($meta['ids_movimiento'])) {
            $ids = comprobantes_parse_ids_movimiento_from_request(['ids_movimiento' => $meta['ids_movimiento']]);
        }

        $idMovimiento = comprobantes_n_int($_POST['id_movimiento'] ?? ($body['id_movimiento'] ?? ($meta['id_movimiento'] ?? null)));
        if ($idMovimiento) {
            $ids[] = $idMovimiento;
            $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
            $meta['id_movimiento'] = $idMovimiento;
        } elseif ($ids) {
            $meta['id_movimiento'] = (int)$ids[0];
        }

        $force = comprobantes_bool($_POST['force'] ?? ($body['force'] ?? false));

        try {
            $pdo->beginTransaction();
            $reg = comprobantes_registrar_archivo_comprobante($pdo, $tenantId, $tipo, $file, $meta);
            $asociados = [];
            foreach ($ids as $idMov) {
                $asociados[] = comprobantes_vincular_comprobante_a_movimiento($pdo, (int)$idMov, (int)$reg['id_comprobante'], $force);
            }
            $pdo->commit();

            comprobantes_ok([
                'mensaje' => $ids ? 'Archivo subido y vinculado correctamente.' : 'Archivo subido correctamente.',
                'id_comprobante' => (int)$reg['id_comprobante'],
                'id_movimiento' => $idMovimiento ?: ($ids[0] ?? null),
                'ids_movimiento' => $ids,
                'ids_movimiento_vinculados' => $ids,
                'asociados' => $asociados,
                'vinculos_lote' => $asociados,
                'archivo_url' => (string)$reg['archivo_url'],
                'archivo_path' => (string)$reg['archivo_path'],
                'sha256' => (string)$reg['sha256'],
                'filename' => (string)$reg['filename'],
                'tipo' => (string)$reg['tipo'],
                'archivo_mime' => (string)($reg['archivo_mime'] ?? $reg['mime'] ?? ''),
                'archivo_size' => (int)($reg['archivo_size'] ?? $reg['size'] ?? 0),
                'storage' => (string)($reg['storage'] ?? 'r2'),
                'guardo_fiscal_arca' => !empty($reg['guardo_fiscal_arca']),
                'fiscal_arca_upsert' => !empty($reg['fiscal_arca_upsert']),
                'cbte_nro' => $reg['cbte_nro'] ?? null,
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            comprobantes_fail('No se pudo subir/vincular el comprobante: ' . $e->getMessage(), 500);
        }
    }
}

if (!function_exists('comprobantes_handle_vincular_global')) {
    function comprobantes_handle_vincular_global(PDO $pdo, array $ctx, bool $lote): void
    {
        if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper((string)$_SERVER['REQUEST_METHOD']) !== 'POST') comprobantes_fail('Método inválido. Usá POST.', 405);
        $body = comprobantes_read_json_body();
        $src = !empty($body) ? $body : ($_POST ?: []);
        $idComp = comprobantes_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
        if (!$idComp) comprobantes_fail('Falta id_comprobante.', 400);

        $ids = [];
        if ($lote) {
            $ids = comprobantes_parse_ids_movimiento_from_request($src);
        } else {
            $idMov = comprobantes_n_int($src['id_movimiento'] ?? null);
            if ($idMov) $ids = [$idMov];
        }
        if (!$ids) comprobantes_fail('Faltan ids_movimiento válidos.', 400);

        $force = comprobantes_bool($src['force'] ?? false);
        try {
            $pdo->beginTransaction();
            $asociados = [];
            foreach ($ids as $idMov) {
                $asociados[] = comprobantes_vincular_comprobante_a_movimiento($pdo, (int)$idMov, (int)$idComp, $force);
            }
            $pdo->commit();
            comprobantes_ok([
                'id_comprobante' => (int)$idComp,
                'id_movimiento' => $ids[0] ?? null,
                'ids_movimiento' => $ids,
                'asociados' => $asociados,
                'result' => ['asociados' => $asociados, 'errores' => []],
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            comprobantes_fail('No se pudo asociar comprobante: ' . $e->getMessage(), 500);
        }
    }
}

if (!function_exists('comprobantes_handle_info_global')) {
    function comprobantes_handle_info_global(PDO $pdo): void
    {
        $idComp = comprobantes_n_int($_GET['id_comprobante'] ?? ($_GET['idComp'] ?? null));
        $idMov = comprobantes_n_int($_GET['id_movimiento'] ?? ($_GET['id'] ?? null));
        $row = comprobantes_row_by_id_or_movimiento($pdo, $idComp ?: 0, $idMov ?: 0);
        if (!$row) {
            if ($idMov && !$idComp) {
                comprobantes_ok([
                    'data' => null,
                    'comprobante' => null,
                    'sin_comprobante' => true,
                    'mensaje' => 'Sin comprobante vinculado.',
                    'id_comprobante' => null,
                    'id_movimiento' => $idMov,
                    'archivo_url' => '',
                    'archivo_path' => '',
                    'archivo_mime' => '',
                    'archivo_size' => 0,
                    'tipo' => '',
                ]);
            }
            comprobantes_fail('Comprobante no encontrado.', 404);
        }
        comprobantes_ok([
            'data' => $row,
            'comprobante' => $row,
            'id_comprobante' => (int)($row['id_comprobante'] ?? 0),
            'id_movimiento' => $idMov ?: (int)($row['id_movimiento'] ?? 0),
            'archivo_url' => (string)($row['archivo_url'] ?? ''),
            'archivo_path' => (string)($row['archivo_path'] ?? ''),
            'archivo_mime' => (string)($row['archivo_mime'] ?? ''),
            'archivo_size' => (int)($row['archivo_size'] ?? 0),
            'tipo' => (string)($row['tipo'] ?? ''),
        ]);
    }
}

if (!function_exists('comprobantes_handle_eliminar_global')) {
    function comprobantes_handle_eliminar_global(PDO $pdo): void
    {
        $body = comprobantes_read_json_body();
        $src = array_merge($_GET ?: [], $_POST ?: [], $body ?: []);
        $idComp = comprobantes_n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
        $idMov = comprobantes_n_int($src['id_movimiento'] ?? ($src['id'] ?? null));

        try {
            $pdo->beginTransaction();
            $row = comprobantes_row_by_id_or_movimiento($pdo, $idComp ?: 0, $idMov ?: 0);
            if (!$row) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                comprobantes_ok(['mensaje' => 'No había comprobante para eliminar.', 'eliminado' => false]);
            }

            $idComp = (int)$row['id_comprobante'];
            $path = (string)($row['archivo_path'] ?? '');

            if (comprobantes_has_table($pdo, 'movimientos_comprobantes')) {
                if ($idMov) {
                    $pdo->prepare('DELETE FROM movimientos_comprobantes WHERE id_comprobante = :c AND id_movimiento = :m')
                        ->execute([':c' => $idComp, ':m' => $idMov]);
                } else {
                    $pdo->prepare('DELETE FROM movimientos_comprobantes WHERE id_comprobante = :c')
                        ->execute([':c' => $idComp]);
                }
            }
            if (comprobantes_has_table($pdo, 'cobros')) {
                $pdo->prepare('UPDATE cobros SET id_comprobante = NULL WHERE id_comprobante = :c')
                    ->execute([':c' => $idComp]);
            }
            if (comprobantes_has_table($pdo, 'movimientos_cheques') && comprobantes_has_column($pdo, 'movimientos_cheques', 'id_comprobante')) {
                $pdo->prepare('UPDATE movimientos_cheques SET id_comprobante = NULL WHERE id_comprobante = :c')
                    ->execute([':c' => $idComp]);
            }

            $still = 0;
            if (comprobantes_has_table($pdo, 'movimientos_comprobantes')) {
                $st = $pdo->prepare('SELECT COUNT(*) FROM movimientos_comprobantes WHERE id_comprobante = :c');
                $st->execute([':c' => $idComp]);
                $still += (int)$st->fetchColumn();
            }
            if (comprobantes_has_table($pdo, 'cobros')) {
                $st = $pdo->prepare('SELECT COUNT(*) FROM cobros WHERE id_comprobante = :c');
                $st->execute([':c' => $idComp]);
                $still += (int)$st->fetchColumn();
            }
            if (comprobantes_has_table($pdo, 'movimientos_cheques') && comprobantes_has_column($pdo, 'movimientos_cheques', 'id_comprobante')) {
                $st = $pdo->prepare('SELECT COUNT(*) FROM movimientos_cheques WHERE id_comprobante = :c');
                $st->execute([':c' => $idComp]);
                $still += (int)$st->fetchColumn();
            }

            if ($still === 0) {
                $pdo->prepare('DELETE FROM comprobantes_archivos WHERE id_comprobante = :c LIMIT 1')
                    ->execute([':c' => $idComp]);
            }

            $pdo->commit();
            if ($still === 0) comprobantes_delete_storage_file($path);

            comprobantes_ok([
                'eliminado' => true,
                'id_comprobante' => $idComp,
                'id_movimiento' => $idMov,
                'archivo_eliminado' => ($still === 0),
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            comprobantes_fail('No se pudo eliminar comprobante: ' . $e->getMessage(), 500);
        }
    }
}

/* =========================================================
   TENANT
========================================================= */
$tenantId = comprobantes_resolve_tenant_id_or_fail();

/* =========================================================
   ALIAS GENERALES EXTRA
========================================================= */
if ($action === 'comprobantes_eliminar') {
    comprobantes_handle_eliminar_global($pdo);
}

if ($action === 'comprobantes_link') {
    comprobantes_handle_vincular_global($pdo, ['modulo' => 'global', 'tipo_default' => 'FACTURA'], false);
}

if ($action === 'comprobantes_descargar_token') {
    $idComp = comprobantes_n_int($_GET['id_comprobante'] ?? ($_GET['idComp'] ?? ($_GET['id'] ?? null)));
    $idMov = comprobantes_n_int($_GET['id_movimiento'] ?? null);
    $row = comprobantes_row_by_id_or_movimiento($pdo, $idComp ?: 0, $idMov ?: 0);
    if (!$row) comprobantes_fail('Comprobante no encontrado.', 404);
    comprobantes_descargar_row_global($row, $idMov ?: 0);
}

/* =========================================================
   RUTEO GLOBAL DE COMPROBANTES DE SUBMÓDULOS
   Todas estas acciones quedan resueltas por global/comprobantes.php
========================================================= */
if (comprobantes_accion_es_archivo_modulo($action)) {
    $ctx = comprobantes_contexto_accion_modulo($action);
    $op = comprobantes_operacion_archivo_modulo($action);

    if ($op === 'subir') {
        comprobantes_handle_subir_global($pdo, $tenantId, $ctx);
    }

    if ($op === 'vincular') {
        comprobantes_handle_vincular_global($pdo, $ctx, false);
    }

    if ($op === 'vincular_lote') {
        comprobantes_handle_vincular_global($pdo, $ctx, true);
    }

    if ($op === 'info') {
        comprobantes_handle_info_global($pdo);
    }

    if ($op === 'descargar') {
        $idComp = comprobantes_n_int($_GET['id_comprobante'] ?? ($_GET['idComp'] ?? ($_GET['id'] ?? null)));
        $idMov = comprobantes_n_int($_GET['id_movimiento'] ?? null);
        $row = comprobantes_row_by_id_or_movimiento($pdo, $idComp ?: 0, $idMov ?: 0);
        if (!$row) comprobantes_fail('Comprobante no encontrado.', 404);
        comprobantes_descargar_row_global($row, $idMov ?: 0);
    }

    if ($op === 'eliminar') {
        comprobantes_handle_eliminar_global($pdo);
    }

    comprobantes_fail('Acción global de comprobantes no reconocida: ' . $action, 400);
}

/* =========================================================
   PRÓXIMO NÚMERO LOCAL FACTURA NO EMITIDA
========================================================= */
if ($action === 'comprobantes_proximo_numero_no_emitido') {
    $tipo = isset($_GET['tipo']) ? (string)$_GET['tipo'] : (isset($_POST['tipo']) ? (string)$_POST['tipo'] : 'FACTURA');
    $tipo = strtoupper(trim($tipo !== '' ? $tipo : 'FACTURA'));

    if (!comprobantes_tipo_usa_numeracion_local_no_emitida($tipo)) {
        comprobantes_fail('El tipo solicitado no usa numeración local no emitida.', 400, ['tipo' => $tipo]);
    }

    try {
        $nro = comprobantes_next_local_cbte_nro($pdo, $tipo, null);
        comprobantes_ok([
            'tipo' => $tipo,
            'cbte_nro' => $nro,
        ]);
    } catch (Throwable $e) {
        comprobantes_fail('No se pudo obtener el próximo número local: ' . $e->getMessage(), 500);
    }
}

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
            'cbte_nro'           => $reg['cbte_nro'] ?? null,
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
            'cbte_nro'           => $reg['cbte_nro'] ?? null,
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
            'cbte_nro'           => $reg['cbte_nro'] ?? null,
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
    $idComp = comprobantes_n_int($_GET['id_comprobante'] ?? ($_GET['idComp'] ?? ($_GET['id'] ?? null)));
    $idMov = comprobantes_n_int($_GET['id_movimiento'] ?? null);

    if (!$idComp && !$idMov) {
        comprobantes_fail('Falta id_comprobante o id_movimiento válido.', 400);
    }

    try {
        $row = comprobantes_row_by_id_or_movimiento($pdo, $idComp ?: 0, $idMov ?: 0);
        if (!$row) comprobantes_fail('Comprobante no encontrado.', 404);
        comprobantes_descargar_row_global($row, $idMov ?: 0);
    } catch (Throwable $e) {
        comprobantes_fail('Error al descargar: ' . $e->getMessage(), 500);
    }
}

/* =========================================================
   INFO
========================================================= */
if ($action === 'comprobantes_info') {
    $idComp = comprobantes_n_int($_GET['id_comprobante'] ?? ($_GET['idComp'] ?? ($_GET['id'] ?? null)));
    $idMov = comprobantes_n_int($_GET['id_movimiento'] ?? null);

    if (!$idComp && !$idMov) {
        comprobantes_fail('Falta id_comprobante o id_movimiento válido.', 400);
    }

    try {
        $row = comprobantes_row_by_id_or_movimiento($pdo, $idComp ?: 0, $idMov ?: 0);
        if (!$row) {
            if ($idMov && !$idComp) {
                comprobantes_ok([
                    'data' => null,
                    'comprobante' => null,
                    'fiscal_arca' => null,
                    'sin_comprobante' => true,
                    'mensaje' => 'Sin comprobante vinculado.',
                    'id_comprobante' => null,
                    'id_movimiento' => $idMov,
                    'archivo_url' => '',
                    'archivo_path' => '',
                    'archivo_mime' => '',
                    'archivo_size' => 0,
                    'tipo' => '',
                ]);
            }
            comprobantes_fail('Comprobante no encontrado.', 404);
        }

        $fiscal = null;
        $id = (int)($row['id_comprobante'] ?? 0);
        if ($id > 0 && comprobantes_has_table($pdo, 'comprobantes_fiscales_arca')) {
            $stf = $pdo->prepare("SELECT * FROM comprobantes_fiscales_arca WHERE id_comprobante = :id LIMIT 1");
            $stf->execute([':id' => $id]);
            $fiscal = $stf->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        comprobantes_ok([
            'data'        => $row,
            'comprobante' => $row,
            'fiscal_arca' => $fiscal,
            'id_comprobante' => $id,
            'id_movimiento' => $idMov ?: (int)($row['id_movimiento'] ?? 0),
            'archivo_url' => (string)($row['archivo_url'] ?? ''),
            'archivo_path' => (string)($row['archivo_path'] ?? ''),
            'archivo_mime' => (string)($row['archivo_mime'] ?? ''),
            'archivo_size' => (int)($row['archivo_size'] ?? 0),
            'tipo' => (string)($row['tipo'] ?? ''),
        ]);
    } catch (Throwable $e) {
        comprobantes_fail('Error: ' . $e->getMessage(), 500);
    }
}

comprobantes_fail('Acción de comprobantes no válida: ' . $action, 400);