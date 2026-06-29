<?php
declare(strict_types=1);

final class ArcaWsfev1
{
    private SoapClient $client;
    private string $endpoint;
    private bool $sslVerify;
    private string $caFile;
    private bool $debugLog;
    private string $wsdlPath;

    public function __construct(
        string $wsfeWsdlPath,
        string $endpoint,
        bool $sslVerify = true,
        string $caFile = '',
        bool $debugLog = false
    ) {
        $this->endpoint  = $endpoint;
        $this->sslVerify = $sslVerify;
        $this->caFile    = $caFile;
        $this->debugLog  = $debugLog;
        $this->wsdlPath  = $wsfeWsdlPath;

        if (!extension_loaded('soap')) {
            throw new RuntimeException("Extensión SOAP no habilitada en PHP (extension=soap)");
        }

        if (!file_exists($wsfeWsdlPath)) {
            throw new RuntimeException("No existe WSDL WSFE local: $wsfeWsdlPath");
        }

        @ini_set('default_socket_timeout', '60');

        $this->assertTcpConnect($endpoint, 443, 8, $debugLog);

        try {
            $ctx = $this->buildStreamContext($sslVerify, $caFile, 'no_dh');
            $this->client = $this->makeSoapClient($wsfeWsdlPath, $endpoint, $ctx, $debugLog);
            if ($debugLog) {
                self::dbg('SoapClient WSFE OK intento #1 no_dh', [
                    'endpoint' => $endpoint,
                    'wsdl' => $wsfeWsdlPath,
                    'ssl_verify' => $sslVerify,
                    'ca_file' => $caFile,
                ]);
            }
            return;
        } catch (Throwable $e) {
            if ($debugLog) {
                self::dbg('SoapClient WSFE fallo intento #1 no_dh', [
                    'message' => $e->getMessage(),
                    'endpoint' => $endpoint,
                    'wsdl' => $wsfeWsdlPath,
                    'ssl_verify' => $sslVerify,
                ]);
            }
        }

        try {
            $ctx = $this->buildStreamContext($sslVerify, $caFile, 'seclevel1');
            $this->client = $this->makeSoapClient($wsfeWsdlPath, $endpoint, $ctx, $debugLog);
            if ($debugLog) {
                self::dbg('SoapClient WSFE OK intento #2 seclevel1', [
                    'endpoint' => $endpoint,
                    'wsdl' => $wsfeWsdlPath,
                    'ssl_verify' => $sslVerify,
                    'ca_file' => $caFile,
                ]);
            }
            return;
        } catch (Throwable $e2) {
            $msg = "No pude crear SoapClient WSFE. endpoint=$endpoint wsdl=$wsfeWsdlPath. Detalle: " . $e2->getMessage();
            if ($debugLog) {
                self::dbg('SoapClient WSFE error final', [
                    'message' => $msg,
                    'endpoint' => $endpoint,
                    'wsdl' => $wsfeWsdlPath,
                    'ssl_verify' => $sslVerify,
                ]);
            }
            throw new RuntimeException($msg);
        }
    }

