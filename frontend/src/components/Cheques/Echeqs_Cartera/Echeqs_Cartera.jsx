import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import BASE_URL from "../../../config/config";
import "../../Global/Global_css/Global_Section.css";
import "../../Global/Global_css/Global_responsive.css";
import Toast from "../../Global/Toast.jsx";
import ModalVerComprobante from "../../Global/Ver_Comprobantes/ModalVerComprobante.jsx";
import ModalDepositarCheque from "../modales/ModalDepositarCheque.jsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faBoxOpen,
  faTimes,
  faEye,
  faBuildingColumns,
} from "@fortawesome/free-solid-svg-icons";


function clearMovimientosAfterDepositoCheque() {
  try {
    if (typeof window === "undefined") return;

    const storage = window.sessionStorage || null;
    const prefix = "balto_movimientos_perf_v2:";

    if (storage) {
      const scopesToClear = [
        ":otros_egresos:listar",
        ":movimientos:listar",
        ":flujo_caja",
        ":compras:listar",
        ":ventas:listar",
      ];
      const keys = [];

      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        if (scopesToClear.some((scope) => key.includes(scope))) {
          keys.push(key);
        }
      }

      keys.forEach((key) => storage.removeItem(key));
    }

    window.dispatchEvent(
      new CustomEvent("balto:movimientos-mutados", {
        detail: {
          origen: "deposito_cheque_banco",
          modulos: ["otros_egresos", "movimientos", "flujo_caja"],
          ts: Date.now(),
        },
      })
    );
  } catch {
    // La limpieza de caché nunca debe bloquear el depósito.
  }
}

/* =========================
   Helpers auth
========================= */
function getAuthInfo() {
  const token = (localStorage.getItem("token") || "").trim();
  const sessionKey = (
    localStorage.getItem("session_key") ||
    localStorage.getItem("sessionKey") ||
    localStorage.getItem("X-Session") ||
    localStorage.getItem("x_session") ||
    ""
  ).trim();

  let idUsuario = 0;
  try {
    const u = JSON.parse(localStorage.getItem("usuario") || "null");
    const cand =
      u?.idUsuarioMaster ??
      u?.idUsuario ??
      u?.id_usuario ??
      u?.id ??
      u?.user_id ??
      0;

    if (Number.isFinite(Number(cand))) {
      idUsuario = Number(cand);
    }
  } catch {}

  return { token, sessionKey, idUsuario };
}

function getAuthHeaders(json = false) {
  const { sessionKey, token } = getAuthInfo();
  const headers = {};

  if (sessionKey) headers["X-Session"] = sessionKey;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";

  return headers;
}

function withSessionKey(url) {
  const base = String(url || "").trim();
  if (!base) return "";

  try {
    const { sessionKey, token } = getAuthInfo();
    const u = new URL(base, window.location.origin);

    if (sessionKey && !u.searchParams.has("session_key")) {
      u.searchParams.set("session_key", sessionKey);
    }
    if (token && !u.searchParams.has("token")) {
      u.searchParams.set("token", token);
    }

    return u.toString();
  } catch {
    return base;
  }
}

function buildAuditUserPayload(extra = {}) {
  const { idUsuario } = getAuthInfo();
  const payload = { ...extra };

  if (Number.isFinite(Number(idUsuario)) && Number(idUsuario) > 0) {
    payload.idUsuarioMaster = Number(idUsuario);
    payload.idUsuario = Number(idUsuario);
  }

  return payload;
}

/* =========================
   Helpers generales
========================= */
async function parseJsonOrThrow(res) {
  const text = await res.text();
  if (!text) throw new Error("Respuesta vacía del servidor.");

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("La API devolvió una respuesta inválida.");
  }

  if (!res.ok || data?.exito === false) {
    throw new Error(data?.mensaje || `Error HTTP ${res.status}`);
  }

  return data;
}

