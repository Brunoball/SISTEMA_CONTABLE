<?php
declare(strict_types=1);

require_once __DIR__ . '/../core/plan_saas.php';
require_once __DIR__ . '/cheques.php';

/* =========================================================
   GLOBAL - medios de pago de movimientos
   Centraliza extracción, validación, persistencia, consulta,
   borrado y vínculo con cheques/eCheqs.
========================================================= */

if (!function_exists('mv_medios_pago_norm_text')) {
  function mv_medios_pago_norm_text(string $s): string
  {
    $s = trim(mb_strtolower($s, 'UTF-8'));
    $map = [
      'á'=>'a','à'=>'a','ä'=>'a','â'=>'a',
      'é'=>'e','è'=>'e','ë'=>'e','ê'=>'e',
      'í'=>'i','ì'=>'i','ï'=>'i','î'=>'i',
      'ó'=>'o','ò'=>'o','ö'=>'o','ô'=>'o',
      'ú'=>'u','ù'=>'u','ü'=>'u','û'=>'u',
      'ñ'=>'n',
    ];
    $s = strtr($s, $map);
    return preg_replace('/\s+/', ' ', $s) ?? $s;
  }
}

if (!function_exists('mv_medios_pago_safe_ident')) {
  function mv_medios_pago_safe_ident(string $name): string
  {
    $name = trim($name);
    if ($name === '' || !preg_match('/^[A-Za-z0-9_]+$/', $name)) {
      throw new RuntimeException('Identificador SQL inválido.');
    }
    return $name;
  }
}

if (!function_exists('mv_medios_pago_cache_key')) {
  function mv_medios_pago_cache_key(PDO $pdo, string $table): string
  {
    $db = '';
    try {
      $db = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
    } catch (Throwable $e) {
      $db = 'default';
    }

    return strtolower($db . '.' . $table);
  }
}

if (!function_exists('mv_medios_pago_table_exists')) {
  function mv_medios_pago_table_exists(PDO $pdo, string $table): bool
  {
    static $cache = [];

    try {
      $table = mv_medios_pago_safe_ident($table);
    } catch (Throwable $e) {
      return false;
    }

    $key = mv_medios_pago_cache_key($pdo, $table);
    if (array_key_exists($key, $cache)) return $cache[$key];

    // Evitamos SHOW TABLES LIKE con parámetros porque en algunos hosting/PDO
    // devuelve resultados inconsistentes. Esta consulta directa es más segura.
    try {
      $pdo->query("SELECT 1 FROM `{$table}` LIMIT 1");
      $cache[$key] = true;
      return true;
    } catch (Throwable $e) {
      try {
        $st = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t");
        $st->execute([':t' => $table]);
        $cache[$key] = ((int)$st->fetchColumn() > 0);
      } catch (Throwable $e2) {
        $cache[$key] = false;
      }
    }

    return $cache[$key];
  }
}

if (!function_exists('mv_medios_pago_columns')) {
  function mv_medios_pago_columns(PDO $pdo, string $table): array
  {
    static $cache = [];

    try {
      $table = mv_medios_pago_safe_ident($table);
    } catch (Throwable $e) {
      return [];
    }

    $key = mv_medios_pago_cache_key($pdo, $table);
    if (array_key_exists($key, $cache)) return $cache[$key];

    $cols = [];
    try {
      // Evitamos SHOW COLUMNS ... LIKE :param porque fue la causa del falso
      // "id_medio_pago no existe" en algunos entornos. Traemos columnas y filtramos en PHP.
      $rs = $pdo->query("SHOW COLUMNS FROM `{$table}`");
      foreach (($rs ? $rs->fetchAll(PDO::FETCH_ASSOC) : []) as $row) {
        $field = (string)($row['Field'] ?? '');
        if ($field !== '') $cols[strtolower($field)] = $field;
      }
    } catch (Throwable $e) {
      try {
        $rs = $pdo->query("DESCRIBE `{$table}`");
        foreach (($rs ? $rs->fetchAll(PDO::FETCH_ASSOC) : []) as $row) {
          $field = (string)($row['Field'] ?? '');
          if ($field !== '') $cols[strtolower($field)] = $field;
        }
      } catch (Throwable $e2) {
        $cols = [];
      }
    }

    $cache[$key] = $cols;
    return $cols;
  }
}

if (!function_exists('mv_medios_pago_has_col')) {
  function mv_medios_pago_has_col(PDO $pdo, string $table, string $col): bool
  {
    $cols = mv_medios_pago_columns($pdo, $table);
    return isset($cols[strtolower($col)]);
  }
}

if (!function_exists('mv_medios_pago_pick_first_existing_col')) {
  function mv_medios_pago_pick_first_existing_col(PDO $pdo, string $table, array $cols): ?string
  {
    foreach ($cols as $c) {
      if (mv_medios_pago_has_col($pdo, $table, (string)$c)) {
        return (string)$c;
      }
    }
    return null;
  }
}

if (!function_exists('mv_medios_pago_pk')) {
  function mv_medios_pago_pk(PDO $pdo): ?string
  {
    return mv_medios_pago_pick_first_existing_col($pdo, 'medios_pago', ['id_medio_pago', 'id']);
  }
}

if (!function_exists('mv_medios_pago_nombre_col')) {
  function mv_medios_pago_nombre_col(PDO $pdo): ?string
  {
    return mv_medios_pago_pick_first_existing_col($pdo, 'medios_pago', ['nombre', 'descripcion', 'detalle']);
  }
}

if (!function_exists('mv_medios_pago_movimientos_pk')) {
  function mv_medios_pago_movimientos_pk(PDO $pdo): ?string
  {
    if (!mv_medios_pago_table_exists($pdo, 'movimientos_medios_pago')) return null;

    return mv_medios_pago_pick_first_existing_col($pdo, 'movimientos_medios_pago', [
      'id_movimiento_medio_pago',
      'id_movimientos_medio_pago',
      'id_compra_medio_pago',
      'id',
    ]);
  }
}

