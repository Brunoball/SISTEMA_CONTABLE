<?php
declare(strict_types=1);

/**
 * CLASIFICACIÓN DE TEXTO OCR / PDF CON OPENAI
 */

if (!function_exists('stock_oai_json')) {
    function stock_oai_json(array $payload, int $status = 200): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
        }

        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('stock_oai_ok')) {
    function stock_oai_ok(array $payload = [], int $status = 200): void
    {
        stock_oai_json(array_merge(['exito' => true], $payload), $status);
    }
}

if (!function_exists('stock_oai_fail')) {
    function stock_oai_fail(string $mensaje, int $status = 200, array $extra = []): void
    {
        stock_oai_json(
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

if (!function_exists('stock_oai_require_methods')) {
    function stock_oai_require_methods(array $allowed): void
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $allowed = array_map(static fn($m) => strtoupper((string)$m), $allowed);

        if (!in_array($method, $allowed, true)) {
            stock_oai_fail('Método no permitido', 405, [
                'metodo'             => $method,
                'metodos_permitidos' => array_values($allowed),
            ]);
        }
    }
}

if (!function_exists('stock_oai_get_logs_dir')) {
    function stock_oai_get_logs_dir(): string
    {
        $dir = __DIR__ . '/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }
}

if (!function_exists('stock_oai_log_error')) {
    function stock_oai_log_error(string $contexto, array $extra = []): void
    {
        $baseDir = stock_oai_get_logs_dir();
        $file = $baseDir . '/stock_productos_clasificar_texto_' . date('Y-m-d') . '.log';

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

if (!function_exists('stock_oai_get_pdo')) {
    function stock_oai_get_pdo(?PDO $pdo = null): ?PDO
    {
        if ($pdo instanceof PDO) {
            return $pdo;
        }

        global $pdo;
        if (isset($pdo) && $pdo instanceof PDO) {
            return $pdo;
        }

        return null;
    }
}

if (!function_exists('stock_oai_limpiar_texto')) {
    function stock_oai_limpiar_texto(string $texto): string
    {
        $texto = str_replace(["\r\n", "\r"], "\n", $texto);
        $texto = preg_replace('/[ \t]+/u', ' ', $texto);
        $texto = preg_replace('/\n{3,}/u', "\n\n", $texto);
        return trim((string)$texto);
    }
}

if (!function_exists('stock_oai_buscar_secure_desde_directorio')) {
    function stock_oai_buscar_secure_desde_directorio(string $inicio, string $archivoObjetivo, int $maxNiveles = 12): ?string
    {
        $actual = realpath($inicio);
        if (!$actual) {
            $actual = $inicio;
        }

        $actual = rtrim(str_replace('\\', '/', $actual), '/');

        for ($i = 0; $i <= $maxNiveles; $i++) {
            $candidata = $actual . '/balto_private/secure/' . ltrim($archivoObjetivo, '/');
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

if (!function_exists('stock_oai_resolver_openai_key_file')) {
    function stock_oai_resolver_openai_key_file(): string
    {
        $intentadas = [];

        $envFiles = [
            trim((string)getenv('OPENAI_KEY_FILE')),
            trim((string)getenv('OPENAI_API_KEY_FILE')),
        ];

        foreach ($envFiles as $ruta) {
            if ($ruta === '') {
                continue;
            }

            $intentadas[] = $ruta;
            $real = realpath($ruta);
            if ($real && is_file($real)) {
                stock_oai_log_error('openai_key_file_ok', [
                    'metodo' => 'env_file',
                    'ruta'   => $real,
                ]);
                return $real;
            }
        }

        $home = trim((string)(getenv('HOME') ?: ($_SERVER['HOME'] ?? '')));
        if ($home !== '') {
            $rutaHome = rtrim(str_replace('\\', '/', $home), '/') . '/balto_private/secure/openai_key.php';
            $intentadas[] = $rutaHome;

            $real = realpath($rutaHome);
            if ($real && is_file($real)) {
                stock_oai_log_error('openai_key_file_ok', [
                    'metodo' => 'home',
                    'ruta'   => $real,
                ]);
                return $real;
            }
        }

        $documentRoot = trim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
        if ($documentRoot !== '') {
            $found = stock_oai_buscar_secure_desde_directorio($documentRoot, 'openai_key.php', 12);
            $intentadas[] = 'scan_from_document_root:' . $documentRoot;

            if ($found && is_file($found)) {
                stock_oai_log_error('openai_key_file_ok', [
                    'metodo' => 'document_root_scan',
                    'ruta'   => $found,
                ]);
                return $found;
            }
        }

        $actual = __DIR__;
        $found = stock_oai_buscar_secure_desde_directorio($actual, 'openai_key.php', 12);
        $intentadas[] = 'scan_from_module:' . $actual;

        if ($found && is_file($found)) {
            stock_oai_log_error('openai_key_file_ok', [
                'metodo' => 'module_scan',
                'ruta'   => $found,
            ]);
            return $found;
        }

        stock_oai_log_error('openai_key_file_fail', [
            'intentadas' => $intentadas,
        ]);

        throw new RuntimeException('No se encontró el archivo balto_private/secure/openai_key.php');
    }
}

if (!function_exists('stock_oai_resolver_api_key')) {
    function stock_oai_resolver_api_key(): string
    {
        $envKeys = [
            trim((string)getenv('OPENAI_API_KEY')),
            trim((string)getenv('OPENAI_KEY')),
        ];

        foreach ($envKeys as $key) {
            if ($key !== '') {
                stock_oai_log_error('openai_api_key_ok', [
                    'metodo' => 'env_directa',
                ]);
                return $key;
            }
        }

        $keyFile = stock_oai_resolver_openai_key_file();
        $config = require $keyFile;

        if (is_string($config)) {
            $apiKey = trim($config);
        } elseif (is_array($config)) {
            $apiKey = trim((string)($config['api_key'] ?? ''));
        } else {
            $apiKey = '';
        }

        if ($apiKey === '') {
            throw new RuntimeException('El archivo openai_key.php no contiene una API key válida.');
        }

        if (!preg_match('/^sk-/', $apiKey)) {
            throw new RuntimeException('La API key de OpenAI no tiene un formato válido.');
        }

        stock_oai_log_error('openai_api_key_ok', [
            'metodo' => 'secure_php',
            'archivo' => $keyFile,
        ]);

        return $apiKey;
    }
}

if (!function_exists('stock_oai_http_post_json')) {
    function stock_oai_http_post_json(string $url, array $payload, array $headers = [], int $timeout = 120): array
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
            throw new RuntimeException('No se pudo realizar la petición HTTP a OpenAI.');
        }

        return [
            'status' => $httpCode,
            'body'   => $response,
        ];
    }
}

if (!function_exists('stock_oai_extraer_output_text')) {
    function stock_oai_extraer_output_text(array $data): string
    {
        if (!empty($data['output_text']) && is_string($data['output_text'])) {
            return trim($data['output_text']);
        }

        $partes = [];

        if (!empty($data['output']) && is_array($data['output'])) {
            foreach ($data['output'] as $item) {
                if (!is_array($item)) {
                    continue;
                }

                $contenido = $item['content'] ?? null;
                if (!is_array($contenido)) {
                    continue;
                }

                foreach ($contenido as $bloque) {
                    if (!is_array($bloque)) {
                        continue;
                    }

                    if (isset($bloque['text']) && is_string($bloque['text'])) {
                        $partes[] = $bloque['text'];
                    }
                }
            }
        }

        return trim(implode("\n", $partes));
    }
}

if (!function_exists('stock_oai_normalizar_producto')) {
    function stock_oai_normalizar_producto(array $item): array
    {
        $nombre = trim((string)($item['nombre'] ?? ''));
        $sku = trim((string)($item['sku'] ?? ''));

        $precio = $item['precio'] ?? null;
        $precioPromo = $item['precio_promo'] ?? null;
        $stock = $item['stock'] ?? null;
        $descripcion = trim((string)($item['descripcion'] ?? ''));
        $idCategoria = $item['id_categoria_stock'] ?? null;

        $normalizarDecimal = static function ($valor): ?string {
            if ($valor === null) {
                return null;
            }

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
        };

        $normalizarEntero = static function ($valor): ?int {
            if ($valor === null) {
                return null;
            }

            $v = trim((string)$valor);
            if ($v === '') {
                return null;
            }

            $v = preg_replace('/[^\d\-]/', '', $v);
            if ($v === '' || !preg_match('/^-?\d+$/', $v)) {
                return null;
            }

            return (int)$v;
        };

        return [
            'nombre'             => ($nombre !== '' ? $nombre : null),
            'sku'                => ($sku !== '' ? $sku : null),
            'precio'             => $normalizarDecimal($precio),
            'precio_promo'       => $normalizarDecimal($precioPromo),
            'stock'              => $normalizarEntero($stock),
            'descripcion'        => ($descripcion !== '' ? $descripcion : null),
            'id_categoria_stock' => (is_numeric($idCategoria) ? (int)$idCategoria : null),
        ];
    }
}

if (!function_exists('stock_oai_clasificar_texto')) {
    function stock_oai_clasificar_texto(string $texto): array
    {
        $apiKey = stock_oai_resolver_api_key();

        $promptSistema = <<<TXT
Sos un sistema que convierte texto OCR o texto extraído de PDF en productos estructurados para una base de datos.

Debés responder EXCLUSIVAMENTE con JSON válido.
No agregues explicación, markdown ni texto extra.

Formato exacto de salida:
{
  "productos": [
    {
      "nombre": "string|null",
      "sku": "string|null",
      "precio": "decimal|null",
      "precio_promo": "decimal|null",
      "stock": integer|null,
      "descripcion": "string|null",
      "id_categoria_stock": null
    }
  ]
}

Reglas:
- No inventes datos que no estén.
- Si un campo no es claro, devolvé null.
- precio y precio_promo deben devolverse con punto decimal, por ejemplo: "89999.00"
- stock debe ser entero.
- Si detectás varios productos, devolvelos todos.
- Si no hay productos confiables, devolvé {"productos":[]}
TXT;

        $payload = [
            'model' => 'gpt-4.1-mini',
            'input' => [
                [
                    'role' => 'system',
                    'content' => [
                        [
                            'type' => 'input_text',
                            'text' => $promptSistema,
                        ],
                    ],
                ],
                [
                    'role' => 'user',
                    'content' => [
                        [
                            'type' => 'input_text',
                            'text' => "Texto a clasificar:\n\n" . $texto,
                        ],
                    ],
                ],
            ],
        ];

        $response = stock_oai_http_post_json(
            'https://api.openai.com/v1/responses',
            $payload,
            [
                'Authorization: Bearer ' . $apiKey,
            ],
            120
        );

        $status = (int)($response['status'] ?? 0);
        $bodyRaw = (string)($response['body'] ?? '');
        $body = json_decode($bodyRaw, true);

        if (!is_array($body)) {
            throw new RuntimeException('OpenAI devolvió una respuesta inválida.');
        }

        if ($status < 200 || $status >= 300) {
            $mensaje = $body['error']['message'] ?? ('HTTP ' . $status . ' al consultar OpenAI.');
            throw new RuntimeException((string)$mensaje);
        }

        $textoIA = stock_oai_extraer_output_text($body);

        if ($textoIA === '') {
            stock_oai_log_error('openai_output_vacio', [
                'respuesta' => $body,
            ]);
            throw new RuntimeException('OpenAI devolvió una respuesta vacía.');
        }

        $json = json_decode($textoIA, true);

        if (!is_array($json) || !isset($json['productos']) || !is_array($json['productos'])) {
            stock_oai_log_error('openai_json_invalido', [
                'texto_ia' => $textoIA,
            ]);
            throw new RuntimeException('OpenAI no devolvió un JSON válido de productos.');
        }

        $productos = [];
        foreach ($json['productos'] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $productos[] = stock_oai_normalizar_producto($item);
        }

        return $productos;
    }
}

if (!function_exists('stock_productos_clasificar_texto')) {
    function stock_productos_clasificar_texto(?PDO $pdo = null): void
    {
        unset($pdo);
        stock_oai_require_methods(['POST']);

        try {
            $raw = file_get_contents('php://input');
            $input = json_decode((string)$raw, true);

            if (!is_array($input)) {
                throw new RuntimeException('El body debe ser JSON válido.');
            }

            $texto = stock_oai_limpiar_texto((string)($input['texto'] ?? ''));
            if ($texto === '') {
                throw new RuntimeException('Texto vacío.');
            }

            stock_oai_log_error('clasificacion_inicio', [
                'caracteres_entrada' => mb_strlen($texto, 'UTF-8'),
                'preview'            => mb_substr($texto, 0, 1000, 'UTF-8'),
            ]);

            $productos = stock_oai_clasificar_texto($texto);

            stock_oai_log_error('clasificacion_ok', [
                'cantidad_productos' => count($productos),
            ]);

            stock_oai_ok([
                'mensaje'   => 'Texto clasificado correctamente.',
                'productos' => $productos,
            ]);
        } catch (Throwable $e) {
            stock_oai_log_error('clasificacion_error', [
                'mensaje' => $e->getMessage(),
                'archivo' => $e->getFile(),
                'linea'   => $e->getLine(),
            ]);

            stock_oai_fail('Error al clasificar texto: ' . $e->getMessage(), 500);
        }
    }
}

if (!function_exists('stock_productos_clasificar_texto_handle')) {
    function stock_productos_clasificar_texto_handle(string $action, ?PDO $pdo = null): void
    {
        $action = mb_strtolower(trim($action), 'UTF-8');
        $pdo = stock_oai_get_pdo($pdo);

        switch ($action) {
            case 'stock_productos_clasificar_texto':
            case 'stock_producto_clasificar_texto':
                stock_productos_clasificar_texto($pdo);
                return;

            default:
                stock_oai_fail('Acción de clasificación inválida.', 404, [
                    'action' => $action,
                ]);
        }
    }
}