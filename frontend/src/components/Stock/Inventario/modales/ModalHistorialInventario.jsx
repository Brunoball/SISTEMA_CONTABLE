import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BASE_URL from "../../../../config/config";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft } from "@fortawesome/free-solid-svg-icons";
import "./modalinventario.css"

const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

function buildHeadersGET() {
  const sessionKey = (localStorage.getItem("session_key") || "").trim();
  const token      = (localStorage.getItem("token")       || "").trim();
  const h = {};
  if (sessionKey) h["X-Session"]     = sessionKey;
  if (token)      h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("La API devolvió una respuesta inválida."); }
  if (!res.ok || data?.exito === false) throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  return data;
}

function isTemaOscuro() {
  return (
    document.documentElement.getAttribute("data-theme") === "oscuro" ||
    document.body?.classList?.contains("dark")
  );
}

/* ── pequeña utilidad: badge de campo ── */
function CampoBadge({ campo }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".03em",
        background: "rgba(0,85,187,.10)",
        color: "#0055BB",
        border: "1px solid rgba(0,85,187,.18)",
        whiteSpace: "nowrap",
      }}
    >
      {campo || "—"}
    </span>
  );
}

/* ── celda de valor con diff coloreado ── */
function ValorCell({ valor, tipo }) {
  if (valor == null || valor === "") return <span style={{ color: "var(--nv-muted, #5A6A7E)" }}>—</span>;

  const color =
    tipo === "antes"
      ? "rgba(185,28,28,.85)"
      : tipo === "despues"
      ? "rgba(5,122,85,.92)"
      : "inherit";

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        fontWeight: 600,
        color,
      }}
    >
      {String(valor)}
    </span>
  );
}

/* ═══════════════════════════════════════
   MODAL PRINCIPAL
═══════════════════════════════════════ */
const ModalHistorialInventario = ({ producto, onClose }) => {
  const closeBtnRef = useRef(null);

  /* dark mode reactivo */
  const [dark, setDark] = useState(isTemaOscuro);
  useEffect(() => {
    const update = () => setDark(isTemaOscuro());
    const o1 = new MutationObserver(update);
    o1.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const o2 = new MutationObserver(update);
    if (document.body) o2.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => { o1.disconnect(); o2.disconnect(); };
  }, []);

  /* scroll lock */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ESC */
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* autofocus */
  useEffect(() => {
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, []);

  /* datos */
  const [loading,  setLoading]  = useState(true);
  const [historial, setHistorial] = useState([]);
  const [error,    setError]    = useState("");

  useEffect(() => {
    let mounted = true;

    async function cargar() {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams({
          action:      "stock_inventario_historial",
          id_producto: String(producto.id),
        });

        const res  = await fetch(`${API_URL}?${params.toString()}`, {
          method:  "GET",
          headers: buildHeadersGET(),
        });
        const data = await parseJsonOrThrow(res);

        if (!mounted) return;
        setHistorial(Array.isArray(data.historial) ? data.historial : []);
      } catch (err) {
        if (mounted) setError(err.message || "Error al cargar el historial.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (producto?.id) cargar();
    return () => { mounted = false; };
  }, [producto]);

  /* ── render ── */
  return createPortal(
    <div
      className={["mi-modal__overlay", dark ? "mi-modal__overlay--dark" : ""].join(" ").trim()}
      onClick={onClose}
    >
      <div
        className={[
          "mi-modal__container",
          "cmi-container",          /* mismo ancho/altura que carga masiva */
          dark ? "mi-modal--dark" : "",
        ].join(" ").trim()}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ minHeight: "auto", maxHeight: "88vh" }}
      >

        {/* ══ HEADER ══ */}
        <div className="mi-modal__header">
          <div className="mi-modal__head-icon" aria-hidden="true">
            <FontAwesomeIcon icon={faClockRotateLeft} />
          </div>
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Historial de inventario</h2>
            <p className="mi-modal__subtitle">Movimientos registrados del producto seleccionado</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar modal"
          >✕</button>
        </div>

        {/* ══ BODY ══ */}
        <div className="mi-modal__content cmi-body" style={{ gap: 12 }}>

          {/* ── Info del producto ── */}
          <div
            className="mi-card mi-card--full"
            style={{ padding: "10px 14px" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "6px 18px",
              }}
            >
              {[
                { label: "Producto", value: producto?.nombre },
                { label: "ID",       value: producto?.id     },
                { label: "SKU",      value: producto?.sku    },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      color: "var(--nv-muted, #5A6A7E)",
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--nv-text, #0A2540)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {value || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Tabla / estados ── */}
          {loading ? (
            <div className="modal-nc-loading">
              <div className="modal-nc-loading__dot" />
              Cargando historial…
            </div>
          ) : error ? (
            <div className="modal-nc-error">{error}</div>
          ) : historial.length === 0 ? (
            <div
              className="mi-card mi-card--full"
              style={{
                padding: "28px 16px",
                textAlign: "center",
                color: "var(--nv-muted, #5A6A7E)",
                fontSize: 13,
              }}
            >
              No hay movimientos registrados para este producto.
            </div>
          ) : (
            <section className="mi-cr-table" style={{ flex: 1, minHeight: 0 }}>

              {/* Cabecera */}
              <div
                className="mi-cr-table__head"
                style={{
                  gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 1.2fr",
                }}
              >
                <div style={{ paddingLeft: 10 }}>Fecha</div>
                <div>Campo</div>
                <div>Antes</div>
                <div>Después</div>
                <div>Usuario</div>
              </div>

              {/* Filas */}
              <div className="mi-cr-table__rows">
                {historial.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="mi-cr-row"
                    style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 1.2fr" }}
                  >
                    {/* Fecha */}
                    <div className="mi-cr-cell">
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--nv-muted, #5A6A7E)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {item.created_at || "—"}
                      </span>
                    </div>

                    {/* Campo */}
                    <div className="mi-cr-cell">
                      <CampoBadge campo={item.campo} />
                    </div>

                    {/* Antes */}
                    <div className="mi-cr-cell">
                      <ValorCell valor={item.valor_anterior} tipo="antes" />
                    </div>

                    {/* Después */}
                    <div className="mi-cr-cell">
                      <ValorCell valor={item.valor_nuevo} tipo="despues" />
                    </div>

                    {/* Usuario */}
                    <div className="mi-cr-cell">
                      <span style={{ fontSize: 12, fontWeight: 500 }}>
                        {item.usuario || "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pie con conteo */}
              <div className="mi-cr-table__foot">
                <div className="mi-cr-foot-actions">
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--nv-muted, #5A6A7E)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {historial.length} movimiento{historial.length !== 1 ? "s" : ""} registrado{historial.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* ══ FOOTER ══ */}
        <div className="cmi-footer">
          <div className="mi-card__hint cmi-footer__hint">
            Mostrando todos los cambios de inventario para <strong>{producto?.nombre || "este producto"}</strong>.
          </div>
          <div className="cmi-footer__btns">
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default ModalHistorialInventario;