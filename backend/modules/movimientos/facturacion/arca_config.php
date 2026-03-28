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

$secureDir = arca_get_tenant_private_dir($tenantId);

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
$keyPass = (string)($_ENV['ARCA_KEY_PASS'] ?? getenv('ARCA_KEY_PASS') ?: '');
if ($keyPass === '') {
    $passFile = $secureDir . '/arca_key.pass';
    if (is_file($passFile)) {
        $keyPass = trim((string)@file_get_contents($passFile));
    }
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
    $envCuit = (string)($_ENV['ARCA_CUIT'] ?? getenv('ARCA_CUIT') ?: '');
    $envCuit = arca_dbg_digits($envCuit);
    if (strlen($envCuit) === 11) {
        $cuitRepresentada = $envCuit;
    }
}

$sslVerify = true;
$caFile = (file_exists($caReal) && @filesize($caReal) > 0) ? $caReal : '';

$wsnPadronA13 = 'ws_sr_padron_a13';

return [
    'mode' => $mode,
    'tenant_id' => $tenantId,
    'cuit' => ($cuitRepresentada !== '' ? (int)$cuitRepresentada : 0),

    'tenant' => [
        'idTenant'  => $tenantId,
        'nombre'    => 'tenant_' . $tenantId,
        'arca_cuit' => $cuitRepresentada,
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