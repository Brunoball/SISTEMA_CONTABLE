<?php
// backend/modules/movimientos/compras/comun.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Session');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

require_once __DIR__ . '/../../utils/auditoria.php';

if (!function_exists('compra_ok')) {
  function compra_ok(array $arr = []): void {
    echo json_encode(array_merge(['exito' => true], $arr), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('compra_fail')) {
  function compra_fail(string $msg, int $httpCode = 200, array $extra = []): void {
    http_response_code($httpCode);
    echo json_encode(array_merge(['exito' => false, 'mensaje' => $msg], $extra), JSON_UNESCAPED_UNICODE);
    exit;
  }
}

if (!function_exists('compra_read_json_body')) {
  function compra_read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
  }
}

if (!function_exists('compra_n_int')) {
  function compra_n_int($v): ?int {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    $n = (int)$v;
    return $n >= 0 ? $n : null;
  }
}

if (!function_exists('compra_n_float')) {
  function compra_n_float($v): ?float {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) return null;
    return (float)$v;
  }
}

if (!function_exists('compra_today_iso')) {
  function compra_today_iso(): string {
    return date('Y-m-d');
  }
}

if (!function_exists('compra_fecha_valida')) {
  function compra_fecha_valida(string $f): bool {
    if (!preg_match('/^(\d{4})\-(\d{2})\-(\d{2})$/', $f, $m)) return false;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
  }
}

if (!function_exists('compra_normalizar_fecha_movimiento')) {
  function compra_normalizar_fecha_movimiento($value): ?string {
    $s = trim((string)($value ?? ''));
    if ($s === '') return null;
    if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[1], (int)$m[2], (int)$m[3]);
      return compra_fecha_valida($out) ? $out : null;
    }
    if (preg_match('/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/', $s, $m)) {
      $out = sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
      return compra_fecha_valida($out) ? $out : null;
    }
    return null;
  }
}

global $pdo;
if (!isset($pdo) || !($pdo instanceof PDO)) {
  compra_fail('No hay conexión a la base de datos (PDO no disponible).');
}

/* =========================================================
   AUTH / AUDITORÍA
========================================================= */
if (!function_exists('compra_get_header_value')) {
  function compra_get_header_value(string $key): string {
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
    $v = $_SERVER[$serverKey] ?? '';
    if (!is_string($v)) $v = '';
    return trim($v);
  }
}