if (!function_exists('mv_medios_pago_get_row')) {
  function mv_medios_pago_get_row(PDO $pdo, int $idMedioPago): ?array
  {
    if ($idMedioPago <= 0) return null;

    // Camino principal: la tabla oficial del módulo tiene estos campos.
    // Esto evita falsos negativos por detección dinámica de columnas.
    try {
      $st = $pdo->prepare("
        SELECT id_medio_pago, COALESCE(nombre,'') AS nombre
        FROM medios_pago
        WHERE id_medio_pago = :id
        LIMIT 1
      ");
      $st->execute([':id' => $idMedioPago]);
      $row = $st->fetch(PDO::FETCH_ASSOC);
      if ($row) return $row;
    } catch (Throwable $e) {
      // Si alguna instalación vieja tiene nombres distintos, caemos al modo dinámico.
    }

    if (!mv_medios_pago_table_exists($pdo, 'medios_pago')) return null;

    $pk = mv_medios_pago_pk($pdo);
    $colNombre = mv_medios_pago_nombre_col($pdo);
    if (!$pk || !$colNombre) return null;

    $st = $pdo->prepare("
      SELECT `{$pk}` AS id_medio_pago, COALESCE(`{$colNombre}`,'') AS nombre
      FROM medios_pago
      WHERE `{$pk}` = :id
      LIMIT 1
    ");
    $st->execute([':id' => $idMedioPago]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
  }
}

if (!function_exists('mv_medios_pago_detect_tipo_cheque')) {
  function mv_medios_pago_detect_tipo_cheque(string $nombre): ?string
  {
    $n = mv_medios_pago_norm_text($nombre);
    if ($n === '') return null;
    if (strpos($n, 'echeq') !== false || strpos($n, 'e-cheq') !== false || strpos($n, 'e cheq') !== false) return 'echeq';
    if (strpos($n, 'cheque') !== false) return 'cheque';
    return null;
  }
}

if (!function_exists('mv_medios_pago_normalize_tipo_cheque')) {
  function mv_medios_pago_normalize_tipo_cheque($tipo): ?string
  {
    $s = mv_medios_pago_norm_text((string)$tipo);
    if ($s === '') return null;
    if (strpos($s, 'echeq') !== false) return 'echeq';
    if (strpos($s, 'cheque') !== false) return 'cheque';
    return null;
  }
}

if (!function_exists('mv_medios_pago_float')) {
  function mv_medios_pago_float($v): float
  {
    if (is_string($v)) {
      $s = trim($v);
      if ($s === '') return 0.0;
      $s = str_replace(['$', ' '], '', $s);
      if (preg_match('/^\d{1,3}(\.\d{3})*(,\d+)?$/', $s)) {
        $s = str_replace('.', '', $s);
        $s = str_replace(',', '.', $s);
      } elseif (substr_count($s, ',') === 1 && substr_count($s, '.') === 0) {
        $s = str_replace(',', '.', $s);
      }
      if (!is_numeric($s)) return 0.0;
      return (float)$s;
    }
    return is_numeric($v) ? (float)$v : 0.0;
  }
}

if (!function_exists('mv_medios_pago_valid_fecha')) {
  function mv_medios_pago_valid_fecha(string $f): bool
  {
    if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
  }
}

if (!function_exists('mv_medios_pago_normalizar_fecha')) {
  function mv_medios_pago_normalizar_fecha($value): ?string
  {
    $s = trim((string)($value ?? ''));
    if ($s === '') return null;

    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
      return mv_medios_pago_valid_fecha($out) ? $out : null;
    }

    if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
      return mv_medios_pago_valid_fecha($out) ? $out : null;
    }

    return null;
  }
}

if (!function_exists('mv_medios_pago_raw_desde_src')) {
  function mv_medios_pago_raw_desde_src(array $src, float $montoTotal = 0.0, array $options = []): array
  {
    if (isset($src['medios_pago']) && is_array($src['medios_pago']) && !empty($src['medios_pago'])) {
      return $src['medios_pago'];
    }

    $idMp = (int)($src['id_medio_pago'] ?? 0);
    if ($idMp <= 0) return [];

    $monto = $montoTotal;
    if ($monto <= 0) {
      $monto = mv_medios_pago_float($src['monto_total'] ?? $src['total'] ?? $src['total_general'] ?? $src['monto'] ?? 0);
    }

    $row = [
      'id_medio_pago' => $idMp,
      'monto'         => $monto,
    ];

    $idCheque = (int)($src['id_cheque'] ?? 0);
    if ($idCheque > 0) {
      $row['id_cheque'] = $idCheque;
    }

    $tipoCheque = trim((string)($src['cheque_tipo'] ?? $src['tipo_cheque'] ?? ''));
    if ($tipoCheque !== '') {
      $row['cheque_tipo'] = $tipoCheque;
    }

    return [$row];
  }
}

if (!function_exists('mv_medios_pago_normalizar_cheque_entrada')) {
  function mv_medios_pago_normalizar_cheque_entrada(array $src, string $tipoCheque, float $fallbackMonto = 0.0): array
  {
    $fechaEmision = mv_medios_pago_normalizar_fecha(
      $src['fecha_emision']
        ?? $src['cheque_fecha_emision']
        ?? $src['fechaEmision']
        ?? null
    );

    $emisor = trim((string)($src['emisor'] ?? ''));
    $numero = trim((string)($src['numero_cheque'] ?? ''));
    $importe = mv_medios_pago_float($src['importe'] ?? null);
    if ($importe <= 0) $importe = $fallbackMonto;
    $fechaPago = mv_medios_pago_normalizar_fecha(
      $src['fecha_pago']
        ?? $src['cheque_fecha_pago']
        ?? $src['fechaPago']
        ?? null
    );

    if ($fechaEmision === null) throw new RuntimeException('Cheque: la fecha de emisión es obligatoria y debe venir desde el modal.');
    if ($emisor === '') throw new RuntimeException('Cheque: el emisor es obligatorio.');
    if ($numero === '') throw new RuntimeException('Cheque: el número es obligatorio.');
    if ($importe <= 0) throw new RuntimeException('Cheque: el importe debe ser mayor a 0.');
    if ($fechaPago === null) throw new RuntimeException('Cheque: la fecha de pago es obligatoria y debe venir desde el modal.');

    return [
      'tipo'           => $tipoCheque,
      'fecha_emision'  => $fechaEmision,
      'emisor'         => $emisor,
      'numero_cheque'  => $numero,
      'importe'        => round((float)$importe, 2),
      'fecha_pago'     => $fechaPago,
      'observaciones'  => trim((string)($src['observaciones'] ?? '')),
      'archivo_nombre' => trim((string)($src['archivo_nombre'] ?? '')),
    ];
  }
}

if (!function_exists('mv_medios_pago_validar_multi')) {
  function mv_medios_pago_validar_multi(PDO $pdo, array $mediosPagoRaw, float $montoTotalEsperado, array $options = []): array
  {
    $modo = (string)($options['modo'] ?? 'entrada'); // entrada | salida | flexible
    $emptyMessage = (string)($options['empty_message'] ?? 'Debés indicar al menos un medio de pago.');
    $contexto = (string)($options['contexto'] ?? 'movimiento');
    $totalLabel = (string)($options['total_label'] ?? $contexto);
    $permitirCrearCheque = (bool)($options['permitir_crear_cheque'] ?? ($modo === 'entrada'));
    $permitirChequeSinDetalle = (bool)($options['permitir_cheque_sin_detalle'] ?? ($modo === 'flexible'));
    $includeOriginalIndex = (bool)($options['include_original_index'] ?? false);

    if (empty($mediosPagoRaw)) {
      throw new RuntimeException($emptyMessage);
    }

    $resultado = [];
    $sumaMontos = 0.0;
    $chequesUsados = [];
    $chequesNros = [];

    foreach (array_values($mediosPagoRaw) as $idx => $mp) {
      if (!is_array($mp)) {
        throw new RuntimeException("medios_pago[$idx]: formato inválido.");
      }

      $idMp = (int)($mp['id_medio_pago'] ?? 0);
      $monto = mv_medios_pago_float($mp['monto'] ?? 0);
      $frontendUid = trim((string)($mp['frontend_row_uid'] ?? $mp['id'] ?? ''));
      $idMovimientoMedioPago = isset($mp['id_movimiento_medio_pago']) && $mp['id_movimiento_medio_pago'] !== ''
        ? (int)$mp['id_movimiento_medio_pago']
        : null;

      if ($idMp <= 0) {
        throw new RuntimeException("medios_pago[$idx]: id_medio_pago inválido.");
      }

      $mpRow = mv_medios_pago_get_row($pdo, $idMp);
      if (!$mpRow) {
        throw new RuntimeException("medios_pago[$idx]: id_medio_pago $idMp no existe.");
      }

      if (function_exists('mv_plan_saas_medio_pago_bloqueado') && mv_plan_saas_medio_pago_bloqueado($mpRow['nombre'] ?? '')) {
        throw new RuntimeException(function_exists('mv_plan_saas_error_medio_pago_bloqueado') ? mv_plan_saas_error_medio_pago_bloqueado() : 'Medio de pago no disponible para tu plan.');
      }

      $tipoCheque = mv_medios_pago_detect_tipo_cheque((string)($mpRow['nombre'] ?? ''));
      if ($tipoCheque === null) {
        $tipoCheque = mv_medios_pago_normalize_tipo_cheque($mp['cheque_tipo'] ?? $mp['tipo_cheque'] ?? '');
      }

      $idChequeRaw = $mp['id_cheque'] ?? null;
      $idCheque = ($idChequeRaw !== null && $idChequeRaw !== '') ? (int)$idChequeRaw : null;
      $chequeData = null;

      if ($tipoCheque !== null) {
        if ($modo === 'salida') {
          if ($idCheque === null || $idCheque <= 0) {
            throw new RuntimeException("medios_pago[$idx]: el medio de pago \"{$mpRow['nombre']}\" requiere seleccionar un cheque.");
          }

          if (isset($chequesUsados[$idCheque])) {
            throw new RuntimeException("medios_pago[$idx]: el cheque $idCheque ya fue utilizado en otro medio de pago de esta operación.");
          }
          $chequesUsados[$idCheque] = true;
        } elseif ($permitirCrearCheque && ($idCheque === null || $idCheque <= 0)) {
          $chequeSrc = is_array($mp['cheque'] ?? null)
            ? $mp['cheque']
            : (is_array($mp['cheque_data'] ?? null) ? $mp['cheque_data'] : null);

          if (!is_array($chequeSrc)) {
            if ($permitirChequeSinDetalle) {
              $chequeSrc = null;
            } else {
              throw new RuntimeException("medios_pago[$idx]: el medio de pago \"{$mpRow['nombre']}\" requiere cargar un cheque/eCheq.");
            }
          }

          if (is_array($chequeSrc)) {
            $chequeData = mv_medios_pago_normalizar_cheque_entrada($chequeSrc, $tipoCheque, $monto);
            $monto = (float)$chequeData['importe'];

            $dupKey = $tipoCheque . '|' . strtolower(trim((string)$chequeData['numero_cheque']));
            if (isset($chequesNros[$dupKey])) {
              throw new RuntimeException("medios_pago[$idx]: el número {$chequeData['numero_cheque']} está repetido en los cheques cargados.");
            }
            $chequesNros[$dupKey] = true;
          }
        }

        if ($idCheque !== null && $idCheque > 0) {
          $stCheque = $pdo->prepare("\n            SELECT id_cheque, tipo, activo, importe, numero_cheque, emisor\n            FROM movimientos_cheques\n            WHERE id_cheque = :id_cheque\n            LIMIT 1\n          ");
          $stCheque->execute([':id_cheque' => $idCheque]);
          $chequeRow = $stCheque->fetch(PDO::FETCH_ASSOC);
          if (!$chequeRow) {
            throw new RuntimeException("medios_pago[$idx]: el cheque $idCheque no existe.");
          }

          $tipoReal = mv_medios_pago_normalize_tipo_cheque((string)($chequeRow['tipo'] ?? ''));
          if ($tipoReal !== null && $tipoReal !== $tipoCheque) {
            throw new RuntimeException("medios_pago[$idx]: el cheque $idCheque no coincide con el tipo del medio de pago.");
          }
          $tipoCheque = $tipoReal ?? $tipoCheque;

          // Cuando se selecciona un cheque/eCheq ya existente, el monto físico
          // del cheque no se puede editar ni tomar desde el movimiento. La fila
          // de pago puede aplicarse contra una deuda menor, pero el cheque sale
          // de cartera por su importe real.
          $importeChequeReal = mv_medios_pago_float($chequeRow['importe'] ?? 0);
          if ($importeChequeReal > 0) {
            $monto = $importeChequeReal;
          }
          $chequeData = [
            'tipo'           => $tipoCheque,
            'fecha_emision'  => null,
            'emisor'         => (string)($chequeRow['emisor'] ?? ''),
            'numero_cheque'  => (string)($chequeRow['numero_cheque'] ?? ''),
            'importe'        => round((float)$importeChequeReal, 2),
            'fecha_pago'     => null,
            'observaciones'  => '',
            'archivo_nombre' => '',
          ];
        }
      }

      if ($monto <= 0) {
        throw new RuntimeException("medios_pago[$idx]: el monto debe ser mayor a 0.");
      }

      $row = [
        'frontend_row_uid'          => $frontendUid,
        'id_movimiento_medio_pago'  => ($idMovimientoMedioPago && $idMovimientoMedioPago > 0) ? $idMovimientoMedioPago : null,
        'id_medio_pago'             => $idMp,
        'medio_pago_nombre'         => (string)($mpRow['nombre'] ?? ''),
        'nombre_medio'              => (string)($mpRow['nombre'] ?? ''),
        'monto'                     => round((float)$monto, 2),
        'id_cheque'                 => ($idCheque && $idCheque > 0) ? $idCheque : null,
        'tipo_cheque'               => $tipoCheque,
        'cheque_tipo'               => $tipoCheque,
        'cheque'                    => $chequeData,
        'cheque_importe'            => is_array($chequeData ?? null) ? (float)($chequeData['importe'] ?? 0) : 0,
      ];

      if ($includeOriginalIndex) {
        $row['original_index'] = (int)$idx;
      }

      $resultado[] = $row;
      $sumaMontos += (float)$monto;
    }

    $permitirPagoParcial = (bool)(
      $options['permitir_pago_parcial']
      ?? $options['allow_partial']
      ?? $options['permitir_parcial']
      ?? false
    );

    if (!$permitirPagoParcial && $montoTotalEsperado > 0 && $sumaMontos < ($montoTotalEsperado - 0.05)) {
      $message = $options['below_total_message'] ?? null;
      if (!is_string($message) || $message === '') {
        $message = sprintf(
          'La suma de los medios de pago ($%.2f) es menor al total de %s ($%.2f).',
          $sumaMontos,
          $totalLabel,
          $montoTotalEsperado
        );
      }
      throw new RuntimeException($message);
    }

    return $resultado;
  }
}

if (!function_exists('mv_medios_pago_storage_plan')) {
  function mv_medios_pago_storage_plan(array $mediosValidados, ?int $legacyId = null): array
  {
    if (empty($mediosValidados)) {
      return [
        'id_medio_pago' => ($legacyId && $legacyId > 0) ? $legacyId : null,
        'rows'          => [],
      ];
    }

    if (count($mediosValidados) === 1) {
      $first = $mediosValidados[0];
      $firstId = (int)($first['id_medio_pago'] ?? 0);
      $tieneChequeDetalle = !empty($first['id_cheque']) || !empty($first['tipo_cheque']) || !empty($first['cheque']);

      return [
        'id_medio_pago' => $firstId > 0 ? $firstId : (($legacyId && $legacyId > 0) ? $legacyId : null),
        'rows'          => $tieneChequeDetalle ? [$first] : [],
      ];
    }

    return [
      'id_medio_pago' => null,
      'rows'          => $mediosValidados,
    ];
  }
}

if (!function_exists('mv_medios_pago_cheque_ids')) {
  function mv_medios_pago_cheque_ids(array $mediosValidados): array
  {
    return array_values(array_unique(array_filter(array_map(
      static fn($x) => (int)($x['id_cheque'] ?? 0),
      $mediosValidados
    ))));
  }
}

if (!function_exists('mv_medios_pago_liberar_vinculo_origen_cheques')) {
  function mv_medios_pago_liberar_vinculo_origen_cheques(PDO $pdo, array $chequeIds): void
  {
    if (function_exists('mov_global_cheques_liberar_vinculo_origen_en_medios_pago')) {
      mov_global_cheques_liberar_vinculo_origen_en_medios_pago($pdo, $chequeIds);
    }
  }
}

if (!function_exists('mv_medios_pago_eliminar_por_movimiento')) {
  function mv_medios_pago_eliminar_por_movimiento(PDO $pdo, int $idMovimiento, array $options = []): void
  {
    if ($idMovimiento <= 0 || !mv_medios_pago_table_exists($pdo, 'movimientos_medios_pago')) return;
    if (!mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'id_movimiento')) return;

    $st = $pdo->prepare("DELETE FROM movimientos_medios_pago WHERE id_movimiento = :id");
    $st->execute([':id' => $idMovimiento]);

    if ((bool)($options['borrar_flujo_salida'] ?? false) && mv_medios_pago_table_exists($pdo, 'movimientos_cheques_flujo')) {
      $stFlujo = $pdo->prepare("\n        DELETE FROM movimientos_cheques_flujo\n        WHERE id_movimiento = :id\n          AND UPPER(COALESCE(evento, '')) IN ('EGRESO_CARTERA', 'BAJA')\n      ");
      $stFlujo->execute([':id' => $idMovimiento]);
    }
  }
}

