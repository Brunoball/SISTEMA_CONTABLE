<?php
declare(strict_types=1);

// backend/modules/cheques/echeq_cartera/echeq_cartera_depositar.php

header('Content-Type: application/json; charset=utf-8');

if (!isset($pdo) || !($pdo instanceof PDO)) {
    http_response_code(500);
    echo json_encode([
        'exito' => false,
        'mensaje' => 'PDO no disponible. Este archivo debe ejecutarse vía route.php o routes/api.php.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!function_exists('echeq_cartera_ok')) {
    function echeq_cartera_ok(array $payload = [], int $status = 200): void
    {
        http_response_code($status);
        echo json_encode(
            array_merge(['exito' => true], $payload),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
        );
        exit;
    }
}

if (!function_exists('echeq_cartera_fail')) {
    function echeq_cartera_fail(string $mensaje, int $status = 400, array $extra = []): void
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

if (!function_exists('echeq_cartera_as_int')) {
    function echeq_cartera_as_int($value, int $default = 0): int
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
    $raw = file_get_contents('php://input');
    $input = json_decode($raw ?: '', true);
    if (!is_array($input)) {
        $input = [];
    }

    $idCheque = echeq_cartera_as_int(
        $input['id_cheque']
            ?? $_POST['id_cheque']
            ?? $_GET['id_cheque']
            ?? 0
    );

    if ($idCheque <= 0) {
        echeq_cartera_fail('ID de echeq inválido. Se requiere un id_cheque positivo.');
    }

    $stmt = $pdo->prepare("
        SELECT
            id_cheque,
            tipo,
            id_movimiento,
            id_comprobante,
            fecha_emision,
            emisor,
            numero_cheque,
            importe,
            fecha_pago,
            activo
        FROM movimientos_cheques
        WHERE id_cheque = :id_cheque
          AND tipo = 'echeq'
        LIMIT 1
    ");
    $stmt->execute([':id_cheque' => $idCheque]);
    $echeq = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$echeq) {
        echeq_cartera_fail('No se encontró el echeq especificado.', 404);
    }

    if ((int)$echeq['activo'] !== 1) {
        echeq_cartera_fail('Este echeq ya fue depositado o anulado.');
    }

    $importe = isset($echeq['importe']) ? (float)$echeq['importe'] : 0;
    if ($importe <= 0) {
        echeq_cartera_fail('El echeq tiene un importe inválido.');
    }

    $pdo->beginTransaction();

    try {
        /*
         * Creamos el nuevo movimiento y lo vinculamos al echeq por id_detalle.
         * Así no rompemos el id_movimiento original del echeq.
         */
        $stmtInsertMovimiento = $pdo->prepare("
            INSERT INTO movimientos (
                fecha,
                id_tipo_operacion,
                id_detalle,
                monto_total,
                created_at
            ) VALUES (
                :fecha,
                :id_tipo_operacion,
                :id_detalle,
                :monto_total,
                NOW()
            )
        ");

        $stmtInsertMovimiento->execute([
            ':fecha' => date('Y-m-d'),
            ':id_tipo_operacion' => 4,
            ':id_detalle' => $idCheque,
            ':monto_total' => $importe,
        ]);

        $idMovimientoNuevo = (int)$pdo->lastInsertId();

        if ($idMovimientoNuevo <= 0) {
            throw new Exception('No se pudo generar el movimiento destino para el depósito del echeq.');
        }

        /*
         * Dar de baja el echeq en cartera
         */
        $stmtUpdateCheque = $pdo->prepare("
            UPDATE movimientos_cheques
            SET activo = 0,
                updated_at = NOW()
            WHERE id_cheque = :id_cheque
              AND tipo = 'echeq'
              AND activo = 1
        ");
        $stmtUpdateCheque->execute([':id_cheque' => $idCheque]);

        if ($stmtUpdateCheque->rowCount() <= 0) {
            throw new Exception('No se pudo actualizar el echeq. Posiblemente ya estaba inactivo.');
        }

        $pdo->commit();

        echeq_cartera_ok([
            'mensaje' => 'Echeq depositado correctamente. Se dio de baja de cartera y se registró en movimientos.',
            'id_cheque' => $idCheque,
            'id_movimiento' => $idMovimientoNuevo,
            'id_tipo_operacion' => 4,
            'id_detalle' => $idCheque,
            'echeq' => [
                'tipo' => (string)($echeq['tipo'] ?? ''),
                'emisor' => (string)($echeq['emisor'] ?? ''),
                'numero_cheque' => (string)($echeq['numero_cheque'] ?? ''),
                'importe' => $importe,
                'fecha_emision' => (string)($echeq['fecha_emision'] ?? ''),
                'fecha_pago' => (string)($echeq['fecha_pago'] ?? ''),
            ]
        ]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
} catch (Throwable $e) {
    echeq_cartera_fail(
        'Error al depositar el echeq: ' . $e->getMessage(),
        500,
        [
            'debug' => [
                'archivo' => $e->getFile(),
                'linea' => $e->getLine(),
            ]
        ]
    );
}