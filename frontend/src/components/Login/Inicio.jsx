// src/components/inicio/Inicio.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./inicio.css";
import logoRH from "../../imagenes/Logotransparente.png";
import Toast from "../Global/Toast";

const STORAGE_KEYS = {
  rememberFlag: "rememberLogin",
  user: "remember_nombre",
  pass: "remember_contrasena", // base64
};

function decodeJwtPayload(token) {
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeRol(value) {
  if (value == null) return "vista";
  const v = String(value).trim().toLowerCase();
  if (
    v === "1" ||
    v === "admin" ||
    v === "administrator" ||
    v === "administrador" ||
    v === "superadmin"
  )
    return "admin";
  return "vista";
}

// 🔒 Normaliza plan (1,2,3). Si viene raro, cae en 1.
function normalizePlanNivel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

const Inicio = () => {
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  const [toast, setToast] = useState(null);
  const mostrarToast = (tipo, mensaje, duracion = 3000) =>
    setToast({ tipo, mensaje, duracion });

  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rememberFlag) === "1";
    if (saved) {
      const savedUser = localStorage.getItem(STORAGE_KEYS.user) || "";
      const savedPassB64 = localStorage.getItem(STORAGE_KEYS.pass) || "";
      let savedPass = "";
      try {
        savedPass = savedPassB64 ? atob(savedPassB64) : "";
      } catch {
        savedPass = "";
      }
      setRemember(true);
      setNombre(savedUser);
      setContrasena(savedPass);
    }
  }, []);

  const persistRemember = (user, pass, flag) => {
    if (flag) {
      localStorage.setItem(STORAGE_KEYS.rememberFlag, "1");
      localStorage.setItem(STORAGE_KEYS.user, user ?? "");
      localStorage.setItem(STORAGE_KEYS.pass, btoa(pass ?? ""));
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberFlag);
      localStorage.removeItem(STORAGE_KEYS.user);
      localStorage.removeItem(STORAGE_KEYS.pass);
    }
  };

  useEffect(() => {
    if (remember) persistRemember(nombre, contrasena, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, contrasena, remember]);

  const togglePasswordVisibility = () => setShowPassword((v) => !v);

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (cargando) return;
    setCargando(true);

    if (!nombre || !contrasena) {
      mostrarToast("advertencia", "Por favor complete todos los campos");
      setCargando(false);
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=inicio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, contrasena }),
      });

      if (res.status === 401) {
        let d = null;
        try {
          d = await res.json();
        } catch {}
        mostrarToast("error", d?.mensaje || "Usuario o contraseña incorrectos");
        setCargando(false);
        return;
      }

      if (!res.ok) {
        mostrarToast("error", "No se pudo iniciar sesión. Intente nuevamente.");
        setCargando(false);
        return;
      }

      let data = null;
      try {
        data = await res.json();
      } catch {}

      if (!data || !data.exito) {
        mostrarToast("error", data?.mensaje || "Usuario o contraseña incorrectos");
        setCargando(false);
        return;
      }

      const token = data.token;
      if (token) localStorage.setItem("token", token);

      const usuarioResp = data.usuario || {};

      // ✅ rol: desde usuarioResp.rol, data.rol o token (si existiera)
      let rol = (usuarioResp.rol ?? data.rol ?? "").toString();
      if ((!rol || rol === "") && token && token.split(".").length === 3) {
        const payload = decodeJwtPayload(token);
        const fromJwt = (payload?.rol || payload?.role || payload?.scope || "").toString();
        if (fromJwt) rol = fromJwt;
      }

      // ✅ plan_nivel: viene del backend en data.usuario.plan_nivel
      const planNivel = normalizePlanNivel(
        usuarioResp.plan_nivel ?? usuarioResp.planNivel ?? data.plan_nivel ?? 1
      );

      const usuarioFinal = {
        ...usuarioResp,

        // 🔧 Normalizaciones IMPORTANTES
        rol: normalizeRol(rol),
        plan_nivel: planNivel,

        // 🔧 Para que el resto de tu app pueda usar "nombre" si quiere:
        // tu backend devuelve "Nombre_Completo"
        nombre:
          usuarioResp.nombre ??
          usuarioResp.Nombre_Completo ??
          usuarioResp.user ??
          nombre,
      };

      localStorage.setItem("usuario", JSON.stringify(usuarioFinal));
      persistRemember(nombre, contrasena, remember);

      navigate("/panel");
    } catch {
      mostrarToast("error", "No se pudo iniciar sesión. Intente nuevamente.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_contenedor-principal">
      <div className="ini_contenedor">
        <div className="ini_encabezado">
          <img src={logoRH} alt="Cooperadora IPET 50" className="ini_logo" />
          <h1 className="ini_titulo">Iniciar Sesión</h1>
          <p className="ini_subtitulo">
            Ingresá tus credenciales para acceder al sistema
          </p>
        </div>

        <form
          onSubmit={manejarEnvio}
          className="ini_formulario"
          autoComplete="on"
          noValidate
        >
          <div className="ini_campo">
            <input
              type="text"
              placeholder="Usuario"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="ini_input"
              autoComplete="username"
              inputMode="text"
            />
          </div>

          <div className="ini_campo ini_campo-password">
            <input
              type={showPassword ? "text" : "password"}
              className="ini_input"
              placeholder="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="ini_toggle-password"
              onClick={togglePasswordVisibility}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
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

          <div className="ini_check-row">
            <input
              id="recordar"
              type="checkbox"
              className="ini_checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="recordar" className="ini_check-label">
              Recordar cuenta
            </label>
          </div>

          <div className="ini_footer">
            <button
              type="submit"
              className="ini_boton"
              disabled={cargando}
              aria-busy={cargando ? "true" : "false"}
              aria-live="polite"
            >
              {cargando ? "Iniciando..." : "Iniciar Sesión"}
            </button>
          </div>
        </form>
      </div>

      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Inicio;
