<?php
// backend/modules/movimientos/core/secure_context.php
// Guard de contexto seguro para todo el módulo Movimientos.
// Valida que cualquier idTenant / idUsuarioMaster enviado por el frontend
// coincida con la sesión real ya validada por backend/routes/api.php.

declare(strict_types=1);

if (!function_exists('mvsec_fail_json')) {
  function mvsec_fail_json(string $mensaje, int $httpCode = 403, array $extra = []): void
  {
    if (!headers_sent()) {
      http_response_code($httpCode);
      header('Content-Type: application/json; charset=utf-8');
      header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    }

    echo json_encode(array_merge([
      'exito' => false,
      'mensaje' => $mensaje,
    ], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('mvsec_header_value')) {
  function mvsec_header_value(string $key): string
  {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
    $v = $_SERVER[$serverKey] ?? '';
    if (!is_string($v)) $v = '';
    return trim($v);
  }
}

if (!function_exists('mvsec_positive_int')) {
  function mvsec_positive_int($value): int
  {
    if ($value === null || $value === '') return 0;
    if (!is_numeric($value)) return 0;
    $n = (int)$value;
    return $n > 0 ? $n : 0;
  }
}

if (!function_exists('mvsec_first_positive_int')) {
  function mvsec_first_positive_int(array $candidates): int
  {
    foreach ($candidates as $candidate) {
      $n = mvsec_positive_int($candidate);
      if ($n > 0) return $n;
    }
    return 0;
  }
}

if (!function_exists('mv_secure_auth_tenant_id')) {
  function mv_secure_auth_tenant_id(): int
  {
    if (session_status() !== PHP_SESSION_ACTIVE) {
      @session_start();
    }

    return mvsec_first_positive_int([
      $GLOBALS['AUTH_TENANT_ID'] ?? null,
      $GLOBALS['SESSION_MASTER']['idTenant'] ?? null,
      $GLOBALS['SESSION_MASTER']['id_tenant'] ?? null,
      $GLOBALS['SESSION_MASTER']['tenant_id'] ?? null,
      $GLOBALS['tenant']['idTenant'] ?? null,
      $GLOBALS['tenant']['id_tenant'] ?? null,
      $GLOBALS['tenant']['tenant_id'] ?? null,
      $GLOBALS['currentTenant']['idTenant'] ?? null,
      $GLOBALS['currentTenant']['id_tenant'] ?? null,
      $GLOBALS['currentTenant']['tenant_id'] ?? null,
      $_SESSION['idTenant'] ?? null,
      $_SESSION['id_tenant'] ?? null,
      $_SESSION['tenant_id'] ?? null,
    ]);
  }
}

if (!function_exists('mv_secure_auth_user_id')) {
  function mv_secure_auth_user_id(): int
  {
    if (session_status() !== PHP_SESSION_ACTIVE) {
      @session_start();
    }

    return mvsec_first_positive_int([
      $GLOBALS['AUTH_USER_MASTER_ID'] ?? null,
      $GLOBALS['SESSION_MASTER']['idUsuarioMaster'] ?? null,
      $GLOBALS['SESSION_MASTER']['id_usuario_master'] ?? null,
      $GLOBALS['SESSION_MASTER']['idUsuario'] ?? null,
      $GLOBALS['SESSION_MASTER']['id_usuario'] ?? null,
      $_SESSION['idUsuarioMaster'] ?? null,
      $_SESSION['id_usuario_master'] ?? null,
      $_SESSION['balto_user_id'] ?? null,
      $_SESSION['user_id'] ?? null,
    ]);
  }
}

if (!function_exists('mvsec_json_body')) {
  function mvsec_json_body(): array
  {
    if (isset($GLOBALS['MVSEC_JSON_BODY']) && is_array($GLOBALS['MVSEC_JSON_BODY'])) {
      return $GLOBALS['MVSEC_JSON_BODY'];
    }

    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''));
    if ($contentType !== '' && strpos($contentType, 'application/json') === false) {
      $GLOBALS['MVSEC_JSON_BODY'] = [];
      return [];
    }

    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
      $GLOBALS['MVSEC_JSON_BODY'] = [];
      return [];
    }

    $data = json_decode($raw, true);
    $GLOBALS['MVSEC_JSON_BODY'] = is_array($data) ? $data : [];
    return $GLOBALS['MVSEC_JSON_BODY'];
  }
}

if (!function_exists('mvsec_add_top_level_values')) {
  function mvsec_add_top_level_values(array &$values, array $source, array $keys, string $origen): void
  {
    foreach ($keys as $key) {
      if (array_key_exists($key, $source)) {
        $values[] = [
          'origen' => $origen . '.' . $key,
          'valor' => $source[$key],
        ];
      }
    }
  }
}

if (!function_exists('mvsec_validate_values_match')) {
  function mvsec_validate_values_match(string $label, int $secureValue, array $values): void
  {
    if ($secureValue <= 0) return;

    foreach ($values as $item) {
      $sent = mvsec_positive_int($item['valor'] ?? null);
      if ($sent <= 0) continue;

      if ($sent !== $secureValue) {
        mvsec_fail_json('Contexto de seguridad inválido: el ' . $label . ' enviado no coincide con la sesión activa.', 403, [
          'codigo' => 'TENANT_CONTEXT_MISMATCH',
          'campo' => $label,
          'origen' => (string)($item['origen'] ?? ''),
        ]);
      }
    }
  }
}

