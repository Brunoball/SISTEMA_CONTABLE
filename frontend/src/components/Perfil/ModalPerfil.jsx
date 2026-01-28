// src/components/Perfil/ModalPerfil.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserCircle, faXmark } from "@fortawesome/free-solid-svg-icons";
import "./ModalPerfil.css";

function normalizeRolLabel(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "admin" ? "Administrador" : "Vista";
}

function planLabelFromBackend(u) {
  const planNombre = String(u?.plan_nombre ?? "").trim();
  if (planNombre) {
    const clean = planNombre
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `Plan ${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
  }

  const n = Number(u?.plan_nivel ?? u?.planNivel ?? u?.plan_nivel ?? 1);
  if (n === 2) return "Plan Intermedio";
  if (n === 3) return "Plan Avanzado";
  return "Plan Básico";
}

/**
 * ✅ Devuelve SOLO FECHA en es-AR: DD/MM/AAAA
 * Acepta:
 * - "YYYY-MM-DD"
 * - "YYYY-MM-DD HH:MM:SS"
 */
function formatMySQLDateOnly(value) {
  if (!value) return "-";
  try {
    const raw = String(value).trim();
    if (!raw) return "-";

    const datePart = raw.includes(" ") ? raw.split(" ")[0] : raw;
    const [yyyy, mm, dd] = datePart.split("-").map((x) => Number(x));
    if (!yyyy || !mm || !dd) return datePart;

    const ddStr = String(dd).padStart(2, "0");
    const mmStr = String(mm).padStart(2, "0");
    return `${ddStr}/${mmStr}/${yyyy}`;
  } catch {
    return String(value);
  }
}

export default function ModalPerfil({ open, onClose, usuario }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    // foco al botón cerrar (igual que tu modal)
    setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const view = useMemo(() => {
    if (!usuario) return null;

    const nombre =
      usuario.Nombre_Completo ||
      usuario.nombre ||
      usuario.user ||
      usuario.usuario ||
      "Usuario";

    const avatar = String(nombre).trim().slice(0, 1).toUpperCase();

    return {
      nombre,
      avatar,
      idUsuario: usuario.idUsuario ?? "-",
      rol: normalizeRolLabel(usuario.rol),
      plan: planLabelFromBackend(usuario),
      fechaCreacion: formatMySQLDateOnly(usuario.Fecha_Creacion),
    };
  }, [usuario]);

  if (!open || !view) return null;

  const cerrar = () => onClose?.();

  return (
    <div
      className="mi-modal__overlay"
      onClick={(e) =>
        e.target.classList.contains("mi-modal__overlay") && cerrar()
      }
    >
      <div
        className="mi-modal__container mi-modal__container--perfil"
        role="dialog"
        aria-modal="true"
        aria-labelledby="perfil-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER (igual al de Movimientos) */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 id="perfil-modal-title" className="mi-modal__title">
              Perfil de usuario
            </h2>
            <p className="mi-modal__subtitle">
              {view.rol} • {view.plan}
            </p>
          </div>

          <button
            ref={closeBtnRef}
            className="mi-modal__close"
            onClick={cerrar}
            aria-label="Cerrar"
            type="button"
            title="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* BODY con scroll + gradiente (misma “sensación”) */}
        <div className="perfil-body">
          <div className="perfil-inner">
            {/* CARD PRINCIPAL */}
            <div className="perfil-card">
              <div className="perfil-card__icon" aria-hidden="true">
                <FontAwesomeIcon icon={faUserCircle} />
              </div>

              <div className="perfil-avatar" aria-hidden="true">
                {view.avatar}
              </div>

              <div className="perfil-who">
                <div className="perfil-name">{view.nombre}</div>
                <div className="perfil-meta">
                  ID Usuario: <b>{view.idUsuario}</b>
                </div>
              </div>
            </div>

            {/* DATOS */}
            <div className="perfil-grid">
              <div className="perfil-field">
                <div className="perfil-field__label">Rol</div>
                <div className="perfil-field__value">{view.rol}</div>
              </div>

              <div className="perfil-field">
                <div className="perfil-field__label">Plan</div>
                <div className="perfil-field__value">{view.plan}</div>
              </div>

              <div className="perfil-field perfil-field--full">
                <div className="perfil-field__label">Fecha de creación</div>
                <div className="perfil-field__value">{view.fechaCreacion}</div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER acciones (mismo estilo de botones que Movimientos) */}
        <div className="mit-actions">
          <div className="mit-help"> </div>

          <button
            type="button"
            className="mit-btn mit-btn--ghost"
            onClick={cerrar}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
