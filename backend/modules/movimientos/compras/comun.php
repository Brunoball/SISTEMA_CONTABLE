<?php
// backend/modules/movimientos/compras/comun.php
declare(strict_types=1);

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
    return (bool)preg_match('/^\d{4}\-\d{2}\-\d{2}$/', $f);
  }
}

require_once __DIR__ . '/../../utils/auditoria.php';

if (!function_exists('compra_get_bearer_token')) {
  function compra_get_bearer_token(): string {
    $h = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
      $h = (string)$_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['Authorization'])) {
      $h = (string)$_SERVER['Authorization'];
    }

    $h = trim($h);
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

if (!function_exists('compra_get_id_usuario_from_request')) {
  function compra_get_id_usuario_from_request(array $body = []): int {
    $token = compra_get_bearer_token();

    if ($token !== '' && substr_count($token, '.') === 2) {
      $parts = explode('.', $token);
      $payloadJson = compra_base64url_decode($parts[1] ?? '');
      if ($payloadJson !== '') {
        $payload = json_decode($payloadJson, true);
        if (is_array($payload)) {
          $candidates = [
            $payload['idUsuario'] ?? null,
            $payload['id_usuario'] ?? null,
            $payload['uid'] ?? null,
            $payload['sub'] ?? null,
          ];
          foreach ($candidates as $c) {
            if (is_numeric($c)) {
              $id = (int)$c;
              if ($id > 0) return $id;
            }
          }
        }
      }
    }

    $id = $body['idUsuario'] ?? $body['id_usuario'] ?? $_POST['idUsuario'] ?? $_GET['idUsuario'] ?? null;
    if (is_numeric($id)) {
      $id = (int)$id;
      if ($id > 0) return $id;
    }

    return 0;
  }
}

if (!function_exists('compra_auditar_seguro')) {
  function compra_auditar_seguro(PDO $pdo, int $idUsuario, string $accion, ?string $entidad, $idEntidad, $detalle): void {
    if ($idUsuario <= 0) return;
    auditar($pdo, $idUsuario, 'compras', $accion, $entidad, $idEntidad, $detalle);
  }
}

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
  function compra_item_desde_src(array $src, float $monto_total, int $id_detalle): array {
    $cantidad  = compra_n_float($src['cantidad']  ?? null);
    $precio    = compra_n_float($src['precio']    ?? null);
    $iva_pct   = compra_n_float($src['iva_pct']   ?? null);
    $subtotal  = compra_n_float($src['subtotal']  ?? null);
    $iva_monto = compra_n_float($src['iva_monto'] ?? null);
    $total     = compra_n_float($src['total']     ?? null);

    $hasItemFields = (
      $cantidad !== null ||
      $precio !== null ||
      $iva_pct !== null ||
      $subtotal !== null ||
      $iva_monto !== null ||
      $total !== null
    );

    if (!$hasItemFields) {
      return [
        'id_detalle' => $id_detalle,
        'cantidad' => 1.0,
        'precio' => (float)$monto_total,
        'iva_pct' => 0.0,
        'subtotal' => (float)$monto_total,
        'iva_monto' => 0.0,
        'total' => (float)$monto_total,
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
      'id_detalle' => $id_detalle,
      'cantidad' => $cantidad,
      'precio' => $precio,
      'iva_pct' => $iva_pct,
      'subtotal' => $subtotal,
      'iva_monto' => $iva_monto,
      'total' => $total,
    ];
  }
}

