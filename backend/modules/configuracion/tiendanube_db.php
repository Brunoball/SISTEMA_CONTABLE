<?php
declare(strict_types=1);

/**
 * api/modules/configuracion/tiendanube_db.php
 */

require_once __DIR__ . '/../../config/db_master.php';
require_once __DIR__ . '/tiendanube_config.php';

if (!function_exists('tn_log')) {
    function tn_log(string $message, array $context = []): void
    {
        $cfg = tn_cfg();
        $file = $cfg['log_file'] ?? (__DIR__ . '/logs/tiendanube_config.log');

        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $line = '[' . date('Y-m-d H:i:s') . '] ' . $message;
        if (!empty($context)) {
            $line .= ' | ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        $line .= PHP_EOL;

        @file_put_contents($file, $line, FILE_APPEND);
    }
}

if (!function_exists('tn_json_response')) {
    function tn_json_response(int $status, array $payload): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('tn_read_json_body')) {
    function tn_read_json_body(): array
    {
        static $cache = null;

        if ($cache !== null) {
            return $cache;
        }

        $raw = file_get_contents('php://input');
        if (!$raw) {
            $cache = [];
            return $cache;
        }

        $data = json_decode($raw, true);
        $cache = is_array($data) ? $data : [];
        return $cache;
    }
}

if (!function_exists('tn_get_request_value')) {
    function tn_get_request_value(string $key, $default = null)
    {
        if (array_key_exists($key, $_GET)) {
            return $_GET[$key];
        }

        if (array_key_exists($key, $_POST)) {
            return $_POST[$key];
        }

        $body = tn_read_json_body();
        if (array_key_exists($key, $body)) {
            return $body[$key];
        }

        return $default;
    }
}

if (!function_exists('tn_get_tenant_id')) {
    function tn_get_tenant_id(): int
    {
        $idTenant = (int)tn_get_request_value('idTenant', 0);

        if ($idTenant <= 0) {
            $idTenant = (int)($_SESSION['idTenant'] ?? 0);
        }

        if ($idTenant <= 0) {
            $idTenant = (int)($_SESSION['tenant_id'] ?? 0);
        }

        if ($idTenant <= 0) {
            $idTenant = (int)($_SERVER['HTTP_X_IDTENANT'] ?? 0);
        }

        if ($idTenant <= 0) {
            $idTenant = (int)($_SERVER['HTTP_X_ID_TENANT'] ?? 0);
        }

        return $idTenant > 0 ? $idTenant : 0;
    }
}

if (!function_exists('tn_master_pdo')) {
    function tn_master_pdo(): PDO
    {
        global $pdo_master;

        if (!isset($pdo_master) || !($pdo_master instanceof PDO)) {
            throw new RuntimeException('PDO master no disponible desde config/db_master.php');
        }

        $pdo_master->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo_master->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        return $pdo_master;
    }
}

if (!function_exists('tn_get_connection')) {
    function tn_get_connection(PDO $pdo, int $idTenant): ?array
    {
        $sql = "
            SELECT *
            FROM tiendanube_conexiones_master
            WHERE idTenant = :idTenant
            ORDER BY id_conexion DESC
            LIMIT 1
        ";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':idTenant' => $idTenant,
        ]);

        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('tn_get_connection_by_store_id')) {
    function tn_get_connection_by_store_id(PDO $pdo, int $storeId): ?array
    {
        $sql = "
            SELECT *
            FROM tiendanube_conexiones_master
            WHERE store_id = :store_id
              AND connected = 1
            ORDER BY id_conexion DESC
            LIMIT 1
        ";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':store_id' => $storeId,
        ]);

        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('tn_save_connection')) {
    function tn_save_connection(PDO $pdo, array $data): void
    {
        $idTenant   = (int)($data['idTenant'] ?? 0);
        $storeId    = (string)($data['store_id'] ?? '');
        $userId     = (string)($data['user_id'] ?? '');
        $appId      = (string)($data['app_id'] ?? '');
        $appName    = (string)($data['app_name'] ?? '');
        $access     = (string)($data['access_token'] ?? '');
        $scope      = (string)($data['scope'] ?? '');
        $connected  = !empty($data['connected']) ? 1 : 0;
        $webhooks   = !empty($data['webhooks_configured']) ? 1 : 0;

        if ($idTenant <= 0) {
            throw new RuntimeException('idTenant inválido al guardar conexión Tienda Nube.');
        }

        $exists = tn_get_connection($pdo, $idTenant);

        if ($exists) {
            $sql = "
                UPDATE tiendanube_conexiones_master
                SET
                    store_id = :store_id,
                    user_id = :user_id,
                    app_id = :app_id,
                    app_name = :app_name,
                    access_token = :access_token,
                    scope = :scope,
                    connected = :connected,
                    webhooks_configured = :webhooks_configured,
                    updated_at = NOW()
                WHERE id_conexion = :id_conexion
            ";
            $st = $pdo->prepare($sql);
            $st->execute([
                ':store_id' => $storeId !== '' ? $storeId : null,
                ':user_id' => $userId !== '' ? $userId : null,
                ':app_id' => $appId !== '' ? $appId : null,
                ':app_name' => $appName !== '' ? $appName : null,
                ':access_token' => $access !== '' ? $access : null,
                ':scope' => $scope !== '' ? $scope : null,
                ':connected' => $connected,
                ':webhooks_configured' => $webhooks,
                ':id_conexion' => (int)$exists['id_conexion'],
            ]);
            return;
        }

        $sql = "
            INSERT INTO tiendanube_conexiones_master
            (
                idTenant,
                store_id,
                user_id,
                app_id,
                app_name,
                access_token,
                connected,
                scope,
                webhooks_configured,
                updated_at
            )
            VALUES
            (
                :idTenant,
                :store_id,
                :user_id,
                :app_id,
                :app_name,
                :access_token,
                :connected,
                :scope,
                :webhooks_configured,
                NOW()
            )
        ";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':idTenant' => $idTenant,
            ':store_id' => $storeId !== '' ? $storeId : null,
            ':user_id' => $userId !== '' ? $userId : null,
            ':app_id' => $appId !== '' ? $appId : null,
            ':app_name' => $appName !== '' ? $appName : null,
            ':access_token' => $access !== '' ? $access : null,
            ':connected' => $connected,
            ':scope' => $scope !== '' ? $scope : null,
            ':webhooks_configured' => $webhooks,
        ]);
    }
}

