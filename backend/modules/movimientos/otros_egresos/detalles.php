<?php
declare(strict_types=1);

if (!function_exists('otros_egresos_detalles_crear')) {
  function otros_egresos_detalles_crear(PDO $pdo): void
  {
    try {
      $raw = file_get_contents('php://input');
      $data = json_decode($raw ?: '[]', true);
      if (!is_array($data)) $data = [];

      $idUsuario = function_exists('oe_get_id_usuario_from_request')
        ? oe_get_id_usuario_from_request($pdo, $data)
        : 0;

      $nombre = trim((string)($data['nombre'] ?? ''));
      if ($nombre === '') {
        oe_json_response([
          'exito' => false,
          'mensaje' => 'El nombre del detalle es obligatorio.'
        ], 422);
      }

      $stExiste = $pdo->prepare("
        SELECT id_detalle, nombre, activo
        FROM detalles
        WHERE UPPER(TRIM(nombre)) = UPPER(TRIM(:nombre))
        LIMIT 1
      ");
      $stExiste->execute([':nombre' => $nombre]);
      $existe = $stExiste->fetch(PDO::FETCH_ASSOC);

      if ($existe) {
        if (function_exists('oe_audit_safe')) {
          oe_audit_safe($pdo, $idUsuario, 'detalle_existente', 'otros_egresos_detalles', (int)$existe['id_detalle'], [
            'accion'  => 'intento_crear_detalle_existente',
            'detalle' => [
              'id_detalle' => (int)$existe['id_detalle'],
              'nombre'     => (string)$existe['nombre'],
              'activo'     => (int)$existe['activo'],
            ],
          ]);
        }

        oe_json_response([
          'exito' => true,
          'mensaje' => 'El detalle ya existía.',
          'detalle' => [
            'id_detalle' => (int)$existe['id_detalle'],
            'id' => (int)$existe['id_detalle'],
            'nombre' => (string)$existe['nombre'],
            'activo' => (int)$existe['activo'],
          ],
        ]);
      }

      $st = $pdo->prepare("
        INSERT INTO detalles (nombre, activo)
        VALUES (:nombre, 1)
      ");
      $st->execute([
        ':nombre' => $nombre,
      ]);

      $idDetalle = (int)$pdo->lastInsertId();

      if (function_exists('oe_audit_safe')) {
        oe_audit_safe($pdo, $idUsuario, 'crear', 'otros_egresos_detalles', $idDetalle, [
          'creado' => true,
          'nuevo' => [
            'id_detalle' => $idDetalle,
            'nombre'     => $nombre,
            'activo'     => 1,
          ],
        ]);
      }

      oe_json_response([
        'exito' => true,
        'mensaje' => 'Detalle creado correctamente.',
        'detalle' => [
          'id_detalle' => $idDetalle,
          'id' => $idDetalle,
          'nombre' => $nombre,
          'activo' => 1,
        ],
      ]);
    } catch (Throwable $e) {
      oe_json_response([
        'exito' => false,
        'mensaje' => 'Error creando detalle: ' . $e->getMessage(),
      ], 500);
    }
  }
}