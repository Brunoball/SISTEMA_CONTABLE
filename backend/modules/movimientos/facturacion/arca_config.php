<?php
declare(strict_types=1);

/**
 * ARCA config (WSAA + Constancia de Inscripción)
 *
 * Requisitos:
 * - backend/secure/arca_cert.pem
 * - backend/secure/arca_key.pem
 * - backend/secure/cacert.pem (opcional)
 * - (opcional) WSDL local
 */

$BASE_API_DIR = realpath(__DIR__ . '/../../../');
if ($BASE_API_DIR === false) {
  $BASE_API_DIR = __DIR__ . '/../../../';
}

$SECURE_DIR = rtrim($BASE_API_DIR, '/\\') . '/secure';

// modo
$mode = 'homo'; // homo | prod
$envMode = $_ENV['ARCA_MODE'] ?? getenv('ARCA_MODE') ?: '';
$envMode = strtolower(trim((string)$envMode));
if (in_array($envMode, ['homo', 'prod'], true)) {
  $mode = $envMode;
}

// pass de la key
$keyPass = (string)($_ENV['ARCA_KEY_PASS'] ?? getenv('ARCA_KEY_PASS') ?: '');
if ($keyPass === '') {
  $keyPass = 'CHANGEME_BALTO';
}

// CUIT representada
$cuit = (int)($_ENV['ARCA_CUIT'] ?? getenv('ARCA_CUIT') ?: 0);

// paths
$certPath = $SECURE_DIR . '/arca_cert.pem';
$keyPath  = $SECURE_DIR . '/arca_key.pem';
$caPath   = $SECURE_DIR . '/cacert.pem';

// WSDL local opcional
$constanciaWsdlLocal = $SECURE_DIR . '/constancia_inscripcion.wsdl';

// normalize
$certReal = realpath($certPath) ?: $certPath;
$keyReal  = realpath($keyPath) ?: $keyPath;
$caReal   = realpath($caPath) ?: $caPath;
$localWsdlReal = realpath($constanciaWsdlLocal) ?: $constanciaWsdlLocal;

// SSL
$sslVerify = true;
$caFile = (file_exists($caReal) && filesize($caReal) > 0) ? $caReal : '';

// ✅ servicio actual
$wsnConstancia = 'ws_sr_constancia_inscripcion';

return [
  'mode' => $mode,
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

  /**
   * Según el manual oficial actual de ws_sr_constancia_inscripcion,
   * el WSDL y endpoint siguen publicándose bajo personaServiceA5.
   */
  'constancia_inscripcion' => [
    'wsn' => $wsnConstancia,

    'homo_wsdl' => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5?WSDL',
    'prod_wsdl' => 'https://aws.arca.gov.ar/sr-padron/webservices/personaServiceA5?WSDL',

    'homo_endpoint' => 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
    'prod_endpoint' => 'https://aws.arca.gov.ar/sr-padron/webservices/personaServiceA5',

    'local_wsdl' => $localWsdlReal,
    'prefer_local_wsdl' => false,
  ],

  'wsaa_sign' => [
    'use_cli'      => true,
    'openssl_bin'  => 'openssl',
    'force_sha256' => true,
    'nodetach'     => true,
    'binary'       => true,
  ],
];