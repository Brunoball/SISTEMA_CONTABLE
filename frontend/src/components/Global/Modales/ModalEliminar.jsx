import React, { useEffect, useRef, useCallback, useMemo } from "react";
import { FaTrashAlt, FaTimes } from "react-icons/fa";
import { createPortal } from "react-dom";
import "./ModalEliminar.css";

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

  title = "Eliminar movimiento",
  message = "¿Seguro que querés eliminar este movimiento definitivamente?",
  warning = "Esta acción no se puede deshacer.",
  loadingMessage = "Eliminando movimiento…",
  successMessage = "Movimiento eliminado.",
  errorMessage = "No se pudo eliminar el movimiento.",
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",

  // ✅ NUEVAS PROPS OPCIONALES
  secondaryActionLabel = "",
  onSecondaryAction = null,
  secondaryActionDisabled = false,
  confirmDisabled = false,
  confirmVariant = "danger", // "danger" | "primary"
  details = null, // array opcional [{ label, value }]
  extraContent = null, // nodo React opcional
  hideDefaultCard = false,
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
    if (loading || confirmDisabled) return;

    if (!onConfirm) return;

    showToast("cargando", loadingMessage, 12000);

    try {
      await onConfirm();
      showToast("exito", successMessage, 2600);
    } catch (e) {
      showToast("error", e?.message || errorMessage, 4200);
    }
  }, [
    loading,
    confirmDisabled,
    onConfirm,
    showToast,
    loadingMessage,
    successMessage,
    errorMessage,
  ]);

  const handleSecondaryAction = useCallback(async () => {
    if (loading || secondaryActionDisabled) return;
    await onSecondaryAction?.();
  }, [loading, secondaryActionDisabled, onSecondaryAction]);

  useEffect(() => {
    if (!open) return;

    setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") cerrar();

      if (e.key === "Enter" && !loading && !confirmDisabled && onConfirm) {
        handleConfirm();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, cerrar, loading, confirmDisabled, onConfirm, handleConfirm]);

  const view = useMemo(() => {
    const idMov = row?.id_movimiento ?? row?.idMovimiento ?? row?.id ?? "—";

    const tipo = safeText(
      row?.tipo_movimiento ??
        row?.tipo_venta ??
        row?.pago_tipo_venta ??
        row?.tipo ??
        ""
    );

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

  const resolvedDetails = useMemo(() => {
    if (Array.isArray(details) && details.length > 0) {
      return details.map((item, idx) => ({
        key: `${idx}-${item?.label ?? "item"}`,
        label: safeText(item?.label),
        value: safeText(item?.value),
      }));
    }

    return [
      { key: "id", label: "ID Movimiento", value: `#${view.idMov}` },
      { key: "tipo", label: "Tipo", value: view.tipo },
      { key: "concepto", label: "Concepto", value: view.concepto },
      { key: "monto", label: "Monto", value: view.monto },
    ];
  }, [details, view]);

  const confirmClass =
    confirmVariant === "primary"
      ? "mvdel-btn mvdel-btn--solid-primary"
      : "mvdel-btn mvdel-btn--solid-danger";

  if (!open) return null;

  return createPortal(
    <div
      className="mvdel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-eliminar-mov-title"
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
          {warning ? (
            <>
              <br />
              {warning}
            </>
          ) : null}
        </p>

        {!hideDefaultCard && (
          <div className="mvdel-card">
            {resolvedDetails.map((item) => (
              <div className="mvdel-row" key={item.key}>
                <span className="mvdel-label">{item.label}</span>
                <span className="mvdel-value">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {extraContent ? <div className="mvdel-extraContent">{extraContent}</div> : null}

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

          {secondaryActionLabel && typeof onSecondaryAction === "function" ? (
            <button
              type="button"
              className="mvdel-btn mvdel-btn--solid-primary"
              onClick={handleSecondaryAction}
              disabled={loading || secondaryActionDisabled}
            >
              {secondaryActionLabel}
            </button>
          ) : null}

          {typeof onConfirm === "function" ? (
            <button
              type="button"
              className={confirmClass}
              onClick={handleConfirm}
              disabled={loading || confirmDisabled}
            >
              {loading ? "Eliminando..." : confirmLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}