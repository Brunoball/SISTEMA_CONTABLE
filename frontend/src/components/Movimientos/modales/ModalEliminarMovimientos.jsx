// src/components/Movimientos/modales/ModalEliminarMovimientos.jsx
import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { FaTrashAlt, FaTimes } from "react-icons/fa";
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
    row.monto_total, // ✅ principal en tu tabla
    row.total,       // items / backend alternativo
    row.total_item,  // items alternativo
    row.subtotal,    // por si viene subtotal
    row.monto,       // compat viejo
  ];

  for (const c of candidates) {
    if (c === null || c === undefined || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
    // si viene como string raro pero no convertible, igual lo devolvemos como "texto"
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

    showToast("cargando", "Eliminando movimiento…", 12000);

    try {
      await onConfirm?.(); // el padre hace la API
      showToast("exito", "Movimiento eliminado.", 2600);
      // El cierre lo maneja el padre (como lo tenés ahora)
    } catch (e) {
      showToast("error", e?.message || "No se pudo eliminar el movimiento.", 4200);
    }
  }, [loading, onConfirm, showToast]);

  useEffect(() => {
    if (!open) return;

    setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "Enter") {
        if (!loading) handleConfirm();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, cerrar, loading, handleConfirm]);

  const view = useMemo(() => {
    const idMov = row?.id_movimiento ?? "—";

    // ✅ tipo: priorizamos los campos reales
    const tipo = safeText(row?.tipo_movimiento ?? row?.tipo_venta ?? row?.tipo ?? "");

    // ✅ concepto: en tu sistema es "detalle" muchas veces
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
        : safeText(montoRaw); // si vino texto no convertible

    return { idMov, tipo, concepto, monto };
  }, [row]);

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
