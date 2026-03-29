<?php
declare(strict_types=1);

require_once __DIR__ . '/tiendanube_db.php';

if (!function_exists('tn_base64url_encode')) {
    function tn_base64url_encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}

if (!function_exists('tn_base64url_decode')) {
    function tn_base64url_decode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/')) ?: '';
    }
}

if (!function_exists('tn_build_state')) {
    function tn_build_state(int $idTenant): string
    {
        $payload = [
            'idTenant' => $idTenant,
            'ts'       => time(),
            'nonce'    => bin2hex(random_bytes(12)),
        ];

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return tn_base64url_encode((string)$json);
    }
}

if (!function_exists('tn_parse_state')) {
    function tn_parse_state(?string $state): array
    {
        $state = trim((string)$state);
        if ($state === '') {
            return [];
        }

        $decoded = tn_base64url_decode($state);
        if ($decoded === '') {
            return [];
        }

        $data = json_decode($decoded, true);
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('tn_build_authorize_url')) {
    function tn_build_authorize_url(int $idTenant): string
    {
        $cfg = tn_cfg();

        if (empty($cfg['app_id'])) {
            throw new RuntimeException('Falta TIENDANUBE_APP_ID en el entorno.');
        }

        if (empty($cfg['callback_url'])) {
            throw new RuntimeException('Falta TIENDANUBE_CALLBACK_URL en el entorno.');
        }

        $state = tn_build_state($idTenant);

        $qs = http_build_query([
            'state'        => $state,
            'redirect_uri' => $cfg['callback_url'],
        ]);

        return rtrim($cfg['authorize_base'], '/') . '/' . rawurlencode((string)$cfg['app_id']) . '/authorize?' . $qs;
    }
}

if (!function_exists('tn_api_request')) {
    function tn_api_request(
        string $method,
        int $storeId,
        string $accessToken,
        string $path,
        ?array $body = null
    ): array {
        $cfg = tn_cfg();

        $url = rtrim($cfg['api_base'], '/') . '/' . $storeId . '/' . ltrim($path, '/');

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authentication: bearer ' . $accessToken,
            'User-Agent: ' . ($cfg['app_name'] ?: 'Balto ERP') . ' (' . ($cfg['app_id'] ?: 'no-app-id') . ')',
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => strtoupper($method),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 45,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno) {
            throw new RuntimeException('Error cURL Tienda Nube: ' . $error);
        }

        $json = json_decode((string)$raw, true);

        return [
            'status' => $status,
            'raw'    => (string)$raw,
            'json'   => is_array($json) ? $json : null,
        ];
    }
}

if (!function_exists('tn_exchange_code_for_token')) {
    function tn_exchange_code_for_token(string $code): array
    {
        $cfg = tn_cfg();

        if ($code === '') {
            throw new RuntimeException('Falta code para pedir token.');
        }

        if (empty($cfg['app_id']) || empty($cfg['client_secret'])) {
            throw new RuntimeException('Faltan credenciales de Tienda Nube en el entorno.');
        }

        $payload = [
            'client_id'     => $cfg['app_id'],
            'client_secret' => $cfg['client_secret'],
            'grant_type'    => 'authorization_code',
            'code'          => $code,
        ];

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'User-Agent: ' . ($cfg['app_name'] ?: 'Balto ERP') . ' (' . ($cfg['app_id'] ?: 'no-app-id') . ')',
        ];

        $ch = curl_init($cfg['token_url']);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 45,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno) {
            throw new RuntimeException('Error cURL al pedir token: ' . $error);
        }

        $json = json_decode((string)$raw, true);

        if (!is_array($json)) {
            throw new RuntimeException('Tiendanube devolvió una respuesta inválida al pedir token. RAW: ' . (string)$raw);
        }

        if (isset($json['error'])) {
            $desc = trim((string)($json['error_description'] ?? $json['error']));
            throw new RuntimeException('Error OAuth Tiendanube: ' . $desc);
        }

        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('Tiendanube rechazó el token. HTTP ' . $status . ' | ' . json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }

        return $json;
    }
}

if (!function_exists('tn_get_existing_webhooks')) {
    function tn_get_existing_webhooks(int $storeId, string $accessToken): array
    {
        $res = tn_api_request('GET', $storeId, $accessToken, '/webhooks');

        if ($res['status'] < 200 || $res['status'] >= 300) {
            throw new RuntimeException(
                'No se pudieron leer los webhooks existentes. HTTP ' . $res['status'] . ' | ' . $res['raw']
            );
        }

        return is_array($res['json']) ? $res['json'] : [];
    }
}

if (!function_exists('tn_upsert_webhook')) {
    function tn_upsert_webhook(int $storeId, string $accessToken, string $event, string $url, array $existingHooks): array
    {
        $sameEvent = array_values(array_filter($existingHooks, static function ($hook) use ($event) {
            return (string)($hook['event'] ?? '') === $event;
        }));

        foreach ($sameEvent as $hook) {
            if ((string)($hook['url'] ?? '') === $url) {
                return [
                    'event' => $event,
                    'action' => 'kept',
                    'id' => (int)($hook['id'] ?? 0),
                ];
            }
        }

        if (!empty($sameEvent)) {
            $hookId = (int)($sameEvent[0]['id'] ?? 0);

            $res = tn_api_request('PUT', $storeId, $accessToken, '/webhooks/' . $hookId, [
                'event' => $event,
                'url'   => $url,
            ]);

            if ($res['status'] < 200 || $res['status'] >= 300) {
                throw new RuntimeException(
                    "No se pudo actualizar el webhook {$event}. HTTP {$res['status']} | {$res['raw']}"
                );
            }

            return [
                'event' => $event,
                'action' => 'updated',
                'id' => $hookId,
            ];
        }

        $res = tn_api_request('POST', $storeId, $accessToken, '/webhooks', [
            'event' => $event,
            'url'   => $url,
        ]);

        if ($res['status'] < 200 || $res['status'] >= 300) {
            throw new RuntimeException(
                "No se pudo crear el webhook {$event}. HTTP {$res['status']} | {$res['raw']}"
            );
        }

        return [
            'event' => $event,
            'action' => 'created',
            'id' => (int)($res['json']['id'] ?? 0),
        ];
    }
}

if (!function_exists('tn_configure_webhooks_for_tenant')) {
    function tn_configure_webhooks_for_tenant(int $idTenant): array
    {
        $pdo = tn_master_pdo();
        $cfg = tn_cfg();

        $conn = tn_get_connection($pdo, $idTenant);
        if (!$conn || empty($conn['connected'])) {
            throw new RuntimeException('La tienda no está conectada para este tenant.');
        }

        $storeId = (int)($conn['store_id'] ?? 0);
        $token   = trim((string)($conn['access_token'] ?? ''));

        if ($storeId <= 0) {
            throw new RuntimeException('No se encontró store_id en la conexión.');
        }

        if ($token === '') {
            throw new RuntimeException('No se encontró access_token en la conexión.');
        }

        $webhookUrl = trim((string)($cfg['webhook_url'] ?? ''));
        if ($webhookUrl === '') {
            throw new RuntimeException('No está configurada la URL pública del webhook.');
        }

        $existing = tn_get_existing_webhooks($storeId, $token);
        $results = [];

        foreach (($cfg['webhook_events'] ?? []) as $event) {
            $results[] = tn_upsert_webhook($storeId, $token, (string)$event, $webhookUrl, $existing);
        }

        tn_mark_webhooks_configured($pdo, $idTenant, true);

        return [
            'store_id' => $storeId,
            'webhook_url' => $webhookUrl,
            'results' => $results,
        ];
    }
}