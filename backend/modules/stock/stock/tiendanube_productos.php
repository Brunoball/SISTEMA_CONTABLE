<?php
declare(strict_types=1);

// Antes estaba en lista_productos/ → subía 3 niveles: lista_productos -> stock -> modules -> ... -> tiendanube
// Ahora está en stock/stock/ → sube 3 niveles igual: stock -> stock(módulo) -> modules -> ... -> tiendanube
require_once __DIR__ . '/../../tiendanube/product_sync.php';

if (!function_exists('stock_tiendanube_json_response')) {
    function stock_tiendanube_json_response(int $status, array $data): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('stock_tiendanube_request_json')) {
    function stock_tiendanube_request_json(): array
    {
        $raw = file_get_contents('php://input');
        if (!is_string($raw) || trim($raw) === '') {
            return [];
        }
        $json = json_decode($raw, true);
        return is_array($json) ? $json : [];
    }
}

if (!function_exists('stock_tiendanube_productos_handle')) {
    function stock_tiendanube_productos_handle(string $action): void
    {
        $action = mb_strtolower(trim($action), 'UTF-8');
        $body = stock_tiendanube_request_json();

        $storeId  = (int)($_GET['store_id']  ?? $_POST['store_id']  ?? $body['store_id']  ?? 0);
        $idTenant = (int)($_GET['idTenant']   ?? $_POST['idTenant']  ?? $body['idTenant']  ?? 0);
        $perPage  = (int)($_GET['per_page']   ?? $_POST['per_page']  ?? $body['per_page']  ?? 30);
        $maxPages = (int)($_GET['max_pages']  ?? $_POST['max_pages'] ?? $body['max_pages'] ?? 20);

        try {
            switch ($action) {
                case 'stock_tiendanube_preview_faltantes':
                    $res = tn_sync_products_missing_from_store(
                        $storeId > 0 ? $storeId : null,
                        $idTenant > 0 ? $idTenant : null,
                        [
                            'preview'   => true,
                            'per_page'  => $perPage,
                            'max_pages' => $maxPages,
                        ]
                    );
                    stock_tiendanube_json_response(200, [
                        'exito'     => true,
                        'modo'      => 'preview',
                        'resultado' => $res,
                    ]);
                    return;

                case 'stock_tiendanube_importar_faltantes':
                    $res = tn_sync_products_missing_from_store(
                        $storeId > 0 ? $storeId : null,
                        $idTenant > 0 ? $idTenant : null,
                        [
                            'preview'   => false,
                            'per_page'  => $perPage,
                            'max_pages' => $maxPages,
                        ]
                    );
                    stock_tiendanube_json_response(200, [
                        'exito'     => true,
                        'modo'      => 'import',
                        'resultado' => $res,
                    ]);
                    return;
            }

            stock_tiendanube_json_response(400, [
                'exito'   => false,
                'mensaje' => 'Acción de Tienda Nube no soportada en stock.',
            ]);
        } catch (Throwable $e) {
            stock_tiendanube_json_response(500, [
                'exito'   => false,
                'mensaje' => $e->getMessage(),
                'archivo' => $e->getFile(),
                'linea'   => $e->getLine(),
            ]);
        }
    }
}