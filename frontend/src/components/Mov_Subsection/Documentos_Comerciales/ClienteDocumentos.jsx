import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BASE_URL from "../../../config/config.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBoxesStacked,
  faDownload,
  faEye,
  faFileInvoiceDollar,
  faFilePdf,
  faMagnifyingGlass,
  faReceipt,
  faTimes,
  faUser,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

const API = `${BASE_URL}/api.php`;
const CLIENTES_LIMIT = 120;

function safeText(value, fallback = "—") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function moneyARS(value) {
  const n = Number(value || 0);
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function formatFecha(value) {
  const s = String(value ?? "").trim();
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (!m) return s;

  const fecha = `${String(Number(m[3])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${m[1]}`;
  if (!m[4] || !m[5]) return fecha;
  return `${fecha} ${String(Number(m[4])).padStart(2, "0")}:${String(Number(m[5])).padStart(2, "0")}`;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getAuthHeaders() {
  const headers = { Accept: "application/json" };
  const token = String(localStorage.getItem("token") || "").trim();
  const sessionKey = String(
    localStorage.getItem("session_key") ||
      localStorage.getItem("sessionKey") ||
      localStorage.getItem("X-Session") ||
      ""
  ).trim();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (sessionKey) headers["X-Session"] = sessionKey;
  return headers;
}

function buildUrl(action, params = {}) {
  const qs = new URLSearchParams({ action });
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    qs.set(key, String(value));
  });
  return `${API}?${qs.toString()}`;
}

async function apiGetJson(url) {
  const res = await fetch(url, { method: "GET", headers: getAuthHeaders() });
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("La API no devolvió JSON válido.");
  }

  if (!res.ok || data?.exito === false || data?.success === false) {
    throw new Error(data?.mensaje || data?.message || "No se pudo completar la operación.");
  }

  return data || {};
}

function getDocumentoIcon(tipo) {
  const t = String(tipo || "").toUpperCase();
  if (t === "REMITO") return faBoxesStacked;
  if (t === "VENTA_NO_FACTURADA") return faReceipt;
  return faFileInvoiceDollar;
}

function getDocumentoEstado(doc) {
  const tipo = String(doc?.tipo || "").toUpperCase();
  if (tipo === "FACTURA") return doc?.emitido_en_arca ? "EMITIDA EN ARCA" : "FACTURA";
  if (tipo === "VENTA_NO_FACTURADA") return "NO EMITIDA";
  if (tipo === "REMITO") return "REMITO";
  if (tipo === "NOTA_CREDITO") return "NOTA DE CRÉDITO";
  if (tipo === "NOTA_DEBITO") return "NOTA DE DÉBITO";
  if (tipo === "PRESUPUESTO") return "PRESUPUESTO";
  return safeText(doc?.documento_label || tipo, "DOCUMENTO").toUpperCase();
}

function getClienteDisplay(cliente) {
  return safeText(cliente?.razon_social || cliente?.nombre, "Cliente sin nombre");
}

function getClienteSubtext(cliente) {
  const partes = [];
  if (cliente?.nombre && cliente?.razon_social && cliente.nombre !== cliente.razon_social) partes.push(cliente.nombre);
  if (cliente?.cuit) partes.push(`CUIT ${cliente.cuit}`);
  if (cliente?.condicion_iva) partes.push(cliente.condicion_iva);
  return partes.length ? partes.join(" · ") : "Sin datos fiscales cargados";
}

function getDocumentActions(grupo) {
  const g = normalizeText(grupo);
  if (g === "remitos" || g === "remito") {
    return {
      clientes: "documentos_comerciales_remitos_clientes_listar",
      documentos: "documentos_comerciales_remitos_documentos_cliente",
      includeGrupo: false,
    };
  }
  if (g === "facturas" || g === "factura" || g === "facturacion") {
    return {
      clientes: "documentos_comerciales_facturas_clientes_listar",
      documentos: "documentos_comerciales_facturas_documentos_cliente",
      includeGrupo: false,
    };
  }
  return {
    clientes: "documentos_comerciales_clientes_listar",
    documentos: "documentos_comerciales_documentos_cliente",
    includeGrupo: true,
  };
}

export default function ClienteDocumentos({
  grupo = "facturas",
  titulo = "Facturas",
  subtitulo = "Facturas emitidas, no emitidas y comprobantes fiscales del cliente.",
  emptyTitle = "Seleccioná un cliente",
  emptyText = "Elegí un cliente de la lista para ver sus documentos.",
  clienteCounterLabel = "Clientes con documentos",
  totalCounterLabel = "Documentos encontrados",
  visibleCounterLabel = "Documentos visibles",
  documentoSingular = "documento",
  documentoPlural = "documentos",
  searchPlaceholder = "Buscar por número, tipo o producto...",
  noDocsTitle = "No hay documentos para este cliente",
  noDocsText = "Probá con otro cliente o limpiá la búsqueda.",
  navigationTabs = null,
}) {
  const [qClientes, setQClientes] = useState("");
  const [qDocumentos, setQDocumentos] = useState("");
  const [clientes, setClientes] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingDocumentos, setLoadingDocumentos] = useState(false);
  const [error, setError] = useState("");
  const [openVerComprobante, setOpenVerComprobante] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState("");
  const [comprobanteMime, setComprobanteMime] = useState("application/pdf");
  const [comprobanteTitle, setComprobanteTitle] = useState("Comprobante");
  const mountedRef = useRef(true);
  const documentActions = useMemo(() => getDocumentActions(grupo), [grupo]);
  const gridCols = "1.15fr 0.85fr 1.65fr 0.95fr 0.95fr 0.8fr";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const totalDocumentos = useMemo(
    () => clientes.reduce((acc, cli) => acc + Number(cli?.total_documentos || 0), 0),
    [clientes]
  );

  const filteredDocumentos = useMemo(() => {
    const q = normalizeText(qDocumentos);
    if (!q) return documentos;

    return documentos.filter((doc) => {
      const texto = normalizeText([
        doc?.numero_visual,
        doc?.documento_label,
        doc?.tipo,
        doc?.detalle,
        doc?.cliente,
        doc?.razon_social,
        doc?.id_comprobante,
        doc?.id_movimiento,
        doc?.cbte_nro,
      ].join(" "));
      return texto.includes(q);
    });
  }, [documentos, qDocumentos]);

  const cargarClientes = useCallback(async () => {
    setLoadingClientes(true);
    setError("");

    try {
      const data = await apiGetJson(
        buildUrl(documentActions.clientes, {
          ...(documentActions.includeGrupo ? { grupo } : {}),
          q: qClientes,
          limit: CLIENTES_LIMIT,
          solo_con_documentos: 1,
        })
      );

      const rows = Array.isArray(data?.clientes) ? data.clientes : [];
      if (!mountedRef.current) return;

      setClientes(rows);
      setSelectedCliente((prev) => {
        if (prev && rows.some((cli) => Number(cli.id_cliente) === Number(prev.id_cliente))) return prev;
        return rows[0] || null;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setClientes([]);
      setSelectedCliente(null);
      setError(err?.message || "No se pudieron cargar los clientes.");
    } finally {
      if (mountedRef.current) setLoadingClientes(false);
    }
  }, [documentActions, grupo, qClientes]);

  const cargarDocumentos = useCallback(async () => {
    const idCliente = Number(selectedCliente?.id_cliente || 0);
    if (!idCliente) {
      setDocumentos([]);
      return;
    }

    setLoadingDocumentos(true);
    setError("");

    try {
      const data = await apiGetJson(
        buildUrl(documentActions.documentos, {
          ...(documentActions.includeGrupo ? { grupo } : {}),
          id_cliente: idCliente,
        })
      );
      const rows = Array.isArray(data?.documentos) ? data.documentos : [];
      if (!mountedRef.current) return;
      setDocumentos(rows);
    } catch (err) {
      if (!mountedRef.current) return;
      setDocumentos([]);
      setError(err?.message || "No se pudieron cargar los documentos del cliente.");
    } finally {
      if (mountedRef.current) setLoadingDocumentos(false);
    }
  }, [documentActions, grupo, selectedCliente]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      cargarClientes();
    }, 280);
    return () => window.clearTimeout(t);
  }, [cargarClientes]);

  useEffect(() => {
    cargarDocumentos();
  }, [cargarDocumentos]);

  const handleVerDocumento = async (doc) => {
    const id = Number(doc?.id_comprobante || 0);
    if (!id) {
      setError("Este documento no tiene comprobante asociado.");
      return;
    }

    try {
      setError("");
      const data = await apiGetJson(
        buildUrl("ventas_comprobantes_descargar", { id_comprobante: id })
      );
      const url = data?.url || data?.archivo_url || data?.download_url || "";
      if (!url) throw new Error("No se pudo obtener el enlace del PDF.");

      setComprobanteUrl(url);
      setComprobanteMime(safeText(doc?.archivo_mime, "application/pdf"));
      setComprobanteTitle(safeText(doc?.numero_visual || doc?.documento_label, "Comprobante"));
      setOpenVerComprobante(true);
    } catch (err) {
      setError(err?.message || "No se pudo abrir el comprobante.");
    }
  };

  const handleAbrirNuevaPestana = async (doc) => {
    const id = Number(doc?.id_comprobante || 0);
    if (!id) return;

    try {
      setError("");
      const data = await apiGetJson(
        buildUrl("ventas_comprobantes_descargar", { id_comprobante: id })
      );
      const url = data?.url || data?.archivo_url || data?.download_url || "";
      if (!url) throw new Error("No se pudo obtener el enlace del PDF.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.message || "No se pudo abrir el PDF en una nueva pestaña.");
    }
  };

  return (
    <div
      id={`doccom-${normalizeText(grupo) || "documentos"}-section`}
      className="doccom-subpage mov-page"
    >
      <section className="mov-card mov-card--table doccom-clientDocs">
        <div className="mov-card__head doccom-clientDocs__head">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">{titulo}</div>
              {navigationTabs}
            </div>
          </div>

          <div className="doccom-clientDocs__summary" aria-label="Resumen de documentos">
            <div>
              <strong>{clientes.length}</strong>
              <span>{clienteCounterLabel}</span>
            </div>
            <div>
              <strong>{totalDocumentos}</strong>
              <span>{totalCounterLabel}</span>
            </div>
            <div>
              <strong>{filteredDocumentos.length}</strong>
              <span>{visibleCounterLabel}</span>
            </div>
          </div>
        </div>

        {error ? <div className="doccom-alert">{error}</div> : null}

        <div className="doccom-clientDocs__layout">
          <aside className="doccom-clientList" aria-label="Clientes">
            <div className="cc-filter doccom-filter doccom-filter--clientes">
              <div className="cc-floatingField cc-floatingField--search is-active">
                <div className="cc-searchInput">
                  <div className="cc-searchInput__fieldWrap">
                    <input
                      className="cc-input cc-input--floating"
                      id={`doccom-clientes-${grupo}`}
                      type="text"
                      value={qClientes}
                      onChange={(e) => setQClientes(e.target.value)}
                      placeholder="Buscar cliente..."
                    />
                    <span className="cc-floatingLabel">
                      <FontAwesomeIcon icon={faMagnifyingGlass} /> Cliente
                    </span>
                    {qClientes.trim() !== "" && (
                      <button
                        type="button"
                        className="cc-clearSearch cc-clearSearch--inside"
                        title="Limpiar búsqueda"
                        onClick={() => setQClientes("")}
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="doccom-clientList__body">
              {loadingClientes ? (
                Array.from({ length: 7 }).map((_, idx) => (
                  <div className="doccom-clientSkeleton" key={idx} />
                ))
              ) : clientes.length ? (
                clientes.map((cliente) => {
                  const active = Number(selectedCliente?.id_cliente) === Number(cliente.id_cliente);
                  return (
                    <button
                      type="button"
                      key={cliente.id_cliente}
                      className={`doccom-clientItem ${active ? "is-active" : ""}`}
                      onClick={() => {
                        setSelectedCliente(cliente);
                        setQDocumentos("");
                      }}
                    >
                      <span className="doccom-clientItem__icon">
                        <FontAwesomeIcon icon={faUser} />
                      </span>
                      <span className="doccom-clientItem__main">
                        <strong>{getClienteDisplay(cliente)}</strong>
                        <small>{getClienteSubtext(cliente)}</small>
                      </span>
                      <span className="doccom-clientItem__count">
                        {Number(cliente.total_documentos || 0)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="doccom-emptyMini">
                  <FontAwesomeIcon icon={faUsers} />
                  <strong>No hay clientes para mostrar</strong>
                  <span>Cuando existan {documentoPlural} guardados, van a aparecer acá.</span>
                </div>
              )}
            </div>
          </aside>

          <main className="doccom-docPanel" aria-label="Documentos del cliente">
            {selectedCliente ? (
              <>
                <div className="doccom-docPanel__top">
                  <div>
                    <span>Cliente seleccionado</span>
                    <h3>{getClienteDisplay(selectedCliente)}</h3>
                    <p>{getClienteSubtext(selectedCliente)}</p>
                  </div>

                  <div className="cc-filter doccom-filter doccom-filter--docs">
                    <div className="cc-floatingField cc-floatingField--search is-active">
                      <div className="cc-searchInput">
                        <div className="cc-searchInput__fieldWrap">
                          <input
                            className="cc-input cc-input--floating"
                            id={`doccom-documentos-${grupo}`}
                            type="text"
                            value={qDocumentos}
                            onChange={(e) => setQDocumentos(e.target.value)}
                            placeholder={searchPlaceholder}
                          />
                          <span className="cc-floatingLabel">
                            <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                          </span>
                          {qDocumentos.trim() !== "" && (
                            <button
                              type="button"
                              className="cc-clearSearch cc-clearSearch--inside"
                              title="Limpiar búsqueda"
                              onClick={() => setQDocumentos("")}
                            >
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  id={`doccom-${normalizeText(grupo) || "documentos"}-tableWrap`}
                  className="doccom-docTableWrap"
                  role="rowgroup"
                >
                  <div
                    className="mov-gridTable mov-gridTable--head doccom-docGridHead"
                    style={{ gridTemplateColumns: gridCols }}
                    role="row"
                  >
                    <div className="mov-gridCell mov-gridCell--head" role="columnheader">
                      {documentoSingular.charAt(0).toUpperCase() + documentoSingular.slice(1)}
                    </div>
                    <div className="mov-gridCell mov-gridCell--head" role="columnheader">Fecha</div>
                    <div className="mov-gridCell mov-gridCell--head" role="columnheader">Detalle</div>
                    <div className="mov-gridCell mov-gridCell--head is-center" role="columnheader">Estado</div>
                    <div className="mov-gridCell mov-gridCell--head is-right" role="columnheader">Total</div>
                    <div className="mov-gridCell mov-gridCell--head is-center" role="columnheader">PDF</div>
                  </div>

                  <div className="mov-gridBody doccom-docGridBody">
                    {loadingDocumentos ? (
                      Array.from({ length: 6 }).map((_, idx) => (
                        <div
                          className="mov-gridTable mov-gridTable--row doccom-docGridRow"
                          style={{ gridTemplateColumns: gridCols }}
                          role="row"
                          key={idx}
                        >
                          {Array.from({ length: 6 }).map((__, cellIdx) => (
                            <div className="mov-gridCell" role="cell" key={cellIdx}>
                              <div className="doccom-rowSkeleton" />
                            </div>
                          ))}
                        </div>
                      ))
                    ) : filteredDocumentos.length ? (
                      filteredDocumentos.map((doc) => (
                        <div
                          key={`${doc.id_comprobante}-${doc.tipo}`}
                          className="mov-gridTable mov-gridTable--row doccom-docGridRow"
                          style={{ gridTemplateColumns: gridCols }}
                          role="row"
                        >
                          <div className="mov-gridCell is-strong" role="cell" data-label={documentoSingular.charAt(0).toUpperCase() + documentoSingular.slice(1)}>
                            <div className="doccom-docMain">
                              <span className="doccom-docMain__icon">
                                <FontAwesomeIcon icon={getDocumentoIcon(doc.tipo)} />
                              </span>
                              <span>
                                <button type="button" onClick={() => handleVerDocumento(doc)}>
                                  {safeText(doc.numero_visual || doc.documento_label)}
                                </button>
                                <small>ID comprobante #{doc.id_comprobante}</small>
                              </span>
                            </div>
                          </div>
                          <div className="mov-gridCell" role="cell" data-label="Fecha">
                            <span className="mov-ellipsissss">{formatFecha(doc.fecha_cbte || doc.fecha || doc.created_at)}</span>
                          </div>
                          <div className="mov-gridCell" role="cell" data-label="Detalle">
                            <span className="doccom-docDetalle">
                              <strong>{safeText(doc.documento_label)}</strong>
                              <small>{safeText(doc.detalle, "Sin detalle cargado")}</small>
                            </span>
                          </div>
                          <div className="mov-gridCell is-center" role="cell" data-label="Estado">
                            <span className={`doccom-status doccom-status--${String(doc.tipo || "doc").toLowerCase()}`}>
                              {getDocumentoEstado(doc)}
                            </span>
                          </div>
                          <div className="mov-gridCell is-right is-strong" role="cell" data-label="Total">
                            <span>{moneyARS(doc.monto_total)}</span>
                          </div>
                          <div className="mov-gridCell mov-gridCell--actions is-center" role="cell" data-label="PDF">
                            <div className="mov-actionsInline doccom-actions">
                              <button type="button" className="mov-iconBtn" title="Ver PDF" onClick={() => handleVerDocumento(doc)}>
                                <FontAwesomeIcon icon={faEye} />
                              </button>
                              <button type="button" className="mov-iconBtn" title="Abrir PDF" onClick={() => handleAbrirNuevaPestana(doc)}>
                                <FontAwesomeIcon icon={faDownload} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="cc-emptyState doccom-emptyMini doccom-emptyMini--table">
                        <FontAwesomeIcon icon={faFilePdf} className="cc-emptyIcon" />
                        <strong>{noDocsTitle}</strong>
                        <span>{noDocsText}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="doccom-emptyStateBig">
                <FontAwesomeIcon icon={faFilePdf} />
                <h3>{emptyTitle}</h3>
                <p>{emptyText}</p>
              </div>
            )}
          </main>
        </div>
      </section>

      <ModalVerComprobante
        open={openVerComprobante}
        url={comprobanteUrl}
        mime={comprobanteMime}
        title={comprobanteTitle}
        onClose={() => {
          setOpenVerComprobante(false);
          setComprobanteUrl("");
          setComprobanteMime("application/pdf");
          setComprobanteTitle("Comprobante");
        }}
      />
    </div>
  );
}
