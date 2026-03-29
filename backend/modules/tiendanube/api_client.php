<?php
declare(strict_types=1);

require_once __DIR__ . '/../configuracion/tiendanube_service.php';

if (!function_exists('tn_api_request')) {
    function tn_api_request(
        string $method,
        int $storeId,
        string $accessToken,
        string $path,
        ?array $body = null,
        array $query = []
    ): array {
        $cfg = tn_cfg();

        if ($storeId <= 0) {
            throw new RuntimeException('storeId inválido para llamar API de Tienda Nube.');
        }

        if (trim($accessToken) === '') {
            throw new RuntimeException('accessToken vacío para llamar API de Tienda Nube.');
        }

        $url = rtrim((string)$cfg['api_base'], '/') . '/' . $storeId . '/' . ltrim($path, '/');

        if (!empty($query)) {
            $url .= (str_contains($url, '?') ? '&' : '?') . http_build_query($query);
        }

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authentication: bearer ' . $accessToken,
            'User-Agent: ' . (($cfg['app_name'] ?? 'Balto ERP') ?: 'Balto ERP') . ' (' . (($cfg['app_id'] ?? 'no-app-id') ?: 'no-app-id') . ')',
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
            curl_setopt(
                $ch,
                CURLOPT_POSTFIELDS,
                json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
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
            'url'    => $url,
        ];
    }
}

if (!function_exists('tn_api_get_order')) {
    function tn_api_get_order(int $storeId, string $accessToken, int $orderId): array
    {
        if ($orderId <= 0) {
            throw new RuntimeException('orderId inválido.');
        }

        $res = tn_api_request('GET', $storeId, $accessToken, '/orders/' . $orderId);

        if ($res['status'] < 200 || $res['status'] >= 300 || !is_array($res['json'])) {
            throw new RuntimeException(
                'No se pudo obtener la orden ' . $orderId . '. HTTP ' . $res['status'] . ' | RAW: ' . $res['raw']
            );
        }

        return $res['json'];
    }
}

if (!function_exists('tn_api_list_orders')) {
    function tn_api_list_orders(
        int $storeId,
        string $accessToken,
        array $filters = []
    ): array {
        $query = array_merge([
            'page' => 1,
            'per_page' => 30,
        ], $filters);

        $res = tn_api_request('GET', $storeId, $accessToken, '/orders', null, $query);

        if ($res['status'] < 200 || $res['status'] >= 300) {
            throw new RuntimeException(
                'No se pudieron listar órdenes. HTTP ' . $res['status'] . ' | RAW: ' . $res['raw']
            );
        }

        return is_array($res['json']) ? $res['json'] : [];
    }
}

if (!function_exists('tn_api_get_store')) {
    function tn_api_get_store(int $storeId, string $accessToken): array
    {
        $res = tn_api_request('GET', $storeId, $accessToken, '/store');

        if ($res['status'] < 200 || $res['status'] >= 300 || !is_array($res['json'])) {
            throw new RuntimeException(
                'No se pudo obtener /store. HTTP ' . $res['status'] . ' | RAW: ' . $res['raw']
            );
        }

        return $res['json'];
    }
}

if (!function_exists('tn_api_list_products_page')) {
    function tn_api_list_products_page(
        int $storeId,
        string $accessToken,
        array $filters = []
    ): array {
        $query = array_merge([
            'page' => 1,
            'per_page' => 30,
        ], $filters);

        $res = tn_api_request('GET', $storeId, $accessToken, '/products', null, $query);

        if ($res['status'] < 200 || $res['status'] >= 300) {
            throw new RuntimeException(
                'No se pudieron listar productos. HTTP ' . $res['status'] . ' | RAW: ' . $res['raw']
            );
        }

        return is_array($res['json']) ? $res['json'] : [];
    }
}

if (!function_exists('tn_api_get_product')) {
    function tn_api_get_product(int $storeId, string $accessToken, int $productId): array
    {
        if ($productId <= 0) {
            throw new RuntimeException('productId inválido.');
        }

        $res = tn_api_request('GET', $storeId, $accessToken, '/products/' . $productId);

        if ($res['status'] < 200 || $res['status'] >= 300 || !is_array($res['json'])) {
            throw new RuntimeException(
                'No se pudo obtener el producto ' . $productId . '. HTTP ' . $res['status'] . ' | RAW: ' . $res['raw']
            );
        }

        return $res['json'];
    }
}