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

function onlyNumbers(value) {
  return String(value ?? "").replace(/\D/g, "");
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

function onlyTextUpper(value) {
  return String(value ?? "")
    .replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "")
    .toUpperCase();
}

function getSafeId(...values) {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function isValidISODate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
}

function isAllowedFile(file) {
  if (!file) return true;

  const name = String(file.name || "").toLowerCase();
  const allowedExt = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"];
  return allowedExt.some((ext) => name.endsWith(ext));
}

export default function ModalNuevoCheque({
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
  const [errorLocal, setErrorLocal] = useState("");

  useEffect(() => {
    if (!open) return;

    setErrorLocal("");

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

    if (fileRef.current) {
      fileRef.current.value = "";
    }
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

  const idsTecnicos = useMemo(() => {
    return {
      id_cheque: getSafeId(
        initialData?.id_cheque,
        initialData?.idCheque
      ),
      id_movimiento: getSafeId(
        initialData?.id_movimiento,
        initialData?.movimiento_id,
        initialData?.idMovimiento
      ),
      id_comprobante: getSafeId(
        initialData?.id_comprobante,
        initialData?.comprobante_id,
        initialData?.idComprobante
      ),
    };
  }, [initialData]);

  const validarAntesDeGuardar = () => {
    const fechaEmision = String(form.fecha_emision || "").trim();
    const emisor = String(form.emisor || "").trim();
    const numeroCheque = onlyNumbers(form.numero_cheque);
    const importe = parseMoney(form.importe);
    const fechaPago = String(form.fecha_pago || "").trim();

    if (!isValidISODate(fechaEmision)) {
      return "La fecha de emisión es obligatoria.";
    }

    if (!emisor) {
      return "El emisor es obligatorio.";
    }

    if (!numeroCheque) {
      return tipoCheque === "echeq"
        ? "El número de echeq es obligatorio."
        : "El número de cheque es obligatorio.";
    }

    if (!(importe > 0)) {
      return "El importe debe ser mayor a 0.";
    }

    if (!isValidISODate(fechaPago)) {
      return "La fecha de pago es obligatoria.";
    }

    if (archivo && !isAllowedFile(archivo)) {
      return "El archivo seleccionado no tiene un formato permitido.";
    }

    return "";
  };

  const handleGuardar = () => {
    const err = validarAntesDeGuardar();
    if (err) {
      setErrorLocal(err);
      return;
    }

    setErrorLocal("");

    const payload = {
      id_cheque: idsTecnicos.id_cheque ?? undefined,
      id_movimiento: idsTecnicos.id_movimiento ?? undefined,
      id_comprobante: idsTecnicos.id_comprobante ?? undefined,

      tipo: tipoCheque === "echeq" ? "echeq" : "cheque",
      tipo_cheque: tipoCheque === "echeq" ? "echeq" : "cheque",

      fecha_emision: String(form.fecha_emision || "").trim(),
      emisor: String(form.emisor || "").trim().toUpperCase(),
      numero_cheque: onlyNumbers(form.numero_cheque),
      importe: parseMoney(form.importe),
      fecha_pago: String(form.fecha_pago || "").trim(),

      archivo,
      archivo_nombre: archivoNombre,

      archivo_actual_nombre:
        initialData?.archivo_nombre ||
        initialData?.archivoName ||
        "",
      archivo_actual_url:
        initialData?.archivo_url ||
        initialData?.comprobante_url ||
        "",
    };

    onSave?.(payload);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="mi-mini__overlay"
      onMouseDown={() => (!saving ? onClose?.() : null)}
    >
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
          {errorLocal && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(239,68,68,.35)",
                background: "rgba(239,68,68,.10)",
                color: "#b91c1c",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {errorLocal}
            </div>
          )}

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
                onChange={(e) => {
                  setErrorLocal("");
                  setForm((p) => ({ ...p, fecha_emision: e.target.value }));
                }}
                disabled={saving}
              />
              <label className="fl-label">Fecha de emisión *</label>
            </div>

            <div className="fl-field">
              <input
                className="fl-input"
                placeholder=" "
                value={form.emisor}
                onChange={(e) => {
                  setErrorLocal("");
                  setForm((p) => ({
                    ...p,
                    emisor: onlyTextUpper(e.target.value),
                  }));
                }}
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
                onChange={(e) => {
                  setErrorLocal("");
                  setForm((p) => ({
                    ...p,
                    numero_cheque: onlyNumbers(e.target.value),
                  }));
                }}
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
                onChange={(e) => {
                  setErrorLocal("");
                  setForm((p) => ({
                    ...p,
                    importe: onlyMoney(e.target.value),
                  }));
                }}
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
                onChange={(e) => {
                  setErrorLocal("");
                  setForm((p) => ({ ...p, fecha_pago: e.target.value }));
                }}
                disabled={saving}
              />
              <label className="fl-label">Fecha de pago *</label>
            </div>

            <div className="fl-field" style={{ gridColumn: "1 / -1" }}>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff"
                style={{ display: "none" }}
                disabled={saving}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;

                  if (f && !isAllowedFile(f)) {
                    setErrorLocal("El archivo seleccionado no tiene un formato permitido.");
                    setArchivo(null);
                    setArchivoNombre("");
                    if (fileRef.current) fileRef.current.value = "";
                    return;
                  }

                  setErrorLocal("");
                  setArchivo(f);
                  setArchivoNombre(f?.name || "");
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
                    Archivo adjunto
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
                        setErrorLocal("");
                        setArchivo(null);
                        setArchivoNombre("");
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
              onClick={handleGuardar}
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