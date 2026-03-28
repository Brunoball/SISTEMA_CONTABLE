<?php
declare(strict_types=1);

require_once __DIR__ . '/api_client.php';

if (!function_exists('tn_sync_cfg')) {
    function tn_sync_cfg(): array
    {
        return [
            // Ajustalos a tus IDs reales si querés
            'id_tipo_operacion_venta' => (int)($_ENV['TN_SYNC_ID_TIPO_OPERACION_VENTA'] ?? $_SERVER['TN_SYNC_ID_TIPO_OPERACION_VENTA'] ?? getenv('TN_SYNC_ID_TIPO_OPERACION_VENTA') ?: 1),
            'id_tipo_venta_tiendanube' => (int)($_ENV['TN_SYNC_ID_TIPO_VENTA'] ?? $_SERVER['TN_SYNC_ID_TIPO_VENTA'] ?? getenv('TN_SYNC_ID_TIPO_VENTA') ?: 0),
            'id_medio_pago_default' => (int)($_ENV['TN_SYNC_ID_MEDIO_PAGO'] ?? $_SERVER['TN_SYNC_ID_MEDIO_PAGO'] ?? getenv('TN_SYNC_ID_MEDIO_PAGO') ?: 0),
            'solo_pagadas' => (int)($_ENV['TN_SYNC_SOLO_PAGADAS'] ?? $_SERVER['TN_SYNC_SOLO_PAGADAS'] ?? getenv('TN_SYNC_SOLO_PAGADAS') ?: 1) === 1,
        ];
    }
}

