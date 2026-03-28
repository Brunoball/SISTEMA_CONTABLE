<?php
declare(strict_types=1);

/**
 * LISTA DE PRODUCTOS - IMPORTACIÓN MASIVA / PDF / OCR
 *
 * LÓGICA:
 * - CSV    → crea / actualiza productos en stock_productos
 * - PDF    → extrae texto con pdfparser
 * - PDF escaneado → fallback automático con Imagick + Google Vision OCR
 * - IMG    → OCR con Google Vision
 */

if (!function_exists('stock_lp_json')) {
    function stock_lp_json(array $payload, int $status = 200): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }

        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('stock_lp_ok')) {
    function stock_lp_ok(array $payload = [], int $status = 200): void
    {
        stock_lp_json(array_merge(['exito' => true], $payload), $status);
    }
}

if (!function_exists('stock_lp_fail')) {
    function stock_lp_fail(string $mensaje, int $status = 200, array $extra = []): void
    {
        stock_lp_json(
            array_merge(
                [
                    'exito'   => false,
                    'mensaje' => $mensaje,
                ],
                $extra
            ),
            $status
        );
    }
}

if (!function_exists('stock_lp_require_methods')) {
    function stock_lp_require_methods(array $allowed): void
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $allowed = array_map(static fn($m) => strtoupper((string)$m), $allowed);

        if (!in_array($method, $allowed, true)) {
            stock_lp_fail('Método no permitido', 405, [
                'metodo'             => $method,
                'metodos_permitidos' => array_values($allowed),
            ]);
        }
    }
}

