<?php
declare(strict_types=1);

// backend/modules/login/logout.php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../config/db_master.php';

function ok(array $a = []): void {
  echo json_encode(array_merge(['exito'=>true], $a), JSON_UNESCAPED_UNICODE);
  exit;
}
function fail(string $m): void {
  echo json_encode(['exito'=>false,'mensaje'=>$m], JSON_UNESCAPED_UNICODE);
  exit;
}

$key = trim((string)($_SERVER['HTTP_X_SESSION'] ?? ''));
if ($key === '') fail('Falta X-Session.');

$pdo_master->prepare("
  UPDATE sesiones
  SET activo = 0
  WHERE session_key = :k
")->execute([':k' => $key]);

ok(['mensaje'=>'Sesión cerrada.']);