if (!function_exists('mv_secure_normalize_context')) {
  function mv_secure_normalize_context(int $idTenant, int $idUsuarioMaster): void
  {
    if ($idTenant > 0) {
      $GLOBALS['AUTH_TENANT_ID'] = $idTenant;
      $GLOBALS['tenant'] = [
        'idTenant' => $idTenant,
        'id_tenant' => $idTenant,
        'tenant_id' => $idTenant,
      ];
      $GLOBALS['currentTenant'] = $GLOBALS['tenant'];

      $_SERVER['X_IDTENANT'] = (string)$idTenant;
      $_SERVER['HTTP_X_IDTENANT'] = (string)$idTenant;
      $_SERVER['HTTP_X_ID_TENANT'] = (string)$idTenant;
      $_SERVER['HTTP_X_TENANT'] = (string)$idTenant;
      $_SERVER['HTTP_X_TENANT_ID'] = (string)$idTenant;

      if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
      }
      $_SESSION['idTenant'] = $idTenant;
      $_SESSION['id_tenant'] = $idTenant;
      $_SESSION['tenant_id'] = $idTenant;
    }

    if ($idUsuarioMaster > 0) {
      $GLOBALS['AUTH_USER_MASTER_ID'] = $idUsuarioMaster;
      $_SERVER['X_IDUSUARIO_MASTER'] = (string)$idUsuarioMaster;
      $_SERVER['HTTP_X_IDUSUARIO_MASTER'] = (string)$idUsuarioMaster;
      $_SERVER['HTTP_X_ID_USUARIO_MASTER'] = (string)$idUsuarioMaster;
      $_SERVER['HTTP_X_USER_ID'] = (string)$idUsuarioMaster;

      if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
      }
      $_SESSION['idUsuarioMaster'] = $idUsuarioMaster;
      $_SESSION['id_usuario_master'] = $idUsuarioMaster;
      $_SESSION['balto_user_id'] = $idUsuarioMaster;
      $_SESSION['user_id'] = $idUsuarioMaster;
    }
  }
}

if (!function_exists('mv_secure_context_guard')) {
  function mv_secure_context_guard(string $action = ''): void
  {
    $idTenant = mv_secure_auth_tenant_id();
    $idUsuarioMaster = mv_secure_auth_user_id();

    // El módulo Movimientos es privado. Si llegó hasta acá sin sesión real,
    // se corta antes de operar contra la base del tenant.
    if ($idTenant <= 0 || $idUsuarioMaster <= 0) {
      mvsec_fail_json('Sesión inválida o contexto de tenant no disponible.', 401, [
        'codigo' => 'TENANT_CONTEXT_MISSING',
        'action' => $action,
      ]);
    }

    $body = mvsec_json_body();

    $tenantKeys = ['idTenant', 'id_tenant', 'tenant_id', 'tenantId'];
    $userKeys = ['idUsuarioMaster', 'id_usuario_master', 'idUsuario', 'id_usuario', 'user_id', 'uid'];

    $tenantValues = [];
    mvsec_add_top_level_values($tenantValues, $_GET ?? [], $tenantKeys, 'GET');
    mvsec_add_top_level_values($tenantValues, $_POST ?? [], $tenantKeys, 'POST');
    mvsec_add_top_level_values($tenantValues, $body, $tenantKeys, 'JSON');
    $tenantValues[] = ['origen' => 'HEADER.X-IdTenant', 'valor' => mvsec_header_value('X-IdTenant')];
    $tenantValues[] = ['origen' => 'HEADER.X-Id-Tenant', 'valor' => mvsec_header_value('X-Id-Tenant')];
    $tenantValues[] = ['origen' => 'HEADER.X-Tenant', 'valor' => mvsec_header_value('X-Tenant')];
    $tenantValues[] = ['origen' => 'HEADER.X-Tenant-Id', 'valor' => mvsec_header_value('X-Tenant-Id')];

    $userValues = [];
    mvsec_add_top_level_values($userValues, $_GET ?? [], $userKeys, 'GET');
    mvsec_add_top_level_values($userValues, $_POST ?? [], $userKeys, 'POST');
    mvsec_add_top_level_values($userValues, $body, $userKeys, 'JSON');
    $userValues[] = ['origen' => 'HEADER.X-IdUsuario-Master', 'valor' => mvsec_header_value('X-IdUsuario-Master')];
    $userValues[] = ['origen' => 'HEADER.X-Id-Usuario-Master', 'valor' => mvsec_header_value('X-Id-Usuario-Master')];
    $userValues[] = ['origen' => 'HEADER.X-User-Id', 'valor' => mvsec_header_value('X-User-Id')];

    mvsec_validate_values_match('idTenant', $idTenant, $tenantValues);
    mvsec_validate_values_match('idUsuarioMaster', $idUsuarioMaster, $userValues);

    // A partir de acá, cualquier helper viejo que mire headers/$_SESSION va a ver
    // el contexto real de sesión, no el contexto manipulable del frontend.
    mv_secure_normalize_context($idTenant, $idUsuarioMaster);

    $GLOBALS['MV_SECURE_CONTEXT'] = [
      'idTenant' => $idTenant,
      'idUsuarioMaster' => $idUsuarioMaster,
      'action' => $action,
      'validated_at' => date('c'),
    ];
  }
}
