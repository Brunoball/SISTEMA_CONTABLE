<?php
declare(strict_types=1);

/**
 * COMPROBANTES DE OTROS EGRESOS
 * - guarda 1 archivo por movimiento
 * - usa comprobantes_archivos.id_movimiento
 * - tipo = OTROS_EGRESOS
 *
 * CRITERIO CORRECTO:
 * - archivo_path => ruta relativa en DB:
 *   uploads/tenants/t_1/comprobantes/2026/03/otros_egresos/archivo.jpg
 *
 * - archivo_url => endpoint:
 *   https://balto.3devsnet.com/api/routes/api.php?action=otros_egresos_comprobantes_descargar&id_movimiento=123
 *
 * - archivo físico => se guarda en:
 *   /home/.../balto_private/uploads/tenants/t_1/comprobantes/2026/03/otros_egresos/archivo.jpg
 */

if (!function_exists('oec_json')) {
  function oec_json(array $data, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('oec_int')) {
  function oec_int($v, int $default = 0): int
  {
    if ($v === null || $v === '') return $default;
    return (int)$v;
  }
}

if (!function_exists('oec_table_columns')) {
  function oec_table_columns(PDO $pdo, string $table): array
  {
    static $cache = [];

    if (isset($cache[$table])) return $cache[$table];

    $st = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $cols = [];
    foreach ($rows as $r) {
      $field = (string)($r['Field'] ?? '');
      if ($field !== '') $cols[$field] = true;
    }

    $cache[$table] = $cols;
    return $cols;
  }
}

if (!function_exists('oec_has_col')) {
  function oec_has_col(PDO $pdo, string $table, string $col): bool
  {
    $cols = oec_table_columns($pdo, $table);
    return isset($cols[$col]);
  }
}

if (!function_exists('oec_get_uploaded_file')) {
  function oec_get_uploaded_file(): ?array
  {
    if (!isset($_FILES['archivo'])) return null;
    if (!is_array($_FILES['archivo'])) return null;
    if ((int)($_FILES['archivo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return null;
    if (empty($_FILES['archivo']['tmp_name'])) return null;
    return $_FILES['archivo'];
  }
}

if (!function_exists('oec_project_root')) {
  function oec_project_root(): string
  {
    return dirname(__DIR__, 5);
  }
}

if (!function_exists('oec_storage_root')) {
  function oec_storage_root(): string
  {
    $projectRoot = oec_project_root();

    $candidates = [
      dirname($projectRoot, 2) . DIRECTORY_SEPARATOR . 'balto_private',
      dirname($projectRoot, 1) . DIRECTORY_SEPARATOR . 'balto_private',
      $projectRoot . DIRECTORY_SEPARATOR . 'balto_private',
    ];

    foreach ($candidates as $candidate) {
      if (is_dir($candidate)) {
        return rtrim($candidate, DIRECTORY_SEPARATOR);
      }
    }

    return rtrim($candidates[0], DIRECTORY_SEPARATOR);
  }
}

if (!function_exists('oec_detect_tenant_id')) {
  function oec_detect_tenant_id(): int
  {
    $candidates = [
      $_GET['tenant_id'] ?? null,
      $_POST['tenant_id'] ?? null,
      $_SERVER['HTTP_X_TENANT_ID'] ?? null,
      $GLOBALS['tenant_id'] ?? null,
      $GLOBALS['id_tenant'] ?? null,
    ];

    foreach ($candidates as $c) {
      $n = (int)$c;
      if ($n > 0) return $n;
    }

    return 1;
  }
}

if (!function_exists('oec_relative_dir')) {
  function oec_relative_dir(): string
  {
    $tenantId = oec_detect_tenant_id();
    return 'uploads/tenants/t_' . $tenantId . '/comprobantes/' . date('Y') . '/' . date('m') . '/otros_egresos';
  }
}

if (!function_exists('oec_absolute_dir')) {
  function oec_absolute_dir(): string
  {
    return oec_storage_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, oec_relative_dir());
  }
}

if (!function_exists('oec_resolve_absolute_from_relative')) {
  function oec_resolve_absolute_from_relative(string $relativePath): string
  {
    $relativePath = trim(str_replace('\\', '/', $relativePath));
    $relativePath = ltrim($relativePath, '/');

    return oec_storage_root() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
  }
}

if (!function_exists('oec_base_api_url')) {
  function oec_base_api_url(): string
  {
    $scheme = 'https';
    if (
      (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
      || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
      || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    ) {
      $scheme = 'https';
    } else {
      $scheme = 'http';
    }

    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
      $host = 'balto.3devsnet.com';
    }

    return $scheme . '://' . $host . '/api/routes/api.php';
  }
}

if (!function_exists('oec_build_download_url')) {
  function oec_build_download_url(int $idMovimiento): string
  {
    return oec_base_api_url()
      . '?action=otros_egresos_comprobantes_descargar&id_movimiento=' . $idMovimiento;
  }
}

if (!function_exists('oec_mkdir')) {
  function oec_mkdir(string $dir): void
  {
    if (!is_dir($dir)) {
      if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("No se pudo crear el directorio: {$dir}");
      }
    }
  }
}

if (!function_exists('oec_detect_mime')) {
  function oec_detect_mime(string $tmpPath): string
  {
    $mime = '';
    if (function_exists('finfo_open')) {
      $f = finfo_open(FILEINFO_MIME_TYPE);
      if ($f) {
        $mime = (string)(finfo_file($f, $tmpPath) ?: '');
        finfo_close($f);
      }
    }
    return $mime ?: 'application/octet-stream';
  }
}

if (!function_exists('oec_guess_extension')) {
  function oec_guess_extension(string $originalName, string $mime): string
  {
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    if ($ext !== '') {
      $ext = preg_replace('/[^a-z0-9]+/i', '', $ext);
      return $ext ?: 'bin';
    }

    $map = [
      'application/pdf' => 'pdf',
      'image/jpeg' => 'jpg',
      'image/png' => 'png',
      'image/webp' => 'webp',
      'image/gif' => 'gif',
      'text/plain' => 'txt',
      'application/zip' => 'zip',
      'application/msword' => 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
      'application/vnd.ms-excel' => 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    ];

    return $map[$mime] ?? 'bin';
  }
}

if (!function_exists('oec_sha256_file')) {
  function oec_sha256_file(string $tmpPath): ?string
  {
    $hash = @hash_file('sha256', $tmpPath);
    return $hash !== false ? $hash : null;
  }
}

if (!function_exists('oec_delete_file_from_disk')) {
  function oec_delete_file_from_disk(string $path): void
  {
    $path = trim($path);
    if ($path === '') return;

    $absolute = $path;

    if (!preg_match('~^([A-Za-z]:[\\\\/]|/)~', $path)) {
      $absolute = oec_resolve_absolute_from_relative($path);
    }

    if (is_file($absolute)) {
      @unlink($absolute);
    }
  }
}

if (!function_exists('oec_validate_movimiento')) {
  function oec_validate_movimiento(PDO $pdo, int $idMovimiento): void
  {
    $sql = "
      SELECT id_movimiento
      FROM movimientos
      WHERE id_movimiento = :id
        AND id_tipo_operacion = 4
      LIMIT 1
    ";
    $st = $pdo->prepare($sql);
    $st->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
    $st->execute();

    if (!$st->fetchColumn()) {
      throw new RuntimeException('El movimiento indicado no existe o no corresponde a Otros Egresos.');
    }
  }
}

if (!function_exists('oec_find_existing_by_movimiento')) {
  function oec_find_existing_by_movimiento(PDO $pdo, int $idMovimiento): ?array
  {
    if (!oec_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')) {
      throw new RuntimeException('Falta la columna comprobantes_archivos.id_movimiento.');
    }

    $sql = "
      SELECT
        id_comprobante,
        tipo,
        archivo_url,
        archivo_path,
        archivo_mime,
        archivo_size,
        sha256,
        created_at,
        id_movimiento
      FROM comprobantes_archivos
      WHERE id_movimiento = :id_movimiento
        AND tipo = 'OTROS_EGRESOS'
      LIMIT 1
    ";

    $st = $pdo->prepare($sql);
    $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
    $st->execute();

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('oec_registrar_archivo')) {
  function oec_registrar_archivo(PDO $pdo, int $idMovimiento, array $file): array
  {
    if (!oec_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')) {
      throw new RuntimeException('Falta la columna comprobantes_archivos.id_movimiento.');
    }

    $tmpPath      = (string)$file['tmp_name'];
    $originalName = (string)($file['name'] ?? 'archivo');
    $size         = (int)($file['size'] ?? 0);
    $mime         = oec_detect_mime($tmpPath);
    $sha256       = oec_sha256_file($tmpPath);
    $ext          = oec_guess_extension($originalName, $mime);

    $relativeDir = oec_relative_dir();
    $absoluteDir = oec_absolute_dir();
    oec_mkdir($absoluteDir);

    $safeName = 'otro_egreso_' . $idMovimiento . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;

    $relativePath = $relativeDir . '/' . $safeName;
    $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $safeName;

    if (!move_uploaded_file($tmpPath, $absolutePath)) {
      throw new RuntimeException('No se pudo mover el archivo subido al destino final.');
    }

    $archivoUrl = oec_build_download_url($idMovimiento);
    $existing = oec_find_existing_by_movimiento($pdo, $idMovimiento);

    if ($existing) {
      $sql = "
        UPDATE comprobantes_archivos
        SET
          tipo = 'OTROS_EGRESOS',
          emitido_en_arca = 0,
          archivo_url = :archivo_url,
          archivo_path = :archivo_path,
          archivo_mime = :archivo_mime,
          archivo_size = :archivo_size,
          sha256 = :sha256,
          id_movimiento = :id_movimiento
        WHERE id_comprobante = :id_comprobante
        LIMIT 1
      ";
      $st = $pdo->prepare($sql);
      $st->bindValue(':archivo_url', $archivoUrl);
      $st->bindValue(':archivo_path', $relativePath);
      $st->bindValue(':archivo_mime', $mime);
      $st->bindValue(':archivo_size', $size, PDO::PARAM_INT);
      $st->bindValue(':sha256', $sha256);
      $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
      $st->bindValue(':id_comprobante', (int)$existing['id_comprobante'], PDO::PARAM_INT);
      $st->execute();

      if (!empty($existing['archivo_path']) && (string)$existing['archivo_path'] !== $relativePath) {
        oec_delete_file_from_disk((string)$existing['archivo_path']);
      }

      return [
        'id_comprobante' => (int)$existing['id_comprobante'],
        'id_movimiento'  => $idMovimiento,
        'archivo_url'    => $archivoUrl,
        'archivo_path'   => $relativePath,
        'archivo_mime'   => $mime,
        'archivo_size'   => $size,
        'sha256'         => $sha256,
        'reemplazado'    => true,
      ];
    }

    $sql = "
      INSERT INTO comprobantes_archivos
      (
        tipo,
        emitido_en_arca,
        archivo_url,
        archivo_path,
        archivo_mime,
        archivo_size,
        sha256,
        id_movimiento
      )
      VALUES
      (
        'OTROS_EGRESOS',
        0,
        :archivo_url,
        :archivo_path,
        :archivo_mime,
        :archivo_size,
        :sha256,
        :id_movimiento
      )
    ";
    $st = $pdo->prepare($sql);
    $st->bindValue(':archivo_url', $archivoUrl);
    $st->bindValue(':archivo_path', $relativePath);
    $st->bindValue(':archivo_mime', $mime);
    $st->bindValue(':archivo_size', $size, PDO::PARAM_INT);
    $st->bindValue(':sha256', $sha256);
    $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
    $st->execute();

    $idComprobante = (int)$pdo->lastInsertId();

    return [
      'id_comprobante' => $idComprobante,
      'id_movimiento'  => $idMovimiento,
      'archivo_url'    => $archivoUrl,
      'archivo_path'   => $relativePath,
      'archivo_mime'   => $mime,
      'archivo_size'   => $size,
      'sha256'         => $sha256,
      'reemplazado'    => false,
    ];
  }
}

if (!function_exists('otros_egresos_comprobantes_vincular_movimiento_upload')) {
  function otros_egresos_comprobantes_vincular_movimiento_upload(PDO $pdo): void
  {
    try {
      $idMovimiento = oec_int($_POST['id_movimiento'] ?? $_GET['id_movimiento'] ?? 0, 0);
      if ($idMovimiento <= 0) {
        oec_json(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      oec_validate_movimiento($pdo, $idMovimiento);

      $file = oec_get_uploaded_file();
      if (!$file) {
        oec_json(['exito' => false, 'mensaje' => 'No se recibió ningún archivo válido en el campo "archivo".'], 422);
      }

      $pdo->beginTransaction();
      $reg = oec_registrar_archivo($pdo, $idMovimiento, $file);
      $pdo->commit();

      oec_json([
        'exito'          => true,
        'mensaje'        => !empty($reg['reemplazado']) ? 'Comprobante reemplazado y vinculado correctamente.' : 'Comprobante subido y vinculado correctamente.',
        'id_movimiento'  => $idMovimiento,
        'id_comprobante' => (int)$reg['id_comprobante'],
        'archivo_url'    => (string)$reg['archivo_url'],
        'archivo_path'   => (string)$reg['archivo_path'],
        'archivo_mime'   => (string)$reg['archivo_mime'],
        'archivo_size'   => (int)$reg['archivo_size'],
        'sha256'         => (string)$reg['sha256'],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();

      oec_json([
        'exito'   => false,
        'mensaje' => 'No se pudo vincular el comprobante del egreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_egresos_comprobantes_info')) {
  function otros_egresos_comprobantes_info(PDO $pdo): void
  {
    try {
      $idMovimiento = oec_int($_GET['id_movimiento'] ?? $_GET['id'] ?? 0, 0);
      if ($idMovimiento <= 0) {
        oec_json(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      $row = oec_find_existing_by_movimiento($pdo, $idMovimiento);

      oec_json([
        'exito'             => true,
        'tiene_comprobante' => !!$row,
        'comprobante'       => $row,
      ]);
    } catch (Throwable $e) {
      oec_json([
        'exito'   => false,
        'mensaje' => 'Error obteniendo info del comprobante: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_egresos_comprobantes_descargar')) {
  function otros_egresos_comprobantes_descargar(PDO $pdo): void
  {
    try {
      $idMovimiento = oec_int($_GET['id_movimiento'] ?? $_GET['id'] ?? 0, 0);
      if ($idMovimiento <= 0) {
        oec_json(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      $row = oec_find_existing_by_movimiento($pdo, $idMovimiento);
      if (!$row) {
        oec_json(['exito' => false, 'mensaje' => 'No hay comprobante asociado a ese egreso.'], 404);
      }

      $path = trim((string)($row['archivo_path'] ?? ''));
      $mime = (string)($row['archivo_mime'] ?? 'application/octet-stream');

      if ($path === '') {
        oec_json(['exito' => false, 'mensaje' => 'El comprobante no tiene archivo_path guardado.'], 404);
      }

      $realPath = oec_resolve_absolute_from_relative($path);

      if (!is_file($realPath)) {
        oec_json([
          'exito'   => false,
          'mensaje' => 'El archivo físico no existe en el servidor.',
          'debug'   => [
            'archivo_path' => $path,
            'real_path'    => $realPath,
            'storage_root' => oec_storage_root(),
          ],
        ], 404);
      }

      $fileName = basename($realPath);

      if (ob_get_level() > 0) @ob_end_clean();

      header('Content-Description: File Transfer');
      header('Content-Type: ' . $mime);
      header('Content-Length: ' . (string)filesize($realPath));
      header('Content-Disposition: inline; filename="' . $fileName . '"');
      header('Cache-Control: private, max-age=0, must-revalidate');
      header('Pragma: public');

      readfile($realPath);
      exit;
    } catch (Throwable $e) {
      oec_json([
        'exito'   => false,
        'mensaje' => 'Error descargando comprobante: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_egresos_comprobantes_eliminar')) {
  function otros_egresos_comprobantes_eliminar(PDO $pdo): void
  {
    try {
      $payload = [];
      $raw = file_get_contents('php://input');
      if ($raw) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) $payload = $decoded;
      }

      $idMovimiento = oec_int(
        $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? $payload['id_movimiento'] ?? 0,
        0
      );

      if ($idMovimiento <= 0) {
        oec_json(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);
      }

      $existing = oec_find_existing_by_movimiento($pdo, $idMovimiento);
      if (!$existing) {
        oec_json(['exito' => true, 'mensaje' => 'No había comprobante para eliminar.']);
      }

      $sql = "
        DELETE FROM comprobantes_archivos
        WHERE id_comprobante = :id_comprobante
        LIMIT 1
      ";
      $st = $pdo->prepare($sql);
      $st->bindValue(':id_comprobante', (int)$existing['id_comprobante'], PDO::PARAM_INT);
      $st->execute();

      if (!empty($existing['archivo_path'])) {
        oec_delete_file_from_disk((string)$existing['archivo_path']);
      }

      oec_json([
        'exito'   => true,
        'mensaje' => 'Comprobante eliminado correctamente.',
      ]);
    } catch (Throwable $e) {
      oec_json([
        'exito'   => false,
        'mensaje' => 'Error eliminando comprobante: ' . $e->getMessage(),
      ], 500);
    }
  }
}