if (!function_exists('tn_sync_log')) {
    function tn_sync_log(string $msg, array $context = []): void
    {
        $dir = __DIR__ . '/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg;
        if (!empty($context)) {
            $line .= ' | ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        $line .= PHP_EOL;

        @file_put_contents($dir . '/tiendanube_order_sync.log', $line, FILE_APPEND);
    }
}

if (!function_exists('tn_sync_get_tenant_row')) {
    function tn_sync_get_tenant_row(PDO $pdoMaster, int $idTenant): ?array
    {
        $sql = "
            SELECT idTenant, nombre, db_host, db_name, db_user, db_pass, activo
            FROM tenants
            WHERE idTenant = :idTenant
            LIMIT 1
        ";
        $st = $pdoMaster->prepare($sql);
        $st->execute([':idTenant' => $idTenant]);

        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('tn_sync_connect_tenant_db')) {
    function tn_sync_connect_tenant_db(array $tenant): PDO
    {
        $host = (string)($tenant['db_host'] ?? '');
        $db   = (string)($tenant['db_name'] ?? '');
        $user = (string)($tenant['db_user'] ?? '');
        $pass = (string)($tenant['db_pass'] ?? '');

        if ($host === '' || $db === '' || $user === '') {
            throw new RuntimeException('Credenciales incompletas para conectar DB tenant.');
        }

        $dsn = "mysql:host={$host};dbname={$db};charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        return $pdo;
    }
}

if (!function_exists('tn_sync_ensure_schema')) {
    function tn_sync_ensure_schema(PDO $pdoTenant): void
    {
        $sql = "
            CREATE TABLE IF NOT EXISTS tiendanube_sync_orders (
                id_sync BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                tn_order_id BIGINT UNSIGNED NOT NULL,
                store_id BIGINT UNSIGNED NOT NULL,
                id_movimiento INT(10) UNSIGNED DEFAULT NULL,
                payment_status VARCHAR(50) DEFAULT NULL,
                order_status VARCHAR(50) DEFAULT NULL,
                total DECIMAL(12,2) DEFAULT NULL,
                moneda VARCHAR(10) DEFAULT NULL,
                imported TINYINT(1) NOT NULL DEFAULT 0,
                payload_json LONGTEXT NULL,
                resumen_json LONGTEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id_sync),
                UNIQUE KEY uniq_tn_order_id (tn_order_id),
                KEY idx_store_id (store_id),
                KEY idx_id_movimiento (id_movimiento)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ";
        $pdoTenant->exec($sql);
    }
}

if (!function_exists('tn_sync_find_existing')) {
    function tn_sync_find_existing(PDO $pdoTenant, int $orderId): ?array
    {
        $st = $pdoTenant->prepare("
            SELECT *
            FROM tiendanube_sync_orders
            WHERE tn_order_id = :order_id
            LIMIT 1
        ");
        $st->execute([':order_id' => $orderId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }
}

if (!function_exists('tn_sync_upsert_row')) {
    function tn_sync_upsert_row(
        PDO $pdoTenant,
        int $orderId,
        int $storeId,
        ?int $idMovimiento,
        string $paymentStatus,
        string $orderStatus,
        float $total,
        string $currency,
        bool $imported,
        array $payload,
        array $resumen
    ): void {
        $existing = tn_sync_find_existing($pdoTenant, $orderId);

        if ($existing) {
            $sql = "
                UPDATE tiendanube_sync_orders
                SET
                    store_id = :store_id,
                    id_movimiento = :id_movimiento,
                    payment_status = :payment_status,
                    order_status = :order_status,
                    total = :total,
                    moneda = :moneda,
                    imported = :imported,
                    payload_json = :payload_json,
                    resumen_json = :resumen_json,
                    updated_at = NOW()
                WHERE tn_order_id = :tn_order_id
            ";
        } else {
            $sql = "
                INSERT INTO tiendanube_sync_orders
                (
                    tn_order_id,
                    store_id,
                    id_movimiento,
                    payment_status,
                    order_status,
                    total,
                    moneda,
                    imported,
                    payload_json,
                    resumen_json,
                    created_at,
                    updated_at
                )
                VALUES
                (
                    :tn_order_id,
                    :store_id,
                    :id_movimiento,
                    :payment_status,
                    :order_status,
                    :total,
                    :moneda,
                    :imported,
                    :payload_json,
                    :resumen_json,
                    NOW(),
                    NOW()
                )
            ";
        }

        $st = $pdoTenant->prepare($sql);
        $st->execute([
            ':tn_order_id'    => $orderId,
            ':store_id'       => $storeId,
            ':id_movimiento'  => $idMovimiento ?: null,
            ':payment_status' => $paymentStatus !== '' ? $paymentStatus : null,
            ':order_status'   => $orderStatus !== '' ? $orderStatus : null,
            ':total'          => $total,
            ':moneda'         => $currency !== '' ? $currency : null,
            ':imported'       => $imported ? 1 : 0,
            ':payload_json'   => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ':resumen_json'   => json_encode($resumen, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    }
}

if (!function_exists('tn_sync_extract_order_id_from_payload')) {
    function tn_sync_extract_order_id_from_payload(array $payload): int
    {
        $candidates = [
            $payload['order_id'] ?? null,
            $payload['id'] ?? null,
            $payload['resource_id'] ?? null,
            $payload['data']['id'] ?? null,
            $payload['order']['id'] ?? null,
        ];

        foreach ($candidates as $value) {
            $id = (int)$value;
            if ($id > 0) {
                return $id;
            }
        }

        return 0;
    }
}

if (!function_exists('tn_sync_to_decimal')) {
    function tn_sync_to_decimal($value): float
    {
        if ($value === null || $value === '') {
            return 0.0;
        }

        if (is_numeric($value)) {
            return (float)$value;
        }

        $s = str_replace(['$', ' '], '', (string)$value);
        $s = str_replace(',', '.', $s);

        return is_numeric($s) ? (float)$s : 0.0;
    }
}

if (!function_exists('tn_sync_date_to_sql')) {
    function tn_sync_date_to_sql(?string $iso): ?string
    {
        $iso = trim((string)$iso);
        if ($iso === '') {
            return null;
        }

        try {
            $dt = new DateTime($iso);
            return $dt->format('Y-m-d');
        } catch (Throwable $e) {
            return null;
        }
    }
}

if (!function_exists('tn_sync_pick_sale_date')) {
    function tn_sync_pick_sale_date(array $order): string
    {
        $candidates = [
            $order['paid_at'] ?? '',
            $order['completed_at'] ?? '',
            $order['created_at'] ?? '',
            $order['updated_at'] ?? '',
        ];

        foreach ($candidates as $candidate) {
            $sql = tn_sync_date_to_sql((string)$candidate);
            if ($sql !== null) {
                return $sql;
            }
        }

        return date('Y-m-d');
    }
}

if (!function_exists('tn_sync_pick_customer_name')) {
    function tn_sync_pick_customer_name(array $order): string
    {
        $candidates = [
            $order['contact_name'] ?? '',
            $order['billing_name'] ?? '',
            $order['customer']['name'] ?? '',
            $order['customer']['first_name'] ?? '',
        ];

        foreach ($candidates as $v) {
            $v = trim((string)$v);
            if ($v !== '') {
                return $v;
            }
        }

        return '';
    }
}

if (!function_exists('tn_sync_pick_payment_method')) {
    function tn_sync_pick_payment_method(array $order): string
    {
        $candidates = [
            $order['payment_details']['method'] ?? '',
            $order['gateway_name'] ?? '',
            $order['gateway'] ?? '',
        ];

        foreach ($candidates as $v) {
            $v = trim((string)$v);
            if ($v !== '') {
                return $v;
            }
        }

        return '';
    }
}

if (!function_exists('tn_sync_normalize_products')) {
    function tn_sync_normalize_products(array $order): array
    {
        $items = [];
        $products = $order['products'] ?? [];

        if (!is_array($products)) {
            return [];
        }

        foreach ($products as $p) {
            if (!is_array($p)) {
                continue;
            }

            $qty = (int)($p['quantity'] ?? 0);
            $price = tn_sync_to_decimal($p['price'] ?? 0);

            $skuCandidates = [
                $p['sku'] ?? '',
                $p['variant_sku'] ?? '',
                $p['barcode'] ?? '',
                $p['reference'] ?? '',
            ];

            $sku = '';
            foreach ($skuCandidates as $candidate) {
                $candidate = trim((string)$candidate);
                if ($candidate !== '') {
                    $sku = $candidate;
                    break;
                }
            }

            $items[] = [
                'line_id'    => (string)($p['id'] ?? ''),
                'product_id' => (string)($p['product_id'] ?? ''),
                'variant_id' => (string)($p['variant_id'] ?? ''),
                'name'       => trim((string)($p['name'] ?? '')),
                'sku'        => $sku,
                'quantity'   => $qty > 0 ? $qty : 0,
                'price'      => $price,
                'subtotal'   => $price * max(1, $qty),
                'raw'        => $p,
            ];
        }

        return $items;
    }
}

if (!function_exists('tn_sync_find_local_product')) {
    function tn_sync_find_local_product(PDO $pdoTenant, array $item): ?array
    {
        $sku = trim((string)($item['sku'] ?? ''));
        $name = trim((string)($item['name'] ?? ''));

        if ($sku !== '') {
            $st = $pdoTenant->prepare("
                SELECT id, nombre, sku, stock, precio, activo
                FROM stock_productos
                WHERE sku = :sku
                LIMIT 1
            ");
            $st->execute([':sku' => $sku]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }

        if ($name !== '') {
            $st = $pdoTenant->prepare("
                SELECT id, nombre, sku, stock, precio, activo
                FROM stock_productos
                WHERE nombre = :nombre
                LIMIT 1
            ");
            $st->execute([':nombre' => $name]);
            $row = $st->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return $row;
            }
        }

        return null;
    }
}

if (!function_exists('tn_sync_discount_stock')) {
    function tn_sync_discount_stock(PDO $pdoTenant, int $productId, int $qty): array
    {
        $qty = max(0, $qty);

        $st = $pdoTenant->prepare("
            SELECT id, stock
            FROM stock_productos
            WHERE id = :id
            LIMIT 1
        ");
        $st->execute([':id' => $productId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            throw new RuntimeException('No se encontró el producto local para descontar stock.');
        }

        $stockAntes = (int)($row['stock'] ?? 0);
        $stockDespues = $stockAntes - $qty;

        $up = $pdoTenant->prepare("
            UPDATE stock_productos
            SET stock = :stock
            WHERE id = :id
        ");
        $up->execute([
            ':stock' => $stockDespues,
            ':id'    => $productId,
        ]);

        return [
            'stock_antes'   => $stockAntes,
            'stock_despues' => $stockDespues,
        ];
    }
}

if (!function_exists('tn_sync_insert_movimiento')) {
    function tn_sync_insert_movimiento(PDO $pdoTenant, array $order): int
    {
        $cfg = tn_sync_cfg();

        $fecha = tn_sync_pick_sale_date($order);
        $total = tn_sync_to_decimal($order['total'] ?? 0);

        $idTipoOperacion = (int)($cfg['id_tipo_operacion_venta'] ?? 1);
        $idTipoVenta     = (int)($cfg['id_tipo_venta_tiendanube'] ?? 0);
        $idMedioPago     = (int)($cfg['id_medio_pago_default'] ?? 0);

        $st = $pdoTenant->prepare("
            INSERT INTO movimientos
            (
                fecha,
                id_tipo_operacion,
                id_clasificacion,
                id_tipo_venta,
                id_cliente,
                id_proveedor,
                id_detalle,
                monto_total,
                id_medio_pago,
                created_at
            )
            VALUES
            (
                :fecha,
                :id_tipo_operacion,
                NULL,
                :id_tipo_venta,
                NULL,
                NULL,
                NULL,
                :monto_total,
                :id_medio_pago,
                NOW()
            )
        ");

        $st->execute([
            ':fecha'             => $fecha,
            ':id_tipo_operacion' => $idTipoOperacion,
            ':id_tipo_venta'     => $idTipoVenta > 0 ? $idTipoVenta : null,
            ':monto_total'       => $total,
            ':id_medio_pago'     => $idMedioPago > 0 ? $idMedioPago : null,
        ]);

        return (int)$pdoTenant->lastInsertId();
    }
}

if (!function_exists('tn_sync_order_to_balto')) {
    function tn_sync_order_to_balto(int $storeId, int $orderId, array $options = []): array
    {
        if ($storeId <= 0) {
            throw new RuntimeException('storeId inválido.');
        }

        if ($orderId <= 0) {
            throw new RuntimeException('orderId inválido.');
        }

        $pdoMaster = tn_master_pdo();
        $conn = tn_get_connection_by_store_id($pdoMaster, $storeId);

        if (!$conn) {
            throw new RuntimeException('No se encontró una conexión activa para el store_id ' . $storeId);
        }

        $idTenant = (int)($conn['idTenant'] ?? 0);
        if ($idTenant <= 0) {
            throw new RuntimeException('La conexión encontrada no tiene idTenant válido.');
        }

        $tenantRow = tn_sync_get_tenant_row($pdoMaster, $idTenant);
        if (!$tenantRow) {
            throw new RuntimeException('No se encontró la fila del tenant ' . $idTenant . ' en tabla tenants.');
        }

        $pdoTenant = tn_sync_connect_tenant_db($tenantRow);
        tn_sync_ensure_schema($pdoTenant);

        $existing = tn_sync_find_existing($pdoTenant, $orderId);
        if ($existing && (int)($existing['imported'] ?? 0) === 1 && empty($options['force'])) {
            return [
                'ok' => true,
                'skipped' => true,
                'motivo' => 'La orden ya fue importada previamente.',
                'idTenant' => $idTenant,
                'tn_order_id' => $orderId,
                'id_movimiento' => (int)($existing['id_movimiento'] ?? 0),
            ];
        }

        $token = trim((string)($conn['access_token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('La conexión existe pero no tiene access_token.');
        }

        $order = tn_api_get_order($storeId, $token, $orderId);

        $paymentStatus = trim((string)($order['payment_status'] ?? ''));
        $orderStatus   = trim((string)($order['status'] ?? ''));
        $currency      = trim((string)($order['currency'] ?? ''));
        $total         = tn_sync_to_decimal($order['total'] ?? 0);
        $productos     = tn_sync_normalize_products($order);
        $soloPagadas   = tn_sync_cfg()['solo_pagadas'];

        $preview = [
            'idTenant'        => $idTenant,
            'tenant'          => (string)($tenantRow['nombre'] ?? ''),
            'store_id'        => $storeId,
            'tn_order_id'     => (int)($order['id'] ?? $orderId),
            'numero'          => (string)($order['number'] ?? ''),
            'payment_status'  => $paymentStatus,
            'status'          => $orderStatus,
            'total'           => $total,
            'currency'        => $currency,
            'fecha'           => tn_sync_pick_sale_date($order),
            'cliente'         => tn_sync_pick_customer_name($order),
            'medio_pago'      => tn_sync_pick_payment_method($order),
            'items'           => $productos,
        ];

        if ($soloPagadas && $paymentStatus !== 'paid' && empty($options['allow_unpaid'])) {
            tn_sync_upsert_row(
                $pdoTenant,
                $orderId,
                $storeId,
                null,
                $paymentStatus,
                $orderStatus,
                $total,
                $currency,
                false,
                $order,
                array_merge($preview, [
                    'accion' => 'preview_only',
                    'motivo' => 'La orden todavía no está pagada.',
                ])
            );

            return [
                'ok' => true,
                'preview_only' => true,
                'motivo' => 'La orden existe pero no está pagada, así que no se importó.',
                'preview' => $preview,
            ];
        }

        $pdoTenant->beginTransaction();

        try {
            $idMovimiento = tn_sync_insert_movimiento($pdoTenant, $order);

            $impactos = [];
            foreach ($productos as $item) {
                $match = tn_sync_find_local_product($pdoTenant, $item);

                if (!$match) {
                    $impactos[] = [
                        'sku' => $item['sku'],
                        'nombre' => $item['name'],
                        'cantidad' => $item['quantity'],
                        'producto_encontrado' => false,
                        'mensaje' => 'No se encontró producto local por SKU ni por nombre exacto.',
                    ];
                    continue;
                }

                $stock = tn_sync_discount_stock(
                    $pdoTenant,
                    (int)$match['id'],
                    (int)$item['quantity']
                );

                $impactos[] = [
                    'sku' => $item['sku'],
                    'nombre' => $item['name'],
                    'cantidad' => $item['quantity'],
                    'producto_encontrado' => true,
                    'id_producto_local' => (int)$match['id'],
                    'nombre_local' => (string)($match['nombre'] ?? ''),
                    'stock_antes' => $stock['stock_antes'],
                    'stock_despues' => $stock['stock_despues'],
                ];
            }

            $resumen = array_merge($preview, [
                'accion'        => 'imported',
                'id_movimiento' => $idMovimiento,
                'impactos_stock'=> $impactos,
            ]);

            tn_sync_upsert_row(
                $pdoTenant,
                $orderId,
                $storeId,
                $idMovimiento,
                $paymentStatus,
                $orderStatus,
                $total,
                $currency,
                true,
                $order,
                $resumen
            );

            $pdoTenant->commit();

            tn_sync_log('Orden importada correctamente', [
                'idTenant' => $idTenant,
                'store_id' => $storeId,
                'order_id' => $orderId,
                'id_movimiento' => $idMovimiento,
            ]);

            return [
                'ok' => true,
                'imported' => true,
                'idTenant' => $idTenant,
                'tenant' => (string)($tenantRow['nombre'] ?? ''),
                'id_movimiento' => $idMovimiento,
                'resumen' => $resumen,
            ];
        } catch (Throwable $e) {
            if ($pdoTenant->inTransaction()) {
                $pdoTenant->rollBack();
            }

            tn_sync_log('Error importando orden', [
                'idTenant' => $idTenant,
                'store_id' => $storeId,
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}