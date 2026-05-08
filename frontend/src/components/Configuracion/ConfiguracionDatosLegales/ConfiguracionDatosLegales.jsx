import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBuilding,
  faFileInvoiceDollar,
  faFloppyDisk,
  faIdCard,
  faReceipt,
} from "@fortawesome/free-solid-svg-icons";

import BASE_URL from "../../../config/config";
import Toast from "../../Global/Toast";
import "./ConfiguracionDatosLegales.css";

const API_RELATIVE = "api.php";

const emptyForm = {
  idConfigFacturacion: 0,
  razon_social: "",
  nombre_fantasia: "",
  cuit: "",
  ingresos_brutos: "",
  condicion_iva: "RESPONSABLE MONOTRIBUTO",
  domicilio_comercial: "",
  fecha_inicio_actividades: "",
  punto_venta: "00001",
  tipo_comprobante_default: "FACTURA C",
  codigo_comprobante: "011",
  activo: 1,
};

const condicionesIva = [
  "RESPONSABLE MONOTRIBUTO",
  "RESPONSABLE INSCRIPTO",
  "IVA EXENTO",
  "CONSUMIDOR FINAL",
  "NO RESPONSABLE",
];

const comprobantes = [
  { tipo: "FACTURA A", codigo: "001" },
  { tipo: "FACTURA B", codigo: "006" },
  { tipo: "FACTURA C", codigo: "011" },
  { tipo: "RECIBO A", codigo: "004" },
  { tipo: "RECIBO B", codigo: "009" },
  { tipo: "RECIBO C", codigo: "015" },
];

function buildApiUrl(paramsObj = {}) {
  const baseRaw = String(BASE_URL || "").trim();
  const base = baseRaw.replace(/\/+$/, "") + "/";
  const url = new URL(API_RELATIVE, base);
  const qs = new URLSearchParams();

  Object.entries(paramsObj || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, String(v));
  });

  url.search = qs.toString();
  return url.toString();
}

