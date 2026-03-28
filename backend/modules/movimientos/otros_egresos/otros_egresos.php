<?php
declare(strict_types=1);

/**
 * OTROS EGRESOS
 * - movimientos.id_tipo_operacion = 4
 * - cabecera en movimientos
 * - detalle(s) en movimientos_items
 * - comprobante normal en comprobantes_archivos.id_movimiento = movimientos.id_movimiento
 *
 * EXTRA:
 * - Si el movimiento de otros egresos corresponde a un depósito de cheque/echeq:
 *   movimientos.id_detalle = movimientos_cheques.id_cheque
 *   entonces:
 *   - detalle = "DEPÓSITO CHEQUE N° xxx" / "DEPÓSITO ECHEQ N° xxx"
 *   - medio_pago_nombre = CHEQUE / ECHEQ
 *   - tercero/emisor = movimientos_cheques.emisor
 *   - EL OJO DEBE MOSTRAR EL COMPROBANTE DEL CHEQUE SI EXISTE:
 *       movimientos_cheques.id_comprobante -> comprobantes_archivos.id_comprobante
 */

if (!function_exists('oe_json_response')) {
  function oe_json_response(array $data, int $status = 200): void
  {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('oe_read_json_input')) {
  function oe_read_json_input(): array
  {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('oe_table_columns')) {
  function oe_table_columns(PDO $pdo, string $table): array
  {
    static $cache = [];
    if (isset($cache[$table])) return $cache[$table];

    $st   = $pdo->query("SHOW COLUMNS FROM `{$table}`");
    $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $cols = [];
    foreach ($rows as $r) {
      $field = (string)($r['Field'] ?? '');
      if ($field !== '') $cols[$field] = true;
    }

    $cache[$table] = $cols;
    return $cols;
  }
}

if (!function_exists('oe_has_col')) {
  function oe_has_col(PDO $pdo, string $table, string $col): bool
  {
    return isset(oe_table_columns($pdo, $table)[$col]);
  }
}

if (!function_exists('oe_pick_first_existing_col')) {
  function oe_pick_first_existing_col(PDO $pdo, string $table, array $candidates): ?string
  {
    foreach ($candidates as $c) {
      if (oe_has_col($pdo, $table, $c)) return $c;
    }
    return null;
  }
}

if (!function_exists('oe_num')) {
  function oe_num($v, float $default = 0): float
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

if (!function_exists('oe_int')) {
  function oe_int($v, int $default = 0): int
  {
    return (int)round(oe_num($v, $default));
  }
}

if (!function_exists('oe_str')) {
  function oe_str($v, string $default = ''): string
  {
    $s = trim((string)($v ?? ''));
    return $s !== '' ? $s : $default;
  }
}

if (!function_exists('oe_bool_or_null')) {
  function oe_bool_or_null($v): ?bool
  {
    if ($v === null) return null;

    if (is_bool($v)) return $v;
    if (is_int($v) || is_float($v)) return ((int)$v) !== 0;

    $s = strtolower(trim((string)$v));
    if ($s === '') return null;

    $trueValues  = ['1', 'true', 'si', 'sí', 'yes', 'on'];
    $falseValues = ['0', 'false', 'no', 'off', 'null', 'ninguno', 'ninguna'];

    if (in_array($s, $trueValues, true)) return true;
    if (in_array($s, $falseValues, true)) return false;

    return null;
  }
}

if (!function_exists('oe_guess_clasificaciones_pk')) {
  function oe_guess_clasificaciones_pk(PDO $pdo): ?string
  {
    return oe_pick_first_existing_col($pdo, 'clasificaciones', ['id_clasificacion', 'id']);
  }
}

if (!function_exists('oe_guess_clasificaciones_nombre_col')) {
  function oe_guess_clasificaciones_nombre_col(PDO $pdo): ?string
  {
    return oe_pick_first_existing_col($pdo, 'clasificaciones', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('oe_guess_medios_pago_pk')) {
  function oe_guess_medios_pago_pk(PDO $pdo): ?string
  {
    return oe_pick_first_existing_col($pdo, 'medios_pago', ['id_medio_pago', 'id']);
  }
}

if (!function_exists('oe_guess_medios_pago_nombre_col')) {
  function oe_guess_medios_pago_nombre_col(PDO $pdo): ?string
  {
    return oe_pick_first_existing_col($pdo, 'medios_pago', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('oe_guess_costo_fijo_id')) {
  function oe_guess_costo_fijo_id(PDO $pdo): ?int
  {
    static $cache = null;
    static $loaded = false;

    if ($loaded) return $cache;
    $loaded = true;
    $cache = null;

    try {
      $pk  = oe_guess_clasificaciones_pk($pdo);
      $col = oe_guess_clasificaciones_nombre_col($pdo);

      if (!$pk || !$col) return null;

      $sql = "
        SELECT `{$pk}` AS id
        FROM clasificaciones
        WHERE UPPER(TRIM(`{$col}`)) = 'COSTO FIJO'
        LIMIT 1
      ";
      $st = $pdo->query($sql);
      $id = (int)($st->fetchColumn() ?: 0);

      if ($id > 0) {
        $cache = $id;
        return $cache;
      }

      $sql = "
        SELECT `{$pk}` AS id
        FROM clasificaciones
        WHERE UPPER(`{$col}`) LIKE '%COSTO%FIJO%'
        ORDER BY `{$pk}` ASC
        LIMIT 1
      ";
      $st = $pdo->query($sql);
      $id = (int)($st->fetchColumn() ?: 0);

      if ($id > 0) {
        $cache = $id;
        return $cache;
      }

      return null;
    } catch (Throwable $e) {
      return null;
    }
  }
}

if (!function_exists('oe_is_costo_fijo_id')) {
  function oe_is_costo_fijo_id(PDO $pdo, ?int $idClasificacion): bool
  {
    $idClasificacion = (int)($idClasificacion ?? 0);
    if ($idClasificacion <= 0) return false;

    $idCostoFijo = oe_guess_costo_fijo_id($pdo);
    if ($idCostoFijo <= 0) return false;

    return $idClasificacion === $idCostoFijo;
  }
}

if (!function_exists('oe_resolve_id_clasificacion')) {
  function oe_resolve_id_clasificacion(PDO $pdo, array $payload): ?int
  {
    $idCostoFijo = oe_guess_costo_fijo_id($pdo);

    $flag = oe_bool_or_null(
      $payload['es_costo_fijo']
      ?? $payload['costo_fijo']
      ?? $payload['esCostoFijo']
      ?? $payload['is_costo_fijo']
      ?? null
    );

    if ($flag === true) {
      return $idCostoFijo > 0 ? $idCostoFijo : null;
    }

    if ($flag === false) {
      return null;
    }

    $idClasificacion = oe_int(
      $payload['id_clasificacion']
      ?? $payload['clasificacion_id']
      ?? $payload['idClasificacion']
      ?? 0,
      0
    );

    if ($idClasificacion <= 0) {
      return null;
    }

    return oe_is_costo_fijo_id($pdo, $idClasificacion) ? $idClasificacion : null;
  }
}

if (!function_exists('oe_normalize_items')) {
  function oe_normalize_items(array $payload): array
  {
    $items = [];

    if (isset($payload['items']) && is_array($payload['items'])) {
      foreach ($payload['items'] as $it) {
        if (!is_array($it)) continue;

        $idDetalle = oe_int($it['id_detalle'] ?? $it['idDetalle'] ?? 0, 0);
        $cantidad  = oe_num($it['cantidad'] ?? 0, 0);
        $precio    = oe_num($it['precio'] ?? 0, 0);
        $ivaPct    = oe_num($it['iva_pct'] ?? $it['ivaPct'] ?? 0, 0);

        if ($cantidad <= 0 || $precio <= 0) continue;

        $subtotal = oe_num($it['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto = oe_num($it['iva_monto'] ?? ($subtotal * ($ivaPct / 100)), $subtotal * ($ivaPct / 100));
        $total    = oe_num($it['total'] ?? ($subtotal + $ivaMonto), $subtotal + $ivaMonto);

        if ($subtotal <= 0 || $total <= 0) continue;

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
      $cantidad = max(1, oe_num($payload['cantidad'] ?? 1, 1));
      $precio   = oe_num($payload['precio'] ?? 0, 0);
      $ivaPct   = oe_num($payload['iva_pct'] ?? $payload['ivaPct'] ?? 0, 0);

      if ($precio > 0) {
        $subtotal  = oe_num($payload['subtotal'] ?? ($cantidad * $precio), $cantidad * $precio);
        $ivaMonto  = oe_num($payload['iva_monto'] ?? ($subtotal * ($ivaPct / 100)), $subtotal * ($ivaPct / 100));
        $total     = oe_num($payload['monto_total'] ?? $payload['total'] ?? ($subtotal + $ivaMonto), $subtotal + $ivaMonto);
        $idDetalle = oe_int($payload['id_detalle'] ?? 0, 0);

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

if (!function_exists('oe_first_item_detalle_id')) {
  function oe_first_item_detalle_id(array $items): ?int
  {
    foreach ($items as $it) {
      $id = (int)($it['id_detalle'] ?? 0);
      if ($id > 0) return $id;
    }
    return null;
  }
}

if (!function_exists('oe_sum_items_total')) {
  function oe_sum_items_total(array $items): float
  {
    $total = 0.0;
    foreach ($items as $it) $total += oe_num($it['total'] ?? 0, 0);
    return $total;
  }
}

if (!function_exists('oe_build_movimiento_data')) {
  function oe_build_movimiento_data(PDO $pdo, array $payload): array
  {
    $items           = oe_normalize_items($payload);
    $fecha           = oe_str($payload['fecha'] ?? date('Y-m-d'));
    $idMedioPago     = oe_int($payload['id_medio_pago'] ?? 0, 0);
    $idClasificacion = oe_resolve_id_clasificacion($pdo, $payload);
    $idUsuario       = oe_int($payload['idUsuario'] ?? $payload['id_usuario'] ?? 0, 0);
    $total           = oe_sum_items_total($items);
    $firstDet        = oe_first_item_detalle_id($items);

    $data = [
      'fecha'             => $fecha,
      'id_tipo_operacion' => 4,
      'id_clasificacion'  => $idClasificacion,
      'id_tipo_venta'     => null,
      'id_cliente'        => null,
      'id_proveedor'      => null,
      'id_detalle'        => $firstDet,
      'monto_total'       => $total,
      'id_medio_pago'     => $idMedioPago > 0 ? $idMedioPago : null,
    ];

    if (oe_has_col($pdo, 'movimientos', 'created_at')) {
      $data['created_at'] = date('Y-m-d H:i:s');
    }

    $colUser = oe_pick_first_existing_col($pdo, 'movimientos', ['id_usuario', 'idUsuario', 'usuario_id', 'created_by']);
    if ($colUser && $idUsuario > 0) $data[$colUser] = $idUsuario;

    return $data;
  }
}

if (!function_exists('oe_insert')) {
  function oe_insert(PDO $pdo, string $table, array $data): int
  {
    if (!$data) throw new RuntimeException("No hay datos para insertar en {$table}.");
    $cols   = array_keys($data);
    $fields = '`' . implode('`,`', $cols) . '`';
    $params = ':' . implode(',:', $cols);
    $sql    = "INSERT INTO `{$table}` ({$fields}) VALUES ({$params})";
    $st     = $pdo->prepare($sql);
    foreach ($data as $k => $v) $st->bindValue(':' . $k, $v);
    $st->execute();
    return (int)$pdo->lastInsertId();
  }
}

if (!function_exists('oe_update')) {
  function oe_update(PDO $pdo, string $table, array $data, int $id): void
  {
    if ($id <= 0) throw new RuntimeException('ID inválido para actualizar.');
    if (!$data)  throw new RuntimeException("No hay datos para actualizar en {$table}.");

    $idCol = oe_pick_first_existing_col($pdo, $table, ['id_movimiento', 'id']);
    if (!$idCol) throw new RuntimeException("No se encontró la PK de {$table}.");

    $sets = [];
    foreach ($data as $k => $v) $sets[] = "`{$k}` = :{$k}`";

    $sql = "UPDATE `{$table}` SET " . implode(', ', $sets) . " WHERE `{$idCol}` = :_id LIMIT 1";
    $st  = $pdo->prepare($sql);
    foreach ($data as $k => $v) $st->bindValue(':' . $k, $v);
    $st->bindValue(':_id', $id, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oe_delete_items_by_movimiento')) {
  function oe_delete_items_by_movimiento(PDO $pdo, int $idMovimiento): void
  {
    $st = $pdo->prepare("DELETE FROM movimientos_items WHERE id_movimiento = :id");
    $st->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
    $st->execute();
  }
}

if (!function_exists('oe_insert_items')) {
  function oe_insert_items(PDO $pdo, int $idMovimiento, array $items): void
  {
    if ($idMovimiento <= 0) throw new RuntimeException('ID de movimiento inválido para movimientos_items.');
    if (!$items) return;

    $sql = "
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ";
    $st = $pdo->prepare($sql);

    foreach ($items as $it) {
      $idDetalle = (int)($it['id_detalle'] ?? 0);
      if ($idDetalle <= 0) throw new RuntimeException('Cada fila válida debe tener id_detalle.');

      $st->bindValue(':id_movimiento', $idMovimiento, PDO::PARAM_INT);
      $st->bindValue(':id_detalle',    $idDetalle,    PDO::PARAM_INT);
      $st->bindValue(':cantidad',  oe_num($it['cantidad']  ?? 0));
      $st->bindValue(':precio',    oe_num($it['precio']    ?? 0));
      $st->bindValue(':iva_pct',   oe_num($it['iva_pct']   ?? 0));
      $st->bindValue(':subtotal',  oe_num($it['subtotal']  ?? 0));
      $st->bindValue(':iva_monto', oe_num($it['iva_monto'] ?? 0));
      $st->bindValue(':total',     oe_num($it['total']     ?? 0));
      $st->execute();
    }
  }
}

if (!function_exists('oe_validate_payload')) {
  function oe_validate_payload(PDO $pdo, array $payload): array
  {
    $fecha       = oe_str($payload['fecha'] ?? '');
    $idMedioPago = oe_int($payload['id_medio_pago'] ?? 0, 0);
    $items       = oe_normalize_items($payload);

    $flag = oe_bool_or_null(
      $payload['es_costo_fijo']
      ?? $payload['costo_fijo']
      ?? $payload['esCostoFijo']
      ?? $payload['is_costo_fijo']
      ?? null
    );

    if ($fecha === '')         return ['ok' => false, 'mensaje' => 'La fecha es obligatoria.'];
    if ($idMedioPago <= 0)     return ['ok' => false, 'mensaje' => 'El medio de pago es obligatorio.'];
    if (!$items)               return ['ok' => false, 'mensaje' => 'Debés cargar al menos un ítem válido.'];

    if ($flag === true && !oe_guess_costo_fijo_id($pdo)) {
      return ['ok' => false, 'mensaje' => 'No se encontró la clasificación COSTO FIJO en la tabla clasificaciones.'];
    }

    foreach ($items as $it) {
      if ((int)($it['id_detalle'] ?? 0) <= 0) return ['ok' => false, 'mensaje' => 'La descripción/detalle es obligatoria en todas las filas válidas.'];
      if (oe_num($it['cantidad']  ?? 0) <= 0) return ['ok' => false, 'mensaje' => 'La cantidad debe ser mayor a 0.'];
      if (oe_num($it['precio']    ?? 0) <= 0) return ['ok' => false, 'mensaje' => 'El importe debe ser mayor a 0.'];
      if (oe_num($it['subtotal']  ?? 0) <= 0) return ['ok' => false, 'mensaje' => 'El subtotal debe ser mayor a 0.'];
      if (oe_num($it['total']     ?? 0) <= 0) return ['ok' => false, 'mensaje' => 'El total debe ser mayor a 0.'];
    }

    return ['ok' => true, 'items' => $items];
  }
}

if (!function_exists('oe_is_deposito_cheque_row')) {
  function oe_is_deposito_cheque_row(array $row): bool
  {
    return
      (int)($row['id_tipo_operacion'] ?? 0) === 4 &&
      (int)($row['cheque_id'] ?? 0) > 0;
  }
}

if (!function_exists('oe_cheque_tipo_label')) {
  function oe_cheque_tipo_label(array $row): string
  {
    $tipo = strtoupper(trim((string)($row['cheque_tipo'] ?? '')));
    return $tipo !== '' ? $tipo : 'CHEQUE';
  }
}

if (!function_exists('oe_cheque_detalle_texto')) {
  function oe_cheque_detalle_texto(array $row): string
  {
    $tipo   = oe_cheque_tipo_label($row);
    $numero = trim((string)($row['cheque_numero'] ?? ''));
    return 'DEPÓSITO ' . $tipo . ($numero !== '' ? ' N° ' . $numero : '');
  }
}

/* ─────────────────────────────────────────────
   LISTAR
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_listar')) {
  function otros_egresos_listar(PDO $pdo): void
  {
    try {
      $fechaDesde = oe_str($_GET['fecha_desde'] ?? '');
      $fechaHasta = oe_str($_GET['fecha_hasta'] ?? '');
      $q          = oe_str($_GET['q'] ?? '');
      $limit      = max(1, min(500, (int)($_GET['limit']  ?? 101)));
      $offset     = max(0,          (int)($_GET['offset'] ?? 0));

      $mpPk         = oe_guess_medios_pago_pk($pdo);
      $mpNombreCol  = oe_guess_medios_pago_nombre_col($pdo);
      $clPk         = oe_guess_clasificaciones_pk($pdo);
      $clNombreCol  = oe_guess_clasificaciones_nombre_col($pdo);

      $joinMedio    = '';
      $selectMedio  = "'' AS medio_pago_nombre";

      if ($mpPk && $mpNombreCol) {
        $joinMedio   = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre";
      }

      $joinClasif   = '';
      $selectClasif = "'' AS clasificacion_nombre";

      if ($clPk && $clNombreCol) {
        $joinClasif   = " LEFT JOIN clasificaciones cl ON cl.`{$clPk}` = m.id_clasificacion ";
        $selectClasif = "COALESCE(cl.`{$clNombreCol}`, '') AS clasificacion_nombre";
      }

      $createdAtSelect = oe_has_col($pdo, 'movimientos', 'created_at')
        ? "m.created_at"
        : "NULL AS created_at";

      $joinCategoria   = '';
      $selectCategoria = "'' AS categoria";

      $hasCategoriasEgreso = false;
      try {
        $pdo->query("SELECT 1 FROM categorias_egreso LIMIT 1");
        $hasCategoriasEgreso = true;
      } catch (Throwable $e) {}

      if ($hasCategoriasEgreso && oe_has_col($pdo, 'detalles', 'id_categoria_egreso')) {
        $joinCategoria   = " LEFT JOIN categorias_egreso ce ON ce.id_categoria_egreso = d.id_categoria_egreso ";
        $selectCategoria = "COALESCE(ce.nombre, '') AS categoria";
      } elseif (oe_has_col($pdo, 'detalles', 'categoria')) {
        $selectCategoria = "COALESCE(d.categoria, '') AS categoria";
      }

      $joinComprobanteEgreso = "
        LEFT JOIN comprobantes_archivos ca_oe
          ON ca_oe.id_movimiento = m.id_movimiento
         AND ca_oe.tipo = 'OTROS_EGRESOS'
      ";

      $joinCheque = "
        LEFT JOIN movimientos_cheques mc_dep
          ON mc_dep.id_cheque = m.id_detalle
         AND m.id_tipo_operacion = 4
      ";

      $joinComprobanteCheque = "
        LEFT JOIN comprobantes_archivos ca_ch
          ON ca_ch.id_comprobante = mc_dep.id_comprobante
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
          ) AS detalle_base,
          {$selectMedio},
          {$selectClasif},
          {$selectCategoria},

          COALESCE(ca_ch.id_comprobante, ca_oe.id_comprobante) AS id_comprobante,
          COALESCE(ca_ch.archivo_url, ca_oe.archivo_url, '') AS comprobante_url,
          COALESCE(ca_ch.archivo_mime, ca_oe.archivo_mime, '') AS archivo_mime,
          COALESCE(ca_ch.tipo, ca_oe.tipo, '') AS comprobante_tipo,

          mc_dep.id_cheque AS cheque_id,
          COALESCE(mc_dep.tipo, '') AS cheque_tipo,
          COALESCE(mc_dep.emisor, '') AS cheque_emisor,
          COALESCE(mc_dep.numero_cheque, '') AS cheque_numero,
          COALESCE(mc_dep.id_comprobante, 0) AS cheque_id_comprobante
        FROM movimientos m
        LEFT JOIN movimientos_items mi ON mi.id_movimiento = m.id_movimiento
        LEFT JOIN detalles d  ON d.id_detalle  = mi.id_detalle
        LEFT JOIN detalles d0 ON d0.id_detalle = m.id_detalle
        {$joinMedio}
        {$joinClasif}
        {$joinCategoria}
        {$joinCheque}
        {$joinComprobanteCheque}
        {$joinComprobanteEgreso}
        WHERE m.id_tipo_operacion = 4
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
          COALESCE(d.nombre,  '') LIKE :q
          OR COALESCE(d0.nombre, '') LIKE :q
          OR COALESCE(CAST(m.monto_total AS CHAR), '') LIKE :q
          OR COALESCE(mc_dep.emisor, '') LIKE :q
          OR COALESCE(mc_dep.numero_cheque, '') LIKE :q
          OR UPPER(COALESCE(mc_dep.tipo, '')) LIKE UPPER(:q)
        ";
        if ($mpPk && $mpNombreCol) $sql .= " OR COALESCE(mp.`{$mpNombreCol}`, '') LIKE :q ";
        if ($clPk && $clNombreCol) $sql .= " OR COALESCE(cl.`{$clNombreCol}`, '') LIKE :q ";
        $sql .= ")";
        $params[':q'] = '%' . $q . '%';
      }

      $sql .= "
        GROUP BY
          m.id_movimiento, m.fecha, m.id_tipo_operacion, m.id_clasificacion, m.id_tipo_venta,
          m.id_cliente, m.id_proveedor, m.id_detalle, m.monto_total, m.id_medio_pago
      ";

      if (oe_has_col($pdo, 'movimientos', 'created_at')) $sql .= ", m.created_at";
      if ($mpPk && $mpNombreCol) $sql .= ", mp.`{$mpNombreCol}`";
      if ($clPk && $clNombreCol) $sql .= ", cl.`{$clNombreCol}`";
      $sql .= ",
        ca_oe.id_comprobante, ca_oe.archivo_url, ca_oe.archivo_mime, ca_oe.tipo,
        ca_ch.id_comprobante, ca_ch.archivo_url, ca_ch.archivo_mime, ca_ch.tipo,
        mc_dep.id_cheque, mc_dep.tipo, mc_dep.emisor, mc_dep.numero_cheque, mc_dep.id_comprobante
      ";

      $sql .= " ORDER BY m.fecha DESC, m.id_movimiento DESC LIMIT :limit OFFSET :offset";

      $st = $pdo->prepare($sql);
      foreach ($params as $k => $v) $st->bindValue($k, $v);
      $st->bindValue(':limit',  $limit,  PDO::PARAM_INT);
      $st->bindValue(':offset', $offset, PDO::PARAM_INT);
      $st->execute();

      $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
      $idCostoFijo = oe_guess_costo_fijo_id($pdo);

      foreach ($rows as &$row) {
        $esCostoFijo = $idCostoFijo > 0 && (int)($row['id_clasificacion'] ?? 0) === $idCostoFijo;

        if (!$esCostoFijo) {
          $row['id_clasificacion']     = null;
          $row['clasificacion_nombre'] = '';
        } else {
          $row['clasificacion_nombre'] = 'COSTO FIJO';
        }

        $row['es_costo_fijo'] = $esCostoFijo;

        if (oe_is_deposito_cheque_row($row)) {
          $row['detalle'] = oe_cheque_detalle_texto($row);
          $row['medio_pago_nombre'] = oe_cheque_tipo_label($row);
          $row['cliente_proveedor'] = (string)($row['cheque_emisor'] ?? '');
          $row['emisor'] = (string)($row['cheque_emisor'] ?? '');
        } else {
          $row['detalle'] = (string)($row['detalle_base'] ?? '');
          $row['cliente_proveedor'] = '';
          $row['emisor'] = '';
        }

        $row['tiene_comprobante'] =
          (int)($row['id_comprobante'] ?? 0) > 0 ||
          trim((string)($row['comprobante_url'] ?? '')) !== '';
      }
      unset($row);

      $pageSize = 100;
      $hasMore  = count($rows) > $pageSize;
      $pageRows = $hasMore ? array_slice($rows, 0, $pageSize) : $rows;

      oe_json_response([
        'exito'         => true,
        'otros_egresos' => $pageRows,
        'has_more'      => $hasMore,
        'next_offset'   => $hasMore ? ($offset + $pageSize) : null,
      ]);
    } catch (Throwable $e) {
      oe_json_response(['exito' => false, 'mensaje' => 'Error listando otros egresos: ' . $e->getMessage()], 500);
    }
  }
}

/* ─────────────────────────────────────────────
   OBTENER
───────────────────────────────────────────── */
if (!function_exists('otros_egresos_obtener')) {
  function otros_egresos_obtener(PDO $pdo): void
  {
    try {
      $idMovimiento = (int)($_GET['id_movimiento'] ?? $_GET['id'] ?? 0);
      if ($idMovimiento <= 0) oe_json_response(['exito' => false, 'mensaje' => 'Falta id_movimiento.'], 422);

      $mpPk        = oe_guess_medios_pago_pk($pdo);
      $mpNombreCol = oe_guess_medios_pago_nombre_col($pdo);
      $clPk        = oe_guess_clasificaciones_pk($pdo);
      $clNombreCol = oe_guess_clasificaciones_nombre_col($pdo);

      $joinMedio   = '';
      $selectMedio = "'' AS medio_pago_nombre";

      if ($mpPk && $mpNombreCol) {
        $joinMedio   = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre";
      }

      $joinClasif   = '';
      $selectClasif = "'' AS clasificacion_nombre";

      if ($clPk && $clNombreCol) {
        $joinClasif   = " LEFT JOIN clasificaciones cl ON cl.`{$clPk}` = m.id_clasificacion ";
        $selectClasif = "COALESCE(cl.`{$clNombreCol}`, '') AS clasificacion_nombre";
      }

      $joinCheque = "
        LEFT JOIN movimientos_cheques mc_dep
          ON mc_dep.id_cheque = m.id_detalle
         AND m.id_tipo_operacion = 4
      ";

      $joinComprobanteCheque = "
        LEFT JOIN comprobantes_archivos ca_ch
          ON ca_ch.id_comprobante = mc_dep.id_comprobante
      ";

      $joinComprobanteEgreso = "
        LEFT JOIN comprobantes_archivos ca_oe
          ON ca_oe.id_movimiento = m.id_movimiento
         AND ca_oe.tipo = 'OTROS_EGRESOS'
      ";

      $sqlMov = "
        SELECT
          m.id_movimiento, m.fecha, m.id_tipo_operacion, m.id_clasificacion,
          m.id_tipo_venta, m.id_cliente, m.id_proveedor, m.id_detalle,
          m.monto_total, m.id_medio_pago,
          {$selectMedio},
          {$selectClasif},

          COALESCE(ca_ch.id_comprobante, ca_oe.id_comprobante) AS id_comprobante,
          COALESCE(ca_ch.archivo_url, ca_oe.archivo_url, '') AS comprobante_url,
          COALESCE(ca_ch.archivo_mime, ca_oe.archivo_mime, '') AS archivo_mime,
          COALESCE(ca_ch.tipo, ca_oe.tipo, '') AS comprobante_tipo,

          mc_dep.id_cheque AS cheque_id,
          COALESCE(mc_dep.tipo, '') AS cheque_tipo,
          COALESCE(mc_dep.emisor, '') AS cheque_emisor,
          COALESCE(mc_dep.numero_cheque, '') AS cheque_numero,
          COALESCE(mc_dep.id_comprobante, 0) AS cheque_id_comprobante
        FROM movimientos m
        {$joinMedio}
        {$joinClasif}
        {$joinCheque}
        {$joinComprobanteCheque}
        {$joinComprobanteEgreso}
        WHERE m.id_movimiento = :id AND m.id_tipo_operacion = 4
        LIMIT 1
      ";

      $stMov = $pdo->prepare($sqlMov);
      $stMov->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $stMov->execute();

      $mov = $stMov->fetch(PDO::FETCH_ASSOC);
      if (!$mov) oe_json_response(['exito' => false, 'mensaje' => 'Egreso no encontrado.'], 404);

      $sqlItems = "
        SELECT
          mi.id_detalle, mi.cantidad, mi.precio, mi.iva_pct,
          mi.subtotal, mi.iva_monto, mi.total,
          COALESCE(d.nombre, '') AS detalle_nombre
        FROM movimientos_items mi
        LEFT JOIN detalles d ON d.id_detalle = mi.id_detalle
        WHERE mi.id_movimiento = :id
        ORDER BY mi.id_detalle ASC
      ";

      $stItems = $pdo->prepare($sqlItems);
      $stItems->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $stItems->execute();
      $items = $stItems->fetchAll(PDO::FETCH_ASSOC) ?: [];

      if (!$items) {
        $detalleFallback = '';
        if (!empty($mov['id_detalle']) && empty($mov['cheque_id'])) {
          $stDet = $pdo->prepare("SELECT nombre FROM detalles WHERE id_detalle = :id LIMIT 1");
          $stDet->bindValue(':id', (int)$mov['id_detalle'], PDO::PARAM_INT);
          $stDet->execute();
          $detalleFallback = (string)($stDet->fetchColumn() ?: '');
        }

        $items[] = [
          'id_detalle'     => empty($mov['cheque_id']) ? (int)($mov['id_detalle'] ?? 0) : 0,
          'cantidad'       => 1,
          'precio'         => (float)($mov['monto_total'] ?? 0),
          'iva_pct'        => 0,
          'subtotal'       => (float)($mov['monto_total'] ?? 0),
          'iva_monto'      => 0,
          'total'          => (float)($mov['monto_total'] ?? 0),
          'detalle_nombre' => $detalleFallback,
        ];
      }

      $detalleTexto = implode(' | ', array_values(array_filter(
        array_map(static fn($it) => trim((string)($it['detalle_nombre'] ?? '')), $items)
      )));

      $idCostoFijo = oe_guess_costo_fijo_id($pdo);
      $esCostoFijo = $idCostoFijo > 0 && (int)($mov['id_clasificacion'] ?? 0) === $idCostoFijo;

      if (oe_is_deposito_cheque_row($mov)) {
        $mov['detalle'] = oe_cheque_detalle_texto($mov);
        $mov['medio_pago_nombre'] = oe_cheque_tipo_label($mov);
        $mov['cliente_proveedor'] = (string)($mov['cheque_emisor'] ?? '');
        $mov['emisor'] = (string)($mov['cheque_emisor'] ?? '');
      } else {
        $mov['detalle'] = $detalleTexto;
        $mov['cliente_proveedor'] = '';
        $mov['emisor'] = '';
      }

      $mov['tiene_comprobante'] =
        (int)($mov['id_comprobante'] ?? 0) > 0 ||
        trim((string)($mov['comprobante_url'] ?? '')) !== '';

      $mov['items'] = $items;
      $mov['es_costo_fijo'] = $esCostoFijo;
      $mov['id_clasificacion_original'] = $mov['id_clasificacion'];

      if (!$esCostoFijo) {
        $mov['id_clasificacion'] = null;
        $mov['clasificacion_nombre'] = '';
      } else {
        $mov['clasificacion_nombre'] = 'COSTO FIJO';
      }

      oe_json_response(['exito' => true, 'egreso' => $mov]);
    } catch (Throwable $e) {
      oe_json_response(['exito' => false, 'mensaje' => 'Error obteniendo otro egreso: ' . $e->getMessage()], 500);
    }
  }
}