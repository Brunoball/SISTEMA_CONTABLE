<?php
declare(strict_types=1);

require_once __DIR__ . '/api_client.php';
require_once __DIR__ . '/order_sync.php';

if (!function_exists('tn_product_sync_log')) {
    function tn_product_sync_log(string $msg, array $context = []): void
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

        @file_put_contents($dir . '/tiendanube_product_sync.log', $line, FILE_APPEND);
    }
}

if (!function_exists('tn_product_pick_localized')) {
    function tn_product_pick_localized($value): string
    {
        if (is_string($value)) {
            return trim($value);
        }

        if (!is_array($value)) {
            return '';
        }

        foreach (['es', 'pt', 'en'] as $lang) {
            $v = trim((string)($value[$lang] ?? ''));
            if ($v !== '') {
                return $v;
            }
        }

        foreach ($value as $v) {
            $txt = trim((string)$v);
            if ($txt !== '') {
                return $txt;
            }
        }

        return '';
    }
}

if (!function_exists('tn_product_variant_values_suffix')) {
    function tn_product_variant_values_suffix(array $variant): string
    {
        $values = $variant['values'] ?? [];
        if (!is_array($values) || empty($values)) {
            return '';
        }

        $parts = [];
        foreach ($values as $v) {
            $txt = tn_product_pick_localized($v);
            if ($txt !== '') {
                $parts[] = $txt;
            }
        }

        return !empty($parts) ? ' - ' . implode(' / ', $parts) : '';
    }
}

if (!function_exists('tn_product_pick_image_url')) {
    function tn_product_pick_image_url(array $product, array $variant = []): ?string
    {
        $images = $product['images'] ?? [];
        if (is_array($images) && !empty($images)) {
            foreach ($images as $img) {
                if (!is_array($img)) {
                    continue;
                }

                foreach ([
                    $img['src'] ?? null,
                    $img['url'] ?? null,
                    $img['https'] ?? null,
                    $img['image_url'] ?? null,
                ] as $candidate) {
                    $candidate = trim((string)$candidate);
                    if ($candidate !== '') {
                        return $candidate;
                    }
                }
            }
        }

        if (!empty($variant['image_id']) && is_array($images)) {
            foreach ($images as $img) {
                if (!is_array($img)) {
                    continue;
                }

                if ((string)($img['id'] ?? '') === (string)$variant['image_id']) {
                    $candidate = trim((string)($img['src'] ?? $img['url'] ?? ''));
                    if ($candidate !== '') {
                        return $candidate;
                    }
                }
            }
        }

        return null;
    }
}

if (!function_exists('tn_product_variant_stock_total')) {
    function tn_product_variant_stock_total(array $variant): ?int
    {
        $inventoryLevels = $variant['inventory_levels'] ?? null;

        if (is_array($inventoryLevels) && !empty($inventoryLevels)) {
            $sum = 0;
            $hasNumeric = false;

            foreach ($inventoryLevels as $level) {
                if (!is_array($level)) {
                    continue;
                }

                $stock = $level['stock'] ?? null;
                if ($stock === null || $stock === '') {
                    continue;
                }

                if (is_numeric($stock)) {
                    $sum += (int)$stock;
                    $hasNumeric = true;
                }
            }

            if ($hasNumeric) {
                return $sum;
            }
        }

        $stock = $variant['stock'] ?? null;
        if ($stock === null || $stock === '') {
            return null;
        }

        return is_numeric($stock) ? (int)$stock : null;
    }
}

