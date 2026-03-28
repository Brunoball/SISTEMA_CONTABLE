<?php
declare(strict_types=1);

/**
 * OTROS INGRESOS
 * - movimientos.id_tipo_operacion = 3
 * - cabecera en movimientos
 * - detalle(s) en movimientos_items
 * - comprobante en comprobantes_archivos.id_movimiento = movimientos.id_movimiento
 */

if (!function_exists('oi_json_response')) {
  function oi_json_response(array $data, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('oi_read_json_input')) {
  function oi_read_json_input(): array
  {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('oi_table_columns')) {
  function oi_table_columns(PDO $pdo, string $table): array
  {
    static $cache = [];

    if (isset($cache[$table])) {
      return $cache[$table];
    }

    $st = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $cols = [];
    foreach ($rows as $r) {
      $field = (string)($r['Field'] ?? '');
      if ($field !== '') {
        $cols[$field] = true;
      }
    }

    $cache[$table] = $cols;
    return $cols;
  }
}

if (!function_exists('oi_has_col')) {
  function oi_has_col(PDO $pdo, string $table, string $col): bool
  {
    $cols = oi_table_columns($pdo, $table);
    return isset($cols[$col]);
  }
}

if (!function_exists('oi_pick_first_existing_col')) {
  function oi_pick_first_existing_col(PDO $pdo, string $table, array $candidates): ?string
  {
    foreach ($candidates as $c) {
      if (oi_has_col($pdo, $table, $c)) return $c;
    }
    return null;
  }
}

if (!function_exists('oi_num')) {
  function oi_num($v, float $default = 0): float
  {
    if ($v === null || $v === '') return $default;

    if (is_string($v)) {
      $v = trim($v);
      $v = str_replace(['$', ' '], '', $v);

      if (strpos($v, ',') !== false && strpos($v, '.') !== false) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
      } elseif (strpos($v, ',') !== false) {
        $v = str_replace(',', '.', $v);
      }
    }

    $n = (float)$v;
    return is_finite($n) ? $n : $default;
  }
}

if (!function_exists('oi_int')) {
  function oi_int($v, int $default = 0): int
  {
    return (int)round(oi_num($v, $default));
  }
}

if (!function_exists('oi_str')) {
  function oi_str($v, string $default = ''): string
  {
    $s = trim((string)($v ?? ''));
    return $s !== '' ? $s : $default;
  }
}

if (!function_exists('oi_normalize_items')) {
  function oi_normalize_items(array $payload): array
  {
    $items = [];

    if (isset($payload['items']) && is_array($payload['items'])) {
      foreach ($payload['items'] as $it) {
        if (!is_array($it)) continue;

        $idDetalle = oi_int($it['id_detalle'] ?? $it['idDetalle'] ?? 0, 0);
        $cantidad  = oi_num($it['cantidad'] ?? 0, 0);
        $precio    = oi_num($it['precio'] ?? 0, 0);
        $ivaPct    = oi_num($it['iva_pct'] ?? $it['ivaPct'] ?? 0, 0);

        if ($cantidad <= 0 || $precio <= 0) {
          continue;
        }

        $subtotal = oi_num($it['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto = oi_num($it['iva_monto'] ?? ($subtotal * ($ivaPct / 100)), $subtotal * ($ivaPct / 100));
        $total    = oi_num($it['total'] ?? ($subtotal + $ivaMonto), $subtotal + $ivaMonto);

        if ($subtotal <= 0 || $total <= 0) {
          continue;
        }

        $items[] = [
          'id_detalle' => $idDetalle > 0 ? $idDetalle : null,
          'cantidad'   => $cantidad,
          'precio'     => $precio,
          'iva_pct'    => $ivaPct,
          'subtotal'   => $subtotal,
          'iva_monto'  => $ivaMonto,
          'total'      => $total,
        ];
      }
    }

    if (!$items) {
      $cantidad = max(1, oi_num($payload['cantidad'] ?? 1, 1));
      $precio   = oi_num($payload['precio'] ?? 0, 0);
      $ivaPct   = oi_num($payload['iva_pct'] ?? $payload['ivaPct'] ?? 0, 0);

      if ($precio > 0) {
        $subtotal = oi_num($payload['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto = oi_num($payload['iva_monto'] ?? ($subtotal * ($ivaPct / 100)), $subtotal * ($ivaPct / 100));
        $total    = oi_num(
          $payload['monto_total'] ?? $payload['total'] ?? ($subtotal + $ivaMonto),
          $subtotal + $ivaMonto
        );
        $idDetalle = oi_int($payload['id_detalle'] ?? 0, 0);

        if ($subtotal > 0 && $total > 0) {
          $items[] = [
            'id_detalle' => $idDetalle > 0 ? $idDetalle : null,
            'cantidad'   => $cantidad,
            'precio'     => $precio,
            'iva_pct'    => $ivaPct,
            'subtotal'   => $subtotal,
            'iva_monto'  => $ivaMonto,
            'total'      => $total,
          ];
        }
      }
    }

    return $items;
  }
}

if (!function_exists('oi_first_item_detalle_id')) {
  function oi_first_item_detalle_id(array $items): ?int
  {
    foreach ($items as $it) {
      $id = (int)($it['id_detalle'] ?? 0);
      if ($id > 0) return $id;
    }
    return null;
  }
}

if (!function_exists('oi_sum_items_total')) {
  function oi_sum_items_total(array $items): float
  {
    $total = 0.0;
    foreach ($items as $it) {
      $total += oi_num($it['total'] ?? 0, 0);
    }
    return $total;
  }
}

if (!function_exists('oi_build_movimiento_data')) {
  function oi_build_movimiento_data(PDO $pdo, array $payload): array
  {
    $items = oi_normalize_items($payload);

    $fecha = oi_str($payload['fecha'] ?? date('Y-m-d'));
    $idMedioPago = oi_int($payload['id_medio_pago'] ?? 0, 0);
    $idUsuario = oi_int($payload['idUsuario'] ?? $payload['id_usuario'] ?? 0, 0);

    $total = oi_sum_items_total($items);
    $firstDetalleId = oi_first_item_detalle_id($items);

    $data = [
      'fecha'             => $fecha,
      'id_tipo_operacion' => 3,
      'id_clasificacion'  => null,
      'id_tipo_venta'     => null,
      'id_cliente'        => null,
      'id_proveedor'      => null,
      'id_detalle'        => $firstDetalleId,
      'monto_total'       => $total,
      'id_medio_pago'     => $idMedioPago > 0 ? $idMedioPago : null,
    ];

    if (oi_has_col($pdo, 'movimientos', 'created_at')) {
      $data['created_at'] = date('Y-m-d H:i:s');
    }

    $colUserCreate = oi_pick_first_existing_col(
      $pdo,
      'movimientos',
      ['id_usuario', 'idUsuario', 'usuario_id', 'created_by']
    );

    if ($colUserCreate && $idUsuario > 0) {
      $data[$colUserCreate] = $idUsuario;
    }

    return $data;
  }
}

if (!function_exists('oi_insert')) {
  function oi_insert(PDO $pdo, string $table, array $data): int
  {
    if (!$data) {
      throw new RuntimeException("No hay datos para insertar en {$table}.");
    }

    $cols = array_keys($data);
    $fields = '`' . implode('`,`', $cols) . '`';
    $params = ':' . implode(',:', $cols);

    $sql = "INSERT INTO `{$table}` ({$fields}) VALUES ({$params})";
    $st = $pdo->prepare($sql);

    foreach ($data as $k => $v) {
      $st->bindValue(':' . $k, $v);
    }

    $st->execute();
    return (int)$pdo->lastInsertId();
  }
}

if (!function_exists('oi_update')) {
  function oi_update(PDO $pdo, string $table, array $data, int $id): void
  {
    if ($id <= 0) {
      throw new RuntimeException('ID inválido para actualizar.');
    }

    if (!$data) {
      throw new RuntimeException("No hay datos para actualizar en {$table}.");
    }

    $idCol = oi_pick_first_existing_col($pdo, $table, ['id_movimiento', 'id']);
    if (!$idCol) {
      throw new RuntimeException("No se encontró la PK de {$table}.");
    }

    $sets = [];
    foreach ($data as $k => $v) {
      $sets[] = "`{$k}` = :{$k}";
    }

    $sql = "UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE `{$idCol}` = :_id LIMIT 1";
    $st = $pdo->prepare($sql);

    foreach ($data as $k => $v) {
      $st->bindValue(':' . $k, $v);
    }

    $st->bindValue(':_id', $id, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oi_delete_items_by_movimiento')) {
  function oi_delete_items_by_movimiento(PDO $pdo, int $idMovimiento): void
  {
    $sql = "DELETE FROM movimientos_items WHERE id_movimiento = :id_movimiento";
    $st = $pdo->prepare($sql);
    $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oi_insert_items')) {
  function oi_insert_items(PDO $pdo, int $idMovimiento, array $items): void
  {
    if ($idMovimiento <= 0) {
      throw new RuntimeException('ID de movimiento inválido para movimientos_items.');
    }

    if (!$items) {
      return;
    }

    $sql = "
      INSERT INTO movimientos_items
      (
        id_movimiento,
        id_detalle,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      )
      VALUES
      (
        :id_movimiento,
        :id_detalle,
        :cantidad,
        :precio,
        :iva_pct,
        :subtotal,
        :iva_monto,
        :total
      )
    ";

    $st = $pdo->prepare($sql);

    foreach ($items as $it) {
      $idDetalle = (int)($it['id_detalle'] ?? 0);
      if ($idDetalle <= 0) {
        throw new RuntimeException('Cada fila válida debe tener id_detalle.');
      }

      $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
      $st->bindValue(':id_detalle', $idDetalle, PDO::PARAM_INT);
      $st->bindValue(':cantidad', oi_num($it['cantidad'] ?? 0, 0));
      $st->bindValue(':precio', oi_num($it['precio'] ?? 0, 0));
      $st->bindValue(':iva_pct', oi_num($it['iva_pct'] ?? 0, 0));
      $st->bindValue(':subtotal', oi_num($it['subtotal'] ?? 0, 0));
      $st->bindValue(':iva_monto', oi_num($it['iva_monto'] ?? 0, 0));
      $st->bindValue(':total', oi_num($it['total'] ?? 0, 0));
      $st->execute();
    }
  }
}

if (!function_exists('oi_validate_payload')) {
  function oi_validate_payload(array $payload): array
  {
    $fecha = oi_str($payload['fecha'] ?? '');
    $idMedioPago = oi_int($payload['id_medio_pago'] ?? 0, 0);
    $items = oi_normalize_items($payload);

    if ($fecha === '') {
      return ['ok' => false, 'mensaje' => 'La fecha es obligatoria.'];
    }

    if ($idMedioPago <= 0) {
      return ['ok' => false, 'mensaje' => 'El medio de pago es obligatorio.'];
    }

    if (!$items) {
      return ['ok' => false, 'mensaje' => 'Debés cargar al menos un ítem válido.'];
    }

    foreach ($items as $it) {
      if ((int)($it['id_detalle'] ?? 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'La descripción/detalle es obligatoria en todas las filas válidas.'];
      }
      if (oi_num($it['cantidad'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'La cantidad debe ser mayor a 0.'];
      }
      if (oi_num($it['precio'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El importe debe ser mayor a 0.'];
      }
      if (oi_num($it['subtotal'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El subtotal debe ser mayor a 0.'];
      }
      if (oi_num($it['total'] ?? 0, 0) <= 0) {
        return ['ok' => false, 'mensaje' => 'El total debe ser mayor a 0.'];
      }
    }

    return ['ok' => true, 'items' => $items];
  }
}

if (!function_exists('oi_guess_medios_pago_pk')) {
  function oi_guess_medios_pago_pk(PDO $pdo): ?string
  {
    return oi_pick_first_existing_col($pdo, 'medios_pago', ['id_medio_pago', 'id']);
  }
}

if (!function_exists('oi_guess_medios_pago_nombre_col')) {
  function oi_guess_medios_pago_nombre_col(PDO $pdo): ?string
  {
    return oi_pick_first_existing_col($pdo, 'medios_pago', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('otros_ingresos_listar')) {
  function otros_ingresos_listar(PDO $pdo): void
  {
    try {
      $fechaDesde = oi_str($_GET['fecha_desde'] ?? '');
      $fechaHasta = oi_str($_GET['fecha_hasta'] ?? '');
      $q = oi_str($_GET['q'] ?? '');
      $limit = max(1, min(500, (int)($_GET['limit'] ?? 101)));
      $offset = max(0, (int)($_GET['offset'] ?? 0));

      $mpPk = oi_guess_medios_pago_pk($pdo);
      $mpNombreCol = oi_guess_medios_pago_nombre_col($pdo);

      $joinMedio = '';
      $selectMedio = "'' AS medio_pago_nombre";

      if ($mpPk && $mpNombreCol) {
        $joinMedio = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre";
      }

      $createdAtSelect = oi_has_col($pdo, 'movimientos', 'created_at')
        ? "m.created_at"
        : "NULL AS created_at";

      $joinComprobante = oi_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')
        ? "
          LEFT JOIN comprobantes_archivos ca
            ON ca.id_movimiento = m.id_movimiento
           AND ca.tipo = 'OTROS_INGRESOS'
        "
        : "
          LEFT JOIN comprobantes_archivos ca
            ON 1 = 0
        ";

      $sql = "
        SELECT
          m.id_movimiento,
          m.fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          m.id_detalle,
          m.monto_total,
          m.id_medio_pago,
          {$createdAtSelect},
          COALESCE(
            GROUP_CONCAT(DISTINCT d.nombre ORDER BY d.nombre SEPARATOR ' | '),
            d0.nombre,
            ''
          ) AS detalle,
          {$selectMedio},

          ca.id_comprobante,
          ca.archivo_url AS comprobante_url,
          ca.archivo_mime AS archivo_mime,
          ca.tipo AS comprobante_tipo

        FROM movimientos m
        LEFT JOIN movimientos_items mi
          ON mi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles d
          ON d.id_detalle = mi.id_detalle
        LEFT JOIN detalles d0
          ON d0.id_detalle = m.id_detalle
        {$joinMedio}
        {$joinComprobante}
        WHERE m.id_tipo_operacion = 3
      ";

      $params = [];

      if ($fechaDesde !== '') {
        $sql .= " AND DATE(m.fecha) >= :fecha_desde";
        $params[':fecha_desde'] = $fechaDesde;
      }

      if ($fechaHasta !== '') {
        $sql .= " AND DATE(m.fecha) <= :fecha_hasta";
        $params[':fecha_hasta'] = $fechaHasta;
      }

      if ($q !== '') {
        $sql .= " AND (
          COALESCE(d.nombre, '') LIKE :q
          OR COALESCE(d0.nombre, '') LIKE :q
          OR COALESCE(CAST(m.monto_total AS CHAR), '') LIKE :q
        ";
        if ($mpPk && $mpNombreCol) {
          $sql .= " OR COALESCE(mp.`{$mpNombreCol}`, '') LIKE :q ";
        }
        $sql .= ")";
        $params[':q'] = '%' . $q . '%';
      }

      $sql .= "
        GROUP BY
          m.id_movimiento,
          m.fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          m.id_detalle,
          m.monto_total,
          m.id_medio_pago
      ";

      if (oi_has_col($pdo, 'movimientos', 'created_at')) {
        $sql .= ", m.created_at";
      }

      if ($mpPk && $mpNombreCol) {
        $sql .= ", mp.`{$mpNombreCol}`";
      }

      $sql .= ",
        ca.id_comprobante,
        ca.archivo_url,
        ca.archivo_mime,
        ca.tipo
      ";

      $sql .= "
        ORDER BY m.fecha DESC, m.id_movimiento DESC
        LIMIT :limit OFFSET :offset
      ";

      $st = $pdo->prepare($sql);

      foreach ($params as $k => $v) {
        $st->bindValue($k, $v);
      }

      $st->bindValue(':limit', $limit, PDO::PARAM_INT);
      $st->bindValue(':offset', $offset, PDO::PARAM_INT);
      $st->execute();

      $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

      $pageSize = 100;
      $hasMore = count($rows) > $pageSize;
      $pageRows = $hasMore ? array_slice($rows, 0, $pageSize) : $rows;

      oi_json_response([
        'exito' => true,
        'otros_ingresos' => $pageRows,
        'has_more' => $hasMore,
        'next_offset' => $hasMore ? ($offset + $pageSize) : null,
      ]);
    } catch (Throwable $e) {
      oi_json_response([
        'exito' => false,
        'mensaje' => 'Error listando otros ingresos: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_obtener')) {
  function otros_ingresos_obtener(PDO $pdo): void
  {
    try {
      $idMovimiento = (int)($_GET['id_movimiento'] ?? $_GET['id'] ?? 0);
      if ($idMovimiento <= 0) {
        oi_json_response([
          'exito' => false,
          'mensaje' => 'Falta id_movimiento.',
        ], 422);
      }

      $mpPk = oi_guess_medios_pago_pk($pdo);
      $mpNombreCol = oi_guess_medios_pago_nombre_col($pdo);

      $joinMedio = '';
      $selectMedio = "'' AS medio_pago_nombre";

      if ($mpPk && $mpNombreCol) {
        $joinMedio = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre";
      }

      $joinComprobante = oi_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')
        ? "
          LEFT JOIN comprobantes_archivos ca
            ON ca.id_movimiento = m.id_movimiento
           AND ca.tipo = 'OTROS_INGRESOS'
        "
        : "
          LEFT JOIN comprobantes_archivos ca
            ON 1 = 0
        ";

      $sqlMov = "
        SELECT
          m.id_movimiento,
          m.fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          m.id_detalle,
          m.monto_total,
          m.id_medio_pago,
          {$selectMedio},
          ca.id_comprobante,
          ca.archivo_url AS comprobante_url,
          ca.archivo_mime AS archivo_mime,
          ca.tipo AS comprobante_tipo
        FROM movimientos m
        {$joinMedio}
        {$joinComprobante}
        WHERE m.id_movimiento = :id
          AND m.id_tipo_operacion = 3
        LIMIT 1
      ";

      $stMov = $pdo->prepare($sqlMov);
      $stMov->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $stMov->execute();

      $mov = $stMov->fetch(PDO::FETCH_ASSOC);
      if (!$mov) {
        oi_json_response([
          'exito' => false,
          'mensaje' => 'Ingreso no encontrado.',
        ], 404);
      }

      $sqlItems = "
        SELECT
          mi.id_detalle,
          mi.cantidad,
          mi.precio,
          mi.iva_pct,
          mi.subtotal,
          mi.iva_monto,
          mi.total,
          COALESCE(d.nombre, '') AS detalle_nombre
        FROM movimientos_items mi
        LEFT JOIN detalles d
          ON d.id_detalle = mi.id_detalle
        WHERE mi.id_movimiento = :id
        ORDER BY mi.id_detalle ASC
      ";

      $stItems = $pdo->prepare($sqlItems);
      $stItems->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $stItems->execute();

      $items = $stItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

      if (!$items) {
        $detalleFallback = '';
        if (!empty($mov['id_detalle'])) {
          $stDet = $pdo->prepare("SELECT nombre FROM detalles WHERE id_detalle = :id LIMIT 1");
          $stDet->bindValue(':id', (int)$mov['id_detalle'], PDO::PARAM_INT);
          $stDet->execute();
          $detalleFallback = (string)($stDet->fetchColumn() ?: '');
        }

        $items[] = [
          'id_detalle' => (int)($mov['id_detalle'] ?? 0),
          'cantidad' => 1,
          'precio' => (float)($mov['monto_total'] ?? 0),
          'iva_pct' => 0,
          'subtotal' => (float)($mov['monto_total'] ?? 0),
          'iva_monto' => 0,
          'total' => (float)($mov['monto_total'] ?? 0),
          'detalle_nombre' => $detalleFallback,
        ];
      }

      $detalleTexto = implode(
        ' | ',
        array_values(
          array_filter(
            array_map(
              static fn($it) => trim((string)($it['detalle_nombre'] ?? '')),
              $items
            )
          )
        )
      );

      $mov['detalle'] = $detalleTexto;
      $mov['items'] = $items;

      oi_json_response([
        'exito' => true,
        'ingreso' => $mov,
      ]);
    } catch (Throwable $e) {
      oi_json_response([
        'exito' => false,
        'mensaje' => 'Error obteniendo otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_crear')) {
  function otros_ingresos_crear(PDO $pdo): void
  {
    try {
      $payload = oi_read_json_input();
      $check = oi_validate_payload($payload);

      if (!$check['ok']) {
        oi_json_response([
          'exito' => false,
          'mensaje' => $check['mensaje'] ?? 'Datos inválidos.',
        ], 422);
      }

      $items = $check['items'];

      $pdo->beginTransaction();

      $movData = oi_build_movimiento_data($pdo, $payload);
      $idMovimiento = oi_insert($pdo, 'movimientos', $movData);

      oi_insert_items($pdo, $idMovimiento, $items);

      $pdo->commit();

      oi_json_response([
        'exito' => true,
        'mensaje' => 'Otro ingreso creado correctamente.',
        'id_movimiento' => $idMovimiento,
        'id' => $idMovimiento,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito' => false,
        'mensaje' => 'Error creando otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_actualizar')) {
  function otros_ingresos_actualizar(PDO $pdo): void
  {
    try {
      $payload = oi_read_json_input();

      $idMovimiento = oi_int(
        $payload['id_movimiento'] ?? $payload['id_ingreso'] ?? $payload['id'] ?? 0,
        0
      );

      if ($idMovimiento <= 0) {
        oi_json_response([
          'exito' => false,
          'mensaje' => 'Falta id_movimiento.',
        ], 422);
      }

      $check = oi_validate_payload($payload);

      if (!$check['ok']) {
        oi_json_response([
          'exito' => false,
          'mensaje' => $check['mensaje'] ?? 'Datos inválidos.',
        ], 422);
      }

      $items = $check['items'];

      $pdo->beginTransaction();

      $movData = oi_build_movimiento_data($pdo, $payload);
      unset($movData['created_at']);

      oi_update($pdo, 'movimientos', $movData, $idMovimiento);

      oi_delete_items_by_movimiento($pdo, $idMovimiento);
      oi_insert_items($pdo, $idMovimiento, $items);

      $pdo->commit();

      oi_json_response([
        'exito' => true,
        'mensaje' => 'Otro ingreso actualizado correctamente.',
        'id_movimiento' => $idMovimiento,
        'id' => $idMovimiento,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito' => false,
        'mensaje' => 'Error actualizando otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_eliminar')) {
  function otros_ingresos_eliminar(PDO $pdo): void
  {
    try {
      $payload = oi_read_json_input();

      $idMovimiento = (int)(
        $_GET['id_movimiento']
        ?? $_POST['id_movimiento']
        ?? $payload['id_movimiento']
        ?? $payload['id']
        ?? 0
      );

      if ($idMovimiento <= 0) {
        oi_json_response([
          'exito' => false,
          'mensaje' => 'Falta id_movimiento.',
        ], 422);
      }

      $pdo->beginTransaction();

      $comps = [];
      if (oi_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')) {
        $stComp = $pdo->prepare("
          SELECT id_comprobante, archivo_path
          FROM comprobantes_archivos
          WHERE id_movimiento = :id_movimiento
            AND tipo = 'OTROS_INGRESOS'
          ORDER BY id_comprobante DESC
        ");
        $stComp->execute([':id_movimiento' => $idMovimiento]);
        $comps = $stComp->fetchAll(PDO::FETCH_ASSOC) ?: [];
      }

      if ($comps) {
        $stDelComp = $pdo->prepare("
          DELETE FROM comprobantes_archivos
          WHERE id_comprobante = :id
          LIMIT 1
        ");

        foreach ($comps as $comp) {
          $stDelComp->execute([
            ':id' => (int)$comp['id_comprobante'],
          ]);
        }
      }

      oi_delete_items_by_movimiento($pdo, $idMovimiento);

      $sql = "DELETE FROM movimientos WHERE id_movimiento = :id AND id_tipo_operacion = 3 LIMIT 1";
      $st = $pdo->prepare($sql);
      $st->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $st->execute();

      $pdo->commit();

      if ($comps && function_exists('oi_comp_delete_file_from_disk')) {
        foreach ($comps as $comp) {
          if (!empty($comp['archivo_path'])) {
            oi_comp_delete_file_from_disk((string)$comp['archivo_path']);
          }
        }
      }

      oi_json_response([
        'exito' => true,
        'mensaje' => 'Otro ingreso eliminado correctamente.',
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito' => false,
        'mensaje' => 'Error eliminando otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}