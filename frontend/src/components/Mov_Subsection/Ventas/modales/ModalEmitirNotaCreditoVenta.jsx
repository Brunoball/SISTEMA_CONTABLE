import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config.jsx";
import ModalFacturaBaltoResumen from "../../Facturacion/ModalFacturaBaltoResumen.jsx";
import { saveNotaCreditoPdf } from "../../../../utils/NotaCreditoPdfBuilder.js";
import "../../../Global/Global_css/roots.css";
import { DEMO_BLOCK_MESSAGE, isBaltoDemoMode } from "../../../../utils/demoMode";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function getAuthInfo() {
  const token = (localStorage.getItem("token") || "").trim();
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    ""
  ).trim();
  return { token, sessionKey };
}

function buildHeadersGET() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildHeadersPOSTJson() {
  const { token, sessionKey } = getAuthInfo();
  const h = { "Content-Type": "application/json" };
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function buildHeadersPOSTForm() {
  const { token, sessionKey } = getAuthInfo();
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text);
  }

  if (!data?.exito) {
    throw new Error(data?.mensaje || "Error en la operación.");
  }

  return data;
}

function extractFacturaPayload(factEmitida) {
  if (!factEmitida) return null;
  if (factEmitida.factura) return factEmitida.factura;
  if (factEmitida.data?.factura) return factEmitida.data.factura;
  if (factEmitida.data) return factEmitida.data;
  return factEmitida;
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

export default function ModalEmitirNotaCreditoVenta({
  open,
  row,
  onClose,
  onToast,
  onDone,
}) {
  const API = `${BASE_URL}/api.php`;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("Anulación de venta");
  const [contexto, setContexto] = useState(null);
  const [openResumen, setOpenResumen] = useState(false);
  const [dark, setDark] = useState(isTemaOscuro);

  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const o2 = new MutationObserver(update);
    if (document.body) {
      o2.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => {
      o1.disconnect();
      o2.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

useEffect(() => {
  if (!open) return;

  const h = (e) => {
    if (e.key !== "Escape") return;

    // Si está abierto el modal de resumen, este modal de atrás NO debe cerrarse.
    if (openResumen) return;

    e.preventDefault();
    e.stopPropagation();

    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }

    if (!loading) {
      onClose?.();
    }
  };

  document.addEventListener("keydown", h, true);

  return () => {
    document.removeEventListener("keydown", h, true);
  };
}, [open, openResumen, loading, onClose]);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const cargarContexto = useCallback(async () => {
    if (!row?.id_movimiento) return;

    setLoading(true);
    setError("");

    try {
      const sp = new URLSearchParams();
      sp.set("action", "ventas_nota_credito_contexto");
      sp.set("id_movimiento", String(row.id_movimiento));

      const res = await fetch(`${API}?${sp.toString()}`, {
        method: "GET",
        headers: buildHeadersGET(),
      });

      const data = await parseJsonOrThrow(res);
      setContexto(data.contexto || null);
    } catch (e) {
      setError(e.message || "No se pudo cargar el contexto de nota de crédito.");
    } finally {
      setLoading(false);
    }
  }, [API, row]);

  useEffect(() => {
    if (open) {
      setContexto(null);
      setError("");
      setOpenResumen(false);
      setMotivo("Anulación de venta");
      cargarContexto();
    }
  }, [open, cargarContexto]);

  const resumenData = useMemo(() => {
    if (!contexto) return null;

    return {
      id_pago: null,
      id_sistema: null,
      id_movimiento: contexto?.id_movimiento || null,
      labelCliente:
        contexto?.cliente_facturacion?.razon_social ||
        contexto?.cliente_nombre ||
        "Cliente",
      labelSistema: `Nota de crédito de venta #${contexto?.id_movimiento || ""}`,
      cliente_facturacion: contexto?.cliente_facturacion || {},
      id_cliente: contexto?.id_cliente || null,
      id_tipo_venta: contexto?.id_tipo_venta || null,
      id_medio_pago: contexto?.id_medio_pago || null,
      id_clasificacion: null,
      fecha_cbte_iso: todayISO(),
      vto_pago_iso: todayISO(),
      cbte_tipo: Number(contexto?.nota_credito?.cbte_tipo || 13),
      pto_vta: Number(contexto?.nota_credito?.pto_vta || 2),
      items_facturacion: Array.isArray(contexto?.items_facturacion)
        ? contexto.items_facturacion
        : [],
      total_ars: Number(contexto?.total || 0),
      monto: Number(contexto?.total || 0),
      importe: Number(contexto?.total || 0),
      observaciones: motivo,
      concepto: 1,
      config_facturacion: contexto?.config_facturacion || {},
      id_config_facturacion:
        contexto?.config_facturacion?.id_config_facturacion ||
        contexto?.config_facturacion?.idConfigFacturacion ||
        null,
      idConfigFacturacion:
        contexto?.config_facturacion?.idConfigFacturacion ||
        contexto?.config_facturacion?.id_config_facturacion ||
        null,
      emisor: contexto?.config_facturacion || null,
      cbtes_asoc: Array.isArray(contexto?.cbtes_asoc) ? contexto.cbtes_asoc : [],
      factura_original: contexto?.factura_original || null,
      emisor_nombre: safeStr(
        contexto?.config_facturacion?.razon_social ||
        contexto?.config_facturacion?.nombre_fantasia ||
        contexto?.config_facturacion?.emisor_nombre
      ),
      emisor_domicilio: safeStr(contexto?.config_facturacion?.domicilio_comercial),
      cuit_emisor: safeStr(contexto?.config_facturacion?.cuit),
      cond_iva_emisor: safeStr(contexto?.config_facturacion?.condicion_iva),
      ingresos_brutos_emisor: safeStr(contexto?.config_facturacion?.ingresos_brutos),
      fecha_inicio_actividades_emisor: safeStr(
        contexto?.config_facturacion?.fecha_inicio_actividades
      ),
      logo_url: safeStr(contexto?.config_facturacion?.logo_url),
    };
  }, [contexto, motivo]);

  const configsFacturacionNCIniciales = useMemo(
    () => (contexto?.config_facturacion ? [contexto.config_facturacion] : []),
    [contexto]
  );

  const handleEmitida = useCallback(
    async (factEmitida) => {
      if (!row?.id_movimiento || !contexto?.factura_original?.id_comprobante) {
        throw new Error("Faltan datos para registrar la nota de crédito.");
      }

      setLoading(true);
      setError("");

      try {
        const payload = extractFacturaPayload(factEmitida);
        if (!payload) {
          throw new Error("No se recibió la respuesta de emisión de ARCA.");
        }

        if (!payload?.cae || String(payload?.resultado || "").toUpperCase() !== "A") {
          throw new Error(
            "La nota de crédito no fue autorizada por ARCA. No se generó el PDF ni se registró."
          );
        }

        showToast("cargando", "Registrando nota de crédito…", 12000);

        let pdfBlob =
          factEmitida?.pdf_blob instanceof Blob ? factEmitida.pdf_blob : null;

        let pdfFilename =
          safeStr(factEmitida?.pdf_filename) ||
          `nota_credito_${row.id_movimiento}.pdf`;

        if (!pdfBlob) {
          const pdfData = {
            ...resumenData,
            cae: payload?.cae ?? null,
            cae_vto: payload?.cae_vto ?? null,
            cbte_nro: payload?.cbte_nro ?? null,
            cbte_tipo: payload?.cbte_tipo ?? resumenData?.cbte_tipo ?? 13,
            pto_vta: payload?.pto_vta ?? resumenData?.pto_vta ?? 2,
            resultado: payload?.resultado ?? null,
            fecha_cbte: payload?.fecha_cbte ?? todayISO(),
            fecha_cbte_iso: payload?.fecha_cbte ?? todayISO(),
            doc_tipo: payload?.doc_tipo ?? contexto?.cliente_facturacion?.doc_tipo ?? null,
            doc_nro:
              payload?.doc_nro ??
              contexto?.cliente_facturacion?.doc_nro ??
              contexto?.cliente_facturacion?.cuit ??
              null,
            qr_url: payload?.qr_url ?? null,
            qr_base64: payload?.qr_base64 ?? null,
            qr_payload: payload?.qr_payload ?? null,
            observaciones: motivo,
          };

          const out = await saveNotaCreditoPdf(pdfData, {
            autoDownload: false,
          });

          pdfBlob = out?.pdfBlob instanceof Blob ? out.pdfBlob : null;
          pdfFilename = out?.pdfFilename || pdfFilename;
        }

        if (!pdfBlob) {
          throw new Error("No se pudo obtener el PDF de la nota de crédito.");
        }

        const fd = new FormData();
        fd.append("tipo", "NOTA_CREDITO");
        fd.append("id_movimiento", String(row.id_movimiento));
        fd.append("pdf", pdfBlob, pdfFilename);
        fd.append(
          "meta",
          JSON.stringify({
            tipo: "NOTA_CREDITO",
            id_movimiento: row.id_movimiento,
            id_comprobante_origen: contexto.factura_original.id_comprobante,
            cae: payload?.cae ?? null,
            cae_vto: payload?.cae_vto ?? null,
            cbte_nro: payload?.cbte_nro ?? null,
            cbte_tipo: payload?.cbte_tipo ?? resumenData?.cbte_tipo ?? 13,
            pto_vta: payload?.pto_vta ?? resumenData?.pto_vta ?? 2,
            resultado: payload?.resultado ?? null,
            doc_tipo: payload?.doc_tipo ?? contexto?.cliente_facturacion?.doc_tipo ?? null,
            doc_nro:
              payload?.doc_nro ??
              contexto?.cliente_facturacion?.doc_nro ??
              contexto?.cliente_facturacion?.cuit ??
              null,
            fecha_cbte: payload?.fecha_cbte ?? todayISO(),
            motivo,
            cbtes_asoc: resumenData?.cbtes_asoc ?? [],
            factura_origen: contexto?.factura_original ?? null,
          })
        );

        const resUpload = await fetch(
          `${API}?action=ventas_comprobantes_vincular_movimiento`,
          {
            method: "POST",
            headers: buildHeadersPOSTForm(),
            body: fd,
          }
        );

        const uploadData = await parseJsonOrThrow(resUpload);
        const idComprobanteNC = Number(uploadData?.id_comprobante || 0);

        if (!idComprobanteNC) {
          throw new Error(
            "No se pudo obtener el id_comprobante de la nota de crédito registrada."
          );
        }

        const resRel = await fetch(`${API}?action=ventas_nota_credito_vincular`, {
          method: "POST",
          headers: buildHeadersPOSTJson(),
          body: JSON.stringify({
            id_movimiento: row.id_movimiento,
            id_comprobante_original: contexto.factura_original.id_comprobante,
            id_comprobante_nota_credito: idComprobanteNC,
            observacion: motivo,
          }),
        });

        await parseJsonOrThrow(resRel);

        showToast(
          "exito",
          "Nota de crédito emitida, descargada y vinculada correctamente.",
          3600
        );

        setOpenResumen(false);
        onDone?.();
      } catch (e) {
        setError(e.message || "Error registrando la nota de crédito.");
        showToast(
          "error",
          e.message || "Error registrando la nota de crédito.",
          4200
        );
      } finally {
        setLoading(false);
      }
    },
    [API, contexto, motivo, onDone, row, resumenData, showToast]
  );

  if (!open) return null;

  return createPortal(
    <>
      <div
        className={[
          "mi-modal__overlay",
          dark ? "mi-modal__overlay--dark" : "",
        ]
          .join(" ")
          .trim()}
      >
        <div
          className={[
            "mi-modal__container",
            "modal-nc-container",
            dark ? "mi-modal--dark" : "",
          ]
            .join(" ")
            .trim()}
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="12" y2="17" />
              </svg>
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">Emitir nota de crédito</h2>
              {row?.id_movimiento && (
                <p className="mi-modal__subtitle">Movimiento #{row.id_movimiento}</p>
              )}
            </div>

            <button
              type="button"
              className="mi-modal__close"
              onClick={onClose}
              disabled={loading}
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="mi-modal__content modal-nc-body">
            {loading && !contexto && (
              <div className="modal-nc-loading">
                <span className="modal-nc-loading__dot" />
                Cargando contexto…
              </div>
            )}

            {error && <div className="modal-nc-error">{error}</div>}

            {contexto && (
              <>
                <div className="modal-nc-grid">
                  <div className="modal-nc-card modal-nc-cds">
                    <b>Factura original</b>

                    <div className="modal-nc-card__row">
                      <span>Comprobante</span>
                      <strong>#{contexto?.factura_original?.id_comprobante || "—"}</strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>Tipo</span>
                      <strong>{contexto?.factura_original?.cbte_tipo || "—"}</strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>Punto de venta</span>
                      <strong>{contexto?.factura_original?.pto_vta || "—"}</strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>Número</span>
                      <strong>{contexto?.factura_original?.cbte_nro || "—"}</strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>CAE</span>
                      <strong className="modal-nc-card__cae">
                        {contexto?.factura_original?.cae || "—"}
                      </strong>
                    </div>
                  </div>

                  <div className="modal-nc-card modal-nc-cds">
                    <b>Cliente fiscal</b>

                    <div className="modal-nc-card__row modal-nc-card__row--full">
                      <span>Razón social</span>
                      <strong>{contexto?.cliente_facturacion?.razon_social || "—"}</strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>Doc.</span>
                      <strong>
                        {contexto?.cliente_facturacion?.doc_tipo || "—"} /{" "}
                        {contexto?.cliente_facturacion?.doc_nro || "—"}
                      </strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>CUIT</span>
                      <strong>{contexto?.cliente_facturacion?.cuit || "—"}</strong>
                    </div>

                    <div className="modal-nc-card__row">
                      <span>IVA</span>
                      <strong>
                        {contexto?.cliente_facturacion?.condicion_iva ||
                          contexto?.cliente_facturacion?.cond_iva ||
                          "—"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="modal-nc-summary">
                  <div className="modal-nc-summary__title">Nota de crédito a emitir</div>

                  <div className="modal-nc-summary__rows">
                    <div className="modal-nc-summary__row">
                      <span>Tipo NC</span>
                      <b>{contexto?.nota_credito?.cbte_tipo || "—"}</b>
                    </div>

                    <div className="modal-nc-summary__row">
                      <span>Punto de venta</span>
                      <b>{contexto?.nota_credito?.pto_vta || "—"}</b>
                    </div>

                    <div className="modal-nc-summary__row modal-nc-summary__row--total">
                      <span>Total</span>
                      <b>${Number(contexto?.total || 0).toLocaleString("es-AR")}</b>
                    </div>
                  </div>
                </div>

                <div className="fl-field">
                  <textarea
                    id="motivo-nc-venta"
                    className="fl-input modal-nc-textarea"
                    placeholder=" "
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    disabled={loading}
                  />
                  <label className="fl-label" htmlFor="motivo-nc-venta">
                    Motivo
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="mit-actions">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={() => {
                if (isBaltoDemoMode()) {
                  showToast("advertencia", DEMO_BLOCK_MESSAGE, 5200);
                  return;
                }
                setOpenResumen(true);
              }}
              disabled={loading || !contexto}
            >
              {loading ? "Procesando…" : "Continuar emisión"}
            </button>
          </div>
        </div>
      </div>

      {openResumen && resumenData && (
        <ModalFacturaBaltoResumen
          open={openResumen}
          onClose={() => setOpenResumen(false)}
          onBack={() => setOpenResumen(false)}
          onCloseAll={() => setOpenResumen(false)}
          apiBase={`${BASE_URL}/api.php`}
          action="movimientos"
          data={resumenData}
          docTipo={Number(resumenData?.cliente_facturacion?.doc_tipo || 80)}
          docNro={safeStr(
            resumenData?.cliente_facturacion?.doc_nro ||
              resumenData?.cliente_facturacion?.cuit
          )}
          cbteTipo={Number(resumenData?.cbte_tipo || 13)}
          ptoVta={String(resumenData?.pto_vta || 2)}
          onDone={async (fact) => await handleEmitida(fact)}
          forceTestAmount={false}
          testAmount={null}
          skipMovimientoAutocreacion={true}
          pdfMode="nota_credito"
          configsFacturacionInicial={configsFacturacionNCIniciales}
        />
      )}
    </>,
    document.body
  );
}
