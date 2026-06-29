<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/secure_context.php';
require_once __DIR__ . '/../../utils/auditoria.php';
require_once __DIR__ . '/r2_comprobantes_helper.php';



/* =========================================================
   GLOBAL - helpers compartidos para cheques/eCheqs
   Este archivo es la única entrada global para crear, obtener,
   listar, actualizar, eliminar y consumir cheques/eCheqs.
========================================================= */

if (!function_exists('mov_global_cheques_ok')) {
  function mov_global_cheques_ok(array $payload = []): void
  {
    mov_global_cheques_output_json(array_merge(['exito' => true], $payload));
  }
}

if (!function_exists('mov_global_cheques_fail')) {
  function mov_global_cheques_fail(string $mensaje, int $status = 400, array $extra = []): void
  {
    mov_global_cheques_output_json(array_merge(['exito' => false, 'mensaje' => $mensaje], $extra), $status);
  }
}

if (!function_exists('mov_global_cheques_parse_id_list')) {
  function mov_global_cheques_parse_id_list($value): array
  {
    if (is_array($value)) {
      $raw = $value;
    } else {
      $raw = preg_split('/[,;|\s]+/', trim((string)$value));
    }

    $ids = [];
    foreach ($raw ?: [] as $v) {
      if (is_numeric($v) && (int)$v > 0) {
        $ids[] = (int)$v;
      }
    }
    return array_values(array_unique($ids));
  }
}

