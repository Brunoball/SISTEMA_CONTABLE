import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Toast from "../Toast.jsx";
import "../Global_css/Global_Modals.css";
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function plusDaysISO(days = 10) {
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function onlyDigits(v) {
  return String(v ?? "").replace(/\D/g, "");
}

function sanitizeEmitter(v) {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trimStart();
}

/* =========================================================
   Importe estilo Nueva Venta
   - mientras escribe: número normal
   - al blur / Enter: agrega ,00 si hace falta
========================================================= */
function parseMoneyInputARS(v) {
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s) return 0;

  s = s.replace(/\$/g, "").replace(/\s+/g, "");

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyInputARS(v) {
  const n = safeNumber(v);
  try {
    return n.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return n.toFixed(2).replace(".", ",");
  }
}

function formatEditableMoney(v) {
  const n = safeNumber(v);
  if (n === 0) return "";
  return String(n).replace(".", ",");
}

/* =========================================================
   Modal global reusable
========================================================= */
export default function ModalNuevoCheque({
  open,
  onClose,
  onSave,
  initialData,
  tipoCheque = "cheque",
  dark = false,
  saving = false,
  onToast,
  showToast,
  verificarNumeroCheque = null,
}) {
  const isEcheq = String(tipoCheque || "").toLowerCase() === "echeq";
  const titulo = isEcheq ? "Cargar eCheq" : "Cargar Cheque";

  const emptyForm = useCallback(
    () => ({
      fecha_emision: todayISO(),
      emisor: "",
      numero_cheque: "",
      importe: 0,
      importeDraft: "",
      importeFocused: false,
      fecha_pago: plusDaysISO(10),
    }),
    []
  );

  const [form, setForm] = useState(emptyForm);
  const [archivo, setArchivo] = useState(null);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [checkingNumero, setCheckingNumero] = useState(false);
  const [toast, setToast] = useState(null);

  const [openVerComp, setOpenVerComp] = useState(false);
  const [compUrl, setCompUrl] = useState("");

  const fileInputRef = useRef(null);
  const closeBtnRef = useRef(null);
  const numeroInputRef = useRef(null);
  const prevOpenRef = useRef(false);

  const notify = useCallback(
    (tipo, mensaje, duracion = 3000) => {
      if (typeof showToast === "function") {
        showToast(tipo, mensaje, duracion);
        return;
      }
      if (typeof onToast === "function") {
        onToast(tipo, mensaje, duracion);
        return;
      }
      setToast({ tipo, mensaje, duracion });
    },
    [onToast, showToast]
  );

  const closeLocalToast = useCallback(() => setToast(null), []);

  const runNumeroCheck = useCallback(async () => {
    if (typeof verificarNumeroCheque !== "function") return true;

    const numeroCheque = onlyDigits(form.numero_cheque);
    setCheckingNumero(true);

    try {
      const result = await verificarNumeroCheque({
        numero_cheque: numeroCheque,
        tipoCheque,
        initialData,
        form: {
          ...form,
          numero_cheque: numeroCheque,
          importe: safeNumber(form.importe),
        },
      });

      if (result === true || result?.ok === true || result == null) {
        return true;
      }

      const mensaje =
        result?.mensaje ||
        "Ese número de cheque ya existe o no se pudo validar.";

      notify(result?.tipo || "error", mensaje, result?.duracion || 4200);
      numeroInputRef.current?.focus();
      return false;
    } catch (e) {
      notify(
        "error",
        e?.message || "No se pudo verificar el número del cheque.",
        4200
      );
      numeroInputRef.current?.focus();
      return false;
    } finally {
      setCheckingNumero(false);
    }
  }, [verificarNumeroCheque, form, tipoCheque, initialData, notify]);

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
        emisor: sanitizeEmitter(initialData.emisor || ""),
        numero_cheque: onlyDigits(initialData.numero_cheque || ""),
        importe: safeNumber(initialData.importe),
        importeDraft: "",
        importeFocused: false,
        fecha_pago: initialData.fecha_pago || plusDaysISO(10),
      });

      if (initialData.archivo instanceof File) {
        setArchivo(initialData.archivo);
        setArchivoNombre(
          initialData.archivo_nombre || initialData.archivo.name || ""
        );
      } else {
        setArchivo(null);
        setArchivoNombre("");
      }
    } else {
      setForm(emptyForm());
      setArchivo(null);
      setArchivoNombre("");
    }

    setCheckingNumero(false);
    setToast(null);
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

      if (!saving && !checkingNumero) onClose?.();
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, saving, checkingNumero, onClose, openVerComp]);

  useEffect(() => {
    return () => {
      if (compUrl && compUrl.startsWith("blob:")) {
        URL.revokeObjectURL(compUrl);
      }
    };
  }, [compUrl]);

  const setField = useCallback((k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
  }, []);

  const handleOpenFilePicker = useCallback(() => {
    if (saving || checkingNumero || openVerComp) return;
    fileInputRef.current?.click();
  }, [saving, checkingNumero, openVerComp]);

  const handleFileSelected = useCallback(
    (e) => {
      const file = e.target.files?.[0] || null;
      setArchivo(file);
      setArchivoNombre(file?.name || "");
      setOpenVerComp(false);

      if (compUrl && compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
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

    if (compUrl && compUrl.startsWith("blob:")) URL.revokeObjectURL(compUrl);
    setCompUrl("");

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [compUrl]);

  const handleSave = useCallback(async () => {
    if (saving || checkingNumero) return;

    if (!String(form.emisor || "").trim()) {
      notify("advertencia", "Ingresá el emisor del cheque.", 3200);
      return;
    }

    if (!onlyDigits(form.numero_cheque)) {
      notify("advertencia", "Ingresá el número de cheque.", 3200);
      numeroInputRef.current?.focus();
      return;
    }

    if (!(safeNumber(form.importe) > 0)) {
      notify("advertencia", "Ingresá un importe válido mayor a 0.", 3200);
      return;
    }

    if (!String(form.fecha_pago || "").trim()) {
      notify("advertencia", "Ingresá la fecha de pago.", 3200);
      return;
    }

    const disponible = await runNumeroCheck();
    if (!disponible) return;

    onSave?.({
      ...form,
      emisor: sanitizeEmitter(form.emisor),
      numero_cheque: onlyDigits(form.numero_cheque),
      importe: safeNumber(form.importe),
      tipo: tipoCheque,
      tipo_cheque: tipoCheque,
      archivo: archivo || null,
      archivo_nombre: archivoNombre || archivo?.name || "",
    });
  }, [
    saving,
    checkingNumero,
    form,
    tipoCheque,
    archivo,
    archivoNombre,
    onSave,
    notify,
    runNumeroCheck,
  ]);

  if (!open) return null;

  return createPortal(
    <>
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeLocalToast}
        />
      )}

      <style>{`
        .mnc-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 14px;
          align-items: start;
        }

        .mnc-left {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }

        .mnc-right {
          display: flex;
          flex-direction: column;
          gap: 10px;
          position: sticky;
          top: 0;
          min-width: 0;
        }

        .mnc-dates {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        @media (max-width: 980px) {
          .mnc-layout {
            grid-template-columns: minmax(0, 1fr) 320px;
          }
        }

        @media (max-width: 840px) {
          .mnc-layout {
            grid-template-columns: 1fr;
          }

          .mnc-right {
            position: static;
            top: auto;
          }
        }

        @media (max-width: 640px) {
          .mi-modal__content {
            padding: 12px !important;
          }

          .mnc-dates {
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
          if (e.target === e.currentTarget && !saving && !checkingNumero) {
            onClose?.();
          }
        }}
      >
        <div
          className={[
            "mi-modal__container",
            "mnc-modal-responsive",
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
              onClick={() => !saving && !checkingNumero && onClose?.()}
              aria-label="Cerrar"
              disabled={saving || checkingNumero}
              type="button"
            >
              ✕
            </button>
          </div>

          <div
            className="mi-modal__content"
            style={{ overflowY: "auto", padding: "14px" }}
          >
            <div className="mnc-layout">
              <div className="mnc-left">
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
                        onChange={(e) => setField("emisor", sanitizeEmitter(e.target.value))}
                        disabled={saving || checkingNumero}
                        autoComplete="off"
                      />
                      <label className="nc-label">Emisor / Banco *</label>
                    </div>

                    <div className="nc-field">
                      <input
                        ref={numeroInputRef}
                        className="nc-input"
                        type="text"
                        placeholder=" "
                        value={form.numero_cheque}
                        onChange={(e) => setField("numero_cheque", onlyDigits(e.target.value))}
                        disabled={saving || checkingNumero}
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
                        placeholder="0,00"
                        value={
                          form.importeFocused
                            ? form.importeDraft ?? ""
                            : formatMoneyInputARS(form.importe)
                        }
                        onFocus={(e) => {
                          if (saving || checkingNumero) return;
                          setForm((prev) => ({
                            ...prev,
                            importeFocused: true,
                            importeDraft: formatEditableMoney(prev.importe),
                          }));
                          setTimeout(() => e.target.select(), 0);
                        }}
                        onChange={(e) => {
                          const c = e.target.value.replace(/[^\d,.\-]/g, "");
                          setForm((prev) => ({
                            ...prev,
                            importeDraft: c,
                            importe: parseMoneyInputARS(c),
                          }));
                        }}
                        onBlur={() => {
                          setForm((prev) => {
                            const importeParseado = parseMoneyInputARS(prev.importeDraft);
                            return {
                              ...prev,
                              importe: importeParseado,
                              importeDraft: "",
                              importeFocused: false,
                            };
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        disabled={saving || checkingNumero}
                        inputMode="decimal"
                        autoComplete="off"
                      />
                      <label className="nc-label">
                        Importe *
                      </label>
                    </div>

                    <div className="mnc-dates">
                      <div className="nc-field">
                        <input
                          className="nc-input"
                          type="date"
                          placeholder=" "
                          value={form.fecha_emision}
                          onChange={(e) => setField("fecha_emision", e.target.value)}
                          disabled={saving || checkingNumero}
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
                          disabled={saving || checkingNumero}
                        />
                        <label className="nc-label">Fecha de pago *</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mnc-right">
                <div className="nc-section">
                  <div className="nc-section-head">
                    <div className="nc-section-dot" style={{ background: "#64748b" }} />
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
                        <div className={`mi-uploadFile${archivo ? " is-filled" : " is-empty"}`}>
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
                                  disabled={saving || checkingNumero}
                                  title="Ver comprobante"
                                >
                                  <FontAwesomeIcon icon={faEye} />
                                </button>

                                <button
                                  type="button"
                                  className="mi-uploadBar__btn mi-uploadBar__btn--ghost"
                                  onClick={handleQuitarArchivo}
                                  disabled={saving || checkingNumero || openVerComp}
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
                            disabled={saving || checkingNumero}
                            style={{ display: "none" }}
                          />

                          <button
                            type="button"
                            className="mi-uploadBar__btn mi-uploadBar__btn--primary"
                            onClick={handleOpenFilePicker}
                            disabled={saving || checkingNumero}
                          >
                            <FontAwesomeIcon icon={faUpload} />{" "}
                            {archivo ? "Reemplazar archivo" : "Seleccionar archivo"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="nc-actions" style={{ padding: 0 }}>
                  <button
                    type="button"
                    className="mit-btn mit-btn--solid mit-btn--block"
                    onClick={handleSave}
                    disabled={saving || checkingNumero}
                  >
                    {checkingNumero
                      ? "Verificando..."
                      : saving
                      ? "Guardando..."
                      : `Confirmar ${isEcheq ? "eCheq" : "cheque"}`}
                  </button>

                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost mit-btn--block"
                    onClick={() => !saving && !checkingNumero && onClose?.()}
                    disabled={saving || checkingNumero}
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
              {archivo?.name || "Comprobante"}
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