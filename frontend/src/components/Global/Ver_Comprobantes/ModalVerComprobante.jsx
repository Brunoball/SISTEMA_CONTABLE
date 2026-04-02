import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../Global_css/Global_Modals.css";
import "../Global_css/Global_oscuro.css";
import "../../Mov_Subsection/Recibos/modales/ModalPagarRecibos.css";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faXmark,
  faUpRightFromSquare,
  faDownload,
} from "@fortawesome/free-solid-svg-icons";

function safeText(v) {
  return String(v ?? "").trim();
}

function buildHeadersGET() {
  const sessionKey = safeText(localStorage.getItem("session_key"));
  const token = safeText(localStorage.getItem("token"));
  const h = {};
  if (sessionKey) h["X-Session"] = sessionKey;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function isBlobUrl(v = "") {
  return safeText(v).startsWith("blob:");
}

function getExtensionFromUrl(url = "") {
  const clean = safeText(url).split("?")[0].split("#")[0].toLowerCase();
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m?.[1] || "";
}

function basenameFromPath(v = "") {
  const s = safeText(v);
  if (!s) return "";
  const clean = s.split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function getUrlParamFileName(url = "") {
  try {
    const u = new URL(url, window.location.origin);

    const possibleKeys = [
      "archivo",
      "file",
      "filename",
      "nombre",
      "name",
      "archivo_url",
      "archivo_path",
      "path",
    ];

    for (const key of possibleKeys) {
      const value = safeText(u.searchParams.get(key));
      if (value) {
        const last = basenameFromPath(value);
        if (last) return last;
      }
    }
  } catch {}

  return "";
}

function removeDangerousExtension(name = "") {
  const n = safeText(name);
  if (!n) return "";

  return n
    .replace(/\.(php|phtml|php3|php4|php5|phar|cgi|pl|py|sh|exe|dll|bat|cmd)$/i, "")
    .trim();
}

function guessKindFromUrlOrMime(url, mime = "") {
  const u = safeText(url).toLowerCase();
  const m = safeText(mime).toLowerCase();
  const ext = getExtensionFromUrl(u);

  if (m.includes("pdf")) return "pdf";
  if (m.startsWith("image/")) return "img";

  if (m.includes("text/csv") || m.includes("application/csv")) return "csv";
  if (m.includes("application/json") || m.includes("text/json")) return "json";
  if (m.includes("text/plain")) return "text";
  if (m.includes("text/html")) return "html";

  if (
    m.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") ||
    m.includes("application/vnd.ms-excel") ||
    m.includes("spreadsheet")
  ) {
    return "excel";
  }

  if (
    m.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") ||
    m.includes("application/msword") ||
    m.includes("word")
  ) {
    return "word";
  }

  if (ext === "csv") return "csv";
  if (ext === "txt") return "text";
  if (ext === "json") return "json";
  if (ext === "html" || ext === "htm") return "html";
  if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(ext)) return "img";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "xls"].includes(ext)) return "excel";
  if (["docx", "doc"].includes(ext)) return "word";

  return "other";
}

