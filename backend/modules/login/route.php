<?php
declare(strict_types=1);
// backend/modules/login/route.php
if (!function_exists('route_login')) {
  function route_login(string $action): bool
  {
    $action = mb_strtolower(trim($action));
    switch ($action) {
      case 'inicio':
        require __DIR__ . '/inicio.php';
        return true;
      case 'registro':
        require __DIR__ . '/registro.php';
        return true;
      case 'logout':
      case 'cerrar_sesion':
        require __DIR__ . '/logout.php';
        return true;
      case 'recuperar_contrasena':
        require __DIR__ . '/recuperar_contrasena.php';
        return true;
      case 'validar_token_reset':
      case 'reset_contrasena':
        require __DIR__ . '/reset_contrasena.php';
        return true;
    }
    return false;
  }
}