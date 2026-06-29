<?php
// backend/modules/movimientos/route.php
declare(strict_types=1);

require_once __DIR__ . '/core/secure_context.php';

if (!function_exists('route_movimientos')) {
  function route_movimientos(string $action): bool
  {
    global $pdo;

    $action = strtolower(trim((string)$action));

    // Validación central del contexto seguro del módulo.
    // Si el frontend envía idTenant/idUsuarioMaster, deben coincidir con la sesión real.
    mv_secure_context_guard($action);

    switch ($action) {

      /* =========================
         GLOBAL / CATÁLOGO
      ========================= */
      case 'catalogo_crear':
        require __DIR__ . '/global/catalogo.php';
        return true;

      /* =========================
         GLOBAL / CHEQUES Y ECHEQS
      ========================= */
      case 'mov_global_cheques_guardar':
      case 'mov_global_cheques_obtener':
      case 'mov_global_cheques_listar':
      case 'mov_global_cheques_actualizar':
      case 'mov_global_cheques_editar':
      case 'mov_global_cheques_eliminar':
      case 'mov_global_cheques_verificar_numero':
      case 'mov_global_cheques_cartera_listar':
      case 'mov_global_cheques_depositados_listar':
      case 'mov_global_cheques_comprobantes_descargar':
        require __DIR__ . '/global/cheques.php';
        route_mov_global_cheques_action($pdo, $action);
        return true;


      /* =========================
         GLOBAL / COMPROBANTES Y ARCHIVOS DE MOVIMIENTOS
      ========================= */
      case 'mov_global_comprobantes_subir':
      case 'mov_global_comprobantes_info':
      case 'mov_global_comprobantes_descargar':
      case 'mov_global_comprobantes_eliminar':
      case 'mov_global_comprobantes_asociar_movimiento':
      case 'mov_global_comprobantes_asociar_movimientos':
      case 'mov_global_comprobantes_vincular_movimiento':
      case 'mov_global_comprobantes_vincular_movimiento_json':
      case 'mov_global_comprobantes_vincular_movimientos':
      case 'mov_global_comprobantes_vincular_movimientos_lote':
      case 'mov_global_comprobantes_vincular_movimientos_lote_upload':
      case 'ventas_comprobantes_descargar':
      case 'ventas_comprobantes_vincular_movimiento':
      case 'ventas_comprobantes_vincular_movimientos_lote':
      case 'ventas_comprobantes_eliminar':
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
      case 'compras_comprobantes_eliminar':
      case 'compras_eliminar_comprobante':
      case 'comprobante_eliminar_por_movimiento':
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
      case 'ordenes_pago_comprobante_subir_y_vincular':
      case 'ordenes_pago_comprobantes_subir_y_vincular':
      case 'ordenes_pago_comprobantes_asociar_movimientos':
      case 'ordenes_pago_comprobantes_descargar':
      case 'ordenes_pago_comprobantes_info':
      case 'ordenes_pago_comprobante_asociar_movimientos':
      case 'ordenes_pago_comprobante_descargar':
      case 'ordenes_pago_comprobante_info':
      case 'ordenes_pago_comprobante_eliminar':
      case 'ordenes_pago_comprobantes_eliminar':
      case 'otros_ingresos_comprobantes_vincular_movimiento_upload':
      case 'otros_ingresos_comprobantes_vincular_movimiento':
      case 'otros_ingresos_comprobantes_info':
      case 'otros_ingresos_comprobantes_descargar':
      case 'otros_ingresos_comprobantes_eliminar':
      case 'otros_egresos_comprobantes_vincular_movimiento_upload':
      case 'otros_egresos_comprobantes_vincular_movimiento':
      case 'otros_egresos_comprobantes_info':
      case 'otros_egresos_comprobantes_descargar':
      case 'otros_egresos_comprobantes_eliminar':
        require __DIR__ . '/global/comprobantes.php';
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
      case 'otros_ingresos_confirmar_pago':
      case 'otros_ingresos_eliminar':
      case 'otros_ingresos_detalles_crear':

        require __DIR__ . '/otros_ingresos/route.php';
        return true;

      /* =========================
         OTROS EGRESOS
      ========================= */
      case 'otros_egresos_listar':
      case 'otros_egresos_obtener':
      case 'otros_egresos_crear':
      case 'otros_egresos_actualizar':
      case 'otros_egresos_confirmar_pago':
      case 'otros_egresos_eliminar':
      case 'otros_egresos_detalles_crear':
        require __DIR__ . '/otros_egresos/route.php';
        return true;

      /* =========================
         PRESUPUESTOS
      ========================= */
      case 'presupuestos_listar':
      case 'presupuestos_live_token':
      case 'presupuestos_obtener':
      case 'presupuestos_crear':
      case 'presupuestos_documentos_cliente':
      case 'presupuestos_convertir_venta':
      case 'presupuestos_eliminar':
      case 'documentos_comerciales_clientes_listar':
      case 'documentos_comerciales_documentos_cliente':
      case 'documentos_comerciales_facturas_clientes_listar':
      case 'documentos_comerciales_facturas_documentos_cliente':
      case 'documentos_comerciales_remitos_clientes_listar':
      case 'documentos_comerciales_remitos_documentos_cliente':
      case 'documentos_comerciales_presupuestos_documentos_cliente':
        require __DIR__ . '/documentos_comerciales/route.php';
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

        require __DIR__ . '/recibos/route.php';
        return true;

      /* =========================
         COMPROBANTES GENERALES
      ========================= */
      case 'comprobantes_subir':
      case 'comprobantes_info':
      case 'comprobantes_proximo_numero_no_emitido':
      case 'comprobantes_descargar':
      case 'comprobantes_link':
      case 'comprobantes_descargar_token':
      case 'comprobantes_eliminar':
      case 'comprobantes_asociar_movimiento':
      case 'comprobantes_asociar_movimientos':
      case 'comprobantes_vincular_movimiento':
      case 'comprobantes_vincular_movimientos':
      case 'comprobantes_vincular_movimientos_lote':
      case 'comprobantes_vincular_movimientos_lote_upload':
        require __DIR__ . '/global/comprobantes.php';
        return true;



      /* =========================
         CIERRE DE CAJA / VENTAS
      ========================= */
      case 'cierre_caja_estado':
      case 'cierres_caja_estado':
      case 'cierre_caja_cerrar_fecha':
      case 'cierres_caja_cerrar_fecha':
      case 'cierre_caja_cerrar_hoy':
      case 'cierres_caja_cerrar_hoy':
      case 'cierre_caja_cerrar_hasta_ayer':
      case 'cierres_caja_cerrar_hasta_ayer':
      case 'cierre_caja_listar':
      case 'cierres_caja_listar':
        require __DIR__ . '/cierre_caja/route.php';
        route_cierre_caja($pdo, $action);
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
         TIENDA NUBE -> MOVIMIENTOS
         
         Compatibilidad legacy: las acciones mantienen el nombre viejo,
         pero la lógica real vive en modules/tiendanube.
      ========================= */
      case 'movimientos_tiendanube_sync_venta':
      case 'movimientos_tiendanube_reparar_fechas':
        require __DIR__ . '/../tiendanube/route.php';
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

        require __DIR__ . '/ventas/route.php';
        return true;

      /* =========================
         CLIENTES FISCALES
      ========================= */
      case 'cliente_fiscal_get':
      case 'cliente_fiscal_upsert':
      case 'cliente_fiscal_crear_desde_arca':
      case 'cliente_fiscal_resolver_desde_arca':
      case 'proveedor_fiscal_get':
      case 'proveedor_fiscal_upsert':
      case 'proveedor_fiscal_crear_desde_arca':
      case 'proveedor_fiscal_resolver_desde_arca':
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