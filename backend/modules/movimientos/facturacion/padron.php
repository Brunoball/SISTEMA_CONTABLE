<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

/* =========================================================
   JSON helpers
========================================================= */
if (!function_exists('json_ok')) {
    function json_ok(array $data = array(), int $code = 200): void
    {
        http_response_code($code);
        echo json_encode(
            array(
                'ok' => true,
                'data' => $data,
            ),
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }
}

if (!function_exists('json_error')) {
    function json_error(string $msg, int $code = 400, $extra = null): void
    {
        http_response_code($code);

        $out = array(
            'ok'    => false,
            'error' => $msg,
        );

        if ($extra !== null) {
            $out['extra'] = $extra;
        }

        echo json_encode($out, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

/* =========================================================
   Utils
========================================================= */
if (!function_exists('only_digits')) {
    function only_digits($v): string
    {
        $out = preg_replace('/\D+/', '', (string)$v);
        return $out ?? '';
    }
}

if (!function_exists('arr_get')) {
    function arr_get($arr, string $path, $default = null)
    {
        $cur = $arr;
        foreach (explode('.', $path) as $segment) {
            if (!is_array($cur) || !array_key_exists($segment, $cur)) {
                return $default;
            }
            $cur = $cur[$segment];
        }
        return $cur;
    }
}

if (!function_exists('normalize_array')) {
    function normalize_array($value): array
    {
        if ($value === null || $value === '') {
            return array();
        }

        if (is_array($value)) {
            $isAssoc = array_keys($value) !== range(0, count($value) - 1);
            return $isAssoc ? array($value) : $value;
        }

        return array($value);
    }
}

if (!function_exists('clean_str')) {
    function clean_str($v): ?string
    {
        if ($v === null) {
            return null;
        }

        if (is_bool($v)) {
            return $v ? 'true' : 'false';
        }

        if (!is_scalar($v)) {
            return null;
        }

        $s = trim((string)$v);
        return $s === '' ? null : $s;
    }
}

/* =========================================================
   Tenant / paths privados
========================================================= */
if (!function_exists('get_request_headers_fallback')) {
    function get_request_headers_fallback(): array
    {
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            return is_array($headers) ? $headers : array();
        }

        $headers = array();
        foreach ($_SERVER as $key => $value) {
            if (strpos($key, 'HTTP_') === 0) {
                $name = str_replace('_', '-', substr($key, 5));
                $headers[$name] = $value;
            }
        }
        return $headers;
    }
}

if (!function_exists('header_value_ci')) {
    function header_value_ci(string $name): string
    {
        $headers = get_request_headers_fallback();

        foreach ($headers as $k => $v) {
            if (strcasecmp((string)$k, $name) === 0) {
                return trim((string)$v);
            }
        }

        return '';
    }
}

if (!function_exists('try_start_session_if_needed')) {
    function try_start_session_if_needed(): void
    {
        if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
            @session_start();
        }
    }
}

if (!function_exists('resolve_current_tenant_id')) {
    function resolve_current_tenant_id(): int
    {
        $candidates = array();

        // Fuente segura: sesión master validada por backend/routes/api.php.
        // NO tomar X-IdTenant del frontend para no permitir elegir otra carpeta ARCA.
        $candidates[] = $GLOBALS['AUTH_TENANT_ID'] ?? '';

        if (isset($GLOBALS['SESSION_MASTER']) && is_array($GLOBALS['SESSION_MASTER'])) {
            $candidates[] = $GLOBALS['SESSION_MASTER']['idTenant'] ?? '';
            $candidates[] = $GLOBALS['SESSION_MASTER']['id_tenant'] ?? '';
            $candidates[] = $GLOBALS['SESSION_MASTER']['tenant_id'] ?? '';
        }

        // Globals por si el tenant_resolver ya cargó el tenant.
        if (isset($GLOBALS['tenant']) && is_array($GLOBALS['tenant'])) {
            $candidates[] = $GLOBALS['tenant']['idTenant'] ?? '';
            $candidates[] = $GLOBALS['tenant']['id_tenant'] ?? '';
            $candidates[] = $GLOBALS['tenant']['tenant_id'] ?? '';
        }

        if (isset($GLOBALS['currentTenant']) && is_array($GLOBALS['currentTenant'])) {
            $candidates[] = $GLOBALS['currentTenant']['idTenant'] ?? '';
            $candidates[] = $GLOBALS['currentTenant']['id_tenant'] ?? '';
            $candidates[] = $GLOBALS['currentTenant']['tenant_id'] ?? '';
        }

        // Sesión PHP seteada luego de validar X-Session.
        try_start_session_if_needed();

        if (isset($_SESSION) && is_array($_SESSION)) {
            $candidates[] = $_SESSION['idTenant'] ?? '';
            $candidates[] = $_SESSION['id_tenant'] ?? '';
            $candidates[] = $_SESSION['tenant_id'] ?? '';
        }

        foreach ($candidates as $candidate) {
            $digits = only_digits((string)$candidate);
            if ($digits !== '') {
                $id = (int)$digits;
                if ($id > 0) {
                    return $id;
                }
            }
        }

        return 0;
    }
}

if (!function_exists('resolve_balto_private_root')) {
    function resolve_balto_private_root(): string
    {
        $env = getenv('BALTO_PRIVATE_ROOT');
        if ($env !== false && trim((string)$env) !== '') {
            return rtrim(trim((string)$env), '/\\');
        }

        /*
         * Estructura esperada:
         * /home/USER/domains/DOMINIO/public_html/BALTO/api/modules/movimientos/facturacion/padron.php
         * Queremos:
         * /home/USER/domains/DOMINIO/balto_private
         */

        $dir = __DIR__;
        $facturacion = realpath($dir) ?: $dir;
        $movimientos = dirname($facturacion);
        $modules     = dirname($movimientos);
        $api         = dirname($modules);
        $baltoRoot   = dirname($api);          // .../public_html/BALTO
        $publicHtml  = dirname($baltoRoot);    // .../public_html
        $domainRoot  = dirname($publicHtml);   // .../domains/mi-dominio

        return rtrim($domainRoot, '/\\') . '/balto_private';
    }
}

if (!function_exists('resolve_tenant_secure_dir')) {
    function resolve_tenant_secure_dir(int $tenantId): string
    {
        if ($tenantId <= 0) {
            throw new RuntimeException('No se pudo resolver el idTenant actual.');
        }

        $privateRoot = resolve_balto_private_root();
        $baseDir = $privateRoot . '/balto_arca_clientes';
        $tenantDir = $baseDir . '/t_' . $tenantId;

        $realBase = realpath($baseDir);
        $realTenant = realpath($tenantDir);

        if ($realBase === false || !is_dir($realBase)) {
            throw new RuntimeException('No existe la carpeta base privada: ' . $baseDir);
        }

        if ($realTenant === false || !is_dir($realTenant)) {
            throw new RuntimeException('No existe la carpeta privada del tenant: ' . $tenantDir);
        }

        $realBaseNorm = rtrim(str_replace('\\', '/', $realBase), '/') . '/';
        $realTenantNorm = rtrim(str_replace('\\', '/', $realTenant), '/') . '/';

        if (strpos($realTenantNorm, $realBaseNorm) !== 0) {
            throw new RuntimeException('Ruta privada inválida del tenant.');
        }

        return rtrim($realTenant, '/\\');
    }
}


if (!function_exists('resolve_config_facturacion_emisor_cuit')) {
    function resolve_config_facturacion_emisor_cuit(?PDO $pdo): string
    {
        $idConfig = (int)($_GET['id_config_facturacion'] ?? $_GET['idConfigFacturacion'] ?? 0);
        $cuit = only_digits($_GET['cuit_emisor'] ?? $_GET['arca_cuit'] ?? $_GET['cuit_config'] ?? '');

        if (!$pdo instanceof PDO) {
            return strlen($cuit) === 11 ? $cuit : '';
        }

        $params = array();
        $whereExtra = '';
        if ($idConfig > 0) {
            $whereExtra = ' AND idConfigFacturacion = :idConfig ';
            $params[':idConfig'] = $idConfig;
        } elseif (strlen($cuit) === 11) {
            $whereExtra = ' AND REPLACE(REPLACE(cuit, \'-\', \'\'), \' \', \'\') = :cuit ';
            $params[':cuit'] = $cuit;
        }

        $sql = "
            SELECT cuit
            FROM config_facturacion
            WHERE activo = 1
            {$whereExtra}
            ORDER BY idConfigFacturacion DESC
            LIMIT 1
        ";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rowCuit = only_digits((string)($st->fetchColumn() ?: ''));

        if ($rowCuit === '') {
            if ($idConfig > 0) {
                throw new RuntimeException('No existe una configuración de facturación activa con ese ID.');
            }
            if (strlen($cuit) === 11) {
                throw new RuntimeException('No existe una configuración de facturación activa para el CUIT emisor seleccionado.');
            }
        }

        return strlen($rowCuit) === 11 ? $rowCuit : '';
    }
}

if (!function_exists('read_cuit_from_secure_dir')) {
    function read_cuit_from_secure_dir(string $dir): string
    {
        $cuitFile = rtrim($dir, '/\\') . '/arca_cuit.txt';
        if (is_file($cuitFile)) {
            $digits = only_digits(trim((string)@file_get_contents($cuitFile)));
            if (strlen($digits) === 11) {
                return $digits;
            }
        }

        return extract_cuit_from_cert(rtrim($dir, '/\\') . '/arca_cert.pem');
    }
}

if (!function_exists('resolve_tenant_account_secure_dir')) {
    function resolve_tenant_account_secure_dir(int $tenantId, string $cuitEmisor = ''): string
    {
        $tenantDir = resolve_tenant_secure_dir($tenantId);
        $cuitEmisor = only_digits($cuitEmisor);

        if ($cuitEmisor === '') {
            return $tenantDir;
        }

        foreach (array($cuitEmisor, 'cuit_' . $cuitEmisor, 'CUIT_' . $cuitEmisor) as $name) {
            $dir = $tenantDir . '/' . $name;
            if (is_dir($dir)) {
                $realTenant = realpath($tenantDir);
                $realDir = realpath($dir);
                if ($realTenant === false || $realDir === false) {
                    continue;
                }
                $tenantNorm = rtrim(str_replace('\\', '/', $realTenant), '/') . '/';
                $dirNorm = rtrim(str_replace('\\', '/', $realDir), '/') . '/';
                if (strpos($dirNorm, $tenantNorm) !== 0) {
                    throw new RuntimeException('Ruta privada inválida para la cuenta fiscal.');
                }
                return rtrim($realDir, '/\\');
            }
        }

        $legacyCuit = read_cuit_from_secure_dir($tenantDir);
        if ($legacyCuit !== '' && $legacyCuit === $cuitEmisor) {
            return $tenantDir;
        }

        throw new RuntimeException(
            'No existe carpeta privada ARCA para el CUIT emisor ' . $cuitEmisor .
            '. Creá la carpeta ' . $tenantDir . '/' . $cuitEmisor . ' con los certificados y WSDL correspondientes.'
        );
    }
}

/* =========================================================
   Key / cert helpers
========================================================= */
if (!function_exists('key_is_encrypted')) {
    function key_is_encrypted(string $keyPath): bool
    {
        if (!is_file($keyPath)) {
            return false;
        }

        $txt = (string)@file_get_contents($keyPath);
        if ($txt === '') {
            return false;
        }

        $u = strtoupper($txt);

        if (strpos($u, 'BEGIN ENCRYPTED PRIVATE KEY') !== false) {
            return true;
        }

        if (strpos($u, 'BEGIN RSA PRIVATE KEY') !== false && strpos($u, 'ENCRYPTED') !== false) {
            return true;
        }

        return false;
    }
}

if (!function_exists('load_key_pass')) {
    function load_key_pass(string $secureDir, string $keyPath): string
    {
        // Multi-tenant: la pass debe estar dentro de la carpeta privada del tenant.
        $passFile = $secureDir . '/arca_key.pass';
        if (is_file($passFile)) {
            $txt = trim((string)@file_get_contents($passFile));
            if ($txt !== '') {
                return $txt;
            }
        }

        // Fallback global solo si se habilita explícitamente para pruebas/local.
        $allowGlobalArcaEnv = (string)(getenv('BALTO_ALLOW_GLOBAL_ARCA_ENV') ?: '');
        if ($allowGlobalArcaEnv === '1') {
            $env = getenv('ARCA_KEY_PASS');
            if ($env !== false && trim((string)$env) !== '') {
                return trim((string)$env);
            }
        }

        if (!key_is_encrypted($keyPath)) {
            return '';
        }

        return '__MISSING__';
    }
}

if (!function_exists('extract_cuit_from_cert')) {
    function extract_cuit_from_cert(string $certPath): string
    {
        $certContent = (string)@file_get_contents($certPath);
        if ($certContent === '') {
            return '';
        }

        $certData = @openssl_x509_parse($certContent);
        if (!is_array($certData)) {
            return '';
        }

        $candidates = array(
            $certData['subject']['serialNumber'] ?? '',
            $certData['subject']['CN'] ?? '',
            $certData['subject']['O'] ?? '',
        );

        foreach ($candidates as $field) {
            $d = only_digits($field);
            if (strlen($d) === 11) {
                return $d;
            }
        }

        return '';
    }
}

/* =========================================================
   ARCA response mappers
========================================================= */
if (!function_exists('map_condicion_iva')) {
    function map_condicion_iva(array $resp): ?string
    {
        $impuestos = array();
        $candidatos = array(
            'personaReturn.datosRegimenGeneral.impuesto',
            'personaReturn.datosMonotributo.impuesto',
            'personaReturn.impuesto',
        );

        foreach ($candidatos as $path) {
            $tmp = arr_get($resp, $path, null);
            if ($tmp !== null) {
                foreach (normalize_array($tmp) as $it) {
                    if (is_array($it)) {
                        $impuestos[] = $it;
                    }
                }
            }
        }

        $descs = array();
        foreach ($impuestos as $imp) {
            $desc = trim((string)($imp['descripcionImpuesto'] ?? $imp['descripcion'] ?? ''));
            if ($desc !== '') {
                $descs[] = $desc;
            }
        }

        $texto = strtolower(implode(' | ', array_unique($descs)));

        if (strpos($texto, 'iva exento') !== false || strpos($texto, 'exent') !== false) {
            return 'IVA Sujeto Exento';
        }
        if (strpos($texto, 'monotrib') !== false) {
            return 'Responsable Monotributo';
        }
        if (strpos($texto, 'iva') !== false) {
            return 'IVA Responsable Inscripto';
        }

        return null;
    }
}

if (!function_exists('build_domicilio')) {
    function build_domicilio(array $df): ?string
    {
        $direccion = trim((string)($df['direccion'] ?? ''));
        $localidad = trim((string)($df['localidad'] ?? ''));
        $provincia = trim((string)($df['descripcionProvincia'] ?? ''));
        $cp        = trim((string)($df['codPostal'] ?? ($df['codigoPostal'] ?? '')));

        $parts = array_values(array_filter(
            array($direccion, $localidad, $provincia, $cp),
            static function ($v) {
                return $v !== null && $v !== '';
            }
        ));

        return empty($parts) ? null : implode(' - ', $parts);
    }
}

/* =========================================================
   Input
========================================================= */
$raw = file_get_contents('php://input');
$body = array();

if ($raw !== false && trim($raw) !== '') {
    $tmp = json_decode($raw, true);
    if (is_array($tmp)) {
        $body = $tmp;
    }
}

$cuitBuscado = '';
if (isset($_GET['cuit'])) {
    $cuitBuscado = (string)$_GET['cuit'];
} elseif (isset($_POST['cuit'])) {
    $cuitBuscado = (string)$_POST['cuit'];
} elseif (isset($body['cuit'])) {
    $cuitBuscado = (string)$body['cuit'];
}

$cuitBuscado = only_digits($cuitBuscado);

if (strlen($cuitBuscado) !== 11) {
    json_error('CUIT inválido. Debe tener 11 dígitos.', 422);
}

/* =========================================================
   Resolver tenant y carpeta privada
========================================================= */
$base = __DIR__;

require_once $base . '/arca_wsaa.php';

$tenantId = resolve_current_tenant_id();
if ($tenantId <= 0) {
    json_error(
        'No se pudo resolver el tenant actual desde la sesión validada.',
        401
    );
}

try {
    $cuitEmisorSeleccionado = resolve_config_facturacion_emisor_cuit($pdo ?? null);
    $secureDir = resolve_tenant_account_secure_dir($tenantId, $cuitEmisorSeleccionado);
} catch (Throwable $e) {
    json_error('Error resolviendo carpeta privada de ARCA.', 500, array(
        'tenant_id' => $tenantId,
        'detalle'   => $e->getMessage(),
    ));
}

$certPath    = $secureDir . '/arca_cert.pem';
$keyPath     = $secureDir . '/arca_key.pem';
$caPath      = $secureDir . '/cacert.pem';
$wsdlA5Local = $secureDir . '/personaServiceA5.wsdl';

$faltantes = array();
foreach (array($certPath, $keyPath, $caPath, $wsdlA5Local) as $f) {
    if (!file_exists($f)) {
        $faltantes[] = $f;
    }
}

if (!empty($faltantes)) {
    json_error('Faltan archivos requeridos para consultar ARCA.', 500, array(
        'tenant_id'  => $tenantId,
        'secure_dir' => $secureDir,
        'faltantes'  => $faltantes,
    ));
}

/* =========================================================
   Resolver CUIT representada
========================================================= */
$cuitRepresentada = extract_cuit_from_cert($certPath);

if (strlen($cuitRepresentada) !== 11) {
    // Fallback seguro por tenant: balto_private/balto_arca_clientes/t_ID/arca_cuit.txt
    // No usar ARCA_CUIT global porque podría mezclar CUITs entre clientes.
    $tenantCuitFile = $secureDir . '/arca_cuit.txt';
    if (is_file($tenantCuitFile)) {
        $tenantCuit = only_digits(trim((string)@file_get_contents($tenantCuitFile)));
        if (strlen($tenantCuit) === 11) {
            $cuitRepresentada = $tenantCuit;
        }
    }
}

if (strlen($cuitRepresentada) !== 11) {
    json_error('No se pudo resolver el CUIT del certificado.', 500, array(
        'tenant_id'  => $tenantId,
        'cert_path'  => $certPath,
        'secure_dir' => $secureDir,
    ));
}

if (!empty($cuitEmisorSeleccionado) && $cuitRepresentada !== $cuitEmisorSeleccionado) {
    json_error('El CUIT de config_facturacion no coincide con el certificado/carpeta ARCA seleccionada.', 500, array(
        'tenant_id' => $tenantId,
        'cuit_config_facturacion' => $cuitEmisorSeleccionado,
        'cuit_certificado' => $cuitRepresentada,
        'secure_dir' => $secureDir,
    ));
}

/* =========================================================
   Passphrase
========================================================= */
$keyPass = load_key_pass($secureDir, $keyPath);
if ($keyPass === '__MISSING__') {
    json_error('La clave privada está encriptada y falta la passphrase.', 500, array(
        'tenant_id' => $tenantId,
        'key_path'  => $keyPath,
        'pass_file' => $secureDir . '/arca_key.pass',
    ));
}

/* =========================================================
   WSAA login
========================================================= */
$caFile  = file_exists($caPath) ? $caPath : '';
$wsaaUrl = 'https://wsaa.afip.gov.ar/ws/services/LoginCms?WSDL';
$wsnA5   = 'ws_sr_constancia_inscripcion';

try {
    $cred = ArcaWsaa::login(
        $wsaaUrl,
        $wsnA5,
        $certPath,
        $keyPath,
        $keyPass,
        true,
        $caFile,
        true,
        true,
        'openssl'
    );
} catch (Throwable $e) {
    json_error('WSAA error: ' . $e->getMessage(), 500, array(
        'tenant_id'         => $tenantId,
        'secure_dir'        => $secureDir,
        'cert_path'         => $certPath,
        'key_path'          => $keyPath,
        'ca_path'           => $caPath,
        'cuit_representada' => $cuitRepresentada,
    ));
}

/* =========================================================
   SOAP client A5
========================================================= */
if (!extension_loaded('soap')) {
    json_error('La extensión SOAP no está cargada en PHP.', 500);
}

$endpointA5 = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5';

$ssl = array(
    'verify_peer'       => true,
    'verify_peer_name'  => true,
    'allow_self_signed' => false,
    'SNI_enabled'       => true,
);

if ($caFile !== '') {
    $ssl['cafile'] = $caFile;
}

$ctx = stream_context_create(array(
    'ssl'  => $ssl,
    'http' => array(
        'timeout' => 60,
        'header'  => "Connection: close\r\n",
    ),
));

try {
    $client = new SoapClient($wsdlA5Local, array(
        'soap_version'       => SOAP_1_1,
        'exceptions'         => true,
        'trace'              => false,
        'cache_wsdl'         => WSDL_CACHE_NONE,
        'connection_timeout' => 60,
        'stream_context'     => $ctx,
        'features'           => SOAP_SINGLE_ELEMENT_ARRAYS,
        'user_agent'         => 'Mozilla/5.0 (PHP SoapClient)',
        'location'           => $endpointA5,
    ));
} catch (Throwable $e) {
    json_error('No se pudo crear el cliente SOAP A5: ' . $e->getMessage(), 500, array(
        'tenant_id'  => $tenantId,
        'wsdl_local' => $wsdlA5Local,
        'endpoint'   => $endpointA5,
    ));
}

/* =========================================================
   Consulta padrón A5
========================================================= */
$req = array(
    'token'            => $cred['token'],
    'sign'             => $cred['sign'],
    'cuitRepresentada' => (int)$cuitRepresentada,
    'idPersona'        => (int)$cuitBuscado,
);

$resp = null;

try {
    $respRaw = $client->__soapCall('getPersona_v2', array($req));
    $resp = json_decode(json_encode($respRaw), true);

    if (!is_array($resp)) {
        $respRaw = $client->__soapCall('getPersona', array($req));
        $resp = json_decode(json_encode($respRaw), true);
    }
} catch (Throwable $e2) {

    json_error(
        'No se pudo encontrar el CUIT en el padrón de ARCA. Verifique que el CUIT sea correcto.',
        404,
        array(
            'debug_error'       => $e2->getMessage(),
            'tenant_id'         => $tenantId,
            'cuit_buscado'      => $cuitBuscado,
            'cuit_representada' => $cuitRepresentada,
        )
    );
}

if (!is_array($resp)) {
    $resp = array();
}

/* =========================================================
   Parse respuesta
========================================================= */
$dg = $resp['personaReturn']['datosGenerales'] ?? array();
$df = $dg['domicilioFiscal'] ?? array();

$cuitDevuelto = only_digits((string)($dg['idPersona'] ?? $cuitBuscado));
if ($cuitDevuelto !== $cuitBuscado) {
    json_error(
        'ARCA devolvió un CUIT distinto al buscado.',
        409,
        array(
            'tenant_id'          => $tenantId,
            'cuit_buscado'       => $cuitBuscado,
            'cuit_devuelto'      => $cuitDevuelto,
            'cuit_representada'  => $cuitRepresentada,
        )
    );
}

$apellido = clean_str($dg['apellido'] ?? null);
$nombre   = clean_str($dg['nombre'] ?? null);

$razonSocial = clean_str($dg['razonSocial'] ?? null);
if ($razonSocial === null) {
    $partesNombre = array_values(array_filter(array($apellido, $nombre), static function ($v) {
        return $v !== null && $v !== '';
    }));

    if (!empty($partesNombre)) {
        $razonSocial = implode(' ', $partesNombre);
    }
}

$summary = array(
    'cuit'         => $cuitDevuelto,
    'doc_tipo'     => 80,
    'doc_nro'      => $cuitDevuelto,
    'iva'          => clean_str(map_condicion_iva($resp)),
    'razon_social' => $razonSocial,
    'domicilio'    => clean_str(build_domicilio($df)),
);

/* =========================================================
   OK
========================================================= */
json_ok(array(
    'summary' => $summary,
    'debug'   => array(
        'tenant_id'         => $tenantId,
        'secure_dir'        => $secureDir,
        'cert_path'         => $certPath,
        'key_path'          => $keyPath,
        'wsdl_a5_local'     => $wsdlA5Local,
        'cuit_representada' => $cuitRepresentada,
    ),
));