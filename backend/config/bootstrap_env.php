<?php
declare(strict_types=1);

$root = realpath(__DIR__ . '/..'); // backend/

if ($root && file_exists($root . DIRECTORY_SEPARATOR . '.env')) {
  require_once $root . DIRECTORY_SEPARATOR . 'vendor' . DIRECTORY_SEPARATOR . 'autoload.php';

  // ✅ Esto hace que getenv() funcione (usa putenv)
  $dotenv = Dotenv\Dotenv::createUnsafeImmutable($root);
  $dotenv->load();
}
