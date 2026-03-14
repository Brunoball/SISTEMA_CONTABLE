import React, { useState, useEffect, useRef } from "react";
import BASE_URL from "../../../config/config";
import "./ModalRecuperar.css";

const ModalReestablecerContra = ({ token, onClose }) => {
  const [step, setStep] = useState("validando");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [nuevaContra, setNuevaContra] = useState("");
  const [confirmarContra, setConfirmarContra] = useState("");
  const [showNueva, setShowNueva] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const inputRef = useRef(null);

  useEffect(() => {
    if (!token) {
      setTokenError("Token no proporcionado.");
      setStep("error");
      return;
    }

    const validarToken = async () => {
      try {
        const res = await fetch(`${BASE_URL}/api.php?action=validar_token_reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const text = await res.text();
        let data = null;

        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }

        console.log("VALIDAR TOKEN RESPONSE:", {
          status: res.status,
          ok: res.ok,
          raw: text,
          data,
        });

        if (!res.ok || !data?.exito) {
          let msg = data?.mensaje || "El enlace no es válido o ya expiró.";

          if (data?.debug?.error) {
            msg += `\n\n${data.debug.error}`;
          } else if (data?.fatal?.message) {
            msg += `\n\n${data.fatal.message}`;
          } else if (!data && text) {
            msg += `\n\n${text}`;
          }

          setTokenError(msg);
          setStep("error");
          return;
        }

        setStep("form");
      } catch (err) {
        console.error("VALIDAR TOKEN FETCH ERROR:", err);
        setTokenError("No se pudo conectar al servidor.");
        setStep("error");
      }
    };

    validarToken();
  }, [token]);

  useEffect(() => {
    if (step === "form") {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [step]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const getPasswordStrength = (pass) => {
    if (!pass) return null;

    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 1) return { label: "Débil", color: "#ef4444", width: "25%" };
    if (score === 2) return { label: "Regular", color: "#f59e0b", width: "50%" };
    if (score === 3) return { label: "Buena", color: "#3b82f6", width: "75%" };
    return { label: "Fuerte", color: "#22c55e", width: "100%" };
  };

  const strength = getPasswordStrength(nuevaContra);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cargando) return;

    setError("");

    if (!nuevaContra || nuevaContra.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (nuevaContra !== confirmarContra) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setCargando(true);

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=reset_contrasena`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nueva_contrasena: nuevaContra }),
      });

      const text = await res.text();
      let data = null;

      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      console.log("RESET PASSWORD RESPONSE:", {
        status: res.status,
        ok: res.ok,
        raw: text,
        data,
      });

      if (!res.ok || !data?.exito) {
        let msg = data?.mensaje || "No se pudo restablecer la contraseña.";

        if (data?.debug?.error) {
          msg += `\n\n${data.debug.error}`;
        } else if (!data && text) {
          msg += `\n\n${text}`;
        }

        setError(msg);
        return;
      }

      setStep("exito");
    } catch (err) {
      console.error("RESET PASSWORD FETCH ERROR:", err);
      setError("No se pudo conectar al servidor. Intentá más tarde.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      className="modal-recuperar-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Restablecer contraseña"
    >
      <div className="modal-recuperar-card">
        <div className="modal-recuperar-header">
          <div className="modal-recuperar-icon-wrap">
            {step === "exito" ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : step === "error" ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
          </div>

          <div className="modal-recuperar-title-group">
            <h2 className="modal-recuperar-title">
              {step === "exito"
                ? "¡Contraseña actualizada!"
                : step === "error"
                ? "Enlace inválido"
                : "Nueva contraseña"}
            </h2>

            <p className="modal-recuperar-subtitle">
              {step === "exito"
                ? "Ya podés iniciar sesión"
                : step === "error"
                ? "El enlace no es válido o expiró"
                : step === "validando"
                ? "Verificando enlace..."
                : "Ingresá tu nueva contraseña"}
            </p>
          </div>

          <button onClick={onClose} className="modal-recuperar-close" aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-recuperar-body">
          {step === "validando" && (
            <div className="modal-recuperar-centered-state">
              <div className="modal-recuperar-spinner-big" />
              <p className="modal-recuperar-text-muted">Verificando el enlace...</p>
            </div>
          )}

          {step === "error" && (
            <div className="modal-recuperar-centered-state">
              <div className="modal-recuperar-big-icon-wrap error">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>

              <p className="modal-recuperar-state-title">
                {tokenError || "Enlace inválido o expirado"}
              </p>

              <p className="modal-recuperar-state-desc">
                Solicitá un nuevo enlace desde la pantalla de inicio de sesión.
              </p>

              <button
                onClick={onClose}
                className="modal-recuperar-btn-primary modal-recuperar-full-btn"
              >
                Volver al inicio
              </button>
            </div>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmit} noValidate>
              <label className="modal-recuperar-label">Nueva contraseña</label>

              <div className="modal-recuperar-pass-wrap">
                <input
                  ref={inputRef}
                  type={showNueva ? "text" : "password"}
                  value={nuevaContra}
                  onChange={(e) => {
                    setNuevaContra(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Mínimo 6 caracteres"
                  className={`modal-recuperar-input modal-recuperar-pass-input ${error ? "modal-recuperar-input-error" : ""}`}
                  autoComplete="new-password"
                  disabled={cargando}
                />

                <button
                  type="button"
                  onClick={() => setShowNueva((v) => !v)}
                  className="modal-recuperar-eye-btn"
                  tabIndex={-1}
                >
                  {showNueva ? "🙈" : "👁️"}
                </button>
              </div>

              {nuevaContra && strength && (
                <div className="modal-recuperar-strength">
                  <div className="modal-recuperar-strength-bar">
                    <div
                      className="modal-recuperar-strength-fill"
                      style={{
                        width: strength.width,
                        background: strength.color,
                      }}
                    />
                  </div>
                  <p
                    className="modal-recuperar-strength-label"
                    style={{ color: strength.color }}
                  >
                    {strength.label}
                  </p>
                </div>
              )}

              <label className="modal-recuperar-label" style={{ marginTop: 16 }}>
                Confirmar contraseña
              </label>

              <div className="modal-recuperar-pass-wrap">
                <input
                  type={showConfirmar ? "text" : "password"}
                  value={confirmarContra}
                  onChange={(e) => {
                    setConfirmarContra(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="Repetí la contraseña"
                  className={`modal-recuperar-input modal-recuperar-pass-input ${error ? "modal-recuperar-input-error" : ""}`}
                  autoComplete="new-password"
                  disabled={cargando}
                />

                <button
                  type="button"
                  onClick={() => setShowConfirmar((v) => !v)}
                  className="modal-recuperar-eye-btn"
                  tabIndex={-1}
                >
                  {showConfirmar ? "🙈" : "👁️"}
                </button>
              </div>

              {confirmarContra && (
                <p
                  className={`modal-recuperar-match ${
                    nuevaContra === confirmarContra ? "ok" : "bad"
                  }`}
                >
                  {nuevaContra === confirmarContra
                    ? "✓ Las contraseñas coinciden"
                    : "✗ Las contraseñas no coinciden"}
                </p>
              )}

              {error && <p className="modal-recuperar-error">{error}</p>}

              <div className="modal-recuperar-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="modal-recuperar-btn-secondary"
                  disabled={cargando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="modal-recuperar-btn-primary"
                  disabled={cargando || !nuevaContra || !confirmarContra}
                >
                  {cargando ? (
                    <span className="modal-recuperar-spinner" />
                  ) : (
                    "Guardar contraseña"
                  )}
                </button>
              </div>
            </form>
          )}

          {step === "exito" && (
            <div className="modal-recuperar-centered-state">
              <div className="modal-recuperar-big-icon-wrap success">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <p className="modal-recuperar-state-title">¡Contraseña actualizada!</p>

              <p className="modal-recuperar-state-desc">
                Tu contraseña fue cambiada correctamente. Ya podés iniciar sesión con la nueva.
              </p>

              <button
                onClick={onClose}
                className="modal-recuperar-btn-primary modal-recuperar-full-btn"
              >
                Ir al inicio de sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalReestablecerContra;