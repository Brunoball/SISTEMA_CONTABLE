<?php
declare(strict_types=1);

// backend/modules/cheques/route.php

if (!function_exists('route_cheques')) {
  function route_cheques(string $action): bool
  {
    global $pdo;

    $action = mb_strtolower(trim($action), 'UTF-8');

    if (!isset($pdo) || !($pdo instanceof PDO)) {
      header('Content-Type: application/json; charset=utf-8');
      http_response_code(500);
      echo json_encode([
        'exito' => false,
        'mensaje' => 'PDO no disponible en módulo cheques.'
      ], JSON_UNESCAPED_UNICODE);
      exit;
    }

    switch ($action) {
      case 'cheques_cartera_listar':
      case 'cheques_cartera_comprobante_ver':
      case 'cheques_cartera_depositar':
        require_once __DIR__ . '/cheques_cartera/route.php';
        return true;

      case 'echeq_cartera_listar':
      case 'echeq_cartera_comprobante_ver':
      case 'echeq_cartera_depositar':
        require_once __DIR__ . '/echeq_cartera/route.php';
        return true;

      case 'flujo_cheques_listar':
        require_once __DIR__ . '/flujo_cheques/route.php';
        return true;

      case 'flujos_echeq_listar':
        require_once __DIR__ . '/flujos_echeq/route.php';
        return true;

      default:
        return false;
    }
  }
}