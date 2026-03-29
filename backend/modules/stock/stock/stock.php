<?php
declare(strict_types=1);

if (!function_exists('stock_categorias_send_json')) {
    function stock_categorias_send_json(array $payload, int $http = 200): void
    {
        if (!headers_sent()) {
            http_response_code($http);
            header('Content-Type: application/json; charset=utf-8');
        }

        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

if (!function_exists('stock_categorias_ok')) {
    function stock_categorias_ok(array $payload = [], int $http = 200): void
    {
        stock_categorias_send_json(array_merge(['exito' => true], $payload), $http);
    }
}

if (!function_exists('stock_categorias_fail')) {
    function stock_categorias_fail(string $mensaje, int $http = 200, array $extra = []): void
    {
        stock_categorias_send_json(
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

if (!function_exists('stock_categorias_body')) {
    function stock_categorias_body(): array
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

if (!function_exists('stock_categorias_pdo')) {
    function stock_categorias_pdo(?PDO $pdo = null): PDO
    {
        if ($pdo instanceof PDO) {
            return $pdo;
        }

        global $pdo;
        if (!isset($pdo) || !($pdo instanceof PDO)) {
            throw new RuntimeException('PDO no disponible.');
        }

        return $pdo;
    }
}

if (!function_exists('stock_categorias_require_methods')) {
    function stock_categorias_require_methods(array $allowed): void
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $allowed = array_map(static fn($m) => strtoupper((string)$m), $allowed);

        if (!in_array($method, $allowed, true)) {
            stock_categorias_fail('Método no permitido', 405, [
                'metodo'             => $method,
                'metodos_permitidos' => array_values($allowed),
            ]);
        }
    }
}

if (!function_exists('stock_categorias_as_int')) {
    function stock_categorias_as_int($valor, string $mensaje): int
    {
        if ($valor === null || $valor === '' || !is_numeric($valor)) {
            stock_categorias_fail($mensaje, 400);
        }

        $id = (int)$valor;
        if ($id <= 0) {
            stock_categorias_fail($mensaje, 400);
        }

        return $id;
    }
}

if (!function_exists('stock_categorias_normalizar_activo')) {
    function stock_categorias_normalizar_activo($valor): int
    {
        if (is_bool($valor)) {
            return $valor ? 1 : 0;
        }

        $v = mb_strtolower(trim((string)$valor), 'UTF-8');
        return in_array($v, ['1', 'true', 'si', 'sí', 'activo'], true) ? 1 : 0;
    }
}

if (!function_exists('stock_categorias_listar')) {
    function stock_categorias_listar(PDO $pdo): void
    {
        $soloActivas = (string)($_GET['solo_activas'] ?? $_GET['activo'] ?? '0') === '1';

        $sql = "
            SELECT
                c.id_stock_categoria,
                c.nombre,
                c.descripcion,
                c.activo,
                c.created_at,
                c.updated_at,
                COUNT(p.id) AS total_productos
            FROM stock_categorias c
            LEFT JOIN stock_productos p
                ON p.id_categoria_stock = c.id_stock_categoria
               AND p.activo = 1
        ";

        if ($soloActivas) {
            $sql .= " WHERE c.activo = 1 ";
        }

        $sql .= "
            GROUP BY
                c.id_stock_categoria,
                c.nombre,
                c.descripcion,
                c.activo,
                c.created_at,
                c.updated_at
            ORDER BY c.nombre ASC
        ";

        $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        stock_categorias_ok([
            'categorias' => $rows,
        ]);
    }
}

if (!function_exists('stock_categorias_obtener')) {
    function stock_categorias_obtener(PDO $pdo): void
    {
        $body = stock_categorias_body();
        $id = stock_categorias_as_int(
            $body['id_stock_categoria'] ?? $body['id'] ?? $_GET['id_stock_categoria'] ?? $_GET['id'] ?? 0,
            'ID de categoría inválido.'
        );

        $st = $pdo->prepare("
            SELECT
                c.*,
                COUNT(p.id) AS total_productos
            FROM stock_categorias c
            LEFT JOIN stock_productos p
              ON p.id_categoria_stock = c.id_stock_categoria
             AND p.activo = 1
            WHERE c.id_stock_categoria = :id
            GROUP BY c.id_stock_categoria
            LIMIT 1
        ");
        $st->execute([':id' => $id]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            stock_categorias_fail('Categoría no encontrada.', 404);
        }

        stock_categorias_ok([
            'categoria' => $row,
        ]);
    }
}

if (!function_exists('stock_categorias_crear')) {
    function stock_categorias_crear(PDO $pdo): void
    {
        $body = stock_categorias_body();

        $nombre = trim((string)($body['nombre'] ?? ''));
        $descripcion = trim((string)($body['descripcion'] ?? ''));
        $activo = array_key_exists('activo', $body)
            ? stock_categorias_normalizar_activo($body['activo'])
            : 1;

        if ($nombre === '') {
            stock_categorias_fail('El nombre de la categoría es obligatorio.', 422);
        }

        $stDup = $pdo->prepare("
            SELECT id_stock_categoria
            FROM stock_categorias
            WHERE UPPER(nombre) = UPPER(:nombre)
            LIMIT 1
        ");
        $stDup->execute([':nombre' => $nombre]);

        if ($stDup->fetchColumn()) {
            stock_categorias_fail('Ya existe una categoría con ese nombre.', 422);
        }

        $st = $pdo->prepare("
            INSERT INTO stock_categorias
                (nombre, descripcion, activo, created_at, updated_at)
            VALUES
                (:nombre, :descripcion, :activo, NOW(), NOW())
        ");
        $st->execute([
            ':nombre'      => $nombre,
            ':descripcion' => $descripcion !== '' ? $descripcion : null,
            ':activo'      => $activo,
        ]);

        stock_categorias_ok([
            'mensaje'            => 'Categoría creada correctamente.',
            'id_stock_categoria' => (int)$pdo->lastInsertId(),
        ]);
    }
}

if (!function_exists('stock_categorias_actualizar')) {
    function stock_categorias_actualizar(PDO $pdo): void
    {
        $body = stock_categorias_body();

        $id = stock_categorias_as_int(
            $body['id_stock_categoria'] ?? $body['id'] ?? 0,
            'ID de categoría inválido.'
        );

        $stActual = $pdo->prepare("SELECT * FROM stock_categorias WHERE id_stock_categoria = :id LIMIT 1");
        $stActual->execute([':id' => $id]);
        $actual = $stActual->fetch(PDO::FETCH_ASSOC);

        if (!$actual) {
            stock_categorias_fail('Categoría no encontrada.', 404);
        }

        $nombre = trim((string)($body['nombre'] ?? $actual['nombre']));
        $descripcion = array_key_exists('descripcion', $body)
            ? trim((string)$body['descripcion'])
            : (string)($actual['descripcion'] ?? '');
        $activo = array_key_exists('activo', $body)
            ? stock_categorias_normalizar_activo($body['activo'])
            : (int)$actual['activo'];

        if ($nombre === '') {
            stock_categorias_fail('El nombre de la categoría es obligatorio.', 422);
        }

        $stDup = $pdo->prepare("
            SELECT id_stock_categoria
            FROM stock_categorias
            WHERE UPPER(nombre) = UPPER(:nombre)
              AND id_stock_categoria <> :id
            LIMIT 1
        ");
        $stDup->execute([
            ':nombre' => $nombre,
            ':id'     => $id,
        ]);

        if ($stDup->fetchColumn()) {
            stock_categorias_fail('Ya existe otra categoría con ese nombre.', 422);
        }

        $st = $pdo->prepare("
            UPDATE stock_categorias
               SET nombre = :nombre,
                   descripcion = :descripcion,
                   activo = :activo,
                   updated_at = NOW()
             WHERE id_stock_categoria = :id
        ");
        $st->execute([
            ':nombre'      => $nombre,
            ':descripcion' => $descripcion !== '' ? $descripcion : null,
            ':activo'      => $activo,
            ':id'          => $id,
        ]);

        stock_categorias_ok([
            'mensaje' => 'Categoría actualizada correctamente.',
        ]);
    }
}

if (!function_exists('stock_categorias_eliminar')) {
    function stock_categorias_eliminar(PDO $pdo): void
    {
        $body = stock_categorias_body();

        $id = stock_categorias_as_int(
            $body['id_stock_categoria'] ?? $body['id'] ?? $_GET['id_stock_categoria'] ?? $_GET['id'] ?? 0,
            'ID de categoría inválido.'
        );

        $stUso = $pdo->prepare("
            SELECT COUNT(*)
            FROM stock_productos
            WHERE id_categoria_stock = :id
              AND activo = 1
        ");
        $stUso->execute([':id' => $id]);
        $enUso = (int)$stUso->fetchColumn();

        if ($enUso > 0) {
            $st = $pdo->prepare("
                UPDATE stock_categorias
                   SET activo = 0,
                       updated_at = NOW()
                 WHERE id_stock_categoria = :id
            ");
            $st->execute([':id' => $id]);

            stock_categorias_ok([
                'mensaje' => 'Categoría desactivada porque está asociada a productos.',
            ]);
        }

        $st = $pdo->prepare("DELETE FROM stock_categorias WHERE id_stock_categoria = :id");
        $st->execute([':id' => $id]);

        stock_categorias_ok([
            'mensaje' => 'Categoría eliminada correctamente.',
        ]);
    }
}

if (!function_exists('stock_categorias_resumen')) {
    function stock_categorias_resumen(PDO $pdo): void
    {
        $resumen = [
            'total_categorias' => 0,
            'total_activas'    => 0,
            'categorias'       => [],
        ];

        $resumen['total_categorias'] = (int)$pdo->query("SELECT COUNT(*) FROM stock_categorias")->fetchColumn();
        $resumen['total_activas'] = (int)$pdo->query("SELECT COUNT(*) FROM stock_categorias WHERE activo = 1")->fetchColumn();

        $sql = "
            SELECT
                c.id_stock_categoria,
                c.nombre,
                COUNT(p.id) AS total_productos
            FROM stock_categorias c
            LEFT JOIN stock_productos p
              ON p.id_categoria_stock = c.id_stock_categoria
             AND p.activo = 1
            WHERE c.activo = 1
            GROUP BY c.id_stock_categoria, c.nombre
            ORDER BY c.nombre ASC
        ";

        $resumen['categorias'] = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC) ?: [];

        stock_categorias_ok($resumen);
    }
}

if (!function_exists('stock_resumen_handle')) {
    function stock_resumen_handle(string $action, ?PDO $pdo = null): void
    {
        try {
            $pdo = stock_categorias_pdo($pdo);
            $action = mb_strtolower(trim($action), 'UTF-8');

            switch ($action) {
                case 'stock_categorias_listar':
                    stock_categorias_require_methods(['GET']);
                    stock_categorias_listar($pdo);
                    return;

                case 'stock_categoria_obtener':
                case 'stock_categorias_obtener':
                    stock_categorias_require_methods(['GET', 'POST']);
                    stock_categorias_obtener($pdo);
                    return;

                case 'stock_categoria_crear':
                case 'stock_categorias_crear':
                    stock_categorias_require_methods(['POST']);
                    stock_categorias_crear($pdo);
                    return;

                case 'stock_categoria_actualizar':
                case 'stock_categorias_actualizar':
                    stock_categorias_require_methods(['POST', 'PUT', 'PATCH']);
                    stock_categorias_actualizar($pdo);
                    return;

                case 'stock_categoria_eliminar':
                case 'stock_categorias_eliminar':
                    stock_categorias_require_methods(['POST', 'DELETE']);
                    stock_categorias_eliminar($pdo);
                    return;

                case 'stock_resumen_categorias':
                    stock_categorias_require_methods(['GET']);
                    stock_categorias_resumen($pdo);
                    return;

                default:
                    stock_categorias_fail('Acción inválida.', 404, ['action' => $action]);
            }
        } catch (Throwable $e) {
            stock_categorias_fail('Error en categorías de stock: ' . $e->getMessage(), 500);
        }
    }
}