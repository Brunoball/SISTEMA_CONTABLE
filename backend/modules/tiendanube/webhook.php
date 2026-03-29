<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

ini_set('display_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('America/Argentina/Buenos_Aires');

require_once __DIR__ . '/../../config/bootstrap_env.php';
require_once __DIR__ . '/../configuracion/tiendanube_db.php';
require_once __DIR__ . '/order_sync.php';
require_once __DIR__ . '/product_sync.php';

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
    $raw = file_get_contents('php://input');
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) {
        $data = [];
    }

    $topic = trim((string)(
        $_SERVER['HTTP_X_TIENDANUBE_TOPIC'] ??
        $data['event'] ??
        ''
    ));

    $linkedStoreHeader = (int)($_SERVER['HTTP_X_LINKEDSTORE'] ?? 0);

    $storeId = 0;
    if ($linkedStoreHeader > 0) {
        $storeId = $linkedStoreHeader;
    } elseif (isset($data['store_id'])) {
        $storeId = (int)$data['store_id'];
    } elseif (isset($data['user_id'])) {
        $storeId = (int)$data['user_id'];
    }

    $orderId = tn_sync_extract_order_id_from_payload($data);
    $productId = tn_product_extract_product_id_from_payload($data);

    $pdo = tn_master_pdo();
    $conexion = $storeId > 0 ? tn_get_connection_by_store_id($pdo, $storeId) : null;
    $idTenant = (int)($conexion['idTenant'] ?? 0);

    tn_log('webhook recibido', [
        'method'    => $method,
        'topic'     => $topic,
        'store_id'  => $storeId,
        'order_id'  => $orderId,
        'product_id'=> $productId,
        'idTenant'  => $idTenant,
        'payload'   => $data,
    ]);

    $response = [
        'status'    => 'OK',
        'topic'     => $topic,
        'store_id'  => $storeId,
        'order_id'  => $orderId,
        'product_id'=> $productId,
        'idTenant'  => $idTenant,
    ];

    if ($topic === 'app/uninstalled' && $idTenant > 0) {
        tn_disconnect_connection($pdo, $idTenant);

        tn_log('webhook app/uninstalled', [
            'idTenant' => $idTenant,
            'store_id' => $storeId,
        ]);

        $response['action'] = 'disconnect';
        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $topicsVenta = [
        'order/created',
        'order/updated',
        'order/paid',
    ];

    if (in_array($topic, $topicsVenta, true)) {
        if ($storeId <= 0) {
            throw new RuntimeException('Webhook de orden sin store_id válido.');
        }

        if ($orderId <= 0) {
            throw new RuntimeException('Webhook de orden sin order_id válido.');
        }

        $sync = tn_sync_order_to_balto($storeId, $orderId, [
            'allow_unpaid' => ($topic !== 'order/paid'),
            'force'        => false,
        ]);

        $response['action'] = 'sync_order';
        $response['sync'] = $sync;

        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $topicsProductoCrearActualizar = [
        'product/created',
        'product/updated',
    ];

    if (in_array($topic, $topicsProductoCrearActualizar, true)) {
        if ($storeId <= 0) {
            throw new RuntimeException('Webhook de producto sin store_id válido.');
        }

        if ($productId <= 0) {
            throw new RuntimeException('Webhook de producto sin product_id válido.');
        }

        $sync = tn_sync_single_product_to_balto($storeId, $productId);

        $response['action'] = 'sync_product';
        $response['sync'] = $sync;

        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    if ($topic === 'product/deleted') {
        if ($storeId <= 0) {
            throw new RuntimeException('Webhook de producto sin store_id válido.');
        }

        if ($productId <= 0) {
            throw new RuntimeException('Webhook de producto eliminado sin product_id válido.');
        }

        $sync = tn_deactivate_single_product_in_balto($storeId, $productId);

        $response['action'] = 'deactivate_product';
        $response['sync'] = $sync;

        echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    tn_log('webhook error', [
        'error' => $e->getMessage(),
        'file'  => $e->getFile(),
        'line'  => $e->getLine(),
    ]);

    http_response_code(500);
    echo json_encode([
        'status'  => 'ERROR',
        'mensaje' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}