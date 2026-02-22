import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaSearch, FaCheck, FaTimes } from "react-icons/fa";

const DOC_TIPOS = [
  { id: 80, label: "CUIT (80)" },
  { id: 96, label: "DNI (96)" },
];

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function safeStr(x) {
  return String(x ?? "").trim();
}

/**
 * Modal #0 (previo):
 * - Pide CUIT/DNI
 * - Si CUIT => consulta padrón ARCA (op=padron_cuit)
 * - Muestra resumen
 * - "Usar estos datos" devuelve al padre:
 *    { doc_tipo, doc_nro, razon_social, cond_iva, domicilio, raw }
 */
export default function ModalFacturaBuscarCliente({
  open,
  onClose,
  apiBase,
  action = "movimientos",
  initialDocTipo = 80,
  initialDocNro = "",
  onSelect, // (clienteFactLike) => void
}) {
  const [docTipo, setDocTipo] = useState(Number(initialDocTipo) || 80);
  const [docNro, setDocNro] = useState(onlyDigits(initialDocNro));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState(null); // { summary, raw }

  const firstRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(false);
    setResult(null);
    setDocTipo(Number(initialDocTipo) || 80);
    setDocNro(onlyDigits(initialDocNro));
    setTimeout(() => firstRef.current?.focus?.(), 0);
  }, [open, initialDocTipo, initialDocNro]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fetchJSON = useCallback(async (url, opts) => {
    const res = await fetch(url, opts);
    const raw = await res.text();
    const trimmed = (raw || "").trim();

    if (trimmed.startsWith("<")) throw new Error("Backend devolvió HTML (error PHP).");

    let j = null;
    try {
      j = trimmed ? JSON.parse(trimmed) : null;
    } catch {
      j = null;
    }

    const pickErr = () => j?.mensaje || j?.error || j?.message || j?.detail || "";

    if (!res.ok) throw new Error(pickErr() || `HTTP ${res.status}`);
    if (j && typeof j === "object" && j.exito === false) throw new Error(pickErr() || "Error servidor (exito=false)");
    if (j == null) throw new Error("Respuesta inválida (no JSON)");
    return j;
  }, []);

  const validar = useCallback(() => {
    const doc = onlyDigits(docNro);

    if (!doc) return { ok: false, msg: "Ingresá documento (solo números)." };

    if (Number(docTipo) === 96) {
      if (!(doc.length === 7 || doc.length === 8)) return { ok: false, msg: "DNI inválido (7 u 8 dígitos)." };
      // DNI: no lo consultamos por padrón A5 (es por CUIT/CUIL).
      return { ok: true, mode: "dni", doc };
    }

    if (Number(docTipo) === 80) {
      if (doc.length !== 11) return { ok: false, msg: "CUIT inválido (11 dígitos, sin guiones)." };
      return { ok: true, mode: "cuit", doc };
    }

    return { ok: false, msg: "Tipo de documento inválido." };
  }, [docNro, docTipo]);

  const buscar = useCallback(async () => {
    setError("");
    setResult(null);

    const v = validar();
    if (!v.ok) return setError(v.msg);

    // DNI: no consultamos ARCA por padrón A5 (evitamos confusiones)
    if (v.mode === "dni") {
      setResult({
        summary: {
          cuit: null,
          razon_social: null,
          nombre: null,
          apellido: null,
          domicilio: null,
          iva: null,
          nota: "DNI no se consulta por padrón A5. Podés continuar con DNI y completar datos manuales.",
        },
        raw: null,
      });
      return;
    }

    // CUIT => consulta padrón
    setLoading(true);
    try {
      const url = `${apiBase}?action=${action}&op=padron_cuit&cuit=${encodeURIComponent(v.doc)}`;
      const j = await fetchJSON(url, { method: "GET", headers: { Accept: "application/json" } });

      // backend devuelve { ok:true, data:{ summary, raw } } (según el PHP que te pasé)
      const data = j?.data ?? j;

      const summary = data?.summary ?? data?.data?.summary ?? null;
      const raw = data?.raw ?? data?.data?.raw ?? null;

      if (!summary) throw new Error("ARCA: respuesta sin 'summary'.");

      setResult({ summary, raw });
    } catch (e) {
      setError(e?.message || "No se pudo consultar el padrón.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, action, validar, fetchJSON]);

  const usarDatos = useCallback(() => {
    setError("");

    const v = validar();
    if (!v.ok) return setError(v.msg);

    const doc = onlyDigits(docNro);

    // Armamos un objeto compatible con tu clienteFact
    const s = result?.summary || {};
    const razonSocial = safeStr(s?.razon_social) || safeStr(s?.nombre ? `${s?.apellido || ""} ${s?.nombre}` : "") || "";

    const payload = {
      doc_tipo: Number(docTipo),
      doc_nro: doc,

      // campos típicos para mostrar / guardar
      razon_social: razonSocial || null,
      cond_iva: safeStr(s?.iva) || null,
      domicilio: safeStr(s?.domicilio) || null,

      // extra: por si querés guardarlo
      arca_raw: result?.raw ?? null,
    };

    onSelect?.(payload);
    onClose?.();
  }, [docNro, docTipo, onClose, onSelect, result, validar]);

  if (!open) return null;

  const s = result?.summary || null;

  return (
    <div className="mi-modal__overlay" onClick={(e) => e.target.classList.contains("mi-modal__overlay") && onClose?.()}>
      <div className="mi-modal__container" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="mi-modal__header">
          <div className="mi-modal__head-left">
            <h2 className="mi-modal__title">Buscar cliente en ARCA</h2>
            <p className="mi-modal__subtitle">Ingresá CUIT (recomendado) o DNI para pre-cargar datos.</p>
          </div>

          <button className="mi-modal__close" onClick={onClose} aria-label="Cerrar" type="button">
            <FaTimes />
          </button>
        </div>

        <div className="mit-modal__body">
          {error && (
            <div className="arca-alert arca-alert--error" role="alert">
              {error}
            </div>
          )}

          <div className="mi-grid">
            <article className="mi-card mi-card--full">
              <h3 className="mi-card__title">Documento</h3>

              <div className="fl-grid">
                <div className="fl-field">
                  <select
                    className="fl-input fl-select"
                    value={docTipo}
                    onChange={(e) => {
                      setDocTipo(Number(e.target.value));
                      setError("");
                      setResult(null);
                    }}
                    ref={firstRef}
                    disabled={loading}
                  >
                    {DOC_TIPOS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <label className="fl-label">Tipo doc</label>
                </div>

                <div className="fl-field">
                  <input
                    className="fl-input"
                    placeholder=" "
                    value={docNro}
                    onChange={(e) => {
                      setDocNro(onlyDigits(e.target.value));
                      setError("");
                      setResult(null);
                    }}
                    inputMode="numeric"
                    disabled={loading}
                  />
                  <label className="fl-label">Nro doc *</label>
                </div>

                <div className="fl-field fl-col-full">
                  <button type="button" className="mit-btn mit-btn--solid" onClick={buscar} disabled={loading}>
                    {loading ? "Buscando..." : <>Buscar <FaSearch style={{ marginLeft: 8 }} /></>}
                  </button>
                </div>
              </div>

              {s ? (
                <div className="arca-alert arca-alert--info" style={{ marginTop: 10 }}>
                  <div className="arca-alert__title">
                    <strong>Resultado</strong>
                  </div>

                  {s?.nota ? <div className="arca-mini" style={{ marginBottom: 8 }}>{s.nota}</div> : null}

                  <div className="arca-resumen arca-resumen--2col">
                    <div className="arca-row"><b>CUIT:</b><span>{s.cuit || onlyDigits(docNro) || "—"}</span></div>
                    <div className="arca-row"><b>IVA:</b><span>{s.iva || "—"}</span></div>

                    <div className="arca-row"><b>Razón social:</b><span>{s.razon_social || "—"}</span></div>
                    <div className="arca-row"><b>Nombre:</b><span>{[s.apellido, s.nombre].filter(Boolean).join(" ") || "—"}</span></div>

                    <div className="arca-row arca-row--full"><b>Domicilio:</b><span>{s.domicilio || "—"}</span></div>
                  </div>

                  <div className="arca-mini" style={{ marginTop: 8 }}>
                    Si ARCA no devuelve algo, igual podés continuar y completar manual.
                  </div>
                </div>
              ) : (
                <div className="arca-mini" style={{ marginTop: 10 }}>
                  Tip: Para consulta automática, usá <b>CUIT</b>. DNI no se resuelve por padrón A5.
                </div>
              )}
            </article>
          </div>

          <div className="mit-actions">
            <button type="button" className="mit-btn mit-btn--ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              onClick={usarDatos}
              disabled={loading || !onlyDigits(docNro)}
            >
              Usar estos datos <FaCheck style={{ marginLeft: 8 }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}