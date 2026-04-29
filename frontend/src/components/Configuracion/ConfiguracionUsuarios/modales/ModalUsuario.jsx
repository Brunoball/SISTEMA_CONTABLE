import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faFloppyDisk,
  faUserPlus,
  faUserPen,
  faUser,
  faEnvelope,
  faLock,
  faShield,
  faPalette,
  faToggleOn,
} from "@fortawesome/free-solid-svg-icons";

import "./ModalUsuario.css";

export default function ModalUsuario({
  abierto,
  form,
  setForm,
  roles,
  saving,
  esEdicion,
  editandoUsuarioActual,
  onSubmit,
  onClose,
}) {
  useEffect(() => {
    if (!abierto) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !saving) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [abierto, saving, onClose]);

  useEffect(() => {
    if (!abierto) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [abierto]);

  if (!abierto) return null;

  return createPortal(
    <div
      className="mu-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.();
      }}
    >
      <div
        className="mu-modal"
        role="dialog"
        aria-modal="true"
        aria-label={esEdicion ? "Editar usuario" : "Agregar usuario"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div className="mu-header">
          <div className="mu-header__icon">
            <FontAwesomeIcon icon={esEdicion ? faUserPen : faUserPlus} />
          </div>

          <div className="mu-header__texts">
            <h2 className="mu-header__title">
              {esEdicion ? "Editar usuario" : "Agregar usuario"}
            </h2>

            <p className="mu-header__subtitle">
              {esEdicion
                ? editandoUsuarioActual
                  ? "Estás editando tu propio usuario."
                  : "Modificá los datos del usuario seleccionado."
                : "Creá un nuevo usuario para este sistema."}
            </p>
          </div>

          <button
            type="button"
            className="mu-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* ── BODY ── */}
        <div className="mu-body">
          {editandoUsuarioActual && (
            <div className="mu-self-note">
              <div className="mu-self-note__icon">
                <FontAwesomeIcon icon={faShield} />
              </div>

              <span>
                Solo podés modificar usuario, email y contraseña de tu propio
                usuario.
              </span>
            </div>
          )}

          <form id="mu-form" onSubmit={onSubmit}>
            {/* ── Sección: Datos principales ── */}
            <div className="mu-section mu-section--spaced">
              <div className="mu-section__head">
                <div className="mu-section__dot" />
                <span className="mu-section__label">Datos del usuario</span>
              </div>

              <div className="mu-section__body">
                <div className="mu-grid-2">
                  {/* Usuario */}
                  <div className="mu-field mu-col-full">
                    <span className="mu-field__icon">
                      <FontAwesomeIcon icon={faUser} />
                    </span>

                    <input
                      className="mu-input"
                      type="text"
                      placeholder=" "
                      value={form.usuario}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, usuario: e.target.value }))
                      }
                      disabled={saving}
                      autoComplete="off"
                    />

                    <label className="mu-label">Usuario *</label>
                  </div>

                  {/* Email */}
                  <div className="mu-field mu-col-full">
                    <span className="mu-field__icon">
                      <FontAwesomeIcon icon={faEnvelope} />
                    </span>

                    <input
                      className="mu-input"
                      type="email"
                      placeholder=" "
                      value={form.email_recuperacion}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          email_recuperacion: e.target.value,
                        }))
                      }
                      disabled={saving}
                      autoComplete="off"
                    />

                    <label className="mu-label">Email de recuperación</label>
                  </div>

                  {/* Contraseña */}
                  <div className="mu-field mu-col-full">
                    <span className="mu-field__icon">
                      <FontAwesomeIcon icon={faLock} />
                    </span>

                    <input
                      className="mu-input"
                      type="password"
                      placeholder=" "
                      value={form.contrasena}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          contrasena: e.target.value,
                        }))
                      }
                      disabled={saving}
                      autoComplete="new-password"
                    />

                    <label className="mu-label">
                      {esEdicion
                        ? "Nueva contraseña (opcional)"
                        : "Contraseña *"}
                    </label>
                  </div>

                  {esEdicion && (
                    <p className="mu-hint mu-col-full">
                      Dejá el campo vacío para no cambiar la contraseña actual.
                      Si ingresás una nueva, debe tener al menos 6 caracteres.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Sección: Configuración ── */}
            {!editandoUsuarioActual && (
              <div className="mu-section">
                <div className="mu-section__head">
                  <div className="mu-section__dot mu-section__dot--gray" />
                  <span className="mu-section__label">Configuración</span>
                </div>

                <div className="mu-section__body">
                  <div className="mu-grid-2">
                    {/* Rol */}
                    <div className="mu-field">
                      <span className="mu-field__icon">
                        <FontAwesomeIcon icon={faShield} />
                      </span>

                      <select
                        className="mu-select"
                        value={form.idRolMaster}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            idRolMaster: e.target.value,
                          }))
                        }
                        disabled={saving || roles.length === 0}
                      >
                        {roles.length === 0 ? (
                          <option value="">Sin roles</option>
                        ) : (
                          roles.map((r) => {
                            const id = r.idRolMaster || r.id_rol;

                            return (
                              <option key={id} value={id}>
                                {r.nombre || r.tipo_rol}
                              </option>
                            );
                          })
                        )}
                      </select>

                      <label className="mu-label">Rol</label>
                    </div>

                    {/* Tema */}
                    <div className="mu-field">
                      <span className="mu-field__icon">
                        <FontAwesomeIcon icon={faPalette} />
                      </span>

                      <select
                        className="mu-select"
                        value={form.tema}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, tema: e.target.value }))
                        }
                        disabled={saving}
                      >
                        <option value="claro">Claro</option>
                        <option value="oscuro">Oscuro</option>
                      </select>

                      <label className="mu-label">Tema inicial</label>
                    </div>

                    {/* Estado */}
                    <div className="mu-field">
                      <span className="mu-field__icon">
                        <FontAwesomeIcon icon={faToggleOn} />
                      </span>

                      <select
                        className="mu-select"
                        value={form.activo}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            activo: Number(e.target.value),
                          }))
                        }
                        disabled={saving}
                      >
                        <option value={1}>Activo</option>
                        <option value={0}>Inactivo</option>
                      </select>

                      <label className="mu-label">Estado</label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* ── FOOTER ── */}
        <div className="mu-footer">
          <button
            type="button"
            className="mu-btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="mu-form"
            className="mu-btn-submit"
            disabled={saving || (!editandoUsuarioActual && roles.length === 0)}
          >
            <FontAwesomeIcon icon={esEdicion ? faFloppyDisk : faUserPlus} />

            {saving
              ? "Guardando..."
              : esEdicion
              ? "Guardar cambios"
              : "Crear usuario"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}