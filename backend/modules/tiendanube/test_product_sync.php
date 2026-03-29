<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

ini_set('display_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('America/Argentina/Buenos_Aires');

require_once __DIR__ . '/../../config/bootstrap_env.php';
require_once __DIR__ . '/product_sync.php';

try {
    $storeId  = (int)($_GET['store_id'] ?? 0);
    $idTenant = (int)($_GET['idTenant'] ?? 0);
    $preview  = (int)($_GET['preview'] ?? 1) === 1;
    $perPage  = (int)($_GET['per_page'] ?? 30);
    $maxPages = (int)($_GET['max_pages'] ?? 20);

    if ($storeId <= 0 && $idTenant <= 0) {
        throw new RuntimeException('Tenés que enviar store_id o idTenant.');
    }

    $res = tn_sync_products_missing_from_store(
        $storeId > 0 ? $storeId : null,
        $idTenant > 0 ? $idTenant : null,
        [
            'preview' => $preview,
            'per_page' => $perPage,
            'max_pages' => $maxPages,
        ]
    );

    echo json_encode([
        'ok' => true,
        'preview' => $preview,
        'resultado' => $res,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'mensaje' => $e->getMessage(),
        'archivo' => $e->getFile(),
        'linea' => $e->getLine(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
}