if (!function_exists('mv_medios_pago_insertar_multi')) {
  function mv_medios_pago_insertar_multi(PDO $pdo, int $idMovimiento, array $mediosValidados, array $options = []): array
  {
    if ($idMovimiento <= 0) {
      throw new RuntimeException('ID de movimiento inválido para medios de pago.');
    }
    if (!$mediosValidados) return [];

    $contexto = (string)($options['contexto'] ?? 'movimiento');
    $salidaCheque = (bool)($options['salida_cheque'] ?? false);
    $permitirFallbackSinTabla = (bool)($options['fallback_sin_tabla'] ?? false);
    $borrarDuplicadoMismoMov = (bool)($options['borrar_duplicado_mismo_movimiento'] ?? true);
    $registrarFlujoSalida = (bool)($options['registrar_flujo_salida'] ?? $salidaCheque);

    if (!mv_medios_pago_table_exists($pdo, 'movimientos_medios_pago')) {
      if ($permitirFallbackSinTabla && count($mediosValidados) === 1) {
        return [[
          'id_movimiento_medio_pago' => null,
          'id_movimiento'            => $idMovimiento,
          'id_medio_pago'            => (int)$mediosValidados[0]['id_medio_pago'],
          'medio_pago_nombre'        => (string)($mediosValidados[0]['medio_pago_nombre'] ?? $mediosValidados[0]['nombre_medio'] ?? ''),
          'monto'                    => (float)$mediosValidados[0]['monto'],
          'id_cheque'                => $mediosValidados[0]['id_cheque'] ?? null,
          'cheque_tipo'              => $mediosValidados[0]['tipo_cheque'] ?? null,
          'original_index'           => (int)($mediosValidados[0]['original_index'] ?? 0),
        ]];
      }
      throw new RuntimeException('No existe la tabla movimientos_medios_pago.');
    }

    $chequeIds = mv_medios_pago_cheque_ids($mediosValidados);
    if ($chequeIds) {
      if ($salidaCheque) {
        mv_medios_pago_liberar_vinculo_origen_cheques($pdo, $chequeIds);
      }

      if ($borrarDuplicadoMismoMov) {
        $placeholdersDup = implode(',', array_fill(0, count($chequeIds), '?'));
        $sqlDeleteSameMov = "\n          DELETE FROM movimientos_medios_pago\n          WHERE id_movimiento = ?\n            AND id_cheque IN ($placeholdersDup)\n        ";
        $stDeleteSameMov = $pdo->prepare($sqlDeleteSameMov);
        $stDeleteSameMov->bindValue(1, $idMovimiento, PDO::PARAM_INT);
        foreach ($chequeIds as $i => $idCheque) {
          $stDeleteSameMov->bindValue($i + 2, $idCheque, PDO::PARAM_INT);
        }
        $stDeleteSameMov->execute();
      }
    }

    $cols = ['id_movimiento', 'id_medio_pago', 'monto'];
    if (mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'id_cheque')) $cols[] = 'id_cheque';
    if (mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'cheque_tipo')) $cols[] = 'cheque_tipo';

    $params = array_map(static fn($c) => ':' . $c, $cols);
    $sql = "INSERT INTO movimientos_medios_pago (`" . implode('`,`', $cols) . "`) VALUES (" . implode(',', $params) . ")";
    $st = $pdo->prepare($sql);
    $pk = mv_medios_pago_movimientos_pk($pdo);
    $out = [];

    foreach ($mediosValidados as $idx => $mp) {
      $idMedioPagoRow = (int)($mp['id_medio_pago'] ?? 0);
      $montoRow = (float)($mp['monto'] ?? 0);

      if ($idMedioPagoRow <= 0) {
        throw new RuntimeException($contexto . ': medio de pago inválido al guardar el detalle.');
      }
      if ($montoRow <= 0) {
        throw new RuntimeException($contexto . ': monto inválido al guardar el detalle del medio de pago.');
      }

      $bind = [
        ':id_movimiento' => $idMovimiento,
        ':id_medio_pago' => $idMedioPagoRow,
        ':monto'         => $montoRow,
      ];
      if (in_array('id_cheque', $cols, true)) $bind[':id_cheque'] = $mp['id_cheque'] ?? null;
      if (in_array('cheque_tipo', $cols, true)) $bind[':cheque_tipo'] = $mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? null;

      try {
        $st->execute($bind);
      } catch (PDOException $e) {
        $sqlState = (string)($e->getCode() ?? '');
        $msg = (string)$e->getMessage();
        $esDuplicadoCheque = (
          $sqlState === '23000'
          && (
            stripos($msg, 'uq_cmp_cheque') !== false
            || stripos($msg, 'Duplicate entry') !== false
            || stripos($msg, 'id_cheque') !== false
          )
        );

        if ($esDuplicadoCheque && !empty($mp['id_cheque'])) {
          $idCheque = (int)$mp['id_cheque'];
          $stDup = $pdo->prepare("\n            SELECT\n              cmp.id_movimiento,\n              COALESCE(ch.numero_cheque, '') AS numero_cheque,\n              COALESCE(ch.emisor, '') AS emisor\n            FROM movimientos_medios_pago cmp\n            LEFT JOIN movimientos_cheques ch\n              ON ch.id_cheque = cmp.id_cheque\n            WHERE cmp.id_cheque = :id_cheque\n              AND cmp.id_movimiento <> :id_movimiento\n            LIMIT 1\n          ");
          $stDup->execute([
            ':id_cheque'     => $idCheque,
            ':id_movimiento' => $idMovimiento,
          ]);
          $dup = $stDup->fetch(PDO::FETCH_ASSOC) ?: [];

          $numero = trim((string)($dup['numero_cheque'] ?? ''));
          $emisor = trim((string)($dup['emisor'] ?? ''));
          $movUso = (int)($dup['id_movimiento'] ?? 0);
          $labelCheque = $numero !== '' ? ('N° ' . $numero) : ('ID ' . $idCheque);
          $labelEmisor = $emisor !== '' ? (' (' . $emisor . ')') : '';
          throw new RuntimeException("El cheque {$labelCheque}{$labelEmisor} ya está vinculado al movimiento {$movUso}. No se puede reutilizar en otro {$contexto}.");
        }

        throw $e;
      }

      $idRow = null;
      if ($pk) {
        $last = (int)$pdo->lastInsertId();
        $idRow = $last > 0 ? $last : null;
      }

      if ($registrarFlujoSalida && !empty($mp['id_cheque'])) {
        mv_medios_pago_registrar_flujo_salida_cheque($pdo, $idMovimiento, $mp);
      }

      $out[] = [
        'id_movimiento_medio_pago' => $idRow,
        'id_movimiento'            => $idMovimiento,
        'id_medio_pago'            => (int)$mp['id_medio_pago'],
        'medio_pago_nombre'        => (string)($mp['medio_pago_nombre'] ?? $mp['nombre_medio'] ?? ''),
        'nombre_medio'             => (string)($mp['nombre_medio'] ?? $mp['medio_pago_nombre'] ?? ''),
        'monto'                    => (float)$mp['monto'],
        'id_cheque'                => $mp['id_cheque'] ?? null,
        'cheque_tipo'              => $mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? null,
        'tipo_cheque'              => $mp['tipo_cheque'] ?? $mp['cheque_tipo'] ?? null,
        'original_index'           => (int)($mp['original_index'] ?? 0),
      ];
    }

    return $out;
  }
}

