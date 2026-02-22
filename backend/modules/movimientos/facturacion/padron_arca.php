<?php
declare(strict_types=1);

final class ArcaPadronA5
{
  private SoapClient $client;
  private string $endpoint;
  private bool $debugLog;

  public function __construct(
    string $wsdl,
    string $endpoint,
    bool $sslVerify = true,
    string $caFile = '',
    bool $debugLog = false
  ) {
    $this->endpoint = $endpoint;
    $this->debugLog = $debugLog;

    if (!extension_loaded('soap')) throw new RuntimeException("Extensión SOAP no habilitada (extension=soap)");

    $ssl = [
      'verify_peer' => $sslVerify,
      'verify_peer_name' => $sslVerify,
      'allow_self_signed' => !$sslVerify,
      'SNI_enabled' => true,
      // padron suele ir OK con TLS 1.2
      'crypto_method' => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT,
    ];
    if ($sslVerify && $caFile !== '' && file_exists($caFile)) $ssl['cafile'] = $caFile;

    $ctx = stream_context_create(['ssl' => $ssl, 'http' => ['header' => "Connection: close\r\n", 'timeout' => 60]]);

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

  /**
   * Consulta CUIT en padrón A5.
   * Devuelve el array parseado (crudo), y vos en el controller decidís qué campos mostrar.
   */
  public function getPersona(array $auth, int $cuitConsultado): array
  {
    // Algunos WSDL exponen getPersona, otros getPersona_v2.
    // Probamos getPersona primero.
    try {
      $resp = $this->client->__soapCall('getPersona', [[
        'token' => $auth['Token'] ?? $auth['token'] ?? '',
        'sign'  => $auth['Sign']  ?? $auth['sign']  ?? '',
        'cuitRepresentada' => (int)($auth['Cuit'] ?? $auth['cuit'] ?? 0),
        'idPersona' => $cuitConsultado,
      ]]);
      return json_decode(json_encode($resp), true) ?: [];
    } catch (Throwable $e1) {
      if ($this->debugLog) error_log("[ARCA PADRON] getPersona falló, intento getPersona_v2: " . $e1->getMessage());
    }

    try {
      $resp = $this->client->__soapCall('getPersona_v2', [[
        'token' => $auth['Token'] ?? $auth['token'] ?? '',
        'sign'  => $auth['Sign']  ?? $auth['sign']  ?? '',
        'cuitRepresentada' => (int)($auth['Cuit'] ?? $auth['cuit'] ?? 0),
        'idPersona' => $cuitConsultado,
      ]]);
      return json_decode(json_encode($resp), true) ?: [];
    } catch (Throwable $e2) {
      throw new RuntimeException("SOAP padrón A5 error (getPersona/getPersona_v2): " . $e2->getMessage());
    }
  }
}