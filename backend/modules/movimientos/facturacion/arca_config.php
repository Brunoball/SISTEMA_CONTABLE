<?php
declare(strict_types=1);

require_once __DIR__ . '/arca_tenant_paths.php';

if (!function_exists('arca_dbg_digits')) {
    function arca_dbg_digits($v): string
    {
        $out = preg_replace('/\D+/', '', (string)$v);
        return $out ?? '';
    }
}


if (!function_exists('arca_cfg_normalize_row')) {
    function arca_cfg_normalize_row(array $row): array
    {
        $row['id_config_facturacion'] = (int)($row['idConfigFacturacion'] ?? $row['id_config_facturacion'] ?? 0);
        $row['idConfigFacturacion'] = (int)$row['id_config_facturacion'];
        $row['cuit'] = arca_dbg_digits($row['cuit'] ?? '');
        $row['domicilio'] = $row['domicilio_comercial'] ?? '';
        $row['domicilio_fiscal'] = $row['domicilio_comercial'] ?? '';
        $row['inicio_actividades'] = $row['fecha_inicio_actividades'] ?? null;
        $row['emisor_nombre'] = $row['razon_social'] ?? ($row['nombre_fantasia'] ?? '');
        $row['emisor_domicilio'] = $row['domicilio_comercial'] ?? '';
        $row['cuit_emisor'] = $row['cuit'] ?? '';
        $row['cond_iva_emisor'] = $row['condicion_iva'] ?? '';
        $row['ingresos_brutos_emisor'] = $row['ingresos_brutos'] ?? '';
        $row['fecha_inicio_actividades_emisor'] = $row['fecha_inicio_actividades'] ?? null;
        return $row;
    }
}

if (!function_exists('arca_cfg_selected_input')) {
    function arca_cfg_selected_input(array $inputData): array
    {
        $cfg = is_array($inputData['config_facturacion'] ?? null) ? $inputData['config_facturacion'] : [];

        $id = (int)(
            $inputData['id_config_facturacion']
            ?? $inputData['idConfigFacturacion']
            ?? $cfg['id_config_facturacion']
            ?? $cfg['idConfigFacturacion']
            ?? $_GET['id_config_facturacion']
            ?? $_GET['idConfigFacturacion']
            ?? 0
        );

        $cuit = arca_dbg_digits(
            $inputData['cuit_emisor']
            ?? $inputData['arca_cuit']
            ?? $inputData['emisor']['cuit']
            ?? $cfg['cuit']
            ?? $cfg['cuit_emisor']
            ?? $_GET['cuit_emisor']
            ?? $_GET['arca_cuit']
            ?? $_GET['cuit_config']
            ?? ''
        );

        return [
            'id_config_facturacion' => $id > 0 ? $id : null,
            'cuit' => strlen($cuit) === 11 ? $cuit : '',
        ];
    }
}

if (!function_exists('arca_cfg_resolve_from_db')) {
    function arca_cfg_resolve_from_db(?PDO $pdo, array $inputData): array
    {
        $sel = arca_cfg_selected_input($inputData);
        $id = $sel['id_config_facturacion'];
        $cuit = $sel['cuit'];

        if (!$pdo instanceof PDO) {
            return [
                'row' => [],
                'requested_id' => $id,
                'requested_cuit' => $cuit,
                'selected_cuit' => $cuit,
            ];
        }

        $params = [];
        $whereExtra = '';
        if ($id !== null && $id > 0) {
            $whereExtra = ' AND idConfigFacturacion = :idConfig ';
            $params[':idConfig'] = $id;
        } elseif ($cuit !== '') {
            $whereExtra = ' AND REPLACE(REPLACE(cuit, \'-\', \'\'), \' \', \'\') = :cuit ';
            $params[':cuit'] = $cuit;
        }

        $sql = "
            SELECT
                idConfigFacturacion,
                razon_social,
                nombre_fantasia,
                cuit,
                ingresos_brutos,
                condicion_iva,
                domicilio_comercial,
                fecha_inicio_actividades,
                punto_venta,
                tipo_comprobante_default,
                codigo_comprobante,
                activo
            FROM config_facturacion
            WHERE activo = 1
            {$whereExtra}
            ORDER BY idConfigFacturacion DESC
            LIMIT 1
        ";

        $st = $pdo->prepare($sql);
        $st->execute($params);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            if ($id !== null && $id > 0) {
                throw new RuntimeException('No existe una configuración de facturación activa con ese ID.');
            }
            if ($cuit !== '') {
                throw new RuntimeException('No existe una configuración de facturación activa para el CUIT emisor seleccionado.');
            }
            throw new RuntimeException('No hay configuración de facturación activa.');
        }

        $row = arca_cfg_normalize_row($row);
        return [
            'row' => $row,
            'requested_id' => $id,
            'requested_cuit' => $cuit,
            'selected_cuit' => arca_dbg_digits($row['cuit'] ?? ''),
        ];
    }
}

