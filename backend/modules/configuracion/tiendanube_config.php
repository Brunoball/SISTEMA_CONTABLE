<?php
declare(strict_types=1);

/**
 * api/modules/configuracion/tiendanube_config.php
 */

if (!function_exists('tn_cfg_env')) {
    function tn_cfg_env(string $key, ?string $default = null): ?string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);

        if ($value === false || $value === null || $value === '') {
            return $default;
        }

        return (string)$value;
    }
}

if (!function_exists('tn_cfg')) {
    function tn_cfg(): array
    {
        $publicApiBase = rtrim((string)tn_cfg_env('BALTO_PUBLIC_API_URL', 'https://balto.3devsnet.com/api'), '/');
        $frontBase     = rtrim((string)tn_cfg_env('BALTO_FRONT_URL', 'https://balto.3devsnet.com'), '/');

        return [
            'app_id'        => trim((string)tn_cfg_env('TIENDANUBE_APP_ID', '')),
            'app_name'      => trim((string)tn_cfg_env('TIENDANUBE_APP_NAME', 'Balto ERP')),
            'client_secret' => trim((string)tn_cfg_env('TIENDANUBE_CLIENT_SECRET', tn_cfg_env('TN_CLIENT_SECRET', ''))),

            'authorize_base' => rtrim((string)tn_cfg_env('TIENDANUBE_AUTHORIZE_BASE', 'https://www.tiendanube.com/apps'), '/'),
            'token_url'      => trim((string)tn_cfg_env('TIENDANUBE_TOKEN_URL', 'https://www.tiendanube.com/apps/authorize/token')),
            'api_base'       => rtrim((string)tn_cfg_env('TIENDANUBE_API_BASE', 'https://api.tiendanube.com/v1'), '/'),

            'callback_url' => trim((string)tn_cfg_env(
                'TIENDANUBE_CALLBACK_URL',
                $publicApiBase . '/modules/tiendanube/callback.php'
            )),

            'webhook_url' => trim((string)tn_cfg_env(
                'TIENDANUBE_WEBHOOK_URL',
                $publicApiBase . '/modules/tiendanube/webhook.php'
            )),

            'after_connect_front_url' => trim((string)tn_cfg_env(
                'TIENDANUBE_AFTER_CONNECT_FRONT_URL',
                $frontBase . '/configuracion/tiendanube'
            )),

            'scopes' => trim((string)tn_cfg_env(
                'TIENDANUBE_SCOPES',
                'read_orders,write_orders,read_products,write_products,read_customers,write_customers'
            )),

            'webhook_events' => [
                'app/uninstalled',
                'order/created',
                'order/updated',
                'order/paid',
                'order/cancelled',
                'product/created',
                'product/updated',
                'product/deleted',
                'customer/created',
                'customer/updated',
            ],

            'log_file' => __DIR__ . '/logs/tiendanube_config.log',
        ];
    }
}