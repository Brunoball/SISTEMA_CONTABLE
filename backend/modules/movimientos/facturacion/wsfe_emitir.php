<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

/* =========================================================
   JSON helpers
========================================================= */
if (!function_exists('wsfe_json_ok')) {
    function wsfe_json_ok(array $data = [], int $code = 200): void
    {
        http_response_code($code);
        echo json_encode([
            'exito' => true,
            'data'  => $data,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('wsfe_json_error')) {
    function wsfe_json_error(string $msg, int $code = 400, $extra = null): void
    {
        http_response_code($code);
        $out = [
            'exito'   => false,
            'mensaje' => $msg,
        ];
        if ($extra !== null) {
            $out['extra'] = $extra;
        }
        echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

/* =========================================================
   Helpers
========================================================= */
if (!function_exists('wsfe_str')) {
    function wsfe_str($v): string
    {
        return trim((string)($v ?? ''));
    }
}

if (!function_exists('wsfe_num')) {
    function wsfe_num($v): float
    {
        return round((float)$v, 2);
    }
}

if (!function_exists('wsfe_digits')) {
    function wsfe_digits($v): string
    {
        $out = preg_replace('/\D+/', '', (string)$v);
        return $out ?? '';
    }
}

if (!function_exists('wsfe_valid_ymd')) {
    function wsfe_valid_ymd(string $digits): bool
    {
        if (!preg_match('/^\d{8}$/', $digits)) {
            return false;
        }
        $y = (int)substr($digits, 0, 4);
        $m = (int)substr($digits, 4, 2);
        $d = (int)substr($digits, 6, 2);
        return checkdate($m, $d, $y);
    }
}

if (!function_exists('wsfe_date_ymd')) {
    function wsfe_date_ymd($v): string
    {
        $s = wsfe_str($v);
        if ($s === '') {
            return '';
        }

        $digits = wsfe_digits($s);
        if (wsfe_valid_ymd($digits)) {
            return $digits;
        }

        return '';
    }
}

if (!function_exists('wsfe_require_date_ymd')) {
    function wsfe_require_date_ymd($v, string $label): string
    {
        $ymd = wsfe_date_ymd($v);
        if ($ymd === '') {
            throw new RuntimeException('La ' . $label . ' es obligatoria y debe venir desde el modal en formato AAAA-MM-DD o YYYYMMDD. No se inventa fecha en el backend.');
        }
        return $ymd;
    }
}

if (!function_exists('wsfe_ymd_to_iso')) {
    function wsfe_ymd_to_iso(string $ymd): string
    {
        $digits = wsfe_digits($ymd);
        if (!preg_match('/^\d{8}$/', $digits)) {
            return '';
        }
        return substr($digits, 0, 4) . '-' . substr($digits, 4, 2) . '-' . substr($digits, 6, 2);
    }
}

if (!function_exists('wsfe_plus_days_ymd')) {
    function wsfe_plus_days_ymd(string $baseYmd, int $days): string
    {
        $digits = wsfe_digits($baseYmd);
        if (!wsfe_valid_ymd($digits)) {
            throw new RuntimeException('Fecha base inválida para calcular vencimiento.');
        }

        $dt = DateTime::createFromFormat('!Ymd', $digits);
        if (!$dt) {
            throw new RuntimeException('No se pudo interpretar la fecha base para calcular vencimiento.');
        }

        $dt->modify(($days >= 0 ? '+' : '') . $days . ' days');
        return $dt->format('Ymd');
    }
}

if (!function_exists('wsfe_guess_condicion_iva_receptor_id')) {
    function wsfe_guess_condicion_iva_receptor_id(array $cliente, int $docTipo): int
    {
        $cond = mb_strtolower(trim((string)(
            $cliente['condicion_iva'] ??
            $cliente['cond_iva'] ??
            ''
        )));

        if ($cond === '') {
            return $docTipo === 99 ? 5 : 6;
        }

        if (strpos($cond, 'responsable inscripto') !== false || $cond === 'iva responsable inscripto') {
            return 1;
        }
        if (strpos($cond, 'exento') !== false) {
            return 4;
        }
        if (strpos($cond, 'consumidor final') !== false) {
            return 5;
        }
        if (strpos($cond, 'monotrib') !== false) {
            return 6;
        }
        if (strpos($cond, 'no categorizado') !== false) {
            return 7;
        }
        if (strpos($cond, 'proveedor del exterior') !== false) {
            return 8;
        }
        if (strpos($cond, 'cliente del exterior') !== false) {
            return 9;
        }
        if (strpos($cond, 'ley 19.640') !== false) {
            return 10;
        }
        if (strpos($cond, 'monotributista social') !== false) {
            return 13;
        }
        if (strpos($cond, 'no alcanzado') !== false) {
            return 15;
        }

        return $docTipo === 99 ? 5 : 6;
    }
}

if (!function_exists('wsfe_is_nota_credito_tipo')) {
    function wsfe_is_nota_credito_tipo(int $cbteTipo): bool
    {
        return in_array($cbteTipo, [3, 8, 13], true);
    }
}

if (!function_exists('wsfe_is_tipo_c_sin_iva')) {
    function wsfe_is_tipo_c_sin_iva(int $cbteTipo): bool
    {
        return in_array($cbteTipo, [11, 13], true);
    }
}

if (!function_exists('wsfe_normalize_cbtes_asoc')) {
    function wsfe_normalize_cbtes_asoc($cbtesAsoc): array
    {
        if (!is_array($cbtesAsoc)) {
            return [];
        }

        $out = [];

        foreach ($cbtesAsoc as $row) {
            if (!is_array($row)) {
                continue;
            }

            $tipo = (int)($row['tipo'] ?? $row['cbte_tipo'] ?? 0);
            $ptoVta = (int)($row['pto_vta'] ?? $row['ptoVta'] ?? 0);
            $nro = (int)($row['nro'] ?? $row['cbte_nro'] ?? 0);
            $cuit = wsfe_digits($row['cuit'] ?? '');
            $fecha = wsfe_date_ymd($row['fecha'] ?? $row['cbte_fch'] ?? '');

            if ($tipo <= 0 || $ptoVta <= 0 || $nro <= 0) {
                continue;
            }

            $one = [
                'tipo'    => $tipo,
                'pto_vta' => $ptoVta,
                'nro'     => $nro,
            ];

            if ($cuit !== '') {
                $one['cuit'] = $cuit;
            }

            if ($fecha !== '') {
                $one['fecha'] = $fecha;
            }

            $out[] = $one;
        }

        return $out;
    }
}

if (!function_exists('wsfe_validate_cbtes_asoc_or_fail')) {
    function wsfe_validate_cbtes_asoc_or_fail(int $cbteTipo, array $cbtesAsoc): void
    {
        if (!wsfe_is_nota_credito_tipo($cbteTipo)) {
            return;
        }

        if (empty($cbtesAsoc)) {
            wsfe_json_error(
                'Para emitir una nota de crédito debés informar cbtes_asoc con el comprobante original asociado.',
                422,
                [
                    'cbte_tipo' => $cbteTipo,
                    'requiere_cbtes_asoc' => true,
                ]
            );
        }

        $primero = $cbtesAsoc[0] ?? null;
        if (!is_array($primero)) {
            wsfe_json_error('cbtes_asoc inválido.', 422);
        }

        $tipo = (int)($primero['tipo'] ?? 0);
        $ptoVta = (int)($primero['pto_vta'] ?? 0);
        $nro = (int)($primero['nro'] ?? 0);

        if ($tipo <= 0 || $ptoVta <= 0 || $nro <= 0) {
            wsfe_json_error(
                'cbtes_asoc debe incluir tipo, pto_vta y nro del comprobante original.',
                422,
                ['cbtes_asoc' => $cbtesAsoc]
            );
        }
    }
}

/* =========================================================
   LOG DESACTIVADO
========================================================= */
if (!function_exists('wsfe_write_log')) {
    function wsfe_write_log(string $title, array $context = []): void
    {
        // No-op
    }
}

/* =========================================================
   BOOT
========================================================= */
require_once __DIR__ . '/arca_wsfev1.php';

$rawBody = file_get_contents('php://input');
$body = [];
if ($rawBody !== false && trim($rawBody) !== '') {
    $tmp = json_decode($rawBody, true);
    if (is_array($tmp)) {
        $body = $tmp;
    }
}

$data = isset($body['data']) && is_array($body['data']) ? $body['data'] : $body;

wsfe_write_log('INICIO wsfe_emitir', [
    'raw_body' => $rawBody,
    'body' => $body,
    'data' => $data,
]);

try {
    $cfg = require __DIR__ . '/arca_config.php';
} catch (Throwable $e) {
    wsfe_write_log('ERROR cargando arca_config.php', [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString(),
    ]);

    wsfe_json_error('No se pudo cargar la configuración ARCA.', 500, [
        'detalle' => $e->getMessage(),
    ]);
}

try {
    $cliente = is_array($data['cliente_facturacion'] ?? null) ? $data['cliente_facturacion'] : [];
    $items   = is_array($data['items_facturacion'] ?? null) ? $data['items_facturacion'] : [];

    if (empty($items)) {
        wsfe_write_log('VALIDACION: sin items', [
            'data' => $data,
        ]);
        wsfe_json_error('No hay items para facturar.', 422);
    }

    $ptoVta   = (int)($data['pto_vta'] ?? 2);
    $cbteTipo = (int)($data['cbte_tipo'] ?? 11);

    $docTipo = (int)($cliente['doc_tipo'] ?? $data['doc_tipo'] ?? 99);
    $docNro  = wsfe_digits($cliente['doc_nro'] ?? $cliente['cuit'] ?? $data['doc_nro'] ?? '');

    if ($docTipo <= 0) {
        $docTipo = 99;
    }

    if ($docTipo !== 99 && $docNro === '') {
        wsfe_write_log('VALIDACION: falta doc_nro', [
            'cliente' => $cliente,
            'data' => $data,
            'doc_tipo' => $docTipo,
        ]);
        wsfe_json_error('Falta doc_nro / cuit del receptor.', 422);
    }

    $cbtesAsoc = wsfe_normalize_cbtes_asoc($data['cbtes_asoc'] ?? []);
    wsfe_validate_cbtes_asoc_or_fail($cbteTipo, $cbtesAsoc);

    // Seguridad multi CUIT: una nota de crédito debe emitirse con el mismo
    // CUIT que emitió la factura original asociada. Si el frontend manda una
    // config equivocada, se corta antes de pedir CAE a ARCA.
    if (wsfe_is_nota_credito_tipo($cbteTipo)) {
        $cuitCfgEmisor = wsfe_digits($cfg['cuit'] ?? ($cfg['tenant']['arca_cuit'] ?? ''));
        foreach ($cbtesAsoc as $asoc) {
            $cuitAsoc = wsfe_digits($asoc['cuit'] ?? '');
            if ($cuitCfgEmisor !== '' && $cuitAsoc !== '' && $cuitCfgEmisor !== $cuitAsoc) {
                wsfe_json_error(
                    'La nota de crédito debe emitirse con la misma cuenta fiscal de la factura original. Emisor seleccionado: ' . $cuitCfgEmisor . ' / Factura original: ' . $cuitAsoc,
                    422,
                    [
                        'cuit_emisor_seleccionado' => $cuitCfgEmisor,
                        'cuit_factura_original' => $cuitAsoc,
                        'cbtes_asoc' => $cbtesAsoc,
                    ]
                );
            }
        }
    }

    $impNeto = 0.00;
    $impIva  = 0.00;
    $impEx   = 0.00;
    $impTrib = 0.00;
    $impTotConc = 0.00;

    $ivaMap = [];

    foreach ($items as $it) {
        if (!is_array($it)) {
            continue;
        }

        $subtotal = wsfe_num($it['subtotal'] ?? 0);
        $ivaMonto = wsfe_num($it['iva_monto'] ?? 0);
        $ivaPct   = (float)($it['iva_pct'] ?? 0);

        $impNeto += $subtotal;
        $impIva  += $ivaMonto;

        $ivaId = 3;
        if (abs($ivaPct - 10.5) < 0.001) {
            $ivaId = 4;
        } elseif (abs($ivaPct - 21) < 0.001) {
            $ivaId = 5;
        } elseif (abs($ivaPct - 27) < 0.001) {
            $ivaId = 6;
        } elseif (abs($ivaPct - 5) < 0.001) {
            $ivaId = 8;
        } elseif (abs($ivaPct - 2.5) < 0.001) {
            $ivaId = 9;
        }

        if (!isset($ivaMap[$ivaId])) {
            $ivaMap[$ivaId] = [
                'id' => $ivaId,
                'base_imp' => 0.00,
                'importe' => 0.00,
            ];
        }

        $ivaMap[$ivaId]['base_imp'] += $subtotal;
        $ivaMap[$ivaId]['importe'] += $ivaMonto;
    }

    $ivaItems = [];
    foreach ($ivaMap as $iv) {
        if ($iv['base_imp'] <= 0 && $iv['importe'] <= 0) {
            continue;
        }
        $ivaItems[] = [
            'id'       => (int)$iv['id'],
            'base_imp' => wsfe_num($iv['base_imp']),
            'importe'  => wsfe_num($iv['importe']),
        ];
    }

    $impTotal = wsfe_num(
        ($data['total_ars'] ?? 0)
        ?: ($data['monto'] ?? 0)
        ?: ($data['importe'] ?? 0)
        ?: ($impNeto + $impIva + $impTrib + $impEx + $impTotConc)
    );

    $fechaCbte = wsfe_require_date_ymd($data['fecha_cbte_iso'] ?? $data['fecha_cbte'] ?? null, 'fecha del comprobante');

    $periodoDesde = wsfe_date_ymd(
        $data['fch_serv_desde'] ??
        $data['periodo_desde'] ??
        $fechaCbte
    );

    $periodoHasta = wsfe_date_ymd(
        $data['fch_serv_hasta'] ??
        $data['periodo_hasta'] ??
        wsfe_plus_days_ymd($fechaCbte, 20)
    );

    $fchVtoPago = wsfe_date_ymd(
        $data['vto_pago_iso'] ??
        $data['vto_pago'] ??
        wsfe_plus_days_ymd($fechaCbte, 20)
    );

    $esTipoCSinIva = wsfe_is_tipo_c_sin_iva($cbteTipo);

    if ($esTipoCSinIva) {
        wsfe_write_log('AJUSTE TIPO C: se elimina objeto IVA del request', [
            'cbte_tipo' => $cbteTipo,
            'iva_items_originales' => $ivaItems,
            'imp_iva' => wsfe_num($impIva),
            'motivo' => 'ARCA rechaza comprobantes tipo C si se informa el objeto Iva.',
        ]);

        $ivaItems = [];
        $impIva = 0.00;
    }

    $condicionIvaReceptorId = (int)(
        $data['condicion_iva_receptor_id'] ??
        $cliente['condicion_iva_receptor_id'] ??
        wsfe_guess_condicion_iva_receptor_id($cliente, $docTipo)
    );

    $req = [
        'pto_vta'        => $ptoVta,
        'cbte_tipo'      => $cbteTipo,
        'concepto'       => (int)($data['concepto'] ?? 1),
        'doc_tipo'       => $docTipo,
        'doc_nro'        => $docNro === '' ? '0' : $docNro,
        'fecha_cbte'     => $fechaCbte,
        'fch_vto_pago'   => $fchVtoPago,
        'fch_serv_desde' => $periodoDesde,
        'fch_serv_hasta' => $periodoHasta,
        'mon_id'         => 'PES',
        'mon_cotiz'      => 1,
        'imp_total'      => $impTotal,
        'imp_tot_conc'   => wsfe_num($impTotConc),
        'imp_neto'       => wsfe_num($impNeto),
        'imp_op_ex'      => wsfe_num($impEx),
        'imp_trib'       => wsfe_num($impTrib),
        'imp_iva'        => wsfe_num($impIva),
        'iva_items'      => $ivaItems,
        'opcionales'     => is_array($data['opcionales'] ?? null) ? $data['opcionales'] : [],
        'cbtes_asoc'     => $cbtesAsoc,
        'tributos'       => is_array($data['tributos'] ?? null) ? $data['tributos'] : [],
        'condicion_iva_receptor_id' => $condicionIvaReceptorId,
    ];

    wsfe_write_log('REQUEST listo para ArcaWsfev1::emitirComprobante', [
        'cfg_resumen' => [
            'mode' => $cfg['mode'] ?? null,
            'tenant_id' => $cfg['tenant_id'] ?? null,
            'cuit' => $cfg['cuit'] ?? null,
            'cert_path' => $cfg['cert_path'] ?? null,
            'key_path' => $cfg['key_path'] ?? null,
            'ca_file' => $cfg['ca_file'] ?? null,
            'ssl_verify' => $cfg['ssl_verify'] ?? null,
            'wsaa_ssl_verify' => $cfg['wsaa_ssl_verify'] ?? null,
            'wsfe_ssl_verify' => $cfg['wsfe_ssl_verify'] ?? null,
            'wsfe' => $cfg['wsfe'] ?? null,
        ],
        'es_tipo_c_sin_iva' => $esTipoCSinIva,
        'req' => $req,
    ]);

    $result = ArcaWsfev1::emitirComprobante($cfg, $req);

    wsfe_write_log('RESPUESTA OK de ArcaWsfev1::emitirComprobante', [
        'result' => $result,
    ]);

    wsfe_json_ok([
        'factura' => [
            'modo'          => $result['modo'] ?? ($cfg['mode'] ?? 'prod'),
            'cuit_emisor'   => $result['auth']['cuit'] ?? null,
            'pto_vta'       => $result['comprobante']['pto_vta'] ?? null,
            'cbte_tipo'     => $result['comprobante']['cbte_tipo'] ?? null,
            'cbte_nro'      => $result['comprobante']['cbte_nro'] ?? null,
            'fecha_cbte'    => $result['comprobante']['fecha_cbte'] ?? null,
            'resultado'     => $result['comprobante']['resultado'] ?? null,
            'cae'           => $result['comprobante']['cae'] ?? null,
            'cae_vto'       => $result['comprobante']['cae_vto'] ?? null,
            'imp_total'     => $result['comprobante']['imp_total'] ?? null,
            'imp_neto'      => $result['comprobante']['imp_neto'] ?? null,
            'imp_iva'       => $result['comprobante']['imp_iva'] ?? null,
            'doc_tipo'      => $result['comprobante']['doc_tipo'] ?? null,
            'doc_nro'       => $result['comprobante']['doc_nro'] ?? null,
            'qr_url'        => $result['qr']['url'] ?? null,
            'qr_base64'     => $result['qr']['base64'] ?? null,
            'qr_payload'    => $result['qr']['payload'] ?? null,
            'periodo_desde' => wsfe_ymd_to_iso($periodoDesde),
            'periodo_hasta' => wsfe_ymd_to_iso($periodoHasta),
            'vto_pago'      => wsfe_ymd_to_iso($fchVtoPago),
            'cbtes_asoc'    => $result['comprobante']['cbtes_asoc'] ?? $cbtesAsoc,
            'observaciones' => $result['observaciones'] ?? [],
            'eventos'       => $result['eventos'] ?? [],
            'errores'       => $result['errores'] ?? [],
            'raw_min'       => $result['raw_min'] ?? [],
        ],
    ]);
} catch (Throwable $e) {
    wsfe_write_log('ERROR GENERAL wsfe_emitir', [
        'message' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString(),
        'cfg_resumen' => [
            'mode' => $cfg['mode'] ?? null,
            'tenant_id' => $cfg['tenant_id'] ?? null,
            'cuit' => $cfg['cuit'] ?? null,
            'cert_path' => $cfg['cert_path'] ?? null,
            'key_path' => $cfg['key_path'] ?? null,
            'ca_file' => $cfg['ca_file'] ?? null,
            'ssl_verify' => $cfg['ssl_verify'] ?? null,
            'wsaa_ssl_verify' => $cfg['wsaa_ssl_verify'] ?? null,
            'wsfe_ssl_verify' => $cfg['wsfe_ssl_verify'] ?? null,
            'wsfe' => $cfg['wsfe'] ?? null,
        ],
        'data' => $data,
    ]);

    wsfe_json_error('Error emitiendo factura en WSFEv1: ' . $e->getMessage(), 500, [
        'modo' => $cfg['mode'] ?? null,
        'tenant_id' => $cfg['tenant_id'] ?? null,
    ]);
}