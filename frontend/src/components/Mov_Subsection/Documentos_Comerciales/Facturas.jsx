import React from "react";
import ClienteDocumentos from "./ClienteDocumentos.jsx";

export default function Facturas() {
  return (
    <ClienteDocumentos
      grupo="facturas"
      titulo="Facturación"
      subtitulo="Buscá un cliente y visualizá todas sus facturas emitidas, no emitidas, notas de crédito y notas de débito."
      emptyTitle="Seleccioná un cliente para ver sus facturas"
      emptyText="Acá se centralizan los PDFs fiscales y no fiscales generados desde ventas."
      clienteCounterLabel="Clientes con facturas"
      totalCounterLabel="Facturas encontradas"
      visibleCounterLabel="Facturas visibles"
      documentoSingular="factura"
      documentoPlural="facturas"
      searchPlaceholder="Buscar por número, tipo o producto..."
      noDocsTitle="No hay facturas para este cliente"
      noDocsText="Probá con otro cliente o limpiá la búsqueda."
    />
  );
}
