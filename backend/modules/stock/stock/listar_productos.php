<?php
declare(strict_types=1);

// archivos_productos.php ahora está en el mismo directorio (stock/)
require_once __DIR__ . '/archivos_productos.php';

if (!function_exists('stock_lista_productos_send_json')) {
    function stock_lista_productos_send_json(array $payload, int $http = 200): void
    {
        if (!headers_sent()) {
            http_response_code($http);
            header('Content-Type: application/json; charset=utf-8');
        }

        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('stock_lista_productos_ok')) {
    function stock_lista_productos_ok(array $payload = [], int $http = 200): void
    {
        stock_lista_productos_send_json(array_merge(['exito' => true], $payload), $http);
    }
}

if (!function_exists('stock_lista_productos_fail')) {
    function stock_lista_productos_fail(string $mensaje, int $http = 200, array $extra = []): void
    {
        stock_lista_productos_send_json(
            array_merge(
                [
                    'exito'   => false,
                    'mensaje' => $mensaje,
                ],
                $extra
            ),
            $http
        );
    }
}

if (!function_exists('stock_lista_productos_body')) {
    function stock_lista_productos_body(): array
    {
        static $cache = null;

        if ($cache !== null) {
            return $cache;
        }

        $raw  = file_get_contents('php://input');
        $data = json_decode($raw ?: '[]', true);
        $body = is_array($data) ? $data : [];

        if (!empty($_POST)) {
            $body = array_merge($body, $_POST);
        }

        $cache = $body;
        return $cache;
    }
}

if (!function_exists('stock_lista_productos_request_data')) {
    function stock_lista_productos_request_data(): array
    {
        $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));

        if (strpos($contentType, 'application/json') !== false) {
            return stock_lista_productos_body();
        }

        if (!empty($_POST)) {
            return $_POST;
        }

        return stock_lista_productos_body();
    }
}

if (!function_exists('stock_lista_productos_pdo')) {
    function stock_lista_productos_pdo(?PDO $pdo = null): PDO
    {
        if ($pdo instanceof PDO) {
            return $pdo;
        }

        global $pdo;
        if (!isset($pdo) || !($pdo instanceof PDO)) {
            throw new RuntimeException('PDO tenant no disponible en módulo stock.');
        }

        return $pdo;
    }
}

if (!function_exists('stock_lista_productos_require_methods')) {
    function stock_lista_productos_require_methods(array $allowed): void
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $allowed = array_map(static fn($m) => strtoupper((string)$m), $allowed);

        if (!in_array($method, $allowed, true)) {
            stock_lista_productos_fail('Método no permitido', 405, [
                'metodo'             => $method,
                'metodos_permitidos' => array_values($allowed),
            ]);
        }
    }
}

if (!function_exists('stock_lista_productos_safe_text')) {
    function stock_lista_productos_safe_text($v): string
    {
        return trim((string)($v ?? ''));
    }
}

if (!function_exists('stock_lista_productos_get_user_name')) {
    function stock_lista_productos_get_user_name(): ?string
    {
        $candidatos = [
            $_SESSION['nombre'] ?? null,
            $_SESSION['usuario'] ?? null,
            $_SESSION['email'] ?? null,
            $_SERVER['HTTP_X_USUARIO'] ?? null,
            $_SERVER['HTTP_X_USER'] ?? null,
        ];

        foreach ($candidatos as $candidato) {
            $valor = trim((string)$candidato);
            if ($valor !== '') {
                return $valor;
            }
        }

        $id = (int)($_SESSION['balto_user_id'] ?? $_SESSION['user_id'] ?? 0);
        return $id > 0 ? 'usuario_' . $id : null;
    }
}

if (!function_exists('stock_lista_productos_normalizar_decimal')) {
    function stock_lista_productos_normalizar_decimal($valor, bool $permitirNull = true): ?float
    {
        if ($valor === null || $valor === '') {
            return $permitirNull ? null : 0.0;
        }

        $texto = trim((string)$valor);

        if (strpos($texto, ',') !== false) {
            $texto = str_replace('.', '', $texto);
            $texto = str_replace(',', '.', $texto);
        }

        if (!is_numeric($texto)) {
            throw new InvalidArgumentException('Valor decimal inválido.');
        }

        return (float)$texto;
    }
}

