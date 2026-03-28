<?php
declare(strict_types=1);

if (!function_exists('stock_lista_productos_archivos_pdo')) {
    function stock_lista_productos_archivos_pdo(?PDO $pdo = null): PDO
    {
        if ($pdo instanceof PDO) {
            return $pdo;
        }

        global $pdo;
        if (!isset($pdo) || !($pdo instanceof PDO)) {
            throw new RuntimeException('PDO no disponible en módulo de archivos de productos.');
        }

        return $pdo;
    }
}

if (!function_exists('stock_lista_productos_archivos_detectar_tenant_id')) {
    function stock_lista_productos_archivos_detectar_tenant_id(): int
    {
        $candidatos = [
            $_SESSION['tenant_id'] ?? null,
            $_SESSION['id_tenant'] ?? null,
            $_SESSION['balto_tenant_id'] ?? null,
            $_SERVER['HTTP_X_TENANT_ID'] ?? null,
            $_GET['tenant_id'] ?? null,
            $_POST['tenant_id'] ?? null,
        ];

        foreach ($candidatos as $candidato) {
            if ($candidato !== null && $candidato !== '' && is_numeric($candidato) && (int)$candidato > 0) {
                return (int)$candidato;
            }
        }

        throw new RuntimeException('No se pudo detectar el tenant actual.');
    }
}

if (!function_exists('stock_lista_productos_archivos_project_root')) {
    function stock_lista_productos_archivos_project_root(): string
    {
        // __DIR__ = .../api/modules/stock/stock
        // dirname(__DIR__, 4) sube: stock -> stock(módulo) -> modules -> api -> raíz proyecto
        $root = dirname(__DIR__, 4);

        if ($root === '' || !is_dir($root)) {
            throw new RuntimeException('No se pudo resolver la raíz del proyecto.');
        }

        return $root;
    }
}

if (!function_exists('stock_lista_productos_archivos_account_root')) {
    function stock_lista_productos_archivos_account_root(): string
    {
        $projectRoot = stock_lista_productos_archivos_project_root();
        $parent1 = dirname($projectRoot);
        $parent2 = dirname($parent1);

        if ($parent2 === '' || !is_dir($parent2)) {
            throw new RuntimeException('No se pudo resolver la raíz de la cuenta.');
        }

        return $parent2;
    }
}

if (!function_exists('stock_lista_productos_archivos_private_root')) {
    function stock_lista_productos_archivos_private_root(): string
    {
        $root = stock_lista_productos_archivos_account_root() . DIRECTORY_SEPARATOR . 'balto_private';

        if (!is_dir($root) && !mkdir($root, 0775, true) && !is_dir($root)) {
            throw new RuntimeException('No se pudo crear la carpeta balto_private en la raíz de la cuenta.');
        }

        return $root;
    }
}

if (!function_exists('stock_lista_productos_archivos_uploads_root')) {
    function stock_lista_productos_archivos_uploads_root(): string
    {
        $uploads = stock_lista_productos_archivos_private_root() . DIRECTORY_SEPARATOR . 'uploads';

        if (!is_dir($uploads) && !mkdir($uploads, 0775, true) && !is_dir($uploads)) {
            throw new RuntimeException('No se pudo crear la carpeta uploads privada.');
        }

        return $uploads;
    }
}

if (!function_exists('stock_lista_productos_archivos_upload_dir_absoluto')) {
    function stock_lista_productos_archivos_upload_dir_absoluto(int $tenantId): string
    {
        return stock_lista_productos_archivos_uploads_root()
            . DIRECTORY_SEPARATOR . 'tenants'
            . DIRECTORY_SEPARATOR . 't_' . $tenantId
            . DIRECTORY_SEPARATOR . 'stock'
            . DIRECTORY_SEPARATOR . 'productos';
    }
}

if (!function_exists('stock_lista_productos_archivos_upload_dir_relativo')) {
    function stock_lista_productos_archivos_upload_dir_relativo(int $tenantId): string
    {
        return 'tenants/t_' . $tenantId . '/stock/productos';
    }
}

if (!function_exists('stock_lista_productos_archivos_asegurar_directorio')) {
    function stock_lista_productos_archivos_asegurar_directorio(string $dir): void
    {
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('No se pudo crear el directorio de imágenes.');
        }
    }
}

if (!function_exists('stock_lista_productos_archivos_extension_por_mime')) {
    function stock_lista_productos_archivos_extension_por_mime(string $mime): string
    {
        $map = [
            'image/jpeg' => 'jpg',
            'image/jpg'  => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
        ];

        return $map[$mime] ?? 'bin';
    }
}

if (!function_exists('stock_lista_productos_archivos_ruta_absoluta_desde_relativa')) {
    function stock_lista_productos_archivos_ruta_absoluta_desde_relativa(string $rutaRel): string
    {
        $rutaRel = trim($rutaRel);
        if ($rutaRel === '') {
            throw new RuntimeException('Ruta relativa vacía.');
        }

        return stock_lista_productos_archivos_uploads_root()
            . DIRECTORY_SEPARATOR
            . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $rutaRel);
    }
}