if (!function_exists('compra_get_bearer_token')) {
  function compra_get_bearer_token(): string {
    $h = compra_get_header_value('Authorization');
    if ($h === '') $h = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($h === '') return '';
    if (stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
    return '';
  }
}

if (!function_exists('compra_base64url_decode')) {
  function compra_base64url_decode(string $s): string {
    $s = str_replace(['-', '_'], ['+', '/'], $s);
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    $out = base64_decode($s, true);
    return $out === false ? '' : $out;
  }
}

if (!function_exists('compra_extract_positive_int_from_candidates')) {
  function compra_extract_positive_int_from_candidates(array $candidates): int {
    foreach ($candidates as $c) {
      if (is_numeric($c)) {
        $id = (int)$c;
        if ($id > 0) return $id;
      }
    }
    return 0;
  }
}

if (!function_exists('compra_get_id_usuario_from_token')) {
  function compra_get_id_usuario_from_token(): int {
    $token = compra_get_bearer_token();
    if ($token === '' || substr_count($token, '.') !== 2) {
      return 0;
    }

    $parts = explode('.', $token);
    $payloadJson = compra_base64url_decode($parts[1] ?? '');
    if ($payloadJson === '') {
      return 0;
    }

    $payload = json_decode($payloadJson, true);
    if (!is_array($payload)) {
      return 0;
    }

    return compra_extract_positive_int_from_candidates([
      $payload['idUsuarioMaster'] ?? null,
      $payload['id_usuario_master'] ?? null,
      $payload['idUsuario'] ?? null,
      $payload['id_usuario'] ?? null,
      $payload['uid'] ?? null,
      $payload['sub'] ?? null,
    ]);
  }
}

if (!function_exists('compra_get_id_usuario_from_body_or_request')) {
  function compra_get_id_usuario_from_body_or_request(array $body = []): int {
    return compra_extract_positive_int_from_candidates([
      $body['idUsuarioMaster'] ?? null,
      $body['id_usuario_master'] ?? null,
      $body['idUsuario'] ?? null,
      $body['id_usuario'] ?? null,

      $_POST['idUsuarioMaster'] ?? null,
      $_POST['id_usuario_master'] ?? null,
      $_POST['idUsuario'] ?? null,
      $_POST['id_usuario'] ?? null,

      $_GET['idUsuarioMaster'] ?? null,
      $_GET['id_usuario_master'] ?? null,
      $_GET['idUsuario'] ?? null,
      $_GET['id_usuario'] ?? null,
    ]);
  }
}

if (!function_exists('compra_get_id_usuario_from_x_session')) {
  function compra_get_id_usuario_from_x_session(PDO $pdo): int {
    $sessionKey = compra_get_header_value('X-Session');
    if ($sessionKey === '') return 0;

    try {
      $chk = $pdo->query("SHOW TABLES LIKE 'sesiones'");
      $exists = $chk ? (bool)$chk->fetchColumn() : false;
      if (!$exists) return 0;

      $st = $pdo->prepare("
        SELECT *
        FROM sesiones
        WHERE session_key = :k
        LIMIT 1
      ");
      $st->execute([':k' => $sessionKey]);
      $row = $st->fetch(PDO::FETCH_ASSOC);

      if (!$row || !is_array($row)) {
        return 0;
      }

      return compra_extract_positive_int_from_candidates([
        $row['idUsuarioMaster'] ?? null,
        $row['id_usuario_master'] ?? null,
        $row['id_usuario'] ?? null,
        $row['idUsuario'] ?? null,
        $row['uid'] ?? null,
        $row['sub'] ?? null,
      ]);
    } catch (Throwable $e) {
      return 0;
    }
  }
}

if (!function_exists('compra_get_id_usuario_from_request')) {
  function compra_get_id_usuario_from_request($pdoOrBody = null, array $body = []): int {
    $pdo = $pdoOrBody instanceof PDO ? $pdoOrBody : null;

    if (is_array($pdoOrBody) && empty($body)) {
      $body = $pdoOrBody;
    }

    if (function_exists('mv_secure_auth_user_id')) {
      $id = mv_secure_auth_user_id();
      if ($id > 0) return $id;
    }

    $id = (int)($GLOBALS['AUTH_USER_MASTER_ID'] ?? 0);
    if ($id > 0) return $id;


    $id = compra_get_id_usuario_from_token();
    if ($id > 0) return $id;

    $id = compra_get_id_usuario_from_body_or_request($body);
    if ($id > 0) return $id;

    if ($pdo instanceof PDO) {
      $id = compra_get_id_usuario_from_x_session($pdo);
      if ($id > 0) return $id;
    }

    return 0;
  }
}

if (!function_exists('compra_resolver_usuario_auditoria')) {
  function compra_resolver_usuario_auditoria(PDO $pdo, array $src = []): int {
    $id = compra_get_id_usuario_from_request($pdo, $src);
    if ($id > 0) return $id;

    if (!empty($_POST) && is_array($_POST)) {
      $id = compra_get_id_usuario_from_request($pdo, $_POST);
      if ($id > 0) return $id;
    }

    $id = compra_get_id_usuario_from_request($pdo, $_GET ?? []);
    if ($id > 0) return $id;

    return 0;
  }
}

if (!function_exists('compra_auditar_seguro')) {
  function compra_auditar_seguro(
    PDO $pdo,
    int $idUsuario,
    string $accion,
    ?string $entidad,
    $idEntidad,
    $detalle
  ): void {
    try {
      if ($idUsuario <= 0) {
        $idUsuario = compra_get_id_usuario_from_request($pdo, []);
      }

      if ($idUsuario <= 0) {
        return;
      }

      auditar($pdo, $idUsuario, 'compras', $accion, $entidad, $idEntidad, $detalle);
    } catch (Throwable $e) {
      // nunca romper el flujo por auditoría
    }
  }
}

/* =========================================================
   HELPERS SNAPSHOT AUDITORÍA
========================================================= */
if (!function_exists('compra_obtener_movimiento_por_id')) {
  function compra_obtener_movimiento_por_id(PDO $pdo, int $idMovimiento): ?array {
    if ($idMovimiento <= 0) return null;

    $st = $pdo->prepare("
      SELECT *
      FROM movimientos
      WHERE id_movimiento = :id
      LIMIT 1
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('compra_obtener_primer_item_movimiento')) {
  function compra_obtener_primer_item_movimiento(PDO $pdo, int $idMovimiento): ?array {
    if ($idMovimiento <= 0) return null;

    $st = $pdo->prepare("
      SELECT
        id_item,
        id_movimiento,
        id_stock_producto,
        id_stock_producto AS id_detalle,
        cantidad,
        precio,
        iva_pct,
        subtotal,
        iva_monto,
        total
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
      LIMIT 1
    ");
    $st->execute([':id' => $idMovimiento]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
  }
}

if (!function_exists('compra_obtener_medios_pago_movimiento')) {
  function compra_obtener_medios_pago_movimiento(PDO $pdo, int $idMovimiento): array {
    if ($idMovimiento <= 0) return [];

    // Usa el helper global cuando está disponible para devolver siempre el detalle
    // completo de cheques/eCheqs, incluida la descripción del flujo.
    if (function_exists('mv_medios_pago_listar_detalle_por_movimientos')) {
      try {
        $map = mv_medios_pago_listar_detalle_por_movimientos($pdo, [$idMovimiento]);
        return $map[$idMovimiento] ?? [];
      } catch (Throwable $e) {
        // Si algo falla en una instalación vieja, cae al SELECT básico de compatibilidad.
      }
    }

    try {
      $st = $pdo->prepare("
        SELECT
          mmp.id_compra_medio_pago,
          mmp.id_movimiento,
          mmp.id_medio_pago,
          mmp.monto,
          mmp.id_cheque,
          mmp.cheque_tipo,
          COALESCE(mp.nombre, '') AS medio_pago_nombre
        FROM movimientos_medios_pago mmp
        LEFT JOIN medios_pago mp
          ON mp.id_medio_pago = mmp.id_medio_pago
        WHERE mmp.id_movimiento = :id
        ORDER BY mmp.id_compra_medio_pago ASC
      ");
      $st->execute([':id' => $idMovimiento]);
      return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $e) {
      return [];
    }
  }
}

/* =========================================================
   HELPERS NEGOCIO
========================================================= */
if (!function_exists('compra_get_tipo_operacion_id')) {
  function compra_get_tipo_operacion_id(PDO $pdo): int {
    $st = $pdo->prepare("
      SELECT id_tipo_operacion
      FROM tipos_operacion
      WHERE activo = 1 AND UPPER(nombre) = 'COMPRA'
      LIMIT 1
    ");
    $st->execute();
    $id = $st->fetchColumn();
    return $id ? (int)$id : 0;
  }
}

if (!function_exists('compra_item_desde_src')) {
  function compra_item_desde_src(array $src, float $monto_total, int $idStockProducto): array {
    $cantidad  = compra_n_float($src['cantidad']  ?? null);
    $precio    = compra_n_float($src['precio']    ?? null);
    $iva_pct   = compra_n_float($src['iva_pct']   ?? null);
    $subtotal  = compra_n_float($src['subtotal']  ?? null);
    $iva_monto = compra_n_float($src['iva_monto'] ?? null);
    $total     = compra_n_float($src['total']     ?? null);

    $hasItemFields = (
      $cantidad  !== null ||
      $precio    !== null ||
      $iva_pct   !== null ||
      $subtotal  !== null ||
      $iva_monto !== null ||
      $total     !== null
    );

    if (!$hasItemFields) {
      return [
        'id_stock_producto' => $idStockProducto,
        'id_detalle'        => $idStockProducto,
        'cantidad'          => 1.0,
        'precio'            => (float)$monto_total,
        'iva_pct'           => 0.0,
        'subtotal'          => (float)$monto_total,
        'iva_monto'         => 0.0,
        'total'             => (float)$monto_total,
      ];
    }

    $cantidad = $cantidad !== null ? (float)$cantidad : 1.0;
    $precio   = $precio   !== null ? (float)$precio   : 0.0;
    $iva_pct  = $iva_pct  !== null ? (float)$iva_pct  : 0.0;

    $calc_sub = $cantidad * $precio;
    $calc_iva = $calc_sub * ($iva_pct / 100.0);
    $calc_tot = $calc_sub + $calc_iva;

    $subtotal  = $subtotal  !== null ? (float)$subtotal  : $calc_sub;
    $iva_monto = $iva_monto !== null ? (float)$iva_monto : $calc_iva;
    $total     = $total     !== null ? (float)$total     : $calc_tot;

    return [
      'id_stock_producto' => $idStockProducto,
      'id_detalle'        => $idStockProducto,
      'cantidad'          => $cantidad,
      'precio'            => $precio,
      'iva_pct'           => $iva_pct,
      'subtotal'          => $subtotal,
      'iva_monto'         => $iva_monto,
      'total'             => $total,
    ];
  }
}

if (!function_exists('compra_validar_o_fallar')) {
  function compra_validar_o_fallar(PDO $pdo, array $src): array {
    $fecha = compra_normalizar_fecha_movimiento($src['fecha'] ?? null);
    if ($fecha === null) {
      compra_fail('Compra inválida: la fecha es obligatoria y debe venir desde el modal en formato AAAA-MM-DD.');
    }

    $id_clasificacion = compra_n_int($src['id_clasificacion'] ?? null);
    $id_tipo_venta = compra_n_int($src['id_tipo_venta'] ?? null);

    if ($id_tipo_venta === null || $id_tipo_venta <= 0) {
      $maybeMp = compra_n_int($src['id_medio_pago'] ?? null);
      if ($maybeMp && $maybeMp > 0) {
        $id_tipo_venta = 1;
      } else {
        $esPagadaSrc = $src['es_pagada'] ?? null;
        if ($esPagadaSrc !== null) {
          $id_tipo_venta = (filter_var($esPagadaSrc, FILTER_VALIDATE_BOOLEAN)) ? 1 : 2;
        } else {
          $accion = strtolower(trim((string)($src['accion_compra'] ?? '')));
          $id_tipo_venta = ($accion === 'pagar') ? 1 : 2;
        }
      }
    }

    if (!in_array($id_tipo_venta, [1, 2], true)) {
      compra_fail('Compra inválida: id_tipo_venta debe ser 1 (CONTADO) o 2 (CUENTA CORRIENTE).');
    }

    $id_medio_pago = compra_n_int($src['id_medio_pago'] ?? null);
    if ($id_tipo_venta === 2) {
      $id_medio_pago = null;
    }

    $id_proveedor = compra_n_int($src['id_proveedor'] ?? null);
    $id_stock_producto = compra_n_int(
      $src['id_stock_producto']
      ?? $src['idStockProducto']
      ?? $src['id_detalle']
      ?? $src['idDetalle']
      ?? null
    );
    $monto_total = compra_n_float($src['monto_total'] ?? null);

    $id_tipo_operacion_compra = compra_get_tipo_operacion_id($pdo);
    if ($id_tipo_operacion_compra <= 0) {
      compra_fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
    }

    if (!$id_proveedor || $id_proveedor <= 0) {
      compra_fail('En Compras el Proveedor es obligatorio.');
    }

    if (!$id_stock_producto || $id_stock_producto <= 0) {
      compra_fail('En Compras el Detalle es obligatorio.');
    }

    $item = compra_item_desde_src($src, (float)($monto_total ?? 0.0), (int)$id_stock_producto);
    $totalCabecera = (float)$item['total'];

    return [
      'fecha'             => $fecha,
      'id_tipo_operacion' => $id_tipo_operacion_compra,
      'id_clasificacion'  => $id_clasificacion,
      'id_tipo_venta'     => $id_tipo_venta,
      'id_cliente'        => null,
      'id_medio_pago'     => $id_medio_pago,
      'id_proveedor'      => $id_proveedor,
      'id_stock_producto' => $id_stock_producto,
      'id_detalle'        => $id_stock_producto,
      'monto_total'       => $totalCabecera,
      'es_pagada'         => $id_tipo_venta === 1,
      'item'              => $item,
    ];
  }
}

if (!function_exists('compra_insertar_movimiento')) {
  function compra_insertar_movimiento(PDO $pdo, array $v): int {
    $stmt = $pdo->prepare("
      INSERT INTO movimientos (
        fecha,
        id_tipo_operacion,
        id_clasificacion, id_tipo_venta,
        id_cliente, id_proveedor,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion, :id_tipo_venta,
        NULL, :id_proveedor,
        :monto_total, :id_medio_pago
      )
    ");

    $stmt->execute([
      ':fecha'             => $v['fecha'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion'  => $v['id_clasificacion'],
      ':id_tipo_venta'     => $v['id_tipo_venta'],
      ':id_proveedor'      => $v['id_proveedor'],
      ':monto_total'       => $v['monto_total'],
      ':id_medio_pago'     => $v['id_medio_pago'],
    ]);

    return (int)$pdo->lastInsertId();
  }
}

if (!function_exists('compra_insertar_item')) {
  function compra_insertar_item(PDO $pdo, int $idMovimiento, array $it): void {
    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_stock_producto, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_stock_producto, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");

    $insItem->execute([
      ':id_movimiento'     => $idMovimiento,
      ':id_stock_producto' => $it['id_stock_producto'],
      ':cantidad'          => $it['cantidad'],
      ':precio'            => $it['precio'],
      ':iva_pct'           => $it['iva_pct'],
      ':subtotal'          => $it['subtotal'],
      ':iva_monto'         => $it['iva_monto'],
      ':total'             => $it['total'],
    ]);
  }
}

if (!function_exists('compra_guardar_primer_item')) {
  function compra_guardar_primer_item(PDO $pdo, int $idMovimiento, array $it): void {
    $getFirst = $pdo->prepare("
      SELECT id_item
      FROM movimientos_items
      WHERE id_movimiento = :id
      ORDER BY id_item ASC
      LIMIT 1
    ");
    $getFirst->execute([':id' => $idMovimiento]);
    $first = $getFirst->fetch(PDO::FETCH_ASSOC);

    if ($first && !empty($first['id_item'])) {
      $id_item = (int)$first['id_item'];

      $updItem = $pdo->prepare("
        UPDATE movimientos_items SET
          id_stock_producto = :id_stock_producto,
          cantidad          = :cantidad,
          precio            = :precio,
          iva_pct           = :iva_pct,
          subtotal          = :subtotal,
          iva_monto         = :iva_monto,
          total             = :total
        WHERE id_item = :id_item
        LIMIT 1
      ");

      $updItem->execute([
        ':id_stock_producto' => $it['id_stock_producto'],
        ':cantidad'          => $it['cantidad'],
        ':precio'            => $it['precio'],
        ':iva_pct'           => $it['iva_pct'],
        ':subtotal'          => $it['subtotal'],
        ':iva_monto'         => $it['iva_monto'],
        ':total'             => $it['total'],
        ':id_item'           => $id_item,
      ]);
      return;
    }

    compra_insertar_item($pdo, $idMovimiento, $it);
  }
}