if (!function_exists('mv_medios_pago_registrar_flujo_salida_cheque')) {
  function mv_medios_pago_registrar_flujo_salida_cheque(PDO $pdo, int $idMovimiento, array $mp, string $descripcion = ''): void
  {
    if (function_exists('mov_global_cheques_registrar_salida_flujo')) {
      mov_global_cheques_registrar_salida_flujo($pdo, $idMovimiento, $mp, $descripcion);
    }
  }
}

if (!function_exists('mv_medios_pago_lock_cheques_salida')) {
  function mv_medios_pago_lock_cheques_salida(PDO $pdo, array $mediosValidados): array
  {
    return function_exists('mov_global_cheques_lock_disponibles')
      ? mov_global_cheques_lock_disponibles($pdo, $mediosValidados)
      : [];
  }
}

if (!function_exists('mv_medios_pago_dar_baja_cheques_salida')) {
  function mv_medios_pago_dar_baja_cheques_salida(PDO $pdo, array $mediosValidados): void
  {
    if (function_exists('mov_global_cheques_dar_baja_multi')) {
      mov_global_cheques_dar_baja_multi($pdo, $mediosValidados);
    }
  }
}

if (!function_exists('mv_medios_pago_reactivar_cheques_por_ids')) {
  function mv_medios_pago_reactivar_cheques_por_ids(PDO $pdo, array $idsCheque): void
  {
    if (function_exists('mov_global_cheques_reactivar_por_ids')) {
      mov_global_cheques_reactivar_por_ids($pdo, $idsCheque);
    }
  }
}

