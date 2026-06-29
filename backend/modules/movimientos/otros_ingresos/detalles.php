<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

if (!function_exists('otros_ingresos_detalles_crear')) {
  function otros_ingresos_detalles_crear(PDO $pdo): void
  {
    try {
      if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'Método no permitido.',
        ], 405);
      }

      $payload   = oi_read_request_data();
      $idUsuario = oi_resolver_usuario_auditoria($pdo, $payload);
      $nombre    = oi_str($payload['nombre'] ?? $payload['detalle'] ?? '');

      if ($nombre === '') {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'El nombre del detalle es obligatorio.',
        ], 422);
      }

      $pkCol     = oi_guess_detalles_pk($pdo);
      $nombreCol = oi_guess_detalles_nombre_col($pdo);

      if (!$pkCol || !$nombreCol) {
        throw new RuntimeException('La tabla detalles no tiene la estructura esperada.');
      }

      $existente = oi_find_existing_detalle_by_nombre($pdo, $nombre);
      if ($existente) {
        $detalleFront = oi_detalle_to_front($existente, $pkCol, $nombreCol);

        if (oi_has_col($pdo, 'detalles', 'activo') && (int)($existente['activo'] ?? 1) !== 1) {
          $stAct = $pdo->prepare("UPDATE detalles SET activo = 1 WHERE `{$pkCol}` = :id LIMIT 1");
          $stAct->bindValue(':id', (int)$detalleFront['id_detalle'], PDO::PARAM_INT);
          $stAct->execute();
          $detalleFront['activo'] = 1;
        }

        oi_audit_safe($pdo, $idUsuario, 'seleccionar_detalle_existente', 'otros_ingresos_detalles', (int)$detalleFront['id_detalle'], [
          'ya_existia' => true,
          'detalle'    => $detalleFront,
        ]);

        oi_json_response([
          'exito'      => true,
          'mensaje'    => 'El detalle ya existía y quedó seleccionado.',
          'detalle'    => $detalleFront,
          'ya_existia' => true,
        ]);
      }

      $insert = [
        $nombreCol => $nombre,
      ];

      if (oi_has_col($pdo, 'detalles', 'activo')) {
        $insert['activo'] = 1;
      }

      if (oi_has_col($pdo, 'detalles', 'created_at')) {
        $insert['created_at'] = date('Y-m-d H:i:s');
      }

      $idDetalle = oi_insert($pdo, 'detalles', $insert);
      $detalle   = oi_fetch_detalle_by_id($pdo, $idDetalle);

      if (!$detalle) {
        throw new RuntimeException('No se pudo recuperar el detalle recién creado.');
      }

      oi_audit_safe($pdo, $idUsuario, 'crear_detalle', 'otros_ingresos_detalles', $idDetalle, [
        'creado' => true,
        'detalle' => $detalle,
      ]);

      oi_json_response([
        'exito'      => true,
        'mensaje'    => 'Detalle creado correctamente.',
        'detalle'    => $detalle,
        'ya_existia' => false,
      ]);
    } catch (Throwable $e) {
      oi_json_response([
        'exito'   => false,
        'mensaje' => 'Error guardando detalle: ' . $e->getMessage(),
      ], 500);
    }
  }
}
