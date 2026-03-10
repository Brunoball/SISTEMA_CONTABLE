import React from "react";
import { createPortal } from "react-dom";
import "../../Global/Global_css/Global_Modals.css";
import "../../Global/Global_css/Global_oscuro.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faTrashCan } from "@fortawesome/free-solid-svg-icons";

export default function ModalEliminarCobroCC({
  open,
  loading = false,
  title = "Eliminar cobro",
  subtitle = "",
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 520, width: "92%" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          disabled={loading}
          aria-label="Cerrar"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>

        <div className="modal-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FontAwesomeIcon icon={faTrashCan} />
            {title}
          </h2>
        </div>

        <div className="modal-body">
          <p style={{ marginTop: 0 }}>
            ¿Seguro que querés eliminar este registro de cobro?
          </p>

          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: 14,
              marginTop: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              Esta acción:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>elimina únicamente el registro de la tabla <b>cobros</b></li>
              <li>no elimina el movimiento original</li>
              <li>actualiza la cuenta corriente al recargar</li>
            </ul>
          </div>

          {subtitle ? (
            <div
              style={{
                marginTop: 14,
                fontSize: 14,
                opacity: 0.9,
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div
          className="modal-footer"
          style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}
        >
          <button
            type="button"
            className="btn-cancelar"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="btn-eliminar"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar cobro"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}