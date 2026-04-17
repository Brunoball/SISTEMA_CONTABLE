import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileInvoiceDollar,
  faUpload,
  faTrash,
  faEye,
  faMoneyCheckDollar,
} from "@fortawesome/free-solid-svg-icons";

/* =========================================================
   Helpers
========================================================= */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function plusDaysISO(days = 10) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

function onlyMoney(value) {
  let clean = String(value ?? "").replace(/[^\d,.-]/g, "");
  clean = clean.replace(/(?!^)-/g, "");

  const partsComma = clean.split(",");
  if (partsComma.length > 2) {
    clean = partsComma[0] + "," + partsComma.slice(1).join("");
  }

  const partsDot = clean.split(".");
  if (partsDot.length > 2) {
    clean = partsDot[0] + "." + partsDot.slice(1).join("");
  }

  return clean;
}

function parseMoney(v) {
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/\$/g, "").replace(/\s+/g, "");
  s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function onlyTextUpper(value) {
  return String(value ?? "")
    .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .toUpperCase();
}

/* =========================================================
   Subcomponente: tarjeta de previsualización de cheque
========================================================= */
function ChequePreview({ datos, tipo }) {
  const isEcheq = String(tipo || "").toLowerCase() === "echeq";
  const importe = safeNumber(datos?.importe);
  const numero = String(datos?.numero_cheque || "").trim();
  const emisor = String(datos?.emisor || "").trim();
  const fechaEmision = String(datos?.fecha_emision || "").trim();
  const fechaPago = String(datos?.fecha_pago || "").trim();
  const obs = String(datos?.observaciones || "").trim();

  if (!numero && !emisor && !(importe > 0)) return null;

  return (
    <div
      className={[
        "cheque-card",
        isEcheq ? "cheque-card--echeq" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ cursor: "default", width: "100%" }}
      tabIndex={-1}
    >
      <div className="cheque-card__header">
        <div className="cheque-card__header-dots" />
        <div className="cheque-card__slash" />
        <div className="cheque-card__brand">
          <div className="cheque-card__logo-icon">
            <FontAwesomeIcon icon={faMoneyCheckDollar} style={{ fontSize: 14 }} />
          </div>
          <div>
            <div className="cheque-card__bank-name">
              {emisor || (isEcheq ? "eCheq" : "Cheque")}
            </div>
            <div className="cheque-card__bank-sub">
              {isEcheq ? "Cheque Electrónico" : "Cheque de Papel"}
            </div>
          </div>
        </div>
        <div className="cheque-card__header-right">
          <div className="cheque-card__num-label">N°</div>
          <div className="cheque-card__num-value">
            {numero ? numero.slice(-6).padStart(6, "·") : "······"}
          </div>
        </div>
      </div>

      <div className="cheque-card__body">
        <div className="cheque-card__row cheque-card__row--spaced">
          <div className="cheque-card__field cheque-card__field--wide">
            <div className="cheque-card__field-label">Emisor</div>
            <div
              className={[
                "cheque-card__field-line",
                !emisor ? "cheque-card__field-empty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {emisor || "—"}
            </div>
          </div>

          <div className="cheque-card__field">
            <div className="cheque-card__field-label">N° Cheque</div>
            <div
              className={[
                "cheque-card__field-line",
                "cheque-card__field-line--mono",
                !numero ? "cheque-card__field-empty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {numero || "—"}
            </div>
          </div>
        </div>

        <div className="cheque-card__row cheque-card__row--spaced">
          <div className="cheque-card__field">
            <div className="cheque-card__field-label">Emisión</div>
            <div
              className={[
                "cheque-card__field-line",
                !fechaEmision ? "cheque-card__field-empty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {fechaEmision || "—"}
            </div>
          </div>

          <div className="cheque-card__field">
            <div className="cheque-card__field-label">Fecha pago</div>
            <div
              className={[
                "cheque-card__field-line",
                !fechaPago ? "cheque-card__field-empty" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {fechaPago || "—"}
            </div>
          </div>

          <div className="cheque-card__field">
            <div className="cheque-card__field-label">Importe</div>
            <div className="cheque-card__importe-box">
              <div className="cheque-card__importe-symbol">$</div>
              <div className="cheque-card__importe-value">
                {importe > 0
                  ? importe.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "0,00"}
              </div>
            </div>
          </div>
        </div>

        {obs && (
          <div className="cheque-card__row">
            <div className="cheque-card__field cheque-card__field--wide">
              <div className="cheque-card__field-label">Observaciones</div>
              <div className="cheque-card__field-line">{obs}</div>
            </div>
          </div>
        )}
      </div>

      <div className="cheque-card__micr">
        <div className="cheque-card__micr-accent" />
        <span className="cheque-card__micr-text">
          {isEcheq ? "⟨ECHEQ⟩" : "⟨CHEQUE⟩"}{" "}
          {numero ? `⟨${numero}⟩` : "⟨······⟩"}{" "}
          {emisor ? `⟨${emisor.slice(0, 12).toUpperCase()}⟩` : "⟨·······⟩"}
        </span>
        <div className="cheque-card__security">
          <span>✓</span>
          <span>{isEcheq ? "DIGITAL" : "FÍSICO"}</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   MODAL PRINCIPAL
========================================================= */
export default function ModalNuevoCheque({
  open,
  onClose,
  onSave,
  initialData,
  tipoCheque = "cheque",
  dark = false,
  saving = false,
}) {
  const isEcheq = String(tipoCheque || "").toLowerCase() === "echeq";
  const titulo = isEcheq ? "Cargar eCheq" : "Cargar Cheque";

  const emptyForm = useCallback(() => {
    return {
      fecha_emision: todayISO(),
      emisor: "",
      numero_cheque: "",
      importe: "",
      fecha_pago: plusDaysISO(10),
      observaciones: "",
    };
  }, []);

  const [form, setForm] = useState(emptyForm);
  const [archivo, setArchivo] = useState(null);
  const [archivoNombre, setArchivoNombre] = useState("");

  const [openVerComp, setOpenVerComp] = useState(false);
  const [compUrl, setCompUrl] = useState("");

  const fileInputRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open || wasOpen) return;

    if (initialData) {
      setForm({
        fecha_emision: initialData.fecha_emision || todayISO(),
        emisor: onlyTextUpper(initialData.emisor || ""),
        numero_cheque: onlyDigits(initialData.numero_cheque || ""),
        importe:
          initialData.importe != null && initialData.importe !== ""
            ? String(initialData.importe).replace(".", ",")
            : "",
        fecha_pago: initialData.fecha_pago || plusDaysISO(10),
        observaciones: initialData.observaciones || "",
      });

      if (initialData.archivo instanceof File) {
        setArchivo(initialData.archivo);
        setArchivoNombre(
          initialData.archivo_nombre || initialData.archivo.name || ""
        );
      } else {
        setArchivo(null);
        setArchivoNombre(
          initialData.archivo_nombre ||
            initialData.archivoName ||
            ""
        );
      }
    } else {
      setForm(emptyForm());
      setArchivo(null);
      setArchivoNombre("");
    }

    setOpenVerComp(false);
    setCompUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, [open, initialData, emptyForm]);

  useEffect(() => {
    if (!open) return;

    const handler = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();

      if (openVerComp) {
        setOpenVerComp(false);
        return;
      }

      if (!saving) onClose?.();
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, saving, onClose, openVerComp]);

  useEffect(() => {
    return () => {
      if (compUrl && compUrl.startsWith("blob:")) {
        URL.revokeObjectURL(compUrl);
      }
    };
  }, [compUrl]);

  const previewData = useMemo(
    () => ({
      ...form,
      importe: parseMoney(form.importe),
    }),
    [form]
  );

  const setField = useCallback((k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  }, []);

  const handleOpenFilePicker = useCallback(() => {
    if (saving || openVerComp) return;
    fileInputRef.current?.click();
  }, [saving, openVerComp]);

  const handleFileSelected = useCallback(
    (e) => {
      const file = e.target.files?.[0] || null;
      setArchivo(file);
      setArchivoNombre(file?.name || "");
      setOpenVerComp(false);

      if (compUrl && compUrl.startsWith("blob:")) {
        URL.revokeObjectURL(compUrl);
      }
      setCompUrl("");
    },
    [compUrl]
  );

  const handleOpenVerComprobante = useCallback(() => {
    if (!archivo) return;
    const url = URL.createObjectURL(archivo);
    setCompUrl(url);
    setOpenVerComp(true);
  }, [archivo]);

  const handleQuitarArchivo = useCallback(() => {
    setArchivo(null);
    setArchivoNombre("");
    setOpenVerComp(false);

    if (compUrl && compUrl.startsWith("blob:")) {
      URL.revokeObjectURL(compUrl);
    }
    setCompUrl("");

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [compUrl]);

  const handleSave = useCallback(() => {
    if (saving) return;

    onSave?.({
      ...form,
      emisor: String(form.emisor || "").trim().toUpperCase(),
      numero_cheque: onlyDigits(form.numero_cheque),
      importe: parseMoney(form.importe),
      tipo: tipoCheque,
      tipo_cheque: tipoCheque,
      archivo: archivo || null,
      archivo_nombre: archivoNombre || archivo?.name || "",
    });
  }, [saving, onSave, form, tipoCheque, archivo, archivoNombre]);

  if (!open) return null;

  return createPortal(
    <>
      <style>{`
        .mnc3-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 14px;
          align-items: start;
        }

        .mnc3-left {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }

        .mnc3-right {
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: sticky;
          top: 0;
          min-width: 0;
        }

        .mnc3-dates {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        @media (max-width: 980px) {
          .mnc3-layout {
            grid-template-columns: minmax(0, 1fr) 320px;
          }
        }

        @media (max-width: 840px) {
          .mnc3-layout {
            grid-template-columns: 1fr;
          }

          .mnc3-right {
            position: static;
            top: auto;
          }
        }

        @media (max-width: 640px) {


          .mi-modal__content {
            padding: 12px !important;
          }

          .mnc3-dates {
            grid-template-columns: 1fr;
          }

          .mi-modal__header {
            gap: 10px;
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .mi-modal__head-left {
            min-width: 0;
            flex: 1;
          }

          .mi-modal__title {
            word-break: break-word;
          }

          .nc-actions {
            display: flex;
            gap: 8px;
          }

          .mit-btn.mit-btn--block {
            width: 100%;
          }

          .mi-uploadFile {
            flex-wrap: wrap;
            align-items: flex-start;
          }

          .mi-uploadFile__meta {
            min-width: 0;
            flex: 1;
          }
        }
      `}</style>

      <div
        className="mp-modal__overlay"
        style={{ zIndex: 9999999999 + 10 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !saving) onClose?.();
        }}
      >
        <div
          className={[
            "mi-modal__container",
            "mnc3-modal-responsive",
            dark ? "mi-modal--dark" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            width: "min(980px, 96vw)",
            maxHeight: "92vh",
            minHeight: "auto",
            display: "flex",
            flexDirection: "column",
            animation: "mp-modal-pop .2s cubic-bezier(.34,1.56,.64,1)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mi-modal__header">
            <div className="mi-modal__head-icon" aria-hidden="true">
              <FontAwesomeIcon icon={faMoneyCheckDollar} />
            </div>

            <div className="mi-modal__head-left">
              <h2 className="mi-modal__title">{titulo}</h2>
              <p className="mi-modal__subtitle">
                Completá los datos del {isEcheq ? "cheque electrónico" : "cheque"} recibido
              </p>
            </div>

            <button
              ref={closeBtnRef}
              className="mi-modal__close"
              onClick={() => !saving && onClose?.()}
              aria-label="Cerrar"
              disabled={saving}
              type="button"
            >
              ✕
            </button>
          </div>

          <div
            className="mi-modal__content"
            style={{ overflowY: "auto", padding: "14px" }}
          >
            <div className="mnc3-layout">
              {/* IZQUIERDA */}
              <div className="mnc3-left">
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" />
                    <span>Datos del {isEcheq ? "eCheq" : "cheque"}</span>
                  </div>

                  <div className="nc-section-body">
                    <div className="nc-field">
                      <input
                        className="nc-input"
                        type="text"
                        placeholder=" "
                        value={form.emisor}
                        onChange={(e) => setField("emisor", onlyTextUpper(e.target.value))}
                        disabled={saving}
                        autoComplete="off"
                      />
                      <label className="nc-label">Emisor / Banco *</label>
                    </div>

                    <div className="nc-field">
                      <input
                        className="nc-input"
                        type="text"
                        placeholder=" "
                        value={form.numero_cheque}
                        onChange={(e) => setField("numero_cheque", onlyDigits(e.target.value))}
                        disabled={saving}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <label className="nc-label">
                        N° de {isEcheq ? "eCheq" : "cheque"} *
                      </label>
                    </div>

                    <div className="nc-field">
                      <input
                        className="nc-input"
                        type="text"
                        placeholder=" "
                        value={form.importe}
                        onChange={(e) => setField("importe", onlyMoney(e.target.value))}
                        disabled={saving}
                        inputMode="decimal"
                        autoComplete="off"
                      />
                      <label className="nc-label">Importe *</label>
                    </div>

                    <div className="mnc3-dates">
                      <div className="nc-field">
                        <input
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={form.fecha_emision}
                          onChange={(e) => setField("fecha_emision", e.target.value)}
                          disabled={saving}
                        />
                        <label className="nc-label">Fecha emisión</label>
                      </div>

                      <div className="nc-field">
                        <input
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={form.fecha_pago}
                          onChange={(e) => setField("fecha_pago", e.target.value)}
                          disabled={saving}
                        />
                        <label className="nc-label">Fecha de pago *</label>
                      </div>
                    </div>

                    <div className="nc-field">
                      <input
                        className="nc-input"
                        type="text"
                        placeholder=" "
                        value={form.observaciones}
                        onChange={(e) => setField("observaciones", e.target.value)}
                        disabled={saving}
                        autoComplete="off"
                      />
                      <label className="nc-label">Observaciones</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* DERECHA */}
              <div className="mnc3-right">
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div
                      className="nc-section-dot"
                      style={{ background: "#64748b" }}
                    />
                    <span>Comprobante adjunto</span>
                  </div>

                  <div className="nc-section-body">
                    <div className="mi-uploadCard">
                      <div className="mi-uploadCard__head">
                        <div className="mi-uploadCard__title">
                          Imagen / PDF del {isEcheq ? "eCheq" : "cheque"}
                        </div>
                        <div className="mi-uploadCard__sub">
                          Seleccioná, visualizá o quitá el archivo antes de guardar
                        </div>
                      </div>

                      <div className="mi-uploadCard__body">
                        <div
                          className={`mi-uploadFile${archivo ? " is-filled" : " is-empty"}`}
                        >
                          {archivo ? (
                            <>
                              <div className="mi-uploadFile__icon">
                                <FontAwesomeIcon icon={faFileInvoiceDollar} />
                              </div>

                              <div className="mi-uploadFile__meta">
                                <div className="mi-uploadFile__name" title={archivo.name}>
                                  {archivo.name}
                                </div>
                                <div className="mi-uploadFile__size">
                                  {Math.max(1, Math.round((archivo.size || 0) / 1024))} KB
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  marginLeft: "auto",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={handleOpenVerComprobante}
                                  disabled={saving}
                                  title="Ver comprobante"
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                </button>

                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={handleQuitarArchivo}
                                  disabled={saving || openVerComp}
                                  title="Quitar archivo"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="mi-uploadFile__empty">
                              No hay comprobante seleccionado
                            </div>
                          )}
                        </div>

                        <div className="mi-uploadBar" style={{ marginTop: 10 }}>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.pdf"
                            className="mi-uploadBar__input"
                            onChange={handleFileSelected}
                            disabled={saving}
                            style={{ display: "none" }}
                          />

                          <button
                            type="button"
                            className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                            onClick={handleOpenFilePicker}
                            disabled={saving}
                          >
                            <FontAwesomeIcon icon={faUpload} />{" "}
                            {archivo ? "Reemplazar archivo" : "Seleccionar archivo"}
                          </button>
                        </div>

                        {archivoNombre && !archivo && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              opacity: 0.75,
                              wordBreak: "break-word",
                            }}
                            title={archivoNombre}
                          >
                            Archivo actual: {archivoNombre}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="nc-actions" style={{ padding: 0 }}>
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mit-btn--block"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving
                      ? "Guardando..."
                      : `Confirmar ${isEcheq ? "eCheq" : "cheque"}`}
                  </button>

                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost mit-btn--block"
                    onClick={() => !saving && onClose?.()}
                    disabled={saving}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {openVerComp && compUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.82)",
            zIndex: 9999999999 + 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setOpenVerComp(false);
              if (compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
              setCompUrl("");
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 860,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
              padding: "0 4px",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                color: "rgba(255,255,255,.85)",
                fontSize: 13,
                fontWeight: 600,
                minWidth: 0,
                wordBreak: "break-word",
              }}
            >
              {archivo?.name || archivoNombre || "Comprobante"}
            </span>

            <button
              type="button"
              onClick={() => {
                setOpenVerComp(false);
                if (compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
                setCompUrl("");
              }}
              style={{
                appearance: "none",
                border: "1px solid rgba(255,255,255,.25)",
                background: "rgba(255,255,255,.10)",
                color: "#fff",
                borderRadius: 8,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Cerrar ✕
            </button>
          </div>

          <div
            style={{
              width: "100%",
              maxWidth: 860,
              flex: 1,
              minHeight: 0,
              borderRadius: 12,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            {archivo?.type?.startsWith("image/") ? (
              <img
                src={compUrl}
                alt="Comprobante"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <iframe
                src={compUrl}
                title="Comprobante"
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            )}
          </div>
        </div>
      )}
    </>,
    document.body
  );
}