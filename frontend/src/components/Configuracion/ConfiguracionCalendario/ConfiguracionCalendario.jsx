// src/components/Configuracion/ConfiguracionCalendario/ConfiguracionCalendario.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import BASE_URL from "../../../config/config";
import { useDateRange } from "../../../context/DateRangeContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDays,
  faChevronLeft,
  faCheck,
  faSpinner,
  faCalendarWeek,
} from "@fortawesome/free-solid-svg-icons";
import Toast from "../../Global/Toast";
import "./configuracion_calendario.css";

// ─── helpers ────────────────────────────────────────────────────────────────

function getSessionKey() {
  return (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    ""
  ).trim();
}

function getTenantId() {
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null") || {};
    return (
      u?.idTenant ||
      u?.id_tenant ||
      u?.tenant_id ||
      u?.tenant?.idTenant ||
      ""
    );
  } catch {
    return "";
  }
}

async function apiFetch(params = {}, options = {}) {
  const base = String(BASE_URL || "").replace(/\/+$/, "");
  const url = new URL(`${base}/api.php`);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  });

  const sessionKey = getSessionKey();
  const headers = new Headers(options.headers || {});

  if (sessionKey) headers.set("X-Session", sessionKey);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url.toString(), { ...options, headers });
  const txt = await res.text();

  try {
    return JSON.parse(txt);
  } catch {
    throw new Error("Respuesta inválida del servidor.");
  }
}

function clampDias(value) {
  return Math.max(1, Math.min(Number(value) || 10, 365));
}

// ─── constantes de modo ──────────────────────────────────────────────────────

const MODOS = [
  {
    value: "mes_completo",
    label: "Mes completo",
    description: "Muestra desde el primer día del mes actual hasta el último.",
    icon: faCalendarDays,
  },
  {
    value: "dias_atras",
    label: "Últimos N días",
    description: "Muestra desde hoy hacia atrás la cantidad de días que elijas.",
    icon: faCalendarWeek,
  },
];

// ─── componente ─────────────────────────────────────────────────────────────