if (!function_exists('mv_medios_pago_persistir_cheques_entrada')) {
  function mv_medios_pago_persistir_cheques_entrada(PDO $pdo, int $idMovimiento, array $mediosValidados): array
  {
    $mapaIdsPorUid = [];
    $mapaIdsPorIndex = [];
    $chequesCreados = [];

    foreach ($mediosValidados as $idx => $mp) {
      $tipoCheque = $mp['tipo_cheque'] ?? null;
      if ($tipoCheque === null) continue;

      $idCheque = (int)($mp['id_cheque'] ?? 0);
      $frontendUid = (string)($mp['frontend_row_uid'] ?? '');

      if ($idCheque <= 0 && is_array($mp['cheque'] ?? null)) {
        $idCheque = mov_global_cheques_crear_registro($pdo, $idMovimiento, $mp['cheque'], null, true);
        $chequesCreados[] = [
          'frontend_row_uid' => $frontendUid,
          'id_cheque'        => $idCheque,
          'id_movimiento'    => $idMovimiento,
          'tipo'             => $tipoCheque,
          'numero_cheque'    => (string)(($mp['cheque']['numero_cheque'] ?? '') ?: ''),
        ];
      }

      if ($idCheque > 0) {
        $mapaIdsPorIndex[$idx] = $idCheque;
        if ($frontendUid !== '') $mapaIdsPorUid[$frontendUid] = $idCheque;
      }
    }

    return [
      'mapa_ids_cheque'           => $mapaIdsPorUid,
      'mapa_ids_cheque_por_index' => $mapaIdsPorIndex,
      'cheques_creados'           => $chequesCreados,
    ];
  }
}

