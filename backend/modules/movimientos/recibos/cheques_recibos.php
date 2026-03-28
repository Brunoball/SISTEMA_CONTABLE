<?php
declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Helpers JSON
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_output_json')) {
  function recibos_cheques_output_json(array $payload, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('recibos_cheques_request_data')) {
  function recibos_cheques_request_data(): array
  {
    $ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
    $ct = strtolower(trim((string)$ct));

    if (strpos($ct, 'application/json') !== false) {
      $raw = file_get_contents('php://input');
      $json = json_decode((string)$raw, true);
      return is_array($json) ? $json : [];
    }

    return is_array($_POST ?? null) ? $_POST : [];
  }
}

if (!function_exists('recibos_cheques_is_valid_date')) {
  function recibos_cheques_is_valid_date(string $value): bool
  {
    return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', trim($value));
  }
}

if (!function_exists('recibos_cheques_n_float')) {
  function recibos_cheques_n_float($v): ?float
  {
    if ($v === null || $v === '') return null;

    if (is_string($v)) {
      $s = trim($v);
      if ($s === '') return null;

      if (preg_match('/^\d{1,3}(\.\d{3})*(,\d+)?$/', $s)) {
        $s = str_replace('.', '', $s);
        $s = str_replace(',', '.', $s);
      } elseif (substr_count($s, ',') === 1 && substr_count($s, '.') === 0) {
        $s = str_replace(',', '.', $s);
      }

      if (!is_numeric($s)) return null;
      return (float)$s;
    }

    if (!is_numeric($v)) return null;
    return (float)$v;
  }
}

