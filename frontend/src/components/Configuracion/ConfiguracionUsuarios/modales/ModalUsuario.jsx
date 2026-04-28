import React, { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faFloppyDisk,
  faUserPlus,
} from "@fortawesome/free-solid-svg-icons";

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

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [abierto, saving, onClose]);

  if (!abierto) return null;

  return (
    <div className="cfg-users-modalOverlay">
      <div className="cfg-users-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cfg-users-modalHead">
          <div>
            <h2>{esEdicion ? "Editar usuario" : "Agregar usuario"}</h2>

            <p>
              {esEdicion
                ? editandoUsuarioActual
                  ? "Estás editando tu propio usuario."
                  : "Modificá los datos del usuario seleccionado."
                : "Creá un nuevo usuario para este tenant."}
            </p>
          </div>

          <button
            type="button"
            className="cfg-users-modalClose"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar modal"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {editandoUsuarioActual && (
          <div className="cfg-users-edit-note">
            Solo podés modificar usuario, email y contraseña de tu propio usuario.
          </div>
        )}

        <form className="cfg-users-form cfg-users-form--modal" onSubmit={onSubmit}>
          <label>
            Usuario
            <input
              value={form.usuario}
              onChange={(e) => setForm((p) => ({ ...p, usuario: e.target.value }))}
              placeholder="Ej: empleado1"
              autoComplete="off"
            />
          </label>

          <label>
            Email de recuperación
            <input
              value={form.email_recuperacion}
              onChange={(e) => setForm((p) => ({ ...p, email_recuperacion: e.target.value }))}
              placeholder="opcional@correo.com"
              type="email"
            />
          </label>

          <label>
            Contraseña {esEdicion ? <span>(dejar vacía para no cambiar)</span> : null}
            <input
              value={form.contrasena}
              onChange={(e) => setForm((p) => ({ ...p, contrasena: e.target.value }))}
              placeholder={esEdicion ? "Nueva contraseña opcional" : "Mínimo 6 caracteres"}
              type="password"
              autoComplete="new-password"
            />
          </label>

          {!editandoUsuarioActual && (
            <>
              <label>
                Rol
                <select
                  value={form.idRolMaster}
                  onChange={(e) => setForm((p) => ({ ...p, idRolMaster: e.target.value }))}
                  disabled={roles.length === 0}
                >
                  {roles.length === 0 ? (
                    <option value="">No hay roles cargados</option>
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
              </label>

              <label>
                Tema inicial
                <select
                  value={form.tema}
                  onChange={(e) => setForm((p) => ({ ...p, tema: e.target.value }))}
                >
                  <option value="claro">Claro</option>
                  <option value="oscuro">Oscuro</option>
                </select>
              </label>

              <label>
                Estado
                <select
                  value={form.activo}
                  onChange={(e) => setForm((p) => ({ ...p, activo: Number(e.target.value) }))}
                >
                  <option value={1}>Activo</option>
                  <option value={0}>Inactivo</option>
                </select>
              </label>
            </>
          )}

          <div className="cfg-users-modalActions">
            <button
              type="button"
              className="cfg-users-btn cfg-users-btn--ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              className="cfg-users-btn cfg-users-btn--primary"
              type="submit"
              disabled={saving || (!editandoUsuarioActual && roles.length === 0)}
            >
              <FontAwesomeIcon icon={esEdicion ? faFloppyDisk : faUserPlus} />
              {saving ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}