function parseContentDispositionFileName(contentDisposition = "") {
  const cd = safeText(contentDisposition);
  if (!cd) return "";

  const utf8Match = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ""));
    } catch {
      return utf8Match[1].replace(/["']/g, "");
    }
  }

  const plainMatch =
    cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;]+)/i);

  if (plainMatch?.[1]) {
    return plainMatch[1].replace(/["']/g, "").trim();
  }

  return "";
}

function kindToPreferredExt(kind = "other", mime = "", url = "") {
  const m = safeText(mime).toLowerCase();
  const extUrl = getExtensionFromUrl(url);

  if (kind === "csv") return "csv";
  if (kind === "json") return "json";
  if (kind === "text") return "txt";
  if (kind === "html") return "html";
  if (kind === "pdf") return "pdf";

  if (kind === "excel") {
    if (m.includes("application/vnd.ms-excel")) return "xls";
    return "xlsx";
  }

  if (kind === "word") {
    if (m.includes("application/msword")) return "doc";
    return "docx";
  }

  if (kind === "img") {
    if (m.includes("png")) return "png";
    if (m.includes("webp")) return "webp";
    if (m.includes("gif")) return "gif";
    if (m.includes("bmp")) return "bmp";
    if (m.includes("svg")) return "svg";
    if (m.includes("jpeg") || m.includes("jpg")) return "jpg";

    if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(extUrl)) {
      return extUrl === "jpeg" ? "jpg" : extUrl;
    }

    return "jpg";
  }

  if (m.includes("pdf")) return "pdf";
  if (m.includes("text/csv")) return "csv";
  if (m.includes("application/json") || m.includes("text/json")) return "json";
  if (m.includes("text/plain")) return "txt";
  if (m.includes("text/html")) return "html";

  if (extUrl) return extUrl;

  return "bin";
}

function normalizeBaseName(title = "") {
  const t = safeText(title)
    .toLowerCase()
    .replace(/^comprobante\s+de\s+/i, "")
    .replace(/^comprobante\s+/i, "")
    .replace(/[^\wáéíóúñü]+/gi, "_")
    .replace(/^_+|_+$/g, "");

  return t || "archivo";
}

function splitNameAndExt(name = "") {
  const n = safeText(name);
  if (!n) return { base: "", ext: "" };

  const clean = basenameFromPath(n);
  const m = clean.match(/^(.*?)(?:\.([a-z0-9]+))?$/i);

  return {
    base: safeText(m?.[1]),
    ext: safeText(m?.[2]).toLowerCase(),
  };
}

function buildSimpleDisplayName({
  explicitFileName = "",
  headerFileName = "",
  mime = "",
  kind = "other",
  title = "",
  url = "",
}) {
  const preferredExt = kindToPreferredExt(kind, mime, url);

  const fromExplicit = removeDangerousExtension(explicitFileName);
  const fromHeader = removeDangerousExtension(headerFileName);
  const fromUrlParam = removeDangerousExtension(getUrlParamFileName(url));

  const candidate = safeText(fromExplicit || fromHeader || fromUrlParam);
  const parsed = splitNameAndExt(candidate);

  let base = parsed.base;
  let ext = parsed.ext;

  if (!base) {
    const baseFromUrl = removeDangerousExtension(
      basenameFromPath(safeText(url).split("?")[0].split("#")[0])
    );
    const parsedUrl = splitNameAndExt(baseFromUrl);
    base = parsedUrl.base;
    ext = ext || parsedUrl.ext;
  }

  if (!base) {
    base = normalizeBaseName(title || "comprobante");
  }

  const finalExt = preferredExt || ext || "bin";
  return `${base}.${finalExt}`;
}

function resolveFixedModalTitle(title = "") {
  const t = safeText(title).toLowerCase();

  if (t.includes("venta")) return "Comprobante de Venta";
  if (t.includes("ingreso")) return "Comprobante de Ingreso";
  if (t.includes("egreso")) return "Comprobante de Egreso";
  if (t.includes("compra")) return "Comprobante de Compra";
  if (t.includes("cobro")) return "Comprobante de Cobro";
  if (t.includes("pago")) return "Comprobante de Pago";

  return "Comprobante";
}

function looksBinaryGarbage(text = "") {
  if (!text) return false;
  let weird = 0;
  const max = Math.min(text.length, 1200);

  for (let i = 0; i < max; i += 1) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31)
    ) {
      weird += 1;
    }
  }

  return weird > 8;
}

function parseCsvLine(line = "", delimiter = ",") {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((x) => x.trim());
}

