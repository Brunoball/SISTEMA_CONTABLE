<?php
// backend/modules/global/usuario_tema_actualizar.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

function ok(array $arr): void {
  echo json_encode($arr, JSON_UNESCAPED_UNICODE);
  exit;
}

function fail(string $msg, int $httpCode = 400, array $extra = []): void {
  http_response_code($httpCode);
  echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
  exit;
}

function getHeader(string $name): string {
  $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
  $v = $_SERVER[$key] ?? '';
  return trim((string)$v);
}

/**
 * ✅ Carga dotenv (putenv) SOLO si falta MASTER_DB_PASS en getenv()
 * Root: backend/
 */
function ensureDotenvLoaded(): void {
  $p = getenv('MASTER_DB_PASS');
  if ($p !== false && trim((string)$p) !== '') return;

  $root = realpath(__DIR__ . '/../../'); // backend/
  if (!$root) return;

  $envFile = $root . DIRECTORY_SEPARATOR . '.env';
  if (!file_exists($envFile)) return;

  $autoload = $root . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';
  if (!file_exists($autoload)) return;

  require_once $autoload;

  if (class_exists(\Dotenv\Dotenv::class)) {
    try {
      $dotenv = \Dotenv\Dotenv::createUnsafeImmutable($root);
      $dotenv->load();
    } catch (Throwable $e) {
      return;
    }
  }
}

/**
 * ✅ Lee JSON o FORM
 */
function readInput(): array {
  $raw = file_get_contents('php://input') ?: '';
  $data = json_decode($raw, true);
  if (is_array($data)) return $data;
  return is_array($_POST ?? null) ? $_POST : [];
}

/**
 * ✅ Detecta si existe una tabla en la DB actual
 */
