import React from "react";
import { createPortal } from "react-dom";

export default function ModalEliminarVenta({
  open,
  row,
  loading = false,
  onClose,
  onConfirm,
  onEmitNotaCredito,
}) {
  if (!open) return null;

  const requiereNC =
    Number(row?.factura_emitida_en_arca || 0) === 1 &&
    Number(row?.factura_tiene_nota_credito || 0) !== 1;

  const yaTieneNC =
    Number(row?.factura_emitida_en_arca || 0) === 1 &&
    Number(row?.factura_tiene_nota_credito || 0) === 1;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 540,
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
          <h3 style={{ margin: 0, fontSize: 20 }}>Eliminar venta</h3>
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
          {requiereNC ? (
            <>
              <p style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
                Este registro tiene asociado una <b>factura emitida en ARCA</b>.
              </p>
              <p style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
                Antes de eliminar se necesita crear una <b>nota de crédito</b>.
              </p>
              <div
                style={{
                  background: "#fff7e6",
                  border: "1px solid #ffd591",
                  color: "#8a5a00",
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                }}
              >
                Venta #{row?.id_movimiento ?? "—"} · Cliente: {row?.cliente || "—"}
              </div>
            </>
          ) : yaTieneNC ? (
            <>
              <p style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
                Esta venta tiene una <b>factura ARCA</b> y ya posee una{" "}
                <b>nota de crédito asociada</b>.
              </p>
              <p style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
                Ahora sí podés eliminar el registro.
              </p>
            </>
          ) : (
            <p style={{ marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
              ¿Seguro que querés eliminar esta venta?
            </p>
          )}
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

          {requiereNC ? (
            <button
              type="button"
              onClick={onEmitNotaCredito}
              disabled={loading}
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
              Emitir nota de crédito
            </button>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              style={{
                border: "none",
                background: "#d9363e",
                color: "#fff",
                padding: "10px 16px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {loading ? "Eliminando..." : "Eliminar"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}