if (!function_exists('stock_lp_get_logs_dir')) {
    function stock_lp_get_logs_dir(): string
    {
        // __DIR__ = .../modules/stock/stock  →  logs queda dentro de stock/logs
        $dir = __DIR__ . '/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }
}

if (!function_exists('stock_lp_get_tmp_dir')) {
    function stock_lp_get_tmp_dir(): string
    {
        $dir = __DIR__ . '/tmp_ocr';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }
}

if (!function_exists('stock_lp_log_error')) {
    function stock_lp_log_error(string $contexto, array $extra = []): void
    {
        $baseDir = stock_lp_get_logs_dir();
        $file = $baseDir . '/lista_productos_importar_' . date('Y-m-d') . '.log';

        $payload = [
            'fecha'    => date('Y-m-d H:i:s'),
            'contexto' => $contexto,
            'ip'       => $_SERVER['REMOTE_ADDR'] ?? '',
            'method'   => $_SERVER['REQUEST_METHOD'] ?? '',
            'uri'      => $_SERVER['REQUEST_URI'] ?? '',
            'extra'    => $extra,
        ];

        @file_put_contents(
            $file,
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
            FILE_APPEND
        );
    }
}

if (!function_exists('stock_lp_get_pdo')) {
    function stock_lp_get_pdo(?PDO $pdo = null): PDO
    {
        if ($pdo instanceof PDO) {
            return $pdo;
        }

        global $pdo;
        if (!isset($pdo) || !($pdo instanceof PDO)) {
            throw new RuntimeException('PDO no disponible.');
        }

        return $pdo;
    }
}

if (!function_exists('stock_lp_limpiar_texto')) {
    function stock_lp_limpiar_texto(string $texto): string
    {
        $texto = str_replace(["\r\n", "\r"], "\n", $texto);
        $texto = preg_replace('/[ \t]+/u', ' ', $texto);
        $texto = preg_replace('/\n{3,}/u', "\n\n", $texto);
        return trim((string)$texto);
    }
}

if (!function_exists('stock_lp_es_texto_suficiente_pdf')) {
    function stock_lp_es_texto_suficiente_pdf(string $texto): bool
    {
        $texto = stock_lp_limpiar_texto($texto);

        if ($texto === '') {
            return false;
        }

        $largo = mb_strlen($texto, 'UTF-8');
        $palabras = preg_split('/\s+/u', $texto, -1, PREG_SPLIT_NO_EMPTY);
        $cantPalabras = is_array($palabras) ? count($palabras) : 0;

        return ($largo >= 120 && $cantPalabras >= 20);
    }
}

if (!function_exists('stock_lp_borrar_archivos')) {
    function stock_lp_borrar_archivos(array $paths): void
    {
        foreach ($paths as $p) {
            if (is_string($p) && $p !== '' && is_file($p)) {
                @unlink($p);
            }
        }
    }
}

if (!function_exists('stock_lp_normalizar_decimal')) {
    function stock_lp_normalizar_decimal($valor): ?string
    {
        $v = trim((string)$valor);
        if ($v === '') {
            return null;
        }

        $v = str_replace(["\xc2\xa0", ' '], '', $v);

        if (preg_match('/^\d{1,3}(\.\d{3})*,\d+$/', $v)) {
            $v = str_replace('.', '', $v);
            $v = str_replace(',', '.', $v);
        } elseif (preg_match('/^\d{1,3}(,\d{3})*\.\d+$/', $v)) {
            $v = str_replace(',', '', $v);
        } else {
            $v = str_replace(',', '.', $v);
        }

        if (!is_numeric($v)) {
            return null;
        }

        return number_format((float)$v, 2, '.', '');
    }
}

if (!function_exists('stock_lp_normalizar_entero')) {
    function stock_lp_normalizar_entero($valor): ?int
    {
        $v = trim((string)$valor);
        if ($v === '') {
            return null;
        }

        $v = preg_replace('/[^\d\-]/', '', $v);
        if ($v === '' || !preg_match('/^-?\d+$/', $v)) {
            return null;
        }

        return (int)$v;
    }
}

if (!function_exists('stock_lp_upsert_producto')) {
    function stock_lp_upsert_producto(PDO $pdo, array $item): string
    {
        $nombre      = trim((string)($item['nombre'] ?? ''));
        $sku         = trim((string)($item['sku'] ?? ''));
        $precio      = stock_lp_normalizar_decimal($item['precio'] ?? null);
        $precioPromo = stock_lp_normalizar_decimal($item['precio_promo'] ?? null);
        $stock       = stock_lp_normalizar_entero($item['stock'] ?? null);
        $descripcion = trim((string)($item['descripcion'] ?? ''));

        if ($nombre === '') {
            throw new RuntimeException('Falta nombre del producto.');
        }

        if ($sku === '') {
            throw new RuntimeException('Falta SKU.');
        }

        if ($precio === null) {
            throw new RuntimeException("Precio inválido para SKU {$sku}.");
        }

        if ($stock === null) {
            $stock = 0;
        }

        $stSel = $pdo->prepare("SELECT id FROM stock_productos WHERE sku = :sku LIMIT 1");
        $stSel->execute([':sku' => $sku]);
        $existe = $stSel->fetch(PDO::FETCH_ASSOC);

        if ($existe) {
            $pdo->prepare("
                UPDATE stock_productos
                   SET nombre = :nombre,
                       precio = :precio,
                       precio_promo = :precio_promo,
                       stock = :stock,
                       descripcion = :descripcion,
                       updated_at = NOW()
                 WHERE id = :id
            ")->execute([
                ':nombre'       => $nombre,
                ':precio'       => $precio,
                ':precio_promo' => $precioPromo,
                ':stock'        => $stock,
                ':descripcion'  => $descripcion,
                ':id'           => (int)$existe['id'],
            ]);

            return 'actualizado';
        }

        $pdo->prepare("
            INSERT INTO stock_productos
                (nombre, sku, precio, precio_promo, stock, descripcion, activo, created_at, updated_at)
            VALUES
                (:nombre, :sku, :precio, :precio_promo, :stock, :descripcion, 1, NOW(), NOW())
        ")->execute([
            ':nombre'       => $nombre,
            ':sku'          => $sku,
            ':precio'       => $precio,
            ':precio_promo' => $precioPromo,
            ':stock'        => $stock,
            ':descripcion'  => $descripcion,
        ]);

        return 'creado';
    }
}

if (!function_exists('stock_lp_parse_csv_file')) {
    function stock_lp_parse_csv_file(string $tmpFile): array
    {
        if (!is_file($tmpFile)) {
            throw new RuntimeException('Archivo CSV no encontrado.');
        }

        $contenido = file_get_contents($tmpFile);
        if ($contenido === false || trim($contenido) === '') {
            throw new RuntimeException('El CSV está vacío.');
        }

        $contenido = preg_replace('/^\xEF\xBB\xBF/', '', $contenido);
        $lineas    = preg_split('/\r\n|\n|\r/', $contenido);
        $items     = [];
        $errores   = [];

        foreach ($lineas as $idx => $linea) {
            $numLinea = $idx + 1;
            $linea    = trim((string)$linea);

            if ($linea === '') {
                continue;
            }

            if ($idx === 0 && preg_match('/nombre\s*;\s*sku\s*;\s*precio/i', $linea)) {
                continue;
            }

            $cols = str_getcsv($linea, ';');
            $cols = array_map(static fn($x) => trim((string)$x), $cols);

            if (count($cols) < 5) {
                $errores[] = "Línea {$numLinea}: columnas insuficientes.";
                continue;
            }

            $items[] = [
                'nombre'       => $cols[0] ?? '',
                'sku'          => $cols[1] ?? '',
                'precio'       => $cols[2] ?? '',
                'precio_promo' => $cols[3] ?? '',
                'stock'        => $cols[4] ?? '',
                'descripcion'  => $cols[5] ?? '',
            ];
        }

        return [$items, $errores];
    }
}

