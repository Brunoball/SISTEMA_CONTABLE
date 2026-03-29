<?php
declare(strict_types=1);

// backend/modules/login/require_session.php

if (!function_exists('session_exception_is_unauthorized')) {
  function session_exception_is_unauthorized(string $msg): bool
  {
    $msg = mb_strtolower(trim($msg), 'UTF-8');

    return
      str_contains($msg, 'sesión') ||
      str_contains($msg, 'sesion') ||
      str_contains($msg, 'x-session') ||
      str_contains($msg, 'session_key') ||
      str_contains($msg, 'no autorizada') ||
      str_contains($msg, 'no autorizado') ||
      str_contains($msg, 'inválida') ||
      str_contains($msg, 'invalida') ||
      str_contains($msg, 'expirada') ||
      str_contains($msg, 'expiró') ||
      str_contains($msg, 'expiro');
  }
}

if (!function_exists('session_get_header_key')) {
  function session_get_header_key(): string
  {
    $candidates = [
      $_SERVER['HTTP_X_SESSION'] ?? null,
      $_SERVER['X_SESSION'] ?? null,
      $_GET['session_key'] ?? null,
      $_POST['session_key'] ?? null,
      $_REQUEST['session_key'] ?? null,
    ];

    foreach ($candidates as $value) {
      if (is_string($value) && trim($value) !== '') {
        return trim($value);
      }
    }

    if (function_exists('getallheaders')) {
      $headers = getallheaders();
      if (is_array($headers)) {
        foreach (['X-Session', 'x-session', 'X_SESSION', 'x_session'] as $h) {
          $v = $headers[$h] ?? null;
          if (is_string($v) && trim($v) !== '') {
            return trim($v);
          }
        }
      }
    }

    return '';
  }
}

if (!function_exists('session_delete_by_key')) {
  function session_delete_by_key(PDO $pdo_master, string $sessionKey): void
  {
    if ($sessionKey === '') return;

    try {
      $st = $pdo_master->prepare("DELETE FROM sesiones WHERE session_key = :k");
      $st->execute([':k' => $sessionKey]);
    } catch (Throwable $e) {
      // no romper por esto
    }
  }
}

if (!function_exists('session_touch_sliding_expiration')) {
  function session_touch_sliding_expiration(PDO $pdo_master, string $sessionKey): void
  {
    if ($sessionKey === '') return;

    try {
      $sql = "
        UPDATE sesiones
        SET
          ultimo_uso = NOW(),
          expira_en = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
        WHERE session_key = :session_key
        LIMIT 1
      ";
      $up = $pdo_master->prepare($sql);
      $up->execute([':session_key' => $sessionKey]);
    } catch (Throwable $e) {
      // no frenamos la sesión si falla el touch
    }
  }
}

if (!function_exists('require_session')) {
  /**
   * Valida la sesión master a partir de X-Session / session_key.
   * Devuelve:
   * - session_key
   * - idUsuarioMaster
   * - idTenant
   * - raw
   *
   * IMPORTANTE:
   * - Si está vencida, la elimina
   * - Si está válida, renueva expira_en 30 min desde el último uso
   */
  function require_session(PDO $pdo_master): array
  {
    @date_default_timezone_set('America/Argentina/Cordoba');
    try {
      $pdo_master->exec("SET time_zone = '-03:00'");
    } catch (Throwable $e) {}

    $sessionKey = session_get_header_key();

    if ($sessionKey === '') {
      throw new RuntimeException('Sesión no autorizada: falta X-Session.');
    }

    $sql = "SELECT * FROM sesiones WHERE session_key = :session_key LIMIT 1";
    $stmt = $pdo_master->prepare($sql);
    $stmt->execute([':session_key' => $sessionKey]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      throw new RuntimeException('Sesión no autorizada: session_key inválida.');
    }

    // ===== detectar usuario master =====
    $idUsuarioMaster = 0;
    foreach (['idUsuarioMaster', 'id_usuario_master', 'usuario_master_id', 'user_id', 'idUsuario'] as $col) {
      if (array_key_exists($col, $row) && $row[$col] !== null && $row[$col] !== '') {
        $idUsuarioMaster = (int)$row[$col];
        break;
      }
    }

    if ($idUsuarioMaster <= 0) {
      session_delete_by_key($pdo_master, $sessionKey);
      throw new RuntimeException('Sesión inválida: no se encontró idUsuarioMaster en la sesión.');
    }

    // ===== detectar tenant =====
    $idTenant = 0;
    foreach (['idTenant', 'id_tenant', 'tenant_id'] as $col) {
      if (array_key_exists($col, $row) && $row[$col] !== null && $row[$col] !== '') {
        $idTenant = (int)$row[$col];
        break;
      }
    }

    if ($idTenant <= 0) {
      session_delete_by_key($pdo_master, $sessionKey);
      throw new RuntimeException('Sesión inválida: no se encontró idTenant en la sesión.');
    }

    // ===== inactiva =====
    $activo = (int)($row['activo'] ?? 1);
    if ($activo !== 1) {
      session_delete_by_key($pdo_master, $sessionKey);
      throw new RuntimeException('Sesión no autorizada: la sesión está inactiva.');
    }

    // ===== expiración =====
    $rawExpira = trim((string)($row['expira_en'] ?? ''));
    if ($rawExpira !== '' && $rawExpira !== '0000-00-00 00:00:00') {
      $expTs = strtotime($rawExpira);
      if ($expTs !== false && $expTs < time()) {
        session_delete_by_key($pdo_master, $sessionKey);
        throw new RuntimeException('Sesión expirada.');
      }
    }

    // ===== opcional: validar también por último uso si existe =====
    $rawUltimoUso = trim((string)($row['ultimo_uso'] ?? ''));
    if ($rawUltimoUso !== '' && $rawUltimoUso !== '0000-00-00 00:00:00') {
      $ultimoUsoTs = strtotime($rawUltimoUso);
      if ($ultimoUsoTs !== false) {
        $idleLimit = 30 * 60; // 30 min
        if ((time() - $ultimoUsoTs) > $idleLimit) {
          session_delete_by_key($pdo_master, $sessionKey);
          throw new RuntimeException('Sesión expirada.');
        }
      }
    }

    // ===== sliding expiration =====
    session_touch_sliding_expiration($pdo_master, $sessionKey);

    return [
      'session_key'     => $sessionKey,
      'idUsuarioMaster' => $idUsuarioMaster,
      'idTenant'        => $idTenant,
      'raw'             => $row,
    ];
  }
}