if (!function_exists('mv_medios_pago_completar_ids_cheques_en_rows')) {
  function mv_medios_pago_completar_ids_cheques_en_rows(array $rows, array $persistCheques): array
  {
    foreach ($rows as $idx => $mp) {
      if (!empty($rows[$idx]['id_cheque'])) continue;

      $uid = (string)($mp['frontend_row_uid'] ?? '');
      if (isset($persistCheques['mapa_ids_cheque_por_index'][$idx])) {
        $rows[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque_por_index'][$idx];
        continue;
      }
      if ($uid !== '' && isset($persistCheques['mapa_ids_cheque'][$uid])) {
        $rows[$idx]['id_cheque'] = (int)$persistCheques['mapa_ids_cheque'][$uid];
      }
    }

    return $rows;
  }
}


if (!function_exists('mv_medios_pago_row_es_cheque')) {
  function mv_medios_pago_row_es_cheque(array $row): ?string
  {
    $tipo = mv_medios_pago_normalize_tipo_cheque($row['cheque_tipo'] ?? $row['tipo_cheque'] ?? '');
    if ($tipo !== null) return $tipo;

    $nombre = (string)($row['medio_pago_nombre'] ?? $row['nombre_medio'] ?? $row['nombre'] ?? '');
    return mv_medios_pago_detect_tipo_cheque($nombre);
  }
}

if (!function_exists('mv_medios_pago_fetch_cheques_por_movimientos')) {
  function mv_medios_pago_fetch_cheques_por_movimientos(PDO $pdo, array $idsMovimientos): array
  {
    $idsMovimientos = array_values(array_unique(array_filter(array_map('intval', $idsMovimientos))));
    if (!$idsMovimientos || !mv_medios_pago_table_exists($pdo, 'movimientos_cheques')) return [];

    $ph = implode(',', array_fill(0, count($idsMovimientos), '?'));
    $out = [];
    // Guarda la posición del cheque/eCheq ya agregado por movimiento.
    // Si otra fuente trae la descripción del flujo, se completa sin duplicar la fila.
    $seen = [];

    $add = static function(array $r) use (&$out, &$seen): void {
      $idMov = (int)($r['id_movimiento_contexto'] ?? $r['id_movimiento'] ?? 0);
      $idCheque = (int)($r['id_cheque'] ?? 0);
      if ($idMov <= 0 || $idCheque <= 0) return;

      $descripcion = trim((string)($r['cheque_descripcion'] ?? $r['descripcion'] ?? $r['observaciones'] ?? ''));
      $key = $idMov . ':' . $idCheque;
      if (isset($seen[$key])) {
        [$movSeen, $idxSeen] = $seen[$key];
        if ($descripcion !== '' && isset($out[$movSeen][$idxSeen])) {
          $actual = trim((string)($out[$movSeen][$idxSeen]['cheque_descripcion'] ?? $out[$movSeen][$idxSeen]['descripcion'] ?? ''));
          if ($actual === '') {
            $out[$movSeen][$idxSeen]['cheque_descripcion'] = $descripcion;
            $out[$movSeen][$idxSeen]['descripcion'] = $descripcion;
            $out[$movSeen][$idxSeen]['observaciones'] = $descripcion;
          }
        }
        return;
      }

      $tipo = mv_medios_pago_normalize_tipo_cheque((string)($r['tipo'] ?? $r['cheque_tipo'] ?? '')) ?: 'cheque';
      $importeCheque = (float)($r['importe'] ?? $r['cheque_importe'] ?? 0);
      if (!isset($out[$idMov])) $out[$idMov] = [];
      $idxNuevo = count($out[$idMov]);
      $out[$idMov][] = [
        'id_cheque'           => $idCheque,
        'cheque_tipo'         => $tipo,
        'tipo_cheque'         => $tipo,
        'numero_cheque'       => (string)($r['numero_cheque'] ?? ''),
        'emisor'              => (string)($r['emisor'] ?? ''),
        'fecha_emision'       => (string)($r['fecha_emision'] ?? ''),
        'fecha_pago'          => (string)($r['fecha_pago'] ?? ''),
        'monto'               => $importeCheque,
        'monto_aplicado'      => (float)($r['monto_aplicado'] ?? 0),
        'importe_aplicado_movimiento' => (float)($r['monto_aplicado'] ?? 0),
        'cheque_importe'      => $importeCheque,
        'evento'              => (string)($r['evento'] ?? ''),
        'cheque_descripcion'  => $descripcion,
        'descripcion'         => $descripcion,
        'observaciones'       => $descripcion,
      ];
      $seen[$key] = [$idMov, $idxNuevo];
    };

    try {
      $sql = "
        SELECT
          ch.id_movimiento AS id_movimiento_contexto,
          ch.id_cheque,
          ch.tipo,
          ch.numero_cheque,
          ch.emisor,
          ch.fecha_emision,
          ch.fecha_pago,
          ch.importe,
          'MOVIMIENTO_ORIGEN' AS evento,
          " . (mv_medios_pago_table_exists($pdo, 'movimientos_cheques_flujo') ? "COALESCE((
            SELECT f_desc.descripcion
            FROM movimientos_cheques_flujo f_desc
            WHERE f_desc.id_cheque = ch.id_cheque
              AND f_desc.id_movimiento = ch.id_movimiento
              AND COALESCE(f_desc.descripcion, '') <> ''
            ORDER BY
              CASE UPPER(COALESCE(f_desc.evento, ''))
                WHEN 'INGRESO_CARTERA' THEN 1
                WHEN 'EGRESO_CARTERA' THEN 2
                WHEN 'DEPOSITADO_BANCO' THEN 3
                ELSE 9
              END,
              f_desc.id_flujo DESC
            LIMIT 1
          ), '')" : "''") . " AS descripcion
        FROM movimientos_cheques ch
        WHERE ch.id_movimiento IN ($ph)
        ORDER BY ch.id_movimiento ASC, ch.id_cheque ASC
      ";
      $st = $pdo->prepare($sql);
      foreach ($idsMovimientos as $i => $idMov) $st->bindValue($i + 1, $idMov, PDO::PARAM_INT);
      $st->execute();
      foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) $add($r);
    } catch (Throwable $e) {
      // No cortamos el listado si una instalación vieja no tiene todas las columnas.
    }

    if (mv_medios_pago_table_exists($pdo, 'movimientos_cheques_flujo')) {
      try {
        $sqlFlujo = "
          SELECT
            f.id_movimiento AS id_movimiento_contexto,
            ch.id_cheque,
            ch.tipo,
            ch.numero_cheque,
            ch.emisor,
            ch.fecha_emision,
            ch.fecha_pago,
            COALESCE(ch.importe, NULLIF(f.importe, 0), 0) AS importe,
            f.evento,
            COALESCE(f.descripcion, '') AS descripcion
          FROM movimientos_cheques_flujo f
          INNER JOIN movimientos_cheques ch ON ch.id_cheque = f.id_cheque
          WHERE f.id_movimiento IN ($ph)
            AND UPPER(COALESCE(f.evento, '')) IN (
              'INGRESO_CARTERA', 'INGRESO', 'ALTA', 'ALTA_CARTERA',
              'EGRESO_CARTERA', 'EGRESO', 'BAJA', 'SALIDA_CARTERA',
              'DEPOSITADO_BANCO', 'DEPOSITO_BANCO', 'DEPOSITADO'
            )
          ORDER BY f.id_movimiento ASC, f.id_flujo ASC
        ";
        $stFlujo = $pdo->prepare($sqlFlujo);
        foreach ($idsMovimientos as $i => $idMov) $stFlujo->bindValue($i + 1, $idMov, PDO::PARAM_INT);
        $stFlujo->execute();
        foreach (($stFlujo->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) $add($r);
      } catch (Throwable $e) {
        // Fallback silencioso: el detalle de medios de pago no debe romper el listado.
      }
    }

    return $out;
  }
}

if (!function_exists('mv_medios_pago_enriquecer_detalle_con_cheques')) {
  function mv_medios_pago_enriquecer_detalle_con_cheques(array $detallePorMovimiento, array $chequesPorMovimiento): array
  {
    if (!$detallePorMovimiento || !$chequesPorMovimiento) return $detallePorMovimiento;

    foreach ($detallePorMovimiento as $idMov => $rows) {
      $idMovInt = (int)$idMov;
      $cheques = $chequesPorMovimiento[$idMovInt] ?? [];
      if (!$cheques || !is_array($rows)) continue;

      $usados = [];
      foreach ($rows as $idx => $row) {
        if (!is_array($row)) continue;

        $tipoEsperado = mv_medios_pago_row_es_cheque($row);
        if ($tipoEsperado === null) {
          if (!empty($row['id_cheque']) || trim((string)($row['numero_cheque'] ?? '')) !== '') {
            $tipoEsperado = mv_medios_pago_normalize_tipo_cheque($row['cheque_tipo'] ?? $row['tipo_cheque'] ?? '') ?: 'cheque';
          } else {
            continue;
          }
        }

        $idChequeActual = (int)($row['id_cheque'] ?? 0);
        $match = null;

        if ($idChequeActual > 0) {
          foreach ($cheques as $pos => $ch) {
            if ((int)($ch['id_cheque'] ?? 0) === $idChequeActual) {
              $match = $ch;
              $usados[$pos] = true;
              break;
            }
          }
        }

        if ($match === null) {
          $montoRow = (float)($row['cheque_importe'] ?? $row['monto'] ?? 0);
          $fallbackPos = null;
          foreach ($cheques as $pos => $ch) {
            if (!empty($usados[$pos])) continue;
            $tipoCh = mv_medios_pago_normalize_tipo_cheque($ch['cheque_tipo'] ?? $ch['tipo_cheque'] ?? '') ?: 'cheque';
            if ($tipoCh !== $tipoEsperado) continue;
            if ($fallbackPos === null) $fallbackPos = $pos;
            $montoCh = (float)($ch['cheque_importe'] ?? 0);
            if ($montoRow <= 0 || abs($montoCh - $montoRow) <= 0.05) {
              $match = $ch;
              $usados[$pos] = true;
              break;
            }
          }

          if ($match === null && $fallbackPos !== null) {
            $match = $cheques[$fallbackPos];
            $usados[$fallbackPos] = true;
          }
        }

        if ($match !== null) {
          $tipoFinal = mv_medios_pago_normalize_tipo_cheque($match['cheque_tipo'] ?? $match['tipo_cheque'] ?? $tipoEsperado) ?: $tipoEsperado;
          $rows[$idx]['id_cheque'] = (int)($match['id_cheque'] ?? 0) ?: ($row['id_cheque'] ?? null);
          $rows[$idx]['cheque_tipo'] = $tipoFinal;
          $rows[$idx]['tipo_cheque'] = $tipoFinal;
          $rows[$idx]['numero_cheque'] = (string)($match['numero_cheque'] ?? $row['numero_cheque'] ?? '');
          $rows[$idx]['emisor'] = (string)($match['emisor'] ?? $row['emisor'] ?? '');
          $rows[$idx]['fecha_emision'] = (string)($match['fecha_emision'] ?? $row['fecha_emision'] ?? '');
          $rows[$idx]['fecha_pago'] = (string)($match['fecha_pago'] ?? $row['fecha_pago'] ?? '');
          if (!isset($rows[$idx]['monto_aplicado'])) {
            $rows[$idx]['monto_aplicado'] = (float)($row['monto'] ?? 0);
            $rows[$idx]['importe_aplicado_movimiento'] = (float)($row['monto'] ?? 0);
          }
          $importeRealCheque = (float)($match['cheque_importe'] ?? $row['cheque_importe'] ?? $row['monto'] ?? 0);
          $rows[$idx]['cheque_importe'] = $importeRealCheque;
          if ($importeRealCheque > 0) {
            $rows[$idx]['monto'] = $importeRealCheque;
          }
          $descripcionCheque = trim((string)($match['cheque_descripcion'] ?? $match['descripcion'] ?? $match['observaciones'] ?? $row['cheque_descripcion'] ?? $row['descripcion'] ?? $row['observaciones'] ?? ''));
          $rows[$idx]['cheque_descripcion'] = $descripcionCheque;
          $rows[$idx]['descripcion'] = $descripcionCheque;
          $rows[$idx]['observaciones'] = $descripcionCheque;
        } else {
          $tipoFinal = $tipoEsperado;
          $rows[$idx]['cheque_tipo'] = (string)($row['cheque_tipo'] ?? $tipoFinal);
          $rows[$idx]['tipo_cheque'] = (string)($row['tipo_cheque'] ?? $tipoFinal);
          $descripcionCheque = trim((string)($row['cheque_descripcion'] ?? $row['descripcion'] ?? $row['observaciones'] ?? ''));
          $rows[$idx]['cheque_descripcion'] = $descripcionCheque;
          $rows[$idx]['descripcion'] = $descripcionCheque;
          $rows[$idx]['observaciones'] = $descripcionCheque;
        }

        $tipoFinal = mv_medios_pago_normalize_tipo_cheque($rows[$idx]['cheque_tipo'] ?? $rows[$idx]['tipo_cheque'] ?? $tipoEsperado) ?: $tipoEsperado;
        if (trim((string)($rows[$idx]['medio_pago_nombre'] ?? '')) === '') {
          $rows[$idx]['medio_pago_nombre'] = $tipoFinal === 'echeq' ? 'ECHEQ' : 'CHEQUE';
          $rows[$idx]['nombre_medio'] = $rows[$idx]['medio_pago_nombre'];
        }

        $tieneDatosCheque = !empty($rows[$idx]['id_cheque'])
          || trim((string)($rows[$idx]['numero_cheque'] ?? '')) !== ''
          || trim((string)($rows[$idx]['emisor'] ?? '')) !== '';

        if ($tieneDatosCheque) {
          $rows[$idx]['cheque'] = [
            'id_cheque'      => !empty($rows[$idx]['id_cheque']) ? (int)$rows[$idx]['id_cheque'] : null,
            'tipo'           => $tipoFinal,
            'tipo_cheque'    => $tipoFinal,
            'cheque_tipo'    => $tipoFinal,
            'numero_cheque'  => (string)($rows[$idx]['numero_cheque'] ?? ''),
            'emisor'         => (string)($rows[$idx]['emisor'] ?? ''),
            'fecha_emision'  => (string)($rows[$idx]['fecha_emision'] ?? ''),
            'fecha_pago'     => (string)($rows[$idx]['fecha_pago'] ?? ''),
            'importe'        => (float)($rows[$idx]['cheque_importe'] ?? $rows[$idx]['monto'] ?? 0),
            'descripcion'    => trim((string)($rows[$idx]['cheque_descripcion'] ?? $rows[$idx]['descripcion'] ?? '')),
            'observaciones'  => trim((string)($rows[$idx]['cheque_descripcion'] ?? $rows[$idx]['descripcion'] ?? '')),
          ];
        }
      }
      $detallePorMovimiento[$idMov] = $rows;
    }

    return $detallePorMovimiento;
  }
}

if (!function_exists('mv_medios_pago_listar_detalle_por_movimientos')) {
  function mv_medios_pago_listar_detalle_por_movimientos(PDO $pdo, array $idsMovimientos): array
  {
    $idsMovimientos = array_values(array_unique(array_filter(array_map('intval', $idsMovimientos))));
    if (!$idsMovimientos || !mv_medios_pago_table_exists($pdo, 'movimientos_medios_pago')) return [];

    $pk = mv_medios_pago_movimientos_pk($pdo);
    $orderCol = $pk ? "cmp.`{$pk}`" : 'cmp.id_movimiento';
    $hasIdCheque = mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'id_cheque');
    $hasChequeTipo = mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'cheque_tipo');

    $ph = implode(',', array_fill(0, count($idsMovimientos), '?'));
    $joinCheque = $hasIdCheque ? " LEFT JOIN movimientos_cheques ch ON ch.id_cheque = cmp.id_cheque " : "";
    $chequeDescripcionExpr = ($hasIdCheque && mv_medios_pago_table_exists($pdo, 'movimientos_cheques_flujo'))
      ? "COALESCE((
          SELECT f_desc.descripcion
          FROM movimientos_cheques_flujo f_desc
          WHERE f_desc.id_cheque = ch.id_cheque
            AND f_desc.id_movimiento = cmp.id_movimiento
            AND COALESCE(f_desc.descripcion, '') <> ''
          ORDER BY
            CASE UPPER(COALESCE(f_desc.evento, ''))
              WHEN 'INGRESO_CARTERA' THEN 1
              WHEN 'EGRESO_CARTERA' THEN 2
              WHEN 'DEPOSITADO_BANCO' THEN 3
              ELSE 9
            END,
            f_desc.id_flujo DESC
          LIMIT 1
        ), '')"
      : "''";
    $sql = "\n      SELECT\n        " . ($pk ? "cmp.`{$pk}`" : "0") . " AS id_movimiento_medio_pago,\n        cmp.id_movimiento,\n        cmp.id_medio_pago,\n        cmp.monto,\n        " . ($hasIdCheque ? 'cmp.id_cheque' : 'NULL') . " AS id_cheque,\n        " . ($hasChequeTipo ? 'cmp.cheque_tipo' : 'NULL') . " AS cheque_tipo,\n        COALESCE(mp.nombre, '') AS medio_pago_nombre,\n        " . ($hasIdCheque ? "COALESCE(ch.numero_cheque, '')" : "''") . " AS numero_cheque,\n        " . ($hasIdCheque ? "COALESCE(ch.emisor, '')" : "''") . " AS emisor,\n        " . ($hasIdCheque ? "COALESCE(ch.fecha_emision, '')" : "''") . " AS fecha_emision,\n        " . ($hasIdCheque ? "COALESCE(ch.fecha_pago, '')" : "''") . " AS fecha_pago,\n        " . ($hasIdCheque ? "COALESCE(ch.importe, 0)" : "0") . " AS cheque_importe,\n        " . ($hasIdCheque ? $chequeDescripcionExpr : "''") . " AS cheque_descripcion\n      FROM movimientos_medios_pago cmp\n      LEFT JOIN medios_pago mp ON mp.id_medio_pago = cmp.id_medio_pago\n      {$joinCheque}\n      WHERE cmp.id_movimiento IN ($ph)\n      ORDER BY cmp.id_movimiento ASC, {$orderCol} ASC\n    ";

    $st = $pdo->prepare($sql);
    foreach ($idsMovimientos as $i => $idMov) {
      $st->bindValue($i + 1, $idMov, PDO::PARAM_INT);
    }
    $st->execute();

    $out = [];
    foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
      $idMov = (int)($r['id_movimiento'] ?? 0);
      if ($idMov <= 0) continue;
      if (!isset($out[$idMov])) $out[$idMov] = [];

      $montoAplicado = (float)($r['monto'] ?? 0);
      $chequeImporte = (float)($r['cheque_importe'] ?? 0);
      $idChequeRow = ($r['id_cheque'] === null || $r['id_cheque'] === '') ? null : (int)$r['id_cheque'];
      $tipoChequeRow = mv_medios_pago_normalize_tipo_cheque((string)($r['cheque_tipo'] ?? ''));
      $esFilaCheque = $idChequeRow !== null
        || $tipoChequeRow !== null
        || $chequeImporte > 0
        || trim((string)($r['numero_cheque'] ?? '')) !== ''
        || trim((string)($r['emisor'] ?? '')) !== '';
      $montoVisible = ($esFilaCheque && $chequeImporte > 0) ? $chequeImporte : $montoAplicado;

      $out[$idMov][] = [
        'id_movimiento_medio_pago' => (int)($r['id_movimiento_medio_pago'] ?? 0),
        'id_movimiento'            => $idMov,
        'id_medio_pago'            => (int)($r['id_medio_pago'] ?? 0),
        'medio_pago_nombre'        => (string)($r['medio_pago_nombre'] ?? ''),
        'nombre_medio'             => (string)($r['medio_pago_nombre'] ?? ''),
        'monto'                    => $montoVisible,
        'monto_aplicado'           => $montoAplicado,
        'importe_aplicado_movimiento' => $montoAplicado,
        'id_cheque'                => $idChequeRow,
        'cheque_tipo'              => (string)($r['cheque_tipo'] ?? ''),
        'tipo_cheque'              => (string)($r['cheque_tipo'] ?? ''),
        'numero_cheque'            => (string)($r['numero_cheque'] ?? ''),
        'emisor'                   => (string)($r['emisor'] ?? ''),
        'fecha_emision'            => (string)($r['fecha_emision'] ?? ''),
        'fecha_pago'               => (string)($r['fecha_pago'] ?? ''),
        'cheque_importe'           => $chequeImporte,
        'cheque_descripcion'       => trim((string)($r['cheque_descripcion'] ?? '')),
        'descripcion'              => trim((string)($r['cheque_descripcion'] ?? '')),
        'observaciones'            => trim((string)($r['cheque_descripcion'] ?? '')),
      ];
    }

    // Fallback para Cuenta Corriente pagada con UN solo medio de pago.
    // En ese caso el sistema guarda el medio principal en cobros/movimientos.id_medio_pago
    // y no siempre crea filas en movimientos_medios_pago. Para que los modales de detalle
    // de Ventas/Compras puedan mostrar el medio real usado al cobrar/pagar, completamos
    // el detalle desde cobros solo cuando el movimiento no tenía detalle multi-medio.
    if (mv_medios_pago_table_exists($pdo, 'cobros')) {
      $idsSinDetalle = [];
      foreach ($idsMovimientos as $idMovBase) {
        $idMovBase = (int)$idMovBase;
        if ($idMovBase > 0 && empty($out[$idMovBase])) {
          $idsSinDetalle[] = $idMovBase;
        }
      }

      if (!empty($idsSinDetalle)) {
        $phCb = implode(',', array_fill(0, count($idsSinDetalle), '?'));
        $sqlCb = "
          SELECT
            cb.id_cobro,
            cb.id_movimiento,
            cb.id_medio_pago,
            cb.monto,
            cb.fecha_cobro,
            COALESCE(mp.nombre, '') AS medio_pago_nombre
          FROM cobros cb
          LEFT JOIN medios_pago mp ON mp.id_medio_pago = cb.id_medio_pago
          WHERE cb.id_movimiento IN ($phCb)
            AND cb.id_medio_pago IS NOT NULL
            AND cb.id_medio_pago > 0
          ORDER BY cb.id_movimiento ASC, cb.id_cobro ASC
        ";

        $stCb = $pdo->prepare($sqlCb);
        foreach ($idsSinDetalle as $i => $idMovCb) {
          $stCb->bindValue($i + 1, (int)$idMovCb, PDO::PARAM_INT);
        }
        $stCb->execute();

        foreach (($stCb->fetchAll(PDO::FETCH_ASSOC) ?: []) as $cb) {
          $idMovCb = (int)($cb['id_movimiento'] ?? 0);
          if ($idMovCb <= 0) continue;
          if (!isset($out[$idMovCb])) $out[$idMovCb] = [];

          $nombreMedio = (string)($cb['medio_pago_nombre'] ?? '');
          $out[$idMovCb][] = [
            'id_movimiento_medio_pago' => 0,
            'id_movimiento'            => $idMovCb,
            'id_medio_pago'            => (int)($cb['id_medio_pago'] ?? 0),
            'medio_pago_nombre'        => $nombreMedio,
            'nombre_medio'             => $nombreMedio,
            'monto'                    => (float)($cb['monto'] ?? 0),
            'id_cheque'                => null,
            'cheque_tipo'              => '',
            'tipo_cheque'              => '',
            'numero_cheque'            => '',
            'emisor'                   => '',
            'fecha_emision'            => '',
            'fecha_pago'               => '',
            'cheque_importe'           => 0.0,
            'id_cobro'                 => (int)($cb['id_cobro'] ?? 0),
            'fecha_cobro'              => (string)($cb['fecha_cobro'] ?? ''),
            'origen_pago'              => 'cobros',
            'es_pago_cuenta_corriente' => true,
          ];
        }
      }
    }

    $chequesPorMovimiento = mv_medios_pago_fetch_cheques_por_movimientos($pdo, $idsMovimientos);
    $out = mv_medios_pago_enriquecer_detalle_con_cheques($out, $chequesPorMovimiento);

    return $out;
  }
}