if (!function_exists('tn_disconnect_connection')) {
    function tn_disconnect_connection(PDO $pdo, int $idTenant): void
    {
        $sql = "
            UPDATE tiendanube_conexiones_master
            SET
                connected = 0,
                webhooks_configured = 0,
                updated_at = NOW()
            WHERE idTenant = :idTenant
        ";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':idTenant' => $idTenant,
        ]);
    }
}

if (!function_exists('tn_mark_webhooks_configured')) {
    function tn_mark_webhooks_configured(PDO $pdo, int $idTenant, bool $configured): void
    {
        $sql = "
            UPDATE tiendanube_conexiones_master
            SET
                webhooks_configured = :configured,
                updated_at = NOW()
            WHERE idTenant = :idTenant
        ";
        $st = $pdo->prepare($sql);
        $st->execute([
            ':configured' => $configured ? 1 : 0,
            ':idTenant' => $idTenant,
        ]);
    }
}

if (!function_exists('tn_connection_status_payload')) {
    function tn_connection_status_payload(?array $row): array
    {
        if (!$row) {
            return [
                'connected' => false,
                'store_id' => '',
                'user_id' => '',
                'app_id' => '',
                'app_name' => '',
                'scope' => '',
                'webhooks_configured' => false,
                'updated_at' => '',
            ];
        }

        return [
            'connected' => !empty($row['connected']),
            'store_id' => (string)($row['store_id'] ?? ''),
            'user_id' => (string)($row['user_id'] ?? ''),
            'app_id' => (string)($row['app_id'] ?? ''),
            'app_name' => (string)($row['app_name'] ?? ''),
            'scope' => (string)($row['scope'] ?? ''),
            'webhooks_configured' => !empty($row['webhooks_configured']),
            'updated_at' => (string)($row['updated_at'] ?? ''),
        ];
    }
}