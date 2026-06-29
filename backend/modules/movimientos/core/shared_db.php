<?php
// backend/modules/movimientos/core/shared_db.php

declare(strict_types=1);

require_once __DIR__ . '/../global/medios_pago.php';

if (!function_exists('mvx_payment_storage_plan')) {
  /**
   * Regla global de persistencia de medios de pago.
   * El detalle real ahora vive en global/medios_pago.php.
   */
  function mvx_payment_storage_plan(array $mediosValidados, $fallbackIdMedio = null): array
  {
    $fallback = (is_numeric($fallbackIdMedio) && (int)$fallbackIdMedio > 0)
      ? (int)$fallbackIdMedio
      : null;

    return mv_medios_pago_storage_plan($mediosValidados, $fallback);
  }
}


if (!function_exists('mvx_payment_summary')) {
  function mvx_payment_summary(?int $idTipoVenta, string $legacyName, array $detalleRows = []): string
  {
    if ($idTipoVenta === 2) {
      return 'CUENTA CORRIENTE';
    }

    $detalleRows = array_values(array_filter($detalleRows, 'is_array'));
    if (!empty($detalleRows)) {
      $principal = trim((string)($detalleRows[0]['medio_pago_nombre'] ?? $detalleRows[0]['nombre_medio'] ?? ''));
      if ($principal === '') $principal = trim($legacyName);
      if ($principal === '') $principal = 'CONTADO';
      return count($detalleRows) === 1 ? $principal : ($principal . ' +' . (count($detalleRows) - 1));
    }

    $legacyName = trim($legacyName);
    return $legacyName !== '' ? $legacyName : 'CONTADO';
  }
}

if (!function_exists('mvx_pick_item_description')) {
  function mvx_pick_item_description(?string $stockName, ?string $detailName, ?string $fallback = ''): string
  {
    $stockName = trim((string)$stockName);
    if ($stockName !== '') return $stockName;

    $detailName = trim((string)$detailName);
    if ($detailName !== '') return $detailName;

    return trim((string)$fallback);
  }
}
