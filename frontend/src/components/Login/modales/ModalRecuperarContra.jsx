import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLock,
  faXmark,
  faPaperPlane,
} from "@fortawesome/free-solid-svg-icons";
import BASE_URL from "../../../config/config";
import "./ModalRecuperar.css";

function maskEmail(email) {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.min(local.length - 2, 4))}@${domain}`;
}

const ModalRecuperarContra = ({ onClose, usuarioPrefill = "" }) => {
  const [step, setStep] = useState("form");
  const [usuario, setUsuario] = useState(usuarioPrefill || "");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");

  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cargando) return;

    setError("");

    const user = String(usuario || "").trim();

    if (!user) {
      setError("Ingresá tu nombre de usuario.");
      return;
    }

    setCargando(true);

    try {
      const res = await fetch(`${BASE_URL}/api.php?action=recuperar_contrasena`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nombre: user }),
      });

      const text = await res.text();
      let data = null;

      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.exito) {
        console.error("RECUPERAR CONTRA ERROR:", {
          status: res.status,
          data,
          raw: text,
        });

        let msg = data?.mensaje || "No se pudo procesar la recuperación.";

        if (data?.debug?.error) {
          msg += ` (${data.debug.error})`;
        } else if (data?.debug?.mail_error) {
          msg += ` (${data.debug.mail_error})`;
        } else if (!data && text) {
          msg = `Respuesta inválida del servidor: ${text}`;
        }

        setError(msg);
        return;
      }

      const emailRaw = data?.email || "";
      setMaskedEmail(maskEmail(emailRaw) || "tu correo registrado");
      setStep("sent");
    } catch (err) {
      console.error("RECUPERAR CONTRA FETCH ERROR:", err);
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
      aria-label="Recuperar contraseña"
    >
      <div className="modal-recuperar-card">
        <div className="modal-recuperar-header">
          <div className="modal-recuperar-icon-wrap">
            <FontAwesomeIcon icon={faLock} />
          </div>

          <div className="modal-recuperar-title-group">
            <h2 className="modal-recuperar-title">Recuperar contraseña</h2>
            <p className="modal-recuperar-subtitle">
              {step === "form"
                ? "Te enviaremos un enlace a tu correo registrado"
                : "Revisá tu bandeja de entrada"}
            </p>
          </div>

          <button onClick={onClose} className="modal-recuperar-close" aria-label="Cerrar">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="modal-recuperar-body">
          {step === "form" ? (
            <form onSubmit={handleSubmit} noValidate>
              <label className="modal-recuperar-label">Nombre de usuario</label>

              <input
                ref={inputRef}
                type="text"
                value={usuario}
                onChange={(e) => {
                  setUsuario(e.target.value);
                  if (error) setError("");
                }}
                placeholder="Tu usuario de acceso"
                className={`modal-recuperar-input ${error ? "modal-recuperar-input-error" : ""}`}
                autoComplete="username"
                disabled={cargando}
              />

              {error && <p className="modal-recuperar-error">{error}</p>}

              <p className="modal-recuperar-hint">
                Ingresá el usuario con el que accedés al sistema. Si tiene un correo registrado, recibirás las instrucciones ahí.
              </p>

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
                  disabled={cargando || !usuario.trim()}
                >
                  {cargando ? (
                    <span className="modal-recuperar-spinner" />
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faPaperPlane} />
                      Enviar instrucciones
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="modal-recuperar-sent-state">
              <div className="modal-recuperar-sent-icon">
                <FontAwesomeIcon icon={faPaperPlane} />
              </div>

              <p className="modal-recuperar-sent-title">¡Listo! Revisá tu correo</p>
              <p className="modal-recuperar-sent-desc">
                Enviamos las instrucciones para restablecer tu contraseña a:
              </p>
              <div className="modal-recuperar-email-badge">{maskedEmail}</div>
              <p className="modal-recuperar-sent-hint">
                Si no lo ves en unos minutos, revisá la carpeta de spam.
              </p>

              <button
                onClick={onClose}
                className="modal-recuperar-btn-primary modal-recuperar-full-btn"
              >
                Entendido
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalRecuperarContra;