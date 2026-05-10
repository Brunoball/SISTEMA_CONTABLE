import React from "react";
import ClienteDocumentos from "./ClienteDocumentos.jsx";

export default function Remitos() {
  return (
    <ClienteDocumentos
      grupo="remitos"
      titulo="Remitos"
      subtitulo="Buscá un cliente y visualizá todos los remitos generados desde ventas o documentos comerciales convertidos."
      emptyTitle="Seleccioná un cliente para ver sus remitos"
      emptyText="Acá se centralizan los PDFs de remitos vinculados a cada venta o documento comercial."
      clienteCounterLabel="Clientes con remitos"
      totalCounterLabel="Remitos encontrados"
      visibleCounterLabel="Remitos visibles"
      documentoSingular="remito"
      documentoPlural="remitos"
      searchPlaceholder="Buscar por número, producto o venta..."
      noDocsTitle="No hay remitos para este cliente"
      noDocsText="Probá con otro cliente o limpiá la búsqueda."
    />
  );
}