$mode = 'prod';
$envMode = (string)($_ENV['ARCA_MODE'] ?? getenv('ARCA_MODE') ?: '');
$envMode = strtolower(trim($envMode));
if (in_array($envMode, ['homo', 'prod'], true)) {
    $mode = $envMode;
}

$tenantId = arca_get_current_tenant_id();
if ($tenantId <= 0) {
    throw new RuntimeException('No se pudo resolver el tenant actual para ARCA.');
}

$inputDataArcaConfig = [];
if (isset($data) && is_array($data)) {
    $inputDataArcaConfig = $data;
}

$cfgFacturacionResolved = arca_cfg_resolve_from_db($pdo ?? null, $inputDataArcaConfig);
$configFacturacionDb = $cfgFacturacionResolved['row'];
$selectedCuitEmisor = (string)($cfgFacturacionResolved['selected_cuit'] ?? '');

$secureDir = arca_get_tenant_account_private_dir($tenantId, $selectedCuitEmisor);

$certPath = $secureDir . '/arca_cert.pem';
$keyPath  = $secureDir . '/arca_key.pem';
$caPath   = $secureDir . '/cacert.pem';

$localA5Wsdl   = $secureDir . '/personaServiceA5.wsdl';
$localA13Wsdl  = $secureDir . '/personaServiceA13.wsdl';
$localWsfeWsdl = $secureDir . '/wsfev1.wsdl';

$certReal      = realpath($certPath) ?: $certPath;
$keyReal       = realpath($keyPath) ?: $keyPath;
$caReal        = realpath($caPath) ?: $caPath;
$localA5Real   = realpath($localA5Wsdl) ?: $localA5Wsdl;
$localA13Real  = realpath($localA13Wsdl) ?: $localA13Wsdl;
$localWsfeReal = realpath($localWsfeWsdl) ?: $localWsfeWsdl;

/* =========================================================
   Password de la key privada
========================================================= */
$keyPass = '';
$passFile = $secureDir . '/arca_key.pass';
if (is_file($passFile)) {
    $keyPass = trim((string)@file_get_contents($passFile));
}

// En multi-tenant NO conviene usar ARCA_KEY_PASS global por defecto.
// Solo se permite como fallback explícito para pruebas/local si se activa esta bandera.
$allowGlobalArcaEnv = (string)($_ENV['BALTO_ALLOW_GLOBAL_ARCA_ENV'] ?? getenv('BALTO_ALLOW_GLOBAL_ARCA_ENV') ?: '');
if ($keyPass === '' && $allowGlobalArcaEnv === '1') {
    $keyPass = (string)($_ENV['ARCA_KEY_PASS'] ?? getenv('ARCA_KEY_PASS') ?: '');
}

/* =========================================================
   Intentar extraer CUIT del certificado
========================================================= */
$cuitRepresentada = '';
$certSubject = [];

if (file_exists($certReal)) {
    try {
        $certRaw = @file_get_contents($certReal);
        if ($certRaw !== false && $certRaw !== '') {
            $certData = @openssl_x509_parse($certRaw);
            if (is_array($certData)) {
                $certSubject = isset($certData['subject']) && is_array($certData['subject'])
                    ? $certData['subject']
                    : [];

                $cn = isset($certSubject['CN']) ? (string)$certSubject['CN'] : '';
                $sn = isset($certSubject['serialNumber']) ? (string)$certSubject['serialNumber'] : '';

                foreach ([$cn, $sn] as $field) {
                    $digits = arca_dbg_digits($field);
                    if (strlen($digits) === 11) {
                        $cuitRepresentada = $digits;
                        break;
                    }
                }
            }
        }
    } catch (Throwable $e) {
        // ignorar
    }
}

