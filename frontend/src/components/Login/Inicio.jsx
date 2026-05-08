import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../config/config";
import "./inicio.css";

import logoBalto from "../../imagenes/Logo_Balto_Azul.png";
import Toast from "../Global/Toast";
import ModalRecuperarContra from "./modales/ModalRecuperarContra";

const STORAGE_KEYS = {
  rememberFlag: "rememberLogin",
  user: "remember_nombre",
  pass: "remember_contrasena",
};

function normalizeRol(value, idRol = null) {
  const id = Number(idRol);
  const v = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    id === 1 ||
    ["1", "admin", "administrator", "administrador", "superadmin"].includes(v)
  ) {
    return "admin";
  }

  return "empleado_basico";
}

function normalizePlanNivel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 3;
}

function normalizePlanId(value) {
  const n = Number(value);
  return n === 2 ? 2 : 1;
}

function withTimeout(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);

  return {
    controller,
    clear: () => clearTimeout(id),
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const Inicio = () => {
  const [nombre, setNombre] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [cargando, setCargando] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);

  const [toast, setToast] = useState(null);
  const [showRecuperar, setShowRecuperar] = useState(false);

  const navigate = useNavigate();

  const mostrarToast = (tipo, mensaje, duracion = 3000) => {
    setToast({ tipo, mensaje, duracion });
  };

  const LOGIN_ENDPOINT = useMemo(() => {
    return `${BASE_URL}/api.php?action=inicio`;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.rememberFlag) === "1";
    if (!saved) return;

    const savedUser = localStorage.getItem(STORAGE_KEYS.user) || "";
    const savedPass = localStorage.getItem(STORAGE_KEYS.pass) || "";

    setRemember(true);
    setNombre(savedUser);
    setContrasena(savedPass);
  }, []);

  const persistRemember = (user, pass, flag) => {
    if (flag) {
      localStorage.setItem(STORAGE_KEYS.rememberFlag, "1");
      localStorage.setItem(STORAGE_KEYS.user, user ?? "");
      localStorage.setItem(STORAGE_KEYS.pass, pass ?? "");
    } else {
      localStorage.removeItem(STORAGE_KEYS.rememberFlag);
      localStorage.removeItem(STORAGE_KEYS.user);
      localStorage.removeItem(STORAGE_KEYS.pass);
    }
  };

  useEffect(() => {
    if (remember) {
      persistRemember(nombre, contrasena, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre, contrasena, remember]);

  const postLogin = async (url, payload) => {
    const { controller, clear } = withTimeout(12000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await res.text();
      const data = safeJsonParse(text);

      return {
        ok: res.ok,
        status: res.status,
        data,
        rawText: text,
      };
    } finally {
      clear();
    }
  };

  const manejarEnvio = async (e) => {
    e.preventDefault();
    if (cargando) return;

    const user = String(nombre || "").trim();
    const pass = String(contrasena || "");

    if (!user || !pass) {
      mostrarToast("advertencia", "Por favor complete todos los campos");
      return;
    }

    setCargando(true);

    try {
      const r = await postLogin(LOGIN_ENDPOINT, {
        nombre: user,
        contrasena: pass,
      });

      if (r.status === 429) {
        mostrarToast(
          "error",
          r.data?.mensaje || "Demasiados intentos fallidos. Probá nuevamente más tarde.",
          7000
        );
        return;
      }

      if (r.status === 401 || r.status === 403) {
        mostrarToast("error", r.data?.mensaje || "Usuario o contraseña incorrectos");
        return;
      }

      if (!r.ok) {
        mostrarToast(
          "error",
          r.data?.mensaje || `No se pudo iniciar sesión. Error HTTP ${r.status}.`
        );
        return;
      }

      const data = r.data;

      if (!data || !data.exito) {
        mostrarToast("error", data?.mensaje || "Usuario o contraseña incorrectos");
        return;
      }

      const sessionKey = String(data.session_key || "").trim();

      if (!sessionKey) {
        mostrarToast("error", "Login correcto pero falta session_key. Revisá inicio.php.");
        return;
      }

      localStorage.setItem("session_key", sessionKey);

      const usuarioResp = data.usuario || {};
      const idPlan = normalizePlanId(
        usuarioResp.idPlan ?? usuarioResp.id_plan ?? usuarioResp.plan_id ?? data.idPlan ?? data.id_plan ?? 1
      );
      const planNivel = normalizePlanNivel(
        usuarioResp.plan_nivel ?? usuarioResp.planNivel ?? data.plan_nivel ?? idPlan
      );

      const usuarioFinal = {
        ...usuarioResp,
        idPlan,
        id_plan: idPlan,
        id_rol: Number(usuarioResp.id_rol ?? data.id_rol ?? 2),
        tipo_rol: usuarioResp.tipo_rol ?? data.tipo_rol ?? "empleado_basico",
        rol: normalizeRol(
          usuarioResp.rol ?? usuarioResp.tipo_rol ?? data.rol ?? data.tipo_rol,
          usuarioResp.id_rol ?? data.id_rol
        ),
        plan_nivel: planNivel,
        nombre:
          usuarioResp.nombre ??
          usuarioResp.Nombre_Completo ??
          usuarioResp.user ??
          user,
      };

      localStorage.setItem("usuario", JSON.stringify(usuarioFinal));

      // Recordar usuario y contraseña si está marcado
      persistRemember(user, pass, remember);

      navigate("/panel");
    } catch (err) {
      console.error("Error login Balto:", err);

      mostrarToast(
        "error",
        err?.name === "AbortError"
          ? "Tiempo de espera agotado conectando al servidor."
          : "No se pudo conectar al servidor. Verificá tu conexión o intentá nuevamente."
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ini_page">
      <div className="ini_card" role="region" aria-label="Inicio de sesión">
        <div className="ini_brand">
          <img
            className="ini_brandLogo"
            src={logoBalto}
            alt="BALTO - Sistemas contables"
          />
        </div>

        <h1 className="ini_title">INICIAR SESIÓN</h1>

        <form
          className="ini_form"
          onSubmit={manejarEnvio}
          autoComplete="on"
          noValidate
        >
          <div className="ini_field ini_fieldUser">
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

          <div className="ini_field ini_fieldPass">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              required
              className="ini_input ini_inputPass"
              autoComplete="current-password"
            />

            <button
              type="button"
              className="ini_passToggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <label className="ini_remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => {
                const checked = e.target.checked;
                setRemember(checked);

                if (checked) {
                  persistRemember(nombre, contrasena, true);
                } else {
                  persistRemember("", "", false);
                }
              }}
            />
            <span>Recordar cuenta</span>
          </label>

          <button
            className="ini_btn"
            type="submit"
            disabled={cargando}
            aria-busy={cargando}
          >
            {cargando ? "INICIANDO..." : "ACCEDER"}
          </button>

          <div className="ini_links">
            <button
              type="button"
              className="ini_link"
              onClick={() => setShowRecuperar(true)}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        </form>
      </div>

      {showRecuperar && (
        <ModalRecuperarContra
          onClose={() => setShowRecuperar(false)}
          usuarioPrefill={nombre}
        />
      )}

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