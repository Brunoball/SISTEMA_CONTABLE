<?php
declare(strict_types=1);

function getSessionKey(): string {
  $k = $_SERVER['HTTP_X_SESSION'] ?? '';
  return is_string($k) ? trim($k) : '';
}

/**
 * Valida sesión MASTER por X-Session.
 * - Si falta/invalid/expirada: responde 401 y corta.
 * - Si está OK: renueva expira_en +30min y actualiza ultimo_uso (sliding).
 *
 * ✅ FIX TZ HOSTINGER:
 * - Fuerza TZ en PHP y en MySQL (SESSION time_zone = -03:00)
 * - Usa NOW() del MySQL para creado/ultimo/expira (todo consistente)
 */
function require_session(PDO $pdo_master): array {
  // ✅ TZ consistente (PHP)
  @date_default_timezone_set('America/Argentina/Cordoba');

  // ✅ TZ consistente (MySQL por conexión)
  try {
    $pdo_master->exec("SET time_zone = '-03:00'");
  } catch (Throwable $e) {
    // si Hostinger lo bloquea, igual seguimos (pero normalmente lo permite)
  }

  $k = getSessionKey();
  if ($k === '') {
    http_response_code(401);
    echo json_encode(['exito' => false, 'mensaje' => 'Falta X-Session.'], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // 1) Traer sesión y validar activo + expiración (con hora de MySQL)
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

  // ✅ Si expira_en ya pasó según MySQL, la borramos y 401
  // (evita líos de timezone entre PHP/MySQL)
  $stExp = $pdo_master->prepare("
    SELECT (expira_en <= NOW()) AS expirada
    FROM sesiones
    WHERE session_key = :k
    LIMIT 1
  ");
  $stExp->execute([':k' => $k]);
  $rowExp = $stExp->fetch(PDO::FETCH_ASSOC);
  $expirada = (int)($rowExp['expirada'] ?? 1) === 1;

  if ($expirada) {
    $pdo_master->prepare("DELETE FROM sesiones WHERE session_key = :k")->execute([':k' => $k]);
    http_response_code(401);
    echo json_encode(['exito' => false, 'mensaje' => 'Sesión expirada.'], JSON_UNESCAPED_UNICODE);
    exit;
  }

  // 2) Sliding por inactividad:
  // ✅ actualiza ultimo_uso y expira_en usando NOW() (misma TZ)
  $ttlMinutes = 30;

  $stUp = $pdo_master->prepare("
    UPDATE sesiones
    SET
      ultimo_uso = NOW(),
      expira_en  = DATE_ADD(NOW(), INTERVAL :ttl MINUTE)
    WHERE session_key = :k
  ");
  $stUp->bindValue(':ttl', $ttlMinutes, PDO::PARAM_INT);
  $stUp->bindValue(':k', $k, PDO::PARAM_STR);
  $stUp->execute();

  return $s;
}
