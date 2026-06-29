<?php
declare(strict_types=1);

require_once __DIR__ . '/helpers.php';


/* ─────────────────────────────────────────────
   Helpers edición de cheques/eCheqs de Otros Ingresos
   - Otros Ingresos es ENTRADA a cartera.
   - Si el cheque sigue en el ingreso y no fue usado por una salida/deposito,
     debe quedar activo = 1.
   - Si el cheque ya fue usado por otro movimiento, no se fuerza el vínculo
     en movimientos_medios_pago para evitar romper el UNIQUE(id_cheque), pero
     se conserva como cheque de origen por movimientos_cheques.id_movimiento.
   - Si al editar el ingreso se deja de usar el cheque y no tiene salida,
     deja de mostrarse en cartera marcándolo activo = 0.
───────────────────────────────────────────── */
if (!function_exists('oi_cheque_ids_from_medios')) {
  function oi_cheque_ids_from_medios(array $medios): array
  {
    return array_values(array_unique(array_filter(array_map(
      static fn($x) => (int)($x['id_cheque'] ?? 0),
      $medios
    ))));
  }
}

if (!function_exists('oi_fetch_cheque_ids_origen')) {
  function oi_fetch_cheque_ids_origen(PDO $pdo, int $idMovimiento): array
  {
    if ($idMovimiento <= 0 || !oi_table_exists($pdo, 'movimientos_cheques')) return [];
    if (!oi_has_col($pdo, 'movimientos_cheques', 'id_movimiento')) return [];

    $st = $pdo->prepare("\n      SELECT id_cheque\n      FROM movimientos_cheques\n      WHERE id_movimiento = :id_movimiento\n      ORDER BY id_cheque ASC\n    ");
    $st->execute([':id_movimiento' => $idMovimiento]);

    return array_values(array_unique(array_filter(array_map(
      'intval',
      $st->fetchAll(PDO::FETCH_COLUMN) ?: []
    ))));
  }
}

if (!function_exists('oi_cheques_usados_por_otro_movimiento')) {
  function oi_cheques_usados_por_otro_movimiento(PDO $pdo, int $idMovimientoOrigen, array $idsCheque): array
  {
    $idsCheque = array_values(array_unique(array_filter(array_map('intval', $idsCheque))));
    if (!$idsCheque) return [];

    $usados = [];
    $ph = implode(',', array_fill(0, count($idsCheque), '?'));

    if (oi_table_exists($pdo, 'movimientos_medios_pago') && oi_has_col($pdo, 'movimientos_medios_pago', 'id_cheque')) {
      $sql = "\n        SELECT DISTINCT id_cheque\n        FROM movimientos_medios_pago\n        WHERE id_cheque IN ($ph)\n          AND id_movimiento <> ?\n      ";
      $st = $pdo->prepare($sql);
      $i = 1;
      foreach ($idsCheque as $idCheque) $st->bindValue($i++, $idCheque, PDO::PARAM_INT);
      $st->bindValue($i, $idMovimientoOrigen, PDO::PARAM_INT);
      $st->execute();
      foreach (($st->fetchAll(PDO::FETCH_COLUMN) ?: []) as $id) $usados[(int)$id] = true;
    }

    if (oi_table_exists($pdo, 'movimientos_cheques_flujo')) {
      $eventosSalida = "'EGRESO_CARTERA','EGRESO','BAJA','SALIDA_CARTERA','DEPOSITADO_BANCO','DEPOSITO_BANCO','DEPOSITADO','DEPOSITO'";
      $sql = "\n        SELECT DISTINCT id_cheque\n        FROM movimientos_cheques_flujo\n        WHERE id_cheque IN ($ph)\n          AND COALESCE(id_movimiento, 0) <> ?\n          AND UPPER(COALESCE(evento, '')) IN ($eventosSalida)\n      ";
      $st = $pdo->prepare($sql);
      $i = 1;
      foreach ($idsCheque as $idCheque) $st->bindValue($i++, $idCheque, PDO::PARAM_INT);
      $st->bindValue($i, $idMovimientoOrigen, PDO::PARAM_INT);
      $st->execute();
      foreach (($st->fetchAll(PDO::FETCH_COLUMN) ?: []) as $id) $usados[(int)$id] = true;
    }

    return $usados;
  }
}