if ($cuitRepresentada === '') {
    // Fallback seguro por cuenta fiscal: si el certificado no permite leer el CUIT,
    // guardar el CUIT en balto_private/balto_arca_clientes/t_ID/CUIT/arca_cuit.txt.
    // No usar ARCA_CUIT global porque en multi-tenant podría mezclar CUITs.
    $tenantCuitFile = $secureDir . '/arca_cuit.txt';
    if (is_file($tenantCuitFile)) {
        $tenantCuit = arca_dbg_digits(trim((string)@file_get_contents($tenantCuitFile)));
        if (strlen($tenantCuit) === 11) {
            $cuitRepresentada = $tenantCuit;
        }
    }
}

if ($selectedCuitEmisor !== '' && $cuitRepresentada !== '' && $selectedCuitEmisor !== $cuitRepresentada) {
    throw new RuntimeException(
        'El CUIT de config_facturacion (' . $selectedCuitEmisor . ') no coincide con el CUIT del certificado/carpeta ARCA (' . $cuitRepresentada . ').'
    );
}

$sslVerify = true;
$caFile = (file_exists($caReal) && @filesize($caReal) > 0) ? $caReal : '';

$wsnPadronA13 = 'ws_sr_padron_a13';

return [
    'mode' => $mode,
    'tenant_id' => $tenantId,
    'id_config_facturacion' => (int)($configFacturacionDb['id_config_facturacion'] ?? 0),
    'config_facturacion' => $configFacturacionDb,
    'cuit' => ($cuitRepresentada !== '' ? (int)$cuitRepresentada : 0),

    'tenant' => [
        'idTenant'  => $tenantId,
        'nombre'    => 'tenant_' . $tenantId,
        'arca_cuit' => $cuitRepresentada,
        'config_facturacion' => $configFacturacionDb,
        'cert_subject' => $certSubject,
    ],

    'paths' => [
        'secure_dir'      => $secureDir,
        'cert_path'       => $certReal,
        'key_path'        => $keyReal,
        'ca_path'         => $caReal,
        'local_a5_wsdl'   => $localA5Real,
        'local_a13_wsdl'  => $localA13Real,
        'local_wsfe_wsdl' => $localWsfeReal,
    ],

    'cert_path' => $certReal,
    'key_path'  => $keyReal,
    'key_pass'  => $keyPass,

    'ssl_verify'           => $sslVerify,
    'ca_file'              => $caFile,
    'ssl_fallback_if_fail' => true,

    // ✅ APAGADO: no más logs de debug
    'debug_log'            => false,

    // ✅ separados para poder controlar fino cada servicio
    'wsaa_ssl_verify' => true,
    'wsfe_ssl_verify' => true,

    'wsaa' => [
        'homo' => 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?WSDL',
        'prod' => 'https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL',
    ],

    'padron_a5' => [
        'wsn' => 'ws_sr_constancia_inscripcion',
        'homo_wsdl'     => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL',
        'prod_wsdl'     => 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL',
        'homo_endpoint' => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
        'prod_endpoint' => 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
        'local_wsdl'        => $localA5Real,
        'prefer_local_wsdl' => file_exists($localA5Real),
    ],

    'padron_a13' => [
        'wsn' => $wsnPadronA13,
        'homo_wsdl'     => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL',
        'prod_wsdl'     => 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13?WSDL',
        'homo_endpoint' => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
        'prod_endpoint' => 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
        'local_wsdl'        => $localA13Real,
        'prefer_local_wsdl' => file_exists($localA13Real),
    ],

    // ✅ WSDL local si existe, endpoint remoto real
    'wsfe' => [
        'homo_wsdl'         => $localWsfeReal,
        'prod_wsdl'         => $localWsfeReal,
        'homo_endpoint'     => 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
        'prod_endpoint'     => 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
        'local_wsdl'        => $localWsfeReal,
        'prefer_local_wsdl' => file_exists($localWsfeReal),
        'wsn'               => 'wsfe',
    ],

    'wsaa_sign' => [
        'use_cli'      => true,
        'openssl_bin'  => 'openssl',
        'force_sha256' => true,
        'nodetach'     => true,
        'binary'       => true,
    ],
];