if (!function_exists('mv_medios_pago_movimiento_for_update')) {
  function mv_medios_pago_movimiento_for_update(PDO $pdo, int $idMovimiento): array
  {
    if ($idMovimiento <= 0 || !mv_medios_pago_table_exists($pdo, 'movimientos_medios_pago')) return [];

    $pk = mv_medios_pago_movimientos_pk($pdo) ?: 'id_movimiento';
    $sql = "\n      SELECT " . (mv_medios_pago_movimientos_pk($pdo) ? "`" . mv_medios_pago_movimientos_pk($pdo) . "` AS id_compra_medio_pago," : "0 AS id_compra_medio_pago,") . "\n             id_movimiento, id_medio_pago, monto,\n             " . (mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'id_cheque') ? 'id_cheque' : 'NULL') . " AS id_cheque,\n             " . (mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'cheque_tipo') ? 'cheque_tipo' : 'NULL') . " AS cheque_tipo\n      FROM movimientos_medios_pago\n      WHERE id_movimiento = :id\n      ORDER BY `{$pk}` ASC\n      FOR UPDATE\n    ";
    $st = $pdo->prepare($sql);
    $st->execute([':id' => $idMovimiento]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }
}

if (!function_exists('mv_medios_pago_resumen')) {
  function mv_medios_pago_resumen(array $mediosDetalle, string $legacy = ''): string
  {
    $cantidad = count($mediosDetalle);
    if ($cantidad <= 0) return $legacy !== '' ? $legacy : '';

    $principal = trim((string)($mediosDetalle[0]['medio_pago_nombre'] ?? $mediosDetalle[0]['nombre_medio'] ?? ''));
    if ($principal === '') $principal = 'CONTADO';

    if ($cantidad === 1) return $principal;
    return $principal . ' +' . ($cantidad - 1);
  }
}

