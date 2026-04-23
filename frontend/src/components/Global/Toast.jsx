import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faTimesCircle,
  faSpinner,
  faInfoCircle,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import "./Toast.css";

const TIPOS_CON_CIERRE_MANUAL = ["error", "advertencia"];

const Toast = ({ tipo, mensaje, onClose, duracion = 2500 }) => {
  const [desapareciendo, setDesapareciendo] = useState(false);
  const esManual = TIPOS_CON_CIERRE_MANUAL.includes(tipo);

  useEffect(() => {
    if (esManual) return; // error y advertencia no se cierran solos

    const d = Number(duracion) || 2500;

    const mostrarTimer = setTimeout(() => {
      setDesapareciendo(true);
    }, Math.max(0, d - 500));

    const ocultarTimer = setTimeout(() => {
      onClose?.();
    }, d);

    return () => {
      clearTimeout(mostrarTimer);
      clearTimeout(ocultarTimer);
    };
  }, [onClose, duracion, esManual]);

  const iconos = {
    exito: faCheckCircle,
    error: faTimesCircle,
    advertencia: faExclamationTriangle,
    cargando: faSpinner,
  };

  const clasesTipo = {
    exito: "toast-exito",
    error: "toast-error",
    advertencia: "toast-advertencia",
    cargando: "toast-cargando",
  };

  const iconoSeleccionado = iconos[tipo] || faInfoCircle;
  const claseSeleccionada = clasesTipo[tipo] || "toast-info";

  return createPortal(
    <div
      className={`toast-container ${claseSeleccionada} ${
        desapareciendo ? "desaparecer" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <FontAwesomeIcon
        icon={iconoSeleccionado}
        className={`toast-icon ${tipo === "cargando" ? "spin" : ""}`}
      />
      <span className="toast-message">{mensaje}</span>

      {/* Botón de cierre solo para error y advertencia */}
      {esManual && (
        <button
          className="toast-close-btn"
          onClick={onClose}
          aria-label="Cerrar notificación"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      )}
    </div>,
    document.body
  );
};

export default Toast;