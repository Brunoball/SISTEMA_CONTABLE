import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { FaTrashAlt, FaTimes } from "react-icons/fa";
import { createPortal } from "react-dom";
import "./ModalEliminarMovimientos.css";

function moneyARS(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return String(v ?? "—");
  try {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

// ✅ toma el TOTAL real del movimiento (prioridad: monto_total)
function getMontoTotal(row) {
  if (!row || typeof row !== "object") return null;

  const candidates = [
    row.monto_total,
    row.total,
    row.total_item,
    row.subtotal,
    row.monto,
  ];

  for (const c of candidates) {
    if (c === null || c === undefined || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
    return c;
  }

  return null;
}

export default function ModalEliminarMovimientos({
  open,
  row,
  loading = false,
  onClose,
  onConfirm,
  onToast,

  // ✅ textos configurables
  title = "Eliminar movimiento",
  message = "¿Seguro que querés eliminar este movimiento definitivamente?",
  warning = "Esta acción no se puede deshacer.",
  loadingMessage = "Eliminando movimiento…",
  successMessage = "Movimiento eliminado.",
  errorMessage = "No se pudo eliminar el movimiento.",
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
}) {
  const cancelRef = useRef(null);

  const showToast = useCallback(
    (tipo, mensaje, duracion = 2800) => onToast?.(tipo, mensaje, duracion),
    [onToast]
  );

  const cerrar = useCallback(() => {
    if (loading) return;
    onClose?.();
  }, [loading, onClose]);

  const handleConfirm = useCallback(async () => {
    if (loading) return;

    showToast("cargando", loadingMessage, 12000);

    try {
      await onConfirm?.();
      showToast("exito", successMessage, 2600);
      // El cierre lo maneja el padre
    } catch (e) {
      showToast("error", e?.message || errorMessage, 4200);
    }
  }, [loading, onConfirm, showToast, loadingMessage, successMessage, errorMessage]);

  useEffect(() => {
    if (!open) return;

    setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "Enter" && !loading) handleConfirm();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, cerrar, loading, handleConfirm]);

  const view = useMemo(() => {
    const idMov = row?.id_movimiento ?? "—";

    const tipo = safeText(row?.tipo_movimiento ?? row?.tipo_venta ?? row?.tipo ?? "");

    const concepto = safeText(
      row?.detalle ??
        row?.concepto ??
        row?.descripcion ??
        row?.observacion ??
        ""
    );

    const montoRaw = getMontoTotal(row);

    const monto =
      montoRaw === null
        ? "—"
        : typeof montoRaw === "number"
        ? moneyARS(montoRaw)
        : safeText(montoRaw);

    return { idMov, tipo, concepto, monto };
  }, [row]);

  if (!open) return null;

  return createPortal(
    <div
      className="mvdel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-eliminar-mov-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div className="mvdel-modal mvdel-modal--danger">
        <button
          className="mvdel-close"
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          disabled={loading}
        >
          <FaTimes />
        </button>

        <div className="mvdel-icon mvdel-icon--danger" aria-hidden="true">
          <FaTrashAlt />
        </div>

        <h3 id="modal-eliminar-mov-title" className="mvdel-title mvdel-title--danger">
          {title}
        </h3>

        <p className="mvdel-body">
          {message}
          <br />
          {warning}
        </p>

        <div className="mvdel-card">
          <div className="mvdel-row">
            <span className="mvdel-label">ID Movimiento</span>
            <span className="mvdel-value">#{view.idMov}</span>
          </div>

          <div className="mvdel-row">
            <span className="mvdel-label">Tipo</span>
            <span className="mvdel-value">{view.tipo}</span>
          </div>

          <div className="mvdel-row">
            <span className="mvdel-label">Concepto</span>
            <span className="mvdel-value">{view.concepto}</span>
          </div>

          <div className="mvdel-row">
            <span className="mvdel-label">Monto</span>
            <span className="mvdel-value">{view.monto}</span>
          </div>
        </div>

        <div className="mvdel-actions">
          <button
            ref={cancelRef}
            type="button"
            className="mvdel-btn mvdel-btn--ghost"
            onClick={cerrar}
            disabled={loading}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            className="mvdel-btn mvdel-btn--solid-danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}