/*
|--------------------------------------------------------------------------
| URL descarga comprobante
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_api_php_abs_url')) {
  function recibos_cheques_api_php_abs_url(): string
  {
    $https  = $_SERVER['HTTPS'] ?? '';
    $scheme = (!empty($https) && $https !== 'off') ? 'https' : 'http';

    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
      $scheme = strtolower(trim(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_PROTO'])[0]));
    }

    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
    $host = trim(explode(',', (string)$host)[0]);

    $script = $_SERVER['SCRIPT_NAME'] ?? '';
    $script = str_replace('\\', '/', (string)$script);

    if (preg_match('~/api(?:/routes)?/api\.php$~i', $script)) {
      $prefix = preg_replace('~/api(?:/routes)?/api\.php$~i', '', $script);
      return $scheme . '://' . $host . $prefix . '/api.php';
    }

    return $scheme . '://' . $host . '/api/routes/api.php';
  }
}

if (!function_exists('recibos_cheques_build_download_url')) {
  function recibos_cheques_build_download_url(int $idComprobante): string
  {
    return recibos_cheques_api_php_abs_url()
      . '?action=recibos_comprobantes_descargar&id_comprobante='
      . (int)$idComprobante;
  }
}

/*
|--------------------------------------------------------------------------
| Tenant
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_resolve_tenant_id_or_fail')) {
  function recibos_cheques_resolve_tenant_id_or_fail(): int
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
| Paths privados / storage
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_normalize_path')) {
  function recibos_cheques_normalize_path(string $path): string
  {
    $path = str_replace('\\', '/', trim($path));
    return rtrim($path, '/');
  }
}

if (!function_exists('recibos_cheques_guess_private_root')) {
  function recibos_cheques_guess_private_root(): string
  {
    $candidates = [];

    $envKeys = [
      'BALTO_PRIVATE_DIR',
      'BALTO_PRIVATE_PATH',
      'PRIVATE_STORAGE_DIR',
      'PRIVATE_STORAGE_PATH',
    ];

    foreach ($envKeys as $key) {
      $v = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);
      if (is_string($v) && trim($v) !== '') {
        $candidates[] = recibos_cheques_normalize_path($v);
      }
    }

    $candidates[] = recibos_cheques_normalize_path(dirname(__DIR__, 6) . '/balto_private');
    $candidates[] = recibos_cheques_normalize_path(dirname(__DIR__, 5) . '/balto_private');
    $candidates[] = recibos_cheques_normalize_path(dirname(__DIR__, 4) . '/balto_private');

    foreach ($candidates as $candidate) {
      if ($candidate !== '' && is_dir($candidate)) {
        return $candidate;
      }
    }

    return $candidates[0] ?? recibos_cheques_normalize_path(dirname(__DIR__, 6) . '/balto_private');
  }
}

if (!function_exists('recibos_cheques_build_storage_paths')) {
  function recibos_cheques_build_storage_paths(int $tenantId, string $tipoCheque, string $finalName): array
  {
    $privateRoot = recibos_cheques_guess_private_root();

    $year  = date('Y');
    $month = date('m');

    $folder = 'cheques';

    $relativeDir = 'uploads/tenants/t_' . $tenantId . '/comprobantes/' . $year . '/' . $month . '/' . $folder;
    $absoluteDir = recibos_cheques_normalize_path($privateRoot . '/' . $relativeDir);

    return [
      'private_root'  => $privateRoot,
      'relative_dir'  => $relativeDir,
      'absolute_dir'  => $absoluteDir,
      'relative_path' => $relativeDir . '/' . $finalName,
      'absolute_path' => $absoluteDir . '/' . $finalName,
    ];
  }
}

/*
|--------------------------------------------------------------------------
| Schema helpers
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_table_columns')) {
  function recibos_cheques_table_columns(PDO $pdo, string $table): array
  {
    static $cache = [];

    $table = trim($table);
    if ($table === '') return [];

    if (isset($cache[$table])) {
      return $cache[$table];
    }

    $cols = [];

    try {
      $stmt = $pdo->query("SHOW COLUMNS FROM `{$table}`");
      $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
      foreach ($rows as $row) {
        $field = (string)($row['Field'] ?? '');
        if ($field !== '') $cols[$field] = true;
      }
    } catch (Throwable $e) {
      $cols = [];
    }

    $cache[$table] = $cols;
    return $cols;
  }
}

if (!function_exists('recibos_cheques_table_has_column')) {
  function recibos_cheques_table_has_column(PDO $pdo, string $table, string $column): bool
  {
    $cols = recibos_cheques_table_columns($pdo, $table);
    return isset($cols[$column]);
  }
}

/*
|--------------------------------------------------------------------------
| Upload archivo del cheque
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_subir_archivo')) {
  function recibos_cheques_subir_archivo(PDO $pdo, int $idMovimiento, string $tipoCheque = 'cheque'): ?array
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

    $tenantId = recibos_cheques_resolve_tenant_id_or_fail();

    $file     = $_FILES[$fileKey];
    $tmpPath  = (string)($file['tmp_name'] ?? '');
    $origName = basename((string)($file['name'] ?? 'adjunto'));
    $size     = (int)($file['size'] ?? 0);

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
      throw new RuntimeException('Extensión de archivo no permitida.');
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9_\-\.]+/', '_', pathinfo($origName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '._-');
    if ($safeBase === '') {
      $safeBase = 'archivo';
    }

    $finalName = date('Ymd_His')
      . '_mov_' . $idMovimiento
      . '_' . substr(sha1(uniqid((string)$origName, true)), 0, 12)
      . '_' . $safeBase
      . '.' . $ext;

    $paths = recibos_cheques_build_storage_paths($tenantId, $tipoCheque, $finalName);

    if (
      !is_dir($paths['absolute_dir']) &&
      !mkdir($paths['absolute_dir'], 0775, true) &&
      !is_dir($paths['absolute_dir'])
    ) {
      throw new RuntimeException('No se pudo crear la carpeta de destino.');
    }

    if (!move_uploaded_file($tmpPath, $paths['absolute_path'])) {
      throw new RuntimeException('No se pudo mover el archivo subido.');
    }

    if (!is_file($paths['absolute_path']) || (int)filesize($paths['absolute_path']) <= 0) {
      throw new RuntimeException('El archivo subido no se guardó correctamente.');
    }

    $sha256 = hash_file('sha256', $paths['absolute_path']) ?: '';
    if ($sha256 === '') {
      throw new RuntimeException('No se pudo calcular el hash del archivo.');
    }

    $archivoPathRel = str_replace('\\', '/', (string)$paths['relative_path']);
    $tipoDb = (strtolower(trim($tipoCheque)) === 'echeq') ? 'ECHEQ' : 'CHEQUE';

    $columns = [
      'id_movimiento',
      'tipo',
      'emitido_en_arca',
      'archivo_url',
      'archivo_path',
      'archivo_mime',
      'archivo_size',
      'sha256',
    ];

    $values = [
      ':id_movimiento',
      ':tipo',
      '0',
      ':archivo_url',
      ':archivo_path',
      ':archivo_mime',
      ':archivo_size',
      ':sha256',
    ];

    $params = [
      ':id_movimiento' => $idMovimiento,
      ':tipo'          => $tipoDb,
      ':archivo_url'   => '',
      ':archivo_path'  => $archivoPathRel,
      ':archivo_mime'  => $realMime,
      ':archivo_size'  => $size,
      ':sha256'        => $sha256,
    ];

    if (function_exists('recibos_cheques_table_has_column') && recibos_cheques_table_has_column($pdo, 'comprobantes_archivos', 'created_at')) {
      $columns[] = 'created_at';
      $values[]  = 'NOW()';
    }

    if (function_exists('recibos_cheques_table_has_column') && recibos_cheques_table_has_column($pdo, 'comprobantes_archivos', 'updated_at')) {
      $columns[] = 'updated_at';
      $values[]  = 'NOW()';
    }

    $sql = "
      INSERT INTO comprobantes_archivos (" . implode(', ', $columns) . ")
      VALUES (" . implode(', ', $values) . ")
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);

    $idComprobante = (int)$pdo->lastInsertId();
    if ($idComprobante <= 0) {
      @unlink($paths['absolute_path']);
      throw new RuntimeException('No se pudo obtener el id_comprobante.');
    }

    $archivoUrlAbs = recibos_cheques_build_download_url($idComprobante);

    $stUpd = $pdo->prepare("
      UPDATE comprobantes_archivos
      SET archivo_url = :archivo_url
      WHERE id_comprobante = :id_comprobante
      LIMIT 1
    ");
    $stUpd->execute([
      ':archivo_url'    => $archivoUrlAbs,
      ':id_comprobante' => $idComprobante,
    ]);

    return [
      'id_comprobante' => $idComprobante,
      'id_movimiento'  => $idMovimiento,
      'archivo_url'    => $archivoUrlAbs,
      'archivo_path'   => $archivoPathRel,
      'archivo_mime'   => $realMime,
      'archivo_size'   => $size,
      'sha256'         => $sha256,
    ];
  }
}

if (!function_exists('recibos_cheques_cleanup_comprobante')) {
  function recibos_cheques_cleanup_comprobante(PDO $pdo, int $idComprobante, string $archivoPath = ''): void
  {
    try {
      if ($idComprobante > 0) {
        $st = $pdo->prepare("DELETE FROM comprobantes_archivos WHERE id_comprobante = :id LIMIT 1");
        $st->execute([':id' => $idComprobante]);
      }
    } catch (Throwable $e) {
    }

    try {
      if ($archivoPath !== '' && is_file($archivoPath)) {
        @unlink($archivoPath);
      }
    } catch (Throwable $e) {
    }
  }
}

/*
|--------------------------------------------------------------------------
| Validaciones
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_validate_payload')) {
  function recibos_cheques_validate_payload(PDO $pdo, array $in, bool $isUpdate = false): array
  {
    $idCheque = isset($in['id_cheque']) ? (int)$in['id_cheque'] : 0;
    $idMovimiento = isset($in['id_movimiento']) ? (int)$in['id_movimiento'] : 0;
    $tipo = strtolower(trim((string)($in['tipo'] ?? $in['tipo_cheque'] ?? 'cheque')));
    $fechaEmision = trim((string)($in['fecha_emision'] ?? ''));
    $emisor = trim((string)($in['emisor'] ?? ''));
    $numeroCheque = trim((string)($in['numero_cheque'] ?? ''));
    $importe = recibos_cheques_n_float($in['importe'] ?? null);
    $fechaPago = trim((string)($in['fecha_pago'] ?? ''));
    $idComprobante = isset($in['id_comprobante']) && $in['id_comprobante'] !== ''
      ? (int)$in['id_comprobante']
      : null;

    if ($isUpdate && $idCheque <= 0) {
      throw new RuntimeException('Falta id_cheque.');
    }

    if ($idMovimiento <= 0) {
      throw new RuntimeException('Falta id_movimiento.');
    }

    if (!in_array($tipo, ['cheque', 'echeq'], true)) {
      $tipo = 'cheque';
    }

    if ($fechaEmision === '' || !recibos_cheques_is_valid_date($fechaEmision)) {
      throw new RuntimeException('La fecha de emisión es obligatoria y debe tener formato YYYY-MM-DD.');
    }

    if ($emisor === '') {
      throw new RuntimeException('El emisor es obligatorio.');
    }

    if ($numeroCheque === '') {
      throw new RuntimeException('El número de cheque es obligatorio.');
    }

    if ($importe === null || $importe <= 0) {
      throw new RuntimeException('El importe debe ser mayor a 0.');
    }

    if ($fechaPago === '' || !recibos_cheques_is_valid_date($fechaPago)) {
      throw new RuntimeException('La fecha de pago es obligatoria y debe tener formato YYYY-MM-DD.');
    }

    $stMov = $pdo->prepare("
      SELECT id_movimiento, id_tipo_operacion, id_tipo_venta
      FROM movimientos
      WHERE id_movimiento = :id
      LIMIT 1
    ");
    $stMov->execute([':id' => $idMovimiento]);
    $mov = $stMov->fetch(PDO::FETCH_ASSOC);

    if (!$mov) {
      throw new RuntimeException('El movimiento indicado no existe.');
    }

    if ((int)($mov['id_tipo_operacion'] ?? 0) !== 1 || (int)($mov['id_tipo_venta'] ?? 0) !== 2) {
      throw new RuntimeException('El movimiento indicado no corresponde a un recibo válido.');
    }

    if ($idComprobante !== null && $idComprobante > 0) {
      $stComp = $pdo->prepare("
        SELECT id_comprobante
        FROM comprobantes_archivos
        WHERE id_comprobante = :id
        LIMIT 1
      ");
      $stComp->execute([':id' => $idComprobante]);
      if (!$stComp->fetch(PDO::FETCH_ASSOC)) {
        throw new RuntimeException('El id_comprobante indicado no existe.');
      }
    }

    return [
      'id_cheque'      => $idCheque,
      'id_movimiento'  => $idMovimiento,
      'tipo'           => $tipo,
      'id_comprobante' => $idComprobante,
      'fecha_emision'  => $fechaEmision,
      'emisor'         => $emisor,
      'numero_cheque'  => $numeroCheque,
      'importe'        => $importe,
      'fecha_pago'     => $fechaPago,
    ];
  }
}

/*
|--------------------------------------------------------------------------
| Fetch
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_fetch_one')) {
  function recibos_cheques_fetch_one(PDO $pdo, int $idCheque): ?array
  {
    $hasChequeUpdatedAt = recibos_cheques_table_has_column($pdo, 'movimientos_cheques', 'updated_at');

    $selectUpdatedAt = $hasChequeUpdatedAt
      ? "c.updated_at"
      : "NULL AS updated_at";

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
        {$selectUpdatedAt},

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
      WHERE c.id_cheque = :id_cheque
      LIMIT 1
    ");
    $st->execute([':id_cheque' => $idCheque]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) return null;

    $idComp = isset($row['id_comprobante']) ? (int)$row['id_comprobante'] : 0;
    $row['archivo_descarga_url'] = $idComp > 0 ? recibos_cheques_build_download_url($idComp) : '';

    return $row;
  }
}

/*
|--------------------------------------------------------------------------
| Guardar
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_guardar')) {
  function recibos_cheques_guardar(PDO $pdo): void
  {
    $archivoSubido = null;

    try {
      $in = recibos_cheques_request_data();
      $data = recibos_cheques_validate_payload($pdo, $in, false);

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
        $archivoSubido = recibos_cheques_subir_archivo($pdo, $data['id_movimiento'], $data['tipo']);
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

      $cheque = recibos_cheques_fetch_one($pdo, $idCheque);

      recibos_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque guardado correctamente.',
        'cheque'  => $cheque,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      if ($archivoSubido !== null) {
        recibos_cheques_cleanup_comprobante(
          $pdo,
          (int)($archivoSubido['id_comprobante'] ?? 0),
          (string)($archivoSubido['archivo_path'] ?? '')
        );
      }

      recibos_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al guardar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

/*
|--------------------------------------------------------------------------
| Obtener
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_obtener')) {
  function recibos_cheques_obtener(PDO $pdo): void
  {
    try {
      $idCheque = isset($_GET['id_cheque']) ? (int)$_GET['id_cheque'] : 0;

      if ($idCheque <= 0) {
        throw new RuntimeException('Falta id_cheque.');
      }

      $row = recibos_cheques_fetch_one($pdo, $idCheque);
      if (!$row) {
        throw new RuntimeException('Cheque no encontrado.');
      }

      recibos_cheques_output_json([
        'exito'  => true,
        'cheque' => $row,
      ]);
    } catch (Throwable $e) {
      recibos_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al obtener cheque: ' . $e->getMessage(),
      ], 404);
    }
  }
}

/*
|--------------------------------------------------------------------------
| Listar
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_listar')) {
  function recibos_cheques_listar(PDO $pdo): void
  {
    try {
      $idMovimiento = isset($_GET['id_movimiento']) ? (int)$_GET['id_movimiento'] : 0;
      $idComprobante = isset($_GET['id_comprobante']) ? (int)$_GET['id_comprobante'] : 0;
      $soloActivos = isset($_GET['activo']) ? (int)$_GET['activo'] : 1;

      $where = [];
      $params = [];

      if ($soloActivos === 1) {
        $where[] = 'c.activo = 1';
      }

      if ($idMovimiento > 0) {
        $where[] = 'c.id_movimiento = :id_movimiento';
        $params[':id_movimiento'] = $idMovimiento;
      }

      if ($idComprobante > 0) {
        $where[] = 'c.id_comprobante = :id_comprobante';
        $params[':id_comprobante'] = $idComprobante;
      }

      $sqlWhere = !empty($where) ? 'WHERE ' . implode(' AND ', $where) : '';

      $hasChequeUpdatedAt = recibos_cheques_table_has_column($pdo, 'movimientos_cheques', 'updated_at');
      $selectUpdatedAt = $hasChequeUpdatedAt
        ? "c.updated_at"
        : "NULL AS updated_at";

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
          {$selectUpdatedAt},

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
        $sqlWhere
        ORDER BY c.id_cheque DESC
      ");

      foreach ($params as $k => $v) {
        $st->bindValue($k, $v, PDO::PARAM_INT);
      }

      $st->execute();
      $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

      foreach ($rows as &$row) {
        $idComp = isset($row['id_comprobante']) ? (int)$row['id_comprobante'] : 0;
        $row['archivo_descarga_url'] = $idComp > 0 ? recibos_cheques_build_download_url($idComp) : '';
      }
      unset($row);

      recibos_cheques_output_json([
        'exito'   => true,
        'cheques' => $rows,
      ]);
    } catch (Throwable $e) {
      recibos_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al listar cheques: ' . $e->getMessage(),
      ], 500);
    }
  }
}

/*
|--------------------------------------------------------------------------
| Actualizar
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_actualizar')) {
  function recibos_cheques_actualizar(PDO $pdo): void
  {
    $archivoSubido = null;

    try {
      $in = recibos_cheques_request_data();
      $data = recibos_cheques_validate_payload($pdo, $in, true);

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
        $archivoSubido = recibos_cheques_subir_archivo($pdo, $data['id_movimiento'], $data['tipo']);
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

      $cheque = recibos_cheques_fetch_one($pdo, $data['id_cheque']);

      recibos_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque actualizado correctamente.',
        'cheque'  => $cheque,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      if ($archivoSubido !== null) {
        recibos_cheques_cleanup_comprobante(
          $pdo,
          (int)($archivoSubido['id_comprobante'] ?? 0),
          (string)($archivoSubido['archivo_path'] ?? '')
        );
      }

      recibos_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al actualizar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

/*
|--------------------------------------------------------------------------
| Eliminar lógico
|--------------------------------------------------------------------------
*/
if (!function_exists('recibos_cheques_eliminar')) {
  function recibos_cheques_eliminar(PDO $pdo): void
  {
    try {
      $in = recibos_cheques_request_data();

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

      recibos_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque eliminado correctamente.',
      ]);
    } catch (Throwable $e) {
      recibos_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al eliminar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

/*
|--------------------------------------------------------------------------
| Router
|--------------------------------------------------------------------------
*/
if (!function_exists('route_recibos_cheques_action')) {
  function route_recibos_cheques_action(PDO $pdo, string $action): bool
  {
    $action = strtolower(trim((string)$action));

    switch ($action) {
      case 'recibos_cheques_guardar':
        recibos_cheques_guardar($pdo);
        return true;

      case 'recibos_cheques_obtener':
        recibos_cheques_obtener($pdo);
        return true;

      case 'recibos_cheques_listar':
        recibos_cheques_listar($pdo);
        return true;

      case 'recibos_cheques_actualizar':
        recibos_cheques_actualizar($pdo);
        return true;

      case 'recibos_cheques_eliminar':
        recibos_cheques_eliminar($pdo);
        return true;

      default:
        return false;
    }
  }
}