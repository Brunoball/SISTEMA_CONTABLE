import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faExclamationTriangle,
  faTimesCircle,
  faSpinner,
  faInfoCircle,
} from "@fortawesome/free-solid-svg-icons";
import "./Toast.css";

const Toast = ({ tipo, mensaje, onClose, duracion = 2500 }) => {
  const [desapareciendo, setDesapareciendo] = useState(false);

  useEffect(() => {
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
  }, [onClose, duracion]);

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
    </div>,
    document.body
  );
};

export default Toast;
