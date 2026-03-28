<?php
declare(strict_types=1);

if (!function_exists('stock_route_json_error')) {
    function stock_route_json_error(string $mensaje, array $extra = []): void
    {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }

        echo json_encode(
            array_merge(
                [
                    'exito'   => false,
                    'mensaje' => $mensaje,
                ],
                $extra
            ),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        exit;
    }
}

if (!function_exists('stock_route_require_handler')) {
    function stock_route_require_handler(string $archivo, string $funcion, string $action): void
    {
        require_once $archivo;

        if (!function_exists($funcion)) {
            stock_route_json_error(
                'No se encontró la función manejadora del módulo stock.',
                [
                    'action'           => $action,
                    'archivo_esperado' => $archivo,
                    'funcion_esperada' => $funcion,
                ]
            );
        }
    }
}

if (!function_exists('route_stock')) {
    function route_stock(string $action): bool
    {
        global $pdo;

        $action = mb_strtolower(trim($action), 'UTF-8');

        $accionesListaProductos = [
            'stock_productos_listar',
            'stock_producto_listar',
            'stock_producto_obtener',
            'stock_productos_obtener',
            'stock_productos_crear',
            'stock_producto_crear',
            'stock_productos_actualizar',
            'stock_producto_actualizar',
            'stock_productos_eliminar',
            'stock_producto_eliminar',
            'stock_producto_imagen_ver',
            'stock_productos_imagen_ver',
        ];

        $accionesListaProductosImportacion = [
            'stock_productos_importar_csv',
            'stock_producto_importar_csv',
            'stock_productos_importar_pdf',
            'stock_producto_importar_pdf',
            'stock_productos_ocr_imagen',
            'stock_producto_ocr_imagen',
        ];

        $accionesClasificacionIA = [
            'stock_productos_clasificar_texto',
            'stock_producto_clasificar_texto',
        ];

        $accionesInventario = [
            'stock_inventario_listar',
            'stock_inventario_actualizar_stock',
            'stock_inventario_importar_csv',
            'stock_inventario_importar_pdf',
            'stock_inventario_ocr_imagen',
            'stock_inventario_historial',
        ];

        $accionesCategorias = [
            'stock_resumen_categorias',
            'stock_categorias_listar',
            'stock_categoria_crear',
            'stock_categorias_crear',
            'stock_categoria_actualizar',
            'stock_categorias_actualizar',
            'stock_categoria_eliminar',
            'stock_categorias_eliminar',
            'stock_categoria_obtener',
            'stock_categorias_obtener',
        ];

        $accionesTiendaNube = [
            'stock_tiendanube_importar_faltantes',
            'stock_tiendanube_preview_faltantes',
        ];

        // ── Productos CRUD + imagen ──────────────────────────────────────────
        if (in_array($action, $accionesListaProductos, true)) {
            $archivo = __DIR__ . '/stock/listar_productos.php';
            $funcion = 'stock_lista_productos_handle';

            stock_route_require_handler($archivo, $funcion, $action);
            $funcion($action, isset($pdo) && $pdo instanceof PDO ? $pdo : null);
            return true;
        }

        // ── Importación masiva CSV / PDF / OCR ───────────────────────────────
        if (in_array($action, $accionesListaProductosImportacion, true)) {
            $archivo = __DIR__ . '/stock/lista_productos_importar.php';
            $funcion = 'stock_lista_productos_importar_handle';

            stock_route_require_handler($archivo, $funcion, $action);
            $funcion($action, isset($pdo) && $pdo instanceof PDO ? $pdo : null);
            return true;
        }

        // ── Clasificación IA (OpenAI) ────────────────────────────────────────
        if (in_array($action, $accionesClasificacionIA, true)) {
            $archivo = __DIR__ . '/stock/stock_productos_clasificar_texto.php';
            $funcion = 'stock_productos_clasificar_texto_handle';

            stock_route_require_handler($archivo, $funcion, $action);
            $funcion($action, isset($pdo) && $pdo instanceof PDO ? $pdo : null);
            return true;
        }

        // ── Inventario ───────────────────────────────────────────────────────
        if (in_array($action, $accionesInventario, true)) {
            $archivo = __DIR__ . '/stock/inventario.php';
            $funcion = 'stock_inventario_handle';

            stock_route_require_handler($archivo, $funcion, $action);
            $funcion($action);
            return true;
        }

        // ── Categorías ───────────────────────────────────────────────────────
        if (in_array($action, $accionesCategorias, true)) {
            $archivo = __DIR__ . '/stock/stock.php';
            $funcion = 'stock_resumen_handle';

            stock_route_require_handler($archivo, $funcion, $action);
            $funcion($action, isset($pdo) && $pdo instanceof PDO ? $pdo : null);
            return true;
        }

        // ── Tienda Nube ──────────────────────────────────────────────────────
        if (in_array($action, $accionesTiendaNube, true)) {
            $archivo = __DIR__ . '/stock/tiendanube_productos.php';
            $funcion = 'stock_tiendanube_productos_handle';

            stock_route_require_handler($archivo, $funcion, $action);
            $funcion($action);
            return true;
        }

        return false;
    }
}