if (!function_exists('mov_global_cheques_buscar_duplicado_por_numero')) {
  function mov_global_cheques_buscar_duplicado_por_numero(PDO $pdo, string $numeroCheque, ?string $tipoCheque = null, ?int $excludeIdCheque = null): ?array
  {
    $numeroCheque = trim($numeroCheque);
    if ($numeroCheque === '') return null;

    $where = ["c.numero_cheque = :numero_cheque", "c.activo = 1"];
    $params = [':numero_cheque' => $numeroCheque];

    if ($tipoCheque !== null && trim($tipoCheque) !== '') {
      $where[] = "LOWER(COALESCE(c.tipo,'')) = LOWER(:tipo)";
      $params[':tipo'] = mov_global_cheques_normalize_tipo($tipoCheque);
    }

    if ($excludeIdCheque !== null && $excludeIdCheque > 0) {
      $where[] = "c.id_cheque <> :exclude_id";
      $params[':exclude_id'] = $excludeIdCheque;
    }

    $st = $pdo->prepare("\n      SELECT c.*, m.fecha AS movimiento_fecha, m.id_tipo_operacion\n      FROM movimientos_cheques c\n      LEFT JOIN movimientos m ON m.id_movimiento = c.id_movimiento\n      WHERE " . implode(' AND ', $where) . "\n      ORDER BY c.id_cheque DESC\n      LIMIT 1\n    ");
    $st->execute($params);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('mov_global_cheques_mensaje_duplicado_por_numero')) {
  function mov_global_cheques_mensaje_duplicado_por_numero(array $dup): string
  {
    $tipo = mov_global_cheques_normalize_tipo($dup['tipo'] ?? 'cheque') === 'echeq' ? 'eCheq' : 'cheque';
    $numero = trim((string)($dup['numero_cheque'] ?? ''));
    $id = (int)($dup['id_cheque'] ?? 0);
    $mov = (int)($dup['id_movimiento'] ?? 0);
    return "Ya existe un {$tipo} activo con el número {$numero}" . ($mov > 0 ? " en el movimiento #{$mov}" : '') . ($id > 0 ? " (ID {$id})." : '.');
  }
}

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

if (!function_exists('mov_global_cheques_output_json')) {
  function mov_global_cheques_output_json(array $payload, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('mov_global_cheques_json_input')) {
  function mov_global_cheques_json_input(): array
  {
    if (isset($GLOBALS['MVSEC_JSON_BODY']) && is_array($GLOBALS['MVSEC_JSON_BODY'])) {
      return $GLOBALS['MVSEC_JSON_BODY'];
    }

    $raw = file_get_contents('php://input');
    if (!$raw) {
      return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('mov_global_cheques_request_data')) {
  function mov_global_cheques_request_data(): array
  {
    if (!empty($_FILES)) {
      return is_array($_POST) ? $_POST : [];
    }

    $json = mov_global_cheques_json_input();
    if (!empty($json)) {
      return $json;
    }

    return is_array($_POST) ? $_POST : [];
  }
}

if (!function_exists('mov_global_cheques_safe_str')) {
  function mov_global_cheques_safe_str($v): string
  {
    return trim((string)($v ?? ''));
  }
}

if (!function_exists('mov_global_cheques_safe_int')) {
  function mov_global_cheques_safe_int($v): int
  {
    if ($v === null || $v === '') {
      return 0;
    }
    return (int)$v;
  }
}

if (!function_exists('mov_global_cheques_safe_nullable_int')) {
  function mov_global_cheques_safe_nullable_int($v): ?int
  {
    if ($v === null || $v === '') {
      return null;
    }
    $n = (int)$v;
    return $n > 0 ? $n : null;
  }
}

if (!function_exists('mov_global_cheques_safe_date')) {
  function mov_global_cheques_safe_date($v): ?string
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

if (!function_exists('mov_global_cheques_safe_amount')) {
  function mov_global_cheques_safe_amount($v): float
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

if (!function_exists('mov_global_cheques_normalize_tipo')) {
  function mov_global_cheques_normalize_tipo($v): string
  {
    $s = mb_strtolower(trim((string)$v), 'UTF-8');
    $s = str_replace(['-', '_', ' '], '', $s);

    return $s === 'echeq' ? 'echeq' : 'cheque';
  }
}

if (!function_exists('mov_global_cheques_comprobante_tipo')) {
  function mov_global_cheques_comprobante_tipo(string $tipoCheque): string
  {
    return mb_strtolower(trim($tipoCheque), 'UTF-8') === 'echeq'
      ? 'ECHEQ'
      : 'CHEQUE';
  }
}

if (!function_exists('mov_global_cheques_resolver_usuario_auditoria')) {
  function mov_global_cheques_resolver_usuario_auditoria(PDO $pdo, array $src = []): int
  {
    if (function_exists('get_id_usuario_from_request')) {
      $id = get_id_usuario_from_request($pdo, $src);
      if ($id > 0) return $id;

      if (!empty($_POST) && is_array($_POST)) {
        $id = get_id_usuario_from_request($pdo, $_POST);
        if ($id > 0) return $id;
      }

      $id = get_id_usuario_from_request($pdo, $_GET ?? []);
      if ($id > 0) return $id;
    }

    return 0;
  }
}

if (!function_exists('mov_global_cheques_fetch_movimiento')) {
  function mov_global_cheques_fetch_movimiento(PDO $pdo, int $idMovimiento): ?array
  {
    if ($idMovimiento <= 0) {
      return null;
    }

    $st = $pdo->prepare("
      SELECT *
      FROM movimientos
      WHERE id_movimiento = :id_movimiento
      LIMIT 1
    ");
    $st->execute([':id_movimiento' => $idMovimiento]);

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('mov_global_cheques_fetch_comprobante')) {
  function mov_global_cheques_fetch_comprobante(PDO $pdo, ?int $idComprobante): ?array
  {
    if ($idComprobante === null || $idComprobante <= 0) {
      return null;
    }

    $st = $pdo->prepare("
      SELECT *
      FROM comprobantes_archivos
      WHERE id_comprobante = :id_comprobante
      LIMIT 1
    ");
    $st->execute([':id_comprobante' => $idComprobante]);

    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}


if (!function_exists('mov_global_cheques_normalize_tipo_comprobante_archivo')) {
  function mov_global_cheques_normalize_tipo_comprobante_archivo($tipo): string
  {
    $s = strtoupper(trim((string)($tipo ?? '')));
    return str_replace([' ', '-', '_'], '', $s);
  }
}

if (!function_exists('mov_global_cheques_comprobante_es_archivo_cheque')) {
  function mov_global_cheques_comprobante_es_archivo_cheque($tipo): bool
  {
    $tipoNorm = mov_global_cheques_normalize_tipo_comprobante_archivo($tipo);
    return in_array($tipoNorm, ['CHEQUE', 'ECHEQ', 'ECHEQUE'], true);
  }
}

if (!function_exists('mov_global_cheques_normalizar_id_comprobante_adjunto')) {
  function mov_global_cheques_normalizar_id_comprobante_adjunto(PDO $pdo, ?int $idComprobante, int $idMovimiento): ?int
  {
    if ($idComprobante === null || $idComprobante <= 0) {
      return null;
    }

    $st = $pdo->prepare("
      SELECT
        ca.id_comprobante,
        ca.id_movimiento,
        ca.tipo
      FROM comprobantes_archivos ca
      WHERE ca.id_comprobante = :id_comprobante
      LIMIT 1
    ");
    $st->execute([':id_comprobante' => $idComprobante]);
    $comp = $st->fetch(PDO::FETCH_ASSOC);

    if (!$comp) {
      return null;
    }

    $idMovimientoComp = isset($comp['id_movimiento']) ? (int)$comp['id_movimiento'] : 0;
    if ($idMovimientoComp > 0 && $idMovimiento > 0 && $idMovimientoComp !== $idMovimiento) {
      return null;
    }

    // Blindaje principal: un cheque/eCheq solamente puede quedar vinculado
    // a un archivo cargado específicamente como CHEQUE/ECHEQ.
    // Facturas, remitos, venta no facturada u otros documentos de la venta
    // se ignoran y el cheque queda sin archivo asociado.
    if (!mov_global_cheques_comprobante_es_archivo_cheque($comp['tipo'] ?? '')) {
      return null;
    }

    return (int)$comp['id_comprobante'];
  }
}

if (!function_exists('mov_global_cheques_where_tipo_comprobante_adjunto_sql')) {
  function mov_global_cheques_where_tipo_comprobante_adjunto_sql(string $alias = 'ca'): string
  {
    $alias = preg_replace('/[^a-zA-Z0-9_]/', '', $alias);
    if ($alias === '') $alias = 'ca';
    return "UPPER(REPLACE(REPLACE(REPLACE(COALESCE({$alias}.tipo,''), ' ', ''), '-', ''), '_', '')) IN ('CHEQUE','ECHEQ','ECHEQUE')";
  }
}

if (!function_exists('mov_global_cheques_limpiar_vinculos_no_cheque')) {
  function mov_global_cheques_limpiar_vinculos_no_cheque(PDO $pdo, ?int $idCheque = null, ?int $idMovimiento = null, ?int $idComprobante = null): int
  {
    $where = ["c.id_comprobante IS NOT NULL", "NOT (" . mov_global_cheques_where_tipo_comprobante_adjunto_sql('ca') . ")"];
    $params = [];

    if ($idCheque !== null && $idCheque > 0) {
      $where[] = 'c.id_cheque = :id_cheque';
      $params[':id_cheque'] = $idCheque;
    }
    if ($idMovimiento !== null && $idMovimiento > 0) {
      $where[] = 'c.id_movimiento = :id_movimiento';
      $params[':id_movimiento'] = $idMovimiento;
    }
    if ($idComprobante !== null && $idComprobante > 0) {
      $where[] = 'c.id_comprobante = :id_comprobante';
      $params[':id_comprobante'] = $idComprobante;
    }

    $sql = "
      UPDATE movimientos_cheques c
      INNER JOIN comprobantes_archivos ca
        ON ca.id_comprobante = c.id_comprobante
      SET c.id_comprobante = NULL
      WHERE " . implode(' AND ', $where) . "
    ";

    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->rowCount();
  }
}

if (!function_exists('mov_global_cheques_assert_movimiento_exists')) {
  function mov_global_cheques_assert_movimiento_exists(PDO $pdo, int $idMovimiento): void
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

if (!function_exists('mov_global_cheques_assert_comprobante_exists')) {
  function mov_global_cheques_assert_comprobante_exists(PDO $pdo, ?int $idComprobante, int $idMovimiento): void
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

    // Blindaje: un cheque/eCheq solo puede quedar vinculado a un archivo
    // que haya sido subido como CHEQUE/ECHEQ. Nunca debe heredar remitos,
    // facturas internas ni comprobantes generados por la venta.
    $tipoComp = strtoupper(trim((string)($comp['tipo'] ?? '')));
    $tipoCompNorm = str_replace([' ', '-', '_'], '', $tipoComp);
    if (!in_array($tipoCompNorm, ['CHEQUE', 'ECHEQ', 'ECHEQUE'], true)) {
      throw new RuntimeException('El comprobante indicado no es un archivo de cheque/eCheq.');
    }
  }
}

if (!function_exists('mov_global_cheques_validate_payload')) {
  function mov_global_cheques_validate_payload(PDO $pdo, array $in, bool $isUpdate = false): array
  {
    $idCheque      = mov_global_cheques_safe_int($in['id_cheque'] ?? 0);
    $idMovimiento  = mov_global_cheques_safe_int($in['id_movimiento'] ?? 0);
    $idComprobante = mov_global_cheques_safe_nullable_int($in['id_comprobante'] ?? null);

    $tipo         = mov_global_cheques_normalize_tipo($in['tipo'] ?? $in['tipo_cheque'] ?? 'cheque');
    $fechaEmision = mov_global_cheques_safe_date($in['fecha_emision'] ?? null);
    $emisor       = mov_global_cheques_safe_str($in['emisor'] ?? '');
    $numeroCheque = mov_global_cheques_safe_str($in['numero_cheque'] ?? '');
    $importe      = mov_global_cheques_safe_amount($in['importe'] ?? 0);
    $fechaPago    = mov_global_cheques_safe_date($in['fecha_pago'] ?? null);

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

    mov_global_cheques_assert_movimiento_exists($pdo, $idMovimiento);
    $idComprobante = mov_global_cheques_normalizar_id_comprobante_adjunto($pdo, $idComprobante, $idMovimiento);

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

if (!function_exists('mov_global_cheques_fetch_one')) {
  function mov_global_cheques_fetch_one(PDO $pdo, int $idCheque): ?array
  {
    $st = $pdo->prepare("
      SELECT
        c.id_cheque,
        c.tipo,
        c.id_movimiento,
        CASE
          WHEN ca.id_comprobante IS NOT NULL THEN c.id_comprobante
          ELSE NULL
        END AS id_comprobante,
        CASE
          WHEN ca.id_comprobante IS NOT NULL THEN 1
          ELSE 0
        END AS tiene_comprobante,
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
        NULL AS id_detalle,
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
       AND " . mov_global_cheques_where_tipo_comprobante_adjunto_sql('ca') . "
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

if (!function_exists('mov_global_cheques_is_https_request')) {
  function mov_global_cheques_is_https_request(): bool
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

if (!function_exists('mov_global_cheques_dirname_n')) {
  function mov_global_cheques_dirname_n(string $path, int $levels): string
  {
    $out = $path;
    for ($i = 0; $i < $levels; $i++) {
      $out = dirname($out);
    }
    return $out;
  }
}

if (!function_exists('mov_global_cheques_get_public_html_dir')) {
  function mov_global_cheques_get_public_html_dir(): string
  {
    $apiDir = realpath(mov_global_cheques_dirname_n(__DIR__, 3));
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

    return mov_global_cheques_dirname_n(__DIR__, 5);
  }
}

if (!function_exists('mov_global_cheques_get_balto_private_dir')) {
  function mov_global_cheques_get_balto_private_dir(): string
  {
    $publicHtml = mov_global_cheques_get_public_html_dir();
    $homeDir = realpath($publicHtml . '/..');

    if ($homeDir && is_dir($homeDir . '/balto_private')) {
      $cand = realpath($homeDir . '/balto_private');
      if ($cand && is_dir($cand)) {
        return $cand;
      }
    }

    $apiDir = realpath(mov_global_cheques_dirname_n(__DIR__, 3));
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

if (!function_exists('mov_global_cheques_get_private_uploads_dir')) {
  function mov_global_cheques_get_private_uploads_dir(): string
  {
    $baltoPrivate = mov_global_cheques_get_balto_private_dir();
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

if (!function_exists('mov_global_cheques_safe_mkdir')) {
  function mov_global_cheques_safe_mkdir(string $path): void
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

if (!function_exists('mov_global_cheques_normalize_rel_from_private_uploads')) {
  function mov_global_cheques_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
  {
    $abs = str_replace('\\', '/', $abs);
    $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

    if (strpos($abs, $uploadsBase . '/') === 0) {
      return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
    }

    return ltrim($abs, '/');
  }
}

if (!function_exists('mov_global_cheques_api_php_abs_url')) {
  function mov_global_cheques_api_php_abs_url(): string
  {
    return mvx_public_api_php_abs_url();
  }
}

if (!function_exists('mov_global_cheques_build_download_url')) {
  function mov_global_cheques_build_download_url(int $idComprobante): string
  {
    return mov_global_cheques_api_php_abs_url()
      . '?action=mov_global_cheques_comprobantes_descargar&id_comprobante='
      . (int)$idComprobante;
  }
}

if (!function_exists('mov_global_cheques_tipo_to_folder')) {
  function mov_global_cheques_tipo_to_folder(string $tipoCheque): string
  {
    return mov_global_cheques_normalize_tipo($tipoCheque) === 'echeq'
      ? 'echeq'
      : 'cheque';
  }
}

if (!function_exists('mov_global_cheques_detect_real_mime')) {
  function mov_global_cheques_detect_real_mime(string $tmpPath, string $fallback = ''): string
  {
    $mime = trim((string)$fallback);

    if (function_exists('finfo_open')) {
      $fi = @finfo_open(FILEINFO_MIME_TYPE);
      if ($fi) {
        $det = @finfo_file($fi, $tmpPath);
        @finfo_close($fi);
        if (is_string($det) && trim($det) !== '') {
          $mime = trim($det);
        }
      }
    }

    return $mime !== '' ? $mime : 'application/octet-stream';
  }
}

if (!function_exists('mov_global_cheques_safe_extension_from_name')) {
  function mov_global_cheques_safe_extension_from_name(string $filename): string
  {
    $ext = strtolower((string)pathinfo($filename, PATHINFO_EXTENSION));
    return preg_replace('/[^a-z0-9]+/', '', $ext);
  }
}

if (!function_exists('mov_global_cheques_ext_from_mime')) {
  function mov_global_cheques_ext_from_mime(string $mime): string
  {
    $map = [
      'application/pdf' => 'pdf',
      'image/jpeg' => 'jpg',
      'image/jpg' => 'jpg',
      'image/png' => 'png',
      'image/webp' => 'webp',
      'image/bmp' => 'bmp',
      'image/tiff' => 'tiff',
      'image/x-tiff' => 'tiff',
    ];

    $mime = strtolower(trim($mime));
    return $map[$mime] ?? 'bin';
  }
}

if (!function_exists('mov_global_cheques_normalize_db_rel_path')) {
  function mov_global_cheques_normalize_db_rel_path(string $path): string
  {
    $p = trim(str_replace('\\', '/', $path));
    $p = preg_replace('#/+#', '/', $p);

    while (strpos($p, './') === 0) {
      $p = substr($p, 2);
    }

    $p = ltrim($p, '/');

    if (strpos($p, 'balto_private/uploads/') === 0) {
      $p = substr($p, strlen('balto_private/'));
    }

    if (strpos($p, 'public_html/uploads/') === 0) {
      $p = substr($p, strlen('public_html/'));
    }

    return $p;
  }
}

if (!function_exists('mov_global_cheques_uploaded_file_key')) {
  function mov_global_cheques_uploaded_file_key(): ?string
  {
    foreach (['archivo', 'file', 'adjunto'] as $k) {
      if (
        isset($_FILES[$k]) &&
        is_array($_FILES[$k]) &&
        (int)($_FILES[$k]['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK
      ) {
        return $k;
      }
    }

    return null;
  }
}

if (!function_exists('mov_global_cheques_has_uploaded_file')) {
  function mov_global_cheques_has_uploaded_file(): bool
  {
    return mov_global_cheques_uploaded_file_key() !== null;
  }
}

if (!function_exists('mov_global_cheques_build_download_filename')) {
  function mov_global_cheques_build_download_filename(string $tipo, int $idComprobante, string $path, string $mime): string
  {
    $tipoNorm = mov_global_cheques_normalize_tipo($tipo);
    $prefix = $tipoNorm === 'echeq' ? 'echeq' : 'cheque';

    $ext = strtolower((string)pathinfo($path, PATHINFO_EXTENSION));
    $ext = preg_replace('/[^a-z0-9]+/', '', $ext);

    if ($ext === '') {
      $ext = mov_global_cheques_ext_from_mime($mime);
    }

    if ($ext === '') {
      $ext = 'bin';
    }

    return $prefix . '_comprobante_' . (int)$idComprobante . '.' . $ext;
  }
}

if (!function_exists('mov_global_cheques_resolve_tenant_id_or_fail')) {
  function mov_global_cheques_resolve_tenant_id_or_fail(): int
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
if (!function_exists('mov_global_cheques_subir_archivo')) {
  function mov_global_cheques_subir_archivo(PDO $pdo, int $idMovimiento, string $tipoCheque = 'cheque'): ?array
  {
    $fileKey = mov_global_cheques_uploaded_file_key();
    if ($fileKey === null) {
      return null;
    }

    $tenantId = mov_global_cheques_resolve_tenant_id_or_fail();
    $file = $_FILES[$fileKey];

    $err = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) {
      throw new RuntimeException('Error al subir archivo (UPLOAD_ERR=' . $err . ').');
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_file($tmpPath)) {
      throw new RuntimeException('Archivo temporal inválido.');
    }

    $origName = basename((string)($file['name'] ?? 'adjunto'));
    $mimeBrowser = (string)($file['type'] ?? '');
    $realMime = mov_global_cheques_detect_real_mime($tmpPath, $mimeBrowser);
    $size = (int)($file['size'] ?? 0);

    $ext = mov_global_cheques_safe_extension_from_name($origName);
    if ($ext === '') {
      $ext = mov_global_cheques_ext_from_mime($realMime);
    }
    if ($ext === '') {
      $ext = 'bin';
    }

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

    $tipoNorm = mov_global_cheques_normalize_tipo($tipoCheque);
    $tipoFolder = mov_global_cheques_tipo_to_folder($tipoNorm);
    $tipoComprobante = mov_global_cheques_comprobante_tipo($tipoNorm);

    $finalName = $tipoFolder . '__mov_' . (int)$idMovimiento . '__' . $sha256 . '.' . $ext;
    $r2Key = mvx_r2_build_comprobante_key((int)$tenantId, $tipoFolder, $finalName);
    $r2Stored = false;

    try {
      mvx_r2_put_file($tmpPath, $r2Key, ($realMime !== '' ? $realMime : 'application/octet-stream'), [
        'Metadata' => [
          'sha256' => $sha256,
          'tipo' => strtolower($tipoNorm),
          'tenant_id' => (string)$tenantId,
          'id_movimiento' => (string)$idMovimiento,
          'nombre_original' => substr($origName, 0, 250),
        ],
      ]);
      $r2Stored = true;
    } catch (Throwable $e) {
      throw new RuntimeException(
        'No se pudo guardar el archivo en Cloudflare R2: ' . $e->getMessage(),
        0,
        $e
      );
    }

    $archivoPathDb = 'r2://' . $r2Key;

    try {
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
        ':archivo_path'  => $archivoPathDb,
        ':archivo_mime'  => ($realMime !== '' ? $realMime : 'application/octet-stream'),
        ':archivo_size'  => $size,
        ':sha256'        => $sha256,
        ':id_movimiento' => $idMovimiento,
      ]);

      $idComprobante = (int)$pdo->lastInsertId();
      if ($idComprobante <= 0) {
        throw new RuntimeException('No se pudo obtener el id_comprobante.');
      }

      $archivoUrl = mov_global_cheques_build_download_url($idComprobante);

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
    } catch (Throwable $e) {
      if ($r2Stored) {
        try {
          mvx_r2_delete_object($r2Key);
        } catch (Throwable $cleanupError) {
          error_log(
            'Cleanup R2 falló después de error DB en mov_global_cheques_subir_archivo: '
            . $cleanupError->getMessage()
          );
        }
      }

      throw $e;
    }

    return [
      'id_comprobante' => $idComprobante,
      'archivo_path'   => $archivoPathDb,
      'archivo_url'    => $archivoUrl,
      'r2_key'         => $r2Key,
      'sha256'         => $sha256,
      'filename'       => $finalName,
      'mime'           => ($realMime !== '' ? $realMime : 'application/octet-stream'),
      'size'           => $size,
      'tipo'           => $tipoComprobante,
      'storage'        => 'r2',
    ];
  }
}

if (!function_exists('mov_global_cheques_absolute_path_from_relative')) {
  function mov_global_cheques_absolute_path_from_relative(string $archivoPath): string
  {
    $archivoPath = trim(str_replace('\\', '/', $archivoPath));
    if ($archivoPath === '') {
      return '';
    }

    if ($archivoPath[0] === '/' || preg_match('/^[A-Za-z]:\//', $archivoPath)) {
      return $archivoPath;
    }

    $uploadsBase = mov_global_cheques_get_private_uploads_dir();

    if (strpos($archivoPath, 'uploads/') === 0) {
      return rtrim($uploadsBase, '/') . '/' . ltrim(substr($archivoPath, strlen('uploads/')), '/');
    }

    return rtrim($uploadsBase, '/') . '/' . ltrim($archivoPath, '/');
  }
}

if (!function_exists('mov_global_cheques_cleanup_comprobante')) {
  function mov_global_cheques_cleanup_comprobante(PDO $pdo, ?int $idComprobante, ?string $archivoPath = null): void
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

      $st = $pdo->prepare("
        DELETE FROM comprobantes_archivos
        WHERE id_comprobante = :id_comprobante
      ");
      $st->execute([':id_comprobante' => $idComprobante]);
    }

    if (!$archivoPath) {
      return;
    }

    try {
      $archivoPath = trim((string)$archivoPath);

      if (strpos($archivoPath, 'r2://') === 0) {
        $r2Key = ltrim(substr($archivoPath, strlen('r2://')), '/');
        if ($r2Key !== '') {
          mvx_r2_delete_object($r2Key);
        }
        return;
      }

      $abs = mov_global_cheques_absolute_path_from_relative($archivoPath);
      if ($abs !== '' && is_file($abs)) {
        @unlink($abs);
      }
    } catch (Throwable $e) {
      error_log('No se pudo limpiar comprobante de cheque: ' . $e->getMessage());
    }
  }
}


if (!function_exists('mov_global_cheques_flujo_table_exists')) {
  function mov_global_cheques_flujo_table_exists(PDO $pdo): bool
  {
    static $cache = null;
    if ($cache !== null) return $cache;
    try {
      $pdo->query("SELECT 1 FROM movimientos_cheques_flujo LIMIT 1");
      $cache = true;
    } catch (Throwable $e) {
      $cache = false;
    }
    return $cache;
  }
}

if (!function_exists('mov_global_cheques_registrar_ingreso_flujo')) {
  function mov_global_cheques_registrar_ingreso_flujo(PDO $pdo, int $idCheque, int $idMovimiento, array $data): void
  {
    if ($idCheque <= 0 || $idMovimiento <= 0 || !mov_global_cheques_flujo_table_exists($pdo)) return;

    $tipoCheque = strtolower(trim((string)($data['tipo'] ?? 'cheque')));
    if ($tipoCheque === '') $tipoCheque = 'cheque';
    $fechaEvento = mov_global_cheques_safe_date($data['fecha_emision'] ?? $data['fecha_evento'] ?? null);
    if (!$fechaEvento) {
      throw new RuntimeException('La fecha de evento del cheque es obligatoria y debe venir desde el modal.');
    }
    $descripcion = (($tipoCheque === 'echeq') ? 'E-cheq' : 'Cheque') . ' ingresado a cartera desde movimiento #' . $idMovimiento . '.';

    $pdo->prepare("DELETE FROM movimientos_cheques_flujo WHERE id_cheque = :id_cheque AND UPPER(COALESCE(evento,'')) IN ('INGRESO_CARTERA','INGRESO','ALTA','ALTA_CARTERA')")
      ->execute([':id_cheque' => $idCheque]);

    $st = $pdo->prepare("
      INSERT INTO movimientos_cheques_flujo
        (tipo_cheque, id_cheque, id_movimiento, evento, fecha_evento, importe, descripcion, usuario)
      VALUES
        (:tipo_cheque, :id_cheque, :id_movimiento, 'INGRESO_CARTERA', :fecha_evento, :importe, :descripcion, NULL)
    ");
    $st->execute([
      ':tipo_cheque'   => $tipoCheque,
      ':id_cheque'     => $idCheque,
      ':id_movimiento' => $idMovimiento,
      ':fecha_evento'  => $fechaEvento,
      ':importe'       => (float)($data['importe'] ?? 0),
      ':descripcion'   => $descripcion,
    ]);
  }
}

if (!function_exists('mov_global_cheques_limpiar_ingreso_flujo')) {
  function mov_global_cheques_limpiar_ingreso_flujo(PDO $pdo, int $idCheque): void
  {
    if ($idCheque <= 0 || !mov_global_cheques_flujo_table_exists($pdo)) return;
    $pdo->prepare("DELETE FROM movimientos_cheques_flujo WHERE id_cheque = :id_cheque AND UPPER(COALESCE(evento,'')) IN ('INGRESO_CARTERA','INGRESO','ALTA','ALTA_CARTERA')")
      ->execute([':id_cheque' => $idCheque]);
  }
}


/* =========================================================
   ALTA ÚNICA GLOBAL DE CHEQUES / ECHEQS RECIBIDOS
   - Usada por la acción mov_global_cheques_guardar.
   - Usada internamente por ventas, recibos y otros ingresos.
   - Nunca hereda remitos/facturas del movimiento como archivo del cheque.
========================================================= */

if (!function_exists('mov_global_cheques_preparar_payload_alta')) {
  function mov_global_cheques_preparar_payload_alta(PDO $pdo, array $input, array $options = []): array
  {
    $idMovimiento = mov_global_cheques_safe_int($input['id_movimiento'] ?? $options['id_movimiento'] ?? 0);
    if ($idMovimiento <= 0) {
      throw new RuntimeException('Falta id_movimiento para crear el cheque.');
    }

    $strictDates = array_key_exists('strict_dates', $options) ? !empty($options['strict_dates']) : true;

    $fechaEmision = mov_global_cheques_safe_date($input['fecha_emision'] ?? null);
    if (!$fechaEmision && !$strictDates) {
      $fechaEmision = mov_global_cheques_safe_date($options['fallback_date'] ?? null);
    }

    $fechaPago = mov_global_cheques_safe_date($input['fecha_pago'] ?? null);
    if (!$fechaPago && !$strictDates) {
      $fechaPago = mov_global_cheques_safe_date($options['fallback_date'] ?? null);
    }

    $idComprobante = mov_global_cheques_safe_nullable_int($input['id_comprobante'] ?? $options['id_comprobante'] ?? null);

    $data = [
      'id_movimiento'  => $idMovimiento,
      'id_comprobante' => $idComprobante,
      'tipo'           => mov_global_cheques_normalize_tipo($input['tipo'] ?? $input['tipo_cheque'] ?? 'cheque'),
      'fecha_emision'  => $fechaEmision,
      'emisor'         => mov_global_cheques_safe_str($input['emisor'] ?? ''),
      'numero_cheque'  => mov_global_cheques_safe_str($input['numero_cheque'] ?? $input['numero'] ?? ''),
      'importe'        => mov_global_cheques_safe_amount($input['importe'] ?? $input['monto'] ?? 0),
      'fecha_pago'     => $fechaPago,
      'id_movimiento_medio_pago' => mov_global_cheques_safe_int(
        $input['id_movimiento_medio_pago'] ?? $options['id_movimiento_medio_pago'] ?? 0
      ),
      'id_medio_pago' => mov_global_cheques_safe_int(
        $input['id_medio_pago'] ?? $options['id_medio_pago'] ?? 0
      ),
    ];

    if (!$data['fecha_emision']) throw new RuntimeException('La fecha de emisión es obligatoria.');
    if ($data['emisor'] === '') throw new RuntimeException('El emisor del cheque es obligatorio.');
    if ($data['numero_cheque'] === '') throw new RuntimeException('El número de cheque es obligatorio.');
    if ($data['importe'] <= 0) throw new RuntimeException('El importe del cheque debe ser mayor a 0.');
    if (!$data['fecha_pago']) throw new RuntimeException('La fecha de pago es obligatoria.');

    mov_global_cheques_assert_movimiento_exists($pdo, $idMovimiento);

    // Blindaje: solamente se acepta un comprobante cargado como CHEQUE / ECHEQ.
    // Si viene un remito/factura/comprobante propio del movimiento, se transforma en NULL.
    $data['id_comprobante'] = mov_global_cheques_normalizar_id_comprobante_adjunto(
      $pdo,
      $idComprobante,
      $idMovimiento
    );

    return $data;
  }
}

if (!function_exists('mov_global_cheques_crear_recibido')) {
  function mov_global_cheques_crear_recibido(PDO $pdo, array $input, array $options = []): int
  {
    $data = mov_global_cheques_preparar_payload_alta($pdo, $input, $options);

    $dup = mov_global_cheques_buscar_duplicado_por_numero(
      $pdo,
      $data['numero_cheque'],
      $data['tipo'],
      null
    );
    if ($dup) {
      throw new RuntimeException(mov_global_cheques_mensaje_duplicado_por_numero($dup));
    }

    $st = $pdo->prepare("\n      INSERT INTO movimientos_cheques (\n        tipo, id_movimiento, id_comprobante, fecha_emision, emisor, numero_cheque, importe, fecha_pago, activo\n      ) VALUES (\n        :tipo, :id_movimiento, :id_comprobante, :fecha_emision, :emisor, :numero_cheque, :importe, :fecha_pago, 1\n      )\n    ");
    $st->bindValue(':tipo', $data['tipo'], PDO::PARAM_STR);
    $st->bindValue(':id_movimiento', (int)$data['id_movimiento'], PDO::PARAM_INT);
    if ($data['id_comprobante'] === null) $st->bindValue(':id_comprobante', null, PDO::PARAM_NULL);
    else $st->bindValue(':id_comprobante', (int)$data['id_comprobante'], PDO::PARAM_INT);
    $st->bindValue(':fecha_emision', $data['fecha_emision'], PDO::PARAM_STR);
    $st->bindValue(':emisor', $data['emisor'], PDO::PARAM_STR);
    $st->bindValue(':numero_cheque', $data['numero_cheque'], PDO::PARAM_STR);
    $st->bindValue(':importe', (float)$data['importe']);
    $st->bindValue(':fecha_pago', $data['fecha_pago'], PDO::PARAM_STR);
    $st->execute();

    $idCheque = (int)$pdo->lastInsertId();
    if ($idCheque <= 0) {
      throw new RuntimeException('No se pudo obtener el ID del cheque creado.');
    }

    mov_global_cheques_limpiar_vinculos_no_cheque($pdo, $idCheque, (int)$data['id_movimiento']);

    if (!empty($options['limpiar_movimiento_completo'])) {
      mov_global_cheques_limpiar_vinculos_no_cheque($pdo, null, (int)$data['id_movimiento']);
    }

    if (($options['registrar_ingreso'] ?? true) !== false) {
      mov_global_cheques_registrar_ingreso_flujo($pdo, $idCheque, (int)$data['id_movimiento'], $data);
    }

    if ((int)$data['id_movimiento_medio_pago'] > 0 || (int)$data['id_medio_pago'] > 0) {
      mov_global_cheques_sync_movimiento_medio_pago(
        $pdo,
        (int)$data['id_movimiento'],
        $idCheque,
        (int)$data['id_movimiento_medio_pago'],
        (int)$data['id_medio_pago'],
        (string)$data['tipo'],
        (float)$data['importe']
      );
    }

    return $idCheque;
  }
}

/*
|--------------------------------------------------------------------------
| Actions
|--------------------------------------------------------------------------
*/

if (!function_exists('mov_global_cheques_guardar')) {
  function mov_global_cheques_guardar(PDO $pdo): void
  {
    $archivoSubido = null;

    try {
      $in = mov_global_cheques_request_data();
      $idUsuario = mov_global_cheques_resolver_usuario_auditoria($pdo, $in);
      $data = mov_global_cheques_validate_payload($pdo, $in, false);

      $pdo->beginTransaction();

      // Alta global única:
      // ventas, recibos y otros ingresos deben terminar usando esta misma acción/lógica.
      // Si no se sube archivo propio del cheque/eCheq, id_comprobante queda NULL.
      $idComprobante = null;
      if (mov_global_cheques_has_uploaded_file()) {
        $archivoSubido = mov_global_cheques_subir_archivo($pdo, (int)$data['id_movimiento'], (string)$data['tipo']);
        if ($archivoSubido !== null) {
          $idComprobante = (int)$archivoSubido['id_comprobante'];
        }
      }

      $payloadAlta = $data;
      $payloadAlta['id_comprobante'] = $idComprobante;
      $payloadAlta['id_movimiento_medio_pago'] = mov_global_cheques_safe_int($in['id_movimiento_medio_pago'] ?? 0);
      $payloadAlta['id_medio_pago'] = mov_global_cheques_safe_int($in['id_medio_pago'] ?? 0);

      $idCheque = mov_global_cheques_crear_recibido($pdo, $payloadAlta, [
        'registrar_ingreso' => true,
        'strict_dates' => true,
        'limpiar_movimiento_completo' => true,
      ]);

      $pdo->commit();

      $cheque = mov_global_cheques_fetch_one($pdo, $idCheque);
      $movimiento = mov_global_cheques_fetch_movimiento($pdo, (int)$data['id_movimiento']);
      $comprobante = mov_global_cheques_fetch_comprobante($pdo, $idComprobante);

      $idUsuarioAudit = mov_global_cheques_resolver_usuario_auditoria($pdo, $in);
      if ($idUsuarioAudit > 0 && function_exists('audit_safe')) {
        audit_safe($pdo, $idUsuarioAudit, 'crear_cheque', 'mov_global_cheques', $idCheque, [
          'creado'       => true,
          'nuevo'        => $cheque,
          'movimiento'   => $movimiento,
          'comprobante'  => $comprobante,
          'tipo_cheque'  => $data['tipo'],
          'importe'      => $data['importe'],
        ]);
      }

      mov_global_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque guardado correctamente.',
        'cheque'  => $cheque,
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit ?? 0,
          'audit_intentado'      => (($idUsuarioAudit ?? 0) > 0),
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      if ($archivoSubido !== null) {
        mov_global_cheques_cleanup_comprobante(
          $pdo,
          (int)($archivoSubido['id_comprobante'] ?? 0),
          (string)($archivoSubido['archivo_path'] ?? '')
        );
      }

      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al guardar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

if (!function_exists('mov_global_cheques_obtener')) {
  function mov_global_cheques_obtener(PDO $pdo): void
  {
    try {
      $modo = mov_global_cheques_safe_str($_GET['modo'] ?? $_POST['modo'] ?? '');

      if ($modo === 'verificar_numero') {
        $in = mov_global_cheques_request_data();
        $numeroCheque = mov_global_cheques_safe_str(
          $in['numero_cheque']
            ?? $_GET['numero_cheque']
            ?? $_POST['numero_cheque']
            ?? ''
        );
        $tipoCheque = mov_global_cheques_normalize_tipo(
          $in['tipo']
            ?? $in['tipo_cheque']
            ?? $_GET['tipo']
            ?? $_GET['tipo_cheque']
            ?? $_POST['tipo']
            ?? $_POST['tipo_cheque']
            ?? 'cheque'
        );
        $idCheque = mov_global_cheques_safe_nullable_int(
          $in['id_cheque']
            ?? $_GET['id_cheque']
            ?? $_POST['id_cheque']
            ?? null
        );

        if ($numeroCheque === '') {
          throw new RuntimeException('El número de cheque es obligatorio.');
        }

        $dup = mov_global_cheques_buscar_duplicado_por_numero($pdo, $numeroCheque, $tipoCheque, $idCheque);

        mov_global_cheques_output_json([
          'exito'      => true,
          'disponible' => $dup ? false : true,
          'existe'     => $dup ? true : false,
          'mensaje'    => $dup ? mov_global_cheques_mensaje_duplicado_por_numero($dup) : 'Número de cheque disponible.',
          'duplicado'  => $dup ?: null,
        ]);
        return;
      }

      $idCheque = isset($_GET['id_cheque']) ? (int)$_GET['id_cheque'] : 0;

      if ($idCheque <= 0) {
        throw new RuntimeException('Falta id_cheque.');
      }

      $row = mov_global_cheques_fetch_one($pdo, $idCheque);
      if (!$row) {
        throw new RuntimeException('Cheque no encontrado.');
      }

      mov_global_cheques_output_json([
        'exito'  => true,
        'cheque' => $row,
      ]);
    } catch (Throwable $e) {
      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al obtener cheque: ' . $e->getMessage(),
      ], 404);
    }
  }
}

if (!function_exists('mov_global_cheques_listar')) {
  function mov_global_cheques_listar(PDO $pdo): void
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
          CASE
            WHEN ca.id_comprobante IS NOT NULL THEN c.id_comprobante
            ELSE NULL
          END AS id_comprobante,
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
          NULL AS id_detalle,
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
         AND " . mov_global_cheques_where_tipo_comprobante_adjunto_sql('ca') . "
        {$sqlWhere}
        ORDER BY c.fecha_pago ASC, c.id_cheque ASC
      ");
      $st->execute($params);
      $rows = $st->fetchAll(PDO::FETCH_ASSOC);

      mov_global_cheques_output_json([
        'exito'   => true,
        'cheques' => $rows,
      ]);
    } catch (Throwable $e) {
      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al listar cheques: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('mov_global_cheques_actualizar')) {
  function mov_global_cheques_actualizar(PDO $pdo): void
  {
    $archivoSubido = null;

    try {
      $in = mov_global_cheques_request_data();
      $idUsuario = mov_global_cheques_resolver_usuario_auditoria($pdo, $in);
      $data = mov_global_cheques_validate_payload($pdo, $in, true);

      $antes = mov_global_cheques_fetch_one($pdo, (int)$data['id_cheque']);

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

      $dup = mov_global_cheques_buscar_duplicado_por_numero(
        $pdo,
        $data['numero_cheque'],
        $data['tipo'],
        (int)$data['id_cheque']
      );

      if ($dup) {
        throw new RuntimeException(mov_global_cheques_mensaje_duplicado_por_numero($dup));
      }

      $pdo->beginTransaction();

      $idComprobante = $data['id_comprobante'];

      if (mov_global_cheques_has_uploaded_file()) {
        $archivoSubido = mov_global_cheques_subir_archivo($pdo, $data['id_movimiento'], $data['tipo']);
        if ($archivoSubido !== null) {
          $idComprobante = (int)$archivoSubido['id_comprobante'];
        }
      } elseif ($idComprobante === null) {
        $idComprobante = isset($actual['id_comprobante']) && $actual['id_comprobante'] !== null
          ? mov_global_cheques_normalizar_id_comprobante_adjunto($pdo, (int)$actual['id_comprobante'], (int)$data['id_movimiento'])
          : null;
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

      mov_global_cheques_limpiar_vinculos_no_cheque($pdo, (int)$data['id_cheque'], (int)$data['id_movimiento']);
      mov_global_cheques_registrar_ingreso_flujo($pdo, (int)$data['id_cheque'], (int)$data['id_movimiento'], $data);
      mov_global_cheques_sync_movimiento_medio_pago(
        $pdo,
        (int)$data['id_movimiento'],
        (int)$data['id_cheque'],
        mov_global_cheques_safe_int($in['id_movimiento_medio_pago'] ?? 0),
        mov_global_cheques_safe_int($in['id_medio_pago'] ?? 0),
        (string)$data['tipo'],
        (float)$data['importe']
      );

      $pdo->commit();

      $cheque = mov_global_cheques_fetch_one($pdo, $data['id_cheque']);
      $movimiento = mov_global_cheques_fetch_movimiento($pdo, (int)$data['id_movimiento']);
      $comprobante = mov_global_cheques_fetch_comprobante($pdo, $idComprobante);

      $idUsuarioAudit = mov_global_cheques_resolver_usuario_auditoria($pdo, $in);
      if ($idUsuarioAudit > 0 && function_exists('audit_safe')) {
        audit_safe($pdo, $idUsuarioAudit, 'actualizar_cheque', 'mov_global_cheques', (int)$data['id_cheque'], [
          'antes'       => $antes,
          'despues'     => $cheque,
          'movimiento'  => $movimiento,
          'comprobante' => $comprobante,
        ]);
      }

      mov_global_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque actualizado correctamente.',
        'cheque'  => $cheque,
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit ?? 0,
          'audit_intentado'      => (($idUsuarioAudit ?? 0) > 0),
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      if ($archivoSubido !== null) {
        mov_global_cheques_cleanup_comprobante(
          $pdo,
          (int)($archivoSubido['id_comprobante'] ?? 0),
          (string)($archivoSubido['archivo_path'] ?? '')
        );
      }

      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al actualizar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}

if (!function_exists('mov_global_cheques_eliminar')) {
  function mov_global_cheques_eliminar(PDO $pdo): void
  {
    try {
      $in = mov_global_cheques_request_data();
      $idUsuario = mov_global_cheques_resolver_usuario_auditoria($pdo, $in);

      $idCheque = isset($in['id_cheque']) ? (int)$in['id_cheque'] : 0;
      if ($idCheque <= 0) {
        $idCheque = isset($_GET['id_cheque']) ? (int)$_GET['id_cheque'] : 0;
      }

      if ($idCheque <= 0) {
        throw new RuntimeException('Falta id_cheque para eliminar.');
      }

      $antes = mov_global_cheques_fetch_one($pdo, $idCheque);
      if (!$antes) {
        throw new RuntimeException('Cheque no encontrado.');
      }

      $pdo->beginTransaction();

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

      mov_global_cheques_limpiar_ingreso_flujo($pdo, $idCheque);

      $pdo->commit();

      $despues = mov_global_cheques_fetch_one($pdo, $idCheque);

      $idUsuarioAudit = mov_global_cheques_resolver_usuario_auditoria($pdo, $in);
      if ($idUsuarioAudit > 0 && function_exists('audit_safe')) {
        audit_safe($pdo, $idUsuarioAudit, 'eliminar_cheque', 'mov_global_cheques', $idCheque, [
          'eliminado_logico' => true,
          'antes'            => $antes,
          'despues'          => $despues,
        ]);
      }

      mov_global_cheques_output_json([
        'exito'   => true,
        'mensaje' => 'Cheque eliminado correctamente.',
        'audit_debug' => [
          'idUsuario_inicial'    => $idUsuario,
          'idUsuario_auditoria'  => $idUsuarioAudit ?? 0,
          'audit_intentado'      => (($idUsuarioAudit ?? 0) > 0),
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al eliminar cheque: ' . $e->getMessage(),
      ], 400);
    }
  }
}


if (!function_exists('mov_global_cheques_verificar_numero')) {
  function mov_global_cheques_verificar_numero(PDO $pdo): void
  {
    try {
      $in = mov_global_cheques_request_data();
      $numeroCheque = mov_global_cheques_safe_str(
        $in['numero_cheque']
          ?? $_GET['numero_cheque']
          ?? $_POST['numero_cheque']
          ?? ''
      );
      $tipoCheque = mov_global_cheques_normalize_tipo(
        $in['tipo']
          ?? $in['tipo_cheque']
          ?? $_GET['tipo']
          ?? $_GET['tipo_cheque']
          ?? $_POST['tipo']
          ?? $_POST['tipo_cheque']
          ?? 'cheque'
      );
      $idCheque = mov_global_cheques_safe_nullable_int(
        $in['id_cheque']
          ?? $_GET['id_cheque']
          ?? $_POST['id_cheque']
          ?? null
      );

      if ($numeroCheque === '') {
        throw new RuntimeException('El número de cheque es obligatorio.');
      }

      $dup = mov_global_cheques_buscar_duplicado_por_numero($pdo, $numeroCheque, $tipoCheque, $idCheque);

      mov_global_cheques_output_json([
        'exito'      => true,
        'disponible' => $dup ? false : true,
        'existe'     => $dup ? true : false,
        'mensaje'    => $dup ? mov_global_cheques_mensaje_duplicado_por_numero($dup) : 'Número de cheque disponible.',
        'duplicado'  => $dup ?: null,
      ]);
    } catch (Throwable $e) {
      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error verificando número de cheque: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('mov_global_cheques_comprobantes_descargar')) {
  function mov_global_cheques_comprobantes_descargar(PDO $pdo): void
  {
    try {
      $id = $_GET['id_comprobante'] ?? $_GET['id'] ?? '';

      if ($id === '' || !ctype_digit((string)$id) || (int)$id <= 0) {
        throw new RuntimeException('Falta id_comprobante válido.');
      }

      $id = (int)$id;

      $st = $pdo->prepare("
        SELECT
          tipo,
          archivo_path,
          archivo_mime
        FROM comprobantes_archivos
        WHERE id_comprobante = :id
        LIMIT 1
      ");
      $st->execute([':id' => $id]);
      $row = $st->fetch(PDO::FETCH_ASSOC);

      if (!$row) {
        throw new RuntimeException('Comprobante no encontrado.');
      }

      $tipo = (string)($row['tipo'] ?? 'CHEQUE');
      if (!mov_global_cheques_comprobante_es_archivo_cheque($tipo)) {
        throw new RuntimeException('El comprobante solicitado no es un archivo propio de cheque/eCheq.');
      }

      $storedPath = trim((string)($row['archivo_path'] ?? ''));
      $mime = trim((string)($row['archivo_mime'] ?? '')) ?: 'application/octet-stream';

      if ($storedPath === '') {
        throw new RuntimeException('El comprobante no tiene archivo asociado.');
      }

      $filename = mov_global_cheques_build_download_filename($tipo, $id, $storedPath, $mime);

      // =========================
      // R2
      // =========================
      if (strpos($storedPath, 'r2://') === 0) {
        $r2Key = ltrim(substr($storedPath, strlen('r2://')), '/');

        if ($r2Key === '') {
          throw new RuntimeException('Key R2 inválida.');
        }

        $signedUrl = mvx_r2_create_get_signed_url(
          $r2Key,
          '+20 minutes',
          [
            'ResponseContentType' => $mime,
            'ResponseContentDisposition' => 'inline; filename="' . $filename . '"',
          ]
        );

        mov_global_cheques_output_json([
          'exito' => true,
          'url'   => $signedUrl,
          'modo'  => 'r2',
        ]);
      }

      // =========================
      // LOCAL fallback
      // =========================
      $uploadsBase = mov_global_cheques_get_private_uploads_dir();
      $rel = mov_global_cheques_normalize_db_rel_path($storedPath);
      $abs = rtrim($uploadsBase, '/') . '/' . ltrim(str_replace('uploads/', '', $rel), '/');

      if (!is_file($abs)) {
        throw new RuntimeException('Archivo no encontrado.');
      }

      $filesize = filesize($abs);

      if (!headers_sent()) {
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Content-Length: ' . (string)$filesize);
      }

      readfile($abs);
      exit;
    } catch (Throwable $e) {
      mov_global_cheques_output_json([
        'exito'   => false,
        'mensaje' => 'Error al obtener comprobante del cheque: ' . $e->getMessage(),
      ], 500);
    }
  }
}



if (!function_exists('mov_global_cheques_table_has_column')) {
  function mov_global_cheques_table_has_column(PDO $pdo, string $table, string $column): bool
  {
    static $cache = [];
    $table = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
    $column = preg_replace('/[^a-zA-Z0-9_]/', '', $column);
    if ($table === '' || $column === '') return false;
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) return $cache[$key];
    try {
      $st = $pdo->prepare("SHOW COLUMNS FROM `{$table}` LIKE :col");
      $st->execute([':col' => $column]);
      return $cache[$key] = (bool)$st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
      return $cache[$key] = false;
    }
  }
}

if (!function_exists('mov_global_cheques_sync_movimiento_medio_pago')) {
  function mov_global_cheques_sync_movimiento_medio_pago(PDO $pdo, int $idMovimiento, int $idCheque, int $idMovMedioPago = 0, int $idMedioPago = 0, ?string $chequeTipo = null, ?float $monto = null): void
  {
    if ($idMovimiento <= 0 || $idCheque <= 0) return;
    if (!mov_global_cheques_table_has_column($pdo, 'movimientos_medios_pago', 'id_cheque')) return;

    $chequeTipo = $chequeTipo !== null ? mov_global_cheques_normalize_tipo($chequeTipo) : null;

    if ($idMovMedioPago > 0) {
      $st = $pdo->prepare("\n        UPDATE movimientos_medios_pago\n        SET id_cheque = :id_cheque,\n            cheque_tipo = COALESCE(:cheque_tipo, cheque_tipo),\n            monto = COALESCE(:monto, monto)\n        WHERE id_compra_medio_pago = :id_cmp\n          AND id_movimiento = :id_movimiento\n        LIMIT 1\n      ");
      $st->bindValue(':id_cheque', $idCheque, PDO::PARAM_INT);
      $st->bindValue(':cheque_tipo', $chequeTipo, $chequeTipo === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
      if ($monto === null) $st->bindValue(':monto', null, PDO::PARAM_NULL); else $st->bindValue(':monto', $monto);
      $st->bindValue(':id_cmp', $idMovMedioPago, PDO::PARAM_INT);
      $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
      $st->execute();
      if ($st->rowCount() > 0) return;
    }

    if ($idMedioPago > 0) {
      $st = $pdo->prepare("\n        INSERT INTO movimientos_medios_pago (id_movimiento, id_medio_pago, monto, id_cheque, cheque_tipo)\n        VALUES (:id_movimiento, :id_medio_pago, :monto, :id_cheque, :cheque_tipo)\n        ON DUPLICATE KEY UPDATE\n          id_movimiento = VALUES(id_movimiento),\n          id_medio_pago = VALUES(id_medio_pago),\n          monto = VALUES(monto),\n          cheque_tipo = VALUES(cheque_tipo)\n      ");
      $st->execute([
        ':id_movimiento' => $idMovimiento,
        ':id_medio_pago' => $idMedioPago,
        ':monto' => $monto !== null ? $monto : 0,
        ':id_cheque' => $idCheque,
        ':cheque_tipo' => $chequeTipo,
      ]);
    }
  }
}

/* =========================================================
   FUNCIONES DE SERVICIO COMPARTIDAS PARA LOS SUBMÓDULOS
========================================================= */

if (!function_exists('mov_global_cheques_crear_registro')) {
  function mov_global_cheques_crear_registro(PDO $pdo, int $idMovimiento, array $cheque, ?int $idComprobante = null, bool $registrarIngreso = true): int
  {
    // Wrapper interno mantenido para ventas/recibos/otros ingresos.
    // La creación real ahora pasa por la misma función global que usa mov_global_cheques_guardar().
    $payload = array_merge($cheque, [
      'id_movimiento'  => $idMovimiento,
      'id_comprobante' => $idComprobante,
    ]);

    return mov_global_cheques_crear_recibido($pdo, $payload, [
      'registrar_ingreso' => $registrarIngreso,
      'strict_dates' => true,
    ]);
  }
}

if (!function_exists('mov_global_cheques_buscar_activo_para_movimiento')) {
  function mov_global_cheques_buscar_activo_para_movimiento(PDO $pdo, int $idMovimiento, string $numeroCheque, ?string $tipoCheque = null): ?array
  {
    if ($idMovimiento <= 0 || trim($numeroCheque) === '') return null;
    $whereTipo = '';
    $params = [':id_movimiento' => $idMovimiento, ':numero_cheque' => trim($numeroCheque)];
    if ($tipoCheque !== null && trim($tipoCheque) !== '') {
      $whereTipo = " AND LOWER(COALESCE(tipo,'')) = LOWER(:tipo) ";
      $params[':tipo'] = mov_global_cheques_normalize_tipo($tipoCheque);
    }
    $st = $pdo->prepare("\n      SELECT * FROM movimientos_cheques\n      WHERE id_movimiento = :id_movimiento\n        AND numero_cheque = :numero_cheque\n        AND activo = 1\n        {$whereTipo}\n      ORDER BY id_cheque DESC\n      LIMIT 1\n    ");
    $st->execute($params);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('mov_global_cheques_cartera_rows')) {
  function mov_global_cheques_cartera_rows(PDO $pdo, string $tipo = '', array $includeIds = []): array
  {
    $tipo = strtolower(trim($tipo));
    if ($tipo !== '' && !in_array($tipo, ['cheque', 'echeq'], true)) {
      throw new RuntimeException('Tipo de cheque inválido.');
    }

    $includeIds = array_values(array_unique(array_filter(array_map('intval', $includeIds))));
    $where = [];
    $params = [];

    if ($tipo !== '') {
      $where[] = 'mc.tipo = :tipo';
      $params[':tipo'] = $tipo;
    }

    if (!empty($includeIds)) {
      $phs = [];
      foreach ($includeIds as $i => $idInc) {
        $ph = ':inc_' . $i;
        $phs[] = $ph;
        $params[$ph] = $idInc;
      }
      $where[] = '(mc.activo = 1 OR mc.id_cheque IN (' . implode(',', $phs) . '))';
    } else {
      $where[] = 'mc.activo = 1';
    }

    $sql = "\n      SELECT\n        mc.id_cheque, mc.tipo, mc.id_movimiento,\n        CASE WHEN ca.id_comprobante IS NOT NULL THEN mc.id_comprobante ELSE NULL END AS id_comprobante,\n        mc.fecha_emision, mc.emisor, mc.numero_cheque, mc.importe,\n        mc.fecha_pago, mc.activo, mc.created_at, mc.updated_at,\n        COALESCE(ca.archivo_url, '') AS comprobante_url,\n        COALESCE(ca.archivo_path, '') AS comprobante_path\n      FROM movimientos_cheques mc\n      LEFT JOIN comprobantes_archivos ca\n        ON ca.id_comprobante = mc.id_comprobante\n       AND " . mov_global_cheques_where_tipo_comprobante_adjunto_sql('ca') . "\n      WHERE " . implode(' AND ', $where) . "\n      ORDER BY mc.fecha_pago ASC, mc.fecha_emision ASC, mc.id_cheque DESC\n    ";

    $st = $pdo->prepare($sql);
    foreach ($params as $k => $v) {
      $st->bindValue($k, $k === ':tipo' ? (string)$v : (int)$v, $k === ':tipo' ? PDO::PARAM_STR : PDO::PARAM_INT);
    }
    $st->execute();
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $includeMap = array_fill_keys($includeIds, true);
    return array_map(static function(array $r) use ($includeMap): array {
      $idCheque = (int)($r['id_cheque'] ?? 0);
      return [
        'id_cheque'           => $idCheque,
        'tipo'                => (string)($r['tipo'] ?? ''),
        'id_movimiento'       => (int)($r['id_movimiento'] ?? 0),
        'id_comprobante'      => $r['id_comprobante'] === null ? null : (int)$r['id_comprobante'],
        'fecha_emision'       => (string)($r['fecha_emision'] ?? ''),
        'emisor'              => (string)($r['emisor'] ?? ''),
        'numero_cheque'       => (string)($r['numero_cheque'] ?? ''),
        'importe'             => (float)($r['importe'] ?? 0),
        'fecha_pago'          => (string)($r['fecha_pago'] ?? ''),
        'activo'              => (int)($r['activo'] ?? 0),
        'seleccionado_actual' => isset($includeMap[$idCheque]),
        'comprobante_url'     => (string)($r['comprobante_url'] ?? ''),
        'comprobante_path'    => (string)($r['comprobante_path'] ?? ''),
        'created_at'          => (string)($r['created_at'] ?? ''),
        'updated_at'          => (string)($r['updated_at'] ?? ''),
      ];
    }, $rows);
  }
}

if (!function_exists('mov_global_cheques_cartera_listar')) {
  function mov_global_cheques_cartera_listar(PDO $pdo): void
  {
    try {
      $tipo = strtolower(trim((string)($_GET['tipo'] ?? $_POST['tipo'] ?? '')));
      $includeIds = mov_global_cheques_parse_id_list($_GET['include_ids'] ?? $_POST['include_ids'] ?? '');
      mov_global_cheques_ok([
        'cheques' => mov_global_cheques_cartera_rows($pdo, $tipo, $includeIds),
        'tipo' => $tipo,
        'include_ids' => $includeIds,
      ]);
    } catch (Throwable $e) {
      mov_global_cheques_fail('Error al listar cheques en cartera: ' . $e->getMessage(), 500);
    }
  }
}

if (!function_exists('mov_global_cheques_lock_disponibles')) {
  function mov_global_cheques_lock_disponibles(PDO $pdo, array $mediosValidados): array
  {
    $chequeIds = array_values(array_unique(array_filter(array_map('intval', array_column($mediosValidados, 'id_cheque')))));
    if (empty($chequeIds)) return [];

    $placeholders = implode(',', array_fill(0, count($chequeIds), '?'));
    $st = $pdo->prepare("\n      SELECT id_cheque, tipo, activo, numero_cheque, emisor, importe\n      FROM movimientos_cheques\n      WHERE id_cheque IN ($placeholders)\n      FOR UPDATE\n    ");
    $st->execute($chequeIds);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $mapa = [];
    foreach ($rows as $r) $mapa[(int)$r['id_cheque']] = $r;

    foreach ($mediosValidados as $idx => $mp) {
      if (($mp['id_cheque'] ?? null) === null) continue;
      $idCheque = (int)$mp['id_cheque'];
      if (!isset($mapa[$idCheque])) throw new RuntimeException("medios_pago[$idx]: el cheque $idCheque no existe.");
      $chequeRow = $mapa[$idCheque];
      if ((int)($chequeRow['activo'] ?? 0) !== 1) {
        throw new RuntimeException("medios_pago[$idx]: el cheque N° {$chequeRow['numero_cheque']} ya no está disponible en cartera.");
      }
      $tipoReal = mov_global_cheques_normalize_tipo($chequeRow['tipo'] ?? 'cheque');
      $tipoReq  = mov_global_cheques_normalize_tipo($mp['tipo_cheque'] ?? $tipoReal);
      if ($tipoReal !== $tipoReq) {
        throw new RuntimeException("medios_pago[$idx]: el cheque N° {$chequeRow['numero_cheque']} es de tipo \"$tipoReal\" pero el medio requiere \"$tipoReq\".");
      }
    }

    return $mapa;
  }
}

if (!function_exists('mov_global_cheques_dar_baja_multi')) {
  function mov_global_cheques_dar_baja_multi(PDO $pdo, array $mediosValidados): void
  {
    $chequeIds = array_values(array_unique(array_filter(array_map('intval', array_column($mediosValidados, 'id_cheque')))));
    foreach ($chequeIds as $idCheque) {
      $st = $pdo->prepare("UPDATE movimientos_cheques SET activo = 0 WHERE id_cheque = :id AND activo = 1 LIMIT 1");
      $st->execute([':id' => $idCheque]);
      if ($st->rowCount() <= 0) {
        throw new RuntimeException("No se pudo dar de baja el cheque ID $idCheque (ya fue usado o no existe).");
      }
    }
  }
}

if (!function_exists('mov_global_cheques_registrar_salida_flujo')) {
  function mov_global_cheques_registrar_salida_flujo(PDO $pdo, int $idMovimiento, array $mp, string $descripcion = ''): void
  {
    $idCheque = (int)($mp['id_cheque'] ?? 0);
    if ($idMovimiento <= 0 || $idCheque <= 0 || !mov_global_cheques_flujo_table_exists($pdo)) return;

    $stCheque = $pdo->prepare("
      SELECT id_cheque, tipo, importe, numero_cheque, emisor
      FROM movimientos_cheques
      WHERE id_cheque = :id_cheque
      LIMIT 1
    ");
    $stCheque->execute([':id_cheque' => $idCheque]);
    $chequeRow = $stCheque->fetch(PDO::FETCH_ASSOC) ?: [];

    $tipoCheque = mov_global_cheques_normalize_tipo($chequeRow['tipo'] ?? ($mp['tipo_cheque'] ?? 'cheque'));
    $importeRealCheque = (float)($chequeRow['importe'] ?? 0);
    if ($importeRealCheque <= 0) {
      $importeRealCheque = (float)($mp['cheque_importe'] ?? $mp['importe'] ?? $mp['monto'] ?? 0);
    }

    $numeroCheque = trim((string)($chequeRow['numero_cheque'] ?? $mp['numero_cheque'] ?? ''));
    $labelCheque = $tipoCheque === 'echeq' ? 'E-cheq' : 'Cheque';
    $labelNumero = $numeroCheque !== '' ? (' Nº ' . $numeroCheque) : (' ID ' . $idCheque);
    $descripcion = $descripcion !== ''
      ? $descripcion
      : $labelCheque . $labelNumero . ' aplicado al movimiento #' . $idMovimiento . '. Salió de cartera por el importe real del cheque.';

    $pdo->prepare("DELETE FROM movimientos_cheques_flujo WHERE id_cheque = :id_cheque AND id_movimiento = :id_movimiento AND (UPPER(COALESCE(evento,'')) IN ('BAJA','EGRESO_CARTERA') OR UPPER(COALESCE(evento,'')) LIKE 'EGRESO%')")
      ->execute([':id_cheque' => $idCheque, ':id_movimiento' => $idMovimiento]);

    $fechaEvento = mov_global_cheques_safe_date($mp['fecha_evento'] ?? $mp['fecha'] ?? null);
    if (!$fechaEvento) {
      $stFecha = $pdo->prepare("SELECT fecha FROM movimientos WHERE id_movimiento = :id LIMIT 1");
      $stFecha->execute([':id' => $idMovimiento]);
      $fechaEvento = mov_global_cheques_safe_date($stFecha->fetchColumn() ?: null);
    }
    if (!$fechaEvento) {
      throw new RuntimeException('La fecha de salida del cheque es obligatoria y debe venir del movimiento/modal.');
    }

    $st = $pdo->prepare("
      INSERT INTO movimientos_cheques_flujo
        (tipo_cheque, id_cheque, id_movimiento, evento, fecha_evento, importe, descripcion, usuario)
      VALUES
        (:tipo_cheque, :id_cheque, :id_movimiento, 'EGRESO_CARTERA', :fecha_evento, :importe, :descripcion, NULL)
    ");
    $st->execute([
      ':tipo_cheque' => $tipoCheque,
      ':id_cheque' => $idCheque,
      ':id_movimiento' => $idMovimiento,
      ':fecha_evento' => $fechaEvento,
      ':importe' => round($importeRealCheque, 2),
      ':descripcion' => $descripcion,
    ]);
  }
}

if (!function_exists('mov_global_cheques_reactivar_por_ids')) {
  function mov_global_cheques_reactivar_por_ids(PDO $pdo, array $chequeIds): void
  {
    $chequeIds = array_values(array_unique(array_filter(array_map('intval', $chequeIds))));
    if (empty($chequeIds)) return;
    $placeholders = implode(',', array_fill(0, count($chequeIds), '?'));
    $st = $pdo->prepare("UPDATE movimientos_cheques SET activo = 1 WHERE id_cheque IN ($placeholders)");
    foreach ($chequeIds as $i => $idCheque) $st->bindValue($i + 1, $idCheque, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('mov_global_cheques_liberar_vinculo_origen_en_medios_pago')) {
  function mov_global_cheques_liberar_vinculo_origen_en_medios_pago(PDO $pdo, array $chequeIds): void
  {
    $chequeIds = array_values(array_unique(array_filter(array_map('intval', $chequeIds))));
    if (empty($chequeIds)) return;
    $placeholders = implode(',', array_fill(0, count($chequeIds), '?'));
    $sql = "\n      UPDATE movimientos_medios_pago cmp\n      INNER JOIN movimientos_cheques ch ON ch.id_cheque = cmp.id_cheque\n      SET cmp.id_cheque = NULL\n      WHERE cmp.id_cheque IN ($placeholders)\n        AND cmp.id_movimiento = ch.id_movimiento\n    ";
    $st = $pdo->prepare($sql);
    foreach ($chequeIds as $i => $idCheque) $st->bindValue($i + 1, $idCheque, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('mov_global_cheques_depositados_listar')) {
  function mov_global_cheques_depositados_listar(PDO $pdo): void
  {
    try {
      $tipo = strtolower(trim((string)($_GET['tipo'] ?? $_POST['tipo'] ?? '')));
      if ($tipo !== '' && !in_array($tipo, ['cheque', 'echeq'], true)) throw new RuntimeException('Tipo de cheque inválido.');
      $limit = max(1, min(100, (int)($_GET['limit'] ?? 50)));
      $offset = max(0, (int)($_GET['offset'] ?? 0));
      $params = [];
      $whereTipoInner = '';
      $whereTipoOuter = '';
      if ($tipo !== '') {
        $whereTipoInner = ' AND tipo_cheque = :tipo_inner ';
        $whereTipoOuter = ' AND mc.tipo = :tipo_outer ';
      }
      $sql = "\n        SELECT f.id_flujo, mc.id_cheque, mc.id_movimiento, mc.tipo AS tipo_cheque, f.evento, f.fecha_evento,\n               mc.fecha_emision, mc.fecha_pago, mc.emisor, mc.numero_cheque, mc.importe, f.descripcion,\n               f.usuario, f.created_at, mc.activo, COALESCE(ca.archivo_url,'') AS comprobante_url,\n               COALESCE(ca.archivo_mime,'') AS archivo_mime\n        FROM movimientos_cheques_flujo f\n        INNER JOIN (\n          SELECT MAX(id_flujo) AS id_flujo\n          FROM movimientos_cheques_flujo\n          WHERE UPPER(COALESCE(evento,'')) IN ('DEPOSITADO_BANCO','DEPOSITO','DEPOSITO_BANCO','DEPOSITADO_EN_BANCO')\n          {$whereTipoInner}\n          GROUP BY id_cheque\n        ) ult ON ult.id_flujo = f.id_flujo\n        INNER JOIN movimientos_cheques mc ON mc.id_cheque = f.id_cheque\n        LEFT JOIN comprobantes_archivos ca ON ca.id_comprobante = mc.id_comprobante AND " . mov_global_cheques_where_tipo_comprobante_adjunto_sql('ca') . "\n        WHERE 1=1 {$whereTipoOuter}\n        ORDER BY f.fecha_evento DESC, f.id_flujo DESC\n        LIMIT :limit OFFSET :offset\n      ";
      $st = $pdo->prepare($sql);
      if ($tipo !== '') {
        $st->bindValue(':tipo_inner', $tipo, PDO::PARAM_STR);
        $st->bindValue(':tipo_outer', $tipo, PDO::PARAM_STR);
      }
      $st->bindValue(':limit', $limit, PDO::PARAM_INT);
      $st->bindValue(':offset', $offset, PDO::PARAM_INT);
      $st->execute();
      $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
      mov_global_cheques_ok(['modo' => 'depositados', 'tipo' => $tipo, 'cheques' => $rows, 'total_pagina' => count($rows)]);
    } catch (Throwable $e) {
      mov_global_cheques_fail('Error listando cheques depositados: ' . $e->getMessage(), 500);
    }
  }
}

/* =========================================================
   ROUTER GLOBAL + ALIASES DE ACCIONES VIEJAS
========================================================= */

if (!function_exists('route_mov_global_cheques_action')) {
  function route_mov_global_cheques_action(PDO $pdo, string $action): bool
  {
    $action = strtolower(trim((string)$action));
    switch ($action) {
      case 'mov_global_cheques_guardar':
        mov_global_cheques_guardar($pdo); return true;

      case 'mov_global_cheques_obtener':
        mov_global_cheques_obtener($pdo); return true;

      case 'mov_global_cheques_listar':
        mov_global_cheques_listar($pdo); return true;

      case 'mov_global_cheques_actualizar':
      case 'mov_global_cheques_editar':
        mov_global_cheques_actualizar($pdo); return true;

      case 'mov_global_cheques_eliminar':
        mov_global_cheques_eliminar($pdo); return true;

      case 'mov_global_cheques_verificar_numero':
        mov_global_cheques_verificar_numero($pdo); return true;

      case 'mov_global_cheques_cartera_listar':
        mov_global_cheques_cartera_listar($pdo); return true;

      case 'mov_global_cheques_depositados_listar':
        mov_global_cheques_depositados_listar($pdo); return true;

      case 'mov_global_cheques_comprobantes_descargar':
        mov_global_cheques_comprobantes_descargar($pdo); return true;

      default:
        return false;
    }
  }
}

/* =========================================================
   WRAPPERS COMPATIBLES PARA ROUTES ANTIGUAS
========================================================= */

if (!function_exists('ventas_cheques_verificar_numero')) { function ventas_cheques_verificar_numero(PDO $pdo): void { mov_global_cheques_verificar_numero($pdo); } }
if (!function_exists('ventas_cheques_guardar')) { function ventas_cheques_guardar(PDO $pdo): void { mov_global_cheques_guardar($pdo); } }
if (!function_exists('ventas_cheques_obtener')) { function ventas_cheques_obtener(PDO $pdo): void { mov_global_cheques_obtener($pdo); } }
if (!function_exists('ventas_cheques_listar')) { function ventas_cheques_listar(PDO $pdo): void { mov_global_cheques_listar($pdo); } }
if (!function_exists('ventas_cheques_actualizar')) { function ventas_cheques_actualizar(PDO $pdo): void { mov_global_cheques_actualizar($pdo); } }
if (!function_exists('ventas_cheques_eliminar')) { function ventas_cheques_eliminar(PDO $pdo): void { mov_global_cheques_eliminar($pdo); } }
if (!function_exists('ventas_cheques_comprobantes_descargar')) { function ventas_cheques_comprobantes_descargar(PDO $pdo): void { mov_global_cheques_comprobantes_descargar($pdo); } }

if (!function_exists('recibos_cheques_guardar')) { function recibos_cheques_guardar(PDO $pdo): void { mov_global_cheques_guardar($pdo); } }
if (!function_exists('recibos_cheques_obtener')) { function recibos_cheques_obtener(PDO $pdo): void { mov_global_cheques_obtener($pdo); } }
if (!function_exists('recibos_cheques_listar')) { function recibos_cheques_listar(PDO $pdo): void { mov_global_cheques_listar($pdo); } }
if (!function_exists('recibos_cheques_actualizar')) { function recibos_cheques_actualizar(PDO $pdo): void { mov_global_cheques_actualizar($pdo); } }
if (!function_exists('recibos_cheques_eliminar')) { function recibos_cheques_eliminar(PDO $pdo): void { mov_global_cheques_eliminar($pdo); } }
if (!function_exists('route_recibos_cheques_action')) { function route_recibos_cheques_action(PDO $pdo, string $action): bool { return route_mov_global_cheques_action($pdo, $action); } }

if (!function_exists('otros_ingresos_cheques_guardar')) { function otros_ingresos_cheques_guardar(PDO $pdo): void { mov_global_cheques_guardar($pdo); } }
if (!function_exists('otros_ingresos_cheques_obtener')) { function otros_ingresos_cheques_obtener(PDO $pdo): void { mov_global_cheques_obtener($pdo); } }
if (!function_exists('otros_ingresos_cheques_listar')) { function otros_ingresos_cheques_listar(PDO $pdo): void { mov_global_cheques_listar($pdo); } }
if (!function_exists('otros_ingresos_cheques_actualizar')) { function otros_ingresos_cheques_actualizar(PDO $pdo): void { mov_global_cheques_actualizar($pdo); } }
if (!function_exists('otros_ingresos_cheques_eliminar')) { function otros_ingresos_cheques_eliminar(PDO $pdo): void { mov_global_cheques_eliminar($pdo); } }

if (!function_exists('compras_cheques_cartera_listar')) { function compras_cheques_cartera_listar(PDO $pdo): void { mov_global_cheques_cartera_listar($pdo); } }
if (!function_exists('otros_egresos_cheques_cartera_listar')) { function otros_egresos_cheques_cartera_listar(PDO $pdo): void { mov_global_cheques_cartera_listar($pdo); } }
if (!function_exists('otros_egresos_cheques_depositados_listar')) { function otros_egresos_cheques_depositados_listar(PDO $pdo): void { mov_global_cheques_depositados_listar($pdo); } }


/* Wrappers internos para que compras / ordenes de pago / egresos usen la lógica global */
if (!function_exists('compra_lock_cheques_multi')) { function compra_lock_cheques_multi(PDO $pdo, array $mediosValidados): array { return mov_global_cheques_lock_disponibles($pdo, $mediosValidados); } }
if (!function_exists('compra_dar_baja_cheques_multi')) { function compra_dar_baja_cheques_multi(PDO $pdo, array $mediosValidados): void { mov_global_cheques_dar_baja_multi($pdo, $mediosValidados); } }
if (!function_exists('compra_registrar_flujo_salida_cheque')) { function compra_registrar_flujo_salida_cheque(PDO $pdo, int $idMovimiento, array $mp): void { mov_global_cheques_registrar_salida_flujo($pdo, $idMovimiento, $mp); } }
if (!function_exists('compra_reactivar_cheques_por_ids')) { function compra_reactivar_cheques_por_ids(PDO $pdo, array $chequeIds): void { mov_global_cheques_reactivar_por_ids($pdo, $chequeIds); } }
if (!function_exists('compra_liberar_vinculo_origen_cheques_en_medios_pago')) { function compra_liberar_vinculo_origen_cheques_en_medios_pago(PDO $pdo, array $chequeIds): void { mov_global_cheques_liberar_vinculo_origen_en_medios_pago($pdo, $chequeIds); } }

if (!function_exists('op_registrar_flujo_salida_cheque')) { function op_registrar_flujo_salida_cheque(PDO $pdo, int $idMovimiento, array $mp): void { mov_global_cheques_registrar_salida_flujo($pdo, $idMovimiento, $mp); } }
if (!function_exists('op_liberar_vinculo_origen_cheques_en_medios_pago')) { function op_liberar_vinculo_origen_cheques_en_medios_pago(PDO $pdo, array $chequeIds): void { mov_global_cheques_liberar_vinculo_origen_en_medios_pago($pdo, $chequeIds); } }

if (!function_exists('oe_lock_cheques_multi')) { function oe_lock_cheques_multi(PDO $pdo, array $mediosValidados): array { return mov_global_cheques_lock_disponibles($pdo, $mediosValidados); } }
if (!function_exists('oe_dar_baja_cheques_multi')) { function oe_dar_baja_cheques_multi(PDO $pdo, array $mediosValidados): void { mov_global_cheques_dar_baja_multi($pdo, $mediosValidados); } }
if (!function_exists('oe_registrar_flujo_salida_cheque')) { function oe_registrar_flujo_salida_cheque(PDO $pdo, int $idMovimiento, array $mp): void { mov_global_cheques_registrar_salida_flujo($pdo, $idMovimiento, $mp); } }
if (!function_exists('oe_reactivar_cheques_por_ids')) { function oe_reactivar_cheques_por_ids(PDO $pdo, array $idsCheque): void { mov_global_cheques_reactivar_por_ids($pdo, $idsCheque); } }
if (!function_exists('oe_liberar_vinculo_origen_cheques_en_medios_pago')) { function oe_liberar_vinculo_origen_cheques_en_medios_pago(PDO $pdo, array $chequeIds): void { mov_global_cheques_liberar_vinculo_origen_en_medios_pago($pdo, $chequeIds); } }

/* Helpers usados por otros_egresos/crud.php para armar columnas de comprobante */
if (!function_exists('oe_cheques_tipo_archivo_sql')) {
  function oe_cheques_tipo_archivo_sql(string $alias = 'ca'): string
  {
    $alias = preg_replace('/[^a-zA-Z0-9_]/', '', $alias);
    if ($alias === '') $alias = 'ca';
    return "UPPER(REPLACE(REPLACE(REPLACE(COALESCE({$alias}.tipo,''), ' ', ''), '-', ''), '_', '')) IN ('CHEQUE','ECHEQ','ECHEQUE')";
  }
}

if (!function_exists('oe_cheques_shared_comprobante_case_sql')) {
  function oe_cheques_shared_comprobante_case_sql(string $chequeAlias = 'mc'): string
  {
    $a = trim($chequeAlias) !== '' ? $chequeAlias : 'mc';
    $tipoSql = oe_cheques_tipo_archivo_sql('ca0');
    return "
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM comprobantes_archivos ca0
          WHERE ca0.id_comprobante = {$a}.id_comprobante
            AND {$tipoSql}
            AND (COALESCE(ca0.archivo_path, '') <> '' OR COALESCE(ca0.archivo_url, '') <> '')
          LIMIT 1
        ) THEN 1
        ELSE 0
      END
    ";
  }
}

if (!function_exists('oe_cheques_shared_comprobante_id_sql')) {
  function oe_cheques_shared_comprobante_id_sql(string $chequeAlias = 'mc'): string
  {
    $a = trim($chequeAlias) !== '' ? $chequeAlias : 'mc';
    $tipoSql = oe_cheques_tipo_archivo_sql('ca0');
    return "
      (
        SELECT ca0.id_comprobante
        FROM comprobantes_archivos ca0
        WHERE ca0.id_comprobante = {$a}.id_comprobante
          AND {$tipoSql}
          AND (COALESCE(ca0.archivo_path, '') <> '' OR COALESCE(ca0.archivo_url, '') <> '')
        LIMIT 1
      )
    ";
  }
}

if (!function_exists('oe_cheques_shared_comprobante_url_sql')) {
  function oe_cheques_shared_comprobante_url_sql(string $chequeAlias = 'mc'): string
  {
    $a = trim($chequeAlias) !== '' ? $chequeAlias : 'mc';
    $tipoSql = oe_cheques_tipo_archivo_sql('ca0');
    return "
      COALESCE((
        SELECT ca0.archivo_url
        FROM comprobantes_archivos ca0
        WHERE ca0.id_comprobante = {$a}.id_comprobante
          AND {$tipoSql}
          AND (COALESCE(ca0.archivo_path, '') <> '' OR COALESCE(ca0.archivo_url, '') <> '')
        LIMIT 1
      ), '')
    ";
  }
}

if (!function_exists('oe_cheques_shared_comprobante_mime_sql')) {
  function oe_cheques_shared_comprobante_mime_sql(string $chequeAlias = 'mc'): string
  {
    $a = trim($chequeAlias) !== '' ? $chequeAlias : 'mc';
    $tipoSql = oe_cheques_tipo_archivo_sql('ca0');
    return "
      COALESCE((
        SELECT ca0.archivo_mime
        FROM comprobantes_archivos ca0
        WHERE ca0.id_comprobante = {$a}.id_comprobante
          AND {$tipoSql}
          AND (COALESCE(ca0.archivo_path, '') <> '' OR COALESCE(ca0.archivo_url, '') <> '')
        LIMIT 1
      ), '')
    ";
  }
}
