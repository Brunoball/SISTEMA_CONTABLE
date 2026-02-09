// src/components/Auth/Registro.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./registro.css";
import Toast from "../Global/Toast";

const ROLES = [
  { value: "vista", label: "Rol: Vista (solo lectura)" },
  { value: "admin", label: "Rol: Admin (administrador)" },
];

const Registro = () => {
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmarContrasena, setConfirmarContrasena] = useState("");
  const [rol, setRol] = useState("vista");
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [toast, setToast] = useState(null);

  const navigate = useNavigate();

  const mostrarToast = (tipo, mensaje, duracion = 3000) => {
    setToast({ tipo, mensaje, duracion });
    setTimeout(() => setToast(null), duracion);
  };

  const manejarRegistro = async (e) => {
    e.preventDefault();
    if (cargando) return;

    const nombreTrim = (nombre || "").trim();

    if (!nombreTrim || !contrasena || !confirmarContrasena || !rol) {
      mostrarToast("error", "Por favor, completá todos los campos.");
      return;
    }
    if (nombreTrim.length < 4) {
      mostrarToast("error", "El nombre debe tener al menos 4 caracteres.");
      return;
    }
    if (contrasena.length < 6) {
      mostrarToast("error", "La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (contrasena !== confirmarContrasena) {
      mostrarToast("error", "Las contraseñas no coinciden.");
      return;
    }
    if (!["vista", "admin"].includes(rol)) {
      mostrarToast("error", "Rol inválido.");
      return;
    }

    try {
      setCargando(true);
      mostrarToast("cargando", "Registrando usuario...", 10000);

      const respuesta = await fetch(`${BASE_URL}/api.php?action=registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreTrim, contrasena, rol }),
      });

      const txt = await respuesta.text();
      let data = null;
      try {
        data = JSON.parse(txt);
      } catch {
        throw new Error(`Respuesta inválida: ${txt.slice(0, 200)}`);
      }

      setCargando(false);

      if (data?.exito) {
        localStorage.setItem("usuario", JSON.stringify(data.usuario));
        mostrarToast("exito", "¡Registro exitoso! Redirigiendo...", 1800);
        setTimeout(() => navigate("/panel"), 1800);
      } else {
        mostrarToast("error", data?.mensaje || "Error al registrar usuario.");
      }
    } catch (err) {
      console.error(err);
      setCargando(false);
      mostrarToast("error", "Error del servidor.");
    }
  };

  return (
    <div className="reg_global-container">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <div className="reg_contenedor">
        <div className="reg_encabezado">
          {/* ✅ Logo eliminado para evitar error de import */}
          <h1 className="reg_titulo">Crear Cuenta</h1>
          <p className="reg_subtitulo">
            Registrate para acceder al sistema de la Cooperadora
          </p>
        </div>

        <form onSubmit={manejarRegistro} className="reg_formulario">
          {/* Usuario */}
          <div className="reg_campo">
            <input
              type="text"
              placeholder="Usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="reg_input"
              autoComplete="username"
            />
          </div>

          {/* Rol */}
          <div className="reg_campo reg_campo-rol">
            <select
              className="reg_input"
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              required
              aria-label="Seleccionar rol"
              title="Seleccionar rol"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contraseña + Confirmación */}
          <div className="reg_fila-2">
            <div className="reg_campo reg_campo-password reg_col-6">
              <input
                type={showPassword ? "text" : "password"}
                className="reg_input"
                placeholder="Contraseña"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="reg_toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </>
                  )}
                </svg>
              </button>
            </div>

            <div className="reg_campo reg_campo-password reg_col-6">
              <input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmar Contraseña"
                value={confirmarContrasena}
                onChange={(e) => setConfirmarContrasena(e.target.value)}
                required
                className="reg_input"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="reg_toggle-password"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={
                  showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"
                }
                title={showConfirmPassword ? "Ocultar confirmación" : "Mostrar confirmación"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  {showConfirmPassword ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div className="reg_footer">
            <button type="submit" className="reg_boton" disabled={cargando}>
              {cargando ? "Registrando..." : "Registrarse"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/panel")}
              className="reg_boton reg_boton-secundario"
            >
              Volver atrás
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Registro;