if (!function_exists('stock_lista_productos_archivos_obtener_ultimo_archivo_activo_producto')) {
    function stock_lista_productos_archivos_obtener_ultimo_archivo_activo_producto(PDO $pdo, int $idProducto): ?array
    {
        $st = $pdo->prepare("
            SELECT
                id_archivo,
                archivo_url,
                archivo_path,
                activo,
                created_at
            FROM stock_archivos
            WHERE id_producto = :id_producto
              AND tipo = 'imagen_producto'
              AND activo = 1
            ORDER BY id_archivo DESC
            LIMIT 1
        ");
        $st->execute([':id_producto' => $idProducto]);
        $row = $st->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}

if (!function_exists('stock_lista_productos_archivos_desactivar_imagenes_anteriores')) {
    function stock_lista_productos_archivos_desactivar_imagenes_anteriores(PDO $pdo, int $idProducto): void
    {
        $st = $pdo->prepare("
            UPDATE stock_archivos
               SET activo = 0
             WHERE id_producto = :id_producto
               AND tipo = 'imagen_producto'
               AND activo = 1
        ");
        $st->execute([':id_producto' => $idProducto]);
    }
}

if (!function_exists('stock_lista_productos_archivos_subir_imagen_producto_si_existe')) {
    function stock_lista_productos_archivos_subir_imagen_producto_si_existe(PDO $pdo, int $idProducto): ?array
    {
        if (
            !isset($_FILES['imagen']) ||
            !is_array($_FILES['imagen']) ||
            (int)($_FILES['imagen']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE
        ) {
            return null;
        }

        $file = $_FILES['imagen'];

        if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Error al subir la imagen.');
        }

        $tmpPath = (string)($file['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            throw new RuntimeException('Archivo de imagen inválido.');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? (string)finfo_file($finfo, $tmpPath) : '';
        if ($finfo) {
            finfo_close($finfo);
        }

        $permitidos = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (!in_array($mime, $permitidos, true)) {
            throw new RuntimeException('La imagen debe ser JPG, PNG, WEBP o GIF.');
        }

        $size = (int)($file['size'] ?? 0);
        if ($size <= 0) {
            throw new RuntimeException('La imagen está vacía.');
        }

        if ($size > 5 * 1024 * 1024) {
            throw new RuntimeException('La imagen no puede superar los 5 MB.');
        }

        $tenantId = stock_lista_productos_archivos_detectar_tenant_id();

        $dirAbs = stock_lista_productos_archivos_upload_dir_absoluto($tenantId);
        $dirRel = stock_lista_productos_archivos_upload_dir_relativo($tenantId);

        stock_lista_productos_archivos_asegurar_directorio($dirAbs);
        stock_lista_productos_archivos_desactivar_imagenes_anteriores($pdo, $idProducto);

        $ext = stock_lista_productos_archivos_extension_por_mime($mime);
        $nombreFinal = 'prod_' . $idProducto . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;

        $rutaAbs = $dirAbs . DIRECTORY_SEPARATOR . $nombreFinal;
        $rutaRel = $dirRel . '/' . $nombreFinal;

        if (!move_uploaded_file($tmpPath, $rutaAbs)) {
            throw new RuntimeException('No se pudo guardar la imagen en el servidor.');
        }

        $stArchivo = $pdo->prepare("
            INSERT INTO stock_archivos
                (id_producto, tipo, archivo_url, archivo_path, activo, created_at)
            VALUES
                (:id_producto, :tipo, '', :archivo_path, 1, NOW())
        ");
        $stArchivo->execute([
            ':id_producto'  => $idProducto,
            ':tipo'         => 'imagen_producto',
            ':archivo_path' => $rutaRel,
        ]);

        $idArchivo = (int)$pdo->lastInsertId();
        $archivoUrl = 'api.php?action=stock_producto_imagen_ver&id_archivo=' . $idArchivo;

        $stUpdArchivo = $pdo->prepare("
            UPDATE stock_archivos
               SET archivo_url = :archivo_url
             WHERE id_archivo = :id_archivo
        ");
        $stUpdArchivo->execute([
            ':archivo_url' => $archivoUrl,
            ':id_archivo'  => $idArchivo,
        ]);

        return [
            'id_archivo'   => $idArchivo,
            'archivo_url'  => $archivoUrl,
            'archivo_path' => $rutaRel,
        ];
    }
}

if (!function_exists('stock_lista_productos_accion_imagen_ver')) {
    function stock_lista_productos_accion_imagen_ver(?PDO $pdo = null): void
    {
        try {
            $pdo = stock_lista_productos_archivos_pdo($pdo);

            $idArchivo = (int)($_GET['id_archivo'] ?? 0);
            if ($idArchivo <= 0) {
                http_response_code(400);
                exit('ID de archivo inválido');
            }

            $st = $pdo->prepare("
                SELECT archivo_path, activo
                FROM stock_archivos
                WHERE id_archivo = :id_archivo
                LIMIT 1
            ");
            $st->execute([':id_archivo' => $idArchivo]);
            $archivo = $st->fetch(PDO::FETCH_ASSOC);

            if (!$archivo || (int)($archivo['activo'] ?? 0) !== 1) {
                http_response_code(404);
                exit('Imagen no encontrada');
            }

            $rutaRel = trim((string)($archivo['archivo_path'] ?? ''));
            if ($rutaRel === '') {
                http_response_code(404);
                exit('Ruta vacía');
            }

            $rutaAbs = stock_lista_productos_archivos_ruta_absoluta_desde_relativa($rutaRel);

            if (!is_file($rutaAbs)) {
                http_response_code(404);
                exit('Archivo no encontrado');
            }

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = $finfo ? (string)finfo_file($finfo, $rutaAbs) : 'application/octet-stream';
            if ($finfo) {
                finfo_close($finfo);
            }

            if (ob_get_length()) {
                @ob_end_clean();
            }

            header_remove('Content-Type');
            header('Content-Type: ' . $mime);
            header('Content-Length: ' . (string)filesize($rutaAbs));
            header('Cache-Control: private, max-age=86400');
            header('X-Content-Type-Options: nosniff');

            readfile($rutaAbs);
            exit;
        } catch (Throwable $e) {
            http_response_code(500);
            exit('Error al mostrar la imagen');
        }
    }
}