    public static function emitirComprobante(array $cfg, array $comprobante): array
    {
        require_once __DIR__ . '/arca_wsaa.php';

        $mode = strtolower((string)($cfg['mode'] ?? 'prod'));
        if (!in_array($mode, ['homo', 'prod'], true)) {
            $mode = 'prod';
        }

        $wsaaWsdl = (string)($cfg['wsaa'][$mode] ?? '');
        if ($wsaaWsdl === '') {
            throw new RuntimeException('No se encontró WSDL WSAA.');
        }

        $wsfe = is_array($cfg['wsfe'] ?? null) ? $cfg['wsfe'] : [];
        $wsfeWsdl = (string)($wsfe[$mode . '_wsdl'] ?? '');
        $wsfeEndpoint = (string)($wsfe[$mode . '_endpoint'] ?? '');
        if ($wsfeWsdl === '' || $wsfeEndpoint === '') {
            throw new RuntimeException('Configuración WSFE incompleta.');
        }

        $sslVerifyWsaa = (bool)($cfg['wsaa_ssl_verify'] ?? $cfg['ssl_verify'] ?? true);
        $sslVerifyWsfe = (bool)($cfg['wsfe_ssl_verify'] ?? $cfg['ssl_verify'] ?? true);
        $caFile        = (string)($cfg['ca_file'] ?? '');
        $fallback      = (bool)($cfg['ssl_fallback_if_fail'] ?? false);
        $debugLog      = (bool)($cfg['debug_log'] ?? false);

        if ($debugLog) {
            self::dbg('WSAA LOGIN START', [
                'mode' => $mode,
                'wsaa_wsdl' => $wsaaWsdl,
                'cert_path' => $cfg['cert_path'] ?? '',
                'key_path' => $cfg['key_path'] ?? '',
                'cuit' => $cfg['cuit'] ?? '',
                'ssl_verify_wsaa' => $sslVerifyWsaa,
                'ssl_verify_wsfe' => $sslVerifyWsfe,
                'wsfe_wsdl' => $wsfeWsdl,
                'wsfe_endpoint' => $wsfeEndpoint,
            ]);
        }

        $cred = ArcaWsaa::login(
            $wsaaWsdl,
            'wsfe',
            (string)$cfg['cert_path'],
            (string)$cfg['key_path'],
            (string)($cfg['key_pass'] ?? ''),
            $sslVerifyWsaa,
            $caFile,
            $fallback,
            $debugLog,
            (string)($cfg['wsaa_sign']['openssl_bin'] ?? 'openssl')
        );

        if ($debugLog) {
            self::dbg('WSAA LOGIN OK', [
                'expirationTime' => $cred['expirationTime'] ?? '',
                'token_len' => strlen((string)($cred['token'] ?? '')),
                'sign_len' => strlen((string)($cred['sign'] ?? '')),
            ]);
        }

        $auth = self::authArray($cfg, $cred);

        $ptoVta   = (int)($comprobante['pto_vta'] ?? 0);
        $cbteTipo = (int)($comprobante['cbte_tipo'] ?? 0);

        if ($ptoVta <= 0) {
            throw new RuntimeException('Punto de venta inválido.');
        }
        if ($cbteTipo <= 0) {
            throw new RuntimeException('Tipo de comprobante inválido.');
        }

        $esNotaCredito = in_array($cbteTipo, [3, 8, 13], true);

        $cbtesAsoc = self::buildCbtesAsocArray($comprobante['cbtes_asoc'] ?? []);
        if ($esNotaCredito && empty($cbtesAsoc)) {
            throw new RuntimeException('Para una nota de crédito ARCA requiere CbtesAsoc con el comprobante original.');
        }

        $client = null;
        $firstError = null;
        $ultimo = 0;
        $wsfeClient = null;

        try {
            $wsfeClient = new self($wsfeWsdl, $wsfeEndpoint, $sslVerifyWsfe, $caFile, $debugLog);
            $client = $wsfeClient->getSoapClient();
            $ultimo = $wsfeClient->FECompUltimoAutorizado($auth, $ptoVta, $cbteTipo);
        } catch (Throwable $e) {
            $firstError = $e;

            if ($debugLog) {
                self::dbg('PRIMER INTENTO WSFE FALLÓ, REINTENTO ssl_verify=false', [
                    'message' => $e->getMessage(),
                ]);
            }

            $wsfeClient = new self($wsfeWsdl, $wsfeEndpoint, false, $caFile, $debugLog);
            $client = $wsfeClient->getSoapClient();
            $ultimo = $wsfeClient->FECompUltimoAutorizado($auth, $ptoVta, $cbteTipo);
        }

        $cbteDesde = $ultimo + 1;
        $cbteHasta = $cbteDesde;

        $impTotal   = self::n2($comprobante['imp_total']    ?? $comprobante['importe_total'] ?? 0);
        $impNeto    = self::n2($comprobante['imp_neto']     ?? 0);
        $impIva     = self::n2($comprobante['imp_iva']      ?? 0);
        $impOpEx    = self::n2($comprobante['imp_op_ex']    ?? 0);
        $impTrib    = self::n2($comprobante['imp_trib']     ?? 0);
        $impTotConc = self::n2($comprobante['imp_tot_conc'] ?? 0);

        $concepto   = (int)($comprobante['concepto'] ?? 1);
        $docTipo    = (int)($comprobante['doc_tipo'] ?? 99);
        $docNroRaw  = preg_replace('/\D+/', '', (string)($comprobante['doc_nro'] ?? 0));
        $docNro     = $docNroRaw === '' ? 0 : (int)$docNroRaw;
        $fechaRaw    = $comprobante['fecha_cbte'] ?? $comprobante['fecha_cbte_iso'] ?? null;
        $fechaCbte  = preg_replace('/\D+/', '', (string)($fechaRaw ?? ''));

        if (!preg_match('/^\d{8}$/', $fechaCbte)) {
            throw new RuntimeException('Fecha de comprobante obligatoria. Debe venir desde el modal en formato YYYYMMDD o AAAA-MM-DD.');
        }
        $fechaY = (int)substr($fechaCbte, 0, 4);
        $fechaM = (int)substr($fechaCbte, 4, 2);
        $fechaD = (int)substr($fechaCbte, 6, 2);
        if (!checkdate($fechaM, $fechaD, $fechaY)) {
            throw new RuntimeException('Fecha de comprobante inválida. Debe ser una fecha real.');
        }

        $detalle = [
            'Concepto'    => $concepto,
            'DocTipo'     => $docTipo,
            'DocNro'      => $docNro,
            'CbteDesde'   => $cbteDesde,
            'CbteHasta'   => $cbteHasta,
            'CbteFch'     => $fechaCbte,
            'ImpTotal'    => $impTotal,
            'ImpTotConc'  => $impTotConc,
            'ImpNeto'     => $impNeto,
            'ImpOpEx'     => $impOpEx,
            'ImpTrib'     => $impTrib,
            'ImpIVA'      => $impIva,
            'MonId'       => (string)($comprobante['mon_id'] ?? 'PES'),
            'MonCotiz'    => (float)($comprobante['mon_cotiz'] ?? 1),
        ];

        if (isset($comprobante['condicion_iva_receptor_id']) && (int)$comprobante['condicion_iva_receptor_id'] > 0) {
            $detalle['CondicionIVAReceptorId'] = (int)$comprobante['condicion_iva_receptor_id'];
        }

        if (in_array($concepto, [2, 3], true)) {
            $detalle['FchServDesde'] = preg_replace('/\D+/', '', (string)($comprobante['fch_serv_desde'] ?? $fechaCbte));
            $detalle['FchServHasta'] = preg_replace('/\D+/', '', (string)($comprobante['fch_serv_hasta'] ?? $fechaCbte));
            $detalle['FchVtoPago']   = preg_replace('/\D+/', '', (string)($comprobante['fch_vto_pago'] ?? $fechaCbte));
        }

        $ivas = self::buildIvaArray($comprobante['iva_items'] ?? []);
        if (!empty($ivas)) {
            $detalle['Iva'] = ['AlicIva' => $ivas];
        }

        $tributos = self::buildTributosArray($comprobante['tributos'] ?? []);
        if (!empty($tributos)) {
            $detalle['Tributos'] = ['Tributo' => $tributos];
        }

        $opcionales = self::buildOpcionalesArray($comprobante['opcionales'] ?? []);
        if (!empty($opcionales)) {
            $detalle['Opcionales'] = ['Opcional' => $opcionales];
        }

        if (!empty($cbtesAsoc)) {
            $detalle['CbtesAsoc'] = ['CbteAsoc' => $cbtesAsoc];
        }

        $request = [
            'FeCabReq' => [
                'CantReg'  => 1,
                'PtoVta'   => $ptoVta,
                'CbteTipo' => $cbteTipo,
            ],
            'FeDetReq' => [
                'FECAEDetRequest' => [$detalle],
            ],
        ];

        $raw = $wsfeClient->FECAESolicitar($auth, $request);

        $feCabResp = $raw['FeCabResp'] ?? [];
        $feDetResp = $raw['FeDetResp']['FECAEDetResponse'][0]
            ?? $raw['FeDetResp']['FECAEDetResponse']
            ?? [];

        $resultado = (string)($feCabResp['Resultado'] ?? $feDetResp['Resultado'] ?? '');
        $cae       = self::normalizeCodAut((string)($feDetResp['CAE'] ?? ''));
        $caeVto    = (string)($feDetResp['CAEFchVto'] ?? '');
        $nroCmp    = (int)($feDetResp['CbteDesde'] ?? $cbteDesde);

        $errores = self::normalizeEvents($raw['Errors']['Err'] ?? null);
        $events  = self::normalizeEvents($raw['Events']['Evt'] ?? null);
        $obs     = self::normalizeEvents($feDetResp['Observaciones']['Obs'] ?? null);

        if ($cae === '') {
            $msg = 'ARCA no devolvió CAE.';
            if (!empty($errores)) {
                $msg .= ' ' . self::flattenMessages($errores);
            } elseif (!empty($obs)) {
                $msg .= ' ' . self::flattenMessages($obs);
            }
            throw new RuntimeException(trim($msg));
        }

        $qr = self::buildQrData([
            'fecha'      => self::yyyyMMddToIso($fechaCbte),
            'cuit'       => (int)($cfg['cuit'] ?? 0),
            'ptoVta'     => $ptoVta,
            'tipoCmp'    => $cbteTipo,
            'nroCmp'     => $nroCmp,
            'importe'    => $impTotal,
            'moneda'     => (string)($comprobante['mon_id'] ?? 'PES'),
            'ctz'        => (float)($comprobante['mon_cotiz'] ?? 1),
            'tipoDocRec' => $docTipo,
            'nroDocRec'  => $docNro,
            'tipoCodAut' => 'E',
            'codAut'     => $cae,
        ]);

        if ($debugLog) {
            self::dbg('FECAESolicitar OK FINAL', [
                'pto_vta' => $ptoVta,
                'cbte_tipo' => $cbteTipo,
                'cbte_nro' => $nroCmp,
                'cae' => $cae,
                'cae_vto' => $caeVto,
                'resultado' => $resultado,
                'cbtes_asoc' => $cbtesAsoc,
                'first_error_if_any' => $firstError ? $firstError->getMessage() : null,
                'qr_url' => $qr['url'] ?? '',
            ]);
        }

        return [
            'ok' => true,
            'modo' => $mode,
            'auth' => [
                'cuit' => (int)($cfg['cuit'] ?? 0),
            ],
            'comprobante' => [
                'pto_vta'        => $ptoVta,
                'cbte_tipo'      => $cbteTipo,
                'cbte_nro'       => $nroCmp,
                'resultado'      => $resultado,
                'cae'            => $cae,
                'cae_vto'        => $caeVto,
                'fecha_cbte'     => self::yyyyMMddToIso($fechaCbte),
                'doc_tipo'       => $docTipo,
                'doc_nro'        => (string)$docNro,
                'imp_total'      => $impTotal,
                'imp_neto'       => $impNeto,
                'imp_iva'        => $impIva,
                'mon_id'         => (string)($comprobante['mon_id'] ?? 'PES'),
                'mon_cotiz'      => (float)($comprobante['mon_cotiz'] ?? 1),
                'cbtes_asoc'     => $cbtesAsoc,
            ],
            'qr' => $qr,
            'errores' => $errores,
            'observaciones' => $obs,
            'eventos' => $events,
            'raw_min' => [
                'cab' => $feCabResp,
                'det' => $feDetResp,
            ],
        ];
    }

