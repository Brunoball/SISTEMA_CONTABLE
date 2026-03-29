<?php
// backend/modules/global/obtener_listas.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Este módulo debe ejecutarse vía routes/api.php (tenant_resolver).'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $pdo->exec("SET NAMES utf8mb4");

  /* =========================
     Helpers
  ========================= */

  if (!function_exists('normalizePeriodoMMYYYY')) {
    function normalizePeriodoMMYYYY(string $v): string {
      $s = trim($v);
      if ($s === '') return '';

      $m = '';
      $y = '';

      if (preg_match('/^\d{4}[-\/]\d{1,2}$/', $s)) {
        [$y, $m] = preg_split('/[-\/]/', $s);
      } elseif (preg_match('/^\d{1,2}[-\/]\d{4}$/', $s)) {
        [$m, $y] = preg_split('/[-\/]/', $s);
      } elseif (preg_match('/^\d{6}$/', $s)) {
        $a = (int)substr($s, 0, 4);
        if ($a >= 1900 && $a <= 2100) {
          $y = substr($s, 0, 4);
          $m = substr($s, 4, 2);
        } else {
          $m = substr($s, 0, 2);
          $y = substr($s, 2, 4);
        }
      } else {
        return $s;
      }

      $mi = (int)$m;
      $yi = (int)$y;

      if ($yi < 1900 || $yi > 2100) return '';
      if ($mi < 1 || $mi > 12) return '';

      $mm = str_pad((string)$mi, 2, '0', STR_PAD_LEFT);
      return $mm . '-' . (string)$yi;
    }
  }

  if (!function_exists('periodoSortKey')) {
    function periodoSortKey(string $mmYYYY): int {
      $s = trim($mmYYYY);
      if (!preg_match('/^\d{2}\-\d{4}$/', $s)) return 0;
      [$mm, $yy] = explode('-', $s);
      $iso = $yy . '-' . $mm . '-01';
      $ts = strtotime($iso);
      return $ts ? (int)$ts : 0;
    }
  }

  /**
   * Fetch genérico para tablas simples
   */
  $fetch = function(string $table, string $idCol) use ($pdo): array {
    $sql1 = "SELECT `$idCol` AS id, `nombre`
             FROM `$table`
             WHERE `activo` = 1
             ORDER BY `nombre` ASC";
    try {
      $stmt = $pdo->query($sql1);
    } catch (Throwable $e) {
      $sql2 = "SELECT `$idCol` AS id, `nombre`
               FROM `$table`
               ORDER BY `nombre` ASC";
      $stmt = $pdo->query($sql2);
    }

    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $out = [];

    foreach ($rows as $r) {
      $id = (int)($r['id'] ?? 0);
      $nombre = trim((string)($r['nombre'] ?? ''));
      if ($id > 0 && $nombre !== '') {
        $out[] = [
          'id' => $id,
          'nombre' => $nombre,
        ];
      }
    }

    return $out;
  };

  /**
   * NUEVO:
   * Reemplaza la vieja tabla `detalles` por `stock_productos`
   * pero mantiene la clave `detalles` para no romper el frontend actual.
   *
   * Cada item devuelve:
   * - id
   * - nombre
   * - precio
   * - stock
   * - sku
   * - id_categoria_stock
   *
   * Así luego en los modales ya podés usar esta info automáticamente.
   */
  $fetchDetallesDesdeStock = function() use ($pdo): array {
    $sql = "
      SELECT
        sp.id AS id,
        sp.nombre,
        sp.precio,
        sp.stock,
        sp.sku,
        sp.id_categoria_stock
      FROM stock_productos sp
      WHERE sp.activo = 1
        AND TRIM(COALESCE(sp.nombre, '')) <> ''
      ORDER BY sp.nombre ASC
    ";

    $stmt = $pdo->query($sql);
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    $out = [];

    foreach ($rows as $r) {
      $id = (int)($r['id'] ?? 0);
      $nombre = trim((string)($r['nombre'] ?? ''));
      $precio = isset($r['precio']) ? (float)$r['precio'] : 0.0;
      $stock = isset($r['stock']) && $r['stock'] !== null ? (int)$r['stock'] : 0;
      $sku = trim((string)($r['sku'] ?? ''));
      $idCategoriaStock = isset($r['id_categoria_stock']) && $r['id_categoria_stock'] !== null
        ? (int)$r['id_categoria_stock']
        : null;

      if ($id <= 0 || $nombre === '') {
        continue;
      }

      $out[] = [
        // se mantiene estructura compatible
        'id' => $id,
        'nombre' => $nombre,

        // extra para usar internamente después en modales
        'precio' => $precio,
        'stock' => $stock,
        'sku' => $sku,
        'id_categoria_stock' => $idCategoriaStock,
      ];
    }

    return $out;
  };

  /* =========================
     Map de tablas
  ========================= */
  $map = [
    'clasificaciones'  => ['id' => 'id_clasificacion',   'table' => 'clasificaciones'],
    'clientes'         => ['id' => 'id_cliente',         'table' => 'clientes'],

    // OJO:
    // 'detalles' ya NO sale de la tabla detalles.
    // Se arma aparte desde stock_productos para no romper el sistema.
    // 'detalles' => ['id' => 'id_detalle', 'table' => 'detalles'],

    'medios_pago'      => ['id' => 'id_medio_pago',      'table' => 'medios_pago'],
    'proveedores'      => ['id' => 'id_proveedor',       'table' => 'proveedores'],
    'tipos_venta'      => ['id' => 'id_tipo_venta',      'table' => 'tipos_venta'],
    'tipos_operacion'  => ['id' => 'id_tipo_operacion',  'table' => 'tipos_operacion'],

    // categorías de stock
    'stock_categorias' => ['id' => 'id_stock_categoria', 'table' => 'stock_categorias'],
  ];

  /* =========================
     Periodos desde movimientos
  ========================= */
  $periodos = [];
  try {
    $stmtP = $pdo->query("
      SELECT DISTINCT `periodo`
      FROM `movimientos`
      WHERE `periodo` IS NOT NULL AND TRIM(`periodo`) <> ''
    ");

    $raw = $stmtP ? $stmtP->fetchAll(PDO::FETCH_ASSOC) : [];
    $norm = [];

    foreach ($raw as $row) {
      $p = (string)($row['periodo'] ?? '');
      $mmYYYY = normalizePeriodoMMYYYY($p);
      if ($mmYYYY !== '') $norm[] = $mmYYYY;
    }

    $norm = array_values(array_unique($norm));

    usort($norm, function($a, $b) {
      return periodoSortKey($b) <=> periodoSortKey($a);
    });

    $periodos = $norm;
  } catch (Throwable $e) {
    $periodos = [];
  }

  /* =========================
     Response
  ========================= */
  $response = [
    'exito' => true,
    'listas' => [
      'periodos' => $periodos,

      // se mantiene el nombre `detalles`
      // pero ahora viene de stock_productos
      'detalles' => $fetchDetallesDesdeStock(),
    ],
  ];

  foreach ($map as $key => $cfg) {
    $response['listas'][$key] = $fetch($cfg['table'], $cfg['id']);
  }

  echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;

} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode([
    'exito'   => false,
    'mensaje' => 'Error: ' . $e->getMessage(),
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}