if (!function_exists('stock_lp_resolver_pdfparser_autoload')) {
    function stock_lp_resolver_pdfparser_autoload(): ?string
    {
        // __DIR__ = .../modules/stock/stock
        $candidatos = [
            __DIR__ . '/../../../googlevision/vendor/autoload.php',
            __DIR__ . '/../../googlevision/vendor/autoload.php',
            __DIR__ . '/../googlevision/vendor/autoload.php',
            __DIR__ . '/../../../vendor/autoload.php',
            __DIR__ . '/../../vendor/autoload.php',
            __DIR__ . '/../vendor/autoload.php',
        ];

        foreach ($candidatos as $ruta) {
            $real = realpath($ruta);
            if ($real && is_file($real)) {
                require_once $real;
                if (class_exists('Smalot\\PdfParser\\Parser')) {
                    return $real;
                }
            }
        }

        return null;
    }
}

if (!function_exists('stock_lp_contar_paginas_pdf_php')) {
    function stock_lp_contar_paginas_pdf_php(string $pdfPath): int
    {
        try {
            if (!class_exists('Smalot\\PdfParser\\Parser')) {
                return 1;
            }

            $parser = new \Smalot\PdfParser\Parser();
            $pdf    = $parser->parseFile($pdfPath);
            $pages  = $pdf->getPages();

            return max(1, is_array($pages) ? count($pages) : 1);
        } catch (Throwable $e) {
            stock_lp_log_error('pdf_contar_paginas_php_error', [
                'mensaje' => $e->getMessage(),
            ]);
            return 1;
        }
    }
}

if (!function_exists('stock_lp_extraer_texto_pdf_php')) {
    function stock_lp_extraer_texto_pdf_php(string $pdfPath): ?string
    {
        try {
            if (!class_exists('Smalot\\PdfParser\\Parser')) {
                stock_lp_log_error('pdfparser_no_disponible');
                return null;
            }

            $parser = new \Smalot\PdfParser\Parser();
            $pdf    = $parser->parseFile($pdfPath);
            $texto  = $pdf->getText();

            if (!is_string($texto)) {
                return null;
            }

            $texto = trim($texto);

            stock_lp_log_error('pdfparser_ok', [
                'caracteres'    => mb_strlen($texto, 'UTF-8'),
                'preview_texto' => mb_substr($texto, 0, 1000, 'UTF-8'),
            ]);

            return $texto;
        } catch (Throwable $e) {
            stock_lp_log_error('pdfparser_error', [
                'mensaje' => $e->getMessage(),
            ]);
            return null;
        }
    }
}

if (!function_exists('stock_lp_imagick_disponible')) {
    function stock_lp_imagick_disponible(): bool
    {
        return extension_loaded('imagick') && class_exists('Imagick');
    }
}