    public static function authArray(array $cfg, array $cred): array
    {
        $cuit = (int)($cfg['cuit'] ?? 0);
        if ($cuit <= 0) {
            throw new RuntimeException('CUIT representada inválida en configuración ARCA.');
        }

        return [
            'Token' => (string)($cred['token'] ?? ''),
            'Sign'  => (string)($cred['sign'] ?? ''),
            'Cuit'  => $cuit,
        ];
    }

    public function getSoapClient(): SoapClient
    {
        return $this->client;
    }

    public function dummy(): array
    {
        $resp = $this->client->__soapCall('FEDummy', []);
        return self::toArray($resp);
    }

    public function FECompUltimoAutorizado(array $auth, int $ptoVta, int $cbteTipo): int
    {
        if ($this->debugLog) {
            self::dbg('FECompUltimoAutorizado REQUEST', [
                'PtoVta' => $ptoVta,
                'CbteTipo' => $cbteTipo,
                'AuthCuit' => $auth['Cuit'] ?? null,
            ]);
        }

        try {
            $resp = $this->client->__soapCall('FECompUltimoAutorizado', [[
                'Auth'     => $auth,
                'PtoVta'   => $ptoVta,
                'CbteTipo' => $cbteTipo,
            ]]);
        } catch (Throwable $e) {
            if ($this->debugLog) {
                self::dbg('FECompUltimoAutorizado ERROR', [
                    'message' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                    'last_request' => $this->safeLastRequest(),
                    'last_response' => $this->safeLastResponse(),
                ]);
            }
            throw new RuntimeException("SOAP FECompUltimoAutorizado error: " . $e->getMessage());
        }

        $r = $resp->FECompUltimoAutorizadoResult ?? null;
        if (!$r) {
            if ($this->debugLog) {
                self::dbg('FECompUltimoAutorizado SIN RESULT', [
                    'raw_response' => self::toArray($resp),
                    'last_request' => $this->safeLastRequest(),
                    'last_response' => $this->safeLastResponse(),
                ]);
            }
            throw new RuntimeException("WSFE sin FECompUltimoAutorizadoResult");
        }

        if (!empty($r->Errors)) {
            $msg = self::formatErrors($r->Errors);
            if ($this->debugLog) {
                self::dbg('FECompUltimoAutorizado ERRORS', [
                    'errors' => self::toArray($r->Errors),
                    'last_request' => $this->safeLastRequest(),
                    'last_response' => $this->safeLastResponse(),
                ]);
            }
            throw new RuntimeException("WSFE Error (FECompUltimoAutorizado): " . $msg);
        }

        $arr = self::toArray($r);

        if ($this->debugLog) {
            self::dbg('FECompUltimoAutorizado RESPONSE', [
                'response' => $arr,
            ]);
        }

        return max(0, (int)($arr['CbteNro'] ?? 0));
    }

