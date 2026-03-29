<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

ini_set('display_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('America/Argentina/Buenos_Aires');

require_once __DIR__ . '/../../config/bootstrap_env.php';
require_once __DIR__ . '/order_sync.php';

try {
    $storeId = (int)($_GET['store_id'] ?? 0);
    $orderId = (int)($_GET['order_id'] ?? 0);
    $mode    = trim((string)($_GET['mode'] ?? 'single'));
    $force   = (int)($_GET['force'] ?? 0) === 1;

    if ($storeId <= 0) {
        throw new RuntimeException('Falta store_id válido.');
    }

    $pdoMaster = tn_master_pdo();
    $conn = tn_get_connection_by_store_id($pdoMaster, $storeId);

    if (!$conn) {
        throw new RuntimeException('No se encontró conexión activa para ese store_id.');
    }

    $token = trim((string)($conn['access_token'] ?? ''));
    if ($token === '') {
        throw new RuntimeException('La conexión no tiene access_token.');
    }

    if ($mode === 'latest_paid' && $orderId <= 0) {
        $orders = tn_api_list_orders($storeId, $token, [
            'per_page' => 1,
            'page' => 1,
            'payment_status' => 'paid',
        ]);

        if (empty($orders) || !is_array($orders[0] ?? null)) {
            throw new RuntimeException('No se encontró ninguna orden paga para esa tienda.');
        }

        $orderId = (int)($orders[0]['id'] ?? 0);
    }

    if ($orderId <= 0) {
        throw new RuntimeException('Falta order_id válido.');
    }

    $resultado = tn_sync_order_to_balto($storeId, $orderId, [
        'allow_unpaid' => true,
        'force' => $force,
    ]);

    echo json_encode([
        'ok' => true,
        'store_id' => $storeId,
        'order_id' => $orderId,
        'resultado' => $resultado,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'mensaje' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
}