function tableExists(PDO $pdo, string $table): bool {
  $st = $pdo->prepare("
    SELECT 1
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = :t
    LIMIT 1
  ");
  $st->execute([':t' => $table]);
  return (bool)$st->fetchColumn();
}

/**
 * ✅ Devuelve lista de columnas de una tabla
 */
function tableColumns(PDO $pdo, string $table): array {
  $st = $pdo->prepare("
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = :t
  ");
  $st->execute([':t' => $table]);
  $cols = [];
  while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
    $cols[] = (string)$r['COLUMN_NAME'];
  }
  return $cols;
}

/**
 * ✅ Resolver id usuario desde sesión (X-Session) en DB master (best-effort)
 */
function resolveUserIdFromSession(PDO $pdo_master, string $sessionKey): int {
  if ($sessionKey === '') return 0;

  $table = 'sesiones';
  if (!tableExists($pdo_master, $table)) return 0;

  $cols = tableColumns($pdo_master, $table);
  $colsLower = array_map('strtolower', $cols);

  $colSession = null;
  foreach (['session_key', 'session', 'token', 'sessionkey'] as $c) {
    if (in_array($c, $colsLower, true)) { $colSession = $cols[array_search($c, $colsLower, true)]; break; }
  }
  if (!$colSession) return 0;

  $colUser = null;
  foreach (['idusuariomaster', 'usuario_id', 'id_usuario', 'idusuario', 'iduser'] as $c) {
    if (in_array($c, $colsLower, true)) { $colUser = $cols[array_search($c, $colsLower, true)]; break; }
  }
  if (!$colUser) return 0;

  $sql = "SELECT {$colUser} AS uid FROM {$table} WHERE {$colSession} = :sk LIMIT 1";
  $st = $pdo_master->prepare($sql);
  $st->execute([':sk' => $sessionKey]);
  $uid = (int)($st->fetchColumn() ?: 0);

  return $uid > 0 ? $uid : 0;
}

/**
 * ✅ Carga db_master.php de forma segura SIN tocarlo:
 * - Si ya existe $pdo_master global, lo usa
 * - Si no existe, lo "re-ejecuta" con require (NO require_once)
 */
function loadMasterPdoOrFail(): PDO {
  // 1) si ya quedó creado en algún lado, usarlo
  if (isset($GLOBALS['pdo_master']) && $GLOBALS['pdo_master'] instanceof PDO) {
    return $GLOBALS['pdo_master'];
  }
  if (isset($GLOBALS['pdo_master']) && $GLOBALS['pdo_master'] instanceof PDO) {
    return $GLOBALS['pdo_master'];
  }

  // 2) ruta a db_master.php
  $masterPath = __DIR__ . '/../../config/db_master.php';
  if (!file_exists($masterPath)) {
    fail('No existe config/db_master.php', 500, ['path' => $masterPath]);
  }

  // ✅ CLAVE: usar require (NO once) para que ejecute y defina $pdo_master en ESTE scope,
  // incluso si ya se incluyó antes en otro lado.
  require $masterPath;

  // 3) debería existir $pdo_master ahora
  if (isset($pdo_master) && $pdo_master instanceof PDO) {
    // guardarlo en $GLOBALS para próximas llamadas
    $GLOBALS['pdo_master'] = $pdo_master;
    return $pdo_master;
  }

  // 4) último intento: si db_master.php define $pdo_master en global pero no en scope
  if (isset($GLOBALS['pdo_master']) && $GLOBALS['pdo_master'] instanceof PDO) {
    return $GLOBALS['pdo_master'];
  }

  fail('Conexión MASTER no disponible: $pdo_master no está definido en db_master.php', 500);
  // unreachable
  throw new RuntimeException('unreachable');
}

try {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Método no permitido.', 405);
  }

  $data = readInput();
  $tema = strtolower(trim((string)($data['tema'] ?? '')));

  if (!in_array($tema, ['claro', 'oscuro'], true)) {
    fail('Tema inválido. Use claro u oscuro.', 400);
  }

  // ✅ 1) asegurar dotenv
  ensureDotenvLoaded();

  // ✅ 2) validar pass master (tu db_master ya lo requiere)
  $pass = getenv('MASTER_DB_PASS');
  if ($pass === false || trim((string)$pass) === '') {
    fail('Falta MASTER_DB_PASS en el entorno (.env no cargó o no existe).', 500, [
      'debug' => [
        'MASTER_DB_PASS' => 'VACIO/NO_DEFINIDO',
        'hint' => 'Verificá backend/.env y vendor/autoload.php en backend/vendor.',
      ],
    ]);
  }

  // ✅ 3) conectar MASTER (sin tocar db_master.php)
  $pdo_master = loadMasterPdoOrFail();
  $pdo_master->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo_master->exec("SET NAMES utf8mb4");

  // ✅ 4) validar DB actual (opcional pero útil)
  $expectedDb = getenv('MASTER_DB_NAME');
  $expectedDb = (string)($expectedDb && trim((string)$expectedDb) !== '' ? $expectedDb : 'balto_master');
  $dbActual = (string)$pdo_master->query("SELECT DATABASE()")->fetchColumn();
  if ($dbActual === '') fail('No se pudo determinar la base actual (SELECT DATABASE()).', 500);

  if (strcasecmp($dbActual, $expectedDb) !== 0) {
    fail('La conexión MASTER está apuntando a otra base. Revisá MASTER_DB_NAME.', 500, [
      'debug' => [
        'db_actual'   => $dbActual,
        'db_esperada' => $expectedDb,
      ],
    ]);
  }

  // ✅ 5) resolver usuario por sesión
  $sessionKey = getHeader('X-Session');
  $idFromSession = resolveUserIdFromSession($pdo_master, $sessionKey);

  // ✅ legacy (si querés mantenerlo por ahora)
  $idBody = (int)($data['idUsuarioMaster'] ?? $data['idUsuario'] ?? 0);

  $idUsuarioMaster = 0;
  if ($idFromSession > 0) {
    if ($idBody > 0 && $idBody !== $idFromSession) {
      fail('No autorizado: el usuario no coincide con la sesión.', 401, [
        'debug' => [
          'id_body'    => $idBody,
          'id_session' => $idFromSession,
        ],
      ]);
    }
    $idUsuarioMaster = $idFromSession;
  } else {
    if ($idBody <= 0) {
      fail('No autorizado: falta X-Session válida (o idUsuarioMaster para modo legacy).', 401, [
        'debug' => [
          'X-Session' => ($sessionKey !== '' ? 'PRESENTE_PERO_INVALIDA' : 'AUSENTE'),
          'hint' => 'Recomendado: enviar X-Session y NO mandar id por body.',
        ],
      ]);
    }
    $idUsuarioMaster = $idBody;
  }

  // ✅ 6) update
  $TABLE = 'usuarios_master';

  $chk = $pdo_master->prepare("SELECT idUsuarioMaster FROM {$TABLE} WHERE idUsuarioMaster = :id LIMIT 1");
  $chk->execute([':id' => $idUsuarioMaster]);
  if (!(int)$chk->fetchColumn()) {
    fail('Usuario master no encontrado.', 404);
  }

  $upd = $pdo_master->prepare("UPDATE {$TABLE} SET tema = :tema WHERE idUsuarioMaster = :id");
  $upd->execute([':tema' => $tema, ':id' => $idUsuarioMaster]);

  ok([
    'exito' => true,
    'tema' => $tema,
    'idUsuarioMaster' => $idUsuarioMaster,
    'modo' => ($idFromSession > 0 ? 'session' : 'legacy'),
  ]);

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'Error del servidor.',
    'debug' => [
      'error' => $e->getMessage(),
      'file'  => $e->getFile(),
      'line'  => $e->getLine(),
    ],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}
