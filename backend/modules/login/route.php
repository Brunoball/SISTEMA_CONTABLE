<?php
declare(strict_types=1);

// backend/modules/login/route.php

function route_login(string $action): bool
{
  switch ($action) {
    case 'inicio':
      require __DIR__ . '/inicio.php';
      return true;

    case 'registro':
      require __DIR__ . '/registro.php';
      return true;

    // ✅ Logout (cerrar sesión)
    case 'logout':
    case 'cerrar_sesion':
      require __DIR__ . '/logout.php';
      return true;
  }

  return false;
}