if (!function_exists('oi_preparar_medios_ingreso_con_cheques')) {
  function oi_preparar_medios_ingreso_con_cheques(PDO $pdo, int $idMovimiento, array $mediosValidados): array
  {
    if (!$mediosValidados) return [];

    $idsCheque = oi_cheque_ids_from_medios($mediosValidados);
    if (!$idsCheque) return $mediosValidados;

    $usadosPorOtro = oi_cheques_usados_por_otro_movimiento($pdo, $idMovimiento, $idsCheque);

    $origenPorCheque = [];
    if (oi_table_exists($pdo, 'movimientos_cheques') && oi_has_col($pdo, 'movimientos_cheques', 'id_movimiento')) {
      $ph = implode(',', array_fill(0, count($idsCheque), '?'));
      $st = $pdo->prepare("SELECT id_cheque, id_movimiento FROM movimientos_cheques WHERE id_cheque IN ($ph)");
      foreach ($idsCheque as $i => $idCheque) $st->bindValue($i + 1, $idCheque, PDO::PARAM_INT);
      $st->execute();
      foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
        $origenPorCheque[(int)$r['id_cheque']] = (int)$r['id_movimiento'];
      }
    }

    foreach ($mediosValidados as $idx => $mp) {
      $idCheque = (int)($mp['id_cheque'] ?? 0);
      if ($idCheque <= 0) continue;

      $idMovOrigenCheque = (int)($origenPorCheque[$idCheque] ?? 0);
      if ($idMovOrigenCheque > 0 && $idMovOrigenCheque !== $idMovimiento) {
        throw new RuntimeException("El cheque/eCheq ID {$idCheque} no pertenece a este ingreso. No se puede vincular como entrada.");
      }

      // Si el cheque ya salió de cartera por compra/egreso/depósito,
      // no volvemos a escribir id_cheque en movimientos_medios_pago porque
      // esa tabla tiene UNIQUE(id_cheque). El detalle visual lo reconstruye
      // el listado desde movimientos_cheques.id_movimiento.
      if (!empty($usadosPorOtro[$idCheque])) {
        $mediosValidados[$idx]['id_cheque'] = null;
      }
    }

    return $mediosValidados;
  }
}

if (!function_exists('oi_sync_estado_cheques_ingreso_editado')) {
  function oi_sync_estado_cheques_ingreso_editado(PDO $pdo, int $idMovimiento, array $chequesAntes, array $chequesDespues): void
  {
    if ($idMovimiento <= 0 || !oi_table_exists($pdo, 'movimientos_cheques')) return;

    $chequesOrigen = oi_fetch_cheque_ids_origen($pdo, $idMovimiento);
    $todos = array_values(array_unique(array_filter(array_map('intval', array_merge($chequesAntes, $chequesDespues, $chequesOrigen)))));
    if (!$todos) return;

    // Solo tocamos cheques cuyo movimiento origen es este Otro Ingreso.
    $ph = implode(',', array_fill(0, count($todos), '?'));
    $st = $pdo->prepare("\n      SELECT id_cheque\n      FROM movimientos_cheques\n      WHERE id_cheque IN ($ph)\n        AND id_movimiento = ?\n      FOR UPDATE\n    ");
    $i = 1;
    foreach ($todos as $idCheque) $st->bindValue($i++, $idCheque, PDO::PARAM_INT);
    $st->bindValue($i, $idMovimiento, PDO::PARAM_INT);
    $st->execute();
    $idsOrigen = array_values(array_unique(array_filter(array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN) ?: []))));
    if (!$idsOrigen) return;

    $despuesMap = array_fill_keys(array_values(array_unique(array_filter(array_map('intval', $chequesDespues)))), true);
    $usadosPorOtro = oi_cheques_usados_por_otro_movimiento($pdo, $idMovimiento, $idsOrigen);

    $stActivo = $pdo->prepare("UPDATE movimientos_cheques SET activo = :activo WHERE id_cheque = :id_cheque LIMIT 1");

    foreach ($idsOrigen as $idCheque) {
      $seMantieneEnIngreso = !empty($despuesMap[$idCheque]);
      $estaUsadoPorSalida = !empty($usadosPorOtro[$idCheque]);

      // Regla central para Otros Ingresos:
      // Otros Ingresos representa la ENTRADA del cheque/eCheq a cartera.
      // Si al editar el ingreso se deja de seleccionar ese cheque, NO debe quedar dado de baja:
      // sigue siendo un cheque existente y disponible mientras no haya sido usado/depositado por otro movimiento.
      // Por eso:
      // - Si NO salió por compra/egreso/depósito => activo=1.
      // - Si ya salió de cartera por otro movimiento => activo=0.
      $activo = $estaUsadoPorSalida ? 0 : 1;
      $stActivo->execute([
        ':activo' => $activo,
        ':id_cheque' => $idCheque,
      ]);
    }
  }
}