if (!function_exists('mv_medios_pago_sync_con_cheque')) {
  function mv_medios_pago_sync_con_cheque(PDO $pdo, int $idMovimiento, int $idCheque, int $idMovMedioPago = 0, int $idMedioPago = 0, ?string $chequeTipo = null, ?float $monto = null): void
  {
    if (function_exists('mov_global_cheques_sync_movimiento_medio_pago')) {
      mov_global_cheques_sync_movimiento_medio_pago($pdo, $idMovimiento, $idCheque, $idMovMedioPago, $idMedioPago, $chequeTipo, $monto);
    }
  }
}

if (!function_exists('mv_medios_pago_desvincular_cheque')) {
  function mv_medios_pago_desvincular_cheque(PDO $pdo, int $idCheque): void
  {
    if ($idCheque <= 0 || !mv_medios_pago_table_exists($pdo, 'movimientos_medios_pago')) return;
    if (!mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'id_cheque')) return;

    $sets = ['id_cheque = NULL'];
    if (mv_medios_pago_has_col($pdo, 'movimientos_medios_pago', 'cheque_tipo')) $sets[] = 'cheque_tipo = NULL';
    $sql = "UPDATE movimientos_medios_pago SET " . implode(', ', $sets) . " WHERE id_cheque = :id_cheque";
    $st = $pdo->prepare($sql);
    $st->execute([':id_cheque' => $idCheque]);
  }
}