    public function FECAESolicitar(array $auth, array $feCAEReq): array
    {
        if ($this->debugLog) {
            self::dbg('FECAESolicitar REQUEST', [
                'payload' => $feCAEReq,
                'auth_cuit' => $auth['Cuit'] ?? null,
            ]);
        }

        try {
            $resp = $this->client->__soapCall('FECAESolicitar', [[
                'Auth'     => $auth,
                'FeCAEReq' => $feCAEReq,
            ]]);
        } catch (Throwable $e) {
            if ($this->debugLog) {
                self::dbg('FECAESolicitar ERROR', [
                    'message' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                    'last_request' => $this->safeLastRequest(),
                    'last_response' => $this->safeLastResponse(),
                ]);
            }
            throw new RuntimeException("SOAP FECAESolicitar error: " . $e->getMessage());
        }

        $r = $resp->FECAESolicitarResult ?? null;
        if (!$r) {
            if ($this->debugLog) {
                self::dbg('FECAESolicitar SIN RESULT', [
                    'raw_response' => self::toArray($resp),
                    'last_request' => $this->safeLastRequest(),
                    'last_response' => $this->safeLastResponse(),
                ]);
            }
            throw new RuntimeException("WSFE sin FECAESolicitarResult");
        }

        if (!empty($r->Errors)) {
            $msg = self::formatErrors($r->Errors);
            if ($this->debugLog) {
                self::dbg('FECAESolicitar ERRORS', [
                    'errors' => self::toArray($r->Errors),
                    'last_request' => $this->safeLastRequest(),
                    'last_response' => $this->safeLastResponse(),
                ]);
            }
            throw new RuntimeException("WSFE Error (FECAESolicitar): " . $msg);
        }

        $arr = self::toArray($r);

        if ($this->debugLog) {
            self::dbg('FECAESolicitar RESPONSE', [
                'response' => $arr,
                'last_request' => $this->safeLastRequest(),
                'last_response' => $this->safeLastResponse(),
            ]);
        }

        return $arr;
    }