if (!function_exists('stock_lp_convertir_pdf_a_imagenes_imagick')) {
    function stock_lp_convertir_pdf_a_imagenes_imagick(string $pdfPath): array
    {
        if (!stock_lp_imagick_disponible()) {
            throw new RuntimeException('Imagick no está habilitado en el servidor.');
        }

        $tmpDir   = stock_lp_get_tmp_dir();
        $prefijo  = 'pdfocr_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4));
        $imagenes = [];

        try {
            $imagick = new Imagick();
            $imagick->setResolution(200, 200);
            $imagick->readImage($pdfPath);

            $total = $imagick->getNumberImages();
            if ($total <= 0) {
                throw new RuntimeException('No se pudieron leer páginas del PDF con Imagick.');
            }

            $indice = 0;
            foreach ($imagick as $pagina) {
                $indice++;

                $pagina->setImageFormat('png');
                $pagina->setImageCompressionQuality(92);
                $pagina->setImageBackgroundColor('white');

                if (method_exists($pagina, 'mergeImageLayers')) {
                    $pagina = $pagina->mergeImageLayers(Imagick::LAYERMETHOD_FLATTEN);
                }

                $rutaSalida = $tmpDir . '/' . $prefijo . '_pag_' . $indice . '.png';
                $pagina->writeImage($rutaSalida);

                if (!is_file($rutaSalida)) {
                    throw new RuntimeException("No se pudo generar la imagen de la página {$indice}.");
                }

                $imagenes[] = $rutaSalida;
            }

            $imagick->clear();
            $imagick->destroy();

            stock_lp_log_error('pdf_imagick_ok', [
                'pdf'               => basename($pdfPath),
                'paginas_generadas' => count($imagenes),
            ]);

            return $imagenes;
        } catch (Throwable $e) {
            stock_lp_log_error('pdf_imagick_error', [
                'mensaje' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}

if (!function_exists('stock_lp_resolver_google_vendor')) {
    function stock_lp_resolver_google_vendor(): ?string
    {
        $rutasIntentadas = [];

        // __DIR__ = .../modules/stock/stock
        $rutas = [
            __DIR__ . '/../../../googlevision/vendor/autoload.php',
            __DIR__ . '/../../googlevision/vendor/autoload.php',
            __DIR__ . '/../googlevision/vendor/autoload.php',
            __DIR__ . '/../../../vendor/autoload.php',
            __DIR__ . '/../../vendor/autoload.php',
            __DIR__ . '/../vendor/autoload.php',
        ];

        foreach ($rutas as $ruta) {
            $real = realpath($ruta);
            $rutasIntentadas[] = $real ?: $ruta;

            if ($real && is_file($real)) {
                require_once $real;

                if (class_exists('\Google\Cloud\Vision\V1\ImageAnnotatorClient')) {
                    stock_lp_log_error('google_vendor_ok', [
                        'autoload' => $real,
                        'modo'     => 'sdk',
                    ]);
                    return $real;
                }
            }
        }

        stock_lp_log_error('google_vendor_no_sdk', [
            'rutas_intentadas' => $rutasIntentadas,
            'class_exists'     => class_exists('\Google\Cloud\Vision\V1\ImageAnnotatorClient'),
        ]);

        return null;
    }
}

if (!function_exists('stock_lp_buscar_secure_desde_directorio')) {
    function stock_lp_buscar_secure_desde_directorio(string $inicio, int $maxNiveles = 12): ?string
    {
        $actual = realpath($inicio);
        if (!$actual) {
            $actual = $inicio;
        }

        $actual = rtrim(str_replace('\\', '/', $actual), '/');

        for ($i = 0; $i <= $maxNiveles; $i++) {
            $candidata = $actual . '/balto_private/secure/google-vision.json';
            $real = realpath($candidata);

            if ($real && is_file($real)) {
                return $real;
            }

            $padre = dirname($actual);
            if ($padre === $actual) {
                break;
            }
            $actual = $padre;
        }

        return null;
    }
}

if (!function_exists('stock_lp_resolver_google_credentials')) {
    function stock_lp_resolver_google_credentials(): string
    {
        $intentadas = [];

        $envs = [
            trim((string)getenv('GOOGLE_APPLICATION_CREDENTIALS')),
            trim((string)getenv('GOOGLE_VISION_CREDENTIALS_PATH')),
        ];

        foreach ($envs as $ruta) {
            if ($ruta === '') {
                continue;
            }

            $intentadas[] = $ruta;
            $real = realpath($ruta);
            if ($real && is_file($real)) {
                stock_lp_log_error('google_credentials_ok', ['ruta' => $real, 'metodo' => 'env']);
                return $real;
            }
        }

        $home = trim((string)(getenv('HOME') ?: ($_SERVER['HOME'] ?? '')));
        if ($home !== '') {
            $rutaHome = rtrim(str_replace('\\', '/', $home), '/') . '/balto_private/secure/google-vision.json';
            $intentadas[] = $rutaHome;

            $real = realpath($rutaHome);
            if ($real && is_file($real)) {
                stock_lp_log_error('google_credentials_ok', ['ruta' => $real, 'metodo' => 'home']);
                return $real;
            }
        }

        $documentRoot = trim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
        if ($documentRoot !== '') {
            $found = stock_lp_buscar_secure_desde_directorio($documentRoot, 12);
            $intentadas[] = 'scan_from_document_root:' . $documentRoot;

            if ($found && is_file($found)) {
                stock_lp_log_error('google_credentials_ok', ['ruta' => $found, 'metodo' => 'document_root_scan']);
                return $found;
            }
        }

        $actual = __DIR__;
        $found = stock_lp_buscar_secure_desde_directorio($actual, 12);
        $intentadas[] = 'scan_from_module:' . $actual;

        if ($found && is_file($found)) {
            stock_lp_log_error('google_credentials_ok', ['ruta' => $found, 'metodo' => 'module_scan']);
            return $found;
        }

        stock_lp_log_error('google_credentials_fail', ['intentadas' => $intentadas]);

        throw new RuntimeException('No se encontró el archivo de credenciales de Google Vision.');
    }
}

if (!function_exists('stock_lp_google_credentials_array')) {
    function stock_lp_google_credentials_array(): array
    {
        $credPath = stock_lp_resolver_google_credentials();
        $json = file_get_contents($credPath);

        if ($json === false || trim($json) === '') {
            throw new RuntimeException('No se pudo leer el archivo de credenciales de Google Vision.');
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new RuntimeException('El archivo de credenciales no es un JSON válido.');
        }

        $required = ['client_email', 'private_key', 'token_uri'];
        foreach ($required as $field) {
            if (empty($data[$field]) || !is_string($data[$field])) {
                throw new RuntimeException("Falta el campo {$field} en google-vision.json.");
            }
        }

        return $data;
    }
}

if (!function_exists('stock_lp_base64url')) {
    function stock_lp_base64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}

if (!function_exists('stock_lp_http_post_json')) {
    function stock_lp_http_post_json(string $url, array $payload, array $headers = [], int $timeout = 60): array
    {
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new RuntimeException('No se pudo serializar el payload JSON.');
        }

        $defaultHeaders = [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($json),
        ];

        $allHeaders = array_merge($defaultHeaders, $headers);

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch === false) {
                throw new RuntimeException('No se pudo inicializar cURL.');
            }

            curl_setopt_array($ch, [
                CURLOPT_POST           => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER     => $allHeaders,
                CURLOPT_POSTFIELDS     => $json,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_CONNECTTIMEOUT => 20,
            ]);

            $response = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr  = curl_error($ch);
            curl_close($ch);

            if ($response === false) {
                throw new RuntimeException('Error cURL: ' . $curlErr);
            }

            return [
                'status' => $httpCode,
                'body'   => $response,
            ];
        }

        $context = stream_context_create([
            'http' => [
                'method'        => 'POST',
                'header'        => implode("\r\n", $allHeaders),
                'content'       => $json,
                'timeout'       => $timeout,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        $httpCode = 0;

        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $line) {
                if (preg_match('#HTTP/\S+\s+(\d{3})#', $line, $m)) {
                    $httpCode = (int)$m[1];
                    break;
                }
            }
        }

        if ($response === false) {
            throw new RuntimeException('No se pudo realizar la petición HTTP.');
        }

        return [
            'status' => $httpCode,
            'body'   => $response,
        ];
    }
}

if (!function_exists('stock_lp_google_get_access_token_rest')) {
    function stock_lp_google_get_access_token_rest(): string
    {
        $cred = stock_lp_google_credentials_array();

        $now = time();
        $header = [
            'alg' => 'RS256',
            'typ' => 'JWT',
        ];

        $claim = [
            'iss'   => $cred['client_email'],
            'scope' => 'https://www.googleapis.com/auth/cloud-platform',
            'aud'   => $cred['token_uri'],
            'exp'   => $now + 3600,
            'iat'   => $now,
        ];

        $unsignedJwt = stock_lp_base64url(json_encode($header, JSON_UNESCAPED_SLASHES))
            . '.'
            . stock_lp_base64url(json_encode($claim, JSON_UNESCAPED_SLASHES));

        $signature = '';
        $ok = openssl_sign($unsignedJwt, $signature, $cred['private_key'], 'sha256WithRSAEncryption');

        if (!$ok) {
            throw new RuntimeException('No se pudo firmar el JWT con OpenSSL.');
        }

        $jwt = $unsignedJwt . '.' . stock_lp_base64url($signature);

        $response = stock_lp_http_post_json(
            $cred['token_uri'],
            [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt,
            ],
            [],
            60
        );

        $body = json_decode((string)$response['body'], true);

        if (!is_array($body)) {
            throw new RuntimeException('Respuesta inválida al solicitar access token OAuth.');
        }

        if (!empty($body['error'])) {
            throw new RuntimeException(
                'Error OAuth: ' . (is_string($body['error']) ? $body['error'] : 'desconocido')
                . (!empty($body['error_description']) ? ' - ' . $body['error_description'] : '')
            );
        }

        if (empty($body['access_token']) || !is_string($body['access_token'])) {
            throw new RuntimeException('No se obtuvo access_token de Google OAuth.');
        }

        stock_lp_log_error('google_rest_token_ok', [
            'expires_in' => $body['expires_in'] ?? null,
        ]);

        return $body['access_token'];
    }
}

if (!function_exists('stock_lp_ocr_imagen_sdk')) {
    function stock_lp_ocr_imagen_sdk(string $imageData): string
    {
        $autoload = stock_lp_resolver_google_vendor();
        if ($autoload === null || !class_exists('\Google\Cloud\Vision\V1\ImageAnnotatorClient')) {
            throw new RuntimeException('SDK de Google Vision no disponible.');
        }

        $credPath = stock_lp_resolver_google_credentials();
        putenv('GOOGLE_APPLICATION_CREDENTIALS=' . $credPath);

        $client = new \Google\Cloud\Vision\V1\ImageAnnotatorClient();

        try {
            $response = $client->textDetection($imageData);
            $annotations = $response->getTextAnnotations();

            if ($response->hasError()) {
                throw new RuntimeException($response->getError()->getMessage());
            }

            if (!$annotations || count($annotations) === 0) {
                return '';
            }

            return stock_lp_limpiar_texto((string)$annotations[0]->getDescription());
        } finally {
            $client->close();
        }
    }
}

if (!function_exists('stock_lp_ocr_imagen_rest')) {
    function stock_lp_ocr_imagen_rest(string $imageData): string
    {
        $token = stock_lp_google_get_access_token_rest();

        $payload = [
            'requests' => [
                [
                    'image' => [
                        'content' => base64_encode($imageData),
                    ],
                    'features' => [
                        [
                            'type'       => 'TEXT_DETECTION',
                            'maxResults' => 1,
                        ],
                    ],
                ],
            ],
        ];

        $response = stock_lp_http_post_json(
            'https://vision.googleapis.com/v1/images:annotate',
            $payload,
            [
                'Authorization: Bearer ' . $token,
            ],
            120
        );

        $body = json_decode((string)$response['body'], true);

        if (!is_array($body)) {
            throw new RuntimeException('Respuesta inválida de Google Vision REST.');
        }

        if (!empty($body['error'])) {
            $msg = is_array($body['error'])
                ? (($body['error']['message'] ?? 'Error desconocido de Vision REST'))
                : (string)$body['error'];

            throw new RuntimeException('Google Vision REST: ' . $msg);
        }

        $annotation = $body['responses'][0]['fullTextAnnotation']['text']
            ?? $body['responses'][0]['textAnnotations'][0]['description']
            ?? '';

        return stock_lp_limpiar_texto((string)$annotation);
    }
}

if (!function_exists('stock_lp_ocr_imagen')) {
    function stock_lp_ocr_imagen(string $imageData): string
    {
        $sdkDisponible = false;

        try {
            $autoload = stock_lp_resolver_google_vendor();
            $sdkDisponible = ($autoload !== null && class_exists('\Google\Cloud\Vision\V1\ImageAnnotatorClient'));
        } catch (Throwable $e) {
            $sdkDisponible = false;
        }

        if ($sdkDisponible) {
            try {
                stock_lp_log_error('google_vision_modo', ['modo' => 'sdk']);
                return stock_lp_ocr_imagen_sdk($imageData);
            } catch (Throwable $e) {
                stock_lp_log_error('google_vision_sdk_error_fallback_rest', [
                    'mensaje' => $e->getMessage(),
                ]);
            }
        }

        stock_lp_log_error('google_vision_modo', ['modo' => 'rest']);
        return stock_lp_ocr_imagen_rest($imageData);
    }
}

if (!function_exists('stock_lp_ocr_pdf_con_imagick_google_vision')) {
    function stock_lp_ocr_pdf_con_imagick_google_vision(string $pdfPath): array
    {
        $imagenes = stock_lp_convertir_pdf_a_imagenes_imagick($pdfPath);
        $textos   = [];
        $errores  = [];

        try {
            foreach ($imagenes as $idx => $rutaImg) {
                $pageNum = $idx + 1;

                $imageData = file_get_contents($rutaImg);
                if ($imageData === false || $imageData === '') {
                    $errores[] = "No se pudo leer la imagen temporal de la página {$pageNum}.";
                    continue;
                }

                stock_lp_log_error('pdf_ocr_pagina_inicio', [
                    'pagina'         => $pageNum,
                    'archivo_imagen' => basename($rutaImg),
                    'bytes_imagen'   => strlen($imageData),
                ]);

                $textoPagina = stock_lp_ocr_imagen($imageData);
                $textoPagina = stock_lp_limpiar_texto($textoPagina);

                stock_lp_log_error('pdf_ocr_pagina_finalizado', [
                    'pagina'           => $pageNum,
                    'total_caracteres' => mb_strlen($textoPagina, 'UTF-8'),
                    'preview_texto'    => mb_substr($textoPagina, 0, 1000, 'UTF-8'),
                ]);

                $textos[] = "----- PÁGINA {$pageNum} -----\n" . $textoPagina;
            }

            $textoFinal = trim(implode("\n\n", $textos));

            return [
                'texto'   => $textoFinal,
                'paginas' => count($imagenes),
                'errores' => $errores,
            ];
        } finally {
            stock_lp_borrar_archivos($imagenes);
        }
    }
}

if (!function_exists('stock_lista_productos_importar_csv')) {
    function stock_lista_productos_importar_csv(PDO $pdo): void
    {
        stock_lp_require_methods(['POST']);

        try {
            $file = $_FILES['archivo_csv'] ?? $_FILES['csv'] ?? null;

            if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                throw new RuntimeException('No se recibió un archivo CSV válido.');
            }

            [$items, $errores] = stock_lp_parse_csv_file((string)$file['tmp_name']);

            if (!$items) {
                stock_lp_json([
                    'exito'        => false,
                    'mensaje'      => 'No se encontraron filas válidas en el CSV.',
                    'errores'      => $errores,
                    'creados'      => 0,
                    'actualizados' => 0,
                ], 422);
            }

            $creados = 0;
            $actualizados = 0;

            foreach ($items as $idx => $item) {
                try {
                    $estado = stock_lp_upsert_producto($pdo, $item);
                    if ($estado === 'creado') {
                        $creados++;
                    }
                    if ($estado === 'actualizado') {
                        $actualizados++;
                    }
                } catch (Throwable $e) {
                    $errores[] = 'Fila ' . ($idx + 1) . ': ' . $e->getMessage();
                }
            }

            stock_lp_json([
                'exito'        => true,
                'mensaje'      => 'CSV procesado correctamente.',
                'creados'      => $creados,
                'actualizados' => $actualizados,
                'errores'      => $errores,
            ]);
        } catch (Throwable $e) {
            stock_lp_log_error('csv_general_error', ['mensaje' => $e->getMessage()]);
            stock_lp_json([
                'exito'   => false,
                'mensaje' => 'Error al importar CSV: ' . $e->getMessage(),
            ], 500);
        }
    }
}

if (!function_exists('stock_lista_productos_extraer_texto_pdf')) {
    function stock_lista_productos_extraer_texto_pdf(PDO $pdo): void
    {
        unset($pdo);
        stock_lp_require_methods(['POST']);

        try {
            $file = $_FILES['archivo_pdf'] ?? null;

            if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                throw new RuntimeException('No se recibió un archivo PDF válido.');
            }

            $tmpName  = (string)($file['tmp_name'] ?? '');
            $origName = (string)($file['name'] ?? '');

            if ($tmpName === '' || !is_uploaded_file($tmpName)) {
                throw new RuntimeException('Archivo PDF inválido.');
            }

            $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if ($ext !== 'pdf') {
                throw new RuntimeException('El archivo debe ser PDF.');
            }

            stock_lp_log_error('pdf_inicio', [
                'nombre' => $origName,
                'size'   => $file['size'] ?? null,
            ]);

            $autoload = stock_lp_resolver_pdfparser_autoload();
            if ($autoload === null) {
                throw new RuntimeException(
                    'No se encontró la librería PHP para leer PDFs. Instalá: composer require smalot/pdfparser'
                );
            }

            $totalPaginas = stock_lp_contar_paginas_pdf_php($tmpName);
            $textoParser  = stock_lp_extraer_texto_pdf_php($tmpName) ?? '';
            $textoParser  = stock_lp_limpiar_texto($textoParser);

            if (stock_lp_es_texto_suficiente_pdf($textoParser)) {
                stock_lp_log_error('pdf_finalizado', [
                    'metodo'           => 'php_pdfparser',
                    'total_paginas'    => $totalPaginas,
                    'total_caracteres' => mb_strlen($textoParser, 'UTF-8'),
                    'ocr_usado'        => false,
                ]);

                stock_lp_json([
                    'exito'            => true,
                    'mensaje'          => 'PDF procesado correctamente.',
                    'metodo'           => 'php_pdfparser',
                    'ocr_usado'        => false,
                    'texto_detectado'  => $textoParser,
                    'errores'          => [],
                    'total_paginas'    => $totalPaginas,
                    'total_caracteres' => mb_strlen($textoParser, 'UTF-8'),
                ]);
            }

            stock_lp_log_error('pdf_fallback_ocr', [
                'motivo'             => 'Texto insuficiente o vacío desde pdfparser',
                'caracteres_parser'  => mb_strlen($textoParser, 'UTF-8'),
                'imagick_disponible' => stock_lp_imagick_disponible(),
            ]);

            if (!stock_lp_imagick_disponible()) {
                $errores = [
                    'El PDF parece escaneado o sin texto utilizable.',
                    'Se intentó fallback OCR, pero Imagick no está habilitado en el servidor.',
                    'Con Imagick habilitado, el sistema podrá convertir el PDF a imágenes y usar Google Vision.',
                ];

                stock_lp_json([
                    'exito'            => false,
                    'mensaje'          => 'No se pudo obtener texto utilizable del PDF.',
                    'metodo'           => 'php_pdfparser',
                    'ocr_usado'        => false,
                    'texto_detectado'  => $textoParser,
                    'errores'          => $errores,
                    'total_paginas'    => $totalPaginas,
                    'total_caracteres' => mb_strlen($textoParser, 'UTF-8'),
                ], 422);
            }

            $ocr = stock_lp_ocr_pdf_con_imagick_google_vision($tmpName);
            $textoOcr = stock_lp_limpiar_texto((string)($ocr['texto'] ?? ''));
            $errores = is_array($ocr['errores'] ?? null) ? $ocr['errores'] : [];

            stock_lp_log_error('pdf_finalizado', [
                'metodo'           => 'imagick_google_vision',
                'total_paginas'    => (int)($ocr['paginas'] ?? $totalPaginas),
                'total_caracteres' => mb_strlen($textoOcr, 'UTF-8'),
                'ocr_usado'        => true,
            ]);

            stock_lp_json([
                'exito'            => true,
                'mensaje'          => 'PDF procesado correctamente.',
                'metodo'           => 'imagick_google_vision',
                'ocr_usado'        => true,
                'texto_detectado'  => $textoOcr,
                'errores'          => $errores,
                'total_paginas'    => (int)($ocr['paginas'] ?? $totalPaginas),
                'total_caracteres' => mb_strlen($textoOcr, 'UTF-8'),
            ]);
        } catch (Throwable $e) {
            stock_lp_log_error('pdf_error', [
                'mensaje' => $e->getMessage(),
                'archivo' => $e->getFile(),
                'linea'   => $e->getLine(),
            ]);

            stock_lp_json([
                'exito'   => false,
                'mensaje' => 'Error al procesar PDF: ' . $e->getMessage(),
            ], 500);
        }
    }
}

