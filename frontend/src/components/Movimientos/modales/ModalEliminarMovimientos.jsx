// src/components/Movimientos/modales/ModalEliminarMovimientos.jsx
import React, { useEffect, useRef, useCallback } from "react";
import { FaTrashAlt, FaTimes } from "react-icons/fa";
import "./ModalEliminarMovimientos.css";

export default function ModalEliminarMovimientos({
  open,
  row,
  loading = false,
  onClose,
  onConfirm,
  onToast, // ✅ nuevo: lo maneja el padre (Movimientos) para que NO desaparezca al cerrar modal
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

  useEffect(() => {
    if (!open) return;
    setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "Enter") {
        // Enter confirma, pero evitamos doble click si está loading
        if (!loading) handleConfirm();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cerrar, loading]);

  const idMov = row?.id_movimiento ?? "—";
  const tipo = row?.tipo ?? row?.tipo_movimiento ?? "—";
  const concepto = row?.concepto ?? row?.detalle ?? row?.descripcion ?? "—";
  const monto =
    row?.monto != null
      ? (() => {
          const n = Number(row.monto);
          if (!Number.isFinite(n)) return String(row.monto);
          try {
            return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
          } catch {
            return `$${n.toFixed(2)}`;
          }
        })()
      : "—";

  const handleConfirm = async () => {
    if (loading) return;

    // ✅ toast “cargando” largo, el padre puede reemplazar luego por éxito/error
    showToast("cargando", "Eliminando movimiento…", 12000);

    try {
      await onConfirm?.(); // el padre hace la API
      // Si el padre ya muestra toast de éxito, esto no molesta, pero podés dejarlo igual.
      showToast("exito", "Movimiento eliminado.", 2600);

      // OJO: cerrar el modal lo hace el padre en tu flujo (setOpenDel(false))
      // Si querés cerrarlo acá también, descomentá:
      // cerrar();
    } catch (e) {
      // ✅ si onConfirm llega a tirar error, lo mostramos
      showToast("error", e?.message || "No se pudo eliminar el movimiento.", 4200);
    }
  };

  if (!open) return null;

  return (
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
          Eliminar movimiento
        </h3>

        <p className="mvdel-body">
          ¿Seguro que querés eliminar este movimiento definitivamente?
          <br />
          Esta acción no se puede deshacer.
        </p>

        <div className="mvdel-card">
          <div className="mvdel-row">
            <span className="mvdel-label">ID Movimiento</span>
            <span className="mvdel-value">#{idMov}</span>
          </div>

          <div className="mvdel-row">
            <span className="mvdel-label">Tipo</span>
            <span className="mvdel-value">{tipo}</span>
          </div>

          <div className="mvdel-row">
            <span className="mvdel-label">Concepto</span>
            <span className="mvdel-value">{concepto}</span>
          </div>

          <div className="mvdel-row">
            <span className="mvdel-label">Monto</span>
            <span className="mvdel-value">{monto}</span>
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
            Cancelar
          </button>

          <button
            type="button"
            className="mvdel-btn mvdel-btn--solid-danger"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