if (!function_exists('compra_validar_o_fallar')) {
  function compra_validar_o_fallar(PDO $pdo, array $src): array {
    $fecha = trim((string)($src['fecha'] ?? ''));
    if ($fecha === '' || !compra_fecha_valida($fecha)) {
      $fecha = compra_today_iso();
    }

    $id_clasificacion = compra_n_int($src['id_clasificacion'] ?? null);

    $id_tipo_venta = compra_n_int($src['id_tipo_venta'] ?? null);
    if ($id_tipo_venta === null || $id_tipo_venta <= 0) {
      $maybeMp = compra_n_int($src['id_medio_pago'] ?? null);
      $id_tipo_venta = ($maybeMp && $maybeMp > 0) ? 1 : 2;
    }

    if (!in_array($id_tipo_venta, [1, 2], true)) {
      compra_fail('Compra inválida: id_tipo_venta debe ser 1 (CONTADO) o 2 (CUENTA CORRIENTE).');
    }

    $id_medio_pago = compra_n_int($src['id_medio_pago'] ?? null);
    $id_proveedor  = compra_n_int($src['id_proveedor'] ?? null);
    $id_detalle    = compra_n_int($src['id_detalle'] ?? null);
    $monto_total   = compra_n_float($src['monto_total'] ?? null);

    $id_tipo_operacion_compra = compra_get_tipo_operacion_id($pdo);
    if ($id_tipo_operacion_compra <= 0) {
      compra_fail("No existe el tipo_operacion 'COMPRA' en tipos_operacion.");
    }

    if (!$id_proveedor || $id_proveedor <= 0) {
      compra_fail('En Compras el Proveedor es obligatorio.');
    }

    if (!$id_detalle || $id_detalle <= 0) {
      compra_fail('En Compras el Detalle es obligatorio.');
    }

    if ($id_tipo_venta === 1) {
      if (!$id_medio_pago || $id_medio_pago <= 0) {
        compra_fail('Compra inválida: falta medio de pago (solo Contado).');
      }
    } else {
      $id_medio_pago = null;
    }

    $item = compra_item_desde_src($src, (float)($monto_total ?? 0.0), (int)$id_detalle);
    $totalCabecera = (float)$item['total'];

    return [
      'fecha' => $fecha,
      'id_tipo_operacion' => $id_tipo_operacion_compra,
      'id_clasificacion' => $id_clasificacion,
      'id_tipo_venta' => $id_tipo_venta,
      'id_cliente' => null,
      'id_medio_pago' => $id_medio_pago,
      'id_proveedor' => $id_proveedor,
      'id_detalle' => $id_detalle,
      'monto_total' => $totalCabecera,
      'item' => $item,
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
        id_cliente, id_proveedor, id_detalle,
        monto_total, id_medio_pago
      ) VALUES (
        :fecha,
        :id_tipo_operacion,
        :id_clasificacion, :id_tipo_venta,
        NULL, :id_proveedor, :id_detalle,
        :monto_total, :id_medio_pago
      )
    ");

    $stmt->execute([
      ':fecha' => $v['fecha'],
      ':id_tipo_operacion' => $v['id_tipo_operacion'],
      ':id_clasificacion' => $v['id_clasificacion'],
      ':id_tipo_venta' => $v['id_tipo_venta'],
      ':id_proveedor' => $v['id_proveedor'],
      ':id_detalle' => $v['id_detalle'],
      ':monto_total' => $v['monto_total'],
      ':id_medio_pago' => $v['id_medio_pago'],
    ]);

    return (int)$pdo->lastInsertId();
  }
}

if (!function_exists('compra_insertar_item')) {
  function compra_insertar_item(PDO $pdo, int $idMovimiento, array $it): void {
    $insItem = $pdo->prepare("
      INSERT INTO movimientos_items
        (id_movimiento, id_detalle, cantidad, precio, iva_pct, subtotal, iva_monto, total)
      VALUES
        (:id_movimiento, :id_detalle, :cantidad, :precio, :iva_pct, :subtotal, :iva_monto, :total)
    ");

    $insItem->execute([
      ':id_movimiento' => $idMovimiento,
      ':id_detalle' => $it['id_detalle'],
      ':cantidad' => $it['cantidad'],
      ':precio' => $it['precio'],
      ':iva_pct' => $it['iva_pct'],
      ':subtotal' => $it['subtotal'],
      ':iva_monto' => $it['iva_monto'],
      ':total' => $it['total'],
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
          id_detalle = :id_detalle,
          cantidad = :cantidad,
          precio = :precio,
          iva_pct = :iva_pct,
          subtotal = :subtotal,
          iva_monto = :iva_monto,
          total = :total
        WHERE id_item = :id_item
        LIMIT 1
      ");

      $updItem->execute([
        ':id_detalle' => $it['id_detalle'],
        ':cantidad' => $it['cantidad'],
        ':precio' => $it['precio'],
        ':iva_pct' => $it['iva_pct'],
        ':subtotal' => $it['subtotal'],
        ':iva_monto' => $it['iva_monto'],
        ':total' => $it['total'],
        ':id_item' => $id_item,
      ]);
      return;
    }

    compra_insertar_item($pdo, $idMovimiento, $it);
  }
}