if (!function_exists('stock_lista_productos_normalizar_entero')) {
    function stock_lista_productos_normalizar_entero($valor, bool $permitirNull = true): ?int
    {
        if ($valor === null || $valor === '') {
            return $permitirNull ? null : 0;
        }

        if (!is_numeric($valor)) {
            throw new InvalidArgumentException('Valor entero inválido.');
        }

        return (int)$valor;
    }
}

if (!function_exists('stock_lista_productos_normalizar_activo')) {
    function stock_lista_productos_normalizar_activo($valor): int
    {
        if (is_bool($valor)) {
            return $valor ? 1 : 0;
        }

        $v = mb_strtolower(trim((string)$valor), 'UTF-8');
        return in_array($v, ['1', 'true', 'si', 'sí', 'activo'], true) ? 1 : 0;
    }
}

if (!function_exists('stock_lista_productos_normalizar_categoria_id')) {
    function stock_lista_productos_normalizar_categoria_id($valor, bool $permitirNull = true): ?int
    {
        if ($valor === null || $valor === '') {
            return $permitirNull ? null : 0;
        }

        if (!is_numeric($valor)) {
            throw new InvalidArgumentException('Categoría inválida.');
        }

        $id = (int)$valor;
        if ($id <= 0) {
            return $permitirNull ? null : 0;
        }

        return $id;
    }
}

