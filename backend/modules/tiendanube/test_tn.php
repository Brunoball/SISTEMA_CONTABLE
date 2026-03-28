<?php
declare(strict_types=1);

ini_set('display_errors', '1');
error_reporting(E_ALL);

header('Content-Type: text/html; charset=utf-8');

echo '<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Test Tiendanube</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body{
            font-family: Arial, Helvetica, sans-serif;
            background:#f6f8fb;
            color:#111827;
            margin:0;
            padding:30px;
        }
        .wrap{
            max-width:1000px;
            margin:0 auto;
        }
        .card{
            background:#fff;
            border:1px solid #e5e7eb;
            border-radius:16px;
            padding:24px;
            box-shadow:0 8px 30px rgba(0,0,0,.06);
        }
        h1,h2,h3,h4{
            margin-top:0;
        }
        .ok{
            color:#16a34a;
            font-weight:700;
        }
        .error{
            color:#dc2626;
            font-weight:700;
        }
        .info{
            color:#2563eb;
            font-weight:700;
        }
        pre{
            background:#0f172a;
            color:#e5e7eb;
            padding:16px;
            border-radius:12px;
            overflow:auto;
            font-size:13px;
            line-height:1.45;
        }
        .box{
            padding:12px 14px;
            border-radius:10px;
            margin:12px 0;
            border:1px solid #dbeafe;
            background:#eff6ff;
        }
        .box-ok{
            border-color:#bbf7d0;
            background:#f0fdf4;
        }
        .box-error{
            border-color:#fecaca;
            background:#fef2f2;
        }
    </style>
</head>
<body>
<div class="wrap">
    <div class="card">
        <h1>Test de integración Tiendanube</h1>';

echo '<div class="box box-ok"><span class="ok">INI TEST TN</span></div>';

require_once __DIR__ . '/../../config/bootstrap_env.php';
echo '<p class="ok">bootstrap_env OK</p>';

require_once __DIR__ . '/api_client.php';
echo '<p class="ok">api_client OK</p>';

$storeId = 7448034;

/**
 * Probar productos
 */
$result = tn_api_request('GET', $storeId, '/store');

echo '<h2>Resultado de /products</h2>';

if (!is_array($result)) {
    echo '<div class="box box-error"><span class="error">La función tn_api_request no devolvió un array válido.</span></div>';
    echo '</div></div></body></html>';
    exit;
}

$exito    = (bool)($result['exito'] ?? false);
$httpCode = (int)($result['http_code'] ?? 0);
$data     = $result['data'] ?? null;
$error    = $result['error'] ?? null;
$tenant   = $result['tenant'] ?? null;

if ($exito) {
    echo '<div class="box box-ok">';
    echo '<span class="ok">Conexión OK</span><br>';
    echo 'HTTP Code: <strong>' . htmlspecialchars((string)$httpCode, ENT_QUOTES, 'UTF-8') . '</strong><br>';

    if (is_array($tenant)) {
        echo 'Tenant: <strong>' . htmlspecialchars((string)($tenant['nombre'] ?? ''), ENT_QUOTES, 'UTF-8') . '</strong><br>';
        echo 'DB: <strong>' . htmlspecialchars((string)($tenant['db_name'] ?? ''), ENT_QUOTES, 'UTF-8') . '</strong><br>';
    }

    echo 'Store ID: <strong>' . htmlspecialchars((string)$storeId, ENT_QUOTES, 'UTF-8') . '</strong>';
    echo '</div>';

    if (is_array($data) && count($data) === 0) {
        echo '<div class="box">';
        echo '<span class="info">La API respondió correctamente, pero no hay productos en la tienda o el listado está vacío.</span>';
        echo '</div>';
    }
} else {
    echo '<div class="box box-error">';
    echo '<span class="error">La consulta falló.</span><br>';
    echo 'HTTP Code: <strong>' . htmlspecialchars((string)$httpCode, ENT_QUOTES, 'UTF-8') . '</strong><br>';

    if (!empty($error)) {
        echo 'Error cURL: <strong>' . htmlspecialchars((string)$error, ENT_QUOTES, 'UTF-8') . '</strong><br>';
    }

    echo '</div>';
}

echo '<h3>RESULTADO COMPLETO</h3>';
echo '<pre>';
print_r($result);
echo '</pre>';

echo '
    </div>
</div>
</body>
</html>';