if (!function_exists('otros_ingresos_listar')) {
  function otros_ingresos_listar(PDO $pdo): void
  {
    try {
      $fechaDesde = oi_str($_GET['fecha_desde'] ?? '');
      $fechaHasta = oi_str($_GET['fecha_hasta'] ?? '');
      $q          = oi_str($_GET['q'] ?? '');
      $pageSize   = max(1, min(500, oi_int($_GET['limit'] ?? 101, 101) - 1));
      $limitPlus  = $pageSize + 1;
      $offset     = max(0, oi_int($_GET['offset'] ?? 0, 0));

      $detPk        = oi_guess_detalles_pk($pdo);
      $detNombreCol = oi_guess_detalles_nombre_col($pdo);
      $mpPk         = oi_guess_medios_pago_pk($pdo);
      $mpNombreCol  = oi_guess_medios_pago_nombre_col($pdo);

      $joinMedio   = '';
      $selectMedio = "'' AS medio_pago_nombre";

      if ($mpPk && $mpNombreCol) {
        $joinMedio   = " LEFT JOIN medios_pago mp ON mp.`{$mpPk}` = m.id_medio_pago ";
        $selectMedio = "COALESCE(mp.`{$mpNombreCol}`, '') AS medio_pago_nombre";
      }

      $createdAtSelect = oi_has_col($pdo, 'movimientos', 'created_at')
        ? 'm.created_at'
        : 'NULL AS created_at';

      $joinComprobante = oi_has_col($pdo, 'comprobantes_archivos', 'id_movimiento')
        ? "
          LEFT JOIN comprobantes_archivos ca
            ON ca.id_movimiento = m.id_movimiento
           AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(ca.tipo,''), ' ', ''), '-', ''), '_', '')) IN ('OTROSINGRESOS', 'OTROINGRESO')
        "
        : " LEFT JOIN comprobantes_archivos ca ON 1 = 0 ";

      $joinDetalleItems = "";
      $detalleExpr      = "'' AS detalle";
      $qDetalleItemExpr = "''";

      if ($detPk && $detNombreCol) {
        $joinDetalleItems = " LEFT JOIN detalles dti ON dti.`{$detPk}` = mi.id_detalle ";
        $detalleExpr      = "
          COALESCE(
            GROUP_CONCAT(DISTINCT dti.`{$detNombreCol}` ORDER BY dti.`{$detNombreCol}` SEPARATOR ' | '),
            ''
          ) AS detalle
        ";
        $qDetalleItemExpr = "COALESCE(dti.`{$detNombreCol}`, '')";
      }

      $sql = "
        SELECT
          m.id_movimiento,
          m.fecha,
          m.id_tipo_operacion,
          m.id_clasificacion,
          m.id_tipo_venta,
          m.id_cliente,
          m.id_proveedor,
          m.monto_total,
          m.id_medio_pago,
          {$createdAtSelect},
          {$detalleExpr},
          {$selectMedio},
          MAX(ca.id_comprobante) AS id_comprobante,
          MAX(ca.archivo_url) AS comprobante_url,
          MAX(ca.archivo_mime) AS archivo_mime,
          MAX(ca.tipo) AS comprobante_tipo
        FROM movimientos m
        LEFT JOIN movimientos_items mi
          ON mi.id_movimiento = m.id_movimiento
        {$joinDetalleItems}
        {$joinMedio}
        {$joinComprobante}
        WHERE m.id_tipo_operacion = 3
      ";

      $params = [];

      if ($fechaDesde !== '') {
        $sql .= ' AND m.fecha >= :fecha_desde';
        $params[':fecha_desde'] = $fechaDesde;
      }

      if ($fechaHasta !== '') {
        $sql .= ' AND m.fecha <= :fecha_hasta';
        $params[':fecha_hasta'] = $fechaHasta;
      }

      if ($q !== '') {
        $sql .= " AND (
          {$qDetalleItemExpr} LIKE :q
          OR COALESCE(CAST(m.monto_total AS CHAR), '') LIKE :q
        ";
        if ($mpPk && $mpNombreCol) {
          $sql .= " OR COALESCE(mp.`{$mpNombreCol}`, '') LIKE :q ";
        }
        $sql .= ')';
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
          m.monto_total,
          m.id_medio_pago
        ORDER BY m.fecha DESC, m.id_movimiento DESC
        LIMIT {$limitPlus} OFFSET {$offset}
      ";

      $st = $pdo->prepare($sql);
      foreach ($params as $k => $v) {
        $st->bindValue($k, $v);
      }
      $st->execute();

      $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
      $hasMore = count($rows) > $pageSize;
      if ($hasMore) array_pop($rows);

      $ids = array_values(array_filter(array_map(static fn($r) => (int)($r['id_movimiento'] ?? 0), $rows)));
      $mediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, $ids);
      $itemsMap  = oi_fetch_items_by_movimientos($pdo, $ids);
      $comprobantesMap = oi_fetch_comprobantes_by_movimientos_global($pdo, $ids);

      foreach ($rows as &$row) {
        $idMov = (int)($row['id_movimiento'] ?? 0);
        $mediosDetalle = $mediosMap[$idMov] ?? [];
        $itemsDetalle  = $itemsMap[$idMov] ?? [];
        $compGlobal = $comprobantesMap[$idMov] ?? null;
        if ($compGlobal && empty($row['id_comprobante'])) {
          $row['id_comprobante']  = (int)($compGlobal['id_comprobante'] ?? 0);
          $row['comprobante_url'] = (string)($compGlobal['archivo_url'] ?? '');
          $row['archivo_mime']    = (string)($compGlobal['archivo_mime'] ?? '');
          $row['comprobante_tipo']= (string)($compGlobal['tipo'] ?? '');
        }

        $detalleOriginal = implode(' | ', array_values(array_filter(array_map(
          static fn($it) => trim((string)($it['detalle_nombre'] ?? $it['producto_nombre'] ?? '')),
          $itemsDetalle
        ))));

        $row['detalle_original'] = $detalleOriginal;
        $row['detalle']          = oi_productos_label($itemsDetalle);
        $row['cantidad_items']   = count($itemsDetalle);
        $row['items_detalle']    = $itemsDetalle;

        if ($mediosDetalle) {
          $row['cantidad_medios_pago'] = count($mediosDetalle);
          $row['medios_pago_detalle']  = $mediosDetalle;
          $row['medio_pago_nombre']    = mv_medios_pago_resumen($mediosDetalle, (string)($row['medio_pago_nombre'] ?? ''));
        } else {
          $row['cantidad_medios_pago'] = 0;
          $row['medios_pago_detalle']  = [];
        }

        $montoTotal = oi_round_money((float)($row['monto_total'] ?? 0));
        $cobradoTotal = oi_suma_medios_validados($mediosDetalle);
        $saldoPendiente = oi_round_money(max(0.0, $montoTotal - $cobradoTotal));
        $estadoPago = oi_estado_pago($montoTotal, $cobradoTotal);

        $row['cobrado_total'] = $cobradoTotal;
        $row['saldo_pendiente'] = $saldoPendiente;
        $row['estado_pago'] = $estadoPago;
        $row['pagado'] = ($estadoPago === 'pagado');
      }
      unset($row);

      oi_json_response([
        'exito'          => true,
        'otros_ingresos' => $rows,
        'has_more'       => $hasMore,
        'next_offset'    => $hasMore ? ($offset + $pageSize) : null,
      ]);
    } catch (Throwable $e) {
      oi_json_response([
        'exito'   => false,
        'mensaje' => 'Error listando otros ingresos: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_obtener')) {
  function otros_ingresos_obtener(PDO $pdo): void
  {
    try {
      $idMovimiento = oi_int($_GET['id_movimiento'] ?? $_GET['id'] ?? 0, 0);
      if ($idMovimiento <= 0) {
        throw new RuntimeException('Falta id_movimiento.');
      }

      $mov = oi_fetch_movimiento_by_id($pdo, $idMovimiento);
      if (!$mov || (int)($mov['id_tipo_operacion'] ?? 0) !== 3) {
        throw new RuntimeException('El movimiento indicado no existe o no pertenece a Otros Ingresos.');
      }

      $items = oi_fetch_items_by_movimiento($pdo, $idMovimiento);

      if (!$items) {
        $items[] = [
          'id_detalle'        => 0,
          'id_stock_producto' => 0,
          'cantidad'          => 1,
          'precio'            => (float)($mov['monto_total'] ?? 0),
          'iva_pct'           => 0,
          'subtotal'          => (float)($mov['monto_total'] ?? 0),
          'iva_monto'         => 0,
          'total'             => (float)($mov['monto_total'] ?? 0),
          'detalle_nombre'    => '',
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

      $mediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
      $mediosDetalle = $mediosMap[$idMovimiento] ?? [];

      $mov['id_stock_producto']      = null;
      $mov['id_detalle']             = null;
      $mov['detalle']                = $detalleTexto;
      $mov['items']                  = $items;
      $mov['items_detalle']          = $items;
      $mov['cantidad_items']         = count($items);
      $mov['medios_pago_detalle']    = $mediosDetalle;
      $mov['cantidad_medios_pago']   = count($mediosDetalle);
      if ($mediosDetalle) {
        $mov['medio_pago_nombre'] = mv_medios_pago_resumen($mediosDetalle, (string)($mov['medio_pago_nombre'] ?? ''));
      }

      $montoTotal = oi_round_money((float)($mov['monto_total'] ?? 0));
      $cobradoTotal = oi_suma_medios_validados($mediosDetalle);
      $saldoPendiente = oi_round_money(max(0.0, $montoTotal - $cobradoTotal));
      $estadoPago = oi_estado_pago($montoTotal, $cobradoTotal);
      $mov['cobrado_total'] = $cobradoTotal;
      $mov['saldo_pendiente'] = $saldoPendiente;
      $mov['estado_pago'] = $estadoPago;
      $mov['pagado'] = ($estadoPago === 'pagado');

      oi_json_response([
        'exito'   => true,
        'ingreso' => $mov,
      ]);
    } catch (Throwable $e) {
      oi_json_response([
        'exito'   => false,
        'mensaje' => 'Error obteniendo otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_crear')) {
  function otros_ingresos_crear(PDO $pdo): void
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

      $check = oi_validate_payload($pdo, $payload);
      if (!($check['ok'] ?? false)) {
        oi_json_response([
          'exito'   => false,
          'mensaje' => $check['mensaje'] ?? 'Datos inválidos.',
        ], 422);
      }

      $items           = $check['items'] ?? [];
      $mediosPagoRaw   = $check['medios_raw'] ?? [];
      $totalEsperado   = oi_sum_items_total($items);
      $mediosValidados = oi_validar_medios_pago_parcial($pdo, $mediosPagoRaw, $totalEsperado, ['permitir_vacio' => true, 'empty_message' => 'Debés indicar al menos un medio de pago.', 'total_label' => 'ingreso']);
      $movimientoData  = oi_build_movimiento_data($pdo, $payload);
      if (!empty($mediosValidados)) {
        $movimientoData['id_medio_pago'] = (int)$mediosValidados[0]['id_medio_pago'];
      }

      $pdo->beginTransaction();

      $idMovimiento = oi_insert($pdo, 'movimientos', $movimientoData);
      oi_insert_items($pdo, $idMovimiento, $items);
      $mediosInsertados = mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosValidados, ['contexto' => 'otro ingreso', 'salida_cheque' => false, 'fallback_sin_tabla' => true]);

      $pdo->commit();

      $movGuardado   = oi_fetch_movimiento_by_id($pdo, $idMovimiento);
      $itemsGuardado = oi_fetch_items_by_movimiento($pdo, $idMovimiento);

      oi_audit_safe($pdo, $idUsuario, 'crear', 'otros_ingresos', $idMovimiento, [
        'creado'              => true,
        'nuevo'               => [
          'movimiento' => $movGuardado,
          'items'      => $itemsGuardado,
        ],
        'medios_pago_detalle' => $mediosInsertados ?: $mediosValidados,
      ]);

      oi_json_response([
        'exito'               => true,
        'mensaje'             => 'Otro ingreso creado correctamente.',
        'id_movimiento'       => $idMovimiento,
        'medios_pago'         => count($mediosInsertados ?: $mediosValidados),
        'medios_pago_detalle' => $mediosInsertados ?: $mediosValidados,
        'audit_debug'         => [
          'idUsuario_auditoria' => $idUsuario,
          'audit_intentado'     => $idUsuario > 0,
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito'   => false,
        'mensaje' => 'Error guardando otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_actualizar')) {
  function otros_ingresos_actualizar(PDO $pdo): void
  {
    try {
      if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'Método no permitido.',
        ], 405);
      }

      $payload      = oi_read_request_data();
      $idUsuario    = oi_resolver_usuario_auditoria($pdo, $payload);
      $idMovimiento = oi_int($payload['id_movimiento'] ?? $payload['id'] ?? 0, 0);

      if ($idMovimiento <= 0) {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'Falta id_movimiento.',
        ], 422);
      }

      $before = oi_fetch_movimiento_by_id($pdo, $idMovimiento);
      if (!$before || (int)($before['id_tipo_operacion'] ?? 0) !== 3) {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'El movimiento indicado no existe o no pertenece a Otros Ingresos.',
        ], 404);
      }

      $itemsAntes = oi_fetch_items_by_movimiento($pdo, $idMovimiento);
      $beforeMediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
      $beforeMedios = $beforeMediosMap[$idMovimiento] ?? [];
      $chequesAntes = array_values(array_unique(array_filter(array_map('intval', array_merge(
        oi_cheque_ids_from_medios($beforeMedios),
        oi_fetch_cheque_ids_origen($pdo, $idMovimiento)
      )))));

      $check = oi_validate_payload($pdo, $payload);
      if (!($check['ok'] ?? false)) {
        oi_json_response([
          'exito'   => false,
          'mensaje' => $check['mensaje'] ?? 'Datos inválidos.',
        ], 422);
      }

      $items           = $check['items'] ?? [];
      $mediosPagoRaw   = $check['medios_raw'] ?? [];
      $totalEsperado   = oi_sum_items_total($items);
      $mediosValidados = oi_validar_medios_pago_parcial($pdo, $mediosPagoRaw, $totalEsperado, ['permitir_vacio' => true, 'empty_message' => 'Debés indicar al menos un medio de pago.', 'total_label' => 'ingreso']);
      $chequesDespues = oi_cheque_ids_from_medios($mediosValidados);
      $mediosParaGuardar = oi_preparar_medios_ingreso_con_cheques($pdo, $idMovimiento, $mediosValidados);
      $movimientoData  = oi_build_movimiento_data($pdo, $payload);
      if (!empty($mediosValidados)) {
        $movimientoData['id_medio_pago'] = (int)$mediosValidados[0]['id_medio_pago'];
      }

      $pdo->beginTransaction();

      unset($movimientoData['created_at']);
      oi_update($pdo, 'movimientos', $movimientoData, $idMovimiento);
      oi_delete_items_by_movimiento($pdo, $idMovimiento);
      oi_insert_items($pdo, $idMovimiento, $items);
      mv_medios_pago_eliminar_por_movimiento($pdo, $idMovimiento);
      $mediosInsertados = mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosParaGuardar, ['contexto' => 'otro ingreso', 'salida_cheque' => false, 'fallback_sin_tabla' => true]);
      oi_sync_estado_cheques_ingreso_editado($pdo, $idMovimiento, $chequesAntes, $chequesDespues);

      $pdo->commit();

      $after     = oi_fetch_movimiento_by_id($pdo, $idMovimiento);
      $itemsDesp = oi_fetch_items_by_movimiento($pdo, $idMovimiento);

      oi_audit_safe($pdo, $idUsuario, 'editar', 'otros_ingresos', $idMovimiento, [
        'editado' => true,
        'antes'   => [
          'movimiento'   => $before,
          'items'        => $itemsAntes,
          'medios_pago'  => $beforeMedios,
          'cheques'      => $chequesAntes,
        ],
        'despues' => [
          'movimiento'         => $after,
          'items'              => $itemsDesp,
          'medios_pago_detalle'=> $mediosInsertados ?: $mediosParaGuardar,
          'cheques'            => $chequesDespues,
        ],
      ]);

      oi_json_response([
        'exito'               => true,
        'mensaje'             => 'Otro ingreso actualizado correctamente.',
        'id_movimiento'       => $idMovimiento,
        'medios_pago'         => count($mediosInsertados ?: $mediosParaGuardar),
        'medios_pago_detalle' => $mediosInsertados ?: $mediosParaGuardar,
        'cheques_antes'       => $chequesAntes,
        'cheques_despues'     => $chequesDespues,
        'audit_debug'         => [
          'idUsuario_auditoria' => $idUsuario,
          'audit_intentado'     => $idUsuario > 0,
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito'   => false,
        'mensaje' => 'Error actualizando otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}


if (!function_exists('otros_ingresos_confirmar_pago')) {
  function otros_ingresos_confirmar_pago(PDO $pdo): void
  {
    try {
      if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'Método no permitido.',
        ], 405);
      }

      $payload = oi_read_request_data();
      $idUsuario = oi_resolver_usuario_auditoria($pdo, $payload);

      $ids = [];
      foreach (['ids_movimiento', 'ids_movimientos', 'movimientos', 'ids'] as $key) {
        if (isset($payload[$key]) && is_array($payload[$key])) {
          foreach ($payload[$key] as $id) {
            $id = (int)$id;
            if ($id > 0) $ids[] = $id;
          }
        }
      }
      $idUnico = (int)($payload['id_movimiento'] ?? $payload['id'] ?? 0);
      if ($idUnico > 0) $ids[] = $idUnico;
      $ids = array_values(array_unique(array_filter($ids)));

      if (!$ids) {
        oi_json_response([
          'exito' => false,
          'mensaje' => 'Debés seleccionar al menos un ingreso para cobrar.',
        ], 422);
      }

      $mediosPagoRaw = isset($payload['medios_pago']) && is_array($payload['medios_pago']) ? $payload['medios_pago'] : [];
      if (!$mediosPagoRaw) {
        oi_json_response([
          'exito' => false,
          'mensaje' => 'Debés indicar al menos un medio de pago.',
        ], 422);
      }

      $pdo->beginTransaction();

      $pendientes = [];
      $saldoTotal = 0.0;
      $movimientosAntes = [];
      $mediosAntesPorMovimiento = [];

      foreach ($ids as $idMovimiento) {
        $stMov = $pdo->prepare("\n          SELECT *\n          FROM movimientos\n          WHERE id_movimiento = :id_movimiento\n          LIMIT 1\n          FOR UPDATE\n        ");
        $stMov->execute([':id_movimiento' => $idMovimiento]);
        $mov = $stMov->fetch(PDO::FETCH_ASSOC);

        if (!$mov || (int)($mov['id_tipo_operacion'] ?? 0) !== 3) {
          throw new RuntimeException('El ingreso seleccionado no existe o no pertenece a Otros Ingresos.');
        }

        $mediosActuales = mv_medios_pago_movimiento_for_update($pdo, $idMovimiento);
        if (!$mediosActuales) {
          $mediosMap = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
          $mediosActuales = $mediosMap[$idMovimiento] ?? [];
        }

        $montoTotal = oi_round_money((float)($mov['monto_total'] ?? 0));
        $cobradoTotal = oi_suma_medios_validados($mediosActuales);
        $saldo = oi_round_money(max(0.0, $montoTotal - $cobradoTotal));

        $movimientosAntes[$idMovimiento] = $mov;
        $mediosAntesPorMovimiento[$idMovimiento] = $mediosActuales;

        if ($saldo > 0.00001) {
          $pendientes[] = [
            'id_movimiento' => $idMovimiento,
            'monto_total' => $montoTotal,
            'cobrado_total' => $cobradoTotal,
            'saldo' => $saldo,
            'monto' => $saldo,
          ];
          $saldoTotal = oi_round_money($saldoTotal + $saldo);
        }
      }

      if (empty($pendientes) || $saldoTotal <= 0.00001) {
        throw new RuntimeException('Los ingresos seleccionados ya están cobrados.');
      }

      $mediosValidados = oi_validar_medios_pago_parcial($pdo, $mediosPagoRaw, $saldoTotal, [
        'permitir_vacio' => false,
        'empty_message' => 'Debés indicar al menos un medio de pago.',
        'total_label' => 'ingreso',
      ]);
      $montoPago = oi_suma_medios_validados($mediosValidados);

      if ($montoPago <= 0.00001) {
        throw new RuntimeException('El importe cobrado debe ser mayor a 0.');
      }
      if ($montoPago > ($saldoTotal + 0.05)) {
        throw new RuntimeException(sprintf(
          'La suma de los medios de pago ($%.2f) no puede superar el saldo pendiente ($%.2f).',
          $montoPago,
          $saldoTotal
        ));
      }

      $distribucion = oi_distribuir_pago_equitativo($pendientes, $montoPago);
      if (!$distribucion) {
        throw new RuntimeException('No se pudo distribuir el cobro entre los ingresos seleccionados.');
      }

      $mediosPorMovimiento = oi_distribuir_medios_pago_por_movimiento($distribucion, $mediosValidados);
      $mediosInsertadosPorMovimiento = [];

      foreach ($distribucion as $p) {
        $idMovimiento = (int)($p['id_movimiento'] ?? 0);
        $rowsMedios = $mediosPorMovimiento[$idMovimiento] ?? [];
        if ($idMovimiento <= 0 || !$rowsMedios) continue;

        $mediosParaGuardar = oi_preparar_medios_ingreso_con_cheques($pdo, $idMovimiento, $rowsMedios);
        $insertados = mv_medios_pago_insertar_multi($pdo, $idMovimiento, $mediosParaGuardar, [
          'contexto' => 'otro ingreso',
          'salida_cheque' => false,
          'fallback_sin_tabla' => true,
          'borrar_duplicado_mismo_movimiento' => false,
        ]);
        $mediosInsertadosPorMovimiento[$idMovimiento] = $insertados ?: $mediosParaGuardar;

        if (oi_has_col($pdo, 'movimientos', 'id_medio_pago')) {
          $firstId = (int)($rowsMedios[0]['id_medio_pago'] ?? 0);
          if ($firstId > 0 && empty($movimientosAntes[$idMovimiento]['id_medio_pago'])) {
            $stUpd = $pdo->prepare("UPDATE movimientos SET id_medio_pago = :id_medio_pago WHERE id_movimiento = :id_movimiento LIMIT 1");
            $stUpd->execute([
              ':id_medio_pago' => $firstId,
              ':id_movimiento' => $idMovimiento,
            ]);
          }
        }
      }

      $saldoRestante = oi_round_money(max(0.0, $saldoTotal - $montoPago));

      oi_audit_safe($pdo, $idUsuario, 'confirmar_pago', 'otros_ingresos', null, [
        'ids_movimiento' => $ids,
        'saldo_total_previo' => $saldoTotal,
        'monto_pagado' => $montoPago,
        'saldo_total_restante' => $saldoRestante,
        'distribucion' => $distribucion,
        'medios_insertados' => $mediosInsertadosPorMovimiento,
      ]);

      $pdo->commit();

      oi_json_response([
        'exito' => true,
        'mensaje' => $saldoRestante <= 0.00001
          ? 'Ingreso cobrado correctamente.'
          : 'Cobro parcial registrado correctamente.',
        'tipo_pago' => $saldoRestante <= 0.00001 ? 'pago_total' : 'pago_parcial',
        'monto_pagado' => $montoPago,
        'saldo_total_previo' => $saldoTotal,
        'saldo_total_restante' => $saldoRestante,
        'distribucion' => $distribucion,
        'medios_pago_detalle' => $mediosInsertadosPorMovimiento,
        'audit_debug' => [
          'idUsuario_auditoria' => $idUsuario,
          'audit_intentado' => $idUsuario > 0,
        ],
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito' => false,
        'mensaje' => 'Error confirmando cobro de otros ingresos: ' . $e->getMessage(),
      ], 500);
    }
  }
}

if (!function_exists('otros_ingresos_eliminar')) {
  function otros_ingresos_eliminar(PDO $pdo): void
  {
    try {
      if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'Método no permitido.',
        ], 405);
      }

      $payload      = oi_read_request_data();
      $idUsuario    = oi_resolver_usuario_auditoria($pdo, $payload);
      $idMovimiento = oi_int(
        $payload['id_movimiento'] ?? $_GET['id_movimiento'] ?? $_POST['id_movimiento'] ?? 0,
        0
      );

      if ($idMovimiento <= 0) {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'Falta id_movimiento.',
        ], 422);
      }

      $before = oi_fetch_movimiento_by_id($pdo, $idMovimiento);
      if (!$before || (int)($before['id_tipo_operacion'] ?? 0) !== 3) {
        oi_json_response([
          'exito'   => false,
          'mensaje' => 'El movimiento indicado no existe o no pertenece a Otros Ingresos.',
        ], 404);
      }

      $itemsAntes        = oi_fetch_items_by_movimiento($pdo, $idMovimiento);
      $comprobantesAntes = oi_fetch_comprobantes_by_movimiento($pdo, $idMovimiento);
      $mediosAntesMap    = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
      $mediosAntes       = $mediosAntesMap[$idMovimiento] ?? [];

      $chequesAntes = [];
      if (oi_table_exists($pdo, 'movimientos_cheques') && oi_has_col($pdo, 'movimientos_cheques', 'id_movimiento')) {
        $stCheques = $pdo->prepare("
          SELECT *
          FROM movimientos_cheques
          WHERE id_movimiento = :id_movimiento
          ORDER BY id_cheque ASC
        ");
        $stCheques->execute([':id_movimiento' => $idMovimiento]);
        $chequesAntes = $stCheques->fetchAll(PDO::FETCH_ASSOC) ?: [];
      }

      $pathsToDelete = array_values(array_filter(array_map(
        static fn($row) => (string)($row['archivo_path'] ?? ''),
        $comprobantesAntes
      )));

      $pdo->beginTransaction();

      // IMPORTANTE: primero se eliminan/desvinculan los medios de pago.
      // movimientos_medios_pago.id_cheque tiene FK hacia movimientos_cheques.id_cheque.
      // Si borramos el cheque antes, MySQL bloquea la eliminación con error 1451.
      mv_medios_pago_eliminar_por_movimiento($pdo, $idMovimiento);

      if (!empty($chequesAntes) && oi_table_exists($pdo, 'movimientos_cheques_flujo')) {
        $idsChequesFlujo = array_values(array_filter(array_map(
          static fn($r) => (int)($r['id_cheque'] ?? 0),
          $chequesAntes
        )));

        if (!empty($idsChequesFlujo)) {
          $placeholdersFlujo = implode(',', array_fill(0, count($idsChequesFlujo), '?'));
          $stDelFlujo = $pdo->prepare("DELETE FROM movimientos_cheques_flujo WHERE id_cheque IN ($placeholdersFlujo)");
          $stDelFlujo->execute($idsChequesFlujo);
        }
      }

      if (oi_table_exists($pdo, 'movimientos_cheques') && oi_has_col($pdo, 'movimientos_cheques', 'id_movimiento')) {
        $stDelCheques = $pdo->prepare("
          DELETE FROM movimientos_cheques
          WHERE id_movimiento = :id_movimiento
        ");
        $stDelCheques->execute([':id_movimiento' => $idMovimiento]);
      }

      if (!empty($comprobantesAntes)) {
        $idsComprobanteToDelete = array_values(array_filter(array_map(
          static fn($r) => (int)($r['id_comprobante'] ?? 0),
          $comprobantesAntes
        )));

        if (!empty($idsComprobanteToDelete)) {
          $placeholders = implode(',', array_fill(0, count($idsComprobanteToDelete), '?'));
          $stDelComp    = $pdo->prepare("
            DELETE FROM comprobantes_archivos
            WHERE id_comprobante IN ($placeholders)
          ");
          $stDelComp->execute(array_values($idsComprobanteToDelete));
        }
      }

      oi_delete_items_by_movimiento($pdo, $idMovimiento);

      $sql = 'DELETE FROM movimientos WHERE id_movimiento = :id AND id_tipo_operacion = 3 LIMIT 1';
      $st  = $pdo->prepare($sql);
      $st->bindValue(':id', $idMovimiento, PDO::PARAM_INT);
      $st->execute();

      if ($st->rowCount() <= 0) {
        throw new RuntimeException('No se pudo eliminar el movimiento de otros ingresos.');
      }

      $pdo->commit();

      foreach ($pathsToDelete as $path) {
        oi_comp_delete_file_from_disk((string)$path);
      }

      oi_audit_safe($pdo, $idUsuario, 'eliminar', 'otros_ingresos', $idMovimiento, [
        'eliminado'    => true,
        'antes'        => $before,
        'items'        => $itemsAntes,
        'medios_pago'  => $mediosAntes,
        'cheques'      => $chequesAntes,
        'comprobantes' => $comprobantesAntes,
      ]);

      oi_json_response([
        'exito'   => true,
        'mensaje' => 'Otro ingreso eliminado correctamente.',
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }

      oi_json_response([
        'exito'   => false,
        'mensaje' => 'Error eliminando otro ingreso: ' . $e->getMessage(),
      ], 500);
    }
  }
}