if (!function_exists('stock_lista_productos_validar_categoria_existente')) {
    function stock_lista_productos_validar_categoria_existente(PDO $pdo, ?int $idCategoria): void
    {
        if ($idCategoria === null || $idCategoria <= 0) {
            return;
        }

        $st = $pdo->prepare("
            SELECT id_stock_categoria
            FROM stock_categorias
            WHERE id_stock_categoria = :id
              AND activo = 1
            LIMIT 1
        ");
        $st->execute([':id' => $idCategoria]);

        if (!$st->fetchColumn()) {
            throw new RuntimeException('La categoría seleccionada no existe o está inactiva.');
        }
    }
}

if (!function_exists('stock_lista_productos_buscar_producto_por_id')) {
    function stock_lista_productos_buscar_producto_por_id(PDO $pdo, int $id): ?array
    {
        $st = $pdo->prepare("
            SELECT
                p.id,
                p.nombre,
                p.sku,
                p.precio,
                p.precio_promo,
                p.stock,
                p.descripcion,
                p.id_categoria_stock,
                c.nombre AS categoria_nombre,
                p.imagen_url,
                p.imagen_url AS imagen,
                a.id_archivo AS imagen_archivo_id,
                a.archivo_url AS imagen_archivo_url,
                a.archivo_path AS imagen_archivo_path,
                p.activo,
                p.created_at,
                p.updated_at
            FROM stock_productos p
            LEFT JOIN stock_categorias c
              ON c.id_stock_categoria = p.id_categoria_stock
            LEFT JOIN stock_archivos a
              ON a.id_archivo = (
                SELECT sa.id_archivo
                FROM stock_archivos sa
                WHERE sa.id_producto = p.id
                  AND sa.tipo = 'imagen_producto'
                  AND sa.activo = 1
                ORDER BY sa.id_archivo DESC
                LIMIT 1
              )
            WHERE p.id = :id
            LIMIT 1
        ");
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}

if (!function_exists('stock_lista_productos_validar_sku_unico')) {
    function stock_lista_productos_validar_sku_unico(PDO $pdo, ?string $sku, ?int $exceptId = null): void
    {
        $sku = trim((string)$sku);
        if ($sku === '') {
            return;
        }

        if ($exceptId !== null && $exceptId > 0) {
            $st = $pdo->prepare("SELECT id FROM stock_productos WHERE sku = :sku AND id <> :id LIMIT 1");
            $st->execute([':sku' => $sku, ':id' => $exceptId]);
        } else {
            $st = $pdo->prepare("SELECT id FROM stock_productos WHERE sku = :sku LIMIT 1");
            $st->execute([':sku' => $sku]);
        }

        if ($st->fetchColumn()) {
            throw new RuntimeException('Ya existe un producto con ese SKU.');
        }
    }
}

if (!function_exists('stock_lista_productos_historial_insertar')) {
    function stock_lista_productos_historial_insertar(
        PDO $pdo,
        int $productoId,
        string $campo,
        $valorAnterior,
        $valorNuevo,
        ?string $usuario = null
    ): void {
        $st = $pdo->prepare("
            INSERT INTO stock_productos_historial
                (producto_id, campo, valor_anterior, valor_nuevo, usuario)
            VALUES
                (:producto_id, :campo, :valor_anterior, :valor_nuevo, :usuario)
        ");
        $st->execute([
            ':producto_id'    => $productoId,
            ':campo'          => $campo,
            ':valor_anterior' => $valorAnterior !== null ? (string)$valorAnterior : null,
            ':valor_nuevo'    => $valorNuevo !== null ? (string)$valorNuevo : null,
            ':usuario'        => $usuario,
        ]);
    }
}

if (!function_exists('stock_lista_productos_eliminar_imagen_producto')) {
    function stock_lista_productos_eliminar_imagen_producto(PDO $pdo, int $idProducto, ?string $usuario = null): void
    {
        $st = $pdo->prepare("
            UPDATE stock_archivos
               SET activo = 0
             WHERE id_producto = :id_producto
               AND tipo = 'imagen_producto'
               AND activo = 1
        ");
        $st->execute([':id_producto' => $idProducto]);

        $stProd = $pdo->prepare("
            UPDATE stock_productos
               SET imagen_url = NULL,
                   updated_at = NOW()
             WHERE id = :id
        ");
        $stProd->execute([':id' => $idProducto]);

        stock_lista_productos_historial_insertar($pdo, $idProducto, 'imagen_eliminada', null, null, $usuario);
    }
}

if (!function_exists('stock_lista_productos_accion_listar')) {
    function stock_lista_productos_accion_listar(PDO $pdo): void
    {
        $busqueda   = trim((string)($_GET['busqueda'] ?? ''));
        $pagina     = max(1, (int)($_GET['pagina'] ?? 1));
        $porPagina  = max(1, min(100, (int)($_GET['por_pagina'] ?? 20)));
        $offset     = ($pagina - 1) * $porPagina;
        $idCategoria = stock_lista_productos_normalizar_categoria_id($_GET['id_categoria_stock'] ?? null, true);

        $camposValidos = [
            'id',
            'nombre',
            'sku',
            'precio',
            'precio_promo',
            'stock',
            'created_at',
            'updated_at',
            'categoria_nombre',
        ];

        $ordenCampo = trim((string)($_GET['orden_campo'] ?? 'nombre'));
        if (!in_array($ordenCampo, $camposValidos, true)) {
            $ordenCampo = 'nombre';
        }

        $mapOrden = [
            'id'              => 'p.id',
            'nombre'          => 'p.nombre',
            'sku'             => 'p.sku',
            'precio'          => 'p.precio',
            'precio_promo'    => 'p.precio_promo',
            'stock'           => 'p.stock',
            'created_at'      => 'p.created_at',
            'updated_at'      => 'p.updated_at',
            'categoria_nombre'=> 'c.nombre',
        ];

        $ordenSql = $mapOrden[$ordenCampo] ?? 'p.nombre';
        $ordenDir = strtoupper(trim((string)($_GET['orden_dir'] ?? 'ASC'))) === 'DESC' ? 'DESC' : 'ASC';

        $where  = [];
        $params = [];

        $activoParam = $_GET['activo'] ?? '1';
        if ($activoParam !== '' && $activoParam !== null) {
            $where[] = 'p.activo = :activo';
            $params[':activo'] = ((string)$activoParam === '1') ? 1 : 0;
        }

        if ($busqueda !== '') {
            $where[] = '(
                p.nombre LIKE :q
                OR p.sku LIKE :q
                OR p.descripcion LIKE :q
                OR c.nombre LIKE :q
            )';
            $params[':q'] = '%' . $busqueda . '%';
        }

        if ($idCategoria !== null && $idCategoria > 0) {
            $where[] = 'p.id_categoria_stock = :id_categoria_stock';
            $params[':id_categoria_stock'] = $idCategoria;
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $stTotal = $pdo->prepare("
            SELECT COUNT(*)
            FROM stock_productos p
            LEFT JOIN stock_categorias c
              ON c.id_stock_categoria = p.id_categoria_stock
            {$whereSql}
        ");
        foreach ($params as $k => $v) {
            $stTotal->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $stTotal->execute();
        $total = (int)$stTotal->fetchColumn();

        $sql = "
            SELECT
                p.id,
                p.nombre,
                p.sku,
                p.precio,
                p.precio_promo,
                p.stock,
                p.descripcion,
                p.id_categoria_stock,
                c.nombre AS categoria_nombre,
                p.imagen_url AS imagen,
                p.imagen_url,
                a.id_archivo AS imagen_archivo_id,
                a.archivo_url AS imagen_archivo_url,
                a.archivo_path AS imagen_archivo_path,
                p.activo,
                p.created_at,
                p.updated_at
            FROM stock_productos p
            LEFT JOIN stock_categorias c
              ON c.id_stock_categoria = p.id_categoria_stock
            LEFT JOIN stock_archivos a
              ON a.id_archivo = (
                SELECT sa.id_archivo
                FROM stock_archivos sa
                WHERE sa.id_producto = p.id
                  AND sa.tipo = 'imagen_producto'
                  AND sa.activo = 1
                ORDER BY sa.id_archivo DESC
                LIMIT 1
              )
            {$whereSql}
            ORDER BY {$ordenSql} {$ordenDir}, p.id DESC
            LIMIT :limit OFFSET :offset
        ";

        $st = $pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $st->bindValue($k, $v, is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $st->bindValue(':limit', $porPagina, PDO::PARAM_INT);
        $st->bindValue(':offset', $offset, PDO::PARAM_INT);
        $st->execute();

        $productos = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

        stock_lista_productos_ok([
            'productos'     => $productos,
            'total'         => $total,
            'pagina'        => $pagina,
            'por_pagina'    => $porPagina,
            'total_paginas' => (int)ceil($total / $porPagina),
        ]);
    }
}

if (!function_exists('stock_lista_productos_accion_obtener')) {
    function stock_lista_productos_accion_obtener(PDO $pdo): void
    {
        $body = stock_lista_productos_request_data();
        $id = (int)($body['id'] ?? $_GET['id'] ?? $_POST['id'] ?? 0);

        if ($id <= 0) {
            stock_lista_productos_fail('ID inválido', 400);
        }

        $producto = stock_lista_productos_buscar_producto_por_id($pdo, $id);
        if (!$producto) {
            stock_lista_productos_fail('Producto no encontrado', 404);
        }

        stock_lista_productos_ok(['producto' => $producto]);
    }
}

if (!function_exists('stock_lista_productos_accion_crear')) {
    function stock_lista_productos_accion_crear(PDO $pdo): void
    {
        $body = stock_lista_productos_request_data();

        $nombre      = stock_lista_productos_safe_text($body['nombre'] ?? '');
        $sku         = stock_lista_productos_safe_text($body['sku'] ?? '');
        $descripcion = stock_lista_productos_safe_text($body['descripcion'] ?? '');
        $imagenUrlManual = stock_lista_productos_safe_text($body['imagen_url'] ?? $body['imagen'] ?? '');

        $precio      = stock_lista_productos_normalizar_decimal($body['precio'] ?? null, false);
        $precioPromo = stock_lista_productos_normalizar_decimal($body['precio_promo'] ?? null, true);
        $stock       = stock_lista_productos_normalizar_entero($body['stock'] ?? null, true);
        $activo      = array_key_exists('activo', $body)
            ? stock_lista_productos_normalizar_activo($body['activo'])
            : 1;
        $idCategoria = stock_lista_productos_normalizar_categoria_id($body['id_categoria_stock'] ?? null, true);

        if ($nombre === '') {
            stock_lista_productos_fail('El nombre es obligatorio', 422);
        }
        if ($precio === null || $precio < 0) {
            stock_lista_productos_fail('El precio es obligatorio y debe ser válido', 422);
        }
        if ($precioPromo !== null && $precioPromo < 0) {
            stock_lista_productos_fail('El precio promo no puede ser negativo', 422);
        }
        if ($stock !== null && $stock < 0) {
            stock_lista_productos_fail('El stock no puede ser negativo', 422);
        }

        stock_lista_productos_validar_sku_unico($pdo, $sku !== '' ? $sku : null);
        stock_lista_productos_validar_categoria_existente($pdo, $idCategoria);

        $pdo->beginTransaction();

        try {
            $st = $pdo->prepare("
                INSERT INTO stock_productos
                    (nombre, sku, precio, precio_promo, stock, descripcion, id_categoria_stock, imagen_url, activo, created_at, updated_at)
                VALUES
                    (:nombre, :sku, :precio, :precio_promo, :stock, :descripcion, :id_categoria_stock, :imagen_url, :activo, NOW(), NOW())
            ");
            $st->execute([
                ':nombre'            => $nombre,
                ':sku'               => $sku !== '' ? $sku : null,
                ':precio'            => $precio,
                ':precio_promo'      => $precioPromo,
                ':stock'             => $stock,
                ':descripcion'       => $descripcion !== '' ? $descripcion : null,
                ':id_categoria_stock'=> $idCategoria,
                ':imagen_url'        => $imagenUrlManual !== '' ? $imagenUrlManual : null,
                ':activo'            => $activo,
            ]);

            $id = (int)$pdo->lastInsertId();

            $archivo = stock_lista_productos_archivos_subir_imagen_producto_si_existe($pdo, $id);
            if ($archivo !== null) {
                $stUpd = $pdo->prepare("
                    UPDATE stock_productos
                       SET imagen_url = :imagen_url,
                           updated_at = NOW()
                     WHERE id = :id
                ");
                $stUpd->execute([
                    ':imagen_url' => $archivo['archivo_url'],
                    ':id'         => $id,
                ]);
            }

            stock_lista_productos_historial_insertar(
                $pdo,
                $id,
                'crear',
                null,
                'Producto creado',
                stock_lista_productos_get_user_name()
            );
            stock_lista_productos_historial_insertar(
                $pdo,
                $id,
                'id_categoria_stock',
                null,
                $idCategoria,
                stock_lista_productos_get_user_name()
            );

            $pdo->commit();

            stock_lista_productos_ok([
                'mensaje' => 'Producto creado correctamente',
                'id'      => $id,
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}

if (!function_exists('stock_lista_productos_accion_actualizar')) {
    function stock_lista_productos_accion_actualizar(PDO $pdo): void
    {
        $body = stock_lista_productos_request_data();

        $id = (int)($body['id'] ?? $_GET['id'] ?? $_POST['id'] ?? 0);
        if ($id <= 0) {
            stock_lista_productos_fail('ID inválido', 400);
        }

        $actual = stock_lista_productos_buscar_producto_por_id($pdo, $id);
        if (!$actual) {
            stock_lista_productos_fail('Producto no encontrado', 404);
        }

        $camposPermitidos = [
            'nombre',
            'sku',
            'precio',
            'precio_promo',
            'stock',
            'descripcion',
            'id_categoria_stock',
            'imagen_url',
            'activo',
        ];

        $pedidoEliminarImagen = false;
        $eliminarImagenVal = $body['eliminar_imagen'] ?? null;
        if ($eliminarImagenVal !== null) {
            if (is_bool($eliminarImagenVal)) {
                $pedidoEliminarImagen = $eliminarImagenVal;
            } else {
                $v = mb_strtolower(trim((string)$eliminarImagenVal), 'UTF-8');
                $pedidoEliminarImagen = in_array($v, ['1', 'true', 'si', 'sí'], true);
            }
        }

        $hayArchivoNuevo = isset($_FILES['imagen'])
            && is_array($_FILES['imagen'])
            && (int)($_FILES['imagen']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

        $set = [];
        $params = [':id' => $id];
        $historial = [];
        $usuario = stock_lista_productos_get_user_name();

        foreach ($camposPermitidos as $campo) {
            if (!array_key_exists($campo, $body)) {
                continue;
            }
            if ($campo === 'imagen_url') {
                continue;
            }

            $valor = $body[$campo];

            if ($campo === 'nombre') {
                $valor = stock_lista_productos_safe_text($valor);
                if ($valor === '') {
                    stock_lista_productos_fail('El nombre es obligatorio', 422);
                }
            }

            if ($campo === 'sku') {
                $valor = stock_lista_productos_safe_text($valor);
                $valor = $valor !== '' ? $valor : null;
                stock_lista_productos_validar_sku_unico($pdo, $valor, $id);
            }

            if ($campo === 'precio') {
                $valor = stock_lista_productos_normalizar_decimal($valor, false);
                if ($valor === null || $valor < 0) {
                    stock_lista_productos_fail('El precio es obligatorio y debe ser válido', 422);
                }
            }

            if ($campo === 'precio_promo') {
                $valor = stock_lista_productos_normalizar_decimal($valor, true);
                if ($valor !== null && $valor < 0) {
                    stock_lista_productos_fail('El precio promo no puede ser negativo', 422);
                }
            }

            if ($campo === 'stock') {
                $valor = stock_lista_productos_normalizar_entero($valor, true);
                if ($valor !== null && $valor < 0) {
                    stock_lista_productos_fail('El stock no puede ser negativo', 422);
                }
            }

            if ($campo === 'descripcion') {
                $valor = stock_lista_productos_safe_text($valor);
                $valor = $valor !== '' ? $valor : null;
            }

            if ($campo === 'activo') {
                $valor = stock_lista_productos_normalizar_activo($valor);
            }

            if ($campo === 'id_categoria_stock') {
                $valor = stock_lista_productos_normalizar_categoria_id($valor, true);
                stock_lista_productos_validar_categoria_existente($pdo, $valor);
            }

            $valorAnterior = $actual[$campo] ?? null;
            if ((string)$valorAnterior === (string)$valor) {
                continue;
            }

            $set[] = "{$campo} = :{$campo}";
            $params[":{$campo}"] = $valor;
            $historial[] = [
                'campo'          => $campo,
                'valor_anterior' => $valorAnterior,
                'valor_nuevo'    => $valor,
            ];
        }

        if (!$set && !$pedidoEliminarImagen && !$hayArchivoNuevo) {
            stock_lista_productos_fail('No hay cambios para actualizar', 400);
        }

        $pdo->beginTransaction();

        try {
            if ($pedidoEliminarImagen) {
                $tieneImagen = !empty($actual['imagen_archivo_id']) || !empty($actual['imagen_url']);
                if ($tieneImagen) {
                    stock_lista_productos_eliminar_imagen_producto($pdo, $id, $usuario);
                    $actual['imagen_url'] = null;
                    $actual['imagen_archivo_id'] = null;
                }
            }

            $archivo = stock_lista_productos_archivos_subir_imagen_producto_si_existe($pdo, $id);
            if ($archivo !== null) {
                $set[] = "imagen_url = :imagen_url_archivo";
                $params[':imagen_url_archivo'] = $archivo['archivo_url'];

                $historial[] = [
                    'campo'          => 'imagen_url',
                    'valor_anterior' => $actual['imagen_url'] ?? null,
                    'valor_nuevo'    => $archivo['archivo_url'],
                ];
            }

            if ($set) {
                $sql = "UPDATE stock_productos SET " . implode(', ', $set) . ", updated_at = NOW() WHERE id = :id";
                $st = $pdo->prepare($sql);
                $st->execute($params);
            }

            foreach ($historial as $item) {
                stock_lista_productos_historial_insertar(
                    $pdo,
                    $id,
                    (string)$item['campo'],
                    $item['valor_anterior'],
                    $item['valor_nuevo'],
                    $usuario
                );
            }

            $pdo->commit();

            stock_lista_productos_ok([
                'mensaje' => 'Producto actualizado correctamente',
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}

if (!function_exists('stock_lista_productos_accion_eliminar')) {
    function stock_lista_productos_accion_eliminar(PDO $pdo): void
    {
        $body = stock_lista_productos_request_data();

        $id = (int)($body['id'] ?? $_POST['id'] ?? $_GET['id'] ?? 0);
        if ($id <= 0) {
            stock_lista_productos_fail('ID inválido', 400);
        }

        $actual = stock_lista_productos_buscar_producto_por_id($pdo, $id);
        if (!$actual) {
            stock_lista_productos_fail('Producto no encontrado', 404);
        }

        $pdo->beginTransaction();

        try {
            $pdo->prepare("DELETE FROM stock_productos_historial WHERE producto_id = :id")
                ->execute([':id' => $id]);

            $pdo->prepare("UPDATE stock_archivos SET activo = 0 WHERE id_producto = :id")
                ->execute([':id' => $id]);

            $st = $pdo->prepare("DELETE FROM stock_productos WHERE id = :id LIMIT 1");
            $st->execute([':id' => $id]);

            if ($st->rowCount() <= 0) {
                throw new RuntimeException('No se pudo eliminar el producto.');
            }

            $pdo->commit();

            stock_lista_productos_ok([
                'mensaje' => 'Producto eliminado correctamente',
            ]);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}

if (!function_exists('stock_lista_productos_handle')) {
    function stock_lista_productos_handle(string $action, ?PDO $pdo = null): void
    {
        try {
            $pdo = stock_lista_productos_pdo($pdo);
            $action = mb_strtolower(trim($action), 'UTF-8');

            switch ($action) {
                case 'stock_productos_listar':
                case 'stock_producto_listar':
                    stock_lista_productos_require_methods(['GET']);
                    stock_lista_productos_accion_listar($pdo);
                    return;

                case 'stock_producto_obtener':
                case 'stock_productos_obtener':
                    stock_lista_productos_require_methods(['GET', 'POST']);
                    stock_lista_productos_accion_obtener($pdo);
                    return;

                case 'stock_productos_crear':
                case 'stock_producto_crear':
                    stock_lista_productos_require_methods(['POST']);
                    stock_lista_productos_accion_crear($pdo);
                    return;

                case 'stock_productos_actualizar':
                case 'stock_producto_actualizar':
                    stock_lista_productos_require_methods(['POST', 'PUT', 'PATCH']);
                    stock_lista_productos_accion_actualizar($pdo);
                    return;

                case 'stock_productos_eliminar':
                case 'stock_producto_eliminar':
                    stock_lista_productos_require_methods(['POST', 'DELETE']);
                    stock_lista_productos_accion_eliminar($pdo);
                    return;

                case 'stock_producto_imagen_ver':
                case 'stock_productos_imagen_ver':
                    stock_lista_productos_require_methods(['GET']);
                    stock_lista_productos_accion_imagen_ver($pdo);
                    return;

                default:
                    stock_lista_productos_fail('Acción de stock inválida.', 404, [
                        'action' => $action,
                    ]);
            }
        } catch (Throwable $e) {
            stock_lista_productos_fail('Error en lista de productos: ' . $e->getMessage(), 500);
        }
    }
}