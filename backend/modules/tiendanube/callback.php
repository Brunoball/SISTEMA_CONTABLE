<?php
declare(strict_types=1);

ini_set('display_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('America/Argentina/Buenos_Aires');

require_once __DIR__ . '/../../config/bootstrap_env.php';
require_once __DIR__ . '/../configuracion/tiendanube_service.php';

header('Content-Type: text/html; charset=utf-8');

function tn_callback_render(string $title, string $message, bool $ok = true, array $extra = []): void
{
    http_response_code($ok ? 200 : 400);

    $color  = $ok ? '#16a34a' : '#dc2626';
    $bg     = $ok ? '#f0fdf4' : '#fef2f2';
    $border = $ok ? '#bbf7d0' : '#fecaca';

    echo '<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f6f8fb;color:#111827}
    .wrap{max-width:820px;margin:40px auto;padding:24px}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.06)}
    .badge{display:inline-block;background:' . $bg . ';color:' . $color . ';border:1px solid ' . $border . ';padding:6px 10px;border-radius:999px;font-size:13px;font-weight:700;margin-bottom:12px}
    h1{margin:0 0 10px 0;font-size:28px}
    p{line-height:1.5;margin:10px 0;white-space:pre-line}
    pre{background:#0f172a;color:#e5e7eb;padding:14px;border-radius:12px;overflow:auto;font-size:13px}
    a.btn{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:10px;background:#0f172a;color:#fff;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="badge">' . ($ok ? 'Conexión OK' : 'Error') . '</div>
      <h1>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</h1>
      <p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p>';

    if (!empty($extra)) {
        echo '<pre>' . htmlspecialchars(json_encode($extra, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8') . '</pre>';
    }

    $cfg = tn_cfg();
    $frontUrl = $cfg['after_connect_front_url'] ?? '';
    if ($frontUrl !== '') {
        echo '<a class="btn" href="' . htmlspecialchars($frontUrl, ENT_QUOTES, 'UTF-8') . '">Volver a Balto</a>';
    }

    echo '
    </div>
  </div>
</body>
</html>';
    exit;
}

try {
    $pdo = tn_master_pdo();
    $cfg = tn_cfg();

    $code = trim((string)($_GET['code'] ?? ''));
    $state = trim((string)($_GET['state'] ?? ''));

    if ($code === '') {
        tn_log('callback sin code', ['get' => $_GET]);
        tn_callback_render(
            'Falta el code',
            'Tiendanube no envió el parámetro "code" o la URL fue abierta manualmente.',
            false,
            ['get' => $_GET]
        );
    }

    $stateData = tn_parse_state($state);
    $idTenant = (int)($stateData['idTenant'] ?? 0);

    if ($idTenant <= 0) {
        tn_log('callback state inválido', [
            'state' => $state,
            'stateData' => $stateData,
            'get' => $_GET,
        ]);

        tn_callback_render(
            'State inválido',
            'No se pudo resolver el tenant desde el state de OAuth.',
            false,
            [
                'state' => $state,
                'stateData' => $stateData,
            ]
        );
    }

    $tokenData = tn_exchange_code_for_token($code);

    $accessToken = trim((string)($tokenData['access_token'] ?? ''));
    $storeId     = (int)($tokenData['user_id'] ?? 0);
    $scope       = trim((string)($tokenData['scope'] ?? ''));

    if ($accessToken === '' || $storeId <= 0) {
        tn_log('callback respuesta incompleta', [
            'idTenant' => $idTenant,
            'tokenData' => $tokenData,
        ]);

        tn_callback_render(
            'Respuesta incompleta',
            'Tiendanube respondió, pero faltan access_token o user_id.',
            false,
            $tokenData
        );
    }

    tn_save_connection($pdo, [
        'idTenant'            => $idTenant,
        'store_id'            => (string)$storeId,
        'user_id'             => (string)$storeId,
        'app_id'              => (string)($cfg['app_id'] ?? ''),
        'app_name'            => (string)($cfg['app_name'] ?? 'Balto ERP'),
        'access_token'        => $accessToken,
        'scope'               => $scope,
        'connected'           => 1,
        'webhooks_configured' => 0,
    ]);

    tn_log('callback success', [
        'idTenant' => $idTenant,
        'store_id' => $storeId,
        'scope' => $scope,
    ]);

    $frontUrl = trim((string)($cfg['after_connect_front_url'] ?? ''));

    if ($frontUrl !== '') {
        $sep = str_contains($frontUrl, '?') ? '&' : '?';
        header('Location: ' . $frontUrl . $sep . 'tn_connected=1');
        exit;
    }

    tn_callback_render(
        'Tienda conectada correctamente',
        'La tienda de Tiendanube quedó vinculada con Balto.',
        true,
        [
            'idTenant' => $idTenant,
            'store_id' => $storeId,
            'scope' => $scope,
            'token_guardado' => true,
        ]
    );
} catch (Throwable $e) {
    tn_log('callback error', [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'get' => $_GET,
    ]);

    tn_callback_render(
        'Error al conectar Tienda Nube',
        $e->getMessage(),
        false,
        [
            'archivo' => $e->getFile(),
            'linea' => $e->getLine(),
        ]
    );
}