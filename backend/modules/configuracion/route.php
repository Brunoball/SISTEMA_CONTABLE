<?php
declare(strict_types=1);

require_once __DIR__ . '/tiendanube_service.php';

if (!function_exists('route_configuracion')) {
    function route_configuracion(string $action): bool
    {
        $action = trim(mb_strtolower($action, 'UTF-8'));

        $acciones = [
            'tiendanube_status',
            'tiendanube_connect_url',
            'tiendanube_configurar_webhooks',
            'tiendanube_disconnect',
        ];

        if (!in_array($action, $acciones, true)) {
            return false;
        }

        try {
            switch ($action) {
                case 'tiendanube_status': {
                    $idTenant = tn_get_tenant_id();
                    if ($idTenant <= 0) {
                        tn_json_response(400, [
                            'exito' => false,
                            'mensaje' => 'Falta idTenant válido.',
                        ]);
                    }

                    $pdo = tn_master_pdo();
                    $row = tn_get_connection($pdo, $idTenant);

                    tn_json_response(200, [
                        'exito' => true,
                        'conexion' => tn_connection_status_payload($row),
                    ]);
                }

                case 'tiendanube_connect_url': {
                    $idTenant = tn_get_tenant_id();
                    if ($idTenant <= 0) {
                        tn_json_response(400, [
                            'exito' => false,
                            'mensaje' => 'Falta idTenant válido.',
                        ]);
                    }

                    $authUrl = tn_build_authorize_url($idTenant);

                    tn_json_response(200, [
                        'exito' => true,
                        'auth_url' => $authUrl,
                    ]);
                }

                case 'tiendanube_configurar_webhooks': {
                    $idTenant = tn_get_tenant_id();
                    if ($idTenant <= 0) {
                        tn_json_response(400, [
                            'exito' => false,
                            'mensaje' => 'Falta idTenant válido.',
                        ]);
                    }

                    $result = tn_configure_webhooks_for_tenant($idTenant);

                    tn_json_response(200, [
                        'exito' => true,
                        'mensaje' => 'Webhooks configurados correctamente.',
                        'detalle' => $result,
                    ]);
                }

                case 'tiendanube_disconnect': {
                    $idTenant = tn_get_tenant_id();
                    if ($idTenant <= 0) {
                        tn_json_response(400, [
                            'exito' => false,
                            'mensaje' => 'Falta idTenant válido.',
                        ]);
                    }

                    $pdo = tn_master_pdo();
                    tn_disconnect_connection($pdo, $idTenant);

                    tn_json_response(200, [
                        'exito' => true,
                        'mensaje' => 'Tienda desconectada correctamente.',
                    ]);
                }
            }

            return true;
        } catch (Throwable $e) {
            tn_log('Error en route_configuracion', [
                'action' => $action,
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);

            tn_json_response(500, [
                'exito' => false,
                'mensaje' => 'Error en configuración Tienda Nube: ' . $e->getMessage(),
            ]);
        }
    }
}