if (!function_exists('stock_lista_productos_ocr_imagen')) {
    function stock_lista_productos_ocr_imagen(PDO $pdo): void
    {
        unset($pdo);
        stock_lp_require_methods(['POST']);

        $extensionesPermitidas = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'tif'];

        try {
            $file = $_FILES['archivo_imagen'] ?? null;

            if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                throw new RuntimeException('No se recibió una imagen válida.');
            }

            $tmpName  = (string)($file['tmp_name'] ?? '');
            $origName = (string)($file['name'] ?? '');

            if ($tmpName === '' || !is_uploaded_file($tmpName)) {
                throw new RuntimeException('Archivo de imagen inválido.');
            }

            $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
            if (!in_array($ext, $extensionesPermitidas, true)) {
                throw new RuntimeException(
                    'Formato no soportado. Usá: ' . implode(', ', $extensionesPermitidas)
                );
            }

            $imageData = file_get_contents($tmpName);
            if ($imageData === false || $imageData === '') {
                throw new RuntimeException('No se pudo leer el archivo de imagen.');
            }

            stock_lp_log_error('ocr_imagen_inicio', [
                'nombre' => $origName,
                'size'   => $file['size'] ?? null,
                'ext'    => $ext,
            ]);

            $texto = stock_lp_ocr_imagen($imageData);
            $texto = stock_lp_limpiar_texto($texto);

            $errores = [];
            if ($texto === '') {
                $errores[] = 'Google Vision no detectó texto en la imagen.';
            }

            stock_lp_log_error('ocr_imagen_finalizado', [
                'total_caracteres' => mb_strlen($texto, 'UTF-8'),
                'preview_texto'    => mb_substr($texto, 0, 1000, 'UTF-8'),
            ]);

            stock_lp_json([
                'exito'            => true,
                'mensaje'          => 'Imagen procesada con Google Vision OCR.',
                'texto_detectado'  => $texto,
                'errores'          => $errores,
                'total_caracteres' => mb_strlen($texto, 'UTF-8'),
            ]);
        } catch (Throwable $e) {
            stock_lp_log_error('ocr_imagen_error', [
                'mensaje' => $e->getMessage(),
                'archivo' => $e->getFile(),
                'linea'   => $e->getLine(),
            ]);

            stock_lp_json([
                'exito'   => false,
                'mensaje' => 'Error al procesar imagen: ' . $e->getMessage(),
            ], 500);
        }
    }
}

if (!function_exists('stock_lista_productos_importar_handle')) {
    function stock_lista_productos_importar_handle(string $action, ?PDO $pdo = null): void
    {
        try {
            $action = mb_strtolower(trim($action), 'UTF-8');
            $pdo    = stock_lp_get_pdo($pdo);

            switch ($action) {
                case 'stock_productos_importar_csv':
                case 'stock_producto_importar_csv':
                    stock_lista_productos_importar_csv($pdo);
                    return;

                case 'stock_productos_importar_pdf':
                case 'stock_producto_importar_pdf':
                    stock_lista_productos_extraer_texto_pdf($pdo);
                    return;

                case 'stock_productos_ocr_imagen':
                case 'stock_producto_ocr_imagen':
                    stock_lista_productos_ocr_imagen($pdo);
                    return;

                default:
                    stock_lp_fail('Acción de importación inválida.', 404, [
                        'action' => $action,
                    ]);
            }
        } catch (Throwable $e) {
            stock_lp_fail('Error en importación de productos: ' . $e->getMessage(), 500);
        }
    }
}