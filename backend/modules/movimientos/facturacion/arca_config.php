<?php
declare(strict_types=1);

/**
 * ARCA / AFIP config (WSAA + PADRON A5)
 *
 * Requisitos:
 * - backend/secure/arca_cert.pem
 * - backend/secure/arca_key.pem
 * - backend/secure/cacert.pem (opcional)
 * - (opcional) WSDL local del padron A5 si querés evitar URL externa
 */

$BASE_API_DIR = realpath(__DIR__ . '/../../../'); // .../backend (ajusta si tu estructura difiere)
if ($BASE_API_DIR === false) $BASE_API_DIR = __DIR__ . '/../../../';

$SECURE_DIR = rtrim($BASE_API_DIR, '/\\') . '/secure';

// modo
$mode = 'homo'; // 'homo' | 'prod'
$envMode = $_ENV['ARCA_MODE'] ?? getenv('ARCA_MODE') ?: '';
$envMode = strtolower(trim((string)$envMode));
if (in_array($envMode, ['homo', 'prod'], true)) $mode = $envMode;

// key pass
$keyPass = (string)($_ENV['ARCA_KEY_PASS'] ?? getenv('ARCA_KEY_PASS') ?: '');
if ($keyPass === '') $keyPass = 'CHANGEME_BALTO';

// CUIT representada (emisor) -> importante para WSAA/Auth de los servicios
$cuit = (int)($_ENV['ARCA_CUIT'] ?? getenv('ARCA_CUIT') ?: 0);

// paths
$certPath = $SECURE_DIR . '/arca_cert.pem';
$keyPath  = $SECURE_DIR . '/arca_key.pem';
$caPath   = $SECURE_DIR . '/cacert.pem';

// si querés WSDL local para PADRON (opcional)
$padronWsdlLocal = $SECURE_DIR . '/padron_a5.wsdl';

// normalize
$certReal   = realpath($certPath) ?: $certPath;
$keyReal    = realpath($keyPath)  ?: $keyPath;
$caReal     = realpath($caPath)   ?: $caPath;
$padronWsdl = (realpath($padronWsdlLocal) ?: $padronWsdlLocal);

// SSL verify (prod true)
$sslVerify = true;

// CA bundle opcional
$caFile = (file_exists($caReal) && filesize($caReal) > 0) ? $caReal : '';

// service name para WSAA cuando pedís token/sign para PADRON A5
$wsnPadronA5 = 'ws_sr_padron_a5';

return [
  'mode' => $mode,

  // ✅ CUIT representada por el certificado (TU CUIT)
  'cuit' => $cuit,

  'cert_path' => $certReal,
  'key_path'  => $keyReal,
  'key_pass'  => $keyPass,

  'ssl_verify' => $sslVerify,
  'ca_file' => $caFile,
  'ssl_fallback_if_fail' => false,
  'debug_log' => true,

  'wsaa' => [
    'homo' => 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
    'prod' => 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
  ],

  // PADRON A5 (WSDL remoto por defecto + endpoint)
  'padron_a5' => [
    'wsn' => $wsnPadronA5,

    // WSDL remoto (funciona bien en general)
    'homo_wsdl' => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL',
    'prod_wsdl' => 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL',

    // endpoint SOAP (location)
    'homo_endpoint' => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
    'prod_endpoint' => 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',

    // si existe el local, lo podés forzar reemplazando wsdl por $padronWsdl
    'local_wsdl' => $padronWsdl,
    'prefer_local_wsdl' => false,
  ],

  // OpenSSL CLI para firmar (WSAA)
  'wsaa_sign' => [
    'use_cli'      => true,
    'openssl_bin'  => 'openssl',
    'force_sha256' => true,
    'nodetach'     => true,
    'binary'       => true,
  ],
];