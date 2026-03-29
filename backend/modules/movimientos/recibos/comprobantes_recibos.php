<?php
declare(strict_types=1);

if (!headers_sent()) {
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session, X-IdTenant, X-Id-Tenant, Range');
  header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

global $pdo;

require_once __DIR__ . '/../../utils/auditoria.php';

/* =========================================================
   Helpers compartidos
========================================================= */
if (!function_exists('ok')) {
  function ok(array $arr = []): void {
    echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('fail')) {
  function fail(string $msg, int $httpCode = 200, array $extra = []): void {
    http_response_code($httpCode);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
  }
}

if (!function_exists('read_json_body')) {
  function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('n_int')) {
  function n_int($v): ?int {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    $n = (int)$v;
    return $n >= 0 ? $n : null;
  }
}

if (!isset($pdo) || !($pdo instanceof PDO)) {
  fail('Conexión PDO no disponible (tenant no resuelto o sesión inválida).', 500);
}

/* =========================================================
   Auth / auditoría
========================================================= */
if (!function_exists('get_bearer_token')) {
  function get_bearer_token(): string {
    $h = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    elseif (!empty($_SERVER['Authorization'])) $h = (string)$_SERVER['Authorization'];

    $h = trim($h);
    if ($h === '') return '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return '';
  }
}

if (!function_exists('base64url_decode')) {
  function base64url_decode(string $s): string {
    $s = str_replace(['-', '_'], ['+', '/'], $s);
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
  }
}

if (!function_exists('get_id_usuario_from_request')) {
  function get_id_usuario_from_request(array $body = []): int {
    $token = get_bearer_token();
    if ($token !== '' && substr_count($token, '.') === 2) {
      $parts = explode('.', $token);
      $payloadJson = base64url_decode($parts[1] ?? '');
      if ($payloadJson !== '') {
        $payload = json_decode($payloadJson, true);
        if (is_array($payload)) {
          $candidates = [
            $payload['idUsuario'] ?? null,
            $payload['id_usuario'] ?? null,
            $payload['uid'] ?? null,
            $payload['sub'] ?? null,
          ];
          foreach ($candidates as $c) {
            if (is_numeric($c)) {
              $id = (int)$c;
              if ($id > 0) return $id;
            }
          }
        }
      }
    }

    $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
    if (is_numeric($id)) {
      $id = (int)$id;
      if ($id > 0) return $id;
    }
    return 0;
  }
}

if (!function_exists('audit_safe')) {
  function audit_safe(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
    if ($idUsuario <= 0) return;
    auditar($pdo, $idUsuario, 'recibos', $accion, $entidad, $idEntidad, $detalle);
  }
}

/* =========================================================
   Helpers recibos comprobantes
========================================================= */
if (!function_exists('recibos_comp_parse_ids_movimiento')) {
  function recibos_comp_parse_ids_movimiento(array $src): array
  {
    $ids = [];

    if (isset($src['ids_movimiento']) && is_array($src['ids_movimiento'])) {
      $ids = $src['ids_movimiento'];
    } elseif (isset($src['ids_movimientos']) && is_array($src['ids_movimientos'])) {
      $ids = $src['ids_movimientos'];
    } elseif (isset($src['ids_movimiento']) && is_string($src['ids_movimiento'])) {
      $raw = trim((string)$src['ids_movimiento']);
      if ($raw !== '') {
        $tmp = json_decode($raw, true);
        if (is_array($tmp)) {
          $ids = $tmp;
        } else {
          $ids = preg_split('/[\s,;]+/', $raw) ?: [];
        }
      }
    } elseif (isset($src['ids_movimientos']) && is_string($src['ids_movimientos'])) {
      $raw = trim((string)$src['ids_movimientos']);
      if ($raw !== '') {
        $tmp = json_decode($raw, true);
        if (is_array($tmp)) {
          $ids = $tmp;
        } else {
          $ids = preg_split('/[\s,;]+/', $raw) ?: [];
        }
      }
    }

    $idsOk = [];
    foreach ((array)$ids as $x) {
      $n = n_int($x);
      if ($n !== null && $n > 0) $idsOk[] = $n;
    }

    return array_values(array_unique($idsOk));
  }
}

if (!function_exists('recibos_comp_has_column')) {
  function recibos_comp_has_column(PDO $pdo, string $table, string $column): bool
  {
    try {
      $st = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE :c");
      $st->execute([':c' => $column]);
      return (bool)$st->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
      return false;
    }
  }
}

if (!function_exists('recibos_comp_is_https_request')) {
  function recibos_comp_is_https_request(): bool
  {
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    if (isset($_SERVER['SERVER_PORT']) && (string)$_SERVER['SERVER_PORT'] === '443') return true;
    $xfp = isset($_SERVER['HTTP_X_FORWARDED_PROTO']) ? (string)$_SERVER['HTTP_X_FORWARDED_PROTO'] : '';
    return strtolower($xfp) === 'https';
  }
}

if (!function_exists('recibos_comp_current_api_abs_url')) {
  function recibos_comp_current_api_abs_url(): string
  {
    $scheme = recibos_comp_is_https_request() ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';
    $script = isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '/api.php';

    return $scheme . '://' . $host . $script;
  }
}

if (!function_exists('recibos_comp_build_download_url')) {
  function recibos_comp_build_download_url(int $idComprobante): string
  {
    return recibos_comp_current_api_abs_url() . '?action=recibos_comprobantes_descargar&id_comprobante=' . (int)$idComprobante;
  }
}

if (!function_exists('recibos_comp_resolve_tenant_id_or_fail')) {
  function recibos_comp_resolve_tenant_id_or_fail(): int
  {
    $ses = isset($GLOBALS['SESSION_MASTER']) ? $GLOBALS['SESSION_MASTER'] : null;
    if (is_array($ses)) {
      $idT = isset($ses['idTenant']) ? (int)$ses['idTenant'] : 0;
      if ($idT > 0) return $idT;
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

    fail(
      'Tenant no resuelto. Llamá a este módulo a través de api.php con sesión válida.',
      401
    );
  }
}

if (!function_exists('recibos_comp_dirname_n')) {
  function recibos_comp_dirname_n(string $path, int $levels): string
  {
    $out = $path;
    for ($i = 0; $i < $levels; $i++) {
      $out = dirname($out);
    }
    return $out;
  }
}

if (!function_exists('recibos_comp_get_public_html_dir')) {
  function recibos_comp_get_public_html_dir(): string
  {
    $apiDir = realpath(recibos_comp_dirname_n(__DIR__, 3));
    if ($apiDir && is_dir($apiDir)) {
      $projectDir = realpath($apiDir . '/..');
      if ($projectDir && is_dir($projectDir)) {
        $publicHtml = realpath($projectDir . '/..');
        if ($publicHtml && is_dir($publicHtml)) return $publicHtml;
        return $projectDir;
      }
      return dirname($apiDir);
    }

    return recibos_comp_dirname_n(__DIR__, 5);
  }
}

if (!function_exists('recibos_comp_get_balto_private_dir')) {
  function recibos_comp_get_balto_private_dir(): string
  {
    $publicHtml = recibos_comp_get_public_html_dir();
    $homeDir = realpath($publicHtml . '/..');

    if ($homeDir && is_dir($homeDir . '/balto_private')) {
      $cand = realpath($homeDir . '/balto_private');
      if ($cand && is_dir($cand)) return $cand;
    }

    $apiDir = realpath(recibos_comp_dirname_n(__DIR__, 3));
    if ($apiDir) {
      $projectDir = realpath($apiDir . '/..');
      if ($projectDir) {
        $cand1 = realpath($projectDir . '/../balto_private');
        if ($cand1 && is_dir($cand1)) return $cand1;

        $cand2 = realpath($projectDir . '/../../balto_private');
        if ($cand2 && is_dir($cand2)) return $cand2;
      }
    }

    fail('No se encontró la carpeta balto_private.', 500, [
      'public_html' => $publicHtml,
    ]);
  }
}

if (!function_exists('recibos_comp_get_private_uploads_dir')) {
  function recibos_comp_get_private_uploads_dir(): string
  {
    $baltoPrivate = recibos_comp_get_balto_private_dir();
    $uploads = $baltoPrivate . '/uploads';

    if (!is_dir($uploads)) {
      fail('No existe la carpeta balto_private/uploads.', 500, [
        'balto_private' => $baltoPrivate,
        'uploads' => $uploads,
      ]);
    }

    return $uploads;
  }
}

if (!function_exists('recibos_comp_safe_mkdir')) {
  function recibos_comp_safe_mkdir(string $path): void
  {
    if (is_dir($path)) {
      if (!is_writable($path)) {
        fail('Carpeta existe pero no es writable.', 500, ['path' => $path]);
      }
      return;
    }

    if (!@mkdir($path, 0775, true) && !is_dir($path)) {
      fail('No se pudo crear carpeta.', 500, ['path' => $path]);
    }

    if (!is_writable($path)) {
      fail('Carpeta creada pero no es writable.', 500, ['path' => $path]);
    }
  }
}

if (!function_exists('recibos_comp_detect_real_mime')) {
  function recibos_comp_detect_real_mime(string $tmpPath, string $fallback = ''): string
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

if (!function_exists('recibos_comp_safe_extension_from_name')) {
  function recibos_comp_safe_extension_from_name(string $filename): string
  {
    $ext = strtolower((string)pathinfo($filename, PATHINFO_EXTENSION));
    $ext = preg_replace('/[^a-z0-9]+/', '', $ext);
    return $ext;
  }
}

if (!function_exists('recibos_comp_ext_from_mime')) {
  function recibos_comp_ext_from_mime(string $mime): string
  {
    $map = [
      'application/pdf' => 'pdf',
      'image/jpeg' => 'jpg',
      'image/jpg' => 'jpg',
      'image/png' => 'png',
      'image/webp' => 'webp',
      'image/gif' => 'gif',
      'text/plain' => 'txt',
      'text/csv' => 'csv',
    ];
    $mime = strtolower(trim($mime));
    return $map[$mime] ?? 'bin';
  }
}

if (!function_exists('recibos_comp_normalize_rel_from_private_uploads')) {
  function recibos_comp_normalize_rel_from_private_uploads(string $abs, string $uploadsBase): string
  {
    $abs = str_replace('\\', '/', $abs);
    $uploadsBase = rtrim(str_replace('\\', '/', $uploadsBase), '/');

    if (strpos($abs, $uploadsBase . '/') === 0) {
      return 'uploads/' . ltrim(substr($abs, strlen($uploadsBase)), '/');
    }

    return ltrim($abs, '/');
  }
}

if (!function_exists('recibos_comp_normalize_db_rel_path')) {
  function recibos_comp_normalize_db_rel_path(string $path): string
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

if (!function_exists('recibos_comp_is_inside')) {
  function recibos_comp_is_inside(string $path, string $baseDir): bool
  {
    $pathReal = realpath($path);
    $baseReal = realpath($baseDir);
    if (!$pathReal || !$baseReal) return false;

    $pathReal = rtrim(str_replace('\\', '/', $pathReal), '/');
    $baseReal = rtrim(str_replace('\\', '/', $baseReal), '/');

    return (strpos($pathReal, $baseReal . '/') === 0 || $pathReal === $baseReal);
  }
}

/* =========================================================
   DB helpers
========================================================= */
if (!function_exists('recibos_comp_comprobante_exists')) {
  function recibos_comp_comprobante_exists(PDO $pdo, int $idComprobante): bool
  {
    $st = $pdo->prepare("
      SELECT id_comprobante
      FROM comprobantes_archivos
      WHERE id_comprobante = :id
      LIMIT 1
    ");
    $st->execute([':id' => $idComprobante]);
    return (bool)$st->fetch(PDO::FETCH_ASSOC);
  }
}

if (!function_exists('recibos_comp_get_last_cobro_by_movimiento')) {
  function recibos_comp_get_last_cobro_by_movimiento(PDO $pdo, int $idMovimiento): ?array
  {
    $st = $pdo->prepare("
      SELECT id_cobro, id_movimiento, id_comprobante, fecha_cobro, monto
      FROM cobros
      WHERE id_movimiento = :idMov
      ORDER BY id_cobro DESC
      LIMIT 1
      FOR UPDATE
    ");
    $st->execute([':idMov' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('recibos_comp_get_cobro_by_id')) {
  function recibos_comp_get_cobro_by_id(PDO $pdo, int $idCobro): ?array
  {
    $st = $pdo->prepare("
      SELECT id_cobro, id_movimiento, id_comprobante, fecha_cobro, monto
      FROM cobros
      WHERE id_cobro = :idCobro
      LIMIT 1
      FOR UPDATE
    ");
    $st->execute([':idCobro' => $idCobro]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('recibos_comp_registrar_archivo')) {
  function recibos_comp_registrar_archivo(PDO $pdo, int $tenantId, array $file): array
  {
    $err = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($err !== UPLOAD_ERR_OK) {
      throw new Exception('Error al subir archivo (UPLOAD_ERR=' . $err . ').');
    }

    $tmp = isset($file['tmp_name']) ? (string)$file['tmp_name'] : '';
    if ($tmp === '' || !is_file($tmp)) {
      throw new Exception('Archivo temporal inválido.');
    }

    $origName = isset($file['name']) ? (string)$file['name'] : 'recibo.bin';
    $mimeBrowser = isset($file['type']) ? (string)$file['type'] : '';
    $mime = recibos_comp_detect_real_mime($tmp, $mimeBrowser);
    $size = isset($file['size']) ? (int)$file['size'] : 0;

    $ext = recibos_comp_safe_extension_from_name($origName);
    if ($ext === '') $ext = recibos_comp_ext_from_mime($mime);
    if ($ext === '') $ext = 'bin';

    $sha = hash_file('sha256', $tmp);
    if (!$sha) {
      throw new Exception('No se pudo calcular hash del archivo.');
    }

    $uploadsBase = recibos_comp_get_private_uploads_dir();
    recibos_comp_safe_mkdir($uploadsBase);

    $tenantDir = $uploadsBase
      . '/tenants/t_' . (int)$tenantId
      . '/comprobantes/' . date('Y')
      . '/' . date('m')
      . '/recibo';

    recibos_comp_safe_mkdir($tenantDir);

    $finalName = 'recibo__' . $sha . '.' . $ext;
    $absPath = $tenantDir . '/' . $finalName;

    $moved = false;
    if (is_uploaded_file($tmp) && @move_uploaded_file($tmp, $absPath)) {
      $moved = true;
    } elseif (@rename($tmp, $absPath)) {
      $moved = true;
    } elseif (@copy($tmp, $absPath)) {
      $moved = true;
      @unlink($tmp);
    }

    if (!$moved || !is_file($absPath) || (int)filesize($absPath) <= 0) {
      throw new Exception('No se pudo guardar el archivo en el servidor.');
    }

    $relPath = recibos_comp_normalize_rel_from_private_uploads($absPath, $uploadsBase);

    $pdo->prepare("
      INSERT INTO comprobantes_archivos
        (tipo, archivo_url, archivo_path, archivo_mime, archivo_size, sha256, emitido_en_arca)
      VALUES
        (:tipo, :url, :path, :mime, :size, :sha, 0)
    ")->execute([
      ':tipo' => 'RECIBO',
      ':url' => '',
      ':path' => $relPath,
      ':mime' => ($mime !== '' ? $mime : 'application/octet-stream'),
      ':size' => max(0, $size),
      ':sha' => $sha,
    ]);

    $idComp = (int)$pdo->lastInsertId();
    if ($idComp <= 0) {
      @unlink($absPath);
      throw new Exception('No se pudo obtener id_comprobante.');
    }

    $realUrl = recibos_comp_build_download_url($idComp);

    $pdo->prepare("
      UPDATE comprobantes_archivos
      SET archivo_url = :u
      WHERE id_comprobante = :id
      LIMIT 1
    ")->execute([
      ':u' => $realUrl,
      ':id' => $idComp,
    ]);

    return [
      'id_comprobante' => $idComp,
      'archivo_url' => $realUrl,
      'archivo_path' => $relPath,
      'sha256' => $sha,
      'filename' => $finalName,
      'tipo' => 'RECIBO',
      'archivo_mime' => ($mime !== '' ? $mime : 'application/octet-stream'),
      'archivo_size' => max(0, $size),
    ];
  }
}

if (!function_exists('recibos_comp_asociar_id_cobro')) {
  function recibos_comp_asociar_id_cobro(PDO $pdo, int $idCobro, int $idComprobante, bool $force = false): array
  {
    if ($idCobro <= 0) {
      throw new Exception('id_cobro inválido.');
    }
    if ($idComprobante <= 0) {
      throw new Exception('id_comprobante inválido.');
    }

    $cobro = recibos_comp_get_cobro_by_id($pdo, $idCobro);
    if (!$cobro) {
      throw new Exception('No existe el cobro #' . $idCobro . '.');
    }

    $prevComp = isset($cobro['id_comprobante']) ? (int)$cobro['id_comprobante'] : 0;
    if ($prevComp > 0 && $prevComp !== $idComprobante && !$force) {
      throw new Exception(
        'El cobro #' . $idCobro . ' ya tiene un comprobante asociado (' . $prevComp . '). Usá force=true para reemplazar.'
      );
    }

    $pdo->prepare("
      UPDATE cobros
      SET id_comprobante = :idComp
      WHERE id_cobro = :idCobro
      LIMIT 1
    ")->execute([
      ':idComp' => $idComprobante,
      ':idCobro' => $idCobro,
    ]);

    if (recibos_comp_has_column($pdo, 'comprobantes_archivos', 'id_cobro')) {
      $pdo->prepare("
        UPDATE comprobantes_archivos
        SET id_cobro = :idCobro
        WHERE id_comprobante = :idComp
        LIMIT 1
      ")->execute([
        ':idCobro' => $idCobro,
        ':idComp' => $idComprobante,
      ]);
    }

    return [
      'id_cobro' => (int)$cobro['id_cobro'],
      'id_movimiento' => (int)$cobro['id_movimiento'],
      'id_comprobante' => $idComprobante,
      'reemplazo' => ($prevComp > 0 && $prevComp !== $idComprobante),
      'id_comprobante_anterior' => ($prevComp > 0 ? $prevComp : null),
      'ya_existia' => ($prevComp === $idComprobante),
    ];
  }
}

if (!function_exists('recibos_comp_asociar_a_movimientos')) {
  function recibos_comp_asociar_a_movimientos(PDO $pdo, int $idComprobante, array $idsMovimiento, bool $force = false): array
  {
    if ($idComprobante <= 0) {
      throw new Exception('id_comprobante inválido.');
    }

    if (!recibos_comp_comprobante_exists($pdo, $idComprobante)) {
      throw new Exception('El id_comprobante no existe.');
    }

    $ids = [];
    foreach ($idsMovimiento as $x) {
      $n = n_int($x);
      if ($n !== null && $n > 0) $ids[] = $n;
    }
    $ids = array_values(array_unique($ids));

    if (!$ids) {
      throw new Exception('No llegaron ids_movimiento válidos.');
    }

    $asociados = [];
    foreach ($ids as $idMov) {
      $cobro = recibos_comp_get_last_cobro_by_movimiento($pdo, (int)$idMov);
      if (!$cobro) {
        throw new Exception('El movimiento #' . (int)$idMov . ' todavía no tiene cobros para asociar.');
      }

      $asociados[] = recibos_comp_asociar_id_cobro(
        $pdo,
        (int)$cobro['id_cobro'],
        $idComprobante,
        $force
      );
    }

    return [
      'id_comprobante' => $idComprobante,
      'ids_movimiento' => $ids,
      'asociados' => $asociados,
    ];
  }
}

/* =========================================================
   ACTIONS
========================================================= */
if (!function_exists('recibos_comprobantes_subir')) {
  function recibos_comprobantes_subir(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = get_id_usuario_from_request($src);

    $file = $_FILES['archivo'] ?? $_FILES['pdf'] ?? null;
    if (!$file) {
      fail('Falta archivo adjunto (campo "archivo" o "pdf").', 400);
    }

    $tenantId = recibos_comp_resolve_tenant_id_or_fail();
    $force = !empty($src['force']);

    $idsMovimiento = recibos_comp_parse_ids_movimiento($_POST ?: []);
    if (!$idsMovimiento && !empty($body)) {
      $idsMovimiento = recibos_comp_parse_ids_movimiento($body);
    }

    $idCobro = n_int($_POST['id_cobro'] ?? ($src['id_cobro'] ?? null));
    if ($idCobro !== null && $idCobro <= 0) $idCobro = null;

    try {
      $pdo->beginTransaction();

      $reg = recibos_comp_registrar_archivo($pdo, $tenantId, $file);

      $asociacion = null;
      if (!empty($idsMovimiento)) {
        $asociacion = recibos_comp_asociar_a_movimientos(
          $pdo,
          (int)$reg['id_comprobante'],
          $idsMovimiento,
          $force
        );
      } elseif ($idCobro !== null && $idCobro > 0) {
        $asoUno = recibos_comp_asociar_id_cobro(
          $pdo,
          $idCobro,
          (int)$reg['id_comprobante'],
          $force
        );
        $asociacion = [
          'id_comprobante' => (int)$reg['id_comprobante'],
          'ids_movimiento' => [(int)$asoUno['id_movimiento']],
          'asociados' => [$asoUno],
        ];
      }

      $pdo->commit();

      audit_safe($pdo, $idUsuario, 'subir_comprobante', 'comprobantes_archivos', (int)$reg['id_comprobante'], [
        'modulo' => 'recibos',
        'archivo' => $reg,
        'asociacion' => $asociacion,
      ]);

      ok([
        'mensaje' => 'Comprobante de recibo guardado correctamente.',
        'id_comprobante' => (int)$reg['id_comprobante'],
        'archivo_url' => (string)$reg['archivo_url'],
        'archivo_path' => (string)$reg['archivo_path'],
        'sha256' => (string)$reg['sha256'],
        'filename' => (string)$reg['filename'],
        'tipo' => 'RECIBO',
        'archivo_mime' => (string)$reg['archivo_mime'],
        'archivo_size' => (int)$reg['archivo_size'],
        'asociacion' => $asociacion,
        'ids_movimiento' => $asociacion['ids_movimiento'] ?? $idsMovimiento,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo subir el comprobante del recibo. ' . $e->getMessage(), 500);
    }
  }
}

if (!function_exists('recibos_comprobantes_asociar_movimiento')) {
  function recibos_comprobantes_asociar_movimiento(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = get_id_usuario_from_request($src);

    $idComp = n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $idMov  = n_int($src['id_movimiento'] ?? null);
    $force  = !empty($src['force']);

    if (!$idComp || $idComp <= 0) fail('Falta id_comprobante.', 400);
    if (!$idMov || $idMov <= 0) fail('Falta id_movimiento.', 400);

    try {
      $pdo->beginTransaction();

      $res = recibos_comp_asociar_a_movimientos($pdo, $idComp, [$idMov], $force);

      $pdo->commit();

      audit_safe($pdo, $idUsuario, 'asociar_comprobante', 'comprobantes_archivos', $idComp, [
        'modulo' => 'recibos',
        'id_movimiento' => $idMov,
        'resultado' => $res,
      ]);

      ok($res);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo asociar el comprobante del recibo. ' . $e->getMessage(), 500);
    }
  }
}

if (!function_exists('recibos_comprobantes_asociar_movimientos')) {
  function recibos_comprobantes_asociar_movimientos(PDO $pdo): void
  {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Método no permitido.', 405);

    $body = read_json_body();
    $src = !empty($body) ? $body : ($_POST ?? []);
    $idUsuario = get_id_usuario_from_request($src);

    $idComp = n_int($src['id_comprobante'] ?? ($src['idComp'] ?? null));
    $force  = !empty($src['force']);
    $ids = recibos_comp_parse_ids_movimiento($src);

    if (!$idComp || $idComp <= 0) fail('Falta id_comprobante.', 400);
    if (!$ids) fail('Faltan ids_movimiento.', 400);

    try {
      $pdo->beginTransaction();

      $res = recibos_comp_asociar_a_movimientos($pdo, $idComp, $ids, $force);

      $pdo->commit();

      audit_safe($pdo, $idUsuario, 'asociar_comprobante_lote', 'comprobantes_archivos', $idComp, [
        'modulo' => 'recibos',
        'ids_movimiento' => $ids,
        'resultado' => $res,
      ]);

      ok($res);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) $pdo->rollBack();
      fail('No se pudo asociar el comprobante del recibo al lote. ' . $e->getMessage(), 500);
    }
  }
}

if (!function_exists('recibos_comprobantes_info')) {
  function recibos_comprobantes_info(PDO $pdo): void
  {
    $id = $_GET['id_comprobante'] ?? ($_GET['id'] ?? '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
      fail('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
      $st = $pdo->prepare("
        SELECT *
        FROM comprobantes_archivos
        WHERE id_comprobante = :id
          AND UPPER(tipo) = 'RECIBO'
        LIMIT 1
      ");
      $st->execute([':id' => $id]);
      $row = $st->fetch(PDO::FETCH_ASSOC);

      if (!$row) {
        fail('Comprobante de recibo no encontrado.', 404);
      }

      $stCob = $pdo->prepare("
        SELECT
          c.id_cobro,
          c.id_movimiento,
          c.fecha_cobro,
          c.monto,
          c.id_medio_pago
        FROM cobros c
        WHERE c.id_comprobante = :id
        ORDER BY c.id_cobro DESC
      ");
      $stCob->execute([':id' => $id]);
      $cobros = $stCob->fetchAll(PDO::FETCH_ASSOC) ?: [];

      ok([
        'data' => $row,
        'cobros' => $cobros,
      ]);
    } catch (Throwable $e) {
      fail('Error obteniendo info del comprobante de recibo. ' . $e->getMessage(), 500);
    }
  }
}

if (!function_exists('recibos_comprobantes_descargar')) {
  function recibos_comprobantes_descargar(PDO $pdo): void
  {
    $id = $_GET['id_comprobante'] ?? ($_GET['id'] ?? '');
    $id = is_string($id) ? trim($id) : '';

    if ($id === '' || !ctype_digit($id) || (int)$id <= 0) {
      fail('Falta id_comprobante válido.', 400);
    }
    $id = (int)$id;

    try {
      $st = $pdo->prepare("
        SELECT id_comprobante, archivo_path, archivo_url, archivo_mime, tipo
        FROM comprobantes_archivos
        WHERE id_comprobante = :id
          AND UPPER(tipo) = 'RECIBO'
        LIMIT 1
      ");
      $st->execute([':id' => $id]);
      $row = $st->fetch(PDO::FETCH_ASSOC);

      if (!$row) {
        fail('Comprobante de recibo no encontrado.', 404);
      }

      $uploadsBase = recibos_comp_get_private_uploads_dir();

      $rel = isset($row['archivo_path']) ? (string)$row['archivo_path'] : '';
      if ($rel === '') {
        $rel = isset($row['archivo_url']) ? (string)$row['archivo_url'] : '';
      }

      $rel = recibos_comp_normalize_db_rel_path($rel);

      if ($rel === '') {
        fail('Comprobante sin ruta.', 500);
      }

      if (strpos($rel, 'uploads/') === 0) {
        $relWithoutUploads = substr($rel, strlen('uploads/'));
      } else {
        $relWithoutUploads = ltrim($rel, '/');
      }

      $abs = rtrim($uploadsBase, '/') . '/' . $relWithoutUploads;

      if (!is_file($abs)) {
        fail('Archivo no existe en disco.', 404, [
          'abs' => $abs,
          'rel' => $rel,
          'uploadsBase' => $uploadsBase,
        ]);
      }

      if (!recibos_comp_is_inside($abs, $uploadsBase)) {
        fail('Ruta inválida.', 403, [
          'abs' => $abs,
          'uploadsBase' => $uploadsBase,
        ]);
      }

      $mime = isset($row['archivo_mime']) ? (string)$row['archivo_mime'] : 'application/octet-stream';
      if ($mime === '') $mime = 'application/octet-stream';

      $filesize = (int)filesize($abs);
      $ext = strtolower((string)pathinfo($abs, PATHINFO_EXTENSION));
      if ($ext === '') $ext = 'bin';

      $filename = 'recibo_' . $id . '.' . $ext;

      if (!headers_sent()) {
        header('Content-Type: ' . $mime);
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Accept-Ranges: bytes');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
      }

      $range = isset($_SERVER['HTTP_RANGE']) ? (string)$_SERVER['HTTP_RANGE'] : '';
      if ($range && preg_match('/bytes=(\d+)-(\d*)/i', $range, $m)) {
        $start = (int)$m[1];
        $end = ($m[2] !== '') ? (int)$m[2] : ($filesize - 1);

        if ($end >= $filesize) $end = $filesize - 1;
        if ($start < 0) $start = 0;

        if ($start > $end) {
          http_response_code(416);
          exit;
        }

        $length = $end - $start + 1;

        if (!headers_sent()) {
          header('Content-Range: bytes ' . $start . '-' . $end . '/' . $filesize);
          header('Content-Length: ' . $length);
        }

        http_response_code(206);

        $fh = fopen($abs, 'rb');
        if ($fh === false) exit;

        fseek($fh, $start);

        $buf = 8192;
        $remaining = $length;
        while ($remaining > 0 && !feof($fh)) {
          $read = ($remaining > $buf) ? $buf : $remaining;
          $data = fread($fh, $read);
          if ($data === false) break;
          echo $data;
          $remaining -= strlen($data);
        }
        fclose($fh);
        exit;
      }

      if (!headers_sent()) {
        header('Content-Length: ' . $filesize);
      }

      readfile($abs);
      exit;
    } catch (Throwable $e) {
      fail('Error al descargar comprobante de recibo. ' . $e->getMessage(), 500);
    }
  }
}

/* =========================================================
   ROUTE COMPROBANTES RECIBOS
========================================================= */
if (!function_exists('route_recibos_comprobantes_action')) {
  function route_recibos_comprobantes_action(PDO $pdo, string $action): bool
  {
    $action = strtolower(trim((string)$action));

    switch ($action) {
      case 'recibos_comprobantes_subir':
      case 'recibos_comprobantes_vincular_movimientos_lote_upload':
        recibos_comprobantes_subir($pdo);
        return true;

      case 'recibos_comprobantes_asociar_movimiento':
      case 'recibos_comprobantes_vincular_movimiento':
      case 'recibos_comprobantes_vincular_movimiento_json':
        recibos_comprobantes_asociar_movimiento($pdo);
        return true;

      case 'recibos_comprobantes_asociar_movimientos':
      case 'recibos_comprobantes_vincular_movimientos':
      case 'recibos_comprobantes_vincular_movimientos_lote':
        recibos_comprobantes_asociar_movimientos($pdo);
        return true;

      case 'recibos_comprobantes_info':
        recibos_comprobantes_info($pdo);
        return true;

      case 'recibos_comprobantes_descargar':
        recibos_comprobantes_descargar($pdo);
        return true;

      default:
        return false;
    }
  }
}

if (!defined('MOVIMIENTOS_RECIBOS_ROUTE_BOOTSTRAP')) {
  $action = $_GET['action'] ?? $_POST['action'] ?? '';
  $action = strtolower(trim((string)$action));

  if ($action === '') fail('Falta parámetro action.');

  try {
    if (!route_recibos_comprobantes_action($pdo, $action)) {
      fail('Acción no válida en comprobantes_recibos: ' . $action);
    }
  } catch (Throwable $e) {
    fail('Error en comprobantes_recibos: ' . $e->getMessage(), 500);
  }
}