    private function makeSoapClient(string $wsdlPath, string $endpoint, $ctx, bool $debugLog): SoapClient
    {
        try {
            return new SoapClient($wsdlPath, [
                'soap_version'       => SOAP_1_1,
                'exceptions'         => true,
                'trace'              => true,
                'cache_wsdl'         => WSDL_CACHE_NONE,
                'connection_timeout' => 60,
                'stream_context'     => $ctx,
                'features'           => SOAP_SINGLE_ELEMENT_ARRAYS,
                'user_agent'         => 'Mozilla/5.0 (PHP SoapClient)',
                'location'           => $endpoint,
                'keep_alive'         => false,
                'compression'        => SOAP_COMPRESSION_ACCEPT | SOAP_COMPRESSION_GZIP,
            ]);
        } catch (Throwable $e) {
            throw new RuntimeException("SoapClient init error: " . $e->getMessage());
        }
    }

    private function buildStreamContext(bool $sslVerify, string $caFile, string $profile)
    {
        $ssl = [
            'verify_peer'       => $sslVerify,
            'verify_peer_name'  => $sslVerify,
            'allow_self_signed' => !$sslVerify,
            'SNI_enabled'       => true,
            'crypto_method'     => STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT,
        ];

        if ($sslVerify && $caFile !== '' && file_exists($caFile)) {
            $ssl['cafile'] = $caFile;
        }

        if ($profile === 'no_dh') {
            $ssl['ciphers'] = 'ECDHE+AESGCM:ECDHE+CHACHA20:ECDHE+AES256:ECDHE+AES128:!DHE:!DH:!aNULL:!eNULL:!MD5:!RC4';
        } elseif ($profile === 'seclevel1') {
            $ssl['ciphers'] = 'DEFAULT:@SECLEVEL=1';
        }

        $http = [
            'header'  => "Connection: close\r\n",
            'timeout' => 60,
        ];

        return stream_context_create([
            'ssl'  => $ssl,
            'http' => $http,
        ]);
    }

    private function assertTcpConnect(string $url, int $port, int $timeoutSec, bool $debugLog): void
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (!$host) {
            throw new RuntimeException("Endpoint inválido (no puedo obtener host): $url");
        }

        $errNo = 0;
        $errStr = '';
        $fp = @fsockopen($host, $port, $errNo, $errStr, $timeoutSec);
        if (!$fp) {
            $msg = "No puedo conectar TCP a $host:$port (endpoint=$url). errno=$errNo err=$errStr";
            if ($debugLog) {
                self::dbg('TCP CONNECT ERROR', [
                    'message' => $msg,
                    'host' => $host,
                    'port' => $port,
                    'endpoint' => $url,
                ]);
            }
            throw new RuntimeException($msg);
        }
        fclose($fp);

        if ($debugLog) {
            self::dbg('TCP CONNECT OK', [
                'host' => $host,
                'port' => $port,
                'endpoint' => $url,
            ]);
        }
    }

    /**
     * Arma el payload del QR según la especificación oficial de ARCA.
     *
     * FIXES aplicados:
     * - codAut se envía como INTEGER (no string). ARCA parsea el JSON del QR
     *   y espera que codAut sea un número para poder autocompletar el campo
     *   "Número de CAE" en su web. Si llega como string, lo ignora o no lo mapea.
     * - importe se redondea a 2 decimales con cast float explícito.
     * - ctz se envía siempre como float.
     * - tipoDocRec y nroDocRec se omiten si doc_tipo es 99 (consumidor final)
     *   o si nroDocRec es 0, siguiendo la spec oficial.
     */
    public static function buildQrData(array $in): array
    {
        $tipoDocRec = (int)($in['tipoDocRec'] ?? 0);
        $nroDocRec  = (int)($in['nroDocRec'] ?? 0);

        // normalizeCodAut devuelve string de 14 dígitos; lo convertimos a int
        // para que json_encode lo serialice como número y ARCA pueda leerlo.
        $codAutStr = self::normalizeCodAut((string)$in['codAut']);

        if (!preg_match('/^\d{14}$/', $codAutStr)) {
            throw new RuntimeException('CAE inválido para QR. Debe tener 14 dígitos.');
        }

        // PHP_INT_MAX en 64-bit es 9223372036854775807, mayor que 99999999999999
        // (14 dígitos), por lo que la conversión a int es segura en cualquier
        // servidor de 64 bits. En 32 bits usamos string como fallback.
        $codAutValue = PHP_INT_SIZE >= 8
            ? (int)$codAutStr
            : $codAutStr; // fallback: en 32-bit dejamos string (poco probable en producción)

        $payload = [
            'ver'        => 1,
            'fecha'      => (string)$in['fecha'],
            'cuit'       => (int)$in['cuit'],
            'ptoVta'     => (int)$in['ptoVta'],
            'tipoCmp'    => (int)$in['tipoCmp'],
            'nroCmp'     => (int)$in['nroCmp'],
            'importe'    => round((float)$in['importe'], 2),
            'moneda'     => (string)$in['moneda'],
            'ctz'        => (float)$in['ctz'],
            'tipoCodAut' => (string)$in['tipoCodAut'],
            'codAut'     => $codAutValue,  // ← FIX: integer, no string
        ];

        // Solo incluir datos del receptor si no es consumidor final (doc_tipo != 99)
        // y tiene número de documento válido.
        if ($tipoDocRec > 0 && $tipoDocRec !== 99 && $nroDocRec > 0) {
            $payload['tipoDocRec'] = $tipoDocRec;
            $payload['nroDocRec']  = $nroDocRec;
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('No se pudo generar el JSON del QR.');
        }

        $b64 = base64_encode($json);
        $url = 'https://www.arca.gob.ar/fe/qr/?p=' . rawurlencode($b64);

        return [
            'payload' => $payload,
            'json'    => $json,
            'base64'  => $b64,
            'url'     => $url,
        ];
    }

    private static function normalizeCodAut(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value);
        $digits = $digits ?? '';

        if ($digits === '') {
            return '';
        }

        if (strlen($digits) < 14) {
            $digits = str_pad($digits, 14, '0', STR_PAD_LEFT);
        }

        if (strlen($digits) > 14) {
            $digits = substr($digits, 0, 14);
        }

        return $digits;
    }

    private static function buildIvaArray($items): array
    {
        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }

            $id = (int)($it['id'] ?? 0);
            $baseImp = self::n2($it['base_imp'] ?? $it['BaseImp'] ?? 0);
            $importe = self::n2($it['importe'] ?? $it['Importe'] ?? 0);

            if ($id <= 0) {
                continue;
            }

            $out[] = [
                'Id'      => $id,
                'BaseImp' => $baseImp,
                'Importe' => $importe,
            ];
        }

        return $out;
    }

    private static function buildTributosArray($items): array
    {
        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }

            $id = (int)($it['id'] ?? 0);
            if ($id <= 0) {
                continue;
            }

            $out[] = [
                'Id'       => $id,
                'Desc'     => (string)($it['desc'] ?? ''),
                'BaseImp'  => self::n2($it['base_imp'] ?? 0),
                'Alic'     => self::n2($it['alic'] ?? 0),
                'Importe'  => self::n2($it['importe'] ?? 0),
            ];
        }

        return $out;
    }

    private static function buildOpcionalesArray($items): array
    {
        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }

            $id = (string)($it['id'] ?? '');
            $valor = (string)($it['valor'] ?? '');

            if ($id === '' || $valor === '') {
                continue;
            }

            $out[] = [
                'Id'    => $id,
                'Valor' => $valor,
            ];
        }

        return $out;
    }

    private static function buildCbtesAsocArray($items): array
    {
        if (!is_array($items)) {
            return [];
        }

        $out = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }

            $tipo   = (int)($it['tipo'] ?? $it['Tipo'] ?? 0);
            $ptoVta = (int)($it['pto_vta'] ?? $it['PtoVta'] ?? 0);
            $nro    = (int)($it['nro'] ?? $it['Nro'] ?? 0);
            $cuit   = preg_replace('/\D+/', '', (string)($it['cuit'] ?? $it['Cuit'] ?? ''));
            $fecha  = preg_replace('/\D+/', '', (string)($it['fecha'] ?? $it['CbteFch'] ?? ''));

            if ($tipo <= 0 || $ptoVta <= 0 || $nro <= 0) {
                continue;
            }

            $row = [
                'Tipo'   => $tipo,
                'PtoVta' => $ptoVta,
                'Nro'    => $nro,
            ];

            if ($cuit !== '' && strlen($cuit) === 11) {
                $row['Cuit'] = $cuit;
            }

            if ($fecha !== '' && preg_match('/^\d{8}$/', $fecha)) {
                $row['CbteFch'] = $fecha;
            }

            $out[] = $row;
        }

        return $out;
    }

    private static function n2($v): float
    {
        return round((float)$v, 2);
    }

    private static function yyyyMMddToIso(string $v): string
    {
        $v = preg_replace('/\D+/', '', $v);
        if (!preg_match('/^\d{8}$/', $v)) {
            return '';
        }
        return substr($v, 0, 4) . '-' . substr($v, 4, 2) . '-' . substr($v, 6, 2);
    }

    private static function normalizeEvents($items): array
    {
        if ($items === null || $items === '') {
            return [];
        }

        if (is_array($items) && array_keys($items) !== range(0, count($items) - 1)) {
            return [$items];
        }

        return is_array($items) ? $items : [];
    }

    private static function flattenMessages(array $items): string
    {
        $parts = [];
        foreach ($items as $it) {
            if (!is_array($it)) {
                continue;
            }
            $code = (string)($it['Code'] ?? $it['code'] ?? '');
            $msg  = (string)($it['Msg'] ?? $it['msg'] ?? '');
            $parts[] = trim(($code !== '' ? '[' . $code . '] ' : '') . $msg);
        }
        return trim(implode(' | ', array_filter($parts)));
    }

    private static function toArray($value): array
    {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $arr = json_decode((string)$json, true);
        return is_array($arr) ? $arr : [];
    }

    private static function formatErrors($errors): string
    {
        $arr = self::toArray($errors);
        $items = $arr['Err'] ?? $arr ?? [];
        if (isset($items['Code']) || isset($items['Msg'])) {
            $items = [$items];
        }

        $out = [];
        foreach ((array)$items as $e) {
            $code = $e['Code'] ?? '';
            $msg  = $e['Msg'] ?? '';
            $out[] = trim("$code $msg");
        }
        return implode(' | ', array_filter($out));
    }

    private function safeLastRequest(): string
    {
        try {
            return method_exists($this->client, '__getLastRequest') ? (string)$this->client->__getLastRequest() : '';
        } catch (Throwable $e) {
            return '';
        }
    }

    private function safeLastResponse(): string
    {
        try {
            return method_exists($this->client, '__getLastResponse') ? (string)$this->client->__getLastResponse() : '';
        } catch (Throwable $e) {
            return '';
        }
    }

    private static function dbg(string $title, array $context = []): void
    {
        // Logger desactivado intencionalmente.
    }
}