function getSessionKey() {
  return String(localStorage.getItem("session_key") || "").trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiFetch(paramsObj = {}, options = {}) {
  const headers = new Headers(options.headers || {});
  const sessionKey = getSessionKey();

  if (sessionKey) headers.set("X-Session", sessionKey);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(buildApiUrl(paramsObj), { ...options, headers });
}

function toMayus(value) {
  return String(value || "").toLocaleUpperCase("es-AR");
}

function limpiarTexto(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function limpiarTextoMayus(value) {
  return toMayus(limpiarTexto(value));
}

function normalizarCuit(value) {
  return String(value || "")
    .replace(/[^0-9-]/g, "")
    .slice(0, 20);
}

function normalizarPuntoVenta(value) {
  const soloNumeros = String(value || "").replace(/\D/g, "").slice(0, 5);
  if (!soloNumeros) return "";
  return soloNumeros.padStart(5, "0");
}

function normalizarCodigoComprobante(value) {
  const soloNumeros = String(value || "").replace(/\D/g, "").slice(0, 3);
  if (!soloNumeros) return "";
  return soloNumeros.padStart(3, "0");
}

function normalizarConfigDesdeApi(config = {}) {
  return {
    ...emptyForm,
    ...config,
    razon_social: limpiarTextoMayus(config.razon_social || ""),
    nombre_fantasia: limpiarTextoMayus(config.nombre_fantasia || ""),
    cuit: normalizarCuit(config.cuit || ""),
    ingresos_brutos: limpiarTextoMayus(config.ingresos_brutos || ""),
    condicion_iva: limpiarTextoMayus(
      config.condicion_iva || emptyForm.condicion_iva
    ),
    domicilio_comercial: limpiarTextoMayus(config.domicilio_comercial || ""),
    fecha_inicio_actividades: config.fecha_inicio_actividades || "",
    punto_venta: normalizarPuntoVenta(config.punto_venta || "00001") || "00001",
    tipo_comprobante_default: limpiarTextoMayus(
      config.tipo_comprobante_default || "FACTURA C"
    ),
    codigo_comprobante:
      normalizarCodigoComprobante(config.codigo_comprobante || "011") || "011",
    activo: Number(config.activo) === 0 ? 0 : 1,
  };
}

export default function ConfiguracionDatosLegales() {
  const navigate = useNavigate();
  const fechaInputRef = useRef(null);

  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const mostrarToast = useCallback((tipo, mensaje, duracion = 3000) => {
    setToast({ tipo, mensaje, duracion, key: Date.now() });
  }, []);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const abrirCalendarioFecha = useCallback(() => {
    const input = fechaInputRef.current;
    if (!input || saving) return;

    input.focus();

    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
      } catch {
        // Algunos navegadores pueden bloquear showPicker si no viene directo del click.
      }
    }
  }, [saving]);

  const cargar = useCallback(async () => {
    setLoading(true);

    try {
      const res = await apiFetch({ action: "config_facturacion_get" });
      const txt = await res.text();
      const data = safeJsonParse(txt);

      if (!res.ok || !data?.exito) {
        throw new Error(
          data?.mensaje || "No se pudieron cargar los datos legales."
        );
      }

      setForm(normalizarConfigDesdeApi(data.config || {}));
    } catch (err) {
      console.error("Error cargando datos legales:", err);
      mostrarToast(
        "error",
        err?.message || "Error cargando datos legales.",
        4200
      );
    } finally {
      setLoading(false);
    }
  }, [mostrarToast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    const razon = limpiarTexto(form.razon_social) || "SIN RAZÓN SOCIAL";
    const fantasia = limpiarTexto(form.nombre_fantasia) || "SIN NOMBRE FANTASÍA";
    const cuit = limpiarTexto(form.cuit) || "CUIT SIN CARGAR";

    return { razon, fantasia, cuit };
  }, [form]);

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;

    const payload = {
      ...form,
      razon_social: limpiarTextoMayus(form.razon_social),
      nombre_fantasia: limpiarTextoMayus(form.nombre_fantasia),
      cuit: limpiarTexto(form.cuit),
      ingresos_brutos: limpiarTextoMayus(form.ingresos_brutos),
      condicion_iva: limpiarTextoMayus(form.condicion_iva),
      domicilio_comercial: limpiarTextoMayus(form.domicilio_comercial),
      fecha_inicio_actividades: form.fecha_inicio_actividades || "",
      punto_venta: normalizarPuntoVenta(form.punto_venta) || "00001",
      tipo_comprobante_default:
        limpiarTextoMayus(form.tipo_comprobante_default) || "FACTURA C",
      codigo_comprobante:
        normalizarCodigoComprobante(form.codigo_comprobante) || "011",
      activo: 1,
    };

    if (!payload.razon_social) {
      mostrarToast("advertencia", "Ingresá la razón social.");
      return;
    }

    if (!payload.cuit) {
      mostrarToast("advertencia", "Ingresá el CUIT.");
      return;
    }

    if (!payload.condicion_iva) {
      mostrarToast("advertencia", "Seleccioná la condición frente al IVA.");
      return;
    }

    if (!payload.domicilio_comercial) {
      mostrarToast("advertencia", "Ingresá el domicilio comercial.");
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch(
        { action: "config_facturacion_guardar" },
        { method: "POST", body: JSON.stringify(payload) }
      );

      const txt = await res.text();
      const data = safeJsonParse(txt);

      if (!res.ok || !data?.exito) {
        throw new Error(
          data?.mensaje || "No se pudieron guardar los datos legales."
        );
      }

      setForm(normalizarConfigDesdeApi(data.config || payload));
      mostrarToast(
        "exito",
        data?.mensaje || "Datos legales guardados correctamente."
      );
    } catch (err) {
      console.error("Error guardando datos legales:", err);
      mostrarToast(
        "error",
        err?.message || "Error guardando datos legales.",
        4400
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTipoComprobante = (tipo) => {
    const tipoMayus = limpiarTextoMayus(tipo);
    const encontrado = comprobantes.find((c) => c.tipo === tipoMayus);

    setForm((prev) => ({
      ...prev,
      tipo_comprobante_default: tipoMayus,
      codigo_comprobante: encontrado?.codigo || prev.codigo_comprobante,
    }));
  };

  return (
    <section className="cfg-legal-page">
      {toast && (
        <Toast
          key={toast.key}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <div className="cfg-legal-hero">
        <div className="cfg-legal-hero__icon">
          <FontAwesomeIcon icon={faFileInvoiceDollar} />
        </div>

        <div className="cfg-legal-hero__content">
          <div className="cfg-legal-hero__eyebrow">CONFIGURACIÓN GLOBAL</div>
          <h1 className="cfg-legal-title">Datos legales</h1>
          <p className="cfg-legal-subtitle">
            Editá la información fiscal usada para comprobantes y configuración
            de facturación.
          </p>
        </div>

        <div className="cfg-legal-hero__side">
          <button
            className="cfg-legal-btn cfg-legal-btn--primary"
            type="button"
            onClick={() => navigate("/panel/configuracion")}
            disabled={saving}
          >
            <FontAwesomeIcon icon={faArrowLeft} />
            Volver
          </button>
        </div>
      </div>

      <div className="cfg-legal-grid">
        <aside className="cfg-legal-summary">
          <div className="cfg-legal-summary__icon">
            <FontAwesomeIcon icon={faBuilding} />
          </div>

          <h2>{resumen.razon}</h2>
          <p>{resumen.fantasia}</p>

          <div className="cfg-legal-summary__line">
            <span>CUIT</span>
            <strong>{resumen.cuit}</strong>
          </div>

          <div className="cfg-legal-summary__line">
            <span>Condición IVA</span>
            <strong>{form.condicion_iva || "—"}</strong>
          </div>

          <div className="cfg-legal-summary__line">
            <span>Punto de venta</span>
            <strong>{form.punto_venta || "00001"}</strong>
          </div>
        </aside>

        <div className="cfg-legal-card">
          <div className="cfg-legal-card__top">
            <div className="cfg-legal-card__icon">
              <FontAwesomeIcon icon={faIdCard} />
            </div>
            <div>
              <h2>Información fiscal</h2>
              <p>
                Estos datos se guardan en la tabla config_facturacion del tenant
                actual.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="cfg-legal-empty">Cargando datos legales...</div>
          ) : (
            <form className="cfg-legal-form" onSubmit={guardar} noValidate>
              <div className="cfg-legal-section-title">
                <FontAwesomeIcon icon={faBuilding} />
                Datos principales
              </div>

              <div className="cfg-legal-form-grid">
                <label className="cfg-legal-field cfg-legal-field--full">
                  <span>Razón social *</span>
                  <input
                    type="text"
                    value={form.razon_social || ""}
                    onChange={(e) =>
                      setField("razon_social", toMayus(e.target.value))
                    }
                    placeholder="EJ: VALVERDE FRANCO ANTONIO"
                    disabled={saving}
                  />
                </label>

                <label className="cfg-legal-field cfg-legal-field--full">
                  <span>Nombre fantasía</span>
                  <input
                    type="text"
                    value={form.nombre_fantasia || ""}
                    onChange={(e) =>
                      setField("nombre_fantasia", toMayus(e.target.value))
                    }
                    placeholder="EJ: 3 DEVS SOLUTIONS"
                    disabled={saving}
                  />
                </label>

                <label className="cfg-legal-field">
                  <span>CUIT *</span>
                  <input
                    type="text"
                    value={form.cuit || ""}
                    onChange={(e) =>
                      setField("cuit", normalizarCuit(e.target.value))
                    }
                    placeholder="EJ: 20-25752516-4"
                    disabled={saving}
                  />
                </label>

                <label className="cfg-legal-field">
                  <span>Ingresos brutos</span>
                  <input
                    type="text"
                    value={form.ingresos_brutos || ""}
                    onChange={(e) =>
                      setField("ingresos_brutos", toMayus(e.target.value))
                    }
                    placeholder="EJ: 20257525164"
                    disabled={saving}
                  />
                </label>

                <label className="cfg-legal-field">
                  <span>Condición frente al IVA *</span>
                  <select
                    value={form.condicion_iva || ""}
                    onChange={(e) =>
                      setField("condicion_iva", toMayus(e.target.value))
                    }
                    disabled={saving}
                  >
                    {condicionesIva.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  className="cfg-legal-field"
                  onClick={abrirCalendarioFecha}
                >
                  <span>Inicio de actividades</span>
                  <input
                    ref={fechaInputRef}
                    type="date"
                    value={form.fecha_inicio_actividades || ""}
                    onClick={abrirCalendarioFecha}
                    onFocus={abrirCalendarioFecha}
                    onChange={(e) =>
                      setField("fecha_inicio_actividades", e.target.value)
                    }
                    disabled={saving}
                  />
                </label>

                <label className="cfg-legal-field cfg-legal-field--full">
                  <span>Domicilio comercial *</span>
                  <input
                    type="text"
                    value={form.domicilio_comercial || ""}
                    onChange={(e) =>
                      setField("domicilio_comercial", toMayus(e.target.value))
                    }
                    placeholder="EJ: ROMA 2407 - SAN FRANCISCO, CÓRDOBA"
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="cfg-legal-section-title cfg-legal-section-title--spaced">
                <FontAwesomeIcon icon={faReceipt} />
                Comprobante por defecto
              </div>

              <div className="cfg-legal-form-grid">
                <label className="cfg-legal-field">
                  <span>Punto de venta</span>
                  <input
                    type="text"
                    value={form.punto_venta || ""}
                    onChange={(e) =>
                      setField(
                        "punto_venta",
                        e.target.value.replace(/\D/g, "").slice(0, 5)
                      )
                    }
                    onBlur={() =>
                      setField(
                        "punto_venta",
                        normalizarPuntoVenta(form.punto_venta) || "00001"
                      )
                    }
                    placeholder="00001"
                    disabled={saving}
                  />
                </label>

                <label className="cfg-legal-field">
                  <span>Tipo de comprobante</span>
                  <select
                    value={form.tipo_comprobante_default || "FACTURA C"}
                    onChange={(e) => handleTipoComprobante(e.target.value)}
                    disabled={saving}
                  >
                    {comprobantes.map((c) => (
                      <option key={c.tipo} value={c.tipo}>
                        {c.tipo}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cfg-legal-field">
                  <span>Código comprobante</span>
                  <input
                    type="text"
                    value={form.codigo_comprobante || ""}
                    onChange={(e) =>
                      setField(
                        "codigo_comprobante",
                        e.target.value.replace(/\D/g, "").slice(0, 3)
                      )
                    }
                    onBlur={() =>
                      setField(
                        "codigo_comprobante",
                        normalizarCodigoComprobante(form.codigo_comprobante) ||
                          "011"
                      )
                    }
                    placeholder="011"
                    disabled={saving}
                  />
                </label>
              </div>

              <div className="cfg-legal-actions">
                <button
                  type="button"
                  className="cfg-legal-btn cfg-legal-btn--ghost"
                  onClick={() => navigate("/panel/configuracion")}
                  disabled={saving}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="cfg-legal-btn cfg-legal-btn--save"
                  disabled={saving}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                  {saving ? "Guardando..." : "Guardar datos legales"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}