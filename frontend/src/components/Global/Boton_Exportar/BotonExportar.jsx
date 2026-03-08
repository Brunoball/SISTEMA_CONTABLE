import React, { useEffect, useRef, useState } from "react";
import "./BotonExportar.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport, faChevronDown } from "@fortawesome/free-solid-svg-icons";

export default function BotonExportar({
  disabled = false,
  loading = false,
  className = "",
  label = "Exportar",
  title = "Exportar archivo",
  opciones = [],
  align = "right", // right | left
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const opcionesSeguras = Array.isArray(opciones) ? opciones.filter(Boolean) : [];

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    function handleEscape(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleMainClick = () => {
    if (disabled || loading || opcionesSeguras.length === 0) return;
    setOpen((prev) => !prev);
  };

  const handleOptionClick = async (opcion) => {
    if (!opcion || opcion.disabled || loading) return;

    try {
      await opcion.onClick?.();
    } finally {
      setOpen(false);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`boton-exportar-wrap ${className}`.trim()}
    >
      <button
        type="button"
        className={`boton-exportar-trigger ${open ? "is-open" : ""}`}
        onClick={handleMainClick}
        disabled={disabled || loading || opcionesSeguras.length === 0}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="boton-exportar-trigger__left">
          <FontAwesomeIcon icon={faFileExport} />
          <span className="boton-exportar-trigger__text">{label}</span>
        </span>

        <span className="boton-exportar-trigger__right">
          <FontAwesomeIcon icon={faChevronDown} />
        </span>
      </button>

      {open && (
        <div
          className={`boton-exportar-menu boton-exportar-menu--${align}`}
          role="menu"
        >
          {opcionesSeguras.length === 0 ? (
            <div className="boton-exportar-menu__empty">Sin opciones</div>
          ) : (
            opcionesSeguras.map((opcion, idx) => (
              <button
                key={opcion.key || opcion.label || idx}
                type="button"
                role="menuitem"
                className={`boton-exportar-menu__item ${
                  opcion.danger ? "is-danger" : ""
                } ${opcion.disabled ? "is-disabled" : ""}`}
                onClick={() => handleOptionClick(opcion)}
                disabled={!!opcion.disabled || loading}
                title={opcion.title || opcion.label}
              >
                {opcion.icon && (
                  <span className="boton-exportar-menu__icon">
                    {typeof opcion.icon === "string" ? (
                      opcion.icon
                    ) : (
                      <FontAwesomeIcon icon={opcion.icon} />
                    )}
                  </span>
                )}
                <span className="boton-exportar-menu__label">
                  {opcion.label || "Opción"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}