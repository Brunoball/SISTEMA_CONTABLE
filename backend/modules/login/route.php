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

    case 'logout':
      require __DIR__ . '/logout.php';
      return true;
  }

  return false;
}