function formatFecha(fecha) {
  if (!fecha) return "—";
  const s = String(fecha).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function formatMoney(value) {
  const n = Number(value || 0);
  try {
    return n.toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
    });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function safeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

function normalizeEcheq(row) {
  return {
    ...row,
    id_cheque: Number(row?.id_cheque ?? row?.idCheque ?? row?.id ?? 0),
    fecha_emision: row?.fecha_emision ?? row?.fechaEmision ?? "",
    emisor: row?.emisor ?? row?.librador ?? "",
    numero_cheque: row?.numero_cheque ?? row?.numeroCheque ?? row?.numero ?? "",
    importe: row?.importe ?? 0,
    fecha_pago: row?.fecha_pago ?? row?.fechaPago ?? "",
    archivo_mime: row?.archivo_mime ?? row?.mime ?? "application/pdf",
    tiene_comprobante:
      row?.tiene_comprobante ?? row?.tieneComprobante ?? !!row?.archivo_path,
  };
}

/* =========================
   Config
========================= */

function toISODate(fecha) {
  const s = String(fecha || "").trim();
  if (!s) return "";

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${String(iso[1]).padStart(4, "0")}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }

  const visual = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (visual) {
    return `${String(visual[3]).padStart(4, "0")}-${String(visual[2]).padStart(2, "0")}-${String(visual[1]).padStart(2, "0")}`;
  }

  return "";
}

