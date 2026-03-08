<?php
declare(strict_types=1);

final class ArcaConstanciaInscripcion
{
  private SoapClient $client;
  private bool $debugLog;

  public function __construct(
    string $wsdl,
    string $endpoint,
    bool $sslVerify = true,
    string $caFile = '',
    bool $debugLog = false
  ) {
    $this->debugLog = $debugLog;

    if (!extension_loaded('soap')) {
      throw new RuntimeException("Extensión SOAP no habilitada (extension=soap)");
    }

    $ssl = [
      'verify_peer' => $sslVerify,
      'verify_peer_name' => $sslVerify,
      'allow_self_signed' => !$sslVerify,
      'SNI_enabled' => true,
      'crypto_method' => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT,
    ];

    if ($sslVerify && $caFile !== '' && file_exists($caFile)) {
      $ssl['cafile'] = $caFile;
    }

    $ctx = stream_context_create([
      'ssl' => $ssl,
      'http' => [
        'header' => "Connection: close\r\n",
        'timeout' => 60,
      ],
    ]);

    $this->client = new SoapClient($wsdl, [
      'soap_version' => SOAP_1_1,
      'exceptions' => true,
      'trace' => $debugLog,
      'cache_wsdl' => WSDL_CACHE_NONE,
      'connection_timeout' => 60,
      'stream_context' => $ctx,
      'features' => SOAP_SINGLE_ELEMENT_ARRAYS,
      'user_agent' => 'Mozilla/5.0 (PHP SoapClient)',
      'location' => $endpoint,
    ]);
  }

  public function dummy(): array
  {
    $resp = $this->client->__soapCall('dummy', [[]]);
    return json_decode(json_encode($resp), true) ?: [];
  }

  /**
   * Consulta una CUIT usando el método recomendado getPersona_v2.
   */
  public function getPersonaV2(array $auth, int $cuitConsultado): array
  {
    try {
      $resp = $this->client->__soapCall('getPersona_v2', [[
        'token' => $auth['Token'] ?? $auth['token'] ?? '',
        'sign'  => $auth['Sign'] ?? $auth['sign'] ?? '',
        'cuitRepresentada' => (int)($auth['Cuit'] ?? $auth['cuit'] ?? 0),
        'idPersona' => $cuitConsultado,
      ]]);

      return json_decode(json_encode($resp), true) ?: [];
    } catch (Throwable $e1) {
      if ($this->debugLog) {
        error_log("[ARCA CONSTANCIA] getPersona_v2 falló, intento compat getPersona: " . $e1->getMessage());
      }
    }

    // fallback de compatibilidad
    try {
      $resp = $this->client->__soapCall('getPersona', [[
        'token' => $auth['Token'] ?? $auth['token'] ?? '',
        'sign'  => $auth['Sign'] ?? $auth['sign'] ?? '',
        'cuitRepresentada' => (int)($auth['Cuit'] ?? $auth['cuit'] ?? 0),
        'idPersona' => $cuitConsultado,
      ]]);

      return json_decode(json_encode($resp), true) ?: [];
    } catch (Throwable $e2) {
      throw new RuntimeException("SOAP constancia inscripción error (getPersona_v2/getPersona): " . $e2->getMessage());
    }
  }
}