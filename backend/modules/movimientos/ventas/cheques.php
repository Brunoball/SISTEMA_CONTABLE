<?php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

if (!function_exists('ventas_cheques_output_json')) {
  function ventas_cheques_output_json(array $payload, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('ventas_cheques_json_input')) {
  function ventas_cheques_json_input(): array
  {
    $raw = file_get_contents('php://input');
    if (!$raw) {
      return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('ventas_cheques_request_data')) {
  function ventas_cheques_request_data(): array
  {
    if (!empty($_FILES)) {
      return is_array($_POST) ? $_POST : [];
    }

    $json = ventas_cheques_json_input();
    if (!empty($json)) {
      return $json;
    }

    return is_array($_POST) ? $_POST : [];
  }
}

if (!function_exists('ventas_cheques_safe_str')) {
  function ventas_cheques_safe_str($v): string
  {
    return trim((string)($v ?? ''));
  }
}

if (!function_exists('ventas_cheques_safe_int')) {
  function ventas_cheques_safe_int($v): int
  {
    if ($v === null || $v === '') {
      return 0;
    }
    return (int)$v;
  }
}

if (!function_exists('ventas_cheques_safe_nullable_int')) {
  function ventas_cheques_safe_nullable_int($v): ?int
  {
    if ($v === null || $v === '') {
      return null;
    }
    $n = (int)$v;
    return $n > 0 ? $n : null;
  }
}

if (!function_exists('ventas_cheques_safe_date')) {
  function ventas_cheques_safe_date($v): ?string
  {
    $s = trim((string)$v);
    if ($s === '') {
      return null;
    }

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
      return $s;
    }

    return null;
  }
}

if (!function_exists('ventas_cheques_safe_amount')) {
  function ventas_cheques_safe_amount($v): float
  {
    if (is_string($v)) {
      $v = str_replace(['$', ' '], '', $v);

      if (strpos($v, ',') !== false) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
      }
    }

    $n = (float)$v;
    return is_finite($n) ? round($n, 2) : 0.0;
  }
}

if (!function_exists('ventas_cheques_normalize_tipo')) {
  function ventas_cheques_normalize_tipo($v): string
  {
    $s = mb_strtolower(trim((string)$v), 'UTF-8');
    $s = str_replace(['-', '_', ' '], '', $s);

    return $s === 'echeq' ? 'echeq' : 'cheque';
  }
}

if (!function_exists('ventas_cheques_comprobante_tipo')) {
  function ventas_cheques_comprobante_tipo(string $tipoCheque): string
  {
    return mb_strtolower(trim($tipoCheque), 'UTF-8') === 'echeq'
      ? 'ECHEQ'
      : 'CHEQUE';
  }
}

if (!function_exists('ventas_cheques_assert_movimiento_exists')) {
  function ventas_cheques_assert_movimiento_exists(PDO $pdo, int $idMovimiento): void
  {
    if ($idMovimiento <= 0) {
      throw new RuntimeException('Falta el id_movimiento.');
    }

    $st = $pdo->prepare("
      SELECT
        m.id_movimiento,
        m.id_tipo_operacion,
        m.id_tipo_venta,
        m.id_cliente,
        m.monto_total,
        m.fecha
      FROM movimientos m
      WHERE m.id_movimiento = :id_movimiento
      LIMIT 1
    ");
    $st->execute([':id_movimiento' => $idMovimiento]);

    $mov = $st->fetch(PDO::FETCH_ASSOC);
    if (!$mov) {
      throw new RuntimeException('El movimiento indicado no existe.');
    }
  }
}

if (!function_exists('ventas_cheques_assert_comprobante_exists')) {
  function ventas_cheques_assert_comprobante_exists(PDO $pdo, ?int $idComprobante, int $idMovimiento): void
  {
    if ($idComprobante === null || $idComprobante <= 0) {
      return;
    }

    $st = $pdo->prepare("
      SELECT
        ca.id_comprobante,
        ca.id_movimiento,
        ca.tipo,
        ca.archivo_url,
        ca.archivo_path,
        ca.archivo_mime,
        ca.archivo_size,
        ca.emitido_en_arca
      FROM comprobantes_archivos ca
      WHERE ca.id_comprobante = :id_comprobante
      LIMIT 1
    ");
    $st->execute([':id_comprobante' => $idComprobante]);

    $comp = $st->fetch(PDO::FETCH_ASSOC);
    if (!$comp) {
      throw new RuntimeException('El comprobante indicado no existe.');
    }

    $idMovimientoComp = isset($comp['id_movimiento']) ? (int)$comp['id_movimiento'] : 0;

    if ($idMovimientoComp > 0 && $idMovimientoComp !== $idMovimiento) {
      throw new RuntimeException('El comprobante no pertenece al movimiento indicado.');
    }
  }
}

if (!function_exists('ventas_cheques_validate_payload')) {
  function ventas_cheques_validate_payload(PDO $pdo, array $in, bool $isUpdate = false): array
  {
    $idCheque      = ventas_cheques_safe_int($in['id_cheque'] ?? 0);
    $idMovimiento  = ventas_cheques_safe_int($in['id_movimiento'] ?? 0);
    $idComprobante = ventas_cheques_safe_nullable_int($in['id_comprobante'] ?? null);

    $tipo         = ventas_cheques_normalize_tipo($in['tipo'] ?? $in['tipo_cheque'] ?? 'cheque');
    $fechaEmision = ventas_cheques_safe_date($in['fecha_emision'] ?? null);
    $emisor       = ventas_cheques_safe_str($in['emisor'] ?? '');
    $numeroCheque = ventas_cheques_safe_str($in['numero_cheque'] ?? '');
    $importe      = ventas_cheques_safe_amount($in['importe'] ?? 0);
    $fechaPago    = ventas_cheques_safe_date($in['fecha_pago'] ?? null);

    if ($isUpdate && $idCheque <= 0) {
      throw new RuntimeException('Falta id_cheque para actualizar.');
    }

    if ($idMovimiento <= 0) {
      throw new RuntimeException('Falta el id_movimiento para vincular el cheque.');
    }

    if (!$fechaEmision) {
      throw new RuntimeException('La fecha de emisión es obligatoria.');
    }

    if ($emisor === '') {
      throw new RuntimeException('El emisor es obligatorio.');
    }

    if ($numeroCheque === '') {
      throw new RuntimeException('El número de cheque es obligatorio.');
    }

    if ($importe <= 0) {
      throw new RuntimeException('El importe debe ser mayor a 0.');
    }

    if (!$fechaPago) {
      throw new RuntimeException('La fecha de pago es obligatoria.');
    }

    ventas_cheques_assert_movimiento_exists($pdo, $idMovimiento);
    ventas_cheques_assert_comprobante_exists($pdo, $idComprobante, $idMovimiento);

    return [
      'id_cheque'      => $idCheque,
      'id_movimiento'  => $idMovimiento,
      'id_comprobante' => $idComprobante,
      'tipo'           => $tipo,
      'fecha_emision'  => $fechaEmision,
      'emisor'         => $emisor,
      'numero_cheque'  => $numeroCheque,
      'importe'        => $importe,
      'fecha_pago'     => $fechaPago,
    ];
  }
}

if (!function_exists('ventas_cheques_fetch_one')) {
  function ventas_cheques_fetch_one(PDO $pdo, int $idCheque): ?array
  {
    $st = $pdo->prepare("
      SELECT
        c.id_cheque,
        c.tipo,
        c.id_movimiento,
        c.id_comprobante,
        c.fecha_emision,
        c.emisor,
        c.numero_cheque,
        c.importe,
        c.fecha_pago,
        c.activo,
        c.created_at,
        c.updated_at,

        m.fecha AS movimiento_fecha,
        m.id_tipo_operacion,
        m.id_clasificacion,
        m.id_tipo_venta,
        m.id_cliente,
        m.id_proveedor,
        m.id_detalle,
        m.monto_total,
        m.id_medio_pago,

        ca.tipo AS comprobante_tipo,
        ca.emitido_en_arca,
        ca.archivo_url,
        ca.archivo_path,
        ca.archivo_mime,
        ca.archivo_size,
        ca.sha256,
        ca.created_at AS comprobante_created_at
      FROM movimientos_cheques c
      INNER JOIN movimientos m
        ON m.id_movimiento = c.id_movimiento
      LEFT JOIN comprobantes_archivos ca
        ON ca.id_comprobante = c.id_comprobante
      WHERE c.id_cheque = :id_cheque
      LIMIT 1
    ");
    $st->execute([':id_cheque' => $idCheque]);

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

/*
|--------------------------------------------------------------------------
| Helpers de paths privados Balto
|--------------------------------------------------------------------------
*/

if (!function_exists('ventas_cheques_is_https_request')) {
  function ventas_cheques_is_https_request(): bool
  {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
      return true;
    }

    if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') {
      return true;
    }

    $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
    return strtolower($xfp) === 'https';
  }
}

if (!function_exists('ventas_cheques_dirname_n')) {
  function ventas_cheques_dirname_n(string $path, int $levels): string
  {
    $out = $path;
    for ($i = 0; $i < $levels; $i++) {
      $out = dirname($out);
    }
    return $out;
  }
}

if (!function_exists('ventas_cheques_get_public_html_dir')) {
  function ventas_cheques_get_public_html_dir(): string
  {
    $apiDir = realpath(ventas_cheques_dirname_n(__DIR__, 3));
    if ($apiDir && is_dir($apiDir)) {
      $projectDir = realpath($apiDir . '/..');
      if ($projectDir && is_dir($projectDir)) {
        $publicHtml = realpath($projectDir . '/..');
        if ($publicHtml && is_dir($publicHtml)) {
          return $publicHtml;
        }
        return $projectDir;
      }
      return dirname($apiDir);
    }

    return ventas_cheques_dirname_n(__DIR__, 5);
  }
}

if (!function_exists('ventas_cheques_get_balto_private_dir')) {
  function ventas_cheques_get_balto_private_dir(): string
  {
    $publicHtml = ventas_cheques_get_public_html_dir();
    $homeDir = realpath($publicHtml . '/..');

    if ($homeDir && is_dir($homeDir . '/balto_private')) {
      $cand = realpath($homeDir . '/balto_private');
      if ($cand && is_dir($cand)) {
        return $cand;
      }
    }

    $apiDir = realpath(ventas_cheques_dirname_n(__DIR__, 3));
    if ($apiDir) {
      $projectDir = realpath($apiDir . '/..');
      if ($projectDir) {
        $cand1 = realpath($projectDir . '/../balto_private');
        if ($cand1 && is_dir($cand1)) {
          return $cand1;
        }

        $cand2 = realpath($projectDir . '/../../balto_private');
        if ($cand2 && is_dir($cand2)) {
          return $cand2;
        }
      }
    }

    throw new RuntimeException('No se encontró la carpeta balto_private.');
  }
}

if (!function_exists('ventas_cheques_get_private_uploads_dir')) {
  function ventas_cheques_get_private_uploads_dir(): string
  {
    $baltoPrivate = ventas_cheques_get_balto_private_dir();
    $uploads = $baltoPrivate . '/uploads';

    if (!is_dir($uploads)) {
      throw new RuntimeException('No existe la carpeta balto_private/uploads.');
    }

    if (!is_writable($uploads)) {
      throw new RuntimeException('La carpeta balto_private/uploads no tiene permisos de escritura.');
    }

    return $uploads;
  }
}

if (!function_exists('ventas_cheques_safe_mkdir')) {
  function ventas_cheques_safe_mkdir(string $path): void
  {
    if (is_dir($path)) {
      if (!is_writable($path)) {
        throw new RuntimeException('La carpeta existe pero no tiene permisos de escritura: ' . $path);
      }
      return;
    }

    if (!@mkdir($path, 0775, true) && !is_dir($path)) {
      throw new RuntimeException('No se pudo crear la carpeta: ' . $path);
    }

    if (!is_writable($path)) {
      throw new RuntimeException('La carpeta fue creada pero no tiene permisos de escritura: ' . $path);
    }
  }
}

if (!function_exists('ventas_cheques_normalize_rel_from_private_uploads')) {
  function ventas_cheques_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
  {
    $abs = str_replace('\\', '/', $abs);
    $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

    if (strpos($abs, $uploadsBase . '/') === 0) {
      return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
    }

    return ltrim($abs, '/');
  }
}

if (!function_exists('ventas_cheques_api_php_abs_url')) {
  function ventas_cheques_api_php_abs_url(): string
  {
    $scheme = ventas_cheques_is_https_request() ? 'https' : 'http';
    $host   = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';
    $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '';

    $posRoutes = strpos($script, '/api/routes/api.php');
    if ($posRoutes !== false) {
      $prefix = substr($script, 0, $posRoutes);
      return $scheme . '://' . $host . $prefix . '/api/routes/api.php';
    }

    $posApi = strpos($script, '/api.php');
    if ($posApi !== false) {
      $prefix = substr($script, 0, $posApi);
      return $scheme . '://' . $host . $prefix . '/api.php';
    }

    return $scheme . '://' . $host . '/api/routes/api.php';
  }
}

if (!function_exists('ventas_cheques_build_download_url')) {
  function ventas_cheques_build_download_url(int $idComprobante): string
  {
    return ventas_cheques_api_php_abs_url()
      . '?action=ventas_comprobantes_descargar&id_comprobante='
      . (int)$idComprobante;
  }
}

if (!function_exists('ventas_cheques_resolve_tenant_id_or_fail')) {
  function ventas_cheques_resolve_tenant_id_or_fail(): int
  {
    $ses = $GLOBALS['SESSION_MASTER'] ?? null;
    if (is_array($ses)) {
      $idT = isset($ses['idTenant']) ? (int)$ses['idTenant'] : 0;
      if ($idT > 0) {
        return $idT;
      }
    }

    $srv = '';
    if (isset($_SERVER['X_IDTENANT'])) {
      $srv = (string)$_SERVER['X_IDTENANT'];
    } elseif (isset($_SERVER['HTTP_X_IDTENANT'])) {
      $srv = (string)$_SERVER['HTTP_X_IDTENANT'];
    } elseif (isset($_SERVER['HTTP_X_ID_TENANT'])) {
      $srv = (string)$_SERVER['HTTP_X_ID_TENANT'];
    }

    $srv = trim($srv);
    if ($srv !== '' && ctype_digit($srv) && (int)$srv > 0) {
      return (int)$srv;
    }

    throw new RuntimeException(
      'Tenant no resuelto. Llamá a este módulo siempre a través de api/routes/api.php con sesión válida.'
    );
  }
}

/*
|--------------------------------------------------------------------------
| Subida de archivo adjunto al cheque
|--------------------------------------------------------------------------
*/
if (!function_exists('ventas_cheques_subir_archivo')) {
  function ventas_cheques_subir_archivo(PDO $pdo, int $idMovimiento, string $tipoCheque = 'cheque'): ?array
  {
    $fileKey = null;
    foreach (['archivo', 'file', 'adjunto'] as $k) {
      if (isset($_FILES[$k]) && ($_FILES[$k]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $fileKey = $k;
        break;
      }
    }

    if ($fileKey === null) {
      return null;
    }

    $tenantId  = ventas_cheques_resolve_tenant_id_or_fail();
    $file      = $_FILES[$fileKey];
    $tmpPath   = (string)($file['tmp_name'] ?? '');
    $origName  = basename((string)($file['name'] ?? 'adjunto'));
    $size      = (int)($file['size'] ?? 0);

    if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
      throw new RuntimeException('El archivo recibido no es válido.');
    }

    $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
    $realMime = $finfo ? (string)finfo_file($finfo, $tmpPath) : 'application/octet-stream';
    if ($finfo) {
      finfo_close($finfo);
    }

    $ext = strtolower((string)pathinfo($origName, PATHINFO_EXTENSION));
    $ext = preg_replace('/[^a-z0-9]+/', '', $ext);

    $allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff'];
    if (!in_array($ext, $allowedExts, true)) {
      throw new RuntimeException("Tipo de archivo no permitido: .$ext");
    }

    $allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/bmp',
      'image/tiff',
      'image/x-tiff',
      'application/octet-stream',
    ];

    if (!in_array($realMime, $allowedMimes, true)) {
      throw new RuntimeException('El MIME del archivo no es válido: ' . $realMime);
    }

    if ($size <= 0) {
      throw new RuntimeException('El archivo está vacío.');
    }

    if ($size > 20 * 1024 * 1024) {
      throw new RuntimeException('El archivo supera el tamaño máximo permitido (20 MB).');
    }

    $sha256 = hash_file('sha256', $tmpPath);
    if (!$sha256) {
      throw new RuntimeException('No se pudo calcular el hash del archivo.');
    }

    $uploadsBase = ventas_cheques_get_private_uploads_dir();

    $uploadDir = $uploadsBase
      . '/tenants/t_' . (int)$tenantId
      . '/comprobantes/' . date('Y')
      . '/' . date('m')
      . '/cheques';

    ventas_cheques_safe_mkdir($uploadDir);

    $prefix = ventas_cheques_normalize_tipo($tipoCheque) === 'echeq' ? 'echeq' : 'cheque';
    $newFilename = $prefix . '__mov_' . (int)$idMovimiento . '__' . $sha256 . '.' . $ext;
    $destPath    = $uploadDir . '/' . $newFilename;

    $moved = false;
    if (is_uploaded_file($tmpPath) && @move_uploaded_file($tmpPath, $destPath)) {
      $moved = true;
    } elseif (@rename($tmpPath, $destPath)) {
      $moved = true;
    } elseif (@copy($tmpPath, $destPath)) {
      $moved = true;
      @unlink($tmpPath);
    }

    if (!$moved || !is_file($destPath) || (int)filesize($destPath) <= 0) {
      throw new RuntimeException('No se pudo guardar el archivo subido.');
    }

    $archivoPathRel = ventas_cheques_normalize_rel_from_private_uploads($destPath, $uploadsBase);
    $tipoComprobante = ventas_cheques_comprobante_tipo($tipoCheque);

    $st = $pdo->prepare("
      INSERT INTO comprobantes_archivos (
        tipo,
        emitido_en_arca,
        archivo_url,
        archivo_path,
        archivo_mime,
        archivo_size,
        sha256,
        id_movimiento
      ) VALUES (
        :tipo,
        0,
        '',
        :archivo_path,
        :archivo_mime,
        :archivo_size,
        :sha256,
        :id_movimiento
      )
    ");

    $st->execute([
      ':tipo'          => $tipoComprobante,
      ':archivo_path'  => $archivoPathRel,
      ':archivo_mime'  => $realMime,
      ':archivo_size'  => $size,
      ':sha256'        => $sha256,
      ':id_movimiento' => $idMovimiento,
    ]);

    $idComprobante = (int)$pdo->lastInsertId();
    $archivoUrl = ventas_cheques_build_download_url($idComprobante);

    $stUpd = $pdo->prepare("
      UPDATE comprobantes_archivos
      SET archivo_url = :archivo_url
      WHERE id_comprobante = :id_comprobante
      LIMIT 1
    ");
    $stUpd->execute([
      ':archivo_url'    => $archivoUrl,
      ':id_comprobante' => $idComprobante,
    ]);

    return [
      'id_comprobante' => $idComprobante,
      'archivo_path'   => $archivoPathRel,
      'archivo_url'    => $archivoUrl,
    ];
  }
}

if (!function_exists('ventas_cheques_absolute_path_from_relative')) {
  function ventas_cheques_absolute_path_from_relative(string $archivoPath): string
  {
    $archivoPath = trim(str_replace('\\', '/', $archivoPath));
    if ($archivoPath === '') {
      return '';
    }

    if ($archivoPath[0] === '/' || preg_match('/^[A-Za-z]:\//', $archivoPath)) {
      return $archivoPath;
    }

    $uploadsBase = ventas_cheques_get_private_uploads_dir();

    if (strpos($archivoPath, 'uploads/') === 0) {
      return rtrim($uploadsBase, '/') . '/' . ltrim(substr($archivoPath, strlen('uploads/')), '/');
    }

    return rtrim($uploadsBase, '/') . '/' . ltrim($archivoPath, '/');
  }
}

if (!function_exists('ventas_cheques_cleanup_comprobante')) {
  function ventas_cheques_cleanup_comprobante(PDO $pdo, ?int $idComprobante, ?string $archivoPath = null): void
  {
    if ($idComprobante !== null && $idComprobante > 0) {
      if (($archivoPath === null || $archivoPath === '')) {
        $stSel = $pdo->prepare("
          SELECT archivo_path
          FROM comprobantes_archivos
          WHERE id_comprobante = :id_comprobante
          LIMIT 1
        ");
        $stSel->execute([':id_comprobante' => $idComprobante]);
        $row = $stSel->fetch(PDO::FETCH_ASSOC);
        if ($row && !empty($row['archivo_path'])) {
          $archivoPath = (string)$row['archivo_path'];
        }
      }

      $st = $pdo->prepare("DELETE FROM comprobantes_archivos WHERE id_comprobante = :id_comprobante");
      $st->execute([':id_comprobante' => $idComprobante]);
    }

    if ($archivoPath) {
      try {
        $abs = ventas_cheques_absolute_path_from_relative($archivoPath);
        if ($abs !== '' && is_file($abs)) {
          @unlink($abs);
        }
      } catch (Throwable $e) {
      }
    }
  }
}

/*
|--------------------------------------------------------------------------
| Actions
|--------------------------------------------------------------------------
*/

if (!function_exists('ventas_cheques_guardar')) {
  function ventas_cheques_guardar(PDO $pdo): void
  {
    $archivoSubido = null;

    try {
      $in   = ventas_cheques_request_data();
      $data = ventas_cheques_validate_payload($pdo, $in, false);

      $stDup = $pdo->prepare("
        SELECT id_cheque
        FROM movimientos_cheques
        WHERE numero_cheque = :numero_cheque
          AND id_movimiento = :id_movimiento
          AND activo = 1
        LIMIT 1
      ");
      $stDup->execute([
        ':numero_cheque' => $data['numero_cheque'],
        ':id_movimiento' => $data['id_movimiento'],
      ]);

      if ($stDup->fetch(PDO::FETCH_ASSOC)) {
        throw new RuntimeException('Ya existe un cheque activo con ese número para el mismo movimiento.');
      }

      $pdo->beginTransaction();

      $idComprobante = $data['id_comprobante'];
      if ($idComprobante === null) {
        $archivoSubido = ventas_cheques_subir_archivo($pdo, $data['id_movimiento'], $data['tipo']);
        if ($archivoSubido !== null) {
          $idComprobante = (int)$archivoSubido['id_comprobante'];
        }
      }

      $sql = "
        INSERT INTO movimientos_cheques (
          tipo,
          id_movimiento,
          id_comprobante,
          fecha_emision,
          emisor,
          numero_cheque,
          importe,
          fecha_pago,
          activo
        ) VALUES (
          :tipo,
          :id_movimiento,
          :id_comprobante,
          :fecha_emision,
          :emisor,
          :numero_cheque,
          :importe,
          :fecha_pago,
          1
        )
      ";

      $st = $pdo->prepare($sql);
      $st->bindValue(':tipo', $data['tipo'], PDO::PARAM_STR);
      $st->bindValue(':id_movimiento', $data['id_movimiento'], PDO::PARAM_INT);

      if ($idComprobante === null) {
        $st->bindValue(':id_comprobante', null, PDO::PARAM_NULL);
      } else {
        $st->bindValue(':id_comprobante', $idComprobante, PDO::PARAM_INT);
      }

      $st->bindValue(':fecha_emision', $data['fecha_emision'], PDO::PARAM_STR);
      $st->bindValue(':emisor', $data['emisor'], PDO::PARAM_STR);
      $st->bindValue(':numero_cheque', $data['numero_cheque'], PDO::PARAM_STR);
      $st->bindValue(':importe', $data['importe']);
      $st->bindValue(':fecha_pago', $data['fecha_pago'], PDO::PARAM_STR);
      $st->execute();

      $idCheque = (int)$pdo->lastInsertId();
      $pdo->commit();

      $cheque = ventas_cheques_fetch_one($pdo, $idCheque);

      ventas_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque guardado correctamente.',
        'cheque'  => $cheque,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      if ($archivoSubido !== null) {
        ventas_cheques_cleanup_comprobante(
          $pdo,
          (int)($archivoSubido['id_comprobante'] ?? 0),
          (string)($archivoSubido['archivo_path'] ?? '')
        );
      }

      ventas_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al guardar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

if (!function_exists('ventas_cheques_obtener')) {
  function ventas_cheques_obtener(PDO $pdo): void
  {
    try {
      $idCheque = isset($_GET['id_cheque']) ? (int)$_GET['id_cheque'] : 0;

      if ($idCheque <= 0) {
        throw new RuntimeException('Falta id_cheque.');
      }

      $row = ventas_cheques_fetch_one($pdo, $idCheque);
      if (!$row) {
        throw new RuntimeException('Cheque no encontrado.');
      }

      ventas_cheques_output_json([
        'exito'  => true,
        'cheque' => $row,
      ]);
    } catch (Throwable $e) {
      ventas_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al obtener cheque: ' . $e->getMessage(),
      ], 404);
    }
  }
}

if (!function_exists('ventas_cheques_listar')) {
  function ventas_cheques_listar(PDO $pdo): void
  {
    try {
      $idMovimiento  = isset($_GET['id_movimiento']) ? (int)$_GET['id_movimiento'] : 0;
      $idComprobante = isset($_GET['id_comprobante']) ? (int)$_GET['id_comprobante'] : 0;
      $soloActivos   = isset($_GET['activo']) ? (int)$_GET['activo'] : 1;

      $where  = [];
      $params = [];

      if ($soloActivos === 1) {
        $where[] = 'c.activo = 1';
      }

      if ($idMovimiento > 0) {
        $where[]                  = 'c.id_movimiento = :id_movimiento';
        $params[':id_movimiento'] = $idMovimiento;
      }

      if ($idComprobante > 0) {
        $where[]                   = 'c.id_comprobante = :id_comprobante';
        $params[':id_comprobante'] = $idComprobante;
      }

      $sqlWhere = '';
      if (!empty($where)) {
        $sqlWhere = 'WHERE ' . implode(' AND ', $where);
      }

      $st = $pdo->prepare("
        SELECT
          c.id_cheque,
          c.tipo,
          c.id_movimiento,
          c.id_comprobante,
          c.fecha_emision,
          c.emisor,
          c.numero_cheque,
          c.importe,
          c.fecha_pago,
          c.activo,
          c.created_at,
          c.updated_at,

          m.fecha AS movimiento_fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          m.id_detalle,
          m.monto_total,
          m.id_medio_pago,

          ca.tipo AS comprobante_tipo,
          ca.emitido_en_arca,
          ca.archivo_url,
          ca.archivo_path,
          ca.archivo_mime,
          ca.archivo_size,
          ca.sha256
        FROM movimientos_cheques c
        INNER JOIN movimientos m
          ON m.id_movimiento = c.id_movimiento
        LEFT JOIN comprobantes_archivos ca
          ON ca.id_comprobante = c.id_comprobante
        {$sqlWhere}
        ORDER BY c.fecha_pago ASC, c.id_cheque ASC
      ");
      $st->execute($params);
      $rows = $st->fetchAll(PDO::FETCH_ASSOC);

      ventas_cheques_output_json([
        'exito'   => true,
        'cheques' => $rows,
      ]);
    } catch (Throwable $e) {
      ventas_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al listar cheques: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('ventas_cheques_actualizar')) {
  function ventas_cheques_actualizar(PDO $pdo): void
  {
    $archivoSubido = null;

    try {
      $in   = ventas_cheques_request_data();
      $data = ventas_cheques_validate_payload($pdo, $in, true);

      $stExist = $pdo->prepare("
        SELECT id_cheque, id_comprobante
        FROM movimientos_cheques
        WHERE id_cheque = :id_cheque
        LIMIT 1
      ");
      $stExist->execute([':id_cheque' => $data['id_cheque']]);

      $actual = $stExist->fetch(PDO::FETCH_ASSOC);
      if (!$actual) {
        throw new RuntimeException('Cheque no encontrado.');
      }

      $stDup = $pdo->prepare("
        SELECT id_cheque
        FROM movimientos_cheques
        WHERE numero_cheque = :numero_cheque
          AND id_movimiento = :id_movimiento
          AND activo = 1
          AND id_cheque <> :id_cheque
        LIMIT 1
      ");
      $stDup->execute([
        ':numero_cheque' => $data['numero_cheque'],
        ':id_movimiento' => $data['id_movimiento'],
        ':id_cheque'     => $data['id_cheque'],
      ]);

      if ($stDup->fetch(PDO::FETCH_ASSOC)) {
        throw new RuntimeException('Ya existe otro cheque activo con ese número para el mismo movimiento.');
      }

      $pdo->beginTransaction();

      $idComprobante = $data['id_comprobante'];

      if ($idComprobante === null) {
        $archivoSubido = ventas_cheques_subir_archivo($pdo, $data['id_movimiento'], $data['tipo']);
        if ($archivoSubido !== null) {
          $idComprobante = (int)$archivoSubido['id_comprobante'];
        } else {
          $idComprobante = isset($actual['id_comprobante']) && $actual['id_comprobante'] !== null
            ? (int)$actual['id_comprobante']
            : null;
        }
      }

      $sql = "
        UPDATE movimientos_cheques
        SET
          tipo           = :tipo,
          id_movimiento  = :id_movimiento,
          id_comprobante = :id_comprobante,
          fecha_emision  = :fecha_emision,
          emisor         = :emisor,
          numero_cheque  = :numero_cheque,
          importe        = :importe,
          fecha_pago     = :fecha_pago
        WHERE id_cheque = :id_cheque
        LIMIT 1
      ";

      $st = $pdo->prepare($sql);
      $st->bindValue(':tipo', $data['tipo'], PDO::PARAM_STR);
      $st->bindValue(':id_movimiento', $data['id_movimiento'], PDO::PARAM_INT);

      if ($idComprobante === null) {
        $st->bindValue(':id_comprobante', null, PDO::PARAM_NULL);
      } else {
        $st->bindValue(':id_comprobante', $idComprobante, PDO::PARAM_INT);
      }

      $st->bindValue(':fecha_emision', $data['fecha_emision'], PDO::PARAM_STR);
      $st->bindValue(':emisor', $data['emisor'], PDO::PARAM_STR);
      $st->bindValue(':numero_cheque', $data['numero_cheque'], PDO::PARAM_STR);
      $st->bindValue(':importe', $data['importe']);
      $st->bindValue(':fecha_pago', $data['fecha_pago'], PDO::PARAM_STR);
      $st->bindValue(':id_cheque', $data['id_cheque'], PDO::PARAM_INT);
      $st->execute();

      $pdo->commit();

      $cheque = ventas_cheques_fetch_one($pdo, $data['id_cheque']);

      ventas_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque actualizado correctamente.',
        'cheque'  => $cheque,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      if ($archivoSubido !== null) {
        ventas_cheques_cleanup_comprobante(
          $pdo,
          (int)($archivoSubido['id_comprobante'] ?? 0),
          (string)($archivoSubido['archivo_path'] ?? '')
        );
      }

      ventas_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al actualizar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

if (!function_exists('ventas_cheques_eliminar')) {
  function ventas_cheques_eliminar(PDO $pdo): void
  {
    try {
      $in = ventas_cheques_request_data();

      $idCheque = isset($in['id_cheque']) ? (int)$in['id_cheque'] : 0;
      if ($idCheque <= 0) {
        $idCheque = isset($_GET['id_cheque']) ? (int)$_GET['id_cheque'] : 0;
      }

      if ($idCheque <= 0) {
        throw new RuntimeException('Falta id_cheque para eliminar.');
      }

      $st = $pdo->prepare("
        UPDATE movimientos_cheques
        SET activo = 0
        WHERE id_cheque = :id_cheque
        LIMIT 1
      ");
      $st->execute([':id_cheque' => $idCheque]);

      if ($st->rowCount() <= 0) {
        throw new RuntimeException('Cheque no encontrado.');
      }

      ventas_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque eliminado correctamente.',
      ]);
    } catch (Throwable $e) {
      ventas_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al eliminar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}