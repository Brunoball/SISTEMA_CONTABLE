import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function moneyARSInput(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return "";
  return String(n).replace(".", ",");
}

function parseMoney(v) {
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/\$/g, "").replace(/\s+/g, "");
  s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isAllowedFile(file) {
  if (!file) return false;

  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
  ];

  const allowedExtensions = [
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
  ];

  const fileName = String(file.name || "").toLowerCase();
  const mimeType = String(file.type || "").toLowerCase();

  if (allowedMimeTypes.includes(mimeType)) return true;
  return allowedExtensions.some((ext) => fileName.endsWith(ext));
}

function onlyTextUpper(value) {
  return String(value ?? "")
    .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .toUpperCase();
}

function onlyNumbers(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function onlyMoney(value) {
  let clean = String(value ?? "").replace(/[^\d,.-]/g, "");

  clean = clean.replace(/(?!^)-/g, "");

  const commaCount = (clean.match(/,/g) || []).length;
  if (commaCount > 1) {
    const firstComma = clean.indexOf(",");
    clean =
      clean.slice(0, firstComma + 1) +
      clean.slice(firstComma + 1).replace(/,/g, "");
  }

  const dotCount = (clean.match(/\./g) || []).length;
  if (dotCount > 1) {
    const firstDot = clean.indexOf(".");
    clean =
      clean.slice(0, firstDot + 1) +
      clean.slice(firstDot + 1).replace(/\./g, "");
  }

  return clean;
}

export default function ModalNuevoChequeRecibo({
  open,
  onClose,
  onSave,
  initialData,
  tipoCheque = "cheque",
  dark = false,
  saving = false,
}) {
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    fecha_emision: todayISO(),
    emisor: "",
    numero_cheque: "",
    importe: "",
    fecha_pago: todayISO(),
  });

  const [archivo, setArchivo] = useState(null);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [errorArchivo, setErrorArchivo] = useState("");

  const openNativeDatePicker = (e) => {
    const input = e.currentTarget;
    try {
      input.showPicker?.();
    } catch {}
  };

  useEffect(() => {
    if (!open) return;

    setForm({
      fecha_emision: initialData?.fecha_emision || todayISO(),
      emisor: onlyTextUpper(initialData?.emisor || ""),
      numero_cheque: onlyNumbers(initialData?.numero_cheque || ""),
      importe:
        initialData?.importe != null && initialData?.importe !== ""
          ? moneyARSInput(initialData.importe)
          : "",
      fecha_pago: initialData?.fecha_pago || todayISO(),
    });

    setArchivo(initialData?.archivo || null);
    setArchivoNombre(
      initialData?.archivo_nombre ||
        initialData?.archivo?.name ||
        initialData?.archivoName ||
        ""
    );
    setErrorArchivo("");
  }, [open, initialData]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape" && !saving) onClose?.();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose, saving]);

  const titulo = useMemo(() => {
    return tipoCheque === "echeq" ? "Nuevo Echeq" : "Nuevo Cheque";
  }, [tipoCheque]);

  if (!open) return null;

  return createPortal(
    <div className="mi-mini__overlay">
      <div
        className={["mi-mini__modal", dark ? "mi-modal--dark" : ""].join(" ").trim()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(760px, 94vw)" }}
      >
        <div className="mi-mini__head">
          <h4 className="mi-mini__title">{titulo}</h4>
          <button
            type="button"
            className="mi-mini__close"
            onClick={() => (!saving ? onClose?.() : null)}
            disabled={saving}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mi-mini__body">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div className="fl-field">
              <input
                className="fl-input"
                type="date"
                placeholder=" "
                value={form.fecha_emision}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fecha_emision: e.target.value }))
                }
                onClick={openNativeDatePicker}
                onFocus={openNativeDatePicker}
                disabled={saving}
              />
              <label className="fl-label">Fecha de emisión *</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                placeholder=" "
                value={form.emisor}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    emisor: onlyTextUpper(e.target.value),
                  }))
                }
                onKeyDown={(e) => {
                  const permitidas = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Tab",
                    "Home",
                    "End",
                    "Enter",
                  ];

                  if (permitidas.includes(e.key) || e.ctrlKey || e.metaKey) return;

                  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]$/.test(e.key)) {
                    e.preventDefault();
                  }
                }}
                disabled={saving}
                style={{ textTransform: "uppercase" }}
              />
              <label className="fl-label">Emisor *</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                placeholder=" "
                value={form.numero_cheque}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    numero_cheque: onlyNumbers(e.target.value),
                  }))
                }
                onKeyDown={(e) => {
                  const permitidas = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Tab",
                    "Home",
                    "End",
                    "Enter",
                  ];

                  if (permitidas.includes(e.key) || e.ctrlKey || e.metaKey) return;
                  if (!/^\d$/.test(e.key)) e.preventDefault();
                }}
                inputMode="numeric"
                disabled={saving}
              />
              <label className="fl-label">
                {tipoCheque === "echeq" ? "N° de Echeq *" : "N° de cheque *"}
              </label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                placeholder=" "
                value={form.importe}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    importe: onlyMoney(e.target.value),
                  }))
                }
                onKeyDown={(e) => {
                  const permitidas = [
                    "Backspace",
                    "Delete",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Tab",
                    "Home",
                    "End",
                    "Enter",
                  ];

                  if (permitidas.includes(e.key) || e.ctrlKey || e.metaKey) return;
                  if (!/[\d,.-]/.test(e.key)) e.preventDefault();
                }}
                inputMode="decimal"
                disabled={saving}
              />
              <label className="fl-label">Importe *</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                type="date"
                placeholder=" "
                value={form.fecha_pago}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fecha_pago: e.target.value }))
                }
                onClick={openNativeDatePicker}
                onFocus={openNativeDatePicker}
                disabled={saving}
              />
              <label className="fl-label">Fecha de pago *</label>
            </div>

            <div className="fl-field" style={{ gridColumn: "1 / -1" }}>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.heic,.heif"
                style={{ display: "none" }}
                disabled={saving}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;

                  if (!f) {
                    setArchivo(null);
                    setArchivoNombre("");
                    setErrorArchivo("");
                    return;
                  }

                  if (!isAllowedFile(f)) {
                    setArchivo(null);
                    setArchivoNombre("");
                    setErrorArchivo("Solo se permiten archivos PDF o imágenes.");
                    if (fileRef.current) fileRef.current.value = "";
                    return;
                  }

                  setArchivo(f);
                  setArchivoNombre(f.name || "");
                  setErrorArchivo("");
                }}
              />

              <div
                style={{
                  border: "1px solid rgba(148,163,184,.35)",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  minHeight: 54,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                    Archivo adjunto (PDF o imagen)
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={archivoNombre || "Sin archivo"}
                  >
                    {archivoNombre || "Sin archivo seleccionado"}
                  </div>

                  {errorArchivo && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#dc2626",
                        fontWeight: 600,
                      }}
                    >
                      {errorArchivo}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="mit-btn mit-btn--ghost"
                    onClick={() => fileRef.current?.click()}
                    disabled={saving}
                  >
                    Seleccionar archivo
                  </button>

                  {archivo && (
                    <button
                      type="button"
                      className="mit-btn mit-btn--ghost"
                      onClick={() => {
                        setArchivo(null);
                        setArchivoNombre("");
                        setErrorArchivo("");
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                      disabled={saving}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mi-mini__actions" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="mit-btn mit-btn--ghost"
              onClick={() => (!saving ? onClose?.() : null)}
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid"
              disabled={saving}
              onClick={() => {
                onSave?.({
                  tipo_cheque: tipoCheque === "echeq" ? "echeq" : "cheque",
                  fecha_emision: form.fecha_emision,
                  emisor: String(form.emisor || "").trim().toUpperCase(),
                  numero_cheque: onlyNumbers(form.numero_cheque),
                  importe: parseMoney(form.importe),
                  fecha_pago: form.fecha_pago,
                  archivo,
                  archivo_nombre: archivoNombre,
                });
              }}
            >
              {saving ? "Guardando..." : "Guardar cheque"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}