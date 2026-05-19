import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../../../Global/Global_css/roots.css";

export default function ModalNuevaDescripcion({ open, onClose, onSave, dark }) {
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setNombre("");
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key !== "Escape") return;

      // Este modal puede abrirse encima de otro modal (por ejemplo, Nuevo ingreso).
      // Capturamos el Escape acá para cerrar solo la Nueva descripción y evitar
      // que el modal padre también reciba el mismo evento y se cierre.
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }

      if (!saving) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [open, saving, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const nombreTrimmed = nombre.trim().toUpperCase();
    if (!nombreTrimmed) {
      return;
    }

    setSaving(true);
    
    try {
      const result = await onSave(nombreTrimmed);
      if (result !== false) {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!saving) {
      onClose();
    }
  };

  const handleNombreChange = (e) => {
    setNombre(e.target.value.toUpperCase());
  };

  if (!open) return null;

  return createPortal(
    <div
      className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}
      onMouseDown={handleCancel}
    >
      <div
        className={[
          "mi-modal__container",
          "mi-modal__container--small",
          dark ? "mi-modal--dark" : "",
        ].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: "450px" }}
      >
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Nueva descripción</h2>
          </div>
          <button
            className="mi-modal__close"
            onClick={handleCancel}
            aria-label="Cerrar"
            disabled={saving}
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mi-modal__content" style={{ padding: "20px" }}>
            <div className="fl-field" style={{ marginBottom: 0 }}>
              <input
                ref={inputRef}
                id="nueva-descripcion-input"
                className="fl-input"
                type="text"
                placeholder=" "
                value={nombre}
                onChange={handleNombreChange}
                disabled={saving}
                autoComplete="off"
                style={{ textTransform: "uppercase" }}
              />
              <label className="fl-label" htmlFor="nueva-descripcion-input">
                Nombre de la descripción
              </label>
            </div>
          </div>

          <div className="mi-modal__footer" style={{ padding: "16px 20px", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="mit-btn mit-btn--ghost"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !nombre.trim()}
              className="mit-btn mit-btn--solid"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
