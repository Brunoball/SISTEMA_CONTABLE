<?php
declare(strict_types=1);

use Aws\S3\S3Client;

if (!function_exists('balto_load_env')) {
    require_once dirname(__DIR__, 3) . '/config/bootstrap_env.php';
}

require_once dirname(__DIR__, 3) . '/r2_storage/vendor/autoload.php';

if (!function_exists('mvx_r2_env')) {
    function mvx_r2_env(string $key, ?string $default = null): ?string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
        if ($value === false || $value === null || $value === '') {
            return $default;
        }
        return trim((string)$value);
    }
}



if (!function_exists('mvx_public_api_php_abs_url')) {
    /**
     * URL pública del router API para guardar en comprobantes_archivos.archivo_url.
     *
     * Prioridad:
     * 1) APP_PUBLIC_API_URL / BALTO_PUBLIC_API_URL / PUBLIC_API_URL en .env
     * 2) Host real de la request actual, respetando proxy/Cloudflare
     *
     * Ejemplo recomendado en .env de Hostinger:
     * APP_PUBLIC_API_URL=https://app.balto.com.ar/api/routes/api.php
     */
    function mvx_public_api_php_abs_url(?string $script = null): string
    {
        $forced = mvx_r2_env('APP_PUBLIC_API_URL')
            ?: mvx_r2_env('BALTO_PUBLIC_API_URL')
            ?: mvx_r2_env('PUBLIC_API_URL');

        if ($forced) {
            return rtrim($forced, '/');
        }

        $scheme = 'http';
        if (
            (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
        ) {
            $scheme = 'https';
        }

        if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
            $proto = strtolower(trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_PROTO'])[0]));
            if ($proto === 'https' || $proto === 'http') {
                $scheme = $proto;
            }
        }

        $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '';
        $host = trim(explode(',', (string)$host)[0]);
        if ($host === '') {
            $host = 'app.balto.com.ar';
        }

        $script = $script !== null ? $script : (string)($_SERVER['SCRIPT_NAME'] ?? '');
        $script = str_replace('\\', '/', trim($script));

        $posRoutes = strpos($script, '/api/routes/api.php');
        if ($posRoutes !== false) {
            $prefix = substr($script, 0, $posRoutes);
            return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
        }

        $posApi = strpos($script, '/api.php');
        if ($posApi !== false) {
            $prefix = substr($script, 0, $posApi);
            return $scheme . '://' . $host . $prefix . '/api.php';
        }

        return $scheme . '://' . $host . '/api/routes/api.php';
    }
}

if (!function_exists('mvx_r2_client')) {
    function mvx_r2_client(): S3Client
    {
        $endpoint = mvx_r2_env('R2_ENDPOINT');
        $accessKey = mvx_r2_env('R2_ACCESS_KEY');
        $secretKey = mvx_r2_env('R2_SECRET_KEY');

        if (!$endpoint || !$accessKey || !$secretKey) {
            throw new RuntimeException('Faltan variables R2_ENDPOINT, R2_ACCESS_KEY o R2_SECRET_KEY.');
        }

        return new S3Client([
            'version' => 'latest',
            'region' => 'auto',
            'endpoint' => $endpoint,
            'use_path_style_endpoint' => true,
            'signature_version' => 'v4',
            'credentials' => [
                'key' => $accessKey,
                'secret' => $secretKey,
            ],
        ]);
    }
}

if (!function_exists('mvx_r2_bucket')) {
    function mvx_r2_bucket(): string
    {
        $bucket = mvx_r2_env('R2_BUCKET');
        if (!$bucket) {
            throw new RuntimeException('Falta R2_BUCKET.');
        }
        return $bucket;
    }
}

if (!function_exists('mvx_r2_base_prefix')) {
    /**
     * Prefix/carpeta base dentro del bucket R2.
     *
     * En producción usar en .env:
     * R2_BASE_PREFIX=produccion
     *
     * Sin barra inicial ni final. Si no se configura, conserva el comportamiento histórico: uploads.
     */
    function mvx_r2_base_prefix(): string
    {
        $prefix = mvx_r2_env('R2_BASE_PREFIX', 'uploads') ?: 'uploads';
        $prefix = str_replace('\\', '/', trim($prefix));
        $prefix = trim($prefix, "/ \t\n\r\0\x0B");
        $prefix = preg_replace('#/+#', '/', $prefix);
        return $prefix !== '' ? $prefix : 'uploads';
    }
}

if (!function_exists('mvx_r2_safe_filename')) {
    function mvx_r2_safe_filename(string $filename): string
    {
        $safe = preg_replace('/[^A-Za-z0-9._-]/', '_', basename($filename));
        return $safe !== '' ? $safe : 'archivo.bin';
    }
}

if (!function_exists('mvx_r2_build_comprobante_key')) {
    function mvx_r2_build_comprobante_key(int $tenantId, string $tipoFolder, string $filename): string
    {
        $tenantId = max(1, (int)$tenantId);
        $safeTipo = trim(preg_replace('/[^a-z0-9_-]+/i', '_', strtolower($tipoFolder)), '_');
        if ($safeTipo === '') $safeTipo = 'otros';

        return sprintf(
            '%s/tenants/t_%d/comprobantes/%s/%s/%s',
            mvx_r2_base_prefix(),
            $tenantId,
            date('Y'),
            date('m'),
            $safeTipo . '/' . mvx_r2_safe_filename($filename)
        );
    }
}

if (!function_exists('mvx_r2_put_file')) {
    function mvx_r2_put_file(string $localPath, string $key, string $contentType = 'application/octet-stream', array $extra = []): void
    {
        if ($localPath === '' || !is_file($localPath)) {
            throw new RuntimeException('Archivo local inexistente para subir a R2.');
        }

        $client = mvx_r2_client();
        $params = array_merge([
            'Bucket' => mvx_r2_bucket(),
            'Key' => ltrim($key, '/'),
            'SourceFile' => $localPath,
            'ContentType' => $contentType !== '' ? $contentType : 'application/octet-stream',
        ], $extra);

        $client->putObject($params);
    }
}

if (!function_exists('mvx_r2_delete_object')) {
    function mvx_r2_delete_object(string $key): void
    {
        $key = ltrim(trim($key), '/');
        if ($key === '') return;

        $client = mvx_r2_client();
        $client->deleteObject([
            'Bucket' => mvx_r2_bucket(),
            'Key' => $key,
        ]);
    }
}

if (!function_exists('mvx_r2_create_get_signed_url')) {
    function mvx_r2_create_get_signed_url(string $key, string $expires = '+20 minutes', array $extra = []): string
    {
        $client = mvx_r2_client();

        $params = array_merge([
            'Bucket' => mvx_r2_bucket(),
            'Key' => ltrim($key, '/'),
        ], $extra);

        $cmd = $client->getCommand('GetObject', $params);
        $request = $client->createPresignedRequest($cmd, $expires);
        return (string)$request->getUri();
    }
}
