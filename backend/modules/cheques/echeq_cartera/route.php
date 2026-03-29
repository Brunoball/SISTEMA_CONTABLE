<?php
declare(strict_types=1);

// backend/modules/cheques/echeq_cartera/route.php

if (!isset($pdo) || !($pdo instanceof PDO)) {
  header('Content-Type: application/json; charset=utf-8');
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Este módulo debe ejecutarse vía routes/api.php.'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$action = mb_strtolower(trim((string)($_GET['action'] ?? $_POST['action'] ?? '')), 'UTF-8');

if ($action === '' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $raw = file_get_contents('php://input');
  if ($raw) {
    $json = json_decode($raw, true);
    if (is_array($json) && isset($json['action'])) {
      $action = mb_strtolower(trim((string)$json['action']), 'UTF-8');
    }
  }
}

switch ($action) {
  case 'echeq_cartera_listar':
    require_once __DIR__ . '/echeq_cartera.php';
    exit;

  case 'echeq_cartera_comprobante_ver':
    require_once __DIR__ . '/echeq_cartera_comprobante_ver.php';
    exit;

  case 'echeq_cartera_depositar':
    require_once __DIR__ . '/echeq_cartera_depositar.php';
    exit;

  default:
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(404);
    echo json_encode([
      'exito' => false,
      'mensaje' => 'Acción no válida para echeqs en cartera.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}