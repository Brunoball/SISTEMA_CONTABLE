<?php
// backend/modules/movimientos/route.php
declare(strict_types=1);

if (!function_exists('route_movimientos')) {
  function route_movimientos(string $action): bool
  {
    global $pdo;

    $action = strtolower(trim((string)$action));

    switch ($action) {

      /* =========================
         GLOBAL / CATÁLOGO
      ========================= */
      case 'catalogo_crear':
        require __DIR__ . '/global/catalogo.php';
        return true;

      /* =========================
         CONFIRMAR PAGO (GENÉRICO)
      ========================= */
      case 'movimientos_confirmar_pago':
        require __DIR__ . '/confirmar_pago.php';
        return true;

      /* =========================
         OTROS INGRESOS
      ========================= */
      case 'otros_ingresos_listar':
      case 'otros_ingresos_obtener':
      case 'otros_ingresos_crear':
      case 'otros_ingresos_actualizar':
      case 'otros_ingresos_eliminar':
      case 'otros_ingresos_comprobantes_vincular_movimiento_upload':
      case 'otros_ingresos_comprobantes_info':
      case 'otros_ingresos_comprobantes_descargar':
      case 'otros_ingresos_comprobantes_eliminar':
        require __DIR__ . '/otros_ingresos/route.php';
        return true;

      /* =========================
         OTROS EGRESOS
      ========================= */
      case 'otros_egresos_listar':
      case 'otros_egresos_obtener':
      case 'otros_egresos_crear':
      case 'otros_egresos_actualizar':
      case 'otros_egresos_eliminar':
      case 'otros_egresos_comprobantes_vincular_movimiento_upload':
      case 'otros_egresos_comprobantes_info':
      case 'otros_egresos_comprobantes_descargar':
      case 'otros_egresos_comprobantes_eliminar':
        require __DIR__ . '/otros_egresos/route.php';
        return true;

      /* =========================
         ÓRDENES DE PAGO
      ========================= */
      case 'ordenes_pago_listar':
      case 'ordenes_pago_obtener':
      case 'ordenes_pago_crear':
      case 'ordenes_pago_actualizar':
      case 'ordenes_pago_eliminar':
      case 'ordenes_pago_confirmar_pago':
      case 'ordenes_pago_cheques_cartera_listar':          // ← AGREGADO
      case 'ordenes_pago_comprobante_subir_y_vincular':
      case 'ordenes_pago_comprobante_asociar_movimientos':
      case 'ordenes_pago_comprobante_descargar':
      case 'ordenes_pago_comprobante_info':
        require __DIR__ . '/ordenes_pago/route.php';
        return true;

      /* =========================
         RECIBOS
      ========================= */
      case 'recibos_listar':
      case 'recibos_obtener':
      case 'recibos_crear':
      case 'recibos_cliente_listar':
      case 'recibos_actualizar':
      case 'recibos_eliminar':
      case 'recibos_confirmar_pago':
      case 'recibos_comprobantes_subir':
      case 'recibos_comprobantes_info':
      case 'recibos_comprobantes_descargar':
      case 'recibos_comprobantes_asociar_movimiento':
      case 'recibos_comprobantes_asociar_movimientos':
      case 'recibos_comprobantes_vincular_movimiento':
      case 'recibos_comprobantes_vincular_movimiento_json':
      case 'recibos_comprobantes_vincular_movimientos':
      case 'recibos_comprobantes_vincular_movimientos_lote':
      case 'recibos_comprobantes_vincular_movimientos_lote_upload':

      /* =========================
         CHEQUES DE RECIBOS
      ========================= */
      case 'recibos_cheques_guardar':
      case 'recibos_cheques_obtener':
      case 'recibos_cheques_listar':
      case 'recibos_cheques_actualizar':
      case 'recibos_cheques_editar':
      case 'recibos_cheques_eliminar':
        require __DIR__ . '/recibos/route.php';
        return true;

      /* =========================
         COMPROBANTES GENERALES
      ========================= */
      case 'comprobantes_subir':
      case 'comprobantes_info':
      case 'comprobantes_descargar':
      case 'comprobantes_link':
      case 'comprobantes_descargar_token':
      case 'comprobantes_asociar_movimiento':
      case 'comprobantes_asociar_movimientos':
      case 'comprobantes_vincular_movimiento':
      case 'comprobantes_vincular_movimientos':
      case 'comprobantes_vincular_movimientos_lote':
      case 'comprobantes_vincular_movimientos_lote_upload':
        require __DIR__ . '/global/comprobantes.php';
        return true;

      /* =========================
         COMPROBANTES SOLO DE VENTAS
      ========================= */
      case 'ventas_comprobantes_descargar':
      case 'ventas_comprobantes_vincular_movimiento':
      case 'ventas_comprobantes_vincular_movimientos_lote':
        require __DIR__ . '/ventas/comprobantes_ventas.php';
        return true;

      /* =========================
         COMPROBANTES SOLO DE COMPRAS
      ========================= */
      case 'compras_comprobantes_subir':
      case 'compras_comprobantes_info':
      case 'compras_comprobantes_descargar':
      case 'compras_comprobantes_asociar_movimiento':
      case 'compras_comprobantes_asociar_movimientos':
      case 'compras_comprobantes_vincular_movimiento':
      case 'compras_comprobantes_vincular_movimiento_json':
      case 'compras_comprobantes_vincular_movimientos':
      case 'compras_comprobantes_vincular_movimientos_lote':
      case 'compras_comprobantes_vincular_movimientos_lote_upload':
        require __DIR__ . '/compras/comprobantes_compras.php';
        return true;

      /* =========================
         MOVIMIENTOS
      ========================= */
      case 'movimientos_listar':
      case 'movimientos_periodos_listar':
      case 'movimientos_live_token':
      case 'movimientos_crear':
      case 'movimientos_crear_batch':
      case 'movimientos_actualizar':
      case 'movimientos_editar':
      case 'movimientos_eliminar':
        require __DIR__ . '/movimientos.php';
        return true;

      /* =========================
         VENTAS
      ========================= */
      case 'ventas_listar':
      case 'ventas_live_token':
      case 'ventas_obtener':
      case 'ventas_crear':
      case 'ventas_crear_batch':
      case 'ventas_actualizar':
      case 'ventas_editar':
      case 'ventas_eliminar':
      case 'ventas_eliminar_comprobante':
      case 'ventas_nota_credito_contexto':
      case 'ventas_nota_credito_vincular':
      case 'config_facturacion_get':

      /* =========================
         CHEQUES DE VENTAS
      ========================= */
      case 'ventas_cheques_guardar':
      case 'ventas_cheques_obtener':
      case 'ventas_cheques_listar':
      case 'ventas_cheques_actualizar':
      case 'ventas_cheques_editar':
      case 'ventas_cheques_eliminar':
        require __DIR__ . '/ventas/route.php';
        return true;

      /* =========================
         CLIENTES FISCALES
      ========================= */
      case 'cliente_fiscal_get':
      case 'cliente_fiscal_upsert':
        require __DIR__ . '/ventas/clientes_fiscales.php';
        return true;

      /* =========================
         COMPRAS
      ========================= */
      case 'compras_listar':
      case 'compras_obtener':
      case 'compras_crear':
      case 'compras_crear_batch':
      case 'compras_actualizar':
      case 'compras_editar':
      case 'compras_eliminar':
      case 'compras_eliminar_comprobante':
      case 'comprobante_eliminar_por_movimiento':
        require __DIR__ . '/compras/route.php';
        return true;

      /* =========================
         ARCA / PADRÓN
      ========================= */
      case 'padron_cuit':
      case 'arca_padron_cuit':
        require __DIR__ . '/facturacion/padron.php';
        return true;

      /* =========================
         WSFEv1 / FACTURACIÓN REAL
      ========================= */
      case 'wsfe_emitir':
      case 'factura_emitir':
      case 'arca_wsfe_emitir':
        require __DIR__ . '/facturacion/wsfe_emitir.php';
        return true;

      default:
        return false;
    }
  }
}