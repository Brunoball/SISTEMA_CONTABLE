import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config.jsx";
import ModalFacturaBaltoResumen from "../../Facturacion/ModalFacturaBaltoResumen.jsx";

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

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => {
      onToast?.(tipo, mensaje, duracion);
    },
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
      cargarContexto();
    }
  }, [open, cargarContexto]);

  const resumenData = useMemo(() => {
    if (!contexto) return null;

    return {
      id_pago: null,
      id_sistema: null,
      labelCliente: contexto?.cliente_nombre || "Cliente",
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
      emisor_nombre: safeStr(contexto?.config_facturacion?.razon_social),
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

  const handleEmitida = useCallback(
    async (factEmitida) => {
      if (!row?.id_movimiento || !contexto?.factura_original?.id_comprobante) {
        throw new Error("Faltan datos para registrar la nota de crédito.");
      }

      setLoading(true);
      setError("");

      try {
        showToast("cargando", "Registrando nota de crédito…", 12000);

        if (!factEmitida?.pdf_blob) {
          throw new Error(
            "La nota de crédito se emitió pero no se recibió el PDF para guardarla."
          );
        }

        const fd = new FormData();
        fd.append("tipo", "NOTA_CREDITO");
        fd.append("id_movimiento", String(row.id_movimiento));
        fd.append(
          "pdf",
          factEmitida.pdf_blob,
          factEmitida?.pdf_filename || `nota_credito_${row.id_movimiento}.pdf`
        );

        fd.append(
          "meta",
          JSON.stringify({
            tipo: "NOTA_CREDITO",
            id_movimiento: row.id_movimiento,
            id_comprobante_origen: contexto.factura_original.id_comprobante,
            cae: factEmitida?.cae ?? null,
            cae_vto: factEmitida?.cae_vto ?? null,
            cbte_nro: factEmitida?.cbte_nro ?? null,
            cbte_tipo: factEmitida?.cbte_tipo ?? resumenData?.cbte_tipo ?? 13,
            pto_vta: factEmitida?.pto_vta ?? resumenData?.pto_vta ?? 2,
            resultado: factEmitida?.resultado ?? null,
            doc_tipo:
              factEmitida?.doc_tipo ?? contexto?.cliente_facturacion?.doc_tipo ?? null,
            doc_nro:
              factEmitida?.doc_nro ??
              contexto?.cliente_facturacion?.doc_nro ??
              contexto?.cliente_facturacion?.cuit ??
              null,
            fecha_cbte: factEmitida?.fecha_cbte ?? todayISO(),
            motivo,
            factura_origen: contexto?.factura_original ?? null,
          })
        );

        const resUpload = await fetch(
          `${API}?action=comprobantes_vincular_movimiento`,
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

        showToast("exito", "Nota de crédito emitida y vinculada correctamente.", 3200);
        setOpenResumen(false);
        onDone?.();
      } catch (e) {
        setError(e.message || "Error registrando la nota de crédito.");
        showToast("error", e.message || "Error registrando la nota de crédito.", 4200);
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
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9998,
          padding: 16,
        }}
        onMouseDown={onClose}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 700,
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,.25)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "18px 20px",
              borderBottom: "1px solid #ececec",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ margin: 0, fontSize: 20 }}>Emitir nota de crédito</h3>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          <div style={{ padding: 20 }}>
            {loading && !contexto ? <p>Cargando contexto…</p> : null}

            {error ? (
              <div
                style={{
                  marginBottom: 12,
                  background: "#fff1f0",
                  border: "1px solid #ffa39e",
                  color: "#a8071a",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                {error}
              </div>
            ) : null}

            {contexto ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      border: "1px solid #ececec",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <b>Factura original</b>
                    <div style={{ marginTop: 8, fontSize: 14 }}>
                      Comprobante: #{contexto?.factura_original?.id_comprobante || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      Tipo: {contexto?.factura_original?.cbte_tipo || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      Punto de venta: {contexto?.factura_original?.pto_vta || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      Número: {contexto?.factura_original?.cbte_nro || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      CAE: {contexto?.factura_original?.cae || "—"}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #ececec",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <b>Cliente fiscal</b>
                    <div style={{ marginTop: 8, fontSize: 14 }}>
                      {contexto?.cliente_facturacion?.razon_social || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      Doc: {contexto?.cliente_facturacion?.doc_tipo || "—"} /{" "}
                      {contexto?.cliente_facturacion?.doc_nro || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      CUIT: {contexto?.cliente_facturacion?.cuit || "—"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 14 }}>
                      IVA: {contexto?.cliente_facturacion?.condicion_iva || "—"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #ececec",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    Nota de crédito a emitir
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    Tipo NC: {contexto?.nota_credito?.cbte_tipo || "—"}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    Punto de venta: {contexto?.nota_credito?.pto_vta || "—"}
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>
                    Total: ${Number(contexto?.total || 0).toLocaleString("es-AR")}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label
                    htmlFor="motivo-nc-venta"
                    style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
                  >
                    Motivo
                  </label>
                  <textarea
                    id="motivo-nc-venta"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      border: "1px solid #d9d9d9",
                      borderRadius: 10,
                      padding: 12,
                      resize: "vertical",
                    }}
                    disabled={loading}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div
            style={{
              padding: 20,
              borderTop: "1px solid #ececec",
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                border: "1px solid #d9d9d9",
                background: "#fff",
                padding: "10px 16px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => setOpenResumen(true)}
              disabled={loading || !contexto}
              style={{
                border: "none",
                background: "#1677ff",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Continuar emisión
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
          onFacturada={async (fact) => await handleEmitida(fact)}
          onDone={async (fact) => await handleEmitida(fact)}
          forceTestAmount={false}
          testAmount={null}
          skipMovimientoAutocreacion={true}
        />
      )}
    </>,
    document.body
  );
}