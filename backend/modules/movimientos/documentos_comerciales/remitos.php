<?php
// backend/modules/movimientos/documentos_comerciales/remitos.php
declare(strict_types=1);

function remitos_clientes_listar(PDO $pdo): void {
  doccom_clientes_listar_por_tipos($pdo, ['REMITO'], 'remitos');
}

function remitos_documentos_cliente(PDO $pdo): void {
  doccom_documentos_cliente_por_tipos($pdo, ['REMITO'], 'remitos');
}