export default function ConfiguracionCalendario() {
  const navigate = useNavigate();
  const { calendarConfig, applyCalendarConfig } = useDateRange();

  const [modo, setModo] = useState(calendarConfig?.modo ?? "mes_completo");

  // Se guarda como string para permitir borrar y reescribir libremente
  const [diasAtrasInput, setDiasAtrasInput] = useState(
    String(calendarConfig?.dias_atras ?? 10)
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState(null);

  const diasAtrasNormalizado = useMemo(() => {
    const raw = String(diasAtrasInput ?? "").trim();

    if (raw === "") return 10;

    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return 10;

    return clampDias(n);
  }, [diasAtrasInput]);

  useEffect(() => {
    setModo(calendarConfig?.modo ?? "mes_completo");
    setDiasAtrasInput(String(calendarConfig?.dias_atras ?? 10));
  }, [calendarConfig]);

  const hasChanges = useMemo(() => {
    if (modo !== (calendarConfig?.modo ?? "mes_completo")) return true;

    if (
      modo === "dias_atras" &&
      diasAtrasNormalizado !== Number(calendarConfig?.dias_atras ?? 10)
    ) {
      return true;
    }

    return false;
  }, [modo, diasAtrasNormalizado, calendarConfig]);

  const showToast = useCallback((tipo, mensaje, duracion = 2500) => {
    setToast({
      id: Date.now(),
      tipo,
      mensaje,
      duracion,
    });
  }, []);

  // ── guardar ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const tenantId = getTenantId();

    if (!tenantId) {
      setErrorMsg("No se encontró el tenant. Volvé a iniciar sesión.");
      return;
    }

    const diasNum = diasAtrasNormalizado;
    const cfg = { modo, dias_atras: diasNum };

    setSaving(true);
    setErrorMsg("");
    setToast(null);

    try {
      const data = await apiFetch(
        { action: "configuracion_calendario_set", idTenant: tenantId },
        { method: "POST", body: JSON.stringify(cfg) }
      );

      if (!data?.exito) {
        throw new Error(data?.mensaje || "No se pudo guardar.");
      }

      applyCalendarConfig(cfg);
      setDiasAtrasInput(String(diasNum));

      showToast("exito", "Configuración guardada correctamente.");
    } catch (e) {
      setErrorMsg(e.message || "Error guardando la configuración.");
    } finally {
      setSaving(false);
    }
  }, [modo, diasAtrasNormalizado, applyCalendarConfig, showToast]);

  // ── input handlers ───────────────────────────────────────────────────────
  const handleDiasChange = useCallback((e) => {
    const raw = e.target.value;

    if (/^\d*$/.test(raw)) {
      setDiasAtrasInput(raw);
      setErrorMsg("");
      setToast(null);
    }
  }, []);

  const handleDiasBlur = useCallback(() => {
    setDiasAtrasInput(String(diasAtrasNormalizado));
  }, [diasAtrasNormalizado]);

  const handleModoChange = useCallback(
    (nuevoModo) => {
      setModo(nuevoModo);
      setErrorMsg("");
      setToast(null);

      if (nuevoModo === "dias_atras" && String(diasAtrasInput).trim() === "") {
        setDiasAtrasInput("10");
      }
    },
    [diasAtrasInput]
  );

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <>
      {toast && (
        <Toast
          key={toast.id}
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={() => setToast(null)}
        />
      )}

      <div className="cfgcal-page">
        <div className="cfgcal-header">
          <button
            type="button"
            className="cfgcal-backBtn"
            onClick={() => navigate("/panel/configuracion")}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Volver
          </button>

          <div className="cfgcal-headerTitle">
            <FontAwesomeIcon
              icon={faCalendarDays}
              className="cfgcal-headerIcon"
            />
            <div>
              <h1 className="cfgcal-title">Calendario global</h1>
              <p className="cfgcal-subtitle">
                Elegí cómo se carga el rango de fechas por defecto en todas las
                vistas.
              </p>
            </div>
          </div>
        </div>

        <div className="cfgcal-card">
          <div className="cfgcal-section">
            <h2 className="cfgcal-sectionTitle">Modo de visualización</h2>

            <div className="cfgcal-modos">
              {MODOS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={[
                    "cfgcal-modoBtn",
                    modo === m.value ? "cfgcal-modoBtn--active" : "",
                  ].join(" ")}
                  onClick={() => handleModoChange(m.value)}
                >
                  <div className="cfgcal-modoBtnIcon">
                    <FontAwesomeIcon icon={m.icon} />
                  </div>

                  <div className="cfgcal-modoBtnText">
                    <span className="cfgcal-modoBtnLabel">{m.label}</span>
                    <span className="cfgcal-modoBtnDesc">{m.description}</span>
                  </div>

                  {modo === m.value && (
                    <span className="cfgcal-modoBtnCheck">
                      <FontAwesomeIcon icon={faCheck} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {modo === "dias_atras" && (
            <div className="cfgcal-section cfgcal-section--dias">
              <h2 className="cfgcal-sectionTitle">¿Cuántos días hacia atrás?</h2>
              <p className="cfgcal-sectionHint">
                El rango irá desde hoy menos este valor hasta hoy (máx. 365).
              </p>

              <div className="cfgcal-diasRow">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="cfgcal-diasInput"
                  value={diasAtrasInput}
                  onChange={handleDiasChange}
                  onBlur={handleDiasBlur}
                  onFocus={(e) => e.target.select()}
                  placeholder="10"
                  aria-label="Cantidad de días hacia atrás"
                  autoComplete="off"
                />
                <span className="cfgcal-diasLabel">días</span>
              </div>

              <DiaPreview dias={diasAtrasNormalizado} />
            </div>
          )}

          {modo === "mes_completo" && <MesCompletoPreview />}

          {errorMsg && (
            <div className="cfgcal-alert cfgcal-alert--error">{errorMsg}</div>
          )}

          <div className="cfgcal-actions">
            <button
              type="button"
              className="cfgcal-saveBtn"
              disabled={saving || (!hasChanges && !errorMsg)}
              onClick={handleSave}
            >
              {saving ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Guardando…
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faCheck} />
                  Guardar configuración
                </>
              )}
            </button>

            {!hasChanges && !saving && !errorMsg && (
              <span className="cfgcal-noChanges">Sin cambios pendientes</span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── sub-componentes de preview ──────────────────────────────────────────────

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function DiaPreview({ dias }) {
  const diasNum = clampDias(dias);
  const to = new Date();
  const from = new Date();

  from.setDate(from.getDate() - diasNum);

  return (
    <div className="cfgcal-preview">
      <span className="cfgcal-previewLabel">Vista previa del rango:</span>
      <span className="cfgcal-previewRange">
        {formatDate(from)}
        <span className="cfgcal-previewArrow">→</span>
        {formatDate(to)}
      </span>
    </div>
  );
}

function MesCompletoPreview() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return (
    <div className="cfgcal-preview">
      <span className="cfgcal-previewLabel">Vista previa del rango:</span>
      <span className="cfgcal-previewRange">
        {formatDate(from)}
        <span className="cfgcal-previewArrow">→</span>
        {formatDate(to)}
      </span>
    </div>
  );
}