if (!function_exists('tn_product_to_decimal')) {
    function tn_product_to_decimal($value): float
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

if (!function_exists('tn_product_is_active')) {
    function tn_product_is_active(array $product): int
    {
        $published = $product['published'] ?? $product['visible'] ?? true;
        return $published ? 1 : 0;
    }
}

if (!function_exists('tn_product_build_local_rows')) {
    function tn_product_build_local_rows(array $product): array
    {
        $rows = [];

        $productId   = (int)($product['id'] ?? 0);
        $baseName    = tn_product_pick_localized($product['name'] ?? '');
        $description = tn_product_pick_localized($product['description'] ?? '');
        $activo      = tn_product_is_active($product);

        $variants = $product['variants'] ?? [];
        if (!is_array($variants) || empty($variants)) {
            return [];
        }

        foreach ($variants as $variant) {
            if (!is_array($variant)) {
                continue;
            }

            $suffix = tn_product_variant_values_suffix($variant);
            $nombre = trim($baseName . $suffix);
            $sku    = trim((string)($variant['sku'] ?? ''));

            $rows[] = [
                'tn_product_id' => $productId,
                'tn_variant_id' => (int)($variant['id'] ?? 0),
                'nombre'        => $nombre !== '' ? $nombre : ('Producto TN #' . $productId),
                'sku'           => $sku !== '' ? $sku : null,
                'precio'        => tn_product_to_decimal($variant['price'] ?? $product['price'] ?? 0),
                'precio_promo'  => (($variant['promotional_price'] ?? $product['promotional_price'] ?? null) !== null && ($variant['promotional_price'] ?? $product['promotional_price'] ?? null) !== '')
                    ? tn_product_to_decimal($variant['promotional_price'] ?? $product['promotional_price'])
                    : null,
                'stock'        => tn_product_variant_stock_total($variant),
                'descripcion'  => $description !== '' ? $description : null,
                'imagen_url'   => tn_product_pick_image_url($product, $variant),
                'activo'       => $activo,
            ];
        }

        return $rows;
    }
}

if (!function_exists('tn_product_find_local_existing')) {
    function tn_product_find_local_existing(PDO $pdoTenant, array $row): ?array
    {
        $sku = trim((string)($row['sku'] ?? ''));
        $nombre = trim((string)($row['nombre'] ?? ''));

        if ($sku !== '') {
            $st = $pdoTenant->prepare("
                SELECT id, nombre, sku
                FROM stock_productos
                WHERE sku = :sku
                LIMIT 1
            ");
            $st->execute([':sku' => $sku]);
            $found = $st->fetch(PDO::FETCH_ASSOC);
            if ($found) {
                return $found;
            }
        }

        if ($nombre !== '') {
            $st = $pdoTenant->prepare("
                SELECT id, nombre, sku
                FROM stock_productos
                WHERE nombre = :nombre
                LIMIT 1
            ");
            $st->execute([':nombre' => $nombre]);
            $found = $st->fetch(PDO::FETCH_ASSOC);
            if ($found) {
                return $found;
            }
        }

        return null;
    }
}

if (!function_exists('tn_product_insert_local')) {
    function tn_product_insert_local(PDO $pdoTenant, array $row): int
    {
        $st = $pdoTenant->prepare("
            INSERT INTO stock_productos
            (
                nombre,
                sku,
                precio,
                precio_promo,
                stock,
                descripcion,
                imagen_url,
                activo,
                created_at,
                updated_at
            )
            VALUES
            (
                :nombre,
                :sku,
                :precio,
                :precio_promo,
                :stock,
                :descripcion,
                :imagen_url,
                :activo,
                NOW(),
                NOW()
            )
        ");

        $st->execute([
            ':nombre'       => (string)$row['nombre'],
            ':sku'          => $row['sku'] !== null ? (string)$row['sku'] : null,
            ':precio'       => (float)$row['precio'],
            ':precio_promo' => $row['precio_promo'] !== null ? (float)$row['precio_promo'] : null,
            ':stock'        => $row['stock'] !== null ? (int)$row['stock'] : null,
            ':descripcion'  => $row['descripcion'] !== null ? (string)$row['descripcion'] : null,
            ':imagen_url'   => $row['imagen_url'] !== null ? (string)$row['imagen_url'] : null,
            ':activo'       => (int)$row['activo'],
        ]);

        return (int)$pdoTenant->lastInsertId();
    }
}

if (!function_exists('tn_product_update_local')) {
    function tn_product_update_local(PDO $pdoTenant, int $idLocal, array $row): void
    {
        $st = $pdoTenant->prepare("
            UPDATE stock_productos
            SET
                nombre = :nombre,
                sku = :sku,
                precio = :precio,
                precio_promo = :precio_promo,
                stock = :stock,
                descripcion = :descripcion,
                imagen_url = :imagen_url,
                activo = :activo,
                updated_at = NOW()
            WHERE id = :id
        ");

        $st->execute([
            ':id'           => $idLocal,
            ':nombre'       => (string)$row['nombre'],
            ':sku'          => $row['sku'] !== null ? (string)$row['sku'] : null,
            ':precio'       => (float)$row['precio'],
            ':precio_promo' => $row['precio_promo'] !== null ? (float)$row['precio_promo'] : null,
            ':stock'        => $row['stock'] !== null ? (int)$row['stock'] : null,
            ':descripcion'  => $row['descripcion'] !== null ? (string)$row['descripcion'] : null,
            ':imagen_url'   => $row['imagen_url'] !== null ? (string)$row['imagen_url'] : null,
            ':activo'       => (int)$row['activo'],
        ]);
    }
}

if (!function_exists('tn_product_deactivate_local_by_sku_or_name')) {
    function tn_product_deactivate_local_by_sku_or_name(PDO $pdoTenant, array $row): int
    {
        $sku = trim((string)($row['sku'] ?? ''));
        $nombre = trim((string)($row['nombre'] ?? ''));

        if ($sku !== '') {
            $st = $pdoTenant->prepare("
                UPDATE stock_productos
                SET activo = 0, updated_at = NOW()
                WHERE sku = :sku
            ");
            $st->execute([':sku' => $sku]);
            return $st->rowCount();
        }

        if ($nombre !== '') {
            $st = $pdoTenant->prepare("
                UPDATE stock_productos
                SET activo = 0, updated_at = NOW()
                WHERE nombre = :nombre
            ");
            $st->execute([':nombre' => $nombre]);
            return $st->rowCount();
        }

        return 0;
    }
}

if (!function_exists('tn_product_resolve_connection')) {
    function tn_product_resolve_connection(?int $storeId = null, ?int $idTenant = null): array
    {
        $pdoMaster = tn_master_pdo();

        if (($storeId ?? 0) > 0) {
            $conn = tn_get_connection_by_store_id($pdoMaster, (int)$storeId);
            if (!$conn) {
                throw new RuntimeException('No se encontró conexión Tienda Nube para el store_id indicado.');
            }

            $tenantId = (int)($conn['idTenant'] ?? 0);
            if ($tenantId <= 0) {
                throw new RuntimeException('La conexión encontrada no tiene idTenant válido.');
            }

            return [$pdoMaster, $conn, $tenantId];
        }

        if (($idTenant ?? 0) > 0 && function_exists('tn_get_connection')) {
            $conn = tn_get_connection($pdoMaster, (int)$idTenant);
            if (!$conn) {
                throw new RuntimeException('No se encontró conexión Tienda Nube para el idTenant indicado.');
            }

            return [$pdoMaster, $conn, (int)$idTenant];
        }

        throw new RuntimeException('Falta store_id o idTenant válido para resolver la conexión.');
    }
}

if (!function_exists('tn_product_extract_product_id_from_payload')) {
    function tn_product_extract_product_id_from_payload(array $payload): int
    {
        $candidates = [
            $payload['product_id'] ?? null,
            $payload['id'] ?? null,
            $payload['resource_id'] ?? null,
            $payload['data']['id'] ?? null,
            $payload['product']['id'] ?? null,
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

if (!function_exists('tn_sync_products_missing_from_store')) {
    function tn_sync_products_missing_from_store(
        ?int $storeId = null,
        ?int $idTenant = null,
        array $options = []
    ): array {
        [$pdoMaster, $conn, $resolvedTenantId] = tn_product_resolve_connection($storeId, $idTenant);

        $tenantRow = tn_sync_get_tenant_row($pdoMaster, $resolvedTenantId);
        if (!$tenantRow) {
            throw new RuntimeException('No se encontró la fila del tenant en la tabla tenants.');
        }

        $pdoTenant = tn_sync_connect_tenant_db($tenantRow);

        $resolvedStoreId = (int)($conn['store_id'] ?? 0);
        if ($resolvedStoreId <= 0) {
            throw new RuntimeException('La conexión no tiene store_id válido.');
        }

        $token = trim((string)($conn['access_token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('La conexión no tiene access_token.');
        }

        $maxPages = max(1, (int)($options['max_pages'] ?? 20));
        $perPage  = max(1, min(100, (int)($options['per_page'] ?? 30)));
        $preview  = !empty($options['preview']);

        $summary = [
            'ok' => true,
            'preview' => $preview,
            'idTenant' => $resolvedTenantId,
            'tenant' => (string)($tenantRow['nombre'] ?? ''),
            'store_id' => $resolvedStoreId,
            'pages_processed' => 0,
            'products_processed' => 0,
            'variants_processed' => 0,
            'inserted' => 0,
            'skipped_existing' => 0,
            'inserted_rows' => [],
            'skipped_rows' => [],
            'errors' => [],
        ];

        for ($page = 1; $page <= $maxPages; $page++) {
            $list = tn_api_list_products_page($resolvedStoreId, $token, [
                'page' => $page,
                'per_page' => $perPage,
            ]);

            if (empty($list)) {
                break;
            }

            $summary['pages_processed']++;

            foreach ($list as $productShort) {
                if (!is_array($productShort)) {
                    continue;
                }

                $productId = (int)($productShort['id'] ?? 0);
                if ($productId <= 0) {
                    continue;
                }

                $summary['products_processed']++;

                try {
                    $product = tn_api_get_product($resolvedStoreId, $token, $productId);
                    $rows = tn_product_build_local_rows($product);

                    foreach ($rows as $row) {
                        $summary['variants_processed']++;

                        $existing = tn_product_find_local_existing($pdoTenant, $row);
                        if ($existing) {
                            $summary['skipped_existing']++;
                            $summary['skipped_rows'][] = [
                                'tn_product_id' => $row['tn_product_id'],
                                'tn_variant_id' => $row['tn_variant_id'],
                                'nombre' => $row['nombre'],
                                'sku' => $row['sku'],
                                'motivo' => 'Ya existe en stock_productos.',
                                'id_local' => (int)($existing['id'] ?? 0),
                            ];
                            continue;
                        }

                        if (!$preview) {
                            $idLocal = tn_product_insert_local($pdoTenant, $row);
                        } else {
                            $idLocal = 0;
                        }

                        $summary['inserted']++;
                        $summary['inserted_rows'][] = [
                            'tn_product_id' => $row['tn_product_id'],
                            'tn_variant_id' => $row['tn_variant_id'],
                            'nombre' => $row['nombre'],
                            'sku' => $row['sku'],
                            'precio' => $row['precio'],
                            'precio_promo' => $row['precio_promo'],
                            'stock' => $row['stock'],
                            'id_local' => $idLocal,
                        ];
                    }
                } catch (Throwable $e) {
                    $summary['errors'][] = [
                        'product_id' => $productId,
                        'mensaje' => $e->getMessage(),
                    ];

                    tn_product_sync_log('Error procesando producto TN', [
                        'store_id' => $resolvedStoreId,
                        'idTenant' => $resolvedTenantId,
                        'product_id' => $productId,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            if (count($list) < $perPage) {
                break;
            }
        }

        tn_product_sync_log('Sincronización manual de productos finalizada', [
            'store_id' => $resolvedStoreId,
            'idTenant' => $resolvedTenantId,
            'preview' => $preview,
            'inserted' => $summary['inserted'],
            'skipped_existing' => $summary['skipped_existing'],
            'products_processed' => $summary['products_processed'],
            'variants_processed' => $summary['variants_processed'],
        ]);

        return $summary;
    }
}

if (!function_exists('tn_sync_single_product_to_balto')) {
    function tn_sync_single_product_to_balto(int $storeId, int $productId): array
    {
        [$pdoMaster, $conn, $resolvedTenantId] = tn_product_resolve_connection($storeId, null);

        $tenantRow = tn_sync_get_tenant_row($pdoMaster, $resolvedTenantId);
        if (!$tenantRow) {
            throw new RuntimeException('No se encontró la fila del tenant en la tabla tenants.');
        }

        $pdoTenant = tn_sync_connect_tenant_db($tenantRow);

        $token = trim((string)($conn['access_token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('La conexión no tiene access_token.');
        }

        $product = tn_api_get_product($storeId, $token, $productId);
        $rows = tn_product_build_local_rows($product);

        $summary = [
            'ok' => true,
            'idTenant' => $resolvedTenantId,
            'tenant' => (string)($tenantRow['nombre'] ?? ''),
            'store_id' => $storeId,
            'product_id' => $productId,
            'inserted' => 0,
            'updated' => 0,
            'rows' => [],
        ];

        foreach ($rows as $row) {
            $existing = tn_product_find_local_existing($pdoTenant, $row);

            if ($existing) {
                tn_product_update_local($pdoTenant, (int)$existing['id'], $row);
                $summary['updated']++;

                $summary['rows'][] = [
                    'accion' => 'updated',
                    'id_local' => (int)$existing['id'],
                    'nombre' => $row['nombre'],
                    'sku' => $row['sku'],
                    'precio' => $row['precio'],
                    'precio_promo' => $row['precio_promo'],
                    'stock' => $row['stock'],
                    'activo' => $row['activo'],
                ];
            } else {
                $idLocal = tn_product_insert_local($pdoTenant, $row);
                $summary['inserted']++;

                $summary['rows'][] = [
                    'accion' => 'inserted',
                    'id_local' => $idLocal,
                    'nombre' => $row['nombre'],
                    'sku' => $row['sku'],
                    'precio' => $row['precio'],
                    'precio_promo' => $row['precio_promo'],
                    'stock' => $row['stock'],
                    'activo' => $row['activo'],
                ];
            }
        }

        tn_product_sync_log('Producto sincronizado por webhook', [
            'store_id' => $storeId,
            'idTenant' => $resolvedTenantId,
            'product_id' => $productId,
            'inserted' => $summary['inserted'],
            'updated' => $summary['updated'],
        ]);

        return $summary;
    }
}

if (!function_exists('tn_deactivate_single_product_in_balto')) {
    function tn_deactivate_single_product_in_balto(int $storeId, int $productId): array
    {
        [$pdoMaster, $conn, $resolvedTenantId] = tn_product_resolve_connection($storeId, null);

        $tenantRow = tn_sync_get_tenant_row($pdoMaster, $resolvedTenantId);
        if (!$tenantRow) {
            throw new RuntimeException('No se encontró la fila del tenant en la tabla tenants.');
        }

        $pdoTenant = tn_sync_connect_tenant_db($tenantRow);

        $token = trim((string)($conn['access_token'] ?? ''));
        if ($token === '') {
            throw new RuntimeException('La conexión no tiene access_token.');
        }

        $product = tn_api_get_product($storeId, $token, $productId);
        $rows = tn_product_build_local_rows($product);

        $totalAffected = 0;
        $detalles = [];

        foreach ($rows as $row) {
            $affected = tn_product_deactivate_local_by_sku_or_name($pdoTenant, $row);
            $totalAffected += $affected;

            $detalles[] = [
                'nombre' => $row['nombre'],
                'sku' => $row['sku'],
                'filas_afectadas' => $affected,
            ];
        }

        tn_product_sync_log('Producto desactivado por webhook', [
            'store_id' => $storeId,
            'idTenant' => $resolvedTenantId,
            'product_id' => $productId,
            'filas_afectadas' => $totalAffected,
        ]);

        return [
            'ok' => true,
            'idTenant' => $resolvedTenantId,
            'tenant' => (string)($tenantRow['nombre'] ?? ''),
            'store_id' => $storeId,
            'product_id' => $productId,
            'filas_afectadas' => $totalAffected,
            'detalles' => $detalles,
        ];
    }
}