function parseCSV(text = "") {
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };

  const first = lines[0];
  const delimiter =
    (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";

  const rows = lines.map((line) => parseCsvLine(line, delimiter));
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

export default function ModalVerComprobante({
  open,
  url,
  mime = "",
  fileName = "",
  onClose,
  title = "Comprobante",
}) {
  const closeBtnRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [blobUrl, setBlobUrl] = useState("");
  const [resolvedMime, setResolvedMime] = useState("");
  const [resolvedFileName, setResolvedFileName] = useState("");
  const [textPreview, setTextPreview] = useState("");
  const [htmlPreview, setHtmlPreview] = useState("");
  const internalBlobRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    const revokeInternalBlob = () => {
      if (internalBlobRef.current) {
        URL.revokeObjectURL(internalBlobRef.current);
        internalBlobRef.current = "";
      }
    };

    if (!open || !url) {
      setLoading(false);
      setDownloading(false);
      setErrorMsg("");
      setResolvedMime("");
      setResolvedFileName("");
      setTextPreview("");
      setHtmlPreview("");
      setBlobUrl("");
      revokeInternalBlob();
      return;
    }

    let cancelled = false;

    async function run() {
      setLoading(true);
      setErrorMsg("");
      setResolvedMime("");
      setResolvedFileName("");
      setTextPreview("");
      setHtmlPreview("");
      setBlobUrl("");
      revokeInternalBlob();

      try {
        if (isBlobUrl(url)) {
          if (cancelled) return;

          setResolvedMime(safeText(mime));
          setResolvedFileName("");
          setBlobUrl(url);
          return;
        }

        const res = await fetch(url, {
          method: "GET",
          headers: buildHeadersGET(),
        });

        if (res.status === 401 || res.status === 403) {
          throw new Error("Sesión vencida o no autorizada para ver este comprobante.");
        }

        if (!res.ok) {
          throw new Error(`No se pudo cargar el comprobante. HTTP ${res.status}`);
        }

        const contentType = safeText(res.headers.get("Content-Type")) || safeText(mime);
        const headerFileName = parseContentDispositionFileName(
          res.headers.get("Content-Disposition") || ""
        );

        const inferredKind = guessKindFromUrlOrMime(url, contentType);

        if (
          inferredKind === "text" ||
          inferredKind === "csv" ||
          inferredKind === "json" ||
          inferredKind === "html"
        ) {
          const text = await res.text();

          if (cancelled) return;

          setResolvedMime(contentType);
          setResolvedFileName(headerFileName);

          if (inferredKind === "html") {
            setHtmlPreview(text);
          } else {
            setTextPreview(text);
          }

          return;
        }

        const blob = await res.blob();
        const localBlobUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(localBlobUrl);
          return;
        }

        internalBlobRef.current = localBlobUrl;
        setResolvedMime(contentType || blob.type || safeText(mime));
        setResolvedFileName(headerFileName);
        setBlobUrl(localBlobUrl);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e?.message || "No se pudo cargar el comprobante.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      revokeInternalBlob();
    };
  }, [open, url, mime]);

  const previewUrl = blobUrl || url || "";

  const kind = useMemo(() => {
    if (textPreview) {
      const textKind = guessKindFromUrlOrMime(url, resolvedMime || mime);
      if (textKind === "other") return "text";
      return textKind;
    }
    if (htmlPreview) return "html";
    return guessKindFromUrlOrMime(previewUrl, resolvedMime || mime);
  }, [previewUrl, resolvedMime, mime, textPreview, htmlPreview, url]);

  const modalTitle = useMemo(() => resolveFixedModalTitle(title), [title]);

  const displayFileName = useMemo(() => {
    return buildSimpleDisplayName({
      explicitFileName: fileName,
      headerFileName: resolvedFileName,
      mime: resolvedMime || mime,
      kind,
      title: modalTitle,
      url,
    });
  }, [fileName, resolvedFileName, resolvedMime, mime, kind, modalTitle, url]);

  const csvData = useMemo(() => {
    if (kind !== "csv" || !textPreview) return { headers: [], rows: [] };
    return parseCSV(textPreview);
  }, [kind, textPreview]);

  const canPreviewText = useMemo(() => {
    return ["text", "json", "csv", "html"].includes(kind);
  }, [kind]);

  async function handleDownload() {
    if (!url || downloading) return;

    if (isBlobUrl(url)) {
      try {
        setDownloading(true);
        setErrorMsg("");

        const a = document.createElement("a");
        a.href = url;
        a.download = displayFileName || "archivo";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        setErrorMsg(e?.message || "No se pudo descargar el archivo.");
      } finally {
        setDownloading(false);
      }
      return;
    }

    setDownloading(true);
    setErrorMsg("");

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: buildHeadersGET(),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("Sesión vencida o no autorizada para descargar este comprobante.");
      }

      if (!res.ok) {
        throw new Error(`No se pudo descargar el archivo. HTTP ${res.status}`);
      }

      const contentType =
        safeText(res.headers.get("Content-Type")) || safeText(resolvedMime) || safeText(mime);

      const headerFileName = parseContentDispositionFileName(
        res.headers.get("Content-Disposition") || ""
      );

      const detectedKind = guessKindFromUrlOrMime(url, contentType);
      const blob = await res.blob();

      const realName = buildSimpleDisplayName({
        explicitFileName: fileName,
        headerFileName,
        mime: contentType || blob.type,
        kind: detectedKind,
        title: modalTitle,
        url,
      });

      const tmpUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = tmpUrl;
      a.download = realName || displayFileName || "archivo";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(tmpUrl), 1500);
    } catch (e) {
      setErrorMsg(e?.message || "No se pudo descargar el archivo.");
    } finally {
      setDownloading(false);
    }
  }

  function handleOpen() {
    const target = blobUrl || url;
    if (target) window.open(target, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  const overlayClass = "mi-modal__overlay mi-modal__overlay--mov";
  const modalClass = "mi-modal__container mi-modal__container--mov mpr-modal";

  return createPortal(
    <div
      className={overlayClass}
      role="dialog"
      aria-modal="true"
      aria-label={modalTitle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={modalClass}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 1100 }}
      >
        <div className="mi-modal__header mpr-header">
          <div className="mpr-headLeft">
            <div className="mi-modal__title mpr-title">
              <span>{modalTitle}</span>
            </div>
            <div className="mi-modal__subtitle mpr-subtitle">
              {url ? displayFileName : "—"}
            </div>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            className="mi-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="mi-modal__body mpr-body">
          <div className="mpr-content">
            <div className="mpr-card mpr-viewCard">
              {!url && <div className="mov-emptyRow">No hay comprobante.</div>}

              {!!url && loading && (
                <div className="mov-emptyRow" style={{ padding: 18 }}>
                  Cargando {displayFileName}…
                </div>
              )}

              {!!url && !loading && !!errorMsg && (
                <div className="mov-emptyRow" style={{ padding: 18, color: "#b91c1c" }}>
                  {errorMsg}
                </div>
              )}

              {!!previewUrl && !loading && !errorMsg && kind === "pdf" && (
                <div className="mpr-previewScroll" aria-label="Vista previa PDF">
                  <iframe
                    title={displayFileName || "Comprobante PDF"}
                    src={previewUrl}
                    className="mpr-pdfFrame"
                  />
                </div>
              )}

              {!!previewUrl && !loading && !errorMsg && kind === "img" && (
                <div className="mpr-previewScroll" aria-label="Vista previa imagen">
                  <div className="mpr-imgWrap">
                    <img
                      src={previewUrl}
                      alt={displayFileName || "Comprobante"}
                      className="mpr-img"
                    />
                  </div>
                </div>
              )}

              {!!url && !loading && !errorMsg && kind === "csv" && (
                <div
                  className="mpr-previewScroll"
                  aria-label="Vista previa CSV"
                  style={{ padding: 12 }}
                >
                  {csvData.headers.length > 0 ? (
                    <div style={{ width: "100%", overflow: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 14,
                        }}
                      >
                        <thead>
                          <tr>
                            {csvData.headers.map((h, i) => (
                              <th
                                key={`${h}-${i}`}
                                style={{
                                  textAlign: "left",
                                  padding: "10px 12px",
                                  borderBottom: "1px solid #d1d5db",
                                  background: "#f8fafc",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {h || "—"}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvData.rows.length ? (
                            csvData.rows.map((row, rowIdx) => (
                              <tr key={rowIdx}>
                                {csvData.headers.map((_, colIdx) => (
                                  <td
                                    key={`${rowIdx}-${colIdx}`}
                                    style={{
                                      padding: "10px 12px",
                                      borderBottom: "1px solid #e5e7eb",
                                      verticalAlign: "top",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {safeText(row[colIdx]) || "—"}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={Math.max(csvData.headers.length, 1)}
                                style={{ padding: 16, textAlign: "center" }}
                              >
                                El CSV no tiene filas para mostrar.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 14,
                      }}
                    >
                      {textPreview || "No hay contenido para mostrar."}
                    </pre>
                  )}
                </div>
              )}

              {!!url && !loading && !errorMsg && kind === "json" && (
                <div
                  className="mpr-previewScroll"
                  aria-label="Vista previa JSON"
                  style={{ padding: 12 }}
                >
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 14,
                    }}
                  >
                    {(() => {
                      try {
                        const obj = JSON.parse(textPreview);
                        return JSON.stringify(obj, null, 2);
                      } catch {
                        return textPreview || "No hay contenido para mostrar.";
                      }
                    })()}
                  </pre>
                </div>
              )}

              {!!url && !loading && !errorMsg && kind === "text" && (
                <div
                  className="mpr-previewScroll"
                  aria-label="Vista previa texto"
                  style={{ padding: 12 }}
                >
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 14,
                    }}
                  >
                    {looksBinaryGarbage(textPreview)
                      ? "El archivo parece binario y no se puede mostrar como texto."
                      : textPreview || "No hay contenido para mostrar."}
                  </pre>
                </div>
              )}

              {!!url && !loading && !errorMsg && kind === "html" && (
                <div className="mpr-previewScroll" aria-label="Vista previa HTML">
                  <iframe
                    title={displayFileName || "Vista previa HTML"}
                    srcDoc={htmlPreview}
                    className="mpr-pdfFrame"
                    sandbox=""
                  />
                </div>
              )}

              {!!url &&
                !loading &&
                !errorMsg &&
                !canPreviewText &&
                (kind === "excel" || kind === "word" || kind === "other") && (
                  <div className="mov-emptyRow" style={{ padding: 14, lineHeight: 1.5 }}>
                    {kind === "excel" &&
                      "Este archivo de Excel no se puede previsualizar directamente en el navegador."}
                    {kind === "word" &&
                      "Este archivo de Word no se puede previsualizar directamente en el navegador."}
                    {kind === "other" &&
                      "No se puede previsualizar este archivo en el navegador."}
                    <br />
                    Podés abrirlo o descargarlo desde abajo.
                  </div>
                )}
            </div>
          </div>
        </div>

        <div className="mi-modal__footer mpr-footer">
          <div style={{ display: "flex", gap: 10, width: "100%", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="mit-btn mit-btn--ghost mit-btn--block"
              id="maxBTN"
              onClick={handleDownload}
              disabled={!url || downloading}
              title={`Descargar ${displayFileName}`}
            >
              <FontAwesomeIcon icon={faDownload} style={{ marginRight: 8 }} />
              {downloading ? "Descargando..." : "Descargar"}
            </button>

            <button
              type="button"
              className="mit-btn mit-btn--solid mit-btn--block"
              id="maxBTN"
              onClick={handleOpen}
              disabled={!blobUrl && !url}
              title={`Abrir ${displayFileName} en nueva pestaña`}
            >
              <FontAwesomeIcon icon={faUpRightFromSquare} style={{ marginRight: 8 }} />
              Abrir
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}