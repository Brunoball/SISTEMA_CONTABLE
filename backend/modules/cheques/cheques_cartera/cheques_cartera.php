<?php
declare(strict_types=1);

// backend/modules/cheques/cheques_cartera/cheques_cartera.php

header('Content-Type: application/json; charset=utf-8');

if (!isset($pdo) || !($pdo instanceof PDO)) {
  http_response_code(500);
  echo json_encode([
    'exito' => false,
    'mensaje' => 'PDO no disponible. Este archivo debe ejecutarse vía route.php o routes/api.php.'
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if (!function_exists('cheques_cartera_ok')) {
  function cheques_cartera_ok(array $payload = [], int $status = 200): void
  {
    http_response_code($status);
    echo json_encode(
      array_merge(['exito' => true], $payload),
      JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
  }
}

if (!function_exists('cheques_cartera_fail')) {
  function cheques_cartera_fail(string $mensaje, int $status = 400, array $extra = []): void
  {
    http_response_code($status);
    echo json_encode(
      array_merge([
        'exito' => false,
        'mensaje' => $mensaje,
      ], $extra),
      JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
  }
}

if (!function_exists('cheques_cartera_as_int')) {
  function cheques_cartera_as_int($value, int $default = 0): int
  {
    if ($value === null || $value === '') {
      return $default;
    }

    if (!is_numeric($value)) {
      return $default;
    }

    return (int)$value;
  }
}

try {
  $limit  = cheques_cartera_as_int($_GET['limit'] ?? 100, 100);
  $offset = cheques_cartera_as_int($_GET['offset'] ?? 0, 0);
  $q      = trim((string)($_GET['q'] ?? ''));

  if ($limit <= 0) {
    $limit = 100;
  }
  if ($limit > 200) {
    $limit = 200;
  }
  if ($offset < 0) {
    $offset = 0;
  }

  $params = [];
  $where  = [
    "mc.tipo = 'cheque'",
    "mc.activo = 1",
  ];

  if ($q !== '') {
    $where[] = "(
      mc.emisor LIKE :q
      OR mc.numero_cheque LIKE :q
      OR DATE_FORMAT(mc.fecha_emision, '%d/%m/%Y') LIKE :q
      OR DATE_FORMAT(mc.fecha_pago, '%d/%m/%Y') LIKE :q
      OR CAST(mc.importe AS CHAR) LIKE :q
    )";
    $params[':q'] = '%' . $q . '%';
  }

  $whereSql = implode(' AND ', $where);

  $sql = "
    SELECT
      mc.id_cheque,
      mc.id_movimiento,
      mc.id_comprobante AS id_comprobante_directo,
      mc.fecha_emision,
      mc.emisor,
      mc.numero_cheque,
      mc.importe,
      mc.fecha_pago,

      COALESCE(ca_directo.id_comprobante, ca_rel.id_comprobante, 0) AS id_comprobante,
      COALESCE(ca_directo.archivo_mime, ca_rel.archivo_mime, '') AS archivo_mime,

      CASE
        WHEN ca_directo.id_comprobante IS NOT NULL THEN 1
        WHEN ca_rel.id_comprobante IS NOT NULL THEN 1
        ELSE 0
      END AS tiene_comprobante

    FROM movimientos_cheques mc

    LEFT JOIN comprobantes_archivos ca_directo
      ON ca_directo.id_comprobante = mc.id_comprobante

    LEFT JOIN movimientos_comprobantes mco
      ON mco.id_movimiento = mc.id_movimiento

    LEFT JOIN comprobantes_archivos ca_rel
      ON ca_rel.id_comprobante = mco.id_comprobante

    WHERE {$whereSql}
    GROUP BY
      mc.id_cheque,
      mc.id_movimiento,
      mc.id_comprobante,
      mc.fecha_emision,
      mc.emisor,
      mc.numero_cheque,
      mc.importe,
      mc.fecha_pago,
      ca_directo.id_comprobante,
      ca_directo.archivo_mime,
      ca_rel.id_comprobante,
      ca_rel.archivo_mime
    ORDER BY mc.fecha_pago ASC, mc.fecha_emision ASC, mc.id_cheque DESC
    LIMIT :limit_plus_one OFFSET :offset
  ";

  $stmt = $pdo->prepare($sql);

  foreach ($params as $key => $value) {
    $stmt->bindValue($key, $value, PDO::PARAM_STR);
  }

  $stmt->bindValue(':limit_plus_one', $limit + 1, PDO::PARAM_INT);
  $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
  $stmt->execute();

  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
  if (!is_array($rows)) {
    $rows = [];
  }

  $dedup = [];
  foreach ($rows as $row) {
    $idCheque = isset($row['id_cheque']) ? (int)$row['id_cheque'] : 0;
    if ($idCheque <= 0) {
      continue;
    }

    if (!isset($dedup[$idCheque])) {
      $dedup[$idCheque] = $row;
      continue;
    }

    $actualTiene = !empty($dedup[$idCheque]['tiene_comprobante']);
    $nuevoTiene  = !empty($row['tiene_comprobante']);

    if (!$actualTiene && $nuevoTiene) {
      $dedup[$idCheque] = $row;
      continue;
    }

    $actualIdComp = (int)($dedup[$idCheque]['id_comprobante'] ?? 0);
    $nuevoIdComp  = (int)($row['id_comprobante'] ?? 0);

    if ($nuevoIdComp > $actualIdComp) {
      $dedup[$idCheque] = $row;
    }
  }

  $rows = array_values($dedup);

  $hasMore = count($rows) > $limit;
  if ($hasMore) {
    $rows = array_slice($rows, 0, $limit);
  }

  $cheques = array_map(static function (array $row): array {
    return [
      'id_cheque'         => isset($row['id_cheque']) ? (int)$row['id_cheque'] : 0,
      'id_movimiento'     => isset($row['id_movimiento']) ? (int)$row['id_movimiento'] : 0,
      'fecha_emision'     => (string)($row['fecha_emision'] ?? ''),
      'emisor'            => (string)($row['emisor'] ?? ''),
      'numero_cheque'     => (string)($row['numero_cheque'] ?? ''),
      'importe'           => isset($row['importe']) ? (float)$row['importe'] : 0,
      'fecha_pago'        => (string)($row['fecha_pago'] ?? ''),
      'id_comprobante'    => isset($row['id_comprobante']) ? (int)$row['id_comprobante'] : 0,
      'archivo_mime'      => (string)($row['archivo_mime'] ?? ''),
      'tiene_comprobante' => !empty($row['tiene_comprobante']),
    ];
  }, $rows);

  cheques_cartera_ok([
    'cheques'     => $cheques,
    'has_more'    => $hasMore,
    'next_offset' => $hasMore ? ($offset + $limit) : null,
  ]);
} catch (Throwable $e) {
  cheques_cartera_fail(
    'Error al listar cheques en cartera: ' . $e->getMessage(),
    500,
    [
      'debug' => [
        'archivo' => $e->getFile(),
        'linea'   => $e->getLine(),
      ]
    ]
  );
}