function isValidISODate(fecha) {
  const s = String(fecha || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const PAGE_SIZE = 100;
const SKELETON_ROWS = 10;
const API_URL = `${String(BASE_URL || "").replace(/\/+$/, "")}/api.php`;

/* =========================
   Columns definition
========================= */
const COLUMNS = [
  { key: "fecha_emision", label: "FECHA EMISIÓN", fr: 1, align: "center" },
  { key: "emisor", label: "EMISOR", fr: 2.2, align: "left", strong: true },
  { key: "numero_cheque", label: "NÚMERO", fr: 1.2, align: "center" },
  { key: "importe", label: "IMPORTE", fr: 1.2, align: "right" },
  { key: "fecha_pago", label: "FECHA PAGO", fr: 1, align: "center" },
  { key: "acciones", label: "ACCIONES", fr: 1.2, align: "center" },
];

const gridCols = COLUMNS.map((c) => `${c.fr}fr`).join(" ");

/* =========================
   Skeleton row
========================= */
const skelWidths = {
  fecha_emision: ["44%", "38%", "40%", "36%"],
  emisor: ["72%", "58%", "66%", "48%"],
  numero_cheque: ["44%", "34%", "40%", "30%"],
  importe: ["38%", "30%", "34%", "28%"],
  fecha_pago: ["44%", "38%", "40%", "36%"],
};

function SkeletonRow({ idx }) {
  return (
    <div
      className="mov-gridTable mov-gridTable--row mov-row--skeleton"
      style={{ gridTemplateColumns: gridCols }}
      role="row"
      aria-hidden="true"
    >
      {COLUMNS.map((c) => {
        if (c.key === "acciones") {
          return (
            <div
              key={c.key}
              className="mov-gridCell mov-gridCell--actions is-center"
              role="cell"
              data-label={c.label}
            >
              <div className="mov-skelActions">
                <span className="mov-skelIcon" />
                <span className="mov-skelIcon" />
              </div>
            </div>
          );
        }

        const list = skelWidths[c.key] || ["60%"];
        const w = list[idx % list.length];

        return (
          <div
            key={c.key}
            className={[
              "mov-gridCell",
              c.align === "right" ? "is-right" : "",
              c.align === "center" ? "is-center" : "",
            ].join(" ")}
            role="cell"
            data-label={c.label}
          >
            <span className="mov-skeletonBar" style={{ width: w }} />
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   Main component
========================= */
const Echeqs_Cartera = () => {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);

  const [modalComprobanteOpen, setModalComprobanteOpen] = useState(false);
  const [modalComprobanteUrl, setModalComprobanteUrl] = useState("");
  const [modalComprobanteMime, setModalComprobanteMime] = useState("");
  const [modalComprobanteTitle, setModalComprobanteTitle] =
    useState("Comprobante de Echeq");

  const [modalDepositarOpen, setModalDepositarOpen] = useState(false);
  const [echeqSeleccionado, setEcheqSeleccionado] = useState(null);
  const [depositando, setDepositando] = useState(false);

  const searchTimerRef = useRef(null);

  const showToast = useCallback((tipo, mensaje, duracion = 2600) => {
    setToast({ tipo, mensaje, duracion });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  const closeModalComprobante = useCallback(() => {
    setModalComprobanteOpen(false);
    setModalComprobanteUrl("");
    setModalComprobanteMime("");
    setModalComprobanteTitle("Comprobante de Echeq");
  }, []);

  const openModalComprobante = useCallback(
    (row) => {
      const echeq = normalizeEcheq(row);
      const idCheque = Number(echeq?.id_cheque || 0);

      if (!idCheque) {
        showToast("error", "Echeq inválido.");
        return;
      }

      const params = new URLSearchParams();
      params.set("action", "echeq_cartera_comprobante_ver");
      params.set("id_cheque", String(idCheque));

      const finalUrl = withSessionKey(`${API_URL}?${params.toString()}`);
      setModalComprobanteUrl(finalUrl);
      setModalComprobanteMime(
        String(echeq?.archivo_mime || "").trim() || "application/pdf"
      );
      setModalComprobanteTitle("Comprobante de Echeq");
      setModalComprobanteOpen(true);
    },
    [showToast]
  );

  const openModalDepositar = useCallback((row) => {
    setEcheqSeleccionado(normalizeEcheq(row));
    setModalDepositarOpen(true);
  }, []);

  const closeModalDepositar = useCallback(() => {
    if (depositando) return;
    setModalDepositarOpen(false);
    setEcheqSeleccionado(null);
  }, [depositando]);

  /* debounce búsqueda */
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(searchTimerRef.current);
  }, [q]);

  const fetchData = useCallback(
    async ({ reset = false, offset = 0 } = {}) => {
      try {
        setError("");
        if (reset) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams();
        params.set("action", "echeq_cartera_listar");
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        if (debouncedQ) params.set("q", debouncedQ);

        const res = await fetch(`${API_URL}?${params.toString()}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });

        const data = await parseJsonOrThrow(res);
        const nuevos = Array.isArray(data?.echeqs)
          ? data.echeqs.map(normalizeEcheq)
          : [];

        setItems((prev) => {
          if (reset) return nuevos;

          const existentes = Array.isArray(prev) ? prev : [];
          const ids = new Set(existentes.map((x) => String(x.id_cheque)));

          return [
            ...existentes,
            ...nuevos.filter((x) => !ids.has(String(x.id_cheque))),
          ];
        });

        setHasMore(Boolean(data?.has_more));
        setNextOffset(Number(data?.next_offset || 0));
      } catch (err) {
        const mensaje = err?.message || "No se pudieron cargar los echeqs.";
        setError(mensaje);

        if (reset) {
          setItems([]);
          setHasMore(false);
          setNextOffset(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ]
  );

  useEffect(() => {
    fetchData({ reset: true, offset: 0 });
  }, [fetchData]);

  const handleDepositarEcheq = useCallback(async (fechaDepositoSeleccionada) => {
    const idCheque = Number(echeqSeleccionado?.id_cheque || 0);

    if (!idCheque) {
      showToast("error", "No se pudo identificar el echeq seleccionado.");
      return;
    }

    const fechaDeposito = toISODate(fechaDepositoSeleccionada);
    if (!isValidISODate(fechaDeposito)) {
      showToast("error", "Seleccioná una fecha de depósito válida desde el modal.");
      return;
    }

    setDepositando(true);

    try {
      const params = new URLSearchParams();
      params.set("action", "echeq_cartera_depositar");

      const body = buildAuditUserPayload({
        id_cheque: idCheque,
        fecha_deposito: fechaDeposito,
        fecha_operacion: fechaDeposito,
        fecha: fechaDeposito,
      });

      const data = await parseJsonOrThrow(
        await fetch(`${API_URL}?${params.toString()}`, {
          method: "POST",
          headers: getAuthHeaders(true),
          body: JSON.stringify(body),
        })
      );

      clearMovimientosAfterDepositoCheque();

      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).filter(
          (item) => Number(item?.id_cheque) !== idCheque
        )
      );

      setModalDepositarOpen(false);
      setEcheqSeleccionado(null);
      showToast("exito", data?.mensaje || "Echeq depositado correctamente.");
    } catch (e) {
      showToast("error", e?.message || "No se pudo depositar el echeq.");
    } finally {
      setDepositando(false);
    }
  }, [echeqSeleccionado, showToast]);

  function renderCell(col, item) {
    switch (col.key) {
      case "fecha_emision":
        return safeText(formatFecha(item.fecha_emision));
      case "emisor":
        return safeText(item.emisor);
      case "numero_cheque":
        return safeText(item.numero_cheque);
      case "importe":
        return formatMoney(item.importe);
      case "fecha_pago":
        return safeText(formatFecha(item.fecha_pago));
      case "acciones":
        return (
          <div className="mov-actionsInline">
            <button
              type="button"
              className={[
                "mov-iconBtn",
                item?.tiene_comprobante
                  ? "mov-iconBtn--comprobante"
                  : "mov-iconBtn--disabled",
              ].join(" ")}
              onClick={() => openModalComprobante(item)}
              title={
                item?.tiene_comprobante ? "Ver comprobante" : "Sin comprobante"
              }
              disabled={!item?.tiene_comprobante}
              style={{
                opacity: item?.tiene_comprobante ? 1 : 0.35,
                cursor: item?.tiene_comprobante ? "pointer" : "not-allowed",
              }}
            >
              <FontAwesomeIcon icon={faEye} />
            </button>

            <button
              type="button"
              className="mov-iconBtn"
              onClick={() => openModalDepositar(item)}
              title="Depositar en el banco"
            >
              <FontAwesomeIcon icon={faBuildingColumns} />
            </button>
          </div>
        );
      default:
        return "—";
    }
  }

  const cantidad = items.length;
  const isAnyLoading = loading || loadingMore;

  return (
    <div className="mov-page">
      {toast && (
        <Toast
          tipo={toast.tipo}
          mensaje={toast.mensaje}
          duracion={toast.duracion}
          onClose={closeToast}
        />
      )}

      <ModalVerComprobante
        open={modalComprobanteOpen}
        url={modalComprobanteUrl}
        mime={modalComprobanteMime}
        onClose={closeModalComprobante}
        title={modalComprobanteTitle}
      />

      <ModalDepositarCheque
        open={modalDepositarOpen}
        onClose={closeModalDepositar}
        onConfirm={handleDepositarEcheq}
        loading={depositando}
        cheque={echeqSeleccionado}
        titulo="Depositar echeq en el banco"
        pregunta="¿Querés depositar este echeq?"
        tipoLabel="Echeq"
        confirmText="Depositar"
        loadingText="Depositando..."
        infoText="Al presionar Depositar, el echeq se dará de baja de Echeqs de Cartera y se registrará automáticamente en Otros Egresos, dejando reflejado el movimiento para que la salida de fondos quede correctamente impactada en el sistema."
      />

      {error && (
        <div className="mov-alert" role="alert">
          {error}
        </div>
      )}

      <section className="mov-card mov-card--table">
        <div className="mov-card__head">
          <div className="mov-card__headLeft">
            <div className="title-mov">
              <div className="mov-card__title">Echeqs · Cartera</div>
              <div className="mov-card__hint">
                Mostrando <b>{cantidad}</b> echeq{cantidad !== 1 ? "s" : ""}
                {hasMore && cantidad > 0 ? " (hay más)" : ""}
              </div>
            </div>

            <div className="mov-headFilters">
              <div className="cc-filter cc-filter--search">
                <div className="cc-floatingField cc-floatingField--search is-active">
                  <div className="cc-searchInput">
                    <div className="cc-searchInput__fieldWrap">
                      <input
                        className="cc-input cc-input--floating"
                        id="echeq-cartera-search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (searchTimerRef.current) {
                              clearTimeout(searchTimerRef.current);
                            }
                            setDebouncedQ(e.currentTarget.value.trim());
                          }
                        }}
                        placeholder="Buscar por emisor, número..."
                        disabled={isAnyLoading}
                      />
                      <span className="cc-floatingLabel">
                        <FontAwesomeIcon icon={faMagnifyingGlass} /> Búsqueda
                      </span>

                      {q.trim() !== "" && (
                        <button
                          type="button"
                          className="cc-clearSearch cc-clearSearch--inside"
                          title="Limpiar búsqueda"
                          onClick={() => {
                            if (searchTimerRef.current) {
                              clearTimeout(searchTimerRef.current);
                            }
                            setQ("");
                            setDebouncedQ("");
                          }}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mov-gridTable mov-gridTable--head"
          style={{ gridTemplateColumns: gridCols }}
          role="row"
        >
          {COLUMNS.map((c) => (
            <div
              key={c.key}
              className={[
                "mov-gridCell",
                "mov-gridCell--head",
                c.align === "right" ? "is-right" : "",
                c.align === "center" ? "is-center" : "",
              ].join(" ")}
              role="columnheader"
            >
              {c.label}
            </div>
          ))}
        </div>

        <div className="mov-tableWrap" role="rowgroup" id="cheques-st">
          <div
            className={[
              "mov-gridBody",
              "mov-gridBody--relative",
              loading ? "mov-softLoading" : "",
            ].join(" ")}
          >
            {loading ? (
              <div className="mov-skeletonWrap" aria-busy="true">
                {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <SkeletonRow key={`skel-${i}`} idx={i} />
                ))}
              </div>
            ) : (
              <>
                {items.map((item) => (
                  <div
                    key={item.id_cheque}
                    className="mov-gridTable mov-gridTable--row"
                    style={{ gridTemplateColumns: gridCols }}
                    role="row"
                  >
                    {COLUMNS.map((col) => {
                      const val = renderCell(col, item);

                      if (col.key === "acciones") {
                        return (
                          <div
                            key={col.key}
                            className="mov-gridCell mov-gridCell--actions is-center"
                            role="cell"
                            data-label={col.label}
                          >
                            {val}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={col.key}
                          className={[
                            "mov-gridCell",
                            col.align === "right" ? "is-right" : "",
                            col.align === "center" ? "is-center" : "",
                            col.strong ? "is-strong" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="cell"
                          data-label={col.label}
                          title={typeof val === "string" ? val : undefined}
                        >
                          <span className="mov-ellipsissss">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {!isAnyLoading && items.length === 0 && (
                  <div className="cc-emptyState">
                    <FontAwesomeIcon icon={faBoxOpen} className="cc-emptyIcon" />
                    <div className="cc-emptyText">
                      {q.trim()
                        ? `No se encontraron echeqs para "${q.trim()}".`
                        : "No hay echeqs en cartera."}
                    </div>
                  </div>
                )}

                {!loading && hasMore && items.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      padding: "12px 0",
                    }}
                  >
                    <button
                      type="button"
                      className="mov-btn mov-btn--loadAll"
                      onClick={() => fetchData({ reset: false, offset: nextOffset })}
                      disabled={loadingMore}
                      title="Cargar los próximos 100 registros"
                    >
                      {loadingMore ? "Cargando…" : "Cargar 100 más"}
                    </button>
                  </div>
                )}

                {loadingMore && (
                  <div
                    className="mov-skeletonMore"
                    aria-busy="true"
                    aria-label="Cargando más registros"
                  >
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonRow key={`skel-more-${i}`} idx={i} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Echeqs_Cartera;