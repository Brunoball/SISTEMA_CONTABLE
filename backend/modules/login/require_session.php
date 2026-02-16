<?php
declare(strict_types=1);

function getSessionKey(): string {
  $k = $_SERVER['HTTP_X_SESSION'] ?? '';
  return is_string($k) ? trim($k) : '';
}

/**
 * Valida sesión MASTER por X-Session.
 * - Si falta/invalid/expirada: responde 401 y corta.
 * - Si está OK: renueva expira_en +30min (sliding por inactividad).
 */
function require_session(PDO $pdo_master): array {
  $k = getSessionKey();
  if ($k === '') {
    http_response_code(401);
    echo json_encode(['exito' => false, 'mensaje' => 'Falta X-Session.'], JSON_UNESCAPED_UNICODE);
    exit;
  }

  $st = $pdo_master->prepare("
    SELECT idUsuarioMaster, idTenant, expira_en, activo
    FROM sesiones
    WHERE session_key = :k
    LIMIT 1
  ");
  $st->execute([':k' => $k]);
  $s = $st->fetch(PDO::FETCH_ASSOC);

  if (!$s || (int)($s['activo'] ?? 0) !== 1) {
    http_response_code(401);
    echo json_encode(['exito' => false, 'mensaje' => 'Sesión inválida.'], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ vencida -> borrar y 401
  $expiraEn = (string)($s['expira_en'] ?? '');
  if ($expiraEn === '' || strtotime($expiraEn) <= time()) {
    $pdo_master->prepare("DELETE FROM sesiones WHERE session_key = :k")->execute([':k' => $k]);
    http_response_code(401);
    echo json_encode(['exito' => false, 'mensaje' => 'Sesión expirada.'], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // ✅ sliding por inactividad: cada request renueva +30 min
  $ttlMinutes = 30;
  $newExp = (new DateTimeImmutable())->modify("+{$ttlMinutes} minutes")->format("Y-m-d H:i:s");

  $pdo_master->prepare("
    UPDATE sesiones
    SET expira_en = :e
    WHERE session_key = :k
  ")->execute([
    ':e' => $newExp,
    ':k' => $k,
  ]);

  return $s;
}
